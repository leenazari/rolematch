const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");
const id = "2d1d0972-cbfa-4622-b916-829ce1214088", accessToken = "ab".repeat(32);
const critique = { verdict: "Almost ready.", verdictCategory: "almost", strong: ["Paying customers."], weak: ["Clarify margins."],
  fatalFlaw: null, sectorConcerns: [], revisedPitch: "A venue platform.", thirtyDayActions: [], vcQuestions: [], glossary: [] };

function setup() {
  const rows = new Map(), files = new Map();
  const calls = { begin: 0, retrieve: 0, render: 0, save: 0 };
  let uploadFails = false, response = { status: "in_progress" }, beginWait;
  class Query {
    constructor() { this.filters = []; this.operation = "select"; }
    select() { return this; }
    eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    is(key, value) { return this.eq(key, value); }
    insert(values) { this.operation = "insert"; this.values = values; return this; }
    update(values) { this.operation = "update"; this.values = values; return this; }
    async execute() {
      if (this.operation === "insert") {
        if (rows.has(this.values.id)) return { data: null, error: { code: "23505" } };
        const row = { response_id: null, critique: null, pdf_path: null, generated_at: null,
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
    "@/lib/pitch-storage": storage,
    "@/lib/pitch-report": {
      beginPitchReport: async () => { calls.begin++; if (beginWait) await beginWait; return { id: "resp_test", status: "queued" }; },
      retrievePitchReport: async responseId => { calls.retrieve++; assert.equal(responseId, "resp_test"); return response; },
      parsePitchReport: value => { if (value.status !== "completed") throw new Error("Not completed"); return critique; },
      isPitchCritique: value => value?.verdict === critique.verdict,
    },
    "@/lib/pitch-pdf": { renderPitchPdf: async () => { calls.render++; return Buffer.from("%PDF-test\n%%EOF"); } },
  });
  const request = { id, accessToken, pitchData: { companyName: "Tilly" }, conversation: [{ role: "user", text: "Our closing pitch." }],
    instructions: "Report rules", input: "Complete transcript" };
  return { lib, rows, files, calls, request, set uploadFails(value) { uploadFails = value; },
    set response(value) { response = value; }, set beginWait(value) { beginWait = value; } };
}

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
