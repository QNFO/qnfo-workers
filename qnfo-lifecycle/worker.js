var VERSION = "1.8.1-one-worker-count"; // 1.8.1 ONE-WORKER-COUNT-1 (2026-10-06, pillar core, transformation lever T5.10): runMetricFreshness no longer writes metric_registry.worker_count; qnfo-fleet-control 0.4.137 writes it from the live scripts census beside fleet_budget.workers (COUNT(service_registry) counted retired rows too, 32 against 31 on 2026-10-06). 1.8.0 BACKLOG-FOLD-1 (#1756, pillar cost): qnfo-backlog-exec runs here as a member (backlogMod) on the 02:00 tick; GET /backlog/health; qnfo-ops reaches its drain over the BACKLOG binding (props.member). qnfo-archive (retired: its KG seed got HTTP 401 on every batch) leaves runPing. 1.7.3 LIFECYCLE-PING-1042-1 (#1994): wrangler.toml sets global_fetch_strictly_public, so runPing and runSync reach *.q08.workers.dev (150 PING FAIL HTTP 404 rows were Cloudflare error 1042). 1.7.2 METRIC-CADENCE-UNITS-1 + METRIC-UNMEASURED-CLASS-1 (#1865): "*/3h" and "2h" cadences parse with their unit; never-measured UNMEASURED/n/a metrics are their own class. 1.7.0 CRON-SINGLE-TRIGGER-1 (#1785): one hourly trigger, CRON_TABLE in code. Worker Contract v1 VERSION constant (read by version-bump-guard / drift checks)
const QNFO_VERSION = VERSION;
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __defProp222 = Object.defineProperty;
var __name222 = /* @__PURE__ */ __name22((target, value) => __defProp222(target, "name", { value, configurable: true }), "__name");
var __defProp2222 = Object.defineProperty;
var __name2222 = /* @__PURE__ */ __name222((target, value) => __defProp2222(target, "name", { value, configurable: true }), "__name");
var __defProp22222 = Object.defineProperty;
var __name22222 = /* @__PURE__ */ __name2222((target, value) => __defProp22222(target, "name", { value, configurable: true }), "__name");
var __defProp222222 = Object.defineProperty;
var __name222222 = __name22222((target, value) => __defProp222222(target, "name", { value, configurable: true }), "__name");
function corsHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "https://qnfo.org"
  };
}
__name(corsHeaders, "corsHeaders");
__name2(corsHeaders, "corsHeaders");
__name22(corsHeaders, "corsHeaders");
__name222(corsHeaders, "corsHeaders");
__name2222(corsHeaders, "corsHeaders");
__name22222(corsHeaders, "corsHeaders");
// ---- CRON-SINGLE-TRIGGER-1:BEGIN (pure; replayed by scripts/cron-single-trigger.test.mjs)
// CRON-SINGLE-TRIGGER-1 (2026-10-02, #1785, pillar: core). The account held 84 cron expressions against the fleet budget
// of 50. This worker now registers ONE hourly trigger; each tick runs every entry of CRON_TABLE (the former trigger list,
// unchanged) that fired in the hour ending at the tick, through the same dispatcher as before. An entry on the hour runs
// at its minute; one at :15 or :30 runs at the next full hour. Hourly keeps the 15-minute CPU limit of a cron trigger.
var TICK_CRON = "0 * * * *";
var CRON_TABLE = ["0 * * * *", "0 0 1 * *", "0 3 * * *", "0 5 * * *", "0 8 * * 1"];
var TICK_PARALLEL = false;
function cronFieldMatch(spec, v) {
  return String(spec).split(",").some(function (part) {
    var st = /^(.+)\/(\d+)$/.exec(part), step = st ? Number(st[2]) : 1, base = st ? st[1] : part;
    var r = /^(\d+)-(\d+)$/.exec(base), lo, hi;
    if (base === "*") { lo = 0; hi = 1e9; } else if (r) { lo = Number(r[1]); hi = Number(r[2]); } else { lo = Number(base); hi = st ? 1e9 : lo; }
    return v >= lo && v <= hi && (v - (base === "*" ? 0 : lo)) % step === 0;
  });
}
// Cloudflare cron fields in UTC; day of week 1 = Sunday .. 7 = Saturday.
function cronMatchesAt(expr, ms) {
  var f = String(expr).trim().split(/\s+/), d = new Date(ms);
  return f.length === 5 && cronFieldMatch(f[0], d.getUTCMinutes()) && cronFieldMatch(f[1], d.getUTCHours()) && cronFieldMatch(f[2], d.getUTCDate()) && cronFieldMatch(f[3], d.getUTCMonth() + 1) && cronFieldMatch(f[4], d.getUTCDay() + 1);
}
// The table entries that fired in the 60 minutes ending at the tick (tick minute included), in table order.
function cronDueAtTick(table, tickMs) {
  var t = Math.floor(tickMs / 60000) * 60000;
  return table.filter(function (expr) {
    for (var k = 0; k < 60; k++) if (cronMatchesAt(expr, t - k * 60000)) return true;
    return false;
  });
}
// ---- CRON-SINGLE-TRIGGER-1:END
// `one` is the dispatcher this worker always had (one cron expression in, its job run). A trigger other than the tick
// (a former per-job trigger still registered) goes straight to it, and so does an event marked tickEntry: that is how
// the tick hands each table entry on, and how a test runs one entry whose expression equals the tick's.
async function cronTickDispatch(event, one) {
  if (!event || event.cron !== TICK_CRON || event.tickEntry) return one(event);
  var at = Number(event.scheduledTime) || Date.now();
  var due = cronDueAtTick(CRON_TABLE, at);
  var run = function (expr) {
    return Promise.resolve().then(function () { return one({ cron: expr, scheduledTime: at, type: "scheduled", tickEntry: true }); }).catch(function (e) { console.error("cron " + expr + ": " + String(e && e.message || e)); });
  };
  if (TICK_PARALLEL) { await Promise.all(due.map(run)); return; }
  for (var i = 0; i < due.length; i++) await run(due[i]);
}
// ---- BACKLOG-FOLD-1:BEGIN (1.8.0, #1756) ----
// qnfo-backlog-exec (the agent_issues sweep and drain) runs here as a member: its code below is the qnfo-backlog-exec
// bundle unchanged except its VERSION line. AUDIT maps onto QNFO_AUDIT. It runs on the 02:00 UTC hourly tick (its old
// "10 1 * * *", delivered at the next full hour as CRON-SINGLE-TRIGGER-1 does for this worker's table). Public: GET
// /backlog/health. A service binding whose props name the member (qnfo-ops BACKLOG) reaches all of its routes, so
// qnfo-ops' https://backlog.internal/run drain keeps its internal-caller gate.
var BACKLOG_VERSION = "2.0.6-folded";
var BACKLOG_MEMBER = "qnfo-backlog-exec";
var backlogMod = (function () {
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = BACKLOG_VERSION;
// PRIORITY-QUEUE-1 (2026-10-03, owner directive): the sweep ranks critical first. The old CASE ranked high, medium, else,
// so critical issues sorted with low. Within a priority the least recently touched row still goes first (rotation).
var WORKER = "qnfo-backlog-exec";
var MAX_ROW = 40;
var PROBE_TIMEOUT = 8e3;
async function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
function ts() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(ts, "ts");
function nowEpoch() {
  return Date.now();
}
__name(nowEpoch, "nowEpoch");
function createdAgeMs(ca, now) {
  if (typeof ca === "number") return now - ca;
  if (typeof ca === "string") {
    const t = ca.trim();
    if (/^\d{10,}$/.test(t)) return now - Number(t);
    const d = new Date(t).getTime();
    if (Number.isFinite(d)) return now - d;
  }
  return 0;
}
__name(createdAgeMs, "createdAgeMs");
async function recordEvent(env, kind, text, meta, job, status) {
  try {
    const id = kind.slice(0, 2) + "-" + (job || WORKER) + "-" + Date.now().toString(36);
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(id, ts(), kind, String(text).slice(0, 800), JSON.stringify(meta || {}).slice(0, 800), job || WORKER, status || "ok").run();
  } catch (e) {
  }
}
__name(recordEvent, "recordEvent");
async function alert(env, source, level, message) {
  try {
    await env.AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(source, level, String(message).slice(0, 500)).run();
  } catch (e) {
  }
}
__name(alert, "alert");
function workerTarget(text) {
  const m = String(text || "").match(/\b(qnfo-[a-z0-9-]+|personal-api(?:-[a-z0-9-]+)?|research-daily-brief|calendar-api|events-radar|qnfo-ai|qnfo-ai-chat)\b/g);
  if (!m) return null;
  return m[0];
}
__name(workerTarget, "workerTarget");
var TRUSTED_TRANSPORTS = new Set(["http", "external", "curl", "container", "dns", "edge-ext", "external-curl", "external-http", "external-https"]);
function transportTrusted(tr) {
  const t = String(tr || "").toLowerCase().trim();
  if (!t) return false;
  if (TRUSTED_TRANSPORTS.has(t)) return true;
  return TRUSTED_TRANSPORTS.has(t.split(":")[0].trim());
}
async function closeIssue(env, id, now, target, evidence) {
  const stamp = new Date().toISOString();
  const ev = "backlog-exec v1.6.1 evidence-first auto-close " + stamp + (target ? " | target=" + target : "") + (evidence ? " | " + evidence : "");
  await env.AUDIT.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, close_evidence, triaged_at) VALUES (?1,'RC-03','closed','qnfo-backlog-exec',datetime('now'),'auto-close by qnfo-backlog-exec v1.6.0 drain',?2,datetime('now')) ON CONFLICT(issue_id) DO UPDATE SET triage_state='closed', close_evidence=?2, triaged_at=datetime('now')").bind(id, ev).run();
  return env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, id).run();
}
// BACKLOG-EXEC-EVIDENCE-1 (2.0.4, agent_issues 1808): exception-class issues (WORKER-EXCEPTION-DETECTED <worker>,
// ALERT-STORM-DETECTED <worker>, filed by qnfo-error-selfheal until it was retired on 2026-10-01) closed when alerts held no
// qnfo-error-selfheal row naming the worker in 24 h. That worker is retired and alerts holds 0 of its rows, so the count was
// always 0 and every such issue older than 24 h closed, even while the worker kept failing; the health probe was read and
// then ignored. The target was also wrong: the first fleet name in title+description, which is the filer itself whenever the
// title names a worker the pattern misses (issue 509, job-market-watch, closed as "qnfo-error-selfheal" recovered), and any
// prose issue with "exception" in its title was treated as one (#1826, and #1808 itself as "qnfo-workers").
// Now: only a detector-shaped title counts, its subject is the worker the title names ("__unknown__" is no worker), and the
// issue closes only when all of these hold, written into close_evidence by the statement that closes it:
//   errors stopped: the latest worker_usage_daily snapshot (qnfo-fleet-control refreshScriptUsage, Cloudflare
//     workersInvocationsAdaptive per script, where errors are counted now) is under 36 h old, covers >= 10 scripts, has
//     the worker's row with errors_24h = 0, and its 24 h window began after the issue was filed;
//   no exception rows for the worker in worker_logs in 24 h (outcome other than ok/canceled, or exceptions_json);
//   no alert flood from the worker in 24 h (at most 4 alerts in any clock hour; the detector's storm was > 8 in 60 min,
//     which always puts >= 5 into one clock hour);
//   the health probe passed: see exceptionProbe (trusted transports only; a same-zone fetch never counts).
var EXC_TITLE = /\b(?:WORKER-EXCEPTION-DETECTED|ALERT-STORM-DETECTED|ERROR-BURST(?:-DETECTED)?)\s+(\S+)/i;
var EXC_SCRIPT = /^[a-z0-9][a-z0-9-]{0,62}$/;
var EXC_PROBE_MAX_MIN = 30;
var EXC_SNAPSHOT_MAX_H = 36;
var EXC_SNAPSHOT_MIN_SCRIPTS = 10;
var EXC_ALERTS_PER_HOUR_MAX = 4;
function exceptionTarget(title) {
  const m = String(title || "").match(EXC_TITLE);
  if (!m) return { detector: false, target: null };
  const n = m[1].replace(/[),.;:]+$/, "");
  return { detector: true, target: EXC_SCRIPT.test(n) ? n : null, named: n };
}
async function exceptionRecurrence(env, name, createdMs) {
  const out = { ok: false, why: "", ev: "" };
  const snap = await env.AUDIT.prepare("SELECT day, COUNT(*) AS n, MAX(ts) AS ts FROM worker_usage_daily WHERE day = (SELECT MAX(day) FROM worker_usage_daily) GROUP BY day").first();
  if (!snap) { out.why = "unmeasured: worker_usage_daily is empty"; return out; }
  const snapMs = Date.parse(String(snap.ts || ""));
  if (!Number.isFinite(snapMs) || Date.now() - snapMs > EXC_SNAPSHOT_MAX_H * 36e5) { out.why = "unmeasured: worker_usage_daily snapshot " + snap.day + " is stale (ts " + snap.ts + ")"; return out; }
  if (Number(snap.n) < EXC_SNAPSHOT_MIN_SCRIPTS) { out.why = "unmeasured: worker_usage_daily snapshot " + snap.day + " covers " + snap.n + " scripts (< " + EXC_SNAPSHOT_MIN_SCRIPTS + ")"; return out; }
  const u = await env.AUDIT.prepare("SELECT requests_24h, errors_24h, ts FROM worker_usage_daily WHERE day = ?1 AND script = ?2").bind(snap.day, name).first();
  if (!u) { out.why = "unmeasured: no worker_usage_daily row for " + name + " in snapshot " + snap.day; return out; }
  const uMs = Date.parse(String(u.ts || ""));
  if (!Number.isFinite(uMs) || uMs - 864e5 < createdMs) { out.why = "unmeasured: the snapshot's 24h window (to " + u.ts + ") began before the issue was filed (" + new Date(createdMs).toISOString() + ")"; return out; }
  const wl = await env.AUDIT.prepare("SELECT COUNT(*) AS c, MAX(ingested_at) AS last FROM worker_logs WHERE script_name = ?1 AND ts_ms >= ?2 AND (COALESCE(outcome, 'ok') NOT IN ('ok', 'canceled') OR (exceptions_json IS NOT NULL AND exceptions_json NOT IN ('', '[]')))").bind(name, Date.now() - 864e5).first();
  const al = await env.AUDIT.prepare("SELECT COALESCE(MAX(n), 0) AS m FROM (SELECT strftime('%Y-%m-%d %H', created_at) AS h, COUNT(*) AS n FROM alerts WHERE source = ?1 AND julianday(created_at) >= julianday('now', '-24 hours') GROUP BY h)").bind(name).first();
  const errors = Number(u.errors_24h || 0), logErr = wl ? Number(wl.c || 0) : 0, perHour = al ? Number(al.m || 0) : 0;
  out.ev = "worker_usage_daily day=" + snap.day + " ts=" + u.ts + " errors_24h=" + errors + " requests_24h=" + Number(u.requests_24h || 0) + " (window after filing " + new Date(createdMs).toISOString() + "); worker_logs error rows 24h=" + logErr + "; alerts max/h 24h=" + perHour;
  if (errors > 0 || logErr > 0 || perHour > EXC_ALERTS_PER_HOUR_MAX) { out.why = "errors recur: " + out.ev; return out; }
  out.ok = true;
  return out;
}
// The health probe: the newest trusted-transport fleet_probe_log row (qnfo-fleet-dashboard probes most workers over http
// every 5-15 min) decides when it is under 30 min old, pass or fail. Only when there is none (the dashboard does not probe
// itself) does the external /health probe in worker_live_audit (scripts/fleet-autoaudit.py) count, if under 6 h old.
var EXC_LIVE_AUDIT_MAX_H = 6;
async function exceptionProbe(env, name) {
  const rs = await env.AUDIT.prepare("SELECT ok, status, ts, transport, source FROM fleet_probe_log WHERE name = ?1 ORDER BY id DESC LIMIT 12").bind(name).all();
  const row = (rs.results || []).find((r) => transportTrusted(r.transport));
  let why = "no trusted-transport fleet_probe_log row for " + name;
  if (row) {
    const ageMin = (Date.now() - new Date(row.ts).getTime()) / 6e4;
    const ev = "probe ok=" + Number(row.ok) + " status=" + row.status + " transport=" + row.transport + " ts=" + row.ts + " source=" + row.source;
    if (ageMin <= EXC_PROBE_MAX_MIN) return { ok: Number(row.ok) === 1, ev: ev };
    why = ev + " (older than " + EXC_PROBE_MAX_MIN + "m)";
  }
  let la = null;
  try { la = await env.AUDIT.prepare("SELECT http, live_version, probed_at FROM worker_live_audit WHERE worker = ?1").bind(name).first(); } catch (e) { la = null; }
  const laMs = la ? Date.parse(String(la.probed_at || "").replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(la.probed_at || "")) ? "" : "Z")) : NaN;
  if (la && Number(la.http) === 200 && Number.isFinite(laMs) && Date.now() - laMs <= EXC_LIVE_AUDIT_MAX_H * 36e5) return { ok: true, ev: "probe ok=1 status=200 transport=external-https ts=" + la.probed_at + " source=worker_live_audit live_version=" + la.live_version };
  return { ok: false, ev: why + (la ? "; worker_live_audit http=" + la.http + " probed_at=" + la.probed_at + " (needs 200 within " + EXC_LIVE_AUDIT_MAX_H + "h)" : "") };
}
async function recheckRecentCloses(env) {
  let reopened = 0;
  const now = nowEpoch();
  try {
    const rows = await env.AUDIT.prepare("SELECT issue_id, close_evidence FROM issue_triage WHERE owner='qnfo-backlog-exec' AND triage_state='closed' AND triaged_at >= datetime('now','-7 days') AND close_evidence LIKE '%target=%' LIMIT 40").all();
    for (const r of rows.results || []) {
      const m = String(r.close_evidence || "").match(/target=([a-z0-9-]+)/i);
      if (!m) continue;
      const tgt = m[1];
      const last = await env.AUDIT.prepare("SELECT ok, ts FROM fleet_probe_log WHERE name=?1 ORDER BY id DESC LIMIT 1").bind(tgt).first();
      if (!last) continue;
      const age = Date.now() - new Date(last.ts).getTime();
      if (age <= 240 * 6e4 && Number(last.ok) === 0) {
        await env.AUDIT.prepare("UPDATE agent_issues SET status='open', updated_at=?1 WHERE id=?2 AND status='closed'").bind(now, r.issue_id).run();
        await env.AUDIT.prepare("UPDATE issue_triage SET triage_state='triaged', reopened_count = reopened_count + 1 WHERE issue_id=?1").bind(r.issue_id).run();
        reopened++;
        await recordEvent(env, "job-run", "backlog-exec REOPENED issue " + r.issue_id + " (" + tgt + "): fresh probe regression " + last.ts, { id: r.issue_id, target: tgt, action: "reopened" }, WORKER, "ok");
      }
    }
  } catch (e) {}
  return reopened;
}
async function reconcileDodMirrors(env) {
  let dodClosed = 0, reowned = 0;
  try {
    const r1 = await env.AUDIT.prepare("UPDATE task_dod_register SET status='closed', evidence_pointer = COALESCE(evidence_pointer,'') || ' | auto-closed (backlog-exec v1.6.3 mirror reconciliation): source agent_issues row is terminal', updated_at=datetime('now') WHERE status='open' AND source_table='agent_issues' AND EXISTS (SELECT 1 FROM agent_issues a WHERE CAST(a.id AS TEXT)=task_dod_register.source_row_id AND a.status IN ('closed','resolved','wontfix'))").run();
    dodClosed = r1 && r1.meta ? Number(r1.meta.changes || 0) : 0;
    const r2 = await env.AUDIT.prepare("UPDATE task_dod_register SET owner='agent', evidence_pointer = COALESCE(evidence_pointer,'') || ' | re-owned (backlog-exec v1.6.3): prior owner was not a live service', updated_at=datetime('now') WHERE status='open' AND owner NOT IN (SELECT service FROM service_registry WHERE state='live') AND owner <> 'agent'").run();
    reowned = r2 && r2.meta ? Number(r2.meta.changes || 0) : 0;
  } catch (e) {}
  return { dodClosed, reowned };
}
// REGISTER-INVENTORY-COMPLETE-1 (2026-09-28): the fleet-failures inventory spans SIX
// open-issue registers (GitHub org, task_dod_register, gtd_register, agent_issues,
// fleet_issue_dispatch, issue_ledger) but the drain acted only on agent_issues, so the
// other lanes accumulated un-drained. This dispositions every sub-lane so the inventory
// is both COMPLETE and SELF-DRAINING (self-audit + remediate fleet-wide, not just one table).
var DISPATCH_TERMINAL = "'executed','verified-done','closed-failed','closed-no-action','no-action','dedupe-superseded','no-handler-superseded'";
var DOD_TERMINAL = "'done','closed','resolved','cancelled','cancelled-with-monitor'";
var AGENT_TERMINAL = "'closed','done','resolved','wontfix','cancelled'";
async function reconcileRegisters(env) {
  const out = { dispatchClosed: 0, dodClosed: 0 };
  try {
    const r1 = await env.AUDIT.prepare(
      "UPDATE fleet_issue_dispatch SET state='closed' WHERE state='queued' AND COALESCE(exec_state,'') IN (" + DISPATCH_TERMINAL + ")"
    ).run();
    out.dispatchClosed = r1 && r1.meta ? Number(r1.meta.changes || 0) : 0;
  } catch (e) {}
  try {
    const r2 = await env.AUDIT.prepare(
      "UPDATE task_dod_register SET status='closed', evidence_pointer=COALESCE(evidence_pointer,'') || ' | auto-closed (backlog-exec v1.9.0 register reconcile)', updated_at=datetime('now') WHERE status NOT IN (" + DOD_TERMINAL + ") AND status <> 'in_progress' AND source_table='agent_issues' AND EXISTS (SELECT 1 FROM agent_issues a WHERE CAST(a.id AS TEXT)=task_dod_register.source_row_id AND a.status IN ('closed','resolved','wontfix','done','cancelled'))"
    ).run();
    out.dodClosed = r2 && r2.meta ? Number(r2.meta.changes || 0) : 0;
  } catch (e) {}
  return out;
}
// REGISTER-INVENTORY-COMPLETE-2 (2026-09-28): the fleet-failures dashboard surfaces
// FOURTEEN registers across panel 4 (complete open-issue inventory) and panel 6
// (unremediated registers). v1.9.0 covered panel 4's six only. This enumerates ALL of
// them with an open count, a kind, and the disposition actor, so no register the
// failures inventory shows is invisible to the drain. kind=event-plane|lock lanes are
// reported but excluded from the open total (they are not drainable backlogs).
var INVENTORY_LANES = [
  ["agent_issues", "SELECT COUNT(*) n FROM agent_issues WHERE status NOT IN (" + AGENT_TERMINAL + ")", "issue", "backlog-exec drain + verified-remediation closure"],
  ["task_dod_register", "SELECT COUNT(*) n FROM task_dod_register WHERE status NOT IN (" + DOD_TERMINAL + ")", "issue", "backlog-exec register reconcile"],
  ["gtd_register", "SELECT COUNT(*) n FROM gtd_register WHERE done=0", "issue", "gtd register owner"],
  ["fleet_issue_dispatch", "SELECT COUNT(*) n FROM fleet_issue_dispatch WHERE state='queued' AND COALESCE(exec_state,'') NOT IN (" + DISPATCH_TERMINAL + ")", "issue", "backlog-exec register reconcile"],
  ["issue_ledger", "SELECT COUNT(*) n FROM issue_ledger WHERE status='open'", "issue", "backlog-exec ledger sweep"],
  ["email_parse_failures", "SELECT COUNT(*) n FROM email_parse_failures WHERE status IN ('open','handoff')", "issue", "qnfo-email parse-failure resolver"],
  ["email_send_violations", "SELECT COUNT(*) n FROM email_send_violations WHERE COALESCE(resolved,0)=0", "issue", "qnfo-email send policy"],
  ["dead_links", "SELECT COUNT(*) n FROM dead_links WHERE resolved_at IS NULL", "issue", "link checker"],
  ["email_loop_quarantine", "SELECT COUNT(*) n FROM email_loop_quarantine WHERE status NOT IN ('processed','archived','spam')", "quarantine", "qnfo-email loop classifier"],
  ["version_queue", "SELECT COUNT(*) n FROM version_queue WHERE status NOT IN ('published','wontfix')", "pipeline", "qnfo-paper-reviser / zenodo depositor"],
  ["outreach_queue", "SELECT COUNT(*) n FROM outreach_queue WHERE COALESCE(status,'') NOT IN ('sent','skipped','rejected')", "queue", "qnfo-outreach drain"],
  ["deploy_locks", "SELECT COUNT(*) n FROM deploy_locks WHERE typeof(expires_at) IN ('integer','real') AND expires_at > (strftime('%s','now')*1000)", "lock", "qnfo-deploy-guard reap"],
  ["ai_gateway_failures", "SELECT COALESCE(SUM(count),0) n FROM ai_gateway_failures WHERE ts >= ((strftime('%s','now')-86400)*1000)", "event-plane", "qnfo-ai-calibration / gateway-health"]
];
async function openInventory(env) {
  const registers = {};
  let total = 0;
  for (let i = 0; i < INVENTORY_LANES.length; i++) {
    const lane = INVENTORY_LANES[i];
    let open = -1;
    try { const r = await env.AUDIT.prepare(lane[1]).first(); open = r ? Number(r.n) : -1; } catch (e) { open = -1; }
    registers[lane[0]] = { open: open, kind: lane[2], disposition: lane[3] };
    if (open > 0 && lane[2] !== "event-plane" && lane[2] !== "lock") total += open;
  }
  registers["github"] = { open: null, kind: "external", disposition: "GitHub mirror (dashboard GITHUB_TOKEN)" };
  return { laneCount: INVENTORY_LANES.length + 1, total: total, registers: registers };
}
function healthOptIn(title, description) {
  const t = String(title || "") + " " + String(description || "");
  const m = t.match(/probe_target\s*=\s*([A-Za-z0-9_.-]+)/i);
  const c2 = t.match(/probe_class\s*=\s*([a-z0-9_-]+)/i);
  if (!m && !c2) return null;
  if (!m) return { partial: true, missing: "probe_target" };
  if (!c2) return { partial: true, missing: "probe_class" };
  const c = t.match(/probe_class\s*=\s*([a-z0-9_-]+)/i);
  return { target: m[1], cls: (c ? c[1] : "").toLowerCase(), complete: true, partial: false };
}
async function probeHealthyViaLog(env, name, maxAgeMin) {
  const win = Number(maxAgeMin) > 0 ? Number(maxAgeMin) : 15;
  try {
    const row = await env.AUDIT.prepare("SELECT ok, status, ts, transport, source FROM fleet_probe_log WHERE name = ?1 ORDER BY id DESC LIMIT 1").bind(name).first();
    if (row && Number(row.ok) === 1) {
      const age = Date.now() - new Date(row.ts).getTime();
      if (age < win * 6e4) return { ok: true, via: "fleet_probe_log", ts: row.ts, status: row.status, transport: row.transport, source: row.source };
    }
  } catch (e) {
  }
  return null;
}
__name(probeHealthyViaLog, "probeHealthyViaLog");
async function probeHealth(name) {
  const hosts = [name + ".q08.workers.dev", name + ".qnfo.org"];
  for (const h of hosts) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT);
      const r = await fetch("https://" + h + "/health", { headers: { "User-Agent": "Mozilla/5.0 (qnfo-backlog-exec)" }, signal: ctl.signal });
      clearTimeout(timer);
      if (r.ok) return { ok: true, host: h, status: r.status, transport: "worker-same-zone" };
    } catch (e) {
    }
  }
  return { ok: false, host: null, status: 0, transport: "worker-same-zone" };
}
__name(probeHealth, "probeHealth");
async function sweepAdvisorNoise(env) {
  let closed = 0;
  const now = nowEpoch();
  try {
    const noise = await env.AUDIT.prepare("SELECT id, title, created_at FROM agent_issues WHERE status='open' AND title LIKE 'OPEN-ISSUES%' ORDER BY id").all();
    const rows = noise.results || [];
    for (const r of rows) {
      const ageMs = createdAgeMs(r.created_at, now);
      if (ageMs > 3 * 3600 * 1e3) {
        await closeIssue(env, r.id, now);
        closed++;
        await recordEvent(env, "job-run", "backlog-exec closed advisor-noise snapshot " + r.id + " (" + String(r.title || "").slice(0, 40) + "): superseded, age>3h", { id: r.id, action: "closed", reason: "advisor-noise sweep v1.2.6" }, WORKER, "ok");
      }
    }
  } catch (e) {
  }
  return closed;
}
__name(sweepAdvisorNoise, "sweepAdvisorNoise");
async function sweepIssueLedger(env) {
  let resolved = 0;
  const now = nowEpoch();
  const hours = Number(env.LEDGER_STALE_HOURS) > 0 ? Math.floor(Number(env.LEDGER_STALE_HOURS)) : 72;
  try {
    const stale = await env.AUDIT.prepare(
      "SELECT fingerprint, source, title, last_seen FROM issue_ledger WHERE status='open' AND julianday(last_seen) < julianday('now', ?1) ORDER BY last_seen LIMIT 500"
    ).bind("-" + hours + " hours").all();
    const rows = stale.results || [];
    for (const r of rows) {
      await env.AUDIT.prepare(
        "UPDATE issue_ledger SET status='resolved', resolved_at=?1, resolution_note=?2, updated_at=?1 WHERE fingerprint=?3 AND status='open'"
      ).bind(ts(), "auto-resolved v1.2.8: not re-seen in " + hours + "h (fingerprint PK - a recurrence would have advanced last_seen)", r.fingerprint).run();
      resolved++;
    }
    if (resolved > 0) {
      await recordEvent(env, "job-run", "backlog-exec resolved " + resolved + " stale issue_ledger fingerprint(s) (not re-seen in " + hours + "h)", { action: "issue_ledger-sweep", resolved, window_hours: hours }, WORKER, "ok");
    }
  } catch (e) {
    await recordEvent(env, "job-run", "backlog-exec issue_ledger sweep failed: " + String(e && e.message || e), { action: "issue_ledger-sweep", error: true }, WORKER, "error");
  }
  return resolved;
}
__name(sweepIssueLedger, "sweepIssueLedger");
async function sweepOpsJobs(env) {
  const out = { promoted: 0, failed: 0, strandedBefore: 0 };
  const staleMin = Number(env.OPS_JOB_STALE_MIN) > 0 ? Math.floor(Number(env.OPS_JOB_STALE_MIN)) : 30;
  const reapContinuing = String(env.OPS_JOB_REAP_CONTINUING || "1") !== "0";
  const statuses = reapContinuing ? "'running','continuing','queued'" : "'running','queued'";
  try {
    const stranded = await env.AUDIT.prepare(
      "SELECT COUNT(*) AS c FROM ops_jobs WHERE status IN ('running','continuing','queued') AND length(COALESCE(response,'')) > 0"
    ).first();
    out.strandedBefore = stranded ? Number(stranded.c || 0) : 0;
    const rows = await env.AUDIT.prepare(
      "SELECT id, status, updated_at, length(COALESCE(response,'')) AS rl FROM ops_jobs WHERE status IN (" + statuses + ") AND julianday(updated_at) < julianday('now', ?1) ORDER BY updated_at LIMIT 200"
    ).bind("-" + staleMin + " minutes").all();
    for (const r of rows.results || []) {
      if (Number(r.rl) > 0) {
        await env.AUDIT.prepare("UPDATE ops_jobs SET status='succeeded', updated_at=?1 WHERE id=?2 AND status IN (" + statuses + ")").bind(ts(), r.id).run();
        out.promoted++;
      } else {
        await env.AUDIT.prepare("UPDATE ops_jobs SET status='failed', error=COALESCE(error, ?1), updated_at=?2 WHERE id=?3 AND status IN (" + statuses + ")").bind("reaper v1.3.0 (INFERRED - no diagnostic was captured): no response within " + staleMin + "m of last write", ts(), r.id).run();
        out.failed++;
      }
    }
    if (out.promoted + out.failed > 0) {
      await recordEvent(env, "job-run", "backlog-exec reaped ops_jobs: promoted " + out.promoted + " stranded answer(s) to terminal, failed " + out.failed + " silent row(s) (idle>" + staleMin + "m)", { action: "ops-jobs-reap", promoted: out.promoted, failed: out.failed, stranded_before: out.strandedBefore, stale_min: staleMin }, WORKER, "ok");
    }
  } catch (e) {
    await recordEvent(env, "job-run", "backlog-exec ops_jobs reap failed: " + String(e && e.message || e), { action: "ops-jobs-reap", error: true }, WORKER, "error");
  }
  return out;
}
__name(sweepOpsJobs, "sweepOpsJobs");
async function run(env) {
  const MIN_AGE_MS = (Number(env.MIN_CLOSE_AGE_MIN) > 0 ? Number(env.MIN_CLOSE_AGE_MIN) : 30) * 6e4;
  const PROBE_WIN_MIN = Number(env.PROBE_LOG_MAX_AGE_MIN) > 0 ? Number(env.PROBE_LOG_MAX_AGE_MIN) : 15;
  const dodReconcile = await reconcileDodMirrors(env);
  const reopenedOnRegression = await recheckRecentCloses(env);
  const noiseClosed = await sweepAdvisorNoise(env);
  const ledgerResolved = await sweepIssueLedger(env);
  const jobsReaped = await sweepOpsJobs(env);
  const registers = await reconcileRegisters(env);
  const inventory = await openInventory(env);
  const rows = await env.AUDIT.prepare("SELECT id, title, description, source, category, priority, status, created_at, updated_at FROM agent_issues WHERE status='open' ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, updated_at ASC, id LIMIT ?1").bind(MAX_ROW).all();
  const items = rows.results || [];
  const now = nowEpoch();
  let closed = 0, rechecked = 0, escalated = 0;
  const detail = [];
  for (const row of items) {
    const title = String(row.title || "");
    const name = workerTarget(title + " " + String(row.description || ""));
    const isHealthAvailability = /\b(health|heartbeat|availability|unreachable|endpoint down|is down|down)\b/i.test(title);
    const optIn = healthOptIn(title, row.description);
    if (isHealthAvailability && !optIn) {
      rechecked++;
      detail.push({ id: row.id, action: "recheck", note: "legacy-unmarked health ticket (v1.5.0): no probe_target= opt-in marker, auto-close disabled" });
      continue;
    }
    if (optIn && optIn.partial) {
      escalated++;
      detail.push({ id: row.id, action: "escalate-partial-marker", note: "partial opt-in marker (missing " + optIn.missing + "); fail-closed" });
      continue;
    }
    if (optIn && !isHealthAvailability) {
      escalated++;
      detail.push({ id: row.id, action: "escalate-marker-non-health", note: "opt-in marker on a non-health ticket; auto-close refused" });
      continue;
    }
    if (optIn && isHealthAvailability && optIn.cls === "worker-process") {
      const ageMs = createdAgeMs(row.created_at, now);
      if (ageMs < MIN_AGE_MS) {
        rechecked++;
        detail.push({ id: row.id, target: optIn.target, action: "recheck", note: "too fresh to auto-close: age " + Math.round(ageMs / 6e4) + "m < " + Math.round(MIN_AGE_MS / 6e4) + "m" });
        continue;
      }
      const pLog = await probeHealthyViaLog(env, optIn.target, PROBE_WIN_MIN);
      const p = pLog ? { ok: true, host: pLog.via + " " + pLog.ts, transport: pLog.transport } : await probeHealth(optIn.target);
      if (p.ok && transportTrusted(p.transport)) {
        await closeIssue(env, row.id, now, optIn.target);
        closed++;
        detail.push({ id: row.id, target: optIn.target, action: "closed", note: "health re-probe PASS " + p.host + " transport=" + p.transport + " (fresh<=" + PROBE_WIN_MIN + "m, age>" + Math.round(MIN_AGE_MS / 6e4) + "m)" });
        await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (" + optIn.target + "): " + p.host + " transport=" + p.transport, { id: row.id, target: optIn.target, action: "closed", reason: "health predicate v1.5.0: opt-in + fresh + trusted transport", transport: p.transport }, WORKER, "ok");
        continue;
      }
      escalated++;
      detail.push({ id: row.id, target: optIn.target, action: "escalate", note: "no close-authorizing evidence (ok=" + p.ok + ", transport=" + (p.transport || "none") + "): same-zone/binding evidence cannot authorize a close" });
      continue;
    }
    // BACKLOG-EXEC-EVIDENCE-1: see exceptionRecurrence. A detector issue that is not proven recovered falls through to the
    // other predicates (a verified remediation can still close it) and is rechecked with the measured reason.
    const exc = !isHealthAvailability ? exceptionTarget(title) : { detector: false };
    let excNote = null;
    if (exc.detector) {
      const ageMs = createdAgeMs(row.created_at, now);
      if (!exc.target) excNote = "exception-class: '" + String(exc.named || "").slice(0, 40) + "' names no worker, so no recurrence can be measured";
      else if (ageMs <= 24 * 3600 * 1e3) excNote = "exception-class: under 24h old";
      else {
        let rec, pr;
        try {
          rec = await exceptionRecurrence(env, exc.target, now - ageMs);
          pr = rec.ok ? await exceptionProbe(env, exc.target) : null;
        } catch (e) {
          rec = { ok: false, why: "recurrence query failed: " + String(e && e.message || e).slice(0, 160) };
        }
        if (rec.ok && pr && pr.ok) {
          const evidence = "BACKLOG-EXEC-EVIDENCE-1 (" + VERSION + ") exception-class closed on evidence: " + rec.ev + "; " + pr.ev;
          await closeIssue(env, row.id, now, exc.target, evidence);
          closed++;
          detail.push({ id: row.id, target: exc.target, action: "closed", note: evidence.slice(0, 400) });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (" + exc.target + "): exception-class closed on evidence", { id: row.id, target: exc.target, action: "closed", reason: "BACKLOG-EXEC-EVIDENCE-1: errors stopped and probe passed" }, WORKER, "ok");
          continue;
        }
        excNote = "exception-class " + exc.target + " not closed: " + (rec.ok ? "errors stopped (" + rec.ev + ") but " + (pr ? pr.ev : "no probe") : rec.why);
      }
    }
    const isModelHealth = /^MODEL-DEGRADED\b/i.test(title);
    if (isModelHealth) {
      try {
        const dg = await env.AUDIT.prepare("SELECT model_id FROM ai_model_health WHERE status='degraded'").all();
        const degraded = new Set((dg.results || []).map((d) => String(d.model_id)));
        const named = title.replace(/^MODEL-DEGRADED\s*/i, "").split(",").map((s) => s.trim()).filter(Boolean);
        const still = named.filter((m) => degraded.has(m));
        if (degraded.size === 0 || still.length === 0) {
          await closeIssue(env, row.id, now);
          closed++;
          detail.push({ id: row.id, action: "closed", note: "model-health stale: none of [" + named.slice(0, 4).join(",") + "] degraded now (degraded rows=" + degraded.size + ")" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (model-health): no named model degraded now", { id: row.id, action: "closed", reason: "model-health predicate cleared v1.2.7" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, action: "recheck", note: "model-health STILL degraded: " + still.join(",") });
        continue;
      } catch (e) {
      }
    }
    const probeFail = title.match(/^\[ai-cal\]\s+model probe failing:\s*(\S+)/i);
    if (probeFail) {
      try {
        const model = probeFail[1];
        const h = await env.AUDIT.prepare("SELECT status FROM ai_model_health WHERE model_id=?1").bind(model).first();
        if (!h || String(h.status) !== "degraded") {
          await closeIssue(env, row.id, now);
          closed++;
          detail.push({ id: row.id, target: model, action: "closed", note: "ai-cal probe-failing stale: ai_model_health status=" + (h ? h.status : "absent") });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (ai-cal " + model + "): health no longer degraded", { id: row.id, target: model, action: "closed", reason: "ai-cal probe predicate cleared v1.2.7" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, target: model, action: "recheck", note: "ai-cal probe STILL failing: " + model });
        continue;
      } catch (e) {
      }
    }
    const gwFail = title.match(/^\[gw-fail\]\s+(\d+)\s+(\S+)/);
    if (gwFail) {
      try {
        const model = gwFail[2];
        const rec = await env.AUDIT.prepare("SELECT COALESCE(SUM(count),0) AS n FROM ai_gateway_failures WHERE model=?1 AND ts >= ((strftime('%s','now') - 86400) * 1000)").bind(model).first();
        const n = rec ? Number(rec.n || 0) : 0;
        if (n === 0) {
          await closeIssue(env, row.id, now);
          closed++;
          detail.push({ id: row.id, target: model, action: "closed", note: "gw-fail stale: 0 failures for " + model + " in 24h" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (gw-fail " + model + "): no recurrence in 24h", { id: row.id, target: model, action: "closed", reason: "gateway-failure predicate cleared v1.2.7" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, target: model, action: "recheck", note: "gateway failures CURRENT: " + n + "/24h - real defect, root fix pending" });
        continue;
      } catch (e) {
      }
    }
    const vq = title.match(/version_queue\s+id=(\d+)/i);
    if (vq) {
      try {
        const q = await env.AUDIT.prepare("SELECT status, version_to, updated_at FROM version_queue WHERE id=?1").bind(Number(vq[1])).first();
        if (!q || String(q.status).toLowerCase() !== "error") {
          await closeIssue(env, row.id, now);
          closed++;
          detail.push({ id: row.id, target: "version_queue#" + vq[1], action: "closed", note: q ? "version_queue status=" + q.status + " (not error) - condition cleared" : "version_queue row absent - ticket orphaned" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (VQ " + vq[1] + "): " + (q ? "status=" + q.status : "row absent"), { id: row.id, action: "closed", reason: "zenodo-publish predicate cleared v1.2.9" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, target: "version_queue#" + vq[1], action: "recheck", note: "version_queue STILL error (v" + (q.version_to || "?") + ", updated " + q.updated_at + ")" });
        continue;
      } catch (e) {
      }
    }
    if (/^TERMINAL research failure\b/i.test(title)) {
      try {
        const t = await env.AUDIT.prepare("SELECT COUNT(*) AS c FROM research_queue WHERE status='failed' AND recover_count>=2").first();
        const still = t ? Number(t.c || 0) : 0;
        if (still === 0) {
          await closeIssue(env, row.id, now);
          closed++;
          detail.push({ id: row.id, action: "closed", note: "research terminal condition cleared: 0 rows with status='failed' AND recover_count>=2" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (research): no terminal-failed queue rows remain", { id: row.id, action: "closed", reason: "research-pipeline predicate cleared v1.2.9" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, action: "recheck", note: "research terminal condition STILL present: " + still + " queue row(s) status='failed' AND recover_count>=2" });
        continue;
      } catch (e) {
      }
    }
    // VERIFIED-REMEDIATION-CLOSURE-1 (issue #1281 DRAIN-CLOSURE-PREDICATE-TYPE-ERROR):
    // every predicate above is a liveness/heartbeat predicate, so semantic
    // defects (correctness/security/email/dissemination/publication/procedure)
    // could never close. The "defect absence" predicate is a fresh
    // remediation_verifications row with pass=1: a re-probe that verified the
    // fix. Close those here (RE-FALSIFICATION-CLOSED-GATE-1).
    {
      let vr = null;
      try {
        vr = await env.AUDIT.prepare(
          "SELECT probe_url, transport, observed FROM remediation_verifications WHERE issue_id=?1 AND pass=1 AND verified_at >= datetime('now','-7 days') ORDER BY id DESC LIMIT 1"
        ).bind(row.id).first();
      } catch (e) {}
      if (vr) {
        await closeIssue(env, row.id, now);
        closed++;
        detail.push({ id: row.id, action: "closed", note: "verified-remediation closure (re-probe pass): " + (vr.probe_url || "probe") + " via " + (vr.transport || "?") });
        await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (verified remediation pass=1)", { id: row.id, action: "closed", reason: "verified-remediation-closure v1.8.0", probe: vr.probe_url, transport: vr.transport }, WORKER, "ok");
        continue;
      }
    }
    await env.AUDIT.prepare("UPDATE agent_issues SET updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
    rechecked++;
    detail.push(excNote ? { id: row.id, title: title.slice(0, 60), target: exc.target || null, action: "recheck", note: excNote.slice(0, 400) } : { id: row.id, title: title.slice(0, 60), action: "recheck", note: name ? "probe target " + name : "no probe target" });
  }
  const summary = { registers, inventory, noiseClosed, ledgerResolved, jobsReaped, processed: items.length, closed, rechecked, escalated, detail: detail.slice(0, MAX_ROW) };
  if (escalated > 0) await alert(env, WORKER, "warning", "backlog-exec: " + escalated + " health issue(s) still failing: " + detail.filter((d) => d.action === "escalate").map((d) => d.target).join(", "));
  await recordEvent(env, "job-run", "backlog-exec " + JSON.stringify({ noiseClosed, ledgerResolved, jobsReaped, processed: items.length, closed, rechecked, escalated }), { exceptionRule: "BACKLOG-EXEC-EVIDENCE-1", version: VERSION, noiseClosed, ledgerResolved, jobsReaped, processed: items.length, closed, rechecked, escalated }, WORKER, "ok");
  return { status: "ok", notes: summary };
}
__name(run, "run");
var worker_default = {
  async scheduled(event, env, ctx) {
    if (env.FLEET_FEED) {
      try {
        var fr = await env.FLEET_FEED.fetch("https://qnfo-fleet-feed.q08.workers.dev/feed/self?worker=qnfo-backlog-exec");
        if (fr.ok) {
          var fd = await fr.json();
          var actionable = (fd.findings || []).filter(function(f) {
            return f.auto_action && f.severity_int >= 2 && f.category && !f.category.startsWith("backlog/");
          }).slice(0, 10);
          for (var af of actionable) {
            var sql = af.auto_action;
            if (sql && /^(UPDATE|INSERT|DELETE)/i.test(sql.trim())) {
              try {
                await env.AUDIT.prepare(sql).run();
              } catch (e2) {
              }
            }
            try {
              await env.AUDIT.prepare(
                "INSERT OR IGNORE INTO self_heal_actions (kind, ref, action, ts, status, verified_at) VALUES (?,?,?,datetime('now'),'executed',datetime('now'))"
              ).bind("feed-auto-exec", af.id, (af.auto_action || "").slice(0, 500)).run();
            } catch (e3) {
            }
          }
        }
      } catch (eFeed) {
      }
    }
    try {
      const out = await run(env);
      console.log("backlog-exec", JSON.stringify(out));
    } catch (e) {
      console.error("backlog-exec", String(e && e.message || e));
      await alert(env, WORKER, "error", "run failed: " + String(e && e.message || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const open = await env.AUDIT.prepare("SELECT COUNT(*) c FROM agent_issues WHERE status='open'").first().catch(() => null);
      const led = await env.AUDIT.prepare("SELECT COUNT(*) c FROM issue_ledger WHERE status='open'").first().catch(() => null);
      const stranded = await env.AUDIT.prepare("SELECT COUNT(*) c FROM ops_jobs WHERE status IN ('running','continuing','queued') AND length(COALESCE(response,'')) > 0").first().catch(() => null);
      // HEALTH-PROBE-BUDGET-1 (2026-09-29): /health MUST stay cheap. This handler used to
      // run the full 14-lane inventory scan, which on a cold isolate exceeded the
      // 5s AbortController budget in qnfo-ops probeService() -> AbortError -> backlog_status
      // and fleet_status both reported this worker as "timeout" while it was in fact
      // healthy (curl http=200 in 1.6s). That false negative auto-filed agent_issues 1368.
      // The full inventory is served by the separate /inventory route.
      return json({ ok: true, worker: WORKER, version: VERSION, capabilities: ["backlog-inventory", "issue-drain", "stranded-job-recovery"], limitations: ["POST /run needs RUN_TOKEN or the qnfo-ops service binding (backlog.internal)", "the drain runs on the daily 01:10 cron", "/health reports counts only; the full inventory is GET /inventory"], openBacklog: open ? open.c : -1, openLedger: led ? led.c : -1, strandedOpsJobs: stranded ? stranded.c : -1, openIssuesTotal: open ? open.c : -1 });
    }
    if (url.pathname === "/inventory") {
      return json({ ok: true, worker: WORKER, version: VERSION, inventory: await openInventory(env) });
    }
    if (url.pathname === "/run" && request.method === "POST") {
      const runTok = env.RUN_TOKEN;
      const authH = request.headers.get("Authorization") || "";
      // INTERNAL-SERVICE-BINDING-AUTH-1 (2026-09-27): qnfo-ops calls this endpoint over the
      // BACKLOG service binding as https://backlog.internal/run and holds no RUN_TOKEN
      // binding, so the Bearer-only gate returned 401 on every drain attempt. Internal
      // service-binding calls never leave Cloudflare and never carry CF-Connecting-IP;
      // client-originated calls always do. Bearer remains supported and preferred.
      const internalCall = url.hostname === "backlog.internal" && !request.headers.get("CF-Connecting-IP");
      if (runTok && authH === "Bearer " + runTok) {
        // authorized: shared run token
      } else if (internalCall) {
        // authorized: internal service-binding caller
      } else if (!runTok) {
        return json({ error: "run endpoint disabled: RUN_TOKEN unset" }, 503);
      } else {
        return json({ error: "unauthorized" }, 401);
      }
      const out = await run(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out });
    }
    return json({ error: "not found" }, 404);
  }
};
return worker_default;
})();
function backlogEnv(env) { var e = Object.assign({}, env, { AUDIT: env.QNFO_AUDIT }); delete e.FLEET_FEED; return e; }
function backlogMemberCall(ctx) { var p = ctx && ctx.props; return !!(p && p.member === BACKLOG_MEMBER && /^qnfo-[a-z0-9-]{1,60}$/.test(String(p.caller || ""))); }
function backlogDue(event) { var at = Number(event && event.scheduledTime) || Date.now(); return !!event && event.cron === TICK_CRON && !event.tickEntry && new Date(at).getUTCHours() === 2; }
// ---- BACKLOG-FOLD-1:END ----
var worker_default = {
  async fetch(request, env, ctx) {
    if (backlogMemberCall(ctx)) return backlogMod.fetch(request, backlogEnv(env), ctx);
    const u = new URL(request.url), p = u.pathname;
    if (p === "/backlog/health" && request.method === "GET") return backlogMod.fetch(new Request(new URL("/health", u)), backlogEnv(env), ctx);
    const origin = request.headers.get("Origin") || "https://qnfo.org";
    const h = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (p === "/health") return health(env, origin);
    if (p === "/status") return handleStatus(env, origin);
    // LIFECYCLE-RUN-INTERNAL-1 (2026-10-01, charter H0, #1735 sweep): every /run/* route was anonymous. GET /run/secrets-audit
    // returned the secret NAMES of every worker in the account (read with this worker's CF_API_TOKEN), /run/backup wrote a
    // full D1 export to R2 per call, and /run/memory-maintain?commit=1 mutated agent memory. No worker or script calls these
    // routes (qnfo-ops binds this worker for /health only); the crons do the work. They now answer only an internal caller
    // authenticated by service-binding props (ctx.props.caller, settable only by a deployer of the caller).
    if (p.startsWith("/run/")) {
      const caller = ctx && ctx.props && typeof ctx.props.caller === "string" ? ctx.props.caller : "";
      if (!/^qnfo-[a-z0-9-]{1,60}$/.test(caller)) return new Response(JSON.stringify({ error: "forbidden: /run/* is internal only (LIFECYCLE-RUN-INTERNAL-1); the crons run this work" }), { status: 403, headers: h });
    }
    if (p === "/run/drift") return handleDrift(env, origin);
    if (p === "/run/backup") return handleBackup(env, origin);
    if (p === "/run/secrets-audit") return handleSecretsAudit(env, origin);
    if (p === "/run/ula-check") return handleUlaCheck(env, origin);
    if (p === "/run/memory-maintain") return handleMemoryMaintain(request, env, origin);
    if (p === "/run/metrics-refresh") return handleMetricsRefresh(env, origin);
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: h });
  },
  async scheduled(event, env, ctx) {
    if (backlogDue(event)) await backlogMod.scheduled(event, backlogEnv(env), ctx).catch(function (e) { console.error("backlog member: " + String(e && e.message || e)); });
    return cronTickDispatch(event, async function (event) {
    const cron = event.cron;
    console.log("[qnfo-lifecycle] cron triggered:", cron);
     try { await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?, ?, ?, 1)").bind("qnfo-lifecycle", QNFO_VERSION, new Date().toISOString()).run(); } catch (e) {}
    try {
      // CRON-CONSOLIDATE-1 (2026-09-27 fleet reorg): the four lightweight daily D1 audit/
      // maintenance tasks (lifecycle, memory-maintain, ula-check, drift-audit) now share ONE
      // daily fire at 03:00 instead of four separate crons. This also FIXES a latent bug: the
      // drift-audit branch keyed on "0 6 * * *" while the trigger was registered as
      // "9 6 * * *" -> runDriftAudit never ran. Backup stays on its own cron (heavy).
      if (cron === "0 3 * * *") {
        await runLifecycle(env);
        await runMemoryMaintain(env, { commit: true });
        await runUlaCheck(env);
        await runDriftAudit(env);
      }
      else if (cron === "0 0 1 * *") await runGraphSeed(env);
      else if (cron === "0 5 * * *") await runBackup(env);
      else if (cron === "0 8 * * 1") await runSecretsAudit(env);
      else if (cron === "0 * * * *") { await runSync(env); await runMetricFreshness(env); await runPing(env); } // LIFECYCLE-PING-DEAD-1 (#1810): runPing folded onto the single live hourly trigger
    } catch (e) {
      console.error("[qnfo-lifecycle] cron error:", e.message);
    }
    });
  }
};
function health(env, origin) {
  const h = corsHeaders(origin);
  return new Response(JSON.stringify({
    status: "ok",
    worker: "qnfo-lifecycle",
    version: QNFO_VERSION,
    cronSchedules: 5,
    capabilities: ["lifecycle-scan", "graph-seed", "d1-backup", "drift-audit", "secrets-audit", "registry-sync", "ula-check", "memory-maintain", "metric-freshness"],
    limitations: ["/run/* answers only internal service-binding callers (props); public callers get 403", "work runs on its crons: hourly registry sync, daily 03:00 maintenance, 05:00 backup, Monday 08:00 secrets audit, monthly graph seed", "the secrets audit reads secret names only, never values"],
    features: ["lifecycle-scan", "graph-seed", "backup", "drift-audit-enhanced", "secrets-audit-enhanced", "registry-sync", "infra-ping", "ula-check", "memory-maintain", "metric-freshness"],
    bindings: { d1: ["qnfo-audit", "qnfo-graph", "portfolio-state", "living-paper", "ipatent-db"], r2: ["qnfo", "qnfo-audit", "qnfo-backups"] }
  }), { headers: h });
}
__name(health, "health");
__name2(health, "health");
__name22(health, "health");
__name222(health, "health");
__name2222(health, "health");
__name22222(health, "health");
__name222222(health, "health");
async function handleStatus(env, origin) {
  const h = corsHeaders(origin);
  try {
    const project = await env.PORTFOLIO_STATE.prepare("SELECT COUNT(*) as total FROM resources WHERE type='project'").first();
    const audit = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) as total FROM audit_sessions").first();
    return new Response(JSON.stringify({
      status: "ok",
      projects: project?.total || 0,
      auditSessions: audit?.total || 0,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: h });
  }
}
__name(handleStatus, "handleStatus");
__name2(handleStatus, "handleStatus");
__name22(handleStatus, "handleStatus");
__name222(handleStatus, "handleStatus");
__name2222(handleStatus, "handleStatus");
__name22222(handleStatus, "handleStatus");
__name222222(handleStatus, "handleStatus");
async function handleDrift(env, origin) {
  const result = await runDriftAudit(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleDrift, "handleDrift");
__name2(handleDrift, "handleDrift");
__name22(handleDrift, "handleDrift");
__name222(handleDrift, "handleDrift");
__name2222(handleDrift, "handleDrift");
__name22222(handleDrift, "handleDrift");
__name222222(handleDrift, "handleDrift");
async function handleSecretsAudit(env, origin) {
  const result = await runSecretsAudit(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleSecretsAudit, "handleSecretsAudit");
__name2(handleSecretsAudit, "handleSecretsAudit");
__name22(handleSecretsAudit, "handleSecretsAudit");
__name222(handleSecretsAudit, "handleSecretsAudit");
__name2222(handleSecretsAudit, "handleSecretsAudit");
__name22222(handleSecretsAudit, "handleSecretsAudit");
__name222222(handleSecretsAudit, "handleSecretsAudit");
async function handleBackup(env, origin) {
  const result = await runBackup(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleBackup, "handleBackup");
__name2(handleBackup, "handleBackup");
__name22(handleBackup, "handleBackup");
__name222(handleBackup, "handleBackup");
__name2222(handleBackup, "handleBackup");
__name22222(handleBackup, "handleBackup");
__name222222(handleBackup, "handleBackup");
async function handleUlaCheck(env, origin) {
  const result = await runUlaCheck(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleUlaCheck, "handleUlaCheck");
__name2(handleUlaCheck, "handleUlaCheck");
__name22(handleUlaCheck, "handleUlaCheck");
__name222(handleUlaCheck, "handleUlaCheck");
__name2222(handleUlaCheck, "handleUlaCheck");
__name22222(handleUlaCheck, "handleUlaCheck");
__name222222(handleUlaCheck, "handleUlaCheck");
async function runUlaCheck(env) {
  console.log("[lifecycle] running ULA health check...");
  var result = {
    status: "ula-checked",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    locations: {},
    findings: [],
    verdict: "HEALTHY"
  };
  var ULA_LOCATIONS = [
    { name: "legal.qnfo.org", url: "https://legal.qnfo.org/" },
    { name: "qnfo.org/legal/license", url: "https://qnfo.org/legal/license" },
    { name: "qwav.tech/legal/license", url: "https://qwav.tech/legal/license" }
  ];
  var CORRUPTION_PATTERNS = [
    { name: "th-ligature", regex: /\uFB05|\uFB06/g, desc: "Th/ff fi/fl ligatures" },
    { name: "Misplaced-ampersand", regex: /Misplaced &/g, desc: "Broken MathJax placeholder" },
    { name: "MathJax-unicode-range", regex: /[\uD835][\uDC00-\uDFFF]/g, desc: "MathJax Unicode surrogate pairs" }
  ];
  var EXPECTED_MIN_SIZE = 64e3;
  for (var i = 0; i < ULA_LOCATIONS.length; i++) {
    var loc = ULA_LOCATIONS[i];
    try {
      var resp = await fetch(loc.url, { method: "GET", headers: { "User-Agent": "qnfo-lifecycle-ula-check/1.4" } });
      var body = await resp.text();
      var byteSize = new TextEncoder().encode(body).length;
      var locResult = { url: loc.url, httpStatus: resp.status, byteSize, ok: resp.status === 200 && byteSize >= EXPECTED_MIN_SIZE };
      var detectedPatterns = [];
      for (var p = 0; p < CORRUPTION_PATTERNS.length; p++) {
        var pat = CORRUPTION_PATTERNS[p];
        var matches = body.match(pat.regex);
        if (matches && matches.length > 0) {
          detectedPatterns.push({ pattern: pat.name, count: matches.length, desc: pat.desc });
        }
      }
      if (detectedPatterns.length > 0) {
        locResult.corruptionDetected = detectedPatterns;
        locResult.ok = false;
        result.findings.push("CORRUPTION at " + loc.name + ": " + detectedPatterns.map(function(d) {
          return d.pattern + "(" + d.count + ")";
        }).join(", "));
      }
      if (resp.status !== 200) result.findings.push("HTTP " + resp.status + " at " + loc.name);
      if (byteSize < EXPECTED_MIN_SIZE) result.findings.push("SIZE anomaly at " + loc.name + ": " + byteSize + " bytes");
      if (!body.includes("QNFO-ULA")) {
        result.findings.push("CONTENT mismatch at " + loc.name);
        locResult.ok = false;
      }
      result.locations[loc.name] = locResult;
    } catch (e) {
      result.locations[loc.name] = { url: loc.url, error: e.message, ok: false };
      result.findings.push("FETCH FAILED at " + loc.name + ": " + e.message);
    }
  }
  var allOk = Object.values(result.locations).every(function(l) {
    return l.ok;
  });
  result.verdict = allOk ? "HEALTHY" : "DEGRADED";
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("ula-check-" + Date.now(), "qnfo-lifecycle-ula-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), allOk ? 1 : 0, 1, "ULA check: " + result.verdict).run();
  } catch (e) {
    console.error("[lifecycle] ula-check audit log error:", e.message);
  }
  return result;
}
__name(runUlaCheck, "runUlaCheck");
__name2(runUlaCheck, "runUlaCheck");
__name22(runUlaCheck, "runUlaCheck");
__name222(runUlaCheck, "runUlaCheck");
__name2222(runUlaCheck, "runUlaCheck");
__name22222(runUlaCheck, "runUlaCheck");
__name222222(runUlaCheck, "runUlaCheck");
// METRIC-FRESHNESS-WRITER-1 (issue #1301, 2026-09-29): qnfo-audit.metric_registry
// declared 24 metrics with cadences as tight as */15 and NO writer existed anywhere in the
// repo. Measured 2026-09-29: 9 metrics last_refreshed IS NULL, 15 stale 42.6-74.6h. This
// auditor never invents a value -- it stamps last_value/last_refreshed only for metrics
// whose source table is bound here, classifies every other metric against its OWN declared
// refresh_cadence, and files one deduplicated agent_issue so staleness cannot stay silent.
// METRIC-CADENCE-UNITS-1 (2026-10-05, #1865): "*/3h" was read as 3 minutes (inbound_unactioned_72h "180m stale vs 3m
// cadence") and "2h" did not parse (seven q08 metrics "cadence unparsed"). "*/N" and "N" take an optional m, h or d unit;
// a bare "*/N" stays minutes (the cron-minute form the */15 metrics use).
function metricCadenceMinutes(cadence) {
  if (!cadence) return null;
  var c = String(cadence).trim();
  var unit = { m: 1, h: 60, d: 1440 };
  var m = c.match(/^\*\/(\d+)\s*([mhd])?$/i);
  if (m) return parseInt(m[1], 10) * unit[(m[2] || "m").toLowerCase()];
  var m2 = c.match(/^(\d+)\s*([mhd])$/i);
  if (m2) return parseInt(m2[1], 10) * unit[m2[2].toLowerCase()];
  if (c === "hourly") return 60;
  if (c === "daily") return 1440;
  if (c === "weekly") return 10080;
  if (c === "monthly") return 43200;
  return null;
}
async function runMetricFreshness(env) {
  var nowMs = Date.now();
  var nowIso = new Date(nowMs).toISOString();
  var out = { status: "metric-freshness", timestamp: nowIso, total: 0, fresh: 0, stale: 0, never: 0, unparsed_cadence: 0, undefined: 0, undefined_metrics: [], unmeasured: 0, unmeasured_metrics: [], worst: null, refreshed: [], filed_issue: false, updated_issue: false };
  var rows = [];
  try {
    var res = await env.QNFO_AUDIT.prepare("SELECT metric, refresh_cadence, last_refreshed, state FROM metric_registry").all();
    rows = res.results || [];
  } catch (e) {
    out.error = "metric_registry read failed: " + e.message;
    return out;
  }
  out.total = rows.length;
  var offenders = [];
  var worstAge = -1, worstMetric = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    // METRIC-UNDEFINED-CLASS-1 (2026-09-30, #1411): a metric in state UNDEFINED has no agreed formula, so no writer can
    // ever refresh it; counting it as "stale" kept this ticket open forever for a definition gap, not a freshness gap.
    // Report it in its own class (undefined_metrics) and keep it out of the staleness verdict.
    if (String(r.state || "").toUpperCase() === "UNDEFINED") {
      out.undefined++;
      out.undefined_metrics.push(r.metric);
      continue;
    }
    // METRIC-UNMEASURED-CLASS-1 (2026-10-05, #1865): a metric whose owner declares it UNMEASURED (or n/a) and that has never
    // had a reading (ask_helpful_rate_30d below 10 ratings, the q08 panel metrics, paper_math_browser_fail_pages) is a
    // measurement gap, not a stale writer; it is reported in its own class, like UNDEFINED. Once a writer stamps it, the
    // row is judged on its cadence like any other.
    if (!r.last_refreshed && /^(unmeasured|n\/a)$/i.test(String(r.state || "").trim())) {
      out.unmeasured++;
      out.unmeasured_metrics.push(r.metric);
      continue;
    }
    var cad = metricCadenceMinutes(r.refresh_cadence);
    if (cad === null) {
      out.unparsed_cadence++;
      offenders.push(r.metric + " (cadence unparsed: " + r.refresh_cadence + ")");
      continue;
    }
    if (!r.last_refreshed) {
      out.never++;
      offenders.push(r.metric + " (never refreshed)");
      continue;
    }
    var raw = String(r.last_refreshed);
    var t = Date.parse(raw.indexOf("T") >= 0 ? raw : raw.replace(" ", "T") + "Z");
    if (isNaN(t)) { out.unparsed_cadence++; continue; }
    var ageMin = (nowMs - t) / 60000;
    if (ageMin > cad * 2) {
      out.stale++;
      offenders.push(r.metric + " (" + Math.round(ageMin) + "m stale vs " + cad + "m cadence)");
      if (ageMin > worstAge) { worstAge = ageMin; worstMetric = r.metric; }
    } else {
      out.fresh++;
    }
  }
  if (worstMetric) out.worst = { metric: worstMetric, age_minutes: Math.round(worstAge) };
  try {
    var oi = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM agent_issues WHERE status = 'open'").first();
    if (oi) {
      await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(oi.c == null ? 0 : oi.c), nowIso, "MEASURED", "open_agent_issues").run();
      out.refreshed.push("open_agent_issues");
    }
  } catch (e) { out.refresh_error_open_issues = e.message; }
  // ONE-WORKER-COUNT-1 (1.8.1, transformation lever T5.10): worker_count is written by qnfo-fleet-control budgetAudit from the
  // live Cloudflare scripts census, the same read that writes fleet_budget.workers; this tick no longer writes it from
  // COUNT(service_registry), which counted every row whatever its state (32 against 31 live scripts on 2026-10-06) and made
  // the two readers disagree every hour. worker_count_disagreement (qnfo-fleet-control) names the odd ones out.
  // RESEARCH-METRICS-WRITER-1 (2026-10-01, agent_issues #1742): publications_30d and full_reports_live_30d
  // (registry formulas over living-paper.papers) and indexed_surface (<loc> count of the papers.qnfo.org sitemap)
  // had no writer anywhere in the fleet: their last values were written by hand on 2026-09-29 17:18Z and went
  // stale against a daily cadence while this auditor filed the ticket every hour. Same rule as the two writers
  // above: recompute from the registry's own source of truth, never invent; a source that cannot be read this
  // cycle is left untouched and reported in refresh_error_*.
  try {
    if (!env.LIVING_PAPER) throw new Error("no LIVING_PAPER binding");
    var pub = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM papers WHERE status = 'published' AND created_at >= datetime('now','-30 day')").first();
    var full = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM papers WHERE status = 'published' AND length(COALESCE(body_md,'')) >= 5000 AND created_at >= datetime('now','-30 day')").first();
    if (pub && pub.c != null) {
      await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(pub.c), nowIso, "MEASURED", "publications_30d").run();
      out.refreshed.push("publications_30d");
    }
    if (full && full.c != null) {
      await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(full.c), nowIso, "MEASURED", "full_reports_live_30d").run();
      out.refreshed.push("full_reports_live_30d");
    }
  } catch (e) { out.refresh_error_publications = e.message; }
  try {
    var sm = await fetch("https://papers.qnfo.org/sitemap.xml", { headers: { "User-Agent": "qnfo-lifecycle/" + QNFO_VERSION }, signal: AbortSignal.timeout(15000) });
    if (!sm.ok) throw new Error("sitemap http " + sm.status);
    var locs = ((await sm.text()).match(/<loc>/g) || []).length;
    if (locs <= 0) throw new Error("sitemap carries no <loc> entries");
    await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(locs), nowIso, "MEASURED", "indexed_surface").run();
    out.refreshed.push("indexed_surface");
  } catch (e) { out.refresh_error_indexed_surface = e.message; }
  var remaining = out.stale + out.never + out.unparsed_cadence;
  var stTitle = "METRIC-REGISTRY-STALENESS-1: metric_registry rows exceed their declared refresh cadence";
  if (remaining === 0) {
    // METRIC-STALENESS-SELF-CLOSE-1 (2026-09-30): the auditor could FILE and UPDATE its ticket but never close it, so
    // even a fully fresh registry left #1411 open. Close on positive evidence (this run's own verdict), writing
    // issue_triage.close_evidence first as the qnfo-audit close trigger requires.
    try {
      var ox = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND title = ? LIMIT 1").bind(stTitle).first();
      if (ox && ox.id) {
        var evd = "qnfo-lifecycle/" + QNFO_VERSION + " at " + nowIso + ": 0 stale / 0 never / 0 unparsed of " + out.total + " metrics (" + out.fresh + " fresh" + (out.undefined ? ", " + out.undefined + " UNDEFINED excluded: " + out.undefined_metrics.join(",") : "") + (out.unmeasured ? ", " + out.unmeasured + " never-measured UNMEASURED excluded: " + out.unmeasured_metrics.join(",") : "") + ")";
        await env.QNFO_AUDIT.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, close_evidence) VALUES (?1, 'METRIC-STALENESS-SELF-CLOSE-1', 'resolved', 'qnfo-lifecycle', datetime('now'), 'auditor verdict: registry fresh', ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence, triage_state='resolved'").bind(ox.id, evd).run();
        await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET status='resolved', close_channel='lifecycle-metric-freshness', updated_at=? WHERE id=? AND status='open'").bind(nowMs, ox.id).run();
        out.closed_issue = ox.id;
      }
    } catch (e) { out.close_error = e.message; }
  }
  if (remaining > 0) {
    var title = "METRIC-REGISTRY-STALENESS-1: metric_registry rows exceed their declared refresh cadence";
    var desc = remaining + "/" + out.total + " metrics not fresh at " + nowIso + " :: " + offenders.slice(0, 40).join("; ") + (out.undefined ? " || excluded as UNDEFINED (definition gap, not staleness): " + out.undefined_metrics.join(", ") : "") + (out.unmeasured ? " || awaiting a first reading (state UNMEASURED or n/a, never refreshed; a measurement gap, not staleness): " + out.unmeasured_metrics.join(", ") : "");
    try {
      var ex = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND title = ? LIMIT 1").bind(title).first();
      if (ex && ex.id) {
        await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET description = ?, updated_at = ? WHERE id = ?").bind(desc, nowMs, ex.id).run();
        out.updated_issue = true;
      } else {
        await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(title, desc, "qnfo-lifecycle-metric-freshness", "observability", "high", "open", nowMs, nowMs).run();
        out.filed_issue = true;
      }
    } catch (e) { out.issue_error = e.message; }
  }
  return out;
}
async function handleMetricsRefresh(env, origin) {
  var result = await runMetricFreshness(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
async function runLifecycle(env) {
  console.log("[lifecycle] scanning inactive projects...");
  try {
    var now = /* @__PURE__ */ new Date();
    var res = await env.PORTFOLIO_STATE.prepare("SELECT id, name, status, updated_at FROM resources WHERE type='project'").all();
    var staleCount = 0, archivedCount = 0;
    for (var i = 0; i < (res.results || []).length; i++) {
      var r = res.results[i];
      if (!r.updated_at) continue;
      var days = (now.getTime() - new Date(r.updated_at).getTime()) / 864e5;
      var newStatus = r.status;
      if (days >= 180) newStatus = "ARCHIVED";
      else if (days >= 90) newStatus = "STALE";
      else newStatus = "ACTIVE";
      if (newStatus !== r.status) {
        await env.PORTFOLIO_STATE.prepare("UPDATE resources SET status=?, updated_at=updated_at WHERE id=?").bind(newStatus, r.id).run();
        if (newStatus === "STALE") staleCount++;
        if (newStatus === "ARCHIVED") archivedCount++;
      }
    }
    console.log("[lifecycle] transitions: " + staleCount + " -> STALE, " + archivedCount + " -> ARCHIVED");
  } catch (e) {
    console.error("[lifecycle] runLifecycle error:", e.message);
  }
}
__name(runLifecycle, "runLifecycle");
__name2(runLifecycle, "runLifecycle");
__name22(runLifecycle, "runLifecycle");
__name222(runLifecycle, "runLifecycle");
__name2222(runLifecycle, "runLifecycle");
__name22222(runLifecycle, "runLifecycle");
__name222222(runLifecycle, "runLifecycle");
async function runGraphSeed(env) {
  console.log("[lifecycle] re-seeding graph snapshot...");
  try {
    var nc = await env.QNFO_GRAPH.prepare("SELECT COUNT(*) as c FROM nodes").first();
    var ec = await env.QNFO_GRAPH.prepare("SELECT COUNT(*) as c FROM edges").first();
    await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("graph-seed-" + Date.now(), "qnfo-lifecycle-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), 1, 1, "Monthly graph snapshot: " + (nc?.c || 0) + " nodes, " + (ec?.c || 0) + " edges").run();
  } catch (e) {
    console.error("[lifecycle] runGraphSeed error:", e.message);
  }
}
__name(runGraphSeed, "runGraphSeed");
__name2(runGraphSeed, "runGraphSeed");
__name22(runGraphSeed, "runGraphSeed");
__name222(runGraphSeed, "runGraphSeed");
__name2222(runGraphSeed, "runGraphSeed");
__name22222(runGraphSeed, "runGraphSeed");
__name222222(runGraphSeed, "runGraphSeed");
async function runBackup(env) {
  console.log("[lifecycle] running backup...");
  var dateStamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  var results = {};
  try {
    var tables = [
      { db: env.PORTFOLIO_STATE, name: "portfolio-state", table: "resources" },
      { db: env.QNFO_AUDIT, name: "qnfo-audit", table: "audit_sessions" },
      { db: env.LIVING_PAPER, name: "living-paper", table: "papers" },
      { db: env.IPATENT_DB, name: "ipatent-db", table: "submissions" }
    ];
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      try {
        var rows = await t.db.prepare("SELECT * FROM " + t.table).all();
        var json = JSON.stringify(rows.results || []);
        await env.BACKUP_BUCKET.put(t.name + "/" + t.table + "-" + dateStamp + ".json", json, { httpMetadata: { contentType: "application/json" } });
        results[t.name] = rows.results?.length || 0;
      } catch (e) {
        results[t.name] = "error: " + e.message;
      }
    }
    return { status: "backup-complete", dateStamp, results };
  } catch (e) {
    return { status: "backup-failed", error: e.message };
  }
}
__name(runBackup, "runBackup");
__name2(runBackup, "runBackup");
__name22(runBackup, "runBackup");
__name222(runBackup, "runBackup");
__name2222(runBackup, "runBackup");
__name22222(runBackup, "runBackup");
__name222222(runBackup, "runBackup");
async function runDriftAudit(env) {
  console.log("[lifecycle] running ENHANCED drift audit...");
  var result = { status: "drift-checked", timestamp: (/* @__PURE__ */ new Date()).toISOString(), portfolioState: {}, liveState: {}, drift: [], warnings: [] };
  try {
    var project = await env.PORTFOLIO_STATE.prepare("SELECT COUNT(*) as c FROM resources WHERE type='project'").first();
    var worker = await env.PORTFOLIO_STATE.prepare("SELECT COUNT(*) as c FROM resources WHERE type='worker'").first();
    var workerNames = await env.PORTFOLIO_STATE.prepare("SELECT name FROM resources WHERE type='worker'").all();
    result.portfolioState = { projects: project?.c || 0, workers: worker?.c || 0, workerNames: workerNames.results?.map(function(r) {
      return r.name;
    }) || [] };
  } catch (e) {
    result.warnings.push("portfolio-state query failed: " + e.message);
  }
  if (env.CF_API_TOKEN) {
    try {
      var apiResp = await fetch("https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts", { headers: { Authorization: "Bearer " + env.CF_API_TOKEN, "Content-Type": "application/json" } });
      if (apiResp.ok) {
        var data = await apiResp.json();
        var liveWorkers = data.result || [];
        result.liveState = { workers: liveWorkers.length, workerNames: liveWorkers.map(function(w) {
          return w.id;
        }) };
        var portfolioNames = new Set(result.portfolioState.workerNames || []);
        var liveNames = new Set(result.liveState.workerNames || []);
        liveNames.forEach(function(lw) {
          if (!portfolioNames.has(lw)) result.drift.push({ type: "missing_in_portfolio", worker: lw });
        });
        portfolioNames.forEach(function(pw) {
          if (!liveNames.has(pw)) result.drift.push({ type: "stale_in_portfolio", worker: pw });
        });
      } else {
        result.warnings.push("Cloudflare API returned HTTP " + apiResp.status);
      }
    } catch (e) {
      result.warnings.push("Cloudflare API fetch failed: " + e.message);
    }
  } else {
    result.warnings.push("CF_API_TOKEN not configured - live comparison skipped");
  }
  result.driftCount = result.drift.length;
  result.verdict = result.drift.length === 0 ? "CLEAN" : "DRIFT_DETECTED";
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("drift-" + Date.now(), "qnfo-lifecycle-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), result.drift.length === 0 ? 1 : 0, 1, "Drift audit: " + result.driftCount + " drifts. Verdict: " + result.verdict).run();
  } catch (e) {
  }
  return result;
}
__name(runDriftAudit, "runDriftAudit");
__name2(runDriftAudit, "runDriftAudit");
__name22(runDriftAudit, "runDriftAudit");
__name222(runDriftAudit, "runDriftAudit");
__name2222(runDriftAudit, "runDriftAudit");
__name22222(runDriftAudit, "runDriftAudit");
__name222222(runDriftAudit, "runDriftAudit");
async function runSecretsAudit(env) {
  console.log("[lifecycle] running ENHANCED secrets audit...");
  var result = { status: "secrets-audited", timestamp: (/* @__PURE__ */ new Date()).toISOString(), metadataStaleness: [], workerSecrets: [], findings: [], recommendations: [] };
  try {
    var stale = await env.PORTFOLIO_STATE.prepare("SELECT id, name FROM resources WHERE type='project' AND updated_at < datetime('now', '-180 days')").all();
    result.metadataStaleness = (stale.results || []).map(function(r) {
      return r.name;
    });
    if (result.metadataStaleness.length > 0) result.findings.push(result.metadataStaleness.length + " projects with stale metadata (>180d)");
  } catch (e) {
    result.findings.push("Metadata staleness check error: " + e.message);
  }
  if (env.CF_API_TOKEN) {
    try {
      var apiResp = await fetch("https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts", { headers: { Authorization: "Bearer " + env.CF_API_TOKEN, "Content-Type": "application/json" } });
      if (apiResp.ok) {
        var data = await apiResp.json();
        var workers = data.result || [];
        for (var i = 0; i < workers.length; i++) {
          var w = workers[i];
          try {
            var secretsResp = await fetch("https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts/" + w.id + "/secrets", { headers: { Authorization: "Bearer " + env.CF_API_TOKEN } });
            if (secretsResp.ok) {
              var secretsData = await secretsResp.json();
              var secrets = secretsData.result || [];
              result.workerSecrets.push({ worker: w.id, secretCount: secrets.length, secretNames: secrets.map(function(s2) {
                return s2.name;
              }) });
              for (var s = 0; s < secrets.length; s++) {
                var sn = secrets[s];
                var nameUpper = (sn.name || "").toUpperCase();
                if (nameUpper.includes("TOKEN") || nameUpper.includes("API_KEY") || nameUpper.includes("SECRET")) {
                  result.findings.push("High-risk secret '" + sn.name + "' in Worker '" + w.id + "' - verify rotation age");
                }
              }
            }
          } catch (e) {
            result.findings.push("Failed to query secrets for " + w.id + ": " + e.message);
          }
        }
      }
    } catch (e) {
      result.findings.push("Cloudflare API fetch failed: " + e.message);
    }
  } else {
    result.recommendations.push("CF_API_TOKEN not configured - Worker secrets audit skipped");
  }
  var DOCUMENTED_SECRETS = ["CLOUDFLARE_API_TOKEN", "GITHUB_TOKEN", "ZENODO_API_TOKEN", "BUFFER_ACCESS_TOKEN", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "PINATA_API_KEY", "PINATA_API_SECRET", "PINATA_JWT", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "BUFFER_CLIENT_ID", "BUFFER_CLIENT_SECRET", "ADMIN_API_TOKEN", "ADMIN_TOKEN", "CF_API_TOKEN"];
  var documentedSet = new Set(DOCUMENTED_SECRETS.map(function(s2) {
    return s2.toUpperCase();
  }));
  for (var i = 0; i < result.workerSecrets.length; i++) {
    var ws = result.workerSecrets[i];
    for (var j = 0; j < ws.secretNames.length; j++) {
      if (!documentedSet.has(ws.secretNames[j].toUpperCase())) {
        result.findings.push("UNDOCUMENTED secret '" + ws.secretNames[j] + "' in Worker '" + ws.worker + "'");
      }
    }
  }
  result.recommendations.push("Rotation check: secrets older than 90 days need rotation.");
  try {
    var govRows = await env.PORTFOLIO_STATE.prepare("SELECT policy_id, title, review_date, status, summary FROM governance_policies WHERE policy_id IN ('GOV-POL-004','GOV-REPORT-002')").all();
    result.governance = { policies: (govRows.results || []).map(function(r) {
      return { policy_id: r.policy_id, title: r.title, review_date: r.review_date, status: r.status };
    }) };
    var today = /* @__PURE__ */ new Date();
    for (var gi = 0; gi < result.governance.policies.length; gi++) {
      var gp = result.governance.policies[gi];
      if (!gp.review_date) continue;
      var due = /* @__PURE__ */ new Date(gp.review_date + "T00:00:00Z");
      var daysLeft = Math.round((due - today) / 864e5);
      gp.daysToReview = daysLeft;
      if (daysLeft < 0) {
        result.findings.push("GOV-OVERDUE: " + gp.policy_id + " review overdue by " + Math.abs(daysLeft) + " days (" + gp.review_date + ")");
      } else if (daysLeft <= 14) {
        result.recommendations.push("GOV-DUE: " + gp.policy_id + " review due in " + daysLeft + " days (" + gp.review_date + ")");
      }
    }
    var tokResp = await fetch("https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts?per_page=1", { headers: { Authorization: "Bearer " + env.CF_API_TOKEN } });
    if (tokResp.ok) {
      result.findings.push("TOKEN-OK: CLOUDFLARE_API_TOKEN valid for Workers API (GOV-POL-004 compliance)");
    } else {
      result.findings.push("TOKEN-REVIEW: CLOUDFLARE_API_TOKEN Workers API probe HTTP " + tokResp.status + " (rotation deadline check per GOV-POL-004 90d schedule)");
    }
  } catch (e) {
    result.findings.push("Governance check error: " + e.message);
  }
  result.totalFindings = result.findings.length;
  result.totalRecommendations = result.recommendations.length;
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("secrets-" + Date.now(), "qnfo-lifecycle-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), 1, 1, "Secrets audit: " + result.totalFindings + " findings").run();
  } catch (e) {
  }
  return result;
}
__name(runSecretsAudit, "runSecretsAudit");
__name2(runSecretsAudit, "runSecretsAudit");
__name22(runSecretsAudit, "runSecretsAudit");
__name222(runSecretsAudit, "runSecretsAudit");
__name2222(runSecretsAudit, "runSecretsAudit");
__name22222(runSecretsAudit, "runSecretsAudit");
__name222222(runSecretsAudit, "runSecretsAudit");
async function runSync(env) {
  console.log("[lifecycle] syncing registry...");
  var out = { status: "registry-synced", checked: 0, updated: 0, failed: 0, changes: [] };
  try {
    var rows = await env.QNFO_AUDIT.prepare("SELECT service, version, base_url FROM service_registry").all();
    var list = rows.results || [];
    var probe = async function(r) {
      out.checked++;
      var url = (r.base_url || ("https://" + r.service + ".q08.workers.dev")).replace(/\/+$/, "");
      try {
        var resp = await fetch(url + "/health", { signal: AbortSignal.timeout(6000) });
        if (!resp.ok) { out.failed++; return; }
        var t = (await resp.text()).replace(/\s+/g, " ");
        var m = t.match(/"version"\s*:\s*"([^"]{1,60})"/);
        var live = m && m[1] ? m[1] : null;
        if (!live) { out.failed++; return; }
        if (live !== r.version) {
          await env.QNFO_AUDIT.prepare("UPDATE service_registry SET version=?1, updated_at=?2 WHERE service=?3").bind(live, new Date().toISOString(), r.service).run();
          out.updated++;
          if (out.changes.length < 30) out.changes.push(r.service + ": " + (r.version || "null") + " -> " + live);
        }
      } catch (e) { out.failed++; }
    };
    for (var i = 0; i < list.length; i += 10) {
      await Promise.all(list.slice(i, i + 10).map(probe));
    }
  } catch (e) { out.error = String(e && e.message || e).slice(0, 160); }
  console.log("[lifecycle] registry sync: checked=" + out.checked + " updated=" + out.updated + " failed=" + out.failed);
  return out;
}
__name(runSync, "runSync");
__name2(runSync, "runSync");
__name22(runSync, "runSync");
__name222(runSync, "runSync");
__name2222(runSync, "runSync");
__name22222(runSync, "runSync");
__name222222(runSync, "runSync");
async function runPing(env) {
  console.log("[lifecycle] infra ping...");
  var targets = ["https://qnfo-gateway.q08.workers.dev/health"];
  for (var i = 0; i < targets.length; i++) {
    try {
      var r = await fetch(targets[i], { method: "GET" });
      if (!r.ok) console.error("[lifecycle] PING FAIL " + targets[i] + ": HTTP " + r.status);
    } catch (e) {
      console.error("[lifecycle] PING ERROR " + targets[i] + ": " + e.message);
    }
  }
}
__name(runPing, "runPing");
__name2(runPing, "runPing");
__name22(runPing, "runPing");
__name222(runPing, "runPing");
__name2222(runPing, "runPing");
__name22222(runPing, "runPing");
__name222222(runPing, "runPing");
var MEM_DECAY_HALF_LIFE_DAYS = 90;
var MEM_PRUNE_EFFECTIVE_IMPORTANCE = 0.1;
async function runMemoryMaintain(env, opts) {
  opts = opts || {};
  var commit = !!opts.commit;
  var result = { status: "memory-maintained", plane: "qnfo", commit, timestamp: (/* @__PURE__ */ new Date()).toISOString(), scanned: 0, decayed: 0, expired: 0, deduped: 0, pruned: 0, ids: [] };
  try {
    var rows = await env.QNFO_GRAPH.prepare("SELECT id, category, content, summary, importance, session_id, created_at, expires_at FROM agent_memories").all();
    var mems = rows.results || [];
    result.scanned = mems.length;
    var now = Date.now();
    var pruneIds = /* @__PURE__ */ new Set();
    for (var i = 0; i < mems.length; i++) {
      var m = mems[i];
      var importance = m.importance != null ? Number(m.importance) : 0.7;
      if (m.expires_at) {
        var exp = new Date(m.expires_at).getTime();
        if (!isNaN(exp) && exp <= now) {
          pruneIds.add(m.id);
          result.expired++;
          continue;
        }
      }
      var created = new Date(m.created_at).getTime();
      if (isNaN(created)) continue;
      var ageDays = (now - created) / 864e5;
      var effective = importance * Math.pow(0.5, ageDays / MEM_DECAY_HALF_LIFE_DAYS);
      if (effective < MEM_PRUNE_EFFECTIVE_IMPORTANCE) {
        pruneIds.add(m.id);
        result.decayed++;
      }
    }
    var byCat = {};
    for (var j = 0; j < mems.length; j++) {
      var mm = mems[j];
      if (pruneIds.has(mm.id)) continue;
      var key = mm.category + "::" + String(mm.content || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!byCat[key]) byCat[key] = [];
      byCat[key].push(mm);
    }
    for (var k in byCat) {
      var group = byCat[k];
      if (group.length < 2) continue;
      group.sort(function(a, b) {
        return (Number(b.importance) || 0) - (Number(a.importance) || 0);
      });
      for (var g = 1; g < group.length; g++) {
        var dup = group[g];
        if (pruneIds.has(dup.id)) continue;
        pruneIds.add(dup.id);
        result.deduped++;
      }
    }
    if (commit && pruneIds.size) {
      var ids = Array.from(pruneIds);
      for (var c = 0; c < ids.length; c += 100) {
        var chunk = ids.slice(c, c + 100);
        var ph = chunk.map(function() {
          return "?";
        }).join(",");
        await env.QNFO_GRAPH.prepare("DELETE FROM agent_memories WHERE id IN (" + ph + ")").bind(...chunk).run();
        await env.PAPER_VZ.deleteByIds(chunk).catch(function(e) {
          console.error("[lifecycle] VZ delete error:", e.message);
        });
      }
    }
    result.pruned = pruneIds.size;
    result.ids = Array.from(pruneIds).slice(0, 50);
    if (commit) {
      await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("memory-maintain-" + Date.now(), "qnfo-lifecycle-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), 1, 1, "Memory maintain: " + result.scanned + " scanned, " + result.pruned + " pruned").run().catch(function() {
      });
    }
  } catch (e) {
    result.error = e.message;
  }
  return result;
}
__name(runMemoryMaintain, "runMemoryMaintain");
__name2(runMemoryMaintain, "runMemoryMaintain");
async function handleMemoryMaintain(request, env, origin) {
  var q = new URL(request.url).searchParams;
  var commit = q.get("commit") === "1" || q.get("commit") === "true";
  var result = await runMemoryMaintain(env, { commit });
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleMemoryMaintain, "handleMemoryMaintain");
__name2(handleMemoryMaintain, "handleMemoryMaintain");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map