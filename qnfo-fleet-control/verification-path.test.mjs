// VERIFICATION-PATH-1 offline suite (qnfo-fleet-control 0.38.0, agent_issues 2953 and 2954): the real remediationContractsTick,
// rtReopenOnRelapse, rtStampDeferral and rtEscalateStaleDeferrals bodies, sliced out of worker.js and run on node:sqlite.
//   (a) the relapse window starts at the issue_lifecycle close event, not at agent_issues.updated_at: failures between the close and
//       a later touch of the row still count; the newest close wins over an earlier one; a lifecycle row that landed on wontfix is
//       not a close; an issue with no lifecycle row, or a database without the table, keeps the updated_at anchor;
//   (b) remediation_contracts.deferred_since is stamped when a contract first reads deferred, kept while it keeps deferring, cleared
//       by a real verdict and left alone by a probe-error; a deferral older than RT_DEFERRAL_ESCALATE_MIN (10080 minutes) files one
//       deduped VERIFICATION-DEFERRED-7D-1 issue per class that quotes the pending reason, names escalate_to, carries a closing
//       probe, closes itself when the contract reads a verdict or is parked and never escalates its own contract; a database
//       without the column leaves the tick whole.
// Run: node --no-warnings qnfo-fleet-control/verification-path.test.mjs   -> prints "N failure(s)"
// FLEET_CONTROL_WORKER_JS=<path> points the suite at another worker.js (used to prove the suite fails on the pre-fix worker).
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import vm from "node:vm";

const workerPath = process.env.FLEET_CONTROL_WORKER_JS ? resolve(process.env.FLEET_CONTROL_WORKER_JS) : new URL("./worker.js", import.meta.url);
const src = readFileSync(workerPath, "utf8");
const a = src.indexOf("var __RT_WRITE_KW"), b = src.indexOf('__name(rtReopenOnRelapse, "rtReopenOnRelapse");');
if (a < 0 || b < a) throw new Error("remediation block not found in worker.js");
let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log("FAIL " + m); } };

const logged = [];
const toNamed = (sql, args) => {
  const obj = {};
  let hit = false;
  const s = sql.replace(/\?(\d+)/g, (m, d) => { hit = true; obj["p" + d] = args[Number(d) - 1]; return ":p" + d; });
  return hit ? [s, obj] : [sql, args];
};
function makeDb(opt = {}) {
  const o = Object.assign({ column: true, lifecycle: true, events: true, birth: true, refile: false }, opt);
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0${o.column ? ", deferred_since TEXT" : ""});
    CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
    CREATE TABLE remediation_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT, path TEXT DEFAULT 'B:evidence-table');
    CREATE VIEW v_remediation_evidence_all AS SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'verifications' AS src FROM remediation_verifications UNION ALL SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'evidence' AS src FROM remediation_evidence;
    CREATE TABLE path_liveness (path TEXT PRIMARY KEY, checked_at TEXT, checked_by TEXT, detail TEXT);
    CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, close_channel TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues(lower(trim(title))) WHERE status = 'open';
    CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE probe_src (k TEXT PRIMARY KEY, v TEXT);
    CREATE TRIGGER remediation_verification_autoclose_ins AFTER INSERT ON remediation_verifications WHEN NEW.pass = 1 BEGIN INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = ''; UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open'; END;`);
  if (o.lifecycle) db.exec("CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))");
  if (o.events) db.exec("CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT)");
  if (o.birth) db.exec("CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;");
  if (o.refile) db.exec("CREATE TRIGGER issue_refile_reopen BEFORE INSERT ON agent_issues WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed') AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000)) BEGIN UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = (SELECT t.id FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed') AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000) ORDER BY t.id DESC LIMIT 1); SELECT RAISE(IGNORE); END;");
  const stmt = (sql, args) => {
    const [q, named] = toNamed(sql, args);
    const p = Array.isArray(named) ? named : [named];
    return {
      bind: (...x) => stmt(sql, x),
      run: async () => { const r = db.prepare(q).run(...p); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
      first: async () => db.prepare(q).get(...p) || null,
      all: async () => ({ results: db.prepare(q).all(...p) })
    };
  };
  return { db, env: { AUDIT: { prepare: (sql) => stmt(sql, []) } } };
}
const ctx = vm.createContext({ VERSION: "test", __name: (f) => f, Date, Math, Number, String, JSON, Object, console: { error: (m) => logged.push(String(m)), log: console.log } });
const W = vm.runInContext(src.slice(a, b) + "\n;({ remediationContractsTick, rtDeferralReason: typeof rtDeferralReason === 'function' ? rtDeferralReason : null, rtDeferralProbe: typeof rtDeferralProbe === 'function' ? rtDeferralProbe : null, rtDeferralStampKind: typeof rtDeferralStampKind === 'function' ? rtDeferralStampKind : null });", ctx, { filename: "fleet-control#VERIFICATION-PATH-1" });

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
const ago = (h) => fmt(new Date(Date.now() - h * 3600e3));
const agoIso = (h) => ago(h).replace(" ", "T") + "Z";
const agoMs = (h) => Date.now() - h * 3600e3;
const probe = (k) => "SELECT 'ok' AS expected, (SELECT v FROM probe_src WHERE k = '" + k + "') AS observed";

