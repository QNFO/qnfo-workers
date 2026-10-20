// EXTRACT-FAIL-PROBE-1 offline suite (agent_issues 2877): runs migrations/2026-10-19-extract-fail-probe.sql on node:sqlite and checks
// the probe it installs against synthetic cloud_ops_events and deployment_history. The probe must (0) read not-live-300m until a
// successful deploy of the fix release (a version_id at or past 0.28.5 parsed as numbers, or the tag extract-xref-fixes) is 300
// minutes old with no lower deploy after it, so that no event it counts predates the fix and it cannot pass on a measurement of
// the old code, (1) read defect while a parse failure of the extraction is present in the last 300 minutes, whatever wording its
// reason carries, (2) read ok only with real verify activity in the window and no failure, (3) read no-activity when the stage is
// idle, (4) leave empty replies and replies with no JSON to the stage's own retry, (5) count an exhausted extraction of any cause,
// (6) with the gate open and the OLD code live, never read ok over the real failure times of 2026-10-17 to 10-19 (the longest gap
// between two failures is 219 minutes, shorter than the window), where the 120-minute window it replaces did. The migration
// replaces only the signature probe, replays as a no-op, and its Rollback header restores the probe text that stood.
// Run: node migrations/extract-fail-probe.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-19-extract-fail-probe.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

// The probe text that stands on the live contract (read 2026-10-19).
const OLD = `SELECT '1' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM v_loop_breaker_signatures WHERE producer = 'qnfo-research-exec' AND sig = '{"ok":false,"stage":"verify","extractFailed":,"c' AND datetime(last_ts) > datetime('now', '-6 hours')) THEN '1' ELSE '0' END AS observed`;

function mkDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT, last_verdict TEXT);"
    + "CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);"
    + "CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);"
    + "CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT);"
    + "CREATE TABLE decision_log (id INTEGER PRIMARY KEY, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, ts TEXT DEFAULT (datetime('now')));"
    + "CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'append-only'); END;");
  const insC = db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, next_due_at, status, last_verdict) VALUES (?,?,?,?,?,?,?)");
  insC.run("issue-2877", 2877, OLD, "d1-query", "2099-01-01 00:00:00", "active", "fail");
  insC.run("issue-2671", 2671, "SELECT '1' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM v_loop_breaker_signatures WHERE producer = 'qnfo-research-exec' AND sig = '{\"ok\":false,\"stage\":\"complete\",\"stalled\":}') THEN '1' ELSE '0' END AS observed", "d1-query", "2099-01-01 00:00:00", "active", "fail");
  return db;
}
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const probeOf = (db, cls) => db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get(cls || "issue-2877").verify_probe;

// ---- header rules ----
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && (sql.match(/^-- Rollback: /gm) || []).length === 1, "the header carries APPLY-BY ci, DB qnfo-audit and one Rollback line");
ok(!/\b(delete from|drop table|drop index)\b/i.test(body), "the file deletes and drops nothing (no BACKUP header needed)");

// ---- the migration ----
const db = mkDb();
db.exec(body);
const probe = probeOf(db);
ok(probe !== OLD && !probe.includes("v_loop_breaker_signatures") && probe.includes("verify-extract-fail") && probe.includes("-300 minutes") && !probe.includes("-120 minutes"), "the signature probe is replaced by the 300-minute failure probe");
ok(!/hours?'|days?'/.test(probe), "the window is stated in minutes");
ok(probe.indexOf("FROM deployment_history") > 0 && probe.indexOf("FROM deployment_history") < probe.indexOf("FROM cloud_ops_events") && /THEN 'not-live-300m' WHEN/.test(probe) && !/'pending/i.test(probe), "the deploy gate is the first branch, reads 'not-live-300m' and is not a 'pending' deferral");ok(probeOf(db, "issue-2671").includes("v_loop_breaker_signatures"), "the sibling issue-2671 contract is untouched");
ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(db.prepare("SELECT next_due_at FROM remediation_contracts WHERE class = 'issue-2877'").get().next_due_at) && db.prepare("SELECT next_due_at FROM remediation_contracts WHERE class = 'issue-2877'").get().next_due_at < "2099-01-01" && db.prepare("SELECT next_due_at FROM remediation_contracts WHERE class = 'issue-2671'").get().next_due_at === "2099-01-01 00:00:00", "the contract is due now and the sibling's due time is untouched");
ok(db.prepare("SELECT count(*) n FROM decision_log").get().n === 1 && /^EXTRACT-FAIL-PROBE-1:/.test(db.prepare("SELECT action FROM decision_log").get().action), "one decision_log row");
const lowProbe = probe.toLowerCase();
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
ok(lowProbe.startsWith("select") && !WRITE_KW.some((k) => lowProbe.includes(k)) && !probe.replace(/;\s*$/, "").includes(";"), "the probe is one literal read-only SELECT (the consumer's gate)");

