// METRIC-SAMPLE-GATE-1 offline suite: replays migrations/2026-10-26-metric-sample-gate-1.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); metrics_awaiting_samples is registered with a named trigger exemption; fleet_tasks metric-refresh gains exactly
// two steps, appended in order (the others byte for byte, version +2, a replay adds none); the stored steps, run on fixtures, move probation_until 30 days ahead only for a probation metric that has no value, is within
// 2 days of its date (or past it) and carries a minimum-sample clause, leave a metric with a value, a metric with no sample gate (it still counts as overdue, exactly as the counter of kernel_registries_tick reads it) and
// a graduated metric alone, and count the awaiting metrics; the closing probe of issue 1000033 passes on the live shape and fails when the counter is not 0, a metric left probation or was deleted, the step is
// missing or the awaiting metric is stale; the FINDING block is appended once; the decision is logged once; the Rollback line takes it back.
// Run: node migrations/metric-sample-gate-1.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-metric-sample-gate-1.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok(!/\b(CREATE|DROP)\s+TRIGGER\b/i.test(body), "no trigger is created or dropped (the counter lives in a fleet_tick trigger)");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes (D1 limit)");

const iso = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 19) + "Z";
const GATE_ASK = "helpful / rated answers over 30d (visitor ratings); unmeasured below 10 ratings";
const GATE_Q08 = "void / (resolved + void) over all q08_forecasts, written once at least 10 forecasts are finished";
const GATE_MIN = "share of answers over 7d ... minimum sample 20 answers";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE metric_authorship (metric TEXT PRIMARY KEY, formula TEXT, authored_by TEXT NOT NULL DEFAULT 'x', authored_at TEXT NOT NULL DEFAULT '2026-10-01T00:00:00Z', probation_until TEXT NOT NULL, graduation TEXT NOT NULL DEFAULT 'g', status TEXT NOT NULL DEFAULT 'probation' CHECK (status IN ('probation', 'graduated', 'retired')), graduated_at TEXT);
CREATE TRIGGER metric_authorship_birth AFTER INSERT ON metric_registry BEGIN INSERT OR IGNORE INTO metric_authorship (metric, formula, probation_until, status) VALUES (NEW.metric, NEW.formula, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+7 days'), 'probation'); END;
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', last_verdict TEXT, module TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'open');
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  const steps = [{ type: "sql", db: "AUDIT", sql: "SELECT 1" }, { type: "sql", db: "AUDIT", name: "attributed-share", sql: "SELECT 2" }];
  w.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, updated_at) VALUES ('metric-refresh', 'METRIC-REFRESH-1', 'workflow', ?, 4, '2026-10-26T18:43:00Z')").run(JSON.stringify({ steps }));
  w.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (1000033, 'METRIC-SAMPLE-GATE-1: metrics_on_probation_overdue can never reach 0', 'Root cause: ... code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js', 'open')").run();
  w.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (2192, 'METRIC-REGISTRY-STALENESS-1: metric_registry rows exceed their declared refresh cadence', '10/369 metrics not fresh at 2026-10-26T18:00:48.398Z :: ask_helpful_rate_30d (1996m stale vs 60m cadence)', 'open')").run();
  w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, reopened_count) VALUES (2192, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', datetime('now'), 'PR 965, migrations/2026-10-12-20-kernel-registries.sql. Cause: ...', 26)").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module) VALUES ('issue-1000033', 1000033, 'no earlier birth template matched this issue', 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open', 'SELECT ''closed'' AS expected, NULL AS observed', 'd1-query', 'qnfo-fleet-control', 1, 'superseded', 'superseded:closure-observing-probe-at-birth', 'probe-template-v3-generic')").run();
  const m = (metric, formula, value, state, until, status = "probation") => {
    w.prepare("INSERT INTO metric_registry (metric, layer, kind, formula, last_value, state) VALUES (?, 'operational', 'target', ?, ?, ?)").run(metric, formula, value, state);
    w.prepare("UPDATE metric_authorship SET probation_until = ?, status = ?, formula = ? WHERE metric = ?").run(until, status, formula, metric);
  };
  m("ask_helpful_rate_30d", GATE_ASK, "33.3", "MEASURED", iso(22));          // the live shape: a value, 22 days of probation left
  m("q08_forecast_void_share", GATE_Q08, null, "UNMEASURED", iso(22));       // the live shape: no value, gated, 22 days left
  m("gated_due_soon", GATE_MIN, null, "UNMEASURED", iso(1));                  // gated, no value, 1 day left: extended
  m("gated_overdue", GATE_ASK, null, "UNMEASURED", iso(-3));                  // gated, no value, 3 days past: extended
  m("gated_later", GATE_Q08, null, "UNMEASURED", iso(5));                     // gated, no value, 5 days left: outside the 2-day window, counted, not moved
  m("gated_with_value_due", GATE_ASK, "40", "MEASURED", iso(1));              // gated but it has a value: graduation owns it, not touched
  m("ungated_overdue", "count of x per day", null, "UNMEASURED", iso(-3));    // no sample gate, no value, past: not touched, still overdue
  m("graduated_due", GATE_ASK, null, "UNMEASURED", iso(-3), "graduated");     // not on probation: not touched
  w.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value, state) VALUES ('metrics_on_probation_overdue', 'operational', 'target', '0', 'MEASURED')").run();
  return w;
}
const one = (w, s, ...p) => w.prepare(s).get(...p);
const all = (w, s, ...p) => w.prepare(s).all(...p);
const until = (w, k) => one(w, "SELECT probation_until u FROM metric_authorship WHERE metric = ?", k).u;
const stepsOf = (w) => JSON.parse(one(w, "SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'").definition).steps;
// the counter exactly as kernel_registries_tick reads it
const overdue = (w) => one(w, "SELECT COUNT(*) n FROM metric_authorship WHERE status = 'probation' AND probation_until < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')").n;

