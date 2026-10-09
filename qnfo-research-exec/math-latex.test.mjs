// MATH-LATEX-2 (#1891) offline test (node:sqlite as D1 shim, a Map as the R2 mirror, a stubbed QNFO_AI router).
// Proves: pseudoMathScan counts plain-text math (Unicode super/subscripts and operators, bare ^ and _ scripts, box-drawing
// lines) and ignores LaTeX, code, links, snake_case and the References list; every prompt that writes paper text carries
// the LaTeX rule; review turns plain-text math into a HARD gate-math-latex finding that goes to revise (no model call to
// decide it) and leaves a LaTeX paper alone; verify logs a math-scan event; in the default measure mode it still publishes;
// with ops_config research_math_gate=enforce the first failing pass goes back to revise and a second, math-only failing
// pass parks the row (no re-arm).
// Run: node qnfo-research-exec/math-latex.test.mjs   -> prints "math-latex tests passed"
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pseudoMathScan, stageReview, stageVerify } from "./worker.js";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

// 1. the scanner
const plain = "The rate is 10⁻⁴ with T₁ ≈ 5 us and E = E_g 8 d^3 per gate.";
assert.ok(pseudoMathScan(plain).count >= 5, "plain-text math counted: " + JSON.stringify(pseudoMathScan(plain)));
const latex = "The rate is $10^{-4}$ with $T_1 \\approx 5$ us and\n\n$$E = E_g 8 d^3$$\n\nper gate; see `file_name`, [x](https://x.org/a_b) and snake_case_name or x_train.";
assert.equal(pseudoMathScan(latex).count, 0, "LaTeX, code, links and snake_case are not counted: " + JSON.stringify(pseudoMathScan(latex)));
const refs = "# T\n\nBody $x$.\n\n## References\n\n[1] Qubit T₁ ≈ 10⁻⁴ limits. arXiv:2401.00001.\n";
assert.equal(pseudoMathScan(refs).count, 0, "the References list is not scanned");
assert.equal(pseudoMathScan("```\nx^2 + y_1 ≈ 3\n```\n").count, 0, "fenced code is not scanned");
assert.equal(pseudoMathScan("Text\n┌──┐\n└──┘\n").count, 2, "box-drawing lines outside a fence are counted");
assert.ok(pseudoMathScan(plain).samples.length > 0, "samples are returned for the fix text");

// 2. every prompt that writes paper text carries the rule
// PROMPT-CACHE-PREFIX-1 (#2116): the task instructions live in RESEARCH_SHARED_PREAMBLE under "### TASK <NAME>" headings.
const pre = (() => { const a = src.indexOf("var RESEARCH_SHARED_PREAMBLE = ["); return src.slice(a, src.indexOf("].join(", a)); })();
const block = (name) => { const tag = "### TASK " + name.replace(/_PROMPT$/, ""); const a = pre.indexOf('"' + tag + '"'); assert.ok(a >= 0, tag + " present"); const b = pre.indexOf('"### TASK ', a + tag.length + 2); return pre.slice(a, b < 0 ? undefined : b); };
for (const name of ["WRITER_PROMPT", "RECONCILE_PROMPT", "REVISE_PROMPT"]) assert.ok(/MATH_RULE/.test(block(name)), name + " carries MATH_RULE");
assert.ok(/LaTeX/.test(block("REVISE_PATCH_PROMPT")), "REVISE_PATCH_PROMPT asks for LaTeX in replacements");

