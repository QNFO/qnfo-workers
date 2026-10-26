// SECRET-CHANGE-VERIFIED-1 offline suite: replays migrations/2026-10-26-secret-change-verified-1.sql on node:sqlite with the live triage close triggers.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); each of the four SECRET-CHANGE-OBSERVED issues is closed through its triage row with its evidence (and
// close_channel auto:triage-sync:rem-a2) when the live facts it quotes hold, and is LEFT OPEN when one of them does not (a stale secret-watch, no github_repo_read ok, a GitHub 401 in the last day, a research-exec 401,
// a stale ask metric or a high ask error rate, no dashboard changelog tick, an authorisation error of the dashboard) or when an active contract of the issue fails; another issue is never touched; a replay changes
// nothing; the evidence holds no secret-looking value; the decision is logged once; the Rollback line reopens the four.
// Run: node migrations/secret-change-verified-1.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-secret-change-verified-1.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes (D1 limit)");
ok(!/\b(ghp_|github_pat_|sk-[A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9._-]{16,})/.test(sql) && !/[0-9a-f]{32,}/i.test(sql), "no secret-looking value is written (no token prefix, no 32+ hex string)");

const iso = (agoMin) => new Date(Date.now() - agoMin * 60e3).toISOString().slice(0, 19) + "Z";
const IDS = { ops: 100333, rx: 100418, ai: 1000199, dash: 1000200 };
const TITLES = { ops: "SECRET-CHANGE-OBSERVED: qnfo-ops 2026-10-20", rx: "SECRET-CHANGE-OBSERVED: qnfo-research-exec 2026-10-21", ai: "SECRET-CHANGE-OBSERVED: qnfo-ai-search 2026-10-25", dash: "SECRET-CHANGE-OBSERVED: qnfo-fleet-dashboard 2026-10-25" };
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT DEFAULT 'open', close_channel TEXT, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, last_verdict TEXT);
CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
-- the live triage close sync triggers (read from live sqlite_master 2026-10-26)
CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END), updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;
CREATE TRIGGER triage_close_sync_issue_ins AFTER INSERT ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END), updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;`);
  for (const k of Object.keys(IDS)) {
    w.prepare("INSERT INTO agent_issues (id, title) VALUES (?, ?)").run(IDS[k], TITLES[k]);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'triaged', 'triaged', 'qnfo-ops', datetime('now'))").run(IDS[k]);
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict) VALUES (?, ?, 'monitoring', 'monitoring:loop-owned-48h (x)')").run("issue-" + IDS[k], IDS[k]);
  }
  w.prepare("INSERT INTO agent_issues (id, title) VALUES (555, 'SECRET-CHANGE-OBSERVED: qnfo-social 2026-10-18')").run();
  w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (555, 'triaged', 'triaged', 'x', datetime('now'))").run();
  const e = w.prepare("INSERT INTO cloud_ops_events (ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, ?)");
  e.run(iso(20), "secret-watch-tick", "secret watch: 35 scripts, 0 secret change(s)", "{}", "qnfo-ops", "ok");
  e.run(iso(60), "ops_ai_tool", "github_repo_read", "{\"resultOk\":true}", "qnfo-ops", "ok");
  e.run(iso(120), "ops_ai_tool", "github_repo_read", "{\"error\":\"path not found: x\",\"resultOk\":false}", "qnfo-ops", "error");
  e.run(iso(30), "idea-to-publish", "idea-to-publish ok", "{}", "qnfo-research-exec", "ok");
  e.run(iso(500), "done", "done ok", "{}", "qnfo-research-exec", "ok");
  e.run(iso(25), "changelog-tick", "changelog tick", "{}", "qnfo-fleet-dashboard", "ok");
  e.run(iso(700), "ga4-ingest", "ga4 ingest", "{}", "qnfo-fleet-dashboard", "ok");
  const m = w.prepare("INSERT INTO metric_registry (metric, last_value, last_refreshed) VALUES (?, ?, ?)");
  m.run("ask_error_rate_7d", "0.04", iso(20)); m.run("ask_answers_7d", "24", iso(20));
  return w;
}
const one = (w, s, ...p) => w.prepare(s).get(...p);
const st = (w, k) => one(w, "SELECT status s, close_channel c FROM agent_issues WHERE id = ?", IDS[k]);
const ev = (w, k) => (one(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = ?", IDS[k]) || {}).e;

// ---- all facts hold: all four close with their evidence, the other issue is untouched, a replay changes nothing
const w = world();
w.exec(sql); w.exec(sql);
for (const k of Object.keys(IDS)) {
  const s = st(w, k);
  ok(s.s === "closed" && s.c === "auto:triage-sync:rem-a2", `${k}: closed through the triage row with close_channel auto:triage-sync:rem-a2`, s);
  ok(/^SECRET-CHANGE-VERIFIED-1 2026-10-26 \(rem-a2\)/.test(ev(w, k)) && ev(w, k).length > 800 && /Limits:/.test(ev(w, k)), `${k}: the evidence is written with its limits`);
  ok(one(w, "SELECT rc, triage_state, owner FROM issue_triage WHERE issue_id = ?", IDS[k]).rc === "secret-change-verified", `${k}: the triage row carries rc secret-change-verified`);
}
ok(/version 549 at 2026-10-20T09:23:40Z/.test(ev(w, "ops")) && /version 362 at 2026-10-21T10:17:14Z/.test(ev(w, "rx")) && /version 77 at 2026-10-25T11:45:11Z/.test(ev(w, "ai")) && /version 404 at 2026-10-25T11:35:36Z/.test(ev(w, "dash")), "each evidence names the secret-triggered version and time it answers");
ok(st(w, "ops") && one(w, "SELECT status s FROM agent_issues WHERE id = 555").s === "open" && one(w, "SELECT triage_state t FROM issue_triage WHERE issue_id = 555").t === "triaged", "another SECRET-CHANGE-OBSERVED issue is not touched");
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'SECRET-CHANGE-VERIFIED-1') > 0").n === 1, "one decision_log row after two applies");
const dl = one(w, "SELECT * FROM decision_log WHERE instr(action, 'SECRET-CHANGE-VERIFIED-1') > 0");
ok(dl.actor.startsWith("rem-a2") && dl.rollback_path.length > 40 && dl.predicted_outcome.length > 40 && dl.capability_gain === "secret-change-verified-by-behaviour", "the decision names its actor, rollback, prediction and capability gain");

// ---- a fact that does not hold leaves that issue open (and only that one)
const unmet = [
  ["ops", "a stale secret-watch", (x) => x.exec("DELETE FROM cloud_ops_events WHERE kind = 'secret-watch-tick'")],
  ["ops", "no github_repo_read ok in 6 hours", (x) => x.exec("UPDATE cloud_ops_events SET ts = '2026-10-01T00:00:00Z' WHERE text = 'github_repo_read' AND status = 'ok'")],
  ["ops", "a GitHub 401 in the last day", (x) => x.prepare("INSERT INTO cloud_ops_events (ts, kind, text, meta, job, status) VALUES (?, 'ops_ai_tool', 'git_op', ?, 'qnfo-ops', 'error')").run(iso(5), "{\"error\":\"GitHub 401: Bad credentials\"}")],
  ["rx", "no idea-to-publish ok in 3 hours", (x) => x.exec("UPDATE cloud_ops_events SET ts = '2026-10-01T00:00:00Z' WHERE kind = 'idea-to-publish'")],
  ["rx", "a research-exec event with an Unauthorized text", (x) => x.prepare("INSERT INTO cloud_ops_events (ts, kind, text, meta, job, status) VALUES (?, 'claim', 'router answered Unauthorized', '{}', 'qnfo-research-exec', 'warn')").run(iso(5))],
  ["ai", "a stale ask metric", (x) => x.prepare("UPDATE metric_registry SET last_refreshed = ? WHERE metric = 'ask_error_rate_7d'").run("2026-10-01T00:00:00Z")],
  ["ai", "an ask error rate of 0.6", (x) => x.exec("UPDATE metric_registry SET last_value = '0.6' WHERE metric = 'ask_error_rate_7d'")],
  ["dash", "no changelog tick in 3 hours", (x) => x.exec("UPDATE cloud_ops_events SET ts = '2026-10-01T00:00:00Z' WHERE kind = 'changelog-tick'")],
  ["dash", "an authorisation error of the dashboard", (x) => x.prepare("INSERT INTO cloud_ops_events (ts, kind, text, meta, job, status) VALUES (?, 'x', 'HTTP 403 from github', '{}', 'qnfo-fleet-dashboard', 'error')").run(iso(5))],
  ["dash", "no ga4-ingest ok since the change", (x) => x.exec("DELETE FROM cloud_ops_events WHERE kind = 'ga4-ingest'")],
  ["ops", "an active contract of the issue that fails", (x) => x.exec("UPDATE remediation_contracts SET status = 'active', last_verdict = 'fail' WHERE issue_id = 100333")],
  ["ai", "an active contract of the issue that fails", (x) => x.exec("UPDATE remediation_contracts SET status = 'active', last_verdict = 'fail' WHERE issue_id = 1000199")],
];
for (const [k, what, mut] of unmet) {
  const x = world(); mut(x); x.exec(sql);
  ok(st(x, k).s === "open", `${k}: left open when ${what}`, st(x, k));
  const others = Object.keys(IDS).filter((o) => o !== k && !unmet.some(([k2, , m2]) => k2 === o && m2 === mut));
  ok(others.every((o) => st(x, o).s === "closed"), `${k}: the other three still close when ${what}`, others.map((o) => st(x, o).s));
}

// ---- the Rollback
const down = /^-- Rollback: (.*)$/m.exec(sql)[1].split(";").map((s) => s.trim()).filter(Boolean);
ok(down.length === 2, "the Rollback is two statements", down.length);
for (const s of down) w.exec(s);
for (const k of Object.keys(IDS)) {
  const s = st(w, k);
  ok(s.s === "open" && s.c === null && ev(w, k) === null && one(w, "SELECT triage_state t FROM issue_triage WHERE issue_id = ?", IDS[k]).t === "triaged", `Rollback: ${k} is open again with its evidence cleared`, s);
}
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'SECRET-CHANGE-VERIFIED-1') > 0").n === 1, "decision_log keeps its row (append-only)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
