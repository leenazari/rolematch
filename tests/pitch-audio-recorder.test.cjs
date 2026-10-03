const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { loadTs } = require("./load-ts.cjs");
const { usePitchAudioRecorder } = loadTs("src/hooks/usePitchAudioRecorder.ts");

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function setup(t, options = {}) {
  const instances = [], uploads = [], completed = [];
  let errors = 0, stoppedTracks = 0;
  class Recorder {
    static isTypeSupported(type) { return options.mp4 ? type === "audio/mp4" : type.includes("webm"); }
    constructor(stream, config) {
      this.mimeType = config.mimeType;
      this.state = "inactive";
      instances.push(this);
    }
    start() { this.state = "recording"; }
    chunk(text) { this.ondataavailable?.({ data: new Blob([text], { type: this.mimeType }) }); }
    stop() {
      this.state = "inactive";
      this.chunk("last words");
      this.onstop?.();
    }
  }
  const stream = { getTracks: () => [{ stop: () => { stoppedTracks++; } }] };
  const saved = { window: global.window, navigator: global.navigator, MediaRecorder: global.MediaRecorder, fetch: global.fetch };
  global.window = { MediaRecorder: Recorder };
  global.MediaRecorder = Recorder;
  Object.defineProperty(global, "navigator", { configurable: true, value: {
    mediaDevices: { getUserMedia: options.getUserMedia || (async () => stream) },
  } });
  global.fetch = async (url, request) => {
    uploads.push({ url, ...request });
    if (options.fetch) return options.fetch(uploads.length, request);
    return { ok: true, json: async () => ({ ok: true, text: uploads.length === 1 ? "We ran a trial in one of their pubs." : "They want five sites." }) };
  };
  let hook, root;
  function Harness() {
    hook = usePitchAudioRecorder({ onComplete: text => completed.push(text), onError: () => { errors++; } });
    return null;
  }
  act(() => { root = create(React.createElement(Harness)); });
  t.after(() => {
    act(() => root.unmount());
    for (const [key, value] of Object.entries(saved)) {
      Object.defineProperty(global, key, { configurable: true, writable: true, value });
    }
  });
  return { get hook() { return hook; }, instances, uploads, completed, stream,
    get errors() { return errors; }, get stoppedTracks() { return stoppedTracks; } };
}

test("Stop uploads the complete audio once, including its last chunk", async t => {
  const s = setup(t);
  await act(async () => { assert.equal(await s.hook.start("Tilly"), true); });
  assert.equal(s.hook.status, "recording");
  assert.equal(s.uploads.length, 0);
  act(() => s.instances[0].chunk("first words "));
  await act(async () => { s.hook.stop(); s.hook.stop(); });
  assert.equal(s.uploads.length, 1);
  assert.equal(await s.uploads[0].body.get("audio").text(), "first words last words");
  assert.equal(s.uploads[0].body.get("companyName"), "Tilly");
  assert.deepEqual(s.completed, ["We ran a trial in one of their pubs."]);
  assert.equal(s.hook.status, "idle");
  assert.ok(s.stoppedTracks > 0);
});

test("Add more captures a separate recording without replaying old audio", async t => {
  const s = setup(t);
  await act(async () => { await s.hook.start(); s.hook.stop(); });
  await act(async () => { await s.hook.start(); s.instances[1].chunk("second "); s.hook.stop(); });
  assert.deepEqual(s.completed, ["We ran a trial in one of their pubs.", "They want five sites."]);
  assert.equal(await s.uploads[1].body.get("audio").text(), "second last words");
});

test("failed transcription keeps the audio and Retry does not record again", async t => {
  const s = setup(t, { fetch: async count => count === 1
    ? { ok: false, json: async () => ({ ok: false, error: "Please retry." }) }
    : { ok: true, json: async () => ({ ok: true, text: "Recovered answer." }) } });
  await act(async () => { await s.hook.start(); s.hook.stop(); });
  assert.equal(s.hook.canRetry, true);
  assert.equal(s.hook.status, "error");
  await act(async () => { s.hook.retry(); s.hook.retry(); });
  assert.equal(s.instances.length, 1);
  assert.equal(s.uploads.length, 2);
  assert.equal(await s.uploads[0].body.get("audio").text(), await s.uploads[1].body.get("audio").text());
  assert.deepEqual(s.completed, ["Recovered answer."]);
  assert.equal(s.hook.canRetry, false);
});

test("Clear ignores a stale transcription response and aborts its request", async t => {
  const pending = deferred();
  const s = setup(t, { fetch: () => pending.promise });
  await act(async () => { await s.hook.start(); s.hook.stop(); });
  act(() => s.hook.reset());
  assert.equal(s.uploads[0].signal.aborted, true);
  await act(async () => { pending.resolve({ ok: true, json: async () => ({ ok: true, text: "OLD ANSWER" }) }); });
  assert.deepEqual(s.completed, []);
  assert.equal(s.hook.status, "idle");
});

test("cancelled permission request releases a microphone granted later", async t => {
  const permission = deferred();
  const s = setup(t, { getUserMedia: () => permission.promise });
  let starting;
  act(() => { starting = s.hook.start(); });
  act(() => s.hook.reset());
  await act(async () => { permission.resolve(s.stream); assert.equal(await starting, false); });
  assert.equal(s.instances.length, 0);
  assert.equal(s.stoppedTracks, 1);
});

test("blocked microphone produces an actionable error", async t => {
  const s = setup(t, { getUserMedia: async () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); } });
  await act(async () => { assert.equal(await s.hook.start(), false); });
  assert.match(s.hook.error, /Microphone access is blocked/);
  assert.equal(s.errors, 1);
  assert.equal(s.uploads.length, 0);
});

test("MP4-capable browsers upload the matching extension", async t => {
  const s = setup(t, { mp4: true });
  await act(async () => { await s.hook.start(); s.hook.stop(); });
  const file = s.uploads[0].body.get("audio");
  assert.equal(file.type, "audio/mp4");
  assert.equal(file.name, "answer.mp4");
});
