// METRIC-TWIN-SUPERSEDE-1 offline suite: replays the live triggers a close touches (agent_issues / issue_triage / remediation_contracts, text read
// from qnfo-audit sqlite_master on 2026-10-19) and the v_breaches_without_ticket view of migrations/2026-10-19-breach-ticket-reopen-3.sql on
// node:sqlite, then runs migrations/2026-10-19-metric-twin-supersede.sql. Proves:
//  * every monitoring METRIC-TRIGGER ticket that has an open ticket of the same trigger id is superseded by it (evidence naming the successor,
//    triage closed, contract superseded, status closed, one issue_lifecycle row 'dispositioned' with evidence), backed up first, nothing deleted,
//    nothing wontfix; the open ticket keeps its status, claim, contract and triage row;
//  * what is not a twin is left alone: trigger 37 against 371 (the id is compared whole), a monitoring ticket with no open ticket of its trigger,
//    a monitoring issue that is not a METRIC-TRIGGER ticket, an issue with no triage row (it cannot be closed without evidence);
//  * applying twice changes nothing and keeps the first backup; the Rollback line restores status, triage and contract of every twin;
//  * no double handling: this file and migrations/2026-10-19-issue-triage-state-normalise.sql give the same end state in either order, a monitoring
//    twin with a stale closed triage row is closed by this file with fresh evidence in both orders, and the normalise file does not count it;
//  * v_breaches_without_ticket reads no row for a trigger whose parked twin was superseded while an open ticket exists, and still reports a
//    breach whose every ticket (the superseded twin among them) has been out of 'open' for over two hours;
//  * the detector fm-metric-ticket-twin-split reads the number of triggers with more than one open or monitoring ticket: n before, 0 after;
//  * no trigger and no unique index is added by the file (AGENT-ISSUES-TRIGGER-DEPTH-1).
// Run: node migrations/metric-twin-supersede.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const FILE = process.env.METRIC_TWIN_MIGRATION || "2026-10-19-metric-twin-supersede.sql";
const sql = readFileSync(here(FILE), "utf8");
const triageSql = readFileSync(here("2026-10-19-issue-triage-state-normalise.sql"), "utf8");
const reopen3 = readFileSync(here("2026-10-19-breach-ticket-reopen-3.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const all = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];

// the live view, cut from its migration
const viewAt = reopen3.indexOf("CREATE VIEW v_breaches_without_ticket AS");
const VIEW = reopen3.slice(viewAt, reopen3.indexOf(";\n", viewAt) + 1);

const LIVE_TRIGGERS = [
  `CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence')
    WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails')
    WHERE NEW.status IN ('closed','resolved')
      AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id
                    AND c.status IN ('active','holding')
                    AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END`,
  `CREATE TRIGGER issue_lifecycle_au AFTER UPDATE OF status ON agent_issues
WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence)
  VALUES (NEW.id, CASE WHEN NEW.status IN ('closed', 'resolved', 'wontfix') THEN 'dispositioned' ELSE 'reopened' END, OLD.status, NEW.status,
    CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') THEN 1 ELSE 0 END);
END`,
  `CREATE TRIGGER agent_issues_superseded_contracts_upd AFTER UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed', 'resolved') AND COALESCE(OLD.status, '') NOT IN ('closed', 'resolved')
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id
              AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'))
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END`,
  `CREATE TRIGGER agent_issues_reopen_open_twin_guard
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status = 'open'
  AND COALESCE(OLD.status, '') <> 'open'
  AND EXISTS (SELECT 1 FROM agent_issues o
               WHERE o.id <> NEW.id
                 AND o.status = 'open'
                 AND lower(trim(o.title)) = lower(trim(NEW.title)))
BEGIN
  SELECT RAISE(IGNORE);
END`,
  `CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END`,
  `CREATE TRIGGER triage_superseded_contracts_upd AFTER UPDATE OF triage_state, close_evidence ON issue_triage
WHEN NEW.triage_state = 'closed' AND (lower(substr(COALESCE(NEW.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(NEW.close_evidence, ''), 1, 4)) = 'moot')
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.issue_id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END`,
  `CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END`,
  `CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END`,
];

function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, close_channel TEXT);
CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues(lower(trim(title))) WHERE status = 'open';
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT, last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER, next_due_at TEXT, max_items INTEGER, requires_container INTEGER, attempts INTEGER DEFAULT 0);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), issue_id INTEGER, event TEXT, from_status TEXT, to_status TEXT, has_evidence INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER, disposition TEXT NOT NULL, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE v_metric_trigger_state (id INTEGER PRIMARY KEY, metric_key TEXT, val REAL, threshold REAL, hit INTEGER, queue_target TEXT);
`);
  for (const t of LIVE_TRIGGERS) db.exec(t);
  db.exec(VIEW);
  return db;
}
const ms = (agoH) => Date.now() - agoH * 3600 * 1000;
let seq = 0;
function addIssue(db, o) {
  const id = o.id || 9000 + ++seq;
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?, ?, 'd', 'qnfo-fleet-control', 'reliability', 'medium', ?, ?, ?, ?)")
    .run(id, o.title, o.status || "open", o.linked || null, ms(o.ageH || 30), ms(o.ageH || 30));
  if (o.triage !== false) db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, triaged_at, close_evidence, reopened_count) VALUES (?, 'AUTOTRIAGE-2', ?, 'qnfo-fleet-control', '2026-10-15 18:01:01', '2026-10-15 18:01:01', ?, ?)")
    .run(id, o.triageState || "triaged", o.evidence || null, o.reopened || 0);
  if (o.contract) db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-fleet-control', 1, ?, ?)")
    .run("issue-" + id, id, o.contract, o.contract === "monitoring" ? "monitoring:metric-condition (the probe reads a live metric)" : null);
  return id;
}
const T = (n, k) => "METRIC-TRIGGER-" + n + "-" + k + ": Autonomy gap " + n;
// the live shape: pairs (monitoring twin + open ticket), the twin sometimes the newer id; plus rows that must be left alone
function fixture(db) {
  addIssue(db, { id: 2244, title: T(371, "REMEDY-EFFICACY-30D"), linked: "session_01QpQv19uh1padRwZ3u1r766", contract: "active" });
  addIssue(db, { id: 2665, title: T(371, "REMEDY-EFFICACY-30D"), status: "monitoring", contract: "monitoring" });            // twin with the HIGHER id
  addIssue(db, { id: 2047, title: T(1238, "IDEA-TOPIC"), contract: "active" });
  addIssue(db, { id: 2577, title: T(1238, "IDEA-TOPIC"), status: "monitoring", contract: "monitoring", triageState: "closed", evidence: "TRIGGER-RECOVERY-1 2026-10-16T09:41:18Z: the metric no longer breaches", reopened: 2 }); // stale closed triage
  addIssue(db, { id: 99909, title: T(357, "WATCHMAKER-INDEX"), contract: "active" });
  addIssue(db, { id: 1796, title: T(357, "WATCHMAKER-INDEX"), status: "monitoring", contract: "active" });                        // a twin whose contract is still 'active'
  addIssue(db, { id: 3003, title: T(6050, "CADENCE"), contract: "active" });
  addIssue(db, { id: 2591, title: T(6050, "CADENCE"), status: "monitoring", contract: "monitoring" });
  // not twins
  addIssue(db, { id: 6001, title: T(37, "SHORT"), status: "monitoring", contract: "monitoring" });                                 // 37 against 371: another trigger
  addIssue(db, { id: 6002, title: T(371, "OTHER-KEY") + " (a different title, same trigger 371)", contract: "active" });          // a second open ticket of 371 under another title: stays
  addIssue(db, { id: 6003, title: T(9001, "ALONE"), status: "monitoring", contract: "monitoring" });                              // no open ticket of its trigger
  addIssue(db, { id: 6004, title: "plain monitoring issue", status: "monitoring", contract: "monitoring" });                      // not a METRIC-TRIGGER ticket
  addIssue(db, { id: 6005, title: "plain monitoring issue" });                                                                     // ... with an open same-title row
  addIssue(db, { id: 6006, title: T(7777, "NOTRIAGE"), status: "monitoring", triage: false });                                    // a twin with no triage row (cannot be closed without evidence)
  addIssue(db, { id: 6007, title: T(7777, "NOTRIAGE"), contract: "active" });
  addIssue(db, { id: 6008, title: "closed one", status: "closed", evidence: "fixed", triageState: "closed" });
}
const TWINS = [2665, 2577, 1796, 2591], SUCC = { 2665: 2244, 2577: 2047, 1796: 99909, 2591: 3003 };
const snap = (db) => ({
  agent: all(db, "SELECT id, status, close_channel, linked_session FROM agent_issues ORDER BY id"),
  triage: all(db, "SELECT issue_id, triage_state, close_evidence, reopened_count FROM issue_triage ORDER BY issue_id"),
  contracts: all(db, "SELECT class, status, last_verdict FROM remediation_contracts ORDER BY class"),
});
const detector = (db) => { const p = one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-metric-ticket-twin-split'"); return p ? one(db, p.verify_probe) : null; };

// ================= base =================
const base = build(); fixture(base);
const before = snap(base);
const triggerCount0 = one(base, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n, indexCount0 = one(base, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index'").n;
ok(one(base, "SELECT COUNT(*) AS n FROM agent_issues WHERE status = 'monitoring' AND title LIKE 'METRIC-TRIGGER-%'").n === 7, "base: seven monitoring METRIC-TRIGGER tickets (four twins, three that are not)");

// ================= with the file =================
const db = build(); fixture(db); db.exec(sql);
const after = snap(db);
for (const id of TWINS) {
  const a = after.agent.find((r) => r.id === id), t = after.triage.find((r) => r.issue_id === id), c = after.contracts.find((r) => r.class === "issue-" + id);
  ok(a.status === "closed" && a.close_channel === "migration:METRIC-TWIN-SUPERSEDE-1 superseded", "twin " + id + " is closed by the migration", a);
  ok(t.triage_state === "closed" && t.close_evidence.startsWith("superseded by " + SUCC[id] + " (METRIC-TRIGGER-") && t.close_evidence.includes(", open):") && t.close_evidence.includes("METRIC-TWIN-SUPERSEDE-1"), "twin " + id + ": close_evidence starts 'superseded by <open ticket id> (<title>, open)'", t.close_evidence.slice(0, 80));
  ok(c.status === "superseded" && /^superseded:closure-superseded/.test(c.last_verdict), "twin " + id + ": its contract is superseded", c);
  const life = all(db, "SELECT event, from_status, to_status, has_evidence FROM issue_lifecycle WHERE issue_id = ?", id);
  ok(life.length === 1 && life[0].event === "dispositioned" && life[0].from_status === "monitoring" && life[0].to_status === "closed" && life[0].has_evidence === 1, "twin " + id + ": exactly one lifecycle row 'dispositioned' with evidence (no silent drop)", life);
  const b = one(db, "SELECT * FROM bak_20261019_metric_twin_rows WHERE issue_id = ?", id);
  ok(b && b.successor_id === SUCC[id] && b.agent_status === "monitoring" && b.contract_class === "issue-" + id, "twin " + id + ": the old state is in the backup", b);
}
ok(one(db, "SELECT triage_close_evidence AS e, triage_reopened_count AS r, triage_state AS s FROM bak_20261019_metric_twin_rows WHERE issue_id = 2577").e.startsWith("TRIGGER-RECOVERY-1") && one(db, "SELECT triage_reopened_count AS r FROM bak_20261019_metric_twin_rows WHERE issue_id = 2577").r === 2, "2577: its stale closed triage row and old closure text are in the backup");
ok(one(db, "SELECT COUNT(*) AS n FROM bak_20261019_metric_twin_rows").n === 5 && one(db, "SELECT triage_state FROM bak_20261019_metric_twin_rows WHERE issue_id = 6006").triage_state === null, "the backup holds the four twins and 6006 (a twin with no triage row, saved but not closed)");
ok(after.triage.find((r) => r.issue_id === 2577).reopened_count === 2, "2577: reopened_count is not touched");
// the open tickets are untouched
for (const id of [2244, 2047, 99909, 3003, 6002, 6005, 6007]) {
  ok(JSON.stringify(after.agent.find((r) => r.id === id)) === JSON.stringify(before.agent.find((r) => r.id === id)) && JSON.stringify(after.triage.find((r) => r.issue_id === id)) === JSON.stringify(before.triage.find((r) => r.issue_id === id)), "open ticket " + id + " keeps status, claim and triage row");
}
ok(after.agent.find((r) => r.id === 2244).linked_session === "session_01QpQv19uh1padRwZ3u1r766", "2244 keeps its claim");
ok(JSON.stringify(after.contracts.filter((r) => ["issue-2244", "issue-2047", "issue-99909", "issue-3003", "issue-6002", "issue-6007"].includes(r.class))) === JSON.stringify(before.contracts.filter((r) => ["issue-2244", "issue-2047", "issue-99909", "issue-3003", "issue-6002", "issue-6007"].includes(r.class))), "the open tickets keep their contracts");
// what is not a twin
ok(after.agent.find((r) => r.id === 6001).status === "monitoring" && after.contracts.find((r) => r.class === "issue-6001").status === "monitoring", "37 is not 371: 6001 is left alone");
ok(after.agent.find((r) => r.id === 6003).status === "monitoring", "a monitoring ticket with no open ticket of its trigger is left alone");
ok(after.agent.find((r) => r.id === 6004).status === "monitoring" && after.agent.find((r) => r.id === 6005).status === "open", "a monitoring issue that is not a METRIC-TRIGGER ticket is left alone");
ok(after.agent.find((r) => r.id === 6006).status === "monitoring" && !all(db, "SELECT 1 FROM issue_triage WHERE issue_id = 6006").length, "a twin with no triage row stays monitoring (nothing is closed without evidence) and the file does not fail");
ok(JSON.stringify(after.triage.find((r) => r.issue_id === 6008)) === JSON.stringify(before.triage.find((r) => r.issue_id === 6008)) && after.agent.find((r) => r.id === 6008).status === "closed", "a closed issue is untouched");
ok(all(db, "SELECT 1 FROM agent_issues WHERE status = 'wontfix'").length === 0 && one(db, "SELECT COUNT(*) AS n FROM agent_issues").n === before.agent.length, "nothing is closed as wontfix and nothing is deleted");
ok(all(db, "SELECT 1 FROM issue_lifecycle WHERE event = 'dispositioned' AND has_evidence = 0").length === 0, "no disposition without evidence");
ok(one(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").n === triggerCount0 && one(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index'").n === indexCount0, "no trigger and no index is added (AGENT-ISSUES-TRIGGER-DEPTH-1)");
ok(!/CREATE\s+(UNIQUE\s+)?(INDEX|TRIGGER)/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the file text creates no trigger and no index");

// ---- detector and decision
{
  ok(one(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'metric-ticket-twin-split' AND probe_class = 'fm-metric-ticket-twin-split'").n === 1, "failure mode registered with its probe class");
  const c = one(db, "SELECT verify_transport, status, module, issue_id, expected_cadence_h, verify_probe FROM remediation_contracts WHERE class = 'fm-metric-ticket-twin-split'");
  ok(c && c.verify_transport === "d1-query" && c.status === "active" && c.module === "failure-mode" && c.issue_id === null && !/;/.test(c.verify_probe), "the detector contract is d1-query, active, with no semicolon in the probe", c);
  const n0 = Number(one(base, c.verify_probe).observed), n1 = Number(one(db, c.verify_probe).observed);
  ok(one(db, c.verify_probe).expected === "0" && n0 === 5 && n1 === 2, "the detector reads 5 split triggers before (371, 1238, 357, 6050, 7777) and 2 after: 371 keeps two OPEN tickets under two titles and 7777 has a twin with no triage row, both of which this file must not hide", [n0, n1]);
  const d = all(db, "SELECT capability_gain, predicted_outcome, reach_gain, surfaces_tested FROM decision_log WHERE instr(action, 'METRIC-TWIN-SUPERSEDE-1:') = 1");
  ok(d.length === 1 && /^[a-z_0-9]+ (<=|>=|<|>|=) [0-9.]+ within [0-9]+ hours$/.test(d[0].predicted_outcome) && d[0].capability_gain && d[0].surfaces_tested, "one decision_log row with a machine-readable prediction", d);
}

// ---- idempotency
{
  const s1 = JSON.stringify(snap(db)), lc1 = one(db, "SELECT COUNT(*) AS n FROM issue_lifecycle").n, bk1 = JSON.stringify(all(db, "SELECT * FROM bak_20261019_metric_twin_rows ORDER BY issue_id")), dl1 = one(db, "SELECT COUNT(*) AS n FROM decision_log").n, fm1 = one(db, "SELECT COUNT(*) AS n FROM remediation_contracts").n;
  db.exec(sql);
  ok(JSON.stringify(snap(db)) === s1, "applying twice leaves issues, triage rows and contracts exactly as after the first run");
  ok(one(db, "SELECT COUNT(*) AS n FROM issue_lifecycle").n === lc1, "the second run writes no lifecycle row");
  ok(JSON.stringify(all(db, "SELECT * FROM bak_20261019_metric_twin_rows ORDER BY issue_id")) === bk1, "the first backup is kept");
  ok(one(db, "SELECT COUNT(*) AS n FROM decision_log").n === dl1 && one(db, "SELECT COUNT(*) AS n FROM remediation_contracts").n === fm1, "no second decision or detector row");
}

// ---- the Rollback line, executed as written
{
  ok(rollback.length > 500 && !rollback.includes("\n"), "the Rollback header is one line of SQL");
  const x = build(); fixture(x); const b4 = snap(x); x.exec(sql); x.exec(rollback);
  const a = snap(x);
  ok(JSON.stringify(a.agent) === JSON.stringify(b4.agent), "Rollback: every issue status and close_channel is restored", a.agent.filter((r, i) => JSON.stringify(r) !== JSON.stringify(b4.agent[i])));
  ok(JSON.stringify(a.triage) === JSON.stringify(b4.triage), "Rollback: every triage row is restored", a.triage.filter((r, i) => JSON.stringify(r) !== JSON.stringify(b4.triage[i])));
  ok(JSON.stringify(a.contracts) === JSON.stringify(b4.contracts), "Rollback: every contract row is restored and the detector contract removed", a.contracts.filter((r, i) => JSON.stringify(r) !== JSON.stringify(b4.contracts[i])));
  ok(one(x, "SELECT COUNT(*) AS n FROM failure_modes").n === 0, "Rollback: the failure mode is removed");
}

// ---- no double handling with the triage normalise file: both orders, same end state
{
  const run = (order) => {
    const d = build(); fixture(d);
    for (const f of order) d.exec(f);
    return d;
  };
  const A = run([triageSql, sql]), B = run([sql, triageSql]);
  const norm = (d) => JSON.stringify({ a: snap(d).agent, t: snap(d).triage, c: snap(d).contracts.filter((r) => !r.class.startsWith("fm-")), life: all(d, "SELECT issue_id, event, from_status, to_status, has_evidence FROM issue_lifecycle ORDER BY issue_id, id") });
  ok(norm(A) === norm(B), "triage-normalise then twin file and twin file then triage-normalise end in the same state");
  const t2577 = (d) => one(d, "SELECT triage_state, close_evidence, reopened_count FROM issue_triage WHERE issue_id = 2577");
  ok(t2577(A).triage_state === "closed" && t2577(A).close_evidence.startsWith("superseded by 2047 (") && t2577(A).reopened_count === 2, "2577 (stale closed triage, a twin): closed with fresh evidence and reopened_count untouched, whichever file runs first", t2577(A));
  ok(JSON.stringify(t2577(A)) === JSON.stringify(t2577(B)), "and identical in both orders");
  ok(all(A, "SELECT 1 FROM bak_20261019_triage_state_rows WHERE issue_id = 2577").length === 0 && all(B, "SELECT 1 FROM bak_20261019_triage_state_rows WHERE issue_id = 2577").length === 0, "the triage file never backs up or rewrites a row the twin file owns");
  ok(one(A, "SELECT COUNT(*) AS n FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status IN ('open', 'monitoring') AND t.triage_state IN ('closed', 'closed-refuted', 'closed-by-classification', 'closed-verified-fixed', 'resolved', 'resolved-refuted', 'wontfix')").n === 0, "after both files no open or monitoring issue has a closed triage row (the triage detector reads 0)");
  const life = all(A, "SELECT issue_id, COUNT(*) AS n FROM issue_lifecycle WHERE event = 'dispositioned' GROUP BY issue_id");
  ok(life.every((r) => r.n === 1), "no twin is dispositioned twice", life);
}

// ---- the breach-ticket-reopen-3 view (v_breaches_without_ticket)
{
  const view = (d) => all(d, "SELECT trigger_id FROM v_breaches_without_ticket ORDER BY trigger_id").map((r) => r.trigger_id);
  const setHit = (d, id, hit = 1) => d.prepare("INSERT OR REPLACE INTO v_metric_trigger_state (id, metric_key, val, threshold, hit, queue_target) VALUES (?, 'm', 1, 0, ?, 'agent_issues')").run(id, hit);
  const old = (d, ids, h) => { for (const id of ids) { d.prepare("UPDATE agent_issues SET updated_at = ? WHERE id = ?").run(ms(h), id); d.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id = ? AND to_status <> 'open'").run(new Date(ms(h)).toISOString().replace(/\.\d+Z$/, "Z"), id); } };
  // (a) breaching trigger 371: superseded twin 2665 (closed) + open ticket 2244 -> no row
  const v = build(); fixture(v); v.exec(sql); setHit(v, 371); setHit(v, 357); setHit(v, 1238);
  old(v, [2665, 2577, 1796], 5); // the superseded twins left 'open' long ago: only the open ticket keeps the breach covered
  ok(!view(v).includes(371) && !view(v).includes(357) && !view(v).includes(1238), "a breaching trigger whose twin was superseded and whose newer ticket is open reads 0 in v_breaches_without_ticket", view(v));
  // (b) the open ticket closes on recovery 5 h ago and the breach is back: every ticket (the superseded twin included) has been out of 'open' for over two hours
  v.prepare("UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'TRIGGER-RECOVERY-1 recovered' WHERE issue_id = 2047").run();
  v.prepare("UPDATE remediation_contracts SET status = 'superseded' WHERE class = 'issue-2047'").run();
  v.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 2047").run(); old(v, [2047], 5);
  ok(view(v).includes(1238), "with every ticket out of 'open' for over two hours the view still reports the breach (the reopener then acts)", view(v));
  // (c) the same, but the open ticket closed 30 minutes ago: inside the window, not reported
  old(v, [2047], 0.5);
  ok(!view(v).includes(1238), "a ticket that left 'open' 30 minutes ago keeps the breach out of the view", view(v));
  // (d) the file itself does not create a ticketless breach: breach triggers with a monitoring twin and an open ticket before and after
  const w = build(); fixture(w); for (const id of [371, 1238, 357, 6050]) setHit(w, id);
  const v0 = view(w); w.exec(sql);
  ok(JSON.stringify(view(w)) === JSON.stringify(v0), "the view reads the same before and after the file", [v0, view(w)]);
}

console.log("metric-twin-supersede: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
