// INFRA-HANDOFF-1 offline suite: replays migrations/2026-10-26-infra-handoff.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, a BACKUP table that the file creates first, nothing deleted or dropped, decision_log only inserted into); issues 2596 and 2754 each keep
// their description and gain one dated handoff paragraph with a code-task line and a code-anchor line, and no other issue changes; each anchor occurs exactly once in the file the code-task line names (counted in
// this tree), so the ACT-BRIDGE-1 reader can place it; the appended text holds no word the code-loop planner refuses (PLAN_DENY_TEXT of qnfo-code-orchestrator, read from the worker source); the code-task path
// is a worker the code loop may plan; the previous descriptions are in the backup table; one decision_log row; a replay appends nothing; the Rollback line restores both descriptions.
// Output MUST contain "0 failed" on success.   node migrations/infra-handoff.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-infra-handoff.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(header.some((l) => /^-- BACKUP: bak_20261026_rem_a6_handoff_desc\s*$/.test(l)) && /CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_handoff_desc AS/.test(body), "the BACKUP table is named and created first");
ok(body.indexOf("CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_handoff_desc") < body.indexOf("UPDATE agent_issues"), "the backup is created before the first update");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT DEFAULT 'open', updated_at INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  for (const id of [2596, 2754, 2582, 999001]) w.prepare("INSERT INTO agent_issues (id, title, description, updated_at) VALUES (?, ?, ?, 1)").run(id, "t" + id, "ORIGINAL-" + id);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const w = world();
w.exec(sql);
const desc = (id) => q1(w, "SELECT description d, updated_at u FROM agent_issues WHERE id = ?", id);

const cases = [[2596, "qnfo-ops/worker.js"], [2754, "qnfo-deploy-guard/worker.js"]];
const PLAN_DENY_SRC = (/const PLAN_DENY_TEXT = \/(.*)\/i;/.exec(readFileSync(join(root, "qnfo-code-orchestrator/worker.js"), "utf8")) || [])[1];
ok(typeof PLAN_DENY_SRC === "string" && PLAN_DENY_SRC.length > 20, "PLAN_DENY_TEXT is read from the code orchestrator source", PLAN_DENY_SRC);
const planDeny = new RegExp(PLAN_DENY_SRC || "$^", "i");
for (const [id, path] of cases) {
  const d = desc(id).d;
  ok(d.startsWith("ORIGINAL-" + id + "\n\nREM-A6 2026-10-26 (handoff to the code loop, INFRA-HANDOFF-1)") && desc(id).u > 1 && (d.match(/REM-A6 2026-10-26 \(handoff to the code loop/g) || []).length === 1, id + ": keeps its description and gains one dated handoff paragraph", d.slice(0, 120));
  const ct = d.split("\n").filter((l) => /^code-task: /.test(l)), ca = d.split("\n").filter((l) => /^code-anchor: /.test(l));
  ok(ct.length === 1 && ct[0] === "code-task: repo=qnfo-workers path=" + path, id + ": one code-task line naming " + path, ct);
  ok(ca.length === 1 && ca[0].length > "code-anchor: ".length + 20, id + ": one code-anchor line", ca);
  const anchor = (ca[0] || "").replace(/^code-anchor: /, "");
  const file = readFileSync(join(root, path), "utf8");
  ok(anchor && file.split(anchor).length - 1 === 1, id + ": the anchor occurs exactly once in " + path + " of this tree", { anchor, n: file.split(anchor).length - 1 });
  const added = d.slice(("ORIGINAL-" + id).length);
  ok(!planDeny.test(added), id + ": the appended text holds no word the code-loop planner refuses", (planDeny.exec(added) || [])[0]);
  ok(added.length < 3000, id + ": the paragraph is under 3000 characters", added.length);
}
ok(/\[\[services\]\] binding GH_APP_BROKER to qnfo-fleet-control/.test(desc(2596).d) && /gh_app pat-fallback/.test(desc(2596).d) && /never a constant/.test(desc(2596).d), "2596: the change names the binding, the fallback and a /health that is not a constant");
ok(/tombstoneBody\(name\)/.test(desc(2754).d) && /DEPLOY-TICKET-AUTORESOLVE-1/.test(desc(2754).d) && /qnfo-artifacts/.test(desc(2754).d) && /voice-stt/.test(desc(2754).d), "2754: the change names the stub check and the four names that are not guard defects");
ok(desc(2582).d === "ORIGINAL-2582" && desc(999001).d === "ORIGINAL-999001", "an issue that is not named keeps its description");
{
  const bak = qa(w, "SELECT id, description FROM bak_20261026_rem_a6_handoff_desc ORDER BY id");
  ok(bak.length === 2 && bak.every((r) => r.description === "ORIGINAL-" + r.id), "the backup holds the two previous descriptions");
}
ok(qa(w, "SELECT * FROM decision_log").length === 1 && /^INFRA-HANDOFF-1: issues 2596 and 2754 each get/.test(q1(w, "SELECT action a FROM decision_log").a), "one decision_log row");

// replay appends nothing
{
  const before = JSON.stringify([desc(2596).d, desc(2754).d]);
  w.exec(sql);
  ok(JSON.stringify([desc(2596).d, desc(2754).d]) === before && qa(w, "SELECT * FROM decision_log").length === 1 && qa(w, "SELECT * FROM bak_20261026_rem_a6_handoff_desc").length === 2, "a replay appends nothing, adds no decision row and keeps the backup");
}
// rollback
{
  const rb = (header.find((l) => /^-- Rollback:/.test(l)) || "").replace(/^-- Rollback:\s*/, "");
  w.exec(rb);
  ok(desc(2596).d === "ORIGINAL-2596" && desc(2754).d === "ORIGINAL-2754", "the Rollback line restores both descriptions from the backup");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
