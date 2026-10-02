// BACKLOG-EXEC-EVIDENCE-1 offline suite (agent_issues 1808): an exception-class issue closes only when a recurrence query on
// columns that exist says the error stopped AND a trusted health probe passed, with both written to
// issue_triage.close_evidence by the same statement that closes the issue. The schemas and triggers below are copied from
// qnfo-audit sqlite_master (read 2026-10-02): worker_usage_daily (day, script, errors_24h ...; written once a day by
// qnfo-fleet-control refreshScriptUsage from Cloudflare workersInvocationsAdaptive), worker_logs (script_name, ts_ms,
// outcome, exceptions_json), alerts (source, level, created_at), fleet_probe_log, and the issue_close_evidence_required and
// triage_close_sync triggers. The old check counted alerts from qnfo-error-selfheal, a retired worker with 0 rows in alerts.
// Run: node --no-warnings qnfo-backlog-exec/exception-close.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.join(here, "worker.js")).href)).default;

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 500) : "")); } };

// A live probe from inside the worker is same-zone evidence and never authorizes a close; it must not be reached either.
let liveFetches = 0;
globalThis.fetch = async () => { liveFetches++; throw new Error("offline"); };

const H = 3600e3, NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
function makeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
    CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, level TEXT, message TEXT, digested INTEGER, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE fleet_probe_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, name TEXT, url TEXT, transport TEXT, ok INTEGER, status INTEGER, ms INTEGER, body TEXT);
    CREATE TABLE worker_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event_hash TEXT UNIQUE NOT NULL, ts_ms INTEGER NOT NULL, ingested_at TEXT NOT NULL, script_name TEXT NOT NULL, event_type TEXT, outcome TEXT, url TEXT, method TEXT, status INTEGER, cpu_ms REAL, wall_ms REAL, logs_json TEXT, exceptions_json TEXT);
    CREATE TABLE worker_usage_daily (day TEXT NOT NULL, script TEXT NOT NULL, requests_24h INTEGER, errors_24h INTEGER, requests_7d INTEGER, errors_7d INTEGER, source TEXT, ts TEXT, PRIMARY KEY (day, script));
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE worker_live_audit (worker TEXT PRIMARY KEY, http INTEGER, live_version TEXT, registry_before TEXT, match INTEGER, note TEXT, probed_at TEXT);
    CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, action_ref INTEGER, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
    CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') BEGIN SELECT RAISE(ABORT,'close-without-evidence'); END;
    CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;
    CREATE TRIGGER triage_close_sync_issue_ins AFTER INSERT ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;
    CREATE TRIGGER agent_issues_autotriage_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' BEGIN INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (NEW.id, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', datetime('now','+7 days')); END;
  `);
  const wrap = (sql) => {
    let args = [];
    const st = {
      bind: (...a) => { args = a.map((v) => (v === undefined ? null : v)); return st; },
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    };
    return st;
  };
  return { prepare: wrap, _db: db };
}
const FILLER = ["qnfo-fleet-dashboard", "qnfo-ops", "qnfo-ai", "qnfo-email", "qnfo-social", "qnfo-cms", "calendar-api", "personal-api", "idea-hub", "errata-hub", "fleet-exec", "qnfo-gateway"];
// One world: an issue, a usage snapshot, worker_logs, alerts and probe rows; then one drain over POST /run.
async function drain(o) {
  const env = { AUDIT: makeD1(), RUN_TOKEN: "rt" };
  const d = env.AUDIT._db;
  const created = NOW - (o.ageH == null ? 72 : o.ageH) * H;
  const id = Number(d.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'reliability', 'high', 'open', ?, ?)").run(o.title, o.description || "", o.source || "qnfo-error-selfheal", created, created).lastInsertRowid);
  const snapAt = o.snapAt == null ? NOW - 3 * H : o.snapAt;
  const day = iso(snapAt).slice(0, 10);
  if (o.snapshot !== false) {
    const scripts = FILLER.slice(0, o.coverage == null ? FILLER.length : o.coverage);
    for (const s of scripts) d.prepare("INSERT OR REPLACE INTO worker_usage_daily VALUES (?, ?, 100, 0, 700, 0, 'cf-graphql-workersInvocationsAdaptive', ?)").run(day, s, iso(snapAt));
    for (const [s, e] of Object.entries(o.errors || {})) d.prepare("INSERT OR REPLACE INTO worker_usage_daily VALUES (?, ?, 500, ?, 3000, ?, 'cf-graphql-workersInvocationsAdaptive', ?)").run(day, s, e, e, iso(snapAt));
  }
  for (const [s, n] of Object.entries(o.logErrors || {})) for (let i = 0; i < n; i++) d.prepare("INSERT INTO worker_logs (event_hash, ts_ms, ingested_at, script_name, event_type, outcome, exceptions_json) VALUES (?, ?, ?, ?, 'telemetry:fetch', 'exception', ?)").run("h" + s + i, NOW - 2 * H, iso(NOW - H), s, '[{"name":"Error"}]');
  for (const [s, n] of Object.entries(o.alertsPerHour || {})) for (let i = 0; i < n; i++) d.prepare("INSERT INTO alerts (source, level, message, created_at) VALUES (?, 'warn', ?, ?)").run(s, "msg " + i, iso(NOW - 2 * H + i * 1000).slice(0, 19).replace("T", " "));
  for (const p of o.probes || []) d.prepare("INSERT INTO fleet_probe_log (ts, source, name, url, transport, ok, status) VALUES (?, 'qnfo-fleet-dashboard', ?, '', ?, ?, ?)").run(iso(NOW - (p.minAgo || 5) * 6e4), p.name, p.transport || "http", p.ok == null ? 1 : p.ok, p.ok === 0 ? 503 : 200);
  if (o.liveAudit) d.prepare("INSERT INTO worker_live_audit (worker, http, live_version, match, note, probed_at) VALUES (?, ?, '1.0.0', 1, 'SYNC', ?)").run(o.liveAudit.name, o.liveAudit.http || 200, iso(NOW - (o.liveAudit.hAgo || 1) * H).slice(0, 19).replace("T", " "));
  liveFetches = 0;
  const res = await worker.fetch(new Request("https://qnfo-backlog-exec.q08.workers.dev/run", { method: "POST", headers: { Authorization: "Bearer rt" } }), env);
  const body = await res.json();
  const issue = d.prepare("SELECT * FROM agent_issues WHERE id = ?").get(id);
  const tri = d.prepare("SELECT * FROM issue_triage WHERE issue_id = ?").get(id) || {};
  const det = ((body.out && body.out.notes && body.out.notes.detail) || []).filter((x) => x.id === id);
  const ev = d.prepare("SELECT * FROM cloud_ops_events WHERE text LIKE 'backlog-exec {%' ORDER BY ts DESC").get();
  return { status: issue.status, evidence: tri.close_evidence || "", detail: det, body, runMeta: ev ? ev.meta : "", d };
}
const W = "qnfo-fleet-dashboard";
const EXC = { title: "WORKER-EXCEPTION-DETECTED " + W + " (window 2026-09-29 18:17)", description: "qnfo-error-selfheal detected 4 uncaught scriptThrewException for worker " + W + " in the last 60 min. Root-cause + fix per RECURRENCE-ZERO-1 before closeout; verify a live probe with same-turn evidence." };
const GOOD_PROBE = [{ name: W, transport: "cf-api-list", minAgo: 1 }, { name: W, transport: "http", minAgo: 6 }];

// 1. the defect: the worker logged errors in the last 24 h, so the issue stays open (the DoD of #1808)
{
  const x = await drain(Object.assign({ errors: { [W]: 16 }, probes: GOOD_PROBE }, EXC));
  ok(x.status === "open", "1a an issue whose worker logged errors in the last 24 h (worker_usage_daily errors_24h=16) stays open", x.detail);
  ok(x.detail.some((y) => /errors_24h=16/.test(y.note || "")), "1b the drain says why: the measured error count", x.detail);
}
// 2. the error stopped and the probe passed: closed, with the measurements in close_evidence
{
  const x = await drain(Object.assign({ probes: GOOD_PROBE }, EXC));
  ok(x.status === "closed", "2a no errors in a full 24 h window after filing and a passing http probe: closed", x.detail);
  ok(/BACKLOG-EXEC-EVIDENCE-1/.test(x.evidence) && /worker_usage_daily/.test(x.evidence) && /errors_24h=0/.test(x.evidence) && /worker_logs error rows 24h=0/.test(x.evidence) && /alerts max\/h 24h=0/.test(x.evidence), "2b close_evidence carries the recurrence measurements", x.evidence);
  ok(/probe ok=1 status=200 transport=http/.test(x.evidence) && /target=qnfo-fleet-dashboard/.test(x.evidence), "2c close_evidence carries the passing probe and the target worker", x.evidence);
  ok(/"exceptionRule":"BACKLOG-EXEC-EVIDENCE-1"/.test(x.runMeta), "2d the run summary names the close rule (the remediation probe reads it)", x.runMeta);
  ok(liveFetches === 0, "2e no same-zone live fetch is used as evidence", liveFetches);
}
// 3. the probe is not ignored: errors stopped, but the health probe fails, is stale, or is only an account listing
{
  let x = await drain(Object.assign({ probes: [{ name: W, transport: "http", ok: 0, minAgo: 4 }] }, EXC));
  ok(x.status === "open" && x.detail.some((y) => /probe/.test(y.note || "")), "3a errors 0 but the latest http probe fails: stays open", x.detail);
  x = await drain(Object.assign({ probes: [{ name: W, transport: "http", minAgo: 300 }] }, EXC));
  ok(x.status === "open", "3b errors 0 but the last http probe is 5 h old: stays open", x.detail);
  x = await drain(Object.assign({ probes: [{ name: W, transport: "cf-api-list", minAgo: 1 }] }, EXC));
  ok(x.status === "open", "3c errors 0 but only a cf-api-list row (the script exists, not that it answers): stays open", x.detail);
  x = await drain(Object.assign({ probes: [] }, EXC));
  ok(x.status === "open" && liveFetches === 0, "3d errors 0 and no probe row: stays open (a same-zone fetch cannot authorize it)", { d: x.detail, liveFetches });
  x = await drain(Object.assign({ probes: [{ name: W, transport: "cf-api-list", minAgo: 1 }], liveAudit: { name: W, hAgo: 2 } }, EXC));
  ok(x.status === "closed" && /transport=external-https/.test(x.evidence) && /source=worker_live_audit/.test(x.evidence), "3e no http probe row, but the external /health audit (worker_live_audit 200, 2 h old) passed: closed with that probe", x.evidence || x.detail);
  x = await drain(Object.assign({ probes: [], liveAudit: { name: W, hAgo: 10 } }, EXC));
  ok(x.status === "open", "3f the external /health audit is 10 h old: stays open", x.detail);
  x = await drain(Object.assign({ probes: [{ name: W, transport: "http", ok: 0, minAgo: 3 }], liveAudit: { name: W, hAgo: 1 } }, EXC));
  ok(x.status === "open", "3g a fresh failing http probe is not outvoted by an older external audit: stays open", x.detail);
}
// 4. the recurrence must be measured: stale, partial or missing snapshots, or a window that does not start after filing
{
  let x = await drain(Object.assign({ probes: GOOD_PROBE, snapAt: NOW - 50 * H }, EXC));
  ok(x.status === "open" && x.detail.some((y) => /stale|unmeasured/.test(y.note || "")), "4a a 50 h old usage snapshot is not evidence: stays open", x.detail);
  x = await drain(Object.assign({ probes: GOOD_PROBE, coverage: 4 }, EXC));
  ok(x.status === "open", "4b a partial snapshot (4 scripts) is not evidence: stays open", x.detail);
  x = await drain(Object.assign({ probes: GOOD_PROBE, ageH: 24.5, snapAt: NOW - 1 * H }, EXC));
  ok(x.status === "open", "4c the snapshot's 24 h window began before the issue was filed: stays open", x.detail);
  x = await drain(Object.assign({ probes: GOOD_PROBE, snapshot: false }, EXC));
  ok(x.status === "open", "4d no usage snapshot at all: stays open", x.detail);
  x = await drain(Object.assign({ probes: [{ name: "qnfo-orphan", transport: "http" }] }, EXC, { title: "WORKER-EXCEPTION-DETECTED qnfo-orphan (window 2026-09-29 18:17)", description: "qnfo-error-selfheal detected 2 uncaught scriptThrewException for worker qnfo-orphan in the last 60 min." }));
  ok(x.status === "open", "4e the named worker has no row in a fresh snapshot (unmeasured): stays open", x.detail);
}
// 5. every place the errors are recorded now can hold it open: worker_logs exceptions and an alert flood
{
  let x = await drain(Object.assign({ probes: GOOD_PROBE, logErrors: { [W]: 2 } }, EXC));
  ok(x.status === "open" && x.detail.some((y) => /worker_logs error rows 24h=2/.test(y.note || "")), "5a worker_logs holds 2 exception rows for the worker in 24 h: stays open", x.detail);
  x = await drain({ title: "ALERT-STORM-DETECTED " + W + " (flood)", description: "qnfo-error-selfheal detected 11 flood alerts from " + W + " in the trailing 60 min.", probes: GOOD_PROBE, alertsPerHour: { [W]: 9 } });
  ok(x.status === "open" && x.detail.some((y) => /alerts max\/h 24h=[5-9]/.test(y.note || "")), "5b an alert flood (9 alerts in one hour) from the worker in 24 h: stays open", x.detail);
  x = await drain({ title: "ALERT-STORM-DETECTED " + W + " (flood)", description: "qnfo-error-selfheal detected 11 flood alerts from " + W + " in the trailing 60 min.", probes: GOOD_PROBE, alertsPerHour: { [W]: 3 } });
  ok(x.status === "closed" && /alerts max\/h 24h=3/.test(x.evidence), "5c three alerts in an hour is no storm (the detector's floor was > 8): closed with the count", x.evidence || x.detail);
}
// 6. the subject is the worker the title names, never the retired filer, and prose issues are not detector issues
{
  let x = await drain({ title: "WORKER-EXCEPTION-DETECTED job-market-watch (window 2026-09-10 07:17)", description: "qnfo-error-selfheal detected 9 uncaught scriptThrewException for worker job-market-watch in the last 60 min.", probes: [{ name: "qnfo-error-selfheal", transport: "http" }, { name: "job-market-watch", transport: "http" }], errors: { "job-market-watch": 9 } });
  ok(x.status === "open" && x.detail.some((y) => y.target === "job-market-watch"), "6a the target is job-market-watch (title), not qnfo-error-selfheal (description), and its errors hold it open", x.detail);
  x = await drain({ title: "WORKER-EXCEPTION-DETECTED __unknown__ (window 2026-09-11 04:17)", description: "qnfo-error-selfheal detected 2 uncaught scriptThrewException for worker __unknown__ in the last 60 min.", probes: [{ name: "qnfo-error-selfheal", transport: "http" }] });
  ok(x.status === "open", "6b '__unknown__' names no worker: never closed on another worker's silence", x.detail);
  x = await drain({ title: "ERROR-DETAIL-CAPTURE-1: Worker exceptions are counted but never recorded (worker_logs has no row for qnfo-gateway scriptThrewException 2026-10-02 09h)", description: "Measured 2026-10-02 ~10:40Z: dashboard err24=33 across qnfo-fleet-dashboard(16).", source: "claude-session:fleet-audit-2026-10-02b", probes: [{ name: "qnfo-gateway", transport: "http" }] });
  ok(x.status === "open", "6c a prose issue that mentions exceptions (#1826) is not closed by qnfo-gateway's silence", x.detail);
  x = await drain({ title: "BACKLOG-EXEC-EVIDENCE-1: exception issues close on a recurrence check against a retired worker's alerts", description: "code-task: repo=qnfo-workers path=qnfo-backlog-exec/worker.js\nPillar: autonomy.", source: "claude-session:fleet-audit-2026-10-02", probes: [{ name: "qnfo-workers", transport: "http" }] });
  ok(x.status === "open", "6d issue #1808's own text is not closed as a recovered exception of 'qnfo-workers'", x.detail);
}
// 7. unchanged: a fresh exception issue (< 24 h) is not closed
{
  const x = await drain(Object.assign({ probes: GOOD_PROBE, ageH: 5 }, EXC));
  ok(x.status === "open", "7 an exception issue under 24 h old is left open", x.detail);
}
console.log("exception-close: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
