const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { loadTs } = require("./load-ts.cjs");
const { useSpeechRecognition } = loadTs("src/hooks/useSpeechRecognition.ts");

function result(text, isFinal = true) {
  return Object.assign([{ transcript: text }], { isFinal });
}

function setup(t) {
  const instances = [];
  class Recognition {
    constructor() { instances.push(this); }
    start() {}
    stop() {}
    abort() { this.aborted = true; }
    emit(results, resultIndex = 0) { this.onresult?.({ results, resultIndex }); }
    end() { this.onend?.(); }
  }
  global.window = { SpeechRecognition: Recognition };
  let hook;
  function Harness() { hook = useSpeechRecognition(); return null; }
  let root;
  act(() => { root = create(React.createElement(Harness)); });
  t.after(() => { act(() => root.unmount()); delete global.window; });
  return { get hook() { return hook; }, instances };
}

test("mobile growing/replayed final results replace previous text", async t => {
  const s = setup(t);
  act(() => s.hook.start());
  const r = s.instances[0];
  for (const text of ["we've", "we've run", "we've run a trial", "we've run a trial in one of their pubs"]) {
    act(() => r.emit([result(text)]));
    assert.equal(s.hook.transcript, text);
  }
  act(() => r.emit([result("we've run a trial in one of their pubs")]));
  let stopped;
  act(() => { stopped = s.hook.stop(); });
  act(() => r.end());
  assert.equal(await stopped, "we've run a trial in one of their pubs");
});

test("interim revisions and removed interim slots do not duplicate final text", t => {
  const s = setup(t);
  act(() => s.hook.start());
  const r = s.instances[0];
  act(() => r.emit([result("We ran a trial."), result("They are", false)]));
  act(() => r.emit([result("We ran a trial."), result("They are happy.", false)], 1));
  assert.equal(s.hook.transcript, "We ran a trial.");
  assert.equal(s.hook.interim, "They are happy.");
  act(() => r.emit([result("We ran a trial."), result("They are happy.")], 1));
  assert.equal(s.hook.transcript, "We ran a trial. They are happy.");
  assert.equal(s.hook.interim, "");
  act(() => r.emit([result("We ran a trial."), result("They are happy."), result("unused", false)], 2));
  act(() => r.emit([result("We ran a trial."), result("They are happy.")], 2));
  assert.equal(s.hook.interim, "");
});

test("separate result slots preserve genuinely repeated words", t => {
  const s = setup(t);
  act(() => s.hook.start());
  act(() => s.instances[0].emit([result("Very"), result("very important.")]));
  assert.equal(s.hook.transcript, "Very very important.");
});

test("Stop waits for last words and shares repeated stop calls", async t => {
  const s = setup(t);
  act(() => s.hook.start());
  const r = s.instances[0];
  act(() => r.emit([result("We ran", false)]));
  let first, second;
  act(() => { first = s.hook.stop(); second = s.hook.stop(); });
  assert.equal(first, second);
  act(() => r.emit([result("We ran a trial.")]));
  act(() => r.end());
  assert.equal(await first, "We ran a trial.");
  assert.equal(s.hook.listening, false);
});

test("Add more uses a fresh session and ignores old callbacks", async t => {
  const s = setup(t);
  act(() => s.hook.start());
  const first = s.instances[0];
  const staleResult = first.onresult;
  const staleEnd = first.onend;
  act(() => first.emit([result("First answer.")]));
  let stopped;
  act(() => { stopped = s.hook.stop(); });
  act(() => first.end());
  const firstAnswer = await stopped;
  act(() => { s.hook.hardReset(); s.hook.start(); });
  act(() => s.instances[1].emit([result("More detail.")]));
  act(() => {
    staleResult({ results: [result("OLD TEXT")], resultIndex: 0 });
    staleEnd();
  });
  assert.equal(s.hook.transcript, "More detail.");
  assert.equal(s.hook.listening, true);
  assert.equal(firstAnswer + " " + s.hook.transcript, "First answer. More detail.");
});

test("missing onend settles once and cannot pollute the next session", async t => {
  const s = setup(t);
  act(() => s.hook.start());
  const first = s.instances[0];
  act(() => first.emit([result("Last words", false)]));
  let stopped;
  act(() => { stopped = s.hook.stop(); });
  await act(async () => { assert.equal(await stopped, "Last words"); });
  assert.equal(first.aborted, true);
  act(() => s.hook.start());
  act(() => first.emit([result("OLD TEXT")]));
  assert.equal(s.hook.transcript, "");
  assert.equal(s.hook.listening, true);
});

test("natural speech end retains its transcript for Stop", async t => {
  const s = setup(t);
  act(() => s.hook.start());
  act(() => s.instances[0].emit([result("Finished naturally.")]));
  act(() => s.instances[0].end());
  let stopped;
  act(() => { stopped = s.hook.stop(); });
  assert.equal(await stopped, "Finished naturally.");
});

test("reset during Stop settles the old answer before clearing", async t => {
  const s = setup(t);
  act(() => s.hook.start());
  const first = s.instances[0];
  act(() => first.emit([result("Old answer.")]));
  let stopped;
  act(() => { stopped = s.hook.stop(); s.hook.hardReset(); s.hook.start(); });
  assert.equal(await stopped, "Old answer.");
  assert.equal(first.aborted, true);
  assert.equal(s.hook.transcript, "");
});
