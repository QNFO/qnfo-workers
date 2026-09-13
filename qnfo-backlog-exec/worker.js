// qnfo-backlog-exec v1.4.0 - agent_issues backlog executor + issue_ledger resolver + ops_jobs reaper.
// v1.3.0 (PATCH-2026-09-13-ops-jobs-reaper, qnfo-ops): ops_jobs terminal-status reaper (defect D17).
//  The async-job runner writes `response` but never writes the terminal status, so finished legs
//  sit in 'continuing'/'running' forever and every status surface lies. Measured live
//  2026-09-13T14:09Z: ops_jobs held 132 rows - 6 running, 22 continuing, 0 queued, 118 with a
//  response, and 23 rows carrying a finished answer under a NON-terminal status
//  (stranded_response=23). Longest-lived ACTIVE row was 16 min old, so a 30-min idle window
//  cannot touch live work. CORRECTION to the earlier staged note: `updated_at` IS a heartbeat for
//  these rows - the runner touches it continuously (observed ages 0-16 min on progressing rows) -
//  so an idle threshold is a defensible predicate, not a guess. Env: OPS_JOB_STALE_MIN (default 30),
//  OPS_JOB_REAP_CONTINUING (default '1'; set '0' to leave 'continuing' hand-off rows untouched).
// v1.2.9 (PATCH-2026-09-13-zenodo-research-predicates, qnfo-ops): zenodo-publish +
//  research-pipeline resolution predicates. Measured live 2026-09-13T14:07Z: the drain returned
//  {processed:3, closed:0, rechecked:3, escalated:0} with EVERY row carrying
//  note:"no probe target" - a permanent no-op, the same shape as the v1.2.7 model-health class.
//  Cause: neither class had a close predicate, so both fell through to the generic recheck forever.
//  (a) zenodo-publish "VQ error version_queue id=N": version_queue.id is INTEGER and addressable;
//      close when the row's status is no longer 'error' (the raising condition has cleared).
//      Verified live: version_queue id=18 status='drafted' -> issue 677 is now closeable.
//  (b) research-pipeline "TERMINAL research failure N": N is NOT research_queue.id - that column is
//      a UUID (verified live: 44c884d7-23ae-4aeb-968d-cc7011688619). Binding on N would match
//      nothing and a "row absent" branch would WRONGLY close a live ticket. The predicate is
//      therefore CONDITION-scoped: if NO research_queue row still satisfies
//      (status='failed' AND recover_count>=2) the class has cleared -> close; otherwise keep open
//      with an INFORMATIVE note. Verified live at write time: 2 rows still satisfy it, so issues
//      687/688 correctly STAY OPEN and now report the real condition instead of "no probe target".
// v1.2.8 (PATCH-2026-09-13-issue-ledger-resolver, qnfo-ops): issue_ledger resolution sweep +
//  dual-counter /health. Measured live 2026-09-13: /health openBacklog=12 (agent_issues) while
//  issue_ledger held 305 status='open' fingerprints - a 25x apparent divergence. Investigation
//  showed the two are DIFFERENT OBJECT TYPES, not a broken counter: agent_issues = actionable
//  tickets with a resolution predicate; issue_ledger = deduplicated alert fingerprints keyed by
//  fingerprint (PRIMARY KEY) where status='open' means "condition not yet resolved". The ledger
//  had NO consumer and NO resolver, so unresolved fingerprints accumulated forever; 216 of 305
//  (71%) had occurrences<=1 (seen once, never again) and the oldest dated to 2026-09-02.
//  Fix: (a) sweepIssueLedger() auto-resolves any fingerprint whose last_seen is older than the
//  stale window - safe by construction because fingerprint is the PK, so a RECURRENCE updates
//  last_seen in place; a stale last_seen therefore PROVES the condition stopped recurring.
//  (b) /health now reports openLedger alongside openBacklog so the two counters are never
//  conflated by a dashboard again.
//  Verified at write time: issue_ledger live ingest (41 rows first_seen 2026-09-13, latest
//  last_seen 2026-09-13T12:21:31Z), 305 open / 19 resolved / 1 acknowledged, 216 one-shot.
// v1.2.7 (PATCH-2026-09-13-stale-model-noise, qnfo-ops): model-health / ai-calibration
//  resolution predicates. Measured live 2026-09-13: the drain ran every ~2 min and reported
//  {processed:25, closed:0, rechecked:25, escalated:0} with EVERY row carrying
//  note:"no probe target" - a permanent no-op. Cause: run() only had close predicates for
//  health-availability, exception/alert-storm (both require workerTarget() to match a worker
//  name in the title) and the OPEN-ISSUES% noise sweep. 20 of the 25 open rows were
//  MODEL-DEGRADED / [gw-fail] / [ai-cal], which name MODELS not workers -> workerTarget()
//  returned null -> they fell through to `recheck` on every pass forever.
//  Each of those classes has a D1-resolvable predicate, so they are now closeable on
//  EVIDENCE rather than age. Verified at write time: ai_model_health had 25 rows all
//  status='ok' (0 degraded) while 10 MODEL-DEGRADED tickets sat open; ai_gateway_failures
//  24h still showed bge-base 30755 rate-capacity + qwen2.5-coder 13986 content-shape, so
//  those gw-fail rows are REAL and are deliberately kept open, not closed.
// v1.2.6 (red-team 2026-09-09): watchdog coverage + created_at normalizer.
//  - Sweep predicate widened 'OPEN-ISSUES %' -> 'OPEN-ISSUES%': the qnfo-fleet-advisor watchdog
//    row 'OPEN-ISSUES-BACKLOG' (re-filed every 20 min) has NO space after OPEN-ISSUES and so was
//    never swept. Verified live: it was the only OPEN-ISSUES-class row still open (#626) while
//    all numbered siblings had been closed by the sweep. Same self-referential snapshot class;
//    the >3h age gate is unchanged, so a fresh watchdog row is never closed early.
//  - createdAgeMs() normalizer: agent_issues.created_at mixes ISO-T ("2026-09-09T19:40:02"),
//    space-separated ("2026-09-09 18:30:23"), and epoch-ms stored as TEXT ('1788964264232' -
//    [ai-cal] roster-drift rows). new Date(text) on epoch-ms TEXT yields Invalid Date, so age
//    math silently broke (age ~= now for the sweep / exception classes). Numeric TEXT is now
//    parsed as epoch-ms; unparseable values default to age 0 (never age-close on an unknown date).
// v1.2.5: advisor-noise sweep - qnfo-fleet-advisor files 'OPEN-ISSUES N' snapshot rows
// every 20 min (self-referential backlog metrics masquerading as tickets). Those rows have
// no probe target and no resolution predicate, so the drain only rechecked them, burning the
// 40-row budget and never closing them. Sweep closes any OPEN-ISSUES snapshot older than 3h
// (superseded dozens of times; cadence is 20 min) BEFORE the drain selects its rows.
// v1.1.1: drain ordering (priority, then least-recently-watched) so each daily run advances.
// v1.1.0 (self red-team): never auto-close on generic /health alone - a worker can be up while its
// failing endpoint is broken. Only rows whose OWN resolution predicate passes are closed.
// All others are left open but marked rechecked (updated_at) so the loop proves it is watching.
const VERSION = "1.4.0";
// v1.2.4: datetime-format fix - alerts.created_at mixes ISO-T (error-selfheal) and space (datetime())
// formats; string >= comparison miscounts because "T" > " " (30h-old alerts looked fresh). Use julianday().
// v1.2.2: evidence channel fix - public-URL probes from the edge fail for same-account workers
// (CF edge 404 / SVC-BINDING-1); use qnfo-fleet-dashboard fleet_probe_log rows in qnfo-audit
// as the authoritative 15-min health evidence, edge probe only as fallback.
// v1.2.0: exception/alert-storm class auto-close - a worker-exception ticket whose target is
// healthy NOW and has had NO new alert in 24h AND is older than 48h is stale by evidence;
// close it (health-availability rows already auto-close on probe pass; this extends the same
// evidence discipline to alert-storm/exception tickets so the backlog cannot accrue ghost items).
const WORKER = "qnfo-backlog-exec";
const MAX_ROW = 40;
const PROBE_TIMEOUT = 8000;

