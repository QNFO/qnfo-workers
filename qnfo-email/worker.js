var VERSION = "2.0.8"; // var (not const): qnfo-ops cfWorkerRead needs /var VERSION = "..."/ for the /ops/deploy expected_version guard
const QNFO_VERSION = "qnfo-email/reply-capture-942-tone-950-norepeat-947";
const BODY_MAX_TEXT = 1e4;
const BODY_MAX_HTML = 2e4;
const PREVIEW_LENGTH = 200;
const OPS_BASE = "https://ops.qnfo.org";

const HELP = [
"QNFO email command control v" + VERSION,
"Email qnfo@qnfo.org (or reply to any QNFO email) with a command.",
"",
"READ (any time):",
"  help            this text",
"  status / health fleet + worker health",
"  fleet / workers worker census + drift",
"  registry        service registry",
"  manifest        ops-exec capability manifest",
"  cost            AI spend (today + 30d)",
"  analytics       Cloudflare analytics (30d)",
"  email / inbox   inbound email stats + recent",
"  read <id>       full body of inbound email <id>",
"  job <id>        poll an async ops-exec job",
"",
"ACTIONS (owner sender only): anything else goes to the ops-exec agent as a",
"natural-language task (e.g. 'pause outreach', 'rollback qnfo-email', 'list",
"drift'). You get back 'queued <job-id>'; reply 'job <job-id>' to poll it.",
"",
"AUTH: sender must be in email_command_senders. owner = full; agent = read-only.",
"Self-ingestion is quarantined (issue 951). COMMAND_TOKEN (if set) gates actions."
].join("\n");

