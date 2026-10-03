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

for (const stored of ["{broken", "null", JSON.stringify({ reportId: "old-report", accessToken: "old-token" }),
  JSON.stringify({ reportId: "87c0b3b6-9456-4963-8a09-4dc823309b72", accessToken: "short" })]) {
  test("unusable report credentials are repaired without losing the saved pitch: " + stored, async t => {
    const globals = { fetch: global.fetch, sessionStorage: global.sessionStorage };
    const storage = new Map([
      ["pitchperfect_report_access", stored], ["pitchperfect_pdf_saved", "true"],
      ["pitchperfect_data", '{"companyName":"Tilly"}'],
      ["pitchperfect_conversation", '[{"role":"user","text":"My saved answer"}]'],
      ["pitchperfect_critique", '{"verdict":"Previously completed report"}'],
    ]);
    global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
    t.after(() => Object.assign(global, globals));
    const client = loadTs("src/lib/pitch-report-client.ts");
    let request;
    global.fetch = async (_, options) => {
      request = JSON.parse(options.body);
      return { json: async () => ({ ok: true, status: "completed", data: {}, pdfSaved: true }) };
    };
    await client.loadPitchReport({ companyName: "Tilly" }, [{ role: "user", text: "My saved answer" }],
      { signal: new AbortController().signal });
    assert.match(request.reportId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(request.accessToken, /^[0-9a-f]{64}$/);
    assert.deepEqual(JSON.parse(storage.get("pitchperfect_report_access")), {
      reportId: request.reportId, accessToken: request.accessToken,
    });
    assert.equal(storage.get("pitchperfect_pdf_saved"), "false");
    assert.equal(storage.get("pitchperfect_data"), '{"companyName":"Tilly"}');
    assert.equal(storage.get("pitchperfect_conversation"), '[{"role":"user","text":"My saved answer"}]');
    assert.equal(storage.get("pitchperfect_critique"), '{"verdict":"Previously completed report"}');
  });
}

test("valid completed report credentials and the saved PDF flag are preserved", t => {
  const original = global.sessionStorage;
  const access = { reportId: "87c0b3b6-9456-4963-8a09-4dc823309b72", accessToken: "a".repeat(64) };
  const storage = new Map([["pitchperfect_report_access", JSON.stringify(access)], ["pitchperfect_pdf_saved", "true"]]);
  global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  t.after(() => { global.sessionStorage = original; });
  assert.deepEqual(loadTs("src/lib/pitch-report-client.ts").reportAccess(), access);
  assert.equal(storage.get("pitchperfect_pdf_saved"), "true");
});
