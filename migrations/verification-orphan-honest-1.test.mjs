// VERIFICATION-ORPHAN-HONEST-1 offline suite: replays migrations/2026-10-26-verification-orphan-honest-1.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); the two metrics are registered with a named trigger exemption in their formula and read the right
// values on a fixture with attributed and orphan rows (the same time window and trust join as RUNTIME_SHARE_SQL of scripts/remediation_consumer.py, read from that file); fleet_tasks metric-refresh gains
// exactly one step (appended, the others byte for byte, version +1, a replay adds none) whose stored SQL recomputes both; the closing probe of issue 1000045 is accepted by the consumer's own
// is_literal_select rules, passes on fresh and truthful metrics and fails on a stale metric, a wrong orphan count, a wrong share and a missing metric; a contract another doer wrote is left alone; the
// FINDING block is appended once; the decision is logged once; the Rollback line takes it all back.
// Run: node migrations/verification-orphan-honest-1.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-verification-orphan-honest-1.sql", import.meta.url), "utf8");
const consumer = readFileSync(new URL("../scripts/remediation_consumer.py", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes (D1 limit)");

// the consumer's own definition of a probe it will run (write keywords and a single statement)
const wk = /WRITE_KW = \(([\s\S]*?)\n\)/.exec(consumer);
const WRITE_KW = [...wk[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const literalSelect = (s) => { const low = s.trim().toLowerCase(); return (low.startsWith("select") || low.startsWith("with")) && !WRITE_KW.some((k) => low.includes(k)) && !s.trim().replace(/;$/, "").includes(";"); };
const rs = /RUNTIME_SHARE_SQL = \(([\s\S]*?)\)\n\n\ndef refresh_runtime_share/.exec(consumer);
ok(!!rs && /FROM remediation_verifications v LEFT JOIN transport_trust t/.test(rs[1]), "RUNTIME_SHARE_SQL is read from scripts/remediation_consumer.py");

const iso = (agoH) => new Date(Date.now() - agoH * 3600e3).toISOString().slice(0, 19) + "Z";
const sqlTime = (agoH) => new Date(Date.now() - agoH * 3600e3).toISOString().slice(0, 19).replace("T", " ");
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE metric_authorship (metric TEXT PRIMARY KEY, status TEXT);
CREATE TRIGGER metric_authorship_birth AFTER INSERT ON metric_registry BEGIN INSERT OR IGNORE INTO metric_authorship (metric, status) VALUES (NEW.metric, 'probation'); END;
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT, verifier TEXT);
CREATE TABLE transport_trust (transport TEXT PRIMARY KEY, observation_class TEXT NOT NULL DEFAULT 'x', runtime_observable INTEGER NOT NULL DEFAULT 0, independent INTEGER NOT NULL DEFAULT 0, trusted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', last_verdict TEXT, module TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'open');
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  w.exec(`INSERT INTO transport_trust (transport, runtime_observable, independent, trusted) VALUES ('runner-https', 1, 1, 1), ('external-https', 1, 1, 1), ('d1-query', 0, 0, 1), ('code-read', 0, 1, 1)`);
  const steps = [
    { type: "sql", db: "AUDIT", sql: "UPDATE metric_registry SET last_value = 'x' WHERE metric = 'code_tasks_30d'" },
    { type: "sql", db: "AUDIT", sql: "UPDATE metric_registry SET last_value = 'y' WHERE metric = 'breach_code_task_pct'" },
    { type: "sql", db: "AUDIT", sql: "SELECT 1" },
  ];
  w.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, updated_at) VALUES ('metric-refresh', 'METRIC-REFRESH-1', 'workflow', ?, 3, '2026-10-19T23:26:22Z')").run(JSON.stringify({ steps }));
  w.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value, state, formula) VALUES ('runtime_verified_share_24h', 'system', 'guard', '8.7', 'MEASURED', 'f')").run();
  w.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (1000045, 'VERIFICATION-ORPHAN-STORM: x', 'MEASURED 2026-10-24 ... code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js', 'open')").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module) VALUES ('issue-1000045', 1000045, 'no earlier birth template matched this issue', 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open', 'SELECT ''closed'' AS expected, NULL AS observed', 'd1-query', 'qnfo-fleet-control', 1, 'superseded', 'superseded:closure-observing-probe-at-birth', 'probe-template-v3-generic')").run();
  // 10 attributed rows in the window (1 runtime-observable, trusted and independent), 2 attributed rows outside the 24 h window; 30 orphan rows in the window, 5 outside
  const v = w.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, pass, verified_at) VALUES (?, ?, ?, 1, ?)");
  v.run(7, "issue-7", "runner-https", iso(1));
  for (let i = 0; i < 9; i++) v.run(8 + i, "issue-" + (8 + i), "d1-query", i % 2 ? iso(2) : sqlTime(2));   // both timestamp shapes of the live table
  for (let i = 0; i < 2; i++) v.run(50 + i, "issue-" + (50 + i), "runner-https", iso(30));
  for (let i = 0; i < 30; i++) v.run(null, "fm-" + (i % 6), i < 3 ? "runner-https" : "d1-query", i % 2 ? iso(3) : sqlTime(3));
  for (let i = 0; i < 5; i++) v.run(null, "fm-old", "d1-query", iso(40));
  return w;
}
const one = (w, s, ...p) => w.prepare(s).get(...p);
const all = (w, s, ...p) => w.prepare(s).all(...p);
const stepsOf = (w) => JSON.parse(one(w, "SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'").definition).steps;
const val = (w, m) => one(w, "SELECT * FROM metric_registry WHERE metric = ?", m);

