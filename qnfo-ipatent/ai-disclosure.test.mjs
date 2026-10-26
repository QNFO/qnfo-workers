// BP26-AI-LABEL-1 offline suite (qnfo-ipatent 3.19.0): EU AI Act Art. 50(1) requires that a person using an AI system is told so at
// the latest at the first interaction. The drafting page says, on its first screen, that iPatent is an AI system and that an AI language
// model writes the draft. Run: node qnfo-ipatent/ai-disclosure.test.mjs   (prints "N passed, 0 failed")
const W = (await import("./worker.js")).default;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const env = { IPATENT_DB: { prepare: stmt } };
const ctx = { waitUntil() {} };
for (const path of ["/?v=2", "/?v=1"]) {
  const r = await W.fetch(new Request("https://ipatent.qnfo.org" + path, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) Safari/605" } }), env, ctx);
  const page = await r.text();
  const body = page.slice(page.indexOf("<body"));
  const text = body.slice(0, body.indexOf("<script>") > 0 ? body.indexOf("<script>") : undefined).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  ok(r.status === 200, path + " answers 200", r.status);
  ok(/iPatent is an AI system/.test(text.slice(0, 2500)), path + ": the first screen says iPatent is an AI system", text.slice(0, 600));
  ok(/AI language model writes the draft/.test(text), path + ": it says an AI language model writes the draft");
}
console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
