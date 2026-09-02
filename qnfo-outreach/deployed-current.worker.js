/**
 * qnfo-outreach v0.1.0 - automated open-science outreach pipeline (draft-mode + gated send)
 *
 * Purpose: mine public contact signals, draft campaign emails into OUTREACH_D1, gate and send via
 * the Email Sending binding with daily caps, accept RFC comments, record funnel metrics.
 *
 * Capabilities:
 *   - scheduled: cron 0 11 * * 1-5 (UTC) -> mine -> draft -> send(gated) -> funnel
 *   - GET  /health                  version + state (FLEET-SELF-DOC-1)
 *   - GET  /api/contacts            list mined contacts
 *   - GET  /api/campaigns           list campaigns
 *   - GET  /api/sends               list sends (?status=)
 *   - GET  /api/rfcs                list RFC topics
 *   - POST /rfc/:slug/comment       RFC comment intake {email, name, answer}
 *   - POST /api/miners/github       run GitHub miner once (manual trigger)
 *   - POST /api/warmup              ONE self-test send to an own-mailbox allowlist
 *
 * Deploy: wrangler deploy (canonical repo dir: QNFO/qnfo-workers/qnfo-outreach)
 * Canonical source: worker.js in this dir; deployed-current.worker.js mirrors it after deploy.
 *
 * Strategy doc: QNFO/qnfo-ops/docs/OUTREACH-AUTOMATION-STRATEGY.md
 */
import { EmailMessage } from "cloudflare:email";

