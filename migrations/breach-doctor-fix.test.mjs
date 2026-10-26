// BREACH-DOCTOR-FIX-1 offline suite: replays migrations/2026-10-26-breach-doctor.sql and then migrations/2026-10-26-breach-doctor-fix.sql on node:sqlite over the live column lists.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, no DELETE or DROP in the body so no BACKUP, no trigger, no write to fleet_tick); the age gate moves 120 -> 60 by
// compare-and-set (a value someone else changed is left alone) and no doctor threshold exceeds 120 minutes; the metric formula says the flag comes at min(120, gate + 60) and no longer says 180;
// the allowlist control describes four tables and a top-level id predicate; the demotion is a recorded pause with a release (control breach-doctor-auto-demotion, reason and expiry) and the age gate
// a recorded filter; the durable detector fm-breach-doctor-rule-latched reads 0 for a fresh rule, 1 for a demotion older than 120 minutes and 0 for one inside it, for a rule disabled or set to
// measure by hand and for a rule on; the probe passes the write-keyword guard and no LIKE pattern is over D1's 50 bytes; the older failure mode, root cause and capability ledger are updated; the
// decision_log row is one append with a rollback path and no parsed prediction; a second apply changes nothing; the Rollback line restores the age gate and the formula, removes what the file
// added and never touches decision_log; and the engine constants the rows state are the engine's.
// Run: node migrations/breach-doctor-fix.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const base = readFileSync(new URL("./2026-10-26-breach-doctor.sql", import.meta.url), "utf8");
const fix = readFileSync(new URL("./2026-10-26-breach-doctor-fix.sql", import.meta.url), "utf8");
const baseTest = readFileSync(new URL("./breach-doctor.test.mjs", import.meta.url), "utf8");
const workerSrc = readFileSync(process.env.BD_WORKER_PATH || new URL("../qnfo-fleet-control/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- header
const header = fix.split("\n").filter((l) => l.startsWith("--"));
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
const body = fix.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !header.some((l) => /^-- BACKUP:/.test(l)), "the body deletes and drops nothing, so no BACKUP header is needed");
ok(!/CREATE\s+(TABLE|TRIGGER|VIEW)/i.test(body) && !/\b(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+fleet_tick/i.test(body), "no new table family, no D1 trigger and no write to fleet_tick");
ok(!/claude\.ai|anthropic\.com/i.test(fix), "no claude.ai or anthropic.com link");
const rollbackLine = fix.match(/^-- Rollback: (.*)$/m)[1];
ok(!/\bdecision_log\b/i.test(rollbackLine.replace(/; the decision_log row stays.*$/, "")), "the Rollback never touches decision_log (append-only)");
ok(!/\b(UPDATE|INSERT)\s+(INTO\s+)?(decision_log)/i.test(fix.replace(/INSERT INTO decision_log/g, "")), "the file only appends to decision_log");

// ---- the engine block, for the validators and the constants
const a = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:BEGIN ----"), b = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:END ----");
const kwLine = workerSrc.match(/^var __RT_WRITE_KW = \[[^\]]*\];$/m);
ok(a > 0 && b > a && kwLine, "the worker carries the BREACH-DOCTOR-1 block and the write-keyword list");
const cx = vm.createContext({ Date, Number, String, parseInt, Math, JSON, Object, Array, RegExp, isFinite, console: { error() {}, log() {} }, VERSION: "0.53.0-test", crypto: globalThis.crypto, TextEncoder, Uint8Array });
vm.runInContext(kwLine[0] + "\n" + workerSrc.slice(a, b) + "\nthis.api = { bdReadOnlyWhy };", cx);
const { bdReadOnlyWhy } = cx.api;
const block = workerSrc.slice(a, b);
ok(/var BD_RELEASE_MIN = 60;/.test(block) && /var BD_TRIAL_MAX_PER_TICK = 1;/.test(block) && /var BD_UNDIAG_GRACE_MIN = 60;/.test(block) && /var BD_UNDIAG_MAX_MIN = 120;/.test(block) && /num\("breach_doctor_min_age_min", 60, 10, 120\)/.test(block), "the numbers the rows state are the engine's: release 60, trial 1, grace 60, ceiling 120, age gate 60 (10..120)");
const ver = (workerSrc.match(/^var VERSION = "([^"]*)"/m) || [])[1] || "";
const vn = ver.split("-")[0].split(".").map(Number);
ok(vn[0] > 0 || vn[1] >= 53, "qnfo-fleet-control is at least 0.53.0", ver);

