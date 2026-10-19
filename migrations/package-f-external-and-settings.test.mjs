// PACKAGE F offline suite (migrations/2026-10-19-package-f-external-and-settings.sql; agent_issues 2830, 2927, 2507, 2508, 2805).
// Replays the migration twice on a replica of the columns it writes (node:sqlite) and proves: it is idempotent; every code-read probe it
// registers is valid JSON whose `contains` text is in the named file today and whose `absent` text is not (so each contract passes against
// this checkout, and the one for the removed paths filter would fail against the old text); the d1-query detector runs and reads `no`
// until the steward records main_rules and `yes` after; each failure mode has a detector contract; the decision rows carry a prediction in
// the required form; and the header carries the CI opt-in lines.
// Run: node --no-warnings migrations/package-f-external-and-settings.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "migrations", "2026-10-19-package-f-external-and-settings.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "the header carries APPLY-BY, DB and Rollback");

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT, ts TEXT, last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER, next_due_at TEXT, max_items INTEGER, requires_container INTEGER, attempts INTEGER);
CREATE TABLE capability_ledger (capability TEXT, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE blocker_redteam (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, claim TEXT, attempt TEXT NOT NULL, verdict TEXT NOT NULL, evidence TEXT NOT NULL, actor TEXT, ts TEXT NOT NULL, text_sig TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (datetime('now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL);
CREATE TABLE github_steward_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, detail TEXT);
`);
const count = (t) => db.prepare("SELECT COUNT(*) AS n FROM " + t).get().n;
db.exec(sql);
const first = { fm: count("failure_modes"), rc: count("remediation_contracts"), cap: count("capability_ledger"), br: count("blocker_redteam"), dl: count("decision_log"), cr: count("control_registry") };
db.exec(sql);
const second = { fm: count("failure_modes"), rc: count("remediation_contracts"), cap: count("capability_ledger"), br: count("blocker_redteam"), dl: count("decision_log"), cr: count("control_registry") };
ok(JSON.stringify(first) === JSON.stringify({ fm: 4, rc: 6, cap: 3, br: 3, dl: 4, cr: 3 }), "the first apply writes 4 failure modes, 6 contracts, 3 capabilities, 3 red-team rows, 4 decisions, 3 control_registry rows", first);
ok(JSON.stringify(first) === JSON.stringify(second), "the second apply changes nothing (idempotent)", second);

// every failure mode has its fm- detector contract
const fms = db.prepare("SELECT fm_key, probe_class, issue_id FROM failure_modes").all();
ok(fms.every((f) => db.prepare("SELECT 1 FROM remediation_contracts WHERE class = ?").get("fm-" + f.fm_key) && f.probe_class === "fm-" + f.fm_key), "each failure mode has an fm-<key> detector contract and probe_class", fms);

// code-read probes: valid JSON, the file exists, `contains` is present now, `absent` is not
const reads = db.prepare("SELECT class, verify_probe FROM remediation_contracts WHERE verify_transport = 'code-read'").all();
ok(reads.length === 4, "four code-read contracts (the prompt-store detector reads the work claim, not a file)", reads.map((r) => r.class));
for (const r of reads) {
  let p = null; try { p = JSON.parse(r.verify_probe); } catch (e) { p = null; }
  ok(p && Array.isArray(p.paths) && p.paths.length === 1 && (p.contains || p.absent) && !Object.keys(p).some((k) => !["paths", "contains", "absent"].includes(k)), r.class + " is a valid code-read probe", r.verify_probe);
  if (!p) continue;
  const f = join(root, p.paths[0]);
  ok(existsSync(f), r.class + " names a file that exists: " + p.paths[0]);
  if (!existsSync(f)) continue;
  const text = readFileSync(f, "utf8");
  if (p.contains) ok(text.includes(p.contains), r.class + " passes: the file holds " + JSON.stringify(p.contains));
  if (p.absent) ok(!text.toLowerCase().includes(p.absent.toLowerCase()), r.class + " passes: the file no longer holds " + JSON.stringify(p.absent));
}
// the removed paths filter: the old trigger text is what the probe would have failed on
const oldTrigger = "  pull_request:\n    paths:\n      - '*/worker.js'";
const absentProbe = JSON.parse(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-required-check-path-filtered'").get().verify_probe).absent;
ok(oldTrigger.includes(absentProbe) && !readFileSync(join(root, ".github/workflows/version-bump-guard.yml"), "utf8").includes(absentProbe), "the `absent` text is exactly the old filtered trigger, and the workflow no longer has it");
ok(/^  merge_group:$/m.test(readFileSync(join(root, ".github/workflows/deploy-gate.yml"), "utf8")), "deploy-gate.yml has the merge_group trigger the sibling issue-2830 contract reads");

// the d1-query detector
const q = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-steward-protection-answer-dropped'").get().verify_probe;
const run = () => db.prepare(q).get();
ok(run().expected === "yes" && run().observed === "no", "before the steward records main_rules the detector reads no", run());
db.prepare("INSERT INTO github_steward_runs (detail) VALUES (?)").run(JSON.stringify({ main_rules: { status: 200, types: ["deletion"], required_checks: "no" } }));
ok(run().observed === "yes", "after a run that records main_rules (even required_checks no) the detector reads yes", run());

// the gates are recorded with a disposition, a critical-path flag and a tested alternate
const cr = db.prepare("SELECT control, disposition, disposition_state, critical_path, alternate_path, alternate_tested_at, issue_id FROM control_registry").all();
ok(cr.length === 3 && cr.every((c) => c.disposition === "keep" && c.critical_path === 1 && c.alternate_path && c.alternate_path.length > 20) && cr.filter((c) => c.disposition_state === "planned").length === 1 && cr.find((c) => c.disposition_state === "planned").control === "github-main-gate-ruleset", "three gates are in control_registry with an alternate path; the ruleset is planned, not applied", cr);

// the decisions
const dl = db.prepare("SELECT action, predicted_outcome, rollback_path FROM decision_log").all();
ok(dl.every((d) => /^\S+ [=<>]+ \d+ within \d+ h$|^\S+ observed = \S+ within \d+ h$|^github_steward main_rules\.required_checks = yes within \d+ h of the live apply$|^issue-\d+ probe observed = \w+ within \d+ h of the live write$|^issue-2805 probe observed = ok within \d+ h of the machine step$/.test(d.predicted_outcome) && d.rollback_path.length > 10), "each decision logs a predicted_outcome of the form <metric> <op> <number> within <N> h and a rollback path", dl.map((d) => d.predicted_outcome));
ok(dl.some((d) => /^fm_merge_boundary_load_unchecked = 0 within 2 h$/.test(d.predicted_outcome)), "the 2830 decision predicts its detector at 0 within 2 h");

// blocker rows carry a verdict from the allowed set and a surfaces line
const br = db.prepare("SELECT target, verdict, evidence FROM blocker_redteam").all();
ok(br.every((b) => ["false-belief-removed", "workaround-built", "confirmed-with-evidence"].includes(b.verdict) && /\| surfaces: /.test(b.evidence)), "every red-team row has an allowed verdict and a surfaces line", br.map((b) => b.target + " " + b.verdict));
ok(br.find((b) => b.target === "issue:2507").evidence.includes("begins with '.'") && br.find((b) => b.target === "issue:2927").evidence.includes("Resource not accessible by integration"), "the refusals are recorded verbatim");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