// replay is a no-op
const before = probeOf(db);
db.exec(body);
ok(probeOf(db) === before && db.prepare("SELECT count(*) n FROM decision_log").get().n === 1, "a replay changes nothing and adds no second decision_log row");
// a contract whose probe someone already changed is left alone
const db2 = mkDb();
db2.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT ''ok'' AS expected, ''ok'' AS observed' WHERE class = 'issue-2877'").run();
db2.exec(body);
ok(probeOf(db2) === "SELECT 'ok' AS expected, 'ok' AS observed", "a probe that is not the signature probe is not overwritten");

// ---- the probe against synthetic events ----
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().replace(/\.\d+Z$/, ".000Z");
let seq = 0;
const ev = (minAgo, kind, text, status, job) => db.prepare("INSERT INTO cloud_ops_events VALUES (?,?,?,?,?,?,?)").run("e" + (++seq), iso(minAgo), kind, text, "{}", job || "qnfo-research-exec", status || "ok");
const clear = () => db.exec("DELETE FROM cloud_ops_events");
// deployment_history rows as the ledger writes them: canonical-deploy rows carry '2026-10-19T22:06:18.570Z', direct deploys
// '2026-10-17T14:39:29Z', older writers '2026-09-26 09:16:01' and '2026-09-27T18:42:56.759799Z' (live lengths 24, 20, 19, 27).
const FMT = {
  z3: (d) => d.toISOString(),
  z0: (d) => d.toISOString().replace(/\.\d+Z$/, "Z"),
  sp: (d) => d.toISOString().replace("T", " ").replace(/\.\d+Z$/, ""),
  z6: (d) => d.toISOString().replace(/Z$/, "789Z"),
};
const TAG_VERSION = "0.28.5-extract-xref-fixes";
const dep = (minAgo, o) => { o = o || {}; db.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, deployed_at, status) VALUES (?,?,?,?,?,?,?)").run("worker", o.worker || "qnfo-research-exec", o.action || "deploy", ("version" in o ? o.version : TAG_VERSION), "canonical-deploy", (FMT[o.fmt || "z3"])(new Date(Date.now() - minAgo * 60000)), o.status || "success"); };
const clearDeps = () => db.exec("DELETE FROM deployment_history");
dep(400);
const activity = (n, minAgo) => { for (let i = 0; i < n; i++) ev((minAgo || 5) + i, "done", '{"ok":true,"stage":"verify->publish","claims":3}', "ok"); };
const read = () => { const r = db.prepare(probeOf(db)).get(); return r.expected + "/" + r.observed; };
const UNP_OLD = "row=a attempt=1 reason=unparseable: Bad escaped character in JSON at position 66 (line 3 column 49) raw_chars=3194 head=[ { ";
const UNP_NEW = "row=a attempt=1 reason=unparseable: Expected ',' or '}' after property value in JSON at position 52 (line 1 column 53) raw_chars=103 head=[ { tail=... near=...";

