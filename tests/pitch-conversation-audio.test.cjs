const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { loadTs } = require("./load-ts.cjs");

test("record, Stop, Add more, edit and Send pass one clean founder answer to the investor", async t => {
  const recordings = [], requests = [], storage = new Map([
    ["pitchperfect_data", JSON.stringify({ companyName: "Tilly" })],
  ]);
  const globals = { window: global.window, navigator: global.navigator, MediaRecorder: global.MediaRecorder,
    sessionStorage: global.sessionStorage, fetch: global.fetch, RTCPeerConnection: global.RTCPeerConnection };
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { recordings.push(this); this.state = "inactive"; this.mimeType = "audio/webm"; }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable({ data: new Blob(["spoken answer"], { type: "audio/webm" }) });
      this.onstop();
    }
  }
  global.window = { MediaRecorder: Recorder };
  global.MediaRecorder = Recorder;
  global.RTCPeerConnection = function () {};
  Object.defineProperty(global, "navigator", { configurable: true, value: { mediaDevices: {
    getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
  } } });
  global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  let transcriptions = 0;
  global.fetch = async (url, request) => {
    requests.push({ url, ...request });
    const result = url === "/api/transcribe-pitch-audio"
      ? { ok: true, text: ++transcriptions === 1 ? "We ran a trial in one of their pubs." : "They want five sites." }
      : { ok: true, text: "What customer evidence do you have?", questionNumber: 1, followUpsThisQuestion: 0 };
    return { ok: true, json: async () => result };
  };
  const router = { push() {} };
  let liveOptions;
  const recorderHook = loadTs("src/hooks/usePitchAudioRecorder.ts", {
    "@/lib/pitch-live-transcript": { connectPitchLiveTranscript: (stream, options) => {
      liveOptions = options;
      options.onStatus("live");
      return { ready: Promise.resolve(), close() {} };
    } },
  });
  const { default: Page } = loadTs("src/app/pitch/conversation/page.tsx", {
    "next/navigation": { useRouter: () => router },
    "@vercel/analytics": { track() {} },
    "@/hooks/usePitchAudioRecorder": recorderHook,
    "@/hooks/usePitchSpeechSynthesis": { usePitchSpeechSynthesis: () => ({
      speak: (text, done) => done(), speaking: false, stopSpeaking() {},
    }) },
    "@/components/VoiceOrb": () => null,
  });
  let root;
  await act(async () => { root = create(React.createElement(Page)); });
  t.after(() => {
    act(() => root.unmount());
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(global, key, { configurable: true, writable: true, value });
    }
  });
  const button = label => root.root.findAllByType("button").find(node => node.children.join("") === label);
  await act(async () => button("Start the conversation").props.onClick());
  await act(async () => root.root.findByType("video").props.onEnded());
  await act(async () => button("Tap to answer").props.onClick());
  assert.equal(recordings[0].state, "recording");
  assert.match(root.root.findByType("textarea").props.placeholder, /as you talk/);
  act(() => liveOptions.onText("We ran"));
  assert.equal(root.root.findByType("textarea").props.value, "We ran");
  act(() => liveOptions.onText("We ran a trial."));
  assert.equal(root.root.findByType("textarea").props.value, "We ran a trial.");
  await act(async () => button("Stop").props.onClick());
  assert.equal(root.root.findByType("textarea").props.value, "We ran a trial in one of their pubs.");
  await act(async () => button("Add more").props.onClick());
  act(() => liveOptions.onText("They want"));
  assert.equal(root.root.findByType("textarea").props.value, "We ran a trial in one of their pubs. They want");
  await act(async () => button("Stop").props.onClick());
  const text = "We ran a trial in one of their pubs. They want five sites.";
  assert.equal(root.root.findByType("textarea").props.value, text);
  act(() => root.root.findByType("textarea").props.onChange({ target: { value: text + " Next month." } }));
  await act(async () => button("Send my answer").props.onClick());
  const posted = JSON.parse(requests.filter(request => request.url === "/api/pitch-next-question").at(-1).body);
  const answers = posted.history.filter(message => message.role === "user");
  assert.deepEqual(answers.map(answer => answer.text), [text + " Next month."]);
  assert.equal(answers[0].questionNumber, 1);
  assert.equal(transcriptions, 2);
});

test("the screen waits for a reviewed closing answer and includes it in the stored report conversation", async t => {
  const storage = new Map([["pitchperfect_data", JSON.stringify({ companyName: "Tilly" })]]);
  const originals = { sessionStorage: global.sessionStorage, fetch: global.fetch };
  global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const { POST } = loadTs("src/app/api/pitch-next-question/route.ts", {
    "@/lib/anthropic": { HAIKU: "test", anthropic: { messages: { create: async () => ({
      content: [{ type: "text", text: JSON.stringify({ text: "The next topic?", moveOn: true, finished: false }) }],
    }) } } },
  });
  global.fetch = (url, request) => POST({ json: async () => JSON.parse(request.body) });
  const destinations = [], spoken = [];
  const router = { push: url => destinations.push(url) };
  const { default: Page } = loadTs("src/app/pitch/conversation/page.tsx", {
    "next/navigation": { useRouter: () => router }, "@vercel/analytics": { track() {} },
    "@/hooks/usePitchAudioRecorder": { usePitchAudioRecorder: () => ({ supported: false, status: "idle",
      liveText: "", liveStatus: "unavailable", reset() {} }) },
    "@/hooks/usePitchSpeechSynthesis": { usePitchSpeechSynthesis: () => ({
      speak: (text, done) => { spoken.push(text); done(); }, speaking: false, stopSpeaking() {},
    }) }, "@/components/VoiceOrb": () => null,
  });
  let root;
  await act(async () => { root = create(React.createElement(Page)); });
  t.after(() => {
    act(() => root.unmount());
    Object.assign(global, originals);
  });
  const button = label => root.root.findAllByType("button").find(node => node.children.join("") === label);
  async function answer(text) {
    await act(async () => button("Type my answer").props.onClick());
    act(() => root.root.findByType("textarea").props.onChange({ target: { value: text } }));
    await act(async () => button("Send my answer").props.onClick());
  }
  await act(async () => button("Start the conversation").props.onClick());
  await act(async () => root.root.findByType("video").props.onEnded());
  for (let number = 1; number <= 6; number++) await answer("Answer " + number);
  assert.ok(root.root.findAllByType("p").some(node => node.children.join("") === "Closing pitch · about 30 seconds"));
  assert.match(spoken.at(-1), /30-second pitch/);
  assert.deepEqual(destinations, []);
  assert.equal(storage.has("pitchperfect_conversation"), false);
  await act(async () => button("Type my answer").props.onClick());
  assert.equal(button("Send my answer").props.disabled, true);
  const closing = "Rising costs make this urgent. Funding builds the tools our paying customers need. Our integrated reporting makes us different.";
  act(() => root.root.findByType("textarea").props.onChange({ target: { value: closing } }));
  assert.deepEqual(destinations, []);
  await act(async () => button("Send my answer").props.onClick());
  assert.deepEqual(destinations, ["/pitch/results"]);
  const conversation = JSON.parse(storage.get("pitchperfect_conversation"));
  const answers = conversation.filter(message => message.role === "user");
  assert.equal(answers.length, 7);
  assert.deepEqual(answers.at(-1), { role: "user", text: closing, questionNumber: 7 });
  assert.match(conversation.at(-1).text, /Putting your feedback together now/);
});