function world(opt) {
  const w = makeDb(opt);
  w.issue = (id, title, status, updatedH) => w.db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'd', 's', 'c', 'medium', ?, ?, ?)").run(id, title, status, agoMs(500), agoMs(updatedH));
  w.life = (id, event, to, h) => w.db.prepare("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, ts) VALUES (?, ?, 'open', ?, ?)").run(id, event, to, agoIso(h));
  w.contract = (cls, issueId, k, max = 3, extra = {}) => {
    w.db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h) VALUES (?, ?, ?, 'd1-query', ?, ?, 1)").run(cls, issueId, probe(k), max, extra.escalate_to || "qnfo-fleet-control");
  };
  w.fail = (cls, h, observed = "broken") => w.db.prepare("INSERT INTO remediation_verifications (class, transport, expected, observed, pass, verified_at, verifier) VALUES (?, 'd1-query', 'ok', ?, 0, ?, 'x')").run(cls, observed, ago(h));
  w.pass = (cls, h) => w.db.prepare("INSERT INTO remediation_verifications (class, transport, expected, observed, pass, verified_at, verifier) VALUES (?, 'd1-query', 'ok', 'ok', 1, ?, 'x')").run(cls, ago(h));
  w.src = (k, v) => w.db.prepare("INSERT OR REPLACE INTO probe_src VALUES (?, ?)").run(k, v);
  w.tick = async () => { ctx.rtDeferralRetryAt = 0; w.db.exec("UPDATE remediation_contracts SET next_due_at = NULL"); return W.remediationContractsTick(w.env); };
  w.tickOnly = async () => { ctx.rtDeferralRetryAt = 0; return W.remediationContractsTick(w.env); }; // does not make every contract due
  w.status = (id) => w.db.prepare("SELECT status FROM agent_issues WHERE id = ?").get(id).status;
  w.ds = (cls) => w.db.prepare("SELECT deferred_since AS d FROM remediation_contracts WHERE class = ?").get(cls).d;
  return w;
}

