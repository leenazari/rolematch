const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadTs } = require("./load-ts.cjs");

test("uploading a real one-page text PDF preserves the company and funding ask for extraction", async () => {
  const bytes = fs.readFileSync(path.join(__dirname, "fixtures/text-one-pager.pdf"));
  let modelInput = "";
  const { POST } = loadTs("src/app/api/extract-pitch/route.ts", {
    "@/lib/openai-json": { generateJson: async (_task, _instructions, text) => {
      modelInput = text;
      return { companyName: "LadleLedger QA", ask: "£320,000" };
    } },
  });
  const body = new FormData();
  body.set("file", new File([bytes], "one-pager.pdf", { type: "application/pdf" }));
  const res = await POST(new Request("https://example.test/api/extract-pitch", { method: "POST", body }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.match(modelInput, /LadleLedger QA/);
  assert.match(modelInput, /£320,000/);
});
