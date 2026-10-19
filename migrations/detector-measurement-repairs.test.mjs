// Offline suite (node:sqlite) for the four metric-breach repair migrations of 2026-10-19:
//   2026-10-19-detector-probe-repairs.sql           (two failure-mode detectors that could not read what they claim; failure_modes_recurring)
//   2026-10-19-cadence-sla-cf-changelog.sql         (cadence_sla window error for a daily loop; cadence_overdue_over_120m)
//   2026-10-19-impact-per-dollar-zenodo-null.sql    (METRIC-REFRESH-1 NULL through a retired term; metrics_on_probation_overdue)
//   2026-10-19-blocker-claims-receipts.sql          (receipt cards are not blocker claims, six red-team rows; unverified_blocker_claims)
// Each file is run on SQLite against the live shapes it touches, must change what it says, write its registry rows and decision once,
// and change nothing on a second run. Run: node --no-warnings migrations/detector-measurement-repairs.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const read = (n) => readFileSync(new URL("./" + n, import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const one = (db, sql, ...p) => db.prepare(sql).get(...p);
const REG = `
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
`;
const fresh = (extra = "") => { const db = new DatabaseSync(":memory:"); db.exec(REG + extra); return db; };
const runTwice = (db, sql, probe) => { db.exec(sql); const a = probe(db); db.exec(sql); const b = probe(db); return [a, b]; };
const decisions = (db, tag) => one(db, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, ?) = 1", tag).n;
const registry = (db, fm) => [one(db, "SELECT COUNT(*) n FROM failure_modes WHERE fm_key = ?", fm).n, one(db, "SELECT COUNT(*) n FROM remediation_contracts WHERE class = ?", "fm-" + fm).n];

// ---------------------------------------------------------------- 1. detector probe repairs
{
  const sql = read("2026-10-19-detector-probe-repairs.sql");
  const oldDeferral = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c WHERE c.status = 'active' AND c.deferred_since IS NOT NULL AND c.deferred_since < datetime('now', '-10110 minutes') AND (c.last_verdict LIKE 'deferred%' OR (c.last_verdict = 'fail' AND lower(trim(COALESCE((SELECT e.observed FROM v_remediation_evidence_all e WHERE e.class = c.class ORDER BY e.verified_at DESC LIMIT 1), ''))) LIKE 'pending%')) AND NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = c.issue_id AND x.title LIKE 'VERIFICATION-DEFERRED-7D-1: %') AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = 'open' AND o.title LIKE 'VERIFICATION-DEFERRED-7D-1: ' || c.class || '%')) AS TEXT) AS observed";
  const oldMarker = '{"paths": ["scripts/remediation_consumer.py"], "contains": "if passed != 1 and newer_than_checkout(c.get(\\"ts\\"), checkout_epoch()):"}';
  const db = fresh();
  const ins = db.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, last_verdict, next_due_at) VALUES (?, 'p', 'failure-mode detector', ?, ?, 'qnfo-fleet-control', ?, '2099-01-01 00:00:00')");
  ins.run("fm-verification-deferral-unaged", oldDeferral, "d1-query", "probe-error");
  ins.run("fm-code-read-stale-checkout", oldMarker, "code-read", "missing-marker");
  ins.run("fm-other", "SELECT 'a' AS expected, 'a' AS observed", "d1-query", null);
  const detectorBefore = (d) => d.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE status = 'active' AND verify_transport = 'd1-query' AND last_verdict = 'probe-error' AND verify_probe GLOB '*LIKE ''*'' || *'").get().n;
  ok(detectorBefore(db) === 1, "the GLOB shape the detector uses finds the pre-repair probe (1 before)", detectorBefore(db));
  const [a, b] = runTwice(db, sql, (d) => d.prepare("SELECT class, verify_probe, last_verdict, next_due_at FROM remediation_contracts ORDER BY class").all());
  const by = (rows, c) => rows.find((r) => r.class === c);
  const dl = by(a, "fm-verification-deferral-unaged");
  ok(!/LIKE 'VERIFICATION-DEFERRED-7D-1: ' \|\|/.test(dl.verify_probe), "the dynamic LIKE is gone from the deferral probe");
  ok(dl.verify_probe.includes("lower(trim(o.title)) = lower(trim('VERIFICATION-DEFERRED-7D-1: ' || c.class))"), "the deferral probe compares with the equality the worker uses");
  ok(dl.verify_probe.includes("x.title LIKE 'VERIFICATION-DEFERRED-7D-1: %'"), "the static prefix LIKE (27 bytes) stays");
  ok(dl.last_verdict === null && dl.next_due_at !== "2099-01-01 00:00:00", "the repaired contract is due now with a cleared verdict", dl);
  const cr = by(a, "fm-code-read-stale-checkout");
  ok(JSON.parse(cr.verify_probe).contains === "return newer_than_checkout(ts, checkout_epoch(root)) and checkout_is_tip(root) is not True", "the code-read marker is the refactored guard", cr.verify_probe);
  ok(JSON.parse(cr.verify_probe).paths[0] === "scripts/remediation_consumer.py", "the code-read path is kept");
  ok(by(a, "fm-other").verify_probe === "SELECT 'a' AS expected, 'a' AS observed", "an unrelated contract is untouched");
  ok(JSON.stringify(a) === JSON.stringify(b), "second run changes no probe row");
  ok(detectorBefore(db) === 0, "the detector reads 0 after the repair", detectorBefore(db));
  ok(registry(db, "probe-dynamic-like-too-complex").join() === "1,1" && decisions(db, "DETECTOR-PROBE-REPAIR-1:") === 1, "failure mode, detector contract and one decision, once");
}

