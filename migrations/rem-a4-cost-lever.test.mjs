// COST-LEVER-Q08-1 offline suite: replays migrations/2026-10-26-rem-a4-cost-lever.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs plus the live text of fleet_budget,
// ai_call_counters, cost_daily and the view v_cost_run_rate (read from qnfo-audit 2026-10-26 19:30Z) and the live text of the two contracts it rewrites.
// Proves: the header opts in and rolls back; the lever is real (q08-signal-engine reads ops_config q08_daily_neurons, default 150000, 0 disables it); ops_config q08_daily_neurons goes 150000 -> 50000 once and a
// changed value is left alone; the backups hold the old value and the old contract texts; the control is registered as a kept cap with ALTERNATE-NOT-EXERCISABLE (so the path coverage views do not gain an
// untested alternate); the issue-1000193 probe names a missing lever, a lever that does not hold (from 2026-10-28), the ceiling gap, and reads ok only when all three hold; the issue-1000192 probe keeps the
// three cap conditions and compares fleet_budget with v_cost_run_rate (not the 30-day sum); both are one literal SELECT with no write keyword; the notes land once and never on a closed issue; a replay changes
// nothing; the Rollback line restores the value and both contracts; the header arithmetic (bound 329.21 -> 296.2) holds.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-cost-lever.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a4-cost-lever.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const q08src = readFileSync(here("../q08-signal-engine/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/\bfleet_budget\b/i.test(body.replace(/'[^']*(?:''[^']*)*'/g, "''")), "no statement touches fleet_budget (no cap or target is edited)");
ok(!/\bCREATE\s+(TRIGGER|VIEW)\b/i.test(body), "no trigger and no view is created");

