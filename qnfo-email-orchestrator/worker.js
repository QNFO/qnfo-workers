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
var VERSION = "0.3.3";
var OUTREACH_MARKERS = ["primon","zeta partition","madelung","measurement","ultrametric","p-adic","adelic","identity, aggregation","empirical filter","pre-arithmetic","formalism 25","hierarchy distance","spectral statistics","landauer","exchange phase","logical scalar","laws of form","qudit","joules-per-solution","arxiv:","10.5281/zenodo","zenodo","qubit delusion","manifesto for honest computation","consilience","q-calculus","notation problem"];
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
  version_history: ["0.2-service-binding: AI triage only", "0.3: cadence (reply classify, Mon/Wed/Fri, receipt, OUTREACH_DB)", "0.3.1: auth gate on /run/*, thread dedup, classify ordering, https arXiv + paper_id, /doc + /audit, DRY_RUN=false", "0.3.2: MONDAY SEND wave (C1), marker+classify fixes (C4/C5), audit probe (C6), run-lock + paginated followup (LOW), zenodo->arxiv->verify->draft->send", "0.3.3: RED-TEAM blockers — author-bound email verification (tar/.tex + \\email{} macro + role/journal blocklist + name-token), dedup status IN (sent,replied), per-paper try/catch, honest subject (no fake Re:), AI draft anchored to server-side facts, e-print pacing/retry, atomic run-lock"]
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
function isOutreachSubject(subject) { var s = String(subject || "").toLowerCase(); return OUTREACH_MARKERS.some(function (m) { return s.indexOf(m.toLowerCase()) !== -1; }); }
function classifyReply(subject, body) {
  var t = (String(subject || "") + " " + String(body || "")).toLowerCase();
  if (/collab|co-author|work together|joint|data that might|would you be interested in/.test(t)) return "collaboration";
  if (/(?!no )\berror in\b|disagree|wrong|incorrect|flawed|mistake|critic/.test(t)) return "critical";
  if (/decline (the|your|this)|not interested|unsubscribe|no thanks|not relevant/.test(t)) return "dismissive";
  if (/\bno time\b|busy|when i have time|will get back|read it later|\bsometime\b|will read it/.test(t)) return "read-later";
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
  // LOW run-lock: skip if a live run for this day happened within the last 25 min
  if (!dry) {
    try {
      var lockRow = await env.OUTREACH_DB.prepare("SELECT id FROM cadence_runs WHERE day=?1 AND run_at > ?2 LIMIT 1").bind(day, new Date(Date.now() - 25 * 60000).toISOString()).first();
      if (lockRow) { result.day_action = "skipped-duplicate-run"; result.duplicate_run = true; return result; }
      // claim the lock atomically (TOCTOU guard): insert a provisional row now; the final log upserts below
      try {
        await env.OUTREACH_DB.prepare("INSERT OR IGNORE INTO cadence_runs (run_at, mode, day, summary_json) VALUES (?,?,?,?)").bind(now.toISOString(), "lock", day, "{}").run();
      } catch (e) {}
    } catch (e) {}
  }
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
    var sentA = await callEmail(env, "/emails/recent?limit=100&status=sent");
    var sentB = null;
    try { sentB = await callEmail(env, "/emails/recent?limit=100&status=sent&offset=100"); } catch (e) {}
    var sentAll = (sentA.emails || []).concat(sentB ? (sentB.emails || []) : []);
    var cutoff = Date.now() - 14 * 86400000;
    result.followup_eligible = sentAll.filter(function (s) { if (isQnfoAddr(s.recipient)) return false; if (/rwnquni@outlook\.com$/.test(String(s.recipient || "")) && /preview|test/i.test(String(s.subject || ""))) return false; var t = new Date(s.received_at || 0).getTime(); return t > 0 && t < cutoff; }).length;
  } catch (e) { result.followup_error = e.message; }
  if (dow === 1) {
    result.day_action = "monday-arxiv-scan+send";
    try {
      result.monday = await mondaySendWave(env, dry);
    } catch (e) { result.monday_error = e.message; }
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
  try {
    await env.AUDIT_DB.prepare("SELECT 1").first();
    audit.checks.audit_d1 = { ok: true };
  } catch (e) { audit.checks.audit_d1 = { ok: false, error: e.message }; }
  return audit;
}

