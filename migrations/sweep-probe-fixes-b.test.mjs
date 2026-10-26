// SWEEP-PROBE-FIXES-B-1 offline suite: migrations/2026-10-26-sweep-probe-fixes-b.sql recalibrates three chaos-drill probes and restores the bounded cost view.
// It runs the probes the migration STORES (read back from spof_alternate_probes / control_alternate_probes after it applies to a fixture seeded from the live pre-state of
// 2026-10-26T09:20Z) against crafted data, so a branch that cannot fire, or a probe that reads ok whatever the control does, fails here:
//  * remediation reopen on relapse (issue 1000198): the old probe fails on a healthy idle path (0 action rows in 7 days), the new one reads the control, structure first (a fresh action
//    row no longer excuses a dropped trigger), and the trigger's own relapse select with a 75 minute settle and an open-twin exemption. A real relapse is replayed through the LIVE trigger
//    text: probe fails, a gate-opening tick reopens the issue, probe reads ok;
//  * agent-ws-reactivation-prerequisites (1000243): the contract of the open issue, not the description line a loop rewrites (code-task -> session-task);
//  * compat-advance-review-gate (1000285): a pending advance unsettled for 2 h, a stale exposure snapshot, or an advance that waits with no verification in 35 days; a rare event is not a rate;
//  * v_cost_forecast (1000155): 11 columns kept in order, 4 added, identical to the COST-SUSTAIN-3 view, every reader's column present, NO ops_config row written (bound 329.21 at the
//    existing caps, so the migration does not clear the breach), the metric written from the view, the roll-off of the two windows (3 days of non-neuron cost, 7 days of the uncapped remainder)
//    and the convergence to about 288.7 and 267.7, the detector (view text + sibling metric), idempotent apply, the Rollback line restores the previous state;
//  * agent-ws control row: alternate_path and evidence name the sweep-applied contract (row backed up, guarded, restored by the Rollback line);
//  * not applied, premise gone: 1000217/1000234 (the '>' operator) is fixed on main by BREACH-ONE-MEANING-1, shown here by replaying its view on the five rows.
// SWEEP_B_MIGRATION=<path> runs the same suite against a mutated copy (the mutation checks of the PR).
// Run: node --no-warnings migrations/sweep-probe-fixes-b.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const path = process.env.SWEEP_B_MIGRATION || new URL("./2026-10-26-sweep-probe-fixes-b.sql", import.meta.url);
const sql = readFileSync(path, "utf8");
const here = (f) => new URL(f, import.meta.url);
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];

// ---- live pre-state of 2026-10-26T09:20Z
const REL = "remediation reopen on relapse", AG = "agent-ws-reactivation-prerequisites", CP = "compat-advance-review-gate";
const OLD_REL = `SELECT 'ok' AS expected, CASE WHEN (SELECT COUNT(*) FROM recurrence_guard_actions WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) > 0 THEN 'ok' ELSE 'no recurrence_guard_actions row in 7 days' END AS observed`;
const OLD_REL_NOTE = "7 days: the D1 path acts only when a closure relapses; the drill does not manufacture a relapse";
const AG_TITLE = "AGENT-WS-REACTIVATION-1: resolve the consumer and fleet-cap prerequisites before reactivating qnfo-agent-ws";
const AG_PROBE_LINE = `runtime-probe: {"url": "https://qnfo-agent-ws.q08.workers.dev/health", "status": 200, "contains": "qnfo-agent-ws", "min_version": "2.1.0"}`;
const OLD_AG = `SELECT 'ok' AS expected, CASE WHEN EXISTS (SELECT 1 FROM agent_issues a JOIN control_registry c ON c.control = 'agent-ws-reactivation-prerequisites' AND c.disposition = 'keep' AND c.disposition_state = 'applied' WHERE a.title = '${AG_TITLE}' AND a.status = 'open' AND instr(a.description, 'code-task: repo=qnfo-workers path=qnfo-agent-ws/worker.js') > 0 AND instr(a.description, '${AG_PROBE_LINE}') > 0) THEN 'ok' ELSE 'the open server-side handoff, versioned health probe, or keep disposition is missing' END AS observed`;
const OLD_AG_NOTE = "Read-only D1 probe verifies the server-side remediation issue and its versioned health contract remain open. It does not make the unavailable worker appear healthy or bypass the consumer, dependency, or worker-cap prerequisites.";
const OLD_CP = `SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM deployment_history WHERE action = 'deploy' AND status = 'success' AND deployed_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) THEN 'no successful deploy in 24 h, so the gate may be withholding more than the date change' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'compat-verify' AND status = 'ok' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) THEN 'no ok compat-verify event in 7 days' ELSE 'ok' END AS observed`;
const OLD_CP_NOTE = "24 h for deploys (the gate withholds only the date, never the upload), 7 days for the compat verifier; qnfo-ops/compat-date-apply.test.mjs pins each branch";
const OLD_ALT = "The open AGENT-WS-REACTIVATION-1 issue and its CI-applied remediation contract route the work through qnfo-code-orchestrator and canonical deployment; the read-only control probe checks that handoff remains present.";
const OLD_EVID = "Fresh D1 read: worker_count=35 at 2026-10-25T07:02:15.614Z and no qnfo-agent-ws service_registry row. The correct worker host returned 404/code 1042; the root qnfo-workers host is a separate retired stub returning 410. The issue remains open until consumer, dependency, and cap evidence pass.";
const OLD_RES_NOTE = "PIPELINE-FLOW-POLICY-1 (ops session 2026-10-24 14:25Z): cap 360000 -> 600000. Revert: set 360000 if the bound exceeds 300 or cost/paper does not fall once the noop cap is live.";
const OLD_Q08_NOTE = "COST-SUSTAIN-2 2026-10-21: hard daily neuron budget for q08-signal-engine, paced over the UTC day (q08 0.33.0). 150k = USD 1.65/day. 0 disables (owner override only). Revert: delete row (code default 150000).";
// the live recurrence_guard_tick (sqlite_master, 2026-10-26T09:15Z)
const TRIGGER_SQL = `CREATE TRIGGER recurrence_guard_tick AFTER INSERT ON fleet_tick
WHEN (strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%')
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
BEGIN
  INSERT INTO recurrence_guard_actions (issue_id, class, fails, last_observed, prior_status, prior_close_evidence)
    SELECT x.issue_id, x.class, x.fails, x.last_observed, x.status, x.close_evidence
    FROM (
      SELECT c.issue_id, c.class, a.status, c.max_attempts, t.close_evidence,
        (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0
           AND COALESCE(v.observed, '') <> '' AND lower(trim(v.observed)) NOT LIKE 'pending%'
           AND v.verified_at > MAX(COALESCE((SELECT replace(substr(MAX(l.ts), 1, 19), 'T', ' ') FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN ('dispositioned', 'closed') AND l.to_status IN ('closed', 'resolved')), datetime(a.updated_at / 1000, 'unixepoch')),
                 COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), '1970-01-01'))) AS fails,
        (SELECT substr(v.observed, 1, 120) FROM remediation_verifications v WHERE v.class = c.class ORDER BY v.verified_at DESC LIMIT 1) AS last_observed
      FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id
      WHERE c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved') AND typeof(a.updated_at) = 'integer'
        AND a.updated_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
    ) x
    WHERE x.fails >= MAX(1, COALESCE(x.max_attempts, 3))
      AND COALESCE(x.last_observed, '') <> '' AND lower(trim(x.last_observed)) NOT LIKE 'pending%';
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (RECURRENCE-GUARD-SQL-1, qnfo-audit recurrence_guard_tick): '
        || COALESCE((SELECT 'contract ' || g.class || ' failed ' || g.fails || 'x after the closure and its last pass (last observed ' || COALESCE(g.last_observed, '?') || '). Prior close_evidence: ' || substr(COALESCE(g.prior_close_evidence, '(none)'), 1, 300)
                       FROM recurrence_guard_actions g WHERE g.issue_id = agent_issues.id ORDER BY g.id DESC LIMIT 1), 'a contract failed after the closure')
  WHERE status IN ('closed', 'resolved')
    AND id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0)
    AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.id <> agent_issues.id AND lower(trim(o.title)) = lower(trim(agent_issues.title)));
  UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
  WHERE issue_id IN (SELECT issue_id FROM recurrence_guard_actions WHERE applied = 0)
    AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');
  UPDATE remediation_contracts SET status = 'active'
  WHERE status = 'holding' AND class IN (SELECT class FROM recurrence_guard_actions WHERE applied = 0);
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'closure-relapse', COUNT(*), group_concat(issue_id, ',') FROM recurrence_guard_actions
    WHERE applied = 0 HAVING COUNT(*) > 0;
  UPDATE recurrence_guard_actions SET applied = 1 WHERE applied = 0;
END`;
// the clobbered live view (11 columns) and the COST-SUSTAIN-3 view text, read from the repository so a drift of either is caught
const sust3 = readFileSync(here("./2026-10-21-cost-sustain-3-bounded-forecast.sql"), "utf8");
const sust1 = readFileSync(here("./2026-10-21-cost-sustain-forecast.sql"), "utf8");
const viewOf = (t) => /CREATE VIEW v_cost_forecast AS[\s\S]*?\nFROM [gb](?:, bound)?;/.exec(t.replace(/^--.*$/gm, ""))[0].replace(/;$/, "");
const SUST3_VIEW = viewOf(sust3), OLD_VIEW = viewOf(sust1);
const norm = (s) => s.replace(/\s+/g, " ").trim();

