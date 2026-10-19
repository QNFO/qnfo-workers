// RELAPSE-WINDOW-CLOSE-EVENT-1 offline suite (VERIFICATION-PATH-2, agent_issues 100193): replays
// migrations/2026-10-19-relapse-window-close-event.sql on node:sqlite against the LIVE qnfo-audit text of everything the D1 trigger
// remediation_reopen_on_relapse_d1 and the view v_closure_relapses touch (migrations/relapse-window-close-event.fixtures.txt, copied from
// sqlite_master on 2026-10-19: the DDL of the five tables, 49 triggers on them, the three decision_log triggers, the registry tables).
// Every fixture is checked against the length(sql) D1 reported, and the trigger against migrations/2026-10-17-measured-pending-triggers.sql.
// Proves:
//   (a) the defect on the live text first: a closed issue touched (updated_at moved) one hour after its close, with three failing verifications
//       between the close and the touch, is NOT reopened by the live trigger and IS by the new one; an issue whose close event is later than its
//       updated_at (the shape of issue 2380: 50 failures from before the close) is reopened by the live trigger on failures that precede the close
//       and is not by the new one until the failures follow the close;
//   (b) an issue with no lifecycle close row (or only a row that landed on another status) behaves exactly as before, touched or not;
//   (c) a legitimate relapse reopens exactly once, a flapping single failure and pass/fail alternation never do, a superseded or moot close, an
//       open twin and pending reads still block, a re-close restarts the window;
//   (d) v_closure_relapses lists an issue exactly when the trigger reopens it, and the detector fm-closure-relapse-unreopened reads the same;
//   (e) the new texts equal the live texts with exactly the start expression replaced (body, header and every other condition byte-identical),
//       the migration is idempotent and keeps its first backup, and its Rollback line puts both objects, the probe and the control row back;
//   (f) the trigger-depth model over the live graph: the remediation_verifications INSERT chain and every other write root are as deep with the
//       new trigger as with the old (the body, hence its write list, is identical), and within D1's limit of 10.
// Run: node migrations/relapse-window-close-event.test.mjs
// Show it failing on the pre-fix state: RELAPSE_NEUTRALISE=1 node migrations/relapse-window-close-event.test.mjs  (the file body is replaced by a no-op)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const FILE = "2026-10-19-relapse-window-close-event.sql";
// RELAPSE_SQL points the suite at another file (a mutant of the migration must make it exit 1)
const real = readFileSync(process.env.RELAPSE_SQL || here(FILE), "utf8");
const neutralised = process.env.RELAPSE_NEUTRALISE === "1";
const sql = neutralised ? "SELECT 1;" : real;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const all = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const BAK = "bak_20261019_relapse_window_objects";