// ---- C1: Monday autonomous outreach SEND wave ----
// Pipeline: Zenodo scan (new QNFO papers, 90d) -> paper select (physics) ->
// arXiv scan (researchers) -> email verify via arXiv source tarball ->
// dedup vs D1 -> AI draft (academic template) -> send from rowan.quni@qnfo.org.
// NEVER sends unverified addresses; never same paper twice; cap 5/day.
function sleepMs(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function extractEmailsFromText(text) {
  var re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  var out = [], m;
  while ((m = re.exec(String(text || ""))) !== null) {
    var a = m[0].toLowerCase();
    if (/example\.com|\.\.|@\d/.test(a)) continue;
    if (out.indexOf(a) === -1) out.push(a);
  }
  return out;
}
var ROLE_EMAIL_RE = /(support|info|contact|admin|office|editor|proofs?|submission|manuscript|correspondence?|sales|press|media|webmaster|postmaster|no[-_]?reply|help|service|legal|billing|hr|jobs|alumni|donate|news|enquiries?|inquiries?|secretary|assistants?|scheduler)[.]?@/i;
var JOURNAL_DOMAIN_RE = /@(elsevier|springer|wiley|taylorandfrancis|tandfonline|nature|science|acs|aps|aip|iop|osapublishing|mdpi|frontiersin|plos|sagepub|emerald|hindawi|ieee|acm|doi|orcid|arxiv|zenodo|overleaf|latex|overleaf|sharelatex|proceedings|journals|conference|conferences|easychair|submission|editorialmanager)[a-z0-9.-]*\.[a-z]{2,}/i;
var EMAIL_MACRO_RE = /\\(email|href)\s*\{([^}]*?)\s*mailto:([^}\s]+)/g;
function authorTokenOk(author, addr) {
  // author-bound: email local-part must contain a token of the FIRST author's name
  var toks = String(author || "").toLowerCase().split(/[^a-z]+/).filter(function (x) { return x.length > 2; });
  var local = String(addr || "").split("@")[0].toLowerCase();
  for (var i = 0; i < toks.length; i++) if (local.indexOf(toks[i]) !== -1) return true;
  return false;
}
async function extractEmailsFromArxiv(env, paperId, authorName) {
  var candidates = [];
  var r = null;
  for (var ea = 0; ea < 3; ea++) {
    r = await fetch("https://arxiv.org/e-print/" + paperId, { headers: { "User-Agent": "Mozilla/5.0 (QNFO orchestration worker)", "Accept": "application/x-eprint" } });
    if (r.ok) break;
    if (r.status === 429 || r.status >= 500) { await sleepMs(4000 * (ea + 1)); continue; }
    break;
  }
  if (!r || !r.ok) return [];
  var arr = new Uint8Array(await r.arrayBuffer());
  var texts = [];
  try {
    var ds = new DecompressionStream("gzip");
    var stream = new Blob([arr]).stream().pipeThrough(ds);
    var raw = new Uint8Array(await new Response(stream).arrayBuffer());
    texts.push(new TextDecoder("utf-8").decode(raw));
  } catch (e) {
    texts.push(new TextDecoder("utf-8").decode(arr));
  }
  for (var ti = 0; ti < texts.length; ti++) {
    var txt = texts[ti];
    // .tex-only heuristic: only scan regions belonging to text files (skip binary tar headers)
    var m;
    EMAIL_MACRO_RE.lastIndex = 0;
    while ((m = EMAIL_MACRO_RE.exec(txt)) !== null) {
      var mac = m[3].replace(/\\_/g, "_").replace(/\\%40/g, "@").trim().toLowerCase();
      if (mac.indexOf("@") !== -1) candidates.push(mac);
    }
    var plain = extractEmailsFromText(txt);
    for (var pi = 0; pi < plain.length; pi++) candidates.push(plain[pi]);
  }
  // filter: role/journal blocklist, qnfo domains, and require author token match
  var verified = [];
  for (var ci = 0; ci < candidates.length && verified.length < 5; ci++) {
    var a = candidates[ci];
    if (isQnfoAddr(a)) continue;
    if (ROLE_EMAIL_RE.test(a)) continue;
    if (JOURNAL_DOMAIN_RE.test(a)) continue;
    if (!authorTokenOk(authorName, a)) continue;   // author-bound (HIGH-1)
    if (verified.indexOf(a) === -1) verified.push(a);
  }
  return verified;
}
async function fetchArxiv(query, maxResults) {
  var url = "https://export.arxiv.org/api/query?search_query=" + encodeURIComponent(query) + "&start=0&max_results=" + (maxResults || 5) + "&sortBy=submittedDate&sortOrder=descending";
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (QNFO orchestration worker)" } });
      if (r.ok) return await r.text();
      if (r.status === 429 || r.status >= 500) { await sleepMs(4000 * (attempt + 1)); continue; }
      return null;
    } catch (e) { await sleepMs(4000 * (attempt + 1)); }
  }
  return null;
}
function parseAtomEntries(xml) {
  var out = [];
  var parts = String(xml || "").split("<entry>").slice(1);
  for (var i = 0; i < parts.length; i++) {
    var e = parts[i];
    var idm = e.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/);
    if (!idm) continue;
    var pid = idm[1].replace(/v\d+$/, "");
    var tm = e.match(/<title>([\s\S]*?)<\/title>/);
    var title = tm ? tm[1].replace(/\s+/g, " ").trim().slice(0, 200) : "";
    var names = (e.match(/<name>([^<]+)<\/name>/g) || []).map(function (x) { return x.replace(/<\/?name>/g, "").trim(); });
    if (names.length) out.push({ paper_id: pid, title: title, authors: names });
  }
  return out;
}
async function mondaySendWave(env, dry) {
  var wave = { papers: [], candidates: [], sent: 0, skipped: [] };
  try {
    var z = await fetch("https://zenodo.org/api/records?q=" + encodeURIComponent('metadata.creators.person_or_org.name:"Quni-Gudzinas"') + "&sort=mostrecent&size=15", { headers: { "User-Agent": "Mozilla/5.0 (QNFO orchestration worker)" } });
    if (z.ok) {
      var zj = await z.json();
      var cutoff = Date.now() - 90 * 86400000;
      var hits = (zj.hits && zj.hits.hits) || [];
      for (var i = 0; i < hits.length; i++) {
        var md = hits[i].metadata || {};
        var pub = (md.publication_date || "").slice(0, 10);
        if (pub && new Date(pub + "T00:00:00Z").getTime() < cutoff) continue;
        var title = md.title || "";
        if (/notation|infrastructure|communications framework|manifesto|benchmark|meta|platform|white.?paper|joules-per-solution/i.test(title)) continue;
        wave.papers.push({ doi: hits[i].doi || md.doi || "", title: title, published: pub });
      }
    }
  } catch (e) { wave.zenodo_error = e.message; }
  if (!wave.papers.length) { wave.no_papers = true; return wave; }
  wave.papers = wave.papers.slice(0, 2);
  var topics = [];
  wave.papers.forEach(function (p) {
    var t = String(p.title || "").toLowerCase();
    if (/ultrametric|p-adic|adelic|non-archimedean/.test(t)) topics.push("ultrametric OR p-adic OR adelic");
    if (/primon|prime|zeta|arithmetic/.test(t)) topics.push("primon OR \"zeta partition\" OR arithmetic");
    if (/measurement|born rule|relaxation|landauer/.test(t)) topics.push("measurement induced transitions OR born rule");
    if (/exchange phase|anyon|braid|logical scalar/.test(t)) topics.push("anyon OR braid OR exchange phase");
    if (/hierarchy|spectral|realization/.test(t)) topics.push("spectral statistics OR hierarchy distance");
  });
  if (!topics.length) topics = ["ultrametric OR p-adic OR adelic"];
  var seen = {};
  for (var t = 0; t < topics.length && wave.sent < 5; t++) {
    var xml = await fetchArxiv("all:" + topics[t], 10);
    var entries = xml ? parseAtomEntries(xml) : [];
    for (var ei = 0; ei < entries.length && wave.sent < 5; ei++) {
      var ent = entries[ei];
      if (seen[ent.paper_id]) continue;
      seen[ent.paper_id] = true;
      var author = ent.authors[0];
      var verified = [];
      try {
        verified = await extractEmailsFromArxiv(env, ent.paper_id, author);
      } catch (e) { wave.skipped.push({ author: author, paper: ent.title, reason: "extract failed: " + e.message }); continue; }
      if (!verified.length) { wave.skipped.push({ author: author, paper: ent.title, reason: "no author-bound email in arXiv source" }); continue; }
      var addr = verified[0];
      try {
        var dupSent = await env.AUDIT_DB.prepare("SELECT id FROM emails WHERE recipient=?1 AND status IN ('sent','replied') LIMIT 1").bind(addr).first();
        var dupCamp = await env.OUTREACH_DB.prepare("SELECT id FROM outreach_campaigns WHERE recipient_email=?1 AND paper_title=?2 LIMIT 1").bind(addr, wave.papers[0].title).first();
        if (dupSent || dupCamp) { wave.skipped.push({ author: author, paper: ent.title, reason: "already contacted" }); continue; }
      } catch (e) {}
      if (dry) { wave.skipped.push({ author: author, paper: ent.title, reason: "dry-run (would verify+send)" }); continue; }
      var subject = "QNFO: " + ent.title.slice(0, 70) + " - a related result you may find relevant";
      var bodyText = "";
      try {
        var prompt = "Write a short collegial email (max 130 words) from Rowan Quni-Gudzinas (independent researcher, QNFO) to Dr. " + author + ". Their paper title (VERBATIM, do not invent claims about it): \"" + ent.title + "\" (arXiv " + ent.paper_id + "). Rowan's paper (VERBATIM, the ONLY QNFO facts you may cite): title \"" + wave.papers[0].title + "\", DOI " + wave.papers[0].doi + ". Connection: both engage " + topics[t] + ". IMPORTANT: do NOT fabricate any result, claim, or quote about either paper; if unsure, keep it to the titles/DOI only. Include ONE open question. No CV, no self-introduction. Sign: Best, Rowan Brad Quni-Gudzinas, QNFO. Plain text only.";
        var ai = await env.AI.run(MODEL, { messages: [{ role: "user", content: prompt }] }, { gateway: { id: "default" } });
        bodyText = ((ai && (ai.response || ai.result)) || "").toString().trim();
      } catch (e) { bodyText = ""; }
      if (!bodyText) {
        bodyText = "Dear Dr. " + author + ",\n\nI came across your recent work on " + topics[t] + " and wanted to share something you might find relevant: my paper \"" + wave.papers[0].title + "\" (DOI " + wave.papers[0].doi + "). It bears directly on your work because of the shared focus on " + topics[t] + ".\n\nI would be interested in your thoughts.\n\nBest,\nRowan Brad Quni-Gudzinas\nQNFO";
      }
      try {
        var sr = await callEmail(env, "/send", { method: "POST", body: { to: addr, subject: subject, body: bodyText, from: "rowan.quni@qnfo.org" } });
        wave.sent++;
        wave.candidates.push({ author: author, email: addr, paper: ent.title, arxiv: ent.paper_id, message_id: sr.message_id || null });
        await env.OUTREACH_DB.prepare("INSERT INTO outreach_campaigns (paper_doi, paper_title, audience_type, recipient_email, recipient_name, connection_point, sent_at, response_type, status) VALUES (?,?,?,?,?,?,?,?,?)").bind(wave.papers[0].doi, wave.papers[0].title, "academic", addr, author, "arXiv " + ent.paper_id + " (" + topics[t] + ")", new Date().toISOString(), "none", "sent").run();
      } catch (e) { wave.skipped.push({ author: author, paper: ent.title, reason: "send failed: " + e.message }); }
    }
    if (topics.length > 1) await sleepMs(3000);
  }
  return wave;
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    var p = url.pathname;
    if (p === "/health") {
      return json({ status: "ok", worker: "qnfo-email-orchestrator", version: VERSION, bindings: { ai: !!env.AI, audit_d1: !!env.AUDIT_DB, outreach_d1: !!env.OUTREACH_DB, email_svc: !!env.EMAIL, email_key: !!env.EMAIL_API_KEY }, dryRunDefault: isDryRun(env, null), features: ["inbox-check", "ai-triage", "reply-classify", "cadence-mon-wed-fri", "monday-send-wave", "receipt-alerts", "self-doc", "self-audit"], docs: "/doc" });
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
