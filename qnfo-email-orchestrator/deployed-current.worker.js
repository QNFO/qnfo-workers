var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.5.3-send-retry"; // 0.5.3 CLEARED-SEND-RETRY-1: a cleared reply whose send fails keeps its auto-send marker and is retried up to 3 times (row 56 dead-ended on a 401 on 2026-10-05); the EMAIL binding declares props.caller so qnfo-email 2.5.1+ authenticates this worker without a key copy (#1923 class, CLAUDE.md #1703); 0.5.2 SLA-SES-ENVELOPE-1 (#1957): an Amazon SES message-id envelope (010101a1...-000000@sesmail.<domain>) is a transactional or bulk sender, so INBOUND-SLA-1 closes it as automated instead of holding it as an unknown person (iPostal1 mailbox notices reached the owner queue as "mail:ipostal1.com"; the owner closed the card, note 38). // 0.5.1: a failed send records a unique failure row (same-millisecond failures left a stale claim that read as an acknowledgement) /* 0.5.0 INBOUND-SLA-1 (2026-10-02, pillar: reach): no human inbound message waits more than 72h without a fleet action; category->action map, decision log, kill switch ops_config inbound_sla_enabled, metrics inbound_first_response_h_median_30d + inbound_unactioned_72h. 0.4.3 CAPABILITY-SELF-REPORT-1 */
var CLEARED_SEND_MAX_TRIES = 3;
var CAPS = ["reply-drafts", "cadence-log", "email-filters", "inbound-sla"];
var LIMS = ["cron-only: no public route; the reply-draft pass runs on its */15 and 3-hourly crons, INBOUND-SLA-1 on */15, its metrics on the 3-hourly cron", "never sends outreach or follow-ups; replies only to inbound mail, through qnfo-email /send", "INBOUND-SLA-1 mails nobody outside the research-outreach campaign and never a funder or hiring manager (docs/STRATEGY.md section 5): those messages are held and recorded for the weekly identity review", "publishes this capability row from the cron"];
var NAMESPACE = "email-orchestrator";
var DAY_ACTIONS = ["wednesday-response-check"];
var DOC = {
  service: "qnfo-email-orchestrator",
  version: VERSION,
  purpose: "Orchestrate the email+outreach cadence (outreach replies, follow-ups, day actions).",
  endpoints: {
    "GET /run/cadence?mode=dry|live": "full cadence run: inbox+replies+followup+day action+D1 log (AUTH REQUIRED)",
    "GET /run/cadence?date=YYYY-MM-DD&mode=live": "backfill a specific day's cadence run (AUTH REQUIRED)",
    "GET /status": "auth status",
    "GET /health": "worker health",
    "GET /api/docs": "api docs",
    "GET /api/email_filters": "list email filters (AUTH REQUIRED)"
  },
  cadence: {
    inbox: "latest 3h inbox summary (last24h count)",
    replies: "outreach replies detected and surfaced in cadence_runs.replies (canonical reply log is qnfo-outreach replies table; no outreach_threads table exists)",
    followup: "silent >14d outreach contacts (0 eligible per NO-FOLLOW-UP-DEFAULT-1); DOES NOT auto-follow-up",
    receipt: "NO self-mail (policy 2026-09-09): day summary persisted to cadence_runs only \u2014 alerts@qnfo.org was not provisioned, every send NDR-bounced into spam (108+ bounces)",
    day_action: "wednesday-response-check \u2014 RESERVED for human-action days (7-9 Sep): currently only emits receipt (now removed) and cadence_runs row; no auto-replies, no auto-follow-ups"
  },
  key: "Schedules a human-email/outreach cadence run. Run with mode=dry for a preview (recommended) or mode=live. mode=live performs real DB writes (but NO email sends: send-path removed as self-mail per policy).",
  note: "This service orchestration was resumed 2026-09-06. All outreach, brief, and daily-digest sends are SELF-MAIL which must be audited; user policy 2026-09-09: no self-mail.",
  safety: ["never send to human contacts from this service automatically", "cadence runs are read-heavy + DB writes only", "results logged to cadence_runs (D1)"],
  version_history: ["0.3.2: first orchestration-visible version", "0.3.3: RED-TEAM blockers added (same email filter whitelist; timezones; SMS; no actual follow-up sends)", "0.3.4-glm53: calendar-api bind + saturday weekly summary; receipt emailed to alerts@ (D1 sink)", "0.3.5: NO SELF-MAIL (policy 2026-09-09) \u2014 removed cadence receipt email to alerts@qnfo.org (unprovisioned -> NDR bounce into spam, 108+ bounces); cadence_runs D1 remains the record", "0.5.0: INBOUND-SLA-1 \u2014 every human inbound message gets a fleet action within 72h inside docs/STRATEGY.md section 5 (INBOUND_SLA_RULES); kill switch ops_config inbound_sla_enabled"]
};
// CAPABILITY-SELF-REPORT-1 (2026-10-01, #1735): this worker has no public route (CRON_ONLY, #1402), so the deploy-guard
// capability snapshot cannot probe its /health. Each cron run upserts its own capability_audit_snapshot row instead.
async function capSelfReport(db, name) {
  if (!db) return;
  try {
    await db.prepare("INSERT INTO capability_audit_snapshot (service, version, capabilities, limitations, ts) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(service) DO UPDATE SET version=excluded.version, capabilities=excluded.capabilities, limitations=excluded.limitations, ts=excluded.ts").bind(name, VERSION, JSON.stringify(CAPS), JSON.stringify(LIMS), new Date().toISOString()).run();
  } catch (e) {
  }
}
// INBOUND-SLA-1 (2026-10-02, pillar: reach). The owner delegated incoming mail to the fleet with no manual action, and
// directed that the fleet measure and improve how well it answers. qnfo-email enqueues every human inbound message as
// email_reply_queue 'escalate' ("awaiting authored draft") and nothing but a person or a session ever moved those rows,
// so they sat (10 on 2026-10-02, the oldest from 2026-08-06). This step gives every human inbound message a fleet action
// within 72h, inside docs/STRATEGY.md section 5 (owner-voice governance):
//   - section 5 "Never automatic": any email to a funder, hiring manager or other named person outside the
//     research-outreach campaign; anything that commits money or the owner's time. Those categories get no mail of any
//     kind, not even a holding note: they are held and recorded for the weekly identity review (qnfo-fleet-dashboard
//     IDENTITY-WEEKLY-1 reads the decision rows). Funder replies are also filed by GRANT-FOLLOWUP-1 (qnfo-cloud-ops).
//   - research correspondents (inside the campaign: contact_ledger or qnfo-outreach contacts, not suppressed) may get
//     one short answer drafted by the existing drafter when it passes the section 5 gates below, otherwise one holding
//     acknowledgement per thread that commits nothing and says it was sent automatically. Reserved topics (legal,
//     health or personal, money, press) never get a substantive answer: at most that acknowledgement.
//   - automated mail, solicitations, opt-outs, already-answered messages and thread-closing thanks are closed with a
//     reason; nothing is ever sent to an automated sender, a list or a no-reply address.
// Gates on every message it sends (section 5): (1) facts: the drafter adds nothing not in the inbound message and every
// number must appear in it; (2) identity lexicon; (3) encoding: ASCII only, no mojibake; (4) no links; (5) one per thread,
// one acknowledgement per sender per 30 days, 2 per run, 6 per day, 2 per domain per day; (6) kill switches: ops_config
// inbound_sla_enabled (absent = on) for the whole step and qnfo-outreach pipeline_state.external_sends_enabled for
// every send; (7) sent_at is set, so the qnfo-cloud-ops "sent as you" digest lists it. Every decision is one
// cloud_ops_events row (id inbound-sla-q-<queue id>; no body text, sender domain only) and the queue row's skip_reason;
// each run upserts inbound-sla-run-<day> (meta.last_ok), which the dashboard WATCHMAKER_OPS entry 'inbound-sla' reads.
var INBOUND_SLA = { deadline_h: 72, ack_max_age_d: 14, ack_sender_window_d: 30, scan_limit: 40, max_sends_per_run: 2, max_sends_per_day: 6, max_sends_per_domain_day: 2, max_drafts_per_run: 3, max_send_failures: 2, from: "rowan.quni@qnfo.org" };
// The category -> action map. action: close | skip (terminal, nothing sent), hold (nothing sent; recorded for the weekly
// identity review), hold_ack (one holding acknowledgement if the sender is a research correspondent, then hold), answer
// (a gated short answer from the drafter, else as hold_ack). after_h: grace before acting (0 = at once).
var INBOUND_SLA_RULES = {
  answered: { action: "close", after_h: 0, why: "an outbound reply to the sender is recorded after this message" },
  funder_receipt: { action: "close", after_h: 0, why: "a funder's submission receipt; recorded in funding/APPLICATIONS.md, GRANT-FOLLOWUP-1 watches replies" },
  funder_handled: { action: "close", after_h: 0, why: "a funder decision already recorded in funding/APPLICATIONS.md (GRANT-FOLLOWUP-1 handled_through)" },
  funder: { action: "hold", after_h: 24, why: "a funder: STRATEGY s5 sends no automatic email to a funder; GRANT-FOLLOWUP-1 files the reply as agent_issues" },
  automated: { action: "close", after_h: 0, why: "automated sender, receipt, auto-reply or list mail; never replied to" },
  solicitation: { action: "skip", after_h: 0, why: "publication or conference solicitation; no reply owed" },
  opt_out: { action: "close", after_h: 0, suppress: true, why: "the sender asked not to be contacted; added to email_suppression (OUTREACH-CONSENT-1)" },
  employment: { action: "hold", after_h: 24, why: "employment terms or a hiring manager: STRATEGY s5 never automatic" },
  commercial: { action: "hold", after_h: 24, why: "a commercial offer that would commit money or the owner's time: STRATEGY s5 never automatic" },
  legal: { action: "hold_ack", after_h: 24, why: "a legal matter: no substantive answer in the owner's name" },
  personal: { action: "hold_ack", after_h: 24, why: "a health, personal or privacy matter: no substantive answer in the owner's name" },
  money: { action: "hold_ack", after_h: 24, why: "would commit money: no substantive answer in the owner's name" },
  press: { action: "hold_ack", after_h: 24, why: "a press or media request: no statement in the owner's name" },
  thread_close: { action: "close", after_h: 0, why: "the message closes the thread (thanks, acknowledgement or decline) and asks nothing" },
  research_reply: { action: "answer", after_h: 24, why: "a research correspondent inside the research-outreach campaign" },
  unknown_human: { action: "hold", after_h: 24, why: "a named person outside the research-outreach campaign: STRATEGY s5 never automatic" }
};
// Funder domains: the submitted applications in qnfo-cloud-ops GRANT_APPLICATIONS (funding/APPLICATIONS.md) plus funders
// already in correspondence. handled_through: a decision on or before that day is already recorded.
var SLA_FUNDERS = [
  { domains: ["effectivealtruism.com", "effectivealtruism.org"], handled_through: "2026-10-01" },
  { domains: ["mercatus.gmu.edu", "mercatus.org"], handled_through: "2026-10-01" },
  { domains: ["manifund.org", "fil.org", "foresight.org", "lightconeinfrastructure.com", "lightconecommons.com", "lightconecommons.org", "nlnet.nl", "forecastingresearch.org", "openphilanthropy.org"] }
];
var SLA_INTERNAL_RX = /@(qnfo\.org|qnfo\.net|qnfo\.uk|q08\.org|qwav\.(org|tech|net|uk)|q-wave\.tech|qwave\.tech)$/i;
var SLA_MACHINE_RX = /(^|[^a-z])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|notify|alerts?|newsletter|news|digest|automated|auto-?confirm|support-noreply|dmarc\w*)([^a-z]|$)|^srs0=/i;
// SLA-SES-ENVELOPE-1 (#1957): Amazon SES puts its message id in the envelope sender (Return-Path). Every such envelope in
// qnfo-audit.emails on 2026-10-05 was transactional or bulk mail (iPostal1 notices, conference spam); none was a person.
var SLA_SES_ENVELOPE_RX = /^[0-9a-f]{16}-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}-[0-9a-f]{6}@/i;
var SLA_RECEIPT_RX = /thank(s| you) for (your )?(submission|submitting|applying|application|inquiry|enquiry|request|contacting)|application (has been |was )?(received|submitted)|submission (has been |was )?(received|confirmed)|(request|ticket)( #?\s*\S+)? (has been |was )?received|we('ve| have) received your|automatic reply|auto(matic)?[- ]?response|out of (the )?office|delivery status notification|undeliverable/i;
var SLA_SOLICIT_RX = /(article|manuscript|preprint|papers?)\s+(submission|publication)|(submit|publish|consider)\s+(your\s+)?(article|manuscript|preprint|paper)|invitation to (publish|submit|speak)|call for (papers|submissions?|chapters?|abstracts?)|editorial board|special issue|conference (invitation|registration)|webinar invitation/i;
var SLA_OPTOUT_RX = /\b(unsubscribe|remove me from|take me off|stop (emailing|contacting|sending)|do not (email|contact|write)|don['\u2019]?t (email|contact|write to) me|opt[- ]?out)\b/i;
var SLA_DECISION_RX = /\b(grant|funding|fellowship|award(ed)?|application|proposal)\b/i;
var SLA_TOPICS = [
  ["employment", /\b(job (offer|opening)|vacanc(y|ies)|salary|hiring|recruit(er|ing|ment)|employment|offer letter|internship|contract role|full-time|part-time role)\b/i],
  ["legal", /\b(legal|lawyer|attorney|solicitor|lawsuit|litigation|cease and desist|subpoena|court|gdpr|dmca|copyright|infring\w*|trademark|liabilit(y|ies)|non-disclosure|nda|indemnif\w*)\b/i],
  ["personal", /\b(medical|health|diagnos\w*|doctor|hospital|clinic|illness|condolence\w*|funeral|bereave\w*|personal data|privacy|data protection|removal request|delete my|immigration|visa|tax return)\b/i],
  ["money", /\b(invoice|payment|pay(ing)? (you|for)|paid|pricing|quotation|fee|fees|budget|wire transfer|bank|purchase|sponsor(ship)?|donat(e|ion)|royalt(y|ies)|licen[cs]e fee|commission)\b|[$\u20ac\u00a3]\s?\d/i],
  ["press", /\b(journalist|reporter|newsroom|press (inquiry|enquiry|request)|media (inquiry|enquiry|request)|for (an|a|our) (article|story|feature|piece|podcast|episode)|on the record|interview request)\b/i],
  ["commercial", /\b(business proposal|partnership (offer|opportunit\w*)|our services|we offer|offer you|discount|seo|lead generation|book a (call|demo)|free trial|white[- ]label|outsourc\w*)\b/i]
];
var SLA_CLOSE_RX = /\b(thank(s| you)|many thanks|appreciate(d)?|best wishes|noted|understood|got it|will do|sounds good|all the best|no connection|not (a )?(fit|relevant|related|interested)|don['\u2019]?t see (any|a|the) connection)\b/i;
var SLA_NEVER_DRAFT_RX = /never auto-draft|owner-authored reply required/i;
var SLA_BANNED_RX = [
  /research (foundation|collective)/i,
  /patent portfolio|patents developed|foundational (us )?patents/i,
  /clearance[- ]eligible|featured in national media|thermodynamic dead end/i,
  /\b\d{2,}\+\s*(publications|papers|records)\b/i
];
var SLA_COMMIT_RX = /\b(i will|i'll|we will|we'll|i can send|happy to (call|meet|send|share|review|join|help)|let'?s (schedule|meet|call|talk)|schedule a|available (on|at|for)|next week|tomorrow|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|invoice|payment|price|fee|contract|agree to|commit|promise)\b/i;
var SLA_TONE_RX = /cannot support|not interested|unfortunately|reject|decline|not a fit|unable to help|do not contact/i;
var SLA_MOJIBAKE_RX = /\u00c3|\u00e2\u20ac|\u00e2\u0080/;
var SLA_ACK_TEXT = ["Hello,", "", "Thank you for your message. It has been received and logged.", "", "This acknowledgement was sent automatically by the QNFO research system, which handles Rowan Brad Quni-Gudzinas's correspondence. It is not a substantive reply and makes no commitment on their behalf.", "", "Best regards,", "QNFO, for Rowan Brad Quni-Gudzinas", "rowan.quni@qnfo.org"].join("\n");
var SLA_ANSWER_SIGNOFF = ["", "", "Best regards,", "Rowan Brad Quni-Gudzinas", "QNFO", "", "--", "Drafted with AI assistance and sent automatically by the QNFO research system on Rowan's behalf."].join("\n");
function slaAddress(s) {
  var t = String(s || "");
  var m = /<\s*([^<>\s@]+@[^<>\s]+?)\s*>/.exec(t) || /([^\s<>"'(),;:]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(t);
  return m ? m[1].toLowerCase() : t.trim().toLowerCase();
}
function slaDomain(addr) {
  var i = String(addr || "").lastIndexOf("@");
  return i < 0 ? "" : String(addr).slice(i + 1).toLowerCase().replace(/[^a-z0-9.-]/g, "");
}
function slaDomainIn(dom, list) {
  for (var i = 0; i < list.length; i++) if (dom === list[i] || dom.endsWith("." + list[i])) return true;
  return false;
}
function slaUtf8(bin) {
  try { return new TextDecoder("utf-8").decode(Uint8Array.from(bin, function(c) { return c.charCodeAt(0) & 255; })); } catch (e) { return bin; }
}
function slaDecodeSubject(s) {
  return String(s || "").replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, function(m, cs, enc, data) {
    try {
      var bin = enc.toLowerCase() === "b" ? atob(data) : data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); });
      return /utf-?8/i.test(cs) ? slaUtf8(bin) : bin;
    } catch (e) { return m; }
  }).replace(/\?=\s+=\?/g, "").replace(/\s+/g, " ").trim();
}
function slaNormSubject(s) {
  return slaDecodeSubject(s).replace(/^(\s*(re|fwd?|aw|sv|vs|antw|tr)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function slaDecodePart(body, cte) {
  cte = String(cte || "").toLowerCase();
  try {
    if (cte.indexOf("base64") >= 0) {
      // qnfo-email cut stored bodies at 10,000 characters, so a base64 part can end mid-quantum: decode whole quanta.
      var b = String(body).replace(/[^A-Za-z0-9+/=]/g, "").replace(/=+(?=[A-Za-z0-9+/])/g, "");
      return slaUtf8(atob(b.slice(0, b.length - b.length % 4)));
    }
    if (cte.indexOf("quoted-printable") >= 0) return slaUtf8(String(body).replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); }));
  } catch (e) {}
  return String(body || "");
}
// The plain text of a stored body. Before the MIME parser fix of 2026-09-21 qnfo-email stored some bodies as raw MIME
// (boundary lines, part headers, base64 or quoted-printable), so a part is decoded here when the body still looks raw.
function slaPlainText(bodyText, bodyHtml) {
  var t = String(bodyText || "");
  if (!t.trim() && bodyHtml) t = String(bodyHtml).replace(/<(br|p|div)[^>]*>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  var head = t.slice(0, 600);
  if (!/^\s*(this is a multi-part message|--[^\r\n]{6,})/i.test(head) && !/^\s*content-type\s*:/im.test(head)) return t;
  var lines = t.split(/\r?\n/);
  var boundary = null;
  for (var i = 0; i < lines.length && i < 20; i++) { var m = /^--(\S{6,})\s*$/.exec(lines[i]); if (m) { boundary = m[1]; break; } }
  var parts = boundary ? t.split("--" + boundary) : [t];
  var best = null;
  for (var p = 0; p < parts.length; p++) {
    var part = parts[p].replace(/^\r?\n/, "");
    var sep = /\r?\n\r?\n/.exec(part);
    if (!sep) continue;
    var ph = part.slice(0, sep.index), pb = part.slice(sep.index + sep[0].length);
    if (!/content-type\s*:/i.test(ph) && !/content-transfer-encoding\s*:/i.test(ph)) continue;
    var cte = (/content-transfer-encoding\s*:\s*([^\r\n;]+)/i.exec(ph) || [])[1] || "";
    if (/text\/plain/i.test(ph)) return slaDecodePart(pb, cte);
    if (!best && /text\/html/i.test(ph)) best = slaDecodePart(pb, cte).replace(/<(br|p|div)[^>]*>/gi, "\n").replace(/<[^>]*>/g, " ");
  }
  return best || t;
}
// The new text of a reply: everything above the quoted history and the signature delimiter.
function slaNewText(text) {
  var out = [];
  var lines = String(text || "").replace(/\r/g, "").split("\n");
  for (var i = 0; i < lines.length; i++) {
    var s = lines[i];
    if (/^\s*>/.test(s)) break;
    if (/(wrote|schrieb|ha scritto|a \u00e9crit|escribi\u00f3|schreef|napisa\u0142)\s*:\s*$/i.test(s) || /\u043f\u0438\u0441\u0430\u043b/i.test(s)) break;
    if (/^\s*-{2,}\s*(original message|forwarded message|urspr\u00fcngliche nachricht)/i.test(s) || /^\s*_{8,}\s*$/.test(s) || /^\s*-- \s*$/.test(s) || /^-{20,}\s*$/.test(s)) break;
    if (/^\s*(from|von|da|de)\s*:\s.+/i.test(s) && out.join(" ").trim().length > 0) break;
    if (/^\s*sent from my /i.test(s)) break;
    out.push(s);
  }
  return out.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function slaHeaders(json) {
  var h = {};
  try { var o = JSON.parse(json || "{}") || {}; for (var k in o) h[String(k).toLowerCase()] = String(o[k] == null ? "" : o[k]); } catch (e) {}
  return h;
}
function slaFunder(dom) {
  for (var i = 0; i < SLA_FUNDERS.length; i++) if (slaDomainIn(dom, SLA_FUNDERS[i].domains)) return SLA_FUNDERS[i];
  return null;
}
// Deterministic categorisation (no model): facts in, { category, detail } out. Order matters: an answered or funder
// message is decided before anything that could send; automated and list mail before any human category.
function slaCategorize(f) {
  var addr = f.sender, dom = slaDomain(addr), subj = f.subject || "", text = f.text || "", hay = subj + "\n" + text;
  var h = f.headers || {};
  if (f.answered) return { category: "answered", detail: "outbound reply after the inbound" };
  var fund = slaFunder(dom);
  if (fund) {
    if (SLA_RECEIPT_RX.test(subj)) return { category: "funder_receipt", detail: dom };
    if (fund.handled_through && String(f.receivedAt || "").slice(0, 10) <= fund.handled_through) return { category: "funder_handled", detail: dom + " through " + fund.handled_through };
    return { category: "funder", detail: dom };
  }
  var auto = String(h["auto-submitted"] || "").toLowerCase();
  if (SLA_INTERNAL_RX.test(addr)) return { category: "automated", detail: "internal sender" };
  if (SLA_MACHINE_RX.test(addr.split("@")[0] || "") || /^srs0=/i.test(addr)) return { category: "automated", detail: "machine sender address" };
  if (SLA_SES_ENVELOPE_RX.test(addr)) return { category: "automated", detail: "bulk-sender envelope (Amazon SES message id)" };
  if ((auto && auto !== "no") || /bulk|list|junk|auto_reply/i.test(h["precedence"] || "") || h["list-id"] || h["list-unsubscribe"] || h["x-autoreply"] || h["x-autorespond"]) return { category: "automated", detail: "automated or list headers" };
  if (SLA_RECEIPT_RX.test(subj) || SLA_RECEIPT_RX.test(text.slice(0, 300))) return { category: "automated", detail: "receipt or auto-reply" };
  if (SLA_SOLICIT_RX.test(subj) || SLA_SOLICIT_RX.test(text.slice(0, 600))) return { category: "solicitation", detail: "solicitation pattern" };
  if (SLA_OPTOUT_RX.test(text.slice(0, 600))) return { category: "opt_out", detail: "opt-out wording" };
  if (!f.correspondent && SLA_DECISION_RX.test(subj) && /\b(grant|fund|fellowship|award)/i.test(hay)) return { category: "funder", detail: "funding subject" };
  for (var i = 0; i < SLA_TOPICS.length; i++) if (SLA_TOPICS[i][1].test(hay)) return { category: SLA_TOPICS[i][0], detail: "topic match" };
  if (text.length <= 400 && text.indexOf("?") < 0 && SLA_CLOSE_RX.test(text)) return { category: "thread_close", detail: "short thanks or decline, no question" };
  if (f.correspondent) return { category: "research_reply", detail: "research correspondent" };
  return { category: "unknown_human", detail: "not in contact_ledger or qnfo-outreach contacts" };
}
// Section 5 gates on a text the fleet would send. Returns null when it passes, else the first failing gate.
function slaGateText(text, source) {
  var t = String(text || "");
  if (!t.trim()) return "empty";
  if (SLA_MOJIBAKE_RX.test(t)) return "gate 3: mojibake";
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(t)) return "gate 3: non-ASCII text";
  if (/https?:\/\/|www\./i.test(t)) return "gate 4: links need liveness and UTM; the fleet adds none to replies";
  for (var i = 0; i < SLA_BANNED_RX.length; i++) if (SLA_BANNED_RX[i].test(t)) return "gate 2: identity lexicon";
  if (SLA_TONE_RX.test(t)) return "tone gate";
  if (source != null) {
    if (t.length > 700) return "too long for an automatic reply";
    if (SLA_COMMIT_RX.test(t)) return "commits the owner's time or money";
    var nums = t.match(/\d+(?:[.,]\d+)?/g) || [];
    for (var j = 0; j < nums.length; j++) if (String(source).indexOf(nums[j]) < 0) return "gate 1: a number not in the inbound message";
  }
  return null;
}
function slaAscii(s) {
  return String(s || "").replace(/[\u2018\u2019\u201a\u2032]/g, "'").replace(/[\u201c\u201d\u201e\u2033]/g, '"').replace(/[\u2013\u2014\u2212]/g, "-").replace(/\u2026/g, "...").replace(/\u00a0/g, " ");
}
function slaReplySubject(raw) {
  var s = slaAscii(slaDecodeSubject(raw)).replace(/\s+/g, " ").trim();
  if (!s || SLA_MOJIBAKE_RX.test(s) || /[^\x20-\x7e]/.test(s)) return "Re: your message";
  return /^re\s*:/i.test(s) ? s : "Re: " + s;
}
async function slaHash(s) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf)).slice(0, 8).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
}
async function slaFirst(db, sql, args) {
  var st = db.prepare(sql);
  if (args && args.length) st = st.bind.apply(st, args);
  return await st.first();
}
async function slaAll(db, sql, args) {
  var st = db.prepare(sql);
  if (args && args.length) st = st.bind.apply(st, args);
  var r = await st.all();
  return r && r.results || [];
}
async function slaRun(db, sql, args) {
  var st = db.prepare(sql);
  if (args && args.length) st = st.bind.apply(st, args);
  return await st.run();
}
// Kill switches: ops_config inbound_sla_enabled (absent = on) gates the step; qnfo-outreach external_sends_enabled
// (absent = on, unreadable = off) gates every send.
async function slaSwitches(env) {
  var on = true, sends = false, why = [];
  try {
    var r = await slaFirst(env.AUDIT_DB, "SELECT value FROM ops_config WHERE key = 'inbound_sla_enabled'");
    if (r && /^(0|off|false|no|disabled)$/i.test(String(r.value == null ? "" : r.value).trim())) on = false;
  } catch (e) { why.push("ops_config unreadable: " + String(e && e.message || e).slice(0, 80)); }
  try {
    if (!env.OUTREACH_DB) why.push("OUTREACH_DB absent: sends off");
    else {
      var p = await slaFirst(env.OUTREACH_DB, "SELECT value FROM pipeline_state WHERE key = 'external_sends_enabled'");
      sends = !p || p.value == null || String(p.value).trim() === "1";
      if (!sends) why.push("external_sends_enabled=" + String(p.value));
    }
  } catch (e) { sends = false; why.push("external_sends_enabled unreadable: sends off"); }
  if (!env.EMAIL) { sends = false; why.push("EMAIL binding absent: sends off"); }
  if (String(env.DRY_RUN || "").toLowerCase() === "true") { sends = false; why.push("DRY_RUN"); }
  return { on: on, sends: sends, why: why };
}
async function slaFacts(env, row, nowMs) {
  var sender = slaAddress(row.sender);
  var text = slaNewText(slaPlainText(row.body_text, row.body_html)).slice(0, 2500);
  var recv = row.received_at || row.created_at || "";
  var t = Date.parse(String(recv).indexOf("T") < 0 && /^\d{4}-\d{2}-\d{2} /.test(recv) ? recv.replace(" ", "T") + "Z" : recv);
  var ageH = isNaN(t) ? 0 : (nowMs - t) / 36e5;
  var answered = !!row.sent_at;
  if (!answered) {
    // A holding acknowledgement is not an answer: it must not close the thread's later messages.
    var o = await slaFirst(env.AUDIT_DB, "SELECT o.id FROM emails o WHERE o.id <> ?3 AND o.status IN ('sent', 'replied') AND (lower(o.sender) LIKE '%@qnfo.org' OR lower(o.sender) LIKE '%@qwav.tech' OR lower(o.sender) LIKE '%@qwav.org' OR lower(o.sender) LIKE '%@q08.org') AND instr(lower(o.recipient), ?1) > 0 AND julianday(o.received_at) > julianday(?2) AND instr(COALESCE(o.body_text, ''), 'This acknowledgement was sent automatically by the QNFO research system') = 0 LIMIT 1", [sender, recv, row.email_id || 0]);
    answered = !!o;
  }
  var ledger = null, contact = null, suppressed = false;
  try { ledger = await slaFirst(env.AUDIT_DB, "SELECT COALESCE(suppress, 0) AS suppress, COALESCE(reply_count, 0) AS reply_count FROM contact_ledger WHERE lower(email) = ?1", [sender]); } catch (e) {}
  try { if (env.OUTREACH_DB) contact = await slaFirst(env.OUTREACH_DB, "SELECT COALESCE(suppress, 0) AS suppress FROM contacts WHERE lower(email) = ?1", [sender]); } catch (e) {}
  try { suppressed = !!(await slaFirst(env.AUDIT_DB, "SELECT 1 AS s FROM email_suppression WHERE lower(email) = ?1", [sender])); } catch (e) { suppressed = true; }
  if (ledger && Number(ledger.suppress) === 1 || contact && Number(contact.suppress) === 1) suppressed = true;
  return {
    sender: sender, subject: slaDecodeSubject(row.subject), rawSubject: row.subject || "", text: text, headers: slaHeaders(row.headers_json),
    receivedAt: recv, ageH: ageH, answered: answered, suppressed: suppressed, repliedBefore: !!(ledger && Number(ledger.reply_count) > 0),
    correspondent: !!(ledger && Number(ledger.suppress) !== 1 || contact && Number(contact.suppress) !== 1),
    neverDraft: SLA_NEVER_DRAFT_RX.test(String(row.skip_reason || "")),
    threadKey: await slaHash(sender + "|" + slaNormSubject(row.subject)), senderKey: await slaHash(sender)
  };
}
// One decision per queue row: a cloud_ops_events row (first decision wins) and the queue row itself.
async function slaDecide(env, row, f, cat, rule, outcome, reason, extra) {
  var now = new Date().toISOString();
  var meta = { queue_id: row.qid, email_id: row.email_id, category: cat.category, action: rule.action, outcome: outcome, reason: reason, domain: slaDomain(f.sender), age_h: Math.round(f.ageH * 10) / 10, thread_key: f.threadKey, version: VERSION };
  var label = "INBOUND-SLA-1 " + cat.category + "/" + outcome + ": " + reason;
  await slaRun(env.AUDIT_DB, "INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'inbound-sla-decision', ?3, ?4, 'qnfo-email-orchestrator', ?5)", ["inbound-sla-q-" + row.qid, now, ("INBOUND-SLA-1 q" + row.qid + " " + cat.category + " -> " + outcome).slice(0, 200), JSON.stringify(meta), outcome]);
  var decision = outcome === "closed" ? "closed" : outcome === "skipped" ? "skip" : outcome === "answered" ? "sent" : "held";
  var sentAt = extra && extra.sent ? now.slice(0, 19).replace("T", " ") : null;
  await slaRun(env.AUDIT_DB, "UPDATE email_reply_queue SET decision = ?1, skip_reason = ?2, sent_at = COALESCE(?3, sent_at), updated_at = datetime('now') WHERE id = ?4 AND decision IN ('escalate', 'pending')", [decision, label.slice(0, 500), sentAt, row.qid]);
  // A message that went out is always stamped, even if another run decided the row first (gate 7 reads sent_at).
  if (sentAt) await slaRun(env.AUDIT_DB, "UPDATE email_reply_queue SET sent_at = COALESCE(sent_at, ?1) WHERE id = ?2", [sentAt, row.qid]);
  return { qid: row.qid, category: cat.category, outcome: outcome, reason: reason };
}
async function slaSendCounts(env, nowMs, dom, senderKey) {
  var day = new Date(nowMs).toISOString().slice(0, 10) + "T00:00:00.000Z";
  var since = new Date(nowMs - INBOUND_SLA.ack_sender_window_d * 864e5).toISOString();
  var a = await slaFirst(env.AUDIT_DB, "SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN json_extract(meta, '$.domain') = ?2 THEN 1 ELSE 0 END), 0) AS d FROM cloud_ops_events WHERE kind = 'inbound-sla-send' AND status IN ('sent', 'sending') AND ts >= ?1", [day, dom]);
  var s = await slaFirst(env.AUDIT_DB, "SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'inbound-sla-send' AND status IN ('sent', 'sending') AND json_extract(meta, '$.kind') = 'ack' AND json_extract(meta, '$.sender_key') = ?1 AND ts >= ?2", [senderKey, since]);
  return { day: Number(a && a.n || 0), domain: Number(a && a.d || 0), senderAcks: Number(s && s.n || 0) };
}
async function slaFailures(env, qid) {
  var r = await slaFirst(env.AUDIT_DB, "SELECT COUNT(*) AS n FROM cloud_ops_events WHERE id >= ?1 AND id < ?2", ["inbound-sla-fail-" + qid + "-", "inbound-sla-fail-" + qid + "."]);
  return Number(r && r.n || 0);
}
// Claim the thread (one message of each kind per thread, atomically), write the text to the queue row first so the
// qnfo-audit tone trigger can refuse it, then send through qnfo-email /send (suppression and tone checks again).
async function slaSendOnce(env, row, f, kind, body) {
  var claim = "inbound-sla-" + kind + "-" + f.threadKey;
  var meta = JSON.stringify({ queue_id: row.qid, kind: kind, domain: slaDomain(f.sender), sender_key: f.senderKey, version: VERSION });
  var c = await slaRun(env.AUDIT_DB, "INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'inbound-sla-send', ?3, ?4, 'qnfo-email-orchestrator', 'sending')", [claim, new Date().toISOString(), "INBOUND-SLA-1 " + kind + " q" + row.qid, meta]);
  if (!(c && c.meta && Number(c.meta.changes) > 0)) return { sent: false, already: true };
  // A failed send frees the thread claim (renamed to a failure row, which also counts the attempts) and clears the
  // draft, so qnfo-email's drain does not keep stamping a row that holds an unsent text.
  var fail = async function(why) {
    // The failure id must be unique: two failures in the same millisecond collided on the primary key, the rename
    // threw, and the leftover 'sending' claim then counted as an acknowledgement already sent to this sender.
    var fid = "inbound-sla-fail-" + row.qid + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    var ftext = ("INBOUND-SLA-1 " + kind + " q" + row.qid + " failed: " + why).slice(0, 200);
    try {
      await slaRun(env.AUDIT_DB, "UPDATE cloud_ops_events SET id = ?1, status = 'failed', text = ?2 WHERE id = ?3", [fid, ftext, claim]);
    } catch (e) {
      try { await slaRun(env.AUDIT_DB, "DELETE FROM cloud_ops_events WHERE id = ?1 AND status = 'sending'", [claim]); } catch (e2) {}
      try { await slaRun(env.AUDIT_DB, "INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'inbound-sla-send', ?3, ?4, 'qnfo-email-orchestrator', 'failed')", [fid + "-r", new Date().toISOString(), ftext, meta]); } catch (e3) {}
    }
    try { await slaRun(env.AUDIT_DB, "UPDATE email_reply_queue SET draft_text = NULL WHERE id = ?1 AND sent_at IS NULL", [row.qid]); } catch (e) {}
    return { sent: false, error: why };
  };
  try {
    await slaRun(env.AUDIT_DB, "UPDATE email_reply_queue SET draft_text = ?1, drafted_at = datetime('now') WHERE id = ?2", [body, row.qid]);
  } catch (e) { return await fail("draft refused: " + String(e && e.message || e).slice(0, 120)); }
  var resp = null;
  try {
    resp = await env.EMAIL.fetch("https://email/send", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") }, body: JSON.stringify({ to: f.sender, from: INBOUND_SLA.from, subject: slaReplySubject(f.rawSubject), body: body, reply_to_id: kind === "answer" ? row.email_id : undefined }) });
  } catch (e) { return await fail("send threw: " + String(e && e.message || e).slice(0, 120)); }
  if (!resp || !resp.ok) {
    var j = null;
    try { j = await resp.json(); } catch (e) {}
    return await fail("send HTTP " + (resp ? resp.status : "none") + (j && j.error ? " " + String(j.error).slice(0, 80) : ""));
  }
  await slaRun(env.AUDIT_DB, "UPDATE cloud_ops_events SET status = 'sent', ts = ?1 WHERE id = ?2", [new Date().toISOString(), claim]);
  return { sent: true };
}
// Where a send would be allowed: the reason it is not, or null.
function slaNoSendReason(f, sw, counts, budget) {
  if (!f.correspondent) return "not a research correspondent (STRATEGY s5: no automatic email to a named person outside the research-outreach campaign)";
  if (f.suppressed) return "sender suppressed";
  if (f.repliedBefore) return "contact_ledger records a reply; no repeat contact (OUTREACH-CONSENT-1)";
  if (SLA_MACHINE_RX.test(f.sender.split("@")[0] || "") || SLA_INTERNAL_RX.test(f.sender)) return "machine or internal sender";
  if (f.ageH > INBOUND_SLA.ack_max_age_d * 24) return "older than " + INBOUND_SLA.ack_max_age_d + " d: a late automatic note would read as noise";
  if (!sw.sends) return "deferred: sends paused (" + sw.why.join("; ") + ")";
  if (budget.sends >= INBOUND_SLA.max_sends_per_run || counts.day >= INBOUND_SLA.max_sends_per_day || counts.domain >= INBOUND_SLA.max_sends_per_domain_day) return "deferred: cadence cap reached";
  return null;
}
async function slaAckOrHold(env, row, f, cat, rule, sw, budget, nowMs, prefix) {
  var counts = await slaSendCounts(env, nowMs, slaDomain(f.sender), f.senderKey);
  var no = slaNoSendReason(f, sw, counts, budget);
  if (!no && counts.senderAcks > 0) no = "this sender already had an automatic acknowledgement in the last " + INBOUND_SLA.ack_sender_window_d + " d";
  if (!no && (await slaFailures(env, row.qid)) >= INBOUND_SLA.max_send_failures) no = "send failed " + INBOUND_SLA.max_send_failures + " times";
  if (no && /^deferred/.test(no) && f.ageH < INBOUND_SLA.deadline_h - 6) return { qid: row.qid, category: cat.category, outcome: "deferred", reason: no };
  if (no) return await slaDecide(env, row, f, cat, rule, "held", (prefix ? prefix + "; " : "") + rule.why + "; no acknowledgement: " + no + "; recorded for the weekly identity review");
  var g = slaGateText(SLA_ACK_TEXT, null);
  if (g) return await slaDecide(env, row, f, cat, rule, "held", rule.why + "; acknowledgement failed " + g);
  budget.sends++;
  var s = await slaSendOnce(env, row, f, "ack", SLA_ACK_TEXT);
  if (s.already) return await slaDecide(env, row, f, cat, rule, "held", (prefix ? prefix + "; " : "") + rule.why + "; this thread already had its one acknowledgement; recorded for the weekly identity review");
  if (!s.sent) return { qid: row.qid, category: cat.category, outcome: "send_failed", reason: s.error };
  return await slaDecide(env, row, f, cat, rule, "acked", (prefix ? prefix + "; " : "") + rule.why + "; one holding acknowledgement sent (commits nothing); recorded for the weekly identity review", { sent: true });
}
async function slaAnswer(env, row, f, cat, rule, sw, budget, nowMs) {
  var why = "";
  if (f.neverDraft) why = "the queue row says owner-authored reply required, never auto-draft (#1158)";
  else if (!f.text) why = "no readable text";
  else if (budget.drafts >= INBOUND_SLA.max_drafts_per_run) return { qid: row.qid, category: cat.category, outcome: "deferred", reason: "draft budget for this run spent" };
  else {
    var counts = await slaSendCounts(env, nowMs, slaDomain(f.sender), f.senderKey);
    var no = slaNoSendReason(f, sw, counts, budget);
    if (no && /^deferred/.test(no) && f.ageH < INBOUND_SLA.deadline_h - 6) return { qid: row.qid, category: cat.category, outcome: "deferred", reason: no };
    if (no) why = "no answer: " + no;
    else {
      budget.drafts++;
      var cls = await worker_default.cheapClassify(env, { sender: f.sender, subject: f.subject, body_text: f.text });
      var draft = cls && !cls.escalate ? slaAscii(String(cls.draft || "")).replace(/\s+$/g, "").trim() : "";
      var g = draft ? slaGateText(draft, f.subject + "\n" + f.text) : "drafter escalated (" + (cls && cls.reason || "no draft") + ")";
      if (g) why = "no substantive answer: " + g;
      else {
        budget.sends++;
        var s = await slaSendOnce(env, row, f, "answer", draft + SLA_ANSWER_SIGNOFF);
        if (s.sent) return await slaDecide(env, row, f, cat, rule, "answered", rule.why + "; short answer from the drafter passed the section 5 gates", { sent: true });
        if (!s.already) return { qid: row.qid, category: cat.category, outcome: "send_failed", reason: s.error };
        why = "this thread already had its one automatic answer";
      }
    }
  }
  return await slaAckOrHold(env, row, f, cat, rule, sw, budget, nowMs, why);
}
async function slaLedger(env, nowMs, status, summary) {
  var day = new Date(nowMs).toISOString().slice(0, 10);
  var id = "inbound-sla-run-" + day;
  var prev = null;
  try { prev = await slaFirst(env.AUDIT_DB, "SELECT meta FROM cloud_ops_events WHERE id = ?1", [id]); } catch (e) {}
  var pm = {};
  try { pm = prev && JSON.parse(prev.meta || "{}") || {}; } catch (e) {}
  var meta = { last_ok: status === "ok" ? new Date(nowMs).toISOString() : pm.last_ok || null, runs: (Number(pm.runs) || 0) + 1, last: summary, version: VERSION };
  await slaRun(env.AUDIT_DB, "INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'inbound-sla-run', ?3, ?4, 'qnfo-email-orchestrator', ?5) ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, text = excluded.text, meta = excluded.meta, status = excluded.status", [id, new Date(nowMs).toISOString(), ("INBOUND-SLA-1 " + status + ": " + JSON.stringify(summary.counts || {})).slice(0, 300), JSON.stringify(meta), status]);
}
async function inboundSlaStep(env, opts) {
  opts = opts || {};
  var nowMs = opts.nowMs || Date.now();
  var out = { version: VERSION, scanned: 0, counts: {}, items: [] };
  if (!env || !env.AUDIT_DB) return { skipped: "AUDIT_DB absent" };
  var sw = await slaSwitches(env);
  out.sends_enabled = sw.sends;
  if (sw.why.length) out.switch_notes = sw.why;
  if (!sw.on) {
    out.disabled = "ops_config inbound_sla_enabled is off";
    await slaLedger(env, nowMs, "disabled", out);
    return out;
  }
  try {
    var rows = await slaAll(env.AUDIT_DB, "SELECT q.id AS qid, q.email_id, q.sender, q.subject, q.received_at, q.created_at, q.decision, q.skip_reason, q.sent_at, e.body_text, e.body_html, e.headers_json FROM email_reply_queue q LEFT JOIN emails e ON e.id = q.email_id WHERE q.decision IN ('escalate', 'pending') AND q.sent_at IS NULL AND COALESCE(q.skip_reason, '') NOT LIKE '%cleared for auto-send%' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events d WHERE d.id = 'inbound-sla-q-' || q.id) ORDER BY q.id ASC LIMIT ?1", [INBOUND_SLA.scan_limit]);
    var budget = { sends: 0, drafts: 0 };
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      out.scanned++;
      var res;
      try {
        var f = await slaFacts(env, row, nowMs);
        var cat = slaCategorize(f);
        var rule = INBOUND_SLA_RULES[cat.category] || INBOUND_SLA_RULES.unknown_human;
        if (f.ageH < rule.after_h) res = { qid: row.qid, category: cat.category, outcome: "waiting", reason: "inside the " + rule.after_h + "h grace" };
        else if (rule.action === "close" || rule.action === "skip") {
          if (rule.suppress) await slaRun(env.AUDIT_DB, "INSERT OR IGNORE INTO email_suppression (email, reason, source) VALUES (?1, 'opt-out reply', 'INBOUND-SLA-1')", [f.sender]);
          res = await slaDecide(env, row, f, cat, rule, rule.action === "skip" ? "skipped" : "closed", rule.why + " (" + cat.detail + ")");
        } else if (rule.action === "hold") res = await slaDecide(env, row, f, cat, rule, "held", rule.why + "; nothing sent; recorded for the weekly identity review");
        else if (rule.action === "hold_ack") res = await slaAckOrHold(env, row, f, cat, rule, sw, budget, nowMs, "");
        else res = await slaAnswer(env, row, f, cat, rule, sw, budget, nowMs);
      } catch (e) {
        res = { qid: row.qid, outcome: "error", reason: String(e && e.message || e).slice(0, 160) };
      }
      out.counts[res.outcome] = (out.counts[res.outcome] || 0) + 1;
      out.items.push(res);
    }
    await slaLedger(env, nowMs, "ok", { scanned: out.scanned, counts: out.counts, sends_enabled: sw.sends });
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 200);
    try { await slaLedger(env, nowMs, "error", { error: out.error, counts: out.counts }); } catch (e2) {}
  }
  return out;
}
// Metrics (3-hourly cron, idempotent upsert). Human inbound = queue rows except machine, solicitation and automated ones.
// First fleet action = the earliest of: an INBOUND-SLA-1 decision, sent_at, an outbound mail to the sender after the
// message, or (for rows decided before this step existed) updated_at. Rows still waiting count with their current age, so
// the median cannot look better by ignoring what is unanswered.
var SLA_NOT_HUMAN_RX = /^db-trigger:|^INBOUND-SLA-1 (automated|solicitation|funder_receipt)\/|solicitation|machine relay|transactional notice/i;
async function inboundSlaMetrics(env, opts) {
  opts = opts || {};
  var nowMs = opts.nowMs || Date.now();
  var since = new Date(nowMs - 30 * 864e5).toISOString();
  // The median covers messages received in the last 30 days; the unactioned count covers every waiting row, however old.
  var rows = await slaAll(env.AUDIT_DB, "SELECT q.id, q.decision, q.skip_reason, julianday(q.received_at) >= julianday(?1) AS in_window, julianday(COALESCE(q.received_at, q.created_at)) AS rj, julianday(q.sent_at) AS sj, julianday(q.updated_at) AS uj, (SELECT julianday(d.ts) FROM cloud_ops_events d WHERE d.id = 'inbound-sla-q-' || q.id) AS dj, (SELECT MIN(julianday(o.received_at)) FROM emails o WHERE o.status IN ('sent', 'replied') AND lower(o.sender) LIKE '%@qnfo.org' AND instr(lower(o.recipient), lower(q.sender)) > 0 AND julianday(o.received_at) > julianday(q.received_at)) AS oj FROM email_reply_queue q WHERE julianday(q.received_at) >= julianday(?1) OR q.decision IN ('escalate', 'pending')", [since]);
  var nowJ = nowMs / 864e5 + 2440587.5;
  var hours = [], unactioned = 0, waiting = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.rj == null || SLA_NOT_HUMAN_RX.test(String(r.skip_reason || ""))) continue;
    var cands = [r.sj, r.dj, r.oj].filter(function(v) { return v != null && v >= r.rj; });
    if (!cands.length && r.decision !== "escalate" && r.decision !== "pending" && r.uj != null) cands.push(Math.max(r.uj, r.rj));
    var first = cands.length ? Math.min.apply(null, cands) : null;
    if (first == null && (nowJ - r.rj) * 24 > INBOUND_SLA.deadline_h) unactioned++;
    if (!Number(r.in_window)) continue;
    if (first == null) waiting++;
    hours.push(((first == null ? nowJ : first) - r.rj) * 24);
  }
  hours.sort(function(a, b) { return a - b; });
  var med = hours.length ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2) : null;
  var value = med == null ? "n/a: no human inbound in 30 days" : String(Math.round(med * 10) / 10);
  var at = new Date(nowMs).toISOString();
  var defs = [
    ["inbound_first_response_h_median_30d", "lagging", "median hours from a human inbound message (email_reply_queue, last 30 days, machine/solicitation/automated excluded) to the first fleet action: INBOUND-SLA-1 decision, sent_at, or an outbound mail to the sender; unanswered rows count at their current age", "<=24", value],
    ["inbound_unactioned_72h", "leading", "human inbound messages of any age still waiting (escalate/pending) more than 72h with no fleet action: no INBOUND-SLA-1 decision, no sent_at, no outbound mail to the sender (INBOUND-SLA-1 target 0)", "0", String(unactioned)]
  ];
  for (var k = 0; k < defs.length; k++) {
    await slaRun(env.AUDIT_DB, "INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state) VALUES (?1, 'fleet', ?2, ?3, 'qnfo-audit email_reply_queue + cloud_ops_events inbound-sla-q-* + outbound emails (qnfo-email-orchestrator INBOUND-SLA-1)', ?4, 'qnfo-email-orchestrator', 'fleet', '*/3h', 'MEASURED')", [defs[k][0], defs[k][1], defs[k][2], defs[k][3]]);
    await slaRun(env.AUDIT_DB, "UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2 WHERE metric = ?3", [defs[k][4], at, defs[k][0]]);
  }
  return { human_30d: hours.length, waiting: waiting, unactioned_72h: unactioned, median_h: med == null ? null : Math.round(med * 10) / 10 };
}
var worker_default = {
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname;
    if (request.method === "OPTIONS") return this.cors();
    try {
      if (path === "/" || path === "/health") return this.health(env);
      if (path === "/status") return this.cors(json({ ok: true, service: "qnfo-email-orchestrator", version: VERSION, features: ["cadence", "d1-log-only", "no-self-mail"], auth: !!env.OUTREACH_SECRET }));
      if (path === "/api/docs") return this.cors(json({ ok: true, doc: DOC }));
      if (path === "/run/cadence") return await this.runCadence(request, env, url);
      if (path === "/run/replies") return await this.runReplies(request, env, url);
      if (path === "/api/email_filters") return await this.listEmailFilters(request, env);
      if (path === "/api/docs-html") {
        return new Response("<!doctype html><meta charset=utf-8><title>email-orchestrator docs</title><pre>" + esc(JSON.stringify(DOC, null, 2)) + "</pre>", { status: 200, headers: this.headers("text/html") });
      }
      return new Response("not found: " + path, { status: 404 });
    } catch (e) {
      return this.cors(json({ ok: false, error: e.message }, 500));
    }
  },
  cors(res) {
    return res;
  },
  headers(type) {
    var h = { "content-type": type + "; charset=utf-8", "access-control-allow-origin": "*" };
    if (type === "text/html") h["content-type"] = "text/html; charset=utf-8";
    return h;
  },
  auth(env, request) {
    var h = request.headers.get("x-outreach-secret");
    if (!env.OUTREACH_SECRET) return { ok: true, reason: "no secret configured" };
    return h === env.OUTREACH_SECRET ? { ok: true } : { ok: false, reason: "bad secret" };
  },
  async health(env) {
    var out = { ok: true, service: NAMESPACE, version: VERSION, capabilities: CAPS, limitations: LIMS, time: (/* @__PURE__ */ new Date()).toISOString(), uptime: Date.now() - (globalThis.__start || Date.now()) };
    if (!globalThis.__start) globalThis.__start = Date.now();
    try {
      var r = await env.OUTREACH_DB.prepare("SELECT COUNT(*) c FROM cadence_runs").first();
      out.db = "ok (" + (r ? r.c : "?") + " rows)";
    } catch (e) {
      out.db = "ERR " + e.message;
      out.ok = false;
    }
    if (!env.EMAIL) {
      out.email_service = "missing binding";
      out.ok = false;
    } else {
      out.email_service = "bound";
    }
    out.features = ["cadence", "d1-log-only", "no-self-mail"];
    return this.cors(json(out));
  },
  json(o, status) {
    return json(o, status);
  },
  emailAuth(env) {
    var h = {};
    if (env.EMAIL_API_KEY) h["x-api-key"] = env.EMAIL_API_KEY;
    return h;
  },
  // EMAIL-HUMAN-REPLY-LOOP-MISSING (942): triage-and-draft the human reply queue.
  // Conservative v1: auto-send ONLY short grounded acknowledgments; escalate every
  // technical/scientific/licensing/legal/opinion item so nothing is hallucinated
  // from the owner's name. Uses the cheap Workers AI model (no OpenAI cost).
  async runReplies(request, env, url) {
    var a = this.auth(env, request);
    if (!a.ok) return this.cors(json({ ok: false, error: "auth: " + a.reason }, 401));
    var dry = url.searchParams.get("mode") !== "live";
    return this.cors(json(await this.runRepliesInternal(env, dry)));
  },
  async scheduled(controller, env, ctx) {
    var hbOk = 1;
    try { var r = await this.runRepliesInternal(env, false); console.log("reply-draft:", JSON.stringify(r)); }
    catch (e) { hbOk = 0; console.error("reply-draft failed:", String(e && e.message || e)); }
    // INBOUND-SLA-1: the SLA step on the */15 cron only (the 3-hourly cron fires in the same minute, and two concurrent
    // steps must not race; the per-thread claim row would stop a double send anyway), the metrics on the 3-hourly cron.
    var cron = controller && controller.cron || "";
    if (!cron || cron === "*/15 * * * *") {
      try { var s = await inboundSlaStep(env, {}); console.log("inbound-sla:", JSON.stringify({ scanned: s.scanned, counts: s.counts, disabled: s.disabled || null, error: s.error || null })); }
      catch (e) { console.error("inbound-sla failed:", String(e && e.message || e)); }
    }
    if (!cron || cron === "0 */3 * * *") {
      try { console.log("inbound-sla metrics:", JSON.stringify(await inboundSlaMetrics(env, {}))); }
      catch (e) { console.error("inbound-sla metrics failed:", String(e && e.message || e)); }
    }
    // CRON-ONLY-HEARTBEAT-1 (2026-09-30): no workers.dev route (CRON_ONLY, #1402), so liveness is published here and
    // read by qnfo-fleet-control /state; without it the fleet could not tell this worker from a dead one.
    try { await env.AUDIT_DB.prepare("INSERT INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind("qnfo-email-orchestrator", VERSION, new Date().toISOString(), hbOk).run(); }
    catch (e) { console.error("heartbeat failed:", String(e && e.message || e)); }
    await capSelfReport(env.AUDIT_DB, "qnfo-email-orchestrator");
  },
  async runRepliesInternal(env, dry) {
    // EMAIL-PIPELINE-ESCALATE-DEADEND-1 (#1251): also scan escalated rows that a
    // human/agent has CLEARED for auto-send, so a reviewed-and-cleared escalation
    // is not a permanent dead-end. Cleared rows carry the marker in skip_reason.
    // INBOUND-SLA-1 (0.5.0): 'pending' rows are no longer drafted and sent here. This path mailed any sender, funders and
    // people outside the research-outreach campaign included, with none of the docs/STRATEGY.md section 5 gates;
    // inboundSlaStep now decides 'pending' rows like 'escalate' ones. Only cleared escalations are sent from here.
    var rows = await env.AUDIT_DB.prepare("SELECT q.id AS qid, q.email_id, q.sender, q.subject, e.body_text, q.draft_text, q.decision, q.skip_reason FROM email_reply_queue q LEFT JOIN emails e ON e.id = q.email_id WHERE q.decision = 'escalate' AND q.skip_reason LIKE '%cleared for auto-send%' ORDER BY q.id ASC LIMIT 25").all();
    var list = rows.results || [];
    var out = { scanned: list.length, dry: dry, sent: 0, escalated: 0, skipped: 0, items: [] };
    for (var i = 0; i < list.length; i++) {
      var res = await this.draftOne(env, list[i], dry);
      if (res && res.action === "sent") out.sent++;
      else if (res && res.action === "escalate") out.escalated++;
      else out.skipped++;
      out.items.push(res);
    }
    return out;
  },
  async draftOne(env, row, dry) {
    var qid = row.qid;
    try {
      // EMAIL-PIPELINE-ESCALATE-DEADEND-1 (#1251): a cleared escalation carries a
      // pre-authored draft in draft_text. Send it directly without re-classifying
      // (cheapClassify would escalate it again, recreating the dead-end loop).
      if (row.decision === "escalate" && String(row.skip_reason || "").indexOf("cleared for auto-send") >= 0) {
        var authored = String(row.draft_text || "").trim();
        if (!authored) { await this.setDecision(env, qid, "escalate", "cleared-but-empty-draft"); return { qid: qid, action: "escalate", reason: "cleared-but-empty-draft" }; }
        if (dry) return { qid: qid, action: "would-send", draft: authored };
        var cr = await env.EMAIL.fetch("https://email/send", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") }, body: JSON.stringify({ to: row.sender, from: "qnfo@qnfo.org", subject: "Re: " + (row.subject || "(no subject)"), body: authored, reply_to_id: row.email_id }) });
        if (cr && cr.ok) { await this.setDecision(env, qid, "sent", "cleared-draft-sent", authored); return { qid: qid, action: "sent", via: "cleared-draft" }; }
        // CLEARED-SEND-RETRY-1 (0.5.3): a failed send keeps the "cleared for auto-send" marker, with a try count, so the
        // next run retries the row (a 401 here dead-ended row 56 on 2026-10-05); after CLEARED_SEND_MAX_TRIES it is left
        // escalated with the last status for a person to look at.
        var tries = (Number((String(row.skip_reason || "").match(/send-failed:\S+ x(\d+)/) || [])[1]) || 0) + 1;
        var st = cr ? cr.status : "no-resp";
        if (tries < CLEARED_SEND_MAX_TRIES) await this.setDecision(env, qid, "escalate", "cleared for auto-send; send-failed:" + st + " x" + tries + " " + new Date().toISOString());
        else await this.setDecision(env, qid, "escalate", "cleared-send-failed:" + st + " x" + tries);
        return { qid: qid, action: "escalate", reason: "cleared-send-failed", tries: tries };
      }
      var prior = await env.AUDIT_DB.prepare("SELECT id FROM email_reply_queue WHERE lower(sender)=?1 AND id < ?2 AND decision IN ('sent','drafted')").bind(String(row.sender || "").toLowerCase(), qid).first();
      if (prior) { await this.setDecision(env, qid, "skip", "no-repeat"); return { qid: qid, action: "skip", reason: "no-repeat" }; }
      var cls = await this.cheapClassify(env, row);
      if (cls.escalate) { await this.setDecision(env, qid, "escalate", cls.reason); return { qid: qid, action: "escalate", reason: cls.reason }; }
      if (!cls.draft) { await this.setDecision(env, qid, "escalate", "empty-draft"); return { qid: qid, action: "escalate", reason: "empty-draft" }; }
      if (dry) return { qid: qid, action: "would-send", draft: cls.draft };
      var resp = await env.EMAIL.fetch("https://email/send", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") }, body: JSON.stringify({ to: row.sender, from: "qnfo@qnfo.org", subject: "Re: " + (row.subject || "(no subject)"), body: cls.draft, reply_to_id: row.email_id }) });
      if (resp && resp.ok) { await this.setDecision(env, qid, "sent", null, cls.draft); return { qid: qid, action: "sent" }; }
      var rj = null; try { rj = await resp.json(); } catch (e) {}
      await this.setDecision(env, qid, "escalate", "send-failed:" + (resp ? resp.status : "no-resp") + ":" + (rj && rj.error || ""));
      return { qid: qid, action: "escalate", reason: "send-failed" };
    } catch (e) {
      try { await this.setDecision(env, qid, "escalate", "error:" + e.message); } catch (e2) {}
      return { qid: qid, action: "escalate", reason: "error:" + e.message };
    }
  },
  async setDecision(env, qid, decision, reason, draft) {
    await env.AUDIT_DB.prepare("UPDATE email_reply_queue SET decision=?1, skip_reason=?2, draft_text=COALESCE(?3, draft_text), drafted_at=datetime('now'), updated_at=datetime('now') WHERE id=?4").bind(decision, reason || null, draft || null, qid).run();
  },
  async cheapClassify(env, row) {
    var body = String(row.body_text || "").slice(0, 2500);
    var NL = String.fromCharCode(10);
    var sys = "You triage inbound email for an assistant answering on its owner's behalf. Decide ONE action. DRAFT: the email is a simple logistical or scheduling message answerable from its own content (meeting confirm, receipt, availability, a thanks, a short logistics question) - output a 1-2 sentence polite professional reply that introduces no fact not present in the email. ESCALATE: anything technical, scientific, licensing, legal, financial, a review or opinion request, or anything you cannot answer with certainty - output only the word ESCALATE. Output exactly either 'DRAFT: <text>' or 'ESCALATE'.";
    var usr = "From: " + (row.sender || "") + NL + "Subject: " + (row.subject || "") + NL + NL + body;
    var out = { escalate: false, reason: "", draft: "" };
    try {
      var resp = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: 200 });
      var txt = String(resp && (resp.response || resp.output || "")).trim();
      var up = txt.toUpperCase();
      if (!txt) { out.escalate = true; out.reason = "empty-model-output"; return out; }
      if (up.indexOf("ESCALATE") === 0) { out.escalate = true; out.reason = "model-escalate"; return out; }
      if (up.indexOf("DRAFT:") === 0) { out.draft = txt.slice(6).trim(); } else { out.draft = txt; }
      if (!out.draft) { out.escalate = true; out.reason = "unparseable"; }
      return out;
    } catch (e) { out.escalate = true; out.reason = "model-error:" + e.message; return out; }
  },
  async listEmailFilters(request, env) {
    var a = this.auth(env, request);
    if (!a.ok) return this.cors(json({ ok: false, error: "auth: " + a.reason }, 401));
    try {
      var rows = await env.AUDIT_DB.prepare("SELECT id, field, pattern, action, reply_template, priority, enabled, rule_type FROM email_filters ORDER BY priority DESC").all();
      return this.cors(json({ ok: true, filters: rows.results || [] }));
    } catch (e) {
      return this.cors(json({ ok: false, error: e.message }, 500));
    }
  },
  async runCadence(request, env, url) {
    var a = this.auth(env, request);
    if (!a.ok) return this.cors(json({ ok: false, error: "auth: " + a.reason }, 401));
    var dry = url.searchParams.get("mode") !== "live";
    var dateStr = url.searchParams.get("date") || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    var now = /* @__PURE__ */ new Date();
    var day = now.toISOString().slice(0, 10);
    if (dateStr && dateStr !== day) {
      now = /* @__PURE__ */ new Date(dateStr + "T12:00:00Z");
      day = dateStr;
    }
    var result = { date: day, dry, started: now.toISOString(), mode: dry ? "dry" : "live" };
    try {
      var ib = await env.EMAIL.fetch("https://email/stats", { method: "GET", headers: this.emailAuth(env) });
      var ibj = await ib.json();
      if (ibj && ibj.total !== undefined) result.inbox = { total: ibj.total, last24h: ibj.last24h ?? null };
      else result.inbox = { error: (ibj && ibj.error) || "inbox fetch failed" };
    } catch (e) {
      result.inbox = { error: "inbox exception " + e.message };
    }
    result.replies = [];
    try {
      var ore = await env.EMAIL.fetch("https://email/outreach/replies", { method: "GET", headers: this.emailAuth(env) });
      var orej = await ore.json();
      if (orej.ok && orej.replies) result.replies = orej.replies.map(function(x) {
        return { from: x.from, response_type: x.response_type, reason: x.reason || "", duplicate: !!x.duplicate };
      });
    } catch (e) {
      result.replies_error = e.message;
    }
    try {
      var fu = await env.EMAIL.fetch("https://email/outreach/followup?days=14", { method: "GET", headers: this.emailAuth(env) });
      var fuj = await fu.json();
      result.followup_eligible = fuj.ok ? fuj.count || 0 : -1;
      result.followup_due = fuj.ok ? fuj.due || [] : [];
    } catch (e) {
      result.followup_eligible = -1;
      result.followup_due = [];
    }
    if (DAY_ACTIONS.indexOf("wednesday-response-check") !== -1) {
      try {
        var wd = new Date(now.getTime() + 36e5 * 2).getUTCDay();
        var dayAction = { name: "wednesday-response-check", eligible_day: wd === 3 };
        dayAction.note = "Reserved for human-action days (7-9 Sep): no auto-replies, no auto-follow-ups. Reads + cadence_runs only.";
        result.day_action = dayAction;
      } catch (e) {
        result.day_action = { error: e.message };
      }
    }
    try {
      var sc = await env.EMAIL.fetch("https://email/scan?limit=2", { method: "GET", headers: this.emailAuth(env) });
      var scj = await sc.json();
      if (scj.ok && scj.scan && scj.scan.length) result.scan = scj.scan.slice(0, 2);
    } catch (e) {
      result.scan_error = e.message;
    }
    if (!dry && wd === 6) {
      try {
        var wr = await env.EMAIL.fetch("https://email/outreach/weekly?mode=live", { method: "GET", headers: this.emailAuth(env) });
        var wrj = await wr.json();
        result.weekly = wrj.ok ? wrj : { error: wrj.error || "weekly failed" };
      } catch (e) {
        result.weekly = { error: e.message };
      }
    }
    if (!dry) {
      var ended = (/* @__PURE__ */ new Date()).toISOString();
      try {
        var ins = await env.OUTREACH_DB.prepare("INSERT INTO cadence_runs (date, run_at, mode, result, version) VALUES (?1, ?2, ?3, ?4, ?5)").bind(day, ended, "live", JSON.stringify({ inbox: result.inbox, replies: result.replies, followup_eligible: result.followup_eligible, day_action: result.day_action, scan: result.scan ? result.scan.length : 0 }), VERSION).run();
        result.saved = true;
      } catch (e) {
        result.saved = false;
        result.save_error = e.message;
      }
    } else {
      result.saved = false;
    }
    return this.cors(json(result));
  }
};
function json(o, status) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
}
__name(json, "json");
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(esc, "esc");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map