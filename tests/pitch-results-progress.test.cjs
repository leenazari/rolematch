const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const renderer = require("react-test-renderer");
const { loadTs } = require("./load-ts.cjs");
const fixture = require("./pitch-insights.fixture.cjs");

async function setup(t, claim = async () => "open") {
  const original = global.sessionStorage;
  const storage = new Map([
    ["pitchperfect_data", '{"companyName":"Tilly"}'],
    ["pitchperfect_conversation", '[{"role":"user","text":"A sandwich lost 30p."}]'],
  ]);
  global.sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const router = { push() {} };
  let options, resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const Page = loadTs("src/app/pitch/results/page.tsx", {
    "next/navigation": { useRouter: () => router },
    "@/lib/pitch-report-client": { ...loadTs("src/lib/pitch-report-client.ts"), claimReportView: claim, reportAccess: () => ({ reportId: "fixture", accessToken: "recovery" }), loadPitchReport: async (pd, conv, received) => { options = received; return promise; } },
    "./report-insights": loadTs("src/app/pitch/results/report-insights.tsx"),
  }).default;
  let view;
  await renderer.act(async () => { view = renderer.create(React.createElement(Page)); });
  t.after(() => { renderer.act(() => view.unmount()); global.sessionStorage = original; });
  return { view, storage, get options() { return options; }, resolve, reject,
    text: () => JSON.stringify(view.toJSON()),
    pdfButton: () => view.root.findAllByType("button").find(button => /PDF/.test(button.children.join(""))),
  };
}

test("the first feedback is readable while later sections prepare, and PDF download waits for the full report", async t => {
  const s = await setup(t);
  assert.match(s.text(), /Your full report usually takes less than two minutes/);
  assert.match(s.text(), /Your verdict appears first/);
  await renderer.act(async () => s.options.onProgress({ verdict: "Early verdict", strong: ["A real customer example."] }));
  assert.match(s.text(), /Early verdict/);
  assert.doesNotMatch(s.text(), /Preparing your pitch report/);
  assert.match(s.text(), /A real customer example/);
  assert.match(s.text(), /Report in progress/);
  assert.doesNotMatch(s.text(), /What to do in the next 30 days/);
  assert.equal(s.pdfButton().props.disabled, true);
  assert.equal(s.storage.get("pitchperfect_critique"), undefined);
  const { marketResearch, ...core } = fixture;
  await renderer.act(async () => s.options.onProgress(core));
  assert.match(s.text(), /Where AI could help your business/);
  assert.doesNotMatch(s.text(), /Market and competitors/);
  assert.equal(s.pdfButton().props.disabled, true);
  await renderer.act(async () => s.resolve({ data: fixture, generatedAt: "2026-10-03T16:00:00Z", pdfSaved: true }));
  assert.match(s.text(), /Market and competitors/);
  assert.match(s.text(), /Where AI could help your business/);
  assert.doesNotMatch(s.text(), /Report in progress/);
  assert.equal(s.pdfButton().props.disabled, false);
  assert.equal(s.storage.size, 0);
  assert.match(s.text(), /Once you leave or refresh this page/);
  assert.equal(s.view.root.findAllByType("input").filter(n => n.props.type === "email").length, 0);
});

test("an interrupted report keeps its readable sections and offers Resume", async t => {
  const s = await setup(t);
  await renderer.act(async () => s.options.onProgress({ verdict: "Saved first section" }));
  await renderer.act(async () => s.reject(new Error("Connection interrupted")));
  assert.match(s.text(), /Saved first section/);
  assert.match(s.text(), /Connection interrupted/);
  assert.match(s.text(), /Resume report/);
  assert.equal(s.pdfButton().props.disabled, true);
});

test("a slow report updates its estimate without hiding first feedback or pretending the PDF is ready", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = await setup(t);
  await renderer.act(async () => t.mock.timers.tick(119000));
  assert.match(s.text(), /usually takes less than two minutes/);
  await renderer.act(async () => s.options.onProgress({ verdict: "Early and still visible" }));
  await renderer.act(async () => t.mock.timers.tick(1000));
  assert.match(s.text(), /rest is taking a little longer/);
  assert.match(s.text(), /Early and still visible/);
  assert.equal(s.pdfButton().props.disabled, true);
});

test("a tab that loses the one-time handoff cannot display or download a completed report", async t => {
  const s = await setup(t, async () => "closed");
  await renderer.act(async () => s.resolve({ data: fixture, generatedAt: "2026-11-27T16:03:00Z", pdfSaved: true }));
  assert.match(s.text(), /No report is available here/);
  assert.doesNotMatch(s.text(), /Market and competitors|Download full PDF/);
  assert.equal(s.storage.size, 0);
});
test("a failed download stays on the completed page and retries with the same in-memory access", async t => {
  const previous = { fetch: global.fetch, document: global.document }, calls = [];
  t.after(() => Object.assign(global, previous));
  let viewToken, clicks = 0;
  const s = await setup(t, async (_old, view) => { viewToken = view; return "open"; });
  await renderer.act(async () => s.resolve({ data: fixture, generatedAt: "2026-11-27T16:03:00Z", pdfSaved: true }));
  global.document = { createElement: () => ({ click() { clicks++; } }), body: { appendChild() {}, removeChild() {} } };
  global.fetch = async (url, options) => {
    assert.equal(url, "/api/generate-pitch-pdf"); calls.push(JSON.parse(options.body));
    return calls.length === 1 ? new Response(null, {status:503}) : new Response("%PDF-test", {headers:{"content-type":"application/pdf"}});
  };
  // The browser releases the object URL asynchronously.
  t.mock.timers.enable({apis:["setTimeout"]});
  for (let i=0; i<3; i++) {
    await renderer.act(async () => s.pdfButton().props.onClick());
    if (!i) assert.match(s.text(), /didn’t download/);
  }
  assert.deepEqual(calls, [viewToken,viewToken,viewToken]);assert.equal(clicks,2);
  assert.match(s.text(), /Download started/); assert.equal(s.storage.size,0);
  t.mock.timers.tick(30_000);
});

test("a lost handoff acknowledgement retries the same claim without another generation or losing the PDF", async t => {
  const claims = [];
  const s = await setup(t, async (_old, view) => {
    claims.push(view); if (claims.length === 1) throw new Error("Claim acknowledgement lost"); return "open";
  });
  await renderer.act(async () => s.resolve({ data: fixture, generatedAt:"2026-11-27T16:03:00Z", pdfSaved:true }));
  assert.match(s.text(), /Claim acknowledgement lost/);
  const retry = s.view.root.findAllByType("button").find(b => b.children.join("") === "Try generating again");
  await renderer.act(async () => retry.props.onClick());
  assert.equal(claims.length,2); assert.equal(claims[0],claims[1]);
  assert.equal(s.pdfButton().props.disabled,false); assert.equal(s.storage.size,0);
});