// shims
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, context TEXT, source TEXT, claimed_at TEXT, attempt INTEGER DEFAULT 0, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);`);
function stmt(sql) {
  let args = [];
  const o = { bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return o; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; } };
  return o;
}
const r2 = new Map();
let routerCalls = 0;
const env = {
  QNFO_AUDIT: { prepare: stmt },
  MIRROR: { async put(k, v) { r2.set(k, String(v)); }, async get(k) { return r2.has(k) ? { async text() { return r2.get(k); } } : null; } },
  QNFO_AI: { async fetch(url, opts) {
    routerCalls++;
    const body = JSON.parse(opts.body);
    const p = body.messages[0].content;
    const content = /adversarial reviewer/.test(p) ? '{"verdict":"pass","hard":[],"soft":[]}' : "[]";
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  } },
  AI: { async run() { throw new Error("no Workers AI call expected in this test"); } }
};
const bib = "## Bibliography\n" + [1, 2, 3, 4, 5].map((n) => "[" + n + "] arXiv:2401.0000" + n + " | Work " + n).join("\n") + "\n";
const filler = "This section discusses the method in prose with no notation at all. ".repeat(130);
const mkPaper = (mathLine) => "# A Title\n\n## Abstract\n\n" + mathLine + "\n\n## 1. Introduction\n\n" + filler + " [1] [2] [3] [4] [5]\n\n## References\n\n" + [1, 2, 3, 4, 5].map((n) => "[" + n + "] Work " + n + ". arXiv:2401.0000" + n + ".").join("\n") + "\n";
const PSEUDO = mkPaper("We find T₁ ≈ 10⁻⁴ s and E = E_g 8 d^3 for code distance d.");
const CLEAN = mkPaper("We find $T_1 \\approx 10^{-4}$ s and $E = E_g 8 d^3$ for code distance $d$.");
const put = (id, paper) => { r2.set("pipeline/" + id + "/reconciled.md", paper); r2.set("pipeline/" + id + "/grounding.md", "# Grounding\n\n" + bib); };
const row = (id, ctx) => { db.prepare("INSERT OR REPLACE INTO research_queue (id, status, stage, context, source) VALUES (?, 'researching', ?, ?, 'remediation')").run(id, "x", JSON.stringify(ctx)); return db.prepare("SELECT * FROM research_queue WHERE id = ?").get(id); };
const get = (id) => db.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);
const events = (kind) => db.prepare("SELECT text, status FROM cloud_ops_events WHERE kind = ?").all(kind);

// 3. review: a model-passing review with plain-text math goes to revise with the deterministic HARD fix
put("r1", PSEUDO);
let out = await stageReview(env, row("r1", { cycles: 0 }));
assert.equal(out.stage, "review->revise", "plain-text math sends the paper to revise: " + JSON.stringify(out));
const fx = JSON.parse(r2.get("pipeline/r1/fixes.json"));
assert.ok(Array.isArray(fx) && fx.some((f) => f.id === "gate-math-latex" && f.severity === "HARD" && /\$10\^\{-4\}\$/.test(f.fix)), "fixes.json carries gate-math-latex with a LaTeX example");
put("r2", CLEAN);
out = await stageReview(env, row("r2", { cycles: 0 }));
assert.equal(out.stage, "review->verify", "a LaTeX paper passes review: " + JSON.stringify(out));

// 4. verify, default measure mode: logs math-scan (warn) and still publishes
put("v1", PSEUDO);
out = await stageVerify(env, row("v1", { cycles: 2, verifyPass: 1 }));
assert.equal(out.stage, "verify->publish", "measure mode publishes: " + JSON.stringify(out));
assert.ok(events("math-scan").some((e) => /row=v1 pseudo_math=\d+ mode=measure/.test(e.text) && e.status === "warn"), "math-scan warn event logged");
put("v2", CLEAN);
out = await stageVerify(env, row("v2", { cycles: 2 }));
assert.equal(out.stage, "verify->publish");
assert.ok(events("math-scan").some((e) => /row=v2 pseudo_math=0 /.test(e.text) && e.status === "ok"), "a clean paper logs an ok math-scan");

// 5. enforce mode: first failing pass -> revise; second math-only failing pass -> parked, not re-armed
db.prepare("INSERT INTO ops_config (key, value) VALUES ('research_math_gate', 'enforce')").run();
put("e1", PSEUDO);
out = await stageVerify(env, row("e1", { cycles: 2 }));
assert.equal(out.stage, "verify->revise", "enforce: first failing pass goes back to revise: " + JSON.stringify(out));
assert.ok(JSON.parse(r2.get("pipeline/e1/fixes.json")).some((f) => f.id === "gate-math-latex"));
put("e2", PSEUDO);
out = await stageVerify(env, row("e2", { cycles: 2, verifyPass: 1 }));
assert.ok(out.parked && out.stage === "verify", "enforce: second math-only failure parks: " + JSON.stringify(out));
const e2 = get("e2");
assert.equal(e2.stage, "parked"); assert.equal(e2.status, "wontfix"); assert.match(e2.error, /^PARKED-MATH-LATEX-2: \d+ plain-text math tokens/);
assert.equal(e2.recover_count, 0, "not re-armed");
assert.equal(events("math-park").length, 1);
put("e3", CLEAN);
out = await stageVerify(env, row("e3", { cycles: 2, verifyPass: 1 }));
assert.equal(out.stage, "verify->publish", "enforce: a LaTeX paper publishes");
assert.ok(routerCalls > 0, "the router stub served the review and extract calls");

console.log("math-latex tests passed");
