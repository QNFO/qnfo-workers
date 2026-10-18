// REMEDIATION-REOPEN-1 + REMEDIATION-HOLD-1 + REMEDIATION-PENDING-PREFIX-1 offline suite (qnfo-fleet-control 0.4.119/0.4.121/0.4.123/0.4.128, agent_issues 1297): remediationContractsTick against
// node:sqlite with the live tables and the live auto-close trigger. Proves: a contract on a wontfix issue is marked
// superseded without a probe run; a probe that fails max_attempts times after its issue was closed reopens the issue once
// (description note with the prior close_evidence, reopened_count + 1, close_evidence cleared) and fewer failures do not;
// a pass on an open issue closes it (trigger) and closes the contract; verification rows are only ever added.
// Run: node --no-warnings qnfo-fleet-control/remediation-reopen.test.mjs   -> prints "N failure(s)"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var __RT_WRITE_KW"), b = src.indexOf('__name(rtReopenOnRelapse, "rtReopenOnRelapse");');
if (a < 0 || b < a) throw new Error("REMEDIATION-REOPEN-1 block not found in worker.js");
let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log("FAIL " + m); } };

const toNamed = (sql, args) => {
  const obj = {};
  let hit = false;
  const s = sql.replace(/\?(\d+)/g, (m, d) => { hit = true; obj["p" + d] = args[Number(d) - 1]; return ":p" + d; });
  return hit ? [s, obj] : [sql, args];
};
function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0);
    CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
    CREATE TABLE remediation_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT, path TEXT DEFAULT 'B:evidence-table');
    CREATE VIEW v_remediation_evidence_all AS SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'verifications' AS src FROM remediation_verifications UNION ALL SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'evidence' AS src FROM remediation_evidence;
    CREATE TABLE path_liveness (path TEXT PRIMARY KEY, checked_at TEXT, checked_by TEXT, detail TEXT);
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, close_channel TEXT, updated_at INTEGER);
    CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE probe_src (k TEXT PRIMARY KEY, v TEXT);
    CREATE TRIGGER remediation_verification_autoclose_ins AFTER INSERT ON remediation_verifications WHEN NEW.pass = 1 BEGIN INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = ''; UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open'; END;`);
  const stmt = (sql, args) => {
    const [q, named] = toNamed(sql, args);
    return {
      bind: (...x) => stmt(sql, x),
      run: async () => { const r = db.prepare(q).run(...(Array.isArray(named) ? named : [named])); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
      first: async () => db.prepare(q).get(...(Array.isArray(named) ? named : [named])) || null,
      all: async () => ({ results: db.prepare(q).all(...(Array.isArray(named) ? named : [named])) })
    };
  };
  return { db, env: { AUDIT: { prepare: (sql) => stmt(sql, []) } } };
}
const ctx = vm.createContext({ VERSION: "test", __name: (f) => f, Date, Math, Number, String, JSON, Object, console });
const W = vm.runInContext(src.slice(a, b) + "\n;({ remediationContractsTick });", ctx, { filename: "fleet-control#REMEDIATION-REOPEN-1" });

const probe = (k) => "SELECT 'ok' AS expected, (SELECT v FROM probe_src WHERE k = '" + k + "') AS observed";
const closedLongAgo = Date.now() - 3 * 86400e3;
const { db, env } = makeDb();
db.exec(`INSERT INTO agent_issues VALUES (1, 'closed, relapses', 'desc1', 'closed', NULL, ${closedLongAgo}), (2, 'closed, fails twice', 'desc2', 'closed', NULL, ${closedLongAgo}), (3, 'wontfix', 'desc3', 'wontfix', NULL, ${closedLongAgo}), (4, 'open, fixed', 'desc4', 'open', NULL, ${closedLongAgo});
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (1, 'x', 'closed', 'o', 'n', 'deployed, looks fine'), (2, 'x', 'closed', 'o', 'n', 'ev2'), (4, 'x', 'triaged', 'o', 'n', NULL);
  INSERT INTO probe_src VALUES ('p1', 'broken'), ('p2', 'broken'), ('p3', 'broken'), ('p4', 'ok');`);
const add = (cls, issue, k, max) => db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h) VALUES (?, ?, ?, 'd1-query', ?, 1)").run(cls, issue, probe(k), max);
add("c1", 1, "p1", 3); add("c2", 2, "p2", 5); add("c3", 3, "p3", 3); add("c4", 4, "p4", 3);
const tick = async () => { db.exec("UPDATE remediation_contracts SET next_due_at = NULL"); return W.remediationContractsTick(env); };

