const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");
const fixture = require("./pitch-insights.fixture.cjs");
const source = fixture.marketResearch.sources[0].url;
const lib = loadTs("src/lib/pitch-report.ts");
const response = (report, output = []) => ({ status: "completed", output_text: JSON.stringify(report), output });
const searched = [{ type: "web_search_call", action: { type: "search", sources: [{ type: "url", url: source }] } }];

test("business-specific AI pilots and retrieved competitor sources survive report parsing", () => {
  const report = lib.parsePitchReport(response(fixture, searched));
  assert.deepEqual(report.aiOpportunities, fixture.aiOpportunities);
  assert.equal(report.marketResearch.competitors[0].name, "Square");
  assert.equal(report.marketResearch.sources[0].url, source);
  assert.ok(!isNaN(Date.parse(report.marketResearch.checkedAt)));
  assert.equal(lib.isPitchCritique(report), true);
});

test("invented and unsafe source URLs cannot turn into researched competitor claims", () => {
  const report = structuredClone(fixture);
  report.marketResearch.competitors.push({ ...report.marketResearch.competitors[0], name: "Invented vendor", sourceUrls: ["https://invented.example/product"] });
  report.marketResearch.sources.push({ title: "Invented", url: "https://invented.example/product" }, { title: "Unsafe", url: "javascript:alert(1)" });
  report.marketResearch.summary = "Invented vendor is the only alternative.";
  const parsed = lib.parsePitchReport(response(report, searched));
  assert.equal(parsed.marketResearch.competitors.length, 1);
  assert.equal(parsed.marketResearch.sources.length, 1);
  assert.doesNotMatch(JSON.stringify(parsed.marketResearch), /Invented vendor|javascript:/);
  assert.match(parsed.marketResearch.limitations, /omitted/);
});

test("unavailable search evidence produces an honest limited market section without losing pitch feedback", () => {
  const parsed = lib.parsePitchReport(response(fixture));
  assert.equal(parsed.verdict, fixture.verdict);
  assert.deepEqual(parsed.marketResearch.competitors, []);
  assert.deepEqual(parsed.marketResearch.sources, []);
  assert.match(parsed.marketResearch.summary, /not enough cited web evidence/);
});

test("inline citation annotations can verify the final JSON sources", () => {
  const parsed = lib.parsePitchReport(response(fixture, [{ type: "message", content: [{ annotations: [{ type: "url_citation", url: source }] }] }]));
  assert.equal(parsed.marketResearch.competitors.length, 1);
});

test("older saved critiques still validate and unsafe cached research does not", () => {
  const old = structuredClone(fixture); delete old.aiOpportunities; delete old.marketResearch;
  assert.equal(lib.isPitchCritique(old), true);
  const unsafe = structuredClone(fixture); unsafe.marketResearch.sources[0].url = "javascript:alert(1)";
  assert.equal(lib.isPitchCritique(unsafe), false);
});

test("report cost metadata includes search calls, cache writes and cached token prices", () => {
  const usage = lib.pitchReportUsage({ model: "gpt-6.1-sol", usage: { input_tokens: 1000, output_tokens: 100,
    input_tokens_details: { cached_tokens: 300, cache_write_tokens: 400 } }, output: [...searched, ...searched] });
  assert.equal(usage.web_search_calls, 2);
  assert.equal(usage.estimated_report_cost_usd, 0.02263);
  assert.equal(usage.cost_scope, "report_and_research_only");
  assert.equal(lib.pitchReportUsage({ model: "custom-model", usage: { input_tokens: 10, output_tokens: 10 } }).estimated_report_cost_usd, null);
});

test("PDF contains the practical pilot, competitor comparison and source links", async t => {
  const { renderPitchPdf } = loadTs("src/lib/pitch-pdf.ts");
  const pdf = await renderPitchPdf({ companyName: "Tilly", sector: "Fintech", stage: "early revenue" },
    lib.parsePitchReport(response(fixture, searched)), "2026-10-03T15:00:00Z");
  let text;
  try { text = require("node:child_process").execFileSync("pdftotext", ["-", "-"], { input: pdf, encoding: "utf8" }); }
  catch (error) { if (error.code === "ENOENT") { t.skip("Install Poppler to check PDF text content."); return; } throw error; }
  assert.match(text, /Where AI could help your business/);
  assert.match(text, /twenty anonymised tickets/);
  assert.match(text, /Market and competitors/);
  assert.match(text, /Square/);
  assert.match(text, /squareup\.com/);
});

test("results display concrete AI steps and cited competitors while legacy reports remain usable", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ReportInsights } = loadTs("src/app/pitch/results/report-insights.tsx");
  const html = renderToStaticMarkup(React.createElement(ReportInsights, { critique: fixture }));
  assert.match(html, /twenty anonymised tickets/);
  assert.match(html, /Human check/);
  assert.match(html, /href="https:\/\/squareup\.com/);
  const old = { ...fixture, aiOpportunities: undefined, marketResearch: undefined };
  assert.equal(renderToStaticMarkup(React.createElement(ReportInsights, { critique: old })), "");
});
