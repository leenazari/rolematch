const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");

function setup(reply = { text: "Next question?", moveOn: true, finished: false }) {
  const requests = [];
  const { POST } = loadTs("src/app/api/pitch-next-question/route.ts", {
    "@/lib/openai-json": { generateJson: async (...request) => {
      requests.push(request);
      return reply;
    } },
  });
  const ask = async (currentQuestion, followUpsThisQuestion = 0, history = [
    { role: "ai", text: "The funding question", questionNumber: currentQuestion },
    { role: "user", text: "Our funding plan." },
  ]) => (await POST({ json: async () => ({ pitchData: { companyName: "Tilly" }, history,
    currentQuestion, followUpsThisQuestion }) })).json();
  return { ask, requests };
}

test("all six core topics lead to one closing question, then completion after its answer", async () => {
  const s = setup();
  const history = [];
  let response = await s.ask(1, 0, history);
  assert.equal(response.questionNumber, 1);
  for (let number = 1; number <= 6; number++) {
    assert.equal(response.finished, false);
    history.push({ role: "ai", text: response.text, questionNumber: response.questionNumber },
      { role: "user", text: "Answer to topic " + number });
    response = await s.ask(number, 0, history);
    assert.equal(response.questionNumber, number + 1);
  }
  assert.equal(response.finished, false);
  assert.match(response.text, /in closing.*30-second pitch/);
  assert.match(response.text, /right time in the market/);
  assert.match(response.text, /raise investment/);
  assert.match(response.text, /different from anyone else/);
  history.push({ role: "ai", text: response.text, questionNumber: 7 });
  assert.equal((await s.ask(7, 0, history)).finished, false);
  const callsBeforeClosing = s.requests.length;
  history.push({ role: "user", text: "Costs are rising. Our integrated product is proven with paying customers. Funding unlocks multi-site tools." });
  response = await s.ask(7, 0, history);
  assert.equal(response.finished, true);
  assert.equal(response.questionNumber, 7);
  assert.match(response.text, /Putting your feedback together now/);
  assert.equal(s.requests.length, callsBeforeClosing);
});

test("Q6 follow-ups remain available, but their limit always leads to the closing pitch", async () => {
  const s = setup({ text: "What will the investment fund?", moveOn: false, finished: false });
  for (const count of [0, 1]) {
    const response = await s.ask(6, count);
    assert.equal(response.questionNumber, 6);
    assert.equal(response.followUpsThisQuestion, count + 1);
    assert.equal(response.finished, false);
  }
  const response = await s.ask(6, 2);
  assert.equal(response.questionNumber, 7);
  assert.equal(response.followUpsThisQuestion, 0);
  assert.equal(response.finished, false);
  assert.equal(s.requests.length, 2);
});

test("a model sign-off cannot skip the closing statement or the remaining core topics", async () => {
  const s = setup({ text: "Goodbye", moveOn: false, finished: true });
  const earlier = await s.ask(4);
  assert.equal(earlier.finished, false);
  assert.equal(earlier.questionNumber, 5);
  assert.match(earlier.text, /make money/);
  const closing = await s.ask(6);
  assert.equal(closing.finished, false);
  assert.equal(closing.questionNumber, 7);
  assert.match(closing.text, /30-second pitch/);
});

test("closing cannot finish without the question and a non-empty answer", async () => {
  const s = setup();
  for (const history of [[], [{ role: "user", text: "A previous answer" }],
    [{ role: "ai", text: "Closing?", questionNumber: 7 }, { role: "user", text: "  " }]]) {
    assert.equal((await s.ask(7, 0, history)).finished, false);
  }
  assert.equal(s.requests.length, 0);
});

test("an evidence question about a trial period is preserved, while a delivery promise becomes a question", async () => {
  const text = "What changed for the paying sites after 6 weeks?";
  assert.equal((await setup({ text, moveOn: false }).ask(3)).text, text);
  const promised = await setup({ text: "I'll email you the report in 2 days.", moveOn: false }).ask(3);
  assert.match(promised.text, /\?$/);
  assert.doesNotMatch(promised.text, /email|report/i);
});

test("after two follow-ups a reluctant interviewer still asks the next core topic", async () => {
  const reply = await setup({ text: "One more about what you built?", moveOn: false }).ask(3, 2);
  assert.equal(reply.questionNumber, 4);
  assert.equal(reply.followUpsThisQuestion, 0);
  assert.match(reply.text, /customers could you realistically reach/);
});

test("spoken text excludes control fields even when the model echoes them inside the question", async () => {
  const question = "Who at a pilot depot can approve £300 a month?";
  const leaked = question + "','moveOn':false,'finished':false,'thinAnswer':false}";
  for (const text of [leaked, "{'text':'" + leaked, question]) {
    const reply = await setup({ text, moveOn: false, finished: false, thinAnswer: false }).ask(1, 0, []);
    assert.equal(reply.text, question);
    assert.equal(reply.followUpsThisQuestion, 0);
  }
});
