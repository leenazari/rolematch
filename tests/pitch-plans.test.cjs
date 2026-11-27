const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const path = require("node:path");
const { Document, Page, Text, renderToBuffer } = require("@react-pdf/renderer");
const { loadTs } = require("./load-ts.cjs");

const ask = "The funding ask is £375,000 for 18 months.";
const overview = "LatchHarbour leases reusable transport cages to independent parcel depots.";
const detail = "Each depot scans the cage when sending a shipment and confirms its return. ";
const paper = [
  overview, ...Array.from({ length: 40 }, (_, i) => i === 18 ? "Page 20 of 42" :
    "Depot operations, appendix " + (i + 2) + ". " + detail.repeat(8) + (i === 6 ? "WHOLE_PLAN_ONLY" : "")), ask,
];
const pdf = () => renderToBuffer(React.createElement(Document, null, ...paper.map((p, i) =>
  React.createElement(Page, { key: i, wrap: false, style: { padding: 30 } },
    React.createElement(Text, { style: { fontSize: 11 } }, p)))));
const url = "https://example.test/api/extract-pitch";
const asJson = body => new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
function extractor(requests, evidence = []) {
  return loadTs("src/app/api/extract-pitch/route.ts", {
    "@/lib/openai-json": { generateJson: async (task, _instructions, input) => {
      requests.push({ task, input });
      return { companyName: "LatchHarbour", ask: "£375,000", evidence };
    } },
  }).POST;
}

test("a real 42-page business plan: both PDF readers reach the funding appendix, and the interview and report reuse only checked evidence", async () => {
  const file = new File([await pdf()], "LatchHarbour.pdf", { type: "application/pdf" });
  const form = new FormData(); form.set("file", file);
  const calls = [];
  const extract = extractor(calls, [
    { page: 1, quote: overview }, { page: 3, quote: ask }, { page: 42, quote: "We are raising £9 million." },
  ]);
  const response = await extract(new Request(url, { method: "POST", body: form }));
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].task, "pitch_document");
  assert.ok(calls[0].input.length > 12_000);
  assert.match(calls[0].input, /\[Page 42\]\nThe funding ask is £375,000/);
  assert.match(calls[0].input, /\[Page 20\]\n\(no readable text\)/);
  assert.equal(data.rawText, "");
  assert.equal(data.sourceDocument.pageCount, 42);
  assert.deepEqual(data.sourceDocument.unreadablePages, [20]);
  assert.deepEqual(data.sourceDocument.evidence, [{ page: 1, quote: overview }, { page: 42, quote: ask }]);

  // Exercise the identical extraction/worker code used for large browser uploads as well.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { readPitchFilePages } = loadTs("src/lib/pitch-file-client.ts");
  const progress = [];
  const pages = await readPitchFilePages(file, (n, total) => progress.push([n, total]), pdfjs, path.dirname(require.resolve("pdfjs-dist/package.json")) + "/");
  assert.deepEqual(progress.at(-1), [42, 42]);
  assert.equal(pages.length, 42);
  const localRes = await extract(asJson({ pages }));
  assert.equal(localRes.status, 200);
  assert.deepEqual((await localRes.json()).data.sourceDocument, data.sourceDocument);

  data.sourceDocument.founderNote = "The chart shows 11 signed depots.";
  const { pitchReportInput } = loadTs("src/lib/pitch-report-prompt.ts");
  const forReport = pitchReportInput(data, []);
  let forQuestion;
  const next = loadTs("src/app/api/pitch-next-question/route.ts", {
    "@/lib/openai-json": { generateJson: async (_task, _instructions, input) => {
      forQuestion = input;
      return { text: "Which depot signed first?", moveOn: false, thinAnswer: false, finished: false };
    } },
  }).POST;
  const nextRes = await next(asJson({ pitchData: data, history: [], currentQuestion: 1, followUpsThisQuestion: 0 }));
  assert.equal(nextRes.status, 200);
  for (const prompt of [forQuestion, forReport]) {
    assert.match(prompt, /\[PDF page 42\] The funding ask is £375,000/);
    assert.match(prompt, /Founder clarification.*11 signed depots/);
    assert.doesNotMatch(prompt, /WHOLE_PLAN_ONLY|raising £9 million/);
  }
});

test("over-limit or unreadable documents are explained before any model call", async () => {
  const calls = [], extract = extractor(calls);
  for (const [body, status, message] of [
    [{ pages: Array(101).fill(overview) }, 413, /100 pages/],
    [{ pages: ["q".repeat(240001)] }, 413, /240,000/],
    [{ pages: ["", "Page 2 of 4", "3", ""] }, 400, /searchable PDF/],
    [{ pages: [] }, 400, /no readable pages/i],
  ]) {
    const res = await extract(asJson(body));
    assert.equal(res.status, status); assert.match((await res.json()).error, message);
  }
  assert.equal(calls.length, 0);
});

test("long pasted plans keep late facts but label their evidence as text sections, never PDF pages", async () => {
  const calls = [], extract = extractor(calls);
  const res = await extract(asJson({ text: detail.repeat(220) + ask }));
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(calls.length, 1);
  assert.match(calls[0].input, /\[Section 3\][\s\S]+£375,000/);
  assert.equal(data.rawText, "");
  const { pitchSourceContext } = loadTs("src/lib/pitch-document.ts");
  assert.match(pitchSourceContext(data), /\[Text section 3\].*£375,000/);
  assert.doesNotMatch(pitchSourceContext(data), /PDF page/);
});
