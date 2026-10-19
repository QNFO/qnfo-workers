// MODEL-FLOOR-GUARD-OBSERVABLE-1 step 2 offline suite: replays migrations/2026-10-19-model-floor-guard-probe.sql on SQLite.
// Proves: the probe row for model_floor_pr_check is written enabled; it reads a failing observed text for each missing piece (no run in 120 minutes, no key, status empty or
// http_403) and ok once the newest run carries status ok; a second apply changes nothing and keeps one decision_log row; the Rollback line removes only this row.
// Run: node migrations/model-floor-guard-probe.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-model-floor-guard-probe.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT, enabled INTEGER DEFAULT 1);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
  CREATE TABLE github_steward_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT, detail TEXT);
  INSERT INTO control_alternate_probes VALUES ('other', 'SELECT 1', 'keep', 1);`);
d.exec(sql);
const row = d.prepare("SELECT * FROM control_alternate_probes WHERE control = 'model_floor_pr_check'").get();
ok(row && row.enabled === 1 && /120 minutes/.test(row.window_note), "the probe row is written, enabled, with its window in minutes", row);
const mins = (m) => { const t = new Date(Date.now() - m * 60000).toISOString(); return t; };
const run = (startedMinAgo, detail) => d.prepare("INSERT INTO github_steward_runs (started_at, detail) VALUES (?, ?)").run(mins(startedMinAgo), JSON.stringify(detail));
const probe = () => d.prepare(row.probe_sql).get();

ok(/no run in 120 minutes/.test(probe().observed), "no steward run: failing text", probe());
run(200, { model_floor_guard: { status: "ok" } });
ok(/no run in 120 minutes/.test(probe().observed), "a run older than 120 minutes does not count", probe());
run(10, { main_rules: {} });
ok(/no model_floor_guard key/.test(probe().observed), "the newest run carries no key", probe());
run(10, { model_floor_guard: { status: "empty", runs: 0 } });
ok(/as empty/.test(probe().observed), "the steward read zero runs (the 0.7.2 state)", probe());
run(10, { model_floor_guard: { status: "http_403", runs: 0 } });
ok(/as http_403/.test(probe().observed), "a refusal is named", probe());
run(5, { model_floor_guard: { status: "ok", runs: 7, last_conclusion: "success" } });
ok(probe().expected === "ok" && probe().observed === "ok", "ok once the newest run read a completed run", probe());

d.exec(sql);
ok(d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1 && d.prepare("SELECT COUNT(*) AS n FROM control_alternate_probes").get().n === 2, "a second apply changes nothing");
d.exec(rollback);
ok(!d.prepare("SELECT 1 FROM control_alternate_probes WHERE control = 'model_floor_pr_check'").get() && d.prepare("SELECT 1 FROM control_alternate_probes WHERE control = 'other'").get(), "Rollback removes only this row");
console.log("model-floor-guard-probe: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