const w = world();
const stepsBefore = stepsOf(w), verBefore = one(w, "SELECT version v FROM fleet_tasks WHERE id = 'metric-refresh'").v;
const guardBefore = JSON.stringify(val(w, "runtime_verified_share_24h"));
w.exec(sql);
w.exec(sql);   // a replay changes nothing

// ---- the metrics
const a = val(w, "attributed_runtime_verified_share_24h"), o = val(w, "orphan_verification_rows_24h");
ok(a && a.kind === "guard" && a.layer === "system" && a.refresh_cadence === "hourly" && /Trigger exemption/.test(a.formula) && /runtime_verified_share_24h/.test(a.formula) && a.target.startsWith(">= 25"), "attributed_runtime_verified_share_24h: a guard with the original target and a named trigger exemption", a);
ok(o && o.kind === "operational" && o.refresh_cadence === "hourly" && /Trigger exemption/.test(o.formula) && o.target === "informational (no bound)", "orphan_verification_rows_24h: operational, informational, with a named trigger exemption", o);
ok(a.source_of_truth && a.disposition_actor && a.owner, "both carry source_of_truth, disposition_actor and owner (METRIC-INTEGRITY-1)");
ok(a.state === "MEASURED" && a.last_value === "10.0" && o.state === "MEASURED" && o.last_value === "30", "values at apply: attributed share 10.0 (1 of 10 attributed rows in 24 h), orphan rows 30 (the 5 old and the 2 old attributed rows are outside)", [a.last_value, o.last_value]);
ok(JSON.stringify(val(w, "runtime_verified_share_24h")) === guardBefore, "runtime_verified_share_24h is untouched: same definition, same target, same value");
ok(one(w, "SELECT COUNT(*) n FROM metric_authorship WHERE metric IN ('attributed_runtime_verified_share_24h', 'orphan_verification_rows_24h')").n === 2, "the birth trigger put both on probation");
// the share equals what the consumer's own SQL gives when it is restricted to attributed rows
const mine = one(w, rs[1].replace(/"\s*\n\s*"/g, "").replace(/^\s*"/, "").replace(/"\s*$/, "").replace("WHERE replace", "WHERE v.issue_id IS NOT NULL AND replace"));
ok(String(mine.v) === "10" || String(mine.v) === "10.0", "the metric agrees with RUNTIME_SHARE_SQL restricted to attributed rows", mine);