export default {
  async email(message, env, ctx) {
    const startTime = Date.now();
    const from = message.from, to = message.to, headers = message.headers;
    const raw = message.raw, rawSize = message.rawSize;
    const subject = headers.get("subject") || "(no subject)";
    const messageId = headers.get("message-id") || (Date.now() + "-" + crypto.randomUUID());
    const inReplyTo = headers.get("in-reply-to") || null;
    const refsHdr = headers.get("references") || null;
    const receivedAt = new Date().toISOString();
    const parsed = await parseBody(raw);
    const bodyText = parsed.bodyText, bodyHtml = parsed.bodyHtml, rawText = parsed.rawText || "";
    const classification = classifyAddress(to);
    const headersJson = JSON.stringify(Object.fromEntries(headers.entries()));
    // EMAIL-STORE-BEFORE-FILTER-1 (963): evaluate filters BEFORE persisting so a
    // reject rule prevents ingestion (and stops cross-talk mail growing the mailbox).
    const filterResult = await applyFilters(env.AUDIT_DB, from, to, subject, bodyText);
    if (filterResult.action === "reject") {
      message.setReject(filterResult.reason || "Email rejected by policy");
      return;
    }
    const emailId = await storeEmail(env.AUDIT_DB, {
      messageId: messageId, from: from, to: to, subject: subject,
      bodyText: truncate(bodyText, BODY_MAX_TEXT), bodyHtml: truncate(bodyHtml, BODY_MAX_HTML),
      headersJson: headersJson, classification: classification,
      receivedAt: receivedAt, inReplyTo: inReplyTo, refsHdr: refsHdr
    });
    try {
      var __evRaw = rawText || "";
      var __subj = String(subject || "").toLowerCase();
      var __isEv = __evRaw.indexOf("BEGIN:VCALENDAR") >= 0 || __evRaw.indexOf("text/calendar") >= 0 || /invitation|appointment|confirmation|booking|reservation|check-in|itinerary|flight|reminder:/.test(__subj);
      if (__isEv && env.EVENTS) {
        ctx.waitUntil(env.EVENTS.fetch("https://qnfo-events/ingest", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (env.INGEST_TOKEN || "") }, body: JSON.stringify({ messageId: messageId, from: from, to: to, subject: subject, raw: __evRaw.slice(0, 60000), body: (bodyText || "").slice(0, 4000) }) }).catch(function (e) { console.error("events forward", e && e.message || e); }));
      }
    } catch (e) { console.error("events hook", e && e.message || e); }
    await sendNotification(env, { messageId: messageId, emailId: emailId, from: from, to: to, subject: subject, classification: classification, preview: truncate(bodyText, PREVIEW_LENGTH), bodySize: rawSize, receivedAt: receivedAt });
    if (filterResult.action === "auto_reply" && filterResult.replyTemplate) {
      try {
        if (env.SEND_EMAIL) {
          const replyBody = filterResult.replyTemplate
            .split("{{from}}").join(from).split("{{to}}").join(to)
            .split("{{subject}}").join(subject).split("{{classification}}").join(classification)
            .split("{{date}}").join(new Date().toISOString());
          await env.SEND_EMAIL.send({ to: from, from: to, subject: "Re: " + subject, text: replyBody, html: "<p>" + replyBody.split("\n").join("<br>") + "</p>" });
        }
      } catch (e) { console.error("Auto-reply:", e.message); }
    }
    await processCommand(env, { emailId: emailId, messageId: messageId, inReplyTo: inReplyTo, from: from, to: to, subject: subject, bodyText: bodyText });
    ctx.waitUntil(enqueueHumanReply(env, { emailId: emailId, from: from, subject: subject, receivedAt: receivedAt, classification: classification, headersJson: headersJson }));
    await logAction(env.AUDIT_DB, emailId, "processed", classification, startTime);
  },

  async scheduled(controller, env, ctx) {
    try { const r = await sendInboundDigest(env); console.log("inbound-digest:", JSON.stringify(r)); }
    catch (e) { console.error("inbound-digest failed:", String(e && e.message || e)); }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const json = function(data, status) { return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); };
    const rawPath = url.pathname;
    let p = url.pathname;
    if (p === "/email" || p.startsWith("/email/")) p = p.replace("/email", "") || "/";

    if (p === "/unsubscribe") {
      try {
        const ue = String(url.searchParams.get("e") || "").trim().toLowerCase();
        const ut = String(url.searchParams.get("t") || "").trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ue)) return new Response("<!doctype html><meta charset=utf-8><h1>Invalid link</h1>", { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
        const want = (await sha16(ue + ":qnfo-unsub-2026")).slice(0, 16);
        if (ut !== want) return new Response("<!doctype html><meta charset=utf-8><h1>Invalid or expired link</h1>", { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } });
        await env.AUDIT_DB.prepare("INSERT INTO email_suppression (email, reason, source) VALUES (?1,'unsubscribe','link') ON CONFLICT(email) DO UPDATE SET reason='unsubscribe', source='link', created_at=datetime('now')").bind(ue).run();
        await env.AUDIT_DB.prepare("INSERT OR IGNORE INTO email_send_violations (recipient, sender, subject, violation, detail, resolved) VALUES (?1,'system','unsubscribe','UNSUBSCRIBE-HONOURED','opt-out',1)").bind(ue).run().catch(function(){});
        return new Response("<!doctype html><html><head><meta charset=utf-8><title>Removed</title></head><body style='font:16px/1.6 system-ui;max-width:34rem;margin:4rem auto;padding:0 1.2rem'><h1>You have been removed</h1><p>This address will not be contacted again.</p></body></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
      } catch (e) { return new Response("error: " + e.message, { status: 500 }); }
    }

    if (request.method !== "OPTIONS" && rawPath !== "/health") {
      const auth = request.headers.get("Authorization") || "";
      const apiKey = env.API_KEY || "", gwKey = env.GATEWAY_EMAIL_KEY || "";
      const xk = request.headers.get("x-api-key") || "";
      const okMain = apiKey && (auth === "Bearer " + apiKey || xk === apiKey);
      const okGw = gwKey && (auth === "Bearer " + gwKey || xk === gwKey);
      if (!okMain && !okGw) return json({ error: "unauthorized" }, 401);
    }

    if (p === "/health") {
      return json({ status: "ok", worker: "qnfo-email", version: VERSION, command_control: true, bindings: { d1: !!env.AUDIT_DB, send_email: !!env.SEND_EMAIL, ops_key: !!env.OPS_KEY, command_token: !!env.COMMAND_TOKEN }, timestamp: new Date().toISOString() });
    }

    if (p === "/command" && request.method === "POST") {
      try {
        const b = await request.json();
        const sender = b.sender || b.from || "";
        const dry = url.searchParams.get("dry") === "1" || b.dry === true;
        const c = { emailId: 0, messageId: "http-" + crypto.randomUUID(), inReplyTo: b.in_reply_to || null, from: sender, to: b.to || "qnfo@qnfo.org", subject: b.subject || "(http command)", bodyText: b.body || b.command || "" };
        const row = await lookupSender(env.AUDIT_DB, normalizeAddress(sender));
        if (!row) return json({ ok: false, error: "sender not in command allowlist" }, 403);
        const kind = row.kind;
        const pc = parseCommand(c.bodyText, c.subject);
        let result;
        try { result = await routeCommand(env, pc.verb, pc.commandText, kind); }
        catch (e) { result = { ok: false, error: String(e && e.message || e) }; }
        const replyText = formatResult(pc.verb, pc.commandText, result, kind);
        let sent = false;
        if (!dry && env.SEND_EMAIL && sender) {
          try { await env.SEND_EMAIL.send({ to: sender, from: "qnfo@qnfo.org", subject: "Re: " + c.subject, text: replyText }); sent = true; }
          catch (e) { result.reply_error = String(e && e.message || e); }
        }
        return json({ ok: result.ok !== false, verb: pc.verb, kind: kind, dry: dry, reply_sent: sent, result: result, reply: replyText });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (p === "/commands" && request.method === "GET") {
      try { const r = await env.AUDIT_DB.prepare("SELECT * FROM email_commands ORDER BY id DESC LIMIT 50").all(); return json({ count: (r.results || []).length, commands: r.results || [] }); }
      catch (e) { return json({ error: e.message }, 500); }
    }

    if (p === "/command-senders" && request.method === "GET") {
      try { const r = await env.AUDIT_DB.prepare("SELECT * FROM email_command_senders ORDER BY id").all(); return json({ senders: r.results || [] }); }
      catch (e) { return json({ error: e.message }, 500); }
    }

    if (p === "/emails/recent" && request.method === "GET") {
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const status = url.searchParams.get("status");
        let sql = "SELECT id, message_id, sender, recipient, subject, classification, status, received_at, processing_ms FROM emails";
        const params = [];
        if (status) { sql += " WHERE status=?" + (params.length + 1); params.push(status); }
        sql += " ORDER BY id DESC LIMIT ?" + (params.length + 1) + " OFFSET ?" + (params.length + 2);
        params.push(limit, offset);
        const stmt = env.AUDIT_DB.prepare(sql).bind.apply(env.AUDIT_DB.prepare(sql), params);
        const rows = await stmt.all();
        return json({ count: rows.results ? rows.results.length : 0, emails: rows.results || [] });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (p === "/emails/body" && request.method === "GET") {
      try {
        const eid = parseInt(url.searchParams.get("id") || "0");
        const row = await env.AUDIT_DB.prepare("SELECT id, sender, recipient, subject, body_text, body_html, headers_json, classification, status, received_at, processing_ms FROM emails WHERE id=?1").bind(eid).first();
        if (!row) return json({ error: "not found" }, 404);
        return json(row);
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (p === "/emails/search" && request.method === "GET") {
      try {
        const q = url.searchParams.get("q") || "";
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
        const result = await env.AUDIT_DB.prepare("SELECT id, message_id, sender, recipient, subject, classification, status, received_at FROM emails WHERE subject LIKE ?1 OR sender LIKE ?1 OR body_text LIKE ?1 ORDER BY id DESC LIMIT ?2").bind("%" + q + "%", limit).all();
        return json({ query: q, count: result.results ? result.results.length : 0, emails: result.results || [] });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (p === "/stats" && request.method === "GET") {
      try {
        const all = await Promise.all([
          env.AUDIT_DB.prepare("SELECT COUNT(*) as count FROM emails").first(),
          env.AUDIT_DB.prepare("SELECT COUNT(*) as count FROM emails WHERE julianday(received_at) > julianday('now', '-24 hours')").first(),
          env.AUDIT_DB.prepare("SELECT classification, COUNT(*) as count FROM emails GROUP BY classification ORDER BY count DESC").all(),
          env.AUDIT_DB.prepare("SELECT status, COUNT(*) as count FROM emails GROUP BY status").all()
        ]);
        return json({ total: all[0] ? all[0].count : 0, last24h: all[1] ? all[1].count : 0, byClassification: all[2].results || [], byStatus: all[3].results || [] });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (p === "/send" && request.method === "POST") {
      if (!env.SEND_EMAIL) return json({ error: "send_email binding not available" }, 503);
      try {
        const body = await request.json();
        if (!body.to) return json({ error: "to is required" }, 400);
        const htmlBody = body.html || (body.body ? "<p>" + body.body.split("\n").join("<br>") + "</p>" : "");
        const textBody = body.body || (body.html ? body.html.replace(/<[^>]*>/g, "") : "");
        const replySubject = body.subject || "(no subject)";
        const ALLOWED_DOMAINS = ["qnfo.org","qwav.org","qwav.tech","qwav.net","qwav.uk","q-wave.tech","qwave.tech","q08.org","qnfo.net","qnfo.uk"]; // empoweringchange.today removed (lapsed 2026-09-18, issue 955)
        const fromDomain = (body.from || "").split("@")[1] || "";
        const FROM_ADDR = body.from && ALLOWED_DOMAINS.indexOf(fromDomain.toLowerCase()) >= 0 ? body.from : "qnfo@qnfo.org";
        // MCP-COLD-SEND-UNGATED (952): this send path had NO suppression check, so cold
        // sends could re-contact opted-out addresses. Honour email_suppression before send.
        try {
          const _sup = await env.AUDIT_DB.prepare("SELECT 1 FROM email_suppression WHERE lower(email)=?1").bind(String(body.to || "").toLowerCase()).first();
          if (_sup) return json({ error: "recipient is suppressed", to: body.to, suppressed: true }, 409);
        } catch (_e) { /* suppression lookup unavailable: proceed (no worse than before) */ }
        // GOOD-VIBES-REPLY-TONE-1 (950): block rejection / person-criticism outbound.
        const tg = toneGate(textBody);
        if (!tg.pass) return json({ error: "tone gate: " + tg.why, blocked: true }, 422);
        // EMAIL-LEDGER-FRAGMENTED (947): honour contact_ledger.suppress as a second signal.
        try {
          const _led = await env.AUDIT_DB.prepare("SELECT suppress, suppress_reason FROM contact_ledger WHERE lower(email)=?1").bind(String(body.to || "").toLowerCase()).first();
          if (_led && _led.suppress) return json({ error: "contact suppressed: " + (_led.suppress_reason || "opt-out"), to: body.to, suppressed: true }, 409);
        } catch (_e) { /* contact_ledger unavailable: proceed */ }
        const result = await env.SEND_EMAIL.send({ to: body.to, from: FROM_ADDR, subject: replySubject, text: textBody, html: htmlBody });
        const sentId = crypto.randomUUID();
        const now = new Date().toISOString();
        await env.AUDIT_DB.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, body_html, headers_json, classification, received_at, status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)").bind(sentId, FROM_ADDR, body.to, replySubject, textBody.substring(0, BODY_MAX_TEXT), htmlBody.substring(0, BODY_MAX_HTML), "{}", "general", now, "sent").run();
        if (body.reply_to_id) await env.AUDIT_DB.prepare("UPDATE emails SET status=?1 WHERE id=?2").bind("replied", body.reply_to_id).run();
        return json({ success: true, message_id: sentId, to: body.to, subject: replySubject, sent_at: now });
      } catch (e) { return json({ error: "send failed: " + e.message }, 500); }
    }

    if (p === "/filters" && request.method === "GET") {
      try { const result = await env.AUDIT_DB.prepare("SELECT * FROM email_filters ORDER BY priority DESC").all(); return json({ count: (result.results || []).length, filters: result.results || [] }); }
      catch (e) { return json({ error: e.message }, 500); }
    }
    if (p === "/filters" && request.method === "POST") {
      try {
        const f = await request.json();
        if (!f.field || !f.pattern) return json({ error: "field and pattern required" }, 400);
        const result = await env.AUDIT_DB.prepare("INSERT INTO email_filters (field, pattern, action, reply_template, priority, enabled, rule_type) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(f.field, f.pattern, f.action || "accept", f.reply_template || null, f.priority || 0, f.enabled !== false ? 1 : 0, f.rule_type || "filter").run();
        return json({ success: true, id: result.meta ? result.meta.last_row_id : 0 }, 201);
      } catch (e) { return json({ error: e.message }, 500); }
    }
    if (p.startsWith("/filters/") && request.method === "DELETE") {
      try { const fid = parseInt(p.split("/").pop()); await env.AUDIT_DB.prepare("DELETE FROM email_filters WHERE id=?1").bind(fid).run(); return json({ success: true, deleted: fid }); }
      catch (e) { return json({ error: e.message }, 500); }
    }
    if (p === "/emails/status" && request.method === "PATCH") {
      try {
        const b = await request.json();
        if (!b.id || !b.status) return json({ error: "id and status required" }, 400);
        const valid = ["received","processed","sent","replied","archived","spam","read","rejected"];
        if (valid.indexOf(b.status) < 0) return json({ error: "invalid status" }, 400);
        await env.AUDIT_DB.prepare("UPDATE emails SET status=?1 WHERE id=?2").bind(b.status, b.id).run();
        return json({ success: true, id: b.id, status: b.status });
      } catch (e) { return json({ error: e.message }, 500); }
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }
    return json({ worker: "qnfo-email", version: VERSION, endpoints: { health: "GET /health", command: "POST /command {sender, body}", commands: "GET /commands", command_senders: "GET /command-senders", emails: "GET /emails/recent | /emails/body | /emails/search", send: "POST /send", filters: "GET|POST /filters" } });
  }
};

function _hdr(head, name) {
  const nm = String(name || "").toLowerCase();
  for (const ln of String(head || "").split(/\r?\n/)) {
    const i = ln.indexOf(":");
    if (i > 0 && ln.slice(0, i).trim().toLowerCase() === nm) return ln.slice(i + 1).trim();
  }
  return "";
}
function _splitHB(s) {
  let i = s.indexOf("\r\n\r\n");
  if (i >= 0) return { head: s.slice(0, i), body: s.slice(i + 4) };
  i = s.indexOf("\n\n");
  if (i >= 0) return { head: s.slice(0, i), body: s.slice(i + 2) };
  return { head: "", body: s };
}
function _decodeCte(body, cte) {
  let b = String(body == null ? "" : body);
  const c = String(cte || "").toLowerCase();
  if (c.indexOf("quoted-printable") >= 0) {
    b = b.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, function(_, h){ return String.fromCharCode(parseInt(h, 16)); });
  } else if (c.indexOf("base64") >= 0) {
    try { b = atob(b.replace(/[^A-Za-z0-9+/=]/g, "")); } catch (e) { }
  }
  return b;
}
function _htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function _walkMime(rawText, acc) {
  const hb = _splitHB(rawText);
  const ctype = _hdr(hb.head, "content-type").toLowerCase();
  const cte = _hdr(hb.head, "content-transfer-encoding");
  if (ctype.indexOf("multipart/") === 0) {
    const bm = ctype.match(/boundary\s*=\s*"?([^";\r\n]+)"?/);
    if (bm) {
      for (const seg of hb.body.split("--" + bm[1].trim())) {
        const t = seg.replace(/^\r?\n/, "");
        if (!t.trim() || /^--\s*$/.test(t.trim())) continue;
        _walkMime(t, acc);
      }
      return acc;
    }
  }
  if (ctype.indexOf("text/html") >= 0) { if (!acc.html) acc.html = _decodeCte(hb.body, cte).trim(); }
  else if (ctype.indexOf("text/plain") >= 0) { if (!acc.text) acc.text = _decodeCte(hb.body, cte).trim(); }
  else if (!ctype) { if (!acc.text) acc.text = _decodeCte(hb.body, cte).trim(); }
  return acc;
}
async function parseBody(raw) {
  let bodyText = "", bodyHtml = "", rawText = "";
  try {
    rawText = await new Response(raw).text();
    const acc = _walkMime(rawText, { text: "", html: "" });
    bodyText = acc.text || "";
    bodyHtml = acc.html || "";
    if (!bodyText && bodyHtml) bodyText = _htmlToText(bodyHtml);
  } catch (e) {
    bodyText = "[parse: " + e.message + "]";
  }
  return { bodyText: bodyText, bodyHtml: bodyHtml, rawText: rawText };
}

async function storeEmail(db, data) {
  try {
    const result = await db.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, body_html, headers_json, classification, received_at, status, in_reply_to, references_hdr) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'received',?10,?11) ON CONFLICT(message_id) DO UPDATE SET recipient=?3,subject=?4,body_text=?5,body_html=?6,headers_json=?7,classification=?8,in_reply_to=?10,references_hdr=?11").bind(data.messageId, data.from, data.to, data.subject, data.bodyText, data.bodyHtml, data.headersJson, data.classification, data.receivedAt, data.inReplyTo, data.refsHdr).run();
    // EMAIL-STOREEMAIL-LASTROWID-UNSAFE (959): meta.last_row_id is unreliable after
    // ON CONFLICT(message_id) DO UPDATE - re-select the actual row id by message_id.
    const row = await db.prepare("SELECT id FROM emails WHERE message_id = ?1").bind(data.messageId).first();
    return (row && row.id) || 0;
  } catch (e) { console.error("D1 store:", e.message); return 0; }
}

async function logAction(db, emailId, action, detail, startTime) {
  try {
    const ms = Date.now() - startTime;
    await db.prepare("UPDATE emails SET status=?1, processed_at=datetime('now'), processing_ms=?2 WHERE id=?3").bind(action, ms, emailId).run();
  } catch (e) { console.error("D1 log:", e.message); }
}

// EMAIL-AUTOREPLY-PATH-UNSAFE (945) + EMAIL-HUMAN-REPLY-LOOP-MISSING (942):
// classify an inbound sender as human-or-machine so the reply agent can never
// auto-reply to a relay/bounce/bulk source and create a mail loop.
function classifyHumanSender(from, hdr) {
  const f = String(from || "").toLowerCase();
  const auto = String((hdr && hdr["auto-submitted"]) || "").toLowerCase();
  const prec = String((hdr && hdr["precedence"]) || "").toLowerCase();
  const xar = String((hdr && (hdr["x-autorespond"] || hdr["x-auto-response-suppress"])) || "").toLowerCase();
  if (/bounce|noreply|no-reply|cf-bounce|cfbounces|srs0=|dmarcreport|mailer-daemon|postmaster|do-not-reply|do_not_reply|nobody@/i.test(f)) return { human: false, score: 0, reason: "machine-address" };
  if (auto && auto !== "no") return { human: false, score: 0, reason: "auto-submitted" };
  if (prec === "bulk" || prec === "list" || prec === "junk") return { human: false, score: 0, reason: "bulk-precedence" };
  if (xar) return { human: false, score: 0, reason: "auto-responder" };
  return { human: true, score: 2, reason: "" };
}

// GOOD-VIBES-REPLY-TONE-1 (950): block outbound text that is a rejection of the
// recipient's work or criticism of the recipient. The substance of a valid
// correction is kept in the corrections ledger + errata pipeline, never framed
// as negative feedback to a person. Deliberately scoped to PERSON-directed
// language so a legitimate "the value is incorrect" is not blocked.
function toneGate(text) {
  const t = String(text || "");
  const REJECT = /(we (must )?(decline|reject|refuse)|your (manuscript|paper|submission|proposal|application|work) (has been|is|was) (rejected|declined)|we regret to inform|does not meet (our|the) (standards|bar|requirements)|not (suitable|acceptable|a good fit))/i;
  const PERSON = /(you (are|were) (wrong|mistaken|incompetent)|your (work|paper|approach|analysis|research) (is|was) (wrong|flawed|nonsense|garbage|worthless|banal|bad)|this (is|shows) (bad|poor) science)/i;
  if (REJECT.test(t) || PERSON.test(t)) return { pass: false, why: "rejection-or-criticism-tone" };
  return { pass: true, why: "" };
}

// EMAIL-HUMAN-REPLY-LOOP-MISSING (942): route human inbound into the reply
// queue (decision=pending) instead of leaving it stranded at status=processed.
// Machine senders are excluded here; suppression + no-repeat are enforced at
// draft/send time by the reply agent.
async function enqueueHumanReply(env, d) {
  try {
    let hdrObj = {};
    try { hdrObj = JSON.parse(d.headersJson || "{}") || {}; } catch (e) {}
    const hsm = classifyHumanSender(d.from, hdrObj);
    if (!hsm.human) return { queued: false, reason: hsm.reason };
    if (d.classification === "alerts" || d.classification === "research" || d.classification === "publications") return { queued: false, reason: "non-human-address" };
    const existing = await env.AUDIT_DB.prepare("SELECT id FROM email_reply_queue WHERE email_id=?1").bind(d.emailId).first();
    if (existing) return { queued: false, reason: "already-queued" };
    const sup = await env.AUDIT_DB.prepare("SELECT 1 FROM email_suppression WHERE lower(email)=?1").bind(String(d.from || "").toLowerCase()).first();
    if (sup) return { queued: false, reason: "suppressed" };
    await env.AUDIT_DB.prepare("INSERT INTO email_reply_queue (email_id, sender, subject, received_at, human_score, decision, created_at) VALUES (?1,?2,?3,?4,?5,'pending',datetime('now'))")
      .bind(d.emailId, d.from, d.subject, d.receivedAt, hsm.score).run();
    return { queued: true };
  } catch (e) { console.error("reply-enqueue:", e.message); return { queued: false, reason: "error:" + e.message }; }
}

function classifyAddress(to) {
  const a = (to || "").toLowerCase();
  if (a.indexOf("research") >= 0) return "research";
  if (a.indexOf("alert") >= 0) return "alerts";
  if (a.indexOf("publication") >= 0) return "publications";
  if (a.indexOf("rowan.quni") >= 0) return "personal";
  if (a.indexOf("admin") >= 0) return "admin";
  return "general";
}

async function applyFilters(db, from, to, subject, body) {
  try {
    const result = await db.prepare("SELECT * FROM email_filters WHERE enabled=1 ORDER BY priority DESC").all();
    for (const f of result.results || []) {
      if (matchesFilter(f, from, to, subject, body)) return { action: f.action, reason: f.reply_template || ("Matched: " + f.pattern), replyTemplate: f.reply_template || null, filterId: f.id };
    }
  } catch (e) { console.error("Filter:", e.message); }
  return { action: "accept" };
}

function matchesFilter(f, from, to, subject, body) {
  const p = (f.pattern || "").toLowerCase();
  if (!p) return false;
  let t = "";
  if (f.field === "from") t = from;
  else if (f.field === "to") t = to;
  else if (f.field === "subject") t = subject;
  else if (f.field === "body") t = body;
  else t = from + " " + to + " " + subject + " " + body;
  return (t || "").toLowerCase().indexOf(p) >= 0;
}

async function sendNotification(env, data) {
  const wh = env.NOTIFY_WEBHOOK;
  if (!wh) { console.log("[EMAIL] " + data.classification + ": " + data.from + " -> " + data.to + ": " + data.subject); return; }
  try { await fetch(wh, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "email_received", timestamp: data.receivedAt, messageId: data.messageId, emailId: data.emailId, sender: data.from, recipient: data.to, subject: data.subject, classification: data.classification, preview: data.preview, bodySize: data.bodySize }) }); }
  catch (e) { console.error("Webhook:", e.message); }
}