// ---------------------------------------------------------------- (a) the relapse window starts at the close event
{
  const w = world();
  // 1: closed 48 h ago, the row was touched 1 h ago, two failures sat between the close and the touch. Third failure now.
  w.issue(1, "closed then touched", "closed", 1); w.life(1, "opened", "open", 100); w.life(1, "dispositioned", "closed", 48); w.contract("a1", 1, "p1"); w.src("p1", "broken");
  w.fail("a1", 40); w.fail("a1", 30);
  w.db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (1, 'x', 'closed', 'o', 'n', 'deployed, looks fine')").run();
  // 2: same, but a pass at -30 h resets the count: only the failure now counts.
  w.issue(2, "closed, pass after close", "closed", 1); w.life(2, "dispositioned", "closed", 48); w.contract("a2", 2, "p2"); w.src("p2", "broken");
  w.fail("a2", 40); w.pass("a2", 30);
  // 3: no lifecycle row at all (a closure from before 2026-10-08): the old updated_at anchor, so the two old failures do not count.
  w.issue(3, "closed, no lifecycle row", "closed", 1); w.contract("a3", 3, "p3"); w.src("p3", "broken");
  w.fail("a3", 40); w.fail("a3", 30);
  // 4: closed, reopened, closed again: the newest close is the anchor, the two failures before it do not count.
  w.issue(4, "closed twice", "closed", 20); w.life(4, "dispositioned", "closed", 72); w.life(4, "reopened", "open", 60); w.life(4, "dispositioned", "closed", 20); w.contract("a4", 4, "p4"); w.src("p4", "broken");
  w.fail("a4", 50); w.fail("a4", 40);
  // 5: a later lifecycle row that landed on wontfix is not a close; the close at -48 h still anchors the window.
  w.issue(5, "closed, later wontfix row", "closed", 1); w.life(5, "dispositioned", "closed", 48); w.life(5, "dispositioned", "wontfix", 1); w.contract("a5", 5, "p5"); w.src("p5", "broken");
  w.fail("a5", 40); w.fail("a5", 30);
  // 6: the lifecycle close is NEWER than updated_at (a writer that did not bump updated_at): the close event anchors, so the failure
  //    between updated_at and the close does not count.
  w.issue(6, "closed, updated_at stale", "closed", 60); w.life(6, "dispositioned", "closed", 20); w.contract("a6", 6, "p6"); w.src("p6", "broken");
  w.fail("a6", 40); w.fail("a6", 30);
  const out = await w.tick();
  check(out.reopened.includes(1) && w.status(1) === "open", "a closure touched after its close still reopens on the failures since the close event (got " + JSON.stringify(out.reopened) + ")");
  check(!out.reopened.includes(2) && w.status(2) === "closed", "a pass after the close still resets the count");
  check(!out.reopened.includes(3) && w.status(3) === "closed", "an issue with no lifecycle row keeps the updated_at anchor");
  check(!out.reopened.includes(4) && w.status(4) === "closed", "the newest close event anchors the window, not the first");
  check(out.reopened.includes(5) && w.status(5) === "open", "a lifecycle row that landed on wontfix is not a close event");
  check(!out.reopened.includes(6) && w.status(6) === "closed", "a close event newer than updated_at anchors the window");
  const t1 = w.db.prepare("SELECT reopened_count, triage_state FROM issue_triage WHERE issue_id = 1").get();
  check(t1 && t1.reopened_count === 1 && t1.triage_state === "triaged" && /REOPENED .*contract a1 failed 3x.*Prior close_evidence: deployed, looks fine/.test(w.db.prepare("SELECT description FROM agent_issues WHERE id = 1").get().description), "the reopened issue says it failed 3 times since the closure and keeps the old evidence");
}
{
  // no issue_lifecycle table: the tick and the relapse check run on the updated_at anchor and do not throw
  const w = world({ lifecycle: false });
  w.issue(1, "closed, no lifecycle table", "closed", 2); w.contract("f1", 1, "p1", 3); w.src("p1", "broken");
  await w.tick(); await w.tick();
  const out = await w.tick();
  check(out.ok && out.reopened.includes(1) && w.status(1) === "open", "without the issue_lifecycle table the third failure still reopens on the updated_at anchor (got " + JSON.stringify(out.reopened) + ")");
}