// the lever is real: the worker reads the key and a value of 0 disables the gate
ok(/SELECT value FROM ops_config WHERE key = 'q08_daily_neurons'/.test(q08src) && /var Q08_DAILY_NEURONS_DEFAULT = 150000;/.test(q08src) && /if \(!\(budget > 0\)\) return \{ ok: true/.test(q08src), "q08-signal-engine reads ops_config q08_daily_neurons, defaults to 150000 and treats 0 as disabled");
ok(/spent < pace|ok: spent < pace/.test(q08src) && /Q08_BUDGET_BURST = 0\.1/.test(q08src), "the gate paces the day (spent below budget x ((hour + 1) / 24 + 0.1)), it does not stop it");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

const EXTRA_DDL = `
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap INTEGER NOT NULL, target INTEGER NOT NULL, current INTEGER NOT NULL, unit TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
CREATE TABLE cost_daily (date TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'fleet', usd REAL NOT NULL DEFAULT 0, requests INTEGER DEFAULT 0, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, note TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (date, source));
CREATE VIEW v_cost_run_rate AS
SELECT source_group,
  ROUND(SUM(CASE WHEN date >= date('now', '-7 days') THEN usd ELSE 0 END) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-7 days') AND date < date('now'))), 4) AS daily_7d,
  ROUND(SUM(usd) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-10 days') AND date < date('now'))), 4) AS daily_10d,
  ROUND(30 * SUM(CASE WHEN date >= date('now', '-7 days') THEN usd ELSE 0 END) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-7 days') AND date < date('now'))), 2) AS run_rate_30d_7d,
  ROUND(30 * SUM(usd) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-10 days') AND date < date('now'))), 2) AS run_rate_30d_10d
FROM (
  SELECT date, source AS source_group, usd FROM cost_daily
    WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR instr(source, 'owner_gateway:') = 1 OR instr(source, ':daily') > 0)
)
GROUP BY source_group;`;

// the live text of the three rows before this file (read from qnfo-audit 2026-10-26 19:30Z)
const OLD_Q08_NOTE = "COST-SUSTAIN-2 2026-10-21: hard daily neuron budget for q08-signal-engine, paced over the UTC day (q08 0.33.0). 150k = USD 1.65/day. 0 disables (owner override only). Revert: delete row (code default 150000).";
const OLD_ACTION = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
const OLD_PROBE_193 = "SELECT 'cost_usd_30d <= 200 (A9 ceiling)' AS expected, CASE WHEN CAST(last_value AS REAL) <= 200 THEN 'cost_usd_30d <= 200 (A9 ceiling)' ELSE 'cost_usd_30d = ' || last_value || ' USD/30d, above A9 ceiling 200' END AS observed FROM metric_registry WHERE metric = 'cost_usd_30d'";
const OLD_PROBE_192 = "WITH caps AS (SELECT node_class, CAST(cap AS REAL) AS cap, CAST(current AS REAL) AS current FROM fleet_budget WHERE node_class IN ('workers','d1_databases','ai_spend:workers-ai')), metric AS (SELECT CAST(last_value AS REAL) AS v FROM metric_registry WHERE metric = 'workers_ai_cost_30d_usd'), flags AS (SELECT MAX(CASE WHEN node_class='workers' AND current > cap THEN 1 ELSE 0 END) AS workers_breach, MAX(CASE WHEN node_class='d1_databases' AND current > cap THEN 1 ELSE 0 END) AS d1_breach, MAX(CASE WHEN node_class='ai_spend:workers-ai' AND current > cap THEN 1 ELSE 0 END) AS ai_breach, (SELECT current FROM caps WHERE node_class='ai_spend:workers-ai') AS fb_ai, (SELECT v FROM metric) AS mr_ai FROM caps) SELECT 'OK' AS expected, CASE WHEN workers_breach=0 AND d1_breach=0 AND ai_breach=0 AND ABS(fb_ai / mr_ai - 1) <= 0.05 THEN 'OK' ELSE 'breach: ' END AS observed FROM flags";

const dayAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec(EXTRA_DDL);
  w.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('q08_daily_neurons', ?, ?, '2026-10-21 14:13:36')").run(o.q08 ?? "150000", OLD_Q08_NOTE);
  w.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('research_daily_neurons', '360000', 'research budget', '2026-10-24 14:59:20')").run();
  for (const [id, title] of [[1000192, "fleet_budget caps breached: workers 35>30"], [1000193, "AUTONOMY-FIRST-REROUTE-1: Portfolio: AI spend above the A9 ceiling"], [1000155, "METRIC-TRIGGER-10930-FLEET-COST-BOUND-MONTH-USD"]]) {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', 'x', 'critical', ?, 1, 1)").run(id, title, o.closed === id ? "closed" : "open");
  }
  for (const [cls, issue, probe] of [["issue-1000192", 1000192, OLD_PROBE_192], ["issue-1000193", 1000193, OLD_PROBE_193], ["issue-1000155", 1000155, "SELECT 1 AS expected, 1 AS observed"]])
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status, module, attempts, last_verdict) VALUES (?, ?, 'p', ?, ?, 'd1-query', 3, 'qnfo-fleet-control', 'active', 'probe-template-v3-generic', 3, 'fail')").run(cls, issue, OLD_ACTION, probe);
  w.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES ('cost_usd_30d', 'system', 'lagging', ?)").run(o.cost ?? "343.87");
  w.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES ('workers_ai_cost_30d_usd', 'system', 'lagging', '300.74')").run();
  w.prepare("INSERT INTO fleet_budget VALUES ('workers', 30, 24, ?, 'workers', 'now')").run(o.workers ?? 36);
  w.prepare("INSERT INTO fleet_budget VALUES ('d1_databases', 10, 8, ?, 'dbs', 'now')").run(o.d1 ?? 11);
  for (let d = 1; d <= 7; d++) w.prepare("INSERT INTO cost_daily (date, source, usd) VALUES (?, 'workers_ai', 10)").run(dayAgo(d));
  w.prepare("INSERT INTO fleet_budget VALUES ('ai_spend:workers-ai', ?, 78, ?, 'usd_30d_list_estimate', 'now')").run(o.aiCap ?? 95, o.aiCurrent ?? 300);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const cfg = (w) => q1(w, "SELECT value, note FROM ops_config WHERE key = 'q08_daily_neurons'");
const contract = (w, id) => q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + id);
const probe = (w, id) => q1(w, contract(w, id).verify_probe);
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const guardActive = dayAgo(1) >= "2026-10-27";

