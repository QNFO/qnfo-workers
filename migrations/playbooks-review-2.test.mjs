// PLAYBOOKS-REVIEW-2 offline suite (agent_issues 1000426; migrations/2026-10-26-playbooks-review-2.sql).
// Replays the applied migrations/2026-10-26-probe-playbooks.sql on node:sqlite over the live column lists and the live triggers (the world of probe-playbooks.test.mjs), then this file, and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, no DELETE or DROP in the body) and that apply_migrations.py --check accepts the file;
//   2. PN-R2 is version 2, has no 1440-minute window (no window at all), still passes the engine's bdValidateRule, and its gate reads the lever issue: shut while the lever issue is open and a class-C PN
//      was opened or reopened, open when there is no class-C PN event, open when the last one is older than the lever's close, shut when one is newer; its action refuses the same cases;
//   3. orphan_issues_no_live_path counts OWNER-TASK and OWNER-NOTE issues in its formula text, in the observer step of the workflow and in the first reading;
//   4. belief owner-items-have-a-loop and its belief- probe (falsified at half or more, holds below), the control row, replay changes nothing, the Rollback restores every text it changed.
// Run: node --no-warnings migrations/playbooks-review-2.test.mjs     (REVIEW2_SQL=<file> runs the same checks against another file; an empty file shows the suite failing on the pre-change state)
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = (p) => new URL(p, import.meta.url);
const sqlPath = process.env.REVIEW2_SQL || fileURLToPath(here("./2026-10-26-playbooks-review-2.sql"));
const sql = readFileSync(sqlPath, "utf8");
const ppSql = readFileSync(here("./2026-10-26-probe-playbooks.sql"), "utf8");
const ppTest = readFileSync(here("./probe-playbooks.test.mjs"), "utf8");
const doctorSql = readFileSync(here("./2026-10-26-breach-doctor.sql"), "utf8");
const dtest = readFileSync(here("./breach-doctor.test.mjs"), "utf8");
const workerSrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- header and shape
const header = sql.split("\n").filter((l) => l.startsWith("--"));
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
const rollback = (header.find((l) => /^-- Rollback:/.test(l)) || "").replace(/^-- Rollback:\s*/, "");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !header.some((l) => /^-- BACKUP:/.test(l)), "the body deletes and drops nothing, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai link and no skip-CI token");
if (existsSync(sqlPath) && sql.length > 100) {
  const r = spawnSync("python3", [fileURLToPath(here("../scripts/apply_migrations.py")), "--check", sqlPath], { encoding: "utf8" });
  ok(r.status === 0 && /"ok": true/.test(r.stdout), "scripts/apply_migrations.py --check accepts the file", (r.stdout + r.stderr).slice(0, 300));
}

// ---- the engine's own validator
const a = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:BEGIN ----"), b = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:END ----");
const kwLine = workerSrc.match(/^var __RT_WRITE_KW = \[[^\]]*\];$/m);
ok(a > 0 && b > a && kwLine, "the worker carries the BREACH-DOCTOR-1 block and the write-keyword list");
const cx = vm.createContext({ Date, Number, String, parseInt, Math, JSON, Object, Array, RegExp, Error, Promise, isFinite, console: { error() {}, log() {} }, VERSION: "0.55.0-test", crypto: globalThis.crypto, TextEncoder, Uint8Array });
vm.runInContext(kwLine[0] + "\n" + workerSrc.slice(a, b) + "\nthis.api = { bdValidateRule };", cx);
const api = cx.api;

