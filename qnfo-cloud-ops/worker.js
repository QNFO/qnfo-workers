var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
import { connect } from "cloudflare:sockets";
var VERSION = "1.18.3-health-keyless"; /* 1.18.3 HEALTH-KEYLESS-1: worker-health no longer sends stale copies of ROUTER_AUTH_KEY and PL_API_KEY (401 on every run since 2026-09-30 15:05Z after the #1676 rotation); qnfo-ai chat goes through the QNFO_AI service binding authenticated by props.caller, personal-api is checked at its keyless /v1/models; 1.18.2 UTF8-DEPLOY-1: GitHub contents decode and encode as UTF-8 (ghB64Text, ghTextB64); also redeploys this worker, whose out-of-office regexes were uploaded double-encoded; 1.18.1 LEARNER_AUTO_SUBJ_RX prefix made unambiguous (CodeQL js/redos: no exponential backtracking on repeated "\taw:"); 1.18.0 OUTREACH-TEMPLATE-V2: the first-contact mail calls QNFO "an independent research imprint" (STRATEGY 2.1; v1 said "a research collective", which section 5 gate 2 bans) and spells JPCUB; LEARNER_TEMPLATE jpcub-first-v2; OUTREACH-LEARNER-1 (docs/STRATEGY.md s6.4): Thompson-sampling allocation of the unchanged shared outreach cap over 6 topic x recipient-type segments, per-send reply outcomes and Beta posteriors in D1 (outreach_learner_sends, outreach_learner_arms), stop rule (>= 50 sends and < 1% positive), ops_config kill switch outreach_learner_enabled, daily tick (engagement slot) publishing outreach_reply_rate_30d and warm_conversations_30d; SENT-AS-YOU-DELIVERY-1: the daily digest is mailed to the owner's qnfo.org address through SEND_EMAIL, once a day; 1.17.1 ZENODO-UA-1 (zenodo-stats sends an honest User-Agent; Zenodo refused the spoofed browser one with 403 from 2026-09-05) and EMAIL-TRIAGE-D1-1 (email triage reads and marks qnfo-audit.emails directly instead of through qnfo-email's EMAIL_API_KEY routes); 1.17.0 GRANT-FOLLOWUP-1 (replies before an application's handled_through date are recorded, not refiled): funder replies from qnfo.org mail and Gmail (read-only) become cloud_ops_events rows and agent_issues, in the worker-health slot (CRON_COMPANIONS); OUTREACH-OPTOUT-EVIDENCE-1, OUTREACH-CONSENT-1, OUTREACH-SHARED-CAP-1, SENT-AS-YOU-DIGEST-1, REGISTER-GUARD-FOLD-1; IDENTITY-WEEKLY-1 moved to qnfo-fleet-dashboard with the private store (IDENTITY-STORE-1) */
var EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var WORKER_NAME = "qnfo-cloud-ops";
var EMAIL_BASE = "https://qnfo-email.internal";
var NL = String.fromCharCode(10);
function auth(token, env) {
  const exp = env.INFRA_TOKEN;
  const adm = env.OPS_ADMIN_TOKEN;
  const reg = env.REGISTRY_TOKEN;
  if (!token) return false;
  const ok = /* @__PURE__ */ __name((k) => {
    const a = new TextEncoder().encode(token);
    const b = new TextEncoder().encode(k || "");
    if (a.byteLength !== b.byteLength) return false;
    let d = 0;
    for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i];
    return d === 0;
  }, "ok");
  return ok(exp) || ok(adm) || ok(reg);
}
__name(auth, "auth");
async function logRun(env, job, status, notes) {
  try {
    await env.AUDIT.prepare(
      "INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?1,?2,?3,?4,?5,?6,?7)"
    ).bind(
      "cloud-ops-" + job + "-" + Date.now().toString(36),
      "qnfo-cloud-ops",
      (/* @__PURE__ */ new Date()).toISOString(),
      (/* @__PURE__ */ new Date()).toISOString(),
      status === "ok" ? 1 : 0,
      1,
      JSON.stringify({ job, status, ...notes }).slice(0, 500)
    ).run();
  } catch (e) {
  }
}
__name(logRun, "logRun");
async function stateGet(env, key, fallback) {
  try {
    const r = await env.AUDIT.prepare("SELECT value FROM scheduler_state WHERE key = ?1").bind(key).first();
    return r && r.value !== null && r.value !== void 0 ? r.value : fallback;
  } catch (e) {
    return fallback;
  }
}
__name(stateGet, "stateGet");
async function stateSet(env, key, value) {
  try {
    await env.AUDIT.prepare(
      "INSERT INTO scheduler_state (key, value, updated_at) VALUES (?1,?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')"
    ).bind(key, String(value)).run();
  } catch (e) {
  }
}
__name(stateSet, "stateSet");
async function sendDigest(env, subject, text, toOverride) {
  if (!env.SEND_EMAIL) return { error: "SEND_EMAIL binding missing" };
  const toRaw = toOverride || env.DIGEST_TO || env.ALERT_EMAIL_TO || "";
  const dom = String(toRaw).split("@")[1] || "";
  if (HUMAN_DOMAINS.has(dom)) return { skipped: "personal-domain", to: toRaw };
  const to = toRaw;
  try {
    const r = await env.SEND_EMAIL.send({ to, from: { email: "alerts@qnfo.org", name: "QNFO Ops" }, subject, text });
    return { ok: true, messageId: r && r.messageId, to };
  } catch (e) {
    return { error: String(e && e.message || e), to };
  }
}
__name(sendDigest, "sendDigest");
async function embedText(env, text) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await env.AI.run(EMBED_MODEL, { text: [String(text).slice(0, 1800)] }, { gateway: { id: "default" } });
      const v = (resp && resp.data || []).find((x) => Array.isArray(x) && x.length === 768);
      return v || null;
    } catch (e) {
      const msg = String(e && e.message || e || "");
      const isRate = /429|rate limit|capacity|try again/i.test(msg);
      if (isRate && attempt < 3) {
        await new Promise((res) => setTimeout(res, 300 + attempt * 600));
        continue;
      }
      return null;
    }
  }
  return null;
}
__name(embedText, "embedText");
async function recordEvent(env, kind, id, text, meta) {
  const m = Object.assign({}, meta || {});
  try {
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(id, (/* @__PURE__ */ new Date()).toISOString(), kind, String(text).slice(0, 2e3), JSON.stringify(m).slice(0, 1500), m.job || null, m.status || null).run();
  } catch (e) {
  }
  try {
    if (env.OPS_VZ) {
      const v = await embedText(env, kind + ": " + text);
      if (v) {
        await env.OPS_VZ.upsert([{ id, values: v, metadata: { doc: "cloud-ops", kind, ts: (/* @__PURE__ */ new Date()).toISOString(), text: String(text).slice(0, 1500), ...m } }]);
      }
    }
  } catch (e) {
  }
  return { stored: true, id };
}
__name(recordEvent, "recordEvent");
async function storeDigest(env, job, subject, text) {
  return recordEvent(env, "digest", "dg-" + job + "-" + Date.now().toString(36), subject + NL + text, { job });
}
__name(storeDigest, "storeDigest");
async function cfEmail(env, path, opts = {}) {
  const url = new URL(EMAIL_BASE + path);
  const headers = { Authorization: "Bearer " + (env.EMAIL_API_KEY || "") };
  if (opts.body) headers["Content-Type"] = "application/json";
  const resp = await env.EMAIL.fetch(url.toString(), { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : void 0 });
  let j = null;
  try {
    j = await resp.json();
  } catch (e) {
    j = null;
  }
  if (!resp.ok) return { error: j && j.error || "email svc HTTP " + resp.status };
  return j;
}
__name(cfEmail, "cfEmail");
function ghHeaders(env, extra) {
  return { Authorization: "Bearer " + (env.GH_TOKEN || ""), "User-Agent": "qnfo-cloud-ops/" + VERSION, Accept: "application/vnd.github+json", ...extra || {} };
}
__name(ghHeaders, "ghHeaders");
// UTF8-DEPLOY-1: GitHub contents are base64 of UTF-8 bytes. atob() alone gives Latin-1 (so a file with any non-ASCII
// character never compared equal and was rewritten as drift), and btoa() throws above U+00FF.
function ghB64Text(b64) {
  const bin = atob(String(b64 || "").replace(/\s/g, ""));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(u);
}
function ghTextB64(text) {
  const u = new TextEncoder().encode(String(text));
  let bin = "";
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function ghGet(env, path) {
  const r = await fetch("https://api.github.com" + path, { headers: ghHeaders(env) });
  const txt = await r.text().catch(() => "");
  let j = null;
  try {
    j = JSON.parse(txt);
  } catch (e) {
    j = null;
  }
  return { status: r.status, body: j, raw: txt.slice(0, 200) };
}
__name(ghGet, "ghGet");
async function ghPut(env, path, body) {
  const r = await fetch("https://api.github.com" + path, { method: "PUT", headers: ghHeaders(env), body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => null);
  return { status: r.status, body: j };
}
__name(ghPut, "ghPut");
async function cfApi(env, path, method, body) {
  const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + path, {
    method: method || "GET",
    headers: { Authorization: "Bearer " + (env.CF_TOKEN || ""), "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (qnfo-cloud-ops)" },
    body: body ? JSON.stringify(body) : void 0
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, body: j };
}
__name(cfApi, "cfApi");
var AMS_SCHEDULE = {
  "release-check": { times: ["06:15"], days: "*", fixed: null },
  "email-triage": { times: ["08:00", "14:00"], days: "1-5", fixed: null },
  "briefing": { times: ["08:30"], days: "1-5", fixed: null },
  "gmail-triage": { times: ["09:00", "15:00"], days: "1-5", fixed: null },
  "research-scan": { times: ["10:00"], days: "1-5", fixed: null },
  "weekly": { times: ["17:00"], days: "5", fixed: null },
  "weekly-ops": { times: ["06:00"], days: "7", fixed: null },
  "portfolio-sync": { times: ["08:00"], days: "1", fixed: null },
  "zenodo-stats": { times: ["09:00"], days: "7", fixed: null },
  "board-sync": { times: ["08:00"], days: "6", fixed: null },
  "outreach": { times: ["11:00"], days: "1-5", fixed: null },
  "nlnet": { times: ["11:00"], days: null, fixed: { dom: 3, mon: 9 } },
  "worker-health": { times: ["05:05", "17:05"], days: "*", fixed: null },
  "sitemap-ping": { times: ["06:00"], days: null, fixed: { dom: 1, mon: "*" } },
  "loose-threads-sweep": { times: ["07:00"], days: "1", fixed: null },
  "visibility": { times: ["07:30"], days: "1", fixed: null },
  // ENGAGEMENT-DAILY-1 (2026-10-01, #1647): daily, not weekly. One missed weekly run left an 11-day gap in
  // social_engagements while posting continued; a daily collector (2 API calls) bounds any gap to a day.
  "engagement": { times: ["07:15"], days: "*", fixed: null },
  "radar": { times: ["09:30"], days: "1-5", fixed: null },
  "gtd-reconcile": { times: ["05:30"], days: "1", fixed: null },
  "quality-score": { times: ["06:20"], days: "*", fixed: null },
  "overdue-guard": { times: ["05:10"], days: "*", fixed: null }
};
function isoDowToCf(spec) {
  const s = String(spec == null ? "*" : spec).trim();
  if (s === "*" || s === "") return "*";
  const conv = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return n;
    return String((v % 7 + 7) % 7 + 1);
  };
  return s.split(",").map((part) => {
    const p = part.trim();
    const m = /^(\d+)-(\d+)$/.exec(p);
    if (m) return conv(m[1]) + "-" + conv(m[2]);
    if (/^\d+$/.test(p)) return conv(p);
    return p;
  }).join(",");
}
__name(isoDowToCf, "isoDowToCf");
function buildCrons(offset) {
  const crons = [];
  for (const [job, s] of Object.entries(AMS_SCHEDULE)) {
    if (s.fixed) {
      const [hh, mm] = s.times[0].split(":").map(Number);
      let u = hh - offset;
      if (u < 0) u += 24;
      crons.push({ job, cron: mm + " " + u + " " + s.fixed.dom + " " + s.fixed.mon + " *" });
    } else {
      const byMinute = {};
      for (const t of s.times) {
        const [hh, mm] = t.split(":").map(Number);
        let u = hh - offset;
        if (u < 0) u += 24;
        (byMinute[mm] = byMinute[mm] || []).push(u);
      }
      for (const [mm, hours] of Object.entries(byMinute)) {
        const hs = [...new Set(hours)].sort((a, b) => a - b).join(",");
        crons.push({ job, cron: mm + " " + hs + " * * " + isoDowToCf(s.days) });
      }
    }
  }
  return crons;
}
__name(buildCrons, "buildCrons");
/* CF-DOW-1 */
function amsOffset(instant) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const parts = dtf.formatToParts(instant || /* @__PURE__ */ new Date());
    const m = {};
    for (const p of parts) m[p.type] = p.value;
    const asUTC = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), Number(m.hour), Number(m.minute), Number(m.second));
    const t = (instant || /* @__PURE__ */ new Date()).getTime();
    const raw = (asUTC - t) / 36e5;
    return Math.round(raw * 2) / 2;
  } catch (e) {
    return 2;
  }
}
__name(amsOffset, "amsOffset");
async function syncSchedules(env, force) {
  const off = amsOffset(/* @__PURE__ */ new Date());
  const crons = buildCrons(off);
  const list = crons.map((c) => c.cron);
  const fp = list.slice().sort().join("|");
  const stored = await stateGet(env, "cron_offset", "");
  const storedFp = await stateGet(env, "cron_fingerprint", "");
  if (!force && String(off) === String(stored) && fp === storedFp) {
    return { changed: false, offset: off, count: list.length };
  }
  const r = await cfApi(env, "/workers/scripts/" + WORKER_NAME + "/schedules", "PUT", list.map((cron) => ({ cron })));
  const ok = r.status === 200 && r.body && r.body.success;
  if (ok) {
    await stateSet(env, "cron_offset", String(off));
    await stateSet(env, "cron_fingerprint", fp);
  }
  return { changed: true, ok, offset: off, count: list.length, crons: list, status: r.status };
}
__name(syncSchedules, "syncSchedules");
function decodeHeader(s) {
  let out = String(s || "");
  out = out.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (m, cs, enc, data) => {
    try {
      if (/b/i.test(enc)) {
        return decodeURIComponent(escape(atob(data.replace(/\s/g, ""))));
      }
      return decodeURIComponent(data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (mm, hx) => String.fromCharCode(parseInt(hx, 16))));
    } catch (e) {
      return data;
    }
  });
  return out.trim();
}
__name(decodeHeader, "decodeHeader");
async function imapOpen(env) {
  const host = "imap.gmail.com", port = 993;
  const socket = connect({ hostname: host, port }, { secureTransport: "on", allowHalfOpen: false });
  const watchdog = setTimeout(() => {
    try {
      socket.close();
    } catch (e) {
    }
  }, 9e4);
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = "";
  let tagSeq = 0;
  async function readLine() {
    while (true) {
      const idx = buf.indexOf("\r\n");
      if (idx >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        return line;
      }
      const { value, done } = await reader.read();
      if (done) return null;
      buf += dec.decode(value, { stream: true });
    }
  }
  __name(readLine, "readLine");
  async function readLiteral(n) {
    while (buf.length < n) {
      const { value, done } = await reader.read();
      if (done) return null;
      buf += dec.decode(value, { stream: true });
    }
    const lit = buf.slice(0, n);
    buf = buf.slice(n);
    return lit;
  }
  __name(readLiteral, "readLiteral");
  async function cmd(command) {
    const tag = "a" + ++tagSeq;
    await writer.write(enc.encode(tag + " " + command + "\r\n"));
    const lines = [];
    let ok = false;
    while (true) {
      const line = await readLine();
      if (line === null) throw new Error("imap eof during " + command);
      if (line.startsWith(tag + " ")) {
        lines.push(line);
        ok = /^a\d+ OK/i.test(line);
        return { ok, lines };
      }
      lines.push(line);
      const m = line.match(/\{(\d+)\}$/);
      if (m) {
        const lit = await readLiteral(parseInt(m[1], 10));
        if (lit === null) throw new Error("imap literal eof");
        lines.push(lit);
      }
    }
  }
  __name(cmd, "cmd");
  async function close() {
    try {
      clearTimeout(watchdog);
    } catch (e) {
    }
    try {
      await writer.write(enc.encode("aZ LOGOUT\r\n"));
    } catch (e) {
    }
    try {
      writer.close();
      reader.cancel();
      socket.close();
    } catch (e) {
    }
  }
  __name(close, "close");
  return { cmd, close };
}
__name(imapOpen, "imapOpen");
var BULK_DOMAINS = new Set("github.com gitlab.com bitbucket.org cloudflare.com vercel.com netlify.com twitter.com x.com linkedin.com facebook.com instagram.com youtube.com reddit.com quora.com medium.com substack.com wordpress.com tumblr.com spotify.com netflix.com disneyplus.com hulu.com twitch.tv discord.com telegram.org whatsapp.com tiktok.com pinterest.com snapchat.com booking.com airbnb.com expedia.com tripadvisor.com skyscanner.net ebay.com etsy.com aliexpress.com temu.com shein.com wish.com shopify.com mailchimp.com sendinblue.com brevo.com hubspot.com salesforce.com klaviyo.com constantcontact.com campaignmonitor.com mailerlite.com convertkit.com beehiiv.com adobe.com dropbox.com notion.so slack.com zoom.us godaddy.com namecheap.com wix.com squarespace.com hostinger.com google.com googlemail.com microsoft.com apple.com amazon.com amazonaws.com npmjs.com pypi.org crates.io docker.com stackoverflow.com arxiv.org researchgate.net academia.edu orcid.org paypal.com stripe.com klarna.com afterpay.com revolut.com".split(" "));
var FINANCIAL_DOMAINS = new Set("chase.com bankofamerica.com wellsfargo.com citibank.com citi.com capitalone.com americanexpress.com amex.com discover.com usbank.com ally.com sofi.com chime.com ing.com rabobank.nl abnamro.nl ing.nl bunq.com n26.com wise.com transferwise.com payoneer.com vanguard.com fidelity.com schwab.com etrade.com traderepublic.com degiro.nl ibkr.com interactivebrokers.com".split(" "));
var HUMAN_DOMAINS = new Set("outlook.com hotmail.com live.com msn.com gmail.com yahoo.com ymail.com icloud.com me.com mac.com protonmail.com proton.me zoho.com aol.com gmx.com tutanota.com".split(" "));
var QNFO_DOMAINS = /* @__PURE__ */ new Set(["qnfo.org", "qwav.org", "qwav.tech", "qnfo.io"]);
var WITHDRAWN_CONTEXTS = { "cwi.nl": ["summer school", "poster", "slides", "practical information"] };
var RX = {
  receipt: /receipt|invoice|statement|payment (received|confirmed)|order confirmation|confirmation of order|your order|shipping confirmation|tracking (number|#)|delivery (update|confirm)|tax (receipt|statement)|transaction (receipt|confirm)|payment method|practical information|bevestiging|bestelling|factuur|betaling|purchase (confirmed|confirmation)/i,
  waiting: /application (received|submitted|is under)|received your (submission|paper)|submission received|your submission|we (received|got) your|ticket[ #]?\d|case[ #]?\d|support (request|ticket)|under review|in review|we'll (get back|follow)|will (get back|follow up)|status update|awaiting|aanvraag/i,
  sysnotice: /profile activat|account activat|welcome to|your (account|profile) is (now )?(active|ready)|getting started/i,
  someday: /invitation|you're invited|save the date|call for (papers|proposals)|cfp|register now|webinar|meetup|event announcement|opportunity|nominations? (open|now)/i,
  action: /^re:|^aw:|^sv:|deadline|action required|response required|please respond|rsvp|decision needed|approval needed|urgent|reminder|herinnering/i,
  code: /verification code|login code|security code|one-time (password|code)|otp|confirm your email|email verification/i,
  newsletter: /newsletter|weekly (digest|roundup)|daily digest|top stories|this week|unsubscribe|nieuwsbrief/i,
  marketing: /sale|discount|promo|offer|limited time|deal of|% off|free shipping|don't miss|act now|final hours|survey|feedback|rate your|tell us about your|share your (opinion|experience|mening)|deel je mening|mening delen|hear about your/i,
  security: /security alert|fraud alert|unusual activity|sign-in (alert|attempt)|new device|password (reset|changed)|2fa|two-factor/i,
  jobalert: /job (alert|opening)|vacature|are hiring|are looking for|great companies/i,
  volunteer: /vrijwilliger|volunteer/i
};
function domIn(dom, set) {
  if (!dom) return false;
  if (set.has(dom)) return true;
  for (const b of set) if (dom.endsWith("." + b)) return true;
  return false;
}
__name(domIn, "domIn");
function classify(sender, subject, ageDays) {
  const dom = (sender || "").trim().toLowerCase().split("@").pop() || "";
  if (domIn(dom, FINANCIAL_DOMAINS)) {
    if (RX.receipt.test(subject)) return "REFERENCE";
    if (RX.security.test(subject)) return "ACTION";
    return "ACTION";
  }
  for (const [base, kws] of Object.entries(WITHDRAWN_CONTEXTS)) {
    if (dom === base || dom.endsWith("." + base)) {
      const sl = (subject || "").toLowerCase();
      if (kws.some((k) => sl.includes(k))) return "NOISE";
    }
  }
  if (domIn(dom, QNFO_DOMAINS)) return "NOISE";
  if (domIn(dom, HUMAN_DOMAINS)) {
    if (RX.receipt.test(subject)) return "REFERENCE";
    if (RX.waiting.test(subject)) return "WAITING";
    if (RX.newsletter.test(subject)) return "SOMEDAY";
    return "ACTION";
  }
  if (domIn(dom, BULK_DOMAINS)) {
    if (RX.security.test(subject)) return domIn(dom, /* @__PURE__ */ new Set(["cloudflare.com", "microsoft.com", "google.com"])) ? "ACTION" : "WAITING";
    if (RX.receipt.test(subject)) return "REFERENCE";
    if (RX.waiting.test(subject)) return "WAITING";
    if (RX.sysnotice.test(subject)) return "NOISE";
    if (RX.action.test(subject)) return "ACTION";
    if (RX.someday.test(subject)) return "SOMEDAY";
    if (RX.code.test(subject)) return ageDays < 1 ? "REFERENCE" : "NOISE";
    if (RX.newsletter.test(subject) || RX.marketing.test(subject)) return "NOISE";
    return "NOISE";
  }
  if (RX.receipt.test(subject)) return "REFERENCE";
  if (RX.waiting.test(subject)) return "WAITING";
  if (RX.volunteer.test(subject)) return "REFERENCE";
  if (RX.jobalert.test(subject)) return "NOISE";
  if (RX.sysnotice.test(subject)) return "NOISE";
  if (RX.someday.test(subject)) return "SOMEDAY";
  if (RX.newsletter.test(subject)) return "SOMEDAY";
  if (RX.marketing.test(subject)) return "NOISE";
  if (RX.action.test(subject)) return "ACTION";
  if ((sender || "").toLowerCase().startsWith("noreply") || (sender || "").toLowerCase().startsWith("no-reply")) return "NOISE";
  return "ACTION";
}
__name(classify, "classify");
var F_WAITING = "GTD-Waiting For";
var F_SOMEDAY = "GTD-Someday Maybe";
var F_REF = "GTD-Reference";
async function jobGmailTriage(env) {
  if (!env.GMAIL_PASS) return { status: "error", notes: { error: "GMAIL_PASS secret missing" } };
  const out = { checked: 0, counts: { ACTION: 0, WAITING: 0, SOMEDAY: 0, REFERENCE: 0, NOISE: 0 }, moved: 0, actions: [], waiting: [] };
  let imap;
  try {
    imap = await imapOpen(env);
    const login = await imap.cmd('LOGIN "rwnquni@gmail.com" "' + env.GMAIL_PASS.replace(/"/g, "") + '"');
    if (!login.ok) throw new Error("gmail login failed");
    const sel = await imap.cmd('SELECT "INBOX"');
    if (!sel.ok) throw new Error("gmail SELECT INBOX failed");
    const search = await imap.cmd("UID SEARCH ALL");
    const searchLine = search.lines.find((l) => l.startsWith("* SEARCH"));
    const uids = searchLine ? searchLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean).slice(0, 1e3) : [];
    out.checked = uids.length;
    for (const l of [F_WAITING, F_SOMEDAY, F_REF]) {
      try {
        await imap.cmd('CREATE "' + l + '"');
      } catch (e) {
      }
    }
    const now = Date.now();
    const plan = [];
    for (let i = 0; i < uids.length; i += 25) {
      const batch = uids.slice(i, i + 25);
      const fet = await imap.cmd("UID FETCH " + batch.join(",") + " (UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])");
      let cur = null;
      for (const ln of fet.lines) {
        const mm = ln.match(/^\* \d+ FETCH \(UID (\d+) /);
        if (mm) {
          cur = mm[1];
          continue;
        }
        if (ln.startsWith("* ") && / FETCH /.test(ln)) {
          continue;
        }
        if (cur !== null) {
          const hdr = ln;
          const fromM = hdr.match(/^From:\s*(.+)$/mi);
          const subjM = hdr.match(/^Subject:\s*(.+)$/mi);
          const dateM = hdr.match(/^Date:\s*(.+)$/mi);
          const sender = (fromM ? fromM[1] : "").replace(/<[^>]*>/g, "").trim() || ((fromM && fromM[1].match(/<([^>]+)>/) || [])[1] || "");
          const subject = decodeHeader(subjM ? subjM[1] : "");
          let ageDays = 0;
          if (dateM) {
            const d2 = new Date(dateM[1]);
            if (!isNaN(d2)) ageDays = Math.floor((now - d2.getTime()) / 864e5);
          }
          const cls = classify(sender, subject, ageDays);
          out.counts[cls] = (out.counts[cls] || 0) + 1;
          const rec = { uid: cur, cls, sender: sender.slice(0, 60), subject: subject.slice(0, 90) };
          if (cls === "ACTION") out.actions.push(rec);
          if (cls === "WAITING") out.waiting.push(rec);
          plan.push(rec);
          cur = null;
        }
      }
    }
    const startMs = Date.now();
    const groups = { ACTION: [], WAITING: [], SOMEDAY: [], REFERENCE: [], NOISE: [] };
    for (const p of plan) {
      if (groups[p.cls] === void 0) groups[p.cls] = [];
      groups[p.cls].push(p.uid);
    }
    const deadlineHit = /* @__PURE__ */ __name(() => Date.now() - startMs > 8e4, "deadlineHit");
    const applyBatch = /* @__PURE__ */ __name(async (uids2, label) => {
      let timedOut2 = false;
      for (let i = 0; i < uids2.length; i += 25) {
        if (deadlineHit()) {
          timedOut2 = true;
          out.partial = true;
          break;
        }
        const part = uids2.slice(i, i + 25).join(",");
        try {
          if (label) {
            try {
              await imap.cmd("UID COPY " + part + ' "' + label + '"');
            } catch (e) {
            }
          }
          await imap.cmd("UID STORE " + part + " +FLAGS (\\Deleted)");
          out.moved += Math.min(25, uids2.length - i);
        } catch (e) {
        }
      }
      return timedOut2;
    }, "applyBatch");
    for (let i = 0; i < groups.ACTION.length; i += 25) {
      if (deadlineHit()) {
        out.partial = true;
        break;
      }
      const part = groups.ACTION.slice(i, i + 25).join(",");
      try {
        await imap.cmd("UID STORE " + part + " +FLAGS (\\Flagged)");
      } catch (e) {
      }
      try {
        await imap.cmd("UID STORE " + part + " -FLAGS (\\Seen)");
      } catch (e) {
      }
    }
    let timedOut = await applyBatch(groups.WAITING, F_WAITING);
    if (!timedOut) timedOut = await applyBatch(groups.SOMEDAY, F_SOMEDAY);
    if (!timedOut) timedOut = await applyBatch(groups.REFERENCE, F_REF);
    if (!timedOut) timedOut = await applyBatch(groups.NOISE, null);
    if (out.moved > 0) {
      try {
        await imap.cmd("EXPUNGE");
      } catch (e) {
      }
    }
    await imap.close();
  } catch (e) {
    if (imap) {
      try {
        await imap.close();
      } catch (e2) {
      }
    }
    return { status: "error", notes: { error: String(e && e.message || e), ...out } };
  }
  await stateSet(env, "gmail_triage_state", JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), counts: out.counts, moved: out.moved, partial: !!out.partial, actions: out.actions.slice(0, 20), waiting: out.waiting.slice(0, 20) }));
  const L = ["QNFO Gmail GTD triage \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), ""];
  L.push("INBOX " + out.checked + " msgs: " + JSON.stringify(out.counts) + " moved=" + out.moved + ".");
  if (out.actions.length) {
    L.push("", "ACTION (stay in INBOX):");
    for (const a of out.actions.slice(0, 10)) L.push("- " + a.sender + " | " + a.subject);
  }
  if (out.waiting.length) {
    L.push("", "WAITING:");
    for (const w of out.waiting.slice(0, 5)) L.push("- " + w.sender + " | " + w.subject);
  }
  if (!out.actions.length && !out.waiting.length) L.push("", "No actionable inbox mail.");
  const d = await storeDigest(env, "gmail-triage", "QNFO Gmail GTD triage \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), L.join(NL));
  return { status: "ok", notes: { ...out, digest: d } };
}
__name(jobGmailTriage, "jobGmailTriage");
// EMAIL-TRIAGE-D1-1 (1.17.1, pillar: reach): the triage read qnfo.org mail through qnfo-email's /emails/recent and
// marked noise through /emails/status, both behind EMAIL_API_KEY. That secret is absent on this worker since its
// 2026-09-26 recreation, so every run from 2026-09-30 failed with "unauthorized" (cloud_ops_events jr-email-triage-*).
// Both routes are one statement each on qnfo-audit.emails, the database this worker already binds as AUDIT (the same
// table GRANT-FOLLOWUP-1 reads), so the triage now runs those statements itself and needs no key.
var EMAIL_TRIAGE_STATUSES = ["received", "processed", "sent", "replied", "archived", "spam", "read", "rejected"];
async function emailTriageRecent(env, limit) {
  const r = await env.AUDIT.prepare("SELECT id, message_id, sender, recipient, subject, classification, status, received_at, processing_ms FROM emails WHERE status = ?1 ORDER BY id DESC LIMIT ?2").bind("processed", Math.min(Math.max(Number(limit) || 30, 1), 100)).all();
  return r.results || [];
}
async function emailTriageSetStatus(env, id, status) {
  if (!Number(id) || EMAIL_TRIAGE_STATUSES.indexOf(status) < 0) return false;
  await env.AUDIT.prepare("UPDATE emails SET status = ?1 WHERE id = ?2").bind(status, Number(id)).run();
  return true;
}
async function jobEmailTriage(env) {
  let emails;
  try {
    emails = await emailTriageRecent(env, 30);
  } catch (e) {
    return { status: "error", notes: { error: "emails read: " + String(e && e.message || e).slice(0, 160), source: "d1" } };
  }
  const action = [], noise = [];
  const SPAM_SENDERS = ["glintopenaccess", "paperworkspot", "mdpi", "webofproceedings"];
  const SYS_PAT = /dmarc|srs0|bounce|cf-bounce|noreply|no-reply|mailer-daemon|rspamd/i;
  for (const e of emails) {
    const s = String(e.sender || "");
    const subj = String(e.subject || "");
    // SENT-AS-YOU-DELIVERY-1: the fleet's own daily notice to the owner arrives from the Email Service bounce envelope
    // (bounces@cf-bounce.qnfo.org, often SRS-wrapped), which SYS_PAT would mark spam. It is neither noise nor actionable.
    if (/^QNFO sent as you\b/i.test(subj) && /qnfo\.org/i.test(s)) continue;
    if (SPAM_SENDERS.some((x) => s.includes(x))) {
      noise.push(e);
      continue;
    }
    if (SYS_PAT.test(s)) {
      noise.push(e);
      continue;
    }
    if (/^srs/i.test(s)) {
      noise.push(e);
      continue;
    }
    action.push(e);
  }
  let marked = 0;
  for (const e of noise) {
    try {
      if (await emailTriageSetStatus(env, e.id, "spam")) marked++;
    } catch (err) {
    }
  }
  try {
    const contacted = await env.AUDIT.prepare("SELECT DISTINCT lower(email) AS em FROM outreach_log WHERE status IN ('sent','followup')").all();
    const set = new Set((contacted.results || []).map((r) => r.em).filter(Boolean));
    if (set.size) {
      const inbound = await env.AUDIT.prepare("SELECT id, sender FROM emails WHERE status IN ('processed','read') AND received_at > datetime('now','-30 days')").all();
      for (const row of inbound.results || []) {
        const s = String(row.sender || "").toLowerCase();
        const m = s.match(/<([^>]+)>/);
        const addr = m ? m[1] : s.trim();
        if (addr && set.has(addr)) {
          await env.AUDIT.prepare("UPDATE outreach_log SET status='replied' WHERE lower(email)=?1 AND status IN ('sent','followup')").bind(addr).run();
        }
      }
    }
  } catch (e) {
  }
  const L = ["QNFO email triage \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), ""];
  L.push("Checked " + emails.length + " processed emails: " + action.length + " actionable, " + noise.length + " noise (marked spam).");
  if (action.length) {
    L.push("", "ACTIONABLE:");
    for (const e of action.slice(0, 12)) {
      L.push("- id " + e.id + " | " + (e.recipient || "") + " <- " + e.sender + " | " + String(e.subject || "").slice(0, 90));
    }
  } else {
    L.push("", "No actionable inbound email.");
  }
  const d = await storeDigest(env, "email-triage", "QNFO email triage \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), L.join(NL));
  return { status: "ok", notes: { checked: emails.length, actionable: action.length, noise: noise.length, marked_spam: marked, source: "d1", digest: d } };
}
__name(jobEmailTriage, "jobEmailTriage");
var REGISTER_R2_KEY = "obsidian/notes/v1/_personal-gtd.md";
var CLOUD_APPEND_R2_KEY = "obsidian/notes/v1/_gtd-cloud-append.md";
var AI_MODEL = "@cf/deepseek-ai/deepseek-v4-flash-0731";
async function r2GetText(env, key) {
  try {
    const obj = await env.VAULT.get(key);
    if (!obj) return null;
    return await obj.text();
  } catch (e) {
    return null;
  }
}
__name(r2GetText, "r2GetText");
async function r2PutText(env, key, text) {
  try {
    await env.VAULT.put(key, text);
    return true;
  } catch (e) {
    return false;
  }
}
__name(r2PutText, "r2PutText");
function h32(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) | 0;
  return "scan" + (h >>> 0).toString(36) + s.length.toString(36);
}
__name(h32, "h32");
async function jobResearchScan(env) {
  const q = encodeURIComponent('(all:"ultrametric" OR all:"p-adic" OR all:"Bruhat-Tits" OR all:"quantum energy" OR all:"joules per solution" OR all:"quantum error correction" OR all:"ZBW" OR all:"quantum thermodynamics") AND (cat:quant-ph OR cat:math-ph OR cat:hep-th OR cat:cs.ET)');
  let hits = [];
  try {
    const r = await fetch("https://export.arxiv.org/api/query?search_query=" + q + "&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending", {
      headers: { "User-Agent": "Mozilla/5.0 (QNFO cloud ops)" }
    });
    const txt = await r.text();
    const entries = txt.split("<entry>").slice(1);
    for (const en of entries) {
      const t = (en.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
      const id = (en.match(/<id>[\s\S]*?arxiv\.org\/abs\/([^<]+)<\/id>/) || [])[1] || "";
      const pub = (en.match(/<published>([^<]+)<\/published>/) || [])[1] || "";
      const authors = [];
      const am = en.match(/<name>([\s\S]*?)<\/name>/g) || [];
      for (const a of am) authors.push(a.replace(/<\/?name>/g, "").trim());
      if (t) hits.push({ id: id.trim(), title: t.replace(/\s+/g, " ").trim().slice(0, 200), published: pub.slice(0, 10), authors: authors.slice(0, 6) });
    }
  } catch (e) {
    hits = [{ error: e.message }];
  }
  try {
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS research_scan_log (id TEXT PRIMARY KEY, ts TEXT, job TEXT, payload TEXT)").run();
    await env.AUDIT.prepare("INSERT INTO research_scan_log (id, ts, job, payload) VALUES (?1,?2,?3,?4)").bind("scan-" + Date.now().toString(36), (/* @__PURE__ */ new Date()).toISOString(), "research-scan", JSON.stringify(hits).slice(0, 3e3)).run();
  } catch (e) {
  }
  try {
    for (const h of hits.filter((x) => !x.error).slice(0, 5)) {
      const hkey = "scan-" + String(h.id || "").slice(0, 80);
      const hh = h32(hkey);
      const dup = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE ip_hash = ?").bind(hh).first();
      if (dup && dup.n > 0) continue;
      await env.AUDIT.prepare(
        "INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES (?, ?, '', 'new', ?, ?)"
      ).bind("auto-scan", String(h.title || "").slice(0, 300) + " \u2014 arXiv " + String(h.id || "") + ". Auto-candidate from daily research scan; triage for QNFO research fit.", hh, (/* @__PURE__ */ new Date()).toISOString()).run();
    }
  } catch (e) {
  }
  let extracted = { gtd_lines: [], outreach: [], must_read: [] };
  const real = hits.filter((h) => !h.error);
  if (real.length && env.AI) {
    try {
      const prompt = "Today's arXiv matches for QNFO research (id | title | authors):\n" + real.map((h) => "- " + h.id + " | " + h.title + " | " + h.authors.join(", ")).join("\n") + '\n\nYou are the QNFO research GTD extractor. Papers are NEVER shown to the user. Extract ONLY genuinely actionable items: (1) outreach candidates \u2014 a paper whose corresponding author should receive a QNFO outreach email about the energy-efficiency benchmark / ultrametric physics (only when the overlap is strong); (2) must-reads \u2014 papers directly relevant to JPCUB/joules-per-solution or ultrametric physics that Rowan should read; (3) dated register lines \u2014 anything with a deadline or action date.\nReply with STRICT JSON only: {"gtd_lines":[{"date":"YYYY-MM-DD","text":"one short action line"}],"outreach":[{"paper_id":"","reason":"one line"}],"must_read":[{"paper_id":"","reason":"one line"}]}. Empty arrays are fine. No prose.';
      const resp = await env.AI.run(AI_MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 700 }, { gateway: { id: "default" } });
      const content = resp && (resp.response || resp.result && resp.result.response) || "";
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]);
        if (p && Array.isArray(p.gtd_lines)) extracted = p;
      }
    } catch (e) {
      extracted = { gtd_lines: [], outreach: [], must_read: [], error: String(e && e.message || e) };
    }
  }
  const addedLines = [];
  for (const gl of (extracted.gtd_lines || []).slice(0, 5)) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(gl.date || "") ? gl.date : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const text = String(gl.text || "").slice(0, 300);
    if (!text) continue;
    try {
      await env.AUDIT.prepare("INSERT INTO gtd_register (section, line, done, line_date, source, updated_at) VALUES (?1,?2,0,?3,?4, datetime('now'))").bind("NEXT STEPS", text, date, "research-scan").run();
      addedLines.push({ date, text });
      await recordEvent(env, "gtd-line", "gtd-" + date + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date + " \u2014 " + text, { job: "research-scan" });
    } catch (e) {
    }
  }
  for (const oc of (extracted.outreach || []).slice(0, 4)) {
    try {
      await env.AUDIT.prepare("INSERT INTO outreach_queue (id, paper_id, author, email, reason, status, created_at) VALUES (?1,?2,?3,NULL,?4,'pending', datetime('now'))").bind("oq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), String(oc.paper_id || "").slice(0, 40), "", String(oc.reason || "").slice(0, 300)).run();
      await recordEvent(env, "outreach", "oq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), String(oc.paper_id || "") + " \u2014 " + String(oc.reason || "").slice(0, 300), { job: "research-scan" });
    } catch (e) {
    }
  }
  for (const mr of (extracted.must_read || []).slice(0, 3)) {
    try {
      await env.AUDIT.prepare("INSERT INTO gtd_register (section, line, done, line_date, source, updated_at) VALUES (?1,?2,0,?3,?4, datetime('now'))").bind("NEXT STEPS", "Read " + String(mr.paper_id || "").slice(0, 40) + " \u2014 " + String(mr.reason || "").slice(0, 200), (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), "research-scan").run();
    } catch (e) {
    }
  }
  if (addedLines.length) {
    const block = "\n<!-- cloud-scan " + (/* @__PURE__ */ new Date()).toISOString() + " -->\n" + addedLines.map((l) => "- [ ] " + l.date + " \u2014 " + l.text + " (via research scan)").join("\n") + "\n";
    const existing = await r2GetText(env, CLOUD_APPEND_R2_KEY) || "";
    await r2PutText(env, CLOUD_APPEND_R2_KEY, (existing + block).slice(-2e4));
  }
  const L = ["QNFO research scan \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), ""];
  L.push("arXiv matches: " + real.length + " (archived to D1).");
  L.push("GTD actions extracted: " + addedLines.length + " register lines, " + (extracted.outreach || []).length + " outreach candidates, " + (extracted.must_read || []).length + " must-reads.");
  if (extracted.error) L.push("AI extraction: " + extracted.error);
  if (!addedLines.length && !(extracted.outreach || []).length && !(extracted.must_read || []).length) L.push("No actionable items today.");
  const d = await storeDigest(env, "research-scan", "QNFO research scan \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), L.join(NL));
  return { status: "ok", notes: { hits: real.length, added_lines: addedLines.length, outreach: (extracted.outreach || []).length, must_read: (extracted.must_read || []).length, digest: d } };
}
__name(jobResearchScan, "jobResearchScan");
async function jobBriefing(env) {
  const L = ["QNFO briefing \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), ""];
  let items = 0;
  try {
    const regText = await r2GetText(env, REGISTER_R2_KEY);
    if (regText) {
      const now = /* @__PURE__ */ new Date();
      const due = [];
      const re = /^- \[ \] (\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2})?.*? \u2014 (.+)$/gm;
      let m;
      while ((m = re.exec(regText)) !== null) {
        const d2 = /* @__PURE__ */ new Date(m[1] + "T00:00:00Z");
        const days = Math.floor((d2.getTime() - now.getTime()) / 864e5);
        if (days <= 14) due.push({ date: m[1], days, text: m[2].slice(0, 110) });
      }
      due.sort((a, b) => a.date < b.date ? -1 : 1);
      if (due.length) {
        items += due.length;
        L.push("Open next-actions due <=14d (" + due.length + "):");
        for (const x of due.slice(0, 12)) L.push("- " + x.date + (x.days < 0 ? " (overdue)" : " (in " + x.days + "d)") + " \u2014 " + x.text);
      }
    }
  } catch (e) {
    L.push("register read error: " + e.message);
  }
  try {
    const rows = await env.AUDIT.prepare("SELECT line, line_date FROM gtd_register WHERE done=0 ORDER BY line_date ASC LIMIT 10").all();
    if (rows.results && rows.results.length) {
      const fresh = rows.results.filter((r) => {
        const d2 = /* @__PURE__ */ new Date((r.line_date || "").slice(0, 10) + "T00:00:00Z");
        return !isNaN(d2);
      });
      if (fresh.length) {
        items += fresh.length;
        L.push("", "Cloud-registered actions (" + fresh.length + "):");
        for (const r of fresh.slice(0, 8)) L.push("- " + (r.line_date || "").slice(0, 10) + " \u2014 " + String(r.line || "").slice(0, 100));
      }
    }
  } catch (e) {
  }
  try {
    const rows = await env.AUDIT.prepare("SELECT id, sender, recipient, subject, status FROM emails WHERE status IN ('processed','read') AND received_at > datetime('now','-24 hours') ORDER BY id DESC LIMIT 15").all();
    const real = (rows.results || []).filter((e) => !/dmarc|srs0|bounce|cf-bounce|rspamd/i.test(String(e.sender || "")));
    if (real.length) {
      items += real.length;
      L.push("", "Email needing attention (" + real.length + "):");
      for (const e of real.slice(0, 8)) L.push("- id " + e.id + " | " + e.sender + " | " + String(e.subject || "").slice(0, 80));
    }
  } catch (e) {
    L.push("email query error: " + e.message);
  }
  try {
    const r = await env.AUDIT.prepare("SELECT id, type, summary, due, status FROM intents WHERE status='pending' ORDER BY created_at DESC LIMIT 8").all();
    if (r.results && r.results.length) {
      items += r.results.length;
      L.push("", "Pending intents (" + r.results.length + "):");
      for (const i of r.results) L.push("- [" + i.type + "] " + String(i.summary || "").slice(0, 80) + (i.due ? " (due " + i.due + ")" : ""));
    }
  } catch (e) {
  }
  try {
    const r = await env.AUDIT.prepare("SELECT email, subject, sent_at FROM outreach_log WHERE status='sent' AND sent_at < datetime('now','-14 days') ORDER BY sent_at ASC LIMIT 5").all();
    if (r.results && r.results.length) {
      items += r.results.length;
      L.push("", "Outreach awaiting reply >14d (" + r.results.length + "):");
      for (const o of r.results) L.push("- " + o.email + " | " + String(o.subject || "").slice(0, 60) + " | " + (o.sent_at || "").slice(0, 10));
    }
  } catch (e) {
  }
  if (!items) L.push("No decision items.");
  const subject = "QNFO briefing \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const text = L.join(NL);
  const d = items > 0 ? env.DIGEST_TO ? await sendDigest(env, subject, text, env.DIGEST_TO) : await storeDigest(env, "briefing", subject, text) : await storeDigest(env, "briefing", subject, text);
  return { status: "ok", notes: { items, digest: d } };
}
__name(jobBriefing, "jobBriefing");
async function jobReleaseCheck(env) {
  const r = await ghGet(env, "/repos/ThinkInAIXYZ/deepchat/releases/latest");
  const latest = r.body && r.body.tag_name ? r.body : null;
  const stored = await stateGet(env, "deepchat_stable", "");
  if (!latest) {
    return { status: "error", notes: { error: "github releases fetch failed: " + r.status, body_preview: r.raw } };
  }
  const tag = latest.tag_name;
  const L = [];
  let action = false;
  if (stored !== tag) {
    if (stored) {
      action = true;
      L.push("NEW DeepChat stable release: " + tag + " (installed baseline was " + stored + ").");
      L.push("Action: update DeepChat via the app, then verify DEEPCHAT-RELEASE-TRACK-1 checklist.");
      L.push((latest.body || "").slice(0, 400));
    }
    await stateSet(env, "deepchat_stable", tag);
  }
  if (!action) return { status: "ok", notes: { latest: tag, changed: false } };
  const d = await sendDigest(env, "DeepChat release \u2014 " + tag, L.join(NL));
  return { status: "ok", notes: { latest: tag, changed: true, digest: d } };
}
__name(jobReleaseCheck, "jobReleaseCheck");
var SITEMAP_URLS = [
  "https://rwnq8.github.io/sitemap.xml",
  "https://qnfo-landing.pages.dev/sitemap.xml"
];
async function jobSitemapPing(env) {
  const out = { ok: 0, fail: 0, urls: [] };
  for (const url of SITEMAP_URLS) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "qnfo-cloud-ops/" + VERSION }, cf: { cacheTtl: 0 } });
      if (r.status === 200) {
        out.ok++;
        await recordEvent(env, "sitemap-ping", "sp-" + url.replace(/[^a-z0-9]+/gi, "-").slice(0, 60) + "-" + Date.now().toString(36), "sitemap OK " + url, { job: "sitemap-ping", status: "ok", url });
      } else {
        out.fail++;
        out.urls.push(url + " -> " + r.status);
        await recordEvent(env, "sitemap-ping", "sp-" + url.replace(/[^a-z0-9]+/gi, "-").slice(0, 60) + "-" + Date.now().toString(36), "sitemap FAIL " + url + " status " + r.status, { job: "sitemap-ping", status: "error", url });
      }
    } catch (e) {
      out.fail++;
      out.urls.push(url + " -> " + String(e && e.message || e));
      await recordEvent(env, "sitemap-ping", "sp-" + url.replace(/[^a-z0-9]+/gi, "-").slice(0, 60) + "-" + Date.now().toString(36), "sitemap ERROR " + url + ": " + String(e && e.message || e), { job: "sitemap-ping", status: "error", url });
    }
  }
  if (out.fail > 0) await sendDigest(env, "Sitemap ping failures \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), out.urls.join(NL));
  return { status: "ok", notes: out };
}
__name(jobSitemapPing, "jobSitemapPing");
async function jobLooseThreadsSweep(env) {
  const GRACE_DAYS = 7;
  const out = { wbs_mid: 0, handoffs_open: 0, tasks_open: 0, items: [] };
  try {
    const wbs = await env.AUDIT.prepare(
      "SELECT project_id, current_phase, total_phases, last_updated FROM wbs_state WHERE current_phase GLOB '[0-9]*' AND total_phases GLOB '[0-9]*' AND CAST(current_phase AS INTEGER) < CAST(total_phases AS INTEGER) AND (phase_data NOT LIKE '%disposition_%' OR phase_data = '{}') AND last_updated < datetime('now', '-7 days') ORDER BY last_updated ASC LIMIT 40"
    ).all();
    for (const r of wbs.results || []) {
      out.wbs_mid++;
      out.items.push("WBS " + r.project_id + " phase " + r.current_phase + "/" + r.total_phases + " (updated " + String(r.last_updated).slice(0, 19) + ")");
    }
  } catch (e) {
    out.items.push("wbs query error: " + String(e && e.message || e));
  }
  try {
    const h = await env.AUDIT.prepare(
      "SELECT h.project_id, h.pending_work, h.timestamp FROM handoffs h WHERE h.timestamp = (SELECT MAX(h2.timestamp) FROM handoffs h2 WHERE h2.project_id = h.project_id) AND h.pending_work IS NOT NULL AND TRIM(h.pending_work) != '' AND LOWER(TRIM(h.pending_work)) NOT LIKE 'none%' AND LOWER(TRIM(h.pending_work)) NOT LIKE 'zero deferred%' AND LOWER(TRIM(h.pending_work)) NOT LIKE '0 deferred%' AND h.timestamp < datetime('now', '-7 days') ORDER BY h.timestamp ASC LIMIT 40"
    ).all();
    for (const r of h.results || []) {
      out.handoffs_open++;
      out.items.push("HANDOFF " + r.project_id + " (" + String(r.timestamp).slice(0, 19) + "): " + String(r.pending_work).slice(0, 90));
    }
  } catch (e) {
    out.items.push("handoffs query error: " + String(e && e.message || e));
  }
  try {
    const t = await env.AUDIT.prepare(
      "SELECT task_code, status, updated_at FROM tasks_wbs WHERE status IN ('pending','in_progress','blocked') AND updated_at < datetime('now', '-7 days') ORDER BY updated_at ASC LIMIT 40"
    ).all();
    for (const r of t.results || []) {
      out.tasks_open++;
      out.items.push("TASK " + r.task_code + " [" + r.status + "] (updated " + String(r.updated_at).slice(0, 19) + ")");
    }
  } catch (e) {
    out.items.push("tasks query error: " + String(e && e.message || e));
  }
  const total = out.wbs_mid + out.handoffs_open + out.tasks_open;
  await recordEvent(env, "job-run", "jr-loose-threads-" + Date.now().toString(36), "loose-threads-sweep: " + total + " items (wbs " + out.wbs_mid + ", handoffs " + out.handoffs_open + ", tasks " + out.tasks_open + ")", { job: "loose-threads-sweep", status: total ? "attention" : "ok" });
  if (!total) return { status: "ok", notes: { total: 0, silent: true } };
  const L = [
    "Loose threads sweep \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    "",
    "WBS mid-phase: " + out.wbs_mid + " | open handoffs: " + out.handoffs_open + " | open tasks: " + out.tasks_open,
    ""
  ].concat(out.items.slice(0, 25));
  if (out.items.length > 25) L.push("... truncated (" + out.items.length + " total items; resolve oldest first).");
  L.push("", "Resolution: disposition each item (complete / convert-to-schedule / delete-with-rationale) in the next ops cycle.");
  const d = await sendDigest(env, "Loose threads \u2014 " + total + " item(s) need disposition", L.join(NL));
  return { status: "ok", notes: { total, wbs_mid: out.wbs_mid, handoffs_open: out.handoffs_open, tasks_open: out.tasks_open, digest: d } };
}
__name(jobLooseThreadsSweep, "jobLooseThreadsSweep");
async function jobWeekly(env) {
  const L = ["QNFO weekly summary \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), ""];
  try {
    const e = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM emails WHERE received_at > datetime('now','-7 days')").first();
    L.push("Emails (7d): " + (e && e.n || 0));
  } catch (err) {
  }
  try {
    const q = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM ai_queries WHERE ts > datetime('now','-7 days')").first();
    L.push("AI queries (7d): " + (q && q.n || 0));
  } catch (err) {
  }
  try {
    const i = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM intents WHERE created_at > datetime('now','-7 days')").first();
    L.push("Intents (7d): " + (i && i.n || 0));
  } catch (err) {
  }
  try {
    const g = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM gtd_register WHERE done=0").first();
    L.push("Open GTD register items (cloud): " + (g && g.n || 0));
  } catch (err) {
  }
  try {
    if (env.QNFO_INFRA) {
      const r = await env.QNFO_INFRA.fetch("https://qnfo-infra.internal/records", { headers: { Authorization: "Bearer " + env.INFRA_TOKEN } });
      const j = await r.json();
      if (j && j.papers != null) L.push("Records: papers " + j.papers + ", KG " + (j.kg && j.kg.nodes || "?") + " nodes");
    }
  } catch (err) {
  }
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const review = { vault_delta: [], register_open: 0, triage: { closeout: [], stale: [], skip: [] }, published: null };
  try {
    const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const prefix = "obsidian/notes/v1/" + since.slice(0, 4) + "/" + since.slice(5, 7) + "/";
    let cursor;
    let seen = 0;
    do {
      const page = await env.VAULT.list({ prefix, cursor, limit: 1e3 });
      for (const o of page.objects || []) {
        if (!o.key.endsWith(".md")) continue;
        const m = o.key.match(/obsidian\/notes\/v1\/(\d{4})\/(\d{2})\/(\d{2})\/(?:.*\/)?([^/]+\.md)$/);
        if (m) {
          const d2 = m[1] + "-" + m[2] + "-" + m[3];
          if (d2 >= since) {
            review.vault_delta.push({ date: d2, note: m[4] });
            seen++;
          }
        }
      }
      cursor = page.truncated ? page.cursor : null;
    } while (cursor && seen < 500);
  } catch (e) {
    L.push("vault delta error: " + (e && e.message));
  }
  try {
    const r = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM gtd_register WHERE done=0").first();
    review.register_open = r && r.n || 0;
  } catch (e) {
  }
  try {
    const rows = await env.PORTFOLIO.prepare("SELECT * FROM program_registry ORDER BY wbs_order").all();
    for (const p of rows.results || []) {
      const ph = String(p.phase || p.current_phase || "").replace(/^P/i, "");
      const st = String(p.status || "");
      const upd = (/* @__PURE__ */ new Date(String(p.updated_at || "").replace(" ", "T") + "Z")).getTime();
      const ageDays = isNaN(upd) ? 0 : Math.floor((Date.now() - upd) / 864e5);
      const code = String(p.wbs_code || p.code || "");
      const name = String(p.name || p.title || "").slice(0, 50);
      if (/complete|closed|archiv/i.test(st) || ph === "8" || ph === "9") review.triage.closeout.push((code || "?") + " " + name + " [phase " + ph + "]");
      else if (ageDays > 90 && !/completed/i.test(st)) review.triage.stale.push((code || "?") + " " + name + " [" + ageDays + "d]");
      else review.triage.skip.push((code || "?") + " " + name);
    }
  } catch (e) {
    L.push("triage error: " + (e && e.message));
  }
  const noteKey = "obsidian/notes/v1/_weekly-review-" + today + ".md";
  const lines = ["# Weekly Review \u2014 " + today, "", "Auto-generated by qnfo-cloud-ops (Workers cron). Vault-delta + register + portfolio triage.", ""];
  lines.push("Vault notes (7d): " + review.vault_delta.length);
  for (const n of review.vault_delta.slice(0, 30)) lines.push("- " + n.date + " " + n.note);
  lines.push("", "Open GTD register items: " + review.register_open);
  lines.push("", "Portfolio triage \u2014 closeout-archive candidates (" + review.triage.closeout.length + "):");
  for (const c of review.triage.closeout.slice(0, 20)) lines.push("- " + c);
  lines.push("", "Stale / review candidates (" + review.triage.stale.length + "):");
  for (const s of review.triage.stale.slice(0, 20)) lines.push("- " + s);
  lines.push("", "Active / current (" + review.triage.skip.length + "):");
  for (const s of review.triage.skip.slice(0, 10)) lines.push("- " + s);
  lines.push("", "Decisions: PDB surfaces actionable items; this note is the GTD-visible record.");
  try {
    await r2PutText(env, noteKey, lines.join(NL));
    review.published = noteKey;
  } catch (e) {
    L.push("publish error: " + (e && e.message));
  }
  try {
    await env.AUDIT.prepare("INSERT INTO gtd_register (section, line, done, line_date, source, updated_at) VALUES (?1,?2,0,?3,?4, datetime('now'))").bind("WEEKLY REVIEW", "Review weekly-review-" + today + " triage (closeout " + review.triage.closeout.length + ", stale " + review.triage.stale.length + ")", today, "weekly-review").run();
  } catch (e) {
  }
  await recordEvent(env, "weekly-review", "wr-" + today.replace(/-/g, ""), "Weekly review " + today + ": vault " + review.vault_delta.length + ", register " + review.register_open + ", closeout " + review.triage.closeout.length + ", stale " + review.triage.stale.length, { job: "weekly", date: today });
  await stateSet(env, "weekly_review_last", today);
  L.push("Vault notes (7d): " + review.vault_delta.length + " | closeout candidates: " + review.triage.closeout.length + " | stale: " + review.triage.stale.length);
  const d = await storeDigest(env, "weekly", "QNFO weekly summary \u2014 " + today, L.join(NL));
  return { status: "ok", notes: { digest: d, review: { vault_delta: review.vault_delta.length, register_open: review.register_open, closeout: review.triage.closeout.length, stale: review.triage.stale.length, published: review.published } } };
}
__name(jobWeekly, "jobWeekly");
async function jobWeeklyOps(env) {
  const L = ["QNFO cloud ops audit \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), ""];
  let cost = 0;
  const dst = await syncSchedules(env, false);
  if (dst.changed) {
    L.push("DST re-sync: offset=" + dst.offset + ", schedules " + (dst.ok ? "updated" : "UPDATE FAILED (status " + dst.status + ")"));
  } else {
    L.push("Schedules: " + (dst.count || buildCrons(dst.offset).length) + " cron triggers, Amsterdam offset +" + dst.offset + ".");
  }
  try {
    if (env.QNFO_INFRA) {
      const an = await env.QNFO_INFRA.fetch("https://qnfo-infra.internal/analytics", { headers: { Authorization: "Bearer " + env.INFRA_TOKEN } }).then((r) => r.json());
      const st = await env.QNFO_INFRA.fetch("https://qnfo-infra.internal/state", { headers: { Authorization: "Bearer " + env.INFRA_TOKEN } }).then((r) => r.json());
      const rc = await env.QNFO_INFRA.fetch("https://qnfo-infra.internal/records", { headers: { Authorization: "Bearer " + env.INFRA_TOKEN } }).then((r) => r.json());
      if (an && an.ai_30d && !an.ai_30d.error) {
        cost = an.ai_30d.est_cost_usd || 0;
        L.push("Workers AI (30d): " + Math.round(an.ai_30d.neurons) + " neurons, est. $" + cost);
      }
      if (an && an.workers_30d && !an.workers_30d.error) L.push("Worker invocations (30d): " + an.workers_30d.requests);
      if (st && st.workers) L.push("Fleet: workers " + st.workers.count + ", D1 " + st.d1.count + ", R2 " + (st.r2 && st.r2.count || 0) + ", Vectorize " + (st.vectorize && st.vectorize.count || 0));
      if (st && st.gateway_logs && !st.gateway_logs.error) L.push("AI Gateway (last window): $" + st.gateway_logs.cost_usd);
      if (rc && rc.papers != null) L.push("Records: papers " + rc.papers + ", KG " + (rc.kg && rc.kg.nodes || "?") + " nodes");
    }
  } catch (e) {
    L.push("infra query error: " + e.message);
  }
  try {
    const z = await env.AUDIT.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(downloads),0) AS dl, COALESCE(SUM(views),0) AS vw FROM zenodo_stats").first();
    if (z) L.push("Zenodo stats table: " + z.n + " DOIs, " + z.dl + " downloads, " + z.vw + " views (cumulative).");
  } catch (e) {
  }
  try {
    const seo = [];
    const ua = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" };
    for (const [name, url] of [["papers", "https://papers.qnfo.org/"], ["qnfo", "https://qnfo.org/"], ["qwav", "https://qwav.org/"], ["qwav-tech", "https://qwav.tech/"]]) {
      try {
        const r = await fetch(url, { headers: ua });
        const html = await r.text();
        const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
        const ld = html.includes("application/ld+json");
        const ok = r.status === 200 && !!title.trim() && ld;
        seo.push({ name, status: r.status, title: !!title.trim(), jsonld: ld, ok });
      } catch (e) {
        seo.push({ name, error: String(e && e.message || e), ok: false });
      }
    }
    const bad = seo.filter((s) => !s.ok);
    L.push("SEO health: " + seo.map((s) => s.name + "=" + (s.ok ? "OK" : s.status || "ERR")).join(", "));
    if (bad.length) {
      L.push("SEO FAIL: " + bad.map((s) => s.name + " (" + (s.status || s.error) + (s.title === false ? " no-title" : "") + (s.jsonld === false ? " no-jsonld" : "") + ")").join("; "));
      await recordEvent(env, "seo-fail", "seo-" + Date.now().toString(36), "SEO health failure: " + JSON.stringify(bad), { job: "weekly-ops" });
    }
  } catch (e) {
    L.push("SEO check error: " + (e && e.message));
  }
  if (cost > 90) L.push("", "\u26A0 COST ALERT: est. 30d Workers AI cost $" + cost + " exceeds $90/30d spend-limit gate (rule 6f5c29f8).");
  const subject = "QNFO cloud ops audit \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const text = L.join(NL);
  const alert = cost > 90 || dst.changed && !dst.ok;
  const d = alert ? await sendDigest(env, subject, text) : await storeDigest(env, "weekly-ops", subject, text);
  return { status: "ok", notes: { est_cost_30d: cost, dst: dst.changed, digest: d } };
}
__name(jobWeeklyOps, "jobWeeklyOps");
async function jobPortfolioSync(env) {
  const out = {};
  try {
    out.papers = (await env.LIVING.prepare("SELECT COUNT(*) AS n FROM papers").first() || {}).n || 0;
  } catch (e) {
    out.papers = -1;
  }
  try {
    out.published = (await env.LIVING.prepare("SELECT COUNT(*) AS n FROM papers WHERE status IN ('published','distributed')").first() || {}).n || 0;
  } catch (e) {
  }
  try {
    const r = await env.LIVING.prepare("SELECT COUNT(*) AS n FROM papers WHERE updated_at > datetime('now','-7 days')").first();
    out.recent7 = r && r.n || 0;
  } catch (e) {
  }
  try {
    out.programs = (await env.PORTFOLIO.prepare("SELECT COUNT(*) AS n FROM program_registry").first() || {}).n || 0;
  } catch (e) {
    out.programs = -1;
  }
  try {
    const g = await env.GRAPH.prepare("SELECT COUNT(*) AS n FROM nodes").first();
    const e2 = await env.GRAPH.prepare("SELECT COUNT(*) AS n FROM edges").first();
    out.kgNodes = g && g.n || 0;
    out.kgEdges = e2 && e2.n || 0;
  } catch (e) {
    out.kgNodes = -1;
  }
  try {
    const r = await ghGet(env, "/search/repositories?q=org:QNFO");
    out.repos = r.body && r.body.total_count || 0;
  } catch (e) {
    out.repos = -1;
  }
  try {
    out.zenodoDOIs = (await env.LIVING.prepare("SELECT COUNT(DISTINCT zenodo_doi) AS n FROM papers WHERE zenodo_doi IS NOT NULL AND zenodo_doi != ''").first() || {}).n || 0;
  } catch (e) {
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const md = [
    "# QNFO Portfolio Status",
    "",
    "Auto-generated by qnfo-cloud-ops (Workers cron). Cloud-canonical sources; regenerated weekly.",
    "",
    "> Generated: " + now,
    "",
    "## Records",
    "",
    "- Papers in living-paper: " + out.papers,
    "- Published/distributed (Zenodo DOI): " + out.published,
    "- Updated in last 7 days: " + out.recent7,
    "- Distinct Zenodo DOIs: " + out.zenodoDOIs,
    "",
    "## Knowledge graph",
    "",
    "- Nodes: " + out.kgNodes,
    "- Edges: " + out.kgEdges,
    "",
    "## Programs",
    "",
    "- Registered programs (portfolio-state): " + out.programs,
    "",
    "## Public surface",
    "",
    "- Public GitHub repos (QNFO org): " + out.repos,
    "",
    "## Schedule",
    "",
    "All scheduled tasks run cloud-based via Cloudflare Cron Triggers (qnfo-cloud-ops worker). No local processing.",
    ""
  ].join("\n");
  const cur = await ghGet(env, "/repos/QNFO/.github/contents/PORTFOLIO-STATUS.md");
  let curText = "";
  if (cur.status === 200 && cur.body && cur.body.content) {
    try {
      curText = ghB64Text(cur.body.content);
    } catch (e) {
      curText = "";
    }
  }
  if (curText === md) {
    await storeDigest(env, "portfolio-sync", "QNFO portfolio sync \u2014 " + now.slice(0, 10), "No drift \u2014 no update (silent).");
    return { status: "ok", notes: { drift: false, ...out, digest: { stored: true } } };
  }
  const sha = cur.status === 200 && cur.body && cur.body.sha ? cur.body.sha : void 0;
  const putBody = { message: "Portfolio status " + now.slice(0, 10), content: ghTextB64(md) };
  if (sha) putBody.sha = sha;
  const putR = await ghPut(env, "/repos/QNFO/.github/contents/PORTFOLIO-STATUS.md", putBody);
  if (putR.status !== 200 && putR.status !== 201) return { status: "error", notes: { error: "file put failed " + putR.status + " " + (putR.body && putR.body.message ? putR.body.message : "") + " (R2 direct-main)", ...out } };
  await storeDigest(env, "portfolio-sync", "QNFO portfolio sync \u2014 " + now.slice(0, 10), "Drift applied direct-to-main. " + JSON.stringify(out));
  return { status: "ok", notes: { drift: true, directMain: true, ...out } };
}
__name(jobPortfolioSync, "jobPortfolioSync");
// ZENODO-UA-1 (1.17.1, pillar: reach): the weekly zenodo-stats run fetched 0 of 308, 218 and 218 records on 2026-09-05,
// 09-12 and 09-19 (cloud_ops_events jr-zenodo-stats-*), so zenodo_stats froze at 2026-08-29. It sent a spoofed desktop
// Chrome User-Agent, which Zenodo now refuses with 403 "unusual traffic from your network"; the same request with an
// honest client name returns 200 (probed 2026-10-02), and qnfo-paper-indexer and qnfo-social read the same API from
// Cloudflare with honest names. Failures are now counted by HTTP status in the run notes, so a refusal is visible.
var ZENODO_UA = "qnfo-cloud-ops/" + VERSION + " (+https://qnfo.org; zenodo-stats)";
async function jobZenodoStats(env) {
  const corpus = await env.LIVING.prepare("SELECT zenodo_doi, slug FROM papers WHERE zenodo_doi IS NOT NULL AND zenodo_doi != '' AND status IN ('published','distributed')").all();
  const byDoi = {};
  for (const row of corpus.results || []) {
    const d2 = String(row.zenodo_doi || "").trim();
    if (d2 && d2 !== "pending" && !byDoi[d2]) byDoi[d2] = row;
  }
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const freshRows = await env.AUDIT.prepare("SELECT doi FROM zenodo_stats WHERE fetched_at LIKE ?1 || '%'").bind(today).all();
  const fresh = new Set((freshRows.results || []).map((r) => r.doi));
  const prevRows = await env.AUDIT.prepare("SELECT doi, downloads, views FROM zenodo_stats").all();
  const prevMap = {};
  let prevDl = 0, prevVw = 0;
  for (const r of prevRows.results || []) {
    prevMap[r.doi] = r;
    prevDl += Number(r.downloads || 0);
    prevVw += Number(r.views || 0);
  }
  const todo = Object.keys(byDoi).filter((d2) => !fresh.has(d2));
  let fetched = 0, errors = 0;
  const failures = {};
  const UA = { "User-Agent": ZENODO_UA, Accept: "application/json" };
  const movers = [];
  const auditViolations = [];
  for (const doi of todo) {
    const rid = doi.split(".").pop();
    try {
      const r = await fetch("https://zenodo.org/api/records/" + rid, { headers: UA });
      if (!r.ok) {
        errors++;
        failures[r.status] = (failures[r.status] || 0) + 1;
        continue;
      }
      const d2 = await r.json();
      const st = d2.stats || {};
      const rec = {
        doi: d2.doi || doi,
        conceptdoi: d2.conceptdoi || null,
        title: String(d2.metadata && d2.metadata.title || "").slice(0, 200),
        slug: byDoi[doi] && byDoi[doi].slug || null,
        downloads: Number(st.downloads || 0),
        unique_downloads: Number(st.unique_downloads || 0),
        views: Number(st.views || 0),
        unique_views: Number(st.unique_views || 0),
        version_downloads: Number(st.version_downloads || 0)
      };
      const prev = prevMap[doi] || {};
      await env.AUDIT.prepare(
        "INSERT INTO zenodo_stats (doi, conceptdoi, title, slug, downloads, unique_downloads, views, unique_views, version_downloads, prev_downloads, prev_views, fetched_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12, datetime('now')) ON CONFLICT(doi) DO UPDATE SET prev_downloads=zenodo_stats.downloads, prev_views=zenodo_stats.views, downloads=excluded.downloads, unique_downloads=excluded.unique_downloads, views=excluded.views, unique_views=excluded.unique_views, version_downloads=excluded.version_downloads, title=excluded.title, slug=excluded.slug, conceptdoi=excluded.conceptdoi, fetched_at=excluded.fetched_at, updated_at=datetime('now')"
      ).bind(rec.doi, rec.conceptdoi, rec.title, rec.slug, rec.downloads, rec.unique_downloads, rec.views, rec.unique_views, rec.version_downloads, Number(prev.downloads || 0), Number(prev.views || 0), today).run();
      fetched++;
      const growth = rec.downloads - Number(prev.downloads || 0);
      if (growth > 0) movers.push({ doi, title: rec.title, g: growth });
      try {
        const creators = ((d2.metadata || {}).creators || []).map((c) => String(c.name || "")).filter(Boolean);
        const rels = ((d2.metadata || {}).related_identifiers || []).map((r2) => String(r2.relation_type && (r2.relation_type.id || r2.relation_type) || "").toLowerCase() + ":" + String(r2.identifier || "")).join(",");
        const creatorOk = creators.length > 0 && creators.some((n) => /Quni-Gudzinas/i.test(n));
        const hasObsoleted = /isobsoletedby|issupersededby/i.test(rels);
        await env.AUDIT.prepare(
          "INSERT INTO zenodo_attribution_audit (doi, creators, related, creator_ok, obsoleted_ok, audited_at) VALUES (?1,?2,?3,?4,?5, datetime('now')) ON CONFLICT(doi) DO UPDATE SET creators=excluded.creators, related=excluded.related, creator_ok=excluded.creator_ok, obsoleted_ok=excluded.obsoleted_ok, audited_at=datetime('now')"
        ).bind(rec.doi, creators.join("; ").slice(0, 500), rels.slice(0, 1500), creatorOk ? 1 : 0, hasObsoleted ? 1 : 0).run();
        if (!creatorOk) auditViolations.push({ doi: rec.doi, why: "creator", creators: creators.join("; ").slice(0, 120) });
      } catch (e) {
      }
    } catch (e) {
      errors++;
      failures.thrown = (failures.thrown || 0) + 1;
    }
    if (fetched % 40 === 0) await new Promise((res) => setTimeout(res, 200));
  }
  const tot = await env.AUDIT.prepare("SELECT COALESCE(SUM(downloads),0) AS dl, COALESCE(SUM(views),0) AS vw, COUNT(*) AS n FROM zenodo_stats").first();
  movers.sort((a, b) => b.g - a.g);
  const L = ["QNFO Zenodo stats delta \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), ""];
  L.push("Corpus " + Object.keys(byDoi).length + " DOIs; fetched " + fetched + " today, errors " + errors + (errors ? " " + JSON.stringify(failures) : "") + ".");
  L.push("downloads: " + prevDl + " -> " + (tot.dl || 0) + " (+" + ((tot.dl || 0) - prevDl) + ")");
  L.push("views:     " + prevVw + " -> " + (tot.vw || 0) + " (+" + ((tot.vw || 0) - prevVw) + ")");
  if (movers.length) {
    L.push("", "top movers (downloads):");
    for (const m of movers.slice(0, 8)) L.push("- +" + m.g + "  " + m.title.slice(0, 50) + "  " + m.doi);
  }
  if (auditViolations.length) {
    L.push("", "ADR-014 attribution violations (" + auditViolations.length + "):");
    for (const v of auditViolations.slice(0, 8)) L.push("- " + v.doi + " [" + v.why + "] " + v.creators);
  } else {
    L.push("", "ADR-014 attribution audit: 0 creator violations (sole-author mandate holds).");
  }
  const d = await storeDigest(env, "zenodo-stats", "QNFO Zenodo stats delta \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), L.join(NL));
  return { status: fetched > 0 || errors === 0 ? "ok" : "error", notes: { fetched, errors, failures, corpus: Object.keys(byDoi).length, audit_violations: auditViolations.length, digest: d } };
}
__name(jobZenodoStats, "jobZenodoStats");
async function jobBoardSync(env) {
  const out = { programs: 0, projects: 0, boardItems: 0, existing: 0, added: 0, skipped: 0, errors: [] };
  const canonical = [];
  try {
    const prog = await env.PORTFOLIO.prepare("SELECT wbs_code, name, level, status, github_repo, zenodo_doi, phase FROM program_registry WHERE level IN ('program','project') ORDER BY wbs_code").all();
    for (const r of prog.results || []) {
      const c = String(r.wbs_code || "");
      const lvl = String(r.level || "").toLowerCase() === "program" ? "Program" : "Project";
      if (lvl === "Program") out.programs++;
      else out.projects++;
      canonical.push({ code: c, title: c + " \u2014 " + String(r.name || "").slice(0, 120), body: lvl + ". Repo: " + (r.github_repo || "\u2014") + ". DOI: " + (r.zenodo_doi || "\u2014") + ". Phase: " + (r.phase || "\u2014") + ". Status: " + (r.status || "\u2014") + ". Synced from Cloudflare canonical (portfolio-state).", level: lvl, status: String(r.status || "") === "completed" || String(r.status || "") === "published" ? "Completed" : "Active" });
    }
  } catch (e) {
    out.errors.push("registry: " + String(e && e.message || e));
  }
  const gql = /* @__PURE__ */ __name(async (query) => {
    const r = await fetch("https://api.github.com/graphql", { method: "POST", headers: { Authorization: "Bearer " + (env.GH_TOKEN || ""), "User-Agent": "qnfo-cloud-ops/" + VERSION, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    return r.json().catch(() => null);
  }, "gql");
  const pageQ = /* @__PURE__ */ __name((after) => '{ organization(login: "QNFO") { projectV2(number: 7) { id items(first: 100' + (after ? ', after: "' + after + '"' : "") + ") { totalCount pageInfo { hasNextPage endCursor } nodes { content { ... on DraftIssue { title } } } } fields(first: 30) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }", "pageQ");
  let j = await gql(pageQ(null));
  let pid = null, levelField = null, wbsField = null, stField = null;
  const existing = [];
  let pages = 0;
  while (j && !(j.errors && j.errors.length) && j.data) {
    const p = j.data.organization && j.data.organization.projectV2;
    if (!p) break;
    pid = p.id;
    out.boardItems = p.items && p.items.totalCount || out.boardItems;
    for (const n of p.items.nodes || []) if (n.content && n.content.title) existing.push(String(n.content.title));
    if (pages === 0) {
      const byName = {};
      for (const f of p.fields.nodes || []) byName[f.name] = f;
      levelField = byName["Level"] || null;
      wbsField = byName["WBS Program"] || null;
      stField = byName["Program Status"] || null;
    }
    pages++;
    const pg = p.items && p.items.pageInfo;
    if (!pg || !pg.hasNextPage || pages >= 4) break;
    j = await gql(pageQ(pg.endCursor));
  }
  if (j && j.errors && j.errors.length) out.errors.push("board: " + j.errors[0].message);
  const optMap = /* @__PURE__ */ __name((f) => {
    const m = {};
    for (const o of f && f.options || []) m[o.name] = o.id;
    return m;
  }, "optMap");
  const lvlOpts = optMap(levelField), wbsOpts = optMap(wbsField), stOpts = optMap(stField);
  const existingLower = new Set(existing.map((t) => t.toLowerCase()));
  const haveCode = /* @__PURE__ */ new Set();
  for (const t of existing) {
    const m = t.match(/^([A-Z0-9.]+)\u2014/);
    if (m) haveCode.add(m[1].trim());
  }
  const esc = /* @__PURE__ */ __name((s) => String(s || "").replace(/\\/g, "").replace(/"/g, "'").replace(/\n/g, " ").replace(/\r/g, " ").slice(0, 400), "esc");
  let added = 0, skipped = 0;
  for (const it of canonical) {
    if (existingLower.has(it.title.toLowerCase())) {
      skipped++;
      continue;
    }
    if (it.code && haveCode.has(it.code)) {
      skipped++;
      continue;
    }
    if (added >= 20) {
      out.errors.push("cap: max 20 adds/run");
      break;
    }
    if (!pid) {
      out.errors.push("no board pid");
      break;
    }
    try {
      const addQ = 'mutation { addProjectV2DraftIssue(input: {projectId: "' + pid + '", title: "' + esc(it.title) + '", body: "' + esc(it.body) + '"}) { projectItem { id } } }';
      const aj = await gql(addQ);
      if (aj && aj.errors && aj.errors.length) {
        out.errors.push("add " + it.code + ": " + aj.errors[0].message);
        continue;
      }
      const itemId = aj && aj.data && aj.data.addProjectV2DraftIssue && aj.data.addProjectV2DraftIssue.projectItem && aj.data.addProjectV2DraftIssue.projectItem.id;
      if (!itemId) {
        out.errors.push("add " + it.code + ": no item id");
        continue;
      }
      const setField = /* @__PURE__ */ __name(async (fld, optId) => {
        if (!fld || !optId) return;
        const uq = 'mutation { updateProjectV2ItemFieldValue(input: {projectId: "' + pid + '", itemId: "' + itemId + '", fieldId: "' + fld.id + '", value: {singleSelectOptionId: "' + optId + '"}}) { projectV2Item { id } } }';
        const uj = await gql(uq);
        if (uj && uj.errors && uj.errors.length) out.errors.push("field " + it.code + ": " + uj.errors[0].message);
      }, "setField");
      await setField(levelField, lvlOpts[it.level]);
      const wbsCode = it.level === "Program" ? it.code.split(".").pop() : it.code.split(".").slice(0, -1).pop() || "RES";
      await setField(wbsField, wbsOpts[wbsCode] || wbsOpts[it.code.split(".")[0]]);
      await setField(stField, stOpts[it.status]);
      added++;
    } catch (e) {
      out.errors.push("add " + it.code + ": " + String(e && e.message || e));
    }
  }
  out.added = added;
  out.skipped = skipped;
  out.existing = existing.length;
  const L = ["QNFO GitHub board sync v2 \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), ""];
  L.push("Canonical: " + out.programs + " programs + " + out.projects + " projects (portfolio-state).");
  L.push("Board #7: " + out.boardItems + " existing items; added " + added + ", skipped " + skipped + ".");
  if (out.errors.length) L.push("Errors: " + out.errors.slice(0, 8).join(" | "));
  L.push("Mutation v2 active (idempotent upsert by WBS code; never deletes).");
  const d = await storeDigest(env, "board-sync", "QNFO GitHub board sync \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), L.join(NL));
  const fatal = out.errors.some((x) => x.startsWith("registry") || x.startsWith("board:"));
  return { status: fatal ? "error" : "ok", notes: { ...out, digest: d } };
}
__name(jobBoardSync, "jobBoardSync");
async function jobNlnet(env) {
  const L = ["QNFO NLnet NGI Zero submission \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), ""];
  let proposal = null, dossier = null;
  const p = await ghGet(env, "/repos/QNFO/qnfo-workers/contents/funding/NLNET_PROPOSAL.md");
  if (p.status === 200 && p.body && p.body.content) {
    try {
      proposal = ghB64Text(p.body.content);
    } catch (e) {
    }
  }
  const dd = await ghGet(env, "/repos/QNFO/qnfo-workers/contents/funding/DOSSIER.md");
  if (dd.status === 200 && dd.body && dd.body.content) {
    try {
      dossier = ghB64Text(dd.body.content);
    } catch (e) {
    }
  }
  L.push("Bundle: proposal " + (proposal ? proposal.length + " chars" : "FETCH FAILED") + ", dossier " + (dossier ? dossier.length + " chars" : "FETCH FAILED") + ".");
  let formResult = "not attempted";
  try {
    const page = await fetch("https://nlnet.nl/propose/", { headers: { "User-Agent": "Mozilla/5.0 (QNFO cloud ops)" } });
    const html = await page.text();
    if (/hcaptcha|recaptcha|cf-turnstile/i.test(html)) {
      formResult = "form captcha-gated \u2014 no autonomous submission path (per OUTREACH-FORM-GATE-1: never circumvent anti-bot controls)";
    } else {
      formResult = "no captcha detected but NLnet submission requires the interactive form; autonomous browser submission deferred";
    }
  } catch (e) {
    formResult = "page fetch error: " + e.message;
  }
  L.push("Submission: " + formResult + ".");
  L.push("Next step: user-submitted form at https://nlnet.nl/propose/ with the prepared bundle (deadline Nov 3 2026 12:00 CEST).");
  await storeDigest(env, "nlnet", "QNFO NLnet NGI Zero submission \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), L.join(NL));
  const d = await sendDigest(env, "QNFO NLnet NGI Zero submission \u2014 " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), L.join(NL));
  return { status: "ok", notes: { formResult, digest: d } };
}
__name(jobNlnet, "jobNlnet");
async function jobBackfill(env) {
  const out = { contacts: 0, gtd: 0, outreach: 0 };
  try {
    const c = await env.AUDIT.prepare("SELECT email, name FROM contact_ledger LIMIT 500").all();
    for (const r of c.results || []) {
      await recordEvent(env, "contact", "ct-" + String(r.email).replace(/[^a-z0-9.@_-]/gi, ""), (r.name || "?") + " <" + r.email + ">", { job: "backfill" });
      out.contacts++;
    }
  } catch (e) {
    out.contacts = -1;
  }
  try {
    const g = await env.AUDIT.prepare("SELECT id, line, line_date FROM gtd_register LIMIT 500").all();
    for (const r of g.results || []) {
      await recordEvent(env, "gtd-line", "gtd-bf-" + r.id, (r.line_date || "") + " \u2014 " + r.line, { job: "backfill" });
      out.gtd++;
    }
  } catch (e) {
    out.gtd = -1;
  }
  try {
    const o = await env.AUDIT.prepare("SELECT id, paper_id, reason, status FROM outreach_queue LIMIT 200").all();
    for (const r of o.results || []) {
      await recordEvent(env, "outreach", "oq-bf-" + r.id, (r.paper_id || "") + " \u2014 " + (r.reason || "") + " [" + (r.status || "") + "]", { job: "backfill" });
      out.outreach++;
    }
  } catch (e) {
    out.outreach = -1;
  }
  await recordEvent(env, "job-run", "jr-backfill-" + Date.now().toString(36), "backfill completed: " + JSON.stringify(out), { job: "backfill", status: "ok" });
  return { status: "ok", notes: out };
}
__name(jobBackfill, "jobBackfill");
var OUTREACH_ACTIVATION_AT = Date.parse("2026-09-15T00:00:00Z");
var EMAIL_VALID = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
function validEmail(em) {
  if (!em || em.length > 254 || !EMAIL_VALID.test(em)) return false;
  if (/^[%@#]|\.\./.test(em)) return false;
  const d = em.split("@")[1] || "";
  if (!d.includes(".")) return false;
  return true;
}
__name(validEmail, "validEmail");
var OUTREACH_FROM = { email: "rowan.quni@qnfo.org", name: "Rowan Brad Quni-Gudzinas" };
async function verifyArxivEmail(env, paperId) {
  const raw = String(paperId || "").trim().replace(/^arXiv:/i, "");
  const bare = raw.replace(/v\d+$/, "");
  if (!/^\d{4}\.\d{4,5}$/.test(bare)) return null;
  const junk = /noreply|no-reply|example|\.png|\.jpg|\.gif|arxiv|elsevier|springer|overleaf|latex|biblatex|hyperref|sentry|w3\.org/i;
  const good = /* @__PURE__ */ __name((em) => !junk.test(em) && em.length < 80 && (em.split("@")[1] || "").includes("."), "good");
  const pick = /* @__PURE__ */ __name((text) => {
    const m = String(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
    for (const em of m) if (good(em)) return em.toLowerCase();
    return null;
  }, "pick");
  const vers = /v\d+$/.test(raw) ? [raw, bare] : [bare + "v1", bare];
  for (const host of ["https://arxiv.org/html/", "https://ar5iv.labs.arxiv.org/html/"]) {
    for (const v of vers) {
      try {
        const r = await fetch(host + v, { headers: { "User-Agent": "Mozilla/5.0 (QNFO cloud ops)" } });
        if (!r.ok) continue;
        const em = pick(await r.text());
        if (em) return em;
      } catch (e) {
      }
    }
  }
  try {
    const r = await fetch("https://export.arxiv.org/api/query?id_list=" + encodeURIComponent(bare) + "&max_results=1", { headers: { "User-Agent": "Mozilla/5.0 (QNFO cloud ops)" } });
    if (r.ok) {
      const em = pick(await r.text());
      if (em) return em;
    }
  } catch (e) {
  }
  try {
    const r = await fetch("https://export.arxiv.org/e-print/" + bare, { headers: { "User-Agent": "Mozilla/5.0 (QNFO cloud ops)" } });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    let text = "";
    try {
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([buf]).stream().pipeThrough(ds);
      const reader = stream.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
        if (text.length > 5e6) break;
      }
    } catch (e) {
      text = new TextDecoder().decode(buf);
    }
    return pick(text);
  } catch (e) {
    return null;
  }
}
__name(verifyArxivEmail, "verifyArxivEmail");
/* OUTREACH-CONSENT-1 (2026-10-01): jobOutreach mails as the owner but never consulted the opt-out
   list that qnfo-outreach honours (sendRaw SUPPRESSION-1 and suppressed()). Same tables, same
   predicates: qnfo-audit email_suppression + contact_ledger.suppress (AUDIT), qnfo-outreach
   contacts.suppress=1 (OUTREACH). Deliberately does not catch: the caller skips the send when the
   lookup throws, so a D1 error can never wave an opted-out address through. */
var OUTREACH_OPT_OUT = "If you would rather not hear from me again, reply \u201Cstop\u201D and I will not write again.";
async function outreachSuppressed(env, email) {
  const e = String(email || "").toLowerCase();
  if (await env.AUDIT.prepare("SELECT 1 AS x FROM email_suppression WHERE lower(email)=?1").bind(e).first()) return true;
  const l = await env.AUDIT.prepare("SELECT suppress FROM contact_ledger WHERE lower(email)=?1").bind(e).first();
  if (l && l.suppress) return true;
  const c = await env.OUTREACH.prepare("SELECT suppress FROM contacts WHERE lower(email)=?1").bind(e).first();
  return !!(c && Number(c.suppress) === 1);
}
__name(outreachSuppressed, "outreachSuppressed");
/* OUTREACH-OPTOUT-EVIDENCE-1 (2026-10-02, #1710): outreach_log keeps no body, so the consent rule "an opt-out line in
   every message" could not be measured (the dashboard's OWNER-VOICE-GUARD-1 says "opt-out line not checked").
   Every send now records, in its cloud_ops_events meta, what was checked on the exact subject and body handed to
   SEND_EMAIL: opt_out (body carries OUTREACH_OPT_OUT) and fake_re (subject starts "Re:"), keyed by message_id so
   a probe can join outreach_log.message_id. Recording only; it changes nothing about what or when this job sends. */
function outreachSendEvidence(email, res, send, subject, body) {
  return { job: "outreach", email, message_id: res && res.messageId || "", send, opt_out: String(body || "").indexOf(OUTREACH_OPT_OUT) >= 0, fake_re: /^\s*Re:/i.test(String(subject || "")) };
}
__name(outreachSendEvidence, "outreachSendEvidence");
// OUTREACH-SHARED-CAP-1 (2026-10-01, #1718): docs/STRATEGY.md s5 caps cold outreach at 8/day in total and 3/day per
// recipient domain across BOTH engines (this job and qnfo-outreach). Each engine counted only its own sends, so together
// they could send 16/day, and this job had no per-domain cap. The shared count reads both ledgers for the UTC day:
// qnfo-audit outreach_log (this job) and the qnfo-outreach D1 sends table (bound here as OUTREACH). It throws on a read
// error; the caller then stops sending for the run (fail closed).
var OUTREACH_SHARED_DAILY_CAP = 8;
var OUTREACH_SHARED_DOMAIN_CAP = 3;
async function outreachSharedCount(env, day, email) {
  const dom = "%@" + String(email || "").toLowerCase().split("@").pop();
  const a = await env.AUDIT.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN lower(email) LIKE ?2 THEN 1 ELSE 0 END),0) AS d FROM outreach_log WHERE sent_at LIKE ?1 AND status IN ('sent','followup','replied')").bind(day + "%", dom).first();
  const b = await env.OUTREACH.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN lower(c.email) LIKE ?2 THEN 1 ELSE 0 END),0) AS d FROM sends s LEFT JOIN contacts c ON c.id = s.contact_id WHERE s.status = 'sent' AND s.sent_at LIKE ?1 AND COALESCE(s.kind,'') <> 'selfcheck'").bind(day + "%", dom).first();
  return { n: Number(a && a.n || 0) + Number(b && b.n || 0), d: Number(a && a.d || 0) + Number(b && b.d || 0) };
}
__name(outreachSharedCount, "outreachSharedCount");
async function jobOutreach(env) {
  const out = { pending: 0, sent: 0, followups: 0, skipped_no_email: 0, skipped_dupe: 0, skipped_suppressed: 0, errors: [], capped: false };
  if (!env.SEND_EMAIL) return { status: "error", notes: { error: "SEND_EMAIL binding missing" } };
  try {
    const kill = await env.OUTREACH.prepare("SELECT value FROM pipeline_state WHERE key = 'external_sends_enabled'").first();
    const canExternal = Date.now() >= OUTREACH_ACTIVATION_AT && kill && kill.value === "1";
    if (!canExternal) return { status: "gated", notes: { sent: 0, reason: "pre-activation or kill switch off (activation 2026-09-15)", kill: !!(kill && kill.value === "1") } };
  } catch (e) {
    return { status: "gated", notes: { sent: 0, reason: "gate check failed", error: String(e && e.message || e) } };
  }
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const sentKey = "outreach_sent_" + today;
  let sentToday = Number(await stateGet(env, sentKey, "0")) || 0;
  const CAP = 8; // OUTREACH-THROUGHPUT-1: aligned to fleet GLOBAL_DAILY_CAP=8 (qnfo-outreach/worker.js)
  /* OUTREACH-LEARNER-1: the learner only chooses the ORDER in which eligible rows meet the unchanged caps below (and holds
     rows of a stopped segment). Off, unreadable or failing, this job keeps its oldest-first order over 25 rows. */
  const lcfg = await learnerConfig(env);
  let L = null;
  let rows;
  try {
    rows = await env.AUDIT.prepare("SELECT id, paper_id, author, email, reason, COALESCE(attempts,0) AS attempts FROM outreach_queue WHERE status IN ('pending','needs-email','needs-contact') ORDER BY created_at ASC LIMIT ?1").bind(lcfg.enabled ? LEARNER_WINDOW_ROWS : 25).all();
  } catch (e) {
    return { status: "error", notes: { error: String(e && e.message || e) } };
  }
  let pending = (rows.results || []).filter((r) => r.email || r.paper_id);
  out.pending = pending.length;
  if (lcfg.enabled && sentToday < CAP) {
    try {
      L = await learnerPrepare(env, lcfg, pending, today);
      pending = L.plan.ordered;
    } catch (e) {
      L = null;
      pending = pending.slice(0, 25);
      out.learner_error = "learner failed, oldest-first used: " + String(e && e.message || e).slice(0, 160);
    }
    if (L) {
      for (const h of L.plan.held) {
        if (await learnerHold(env, h.row, h.segment, L.arms[h.segment])) L.held.push(h.segment);
      }
    }
  }
  for (const r of pending) {
    if (sentToday >= CAP) {
      /* OUTREACH-CAP-STATUS-1 (#1662): hitting the daily cap is the EXPECTED terminal
         state of a healthy drain, not a failure. Pushing it into out.errors made the
         failure inventory and every status=error alert fire daily on a clean run. */
      out.capped = true;
      out.cap = CAP;
      break;
    }
    let email = r.email || null;
    try {
      if (!email) {
        email = await verifyArxivEmail(env, r.paper_id);
        if (!email) {
          out.skipped_no_email++;
          /* OUTREACH-ATTEMPT-CAP-1 (#1562): 'needs-email' is INSIDE the drain selector,
             so parking a failed lookup there re-selected it forever and starved every
             row behind it in the window. Count attempts; leave the work set at the cap. */
          const att = Number(r.attempts || 0) + 1;
          const terminal = att >= 3;
          await env.AUDIT.prepare("UPDATE outreach_queue SET status=?2, attempts=?3, error=?4 WHERE id=?1").bind(r.id, terminal ? "skipped-no-email" : "needs-email", att, "email lookup failed (HTML+e-print), attempt " + att + (terminal ? " - terminal" : "")).run().catch(function() {
          });
          continue;
        }
        await env.AUDIT.prepare("UPDATE outreach_queue SET email=?1, attempts=0, error=NULL WHERE id=?2").bind(email, r.id).run();
      }
      const dup = await env.AUDIT.prepare("SELECT 1 AS x FROM contact_ledger WHERE email=?1 UNION ALL SELECT 1 AS x FROM outreach_log WHERE email=?1 LIMIT 1").bind(email).first();
      if (dup) {
        out.skipped_dupe++;
        /* OUTREACH-TERMINAL-STATUS-1 (#1294/#1508): a duplicate must leave the
           work set. It used to `continue` with no status write, so the
           ORDER BY created_at ASC LIMIT 10 window re-selected it on every run
           and starved every row behind it. */
        await env.AUDIT.prepare("UPDATE outreach_queue SET status='skipped-dup', error='duplicate contact (contact_ledger/outreach_log)' WHERE id=?1").bind(r.id).run().catch(function() {
        });
        continue;
      }
      if (!validEmail(email)) {
        out.errors.push({ id: r.id, error: "invalid email " + email });
        /* OUTREACH-TERMINAL-STATUS-1 (#1294/#1508): an un-sendable address must
           leave the work set, not be re-selected forever. This is the same
           class that sent a malformed address twice (#1479); the row is now
           parked instead of re-queued. */
        await env.AUDIT.prepare("UPDATE outreach_queue SET status='skipped-invalid', error=?2 WHERE id=?1").bind(r.id, "invalid email " + email).run().catch(function() {
        });
        continue;
      }
      /* OUTREACH-CONSENT-1: an opted-out address leaves the work set (OUTREACH-TERMINAL-STATUS-1
         pattern). A failed lookup skips this row for this run only; it stays pending. */
      let isSuppressed;
      try {
        isSuppressed = await outreachSuppressed(env, email);
      } catch (e) {
        out.errors.push({ id: r.id, error: "suppression lookup failed, send skipped: " + String(e && e.message || e) });
        continue;
      }
      if (isSuppressed) {
        out.skipped_suppressed++;
        await env.AUDIT.prepare("UPDATE outreach_queue SET status='skipped-suppressed', error='suppressed (email_suppression/contact_ledger/contacts)' WHERE id=?1").bind(r.id).run().catch(function() {
        });
        continue;
      }
      /* OUTREACH-LEARNER-1: a row whose address was only found now (arXiv lookup) learns its segment here; a stopped
         segment holds it instead of sending. */
      const seg = learnerSegment(r.reason, email);
      if (L && L.stopped.has(seg)) {
        if (await learnerHold(env, r, seg, L.arms[seg])) L.held.push(seg);
        continue;
      }
      let shared;
      try {
        shared = await outreachSharedCount(env, today, email);
      } catch (e) {
        out.errors.push({ id: r.id, error: "shared cap read failed, send skipped: " + String(e && e.message || e) });
        break;
      }
      if (shared.n >= OUTREACH_SHARED_DAILY_CAP) {
        out.capped = true;
        out.cap = OUTREACH_SHARED_DAILY_CAP;
        out.shared_today = shared.n;
        break;
      }
      if (shared.d >= OUTREACH_SHARED_DOMAIN_CAP) {
        out.skipped_domain_cap = (out.skipped_domain_cap || 0) + 1;
        continue;
      }
      const subject = "QNFO \u2014 the energy-efficiency benchmark for quantum computing";
      const body = [
        "Hello,",
        "",
        "I am Rowan Brad Quni-Gudzinas, founder of QNFO, an independent research imprint working on an open, reproducible, energy-first standard for quantum computing: the JPCUB benchmark \u2014 \u201Cwhat does a correct quantum answer cost in energy?\u201D (grounded in Landauer, Margolus\u2013Levitin, and Bremermann limits).",
        "",
        r.paper_id ? "I came across your recent work (arXiv " + r.paper_id + (r.reason ? " \u2014 " + r.reason : "") + ") and it looks directly relevant to this program." : "I came across your recent work and it looks directly relevant to this program.",
        "",
        "Would you be open to a brief exchange on how your results relate to energy accounting for quantum computation? Happy to share our working papers and benchmark definitions.",
        "",
        OUTREACH_OPT_OUT,
        "",
        "Best regards,",
        "Rowan Brad Quni-Gudzinas",
        "QNFO"
      ].join("\n");
      const res = await env.SEND_EMAIL.send({ to: email, from: OUTREACH_FROM, subject, text: body });
      await env.AUDIT.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES (?1,?2,?3, datetime('now'), 'sent')").bind(email, subject, res && res.messageId || "").run();
      await env.AUDIT.prepare("INSERT INTO contact_ledger (email, name, first_contact, last_contact, contact_count, status) VALUES (?1,?2,?3,?3,1,'outreach') ON CONFLICT(email) DO UPDATE SET last_contact=excluded.last_contact, contact_count=contact_count+1").bind(email, r.author || null, today).run();
      await env.AUDIT.prepare("UPDATE outreach_queue SET status='sent', sent_at=datetime('now') WHERE id=?1").bind(r.id).run();
      await recordEvent(env, "outreach", "oq-sent-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), "outreach sent to " + email + " re " + (r.paper_id || ""), outreachSendEvidence(email, res, "first", subject, body));
      sentToday++;
      await stateSet(env, sentKey, String(sentToday));
      out.sent++;
      if (L) {
        L.picks.push(seg);
        await learnerRecordSend(env, r, email, seg, res && res.messageId || "", "live");
      }
    } catch (e) {
      out.errors.push({ id: r.id, error: String(e && e.message || e) });
    }
  }
  if (sentToday < CAP) {
    try {
      /* OUTREACH-LEARNER-1: with the learner on, a follow-up to a stopped segment is held (the row stays 'sent', so it
         still counts as contacted everywhere) and up to 12 rows are read so held ones cannot starve the 3 follow-ups. */
      const fu = await env.AUDIT.prepare(
        "SELECT id, email, subject FROM outreach_log WHERE status='sent' AND sent_at < datetime('now','-14 days') AND email NOT IN (SELECT email FROM outreach_log WHERE status IN ('replied','followup')) ORDER BY sent_at ASC LIMIT ?1"
      ).bind(L ? 12 : 3).all();
      let fuSeen = 0;
      for (const f of fu.results || []) {
        if (L && L.stoppedEmails.has(String(f.email || "").toLowerCase())) {
          out.learner_followups_held = (out.learner_followups_held || 0) + 1;
          continue;
        }
        if (++fuSeen > 3) break;
        if (!validEmail(f.email)) {
          await env.AUDIT.prepare("UPDATE outreach_log SET status='rejected' WHERE id=?1").bind(f.id).run().catch(function() {
          });
          continue;
        }
        if (sentToday >= CAP) break;
        /* OUTREACH-CONSENT-1: never follow up on an opted-out address. Suppressed -> 'rejected'
           (as the invalid-email path above); a failed lookup skips it for this run only. */
        let fuSuppressed;
        try {
          fuSuppressed = await outreachSuppressed(env, f.email);
        } catch (e) {
          out.errors.push({ id: "fu-" + f.email, error: "suppression lookup failed, follow-up skipped: " + String(e && e.message || e) });
          continue;
        }
        if (fuSuppressed) {
          out.skipped_suppressed++;
          await env.AUDIT.prepare("UPDATE outreach_log SET status='rejected' WHERE id=?1").bind(f.id).run().catch(function() {
          });
          continue;
        }
        let fuShared;
        try {
          fuShared = await outreachSharedCount(env, today, f.email);
        } catch (e) {
          out.errors.push({ id: "fu-" + f.email, error: "shared cap read failed, follow-up skipped: " + String(e && e.message || e) });
          break;
        }
        if (fuShared.n >= OUTREACH_SHARED_DAILY_CAP) {
          out.capped = true;
          out.cap = OUTREACH_SHARED_DAILY_CAP;
          out.shared_today = fuShared.n;
          break;
        }
        if (fuShared.d >= OUTREACH_SHARED_DOMAIN_CAP) {
          out.skipped_domain_cap = (out.skipped_domain_cap || 0) + 1;
          continue;
        }
        try {
          /* OUTREACH-CONSENT-1: "Re:" claimed a reply in a thread that does not exist. */
          const subject = "Following up: " + String(f.subject || "").replace(/^(?:\s*(?:Re|Following up):\s*)+/i, "");
          const body = [
            "Hello,",
            "",
            "Following up on my earlier note about the energy-efficiency benchmark for quantum computing \u2014 I would still welcome a brief exchange if you are open to it.",
            "",
            OUTREACH_OPT_OUT,
            "",
            "Best regards,",
            "Rowan Brad Quni-Gudzinas",
            "QNFO"
          ].join("\n");
          const res = await env.SEND_EMAIL.send({ to: f.email, from: OUTREACH_FROM, subject, text: body });
          await env.AUDIT.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES (?1,?2,?3, datetime('now'), 'followup')").bind(f.email, subject, res && res.messageId || "").run();
          await recordEvent(env, "outreach", "oq-followup-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), "outreach follow-up to " + f.email, outreachSendEvidence(f.email, res, "followup", subject, body));
          sentToday++;
          await stateSet(env, sentKey, String(sentToday));
          out.followups++;
        } catch (e) {
          out.errors.push({ id: "fu-" + f.email, error: String(e && e.message || e) });
        }
      }
    } catch (e) {
    }
  }
  /* OUTREACH-CAP-STATUS-1 (#1662): reserve "error" for genuine failures; report a
     cap-limited drain as "capped" so it is visible without being an alarm. */
  const _outStatus = out.errors.length ? "error" : out.capped ? "capped" : "ok";
  out.learner = await learnerLogAllocation(env, lcfg, L, out, today, sentToday);
  await recordEvent(env, "job-run", "jr-outreach-" + Date.now().toString(36), "outreach run: " + JSON.stringify(out), { job: "outreach", status: out.errors.length ? "partial" : _outStatus });
  return { status: _outStatus, notes: out };
}
__name(jobOutreach, "jobOutreach");
// OUTREACH-LEARNER-1 begin
/* OUTREACH-LEARNER-1 (2026-10-02, pillar: reach; owner directive 2026-10-02: the fleet measures its external
   effectiveness and changes itself to improve it; docs/STRATEGY.md s6.4 outreach loop and s6.3 "warm conversations").
   The loop the strategy specified ("reply rate by segment and template moves the daily cap toward the segments that
   answer; any segment under 1% after 50 sends stops") was not built: jobOutreach drained outreach_queue oldest first.
   - Segment = topic x recipient type, 6 arms, from data every candidate carries. Topic comes from the paper title in
     outreach_queue.reason (radar-hub's keyword classes): "energy" (thermodynamics, Landauer, batteries, heat: pillar 1
     directly), "qec" (error correction without energy), "other". Recipient type comes from the address domain:
     "personal" (webmail) or "institutional". The first-contact template is fixed (LEARNER_TEMPLATE, recorded per send),
     so it is not a dimension until a second variant exists.
   - Outcome per first-contact send (outreach_learner_sends, one row per outreach_queue id, backfilled from history):
     a reply is an inbound qnfo-audit.emails row from the same address (SRS and BATV wrappers removed) or carrying our
     Message-ID in In-Reply-To/References, received after the send. Auto-replies are ignored (Auto-Submitted, X-Autoreply,
     out-of-office wording). "optout" = a STOP / unsubscribe reply (also written to email_suppression); "negative" = a
     decline ("not interested", "I don't see any connection"); "positive" = any other human reply; "bounce" = a delivery
     failure naming the address (also suppressed); "no-reply" after 21 days (a later reply still upgrades it).
   - Posterior per segment: Beta(1 + positives, 1 + optout + negative + bounce + no-reply), persisted in
     outreach_learner_arms and recomputed from the ledger on every update (idempotent); every change is logged as a
     cloud_ops_events 'ol-post-*' row with the sends that moved it.
   - Allocation: per slot, a Thompson draw for every segment with candidates picks the segment, its oldest candidate takes
     the slot. A row whose address is not known yet (arXiv lookup pending) draws the best of its topic's live arms. The
     caps are untouched: the existing loop still applies 8/day shared, 3/day per domain, suppression and dedupe to
     whatever order it receives, so the learner can change who is mailed, never how many. Each run logs 'ol-alloc-*'.
   - Stop rule: a segment with >= 50 sends and positives < 1% of sends is stopped; its candidates are held
     (outreach_queue status 'held-segment-stopped', out of the drain selector, reversible) and its follow-ups skipped.
     ops_config 'outreach_learner_resume:<segment>' = 1 overrides it; held rows are released when a segment runs again.
   - Kill switch: ops_config 'outreach_learner_enabled' (absent = on; 0/off = the previous oldest-first order over 25
     rows, and held rows are released). An unreadable ops_config also falls back to oldest-first and changes no hold.
   - Daily tick (job outreach-learner, a companion in the daily engagement slot; no new cron): backfill, outcomes,
     posteriors, stop rule, metrics outreach_reply_rate_30d and warm_conversations_30d into metric_registry, and a
     heartbeat 'ol-tick-<day>' that WATCHMAKER_OPS (qnfo-fleet-dashboard, key outreach-learner) reads. */
var LEARNER_SWITCH_KEY = "outreach_learner_enabled";
var LEARNER_RESUME_PREFIX = "outreach_learner_resume:";
var LEARNER_OFF_RX = /^(0|off|false|no|disabled?)$/;
var LEARNER_ON_RX = /^(1|on|true|yes|resume)$/;
var LEARNER_STOP_MIN_SENDS = 50;
var LEARNER_STOP_RATE = 0.01;
var LEARNER_NO_REPLY_DAYS = 21;
var LEARNER_LATE_DAYS = 60;
var LEARNER_SCAN_MAX_DAYS = 90;
var LEARNER_WINDOW_ROWS = 40;
var LEARNER_RATE_MIN_SENDS = 20;
var LEARNER_DAY_MS = 864e5;
var LEARNER_METRIC_ACTOR = "OUTREACH-LEARNER-1 (qnfo-cloud-ops): Thompson allocation of the shared 8/day cold-email cap toward segments that answer; a segment under 1% after 50 sends stops";
// [metric, kind, formula, source_of_truth, baseline, target, warning_band, kill_band]; identical in
// migrations/2026-10-02-outreach-learner-metrics.sql, which also carries their analytics_metric_triggers rows.
var LEARNER_METRICS = [
  ["outreach_reply_rate_30d", "lagging", "percent of first-contact cold emails sent in the last 30 days by both engines (qnfo-audit.outreach_log, qnfo-outreach.sends; one per address) that drew a positive reply: a human reply from the same address or thread that is not an auto-reply, an opt-out or a decline; n/a under 20 first contacts (OUTREACH-LEARNER-1)", "qnfo-audit.outreach_log + qnfo-outreach.sends + qnfo-audit.emails (qnfo-cloud-ops outreach-learner, daily)", "4.1 (13 replies of any kind to 318 cold emails up to 2026-10-01, docs/STRATEGY.md s1)", ">= 2 overall; every live segment >= 1% (a segment under 1% after 50 sends stops, docs/STRATEGY.md s6.4)", "< 2", "< 1"],
  ["warm_conversations_30d", "leading", "distinct people in the last 30 days who replied positively to mail the fleet sent, plus inbound contacts: a first non-automated, non-bulk, non-solicitation message to rowan.quni@qnfo.org from an address the fleet never wrote to, that is not a reply, and any mail tagged [work-with-me:<offer>] (inbound_contacts_30d counts those alone) (OUTREACH-LEARNER-1)", "qnfo-audit.emails + outreach_log + contact_ledger + qnfo-outreach.contacts (qnfo-cloud-ops outreach-learner, daily)", "13 replies to date on 2026-10-01 (docs/STRATEGY.md s9)", ">= 4 per 30 days (10 new by 2026-12-31, docs/STRATEGY.md s9)", "< 2", "< 1"]
];
var LEARNER_TEMPLATE = "jpcub-first-v2"; /* v2 2026-10-02: "an independent research imprint" (STRATEGY 2.1; v1 said "a research collective") and JPCUB spelt correctly */
var LEARNER_HELD = "held-segment-stopped";
var LEARNER_TOPICS = ["energy", "qec", "other"];
var LEARNER_RTYPES = ["institutional", "personal"];
var LEARNER_SEGMENTS = LEARNER_TOPICS.flatMap((t) => LEARNER_RTYPES.map((r) => t + ":" + r));
var LEARNER_RNG = { fn: Math.random };
var LEARNER_ENERGY_RX = /thermodynam|landauer|joules?\b|energ(y|ies|etic)|batter(y|ies)|\bheat\b|thermal|entropy|cryogen|margolus|bremermann|\botto\b|\bengines?\b|work extraction|mpemba/i;
var LEARNER_QEC_RX = /error[- ]correct|logical qubits?|\bq?ldpc\b|surface codes?|colou?r codes?|fault[- ]toleran|stabili[sz]er|decod(er|ers|ing)\b|\bthreshold\b|\bgkp\b|quantum codes?|syndrome|magic states?|distillation|\bqec\b/i;
var LEARNER_PERSONAL_DOMAINS = new Set([...HUMAN_DOMAINS, "googlemail.com", "qq.com", "163.com", "126.com", "yeah.net", "foxmail.com", "sina.com", "naver.com", "daum.net", "hanmail.net", "yandex.ru", "yandex.com", "mail.ru", "rediffmail.com", "web.de", "t-online.de", "libero.it", "orange.fr", "free.fr", "laposte.net", "seznam.cz", "wp.pl", "o2.pl", "interia.pl"]);
var LEARNER_PERSONAL_RX = /^(hotmail|outlook|live|yahoo|ymail|gmx|aol|icloud|protonmail|proton|zoho)\.[a-z.]{2,6}$/;
var LEARNER_OWNER_ADDRS = /* @__PURE__ */ new Set(["rowan.quni@qnfo.org", "rwnquni@outlook.com", "rowan.quni@outlook.com", "rwnqni@outlook.com", "rwnquni@gmail.com"]);
var LEARNER_INTERNAL_RX = /@([a-z0-9-]+\.)*(qnfo\.(org|io|net|uk)|qwav\.(org|tech|net|uk)|q08\.org|q-wave\.tech|qwave\.tech|empoweringchange\.today)$/;
var LEARNER_MACHINE_RX = /^(mailer-daemon|postmaster|bounces?|bounce[+.-].*|.*no-?reply.*|do-?not-?reply|notifications?|notify|dmarc.*|.*-dmarc.*)$/;
var LEARNER_ROLE_RX = /^(info|news|newsletters?|alerts?|support|help|helpdesk|service|services|admin|system|mail|mailer|marketing|sales|hello|hi|team|contact|office|events?|registration|conference|webinars?|community|feedback|survey|digest|updates|billing|accounts?|grants|submissions?|editorial|editor|journals?|networking|press|media|jobs|careers|recruit(ing|ment)?)([._+-].*)?$/;
var LEARNER_BOUNCE_SUBJ_RX = /undeliver|delivery status|failure notice|returned mail|delivery (has )?failed|mail delivery|unzustellbar|non remis|niet afgeleverd|could not be delivered/i;
var LEARNER_AUTO_SUBJ_RX = /^\s*(?:(?:re|aw|sv|antw)\s*:\s*)*(auto(matic|matische|matisch)?[ -]?(reply|response|antwort|antwoord|svar)|autoreply|out of (the )?office|abwesen|absence|absent\b|r[ée]ponse automatique|vacation|on leave|away from|niet aanwezig|afwezig|fuera de la oficina|respuesta autom)/i;
var LEARNER_AUTO_BODY_RX = /out of (the )?office|automatic reply|auto-?reply|i am currently away|i('m| am| will be) away (from|until)|limited access to (my )?e-?mail/i;
var LEARNER_STOP_RX = /\b(unsubscribe|opt[\s-]?out|remove me|stop (e-?mailing|writing|sending|contacting)|do not (contact|e-?mail|write)|don'?t (contact|e-?mail|write)|take me off|no further (e-?mails?|contact|messages?)|leave me alone|(do not|don'?t) (wish|want) to (hear|receive)|never (contact|e-?mail|write)|remove (my|this) (e-?mail|address))\b/i;
var LEARNER_DECLINE_RX = /\b(not interested|no thanks|no,? thank you|not relevant|irrelevant|(don'?t|do not|can'?t|cannot) see (any|the|a|much) (connection|relevance|link|overlap)|no (real )?connection between|not (really )?(the )?right person|not my (area|field|topic)|outside (of )?my (area|field|expertise|research)|(cannot|can'?t|unable to|not able to) (help|assist|contribute)|not (in a position|able) to (help|assist|collaborate|engage)|(must|have to|will) (politely )?decline)\b/i;
var LEARNER_WWM_RX = /\[work-with-me(?::\s*[a-z0-9-]{1,40})?\s*\]/i;
var LEARNER_REPLY_SUBJ_RX =/^\s*(re|aw|sv|antw|r|vs|fw|fwd|wg|tr)\s*(\[\d+\])?\s*:/i;
var LEARNER_SOLICIT_RX = /call for (papers|abstracts|submissions?|proposals)|(article|manuscript|paper|abstract|preprint|research) submission|submit your|invit(e|ation) to (submit|publish|review|speak|join|contribute)|publish(ing)? your|special issue|editorial board|review (a |the )?(paper|manuscript)|conference|congress|summit|symposium|webinar|newsletter|unsubscribe|limited time|discount|% off|promotion|partnership opportunit|guest post|backlink|\bseo\b|sponsor|careers? in|we are hiring|job (alert|opening)|crypto|web3|final reminder|reminder mail/i;
function learnerTopic(reason) {
  const t = String(reason || "").replace(/^\s*arxiv-radar widened:\s*/i, "");
  if (LEARNER_ENERGY_RX.test(t)) return "energy";
  if (LEARNER_QEC_RX.test(t)) return "qec";
  return "other";
}
function learnerRtype(email) {
  const dom = String(email || "").trim().toLowerCase().split("@").pop() || "";
  if (!dom) return null;
  return domIn(dom, LEARNER_PERSONAL_DOMAINS) || LEARNER_PERSONAL_RX.test(dom) ? "personal" : "institutional";
}
function learnerSegment(reason, email) {
  return learnerTopic(reason) + ":" + (learnerRtype(email) || "institutional");
}
// One normalised address: display names, mailto:, BATV (prvs=tag=local@dom) and SRS0 (SRS0=h=tt=dom=local@fwd) undone.
function learnerAddr(s) {
  let a = String(s || "").trim().toLowerCase();
  const m = a.match(/<([^>]+)>/);
  if (m) a = m[1].trim();
  a = a.replace(/^mailto:/, "");
  const batv = /^prvs=[0-9a-z]+=(.+@.+)$/.exec(a);
  if (batv) a = batv[1];
  const srs = /^srs0=[^=]*=[^=]*=([^=@]+)=([^@]+)@.+$/.exec(a);
  if (srs) a = srs[2] + "@" + srs[1];
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a) ? a : "";
}
function learnerMid(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return "";
  const m = t.match(/<[^>]+>/);
  return m ? m[0] : "<" + t.replace(/^<|>$/g, "") + ">";
}
function learnerRowMids(row) {
  const out = [];
  for (const v of [row.in_reply_to, row.refs]) {
    const ms = String(v || "").toLowerCase().match(/<[^>]+>/g) || [];
    for (const m of ms) out.push(m);
  }
  return out;
}
function learnerIso(v) {
  if (v == null || v === "") return null;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(" ", "T") + "Z";
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t).toISOString();
}
function learnerInternal(addr) {
  return LEARNER_INTERNAL_RX.test(addr) || LEARNER_OWNER_ADDRS.has(addr);
}
function learnerMachine(addr) {
  const local = String(addr || "").split("@")[0];
  return LEARNER_MACHINE_RX.test(local) || /bounce/.test(local);
}
function learnerStripQuoted(s) {
  let t = String(s || "");
  t = t.split(/\r?\n/).filter((l) => !/^\s*>/.test(l)).join("\n");
  t = t.split(/(?:^|\r?\n|\s)(?:On .{0,160}?wrote:|Am .{0,160}?schrieb|Le .{0,160}?écrit|Op .{0,160}?schreef|(?:From|Von|De|Van|Da|Fra|Från|Od):\s.{0,240}?(?:Sent|Gesendet|Envoyé|Verzonden|Inviato|Date|Datum):|_{8,}|-{2,}\s*Original Message\s*-{2,})/i)[0];
  t = t.split(OUTREACH_OPT_OUT).join(" ");
  t = t.replace(/https?:\/\/\S*unsubscribe\S*/gi, " ").replace(/This was sent once, to one person[\s\S]*$/i, " ");
  return t;
}
// auto | optout | negative | positive. Undecodable bodies (base64 MIME stored raw) read as a human reply: positive.
function learnerClassify(m) {
  const subject = decodeHeader(String(m.subject || ""));
  const body = String(m.body || "");
  const stripped = learnerStripQuoted(body);
  if (m.auto || LEARNER_AUTO_SUBJ_RX.test(subject) || LEARNER_AUTO_BODY_RX.test(stripped.slice(0, 400))) return "auto";
  const first = (stripped.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^(--|content-|mime-)/i.test(l)) || "");
  const bareStop = /^\W*(please\s+)?stop\W*$/i.test(first) || /^(re:\s*)*\W*stop\W*$/i.test(subject.trim());
  if (bareStop || LEARNER_STOP_RX.test(subject + " " + stripped)) return "optout";
  if (LEARNER_DECLINE_RX.test(stripped)) return "negative";
  return "positive";
}
function learnerGamma(k, rng) {
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 1e4; i++) {
    let x, v;
    do {
      const u1 = rng() || 1e-12, u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng() || 1e-12;
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d;
}
function learnerBeta(a, b, rng) {
  const x = learnerGamma(Math.max(1, Number(a) || 1), rng), y = learnerGamma(Math.max(1, Number(b) || 1), rng);
  return x / (x + y);
}
// Pure: the order in which jobOutreach offers candidates to its unchanged caps, and the rows a stopped segment holds.
function learnerPlan(rows, arms, rng) {
  const groups = new Map(), held = [], counts = {};
  for (const r of rows) {
    const topic = learnerTopic(r.reason);
    const seg = r.email ? topic + ":" + learnerRtype(r.email) : null;
    if (seg && arms[seg] && arms[seg].stopped) {
      held.push({ row: r, segment: seg });
      continue;
    }
    const g = seg || topic + ":?";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
    counts[g] = (counts[g] || 0) + 1;
  }
  const draw = (g) => {
    if (!g.endsWith(":?")) {
      const a = arms[g] || { alpha: 1, beta: 1 };
      return learnerBeta(a.alpha, a.beta, rng);
    }
    let best = -1;
    for (const rt of LEARNER_RTYPES) {
      const a = arms[g.slice(0, -1) + rt] || { alpha: 1, beta: 1, stopped: 0 };
      if (a.stopped) continue;
      best = Math.max(best, learnerBeta(a.alpha, a.beta, rng));
    }
    return best;
  };
  const ordered = [], first_draw = {};
  while (groups.size) {
    let bestG = null, bestT = -Infinity;
    for (const g of groups.keys()) {
      const t = draw(g);
      if (!(g in first_draw)) first_draw[g] = Math.round(t * 1e3) / 1e3;
      if (t > bestT) {
        bestT = t;
        bestG = g;
      }
    }
    const list = groups.get(bestG);
    ordered.push(list.shift());
    if (!list.length) groups.delete(bestG);
  }
  return { ordered, held, groups: counts, first_draw };
}
async function learnerConfig(env) {
  const cfg = { enabled: true, raw: null, resume: /* @__PURE__ */ new Set(), error: null };
  try {
    const r = await env.AUDIT.prepare("SELECT key, value FROM ops_config WHERE key = ?1 OR substr(key, 1, ?3) = ?2").bind(LEARNER_SWITCH_KEY, LEARNER_RESUME_PREFIX, LEARNER_RESUME_PREFIX.length).all();
    for (const row of r.results || []) {
      const k = String(row.key || ""), v = String(row.value == null ? "" : row.value).trim().toLowerCase();
      if (k === LEARNER_SWITCH_KEY) {
        cfg.raw = v;
        cfg.enabled = !LEARNER_OFF_RX.test(v);
      } else if (LEARNER_ON_RX.test(v)) cfg.resume.add(k.slice(LEARNER_RESUME_PREFIX.length));
    }
  } catch (e) {
    cfg.enabled = false;
    cfg.error = "ops_config unreadable: " + String(e && e.message || e).slice(0, 120);
  }
  return cfg;
}
async function learnerEnsure(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS outreach_learner_sends (queue_id TEXT PRIMARY KEY, email TEXT NOT NULL, segment TEXT NOT NULL, topic TEXT, rtype TEXT, template TEXT, paper_id TEXT, sent_at TEXT NOT NULL, message_id TEXT, source TEXT, outcome TEXT, outcome_at TEXT, evidence_email_id INTEGER, updated_at TEXT)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS outreach_learner_arms (segment TEXT PRIMARY KEY, topic TEXT, rtype TEXT, alpha REAL NOT NULL DEFAULT 1, beta REAL NOT NULL DEFAULT 1, sends INTEGER NOT NULL DEFAULT 0, positives INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, optouts INTEGER NOT NULL DEFAULT 0, unresolved INTEGER NOT NULL DEFAULT 0, rule_stop INTEGER NOT NULL DEFAULT 0, override INTEGER NOT NULL DEFAULT 0, stopped INTEGER NOT NULL DEFAULT 0, stopped_at TEXT, updated_at TEXT)").run();
  const vals = LEARNER_SEGMENTS.map((s) => "('" + s + "', '" + s.split(":")[0] + "', '" + s.split(":")[1] + "', datetime('now'))").join(", ");
  await env.AUDIT.prepare("INSERT OR IGNORE INTO outreach_learner_arms (segment, topic, rtype, updated_at) VALUES " + vals).run();
}
async function learnerEvent(env, id, text, meta, status, replace) {
  try {
    await env.AUDIT.prepare("INSERT OR " + (replace ? "REPLACE" : "IGNORE") + " INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'outreach-learner', ?3, ?4, 'outreach-learner', ?5)").bind(id, (/* @__PURE__ */ new Date()).toISOString(), String(text).slice(0, 2e3), JSON.stringify(meta || {}), status || "ok").run();
    return true;
  } catch (e) {
    return false;
  }
}
function learnerTag() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
async function learnerLoadArms(env) {
  const arms = {};
  const r = await env.AUDIT.prepare("SELECT * FROM outreach_learner_arms").all();
  for (const a of r.results || []) arms[a.segment] = a;
  return arms;
}
async function learnerRecordSend(env, row, email, seg, mid, source, sentAt) {
  try {
    const [topic, rtype] = seg.split(":");
    const r = await env.AUDIT.prepare("INSERT OR IGNORE INTO outreach_learner_sends (queue_id, email, segment, topic, rtype, template, paper_id, sent_at, message_id, source, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)").bind(String(row.id), String(email).toLowerCase(), seg, topic, rtype, LEARNER_TEMPLATE, row.paper_id || null, sentAt || (/* @__PURE__ */ new Date()).toISOString(), mid || null, source, (/* @__PURE__ */ new Date()).toISOString()).run();
    return !!(r && r.meta && Number(r.meta.changes) > 0);
  } catch (e) {
    return false;
  }
}
// History in: every outreach_queue row this engine sent, with its first-contact Message-ID from outreach_log.
async function learnerReconcile(env) {
  const r = await env.AUDIT.prepare("SELECT q.id, q.paper_id, q.reason, q.email, q.sent_at, (SELECT o.message_id FROM outreach_log o WHERE lower(o.email) = lower(q.email) AND COALESCE(o.subject, '') NOT LIKE 'Following up:%' AND COALESCE(o.subject, '') NOT LIKE 'Re:%' ORDER BY o.id LIMIT 1) AS mid, (SELECT o.sent_at FROM outreach_log o WHERE lower(o.email) = lower(q.email) AND COALESCE(o.subject, '') NOT LIKE 'Following up:%' AND COALESCE(o.subject, '') NOT LIKE 'Re:%' ORDER BY o.id LIMIT 1) AS osent FROM outreach_queue q WHERE q.status = 'sent' AND COALESCE(q.email, '') <> '' AND NOT EXISTS (SELECT 1 FROM outreach_learner_sends l WHERE l.queue_id = q.id) ORDER BY q.sent_at LIMIT 200").all();
  let n = 0;
  for (const q of r.results || []) {
    const email = String(q.email || "").toLowerCase();
    const at = learnerIso(q.sent_at) || learnerIso(q.osent);
    if (!validEmail(email) || !at) continue;
    if (await learnerRecordSend(env, q, email, learnerSegment(q.reason, email), q.mid || "", "backfill", at)) n++;
  }
  return n;
}
async function learnerEmailRows(env, sinceIso) {
  const r = await env.AUDIT.prepare("SELECT id, sender, recipient, subject, status, received_at, in_reply_to, substr(COALESCE(references_hdr, ''), 1, 2000) AS refs FROM emails WHERE datetime(received_at) >= datetime(?1) AND COALESCE(status, '') <> 'sent' ORDER BY id LIMIT 3000").bind(sinceIso).all();
  return r.results || [];
}
async function learnerDetail(env, id, cache) {
  if (cache.has(id)) return cache.get(id);
  const r = await env.AUDIT.prepare("SELECT substr(COALESCE(body_text, ''), 1, 4000) AS body, lower(substr(COALESCE(headers_json, ''), 1, 8000)) AS h FROM emails WHERE id = ?1").bind(id).first();
  const h = String(r && r.h || "");
  const d = {
    body: String(r && r.body || ""),
    auto: /"auto-submitted"\s*:\s*"auto|"x-autoreply"|"x-autorespond"|"precedence"\s*:\s*"auto_reply"/.test(h),
    bulk: /"list-unsubscribe"|"list-id"|"precedence"\s*:\s*"(bulk|list|junk)"/.test(h)
  };
  cache.set(id, d);
  return d;
}
// sends: [{ key, email, message_id | message_ids, sent_at }] -> Map key -> { outcome, email_id, at, addr }.
async function learnerOutcomes(env, sends, rows, cache) {
  cache = cache || /* @__PURE__ */ new Map();
  const byAddr = /* @__PURE__ */ new Map(), byMid = /* @__PURE__ */ new Map(), all = [];
  for (const s of sends) {
    const a = learnerAddr(s.email);
    const t = Date.parse(learnerIso(s.sent_at) || "");
    if (!a || !isFinite(t)) continue;
    const x = { key: s.key, addr: a, t };
    all.push(x);
    if (!byAddr.has(a)) byAddr.set(a, []);
    byAddr.get(a).push(x);
    for (const m of [].concat(s.message_ids || s.message_id || [])) {
      const k = learnerMid(m);
      if (k && k !== "<>") byMid.set(k, x);
    }
  }
  const res = /* @__PURE__ */ new Map();
  const rank = { optout: 4, positive: 3, negative: 2, bounce: 1 };
  const put = (x, outcome, row, from) => {
    const cur = res.get(x.key);
    if (!cur || rank[outcome] > rank[cur.outcome]) res.set(x.key, { outcome, email_id: row.id, at: learnerIso(row.received_at), addr: from });
  };
  for (const row of rows) {
    const addr = learnerAddr(row.sender);
    const at = Date.parse(learnerIso(row.received_at) || "");
    if (!addr || !isFinite(at)) continue;
    const local = addr.split("@")[0];
    if ((local === "mailer-daemon" || local === "postmaster") && LEARNER_BOUNCE_SUBJ_RX.test(decodeHeader(String(row.subject || "")))) {
      const body = (await learnerDetail(env, row.id, cache)).body.toLowerCase();
      for (const x of all) if (at >= x.t && at - x.t <= 7 * LEARNER_DAY_MS && body.indexOf(x.addr) >= 0) put(x, "bounce", row, addr);
      continue;
    }
    if (learnerInternal(addr) || learnerMachine(addr)) continue;
    let targets = [];
    for (const m of learnerRowMids(row)) if (byMid.has(m)) targets.push(byMid.get(m));
    if (!targets.length && byAddr.has(addr)) targets = byAddr.get(addr);
    targets = targets.filter((x) => at >= x.t);
    if (!targets.length) continue;
    const d = await learnerDetail(env, row.id, cache);
    if (d.bulk && !learnerRowMids(row).length) continue;
    const cls = learnerClassify({ subject: row.subject, body: d.body, auto: d.auto });
    if (cls === "auto") continue;
    for (const x of targets) put(x, cls, row, addr);
  }
  return res;
}
async function learnerConsequence(env, s, outcome, replier) {
  const email = String(s.email || "").toLowerCase();
  const notes = [];
  if (outcome === "optout" || outcome === "bounce") {
    for (const a of [...new Set([email, replier].filter((x) => x && !learnerInternal(x)))]) {
      try {
        await env.AUDIT.prepare("INSERT INTO email_suppression (email, reason, source) VALUES (?1, ?2, 'outreach-learner') ON CONFLICT(email) DO NOTHING").bind(a, outcome === "optout" ? "reply-stop" : "bounce").run();
        notes.push("suppressed " + a);
      } catch (e) {
        notes.push("suppression write failed: " + String(e && e.message || e).slice(0, 80));
      }
    }
  }
  if (outcome === "positive" || outcome === "negative" || outcome === "optout") {
    try {
      await env.AUDIT.prepare("UPDATE outreach_log SET status = 'replied' WHERE lower(email) = ?1 AND status IN ('sent', 'followup')").bind(email).run();
    } catch (e) {
      notes.push("outreach_log replied write failed");
    }
  }
  return notes;
}
async function learnerRecomputeArms(env, cfg, before, resolved, nowIso) {
  const agg = {};
  const r = await env.AUDIT.prepare("SELECT segment, COUNT(*) AS sends, SUM(CASE WHEN outcome = 'positive' THEN 1 ELSE 0 END) AS pos, SUM(CASE WHEN outcome IN ('negative', 'optout', 'no-reply', 'bounce') THEN 1 ELSE 0 END) AS fail, SUM(CASE WHEN outcome = 'optout' THEN 1 ELSE 0 END) AS optouts, SUM(CASE WHEN outcome IS NULL THEN 1 ELSE 0 END) AS unresolved FROM outreach_learner_sends GROUP BY segment").all();
  for (const a of r.results || []) agg[a.segment] = a;
  const arms = {}, stopped = [], updates = [];
  for (const seg of [.../* @__PURE__ */ new Set([...LEARNER_SEGMENTS, ...Object.keys(agg)])]) {
    const a = agg[seg] || {};
    const sends = Number(a.sends || 0), pos = Number(a.pos || 0), fail = Number(a.fail || 0);
    const alpha = 1 + pos, beta = 1 + fail;
    const prev = before[seg] || null;
    const rule = sends >= LEARNER_STOP_MIN_SENDS && pos < LEARNER_STOP_RATE * sends ? 1 : 0;
    const override = cfg.resume.has(seg) ? 1 : 0;
    // An unreadable ops_config keeps the previous stop state: it can neither stop nor resume a segment.
    const stop = cfg.error ? (prev && Number(prev.stopped) ? 1 : 0) : (rule && !override ? 1 : 0);
    const stoppedAt = stop ? (prev && Number(prev.stopped) && prev.stopped_at ? prev.stopped_at : nowIso) : null;
    await env.AUDIT.prepare("INSERT INTO outreach_learner_arms (segment, topic, rtype, alpha, beta, sends, positives, failures, optouts, unresolved, rule_stop, override, stopped, stopped_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15) ON CONFLICT(segment) DO UPDATE SET alpha = excluded.alpha, beta = excluded.beta, sends = excluded.sends, positives = excluded.positives, failures = excluded.failures, optouts = excluded.optouts, unresolved = excluded.unresolved, rule_stop = excluded.rule_stop, override = excluded.override, stopped = excluded.stopped, stopped_at = excluded.stopped_at, updated_at = excluded.updated_at").bind(seg, seg.split(":")[0], seg.split(":")[1] || "", alpha, beta, sends, pos, fail, Number(a.optouts || 0), Number(a.unresolved || 0), rule, override, stop, stoppedAt, nowIso).run();
    arms[seg] = { segment: seg, alpha, beta, sends, positives: pos, failures: fail, rule_stop: rule, override, stopped: stop, stopped_at: stoppedAt };
    if (stop) stopped.push(seg);
    const pa = prev ? Number(prev.alpha) : 1, pb = prev ? Number(prev.beta) : 1;
    if (pa !== alpha || pb !== beta) {
      const moved = resolved.filter((x) => x.segment === seg).map((x) => x.queue_id + ":" + (x.from || "open") + ">" + x.to);
      const u = { segment: seg, from: [pa, pb], to: [alpha, beta], sends, moved: moved.slice(0, 40) };
      updates.push(u);
      await learnerEvent(env, "ol-post-" + seg + "-" + learnerTag(), "OUTREACH-LEARNER-1 posterior " + seg + " Beta(" + pa + "," + pb + ") -> Beta(" + alpha + "," + beta + ") after " + moved.length + " resolution(s)", u, "ok");
    }
    const was = prev && Number(prev.stopped) ? 1 : 0;
    if (was !== stop) {
      const why = stop ? sends + " sends, " + pos + " positive (< " + LEARNER_STOP_RATE * 100 + "% after " + LEARNER_STOP_MIN_SENDS + ")" : override ? "ops_config " + LEARNER_RESUME_PREFIX + seg + " override" : "rule no longer met (" + sends + " sends, " + pos + " positive)";
      await learnerEvent(env, "ol-" + (stop ? "stop" : "resume") + "-" + seg + "-" + learnerTag(), "OUTREACH-LEARNER-1 segment " + seg + (stop ? " STOPPED: " : " resumed: ") + why, { segment: seg, stopped: stop, sends, positives: pos, override, rule_stop: rule }, "ok");
    }
  }
  return { arms, stopped, updates };
}
async function learnerRelease(env, cfg, stoppedSet, nowIso) {
  if (cfg.error) return 0;
  const r = await env.AUDIT.prepare("SELECT id, error FROM outreach_queue WHERE status = ?1 LIMIT 500").bind(LEARNER_HELD).all();
  let n = 0;
  const segs = {};
  for (const q of r.results || []) {
    const seg = (/\[seg=([^\]]+)\]/.exec(String(q.error || "")) || [])[1] || "";
    if (cfg.enabled && seg && stoppedSet.has(seg)) continue;
    const note = "OUTREACH-LEARNER-1 released " + nowIso + ": " + (cfg.enabled ? "segment " + seg + " is not stopped" : "learner off (ops_config " + LEARNER_SWITCH_KEY + ")");
    const u = await env.AUDIT.prepare("UPDATE outreach_queue SET status = 'pending', error = ?2 WHERE id = ?1 AND status = ?3").bind(q.id, note, LEARNER_HELD).run();
    if (u && u.meta && Number(u.meta.changes) > 0) {
      n++;
      segs[seg] = (segs[seg] || 0) + 1;
    }
  }
  if (n) await learnerEvent(env, "ol-release-" + learnerTag(), "OUTREACH-LEARNER-1 released " + n + " held candidate(s)", { released: n, by_segment: segs, learner_enabled: cfg.enabled }, "ok");
  return n;
}
async function learnerHold(env, row, seg, arm) {
  try {
    const note = "OUTREACH-LEARNER-1 held [seg=" + seg + "]: " + (arm ? Number(arm.sends) + " sends, " + Number(arm.positives) + " positive, " : "") + "under " + LEARNER_STOP_RATE * 100 + "% after " + LEARNER_STOP_MIN_SENDS + " sends; resume with ops_config " + LEARNER_RESUME_PREFIX + seg + " = 1, or " + LEARNER_SWITCH_KEY + " = 0";
    const r = await env.AUDIT.prepare("UPDATE outreach_queue SET status = ?2, error = ?3 WHERE id = ?1 AND status IN ('pending', 'needs-email', 'needs-contact')").bind(row.id, LEARNER_HELD, note).run();
    return !!(r && r.meta && Number(r.meta.changes) > 0);
  } catch (e) {
    return false;
  }
}
// Backfill, outcomes, posteriors, stop rule, releases. Idempotent: a second run with no new mail changes nothing.
async function learnerUpdate(env, cfg, nowMs) {
  const now = nowMs || Date.now();
  const nowIso = new Date(now).toISOString();
  const out = { backfilled: 0, open: 0, resolved: 0, by_outcome: {}, consequences: [] };
  out.backfilled = await learnerReconcile(env);
  const before = await learnerLoadArms(env);
  const open = (await env.AUDIT.prepare("SELECT queue_id, email, segment, sent_at, message_id, outcome FROM outreach_learner_sends WHERE outcome IS NULL OR (outcome = 'no-reply' AND datetime(sent_at) >= datetime(?1))").bind(new Date(now - LEARNER_LATE_DAYS * LEARNER_DAY_MS).toISOString()).all()).results || [];
  out.open = open.length;
  const resolved = [];
  if (open.length) {
    let since = now;
    for (const s of open) {
      const t = Date.parse(learnerIso(s.sent_at) || "");
      if (isFinite(t) && t < since) since = t;
    }
    since = Math.max(since, now - LEARNER_SCAN_MAX_DAYS * LEARNER_DAY_MS);
    const rows = await learnerEmailRows(env, new Date(since).toISOString());
    const found = await learnerOutcomes(env, open.map((s) => ({ key: s.queue_id, email: s.email, message_id: s.message_id, sent_at: s.sent_at })), rows);
    for (const s of open) {
      const f = found.get(s.queue_id);
      const age = (now - Date.parse(learnerIso(s.sent_at) || nowIso)) / LEARNER_DAY_MS;
      const cur = s.outcome || null;
      let next = cur;
      if (f) next = f.outcome;
      else if (!cur && age >= LEARNER_NO_REPLY_DAYS) next = "no-reply";
      if (!next || next === cur) continue;
      const u = await env.AUDIT.prepare("UPDATE outreach_learner_sends SET outcome = ?2, outcome_at = ?3, evidence_email_id = ?4, updated_at = ?5 WHERE queue_id = ?1 AND COALESCE(outcome, '') = ?6").bind(s.queue_id, next, f ? f.at : nowIso, f ? f.email_id : null, nowIso, cur || "").run();
      if (!(u && u.meta && Number(u.meta.changes) > 0)) continue;
      resolved.push({ queue_id: s.queue_id, segment: s.segment, from: cur, to: next, email_id: f ? f.email_id : null });
      out.by_outcome[next] = (out.by_outcome[next] || 0) + 1;
      for (const n of await learnerConsequence(env, s, next, f && f.addr)) out.consequences.push(n);
    }
  }
  out.resolved = resolved.length;
  const rec = await learnerRecomputeArms(env, cfg, before, resolved, nowIso);
  out.arms = rec.arms;
  out.stopped = rec.stopped;
  out.posterior_updates = rec.updates.length;
  out.released = await learnerRelease(env, cfg, new Set(rec.stopped), nowIso);
  out.consequences = out.consequences.slice(0, 20);
  return out;
}
function learnerCompactArms(arms) {
  const o = {};
  for (const s of Object.keys(arms || {})) {
    const a = arms[s];
    o[s] = [Number(a.alpha), Number(a.beta), Number(a.sends), Number(a.positives), Number(a.stopped) ? "stopped" : "live"];
  }
  return o;
}
async function learnerPrepare(env, cfg, pending, today) {
  await learnerEnsure(env);
  const upd = await learnerUpdate(env, cfg);
  const arms = upd.arms;
  const stopped = new Set(upd.stopped);
  const stoppedEmails = /* @__PURE__ */ new Set();
  if (stopped.size) {
    const r = await env.AUDIT.prepare("SELECT lower(email) AS e, segment FROM outreach_learner_sends").all();
    for (const x of r.results || []) if (stopped.has(x.segment)) stoppedEmails.add(String(x.e));
  }
  const plan = learnerPlan(pending, arms, LEARNER_RNG.fn);
  return { plan, arms, stopped, stoppedEmails, held: [], picks: [], day: today, update: { backfilled: upd.backfilled, resolved: upd.resolved, by_outcome: upd.by_outcome, released: upd.released } };
}
async function learnerLogAllocation(env, cfg, L, out, today, sentToday) {
  const tally = (list) => list.reduce((m, s) => (m[s] = (m[s] || 0) + 1, m), {});
  const meta = { day: today, mode: L ? "thompson" : "oldest-first", sent: out.sent, followups: out.followups, capped: !!out.capped };
  if (!L) meta.why = cfg.error || (!cfg.enabled ? "ops_config " + LEARNER_SWITCH_KEY + " = " + cfg.raw : out.learner_error || (sentToday >= 8 ? "daily cap already used" : "learner not run"));
  else {
    meta.picks = tally(L.picks);
    meta.held = tally(L.held);
    meta.candidates = L.plan.groups;
    meta.first_draw = L.plan.first_draw;
    meta.stopped = [...L.stopped];
    meta.posterior = learnerCompactArms(L.arms);
    meta.update = L.update;
    if (out.learner_followups_held) meta.followups_held = out.learner_followups_held;
  }
  await learnerEvent(env, "ol-alloc-" + today + "-" + learnerTag(), "OUTREACH-LEARNER-1 allocation " + today + " (" + meta.mode + "): sent " + out.sent + (L ? " " + JSON.stringify(meta.picks) : ""), meta, "ok");
  return L ? { mode: meta.mode, picks: meta.picks, held: meta.held, stopped: meta.stopped } : { mode: meta.mode, why: meta.why };
}
async function learnerContacted(env) {
  const set = /* @__PURE__ */ new Set();
  const add = async (db, sql) => {
    if (!db) return;
    try {
      for (const r of (await db.prepare(sql).all()).results || []) {
        const a = learnerAddr(r.e);
        if (a) set.add(a);
      }
    } catch (e) {
    }
  };
  await add(env.AUDIT, "SELECT DISTINCT email AS e FROM outreach_log");
  await add(env.AUDIT, "SELECT email AS e FROM contact_ledger");
  await add(env.AUDIT, "SELECT DISTINCT recipient AS e FROM emails WHERE status = 'sent'");
  await add(env.OUTREACH, "SELECT email AS e FROM contacts WHERE contact_count > 0 OR status = 'contacted'");
  return set;
}
// A first, non-automated message to the owner's qnfo.org address from someone the fleet never wrote to, not a reply.
// Mail tagged [work-with-me:<offer>] (qnfo.org/work-with-me mailto buttons, qnfo-gateway WORK-WITH-ME-1) is an inbound
// contact by construction: it counts whatever its wording, as in the dashboard's inbound_contacts_30d (WORK-WITH-ME-METRIC-1).
async function learnerInboundContact(env, row, addr, cache) {
  const st = String(row.status || "").toLowerCase();
  if (st === "spam" || st === "rejected") return false;
  const subject = decodeHeader(String(row.subject || ""));
  if (learnerMachine(addr)) return false;
  if (LEARNER_WWM_RX.test(subject)) return true;
  if (String(row.recipient || "").toLowerCase().indexOf(OUTREACH_FROM.email) < 0) return false;
  const local = addr.split("@")[0];
  if (LEARNER_ROLE_RX.test(local) || /^[0-9a-f]{12,}-/.test(local)) return false;
  if (row.in_reply_to || LEARNER_REPLY_SUBJ_RX.test(subject)) return false;
  if (LEARNER_SOLICIT_RX.test(subject) || GRANT_RECEIPT_RX.test(subject)) return false;
  for (const k of ["receipt", "waiting", "sysnotice", "someday", "code", "newsletter", "marketing", "security", "jobalert"]) if (RX[k].test(subject)) return false;
  const d = await learnerDetail(env, row.id, cache);
  if (d.auto || d.bulk || LEARNER_SOLICIT_RX.test(d.body.slice(0, 1500))) return false;
  const earlier = await env.AUDIT.prepare("SELECT 1 AS x FROM emails WHERE id < ?1 AND lower(sender) LIKE ?2 LIMIT 1").bind(row.id, "%" + addr + "%").first();
  return !earlier;
}
// outreach_reply_rate_30d and warm_conversations_30d (docs/STRATEGY.md s6.3, s9) into metric_registry.
async function learnerMetrics(env, nowMs) {
  const now = nowMs || Date.now();
  const nowIso = new Date(now).toISOString();
  const since = new Date(now - 30 * LEARNER_DAY_MS).toISOString();
  const out = { sources: {} };
  const sends = /* @__PURE__ */ new Map();
  const add = (email, sentAt, mid, src) => {
    const a = learnerAddr(email);
    const t = learnerIso(sentAt);
    if (!a || !t || !validEmail(a) || learnerInternal(a)) return;
    const cur = sends.get(a);
    if (!cur) sends.set(a, { key: a, email: a, sent_at: t, message_ids: mid ? [mid] : [], src });
    else {
      if (t < cur.sent_at) cur.sent_at = t;
      if (mid) cur.message_ids.push(mid);
    }
  };
  const a = await env.AUDIT.prepare("SELECT email, sent_at, message_id FROM outreach_log WHERE status IN ('sent', 'replied', 'rejected') AND COALESCE(subject, '') NOT LIKE 'Following up:%' AND COALESCE(subject, '') NOT LIKE 'Re:%' AND datetime(sent_at) >= datetime(?1)").bind(since).all();
  for (const r of a.results || []) add(r.email, r.sent_at, r.message_id, "cloud-ops");
  out.sources.cloud_ops = (a.results || []).length;
  try {
    const b = await env.OUTREACH.prepare("SELECT c.email AS email, s.sent_at AS sent_at, s.message_id AS message_id FROM sends s JOIN contacts c ON c.id = s.contact_id WHERE s.status = 'sent' AND COALESCE(s.kind, '') <> 'selfcheck' AND datetime(s.sent_at) >= datetime(?1)").bind(since).all();
    for (const r of b.results || []) add(r.email, r.sent_at, r.message_id, "qnfo-outreach");
    out.sources.qnfo_outreach = (b.results || []).length;
  } catch (e) {
    out.sources.qnfo_outreach = "error: " + String(e && e.message || e).slice(0, 80);
    out.partial = true;
  }
  const cache = /* @__PURE__ */ new Map();
  const rows = await learnerEmailRows(env, since);
  const found = await learnerOutcomes(env, [...sends.values()], rows, cache);
  let pos = 0;
  for (const f of found.values()) if (f.outcome === "positive") pos++;
  out.sends_30d = sends.size;
  out.positive_to_sends_30d = pos;
  // Under LEARNER_RATE_MIN_SENDS first contacts (a pause, a restart) the rate is "n/a": METRIC-CLOSED-LOOP-1 reads a
  // non-numeric value as unreadable, never as 0, so a paused stream does not fire the reply-rate trigger.
  out.outreach_reply_rate_30d = sends.size >= LEARNER_RATE_MIN_SENDS ? Math.round(1e3 * pos / sends.size) / 10 : "n/a";
  const contacted = await learnerContacted(env);
  const warm = /* @__PURE__ */ new Set(), inbound = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const addr = learnerAddr(row.sender);
    if (!addr || learnerInternal(addr) || warm.has(addr) || inbound.has(addr)) continue;
    const ours = learnerRowMids(row).some((m) => /@qnfo\.org>$/.test(m));
    if (contacted.has(addr) || ours) {
      if (learnerMachine(addr)) continue;
      const d = await learnerDetail(env, row.id, cache);
      if (d.auto || (d.bulk && !ours)) continue;
      if (learnerClassify({ subject: row.subject, body: d.body, auto: d.auto }) === "positive") warm.add(addr);
      continue;
    }
    if (await learnerInboundContact(env, row, addr, cache)) inbound.add(addr);
  }
  out.positive_replies_30d = warm.size;
  out.inbound_contacts_30d = inbound.size;
  out.warm_conversations_30d = warm.size + inbound.size;
  // The same rows (and their analytics_metric_triggers) are in migrations/2026-10-02-outreach-learner-metrics.sql; this
  // INSERT OR IGNORE only covers a fresh database and never overwrites a row registered first elsewhere.
  out.registry_written = [];
  out.registry_missing = [];
  for (const [metric, kind, formula, source, baseline, target, warn, kill, value] of LEARNER_METRICS.map((x) => x.concat([x[0] === "outreach_reply_rate_30d" ? out.outreach_reply_rate_30d : out.warm_conversations_30d]))) {
    try {
      await env.AUDIT.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state) VALUES (?1, 'fleet', ?2, ?3, ?4, ?5, ?6, 'qnfo-cloud-ops', ?7, 'daily', ?8, ?9, 'MEASURED')").bind(metric, kind, formula, source, baseline, target, LEARNER_METRIC_ACTOR, warn, kill).run();
    } catch (e) {
    }
    try {
      const u = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2 WHERE metric = ?3").bind(String(value), nowIso, metric).run();
      (u && u.meta && Number(u.meta.changes) > 0 ? out.registry_written : out.registry_missing).push(metric);
    } catch (e) {
      out.registry_missing.push(metric);
    }
  }
  return out;
}
// Daily tick (companion in the engagement slot): measure, update, enforce the stop rule, publish metrics, heartbeat.
async function jobOutreachLearner(env) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const cfg = await learnerConfig(env);
  const notes = { day, enabled: cfg.enabled };
  if (cfg.error) notes.config_error = cfg.error;
  let status = cfg.error ? "degraded" : "ok";
  try {
    await learnerEnsure(env);
    const u = await learnerUpdate(env, cfg, now);
    notes.backfilled = u.backfilled;
    notes.open = u.open;
    notes.resolved = u.resolved;
    notes.by_outcome = u.by_outcome;
    notes.posterior_updates = u.posterior_updates;
    notes.stopped = u.stopped;
    notes.released = u.released;
    notes.segments = learnerCompactArms(u.arms);
  } catch (e) {
    status = "error";
    notes.error = String(e && e.message || e).slice(0, 200);
  }
  try {
    const m = await learnerMetrics(env, now);
    notes.metrics = { outreach_reply_rate_30d: m.outreach_reply_rate_30d, sends_30d: m.sends_30d, positive_to_sends_30d: m.positive_to_sends_30d, warm_conversations_30d: m.warm_conversations_30d, positive_replies_30d: m.positive_replies_30d, inbound_contacts_30d: m.inbound_contacts_30d, sources: m.sources, registry_missing: m.registry_missing };
    if ((m.registry_missing.length || m.partial) && status === "ok") status = "degraded";
  } catch (e) {
    notes.metrics_error = String(e && e.message || e).slice(0, 160);
    if (status === "ok") status = "degraded";
  }
  await learnerEvent(env, "ol-tick-" + day, "OUTREACH-LEARNER-1 tick " + day + " " + status + (notes.metrics ? ": reply rate 30d " + notes.metrics.outreach_reply_rate_30d + "%, warm conversations 30d " + notes.metrics.warm_conversations_30d : ""), notes, status, true);
  return { status, notes };
}
// OUTREACH-LEARNER-1 end
async function jobWorkerHealth(env) {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
  const endpoints = [
    { worker: "qnfo-ai", url: "https://ai.qnfo.org/health", headers: { "User-Agent": UA } },
    { worker: "personal-api", url: "https://personal.qnfo.org/health", headers: { "User-Agent": UA } },
    { worker: "qnfo-idea-factory", url: "https://ideas.qnfo.org/health", headers: { "User-Agent": UA } },
    // HEALTH-KEYLESS-1 (1.18.3): these two probes sent copies of ROUTER_AUTH_KEY and PL_API_KEY, which the 2026-10-01
    // rotation (#1676, #1701) left stale, so worker-health failed every run from 2026-09-30 15:05Z on a 401 that said
    // nothing about either worker. qnfo-ai is now reached through the QNFO_AI service binding, which authenticates by
    // props.caller (INTERNAL-CALLER-PROPS-1, CLAUDE.md #1703) with no key; personal-api has no caller props, so its
    // keyless model listing (MODEL-DISCOVERY-PUBLIC-1) proves the front door answers. No secret copy is read.
    { worker: "qnfo-ai-chat", binding: "QNFO_AI", url: "https://qnfo-ai/v1/chat/completions", headers: { "Content-Type": "application/json", "User-Agent": UA }, body: { model: "deepseek-v4-flash", messages: [{ role: "user", content: "ping" }], max_tokens: 5 } },
    { worker: "personal-api-models", url: "https://personal.qnfo.org/v1/models", headers: { "User-Agent": UA } }
  ];
  const out = { checks: [], failed: [], skipped: [] };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const ep of endpoints) {
    if (ep.binding && !(env[ep.binding] && env[ep.binding].fetch)) {
      // A probe that needs a binding the live worker does not carry yet is skipped, never sent unauthenticated.
      out.skipped.push({ worker: ep.worker, reason: "binding " + ep.binding + " not installed" });
      continue;
    }
    const t0 = Date.now();
    let status = 0, dur = 0, error = "", body = "";
    try {
      const fetcher = ep.binding && env[ep.binding] && env[ep.binding].fetch ? (u, o) => env[ep.binding].fetch(u, o) : (u, o) => fetch(u, o);
      const resp = await fetcher(ep.url, { method: ep.body ? "POST" : "GET", headers: ep.headers || {}, body: ep.body ? JSON.stringify(ep.body) : void 0, signal: AbortSignal.timeout(45e3) });
      status = resp.status;
      dur = Date.now() - t0;
      try {
        body = (await resp.text()).slice(0, 200);
      } catch (e) {
        body = "";
      }
      if (status !== 200) {
        error = "HTTP " + status + " body:" + body.slice(0, 80);
      } else {
        if (ep.body && body.indexOf("error") === 0) {
          error = body.slice(0, 120);
          status = 0;
        }
      }
    } catch (e) {
      dur = Date.now() - t0;
      error = String(e && e.message || e).slice(0, 200);
      status = 0;
    }
    try {
      await env.AUDIT.prepare("INSERT INTO worker_invocations (worker_name, endpoint, status_code, duration_ms, created_at) VALUES (?1,?2,?3,?4,?5)").bind(ep.worker, ep.url, status, dur, now).run();
    } catch (e) {
    }
    const ok = status === 200 && !error;
    out.checks.push({ worker: ep.worker, status, duration_ms: Math.round(dur), ok });
    if (!ok) out.failed.push({ worker: ep.worker, status, error });
  }
  if (out.failed.length) {
    const L = ["AI endpoint health check FAILED " + now, ""];
    for (const f of out.failed) L.push("- " + f.worker + " -> HTTP " + f.status + " " + (f.error || ""));
    L.push("", "Action: verify endpoint config, worker deploy, provider keys (QNFO-ROUTER/PERSONAL-TWIN apiType must be 'openai').");
    const subject = "QNFO AI endpoint health alert";
    const d = await sendDigest(env, subject, L.join(NL));
    try {
      await env.AUDIT.prepare("INSERT INTO alerts (source, level, message, digested) VALUES ('worker-health', 'error', ?1, 1)").bind(L.join(NL).slice(0, 2e3)).run();
    } catch (e) {
    }
    await recordEvent(env, "job-run", "jr-worker-health-" + Date.now().toString(36), "worker-health FAILED " + JSON.stringify(out.failed), { job: "worker-health", status: "error" });
    return { status: "error", notes: out };
  }
  await recordEvent(env, "job-run", "jr-worker-health-" + Date.now().toString(36), "worker-health ok " + out.checks.length + " endpoints", { job: "worker-health", status: "ok" });
  return { status: "ok", notes: out };
}
__name(jobWorkerHealth, "jobWorkerHealth");
async function jobVisibility(env) {
  const ZONE = "84e9dc1d7fb72629ccdbe3174ed24420";
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const out = { zone: ZONE, ts: today };
  const UA = { "User-Agent": "qnfo-cloud-ops/" + VERSION, Authorization: "Bearer " + (env.CF_TOKEN || "") };
  try {
    const q = ['query { viewer { zones(filter: {zoneTag: "', ZONE, '"}) { httpRequests1dGroups(limit: 7, filter: {date_geq: "', since, '", date_leq: "', today, '"}) { dimensions { date } sum { requests pageViews } uniq { uniques } } } } }'].join("");
    const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { ...UA, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    if (r.ok) {
      const d2 = await r.json();
      const days = d2.data && d2.data.viewer && d2.data.viewer.zones && d2.data.viewer.zones[0] && d2.data.viewer.zones[0].httpRequests1dGroups || [];
      let req = 0, pv = 0, uniq = 0;
      for (const day of days) {
        req += day.sum.requests || 0;
        pv += day.sum.pageViews || 0;
        uniq += day.uniq.uniques || 0;
      }
      out.days = days.length;
      out.requests = req;
      out.pageviews = pv;
      out.uniques = uniq;
    } else out.web_error = "HTTP " + r.status;
  } catch (e) {
    out.web_error = String(e && e.message || e);
  }
  try {
    const agg = await env.AUDIT.prepare("SELECT COUNT(*) n, COALESCE(SUM(downloads),0) dl, COALESCE(SUM(views),0) vw, COALESCE(SUM(prev_downloads),0) pdl, COALESCE(SUM(prev_views),0) pvw FROM zenodo_stats").first();
    if (agg) {
      out.dois = agg.n;
      out.zenodo_downloads = agg.dl;
      out.zenodo_views = agg.vw;
      out.dl_delta = agg.dl - agg.pdl;
      out.vw_delta = agg.vw - agg.pvw;
    }
    const mov = await env.AUDIT.prepare("SELECT doi, title, downloads, prev_downloads, views, prev_views FROM zenodo_stats WHERE updated_at >= datetime('now','-8 days') ORDER BY (downloads - prev_downloads) DESC LIMIT 10").all();
    out.movers = (mov.results || []).map(function(r) {
      return { doi: r.doi, title: String(r.title || "").slice(0, 50), dl_gain: (r.downloads || 0) - (r.prev_downloads || 0), vw_gain: (r.views || 0) - (r.prev_views || 0) };
    }).filter(function(m) {
      return m.dl_gain > 0 || m.vw_gain > 0;
    });
  } catch (e) {
    out.zs_error = String(e && e.message || e);
  }
  try {
    const wk = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19).replace("T", " ");
    const vs = await env.LIVING.prepare("SELECT title, version, zenodo_doi, updated_at FROM papers WHERE status IN ('published','distributed') AND zenodo_doi IS NOT NULL AND zenodo_doi != '' AND updated_at >= ?1 ORDER BY updated_at DESC LIMIT 12").bind(wk).all();
    out.new_versions = (vs.results || []).length;
    out.versions = (vs.results || []).map(function(r) {
      return { title: String(r.title || "").slice(0, 50), ver: r.version, doi: r.zenodo_doi };
    });
  } catch (e) {
    out.lp_error = String(e && e.message || e);
  }
  try {
    const wk = new Date(Date.now() - 7 * 864e5).toISOString().replace("T", " ");
    const sc = await env.AUDIT.prepare("SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN status='posted' THEN 1 ELSE 0 END),0) posted FROM social_threads WHERE created_at >= ?1").bind(wk).first();
    out.social_threads_7d = sc ? sc.n || 0 : 0;
    out.social_posted_7d = sc ? sc.posted || 0 : 0;
  } catch (e) {
    out.soc_error = String(e && e.message || e);
  }
  try {
    const cit = await env.AUDIT.prepare("SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN metric='cited_by_count' THEN value ELSE 0 END),0) cited FROM citation_stats WHERE source IN ('openalex','crossref') AND collected_at >= datetime('now','-8 days')").first();
    const citedDois = await env.AUDIT.prepare("SELECT COUNT(DISTINCT doi) n FROM citation_stats WHERE metric='cited_by_count' AND value > 0").first();
    out.citation_events = cit ? cit.n || 0 : 0;
    out.citation_count = cit ? cit.cited || 0 : 0;
    out.cited_dois = citedDois ? citedDois.n || 0 : 0;
  } catch (e) {
    out.cit_error = String(e && e.message || e);
  }
  try {
    const wk = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const eng = await env.AUDIT.prepare("SELECT platform, metric, SUM(value) v FROM social_engagements WHERE collected_at >= ?1 AND metric != 'auth_status' AND metric != 'reach' GROUP BY platform, metric ORDER BY platform, metric").bind(wk).all();
    out.engagement = (eng.results || []).map(function(r) {
      return { platform: r.platform, metric: r.metric, value: r.v || 0 };
    });
  } catch (e) {
    out.eng_error = String(e && e.message || e);
  }
  try {
    if (env.OUTREACH) {
      const wk = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const f = await env.OUTREACH.prepare("SELECT COALESCE(SUM(mined),0) mined, COALESCE(SUM(drafted),0) drafted, COALESCE(SUM(sent),0) sent, COALESCE(SUM(replied),0) replied, COALESCE(SUM(bounced),0) bounced, COALESCE(SUM(opted_out),0) opted_out FROM funnel_daily WHERE day >= ?1").bind(wk).first();
      const sub = await env.OUTREACH.prepare("SELECT COUNT(*) n FROM submissions WHERE status IN ('submitted','accepted')").first();
      out.outreach = f ? { mined_7d: f.mined, drafted_7d: f.drafted, sent_7d: f.sent, replied_7d: f.replied, bounced_7d: f.bounced, opted_out_7d: f.opted_out } : {};
      out.submissions_accepted = sub ? sub.n || 0 : 0;
    }
  } catch (e) {
    out.outreach_error = String(e && e.message || e);
  }
  const L = ["QNFO visibility scorecard \u2014 " + today, ""];
  if (out.requests !== void 0) L.push("zone qnfo.org 7d: " + out.requests + " requests / " + out.pageviews + " pageviews / " + out.uniques + " unique visitors (" + out.days + " days)");
  else L.push("zone qnfo.org 7d: unavailable (" + (out.web_error || "no data") + ")");
  L.push("zenodo: " + (out.dois || 0) + " records | downloads " + (out.zenodo_downloads || 0) + " (+\u0394" + (out.dl_delta || 0) + ") | views " + (out.zenodo_views || 0) + " (+\u0394" + (out.vw_delta || 0) + ")");
  if (out.movers && out.movers.length) {
    L.push("", "zenodo top movers (7d):");
    for (const m of out.movers.slice(0, 6)) L.push("- +" + m.dl_gain + " dl / +" + m.vw_gain + " vw  " + m.title + "  " + m.doi);
  }
  if (out.new_versions !== void 0) {
    L.push("", "new versions this week: " + out.new_versions);
    for (const v of (out.versions || []).slice(0, 8)) L.push("- " + v.title + " " + v.ver + "  " + v.doi);
  }
  L.push("", "social threads created 7d: " + (out.social_threads_7d || 0) + " (posted " + (out.social_posted_7d || 0) + ")");
  L.push("citations: " + (out.citation_count || 0) + " cited-by across " + (out.cited_dois || 0) + " DOIs (" + (out.citation_events || 0) + " events 7d)");
  if (out.engagement && out.engagement.length) {
    L.push("", "social engagement (7d):");
    for (const e of out.engagement) L.push("- " + e.platform + " " + e.metric + ": " + e.value);
  } else L.push("", "social engagement (7d): none collected" + (out.eng_error ? " (" + out.eng_error + ")" : ""));
  if (out.outreach) {
    L.push("", "outreach (7d): mined " + (out.outreach.mined_7d || 0) + " / drafted " + (out.outreach.drafted_7d || 0) + " / sent " + (out.outreach.sent_7d || 0) + " / replies " + (out.outreach.replied_7d || 0) + " / bounces " + (out.outreach.bounced_7d || 0) + " / opt-outs " + (out.outreach.opted_out_7d || 0));
    L.push("open submissions accepted: " + (out.submissions_accepted || 0));
  } else if (out.outreach_error) L.push("", "outreach (7d): unavailable (" + out.outreach_error + ")");
  try {
    const wk = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const oa = await env.AUDIT.prepare("SELECT COUNT(*) n, ROUND(COALESCE(SUM(cost_usd),0),4) cost FROM ops_ai_log WHERE ts >= ?1").bind(wk).first();
    const ev = await env.AUDIT.prepare("SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END),0) ok FROM cloud_ops_events WHERE job='qnfo-ops' AND kind='ops_ai_tool' AND ts >= ?1").bind(wk).first();
    const dr = await env.AUDIT.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE job='qnfo-ops' AND text='ops_issue_run' AND status='ok' AND ts >= ?1").bind(wk).first();
    out.ops_ai = { chats_7d: oa ? oa.n || 0 : 0, cost_7d: oa ? oa.cost || 0 : 0, tool_events_7d: ev ? ev.n || 0 : 0, tool_ok_7d: ev ? ev.ok || 0 : 0, drains_7d: dr ? dr.n || 0 : 0 };
  } catch (e) {
    out.ops_error = String(e && e.message || e);
  }
  if (out.ops_ai) L.push("", "ops AI (7d): " + out.ops_ai.chats_7d + " chats | $" + out.ops_ai.cost_7d + " | " + out.ops_ai.tool_events_7d + " tool events (" + out.ops_ai.tool_ok_7d + " ok) | drains " + out.ops_ai.drains_7d);
  else if (out.ops_error) L.push("", "ops AI (7d): unavailable (" + out.ops_error + ")");
  const d = await storeDigest(env, "visibility", "QNFO visibility scorecard \u2014 " + today, L.join(NL));
  out.digest = d;
  return { status: "ok", notes: out };
}
__name(jobVisibility, "jobVisibility");
async function jobEngagement(env) {
  const out = { ts: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) };
  const stmts = [];
  const row = /* @__PURE__ */ __name((platform, postId, metric, value, note) => {
    stmts.push(env.AUDIT.prepare("INSERT INTO social_engagements (platform, post_id, metric, value, note, collected_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(platform, post_id, metric, collected_at) DO UPDATE SET value=excluded.value, note=excluded.note").bind(platform, postId, metric, value, note || null, out.ts));
  }, "row");
  try {
    if (!env.BSKY_HANDLE || !env.BSKY_APP_PASS) {
      out.bsky = "no credentials";
    } else {
      const BS = "https://bsky.social/xrpc";
      const sessR = await fetch(BS + "/com.atproto.server.createSession", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "qnfo-cloud-ops/" + VERSION }, body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASS }) });
      const sess = await sessR.json();
      if (!sessR.ok || !sess.accessJwt) {
        out.bsky = "session " + sessR.status;
      } else {
        const feedR = await fetch(BS + "/app.bsky.feed.getAuthorFeed?actor=" + encodeURIComponent(sess.did) + "&limit=30", { headers: { "User-Agent": "qnfo-cloud-ops/" + VERSION, Authorization: "Bearer " + sess.accessJwt } });
        const feed = await feedR.json();
        const uris = (feed && feed.feed || []).map((f) => f.post && f.post.uri).filter(Boolean);
        let likes = 0, reposts = 0, replies = 0, counted = 0;
        for (let i = 0; i < uris.length; i += 25) {
          const chunk = uris.slice(i, i + 25);
          const postsR = await fetch(BS + "/app.bsky.feed.getPosts?" + chunk.map((u) => "uris=" + encodeURIComponent(u)).join("&"), { headers: { "User-Agent": "qnfo-cloud-ops/" + VERSION, Authorization: "Bearer " + sess.accessJwt } });
          const posts = await postsR.json();
          for (const p of posts && posts.posts || []) {
            const l = p.likeCount || 0, r = p.repostCount || 0, c = p.replyCount || 0;
            likes += l;
            reposts += r;
            replies += c;
            counted++;
            row("bluesky", p.uri, "likes", l);
            row("bluesky", p.uri, "reposts", r);
            row("bluesky", p.uri, "replies", c);
          }
        }
        out.bsky = { posts: counted, likes, reposts, replies };
      }
    }
  } catch (e) {
    out.bsky_error = String(e && e.message || e);
  }
  try {
    if (!env.BUFFER_TOKEN) {
      out.buffer = "no token";
    } else {
      const gql = /* @__PURE__ */ __name(async (query) => {
        const r = await fetch("https://api.buffer.com", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.BUFFER_TOKEN, "User-Agent": "qnfo-cloud-ops/" + VERSION }, body: JSON.stringify({ query }) });
        if (!r.ok) throw new Error("buffer http " + r.status);
        return r.json();
      }, "gql");
      const orgR = await gql("{ account { organizations { id } } }");
      const orgs = orgR && orgR.data && orgR.data.account && orgR.data.account.organizations || [];
      if (!orgs.length) {
        out.buffer = "no organization";
        row("buffer", "auth", "auth_status", 0, "no-org");
      } else {
        const orgId = orgs[0].id;
        const chR = await gql('{ channels(input: { organizationId: "' + orgId + '" }) { id service isDisconnected } }');
        const channels = chR && chR.data && chR.data.channels || [];
        let posts = 0, metrics = 0;
        const bySvc = {};
        for (const ch of channels) {
          if (ch.isDisconnected) continue;
          try {
            const pR = await gql('query { posts(first: 20, input: { organizationId: "' + orgId + '", filter: { status: [sent], channelIds: ["' + ch.id + '"] } }) { edges { node { id channelId metrics { type name value unit } } } } }');
            const edges = pR && pR.data && pR.data.posts && pR.data.posts.edges || [];
            for (const e of edges) {
              const node = e && e.node;
              if (!node) continue;
              posts++;
              for (const m of node.metrics || []) {
                metrics++;
                row("buffer", String(node.id), String(m.name || m.type || "metric"), Number(m.value) || 0, String(m.type || "") + (m.unit ? "/" + m.unit : ""));
              }
              bySvc[ch.service] = (bySvc[ch.service] || 0) + 1;
            }
          } catch (e2) {
          }
        }
        out.buffer = { channels: channels.length, posts, metrics, by_service: bySvc };
        row("buffer", "auth", "auth_status", 1, "ok (graphql)");
      }
    }
  } catch (e) {
    out.buffer = "error: " + String(e && e.message || e);
    row("buffer", "auth", "auth_status", 0, String(e && e.message || e).slice(0, 80));
  }
  try {
    if (stmts.length) {
      const batch = stmts.slice(0, 100);
      await env.AUDIT.batch(batch);
      out.rows_written = batch.length;
      out.rows_total = stmts.length;
    } else out.rows_written = 0;
  } catch (e) {
    out.write_error = String(e && e.message || e);
  }
  // SENT-AS-YOU-DIGEST-1 (#1713): the daily owner-voice ledger rides this daily tick (no new cron; the fleet is over
  // its 50-schedule cap). Independent of the collectors above: a Bluesky or Buffer failure never suppresses it.
  try {
    out.sent_as_you = await sentAsYouDigest(env);
  } catch (e) {
    out.sent_as_you = "error: " + String(e && e.message || e).slice(0, 160);
  }
  return { status: "ok", notes: out };
}
__name(jobEngagement, "jobEngagement");
// SENT-AS-YOU-DIGEST-1 (2026-10-01, agent_issues #1713, docs/STRATEGY.md s5 gate 7): once a day, every item the fleet
// sent in the owner's name in the last 24h (Bluesky threads and cross-posts, dissemination posts, cold-outreach emails
// from both engines, replies sent by qnfo-email) plus the LinkedIn drafts waiting in Buffer and the state of both kill
// switches, stored as a cloud_ops_events digest and mailed to the owner. The one-line stop command names the
// owner-voice-stop job below.
// SENT-AS-YOU-DELIVERY-1 (1.18.0): delivery went through qnfo-email /send, which needs that worker's API key in this
// worker's EMAIL_API_KEY secret; the secret is not set, so every run since 1.16.3 stored the digest and logged "skipped: no
// EMAIL binding or key". This worker already holds a working send path, the SEND_EMAIL Email Service binding that the
// outreach job mails with; sendDigest uses it from alerts@qnfo.org. The digest now goes through sendDigest to the owner's
// own qnfo.org address (the only recipient; the 2026-09-02 directive keeps digests off personal-domain mailboxes, and
// sendDigest refuses those), at most once per UTC day (scheduler_state sent_as_you_delivered_day). No new secret.
var OWNER_VOICE_TO = "rowan.quni@qnfo.org";
var OWNER_VOICE_DELIVERED_KEY = "sent_as_you_delivered_day";
var OWNER_VOICE_STOP_LINE = "STOP everything sent as you: run cloud-ops job owner-voice-stop (POST https://qnfo-cloud-ops.q08.workers.dev/run?job=owner-voice-stop with the ops admin token), or reply to this email with 'pause outreach and social' (owner sender; the ops agent executes). Resume with owner-voice-resume.";
async function ownerVoiceFlags(env) {
  const f = { social_paused: "0", external_sends_enabled: "?" };
  try {
    const r = await env.AUDIT.prepare("SELECT value FROM pipeline_flags WHERE key='social_paused'").first();
    f.social_paused = r && r.value != null ? String(r.value) : "0";
  } catch (e) {
    f.social_paused = "?";
  }
  try {
    if (env.OUTREACH) {
      const r = await env.OUTREACH.prepare("SELECT value FROM pipeline_state WHERE key='external_sends_enabled'").first();
      f.external_sends_enabled = r && r.value != null ? String(r.value) : "1";
    }
  } catch (e) {
  }
  return f;
}
__name(ownerVoiceFlags, "ownerVoiceFlags");
async function sentAsYouDigest(env) {
  const now = /* @__PURE__ */ new Date();
  const today = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 24 * 36e5).toISOString().slice(0, 19).replace("T", " ");
  const items = [];
  const errs = {};
  const q = /* @__PURE__ */ __name(async (label, db, sql, map) => {
    if (!db) { errs[label] = "no binding"; return; }
    try {
      const r = await db.prepare(sql).bind(since).all();
      for (const row of r.results || []) items.push(map(row));
    } catch (e) {
      errs[label] = String(e && e.message || e).slice(0, 120);
    }
  }, "q");
  // social_threads.post_uri is added lazily by qnfo-social (POST-ID-UTM-1); fall back when the column is absent.
  try {
    const r = await env.AUDIT.prepare("SELECT slug, title, posted_at, post_uri FROM social_threads WHERE status='posted' AND datetime(posted_at) >= datetime(?1) ORDER BY posted_at").bind(since).all();
    for (const row of r.results || []) items.push({ kind: "social-thread", when: row.posted_at, what: String(row.title || row.slug || "").slice(0, 120), where: String(row.post_uri || "") });
  } catch (e) {
    await q("social_threads", env.AUDIT, "SELECT slug, title, posted_at FROM social_threads WHERE status='posted' AND datetime(posted_at) >= datetime(?1) ORDER BY posted_at", (row) => ({ kind: "social-thread", when: row.posted_at, what: String(row.title || row.slug || "").slice(0, 120), where: "" }));
  }
  await q("dissemination", env.AUDIT, "SELECT channel, paper_slug, post_url, posted_at FROM dissemination_tracker WHERE action='posted' AND datetime(posted_at) >= datetime(?1) ORDER BY posted_at", (row) => ({ kind: "post:" + row.channel, when: row.posted_at, what: String(row.paper_slug || "").slice(0, 120), where: String(row.post_url || "") }));
  await q("outreach_log", env.AUDIT, "SELECT email, subject, sent_at, status FROM outreach_log WHERE datetime(sent_at) >= datetime(?1) ORDER BY sent_at", (row) => ({ kind: "email:cloud-ops" + (row.status && row.status !== "sent" && row.status !== "ok" ? ":" + row.status : ""), when: row.sent_at, what: String(row.subject || "").slice(0, 120), where: String(row.email || "") }));
  await q("outreach_sends", env.OUTREACH, "SELECT s.kind, s.subject, s.sent_at, c.email FROM sends s LEFT JOIN contacts c ON c.id = s.contact_id WHERE s.status='sent' AND datetime(s.sent_at) >= datetime(?1) ORDER BY s.sent_at", (row) => ({ kind: "email:qnfo-outreach/" + row.kind, when: row.sent_at, what: String(row.subject || "").slice(0, 120), where: String(row.email || "") }));
  await q("email_replies", env.AUDIT, "SELECT sender, subject, sent_at FROM email_reply_queue WHERE sent_at IS NOT NULL AND datetime(sent_at) >= datetime(?1) ORDER BY sent_at", (row) => ({ kind: "reply:qnfo-email", when: row.sent_at, what: String(row.subject || "").slice(0, 120), where: String(row.sender || "") }));
  let drafts = "unavailable";
  if (env.BUFFER_TOKEN) {
    try {
      const gql = /* @__PURE__ */ __name(async (query) => {
        const r = await fetch("https://api.buffer.com", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.BUFFER_TOKEN, "User-Agent": "qnfo-cloud-ops/" + VERSION }, body: JSON.stringify({ query }) });
        if (!r.ok) throw new Error("buffer http " + r.status);
        return r.json();
      }, "gql");
      const orgR = await gql("{ account { organizations { id } } }");
      const orgs = orgR && orgR.data && orgR.data.account && orgR.data.account.organizations || [];
      if (!orgs.length) drafts = "no organization";
      else {
        const pR = await gql('query { posts(first: 20, input: { organizationId: "' + orgs[0].id + '", filter: { status: [draft] } }) { edges { node { id channelId } } } }');
        if (pR && pR.errors && pR.errors.length) drafts = "error: " + String(pR.errors[0].message || "").slice(0, 80);
        else drafts = String((pR && pR.data && pR.data.posts && pR.data.posts.edges || []).length);
      }
    } catch (e) {
      drafts = "error: " + String(e && e.message || e).slice(0, 80);
    }
  } else drafts = "no token";
  const flags = await ownerVoiceFlags(env);
  // Sources mix 'YYYY-MM-DD HH:MM:SS' and ISO 'YYYY-MM-DDTHH:MM:SS.sssZ'; normalise before sorting or ' ' sorts before 'T'.
  for (const it of items) it.when = String(it.when || "").replace("T", " ").slice(0, 16);
  items.sort((a, b) => a.when.localeCompare(b.when));
  // ASCII separator: the literal dash this subject carried reached D1 as mojibake (docs/STRATEGY.md s5 gate 3).
  const subject = "QNFO sent as you - " + today + " (" + items.length + " item" + (items.length === 1 ? "" : "s") + ")";
  const L = [subject, "", "Everything the fleet sent in your name since " + since + " UTC:"];
  if (!items.length) L.push("- nothing");
  for (const it of items.slice(0, 80)) L.push("- " + it.when + "  " + it.kind + "  " + it.what + (it.where ? "  -> " + it.where : ""));
  if (items.length > 80) L.push("- ... and " + (items.length - 80) + " more");
  L.push("", "LinkedIn drafts waiting for your approval in Buffer: " + drafts);
  L.push("Kill switches: social_paused=" + flags.social_paused + " (qnfo-social), external_sends_enabled=" + flags.external_sends_enabled + " (both email engines)");
  // OUTREACH-LEARNER-1: today's learner tick (it runs just before this digest, in the same daily slot).
  try {
    const t = await env.AUDIT.prepare("SELECT status, meta FROM cloud_ops_events WHERE id = ?1").bind("ol-tick-" + today).first();
    if (t && t.meta) {
      const m = JSON.parse(t.meta);
      const mm = m.metrics || {};
      L.push("Outreach learner (" + (m.enabled ? "on" : "off: oldest-first order") + ", " + t.status + "): reply rate 30d " + (mm.outreach_reply_rate_30d == null ? "?" : mm.outreach_reply_rate_30d + "% (" + mm.positive_to_sends_30d + " of " + mm.sends_30d + ")") + ", warm conversations 30d " + (mm.warm_conversations_30d == null ? "?" : mm.warm_conversations_30d) + ", stopped segments: " + ((m.stopped || []).join(", ") || "none") + ". Switch: ops_config " + LEARNER_SWITCH_KEY + ".");
    } else L.push("Outreach learner: no tick recorded today");
  } catch (e) {
    L.push("Outreach learner: tick unreadable");
  }
  const ek = Object.keys(errs);
  if (ek.length) L.push("Sources not read: " + ek.map((k) => k + " (" + errs[k] + ")").join("; "));
  L.push("", OWNER_VOICE_STOP_LINE);
  const text = L.join(NL);
  const stored = await storeDigest(env, "sent-as-you", subject, text);
  let delivered = null, messageId = null;
  try {
    const last = await stateGet(env, OWNER_VOICE_DELIVERED_KEY, "");
    if (last === today) delivered = "skipped: already delivered " + today;
    else {
      const r = await sendDigest(env, subject, text, OWNER_VOICE_TO);
      if (r && r.ok) {
        delivered = "ok";
        messageId = r.messageId || null;
        await stateSet(env, OWNER_VOICE_DELIVERED_KEY, today);
      } else delivered = (r && r.skipped ? "skipped: " + r.skipped : "error: " + String(r && r.error || "unknown")).slice(0, 140);
    }
  } catch (e) {
    delivered = "error: " + String(e && e.message || e).slice(0, 120);
  }
  return { items: items.length, drafts, flags, delivered, to: OWNER_VOICE_TO, message_id: messageId, stored: !!(stored && stored.stored), errors: ek.length ? errs : void 0 };
}
__name(sentAsYouDigest, "sentAsYouDigest");
// OWNER-VOICE-STOP-1 (#1713): one deterministic switch for both streams. Not scheduled; run on demand (/run?job=...).
async function setOwnerVoice(env, paused) {
  const out = { social_paused: null, external_sends_enabled: null };
  try {
    await env.AUDIT.prepare("INSERT INTO pipeline_flags (key, value, updated_at) VALUES ('social_paused', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(paused ? "1" : "0").run();
    out.social_paused = paused ? "1" : "0";
  } catch (e) {
    out.social_paused = "error: " + String(e && e.message || e).slice(0, 120);
  }
  try {
    if (!env.OUTREACH) throw new Error("no OUTREACH binding");
    await env.OUTREACH.prepare("INSERT INTO pipeline_state (key, value, updated_at) VALUES ('external_sends_enabled', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(paused ? "0" : "1").run();
    out.external_sends_enabled = paused ? "0" : "1";
  } catch (e) {
    out.external_sends_enabled = "error: " + String(e && e.message || e).slice(0, 120);
  }
  const ok = !/^error/.test(String(out.social_paused)) && !/^error/.test(String(out.external_sends_enabled));
  await recordEvent(env, "owner-voice", "ov-" + (paused ? "stop" : "resume") + "-" + Date.now().toString(36), "owner voice " + (paused ? "STOPPED" : "resumed") + " " + JSON.stringify(out), { job: paused ? "owner-voice-stop" : "owner-voice-resume", status: ok ? "ok" : "partial" });
  return { status: ok ? "ok" : "partial", notes: out };
}
__name(setOwnerVoice, "setOwnerVoice");
async function jobOwnerVoiceStop(env) {
  return setOwnerVoice(env, true);
}
__name(jobOwnerVoiceStop, "jobOwnerVoiceStop");
async function jobOwnerVoiceResume(env) {
  return setOwnerVoice(env, false);
}
__name(jobOwnerVoiceResume, "jobOwnerVoiceResume");
async function jobGtdReconcile(env) {
  try {
    const open = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM v_fleet_open_work").first();
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const odRows = await env.AUDIT.prepare("SELECT id, owner, due FROM task_dod_register WHERE due IS NOT NULL AND due != '' AND due < ? AND status = 'open' AND owner IN ('agent','scheduled-runner','fleet') ORDER BY due LIMIT 80").bind(today).all();
    const ods = odRows && odRows.results || [];
    const tag = /* @__PURE__ */ __name(function(o) {
      return o === "scheduled-runner" ? "sched" : o === "agent" ? "ag" : o;
    }, "tag");
    const ids = ods.map(function(r) {
      return r.id + ":" + tag(String(r.owner || ""));
    }).join(",");
    const overdueTotal = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM v_fleet_open_work WHERE due < ?").bind(today).first();
    const overdueN = overdueTotal && overdueTotal.n || 0;
    const human = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM v_waiting_on_human").first();
    const noDod = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM v_open_tasks_no_dod").first();
    const line = "GTD reconcile: open=" + (open && open.n || 0) + " overdue=" + overdueN + (ids ? " overdue_ids=" + ids : "") + " waiting_on_human=" + (human && human.n || 0) + " no_dod=" + (noDod && noDod.n || 0);
    await recordEvent(env, "gtd-reconcile", "gr-" + Date.now().toString(36), line, { job: "gtd-reconcile" });
    return { status: "ok", open: open && open.n || 0, overdue: overdueN, overdue_ids: ods.map(function(r) {
      return r.id;
    }), waiting_on_human: human && human.n || 0, no_dod: noDod && noDod.n || 0 };
  } catch (e) {
    return { status: "error", error: String(e).slice(0, 200) };
  }
}
__name(jobGtdReconcile, "jobGtdReconcile");
async function jobQualityScore(env) {
  const NLc = String.fromCharCode(10), TBc = String.fromCharCode(9), BQc = String.fromCharCode(96);
  const litRe = new RegExp("#{1,4}[^" + NLc + "]*(prior work|related work|literature review)", "i");
  const doiRe = new RegExp("10[.][0-9]{4,9}/", "g");
  const axRe = new RegExp("(?:arxiv[.]org/|arXiv:[" + NLc + TBc + " ]*[0-9]{4}[.][0-9]{4,5})", "gi");
  const tableRe = new RegExp("^[" + NLc + TBc + " ]*[|][-:| ]+[|]", "m");
  try {
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS quality_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, slug TEXT, status TEXT, body_len INTEGER, refs INTEGER, lit INTEGER, verif INTEGER, score INTEGER, flag TEXT)").run();
    const rows = await env.LIVING.prepare("SELECT slug, status, body_md FROM papers WHERE status='published'").all();
    const list = rows && rows.results || [];
    const stmts = [];
    let flagged = 0;
    for (const p of list) {
      const md = String(p.body_md || "");
      const len = md.length;
      const lit = litRe.test(md) ? 1 : 0;
      const refs = (md.match(doiRe) || []).length + (md.match(axRe) || []).length;
      const verif = md.indexOf(BQc + BQc + BQc) >= 0 || tableRe.test(md) ? 1 : 0;
      const score = Math.min(100, Math.min(len / 100, 40) + Math.min(refs * 3, 30) + lit * 15 + verif * 15);
      const flag = score < 25 ? "quarantine-candidate" : score < 50 ? "thin" : "";
      if (flag === "quarantine-candidate") flagged++;
      stmts.push(env.AUDIT.prepare("INSERT INTO quality_scores (ts, slug, status, body_len, refs, lit, verif, score, flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind((/* @__PURE__ */ new Date()).toISOString().slice(0, 10), p.slug, p.status, len, refs, lit, verif, score, flag));
    }
    let wrote = 0;
    if (stmts.length) {
      const batch = stmts.slice(0, 200);
      await env.AUDIT.batch(batch);
      wrote = batch.length;
    }
    await recordEvent(env, "quality-score", "qs-" + Date.now().toString(36), "quality sweep: scanned=" + list.length + " rows=" + wrote + " quarantine_candidates=" + flagged, { job: "quality-score" });
    return { status: "ok", scanned: list.length, rows: wrote, quarantine_candidates: flagged };
  } catch (e) {
    return { status: "error", error: String(e).slice(0, 200) };
  }
}
__name(jobQualityScore, "jobQualityScore");
async function jobGtdOverdueGuard(env) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const execCite = /\b(?:executor|worker)\s*=/i;
  const runCite = /\b(?:job|cron|schedule|task)\s*=/i;
  const agentCite = /executor=ops-session|owner=agent/i;
  const out = { overdue: [], no_executor: [], agent_uncited: [] };
  try {
    const open = await env.AUDIT.prepare("SELECT id, due, owner, status, COALESCE(evidence_pointer,'') AS ev, COALESCE(source_table,'') AS st, COALESCE(source_row_id,'') AS srid FROM task_dod_register WHERE status='open' ORDER BY due").all();
    const rows = open && open.results || [];
    for (const r of rows) {
      const ev = String(r.ev || "");
      const ow = String(r.owner || "");
      const due = String(r.due || "");
      const overdue = !!due && due < today;
      const item = { id: r.id, owner: ow, due: due || null, src: String(r.st || "") + "/" + String(r.srid || "") };
      if (ow === "scheduled-runner" || ow === "fleet") {
        if (!(execCite.test(ev) && runCite.test(ev))) out.no_executor.push(item);
        else if (overdue) out.overdue.push(item);
      } else if (ow === "agent") {
        if (overdue) out.overdue.push(item);
        else if (!ev.trim() || !agentCite.test(ev)) out.agent_uncited.push(item);
      } else if (overdue) {
        out.overdue.push(item);
      }
    }
  } catch (e) {
    return { status: "error", error: String(e).slice(0, 300) };
  }
  // REGISTER-RELABEL-1 (folded from qnfo-register-guard 1.0.0, never deployed): a scheduled-runner/fleet row that cites
  // no executor and no run trigger has no scheduled executor, so it is relabeled owner='agent' (the interactive agent
  // executes it) instead of being re-reported every day. The row stays open; only the false owner claim is corrected.
  let relabeled = 0;
  if (out.no_executor.length) {
    const tag = " [relabeled agent " + today + ": no executor+run citation]";
    try {
      const stmts = out.no_executor.slice(0, 100).map(function(x) {
        return env.AUDIT.prepare("UPDATE task_dod_register SET owner='agent', evidence_pointer=COALESCE(evidence_pointer,'') || ?1, updated_at=datetime('now') WHERE id=?2 AND status='open' AND owner IN ('scheduled-runner','fleet')").bind(tag, x.id);
      });
      const res = await env.AUDIT.batch(stmts);
      for (const r of res || []) relabeled += r && r.meta && r.meta.changes || 0;
    } catch (e) {
    }
  }
  const alert = out.overdue.length > 0 || out.no_executor.length > relabeled;
  const summary = "register guard: overdue=" + out.overdue.length + " scheduled_no_executor=" + out.no_executor.length + " relabeled_agent=" + relabeled + " agent_uncited=" + out.agent_uncited.length;
  let mail = null;
  if (alert) {
    const text = "QNFO task_dod_register guard " + today + NL + "OVERDUE (" + out.overdue.length + "): " + out.overdue.map(function(x) {
      return "#" + x.id + " " + x.owner + " due " + (x.due || "-");
    }).slice(0, 30).join("; ") + NL + "SCHEDULED WITHOUT EXECUTOR CITATION (" + out.no_executor.length + "): " + out.no_executor.map(function(x) {
      return "#" + x.id + " " + x.owner + " due " + (x.due || "-");
    }).slice(0, 30).join("; ");
    mail = await sendDigest(env, "QNFO register guard: " + out.overdue.length + " overdue / " + out.no_executor.length + " no-executor", text);
  }
  await recordEvent(env, "gtd-overdue-guard", "gog-" + Date.now().toString(36), summary + " " + JSON.stringify(out).slice(0, 1200), { job: "overdue-guard", status: alert ? "alerted" : "clean", mail: mail || {} });
  return { status: "ok", today, overdue: out.overdue, no_executor: out.no_executor, relabeled, agent_uncited: out.agent_uncited, alerted: alert, mail };
}
__name(jobGtdOverdueGuard, "jobGtdOverdueGuard");
var JOBS = {
  "gtd-reconcile": jobGtdReconcile,
  "overdue-guard": jobGtdOverdueGuard,
  "quality-score": jobQualityScore,
  "email-triage": jobEmailTriage,
  "gmail-triage": jobGmailTriage,
  "briefing": jobBriefing,
  "research-scan": jobResearchScan,
  "weekly": jobWeekly,
  "weekly-ops": jobWeeklyOps,
  "portfolio-sync": jobPortfolioSync,
  "zenodo-stats": jobZenodoStats,
  "board-sync": jobBoardSync,
  "release-check": jobReleaseCheck,
  "nlnet": jobNlnet,
  "outreach": jobOutreach,
  "backfill": jobBackfill,
  "worker-health": jobWorkerHealth,
  "sitemap-ping": jobSitemapPing,
  "loose-threads-sweep": jobLooseThreadsSweep,
  "visibility": jobVisibility,
  "engagement": jobEngagement,
  "owner-voice-stop": jobOwnerVoiceStop,
  "owner-voice-resume": jobOwnerVoiceResume,
  "radar": jobRadar,
  "grant-followup": jobGrantFollowup,
  "outreach-learner": jobOutreachLearner
};
// GRANT-FOLLOWUP-1: a job that rides another job's cron slot, because the dispatch map holds one job per cron and a new
// cron would count against the account cap (charter rule 2). Companions run first, each in its own try and logged under
// its own name, so neither job can stop or hide the other. worker-health fires twice a day, every day (05:05 and 17:05
// Amsterdam). OUTREACH-LEARNER-1 (1.18.0): outreach-learner rides the daily engagement slot (07:15 Amsterdam, every day)
// and runs before it, so the sent-as-you digest inside engagement reports that day's learner tick.
var CRON_COMPANIONS = { "worker-health": ["grant-followup"], "engagement": ["outreach-learner"] };
async function runCompanion(env, job) {
  try {
    const out = await JOBS[job](env);
    await logRun(env, job, out.status, out.notes || {});
    await recordEvent(env, "job-run", "jr-" + job + "-" + Date.now().toString(36), job + " " + out.status + " " + JSON.stringify(out.notes || {}).slice(0, 300), { job, status: out.status });
  } catch (e) {
    await logRun(env, job, "error", { error: String(e && e.message || e) });
    await recordEvent(env, "job-run", "jr-" + job + "-" + Date.now().toString(36), job + " error " + String(e && e.message || e), { job, status: "error" });
  }
}
function cfDowToIso(spec) {
  const s = String(spec == null ? "*" : spec).trim();
  if (s === "*" || s === "") return "*";
  const conv = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return n;
    return String((v - 2 + 7) % 7 + 1);
  };
  return s.split(",").map((part) => {
    const p = part.trim();
    const m = /^(\d+)-(\d+)$/.exec(p);
    if (m) return conv(m[1]) + "-" + conv(m[2]);
    if (/^\d+$/.test(p)) return conv(p);
    return p;
  }).join(",");
}
__name(cfDowToIso, "cfDowToIso");
function dispatchMap(offset) {
  const map = {};
  const all = buildCrons(offset);
  for (const c of all) map[c.cron] = c.job;
  /* CRON-ALIAS-DISPATCH-1 (#1500): a trigger list written before the #1473
     ISO->CF day-of-week fix still fires ISO-spelled crons (e.g. "30 5 * * 1").
     Register that spelling as an alias so a stale registration dispatches its
     job instead of silently returning "no job for cron". */
  for (const c of all) {
    const p = String(c.cron).split(" ");
    if (p.length === 5 && p[4] !== "*") {
      const iso = p.slice();
      iso[4] = cfDowToIso(p[4]);
      const alt = iso.join(" ");
      if (alt && !(alt in map)) map[alt] = c.job;
    }
  }
  return map;
}
__name(dispatchMap, "dispatchMap");
// RADAR-TRUTHFUL-1 (2026-10-01, #1641 EXTERNAL-MENTION-MONITOR-EMPTY-1): the radar reported scanned=0 every day and
// external_mentions was never written. Three of its causes were defects, not an absence of mentions:
//   - HN used tags=comment,story. Algolia treats a comma as AND, so it asked for items that are both a comment and a
//     story, which can never match. It now uses tags=(story,comment), plus a url search for qnfo.org.
//   - lobste.rs /search.json returns 400 "Unpermitted query or form parameter". The radar now reads the domain feed
//     /domains/qnfo.org.rss, where 404 means the domain was never submitted and counts as 0, not as an error.
//   - Every fetch error was swallowed, so a dead source looked like "no mentions".
// The fix:
//   - Each source's outcome is reported in notes.sources as ok:<n>, http:<status> or error:<msg>.
//   - Algolia is typo-tolerant and matches inside tokens (a YouTube id "QnfOOoTOrDE" was a hit), so only hits with "qnfo"
//     as a whole word are kept.
//   - First citations (OpenAlex cited_by_count > 0 in citation_stats, written by qnfo-paper-indexer) are recorded as
//     source=openalex-citation, so being cited reaches the mention plane.
async function jobRadar(env) {
  const mentions = [], sources = {};
  const ua = { headers: { "User-Agent": "QNFO-radar/1.0" } };
  const lit = (s) => /\bqnfo\b/i.test(String(s || ""));
  const err = (e) => "error:" + String(e && e.message || e).slice(0, 80);
  try {
    let n = 0;
    for (const q of [
      "https://hn.algolia.com/api/v1/search?query=qnfo&tags=(story,comment)&hitsPerPage=50&typoTolerance=false",
      "https://hn.algolia.com/api/v1/search?query=qnfo.org&restrictSearchableAttributes=url&hitsPerPage=50&typoTolerance=false"
    ]) {
      const r = await fetch(q, ua);
      if (!r.ok) throw new Error("http " + r.status);
      const j = await r.json();
      for (const h of j.hits || []) {
        const url = h.story_url || h.url || "https://news.ycombinator.com/item?id=" + h.objectID;
        if (!lit(h.title) && !lit(h.story_title) && !lit(url) && !lit(h.comment_text) && !lit(h.story_text)) continue;
        mentions.push({ source: "hn", title: String(h.title || h.story_title || "comment").slice(0, 180), url: h.comment_text ? "https://news.ycombinator.com/item?id=" + h.objectID : url, author: h.author || "", score: h.points || 0, created: h.created_at || "" });
        n++;
      }
    }
    sources.hn = "ok:" + n;
  } catch (e) { sources.hn = err(e); }
  try {
    const r = await fetch("https://lobste.rs/domains/qnfo.org.rss", ua);
    if (r.status === 404) sources.lobsters = "ok:0";
    else if (!r.ok) sources.lobsters = "http:" + r.status;
    else {
      const xml = await r.text();
      const items = xml.split("<item>").slice(1);
      for (const it of items) {
        const tag = (t) => { const m = new RegExp("<" + t + ">([\\s\\S]*?)</" + t + ">").exec(it); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : ""; };
        mentions.push({ source: "lobsters", title: tag("title").slice(0, 180), url: tag("link"), author: tag("author"), score: 0, created: tag("pubDate") });
      }
      sources.lobsters = "ok:" + items.length;
    }
  } catch (e) { sources.lobsters = err(e); }
  try {
    const r = await fetch("https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=activity&q=qnfo&site=stackoverflow&pagesize=20", ua);
    if (!r.ok) sources.stackexchange = "http:" + r.status;
    else {
      const j = await r.json();
      let n = 0;
      for (const it of j.items || []) {
        mentions.push({ source: "stackexchange", title: String(it.title || "").slice(0, 180), url: it.link || "", author: it.owner && it.owner.display_name || "", score: it.score || 0, created: it.creation_date ? new Date(it.creation_date * 1e3).toISOString() : "" });
        n++;
      }
      sources.stackexchange = "ok:" + n;
    }
  } catch (e) { sources.stackexchange = err(e); }
  try {
    const cr = await env.AUDIT.prepare("SELECT doi, MAX(value) AS cites, MAX(collected_at) AS at FROM citation_stats WHERE source = 'openalex' AND metric = 'cited_by_count' AND collected_at >= ?1 GROUP BY doi HAVING MAX(value) > 0").bind(new Date(Date.now() - 3 * 864e5).toISOString()).all();
    const rows = cr.results || [];
    for (const c of rows) mentions.push({ source: "openalex-citation", title: "cited_by_count=" + c.cites + " for " + c.doi, url: "https://doi.org/" + c.doi, author: "", score: Number(c.cites) || 0, created: c.at || "" });
    sources.citations = "ok:" + rows.length;
  } catch (e) { sources.citations = err(e); }
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS external_mentions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, title TEXT, url TEXT, author TEXT, score INTEGER, created TEXT, first_seen TEXT, UNIQUE(source, url))").run();
  let added = 0;
  for (const m of mentions) {
    try {
      const r = await env.AUDIT.prepare("INSERT OR IGNORE INTO external_mentions (ts, source, title, url, author, score, created, first_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind((/* @__PURE__ */ new Date()).toISOString(), m.source, m.title, m.url, m.author, m.score, m.created, (/* @__PURE__ */ new Date()).toISOString()).run();
      if (r && r.meta && r.meta.changes) added += r.meta.changes;
    } catch (e) {
    }
  }
  const vals = Object.values(sources), healthy = vals.filter((v) => v.indexOf("ok:") === 0).length;
  return { status: healthy === 0 ? "error" : healthy < vals.length ? "degraded" : "ok", notes: { scanned: mentions.length, new_mentions: added, sources } };
}
__name(jobRadar, "jobRadar");
// GRANT-FOLLOWUP-1 begin
// GRANT-FOLLOWUP-1 (2026-10-02, pillar: reach; agent_issues 1750 LIGHTCONE-APP-EMPTY-1). Funders answer applications by
// mail, and no loop read those answers. On 2026-10-02 qnfo-audit.emails held an EA Funds reply of 2026-08-19
// (email_reply_queue 'escalate', never drafted) and an Emergent Ventures reply of 2026-08-13, while
// funding/APPLICATIONS.md still read "awaiting response". IDENTITY-WEEKLY-1 looks back only 8 days, by subject keyword,
// reads no Gmail and files no issue. This job reads two mailboxes, read-only:
//   - qnfo-audit.emails: what qnfo-email received for qnfo.org and qwav.tech, the addresses most applications used;
//   - Gmail (the Lightcone Commons account) over IMAP: the folder flagged \All ("All Mail", so mail that gmail-triage or a
//     person moved out of INBOX is still seen), opened with EXAMINE, headers fetched with BODY.PEEK. It never sends,
//     moves, deletes or flags mail.
// A message counts when its sender's domain belongs to a submitted application below and it is dated on or after the
// submission. Each new one becomes one cloud_ops_events row (id 'grant-reply-<message-id>', kind 'grant-reply', status
// = reply | message | receipt) holding the application, sender, subject, date, message-id and where to read it; body text
// is never stored. Every reply or message without an issue then opens or extends that application's agent_issues row
// (an application with a tracking issue, Lightcone 1750, gets the note there while it is open). Bulk mail (List-Id,
// List-Unsubscribe, Precedence: bulk) is skipped unless its subject reads like a decision. Status 'ok' needs both
// mailboxes read: without the GMAIL_PASS secret the job reports 'degraded' and Gmail is not watched.
// A new application is added here in the same PR that records its submission in funding/APPLICATIONS.md.
var GRANT_APPLICATIONS = [
  { key: "manifund", funder: "Manifund", submitted: "2026-08-13", domains: ["manifund.org"] },
  { key: "ea-funds-ltff", funder: "EA Funds (LTFF)", submitted: "2026-08-13", domains: ["effectivealtruism.com", "effectivealtruism.org"], handled_through: "2026-10-01", handled_note: "reply of 2026-08-19 (pitch out of scope) already recorded in funding/APPLICATIONS.md and the identity doc" },
  { key: "filecoin-devgrants", funder: "Filecoin Foundation Open Grants", submitted: "2026-08-13", domains: ["fil.org"] },
  { key: "emergent-ventures", funder: "Emergent Ventures (Mercatus Center)", submitted: "2026-08-13", domains: ["mercatus.gmu.edu", "mercatus.org"], handled_through: "2026-10-01", handled_note: "reply of 2026-08-13 (only the web form counts) already recorded in funding/APPLICATIONS.md and the identity doc" },
  { key: "foresight-ai-nodes", funder: "Foresight Institute (AI for Science & Safety Nodes)", submitted: "2026-10-01", domains: ["foresight.org"] },
  { key: "lightcone-corrigibility", funder: "Corrigibility Research Fund via Lightcone Commons", submitted: "2026-10-01", domains: ["lightconeinfrastructure.com", "lightconecommons.com", "lightconecommons.org"], issue: 1750 }
];
// handled_through (YYYY-MM-DD): replies dated on or before it were already read and acted on before this loop existed; they
// are recorded with status 'handled' (never filed as a new issue), so only later replies become GRANT-REPLY issues.
var GRANT_WINDOW_DAYS = 240;
var GRANT_MAX_PER_APP = 50;
var GRANT_MAX_ISSUE_WRITES = 10;
var GRANT_HEADER_FIELDS = "FROM SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES LIST-ID LIST-UNSUBSCRIBE PRECEDENCE";
var GRANT_RECEIPT_RX = /thank(s| you) for (your )?(submission|submitting|applying|application)|application (has been |was )?(received|submitted)|submission (has been |was )?(received|confirmed)|we('ve| have) received your|confirmation of (your )?(submission|application)|\breceipt\b/i;
var GRANT_DECISION_RX = /decision|award|funded|grant (offer|agreement)|unfortunately|not (been )?selected|regret|accepted|declined|shortlist|next (round|stage|step)|interview|question/i;
var GRANT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var GRANT_DOD = "Definition of done: read the message where it lives, then act: answer it through the owner-voice gates (docs/STRATEGY.md section 5, OUTREACH-CONSENT-1; mail sent as the owner is tier 2), or, when it needs the owner's own decision, file one fleet.qnfo.org queue card; update funding/APPLICATIONS.md; close with issue_triage.close_evidence naming the message-id and what was done. Filed by qnfo-cloud-ops GRANT-FOLLOWUP-1.";
function grantAddress(s) {
  const t = String(s || "");
  const m = /<\s*([^<>\s@]+@[^<>\s]+?)\s*>/.exec(t) || /([^\s<>"'(),;:]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(t);
  return m ? m[1].toLowerCase() : "";
}
function grantDomain(addr) {
  const a = String(addr || "").toLowerCase();
  const i = a.lastIndexOf("@");
  return i < 0 ? "" : a.slice(i + 1).replace(/[^a-z0-9.-]/g, "");
}
function grantDomainIn(dom, list) {
  return !!dom && list.some((d) => dom === d || dom.endsWith("." + d));
}
function grantMsgId(s) {
  return String(s || "").trim().replace(/^<+|>+$/g, "").slice(0, 250);
}
function grantIso(s) {
  if (s == null || s === "") return null;
  let v = String(s).trim().replace(/\s*\([^)]*\)\s*$/, "");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) v = v.replace(" ", "T") + "Z";
  const t = Date.parse(v);
  return isNaN(t) ? null : new Date(t).toISOString();
}
function grantIsList(listId, unsub, precedence) {
  return !!(listId || unsub) || /bulk|list|junk/i.test(String(precedence || ""));
}
function grantActive(app, nowMs) {
  const t = Date.parse(app.submitted + "T00:00:00Z");
  return !isNaN(t) && nowMs >= t && nowMs - t <= GRANT_WINDOW_DAYS * 864e5;
}
// The application a message answers, or null: sender (From header or envelope) on one of its domains, dated on or after
// the submission day.
function grantMatch(apps, rec) {
  for (const app of apps) {
    if (!grantDomainIn(grantDomain(rec.from), app.domains) && !grantDomainIn(grantDomain(rec.envelope), app.domains)) continue;
    if (rec.date && rec.date.slice(0, 10) < app.submitted) continue;
    return app;
  }
  return null;
}
// reply: part of a thread we started; receipt: an automatic acknowledgement; message: anything else from the funder;
// bulk: list or newsletter mail without a decision-like subject (skipped).
function grantKind(rec) {
  const s = String(rec.subject || "");
  if (rec.in_reply || /^\s*(re|aw|sv|antw)\s*:/i.test(s)) return "reply";
  if (rec.list) return GRANT_DECISION_RX.test(s) ? "message" : "bulk";
  if (GRANT_RECEIPT_RX.test(s)) return "receipt";
  return "message";
}
function grantImapDate(ms) {
  const d = new Date(ms);
  return d.getUTCDate() + "-" + GRANT_MONTHS[d.getUTCMonth()] + "-" + d.getUTCFullYear();
}
// IMAP search keys are ANDed; OR is binary prefix, so n domains take n-1 leading ORs.
function grantImapSearch(app) {
  const keys = app.domains.map((d) => 'FROM "' + String(d).replace(/[^A-Za-z0-9.-]/g, "") + '"');
  return "SINCE " + grantImapDate(Date.parse(app.submitted + "T00:00:00Z")) + " " + "OR ".repeat(Math.max(0, keys.length - 1)) + keys.join(" ");
}
function grantImapQuote(s) {
  return '"' + String(s).replace(/(["\\])/g, "\\$1") + '"';
}
// The mailbox flagged \All (Gmail "All Mail" under any UI language), or null.
function grantAllMailBox(lines) {
  for (const ln of lines || []) {
    const m = /^\* X?LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) (.+)$/i.exec(String(ln));
    if (!m || !/\\All\b/i.test(m[1])) continue;
    let name = m[2].trim();
    if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).replace(/\\(["\\])/g, "$1");
    return name;
  }
  return null;
}
function grantUidValidity(lines) {
  for (const ln of lines || []) {
    const m = /\[UIDVALIDITY (\d+)\]/i.exec(String(ln));
    if (m) return m[1];
  }
  return "?";
}
function grantSearchUids(lines) {
  const ln = (lines || []).find((l) => /^\* SEARCH\b/i.test(String(l)));
  return ln ? String(ln).replace(/^\* SEARCH/i, "").trim().split(/\s+/).filter((x) => /^\d+$/.test(x)) : [];
}
function grantParseHeaders(raw) {
  const out = {};
  const text = String(raw || "").replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");
  for (const line of text.split("\n")) {
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line);
    if (m && !(m[1].toLowerCase() in out)) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}
// imapOpen().cmd() returns each untagged line, and a literal ({n}) as the element after its line.
function grantParseFetch(lines) {
  const out = [];
  for (let i = 0; i < (lines || []).length; i++) {
    const ln = String(lines[i] || "");
    if (!/^\* \d+ FETCH \(/i.test(ln) || !/\{\d+\}$/.test(ln)) continue;
    const um = /\bUID (\d+)/i.exec(ln) || /\bUID (\d+)/i.exec(String(lines[i + 2] || ""));
    out.push({ uid: um ? um[1] : null, headers: grantParseHeaders(lines[i + 1]) });
    i++;
  }
  return out;
}
async function grantD1Scan(env, apps, decode) {
  if (!apps.length) return [];
  const since = apps.map((a) => a.submitted).sort()[0];
  const doms = [...new Set(apps.flatMap((a) => a.domains))].slice(0, 40);
  const hdr = (k) => "CASE WHEN json_valid(headers_json) THEN json_extract(headers_json, '$.\"" + k + "\"') END";
  const where = doms.map((_, i) => "instr(lower(sender || ' ' || COALESCE(hfrom, '')), ?" + (i + 2) + ") > 0").join(" OR ");
  const sql = "SELECT id, message_id, sender, subject, received_at, hfrom, hirt, hrefs, hlist, hunsub, hprec FROM (SELECT id, message_id, sender, subject, received_at, " + hdr("from") + " AS hfrom, " + hdr("in-reply-to") + " AS hirt, " + hdr("references") + " AS hrefs, " + hdr("list-id") + " AS hlist, " + hdr("list-unsubscribe") + " AS hunsub, " + hdr("precedence") + " AS hprec FROM emails WHERE received_at >= ?1) WHERE " + where + " ORDER BY received_at LIMIT 300";
  const r = await env.AUDIT.prepare(sql).bind(since, ...doms).all();
  return (r.results || []).map((x) => ({
    channel: "qnfo-email",
    ref: "qnfo-audit.emails id " + x.id,
    message_id: grantMsgId(x.message_id),
    from: grantAddress(x.hfrom) || grantAddress(x.sender),
    envelope: grantAddress(x.sender),
    subject: decode(String(x.subject || "")),
    date: grantIso(x.received_at),
    in_reply: !!(x.hirt || x.hrefs),
    list: grantIsList(x.hlist, x.hunsub, x.hprec)
  }));
}
async function grantGmailScan(env, apps, d) {
  if (!env.GMAIL_PASS) return { status: "no-credential", rows: [] };
  let imap = null;
  try {
    imap = await d.open(env);
    const login = await imap.cmd('LOGIN "rwnquni@gmail.com" "' + String(env.GMAIL_PASS).replace(/"/g, "") + '"');
    if (!login.ok) throw new Error("gmail login failed");
    const box = grantAllMailBox((await imap.cmd('LIST "" "*"')).lines) || "[Gmail]/All Mail";
    const ex = await imap.cmd("EXAMINE " + grantImapQuote(box));
    if (!ex.ok) throw new Error("EXAMINE failed for " + box);
    const uv = grantUidValidity(ex.lines);
    const rows = [];
    for (const app of apps) {
      const s = await imap.cmd("UID SEARCH " + grantImapSearch(app));
      if (!s.ok) throw new Error("SEARCH failed for " + app.key);
      const uids = grantSearchUids(s.lines).slice(-GRANT_MAX_PER_APP);
      for (let i = 0; i < uids.length; i += 20) {
        const f = await imap.cmd("UID FETCH " + uids.slice(i, i + 20).join(",") + " (UID BODY.PEEK[HEADER.FIELDS (" + GRANT_HEADER_FIELDS + ")])");
        for (const m of grantParseFetch(f.lines)) {
          const h = m.headers;
          rows.push({
            channel: "gmail",
            ref: "Gmail " + box + " UID " + m.uid + " (UIDVALIDITY " + uv + ")",
            message_id: grantMsgId(h["message-id"]),
            from: grantAddress(h.from),
            envelope: "",
            subject: d.decode(h.subject || ""),
            date: grantIso(h.date),
            in_reply: !!(h["in-reply-to"] || h.references),
            list: grantIsList(h["list-id"], h["list-unsubscribe"], h.precedence)
          });
        }
      }
    }
    await imap.close();
    return { status: "ok", box, rows };
  } catch (e) {
    if (imap) {
      try {
        await imap.close();
      } catch (e2) {
      }
    }
    return { status: "error", error: String(e && e.message || e).slice(0, 120), rows: [] };
  }
}
function grantClip(s, n) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").replace(/"/g, "'").trim().slice(0, n);
}
// Opens or extends the agent_issues row for one recorded reply; returns the issue id, or null to retry on the next run.
async function grantFileIssue(env, evId, m, nowMs) {
  const A = env.AUDIT;
  const note = "[GRANT-FOLLOWUP-1 " + new Date(nowMs).toISOString().slice(0, 16) + "Z] " + m.funder + " sent a " + m.kind + " on " + String(m.sent_at || "?").slice(0, 10) + ': "' + grantClip(m.subject, 140) + '" from ' + (grantDomain(m.from) || "?") + ". Read it at: " + m.ref + " (message-id " + grantClip(m.message_id, 160) + "; evidence cloud_ops_events " + evId + ").";
  if (m.issue_link) {
    const u = await A.prepare("UPDATE agent_issues SET description = COALESCE(description, '') || ?1, updated_at = ?2 WHERE id = ?3 AND status = 'open'").bind("\n\n" + note, nowMs, m.issue_link).run();
    if (u && u.meta && u.meta.changes) return Number(m.issue_link);
  }
  const title = ("GRANT-REPLY-" + String(m.application).toUpperCase() + ": " + m.funder + " answered the application (pillar: reach)").slice(0, 180);
  const up = await A.prepare("UPDATE agent_issues SET description = COALESCE(description, '') || ?1, updated_at = ?2 WHERE title = ?3 AND status = 'open'").bind("\n\n" + note, nowMs, title).run();
  if (!(up && up.meta && up.meta.changes)) {
    await A.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT ?1, ?2, ?3, 'funding', 'high', 'open', ?4, ?4 WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE lower(trim(title)) = lower(trim(?1)) AND status = 'open')").bind(title, note + " " + GRANT_DOD, "cloud_ops_events:" + evId, nowMs).run();
  }
  const row = await A.prepare("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' ORDER BY id DESC LIMIT 1").bind(title).first();
  return row ? Number(row.id) : null;
}
async function jobGrantFollowup(env, deps) {
  const d = deps || { open: imapOpen, decode: decodeHeader };
  const now = d.now || Date.now();
  const apps = GRANT_APPLICATIONS.filter((a) => grantActive(a, now));
  const channels = {};
  let recs = [];
  try {
    const r = await grantD1Scan(env, apps, d.decode);
    recs = recs.concat(r);
    channels.qnfo_email = "ok:" + r.length;
  } catch (e) {
    channels.qnfo_email = "error:" + String(e && e.message || e).slice(0, 80);
  }
  const g = await grantGmailScan(env, apps, d);
  channels.gmail = g.status === "ok" ? "ok:" + g.rows.length : g.status === "no-credential" ? "no-credential: GMAIL_PASS unset" : "error:" + g.error;
  recs = recs.concat(g.rows);
  const out = { applications: apps.length, matched: 0, new_rows: 0, receipts: 0, bulk: 0, issues: [] };
  const seen = new Set();
  recs.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  // 1. Record each new message from a funder (dedup on the message-id across runs and channels).
  for (const rec of recs) {
    const app = grantMatch(apps, rec);
    if (!app) continue;
    const kind = grantKind(rec);
    if (kind === "bulk") {
      out.bulk++;
      continue;
    }
    const key = rec.message_id || rec.ref;
    if (seen.has(key)) continue;
    seen.add(key);
    out.matched++;
    const evId = "grant-reply-" + key;
    const handled = !!(app.handled_through && rec.date && String(rec.date).slice(0, 10) <= app.handled_through);
    const meta = { job: "grant-followup", application: app.key, funder: app.funder, kind, channel: rec.channel, from: rec.from, subject: grantClip(rec.subject, 200), sent_at: rec.date, message_id: rec.message_id, ref: rec.ref, issue_link: app.issue || null, issue_id: null, handled: handled ? app.handled_note || "handled before GRANT-FOLLOWUP-1" : null };
    const ins = await env.AUDIT.prepare("INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'grant-reply', ?3, ?4, 'grant-followup', ?5)").bind(evId, new Date(now).toISOString(), app.funder + " " + kind + ": " + grantClip(rec.subject, 160), JSON.stringify(meta), handled ? "handled" : kind).run();
    if (ins && ins.meta && ins.meta.changes) {
      out.new_rows++;
      if (kind === "receipt") out.receipts++;
    }
  }
  // 2. Act on every recorded reply or message that has no issue yet (new ones, and any a failed run left behind).
  const pending = await env.AUDIT.prepare("SELECT id, meta FROM cloud_ops_events WHERE id >= 'grant-reply-' AND id < 'grant-reply.' AND status IN ('reply', 'message') AND json_extract(meta, '$.issue_id') IS NULL ORDER BY ts, id LIMIT " + GRANT_MAX_ISSUE_WRITES).all();
  for (const p of pending.results || []) {
    let m = null;
    try {
      m = JSON.parse(p.meta || "null");
    } catch (e) {
      m = null;
    }
    if (!m || !m.application) continue;
    try {
      const id = await grantFileIssue(env, p.id, m, now);
      if (id) {
        await env.AUDIT.prepare("UPDATE cloud_ops_events SET meta = json_set(meta, '$.issue_id', ?1) WHERE id = ?2").bind(id, p.id).run();
        out.issues.push(m.application + ":" + id);
      }
    } catch (e) {
      out.issue_error = String(e && e.message || e).slice(0, 120);
    }
  }
  const okD1 = channels.qnfo_email.indexOf("ok:") === 0, okGmail = channels.gmail.indexOf("ok:") === 0;
  return { status: okD1 && okGmail && !out.issue_error ? "ok" : okD1 || okGmail ? "degraded" : "error", notes: Object.assign({ channels }, out) };
}
// GRANT-FOLLOWUP-1 end
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
async function selfRegister(env) {
  const manifest = {
    service: "qnfo-cloud-ops",
    kind: "worker",
    version: VERSION,
    base_url: "https://qnfo-cloud-ops.q08.workers.dev",
    purpose: "scheduled QNFO visibility: weekly digest + P7 scorecard + outreach legacy-drain gate + AI-endpoint health + SEO discoverability health",
    capabilities: ["scheduled", "weekly-visibility-digest", "p7-scorecard", "outreach-drain-gate", "ai-endpoint-health", "seo-health", "job-runner"],
    routes: ["/health", "/run", "/search", "/record"],
    tools: [],
    models: [],
    deps: ["qnfo-audit D1", "qnfo-infra", "qnfo-graph", "living-paper", "portfolio-state", "qnfo-outreach", "qnfo-email", "send_email", "VAULT R2"]
  };
  const resp = await env.QNFO_OPS.fetch("https://qnfo-ops.internal/registry/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.REGISTRY_TOKEN || "") },
    body: JSON.stringify(manifest)
  });
  return resp.ok;
}
__name(selfRegister, "selfRegister");
var worker_default = {
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    const off = Number(await stateGet(env, "cron_offset", "2")) || 2;
    const map = dispatchMap(off);
    try {
      const sr = await syncSchedules(env, false);
      if (sr && sr.changed) {
        await stateSet(env, "cron_sync_error", sr.ok ? "" : "PUT failed status=" + sr.status + " at " + (/* @__PURE__ */ new Date()).toISOString());
      }
    } catch (e) {
      console.log("schedule self-repair err", e && e.message || e);
      try {
        await stateSet(env, "cron_sync_error", "threw: " + String(e && e.message || e).slice(0, 200));
      } catch (e2) {}
    }
    const job = map[cron];
    if (!job || !JOBS[job]) {
      console.log("no job for cron", cron, "offset", off);
      try {
        await recordEvent(env, "cron-noop", "cn-" + String(cron).replace(/[^0-9a-z]/gi, "") + "-" + Date.now().toString(36), "CRON-DISPATCH-NOOP-1: no job mapped for registered cron " + cron + " (offset " + off + ")", { cron, offset: off });
      } catch (e) {}
      return;
    }
    for (const companion of CRON_COMPANIONS[job] || []) {
      if (JOBS[companion]) await runCompanion(env, companion);
    }
    try {
      const out = await JOBS[job](env);
      await logRun(env, job, out.status, out.notes || {});
      await recordEvent(env, "job-run", "jr-" + job + "-" + Date.now().toString(36), job + " " + out.status + " " + JSON.stringify(out.notes || {}).slice(0, 300), { job, status: out.status });
      console.log("cloud-ops", job, out.status, JSON.stringify(out.notes || {}).slice(0, 200));
    } catch (e) {
      await logRun(env, job, "error", { error: String(e && e.message || e) });
      await recordEvent(env, "job-run", "jr-" + job + "-" + Date.now().toString(36), job + " error " + String(e && e.message || e), { job, status: "error" });
      console.error("cloud-ops", job, "error", String(e && e.message || e));
      try {
        await sendDigest(env, "QNFO cloud job failure \u2014 " + job, "Job " + job + " failed: " + String(e && e.message || e));
      } catch (e2) {
      }
    }
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (path === "/health" && request.method === "GET") {
      if (ctx && ctx.waitUntil && env.QNFO_OPS && env.REGISTRY_TOKEN) {
        ctx.waitUntil(selfRegister(env).catch((err) => console.log("self-register err", err && err.message || err)));
      }
      // CLOUD-OPS-HEALTH-AUTH-1 (#1471): this route is handled before the auth
      // gate below, so it used to disclose binding/secret presence and the
      // full cron map to anonymous callers. Serve a minimal public body; the
      // detailed body requires a valid bearer token.
      const publicBody = { ok: true, worker: WORKER_NAME, version: VERSION, capabilities: ["weekly-digest", "scorecard", "outreach-send-gate", "outreach-learner", "ai-endpoint-health", "seo-health", "research-scan", "grant-followup"], limitations: ["the outreach learner reorders and holds candidates inside the unchanged shared caps; it never raises a cap", "every route except this minimal /health needs a bearer token; the job and cron map is served only to authenticated callers", "jobs run only on its crons (Amsterdam-time aware)", "outreach sends are held inside the fleet-wide shared daily and per-domain caps", "grant-followup reads funder mail read-only (never sends, moves or flags it) and watches Gmail only while the GMAIL_PASS secret is set"] };
      const healthToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!auth(healthToken, env)) {
        return new Response(JSON.stringify(publicBody), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      const off = amsOffset(/* @__PURE__ */ new Date());
      const crons = buildCrons(off).map((c) => c.cron + " -> " + c.job);
      return new Response(JSON.stringify({
        ...publicBody,
        jobs: Object.keys(JOBS),
        ams_offset: off,
        crons,
        bindings: {
          audit: !!env.AUDIT,
          portfolio: !!env.PORTFOLIO,
          living: !!env.LIVING,
          outreach: !!env.OUTREACH,
          graph: !!env.GRAPH,
          email: !!env.EMAIL,
          email_key: !!env.EMAIL_API_KEY,
          qnfo_infra: !!env.QNFO_INFRA,
          send_email: !!env.SEND_EMAIL,
          vault: !!env.VAULT,
          ai: !!env.AI,
          ops_vz: !!env.OPS_VZ,
          secrets: { gh: !!env.GH_TOKEN, gmail: !!env.GMAIL_PASS, cf: !!env.CF_TOKEN, admin: !!env.OPS_ADMIN_TOKEN, infra_token: !!env.INFRA_TOKEN }
        }
      }), { headers: { "Content-Type": "application/json", ...CORS } });
    }
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!auth(token, env)) return new Response("unauthorized", { status: 401, headers: CORS });
    if (path === "/run" && request.method === "POST") {
      const job = (url.searchParams.get("job") || "").trim();
      if (!job || !JOBS[job]) return new Response(JSON.stringify({ error: "unknown job: " + job + " (valid: " + Object.keys(JOBS).join(",") + ")" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
      try {
        const out = await JOBS[job](env);
        await logRun(env, job, out.status, out.notes || {});
        await recordEvent(env, "job-run", "jr-" + job + "-" + Date.now().toString(36), job + " " + out.status + " " + JSON.stringify(out.notes || {}).slice(0, 300), { job, status: out.status });
        return new Response(JSON.stringify({ ok: true, job, ...out }), { headers: { "Content-Type": "application/json", ...CORS } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, job, error: String(e && e.message || e) }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
      }
    }
    if (path === "/search" && request.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return new Response(JSON.stringify({ error: "q required" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
      const vec = await embedText(env, q);
      if (!vec) return new Response(JSON.stringify({ error: "embedding failed" }), { status: 502, headers: { "Content-Type": "application/json", ...CORS } });
      const k = Math.min(Math.max(parseInt(url.searchParams.get("k") || "8", 10) || 8, 1), 20);
      try {
        const r = await env.OPS_VZ.query(vec, { topK: k, returnValues: false, returnMetadata: "all" });
        const hits = (r.matches || []).map((m) => {
          const md = m.metadata || {};
          return { id: m.id, score: Math.round((m.score || 0) * 1e4) / 1e4, kind: md.kind, ts: md.ts, job: md.job, status: md.status, text: md.text || "" };
        });
        return new Response(JSON.stringify({ ok: true, query: q, count: hits.length, hits }), { headers: { "Content-Type": "application/json", ...CORS } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "search failed: " + String(e && e.message || e) }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
      }
    }
    if (path === "/cron-rebuild" && request.method === "POST") {
      const r = await syncSchedules(env, true);
      return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json", ...CORS } });
    }
    if (path === "/register" && request.method === "GET") {
      const mode = url.searchParams.get("mode") || "d1";
      let out = {};
      if (mode === "r2") {
        out.register = await r2GetText(env, REGISTER_R2_KEY);
        out.cloud_append = await r2GetText(env, CLOUD_APPEND_R2_KEY);
      } else {
        const rows = await env.AUDIT.prepare("SELECT id, section, line, done, line_date, source FROM gtd_register ORDER BY id DESC LIMIT 50").all();
        out.rows = rows.results || [];
      }
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", ...CORS } });
    }
    if (path === "/auth/graph" && request.method === "GET") {
      const step = url.searchParams.get("step") || "";
      const info = {
        status: env.MS_CLIENT_ID ? "configured" : "not-configured",
        steps: [
          "One-time bootstrap (user action, ~3 min):",
          "1. https://entra.microsoft.com -> App registrations -> New registration (name: qnfo-cloud-scheduler; accounts: personal Microsoft accounts only).",
          "2. API permissions: Microsoft Graph delegated -> Mail.ReadWrite, Calendars.ReadWrite, Tasks.ReadWrite, offline_access.",
          "3. Authentication -> Mobile and desktop applications -> enable https://login.microsoftonline.com/common/oauth2/nativeclient.",
          "4. Put the Application (client) ID into the worker secret MS_CLIENT_ID via PUT /accounts/{acct}/workers/scripts/qnfo-cloud-ops/secrets/MS_CLIENT_ID.",
          "5. GET /auth/graph?step=device on this worker to start the device-code flow; the code is emailed to the digest address for one-time consent."
        ],
        device: step === "device" && env.MS_CLIENT_ID ? { note: "device flow starts once MS_CLIENT_ID is set" } : null
      };
      return new Response(JSON.stringify(info), { headers: { "Content-Type": "application/json", ...CORS } });
    }
    if (path === "/record" && request.method === "POST") {
      try {
        const body = await request.json();
        const kind = String(body.kind || "guard-result").slice(0, 40);
        const text = String(body.text || body.name || body.source || "guard result").slice(0, 2e3);
        const id = "rec-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
        const meta = Object.assign({}, body.meta || {}, { job: String(body.job || "guard-client").slice(0, 40), status: String(body.status || "ok").slice(0, 20) });
        await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(id, (/* @__PURE__ */ new Date()).toISOString(), kind, text, JSON.stringify(meta).slice(0, 1500), meta.job, meta.status).run();
        return new Response(JSON.stringify({ ok: true, id, recorded: true }), { headers: { "Content-Type": "application/json", ...CORS } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
      }
    }
    return new Response("not found", { status: 404, headers: CORS });
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map