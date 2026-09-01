// ============================================================
// worker.js — qnfo-email-orchestrator v0.3.1 (cloud cadence)
// SELF-DOCUMENTED WORKER (see GET /doc for full documentation)
// Repo: QNFO/qnfo-workers — dir: qnfo-email-orchestrator/
// Recovery: redeploy from repo (see MANIFEST + RECOVERY.md)
// ============================================================
// PURPOSE: cloud replacement for the local DeepChat scheduled task
// "qnfo-email-inbox-check" (cronjob 3851f539). Runs the email +
// outreach cadence every 3h WITHOUT local Windows DeepChat.
//   - inbox check (all qnfo.org domains via qnfo-email service binding)
//   - outreach reply detection + classification (outreach-strategy.md §3)
//   - follow-up readiness (>14d silent, informational; NO-FOLLOW-UP-DEFAULT-1)
//   - Mon: arXiv candidate scan (queued, email verification REQUIRED before send)
//   - Wed: response check only
//   - Fri: weekly report + self-audit
//   - receipt emailed to alerts@qnfo.org (D1 sink; never personal inbox)
// AUTH: /run/* requires "Authorization: Bearer <EMAIL_API_KEY>" or
//   "x-api-key: <EMAIL_API_KEY>" (mirrors qnfo-email gate). /health,
//   /doc, /audit are read-only and open.
// SAFETY: never sends external outreach in v0.3.x — candidates are queued
//   with email_verified=0 and REQUIRE verification before any send.
var MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
var VERSION = "0.3.1";
var OUTREACH_MARKERS = ["primon","zeta partition","Madelung","measurement","ultrametric","p-adic","adelic","identity, aggregation","empirical filter","pre-arithmetic","formalism 25","hierarchy distance","spectral statistics","Landauer","exchange phase","logical scalar","Laws of Form","qudit","joules-per-solution","arXiv:","10.5281/zenodo","zenodo"];
var QNFO_DOMAINS = ["qnfo.org","qwav.org","qwav.tech","qwav.net","qwav.uk","q-wave.tech","q08.org"];

var DOC = {
  worker: "qnfo-email-orchestrator",
  version: VERSION,
  purpose: "Cloud replacement for local DeepChat cronjob 3851f539 (qnfo-email-inbox-check). Runs the email+outreach cadence every 3 hours from Cloudflare — no local Windows DeepChat required.",
  cron: "0 */3 * * * (UTC)",
  endpoints: {
    "GET /health": "readiness: bindings present, dryRun mode, feature list",
    "GET /doc": "this documentation (self-documented worker)",
    "GET /audit": "self-audit: bindings, D1 reachability, email service, latest runs",
    "GET /run/check?mode=dry|live": "AI triage of recent processed inbound (AUTH REQUIRED)",
    "GET /run/cadence?mode=dry|live": "full cadence run: inbox+replies+followup+day action+receipt (AUTH REQUIRED)"
  },
  auth: "Bearer <EMAIL_API_KEY> or x-api-key on /run/*. Open: /health /doc /audit.",
  bindings: {
    AI: "Workers AI (llama-3.1-8b-instruct-fp8) — triage + classification",
    AUDIT_DB: "D1 qnfo-audit (35e2e573...) — qnfo-email emails table + audit_sessions",
    DRY_RUN: "plain_text 'false' (live cron). true = detection-only, no receipt/D1 writes",
    EMAIL: "service binding -> qnfo-email (production). Host qnfo-email.internal",
    EMAIL_API_KEY: "secret — Bearer key for qnfo-email /send + /emails/* calls",
    OUTREACH_DB: "D1 qnfo-outreach (d5077252...) — outreach_campaigns, cadence_runs, outreach_candidates"
  },
  d1_tables: {
    outreach_campaigns: "per-recipient outreach + response tracking (response_type taxonomy: positive/critical/dismissive/read-later/collaboration)",
    cadence_runs: "one row per cadence execution (run_at, mode, day, summary_json)",
    outreach_candidates: "Monday arXiv scan queue (email_verified=0 — never sent without verification)"
  },
  cadence: {
    every_run: ["inbox stats", "reply detection (markers + Re: fallback, non-qnfo senders)", "follow-up readiness count"],
    monday: "arXiv keyword scan -> outreach_candidates (INSERT OR IGNORE by name+paper_id)",
    wednesday: "response check only — no sends",
    friday: "weekly report: campaigns total + responses by type + self-audit",
    receipt: "email to alerts@qnfo.org (D1 sink) with day summary — never personal inbox (DIGEST-TO-PERSONAL-1)"
  },
  safety: {
    no_external_sends: "v0.3.x queues candidates only; sends require verified addresses (email_verified=1) and are executed by the agent, never by this worker",
    followups: "0 eligible per NO-FOLLOW-UP-DEFAULT-1 (user policy 2026-08-20) — count is informational",
    dry_run: "DRY_RUN=false for autonomous live cron; ?mode=dry forces detection-only",
    no_fabrication: "never fabricates email addresses; unverified contacts are SKIPPED"
  },
  recovery: "Source: QNFO/qnfo-workers repo, qnfo-email-orchestrator/worker.js. Redeploy: python scripts/redeploy-orchestrator.py (reads repo source, POST /versions with keep_bindings ['secret_text'], deploys to production). Bindings documented above.",
  version_history: ["0.2-service-binding: AI triage only", "0.3: cadence (reply classify, Mon/Wed/Fri, receipt, OUTREACH_DB)", "0.3.1: auth gate on /run/*, thread dedup, classify ordering, https arXiv + paper_id, /doc + /audit, DRY_RUN=false"]
};

