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
    sessionStorage: global.sessionStorage, fetch: global.fetch };
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
  const recorderHook = loadTs("src/hooks/usePitchAudioRecorder.ts");
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
  assert.match(root.root.findByType("textarea").props.placeholder, /after you press Stop/);
  await act(async () => button("Stop").props.onClick());
  assert.equal(root.root.findByType("textarea").props.value, "We ran a trial in one of their pubs.");
  await act(async () => button("Add more").props.onClick());
  await act(async () => button("Stop").props.onClick());
  const text = "We ran a trial in one of their pubs. They want five sites.";
  assert.equal(root.root.findByType("textarea").props.value, text);
  act(() => root.root.findByType("textarea").props.onChange({ target: { value: text + " Next month." } }));
  await act(async () => button("Send my answer").props.onClick());
  const posted = JSON.parse(requests.filter(request => request.url === "/api/pitch-next-question").at(-1).body);
  const answers = posted.history.filter(message => message.role === "user");
  assert.deepEqual(answers.map(answer => answer.text), [text + " Next month."]);
  assert.equal(transcriptions, 2);
});
