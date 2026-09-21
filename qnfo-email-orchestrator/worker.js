var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.4.0";
var NAMESPACE = "email-orchestrator";
var DAY_ACTIONS = ["wednesday-response-check"];
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
    replies: "outreach replies detected and surfaced in cadence_runs.replies (canonical reply log is qnfo-outreach replies table; no outreach_threads table exists)",
    followup: "silent >14d outreach contacts (0 eligible per NO-FOLLOW-UP-DEFAULT-1); DOES NOT auto-follow-up",
    receipt: "NO self-mail (policy 2026-09-09): day summary persisted to cadence_runs only \u2014 alerts@qnfo.org was not provisioned, every send NDR-bounced into spam (108+ bounces)",
    day_action: "wednesday-response-check \u2014 RESERVED for human-action days (7-9 Sep): currently only emits receipt (now removed) and cadence_runs row; no auto-replies, no auto-follow-ups"
  },
  key: "Schedules a human-email/outreach cadence run. Run with mode=dry for a preview (recommended) or mode=live. mode=live performs real DB writes (but NO email sends: send-path removed as self-mail per policy).",
  note: "This service orchestration was resumed 2026-09-06. All outreach, brief, and daily-digest sends are SELF-MAIL which must be audited; user policy 2026-09-09: no self-mail.",
  safety: ["never send to human contacts from this service automatically", "cadence runs are read-heavy + DB writes only", "results logged to cadence_runs (D1)"],
  version_history: ["0.3.2: first orchestration-visible version", "0.3.3: RED-TEAM blockers added (same email filter whitelist; timezones; SMS; no actual follow-up sends)", "0.3.4-glm53: calendar-api bind + saturday weekly summary; receipt emailed to alerts@ (D1 sink)", "0.3.5: NO SELF-MAIL (policy 2026-09-09) \u2014 removed cadence receipt email to alerts@qnfo.org (unprovisioned -> NDR bounce into spam, 108+ bounces); cadence_runs D1 remains the record"]
};
var worker_default = {
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname;
    if (request.method === "OPTIONS") return this.cors();
    try {
      if (path === "/" || path === "/health") return this.health(env);
      if (path === "/status") return this.cors(json({ ok: true, service: "qnfo-email-orchestrator", version: VERSION, features: ["cadence", "d1-log-only", "no-self-mail"], auth: !!env.OUTREACH_SECRET }));
      if (path === "/api/docs") return this.cors(json({ ok: true, doc: DOC }));
      if (path === "/run/cadence") return await this.runCadence(request, env, url);
      if (path === "/run/replies") return await this.runReplies(request, env, url);
      if (path === "/api/email_filters") return await this.listEmailFilters(request, env);
      if (path === "/api/docs-html") {
        return new Response("<!doctype html><meta charset=utf-8><title>email-orchestrator docs</title><pre>" + esc(JSON.stringify(DOC, null, 2)) + "</pre>", { status: 200, headers: this.headers("text/html") });
      }
      return new Response("not found: " + path, { status: 404 });
    } catch (e) {
      return this.cors(json({ ok: false, error: e.message }, 500));
    }
  },
  cors(res) {
    return res;
  },
  headers(type) {
    var h = { "content-type": type + "; charset=utf-8", "access-control-allow-origin": "*" };
    if (type === "text/html") h["content-type"] = "text/html; charset=utf-8";
    return h;
  },
  auth(env, request) {
    var h = request.headers.get("x-outreach-secret");
    if (!env.OUTREACH_SECRET) return { ok: true, reason: "no secret configured" };
    return h === env.OUTREACH_SECRET ? { ok: true } : { ok: false, reason: "bad secret" };
  },
  async health(env) {
    var out = { ok: true, service: NAMESPACE, version: VERSION, time: (/* @__PURE__ */ new Date()).toISOString(), uptime: Date.now() - (globalThis.__start || Date.now()) };
    if (!globalThis.__start) globalThis.__start = Date.now();
    try {
      var r = await env.OUTREACH_DB.prepare("SELECT COUNT(*) c FROM cadence_runs").first();
      out.db = "ok (" + (r ? r.c : "?") + " rows)";
    } catch (e) {
      out.db = "ERR " + e.message;
      out.ok = false;
    }
    if (!env.EMAIL) {
      out.email_service = "missing binding";
      out.ok = false;
    } else {
      out.email_service = "bound";
    }
    out.features = ["cadence", "d1-log-only", "no-self-mail"];
    return this.cors(json(out));
  },
  json(o, status) {
    return json(o, status);
  },
  emailAuth(env) {
    var h = {};
    if (env.EMAIL_API_KEY) h["x-api-key"] = env.EMAIL_API_KEY;
    return h;
  },
  // EMAIL-HUMAN-REPLY-LOOP-MISSING (942): triage-and-draft the human reply queue.
  // Conservative v1: auto-send ONLY short grounded acknowledgments; escalate every
  // technical/scientific/licensing/legal/opinion item so nothing is hallucinated
  // from the owner's name. Uses the cheap Workers AI model (no OpenAI cost).
  async runReplies(request, env, url) {
    var a = this.auth(env, request);
    if (!a.ok) return this.cors(json({ ok: false, error: "auth: " + a.reason }, 401));
    var dry = url.searchParams.get("mode") !== "live";
    return this.cors(json(await this.runRepliesInternal(env, dry)));
  },
  async scheduled(controller, env, ctx) {
    try { var r = await this.runRepliesInternal(env, false); console.log("reply-draft:", JSON.stringify(r)); }
    catch (e) { console.error("reply-draft failed:", String(e && e.message || e)); }
  },
  async runRepliesInternal(env, dry) {
    var rows = await env.AUDIT_DB.prepare("SELECT q.id AS qid, q.email_id, q.sender, q.subject, e.body_text FROM email_reply_queue q LEFT JOIN emails e ON e.id = q.email_id WHERE q.decision = 'pending' ORDER BY q.id ASC LIMIT 25").all();
    var list = rows.results || [];
    var out = { scanned: list.length, dry: dry, sent: 0, escalated: 0, skipped: 0, items: [] };
    for (var i = 0; i < list.length; i++) {
      var res = await this.draftOne(env, list[i], dry);
      if (res && res.action === "sent") out.sent++;
      else if (res && res.action === "escalate") out.escalated++;
      else out.skipped++;
      out.items.push(res);
    }
    return out;
  },
  async draftOne(env, row, dry) {
    var qid = row.qid;
    try {
      var prior = await env.AUDIT_DB.prepare("SELECT id FROM email_reply_queue WHERE lower(sender)=?1 AND id < ?2 AND decision IN ('sent','drafted')").bind(String(row.sender || "").toLowerCase(), qid).first();
      if (prior) { await this.setDecision(env, qid, "skip", "no-repeat"); return { qid: qid, action: "skip", reason: "no-repeat" }; }
      var cls = await this.cheapClassify(env, row);
      if (cls.escalate) { await this.setDecision(env, qid, "escalate", cls.reason); return { qid: qid, action: "escalate", reason: cls.reason }; }
      if (!cls.draft) { await this.setDecision(env, qid, "escalate", "empty-draft"); return { qid: qid, action: "escalate", reason: "empty-draft" }; }
      if (dry) return { qid: qid, action: "would-send", draft: cls.draft };
      var resp = await env.EMAIL.fetch("https://email/send", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") }, body: JSON.stringify({ to: row.sender, from: "qnfo@qnfo.org", subject: "Re: " + (row.subject || "(no subject)"), body: cls.draft, reply_to_id: row.email_id }) });
      if (resp && resp.ok) { await this.setDecision(env, qid, "sent", null, cls.draft); return { qid: qid, action: "sent" }; }
      var rj = null; try { rj = await resp.json(); } catch (e) {}
      await this.setDecision(env, qid, "escalate", "send-failed:" + (resp ? resp.status : "no-resp") + ":" + (rj && rj.error || ""));
      return { qid: qid, action: "escalate", reason: "send-failed" };
    } catch (e) {
      try { await this.setDecision(env, qid, "escalate", "error:" + e.message); } catch (e2) {}
      return { qid: qid, action: "escalate", reason: "error:" + e.message };
    }
  },
  async setDecision(env, qid, decision, reason, draft) {
    await env.AUDIT_DB.prepare("UPDATE email_reply_queue SET decision=?1, skip_reason=?2, draft_text=COALESCE(?3, draft_text), drafted_at=datetime('now'), updated_at=datetime('now') WHERE id=?4").bind(decision, reason || null, draft || null, qid).run();
  },
  async cheapClassify(env, row) {
    var body = String(row.body_text || "").slice(0, 2500);
    var NL = String.fromCharCode(10);
    var sys = "You triage inbound email for an assistant answering on its owner's behalf. Decide ONE action. DRAFT: the email is a simple logistical or scheduling message answerable from its own content (meeting confirm, receipt, availability, a thanks, a short logistics question) - output a 1-2 sentence polite professional reply that introduces no fact not present in the email. ESCALATE: anything technical, scientific, licensing, legal, financial, a review or opinion request, or anything you cannot answer with certainty - output only the word ESCALATE. Output exactly either 'DRAFT: <text>' or 'ESCALATE'.";
    var usr = "From: " + (row.sender || "") + NL + "Subject: " + (row.subject || "") + NL + NL + body;
    var out = { escalate: false, reason: "", draft: "" };
    try {
      var resp = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: 200 });
      var txt = String(resp && (resp.response || resp.output || "")).trim();
      var up = txt.toUpperCase();
      if (!txt) { out.escalate = true; out.reason = "empty-model-output"; return out; }
      if (up.indexOf("ESCALATE") === 0) { out.escalate = true; out.reason = "model-escalate"; return out; }
      if (up.indexOf("DRAFT:") === 0) { out.draft = txt.slice(6).trim(); } else { out.draft = txt; }
      if (!out.draft) { out.escalate = true; out.reason = "unparseable"; }
      return out;
    } catch (e) { out.escalate = true; out.reason = "model-error:" + e.message; return out; }
  },
  async listEmailFilters(request, env) {
    var a = this.auth(env, request);
    if (!a.ok) return this.cors(json({ ok: false, error: "auth: " + a.reason }, 401));
    try {
      var rows = await env.AUDIT_DB.prepare("SELECT id, field, pattern, action, reply_template, priority, enabled, rule_type FROM email_filters ORDER BY priority DESC").all();
      return this.cors(json({ ok: true, filters: rows.results || [] }));
    } catch (e) {
      return this.cors(json({ ok: false, error: e.message }, 500));
    }
  },
  async runCadence(request, env, url) {
    var a = this.auth(env, request);
    if (!a.ok) return this.cors(json({ ok: false, error: "auth: " + a.reason }, 401));
    var dry = url.searchParams.get("mode") !== "live";
    var dateStr = url.searchParams.get("date") || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    var now = /* @__PURE__ */ new Date();
    var day = now.toISOString().slice(0, 10);
    if (dateStr && dateStr !== day) {
      now = /* @__PURE__ */ new Date(dateStr + "T12:00:00Z");
      day = dateStr;
    }
    var result = { date: day, dry, started: now.toISOString(), mode: dry ? "dry" : "live" };
    try {
      var ib = await env.EMAIL.fetch("https://email/stats", { method: "GET", headers: this.emailAuth(env) });
      var ibj = await ib.json();
      if (ibj && ibj.total !== undefined) result.inbox = { total: ibj.total, last24h: ibj.last24h ?? null };
      else result.inbox = { error: (ibj && ibj.error) || "inbox fetch failed" };
    } catch (e) {
      result.inbox = { error: "inbox exception " + e.message };
    }
    result.replies = [];
    try {
      var ore = await env.EMAIL.fetch("https://email/outreach/replies", { method: "GET", headers: this.emailAuth(env) });
      var orej = await ore.json();
      if (orej.ok && orej.replies) result.replies = orej.replies.map(function(x) {
        return { from: x.from, response_type: x.response_type, reason: x.reason || "", duplicate: !!x.duplicate };
      });
    } catch (e) {
      result.replies_error = e.message;
    }
    try {
      var fu = await env.EMAIL.fetch("https://email/outreach/followup?days=14", { method: "GET", headers: this.emailAuth(env) });
      var fuj = await fu.json();
      result.followup_eligible = fuj.ok ? fuj.count || 0 : -1;
      result.followup_due = fuj.ok ? fuj.due || [] : [];
    } catch (e) {
      result.followup_eligible = -1;
      result.followup_due = [];
    }
    if (DAY_ACTIONS.indexOf("wednesday-response-check") !== -1) {
      try {
        var wd = new Date(now.getTime() + 36e5 * 2).getUTCDay();
        var dayAction = { name: "wednesday-response-check", eligible_day: wd === 3 };
        dayAction.note = "Reserved for human-action days (7-9 Sep): no auto-replies, no auto-follow-ups. Reads + cadence_runs only.";
        result.day_action = dayAction;
      } catch (e) {
        result.day_action = { error: e.message };
      }
    }
    try {
      var sc = await env.EMAIL.fetch("https://email/scan?limit=2", { method: "GET", headers: this.emailAuth(env) });
      var scj = await sc.json();
      if (scj.ok && scj.scan && scj.scan.length) result.scan = scj.scan.slice(0, 2);
    } catch (e) {
      result.scan_error = e.message;
    }
    if (!dry && wd === 6) {
      try {
        var wr = await env.EMAIL.fetch("https://email/outreach/weekly?mode=live", { method: "GET", headers: this.emailAuth(env) });
        var wrj = await wr.json();
        result.weekly = wrj.ok ? wrj : { error: wrj.error || "weekly failed" };
      } catch (e) {
        result.weekly = { error: e.message };
      }
    }
    if (!dry) {
      var ended = (/* @__PURE__ */ new Date()).toISOString();
      try {
        var ins = await env.OUTREACH_DB.prepare("INSERT INTO cadence_runs (date, run_at, mode, result, version) VALUES (?1, ?2, ?3, ?4, ?5)").bind(day, ended, "live", JSON.stringify({ inbox: result.inbox, replies: result.replies, followup_eligible: result.followup_eligible, day_action: result.day_action, scan: result.scan ? result.scan.length : 0 }), VERSION).run();
        result.saved = true;
      } catch (e) {
        result.saved = false;
        result.save_error = e.message;
      }
    } else {
      result.saved = false;
    }
    return this.cors(json(result));
  }
};
function json(o, status) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
}
__name(json, "json");
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(esc, "esc");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map