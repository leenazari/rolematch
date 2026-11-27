const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { check } = require("../scripts/check-public-secrets.cjs");
const { loadTs } = require("./load-ts.cjs");

test("deployment rejects a credential in public assets, rendered HTML or maps without echoing the value", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pitch-public-check-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const secret = "deliberate-test-sentinel-never-a-real-key";
  for (const artifact of ["public/asset.svg", ".next/static/chunks/app.js.map", ".next/server/app/pitch.rsc"]) {
    const file = path.join(dir, artifact);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "customer visible " + secret);
    assert.throws(() => check(dir, { RESEND_API_KEY: secret }), e => e.message.includes("Deployment stopped") && !e.message.includes(secret));
    fs.writeFileSync(file, "ordinary page content");
  }
  assert.throws(() => check(dir, { NEXT_PUBLIC_OPENAI_API_KEY: secret }), /NEXT_PUBLIC_/);
  assert.equal(check(dir, { OPENAI_API_KEY: secret }), 3);
});

test("production limits are shared across instances and use only a keyed network alias", async t => {
  const prev = { VERCEL: process.env.VERCEL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  t.after(() => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  process.env.VERCEL = "1"; process.env.SUPABASE_SECRET_KEY = "nonproduction-limiter-test";
  const calls = []; let dbResult = { data: true, error: null };
  const { checkUsage } = loadTs("src/lib/api-guard.ts", { "./pitch-storage": { pitchStorageClient: () => ({
    rpc: async (name, args) => { assert.equal(name, "consume_pitch_api_usage"); calls.push(args); return dbResult; },
  }) } });
  const request = extra => new Request("https://site.test/api/tts", {
    headers: { "x-vercel-forwarded-for": "192.0.2.5", "x-forwarded-for": extra },
  });
  await checkUsage(request("198.51.100.2"), "audio");
  await checkUsage(request("198.51.100.3"), "audio");
  assert.equal(calls[0].p_actor, calls[1].p_actor);
  assert.match(calls[0].p_actor, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(calls), /192\.0\.2|198\.51|nonproduction/);
  dbResult = { data: false, error: null };
  await assert.rejects(() => checkUsage(request(""), "audio"), e => e.status === 429 && e.retryAfter > 0);
  dbResult = { data: null, error: new Error("private provider diagnostic") };
  await assert.rejects(() => checkUsage(request(""), "audio"), e => e.status === 503 && !e.message.includes("diagnostic"));
});

test("storage errors cannot leak private provider diagnostics into a public PDF response or logs", async t => {
  const privateDiagnostic = "private-diagnostic-sentinel";
  const original = console.error; const logs = [];
  console.error = (...args) => logs.push(args);
  t.after(() => { console.error = original; });
  const { POST } = loadTs("src/app/api/generate-pitch-pdf/route.ts", {
    "@/lib/pitch-report-job": { validReportAccess: () => true, downloadSavedPitchPdf: async () => { throw new Error(privateDiagnostic); } },
  });
  const res = await POST(new Request("https://site.test/api/generate-pitch-pdf", { method: "POST", body: JSON.stringify({ reportId: "example", accessToken: "example" }) }));
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.ok(!(await res.text()).includes(privateDiagnostic));
  assert.ok(!JSON.stringify(logs).includes(privateDiagnostic));
});