// ---- the world: the live column lists carried by the first migration's test, then both files
const ddl = baseTest.slice(baseTest.indexOf("const BASE_DDL = `") + "const BASE_DDL = `".length, baseTest.indexOf("`;", baseTest.indexOf("const BASE_DDL = `")));
const d = new DatabaseSync(":memory:");
d.exec(ddl);
d.exec(base);
const q1 = (s, ...p) => d.prepare(s).get(...p);
const qa = (s, ...p) => d.prepare(s).all(...p);
const n = (t) => q1("SELECT COUNT(*) n FROM " + t).n;
const cfg = (k) => (q1("SELECT value FROM ops_config WHERE key = ?", k) || {}).value;
const tables = ["ops_config", "metric_registry", "control_registry", "failure_modes", "remediation_contracts", "capability_ledger", "decision_log", "breach_causes", "breach_playbooks", "agent_issues", "issue_triage"];
const rowsOf = () => JSON.stringify(tables.map((t) => qa("SELECT * FROM " + t + " ORDER BY 1")));
const counts = Object.fromEntries(tables.map((t) => [t, n(t)]));
const formula0 = q1("SELECT formula f FROM metric_registry WHERE metric = 'breaches_undiagnosed_over_60m'").f;
ok(cfg("breach_doctor_min_age_min") === "120" && /\(180 by default\)/.test(formula0), "before the fix: the age gate reads 120 and the formula says 180 by default (the finding)");

// compare-and-set: a value another migration or the owner changed is not overwritten
{
  const d2 = new DatabaseSync(":memory:");
  d2.exec(ddl); d2.exec(base);
  d2.exec("UPDATE ops_config SET value = '45' WHERE key = 'breach_doctor_min_age_min'");
  d2.exec(fix);
  ok(d2.prepare("SELECT value v FROM ops_config WHERE key = 'breach_doctor_min_age_min'").get().v === "45" && !/BREACH-DOCTOR-FIX-1/.test(d2.prepare("SELECT note n FROM ops_config WHERE key = 'breach_doctor_min_age_min'").get().n), "a value changed by someone else (45) is left alone: the update is a compare-and-set on 120");
}

d.exec(fix);

// ---- 3. the age gate and the metric
ok(cfg("breach_doctor_min_age_min") === "60", "the age gate is 60 minutes", cfg("breach_doctor_min_age_min"));
ok(/^BREACH-DOCTOR-FIX-1 \(2026-10-26\): 60 minutes, was 120\./.test(q1("SELECT note n FROM ops_config WHERE key = 'breach_doctor_min_age_min'").n) && /an open issue with no doer becomes a case/.test(q1("SELECT note n FROM ops_config WHERE key = 'breach_doctor_min_age_min'").n), "its note says what changed and keeps the old note");
ok(cfg("breach_doctor") === "on" && cfg("breach_doctor_playbook_cooldown_min") === "30" && cfg("breach_doctor_max_cases") === "40" && cfg("breach_doctor_budget_ms") === "20000", "no other doctor switch changed");
ok(qa("SELECT key, value FROM ops_config WHERE key LIKE 'breach_doctor%'").every((r) => !/_h$/.test(r.key)) && ["breach_doctor_min_age_min", "breach_doctor_playbook_cooldown_min"].every((k) => Number(cfg(k)) >= 10 && Number(cfg(k)) <= 120), "SLA-120M-1: no doctor threshold is in hours and none exceeds 120 minutes");
const formula = q1("SELECT formula f FROM metric_registry WHERE metric = 'breaches_undiagnosed_over_60m'").f;
ok(/min\(120, breach_doctor_min_age_min \+ 60\) minutes \(120 by default: the age gate is 60 minutes and the flag comes 60 minutes after it, never later than 120\)/.test(formula) && !/180/.test(formula), "the formula states the effective threshold: min(120, gate + 60), 120 by default, no 180", formula);
ok(formula.replace(/min\(120, breach_doctor_min_age_min \+ 60\) minutes \(120 by default[^)]*\)/, "breach_doctor_min_age_min + 60 minutes (180 by default)") === formula0, "the rest of the formula is byte-identical");
ok(q1("SELECT COUNT(*) n FROM metric_registry").n === 5 && q1("SELECT metric FROM metric_registry WHERE formula LIKE '%180%'") === undefined, "five doctor metrics, none states 180");

