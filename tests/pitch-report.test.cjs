const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");

const report = {
  verdict: "There is evidence here, but the pitch needs work.",
  verdictCategory: "almost",
  strong: ["Customers are paying."],
  weak: ["The margin needs clarification."],
  fatalFlaw: null,
  sectorConcerns: [],
  revisedPitch: "I built a product for independent venues.",
  thirtyDayActions: ["Clarify gross margin this week."],
  vcQuestions: [{ question: "What is your margin?", prepGuidance: "Separate software from processing." }],
  glossary: [{ term: "margin", definition: "The revenue left after direct costs." }],
};

function setup(t, response = { status: "completed", output_text: JSON.stringify(report) }) {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedModel = process.env.OPENAI_PITCH_REPORT_MODEL;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  delete process.env.OPENAI_PITCH_REPORT_MODEL;
  t.after(() => {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
    if (savedModel === undefined) delete process.env.OPENAI_PITCH_REPORT_MODEL; else process.env.OPENAI_PITCH_REPORT_MODEL = savedModel;
  });
  let request, options;
  class OpenAI {
    constructor(config) {
      options = config;
      this.responses = { create: async body => { request = body; return response; } };
    }
  }
  const lib = loadTs("src/lib/pitch-report.ts", { openai: OpenAI });
  return { lib, get request() { return request; }, get options() { return options; } };
}

test("OpenAI report uses strict schema and the complete existing report format", async t => {
  const s = setup(t);
  assert.deepEqual(await s.lib.generatePitchReport("Report instructions", "Pitch and full transcript"), report);
  assert.equal(s.request.model, "gpt-6.1-sol");
  assert.equal(s.request.input, "Pitch and full transcript");
  assert.equal(s.request.instructions, "Report instructions");
  assert.equal(s.request.store, false);
  assert.equal(s.request.text.format.strict, true);
  assert.deepEqual(s.request.text.format.schema.required.sort(), Object.keys(report).sort());
  assert.equal(s.options.timeout, 45000);
  assert.equal(s.options.maxRetries, 0);
});

test("report model is configurable server-side", async t => {
  const s = setup(t);
  process.env.OPENAI_PITCH_REPORT_MODEL = "configured-report-model";
  await s.lib.generatePitchReport("Instructions", "Input");
  assert.equal(s.request.model, "configured-report-model");
});

test("missing key fails clearly without making an API call", async t => {
  const s = setup(t);
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(s.lib.generatePitchReport("Instructions", "Input"), /not configured/);
  assert.equal(s.request, undefined);
});

for (const response of [
  { status: "incomplete", output_text: '{"verdict":"Partial"}' },
  { status: "completed", output_text: "" },
  { status: "failed", output_text: "" },
]) {
  test("incomplete or refused output is rejected: " + JSON.stringify(response), async t => {
    const s = setup(t, response);
    await assert.rejects(s.lib.generatePitchReport("Instructions", "Input"), /could not be completed/);
  });
}

test("invalid report fields are rejected before reaching the page or PDF", async t => {
  const s = setup(t, { status: "completed", output_text: JSON.stringify({ ...report, weak: "broken" }) });
  await assert.rejects(s.lib.generatePitchReport("Instructions", "Input"), /format was invalid/);
});

test("pitch results route passes the pitch and transcript to OpenAI and scrubs dashes", async t => {
  const s = setup(t, { status: "completed", output_text: JSON.stringify({ ...report, verdict: "Clear pitch—needs numbers." }) });
  const { POST } = loadTs("src/app/api/generate-pitch-results/route.ts", { "@/lib/pitch-report": s.lib });
  const pitchData = { companyName: "Tilly", sector: "Fintech", stage: "early revenue", traction: "47 customers", ask: "£750k" };
  const response = await POST({ json: async () => ({ pitchData, conversation: [{ role: "user", text: "We ran a trial in one of their pubs." }] }) });
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(json.data.verdict, "Clear pitch, needs numbers.");
  assert.equal(json.data.verdictCategory, "almost");
  assert.match(s.request.input, /Company: Tilly/);
  assert.match(s.request.input, /Founder: We ran a trial in one of their pubs\./);
  assert.match(s.request.instructions, /verdictCategory/);
  assert.match(s.request.input, /CLOSING STATEMENT\nNot present/);
  assert.match(s.request.instructions, /without inventing a close or penalising/);
});

test("closing statement is explicitly assessed in readiness, strengths and weaknesses", async t => {
  const s = setup(t);
  const { POST } = loadTs("src/app/api/generate-pitch-results/route.ts", { "@/lib/pitch-report": s.lib });
  const closing = "This is the right moment because costs are rising. Investment funds multi-site tools. Our difference is integrated payments and margins.";
  const response = await POST({ json: async () => ({ pitchData: { companyName: "Tilly" }, conversation: [
    { role: "user", text: "Our earlier funding answer.", questionNumber: 6 },
    { role: "ai", text: "Give your closing pitch.", questionNumber: 7 },
    { role: "user", text: closing },
    { role: "ai", text: "Putting your feedback together now.", questionNumber: 7 },
  ] }) });
  assert.equal((await response.json()).ok, true);
  assert.ok(s.request.input.includes("CLOSING STATEMENT\n" + closing));
  assert.match(s.request.instructions, /closing statement when deciding verdict and verdictCategory/);
  assert.match(s.request.instructions, /observation about the closing pitch in strong or weak/);
  assert.match(s.request.instructions, /Do not let a confident close override weak evidence/);
  assert.match(s.request.instructions, /do not claim to know its duration/);
});
