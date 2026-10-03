const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const renderer = require("react-test-renderer");
const { loadTs } = require("./load-ts.cjs");
const fixture = require("./pitch-insights.fixture.cjs");

async function setup(t) {
  const original = global.sessionStorage;
  const storage = new Map([
    ["pitchperfect_data", '{"companyName":"Tilly"}'],
    ["pitchperfect_conversation", '[{"role":"user","text":"A sandwich lost 30p."}]'],
  ]);
  global.sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  const router = { push() {} };
  let options, resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const Page = loadTs("src/app/pitch/results/page.tsx", {
    "next/navigation": { useRouter: () => router },
    "@/lib/pitch-report-client": { reportAccess: () => ({}), loadPitchReport: async (pd, conv, received) => { options = received; return promise; } },
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
  await renderer.act(async () => s.options.onProgress({ verdict: "Early verdict", strong: ["A real customer example."] }));
  assert.match(s.text(), /Early verdict/);
  assert.match(s.text(), /A real customer example/);
  assert.match(s.text(), /Report in progress/);
  assert.doesNotMatch(s.text(), /What to do in the next 30 days/);
  assert.equal(s.pdfButton().props.disabled, true);
  assert.equal(s.storage.get("pitchperfect_critique"), undefined);
  await renderer.act(async () => s.resolve({ data: fixture, generatedAt: "2026-10-03T16:00:00Z", pdfSaved: true }));
  assert.match(s.text(), /Market and competitors/);
  assert.match(s.text(), /Where AI could help your business/);
  assert.doesNotMatch(s.text(), /Report in progress/);
  assert.equal(s.pdfButton().props.disabled, false);
  assert.deepEqual(JSON.parse(s.storage.get("pitchperfect_critique")), fixture);
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
