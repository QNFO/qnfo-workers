// COMPANION-CONTROLS-REASON-1 offline suite: applies migrations/2026-10-19-companion-controls-reason.sql on SQLite (node:sqlite) over fixtures of control_registry,
// control_alternate_probes and blocker_redteam, and checks that the three companion stop controls get their recorded reason and a confirmed red-team row, that nothing else
// moves, that nothing is stamped as tested, that a replay changes nothing, and that the Rollback line restores the starting state.
// Run: node --no-warnings migrations/companion-controls-reason.test.mjs   (CCR_SKIP_MIGRATION=1 runs the same checks without the migration: they must fail).
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(process.env.CCR_MIGRATION || join(here, "2026-10-19-companion-controls-reason.sql"), "utf8");
const SKIP = process.env.CCR_SKIP_MIGRATION === "1";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const CTRL = ["companion-stall-close-gate", "companion-prune-repeat-stop", "companion-attempt-budget-stop"];
const world = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE control_registry (control TEXT PRIMARY KEY, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT);
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE blocker_redteam (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, claim TEXT, attempt TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('false-belief-removed', 'confirmed-with-evidence', 'workaround-built')), evidence TEXT NOT NULL, actor TEXT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), text_sig TEXT);
`);
  const ins = db.prepare("INSERT INTO control_registry (control, alternate_path, alternate_tested_at, evidence) VALUES (?, ?, ?, ?)");
  for (const c of CTRL) ins.run(c, "the previous behaviour is the revert of 1.37.0", null, "COMPANION-STALL-YIELD-1 2026-10-19: base evidence");
  ins.run("companion-starved-retry-cap", "the generation hours run whatever the cap reads", "2026-10-13T17:09:08Z", "an older control with a tested alternate");
  ins.run("a-probed-companion-control", "has a probe", null, "probed");
  db.exec("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('a-probed-companion-control', 'SELECT 1', 'x')");
  db.exec("INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor) VALUES ('control:model_floor_pr_check', 'c', 'a', 'confirmed-with-evidence', 'e | surfaces: x', 'other')");
  return db;
};
const snap = (db) => JSON.stringify([db.prepare("SELECT * FROM control_registry ORDER BY control").all(), db.prepare("SELECT * FROM blocker_redteam ORDER BY id").all()]);

// ---- 1. header ----
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+$/m.test(sql) && /^-- BACKUP: blocker_redteam$/m.test(sql), "the file opts in (APPLY-BY ci, DB qnfo-audit, one-line Rollback, BACKUP table)");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/\b\d+ ?(hours?|days?)\b/i.test(sql.replace(/\n-- Rollback:.*\n/, "\n")), "no claude.ai link and no SLA stated in hours or days");

// ---- 2. apply ----
const db = world();
const before = snap(db);
if (!SKIP) db.exec(sql);
const ev = (c) => db.prepare("SELECT evidence, alternate_tested_at FROM control_registry WHERE control = ?").get(c) || {};
ok(CTRL.every((c) => /ALTERNATE-NOT-EXERCISABLE \(COMPANION-CONTROLS-REASON-1/.test(ev(c).evidence || "") && (ev(c).evidence || "").startsWith("COMPANION-STALL-YIELD-1 2026-10-19: base evidence")), "each of the three controls keeps its evidence and gains the marker with its reason", CTRL.map((c) => ev(c).evidence));
ok(CTRL.every((c) => ev(c).alternate_tested_at === null), "alternate_tested_at is never stamped by hand");
ok(ev("companion-starved-retry-cap").evidence === "an older control with a tested alternate" && ev("a-probed-companion-control").evidence === "probed", "a control with a tested alternate and a control that has a probe are untouched");
const rt = db.prepare("SELECT * FROM blocker_redteam WHERE target LIKE 'control:companion-%' ORDER BY target").all();
ok(rt.length === 3 && JSON.stringify(rt.map((r) => r.target)) === JSON.stringify(CTRL.map((c) => "control:" + c).sort()), "one red-team row per control, target control:<name>", rt.map((r) => r.target));
ok(rt.every((r) => r.verdict === "confirmed-with-evidence" && /\| surfaces: /.test(r.evidence) && /^ALTERNATE-NOT-EXERCISABLE: /.test(r.claim) && r.actor === "session_01QpQv19uh1padRwZ3u1r766" && /^COMPANION-CONTROLS-REASON-1 2026-10-19/.test(r.attempt)), "each row is confirmed-with-evidence with a surfaces: line, the marker claim and this file's attempt label");
ok(db.prepare("SELECT COUNT(*) AS n FROM blocker_redteam").get().n === 4, "the unrelated red-team row stays (4 rows in all)");

// ---- 3. replay and Rollback ----
const once = snap(db);
if (!SKIP) db.exec(sql);
ok(snap(db) === once, "a second apply changes nothing");
const rb = (/^-- Rollback: (.+)$/m.exec(sql) || [])[1] || "";
ok(rb.length > 40 && !/\n/.test(rb), "the Rollback is one line");
if (!SKIP) db.exec(rb);
ok(snap(db) === before, "the Rollback restores the starting state, text for text");

console.log(pass + " passed, " + fail + " failed" + (SKIP ? " (pre-change run: failures are expected)" : ""));
process.exit(fail ? 1 : 0);