// ---- the world: live column lists, the doctor migration, the live triggers, the applied PROBE-PLAYBOOKS-1 file, then this file
const baseDdl = dtest.match(/const BASE_DDL = `([\s\S]*?)`;/)[1];
const EXTRA_DDL = ppTest.match(/const EXTRA_DDL = `([\s\S]*?)`;\nconst H/)[1];
const H = 3600000;
const isoAgo = (min) => new Date(Date.now() - min * 60000).toISOString().slice(0, 23) + "Z";
function world(o = {}) {
  const raw = new DatabaseSync(":memory:");
  raw.exec(baseDdl);
  raw.exec(doctorSql);
  raw.exec(EXTRA_DDL);
  raw.exec("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('breach_doctor_max_actions', '20'), ('breach_doctor_max_cases', '60')");
  raw.exec(ppSql);
  if (o.before) o.before(raw);
  if (o.apply !== false) raw.exec(sql);
  return raw;
}
const q1 = (raw, s, ...p) => raw.prepare(s).get(...p);
const qa = (raw, s, ...p) => raw.prepare(s).all(...p);
const rule = (raw) => q1(raw, "SELECT * FROM breach_playbooks WHERE rule_id = 'PN-R2'");
const LEVER = "BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control";
const iss = (raw, id, title, o = {}) => {
  raw.prepare("INSERT INTO agent_issues (id, title, source, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'high', ?, ?, ?)").run(id, title, o.source ?? "qnfo-fleet-control", o.status ?? "open", Date.now() - (o.ageH ?? 30) * H, Date.now());
  raw.prepare("INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
};
const ev = (raw, issue, event, to, minAgo) => raw.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence, ts) VALUES (?, ?, 'open', ?, 0, ?)").run(issue, event, to, isoAgo(minAgo));
const hitIds = (raw) => qa(raw, "SELECT * FROM (" + rule(raw).trigger_sql + ")").map((h) => h.issue_id).sort((x, y) => x - y);
const act = (raw, issue) => { let ch = 0; for (const s of JSON.parse(rule(raw).action_sql)) ch += Number(raw.prepare(s).run(issue).changes); return ch; };
const leverId = (raw) => q1(raw, "SELECT id FROM agent_issues WHERE title = ?", LEVER).id;
const closeLever = (raw, minAgo) => {
  const id = leverId(raw); // the live close triggers want evidence in the triage row and no failing contract: the lever closes the way the consumer closes it, on a passing code-read
  raw.prepare("UPDATE remediation_contracts SET status = 'holding', last_verdict = 'pass' WHERE issue_id = ?").run(id);
  raw.prepare("INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  raw.prepare("UPDATE issue_triage SET close_evidence = 'remediation_verifications#1 pass=1 class=issue-' || ? || ' transport=code-read: the exclusion is on main' WHERE issue_id = ?").run(id, id);
  raw.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(id);
  ev(raw, id, "dispositioned", "closed", minAgo);
};
const seedPn = (raw) => { iss(raw, 7201, "OWNER-TASK-op-test: an owner item"); iss(raw, 7301, "PROBE-NEEDED-1: issue-7201"); };

// ---- PN-R2 after the file
{
  const raw = world();
  const r = rule(raw);
  ok(r && r.version === 2 && r.enabled === 1 && r.mode === "on", "PN-R2 is version 2, enabled, mode on", r && { v: r.version, e: r.enabled, m: r.mode });
  ok(!/1440/.test(r.trigger_sql) && !/1440/.test(r.action_sql) && !/minutes/i.test(r.trigger_sql.replace(/'(?:[^']|'')*'/g, "''")), "no 1440-minute window and no window of any length in PN-R2's SQL");
  ok(r.trigger_sql.includes(LEVER) && r.action_sql.includes(LEVER) && /json_valid/i.test("json_valid") && qa(raw, "SELECT json_valid(?) v", r.action_sql)[0].v === 1, "the gate names the lever issue in the trigger and in the action, and the action list is still valid JSON");
  const v = api.bdValidateRule(r);
  ok(v && v.ok === true, "PN-R2 version 2 passes the engine's bdValidateRule", v);
  ok(!/'filer_quiet_24h'/.test(r.trigger_sql) && /'filer_quiet'/.test(r.trigger_sql), "the fact is named filer_quiet, not filer_quiet_24h");
  ok(/REVIEW-2 2026-10-26/.test(r.note), "the note records the review");
}

// ---- the gate over fixtures
{
  let raw = world(); seedPn(raw);
  ok(JSON.stringify(hitIds(raw)) === "[7301]", "no class-C PN event at all: nothing to wait for, PN-R2 names the PN", hitIds(raw));
  raw = world(); seedPn(raw); ev(raw, 7301, "opened", "open", 10);
  ok(JSON.stringify(hitIds(raw)) === "[]", "lever open and a class-C PN opened 10 minutes ago: the gate is shut", hitIds(raw));
  ok(act(raw, 7301) === 0, "and the action changes nothing while the gate is shut");
  raw = world(); seedPn(raw); ev(raw, 7301, "opened", "open", 25 * 60);
  ok(JSON.stringify(hitIds(raw)) === "[]", "lever open and a class-C PN opened 25 hours ago: still shut (the lever is the condition, not the clock)", hitIds(raw));
  raw = world(); seedPn(raw); ev(raw, 7301, "opened", "open", 300); closeLever(raw, 120);
  ok(JSON.stringify(hitIds(raw)) === "[7301]", "lever closed 2 hours ago, the last class-C PN event 5 hours ago (before the close): the gate is open at once", hitIds(raw));
  ok(act(raw, 7301) >= 1 && q1(raw, "SELECT triage_state s FROM issue_triage WHERE issue_id = 7301").s === "closed" && q1(raw, "SELECT status s FROM agent_issues WHERE id = 7201").s === "open", "the action closes the PN through issue_triage and leaves the owner item open");
  raw = world(); seedPn(raw); ev(raw, 7301, "reopened", "open", 10); closeLever(raw, 120);
  ok(JSON.stringify(hitIds(raw)) === "[]" && act(raw, 7301) === 0, "lever closed 2 hours ago but a class-C PN reopened 10 minutes ago (after the close): the gate shuts again", hitIds(raw));
}

// ---- the metric counts owner items
{
  const before = world({ apply: false }), after = world();
  const stepSql = (raw) => JSON.parse(q1(raw, "SELECT definition FROM fleet_tasks WHERE id = 'probe-playbooks-metrics'").definition).steps.find((s) => s.name === "orphan_issues_no_live_path").sql;
  const fx = (raw) => { iss(raw, 8001, "OWNER-TASK-op-x: act on this", { source: "owner", ageH: 6 }); iss(raw, 8002, "OWNER-NOTE-y: a note", { source: "owner", ageH: 6 }); iss(raw, 8003, "ORDINARY-1: a plain issue", { ageH: 6 }); };
  fx(before); fx(after);
  const read = (raw) => { raw.exec(stepSql(raw)); return Number(q1(raw, "SELECT last_value v FROM metric_registry WHERE metric = 'orphan_issues_no_live_path'").v); };
  const nb = read(before), na = read(after);
  ok(na === nb + 2, "the observer step counts the OWNER-TASK and the OWNER-NOTE issue (before the file it read " + nb + ", after " + na + ")", { nb, na });
  ok(!/OWNER-TASK/.test(stepSql(after)) && !/OWNER-NOTE/.test(stepSql(after)), "the workflow step no longer mentions OWNER-TASK or OWNER-NOTE");
  const f = q1(after, "SELECT formula f FROM metric_registry WHERE metric = 'orphan_issues_no_live_path'").f;
  ok(/\(owner items included\)/.test(f) && !/excluded/.test(f), "the registry formula says owner items are included", f.slice(0, 160));
  ok(JSON.parse(q1(after, "SELECT definition d FROM fleet_tasks WHERE id = 'probe-playbooks-metrics'").d).steps.length === 3, "the workflow still has its three steps");
  ok(q1(after, "SELECT state s FROM metric_registry WHERE metric = 'orphan_issues_no_live_path'").s === "MEASURED", "the metric is read at once (first reading in the file)");
}

// ---- the belief and its probe, the control row, replay and rollback
{
  const raw = world();
  const bel = q1(raw, "SELECT * FROM belief_registry WHERE belief_key = 'owner-items-have-a-loop'");
  ok(bel && bel.probe_class === "belief-owner-items-have-a-loop" && bel.confidence < 0.5, "belief owner-items-have-a-loop is recorded with low confidence and its probe class", bel && { c: bel.confidence, p: bel.probe_class });
  const c = q1(raw, "SELECT * FROM remediation_contracts WHERE class = 'belief-owner-items-have-a-loop'");
  ok(c && c.verify_transport === "d1-query" && c.status === "active" && c.module === "belief" && c.issue_id === null && !c.verify_probe.includes(";"), "its belief- contract is an active d1-query probe with no semicolon", c && { t: c.verify_transport, s: c.status });
  const probe = (r) => q1(r, c.verify_probe);
  const old = (r, id, title) => iss(r, id, title, { source: "owner", ageH: 6 });
  const con = (r, issue) => r.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, expected_cadence_h) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 'x', 'active', 'doer', 1)").run("issue-" + issue, issue);
  ok(probe(raw).observed === "holds", "no open owner item: the belief holds", probe(raw));
  old(raw, 8101, "OWNER-TASK-a: one"); old(raw, 8102, "OWNER-NOTE-b: two");
  ok(/^falsified: 2 of 2 /.test(probe(raw).observed), "two old owner items and no contract: falsified", probe(raw));
  con(raw, 8101);
  ok(/^falsified: 1 of 2 /.test(probe(raw).observed), "one of two without a contract (half): falsified", probe(raw));
  con(raw, 8102);
  ok(probe(raw).observed === "holds", "both have a live contract: the belief holds", probe(raw));
  iss(raw, 8103, "OWNER-TASK-c: young", { source: "owner", ageH: 1 });
  ok(probe(raw).observed === "holds", "an owner item younger than 120 minutes is not counted", probe(raw));

  const ctl = q1(raw, "SELECT location, alternate_path, evidence FROM control_registry WHERE control = 'pn-r2-filer-quiet-gate'");
  ok(ctl && !/1440|last 24 hours|quiet window/.test(ctl.location + ctl.alternate_path) && /lever issue/.test(ctl.location) && /REVIEW-2 2026-10-26/.test(ctl.evidence), "the control row states the lever condition, not a window, and records the review", ctl && ctl.alternate_path.slice(0, 120));
  ok(q1(raw, "SELECT COUNT(*) n FROM decision_log WHERE actor LIKE '%playbooks-review-2'").n === 1, "one decision_log row");

  const snap = (r) => JSON.stringify([qa(r, "SELECT * FROM breach_playbooks ORDER BY rule_id"), qa(r, "SELECT * FROM control_registry ORDER BY control"), qa(r, "SELECT * FROM metric_registry ORDER BY metric"), qa(r, "SELECT * FROM fleet_tasks ORDER BY id"), qa(r, "SELECT * FROM belief_registry ORDER BY belief_key"), qa(r, "SELECT class, status FROM remediation_contracts ORDER BY class"), qa(r, "SELECT * FROM decision_log ORDER BY id")]);
  const w2 = world(); const s1 = snap(w2); w2.exec(sql);
  ok(snap(w2) === s1, "a replay changes nothing");

  const rb = world(); const orig = world({ apply: false });
  rb.exec(rollback);
  const pickPb = (r) => { const x = rule(r); return [x.version, x.trigger_sql, x.action_sql]; };
  ok(JSON.stringify(pickPb(rb)) === JSON.stringify(pickPb(orig)), "the Rollback restores PN-R2's version, trigger and action text exactly");
  const pickMeta = (r) => [q1(r, "SELECT formula f FROM metric_registry WHERE metric = 'orphan_issues_no_live_path'").f, q1(r, "SELECT definition d FROM fleet_tasks WHERE id = 'probe-playbooks-metrics'").d, JSON.stringify(q1(r, "SELECT location, alternate_path, evidence FROM control_registry WHERE control = 'pn-r2-filer-quiet-gate'"))];
  ok(JSON.stringify(pickMeta(rb)) === JSON.stringify(pickMeta(orig)), "and the metric formula, the workflow definition and the control row");
  ok(!q1(rb, "SELECT 1 x FROM belief_registry WHERE belief_key = 'owner-items-have-a-loop'") && !q1(rb, "SELECT 1 x FROM remediation_contracts WHERE class = 'belief-owner-items-have-a-loop'"), "and removes the belief and its contract");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
