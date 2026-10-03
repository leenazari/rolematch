const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./load-ts.cjs");
const { createLiveTranscript, connectPitchLiveTranscript } = loadTs("src/lib/pitch-live-transcript.ts");

test("live words appear before completion and final events replace each item's preview", () => {
  const apply = createLiveTranscript();
  const delta = (id, text, event_id) => ({ type: "conversation.item.input_audio_transcription.delta", item_id: id, delta: text, event_id });
  const complete = (id, text) => ({ type: "conversation.item.input_audio_transcription.completed", item_id: id, transcript: text });
  assert.equal(apply(delta("first", "We ran", "one")), "We ran");
  assert.equal(apply(delta("first", " a trial", "two")), "We ran a trial");
  assert.equal(apply(delta("first", " a trial", "two")), null);
  assert.equal(apply(complete("first", "We ran a trial.")), "We ran a trial.");
  assert.equal(apply(complete("first", "We ran a trial.")), "We ran a trial.");
  assert.equal(apply(delta("first", "LATE WORDS", "three")), null);
  assert.equal(apply(delta("second", "Very very useful.", "four")), "We ran a trial. Very very useful.");
});

test("WebRTC uses the existing microphone, opens live text, and closes without stopping the recorder's track", async t => {
  const saved = { fetch: global.fetch, RTCPeerConnection: global.RTCPeerConnection };
  let peer, request, trackStopped = false;
  const track = { stop: () => { trackStopped = true; } };
  class Peer {
    constructor() { peer = this; this.channel = { readyState: "connecting", close() { this.closed = true; } }; }
    addTrack(value) { assert.equal(value, track); }
    createDataChannel() { return this.channel; }
    async createOffer() { return { type: "offer", sdp: "v=0\r\no=offer" }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    async setRemoteDescription(answer) {
      assert.equal(answer.sdp, "v=0\r\no=answer");
      this.channel.readyState = "open";
      this.channel.onopen();
    }
    close() { this.closed = true; }
  }
  global.RTCPeerConnection = Peer;
  global.fetch = async (url, options) => {
    request = { url, ...options };
    return { ok: true, json: async () => ({ ok: true, sdp: "v=0\r\no=answer" }) };
  };
  t.after(() => Object.assign(global, saved));
  const text = [], status = [];
  const live = connectPitchLiveTranscript({ getAudioTracks: () => [track] }, {
    companyName: "Tilly", onText: value => text.push(value), onStatus: value => status.push(value),
  });
  await live.ready;
  assert.deepEqual(status, ["connecting", "live"]);
  assert.equal(request.url, "/api/pitch-live-transcription");
  assert.equal(JSON.parse(request.body).companyName, "Tilly");
  const oldMessage = peer.channel.onmessage;
  oldMessage({ data: JSON.stringify({ type: "conversation.item.input_audio_transcription.delta", item_id: "one", delta: "We ran" }) });
  assert.deepEqual(text, ["We ran"]);
  live.close();
  oldMessage({ data: JSON.stringify({ type: "conversation.item.input_audio_transcription.delta", item_id: "one", delta: "OLD" }) });
  assert.deepEqual(text, ["We ran"]);
  assert.equal(peer.closed, true);
  assert.equal(request.signal.aborted, true);
  assert.equal(trackStopped, false);
});

test("live-session route negotiates only transcription and never returns the main API key", async t => {
  const key = process.env.OPENAI_API_KEY, originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "private-test-key";
  t.after(() => { global.fetch = originalFetch; if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; });
  let posted;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/realtime/calls");
    posted = options;
    return { ok: true, text: async () => "v=0\r\no=answer" };
  };
  const { POST } = loadTs("src/app/api/pitch-live-transcription/route.ts");
  const response = await POST({ url: "https://voicereach.io/api/pitch-live-transcription", headers: new Headers(),
    json: async () => ({ sdp: "v=0\r\no=offer", companyName: "Tilly" }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result, { ok: true, sdp: "v=0\r\no=answer" });
  assert.doesNotMatch(JSON.stringify(result), /private-test-key/);
  const session = JSON.parse(posted.body.get("session"));
  assert.equal(session.type, "transcription");
  assert.equal(session.audio.input.transcription.model, "gpt-live-transcribe");
  assert.deepEqual(session.audio.input.transcription.languages, ["en"]);
  assert.equal(session.audio.input.turn_detection, null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
