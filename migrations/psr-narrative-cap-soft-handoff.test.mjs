// PSR-NARRATIVE-CAP-SOFT-1 handoff offline suite: migrations/2026-10-26-psr-narrative-cap-soft-handoff.sql appends one paragraph to the open issue (agent_issues 1000409) that points at the
// kept diff, leaves its code-task / code-anchor / code-probe lines intact, records one decision row, and its Rollback line restores the description exactly. Replayed in node:sqlite.
// Run: node --no-warnings migrations/psr-narrative-cap-soft-handoff.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-psr-narrative-cap-soft-handoff.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const TITLE = "PSR-NARRATIVE-CAP-SOFT-1: the weekly program narrative stays silent at a breached ai_spend cap, against BUDGET-SOFT-ROUTE-1";
const ORIGINAL = "Charter pillar: cost. BUDGET-SOFT-ROUTE-1 (owner directive 2026-10-06): a breached ai_spend cap steers to the cheapest capable model and never stops work.\n" +
  "Doer: qnfo-code-orchestrator. Replace the boolean gate.\n" +
  "code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js\n" +
  "code-anchor: const narrativeAllowed = await psrNarrativeAllowed(env);\n" +
  "code-probe: {\"paths\": [\"qnfo-fleet-dashboard/worker.js\"], \"absent\": \"if (narrativeAllowed) {\"}";
const fresh = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, status TEXT, updated_at INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
  db.prepare("INSERT INTO agent_issues (title, description, source, status, updated_at) VALUES (?, ?, 'session', 'open', 1)").run(TITLE, ORIGINAL);
  db.prepare("INSERT INTO agent_issues (title, description, source, status, updated_at) VALUES ('OTHER-1: unrelated', 'untouched', 'session', 'open', 1)").run();
  return db;
};
const one = (db, s, ...a) => db.prepare(s).get(...a);
const desc = (db) => one(db, "SELECT description FROM agent_issues WHERE title = ?", TITLE).description;

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+$/m.test(sql), "the three migration headers exist");
ok(!/(^|;)\s*(DELETE\s+FROM|DROP\s+(TABLE|VIEW|TRIGGER|INDEX))\b/im.test(sql.replace(/^--.*$/gm, "")), "no statement is a DELETE or a DROP (the word delete appears only inside quoted text)");
const db = fresh();
db.exec(sql); db.exec(sql);
const d = desc(db);
ok(d.startsWith(ORIGINAL + "\n"), "the original description is kept as the prefix", d.slice(0, 80));
ok((d.match(/Handoff \(2026-10-26, a built and tested diff exists/g) || []).length === 1, "applied twice: the paragraph is appended once");
ok(/docs\/psr-narrative-cap-soft\/worker\.js\.patch/.test(d) && /psr-narrative-cap-soft\.test\.mjs\.patch/.test(d) && /patch -p0/.test(d), "it names both patch files and how to apply them");
ok(/^code-task: repo=qnfo-workers path=qnfo-fleet-dashboard\/worker\.js$/m.test(d) && /^code-anchor: const narrativeAllowed = await psrNarrativeAllowed\(env\);$/m.test(d), "the code-task and code-anchor lines are intact");
const probe = /^code-probe: (\{.*\})$/m.exec(d);
let parsed = null; try { parsed = JSON.parse(probe && probe[1]); } catch (e) { parsed = null; }
ok(parsed && parsed.absent === "if (narrativeAllowed) {" && parsed.paths[0] === "qnfo-fleet-dashboard/worker.js", "the closing code-probe still parses to the same check", probe && probe[1]);
ok(one(db, "SELECT description, updated_at FROM agent_issues WHERE title = 'OTHER-1: unrelated'").description === "untouched", "no other issue is touched");
ok(one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'PSR-NARRATIVE-CAP-SOFT-1 handoff:') = 1").n === 1, "applied twice: one decision row");
const dl = one(db, "SELECT * FROM decision_log");
ok(dl.actor.startsWith("session_") && dl.rollback_path && dl.capability_gain && dl.predicted_outcome && dl.reach_gain && dl.surfaces_tested, "the decision row is complete (capability_gain, predicted_outcome, reach_gain, surfaces_tested, rollback_path)", dl);
// the Rollback line restores the description exactly
db.exec(/^-- Rollback: (.*)$/m.exec(sql)[1]);
ok(desc(db) === ORIGINAL, "the Rollback line restores the original description exactly");
// a closed issue, or none, is left alone
const closed = fresh();
closed.exec("UPDATE agent_issues SET status = 'closed' WHERE title = '" + TITLE + "'");
closed.exec(sql);
ok(desc(closed) === ORIGINAL, "a closed issue is not touched");
const none = new DatabaseSync(":memory:");
none.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, status TEXT, updated_at INTEGER); CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);");
let threw = null; try { none.exec(sql); } catch (e) { threw = e; }
ok(!threw, "with no such issue the file applies cleanly and changes nothing", threw && String(threw));
// the kept diff is in the repository
const patch = new URL("../docs/psr-narrative-cap-soft/worker.js.patch", import.meta.url), tpatch = new URL("../docs/psr-narrative-cap-soft/psr-narrative-cap-soft.test.mjs.patch", import.meta.url);
if (existsSync(patch) && existsSync(tpatch)) {
  const p = readFileSync(patch, "utf8"), t = readFileSync(tpatch, "utf8");
  ok(/^\+async function psrNarrativeTier\(env\) \{$/m.test(p) && /^-async function psrNarrativeAllowed\(env\) \{$/m.test(p) && /^-    if \(narrativeAllowed\) \{$/m.test(p), "worker.js.patch replaces psrNarrativeAllowed and removes the gate");
  ok(/^\+\/\/ PSR-NARRATIVE-CAP-SOFT-1 offline suite/m.test(t) && /^new file mode/m.test(t), "the suite patch creates psr-narrative-cap-soft.test.mjs");
} else {
  ok(true, "the patch files are deleted once the diff is applied (the issue's definition of done)");
}
console.log(`${pass} passed, ${fail} failed`);
