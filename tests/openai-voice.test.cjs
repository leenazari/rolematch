const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { loadTs } = require("./load-ts.cjs");

function setup(t) {
  const key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key-only";
  t.after(() => key === undefined ? delete process.env.OPENAI_API_KEY : process.env.OPENAI_API_KEY = key);
  const sessions = [];
  class Socket extends EventEmitter {
    socket = new EventTarget();
    constructor(options) { super(); this.options = options; sessions.push(this); }
    send(request) { this.request = request; }
    close() { this.closed = (this.closed || 0) + 1; }
  }
  const { POST } = loadTs("src/app/api/tts/route.ts", { "openai/realtime/websocket": { OpenAIRealtimeWebSocket: Socket } });
  function request(body, opts = {}) {
    return POST(new Request("https://example.test/api/tts", { method: "POST", body: JSON.stringify(body), ...opts }));
  }
  return { request, sessions };
}
test("OpenAI reads the prepared investor question and returns playable 24kHz mono WAV", async t => {
  const s = setup(t), text = "Why raise four million pounds now?";
  const pending = s.request({ text, persona: "investor" });
  await new Promise(resolve => setImmediate(resolve));
  const session = s.sessions[0];
  session.emit("session.created", {});
  const req = session.request.response;
  assert.equal(req.input[0].content[0].text, text);
  assert.deepEqual(req.output_modalities, ["audio"]);
  assert.equal(req.audio.output.voice, "cedar");
  assert.equal(req.audio.output.format.rate, 24_000);
  assert.ok(req.max_output_tokens < 2000);
  assert.match(req.instructions, /verbatim/);
  session.emit("response.output_audio.delta", { delta: Buffer.from([11, 0]).toString("base64") });
  session.emit("response.output_audio.delta", { delta: Buffer.from([12, 1]).toString("base64") });
  session.emit("response.done", { response: { status: "completed" } });
  const res = await pending, wave = Buffer.from(await res.arrayBuffer());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "audio/wav");
  assert.equal(wave.toString("ascii", 0, 4), "RIFF");
  assert.equal(wave.readUInt32LE(24), 24000);
  assert.equal(wave.readUInt32LE(40), 4);
  assert.deepEqual([...wave.subarray(44)], [11, 0, 12, 1]);
  assert.equal(session.closed, 1);
});
test("incomplete audio is discarded and cancelling a request closes the OpenAI connection", async t => {
  const s = setup(t);
  for (const reason of ["incomplete", "cancel"]) {
    const ctrl = new AbortController(), pending = s.request({ text: "Tell me about work." }, { signal: ctrl.signal });
    await new Promise(resolve => setImmediate(resolve));
    const socket = s.sessions.at(-1);
    socket.emit("session.created", {});
    assert.equal(socket.request.response.audio.output.voice, "marin");
    socket.emit("response.output_audio.delta", { delta: "AAAAAA==" });
    if (reason === "cancel") ctrl.abort();
    else socket.emit("response.done", { response: { status: "incomplete" } });
    assert.equal((await pending).status, 502);
    assert.equal(socket.closed, 1);
  }
});
test("invalid or cross-origin voice requests never open billable sessions", async t => {
  const s = setup(t);
  assert.equal((await s.request({ text: "   " })).status, 400);
  assert.equal((await s.request({ text: "a".repeat(3001) })).status, 400);
  assert.equal((await s.request({ text: "hi" }, { headers: { origin: "https://other.test" } })).status, 403);
  delete process.env.OPENAI_API_KEY;
  assert.equal((await s.request({ text: "hi" })).status, 503);
  assert.equal(s.sessions.length, 0);
});
