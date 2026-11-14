// _shared/org-outreach.js: ORG-OUTREACH-1 (Rowan, 2026-11-14). "I've built things that are not getting attention ... I should be creating my own role and
// reaching out to those who can do it, be it VC firms, investors, research labs, AI firms ... research institutes ... even if they don't have a job, maybe
// we can have a discussion about what their needs are ... I want the system to do it."
//
// The existing cold-mail engine (qnfo-cloud-ops jobOutreach) mails authors of papers and, since OUTREACH-PIVOT-1, deliberately holds university and institute
// addresses. This is the other lane: ORGANISATIONS (labs, funders, AI firms, third-sector research bodies) reached at a publicly listed address with one
// specific reason tied to what the organisation says it does. Same limits as the first lane (suppression, dedupe, the shared 8/day and 3/day-per-domain
// caps, the kill switch, an opt-out line); this lane adds its own lower cap, a postal-address gate for live sends and a reply-driven segment learner.
//
// Loop (no person in it): SELECT eligible targets -> BUILD the message -> SEND (live) or DRAFT -> classify replies -> credit the segment -> next pick.
// Pure ESM, no imports, no I/O: the worker passes D1 rows in and writes the returned decisions out; tests import it directly.

export const ORG_OUTREACH_VERSION = "1.0.0";
export const DIRECTIVE_ID = "ORG-OUTREACH-1";

// Segments: the audience classes and the one-line reason each is written to. The learner (pickSegment) chooses among them from replies.
export const SEGMENTS = {
  "ai-lab": { label: "AI research and safety labs", angle: "how autonomous AI systems operate, fail and get audited, with a public failure record" },
  "funder": { label: "Funders, VC and investors", angle: "an independent autonomous research platform with a working public record and an audit method" },
  "research-institute": { label: "Research institutes and think tanks", angle: "a working autonomous research system and an audit method you can apply to your own programme" },
  "third-sector": { label: "Not-for-profit and third-sector research bodies", angle: "evaluation and research operations, from a researcher who has worked in the third sector" },
  "ai-firm": { label: "AI companies", angle: "how autonomous AI systems are overseen and audited in production, with evidence from one run in the open" },
};

// Claims the message may make. Each is in the verified record already used by the paper-author lane (jobsearch/facts.json, docs/STRATEGY.md 2.2).
// A new claim is added here by a PR; the builder never takes a claim from a target row or a model.
export const FACTS = [
  "I am Rowan Brad Quni-Gudzinas, a systems researcher.",
  "I run QNFO, an independent research imprint, as an autonomous research system in the open, with a public failure record and a published audit method.",
  "My background is systems work: transportation network models, the national travel model at the U.S. Federal Highway Administration, then analytics and machine learning.",
];

export const OPT_OUT = "If you would rather not hear from me again, reply “stop” and I will not write again.";
export const FREE_MAIL = /(^|\.)(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|proton|protonmail|aol|gmx|mail|yandex|qq|163)\.[a-z.]+$/i;
export const ROLE_LOCAL = /^(info|hello|hi|contact|office|team|partnerships?|partners|research|collaborat\w*|enquir\w*|inquir\w*|admin|press|media|programmes?|programs?|grants?|funding|submissions?|opportunities|careers|jobs|people|talent)$/i;
// Countries where unsolicited mail to a named person needs more than an opt-out line: a role address only (the recipient is a corporate subscriber).
export const NAMED_PERSON_BLOCKED_TLD = /\.(eu|at|be|bg|hr|cy|cz|dk|ee|fi|fr|de|gr|hu|ie|it|lv|lt|lu|mt|nl|pl|pt|ro|sk|si|es|se|uk|ch|no|is|li|ca)$/i;
export const RESERVED_DOMAIN = /(^|\.)(gov|mil|int)(\.[a-z]{2})?$|(^|\.)(example|test|invalid|localhost)$/i;
export const DEFAULTS = Object.freeze({ mode: "draft", daily_cap: 3, per_domain_cap: 1, recontact_days: 365, min_fit: 0.5, window_days: 14 });