clear(); activity(20);
ok(read() === "ok/ok", "twenty verify events and no failure read ok", read());
ev(10, "verify-extract-fail", UNP_OLD, "warn");
ok(read() === "ok/defect", "an unparseable extraction in the window reads defect", read());
clear(); activity(20); ev(10, "verify-extract-fail", UNP_NEW, "warn");
ok(read() === "ok/defect", "the same failure under the wording 0.28.5 reports (first failing try, tail=, near=) still reads defect: a change of reason text cannot pass it", read());
clear(); activity(20); ev(310, "verify-extract-fail", UNP_OLD, "warn");
ok(read() === "ok/ok", "a failure older than 300 minutes is outside the window", read());
clear(); activity(20); ev(299, "verify-extract-fail", UNP_OLD, "warn");
ok(read() === "ok/defect", "a failure 299 minutes ago is inside it", read());
clear(); activity(20); ev(130, "verify-extract-fail", UNP_OLD, "warn");
ok(read() === "ok/defect", "a failure 130 minutes ago, outside the former 120-minute window, is inside this one", read());
clear(); activity(14);
ok(read() === "ok/no-activity", "fourteen verify events are not enough activity to read ok", read());
clear(); activity(15);
ok(read() === "ok/ok", "fifteen verify events are", read());
clear(); for (let i = 0; i < 20; i++) ev(5 + i, "done", '{"ok":true,"stage":"review->verify"}', "ok");
ok(read() === "ok/no-activity", "done events of other stages are not verify activity", read());
clear(); activity(20, 310);
ok(read() === "ok/no-activity", "verify activity older than the window is not activity", read());
clear(); activity(20); ev(10, "verify-extract-fail", "row=a attempt=1 reason=empty-reply raw_chars=0 head=", "warn"); ev(12, "verify-extract-fail", "row=b attempt=1 reason=no-json-list raw_chars=32044 head=Here is a revised version", "warn");
ok(read() === "ok/ok", "an empty reply and a reply with no JSON are left to the stage's retry", read());
ev(8, "done", '{"ok":false,"stage":"verify","extractFailed":3,"cause":"empty-reply"}', "error");
ok(read() === "ok/defect", "an exhausted extraction (error-level done with extractFailed) counts, whatever its cause", read());
clear(); activity(20); ev(8, "done", '{"ok":false,"stage":"verify","extractFailed":1,"cause":"empty-reply","retry":true}', "warn");
ok(read() === "ok/ok", "a retry still in budget (warn) is not an exhausted extraction", read());
clear(); activity(20); ev(10, "verify-extract-fail", UNP_OLD, "warn", "qnfo-other-worker");
ok(read() === "ok/ok", "another producer's events do not count", read());