// 1. the apply
{
  const w = world();
  w.exec(sql);
  const c = cfg(w);
  ok(c.value === "50000" && /COST-LEVER-Q08-1/.test(c.note) && /Revert: restore 150000/.test(c.note), "ops_config q08_daily_neurons goes 150000 -> 50000 with the revert in its note", c);
  ok(q1(w, "SELECT value v FROM ops_config WHERE key = 'research_daily_neurons'").v === "360000", "the research budget is not touched");
  const b = q1(w, "SELECT value, note FROM bak_20261026_q08_budget WHERE key = 'q08_daily_neurons'");
  ok(b.value === "150000" && b.note === OLD_Q08_NOTE, "the backup holds the old value and note", b);
  ok(q1(w, "SELECT COUNT(*) n FROM bak_20261026_cost_contracts").n === 2 && q1(w, "SELECT verify_probe p FROM bak_20261026_cost_contracts WHERE class = 'issue-1000193'").p === OLD_PROBE_193, "the contract backup holds both old contracts");
  const ctl = q1(w, "SELECT * FROM control_registry WHERE control = 'q08-daily-neuron-budget'");
  ok(ctl && ctl.kind === "cap" && ctl.disposition === "keep" && ctl.disposition_state === "applied" && ctl.critical_path === 0 && ctl.issue_id === 1000193 && ctl.alternate_tested_at === null && /ALTERNATE-NOT-EXERCISABLE/.test(ctl.evidence), "the control is registered as a kept, applied cap with ALTERNATE-NOT-EXERCISABLE", ctl);
  ok(q1(w, "SELECT COUNT(*) n FROM issue_triage").n === 0 && q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE status = 'closed'").n === 0, "nothing is closed by this file");
  for (const id of [1000193, 1000192]) {
    const k = contract(w, id);
    ok(!/VACUOUS/.test(k.action) && /OUTCOME-BOUND/.test(k.action) && k.status === "active" && k.module === "probe-template-v3-generic" && k.verify_transport === "d1-query" && k.attempts === 3, "contract " + id + " keeps class, status, module, transport and attempts and says it is outcome-bound", k);
    ok(k.next_due_at !== null, "contract " + id + " is due at once");
    const low = k.verify_probe.toLowerCase();
    ok(/^(select|with)/.test(low) && !WRITE_KW.some((x) => low.includes(x)) && !k.verify_probe.replace(/;\s*$/, "").includes(";"), "the probe of " + id + " is one literal read with no write keyword");
    ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE id = ? AND instr(description, 'COST-LEVER-Q08-1') > 0", id).n === 1, "issue " + id + " carries the note once");
  }
  ok(contract(w, 1000155).verify_probe === "SELECT 1 AS expected, 1 AS observed" && q1(w, "SELECT instr(description, 'COST-LEVER-Q08-1') p FROM agent_issues WHERE id = 1000155").p === 0, "issue 1000155 (REM-A5) and its contract are untouched");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'COST-LEVER-Q08-1:%'").n === 1, "one decision_log row");
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM ops_config ORDER BY key").all(), w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all().map((r) => Object.assign({}, r, { next_due_at: null })), w.prepare("SELECT id, description FROM agent_issues ORDER BY id").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get(), w.prepare("SELECT * FROM control_registry").all().map((r) => Object.assign({}, r, { reviewed_at: null })), w.prepare("SELECT * FROM bak_20261026_q08_budget").all(), w.prepare("SELECT * FROM bak_20261026_cost_contracts").all()]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a replay changes nothing (first backups, first notes, one control, one decision)");
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  const r = cfg(w);
  ok(r.value === "150000" && r.note === OLD_Q08_NOTE, "the Rollback line restores the q08 budget and its note", r);
  ok(contract(w, 1000193).verify_probe === OLD_PROBE_193 && contract(w, 1000192).verify_probe === OLD_PROBE_192 && contract(w, 1000193).action === OLD_ACTION, "the Rollback line restores both contracts");
}
// a changed value is left alone, a closed issue gets no note
{
  const w = world({ q08: "40000" });
  w.exec(sql);
  ok(cfg(w).value === "40000", "a value that is not 150000 (set by someone else) is not overwritten");
  const x = world({ closed: 1000193 });
  x.exec(sql);
  ok(q1(x, "SELECT instr(description, 'COST-LEVER-Q08-1') p FROM agent_issues WHERE id = 1000193").p === 0, "a closed issue gets no note");
}

