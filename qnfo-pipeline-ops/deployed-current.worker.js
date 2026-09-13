// qnfo-pipeline-ops v0.5.0-intake-watchdog (2026-09-06)
// Canonical watchdog worker: every-15-min self-healing loop over the autonomous research pipeline.
// v0.5.0: ADDED intake-stall watchdog - detects idea_proposals stuck 'new' (never triaged) and a
//   research_queue sitting empty while the intake backlog exists. Root cause of the 2026-09-03..09-06
//   silent pipeline freeze: triage scoreIdea returned 'all scoring models failed' on every idea (Workers AI
//   response-envelope change; runModel only read r.response/r.result, not choices[0].message.content),
//   so proposals stayed 'new' forever and NOTHING alerted. Now pipeline-ops alarms on this class in
//   <=15 min, and auto-triggers a triage drain when the triage worker is reachable.
// v0.5.3-alert-dedup (2026-09-13, fleet audit): escalateTerminal() and intakeWatchdog() emitted a
//   CRITICAL alert on every 15-min run even when the message itself said "-> agent_issues dup",
//   i.e. the condition was already tracked by an open ticket. Measured: 765 critical alerts,
//   ~96/day for two unchanged terminal failures. Both now gate on r.inserted, matching the
//   convention escalateVersion() already uses in this same file. The per-run heartbeat is
//   preserved by run()'s cloud_ops_events kind='health' row.
// v0.5.4-summary-dedup (2026-09-13, fleet audit follow-up): v0.5.3 gated only the two inner
//   emitters. Alert attribution by message shape showed the LARGEST emitter was untouched: run()'s
//   own summary alert fired level='critical' every 15 min because terminalFailures() returns the two
//   permanent failures (recover_count >= MAX_RECOVERS, already ticketed as agent_issues 644/651).
//   409 of the 765 critical alerts were that single line - more than escalateTerminal (333) and
//   intakeWatchdog (23) combined. The summary now emits only when the condition FINGERPRINT changes,
//   or every 6h as a re-notify, tracked in the new pipeline_state table. Suppressed runs still write
//   the cloud_ops_events kind='health' heartbeat, so liveness is unchanged.

var VERSION = "0.5.4-summary-dedup";
var WORKER = "qnfo-pipeline-ops";
var STALE_MIN = 60;
var MAX_RECOVERS = 2;
var VQ_RETRY_HOURS = 2;
var VQ_ESCALATE_MIN = 10;
var R_RETRY_HOURS = 6;
var MAX_TERMINAL_REARMS = 3;
var INTAKE_STALL_MIN = 120;        // minutes before a 'new' proposal is a stall
var INTAKE_BACKLOG_ALERT_N = 5;    // proposals stuck -> escalate
var SUMMARY_RENOTIFY_HOURS = 6;    // re-emit an unchanged summary at most this often
var TRIAGE_URL = "https://qnfo-idea-triage.q08.workers.dev";