// ---------------------------------------------------------------- (b) the deferral's age
{
  const w = world();
  w.issue(10, "open, waits", "open", 1); w.contract("d1", 10, "pd1"); w.src("pd1", "pending: waiting for the window to open");
  let out = await w.tick();
  const first = w.ds("d1");
  check(out.deferred === 1 && typeof first === "string" && Math.abs(Date.parse(first.replace(" ", "T") + "Z") - Date.now()) < 120e3, "the first deferred read stamps deferred_since with now (got " + first + ")");
  check(out.deferral_started === 1, "the tick reports the started deferral (got " + out.deferral_started + ")");
  const twoDays = ago(48);
  w.db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = 'd1'").run(twoDays);
  out = await w.tick();
  check(w.ds("d1") === twoDays && out.deferral_started === 0, "a deferral that keeps deferring keeps its original start (got " + w.ds("d1") + ")");
  // a probe that errors says nothing about the deferral
  w.db.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT nope FROM no_such_table' WHERE class = 'd1'").run();
  out = await w.tick();
  check(w.db.prepare("SELECT last_verdict AS v FROM remediation_contracts WHERE class = 'd1'").get().v === "probe-error" && w.ds("d1") === twoDays, "a probe-error neither stamps nor clears the deferral (got " + w.ds("d1") + ")");
  // a real failing verdict ends it
  w.db.prepare("UPDATE remediation_contracts SET verify_probe = ? WHERE class = 'd1'").run(probe("pd1"));
  w.src("pd1", "broken");
  out = await w.tick();
  check(w.ds("d1") === null && out.deferral_cleared === 1, "a real verdict (fail) clears deferred_since (got " + w.ds("d1") + ", cleared " + out.deferral_cleared + ")");
  // and a later deferral starts a new run
  w.src("pd1", "pending");
  await w.tick();
  check(w.ds("d1") !== null && w.ds("d1") !== twoDays, "a new deferral after a verdict starts a new age");
  // a pass clears too
  w.db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = 'd1'").run(ago(5));
  w.src("pd1", "ok");
  await w.tick();
  check(w.ds("d1") === null, "a pass clears deferred_since");
}
{
  // the escalation sweep
  const w = world();
  w.contract("EVID-GATE-X", null, "e1", 3, { escalate_to: "qnfo-research-exec" }); w.src("e1", "pending: awaiting the publish-v2 metadata, supplied by research-exec");
  w.contract("YOUNG-1", null, "e2"); w.src("e2", "pending: not yet");
  w.contract("BARE-1", null, "e3"); w.src("e3", "pending");
  w.contract("PARKED-1", null, "e4"); w.src("e4", "pending: parked on purpose");
  w.contract("FAILING-1", null, "e5"); w.src("e5", "broken");
  await w.tick(); // the first tick stamps every deferral with now
  const old = ago(8 * 24), six = ago(6 * 24);
  w.db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class IN ('EVID-GATE-X', 'BARE-1', 'PARKED-1')").run(old);
  w.db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = 'YOUNG-1'").run(six);
  w.db.prepare("UPDATE remediation_contracts SET status = 'monitoring' WHERE class = 'PARKED-1'").run();
  const out = await w.tick();
  const open = w.db.prepare("SELECT id, title, description, priority, source FROM agent_issues WHERE title LIKE 'VERIFICATION-DEFERRED-7D-1: %' ORDER BY title").all();
  check(open.length === 2 && open[0].title === "VERIFICATION-DEFERRED-7D-1: BARE-1" && open[1].title === "VERIFICATION-DEFERRED-7D-1: EVID-GATE-X", "exactly the two active contracts deferred over 7 days file an issue (got " + JSON.stringify(open.map((r) => r.title)) + ")");
  check(JSON.stringify((out.deferral_escalated || []).slice().sort()) === JSON.stringify(["BARE-1", "EVID-GATE-X"]), "the tick reports the escalated classes (got " + JSON.stringify(out.deferral_escalated) + ")");
  const ev = open.find((r) => r.title.endsWith("EVID-GATE-X")), bare = open.find((r) => r.title.endsWith("BARE-1"));
  if (!ev || !bare) check(false, "both escalation issues exist (the rest of this section needs them)");
  else {
  check(ev && /awaiting the publish-v2 metadata, supplied by research-exec/.test(ev.description) && /Doer: qnfo-research-exec/.test(ev.description) && /Charter pillar: autonomy/.test(ev.description) && /since \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC \(8 days/.test(ev.description), "the issue quotes the pending reason as the unblocker, names escalate_to and the pillar and says how long (got " + (ev && ev.description) + ")");
  check(bare && /bare 'pending'/.test(bare.description) && /must first be given a reason/.test(bare.description), "a bare pending says the probe must be given a reason");
  check(!open.some((r) => /#\d/.test(r.description)) && !open.some((r) => /claude\.ai/i.test(r.description)), "no bare issue reference and no claude.ai link in the text");
  check(ev.priority === "medium" && ev.source === "qnfo-fleet-control", "filed by qnfo-fleet-control at medium priority");
  const ic = w.db.prepare("SELECT status, verify_probe, verify_transport, module, escalate_to, last_verdict FROM remediation_contracts WHERE class = ?").get("issue-" + ev.id);
  check(ic && ic.status === "active" && ic.verify_transport === "d1-query" && ic.module === "verification-path" && ic.escalate_to === "qnfo-research-exec" && ic.verify_probe.indexOf("'EVID-GATE-X'") > 0 && ic.verify_probe.indexOf(";") === -1, "the issue's born contract is replaced by the closing probe (got " + JSON.stringify(ic) + ")");
  check(w.db.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'remediation.deferral-escalated'").get().n === 2, "each escalation leaves an event");
  // a second tick files nothing
  const out2 = await w.tick();
  check((out2.deferral_escalated || []).length === 0 && w.db.prepare("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'VERIFICATION-DEFERRED-7D-1: %'").get().n === 2, "a second tick files no duplicate (dedupe on the open title)");
  // the escalation issue's own contract defers (pending) with no ledger row, and never escalates itself, however old
  const own = w.db.prepare("SELECT last_verdict, deferred_since FROM remediation_contracts WHERE class = ?").get("issue-" + ev.id);
  check(own.last_verdict === "deferred" && w.db.prepare("SELECT COUNT(*) n FROM remediation_verifications WHERE class = ?").get("issue-" + ev.id).n === 0, "while the contract still defers the issue's own probe defers: no verification row (got " + JSON.stringify(own) + ")");
  w.db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = ?").run(old, "issue-" + ev.id);
  await w.tick();
  check(w.db.prepare("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'VERIFICATION-DEFERRED-7D-1: issue-%'").get().n === 0, "the escalation issue's own contract is never escalated (no regress)");
  // the contract reads a verdict: the issue's probe passes and the autoclose path closes the issue
  w.src("e1", "ok");
  await w.tick();
  await w.tick();
  check(w.status(ev.id) === "closed" && /remediation_verifications#\d+ pass=1 class=issue-/.test(w.db.prepare("SELECT close_evidence FROM issue_triage WHERE issue_id = ?").get(ev.id).close_evidence), "once the contract reads a verdict the escalation issue closes itself with the passing row as evidence");
  check(w.status(bare.id) === "open", "the other escalation issue stays open while its contract still defers");
  // parking the contract (a recorded decision sets its status away from active) ends the escalation too
  w.db.prepare("UPDATE remediation_contracts SET status = 'monitoring' WHERE class = 'BARE-1'").run();
  await w.tick(); await w.tick();
  check(w.status(bare.id) === "closed", "parking the deferred contract closes its escalation issue");
  }
}
{
  // the consumer shares the contracts: it stamps last_verdict 'fail' on a pending read and writes a pending pass = 0 row for it
  const w = world();
  const far = "datetime('now', '+1 day')";
  const consumerContract = (cls, verdict, deferredH, evidence) => {
    w.db.prepare("INSERT INTO remediation_contracts (class, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, deferred_since, next_due_at) VALUES (?, 'SELECT 1', 'd1-query', 'qnfo-code-orchestrator', 1, 'active', ?, ?, " + far + ")").run(cls, verdict, deferredH == null ? null : ago(deferredH));
    for (const [obs, pass, h] of evidence) w.db.prepare("INSERT INTO remediation_verifications (class, transport, expected, observed, pass, verified_at, verifier) VALUES (?, 'd1-query', 'ok', ?, ?, ?, 'remediation-consumer@x')").run(cls, obs, pass, ago(h));
  };
  consumerContract("CONS-1", "fail", 24 * 12, [["pending: no anchor repair in the window", 0, 3], ["pending: no anchor repair in the window", 0, 2]]); // deferring, stamped fail by the consumer
  consumerContract("CONS-2", "fail", 24 * 12, [["pending: was waiting", 0, 3], ["broken", 0, 1]]);                                                 // newest row is a real failure now
  consumerContract("CONS-3", "pass", 24 * 12, [["pending: was waiting", 0, 5], ["ok", 1, 1]]);                                                     // a real verdict ended it, the stamp is stale
  consumerContract("CONS-4", "fail", null, [["pending: new", 0, 1]]);                                                                              // no start recorded yet
  consumerContract("CONS-5", "fail", 24 * 9, [["pending: the newer reason", 0, 1]]);                                                               // the tick's event is older than the consumer's row
  w.db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('e5', ?, 'remediation.deferred', 'class=CONS-5 transport=d1-query expected=ok observed=pending: the older reason', 'qnfo-fleet-control', 'deferred')").run(agoIso(5));
  const out = await w.tickOnly();
  const titles = w.db.prepare("SELECT title FROM agent_issues WHERE title LIKE 'VERIFICATION-DEFERRED-7D-1: %' ORDER BY title").all().map((r) => r.title);
  check(JSON.stringify(titles) === JSON.stringify(["VERIFICATION-DEFERRED-7D-1: CONS-1", "VERIFICATION-DEFERRED-7D-1: CONS-5"]), "a contract the consumer stamped fail on a pending newest row is escalated; one with a real newest row, a pass or no start is not (got " + JSON.stringify(titles) + ")");
  const i5 = w.db.prepare("SELECT description FROM agent_issues WHERE title = 'VERIFICATION-DEFERRED-7D-1: CONS-5'").get();
  check(i5 && /the newer reason/.test(i5.description) && !/the older reason/.test(i5.description), "the newer of the tick's event and the consumer's pending row names the unblocker (got " + (i5 && i5.description.slice(0, 400)) + ")");
  const iss = w.db.prepare("SELECT id, description FROM agent_issues WHERE title = 'VERIFICATION-DEFERRED-7D-1: CONS-1'").get();
  check(iss && /no anchor repair in the window/.test(iss.description) && /Doer: qnfo-code-orchestrator/.test(iss.description), "the issue quotes the pending reason the consumer recorded and names escalate_to (got " + (iss && iss.description) + ")");
  // the closing probe does not flip while the consumer and the tick alternate their stamp, and clears on a real verdict
  const ic = iss && w.db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get("issue-" + iss.id);
  const read = () => w.db.prepare(ic.verify_probe).get();
  check(ic && read().expected === "cleared" && /^pending: contract CONS-1 still defers/.test(read().observed), "the closing probe reads pending while the contract is stamped fail on a pending newest row (got " + JSON.stringify(ic && read()) + ")");
  w.db.prepare("UPDATE remediation_contracts SET last_verdict = 'deferred' WHERE class = 'CONS-1'").run();
  check(ic && /^pending:/.test(read().observed), "the closing probe reads pending when the tick stamps deferred");
  w.db.prepare("UPDATE remediation_contracts SET last_verdict = 'fail' WHERE class = 'CONS-1'").run();
  w.db.prepare("INSERT INTO remediation_verifications (class, transport, expected, observed, pass, verified_at, verifier) VALUES ('CONS-1', 'd1-query', 'ok', 'broken', 0, ?, 'remediation-consumer@x')").run(ago(0));
  check(ic && read().observed === "cleared", "a real newest row ends the deferral: the probe reads cleared");
}
{
  // the INSERT is ignored by issue_refile_reopen when the same title closed within 24 h: the reopened row gets the probe
  const w = world({ refile: true });
  w.contract("REFILE-1", null, "r1"); w.src("r1", "pending: external window");
  w.issue(30, "VERIFICATION-DEFERRED-7D-1: REFILE-1", "closed", 2);
  w.db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, escalate_to, status) VALUES ('issue-30', 30, 'old', 'd1-query', 'x', 'closed')").run();
  await w.tick();
  w.db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = 'REFILE-1'").run(ago(9 * 24));
  const out = await w.tick();
  check((out.deferral_escalated || []).includes("REFILE-1") && w.status(30) === "open", "a recently closed escalation issue is reopened by the refile trigger and counted (got " + JSON.stringify(out.deferral_escalated) + ")");
  const c30 = w.db.prepare("SELECT status, verify_probe FROM remediation_contracts WHERE class = 'issue-30'").get();
  check(c30.status === "active" && c30.verify_probe.indexOf("'REFILE-1'") > 0, "the reopened issue's contract carries the closing probe");
}
{
  // no issue-birth trigger in the database: the closing contract is inserted
  const w = world({ birth: false });
  w.contract("NOBIRTH-1", null, "n1"); w.src("n1", "pending: x");
  await w.tick();
  w.db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = 'NOBIRTH-1'").run(ago(9 * 24));
  await w.tick();
  const iss = w.db.prepare("SELECT id FROM agent_issues WHERE title = 'VERIFICATION-DEFERRED-7D-1: NOBIRTH-1'").get();
  const c = iss && w.db.prepare("SELECT status, issue_id, verify_probe FROM remediation_contracts WHERE class = ?").get("issue-" + iss.id);
  check(c && c.status === "active" && c.issue_id === iss.id && /still defers/.test(c.verify_probe), "without a birth contract the closing contract is inserted");
}

// ---------------------------------------------------------------- revert switches and bounds (a rule that closes, reopens or files in bulk can be turned off and cannot flood)
{
  // ops_config rt_close_event_anchor = off restores the updated_at anchor: the failures before the touch no longer count
  const w = world();
  w.issue(1, "closed then touched", "closed", 1); w.life(1, "opened", "open", 100); w.life(1, "dispositioned", "closed", 48); w.contract("s1", 1, "p1"); w.src("p1", "broken");
  w.fail("s1", 40); w.fail("s1", 30);
  w.db.prepare("INSERT INTO ops_config (key, value) VALUES ('rt_close_event_anchor', 'off')").run();
  let out = await w.tick();
  check(!out.reopened.includes(1) && w.status(1) === "closed", "rt_close_event_anchor = off keeps the updated_at anchor (got " + JSON.stringify(out.reopened) + ")");
  w.db.prepare("UPDATE ops_config SET value = 'on' WHERE key = 'rt_close_event_anchor'").run();
  out = await w.tick();
  check(out.reopened.includes(1) && w.status(1) === "open", "any value but off means the close-event anchor (got " + JSON.stringify(out.reopened) + ")");
}
{
  // ops_config rt_deferral_escalation = off stops the sweep, not the stamp
  const w = world();
  w.contract("OFF-1", null, "o1"); w.src("o1", "pending: x");
  await w.tick();
  w.db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = 'OFF-1'").run(ago(9 * 24));
  w.db.prepare("INSERT INTO ops_config (key, value) VALUES ('rt_deferral_escalation', 'off')").run();
  const out = await w.tick();
  check(w.db.prepare("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'VERIFICATION-DEFERRED-7D-1: %'").get().n === 0 && out.deferral_sweep_off === 1 && w.ds("OFF-1") !== null, "rt_deferral_escalation = off files nothing and keeps the stamp");
  w.db.prepare("DELETE FROM ops_config").run();
  const out2 = await w.tick();
  check((out2.deferral_escalated || []).includes("OFF-1"), "removing the switch resumes the sweep (got " + JSON.stringify(out2.deferral_escalated) + ")");
}
{
  // The sweep is bounded to 3 issues per tick and can drain the audited 431-contract backlog within one daily window.
  const w = world();
  for (let i = 1; i <= 431; i++) { w.contract("B" + String(i).padStart(3, "0"), null, "b" + i); w.src("b" + i, "pending: waiting " + i); }
  await w.tick();
  for (let i = 1; i <= 431; i++) w.db.prepare("UPDATE remediation_contracts SET deferred_since = ? WHERE class = ?").run(ago(24 * 8 + (431 - i) / 60), "B" + String(i).padStart(3, "0"));
  const count = () => w.db.prepare("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'VERIFICATION-DEFERRED-7D-1: B%'").get().n;
  let out = await w.tick();
  check(count() === 3 && out.deferral_escalated.length === 3 && out.deferral_escalated[0] === "B001", "431 stale deferrals still file at most 3 issues in a tick, oldest first (got " + count() + " " + JSON.stringify(out.deferral_escalated) + ")");
  for (let t = 0; t < 143; t++) await w.tickOnly();
  check(count() === 431, "the entire 431-contract backlog is escalated within the daily window (got " + count() + ")");
  const missing = w.db.prepare("SELECT c.class FROM remediation_contracts c WHERE c.class LIKE 'B%' AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = 'VERIFICATION-DEFERRED-7D-1: ' || c.class)").all();
  check(missing.length === 0, "no overdue contract is left without its deduped escalation issue");
  check(w.db.prepare("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'VERIFICATION-DEFERRED-7D-1: B%' AND description LIKE '%Named unblocker:%' AND description LIKE '%Doer:%'").get().n === 431, "every backlog issue names an unblocker and doer");
}

// ---------------------------------------------------------------- helpers
check(W.rtDeferralReason && W.rtDeferralReason("class=c transport=d1-query expected=ok observed=pending: waiting for ga4") === "waiting for ga4", "rtDeferralReason takes the text after 'pending:'");
check(W.rtDeferralReason && W.rtDeferralReason("class=c transport=d1-query expected=ok observed=pending") === "", "rtDeferralReason is empty for a bare pending");
check(W.rtDeferralReason && W.rtDeferralReason("class=c transport=d1-query expected=ok observed=PENDING:   x y ") === "x y", "rtDeferralReason is case-insensitive and trims");
check(W.rtDeferralReason && W.rtDeferralReason(null) === "" && W.rtDeferralReason("no marker") === "", "rtDeferralReason tolerates null and text without the marker");
check(W.rtDeferralReason && W.rtDeferralReason("pending: from a row", true) === "from a row" && W.rtDeferralReason("pending", true) === "" && W.rtDeferralReason("Pending:x", true) === "x", "rtDeferralReason reads a plain observed value too");
check(W.rtDeferralProbe && W.rtDeferralProbe("issue-2827") && /^SELECT 'cleared' AS expected/.test(W.rtDeferralProbe("issue-2827")) && W.rtDeferralProbe("a b") === null && W.rtDeferralProbe("a';drop") === null, "rtDeferralProbe builds a literal select for a plain class and refuses an odd one");
check(W.rtDeferralStampKind && W.rtDeferralStampKind("deferred") === "stamp" && W.rtDeferralStampKind("probe-error") === null && W.rtDeferralStampKind(null) === null && ["pass", "fail", "vacuous-probe-result", "probe-not-machine-executable"].every((v) => W.rtDeferralStampKind(v) === "clear"), "only a deferred verdict stamps, a probe-error is neutral, every other verdict clears");

// ---------------------------------------------------------------- the migration may land after the deploy
{
  const w = world({ column: false });
  w.issue(40, "open, waits, no column", "open", 1); w.contract("m1", 40, "pm1"); w.src("pm1", "pending: waiting"); w.contract("m2", null, "pm2"); w.src("pm2", "ok");
  logged.length = 0;
  const out = await w.tick();
  const row = w.db.prepare("SELECT last_verdict, attempts FROM remediation_contracts WHERE class = 'm1'").get();
  check(out.ok && row.last_verdict === "deferred" && row.attempts === 1, "without the column the contract stamp is whole (got " + JSON.stringify(row) + ")");
  check(w.db.prepare("SELECT last_verdict AS v FROM remediation_contracts WHERE class = 'm2'").get().v === "pass", "without the column the other contracts still get their verdict");
  check(!out.deferral_started && !(out.deferral_escalated || []).length, "without the column nothing is stamped or escalated");
  check(ctx.rtDeferralRetryAt > Date.now() && logged.length === 0, "a missing column pauses the stamp and the sweep without a log line per contract (retry at " + ctx.rtDeferralRetryAt + ", logged " + JSON.stringify(logged) + ")");
  ctx.rtDeferralRetryAt = 0;
}

console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