async function sha16(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
}

function truncate(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? text.substring(0, maxLength) + "\u2026" : text;
}

function decodeSubject(s) {
  s = String(s || "");
  return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, function(m, cs, enc, data) {
    try {
      if (enc.toLowerCase() === "b") {
        const bin = atob(data);
        const bytes = Uint8Array.from(bin, function(c){ return c.charCodeAt(0); });
        return new TextDecoder(cs === "" ? "utf-8" : cs).decode(bytes);
      } else { return data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, function(_, h){ return String.fromCharCode(parseInt(h, 16)); }); }
    } catch (e) { return m; }
  }).replace(/\s+/g, " ").trim();
}

async function sendInboundDigest(env) {
  const OWNER = "rwnquni@outlook.com";
  const MACHINE = /srs0=|cf-bounce|cfbounces|dmarcreport|mailer-daemon|postmaster|bounces\+/i;
  const CRITICAL = /api access|spend|threshold|action needed|rejected|undelivered|discontinu|postpon|pricing|billing|turned off|suspension/i;
  // SUPPRESSION-1 (2026-09-22): honour owner opt-out before any digest send.
  try { const _s = await env.AUDIT_DB.prepare("SELECT 1 FROM email_suppression WHERE lower(email)=?1").bind(OWNER).first(); if (_s) return { sent: false, reason: "owner suppressed" }; } catch (e) {}
  let rows = [];
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const r = await env.AUDIT_DB.prepare("SELECT id, sender, recipient, subject, classification, status, received_at FROM emails WHERE status NOT IN ('sent','spam','archived','rejected') AND received_at >= ? ORDER BY id DESC LIMIT 200").bind(since).all();
    rows = r.results || [];
  } catch (e) { return { sent: false, error: "query: " + String(e && e.message || e).slice(0, 150) }; }
  const crit = [], human = [], seen = {};
  for (const r of rows) { if (MACHINE.test(String(r.sender || ""))) continue; const s = decodeSubject(r.subject); if (CRITICAL.test(s)) { crit.push(r); seen[r.id] = 1; } }
  for (const r of rows) { if (seen[r.id]) continue; if (MACHINE.test(String(r.sender || ""))) continue; human.push(r); }
  if (!crit.length && !human.length) return { sent: false, reason: "nothing to surface" };
  const day = new Date().toISOString().slice(0, 10);
  const fmt = function(r){ return "  [" + r.id + "] " + decodeSubject(r.subject).slice(0, 90) + " <- " + (r.sender || "?"); };
  const L = [];
  L.push("QNFO inbound digest - " + day); L.push("");
  if (crit.length) { L.push("OPERATIONAL (verify each):"); for (const r of crit) L.push(fmt(r)); L.push(""); }
  if (human.length) { L.push("FROM PEOPLE (may need a reply):"); for (const r of human) L.push(fmt(r)); L.push(""); }
  L.push("Reply to this email with a command (e.g. 'read <id>', 'status', 'help') to act.");
  try { await env.SEND_EMAIL.send({ to: OWNER, from: "qnfo@qnfo.org", subject: "QNFO inbound digest - " + day, text: L.join("\n") }); return { sent: true, critical: crit.length, human: human.length }; }
  catch (e) { return { sent: false, error: "send: " + String(e && e.message || e).slice(0, 150) }; }
}

