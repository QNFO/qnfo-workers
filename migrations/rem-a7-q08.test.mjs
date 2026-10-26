// REM-A7-Q08-1 offline suite: replays migrations/2026-10-26-rem-a7-q08.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs
// (issue_triage, the close-sync triggers, issue_close_evidence_required, decision_log append-only triggers) plus the cadence tables the file reads.
// Proves: the header opts in; 100453 and 100455 close as superseded through the live close-sync trigger only while their facts hold at apply time (100439 open; four owned cadence rows,
// the breach trigger enabled and 3003 open); 100439, 100607, 100064 and 1000268 stay open with their findings recorded once; the 1000268 probe reads 0 of 3 today and passes only for three
// engine-created, recent, open, unretracted forecasts; a replay changes nothing; the Rollback header undoes the closes; nothing is deleted and no probe line is written into a description.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-q08.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-q08.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "no statement deletes or drops (so no BACKUP header is needed)");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");
ok(!/code-probe: \{|runtime-probe: \{/.test(sql), "no probe line is written into an issue description (the live triggers would turn it into a contract)");
ok(!/^\s*(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+"?(decision_log|issue_lifecycle)\b/im.test(body), "decision_log and issue_lifecycle are only inserted into (append-only)");
ok(/INSERT INTO decision_log/.test(body) && (body.match(/INSERT INTO decision_log/g) || []).length === 1, "exactly one decision_log insert");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

const SURF = ["q08.org", "continuity-snapshot", "papers.qnfo.org", "reading.q08.org"];
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("CREATE TABLE cadence_sla (surface TEXT PRIMARY KEY, producer TEXT NOT NULL, interval_min INTEGER NOT NULL, sla_min INTEGER NOT NULL, schedule TEXT, last_output TEXT)");
  w.exec("CREATE TABLE v_cadence_overdue (surface TEXT, overdue_min INTEGER, over_sla INTEGER)"); // stand-in for the live view
  w.exec("CREATE TABLE worker_schedules (name TEXT PRIMARY KEY, crons_json TEXT)");
  const issue = (id, title, status, prio, source) => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'original text', ?, 'reach', ?, ?, 1, 1)").run(id, title, source || "owner-chat", prio || "critical", status || "open");
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-2', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  const contract = (cls, id, status, verdict, probe, transport) => w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, attempts) VALUES (?, ?, 'pre', 'VACUOUS-PROBE-V3-1: act', ?, ?, 'qnfo-fleet-control', ?, ?, 7)").run(cls, id, probe || "SELECT 1 AS expected, 0 AS observed", transport || "d1-query", status, verdict);
  issue(100439, "Q08-GATE-ECONOMICS: gate_pass_rate_7d 0.032", o.s100439 || "open");
  issue(100453, "q08-signal-engine: evaluate the structural gate BEFORE the compose call", "open");
  issue(100455, "Cadence: q08.org/continuity/papers/reading surfaces have no fleet_crons owner", "open");
  issue(100607, "Q08-PUBLISH-STALL-AUTO-1: q08-signal-engine published nothing", "open", "high", "q08-signal-engine");
  issue(100064, "COMPANION-PUBLISH-STALL-AUTO-1: reading.q08.org published nothing for 6h", "open", "high", "personal-companion");
  issue(1000268, "Q08-FORECAST-RESEARCH-1: forecast mode cannot produce researched forecasts", "open", "high", "claude-session");
  issue(3003, "METRIC-TRIGGER-6050-CADENCE-OVERDUE-OVER-120M: SLA breach", o.s3003 || "open", "medium", "qnfo-fleet-control");
  issue(1000999, "SOME-OTHER-ISSUE: unrelated", "open", "medium", "x");
  contract("issue-100439", 100439, "active", "fail");
  contract("issue-100453", 100453, "active", "fail");
  contract("issue-100455", 100455, "active", "fail");
  contract("issue-100607", 100607, "monitoring", "monitoring:loop-owned-48h");
  contract("issue-100064", 100064, "active", "deferred");
  contract("issue-1000268", 1000268, "superseded", "superseded:closure-observing-probe-at-birth", "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = 1000268) AS observed");
  contract("issue-1000999", 1000999, "active", "fail");
  const metric = (m, v) => w.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES (?, 'internal', 'lagging', ?)").run(m, v);
  metric("q08_gate_pass_rate_7d", "0.012"); metric("q08_neurons_per_published_piece_7d", "178302.926"); metric("cadence_overdue_over_120m", "4");
  w.prepare("INSERT INTO analytics_metric_triggers (metric_key, title, operator, threshold, enabled) VALUES ('cadence_overdue_over_120m', 'SLA breach', 'gt', 0, ?)").run(o.triggerEnabled === undefined ? 1 : o.triggerEnabled);
  SURF.slice(0, o.ownedRows === undefined ? 4 : o.ownedRows).forEach((s) => w.prepare("INSERT INTO cadence_sla (surface, producer, interval_min, sla_min) VALUES (?, 'producer-of-' || ?, 120, 120)").run(s, s));
  w.prepare("INSERT INTO v_cadence_overdue VALUES ('q08.org', 525, 1), ('papers.qnfo.org', 714, 1), ('reading.q08.org', 126, 1), ('continuity-snapshot', 0, 0)").run();
  ["q08-signal-engine", "personal-companion", "qnfo-research-exec"].forEach((n) => w.prepare("INSERT INTO worker_schedules (name, crons_json) VALUES (?, '[\"0 * * * *\"]')").run(n));
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const st = (w, id) => q1(w, "SELECT status s FROM agent_issues WHERE id = ?", id).s;
const desc = (w, id) => q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d;
const tri = (w, id) => q1(w, "SELECT * FROM issue_triage WHERE issue_id = ?", id);
const con = (w, cls) => q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", cls);
const snap = (w) => JSON.stringify(["agent_issues", "issue_triage", "remediation_contracts", "ops_config", "decision_log", "capability_ledger"].map((t) => w.prepare("SELECT * FROM " + t + " ORDER BY 1").all()));

{
  const w = world();
  w.exec(sql);
  ok(st(w, 100453) === "closed" && q1(w, "SELECT close_channel c FROM agent_issues WHERE id = 100453").c === "auto:triage-sync:q08-signal-engine", "100453 closes through the live close-sync trigger");
  const t3 = tri(w, 100453);
  ok(/^Superseded by 100439/.test(t3.close_evidence) && /q08_gate_pass_rate_7d = 0\.012/.test(t3.close_evidence) && /q08_neurons_per_published_piece_7d = 178302\.926/.test(t3.close_evidence) && /PR 4752/.test(t3.close_evidence) && /not because the definition of done is met/.test(t3.close_evidence), "its evidence starts with superseded, names the successor, the live metric values and the PR, and says the DoD is not met", t3.close_evidence);
  ok(t3.rc === "rem-a7:superseded-by-100439" && q1(w, "SELECT COUNT(*) n FROM issue_triage WHERE issue_id = 100453").n === 1, "the existing triage row was updated, not duplicated");
  const c3 = con(w, "issue-100453");
  ok(c3.status === "superseded" && /^superseded:100439 \(REM-A7-Q08-1/.test(c3.last_verdict), "its contract is superseded with the successor named, not deleted", c3);

  ok(st(w, 100455) === "closed", "100455 closes");
  const t5 = tri(w, 100455);
  ok(/^Superseded by 3003/.test(t5.close_evidence) && /holds 4 of 4 rows/.test(t5.close_evidence) && /holds 3 of the 3 cf-native cron owners/.test(t5.close_evidence) && /enabled=1/.test(t5.close_evidence) && /cadence_overdue_over_120m = 4/.test(t5.close_evidence) && /q08\.org 525 min/.test(t5.close_evidence) && /papers\.qnfo\.org 714 min/.test(t5.close_evidence) && /not because the surfaces publish on time/.test(t5.close_evidence), "its evidence carries the owner counts, the trigger state and the live overdue minutes, and says the outcome is still open", t5.close_evidence);
  ok(t5.rc === "rem-a7:superseded-by-3003" && t5.owner === "qnfo-fleet-control", "its triage row names the successor");
  ok(con(w, "issue-100455").status === "superseded" && /^superseded:3003 /.test(con(w, "issue-100455").last_verdict), "its contract is superseded with the successor named");

  ok(st(w, 100439) === "open" && st(w, 100607) === "open" && st(w, 100064) === "open" && st(w, 1000268) === "open" && st(w, 3003) === "open", "100439, 100607, 100064, 1000268 and 3003 stay open");
  ok(st(w, 1000999) === "open" && con(w, "issue-1000999").status === "active" && tri(w, 1000999).triage_state === "triaged", "an unrelated issue and its contract are untouched");
  ok(con(w, "issue-100439").status === "active" && con(w, "issue-100439").last_verdict === "fail" && con(w, "issue-100439").verify_probe === "SELECT 1 AS expected, 0 AS observed", "100439 keeps its truthful probe: nothing is weakened to pass");
  ok(/FINDING 2026-10-26 \(REM-A7-Q08-1/.test(desc(w, 100439)) && desc(w, 100439).startsWith("original text") && /175 \(70 percent\)/.test(desc(w, 100439)) && /8 of 102/.test(desc(w, 100439)) && /Supersedes 100453/.test(desc(w, 100439)) && /no target is edited to pass/.test(desc(w, 100439)), "100439 gets the finding appended once after its own text");
  ok(tri(w, 100439).owner === "q08-signal-engine" && /^REM-A7-Q08-1/.test(tri(w, 100439).remediation) && /read engine_runs by source prefix/.test(tri(w, 100439).remediation), "100439 names its owner and next action");
  ok(/^REM-A7-Q08-1/.test(tri(w, 100607).remediation) && tri(w, 100607).owner === "q08-signal-engine" && /Qwen3\.8-27B/.test(tri(w, 100607).remediation) && /0\.37\.3/.test(tri(w, 100607).remediation) && con(w, "issue-100607").status === "monitoring", "100607: the measured cause is on the triage row, its monitoring contract is untouched");
  ok(/^REM-A7-Q08-1/.test(tri(w, 100064).remediation) && tri(w, 100064).owner === "personal-companion" && /COMPANION-STALL-YIELD-1/.test(tri(w, 100064).remediation) && con(w, "issue-100064").status === "active" && con(w, "issue-100064").last_verdict === "deferred", "100064: the finding is on the triage row, its detector-closed contract is untouched");

  const c8 = con(w, "issue-1000268");
  ok(c8.status === "active" && c8.verify_transport === "d1-query@q08-signal" && c8.last_verdict === null && c8.attempts === 0 && /q08_forecasts/.test(c8.verify_probe), "1000268: the placeholder is replaced by the real probe, active, on the q08-signal transport", c8);
  ok(!/;/.test(c8.verify_probe) && !/\b(update|delete|insert)\s/i.test(c8.verify_probe), "the probe has no semicolon (the live trigger rewrites one) and no write keyword (the runner guard scans literals)");
  ok(/REM-A7-Q08-1/.test(desc(w, 1000268)) && /not built in this pass/.test(desc(w, 1000268)) && /28 of 28 finished forecast runs/.test(desc(w, 1000268)) && /NO-CLAUDE-RUNTIME-DEPENDENCY-1/.test(desc(w, 1000268)), "1000268 records why the engine side is not built and the standing no-runtime risk");
  ok(q1(w, "SELECT value v FROM ops_config WHERE key = 'q08_arxiv_pool'").v === "100" && /Revert: set the value to 30/.test(q1(w, "SELECT note n FROM ops_config WHERE key = 'q08_arxiv_pool'").n), "ops_config q08_arxiv_pool is written with its default and the revert");
  const dl = w.prepare("SELECT * FROM decision_log").all();
  ok(dl.length === 1 && dl[0].actor === "rem-a7-f2" && /^REM-A7-Q08-1:/.test(dl[0].action) && /ops_config q08_arxiv_pool = 30/.test(dl[0].rollback_path) && /0\.03-0\.05/.test(dl[0].predicted_outcome), "one decision_log row with its prediction and rollback", dl);
  ok(w.prepare("SELECT * FROM capability_ledger").all().length === 1, "one capability_ledger row");

  const s_1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s_1, "a replay changes nothing");

  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(st(w, 100453) === "open" && st(w, 100455) === "open" && tri(w, 100453).triage_state === "triaged" && tri(w, 100453).rc === "AUTOTRIAGE-2" && con(w, "issue-100453").status === "active" && con(w, "issue-100453").last_verdict === "fail" && con(w, "issue-100455").status === "active", "Rollback reopens 100453 and 100455 and re-activates their contracts");
  ok(q1(w, "SELECT COUNT(*) n FROM ops_config WHERE key = 'q08_arxiv_pool'").n === 0 && con(w, "issue-1000268").status === "superseded", "Rollback removes the knob row and re-parks the 1000268 contract");
}

// conditions that must hold at apply time: otherwise 100453 and 100455 stay open and their contracts stay active
{ const w = world({ s100439: "closed" }); w.exec(sql); ok(st(w, 100453) === "open" && con(w, "issue-100453").status === "active", "100439 not open: 100453 stays open"); }
{ const w = world({ s3003: "closed" }); w.exec(sql); ok(st(w, 100455) === "open" && con(w, "issue-100455").status === "active", "3003 not open: 100455 stays open"); }
{ const w = world({ ownedRows: 3 }); w.exec(sql); ok(st(w, 100455) === "open" && con(w, "issue-100455").status === "active", "only three cadence rows have an owner: 100455 stays open"); ok(st(w, 100453) === "closed", "and 100453 does not depend on the cadence rows"); }
{ const w = world({ triggerEnabled: 0 }); w.exec(sql); ok(st(w, 100455) === "open", "the breach trigger disabled: 100455 stays open"); }
{ const w = world(); w.prepare("UPDATE cadence_sla SET sla_min = 120, producer = '   ' WHERE surface = 'q08.org'").run(); w.exec(sql); ok(st(w, 100455) === "open", "a blank producer is not an owner: 100455 stays open"); }

// the closing probe of 1000268, run against a q08-signal-shaped database
{
  const w = world(); w.exec(sql);
  const probe = con(w, "issue-1000268").verify_probe;
  const q = () => { const d = new DatabaseSync(":memory:"); d.exec("CREATE TABLE q08_forecasts (slug TEXT, status TEXT, created_at TEXT); CREATE TABLE q08_audits (slug TEXT PRIMARY KEY, verdict TEXT, stage TEXT); CREATE TABLE q08_retractions (slug TEXT PRIMARY KEY)"); return d; };
  const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();
  const add = (d, slug, o = {}) => { d.prepare("INSERT INTO q08_forecasts VALUES (?, ?, ?)").run(slug, o.status || "open", o.created || iso(1)); if (o.stage !== null) d.prepare("INSERT INTO q08_audits VALUES (?, ?, ?)").run(slug, o.verdict || "pass", o.stage || "publish"); if (o.retracted) d.prepare("INSERT INTO q08_retractions VALUES (?)").run(slug); };
  const run = (d) => d.prepare(probe).get();
  const a = q(); ["a", "b", "c"].forEach((s) => add(a, s, { stage: "claude-research" }));
  ok(run(a).observed === "0 of 3 engine-created open forecasts in the last 7 days (audit stage publish, none retracted)" && run(a).observed !== run(a).expected, "the three hand-researched forecasts (stage claude-research) are not counted: 0 of 3 today", run(a));
  const b = q(); ["a", "b", "c"].forEach((s) => add(b, s));
  ok(run(b).observed === run(b).expected, "three engine-created, recent, open, unretracted forecasts pass", run(b));
  const c = q(); add(c, "a"); add(c, "b"); add(c, "c", { retracted: true });
  ok(run(c).observed !== run(c).expected && /^2 of 3/.test(run(c).observed), "a retracted one is not counted", run(c));
  const d = q(); add(d, "a"); add(d, "b"); add(d, "c", { created: iso(9) });
  ok(run(d).observed !== run(d).expected, "a forecast older than 7 days is not counted", run(d));
  const e = q(); add(e, "a"); add(e, "b"); add(e, "c", { status: "void" });
  ok(run(e).observed !== run(e).expected, "a void forecast is not counted", run(e));
  const f = q(); add(f, "a"); add(f, "b"); add(f, "c", { verdict: "fail" });
  ok(run(f).observed !== run(f).expected, "an audit that failed is not counted", run(f));
  const g = q(); add(g, "a"); add(g, "b"); add(g, "c", { stage: null });
  ok(run(g).observed !== run(g).expected, "a forecast with no audit row is not counted", run(g));
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
