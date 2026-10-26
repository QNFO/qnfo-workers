// FOLLOWUP-ISSUES-1 offline suite: replays migrations/2026-10-26-followup-issues-1.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped in the body, no trigger or view touched); each of the two issues (BREACH-UNMAPPED-1, PR-SLA-METRIC-CADENCE-1) is inserted
// once although the file runs twice, with source session, category reliability, priority medium, no linked session, a Doer line and a Definition of done line, and its title is the same literal in the insert, the guard and the
// contract update; the generic born contract of each issue is replaced by an active d1-query probe that reads one number or one metric row, is a single read with none of the consumer's write keywords, never reads an issue
// (CLOSE-PROBE-CIRCULAR-1), fails on the live shape (6 unmapped breaches; pr_open_over_10m written 50 minutes ago) and passes when the defect is gone; an open issue with the same title is not duplicated and a closed one does not
// block a new one; the decision is logged once; the Rollback takes the two issues, their triage rows and their contracts away and leaves every other row alone.
// Run: node migrations/followup-issues-1.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-followup-issues-1.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\r/.test(sql), "the file has LF line endings only");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/\b(CREATE|DROP)\s+(TRIGGER|VIEW)\b/i.test(body) && !/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no trigger or view is touched, no fleet_tick write, no claude.ai link");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes (D1 limit)");
const rollbackLine = /^-- Rollback: (.*)$/m.exec(sql)[1];
ok([...rollbackLine.matchAll(/\bLIKE\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "the Rollback's LIKE patterns are at most 50 bytes too");

const TITLE_A = "BREACH-UNMAPPED-1: six breaching metrics have no metric_breach_cause row, so the breach view and the guard breaches_unmapped read them as unmapped";
const TITLE_B = "PR-SLA-METRIC-CADENCE-1: pr_open_over_10m is written every 50 minutes by its trigger throttle while the 10-minute merge SLA is judged on it";
ok((sql.split("'" + TITLE_A + "'").length - 1) === 3 && (sql.split("'" + TITLE_B + "'").length - 1) === 3, "each title is one literal used by the insert, the NOT EXISTS guard and the contract update (3 times each)");

function world(opts = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', last_verdict TEXT, module TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE breach_rows (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL);
CREATE VIEW v_breach_by_cause AS SELECT cause_key, COUNT(*) AS breaches FROM breach_rows GROUP BY cause_key;
CREATE TRIGGER agent_issues_birth AFTER INSERT ON agent_issues BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (NEW.id, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', datetime('now'));
  INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'no earlier birth template matched this issue', 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open', 'SELECT ''closed'' AS expected, NULL AS observed', 'd1-query', 'qnfo-fleet-control', 1, 'superseded', 'superseded:closure-observing-probe-at-birth', 'probe-template-v3-generic');
END;`);
  for (const k of ["drift_total", "cf_obs_reopen_churn_24h", "records_past_retention", "pii_in_logs", "agent_tool_calls_outside_allowlist", "metrics_worsening_7d"]) w.prepare("INSERT INTO breach_rows VALUES (?, 'unmapped')").run(k);
  w.prepare("INSERT INTO breach_rows VALUES ('worker_count', 'spend'), ('open_agent_issues', 'issue-backlog')").run();
  w.prepare("INSERT INTO metric_registry VALUES ('pr_open_over_10m', '0', ?, 'MEASURED')").run(new Date(Date.now() - 50 * 60e3).toISOString().slice(0, 19) + "Z");   // the live shape: written 50 minutes ago
  if (opts.openA) w.prepare("INSERT INTO agent_issues (title, description, source, status) VALUES (?, 'someone filed it first', 'session', 'open')").run(TITLE_A);
  if (opts.closedB) w.prepare("INSERT INTO agent_issues (title, description, source, status) VALUES (?, 'an older, closed one', 'session', 'closed')").run(TITLE_B);
  w.prepare("INSERT INTO agent_issues (title, description, source, linked_session, status, created_at) VALUES ('BREACH-UNMAPPED-1: a claimed namesake', 'x', 'session', 'someone-else', 'open', ?)").run(Date.now());
  w.prepare("INSERT INTO agent_issues (title, description, source, status, created_at) VALUES ('UNRELATED: another issue', 'x', 'session', 'open', ?)").run(Date.now());
  return w;
}
const one = (w, s, ...p) => w.prepare(s).get(...p);
const all = (w, s, ...p) => w.prepare(s).all(...p);
const issue = (w, title) => one(w, "SELECT * FROM agent_issues WHERE title = ?", title);
const contractOf = (w, title) => one(w, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + issue(w, title).id);

const w = world();
w.exec(sql); w.exec(sql);   // a replay changes nothing
for (const [name, title] of [["A", TITLE_A], ["B", TITLE_B]]) {
  const rows = all(w, "SELECT * FROM agent_issues WHERE title = ?", title);
  ok(rows.length === 1, name + ": the issue exists once although the file ran twice", rows.length);
  const i = rows[0];
  ok(i.source === "session" && i.category === "reliability" && i.priority === "medium" && i.status === "open" && i.linked_session === null, name + ": source session, category reliability, priority medium, open, no linked session (a doer claims it)", i);
  ok(Math.abs(i.created_at - Date.now()) < 120e3 && Math.abs(i.updated_at - Date.now()) < 120e3, name + ": created_at and updated_at are epoch milliseconds of now", [i.created_at, i.updated_at]);
  ok(/\nDoer: /.test(i.description) || /Doer: /.test(i.description), name + ": the description names a doer");
  ok(/Definition of done: /.test(i.description), name + ": the description names the definition of done");
  ok(!/code-task:/.test(i.description), name + ": no code-task line (the fix is data or a migration, not a worker.js edit)");
}
const a = issue(w, TITLE_A), b = issue(w, TITLE_B);
ok(["drift_total", "cf_obs_reopen_churn_24h", "records_past_retention", "pii_in_logs", "agent_tool_calls_outside_allowlist", "metrics_worsening_7d"].every((m) => a.description.includes(m)) && /breach-doctor, code-loop, heartbeat, issue-backlog, measurement, owner-routing, publishing, spend, structure/.test(a.description), "A names the six metrics and the nine cause keys");
ok(/18:11:02Z, 19:01:23Z and 19:51:30Z/.test(b.description) && /50 minutes/.test(b.description) && /0\.8 ms/.test(b.description) && /TRIGGER-FLAP-1/.test(b.description) && /agent_issues 2192/.test(b.description), "B names the three write times, the 50-minute throttle, the 0.8 ms cost, TRIGGER-FLAP-1 and issue 2192");

// ---- the contracts
const ca = contractOf(w, TITLE_A), cb = contractOf(w, TITLE_B);
for (const [name, c] of [["A", ca], ["B", cb]]) {
  ok(c.status === "active" && c.verify_transport === "d1-query" && c.module === "followup-issues-1" && c.attempts === 0 && c.last_verdict === null && c.deferred_since === null, name + ": the generic born contract is replaced by an active d1-query probe", c);
  ok(Math.abs(Date.parse(c.next_due_at.replace(" ", "T") + "Z") - Date.now()) < 120e3, name + ": it is due now", c.next_due_at);
  ok(!/;/.test(c.verify_probe) && !/\b(insert into|update |delete from|drop table|alter table|create table|replace into|attach |pragma )/i.test(c.verify_probe), name + ": the probe is a single read with none of the consumer's write keywords");
  ok(!/\bagent_issues\b/.test(c.verify_probe), name + ": the probe never reads an issue (CLOSE-PROBE-CIRCULAR-1)");
  ok(/FOLLOWUP-ISSUES-1/.test(c.action) && /MEASURES the defect/.test(c.action), name + ": the action says it measures the defect");
}
let ra = one(w, ca.verify_probe);
ok(ra.expected === "0" && ra.observed === "6", "A fails on the live shape: 6 unmapped breaches against 0", ra);
w.exec("DELETE FROM breach_rows WHERE cause_key = 'unmapped'");
ra = one(w, ca.verify_probe);
ok(ra.expected === ra.observed && ra.observed === "0", "A passes once every breach has a cause (0)", ra);
w.exec("INSERT INTO breach_rows VALUES ('new_metric_in_breach', 'unmapped')");
ok(one(w, ca.verify_probe).observed === "1", "A sees a new unmapped breach again (1)");
let rb = one(w, cb.verify_probe);
ok(rb.expected === "ok" && /^not met: pr_open_over_10m was last measured 20\d\d-/.test(rb.observed), "B fails on the live shape: written 50 minutes ago", rb);
w.exec("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes') WHERE metric = 'pr_open_over_10m'");
ok(one(w, cb.verify_probe).observed === "ok", "B passes when pr_open_over_10m was written 5 minutes ago");
w.exec("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-16 minutes') WHERE metric = 'pr_open_over_10m'");
ok(/^not met/.test(one(w, cb.verify_probe).observed), "B fails again at 16 minutes");
w.exec("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 minutes'), state = 'UNMEASURED' WHERE metric = 'pr_open_over_10m'");
ok(/^not met/.test(one(w, cb.verify_probe).observed), "B fails when the state is not MEASURED");
w.exec("UPDATE metric_registry SET state = 'MEASURED', last_value = NULL WHERE metric = 'pr_open_over_10m'");
ok(/^not met/.test(one(w, cb.verify_probe).observed), "B fails when the metric has no value");
w.exec("DELETE FROM metric_registry WHERE metric = 'pr_open_over_10m'");
ok(/was last measured never/.test(one(w, cb.verify_probe).observed), "B fails with 'never' when the metric row is gone");

// ---- the other rows, existing titles
ok(issue(w, "BREACH-UNMAPPED-1: a claimed namesake").linked_session === "someone-else" && issue(w, "UNRELATED: another issue").status === "open", "other issues are untouched");
const wo = world({ openA: true, closedB: true }); wo.exec(sql);
ok(all(wo, "SELECT * FROM agent_issues WHERE title = ?", TITLE_A).length === 1 && issue(wo, TITLE_A).description === "someone filed it first", "an open issue with the same title is not duplicated or touched");
ok(contractOf(wo, TITLE_A).module === "followup-issues-1" && contractOf(wo, TITLE_A).status === "active", "but its generic born contract (VACUOUS-PROBE-V3-1) gets the measuring probe, as for an issue this file files");
const wr = world({ openA: true });
wr.exec("UPDATE remediation_contracts SET status = 'active', module = 'someone-else', action = 'their own probe', verify_probe = 'SELECT ''ok'' AS expected, ''ok'' AS observed' WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = '" + TITLE_A + "')");
wr.exec(sql);
ok(contractOf(wr, TITLE_A).module === "someone-else" && contractOf(wr, TITLE_A).action === "their own probe", "a contract another doer wrote for an issue of the same title is left alone");
ok(all(wo, "SELECT * FROM agent_issues WHERE title = ?", TITLE_B).length === 2 && all(wo, "SELECT * FROM agent_issues WHERE title = ? AND status = 'open'", TITLE_B).length === 1, "a closed issue with the same title does not block a new open one");

// ---- the decision
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'FOLLOWUP-ISSUES-1') > 0").n === 1, "one decision_log row after two applies");
const dl = one(w, "SELECT * FROM decision_log WHERE instr(action, 'FOLLOWUP-ISSUES-1') > 0");
ok(dl.actor.startsWith("rem-a2") && dl.rollback_path.length > 40 && dl.predicted_outcome.length > 40 && dl.capability_gain === "follow-ups-are-issues-with-a-doer" && dl.surfaces_tested.length > 20, "the decision names its actor, rollback, prediction, capability gain and surfaces tested");

// ---- the Rollback
const w2 = world(); w2.exec(sql);
const idsBefore = all(w2, "SELECT id FROM agent_issues").map((r) => r.id).length;
const down = rollbackLine.split(";").map((s) => s.trim()).filter(Boolean);
ok(down.length === 3, "the Rollback is three statements", down.length);
for (const s of down) w2.exec(s);
ok(!issue(w2, TITLE_A) && !issue(w2, TITLE_B), "Rollback: both issues are gone");
ok(all(w2, "SELECT * FROM remediation_contracts").every((c) => c.issue_id !== null && one(w2, "SELECT 1 x FROM agent_issues WHERE id = ?", c.issue_id)), "Rollback: no contract is left without its issue");
ok(all(w2, "SELECT * FROM agent_issues").length === idsBefore - 2 && issue(w2, "BREACH-UNMAPPED-1: a claimed namesake").linked_session === "someone-else" && issue(w2, "UNRELATED: another issue"), "Rollback: a claimed namesake and unrelated issues are left alone (only the two rows this file inserted go)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
