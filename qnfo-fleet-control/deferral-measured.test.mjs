// DEFERRAL-MEASURED-1 offline suite (qnfo-fleet-control 0.42.1, agent_issues 2954, 100245, 100246): the real remediationContractsTick
// body, sliced out of worker.js and run on node:sqlite. A 'pending' read that carries a number and a bound is a measurement that is off
// target, so the tick records it as a verdict (a pass = 0 row, last_verdict 'fail', deferred_since cleared) exactly as
// scripts/remediation_consumer.py and the D1 trigger remediation_reopen_on_relapse_d1 already read it; a plain 'pending' or
// 'pending: <reason>' (no number against a bound) stays a deferral with no ledger row.
// Run: node --no-warnings qnfo-fleet-control/deferral-measured.test.mjs   -> prints "N failure(s)"
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
const W = vm.runInContext(src.slice(a, b) + "\n;({ remediationContractsTick, rtDeferralReason: typeof rtDeferralReason === 'function' ? rtDeferralReason : null, rtDeferralProbe: typeof rtDeferralProbe === 'function' ? rtDeferralProbe : null, rtDeferralStampKind: typeof rtDeferralStampKind === 'function' ? rtDeferralStampKind : null, rtIsDeferral, rtIsMeasuredPending: typeof rtIsMeasuredPending === 'function' ? rtIsMeasuredPending : null });", ctx, { filename: "fleet-control#VERIFICATION-PATH-1" });

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


// ---------------------------------------------------------------- (a) which reads are deferrals
{
  const defers = ["pending", "Pending", "pending: waiting for the window to open", "pending: 3 job rows since 2026-10-19 (needs 3)",
    "pending: SEARCH-NEAREST-1 live since 2026-10-19T11:46:58Z, measured over its first full day", "pending: no publish-v2-metadata event since 2026-10-01 15:17"];
  const measured = ["pending: unmanaged_direct_spend_share reads 0.5058 (target <= 0.5, lever: throttle BYOK callers)", "pending: worker_count 33 (needs <= 24)",
    "pending: code_task_success_rate_30d 0.42 (needs >= 0.6 on 14 days)", "Pending: 11 failures, fewer than 3 wanted", "pending: 5 is above the ceiling of 4", "pending: 41 advisory findings (target 0)",
    "pending: 7 over the limit", "pending: 9 more than allowed", "pending: 12 > 3"];
  const verdicts = ["ok", "broken", "", null, "fail: 3 rows", "closed"];
  for (const o of defers) check(W.rtIsDeferral(o) === true, "a plain pending read stays a deferral: " + JSON.stringify(o));
  for (const o of measured) check(W.rtIsDeferral(o) === false, "a pending read with a number against a bound is a verdict, not a deferral: " + JSON.stringify(o));
  for (const o of verdicts) check(W.rtIsDeferral(o) === false, "a non-pending read is not a deferral: " + JSON.stringify(o));
  check(typeof W.rtIsMeasuredPending === "function" && measured.every((o) => W.rtIsMeasuredPending(o)) && !defers.some((o) => W.rtIsMeasuredPending(o)) && !verdicts.some((o) => W.rtIsMeasuredPending(o)),
    "rtIsMeasuredPending is the measured half of the pending convention and nothing else");
}

// ---------------------------------------------------------------- (b) the tick: a measured pending is a verdict, a plain pending is a deferral
{
  const w = world();
  w.issue(1, "open, measured off target", "open", 1); w.contract("m1", 1, "pm1"); w.src("pm1", "pending: unmanaged_direct_spend_share reads 0.5058 (target <= 0.5, lever: throttle BYOK callers)");
  w.issue(2, "open, waits for a window", "open", 1); w.contract("w2", 2, "pw2"); w.src("pw2", "pending: waiting for the window to open");
  const out = await w.tick();
  const c1 = w.db.prepare("SELECT last_verdict, deferred_since FROM remediation_contracts WHERE class = 'm1'").get();
  const c2 = w.db.prepare("SELECT last_verdict, deferred_since FROM remediation_contracts WHERE class = 'w2'").get();
  const rows1 = w.db.prepare("SELECT pass, observed FROM remediation_verifications WHERE class = 'm1'").all();
  const rows2 = w.db.prepare("SELECT pass, observed FROM remediation_verifications WHERE class = 'w2'").all();
  check(c1.last_verdict === "fail" && c1.deferred_since === null, "the measured pending contract reads fail and carries no deferral start (got " + JSON.stringify(c1) + ")");
  check(rows1.length === 1 && rows1[0].pass === 0 && /^pending: unmanaged_direct_spend_share reads 0\.5058/.test(rows1[0].observed), "the measured read is written to the verdict ledger with its measurement (got " + JSON.stringify(rows1) + ")");
  check(c2.last_verdict === "deferred" && typeof c2.deferred_since === "string" && rows2.length === 0, "the plain pending contract still defers, stamps its start and writes no ledger row (got " + JSON.stringify(c2) + " rows " + rows2.length + ")");
  check(out.fail === 1 && out.deferred === 1, "the tick counts one failure and one deferral (got fail " + out.fail + ", deferred " + out.deferred + ")");
}

// ---------------------------------------------------------------- (c) a contract that deferred for days and now measures stops being a deferral and files no escalation
{
  const w = world();
  w.issue(10, "open, measured after a long deferral", "open", 1); w.contract("old1", 10, "po1"); w.src("po1", "pending: the newest audit reads 0 fail and 41 advisory findings at 2026-10-19T17:21:53Z (target 0)");
  w.issue(11, "open, plain pending for a week", "open", 1); w.contract("old2", 11, "po2"); w.src("po2", "pending: nobody supplies the awaited condition");
  w.db.prepare("UPDATE remediation_contracts SET deferred_since = ?, last_verdict = 'deferred', status = 'active' WHERE class IN ('old1', 'old2')").run(ago(8 * 24));
  const out = await w.tick();
  check(out.deferral_cleared === 1 && w.ds("old1") === null, "a measured read clears the deferral start (got cleared " + out.deferral_cleared + ", start " + w.ds("old1") + ")");
  const titles = w.db.prepare("SELECT title FROM agent_issues WHERE title LIKE 'VERIFICATION-DEFERRED-7D-1: %'").all().map((r) => r.title);
  check(!titles.includes("VERIFICATION-DEFERRED-7D-1: old1"), "a measured contract is not escalated as a stalled probe (got " + JSON.stringify(titles) + ")");
  check(titles.includes("VERIFICATION-DEFERRED-7D-1: old2"), "a plain pending older than seven days still files its escalation (got " + JSON.stringify(titles) + ")");
  const esc = w.db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = 'VERIFICATION-DEFERRED-7D-1: old2')").get();
  check(!!esc && /still defers/.test(esc.verify_probe), "the escalation issue carries its closing probe");
}

// ---------------------------------------------------------------- (d) a measured read that later reaches target passes as before
{
  const w = world();
  w.issue(20, "open, reaches target", "open", 1); w.contract("t1", 20, "pt1"); w.src("pt1", "pending: share reads 0.51 (target <= 0.5)");
  await w.tick();
  check(w.db.prepare("SELECT last_verdict FROM remediation_contracts WHERE class = 't1'").get().last_verdict === "fail", "off target reads fail");
  w.src("pt1", "ok");
  const out = await w.tick();
  check(out.pass === 1 && w.db.prepare("SELECT last_verdict FROM remediation_contracts WHERE class = 't1'").get().last_verdict === "pass", "at target the same contract passes (got pass " + out.pass + ")");
}

console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