// ---- 0. fixtures: the live text, length-checked ---------------------------------------------------------------------------------------------
const fx = { table: {}, index: {}, view: {}, trigger: {} };
const fxMeta = {};
for (const part of readFileSync(here("relapse-window-close-event.fixtures.txt"), "utf8").split(/^#@ /m).slice(1)) {
  const nl = part.indexOf("\n");
  const [type, tbl, name, len] = part.slice(0, nl).split(" ");
  if (type === "about") continue;
  let body = part.slice(nl + 1);
  if (body.endsWith("\n")) body = body.slice(0, -1);
  fx[type][name] = body; fxMeta[name] = { type, tbl, len: Number(len) };
}
const badLen = Object.entries(fxMeta).filter(([n, m]) => fx[m.type][n].length !== m.len).map(([n, m]) => [n, m.len, fx[m.type][n].length]);
ok(badLen.length === 0, "every fixture has the length(sql) that D1 reported", badLen);
ok(Object.keys(fx.trigger).length === 52 && Object.keys(fx.table).length === 11 && Object.keys(fx.view).length === 1, "52 triggers, 11 tables and the view captured", [Object.keys(fx.trigger).length, Object.keys(fx.table).length]);
const OLD_TRG = fx.trigger.remediation_reopen_on_relapse_d1, OLD_VIEW = fx.view.v_closure_relapses;
ok(OLD_TRG.length === 3507 && OLD_VIEW.length === 1708, "the live trigger is 3507 characters and the live view 1708");
{
  const m = /^CREATE TRIGGER remediation_reopen_on_relapse_d1 .*?^END;/ms.exec(readFileSync(here("2026-10-17-measured-pending-triggers.sql"), "utf8"));
  ok(m && m[0].slice(0, -1) === OLD_TRG, "the live trigger text is the text of migrations/2026-10-17-measured-pending-triggers.sql (an independent copy)");
}
// the live probe of the detector fm-closure-relapse-unreopened (878 characters) and the live evidence of the control row (482 characters)
const OLD_PROBE = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved') AND NOT (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot') AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0 AND COALESCE(v.observed, '') <> '' AND lower(trim(v.observed)) NOT LIKE 'pending%' AND v.verified_at > MAX(datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch'), COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), '1970-01-01'))) >= MAX(1, COALESCE(c.max_attempts, 3))) AS TEXT) AS observed";
const OLD_EVIDENCE = "VERIFICATION-PATH-1 2026-10-19: the gate stays (max_attempts real failures since the closure and last pass, no open twin, pending reads not counted); only its start changes, from agent_issues.updated_at to the issue_lifecycle close event, because updated_at moves on every annotation. Measured: 10 of 1139 closed issues with a lifecycle row were touched after the close; none of the 166 with a live contract is skewed now. The SQL twin keeps the old start until VERIFICATION-PATH-2.";
ok(OLD_PROBE.length === 878 && OLD_EVIDENCE.length === 482, "the live probe is 878 and the live control evidence 482 characters", [OLD_PROBE.length, OLD_EVIDENCE.length]);

// the start expression and what it becomes (written out here from the brief of issue 100193, not taken from the file)
const E_OLD = "datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch')";
const F = (x) => "COALESCE((SELECT replace(substr(MAX(l.ts), 1, 19), 'T', ' ') FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN ('dispositioned', 'closed') AND l.to_status IN ('closed', 'resolved')), " + x + ")";
const EXPECT_TRG = OLD_TRG.replace(E_OLD, F(E_OLD)), EXPECT_VIEW = OLD_VIEW.replace(E_OLD, F(E_OLD)), EXPECT_PROBE = OLD_PROBE.replace(E_OLD, F(E_OLD));
ok(OLD_TRG.split(E_OLD).length === 2 && OLD_VIEW.split(E_OLD).length === 2 && OLD_PROBE.split(E_OLD).length === 2, "the start expression occurs exactly once in the trigger, once in the view and once in the detector probe");

// ---- the fixture database: live DDL, live triggers --------------------------------------------------------------------------------------------
function base() {
  const db = new DatabaseSync(":memory:");
  for (const s of Object.values(fx.table)) db.exec(s);
  for (const s of Object.values(fx.index)) db.exec(s);
  // tables the live triggers read when they fire and that the suite does not replay (columns used only)
  db.exec("CREATE TABLE metric_registry (metric TEXT); INSERT INTO metric_registry VALUES ('failure_modes_recurring')");
  db.exec("CREATE TABLE analytics_metric_triggers (id INTEGER, owner TEXT, metric_key TEXT); CREATE TABLE service_registry (service TEXT, state TEXT)");
  db.exec("CREATE TABLE issue_source_hosts (source TEXT, host TEXT); CREATE TABLE cloud_ops_events (id TEXT)");
  db.exec("CREATE TABLE transport_trust (transport TEXT, trusted INTEGER); INSERT INTO transport_trust VALUES ('d1-query', 1)");
  // SQLite compiles every trigger program a statement can reach, so the tables written by owner_request_requires_card and the tool_error_triage triggers must exist
  db.exec("CREATE TABLE human_actions (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT, status TEXT, source TEXT, created_at TEXT, updated_at TEXT, resolved_at TEXT, resolution TEXT)");
  db.exec("CREATE TABLE tool_error_triage (event_id TEXT, tool TEXT, filed INTEGER, err_head TEXT)");
  db.exec(OLD_VIEW);
  for (const s of Object.values(fx.trigger)) db.exec(s);
  // the rows of the registry the migration edits, as they are live
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, last_verdict, attempts) VALUES ('fm-closure-relapse-unreopened', NULL, 'p', 'failure-mode detector', ?, 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 'pass', 340)").run(OLD_PROBE);
  db.prepare("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id, reviewed_at) VALUES ('relapse-reopen-window', 'loc', 'gate', 'g', 0, 'keep', 'applied', 'alt', ?, 2953, '2026-10-19T15:17:31Z')").run(OLD_EVIDENCE);
  db.exec("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (100193, 'VERIFICATION-PATH-2: the SQL twins of the relapse window still start at agent_issues.updated_at', 'd', 'qnfo-fleet-control', 'reliability', 'medium', 'open', 1792423055000, 1792423055000)");
  db.exec("UPDATE remediation_contracts SET verify_probe = 'SELECT ''2'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE name IN (''remediation_reopen_on_relapse_d1'', ''v_closure_relapses'') AND instr(sql, ''issue_lifecycle'') > 0) AS TEXT) AS observed', verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, next_due_at = NULL, module = 'verification-path' WHERE class = 'issue-100193'");
  db.exec("UPDATE remediation_contracts SET next_due_at = NULL WHERE class = 'issue-100193'"); // remediation_probe_edit_rerun stamped it when the probe was set
  return db;
}
const OLD = () => base();
const NEW = () => { const db = base(); db.exec(sql); return db; };
const sqlOf = (db, name) => one(db, "SELECT sql FROM sqlite_master WHERE name = ?", name)?.sql;

// ---- scenarios --------------------------------------------------------------------------------------------------------------------------------
const NOW = Date.now();
const sp = (min) => new Date(NOW + min * 60000).toISOString().slice(0, 19).replace("T", " "); // minutes relative to now (negative: ago), "YYYY-MM-DD HH:MM:SS"
const iso = (min) => new Date(NOW + min * 60000).toISOString().slice(0, 19) + "Z";
const EV = "remediation_verifications pass=1 (test evidence)";
// spec: id, title, closeAt (minutes ago of the lifecycle close event; null = no lifecycle row), lcTo (to_status of that row), touchAt (updated_at, minutes ago),
//       evidence, max, pre: rows inserted before the contract exists (the trigger cannot fire), twin: an open issue with the same title
function seed(db, s) {
  const upd = NOW + (s.touchAt ?? s.closeAt ?? -300) * 60000;
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, '', 'test', 'optimization', 'medium', 'closed', ?, ?)").run(s.id, s.title, upd - 86400000, upd);
  db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?, 'test', 'triaged', 'qnfo-ops', '2026-10-19', ?)").run(s.id, s.evidence ?? EV);
  if (s.closeAt !== null && s.closeAt !== undefined) db.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence, ts) VALUES (?, ?, 'open', ?, 1, ?)").run(s.id, s.event || "dispositioned", s.lcTo || "closed", iso(s.closeAt));
  for (const r of s.pre || []) row(db, s.id, r);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', ?, 'qnfo-ops', 1, 'active', 'test')").run("issue-" + s.id, s.id, s.max ?? 3);
  if (s.twin) db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, '', 'test', 'optimization', 'medium', 'open', ?, ?)").run(" " + s.title.toUpperCase() + " ", NOW, NOW);
}
// a verification row; [minutes, observed, pass]
function row(db, id, r) {
  const [min, obs = "0", p = 0] = Array.isArray(r) ? r : [r];
  db.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verified_at) VALUES (?, ?, 'd1-query', '1', ?, ?, ?)").run(id, "issue-" + id, obs, p, sp(min));
}
const state = (db, id) => one(db, "SELECT a.status, a.description, t.reopened_count, t.triage_state, t.close_evidence, (SELECT COUNT(*) FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event = 'reopened') AS reopen_events FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.id = ?", id);
const reopened = (db, id) => { const s = state(db, id); return s.status === "open" && s.reopened_count === 1; };
const listed = (db, id) => all(db, "SELECT * FROM v_closure_relapses WHERE issue_id = ?", id).length === 1;
const detector = (db) => one(db, sqlOf2(db, "SELECT verify_probe AS p FROM remediation_contracts WHERE class = 'fm-closure-relapse-unreopened'")).observed;
function sqlOf2(db, s) { return one(db, s).p; }
// run one scenario on a fresh database of the given world; rows after the contract fire the trigger one by one
function run(world, s, rows) { const db = world(); seed(db, s); for (const r of rows) row(db, s.id, r); return db; }

