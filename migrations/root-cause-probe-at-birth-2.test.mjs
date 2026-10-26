// ROOT-CAUSE-PROBE-AT-BIRTH-2 offline suite: replays migrations/2026-10-26-root-cause-probe-at-birth-2.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); ops_config root_cause_probe_sql holds a probe with no semicolon and no write keyword;
// the management-personas workflow gains exactly one step (rc-probe, appended, the other steps byte for byte as they were, version +1, a replay adds none); the ten tickets that are open now
// are re-pointed from the generic superseded contract to the probe, and a contract another doer wrote, a closed ticket and an unrelated issue are left alone; the probe reads 1 only when the
// ticket is older than 24 hours and no issue of its family was opened or reopened in 24 hours (the family function of the recur-snapshot step, METRIC-TRIGGER ids kept apart, PORTFOLIO-GAP-RESOLVED-1
// not part of PORTFOLIO-GAP, the ticket's own events not counted); the PROBE-NEEDED-1 twin probe of qnfo-fleet-control reads ok for a probed ticket; the step SQL stored in the workflow does the
// same job at the next tick for a ticket born later; the detector fm-root-cause-ticket-without-probe reads 0 after the fix and 1 for an old ticket left on the generic contract; the decision is
// logged once; the Rollback line takes it all back.
// Run: node migrations/root-cause-probe-at-birth-2.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-root-cause-probe-at-birth-2.sql", import.meta.url), "utf8");
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