let out = await tick();
check(out.superseded === 1 && db.prepare("SELECT status, last_verdict FROM remediation_contracts WHERE class='c3'").get().status === "superseded", "a contract on a wontfix issue is superseded");
check(db.prepare("SELECT COUNT(*) n FROM remediation_verifications WHERE class='c3'").get().n === 0, "the wontfix contract's probe is not run");
check(db.prepare("SELECT status FROM agent_issues WHERE id=4").get().status === "closed" && db.prepare("SELECT status FROM remediation_contracts WHERE class='c4'").get().status === "holding", "a pass on an open issue closes the issue (trigger) and the contract holds (REMEDIATION-HOLD-1)");
check(out.reopened.length === 0 && db.prepare("SELECT status FROM agent_issues WHERE id=1").get().status === "closed", "one failure after closure does not reopen");
await tick();
out = await tick();
check(out.reopened.length === 1 && out.reopened[0] === 1, "the third failure after closure reopens issue 1 (max_attempts 3)");
const i1 = db.prepare("SELECT status, description FROM agent_issues WHERE id=1").get();
const t1 = db.prepare("SELECT reopened_count, triage_state, close_evidence FROM issue_triage WHERE issue_id=1").get();
check(i1.status === "open" && /REOPENED .*REMEDIATION-REOPEN-1.*contract c1 failed 3x.*expected ok, observed broken.*Prior close_evidence: deployed, looks fine/.test(i1.description), "the reopened issue says why and keeps the old evidence");
check(t1.reopened_count === 1 && t1.triage_state === "triaged" && t1.close_evidence === null, "triage: reopened_count + 1, triaged, close_evidence cleared");
check(db.prepare("SELECT status FROM agent_issues WHERE id=2").get().status === "closed", "max_attempts 5: three failures do not reopen issue 2");
out = await tick();
check(out.reopened.length === 0 && db.prepare("SELECT reopened_count FROM issue_triage WHERE issue_id=1").get().reopened_count === 1, "an open issue is not reopened again");
db.exec("UPDATE probe_src SET v = 'ok' WHERE k = 'p1'");
await tick();
check(db.prepare("SELECT status FROM agent_issues WHERE id=1").get().status === "closed" && /^remediation_verifications#/.test(db.prepare("SELECT close_evidence FROM issue_triage WHERE issue_id=1").get().close_evidence), "the next pass closes the reopened issue with probe evidence");
const rows = db.prepare("SELECT COUNT(*) n FROM remediation_verifications WHERE class IN ('c1','c2')").get().n;
check(rows === 10, "every tick wrote one verification row per due c1/c2 contract (got " + rows + ")");

// 0.4.121: 'pending' is the deferral convention (EVID-1718 reads NULL->'pending' until its date), not a relapse. Pending
// rows from this tick or from another verifier (remediation-consumer) neither reopen the issue nor count toward max_attempts.
db.exec(`INSERT INTO agent_issues VALUES (5, 'closed, deferred probe', 'desc5', 'closed', NULL, ${closedLongAgo});
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (5, 'x', 'closed', 'o', 'n', 'ev5');
  INSERT INTO probe_src VALUES ('p5', 'pending');`);
add("c5", 5, "p5", 3);
for (let i = 0; i < 4; i++) await tick();
db.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verifier) VALUES (5, 'c5', 'd1-query', 'ok', 'pending', 0, 'remediation-consumer@x')").run();
check(db.prepare("SELECT status FROM agent_issues WHERE id=5").get().status === "closed", "four 'pending' ticks do not reopen a closed issue");
db.exec("UPDATE probe_src SET v = 'over' WHERE k = 'p5'");
out = await tick();
check(!out.reopened.includes(5) && db.prepare("SELECT status FROM agent_issues WHERE id=5").get().status === "closed", "the first real failure after five pending rows does not reopen (pending rows are not counted)");
await tick(); out = await tick();
check(out.reopened.includes(5) && db.prepare("SELECT status FROM agent_issues WHERE id=5").get().status === "open", "the third real failure reopens issue 5");
check(db.prepare("SELECT COUNT(*) n FROM remediation_verifications WHERE class='c5'").get().n === 4, "a deferral writes no verification row: the four 'pending' ticks left no row, so only the consumer's own pending row and the three real verdicts are recorded (got " + db.prepare("SELECT COUNT(*) n FROM remediation_verifications WHERE class='c5'").get().n + ")");