const domainOf = (e) => String(e || "").trim().toLowerCase().split("@").pop() || "";
const localOf = (e) => String(e || "").trim().toLowerCase().split("@")[0] || "";

// ELIGIBILITY of one target row {email, org, segment, fit, fit_note, source_url, status}. Returns {ok, reasons[]}. Every reason is a code a probe can count.
export function eligibility(t, ctx = {}) {
  const r = [];
  const email = String(t && t.email || "").trim().toLowerCase();
  const dom = domainOf(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) r.push("bad-address");
  if (!SEGMENTS[t && t.segment]) r.push("unknown-segment");
  if (FREE_MAIL.test(dom)) r.push("free-mail");
  if (RESERVED_DOMAIN.test(dom)) r.push("reserved-domain");
  if (!t || !t.org) r.push("no-org");
  if (!t || !t.source_url || !/^https:\/\//.test(t.source_url)) r.push("no-public-source");
  if (!t || !t.fit_note || String(t.fit_note).trim().length < 30) r.push("no-specific-reason");
  if (!(Number(t && t.fit) >= (ctx.min_fit ?? DEFAULTS.min_fit))) r.push("low-fit");
  const role = ROLE_LOCAL.test(localOf(email));
  if (!role && NAMED_PERSON_BLOCKED_TLD.test(dom)) r.push("named-person-restricted-region");
  if (ctx.suppressed && ctx.suppressed.has(email)) r.push("suppressed");
  if (ctx.suppressedDomains && ctx.suppressedDomains.has(dom)) r.push("domain-suppressed");
  if (ctx.contacted && ctx.contacted.has(email)) r.push("recently-contacted");
  return { ok: r.length === 0, reasons: r, role_address: role };
}

// BUILD the message. Facts come only from FACTS; the one specific line is the target's fit_note, written from its own public statement and cited by source_url.
// cfg: {booking_url, postal_address, reply_to}. Without a postal address a live send is blocked (CAN-SPAM): `blocked` names it, a draft is still produced.
export function buildMessage(t, cfg = {}) {
  const seg = SEGMENTS[t.segment];
  const lines = [
    "Hello,",
    "",
    FACTS[0] + " " + FACTS[1],
    "",
    "I am writing to " + t.org + " because " + String(t.fit_note).trim().replace(/^because\s+/i, "").replace(/\.*$/, "") + " (" + t.source_url + ").",
    "",
    "What I can offer is " + seg.angle + ". " + FACTS[2],
    "",
    "I am not applying for a role. If any of this overlaps with what " + t.org + " needs, I would value a short conversation about those needs and where my work could help" +
      (cfg.booking_url ? "; you can pick a time here: " + cfg.booking_url : ", and a reply to this message is enough to start one") + ".",
    "",
    "This first message was sent by the automated system I operate; I read and answer replies myself.",
    "",
    OPT_OUT,
    "",
    "Best regards,",
    "Rowan Brad Quni-Gudzinas",
    "QNFO",
  ];
  if (cfg.postal_address) lines.push(String(cfg.postal_address).trim());
  const blocked = cfg.postal_address ? null : "postal-address-missing";
  return { subject: "A conversation about " + seg.label.toLowerCase() + " and autonomous research operations", text: lines.join("\n"), blocked };
}

// MODE: off | draft | live. Live also needs the fleet kill switch and a postal address; anything else degrades to draft, never to a send.
export function effectiveMode(cfg = {}, killSwitchOn = false) {
  const m = String(cfg.mode || DEFAULTS.mode).toLowerCase();
  if (m === "off") return "off";
  if (m === "live" && killSwitchOn && cfg.postal_address) return "live";
  return "draft";
}

// SEGMENT LEARNER: records = [{segment, sends, positive, stopped}]. `choose` is _shared/improve-loop.js chooseKnob (injected: this file has no imports).
// A segment with 30+ sends and no positive reply is stopped (a remedy that did not move its metric is replaced, not repeated).
export function segmentRecords(rows) {
  return Object.keys(SEGMENTS).map((segment) => {
    const x = rows.find((r) => r.segment === segment) || { sends: 0, positive: 0 };
    const sends = Number(x.sends || 0), positive = Number(x.positive || 0);
    return { knob: segment, tries: sends, keeps: positive, retired: sends >= 30 && positive === 0 };
  });
}
export function pickSegment(rows, choose) {
  const p = choose(segmentRecords(rows));
  return p ? p.knob : null;
}

// SELECT today's batch. targets: queued rows; ctx: {suppressed:Set, suppressedDomains:Set, contacted:Set, sentToday, domainsToday:Map, segmentRows, choose, cfg, shared:{n,cap}}.
// Returns {picked:[{target, segment}], skipped:[{email, reasons}], capped}. Picks one segment at a time from the learner so exploration and reward follow replies.
export function selectBatch(targets, ctx) {
  const cap = Math.min(ctx.cfg?.daily_cap ?? DEFAULTS.daily_cap, Math.max(0, (ctx.shared?.cap ?? 8) - (ctx.shared?.n ?? 0)));
  const dcap = ctx.cfg?.per_domain_cap ?? DEFAULTS.per_domain_cap;
  const skipped = [], pool = [];
  for (const t of targets) {
    const e = eligibility(t, { ...ctx, min_fit: ctx.cfg?.min_fit });
    if (e.ok) pool.push(t); else skipped.push({ email: t.email, reasons: e.reasons });
  }
  const picked = [], used = new Map(ctx.domainsToday || []);
  let left = cap - (ctx.sentToday || 0);
  const bySeg = (s) => pool.filter((t) => t.segment === s && !picked.some((p) => p.target.email === t.email))
    .sort((a, b) => Number(b.fit) - Number(a.fit));
  const rows = (ctx.segmentRows || []).map((r) => ({ ...r }));
  while (left > 0) {
    const seg = pickSegment(rows, ctx.choose);
    let t = null;
    // learner's segment first, then any other segment with a candidate, so an empty segment never stalls the day
    for (const s of [seg, ...Object.keys(SEGMENTS).filter((k) => k !== seg)]) {
      if (!s) continue;
      t = bySeg(s).find((c) => (used.get(domainOf(c.email)) || 0) < dcap) || null;
      if (t) break;
    }
    if (!t) break;
    picked.push({ target: t, segment: t.segment });
    used.set(domainOf(t.email), (used.get(domainOf(t.email)) || 0) + 1);
    const row = rows.find((r) => r.segment === t.segment);
    if (row) row.sends = Number(row.sends || 0) + 1; else rows.push({ segment: t.segment, sends: 1, positive: 0 });
    left--;
  }
  return { picked, skipped, capped: left <= 0 };
}

// REPLY classifier, deterministic. stop/decline end contact (stop also suppresses); interested is the reward; auto is ignored (no reward, no penalty).
export function classifyReply(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(auto[- ]?reply|automatic reply|out of (the )?office|undeliverable|delivery (status )?notification|mailer-daemon|on (annual )?leave)\b/.test(t)) return "auto";
  if (/\b(stop|unsubscribe|remove me|do not (contact|email)|don'?t (contact|email)|opt[- ]?out)\b/.test(t)) return "stop";
  if (/\b(not (interested|a fit|hiring)|no thanks?|no thank you|decline|unable to|cannot (help|engage)|not at this time|pass on)\b/.test(t)) return "decline";
  if (/\b(happy to|glad to|would love|let'?s (talk|chat|speak|schedule|set up)|schedule|calendar|call|meet|chat|intrigued|interesting|send (me )?(more|your)|tell me more|introduc)\b/.test(t)) return "interested";
  return "other";
}

// OUTCOME write-back for one reply class: what the log row, the suppression list and the learner get.
export function outcomeFor(kind) {
  return {
    interested: { status: "interested", positive: 1, suppress: false },
    decline: { status: "declined", positive: 0, suppress: false, stop_followups: true },
    stop: { status: "stopped", positive: 0, suppress: true, stop_followups: true },
    auto: { status: null, positive: 0, suppress: false },
    other: { status: "replied", positive: 0, suppress: false },
  }[kind] || { status: "replied", positive: 0, suppress: false };
}