// ===== COMMAND LAYER =====
function normalizeAddress(a) {
  let s = String(a || "").trim();
  const lt = s.indexOf("<");
  if (lt >= 0) { const gt = s.indexOf(">", lt); if (gt > lt) s = s.slice(lt + 1, gt); }
  s = s.replace(/^prvs=[^=]+=/, "").replace(/^SRS0=[^=]+=[^=]+=/, "");
  return s.toLowerCase().trim();
}

async function lookupSender(db, sender) {
  try {
    const rows = await db.prepare("SELECT pattern, kind, enabled FROM email_command_senders").all();
    for (const r of rows.results || []) {
      if (!r.enabled) continue;
      const p = normalizeAddress(r.pattern);
      if (!p) continue;
      if (p === sender) return { kind: r.kind };
      if (p.charAt(0) === "@" && sender.endsWith(p)) return { kind: r.kind };
    }
  } catch (e) { console.error("lookupSender:", e.message); }
  return null;
}

function parseCommand(bodyText, subject) {
  let t = String(bodyText == null ? "" : bodyText).replace(/\r/g, "");
  const keep = [];
  let started = false;
  for (const rawLine of t.split("\n")) {
    const s = rawLine.trim();
    if (!s) { if (started) break; continue; }
    if (/^>/.test(s)) { if (started) break; continue; }
    if (/^_{6,}$/.test(s)) break;
    if (/^-{2,}\s*$/.test(s)) break;
    if (/^-{2,}\s*(original message|forwarded message|forwarded)/i.test(s)) break;
    if (/^on .{6,}wrote:?$/i.test(s)) break;
    if (/^(from|sent|to|cc|bcc|date|subject|reply-to)\s*:/i.test(s)) break;
    if (/^<[^>]+>$/.test(s)) continue;
    started = true;
    keep.push(s);
  }
  t = keep.join("\n").trim();
  if (!t) t = String(subject || "").replace(/^((re|fwd|fw)\s*:\s*)+/i, "").trim();
  const m = t.match(/^([A-Za-z][A-Za-z0-9_-]*)(?:\s+([\s\S]*))?$/);
  if (!m) return { verb: t.toLowerCase().slice(0, 60), commandText: "" };
  return { verb: m[1].toLowerCase(), commandText: (m[2] || "").trim() };
}