// 0.4.123 REMEDIATION-HOLD-1: a pass holds the contract for 7 days at a daily cadence; a relapse inside the hold reopens the
// issue and returns the contract to active; a 7-day pass streak closes it; a 'pending' read while holding keeps it holding.
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString().replace("T", " ").slice(0, 19);
db.exec(`INSERT INTO agent_issues VALUES (6, 'open, passes then relapses', 'desc6', 'open', NULL, ${closedLongAgo}), (7, 'open, holds 8 days', 'desc7', 'open', NULL, ${closedLongAgo}), (8, 'open, pending in hold', 'desc8', 'open', NULL, ${closedLongAgo});
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (6, 'x', 'triaged', 'o', 'n', NULL), (7, 'x', 'triaged', 'o', 'n', NULL), (8, 'x', 'triaged', 'o', 'n', NULL);
  INSERT INTO probe_src VALUES ('p6', 'ok'), ('p7', 'ok'), ('p8', 'ok');`);
add("c6", 6, "p6", 3); add("c7", 7, "p7", 3); add("c8", 8, "p8", 3);
out = await tick();
const st = (k) => db.prepare("SELECT status, next_due_at FROM remediation_contracts WHERE class=?").get(k);
const due6 = (Date.parse(st("c6").next_due_at.replace(" ", "T") + "Z") - Date.now()) / 3600e3;
check(st("c6").status === "holding" && db.prepare("SELECT status FROM agent_issues WHERE id=6").get().status === "closed" && due6 > 23 && due6 < 25, "a first pass closes the issue and holds the contract, next read in 24h (got " + st("c6").status + ", " + due6.toFixed(1) + "h)");
check(out.holding >= 3, "the tick reports held contracts (holding " + out.holding + ")");
// time passes: the pass and the closure are 2h old, then the probe breaks three times
db.prepare("UPDATE remediation_verifications SET verified_at = ? WHERE class = 'c6'").run(ago(2));
db.prepare("UPDATE agent_issues SET updated_at = ? WHERE id = 6").run(Date.now() - 2 * 3600e3);
db.exec("UPDATE probe_src SET v = 'broken' WHERE k = 'p6'");
await tick(); await tick();
check(db.prepare("SELECT status FROM agent_issues WHERE id=6").get().status === "closed" && st("c6").status === "holding", "two failures inside the hold do not reopen yet");
const due6f = (Date.parse(st("c6").next_due_at.replace(" ", "T") + "Z") - Date.now()) / 3600e3;
check(due6f < 2, "a failing read inside the hold uses the contract's own cadence to confirm (got " + due6f.toFixed(1) + "h)");
out = await tick();
check(out.reopened.includes(6) && db.prepare("SELECT status FROM agent_issues WHERE id=6").get().status === "open" && st("c6").status === "active", "the third failure inside the hold reopens the issue and the contract is active again");
// a pass streak of 8 days closes the contract
db.prepare("UPDATE remediation_verifications SET verified_at = ? WHERE class = 'c7'").run(ago(8 * 24));
out = await tick();
check(st("c7").status === "closed" && out.held >= 1, "a pass after an 8-day pass streak closes the contract (got " + st("c7").status + ")");
// pending inside the hold keeps it holding at the daily cadence and reopens nothing
db.exec("UPDATE probe_src SET v = 'pending' WHERE k = 'p8'");
for (let i = 0; i < 4; i++) await tick();
const due8 = (Date.parse(st("c8").next_due_at.replace(" ", "T") + "Z") - Date.now()) / 3600e3;
check(st("c8").status === "holding" && db.prepare("SELECT status FROM agent_issues WHERE id=8").get().status === "closed" && due8 > 23, "'pending' inside the hold keeps holding at 24h and reopens nothing");
const vr = db.prepare("SELECT COUNT(*) n FROM remediation_verifications WHERE class IN ('c6','c7','c8')").get().n, at = db.prepare("SELECT SUM(attempts) n FROM remediation_contracts WHERE class IN ('c6','c7','c8')").get().n;
check(at - vr === 4 && vr > 12, "a held read that yields a verdict writes its row; the four 'pending' reads of c8 advance attempts with no row (rows " + vr + ", attempts " + at + ")");
// 0.4.128 REMEDIATION-PENDING-PREFIX-1: 'pending: <reason>' is a deferral like a bare 'pending'. A closed issue whose probe reads
// it four times is not reopened, the reads do not count toward max_attempts, a held contract stays holding at 24h, and a
// pass streak survives them.
db.exec(`INSERT INTO agent_issues VALUES (9, 'closed, pending-with-reason', 'desc9', 'closed', NULL, ${closedLongAgo}), (10, 'open, pending-with-reason in hold', 'desc10', 'open', NULL, ${closedLongAgo});
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (9, 'x', 'closed', 'o', 'n', 'ev9'), (10, 'x', 'triaged', 'o', 'n', NULL);
  INSERT INTO probe_src VALUES ('p9', 'pending: latest run did not measure the page'), ('p10', 'ok');`);