const T = (id, over) => ({ id, title: "RELAPSE-TEST-" + id + ": a probe that keeps failing after its issue closed", max: 3, ...over });

// ---- 1. (a) the defect first: an issue touched after its close -----------------------------------------------------------------------------------
{
  // close event 300 min ago, touched 240 min ago, three failing reads between the close and the touch, one more now
  const s = T(5001, { closeAt: -300, touchAt: -240 });
  const rows = [-290, -280, -270, -5];
  const o = run(OLD, s, rows), n = run(NEW, s, rows);
  const so = state(o, 5001), sn = state(n, 5001);
  ok(so.status === "closed" && so.reopened_count === 0, "(a) DEFECT on the live trigger: the closure touched one hour after its close is not reopened although 3 failures follow the close event", so);
  ok(sn.status === "open" && sn.reopened_count === 1 && sn.triage_state === "triaged" && sn.close_evidence === null && sn.reopen_events === 1, "(a) FIXED: the new trigger reopens it once, resets the triage row and logs one reopened event", sn);
  ok(/REOPENED .* \(REMEDIATION-REOPEN-2, D1 trigger\): contract issue-5001 failed max_attempts times/.test(sn.description), "(a) the reopen note keeps its text");
  // the reopen happens at the third failing read, not before
  const n2 = run(NEW, s, rows.slice(0, 2));
  ok(state(n2, 5001).status === "closed", "(a) two failures after the close are not a relapse", state(n2, 5001));
  // the view and the detector (d): the live view misses it, the new view lists it, before the trigger acts
  for (const [world, expectListed] of [[OLD, false], [NEW, true]]) {
    const db = world(); seed(db, { ...s, pre: [-290, -280, -270, -5] }); // rows before the contract: nothing fires
    ok(listed(db, 5001) === expectListed, "(d) v_closure_relapses " + (expectListed ? "lists" : "misses") + " the touched-after-close closure with " + (world === OLD ? "the live" : "the new") + " text");
    ok(detector(db) === (expectListed ? "1" : "0"), "(d) the detector fm-closure-relapse-unreopened reads " + (expectListed ? "1" : "0") + " with " + (world === OLD ? "the live" : "the new") + " texts", detector(db));
  }
}

// ---- 2. the shape of agent_issues 2380: the close event is LATER than updated_at ------------------------------------------------------------------
{
  // updated_at two days ago, closed 300 min ago, ten failing reads while it was open, then one failing read now
  const pre = Array.from({ length: 10 }, (_, i) => -2800 + i * 100);
  const s = T(5002, { closeAt: -300, touchAt: -2880, pre });
  const o = run(OLD, s, [-5]), n = run(NEW, s, [-5]);
  ok(reopened(o, 5002), "(a) the live trigger reopens a fixed issue on failures from before its close (the 2380 shape: 10 failures from before the close)");
  ok(state(n, 5002).status === "closed", "(a) the new trigger counts from the close event: the one failure after it is not a relapse", state(n, 5002));
  const vo = (() => { const db = OLD(); seed(db, { ...s, pre: [...pre, -5] }); return db; })(), vn = (() => { const db = NEW(); seed(db, { ...s, pre: [...pre, -5] }); return db; })();
  ok(listed(vo, 5002) && !listed(vn, 5002), "(d) the live view lists the 2380 shape (11 failures since updated_at) and the new view does not (1 since the close)");
  ok(detector(vo) === "1" && detector(vn) === "0", "(d) the detector follows: 1 before, 0 after", [detector(vo), detector(vn)]);
  // failures that follow the close do count: three of them reopen
  const n3 = run(NEW, s, [-250, -200, -150]);
  ok(reopened(n3, 5002), "(c) three failures after the close event reopen it with the new trigger");
}

// ---- 3. (b) no lifecycle close row: the old window, touched or not -------------------------------------------------------------------------------
{
  for (const [label, s, rows, expectReopen] of [
    ["no lifecycle row, failures after updated_at", T(5101, { closeAt: null, touchAt: -300 }), [-290, -280, -270], true],
    ["no lifecycle row, failures before a later touch", T(5102, { closeAt: null, touchAt: -240 }), [-290, -280, -270, -5], false],
    ["only a lifecycle row that landed on wontfix", T(5103, { closeAt: -300, lcTo: "wontfix", touchAt: -240 }), [-290, -280, -270, -5], false],
    ["only an opened event", T(5104, { closeAt: -300, event: "opened", lcTo: "closed", touchAt: -240 }), [-290, -280, -270, -5], false],
    ["only a reopened event", T(5105, { closeAt: -300, event: "reopened", lcTo: "closed", touchAt: -240 }), [-290, -280, -270, -5], false],
  ]) {
    const o = run(OLD, s, rows), n = run(NEW, s, rows);
    ok(reopened(o, s.id) === expectReopen && reopened(n, s.id) === expectReopen, "(b) " + label + ": " + (expectReopen ? "reopened" : "not reopened") + " in both worlds", [state(o, s.id).status, state(n, s.id).status]);
    ok(JSON.stringify(state(o, s.id)) === JSON.stringify(state(n, s.id)) || (reopened(o, s.id) && reopened(n, s.id)), "(b) " + label + ": the new trigger leaves the same state as the live one");
  }
  // a lifecycle close row is a close event for resolved too
  const s = T(5106, { closeAt: -300, lcTo: "resolved", touchAt: -240 });
  const n = run(NEW, s, [-290, -280, -270, -5]);
  ok(reopened(n, 5106), "(a) a close event that landed on resolved starts the window too");
  const evt = T(5107, { closeAt: -300, event: "closed", touchAt: -240 });
  ok(reopened(run(NEW, evt, [-290, -280, -270, -5]), 5107), "(a) an event named closed is a close event too");
}