function isSelfIngest(c, sender) {
  const internal = /@(qnfo\.org|q08\.org|qwav\.(org|tech|net|uk)|q-wave\.tech|qwave\.tech)$/i;
  return internal.test(String(c.to || "")) && internal.test(sender);
}

async function setCmdStatus(db, id, status, result) {
  if (!id) return;
  try { await db.prepare("UPDATE email_commands SET status=?1, result=?2, updated_at=datetime('now') WHERE id=?3").bind(status, result || null, id).run(); }
  catch (e) { console.error("setCmdStatus:", e.message); }
}

async function processCommand(env, c) {
  const db = env.AUDIT_DB;
  const sender = normalizeAddress(c.from);
  const row = await lookupSender(db, sender);
  if (!row) return null;
  const kind = row.kind || "owner";
  const pc = parseCommand(c.bodyText, c.subject);
  let cmdId = 0;
  try {
    const ins = await db.prepare("INSERT INTO email_commands (email_id, message_id, in_reply_to, sender, recipient, subject, verb, command_text, status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'pending')").bind(c.emailId, c.messageId, c.inReplyTo || null, sender, c.to, c.subject, pc.verb, pc.commandText).run();
    cmdId = ins.meta ? ins.meta.last_row_id || 0 : 0;
  } catch (e) { console.error("cmd-log:", e.message); }

  if (kind === "agent" && isSelfIngest(c, sender)) {
    try {
      await db.prepare("INSERT INTO email_loop_quarantine (orig_id, message_id, sender, recipient, subject, body_text, classification, status, received_at, reason) VALUES (?1,?2,?3,?4,?5,?6,'general','received',?7,'self-ingestion loop (issue 951)')").bind(c.emailId, c.messageId, sender, c.to, c.subject, truncate(c.bodyText, 2000), new Date().toISOString()).run();
    } catch (e) { console.error("quarantine:", e.message); }
    await setCmdStatus(db, cmdId, "quarantined", "self-ingestion loop");
    return { quarantined: true };
  }

  let result;
  try { result = await routeCommand(env, pc.verb, pc.commandText, kind); }
  catch (e) { result = { ok: false, error: String(e && e.message || e) }; }

  await setCmdStatus(db, cmdId, result.ok === false ? "error" : "done", truncate(JSON.stringify(result), 4000));

  if (env.SEND_EMAIL && !c.dry) {
    const replyText = formatResult(pc.verb, pc.commandText, result, kind);
    try { await env.SEND_EMAIL.send({ to: c.from, from: "qnfo@qnfo.org", subject: "Re: " + c.subject, text: replyText }); }
    catch (e) { console.error("reply:", e.message); }
  }
  return result;
}

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    const txt = await res.text();
    if (!res.ok) return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
  } catch (e) { return null; }
}