const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().replace(/\.\d+Z$/, "Z");
const isoMs = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const dt = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().slice(0, 19).replace("T", " ");
// an ISO timestamp whose minute is `minute`, `hoursAgo` hours back (hour boundary + minute), never in the future
const tickTs = (minute, hoursAgo) => { const d = new Date(); d.setUTCMinutes(minute, 0, 0); d.setUTCHours(d.getUTCHours() - hoursAgo); if (d.getTime() > Date.now()) d.setUTCHours(d.getUTCHours() - 1); return d.toISOString().replace(/\.\d+Z$/, "Z"); };

function build(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE spof_alternate_probes (component TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, exercise TEXT, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, critical_path INTEGER, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')));
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, triage_state TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE queue_sla_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), stuck_type TEXT NOT NULL, n INTEGER NOT NULL, note TEXT);
CREATE TABLE recurrence_guard_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), issue_id INTEGER NOT NULL, class TEXT NOT NULL, fails INTEGER NOT NULL, last_observed TEXT, prior_status TEXT, prior_close_evidence TEXT, applied INTEGER NOT NULL DEFAULT 0);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE worker_compat_state (worker TEXT NOT NULL, checked_at TEXT NOT NULL, advance TEXT, PRIMARY KEY (worker, checked_at));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE cost_daily (date TEXT, source TEXT, usd REAL, scope TEXT, PRIMARY KEY (date, source));
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, calls INTEGER, neurons REAL);`);
  db.exec(OLD_VIEW + ";");
  db.exec(TRIGGER_SQL);
  const sp = db.prepare("INSERT INTO spof_alternate_probes (component, probe_sql, exercise, window_note, enabled, last_run_at, last_pass, last_pass_at, last_observed) VALUES (?, ?, NULL, ?, 1, '2026-10-26T07:01:00.310Z', 0, '2026-10-25T06:00:19.946Z', 'no recurrence_guard_actions row in 7 days')");
  sp.run(REL, o.rel ?? OLD_REL, OLD_REL_NOTE);
  const cp = db.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled, last_run_at, last_pass, last_pass_at, last_observed) VALUES (?, ?, ?, 1, '2026-10-26T07:01:00.310Z', 0, '2026-10-25T18:01:00.736Z', 'old')");
  cp.run(AG, o.ag ?? OLD_AG, OLD_AG_NOTE); cp.run(CP, o.cp ?? OLD_CP, OLD_CP_NOTE);
  const cr = db.prepare("INSERT INTO control_registry VALUES (?, ?, ?, 0, 'keep', 'applied', ?, ?, ?, ?, ?)");
  cr.run(AG, "qnfo-agent-ws/RETIRED and deploy-targets.txt", "hold", o.alt ?? OLD_ALT, "2026-10-25T18:01:00.736Z", OLD_EVID, 1000140, "2026-10-25T18:01:00.736Z");
  cr.run(CP, "qnfo-ops/worker.js decideCompatAdvance + compatAdvanceGate", "gate", "the gate withholds only the date change, never the deploy", "2026-10-26T00:01:02.705Z", "qnfo-ops/compat-date-apply.test.mjs runs cfWorkerDeploy for each branch", null, null);
  // issue 1000140: the description carries session-task, not code-task (NEEDS-ANCHOR-ROUTE-1, 2026-10-25T18:53Z); its contract is intact
  db.prepare("INSERT INTO agent_issues (id, title, description, status, created_at, updated_at) VALUES (1000140, ?, ?, 'open', 1, 1)").run(AG_TITLE,
    "Doer: qnfo-code-orchestrator.\n" + AG_PROBE_LINE + "\nsession-task: repo=qnfo-workers path=qnfo-agent-ws/worker.js\ncode-anchor: const normalizedPath = ...\n(NEEDS-ANCHOR-ROUTE-1 2026-10-25T18:53Z)");
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, status, verify_transport, verify_probe, max_attempts) VALUES ('issue-1000140', 1000140, 'active', 'runner-https', ?, 3)").run(AG_PROBE_LINE.replace(/^runtime-probe: /, ""));
  // caps, with their live notes
  db.prepare("INSERT INTO ops_config VALUES ('research_daily_neurons', ?, ?, '2026-10-24 14:59:20')").run(o.research ?? "360000", OLD_RES_NOTE);
  db.prepare("INSERT INTO ops_config VALUES ('q08_daily_neurons', ?, ?, '2026-10-21 14:13:36')").run(o.q08 ?? "150000", OLD_Q08_NOTE);
  db.exec("INSERT INTO ops_config VALUES ('code_loop_daily_calls', '140', 'raised 100->140', '2026-10-24T15:10:00Z')");
  // fleet_tick: two producers, one insert inside minutes 0-9 an hour
  for (let h = 0; h < 6; h++) { db.prepare("INSERT INTO fleet_tick (ts, source) VALUES (?, 'cron:qnfo-code-orchestrator')").run(tickTs(3, h)); db.prepare("INSERT INTO fleet_tick (ts, source) VALUES (?, 'cron:qnfo-code-orchestrator')").run(tickTs(33, h)); }
  // deploys and the three settled compat advances of 2026-10-13, 10-18, 10-19
  db.prepare("INSERT INTO deployment_history (resource_name, action, status, deployed_at, notes) VALUES ('qnfo-ai', 'deploy', 'success', ?, 'cf_worker_deploy ok')").run(isoMs(120));
  const pend = (w, d, n) => { const a = db.prepare("INSERT INTO deployment_history (resource_name, action, status, deployed_at, notes) VALUES (?, 'deploy', 'success', ?, ?)").run(w, d, "cf_worker_deploy ok http=200 compat_date=2026-08-01->2026-10-10 reviewed=2026-10-12 pending_verify bindings_preserved=1"); db.prepare("INSERT INTO deployment_history (resource_name, action, status, deployed_at, notes) VALUES (?, 'compat-verify', 'success', ?, 'kept')").run(w, d); return a; };
  pend("qnfo-ops", "2026-10-13T07:33:19.689Z"); pend("qnfo-evolve", "2026-10-18T12:25:12.636Z"); pend("qnfo-model-eval", "2026-10-19T05:34:23.453Z");
  db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES ('e1', '2026-10-19T05:34:45.026Z', 'compat-verify', 'ok')").run();
  const snapAt = isoMs(350);
  for (const w of ["idea-hub", "personal-api", "qnfo-ops"]) db.prepare("INSERT INTO worker_compat_state VALUES (?, ?, 'declared date equals live')").run(w, snapAt);
  db.prepare("INSERT INTO worker_compat_state VALUES ('qnfo-x', ?, 'wrangler.toml declares no compatibility_date')").run(snapAt);
  // metrics: the bound froze at 352.76 a day ago, its siblings refresh
  db.prepare("INSERT INTO metric_registry VALUES ('fleet_cost_pace_30d_usd', '289.48', ?, 'MEASURED')").run(iso(11));
  db.prepare("INSERT INTO metric_registry VALUES ('fleet_cost_bound_month_usd', '352.76', ?, 'MEASURED')").run(iso(25 * 60));
  // cost and neuron data that reproduce the live read: 852,612 neurons a day, USD 1.7048 a day outside neurons
  for (let d = 1; d <= 10; d++) {
    db.prepare("INSERT INTO cost_daily VALUES (date('now', ?), 'workers_ai', 7.9446, 'fleet')").run("-" + d + " days");
    db.prepare("INSERT INTO cost_daily VALUES (date('now', ?), 'cloudflare_plan:daily', 1.7048, 'fleet')").run("-" + d + " days");
    db.prepare("INSERT INTO ai_call_counters VALUES (date('now', ?), 'qnfo-code-orchestrator', 100, 178703.446)").run("-" + d + " days");
    db.prepare("INSERT INTO ai_call_counters VALUES (date('now', ?), 'qnfo-ops', 10, 92427.42129)").run("-" + d + " days");
    db.prepare("INSERT INTO ai_call_counters VALUES (date('now', ?), 'qnfo-research-exec', 100, 400000)").run("-" + d + " days");
    db.prepare("INSERT INTO ai_call_counters VALUES (date('now', ?), 'q08-signal-engine', 100, 150000)").run("-" + d + " days");
  }
  return db;
}
const one = (db, s, ...a) => db.prepare(s).get(...a);
const all = (db, s, ...a) => db.prepare(s).all(...a);
const spof = (db) => one(db, "SELECT probe_sql FROM spof_alternate_probes WHERE component = ?", REL).probe_sql;
const ctrl = (db, c) => one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", c).probe_sql;
const run = (db, text) => { const r = db.prepare(text).get(); return r ? r.observed : "(no row)"; };
const cols = (db, v) => all(db, "PRAGMA table_info(" + v + ")").map((c) => c.name);
const bound = (db) => { try { return one(db, "SELECT bound_30d_usd AS b FROM v_cost_forecast WHERE scope = 'fleet'")?.b; } catch (e) { return undefined; } };

// ============================================================ static shape of the file
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261026_v_cost_forecast$/m.test(sql), "the opt-in headers and the BACKUP of the dropped view are present");
const code = sql.replace(/^--.*$/gm, "");
const bare = code.replace(/'(?:[^']|'')*'/g, "''");
ok(!/\b(?:UPDATE|DELETE\s+FROM)\s+ops_config\b|\b(?:INTO|REPLACE)\s+ops_config\b/i.test(bare), "no statement of the file writes ops_config (no cap is written; the view only reads it)");
ok(!/\bCREATE\s+TRIGGER\b/i.test(bare), "no trigger is created (none on agent_issues, none on analytics_metric_triggers, no new D1 trigger depth)");
ok((bare.match(/\bDROP\s+\w+/gi) || []).join() === "DROP VIEW" && !/\bDELETE\s+FROM\b/i.test(bare), "the only destructive statement is DROP VIEW of v_cost_forecast (no DELETE)", bare.match(/\bDROP\s+\w+/gi));
ok(/CREATE TABLE IF NOT EXISTS bak_20261026_v_cost_forecast AS SELECT name, sql FROM sqlite_master WHERE name = 'v_cost_forecast';[\s\S]*DROP VIEW IF EXISTS v_cost_forecast;/.test(code), "the backup table is created before the view is dropped");
ok((code.match(/INSERT INTO decision_log/g) || []).length === 1 && /WHERE NOT EXISTS \(SELECT 1 FROM decision_log WHERE instr\(action, 'SWEEP-PROBE-FIXES-B-1:'\) = 1\)/.test(code), "exactly one decision_log row, guarded so a second apply adds nothing");
ok(!/claude\.ai|api[_-]?key|secret\s*[:=]|Bearer /i.test(sql), "no claude.ai link, key or secret text in the file");
ok(!/\bLIKE\s+'[^']{49,}'/i.test(code) && !/\bLIKE\s+'%[^']{47,}/.test(sql), "no LIKE pattern near D1's 50 byte limit (the probes use instr)");

// ============================================================ apply to the live-like pre-state
let db = build();
// -- the pre-state: every one of the three old probes fails on a healthy control
ok(run(db, OLD_REL) === "no recurrence_guard_actions row in 7 days", "pre-state: the old relapse probe fails on an armed idle path");
ok(/^the open server-side handoff/.test(run(db, OLD_AG)), "pre-state: the old agent-ws probe fails because the description now says session-task");
ok(run(db, OLD_CP) === "no ok compat-verify event in 7 days", "pre-state: the old compat probe fails because no advance happened in 7 days");
ok(cols(db, "v_cost_forecast").length === 11 && bound(db) === undefined, "pre-state: the clobbered view has 11 columns and no bound", cols(db, "v_cost_forecast"));
const oldCols = cols(db, "v_cost_forecast");
// the bound before the caps change, on the restored view alone (a scratch database, caps untouched)
{
  const s = build(); s.exec("DROP VIEW v_cost_forecast;" + SUST3_VIEW + ";");
  const b0 = bound(s);
  ok(Math.abs(b0 - 329.21) < 0.06, "the restored view reads USD 329.21 on the live inputs at the old caps (852,612 neurons a day)", b0);
  ok(one(s, "SELECT bound_daily_neurons AS n FROM v_cost_forecast WHERE scope = 'fleet'").n === 852612, "and 852,612 neurons a day");
}
db.exec(sql);
ok(true, "the migration applies on the live-like pre-state");

// -- history rows
const hist = all(db, "SELECT component AS k, probe_sql, window_note, enabled FROM spof_alternate_probes WHERE component LIKE '%@before-calibration-1' UNION ALL SELECT control, probe_sql, window_note, enabled FROM control_alternate_probes WHERE control LIKE '%@before-calibration-1' ORDER BY 1");
ok(hist.length === 3 && hist.every((h) => h.enabled === 0), "the three old probes are kept as disabled @before-calibration-1 rows", hist.map((h) => h.k));
const H = Object.fromEntries(hist.map((h) => [h.k, h]));
ok(H[AG + "@before-calibration-1"].probe_sql === OLD_AG && H[AG + "@before-calibration-1"].window_note === OLD_AG_NOTE && H[CP + "@before-calibration-1"].probe_sql === OLD_CP && H[REL + "@before-calibration-1"].probe_sql === OLD_REL && H[REL + "@before-calibration-1"].window_note === OLD_REL_NOTE, "the history rows hold the exact old text and notes");
ok(!one(db, "SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name LIKE 'bak_%' AND name NOT IN ('bak_20261026_v_cost_forecast', 'bak_20261026_control_registry_agent_ws')"), "no bak_ table beyond the two backups the file names (the view and the control row)");
ok(one(db, "SELECT COUNT(*) AS n FROM spof_alternate_probes WHERE enabled = 1").n === 1 && one(db, "SELECT COUNT(*) AS n FROM control_alternate_probes WHERE enabled = 1").n === 2, "one enabled spof probe and two enabled control probes: the drill still reads three rows");
ok(run(db, spof(db)) === "ok" && run(db, ctrl(db, AG)) === "ok" && run(db, ctrl(db, CP)) === "ok", "post-state: the three new probes read ok on the live-like data", [run(db, spof(db)), run(db, ctrl(db, AG)), run(db, ctrl(db, CP))]);
ok(one(db, "SELECT last_pass AS p FROM spof_alternate_probes WHERE component = ?", REL).p === 0, "the probe rows' run columns are untouched (the drill alone writes them)");

// ============================================================ 1. remediation reopen on relapse
const REL_BRANCHES = () => { const d = build(); d.exec(sql); return d; };
{
  let d = REL_BRANCHES();
  ok(run(d, spof(d)) === "ok" && one(d, "SELECT COUNT(*) AS n FROM recurrence_guard_actions").n === 0, "armed, idle, no action row ever: ok (the false failure of 2026-10-26)");
  d.exec("DROP TRIGGER recurrence_guard_tick");
  ok(run(d, spof(d)) === "the recurrence_guard_tick trigger is gone or no longer reopens a closed issue", "the trigger gone fires", run(d, spof(d)));
  d = REL_BRANCHES(); d.exec("DROP TRIGGER recurrence_guard_tick; CREATE TRIGGER recurrence_guard_tick AFTER INSERT ON fleet_tick BEGIN SELECT 1; END");
  ok(/no longer reopens/.test(run(d, spof(d))), "a trigger of that name with an empty body fires", run(d, spof(d)));
  d = REL_BRANCHES(); d.exec("DROP TRIGGER recurrence_guard_tick; CREATE TRIGGER recurrence_guard_tick AFTER INSERT ON fleet_tick BEGIN INSERT INTO recurrence_guard_actions (issue_id, class, fails) SELECT 1, 'x', 1 WHERE 0; END");
  ok(/no longer reopens/.test(run(d, spof(d))), "a trigger that records actions but never sets a closed issue open fires", run(d, spof(d)));
  d = REL_BRANCHES(); d.exec("DROP TRIGGER recurrence_guard_tick; CREATE TRIGGER recurrence_guard_tick AFTER INSERT ON recurrence_guard_actions BEGIN SELECT 1; END");
  ok(/no longer reopens/.test(run(d, spof(d))), "a trigger of that name on another table fires", run(d, spof(d)));
  d = REL_BRANCHES(); d.exec("INSERT INTO ops_config VALUES ('queue_sla_autofix', 'off', 'n', 'x')");
  ok(run(d, spof(d)) === "ops_config queue_sla_autofix is off, so recurrence_guard_tick does not act", "the autofix lever off fires", run(d, spof(d)));
  d.exec("UPDATE ops_config SET value = 'on' WHERE key = 'queue_sla_autofix'");
  ok(run(d, spof(d)) === "ok", "the lever on again reads ok");
  d = REL_BRANCHES(); d.exec("DELETE FROM fleet_tick WHERE CAST(strftime('%M', ts) AS INTEGER) < 10");
  ok(/^no fleet_tick insert in minutes 0 to 9 in 3 hours/.test(run(d, spof(d))), "ticks only at minutes 10-59 fire (the gate never opens)", run(d, spof(d)));
  d = REL_BRANCHES(); d.exec("DELETE FROM fleet_tick");
  ok(/^no fleet_tick insert in minutes 0 to 9/.test(run(d, spof(d))), "no tick at all fires", run(d, spof(d)));
  d = REL_BRANCHES(); d.exec("DELETE FROM fleet_tick WHERE CAST(strftime('%M', ts) AS INTEGER) < 10"); d.prepare("INSERT INTO fleet_tick (ts, source) VALUES (?, 'cron:qnfo-code-orchestrator')").run(tickTs(3, 4));
  ok(/^no fleet_tick insert in minutes 0 to 9 in 3 hours/.test(run(d, spof(d))), "the only gate-minute tick is 4 h old (outside the 3 hours): fires", run(d, spof(d)));
  d = REL_BRANCHES(); d.exec("DELETE FROM fleet_tick WHERE ts < '" + iso(170) + "' AND CAST(strftime('%M', ts) AS INTEGER) < 10");
  const inWin = one(d, "SELECT COUNT(*) AS n FROM fleet_tick WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-3 hours') AND CAST(strftime('%M', ts) AS INTEGER) < 10").n;
  ok(inWin >= 1 ? run(d, spof(d)) === "ok" : true, "a gate-minute tick inside the 3 hours is enough");
  // structure first: a fresh action row no longer excuses a dropped trigger (the 7-day evidence short-circuit hid it)
  d = REL_BRANCHES(); d.exec("INSERT INTO recurrence_guard_actions (ts, issue_id, class, fails, applied) VALUES ('" + iso(60) + "', 1, 'issue-1', 3, 1)");
  ok(run(d, spof(d)) === "ok", "with a recent action row and the trigger present: ok");
  d.exec("DROP TRIGGER recurrence_guard_tick");
  ok(/^the recurrence_guard_tick trigger is gone/.test(run(d, spof(d))), "with a recent action row and the trigger GONE it still fires (structure first, evidence does not excuse a broken path)", run(d, spof(d)));
}
// relapse replay
const relapse = (d, o = {}) => {
  const id = o.id ?? 7001, closedMs = Date.now() - (o.closedMinAgo ?? 180) * 60000;
  d.prepare("INSERT INTO agent_issues (id, title, description, status, created_at, updated_at) VALUES (?, ?, 'd', ?, ?, ?)").run(id, o.title ?? "T relapse " + id, o.status ?? "closed", closedMs - 1e6, closedMs);
  d.prepare("INSERT INTO remediation_contracts (class, issue_id, status, max_attempts, verify_transport) VALUES (?, ?, ?, ?, 'd1-query')").run("issue-" + id, id, o.cstatus ?? "active", o.max ?? 3);
  d.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (?, 'closed', 'open', 'closed', ?)").run(id, iso(o.closedMinAgo ?? 180));
  for (const m of o.fails ?? [150, 120, 90]) d.prepare("INSERT INTO remediation_verifications (issue_id, class, observed, pass, verified_at) VALUES (?, ?, ?, 0, ?)").run(id, "issue-" + id, o.observed ?? "fail", dt(m));
  if (o.pass) d.prepare("INSERT INTO remediation_verifications (issue_id, class, observed, pass, verified_at) VALUES (?, ?, 'ok', 1, ?)").run(id, "issue-" + id, dt(o.pass));
};
const RELAPSE_MSG = "a closed issue failed its contract past max_attempts for over 75 minutes and was not reopened";
{
  let d = REL_BRANCHES(); relapse(d);
  ok(run(d, spof(d)) === RELAPSE_MSG, "a closed issue whose contract failed 3 of 3 for over 75 minutes and stayed closed fires", run(d, spof(d)));
  // the same select is what the live trigger acts on: a gate-opening tick reopens it and the probe reads ok
  d.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
  ok(one(d, "SELECT status AS s FROM agent_issues WHERE id = 7001").s === "open" && one(d, "SELECT COUNT(*) AS n FROM recurrence_guard_actions").n === 1, "the LIVE trigger text reopens it on a gate-opening tick and writes the action row");
  ok(run(d, spof(d)) === "ok", "after the reopen the probe reads ok again", run(d, spof(d)));
  d = REL_BRANCHES(); relapse(d, { fails: [60, 50, 40] });
  ok(run(d, spof(d)) === "ok", "a relapse younger than 75 minutes is not a failure yet (the hour between two gate windows)", run(d, spof(d)));
  d.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
  ok(one(d, "SELECT status AS s FROM agent_issues WHERE id = 7001").s === "open", "and the trigger would reopen it on the next gate tick");
  d = REL_BRANCHES(); relapse(d, { fails: [150, 120] });
  ok(run(d, spof(d)) === "ok", "2 failures of max_attempts 3: ok", run(d, spof(d)));
  d = REL_BRANCHES(); relapse(d, { max: 2, fails: [150, 120] });
  ok(run(d, spof(d)) === RELAPSE_MSG, "max_attempts 2 with 2 failures fires", run(d, spof(d)));
  d = REL_BRANCHES(); relapse(d, { pass: 100 });
  ok(run(d, spof(d)) === "ok", "a pass after the failures resets the count", run(d, spof(d)));
  d = REL_BRANCHES(); relapse(d, { closedMinAgo: 100, fails: [95, 90, 80] });
  ok(run(d, spof(d)) === "ok", "an issue closed 100 minutes ago with failures at 95, 90 and 80 minutes ago is out of the trigger select (the trigger waits 2 h after a closure)", run(d, spof(d)));
  d.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
  ok(one(d, "SELECT status AS s FROM agent_issues WHERE id = 7001").s === "closed" && one(d, "SELECT COUNT(*) AS n FROM recurrence_guard_actions").n === 0, "and the LIVE trigger text leaves it closed too (same select)");
  d = REL_BRANCHES(); relapse(d, { cstatus: "holding" });
  ok(run(d, spof(d)) === RELAPSE_MSG, "a contract in status holding is in the trigger select: fires", run(d, spof(d)));
  d = REL_BRANCHES(); relapse(d); d.prepare("INSERT INTO remediation_verifications (issue_id, class, observed, pass, verified_at) VALUES (7001, 'issue-7001', 'pending: waiting for the next run', 0, ?)").run(dt(30));
  ok(run(d, spof(d)) === "ok", "three failures followed by a final pending verification read ok (the trigger waits for a settled observation)", run(d, spof(d)));
  d.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
  ok(one(d, "SELECT status AS s FROM agent_issues WHERE id = 7001").s === "closed", "and the LIVE trigger text leaves it closed while the last observation is pending");
  d = REL_BRANCHES(); relapse(d); d.exec("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (7001, 'dispositioned', 'closed', 'in_progress', '" + iso(20) + "')");
  ok(run(d, spof(d)) === RELAPSE_MSG, "a later lifecycle event whose to_status is not closed or resolved does not move the closure reference: fires", run(d, spof(d)));
  d.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
  ok(one(d, "SELECT status AS s FROM agent_issues WHERE id = 7001").s === "open", "and the LIVE trigger text reopens it (same closure reference)");
  d = REL_BRANCHES(); relapse(d, { cstatus: "superseded" });
  ok(run(d, spof(d)) === "ok", "a superseded contract is out of the select", run(d, spof(d)));
  d = REL_BRANCHES(); relapse(d, { observed: "pending: waiting" });
  ok(run(d, spof(d)) === "ok", "pending observations do not count as failures", run(d, spof(d)));
  d = REL_BRANCHES(); relapse(d); d.exec("INSERT INTO agent_issues (id, title, status, created_at, updated_at) VALUES (7002, 'T relapse 7001', 'open', 1, 1)");
  ok(run(d, spof(d)) === "ok", "a closed issue with an OPEN twin of the same title is not a failure (the trigger leaves it closed by design)", run(d, spof(d)));
  d = REL_BRANCHES(); relapse(d, { status: "open" });
  ok(run(d, spof(d)) === "ok", "an issue that is open is not a relapse", run(d, spof(d)));
  d = REL_BRANCHES(); relapse(d, { status: "resolved" });
  ok(run(d, spof(d)) === RELAPSE_MSG, "a resolved issue counts like a closed one", run(d, spof(d)));
}

// ============================================================ 2. agent-ws-reactivation-prerequisites
{
  const mk = () => { const d = build(); d.exec(sql); return d; };
  let d = mk();
  const AGMSG1 = "the open AGENT-WS-REACTIVATION-1 issue or the keep disposition is missing", AGMSG2 = "the sweep-applied versioned health contract of the issue is not live";
  ok(run(d, ctrl(d, AG)) === "ok" && !/code-task:/.test(one(d, "SELECT description AS x FROM agent_issues WHERE id = 1000140").x), "ok while the description holds session-task and no code-task line (the rewrite of 2026-10-25T18:53Z)");
  d.exec("UPDATE agent_issues SET description = 'no task line at all' WHERE id = 1000140");
  ok(run(d, ctrl(d, AG)) === "ok", "the description text is not part of the probe");
  d.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 1000140");
  ok(run(d, ctrl(d, AG)) === AGMSG1, "the issue closed fires", run(d, ctrl(d, AG)));
  d = mk(); d.exec("UPDATE control_registry SET disposition = 'remove' WHERE control = '" + AG + "'");
  ok(run(d, ctrl(d, AG)) === AGMSG1, "the control no longer keep fires", run(d, ctrl(d, AG)));
  d = mk(); d.exec("UPDATE control_registry SET disposition_state = 'planned' WHERE control = '" + AG + "'");
  ok(run(d, ctrl(d, AG)) === AGMSG1, "the keep disposition not applied fires", run(d, ctrl(d, AG)));
  d = mk(); d.exec("DELETE FROM agent_issues WHERE id = 1000140");
  ok(run(d, ctrl(d, AG)) === AGMSG1, "the issue absent fires", run(d, ctrl(d, AG)));
  d = mk(); d.exec("DELETE FROM remediation_contracts WHERE class = 'issue-1000140'");
  ok(run(d, ctrl(d, AG)) === AGMSG2, "the contract absent fires", run(d, ctrl(d, AG)));
  for (const st of ["superseded", "closed", "satisfied"]) { d = mk(); d.exec("UPDATE remediation_contracts SET status = '" + st + "' WHERE class = 'issue-1000140'"); ok(run(d, ctrl(d, AG)) === AGMSG2, "a " + st + " contract fires", run(d, ctrl(d, AG))); }
  for (const st of ["active", "holding", "monitoring", "escalated"]) { d = mk(); d.exec("UPDATE remediation_contracts SET status = '" + st + "' WHERE class = 'issue-1000140'"); ok(run(d, ctrl(d, AG)) === "ok", "a " + st + " contract is the live handoff: ok", run(d, ctrl(d, AG))); }
  d = mk(); d.exec("UPDATE remediation_contracts SET verify_transport = 'd1-query' WHERE class = 'issue-1000140'");
  ok(run(d, ctrl(d, AG)) === AGMSG2, "a contract on another transport fires", run(d, ctrl(d, AG)));
  d = mk(); d.exec("UPDATE remediation_contracts SET verify_probe = '{\"url\": \"https://qnfo-agent-ws.q08.workers.dev/health\", \"status\": 200}' WHERE class = 'issue-1000140'");
  ok(run(d, ctrl(d, AG)) === AGMSG2, "a contract without min_version (an unversioned health check) fires", run(d, ctrl(d, AG)));
  d = mk(); d.exec("UPDATE remediation_contracts SET verify_probe = '{\"url\": \"https://example.invalid/health\", \"min_version\": \"2.1.0\"}' WHERE class = 'issue-1000140'");
  ok(run(d, ctrl(d, AG)) === AGMSG2, "a contract on another host fires", run(d, ctrl(d, AG)));
  d = mk(); d.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 1000140; INSERT INTO agent_issues (id, title, description, status, created_at, updated_at) VALUES (1000999, '" + AG_TITLE + "', 'refiled', 'open', 1, 1); INSERT INTO remediation_contracts (class, issue_id, status, verify_transport, verify_probe, max_attempts) VALUES ('issue-1000999', 1000999, 'active', 'runner-https', '{\"url\": \"https://qnfo-agent-ws.q08.workers.dev/health\", \"min_version\": \"2.1.0\"}', 3)");
  ok(run(d, ctrl(d, AG)) === "ok", "an issue re-filed under a new id with its own contract is found by title, not by a fixed id", run(d, ctrl(d, AG)));
  // the control row: alternate_path and evidence name the contract as the handoff
  const pre = build(), post = mk();
  const rowOf = (x, c) => one(x, "SELECT * FROM control_registry WHERE control = ?", c);
  const cr = rowOf(post, AG);
  ok(/sweep-applied runtime-probe contract/.test(cr.alternate_path) && /probe-line-sweep-v1/.test(cr.alternate_path) && /NEEDS-ANCHOR-ROUTE-1/.test(cr.alternate_path) && /worker stays retired/.test(cr.alternate_path) && !/CI-applied/.test(cr.alternate_path), "the alternate_path names the sweep-applied contract (module probe-line-sweep-v1), the retired worker and the withdrawn code-task route, and no longer says CI-applied", cr.alternate_path);
  ok(cr.evidence.startsWith(OLD_EVID) && /SWEEP-PROBE-FIXES-B-1 2026-10-26/.test(cr.evidence) && !/CI-applied/.test(cr.evidence), "the evidence keeps its text and gains the reason", cr.evidence.slice(-200));
  ok(cr.disposition === "keep" && cr.disposition_state === "applied" && cr.alternate_tested_at === "2026-10-25T18:01:00.736Z" && cr.issue_id === 1000140 && cr.location === rowOf(pre, AG).location, "disposition, tested stamp, issue and location of the control row are untouched");
  ok(JSON.stringify(rowOf(post, CP)) === JSON.stringify(rowOf(pre, CP)), "the other control row is untouched");
  const bk = one(post, "SELECT * FROM bak_20261026_control_registry_agent_ws");
  ok(JSON.stringify(bk) === JSON.stringify(rowOf(pre, AG)) && one(post, "SELECT COUNT(*) AS n FROM bak_20261026_control_registry_agent_ws").n === 1, "the backup table holds the exact pre-state row of the control (and only it)");
  const wn = one(post, "SELECT window_note AS w FROM control_alternate_probes WHERE control = ?", AG).w;
  ok(/sweep-applied runtime-probe contract/.test(wn) && !/CI-applied/.test(wn), "the window_note says sweep-applied, not CI-applied", wn.slice(0, 200));
  const own = build({ alt: "somebody else's text for this control" }); own.exec(sql);
  ok(rowOf(own, AG).alternate_path === "somebody else's text for this control" && rowOf(own, AG).evidence === OLD_EVID, "an alternate_path someone has since rewritten is left alone, and so is the evidence");
}

// ============================================================ 3. compat-advance-review-gate
{
  const mk = () => { const d = build(); d.exec(sql); return d; };
  const CPMSG_PEND = "a compat advance has waited over 2 h for its verification and neither compat-verify nor compat-restore settled it";
  const pending = (d, w, minAgo, extra = "") => d.prepare("INSERT INTO deployment_history (resource_name, action, status, deployed_at, notes) VALUES (?, 'deploy', 'success', ?, ?)").run(w, isoMs(minAgo), "cf_worker_deploy ok http=200 compat_date=2026-09-01->2026-10-10 reviewed=2026-10-19 pending_verify" + extra);
  let d = mk();
  ok(run(d, ctrl(d, CP)) === "ok" && one(d, "SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'compat-verify' AND status = 'ok' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')").n === 0, "ok with no ok compat-verify event in 7 days while no advance waits (the false failure of 2026-10-26)");
  d.exec("DELETE FROM deployment_history WHERE deployed_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')");
  ok(/^no successful deploy in 24 h/.test(run(d, ctrl(d, CP))), "no successful deploy in 24 h fires", run(d, ctrl(d, CP)));
  d = mk(); d.exec("UPDATE deployment_history SET status = 'failed' WHERE deployed_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')");
  ok(/^no successful deploy in 24 h/.test(run(d, ctrl(d, CP))), "only failed deploys in 24 h fires", run(d, ctrl(d, CP)));
  d = mk(); pending(d, "qnfo-lifecycle", 180);
  ok(run(d, ctrl(d, CP)) === CPMSG_PEND, "a pending advance unsettled for 3 h fires", run(d, ctrl(d, CP)));
  d = mk(); pending(d, "qnfo-lifecycle", 90);
  ok(run(d, ctrl(d, CP)) === "ok", "a pending advance younger than 2 h is still being verified: ok", run(d, ctrl(d, CP)));
  d = mk(); pending(d, "qnfo-lifecycle", 180); d.prepare("INSERT INTO deployment_history (resource_name, action, status, deployed_at, notes) VALUES ('qnfo-lifecycle', 'compat-verify', 'success', ?, 'kept')").run(isoMs(170));
  ok(run(d, ctrl(d, CP)) === "ok", "settled by a later compat-verify of the same worker: ok", run(d, ctrl(d, CP)));
  d = mk(); pending(d, "qnfo-lifecycle", 180); d.prepare("INSERT INTO deployment_history (resource_name, action, status, deployed_at, notes) VALUES ('qnfo-lifecycle', 'compat-restore', 'success', ?, 'restored')").run(isoMs(170));
  ok(run(d, ctrl(d, CP)) === "ok", "settled by a later compat-restore of the same worker: ok", run(d, ctrl(d, CP)));
  d = mk(); pending(d, "qnfo-lifecycle", 180); d.prepare("INSERT INTO deployment_history (resource_name, action, status, deployed_at, notes) VALUES ('qnfo-other', 'compat-verify', 'success', ?, 'kept')").run(isoMs(170));
  ok(run(d, ctrl(d, CP)) === CPMSG_PEND, "a compat-verify of ANOTHER worker does not settle it", run(d, ctrl(d, CP)));
  d = mk(); d.prepare("INSERT INTO deployment_history (resource_name, action, status, deployed_at, notes) VALUES ('qnfo-lifecycle', 'compat-verify', 'success', ?, 'earlier')").run(isoMs(400)); pending(d, "qnfo-lifecycle", 180);
  ok(run(d, ctrl(d, CP)) === CPMSG_PEND, "a compat-verify recorded BEFORE the pending deploy does not settle it (id order, as qnfo-ops compatPendingRow reads it)", run(d, ctrl(d, CP)));
  d = mk(); d.prepare("INSERT INTO deployment_history (resource_name, action, status, deployed_at, notes) VALUES ('qnfo-lifecycle', 'deploy', 'success', ?, 'cf_worker_deploy ok http=200 compat_date=2026-09-01->2026-10-10 reviewed=2026-10-19 bindings_preserved=1')").run(isoMs(300));
  ok(run(d, ctrl(d, CP)) === "ok", "a deploy that advanced the date without pending_verify (verified by qnfo-ops itself) is not pending", run(d, ctrl(d, CP)));
  d = mk(); d.exec("DELETE FROM worker_compat_state");
  ok(/^the compat exposure snapshot is older than 24 h/.test(run(d, ctrl(d, CP))), "no exposure snapshot fires (an empty table cannot show which advances wait)", run(d, ctrl(d, CP)));
  d = mk(); d.exec("UPDATE worker_compat_state SET checked_at = '" + isoMs(26 * 60) + "'");
  ok(/^the compat exposure snapshot is older than 24 h/.test(run(d, ctrl(d, CP))), "a snapshot 26 h old fires", run(d, ctrl(d, CP)));
}
// advance-waiting cases, every event pinned relative to now
{
  const mk = () => { const d = build(); d.exec(sql); return d; };
  const wait = (d) => d.exec("UPDATE worker_compat_state SET advance = 'next deploy advances to 2026-10-10' WHERE worker = 'idea-hub'");
  let d = mk(); wait(d);
  // the live pre-state event is 2026-10-19: inside 35 days only while the test runs within 35 days of it; pin it with a fresh event
  d.exec("DELETE FROM cloud_ops_events"); d.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES ('f1', ?, 'compat-verify', 'ok')").run(isoMs(10 * 1440));
  ok(run(d, ctrl(d, CP)) === "ok", "an advance waits and an ok compat-verify event is 10 days old (inside 35): ok", run(d, ctrl(d, CP)));
  d.exec("DELETE FROM cloud_ops_events"); d.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES ('f2', ?, 'compat-verify', 'ok')").run(isoMs(36 * 1440));
  ok(/no ok compat-verify event exists in 35 days$/.test(run(d, ctrl(d, CP))), "an advance waits and the last ok event is 36 days old: fires", run(d, ctrl(d, CP)));
  d.exec("DELETE FROM cloud_ops_events"); d.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES ('f3', ?, 'compat-verify', 'error')").run(isoMs(1440));
  ok(/no ok compat-verify event exists in 35 days$/.test(run(d, ctrl(d, CP))), "an advance waits and the only recent event is an error: fires", run(d, ctrl(d, CP)));
  d.exec("DELETE FROM cloud_ops_events");
  ok(/no ok compat-verify event exists in 35 days$/.test(run(d, ctrl(d, CP))), "an advance waits and no event ever: fires", run(d, ctrl(d, CP)));
  d = mk(); d.exec("DELETE FROM cloud_ops_events");
  ok(run(d, ctrl(d, CP)) === "ok", "NO advance waits and no compat-verify event ever: ok (the verifier has nothing to do)", run(d, ctrl(d, CP)));
  d = mk(); d.exec("UPDATE worker_compat_state SET advance = 'next deploy advances to 2026-10-10'; INSERT INTO worker_compat_state VALUES ('idea-hub', '" + isoMs(10) + "', 'declared date equals live')"); d.exec("DELETE FROM cloud_ops_events");
  ok(run(d, ctrl(d, CP)) === "ok", "an advance that waited in an OLDER snapshot but is settled in the newest one is not waiting", run(d, ctrl(d, CP)));
}

// ============================================================ 4. v_cost_forecast, caps, metric, detector
{
  const d = build(); d.exec(sql);
  const nc = cols(d, "v_cost_forecast");
  ok(JSON.stringify(nc.slice(0, 11)) === JSON.stringify(oldCols) && nc.length === 15 && JSON.stringify(nc.slice(11)) === JSON.stringify(["bound_daily_usd", "bound_daily_neurons", "forecast_bounded_month_usd", "bound_30d_usd"]), "the 11 columns of the clobbered view are kept in order and the 4 COST-SUSTAIN-3 columns are added", nc);
  const mine = /CREATE VIEW v_cost_forecast AS[\s\S]*?\nFROM g, bound;/.exec(code);
  ok(mine && norm(mine[0].replace(/;$/, "")) === norm(SUST3_VIEW), "the CREATE VIEW is identical to migrations/2026-10-21-cost-sustain-3-bounded-forecast.sql");
  // every reader's column
  const ledger = readFileSync(here("../scripts/cost_ledger.py"), "utf8");
  const dash = readFileSync(here("../qnfo-fleet-dashboard/worker.js"), "utf8");
  const wf = ledger.slice(ledger.indexOf("def write_forecast"), ledger.indexOf("def write_unit_cost"));
  const readerCols = new Set([...wf.matchAll(/\bf\["(\w+)"\]|\b[fv]\.get\("(\w+)"\)/g)].map((m) => m[1] || m[2]));
  const dfeed = dash.slice(dash.indexOf("const fl = (out.forecast"), dash.indexOf("out.budgets_breached"));
  for (const m of dfeed.matchAll(/\bfl\.(\w+)/g)) readerCols.add(m[1]);
  readerCols.add("scope");
  ok([...readerCols].length >= 6 && [...readerCols].every((c) => nc.includes(c)), "every column scripts/cost_ledger.py write_forecast and the dashboard cost feed read exists in the restored view", [...readerCols].filter((c) => !nc.includes(c)));
  ok(one(d, "SELECT COUNT(*) AS n FROM v_cost_forecast").n >= 1 && one(d, "SELECT COUNT(*) AS n FROM v_cost_forecast WHERE scope = 'fleet'").n === 1, "SELECT * FROM v_cost_forecast ORDER BY scope returns the fleet row");
  // the backup holds the clobbered text
  const bk = one(d, "SELECT name, sql FROM bak_20261026_v_cost_forecast");
  ok(bk.name === "v_cost_forecast" && norm(bk.sql) === norm(OLD_VIEW) && !/bound_30d_usd/.test(bk.sql), "the backup table holds the clobbered 11-column view text");
  // no cap is written
  const cfg = (x) => JSON.stringify(all(x, "SELECT key, value, note, updated_at FROM ops_config ORDER BY key"));
  ok(cfg(d) === cfg(build()) && one(d, "SELECT value FROM ops_config WHERE key = 'research_daily_neurons'").value === "360000" && one(d, "SELECT value FROM ops_config WHERE key = 'q08_daily_neurons'").value === "150000" && one(d, "SELECT value FROM ops_config WHERE key = 'code_loop_daily_calls'").value === "140", "no ops_config row changes: research_daily_neurons 360000, q08_daily_neurons 150000 and code_loop_daily_calls 140 keep their values, notes and stamps");
  const b1 = bound(d);
  ok(Math.abs(b1 - 329.21) < 0.06 && b1 > 300, "the bound at the existing caps is USD 329.21, over 300: the migration does not claim to clear the breach", b1);
  // the metric is written from the view
  const m = one(d, "SELECT last_value AS v, last_refreshed AS r, state FROM metric_registry WHERE metric = 'fleet_cost_bound_month_usd'");
  ok(Math.abs(Number(m.v) - b1) < 0.006 && m.state === "MEASURED" && Date.now() - Date.parse(m.r) < 60000, "fleet_cost_bound_month_usd is written from the restored view and is fresh", m);
  ok(one(d, "SELECT last_value AS v FROM metric_registry WHERE metric = 'fleet_cost_pace_30d_usd'").v === "289.48", "the sibling metrics are not touched");
  ok(one(d, "SELECT CAST(last_value AS REAL) > 300 AS h FROM metric_registry WHERE metric = 'fleet_cost_bound_month_usd'").h === 1, "trigger 10930 (gt 300) still reads a hit on the written value: issue 1000155 closes only when the metric converges");
  // convergence at the existing caps: the two windows roll off
  const win = (sqlText) => { const x = build(); x.exec(sql); x.exec(sqlText); return bound(x); };
  ok(Math.abs(win("INSERT INTO cost_daily VALUES (date('now', '-4 days'), 'ai_gateway:deepseek', 4.0482, 'fleet')") - 329.21) < 0.06, "a one-off non-neuron day 4 days back is outside the 3-day window (the 2026-10-24 gateway day leaves on 2026-10-28)");
  ok(win("INSERT INTO cost_daily VALUES (date('now', '-3 days'), 'ai_gateway:deepseek', 4.0482, 'fleet')") - 329.21 > 40, "and the same day 3 days back is inside it (+USD 40.5 on the bound)");
  ok(Math.abs(win("INSERT INTO ai_call_counters VALUES (date('now', '-8 days'), 'qnfo-ops', 10, 274000)") - 329.21) < 0.06, "an uncapped-remainder day 8 days back is outside the 7-day window (the qnfo-ops spike leaves on 2026-11-02)");
  ok(win("INSERT INTO ai_call_counters VALUES (date('now', '-7 days'), 'qnfo-ops', 10, 274000)") - 329.21 > 3, "and the same day 7 days back is inside it");
  const c1 = build(); c1.exec(sql); c1.exec("UPDATE cost_daily SET usd = 0.3554 WHERE source = 'cloudflare_plan:daily'");
  const b2 = bound(c1);
  ok(Math.abs(b2 - 288.7) < 0.3 && b2 < 300, "with the one-off gateway day out of the 3-day window (USD 0.3554 a day outside neurons) the same caps read about 288.7", b2);
  c1.exec("UPDATE ai_call_counters SET neurons = 28800 WHERE worker = 'qnfo-ops'");
  const b3 = bound(c1);
  ok(Math.abs(b3 - 267.7) < 0.3 && b3 < b2, "and with the qnfo-ops spike days replaced by 28,800 neurons a day they read about 267.7", b3);
  // the detector
  const fm = one(d, "SELECT fm_key, probe_class, issue_id FROM failure_modes WHERE fm_key = 'cost-forecast-view-clobbered'");
  const rc = one(d, "SELECT class, status, verify_transport, verify_probe, module FROM remediation_contracts WHERE class = 'fm-cost-forecast-view-clobbered'");
  ok(fm && fm.probe_class === "fm-cost-forecast-view-clobbered" && rc && rc.status === "active" && rc.verify_transport === "d1-query" && rc.module === "failure-mode", "a failure mode and its fm- detector contract are registered", [fm, rc]);
  const det = (x) => x.prepare(rc.verify_probe).get();
  ok(det(d).expected === "0" && det(d).observed === "0", "the detector reads 0 on the restored state", det(d));
  const pre = build();
  ok(det(pre).observed === "2", "the detector reads 2 on the pre-state (view without bound_30d_usd AND a bound metric 25 h behind its sibling)", det(pre));
  d.exec("DROP VIEW v_cost_forecast;" + OLD_VIEW + ";");
  ok(det(d).observed === "1", "a re-clobbered view reads 1", det(d));
  d.exec("DROP VIEW v_cost_forecast;" + SUST3_VIEW + ";");
  ok(det(d).observed === "0", "the bounded view back reads 0");
  d.exec("UPDATE metric_registry SET last_refreshed = '" + iso(4 * 60) + "' WHERE metric = 'fleet_cost_bound_month_usd'");
  ok(det(d).observed === "1", "the bound metric 4 h behind its sibling reads 1", det(d));
  d.exec("UPDATE metric_registry SET last_refreshed = '" + iso(2 * 60) + "' WHERE metric = 'fleet_cost_bound_month_usd'");
  ok(det(d).observed === "0", "2 h behind (inside the 180 minute tolerance) reads 0", det(d));
  d.exec("UPDATE metric_registry SET last_refreshed = NULL WHERE metric = 'fleet_cost_bound_month_usd'");
  ok(det(d).observed === "0", "a NULL refresh stamp is not read as a stale one (an unmeasured metric has its own detectors)", det(d));
}
{
  // the metric statement leaves the metric alone when the view cannot give a bound
  const e = build(); e.exec("DELETE FROM cost_daily"); e.exec(sql);
  ok(one(e, "SELECT last_value AS v FROM metric_registry WHERE metric = 'fleet_cost_bound_month_usd'").v === "352.76", "with no fleet cost rows the view has no bound and the metric is not overwritten by a NULL or a zero");
}

// ============================================================ idempotent, probes someone changed are left alone, rollback
{
  const snap = (x) => JSON.stringify([all(x, "SELECT * FROM spof_alternate_probes ORDER BY component"), all(x, "SELECT * FROM control_alternate_probes ORDER BY control"), all(x, "SELECT key, value, note FROM ops_config ORDER BY key"), all(x, "SELECT name, sql FROM sqlite_master WHERE type = 'view' ORDER BY name"), all(x, "SELECT * FROM failure_modes"), all(x, "SELECT class, status, verify_probe FROM remediation_contracts ORDER BY class"), all(x, "SELECT * FROM decision_log"), all(x, "SELECT name, sql FROM bak_20261026_v_cost_forecast"), all(x, "SELECT * FROM control_registry ORDER BY control"), all(x, "SELECT * FROM bak_20261026_control_registry_agent_ws")]);
  // the metric value moves with now(), so compare everything except it
  const d = build(); d.exec(sql);
  const s1 = snap(d), m1 = one(d, "SELECT last_value AS v FROM metric_registry WHERE metric = 'fleet_cost_bound_month_usd'").v;
  d.exec(sql);
  ok(snap(d) === s1 && one(d, "SELECT last_value AS v FROM metric_registry WHERE metric = 'fleet_cost_bound_month_usd'").v === m1, "a second apply changes no probe, ops_config row, view, control row, failure mode, contract, decision or backup row");
  ok(one(d, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "exactly one decision_log row after two applies");
  const x = build({ rel: "SELECT 'ok' AS expected, 'ok' AS observed", ag: "SELECT 'ok' AS expected, 'ok' AS observed", cp: "SELECT 'ok' AS expected, 'ok' AS observed" }); x.exec(sql);
  ok(spof(x) === "SELECT 'ok' AS expected, 'ok' AS observed" && ctrl(x, AG) === "SELECT 'ok' AS expected, 'ok' AS observed" && ctrl(x, CP) === "SELECT 'ok' AS expected, 'ok' AS observed", "a probe someone has since changed is left alone");
  ok(one(x, "SELECT COUNT(*) AS n FROM spof_alternate_probes WHERE component LIKE '%@before-calibration-1'").n === 0 && one(x, "SELECT COUNT(*) AS n FROM control_alternate_probes WHERE control LIKE '%@before-calibration-1'").n === 0, "and no history row is made for a probe this file did not replace");
  const y = build(); y.exec("DELETE FROM spof_alternate_probes; DELETE FROM control_alternate_probes; DELETE FROM control_registry; DELETE FROM agent_issues; DELETE FROM remediation_contracts"); y.exec(sql);
  ok(one(y, "SELECT COUNT(*) AS n FROM spof_alternate_probes").n === 0 && one(y, "SELECT COUNT(*) AS n FROM control_alternate_probes").n === 0, "with no probe rows the file creates none (it edits, it does not seed)");
}
{
  const d = build();
  const state = (x, probes) => JSON.stringify([all(x, "SELECT * FROM spof_alternate_probes" + (probes ? " WHERE component NOT LIKE '%@before-calibration-1'" : "") + " ORDER BY component"), all(x, "SELECT * FROM control_alternate_probes" + (probes ? " WHERE control NOT LIKE '%@before-calibration-1'" : "") + " ORDER BY control"), all(x, "SELECT key, value, note FROM ops_config ORDER BY key"), all(x, "SELECT * FROM control_registry ORDER BY control"), cols(x, "v_cost_forecast")]);
  const pre = state(d, false);
  d.exec(sql); d.exec(rollback);
  ok(state(d, true) === pre, "the Rollback line restores the three probes with their notes, the control row (alternate_path and evidence, exact) and the 11-column view");
  ok(!one(d, "SELECT 1 AS x FROM failure_modes WHERE fm_key = 'cost-forecast-view-clobbered'") && !one(d, "SELECT 1 AS x FROM remediation_contracts WHERE class = 'fm-cost-forecast-view-clobbered'"), "and removes the failure mode and its detector");
  ok(one(d, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "the decision_log row stays (append-only)");
  const e = build(); e.exec(sql); e.exec("UPDATE control_registry SET alternate_path = 'rewritten again after the file' WHERE control = '" + AG + "'"); e.exec(rollback);
  ok(one(e, "SELECT alternate_path AS a FROM control_registry WHERE control = ?", AG).a === "rewritten again after the file", "a control row rewritten after the file is not reverted by the Rollback line");
}

// ============================================================ not applied, premise gone: 1000217 and 1000234 (operator '>' read as >=)
{
  const bom = readFileSync(here("./2026-10-26-breach-one-meaning.sql"), "utf8");
  const v = /CREATE VIEW v_metric_trigger_state AS[\s\S]*?\nFROM raw;/.exec(bom);
  ok(!!v && /DROP TRIGGER IF EXISTS metric_trigger_operator_words_ai/.test(bom) && /CREATE TRIGGER metric_trigger_operator_words_au AFTER UPDATE OF operator ON analytics_metric_triggers/.test(bom), "main already carries the view that reads the symbols and the insert and update triggers that write words (BREACH-ONE-MEANING-1, PR 4444)");
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, owner TEXT, queue_target TEXT, priority INTEGER, enabled INTEGER); CREATE TABLE analytics_dash_records (metric TEXT, value TEXT); CREATE TABLE analytics_dash_meta (key TEXT, value TEXT); CREATE TABLE metric_registry (metric TEXT, last_value TEXT);");
  d.exec(v[0].replace(/;$/, ";"));
  d.exec("INSERT INTO metric_registry VALUES ('prd_funnel_monitor_stale', '0'), ('personal_calendar_delivery_over_120m', '0'), ('prd_funnel_missing_transitions', '456')");
  d.exec("INSERT INTO analytics_metric_triggers VALUES (14018, 'prd_funnel_monitor_stale', 't', 'registry', '>', 0, 'o', 'q', 1, 1), (14085, 'personal_calendar_delivery_over_120m', 't', 'registry', '>', 0, 'o', 'q', 1, 1), (14017, 'prd_funnel_missing_transitions', 't', 'registry', '>', 0, 'o', 'q', 1, 1)");
  const hit = Object.fromEntries(all(d, "SELECT id, hit FROM v_metric_trigger_state").map((r) => [r.id, r.hit]));
  ok(hit[14018] === 0 && hit[14085] === 0 && hit[14017] === 1, "replayed on main's view: a '>' trigger with value 0 and threshold 0 reads no hit (14018, 14085) and one with 456 still reads a hit (14017)", hit);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