const VERSION = "0.1.0";
const ACTIVATION_AT_MS = Date.parse("2026-09-15T00:00:00Z");
const WARMUP_FROM_MS = Date.parse("2026-09-08T00:00:00Z");
const GLOBAL_DAILY_CAP = 8;
const PER_DOMAIN_DAILY_CAP = 3;
const WARMUP_ALLOWLIST = ["alerts@qnfo.org", "qnfo@qnfo.org", "rowan.quni@qnfo.org", "rwnquni@outlook.com", "rowan.quni@outlook.com"];
const FROM_ACADEMIC = "rowan.quni@qnfo.org";
const SPAM_TOKENS = ["TEST", "SEND TEST", "WRANGLER", "MATRIX", "VERIFY", "verification code", "PIPELINE TEST", "FREE", "!!!"];
const GITHUB_QUERIES = ["topic:energy-efficiency", "topic:hpc", "topic:quantum-control", "topic:green-software"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
function utcDay() { return new Date().toISOString().slice(0, 10); }
function makeId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function fill(tpl, ct) {
  return String(tpl || "")
    .replaceAll("{{name}}", ct.name || "there")
    .replaceAll("{{topic}}", (ct.tags || "").split(",")[0] || "this area")
    .replaceAll("{{org}}", ct.org || "your organization");
}
function subjectClean(subject) {
  const s = String(subject || "").toUpperCase();
  return !SPAM_TOKENS.some((t) => s.includes(t.toUpperCase()));
}
async function sendRaw(env, from, to, subject, bodyText) {
  try {
    await env.SEND_EMAIL.send({ to, from, subject, text: bodyText });
    return { ok: true, err: "" };
  } catch (e) {
    return { ok: false, err: String(e && e.message || e) };
  }
}
async function noRepeat(env, email) {
  const e = email.toLowerCase();
  const s = await env.OUTREACH_D1.prepare(
    "SELECT 1 FROM sends WHERE contact_id IN (SELECT id FROM contacts WHERE email = ?1) AND status IN ('sent','queued') LIMIT 1").bind(e).first();
  if (s) return true;
  try {
    const legacy = await env.OUTREACH_D1.prepare(
      "SELECT 1 FROM outreach_campaigns WHERE lower(recipient_email) = ?1 AND status IN ('sent','followed_up') LIMIT 1").bind(e).first();
    if (legacy) return true;
  } catch (err) { /* legacy table best-effort */ }
  try {
    const audit = await env.QNFO_AUDIT.prepare(
      "SELECT 1 FROM outreach_log WHERE lower(email) = ?1 AND status IN ('sent','followup','replied') LIMIT 1").bind(e).first();
    if (audit) return true;
  } catch (err) { /* audit bridge best-effort */ }
  return false;
}
async function mineGitHub(env, count = 3) {
  const q = GITHUB_QUERIES[Math.floor(Math.random() * GITHUB_QUERIES.length)];
  const resp = await fetch("https://api.github.com/search/repositories?q=" + encodeURIComponent(q) + "&sort=updated&per_page=5", {
    headers: { "User-Agent": "qnfo-outreach/" + VERSION, "Accept": "application/vnd.github+json" },
  });
  if (!resp.ok) return { mined: 0, err: "github search " + resp.status };
  const data = await resp.json();
  const repos = (data.items || []).slice(0, count);
  let mined = 0;
  for (const repo of repos) {
    const owner = repo.owner && repo.owner.login;
    if (!owner) continue;
    const uresp = await fetch("https://api.github.com/users/" + owner, { headers: { "User-Agent": "qnfo-outreach/" + VERSION } });
    if (!uresp.ok) continue;
    const u = await uresp.json();
    const email = String(u.email || "").toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    const existing = await env.OUTREACH_D1.prepare("SELECT id FROM contacts WHERE email = ?1").bind(email).first();
    if (existing) continue;
    await env.OUTREACH_D1.prepare(
      "INSERT INTO contacts (id, email, name, org, role, audience, tags, source, source_ref) VALUES (?1,?2,?3,?4,'practitioner','practitioner',?5,'github',?6)"
    ).bind(makeId("c-"), email, String(u.name || "").slice(0, 120), String(u.company || "").slice(0, 120),
      (repo.topics || []).slice(0, 5).join(","), String(repo.html_url || "").slice(0, 200)).run();
    mined++;
  }
  return { mined };
}
async function draftCampaigns(env) {
  const campaigns = await env.OUTREACH_D1.prepare("SELECT * FROM campaigns WHERE status = 'active' AND starts_at <= datetime('now')").all();
  let drafted = 0;
  for (const c of campaigns.results || []) {
    const total = await env.OUTREACH_D1.prepare("SELECT COUNT(*) n FROM sends WHERE campaign_id = ?1").bind(c.id).first();
    if ((total && total.n || 0) >= c.total_cap) continue;
    const contacts = await env.OUTREACH_D1.prepare(
      "SELECT * FROM contacts WHERE suppress = 0 AND status IN ('new','verified') AND audience = ?1 AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.contact_id = contacts.id AND s.kind = ?2) ORDER BY first_seen LIMIT ?3"
    ).bind(c.audience, c.template_key, c.daily_cap).all();
    for (const ct of contacts.results || []) {
      await env.OUTREACH_D1.prepare(
        "INSERT INTO sends (id, campaign_id, contact_id, kind, channel, subject, body, status) VALUES (?1,?2,?3,?4,'email',?5,?6,'draft')"
      ).bind(makeId("s-"), c.id, ct.id, c.template_key, fill(c.subject_template, ct).slice(0, 200), fill(c.body_template, ct)).run();
      drafted++;
    }
  }
  return drafted;
}
async function sendGated(env) {
  const now = Date.now();
  const day = utcDay();
  const kill = await env.OUTREACH_D1.prepare("SELECT value FROM pipeline_state WHERE key = 'external_sends_enabled'").first();
  const sentToday = await env.OUTREACH_D1.prepare("SELECT COUNT(*) n FROM sends WHERE status = 'sent' AND sent_at LIKE ?1").bind(day + "%").first();
  const budget = GLOBAL_DAILY_CAP - (sentToday && sentToday.n || 0);
  if (budget <= 0) return { sent: 0, skipped: "budget" };
  const canExternal = now >= ACTIVATION_AT_MS && kill && kill.value === "1";
  const canWarmup = now >= WARMUP_FROM_MS;
  let sent = 0;
  if (canWarmup && !canExternal) {
    const selfToday = await env.OUTREACH_D1.prepare("SELECT 1 FROM sends WHERE kind = 'selfcheck' AND sent_at LIKE ?1 LIMIT 1").bind(day + "%").first();
    if (!selfToday) {
      const res = await sendRaw(env, FROM_ACADEMIC, "alerts@qnfo.org", "Outreach pipeline self-check " + day, "Automated daily self-check of the qnfo-outreach send path. No action needed.");
      await env.OUTREACH_D1.prepare(
        "INSERT INTO sends (id, campaign_id, contact_id, kind, channel, subject, body, status, sent_at) VALUES (?1,NULL,NULL,'selfcheck','email','Outreach pipeline self-check','self-check',?2,datetime('now'))"
      ).bind(makeId("s-"), res.ok ? "sent" : "failed").run();
      if (res.ok) sent++;
    }
  }
  if (!canExternal) return { sent, skipped: "pre-activation" };
  const queue = await env.OUTREACH_D1.prepare(
    "SELECT s.* FROM sends s JOIN campaigns c ON c.id = s.campaign_id WHERE s.status = 'draft' AND c.status = 'active' ORDER BY s.created_at LIMIT 30").all();
  for (const row of queue.results || []) {
    if (sent >= budget) break;
    const contact = await env.OUTREACH_D1.prepare("SELECT * FROM contacts WHERE id = ?1").bind(row.contact_id).first();
    if (!contact || contact.suppress) {
      await env.OUTREACH_D1.prepare("UPDATE sends SET status = 'suppressed' WHERE id = ?1").bind(row.id).run();
      continue;
    }
    const to = String(contact.email || "").toLowerCase();
    if (!EMAIL_RE.test(to) || WARMUP_ALLOWLIST.includes(to)) continue;
    if (!subjectClean(row.subject)) {
      await env.OUTREACH_D1.prepare("UPDATE sends SET status = 'suppressed' WHERE id = ?1").bind(row.id).run();
      continue;
    }
    if (await noRepeat(env, to)) {
      await env.OUTREACH_D1.prepare("UPDATE sends SET status = 'suppressed' WHERE id = ?1").bind(row.id).run();
      continue;
    }
    const domain = to.split("@")[1];
    const domToday = await env.OUTREACH_D1.prepare(
      "SELECT COUNT(*) n FROM sends WHERE status='sent' AND sent_at LIKE ?1 AND contact_id IN (SELECT id FROM contacts WHERE email LIKE ?2)"
    ).bind(day + "%", "%@" + domain).first();
    if ((domToday && domToday.n || 0) >= PER_DOMAIN_DAILY_CAP) continue;
    const res = await sendRaw(env, FROM_ACADEMIC, to, row.subject, row.body);
    if (res.ok) {
      await env.OUTREACH_D1.prepare("UPDATE sends SET status='sent', sent_at=datetime('now') WHERE id=?1").bind(row.id).run();
      await env.OUTREACH_D1.prepare(
        "UPDATE contacts SET status='contacted', last_contacted=datetime('now'), contact_count=contact_count+1 WHERE id=?1").bind(row.contact_id).run();
      sent++;
    } else {
      await env.OUTREACH_D1.prepare("UPDATE sends SET status='failed' WHERE id=?1").bind(row.id).run();
    }
  }
  return { sent, skipped: "" };
}
async function bumpFunnel(env, mined, drafted, sent) {
  const day = utcDay();
  await env.OUTREACH_D1.prepare(
    "INSERT INTO funnel_daily (day, mined, drafted, sent) VALUES (?1,?2,?3,?4) ON CONFLICT(day) DO UPDATE SET mined = mined + ?2, drafted = drafted + ?3, sent = sent + ?4"
  ).bind(day, mined, drafted, sent).run();
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    if (path === "/health" || path === "/") {
      return json({ ok: true, worker: "qnfo-outreach", version: VERSION,
        activation_at: "2026-09-15T00:00:00Z", warmup_from: "2026-09-08T00:00:00Z",
        cron: "0 11 * * 1-5", mode: Date.now() >= ACTIVATION_AT_MS ? "external-enabled" : "draft+warmup", day: utcDay() });
    }
    if (path === "/api/contacts" && method === "GET") {
      const rows = await env.OUTREACH_D1.prepare("SELECT * FROM contacts ORDER BY first_seen DESC LIMIT 50").all();
      return json(rows.results);
    }
    if (path === "/api/campaigns" && method === "GET") {
      const rows = await env.OUTREACH_D1.prepare("SELECT * FROM campaigns ORDER BY starts_at").all();
      return json(rows.results);
    }
    if (path === "/api/sends" && method === "GET") {
      const status = url.searchParams.get("status") || "";
      const rows = status
        ? await env.OUTREACH_D1.prepare("SELECT * FROM sends WHERE status = ?1 ORDER BY created_at DESC LIMIT 50").bind(status).all()
        : await env.OUTREACH_D1.prepare("SELECT * FROM sends ORDER BY created_at DESC LIMIT 50").all();
      return json(rows.results);
    }
    if (path === "/api/rfcs" && method === "GET") {
      const rows = await env.OUTREACH_D1.prepare("SELECT * FROM rfc_topics ORDER BY id").all();
      return json(rows.results);
    }
    if (path === "/api/miners/github" && method === "POST") {
      const r = await mineGitHub(env);
      await bumpFunnel(env, r.mined || 0, 0, 0);
      return json(r);
    }
    if (path === "/api/warmup" && method === "POST") {
      let body = {};
      try { body = await req.json(); } catch (e) { body = {}; }
      const to = String(body.to || "alerts@qnfo.org").toLowerCase();
      if (!WARMUP_ALLOWLIST.includes(to)) return json({ ok: false, err: "recipient not in own-mailbox allowlist" }, 403);
      const res = await sendRaw(env, FROM_ACADEMIC, to, "Outreach pipeline self-check " + utcDay(), "Automated self-check of the qnfo-outreach send path. No action needed.");
      await env.OUTREACH_D1.prepare(
        "INSERT INTO sends (id, campaign_id, contact_id, kind, channel, subject, body, status, sent_at) VALUES (?1,NULL,NULL,'selfcheck','email','Outreach pipeline self-check','self-check',?2,datetime('now'))"
      ).bind(makeId("s-"), res.ok ? "sent" : "failed").run();
      return json({ ok: res.ok, err: res.err, to });
    }
    const rfcMatch = path.match(/^\/rfc\/([a-z0-9-]+)\/comment$/);
    if (rfcMatch && method === "POST") {
      let b = {};
      try { b = await req.json(); } catch (e) { b = {}; }
      const topic = await env.OUTREACH_D1.prepare("SELECT * FROM rfc_topics WHERE slug = ?1").bind(rfcMatch[1]).first();
      if (!topic) return json({ ok: false, err: "unknown rfc topic" }, 404);
      const answer = String(b.answer || "").slice(0, 4000);
      const fromEmail = String(b.email || "").toLowerCase().slice(0, 200);
      if (!answer) return json({ ok: false, err: "answer required" }, 400);
      await env.OUTREACH_D1.prepare(
        "INSERT INTO rfc_responses (id, rfc_topic, from_email, question, answer) VALUES (?1,?2,?3,?4,?5)"
      ).bind(makeId("r-"), topic.slug, fromEmail, topic.question, answer).run();
      return json({ ok: true, topic: topic.slug });
    }
    return json({ ok: false, err: "not found" }, 404);
  },
  async scheduled(controller, env, ctx) {
    const mined = await mineGitHub(env).catch(() => ({ mined: 0 }));
    const drafted = await draftCampaigns(env).catch(() => 0);
    const sent = await sendGated(env).catch(() => ({ sent: 0 }));
    await bumpFunnel(env, mined.mined || 0, drafted, sent.sent || 0).catch(() => {});
  },
};