const HOUR = 3600e3;
const iso = (agoH) => new Date(Date.now() - agoH * HOUR).toISOString().slice(0, 19) + "Z";
const BIRTH_ACTION = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
const BIRTH_PROBE = (id) => `SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = ${id}) AS observed`;

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);`);
  const steps = [
    { type: "sql", name: "recur-clear", db: "AUDIT", sql: "DELETE FROM issue_recurrence_now" },
    { type: "sql", name: "rc-file", db: "AUDIT", sql: "INSERT INTO agent_issues (title) SELECT 'x' WHERE 0" },
    { type: "sql", name: "rc-map", db: "AUDIT", sql: "INSERT OR IGNORE INTO issue_project_map (issue_id) SELECT 1 WHERE 0" },
    { type: "sql", name: "rc-close", db: "AUDIT", sql: "UPDATE agent_issues SET status = 'closed' WHERE 0" },
    { type: "sql", name: "rm-brief", db: "AUDIT", sql: "SELECT 1" },
  ];
  w.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, updated_at) VALUES ('management-personas', 'MANAGEMENT-PERSONAS', 'workflow', ?, 8, '2026-10-26T11:02:27Z')")
    .run(JSON.stringify({ note: "kept", steps }));
  return w;
}

let nextId = 100;
function ticket(w, family, { ageH = 30, status = "open", contract = "birth", title } = {}) {
  const id = nextId++;
  w.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'd', 'management-personas', 'reliability', 'critical', ?, ?, ?)")
    .run(id, title || `ROOT-CAUSE-1: ${family} keeps recurring`, status, Date.now() - ageH * HOUR, Date.now());
  if (contract === "birth") {
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module, next_due_at) VALUES (?, ?, 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)', ?, ?, 'd1-query', 'qnfo-fleet-control', 1, 'superseded', 'superseded:closure-observing-probe-at-birth', 'probe-template-v3-generic', '2026-10-26 07:36:55')")
      .run("issue-" + id, id, BIRTH_ACTION, BIRTH_PROBE(id));
  } else if (contract === "doer") {
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES (?, ?, 'p', 'a doer wrote this probe', 'SELECT ''x'' AS expected, ''x'' AS observed', 'd1-query', 'qnfo-fleet-control', 1, 'active', 'someone-else')")
      .run("issue-" + id, id);
  }
  return id;
}
function member(w, title, event, agoH, status = "open") {
  const id = nextId++;
  w.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'd', 'x', 'c', 'medium', ?, ?, ?)").run(id, title, status, Date.now() - 100 * HOUR, Date.now());
  w.prepare("INSERT INTO issue_lifecycle (issue_id, event, ts) VALUES (?, ?, ?)").run(id, event, iso(agoH));
  return id;
}
const one = (w, s, ...p) => w.prepare(s).get(...p);
const all = (w, s, ...p) => w.prepare(s).all(...p);
const contractOf = (w, id) => one(w, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + id);
const stepsOf = (w) => JSON.parse(one(w, "SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;

// ---- fixtures: ten tickets as on 2026-10-26, plus the cases the guards must leave alone
const w = world();
const T = {};
T.quiet = ticket(w, "FAM-QUIET");                                   // old, family quiet for days -> reads 1
member(w, "FAM-QUIET: something old", "reopened", 60);
T.recur = ticket(w, "FAM-RECUR");                                   // family reopened 3 hours ago -> reads 0
member(w, "FAM-RECUR: something", "reopened", 3);
T.opened = ticket(w, "FAM-OPENED");                                 // a new issue of the family 2 hours ago -> reads 0
member(w, "FAM-OPENED: a new one", "opened", 2);
T.young = ticket(w, "FAM-YOUNG", { ageH: 5 });                      // family quiet but the ticket is 5 hours old -> reads 0
T.mt = ticket(w, "METRIC-TRIGGER-5182");                            // recent event on the same trigger id -> reads 0
member(w, "METRIC-TRIGGER-5182-SPOF-ALTERNATES-UNTESTED-24H: Chaos drill", "reopened", 1);
T.mt2 = ticket(w, "METRIC-TRIGGER-818");                            // events only on trigger id 8188 -> does not count, reads 1
member(w, "METRIC-TRIGGER-8188-OTHER: something else", "reopened", 1);
T.pg = ticket(w, "PORTFOLIO-GAP");                                  // the meta issue PORTFOLIO-GAP-RESOLVED-1 is another family, an instance is the family
member(w, "PORTFOLIO-GAP-RESOLVED-1: close a PORTFOLIO-GAP issue with evidence", "opened", 1);
T.pg2 = ticket(w, "PORTFOLIO-GAP", { title: "ROOT-CAUSE-1: PORTFOLIO-GAP keeps recurring " });
w.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(T.pg2);   // (a closed duplicate, left alone below)
T.pgInst = member(w, "PORTFOLIO-GAP project-stale-deploy BP26.REACH", "reopened", 4);
T.own = ticket(w, "FAM-OWN");                                       // the ticket's own and other ROOT-CAUSE events are not family activity
w.prepare("INSERT INTO issue_lifecycle (issue_id, event, ts) VALUES (?, 'reopened', ?)").run(T.own, iso(1));
member(w, "ROOT-CAUSE-1: FAM-OWN keeps recurring (older copy)", "opened", 1);
T.doer = ticket(w, "FAM-DOER", { contract: "doer" });               // a contract another doer wrote
T.closed = ticket(w, "FAM-CLOSED", { status: "closed" });           // closed ticket, still on the generic contract
T.other = ticket(w, "x", { title: "SOMETHING-ELSE-1: unrelated", ageH: 50 });   // open issue, same generic contract, not a ROOT-CAUSE ticket
T.noContract = ticket(w, "FAM-NOCONTRACT", { contract: "none" });

const before = Object.fromEntries(Object.entries(T).map(([k, id]) => [k, contractOf(w, id)]));
const stepsBefore = stepsOf(w);
const verBefore = one(w, "SELECT version v FROM fleet_tasks WHERE id = 'management-personas'").v;

w.exec(sql);
w.exec(sql);   // a replay changes nothing

// ---- the config row
const cfg = one(w, "SELECT value, note FROM ops_config WHERE key = 'root_cause_probe_sql'");
ok(cfg && cfg.value.includes("{ID}") && cfg.value.startsWith("SELECT '1' AS expected"), "ops_config root_cause_probe_sql holds the probe template", cfg && cfg.value.slice(0, 60));
ok(all(w, "SELECT 1 FROM ops_config WHERE key = 'root_cause_probe_sql'").length === 1, "one config row after two applies");
ok(!/;/.test(cfg.value) && !/\b(insert|update|delete|drop|alter|create|replace|attach|pragma)\b/i.test(cfg.value), "the probe text has no semicolon and no write keyword (the runners scan the text)");

// ---- the workflow
const stepsAfter = stepsOf(w);
ok(stepsAfter.length === stepsBefore.length + 1, "the workflow gains exactly one step although the file ran twice", [stepsBefore.length, stepsAfter.length]);
ok(stepsAfter[stepsAfter.length - 1].name === "rc-probe" && stepsAfter[stepsAfter.length - 1].type === "sql" && stepsAfter[stepsAfter.length - 1].db === "AUDIT", "the new step is the last one: rc-probe, sql, AUDIT");
ok(JSON.stringify(stepsAfter.slice(0, stepsBefore.length)) === JSON.stringify(stepsBefore), "every earlier step is byte for byte as it was");
ok(JSON.parse(one(w, "SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).note === "kept", "other keys of the definition are kept");
ok(one(w, "SELECT version v FROM fleet_tasks WHERE id = 'management-personas'").v === verBefore + 1, "the version moves by one, once");
const stepSql = stepsAfter[stepsAfter.length - 1].sql;
ok(!/;/.test(stepSql) && !/"/.test(stepSql) && stepSql.startsWith("UPDATE remediation_contracts"), "the step is one UPDATE of remediation_contracts, with no semicolon and no double quote");
ok(one(w, "SELECT COUNT(*) n FROM bak_20261026_rcp2_workflow").n === 1 && one(w, "SELECT version v FROM bak_20261026_rcp2_workflow").v === 8 && JSON.parse(one(w, "SELECT definition d FROM bak_20261026_rcp2_workflow").d).steps.length === stepsBefore.length, "the backup keeps the workflow as it was");

// ---- the contracts
const probed = ["quiet", "recur", "opened", "young", "mt", "mt2", "pg", "own"];
for (const k of probed) {
  const c = contractOf(w, T[k]);
  ok(c.status === "active" && c.verify_transport === "d1-query" && c.module === "root-cause-probe-at-birth-1" && c.attempts === 0 && c.last_verdict === null && c.deferred_since === null && /^SELECT '1' AS expected/.test(c.verify_probe) && /MEASURES the closing condition/.test(c.action), `ticket ${k}: the generic contract is replaced by the active probe`, c);
  ok(c.verify_probe.includes("a.id = " + T[k]) && !c.verify_probe.includes("{ID}"), `ticket ${k}: the probe names its own ticket id and no placeholder is left`);
}
for (const k of ["doer", "closed", "other", "noContract"]) {
  const c = contractOf(w, T[k]);
  ok(JSON.stringify(c) === JSON.stringify(before[k]), `ticket ${k}: contract untouched`, c);
}
ok(contractOf(w, T.doer).module === "someone-else" && contractOf(w, T.doer).status === "active", "a contract another doer wrote is left alone");
ok(contractOf(w, T.noContract) === undefined, "a ticket with no contract row gets none from this file (the birth trigger owns that)");
ok(contractOf(w, T.closed).status === "superseded" && contractOf(w, T.other).status === "superseded", "a closed ticket and an unrelated issue keep their generic contract");
ok(one(w, "SELECT COUNT(*) n FROM bak_20261026_rcp2_contracts").n === probed.length + 1, "the contract backup holds the open ROOT-CAUSE-1 tickets that had a contract (the eight probed and the doer's), not the closed one nor the unrelated issue", one(w, "SELECT COUNT(*) n FROM bak_20261026_rcp2_contracts"));

// ---- what the probe reads
const run = (k) => one(w, contractOf(w, T[k]).verify_probe);
const expect = { quiet: "1", recur: "0", opened: "0", young: "0", mt: "0", mt2: "1", pg: "0", own: "1" };
for (const [k, v] of Object.entries(expect)) {
  const r = run(k);
  ok(r.expected === "1" && r.observed === v, `probe ${k}: expected 1, observed ${v}`, r);
}
// PORTFOLIO-GAP: with the instance gone from the last 24 hours the meta issue PORTFOLIO-GAP-RESOLVED-1 alone does not keep the ticket open
w.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id = ?").run(iso(40), T.pgInst);
ok(run("pg").observed === "1", "probe pg: PORTFOLIO-GAP-RESOLVED-1 is another family, only an instance of PORTFOLIO-GAP keeps the ticket open");
w.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id = ?").run(iso(4), T.pgInst);
ok(run("pg").observed === "0", "probe pg: an instance reopened 4 hours ago keeps it at 0 again");
// the ticket's age and the 24 hour window are the two sides of the same condition
w.prepare("UPDATE agent_issues SET created_at = ? WHERE id = ?").run(Date.now() - 30 * HOUR, T.young);
ok(run("young").observed === "1", "probe young: the same ticket at 30 hours with a quiet family reads 1");
w.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id IN (SELECT id FROM agent_issues WHERE title LIKE 'FAM-RECUR:%')").run(iso(25));
ok(run("recur").observed === "1", "probe recur: once the last event is older than 24 hours it reads 1");
w.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id IN (SELECT id FROM agent_issues WHERE title LIKE 'METRIC-TRIGGER-5182-%')").run(iso(30));
ok(run("mt").observed === "1", "probe mt: METRIC-TRIGGER-5182 reads 1 when only its own events are older than a day");
ok(!/\bFROM\s+agent_issues\s+WHERE\s+status\b/i.test(contractOf(w, T.quiet).verify_probe) && !/\ba\.status\b/.test(contractOf(w, T.quiet).verify_probe), "the probe never reads the status of the ticket (CLOSE-PROBE-CIRCULAR-1)");
const lpt = (id) => `SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = ${id} AND x.status = 'open') THEN 'ok' WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = ${id} AND c.status IN ('active', 'holding') AND instr(c.verify_probe, 'needs-machine' || '-probe') = 0 AND instr(c.verify_probe, 'SELECT status FROM agent_issues WHERE' || ' id =') = 0 AND instr(c.verify_probe, 'agent_issues WHERE id = ${id})') = 0) THEN 'ok' ELSE 'pending: issue ${id} has no probe of its own yet, a doer writes one' END AS observed`;
for (const k of ["quiet", "recur", "mt"]) ok(one(w, lpt(T[k])).observed === "ok", `the PROBE-NEEDED-1 twin probe of qnfo-fleet-control reads ok for ticket ${k}`, one(w, lpt(T[k])));
ok(one(w, lpt(T.other)).observed.startsWith("pending"), "and still reads pending for an issue that stands on the generic contract");

// ---- the step does the same job at the next tick for a ticket born later, and only for that
const late = ticket(w, "FAM-LATE", { ageH: 0 });
const lateBefore = contractOf(w, late);
ok(lateBefore.status === "superseded", "fixture: the late ticket is born superseded");
const stepResult = w.prepare(stepSql).run();
const lateAfter = contractOf(w, late);
ok(stepResult.changes === 1 && lateAfter.status === "active" && lateAfter.module === "root-cause-probe-at-birth-1" && lateAfter.verify_probe.includes("a.id = " + late), "the stored step sets exactly the one new ticket's contract (1 row changed)", { changes: stepResult.changes, lateAfter });
ok(w.prepare(stepSql).run().changes === 0, "running the step again changes nothing");
ok(one(w, "SELECT COUNT(*) n FROM remediation_contracts WHERE class = ?", "issue-" + T.other).n === 1 && contractOf(w, T.other).status === "superseded", "the step does not touch an unrelated issue");
w.prepare("DELETE FROM ops_config WHERE key = 'root_cause_probe_sql'").run();
const late2 = ticket(w, "FAM-LATE2", { ageH: 0 });
ok(w.prepare(stepSql).run().changes === 0 && contractOf(w, late2).status === "superseded", "without the config row the step writes nothing (it cannot null the NOT NULL probe column)");
w.prepare("INSERT INTO ops_config (key, value) VALUES ('root_cause_probe_sql', ?)").run(cfg.value);

// ---- the detector and the failure mode
const fm = one(w, "SELECT * FROM failure_modes WHERE fm_key = 'root-cause-ticket-without-probe'");
ok(fm && fm.issue_id === 1000419 && fm.probe_class === "fm-root-cause-ticket-without-probe" && fm.root_cause.length > 80 && fm.remediation.length > 80, "the failure mode is recorded with its cause and remediation");
const det = one(w, "SELECT * FROM remediation_contracts WHERE class = 'fm-root-cause-ticket-without-probe'");
ok(det && det.status === "active" && det.verify_transport === "d1-query" && det.issue_id === null && det.module === "failure-mode", "the detector contract is an active d1-query failure-mode contract");
ok(det && one(w, det.verify_probe).expected === "0", "the detector expects 0");
// every ticket of this fixture is either probed, young, closed or a copy that stays out: only the old ticket without contract change counts
ok(one(w, det.verify_probe).observed === "0", "the detector reads 0 after the fix (late2 is 0 hours old)", one(w, det.verify_probe));
w.prepare("UPDATE agent_issues SET created_at = ? WHERE id = ?").run(Date.now() - 3 * HOUR, late2);
ok(one(w, det.verify_probe).observed === "1", "it reads 1 for a ROOT-CAUSE-1 ticket older than 2 hours left on the generic contract");
ok(!/;/.test(det.verify_probe) && !/\b(insert|update|delete|drop|alter|create|replace)\b/i.test(det.verify_probe), "the detector probe has no semicolon and no write keyword");

// ---- the decision
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'ROOT-CAUSE-PROBE-AT-BIRTH-2') > 0").n === 1, "one decision_log row after two applies");
const dl = one(w, "SELECT * FROM decision_log WHERE instr(action, 'ROOT-CAUSE-PROBE-AT-BIRTH-2') > 0");
ok(dl.actor.startsWith("rem-a2") && dl.rollback_path.length > 40 && dl.predicted_outcome.length > 40 && dl.capability_gain === "root-cause-ticket-born-with-probe", "the decision names its actor, rollback, prediction and capability gain");

// ---- the Rollback takes it back
const down = /^-- Rollback: (.*)$/m.exec(sql)[1].split(";").map((s) => s.trim()).filter(Boolean);
ok(down.length === 5, "the Rollback is five statements", down.length);
for (const s of down) w.exec(s);
ok(stepsOf(w).length === stepsBefore.length && JSON.stringify(stepsOf(w)) === JSON.stringify(stepsBefore), "Rollback: the step is gone and the other steps are as they were");
for (const k of probed) {
  const c = contractOf(w, T[k]);
  ok(c.status === "superseded" && c.module === "probe-template-v3-generic" && c.verify_probe === BIRTH_PROBE(T[k]) && c.action === BIRTH_ACTION && /^superseded:closure-observing/.test(c.last_verdict), `Rollback: ticket ${k} is back on its generic contract`, c);
}
ok(contractOf(w, T.doer).module === "someone-else", "Rollback: the other doer's contract is still theirs");
ok(!one(w, "SELECT 1 x FROM ops_config WHERE key = 'root_cause_probe_sql'") && !one(w, "SELECT 1 x FROM remediation_contracts WHERE class = 'fm-root-cause-ticket-without-probe'") && !one(w, "SELECT 1 x FROM failure_modes WHERE fm_key = 'root-cause-ticket-without-probe'"), "Rollback: the config row, the detector and the failure mode are gone");
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'ROOT-CAUSE-PROBE-AT-BIRTH-2') > 0").n === 1, "decision_log keeps its row (append-only)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
