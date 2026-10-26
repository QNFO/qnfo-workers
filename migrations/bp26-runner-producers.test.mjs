// BP26-PRODUCERS-1 offline suite: replays migrations/2026-10-26-bp26-runner-producers.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped by the body); the evidence table and its two indexes exist with the columns
// scripts/bp26_producers.py writes; the decision is logged once; a replay changes nothing; the Rollback line removes what the file made; decision_log is only inserted into.
// Output MUST contain "0 failed" on success.   node migrations/bp26-runner-producers.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-runner-producers.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const world = () => {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  return w;
};
const names = (w, type) => w.prepare("SELECT name FROM sqlite_master WHERE type = ? AND name LIKE '%bp26%' ORDER BY name").all(type).map((r) => r.name);

const w = world();
w.exec(sql);
ok(names(w, "table").join() === "bp26_probe_results", "the evidence table exists", names(w, "table"));
ok(names(w, "index").join() === "idx_bp26_probe_metric_time,idx_bp26_probe_subject", "both indexes exist", names(w, "index"));
const cols = w.prepare("PRAGMA table_info(bp26_probe_results)").all().map((c) => c.name).join();
ok(cols === "id,run_at,metric,subject,ok,detail,producer", "the columns scripts/bp26_producers.py writes", cols);
w.prepare("INSERT INTO bp26_probe_results (run_at, metric, subject, ok, detail, producer) VALUES ('2026-10-26T18:00:00Z', 'security_headers_pass', 'q08.org', 1, 'hsts nosniff referrer frame', 'collect_security_headers')").run();
const logged = w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-PRODUCERS-1:%'").get().n;
ok(logged === 1, "the decision is logged once", logged);

w.exec(sql);
ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1 && w.prepare("SELECT COUNT(*) n FROM bp26_probe_results").get().n === 1, "a replay changes nothing");

w.exec(rollback);
ok(names(w, "table").length === 0 && names(w, "index").length === 0, "the Rollback line removes the table and both indexes", [names(w, "table"), names(w, "index")]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
