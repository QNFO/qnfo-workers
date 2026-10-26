// REM-A5-FM-MEMBER-ROWS-1 offline suite: replays migrations/2026-10-26-rem-a5-fm-member-rows.sql on node:sqlite and RUNS the two detector probes (their live text, read from
// remediation_contracts 2026-10-26 19:06Z) before and after, against a fixture with the live layout.
// Proves: the header opts in; the only change is the kind filter in the two probes; a member row that reads NOT_DEPLOYED no longer fails either detector; a kind worker row that reads
// NOT_DEPLOYED, a null kind and a member whose host script is gone (the host is a worker row) still do; nothing else in either probe changes; the contracts keep their status; a replay changes
// nothing; the Rollback line restores both probes.
// Output MUST contain "0 failed" on success.   node migrations/rem-a5-fm-member-rows.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const rd = (rel) => readFileSync(new URL(rel, root), "utf8");
const sql = rd("migrations/2026-10-26-rem-a5-fm-member-rows.sql");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai or anthropic.com link");
ok(Array.from(body.matchAll(/LIKE\s+'((?:[^']|'')*)'/gi)).every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes");

const P_ABSENT = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM service_registry s JOIN worker_live_audit a ON a.worker = s.service WHERE s.state = 'live' AND a.note = 'NOT_DEPLOYED') AS TEXT) AS observed";
const P_REPORT = "SELECT '1' AS expected, CASE WHEN (SELECT COUNT(*) FROM worker_live_audit WHERE probed_at > datetime('now', '-6 hours')) > 0 AND (SELECT COUNT(*) FROM worker_live_audit a JOIN service_registry s ON s.service = a.worker WHERE s.state = 'live' AND a.note = 'NOT_DEPLOYED') = 0 THEN '1' ELSE '0' END AS observed";

function world(rows) {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT, state TEXT NOT NULL DEFAULT 'live', base_url TEXT);
CREATE TABLE worker_live_audit (worker TEXT PRIMARY KEY, http INTEGER, note TEXT, probed_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT NOT NULL, verify_transport TEXT, status TEXT DEFAULT 'active', last_verdict TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;`);
  const rc = w.prepare("INSERT INTO remediation_contracts (class, verify_probe, verify_transport, status, last_verdict) VALUES (?, ?, 'd1-query', ?, ?)");
  rc.run("fm-registry-live-absent", P_ABSENT, "active", "fail");
  rc.run("fm-standing-report-issue", P_REPORT, "active", "fail");
  rc.run("fm-other", "SELECT '0' AS expected, '0' AS observed", "active", "pass");
  const sr = w.prepare("INSERT INTO service_registry (service, kind, state, base_url) VALUES (?, ?, ?, ?)");
  const au = w.prepare("INSERT INTO worker_live_audit (worker, http, note, probed_at) VALUES (?, ?, ?, datetime('now', '-10 minutes'))");
  for (const [svc, kind, state, note] of rows) { sr.run(svc, kind, state, "https://" + svc + ".example"); au.run(svc, note === "NOT_DEPLOYED" ? 404 : 200, note); }
  return w;
}
const run = (w, cls) => { const r = w.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = ?").get(cls); const o = w.prepare(r.p).get(); return o.observed; };
const pair = (w) => run(w, "fm-registry-live-absent") + "/" + run(w, "fm-standing-report-issue");

const live = [["qnfo-ops", "worker", "live", "SYNC"], ["qnfo-lifecycle", "worker", "live", "SYNC"], ["qnfo-backlog-exec", "member", "live", "NOT_DEPLOYED"], ["cloudflare-mcp", "mcp-server", "registered-oauth-pending", null]];
{
  const w = world(live);
  ok(pair(w) === "1/0", "before: the member row fails both detectors (fm-registry-live-absent reads 1, fm-standing-report-issue reads 0), as read at 19:06Z", pair(w));
  w.exec(sql);
  ok(pair(w) === "0/1", "after: the member row no longer fails either (0 and 1, each equal to its expected value)", pair(w));
  ok(["fm-registry-live-absent", "fm-standing-report-issue"].every((c) => w.prepare("SELECT status s FROM remediation_contracts WHERE class = ?").get(c).s === "active") && w.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-other'").get().p === "SELECT '0' AS expected, '0' AS observed", "both contracts stay active and no other contract changes");
  const p = w.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-registry-live-absent'").get().p;
  ok(p === P_ABSENT.replace("s.state = 'live' AND a.note", "s.state = 'live' AND COALESCE(s.kind, 'worker') = 'worker' AND a.note"), "fm-registry-live-absent changes by the kind filter only", p);
  const q = w.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-standing-report-issue'").get().p;
  ok(q === P_REPORT.replace("s.state = 'live' AND a.note", "s.state = 'live' AND COALESCE(s.kind, 'worker') = 'worker' AND a.note"), "fm-standing-report-issue changes by the kind filter only", q);
  ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A5-FM-MEMBER-ROWS-1:%' AND actor = 'rem-a5'").get().n === 1, "one decision row");
  // the cases the detectors exist for still fire after the change
  w.prepare("UPDATE worker_live_audit SET note = 'NOT_DEPLOYED', http = 404 WHERE worker = 'qnfo-ops'").run();
  ok(pair(w) === "1/0", "negative control: a kind worker row that is registered live and reads NOT_DEPLOYED still fails both detectors", pair(w));
  w.prepare("UPDATE worker_live_audit SET note = 'SYNC', http = 200 WHERE worker = 'qnfo-ops'").run();
  w.prepare("UPDATE service_registry SET kind = NULL WHERE service = 'qnfo-ops'").run();
  w.prepare("UPDATE worker_live_audit SET note = 'NOT_DEPLOYED', http = 404 WHERE worker = 'qnfo-ops'").run();
  ok(pair(w) === "1/0", "negative control: a row with a null kind counts as a worker and still fails both detectors", pair(w));
  w.prepare("UPDATE service_registry SET kind = 'worker' WHERE service = 'qnfo-ops'").run();
  w.prepare("UPDATE worker_live_audit SET note = 'SYNC', http = 200 WHERE worker = 'qnfo-ops'").run();
  w.prepare("UPDATE worker_live_audit SET note = 'NOT_DEPLOYED', http = 404 WHERE worker = 'qnfo-lifecycle'").run();
  ok(pair(w) === "1/0", "negative control: the host of the member losing its script is caught through the host's own worker row", pair(w));
  w.prepare("UPDATE worker_live_audit SET note = 'SYNC', http = 200 WHERE worker = 'qnfo-lifecycle'").run();
  w.prepare("UPDATE service_registry SET state = 'retired' WHERE service = 'qnfo-backlog-exec'").run();
  ok(pair(w) === "0/1", "a retired registry row is not counted either way (unchanged behaviour)", pair(w));
}
{ // replay
  const w = world(live);
  w.exec(sql);
  const snap = () => JSON.stringify([w.prepare("SELECT class, verify_probe, status FROM remediation_contracts ORDER BY class").all(), w.prepare("SELECT action FROM decision_log").all()]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a second apply changes nothing");
}
{ // rollback
  const w = world(live);
  const fresh = JSON.stringify(w.prepare("SELECT class, verify_probe, status FROM remediation_contracts ORDER BY class").all());
  w.exec(sql);
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(JSON.stringify(w.prepare("SELECT class, verify_probe, status FROM remediation_contracts ORDER BY class").all()) === fresh, "Rollback restores both probes byte for byte");
  ok(pair(w) === "1/0", "and the old reading returns");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