async function cmdOps(env, path) {
  const j = await getJson(OPS_BASE + path);
  if (j === null) return { ok: false, error: "ops endpoint " + path + " unreachable" };
  return { ok: true, text: truncate(JSON.stringify(j, null, 2), 3000) };
}

async function cmdHealth(env) {
  const ops = await getJson(OPS_BASE + "/health");
  const L = ["QNFO fleet health", ""];
  if (ops && ops.version) L.push("ops-exec: " + ops.version + " (" + (ops.worker || "qnfo-ops") + ")");
  const fl = await getJson(OPS_BASE + "/fleet");
  if (fl) {
    const arr = Array.isArray(fl.fleet) ? fl.fleet : (Array.isArray(fl.workers) ? fl.workers : (Array.isArray(fl.names) ? fl.names : null));
    if (arr) L.push("workers: " + arr.length);
    else if (fl.count !== undefined) L.push("workers: " + fl.count);
    if (fl.drift !== undefined) L.push("drift: " + JSON.stringify(fl.drift));
  }
  L.push("email-worker: qnfo-email v" + VERSION);
  return { ok: true, text: L.join("\n") };
}

async function cmdFleet(env) {
  const j = await getJson(OPS_BASE + "/fleet");
  if (j === null) return { ok: false, error: "/fleet unreachable" };
  const arr = Array.isArray(j.fleet) ? j.fleet : (Array.isArray(j.workers) ? j.workers : (Array.isArray(j.names) ? j.names : []));
  const L = ["QNFO fleet (" + arr.length + " workers)"];
  const list = arr.map(function(n){ return typeof n === "string" ? n : (n.name || n.id || JSON.stringify(n).slice(0, 40)); });
  if (list.length) L.push(list.slice(0, 60).join("\n"));
  if (j.drift !== undefined) L.push("drift: " + JSON.stringify(j.drift));
  return { ok: true, text: L.join("\n").slice(0, 3000) };
}

