// IPATENT-COST-PER-DRAFT-1 offline suite (qnfo-ipatent 3.17.0, agent_issues 1903 and 2055). The real fetch handler with a
// stubbed model and an in-memory qnfo-audit: a completed draft writes one draft-done row, a mechanism-card call is metered
// as purpose mechanism, GET /api/cost reports the measured cost per completed draft at the published neuron rate and sets
// no price, and a missing or failing ledger answers 503 without breaking anything else.
// Run: node qnfo-ipatent/cost.test.mjs   (prints "N passed, 0 failed")
import { DatabaseSync } from "node:sqlite";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const W = (await import("./worker.js")).default;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const audit = new DatabaseSync(":memory:");
audit.exec("CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))");
const AUDIT = { prepare: (sql) => { let a = []; const q = { bind(...x) { a = x; return q; }, async run() { audit.prepare(sql).run(...a); return { success: true }; }, async all() { return { results: audit.prepare(sql).all(...a) }; }, async first() { return audit.prepare(sql).get(...a) || null; } }; return q; } };
const SECTIONS = "## 1. TITLE OF INVENTION\nHinge\n## 2. TECHNICAL FIELD\nFurniture\n## 3. BACKGROUND\nb\n## 4. SUMMARY\ns\n## 5. DETAILED DESCRIPTION\nd\n## 6. CLAIMS\n1. A hinge comprising a pin.\n## 7. ABSTRACT\na\n## 8. INVENTOR DECLARATION\ni\n";
const CARD = JSON.stringify({ what_it_is: "A hinge with a pin and a torsion spring.", what_it_does: "Closes the drawer front by itself.", how_it_works: "Spring torque pushes the leaves closed." });
let plan = [];
const env = {
  IPATENT_DB: { prepare: stmt },
  AUDIT,
  AI: { run: async (model, opts) => {
    if (!opts || !opts.messages) return { data: [[0.1, 0.2]] };
    if ((plan.shift() || "ok") === "throw") throw new Error("3046: Request timeout");
    const mech = /mechanism card as JSON/.test(opts.messages[1].content);
    return { response: mech ? CARD : SECTIONS, usage: { prompt_tokens: 1000, completion_tokens: 2000, neurons: mech ? 20 : 180 } };
  } }
};
const ctx = { waitUntil() {} };
const UA = "Mozilla/5.0 (Macintosh) Safari/605";
const DESC = "A drawer hinge with a torsion spring around a stainless pivot pin so the front folds flat against the cabinet side and closes itself.";
const call = async (path, body, e) => {
  const init = { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "User-Agent": UA } };
  if (body) init.body = JSON.stringify(body);
  const r = await W.fetch(new Request("https://ipatent.qnfo.org" + path, init), e || env, ctx);
  return { status: r.status, j: await r.json().catch(() => null) };
};
const rows = (p) => audit.prepare("SELECT * FROM ai_call_counters WHERE purpose = ?").all(p);

let r = await call("/api/cost");
ok(r.status === 200 && r.j.ok && r.j.drafts_completed === 0 && r.j.cost_per_draft_usd === null, "an empty ledger reports no drafts and no cost per draft", r);

r = await call("/api/mechanism", { title: "Folding drawer hinge", description: DESC });
ok(r.status === 200 && r.j.mechanism, "the mechanism card is read", r.status);
let m = rows("mechanism");
ok(m.length === 1 && m[0].worker === "qnfo-ipatent" && m[0].calls === 1 && m[0].errors === 0 && m[0].neurons === 20 && m[0].in_chars > 100, "the mechanism call is metered as purpose mechanism", m);

r = await call("/api/draft", { title: "Folding drawer hinge", description: DESC });
ok(r.status === 200, "a draft succeeds", r.status);
let d = rows("draft-done");
ok(d.length === 1 && d[0].calls === 1 && d[0].in_tok === 0 && d[0].neurons === 0, "a completed draft writes one draft-done row with no tokens", d);
ok(rows("draft").length === 1 && rows("draft")[0].neurons === 180, "the draft model call keeps its own row and its neurons", rows("draft"));

plan = ["throw", "ok"];
r = await call("/api/draft", { title: "Folding drawer hinge", description: DESC });
ok(r.status === 200 && rows("draft-done")[0].calls === 2, "a draft that needed a fallback model still counts once as completed", rows("draft-done"));

r = await call("/api/cost");
const c = r.j;
ok(r.status === 200 && c.drafts_completed === 2 && c.model_calls === 4 && c.model_errors === 1, "cost counts 2 completed drafts, 4 model calls and 1 error", c);
ok(c.neurons === 380 && Math.abs(c.usd - 380 * 0.011 / 1000) < 1e-9 && Math.abs(c.cost_per_draft_usd - c.usd / 2) < 1e-6 && c.neurons_per_draft === 190, "cost per draft is neurons at the published rate over completed drafts", c);
ok(c.neuron_usd_per_1000 === 0.011 && /developers\.cloudflare\.com\/workers-ai\/platform\/pricing/.test(c.price_source), "the rate and its source are stated");
ok(c.by_purpose.some((x) => x.purpose === "mechanism") && c.by_purpose.some((x) => x.purpose === "draft") && !c.by_purpose.some((x) => x.purpose === "draft-done"), "the breakdown lists model purposes only", c.by_purpose);
ok(!("price" in c) && !("price_floor" in c) && /not a price/.test(c.note), "the route reports a cost and sets no price");
ok(!/hinge|drawer|spring/i.test(JSON.stringify(c)), "no draft text reaches the cost route");

const noAudit = Object.assign({}, env); delete noAudit.AUDIT;
ok((await call("/api/cost", null, noAudit)).status === 503, "no ledger binding: 503");
ok((await call("/api/mechanism", { title: "Folding drawer hinge", description: DESC }, noAudit)).status === 200, "no ledger binding: the mechanism card still works");
const badAudit = Object.assign({}, env, { AUDIT: { prepare() { throw new Error("D1 down"); } } });
r = await call("/api/cost", null, badAudit);
ok(r.status === 503 && !/D1 down/.test(JSON.stringify(r.j)), "a failing ledger: 503 with no internal error text", r);
ok((await call("/api/draft", { title: "Folding drawer hinge", description: DESC }, badAudit)).status === 200, "a failing ledger never breaks a draft");

// The admin route still accepts its token and refuses a wrong one (constant-time comparison, same accepted key).
const adm = async (tok) => (await W.fetch(new Request("https://ipatent.qnfo.org/api/disclosures", { headers: tok === null ? {} : { "X-Admin-Token": tok } }), Object.assign({}, env, { IPATENT_ADMIN_TOKEN: "k-123" }), ctx)).status;
ok(await adm("k-123") !== 404 && await adm("k-124") === 404 && await adm("k-12") === 404 && await adm("") === 404 && await adm(null) === 404, "the admin token is still accepted and a wrong, short, empty or missing one is refused");

const h = await call("/health");
ok(versionAtLeast(h.j.version, "3.17.0") && h.j.capabilities.includes("cost-per-draft"), "VERSION is 3.17.0 or later and health names cost-per-draft", h.j.version);
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
