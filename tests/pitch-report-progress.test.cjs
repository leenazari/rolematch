const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");
const report = loadTs("src/lib/pitch-report.ts");
const { parsePartialPitchReport } = loadTs("src/lib/pitch-report-progress.ts", { "@/lib/pitch-report": report });
const fixture = require("./pitch-insights.fixture.cjs");

test("the first complete chunk is visible while the second chunk is still being written", () => {
  const first = Object.fromEntries(report.PITCH_OPENING_KEYS.map(key => [key, fixture[key]]));
  const second = Object.fromEntries(report.PITCH_DETAIL_KEYS.map(key => [key, fixture[key]]));
  const prefix = '{"first":' + JSON.stringify(first) + ',"second":';
  assert.deepEqual(parsePartialPitchReport(prefix), first);
  assert.deepEqual(parsePartialPitchReport(prefix + '{"weak":["Still writing'), first);
  const completed = prefix + JSON.stringify(second) + '}';
  assert.deepEqual(parsePartialPitchReport(completed), { ...first, ...second });
  assert.deepEqual(report.parsePitchReport({ status: "completed", output_text: completed }), { ...first, ...second });
  assert.deepEqual(parsePartialPitchReport('{"first":{"verdict":"Incomplete"}'), {});
});

test("the cost record totals both saved parts rather than reporting only the fast part", () => {
  const usage = report.combinePitchReportUsage({ input_tokens: 1000, output_tokens: 200, estimated_report_cost_usd: 0.004, web_search_calls: 0 },
    { input_tokens: 300, output_tokens: 100, estimated_report_cost_usd: 0.0116, web_search_calls: 1 });
  assert.equal(usage.input_tokens, 1300);
  assert.equal(usage.output_tokens, 300);
  assert.equal(usage.estimated_report_cost_usd, 0.0156);
  assert.equal(usage.web_search_calls, 1);
  assert.equal(usage.generations, 2);
  assert.equal(report.combinePitchReportUsage({}, {}).estimated_report_cost_usd, null);
});

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

test("returning a report ID leaves its creation iterator open until the background consumer completes", async t => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  t.after(() => { if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original; });
  let closed = false, aborts = 0;
  class OpenAI {
    constructor() { this.responses = { create: async () => ({
      controller: { abort() { aborts++; } },
      async *[Symbol.asyncIterator]() {
        try {
          yield { type: "response.created", sequence_number: 0, response: { id: "resp_original", status: "queued" } };
          yield { type: "response.output_text.delta", sequence_number: 1, delta: '{"verdict":"First feedback",' };
          yield { type: "response.reasoning_summary_text.delta", sequence_number: 2, delta: "private reasoning" };
          yield { type: "response.output_text.delta", sequence_number: 3, delta: '"strong":["Customers"]}' };
          yield { type: "response.completed", sequence_number: 4 };
        } finally { closed = true; }
      },
    }) }; }
  }
  const lib = loadTs("src/lib/pitch-report.ts", { openai: OpenAI });
  const started = await lib.beginPitchReport("Instructions", "Public demo");
  assert.equal(started.id, "resp_original");
  assert.equal(closed, false);
  assert.equal(aborts, 0);
  const checkpoints = [];
  await lib.consumePitchReportStream(started, async checkpoint => checkpoints.push(checkpoint));
  assert.equal(checkpoints[0].text, '{"verdict":"First feedback",');
  assert.deepEqual(checkpoints.at(-1), { cursor: 4, text: '{"verdict":"First feedback","strong":["Customers"]}' });
  assert.equal(closed, true, "the consumer closes the iterator after the terminal event");
  assert.equal(aborts, 1);
});