// ---------------------------------------------------------------- 2. cadence_sla for the daily cf-changelog loop
{
  const sql = read("2026-10-19-cadence-sla-cf-changelog.sql");
  const db = fresh("CREATE TABLE cadence_sla (surface TEXT PRIMARY KEY, producer TEXT, interval_min INTEGER, sla_min INTEGER, schedule TEXT, last_output TEXT, updated_at TEXT);");
  db.exec("INSERT INTO cadence_sla VALUES ('cf-changelog', 'qnfo-fleet-control', 120, 120, 'CF-CHANGELOG-LOOP-1 runs once a day inside the hourly tick', 'x', '2026-10-18T13:12:51Z'), ('social', 'qnfo-social', 120, 120, 's', 'x', '2026-10-18T13:12:51Z')");
  const [a, b] = runTwice(db, sql, (d) => d.prepare("SELECT surface, interval_min, sla_min, schedule FROM cadence_sla ORDER BY surface").all());
  ok(a.find((r) => r.surface === "cf-changelog").interval_min === 1260 && a.find((r) => r.surface === "cf-changelog").sla_min === 120, "cf-changelog interval 1260, sla stays 120", a);
  ok(a.find((r) => r.surface === "social").interval_min === 120, "another producer keeps its row");
  ok(JSON.stringify(a) === JSON.stringify(b), "second run changes nothing");
  // due = last run + interval; the observed gaps (20 to 21 h) are inside it, a 24 h silence is not
  const dueMin = (lastRunMinAgo) => 1260 + 120 - lastRunMinAgo; // minutes of slack left before over_sla
  ok(dueMin(21 * 60) > 0 && dueMin(1229) > 0, "a run 20.5 h ago is on time");
  ok(dueMin(24 * 60) < 0, "a loop silent for 24 h is still caught");
  ok(decisions(db, "CADENCE-SLA-CF-CHANGELOG-1:") === 1, "one decision");
}

