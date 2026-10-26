// TRIGGER-DEPTH-AUDIT-LEAF-1 offline suite: replays migrations/2026-10-26-research-config-audit.sql (the file that put two ops_config triggers in front of cloud_ops_events) and then
// migrations/2026-10-26-config-audit-leaf.sql on node:sqlite, with stand-ins for the live tail of the cloud_ops_events cascade.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, a BACKUP the file creates before it drops the triggers); with the audit triggers of the first file the
// static trigger cascade of fleet_tick is 6 programs (scripts/fleet_graph.mjs triggerDepth, the measure the live graph and the compile-time sweep report; 5 compiled, 6 is refused
// with "triggers nested too deep") and 5 after this file; the audit keeps its names, WHEN clauses, texts, meta and status for insert, replace, value change, unchanged value, an excluded
// key and a non-research key, only in config_change_events and not in cloud_ops_events; the two probes that read config-change events (contract issue-100626, detector
// fm-research-config-unlogged) read the view, return ok on a healthy world and still flag a research_* change that left no event; the new detector reads 2 before and 0 after; a replay
// changes nothing; the Rollback line puts the old behaviour back.
// Output MUST contain "0 failed" on success.   node migrations/config-audit-leaf.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const audit = readFileSync(here("./2026-10-26-research-config-audit.sql"), "utf8");
const sql = readFileSync(here("./2026-10-26-config-audit-leaf.sql"), "utf8");
const FG = await import(pathToFileURL(join(root, "scripts", "fleet_graph.mjs")).href);
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(header.some((l) => /^-- BACKUP: bak_20261026_config_audit_triggers\s*$/.test(l)) && body.indexOf("CREATE TABLE IF NOT EXISTS bak_20261026_config_audit_triggers") < body.indexOf("DROP TRIGGER IF EXISTS ops_config_research_audit_ins"), "the BACKUP table is created, from sqlite_master, before the first DROP TRIGGER");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick or fleet_tick_heavy and no claude.ai link");
ok(!/CREATE\s+TRIGGER[^;]*INTO\s+cloud_ops_events/i.test(body), "no trigger created by this file inserts into cloud_ops_events");