// ---- 4. (c) legitimate relapse, flapping, blockers ------------------------------------------------------------------------------------------------
{
  const legit = T(5201, { closeAt: -300, touchAt: -300 });
  for (const [name, world] of [["live", OLD], ["new", NEW]]) {
    const db = run(world, legit, [-250, -200, -150, -100, -50]);
    const st = state(db, 5201);
    ok(st.status === "open" && st.reopened_count === 1 && st.reopen_events === 1, "(c) " + name + ": a legitimate relapse reopens exactly once across five failing reads", st);
  }
  for (const [name, world] of [["live", OLD], ["new", NEW]]) {
    // a flapping single failure, and fail/pass alternation
    const flap = run(world, T(5202, { closeAt: -300, touchAt: -300 }), [[-250, "0", 1], [-200, "x", 0], [-150, "1", 1]]);
    ok(state(flap, 5202).status === "closed", "(c) " + name + ": one failure between passes does not reopen", state(flap, 5202));
    const alt = run(world, T(5203, { closeAt: -300, touchAt: -300 }), [[-290, "x"], [-280, "1", 1], [-270, "x"], [-260, "1", 1], [-250, "x"], [-240, "1", 1], [-230, "x"]]);
    ok(state(alt, 5203).status === "closed", "(c) " + name + ": fail/pass alternation never reaches max_attempts", state(alt, 5203));
    const two = run(world, T(5204, { closeAt: -300, touchAt: -300 }), [-250, -200]);
    ok(state(two, 5204).status === "closed", "(c) " + name + ": two failures of three are not a relapse");
    // blockers
    for (const [label, over] of [["a superseded close", { evidence: "superseded by issue 9: same defect" }], ["a moot close", { evidence: "moot: the worker was retired" }], ["an open twin", { twin: true }]]) {
      const id = 5300 + Object.keys(over).length * 10 + (label.length % 7);
      const db = run(world, T(id, { closeAt: -300, touchAt: -300, ...over }), [-250, -200, -150, -100]);
      ok(state(db, id).status === "closed", "(c) " + name + ": " + label + " blocks the reopen", state(db, id));
    }
    const pend = run(world, T(5401, { closeAt: -300, touchAt: -300 }), [[-250, "pending: waiting for the deploy"], [-200, "pending: waiting for the deploy"], [-150, "pending: waiting for the deploy"], [-100, "pending: waiting for the deploy"]]);
    ok(state(pend, 5401).status === "closed", "(c) " + name + ": pending reads are not failures", state(pend, 5401));
    const measured = run(world, T(5402, { closeAt: -300, touchAt: -300 }), [[-250, "pending 12 > 10"], [-200, "pending 12 > 10"], [-150, "pending 12 > 10"]]);
    ok(reopened(measured, 5402), "(c) " + name + ": a measured pending read (a comparison with a number) still counts", state(measured, 5402));
    // the issue is open already: no second reopen, and a re-close restarts the window
    const once = run(world, T(5403, { closeAt: -300, touchAt: -300 }), [-250, -200, -150]);
    ok(reopened(once, 5403), "(c) " + name + ": reopened at the third read");
    // a re-close: an UPDATE of status writes its own dispositioned row at real now and moves updated_at
    once.prepare("UPDATE issue_triage SET close_evidence = ? WHERE issue_id = 5403").run(EV);
    once.prepare("UPDATE agent_issues SET status = 'closed', updated_at = ? WHERE id = 5403").run(NOW);
    row(once, 5403, [1]); row(once, 5403, [2]);
    ok(state(once, 5403).status === "closed", "(c) " + name + ": after the re-close two new failures do not reach max_attempts (old failures do not count)", state(once, 5403));
    row(once, 5403, [3]);
    const st = state(once, 5403);
    ok(st.status === "open" && st.reopened_count === 2, "(c) " + name + ": the third failure after the re-close reopens it again", st);
  }
}