// ---- the deploy gate (first branch): the event counts alone pass on the old code ----
{
  const gate = (setup, want, msg) => { clear(); clearDeps(); activity(20); setup(); const r = read(); ok(r === want, msg, r); return r; };
  const SHUT = "ok/not-live-300m", OPEN = "ok/ok";
  gate(() => {}, SHUT, "no deploy row: twenty verify events and no failure still read not-live-300m (the old code's quiet gap cannot pass)");
  gate(() => dep(299), SHUT, "a deploy of the release 299 minutes ago keeps the gate shut");
  gate(() => dep(301), OPEN, "a deploy of the release 301 minutes ago opens it");
  gate(() => dep(400, { status: "failed" }), SHUT, "a failed deploy of the release does not open it");
  gate(() => dep(400, { worker: "qnfo-ops" }), SHUT, "the tag on another worker's row does not open it");
  gate(() => dep(400, { version: "0.28.1-proportionate-notice" }), SHUT, "an older release of the same worker (the one live now) does not open it");
  gate(() => dep(400, { action: "compat-restore" }), SHUT, "a compat-restore row is not a deploy of the release");
  gate(() => dep(400, { action: "deploy-backfill" }), SHUT, "a backfill row is not a deploy of the release");
  gate(() => dep(400, { action: "deploy-direct" }), OPEN, "a successful deploy-direct (DEPLOY-SECOND-PATH-1) of the release opens it");
  gate(() => dep(400, { action: "deploy-direct", status: "failed" }), SHUT, "a failed deploy-direct does not");
  gate(() => { dep(400); dep(20, { version: "0.28.6-something-else" }); }, OPEN, "a later bump past the release does not close it: the ledger row of the release is history");
  gate(() => { dep(400); dep(20, { version: "0.28.6-something-else", status: "failed" }); }, OPEN, "nor does a later failed deploy");

  // the release is a version number, not a string (a re-bump by another PR need not keep the suffix)
  const rel = (v, want, msg) => gate(() => dep(400, { version: v }), want, "version_id " + v + " 400 minutes old " + msg);
  rel("0.28.7-other", OPEN, "opens it without the tag (a re-bump past 0.28.5)");
  rel("0.28.5", OPEN, "opens it at the release's own number");
  rel("0.28.10-x", OPEN, "opens it (10 is above 3 as numbers)");
  rel("0.29.0-x", OPEN, "opens it");
  rel("1.0.0", OPEN, "opens it");
  rel("0.28.4-x", SHUT, "keeps it shut (below the release)");
  rel("0.28.4", SHUT, "keeps it shut");
  rel("0.27.9-x", SHUT, "keeps it shut");
  rel("0.9.10", SHUT, "keeps it shut (a string compare would put 0.9.10 above 0.28.5)");
  rel("12345678", SHUT, "keeps it shut (a bare number is not a version)");
  rel("abcdef0", SHUT, "keeps it shut");
  rel("v0.28.5-extract-xref-fixes", OPEN, "opens it by the tag, the second path, although the number does not parse");
  gate(() => dep(400, { version: null }), SHUT, "a row with no version_id does not open it");
  gate(() => { dep(400, { version: "0.28.5" }); dep(20, { version: null }); }, OPEN, "nor does a later row with no version_id shut it (it proves no revert)");

  // a revert of the release shuts the gate again: the old code is live after it
  gate(() => { dep(500); dep(100, { version: "0.28.4-x" }); }, SHUT, "a later deploy below the release (a revert) shuts the gate");
  gate(() => { dep(500); dep(450, { version: "0.28.4-x" }); dep(100, { version: "0.28.6-y" }); }, SHUT, "a revert re-released 100 minutes ago keeps it shut: the window would still hold the old code");
  gate(() => { dep(500); dep(450, { version: "0.28.4-x" }); dep(400, { version: "0.28.6-y" }); }, OPEN, "a revert re-released 400 minutes ago opens it");
  gate(() => { dep(600, { version: "0.28.4-x" }); dep(400); }, OPEN, "a deploy below the release before it is history");
  gate(() => { dep(500); dep(100, { version: "0.28.4-x", status: "failed" }); }, OPEN, "a failed deploy below the release changed nothing and does not shut it");
  gate(() => { dep(500, { fmt: "z3" }); dep(100, { version: "0.28.4-x", fmt: "sp" }); }, SHUT, "the revert check compares deployed_at through datetime() too (mixed formats)");

  for (const f of Object.keys(FMT)) {
    gate(() => dep(400, { fmt: f }), OPEN, "a " + f + "-format deployed_at 400 minutes ago opens it");
    gate(() => dep(30, { fmt: f }), SHUT, "a " + f + "-format deployed_at 30 minutes ago keeps it shut (the column mixes formats, so it is compared through datetime())");
  }
  // the gate comes before the event branches
  clear(); clearDeps(); activity(20); ev(10, "verify-extract-fail", UNP_OLD, "warn");
  ok(read() === SHUT, "a failure in the window with no deploy row still reads not-live-300m (the gate is first)", read());
  clear(); clearDeps();
  ok(read() === SHUT, "an idle stage with no deploy row reads not-live-300m, not no-activity", read());
  dep(400);
  ok(read() === "ok/no-activity", "the same idle stage once the gate is open reads no-activity", read());
  // the verdict is never read as a deferral and never as a pass
  clear(); clearDeps(); activity(20);
  const closed = db.prepare(probeOf(db)).get();
  ok(closed.expected === "ok" && closed.observed !== closed.expected && !/^pending/i.test(closed.observed), "the shut gate is a fail verdict, not a pass and not a 'pending' deferral", closed);
  dep(400); clear();
}