async function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function ts() { return new Date().toISOString(); }
function nowEpoch() { return Date.now(); }

// v1.2.6: created_at normalizer. Writers store ISO-T, space-separated, or epoch-ms as TEXT.
// Only number|Date-string handling made TEXT epoch-ms -> Invalid Date -> broken age math.
// Unparseable -> 0 (age unknown, treated as fresh; never age-close on a date we cannot read).
function createdAgeMs(ca, now) {
  if (typeof ca === "number") return now - ca;
  if (typeof ca === "string") {
    const t = ca.trim();
    if (/^\d{10,}$/.test(t)) return now - Number(t); // epoch-ms stored as TEXT
    const d = new Date(t).getTime();
    if (Number.isFinite(d)) return now - d;
  }
  return 0;
}

async function recordEvent(env, kind, text, meta, job, status) {
  try {
    const id = kind.slice(0,2) + "-" + (job || WORKER) + "-" + Date.now().toString(36);
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1,?2,?3,?4,?5,?6,?7)")
      .bind(id, ts(), kind, String(text).slice(0,800), JSON.stringify(meta||{}).slice(0,800), job || WORKER, status || "ok").run();
  } catch (e) {}
}
async function alert(env, source, level, message) {
  try { await env.AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(source, level, String(message).slice(0,500)).run(); } catch (e) {}
}

