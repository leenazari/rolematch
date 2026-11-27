const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");

function useKey(t) {
  const before = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key-only";
  t.after(() => before === undefined ? delete process.env.OPENAI_API_KEY : process.env.OPENAI_API_KEY = before);
}
const pitch = { companyName: "Example", oneLineDescription: "Orders for cafés", problem: "queues", targetCustomer: "cafés",
  sector: "Retail", stage: "early revenue", teamSize: "2", founderBackground: "Retail", ask: "£4m", traction: "Ten cafés" };
const cv = { name: "Alex Example", currentRole: "Chef", yearsExperience: 8, sector: "Hospitality",
  keySkills: ["Coaching"], education: "Apprenticeship", notableEmployers: ["Example Café"] };
const turn = { text: "Which problem affects cafés?", moveOn: false, thinAnswer: false, finished: false };
const roles = Array.from({ length: 5 }, (_, i) => ({
  category: i < 3 ? "recommended" : "consider", title: "Coach " + i, matchScore: 90 - i,
  consultantParagraph: "You run a kitchen.", yourStrengths: ["Training"], developmentGaps: ["Planning"],
  nextStep: "Try an open day.", salary: { entry: "£20k", established: "£30k", senior: "£40k", startingTier: "entry" },
  ...(i >= 3 ? { whyUnexpected: "Uses training outside hospitality." } : {}),
}));

test("the five migrated routes send the correct context to OpenAI and retain their HTTP contracts", async t => {
  useKey(t);
  const results = { pitch_extract: pitch, cv_extract: cv, pitch_question: turn, career_question: { ...turn, isGoldenThreadProbe: true },
    career_results: { summary: "From our chat, you like coaching.", roles } };
  const requests = [];
  class OpenAI {
    constructor(options) {
      assert.equal(options.maxRetries, 0);
      this.responses = { create: async body => {
        requests.push(body);
        return { status: "completed", output_text: JSON.stringify(results[body.text.format.name]) };
      } };
    }
  }
  const text = "Example Café trains people to run an independent coffee shop in the Midlands. ".repeat(4);
  const history = [{ role: "ai", text: "Why now?" }, { role: "user", text: "Our customers asked for a workshop." }];
  async function call(name, data) {
    const { POST } = loadTs("src/app/api/" + name + "/route.ts", { openai: OpenAI });
    const res = await POST(new Request("https://example.test/api/" + name,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }));
    assert.equal(res.status, 200);
    return res.json();
  }
  assert.deepEqual((await call("extract-pitch", { text })).data, { ...pitch, rawText: text });
  const extracted = (await call("extract-cv", { text })).data;
  assert.deepEqual(extracted, { ...cv, rawText: text, lovedSkills: [], avoidSkills: [] });
  assert.equal((await call("pitch-next-question", { pitchData: pitch, history, currentQuestion: 2, followUpsThisQuestion: 0 })).text, turn.text);
  assert.equal((await call("next-question", { cvData: extracted, history, currentQuestion: 2, followUpsThisQuestion: 0, coachingUsed: false })).isGoldenThreadProbe, true);
  assert.deepEqual((await call("generate-results", { cvData: extracted, conversation: history })).data, results.career_results);
  assert.deepEqual(requests.map(r => r.text.format.name), Object.keys(results));
  assert.equal(requests[0].input, text);
  for (const r of requests.slice(2)) assert.match(JSON.stringify(r.input), /Our customers asked for a workshop/);
  assert.deepEqual(requests[2].input.map(m => m.role), ["developer", "user"]);
  for (const r of requests) {
    assert.equal(r.text.format.strict, true);
    assert.equal(r.store, false);
    assert.ok(!r.tools?.length);
    assert.ok(r.max_output_tokens <= 5000);
  }
});

test("both interviewers use a separate reasoning model even when a lightweight upload model is configured", async t => {
  useKey(t);
  const before = { text: process.env.OPENAI_TEXT_MODEL, interview: process.env.OPENAI_INTERVIEW_MODEL };
  t.after(() => {
    if (before.text === undefined) delete process.env.OPENAI_TEXT_MODEL; else process.env.OPENAI_TEXT_MODEL = before.text;
    if (before.interview === undefined) delete process.env.OPENAI_INTERVIEW_MODEL; else process.env.OPENAI_INTERVIEW_MODEL = before.interview;
  });
  delete process.env.OPENAI_INTERVIEW_MODEL;
  process.env.OPENAI_TEXT_MODEL = "gpt-6-luna";
  const calls = [];
  class OpenAI { responses = { create: async request => {
    calls.push(request);
    return { status: "completed", output_text: JSON.stringify(turn) };
  } }; }
  const { generateJson } = loadTs("src/lib/openai-json.ts", { openai: OpenAI });
  for (const task of ["pitch_question", "career_question", "pitch_extract"]) await generateJson(task, "system", "conversation");
  process.env.OPENAI_INTERVIEW_MODEL = "interview-override";
  await generateJson("pitch_question", "system", "conversation");
  assert.deepEqual(calls.map(c => [c.model, c.reasoning.effort]), [
    ["gpt-6.2-astra", "medium"], ["gpt-6.2-astra", "medium"], ["gpt-6-luna", "low"], ["interview-override", "medium"],
  ]);
  assert.ok(calls[0].max_output_tokens >= 2048);
});

test("missing key and incomplete or refused text results never become a successful report", async t => {
  useKey(t);
  let response = { status: "incomplete", output_text: '{"summary":"partial"}' };
  class OpenAI { responses = { create: async () => response }; }
  const { generateJson } = loadTs("src/lib/openai-json.ts", { openai: OpenAI });
  const call = () => generateJson("career_results", "system", "transcript");
  await assert.rejects(call, /try again/i);
  response = { status: "completed", output_text: "" };
  await assert.rejects(call, /try again/i);
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(call, /not configured/);
});
