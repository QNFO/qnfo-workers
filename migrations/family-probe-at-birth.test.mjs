// FM-4 offline suite: new METRIC-UNMEASURED-1 and CF-OBS-ISSUE-1 issues get measuring probes before the generic birth template.
// Run: node --no-warnings migrations/family-probe-at-birth.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-11-01-family-probe-at-birth.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, source TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, verify_probe TEXT, verify_transport TEXT, module TEXT, attempts INTEGER DEFAULT 0, last_verdict TEXT, next_due_at TEXT, precondition TEXT, action TEXT);
CREATE TABLE metric_improvement_now (owner TEXT, verdict TEXT, bp26 INTEGER);
CREATE TABLE fleet_issue_dispatch (fingerprint TEXT PRIMARY KEY, category TEXT, state TEXT, payload TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT, prerequisites TEXT, reliability REAL, acquired_at TEXT, evidence TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TRIGGER birth AFTER INSERT ON agent_issues
WHEN NEW.status = 'open'
BEGIN
  INSERT INTO remediation_contracts (class, issue_id, status, verify_probe, verify_transport, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 'birth');
END;
CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
BEGIN
  UPDATE remediation_contracts
  SET status = 'superseded', module = 'probe-template-v3-generic',
      verify_probe = 'SELECT ''closed'' AS expected, NULL AS observed',
      action = 'VACUOUS-PROBE-V3-1'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;
`);

let pass = 0, fail = 0;
const ok = (condition, name, actual) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + name + (actual === undefined ? "" : " :: " + JSON.stringify(actual).slice(0, 500)));
  }
};
const one = (query, ...values) => db.prepare(query).get(...values);
const insertIssue = db.prepare("INSERT INTO agent_issues (title, description, status, source) VALUES (?, ?, 'open', ?)");
const readProbe = (id) => {
  const c = one("SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + id);
  return { contract: c, result: one(c.verify_probe) };
};

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "migration opts in with required headers");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "")), "migration body does not delete or drop data");
db.exec(sql);
db.exec(sql);
ok(one("SELECT COUNT(*) AS n FROM capability_ledger WHERE capability = 'family-specific-measuring-probes-at-issue-birth'").n === 1, "the capability ledger records the new birth-time measuring path once");
ok(one("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'FM-4: install family-specific measuring probes%'").n === 1, "the predicted outcome and revert path are recorded once");

db.exec("INSERT INTO metric_improvement_now VALUES ('svc''quoted', 'unmeasured', 0), ('svc''quoted', 'unmeasured', 0), ('other-service', 'unmeasured', 0)");
insertIssue.run("METRIC-UNMEASURED-1: svc'quoted has metrics with no value", "", "management-personas");
const metricIssue = one("SELECT id FROM agent_issues WHERE title LIKE 'METRIC-UNMEASURED-1:%'");
let metric = readProbe(metricIssue.id);
ok(metric.contract.status === "active" && metric.contract.module === "issue-birth-probe-families" && metric.contract.verify_transport === "d1-query", "metric issue is active on its real probe at birth", metric.contract);
ok(metric.result.expected === "0" && metric.result.observed === "2", "metric probe measures this owner's unmeasured metrics and escapes owner text", metric.result);
ok(!/agent_issues|issue_triage|remediation_contracts|VACUOUS-PROBE/i.test(metric.contract.verify_probe), "metric probe reads no issue or contract bookkeeping");
db.exec("UPDATE metric_improvement_now SET verdict = 'on-target' WHERE owner = 'svc''quoted'");
metric = readProbe(metricIssue.id);
ok(metric.result.expected === "0" && metric.result.observed === "0", "metric probe passes only after that owner's unmeasured metrics clear", metric.result);
insertIssue.run("METRIC-UNMEASURED-1: service-with-no-snapshot has metrics with no value", "", "management-personas");
const noSnapshot = one("SELECT id FROM agent_issues WHERE title LIKE '%service-with-no-snapshot%'");
const noSnapshotProbe = readProbe(noSnapshot.id);
ok(noSnapshotProbe.contract.status === "active" && noSnapshotProbe.result.observed === "missing", "missing metric evidence cannot make a new issue pass", noSnapshotProbe);

const obsDescription = (id) => "Cloudflare issue group.\ncf-obs-id: " + id + "\nDetails.";
insertIssue.run("CF-OBS-ISSUE-1: worker-a: exception", obsDescription("group-42"), "cf-obs-bridge");
const obsIssue = one("SELECT id FROM agent_issues WHERE title LIKE 'CF-OBS-ISSUE-1:%'");
let obs = readProbe(obsIssue.id);
ok(obs.contract.status === "active" && obs.contract.module === "issue-birth-probe-families", "observability issue is active on its real probe at birth", obs.contract);
ok(obs.result.expected === "1" && obs.result.observed === "missing", "a missing dispatch observation does not vacuously pass", obs.result);
ok(!/agent_issues|issue_triage|remediation_contracts|VACUOUS-PROBE/i.test(obs.contract.verify_probe), "observability probe measures dispatch state, not the issue's own status");
db.prepare("UPDATE remediation_contracts SET verify_probe = ?, verify_transport = 'd1-query' WHERE class = ?")
  .run("SELECT '1' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM fleet_issue_dispatch d WHERE d.fingerprint = 'cf-obs-group-42' AND d.state <> 'resolved' AND CAST(json_extract(d.payload, '$.lastObserved') AS INTEGER) > 0) THEN '1' ELSE '0' END AS observed", "issue-" + obsIssue.id);
obs = readProbe(obsIssue.id);
ok(obs.contract.verify_probe.includes("ELSE 'missing' END AS observed") && obs.result.observed === "missing", "the dispatch bridge's post-insert probe update is normalized to the missing-evidence-safe probe", obs);
db.prepare("INSERT INTO fleet_issue_dispatch VALUES (?, 'worker-observability', 'active', ?)").run("cf-obs-group-42", JSON.stringify({ lastObserved: Date.now() }));
obs = readProbe(obsIssue.id);
ok(obs.result.observed === "0", "a recently observed active group keeps the contract failing", obs.result);
db.prepare("UPDATE fleet_issue_dispatch SET payload = ? WHERE fingerprint = ?").run(JSON.stringify({ lastObserved: Date.now() - 7 * 60 * 60 * 1000 }), "cf-obs-group-42");
obs = readProbe(obsIssue.id);
ok(obs.result.observed === "1", "a quiet group satisfies its six-hour measurement", obs.result);
db.prepare("UPDATE fleet_issue_dispatch SET state = 'resolved' WHERE fingerprint = ?").run("cf-obs-group-42");
ok(readProbe(obsIssue.id).result.observed === "1", "a resolved Cloudflare group satisfies the measurement");

insertIssue.run("UNRELATED-ISSUE: not in the two families", "", "test");
const other = one("SELECT id FROM agent_issues WHERE title LIKE 'UNRELATED-ISSUE:%'");
const unrelated = one("SELECT status, module, action FROM remediation_contracts WHERE class = ?", "issue-" + other.id);
ok(unrelated.status === "superseded" && unrelated.module === "probe-template-v3-generic" && unrelated.action === "VACUOUS-PROBE-V3-1", "other issue families retain the generic fallback", unrelated);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