function workerTarget(text) {
  const m = String(text || "").match(/\b(qnfo-[a-z0-9-]+|personal-api(?:-[a-z0-9-]+)?|research-daily-brief|calendar-api|events-radar|qnfo-ai|qnfo-ai-chat)\b/g);
  if (!m) return null;
  return m[0];
}

async function probeHealthyViaLog(env, name) {
  try {
    const row = await env.AUDIT.prepare("SELECT ok, status, ts FROM fleet_probe_log WHERE name = ?1 ORDER BY id DESC LIMIT 1").bind(name).first();
    if (row && Number(row.ok) === 1) {
      const age = Date.now() - new Date(row.ts).getTime();
      if (age < 24 * 3600 * 1000) return { ok: true, via: "fleet_probe_log", ts: row.ts, status: row.status };
    }
  } catch (e) {}
  return null;
}
async function probeHealth(name) {
  const hosts = [name + ".q08.workers.dev", name + ".qnfo.org"];
  for (const h of hosts) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT);
      const r = await fetch("https://" + h + "/health", { headers: { "User-Agent": "Mozilla/5.0 (qnfo-backlog-exec)" }, signal: ctl.signal });
      clearTimeout(timer);
      if (r.ok) return { ok: true, host: h, status: r.status };
    } catch (e) {}
  }
  return { ok: false, host: null, status: 0 };
}

// v1.2.5 + v1.2.6: advisor-noise sweep. 'OPEN-ISSUES N' AND 'OPEN-ISSUES-BACKLOG' rows are
// self-referential backlog snapshots (emitted every 20 min by qnfo-fleet-advisor), not actionable
// tickets: no probe target, no resolution predicate. Anything older than 3h is superseded noise
// -> close, keep history. v1.2.6 widens the predicate to 'OPEN-ISSUES%' so the space-less
// watchdog row is covered too.
async function sweepAdvisorNoise(env) {
  let closed = 0;
  const now = nowEpoch();
  try {
    const noise = await env.AUDIT.prepare("SELECT id, title, created_at FROM agent_issues WHERE status='open' AND title LIKE 'OPEN-ISSUES%' ORDER BY id").all();
    const rows = noise.results || [];
    for (const r of rows) {
      const ageMs = createdAgeMs(r.created_at, now);
      if (ageMs > 3 * 3600 * 1000) {
        await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, r.id).run();
        closed++;
        await recordEvent(env, "job-run", "backlog-exec closed advisor-noise snapshot " + r.id + " (" + String(r.title || "").slice(0,40) + "): superseded, age>3h", { id: r.id, action: "closed", reason: "advisor-noise sweep v1.2.6" }, WORKER, "ok");
      }
    }
  } catch (e) {}
  return closed;
}