// 2. the issue-1000193 probe
{
  const w = world();
  w.exec(sql);
  const at = (v) => { w.prepare("DELETE FROM ops_config WHERE key = 'q08_daily_neurons'").run(); if (v !== null) w.prepare("INSERT INTO ops_config (key, value, note) VALUES ('q08_daily_neurons', ?, 'fixture')").run(String(v)); return probe(w, 1000193); };
  ok(at("150000").observed === "lever missing: ops_config q08_daily_neurons is outside 1 to 60000" && at(null).observed.startsWith("lever missing"), "the old value 150000 and a deleted row read as a missing lever (the code default is 150000)");
  ok(at("0").observed.startsWith("lever missing"), "0 (gate disabled) is not a lever");
  ok(at("60001").observed.startsWith("lever missing") && !at("60000").observed.startsWith("lever missing"), "the allowance edge: 60000 holds, 60001 does not");
  const gap = at("50000");
  ok(gap.expected === "ok" && gap.observed === "lever in force (q08_daily_neurons 50000), cost_usd_30d = 343.87 USD/30d, above the A9 ceiling 200", "lever in force, ceiling not met: the gap is named", gap);
  // q08 yesterday above its allowance: only judged from 2026-10-28 (the first complete day under the new budget)
  w.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, neurons) VALUES (?, 'q08-signal-engine', 'binding', 'm', 10, 70000)").run(dayAgo(1));
  const held = probe(w, 1000193);
  if (guardActive) ok(held.observed === "lever not holding: q08 spent 70000 neurons on the last complete UTC day, allowance 66000", "from 2026-10-28 a q08 day above 66000 reads as a lever that does not hold", held);
  else ok(held.observed === gap.observed, "before 2026-10-28 the previous day (spent under the old budget) is not judged", held);
  // the same query with the date guard moved back proves the branch itself
  const early = q1(w, contract(w, 1000193).verify_probe.replace("'2026-10-27'", "'2000-01-01'"));
  ok(early.observed === "lever not holding: q08 spent 70000 neurons on the last complete UTC day, allowance 66000", "the not-holding branch reads the day of ai_call_counters (guard date moved back)", early);
  // the allowance edge of the spend: 66000 (60000 plus the 10 percent burst of the pace) passes, 66001 does not
  const edgeProbe = (n) => { w.prepare("DELETE FROM ai_call_counters").run(); w.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, neurons) VALUES (?, 'q08-signal-engine', 'binding', 'm', 10, ?)").run(dayAgo(1), n); return q1(w, contract(w, 1000193).verify_probe.replace("'2026-10-27'", "'2000-01-01'")).observed; };
  ok(edgeProbe(66000) === gap.observed && edgeProbe(66001).startsWith("lever not holding"), "the spend edge: 66000 on the last complete day passes, 66001 does not");
  w.prepare("DELETE FROM ai_call_counters").run();
  w.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, neurons) VALUES (?, 'q08-signal-engine', 'binding', 'm', 10, 55000)").run(dayAgo(1));
  w.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, neurons) VALUES (?, 'qnfo-ops', 'binding', 'm', 10, 900000)").run(dayAgo(1));
  ok(probe(w, 1000193).observed === gap.observed, "q08 at 55000 on its day (another worker at 900000 does not count) still reads the ceiling gap");
  w.prepare("UPDATE metric_registry SET last_value = '199.5' WHERE metric = 'cost_usd_30d'").run();
  const done = probe(w, 1000193);
  ok(done.expected === "ok" && done.observed === "ok", "lever in force, q08 held and cost_usd_30d 199.5: ok", done);
  w.prepare("UPDATE metric_registry SET last_value = '200' WHERE metric = 'cost_usd_30d'").run();
  ok(probe(w, 1000193).observed === "ok", "cost_usd_30d exactly 200 is at the ceiling: ok");
  w.prepare("UPDATE metric_registry SET last_value = '200.01' WHERE metric = 'cost_usd_30d'").run();
  ok(probe(w, 1000193).observed !== "ok", "cost_usd_30d 200.01 is above it");
  // the lever cannot be skipped by a good ceiling reading
  w.prepare("UPDATE metric_registry SET last_value = '150' WHERE metric = 'cost_usd_30d'").run();
  ok(at("150000").observed.startsWith("lever missing"), "a cost reading under 200 does not pass while the lever is not in force");
}

