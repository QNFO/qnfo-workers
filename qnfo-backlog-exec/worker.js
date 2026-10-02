var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "2.0.3-codeagent";
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
async function closeIssue(env, id, now, target) {
  const stamp = new Date().toISOString();
  const ev = "backlog-exec v1.6.1 evidence-first auto-close " + stamp + (target ? " | target=" + target : "");
  await env.AUDIT.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, close_evidence, triaged_at) VALUES (?1,'RC-03','closed','qnfo-backlog-exec',datetime('now'),'auto-close by qnfo-backlog-exec v1.6.0 drain',?2,datetime('now')) ON CONFLICT(issue_id) DO UPDATE SET triage_state='closed', close_evidence=?2, triaged_at=datetime('now')").bind(id, ev).run();
  return env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, id).run();
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
  const rows = await env.AUDIT.prepare("SELECT id, title, description, source, category, priority, status, created_at, updated_at FROM agent_issues WHERE status='open' ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, updated_at ASC, id LIMIT ?1").bind(MAX_ROW).all();
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
    const isExceptionClass = !isHealthAvailability && name && /alert-storm|exception|error-burst|worker-exception|recurring fail/i.test(title);
    if (isExceptionClass && name) {
      const ageMs = createdAgeMs(row.created_at, now);
      if (ageMs > 24 * 3600 * 1e3) {
        let rec = 0;
        try {
          const ar = await env.AUDIT.prepare("SELECT COUNT(*) AS c FROM worker_usage_daily WHERE worker_name = ?1 AND error_count > 0 AND date >= date('now', '-24 hours')").bind(name).first();
if (!ar) ar = await env.AUDIT.prepare("SELECT COUNT(*) AS c FROM worker_logs WHERE worker_name = ?1 AND log_level = 'error' AND timestamp >= datetime('now', '-24 hours')").bind(name).first();
          rec = ar ? Number(ar.c || 0) : 0;
        } catch (e) {
        }
        if (rec === 0) {
          const ev = await probeHealthyViaLog(env, name) || await probeHealth(name);
          await closeIssue(env, row.id, now);
          closed++;
          detail.push({ id: row.id, target: name, action: "closed", note: "exception-class recovered: no error-selfheal recurrence 24h, age>24h" + (ev && ev.ok ? ", health ev " + ev.host : "") });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (" + name + "): exception-class recovered", { id: row.id, target: name, action: "closed", reason: "no error-selfheal recurrence in 24h" }, WORKER, "ok");
          continue;
        }
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
    detail.push({ id: row.id, title: title.slice(0, 60), action: "recheck", note: name ? "probe target " + name : "no probe target" });
  }
  const summary = { registers, inventory, noiseClosed, ledgerResolved, jobsReaped, processed: items.length, closed, rechecked, escalated, detail: detail.slice(0, MAX_ROW) };
  if (escalated > 0) await alert(env, WORKER, "warning", "backlog-exec: " + escalated + " health issue(s) still failing: " + detail.filter((d) => d.action === "escalate").map((d) => d.target).join(", "));
  await recordEvent(env, "job-run", "backlog-exec " + JSON.stringify({ noiseClosed, ledgerResolved, jobsReaped, processed: items.length, closed, rechecked, escalated }), { noiseClosed, ledgerResolved, jobsReaped, processed: items.length, closed, rechecked, escalated }, WORKER, "ok");
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
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map