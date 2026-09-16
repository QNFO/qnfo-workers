const QNFO_VERSION = "qnfo-email/fabric-20260910";
const VERSION = "1.9.0";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, { value, configurable: true });

// qnfo-email.js
var BODY_MAX_TEXT = 1e4;
var BODY_MAX_HTML = 2e4;
var PREVIEW_LENGTH = 200;

// ═══ EMAIL COMMAND GATEWAY (v1.9.0) ══════════════════════════════
// An inbound message from an allowlisted sender (email_command_senders, qnfo-audit D1)
// is interpreted as an API request: parse -> execute -> reply in-thread.
// Deterministic verbs execute inline here; free-form (ASK) is queued and drained by
// qnfo-email-orchestrator /commands/drain (see fleet_crons email-gateway-drain-5m).
var GATEWAY_MARKER = "qnfo-email-gateway";
var SENDABLE_FROM = ["qnfo@qnfo.org", "rowan.quni@qnfo.org"];
var COMMAND_VERBS = ["HELP", "WHOAMI", "STATUS", "ISSUES", "INBOX", "EMAIL", "SQL", "SERVICES", "SERVICE", "CRONS", "NOTE", "TASK", "RESEARCH", "MARK", "ASK"];
var WRITE_VERBS = ["NOTE", "TASK", "RESEARCH", "MARK"];
var EMAIL_STATUSES = ["received", "processed", "sent", "replied", "archived", "spam", "read", "rejected"];
var SQL_BLOCK = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|truncate|grant|revoke)\b/i;

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
    // ── command gateway: never allowed to break mail storage ──
    if (filterResult.action !== "reject" && filterResult.action !== "spam") {
      try {
        await handleCommand(env, { emailId, messageId, from, to, subject, bodyText, headers });
      } catch (e) {
        console.error("Command gateway:", e.message);
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
    // ── command-gateway endpoints (capability key from D1 ops_config, no API key needed) ──
    if (p === "/commands/pending" && request.method === "GET") {
      try {
        if (!await gwDrainKeyOk(env, url.searchParams.get("key"))) return json({ ok: false, error: "unauthorized" }, 401);
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "5", 10) || 5, 20);
        const rows = await env.AUDIT_DB.prepare("SELECT c.id, c.email_id, c.message_id, c.in_reply_to, c.sender, c.recipient, c.subject, c.verb, c.command_text, c.attempts, substr(COALESCE(e.body_text,''),1,1500) AS parent_body, e.sender AS parent_sender FROM email_commands c LEFT JOIN emails e ON e.message_id = c.in_reply_to WHERE c.status='pending' ORDER BY c.id LIMIT ?1").bind(limit).all();
        return json({ ok: true, count: (rows.results || []).length, commands: rows.results || [] });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }
    if (p === "/commands/complete") {
      try {
        if (!await gwDrainKeyOk(env, url.searchParams.get("key"))) return json({ ok: false, error: "unauthorized" }, 401);
        const id = parseInt(url.searchParams.get("id") || "0", 10);
        let text = url.searchParams.get("text") || "";
        if (request.method === "POST") {
          try {
            const b = await request.json();
            if (b && b.text) text = b.text;
          } catch (e) {
          }
        }
        if (!id || !text) return json({ ok: false, error: "id and text are required" }, 400);
        const cmd = await env.AUDIT_DB.prepare("SELECT id, sender, recipient, subject, message_id FROM email_commands WHERE id=?1").bind(id).first();
        if (!cmd) return json({ ok: false, error: "command not found" }, 404);
        const replyId = await gwSendReply(env, cmd, text);
        await env.AUDIT_DB.prepare("UPDATE email_commands SET status='answered', result=?1, reply_email_id=?2, attempts=attempts+1, updated_at=datetime('now') WHERE id=?3").bind(truncate(text, 8000), replyId, id).run();
        return json({ ok: true, id, reply_email_id: replyId, answered: true });
      } catch (e) {
        return json({ ok: false, error: "complete failed: " + e.message }, 500);
      }
    }
    if (p === "/commands/log" && request.method === "GET") {
      try {
        if (!await gwDrainKeyOk(env, url.searchParams.get("key"))) return json({ ok: false, error: "unauthorized" }, 401);
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
        const rows = await env.AUDIT_DB.prepare("SELECT id, sender, recipient, verb, status, substr(COALESCE(command_text,''),1,60) AS cmd, created_at FROM email_commands ORDER BY id DESC LIMIT ?1").bind(limit).all();
        return json({ ok: true, count: (rows.results || []).length, commands: rows.results || [] });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
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
      const out = {
        status: "ok",
        worker: "qnfo-email",
        version: VERSION,
        bindings: { d1: !!env.AUDIT_DB, send_email: !!env.SEND_EMAIL, notify_webhook: !!env.NOTIFY_WEBHOOK },
        gateway: { enabled: !!env.AUDIT_DB && !!env.SEND_EMAIL, marker: GATEWAY_MARKER, verbs: COMMAND_VERBS },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      try {
        const g = await env.AUDIT_DB.prepare("SELECT (SELECT COUNT(*) FROM email_command_senders WHERE enabled=1) AS senders, (SELECT COUNT(*) FROM email_commands) AS commands, (SELECT COUNT(*) FROM email_commands WHERE status='pending') AS pending").first();
        out.gateway.senders = g ? g.senders : null;
        out.gateway.commands = g ? g.commands : null;
        out.gateway.pending = g ? g.pending : null;
      } catch (e) {
        out.gateway.error = e.message;
      }
      return json(out);
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
        filters: "GET|POST /filters | DELETE /filters/:id",
        commands: {
          pending: "GET /commands/pending?key=K&limit=5",
          complete: "POST /commands/complete?key=K {id, text}",
          log: "GET /commands/log?key=K&limit=20"
        }
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
function sha16(s) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) {
    return Array.from(new Uint8Array(b)).map(function (x) {
      return x.toString(16).padStart(2, "0");
    }).join("");
  });
}
__name(sha16, "sha16");

// ═══ COMMAND GATEWAY HELPERS ═════════════════════════════════════
function gwAddrOf(s) {
  const m = String(s || "").match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : "";
}
__name(gwAddrOf, "gwAddrOf");
function gwDomainOf(a) {
  const p = String(a || "").split("@");
  return (p[1] || "").toLowerCase();
}
__name(gwDomainOf, "gwDomainOf");
function gwCleanMsgId(s) {
  return String(s || "").replace(/[<>]/g, "").trim().split(/\s+/)[0] || "";
}
__name(gwCleanMsgId, "gwCleanMsgId");
function gwEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(gwEsc, "gwEsc");
function gwRows(rows, maxRows, cellMax) {
  if (!rows || !rows.length) return "(no rows)";
  return rows.slice(0, maxRows || 25).map(function (r, i) {
    return i + 1 + ". " + Object.keys(r).map(function (k) {
      return k + "=" + truncate(String(r[k] == null ? "" : r[k]), cellMax || 140);
    }).join(" | ");
  }).join("\n");
}
__name(gwRows, "gwRows");
function gwStripQuoted(body) {
  let t = String(body || "").replace(/\r\n/g, "\n");
  const cuts = [/^On .{0,200}wrote:\s*$/im, /^-{2,}\s*Original Message\s*-{2,}/im, /^From:\s.+\n(?:Sent|Date|To):/im, /^_{10,}\s*$/m, /^Sent from my /im, /^Get Outlook for /im];
  for (const c of cuts) {
    const m = t.match(c);
    if (m && m.index > 0) t = t.slice(0, m.index);
  }
  const lines = t.split("\n").filter(function (l) {
    return !/^\s*>/.test(l);
  });
  const out = [];
  for (const l of lines) {
    if (/^--\s*$/.test(l)) break;
    out.push(l);
  }
  return out.join("\n").trim();
}
__name(gwStripQuoted, "gwStripQuoted");
function gwParse(subject, body) {
  let t = gwStripQuoted(body);
  const subj = String(subject || "");
  const mb = subj.match(/\[([A-Za-z]{3,12})\]/);
  if (!t && mb && COMMAND_VERBS.indexOf(mb[1].toUpperCase()) >= 0) t = mb[1];
  const mp = t.match(/^(?:cmd|command)\s*[:=]\s*/i);
  if (mp) t = t.slice(mp[0].length).trim();
  const firstLine = (t.split("\n")[0] || "").trim();
  const rawTok = firstLine.split(/\s+/)[0] || "";
  const tok = rawTok.replace(/^[#/]/, "").toUpperCase();
  if (COMMAND_VERBS.indexOf(tok) >= 0) {
    const rest = firstLine.slice(rawTok.length).trim();
    const tail = t.split("\n").slice(1).join("\n").trim();
    return { verb: tok, text: (rest + (tail ? "\n" + tail : "")).trim() };
  }
  if (!t) return { verb: "EMPTY", text: "" };
  return { verb: "ASK", text: t };
}
__name(gwParse, "gwParse");
function gwSqlGuard(arg) {
  if (!arg) return { ok: false, why: "usage: SQL SELECT ..." };
  const one = arg.replace(/;+\s*$/, "");
  if (one.indexOf(";") !== -1) return { ok: false, why: "only a single statement is allowed" };
  if (!/^\s*(select|with)\b/i.test(one)) return { ok: false, why: "only SELECT / WITH queries are allowed" };
  if (SQL_BLOCK.test(one.replace(/'[^']*'/g, "''"))) return { ok: false, why: "write keywords are not allowed" };
  let q = one;
  if (!/\blimit\s+\d+/i.test(q)) q += " LIMIT 25";
  return { ok: true, q };
}
__name(gwSqlGuard, "gwSqlGuard");
async function gwDrainKeyOk(env, key) {
  if (!key) return false;
  try {
    const r = await env.AUDIT_DB.prepare("SELECT value FROM ops_config WHERE key='command_drain_key' LIMIT 1").first();
    return !!(r && r.value && r.value === key);
  } catch (e) {
    console.error("Drain key:", e.message);
    return false;
  }
}
__name(gwDrainKeyOk, "gwDrainKeyOk");
async function gwSenderPolicy(db, envelope, headerFrom) {
  try {
    const rows = await db.prepare("SELECT pattern, kind FROM email_command_senders WHERE enabled=1").all();
    const cands = [gwAddrOf(envelope), gwAddrOf(headerFrom)];
    for (const r of rows.results || []) {
      const p = String(r.pattern || "").toLowerCase();
      for (let j = 0; j < cands.length; j++) {
        const a = cands[j];
        if (!a) continue;
        const hit = p.indexOf("*@") === 0 ? a.slice(-(p.length - 1)) === p.slice(1) : a === p;
        if (hit) return { pattern: p, kind: r.kind || "owner", via: j === 0 ? "envelope" : "header" };
      }
    }
  } catch (e) {
    console.error("Sender policy:", e.message);
  }
  return null;
}
__name(gwSenderPolicy, "gwSenderPolicy");
function gwPickFrom(recipient) {
  const r = gwAddrOf(recipient);
  return SENDABLE_FROM.indexOf(r) >= 0 ? r : "qnfo@qnfo.org";
}
__name(gwPickFrom, "gwPickFrom");
async function gwSendReply(env, cmd, text) {
  const to = gwAddrOf(cmd.replyTo || cmd.sender);
  const from = gwPickFrom(cmd.recipient);
  const subj = String(cmd.subject || "(no subject)");
  const subject = /^re:/i.test(subj) ? subj : "Re: " + subj;
  const body = String(text || "").trim() + "\n\n--\n" + GATEWAY_MARKER + " v" + VERSION + " | command #" + (cmd.id || 0) + " | " + (/* @__PURE__ */ new Date()).toISOString();
  const html = "<pre style=\"font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap\">" + gwEsc(body) + "</pre>";
  const sent = await env.SEND_EMAIL.send({ to, from, subject, text: body, html });
  let rowId = 0;
  try {
    const ins = await env.AUDIT_DB.prepare(
      "INSERT INTO emails (message_id, sender, recipient, subject, body_text, body_html, headers_json, classification, received_at, status) VALUES (?1,?2,?3,?4,?5,?6,'{}','general',?7,'sent')"
    ).bind("gw-" + crypto.randomUUID(), from, to, subject, truncate(body, BODY_MAX_TEXT), truncate(html, BODY_MAX_HTML), (/* @__PURE__ */ new Date()).toISOString()).run();
    rowId = ins.meta?.last_row_id || 0;
  } catch (e) {
    console.error("Reply log:", e.message);
  }
  console.log("[GW] reply sent to=" + to + " from=" + from + " cmd=" + (cmd.id || 0) + " messageId=" + (sent && sent.messageId ? sent.messageId : "?"));
  return rowId;
}
__name(gwSendReply, "gwSendReply");
function gwHelpText() {
  return [
    "QNFO email ops gateway - put one command on the first line of your reply.",
    "",
    "READ (any allowlisted sender)",
    "  HELP                this list",
    "  WHOAMI              your sender identity, allowlist match, recent commands",
    "  STATUS              fleet counters: open issues, mail 24h, pending commands, services",
    "  ISSUES [n]          open agent issues (default 10)",
    "  INBOX [status] [n]  recent mail, optional status filter (processed|sent|spam|...)",
    "  EMAIL <id>          one stored message (headers + body preview)",
    "  SERVICES [filter]   service registry (worker, version, state)",
    "  SERVICE <name>      one registry row with routes + deps",
    "  CRONS               scheduled fleet crons with next fire time",
    "  SQL <select ...>    read-only query against qnfo-audit (single statement, LIMIT forced)",
    "",
    "WRITE (envelope-verified owner senders only)",
    "  NOTE <text>         record an intent/note",
    "  TASK <text>         register a task in the task register",
    "  RESEARCH <idea>     queue a research idea in research_queue",
    "  MARK <id> <status>  change a stored message status",
    "",
    "FREE-FORM            any other text is answered/actioned by the ops agent",
    "                     (a reply to an alert/digest is read with that mail as context)"
  ].join("\n");
}
__name(gwHelpText, "gwHelpText");
async function gwRunVerb(env, cmd, ctx) {
  const db = env.AUDIT_DB;
  const v = cmd.verb;
  const arg = String(cmd.text || "").trim();
  const nth = function (def) {
    const n = parseInt(arg, 10);
    return n > 0 && n <= 25 ? n : def;
  };
  if (v === "HELP" || v === "EMPTY") return { ok: true, text: gwHelpText() };
  if (v === "WHOAMI") {
    const hist = await db.prepare("SELECT id, verb, status, created_at FROM email_commands WHERE sender=?1 ORDER BY id DESC LIMIT 5").bind(cmd.sender).all();
    return { ok: true, text: [
      "sender: " + cmd.sender,
      "recipient: " + (cmd.recipient || ""),
      "allowlist match: " + ctx.policy.pattern + " (" + ctx.policy.kind + ", via " + ctx.policy.via + ")",
      "identity: " + (ctx.verified ? "envelope-verified - write verbs enabled" : "header-only - read-only verbs"),
      "in reply to: " + (cmd.in_reply_to || "(new message)"),
      "parent mail: " + (ctx.parent ? truncate(ctx.parent.subject, 70) + " [" + ctx.parent.sender + "]" : "(none)"),
      "recent commands:",
      gwRows(hist.results || [], 5, 60)
    ].join("\n") };
  }
  if (v === "STATUS") {
    const s = await db.prepare("SELECT (SELECT COUNT(*) FROM agent_issues WHERE status='open') AS open_issues, (SELECT COUNT(*) FROM emails WHERE julianday(received_at) > julianday('now','-24 hours')) AS mail_24h, (SELECT COUNT(*) FROM emails) AS mail_total, (SELECT COUNT(*) FROM email_commands) AS commands, (SELECT COUNT(*) FROM email_commands WHERE status='pending') AS commands_pending, (SELECT COUNT(*) FROM service_registry) AS services, (SELECT COUNT(*) FROM research_queue) AS research_queue, (SELECT COUNT(*) FROM version_queue WHERE status='gate-blocked') AS versions_gate_blocked").first();
    return { ok: true, text: gwRows(s ? [s] : [], 1, 200) };
  }
  if (v === "ISSUES") {
    const n = nth(10);
    const c = await db.prepare("SELECT COUNT(*) AS n FROM agent_issues WHERE status='open'").first();
    const rows = await db.prepare("SELECT id, priority, source, substr(COALESCE(title,''),1,90) AS title FROM agent_issues WHERE status='open' ORDER BY id DESC LIMIT ?1").bind(n).all();
    return { ok: true, text: "open agent issues: " + (c ? c.n : "?") + " (showing " + (rows.results || []).length + ")\n" + gwRows(rows.results || [], 25, 100) };
  }
  if (v === "INBOX") {
    const parts = arg.split(/\s+/).filter(Boolean);
    let status = "";
    let n = 10;
    for (const p2 of parts) {
      if (/^\d+$/.test(p2)) n = Math.min(parseInt(p2, 10), 25);
      else status = p2.toLowerCase();
    }
    let rows;
    if (status) {
      rows = await db.prepare("SELECT id, sender, substr(COALESCE(subject,''),1,60) AS subject, status, received_at FROM emails WHERE status=?1 ORDER BY id DESC LIMIT ?2").bind(status, n).all();
    } else {
      rows = await db.prepare("SELECT id, sender, substr(COALESCE(subject,''),1,60) AS subject, status, received_at FROM emails ORDER BY id DESC LIMIT ?1").bind(n).all();
    }
    return { ok: true, text: "recent mail" + (status ? " (status=" + status + ")" : "") + ":\n" + gwRows(rows.results || [], 25, 70) };
  }
  if (v === "EMAIL") {
    const id = parseInt(arg, 10);
    if (!id) return { ok: false, text: "usage: EMAIL <id>" };
    const r = await db.prepare("SELECT id, sender, recipient, subject, status, received_at, substr(COALESCE(body_text,''),1,900) AS body FROM emails WHERE id=?1").bind(id).first();
    if (!r) return { ok: false, text: "no stored message with id " + id };
    return { ok: true, text: gwRows([r], 1, 300) };
  }
  if (v === "SQL") {
    const g = gwSqlGuard(arg);
    if (!g.ok) return { ok: false, text: g.why };
    const rows = await db.prepare(g.q).all();
    return { ok: true, text: "rows: " + (rows.results || []).length + "\n" + gwRows(rows.results || [], 25, 120) };
  }
  if (v === "SERVICES") {
    const f = arg.replace(/[%_]/g, "");
    let rows;
    if (f) {
      rows = await db.prepare("SELECT service, version, state, substr(COALESCE(purpose,''),1,70) AS purpose FROM service_registry WHERE service LIKE ?1 ORDER BY service LIMIT 30").bind("%" + f + "%").all();
    } else {
      rows = await db.prepare("SELECT service, version, state FROM service_registry ORDER BY service LIMIT 40").all();
    }
    return { ok: true, text: "service registry:\n" + gwRows(rows.results || [], 40, 90) };
  }
  if (v === "SERVICE") {
    if (!arg) return { ok: false, text: "usage: SERVICE <name>" };
    const r = await db.prepare("SELECT service, kind, version, base_url, purpose, routes, deps, updated_at FROM service_registry WHERE service=?1").bind(arg.split(/\s+/)[0]).first();
    if (!r) return { ok: false, text: "no registry row for " + arg };
    return { ok: true, text: gwRows([r], 1, 400) };
  }
  if (v === "CRONS") {
    const rows = await db.prepare("SELECT name, cron_expr, task_id, enabled, last_fired, next_fire FROM fleet_crons ORDER BY next_fire LIMIT 30").all();
    return { ok: true, text: "fleet crons:\n" + gwRows(rows.results || [], 30, 60) };
  }
  if (WRITE_VERBS.indexOf(v) >= 0) {
    if (ctx.policy.kind !== "owner" || !ctx.verified) return { ok: false, text: v + " requires an envelope-verified owner sender" };
    if (!arg) return { ok: false, text: "usage: " + v + " <text>" };
  }
  if (v === "NOTE") {
    const iid = "int-email-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await db.prepare("INSERT INTO intents (id, desire, source, device, type, status, summary, created_at) VALUES (?1,?2,'email-gateway','email','note','pending',?3,?4)").bind(iid, arg, truncate(arg, 200), (/* @__PURE__ */ new Date()).toISOString()).run();
    return { ok: true, text: "note recorded as intent " + iid + " (type=note, status=pending, source=email-gateway)" };
  }
  if (v === "TASK") {
    const ins = await db.prepare("INSERT INTO task_dod_register (source_table, source_row_id, title, owner, dod, status, created_at) VALUES ('email_commands', ?1, ?2, 'agent', ?3, 'open', datetime('now'))").bind(String(cmd.id), truncate(arg, 200), "Requested by email command #" + cmd.id + "; done when the requester confirms or the action is verified.").run();
    return { ok: true, text: "task registered in task_dod_register: row " + (ins.meta?.last_row_id || "?") + " (status=open, owner=agent)\n" + truncate(arg, 200) };
  }
  if (v === "RESEARCH") {
    const rid = "rq-email-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.prepare("INSERT INTO research_queue (id, source, source_id, idea, summary, decision, status, created_at) VALUES (?1,'email-gateway',?2,?3,?4,'accepted','queued',?5)").bind(rid, String(cmd.id), truncate(arg, 2000), truncate(arg, 300), (/* @__PURE__ */ new Date()).toISOString()).run();
    return { ok: true, text: "research idea queued in research_queue: " + rid + " (status=queued, source=email-gateway)" };
  }
  if (v === "MARK") {
    const parts = arg.split(/\s+/);
    const eid = parseInt(parts[0], 10);
    const st = (parts[1] || "").toLowerCase();
    if (!eid || EMAIL_STATUSES.indexOf(st) < 0) return { ok: false, text: "usage: MARK <email_id> <" + EMAIL_STATUSES.join("|") + ">" };
    await db.prepare("UPDATE emails SET status=?1 WHERE id=?2").bind(st, eid).run();
    return { ok: true, text: "message " + eid + " marked " + st };
  }
  // ASK / unknown -> queued for the ops agent drain
  return { queued: true, text: null };
}
__name(gwRunVerb, "gwRunVerb");
async function handleCommand(env, msg) {
  const db = env.AUDIT_DB;
  if (!db || !env.SEND_EMAIL) return null;
  const body = String(msg.bodyText || "");
  if (body.indexOf(GATEWAY_MARKER) !== -1) return null;
  const envelope = gwAddrOf(msg.from);
  const headerFrom = gwAddrOf(msg.headers ? msg.headers.get("from") : "");
  const policy = await gwSenderPolicy(db, envelope, headerFrom);
  if (!policy) return null;
  const inReplyTo = gwCleanMsgId(msg.headers ? msg.headers.get("in-reply-to") || "" : "");
  const refs = gwCleanMsgId(msg.headers ? msg.headers.get("references") || "" : "");
  if (inReplyTo) {
    const selfLoop = await db.prepare("SELECT id FROM email_commands WHERE reply_email_id IN (SELECT id FROM emails WHERE message_id=?1) LIMIT 1").bind(inReplyTo).first();
    if (selfLoop) return null;
  }
  const dup = await db.prepare("SELECT id FROM email_commands WHERE message_id=?1 LIMIT 1").bind(msg.messageId).first();
  if (dup) return null;
  const verified = envelope && headerFrom ? gwDomainOf(envelope) === gwDomainOf(headerFrom) ? 1 : 0 : 1;
  const parsed = gwParse(msg.subject, body);
  const parent = inReplyTo || refs ? await db.prepare("SELECT id, sender, subject, substr(COALESCE(body_text,''),1,1500) AS body_text FROM emails WHERE message_id=?1 LIMIT 1").bind(inReplyTo || refs).first() : null;
  const ins = await db.prepare("INSERT INTO email_commands (email_id, message_id, in_reply_to, sender, recipient, subject, verb, command_text, status, attempts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'pending',0)").bind(msg.emailId, msg.messageId, inReplyTo || refs || null, envelope || headerFrom, msg.to, msg.subject, parsed.verb, truncate(parsed.text, 4000)).run();
  const cmdId = ins.meta?.last_row_id || 0;
  const replyTo = policy.via === "envelope" ? envelope : headerFrom;
  const cmd = { id: cmdId, verb: parsed.verb, text: parsed.text, sender: envelope || headerFrom, replyTo, recipient: msg.to, subject: msg.subject, in_reply_to: inReplyTo || refs || "" };
  let res;
  try {
    res = await gwRunVerb(env, cmd, { policy, verified: !!verified, parent, id: cmdId });
  } catch (e) {
    res = { ok: false, text: "execution error: " + e.message };
  }
  let reply;
  if (res.queued) {
    reply = "Command #" + cmdId + " accepted (" + parsed.verb + ").\nQueued for the ops agent - the answer arrives in a separate reply (target: a few minutes).\n\nReply HELP for the verb list.";
    await db.prepare("UPDATE email_commands SET attempts=attempts+1, updated_at=datetime('now') WHERE id=?1").bind(cmdId).run();
  } else {
    reply = (res.ok ? "OK - " + parsed.verb : "FAILED - " + parsed.verb) + "\n\n" + (res.text || "(no output)") + "\n\nReply HELP for the verb list.";
    await db.prepare("UPDATE email_commands SET status=?1, result=?2, attempts=attempts+1, updated_at=datetime('now') WHERE id=?3").bind(res.ok ? "answered" : "error", truncate(res.text || "", 8000), cmdId).run();
  }
  await gwSendReply(env, cmd, reply);
  return cmdId;
}
__name(handleCommand, "handleCommand");

export {
  qnfo_email_default as default
};
//# sourceMappingURL=qnfo-email.js.map
