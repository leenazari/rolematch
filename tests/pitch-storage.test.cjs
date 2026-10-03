const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");

test("PDF storage is private, restricted to PDFs and uses only server credentials", async t => {
  const prior = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-server-key";
  t.after(() => {
    for (const [name, value] of [["SUPABASE_URL", prior.url], ["SUPABASE_SECRET_KEY", prior.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  let bucket, created, uploaded, options;
  const lib = loadTs("src/lib/pitch-storage.ts", { "@supabase/supabase-js": { createClient: (url, key, config) => {
    assert.equal(url, "https://test.supabase.co"); assert.equal(key, "test-server-key"); options = config;
    return { storage: {
      getBucket: async () => bucket ? { data: bucket } : { error: { message: "Bucket not found" } },
      createBucket: async (name, config) => { assert.equal(name, "pitch-reports"); created = config; bucket = config; return {}; },
      from: name => { assert.equal(name, "pitch-reports"); return { upload: async (path, bytes, config) => { uploaded = { path, bytes, config }; return {}; } }; },
    } };
  } } });
  const pdf = Buffer.from("%PDF-test");
  await lib.savePitchPdf("report/test.pdf", pdf);
  assert.equal(created.public, false);
  assert.deepEqual(created.allowedMimeTypes, ["application/pdf"]);
  assert.equal(options.auth.persistSession, false);
  assert.equal(options.auth.autoRefreshToken, false);
  assert.equal(uploaded.bytes, pdf);
  assert.equal(uploaded.config.contentType, "application/pdf");
  bucket.public = true;
  await assert.rejects(lib.savePitchPdf("report/test.pdf", pdf), /must be private/);
});

test("the shared PDF renderer produces a valid downloadable document", async () => {
  const { renderPitchPdf } = loadTs("src/lib/pitch-pdf.ts");
  const pdf = await renderPitchPdf({ companyName: "Tilly", sector: "Fintech", stage: "early revenue" }, {
    verdict: "Almost ready.", verdictCategory: "almost", strong: ["Customers pay."], weak: ["The closing pitch needs evidence."],
    fatalFlaw: null, sectorConcerns: [], revisedPitch: "Independent venue payments.", thirtyDayActions: [], vcQuestions: [], glossary: [],
  }, "2026-10-03T14:00:00Z");
  assert.ok(pdf.length > 5000);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.match(pdf.subarray(-50).toString(), /%%EOF/);
});
