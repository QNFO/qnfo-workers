// qnfo-auditor v1.0.0 - Fleet Event Audit & Act loop (REVIEW -> AUDIT -> ACT -> LEARN).
// Reviews/audits/acts on ALL QNFO event & log stores automatically, unattended:
//   issue_ledger/issue_events (qnfo-events), cloud_ops_events (qnfo-cloud-ops scheduler),
//   alerts, agent_issues, audit_trail, deployment_history, errata_queue/errata_actions,
//   kaizen_reports. Produces run records (fleet_audit_runs) + improvement candidates
//   (kaizen_candidates) feeding self-awareness and continuous improvement.
// Checks: C1 stale-open-high, C2 auto-close-stale-low, C3 reopen-on-recurrence,
//   C4 job-silence, C5 events-sweep-lag, C6 agent-issue bridge, C7 errata-stuck,
//   C8 kaizen feed, C9 digest state machine.
// Canonical source: QNFO/qnfo-workers/qnfo-auditor (FLEET-SELF-DOC-1)
// Deploy: wrangler deploy from this dir; secrets: AUDITOR_TOKEN, DIGEST_TO.
var VERSION = "1.0.0";
var SELF = { purpose: "fleet event/log audit + act loop (automated, user-free)", checks: ["C1","C2","C3","C4","C5","C6","C7","C8","C9"] };
function json(o, st) { return new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json" } }); }
function norm(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
function fpOf(source, category, title) { return hash(norm(source) + "|" + norm(category) + "|" + norm(title)); }
async function ensureSchema(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_audit_runs (id TEXT PRIMARY KEY, ts TEXT, mode TEXT, counts TEXT, findings TEXT, actions TEXT, digest TEXT, open_high TEXT)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS kaizen_candidates (id TEXT PRIMARY KEY, class TEXT, source TEXT, category TEXT, title TEXT, evidence TEXT, status TEXT DEFAULT 'proposed', created_at TEXT, updated_at TEXT)").run();
  await env.AUDIT.prepare("CREATE INDEX IF NOT EXISTS idx_fleet_audit_runs_ts ON fleet_audit_runs(ts)").run();
  await env.AUDIT.prepare("CREATE INDEX IF NOT EXISTS idx_kaizen_candidates_status ON kaizen_candidates(status)").run();
}
function okAuth(req, env) {
  const t = env.AUDITOR_TOKEN || "";
  if (!t) return true;
  const h = req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return false;
  const a = h.slice(7);
  if (a.length !== t.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ t.charCodeAt(i);
  return d === 0;
}
async function qAll(env, sql, ...bind) { const r = bind.length ? await env.AUDIT.prepare(sql).bind(...bind).all() : await env.AUDIT.prepare(sql).all(); return r.results || []; }
async function q1(env, sql, ...bind) { const r = await qAll(env, sql, ...bind); return r[0] || null; }
async function ledgerEnsure(env, entry) {
  const source = String(entry.source || "unknown").slice(0, 80);
  const category = String(entry.category || "general").slice(0, 60);
  const level = String(entry.level || "info").toLowerCase();
  const title = String(entry.title || "").slice(0, 300);
  const detail = String(entry.detail || "").slice(0, 4000);
  const now = new Date().toISOString();
  const fp = fpOf(source, category, title);
  const ex = await q1(env, "SELECT fingerprint,status FROM issue_ledger WHERE fingerprint=?", fp);
  if (!ex) {
    await env.AUDIT.prepare("INSERT INTO issue_ledger (fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences, last_detail, updated_at) VALUES (?,?,?,?,?,'open',?,?,1,?,?)").bind(fp, source, level, category, title, now, now, detail, now).run();
  } else {
    await env.AUDIT.prepare("UPDATE issue_ledger SET occurrences=occurrences+1, last_seen=?, last_detail=?, updated_at=? WHERE fingerprint=?").bind(now, detail, now, fp).run();
  }
  await env.AUDIT.prepare("INSERT INTO issue_events (fingerprint, source, level, category, title, detail, ts) VALUES (?,?,?,?,?,?,?)").bind(fp, source, level, category, title, detail, now).run();
  return fp;
}
async function setFpStatus(env, fp, status, note) {
  await env.AUDIT.prepare("UPDATE issue_ledger SET status=?, last_detail=COALESCE(?,last_detail), updated_at=? WHERE fingerprint=?").bind(status, String(note || "").slice(0, 1000) || null, new Date().toISOString(), fp).run();
}
async function runAudit(env, mode, log) {
  await ensureSchema(env);
  const now = new Date().toISOString();
  const runId = "audit-" + now.replace(/[:.]/g, "-");
  const findings = []; const actions = [];
  const count = (arr) => arr.length;
  const F = (check, level, text) => findings.push({ check, level, text: String(text).slice(0, 600) });
  const A = (kind, text) => actions.push({ kind, text: String(text).slice(0, 600) });

  // ---- snapshot counts ----
  const snapshot = {};
  try { snapshot.ledger_open = (await q1(env, "SELECT COUNT(*) n FROM issue_ledger WHERE status IN ('open','acknowledged')"))?.n || 0; } catch (e) {}
  try { snapshot.open_high = await qAll(env, "SELECT fingerprint,title,source,level,occurrences,last_seen FROM issue_ledger WHERE status IN ('open','acknowledged') AND level IN ('high','critical') ORDER BY last_seen DESC"); } catch (e) { snapshot.open_high = []; }
  try { snapshot.coe_48h = (await q1(env, "SELECT COUNT(*) n FROM cloud_ops_events WHERE ts > datetime('now','-2 day')"))?.n || 0; } catch (e) {}
  try { snapshot.alerts_48h = (await q1(env, "SELECT COUNT(*) n FROM alerts WHERE created_at > datetime('now','-2 day')"))?.n || 0; } catch (e) {}
  try { snapshot.agent_open = (await q1(env, "SELECT COUNT(*) n FROM agent_issues WHERE status='open'"))?.n || 0; } catch (e) {}
  try { snapshot.deploys_7d = (await q1(env, "SELECT COUNT(*) n FROM deployment_history WHERE deployed_at > datetime('now','-7 day')"))?.n || 0; } catch (e) {}

  // C1 - stale open HIGH/CRITICAL (>7d untouched)
  try {
    const stale = await qAll(env, "SELECT fingerprint,title,source,occurrences,last_seen FROM issue_ledger WHERE status IN ('open','acknowledged') AND level IN ('high','critical') AND updated_at < datetime('now','-7 day')");
    for (const s of stale) F("C1", "warning", "stale open " + s.level + " [" + s.source + "] " + String(s.title).slice(0, 160) + " (occ " + s.occurrences + ", last " + s.last_seen + ")");
    log("C1 stale-open-high: " + stale.length);
  } catch (e) { F("C1", "error", "check failed: " + e.message); }

  // C2 - auto-close stale low/warning (no recurrence >=14d, occ<=3)
  try {
    const closable = await qAll(env, "SELECT fingerprint,title,source,level,occurrences,last_seen FROM issue_ledger WHERE status='open' AND level IN ('info','warning','low') AND last_seen < datetime('now','-14 day') AND occurrences<=3");
    for (const c of closable) {
      await setFpStatus(env, c.fingerprint, "resolved", "audit auto-close (C2): no recurrence for >=14d (last " + c.last_seen + ", occ " + c.occurrences + ")");
      A("auto-close", c.source + ": " + String(c.title).slice(0, 120));
    }
    log("C2 auto-close stale low: " + closable.length);
  } catch (e) { F("C2", "error", "check failed: " + e.message); }

  // C3 - reopen resolved/acknowledged/muted entries with newer issue_events (recurrence after resolution)
  let reopenN = 0; const reopened = [];
  try {
    const rec = await qAll(env, "SELECT l.fingerprint, l.source, l.title, l.level, (SELECT COUNT(*) FROM issue_events e WHERE e.fingerprint=l.fingerprint AND e.ts > l.updated_at) AS newer FROM issue_ledger l WHERE l.status IN ('resolved','acknowledged','muted') AND EXISTS (SELECT 1 FROM issue_events e WHERE e.fingerprint=l.fingerprint AND e.ts > l.updated_at)");
    for (const r of rec) {
      await setFpStatus(env, r.fingerprint, "open", "audit reopen (C3): recurrence observed after resolution");
      reopened.push({ source: r.source, category: "reopen", title: String(r.title).slice(0, 120), fp: r.fingerprint });
      reopenN++;
    }
    log("C3 reopen-on-recurrence: " + reopenN);
  } catch (e) { F("C3", "error", "check failed: " + e.message); }

  // C4 - job silence (recurring scheduler job with no event in 48h)
  try {
    const jobs = await qAll(env, "SELECT job, COUNT(DISTINCT substr(ts,1,10)) d, MAX(ts) last FROM cloud_ops_events WHERE ts > datetime('now','-14 day') AND job IS NOT NULL GROUP BY job HAVING d>=3");
    for (const j of jobs) {
      if (String(j.last) < new Date(Date.now() - 48 * 3600e3).toISOString()) {
        F("C4", "high", "job silent >48h: " + j.job + " (last event " + j.last + ")");
        await ledgerEnsure(env, { source: "cloud-ops", category: "job-silence", level: "high", title: "Job silent >48h: " + j.job, detail: "last event " + j.last + "; recurring scheduler job stopped emitting (check cron/schedules)." });
      }
    }
    log("C4 job-silence candidates: " + jobs.length);
  } catch (e) { F("C4", "error", "check failed: " + e.message); }

  // C5 - events sweep lag (coe/alerts error rows older than 12h not yet mirrored by qnfo-events sweep)
  try {
    const lag = await qAll(env, "SELECT id, kind, text, job, ts FROM cloud_ops_events WHERE ts < datetime('now','-12 hour') AND ts > datetime('now','-3 day') AND status IN ('error','failed','partial') AND NOT EXISTS (SELECT 1 FROM issue_events ie WHERE ie.detail='src:coe:'||cloud_ops_events.id)");
    if (lag.length > 0) {
      F("C5", "warning", "events-sweep-lag: " + lag.length + " coe error rows >12h old not mirrored to issue_ledger (oldest " + lag[0].ts + ")");
      await ledgerEnsure(env, { source: "auditor", category: "pipeline", level: "warning", title: "Events sweep lag: " + lag.length + " coe error rows not mirrored in 12h", detail: "qnfo-events daily 03:15 sweep latency; rows: " + lag.slice(0, 5).map((x) => x.id).join(",") });
    }
    log("C5 sweep-lag: " + lag.length);
  } catch (e) { F("C5", "error", "check failed: " + e.message); }

  // C6 - agent_issues bridge (open high/critical older than 30d -> ledger visibility)
  try {
    const old = await qAll(env, "SELECT id,title,priority,category,source FROM agent_issues WHERE status='open' AND priority IN ('high','critical') AND created_at < CAST(strftime('%s','now') AS INTEGER)-2592000 ORDER BY created_at ASC LIMIT 25");
    for (const o of old) {
      await ledgerEnsure(env, { source: "agent-issues", category: "stale-open", level: "high", title: "Stale open agent_issue #" + o.id + ": " + String(o.title).slice(0, 180), detail: "agent_issue " + o.id + " " + (o.priority || "") + " " + (o.category || "") + " open >30d (source " + (o.source || "?") + ")" });
    }
    log("C6 agent-issue bridge: " + old.length);
  } catch (e) { F("C6", "error", "check failed: " + e.message); }

  // C7 - errata stuck (queue rows not terminal after 24h)
  try {
    const stuck = await qAll(env, "SELECT id,sender,subject,status,updated_at FROM errata_queue WHERE status NOT IN ('processed','done','completed','published','resolved','cancelled','closed') AND updated_at < datetime('now','-24 hour') ORDER BY updated_at ASC LIMIT 10");
    if (stuck.length > 0) {
      F("C7", "high", "errata-stuck: " + stuck.length + " queue rows non-terminal >24h");
      for (const s of stuck.slice(0, 3)) await ledgerEnsure(env, { source: "errata", category: "stuck", level: "high", title: "Errata queue stuck >24h #" + s.id + ": " + String(s.subject || "").slice(0, 140), detail: "status " + s.status + " since " + s.updated_at + " sender " + (s.sender || "") });
    }
    log("C7 errata-stuck: " + stuck.length);
  } catch (e) { F("C7", "error", "check failed: " + e.message); }

  // C8 - kaizen/improvement feed
  try {
    // 8a recurrence-after-resolve clusters (evidence from C3 reopenings + resolved-again patterns)
    const rep = reopened.length;
    if (rep >= 2) {
      await upsertCandidate(env, "repeat-resolution", "mixed", "reopen", "Recurrence after resolution x" + rep, JSON.stringify(reopened.slice(0, 10)), log);
    }
    // 8b high-volume event clusters in last 7d
    const clusters = await qAll(env, "SELECT source, category, COUNT(*) n FROM issue_events WHERE ts > datetime('now','-7 day') GROUP BY source, category HAVING n>=5 ORDER BY n DESC LIMIT 10");
    for (const c of clusters) {
      await upsertCandidate(env, "event-cluster", c.source, c.category, "Event cluster: " + c.source + "/" + c.category + " x" + c.n, JSON.stringify(c), log);
    }
    log("C8 clusters: " + clusters.length + ", reopen clusters: " + rep);
  } catch (e) { F("C8", "error", "check failed: " + e.message); }

  // C9 - digest state machine (email only on new/increased HIGH or weekly deep)
  const prev = await q1(env, "SELECT open_high, ts FROM fleet_audit_runs ORDER BY ts DESC LIMIT 1");
  let prevFps = []; try { prevFps = prev && prev.open_high ? JSON.parse(prev.open_high) : []; } catch (e) { prevFps = []; }
  const curFps = (snapshot.open_high || []).map((x) => x.fingerprint);
  const newFps = curFps.filter((f) => !prevFps.includes(f));
  const digestParts = [];
  digestParts.push("QNFO fleet audit " + now.slice(0, 10) + " (" + mode + ")");
  digestParts.push("Ledger open: " + snapshot.ledger_open + " | open HIGH/CRITICAL: " + curFps.length + " (new since last run: " + newFps.length + ") | coe 48h: " + snapshot.coe_48h + " | alerts 48h: " + snapshot.alerts_48h + " | agent open: " + snapshot.agent_open + " | deploys 7d: " + snapshot.deploys_7d);
  if (curFps.length) {
    digestParts.push("");
    digestParts.push("Unresolved HIGH/CRITICAL:");
    for (const h of snapshot.open_high) digestParts.push(" - [" + h.source + "] " + String(h.title).slice(0, 200) + " (occ " + h.occurrences + ")");
  }
  if (findings.length) { digestParts.push(""); digestParts.push("Findings this run: " + findings.length); for (const f of findings.slice(0, 12)) digestParts.push(" - " + f.check + " " + f.level + ": " + f.text.slice(0, 240)); }
  if (actions.length) { digestParts.push(""); digestParts.push("Actions: " + actions.length); for (const a of actions.slice(0, 10)) digestParts.push(" - " + a.kind + ": " + a.text.slice(0, 200)); }
  const digestText = digestParts.join("\n");
  let email = null;
  const wantEmail = mode === "deep" || newFps.length > 0 || curFps.length > (prevFps.length || 0);
  if (wantEmail) {
    if (env.SEND_EMAIL && env.DIGEST_TO) {
      try {
        const r = await env.SEND_EMAIL.send({ to: env.DIGEST_TO, from: { email: "alerts@qnfo.org", name: "QNFO Ops" }, subject: "QNFO fleet audit digest " + now.slice(0, 10) + " (HIGH open: " + curFps.length + ")", text: digestText });
        email = { ok: true, messageId: r && r.messageId };
      } catch (e) { email = { ok: false, error: String(e && e.message || e).slice(0, 300) }; }
    } else { email = { ok: false, error: "no SEND_EMAIL binding / DIGEST_TO secret" }; }
  }
  log("C9 digest: want=" + wantEmail + " new=" + newFps.length + " email=" + JSON.stringify(email));

  await env.AUDIT.prepare("INSERT INTO fleet_audit_runs (id, ts, mode, counts, findings, actions, digest, open_high) VALUES (?,?,?,?,?,?,?,?)")
    .bind(runId, now, mode, JSON.stringify(snapshot).slice(0, 3000), JSON.stringify(findings).slice(0, 6000), JSON.stringify(actions).slice(0, 4000), digestText.slice(0, 6000), JSON.stringify(curFps).slice(0, 2000)).run();

  return { run_id: runId, ts: now, mode, findings: findings.length, actions: actions.length, email, open_high: curFps.length, new_high: newFps.length };
}
async function upsertCandidate(env, cls, source, category, title, evidence, log) {
  const id = fpOf("kaizen", cls, String(source) + "|" + String(category));
  const now = new Date().toISOString();
  const ex = await q1(env, "SELECT id,status,evidence FROM kaizen_candidates WHERE id=?", id);
  if (!ex) {
    await env.AUDIT.prepare("INSERT INTO kaizen_candidates (id, class, source, category, title, evidence, status, created_at, updated_at) VALUES (?,?,?,?,?,?,'proposed',?,?)").bind(id, cls, String(source).slice(0, 80), String(category).slice(0, 60), String(title).slice(0, 300), String(evidence).slice(0, 1500), now, now).run();
  } else if (ex.status === "proposed") {
    await env.AUDIT.prepare("UPDATE kaizen_candidates SET evidence=?, updated_at=? WHERE id=?").bind(String(evidence).slice(0, 1500), now, id).run();
  }
  // promote mature candidates (>7d proposed) to the ledger for agent/ops visibility
  const mature = await qAll(env, "SELECT id,class,source,category,title FROM kaizen_candidates WHERE status='proposed' AND created_at < datetime('now','-7 day') LIMIT 10");
  for (const m of mature) {
    await ledgerEnsure(env, { source: "kaizen", category: "improvement", level: "medium", title: "Improvement candidate: " + m.class + " (" + (m.source || "?") + "/" + (m.category || "?") + ")", detail: m.id });
    await env.AUDIT.prepare("UPDATE kaizen_candidates SET status='promoted', updated_at=? WHERE id=?").bind(new Date().toISOString(), m.id).run();
  }
}
export default {
  async scheduled(event, env, ctx) {
    const cron = (event && event.cron) || "";
    const mode = String(cron).trim().split(/\s+/)[4] === "1" ? "deep" : "standard";
    try { const r = await runAudit(env, mode, console.log); console.log("qnfo-auditor", JSON.stringify(r)); }
    catch (e) { console.error("qnfo-auditor run failed", String(e && e.message || e)); }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname; const m = request.method;
    if (path === "/health" && m === "GET") return json({ ok: true, worker: "qnfo-auditor", version: VERSION, self: SELF, audit: !!env.AUDIT, sendEmail: !!env.SEND_EMAIL, token: !!env.AUDITOR_TOKEN });
    if (!okAuth(request, env)) return json({ error: "unauthorized" }, 401);
    if (path === "/" && m === "GET") return json({ ok: true, name: "qnfo-auditor", version: VERSION, endpoints: ["POST /v1/run", "GET /v1/runs", "GET /v1/state", "/health"], schedule: "45 1,13 * * * (standard) + 45 6 * * 1 (deep)" });
    if (path === "/v1/run" && m === "POST") {
      let mode = "standard"; try { const b = await request.json(); if (b && b.mode === "deep") mode = "deep"; } catch (e) {}
      return json(await runAudit(env, mode, () => {}));
    }
    if (path === "/v1/runs" && m === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 50);
      const rows = await qAll(env, "SELECT id, ts, mode, counts, findings, actions, open_high FROM fleet_audit_runs ORDER BY ts DESC LIMIT ?", limit);
      return json({ runs: rows });
    }
    if (path === "/v1/state" && m === "GET") {
      const open = await qAll(env, "SELECT fingerprint,source,level,category,title,status,occurrences,last_seen FROM issue_ledger WHERE status IN ('open','acknowledged') ORDER BY last_seen DESC LIMIT 100");
      const candidates = await qAll(env, "SELECT id,class,source,category,title,status,created_at FROM kaizen_candidates ORDER BY updated_at DESC LIMIT 50");
      return json({ open_issues: open, kaizen_candidates: candidates });
    }
    return json({ error: "not found" }, 404);
  }
};
