const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");
const id = "2d1d0972-cbfa-4622-b916-829ce1214088", accessToken = "ab".repeat(32);
const critique = { verdict: "Almost ready.", verdictCategory: "almost", strong: ["Paying customers."], weak: ["Clarify margins."],
  fatalFlaw: null, sectorConcerns: [], revisedPitch: "A venue platform.", thirtyDayActions: [], vcQuestions: [], glossary: [] };
const progressParser = loadTs("src/lib/pitch-report-progress.ts", { "@/lib/pitch-report": loadTs("src/lib/pitch-report.ts") });
const reportLib = loadTs("src/lib/pitch-report.ts");
const market = require("./pitch-insights.fixture.cjs").marketResearch;

function setup() {
  const rows = new Map(), files = new Map();
  const calls = { begin: 0, retrieve: 0, render: 0, save: 0, stream: [], parts: [] };
  let uploadFails = false, response = { status: "in_progress" }, beginWait;
  let streaming = false, streamCheckpoint, streamWait, creationStream = false, consume;
  const background = [];
  let parseResult = () => critique;
  let marketResponse = { status: "in_progress" }, consumeMarket;
  class Query {
    constructor() { this.filters = []; this.operation = "select"; }
    select() { return this; }
    eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    lt(key, value) { this.filters.push(row => row[key] < value); return this; }
    is(key, value) { return this.eq(key, value); }
    insert(values) { this.operation = "insert"; this.values = values; return this; }
    update(values) { this.operation = "update"; this.values = values; return this; }
    async execute() {
      if (this.operation === "insert") {
        if (rows.has(this.values.id)) return { data: null, error: { code: "23505" } };
        const row = { response_id: null, critique: null, pdf_path: null, generated_at: null,
          core_critique: null, research_result: null, research_response_id: null, research_status: "idle", research_cursor: -1,
          updated_at: new Date().toISOString(), ...this.values };
        rows.set(row.id, row);
        return { data: structuredClone(row), error: null };
      }
      const row = [...rows.values()].find(row => this.filters.every(filter => filter(row)));
      if (row && this.operation === "update") Object.assign(row, this.values);
      return { data: row ? structuredClone(row) : null, error: null };
    }
    single() { return this.execute(); }
    maybeSingle() { return this.execute(); }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }
  const storage = { pitchStorageClient: () => ({ from: () => new Query(), storage: { from: () => ({
    download: async path => ({ data: files.has(path) ? new Blob([files.get(path)]) : null, error: null }),
  }) } }), PITCH_PDF_BUCKET: "pitch-reports", savePitchPdf: async (path, pdf) => {
    calls.save++; if (uploadFails) throw new Error("Temporary storage failure"); files.set(path, pdf);
  } };
  const lib = loadTs("src/lib/pitch-report-job.ts", {
    "@vercel/functions": { waitUntil: promise => background.push(promise) },
    "@/lib/pitch-storage": storage,
    "@/lib/pitch-report": {
      beginPitchReport: async (instructions, input, model, part) => { calls.begin++; calls.parts.push(part); if (beginWait) await beginWait; return { id: part === "market" ? "resp_market" : "resp_test", status: "queued", streaming, streamCursor: 0,
        ...(creationStream ? { iterator: {}, controller: { abort() {} } } : {}) }; },
      consumePitchReportStream: async (started, save) => started.id === "resp_market" ? consumeMarket(save) : consume(save),
      retrievePitchReport: async responseId => { calls.retrieve++; if (responseId === "resp_market") return marketResponse;
        assert.equal(responseId, "resp_test"); return response; },
      readPitchReportStream: async (responseId, cursor, text) => { calls.stream.push({ responseId, cursor, text });
        const next = structuredClone(streamCheckpoint); if (streamWait) await streamWait; return next; },
      parsePitchReport: value => { if (value.status !== "completed") throw new Error("Not completed"); return parseResult(); },
      isPitchCritique: value => value?.verdict === critique.verdict,
      parsePitchMarketReport: value => { if (value.status !== "completed") throw new Error("Research failed"); return market; },
      combinePitchReportUsage: reportLib.combinePitchReportUsage,
    },
    "@/lib/pitch-report-progress": progressParser,
    "@/lib/pitch-pdf": { renderPitchPdf: async () => { calls.render++; return Buffer.from("%PDF-test\n%%EOF"); } },
  });
  const request = { id, accessToken, pitchData: { companyName: "Tilly" }, conversation: [{ role: "user", text: "Our closing pitch." }],
    instructions: "Report rules", input: "Complete transcript" };
  return { lib, rows, files, calls, request, background, set uploadFails(value) { uploadFails = value; },
    set response(value) { response = value; }, set beginWait(value) { beginWait = value; },
    set streaming(value) { streaming = value; }, set streamCheckpoint(value) { streamCheckpoint = value; }, set streamWait(value) { streamWait = value; },
    set creationStream(value) { creationStream = value; }, set consume(value) { consume = value; },
    set parseResult(value) { parseResult = value; }, set consumeMarket(value) { consumeMarket = value; },
    set marketResponse(value) { marketResponse = value; } };
}