async function cmdInbox(env) {
  const db = env.AUDIT_DB;
  const total = await db.prepare("SELECT COUNT(*) c FROM emails").first();
  const recent = await db.prepare("SELECT id, sender, recipient, subject, classification, status, received_at FROM emails WHERE status != 'sent' ORDER BY id DESC LIMIT 15").all();
  const L = ["QNFO inbox (" + (total && total.c || 0) + " total)", ""];
  for (const r of recent.results || []) L.push("[" + r.id + "] " + decodeSubject(r.subject).slice(0, 70) + " <- " + r.sender);
  L.push("", "reply 'read <id>' for a body");
  return { ok: true, text: L.join("\n") };
}

async function cmdRead(env, commandText) {
  const id = parseInt(String(commandText || "").trim(), 10);
  if (!id) return { ok: false, error: "usage: read <email-id>" };
  const row = await env.AUDIT_DB.prepare("SELECT id, sender, recipient, subject, body_text, received_at FROM emails WHERE id=?1").bind(id).first();
  if (!row) return { ok: false, error: "email " + id + " not found" };
  let body = String(row.body_text || "");
  if (/^-{2,}[A-Za-z0-9_=+.\/-]{8,}/m.test(body) || /content-type\s*:\s*multipart/i.test(body)) {
    try {
      const acc = _walkMime(body, { text: "", html: "" });
      if (acc.text) body = acc.text;
      else if (acc.html) body = _htmlToText(acc.html);
    } catch (e) { }
  }
  const L = ["[" + row.id + "] " + decodeSubject(row.subject), "from: " + row.sender, "to: " + row.recipient, "at: " + row.received_at, "", truncate(body, 4000)];
  return { ok: true, text: L.join("\n") };
}