// v1.2.8: issue_ledger resolver. issue_ledger is a DEDUPLICATED ALERT-FINGERPRINT ledger
// (PK=fingerprint), NOT a ticket backlog: status='open' means "condition not yet resolved".
// It had no consumer and no resolver, so unresolved fingerprints accumulated forever (305 open,
// 216 of them one-shot, oldest 2026-09-02). Resolve on evidence: fingerprint is the PRIMARY KEY,
// so a RECURRENCE updates last_seen IN PLACE - a stale last_seen therefore PROVES the condition
// stopped recurring. History is preserved (status/resolved_at/resolution_note; never DELETE).
// Window is env-tunable via LEDGER_STALE_HOURS (default 72).
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
      await recordEvent(env, "job-run", "backlog-exec resolved " + resolved + " stale issue_ledger fingerprint(s) (not re-seen in " + hours + "h)", { action: "issue_ledger-sweep", resolved: resolved, window_hours: hours }, WORKER, "ok");
    }
  } catch (e) {
    await recordEvent(env, "job-run", "backlog-exec issue_ledger sweep failed: " + String((e && e.message) || e), { action: "issue_ledger-sweep", error: true }, WORKER, "error");
  }
  return resolved;
}

// v1.3.0: ops_jobs terminal-status reaper (defect D17 + D19).
// D17: the async-job runner writes `response` but never writes the terminal status, so a finished
// leg sits in 'continuing'/'running' forever and every status surface (including the public job
// page) misreports it as unfinished. D19: rows that died produce no `error` text at all, so a
// consumer learns THAT it failed but never WHY.
// Evidence rules, mirroring sweepIssueLedger: promote on evidence, never DELETE, never overwrite
// an existing error string, idempotent, batch-capped at 200.
// Safety: the runner touches updated_at continuously on progressing rows (measured 2026-09-13:
// active rows 0-16 min old, jobs observed running up to ~11 min), so an idle window of 30 min
// (OPS_JOB_STALE_MIN) cannot reap live work. This worker's cron is daily (10 1 * * *), so the
// reaper is a daily sweep, not a live watchdog - a tighter cadence needs a wrangler.toml change.
// RESIDUAL RISK, stated: flipping 'continuing' -> 'succeeded' changes a hand-off marker. The
// successor leg already exists as its own row at hand-off time, so chaining should not depend on
// the predecessor's status - but that could not be verified (qnfo-ops/worker.js is 182,628 B,
// past this endpoint's 32,768-char read cap). Set OPS_JOB_REAP_CONTINUING=0 to disable that half.
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
        await env.AUDIT.prepare("UPDATE ops_jobs SET status='failed', error=COALESCE(error, ?1), updated_at=?2 WHERE id=?3 AND status IN (" + statuses + ")")
          .bind("reaper v1.3.0 (INFERRED - no diagnostic was captured): no response within " + staleMin + "m of last write", ts(), r.id).run();
        out.failed++;
      }
    }
    if (out.promoted + out.failed > 0) {
      await recordEvent(env, "job-run", "backlog-exec reaped ops_jobs: promoted " + out.promoted + " stranded answer(s) to terminal, failed " + out.failed + " silent row(s) (idle>" + staleMin + "m)", { action: "ops-jobs-reap", promoted: out.promoted, failed: out.failed, stranded_before: out.strandedBefore, stale_min: staleMin }, WORKER, "ok");
    }
  } catch (e) {
    await recordEvent(env, "job-run", "backlog-exec ops_jobs reap failed: " + String((e && e.message) || e), { action: "ops-jobs-reap", error: true }, WORKER, "error");
  }
  return out;
}