test("fast feedback completes before research, refresh reuses both jobs, and the complete PDF includes the market part", async () => {
  const s = setup(); s.streaming = true; s.creationStream = true;
  let finishCore, finishMarket, saveCore;
  const coreWait = new Promise(resolve => { finishCore = resolve; });
  const marketWait = new Promise(resolve => { finishMarket = resolve; });
  s.consume = async save => { saveCore = save; await coreWait; };
  s.consumeMarket = async () => { await marketWait; };
  await s.lib.runPitchReportJob({ ...s.request, split: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(s.calls.parts, ["core", "market"]);
  await saveCore({ cursor: 10, text: '{"first":' + JSON.stringify({ verdict: critique.verdict, verdictCategory: critique.verdictCategory, strong: critique.strong }) + ',"second":' });
  const first = await s.lib.runPitchReportJob({ id, accessToken });
  assert.deepEqual(first.partial.strong, critique.strong);
  assert.equal(first.partial.weak, undefined);
  assert.equal(s.calls.retrieve, 0, "fresh saved chunks are delivered without an OpenAI GET");
  s.response = { status: "completed", usage: { estimated_report_cost_usd: 0.04, web_search_calls: 0 } };
  finishCore(); await new Promise(resolve => setImmediate(resolve));
  const second = await s.lib.runPitchReportJob({ id, accessToken });
  assert.deepEqual(second.partial.weak, critique.weak);
  assert.equal(second.status, "processing");
  assert.equal(s.rows.get(id).critique, null);
  assert.equal(s.files.size, 0, "there is no incomplete PDF");
  assert.equal(s.calls.begin, 2);
  s.marketResponse = { status: "completed", usage: { estimated_report_cost_usd: 0.03, web_search_calls: 2 } };
  finishMarket(); await Promise.all(s.background);
  const final = await s.lib.runPitchReportJob({ id, accessToken });
  assert.equal(final.pdfSaved, true);
  assert.deepEqual(final.data.marketResearch, market);
  assert.equal(s.rows.get(id).token_usage.estimated_report_cost_usd, 0.07);
  assert.equal(s.rows.get(id).token_usage.web_search_calls, 2);
  assert.equal(s.calls.begin, 2, "resuming never restarts either generation");
});

test("failed research retries only that part and preserves the two completed feedback chunks", async () => {
  const s = setup(); s.streaming = true; s.creationStream = true;
  s.consume = async () => {};
  s.consumeMarket = async () => {};
  s.response = { status: "completed" };
  s.marketResponse = { status: "failed" };
  await s.lib.runPitchReportJob({ ...s.request, split: true });
  await Promise.all(s.background);
  assert.equal(s.rows.get(id).research_status, "failed");
  assert.deepEqual(s.rows.get(id).core_critique, critique);
  await assert.rejects(s.lib.runPitchReportJob({ id, accessToken }), /retry just the research/);
  s.marketResponse = { status: "completed" };
  await Promise.all([
    s.lib.runPitchReportJob({ id, accessToken, retry: true }), s.lib.runPitchReportJob({ id, accessToken, retry: true }),
  ]);
  await Promise.all(s.background);
  assert.deepEqual(s.calls.parts, ["core", "market", "market"]);
  assert.equal((await s.lib.runPitchReportJob({ id, accessToken })).pdfSaved, true);
});

test("sections are saved before completion, resume from the stored cursor, and never create another generation", async () => {
  const s = setup(); s.streaming = true;
  await s.lib.runPitchReportJob(s.request);
  s.rows.get(id).updated_at = "2000-01-01T00:00:00Z";
  s.streamCheckpoint = { cursor: 10, text: '{"verdict":"Almost ready.","strong":["Paying customers."]' };
  const first = await s.lib.runPitchReportJob({ id, accessToken });
  assert.equal(first.status, "processing");
  assert.deepEqual(first.partial, { verdict: critique.verdict, strong: critique.strong });
  assert.equal(s.rows.get(id).critique, null);
  assert.equal(s.rows.get(id).pdf_path, null);
  assert.deepEqual(s.rows.get(id).partial_critique, first.partial);
  s.streamCheckpoint = { cursor: 20, text: '{"verdict":"Almost ready.","strong":["Paying customers."],"weak":["Clarify margins."]' };
  s.rows.get(id).updated_at = "2000-01-01T00:00:00Z";
  const next = await s.lib.runPitchReportJob({ id, accessToken });
  assert.deepEqual(next.partial.weak, critique.weak);
  assert.equal(s.calls.stream[1].cursor, 10);
  assert.equal(s.calls.stream[1].text, s.calls.stream[0].text + '{"verdict":"Almost ready.","strong":["Paying customers."]');
  s.response = { status: "completed", usage: { total_tokens: 200 } };
  assert.equal((await s.lib.runPitchReportJob({ id, accessToken })).pdfSaved, true);
  assert.equal(s.calls.begin, 1);
});

test("a slower competing stream poll cannot overwrite a newer checkpoint", async () => {
  const s = setup(); s.streaming = true;
  await s.lib.runPitchReportJob(s.request);
  s.rows.get(id).updated_at = "2000-01-01T00:00:00Z";
  let release; s.streamWait = new Promise(resolve => { release = resolve; });
  s.streamCheckpoint = { cursor: 5, text: '{"verdict":"Old preview"' };
  const slower = s.lib.runPitchReportJob({ id, accessToken });
  await new Promise(resolve => setImmediate(resolve));
  s.streamWait = null;
  s.streamCheckpoint = { cursor: 10, text: '{"verdict":"Almost ready.","strong":["Paying customers."]' };
  await s.lib.runPitchReportJob({ id, accessToken });
  release(); const resumed = await slower;
  assert.equal(s.rows.get(id).stream_cursor, 10);
  assert.equal(resumed.partial.verdict, critique.verdict);
  assert.deepEqual(resumed.partial.strong, critique.strong);
  assert.equal(s.calls.begin, 1);
});

test("creation stream continues after returning, saves early sections and archives without another browser request", async () => {
  const s = setup(); s.streaming = true; s.creationStream = true;
  let release, saveProgress;
  const wait = new Promise(resolve => { release = resolve; });
  s.consume = async save => { saveProgress = save; await wait; };
  const first = await s.lib.runPitchReportJob(s.request);
  assert.equal(first.status, "processing");
  assert.equal(s.background.length, 1);
  await saveProgress({ cursor: 10, text: '{"verdict":"Almost ready.","strong":["Paying customers."]' });
  const early = await s.lib.runPitchReportJob({ id, accessToken });
  assert.deepEqual(early.partial, { verdict: critique.verdict, strong: critique.strong });
  assert.equal(s.calls.stream.length, 0, "fresh progress does not open a competing stream");
  await saveProgress({ cursor: 5, text: '{"verdict":"Stale"}' });
  assert.equal(s.rows.get(id).stream_cursor, 10);
  assert.equal(s.rows.get(id).partial_critique.verdict, critique.verdict);
  s.response = { status: "completed", usage: { total_tokens: 200 } };
  release(); await Promise.all(s.background);
  assert.equal(s.rows.get(id).status, "ready");
  assert.equal(s.files.size, 1);
  assert.equal(s.calls.begin, 1);
});

test("persist before generating, poll the same response, and automatically save the PDF before Download", async () => {
  const s = setup();
  assert.equal((await s.lib.runPitchReportJob(s.request)).status, "processing");
  const row = s.rows.get(id);
  assert.equal(row.response_id, "resp_test");
  assert.notEqual(row.access_token_hash, accessToken);
  assert.equal(row.conversation[0].text, "Our closing pitch.");
  assert.equal((await s.lib.runPitchReportJob({ id, accessToken })).status, "processing");
  s.response = { status: "completed", usage: { total_tokens: 200 } };
  const result = await s.lib.runPitchReportJob({ id, accessToken });
  assert.equal(result.pdfSaved, true);
  assert.deepEqual(result.data, critique);
  assert.equal(s.calls.begin, 1);
  assert.equal(s.files.size, 1);
  assert.equal(s.rows.get(id).status, "ready");
  assert.deepEqual(s.rows.get(id).token_usage, { total_tokens: 200 });
  const downloaded = await s.lib.downloadSavedPitchPdf(id, accessToken);
  assert.match(downloaded.pdf.toString(), /^%PDF/);
  const calls = { ...s.calls };
  assert.equal((await s.lib.runPitchReportJob({ id, accessToken })).pdfSaved, true);
  assert.deepEqual(s.calls, calls);
});

test("simultaneous page requests do not create another paid generation", async () => {
  const s = setup();
  let release;
  s.beginWait = new Promise(resolve => { release = resolve; });
  const first = s.lib.runPitchReportJob(s.request);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.rows.size, 1);
  assert.equal((await s.lib.runPitchReportJob(s.request)).status, "processing");
  assert.equal(s.calls.begin, 1);
  release(); await first;
});

test("simultaneous completion requests return the first archived critique without changing its timestamp", async () => {
  const s = setup();
  await s.lib.runPitchReportJob(s.request);
  s.response = { status: "completed", usage: { total_tokens: 200 } };
  let parses = 0;
  s.parseResult = () => ({ ...critique, verdict: `Snapshot ${++parses}` });
  const [first, second] = await Promise.all([
    s.lib.runPitchReportJob({ id, accessToken }), s.lib.runPitchReportJob({ id, accessToken }),
  ]);
  assert.equal(parses, 2, "both readers observed the final response before it was archived");
  assert.equal(s.rows.get(id).critique.verdict, "Snapshot 1");
  assert.deepEqual(first.data, second.data);
  assert.equal(first.generatedAt, second.generatedAt);
  const repeated = await s.lib.runPitchReportJob({ id, accessToken });
  assert.deepEqual(repeated.data, first.data);
  assert.equal(repeated.generatedAt, first.generatedAt);
  assert.equal(s.calls.begin, 1);
});

test("failed PDF saving keeps the critique and retries only storage", async () => {
  const s = setup();
  await s.lib.runPitchReportJob(s.request);
  s.response = { status: "completed" };
  s.uploadFails = true;
  const ready = await s.lib.runPitchReportJob({ id, accessToken });
  assert.deepEqual(ready.data, critique);
  assert.equal(ready.pdfSaved, false);
  assert.deepEqual(s.rows.get(id).critique, critique);
  const retrieved = s.calls.retrieve;
  s.uploadFails = false;
  assert.equal((await s.lib.runPitchReportJob({ id, accessToken })).pdfSaved, true);
  assert.equal(s.calls.begin, 1);
  assert.equal(s.calls.retrieve, retrieved);
});

test("other visitors cannot read, overwrite, or download a report without its secret access token", async () => {
  const s = setup();
  await s.lib.runPitchReportJob(s.request);
  const wrongToken = "cd".repeat(32);
  await assert.rejects(s.lib.runPitchReportJob({ id, accessToken: wrongToken }), /not found/);
  await assert.rejects(s.lib.runPitchReportJob({ ...s.request, accessToken: wrongToken }), /not found/);
  await assert.rejects(s.lib.downloadSavedPitchPdf(id, wrongToken), /not found/);
  assert.equal(s.calls.begin, 1);
  assert.equal(s.rows.get(id).conversation[0].text, "Our closing pitch.");
});

test("failed generation needs an explicit retry and concurrent retries claim it once", async () => {
  const s = setup();
  await s.lib.runPitchReportJob(s.request);
  s.response = { status: "incomplete" };
  await assert.rejects(s.lib.runPitchReportJob({ id, accessToken }), /could not be completed/);
  await assert.rejects(s.lib.runPitchReportJob({ id, accessToken }), /could not be completed/);
  assert.equal(s.calls.begin, 1);
  await Promise.all([s.lib.runPitchReportJob({ id, accessToken, retry: true }), s.lib.runPitchReportJob({ id, accessToken, retry: true })]);
  assert.equal(s.calls.begin, 2);
});

test("a previously cached report is archived without generating a new critique", async () => {
  const s = setup();
  const result = await s.lib.runPitchReportJob({ ...s.request, existingCritique: critique, generatedAt: "2026-10-03T14:00:00Z" });
  assert.equal(result.pdfSaved, true);
  assert.equal(result.generatedAt, "2026-10-03T14:00:00.000Z");
  assert.equal(s.calls.begin, 0);
  assert.equal(s.files.size, 1);
});
