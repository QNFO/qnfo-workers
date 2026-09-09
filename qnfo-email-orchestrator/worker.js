// qnfo-email-orchestrator worker
// Orchestrates the human email + outreach cadence on a schedule.
//   - "cadence" run: inbox scan + outreach reply follow-through + day action
//   - results logged to cadence_runs D1 only — NO self-mail receipt (policy 2026-09-09)
//   - day actions currently: Wednesday response-check
// ENV: OUTREACH_DB (D1), EMAIL_SERVICE (qnfo-email service binding), OUTREACH_SECRET
var VERSION = "0.3.5-glm53-nomail";
var NAMESPACE = "email-orchestrator";
var DAY_ACTIONS = ["wednesday-response-check"];

// DOC endpoints (shown in qnfo-ai /help etc)
var DOC = {
  service: "qnfo-email-orchestrator",
  version: VERSION,
  purpose: "Orchestrate the email+outreach cadence (outreach replies, follow-ups, day actions).",
  endpoints: {
    "GET /run/cadence?mode=dry|live": "full cadence run: inbox+replies+followup+day action+D1 log (AUTH REQUIRED)",
    "GET /run/cadence?date=YYYY-MM-DD&mode=live": "backfill a specific day's cadence run (AUTH REQUIRED)",
    "GET /status": "auth status",
    "GET /health": "worker health",
    "GET /api/docs": "api docs",
    "GET /api/email_filters": "list email filters (AUTH REQUIRED)"
  },
  cadence: {
    inbox: "latest 3h inbox summary (last24h count)",
    replies: "outreach replies detected + logged to outreach_threads (response_type+reason, no user notification)",
    followup: "silent >14d outreach contacts (0 eligible per NO-FOLLOW-UP-DEFAULT-1); DOES NOT auto-follow-up",
    receipt: "NO self-mail (policy 2026-09-09): day summary persisted to cadence_runs only — alerts@qnfo.org was not provisioned, every send NDR-bounced into spam (108+ bounces)",
    day_action: "wednesday-response-check — RESERVED for human-action days (7-9 Sep): currently only emits receipt (now removed) and cadence_runs row; no auto-replies, no auto-follow-ups"
  },
  key: "Schedules a human-email/outreach cadence run. Run with mode=dry for a preview (recommended) or mode=live. mode=live performs real DB writes (but NO email sends: send-path removed as self-mail per policy).",
  note: "This service orchestration was resumed 2026-09-06. All outreach, brief, and daily-digest sends are SELF-MAIL which must be audited; user policy 2026-09-09: no self-mail.",
  safety: ["never send to human contacts from this service automatically", "cadence runs are read-heavy + DB writes only", "results logged to cadence_runs (D1)"],
  version_history: ["0.3.2: first orchestration-visible version", "0.3.3: RED-TEAM blockers added (same email filter whitelist; timezones; SMS; no actual follow-up sends)", "0.3.4-glm53: calendar-api bind + saturday weekly summary; receipt emailed to alerts@ (D1 sink)", "0.3.5: NO SELF-MAIL (policy 2026-09-09) — removed cadence receipt email to alerts@qnfo.org (unprovisioned -> NDR bounce into spam, 108+ bounces); cadence_runs D1 remains the record"]
};

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname;
    if (request.method === "OPTIONS") return this.cors();
    try {
      if (path === "/" || path === "/health") return this.health(env);
      if (path === "/status") return this.cors(json({ ok: true, service: "qnfo-email-orchestrator", version: VERSION, features: ["cadence", "d1-log-only", "no-self-mail"], auth: !!(env.OUTREACH_SECRET) }));
      if (path === "/api/docs") return this.cors(json({ ok: true, doc: DOC }));
      if (path === "/run/cadence") return await this.runCadence(request, env, url);
      if (path === "/api/email_filters") return await this.listEmailFilters(request, env);
      if (path === "/api/docs-html") {
        return new Response("<!doctype html><meta charset=utf-8><title>email-orchestrator docs</title><pre>" + esc(JSON.stringify(DOC, null, 2)) + "</pre>", { status: 200, headers: this.headers("text/html") });
      }
      return new Response("not found: " + path, { status: 404 });
    } catch (e) {
      return this.cors(json({ ok: false, error: e.message }, 500));
    }
  },
  cors(res) { return res; },
  headers(type) { var h = { "content-type": type + "; charset=utf-8", "access-control-allow-origin": "*" }; if (type === "text/html") h["content-type"] = "text/html; charset=utf-8"; return h; },
  auth(env, request) {
    var h = request.headers.get("x-outreach-secret");
    if (!env.OUTREACH_SECRET) return { ok: true, reason: "no secret configured" };
    return h === env.OUTREACH_SECRET ? { ok: true } : { ok: false, reason: "bad secret" };
  },
  async health(env) {
    var out = { ok: true, service: NAMESPACE, version: VERSION, time: new Date().toISOString(), uptime: (Date.now() - (globalThis.__start || Date.now())) };
    if (!globalThis.__start) globalThis.__start = Date.now();
    try { var r = await env.OUTREACH_DB.prepare("SELECT COUNT(*) c FROM cadence_runs").first(); out.db = "ok (" + (r ? r.c : "?") + " rows)"; } catch (e) { out.db = "ERR " + e.message; out.ok = false; }
    if (!env.EMAIL_SERVICE) { out.email_service = "missing binding"; out.ok = false; } else { out.email_service = "bound"; }
    out.features = ["cadence", "d1-log-only", "no-self-mail"];
    return this.cors(json(out));
  },
  json(o, status) { return json(o, status); },
  async listEmailFilters(request, env) {
    var a = this.auth(env, request);
    if (!a.ok) return this.cors(json({ ok: false, error: "auth: " + a.reason }, 401));
    try {
      var rows = await env.OUTREACH_DB.prepare("SELECT id, pattern, action, priority, note FROM email_filters ORDER BY priority DESC").all();
      return this.cors(json({ ok: true, filters: rows.results || [] }));
    } catch (e) { return this.cors(json({ ok: false, error: e.message }, 500)); }
  },
  async runCadence(request, env, url) {
    var a = this.auth(env, request);
    if (!a.ok) return this.cors(json({ ok: false, error: "auth: " + a.reason }, 401));
    var dry = url.searchParams.get("mode") !== "live";
    var dateStr = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    var now = new Date();
    var day = now.toISOString().slice(0, 10);
    if (dateStr && dateStr !== day) { now = new Date(dateStr + "T12:00:00Z"); day = dateStr; }
    var result = { date: day, dry: dry, started: now.toISOString(), mode: dry ? "dry" : "live" };
    // INBOX
    try {
      var ib = await env.EMAIL_SERVICE.fetch("https://email/inbox?h=168", { method: "GET" });
      var ibj = await ib.json();
      if (ibj.ok) result.inbox = { total: ibj.messages ? ibj.messages.length : 0, last24h: ibj.last24h || null }; else result.inbox = { error: ibj.error || "inbox fetch failed" };
    } catch (e) { result.inbox = { error: "inbox exception " + e.message }; }
    // OUTREACH REPLIES
    result.replies = [];
    try {
      var ore = await env.EMAIL_SERVICE.fetch("https://email/outreach/replies", { method: "GET" });
      var orej = await ore.json();
      if (orej.ok && orej.replies) result.replies = orej.replies.map(function (x) { return { from: x.from, response_type: x.response_type, reason: x.reason || "", duplicate: !!x.duplicate }; });
    } catch (e) { /* skip */ }
    // FOLLOW-UP-DUE (silent >14d; no auto-follow-up per policy)
    try {
      var fu = await env.EMAIL_SERVICE.fetch("https://email/outreach/followup?days=14", { method: "GET" });
      var fuj = await fu.json();
      result.followup_eligible = fuj.ok ? (fuj.count || 0) : -1;
      result.followup_due = fuj.ok ? (fuj.due || []) : [];
    } catch (e) { result.followup_eligible = -1; result.followup_due = []; }
    // DAY ACTION (wednesday-response-check reserved)
    if (DAY_ACTIONS.indexOf("wednesday-response-check") !== -1) {
      try {
        var wd = new Date(now.getTime() + 3600000 * 2).getUTCDay();
        var dayAction = { name: "wednesday-response-check", eligible_day: (wd === 3) };
        dayAction.note = "Reserved for human-action days (7-9 Sep): no auto-replies, no auto-follow-ups. Reads + cadence_runs only.";
        result.day_action = dayAction;
      } catch (e) { result.day_action = { error: e.message }; }
    }
    // SCAN (optional meta)
    try {
      var sc = await env.EMAIL_SERVICE.fetch("https://email/scan?limit=2", { method: "GET" });
      var scj = await sc.json();
      if (scj.ok && scj.scan && scj.scan.length) result.scan = scj.scan.slice(0, 2);
    } catch (e) { /* skip */ }
    // WEEKLY (only when it is Saturday and not dry; never emails anyone)
    if (!dry && wd === 6) {
      try {
        var wr = await env.EMAIL_SERVICE.fetch("https://email/outreach/weekly?mode=live", { method: "GET" });
        var wrj = await wr.json();
        result.weekly = wrj.ok ? wrj : { error: wrj.error || "weekly failed" };
      } catch (e) { result.weekly = { error: e.message }; }
    }
    // NO SELF-MAIL (policy 2026-09-09): the cadence summary used to be emailed
    // to alerts@qnfo.org every 3h — that address is not provisioned, so every
    // send NDR-bounced into the spam folder (108+ bounces). No email is sent;
    // the full result is persisted to cadence_runs in D1 below.
    if (!dry) {
      var ended = new Date().toISOString();
      try {
        var ins = await env.OUTREACH_DB.prepare("INSERT INTO cadence_runs (date, run_at, mode, result, version) VALUES (?1, ?2, ?3, ?4, ?5)").bind(day, ended, "live", JSON.stringify({ inbox: result.inbox, replies: result.replies, followup_eligible: result.followup_eligible, day_action: result.day_action, scan: result.scan ? result.scan.length : 0 }), VERSION).run();
        result.saved = true;
      } catch (e) { result.saved = false; result.save_error = e.message; }
    } else {
      result.saved = false;
    }
    return this.cors(json(result));
  }
};

function json(o, status) { return new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }); }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
