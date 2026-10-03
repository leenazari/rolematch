const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");

test("progress is delivered before the completed report resolves, using the same report job", async t => {
  const original = { fetch: global.fetch, sessionStorage: global.sessionStorage, setTimeout: global.setTimeout };
  const storage = new Map();
  global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  global.setTimeout = callback => original.setTimeout(callback, 1);
  t.after(() => Object.assign(global, original));
  const requests = [], previews = [];
  let release;
  const final = new Promise(resolve => { release = resolve; });
  global.fetch = async (_, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) return { json: async () => ({ ok: true, status: "processing", partial: { verdict: "Early feedback" } }) };
    await final;
    return { json: async () => ({ ok: true, status: "completed", data: { verdict: "Complete feedback" }, pdfSaved: true }) };
  };
  let completed = false;
  const pending = loadTs("src/lib/pitch-report-client.ts").loadPitchReport({ companyName: "Tilly" }, [],
    { signal: new AbortController().signal, onProgress: partial => previews.push(partial) }).then(value => { completed = true; return value; });
  await new Promise(resolve => original.setTimeout(resolve, 10));
  assert.deepEqual(previews, [{ verdict: "Early feedback" }]);
  assert.equal(completed, false);
  release();
  assert.equal((await pending).pdfSaved, true);
  assert.equal(requests[0].reportId, requests[1].reportId);
});

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

test("adding insights resumes its own job without replacing access to the current report", async t => {
  const original = { sessionStorage: global.sessionStorage, fetch: global.fetch };
  const storage = new Map();
  global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  t.after(() => Object.assign(global, original));
  const client = loadTs("src/lib/pitch-report-client.ts");
  const current = client.reportAccess(); storage.set("pitchperfect_pdf_saved", "true");
  const upgrade = client.reportAccess("pitchperfect_insights_access");
  assert.notEqual(upgrade.reportId, current.reportId);
  assert.deepEqual(client.reportAccess("pitchperfect_insights_access"), upgrade);
  let requested;
  global.fetch = async (_, options) => { requested = JSON.parse(options.body); return { json: async () => ({ ok: true, status: "completed", data: {} }) }; };
  await client.loadPitchReport({ companyName: "Tilly" }, [], { signal: new AbortController().signal, access: upgrade });
  assert.equal(requested.reportId, upgrade.reportId);
  assert.deepEqual(client.reportAccess(), current);
  assert.equal(storage.get("pitchperfect_pdf_saved"), "true");
});
