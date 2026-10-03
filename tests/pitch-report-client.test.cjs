const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");

test("a refresh resumes the same report ID and credentials instead of starting another report", async t => {
  const globals = { fetch: global.fetch, sessionStorage: global.sessionStorage, setTimeout: global.setTimeout };
  const storage = new Map(), requests = [];
  global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  global.setTimeout = (callback, delay) => globals.setTimeout(callback, Math.min(delay, 1));
  const client = loadTs("src/lib/pitch-report-client.ts");
  t.after(() => Object.assign(global, globals));
  let count = 0;
  global.fetch = async (url, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    return { json: async () => ++count === 1 ? { ok: true, status: "processing" } : { ok: true, status: "completed", data: { verdict: "Ready" }, generatedAt: "2026-10-03", pdfSaved: true } };
  };
  const data = await client.loadPitchReport({ companyName: "Tilly" }, [], { signal: new AbortController().signal });
  assert.equal(data.pdfSaved, true);
  assert.equal(requests[0].reportId, requests[1].reportId);
  assert.equal(requests[0].accessToken.length, 64);
  assert.equal(requests[1].pitchData, undefined);
  await client.loadPitchReport({ companyName: "Tilly" }, [], { signal: new AbortController().signal, retry: true });
  assert.equal(requests[2].reportId, requests[0].reportId);
  assert.equal(requests[2].accessToken, requests[0].accessToken);
  assert.equal(requests[2].retry, true);
});