// ---- the probe and the worker: the worker's own VERSION is a release the gate accepts ----
{
  const wsrc = readFileSync(new URL("../qnfo-research-exec/worker.js", import.meta.url), "utf8");
  const vm = /var VERSION = "([^"]*)";/.exec(wsrc);
  ok(!!vm, "the worker's VERSION literal is readable");
  if (vm) {
    // The gate reads the leading x.y.z (or the tag) of the version_id the ledger records, which is the worker's VERSION. Any VERSION at
    // or past 0.28.5 opens it, with or without the tag, so a re-bump cannot strand the contract at not-live; a VERSION below fails here.
    clear(); clearDeps(); activity(20); dep(400, { version: vm[1] });
    ok(read() === "ok/ok", "a ledger row carrying the worker's own VERSION (" + vm[1] + ") 400 minutes old opens the gate", read());
    dep(400); clear();
  }
}

// ---- why: the signature probe it replaces reads pass while warn-level failures keep happening ----
{
  const dbw = mkDb();
  dbw.exec("CREATE VIEW v_loop_breaker_signatures AS SELECT job AS producer, text AS sig, ts AS last_ts FROM cloud_ops_events WHERE kind = 'done' AND status = 'error'");
  const w = (minAgo, kind, text, status) => dbw.prepare("INSERT INTO cloud_ops_events VALUES (?,?,?,?,?,?,?)").run("w" + (++seq), iso(minAgo), kind, text, "{}", "qnfo-research-exec", status);
  for (let i = 0; i < 20; i++) w(5 + i, "done", '{"ok":true,"stage":"verify->publish","claims":3}', "ok");
  for (let i = 0; i < 6; i++) w(10 + i * 15, "verify-extract-fail", UNP_OLD, "warn");
  const o = dbw.prepare(OLD).get();
  ok(o.expected === o.observed, "the old signature probe reads pass although six unparseable extractions happened in the window (retries are warn events)", o);
  dbw.exec(body);
  const n0 = dbw.prepare(probeOf(dbw)).get();
  ok(n0.expected !== n0.observed && n0.observed === "not-live-300m", "the new probe reads not-live-300m on the same events while no deploy of the release is in the ledger", n0);
  dbw.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, deployed_at, status) VALUES ('worker','qnfo-research-exec','deploy',?,'canonical-deploy',?,'success')").run(TAG_VERSION, FMT.z3(new Date(Date.now() - 400 * 60000)));
  const n = dbw.prepare(probeOf(dbw)).get();
  ok(n.expected !== n.observed && n.observed === "defect", "and defect on the same events once the release is 400 minutes in the ledger", n);
}