// ---- 5. (d) the view agrees with the trigger on the same states ----------------------------------------------------------------------------------
{
  const cases = [
    ["legit", T(5501, { closeAt: -300, touchAt: -300 }), [-250, -200, -150]],
    ["touched after close", T(5502, { closeAt: -300, touchAt: -240 }), [-290, -280, -270]],
    ["close later than updated_at", T(5503, { closeAt: -300, touchAt: -2880 }), [-2800, -2700, -2600, -2500, -5]],
    ["close later, 3 after", T(5504, { closeAt: -300, touchAt: -2880 }), [-250, -200, -150]],
    ["no lifecycle", T(5505, { closeAt: null, touchAt: -300 }), [-250, -200, -150]],
    ["no lifecycle touched", T(5506, { closeAt: null, touchAt: -240 }), [-290, -280, -270, -5]],
    ["two failures", T(5507, { closeAt: -300, touchAt: -300 }), [-250, -200]],
    ["superseded", T(5508, { closeAt: -300, touchAt: -300, evidence: "superseded by issue 9" }), [-250, -200, -150]],
    ["max 5, 5 failures", T(5509, { closeAt: -300, touchAt: -300, max: 5 }), [-250, -200, -150, -100, -50]],
    ["max 5, 4 failures", T(5510, { closeAt: -300, touchAt: -300, max: 5 }), [-250, -200, -150, -100]],
    ["flap", T(5511, { closeAt: -300, touchAt: -300 }), [[-250, "x"], [-200, "1", 1], [-150, "x"], [-100, "x"]]],
  ];
  let agree = 0;
  for (const [name, s, rows] of cases) {
    for (const [wn, world] of [["live", OLD], ["new", NEW]]) {
      // the trigger decides on the last read; the view is read in the same state with the trigger removed
      const withTrg = world(); seed(withTrg, { ...s, pre: rows.slice(0, -1) }); row(withTrg, s.id, rows[rows.length - 1]);
      const noTrg = world(); noTrg.exec("DROP TRIGGER remediation_reopen_on_relapse_d1"); seed(noTrg, { ...s, pre: rows.slice(0, -1) }); row(noTrg, s.id, rows[rows.length - 1]);
      const t = state(withTrg, s.id).status === "open", v = listed(noTrg, s.id);
      if (t === v) agree++; else ok(false, "(d) " + wn + " view and trigger agree on '" + name + "'", { trigger_reopens: t, view_lists: v });
    }
  }
  ok(agree === cases.length * 2, "(d) the view lists an issue exactly when the trigger reopens it: " + agree + " of " + cases.length * 2 + " states (live and new text)", agree);
  // the detector reads the same population as the view for clean states (no twin, no pending tail, quiet for 2 h)
  let dAgree = 0;
  for (const [name, s, rows] of cases.filter(([n]) => n !== "flap")) {
    const db = NEW(); db.exec("DROP TRIGGER remediation_reopen_on_relapse_d1"); seed(db, { ...s, pre: rows });
    if ((detector(db) === "1") === listed(db, s.id)) dAgree++; else ok(false, "(d) the new detector agrees with the new view on '" + name + "'", [detector(db), listed(db, s.id)]);
  }
  ok(dAgree === cases.length - 1, "(d) the new detector and the new view agree on every clean state", dAgree);
  // the two-hour quiet guard of the view is as before: an issue touched within two hours is not listed, in both worlds
  for (const [wn, world] of [["live", OLD], ["new", NEW]]) {
    const db = world(); db.exec("DROP TRIGGER remediation_reopen_on_relapse_d1"); seed(db, T(5601, { closeAt: -100, touchAt: -60, pre: [-90, -80, -70, -5] }));
    ok(!listed(db, 5601), "(d) " + wn + ": the view's two-hour quiet guard is unchanged");
  }
}

// ---- 6. (e) the new objects are the live text with the start expression replaced ------------------------------------------------------------------
const n0 = NEW();
if (!neutralised) {
  ok(sqlOf(n0, "remediation_reopen_on_relapse_d1") === EXPECT_TRG, "(e) the new trigger is the live text with exactly the start expression replaced");
  ok(sqlOf(n0, "v_closure_relapses") === EXPECT_VIEW, "(e) the new view is the live text with exactly the start expression replaced");
  const nt = sqlOf(n0, "remediation_reopen_on_relapse_d1");
  ok(nt.length === 3507 + F(E_OLD).length - E_OLD.length && nt.slice(nt.indexOf("\nBEGIN")) === OLD_TRG.slice(OLD_TRG.indexOf("\nBEGIN")), "(e) the BEGIN..END body of the trigger is byte-identical to the live body");
  ok(nt.slice(0, nt.indexOf("\n")) === OLD_TRG.slice(0, OLD_TRG.indexOf("\n")), "(e) the trigger header line is byte-identical");
  const nv = sqlOf(n0, "v_closure_relapses");
  ok(nv.includes("a.updated_at AS closed_ms") && nv.includes("typeof(a.updated_at) = 'integer'") && nv.includes("< CAST(strftime('%s', 'now') AS INTEGER) - 7200"), "(e) the view keeps closed_ms and its two-hour quiet guard");
  const cols = (db) => all(db, "PRAGMA table_info(v_closure_relapses)").map((c) => c.name).join();
  ok(cols(n0) === cols(OLD()), "(e) the view has the same columns", cols(n0));
  const trg = (db) => all(db, "SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").map((r) => r.name + "@" + r.tbl_name).join();
  ok(trg(n0) === trg(OLD()), "(e) the same 52 triggers exist after the file (no trigger added, none lost)");
  ok(one(n0, "SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('remediation_reopen_on_relapse_d1', 'v_closure_relapses') AND instr(sql, 'issue_lifecycle') > 0").n === 2, "the closing probe of issue 100193 reads 2");
}
// the issue 100193 contract: probe untouched, rescheduled
{
  const o = OLD(), n = NEW();
  const c0 = one(o, "SELECT * FROM remediation_contracts WHERE class = 'issue-100193'"), c1 = one(n, "SELECT * FROM remediation_contracts WHERE class = 'issue-100193'");
  ok(c1.verify_probe === c0.verify_probe && c1.status === "active" && c0.next_due_at === null && (neutralised || c1.next_due_at !== null), "the contract of 100193 keeps its probe and is rescheduled", [c0.next_due_at, c1.next_due_at]);
}
// detector probe, control row, failure mode, detector contract, decision, VERIFICATION-PATH-3
if (!neutralised) {
  const d = one(n0, "SELECT verify_probe, status, last_verdict FROM remediation_contracts WHERE class = 'fm-closure-relapse-unreopened'");
  ok(d.verify_probe === EXPECT_PROBE && d.status === "active", "(e) the detector probe is the live probe with exactly the start expression replaced", d.verify_probe.length);
  const ctl = one(n0, "SELECT evidence, reviewed_at FROM control_registry WHERE control = 'relapse-reopen-window'");
  ok(!ctl.evidence.includes("The SQL twin keeps the old start") && ctl.evidence.includes("VERIFICATION-PATH-2 2026-10-19") && ctl.evidence.startsWith(OLD_EVIDENCE.slice(0, 400)) && ctl.reviewed_at !== "2026-10-19T15:17:31Z", "the control row's evidence says the twins moved and keeps the rest of its text");
  const fm = one(n0, "SELECT * FROM failure_modes WHERE fm_key = 'relapse-window-sql-twin-anchor'");
  ok(fm && fm.probe_class === "fm-relapse-window-sql-twin-anchor" && fm.issue_id === 100193 && fm.first_seen === "2026-10-19", "the failure mode row is written");
  const det = one(n0, "SELECT verify_probe, status, verify_transport FROM remediation_contracts WHERE class = 'fm-relapse-window-sql-twin-anchor'");
  ok(det && det.status === "active" && det.verify_transport === "d1-query", "the detector contract is active");
  const rd = one(n0, det.verify_probe);
  ok(rd.expected === "2" && rd.observed === "2", "the detector probe reads 2 on the new objects", rd);
  const rdOld = one(OLD(), det.verify_probe);
  ok(rdOld.observed === "0", "the detector probe reads 0 on the live objects (it fails where the defect is)", rdOld);
  const dl = all(n0, "SELECT * FROM decision_log WHERE instr(action, 'VERIFICATION-PATH-2:') = 1");
  ok(dl.length === 1 && /^[a-z_]+ <= \d+ within \d+ h$/.test(dl[0].predicted_outcome), "one decision_log row with a predicted_outcome of the form '<metric> <op> <number> within <N> h'", dl.map((r) => r.predicted_outcome));
  const dp = all(n0, "SELECT subject, op, value, kind, origin FROM decision_predictions");
  ok(dp.length === 1 && dp[0].subject === "failure_modes_recurring" && dp[0].op === "<=" && dp[0].value === 12 && dp[0].origin === "parsed", "the live parser trigger turns that prediction into a scored metric prediction", dp);
  const vp3 = all(n0, "SELECT a.id, a.status, a.priority, c.status AS cs, c.module, c.verify_probe FROM agent_issues a JOIN remediation_contracts c ON c.issue_id = a.id WHERE a.title LIKE 'VERIFICATION-PATH-3:%'");
  ok(vp3.length === 1 && vp3[0].status === "open" && vp3[0].cs === "active" && vp3[0].module === "verification-path" && /recurrence_guard_tick/.test(vp3[0].verify_probe), "VERIFICATION-PATH-3 is filed open with an active probe contract", vp3);
  ok(one(n0, vp3[0].verify_probe).observed === "0", "its probe reads 0 until recurrence_guard_tick takes the close-event start");
}

