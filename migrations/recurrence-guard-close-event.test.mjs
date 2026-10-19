// RECURRENCE-GUARD-CLOSE-EVENT-1 offline suite (VERIFICATION-PATH-3, agent_issues 100224): replays
// migrations/2026-10-19-recurrence-guard-close-event.sql on node:sqlite against the LIVE qnfo-audit text of the hourly sweep recurrence_guard_tick and
// of everything it reads and writes (migrations/recurrence-guard-close-event.fixtures.txt for fleet_tick, ops_config, queue_sla_actions,
// recurrence_guard_actions and the sweep; migrations/relapse-window-close-event.fixtures.txt for the five issue tables and their triggers), with
// migrations/2026-10-19-relapse-window-close-event.sql applied first, as it is live.
// Proves:
//   (a) the defect on the live text first: a closure touched after it closed, with max_attempts failures between the close and the touch, is not
//       reopened by the live sweep and is by the new one; a closure whose close event follows updated_at (the shape of issue 2380) is reopened by the
//       live sweep on failures that precede the close and is not by the new one;
//   (b) an issue with no lifecycle close row is judged exactly as before; an open twin still blocks; pending reads are still not counted;
//   (c) the new text equals the live text with exactly the one start expression replaced, the replacement holds no write (so the write list and the
//       trigger depth from a fleet_tick INSERT are unchanged), the file is idempotent and keeps its first backup, and its Rollback line restores the
//       live text and the detector probe;
//   (d) the regression guard fm-relapse-window-sql-twin-anchor reads 3 of 3 after the file and would read 2 of 3 if the sweep were recreated from the old text.
// Run: node migrations/recurrence-guard-close-event.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const FILE = "2026-10-19-recurrence-guard-close-event.sql";
const sql = readFileSync(here(FILE), "utf8");
const PATH2 = readFileSync(here("2026-10-19-relapse-window-close-event.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

function load(file) {
  const fx = { table: {}, index: {}, view: {}, trigger: {} }, meta = {};
  for (const part of readFileSync(here(file), "utf8").split(/^#@ /m).slice(1)) {
    const nl = part.indexOf("\n");
    const [type, tbl, name, len] = part.slice(0, nl).split(" ");
    if (type === "about") continue;
    let body = part.slice(nl + 1);
    if (body.endsWith("\n")) body = body.slice(0, -1);
    fx[type][name] = body; meta[name] = { type, len: Number(len) };
  }
  const bad = Object.entries(meta).filter(([n, m]) => fx[m.type][n].length !== m.len).map(([n]) => n);
  ok(bad.length === 0, file + ": every fixture has the length(sql) D1 reported", bad);
  return fx;
}
const fx1 = load("relapse-window-close-event.fixtures.txt"), fx2 = load("recurrence-guard-close-event.fixtures.txt");
const OLD = fx2.trigger.recurrence_guard_tick;
ok(OLD && OLD.length === 3284, "the live sweep is 3284 characters");
const E = "datetime(a.updated_at / 1000, 'unixepoch')";
const F = "COALESCE((SELECT replace(substr(MAX(l.ts), 1, 19), 'T', ' ') FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN ('dispositioned', 'closed') AND l.to_status IN ('closed', 'resolved')), " + E + ")";
ok(OLD.split(E).length === 2, "the start expression occurs exactly once in the live sweep");
const EXPECT = OLD.replace(E, F);
ok(!/\b(INSERT|UPDATE|DELETE)\b/i.test(F), "(c) the replacement is a read: the sweep's write list, hence its trigger depth from fleet_tick, is unchanged");

function base() {
  const db = new DatabaseSync(":memory:");
  for (const s of Object.values(fx1.table)) db.exec(s);
  for (const s of Object.values(fx1.index)) db.exec(s);
  for (const s of Object.values(fx2.table)) db.exec(s);
  db.exec("CREATE TABLE metric_registry (metric TEXT, last_value TEXT); INSERT INTO metric_registry VALUES ('failure_modes_recurring', '0'), ('stuck_items_over_sla', '0')");
  db.exec("CREATE TABLE queue_sla (stuck_type TEXT, queue TEXT, auto_fix TEXT)");
  db.exec("CREATE TABLE analytics_metric_triggers (id INTEGER, owner TEXT, metric_key TEXT); CREATE TABLE service_registry (service TEXT, state TEXT)");
  db.exec("CREATE TABLE issue_source_hosts (source TEXT, host TEXT); CREATE TABLE cloud_ops_events (id TEXT)");
  db.exec("CREATE TABLE transport_trust (transport TEXT, trusted INTEGER); INSERT INTO transport_trust VALUES ('d1-query', 1)");
  db.exec("CREATE TABLE human_actions (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT, status TEXT, source TEXT, created_at TEXT, updated_at TEXT, resolved_at TEXT, resolution TEXT)");
  db.exec("CREATE TABLE tool_error_triage (event_id TEXT, tool TEXT, filed INTEGER, err_head TEXT)");
  db.exec(fx1.view.v_closure_relapses);
  for (const s of Object.values(fx1.trigger)) db.exec(s);
  db.exec(fx2.trigger.decision_log_queue_sla_ai);
  db.exec(OLD);
  db.prepare("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id, reviewed_at) VALUES ('relapse-reopen-window', 'loc', 'gate', 'g', 0, 'keep', 'applied', 'alt', 'e', 2953, '2026-10-19T15:17:31Z')").run();
  db.exec(PATH2); // live since 2026-10-19 (migration_runs ok)
  return db;
}
const OLDW = () => base();
const NEWW = () => { const db = base(); db.exec(sql); return db; };
const sqlOf = (db, n) => one(db, "SELECT sql FROM sqlite_master WHERE name = ?", n)?.sql;

const NOW = Date.now();
const sp = (min) => new Date(NOW + min * 60000).toISOString().slice(0, 19).replace("T", " ");
const iso = (min) => new Date(NOW + min * 60000).toISOString().slice(0, 19) + "Z";
// failures are written before the contract exists, so the D1 trigger remediation_reopen_on_relapse_d1 cannot fire and only the sweep decides
function seed(db, s) {
  const upd = NOW + s.touchAt * 60000;
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, '', 'test', 'optimization', 'medium', 'closed', ?, ?)").run(s.id, s.title, upd - 86400000, upd);
  db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?, 'test', 'triaged', 'qnfo-ops', '2026-10-19', 'remediation_verifications pass=1 (test evidence)')").run(s.id);
  if (s.closeAt != null) db.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence, ts) VALUES (?, 'dispositioned', 'open', 'closed', 1, ?)").run(s.id, iso(s.closeAt));
  for (const r of s.rows) {
    const [min, obs] = Array.isArray(r) ? r : [r, "0"];
    db.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verified_at) VALUES (?, ?, 'd1-query', '1', ?, 0, ?)").run(s.id, "issue-" + s.id, obs, sp(min));
  }
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 3, 'qnfo-ops', 1, 'active', 'test')").run("issue-" + s.id, s.id);
  if (s.twin) db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, '', 'test', 'optimization', 'medium', 'open', ?, ?)").run(s.title.toUpperCase(), NOW, NOW);
}
const tick = (db) => db.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
const status = (db, id) => one(db, "SELECT a.status, t.reopened_count FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.id = ?", id);
function run(world, s) { const db = world(); seed(db, s); tick(db); return db; }
const T = (id, o) => ({ id, title: "SWEEP-TEST-" + id + ": a probe that keeps failing after its issue closed", ...o });