// ---- replay: the real failure times of the old code, with the gate open ----
// cloud_ops_events for qnfo-research-exec, read 2026-10-19T23:20Z, while 0.28.1 was live and the defect fully present: every
// verify-extract-fail with reason=unparseable (u) and every error-level done with extractFailed (x) from 2026-10-17T21:46Z, as
// minute:kinds. The longest gaps between two of them are 219 minutes (15:02Z to 18:41Z on 10-19), 178, 171 and 157. The ledger row
// that opens the gate is placed long before the replay, which is exactly the case the gate cannot see (old code live, release row
// present): only the window can tell. Verify done events are synthetic, one every 3 minutes (20 an hour; the real 10-19 rate was 21).
{
  const REAL_FAILS = `
2026-10-17T21:46:x 2026-10-17T23:01:xxx 2026-10-18T01:16:x 2026-10-18T01:46:x 2026-10-18T02:46:x 2026-10-18T04:31:x
2026-10-18T05:46:x 2026-10-18T07:16:x 2026-10-18T10:14:ux 2026-10-18T10:30:ux 2026-10-18T10:42:ux 2026-10-18T11:41:ux
2026-10-18T12:00:ux 2026-10-18T14:25:ux 2026-10-18T15:52:ux 2026-10-18T17:21:ux 2026-10-18T17:41:ux 2026-10-18T17:51:ux
2026-10-18T18:11:ux 2026-10-18T18:31:ux 2026-10-18T18:32:ux 2026-10-18T19:12:x 2026-10-18T19:13:uxx 2026-10-18T19:31:ux
2026-10-18T19:52:ux 2026-10-18T20:12:ux 2026-10-18T20:32:ux 2026-10-18T20:41:ux 2026-10-18T20:45:ux 2026-10-18T20:51:ux
2026-10-18T21:01:ux 2026-10-18T21:02:ux 2026-10-18T21:21:ux 2026-10-18T21:31:ux 2026-10-18T22:11:ux 2026-10-18T22:22:uuxx
2026-10-18T22:41:ux 2026-10-18T23:11:ux 2026-10-18T23:21:ux 2026-10-18T23:51:ux 2026-10-19T00:21:ux 2026-10-19T00:51:ux
2026-10-19T01:01:uuuxxx 2026-10-19T01:02:ux 2026-10-19T01:51:ux 2026-10-19T02:21:uuxx 2026-10-19T02:41:uuxx 2026-10-19T04:21:ux
2026-10-19T04:25:ux 2026-10-19T04:31:ux 2026-10-19T04:42:uxxxxxxx 2026-10-19T05:01:uuuxxx 2026-10-19T05:21:ux 2026-10-19T08:12:uu
2026-10-19T08:14:u 2026-10-19T10:51:u 2026-10-19T11:02:u 2026-10-19T11:05:u 2026-10-19T11:14:u 2026-10-19T11:23:u
2026-10-19T11:31:u 2026-10-19T11:42:u 2026-10-19T11:51:u 2026-10-19T11:54:u 2026-10-19T13:42:u 2026-10-19T14:03:u
2026-10-19T14:06:u 2026-10-19T14:46:u 2026-10-19T15:02:u 2026-10-19T18:41:u 2026-10-19T18:42:u 2026-10-19T19:01:u
2026-10-19T19:25:u 2026-10-19T19:42:u 2026-10-19T20:04:uux 2026-10-19T20:15:uu 2026-10-19T21:02:uu 2026-10-19T21:52:u
2026-10-19T22:12:u 2026-10-19T22:41:u 2026-10-19T22:43:u 2026-10-19T23:01:uu 2026-10-19T23:11:u 2026-10-19T23:14:ux
`.trim().split(/\s+/).map((s) => { const i = s.lastIndexOf(":"); return [s.slice(0, i), s.slice(i + 1)]; });
  let nU = 0, nX = 0;
  for (const [, k] of REAL_FAILS) for (const c of k) c === "u" ? nU++ : nX++;
  ok(REAL_FAILS.length === 84 && nU === 87 && nX === 71, "the replay fixture holds the 87 unparseable and 71 exhausted extractions read from cloud_ops_events", { entries: REAL_FAILS.length, nU, nX });
  const failTimes = REAL_FAILS.map(([m]) => Date.parse(m + ":00Z") / 60000);
  const gaps = failTimes.slice(1).map((t, i) => t - failTimes[i]);
  ok(Math.max(...gaps) === 219, "the longest gap between two failures is 219 minutes, shorter than the 300-minute window", Math.max(...gaps));

  const dbr = mkDb();
  dbr.exec(body);
  const p300 = probeOf(dbr);
  // the previous revision's window and floor, for comparison: the same probe with 120 minutes and a floor of 6
  const p120 = p300.replaceAll("-300 minutes", "-120 minutes").replace("< 15 THEN", "< 6 THEN");
  ok(p120 !== p300 && p120.includes("-120 minutes") && !p120.includes("-300 minutes") && p120.includes("< 6 THEN"), "the 120-minute comparison probe is the same text with the window and floor changed");
  dbr.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, deployed_at, status) VALUES ('worker','qnfo-research-exec','deploy',?,'canonical-deploy','2026-10-18T00:00:00.000Z','success')").run(TAG_VERSION);
  const insE = dbr.prepare("INSERT INTO cloud_ops_events VALUES (?,?,?,?,?,?,?)");
  const stamp = (ms) => new Date(ms).toISOString();
  const evts = [];
  for (let t = Date.parse("2026-10-18T06:00:00Z"); t <= Date.parse("2026-10-19T23:00:00Z"); t += 3 * 60000) evts.push([t, "done", '{"ok":true,"stage":"verify->publish","claims":3}', "ok"]);
  for (const [m, k] of REAL_FAILS) for (const c of k) evts.push([Date.parse(m + ":00Z"), c === "u" ? "verify-extract-fail" : "done", c === "u" ? UNP_OLD : '{"ok":false,"stage":"verify","extractFailed":3,"cause":"unparseable"}', c === "u" ? "warn" : "error"]);
  evts.sort((a, b) => a[0] - b[0]);
  const at = (p, t) => dbr.prepare(p.replaceAll("'now'", "'" + stamp(t).replace("T", " ").replace(/\.\d+Z$/, "") + "'")).get().observed;
  const tally300 = {}, tally120 = {}, byTime = {};
  let i = 0, points = 0;
  for (let t = Date.parse("2026-10-18T12:00:00Z"); t <= Date.parse("2026-10-19T23:00:00Z"); t += 5 * 60000) {
    while (i < evts.length && evts[i][0] <= t) { const e = evts[i++]; insE.run("r" + i, stamp(e[0]), e[1], e[2], "{}", "qnfo-research-exec", e[3]); }
    const a = at(p300, t), b = at(p120, t);
    tally300[a] = (tally300[a] || 0) + 1; tally120[b] = (tally120[b] || 0) + 1; points++;
    byTime[stamp(t).slice(0, 16)] = [a, b];
  }
  console.log("replay " + points + " five-minute points, 2026-10-18T12:00Z to 2026-10-19T23:00Z, gate open, old code live: 300-minute probe " + JSON.stringify(tally300) + ", 120-minute probe " + JSON.stringify(tally120));
  ok(points === 421, "the replay covers 421 five-minute points", points);
  ok((tally300.ok || 0) === 0 && (tally300["no-activity"] || 0) === 0 && tally300.defect === 421, "the 300-minute probe reads defect at every point and ok at none (the activity floor is met everywhere, so each defect is a failure in the window)", tally300);
  for (const m of ["2026-10-19T15:10", "2026-10-19T16:00", "2026-10-19T17:15", "2026-10-19T17:45", "2026-10-19T18:15", "2026-10-19T18:40"]) {
    ok(byTime[m] && byTime[m][0] === "defect", "inside the 15:02Z to 18:41Z gap (" + m + "Z) the 300-minute probe reads defect", byTime[m]);
  }
  ok((tally120.ok || 0) === 43 && byTime["2026-10-19T18:40"][1] === "ok" && byTime["2026-10-19T17:15"][1] === "ok", "the 120-minute probe it replaces reads ok at 43 of the same 421 points, among them 17:15Z and 18:40Z in the gap: the replay discriminates", { tally120, t1: byTime["2026-10-19T18:40"], t2: byTime["2026-10-19T17:15"] });
}