// ---- the workflow
const stepsAfter = stepsOf(w);
ok(stepsAfter.length === stepsBefore.length + 1 && stepsAfter[stepsAfter.length - 1].name === "attributed-share", "metric-refresh gains exactly one step, last, although the file ran twice");
ok(JSON.stringify(stepsAfter.slice(0, stepsBefore.length)) === JSON.stringify(stepsBefore), "every earlier step is byte for byte as it was");
ok(one(w, "SELECT version v FROM fleet_tasks WHERE id = 'metric-refresh'").v === verBefore + 1, "the version moves by one, once");
const stepSql = stepsAfter[stepsAfter.length - 1].sql;
ok(!/;/.test(stepSql) && !/"/.test(stepSql) && stepSql.startsWith("UPDATE metric_registry"), "the step is one UPDATE of metric_registry with no semicolon and no double quote");
ok(one(w, "SELECT COUNT(*) n FROM bak_20261026_voh1_workflow").n === 1 && JSON.parse(one(w, "SELECT definition d FROM bak_20261026_voh1_workflow").d).steps.length === stepsBefore.length, "the backup holds the workflow as it was");
// the stored step recomputes both
const v = w.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, pass, verified_at) VALUES (?, ?, ?, 1, ?)");
v.run(99, "issue-99", "runner-https", iso(0.5)); v.run(100, "issue-100", "runner-https", iso(0.5)); v.run(null, "fm-x", "d1-query", iso(0.2));
w.prepare("UPDATE metric_registry SET last_refreshed = '2000-01-01T00:00:00Z' WHERE metric IN ('attributed_runtime_verified_share_24h', 'orphan_verification_rows_24h')").run();
const r = w.prepare(stepSql).run();
ok(r.changes === 2 && val(w, "attributed_runtime_verified_share_24h").last_value === "25.0" && val(w, "orphan_verification_rows_24h").last_value === "31" && val(w, "attributed_runtime_verified_share_24h").last_refreshed > "2026", "the stored step recomputes both (3 of 12 attributed rows runtime = 25.0, 31 orphan rows) and stamps them", [val(w, "attributed_runtime_verified_share_24h").last_value, val(w, "orphan_verification_rows_24h").last_value]);
ok(JSON.stringify(val(w, "runtime_verified_share_24h")) === guardBefore, "the step leaves the original guard alone");
const nA = world(); nA.exec("DELETE FROM remediation_verifications WHERE issue_id IS NOT NULL"); nA.exec(sql);
ok(val(nA, "attributed_runtime_verified_share_24h").last_value === "n/a", "with no attributed row in 24 h the share reads n/a, not 0");

// ---- the closing probe of issue 1000045
const c = one(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000045'");
ok(c.status === "active" && c.verify_transport === "d1-query" && c.module === "verification-orphan-honest-1" && c.attempts === 0 && c.last_verdict === null && /MEASURES the definition of done/.test(c.action), "the contract of issue 1000045 is replaced by an active d1-query probe", c);
ok(literalSelect(c.verify_probe), "the probe passes the consumer's is_literal_select rules (a single read, none of its write keywords)");
ok(!/\bagent_issues\b/.test(c.verify_probe), "the probe never reads an issue (CLOSE-PROBE-CIRCULAR-1)");
const probe = c.verify_probe;
w.prepare("UPDATE metric_registry SET last_refreshed = ?, last_value = '25.0' WHERE metric = 'attributed_runtime_verified_share_24h'").run(iso(0));
w.prepare("UPDATE metric_registry SET last_refreshed = ?, last_value = '31' WHERE metric = 'orphan_verification_rows_24h'").run(iso(0));
let res = one(w, probe);
ok(res.expected === "ok" && res.observed === "ok", "the probe passes on fresh and truthful metrics", res);
w.prepare("UPDATE metric_registry SET last_refreshed = ? WHERE metric = 'orphan_verification_rows_24h'").run(iso(4));
ok(/not both measured within 180 minutes/.test(one(w, probe).observed), "it fails on a metric older than 180 minutes");
w.prepare("UPDATE metric_registry SET last_refreshed = ?, last_value = '5' WHERE metric = 'orphan_verification_rows_24h'").run(iso(0));
ok(/orphan_verification_rows_24h differs from the live count/.test(one(w, probe).observed), "it fails on a wrong orphan count");
w.prepare("UPDATE metric_registry SET last_value = '31' WHERE metric = 'orphan_verification_rows_24h'").run();
w.prepare("UPDATE metric_registry SET last_value = '60.0' WHERE metric = 'attributed_runtime_verified_share_24h'").run();
ok(/attributed_runtime_verified_share_24h differs from the live value/.test(one(w, probe).observed), "it fails on a wrong share");
w.prepare("UPDATE metric_registry SET last_value = '25.0' WHERE metric = 'attributed_runtime_verified_share_24h'").run();
w.prepare("DELETE FROM metric_registry WHERE metric = 'orphan_verification_rows_24h'").run();
ok(/not both measured/.test(one(w, probe).observed), "it fails on a missing metric");
w.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value, last_refreshed, state) VALUES ('orphan_verification_rows_24h', 'system', 'operational', '31', ?, 'MEASURED')").run(iso(0));
ok(one(w, probe).observed === "ok", "and passes again once restored");
// a contract another doer wrote is left alone
const d = world();
d.exec("UPDATE remediation_contracts SET status = 'active', module = 'someone-else', action = 'a doer wrote this' WHERE class = 'issue-1000045'");
d.exec(sql);
ok(one(d, "SELECT module m FROM remediation_contracts WHERE class = 'issue-1000045'").m === "someone-else", "a contract another doer wrote is left alone");
const cl = world();
cl.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 1000045");
cl.exec(sql);
ok(one(cl, "SELECT status s FROM remediation_contracts WHERE class = 'issue-1000045'").s === "superseded", "a closed issue 1000045 keeps its contract");