// ---- 1. the allowlist control
{
  const c = q1("SELECT * FROM control_registry WHERE control = 'breach-doctor-action-allowlist'");
  ok(/four named tables/.test(c.location) && !/six named tables/.test(c.location) && /top-level id = \?1/.test(c.location) && /ops_config and human_actions are not writable/.test(c.location) && c.kind === "gate" && c.disposition === "keep", "breach-doctor-action-allowlist describes four tables, the top-level id predicate and that ops_config and human_actions are not writable", c.location);
  ok(/no-id-predicate/.test(c.evidence) && /or-widens/.test(c.evidence) && /table-not-allowed/.test(c.evidence), "its evidence names the refusals the suite proves", c.evidence);
}

// ---- 2. the demotion is a recorded pause with a release; the age gate a recorded filter
{
  const c = q1("SELECT * FROM control_registry WHERE control = 'breach-doctor-auto-demotion'");
  ok(c && c.kind === "pause" && c.disposition === "replace" && c.disposition_state === "applied" && c.critical_path === 0 && /breach_playbooks\.mode = measure/.test(c.location), "control breach-doctor-auto-demotion: a pause off the critical path, disposition replace (applied), located at bdLoadRules", c);
  ok(/BD_RELEASE_MIN \(60\) minutes/.test(c.alternate_path) && /trial of one case a tick/.test(c.alternate_path) && /fm-breach-doctor-rule-latched/.test(c.alternate_path) && /enabled = 0/.test(c.alternate_path), "its release is stated: 60 minutes, a one-case trial, the durable detector, the per-rule stop", c.alternate_path);
  ok(/recorded reason/.test(c.evidence) && /no release/.test(c.evidence) && /Expiry: a demotion lasts at most 60 minutes plus one tick; review by 2026-11-02/.test(c.evidence), "its evidence carries the reason and the expiry (ANTIFRAGILE-1: a hold needs a recorded reason and an expiry)", c.evidence);
  const g = q1("SELECT * FROM control_registry WHERE control = 'breach-doctor-age-gate'");
  ok(g && g.kind === "filter" && g.disposition === "keep" && g.critical_path === 0 && /Expiry: review by 2026-11-02/.test(g.evidence) && /recorded reason/.test(g.evidence) && g.alternate_path, "control breach-doctor-age-gate: a keep filter with its reason, its alternate path and a dated expiry", g);
  ok(n("control_registry") === counts.control_registry + 2, "two controls were added and none removed", [n("control_registry"), counts.control_registry]);
}

// ---- 2. the durable detector
{
  const fm = q1("SELECT * FROM failure_modes WHERE fm_key = 'breach-doctor-rule-latched'");
  const c = q1("SELECT * FROM remediation_contracts WHERE class = 'fm-breach-doctor-rule-latched'");
  ok(fm && fm.probe_class === "fm-breach-doctor-rule-latched" && fm.issue_id === 1000266 && /120 minutes/.test(fm.failure_mode) && /rule-demoted/.test(fm.remediation), "failure mode breach-doctor-rule-latched exists and says why it differs from the event-window detector", fm);
  ok(c && c.status === "active" && c.verify_transport === "d1-query" && c.module === "failure-mode" && c.issue_id === null && !c.verify_probe.includes(";"), "its detector contract is active, d1-query, one statement", c);
  ok(bdReadOnlyWhy(c.verify_probe, false) === null, "the probe passes the remediation tick's read-only and write-keyword guard", bdReadOnlyWhy(c.verify_probe, false));
  const likes = [...c.verify_probe.matchAll(/LIKE\s+'((?:[^']|'')*)'/gi)].map((m) => m[1]);
  ok(likes.length === 1 && likes.every((x) => Buffer.byteLength(x) <= 50), "no LIKE pattern is over D1's 50 bytes", likes);
  const observed = () => q1(c.verify_probe);
  const set = (mode, note, enabled = 1) => d.prepare("UPDATE breach_playbooks SET mode = ?, note = ?, enabled = ? WHERE rule_id = 'CM-R1'").run(mode, note, enabled);
  const iso = (min) => new Date(Date.now() - min * 60000).toISOString().slice(0, 19) + "Z";
  ok(observed().expected === "0" && observed().observed === "0", "a fresh install reads 0 (no rule is demoted)", observed());
  set("measure", "demoted " + iso(125) + " after 2 failed cases in 24 h. rule text");
  ok(observed().observed === "1", "a demotion 125 minutes old reads 1: the release did not run", observed());
  set("measure", "demoted " + iso(100) + " after 2 failed cases in 24 h. rule text");
  ok(observed().observed === "0", "a demotion 100 minutes old reads 0: the release is due within 60 minutes plus one tick", observed());
  set("measure", "demoted " + iso(500) + " after 2 failed cases in 24 h. rule text", 0);
  ok(observed().observed === "0", "a rule disabled on purpose (enabled = 0) reads 0", observed());
  set("measure", "held by hand for a review");
  ok(observed().observed === "0", "a rule an operator set to measure by hand (no engine note) reads 0", observed());
  set("on", "trial " + iso(500) + " after the demotion of x. rule text");
  ok(observed().observed === "0", "a rule that is on (trial or restored) reads 0", observed());
  set("on", "CODE-MERGE-REFUSED-1 whose code task has since merged");
}
ok(/releases it to a one-case trial after 60 minutes/.test(q1("SELECT remediation r FROM failure_modes WHERE fm_key = 'breach-doctor-rule-demoted'").r), "the older failure mode says the engine releases a demoted rule");
{
  const cause = q1("SELECT plain p FROM breach_causes WHERE cause_key = 'breach-doctor'");
  ok(cause && /after 60 minutes it tries one case a tick again/.test(cause.p) && !/until its row is fixed/.test(cause.p) && /After two failures in 24 hours the rule demotes itself to measure/.test(cause.p), "the root-cause text for the failed-rule breach no longer says the rule stays paused until it is fixed", cause);
}
{
  const cap = q1("SELECT * FROM capability_ledger WHERE capability = 'breach-doctor:release-demoted-rule'");
  ok(cap && n("capability_ledger") === counts.capability_ledger + 1 && /60 minutes/.test(cap.evidence) && /release=trial/.test(cap.reliability) && cap.acquired_at > "2026", "a capability_ledger row records the release", cap);
}

