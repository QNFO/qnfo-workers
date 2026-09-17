const QNFO_VERSION = "qnfo-email/fabric-20260910";
const VERSION = "1.9.1";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// qnfo-email.js
var BODY_MAX_TEXT = 1e4;
var BODY_MAX_HTML = 2e4;
var PREVIEW_LENGTH = 200;
var qnfo_email_default = {
  // ═══ EMAIL HANDLER ═══════════════════════════
  async email(message, env, ctx) {
    const startTime = Date.now();
    const { from, to, headers, raw, rawSize } = message;
    const subject = headers.get("subject") || "(no subject)";
    const messageId = headers.get("message-id") || `${Date.now()}-${crypto.randomUUID()}`;
    const receivedAt = (/* @__PURE__ */ new Date()).toISOString();
    const { bodyText, bodyHtml } = await parseBody(raw);
    const classification = classifyAddress(to);
    const headersJson = JSON.stringify(Object.fromEntries(headers.entries()));
    const emailId = await storeEmail(env.AUDIT_DB, {
      messageId,
      from,
      to,
      subject,
      bodyText: truncate(bodyText, BODY_MAX_TEXT),
      bodyHtml: truncate(bodyHtml, BODY_MAX_HTML),
      headersJson,
      classification,
      receivedAt
    });
    const filterResult = await applyFilters(env.AUDIT_DB, from, to, subject, bodyText);
    if (filterResult.action === "reject") {
      message.setReject(filterResult.reason || "Email rejected by policy");
      await logAction(env.AUDIT_DB, emailId, "rejected", filterResult.reason, startTime);
      return;
    }
    await sendNotification(env, { messageId, emailId, from, to, subject, classification, preview: truncate(bodyText, PREVIEW_LENGTH), bodySize: rawSize, receivedAt });
    if (filterResult.action === "auto_reply" && filterResult.replyTemplate) {
      try {
        if (env.SEND_EMAIL) {
          const replyBody = filterResult.replyTemplate.replace(/\{\{from\}\}/g, from).replace(/\{\{to\}\}/g, to).replace(/\{\{subject\}\}/g, subject).replace(/\{\{classification\}\}/g, classification).replace(/\{\{date\}\}/g, (/* @__PURE__ */ new Date()).toISOString());
          await env.SEND_EMAIL.send({
            to: from,
            from: to,
            subject: `Re: ${subject}`,
            text: replyBody,
            html: `<p>${replyBody.replace(/\n/g, "<br>")}</p>`
          });
        }
      } catch (e) {
        console.error("Auto-reply:", e.message);
      }
    }
    await logAction(env.AUDIT_DB, emailId, "processed", classification, startTime);
  },
  // ═══ HTTP HANDLER ════════════════════════════
  async scheduled(controller, env, ctx) {
    try {
      const r = await sendInboundDigest(env);
      console.log("inbound-digest:", JSON.stringify(r));
    } catch (e) {
      console.error("inbound-digest failed:", String(e && e.message || e));
    }
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const json = /* @__PURE__ */ __name((data, status) => new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }), "json");
    let p = url.pathname;
    if (p === "/email" || p.startsWith("/email/")) {
      p = p.replace("/email", "") || "/";
    }
    if (p === "/unsubscribe") {
      try {
        const ue = String(url.searchParams.get("e") || "").trim().toLowerCase();
        const ut = String(url.searchParams.get("t") || "").trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ue)) {
          return new Response("<!doctype html><meta charset=utf-8><h1>Invalid link</h1><p>No valid address in this link.</p>", { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        const want = (await sha16(ue + ":qnfo-unsub-2026")).slice(0, 16);
        if (ut !== want) {
          return new Response("<!doctype html><meta charset=utf-8><h1>Invalid or expired link</h1><p>Reply to any message from this project with the single word STOP and you will be removed.</p>", { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        await env.AUDIT_DB.prepare("INSERT INTO email_suppression (email, reason, source) VALUES (?1,'unsubscribe','link') ON CONFLICT(email) DO UPDATE SET reason='unsubscribe', source='link', created_at=datetime('now')").bind(ue).run();
        await env.AUDIT_DB.prepare("INSERT OR IGNORE INTO email_send_violations (recipient, sender, subject, violation, detail, resolved) VALUES (?1,'system','unsubscribe','UNSUBSCRIBE-HONOURED','recipient opted out via link; suppressed',1)").bind(ue).run().catch(() => {});
        return new Response("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Removed</title></head><body style=\"font:16px/1.6 system-ui,-apple-system,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.2rem;color:#1c1a18\"><h1 style=\"font-size:1.25rem\">You have been removed</h1><p>This address will not be contacted again by this project. Suppression is permanent and stored server-side.</p><p style=\"color:#6b6560;font-size:.9rem\">If anything further arrives, reply to it and flag it as a defect.</p></body></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
      } catch (e) {
        return new Response("error: " + e.message, { status: 500 });
      }
    }
    if (request.method !== "OPTIONS" && p !== "/health") {
      const auth = request.headers.get("Authorization") || "";
      const apiKey = env.API_KEY || "";
      const gwKey = env.GATEWAY_EMAIL_KEY || "";
      const xk = request.headers.get("x-api-key") || "";
      const okMain = apiKey && (auth === "Bearer " + apiKey || xk === apiKey);
      const okGw = gwKey && (auth === "Bearer " + gwKey || xk === gwKey);
      if (!okMain && !okGw) {
        return json({ error: "unauthorized: missing or invalid API key" }, 401);
      }
    }
    if (p === "/health") {
      return json({
        status: "ok",
        worker: "qnfo-email",
        version: VERSION,
        bindings: { d1: !!env.AUDIT_DB, send_email: !!env.SEND_EMAIL, notify_webhook: !!env.NOTIFY_WEBHOOK },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (p === "/emails/recent" && request.method === "GET") {
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const status = url.searchParams.get("status");
        let sql = "SELECT id, message_id, sender, recipient, subject, classification, status, received_at, processing_ms FROM emails";
        const params = [];
        if (status) {
          sql += " WHERE status=?1";
          params.push(status);
        }
        sql += " ORDER BY id DESC LIMIT ?" + (params.length + 1) + " OFFSET ?" + (params.length + 2);
        params.push(limit, offset);
        const result = await env.AUDIT_DB.prepare(sql).bind(...params).all();
        return json({ count: result.results?.length || 0, emails: result.results || [] });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    if (p === "/emails/body" && request.method === "GET") {
      try {
        const eid = parseInt(url.searchParams.get("id") || "0");
        const row = await env.AUDIT_DB.prepare("SELECT id, sender, recipient, subject, body_text, body_html, headers_json, classification, status, received_at, processing_ms FROM emails WHERE id=?1").bind(eid).first();
        if (!row) return json({ error: "not found" }, 404);
        return json(row);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    if (p === "/emails/search" && request.method === "GET") {
      try {
        const q = url.searchParams.get("q") || "";
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
        const result = await env.AUDIT_DB.prepare(
          "SELECT id, message_id, sender, recipient, subject, classification, status, received_at FROM emails WHERE subject LIKE ?1 OR sender LIKE ?1 OR body_text LIKE ?1 ORDER BY id DESC LIMIT ?2"
        ).bind(`%${q}%`, limit).all();
        return json({ query: q, count: result.results?.length || 0, emails: result.results || [] });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    if (p === "/stats" && request.method === "GET") {
      try {
        const [total, recent24h, byClass, byStatus] = await Promise.all([
          env.AUDIT_DB.prepare("SELECT COUNT(*) as count FROM emails").first(),
          env.AUDIT_DB.prepare("SELECT COUNT(*) as count FROM emails WHERE julianday(received_at) > julianday('now', '-24 hours')").first(),
          env.AUDIT_DB.prepare("SELECT classification, COUNT(*) as count FROM emails GROUP BY classification ORDER BY count DESC").all(),
          env.AUDIT_DB.prepare("SELECT status, COUNT(*) as count FROM emails GROUP BY status").all()
        ]);
        return json({
          total: total?.count || 0,
          last24h: recent24h?.count || 0,
          byClassification: byClass.results || [],
          byStatus: byStatus.results || []
        });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    if (p === "/send" && request.method === "POST") {
      if (!env.SEND_EMAIL) return json({ error: "send_email binding not available" }, 503);
      try {
        const { to, subject, body, html, reply_to_id, from } = await request.json();
        if (!to) return json({ error: "to is required" }, 400);
        // SUPPRESSION-ENFORCE-1 (2026-09-17): the email_suppression table is populated by the
        // /unsubscribe link path (write side), but the send path never read it. Consult it before
        // sending so opt-outs and reply-stop addresses are never re-emailed.
        try {
          const suppressed = await env.AUDIT_DB.prepare(
            "SELECT reason FROM email_suppression WHERE LOWER(email) = ?1 LIMIT 1"
          ).bind(String(to).toLowerCase()).first();
          if (suppressed) {
            return json({ success: false, suppressed: true, reason: suppressed.reason || "suppressed", to });
          }
        } catch (e) {
          // fail-open: a suppression-lookup error must not block legitimate email
        }
        const htmlBody = html || (body ? `<p>${body.replace(/\n/g, "<br>")}</p>` : "");
        const textBody = body || html?.replace(/<[^>]*>/g, "") || "";
        const replySubject = subject || "(no subject)";
        const ALLOWED_DOMAINS = ["qnfo.org", "qwav.org", "qwav.tech", "qwav.net", "qwav.uk", "q-wave.tech", "qwave.tech", "q08.org", "qnfo.net", "qnfo.uk", "empoweringchange.today"];
        const fromDomain = (from || "").split("@")[1] || "";
        const FROM_ADDR = from && ALLOWED_DOMAINS.includes(fromDomain.toLowerCase()) ? from : "qnfo@qnfo.org";
        const result = await env.SEND_EMAIL.send({
          to,
          from: FROM_ADDR,
          subject: replySubject,
          text: textBody,
          html: htmlBody
        });
        const actualMessageId = result?.messageId || null;
        console.log(`[SEND] messageId=${actualMessageId} to=${to} subject=${replySubject}`);
        const sentId = crypto.randomUUID();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        await env.AUDIT_DB.prepare(
          "INSERT INTO emails (message_id, sender, recipient, subject, body_text, body_html, headers_json, classification, received_at, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
        ).bind(sentId, FROM_ADDR, to, replySubject, textBody.substring(0, BODY_MAX_TEXT), htmlBody.substring(0, BODY_MAX_HTML), "{}", "general", now, "sent").run();
        if (reply_to_id) {
          await env.AUDIT_DB.prepare("UPDATE emails SET status=?1 WHERE id=?2").bind("replied", reply_to_id).run();
        }
        return json({ success: true, message_id: sentId, to, subject: replySubject, sent_at: now });
      } catch (e) {
        return json({ error: "send failed: " + e.message }, 500);
      }
    }
    if (p === "/filters" && request.method === "GET") {
      try {
        const result = await env.AUDIT_DB.prepare("SELECT * FROM email_filters ORDER BY priority DESC").all();
        return json({ count: result.results?.length || 0, filters: result.results || [] });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    if (p === "/filters" && request.method === "POST") {
      try {
        const { field, pattern, action, reply_template, priority, enabled, rule_type } = await request.json();
        if (!field || !pattern) return json({ error: "field and pattern required" }, 400);
        const result = await env.AUDIT_DB.prepare(
          "INSERT INTO email_filters (field, pattern, action, reply_template, priority, enabled, rule_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
        ).bind(field, pattern, action || "accept", reply_template || null, priority || 0, enabled !== false ? 1 : 0, rule_type || "filter").run();
        return json({ success: true, id: result.meta?.last_row_id }, 201);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    if (p.startsWith("/filters/") && request.method === "DELETE") {
      try {
        const fid = parseInt(p.split("/").pop());
        await env.AUDIT_DB.prepare("DELETE FROM email_filters WHERE id=?1").bind(fid).run();
        return json({ success: true, deleted: fid });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    if (p === "/emails/status" && request.method === "PATCH") {
      try {
        const { id, status } = await request.json();
        if (!id || !status) return json({ error: "id and status required" }, 400);
        const validStatuses = ["received", "processed", "sent", "replied", "archived", "spam", "read", "rejected"];
        if (!validStatuses.includes(status)) return json({ error: `invalid status. valid: ${validStatuses.join(",")}` }, 400);
        await env.AUDIT_DB.prepare("UPDATE emails SET status=?1 WHERE id=?2").bind(status, id).run();
        return json({ success: true, id, status });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }
    return json({
      worker: "qnfo-email",
      version: VERSION,
      endpoints: {
        health: "GET /health",
        emails: {
          recent: "GET /emails/recent?limit=20&offset=0&status=processed",
          body: "GET /emails/body?id=1",
          search: "GET /emails/search?q=keyword",
          status: "PATCH /emails/status {id, status}",
          stats: "GET /stats"
        },
        send: "POST /send {to, subject, body, html?, reply_to_id?}",
        filters: "GET|POST /filters | DELETE /filters/:id"
      }
    });
  }
};
async function parseBody(raw) {
  let bodyText = "", bodyHtml = "";
  try {
    const rawText = await new Response(raw).text();
    const boundaryMatch = rawText.match(/boundary="?([^"\s\n\r]+)"?/i);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1];
      const parts = rawText.split("--" + boundary);
      for (const part of parts) {
        if (part.includes("Content-Type: text/plain")) {
          const cs = part.indexOf("\n\n");
          if (cs > -1) bodyText = part.substring(cs).replace(/^[\n\r]+/, "").trim();
        } else if (part.includes("Content-Type: text/html")) {
          const cs = part.indexOf("\n\n");
          if (cs > -1) bodyHtml = part.substring(cs).replace(/^[\n\r]+/, "").trim();
        }
      }
    }
    if (!bodyText && !bodyHtml) {
      const parts = rawText.split(/\r?\n\r?\n/);
      if (parts.length > 1) bodyText = parts.slice(1).join("\n\n").replace(/=\r?\n/g, "").trim();
    }
  } catch (e) {
    bodyText = `[parse: ${e.message}]`;
  }
  return { bodyText, bodyHtml };
}
__name(parseBody, "parseBody");
async function storeEmail(db, data) {
  try {
    const result = await db.prepare(
      `INSERT INTO emails (message_id, sender, recipient, subject, body_text, body_html, headers_json, classification, received_at, status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'received') ON CONFLICT(message_id) DO UPDATE SET recipient=?3,subject=?4,body_text=?5,body_html=?6,headers_json=?7,classification=?8`
    ).bind(data.messageId, data.from, data.to, data.subject, data.bodyText, data.bodyHtml, data.headersJson, data.classification, data.receivedAt).run();
    return result.meta?.last_row_id || 0;
  } catch (e) {
    console.error("D1 store:", e.message);
    return 0;
  }
}
__name(storeEmail, "storeEmail");
async function logAction(db, emailId, action, detail, startTime) {
  try {
    const ms = Date.now() - startTime;
    await db.prepare(`UPDATE emails SET status=?1, processed_at=datetime('now'), processing_ms=?2 WHERE id=?3`).bind(action, ms, emailId).run();
  } catch (e) {
    console.error("D1 log:", e.message);
  }
}
__name(logAction, "logAction");
function classifyAddress(to) {
  const a = (to || "").toLowerCase();
  if (a.includes("research")) return "research";
  if (a.includes("alert")) return "alerts";
  if (a.includes("publication")) return "publications";
  if (a.includes("rowan.quni")) return "personal";
  if (a.includes("admin")) return "admin";
  return "general";
}
__name(classifyAddress, "classifyAddress");
async function applyFilters(db, from, to, subject, body) {
  try {
    const result = await db.prepare("SELECT * FROM email_filters WHERE enabled=1 ORDER BY priority DESC").all();
    for (const f of result.results || []) {
      if (matchesFilter(f, from, to, subject, body))
        return { action: f.action, reason: f.reply_template || `Matched: ${f.pattern}`, replyTemplate: f.reply_template || null, filterId: f.id };
    }
  } catch (e) {
    console.error("Filter:", e.message);
  }
  return { action: "accept" };
}
__name(applyFilters, "applyFilters");
function matchesFilter(f, from, to, subject, body) {
  const p = (f.pattern || "").toLowerCase();
  if (!p) return false;
  let t = "";
  switch (f.field) {
    case "from":
      t = from;
      break;
    case "to":
      t = to;
      break;
    case "subject":
      t = subject;
      break;
    case "body":
      t = body;
      break;
    default:
      t = `${from} ${to} ${subject} ${body}`;
  }
  return (t || "").toLowerCase().includes(p);
}
__name(matchesFilter, "matchesFilter");
async function sendNotification(env, data) {
  const wh = env.NOTIFY_WEBHOOK;
  if (!wh) {
    console.log(`[EMAIL] ${data.classification}: ${data.from} -> ${data.to}: ${data.subject}`);
    return;
  }
  try {
    await fetch(wh, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "email_received", timestamp: data.receivedAt, messageId: data.messageId, emailId: data.emailId, sender: data.from, recipient: data.to, subject: data.subject, classification: data.classification, preview: data.preview, bodySize: data.bodySize }) });
  } catch (e) {
    console.error("Webhook:", e.message);
  }
}
__name(sendNotification, "sendNotification");
async function sha16(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function truncate(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? text.substring(0, maxLength) + "\u2026" : text;
}
__name(truncate, "truncate");
function decodeSubject(s) {
  s = String(s || "");
  return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, function (m, cs, enc, data) {
    try {
      if (enc.toLowerCase() === "b") {
        const bin = atob(data);
        const bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
        return new TextDecoder(cs === "" ? "utf-8" : cs).decode(bytes);
      } else {
        return data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
      }
    } catch (e) { return m; }
  }).replace(/\s+/g, " ").trim();
}
async function sendInboundDigest(env) {
  const OWNER = "rwnquni@outlook.com";
  const MACHINE = /srs0=|cf-bounce|cfbounces|dmarcreport|mailer-daemon|postmaster|bounces\+/i;
  const CRITICAL = /api access|spend|threshold|action needed|rejected|undelivered|discontinu|postpon|pricing|billing|turned off|suspension/i;
  let rows = [];
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    rows = ((await env.AUDIT_DB.prepare(
      "SELECT id, sender, recipient, subject, classification, status, received_at FROM emails WHERE status != 'sent' AND received_at >= ? ORDER BY id DESC LIMIT 200"
    ).bind(since).all()).results) || [];
  } catch (e) { return { sent: false, error: "query: " + String(e && e.message || e).slice(0, 150) }; }
  const crit = [], human = [];
  const seen = new Set();
  for (const r of rows) {
    const s = decodeSubject(r.subject);
    if (CRITICAL.test(s) || /cfbounces\+ndrdrop/.test(String(r.sender || ""))) { crit.push(r); seen.add(r.id); }
  }
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    if (MACHINE.test(String(r.sender || ""))) continue;
    human.push(r);
  }
  if (!crit.length && !human.length) return { sent: false, reason: "nothing to surface" };
  const day = new Date().toISOString().slice(0, 10);
  const fmt = function (r) { return "  [" + r.id + "] " + decodeSubject(r.subject).slice(0, 90) + " <- " + (r.sender || "?"); };
  const L = [];
  L.push("QNFO inbound digest - " + day);
  L.push("");
  if (crit.length) { L.push("OPERATIONAL (account/service notices - verify each):"); for (const r of crit) L.push(fmt(r)); L.push(""); }
  if (human.length) { L.push("FROM PEOPLE (may need a reply):"); for (const r of human) L.push(fmt(r)); L.push(""); }
  L.push("Read one: email worker GET /emails/body?id=<id>. Reply to this message to act.");
  try {
    await env.SEND_EMAIL.send({ to: OWNER, from: "qnfo@qnfo.org", subject: "QNFO inbound digest - " + day, text: L.join("\n") });
    return { sent: true, critical: crit.length, human: human.length };
  } catch (e) { return { sent: false, error: "send: " + String(e && e.message || e).slice(0, 150) }; }
}

export {
  qnfo_email_default as default
};
//# sourceMappingURL=qnfo-email.js.map