add("c9", 9, "p9", 3); add("c10", 10, "p10", 3);
for (let i = 0; i < 4; i++) await tick();
check(db.prepare("SELECT status FROM agent_issues WHERE id=9").get().status === "closed", "four 'pending: <reason>' reads do not reopen a closed issue");
db.exec("UPDATE probe_src SET v = 'broken' WHERE k = 'p9'");
out = await tick();
check(!out.reopened.includes(9) && db.prepare("SELECT status FROM agent_issues WHERE id=9").get().status === "closed", "the first real failure after four 'pending: <reason>' rows does not reopen (they are not counted)");
await tick(); out = await tick();
check(out.reopened.includes(9), "the third real failure reopens issue 9");
check(st("c10").status === "holding" && db.prepare("SELECT status FROM agent_issues WHERE id=10").get().status === "closed", "c10 passes: issue closed, contract holding");
db.prepare("UPDATE remediation_verifications SET verified_at = ? WHERE class = 'c10'").run(ago(3 * 24));
db.exec("UPDATE probe_src SET v = 'PENDING: window not open yet' WHERE k = 'p10'");
for (let i = 0; i < 4; i++) await tick();
const due10 = (Date.parse(st("c10").next_due_at.replace(" ", "T") + "Z") - Date.now()) / 3600e3;
check(st("c10").status === "holding" && db.prepare("SELECT status FROM agent_issues WHERE id=10").get().status === "closed" && due10 > 23, "'PENDING: <reason>' inside the hold keeps holding at 24h and reopens nothing (case-insensitive)");
db.prepare("UPDATE remediation_verifications SET verified_at = ? WHERE class = 'c10' AND pass = 1").run(ago(8 * 24));
db.exec("UPDATE probe_src SET v = 'ok' WHERE k = 'p10'");
out = await tick();
check(st("c10").status === "closed", "a pass streak broken only by 'pending: <reason>' reads still closes the contract after 7 days (got " + st("c10").status + ")");
// 0.33.12 CARRIED-BY-TWIN-1: a contract on a CLOSED issue whose title has an OPEN twin carrying its own live contract can
// never reopen - both REMEDIATION-REOPEN-2 (D1 trigger) and rtReopenOnRelapse refuse while a twin is open (agent_issues
// 2902) - so it probed a dead issue for ever (issue-2194 wrote 196 rows that way). It is superseded instead, and the twin's
// contract keeps verifying the predicate: one predicate, one contract.
db.exec(`INSERT INTO agent_issues VALUES (11, 'same predicate, closed', 'desc11', 'closed', NULL, ${closedLongAgo}), (12, 'same predicate, closed', 'desc12', 'open', NULL, ${closedLongAgo});
  INSERT INTO probe_src VALUES ('p11', 'broken'), ('p12', 'broken');`);
add("c11", 11, "p11", 3); add("c12", 12, "p12", 3);
out = await tick();
const c11 = db.prepare("SELECT status, last_verdict FROM remediation_contracts WHERE class='c11'").get();
check(c11.status === "superseded" && c11.last_verdict === "superseded:carried-by-twin", "a closed issue's contract is superseded when an open twin carries its own live contract (got " + JSON.stringify(c11) + ")");
check(db.prepare("SELECT COUNT(*) n FROM remediation_verifications WHERE class='c11'").get().n === 0, "the carried contract's probe is not run");
check(db.prepare("SELECT status FROM remediation_contracts WHERE class='c12'").get().status === "active", "the twin's own contract keeps running");
check(db.prepare("SELECT status FROM agent_issues WHERE id=11").get().status === "closed", "the closed issue is still not reopened");
check(typeof out.carried_by_twin === "number" && out.carried_by_twin >= 1, "the tick reports the carried contracts (got " + out.carried_by_twin + ")");
await tick();
check(db.prepare("SELECT COUNT(*) n FROM remediation_verifications WHERE class='c11'").get().n === 0, "the superseded contract is never probed again");

console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
