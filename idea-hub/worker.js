// idea-hub v1.5.8-diversity-cap-20261006: IDEA-DIVERSITY-CAP-1 (#1947, trigger 1238 idea_topic_concentration_30d > 0.50:
//   a generated proposal scored ACCEPT whose topic cluster would push that cluster above half of the 30-day accepts waits as
//   deferred_diversity with its score kept; held rows are released best score first with no model call once the share
//   allows and no ai_spend cap is breached, and become a terminal HOLD when they leave the 30-day window).
// idea-hub v1.5.6-reentry-drain-20261005: REENTRY-DRAIN-1 (#1654 SIGNALS-TRIAGE-GAP-1: status='new' artifact_reentry signals
//   had no terminal state; weight-0 ones are expired after REENTRY_NOQ_TTL_H with one last re-check, weight>0 ones after
//   REENTRY_TTL_DAYS, no emission while the boundary row is not permitted; no model call, no new cron).
// idea-hub v1.5.5-triage-budget-20261005: IDEA-TRIAGE-BREACH-DEFER-1 (#1878: no triage model call while a fleet_budget
//   ai_spend cap is breached; proposals wait as deferred_budget and are released when the caps clear), COST-ATTRIBUTION
//   (#1833: triage and think-loop calls counted in ai_call_counters via aiRunAttr), OWNER-TOKEN-SHADOW-1 (#1966: intake
//   accepts OWNER_TOKEN or SYNC_TOKEN, constant-time).
// idea-hub v1.5.3-questions-feed-leakfix-20261004: ROLEPROMPT-SHAPE-GATE-1 (a public question is never
//   an instruction addressed to a model; catches pipeline prompts not enumerated in INTERNAL).
// idea-hub v1.5.2-questions-feed-20261004: IDEAS-PUBLIC-FILTER-1 (strip client-injected <ATTACHMENT_FILE>
//   and <context-data> blocks before the public gate; withhold a thread only when its FIRST public question
//   is internal, not when any turn is) + IDEAS-QUESTIONS-SOURCE-1 (publish self_questions open + triaged
//   idea_proposals, so the fleet's own latest research questions appear).
// idea-hub v1.5.1-public-ideas-20261004: IDEAS-PUBLIC-1 reverts IDEAS-PRIVATE-1. QNFO Ideas is a PUBLIC
//   read-only surface again: /, /s/*, /rss.xml, /api/sessions, /api/session/* load with NO credential. The
//   public filter (publicTitle + quarantine + INTERNAL/OPS/JUNK stripping) remains the only gate.
// idea-hub v1.4.0-qds-20261002: IDEAS-QDS-1 server-rendered public page and thread pages on the QNFO design system.
// idea-hub v1.3.0-think-loop-20261001
// AUTOPILOT-FOLD-1 (2026-10-01, issue 1640): qnfo-autopilot vanished unrecorded around 2026-09-25 and is folded into
//   existing workers instead of being recreated. Its think loop (one novel, falsifiable research question ->
//   self_questions + idea_proposals; last row 2026-09-21) lands here, next to the other ideation producers, with two
//   changes: it runs every THINK_EVERY_H hours instead of hourly, and it respects the same PROPOSAL_BACKPRESSURE pause
//   as re-entry. The 7-day near-duplicate filter is kept. Proposals are stored as the plain question text (the original
//   wrapped it in {"ideas":[...]}, which the triage scorer then read as JSON noise).
// idea-hub v1.2.0-ideation-loop-20261001
// SIGNALS-TRIAGE-GAP-1 (issue 1654) / L8 re-entry: qnfo-signal-loop, the only producer AND consumer of
//   signals.source='artifact_reentry', disappeared unrecorded around 2026-09-25 (worker_removals rationale), so
//   re-entry emission stopped 09-14, consumption 09-15 (128 left status=new) and idea_proposals stopped 09-24. Its
//   reentry + consume legs are ported here (idea-hub is already permitted for artifact_reentry in
//   signal_worker_boundary and holds the same LIVING_PAPER + QNFO_AUDIT bindings), with cost bounds the original
//   lacked: re-entry reads existing signals once instead of 2 queries per paper for 500 papers every hour and emits
//   at most REENTRY_BATCH new papers per run; consume takes CONSUME_SIGNALS signals x CONSUME_QUESTIONS questions per
//   run and pauses while more than PROPOSAL_BACKPRESSURE proposals await triage (the original could insert 375
//   proposals/hour against a triage rate of 5).
// idea-hub v1.1.0-triage-consumer-20261001
// IDEA-TRIAGE-CONSUMER-ABSENT-1 (issue 1689): qnfo-idea-triage was retired 2026-09-19 on the assumption that idea-hub
//   "embedded triage fully subsumes it", but idea-hub had no triage path at all, so idea_proposals stopped being
//   consumed on 2026-09-18 (19 status=new at 2026-10-01). The proposal-triage leg of qnfo-idea-triage 1.4.0 is ported
//   here verbatim (same two-model scorecard, tiebreak, ACCEPT thresholds, noise/question pre-filters, research_queue
//   enqueue) and runs on an hourly cron, at most TRIAGE_BATCH proposals per run. The public HTTP surface stays
//   read-only: /run and /api/proposals remain disabled; triage runs only from scheduled().
// idea-hub v1.0.8-toolinv-gate-20260929
// idea-hub v1.0.9-toolinv-shape-v2-20260929
// Fixes #1412 (D4/D5 RESIDUAL SHAPE HOLES). v1.0.8's TOOLINV caught the three live
//   leaks but its alternatives were over-specific: 'invoke <snake_case>' (no article),
//   and 'use your X tool' (no 'the'). Live gate probes 2026-09-29T17:2xZ returned
//   public:true for 'You must invoke the search tool ...' (D4) and 'Use the fetch
//   tool ...' (D5). v1.0.9 replaces verb-specific alternation with one VERB+ARTICLE+
//   NOUN-TYPE shape: (use|invoke|call|run) [your|the|a|an] <name> (tool|function|verb|
//   api|endpoint|action)s? -- plus 'call <snake_case> with' and bare '<snake_case> tool'.
//   Validated against the 39 live public titles (0 false positives) and the adversarial
//   set ('Call it with caution', 'Use your own judgement', 'call a function with keyword
//   arguments', 'Run the numbers', 'The tool with no name' all correctly unmatched).
//   Fail-closed: an imperative tool directive is never a public title. Still NOT in
//   INTERNAL/OPS, which also feed blocked(), so this gate cannot quarantine whole threads.
// Fixes #1412 (RESIDUAL CLASS). The v1.0.7 STAMP gate closed the orchestrator-retry
//   stamp vector, but the underlying OPS denylist enumerates SPECIFIC tool names and
//   therefore structurally lags the tool surface. Three public RSS items still exposed
//   raw agent tool-call directives as titles, because suggest_contacts and social_compose
//   were never added to OPS:
//     t-use-your-suggest-contacts-tool-w-2026-09-01
//     t-use-your-social-compose-tool-wit-2026-09-01
//     t-call-social-compose-with-title-t-2026-09-01
//   (Confirmed live 2026-09-29T17:16Z; the instances were quarantined in
//   chat_feed_quarantine_20260926 the same hour, which removed them from /rss.xml,
//   /api/feed, /api/sessions and /api/session/<id>. But /api/gate still returned
//   public:true for 'Use your suggest_contacts tool with topic=...', so the GATE was
//   still open and any newly added tool could leak the same way.)
//   TOOLINV replaces name-enumeration with the generic IMPERATIVE TOOL-INVOCATION
//   SHAPE. Validation against all 40 live titles: 3/3 leaks caught, 0 false positives;
//   10 adversarial probes all correctly unmatched ("Call it with caution", "Use your
//   own judgement", "call a function with keyword arguments", "Run the numbers",
//   "The tool with no name"). Fail-closed: an imperative tool directive is never a
//   public title. Deliberately NOT in INTERNAL/OPS, which also feed blocked(), so this
//   gate cannot quarantine whole threads.
// idea-hub v1.0.6-quarantine-wired-20260926
// Fixes #1179 QUARANTINE-TABLE-NOT-WIRED-1: chat_feed_quarantine_20260926 was written by the
//   integrity sweep but never read by this gate, so its 257 rows / 38 threads were inert.
//   blocked() now consults the quarantine set FIRST, so a quarantined thread cannot reach
//   /api/feed, /api/sessions, /rss.xml or /api/session/<id> regardless of title or content.
//   This also supplies the retraction path #1182 says is missing: the one thread quarantined
//   for "content error ... retracted 2026-09-26 (err-20260926-001)" is now withheld by
//   mechanism rather than by accident. Fail-closed on D1 error, consistent with the
//   pre-existing content scan. Set cached 60s. /health reports the wired count.
// Carries forward v1.0.5-boundary-match-20260926 (fix #1168 FEED-GATE-SUBSTRING-COLLISION-1:
//   single alphanumeric denylist tokens are matched with word boundaries
//   (?<![a-z0-9])token(?![a-z0-9]); phrases keep substring matching).
var VERSION = "1.7.1-codeagent"; // 1.7.0 OWNER-SIGNAL-INTAKE-1 (#1947 #2103 #2104, pillar research, owner directive 2026-10-07 "an integrated platform where all information is shared and leveraged across the fleet. No siloes!"): owner-authored proposals are ACCEPTed (scored for the record, never held by the model), ask-gap rows skip the chat-question filter, a new owner-corpus feeder distils research ideas from the owner's Obsidian notebook (notes_intake + R2 obsidian-vault) into the one intake, re-entry reads only the owner's own papers (zenodo/slug/doi/internal), and the think loop is seeded from the owner's accepted ideas instead of fixed quantum themes. Supersedes code task ct_hdaim0vx7h7vvl (1.6.2-codeagent). // 1.6.1 RULE-8-RETIRED-1 (2026-10-06, pillar cost): the /health limitation no longer says triage makes no model call while an ai_spend cap is breached; it scores on one cheap model since 1.6.0. // 1.6.0 BUDGET-SOFT-ROUTE-1 (2026-10-06, pillar cost, owner directive): an ai_spend cap no longer defers triage; proposals are scored by one cheap model while a cap is breached, deferred_budget rows are released every run, and diversity-held rows are released regardless of the caps. // 1.5.8 IDEA-DIVERSITY-CAP-1 (#1947, pillar research): triage holds a generated ACCEPT as deferred_diversity while its topic cluster would exceed half of the 30-day accepts (classifier identical to qnfo-cloud-ops IDEA_TOPIC_CLUSTERS), releases held rows best score first with no model call; 1.5.7 REACH-IDEA-1 (#2001, pillar reach): the home page carries a subscribe box (email input) posting to /api/subscribe, which forwards to the qnfo-subscribers double opt-in with source ideas.qnfo.org; 1.5.6 reentry-drain; 1.5.5 triage-budget; 1.5.4 (2026-10-05, #1919 #1920 + slow build): QNFO pages carry the 1200x630 share card and an iPatent link; ideasCached serves a stale copy at once and rebuilds in the background (an uncached build took ~12 s)
// ---- QDS-SHELL:BEGIN (generated from qnfo-gateway QDS-1; links https://qnfo.org/qds.css and qds.js) ----
var QDS_OWNER_ORCID = "0009-0002-4317-5604";
// The QNFO design system (QDS). Tokens, type and components live in ONE stylesheet served from here at
// https://qnfo.org/qds.css (any gateway host) and linked by every QNFO, QWAV and q08 surface, with qds.js for the theme
// toggle, sticky header and the article table of contents. Pages declare <html data-brand="qnfo|qwav|q08">. Reading
// type is Newsreader, interface type Familjen Grotesk; light and dark themes follow the OS unless the visitor picks one.
// Replaces the 2026-08-31 paper-and-ink system (qnfo-web-unified/README.md, STRATEGY 2.5), owner decision 2026-10-02.
var QDS_VERSION = "1.0.0";
var QDS_ORIGIN = "https://qnfo.org";
var QDS_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap">';
var QDS_GA = '<!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script>';
var QDS_MATHJAX = '<script>window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]],displayMath:[["$$","$$"],["\\\\[","\\\\]"]],processEscapes:true},svg:{scale:1.05,fontCache:"global"},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"],enableMenu:false}};function __mq(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise().catch(function(){})}}if(document.readyState==="complete"){setTimeout(__mq,150)}else{window.addEventListener("load",function(){setTimeout(__mq,150)})}<\/script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js" id="MathJax-script" defer onerror="this.onerror=null;var s=document.createElement(&quot;script&quot;);s.src=&quot;https://unpkg.com/mathjax@3/es5/tex-svg-full.js&quot;;document.head.appendChild(s);"><\/script>';
var QDS_MARK = {
  qnfo: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 16h7M13 16l7-8M13 16l7 8M20 8h6M20 24h6M20 8l4-4M20 24l4 4" stroke="var(--q-accent)" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="6" cy="16" r="3" fill="var(--q-ink)"/></svg>',
  qwav: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 19c3.2-7 6.4-7 9.6 0s6.4 7 9.6 0c2-4.4 4-5.6 6.8-4" stroke="var(--q-accent)" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="3.5" cy="19" r="2.6" fill="var(--q-ink)"/></svg>'
};
var QDS_FAVICON = {
  qnfo: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23182042'/%3E%3Cpath d='M6 16h7M13 16l7-8M13 16l7 8M20 8h6M20 24h6' stroke='%235FD3C4' stroke-width='2.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
  qwav: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23182042'/%3E%3Cpath d='M4 18c3-6.5 6-6.5 9 0s6 6.5 9 0c1.8-4 3.6-5 6-3.6' stroke='%239AA6FF' stroke-width='2.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"
};
var QDS_THEME_BTN = '<button class="q-theme" type="button" data-q-theme aria-label="Switch between light and dark theme"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/></svg></button>';
var QDS_MENU_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
// One navigation for the QNFO family. QWAV and q08 are separate labels (STRATEGY 2.1) and are not linked from here.
var QDS_NAV_QNFO = [
  { k: "papers", t: "Papers", h: "https://papers.qnfo.org/papers" },
  { k: "ask", t: "Ask the corpus", h: "https://ask.qwav.tech/" },
  { k: "ideas", t: "Ideas", h: "https://ideas.qnfo.org/" },
  { k: "archive", t: "Archive", h: "https://archive.qnfo.org/" },
  { k: "about", t: "About", h: "https://qnfo.org/about" },
  { k: "work", t: "Work with me", h: "https://qnfo.org/work-with-me" }
];
var QDS_NAV_QWAV = [
  { k: "jpcub", t: "JPCUB", h: "https://qwav.org/#jpcub" },
  { k: "stack", t: "Architecture", h: "https://qwav.org/#stack" },
  { k: "landscape", t: "Landscape", h: "https://qwav.org/#landscape" },
  { k: "research", t: "Research", h: "https://qwav.org/#research" },
  { k: "ask", t: "Ask", h: "https://ask.qwav.tech/" }
];
function qdsAttr(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// The <head> every page shares. o: title, description, canonical, brand, ogType, jsonld (string), math (bool), extra (string),
// rss (bool), robots.
function qdsHead(o) {
  const brand = o.brand || "qnfo";
  const t = qdsAttr(o.title), d = qdsAttr(o.description || "");
  const site = brand === "qwav" ? "QWAV" : "QNFO";
  return '<!DOCTYPE html><html lang="en" data-brand="' + brand + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    "<title>" + t + '</title><meta name="description" content="' + d + '">' + (o.canonical ? '<link rel="canonical" href="' + qdsAttr(o.canonical) + '">' : "") +
    (o.robots ? '<meta name="robots" content="' + qdsAttr(o.robots) + '">' : "") +
    '<meta name="author" content="Rowan Brad Quni-Gudzinas"><meta property="og:site_name" content="' + site + '"><meta property="og:title" content="' + t + '"><meta property="og:description" content="' + d + '"><meta property="og:type" content="' + (o.ogType || "website") + '">' +
    (o.canonical ? '<meta property="og:url" content="' + qdsAttr(o.canonical) + '">' : "") + '' + (brand === "qwav" ? '<meta name="twitter:card" content="summary">' : '<meta property="og:image" content="https://qnfo.org/og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">') + '<meta name="twitter:title" content="' + t + '"><meta name="twitter:description" content="' + d + '">' +
    '<meta name="theme-color" content="#F5F7FB" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#121731" media="(prefers-color-scheme: dark)">' +
    '<link rel="icon" type="image/svg+xml" href="' + QDS_FAVICON[brand === "qwav" ? "qwav" : "qnfo"] + '">' +
    (o.rss ? '<link rel="alternate" type="application/rss+xml" title="QNFO Papers" href="https://papers.qnfo.org/rss.xml">' : "") +
    QDS_FONTS + '<link rel="stylesheet" href="' + QDS_ORIGIN + "/qds.css?v=" + QDS_VERSION + '"><script src="' + QDS_ORIGIN + "/qds.js?v=" + QDS_VERSION + '" defer><\/script>' +
    (o.jsonld || "") + (o.math ? QDS_MATHJAX : "") + (o.extra || "") + QDS_GA + "</head>";
}
function qdsHeader(brand, active) {
  const nav = brand === "qwav" ? QDS_NAV_QWAV : QDS_NAV_QNFO;
  const home = brand === "qwav" ? "https://qwav.org/" : "https://qnfo.org/";
  const name = brand === "qwav" ? "QWAV" : "QNFO";
  const links = nav.map(function(n) {
    return '<a href="' + n.h + '"' + (n.k === active ? ' aria-current="page"' : "") + ">" + n.t + "</a>";
  }).join("");
  return '<a class="q-skip" href="#main">Skip to main content</a><header class="q-top"><div class="q-wrap"><a class="q-brand" href="' + home + '" aria-label="' + name + ' home">' + QDS_MARK[brand === "qwav" ? "qwav" : "qnfo"] + name + "</a>" +
    '<nav class="q-nav q-nav-wide" aria-label="Main">' + links + "</nav>" +
    '<details class="q-menu"><summary aria-label="Menu">' + QDS_MENU_ICON + '</summary><nav class="q-nav" aria-label="Main">' + links + "</nav></details>" + QDS_THEME_BTN + "</div></header>";
}
function qdsFooter(brand) {
  if (brand === "qwav") {
    return '<footer class="q-foot"><div class="q-wrap"><div class="q-foot-grid"><div><a class="q-brand" href="https://qwav.org/">' + QDS_MARK.qwav + 'QWAV</a><p style="margin-top:12px;max-width:36ch">A pre-commercial computing platform concept, benchmarked in joules per correct answer. Research by Rowan Brad Quni-Gudzinas, published by QNFO.</p></div>' +
      '<div><h2>Platform</h2><ul><li><a href="#jpcub">JPCUB benchmark</a></li><li><a href="#stack">Architecture</a></li><li><a href="#landscape">Landscape</a></li><li><a href="#research">Research</a></li></ul></div>' +
      '<div><h2>Research</h2><ul><li><a href="https://papers.qnfo.org/papers">Papers</a></li><li><a href="https://doi.org/10.5281/zenodo.21637028">JPCUB P0 protocol</a></li><li><a href="https://ask.qwav.tech/">Ask the corpus</a></li><li><a href="https://papers.qnfo.org/rss.xml">RSS</a></li></ul></div>' +
      '<div><h2>Legal</h2><ul><li><a href="https://legal.qnfo.org/">License (QNFO-ULA v2.0)</a></li><li><a href="https://qnfo.org/about">About the author</a></li></ul></div></div>' +
      '<div class="q-foot-base"><span>\u00a9 2025\u20132026 Rowan Brad Quni-Gudzinas</span><span>Research content under QNFO-ULA v2.0. No commercial product exists yet.</span></div></div></footer>';
  }
  return '<footer class="q-foot"><div class="q-wrap"><div class="q-foot-grid"><div><a class="q-brand" href="https://qnfo.org/">' + QDS_MARK.qnfo + 'QNFO</a><p style="margin-top:12px;max-width:38ch">The independent research imprint of Rowan Brad Quni-Gudzinas. Every work carries a DOI, and corrections ship as new versions.</p></div>' +
    '<div><h2>Research</h2><ul><li><a href="https://papers.qnfo.org/papers">Papers</a></li><li><a href="https://qnfo.org/#selected-works">Selected works</a></li><li><a href="https://ask.qwav.tech/">Ask the corpus</a></li><li><a href="https://ideas.qnfo.org/">Ideas</a></li><li><a href="https://archive.qnfo.org/">Archive</a></li><li><a href="https://ipatent.qnfo.org/?utm_source=ideas.qnfo.org&amp;utm_medium=referral&amp;utm_campaign=footer">iPatent: free provisional patent drafting</a></li></ul></div>' +
    '<div><h2>Author</h2><ul><li><a href="https://qnfo.org/about">About</a></li><li><a href="https://qnfo.org/work-with-me">Work with me</a></li><li><a href="https://orcid.org/' + QDS_OWNER_ORCID + '">ORCID ' + QDS_OWNER_ORCID + '</a></li><li><a href="https://qnfo.org/work-with-me#contact">Contact</a></li></ul></div>' +
    '<div><h2>Follow</h2><ul><li><a href="https://qnfo.org/#subscribe">New papers by email</a></li><li><a href="https://papers.qnfo.org/rss.xml">RSS</a></li><li><a href="https://legal.qnfo.org/">License (QNFO-ULA v2.0)</a></li><li><a href="https://legal.qnfo.org/privacy">Privacy</a></li></ul></div></div>' +
    '<div class="q-foot-base"><span>\u00a9 2025\u20132026 QNFO \u00b7 Rowan Brad Quni-Gudzinas</span><span>Prepared with an AI-assisted research pipeline; the author is responsible for the content.</span></div></div></footer>';
}
function qdsPage(o, body) {
  return qdsHead(o) + "<body>" + qdsHeader(o.brand || "qnfo", o.active) + '<main id="main">' + body + "</main>" + qdsFooter(o.brand || "qnfo") + (o.scripts || "") + "</body></html>";
}
// ---- QDS-SHELL:END ----

const BASE='https://ideas.qnfo.org';
const INTERNAL=['system-reminder','<system-reminder','system prompt','role instructions','respond with the exact first sentence','reply with ok','reply with exactly','write 200 words','write one self-contained python','extract every quantitative claim','you are an adversarial reviewer','you are the revising author','revision round-2 mandate','l8 specification','operator-shared thread','numerical verification sprint','paper-reviser','tool_call','tool result','strict json only','compare paqit','guard-probe','probe-','research and publish','calendar event','email received','attachment_file','file_index','file_key','file_content','read-only context data','working memory','context-data','treat them strictly as data'];
const OPS=['audit and remediate','remediate all failure modes','failure-mode','failure modes','backlog','open issues','ops_issue_run','fleet_status','backlog_status','ops_d1_query','ops_d1_write','cf_worker_read','cf_worker_deploy','cf_worker_bindings','workspace_write','workspace_read','web_fetch','web_search','github_','r2_','kv_','vectorize_query','telemetry_report','telemetry_analyze','dr_validate_schema','service_discover','shell_exec','exec_python','exec_node','container_status','qnfo-ops','worker deploy','patches not deployed','source drift','canonical source','binding missing','retired health stub','email-orchestrator','schema guard','dod audit','claim sheet','wbs plan','confirm:true','dryrun','incomplete:','ops endpoint','server-side ops','cloudflare worker'];
const JUNK=['say ok','say okay','test','testing','what is the capital','who are you','what is your name','tell me a joke','write a poem','write me a','make me a','create me','explain like i','good morning','good night','thank you','thanks','continue','repeat','again','what time is it','write code','implement a','give this conversation a name','hello world','what is 2+2','daily planning','life advice','productivity','planning a','trip to','overwinter','show my partner','weather in','weather for','what color is in this image','what colour is in this image','color is in this image','colour is in this image','image?','what relevant conferences are coming up'];
const RESEARCH=['quantum','qec','p-adic','ultrametric','thermodynamic','landauer','majorana','topological','number theory','physics','mathematics','set theory','self-reference','measurement','decoherence','gravity','spacetime','riemann','zeta','matrix','computation','ai-assisted science','consilience','distinction','entropy','hilbert','wheeler','page-wootters','cause','block','linguistic','etymological','sea peoples','conflict','misunderstanding','ignorance','slime mold','citation','marginalia'];
function cors(){return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};}
function json(x,s=200){return new Response(JSON.stringify(x),{status:s,headers:{...cors(),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
// IDEAS-PUBLIC-FILTER-1 (2026-10-04): strip client-injected blocks BEFORE any public gate. Every
// DeepChat message now carries an <ATTACHMENT_FILE> block and/or the "read-only context data /
// working memory" <context-data> block; publicTitle() matched those as INTERNAL ('attachment_file',
// 'working memory') and rejected genuine research questions as if they were internal prompts.
function stripInj(s){return String(s||'').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi,' ').replace(/<system-reminder>[\s\S]*$/gi,' ').replace(/<attachment_file>[\s\S]*?<\/attachment_file>/gi,' ').replace(/<context-data[^>]*>[\s\S]*?<\/context-data>/gi,' ').replace(/<file_content>[\s\S]*?<\/file_content>/gi,' ')}
function clean(s,max=240){return stripInj(s).replace(/^(User|Assistant|System|Human|AI)\s*:\s*/i,'').replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,'[redacted]').replace(/\b[A-Za-z0-9_-]{24,}\b/g,'[redacted]').replace(/\s+/g,' ').trim().slice(0,max)}
function reEsc(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
const _wordRe=new Map();
function wordHit(t,p){let re=_wordRe.get(p);if(!re){re=new RegExp('(?<![a-z0-9])'+reEsc(p)+'(?![a-z0-9])','i');_wordRe.set(p,re)}return re.test(t)}
function has(s,a){const t=String(s||'').toLowerCase();return a.some(function(x){const p=String(x).toLowerCase();if(/^[a-z0-9]+$/.test(p))return wordHit(t,p);return t.includes(p)})}
// F10-RSS-PIPELINE-STAMP-GATE-1 (issue #1412, 2026-09-29): publicTitle() previously
// required only a RESEARCH token, so an orchestrator retry stamp prefixed to the idea
// summary passed verbatim into the public RSS title. Live reproduction (external curl,
// 2026-09-29T17:11:22Z) item 2 of https://ideas.qnfo.org/rss.xml read
//   "RETRY (prior submission was dropped by an expressed-step abort). Notation-commissioning
//    audit: ... physics and quantum mechanics."
// It passed because "physics"/"quantum" are RESEARCH tokens and the stamp matches no
// INTERNAL/OPS/JUNK entry. Detected here, before the lists; deliberately NOT in INTERNAL,
// which also feeds blocked() and would quarantine whole threads on a phrase like
// "before execution". Fail-closed: a stamped summary is never a public title.
const STAMP=/(prior submission was dropped|expressed-step abort|dropped by an expressed|notation-commissioning|cross-link to qnf-|cross-link to dlf-|before execution|retry\s*\()/i;
// F10-TOOLINV-GATE-1 (issue #1412 residual class, 2026-09-29): see header. Matches the
// generic imperative tool-invocation SHAPE, not a tool-name list, so a newly registered
// tool cannot leak as a public title. Validated: 3/3 live leaks caught, 0/40 live titles
// and 0/10 adversarial probes false-positive.
const TOOLINV=/(?:use|invoke|call|run)\s+(?:your\s+|the\s+|a\s+|an\s+)?[a-z][a-z0-9_]{1,}(?:_[a-z0-9]+)*\s+(?:tools?|functions?|verbs?|apis?|endpoints?|actions?)\b|call\s+[a-z][a-z0-9_]{1,}(?:_[a-z0-9]+)+\s+with\b|(?<![a-z0-9])[a-z][a-z0-9]*(?:_[a-z0-9]+)+\s+(?:tool|function|verb)\b/i;
// pubQuestion: denylist safety gate only (no RESEARCH allowlist) -- the fleet's own self-questions
// and triaged idea proposals are research questions by construction, so requiring one of 39 exact
// RESEARCH tokens would silently drop them. publicTitle keeps the allowlist for arbitrary chat threads.
// ROLEPROMPT-SHAPE-GATE-1 (2026-10-04): a public question is never an instruction addressed to a
// model. Blocking the SHAPE (role assignment / imperative writer prompt) catches the paper-pipeline
// prompts that were not enumerated in INTERNAL -- e.g. "You are the reconciling editor...", which
// leaked because "input block" matched the RESEARCH token 'block' and the role phrase was not listed.
const ROLEPROMPT=/^\s*(you are (the|an|a)\b|write (one|a|the|two)\b|extract (every|all|the)\b|produce (the|a|one|two)\b|output (the|a|only|strict)\b|audit (this|the)\b|reconcil(e|ing)\b|based on the chat history|give this conversation a name)/i;
function pubQuestion(s){const t=clean(s,1000);if(STAMP.test(t))return false;if(TOOLINV.test(t))return false;if(ROLEPROMPT.test(t))return false;return t.length>=12&&!has(t,INTERNAL)&&!has(t,OPS)&&!has(t,JUNK)}
function publicTitle(s){const t=clean(s,1000);return pubQuestion(t)&&has(t,RESEARCH)}
function ts(v){if(!v)return null;if(typeof v==='number')return new Date(v).toISOString();let s=String(v).replace(' ','T');if(!/Z$|[+-]\d\d:\d\d$/.test(s))s+='Z';const d=new Date(s);return Number.isNaN(d.getTime())?String(v):d.toISOString()}
let _qSet=null,_qAt=0;
async function quarantined(env){const n=Date.now();if(_qSet&&n-_qAt<60000)return _qSet;const r=(await env.QNFO_AUDIT.prepare('SELECT DISTINCT thread FROM chat_feed_quarantine_20260926 WHERE thread IS NOT NULL LIMIT 5000').all()).results||[];_qSet=new Set(r.map(function(x){return String(x.thread)}));_qAt=n;return _qSet}
let _eSet=null,_eAt=0;
// CONTENT-ACCURACY-NOT-A-GATE-1 (#1182): threads named by an open internal_errata row (target_kind chat_log, target_ref '<thread>:...') are withheld by mechanism, independent of title/substring gates.
async function errataThreads(env){const n=Date.now();if(_eSet&&n-_eAt<60000)return _eSet;const r=(await env.QNFO_AUDIT.prepare("SELECT target_ref FROM internal_errata WHERE target_kind='chat_log' AND COALESCE(status,'open') NOT IN ('closed','resolved','rejected') LIMIT 5000").all()).results||[];_eSet=new Set(r.map(function(x){return String(x.target_ref).split(':')[0]}));_eAt=n;return _eSet}
// IDEAS-PUBLIC-FILTER-1: withhold a thread only when it is FUNDAMENTALLY internal -- quarantined,
// named by open errata, carrying a system turn, or whose FIRST (public) user question is internal.
// Previously ANY internal substring in ANY turn hid the whole thread, so one injected context block
// or a bare "CONTINUE" follow-up buried a clean public question. Internal turns are stripped from the
// rendered transcript separately (session() / ideasThread()), so nothing internal is ever displayed.
async function blocked(env,id){try{if((await quarantined(env)).has(String(id)))return true;if((await errataThreads(env)).has(String(id)))return true;const r=(await env.QNFO_AUDIT.prepare('SELECT role,content FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 200').bind(id).all()).results||[];if(r.some(x=>x.role==='system'))return true;const first=r.find(x=>x.role==='user');if(!first)return true;const c=clean(first.content,4000);return has(c,INTERNAL)||has(c,OPS)||has(c,JUNK)}catch(e){return true}}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
async function all(env){const rows=(await env.QNFO_AUDIT.prepare("SELECT c.thread AS id,COUNT(*) AS n,MIN(c.ts) first_ts,MAX(c.ts) last_ts,(SELECT content FROM chat c2 WHERE c2.thread=c.thread AND c2.role='user' ORDER BY c2.ts ASC,c2.id ASC LIMIT 1) title,(SELECT model FROM chat c2 WHERE c2.thread=c.thread ORDER BY c2.ts DESC LIMIT 1) model FROM chat c GROUP BY c.thread ORDER BY last_ts DESC LIMIT 500").all()).results||[];const out=[];for(const r of rows){if(!publicTitle(r.title))continue;if(await blocked(env,r.id))continue;out.push({id:r.id,kind:'thread',source:'live',title:clean(r.title,220),created_at:ts(r.first_ts)||ts(r.last_ts),updated_at:ts(r.last_ts)||ts(r.first_ts),message_count:Number(r.n)||0,model:r.model||null,tags:['conversation','live']})}try{const ar=(await env.QNFO_AUDIT.prepare("SELECT thread_id id,title,created_at,updated_at FROM chat_sessions WHERE category='research' ORDER BY COALESCE(updated_at,created_at) DESC LIMIT 500").all()).results||[];for(const r of ar){if(!publicTitle(r.title))continue;if(await blocked(env,r.id))continue;out.push({id:r.id,kind:'session',source:'archive',title:clean(r.title,220),created_at:ts(r.created_at),updated_at:ts(r.updated_at)||ts(r.created_at),message_count:0,model:null,tags:['conversation','archive']})}}catch(e){}
// IDEAS-QUESTIONS-SOURCE-1 (2026-10-04): the fleet's own research questions and triaged proposals are
// the "latest QNFO prompts" -- generated hourly by the ideation loop but never read by this page
// before now (the feed only read chat threads). self_questions(open) + idea_proposals(accepted/hold).
try{const qr=(await env.QNFO_AUDIT.prepare("SELECT id,ts,question FROM self_questions WHERE status='open' ORDER BY ts DESC LIMIT 60").all()).results||[];for(const r of qr){if(!pubQuestion(r.question))continue;out.push({id:'q-'+r.id,kind:'question',source:'ideation',title:clean(r.question,300),created_at:ts(r.ts),updated_at:ts(r.ts),message_count:0,model:null,tags:['question','ideation']})}}catch(e){}
try{const pr=(await env.QNFO_AUDIT.prepare("SELECT id,idea,status,created_at FROM idea_proposals WHERE status IN ('triaged_accepted','triaged_hold') ORDER BY created_at DESC LIMIT 120").all()).results||[];for(const r of pr){if(!pubQuestion(r.idea))continue;out.push({id:'p-'+r.id,kind:'proposal',source:'ideation',title:clean(r.idea,300),created_at:ts(r.created_at),updated_at:ts(r.created_at),message_count:0,model:null,tags:['proposal','ideation',String(r.status)]})}}catch(e){}
const seen=new Set();return out.sort((a,b)=>Date.parse(b.updated_at||0)-Date.parse(a.updated_at||0)).filter(x=>{const k=x.title.toLowerCase().slice(0,100);if(seen.has(k))return false;seen.add(k);return true})}
async function rss(env){const it=(await all(env)).slice(0,40);const body='<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>QNFO Idea Factory</title><link>'+BASE+'/</link><description>Public read-only research conversations from QNFO - ideas as they develop.</description><lastBuildDate>'+new Date().toUTCString()+'</lastBuildDate>\n'+it.map(x=>'<item><title>'+esc(x.title)+'</title><link>'+BASE+'/s/'+encodeURIComponent(x.id)+'</link><guid isPermaLink="false">'+esc(x.id)+'</guid><description>'+esc(x.title)+'</description><pubDate>'+new Date(x.updated_at||x.created_at||Date.now()).toUTCString()+'</pubDate></item>').join('\n')+'\n</channel></rss>';return new Response(body,{headers:{...cors(),'Content-Type':'application/rss+xml; charset=utf-8','Cache-Control':'no-store'}})}
async function sessions(url,env){const limit=Math.min(Math.max(parseInt(url.searchParams.get('limit')||'50',10),1),100);return json({sessions:(await all(env)).slice(0,limit),limit})}
async function session(path,env){const id=decodeURIComponent(path.split('/').slice(3).join('/'));if(/^[qp]-\d+$/.test(id)){const k=id[0],num=id.slice(2);let row=null;try{if(k==='q'){const r=(await env.QNFO_AUDIT.prepare("SELECT question AS q,ts,status FROM self_questions WHERE id=?").bind(num).all()).results||[];row=r[0];if(row)row={id:id,kind:'question',title:clean(row.q,500),status:row.status||'',created_at:ts(row.ts)}}else{const r=(await env.QNFO_AUDIT.prepare("SELECT idea AS q,created_at,status FROM idea_proposals WHERE id=?").bind(num).all()).results||[];row=r[0];if(row)row={id:id,kind:'proposal',title:clean(row.q,500),status:row.status||'',created_at:ts(row.created_at)}}}catch(e){}if(!row||!pubQuestion(row.title))return json({error:'Session not found or not public'},404);return json(row)}const rows=(await env.QNFO_AUDIT.prepare('SELECT ts,role,content,model FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 500').bind(id).all()).results||[];const first=rows.find(r=>r.role==='user');if(!first||!publicTitle(first.content)||await blocked(env,id))return json({error:'Session not found or not public'},404);return json({id,title:clean(first.content,500),messages:rows.filter(r=>r.role!=='system'&&!has(r.content,INTERNAL)&&!has(r.content,OPS)&&!has(r.content,JUNK)).map(r=>({role:r.role,content:clean(r.content,200000),timestamp:ts(r.ts),model:r.model||null}))})}
function html(){return new Response('<!doctype html><meta charset="utf-8"><title>QNFO Ideas</title><h1>QNFO Ideas</h1><p>Public read-only research conversations as they develop.</p><p><a href="/rss.xml">RSS feed</a></p>',{headers:{...cors(),'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})}

// ---- triage consumer (ported from qnfo-idea-triage 1.4.0) ----
var TRIAGE_BATCH = 5;
var T_MODELS = { a: "@cf/zai-org/glm-5.3-flash", b: "@cf/deepseek-ai/deepseek-v4-flash-0731", tiebreak: "@cf/qwen/qwen3-30b-a3b-fp8" };
var T_CHAIN = ["@cf/zai-org/glm-5.3-flash", "@cf/zai-org/glm-5.3", "@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/zai-org/glm-5.2"];
var ACCEPT_MIN = 0.7, FEAS_MIN = 0.5, RISK_MAX = 0.4, STD_TIE = 0.25;
var T_KEYS = ["novelty", "technical_merit", "impact_potential", "exposure_potential", "feasibility", "risk"];
var SCORECARD_PROMPT = "You are QNFO's research-idea merit reviewer. Score the idea below for the QNFO autonomous research pipeline.\n" +
"Return JSON ONLY: {\"novelty\":0-1,\"technical_merit\":0-1,\"impact_potential\":0-1,\"exposure_potential\":0-1,\"feasibility\":0-1,\"risk\":0-1,\"rationale\":\"<=120 chars\",\"hook\":\"<=90 chars, one-line public-facing hook\"}\n" +
"Scoring guide: technical_merit = depth of technical content + verifiability; impact_potential = significance if proven; exposure_potential = breadth of audience/attention it can attract (social, media, cross-field); risk = probability of producing nothing citable (1 = near-certain dead end). IMPORTANT: feasibility means feasibility of the THEORETICAL/COMPUTATIONAL research itself (can the derivation, simulation, formal analysis, and computational verification be carried out by the QNFO autonomous pipeline) - NOT experimental testability. QNFO has no laboratory; an idea is feasible if its mathematics/computation can be executed and verified in silico, even if a confirming experiment would require external labs years away. Do NOT mark a theoretical physics idea infeasible merely because no experiment currently exists.\n" +
"IDEA: ";
function tExtract(r) {
  if (!r) return "";
  var ch = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (ch) return String(ch);
  if (typeof r.response === "string") return r.response;
  if (r.result && typeof r.result.response === "string") return r.result.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  return "";
}
// COST-ATTRIBUTION (#1833): every env.AI.run here goes through aiRunAttr (the qnfo-fleet-control helper), which adds one
// per-worker/purpose call counter to D1 ai_call_counters (fail-soft, never blocks or alters the AI call).
async function aiRunAttr(env, worker, purpose, model, input, opts) {
  var t0 = Date.now(), ok = 1;
  try { return await env.AI.run(model, input, opts); } catch (e) { ok = 0; throw e; }
  finally {
    try {
      var db = env.QNFO_AUDIT;
      if (db) {
        var ic = 0; try { ic = JSON.stringify(input && input.messages || input || "").length; } catch (e2) {}
        var day = new Date().toISOString().slice(0, 10);
        await db.prepare("CREATE TABLE IF NOT EXISTS ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))").run();
        await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms) VALUES (?1,?2,?3,?4,1,?5,?6,?7) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+?5, in_chars=in_chars+?6, ms=ms+?7").bind(day, worker, purpose, String(model), ok ? 0 : 1, ic, Date.now() - t0).run();
      }
    } catch (e3) {}
  }
}
// True while any fleet_budget ai_spend cap is breached (current > cap). Since 1.6.0 (BUDGET-SOFT-ROUTE-1) a breach only
// selects lean scoring (one cheap model); an unreadable fleet_budget counts as breached, so a D1 fault selects lean too.
async function aiBudgetBreach(env) {
  try {
    var rows = (await env.QNFO_AUDIT.prepare("SELECT node_class, cap, current FROM fleet_budget WHERE node_class LIKE 'ai_spend:%' AND current > cap ORDER BY node_class").all()).results || [];
    return { breached: rows.length > 0, caps: rows.map(function (r) { return r.node_class + " " + r.current + "/" + r.cap; }) };
  } catch (e) {
    return { breached: true, caps: ["fleet_budget unreadable: " + String(e && e.message || e).slice(0, 80)] };
  }
}
async function tRunModel(env, name, prompt) {
  var lastErr = "";
  var chain = [name].concat(T_CHAIN.filter(function (x) { return x !== name; })).slice(0, 4);
  for (var i = 0; i < chain.length; i++) {
    try {
      var r = await aiRunAttr(env, "idea-hub", "triage", chain[i], { messages: [{ role: "user", content: prompt }], max_tokens: 700, temperature: 0.2 });
      var mm = tExtract(r).match(/\{[\s\S]*\}/);
      if (!mm) { lastErr = chain[i] + ": no JSON"; continue; }
      var c = JSON.parse(mm[0]); var ok = true;
      for (var k = 0; k < T_KEYS.length; k++) { var v = parseFloat(c[T_KEYS[k]]); if (!isFinite(v)) { ok = false; break; } c[T_KEYS[k]] = Math.max(0, Math.min(1, v)); }
      if (!ok) { lastErr = chain[i] + ": invalid scorecard"; continue; }
      return { card: c, model: chain[i] };
    } catch (e) { lastErr = chain[i] + ": " + (e && e.message || e); }
  }
  return { error: lastErr };
}
// BUDGET-SOFT-ROUTE-1 (1.6.0): lean = an ai_spend cap is breached. The proposal is still scored, by one cheap model
// (T_MODELS.a with the T_CHAIN fallbacks) instead of two plus a tiebreak; the cap steers the model, it never stops triage.
async function scoreIdea(env, desire, lean) {
  var prompt = SCORECARD_PROMPT + String(desire || "").slice(0, 3000);
  if (lean) {
    var one = await tRunModel(env, T_MODELS.a, prompt);
    if (!one.card) return { error: "lean scoring failed: " + one.error };
    var lc = one.card, ls = 0.3 * lc.novelty + 0.3 * lc.technical_merit + 0.2 * lc.impact_potential + 0.2 * lc.exposure_potential;
    return { score: Math.round(ls * 1000) / 1000, decision: ls >= ACCEPT_MIN && lc.feasibility >= FEAS_MIN && lc.risk <= RISK_MAX ? "ACCEPT" : "HOLD", rationale: lc.rationale, model: one.model + " (lean: ai_spend cap breached)" };
  }
  var res = await Promise.all([tRunModel(env, T_MODELS.a, prompt), tRunModel(env, T_MODELS.b, prompt)]);
  var a = res[0].card ? res[0] : null, b = res[1].card ? res[1] : null, card, models;
  if (a && b) {
    card = {}; T_KEYS.forEach(function (k) { card[k] = (a.card[k] + b.card[k]) / 2; });
    card.rationale = a.card.rationale || ""; models = [a.model, b.model];
    var std = Math.sqrt(T_KEYS.map(function (k) { return Math.pow(a.card[k] - b.card[k], 2); }).reduce(function (x, y) { return x + y; }, 0) / T_KEYS.length);
    if (std > STD_TIE) { var t = await tRunModel(env, T_MODELS.tiebreak, prompt); if (t.card) { T_KEYS.forEach(function (k) { card[k] = (a.card[k] + b.card[k] + t.card[k]) / 3; }); models.push(t.model); } }
  } else if (a || b) { card = (a || b).card; models = [(a || b).model]; }
  else return { error: "all scoring models failed: " + [res[0].error, res[1].error].join(" | ") };
  var score = 0.3 * card.novelty + 0.3 * card.technical_merit + 0.2 * card.impact_potential + 0.2 * card.exposure_potential;
  var decision = score >= ACCEPT_MIN && card.feasibility >= FEAS_MIN && card.risk <= RISK_MAX ? "ACCEPT" : "HOLD";
  return { score: Math.round(score * 1000) / 1000, decision: decision, rationale: card.rationale, model: models.join("+") };
}
var NOISE_RE = [/^call (the )?[a-z_]+( tool)?(\s|$)/i, /(email_check|express_intent|intents_list|social_compose|search_research|search_papers tool)/i, /output the (complete )?raw json/i, /^reply with the single word/i, /^give this conversation a name/i, /^max \d+ chars/i, /based on the chat history/i, /rotation verification/i, /redirect probe/i, /auto-express block/i, /wrapped in/i, /^ok$/i];
function isNoise(t) { t = String(t || ""); return NOISE_RE.some(function (re) { return re.test(t); }); }
function isQuestion(t) { t = String(t || "").trim(); return t.length < 160 && /\?\s*$/.test(t) && /^(what|who|where|when|why|how|is|are|do|does|did|can|could|should|would|will|has|have|quick|one line|one sentence|in one sentence|probe)/i.test(t); }
// IDEA-DIVERSITY-CAP-1 (1.5.8, #1947, pillar research). metric_registry idea_topic_concentration_30d (trigger 1238: > 0.50)
// is the share of ACCEPTed idea_proposals in the last 30 days that fall in the largest keyword cluster, recomputed daily
// by qnfo-cloud-ops jobIdeaTopicMetric. It read 0.596 (31 of 52 "quantum") on 2026-10-06, and with no new accepts the
// window alone would raise it (0.794 by 10-15, 1.0 by 11-02: the older accepts are the diverse ones). After a scoring
// model answers ACCEPT for a generated proposal, triage classifies it with the same clusters over the same text (name,
// idea, rationale) and, while (cluster + 1) / (n + 1) > DIVERSITY_MAX_SHARE with n >= DIVERSITY_MIN_N accepts in the
// window, holds it as status 'deferred_diversity' (decision DEFER-DIVERSITY, score kept, never sent to research_queue
// and not counted by the metric). Held rows are released best score first, with no model call, when the share allows
// (1.6.0 BUDGET-SOFT-ROUTE-1: an ai_spend cap no longer holds a release back). A held row whose created_at leaves the
// 30-day window becomes a terminal HOLD instead, so a release can never land outside the window the metric reads.
// Owner-authored rows (name owner-* or rowan-*, contact 'owner') and intake:<family> rows (radar-hub
// SIGNAL-INTAKE-SOURCES-1) are never held; they still count in the mix. The cluster table must stay identical to
// qnfo-cloud-ops IDEA_TOPIC_CLUSTERS; idea-hub/diversity-cap.test.mjs fails when they differ.
var IDEA_TOPIC_CLUSTERS = [
  ["quantum", /quantum|qubit|error[- ]correct|qec/i],
  ["ultrametric", /ultrametric|p-adic|padic|bruhat|adelic|non-archimedean|\bzbw\b/i],
  ["energy", /energy|thermodynam|landauer|joule|entropy/i],
  ["ai-epistemics", /\bllms?\b|language model|\bagents?\b|epistem|ignorance|\bai\b|machine learning/i]
];
var DIVERSITY_MAX_SHARE = 0.5, DIVERSITY_MIN_N = 10, DIVERSITY_RELEASE_SCAN = 50;
var DIVERSITY_WINDOW_SQL = "replace(substr(created_at, 1, 19), 'T', ' ') >= datetime('now', '-30 day')";
var DIVERSITY_NOTE_RE = /^\[diversity hold [^\]]*\] ?/;
function ideaTopicCluster(text) {
  for (var i = 0; i < IDEA_TOPIC_CLUSTERS.length; i++) if (IDEA_TOPIC_CLUSTERS[i][1].test(String(text || ""))) return IDEA_TOPIC_CLUSTERS[i][0];
  return "other";
}
function proposalCluster(name, idea, rationale) { return ideaTopicCluster([name, idea, rationale].filter(Boolean).join(" ")); }
function diversityExempt(row) {
  var name = String(row && row.name || "");
  return /owner|rowan/i.test(name) || /^intake:/i.test(name) || String(row && row.contact || "") === "owner" || proposalKind(row) !== "generated";
}
// OWNER-SIGNAL-INTAKE-1 (1.7.0, #1947 #2103 #2104). Three kinds of proposal share the one intake:
//   direct    the owner wrote it (POST /api/intake owner-chat, rowan-*, chat-session, contact 'owner'/'rowan-*'): ACCEPTed,
//             scored only for the record; the owner's own ideas drive the pipeline and never wait on a model's HOLD;
//   corpus    'owner-corpus', distilled by runOwnerCorpus from the owner's notebook: ACCEPTed at OWNER_CORPUS_SCORE_MIN, a
//             lower bar than generated ideas (the source is the owner's own thinking; the model only did the extraction);
//   generated everything else (arXiv scan, think loop, re-entry, ask-gap, radar intake): the unchanged scorecard.
// The research pipeline's review, verify and publish gates apply to all three alike.
var OWNER_CORPUS_SCORE_MIN = 0.55;
function proposalKind(row) {
  var name = String(row && row.name || ""), contact = String(row && row.contact || "");
  if (name === "owner-corpus") return "corpus";
  if (/^intake:/i.test(name)) return "generated";
  if (/^(owner|rowan)/i.test(name) || name === "chat-session" || contact === "owner" || /^rowan/i.test(contact)) return "direct";
  return "generated";
}
function ownerDecision(kind, s) {
  var r = Object.assign({}, s);
  if (kind === "direct") { r.decision = "ACCEPT"; r.rationale = "[owner-authored: accepted, OWNER-SIGNAL-INTAKE-1] " + (s.rationale || ""); }
  else if (kind === "corpus") { var ok = s.decision === "ACCEPT" || Number(s.score) >= OWNER_CORPUS_SCORE_MIN; r.decision = ok ? "ACCEPT" : "HOLD"; r.rationale = "[owner notebook, bar " + OWNER_CORPUS_SCORE_MIN + "] " + (s.rationale || ""); }
  return r;
}
async function acceptedMix(env) {
  var rs = (await env.QNFO_AUDIT.prepare("SELECT name, idea, rationale FROM idea_proposals WHERE decision = 'ACCEPT' AND " + DIVERSITY_WINDOW_SQL).all()).results || [];
  var mix = { n: rs.length, by: {} };
  rs.forEach(function (r) { var k = proposalCluster(r.name, r.idea, r.rationale); mix.by[k] = (mix.by[k] || 0) + 1; });
  return mix;
}
// True when one more accept in `cluster` would put that cluster above the cap (only once DIVERSITY_MIN_N accepts exist).
function diversityBlocks(mix, cluster) {
  return mix.n >= DIVERSITY_MIN_N && ((mix.by[cluster] || 0) + 1) / (mix.n + 1) > DIVERSITY_MAX_SHARE;
}
function mixShare(mix) {
  var top = null;
  Object.keys(mix.by).forEach(function (k) { if (top === null || mix.by[k] > mix.by[top]) top = k; });
  return { n: mix.n, top: top, share: mix.n ? Math.round(1000 * mix.by[top] / mix.n) / 1000 : null, by_cluster: mix.by };
}
async function enqueueAccepted(env, id, idea, score, now) {
  await env.QNFO_AUDIT.prepare("INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at) VALUES (?1,'proposal',?2,?3,'',?4,?5,'queued',?6)").bind(crypto.randomUUID(), String(id), String(idea || "").slice(0, 3000), score, "ACCEPT", now).run();
}
// Expire held rows that left the window (terminal HOLD, score kept); then release the best held rows the current mix
// allows, up to TRIAGE_BATCH a run. No model call either way. Since 1.6.0 (BUDGET-SOFT-ROUTE-1) a cap no longer holds
// the release back; the breached argument is kept for callers and ignored.
async function diversityRelease(env, mix, breached, out) {
  var now = new Date().toISOString();
  var ex = await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET status = 'triaged_hold', decision = 'HOLD', triaged_at = ?1, rationale = substr('[diversity hold expired: left the 30-day window] ' || COALESCE(rationale, ''), 1, 2000) WHERE status = 'deferred_diversity' AND NOT COALESCE(" + DIVERSITY_WINDOW_SQL + ", 0)").bind(now).run();
  out.diversity_expired = Number(ex && ex.meta && ex.meta.changes) || 0;
  var held = (await env.QNFO_AUDIT.prepare("SELECT id, name, idea, rationale, score FROM idea_proposals WHERE status = 'deferred_diversity' AND " + DIVERSITY_WINDOW_SQL + " ORDER BY score DESC, created_at ASC LIMIT ?1").bind(DIVERSITY_RELEASE_SCAN).all()).results || [];
  for (var i = 0; i < held.length && out.diversity_released < TRIAGE_BATCH; i++) {
    var h = held[i], rationale = String(h.rationale || "").replace(DIVERSITY_NOTE_RE, ""), k = proposalCluster(h.name, h.idea, rationale);
    if (diversityBlocks(mix, k)) continue;
    var up = await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision = 'ACCEPT', status = 'triaged_accepted', rationale = ?1, triaged_at = ?2 WHERE id = ?3 AND status = 'deferred_diversity'").bind(rationale, now, h.id).run();
    if (!(Number(up && up.meta && up.meta.changes) > 0)) continue;
    await enqueueAccepted(env, h.id, h.idea, h.score, now);
    mix.n++; mix.by[k] = (mix.by[k] || 0) + 1;
    out.diversity_released++; out.accepted++;
  }
}
// BUDGET-SOFT-ROUTE-1 (1.6.0, owner directive 2026-10-06: "AI spend budget should never stop any process, pipeline, or
// workflow, only limit/suggest what models may be used") replaces the deferral below: while a cap is breached every
// proposal is still scored, by one cheap model (scoreIdea lean), and rows left as deferred_budget by 1.5.5-1.5.8 are
// released every run, oldest first, TRIAGE_BATCH at a time. The text below is the retired 1.5.5 rule, kept for history.
// IDEA-TRIAGE-BREACH-DEFER-1 (#1878, pillar cost, retired): while a fleet_budget ai_spend cap is breached, triage made no model
// call. The zero-cost noise and chat-question rules still run; a proposal that needs scoring is set to status
// 'deferred_budget' (never dropped or closed, human ideas included). Once no cap is breached, deferred rows go back to
// 'new' oldest first, TRIAGE_BATCH a run, and are scored through the normal path. Each run writes the deferred count and
// the breached caps to cloud_ops_events id 'idea-triage-budget'; /health reports the count. Producers count deferred
// rows in their backpressure, so the backlog cannot grow without bound during a breach.
async function triageProposals(env) {
  var out = { triaged: 0, accepted: 0, errors: 0, deferred: 0, released: 0, diversity_held: 0, diversity_released: 0, diversity_expired: 0 };
  var budget = await aiBudgetBreach(env);
  out.budget_breached = budget.breached;
  out.lean = budget.breached;
  {
    // Rows a 1.5.x run left as deferred_budget go back to 'new' every run (the cap no longer defers scoring).
    try {
      var rel = await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET status='new' WHERE id IN (SELECT id FROM idea_proposals WHERE status='deferred_budget' ORDER BY created_at ASC LIMIT ?1)").bind(TRIAGE_BATCH).run();
      out.released = Number(rel && rel.meta && rel.meta.changes) || 0;
    } catch (e) { out.errors++; }
  }
  var rows = (await env.QNFO_AUDIT.prepare("SELECT id, idea, name, contact FROM idea_proposals WHERE status='new' ORDER BY created_at ASC LIMIT ?1").bind(TRIAGE_BATCH).all()).results || [];
  // IDEA-DIVERSITY-CAP-1: the 30-day accepted mix, read once and kept current as this run accepts. Unreadable: no cap
  // this run (null), and the error is counted.
  var mix = null;
  try { mix = await acceptedMix(env); } catch (e) { out.errors++; }
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i], now = new Date().toISOString();
    try {
      // Research questions from the fleet's own producers are ideas, not chat questions: the chat-question filter
      // would HOLD every think-loop proposal unscored ("Can X predict Y?" matches it). OWNER-SIGNAL-INTAKE-1: Ask QWAV
      // gaps (ask-gap) are questions by construction, and notebook extractions are research text. A short chat question
      // typed by the owner ("What is a qubit?") is still held: it asks for an answer, not for a paper.
      var kind = proposalKind(row);
      var internal = row.name === "think-loop" || row.name === "auto-reentry" || row.name === "ask-gap" || kind === "corpus";
      if (isNoise(row.idea) || (!internal && isQuestion(row.idea))) {
        await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision='HOLD', rationale=?, triaged_at=?, status='triaged_hold' WHERE id=?").bind("noise/question filter", now, row.id).run();
        out.triaged++; continue;
      }
      var s = await scoreIdea(env, row.idea, budget.breached);
      if (s.error && kind !== "direct") { out.errors++; continue; }
      if (s.error) s = { score: null, decision: "HOLD", rationale: "scoring unavailable: " + String(s.error).slice(0, 80) };
      s = ownerDecision(kind, s);
      if (kind !== "generated") out.owner_accepted = (out.owner_accepted || 0) + (s.decision === "ACCEPT" ? 1 : 0);
      var cluster = s.decision === "ACCEPT" ? proposalCluster(row.name, row.idea, s.rationale) : null;
      if (cluster && mix && !diversityExempt(row) && diversityBlocks(mix, cluster)) {
        var pct = Math.round(100 * ((mix.by[cluster] || 0) + 1) / (mix.n + 1));
        await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision='DEFER-DIVERSITY', score=?, rationale=?, triaged_at=?, status='deferred_diversity' WHERE id=?").bind(s.score, "[diversity hold " + now.slice(0, 16) + "Z: " + cluster + " would be " + pct + "% of 30-day accepts, cap " + Math.round(100 * DIVERSITY_MAX_SHARE) + "%] " + (s.rationale || ""), now, row.id).run();
        out.triaged++; out.diversity_held++; continue;
      }
      await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision=?, score=?, rationale=?, triaged_at=?, status=? WHERE id=?").bind(s.decision, s.score, s.rationale || "", now, s.decision === "ACCEPT" ? "triaged_accepted" : "triaged_hold", row.id).run();
      out.triaged++;
      if (s.decision === "ACCEPT") {
        await enqueueAccepted(env, row.id, row.idea, s.score, now);
        out.accepted++;
        if (mix) { mix.n++; mix.by[cluster] = (mix.by[cluster] || 0) + 1; }
      }
    } catch (e) { out.errors++; }
  }
  if (mix) {
    try { await diversityRelease(env, mix, false, out); } catch (e) { out.errors++; }
    out.diversity = mixShare(mix);
  }
  try {
    var dc = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status='deferred_budget'").first();
    out.deferred_total = Number(dc && dc.n) || 0;
    var dd = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status='deferred_diversity'").first();
    out.diversity_held_total = Number(dd && dd.n) || 0;
    var at = new Date().toISOString();
    await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES ('idea-triage-budget', ?1, 'idea-triage-budget', ?2, ?3, 'idea-hub', ?4)")
      .bind(at, "idea triage: " + (budget.breached ? "AI budget caps breached, scored lean on one cheap model; " : "caps clear; ") + out.released + " released, " + out.triaged + " triaged, " + out.deferred_total + " waiting as deferred_budget, " + out.diversity_held_total + " as deferred_diversity", JSON.stringify({ version: VERSION, breached: budget.breached, caps: budget.caps, deferred_run: out.deferred, released_run: out.released, deferred_total: out.deferred_total, triaged_run: out.triaged, diversity_held_run: out.diversity_held, diversity_released_run: out.diversity_released, diversity_expired_run: out.diversity_expired, diversity_held_total: out.diversity_held_total, diversity: out.diversity || null }), budget.breached ? "lean" : "ok").run();
  } catch (e) {}
  // OWNER-SIGNAL-INTAKE-1: metric owner_signal_share_30d (registered with its trigger in
  // migrations/2026-10-07-owner-signal-intake.sql) is the share of research_queue rows created in the last 30 days that
  // came from an owner proposal (direct or notebook). This run is its producer.
  try {
    var osm = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN p.name = 'owner-corpus' OR p.name LIKE 'owner%' OR p.name LIKE 'rowan%' OR p.name = 'chat-session' OR p.contact = 'owner' OR p.contact LIKE 'rowan%' THEN 1 ELSE 0 END) AS own FROM research_queue q LEFT JOIN idea_proposals p ON q.source = 'proposal' AND CAST(p.id AS TEXT) = q.source_id WHERE replace(substr(q.created_at, 1, 19), 'T', ' ') >= datetime('now', '-30 day') AND q.source <> 'diagnostic'").first();
    var osn = Number(osm && osm.n) || 0, oso = Number(osm && osm.own) || 0;
    out.owner_signal_share_30d = osn ? Math.round(1000 * oso / osn) / 1000 : 0;
    await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2 WHERE metric = 'owner_signal_share_30d'").bind(String(out.owner_signal_share_30d), new Date().toISOString()).run();
  } catch (e) {}
  console.log("BUDGET-SOFT-ROUTE-1 idea-triage " + JSON.stringify(out));
  try { await env.QNFO_AUDIT.prepare("INSERT INTO fleet_heartbeat (worker, version, ts, ok) VALUES ('idea-hub', ?1, ?2, ?3) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind(VERSION, new Date().toISOString(), out.errors ? 0 : 1).run(); } catch (e) {}
  return out;
}

// ---- L8 re-entry loop (ported from qnfo-signal-loop 1.1.2, bounded) ----
var REENTRY_BATCH = 20, CONSUME_SIGNALS = 2, CONSUME_QUESTIONS = 3, PROPOSAL_BACKPRESSURE = 30;
// REENTRY-RESCORE-1 (1.3.1): the 1.2.0 port dropped qnfo-signal-loop's re-score leg, so a signal emitted with no
// detectable open questions (evidential_weight 0) could never be consumed even after its paper gained a body. Each run
// re-checks RESCORE_BATCH weight-0 signals, oldest-checked first (ts rotates); a signal whose paper is no longer in
// living-paper is expired with that reason instead of being re-checked forever.
var RESCORE_BATCH = 10;
// REENTRY-DRAIN-1 (1.5.6, #1654 SIGNALS-TRIAGE-GAP-1): status='new' re-entry signals had no terminal state. A weight-0
// signal (no open question found in its paper) fails the consume filter (evidential_weight > 0) for ever, and the re-score
// leg above only expired it when the paper had left living-paper; otherwise it rotated ts. On 2026-10-05 242 of the 245
// status='new' rows were weight 0 (all re-checked within the last 24 h, none ever re-scored: no weight>0 row has
// ts <> created_at), and the 3 weight>0 rows wait on the owner's pause (signal_worker_boundary idea-hub/artifact_reentry
// permitted=0, OWNER-NARROW-SIGNAL-1, until SIGNAL-INTAKE-1 #1947). Consuming them would feed the two-model triage
// (paid Workers AI) while fleet_budget caps are breached, so the remedy is an age rule, model-free and bounded:
//   1. a weight-0 signal older than REENTRY_NOQ_TTL_H gets one last re-check against its paper (oldest first, at most
//      REENTRY_EXPIRE_BATCH a run) and is expired if it still has no open question, so every such signal leaves 'new'
//      inside the 24 h window this issue's contract measures;
//   2. a weight>0 signal still status='new' after REENTRY_TTL_DAYS is expired (a week for a paused or backed-up consumer
//      to take it; younger rows stay consumable when the pause lifts);
//   3. while the boundary row is not permitted, no new signal is emitted (the owner paused re-entry; emitting rows that
//      nothing may consume only regrows the backlog).
// Expiry is a status change only: the row, its open_questions and its weight are kept and the reason is in decision.
var REENTRY_NOQ_TTL_H = 20, REENTRY_TTL_DAYS = 7, REENTRY_EXPIRE_BATCH = 50;
var REENTRY_OWNER_TYPES = ["zenodo", "slug", "doi", "internal"];
// The owner-only re-entry has its own boundary row, so the pre-1.7.0 code (which still reads 'artifact_reentry', paused by
// OWNER-NARROW-SIGNAL-1) can never resume the arXiv-wide scan if a deploy lags the migration that opens this one.
var REENTRY_BOUNDARY_SOURCE = "artifact_reentry_owner";
function extractOpenQuestions(bodyMd) {
  if (!bodyMd) return [];
  var text = String(bodyMd), out = [], seen = new Set();
  var push = function (x) {
    var t = String(x).replace(/\s+/g, " ").replace(/^[\s*\-\d.]+/, "").trim();
    if (t.length < 15 || t.length > 320) return;
    var k = t.slice(0, 80).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    if (out.length < 15) out.push(t);
  };
  var m = text.match(/##?\s*(Open Questions?|Open Problems?|Future Work|Future Directions?|Limitations?|Outlook|Unresolved|Discussion)[\s\S]{0,4000}/i);
  if (m) m[0].split("\n").forEach(function (l) { if (/^\s*([-*]|\d+\.)\s+\S/.test(l)) push(l); });
  (text.match(/[^.\n]{12,300}?(open question|remains? open|open problem|unresolved|future work|not yet (known|understood|resolved|established)|unknown whether|remains? to be)[^.\n]{0,240}[.?]/gi) || []).forEach(push);
  (text.match(/[^.\n?]{25,300}\?/g) || []).forEach(push);
  return out;
}
async function reentryPermitted(env) {
  try {
    var b = await env.QNFO_AUDIT.prepare("SELECT permitted FROM signal_worker_boundary WHERE worker='idea-hub' AND source='" + REENTRY_BOUNDARY_SOURCE + "'").first();
    return !!b && Number(b.permitted) === 1;
  } catch (e) { return false; }
}
async function runReentry(env) {
  var out = { scanned: 0, emitted: 0, errors: 0, permitted: await reentryPermitted(env) };
  var papers = [], have = new Set();
  if (out.permitted) {
    // OWNER-SIGNAL-INTAKE-1 (1.7.0): re-entry reads only the owner's own papers. The newest-500 scan recycled arXiv-derived
    // QEC papers into more QEC (the reason for OWNER-NARROW-SIGNAL-1); REENTRY_OWNER_TYPES are the identifier types of
    // papers the owner wrote (Zenodo deposits, his slugs, DOIs, internal), not arxiv, kg-backfill or pipeline 'qnfo' rows.
    papers = (await env.LIVING_PAPER.prepare("SELECT doi, title FROM papers WHERE doi IS NOT NULL AND doi != '' AND body_md IS NOT NULL AND body_md != '' AND status IN ('published','distributed') AND identifier_type IN (" + REENTRY_OWNER_TYPES.map(function () { return "?"; }).join(",") + ") ORDER BY created_at DESC LIMIT 500").bind(...REENTRY_OWNER_TYPES).all()).results || [];
    have = new Set(((await env.QNFO_AUDIT.prepare("SELECT source_ref FROM signals WHERE source='artifact_reentry'").all()).results || []).map(function (r) { return String(r.source_ref); }));
  } else out.emit_paused = "signal_worker_boundary idea-hub/" + REENTRY_BOUNDARY_SOURCE + " not permitted";
  out.scanned = papers.length;
  var todo = papers.filter(function (p) { return !have.has(String(p.doi)); }).slice(0, REENTRY_BATCH);
  for (var i = 0; i < todo.length; i++) {
    var p = todo[i];
    try {
      var pr = await env.LIVING_PAPER.prepare("SELECT substr(body_md, 1, 12000) AS b FROM papers WHERE doi = ? LIMIT 1").bind(p.doi).first();
      var oq = extractOpenQuestions(pr && pr.b || "");
      var now = new Date().toISOString();
      await env.QNFO_AUDIT.prepare("INSERT OR IGNORE INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind("artifact_reentry:" + String(p.doi).replace(/[^a-z0-9]+/gi, "-").slice(0, 80), now, "artifact_reentry", p.doi, String(p.title || "").slice(0, 500), JSON.stringify(oq), oq.length ? 0.9 : 0, "research", "new", now).run();
      out.emitted++;
    } catch (e) { out.errors++; }
  }
  out.rescored = 0; out.expired = 0; out.expired_noq = 0; out.expired_stale = 0;
  var nowMs = Date.now(), cutNoq = new Date(nowMs - REENTRY_NOQ_TTL_H * 3600e3).toISOString();
  // REENTRY-DRAIN-1 rule 2 (runs first, so a signal re-scored below still gets this run's consume leg): a weight>0 signal
  // older than REENTRY_TTL_DAYS, bounded, oldest first.
  try {
    var st = await env.QNFO_AUDIT.prepare("UPDATE signals SET status='expired', decision=?1, ts=?2 WHERE id IN (SELECT id FROM signals WHERE source='artifact_reentry' AND status='new' AND COALESCE(evidential_weight,0) > 0 AND created_at < ?3 ORDER BY created_at ASC LIMIT ?4)")
      .bind("idea-hub " + VERSION + ": REENTRY-DRAIN-1 not consumed within " + REENTRY_TTL_DAYS + " days (consume leg paused or backed up); open_questions kept", new Date().toISOString(), new Date(nowMs - REENTRY_TTL_DAYS * 864e5).toISOString(), REENTRY_EXPIRE_BATCH).run();
    out.expired_stale = Number(st && st.meta && st.meta.changes) || 0;
  } catch (e) { out.errors++; }
  // REENTRY-DRAIN-1 rule 1: weight-0 signals past REENTRY_NOQ_TTL_H, oldest first, one paper read for the whole batch.
  var old0 = (await env.QNFO_AUDIT.prepare("SELECT id, source_ref FROM signals WHERE source='artifact_reentry' AND status='new' AND COALESCE(evidential_weight,0)=0 AND created_at < ?1 ORDER BY created_at ASC LIMIT ?2").bind(cutNoq, REENTRY_EXPIRE_BATCH).all()).results || [];
  if (old0.length) {
    var refs = old0.map(function (r) { return String(r.source_ref); }), bodies = new Map();
    try {
      var pb = (await env.LIVING_PAPER.prepare("SELECT doi, substr(body_md, 1, 12000) AS b FROM papers WHERE doi IN (" + refs.map(function () { return "?"; }).join(",") + ")").bind(...refs).all()).results || [];
      pb.forEach(function (r) { var k = String(r.doi); if (!bodies.has(k) || (!bodies.get(k) && r.b)) bodies.set(k, r.b || ""); });
    } catch (e) { out.errors++; old0 = []; }
    for (var x = 0; x < old0.length; x++) {
      var so = old0[x], ref = String(so.source_ref), nowX = new Date().toISOString();
      try {
        if (!bodies.has(ref)) { await env.QNFO_AUDIT.prepare("UPDATE signals SET status='expired', decision=?, ts=? WHERE id=? AND status='new'").bind("idea-hub " + VERSION + ": paper " + ref.slice(0, 80) + " not in living-paper", nowX, so.id).run(); out.expired++; continue; }
        var oqx = extractOpenQuestions(bodies.get(ref));
        if (oqx.length) { await env.QNFO_AUDIT.prepare("UPDATE signals SET open_questions=?, evidential_weight=0.9, ts=? WHERE id=?").bind(JSON.stringify(oqx), nowX, so.id).run(); out.rescored++; continue; }
        await env.QNFO_AUDIT.prepare("UPDATE signals SET status='expired', decision=?, ts=? WHERE id=? AND status='new'").bind("idea-hub " + VERSION + ": REENTRY-DRAIN-1 no open question found in the paper after " + REENTRY_NOQ_TTL_H + " h of re-checks (a weight-0 signal is never consumed)", nowX, so.id).run();
        out.expired_noq++;
      } catch (e) { out.errors++; }
    }
  }
  // Re-score rotation for the younger weight-0 signals (REENTRY-RESCORE-1).
  var zero = (await env.QNFO_AUDIT.prepare("SELECT id, source_ref FROM signals WHERE source='artifact_reentry' AND status='new' AND COALESCE(evidential_weight,0)=0 AND created_at >= ?1 ORDER BY ts ASC LIMIT ?2").bind(cutNoq, RESCORE_BATCH).all()).results || [];
  for (var z = 0; z < zero.length; z++) {
    var sg = zero[z], nowZ = new Date().toISOString();
    try {
      var pz = await env.LIVING_PAPER.prepare("SELECT substr(body_md, 1, 12000) AS b FROM papers WHERE doi = ? LIMIT 1").bind(sg.source_ref).first();
      if (!pz) { await env.QNFO_AUDIT.prepare("UPDATE signals SET status='expired', decision=?, ts=? WHERE id=?").bind("idea-hub " + VERSION + ": paper " + String(sg.source_ref).slice(0, 80) + " not in living-paper", nowZ, sg.id).run(); out.expired++; continue; }
      var oqz = extractOpenQuestions(pz.b || "");
      if (oqz.length) { await env.QNFO_AUDIT.prepare("UPDATE signals SET open_questions=?, evidential_weight=0.9, ts=? WHERE id=?").bind(JSON.stringify(oqz), nowZ, sg.id).run(); out.rescored++; }
      else await env.QNFO_AUDIT.prepare("UPDATE signals SET ts=? WHERE id=?").bind(nowZ, sg.id).run();
    } catch (e) { out.errors++; }
  }
  return out;
}
async function runConsume(env) {
  var out = { consumed: 0, proposals: 0, paused: false, errors: 0 };
  var pending = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE status IN ('new','deferred_budget')").first();
  if (pending && Number(pending.n) > PROPOSAL_BACKPRESSURE) { out.paused = true; return out; }
  var b = await env.QNFO_AUDIT.prepare("SELECT permitted FROM signal_worker_boundary WHERE worker='idea-hub' AND source='" + REENTRY_BOUNDARY_SOURCE + "'").first();
  if (!b || Number(b.permitted) !== 1) { out.paused = true; return out; }
  var rows = (await env.QNFO_AUDIT.prepare("SELECT id, source_ref, open_questions FROM signals WHERE source='artifact_reentry' AND status='new' AND evidential_weight > 0 ORDER BY created_at LIMIT ?1").bind(CONSUME_SIGNALS).all()).results || [];
  for (var i = 0; i < rows.length; i++) {
    var sg = rows[i], oq = [];
    try { oq = JSON.parse(sg.open_questions || "[]"); } catch (e) {}
    var ok = true;
    var qs = Array.isArray(oq) ? oq.slice(0, CONSUME_QUESTIONS) : [];
    for (var j = 0; j < qs.length; j++) {
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES (?,?,?,?,?,?)")
          .bind("auto-reentry", "Re-entry from " + String(sg.source_ref || "").slice(0, 120) + ": " + String(qs[j]).slice(0, 1800), "auto", "new", "l8-reentry", new Date().toISOString()).run();
        out.proposals++;
      } catch (e) { out.errors++; ok = false; }
    }
    if (ok) { await env.QNFO_AUDIT.prepare("UPDATE signals SET status='consumed', decision=? WHERE id=?").bind("idea-hub " + VERSION + ": " + qs.length + " of " + oq.length + " open questions proposed", sg.id).run(); out.consumed++; }
  }
  return out;
}

// OWNER-SIGNAL-INTAKE-1 (1.7.0): the think loop used a fixed prompt ("energy-efficient computing, quantum foundations,
// information thermodynamics"), which kept the generated ideas on the themes the owner has moved away from. It now seeds
// from up to THINK_SEED_N of the owner's own accepted ideas (direct and notebook), sampled at random, and asks for a
// question that extends or connects them; with none on file it falls back to the corpus-gap prompt without fixed themes.
var THINK_SEED_N = 3;
async function thinkSeed(env) {
  var rows = [];
  try { rows = (await env.QNFO_AUDIT.prepare("SELECT idea FROM idea_proposals WHERE decision='ACCEPT' AND (name='owner-corpus' OR contact='owner' OR name LIKE 'rowan%' OR name LIKE 'owner%') ORDER BY random() LIMIT ?1").bind(THINK_SEED_N).all()).results || []; } catch (e) {}
  if (!rows.length) return "Generate one novel research question that fills a gap in the existing QNFO corpus. Avoid quantum error correction, which the corpus already over-represents.";
  return "The author's own lines of work:\n" + rows.map(function (r) { return "- " + String(r.idea || "").replace(/\s+/g, " ").slice(0, 500); }).join("\n") + "\n\nPropose ONE novel, falsifiable question that extends one of these lines or connects two of them. Stay in the author's own terms and fields.";
}
// ---- owner corpus (OWNER-SIGNAL-INTAKE-1, #2104) ----
// notes_intake (written hourly by calendar-api from the R2 bucket obsidian-vault) indexes the owner's notebook: 6,589
// notes on 2026-10-07, read until now only by the calendar/GTD leg. Each hourly cycle takes OWNER_CORPUS_BATCH notes not
// yet in owner_corpus_seen (newest path first), reads the body from VAULT, and asks one cheap model to extract the
// single strongest original research idea, or none. An extracted idea becomes an idea_proposals row (name 'owner-corpus',
// contact 'owner', ip_hash corpus:<path hash>) that triage ACCEPTs at OWNER_CORPUS_SCORE_MIN. Every note gets one
// owner_corpus_seen row (proposed, none, short, missing, error) so nothing is read twice. The leg pauses under the same
// PROPOSAL_BACKPRESSURE as the others, and while OWNER_CORPUS_RQ_CAP research rows are already waiting, so the notebook
// cannot flood research_queue.
var OWNER_CORPUS_BATCH = 4, OWNER_CORPUS_MIN_CHARS = 600, OWNER_CORPUS_EXCERPT = 7000, OWNER_CORPUS_RQ_CAP = 12;
var OWNER_CORPUS_TYPES = ["note", "synthesis", "synthesis-working-draft", "development-note", "lesson"];
var OWNER_CORPUS_MODEL = "@cf/zai-org/glm-5.3-flash";
var OWNER_CORPUS_PROMPT = "You read one note from the private research notebook of Rowan Brad Quni-Gudzinas, an independent researcher. Extract the single strongest ORIGINAL research idea the author is developing in it: a claim, conjecture or question that a theoretical or computational paper could investigate. Ignore assistant boilerplate, chat pleasantries, task lists, system prompts and operations notes. Return JSON only, either {\"title\": \"<= 14 words\", \"idea\": \"<= 160 words: the claim or question, why it matters, and how a derivation, simulation or formal analysis could test it\"} or {\"none\": \"<= 15 words why\"} when the note holds no research idea.\n\nNOTE:\n";
function corpusBody(t) { return String(t || "").replace(/^---\n[\s\S]*?\n---\n/, "").replace(/\r/g, "").trim(); }
async function shortHash(s) {
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(d)).slice(0, 8).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
async function runOwnerCorpus(env) {
  var out = { ok: true, picked: 0, proposed: 0, none: 0, short: 0, missing: 0, errors: 0 };
  if (!env.VAULT) { out.ok = false; out.why = "VAULT binding absent"; return out; }
  var pending = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE status IN ('new','deferred_budget')").first();
  if (pending && Number(pending.n) > PROPOSAL_BACKPRESSURE) { out.paused = "proposal backpressure"; return out; }
  var rq = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM research_queue WHERE status IN ('queued','researching','review')").first();
  if (rq && Number(rq.n) >= OWNER_CORPUS_RQ_CAP) { out.paused = "research_queue at " + rq.n; return out; }
  await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS owner_corpus_seen (path TEXT PRIMARY KEY, sig TEXT, ts TEXT, outcome TEXT, proposal_id INTEGER, note TEXT)").run();
  var rows = (await env.QNFO_AUDIT.prepare("SELECT n.path, n.sig FROM notes_intake n LEFT JOIN owner_corpus_seen s ON s.path = n.path WHERE s.path IS NULL AND n.type IN (" + OWNER_CORPUS_TYPES.map(function () { return "?"; }).join(",") + ") AND n.path LIKE 'notes/%' AND COALESCE(n.status, '') NOT IN ('archived', 'done') ORDER BY n.path DESC LIMIT ?").bind(...OWNER_CORPUS_TYPES, OWNER_CORPUS_BATCH).all()).results || [];
  for (var i = 0; i < rows.length; i++) {
    var n = rows[i], now = new Date().toISOString(), outcome = "error", pid = null, note = "";
    out.picked++;
    try {
      var obj = await env.VAULT.get(n.path);
      if (!obj) { outcome = "missing"; out.missing++; }
      else {
        var body = corpusBody(await obj.text());
        if (body.length < OWNER_CORPUS_MIN_CHARS) { outcome = "short"; out.short++; }
        else {
          var ai = await aiRunAttr(env, "idea-hub", "owner-corpus", OWNER_CORPUS_MODEL, { messages: [{ role: "user", content: OWNER_CORPUS_PROMPT + body.slice(0, OWNER_CORPUS_EXCERPT) }], max_tokens: 600, temperature: 0.2 });
          var m = tExtract(ai).match(/\{[\s\S]*\}/), j = null;
          if (m) { try { j = JSON.parse(m[0]); } catch (e) {} }
          if (j && j.idea && String(j.idea).trim().length >= 40) {
            var idea = (j.title ? String(j.title).trim().replace(/[.\s]+$/, "") + ". " : "") + String(j.idea).trim().slice(0, 1600) + "\n\nSource: owner notebook " + n.path;
            var tag = "corpus:" + await shortHash(n.path);
            var seen = await env.QNFO_AUDIT.prepare("SELECT id FROM idea_proposals WHERE ip_hash = ?1 LIMIT 1").bind(tag).first();
            if (seen) pid = seen.id;
            else {
              var ins = await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES ('owner-corpus', ?1, 'owner', 'new', ?2, ?3)").bind(idea, tag, now).run();
              pid = ins && ins.meta && ins.meta.last_row_id || null;
            }
            outcome = "proposed"; out.proposed++;
          } else if (j && j.none) { outcome = "none"; note = String(j.none).slice(0, 200); out.none++; }
          else { outcome = "error"; note = "unparseable model reply"; out.errors++; }
        }
      }
    } catch (e) { outcome = "error"; note = String(e && e.message || e).slice(0, 200); out.errors++; }
    try { await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO owner_corpus_seen (path, sig, ts, outcome, proposal_id, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(n.path, n.sig || null, now, outcome, pid, note).run(); } catch (e) { out.errors++; }
  }
  return out;
}
// ---- think loop (folded from qnfo-autopilot 0.3.3) ----
var THINK_EVERY_H = 6;
var THINK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
async function thinkLoop(env) {
  var pending = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE status IN ('new','deferred_budget')").first();
  if (pending && Number(pending.n) > PROPOSAL_BACKPRESSURE) return { ok: true, skipped: "backpressure" };
  await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS self_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, question TEXT, hypothesis TEXT, source TEXT, status TEXT)").run();
  var ai = await aiRunAttr(env, "idea-hub", "think", THINK_MODEL, { messages: [
    { role: "system", content: 'You are the research planner for QNFO, an independent research imprint (one researcher with an AI-assisted pipeline). Propose ONE novel, falsifiable research question the fleet should investigate next. Output strict JSON only: {"question": "...", "hypothesis": "...", "why": "..."}. No markdown.' },
    { role: "user", content: await thinkSeed(env) }
  ], max_tokens: 1024 });
  var text = tExtract(ai).trim();
  if (!text) return { ok: false, why: "model empty" };
  var q = null, m = text.match(/\{[\s\S]*\}/);
  if (m) { try { q = JSON.parse(m[0]); } catch (e) {} }
  if (!q || !q.question) { var qm = text.match(/"question"\s*:\s*"([^"]+)"/); if (qm) q = { question: qm[1], hypothesis: "" }; }
  if (!q || !q.question) return { ok: false, why: "no parseable question" };
  var sig = function (x) { var o = new Set(); String(x || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).forEach(function (w) { if (w.length > 4) o.add(w); }); return o; };
  var contain = function (a, b) { if (!a.size || !b.size) return 0; var n = 0; a.forEach(function (x) { if (b.has(x)) n++; }); return n / Math.min(a.size, b.size); };
  var cand = sig(q.question);
  var recent = (await env.QNFO_AUDIT.prepare("SELECT question FROM self_questions WHERE status='open' AND ts >= ?1").bind(new Date(Date.now() - 7 * 864e5).toISOString()).all()).results || [];
  if (recent.some(function (r) { return contain(cand, sig(r.question)) >= 0.6; })) return { ok: true, skipped: "near-duplicate theme" };
  var now = new Date().toISOString(), question = String(q.question).slice(0, 300);
  await env.QNFO_AUDIT.prepare("INSERT INTO self_questions (ts, question, hypothesis, source, status) VALUES (?1, ?2, ?3, 'think-loop', 'open')").bind(now, question, String(q.hypothesis || "").slice(0, 300)).run();
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(question));
  var qh = Array.from(new Uint8Array(d)).slice(0, 4).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  var existing = await env.QNFO_AUDIT.prepare("SELECT id FROM idea_proposals WHERE ip_hash = ?1 LIMIT 1").bind(qh).first();
  if (!existing) await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES ('think-loop', ?1, '', 'new', ?2, ?3)").bind(question, qh, now).run();
  return { ok: true, question: question, routed: !existing };
}
// ASK-GAP-1 (2026-10-02, autonomy audit; pillars research + autonomy): qnfo-ai-search marks an answer 'uncovered' when the
// corpus excerpts do not cover the question (ask_events.uncovered), and nothing read that column. Questions readers asked
// that the corpus cannot answer are the clearest demand signal the fleet has, so each hour the distinct uncovered questions
// of the last 7 days that pass the same research-domain gate as the public feed (publicTitle) become idea proposals
// (name 'ask-gap'), at most ASK_GAP_BATCH a run, deduplicated by question hash, paused under PROPOSAL_BACKPRESSURE like
// re-entry. Triage then scores them with everything else; nothing is published from here.
var ASK_GAP_BATCH = 5;
async function runAskGap(env) {
  var out = { ok: true, candidates: 0, inserted: 0, skipped: 0 };
  var pending = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status IN ('new', 'deferred_budget')").first().catch(function () { return null; });
  if (pending && Number(pending.n) > PROPOSAL_BACKPRESSURE) { out.paused = true; return out; }
  var rows = (await env.QNFO_AUDIT.prepare("SELECT qhash, MIN(query) AS query, COUNT(*) AS n FROM ask_events WHERE uncovered = 1 AND COALESCE(cached, 0) = 0 AND error IS NULL AND query IS NOT NULL AND ts > datetime('now', '-7 days') GROUP BY qhash ORDER BY n DESC, MAX(ts) DESC LIMIT 25").all().catch(function () { return { results: [] }; })).results || [];
  out.candidates = rows.length;
  for (var i = 0; i < rows.length && out.inserted < ASK_GAP_BATCH; i++) {
    var q = clean(String(rows[i].query || "").replace(/^\[paper:[^\]]*\]\s*/, ""), 600);
    if (!publicTitle(q)) { out.skipped++; continue; }
    var tag = "ask-gap:" + String(rows[i].qhash || "").slice(0, 32);
    var seen = await env.QNFO_AUDIT.prepare("SELECT id FROM idea_proposals WHERE ip_hash = ?1 OR idea = ?2 LIMIT 1").bind(tag, q).first().catch(function () { return null; });
    if (seen) { out.skipped++; continue; }
    await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES ('ask-gap', ?1, '', 'new', ?2, datetime('now'))").bind(q, tag).run();
    out.inserted++;
  }
  return out;
}
async function ideationCycle(env) {
  var r = {};
  try { r.reentry = await runReentry(env); } catch (e) { r.reentry = { error: String(e && e.message || e) }; }
  try { r.consume = await runConsume(env); } catch (e) { r.consume = { error: String(e && e.message || e) }; }
  try { r.askgap = await runAskGap(env); } catch (e) { r.askgap = { error: String(e && e.message || e) }; }
  try { r.corpus = await runOwnerCorpus(env); } catch (e) { r.corpus = { error: String(e && e.message || e) }; }
  if (new Date().getUTCHours() % THINK_EVERY_H === 0) { try { r.think = await thinkLoop(env); } catch (e) { r.think = { error: String(e && e.message || e) }; } }
  r.triage = await triageProposals(env);
  return r;
}
// ---- IDEAS-QDS-1 (2026-10-02, pillar reach): ideas.qnfo.org as a readable page on the QNFO design system ----
// The public page was a bare <h1> with an RSS link, and every RSS item pointed at /#/s/<id>, a client route nothing
// served. "/" now lists the public threads server-side and /s/<id> renders one thread. Both read through exactly the
// same gates as /api/sessions and /api/session/<id> (publicTitle, blocked, per-message INTERNAL/OPS/JUNK), so nothing
// becomes visible that the API did not already publish. Pages are cached 5 minutes (all() runs one D1 query per thread).
function ideaText(s, max) {
  return stripInj(s)
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[redacted]").replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]")
    .replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max || 200000);
}
// Some rows were stored with every newline collapsed to a space. Put back the block breaks markdown needs (headings,
// table rows, bold-led list items, fences) so those answers read as sections instead of one paragraph.
function ideaReflow(s) {
  if (s.indexOf("\n") >= 0 || s.length < 300) return s;
  s = s.replace(/ (#{1,6}) (?=\S)/g, "\n\n$1 ").replace(/\| \|/g, "|\n|").replace(/ (```)/g, "\n$1")
    .replace(/ - (?=\*\*)/g, "\n- ").replace(/([.:)]) (\d{1,2}\. )(?=\*\*|[A-Z])/g, "$1\n$2");
  // A collapsed heading runs into its first sentence; end it before the first "Word word" pair after its first word.
  return s.split("\n").map(function(l) {
    const m = /^(#{1,6} )(.*)$/.exec(l);
    if (!m) return l;
    const w = m[2].split(" ");
    for (let k = 1; k < Math.min(w.length - 1, 16); k++) {
      if (!/[A-Za-z]{2}/.test(w.slice(0, k).join(" "))) continue;
      const starter = /^(The|This|These|That|A|An|It|Its|Your|Before|After|We|There|Here|Each|Every|Most|What|When|Yes|No|In|For|To|Let|Suppose|Consider|Define|Take|Given|If|Assume|Write|Our|One|Two|Three)$/.test(w[k]);
      if (/^[A-Z][a-z]+[,;:]?$/.test(w[k]) && (starter || (/^[a-z(]/.test(w[k + 1]) && !/^(and|or|of|the|in|on|for|to|vs\.?|with|as)$/.test(w[k + 1]))) && !/^(and|or|of|the|a|an|in|on|to|for|vs\.?)$/i.test(w[k - 1])) {
        return m[1] + w.slice(0, k).join(" ") + "\n\n" + w.slice(k).join(" ");
      }
    }
    return m[2].length > 100 ? m[2] : l;
  }).join("\n").replace(/([^|\n]) (\| [^\n]*\|)\n(\|[-:| ]+\|)/g, "$1\n$2\n$3");
}
function ideaShort(t, n) { t = String(t || ""); if (t.length <= n) return t; const cut = t.slice(0, n); const sp = cut.lastIndexOf(" "); return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, "") + "\u2026"; }
function ideaTitle(t) { return String(t || "").replace(/^#+\s*/, "").replace(/^\d+\.\s+/, "").replace(/\*\*/g, ""); }
function ideaInline(s) {
  return s.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="nofollow noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" rel="nofollow noopener">$2</a>');
}
// Small, safe markdown: escape first, then fences, headings, lists, quotes, tables as preformatted text, paragraphs.
function ideaMd(src) {
  const lines = esc(ideaReflow(String(src || ""))).split("\n");
  const out = [];
  let para = [], list = null, fence = null;
  const flush = function() {
    if (para.length) { out.push("<p>" + ideaInline(para.join(" ")) + "</p>"); para = []; }
    if (list) { out.push("<" + list.t + ">" + list.items.map(function(i) { return "<li>" + ideaInline(i) + "</li>"; }).join("") + "</" + list.t + ">"); list = null; }
  };
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, "");
    if (fence !== null) { if (/^```/.test(l)) { out.push("<pre><code>" + fence.join("\n") + "</code></pre>"); fence = null; } else fence.push(raw); continue; }
    if (/^```/.test(l)) { flush(); fence = []; continue; }
    let m;
    if (!l.trim()) { flush(); continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { flush(); const n = Math.min(4, Math.max(2, m[1].length + 1)); out.push("<h" + n + ">" + ideaInline(m[2]) + "</h" + n + ">"); continue; }
    if (/^(-{3,}|\*{3,})$/.test(l.trim())) { flush(); out.push("<hr>"); continue; }
    if ((m = /^\s*(?:[-*\u2022])\s+(.*)$/.exec(l))) { if (para.length) flush(); if (!list || list.t !== "ul") { flush(); list = { t: "ul", items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (para.length) flush(); if (!list || list.t !== "ol") { flush(); list = { t: "ol", items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^&gt;\s?(.*)$/.exec(l))) { flush(); out.push("<blockquote><p>" + ideaInline(m[1]) + "</p></blockquote>"); continue; }
    if (/^\|.*\|$/.test(l.trim())) { flush(); out.push('<pre class="idea-table">' + l + "</pre>"); continue; }
    if (list) { list.items[list.items.length - 1] += " " + l.trim(); continue; }
    para.push(l.trim());
  }
  if (fence !== null) out.push("<pre><code>" + fence.join("\n") + "</code></pre>");
  flush();
  return out.join("\n").replace(/<\/pre>\n<pre class="idea-table">/g, "\n").replace(/<pre class="idea-table">([\s\S]*?)<\/pre>/g, function(_, body) {
    const rows = body.split("\n").filter(function(r) { return !/^\|[-:| ]+\|$/.test(r.trim()); }).map(function(r) { return r.trim().replace(/^\||\|$/g, "").split("|").map(function(c) { return ideaInline(c.trim()); }); });
    if (!rows.length) return "";
    return '<div class="q-table-wrap"><table class="q-table"><thead><tr>' + rows[0].map(function(c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.slice(1).map(function(r) { return "<tr>" + r.map(function(c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  });
}
// The ideation scorer stores its verdict as JSON; show it as a scorecard instead of raw JSON.
function ideaScorecard(content) {
  const t = String(content || "").trim();
  if (t.charAt(0) !== "{") return null;
  let j;
  try { j = JSON.parse(t); } catch (e) { return null; }
  if (!j || typeof j !== "object" || !("technical_merit" in j)) return null;
  const rows = [["Technical merit", j.technical_merit], ["Impact potential", j.impact_potential], ["Novelty", j.novelty], ["Feasibility", j.feasibility]]
    .filter(function(r) { return typeof r[1] === "number"; });
  return '<div class="q-panel idea-score"><p class="q-eyebrow">Automated triage score</p>' + (j.question ? '<p class="idea-score-q">' + ideaInline(esc(j.question)) + "</p>" : "") +
    '<dl class="idea-bars">' + rows.map(function(r) {
      const v = Math.max(0, Math.min(100, Math.round(r[1])));
      return "<div><dt>" + r[0] + '</dt><dd><span class="idea-bar"><i style="width:' + v + '%"></i></span><b class="q-num">' + v + "</b></dd></div>";
    }).join("") + "</dl>" + '<p class="q-meta">Scored 0 to 100 by two models when the question was proposed. A score ranks questions for the research queue; it is not a finding.</p></div>';
}
var IDEA_CSS = '<style>.idea-list{list-style:none;margin:0;padding:0}.idea-list li{padding:20px 0;border-bottom:1px solid var(--q-rule)}.idea-list li[hidden]{display:none}.idea-t{font:500 1.22rem/1.35 var(--q-serif);text-decoration:none;color:var(--q-ink);display:block;max-width:70ch}.idea-t:hover{color:var(--q-accent)}.idea-m{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:var(--q-fs-sm);color:var(--q-muted)}.idea-filter{max-width:560px;margin:8px 0 6px}.idea-q{font:500 clamp(1.5rem,2.6vw,2.1rem)/1.25 var(--q-serif);letter-spacing:-.01em;margin:0 0 14px;max-width:34ch;overflow-wrap:anywhere}.idea-q-full{font:400 var(--q-fs-read)/1.6 var(--q-serif);color:var(--q-muted);margin:0 0 24px;max-width:var(--q-measure)}.idea-turn{margin:36px 0 0}.idea-role{font:600 var(--q-fs-sm)/1 var(--q-sans);color:var(--q-accent);margin:0 0 12px;display:flex;gap:10px;align-items:center}.idea-score{margin:24px 0;max-width:640px}.idea-score-q{font:500 1.1rem/1.45 var(--q-serif);margin:6px 0 16px}.idea-bars{display:grid;gap:10px;margin:0 0 14px}.idea-bars div{display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:center}.idea-bars dt{font-size:var(--q-fs-sm);color:var(--q-muted)}.idea-bars dd{margin:0;display:flex;gap:10px;align-items:center}.idea-bar{flex:1;height:8px;border-radius:99px;background:var(--q-rule);overflow:hidden}.idea-bar i{display:block;height:100%;background:var(--q-accent)}.idea-table{font:400 .8rem/1.5 var(--q-mono)}@media (max-width:560px){.idea-bars div{grid-template-columns:1fr}}</style>';
function ideaPage(o, body, status) {
  const html = qdsPage({ title: o.title, description: o.description, canonical: o.canonical, brand: "qnfo", active: "ideas", jsonld: o.jsonld, math: !!o.math, robots: o.robots, extra: IDEA_CSS + (o.head || "") }, body);
  return new Response(html, { status: status || 200, headers: { ...cors(), "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
function ideaDate(s) { const d = new Date(s || 0); return Number.isNaN(d.getTime()) || !s ? "" : d.toISOString().slice(0, 10); }
function ideaLd(o) {
  return '<script type="application/ld+json">' + JSON.stringify(Object.assign({ "@context": "https://schema.org", author: { "@type": "Person", name: "Rowan Brad Quni-Gudzinas", sameAs: ["https://orcid.org/" + QDS_OWNER_ORCID] }, publisher: { "@type": "Organization", name: "QNFO", url: "https://qnfo.org/" } }, o)).replace(/</g, "\\u003c") + "<\/script>";
}
async function ideasHome(env) {
  let items = [];
  try { items = await all(env); } catch (e) { items = []; }
  // 2026-08-31 owner mandate (qnfo-web-unified/README.md): only threads asked through the QNFO AI endpoint (the chat
  // table), not the chat_sessions archive, and only the latest 20.
  // IDEAS-QUESTIONS-SOURCE-1: include the fleet's own open questions and triaged proposals
  // (source 'ideation'), not only the chat threads asked through the endpoint.
  const list = items.filter(function(x) { return x.source === "live" || x.source === "ideation"; }).slice(0, 20);
  const newest = list.length ? ideaDate(list[0].updated_at) : "";
  const rows = list.map(function(x) {
    const t = ideaShort(ideaTitle(x.title), 200);
    return '<li data-t="' + esc(t.toLowerCase()) + '"><a class="idea-t" href="/s/' + encodeURIComponent(x.id) + '">' + esc(t) + '</a><div class="idea-m"><time datetime="' + esc(x.updated_at || "") + '">' + ideaDate(x.updated_at) + "</time>" +
      (x.message_count ? "<span>" + x.message_count + (x.message_count === 1 ? " message" : " messages") + "</span>" : "") + "</div></li>";
  }).join("");
  const body = '<section class="q-hero" style="padding-bottom:16px"><div class="q-wrap"><p class="q-eyebrow">Ideas</p><h1 class="q-display" style="max-width:18ch">Research questions as they develop</h1>' +
    '<p class="q-lede">Questions put to the QNFO research assistant and the answers it wrote from the corpus, published as they happen. Personal, operational and quarantined conversations never appear here. When a question holds up, it becomes a paper; <a href="https://papers.qnfo.org/papers">the papers</a> are the record.</p></div></section>' +
    '<section class="q-section" style="padding-top:8px" aria-labelledby="ideas-h"><div class="q-wrap"><div class="q-section-head"><h2 class="q-h2" id="ideas-h">' + (list.length === 20 ? "The latest 20" : list.length + " public items") + "</h2>" + (newest ? '<span class="q-meta">Newest ' + newest + "</span>" : "") + "</div>" +
    (list.length ? '<label class="q-field idea-filter"><span class="q-sr">Filter threads</span><input id="idea-f" type="search" placeholder="Filter by words in the question" autocomplete="off"></label><p class="q-meta" id="idea-n" aria-live="polite"></p><ul class="idea-list" id="idea-l">' + rows + "</ul>"
      : '<div class="q-note">No public threads right now. New questions appear here within five minutes of being asked; <a href="https://ask.qwav.tech/">ask the corpus</a> or read <a href="https://papers.qnfo.org/papers">the papers</a> meanwhile.</div>') +
    // REACH-IDEA-1 (1.5.7, agent_issues 2001): an inline subscribe box (email input) posting to /api/subscribe, which forwards to
    // the qnfo-subscribers double opt-in with source ideas.qnfo.org; the honeypot field is the same one qnfo.org uses.
    '<section class="q-panel" id="subscribe" aria-labelledby="ideas-sub-h" style="margin-top:40px"><h2 class="q-h3" id="ideas-sub-h" style="margin:0 0 4px">Follow new work</h2><p class="q-meta" style="margin:0 0 12px">New threads by <a href="/rss.xml">RSS</a>. New papers by email: one short weekly digest, confirm by the link we send, unsubscribe any time.</p>' +
    '<form id="ideas-sub-form" novalidate style="display:flex;gap:8px;flex-wrap:wrap"><label class="q-sr" for="ideas-sub-email">Email address</label><input class="q-input" id="ideas-sub-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required style="flex:1 1 220px;min-width:0"><input class="q-sr" type="text" id="ideas-sub-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="q-btn q-btn-accent" type="submit" id="ideas-sub-btn">Subscribe</button></form><p class="q-meta" id="ideas-sub-msg" role="status" aria-live="polite" style="min-height:1.4em;margin:8px 0 0"></p></section>' +
    "</div></section>";
  const subJs = "<script>(function(){var f=document.getElementById('ideas-sub-form');if(!f)return;var m=document.getElementById('ideas-sub-msg'),b=document.getElementById('ideas-sub-btn');f.addEventListener('submit',function(e){e.preventDefault();var em=(document.getElementById('ideas-sub-email').value||'').trim(),hp=(document.getElementById('ideas-sub-hp')||{}).value||'';if(!em||em.indexOf('@')<1){m.textContent='Enter a valid email address.';return}b.disabled=true;m.textContent='Subscribing...';fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,hp:hp})}).then(function(r){return r.json().catch(function(){return {}})}).then(function(j){if(j&&j.ok){m.textContent='Check your inbox to confirm the subscription.';f.reset()}else{m.textContent=(j&&j.error)||'The subscription did not go through. Try again.'}}).catch(function(){m.textContent='Network error. Try again.'}).then(function(){b.disabled=false})})})();<\/script>";
  const js = subJs + '<script>(function(){if(/^#\\/s\\//.test(location.hash)){location.replace("/s/"+location.hash.slice(4));return}var f=document.getElementById("idea-f"),l=document.getElementById("idea-l"),n=document.getElementById("idea-n");if(!f||!l)return;f.addEventListener("input",function(){var q=f.value.trim().toLowerCase(),k=0;l.querySelectorAll("li").forEach(function(li){var h=!q||li.getAttribute("data-t").indexOf(q)>=0;li.hidden=!h;if(h)k++});n.textContent=q?k+" of "+l.children.length+" threads":""})})()<\/script>';
  return ideaPage({ title: "Ideas \u00b7 research questions as they develop \u00b7 QNFO", description: "Public research conversations from the QNFO research assistant: questions, answers written from the paper corpus, and automated triage scores.", canonical: BASE + "/", math: /\$|\\\(|\\\[/.test(rows),
    jsonld: ideaLd({ "@type": "CollectionPage", name: "QNFO Ideas", url: BASE + "/", description: "Public research conversations from the QNFO research assistant." }), head: "" }, body + js);
}
// IDEAS-QUESTIONS-SOURCE-1: render a fleet question / idea proposal (id q-N or p-N) on its own page.
async function ideasQuestion(env, kind, num) {
  let row = null, q = "", status = "", created = null;
  try {
    if (kind === "q") { const r = (await env.QNFO_AUDIT.prepare("SELECT question AS q, ts, status FROM self_questions WHERE id=?").bind(num).all()).results || []; row = r[0]; if (row) { q = row.q; created = ts(row.ts); status = row.status || ""; } }
    else { const r = (await env.QNFO_AUDIT.prepare("SELECT idea AS q, created_at, status FROM idea_proposals WHERE id=?").bind(num).all()).results || []; row = r[0]; if (row) { q = row.q; created = ts(row.created_at); status = row.status || ""; } }
  } catch (e) { row = null; }
  if (!row || !pubQuestion(q)) {
    return ideaPage({ title: "Question not found \u00b7 QNFO Ideas", description: "This question is not public.", robots: "noindex" },
      '<section class="q-hero"><div class="q-wrap"><p class="q-eyebrow">Ideas</p><h1 class="q-h1">This question is not public</h1><p class="q-lede"><a href="/">See every public question</a>.</p></div></section>', 404);
  }
  const title = ideaShort(ideaTitle(clean(q, 300)), 160);
  const kindLabel = kind === "q" ? "Open research question" : (status === "triaged_accepted" ? "Queued research question" : "Proposed research question");
  const body = '<div class="q-wrap" style="padding-top:36px;padding-bottom:64px"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">\u2190 All questions</a></p>' +
    '<h1 class="idea-q">' + esc(title) + "</h1>" +
    '<p class="q-meta">' + kindLabel + (created ? " \u00b7 " + ideaDate(created) : "") + ' \u00b7 generated autonomously by the QNFO research pipeline</p>' +
    '<p class="q-note" style="margin-top:24px">This is a question the QNFO pipeline is developing. Answers become <a href="https://papers.qnfo.org/papers">papers</a> when they hold up. <a href="https://ask.qwav.tech/?q=' + encodeURIComponent(title.slice(0, 300)) + '">Ask it against the current corpus</a>.</p></div>';
  return ideaPage({ title: title.slice(0, 90) + " \u00b7 QNFO Ideas", description: ideaTitle(clean(q, 300)), canonical: BASE + "/s/" + (kind === "q" ? "q-" : "p-") + num, math: /\$|\\\(|\\\[/.test(q),
    jsonld: ideaLd({ "@type": "Question", name: title.slice(0, 110), url: BASE + "/s/" + (kind === "q" ? "q-" : "p-") + num }) }, body);
}
async function ideasThread(env, rawId) {
  let id = "";
  try { id = decodeURIComponent(rawId); } catch (e) { id = rawId; }
  if (/^q-\d+$/.test(id)) return ideasQuestion(env, "q", id.slice(2));
  if (/^p-\d+$/.test(id)) return ideasQuestion(env, "p", id.slice(2));
  let rows = [];
  try { rows = (await env.QNFO_AUDIT.prepare("SELECT ts,role,content,model FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 500").bind(id).all()).results || []; } catch (e) { rows = []; }
  const first = rows.find(function(r) { return r.role === "user"; });
  if (!first || !publicTitle(first.content) || await blocked(env, id)) {
    return ideaPage({ title: "Thread not found \u00b7 QNFO Ideas", description: "This thread is not public.", robots: "noindex" },
      '<section class="q-hero"><div class="q-wrap"><p class="q-eyebrow">Ideas</p><h1 class="q-h1">This thread is not public</h1><p class="q-lede">It may have been removed, or it never passed the public filter. <a href="/">See every public thread</a>.</p></div></section>', 404);
  }
  const shown = rows.filter(function(r) { return r.role !== "system" && r !== first && !has(r.content, INTERNAL) && !has(r.content, OPS) && !has(r.content, JUNK); });
  const q = ideaText(first.content, 20000);
  const qTitle = ideaShort(ideaTitle(clean(first.content, 2000)), 160);
  const long = q.length > 260;
  const turns = shown.map(function(r) {
    const card = r.role === "assistant" ? ideaScorecard(r.content) : null;
    if (card) return card;
    const who = r.role === "user" ? "Follow-up" : "Research assistant";
    return '<div class="idea-turn"><p class="idea-role">' + who + (r.ts ? ' <span class="q-meta" style="font-weight:400">' + ideaDate(ts(r.ts)) + "</span>" : "") + '</p><div class="q-prose">' + ideaMd(ideaText(r.content)) + "</div></div>";
  }).join("");
  const updated = ts(rows[rows.length - 1].ts), created = ts(first.ts);
  const body = '<div class="q-wrap" style="padding-top:36px;padding-bottom:64px"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">\u2190 All threads</a></p>' +
    '<h1 class="idea-q">' + esc(long ? qTitle : ideaTitle(q)) + "</h1>" + (long ? '<div class="idea-q-full q-prose">' + ideaMd(q) + "</div>" : "") +
    '<p class="q-meta">Asked ' + ideaDate(created) + (updated && updated !== created ? " \u00b7 updated " + ideaDate(updated) : "") + ' \u00b7 <a href="https://ask.qwav.tech/?q=' + encodeURIComponent(qTitle.slice(0, 300)) + '">Ask it again against the current corpus</a></p>' +
    (turns || '<div class="q-note" style="margin-top:24px">No public answer yet.</div>') +
    '<p class="q-note" style="margin-top:40px">Answers here were written by an AI research assistant over the QNFO corpus and have not been reviewed. Cite <a href="https://papers.qnfo.org/papers">the papers</a>, not this thread.</p></div>';
  return ideaPage({ title: qTitle.slice(0, 90) + " \u00b7 QNFO Ideas", description: ideaTitle(clean(first.content, 300)), canonical: BASE + "/s/" + encodeURIComponent(id), math: /\$|\\\(|\\\[/.test(q + turns),
    jsonld: ideaLd({ "@type": "DiscussionForumPosting", headline: qTitle.slice(0, 110), url: BASE + "/s/" + encodeURIComponent(id), datePublished: created, dateModified: updated }) }, body);
}
async function ideasCached(req, ctx, make) {
  // IDEAS-SWR-1 (1.5.4): a cached copy is served at once; older than IDEAS_FRESH_MS it is rebuilt in the background, so a
  // visitor never waits on the ~12 s uncached build. The internal build stamp is not sent to visitors.
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL(req.url).origin + new URL(req.url).pathname + "?__swr=1", { method: "GET" });
  const store = async function() {
    const res = await make();
    if (!cache || res.status !== 200) return res;
    const body = await res.text();
    const hd = new Headers(res.headers);
    hd.set("X-Ideas-Built", String(Date.now()));
    hd.set("Cache-Control", "public, max-age=604800");
    try { await cache.put(key, new Response(body, { status: 200, headers: hd })); } catch (e) {}
    return new Response(body, { status: 200, headers: res.headers });
  };
  let hit = null;
  if (cache) { try { hit = await cache.match(key); } catch (e) { hit = null; } }
  if (!hit) return store();
  const age = Date.now() - Number(hit.headers.get("X-Ideas-Built") || 0);
  if (age > IDEAS_FRESH_MS && ctx && ctx.waitUntil) ctx.waitUntil(store().catch(function() {}));
  const hd = new Headers(hit.headers);
  hd.delete("X-Ideas-Built");
  hd.set("Cache-Control", "public, max-age=14400");
  return new Response(hit.body, { status: 200, headers: hd });
}
var IDEAS_FRESH_MS = 15 * 60 * 1000;
// ---- IDEAS-QDS-1:END ----


// IDEAS-PUBLIC-1 (2026-10-04): reverts IDEAS-PRIVATE-1. QNFO Ideas is a PUBLIC read-only surface --
// /, /index.html, /s/*, /api/sessions, /api/feed, /api/session/*, /rss.xml load with NO credential. The
// public filter below (publicTitle boundary match + quarantine + INTERNAL/OPS/JUNK stripping) is the ONLY
// gate, unchanged from v1.4.0-qds. POST /api/intake stays owner-authenticated (write path, not a public read).
// OWNER-TOKEN-SHADOW-1 (#1966): the intake accepts either worker secret, OWNER_TOKEN (set 2026-10-04T09:16Z for
// IDEAS-PRIVATE-1) or SYNC_TOKEN. Before, OWNER_TOKEN || SYNC_TOKEN let the new secret silently shadow the old one, so a
// client still sending SYNC_TOKEN got 401. Each secret shorter than 16 characters is ignored; every comparison is
// constant-time and both are always compared. No value is ever logged.
function ownerTokens(env){return [env.OWNER_TOKEN, env.SYNC_TOKEN].filter(function(t){return typeof t==='string'&&t.length>=16})}
function ctEq(a,b){if(a.length!==b.length)return false;var d=0;for(var i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
function ownerOk(req,env){
  var wants=ownerTokens(env);
  if(!wants.length)return false;
  var h=req.headers.get('Authorization')||'';
  var m=/^Bearer\s+(.+)$/i.exec(h.trim());
  var sup=m?m[1].trim():'';
  if(!sup){try{sup=new URL(req.url).searchParams.get('token')||''}catch(e){}}
  if(!sup)return false;
  var ok=false;for(var i=0;i<wants.length;i++){if(ctEq(wants[i],sup))ok=true}
  return ok;
}
async function intake(req,env){
  var b;try{b=await req.json()}catch(e){return json({error:'invalid JSON body'},400)}
  var kind=String(b.kind||'idea').toLowerCase();
  var title=clean(b.title||'',300);
  var body=String(b.body||b.text||'').slice(0,200000);
  if(!title&&!body)return json({error:'title or body required'},400);
  var src='owner-chat', now=Date.now();
  if(kind==='paper'){
    var slug=String(b.slug||title).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||('owner-'+now);
    try{await env.LIVING_PAPER.prepare("INSERT OR IGNORE INTO papers (identifier,slug,title,authors,abstract,body_md,status,created_at,updated_at,version) VALUES (?,?,?,?,?,?,'draft',datetime('now'),datetime('now'),'0.0.1')").bind('owner-'+slug,slug,title||'Untitled','["Rowan Brad Quni-Gudzinas"]',clean(body,2000),body).run()}catch(e){return json({error:'paper insert failed: '+(e&&e.message||e)},500)}
    return json({ok:true,kind:'paper',slug:slug,status:'draft',provenance:src,held:true});
  }
  if(kind==='issue'){
    try{await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (title,description,source,category,priority,status,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,?)").bind(title||'Owner-filed item',body||title,src,(b.category||'owner-intake'),(b.priority||'medium'),now,now).run()}catch(e){return json({error:'issue insert failed: '+(e&&e.message||e)},500)}
    return json({ok:true,kind:'issue',provenance:src,held:true});
  }
  try{await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name,idea,contact,status,created_at) VALUES (?,?,?,?,datetime('now'))").bind(src,(title?title+'\n\n':'')+body,'owner','new').run()}catch(e){return json({error:'idea insert failed: '+(e&&e.message||e)},500)}
  return json({ok:true,kind:'idea',provenance:src,status:'new',held:true});
}
// REACH-IDEA-1 (1.5.7, agent_issues 2001): the home page's subscribe box posts here; the address goes to the qnfo-subscribers
// double opt-in (the same endpoint and fields qnfo-gateway's /api/subscribe proxy uses) with source ideas.qnfo.org, so nothing
// is stored here and nobody is subscribed until they click the confirmation link. Rate limits live in qnfo-subscribers.
var SUBSCRIBERS_ENDPOINT = "https://qnfo-subscribers.q08.workers.dev";
async function subscribeProxy(req) {
  var payload = {};
  try { payload = await req.json(); } catch (e) { payload = {}; }
  var email = String(payload && payload.email || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^@\s]{1,64}@[^@\s.]{1,255}\.[^@\s.]{2,}$/.test(email)) return json({ ok: false, error: "Please enter a valid email address." }, 400);
  var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 9000);
  try {
    var r = await fetch(SUBSCRIBERS_ENDPOINT + "/subscribe", { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", "User-Agent": "idea-hub/" + VERSION, "X-Forwarded-For": req.headers.get("CF-Connecting-IP") || "", "X-Client-UA": String(req.headers.get("User-Agent") || "").slice(0, 300) },
      body: JSON.stringify({ email: email, hp: String(payload && (payload.hp || payload.website) || ""), source: "ideas.qnfo.org" }) });
    var data = await r.json().catch(function () { return {}; });
    return json(data && typeof data === "object" ? data : { ok: false, error: "Sign-up failed." }, r.status);
  } catch (e) {
    return json({ ok: false, error: "Sign-up is unavailable right now. Please try again shortly." }, 502);
  } finally { clearTimeout(timer); }
}
export default{async scheduled(event,env,ctx){ctx.waitUntil(ideationCycle(env))},async fetch(req,env,ctx){const u=new URL(req.url);if(u.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /\nSitemap: https://ideas.qnfo.org/sitemap.xml\n',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=86400'}});if(u.pathname==='/sitemap.xml')return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://ideas.qnfo.org/</loc><changefreq>daily</changefreq></url></urlset>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600'}});/* SEO-HYGIENE-1: robots + sitemap (home only: the idea pages are machine-generated questions, not invited into the index) */if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors()});try{if(u.pathname==='/api/subscribe'&&req.method==='POST')return await subscribeProxy(req);if(u.pathname==='/health'){let qt=-1;try{qt=(await quarantined(env)).size}catch(e){}let td=-1,tdd=-1;try{const r=await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status='deferred_budget'").first();td=Number(r&&r.n)||0;const r2=await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status='deferred_diversity'").first();tdd=Number(r2&&r2.n)||0}catch(e){}let oc=null;try{oc={};((await env.QNFO_AUDIT.prepare("SELECT outcome, COUNT(*) AS n FROM owner_corpus_seen GROUP BY outcome").all()).results||[]).forEach(function(x){oc[x.outcome]=x.n})}catch(e){oc=null}return json({ok:true,worker:'idea-hub',version:VERSION,private:false,owner_signal_intake:{vault_bound:!!env.VAULT,corpus_seen:oc,reentry_owner_types:REENTRY_OWNER_TYPES,corpus_score_min:OWNER_CORPUS_SCORE_MIN},triage_deferred_budget:td,triage_deferred_diversity:tdd,diversity_cap:{max_share:DIVERSITY_MAX_SHARE,min_n:DIVERSITY_MIN_N},public_filter:true,thread_filter:true,strict_filter:true,match_mode:'boundary',quarantine_wired:true,errata_wired:true,quarantine_threads:qt,mutation_routes:false,capabilities:["public-ideas-feed", "questions-feed", "rss", "session-pages", "ideation", "qds-pages", "owner-intake"],limitations:["read-only public surface: /, /s/*, /rss.xml, /api/sessions, /api/session/* load with no credential", "chat threads: only a first research-domain question passes the public filter; personal, ops and quarantined threads are never shown", "the feed also carries the pipeline's own open questions and triaged proposals (kind q-N / p-N, source ideation)", "/api/ask, /api/proposals and /run answer 503; POST /api/intake is owner-authenticated; POST /api/subscribe forwards an address to the qnfo-subscribers double opt-in (source ideas.qnfo.org; nobody is subscribed without clicking the confirmation link)", "ideation runs on the hourly :23 cron", "while a fleet_budget ai_spend cap is breached, triage still runs and scores on one cheap model (BUDGET-SOFT-ROUTE-1); rows left as status deferred_budget by older versions are released every run (count in triage_deferred_budget)", "a generated proposal scored ACCEPT waits as deferred_diversity (count in triage_deferred_diversity) while its topic cluster would exceed half of the 30-day accepts; owner and intake:* rows are never held"],bindings:{audit:!!env.QNFO_AUDIT}})}if(u.pathname==='/api/gate'){const q=u.searchParams.get('q')||'';return json({q,public:publicTitle(q),internal:has(q,INTERNAL),ops:has(q,OPS),junk:has(q,JUNK),research:has(q,RESEARCH),match_mode:'boundary'})}if(u.pathname==='/rss.xml')return rss(env);if(u.pathname==='/api/sessions'||u.pathname==='/api/feed')return sessions(u,env);if(u.pathname.startsWith('/api/session/'))return session(u.pathname,env);if(u.pathname==='/api/suggest')return json({policy:'research-domain only; personal/ops/actions/runtime metadata are never suggested',groups:[]});if(u.pathname==='/api/ask'||u.pathname==='/api/proposals'||u.pathname==='/run')return json({error:'mutation or ask route disabled on public ideas surface'},503);if(u.pathname==='/'||u.pathname==='/index.html')return ideasCached(req,ctx,function(){return ideasHome(env)});if(u.pathname.startsWith('/s/')&&u.pathname.length>3)return ideasCached(req,ctx,function(){return ideasThread(env,u.pathname.slice(3))});if(u.pathname==='/api/intake'){if(!ownerOk(req,env))return json({error:'Authentication required'},401);if(req.method!=='POST')return json({error:'POST required'},405);return await intake(req,env)}return json({error:'Not found'},404)}catch(e){return json({error:'Server error: '+(e&&e.message||String(e))},500)}}};