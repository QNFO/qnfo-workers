// BP26-CFAPI-1 offline suite: replays migrations/2026-10-26-bp26-cfapi.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped by the body); the two tables and three indexes exist with the columns scripts/bp26_cfapi.py
// writes; the source_of_truth of exactly the nine metrics names the real producer and keeps the trailing [BP26] tag (the framework writes only tagged metrics) and no other metric changes; the decision is
// logged once; a replay changes nothing; the Rollback line removes what the file made and returns the nine metrics to UNMEASURED.
// Output MUST contain "0 failed" on success.   node migrations/bp26-cfapi.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-cfapi.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

const NINE = ["deploys_via_gradual", "change_failure_rate", "mttr_rollback_min_p95", "gateway_coverage", "ai_cache_hit_rate", "dlq_depth", "duplicate_side_effects", "log_ingest_gb_month", "ci_gate_bypass_count"];
const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const world = () => {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, source_of_truth TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);`);
  for (const m of NINE) w.prepare("INSERT INTO metric_registry VALUES (?, 'to build [BP26]', NULL, NULL, 'UNMEASURED')").run(m);
  w.prepare("INSERT INTO metric_registry VALUES ('orphaned_leases', 'qnfo-audit.work_claims [BP26]', '0', '2026-10-26T19:00:00Z', 'MEASURED')").run();
  return w;
};
const names = (w, type) => w.prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' AND (name LIKE '%bp26%' OR name LIKE '%ci_gate%') ORDER BY name").all(type).map((r) => r.name);

const w = world();
w.exec(sql);
ok(names(w, "table").join() === "bp26_deploy_events,ci_gate_audit", "both tables exist", names(w, "table"));
ok(names(w, "index").join() === "idx_bp26_deploy_events_time,idx_bp26_deploy_events_worker,idx_ci_gate_audit_merged", "the three indexes exist", names(w, "index"));
const cols = (t) => w.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name).join();
ok(cols("bp26_deploy_events") === "deployment_id,worker,created_on,strategy,n_versions,min_pct,triggered_by,message,version_ids,seen_at", "bp26_deploy_events columns match the collector's INSERT", cols("bp26_deploy_events"));
ok(cols("ci_gate_audit") === "pr,merged_at,merge_sha,head_sha,required_state,missing,red,checked_at", "ci_gate_audit columns match the collector's INSERT", cols("ci_gate_audit"));
w.prepare("INSERT OR IGNORE INTO bp26_deploy_events (deployment_id, worker, created_on, strategy, n_versions, min_pct, triggered_by, message, version_ids, seen_at) VALUES ('d1','w','2026-10-26T19:00:00Z','percentage',1,100,'upload','m','v1','2026-10-26T19:05:00Z')").run();
w.prepare("INSERT OR IGNORE INTO bp26_deploy_events (deployment_id, worker, created_on, strategy, n_versions, min_pct, triggered_by, message, version_ids, seen_at) VALUES ('d1','w','2026-10-26T19:00:00Z','percentage',1,100,'upload','m','v1','2026-10-26T19:06:00Z')").run();
ok(w.prepare("SELECT COUNT(*) n FROM bp26_deploy_events").get().n === 1, "a deployment id is stored once");
w.prepare("INSERT OR REPLACE INTO ci_gate_audit (pr, merged_at, merge_sha, head_sha, required_state, missing, red, checked_at) VALUES (1,'2026-10-26T19:00:00Z','m','h','green','','','2026-10-26T19:05:00Z')").run();

const rows = w.prepare("SELECT metric, source_of_truth FROM metric_registry ORDER BY metric").all();
for (const m of NINE) {
  const r = rows.find((x) => x.metric === m);
  ok(r && /scripts\/bp26_cfapi\.py/.test(r.source_of_truth) && /\[BP26\]$/.test(r.source_of_truth), m + " names the producer and keeps the trailing [BP26] tag", r && r.source_of_truth.slice(-80));
}
ok(rows.find((x) => x.metric === "orphaned_leases").source_of_truth === "qnfo-audit.work_claims [BP26]", "no other metric's source_of_truth changes");
ok(w.prepare("SELECT COUNT(*) n FROM metric_registry WHERE last_value IS NOT NULL").get().n === 1, "the file writes no metric value");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-CFAPI-1:%'").get().n === 1, "the decision is logged once");

w.exec(sql);
ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1 && w.prepare("SELECT COUNT(*) n FROM bp26_deploy_events").get().n === 1 && w.prepare("SELECT COUNT(*) n FROM ci_gate_audit").get().n === 1, "a replay changes nothing");

w.exec(rollback);
ok(names(w, "table").length === 0 && names(w, "index").length === 0, "the Rollback line removes both tables and the three indexes", [names(w, "table"), names(w, "index")]);
ok(w.prepare("SELECT COUNT(*) n FROM metric_registry WHERE state = 'UNMEASURED' AND last_value IS NULL").get().n === 9 && w.prepare("SELECT last_value v FROM metric_registry WHERE metric = 'orphaned_leases'").get().v === "0", "the nine metrics are UNMEASURED again and orphaned_leases is untouched");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