// ---- the finding and the decision
const desc = one(w, "SELECT description d FROM agent_issues WHERE id = 1000045").d;
ok((desc.match(/FINDING 2026-10-26 \(rem-a2, VERIFICATION-ORPHAN-HONEST-1\)/g) || []).length === 1 && /549 contracts that guard no issue/.test(desc) && /Not done, by decision/.test(desc), "the FINDING block is appended once and states what was not done");
ok(desc.startsWith("MEASURED 2026-10-24") && /code-task: repo=qnfo-workers path=qnfo-fleet-control\/worker\.js/.test(desc), "the original description and its code-task line are kept");
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'VERIFICATION-ORPHAN-HONEST-1') > 0").n === 1, "one decision_log row after two applies");
const dl = one(w, "SELECT * FROM decision_log WHERE instr(action, 'VERIFICATION-ORPHAN-HONEST-1') > 0");
ok(dl.actor.startsWith("rem-a2") && dl.rollback_path.length > 40 && dl.predicted_outcome.length > 40 && dl.capability_gain === "attributed-share-measured", "the decision names its actor, rollback, prediction and capability gain");

// ---- the Rollback
const down = /^-- Rollback: (.*)$/m.exec(sql)[1].split(";").map((s) => s.trim()).filter(Boolean);
ok(down.length === 5, "the Rollback is five statements", down.length);
for (const s of down) w.exec(s);
ok(stepsOf(w).length === stepsBefore.length && JSON.stringify(stepsOf(w)) === JSON.stringify(stepsBefore), "Rollback: the step is gone and the other steps are as they were");
const back = one(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000045'");
ok(back.status === "superseded" && back.module === "probe-template-v3-generic" && /^VACUOUS-PROBE-V3-1/.test(back.action) && /superseded:closure-observing/.test(back.last_verdict), "Rollback: the contract of issue 1000045 is back on the generic contract", back);
ok(!/FINDING 2026-10-26/.test(one(w, "SELECT description d FROM agent_issues WHERE id = 1000045").d), "Rollback: the FINDING block is stripped");
ok(!val(w, "attributed_runtime_verified_share_24h") && !val(w, "orphan_verification_rows_24h") && !one(w, "SELECT 1 x FROM metric_authorship WHERE metric = 'orphan_verification_rows_24h'"), "Rollback: both metrics and their authorship rows are gone");
ok(JSON.stringify(val(w, "runtime_verified_share_24h")) === guardBefore, "Rollback: the original guard is as it was");
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'VERIFICATION-ORPHAN-HONEST-1') > 0").n === 1, "decision_log keeps its row (append-only)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