// ---- 7. (e) idempotent re-apply, first backup kept, Rollback restores ----------------------------------------------------------------------------
if (!neutralised) {
  const snapshot = (db) => JSON.stringify({
    objs: all(db, "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name"),
    fm: all(db, "SELECT * FROM failure_modes"), ctl: all(db, "SELECT control, evidence, issue_id FROM control_registry"),
    contracts: all(db, "SELECT class, status, verify_probe, module, last_verdict, attempts FROM remediation_contracts ORDER BY class"),
    issues: all(db, "SELECT title, status FROM agent_issues ORDER BY id"), dl: all(db, "SELECT action FROM decision_log"), dp: all(db, "SELECT subject, op FROM decision_predictions"),
    bak: all(db, "SELECT type, name, sql FROM " + BAK + " ORDER BY type, name"),
  });
  const a = NEW(), b = NEW(); b.exec(sql); b.exec(sql);
  ok(snapshot(a) === snapshot(b), "(e) applying the file again (twice more) changes nothing: objects, registry rows, contracts, issues, decision and the first backup");
  const bak = all(a, "SELECT type, name, sql FROM " + BAK + " ORDER BY type, name");
  ok(bak.length === 4 && bak.find((r) => r.name === "remediation_reopen_on_relapse_d1").sql === OLD_TRG && bak.find((r) => r.name === "v_closure_relapses").sql === OLD_VIEW && bak.find((r) => r.type === "contract-probe").sql === OLD_PROBE && bak.find((r) => r.type === "control-evidence").sql === OLD_EVIDENCE, "(e) the backup table holds the exact live text of the trigger, the view, the detector probe and the control evidence (byte for byte)", bak.map((r) => [r.type, r.name, r.sql.length]));
  // the Rollback line, executed
  const rbLine = /^-- Rollback: (.*)$/m.exec(real)[1];
  const r = NEW(); r.exec(rbLine);
  ok(norm(sqlOf(r, "remediation_reopen_on_relapse_d1")) === norm(OLD_TRG) && norm(sqlOf(r, "v_closure_relapses")) === norm(OLD_VIEW), "(e) the Rollback line restores both objects (identical to the live text but for line breaks, which a header line cannot carry)");
  ok(sqlOf(r, "remediation_reopen_on_relapse_d1").replace(/ /g, "").length === OLD_TRG.replace(/\s/g, "").length, "(e) restored trigger: same characters once whitespace is removed");
  ok(one(r, "SELECT verify_probe AS p FROM remediation_contracts WHERE class = 'fm-closure-relapse-unreopened'").p === OLD_PROBE, "(e) Rollback: the detector probe is back, byte for byte");
  ok(one(r, "SELECT evidence AS e FROM control_registry WHERE control = 'relapse-reopen-window'").e === OLD_EVIDENCE, "(e) Rollback: the control evidence is back, byte for byte");
  ok(one(r, "SELECT COUNT(*) AS n FROM failure_modes").n === 0 && one(r, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-relapse-window-sql-twin-anchor'").n === 0 && one(r, "SELECT status AS s FROM agent_issues WHERE title LIKE 'VERIFICATION-PATH-3:%'").s === "superseded", "(e) Rollback: the failure mode and the detector are gone and VERIFICATION-PATH-3 is superseded");
  // and the live behaviour is back: the defect of (a) reappears
  const s = T(5701, { closeAt: -300, touchAt: -240 });
  const db = (() => { const x = NEW(); x.exec(rbLine); seed(x, s); for (const q of [-290, -280, -270, -5]) row(x, s.id, q); return x; })();
  ok(state(db, 5701).status === "closed", "(e) after the Rollback the live behaviour is back (the touched-after-close closure is not reopened)");
  // the file applied after a rollback restores the new state (the Rollback is not a one-way door)
  const again = NEW(); again.exec(rbLine); again.exec(sql);
  ok(sqlOf(again, "remediation_reopen_on_relapse_d1") === EXPECT_TRG && sqlOf(again, "v_closure_relapses") === EXPECT_VIEW, "(e) the file applied after the Rollback gives the new text again");
}

// ---- 8. file hygiene (the same rules apply_migrations.py --check and the guards enforce) --------------------------------------------------------
{
  ok(/^-- APPLY-BY: ci$/m.test(real) && /^-- DB: qnfo-audit$/m.test(real) && /^-- Rollback: .{200,}/m.test(real) && new RegExp("^-- BACKUP: " + BAK + "$", "m").test(real), "headers: APPLY-BY ci, DB qnfo-audit, a Rollback line, BACKUP " + BAK);
  ok(/^-- spof-review: .{12,}/m.test(real), "a spof-review answer is in the header (SPOF-REVIEW-GATE-1)");
  ok(!/claude\.ai|anthropic\.com/i.test(real), "no claude.ai or anthropic.com link (CLOUDFLARE-ONLY-HOST-1)");
  ok(!/(^|[^A-Za-z0-9&])#\d+/.test(real), "no bare #123 reference");
  ok(!/\bLIKE\s+'[^']{51,}'/i.test(real), "no LIKE pattern over 50 bytes (D1 rejects it)");
  const firstDrop = real.search(/^DROP (TRIGGER|VIEW)/m), mkBackup = real.search(/^CREATE TABLE IF NOT EXISTS bak_20261019_relapse_window_objects AS/m);
  ok(mkBackup >= 0 && mkBackup < firstDrop, "the backup table is created ahead of the first DROP");
  ok(!/^(DELETE|DROP TABLE|DROP INDEX)/im.test(real.replace(/^--.*$/gm, "")), "the file body deletes no rows and drops no table or index");
  const code = real.replace(/^--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''"); // comments and string literals removed
  ok(/INSERT OR IGNORE INTO agent_issues \([^)]*\) VALUES \(/.test(code) && !/INSERT[^;]*INTO agent_issues[^;]*SELECT/i.test(code), "the issue is filed with a single-row VALUES insert (agent_issues refuses INSERT .. SELECT at compile time)");
  const stmts = real.replace(/^--.*$/gm, "").split(/;\s*\n/).filter((x) => x.trim());
  ok(stmts.length >= 13, "the file has its statements", stmts.length);
}

// ---- 9. (f) trigger depth: the live graph as a model, old trigger against new ----------------------------------------------------------------
// writes of a trigger parsed from its own text; the live graph is the 52 replayed triggers plus the seven below that the suite does not replay
const U = (t, ...c) => ({ table: t, event: "UPDATE", cols: c.length ? c : null });
const I = (t) => ({ table: t, event: "INSERT" });
function stripComments(s) { let out = "", q = false; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch === "'") q = !q; if (!q && ch === "-" && s[i + 1] === "-") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; } out += ch; } return out; }
function splitStatements(body) { const st = []; let cur = "", q = false, d = 0; for (const ch of body) { if (ch === "'") q = !q; if (!q) { if (ch === "(") d++; else if (ch === ")") d--; } if (ch === ";" && !q && d === 0) { st.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) st.push(cur.trim()); return st; }
function setCols(rest) { const cols = []; let d = 0, q = false, piece = ""; const flush = () => { const c = /^\s*(\w+)\s*=/.exec(piece); if (c) cols.push(c[1]); piece = ""; };
  for (let i = 0; i < rest.length; i++) { const ch = rest[i]; if (ch === "'") q = !q; if (!q) { if (ch === "(") d++; else if (ch === ")") d--; else if (d === 0 && ch === ",") { flush(); continue; } else if (d === 0 && /\sWHERE\s/i.test(rest.slice(i - 1, i + 7)) && /\s/.test(rest[i - 1]) && rest.slice(i, i + 5).toUpperCase() === "WHERE") break; } piece += ch; }
  flush(); return cols; }
function writesOf(triggerSql) {
  const b = triggerSql.search(/\bBEGIN\b/), e = triggerSql.lastIndexOf("END");
  const w = [];
  for (const s of splitStatements(stripComments(triggerSql.slice(b + 5, e)))) {
    let m;
    if ((m = /^INSERT(?:\s+OR\s+\w+)?\s+INTO\s+(\w+)/i.exec(s))) {
      w.push(I(m[1]));
      const up = /\bON\s+CONFLICT\b[^]*?\bDO\s+UPDATE\s+SET\s+([^]*)$/i.exec(s);
      if (up) w.push(U(m[1], ...setCols(up[1])));
    } else if ((m = /^UPDATE(?:\s+OR\s+\w+)?\s+(\w+)\s+SET\s+/i.exec(s))) w.push(U(m[1], ...setCols(s.slice(m[0].length))));
    else if ((m = /^DELETE\s+FROM\s+(\w+)/i.exec(s))) w.push({ table: m[1], event: "DELETE" });
  }
  return w;
}
function modelOf(name, text) {
  const h = /^CREATE TRIGGER\s+(\w+)\s+(?:BEFORE|AFTER|INSTEAD OF)\s+(INSERT|UPDATE|DELETE)(?:\s+OF\s+([\w\s,]+?))?\s+ON\s+(\w+)/i.exec(text);
  return { name, table: h[4], event: h[2].toUpperCase(), of: h[3] ? h[3].split(",").map((x) => x.trim()) : null, writes: writesOf(text) };
}
const NONCORE = [ // the live triggers on human_actions and tool_error_triage that an agent_issues write reaches (bodies read from sqlite_master 2026-10-19)
  ["human_actions_no_claude_ins", "human_actions", "INSERT", null, []],
  ["human_actions_no_claude_upd", "human_actions", "UPDATE", ["action", "why", "default_in_effect", "title", "url"], []],
  ["human_actions_default_adopt_ai", "human_actions", "INSERT", null, [U("human_actions", "status", "resolved_at", "updated_at", "resolution"), I("decision_log")]],
  ["human_actions_autonomy_first_ai", "human_actions", "INSERT", null, [I("autonomy_reroute_queue"), U("human_actions", "status", "resolved_at", "updated_at", "resolution")]],
  ["human_actions_default_approve_ai", "human_actions", "INSERT", null, [I("autonomy_reroute_queue"), U("human_actions", "status", "resolved_at", "updated_at", "default_in_effect", "resolution"), I("decision_log")]],
  ["tool_error_triage_secret_guard_ins", "tool_error_triage", "INSERT", null, [U("tool_error_triage", "err_head")]],
  ["tool_error_triage_secret_guard_upd", "tool_error_triage", "UPDATE", ["err_head"], [U("tool_error_triage", "err_head")]],
].map(([name, table, event, of, writes]) => ({ name, table, event, of, writes }));
// reentry = how often one trigger may appear on a path: 1 counts distinct triggers (recursive triggers are off on D1), 2 also lets a self-updating trigger count once more
function depth(model, table, event, cols, path, reentry = 1) {
  path = path || []; let best = 0;
  for (const t of model) {
    if (t.table !== table || t.event !== event || path.filter((n) => n === t.name).length >= reentry) continue;
    if (event === "UPDATE" && t.of && cols && !t.of.some((c) => cols.includes(c))) continue;
    let d = 1;
    for (const w of t.writes) d = Math.max(d, 1 + depth(model, w.table, w.event, w.cols, path.concat(t.name), reentry));
    best = Math.max(best, d);
  }
  return best;
}
{
  const live = Object.entries(fx.trigger).filter(([n]) => n !== "remediation_reopen_on_relapse_d1").map(([n, t]) => modelOf(n, t));
  const newText = neutralised ? OLD_TRG : sqlOf(n0, "remediation_reopen_on_relapse_d1");
  const mOld = live.concat(NONCORE, modelOf("remediation_reopen_on_relapse_d1", OLD_TRG)), mNew = live.concat(NONCORE, modelOf("remediation_reopen_on_relapse_d1", newText));
  const wo = modelOf("x", OLD_TRG).writes, wn = modelOf("x", newText).writes;
  ok(JSON.stringify(wo) === JSON.stringify(wn) && wo.length === 3, "model: the trigger writes agent_issues, issue_triage and remediation_contracts, the same three statements in the old and the new text", [wo.length, wn.length]);
  const rel = mNew.find((t) => t.name === "remediation_reopen_on_relapse_d1");
  ok(rel.table === "remediation_verifications" && rel.event === "INSERT" && rel.of === null, "model: it is an AFTER INSERT trigger on remediation_verifications");
  const roots = [...new Set(mOld.map((t) => t.table + "|" + t.event))].map((r) => r.split("|"));
  const diffs = roots.filter(([t, e]) => depth(mOld, t, e) !== depth(mNew, t, e));
  ok(diffs.length === 0, "model: no write root (table, event) of the live graph gets a deeper trigger chain with the new text", diffs.map(([t, e]) => [t, e, depth(mOld, t, e), depth(mNew, t, e)]));
  const dOld = depth(mOld, "remediation_verifications", "INSERT"), dNew = depth(mNew, "remediation_verifications", "INSERT");
  ok(dOld === dNew && dNew <= 10, "model: the remediation_verifications INSERT chain is " + dOld + " levels with the live trigger and " + dNew + " with the new one (D1 limit 10)", [dOld, dNew]);
  const own = (m) => { const t = m.find((x) => x.name === "remediation_reopen_on_relapse_d1"); let d = 1; for (const w of t.writes) d = Math.max(d, 1 + depth(m, w.table, w.event, w.cols, [t.name])); return d; };
  ok(own(mOld) === own(mNew) && own(mNew) === dNew, "model: the trigger's own chain (itself plus the deepest write below it) is " + own(mOld) + " before and " + own(mNew) + " after", [own(mOld), own(mNew)]);
  // the stricter reading ("self-updating triggers count", TRIGGER-DEPTH-SWEEP-1): a trigger may re-enter once; old and new must still agree on every root
  const diffs2 = roots.filter(([t, e]) => depth(mOld, t, e, null, [], 2) !== depth(mNew, t, e, null, [], 2));
  const re = depth(mNew, "remediation_verifications", "INSERT", null, [], 2);
  ok(diffs2.length === 0 && depth(mOld, "remediation_verifications", "INSERT", null, [], 2) === re, "model (a self-updating trigger counts once more): the remediation_verifications INSERT chain is " + re + " with the live trigger and with the new one, and no root changes", diffs2);
  const roots2 = roots.map(([t, e]) => [t + " " + e, depth(mNew, t, e)]).sort((x, y) => y[1] - x[1]);
  ok(roots2[0][1] <= 10, "model: no write root of the live graph is deeper than D1's limit of 10", roots2.slice(0, 3));
  console.log("trigger-depth model over " + mNew.length + " triggers: remediation_verifications INSERT " + dOld + " -> " + dNew + "; deepest roots " + roots2.slice(0, 4).map((r) => r[0] + "=" + r[1]).join(", ") + " (limit 10); with one self re-entry per trigger " + re + "; roots with a changed depth: " + (diffs.length + diffs2.length));
}

console.log((neutralised ? "NEUTRALISED " : "") + "relapse-window-close-event: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
