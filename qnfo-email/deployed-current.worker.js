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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const json = /* @__PURE__ */ __name((data, status) => new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }), "json");
    let p = url.pathname;
    if (p === "/email" || p.startsWith("/email/")) {
      p = p.replace("/email", "") || "/";
    }
    if (request.method !== "OPTIONS") {
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
        version: "1.8",
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
          env.AUDIT_DB.prepare("SELECT COUNT(*) as count FROM emails WHERE received_at > datetime('now', '-24 hours')").first(),
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
      version: "1.8",
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
function truncate(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? text.substring(0, maxLength) + "\u2026" : text;
}
__name(truncate, "truncate");
export {
  qnfo_email_default as default
};
//# sourceMappingURL=qnfo-email.js.map