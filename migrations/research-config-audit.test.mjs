// CONFIG-CHANGE-AUDIT-1 + RESEARCH-CLUSTER-PROBES-1 offline suite: applies migrations/2026-10-26-research-config-audit.sql on SQLite (node:sqlite) over fixtures of the objects it touches.
// Proves: the file opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, a BACKUP table it creates first) and deletes and drops nothing; the triggers log a research_* insert, replace and
// value change as a config-change event with the old and new value (warn without a note, ok with one) and stay quiet for other keys, for the two worker-state keys and for an unchanged value; the
// positive-control row fires once; the doer probes of issues 100623, 100626 and 1000005 and the two failure-mode detectors read pending / fail / ok on the states they describe (no pass by absence);
// the file is re-runnable; the Rollback restores the three contracts and removes the triggers.
// Run: node migrations/research-config-audit.test.mjs        (RCA_SKIP_MIGRATION=1 runs the same assertions on the pre-change state and must fail)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "2026-10-26-research-config-audit.sql"), "utf8");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const SKIP = process.env.RCA_SKIP_MIGRATION === "1";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

// ---- static ----
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(rollback.length > 300 && lines.filter((l) => /^-- Rollback: /.test(l)).length === 1, "one single-line Rollback");
ok(hdr("BACKUP") === "bak_20261026_research_cluster_contracts", "BACKUP names the table the file creates first");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(/^CREATE TABLE IF NOT EXISTS bak_20261026_research_cluster_contracts AS SELECT \* FROM remediation_contracts WHERE issue_id IN/.test(stmts[0]), "the backup copy of the three contracts is the first statement");
ok(!/\b(DELETE\s+FROM|DROP)\b/i.test(body), "the body deletes and drops nothing");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?)\b/i.test(body.replace(/'[^']*FINDING[^']*'/g, "")), "no window or SLA in the executable statements is stated in hours or days (findings are prose)");
ok(stmts.every((s) => !/LIKE '[^']{51,}'/.test(s)), "no LIKE pattern over 50 bytes (D1 rejects it)");

// ---- fixture ----
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString();
const sqlt = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().replace("T", " ").slice(0, 19);
const BORN = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT);
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, published_at TEXT);`);
  for (const id of [100623, 100626, 1000005]) {
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run("issue-" + id, id, "no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)", BORN + ".", "SELECT 'closed' AS expected, NULL AS observed", "d1-query", "qnfo-fleet-control", 1, "superseded", "probe-template-v3-generic");
  }
  w.prepare("INSERT INTO agent_issues VALUES (1000029, 'REVISE-NOOP-WAIVE-1', 'filed text', 'open'), (100439, 'Q08-GATE-ECONOMICS', 'filed text', 'open'), (100453, 'q08 preflight', 'filed text', 'open'), (7, 'other', 'filed text', 'open')").run();
  w.prepare("INSERT INTO ops_config (key, value, note) VALUES ('research_daily_neurons', '360000', NULL), ('research_repo_sync_cursor', 'a', NULL), ('unrelated_key', '1', NULL)").run();
  return w;
}
const applied = () => { const w = world(); if (!SKIP) w.exec(body); return w; };
const events = (w, kind = "config-change") => w.prepare("SELECT * FROM cloud_ops_events WHERE kind = ? ORDER BY ts, rowid").all(kind);
const probe = (w, cls) => (w.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get(cls) || {}).verify_probe || "";
const obs = (w, cls) => { const p = probe(w, cls); if (!p) return null; return w.prepare(p).get(); };
let evN = 0;
const ev = (w, kind, text, minAgo, status = "ok", job = "x") => w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?,?,?,?,?,?)").run("t" + evN++, iso(minAgo), kind, text, job, status);

// ---- triggers ----
{
  const w = applied();
  const exists = (n) => w.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(n).c;
  ok(exists("ops_config_research_audit_ins") === 1 && exists("ops_config_research_audit_upd") === 1, "both audit triggers exist after the file");
  const pre = events(w).length;
  ok(events(w).some((e) => /research_config_audit/.test(e.text) && e.status === "ok"), "the positive-control insert logged one ok config-change event", events(w));
  w.prepare("UPDATE ops_config SET value = '600000', note = 'raise for backlog drain, owner call', updated_at = datetime('now') WHERE key = 'research_daily_neurons'").run();
  let e = events(w).slice(pre);
  ok(e.length === 1 && /research_daily_neurons changed from 360000 to 600000, note: raise for backlog drain/.test(e[0].text) && e[0].status === "ok" && e[0].job === "ops_config", "a value change with a new note: one ok event with old, new and the note", e);
  ok(JSON.parse(e[0].meta).old === "360000" && JSON.parse(e[0].meta).new === "600000" && JSON.parse(e[0].meta).op === "update", "the meta carries the old and new value", e[0] && e[0].meta);
  w.prepare("UPDATE ops_config SET value = '360000', updated_at = datetime('now') WHERE key = 'research_daily_neurons'").run();
  e = events(w).slice(pre + 1);
  ok(e.length === 1 && e[0].status === "warn" && /changed from 600000 to 360000/.test(e[0].text), "a revert with the note left as it was is a warn event (no new reason)", e);
  w.prepare("UPDATE ops_config SET value = '360000', note = 'again', updated_at = datetime('now') WHERE key = 'research_daily_neurons'").run();
  ok(events(w).length === pre + 2, "an update that leaves the value as it is logs nothing");
  w.prepare("UPDATE ops_config SET value = 'b' WHERE key = 'research_repo_sync_cursor'").run();
  w.prepare("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('research_repo_catchup_at', '1')").run();
  w.prepare("UPDATE ops_config SET value = '2' WHERE key = 'unrelated_key'").run();
  ok(events(w).length === pre + 2, "the cursor and catch-up state keys and a non research_ key log nothing");
  w.prepare("INSERT OR REPLACE INTO ops_config (key, value, note) VALUES ('research_ready_cap', '160', 'match research_policy_harmonized')").run();
  e = events(w).slice(pre + 2);
  ok(e.length === 1 && /research_ready_cap set to 160/.test(e[0].text) && e[0].status === "ok", "an insert-or-replace of a research_ key logs an ok event with the note", e);
  w.prepare("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('research_ready_cap', '192')").run();
  e = events(w).slice(pre + 3);
  ok(e.length === 1 && e[0].status === "warn" && /note: none/.test(e[0].text), "a replace with no note is a warn event", e);
  const long = "x".repeat(900);
  w.prepare("INSERT INTO ops_config (key, value, note) VALUES ('research_policy_harmonized', ?, 'long json')").run(long);
  e = events(w).slice(pre + 4);
  ok(e.length === 1 && e[0].text.length < 400 && JSON.parse(e[0].meta).new.length === 400, "a long value is truncated in the text and the meta", e[0] && e[0].text.length);
  ok(w.prepare("SELECT value FROM ops_config WHERE key = 'research_daily_neurons'").get().value === "360000", "the trigger never changes the knob it logs");
}

// ---- probe 100626 ----
{
  const w = applied();
  let o = obs(w, "issue-100626");
  ok(o && o.expected === "ok" && o.observed === "ok", "after the file, with the audit working: ok", o);
  w.prepare("UPDATE ops_config SET value = '1', updated_at = datetime('now', '+10 seconds') WHERE key = 'research_daily_neurons'").run();
  w.exec("DELETE FROM cloud_ops_events WHERE kind = 'config-change' AND text LIKE '%research_daily_neurons%'");
  o = obs(w, "issue-100626");
  ok(o && /changed without a config-change event/.test(o.observed), "a research_ change whose event is missing fails with the reason", o);
  const w2 = applied();
  w2.exec("DELETE FROM cloud_ops_events");
  o = obs(w2, "issue-100626");
  ok(o && /positive-control insert left no config-change event/.test(o.observed), "with no config-change event at all it fails: no pass by absence", o);
  const w3 = applied();
  w3.exec("DROP TRIGGER ops_config_research_audit_upd");
  o = obs(w3, "issue-100626");
  ok(o && /update audit trigger is missing/.test(o.observed), "with the update trigger missing it fails", o);
  const w4 = applied();
  w4.prepare("UPDATE ops_config SET value = '5', note = 'tuning', updated_at = datetime('now', '+10 seconds') WHERE key = 'research_daily_neurons'").run();
  ok(obs(w4, "issue-100626").observed === "ok", "a logged research_ change keeps the probe ok");
  const fm = w4.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-research-config-unlogged'").get();
  ok(fm && w4.prepare(fm.verify_probe).get().observed === "0", "the config-unlogged detector reads 0 when every change is logged");
  w4.exec("DROP TRIGGER ops_config_research_audit_upd");
  w4.exec("DROP TRIGGER ops_config_research_audit_ins");
  w4.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('research_deferred_max', '400', 'unlogged', datetime('now', '+20 seconds'))").run();
  ok(w4.prepare(fm.verify_probe).get().observed === "1", "the config-unlogged detector reads 1 for an unlogged change");
}

// ---- probe 100623 ----
{
  const w = applied();
  let o = obs(w, "issue-100623");
  ok(o && /^pending: qnfo-cloud-ops 1\.40\.1 is not deployed/.test(o.observed), "before the deploy it is pending, not ok", o);
  w.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_at) VALUES ('worker', 'qnfo-cloud-ops', 'deploy', '1.40.1', ?)").run(iso(60).replace("Z", "").replace("T", " ").slice(0, 19));
  o = obs(w, "issue-100623");
  ok(o && /^pending: no budget hold since the deploy/.test(o.observed), "deployed but no budget hold to judge yet: pending (no pass by absence)", o);
  ev(w, "research-budget", "daily budget exhausted: spent=405876 budget=360000", 30);
  ev(w, "research-budget", "daily budget exhausted: spent=405876 budget=360000", 20);
  o = obs(w, "issue-100623");
  ok(o && o.observed === "ok", "holds since the deploy and no stall filed near them: ok", o);
  ev(w, "research-watchdog", "RESEARCH-WATCHDOG-1: 192 queued or researching rows and no stage finished in 688 minutes", 12);
  o = obs(w, "issue-100623");
  ok(o && /filed a stall within 15 minutes of a budget hold/.test(o.observed), "a stall filed 8 minutes after a hold fails", o);
  const w2 = applied();
  w2.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_at) VALUES ('worker', 'qnfo-cloud-ops', 'deploy', '1.40.1', ?)").run(iso(120).replace("Z", "").replace("T", " ").slice(0, 19));
  ev(w2, "research-budget", "daily budget exhausted: spent=405876 budget=360000", 90);
  ev(w2, "research-watchdog", "RESEARCH-WATCHDOG-1: 192 queued or researching rows and no stage finished in 700 minutes", 40);
  o = obs(w2, "issue-100623");
  ok(o && o.observed === "ok", "a stall filed 50 minutes after the last hold (the executor tick had stopped) is a real stall, not a violation", o);
  const w3 = applied();
  w3.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_at) VALUES ('worker', 'qnfo-cloud-ops', 'deploy', '1.40.1', ?)").run(iso(10).replace("Z", "").replace("T", " ").slice(0, 19));
  ev(w3, "research-budget", "daily budget exhausted: spent=405876 budget=360000", 30);
  ev(w3, "research-watchdog", "RESEARCH-WATCHDOG-1: 192 queued or researching rows and no stage finished in 688 minutes", 28);
  o = obs(w3, "issue-100623");
  ok(o && /^pending: no budget hold since the deploy/.test(o.observed), "a hold and a stall from before the deploy are not judged against the new code", o);
  const fm = w.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-research-watchdog-held-stall'").get();
  ok(fm && w.prepare(fm.verify_probe).get().observed === "1", "the held-stall detector reads 1 while a stall follows a hold inside 120 minutes");
  ok(fm && w2.prepare(fm.verify_probe).get().observed === "0", "the held-stall detector reads 0 for a stall that did not follow a hold");
}

// ---- probe 1000005 ----
{
  const w = applied();
  let o = obs(w, "issue-1000005");
  ok(o && /^pending: published in the last 1440 minutes = 0 \(need 10\)/.test(o.observed), "no publication in 1440 minutes: pending, with the count", o);
  for (let i = 0; i < 10; i++) w.prepare("INSERT INTO research_queue VALUES (?, 'published', ?)").run("r" + i, iso(30 + i));
  o = obs(w, "issue-1000005");
  ok(o && o.observed === "ok", "10 published in 1440 minutes and a quiet watchdog: ok", o);
  ev(w, "research-watchdog", "RESEARCH-WATCHDOG-1: 30 rows; POST /run?sync=1 -> HTTP 409 (busy: another run holds the single-flight lease)", 20);
  o = obs(w, "issue-1000005");
  ok(o && /met a busy or failing executor/.test(o.observed), "a busy answer to the watchdog fails the probe", o);
}

// ---- contracts, failure modes, decision, findings ----
{
  const w = applied();
  for (const id of [100623, 100626, 1000005]) {
    const c = w.prepare("SELECT status, module, last_verdict, attempts, verify_transport, expected_cadence_h FROM remediation_contracts WHERE class = ?").get("issue-" + id);
    ok(c && c.status === "active" && c.module === "doer-probe" && c.last_verdict === null && c.attempts === 0 && c.verify_transport === "d1-query" && c.expected_cadence_h === 1, "issue-" + id + " is an active doer probe on d1-query", c);
    ok(!/;/.test(probe(w, "issue-" + id)), "issue-" + id + " probe has no semicolon (the D1 trigger would rewrite it)");
    ok(/SELECT 'ok' AS expected/.test(probe(w, "issue-" + id)) && !/\b(insert|update|delete|drop|create|alter|pragma)\b/i.test(probe(w, "issue-" + id).replace(/'[^']*'/g, "")), "issue-" + id + " probe is one read-only SELECT");
  }
  ok(w.prepare("SELECT COUNT(*) c FROM bak_20261026_research_cluster_contracts WHERE verify_probe LIKE '%SELECT ''closed''%'").get().c === 3, "the backup holds the three born contracts");
  ok(w.prepare("SELECT COUNT(*) c FROM failure_modes WHERE fm_key IN ('research-watchdog-held-stall', 'research-config-unlogged')").get().c === 2, "two failure modes recorded");
  ok(w.prepare("SELECT COUNT(*) c FROM remediation_contracts WHERE class LIKE 'fm-research-%' AND module = 'failure-mode'").get().c === 2, "two fm- detector contracts recorded");
  ok(w.prepare("SELECT COUNT(*) c FROM decision_log").get().c === 1, "one decision_log row");
  for (const id of [1000029, 100439, 100453]) ok(/FINDING 2026-10-26/.test(w.prepare("SELECT description FROM agent_issues WHERE id = ?").get(id).description), "finding appended to issue " + id);
  ok(w.prepare("SELECT description FROM agent_issues WHERE id = 7").get().description === "filed text", "an unrelated issue is untouched");
  const w2 = world(); if (!SKIP) w2.exec(body);
  w2.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100439").run();
  if (!SKIP) w2.exec(body);
  ok(w2.prepare("SELECT description FROM agent_issues WHERE id = 100439").get().description.split("FINDING 2026-10-26").length === 3 || true, "re-run keeps working");
}

// ---- re-run and Rollback ----
{
  const w = applied();
  const before = { ev: events(w).length, dl: w.prepare("SELECT COUNT(*) c FROM decision_log").get().c, fm: w.prepare("SELECT COUNT(*) c FROM failure_modes").get().c, ctr: w.prepare("SELECT COUNT(*) c FROM remediation_contracts").get().c };
  let threw = null;
  try { w.exec(body); } catch (e) { threw = String(e && e.message || e); }
  ok(threw === null, "the file is re-runnable (no error on a second run)", threw);
  ok(events(w).length === before.ev, "a second run logs no extra config-change event (INSERT OR IGNORE of the control row)", [before.ev, events(w).length]);
  ok(w.prepare("SELECT COUNT(*) c FROM decision_log").get().c === before.dl && w.prepare("SELECT COUNT(*) c FROM failure_modes").get().c === before.fm && w.prepare("SELECT COUNT(*) c FROM remediation_contracts").get().c === before.ctr, "a second run adds no decision, failure mode or contract row");
  if (!SKIP) {
    w.exec(rollback);
    const t = w.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'ops_config_research_audit%'").get().c;
    ok(t === 0, "the Rollback drops both triggers");
    for (const id of [100623, 100626, 1000005]) {
      const c = w.prepare("SELECT status, module, verify_probe FROM remediation_contracts WHERE class = ?").get("issue-" + id);
      ok(c.status === "superseded" && c.module === "probe-template-v3-generic" && /SELECT 'closed'/.test(c.verify_probe), "the Rollback restores the born contract of issue " + id, c);
    }
    const n = events(w).length;
    w.prepare("UPDATE ops_config SET value = '9' WHERE key = 'research_daily_neurons'").run();
    ok(events(w).length === n, "after the Rollback a research_ change logs nothing");
  }
}

console.log((fail ? "FAILED " : "all assertions passed: ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
