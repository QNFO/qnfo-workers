// DEPLOY-ALL-MERGES-1 / MERGE-RELIABILITY-1 / ISSUE-AGE-24H-1 offline suite: replays migrations/2026-10-20-deploy-all-merges.sql on SQLite.
// Proves: v_issue_age_ladder names the doer (code-task line, live code task, live claim) and the rung, and breach = 1 only for an issue older
// than 24 h with none; a fleet_tick insert refreshes the four metrics, re-arms a not-code verdict older than 24 h once (planned_at before the
// recheck line, the old value kept in issue_age_replans) and never an untrusted one or a recent one; issue_age_replan = off stops it;
// v_merge_reliability reads the goal-level merge share, unmerged pull requests over 120 minutes and workers behind main over 60 minutes;
// a second apply changes nothing; the Rollback line removes what the file added.
// Run: node migrations/deploy-all-merges.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-20-deploy-all-merges.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT, pr_url TEXT, pr_opened_at TEXT, merged_at TEXT, deployed_at TEXT, updated_at TEXT);
  CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, issue_id INTEGER, released_at TEXT, expires_at TEXT);
  CREATE TABLE issue_plans (issue_id INTEGER PRIMARY KEY, planned_at TEXT NOT NULL, outcome TEXT NOT NULL, detail TEXT);
  CREATE TABLE deploy_drift_cf (dir TEXT PRIMARY KEY, worker TEXT, state TEXT, drift_since TEXT);
  CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, expected_cadence_h INTEGER, status TEXT, precondition TEXT, action TEXT, escalate_to TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const H = 3600000, now = Date.now(), isoAgo = (h) => new Date(now - h * H).toISOString().slice(0, 19) + "Z";