// ---- the decision_log row
{
  const rows = qa("SELECT * FROM decision_log WHERE action LIKE 'BREACH-DOCTOR-FIX-1%'");
  const r = rows[0];
  ok(rows.length === 1 && n("decision_log") === counts.decision_log + 1 && r.actor === "session_01QpQv19uh1padRwZ3u1r766", "one decision_log row appended, none changed", rows.length);
  ok(r.assumption && r.evidence && r.outcome && r.blast_radius && r.rollback_path && r.capability_gain && r.predicted_outcome && r.surfaces_tested, "it carries every column of the doctrine (assumption, evidence, blast radius, rollback path, capability gain, predicted outcome, surfaces tested)");
  ok(!/ within /.test(r.predicted_outcome) && qa("SELECT 1 FROM decision_predictions WHERE decision_id = ?", r.id).length === 0, "its prediction is prose; no unmeasurable parsed prediction is created");
  ok(/ops_config breach_doctor = off/.test(r.rollback_path) && /Rollback header/.test(r.rollback_path), "it names its revert path");
}

// ---- idempotence
{
  const before = rowsOf();
  d.exec(fix);
  ok(before === rowsOf(), "a second apply changes nothing in any table the file touches");
}

// ---- Rollback
{
  const rollback = rollbackLine.replace(/; the decision_log row stays.*$/, ";");
  d.exec(rollback);
  ok(cfg("breach_doctor_min_age_min") === "120", "Rollback restores the age gate to 120");
  ok(q1("SELECT formula f FROM metric_registry WHERE metric = 'breaches_undiagnosed_over_60m'").f === formula0, "Rollback restores the formula byte for byte");
  ok(!q1("SELECT 1 x FROM control_registry WHERE control IN ('breach-doctor-auto-demotion', 'breach-doctor-age-gate')") && !q1("SELECT 1 x FROM failure_modes WHERE fm_key = 'breach-doctor-rule-latched'") && !q1("SELECT 1 x FROM remediation_contracts WHERE class = 'fm-breach-doctor-rule-latched'") && !q1("SELECT 1 x FROM capability_ledger WHERE capability = 'breach-doctor:release-demoted-rule'"), "Rollback removes the two controls, the failure mode, its contract and the capability");
  ok(/six named tables/.test(q1("SELECT location l FROM control_registry WHERE control = 'breach-doctor-action-allowlist'").l), "Rollback restores the allowlist control text");
  ok(n("decision_log") === counts.decision_log + 1 && n("control_registry") === counts.control_registry && n("failure_modes") === counts.failure_modes && n("capability_ledger") === counts.capability_ledger && n("remediation_contracts") === counts.remediation_contracts, "the decision_log row stays and every other count is back to before the file", [n("decision_log"), n("control_registry")]);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