// ---------------------------------------------------------------- 3. METRIC-REFRESH-1 NULL through a retired term
{
  const sql = read("2026-10-19-impact-per-dollar-zenodo-null.sql");
  const target = "CAST((SELECT last_value FROM metric_registry WHERE metric='zenodo_views_total') AS REAL) + 100.0";
  const def = '{"steps":[{"type":"sql","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CASE metric WHEN \'external_impact_per_dollar\' THEN CAST(ROUND(CAST((SELECT last_value FROM metric_registry WHERE metric=\'cost_usd_30d\') AS REAL) / (CAST((SELECT last_value FROM metric_registry WHERE metric=\'pageviews_30d\') AS REAL) + ' + target + '*(SELECT COUNT(*) FROM subscribers)), 5) AS TEXT) END"}]}';
  const db = fresh(`
CREATE TABLE fleet_tasks (name TEXT PRIMARY KEY, definition TEXT, enabled INTEGER, version INTEGER);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE metric_authorship (metric TEXT PRIMARY KEY, authored_by TEXT, probation_until TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'probation');
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, enabled INTEGER);
CREATE TABLE subscribers (email TEXT);`);
  db.prepare("INSERT INTO fleet_tasks VALUES ('METRIC-REFRESH-1: recompute D1-derivable metric_registry values (issue 1411)', ?, 1, 1)").run(def);
  db.exec(`INSERT INTO metric_registry VALUES ('external_impact_per_dollar', NULL, strftime('%Y-%m-%dT%H:%M:%SZ','now'), 'OK'), ('cost_usd_30d', '445.67', 'x', 'MEASURED'), ('pageviews_30d', '12090', 'x', 'MEASURED');
INSERT INTO metric_authorship VALUES ('external_impact_per_dollar', 'f', '2026-10-19T08:02:17Z', 'probation'), ('ask_helpful_rate_30d', 'a', '2026-10-19T08:02:17Z', 'probation'), ('q08_forecast_void_share', 'q', '2026-10-19T08:02:17Z', 'probation'), ('other', 'o', '2026-10-19T08:02:17Z', 'probation');
INSERT INTO analytics_metric_triggers VALUES (1519, 'external_impact_per_dollar', 1);
INSERT INTO subscribers VALUES ('a'), ('b'), ('c'), ('d');`);
  // the old expression, as the task wrote it, is NULL with no zenodo row
  const oldExpr = "SELECT CAST(ROUND(CAST((SELECT last_value FROM metric_registry WHERE metric='cost_usd_30d') AS REAL) / (CAST((SELECT last_value FROM metric_registry WHERE metric='pageviews_30d') AS REAL) + " + target + "*(SELECT COUNT(*) FROM subscribers)), 5) AS TEXT) v";
  ok(one(db, oldExpr).v === null, "the old expression is NULL while zenodo_views_total has no row");
  const detector = (d) => d.prepare("SELECT COUNT(*) n FROM metric_registry r JOIN analytics_metric_triggers t ON t.metric_key = r.metric AND t.enabled = 1 JOIN metric_authorship a ON a.metric = r.metric AND a.status = 'probation' WHERE r.last_value IS NULL AND r.state = 'OK' AND r.last_refreshed > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-3 hours')").get().n;
  ok(detector(db) === 1, "the detector shape reads 1 before the repair");
  const [a, b] = runTwice(db, sql, (d) => JSON.stringify([d.prepare("SELECT definition FROM fleet_tasks").get().definition, d.prepare("SELECT * FROM metric_registry ORDER BY metric").all(), d.prepare("SELECT * FROM metric_authorship ORDER BY metric").all()]));
  const [d1, reg, auth] = JSON.parse(a);
  ok(d1.includes("COALESCE(CAST((SELECT last_value FROM metric_registry WHERE metric='zenodo_views_total') AS REAL), 0.0) + 100.0"), "the task text COALESCEs the retired term");
  ok(d1.split("COALESCE(CAST((SELECT last_value FROM metric_registry WHERE metric='zenodo_views_total')").length === 2, "exactly one term changed");
  ok(reg.find((r) => r.metric === "external_impact_per_dollar").last_value === "0.03568", "the honest value is written (445.67 / (12090 + 400))", reg);
  const ex = (m) => auth.find((r) => r.metric === m).probation_until;
  ok(ex("ask_helpful_rate_30d") === "2026-11-18T08:02:17Z" && ex("q08_forecast_void_share") === "2026-11-18T08:02:17Z", "the two volume-gated metrics get 30 more days", auth);
  ok(ex("external_impact_per_dollar") === "2026-10-19T08:02:17Z" && ex("other") === "2026-10-19T08:02:17Z", "the repaired metric and an unrelated one keep their date");
  ok(a === b, "second run changes nothing");
  ok(detector(db) === 0, "the detector reads 0 after the repair");
  ok(registry(db, "metric-refresh-null-component").join() === "1,1" && decisions(db, "IMPACT-PER-DOLLAR-NULL-1:") === 1, "failure mode, detector contract and one decision, once");
}

