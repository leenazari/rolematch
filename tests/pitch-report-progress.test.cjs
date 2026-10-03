const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");
const report = loadTs("src/lib/pitch-report.ts");
const { parsePartialPitchReport } = loadTs("src/lib/pitch-report-progress.ts", { "@/lib/pitch-report": report });

test("only completed fields appear as a report arrives one character at a time", () => {
  const fields = { verdict: 'The customer said "yes", with a } in the quote.', verdictCategory: "almost",
    strong: ["One", "Two"], vcQuestions: [{ question: "Why now?", prepGuidance: "Bring evidence." }], fatalFlaw: null };
  const json = JSON.stringify(fields);
  let previous = {};
  for (let i = 0; i <= json.length; i++) {
    const current = parsePartialPitchReport(json.slice(0, i));
    for (const [key, value] of Object.entries(current)) assert.deepEqual(value, fields[key]);
    for (const [key, value] of Object.entries(previous)) assert.deepEqual(current[key], value);
    previous = current;
  }
  assert.deepEqual(previous, fields);
  assert.deepEqual(parsePartialPitchReport('{"strong":["One",'), {});
});

test("unsafe, malformed or unverified fields never appear in a preview", () => {
  assert.deepEqual(parsePartialPitchReport('{"verdictCategory":"invented","strong":false,"marketResearch":{},"verdict":"Good—needs detail."}'),
    { verdict: "Good, needs detail." });
  assert.deepEqual(parsePartialPitchReport('not json'), {});
});

test("resume ignores replayed events, saves the exact prefix and does not cancel the background job", async t => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  t.after(() => { if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original; });
  let query, aborts = 0;
  class OpenAI {
    constructor() { this.responses = { retrieve: async (id, params) => {
      assert.equal(id, "resp_saved"); query = params;
      return { controller: { abort() { aborts++; } }, async *[Symbol.asyncIterator]() {
        yield { type: "response.output_text.delta", sequence_number: 4, delta: "replayed" };
        yield { type: "response.reasoning_summary_text.delta", sequence_number: 5, delta: "private reasoning" };
        yield { type: "response.output_text.delta", sequence_number: 6, delta: ' ready."}' };
        yield { type: "response.completed", sequence_number: 7 };
      } };
    } }; }
  }
  const { readPitchReportStream } = loadTs("src/lib/pitch-report.ts", { openai: OpenAI });
  const checkpoint = await readPitchReportStream("resp_saved", 4, '{"verdict":"Almost');
  assert.deepEqual(query, { stream: true, starting_after: 4 });
  assert.deepEqual(checkpoint, { cursor: 7, text: '{"verdict":"Almost ready."}' });
  assert.equal(aborts, 1);
});