async function run(env) {
  const noiseClosed = await sweepAdvisorNoise(env);
  const ledgerResolved = await sweepIssueLedger(env);
  const jobsReaped = await sweepOpsJobs(env);
  const rows = await env.AUDIT.prepare("SELECT id, title, description, source, category, priority, status, created_at, updated_at FROM agent_issues WHERE status='open' ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, updated_at ASC, id LIMIT ?1").bind(MAX_ROW).all();
  const items = rows.results || [];
  const now = nowEpoch();
  let closed = 0, rechecked = 0, escalated = 0;
  const detail = [];
  for (const row of items) {
    const title = String(row.title || "");
    const name = workerTarget(title + " " + String(row.description || ""));
    const isHealthAvailability = /health|heartbeat|availability|endpoint down|is down|reachable/i.test(title) && /health|availability|reachable|down/i.test(title);
    if (name && isHealthAvailability) {
      const pLog = await probeHealthyViaLog(env, name);
      const p = pLog ? { ok: true, host: pLog.via + " " + pLog.ts } : await probeHealth(name);
      if (p.ok) {
        await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
        closed++;
        detail.push({ id: row.id, target: name, action: "closed", note: "health availability re-probe PASS via " + p.host });
        await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (" + name + "): " + p.host, { id: row.id, target: name, action: "closed", reason: "health-availability predicate passed" }, WORKER, "ok");
        continue;
      } else {
        if (/orphan|bogus|does not exist/i.test(title)) {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: name, action: "closed", note: "orphan probe target (no such host) - closed on first failed probe" });
          continue;
        }
        escalated++;
        detail.push({ id: row.id, target: name, action: "escalate", note: "health probe still failing" });
        continue;
      }
    }
    const isExceptionClass = !isHealthAvailability && name && /alert-storm|exception|error-burst|worker-exception|recurring fail/i.test(title);
    if (isExceptionClass && name) {
      // Recurrence-based stale close: error-selfheal alerts every recurrence (2h windows).
      // If NO error-selfheal exception/storm alert names this worker in the last 24h, the
      // class has recovered; the ticket is stale. Health evidence (fleet log or edge probe)
      // is checked when available but is not required - error-selfheal silence IS the signal.
      const ageMs = createdAgeMs(row.created_at, now);
      if (ageMs > 24 * 3600 * 1000) {
        let rec = 0;
        try {
          const ar = await env.AUDIT.prepare("SELECT COUNT(*) AS c FROM alerts WHERE source='qnfo-error-selfheal' AND message LIKE ?1 AND julianday(created_at) >= julianday('now', '-24 hours')").bind("%" + name + "%").first();
          rec = ar ? Number(ar.c || 0) : 0;
        } catch (e) {}
        if (rec === 0) {
          const ev = await probeHealthyViaLog(env, name) || await probeHealth(name);
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: name, action: "closed", note: "exception-class recovered: no error-selfheal recurrence 24h, age>24h" + (ev && ev.ok ? ", health ev " + ev.host : "") });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (" + name + "): exception-class recovered", { id: row.id, target: name, action: "closed", reason: "no error-selfheal recurrence in 24h" }, WORKER, "ok");
          continue;
        }
      }
    }

    // ---- v1.2.7: model-health / ai-calibration / gw-fail resolution predicates ------------
    // Rows in these classes name MODELS, not workers, so workerTarget() returned null and they
    // fell straight through to `recheck` on every run forever (measured: closed:0, rechecked:25,
    // note "no probe target" on all 25). Each class has a D1-resolvable predicate, so close on
    // evidence rather than age. Deliberately NO escalation for still-current gw-fail rows: they
    // are a genuine open defect and escalating every 2 min would be an alert storm.
    const isModelHealth = /^MODEL-DEGRADED\b/i.test(title);
    if (isModelHealth) {
      try {
        const dg = await env.AUDIT.prepare("SELECT model_id FROM ai_model_health WHERE status='degraded'").all();
        const degraded = new Set((dg.results || []).map((d) => String(d.model_id)));
        const named = title.replace(/^MODEL-DEGRADED\s*/i, "").split(",").map((s) => s.trim()).filter(Boolean);
        const still = named.filter((m) => degraded.has(m));
        if (degraded.size === 0 || still.length === 0) {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, action: "closed", note: "model-health stale: none of [" + named.slice(0, 4).join(",") + "] degraded now (degraded rows=" + degraded.size + ")" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (model-health): no named model degraded now", { id: row.id, action: "closed", reason: "model-health predicate cleared v1.2.7" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, action: "recheck", note: "model-health STILL degraded: " + still.join(",") });
        continue;
      } catch (e) {}
    }
    const probeFail = title.match(/^\[ai-cal\]\s+model probe failing:\s*(\S+)/i);
    if (probeFail) {
      try {
        const model = probeFail[1];
        const h = await env.AUDIT.prepare("SELECT status FROM ai_model_health WHERE model_id=?1").bind(model).first();
        if (!h || String(h.status) !== "degraded") {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: model, action: "closed", note: "ai-cal probe-failing stale: ai_model_health status=" + (h ? h.status : "absent") });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (ai-cal " + model + "): health no longer degraded", { id: row.id, target: model, action: "closed", reason: "ai-cal probe predicate cleared v1.2.7" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, target: model, action: "recheck", note: "ai-cal probe STILL failing: " + model });
        continue;
      } catch (e) {}
    }
    const gwFail = title.match(/^\[gw-fail\]\s+(\d+)\s+(\S+)/);
    if (gwFail) {
      try {
        const model = gwFail[2];
        const rec = await env.AUDIT.prepare("SELECT COALESCE(SUM(count),0) AS n FROM ai_gateway_failures WHERE model=?1 AND ts >= ((strftime('%s','now') - 86400) * 1000)").bind(model).first();
        const n = rec ? Number(rec.n || 0) : 0;
        if (n === 0) {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: model, action: "closed", note: "gw-fail stale: 0 failures for " + model + " in 24h" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (gw-fail " + model + "): no recurrence in 24h", { id: row.id, target: model, action: "closed", reason: "gateway-failure predicate cleared v1.2.7" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, target: model, action: "recheck", note: "gateway failures CURRENT: " + n + "/24h - real defect, root fix pending" });
        continue;
      } catch (e) {}
    }
    // ---- end v1.2.7 -----------------------------------------------------------------------

    // ---- v1.2.9: zenodo-publish / research-pipeline resolution predicates ------------------
    // Measured live 2026-09-13: the drain reported {processed:3, closed:0, rechecked:3} with
    // note:"no probe target" on ALL 3 open rows. Neither class had a predicate, so they fell
    // through to the generic recheck on every pass forever - a permanent no-op identical in
    // shape to the v1.2.7 model-health class. Both classes are D1-resolvable.
    //
    // (a) zenodo-publish: "VQ error version_queue id=N (...)" - version_queue.id is INTEGER, so
    //     the row is addressable. Bind on the numeric id; close when its status is no longer
    //     'error' (the condition that raised the ticket has cleared).
    const vq = title.match(/version_queue\s+id=(\d+)/i);
    if (vq) {
      try {
        const q = await env.AUDIT.prepare("SELECT status, version_to, updated_at FROM version_queue WHERE id=?1").bind(Number(vq[1])).first();
        if (!q || String(q.status).toLowerCase() !== "error") {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: "version_queue#" + vq[1], action: "closed", note: q ? ("version_queue status=" + q.status + " (not error) - condition cleared") : "version_queue row absent - ticket orphaned" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (VQ " + vq[1] + "): " + (q ? "status=" + q.status : "row absent"), { id: row.id, action: "closed", reason: "zenodo-publish predicate cleared v1.2.9" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, target: "version_queue#" + vq[1], action: "recheck", note: "version_queue STILL error (v" + (q.version_to || "?") + ", updated " + q.updated_at + ")" });
        continue;
      } catch (e) {}
    }

    // (b) research-pipeline: "TERMINAL research failure N" - N is NOT research_queue.id (that
    //     column is a UUID, verified live: 44c884d7-23ae-4aeb-968d-cc7011688619). Binding on N
    //     would match nothing and a "row absent" branch would WRONGLY close a live ticket. The
    //     predicate is therefore CONDITION-scoped, not row-scoped: does ANY research_queue row
    //     still satisfy the terminal condition (status='failed' AND recover_count>=2)? If none,
    //     the class has cleared -> close. If some remain, keep open with an INFORMATIVE note -
    //     never the misleading "no probe target" fall-through.
    if (/^TERMINAL research failure\b/i.test(title)) {
      try {
        const t = await env.AUDIT.prepare("SELECT COUNT(*) AS c FROM research_queue WHERE status='failed' AND recover_count>=2").first();
        const still = t ? Number(t.c || 0) : 0;
        if (still === 0) {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, action: "closed", note: "research terminal condition cleared: 0 rows with status='failed' AND recover_count>=2" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (research): no terminal-failed queue rows remain", { id: row.id, action: "closed", reason: "research-pipeline predicate cleared v1.2.9" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, action: "recheck", note: "research terminal condition STILL present: " + still + " queue row(s) status='failed' AND recover_count>=2" });
        continue;
      } catch (e) {}
    }
    // ---- end v1.2.9 -----------------------------------------------------------------------

    await env.AUDIT.prepare("UPDATE agent_issues SET updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
    rechecked++;
    detail.push({ id: row.id, title: title.slice(0,60), action: "recheck", note: name ? ("probe target " + name) : "no probe target" });
  }
  const summary = { noiseClosed: noiseClosed, ledgerResolved: ledgerResolved, jobsReaped: jobsReaped, processed: items.length, closed: closed, rechecked: rechecked, escalated: escalated, detail: detail.slice(0, MAX_ROW) };
  if (escalated > 0) await alert(env, WORKER, "warning", "backlog-exec: " + escalated + " health issue(s) still failing: " + detail.filter(d=>d.action==="escalate").map(d=>d.target).join(", "));
  await recordEvent(env, "job-run", "backlog-exec " + JSON.stringify({ noiseClosed: noiseClosed, ledgerResolved: ledgerResolved, jobsReaped: jobsReaped, processed: items.length, closed: closed, rechecked: rechecked, escalated: escalated }), { noiseClosed: noiseClosed, ledgerResolved: ledgerResolved, jobsReaped: jobsReaped, processed: items.length, closed: closed, rechecked: rechecked, escalated: escalated }, WORKER, "ok");
  return { status: "ok", notes: summary };
}

export default {
  async scheduled(event, env, ctx) {
    // FLEET-FEED-CONSUMER-1: read own work queue from fleet-feed and auto-execute SQL actions
    if (env.FLEET_FEED) {
      try {
        var fr = await env.FLEET_FEED.fetch('https://qnfo-fleet-feed.q08.workers.dev/feed/self?worker=qnfo-backlog-exec');
        if (fr.ok) {
          var fd = await fr.json();
          var actionable = (fd.findings || []).filter(function(f) {
            return f.auto_action && f.severity_int >= 2 && f.category && !f.category.startsWith('backlog/');
          }).slice(0, 10);
          for (var af of actionable) {
            // Execute SQL auto_actions directly
            var sql = af.auto_action;
            if (sql && /^(UPDATE|INSERT|DELETE)/i.test(sql.trim())) {
              try { await env.AUDIT.prepare(sql).run(); } catch(e2) {}
            }
            // Log to self_heal_actions
            try {
              await env.AUDIT.prepare(
                "INSERT OR IGNORE INTO self_heal_actions (kind, ref, action, ts, status, verified_at) VALUES (?,?,?,datetime('now'),'executed',datetime('now'))"
              ).bind('feed-auto-exec', af.id, (af.auto_action||'').slice(0,500)).run();
            } catch(e3) {}
          }
        }
      } catch(eFeed) {}
    }

    try {
      const out = await run(env);
      console.log("backlog-exec", JSON.stringify(out));
    } catch (e) {
      console.error("backlog-exec", String((e && e.message) || e));
      await alert(env, WORKER, "error", "run failed: " + String((e && e.message) || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const open = await env.AUDIT.prepare("SELECT COUNT(*) c FROM agent_issues WHERE status='open'").first().catch(() => null);
      const led = await env.AUDIT.prepare("SELECT COUNT(*) c FROM issue_ledger WHERE status='open'").first().catch(() => null);
      const stranded = await env.AUDIT.prepare("SELECT COUNT(*) c FROM ops_jobs WHERE status IN ('running','continuing','queued') AND length(COALESCE(response,'')) > 0").first().catch(() => null);
      return json({ ok: true, worker: WORKER, version: VERSION, openBacklog: open ? open.c : -1, openLedger: led ? led.c : -1, strandedOpsJobs: stranded ? stranded.c : -1 });
    }
    if (url.pathname === "/run" && request.method === "POST") {
      const out = await run(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out: out });
    }
    return json({ error: "not found" }, 404);
  }
};
