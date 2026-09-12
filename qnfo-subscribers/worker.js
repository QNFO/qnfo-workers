// qnfo-subscribers — qnfo.org email capture + weekly research digest
//
// Canonical source: QNFO/qnfo-workers/qnfo-subscribers/worker.js
// Purpose: own the newsletter subscriber list (qnfo-audit.subscribers), run
//          double opt-in confirmation, and mail a weekly digest of newly
//          published papers. The public form lives on qnfo.org; the gateway
//          proxies /api/subscribe, /api/confirm and /api/unsubscribe here.
//
// Double opt-in: a sign-up is stored as status='pending' and only becomes
// 'subscribed' (and thus digest-eligible) after the confirmation link is opened.
//
// Bindings:
//   AUDIT       D1   qnfo-audit      (subscribers, subscriber_digest_runs)
//   LIVING      D1   living-paper    (papers)
//   SEND_EMAIL  send_email           (Cloudflare Email Routing - native send)
// Secret:
//   SUBSCRIBERS_TOKEN  Bearer token for POST /run/digest (manual trigger)

const VERSION = "1.1.1";
const SITE = "https://qnfo.org";
const FROM = { email: "qnfo@qnfo.org", name: "QNFO" };
const MAX_RECIPIENTS = 1000;
const RATE_LIMIT_PER_HOUR = 5;
const DIGEST_WINDOW_DAYS = 7;
const PAPER_CAP = 60;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function html(body, status) {
  const page = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">" +
    "<title>QNFO</title><style>body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;" +
    "background:#faf7f2;color:#1b1915;display:flex;min-height:100vh;align-items:center;justify-content:center}" +
    "main{max-width:560px;padding:2.5rem 1.6rem;text-align:center}h1{font-family:Georgia,serif;font-size:1.6rem;font-weight:600}" +
    "p{color:#8a8376;line-height:1.7}a{color:#24315e}</style></head><body><main>" + body +
    "<p style=\"margin-top:2rem\"><a href=\"" + SITE + "\">\u2190 qnfo.org</a></p></main></body></html>";
  return new Response(page, { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function normEmail(v) { return String(v == null ? "" : v).trim().toLowerCase(); }

function validEmail(e) {
  if (!e || e.length > 254) return false;
  return /^[^@\s]{1,64}@[^@\s.]{1,255}\.[^@\s.]{2,}$/.test(e);
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  const arr = Array.from(new Uint8Array(buf));
  let out = "";
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, "0");
  return out;
}

function fmtDate(s) { return String(s || "").slice(0, 10); }
function unsubUrl(token) { return SITE + "/api/unsubscribe?token=" + encodeURIComponent(token); }
function confirmUrl(token) { return SITE + "/api/confirm?token=" + encodeURIComponent(token); }

async function sendEmail(env, to, subject, text) {
  if (!env.SEND_EMAIL) return { error: "SEND_EMAIL binding missing" };
  try {
    const r = await env.SEND_EMAIL.send({ to, from: FROM, subject, text });
    return { ok: true, messageId: (r && r.messageId) || null };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

function confirmText(token) {
  return [
    "Thanks for subscribing to QNFO.",
    "",
    "Please confirm your subscription by opening this link:",
    "",
    confirmUrl(token),
    "",
    "Once confirmed you will receive a short weekly digest of new QNFO papers:",
    "titles, links and DOIs, nothing else.",
    "",
    "If you did not request this, ignore this message - no further email will be sent.",
    "",
    "Browse the corpus: " + SITE + "/papers",
    "",
    "\u2014 QNFO"
  ].join("\n");
}

function digestText(papers, token) {
  const lines = [];
  lines.push(papers.length + (papers.length === 1 ? " new paper" : " new papers") + " from QNFO this week.");
  lines.push("");
  for (let i = 0; i < papers.length; i++) {
    const p = papers[i];
    const doi = p.doi || p.zenodo_doi || "";
    lines.push((i + 1) + ". " + String(p.title || "").replace(/\s+/g, " ").trim());
    const meta = [];
    if (p.created_at) meta.push(fmtDate(p.created_at));
    if (doi) meta.push("DOI: " + doi);
    if (meta.length) lines.push("   " + meta.join("  \u00b7  "));
    if (p.slug) lines.push("   " + SITE + "/papers/" + p.slug);
    lines.push("");
  }
  lines.push("Unsubscribe: " + unsubUrl(token));
  lines.push("");
  lines.push("\u2014 QNFO");
  return lines.join("\n");
}

async function handleSubscribe(request, env) {
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const email = normEmail(body && body.email);
  const hp = String((body && (body.hp || body.website)) || "");
  if (hp) return json({ ok: true, pending: true });

  if (!validEmail(email)) return json({ ok: false, error: "Please enter a valid email address." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  const ua = String(request.headers.get("User-Agent") || "").slice(0, 300);
  const ipHash = ip ? await sha256Hex(ip) : "";
  const source = String((body && body.source) || "qnfo.org").slice(0, 80);

  try {
    if (ipHash) {
      const r = await env.AUDIT.prepare(
        "SELECT COUNT(*) AS c FROM subscribers WHERE ip_hash = ?1 AND created_at >= datetime('now','-1 hour')"
      ).bind(ipHash).first();
      if (r && r.c >= RATE_LIMIT_PER_HOUR) {
        return json({ ok: false, error: "Too many sign-ups from this network. Please try again later." }, 429);
      }
    }

    const existing = await env.AUDIT.prepare(
      "SELECT email, status, welcomed_at, unsub_token FROM subscribers WHERE email = ?1"
    ).bind(email).first();

    let token = existing && existing.unsub_token ? existing.unsub_token : "";
    if (!token) token = crypto.randomUUID().replace(/-/g, "");

    // An already-confirmed subscriber stays confirmed; anything else becomes pending.
    await env.AUDIT.prepare(
      "INSERT INTO subscribers (email, status, source, unsub_token, ip_hash, user_agent, created_at) " +
      "VALUES (?1, 'pending', ?2, ?3, ?4, ?5, datetime('now')) " +
      "ON CONFLICT(email) DO UPDATE SET " +
      "status = CASE WHEN subscribers.status = 'subscribed' THEN 'subscribed' ELSE 'pending' END, " +
      "updated_at = datetime('now'), source = excluded.source"
    ).bind(email, source, token, ipHash, ua).run();

    const alreadyConfirmed = !!(existing && existing.status === "subscribed");
    let sent = false;
    if (!alreadyConfirmed) {
      const res = await sendEmail(env, email, "Confirm your QNFO subscription", confirmText(token));
      if (res && res.ok) {
        sent = true;
        await env.AUDIT.prepare("UPDATE subscribers SET welcomed_at = datetime('now') WHERE email = ?1").bind(email).run();
      }
    }
    return json({ ok: true, pending: !alreadyConfirmed, confirmation_sent: sent });
  } catch (e) {
    return json({ ok: false, error: "Sign-up failed. Please try again shortly." }, 500);
  }
}

async function handleConfirm(request, env) {
  const u = new URL(request.url);
  const token = u.searchParams.get("token") || "";
  if (!token) return html("<h1>Missing link</h1><p>This confirmation link is incomplete.</p>", 400);
  try {
    const row = await env.AUDIT.prepare("SELECT email, status FROM subscribers WHERE unsub_token = ?1").bind(token).first();
    if (!row) return html("<h1>Link not recognised</h1><p>This confirmation link is invalid.</p>", 404);
    if (row.status === "subscribed") {
      return html("<h1>Already confirmed</h1><p>Your subscription is active. The next digest will reach you by email.</p>");
    }
    await env.AUDIT.prepare(
      "UPDATE subscribers SET status='subscribed', confirmed_at=datetime('now'), updated_at=datetime('now') WHERE unsub_token = ?1"
    ).bind(token).run();
    return html("<h1>Subscription confirmed</h1><p>You are on the list. The next digest of new QNFO papers will reach you by email.</p>");
  } catch (e) {
    return html("<h1>Something went wrong</h1><p>Please try again later.</p>", 500);
  }
}

async function handleUnsubscribe(request, env) {
  const u = new URL(request.url);
  const token = u.searchParams.get("token") || "";
  if (!token) return html("<h1>Missing link</h1><p>This unsubscribe link is incomplete.</p>", 400);
  try {
    const r = await env.AUDIT.prepare(
      "UPDATE subscribers SET status='unsubscribed', updated_at=datetime('now') WHERE unsub_token = ?1"
    ).bind(token).run();
    const changed = r && r.meta && r.meta.changes ? r.meta.changes : 0;
    if (!changed) return html("<h1>Link not recognised</h1><p>This unsubscribe link is invalid or has already been used.</p>", 404);
    return html("<h1>You're unsubscribed</h1><p>You will not receive any further QNFO research digests.</p>");
  } catch (e) {
    return html("<h1>Something went wrong</h1><p>Please try again later.</p>", 500);
  }
}

async function recordRun(env, since, now, papers, recipients, sent, failed, status, notes) {
  try {
    await env.AUDIT.prepare(
      "INSERT INTO subscriber_digest_runs (period_start, period_end, papers, recipients, sent, failed, status, notes) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    ).bind(since, now, papers, recipients, sent, failed, status, notes || null).run();
  } catch (e) { /* best-effort */ }
}

async function runDigest(env, opts) {
  opts = opts || {};
  const windowDays = Number(opts.windowDays) > 0 ? Number(opts.windowDays) : DIGEST_WINDOW_DAYS;
  const since = opts.since || new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  let papers = [];
  try {
    const pr = await env.LIVING.prepare(
      "SELECT slug, title, created_at, doi, zenodo_doi FROM papers " +
      "WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill') AND created_at >= ?1 " +
      "ORDER BY created_at DESC LIMIT " + PAPER_CAP
    ).bind(since).all();
    papers = (pr && pr.results) || [];
  } catch (e) {
    return { ok: false, error: "papers query failed: " + String((e && e.message) || e) };
  }

  let subs = [];
  try {
    const sr = await env.AUDIT.prepare(
      "SELECT email, unsub_token FROM subscribers WHERE status='subscribed' ORDER BY created_at LIMIT " + MAX_RECIPIENTS
    ).all();
    subs = (sr && sr.results) || [];
  } catch (e) {
    return { ok: false, error: "subscribers query failed: " + String((e && e.message) || e) };
  }

  if (!papers.length) {
    await recordRun(env, since, now, 0, subs.length, 0, 0, "skipped", "no new papers in window");
    return { ok: true, skipped: "no-new-papers", papers: 0, recipients: subs.length, sent: 0, failed: 0 };
  }
  if (!subs.length) {
    await recordRun(env, since, now, papers.length, 0, 0, 0, "skipped", "no confirmed subscribers");
    return { ok: true, skipped: "no-subscribers", papers: papers.length, recipients: 0, sent: 0, failed: 0 };
  }

  const subject = "QNFO research digest \u2014 " + papers.length + (papers.length === 1 ? " new paper" : " new papers");
  let sent = 0, failed = 0;
  const BATCH = 8;
  for (let i = 0; i < subs.length; i += BATCH) {
    const slice = subs.slice(i, i + BATCH);
    const results = await Promise.all(slice.map(function (s) {
      return sendEmail(env, s.email, subject, digestText(papers, s.unsub_token));
    }));
    for (let j = 0; j < results.length; j++) {
      if (results[j] && results[j].ok) sent++; else failed++;
    }
  }

  // Record delivery evidence on the subscribers that actually received the digest.
  if (sent > 0) {
    try {
      await env.AUDIT.prepare(
        "UPDATE subscribers SET last_digest_at = datetime('now') WHERE status='subscribed'"
      ).run();
    } catch (e) { /* best-effort */ }
  }

  await recordRun(env, since, now, papers.length, subs.length, sent, failed, failed ? "partial" : "ok", null);
  return { ok: true, papers: papers.length, recipients: subs.length, sent: sent, failed: failed };
}

async function health(env) {
  let confirmed = null, pending = null;
  try {
    // COALESCE: SUM() over an empty table is NULL, which would report "unknown"
    // instead of the true zero. Counts must be numbers at all times.
    const r = await env.AUDIT.prepare("SELECT COALESCE(SUM(status='subscribed'),0) AS c, COALESCE(SUM(status='pending'),0) AS p, COUNT(*) AS total FROM subscribers").first();
    confirmed = r ? Number(r.c) : null;
    pending = r ? Number(r.p) : null;
  } catch (e) { confirmed = "err"; }
  return json({
    status: "ok",
    worker: "qnfo-subscribers",
    version: VERSION,
    subscribers: confirmed,
    pending: pending,
    send_email: !!env.SEND_EMAIL,
    audit_db: !!env.AUDIT,
    living_db: !!env.LIVING
  });
}

export default {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);
    const p = u.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }
    if (p === "/health" && method === "GET") return health(env);
    if (p === "/subscribe" && method === "POST") return handleSubscribe(request, env);
    if (p === "/confirm" && (method === "GET" || method === "POST")) return handleConfirm(request, env);
    if (p === "/unsubscribe" && (method === "GET" || method === "POST")) return handleUnsubscribe(request, env);
    if (p === "/run/digest" && method === "POST") {
      const auth = request.headers.get("Authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!env.SUBSCRIBERS_TOKEN || token !== env.SUBSCRIBERS_TOKEN) return json({ ok: false, error: "unauthorized" }, 401);
      let o = {};
      try { o = await request.json(); } catch (e) { o = {}; }
      return json(await runDigest(env, o));
    }
    if (p === "/" || p === "") {
      return html("<h1>QNFO subscribers</h1><p>Service endpoint. Sign up at <a href=\"" + SITE + "\">" + SITE + "</a>.</p>");
    }
    return json({ error: "not found", path: p }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDigest(env, {}));
  }
};