// the world: the live columns the two files use, plus the shape of the live cascade (names and tables read from the qnfo-graph finding of 2026-10-26 16:32Z)
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT);
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, published_at TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY, title TEXT);
CREATE TABLE decision_predictions (id INTEGER PRIMARY KEY, x TEXT);
CREATE TRIGGER research_parallel_autorevert AFTER INSERT ON fleet_tick BEGIN UPDATE ops_config SET value = value WHERE key = 'research_parallel' AND 0; END;
CREATE TRIGGER retention_prune_tick_v2 AFTER INSERT ON fleet_tick BEGIN INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) SELECT 'x', 'x', 'x', 'x', 'x', 'x' WHERE 0; END;
CREATE TRIGGER tool_error_rate_filer_v3_ins AFTER INSERT ON cloud_ops_events BEGIN INSERT INTO agent_issues (id, title, description, status) SELECT 1, 'x', 'x', 'open' WHERE 0; END;
CREATE TRIGGER owner_request_requires_card AFTER INSERT ON agent_issues BEGIN INSERT INTO human_actions (id, title) SELECT 1, 'x' WHERE 0; END;
CREATE TRIGGER human_actions_default_adopt_ai AFTER INSERT ON human_actions BEGIN INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) SELECT 'x', 'x', 'x', 'x', 'x', 'x', 'x' WHERE 0; END;
CREATE TRIGGER decision_predictions_parse AFTER INSERT ON decision_log BEGIN INSERT INTO decision_predictions (id, x) SELECT 1, 'x' WHERE 0; END;`);
  for (const id of [100623, 100626, 1000005]) {
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run("issue-" + id, id, "born", "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open.", "SELECT 'closed' AS expected, NULL AS observed", "d1-query", "qnfo-fleet-control", 1, "superseded", "probe-template-v3-generic");
  }
  w.prepare("INSERT INTO agent_issues VALUES (1000029, 'REVISE-NOOP-WAIVE-1', 'filed text', 'open'), (100439, 'Q08-GATE-ECONOMICS', 'filed text', 'open'), (100453, 'q08 preflight', 'filed text', 'open')").run();
  w.prepare("INSERT INTO ops_config (key, value, note) VALUES ('research_daily_neurons', '360000', NULL), ('research_repo_sync_cursor', 'a', NULL), ('unrelated_key', '1', NULL)").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const depthOf = (w) => {
  const trs = qa(w, "SELECT sql FROM sqlite_master WHERE type = 'trigger'").map((r) => FG.parseTrigger(r.sql)).filter(Boolean);
  return FG.triggerDepth(trs);
};
const before = () => { const w = world(); w.exec(audit); return w; };
const after = () => { const w = before(); w.exec(sql); return w; };

// ---- the static cascade
{
  const d0 = depthOf(before());
  ok(d0.depth === 6 && /ops_config_research_audit_ins|ops_config_research_audit_upd/.test(d0.path.join(" ")) && d0.path[0] === "fleet_tick", "before: fleet_tick cascades 6 trigger programs through an ops_config audit trigger (what D1 refuses)", d0);
  const d1 = depthOf(after());
  ok(d1.depth <= 5, "after: the longest cascade is 5 programs or fewer (what compiled before the audit)", d1);
  const w = after();
  const viaOpsConfig = qa(w, "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'ops_config'").map((r) => FG.parseTrigger(r.sql)).filter(Boolean);
  ok(viaOpsConfig.length === 2 && viaOpsConfig.every((t) => t.writes.join() === "config_change_events"), "both ops_config triggers write only config_change_events", viaOpsConfig.map((t) => t.writes));
  ok(qa(w, "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'config_change_events'").length === 0, "the leaf table has no trigger of its own");
}

// ---- the audit behaves the same, in the leaf
function drive(w, table) {
  const ev = () => qa(w, "SELECT id, ts, kind, text, meta, job, status FROM " + table + " WHERE kind = 'config-change' ORDER BY rowid").map((r) => ({ text: r.text, meta: r.meta, job: r.job, status: r.status, kind: r.kind }));
  const n0 = ev().length;
  w.prepare("INSERT OR REPLACE INTO ops_config (key, value, note) VALUES ('research_ready_cap', '20', 'seed for the suite')").run();
  w.prepare("UPDATE ops_config SET value = '600000', note = 'raise for backlog drain', updated_at = datetime('now') WHERE key = 'research_daily_neurons'").run();
  w.prepare("UPDATE ops_config SET value = '600000', updated_at = datetime('now') WHERE key = 'research_daily_neurons'").run();   // unchanged value: no event
  w.prepare("UPDATE ops_config SET value = '700000', updated_at = datetime('now') WHERE key = 'research_daily_neurons'").run();   // changed, no new note: warn
  w.prepare("UPDATE ops_config SET value = 'b' WHERE key = 'research_repo_sync_cursor'").run();                                   // excluded key
  w.prepare("UPDATE ops_config SET value = '2' WHERE key = 'unrelated_key'").run();                                                // not research_
  return ev().slice(n0);
}
{
  const old = drive(before(), "cloud_ops_events");
  const neu = drive(after(), "config_change_events");
  ok(old.length === 3 && neu.length === 3, "three events for the insert, the changed value and the changed value without a new note (none for the unchanged value, the excluded cursor and the non-research key)", [old.length, neu.length]);
  ok(JSON.stringify(neu) === JSON.stringify(old), "text, meta, job, status and kind are identical to what the first file wrote into cloud_ops_events", { old, neu });
  ok(old[0].status === "ok" && old[2].status === "warn", "the status rule is unchanged: ok with a note, warn without one");
  const w = after();
  const nEvents = q1(w, "SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'config-change'").n;
  drive(w, "config_change_events");
  ok(q1(w, "SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'config-change'").n === nEvents, "after the file no config-change row reaches cloud_ops_events");
  ok(q1(w, "SELECT COUNT(*) n FROM v_config_change_events").n === nEvents + 3, "the view lists the old event and the leaf rows together");
}

// ---- the probes keep measuring the same thing
{
  const w = after();
  for (const cls of ["issue-100626", "fm-research-config-unlogged"]) {
    const p = q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls).p;
    ok(p.includes("v_config_change_events") && !/FROM cloud_ops_events (e )?WHERE (e\.)?kind = 'config-change'/.test(p), cls + ": reads the view, not cloud_ops_events");
  }
  const run = (cls) => { const p = q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls).p; return w.prepare(p).get(); };
  // the first file's positive control landed in cloud_ops_events; a new change lands in the leaf: both count
  ok(run("issue-100626").observed === "ok", "issue-100626 reads ok on a healthy world", run("issue-100626"));
  w.prepare("UPDATE ops_config SET value = '123456', note = 'suite change', updated_at = datetime('now') WHERE key = 'research_daily_neurons'").run();
  ok(run("issue-100626").observed === "ok" && run("fm-research-config-unlogged").observed === "0", "a logged change keeps both probes green (the leaf row is seen through the view)", [run("issue-100626"), run("fm-research-config-unlogged")]);
  // an unlogged change: the audit has been live for an hour, a new research_* key is written and its event is lost (or never written); both probes must still see the gap
  w.prepare("UPDATE cloud_ops_events SET ts = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes') WHERE kind = 'config-change'").run();
  w.prepare("INSERT INTO ops_config (key, value, note) VALUES ('research_new_knob', '5', 'suite')").run();
  w.prepare("DELETE FROM config_change_events WHERE text LIKE '%research_new_knob%'").run();
  ok(/changed without a config-change event/.test(String(run("issue-100626").observed)) && Number(run("fm-research-config-unlogged").observed) >= 1, "a research_* change that left no event is still flagged by both probes", [run("issue-100626"), run("fm-research-config-unlogged")]);
}

// ---- the new detector
{
  const det = (w, text) => w.prepare(text).get();
  const w1 = after();
  const probeText = q1(w1, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-audit-trigger-writes-event-table'").p;
  ok(det(w1, probeText).expected === "0" && det(w1, probeText).observed === "0", "the detector reads 0 after the file", det(w1, probeText));
  ok(det(before(), probeText).observed === "2", "and 2 against the first file's triggers (both insert into cloud_ops_events)", det(before(), probeText));
  ok(q1(w1, "SELECT fm_key FROM failure_modes WHERE fm_key = 'audit-trigger-writes-event-table'") && q1(w1, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'TRIGGER-DEPTH-AUDIT-LEAF-1:%'").n === 1, "failure mode and decision_log row exist");
}

// ---- replay and rollback
{
  const w = after();
  const snap = () => JSON.stringify([qa(w, "SELECT name, sql FROM sqlite_master ORDER BY name"), qa(w, "SELECT class, verify_probe FROM remediation_contracts ORDER BY class"), qa(w, "SELECT actor, action FROM decision_log"), qa(w, "SELECT name FROM bak_20261026_config_audit_triggers ORDER BY name")]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a second apply changes nothing (schema, probes, decision_log, the first backup)");
}
{
  const w = after();
  const bak = qa(w, "SELECT name, sql FROM bak_20261026_config_audit_triggers ORDER BY name");
  ok(bak.length === 2 && bak.every((r) => /INTO cloud_ops_events/.test(r.sql)), "the backup holds the two previous trigger texts, which wrote cloud_ops_events", bak.map((r) => r.name));
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  w.exec(rb);
  ok(qa(w, "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'ops_config'").length === 0 && !q1(w, "SELECT name FROM sqlite_master WHERE name = 'v_config_change_events'"), "Rollback drops the two triggers and the view");
  for (const r of bak) w.exec(r.sql);
  const p = q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-100626'").p;
  ok(!p.includes("v_config_change_events") && /FROM cloud_ops_events WHERE kind = 'config-change'/.test(p), "Rollback puts the probe text back");
  const n0 = q1(w, "SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'config-change'").n;
  w.prepare("UPDATE ops_config SET value = '1', note = 'rollback check' WHERE key = 'research_daily_neurons'").run();
  ok(q1(w, "SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'config-change'").n === n0 + 1, "and the restored triggers write cloud_ops_events again (the previous behaviour)");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