// ---------------------------------------------------------------- 4. blocker claims: receipts are not claims, red-team rows hold on a text signature
{
  const sql = read("2026-10-19-blocker-claims-receipts.sql");
  const oldView = read("2026-10-19-blocker-claims-receipts.sql").match(/^-- Rollback: DROP VIEW IF EXISTS v_blocker_claims; (CREATE VIEW v_blocker_claims AS .*?); DELETE FROM blocker_redteam/m)[1];
  const db = fresh(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, created_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, close_evidence TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, status TEXT, source TEXT, created_at TEXT);
CREATE TABLE blocker_redteam (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, claim TEXT, attempt TEXT NOT NULL, verdict TEXT NOT NULL CHECK (verdict IN ('false-belief-removed', 'confirmed-with-evidence', 'workaround-built')), evidence TEXT NOT NULL, actor TEXT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), text_sig TEXT);`);
  db.exec(oldView);
  const old = Date.now() - 5 * 3600e3, cardAt = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 19) + "Z";
  const iss = db.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, ?, ?)");
  // the six red-teamed issues, with the exact title/description lengths the signatures were computed from
  const mk = (id, sig, word) => { const [lt, ld] = sig.split(":").map(Number); iss.run(id, ("t" + id).padEnd(lt, "x"), (word + " ").padEnd(ld, "y"), "open", old); };
  mk(1947, "91:6194", "owner only"); mk(2068, "163:2479", "blocked"); mk(2111, "118:3733", "blocked"); mk(2953, "126:3872", "blocked"); mk(99916, "113:413", "blocked"); mk(99948, "98:410", "blocked");
  iss.run(5000, "real claim", "this is owner only work", "open", old); // a claim nobody has tested
  const card = db.prepare("INSERT INTO human_actions VALUES (?, ?, ?, 'open', ?, ?)");
  const closedWithEvidence = (id, ev) => { iss.run(id, "closed " + id, "d", "closed", old); db.prepare("INSERT INTO issue_triage VALUES (?, ?)").run(id, ev); };
  closedWithEvidence(2783, "measured: 0 rows"); card.run(103, "issue-2783", "receipt of closed with evidence", "owner-request-issue", cardAt);
  closedWithEvidence(2865, "  "); card.run(104, "issue-2865", "receipt, evidence blank", "owner-request-issue", cardAt);
  iss.run(2900, "still open", "d", "open", old); db.prepare("INSERT INTO issue_triage VALUES (2900, NULL)").run(); card.run(105, "issue-2900", "receipt of an open issue", "owner-request-issue", cardAt);
  card.run(300, "x", "a plain owner card", "owner-queue", cardAt);
  closedWithEvidence(2783 + 1, "ev"); card.run(301, "issue-2784", "same evidence but another source", "owner-queue", cardAt);
  const before = db.prepare("SELECT target FROM v_blocker_claims ORDER BY target").all().map((r) => r.target);
  ok(before.includes("card:103") && before.includes("issue:1947"), "before: the receipt and the false-match issue are listed", before);
  const [a, b] = runTwice(db, sql, (d) => JSON.stringify(d.prepare("SELECT target FROM v_blocker_claims ORDER BY target").all().map((r) => r.target)));
  const after = JSON.parse(a);
  ok(!after.includes("card:103"), "a receipt of an issue closed with evidence is not a claim", after);
  ok(after.includes("card:104") && after.includes("card:105") && after.includes("card:300") && after.includes("card:301"), "blank evidence, an open issue, a plain card and another source still count", after);
  for (const id of [1947, 2068, 2111, 2953, 99916, 99948]) ok(!after.includes("issue:" + id), "issue " + id + " is cleared by its signed red-team row");
  ok(after.includes("issue:5000"), "an untested claim is still listed", after);
  ok(a === b, "second run changes nothing");
  ok(one(db, "SELECT COUNT(*) n FROM blocker_redteam").n === 6 && one(db, "SELECT COUNT(*) n FROM blocker_redteam WHERE verdict = 'false-belief-removed' AND text_sig IS NOT NULL").n === 6, "six signed false-belief-removed rows, once");
  // after the 24 hour window only the text signature holds the verdict: unchanged text stays cleared, a changed text re-opens the claim
  db.exec("UPDATE blocker_redteam SET ts = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-3 days')");
  ok(db.prepare("SELECT COUNT(*) n FROM v_blocker_claims WHERE target LIKE 'issue:%' AND target <> 'issue:5000'").get().n === 0, "three days later the six signed rows still clear their issues");
  db.prepare("UPDATE agent_issues SET description = description || ' more' WHERE id = 2111").run();
  ok(db.prepare("SELECT COUNT(*) n FROM v_blocker_claims WHERE target = 'issue:2111'").get().n === 1, "a changed description makes the claim visible again");
  const det = db.prepare("SELECT COUNT(*) n FROM v_blocker_claims b JOIN human_actions h ON 'card:' || h.id = b.target WHERE h.source = 'owner-request-issue' AND EXISTS (SELECT 1 FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE 'issue-' || a.id = h.slug AND a.status IN ('closed', 'resolved') AND COALESCE(trim(t.close_evidence), '') <> '')").get().n;
  ok(det === 0, "the detector reads 0 after the repair");
  ok(registry(db, "blocker-claims-count-receipts").join() === "1,1" && decisions(db, "BLOCKER-CLAIMS-RECEIPTS-1:") === 1, "failure mode, detector contract and one decision, once");
  ok(one(db, "SELECT COUNT(*) n FROM sqlite_master WHERE name = 'bak_20261019_v_blocker_claims'").n === 1, "the backup table exists");
}

console.log("detector-measurement-repairs: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