async function cmdJob(env, commandText) {
  const id = String(commandText || "").trim();
  if (!id) return { ok: false, error: "usage: job <id>" };
  const key = env.OPS_KEY || "";
  const h = key ? { "Authorization": "Bearer " + key } : {};
  try {
    const res = await fetch(OPS_BASE + "/v1/jobs/" + encodeURIComponent(id), { headers: h });
    const txt = await res.text();
    if (res.status === 404) return { ok: false, error: "job " + id + " not found" };
    let j = null;
    try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (!j) return { ok: false, error: "ops returned non-JSON (HTTP " + res.status + "): " + txt.slice(0, 180) };
    return { ok: true, text: truncate(JSON.stringify(j, null, 2), 3000) };
  } catch (e) {
    return { ok: false, error: "ops unreachable: " + String(e && e.message || e).slice(0, 160) };
  }
}

async function cmdAgent(env, verb, commandText, kind) {
  if (kind !== "owner") return { ok: false, error: "action commands require owner sender; agent sender is read-only" };
  const text = String(commandText ? (verb ? verb + " " + commandText : commandText) : (verb || "")).trim();
  if (env.COMMAND_TOKEN) {
    const tok = String(env.COMMAND_TOKEN || "");
    if (text.indexOf(tok) < 0) return { ok: false, error: "COMMAND_TOKEN required for action commands (append the token to your message)" };
  }
  const key = env.OPS_KEY || "";
  if (!key) return { ok: false, error: "OPS_KEY not configured on qnfo-email; agent passthrough disabled" };
  let j = null, lastErr = "";
  for (let attempt = 0; attempt < 3 && !j; attempt++) {
    try {
      const res = await fetch(OPS_BASE + "/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: "ops-exec", messages: [{ role: "user", content: text }] })
      });
      const txt = await res.text();
      if (res.status === 202) { try { j = JSON.parse(txt); } catch (e) { j = null; } }
      if (!j) lastErr = "HTTP " + res.status + " " + txt.slice(0, 120);
    } catch (e) { lastErr = String(e && e.message || e).slice(0, 120); }
    if (!j && attempt < 2) await new Promise(function(r){ setTimeout(r, 1000 * (attempt + 1)); });
  }
  if (!j || !j.id) return { ok: false, error: "ops job queue unavailable (" + lastErr + ")" };
  const polls = Math.max(0, parseInt(env.AGENT_POLLS || "6", 10) || 0);
  for (let i = 0; i < polls; i++) {
    await new Promise(function(r){ setTimeout(r, 2000); });
    try {
      const pr = await fetch(OPS_BASE + "/v1/jobs/" + encodeURIComponent(j.id), { headers: { "Authorization": "Bearer " + key } });
      const ptxt = await pr.text();
      let pj = null;
      try { pj = JSON.parse(ptxt); } catch (e) { pj = null; }
      if (!pj) continue;
      const st = pj.status || (pj.job && pj.job.status);
      if (st && st !== "queued" && st !== "running") {
        const out = pj.response || (pj.job && pj.job.response) || pj.error || (pj.job && pj.job.error) || "";
        return { ok: st === "succeeded", job_id: j.id, status: st, text: "job " + j.id + " " + st + (out ? ":\n" + truncate(String(out), 3500) : "") };
      }
    } catch (e) { }
  }
  return { ok: true, queued: true, job_id: j.id, note: "ops-exec agent job queued; reply 'job " + j.id + "' to poll" };
}

async function routeCommand(env, verb, commandText, kind) {
  const v = (verb || "").toLowerCase();
  switch (v) {
    case "help": return { ok: true, text: HELP };
    case "status": case "health": return await cmdHealth(env);
    case "fleet": case "workers": return await cmdFleet(env);
    case "registry": return await cmdOps(env, "/registry");
    case "manifest": return await cmdOps(env, "/manifest");
    case "cost": return await cmdOps(env, "/cost");
    case "analytics": return await cmdOps(env, "/analytics");
    case "email": case "emails": case "inbox": return await cmdInbox(env);
    case "read": return await cmdRead(env, commandText);
    case "job": return await cmdJob(env, commandText);
    default: return await cmdAgent(env, verb, commandText, kind);
  }
}

function formatResult(verb, commandText, result, kind) {
  const L = [];
  L.push("QNFO command: " + (verb || "(action)") + (commandText ? " " + commandText : ""));
  L.push("");
  if (result.queued) {
    L.push("Queued as ops-exec job " + result.job_id);
    L.push("Reply 'job " + result.job_id + "' to poll for the result.");
  } else if (result.text) {
    L.push(result.text);
  } else if (result.error) {
    L.push("ERROR: " + result.error);
  } else {
    L.push(truncate(JSON.stringify(result, null, 2), 2500));
  }
  L.push("");
  L.push("-- QNFO email control v" + VERSION + " (reply 'help' for commands)");
  return L.join("\n");
}
