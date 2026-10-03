const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { loadTs } = require("./load-ts.cjs");
const numbers = loadTs("src/lib/pitch-spoken-numbers.ts");

test("pitch amounts are spoken fully in British English", () => {
  const cases = new Map([
    ["320,000", "three hundred and twenty thousand"],
    ["Is that £320,000?", "Is that three hundred and twenty thousand pounds?"],
    ["320000.", "three hundred and twenty thousand."],
    ["£320k", "three hundred and twenty thousand pounds"],
    ["£4m", "four million pounds"],
    ["£3.2m", "three million two hundred thousand pounds"],
    ["1.4%", "one point four per cent"],
    ["£49.99", "forty nine pounds and ninety nine pence"],
    ["£0.5", "fifty pence"],
    ["£0.01", "one penny"],
    ["£1.00", "one pound"],
    ["$2.50", "two dollars and fifty cents"],
    ["1,001 customers", "one thousand and one customers"],
    ["1,120 customers", "one thousand one hundred and twenty customers"],
    ["2 billion", "two billion"],
    ["-20%", "minus twenty per cent"],
  ]);
  for (const [input, expected] of cases) assert.equal(numbers.expandPitchSpokenNumbers(input), expected, input);
});

test("names, versions, phone numbers and URLs are not changed", () => {
  for (const input of ["B2B SaaS", "v2.5", "1.4.2", "07400123456", "https://example.com/320000", "pitch320000@example.com"]) {
    assert.equal(numbers.expandPitchSpokenNumbers(input), input);
  }
});

test("both the hosted voice request and browser fallback receive spoken words", async t => {
  const globals = { window: global.window, fetch: global.fetch, SpeechSynthesisUtterance: global.SpeechSynthesisUtterance };
  let body, utterance;
  global.window = { speechSynthesis: { cancel() {}, getVoices: () => [], speak: utter => { utterance = utter; } } };
  global.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  global.fetch = async (url, request) => { body = JSON.parse(request.body); return { ok: false }; };
  const { usePitchSpeechSynthesis } = loadTs("src/hooks/usePitchSpeechSynthesis.ts", { "@/lib/pitch-spoken-numbers": numbers });
  let hook, root;
  function Harness() { hook = usePitchSpeechSynthesis(); return null; }
  act(() => { root = create(React.createElement(Harness)); });
  t.after(() => { act(() => root.unmount()); Object.assign(global, globals); });
  await act(async () => { await hook.speak("Why do you need £320,000 at a 1.4% transaction fee?"); });
  const expected = "Why do you need three hundred and twenty thousand pounds at a one point four per cent transaction fee?";
  assert.equal(body.text, expected);
  assert.equal(utterance.text, expected);
});