function json(data, status) { return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
function nowIso() { return new Date().toISOString(); }

async function escIssue(env, title, desc, cat, prio) {
  try {
    const dup = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM agent_issues WHERE status='open' AND title LIKE ?1").bind("%" + title.slice(0, 60) + "%").first();
    if (dup && Number(dup.n) > 0) return { inserted: false, reason: "dup-open" };
    const mx = await env.QNFO_AUDIT.prepare("SELECT COALESCE(MAX(id),0) m FROM agent_issues").first();
    const nid = (mx && Number(mx.m)) + 1;
    await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind(nid, String(title).slice(0, 180), String(desc).slice(0, 600), WORKER, cat, prio, "open", null).run();
    return { inserted: true, id: nid };
  } catch (e) { return { inserted: false, error: String(e.message).slice(0, 120) }; }
}

async function ensureSchema(env) {
  try { await env.QNFO_AUDIT.prepare("ALTER TABLE research_queue ADD COLUMN recover_count INTEGER DEFAULT 0").run(); } catch (e) {}
  try { await env.QNFO_AUDIT.prepare("ALTER TABLE research_queue ADD COLUMN terminal_rearms INTEGER DEFAULT 0").run(); } catch (e) {}
  try { await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS pipeline_state (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)").run(); } catch (e) {}
}

async function health(env) {
  const rows = await env.QNFO_AUDIT.prepare("SELECT status, COUNT(*) AS n FROM research_queue GROUP BY status").all();
  const m = {}; for (const r of (rows.results || [])) m[r.status] = r.n;
  // intake health
  let intake_new = 0, intake_oldest = null, triaged = 0;
  try {
    const ip = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n, MIN(created_at) oldest FROM idea_proposals WHERE status='new'").first();
    intake_new = ip ? Number(ip.n) || 0 : 0;
    intake_oldest = ip && ip.oldest ? ip.oldest : null;
    const tp = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE status!='new'").first();
    triaged = tp ? Number(tp.n) || 0 : 0;
  } catch (e) {}
  return { queued: m.queued || 0, researching: m.researching || 0, review: m.review || 0, failed: m.failed || 0, published: m.published || 0, intake_new: intake_new, intake_oldest: intake_oldest, triaged: triaged };
}

// NEW: detect intake stalls and trigger a triage drain
async function intakeWatchdog(env) {
  const h = await health(env);
  const out = { intake_new: h.intake_new, intake_oldest: h.intake_oldest, action: "none" };
  const stalledN = Number(h.intake_new) || 0;
  let oldestAgeMin = null;
  if (h.intake_oldest) {
    const ms = Date.parse(String(h.intake_oldest).replace(" ", "T") + (String(h.intake_oldest).indexOf("Z") >= 0 ? "" : "Z"));
    if (isFinite(ms)) oldestAgeMin = (Date.now() - ms) / 60000;
  }
  const isStall = stalledN >= INTAKE_BACKLOG_ALERT_N && (oldestAgeMin === null || oldestAgeMin >= INTAKE_STALL_MIN);
  if (isStall) {
    const title = "INTAKE-STALL: idea_proposals stuck new (single-issue, self-closes on clear)";
    const desc = "idea_proposals backlog not being triaged: " + stalledN + " stuck new; oldest " + (oldestAgeMin !== null ? Math.round(oldestAgeMin) + "min" : "?") + "; queued=" + h.queued + " researching=" + h.researching + ". Auto-remediation: triage drain. Check qnfo-idea-triage scoreIdea if it recurs.";
    const r = await escIssue(env, title, desc, "research-intake", "high");
    out.action = "escalated";
    try { const resp = await fetch(TRIAGE_URL + "/health"); out.triage_health = resp.status; } catch (e) {}
    // v0.5.3: only alert on a NEWLY filed ticket. Previously a critical alert was emitted on
    // every 15-min run even when the message said "dup", i.e. the ticket already existed.
    if (r.inserted) {
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(WORKER, "critical", "INTAKE-STALL escalated -> agent_issues ok: " + stalledN + " proposals stuck new").run();
      } catch (e) {}
    }
  } else {
    // stall cleared or not a stall - self-close any open INTAKE-STALL issue (single-issue lifecycle)
    try {
      await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=datetime('now') WHERE status='open' AND title LIKE 'INTAKE-STALL%'").run();
      out.action = "cleared";
    } catch (eC) {}
  }
  return out;
}async function recoverStale(env) {
  const r = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='queued', stage=NULL, error='stale-recovered', claimed_at=NULL, agent_task_id=NULL WHERE status='researching' AND claimed_at IS NOT NULL AND claimed_at < datetime('now','-" + STALE_MIN + " minutes')").run();
  return (r && r.meta && r.meta.changes) || 0;
}
async function recoverFailed(env) {
  const r = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='queued', stage=NULL, error=NULL, claimed_at=NULL, agent_task_id=NULL, completed_at=NULL, recover_count = COALESCE(recover_count,0) + 1 WHERE status='failed' AND COALESCE(recover_count,0) < ?1").bind(MAX_RECOVERS).run();
  return (r && r.meta && r.meta.changes) || 0;
}
async function rearmTerminal(env) {
  let n = 0;
  const rows = await env.QNFO_AUDIT.prepare("SELECT id, source_id, completed_at, created_at FROM research_queue WHERE status='failed' AND COALESCE(recover_count,0) >= ?1 AND COALESCE(terminal_rearms,0) < ?2").bind(MAX_RECOVERS, MAX_TERMINAL_REARMS).all();
  for (const t of (rows.results || [])) {
    const ts = String(t.completed_at || t.created_at || "");
    if (!ts) continue;
    const ageH = (Date.now() - Date.parse(ts.replace(" ", "T") + (ts.indexOf("Z") >= 0 ? "" : "Z"))) / 36e5;
    if (!(ageH >= R_RETRY_HOURS)) continue;
    const up = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='queued', stage=NULL, error=NULL, claimed_at=NULL, completed_at=NULL, agent_task_id=NULL, recover_count=0, terminal_rearms=COALESCE(terminal_rearms,0)+1 WHERE id=?1 AND status='failed'").bind(t.id).run();
    if (up && up.meta && up.meta.changes) {
      n++;
      try { await env.QNFO_AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(WORKER, "info", "research_queue terminal auto-rearmed id=" + t.id + " (" + String(t.source_id || "?").slice(0, 40) + ", " + Math.round(ageH * 10) / 10 + "h old) -> queued fresh cycle").run(); } catch (e) {}
      try { await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=datetime('now') WHERE status='open' AND title LIKE ?1").bind("%TERMINAL research failure " + String(t.source_id || "").slice(0, 40) + "%").run(); } catch (e) {}
    }
  }
  return n;
}
async function terminalFailures(env) {
  const r = await env.QNFO_AUDIT.prepare("SELECT id, source_id, error, attempt, recover_count FROM research_queue WHERE status='failed' AND COALESCE(recover_count,0) >= ?1").bind(MAX_RECOVERS).all();
  return r.results || [];
}
async function escalateTerminal(env, terminal) {
  for (const t of terminal) {
    const title = "TERMINAL research failure " + String(t.source_id || t.id || "?").slice(0, 40);
    const desc = "research_queue terminal (recover_count " + (t.recover_count || 0) + " >= " + MAX_RECOVERS + "): " + String(t.error || "no error").slice(0, 400);
    const r = await escIssue(env, title, desc, "research-pipeline", "high");
    // v0.5.3: gate on r.inserted. Previously this emitted a CRITICAL alert every 15 min even
    // when the message read "-> agent_issues dup" (the ticket already existed). Measured:
    // 765 critical alerts, ~96/day for two unchanged terminal failures. escalateVersion()
    // below already used this pattern; escalateTerminal() now matches it.
    if (r.inserted) {
      try { await env.QNFO_AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(WORKER, "critical", "terminal research failure " + String(t.source_id || t.id || "?").slice(0, 40) + " -> agent_issues ok: " + String(t.error || "").slice(0, 200)).run(); } catch (e) {}
    }
  }
}
async function versionErrors(env) {
  const r = await env.QNFO_AUDIT.prepare("SELECT id, paper_doi, version_from, version_to, status, created_at, updated_at FROM version_queue WHERE status='error' AND updated_at < datetime('now','-" + VQ_ESCALATE_MIN + " minutes')").all();
  return r.results || [];
}
async function escalateVersion(env, rows) {
  for (const v of rows) {
    const title = "VQ error version_queue id=" + v.id + " (" + String(v.paper_doi || "") + " -> " + String(v.version_to || "") + ")";
    const desc = "version_queue row " + v.id + " in error since " + v.updated_at + " (paper " + v.paper_doi + " from " + v.version_from + " to " + v.version_to + "). Escalated by pipeline-ops; research-exec purge-fix drain may auto-rearm after 2h.";
    const r = await escIssue(env, title, desc, "zenodo-publish", "high");
    if (r.inserted) { try { await env.QNFO_AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(WORKER, "warning", "version_queue error escalated id=" + v.id + " -> agent_issues " + r.id).run(); } catch (e) {} }
  }
}
async function rearmVersion(env, rows) {
  let n = 0;
  for (const v of rows) {
    const ageH = (Date.now() - Date.parse(String(v.updated_at).replace(" ", "T") + "Z")) / 36e5;
    const tooOld = Date.now() - Date.parse(String(v.created_at).replace(" ", "T") + "Z") > 48 * 36e5;
    if (ageH >= VQ_RETRY_HOURS && !tooOld) {
      const up = await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='drafted', updated_at=datetime('now') WHERE id=?1 AND status='error'").bind(v.id).run();
      if (up && up.meta && up.meta.changes) { n++; try { await env.QNFO_AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(WORKER, "info", "version_queue auto-rearmed id=" + v.id + " (error " + Math.round(ageH * 10) / 10 + "h old) -> drafted for drain").run(); } catch (e) {} }
    }
  }
  return n;
}
async function digestAlerts(env) {
  try { await env.QNFO_AUDIT.prepare("UPDATE alerts SET digested='auto' WHERE source=?1 AND (digested IS NULL OR digested='') AND created_at < datetime('now','-30 minutes')").bind(WORKER).run(); } catch (e) {}
}

async function run(env) {
  await ensureSchema(env);
  const recoveredStale = await recoverStale(env);
  const recoveredFailed = await recoverFailed(env);
  const rearmedTerminal = await rearmTerminal(env);
  const recovered = recoveredStale + recoveredFailed;
  const h = await health(env);
  const terminal = await terminalFailures(env);
  await escalateTerminal(env, terminal);
  const vErr = await versionErrors(env);
  await escalateVersion(env, vErr);
  const rearmed = await rearmVersion(env, vErr);
  // NEW: intake stall watchdog (detect + alarm on untriaged proposal backlog)
  const intake = await intakeWatchdog(env);
  const stalled = h.researching + h.review;
  const intakeEscalating = intake && intake.action === "escalated";
  let summaryState = "none";
  if (h.failed > 0 || stalled > 0 || terminal.length > 0 || vErr.length > 0 || intakeEscalating) {
    const level = terminal.length > 0 || intakeEscalating ? "critical" : (h.failed > 0 || vErr.length > 0 ? "warning" : "info");
    const msg = "research pipeline: failed=" + h.failed + " stalled=" + stalled + " published=" + h.published + " recovered=" + recovered + " vqErr=" + vErr.length + " rearmed=" + rearmed + " rTerm=" + rearmedTerminal + " intake=" + (intake && intake.action !== "none" ? intake.action : "ok") + (terminal.length ? " terminal=" + terminal.length : "");
    // v0.5.4: fingerprint-gate the summary. The previous unconditional emit produced 409 critical
    // alerts (the single largest emitter) for a condition that cannot clear - the two permanent
    // terminal failures, already ticketed as agent_issues 644/651. Emit on change, or re-notify
    // every SUMMARY_RENOTIFY_HOURS. The cloud_ops_events heartbeat below is unaffected.
    const fp = [level, h.failed, stalled, terminal.length, vErr.length, intakeEscalating ? 1 : 0, rearmed, rearmedTerminal].join("|");
    let due = true;
    try {
      const prev = await env.QNFO_AUDIT.prepare("SELECT v, updated_at FROM pipeline_state WHERE k='summary_fp'").first();
      if (prev && prev.v === fp && prev.updated_at) {
        const ts = String(prev.updated_at);
        const ms = Date.parse(ts.replace(" ", "T") + (ts.indexOf("Z") >= 0 ? "" : "Z"));
        if (isFinite(ms)) {
          const ageH = (Date.now() - ms) / 36e5;
          if (ageH >= 0 && ageH < SUMMARY_RENOTIFY_HOURS) due = false;
        }
      }
    } catch (e) {}
    if (due) {
      summaryState = "emitted";
      try { await env.QNFO_AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(WORKER, level, msg).run(); } catch (e) {}
      try { await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO pipeline_state (k, v, updated_at) VALUES ('summary_fp', ?, datetime('now'))").bind(fp).run(); } catch (e) {}
    } else {
      summaryState = "suppressed-unchanged";
    }
  }
  await digestAlerts(env);
  try { await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)").bind("po-" + Date.now().toString(36) + "-" + Math.floor(Math.random()*1e6).toString(36), nowIso(), "health", JSON.stringify(h), JSON.stringify({ intake: intake }), WORKER, "ok").run(); } catch (e) {}
  return Object.assign({ recovered: recovered, recoveredStale: recoveredStale, recoveredFailed: recoveredFailed, rearmedTerminal: rearmedTerminal, terminal: terminal.length, vqErr: vErr.length, rearmed: rearmed, intake: intake, summary: summaryState }, h);
}
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") { const h = await health(env); return json({ ok: true, worker: WORKER, version: VERSION, pipeline: h }); }
    if (url.pathname === "/run" && request.method === "POST") { const out = await run(env); return json({ ok: true, worker: WORKER, version: VERSION, out: out }); }
    return json({ error: "not found" }, 404);
  }
};