// 3. the issue-1000192 probe
{
  const w = world({ workers: 36, d1: 11, aiCurrent: 300, aiCap: 95 });
  w.exec(sql);
  const rr = q1(w, "SELECT run_rate_30d_7d v FROM v_cost_run_rate WHERE source_group = 'workers_ai'").v;
  ok(rr === 300, "the run-rate view reads 300 for seven days of 10 (30 x 70 / 7)", rr);
  const brk = probe(w, 1000192);
  ok(brk.expected === "OK" && brk.observed === "breach: workers 36.0/30.0, d1 11.0/10.0, workers-ai 7-day run rate x30 300.0/95.0 (v_cost_run_rate 300.0, 30-day sum 300.74)", "all three caps breached: the observed text names the caps, the run rate and the 30-day sum", brk);
  const set = (k, v) => w.prepare("UPDATE fleet_budget SET current = ? WHERE node_class = ?").run(v, k);
  set("workers", 30); set("d1_databases", 10);
  ok(probe(w, 1000192).observed.startsWith("breach:"), "workers and d1 at their caps but workers-ai still above 95: breach");
  w.prepare("UPDATE fleet_budget SET cap = 400 WHERE node_class = 'ai_spend:workers-ai'").run();
  ok(probe(w, 1000192).observed === "OK", "all three at or under their caps and fleet_budget equal to v_cost_run_rate: OK (the cap value is changed only in this fixture)");
  set("ai_spend:workers-ai", 320);
  ok(probe(w, 1000192).observed.startsWith("breach:"), "fleet_budget 6.7 percent away from the run rate it is written from: not OK (2 percent tolerance)");
  set("ai_spend:workers-ai", 304);
  ok(probe(w, 1000192).observed === "OK", "1.3 percent away: OK");
  // the old agreement clause (30-day sum) is gone: a 30-day sum far from the run rate does not matter
  w.prepare("UPDATE metric_registry SET last_value = '12' WHERE metric = 'workers_ai_cost_30d_usd'").run();
  ok(probe(w, 1000192).observed === "OK", "the 30-day sum no longer takes part in the agreement");
  set("ai_spend:workers-ai", 300); w.prepare("UPDATE fleet_budget SET cap = 95 WHERE node_class = 'ai_spend:workers-ai'").run();
  ok(probe(w, 1000192).observed.startsWith("breach:"), "a cap of 95 is still a breach at 300: the cap is not changed by this file");
}

// 4. the arithmetic of the header
{
  const bounded = 360000 + 150000 + 140 * 1787 + 92427;
  ok(Math.round(bounded) === 852612 + 1 || Math.abs(bounded - 852612) < 600, "the bounded neurons a day add up to the 852,612 of v_cost_forecast", bounded);
  const nonNeuron = 10.9735 - (852612 - 10000) * 0.011 / 1000;
  const after = 30 * ((852612 - 100000 - 10000) * 0.011 / 1000 + nonNeuron);
  ok(Math.abs(30 * 10.9735 - 329.21) < 0.01 && Math.abs(after - 296.2) < 0.1 && after < 300, "the bound falls from 329.21 to 296.2, inside the owner 300", after);
  const needed = (329.21 - 300) / 30 / 0.011 * 1000;
  ok(needed > 88000 && needed < 89000 && needed < 100000, "the cut of 100,000 neurons a day covers the 88,5xx the bound needs", needed);
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