const w = world();
const before = Object.fromEntries(all(w, "SELECT metric, probation_until FROM metric_authorship").map((r) => [r.metric, r.probation_until]));
const stepsBefore = stepsOf(w), verBefore = one(w, "SELECT version v FROM fleet_tasks WHERE id = 'metric-refresh'").v;
ok(overdue(w) === 2, "fixture: before the file the counter reads 2 (gated_overdue and ungated_overdue)", overdue(w));
w.exec(sql); w.exec(sql);   // a replay changes nothing

// ---- the metric
const mm = one(w, "SELECT * FROM metric_registry WHERE metric = 'metrics_awaiting_samples'");
ok(mm && mm.kind === "target" && mm.layer === "operational" && mm.refresh_cadence === "hourly" && /Trigger exemption/.test(mm.formula) && mm.target === "informational (no bound)" && mm.source_of_truth && mm.disposition_actor && mm.owner, "metrics_awaiting_samples: registered with the required columns and a named trigger exemption", mm);
ok(mm.state === "MEASURED" && mm.last_value === "4", "it is measured at apply: 4 on the fixture (q08_forecast_void_share, gated_due_soon, gated_overdue, gated_later)", [mm.state, mm.last_value]);

// ---- the workflow
const stepsAfter = stepsOf(w);
ok(stepsAfter.length === stepsBefore.length + 2 && stepsAfter[stepsAfter.length - 2].name === "probation-sample-gate" && stepsAfter[stepsAfter.length - 1].name === "awaiting-samples", "metric-refresh gains exactly two steps, last, in order, although the file ran twice", stepsAfter.map((s) => s.name));
ok(JSON.stringify(stepsAfter.slice(0, stepsBefore.length)) === JSON.stringify(stepsBefore), "every earlier step is byte for byte as it was");
ok(one(w, "SELECT version v FROM fleet_tasks WHERE id = 'metric-refresh'").v === verBefore + 2, "the version moves by two, once");
const extendSql = stepsAfter[stepsAfter.length - 2].sql, countSql = stepsAfter[stepsAfter.length - 1].sql;
ok([extendSql, countSql].every((s) => !/;/.test(s) && !/"/.test(s)), "each step is one statement with no semicolon and no double quote");
ok(JSON.parse(one(w, "SELECT definition d FROM bak_20261026_msg1_workflow").d).steps.length === stepsBefore.length, "the backup holds the workflow as it was");

// ---- what the extension did at apply (the same statement as the step)
const near = (a, daysAhead) => Math.abs(Date.parse(a) - (Date.now() + daysAhead * 864e5)) < 36e5;
ok(near(until(w, "gated_due_soon"), 30) && near(until(w, "gated_overdue"), 30), "a gated metric with no value, due within 2 days or overdue, is moved 30 days ahead");
ok(until(w, "gated_later") === before.gated_later, "a gated metric with no value but 5 days left is not moved yet");
ok(until(w, "gated_with_value_due") === before.gated_with_value_due, "a gated metric that has a value is left to graduation");
ok(until(w, "ungated_overdue") === before.ungated_overdue, "a metric with no sample gate and no value is not touched");
ok(until(w, "graduated_due") === before.graduated_due, "a graduated metric is not touched");
ok(until(w, "ask_helpful_rate_30d") === before.ask_helpful_rate_30d && until(w, "q08_forecast_void_share") === before.q08_forecast_void_share, "the two live metrics, 22 days from their date, are not touched");
ok(overdue(w) === 1 && one(w, "SELECT metric m FROM metric_authorship WHERE status = 'probation' AND probation_until < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')").m === "ungated_overdue", "the counter of kernel_registries_tick now reads 1: only the metric with no sample gate still counts as overdue (acceptance: a third metric with no gate and no value still counts)");
ok(one(w, "SELECT last_value v FROM metric_registry WHERE metric = 'metrics_awaiting_samples'").v === "4", "metrics_awaiting_samples reads 4 on the fixture (q08_forecast_void_share, gated_due_soon, gated_overdue, gated_later)", one(w, "SELECT last_value v FROM metric_registry WHERE metric = 'metrics_awaiting_samples'"));

// ---- the stored steps, run later: the live shape 2026-11-16 (two days before 2026-11-18)
const later = new DatabaseSync(":memory:");
later.exec("CREATE TABLE metric_authorship (metric TEXT PRIMARY KEY, probation_until TEXT, status TEXT); CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT, last_value TEXT, last_refreshed TEXT, state TEXT)");
later.prepare("INSERT INTO metric_authorship VALUES ('q08_forecast_void_share', ?, 'probation')").run(iso(1.5));
later.prepare("INSERT INTO metric_registry (metric, formula, last_value, state) VALUES ('q08_forecast_void_share', ?, NULL, 'UNMEASURED'), ('metrics_awaiting_samples', 'x', NULL, 'UNMEASURED')").run(GATE_Q08);
later.prepare(extendSql).run(); later.prepare(countSql).run();
ok(near(later.prepare("SELECT probation_until u FROM metric_authorship").get().u, 30) && later.prepare("SELECT last_value v FROM metric_registry WHERE metric = 'metrics_awaiting_samples'").get().v === "1", "the stored steps keep a gated metric two days ahead of its date: it moves 30 days and is counted awaiting");
const idem = later.prepare(extendSql).run();
ok(idem.changes === 0, "running the extension again changes nothing (the date is 30 days out)");

// ---- the closing probe of issue 1000033
const c = one(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000033'");
ok(c.status === "active" && c.verify_transport === "d1-query" && c.module === "metric-sample-gate-1" && c.attempts === 0 && /MEASURES the acceptance/.test(c.action), "the contract of issue 1000033 is replaced by an active d1-query probe", c);
ok(!/;/.test(c.verify_probe) && !/\b(insert into|update |delete from|drop table|alter table|create table|replace into|attach |pragma )/i.test(c.verify_probe), "the probe is a single read with none of the consumer's write keywords");
ok(!/\bagent_issues\b/.test(c.verify_probe), "the probe never reads an issue (CLOSE-PROBE-CIRCULAR-1)");
const probe = c.verify_probe;
let res = one(w, probe);
ok(res.expected === "ok" && res.observed === "ok", "the probe passes on the live shape (counter 0, both metrics on probation, step present, awaiting metric fresh)", res);
w.exec("UPDATE metric_registry SET last_value = '2' WHERE metric = 'metrics_on_probation_overdue'");
ok(/^not met: metrics_on_probation_overdue reads 2/.test(one(w, probe).observed), "it fails when the counter is not 0");
w.exec("UPDATE metric_registry SET last_value = '0' WHERE metric = 'metrics_on_probation_overdue'");
w.exec("UPDATE metric_authorship SET status = 'retired' WHERE metric = 'q08_forecast_void_share'");
ok(/not both still on probation/.test(one(w, probe).observed), "it fails when a sample-gated metric was retired (no hiding the rows)");
w.exec("UPDATE metric_authorship SET status = 'probation' WHERE metric = 'q08_forecast_void_share'");
w.exec("DELETE FROM metric_registry WHERE metric = 'ask_helpful_rate_30d'");
ok(/not both registered/.test(one(w, probe).observed), "it fails when a sample-gated metric was deleted from the registry");
w.exec("INSERT INTO metric_registry (metric, layer, kind, formula, last_value, state) VALUES ('ask_helpful_rate_30d', 'operational', 'target', 'x', '33.3', 'MEASURED')");
w.exec("UPDATE metric_authorship SET status = 'probation' WHERE metric = 'ask_helpful_rate_30d'");
ok(one(w, probe).observed === "ok", "and passes again once restored", one(w, probe));
w.exec("UPDATE metric_registry SET last_refreshed = '2000-01-01T00:00:00Z' WHERE metric = 'metrics_awaiting_samples'");
ok(/metrics_awaiting_samples is not measured within 180 minutes/.test(one(w, probe).observed), "it fails when the awaiting metric is stale");
w.exec("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE metric = 'metrics_awaiting_samples'");
w.exec("UPDATE fleet_tasks SET definition = replace(definition, 'probation-sample-gate', 'x') WHERE id = 'metric-refresh'");
ok(/step probation-sample-gate is missing/.test(one(w, probe).observed), "it fails when the extension step is missing from the workflow");
w.exec("UPDATE fleet_tasks SET definition = replace(definition, '\"x\"', '\"probation-sample-gate\"') WHERE id = 'metric-refresh'");
const d = world();
d.exec("UPDATE remediation_contracts SET status = 'active', module = 'someone-else', action = 'a doer wrote this' WHERE class = 'issue-1000033'");
d.exec(sql);
ok(one(d, "SELECT module m FROM remediation_contracts WHERE class = 'issue-1000033'").m === "someone-else", "a contract another doer wrote is left alone");

// ---- the finding and the decision
const desc = one(w, "SELECT description d FROM agent_issues WHERE id = 1000033").d;
ok((desc.match(/FINDING 2026-10-26 \(rem-a2, METRIC-SAMPLE-GATE-1\)/g) || []).length === 1 && /kernel_registries_tick/.test(desc) && desc.startsWith("Root cause:") && /code-task: repo=qnfo-workers/.test(desc), "the FINDING block is appended once and the original text and its code-task line are kept");
const rem = one(w, "SELECT remediation r FROM issue_triage WHERE issue_id = 2192").r;
ok((rem.match(/OWNERS 2026-10-26 \(rem-a2, METRIC-SAMPLE-GATE-1\)/g) || []).length === 1 && rem.startsWith("PR 965, migrations/2026-10-12-20-kernel-registries.sql.") && /qnfo-research-exec paper_loop_revisions_24h/.test(rem) && /qnfo-gateway seo_crawl_googlebot_7d/.test(rem) && /qnfo-fleet-control breaches_unmapped/.test(rem) && /100622/.test(rem), "issue 2192: the owner map is appended once to its triage remediation and the older text is kept", rem.slice(0, 120));
ok(one(w, "SELECT status s FROM agent_issues WHERE id = 2192").s === "open" && one(w, "SELECT description d FROM agent_issues WHERE id = 2192").d.startsWith("10/369 metrics not fresh"), "issue 2192 stays open and its producer-owned description is not touched");
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'METRIC-SAMPLE-GATE-1') > 0").n === 1, "one decision_log row after two applies");
const dl = one(w, "SELECT * FROM decision_log WHERE instr(action, 'METRIC-SAMPLE-GATE-1') > 0");
ok(dl.actor.startsWith("rem-a2") && dl.rollback_path.length > 40 && dl.predicted_outcome.length > 40 && dl.capability_gain === "sample-gated-metric-kept-visible", "the decision names its actor, rollback, prediction and capability gain");

// ---- the Rollback
const w2 = world(); w2.exec(sql);
const down = /^-- Rollback: (.*)$/m.exec(sql)[1].split(";").map((s) => s.trim()).filter(Boolean);
ok(down.length === 5, "the Rollback is five statements", down.length);
for (const s of down) w2.exec(s);
ok(one(w2, "SELECT remediation r FROM issue_triage WHERE issue_id = 2192").r === "PR 965, migrations/2026-10-12-20-kernel-registries.sql. Cause: ...", "Rollback: the owner map is stripped from the triage row of issue 2192 and its older text is as it was");
ok(JSON.stringify(stepsOf(w2)) === JSON.stringify(stepsBefore), "Rollback: both steps are gone and the other steps are as they were");
const back = one(w2, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000033'");
ok(back.status === "superseded" && back.module === "probe-template-v3-generic" && /^VACUOUS-PROBE-V3-1/.test(back.action), "Rollback: the contract of issue 1000033 is back on the generic contract", back);
ok(!one(w2, "SELECT 1 x FROM metric_registry WHERE metric = 'metrics_awaiting_samples'") && !one(w2, "SELECT 1 x FROM metric_authorship WHERE metric = 'metrics_awaiting_samples'"), "Rollback: the metric and its authorship row are gone");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
