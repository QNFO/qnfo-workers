// IPATENT-DRAFT-METERING-1 offline suite (qnfo-ipatent 3.13.0, agent_issues 2055 and 1903). The real fetch handler with a
// stubbed model and an in-memory qnfo-audit: every draft model call is one ai_call_counters row (worker qnfo-ipatent,
// purpose draft) keyed by day and model; a call that throws counts as an error; usage tokens are kept when the binding
// reports them; no AUDIT binding or a failing write never breaks a draft.
// Run: node qnfo-ipatent/draft-metering.test.mjs   (prints "N passed, 0 failed")
import { DatabaseSync } from "node:sqlite";
const W = (await import("./worker.js")).default;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const audit = new DatabaseSync(":memory:");
audit.exec("CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))");
const AUDIT = { prepare: (sql) => { let a = []; const q = { bind(...x) { a = x; return q; }, async run() { audit.prepare(sql).run(...a); return { success: true }; } }; return q; } };
const SECTIONS = "## 1. TITLE OF INVENTION\nHinge\n## 2. TECHNICAL FIELD\nFurniture\n## 3. BACKGROUND\nb\n## 4. SUMMARY\ns\n## 5. DETAILED DESCRIPTION\nd\n## 6. CLAIMS\n1. A hinge comprising a pin.\n## 7. ABSTRACT\na\n## 8. INVENTOR DECLARATION\ni\n";
let plan = [];   // per draft call: "ok" | "throw"
const calls = [];
const env = {
  IPATENT_DB: { prepare: stmt },
  AUDIT,
  AI: { run: async (model, opts) => {
    if (!opts || !opts.messages) return { data: [[0.1, 0.2]] };
    calls.push(model);
    const step = plan.shift() || "ok";
    if (step === "throw") throw new Error("3046: Request timeout");
    return { response: SECTIONS, usage: { prompt_tokens: 1200, completion_tokens: 800 } };
  } }
};
const ctx = { waitUntil() {} };
const post = async (e) => {
  const r = await W.fetch(new Request("https://ipatent.qnfo.org/api/draft", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Macintosh) Safari/605" }, body: JSON.stringify({ title: "Folding drawer hinge", description: "A drawer hinge with a torsion spring around a stainless pivot pin so the front folds flat against the cabinet side and closes itself." }) }), e, ctx);
  return { status: r.status, j: await r.json().catch(() => null) };
};
const rows = () => audit.prepare("SELECT * FROM ai_call_counters ORDER BY model").all();

let r = await post(env);
ok(r.status === 200 && calls.length === 1, "a draft succeeds on the first model", { status: r.status, calls });
let rs = rows();
ok(rs.length === 1 && rs[0].worker === "qnfo-ipatent" && rs[0].purpose === "draft" && rs[0].model === calls[0] && rs[0].calls === 1 && rs[0].errors === 0, "one ai_call_counters row: worker qnfo-ipatent, purpose draft, the model, 1 call, 0 errors", rs);
ok(rs[0].in_chars > 1000 && rs[0].in_tok === 1200 && rs[0].out_tok === 800 && rs[0].day === new Date().toISOString().slice(0, 10), "the row carries the prompt size, the reported tokens and today's day", rs[0]);
await post(env);
ok(rows()[0].calls === 2 && rows()[0].in_tok === 2400, "a second draft on the same model adds to the same row", rows()[0]);
calls.length = 0; plan = ["throw", "ok"];
r = await post(env);
rs = rows();
const first = rs.find((x) => x.model === calls[0]), second = rs.find((x) => x.model === calls[1]);
ok(r.status === 200 && calls.length === 2 && calls[0] !== calls[1], "a timeout on the first model falls through to the next", { status: r.status, calls });
ok(first && first.errors >= 1 && second && second.calls >= 1, "the failed call is counted as an error on its model, the fallback as a call on its own", rs);
const noAudit = Object.assign({}, env); delete noAudit.AUDIT;
ok((await post(noAudit)).status === 200, "no AUDIT binding: the draft still succeeds");
const badAudit = Object.assign({}, env, { AUDIT: { prepare() { throw new Error("D1 down"); } } });
ok((await post(badAudit)).status === 200, "a failing audit write never breaks the draft");
const h = await (await W.fetch(new Request("https://ipatent.qnfo.org/health"), env, ctx)).json();
ok(/^3\.(1[3-9]|[2-9]\d)\./.test(h.version), "VERSION is 3.13.0 or later (a minimum, not a pin)", h.version);
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