// ---- the failure modes and their fm-<key> detectors (ANTIFRAGILE-1) ----
{
  const fms = db.prepare("SELECT fm_key, probe_class, issue_id, first_seen FROM failure_modes ORDER BY fm_key").all();
  ok(fms.length === 2 && fms.map((f) => f.fm_key).join() === "research-complete-dangling-xref-stall,research-extract-parse" && fms.map((f) => f.issue_id).join() === "2671,2877", "two failure_modes rows, one per issue", fms);
  const dets = db.prepare("SELECT class, verify_probe, verify_transport, status FROM remediation_contracts WHERE class LIKE 'fm-%' ORDER BY class").all();
  ok(dets.length === 2 && dets.every((d) => d.verify_transport === "d1-query" && d.status === "active") && fms.every((f) => dets.some((d) => d.class === f.probe_class)), "each failure mode has an active d1-query fm-<key> detector contract", dets.map((d) => d.class));
  ok(dets.every((d) => { const l = d.verify_probe.toLowerCase(); return l.startsWith("select") && !WRITE_KW.some((k) => l.includes(k)) && !d.verify_probe.replace(/;\s*$/, "").includes(";") && !/hours?'|days?'/.test(d.verify_probe); }), "the detectors are literal read-only SELECTs with their window in minutes");
  const det = (cls) => { const r = db.prepare(dets.find((d) => d.class === cls).verify_probe).get(); return r.expected + "/" + r.observed; };
  clear();
  ok(det("fm-research-extract-parse") === "1/1", "no extraction failure reads healthy", det("fm-research-extract-parse"));
  ev(10, "verify-extract-fail", UNP_OLD, "warn"); ev(20, "verify-extract-fail", UNP_NEW, "warn");
  ok(det("fm-research-extract-parse") === "1/1", "two parse failures in 120 minutes stay under the recurrence line", det("fm-research-extract-parse"));
  ev(30, "verify-extract-fail", UNP_OLD, "warn"); ev(140, "verify-extract-fail", UNP_OLD, "warn");
  ok(det("fm-research-extract-parse") === "1/0", "three parse failures in 120 minutes read recurring (the one at 140 minutes is outside)", det("fm-research-extract-parse"));
  clear(); for (let i = 0; i < 5; i++) ev(5 + i, "verify-extract-fail", "row=a attempt=1 reason=empty-reply raw_chars=0 head=", "warn");
  ok(det("fm-research-extract-parse") === "1/1", "empty replies are not this failure mode", det("fm-research-extract-parse"));
  clear();
  ok(det("fm-research-complete-xref-stall") === "1/1", "no stall reads healthy", det("fm-research-complete-xref-stall"));
  ev(15, "rerun-route", "row=8e3a5154 route=ground prior=complete recover_count=1 msg=complete: 3 rounds added nothing; still missing: Results, Discussion; ends mid-text: «x»; cites missing section 6", "warn");
  ok(det("fm-research-complete-xref-stall") === "1/1", "a stall on a truncated paper (missing sections) is a different failure mode", det("fm-research-complete-xref-stall"));
  ev(150, "rerun-route", "row=25c9e7dc route=ground prior=complete recover_count=1 msg=complete: 3 rounds added nothing; still cites missing section 9", "warn");
  ok(det("fm-research-complete-xref-stall") === "1/1", "a dangling-only stall older than 120 minutes is outside the window", det("fm-research-complete-xref-stall"));
  ev(15, "rerun-route", "row=8e3a5154 route=ground prior=complete recover_count=1 msg=complete: 3 rounds added nothing; still cites missing section 12", "warn");
  ok(det("fm-research-complete-xref-stall") === "1/0", "a dangling-only stall in the window reads recurring", det("fm-research-complete-xref-stall"));
}
// replay: the OR IGNORE inserts and the guarded UPDATE change nothing
{
  const n = () => [db.prepare("SELECT count(*) n FROM failure_modes").get().n, db.prepare("SELECT count(*) n FROM remediation_contracts").get().n, db.prepare("SELECT count(*) n FROM decision_log").get().n].join();
  const was = n();
  db.exec(body);
  ok(n() === was && was === "2,4,1", "a second run adds no failure mode, contract or decision_log row", { was, now: n() });
}

// ---- rollback ----
const rb = /^-- Rollback: (.+)$/m.exec(sql)[1].split("; decision_log is append-only")[0];
db.exec(rb);
ok(probeOf(db) === OLD, "the Rollback header restores the signature probe text exactly", probeOf(db));
ok(db.prepare("SELECT count(*) n FROM failure_modes").get().n === 0 && db.prepare("SELECT count(*) n FROM remediation_contracts WHERE class LIKE 'fm-%'").get().n === 0, "and removes the failure modes and detectors it added");
ok(db.prepare("SELECT count(*) n FROM decision_log").get().n === 1, "and leaves the decision_log row (append-only)");

console.log("extract-fail-probe: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
