// CONTROL-PROBE-AT-BIRTH-1 offline suite for migrations/2026-10-26-control-probe-at-birth.sql (agent_issues 1000214 follow-up). The file files one issue for the code loop
// (a registration check in scripts/apply_migrations.py) and logs one decision. This suite proves: exactly one open issue with a valid code-task, a code-anchor that occurs once in
// scripts/apply_migrations.py (or the fix has landed) and a code-probe on the marker that is not on main yet; the decision row is complete and holds no ' within '; a second apply changes
// nothing; the Rollback line removes the open issue and leaves the decision; the house rules hold (no vendor link, no secret, headers, LIKE patterns up to 50 bytes).
// Run: node --no-warnings migrations/control-probe-at-birth.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(process.env.CPAB_MIGRATION ? resolve(process.env.CPAB_MIGRATION) : here("2026-10-26-control-probe-at-birth.sql"), "utf8");
const script = readFileSync(here("../scripts/apply_migrations.py"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const code = sql.replace(/^--.*$/gm, "");
const SCHEMA = `
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
`;
const build = () => { const db = new DatabaseSync(":memory:"); db.exec(SCHEMA); db.exec(sql); return db; };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const db = build();
const iss = db.prepare("SELECT * FROM agent_issues").all();
ok(iss.length === 1 && iss[0].status === "open" && iss[0].priority === "medium" && iss[0].source === "session" && iss[0].category === "autonomy" && iss[0].title.startsWith("CONTROL-PROBE-AT-BIRTH-1: "), "exactly one open medium issue CONTROL-PROBE-AT-BIRTH-1 from source session", iss.length);
{
  const lines = iss[0].description.split("\n");
  const task = lines.find((l) => l.startsWith("code-task: ")), anchor = lines.find((l) => l.startsWith("code-anchor: ")), probe = lines.find((l) => l.startsWith("code-probe: "));
  ok(task === "code-task: repo=qnfo-workers path=scripts/apply_migrations.py", "the issue carries the code-task line on a line of its own", task);
  const a = anchor && anchor.slice("code-anchor: ".length), p = probe && JSON.parse(probe.slice("code-probe: ".length));
  const landed = !!p && script.includes(p.contains);
  ok(a && (landed || script.split(a).length - 1 === 1), "the code-anchor occurs exactly once in scripts/apply_migrations.py (or the fix has landed)", a && script.split(a).length - 1);
  ok(p && p.paths.length === 1 && p.paths[0] === "scripts/apply_migrations.py" && p.contains === "CONTROL-PROBE-AT-BIRTH-1", "the code-probe names the file and the marker the fix must carry", p);
  ok(/control_registry/.test(iss[0].description) && /control_alternate_probes/.test(iss[0].description) && /ALTERNATE-NOT-EXERCISABLE/.test(iss[0].description) && /CONTROL-PROBE: none/.test(iss[0].description) && /apply_migrations_test\.py/.test(iss[0].description) && /DOCTRINE-1/.test(iss[0].description), "the issue names the check, its three ways to pass, the test file and the register entry the gate needs");
  ok(/no-probe 103/.test(iss[0].description) && /18 untested without a probe, 85 stamped by hand/.test(iss[0].description), "the issue carries the measured register state");
}
const dl = db.prepare("SELECT * FROM decision_log").all();
const cols = ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"];
ok(dl.length === 1 && dl[0].actor === "rem-a3-drills" && dl[0].action.indexOf("CONTROL-PROBE-AT-BIRTH-1:") === 0 && cols.every((c) => typeof dl[0][c] === "string" && dl[0][c].trim().length > 3) && !cols.some((c) => / within /i.test(dl[0][c])), "one decision row fills all eleven columns and holds no ' within '", dl.length);
{
  const snap = (d) => JSON.stringify([d.prepare("SELECT * FROM agent_issues").all(), d.prepare("SELECT * FROM decision_log").all()]);
  const s1 = snap(db); let threw = null;
  try { db.exec(sql); } catch (e) { threw = String(e && e.message || e); }
  ok(threw === null && snap(db) === s1, "applying the file a second time changes nothing", threw);
  const d2 = build(); d2.exec(rollback);
  ok(one(d2, "SELECT COUNT(*) AS n FROM agent_issues").n === 0 && one(d2, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "the Rollback line removes the open issue and leaves the decision row");
  const d3 = build(); d3.exec("UPDATE agent_issues SET status = 'closed'"); d3.exec(rollback);
  ok(one(d3, "SELECT COUNT(*) AS n FROM agent_issues").n === 1, "a closed issue is not removed by the Rollback");
  const d4 = new DatabaseSync(":memory:"); d4.exec(SCHEMA); d4.exec("INSERT INTO agent_issues (title, status) VALUES ('CONTROL-PROBE-AT-BIRTH-1: filed by someone else', 'open')"); d4.exec(sql);
  ok(one(d4, "SELECT COUNT(*) AS n FROM agent_issues").n === 1, "an open issue of the same family that already exists is not duplicated");
}
{
  const test = readFileSync(here("control-probe-at-birth.test.mjs"), "utf8");
  const lits = [...code.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => Buffer.byteLength(m[1]));
  ok(lits.every((n) => n <= 50), "no LIKE or GLOB pattern over 50 bytes (D1 limit)", lits);
  ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /\n-- Rollback: [^\n]+\n/.test(sql), "the opt-in headers and a one-line Rollback are present");
  ok(!/^\s*(DROP|DELETE)\b/im.test(code), "no DELETE or DROP in the body (the delete is in the Rollback header only)");
  ok((code.match(/;\s*\n/g) || []).length === 2, "two statements end a line with a semicolon (the runner counts two)", (code.match(/;\s*\n/g) || []).length);
  ok(!/claude\.ai|anthropic\.com/i.test(sql + test) && !/(sk-|ghp_|xox[bp]-)[A-Za-z0-9]{10,}/.test(sql + test) && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql + test), "no vendor link, no secret value, no e-mail address");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
