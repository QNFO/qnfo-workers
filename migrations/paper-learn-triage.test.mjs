// PAPER-LEARN-TRIAGE-1 offline suite: replays migrations/2026-10-20-paper-learn-triage.sql on SQLite.
// Proves: the 18 learnings of the five open PAPER-LEARN-1 issues are all settled (the closing probe of each issue reads 0), with the intended disposition and a cited note; a learning of another
// version and one already settled by someone else are left alone; every catalogue probe is one SELECT that reads ok on a healthy fleet and absent when its mechanism is missing; the detector is one
// SELECT; a second apply changes nothing; the Rollback line restores the 18 rows.
// Run: node --no-warnings migrations/paper-learn-triage.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-20-paper-learn-triage.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE paper_learnings (id INTEGER PRIMARY KEY, slug TEXT, version TEXT, claim TEXT, kind TEXT, applicability TEXT, fleet_status TEXT DEFAULT 'proposed', status_note TEXT, issue_id INTEGER, updated_at TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
  CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT);
  CREATE TABLE cf_model_eval_runs (id INTEGER PRIMARY KEY);
  CREATE TABLE trust_src (x INTEGER); CREATE VIEW v_trust_ledger AS SELECT * FROM trust_src;
  CREATE TABLE queue_src (x INTEGER); CREATE VIEW v_issue_queue AS SELECT * FROM queue_src;
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const issues = { 100234: [14, 15, 16, 17], 100249: [45, 46, 47, 48], 100252: [62], 100257: [93, 94, 96], 100261: [131, 132, 133, 134, 136, 137] };
const where = { 100234: ["functorial", "1.0.1"], 100249: ["adelic", "1.0.1"], 100252: ["time", "1.0.1"], 100257: ["ultra", "1.1.1"], 100261: ["odr", "1.0.1"] };
for (const [iss, ids] of Object.entries(issues)) for (const id of ids) d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability, issue_id) VALUES (?, ?, ?, 'claim', 'derived', 'direct', ?)").run(id, where[iss][0], where[iss][1], Number(iss));
d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability) VALUES (227, 'ultra', '1.0.0', 'x', 'assumption', 'direct')").run();
d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability, fleet_status, status_note) VALUES (500, 'odr', '1.0.1', 'x', 'derived', 'direct', 'applied', 'by hand')").run();
// a healthy fleet for the catalogue probes
d.prepare("INSERT INTO ops_config (key, value) VALUES ('claim_integrity_mode', 'enforce'), ('budget_cap_free_fallback', 'enforced')").run();
for (const k of ["claim-integrity", "revise-patch", "review-unresolved"]) d.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?, 'x', 'qnfo-research-exec', 'ok')").run("e-" + k, k);
d.prepare("INSERT INTO cf_model_eval_runs (id) VALUES (1)").run();
d.prepare("INSERT INTO agent_issues (id, title, status) VALUES (1, 'an open issue', 'open')").run();
d.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to) VALUES ('issue-1', 1, 'p', 'a', 'SELECT 1', 'd1-query', 'x')").run();
const snapshot = () => JSON.stringify(d.prepare("SELECT id, fleet_status, status_note FROM paper_learnings ORDER BY id").all());
d.exec(sql);
const row = (id) => d.prepare("SELECT * FROM paper_learnings WHERE id = ?").get(id);
const want = { 14: "already-in-place", 45: "already-in-place", 46: "already-in-place", 62: "already-in-place", 93: "already-in-place", 131: "already-in-place", 94: "already-in-place", 96: "already-in-place", 133: "already-in-place", 137: "already-in-place", 15: "applied", 16: "rejected", 17: "rejected", 47: "rejected", 48: "rejected", 134: "rejected", 132: "rejected", 136: "rejected" };
for (const [id, st] of Object.entries(want)) ok(row(Number(id)).fleet_status === st && /^PL-TRIAGE-1 /.test(row(Number(id)).status_note), "learning " + id + " is " + st + " with a PL-TRIAGE-1 note", row(Number(id)));
ok(Object.keys(want).length === 18, "all 18 learnings have a disposition");
// the closing probe of each issue (PAPER-LEARN-1 writes exactly this form)
for (const [iss, ids] of Object.entries(issues)) {
  const n = d.prepare("SELECT COUNT(*) AS n FROM paper_learnings WHERE slug = ? AND version = ? AND applicability = 'direct' AND fleet_status = 'proposed'").get(where[iss][0], where[iss][1]).n;
  ok(n === 0, "issue " + iss + ": no direct learning is still proposed", n);
}
ok(row(227).fleet_status === "proposed", "a direct learning of another version is left to the hourly triage");
ok(row(500).fleet_status === "applied" && row(500).status_note === "by hand", "a row someone else settled is untouched");
ok(/in place.*claim-integrity.*claim_integrity_mode = enforce/.test(row(14).status_note) && /ensemble-review/.test(row(94).status_note) && /priority-queue/.test(row(136).status_note), "notes cite the mechanism and the evidence");
// catalogue
const mechs = d.prepare("SELECT * FROM paper_learning_mechanisms ORDER BY mech_key").all();
ok(mechs.length === 6 && mechs.every((m) => m.status === "active"), "six active mechanisms", mechs.map((m) => m.mech_key));
for (const m of mechs) {
  ok(/^SELECT /.test(m.evidence_probe) && !m.evidence_probe.includes(";") && !/(insert|update|delete|drop)\s/i.test(m.evidence_probe), "probe of " + m.mech_key + " is one read-only SELECT");
  ok(d.prepare(m.evidence_probe).get().observed === "ok", "probe of " + m.mech_key + " reads ok on a healthy fleet", d.prepare(m.evidence_probe).get());
  ok(m.citation.length > 40, "citation of " + m.mech_key);
}
const probe = (k) => d.prepare(d.prepare("SELECT evidence_probe FROM paper_learning_mechanisms WHERE mech_key = ?").get(k).evidence_probe).get().observed;
d.exec("UPDATE ops_config SET value = 'off' WHERE key = 'claim_integrity_mode'");
ok(probe("claim-integrity") === "absent", "claim-integrity reads absent when the gate is off");
d.exec("UPDATE ops_config SET value = 'enforce' WHERE key = 'claim_integrity_mode'; DELETE FROM cloud_ops_events WHERE kind = 'review-unresolved'");
ok(probe("ensemble-review") === "absent", "ensemble-review reads absent without review events");
d.exec("DELETE FROM cf_model_eval_runs");
ok(probe("budget-steering-eval") === "absent", "budget-steering-eval reads absent without evaluation runs");
d.exec("DROP VIEW v_trust_ledger; DROP VIEW v_issue_queue");
ok(probe("trust-computed") === "absent" && probe("priority-queue") === "absent", "a missing view reads absent");
const det = d.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-verify-zero-claims-quantitative'").get();
d.exec("DELETE FROM remediation_contracts WHERE class = 'issue-1'");
ok(probe("issue-contract-at-birth") === "absent", "an open issue without a contract reads absent");
// the detector
ok(det && det.status === "active" && /^SELECT '1' AS expected/.test(det.verify_probe) && !det.verify_probe.includes(";"), "the detector is one SELECT with the fm- class", det);
ok(d.prepare(det.verify_probe).get().observed === "1", "no zero-claim events: the detector reads 1");
for (let i = 0; i < 5; i++) d.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'verify-zero-claims', 'x', 'qnfo-research-exec', 'warn')").run("z" + i);
ok(d.prepare(det.verify_probe).get().observed === "0", "five events in 24 h: the detector reads 0");
ok(d.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'verify-zero-claims-quantitative' AND probe_class = 'fm-verify-zero-claims-quantitative'").get().n === 1, "the failure mode row names its probe class");
ok(d.prepare("SELECT value FROM ops_config WHERE key = 'paper_learn_triage'").get().value === "on", "paper_learn_triage is on");
// idempotence and rollback
const before = snapshot();
d.exec(sql);
ok(snapshot() === before && d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "a second apply changes nothing and logs one decision");
d.exec(rollback);
ok([14, 15, 16, 136].every((id) => row(id).fleet_status === "proposed" && row(id).status_note === null), "Rollback returns the learnings to proposed");
ok(row(500).fleet_status === "applied", "Rollback leaves other rows alone");
ok(!d.prepare("SELECT name FROM sqlite_master WHERE name = 'paper_learning_mechanisms'").get(), "Rollback drops the catalogue");
console.log("paper-learn-triage migration: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