const issue = (id, ageH, desc, src) => d.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, ?, 'medium', 'open', ?, ?)").run(id, "T-" + id + ": x", desc || "", src || "qnfo-fleet-control", now - ageH * H, now - ageH * H);
const plan = (id, outcome, agoH) => d.prepare("INSERT INTO issue_plans VALUES (?, ?, ?, 'reason')").run(id, isoAgo(agoH), outcome);
issue(1, 30, "fix it\ncode-task: repo=qnfo-workers path=a/worker.js");  // code-task line
issue(2, 30); d.prepare("INSERT INTO code_tasks VALUES ('t2', '[issue #2] goal', 'queued', NULL, NULL, NULL, NULL, ?)").run(isoAgo(1)); // live task
issue(3, 30); d.prepare("INSERT INTO work_claims (path, issue_id, released_at, expires_at) VALUES ('issue:3', 3, NULL, ?)").run(new Date(now + H).toISOString());
issue(4, 30); plan(4, "not-code", 26);   // breach, re-armed
issue(5, 30); plan(5, "untrusted", 26);  // breach, not re-armed
issue(6, 30); plan(6, "not-code", 2);    // breach, verdict too recent to re-arm
issue(7, 10); plan(7, "not-code", 9);    // 8h rung, no breach
issue(8, 1);
issue(9, 30); d.prepare("INSERT INTO code_tasks VALUES ('t9', '[issue #9] goal', 'failed', NULL, NULL, NULL, NULL, ?)").run(isoAgo(1)); // a failed task is no doer
// merge reliability: goal A merged, goal B never merged (PR 5 h old, still open), goal C opened 30 minutes ago (excluded), goal D re-proposed then merged
const ct = (id, goal, status, prAgoH, mergedAgoH) => d.prepare("INSERT INTO code_tasks VALUES (?, ?, ?, ?, ?, ?, NULL, ?)").run(id, goal, status, prAgoH == null ? null : "https://x/pull/" + id, prAgoH == null ? null : isoAgo(prAgoH), mergedAgoH == null ? null : isoAgo(mergedAgoH), isoAgo(0));
ct("a1", "goal A", "merged", 10, 9.5);
ct("b1", "goal B", "pr_open", 5, null);
ct("c1", "goal C", "pr_open", 0.5, null);
ct("d1", "goal D", "closed", 20, null); ct("d2", "goal D", "merged", 15, 14);
d.prepare("INSERT INTO deploy_drift_cf VALUES ('qnfo-ops', 'qnfo-ops', 'dispatched', ?)").run(isoAgo(2));
d.prepare("INSERT INTO deploy_drift_cf VALUES ('alpha', 'alpha', 'wait', ?)").run(isoAgo(0.5));
d.prepare("INSERT INTO deploy_drift_cf VALUES ('beta', 'beta', 'sync', NULL)").run();
d.exec(sql);
const L = Object.fromEntries(d.prepare("SELECT * FROM v_issue_age_ladder").all().map((r) => [r.id, r]));
ok(L[1].doer === "code-task line" && L[2].doer === "live code task" && L[3].doer === "live work claim", "the doer is named: code-task line, live code task, live claim", [L[1].doer, L[2].doer, L[3].doer]);
ok(L[9].doer === null && L[9].breach === 1, "a failed code task is not a doer", L[9]);
ok([1, 2, 3].every((i) => L[i].breach === 0) && [4, 5, 6].every((i) => L[i].breach === 1), "breach only for an issue older than 24 h with no doer", Object.values(L).map((r) => [r.id, r.breach]));
ok(L[7].rung === "8h" && L[7].breach === 0 && L[8].rung === "new" && L[4].rung === "24h", "rungs follow the age", [L[7].rung, L[8].rung, L[4].rung]);
const MR = d.prepare("SELECT * FROM v_merge_reliability").get();
ok(MR.goals_7d === 3 && MR.merged_7d === 2 && MR.merge_share_7d === 0.667, "goal-level share: A and D merged, B not, C too young to count", MR);
ok(MR.prs_unmerged_over_120m === 1 && MR.workers_undeployed_over_60m === 1, "one code PR unmerged past 120 minutes (B); one worker behind main past 60 minutes (qnfo-ops)", MR);
d.prepare("INSERT INTO fleet_tick (source) VALUES ('test')").run();
const mv = (m) => d.prepare("SELECT last_value FROM metric_registry WHERE metric = ?").get(m).last_value;
ok(mv("issues_over_24h_no_doer") === "4" && mv("merges_undeployed_over_60m") === "1" && mv("code_pr_merge_share_7d") === "0.667" && mv("code_prs_unmerged_over_120m") === "1", "a fleet_tick refreshes the four metrics", ["issues_over_24h_no_doer", "merges_undeployed_over_60m", "code_pr_merge_share_7d", "code_prs_unmerged_over_120m"].map(mv));
const P = (id) => d.prepare("SELECT * FROM issue_plans WHERE issue_id = ?").get(id);
ok(P(4).planned_at === "2000-01-01T00:00:00Z" && /^ISSUE-AGE-24H-1 re-plan \(was not-code at /.test(P(4).detail), "a not-code verdict older than 24 h on a 24 h issue is re-armed", P(4));
ok(P(5).planned_at !== "2000-01-01T00:00:00Z" && P(6).planned_at !== "2000-01-01T00:00:00Z" && P(7).planned_at !== "2000-01-01T00:00:00Z", "untrusted, recent and younger-issue verdicts are left alone", [P(5), P(6), P(7)]);
const R = d.prepare("SELECT * FROM issue_age_replans").all();
ok(R.length === 1 && R[0].issue_id === 4 && R[0].outcome_was === "not-code" && R[0].planned_at_was === isoAgo(26), "the re-arm is logged with the verdict and planned_at it replaced", R);
d.prepare("UPDATE issue_plans SET planned_at = ?, outcome = 'not-code' WHERE issue_id = 4").run(isoAgo(25));
d.prepare("INSERT INTO fleet_tick (source) VALUES ('test')").run();
ok(d.prepare("SELECT COUNT(*) AS n FROM issue_age_replans").get().n === 1, "an issue is re-armed at most once a day");
d.prepare("UPDATE ops_config SET value = 'off' WHERE key = 'issue_age_replan'").run();
plan(10, "not-code", 30); issue(10, 40);
d.prepare("INSERT INTO fleet_tick (source) VALUES ('test')").run();
ok(d.prepare("SELECT COUNT(*) AS n FROM issue_age_replans").get().n === 1 && mv("issues_over_24h_no_doer") === "5", "issue_age_replan = off stops the re-arm, not the measurement");
const counts = () => ["metric_registry", "analytics_metric_triggers", "failure_modes", "remediation_contracts", "decision_log", "ops_config"].map((t) => d.prepare("SELECT COUNT(*) AS n FROM " + t).get().n);
const before = counts();
ok(before.join(",") === "4,4,2,2,1,2", "four metrics, four triggers, two failure modes, two detectors, one decision, two config rows", before);
d.exec(sql);
ok(counts().join(",") === before.join(","), "a second apply changes nothing", counts());
ok(JSON.parse(d.prepare("SELECT value FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_20_DEPLOY_ALL_MERGES_1'").get().value).directives_verbatim.length === 3, "the directive row parses with the three verbatim directives");
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1].split("; the issue_plans")[0];
d.exec(rollback);
ok(counts().slice(0, 4).join(",") === "0,0,0,0" && d.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('deploy_merge_age_tick', 'v_issue_age_ladder', 'v_merge_reliability')").get().n === 0, "the Rollback line removes the metrics, triggers, failure modes, views and the tick trigger", counts());
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
