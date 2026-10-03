const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");

function setup(t, outcome = { text: "We ran a trial in one of their pubs." }) {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  t.after(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; });
  let calls = [];
  class OpenAI {
    constructor() { this.audio = { transcriptions: { create: async request => {
      calls.push(request);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    } } }; }
  }
  const route = loadTs("src/app/api/transcribe-pitch-audio/route.ts", {
    openai: { __esModule: true, default: OpenAI, toFile: async (bytes, name, options) => ({ bytes, name, ...options }) },
  });
  function request(file = new Blob(["audio bytes"], { type: "audio/webm;codecs=opus" }), headers = {}) {
    const form = new FormData();
    if (file) form.append("audio", file, "ignored-filename");
    form.append("companyName", "Tilly");
    return { url: "https://voicereach.io/api/transcribe-pitch-audio", headers: new Headers(headers), formData: async () => form };
  }
  return { route, calls, request };
}

test("transcribes the actual audio with English and company vocabulary", async t => {
  const s = setup(t);
  const response = await s.route.POST(s.request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, text: "We ran a trial in one of their pubs." });
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].model, "gpt-4o-transcribe");
  assert.equal(s.calls[0].language, "en");
  assert.match(s.calls[0].prompt, /Tilly/);
  assert.equal(s.calls[0].file.name, "answer.webm");
  assert.equal(s.calls[0].file.bytes.toString(), "audio bytes");
});

test("rejects missing, empty, oversized, unsupported, and cross-origin audio before billing", async t => {
  const s = setup(t);
  for (const [request, expected] of [
    [s.request(null), 400],
    [s.request(new Blob([], { type: "audio/webm" })), 400],
    [s.request(new Blob([new Uint8Array(3_500_001)], { type: "audio/webm" })), 413],
    [s.request(new Blob(["bad"], { type: "image/jpeg" })), 415],
    [s.request(undefined, { origin: "https://other.example" }), 403],
    [s.request(undefined, { "content-length": "4500000" }), 413],
  ]) assert.equal((await s.route.POST(request)).status, expected);
  assert.equal(s.calls.length, 0);
});

test("empty speech and missing configuration return recoverable errors", async t => {
  const s = setup(t, { text: "  " });
  assert.equal((await s.route.POST(s.request())).status, 422);
  delete process.env.OPENAI_API_KEY;
  assert.equal((await s.route.POST(s.request())).status, 503);
});

test("upstream errors do not expose credentials or internal details", async t => {
  const s = setup(t, new Error("secret internal content"));
  const response = await s.route.POST(s.request());
  assert.equal(response.status, 502);
  assert.doesNotMatch(JSON.stringify(await response.json()), /secret internal/);
});
