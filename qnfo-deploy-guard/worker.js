// qnfo-deploy-guard v1.3.17 - deploy lock + concurrent-mutation detector + cost watchdog + heartbeat (expected_version enforcement + per-session attribution + registry version refresh on redeploy + NON-CANONICAL-DEPLOY-1 detection excluding synthetic/test rows AND failed canonical attempts + SETTINGS-ONLY ledger rows + DEPLOY-TICKET-AUTORESOLVE-1)
// Worker Contract v1: VERSION constant + GET /health
// Data: https://ops.qnfo.org/fleet (modified_on per worker) + https://ops.qnfo.org/cost (spend)
// NOTE: source of truth is this file; GET /workers/scripts/<name> TRUNCATES large bodies - never patch from a GET.
var VERSION = "1.3.19-wrangler-container-ledger";
var WORKER = "qnfo-deploy-guard";
var LOCK_PREFIX = "deploylock:";
var DENY_PREFIX = "deploydeny:";
var SNAP_KEY = "deploywatch:snapshot";
var REPORT_KEY = "deploywatch:report";
var THR_KEY = "guard:cost_thresholds";
var DEFAULT_TTL = 900; var MAX_TTL = 7200;
var FLEET_URLS = ["https://ops.qnfo.org/fleet", "https://qnfo-ops.q08.workers.dev/fleet"];
var COST_URLS = ["https://ops.qnfo.org/cost", "https://qnfo-ops.q08.workers.dev/cost"];
function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }); }
function nowIso() { return new Date().toISOString(); }
function tok() { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); }
function ms(s) { if (!s) return NaN; var v = new Date(String(s).replace(" ", "T") + (String(s).indexOf("Z") >= 0 ? "" : "Z")).getTime(); return isNaN(v) ? NaN : v; }
function getJson(urls, tout) {
  return (async function () {
    for (var i = 0; i < urls.length; i++) {
      try {
        var c = new AbortController(); var t = setTimeout(function () { c.abort(); }, tout || 15000);
        var r = await fetch(urls[i], { signal: c.signal, headers: { accept: "application/json" } });
        clearTimeout(t);
        if (r.ok) { var j = await r.json(); if (j) return { ok: true, j: j, url: urls[i] }; }
      } catch (e) {}
    }
    return { ok: false, j: null, url: null };
  })();
}
// DECISION (2026-09-21): the lock is backed by D1 deploy_locks (STRONGLY consistent). It was on KV,
// whose reads are eventually consistent: a release followed by an immediate acquire could still observe
// the stale lock and refuse (live-reproduced: acquire -> release(released:true) -> acquire REFUSED).
async function sha256hex(s) { var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))); var a = new Uint8Array(b), o = ""; for (var i = 0; i < a.length; i++) o += ("0" + a[i].toString(16)).slice(-2); return o; }
async function readLock(env, w) { var rows = await auditAll(env, "SELECT worker, owner, since, expires_at, expected_version FROM deploy_locks WHERE worker=?1 AND typeof(expires_at) IN ('integer','real') AND expires_at > ?2 LIMIT 1", [w, Date.now()]); return (rows && rows.length) ? rows[0] : null; }
async function auditRun(env, sql, params) { try { var st = env.AUDIT.prepare(sql); return await st.bind.apply(st, params || []).run(); } catch (e) { return { ok: false, error: String(e && e.message || e) }; } }
async function auditAll(env, sql, params) { try { var st = env.AUDIT.prepare(sql); var b = params && params.length ? st.bind.apply(st, params) : st; var r = await b.all(); return (r && r.results) || []; } catch (e) { return []; } }
async function fileIssue(env, title, desc, priority) {
  var ex = await auditAll(env, "SELECT id FROM agent_issues WHERE status=?1 AND title=?2 LIMIT 1", ["open", title]);
  if (ex && ex.length) return { filed: false, existing: ex[0].id };
  var now = Date.now();
  // 4000, not 900: a coalesced burst carries its full worker list, and autoResolve() parses it back. At 900 a
  // 48-worker list was cut mid-array, which would leave the ticket unparseable and therefore never resolvable.
  var res = await auditRun(env, "INSERT INTO agent_issues (title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", [title, String(desc).slice(0, 4000), "qnfo-deploy-guard", "reliability", priority || "high", "open", "qnfo-deploy-guard/" + VERSION, now, now]);
  return { filed: true, ok: res && res.ok !== false, error: res && res.error };
}
// ALERTS-CHAIN-NO-CONSUMER-1 (2026-09-23): deploy-guard alerts are INFORMATIONAL self-notifications -
// the actionable output is the agent_issues it files. Writing digested=0 fed a queue with no consumer,
// permanently sticking the alerts integration chain (9 of 10 undigested). Self-digest (digested=1): the
// alert is a log entry, not a pending queue item.
async function fileAlert(env, level, message) { await auditRun(env, "INSERT INTO alerts (source, level, message, digested, created_at) VALUES (?1,?2,?3,1,?4)", ["qnfo-deploy-guard", level, String(message).slice(0, 500), nowIso()]); }
// REGISTRY-UNREGISTERED-WORKER-2 (2026-09-21): register-at-deploy. Any live worker absent from
// service_registry (the census authority) gets a stub row immediately, cutting the drift window
// from qnfo-register-guard's 24h to <=10min. The daily register-guard still does the full reconcile.
async function ensureRegistry(env, fleet) {
  var added = [];
  try {
    var have = await auditAll(env, "SELECT service FROM service_registry", []);
    var set = {}; for (var i = 0; i < have.length; i++) set[have[i].service] = 1;
    for (var j = 0; j < (fleet || []).length; j++) {
      var w = String((fleet[j] && fleet[j].name) || ""); if (!w || set[w]) continue;
      await auditRun(env, "INSERT OR IGNORE INTO service_registry (service, kind, version, base_url, purpose, capabilities, routes, tools, models, deps, updated_at, state) VALUES (?1,'worker',NULL,?2,'AUTO-REGISTERED by deploy-guard: live worker absent from the registry (register-at-deploy); purpose/bindings pending full reconcile','[]','[\"/health\']','','','[]',?3,'live')", [w, "https://" + w + ".q08.workers.dev", nowIso()]);
      set[w] = 1; added.push(w);
    }
  } catch (e) {}
  return added;
}
// REGISTRY-VERSION-CURRENCY-1 (2026-09-21): on redeploy, fetch the worker's live /health and
// UPDATE service_registry.version. The prior register-at-deploy wrote only a first-seen stub
// (version NULL or stale), so /lock/acquire's expected_version check compared against a stale
// value and refused valid redeploys with a false "version-mismatch".
async function refreshRegistryVersion(env, w, explicitVer) {
  try {
    // FM6 VERIFY-BEFORE-ADVANCE (2026-09-26): always read the LIVE /health first. The old form
    // let explicitVer (the deployer's CLAIMED version) win unconditionally, so a FAILED deploy
    // that still POSTed /ledger with to=<claim> advanced service_registry.version and wedged
    // every later deploy (registry-as-truth, deploy-guard expected_version). Now the claim is
    // recorded ONLY when the live worker agrees; a claim the live worker does not report is
    // REFUSED (no registry write), so a failed deploy can never wedge the guard.
    var liveVer = "";
    try {
      var url = "https://" + w + ".q08.workers.dev/health";
      var c = new AbortController(); var t = setTimeout(function () { c.abort(); }, 8000);
      var r = await fetch(url, { signal: c.signal, headers: { accept: "application/json" } });
      clearTimeout(t);
      if (r.ok) { var j = await r.json(); if (j && j.version) liveVer = String(j.version); }
    } catch (e) {}
    var ver = "";
    if (explicitVer && String(explicitVer)) {
      if (liveVer && liveVer !== String(explicitVer)) return null;
      ver = String(explicitVer);
    } else if (liveVer) {
      ver = liveVer;
    }
    if (!ver) return null;
    await auditRun(env, "UPDATE service_registry SET version=?1, updated_at=?2 WHERE service=?3", [ver, nowIso(), w]);
    return ver;
  } catch (e) { return null; }
}
// ANOMALY-BURST-COALESCE-1 (2026-09-30): fileIssue() dedupes only by exact open title and the per-worker title
// embeds the worker name, so one bulk out-of-band mutation of N workers filed N separate high-priority tickets in a
// single scan (48 DEPLOY-UNLOGGED-MUTATION issues in ~9 s, half of the open agent_issues backlog: file rate beat
// close rate). When more than BURST_MAX distinct workers share an anomaly type in one scan, replace them with ONE
// fleet-level anomaly that carries the count and the full worker list, so nothing is lost and one open ticket
// (deduped by its stable title) covers the whole event. A genuine one-off (<= BURST_MAX) still files per worker.
var BURST_MAX = 3;
var BURST_TYPES = ["unlogged-mutation", "uncoordinated-deploy"];
function coalesceBursts(list) {
  var out = list.slice();
  for (var bt = 0; bt < BURST_TYPES.length; bt++) {
    var type = BURST_TYPES[bt];
    var grp = out.filter(function (x) { return x.type === type; });
    if (grp.length <= BURST_MAX) continue;
    out = out.filter(function (x) { return x.type !== type; });
    var names = grp.map(function (x) { return x.worker; });
    out.push({ type: type, worker: "fleet", count: grp.length, workers: names });
  }
  return out;
}
// DEPLOY-TICKET-AUTORESOLVE-1 (2026-09-30): the guard FILED tickets but nothing ever CLOSED them. Measured: 48 of
// the 106 open agent_issues were deploy-guard rows, most superseded minutes later by a ledgered canonical redeploy
// (fleet_deploys ids 915-1005, 15:51-15:54Z) -- file rate beat close rate by construction. A ticket now resolves
// on POSITIVE evidence only, re-evaluated every scan:
//   event anomalies (unlogged-mutation / uncoordinated-deploy, per worker or a coalesced fleet burst) resolve when
//     the worker is no longer live, OR a successful ledgered deploy postdates the ticket and nothing mutated after
//     it, OR worker_live_audit verified the live code == repo canonical (SYNC, content-hash) after the ticket and
//     nothing mutated after that verification;
//   state anomalies (non-canonical-deploy / lock-contention / cost-threshold) resolve when this scan no longer
//     observes them.
// Never resolved: a ticket whose anomaly re-occurs in this scan, or any ticket when the fleet probe failed.
// LIMITATION, STATED: the SYNC rule proves the live CODE is canonical; it cannot attribute a settings-only change.
// That is why settings mutators now ledger themselves (SETTINGS-ONLY-LEDGER-1, fleet-control obs reassert).
function isSettingsOnly(note) { return String(note || "").indexOf("SETTINGS-ONLY") === 0; }
var MUT_SLACK_MS = 180000;
// WRANGLER-CONTAINER-LEDGER-1 (#1708/#1709): qnfo-code-orchestrator is also a container worker deployed by wrangler
// (deploy-code-orchestrator.yml) because canonical-deploy skips any directory with [[containers]]. It is NOT in qnfo-ops
// _CONTAINER_WORKERS (it never reaches /ops/deploy), so this list is the pilot (which mirrors qnfo-ops) plus the orchestrator.
var CONTAINER_WORKERS = ["qnfo-containers-pilot", "qnfo-code-orchestrator"];
var EVENT_TYPES = { "UNLOGGED-MUTATION": "unlogged-mutation", "UNCOORDINATED-DEPLOY": "uncoordinated-deploy" };
function workerSettled(w, since, rc) {
  if (rc.haveLive && !rc.liveNames[w]) return "worker no longer live (retired/disposed)";
  var mo = rc.snapshot[w] ? ms(rc.snapshot[w].mo) : NaN;
  // best = newest successful CODE deploy after the ticket; lastLogged = newest successful ledger row of any kind.
  // A SETTINGS-ONLY row can cover a later mutation, but it can never be the deploy that supersedes unknown code.
  var rows = rc.ledgerBy[w] || []; var best = null; var lastLogged = -Infinity;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].ok === 0) continue;
    var t = ms(rows[i].ts);
    if (!isFinite(t)) continue;
    if (t > lastLogged) lastLogged = t;
    if (!isSettingsOnly(rows[i].note) && t > since && (!best || t > best.t)) best = { t: t, r: rows[i] };
  }
  if (best && (!isFinite(mo) || mo <= lastLogged + MUT_SLACK_MS)) return "superseded by ledgered deploy fleet_deploys.id=" + best.r.id + " at " + best.r.ts + " (" + String(best.r.note || "").slice(0, 60) + ")";
  var au = rc.audit[w];
  if (au && Number(au.match) === 1 && au.note === "SYNC") {
    var pt = ms(au.probed_at);
    if (isFinite(pt) && pt > since && (!isFinite(mo) || mo <= pt)) return "live code verified == repo canonical (worker_live_audit SYNC at " + au.probed_at + ", after the last mutation " + (rc.snapshot[w] ? rc.snapshot[w].mo : "?") + ")";
  }
  return null;
}
function burstWorkers(desc) {
  try { var j = JSON.parse(desc); if (j && Array.isArray(j.workers)) return j.workers; } catch (e) {}
  return null;
}
async function autoResolve(env, rc) {
  var out = [];
  if (!rc.haveLive) return out;
  var open = await auditAll(env, "SELECT id, title, description, created_at FROM agent_issues WHERE status='open' AND source='qnfo-deploy-guard'", []);
  for (var i = 0; i < open.length; i++) {
    var it = open[i]; var title = String(it.title || ""); var reason = null;
    var m = /^DEPLOY-([A-Z-]+): (.+)$/.exec(title);
    var since = Number(it.created_at) || 0;
    if (m && EVENT_TYPES[m[1]]) {
      var type = EVENT_TYPES[m[1]]; var w = m[2];
      if (w !== "fleet") {
        if (rc.seen[type + "|" + w]) continue;
        reason = workerSettled(w, since, rc);
      } else {
        var ws = burstWorkers(it.description);
        if (!ws || !ws.length) continue;
        var why = [];
        for (var k = 0; k < ws.length; k++) {
          if (rc.seen[type + "|" + ws[k]]) { why = null; break; }
          var r1 = workerSettled(ws[k], since, rc);
          if (!r1) { why = null; break; }
          why.push(ws[k]);
        }
        if (why) reason = "all " + why.length + " burst workers settled (ledgered redeploy or verified SYNC after the burst)";
      }
    } else if (title === "DEPLOY-NON-CANONICAL-DEPLOY: fleet" && rc.nonCanon.length === 0) {
      reason = "no live worker's last code deploy is non-canonical any more";
    } else if (title === "DEPLOY-LOCK-CONTENTION: fleet" && rc.denials === 0) {
      reason = "no lock denials in this scan";
    } else if (title === "COST-THRESHOLD-BREACH: qnfo-ops" && rc.cost && !(rc.cost.day_usd > rc.cost.thresholds.day_usd || rc.cost.month_usd > rc.cost.thresholds.month_usd)) {
      reason = "spend back under thresholds (day " + rc.cost.day_usd + ", 30d " + rc.cost.month_usd + ")";
    }
    if (!reason) continue;
    var note = "\n\nRESOLVED " + nowIso() + " by qnfo-deploy-guard/" + VERSION + " (DEPLOY-TICKET-AUTORESOLVE-1): " + reason;
    // issue_close_evidence_required (qnfo-audit trigger) ABORTs any close whose issue_triage row carries no
    // close_evidence, so the evidence is written FIRST (upsert: rows predating the autotriage trigger have none).
    var ev = await auditRun(env, "INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, close_evidence) VALUES (?1, 'DEPLOY-TICKET-AUTORESOLVE-1', 'resolved', 'qnfo-deploy-guard', datetime('now'), 'auto-resolve on positive evidence', ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence, triage_state='resolved'", [it.id, "qnfo-deploy-guard/" + VERSION + ": " + reason]);
    if (ev && ev.ok === false) { out.push({ id: it.id, title: title, reason: reason, ok: false, error: "evidence write failed: " + ev.error }); continue; }
    var up = await auditRun(env, "UPDATE agent_issues SET status='resolved', close_channel='deploy-guard-autoresolve', updated_at=?1, description=substr(COALESCE(description,'') || ?2, 1, 6000) WHERE id=?3 AND status='open'", [Date.now(), note, it.id]);
    out.push({ id: it.id, title: title, reason: reason, ok: !(up && up.ok === false) });
  }
  return out;
}
async function scan(env) {
  var t0 = Date.now();
  var fp = await getJson(FLEET_URLS, 15000);
  var ca = await getJson(COST_URLS, 10000);
  var cost = null;
  if (ca.ok && ca.j) {
    var thr = { day_usd: 10, month_usd: 150 };
    try { var tv = await env.FLEET_CONFIG.get(THR_KEY); if (tv) thr = JSON.parse(tv); } catch (e) {}
    var day = (ca.j.utc_day && ca.j.utc_day.cost) || 0;
    var month = (ca.j.last_30d && ca.j.last_30d.cost) || 0;
    cost = { day_usd: day, month_usd: month, cap_per_utc_day: ca.j.cap_per_utc_day, thresholds: thr };
  }
  var ledger = await auditAll(env, "SELECT id, worker, to_sha, ts, note, ok FROM fleet_deploys ORDER BY id", []);
  var lastLedger = {}; var ledgerBy = {};
  for (var i = 0; i < ledger.length; i++) { lastLedger[ledger[i].worker] = ledger[i]; (ledgerBy[ledger[i].worker] = ledgerBy[ledger[i].worker] || []).push(ledger[i]); }
  var prev = {}; try { var pv = await env.FLEET_CONFIG.get(SNAP_KEY); if (pv) prev = JSON.parse(pv) || {}; } catch (e) {}
  var active = {};
  try { var al = await auditAll(env, "SELECT worker, owner, since, expires_at FROM deploy_locks WHERE typeof(expires_at) IN ('integer','real') AND expires_at > ?1", [Date.now()]); for (var j = 0; j < al.length; j++) active[al[j].worker] = al[j]; } catch (e) {}
  var denials = [];
  try { var dn = await env.FLEET_CONFIG.list({ prefix: DENY_PREFIX }); for (var d = 0; d < dn.keys.length; d++) { var dv = await env.FLEET_CONFIG.get(dn.keys[d].name); if (dv) { try { denials.push(JSON.parse(dv)); } catch (e) {} } } } catch (e) {}
  var fleet = (fp.ok && fp.j && fp.j.fleet) ? fp.j.fleet : [];
  var regAdded = [];
  try { regAdded = await ensureRegistry(env, fleet); } catch (e) {}
  var snapshot = {}; var changed = []; var anomalies = [];
  for (var k = 0; k < fleet.length; k++) {
    var ww = fleet[k]; var mo = ww.modified_on || null;
    snapshot[ww.name] = { mo: mo, at: nowIso() };
    var was = prev[ww.name];
    if (was && was.mo && mo && String(was.mo) !== String(mo)) {
      var lg = lastLedger[ww.name] || null;
      // FAILED-LEDGER-ROW-1 (v1.3.11): a FAILED latest ledger row (ok=0) is STILL a logged mutation.
      // Reading ok=0 as "no row" misclassified a failed deploy as an unlogged-mutation (high) -- the
      // canonical false-positive (qnfo-artifacts 2026-09-24: 08:26 deploy WAS ledgered at 08:26:54 but
      // ok=0). The failure itself is still surfaced by the non-canonical-deploy pass below
      // (nlr.ok === 0), so no signal is lost.
      var logged = !!(lg && isFinite(ms(lg.ts)) && isFinite(ms(mo)) && ms(lg.ts) >= ms(mo) - 180000);
      var rec = { type: logged ? "deploy-observed" : "unlogged-mutation", worker: ww.name, from_mod: was.mo, to_mod: mo, ledger_to: lg ? lg.to_sha : null, ledger_ts: lg ? lg.ts : null, lock_owner: active[ww.name] ? active[ww.name].owner : null, lock_held: !!active[ww.name] };
      changed.push(rec);
      if (!logged) anomalies.push(rec);
      if (!logged && !active[ww.name]) anomalies.push({ type: "uncoordinated-deploy", worker: ww.name, to_mod: mo });
    }
  }
  if (denials.length) anomalies.push({ type: "lock-contention", worker: "fleet", count: denials.length, sample: denials.slice(-3) });
  if (cost && (cost.day_usd > cost.thresholds.day_usd || cost.month_usd > cost.thresholds.month_usd)) anomalies.push({ type: "cost-threshold", worker: "qnfo-ops", day_usd: cost.day_usd, month_usd: cost.month_usd, thresholds: cost.thresholds });
  // NON-CANONICAL-DEPLOY-1 (v1.3.8): flag workers whose most recent ledgered deploy did NOT use the
  // canonical route (POST /ops/deploy -> note "server-side deploy (opsDeploy route)"). with-lock /
  // redeploy-script paths POST /ledger (so they pass the unlogged-mutation rule) yet bypass the
  // canonical sequence (uncached GitHub-source fetch + binding preservation). Aggregated to one anomaly.
  var liveNames = {}; for (var lw = 0; lw < fleet.length; lw++) liveNames[fleet[lw].name] = 1;
  var haveLive = fleet.length > 0;
  // SETTINGS-ONLY-LEDGER-1 (v1.3.17): a settings PATCH (e.g. fleet-control's observability reassert) bumps CF
  // modified_on without touching code, so its mutator now ledgers it with a "SETTINGS-ONLY" note. That row must
  // satisfy the unlogged-mutation rule above (it IS logged) but must NOT stand in for the worker's last CODE
  // deploy here, or every reassert would make a canonically deployed worker look non-canonical.
  var lastCode = {}; for (var lc = 0; lc < ledger.length; lc++) { if (!isSettingsOnly(ledger[lc].note)) lastCode[ledger[lc].worker] = ledger[lc]; }
  var nonCanon = [];
  for (var ncw in lastCode) {
    if (ncw.indexOf("__") === 0) continue; // test namespace (e.g. __e2e__) - not a real deploy target
    // FLEET-GHOST-LEDGER-1 (v1.3.12): a retired/ghost worker (present only in the ledger, absent from the
    // live fleet) is not a deploy target -- its stale row must not permanently drive the aggregate (canonical
    // offender: qnfo-fleet-advisor, retired, last ledger row 2026-09-09). Guarded by haveLive so a failed
    // fleet probe cannot silently disable the non-canonical check.
    if (haveLive && !liveNames[ncw]) continue;
    var nlr = lastCode[ncw] || {};
    var nnote = String(nlr.note || "");
    if (/self-test|deliberately/i.test(nnote)) continue; // deliberate detector self-tests (e.g. ops-gateway)
    // CONTAINER-CANONICAL-1 (v1.3.17): /ops/deploy REFUSES container workers by design (a /content PUT through it
    // drops [[containers]]; qnfo-ops _CONTAINER_WORKERS, canonical-deploy.yml CANONICAL-SKIP-CONTAINERS-1), so for
    // them the container-aware deployers (raw_put.py with CONTAINER-CONFIG-PRESERVE-1, restore_container_config.py)
    // ARE the canonical path. Without this, the fleet non-canonical ticket could never clear.
    if (CONTAINER_WORKERS.indexOf(ncw) >= 0) { if (nlr.ok === 0) nonCanon.push(ncw); continue; }
    if (nnote.indexOf("opsDeploy route") < 0 || nlr.ok === 0) nonCanon.push(ncw); // non-canonical path OR a FAILED canonical attempt (ok:0 carries the canonical note)
  }
  if (nonCanon.length) anomalies.push({ type: "non-canonical-deploy", worker: "fleet", count: nonCanon.length, sample: nonCanon.slice(0, 12) });
  var seen = {}; var uniq = []; for (var m = 0; m < anomalies.length; m++) { var key = anomalies[m].type + "|" + anomalies[m].worker; if (!seen[key]) { seen[key] = 1; uniq.push(anomalies[m]); } }
  uniq = coalesceBursts(uniq);
  var filed = [];
  for (var n = 0; n < uniq.length; n++) {
    var a = uniq[n]; var title;
    if (a.type === "cost-threshold") title = "COST-THRESHOLD-BREACH: qnfo-ops";
    else title = "DEPLOY-" + String(a.type).toUpperCase() + ": " + (a.worker || "fleet");
    var pr = (a.type === "unlogged-mutation" || a.type === "uncoordinated-deploy" || a.type === "cost-threshold") ? "high" : "medium";
    var res = await fileIssue(env, title, JSON.stringify(a), pr);
    if (res.filed) filed.push({ title: title, ok: res.ok });
  }
  if (filed.length) await fileAlert(env, "warn", "deploy-guard filed " + filed.length + " ticket(s): " + filed.map(function (f) { return f.title; }).join("; "));
  var resolved = [];
  if (fp.ok) {
    var audit = {};
    try { var ar = await auditAll(env, "SELECT worker, match, note, probed_at FROM worker_live_audit", []); for (var ai = 0; ai < ar.length; ai++) audit[ar[ai].worker] = ar[ai]; } catch (e) {}
    try { resolved = await autoResolve(env, { haveLive: haveLive, liveNames: liveNames, snapshot: snapshot, ledgerBy: ledgerBy, audit: audit, seen: seen, nonCanon: nonCanon, denials: denials.length, cost: cost }); } catch (e) { resolved = [{ error: String(e && e.message || e).slice(0, 200) }]; }
    if (resolved.length) await fileAlert(env, "info", "deploy-guard auto-resolved " + resolved.length + " ticket(s): " + resolved.map(function (r) { return r.id; }).join(","));
  }
  var ok = fp.ok ? 1 : 0;
  try { await auditRun(env, "INSERT INTO fleet_heartbeat (worker,version,ts,ok) VALUES (?1,?2,?3,?4) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok", [WORKER, VERSION, nowIso(), ok]); } catch (e) {}
  var report = { ts: nowIso(), version: VERSION, fleet_probe_ok: fp.ok, fleet_url: fp.url, workers_seen: fleet.length, changed_since_last: changed.length, anomalies: uniq, filed: filed, resolved: resolved, non_canonical: nonCanon, active_locks: Object.keys(active), recent_denials: denials.length, registry_added: regAdded, cost: cost, baseline: Object.keys(prev).length === 0, elapsed_ms: Date.now() - t0 };
  try { await env.FLEET_CONFIG.put(SNAP_KEY, JSON.stringify(snapshot), { expirationTtl: 604800 }); } catch (e) {}
  try { await env.FLEET_CONFIG.put(REPORT_KEY, JSON.stringify(report), { expirationTtl: 604800 }); } catch (e) {}
  if (fp.ok) { try { var dn2 = await env.FLEET_CONFIG.list({ prefix: DENY_PREFIX }); for (var z = 0; z < dn2.keys.length; z++) { await env.FLEET_CONFIG.delete(dn2.keys[z].name); } } catch (e) {} }
  return report;
}
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(scan(env).catch(function () {})); },
  async fetch(request, env, ctx) {
    var url = new URL(request.url); var p = url.pathname;
    // CONCURRENT-SESSION-SHARED-SECRET-CLOBBER-1 (#1701): shared-secret mutations (rotate/PUT of a worker secret) are
    // serialized through the same D1 deploy_locks lease under the key "secrets:<worker>" (separate from deploy locks).
    // A session POSTs /secret-lock/acquire {worker, owner, ttl_sec}, mutates, then verifies on the next-cycle re-probe and
    // POSTs /secret-lock/release {worker, token}. The lease expires (ttl 60s..MAX_TTL) so a dead session never blocks forever.
    if ((p === "/secret-lock/acquire" || p === "/secret-lock/release") && request.method === "POST") {
      var sb = await request.json().catch(function () { return {}; });
      if (!sb.worker) return json({ error: "worker required" }, 400);
      sb.worker = "secrets:" + String(sb.worker); delete sb.expected_version;
      p = "/lock/" + p.slice("/secret-lock/".length);
      request = new Request(url.origin + p, { method: "POST", body: JSON.stringify(sb) });
    }
    if (p === "/health") return json({ ok: true, worker: WORKER, version: VERSION, ts: nowIso() });
    if (p === "/report" && request.method === "GET") { var rp = await env.FLEET_CONFIG.get(REPORT_KEY); return json(rp ? JSON.parse(rp) : { ts: null }); }
    if (p === "/locks" && request.method === "GET") { var lr = await auditAll(env, "SELECT worker, owner, since, expires_at, expected_version FROM deploy_locks WHERE expires_at > ?1", [Date.now()]); return json({ locks: lr, now: nowIso() }); }
    if (p.indexOf("/lock/") === 0 && request.method === "GET") { var w3 = decodeURIComponent(p.slice(6)); return json({ worker: w3, lock: await readLock(env, w3), now: nowIso() }); }
    if (p === "/lock/acquire" && request.method === "POST") {
      var b = await request.json().catch(function () { return {}; }); var w4 = String(b.worker || "");
      if (!w4) return json({ error: "worker required" }, 400);
      var ttl = Math.min(Math.max(Number(b.ttl_sec || DEFAULT_TTL), 60), MAX_TTL);
      var now4 = Date.now();
      // expected_version optimistic-concurrency check (registry-as-truth): reject a deploy that
      // assumes a stale current version. Enforced only when the worker is registered.
      if (b.expected_version) {
        var reg = await auditAll(env, "SELECT version FROM service_registry WHERE service=?1 LIMIT 1", [w4]);
        var curVer = reg && reg.length ? reg[0].version : null;
        if (curVer && String(curVer) !== String(b.expected_version)) {
          return json({ acquired: false, reason: "version-mismatch", worker: w4, expected_version: String(b.expected_version), current_version: curVer }, 409);
        }
      }
      var actor4 = String(b.actor || b.owner || "unknown");
      var sid4 = b.session_id ? String(b.session_id) : null;
      await auditRun(env, "DELETE FROM deploy_locks WHERE (typeof(expires_at) IN ('integer','real') AND expires_at <= ?1) OR (typeof(expires_at)='text' AND datetime(expires_at) < datetime('now'))", [now4]);
      var raw4 = tok(); var th4 = await sha256hex(raw4);
      var ins4 = await auditRun(env, "INSERT INTO deploy_locks (worker, token_hash, owner, actor, session_id, since, expires_at, expected_version) SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE NOT EXISTS (SELECT 1 FROM deploy_locks WHERE worker=?1 AND expires_at > ?6)", [w4, th4, String(b.owner || "unknown"), actor4, sid4, now4, now4 + ttl * 1000, b.expected_version || null]);
      if (ins4 && ins4.ok === false) return json({ error: "lock_db_unavailable", detail: ins4.error }, 500);
      var ch4 = (ins4 && ins4.meta && typeof ins4.meta.changes === "number") ? ins4.meta.changes : (ins4 && typeof ins4.changes === "number" ? ins4.changes : 0);
      if (!ch4) {
        var cur = await readLock(env, w4);
        try { await env.FLEET_CONFIG.put(DENY_PREFIX + Date.now() + "-" + tok(), JSON.stringify({ worker: w4, owner: String(b.owner || "unknown"), held_by: cur ? cur.owner : null, at: nowIso() }), { expirationTtl: 3600 }); } catch (e) {}
        return json({ acquired: false, held_by: cur ? cur.owner : "unknown", held_since: cur ? cur.since : null, expires_at: cur ? new Date(cur.expires_at).toISOString() : null }, 409);
      }
      return json({ acquired: true, token: raw4, expires_at: new Date(now4 + ttl * 1000).toISOString() });
    }
    if (p === "/lock/release" && request.method === "POST") {
      var b5 = await request.json().catch(function () { return {}; }); var w5 = String(b5.worker || ""); var tk = String(b5.token || "");
      if (!w5 || !tk) return json({ error: "worker and token required" }, 400);
      var th5 = await sha256hex(tk);
      var del5 = await auditRun(env, "DELETE FROM deploy_locks WHERE worker=?1 AND token_hash=?2", [w5, th5]);
      if (del5 && del5.ok === false) return json({ released: false, reason: "lock_db_unavailable" }, 500);
      var cd5 = (del5 && del5.meta && typeof del5.meta.changes === "number") ? del5.meta.changes : (del5 && typeof del5.changes === "number" ? del5.changes : 0);
      if (!cd5) return json({ released: false, reason: "token mismatch or no lock" }, 409);
      return json({ released: true });
    }
    if (p === "/ledger" && request.method === "POST") {
      var bl = await request.json().catch(function () { return {}; }); if (!bl.worker) return json({ error: "worker required" }, 400);
      var rl = await auditRun(env, "INSERT INTO fleet_deploys (worker, actor, session_id, from_sha, to_sha, source_path, ok, note, ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", [String(bl.worker), String(bl.actor || "unknown"), bl.session_id ? String(bl.session_id) : null, bl.from || null, bl.to || null, bl.source_path || null, bl.ok === false ? 0 : 1, String(bl.note || "").slice(0, 400), nowIso()]);
      try { await ensureRegistry(env, [{ name: String(bl.worker) }]); } catch (e) {}
      var refreshedVer = null;
      try { refreshedVer = await refreshRegistryVersion(env, String(bl.worker), bl.version || bl.to || bl.to_version); } catch (e) {}
      return json({ logged: true, ok: rl && rl.ok !== false, error: rl && rl.error, registry_version: refreshedVer });
    }
    if (p === "/thresholds" && request.method === "POST") { var bt = await request.json().catch(function () { return {}; }); await env.FLEET_CONFIG.put(THR_KEY, JSON.stringify({ day_usd: Number(bt.day_usd || 10), month_usd: Number(bt.month_usd || 150) })); return json({ set: true }); }
    if (p === "/scan" && (request.method === "POST" || request.method === "GET")) { return json(await scan(env)); }
    return json({ error: "not_found", worker: WORKER }, 404);
  }
};