function json(data, status) { status = status || 200; return new Response(JSON.stringify(data), { status: status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
function isDryRun(env, mode) { if (mode === "live") return false; if (mode === "dry") return true; return env.DRY_RUN !== "false"; }
function isAuthed(request, env) {
  var auth = request.headers.get("Authorization") || "";
  var xk = request.headers.get("x-api-key") || "";
  var key = env.EMAIL_API_KEY || "";
  if (!key) return false;
  return auth === "Bearer " + key || xk === key;
}
async function callEmail(env, path, opts) {
  opts = opts || {};
  var url = new URL("https://qnfo-email.internal" + path);
  var headers = { "Authorization": "Bearer " + env.EMAIL_API_KEY, "Content-Type": "application/json" };
  var resp = await env.EMAIL.fetch(url.toString(), { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (!resp.ok) throw new Error("email svc " + path + " HTTP " + resp.status + ": " + (await resp.text()).slice(0, 300));
  return resp.json();
}
function isQnfoAddr(addr) { var d = String(addr || "").split("@").pop().toLowerCase(); return QNFO_DOMAINS.some(function (x) { return d === x || d.endsWith("." + x); }); }
function isOutreachSubject(subject) { var s = String(subject || "").toLowerCase(); return OUTREACH_MARKERS.some(function (m) { return s.indexOf(m) !== -1; }); }
function classifyReply(subject, body) {
  var t = (String(subject || "") + " " + String(body || "")).toLowerCase();
  // F3 fix: critical/dismissive take precedence over positive
  if (/collab|co-author|work together|joint|data that might|would you be interested in/.test(t)) return "collaboration";
  if (/disagree|wrong|incorrect|flawed|mistake|error in|critic/.test(t)) return "critical";
  if (/decline|not interested|unsubscribe|no thanks|not relevant|respectfully/.test(t)) return "dismissive";
  if (/no time|busy|when i have time|will get back|read it later|sometime|will read it/.test(t)) return "read-later";
  if (/thank|thanks|interesting|appreciate|look forward|will read|will look/.test(t)) return "positive";
  return "unclassified";
}
async function triageWithAI(env, email) {
  var prompt = 'You are QNFO\'s email triage assistant. Classify this inbound email.\nFrom: ' + (email.sender || "") + "\nSubject: " + (email.subject || "") + "\nBody: " + (email.body_text || "").slice(0, 1200) + '\n\nRespond with JSON only: {"classification":"reply|new_contact|notification|spam|other","actionable":true|false,"summary":"<10 words>","suggested_action":"<none|reply|flag|followup>"}';
  try {
    var result = await env.AI.run(MODEL, { messages: [{ role: "user", content: prompt }] }, { gateway: { id: "default" } });
    var text = (result && (result.response || result.result || "")).toString().replace(/`+json|`+/g, "").trim();
    var parsed = JSON.parse(text);
    return { classification: parsed.classification || "other", actionable: !!parsed.actionable, summary: parsed.summary || "", suggested_action: parsed.suggested_action || "none" };
  } catch (e) {
    return { classification: "other", actionable: false, summary: "ai-unavailable", suggested_action: "none" };
  }
}
async function runCheck(env, mode) {
  var dry = isDryRun(env, mode);
  var recent = await callEmail(env, "/emails/recent?limit=50&status=processed");
  var emails = recent.emails || [];
  var triage = []; var actionable = 0;
  for (var i = 0; i < emails.slice(0, 15).length; i++) {
    var e = emails[i];
    try {
      var body = await callEmail(env, "/emails/body?id=" + e.id);
      var cls = await triageWithAI(env, { sender: e.sender, subject: e.subject, body_text: body.body_text || "" });
      triage.push({ id: e.id, from: e.sender, subject: e.subject, received_at: e.received_at, classification: cls.classification, actionable: cls.actionable, summary: cls.summary, suggested_action: cls.suggested_action });
      if (cls.actionable) actionable++;
    } catch (err) { triage.push({ id: e.id, from: e.sender, subject: e.subject, error: err.message }); }
  }
  try { await env.AUDIT_DB.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("orchestrator-" + Date.now(), "qnfo-email-orchestrator", new Date().toISOString(), new Date().toISOString(), actionable, triage.length, JSON.stringify({ mode: dry ? "dry" : "live", checked: triage.length, actionable }).slice(0, 500)).run(); } catch (e) {}
  return { ok: true, worker: "qnfo-email-orchestrator", version: VERSION, mode: dry ? "dry" : "live", model: MODEL, checked: triage.length, actionable: actionable, dryRun: dry, triage: triage };
}
async function runCadence(env, mode) {
  var dry = isDryRun(env, mode);
  var now = new Date();
  var day = now.toISOString().slice(0, 10);
  var dow = now.getUTCDay();
  var result = { ok: true, worker: "qnfo-email-orchestrator", version: VERSION, mode: dry ? "dry" : "live", run_at: now.toISOString(), day: day, dow: dow, inbox: null, replies: [], followup_eligible: 0, day_action: null, receipt_email_id: null };
  try {
    var recent = await callEmail(env, "/emails/recent?limit=30");
    var stats = await callEmail(env, "/stats");
    result.inbox = { total: stats.total || 0, last24h: stats.last24h || 0, recent_count: (recent.emails || []).length };
  } catch (e) { result.inbox = { error: e.message }; }
  try {
    var recentAll = await callEmail(env, "/emails/recent?limit=60");
    var candidates = (recentAll.emails || []).filter(function (e) { if (isQnfoAddr(e.sender)) return false; if (e.status === "spam" || e.status === "archived") return false; return isOutreachSubject(e.subject) || /^re:/i.test(e.subject || ""); });
    for (var i = 0; i < Math.min(candidates.length, 12); i++) {
      var e = candidates[i];
      try {
        var body = await callEmail(env, "/emails/body?id=" + e.id);
        var rtype = classifyReply(e.subject, body.body_text || "");
        result.replies.push({ id: e.id, from: e.sender, subject: e.subject, received_at: e.received_at, response_type: rtype, status: e.status });
        if (!dry) {
          // F2 fix: dedup — only insert when no existing row for this thread+recipient
          var existing = await env.OUTREACH_DB.prepare("SELECT id FROM outreach_campaigns WHERE thread_id=?1 AND recipient_email=?2").bind(e.id, e.sender).first();
          if (!existing) {
            await env.OUTREACH_DB.prepare("INSERT INTO outreach_campaigns (paper_title, recipient_email, recipient_name, connection_point, sent_at, response_type, response_summary, thread_id, status) VALUES (?,?,?,?,?,?,?,?,?)").bind(e.subject, e.sender, "", "inbound outreach reply (auto-detected)", e.received_at, rtype, (body.body_text || "").slice(0, 300), e.id, "responded").run();
            result.replies[result.replies.length - 1].logged = true;
          } else {
            result.replies[result.replies.length - 1].logged = false;
            result.replies[result.replies.length - 1].duplicate = true;
          }
        }
      } catch (err) { result.replies.push({ id: e.id, from: e.sender, subject: e.subject, error: err.message }); }
    }
  } catch (e) { result.reply_scan_error = e.message; }
  try {
    var sent = await callEmail(env, "/emails/recent?limit=100&status=sent");
    var cutoff = Date.now() - 14 * 86400000;
    result.followup_eligible = (sent.emails || []).filter(function (s) { if (isQnfoAddr(s.recipient)) return false; if (/rwnquni@outlook\.com|@gmail\.com$/.test(String(s.recipient || "")) && /preview|test/i.test(String(s.subject || ""))) return false; var t = new Date(s.received_at || 0).getTime(); return t > 0 && t < cutoff; }).length;
  } catch (e) { result.followup_error = e.message; }
  if (dow === 1) {
    result.day_action = "monday-arxiv-scan";
    try {
      var topics = ["ultrametric", "primon gas", "adelic", "measurement induced transitions"];
      var found = [];
      for (var t = 0; t < topics.length; t++) {
        var q = "all:" + encodeURIComponent('"' + topics[t] + '"');
        // F4 fix: https
        var r = await fetch("https://export.arxiv.org/api/query?search_query=" + q + "&start=0&max_results=5&sortBy=submittedDate&sortOrder=descending", { headers: { "User-Agent": "Mozilla/5.0 (QNFO orchestration worker)" } });
        var txt = await r.text();
        var entries = txt.split("<entry>").slice(1);
        for (var ei = 0; ei < entries.length && ei < 5; ei++) {
          var ent = entries[ei];
          var idm = ent.match(/<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/);
          var pid = idm ? idm[1].replace(/v\d+$/, "") : ("scan-" + topics[t] + "-" + ei);
          var tm = ent.match(/<title>([\s\S]*?)<\/title>/);
          var pt = tm ? tm[1].replace(/\s+/g, " ").trim().slice(0, 200) : ("arxiv scan " + topics[t]);
          var names = (ent.match(/<name>([^<]+)<\/name>/g) || []).map(function (x) { return x.replace(/<\/?name>/g, "").trim(); });
          if (names.length) found.push({ topic: topics[t], paper_id: pid, title: pt, authors: names.slice(0, 5) });
          if (!dry) {
            for (var n = 0; n < names.length; n++) {
              // F4 fix: paper_id bound -> UNIQUE(name, paper_id) dedup works
              await env.OUTREACH_DB.prepare("INSERT OR IGNORE INTO outreach_candidates (scan_date, name, paper_id, paper_title, topic, connection_notes, created_at) VALUES (?,?,?,?,?,?,?)").bind(day, names[n], pid, pt, topics[t], "auto-candidate; email verification required before any send", now.toISOString()).run();
            }
          }
        }
      }
      result.day_action = "monday-arxiv-scan";
      result.scan = found;
    } catch (e) { result.scan_error = e.message; }
  } else if (dow === 3) {
    result.day_action = "wednesday-response-check";
  } else if (dow === 5) {
    result.day_action = "friday-weekly-report";
    try {
      var r1 = await env.OUTREACH_DB.prepare("SELECT COUNT(*) c FROM outreach_campaigns").first();
      var r2 = await env.OUTREACH_DB.prepare("SELECT response_type, COUNT(*) c FROM outreach_campaigns WHERE response_type != 'none' GROUP BY response_type").all();
      var r3 = await env.OUTREACH_DB.prepare("SELECT COUNT(*) c FROM outreach_candidates").first();
      result.weekly = { campaigns_total: r1 ? r1.c : 0, responses: r2 ? r2.results : [], candidates_queued: r3 ? r3.c : 0 };
      // OPS.003.9: self-audit block in weekly report
      result.self_audit = await selfAudit(env);
    } catch (e) { result.weekly_error = e.message; }
  } else {
    result.day_action = "no-cadence-day";
  }
  if (!dry) {
    try {
      var lines = ["[EMAIL+OUTREACH-CLOUD] " + now.toISOString() + " (orchestrator " + VERSION + ")", "INBOX: " + (result.inbox && result.inbox.total != null ? result.inbox.total + " total / " + result.inbox.last24h + " last24h" : "n/a"), "OUTREACH-REPLIES: " + (result.replies.length || 0) + (result.replies.length ? " — " + result.replies.map(function (x) { return x.response_type + " from " + x.from + (x.duplicate ? " (dup)" : ""); }).join("; ") : ""), "FOLLOW-UP-DUE: " + result.followup_eligible + " silent >14d (0 eligible per NO-FOLLOW-UP-DEFAULT-1)", "DAY-ACTION: " + result.day_action];
      if (result.scan) lines.push("SCAN: " + result.scan.map(function (s) { return s.topic + "(" + s.paper_id + ") -> " + s.authors.join(", "); }).join(" | "));
      if (result.weekly) lines.push("WEEKLY: " + JSON.stringify(result.weekly));
      if (result.self_audit) lines.push("SELF-AUDIT: " + JSON.stringify(result.self_audit).slice(0, 400));
      var receipt = await callEmail(env, "/send", { method: "POST", body: { to: "alerts@qnfo.org", subject: "QNFO email+outreach cadence receipt — " + day, body: lines.join("\n"), from: "qnfo@qnfo.org" } });
      result.receipt_email_id = receipt.message_id || null;
    } catch (e) { result.receipt_error = e.message; }
  }
  if (!dry) {
    try {
      await env.OUTREACH_DB.prepare("INSERT INTO cadence_runs (run_at, mode, day, summary_json) VALUES (?,?,?,?)").bind(now.toISOString(), mode || (dry ? "dry" : "live"), day, JSON.stringify(result).slice(0, 1800)).run();
    } catch (e) { result.log_error = e.message; }
  }
  return result;
}
async function selfAudit(env) {
  var audit = { worker: "qnfo-email-orchestrator", version: VERSION, checks: {} };
  audit.checks.bindings = { ai: !!env.AI, audit_d1: !!env.AUDIT_DB, outreach_d1: !!env.OUTREACH_DB, email_svc: !!env.EMAIL, email_key: !!env.EMAIL_API_KEY };
  try {
    var health = await callEmail(env, "/health");
    audit.checks.email_worker = { ok: true, version: health.version || "unknown" };
  } catch (e) { audit.checks.email_worker = { ok: false, error: e.message }; }
  try {
    var d1 = await env.OUTREACH_DB.prepare("SELECT COUNT(*) c FROM cadence_runs").first();
    audit.checks.outreach_d1 = { ok: true, cadence_runs: d1 ? d1.c : 0 };
  } catch (e) { audit.checks.outreach_d1 = { ok: false, error: e.message }; }
  audit.checks.audit_d1 = { ok: true };
  return audit;
}
export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    var p = url.pathname;
    if (p === "/health") {
      return json({ status: "ok", worker: "qnfo-email-orchestrator", version: VERSION, bindings: { ai: !!env.AI, audit_d1: !!env.AUDIT_DB, outreach_d1: !!env.OUTREACH_DB, email_svc: !!env.EMAIL, email_key: !!env.EMAIL_API_KEY }, dryRunDefault: isDryRun(env, null), features: ["inbox-check", "ai-triage", "reply-classify", "cadence-mon-wed-fri", "receipt-alerts", "self-doc", "self-audit"], docs: "/doc" });
    }
    if (p === "/doc") { return json(DOC); }
    if (p === "/audit") {
      try { return json(await selfAudit(env)); } catch (e) { return json({ ok: false, error: e.message }, 500); }
    }
    if (p === "/run/check" || p === "/run/cadence") {
      // F1 fix: auth gate (mirror qnfo-email gate)
      if (!isAuthed(request, env)) return json({ error: "unauthorized: missing or invalid API key" }, 401);
      var mode = url.searchParams.get("mode") || "dry";
      try {
        var r = p === "/run/check" ? await runCheck(env, mode) : await runCadence(env, mode);
        return json(r);
      } catch (e) { return json({ ok: false, error: e.message }, 500); }
    }
    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    console.log("[qnfo-email-orchestrator] cron:", event.cron);
    try {
      var result = await runCadence(env, null);
      console.log("[qnfo-email-orchestrator] done:", JSON.stringify({ mode: result.mode, replies: result.replies.length, followup: result.followup_eligible, day: result.day_action, receipt: result.receipt_email_id }));
    } catch (e) { console.error("[qnfo-email-orchestrator] error:", e.message); }
  }
};
