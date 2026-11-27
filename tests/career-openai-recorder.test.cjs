const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { loadTs } = require("./load-ts.cjs");

test("career uses the shared OpenAI recorder; add-more and edited text are sent exactly once", async t => {
  const saved = { sessionStorage: global.sessionStorage, fetch: global.fetch };
  const cv = { name: "Alex Example", lovedSkills: [], avoidSkills: [] };
  global.sessionStorage = { getItem: k => k === "rolematch_cv" ? JSON.stringify(cv) : null, setItem() {} };
  let callbacks, recorded = 0;
  const posts = [];
  global.fetch = async (url, opts) => {
    assert.equal(url, "/api/next-question");
    posts.push(JSON.parse(opts.body));
    return { json: async () => ({ ok: true, text: "Which parts of your job do you enjoy?", questionNumber: 1, followUpsThisQuestion: 0 }) };
  };
  const router = { push() {} };
  const { default: Page } = loadTs("src/app/conversation/page.tsx", {
    "next/navigation": { useRouter: () => router },
    "@/components/VoiceOrb": () => null,
    "@/hooks/useSpeechSynthesis": { useSpeechSynthesis: () => ({ speaking: false, speak: (_text, done) => done(), stopSpeaking() {} }) },
    "@/hooks/useInterviewRecorder": { useInterviewRecorder: (options, kind) => {
      assert.equal(kind, "career");
      callbacks = options;
      return { supported: true, status: "idle", liveText: "Preview words", liveStatus: "live",
        start: async () => true, stop: () => callbacks.onComplete(++recorded === 1 ? "I train my team." : "I plan the rota."), reset() {} };
    } },
  });
  let root;
  const button = label => root.root.findAllByType("button").find(b => b.children.join("") === label);
  await act(async () => { root = create(React.createElement(Page)); });
  t.after(() => { act(() => root.unmount()); Object.assign(global, saved); });
  await act(async () => button("Start the conversation").props.onClick());
  await act(async () => root.root.findByType("video").props.onEnded());
  for (const label of ["Tap to answer", "Add more"]) {
    await act(async () => button(label).props.onClick());
    assert.ok(root.root.findAllByType("p").some(p => p.children.join("").includes("Preview words")));
    await act(async () => button("Stop").props.onClick());
  }
  const textarea = root.root.findByType("textarea");
  assert.equal(textarea.props.value, "I train my team. I plan the rota.");
  act(() => textarea.props.onChange({ target: { value: "I coach ten colleagues and plan their rota." } }));
  await act(async () => button("Send my answer").props.onClick());
  assert.deepEqual(posts.at(-1).history.filter(i => i.role === "user").map(i => i.text),
    ["I coach ten colleagues and plan their rota."]);
});
