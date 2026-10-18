var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.3.3-utm-metric-1"; // 1.3.1 WORKERS-BP-LOGGING-qnfo-subscribers-1 (2026-10-14, agent_issues 2539, child of 2342, pillar autonomy): the swallowed catch in handleSubscribe logs as a structured console.error (worker, where, error); control flow unchanged. // 1.3.0 (2026-10-13, pillar autonomy, issue 2397) CRON-ONLY-HEARTBEAT-1: the weekly cron upserts qnfo-audit.fleet_heartbeat after the digest run.
// 1.2.0 (2026-10-12, pillar reach, issue 1753) SUBSCRIBE-FUNNEL-1: every step of the sign-up
// funnel is counted in qnfo-audit.subscribe_funnel (day, stage, source, n; a counter, never an address): box and page views,
// submits by outcome (accepted, honeypot, invalid, rate-limited, suppressed, repeat), confirmation mails sent or failed,
// confirm-page views, confirmations and unsubscribes. GET /funnel returns the 30-day funnel and names its largest leak (open,
// counts only); GET /subscribe is a sign-up page of its own (one field, works without scripts) that a post or a mail can link
// to; POST /funnel/view lets another surface count a view of its box. SUBSCRIBE-SEND-HONEST-1: a sign-up whose confirmation
// mail could not be sent answers with an error instead of "check your inbox". SUBSCRIBE-RESEND-BOUND-1: a pending address gets
// at most one confirmation mail an hour, however often the form is submitted with it (the form could be used to mail one
// address without limit). The digest token is compared in constant time; event ids come from crypto.randomUUID.
// 1.1.10-doi-scrub // 1.1.8 DIGEST-LINKS-UTM-1 (2026-10-06, pillar reach; transformation lever T7.10): every paper link in the
// weekly digest carries utm_source=digest&utm_medium=email&utm_campaign=<slug> and the confirmation mail's corpus link
// utm_source=confirm&utm_medium=email&utm_campaign=corpus, so a digest read becomes a measured visit once qnfo-gateway 3.10.0
// (UTM-CLICK-LEDGER-1, T7.9) counts tagged page loads into reach_signals source utm (channel digest, campaign slug). No
// per-recipient id: the campaign is the paper, never the reader. Unsubscribe and confirm links stay untagged (API routes).
// 1.1.7 // 1.1.5 FLEET-CTL-STATIC-1: static fleet link (issue 1778); DIGEST-EXCLUDE-1 (2026-10-02): the digest skips quarantined papers, as papers.qnfo.org does
// 1.1.7 (2026-10-05, pillar: reach): SUBSCRIBE-CONFIRM-POST-1 (#1904) and SUBSCRIBE-SEND-LOG-1 (#1905).
// (1) GET /confirm?token=... no longer confirms. Mail link scanners (for example Microsoft Safe Links) fetch every link in a
//     message, so a confirming GET turned scanner traffic into subscribers nobody opted in. GET returns a page with one
//     "Confirm subscription" button; only its POST sets status='subscribed'. The button posts to this worker's own origin,
//     because qnfo-gateway forwards /api/confirm upstream as a GET whatever the browser's method. The link in the email is
//     unchanged. Each page view and each confirmation is one cloud_ops_events row (kind 'subscribers-confirm', no address),
//     so the double opt-in completion rate is measurable.
// (2) Every send writes one cloud_ops_events row (kind 'subscribers-send', status ok|error, meta {kind: confirm|digest,
//     domain, messageId or error}); the address itself is never written, only its domain. Digest sends carry
//     List-Unsubscribe <https unsubscribe URL> and List-Unsubscribe-Post: List-Unsubscribe=One-Click (Cloudflare Email
//     Service send() accepts headers; refused headers fall back to a send without them, recorded as headers_refused).
//     The one-click POST reaches /unsubscribe, which already unsubscribes on GET or POST.
// The cron "0 16 * * 1" fires on Sunday 16:00 UTC (Cloudflare cron day-of-week 1 = Sunday; subscriber_digest_runs rows
// 2026-09-13..10-04 are all Sundays), so /health now says Sunday.
var SITE = "https://qnfo.org";
// DIGEST-LINKS-UTM-1: a site link tagged for the reach ledger (qnfo-gateway counts utm-tagged HTML loads; the campaign is the
// paper slug or a fixed word, never a recipient id).
function utmLink(path, source, campaign) {
  return SITE + path + "?utm_source=" + encodeURIComponent(source) + "&utm_medium=email&utm_campaign=" + encodeURIComponent(campaign);
}
__name(utmLink, "utmLink");
// FLEET-CTL-STATIC-1 (issue 1778; owner request 1757): the owner's fleet command-line link on the subscribe, confirm and
// unsubscribe pages, as static HTML scoped to the subscribe surface. Not fleet.qnfo.org/ctl.js: it scopes the link with
// location.href, and these pages are opened at /api/confirm?token=... and /api/unsubscribe?token=..., so a click would carry
// the subscriber's token to another site.
var FLEET_CTL_LINK = '<a id="fleet-ctl" href="https://fleet.qnfo.org/cmd?from=' + encodeURIComponent(SITE + "/subscribe") + '" rel="noopener noreferrer" title="Fleet command line for this page (owner controls need an email code)" aria-label="Fleet command line" style="position:fixed;right:10px;bottom:8px;z-index:2147483000;font:12px/1 system-ui,sans-serif;padding:5px 8px;border-radius:7px;color:#5b6472;background:rgba(127,127,127,.12);text-decoration:none;opacity:.45">&#8984; fleet</a><style>@media print{#fleet-ctl{display:none!important}}</style>';
var FROM = { email: "qnfo@qnfo.org", name: "QNFO" };
var MAX_RECIPIENTS = 1e3;
var RATE_LIMIT_PER_HOUR = 5;
var DIGEST_WINDOW_DAYS = 7;
var PAPER_CAP = 60;
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(json, "json");
function html(body, status) {
  const page = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>QNFO</title><style>body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#faf7f2;color:#1b1915;display:flex;min-height:100vh;align-items:center;justify-content:center}main{max-width:560px;padding:2.5rem 1.6rem;text-align:center}h1{font-family:Georgia,serif;font-size:1.6rem;font-weight:600}p{color:#8a8376;line-height:1.7}a{color:#24315e}</style></head><body><main>' + body + '<p style="margin-top:2rem"><a href="' + SITE + '">\u2190 qnfo.org</a></p></main>' + FLEET_CTL_LINK + '</body></html>';
  return new Response(page, { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(html, "html");
function normEmail(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}
__name(normEmail, "normEmail");
function validEmail(e) {
  if (!e || e.length > 254) return false;
  return /^[^@\s]{1,64}@[^@\s.]{1,255}\.[^@\s.]{2,}$/.test(e);
}
__name(validEmail, "validEmail");
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  const arr = Array.from(new Uint8Array(buf));
  let out = "";
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, "0");
  return out;
}
__name(sha256Hex, "sha256Hex");
function fmtDate(s) {
  return String(s || "").slice(0, 10);
}
__name(fmtDate, "fmtDate");
function unsubUrl(token) {
  return SITE + "/api/unsubscribe?token=" + encodeURIComponent(token);
}
__name(unsubUrl, "unsubUrl");
function confirmUrl(token) {
  return SITE + "/api/confirm?token=" + encodeURIComponent(token);
}
__name(confirmUrl, "confirmUrl");
// SUBSCRIBE-SEND-LOG-1 (#1905): one cloud_ops_events row per event; never throws, never stores an address.
async function logEvent(env, kind, status, text, meta) {
  try {
    if (!env.AUDIT) return;
    await env.AUDIT.prepare(
      "INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, ?3, ?4, ?5, 'subscribers', ?6)"
    ).bind(kind + "-" + Date.now().toString(36) + crypto.randomUUID().replace(/-/g, "").slice(0, 6), (/* @__PURE__ */ new Date()).toISOString(), kind, String(text).slice(0, 300), JSON.stringify(Object.assign({ v: VERSION }, meta || {})), status).run();
  } catch (e) {
  }
}
__name(logEvent, "logEvent");
// SUBSCRIBE-FUNNEL-1 (1.2.0, issue 1753): one counter row per day, stage and source. No address, no IP, no token.
var FUNNEL_DDL = "CREATE TABLE IF NOT EXISTS subscribe_funnel (day TEXT NOT NULL, stage TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, stage, source))";
var FUNNEL_READY = new WeakSet();
var FUNNEL_STAGES = ["box_view", "page_view", "submit", "confirm_mail_sent", "confirm_page", "confirmed"];
var BOT_UA_RE = /bot|crawl|spider|slurp|headless|preview|scan|monitor|curl|wget|python|http-client|safelinks/i;
function funnelSource(v) {
  const x = String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
  return x || "unknown";
}
__name(funnelSource, "funnelSource");
async function funnel(env, stage, source) {
  try {
    if (!env.AUDIT) return;
    if (!FUNNEL_READY.has(env.AUDIT)) {
      await env.AUDIT.prepare(FUNNEL_DDL).run();
      FUNNEL_READY.add(env.AUDIT);
    }
    await env.AUDIT.prepare(
      "INSERT INTO subscribe_funnel (day, stage, source, n) VALUES (date('now'), ?1, ?2, 1) ON CONFLICT(day, stage, source) DO UPDATE SET n = n + 1"
    ).bind(String(stage), funnelSource(source)).run();
  } catch (e) {
    console.error(JSON.stringify({ event: "subscribe_funnel_write_failed", stage: String(stage), error: String(e && e.message || e).slice(0, 200) }));
  }
}
__name(funnel, "funnel");
// The 30-day funnel and its largest leak: the step with the lowest pass-through among steps that had any input.
function funnelSummary(rows) {
  const stages = {}, bySource = {};
  for (const r of rows || []) {
    const n = Number(r.n) || 0;
    stages[r.stage] = (stages[r.stage] || 0) + n;
    if (!bySource[r.source]) bySource[r.source] = {};
    bySource[r.source][r.stage] = (bySource[r.source][r.stage] || 0) + n;
  }
  const views = (stages.box_view || 0) + (stages.page_view || 0);
  const steps = [
    { step: "view -> submit", from: views, to: stages.submit || 0 },
    { step: "submit -> confirmation mail sent", from: stages.submit || 0, to: stages.confirm_mail_sent || 0 },
    { step: "confirmation mail sent -> confirm page opened", from: stages.confirm_mail_sent || 0, to: stages.confirm_page || 0 },
    { step: "confirm page opened -> confirmed", from: stages.confirm_page || 0, to: stages.confirmed || 0 }
  ];
  let leak = null;
  for (const st of steps) {
    st.rate = st.from > 0 ? Math.round(st.to / st.from * 1e4) / 1e4 : null;
    if (st.rate !== null && (leak === null || st.rate < leak.rate)) leak = st;
  }
  return { stages, by_source: bySource, steps, largest_leak: leak ? { step: leak.step, from: leak.from, to: leak.to, rate: leak.rate } : null };
}
__name(funnelSummary, "funnelSummary");
async function handleFunnel(env) {
  let rows = [];
  try {
    const r = await env.AUDIT.prepare("SELECT stage, source, SUM(n) AS n FROM subscribe_funnel WHERE day >= date('now','-30 days') GROUP BY stage, source").all();
    rows = r && r.results || [];
  } catch (e) {
    rows = [];
  }
  const out = funnelSummary(rows);
  out.worker = "qnfo-subscribers";
  out.version = VERSION;
  out.window_days = 30;
  out.limits = ["counts only: no address, IP or token is stored", "box_view is counted only for surfaces that report it (POST /funnel/view?source=<surface>); page_view is this worker's own /subscribe page; both skip declared bots", "a surface that reports no view shows submits without a view count"];
  return json(out);
}
__name(handleFunnel, "handleFunnel");
async function handleFunnelView(request, env) {
  const u = new URL(request.url);
  const ua = String(request.headers.get("User-Agent") || "");
  await funnel(env, BOT_UA_RE.test(ua) || !ua ? "box_view_bot" : "box_view", u.searchParams.get("source") || "unknown");
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
__name(handleFunnelView, "handleFunnelView");
// The sign-up page: one field, a plain form post (no script needed), the same double opt-in as every other box.
function subscribePage(source, note) {
  return html('<h1>New QNFO papers by email</h1><p>One short weekly digest: titles and links, nothing else. Nothing is sent until you confirm by email, and every digest carries a one-click unsubscribe.</p>' + (note ? '<p role="status" style="color:#1b1915"><strong>' + escAttr(note) + "</strong></p>" : "") + '<form method="post" action="/subscribe" style="margin-top:1.4rem"><label for="sub-email" style="position:absolute;left:-9999px">Email address</label><input id="sub-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com" style="font:inherit;font-size:1rem;padding:.7rem .8rem;border:1px solid #cfc8ba;border-radius:8px;min-width:16rem;max-width:100%"> <input type="text" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"><input type="hidden" name="source" value="' + escAttr(funnelSource(source)) + '"><button type="submit" style="font:inherit;font-size:1rem;padding:.7rem 1.4rem;border:0;border-radius:8px;background:#24315e;color:#fff;cursor:pointer">Subscribe</button></form>');
}
__name(subscribePage, "subscribePage");
async function handleSubscribePage(request, env) {
  const u = new URL(request.url);
  const source = u.searchParams.get("utm_source") || u.searchParams.get("source") || "subscribe-page";
  const ua = String(request.headers.get("User-Agent") || "");
  await funnel(env, BOT_UA_RE.test(ua) || !ua ? "page_view_bot" : "page_view", source);
  return subscribePage(source);
}
__name(handleSubscribePage, "handleSubscribePage");
// Constant-time comparison of two secrets: both are hashed, so neither length nor a prefix match shows in the timing.
async function safeEqual(a, b) {
  const x = await sha256Hex(String(a)), y = await sha256Hex(String(b));
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
__name(safeEqual, "safeEqual");
function emailDomain(to) {
  return String(to || "").toLowerCase().split("@").pop().slice(0, 120);
}
__name(emailDomain, "emailDomain");
async function sendEmail(env, to, subject, text, kind, headers) {
  kind = kind || "confirm";
  const domain = emailDomain(to);
  if (!env.SEND_EMAIL) {
    await logEvent(env, "subscribers-send", "error", "subscribers " + kind + " send error (" + domain + ")", { kind, domain, error: "SEND_EMAIL binding missing" });
    return { error: "SEND_EMAIL binding missing" };
  }
  const msg = { to, from: FROM, subject, text };
  let headersRefused = null;
  try {
    let r;
    if (headers) {
      try {
        r = await env.SEND_EMAIL.send(Object.assign({}, msg, { headers }));
      } catch (e) {
        const m = String(e && e.message || e);
        if (!/header/i.test(m)) throw e;
        headersRefused = m.slice(0, 200);
        r = await env.SEND_EMAIL.send(msg);
      }
    } else {
      r = await env.SEND_EMAIL.send(msg);
    }
    const messageId = r && r.messageId || null;
    const meta = { kind, domain, messageId };
    if (headers) meta.list_unsubscribe = !headersRefused;
    if (headersRefused) meta.headers_refused = headersRefused;
    await logEvent(env, "subscribers-send", "ok", "subscribers " + kind + " send ok (" + domain + ")", meta);
    return { ok: true, messageId };
  } catch (e) {
    const err = String(e && e.message || e);
    await logEvent(env, "subscribers-send", "error", "subscribers " + kind + " send error (" + domain + ")", { kind, domain, error: err.slice(0, 300) });
    return { error: err };
  }
}
__name(sendEmail, "sendEmail");
// RFC 2369 / RFC 8058 one-click unsubscribe for the digest (Gmail and Yahoo expect it on bulk mail).
function listUnsubscribeHeaders(token) {
  return { "List-Unsubscribe": "<" + unsubUrl(token) + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
__name(listUnsubscribeHeaders, "listUnsubscribeHeaders");
function escAttr(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(escAttr, "escAttr");
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
    "Browse the corpus: " + utmLink("/papers", "confirm", "corpus"),
    "",
    "\u2014 QNFO"
  ].join("\n");
}
__name(confirmText, "confirmText");
function digestText(papers, token) {
  const lines = [];
  lines.push(papers.length + (papers.length === 1 ? " new paper" : " new papers") + " from QNFO this week.");
  lines.push("");
  for (let i = 0; i < papers.length; i++) {
    const p = papers[i];
    const doi = /10\.5281\/|zenodo/i.test(String(p.doi || "")) ? "" : String(p.doi || "");
    lines.push(i + 1 + ". " + String(p.title || "").replace(/\s+/g, " ").trim());
    const meta = [];
    if (p.created_at) meta.push(fmtDate(p.created_at));
    if (doi) meta.push("DOI: " + doi);
    if (meta.length) lines.push("   " + meta.join("  \xB7  "));
    if (p.slug) lines.push("   " + utmLink("/papers/" + p.slug, "digest", p.slug));
    lines.push("");
  }
  lines.push("Unsubscribe: " + unsubUrl(token));
  lines.push("");
  lines.push("\u2014 QNFO");
  return lines.join("\n");
}
__name(digestText, "digestText");
/* SUBSCRIBE-UTM-ATTRIBUTION-1: ensure the utm_source/utm_campaign columns exist (lazy ALTER, safe
 * when the migration already ran) so the sign-up can record which tagged link drove it. */
var SUB_UTM_READY = new WeakSet();
async function ensureSubscriberUtm(env) {
  try {
    if (!env.AUDIT || SUB_UTM_READY.has(env.AUDIT)) return;
    await env.AUDIT.prepare("ALTER TABLE subscribers ADD COLUMN utm_source TEXT NOT NULL DEFAULT ''").run();
    await env.AUDIT.prepare("ALTER TABLE subscribers ADD COLUMN utm_campaign TEXT NOT NULL DEFAULT ''").run();
  } catch (e) {
    /* columns already exist (migration applied first) -- continue */
  }
  SUB_UTM_READY.add(env.AUDIT);
}

async function handleSubscribe(request, env) {
  let body = {};
  // A plain form post (the /subscribe page, no script) is answered with a page; a JSON post (the site's boxes) with JSON.
  const ctype = String(request.headers.get("Content-Type") || "").toLowerCase();
  const isForm = ctype.includes("application/x-www-form-urlencoded") || ctype.includes("multipart/form-data");
  try {
    if (isForm) {
      const f = await request.formData();
      body = { email: f.get("email"), hp: f.get("hp"), website: f.get("website"), source: f.get("source"), utm_source: f.get("utm_source"), utm_campaign: f.get("utm_campaign") };
    } else body = await request.json();
  } catch (e) {
    body = {};
  }
  const src = String(body && body.source || "qnfo.org").slice(0, 80);
  const utmSource = String(body && body.utm_source || "").slice(0, 80);
  const utmCampaign = String(body && body.utm_campaign || "").slice(0, 120);
  const reply = function(data, status) {
    if (!isForm) return json(data, status);
    if (data.ok) return html("<h1>Check your inbox</h1><p>" + (data.pending === false ? "This address is already subscribed. The next digest will reach you by email." : "A confirmation link is on its way. Your subscription starts when you open it and press the button. If nothing arrives within a few minutes, look in the spam folder.") + "</p>", status);
    return subscribePage(src, data.error || "The sign-up did not go through. Please try again.");
  };
  const email = normEmail(body && body.email);
  const hp = String(body && (body.hp || body.website) || "");
  if (hp) {
    await funnel(env, "submit_honeypot", src);
    return reply({ ok: true, pending: true });
  }
  if (!validEmail(email)) {
    await funnel(env, "submit_invalid", src);
    return reply({ ok: false, error: "Please enter a valid email address." }, 400);
  }
  // SUPPRESSION-BYPASS-AT-SUBSCRIBE-1 (#1276): honor email_suppression at sign-up
  // so an owner-suppressed address cannot silently re-enter the list. Return a
  // soft success (do not reveal suppression) and skip the INSERT + confirmation.
  try {
    const sup = await env.AUDIT.prepare("SELECT 1 AS x FROM email_suppression WHERE lower(email) = ?1").bind(email).first();
    if (sup) {
      await funnel(env, "submit_suppressed", src);
      return reply({ ok: true, pending: false, confirmation_sent: false, suppressed: true });
    }
  } catch (e) { console.error(JSON.stringify({ worker: "qnfo-subscribers", where: "handleSubscribe", error: String(e && e.message || e) })); }
  // SUBSCRIBE-CLIENT-IP-1: the gateway forwards the visitor identity as X-Forwarded-For / X-Client-UA;
  // read those first so worker-to-worker subrequests don't rate-limit the whole site as one visitor.
  const ip = request.headers.get("X-Forwarded-For") || request.headers.get("CF-Connecting-IP") || "";
  const ua = String(request.headers.get("X-Client-UA") || request.headers.get("User-Agent") || "").slice(0, 300);
  const ipHash = ip ? await sha256Hex(ip) : "";
  const source = src;
  try {
    if (ipHash) {
      const r = await env.AUDIT.prepare(
        "SELECT COUNT(*) AS c FROM subscribers WHERE ip_hash = ?1 AND created_at >= datetime('now','-1 hour')"
      ).bind(ipHash).first();
      if (r && r.c >= RATE_LIMIT_PER_HOUR) {
        await funnel(env, "submit_rate_limited", src);
        return reply({ ok: false, error: "Too many sign-ups from this network. Please try again later." }, 429);
      }
    }
    const existing = await env.AUDIT.prepare(
      "SELECT email, status, welcomed_at, unsub_token, (welcomed_at IS NOT NULL AND welcomed_at >= datetime('now','-60 minutes')) AS mailed_recently FROM subscribers WHERE email = ?1"
    ).bind(email).first();
    let token = existing && existing.unsub_token ? existing.unsub_token : "";
    if (!token) token = crypto.randomUUID().replace(/-/g, "");
    await ensureSubscriberUtm(env);
    await env.AUDIT.prepare(
      "INSERT INTO subscribers (email, status, source, utm_source, utm_campaign, unsub_token, ip_hash, user_agent, created_at) VALUES (?1, 'pending', ?2, ?3, ?4, ?5, ?6, ?7, datetime('now')) ON CONFLICT(email) DO UPDATE SET status = CASE WHEN subscribers.status = 'subscribed' THEN 'subscribed' ELSE 'pending' END, updated_at = datetime('now'), source = excluded.source, utm_source = excluded.utm_source, utm_campaign = excluded.utm_campaign"
    ).bind(email, source, utmSource, utmCampaign, token, ipHash, ua).run();
    const alreadyConfirmed = !!(existing && existing.status === "subscribed");
    if (alreadyConfirmed) {
      await funnel(env, "submit_already_confirmed", src);
      return reply({ ok: true, pending: false, confirmation_sent: false });
    }
    // SUBSCRIBE-RESEND-BOUND-1: one confirmation mail an hour per address, however often the form is submitted with it.
    if (existing && Number(existing.mailed_recently) === 1) {
      await funnel(env, "submit_repeat", src);
      return reply({ ok: true, pending: true, confirmation_sent: false, already_sent: true });
    }
    await funnel(env, "submit", src);
    const res = await sendEmail(env, email, "Confirm your QNFO subscription", confirmText(token), "confirm");
    if (res && res.ok) {
      await env.AUDIT.prepare("UPDATE subscribers SET welcomed_at = datetime('now') WHERE email = ?1").bind(email).run();
      await funnel(env, "confirm_mail_sent", src);
      return reply({ ok: true, pending: true, confirmation_sent: true });
    }
    // SUBSCRIBE-SEND-HONEST-1: the row stays pending and a retry sends again; the visitor is not told to check an inbox
    // that will stay empty.
    await funnel(env, "confirm_mail_failed", src);
    return reply({ ok: false, pending: true, confirmation_sent: false, error: "We could not send the confirmation email just now. Please try again in a few minutes." }, 502);
  } catch (e) {
    console.error(JSON.stringify({ event: "subscribe_failed", error: String(e && e.message || e).slice(0, 200) }));
    await funnel(env, "submit_error", src);
    return reply({ ok: false, error: "Sign-up failed. Please try again shortly." }, 500);
  }
}
__name(handleSubscribe, "handleSubscribe");
// SUBSCRIBE-CONFIRM-POST-1 (#1904): only a POST confirms; a GET (the emailed link, or a scanner fetching it) shows the button.
async function confirmToken(request, u) {
  let token = u.searchParams.get("token") || "";
  if (!token && request.method.toUpperCase() === "POST") {
    try {
      const ct = String(request.headers.get("Content-Type") || "").toLowerCase();
      if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        const f = await request.formData();
        token = String(f.get("token") || "");
      } else if (ct.includes("application/json")) {
        const b = await request.json();
        token = String(b && b.token || "");
      }
    } catch (e) {
      token = "";
    }
  }
  return token;
}
__name(confirmToken, "confirmToken");
function confirmButtonPage(origin, token) {
  const action = origin + "/confirm?token=" + encodeURIComponent(token);
  return html('<h1>Confirm your subscription</h1><p>Press the button to receive the weekly digest of new QNFO papers: titles, links and DOIs. Nothing is sent until you do.</p><form method="post" action="' + escAttr(action) + '"><input type="hidden" name="token" value="' + escAttr(token) + '"><button type="submit" style="font:inherit;font-size:1rem;padding:.7rem 1.4rem;border:0;border-radius:8px;background:#24315e;color:#fff;cursor:pointer">Confirm subscription</button></form><p>If you did not ask for this, close this page; no email will follow.</p>');
}
__name(confirmButtonPage, "confirmButtonPage");
async function handleConfirm(request, env) {
  const u = new URL(request.url);
  const method = request.method.toUpperCase();
  const token = await confirmToken(request, u);
  if (!token) return html("<h1>Missing link</h1><p>This confirmation link is incomplete.</p>", 400);
  try {
    const row = await env.AUDIT.prepare("SELECT email, status FROM subscribers WHERE unsub_token = ?1").bind(token).first();
    if (!row) return html("<h1>Link not recognised</h1><p>This confirmation link is invalid.</p>", 404);
    if (row.status === "subscribed") {
      return html("<h1>Already confirmed</h1><p>Your subscription is active. The next digest will reach you by email.</p>");
    }
    if (method !== "POST") {
      await funnel(env, "confirm_page", "email");
      await logEvent(env, "subscribers-confirm", "page", "subscribers confirm page shown (" + emailDomain(row.email) + ")", { method, changed: 0, domain: emailDomain(row.email) });
      return confirmButtonPage(u.origin, token);
    }
    const r = await env.AUDIT.prepare(
      "UPDATE subscribers SET status='subscribed', confirmed_at=datetime('now'), updated_at=datetime('now') WHERE unsub_token = ?1"
    ).bind(token).run();
    await funnel(env, "confirmed", "email");
    await logEvent(env, "subscribers-confirm", "confirmed", "subscribers confirmed (" + emailDomain(row.email) + ")", { method, changed: Number(r && r.meta && r.meta.changes || 0), domain: emailDomain(row.email) });
    return html("<h1>Subscription confirmed</h1><p>You are on the list. The next digest of new QNFO papers will reach you by email.</p>");
  } catch (e) {
    return html("<h1>Something went wrong</h1><p>Please try again later.</p>", 500);
  }
}
__name(handleConfirm, "handleConfirm");
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
    await funnel(env, "unsubscribed", "email");
    return html("<h1>You're unsubscribed</h1><p>You will not receive any further QNFO research digests.</p>");
  } catch (e) {
    return html("<h1>Something went wrong</h1><p>Please try again later.</p>", 500);
  }
}
__name(handleUnsubscribe, "handleUnsubscribe");
async function recordRun(env, since, now, papers, recipients, sent, failed, status, notes) {
  try {
    await env.AUDIT.prepare(
      "INSERT INTO subscriber_digest_runs (period_start, period_end, papers, recipients, sent, failed, status, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    ).bind(since, now, papers, recipients, sent, failed, status, notes || null).run();
  } catch (e) {
  }
}
__name(recordRun, "recordRun");
async function runDigest(env, opts) {
  opts = opts || {};
  const windowDays = Number(opts.windowDays) > 0 ? Number(opts.windowDays) : DIGEST_WINDOW_DAYS;
  const since = opts.since || new Date(Date.now() - windowDays * 864e5).toISOString().slice(0, 19).replace("T", " ");
  const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
  let papers = [];
  try {
    const pr = await env.LIVING.prepare(
      "SELECT slug, title, created_at, doi FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined') AND created_at >= ?1 ORDER BY created_at DESC LIMIT " + PAPER_CAP
    ).bind(since).all();
    papers = pr && pr.results || [];
  } catch (e) {
    return { ok: false, error: "papers query failed: " + String(e && e.message || e) };
  }
  let subs = [];
  try {
    const sr = await env.AUDIT.prepare(
      // SUPPRESSION-AT-DIGEST-1 (1.1.7): /health promises "suppressed addresses are never mailed"; the digest now honours
      // email_suppression too (before, only sign-up did).
      "SELECT email, unsub_token FROM subscribers WHERE status='subscribed' AND NOT EXISTS (SELECT 1 FROM email_suppression es WHERE lower(es.email) = lower(subscribers.email)) ORDER BY created_at LIMIT " + MAX_RECIPIENTS
    ).all();
    subs = sr && sr.results || [];
  } catch (e) {
    return { ok: false, error: "subscribers query failed: " + String(e && e.message || e) };
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
    const results = await Promise.all(slice.map(function(s) {
      return sendEmail(env, s.email, subject, digestText(papers, s.unsub_token), "digest", listUnsubscribeHeaders(s.unsub_token));
    }));
    for (let j = 0; j < results.length; j++) {
      if (results[j] && results[j].ok) sent++;
      else failed++;
    }
  }
  if (sent > 0) {
    try {
      await env.AUDIT.prepare(
        "UPDATE subscribers SET last_digest_at = datetime('now') WHERE status='subscribed'"
      ).run();
    } catch (e) {
    }
  }
  await recordRun(env, since, now, papers.length, subs.length, sent, failed, failed ? "partial" : "ok", null);
  return { ok: true, papers: papers.length, recipients: subs.length, sent, failed };
}
__name(runDigest, "runDigest");
async function health(env) {
  let confirmed = null, pending = null;
  try {
    const r = await env.AUDIT.prepare("SELECT COALESCE(SUM(status='subscribed'),0) AS c, COALESCE(SUM(status='pending'),0) AS p, COUNT(*) AS total FROM subscribers").first();
    confirmed = r ? Number(r.c) : null;
    pending = r ? Number(r.p) : null;
  } catch (e) {
    confirmed = "err";
  }
  return json({
    status: "ok",
    worker: "qnfo-subscribers",
    version: VERSION,
    capabilities: ["subscribe", "double-opt-in", "unsubscribe", "weekly-digest", "subscribe-page", "funnel-counts"],
    limitations: ["no send before double opt-in", "a confirmation link confirms only when its page's button is pressed (POST); a GET never confirms", "the digest sends only on the Sunday 16:00 UTC cron or an authenticated POST /run/digest", "suppressed addresses are never mailed", "a pending address gets at most one confirmation mail an hour", "GET /funnel shows counts only; a view is counted only on this worker's /subscribe page or when a surface reports it"],
    subscribers: confirmed,
    pending,
    send_email: !!env.SEND_EMAIL,
    audit_db: !!env.AUDIT,
    living_db: !!env.LIVING
  });
}
__name(health, "health");
/* SUBSCRIBE-UTM-METRIC-1 (owner directive 2026-10-18, pillar reach): aggregate confirmed
 * subscribers by utm_campaign/utm_source into reach_signals so reach metrics can attribute
 * subscriber growth to the tagged link that drove it (closes UTM-CLICK-LEDGER-1 -> subscriber).
 * Idempotent: the previous snapshot is deleted then re-inserted. */
async function writeSubscriberAttribution(env) {
  try {
    if (!env.AUDIT) return;
    await env.AUDIT.prepare("DELETE FROM reach_signals WHERE source = 'subscriber-attribution'").run();
    const rows = await env.AUDIT.prepare(
      "SELECT COALESCE(utm_campaign,'') AS camp, COALESCE(utm_source,'') AS src, COUNT(*) AS n FROM subscribers WHERE (confirmed_at IS NOT NULL OR status='subscribed') AND (utm_campaign != '' OR utm_source != '') GROUP BY utm_campaign, utm_source"
    ).all();
    const list = rows.results || [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const id = String(r.camp || r.src || "untagged").slice(0, 80);
      await env.AUDIT.prepare(
        "INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality, collected_at) VALUES (date('now'), 'subscriber-attribution', 'email', 'campaign', ?1, 'subscribers_confirmed_attributed', ?2, 'derived', datetime('now'))"
      ).bind(id, Number(r.n) || 0).run();
    }
  } catch (e) {
    console.error(JSON.stringify({ worker: "qnfo-subscribers", where: "writeSubscriberAttribution", error: String(e && e.message || e).slice(0, 200) }));
  }
}

var worker_default = {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);
    const p = u.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }
    if (p === "/health" && method === "GET") return health(env);
    if (p === "/subscribe" && method === "POST") return handleSubscribe(request, env);
    if (p === "/subscribe" && method === "GET") return handleSubscribePage(request, env);
    if (p === "/funnel" && method === "GET") return handleFunnel(env);
    if (p === "/funnel/view" && method === "POST") return handleFunnelView(request, env);
    if (p === "/confirm" && (method === "GET" || method === "POST")) return handleConfirm(request, env);
    if (p === "/unsubscribe" && (method === "GET" || method === "POST")) return handleUnsubscribe(request, env);
    if (p === "/run/digest" && method === "POST") {
      const auth = request.headers.get("Authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!env.SUBSCRIBERS_TOKEN || !token || !await safeEqual(token, env.SUBSCRIBERS_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
      let o = {};
      try {
        o = await request.json();
      } catch (e) {
        o = {};
      }
      return json(await runDigest(env, o));
    }
    if (p === "/" || p === "") {
      return html('<h1>QNFO subscribers</h1><p>Service endpoint. Sign up at <a href="' + SITE + '">' + SITE + "</a>.</p>");
    }
    return json({ error: "not found", path: p }, 404);
  },
  async scheduled(event, env, ctx) {
    // CRON-ONLY-HEARTBEAT-1 (agent_issues 2397): the heartbeat row is written after the digest run, so it means "the scheduled run finished".
    ctx.waitUntil((async () => {
      let ok = 1;
      try {
        const r = await runDigest(env, {});
        if (r && r.ok === false) ok = 0;
      } catch (e) {
        ok = 0;
        console.error(JSON.stringify({ event: "scheduled_digest_failed", error: String(e && e.message || e).slice(0, 200) }));
      }
      try {
        await writeSubscriberAttribution(env);
      } catch (e) {
        console.error(JSON.stringify({ event: "subscriber_attribution_failed", error: String(e && e.message || e).slice(0, 200) }));
      }
      try {
        await env.AUDIT.prepare("INSERT INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind("qnfo-subscribers", VERSION, (/* @__PURE__ */ new Date()).toISOString(), ok).run();
      } catch (e) {
        console.error(JSON.stringify({ event: "fleet_heartbeat_write_failed", error: String(e && e.message || e).slice(0, 200) }));
      }
    })());
  }
};
export {
  worker_default as default,
  funnelSummary,
  funnelSource,
  safeEqual
};
//# sourceMappingURL=worker.js.map