// (a) a closure touched after it closed: 3 failures between the close (300 min ago) and the touch (240 min ago)
{
  const s = T(6001, { closeAt: -300, touchAt: -240, rows: [-290, -280, -270] });
  const o = status(run(OLDW, s), 6001), n = status(run(NEWW, s), 6001);
  ok(o.status === "closed" && o.reopened_count === 0, "(a) DEFECT on the live sweep: 3 failures after the close event are not counted because the row was touched later", o);
  ok(n.status === "open" && n.reopened_count === 1, "(a) FIXED: the new sweep reopens it once", n);
  const db = run(NEWW, s);
  ok(one(db, "SELECT COUNT(*) AS n FROM recurrence_guard_actions WHERE issue_id = 6001 AND applied = 1").n === 1, "(a) one applied recurrence_guard_actions row");
  ok(one(db, "SELECT COUNT(*) AS n FROM queue_sla_actions WHERE stuck_type = 'closure-relapse'").n === 1, "(a) one queue_sla_actions row");
  tick(db);
  ok(one(db, "SELECT COUNT(*) AS n FROM recurrence_guard_actions WHERE issue_id = 6001").n === 1, "(a) a second tick on the open issue writes nothing more");
}
// (a) the shape of issue 2380: closed 200 min ago, updated_at 300 min ago, 3 failures before the close
{
  const s = T(6002, { closeAt: -200, touchAt: -300, rows: [-290, -280, -270] });
  ok(status(run(OLDW, s), 6002).status === "open", "(a) DEFECT on the live sweep: a fresh fix is reopened on failures that precede its close");
  ok(status(run(NEWW, s), 6002).status === "closed", "(a) FIXED: the new sweep keeps it closed");
  const s2 = T(6003, { closeAt: -200, touchAt: -300, rows: [-190, -180, -170] });
  ok(status(run(NEWW, s2), 6003).status === "open", "(a) the same closure with 3 failures after the close is reopened");
}
// (b) unchanged cases
{
  const s = T(6004, { closeAt: null, touchAt: -300, rows: [-290, -280, -270] });
  ok(status(run(OLDW, s), 6004).status === "open" && status(run(NEWW, s), 6004).status === "open", "(b) no lifecycle close row: reopened by both, as before");
  const s2 = T(6005, { closeAt: null, touchAt: -300, rows: [-290, -280] });
  ok(status(run(NEWW, s2), 6005).status === "closed", "(b) two failures are not a relapse");
  const s3 = T(6006, { closeAt: -300, touchAt: -300, rows: [-290, -280, -270], twin: true });
  ok(status(run(NEWW, s3), 6006).status === "closed", "(b) an open twin with the same title still blocks the reopen");
  const s4 = T(6007, { closeAt: -300, touchAt: -300, rows: [[-290, "pending: x"], [-280, "pending: y"], [-270, "pending: z"]] });
  ok(status(run(NEWW, s4), 6007).status === "closed", "(b) pending reads are not counted");
  const s5 = T(6008, { closeAt: -60, touchAt: -60, rows: [-50, -40, -30] });
  ok(status(run(NEWW, s5), 6008).status === "closed", "(b) the two-hour quiet guard on updated_at still holds");
}
// (c) text, idempotence, backup, rollback
{
  const db = NEWW();
  ok(sqlOf(db, "recurrence_guard_tick") === EXPECT, "(c) the new sweep equals the live text with exactly the start expression replaced", sqlOf(db, "recurrence_guard_tick")?.length);
  ok(one(db, "SELECT sql FROM bak_20261019_recurrence_guard_tick WHERE name = 'recurrence_guard_tick'").sql === OLD, "(c) the backup holds the exact live text");
  db.exec(sql);
  ok(sqlOf(db, "recurrence_guard_tick") === EXPECT && one(db, "SELECT COUNT(*) AS n FROM bak_20261019_recurrence_guard_tick").n === 1, "(c) a second apply changes nothing and keeps the first backup");
  ok(one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'VERIFICATION-PATH-3:') = 1").n === 1, "(c) one decision row");
  const rb = /^-- Rollback: (.*)$/m.exec(sql)[1];
  db.exec(rb);
  ok(norm(sqlOf(db, "recurrence_guard_tick")) === norm(OLD), "(c) the Rollback line restores the live sweep (whitespace collapsed)");
  ok(one(db, "SELECT verify_probe AS p FROM remediation_contracts WHERE class = 'fm-relapse-window-sql-twin-anchor'").p.startsWith("SELECT '2'"), "(c) the Rollback line restores the detector probe");
}
// (d) the regression guard
{
  const db = NEWW();
  const probe = one(db, "SELECT verify_probe AS p FROM remediation_contracts WHERE class = 'fm-relapse-window-sql-twin-anchor'").p;
  const r = one(db, probe);
  ok(r.expected === "3" && r.observed === "3", "(d) the detector reads 3 of 3 after the file", r);
  db.exec("DROP TRIGGER recurrence_guard_tick"); db.exec(OLD);
  ok(one(db, probe).observed === "2", "(d) a sweep recreated from the old text makes the detector fail");
  const c = one(base(), "SELECT verify_probe AS p FROM remediation_contracts WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'VERIFICATION-PATH-3:%')");
  if (c) { ok(one(base(), c.p).observed === "0", "(d) the issue 100224 probe fails before the file"); const n = NEWW(); ok(one(n, c.p).observed === "1", "(d) and passes after it"); }
}
console.log(`recurrence-guard-close-event: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
