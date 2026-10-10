var VERSION="3.14.1-doi-scrub"; /* 3.14.1 NOZ-DOI-1 display-time safety net: titles and abstracts still carrying a retired-deposit DOI or host name are cleaned when rendered; plain math text reads \\mathrm{NA}, \\tfrac12 and \\, properly. 3.14.0 NOZ-DOI-1 + MD-INLINE-1 (2026-10-10, pillar reach): no DOI of the retired deposit service is shown, linked, put in citation_doi, JSON-LD, DataCite, OAI or API records, or fetched for a PDF (lpDoi drops that prefix; third-party DOIs pass); selected works and QWAV links point at papers.qnfo.org; paper titles are read as inline Markdown with math (italics, code, TeX) in every list and the paper page, abstract previews use the same reader, and titles and abstracts in <title>, og, twitter, citation_title, JSON-LD, RSS, OAI and the API are plain text; currency stays literal. 3.13.0 ASK-GROUND-1 (2026-10-10, pillar core, owner directive: answers verifiable against supplied text, fail closed): POST /api/ask returns 400 no_source without a slug and 404 no_source for an unknown or unpublished slug and makes no model call (it used to send an empty paper and answer from memory); it supplies up to 36000 characters of the paper (was 6000) and says when the text is cut; the prompt is process-only (answer only from the paper text, name what it does not cover) and every sentence of the answer carrying a DOI, link, author citation or figure absent from the paper text is removed. Tests: ask-ground.test.mjs. 3.12.0 OPEN-DATA-1 (2026-10-09, pillar reach): OAI-PMH 2.0 at /oai, open JSON API (/api/papers, /api/papers/<slug>, /feed.json), /openapi.json, and deleted DOIs (410 Gone, no DataCite record) are no longer shown, cited or exported as live. 3.11.3 MATH-RESIDUE-3 (3.11.2 + script-l, emphasis, sign, comma subscripts, link parentheses) (2026-10-06, agent_issues 2023, pillar reach): the typesetter catches three shapes the 22 real render defects left: a word opening with "(" whose script follows its closer ("(p/p_th)^(d/2)", "(\u22121)^{2s}", "(p+1)p^{n\u22121}") keeps the "(", script-l is a subscript base ("\\u2113_P"), an emphasis opened before a word and closed inside it stays emphasis, sign and sgn are functions, a comma subscript with no space ("t_Q,total") is one subscript, a link target may hold balanced parentheses, a run takes back its first word's "(" when that balances it ("(1 - p^{-s})^{-1}"), and a unit power ("1 dm^3") is math; Latin h-bar converts to \\hbar inside a run but never anchors one. scripts/math-corpus-check.mjs over 469 pages: defect pages 22 -> 12, 0 KaTeX failures, 0 prose words lost, visible raw "*" 156 -> 140, raw x_y 2847 -> 2805. 3.11.1 RENDER-HEALTH-PRECISION-1 (2026-10-06, agent_issues 2023, pillar reach): renderDefectCount stops counting four false-positive classes measured on the 68 flagged pages (correct Unicode sub- and superscripts, an escaped \$ shifting the $ pairing, URLs, one-letter stems with word subscripts such as t_gate); real raw math still counts. Replayed on the 68 live articles: 22 remain flagged, all real. 3.11.0 LEGAL-URL-1 + LEGAL-VERSIONS-1 (2026-10-06, pillar research): qnfo.org/legal/license, the address the license names for itself, answered 404 and now redirects to legal.qnfo.org; legal.qnfo.org serves the newest QNFO-ULA version posted on QNFO/license (v2.1 adds Software Terms) and each version at /v<x.y>; footer labels no longer hard-code v2.0. */
// UTM-CLICK-LEDGER-1 (3.10.0, 2026-10-06, transformation lever T7.9, pillar reach): a GET for an HTML page that carries
// utm_source is counted into qnfo-graph utm_clicks (day, host, path, source, medium, campaign, bot/human, country; no cookie,
// no IP), so a post or digest joins to the visits it caused; qnfo-fleet-dashboard reads it into reach_signals source utm.
// MATH-RESIDUE-2 (3.9.8, 2026-10-06, pillar reach, agent_issues 2023; guard paper_render_defect_pages 68 > 3): the first
// 06:00 sweep after MATH-TYPESET-1 counted 68 pages whose text still carried >= 3 untypeset sub/superscript tokens. The guard
// and its definition are unchanged; the typesetter now reaches more of them. pseudoMath() accepts a ")" or "]" base for ^ and
// _ ("(1-p)^N"), a numeric coefficient ("3p_Z", "2d^2"), a function with a script ("log_2(0.1)"), "pi^", formula tokens
// set upright ("Si3N4", "Ca9(PO4)6", "AdS3"), hbar, and a single-letter subscript followed by a Greek letter; a run that
// fails validation is split at words whose brackets do not balance and retried, then word by word; a lone "*" next to a
// relation or brace stays an emphasis marker; pmScriptsOk counts a command's brace argument (no double subscript slips
// through). Corpus check (scripts/math-corpus-check.mjs, 469 pages): defect pages 68 -> 48, residue tokens 1,727 -> 1,009,
// typeset runs 10,792 -> 11,632, KaTeX parse failures 0 -> 0, prose words lost 0. The 48 left are mostly source damage
// (PDF-extraction text such as "x \u2080 + v \u2080 t"); new papers are the generator's to fix (MATH-LATEX-2, #1891).
// MATH-DELIM-1 (3.8.2, 2026-10-02, pillar reach): a full-corpus sweep of the 450 paper pages found three renderer root
// causes. (1) Two adjacent inline formulas ("$\\mathbb{R}$$^3$") formed "$$", which opened display math and swallowed
// the rest of the paper (raw tables, headings and bold in 32 papers). (2) Currency was paired as math ("$1,032 ...
// $5.61"); a formula that starts with a digit may not close right before another digit ("$1,032 ... $5"; spaces inside stay legal), and a
// literal dollar is emitted as <span class="usd">$</span>, which MathJax cannot pair. (3) 219 papers use "#" for
// section headings (and TABLE-SEP-1: short GFM delimiter rows now make tables; DOI-HYGIENE-1: only real DOIs are shown); their headings are shifted one level down so sections are h2 and appear in the contents.
// LIVING-PAPERS-1 (3.8.0, 2026-10-02, pillar reach): papers.qnfo.org index and paper pages rebuilt as living papers in the
// QNFO design system shared with ask.qwav.tech; GET /api/paper-context/<slug>. See the LIVING-PAPERS-1 block.
// WORK-WITH-ME-1 (3.7.27, 2026-10-02, pillar reach): qnfo.org/work-with-me, the offers and a tagged mailto per offer;
// linked from the home page, /about, the sitemap and llms.txt. /contact redirects to it.
// ORG-LABEL-1 (2026-10-01, docs/STRATEGY.md s2.1): there is no legal entity and the work is one researcher with an
// AI-assisted pipeline, so "Research Foundation" and "research collective" overclaim. Labels only; the positioning copy
// waits for the owner's approval in the Identity doc. ABOUT-GA-1: /about was the one gateway page without the GA4 tag.
var INDEXNOW_KEY="9c4e7a1f38b2d6504e7c9a1b38f2d650";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __defProp222 = Object.defineProperty;
var __name222 = /* @__PURE__ */ __name22((target, value) => __defProp222(target, "name", { value, configurable: true }), "__name");
var __defProp2222 = Object.defineProperty;
var __name2222 = /* @__PURE__ */ __name222((target, value) => __defProp2222(target, "name", { value, configurable: true }), "__name");
var __defProp22222 = Object.defineProperty;
var __name22222 = /* @__PURE__ */ __name2222((target, value) => __defProp22222(target, "name", { value, configurable: true }), "__name");
var __defProp222222 = Object.defineProperty;
var __name222222 = /* @__PURE__ */ __name22222((target, value) => __defProp222222(target, "name", { value, configurable: true }), "__name");
var __defProp2222222 = Object.defineProperty;
var __name2222222 = /* @__PURE__ */ __name222222((target, value) => __defProp2222222(target, "name", { value, configurable: true }), "__name");
var __defProp22222222 = Object.defineProperty;
var __name22222222 = /* @__PURE__ */ __name2222222((target, value) => __defProp22222222(target, "name", { value, configurable: true }), "__name");
var __defProp222222222 = Object.defineProperty;
var __name222222222 = /* @__PURE__ */ __name22222222((target, value) => __defProp222222222(target, "name", { value, configurable: true }), "__name");
var __defProp2222222222 = Object.defineProperty;
var __name2222222222 = /* @__PURE__ */ __name222222222((target, value) => __defProp2222222222(target, "name", { value, configurable: true }), "__name");
var COMMON_CSS = `:root{--paper:#faf7f2;--surface:#f2eee6;--ink:#1b1915;--muted:#8a8376;--border:#e2dcd0;--accent:#24315e;--accent-soft:#eceef6;--live:#2f6d4f;--blue:var(--accent);--blue-dark:#1a2547;--blue-light:#d8dcef;--blue-subtle:var(--accent-soft);--text:var(--ink);--text-muted:var(--muted);--bg:var(--paper);--radius:10px;--radius-lg:14px}
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Public+Sans:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box}
body{font-family:'Public Sans',system-ui,sans-serif;margin:0;padding:0;color:var(--ink);background:var(--paper);line-height:1.7;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:'Fraunces',Georgia,serif;color:var(--ink);line-height:1.25;letter-spacing:-.01em}
a{color:var(--accent)}
.top-nav{display:flex;align-items:center;gap:1.3rem;padding:1rem 1.6rem;background:rgba(250,247,242,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;flex-wrap:wrap}
.top-nav a{color:var(--muted);text-decoration:none;font-weight:500;font-size:.86rem;padding:.32rem .55rem;border-radius:6px;transition:all .15s}
.top-nav a:hover{color:var(--accent);background:var(--accent-soft)}
.top-nav .brand{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:1.18rem;color:var(--ink);text-decoration:none;margin-right:auto;padding:0;display:inline-flex;align-items:center;gap:.5rem}
.qmark{display:inline-flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;border-radius:6px;background:var(--accent);color:var(--paper);font-family:'Fraunces',Georgia,serif;font-size:.95rem;font-weight:600}
.qwav-badge{background:var(--ink)!important;color:var(--paper)!important;font-weight:600!important;font-size:.78rem!important;padding:.3rem .75rem!important;border-radius:999px!important;letter-spacing:.04em}
.container{max-width:880px;margin:0 auto;padding:1.5rem 1.6rem}
h1{font-family:'Fraunces',Georgia,serif;font-size:2rem;border-bottom:1px solid var(--border);padding-bottom:.7rem;margin-bottom:1.2rem;font-weight:600}
h2{font-family:'Fraunces',Georgia,serif;font-size:1.45rem;margin-top:2.4rem;margin-bottom:.8rem;font-weight:600}
h3{font-family:'Fraunces',Georgia,serif;font-size:1.12rem;margin-top:1.5rem;margin-bottom:.5rem;font-weight:500}
.paper-list{list-style:none;padding:0}
.paper-item{padding:1.15rem 0;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:.3rem}
.paper-item a.paper-title{color:var(--accent);text-decoration:none;font-family:'Fraunces',Georgia,serif;font-size:1.12rem;font-weight:500}
.paper-item a.paper-title:hover{text-decoration:underline}
.paper-meta{color:var(--muted);font-size:.8rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.paper-abstract{color:var(--muted);font-size:.9rem;line-height:1.65;margin-top:.3rem}
.paper-category{display:inline-block;background:var(--accent-soft);color:var(--accent);padding:.12rem .6rem;border-radius:999px;font-size:.72rem;font-weight:500}
.about-section{max-width:760px;margin:2.6rem auto 1rem;padding:0 1.6rem}
.about-section h2{font-size:1.5rem;font-weight:600;margin-bottom:.6rem}
.about-section p{color:var(--muted);font-size:.98rem;line-height:1.75;margin-bottom:1rem}
.hub-hero{text-align:center;padding:3.8rem 1.5rem 2.6rem;background:var(--paper);border-bottom:1px solid var(--border)}
.hub-hero h1{font-size:2.6rem;border:none;margin:0 auto .7rem;max-width:660px;font-weight:600}
.hub-hero .subtitle{font-size:1.1rem;color:var(--muted);max-width:640px;margin:0 auto 1.6rem;line-height:1.7}
.hub-hero .stats-bar{display:flex;gap:2.4rem;justify-content:center;margin-top:1.2rem;flex-wrap:wrap}
.stat-item{text-align:center}
.stat-number{font-family:'Fraunces',Georgia,serif;font-size:1.75rem;font-weight:600;color:var(--ink);display:block}
.stat-label{font-size:.74rem;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
.hub-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin:1.6rem 0}
.hub-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem 1.3rem;text-decoration:none;display:block;transition:all .15s}
.hub-card:hover{border-color:var(--accent);transform:translateY(-1px)}
.hub-card h3{margin:0 0 .35rem;font-size:1.08rem;color:var(--ink)}
.hub-card p{margin:0;font-size:.86rem;color:var(--muted);line-height:1.55}
.site-footer{background:var(--surface);border-top:1px solid var(--border);padding:1.6rem 1.6rem 2.2rem;margin-top:3rem}
.footer-links{display:flex;gap:1.4rem;justify-content:center;flex-wrap:wrap;font-size:.85rem}
.site-footer a{color:var(--muted);text-decoration:none}
.site-footer a:hover{color:var(--accent)}
.skip-link{position:absolute;left:-9999px}
.skip-link:focus{position:static;left:0;padding:.5rem 1rem;background:var(--accent);color:var(--paper)}
.filter-bar{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}
.filter-btn{padding:.35rem .9rem;border:1.5px solid var(--border);border-radius:999px;background:transparent;color:var(--muted);cursor:pointer;font-size:.8rem;font-weight:500;font-family:'Public Sans',sans-serif}
.filter-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.search-box{width:100%;max-width:420px;padding:.6rem .9rem;border:1.5px solid var(--border);border-radius:var(--radius);font:inherit;font-size:.95rem;background:#fff;color:var(--ink);outline:none;margin-bottom:.6rem}
.search-box:focus{border-color:var(--accent)}
@media(max-width:720px){.hub-hero h1{font-size:2rem}.top-nav{gap:.8rem}.footer-links{gap:.9rem}}
/* gateway-specific */
.hub-section-header{font-family:'Fraunces',Georgia,serif;font-size:1.45rem;font-weight:600;margin:2.2rem 0 .8rem;letter-spacing:-.01em}
.latest-papers{font-family:'Fraunces',Georgia,serif;font-size:1.45rem;font-weight:600;margin:2.2rem 0 .8rem}
.card-icon{font-size:1.3rem;margin-bottom:.4rem}
.date{color:var(--muted);font-size:.78rem}
.paper-body{max-width:860px;margin:0 auto;padding:1.6rem 1.75rem;color:var(--ink);font-size:.98rem;line-height:1.75}.paper-body .back-link{display:inline-block;margin-bottom:1.1rem}@media(max-width:640px){.paper-body{padding:1.1rem 1.05rem}}
.paper-body h1,.paper-body h2,.paper-body h3{font-family:'Fraunces',Georgia,serif;color:var(--ink);line-height:1.3}
.paper-body h1{font-size:1.6rem;border-bottom:1px solid var(--border);padding-bottom:.5rem}
.paper-body h2{font-size:1.3rem;margin-top:1.8rem}
.paper-body h3{font-size:1.12rem;margin-top:1.4rem}
.paper-body p{margin:.8rem 0}
.paper-body ul,.paper-body ol{padding-left:1.4rem}
.paper-body li{margin:.35rem 0}
.paper-body code{font-family:ui-monospace,Consolas,monospace;font-size:.86em;background:var(--surface);padding:.12rem .35rem;border-radius:4px}
.paper-body pre{background:var(--ink);color:var(--paper);padding:.9rem 1rem;border-radius:var(--radius);overflow-x:auto;font-size:.85rem;line-height:1.55}
.paper-body pre code{background:none;color:inherit;padding:0}
.paper-body blockquote{border-left:3px solid var(--border);margin:1rem 0;padding:.2rem 0 .2rem 1.1rem;color:var(--muted)}
.paper-body table{border-collapse:collapse;margin:1rem 0;width:100%}
.paper-body th,.paper-body td{border:1px solid var(--border);padding:.5rem .7rem;text-align:left;font-size:.9rem}
.paper-body th{background:var(--surface);font-weight:600}
.paper-body a{color:var(--accent)}
.back-link{display:inline-block;color:var(--muted);text-decoration:none;font-size:.85rem;margin-bottom:1rem}
.back-link:hover{color:var(--accent)}
.rendered-md{max-width:820px}
.rendered-md h1{font-size:1.7rem;border-bottom:1px solid var(--border);padding-bottom:.5rem}
`;
// ---- QDS-1:BEGIN (2026-10-02, owner directive: one design system across every QNFO surface; pillars reach + core) ----
// The QNFO design system (QDS). Tokens, type and components live in ONE stylesheet served from here at
// https://qnfo.org/qds.css (any gateway host) and linked by every QNFO, QWAV and q08 surface, with qds.js for the theme
// toggle, sticky header and the article table of contents. Pages declare <html data-brand="qnfo|qwav|q08">. Reading
// type is Newsreader, interface type Familjen Grotesk; light and dark themes follow the OS unless the visitor picks one.
// Replaces the 2026-08-31 paper-and-ink system (qnfo-web-unified/README.md, STRATEGY 2.5), owner decision 2026-10-02.
var QDS_VERSION = "1.0.0";
var QDS_ORIGIN = "https://qnfo.org";
var QDS_CSS = `/* QDS: the QNFO design system. One stylesheet for every QNFO, QWAV and q08 surface.
   Served by qnfo-gateway at https://qnfo.org/qds.css (versioned with ?v=). Pages set
   <html data-brand="qnfo|qwav|q08"> and optionally data-density="compact" (operator consoles).
   Reading: Newsreader. Interface: Familjen Grotesk. Light and dark themes; data-theme overrides the OS. */
:root{
  --q-paper:#F5F7FB;--q-surface:#FFFFFF;--q-ink:#182042;--q-ink-2:#2F3A63;--q-muted:#58618A;--q-rule:#D9DEEC;--q-wash:#E9EDF7;
  --q-accent:#0E7C70;--q-accent-ink:#FFFFFF;--q-accent-wash:#DDF1EE;
  --q-cite:#8A5300;--q-cite-wash:#FCEFD6;--q-ok:#1D7A46;--q-warn:#9A5B00;--q-bad:#B3261E;--q-bad-wash:#FBE9E7;
  --q-serif:"Newsreader",Georgia,"Times New Roman",serif;--q-sans:"Familjen Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif;
  --q-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --q-fs-xs:.8125rem;--q-fs-sm:.875rem;--q-fs-base:1rem;--q-fs-read:1.125rem;--q-fs-lg:1.3125rem;--q-fs-xl:1.75rem;--q-fs-2xl:2.375rem;--q-fs-3xl:clamp(2.25rem,4.4vw,3.5rem);
  --q-r-sm:6px;--q-r:10px;--q-r-lg:14px;--q-gutter:24px;--q-wrap:1200px;--q-measure:68ch;
  --q-shadow:0 1px 2px rgba(24,32,66,.06),0 8px 24px -12px rgba(24,32,66,.18);
  color-scheme:light;
}
[data-brand="qwav"]{--q-accent:#3B4CCA;--q-accent-wash:#E3E6FB}
[data-brand="q08"]{--q-accent:#B4472A;--q-accent-wash:#FBE7E0}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --q-paper:#121731;--q-surface:#1A2142;--q-ink:#E7E9F4;--q-ink-2:#C7CCE4;--q-muted:#9AA3C6;--q-rule:#2C3561;--q-wash:#212A50;
    --q-accent:#5FD3C4;--q-accent-ink:#0D1A1E;--q-accent-wash:#163A42;--q-cite:#F2B544;--q-cite-wash:#3A2F1A;--q-ok:#6FD39A;--q-warn:#F2B544;--q-bad:#FF8A80;--q-bad-wash:#3B1E25;
    --q-shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px -12px rgba(0,0,0,.6);color-scheme:dark}
  :root:not([data-theme="light"])[data-brand="qwav"]{--q-accent:#9AA6FF;--q-accent-wash:#262E66}
  :root:not([data-theme="light"])[data-brand="q08"]{--q-accent:#F2906A;--q-accent-wash:#43261D}
}
:root[data-theme="dark"]{
  --q-paper:#121731;--q-surface:#1A2142;--q-ink:#E7E9F4;--q-ink-2:#C7CCE4;--q-muted:#9AA3C6;--q-rule:#2C3561;--q-wash:#212A50;
  --q-accent:#5FD3C4;--q-accent-ink:#0D1A1E;--q-accent-wash:#163A42;--q-cite:#F2B544;--q-cite-wash:#3A2F1A;--q-ok:#6FD39A;--q-warn:#F2B544;--q-bad:#FF8A80;--q-bad-wash:#3B1E25;
  --q-shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px -12px rgba(0,0,0,.6);color-scheme:dark}
:root[data-theme="dark"][data-brand="qwav"]{--q-accent:#9AA6FF;--q-accent-wash:#262E66}
:root[data-theme="dark"][data-brand="q08"]{--q-accent:#F2906A;--q-accent-wash:#43261D}

/* base */
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-padding-top:80px}
body{margin:0;background:var(--q-paper);color:var(--q-ink);font:400 var(--q-fs-base)/1.55 var(--q-sans);font-feature-settings:"kern" 1;-webkit-font-smoothing:antialiased}
img,svg,video{max-width:100%;height:auto}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{color:var(--q-accent)}
:focus-visible{outline:2px solid var(--q-accent);outline-offset:2px;border-radius:4px}
::selection{background:var(--q-accent-wash)}
h1,h2,h3,h4{color:var(--q-ink);margin:0}
p{margin:0 0 1em}
hr{border:0;border-top:1px solid var(--q-rule);margin:2rem 0}
button{font:inherit;color:inherit}
.q-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.q-skip{position:absolute;left:12px;top:-60px;background:var(--q-ink);color:var(--q-paper);padding:8px 14px;border-radius:var(--q-r-sm);z-index:100;text-decoration:none}
.q-skip:focus{top:12px;color:var(--q-paper)}
.q-wrap{max-width:var(--q-wrap);margin:0 auto;padding:0 var(--q-gutter)}
.q-measure{max-width:var(--q-measure)}

/* family bar: one line linking every QNFO surface */
.q-family{border-bottom:1px solid var(--q-rule);font-size:var(--q-fs-xs);color:var(--q-muted)}
.q-family .q-wrap{display:flex;gap:18px;align-items:center;min-height:32px;overflow-x:auto;scrollbar-width:none;white-space:nowrap}
.q-family .q-wrap::-webkit-scrollbar{display:none}
.q-family a{text-decoration:none}
.q-family a[aria-current]{color:var(--q-ink);font-weight:600}
.q-family .q-family-label{margin-right:auto}

/* header */
.q-top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--q-paper) 92%,transparent);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid transparent}
.q-top.is-stuck{border-bottom-color:var(--q-rule)}
.q-top .q-wrap{display:flex;align-items:center;gap:24px;min-height:64px}
.q-brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;font:600 1.0625rem/1 var(--q-sans);letter-spacing:-.01em;white-space:nowrap}
.q-brand svg{width:26px;height:26px;flex:none}
.q-brand small{font:500 var(--q-fs-xs)/1 var(--q-sans);color:var(--q-muted);letter-spacing:0}
.q-nav{display:flex;gap:4px;margin-left:auto;align-items:center}
.q-nav a{font-size:var(--q-fs-sm);color:var(--q-muted);text-decoration:none;padding:8px 10px;border-radius:var(--q-r-sm)}
.q-nav a:hover{color:var(--q-ink);background:var(--q-wash)}
.q-nav a[aria-current="page"]{color:var(--q-ink);font-weight:600}
.q-theme{flex:none;width:36px;height:36px;border-radius:999px;border:1px solid var(--q-rule);background:none;display:grid;place-items:center;color:var(--q-muted);cursor:pointer}
.q-theme:hover{color:var(--q-ink);border-color:var(--q-muted)}
.q-theme svg{width:16px;height:16px}
.q-menu{display:none}
@media (max-width:820px){
  .q-top .q-wrap{gap:12px}
  .q-menu{display:block;margin-left:auto}
  .q-menu summary{list-style:none;cursor:pointer;width:36px;height:36px;border-radius:999px;border:1px solid var(--q-rule);display:grid;place-items:center;color:var(--q-muted)}
  .q-menu summary::-webkit-details-marker{display:none}
  .q-menu[open] .q-nav{display:flex}
  .q-nav{display:none;position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:stretch;gap:0;background:var(--q-surface);border-bottom:1px solid var(--q-rule);padding:8px var(--q-gutter) 16px;box-shadow:var(--q-shadow)}
  .q-nav a{padding:12px 6px;font-size:var(--q-fs-base);border-bottom:1px solid var(--q-rule);border-radius:0}
  .q-theme{margin-left:0}
}

/* type */
.q-eyebrow{font:500 var(--q-fs-sm)/1.3 var(--q-sans);color:var(--q-accent);margin:0 0 12px}
.q-display{font:500 var(--q-fs-3xl)/1.04 var(--q-serif);letter-spacing:-.022em;margin:0 0 20px;text-wrap:balance}
.q-h1{font:500 var(--q-fs-2xl)/1.12 var(--q-serif);letter-spacing:-.018em;margin:0 0 16px;text-wrap:balance}
.q-h2{font:500 var(--q-fs-xl)/1.2 var(--q-serif);letter-spacing:-.012em;margin:0 0 14px}
.q-h3{font:600 var(--q-fs-base)/1.35 var(--q-sans);margin:0 0 10px}
.q-lede{font:400 1.25rem/1.55 var(--q-serif);color:var(--q-ink-2);max-width:58ch;margin:0 0 24px}
.q-meta{font-size:var(--q-fs-sm);color:var(--q-muted)}
.q-meta a{color:var(--q-muted)}
.q-meta a:hover{color:var(--q-accent)}
.q-small{font-size:var(--q-fs-xs);color:var(--q-muted)}
.q-num{font-variant-numeric:tabular-nums}

/* sections */
.q-section{padding:56px 0}
.q-section+.q-section{border-top:1px solid var(--q-rule)}
.q-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.q-section-head .q-h2{margin:0}
.q-section-head a{font-size:var(--q-fs-sm);color:var(--q-muted)}
.q-hero{padding:64px 0 48px}
.q-hero-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:56px;align-items:center}
@media (max-width:900px){.q-hero-grid{grid-template-columns:minmax(0,1fr);gap:32px}.q-hero{padding:40px 0 32px}}
.q-grid{display:grid;gap:24px}
.q-grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.q-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:900px){.q-grid-3{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.q-grid-2,.q-grid-3{grid-template-columns:minmax(0,1fr)}}

/* controls */
.q-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 18px;border-radius:var(--q-r);border:1px solid var(--q-ink);background:var(--q-ink);color:var(--q-paper);font:600 var(--q-fs-sm)/1 var(--q-sans);text-decoration:none;cursor:pointer;white-space:nowrap}
.q-btn:hover{background:var(--q-ink-2);border-color:var(--q-ink-2);color:var(--q-paper)}
.q-btn:disabled{opacity:.45;cursor:default}
.q-btn-accent{background:var(--q-accent);border-color:var(--q-accent);color:var(--q-accent-ink)}
.q-btn-accent:hover{filter:brightness(1.08);background:var(--q-accent);border-color:var(--q-accent);color:var(--q-accent-ink)}
.q-btn-ghost{background:transparent;color:var(--q-ink);border-color:var(--q-rule)}
.q-btn-ghost:hover{background:var(--q-wash);color:var(--q-ink);border-color:var(--q-muted)}
.q-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.q-input{width:100%;min-height:44px;padding:10px 14px;border-radius:var(--q-r);border:1.5px solid var(--q-rule);background:var(--q-surface);color:var(--q-ink);font:400 var(--q-fs-base)/1.4 var(--q-sans)}
.q-input:focus{outline:none;border-color:var(--q-accent)}
.q-input::placeholder{color:var(--q-muted)}
.q-field{display:flex;gap:8px;align-items:stretch;background:var(--q-surface);border:1.5px solid var(--q-rule);border-radius:var(--q-r-lg);padding:6px 6px 6px 16px}
.q-field:focus-within{border-color:var(--q-accent)}
.q-field input,.q-field textarea{flex:1;border:0;background:none;color:var(--q-ink);font:400 1.125rem/1.4 var(--q-serif);padding:8px 0;outline:none;min-width:0}
.q-chips{display:flex;flex-wrap:wrap;gap:8px}
.q-chip{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--q-rule);font-size:var(--q-fs-sm);color:var(--q-ink-2);text-decoration:none;background:var(--q-surface)}
.q-chip:hover{border-color:var(--q-accent);color:var(--q-ink)}
.q-chip[aria-current="true"],.q-chip.is-active{background:var(--q-ink);border-color:var(--q-ink);color:var(--q-paper)}
.q-badge{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;background:var(--q-accent-wash);color:var(--q-accent);font:600 var(--q-fs-xs)/1.5 var(--q-sans)}
.q-badge-muted{background:var(--q-wash);color:var(--q-muted)}

/* lists of works: the main reading index */
.q-list{list-style:none;margin:0;padding:0}
.q-item{padding:20px 0;border-bottom:1px solid var(--q-rule);display:grid;gap:6px}
.q-item:first-child{padding-top:4px}
.q-item-title{font:500 1.25rem/1.32 var(--q-serif);text-decoration:none;color:var(--q-ink);text-wrap:pretty}
.q-item-title:hover{color:var(--q-accent)}
.q-item-meta{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:var(--q-fs-sm);color:var(--q-muted);align-items:center}
.q-item-meta a{color:var(--q-muted)}
.q-item-text{font:400 1rem/1.55 var(--q-serif);color:var(--q-ink-2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;max-width:var(--q-measure)}
.q-compact .q-item{padding:12px 0}
.q-compact .q-item-title{font-size:1.0625rem}

/* panels and links-as-cards (used sparingly) */
.q-panel{background:var(--q-surface);border:1px solid var(--q-rule);border-radius:var(--q-r-lg);padding:24px}
.q-link-card{display:flex;flex-direction:column;gap:8px;padding:20px 0;border-top:1px solid var(--q-ink);text-decoration:none}
.q-link-card h3{font:500 var(--q-fs-lg)/1.25 var(--q-serif)}
.q-link-card p{color:var(--q-muted);margin:0;font-size:var(--q-fs-sm)}
.q-link-card:hover h3{color:var(--q-accent)}
.q-note{border-left:3px solid var(--q-accent);background:var(--q-surface);padding:14px 18px;border-radius:0 var(--q-r) var(--q-r) 0;font-size:var(--q-fs-sm);color:var(--q-ink-2)}
.q-note strong{color:var(--q-ink)}
.q-note-warn{border-left-color:var(--q-warn)}
.q-note-bad{border-left-color:var(--q-bad);background:var(--q-bad-wash)}

/* data tables */
.q-table-wrap{overflow-x:auto;margin:1.25em 0;border:1px solid var(--q-rule);border-radius:var(--q-r)}
.q-table{border-collapse:collapse;width:100%;font:400 var(--q-fs-sm)/1.45 var(--q-sans)}
.q-table th,.q-table td{padding:10px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--q-rule)}
.q-table thead th{background:var(--q-wash);font-weight:600;color:var(--q-ink)}
.q-table tr:last-child td{border-bottom:0}
.q-table td.q-num,.q-table th.q-num{text-align:right}

/* long-form reading: papers, legal, about, threads */
.q-prose{font:400 var(--q-fs-read)/1.68 var(--q-serif);color:var(--q-ink);max-width:var(--q-measure);overflow-wrap:break-word;hyphens:auto}
.q-prose>*:first-child{margin-top:0}
.q-prose h1{font:500 var(--q-fs-2xl)/1.15 var(--q-serif);letter-spacing:-.015em;margin:2.2em 0 .5em}
.q-prose h2{font:500 1.625rem/1.22 var(--q-serif);letter-spacing:-.01em;margin:2em 0 .55em;padding-top:.2em}
.q-prose h3{font:600 1.1875rem/1.3 var(--q-serif);margin:1.7em 0 .45em}
.q-prose h4{font:600 var(--q-fs-base)/1.35 var(--q-sans);margin:1.5em 0 .4em;color:var(--q-ink-2)}
.q-prose p{margin:0 0 1.05em}
.q-prose ul,.q-prose ol{padding-left:1.4em;margin:0 0 1.1em}
.q-prose li{margin:.3em 0}
.q-prose li>ul,.q-prose li>ol{margin:.3em 0}
.q-prose blockquote{margin:1.3em 0;padding:.2em 0 .2em 1.2em;border-left:3px solid var(--q-rule);color:var(--q-ink-2);font-style:italic}
.q-prose code{font:500 .86em/1.4 var(--q-mono);background:var(--q-wash);padding:.12em .38em;border-radius:5px}
.q-prose pre{font:400 .85rem/1.6 var(--q-mono);background:var(--q-surface);border:1px solid var(--q-rule);border-radius:var(--q-r);padding:14px 16px;overflow-x:auto;hyphens:none}
.q-prose :not(pre)>code{overflow-wrap:anywhere}
.q-prose a{overflow-wrap:anywhere}
.q-prose pre code{background:none;padding:0;font-size:inherit}
.q-prose table{border-collapse:collapse;width:100%;font:400 var(--q-fs-sm)/1.45 var(--q-sans);margin:1.3em 0;display:block;overflow-x:auto}
.q-prose th,.q-prose td{padding:8px 12px;border-bottom:1px solid var(--q-rule);text-align:left;vertical-align:top}
.q-prose th{background:var(--q-wash);font-weight:600}
.q-prose hr{margin:2.4em 0}
.q-prose a{color:var(--q-ink);text-decoration-color:var(--q-accent)}
.q-prose a:hover{color:var(--q-accent)}
.q-prose img,.q-prose figure{margin:1.6em 0}
.q-prose figcaption{font:400 var(--q-fs-sm)/1.45 var(--q-sans);color:var(--q-muted);margin-top:8px}
.q-prose mjx-container[display="true"],.q-prose .katex-display{overflow-x:auto;overflow-y:hidden;padding:4px 0;margin:1.2em 0!important}
.q-prose strong{font-weight:600}
.q-prose sup a,.q-prose .footnote-ref a{text-decoration:none;color:var(--q-cite)}
.q-cite{display:inline-grid;place-items:center;min-width:1.45em;height:1.45em;padding:0 .3em;margin:0 1px;border-radius:5px;background:var(--q-cite-wash);color:var(--q-cite);font:600 .68em/1 var(--q-sans);vertical-align:.32em;text-decoration:none}

/* article layout: body + aside (contents, record) */
.q-article{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:64px;align-items:start;padding:40px 0 72px}
.q-article-aside{position:sticky;top:88px;font-size:var(--q-fs-sm);display:grid;gap:28px;max-height:calc(100vh - 110px);overflow:auto}
.q-article-aside h2{font:600 var(--q-fs-sm)/1.3 var(--q-sans);color:var(--q-ink);margin:0 0 10px}
.q-toc{list-style:none;margin:0;padding:0;border-left:1px solid var(--q-rule)}
.q-toc a{display:block;padding:4px 0 4px 12px;margin-left:-1px;border-left:2px solid transparent;color:var(--q-muted);text-decoration:none;line-height:1.35}
.q-toc a:hover{color:var(--q-ink)}
.q-toc a.is-active{color:var(--q-ink);border-left-color:var(--q-accent)}
.q-toc .q-toc-3 a{padding-left:24px;font-size:var(--q-fs-xs)}
.q-record{display:grid;gap:8px}
.q-record div{display:grid;gap:2px}
.q-record dt{font-size:var(--q-fs-xs);color:var(--q-muted)}
.q-record dd{margin:0;overflow-wrap:anywhere}
@media (max-width:1020px){.q-article{grid-template-columns:minmax(0,1fr);gap:28px}.q-article-aside{position:static;max-height:none}.q-toc-wrap{display:none}}
.q-article-head{max-width:var(--q-measure);margin-bottom:32px}
.q-article-head .q-h1{font-size:clamp(1.85rem,3.4vw,2.6rem)}
.q-abstract{font:400 1.1875rem/1.62 var(--q-serif);color:var(--q-ink-2);border-top:1px solid var(--q-rule);border-bottom:1px solid var(--q-rule);padding:20px 0;margin:24px 0 32px;max-width:var(--q-measure)}
.q-abstract h2{font:600 var(--q-fs-sm)/1.3 var(--q-sans);color:var(--q-muted);margin:0 0 8px}

/* subscribe strip */
.q-subscribe{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px;align-items:center;padding:36px 0;border-top:1px solid var(--q-rule)}
.q-subscribe form{display:flex;gap:8px}
.q-subscribe .q-msg{grid-column:2;font-size:var(--q-fs-sm);min-height:1.4em;margin:0}
.q-msg.ok{color:var(--q-ok)}.q-msg.err{color:var(--q-bad)}
@media (max-width:760px){.q-subscribe{grid-template-columns:minmax(0,1fr);gap:16px}.q-subscribe .q-msg{grid-column:1}.q-subscribe form{flex-direction:column}}

/* footer */
.q-foot{border-top:1px solid var(--q-rule);padding:40px 0 48px;font-size:var(--q-fs-sm);color:var(--q-muted);margin-top:24px}
.q-foot-grid{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:32px}
.q-foot h2{font:600 var(--q-fs-sm)/1.3 var(--q-sans);color:var(--q-ink);margin:0 0 10px}
.q-foot ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.q-foot a{color:var(--q-muted);text-decoration:none}
.q-foot a:hover{color:var(--q-ink);text-decoration:underline}
.q-foot-base{margin-top:32px;padding-top:16px;border-top:1px solid var(--q-rule);display:flex;flex-wrap:wrap;gap:8px 20px;font-size:var(--q-fs-xs)}
@media (max-width:760px){.q-foot-grid{grid-template-columns:1fr 1fr}.q-foot-grid>:first-child{grid-column:1/-1}}

/* operator density (fleet.qnfo.org) */
[data-density="compact"] body{font-size:.9375rem}
[data-density="compact"] .q-top .q-wrap{min-height:52px}
[data-density="compact"] .q-section{padding:28px 0}
[data-density="compact"] .q-panel{padding:16px}

/* motion and print */
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media print{
  .q-family,.q-top,.q-foot,.q-article-aside,.q-subscribe,.q-skip,.q-no-print{display:none!important}
  body{background:#fff;color:#000}
  .q-article{display:block;padding:0}
  .q-prose{max-width:none;font-size:11pt}
  .q-prose a{color:#000}
  .q-prose a[href^="http"]::after{content:" (" attr(href) ")";font-size:9pt;color:#444}
}
`;
var QDS_JS = `/* QDS behaviour: theme toggle, header state, table of contents, copy buttons. No dependencies; every feature is optional. */
(function () {
  "use strict";
  var root = document.documentElement;
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var saved = store("qnfo-theme");
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  function isDark() {
    var t = root.getAttribute("data-theme");
    return t ? t === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function wire() {
    document.querySelectorAll("[data-q-theme]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(isDark()));
      b.addEventListener("click", function () {
        var next = isDark() ? "light" : "dark";
        root.setAttribute("data-theme", next);
        store("qnfo-theme", next);
        document.querySelectorAll("[data-q-theme]").forEach(function (x) { x.setAttribute("aria-pressed", String(next === "dark")); });
        try { window.dispatchEvent(new CustomEvent("qnfo-theme", { detail: next })); } catch (e) {}
      });
    });
    var top = document.querySelector(".q-top");
    if (top) {
      var onScroll = function () { top.classList.toggle("is-stuck", window.scrollY > 4); };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    // Close the mobile menu after a choice.
    document.querySelectorAll(".q-menu a").forEach(function (a) { a.addEventListener("click", function () { var d = a.closest("details"); if (d) d.removeAttribute("open"); }); });
    // Table of contents: <ol class="q-toc" data-q-toc=".q-prose"> is filled from that article's h2/h3.
    document.querySelectorAll("[data-q-toc]").forEach(function (toc) {
      var src = document.querySelector(toc.getAttribute("data-q-toc"));
      if (!src) return;
      var hs = Array.prototype.slice.call(src.querySelectorAll("h2, h3"));
      if (hs.length < 3) { var wrap = toc.closest(".q-toc-wrap"); if (wrap) wrap.hidden = true; return; }
      var used = {};
      hs.forEach(function (h) {
        if (!h.id) {
          var base = (h.textContent || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";
          var id = base, n = 2;
          while (used[id] || document.getElementById(id)) id = base + "-" + n++;
          h.id = id;
        }
        used[h.id] = 1;
        var li = document.createElement("li");
        if (h.tagName === "H3") li.className = "q-toc-3";
        var a = document.createElement("a");
        a.href = "#" + h.id;
        a.textContent = (h.textContent || "").replace(/\\s+/g, " ").trim();
        li.appendChild(a);
        toc.appendChild(li);
      });
      if ("IntersectionObserver" in window) {
        var links = toc.querySelectorAll("a");
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            links.forEach(function (l) { l.classList.toggle("is-active", l.getAttribute("href") === "#" + e.target.id); });
          });
        }, { rootMargin: "-80px 0px -70% 0px" });
        hs.forEach(function (h) { io.observe(h); });
      }
    });
    // Copy buttons: <button data-q-copy="text"> or data-q-copy-from="#id".
    document.querySelectorAll("[data-q-copy],[data-q-copy-from]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-q-copy");
        if (t === null) { var el = document.querySelector(b.getAttribute("data-q-copy-from")); t = el ? el.textContent : ""; }
        var label = b.textContent;
        var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = label; }, 1600); };
        if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {});
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
`;
var QDS_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap">';
var QDS_GA = '<!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script>';
var QDS_MATHJAX = '<script>window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]],displayMath:[["$$","$$"],["\\\\[","\\\\]"]],processEscapes:true,macros:{lambdabar:"{\\\\bar{\\\\lambda}}",parr:"\\\\mathbin{\\\\unicode{x214B}}"}},svg:{scale:1.05,fontCache:"global"},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"],enableMenu:false}};function __mq(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise().catch(function(){})}}if(document.readyState==="complete"){setTimeout(__mq,150)}else{window.addEventListener("load",function(){setTimeout(__mq,150)})}<\/script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js" id="MathJax-script" defer onerror="this.onerror=null;var s=document.createElement(&quot;script&quot;);s.src=&quot;https://unpkg.com/mathjax@3/es5/tex-svg-full.js&quot;;document.head.appendChild(s);"><\/script>';
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
    (o.canonical ? '<meta property="og:url" content="' + qdsAttr(o.canonical) + '">' : "") + '<meta name="twitter:card" content="summary"><meta name="twitter:title" content="' + t + '"><meta name="twitter:description" content="' + d + '">' +
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
      '<div><h2>Research</h2><ul><li><a href="https://papers.qnfo.org/papers">Papers</a></li><li><a href="https://papers.qnfo.org/papers/joules-per-solution-metric">JPCUB P0 protocol</a></li><li><a href="https://ask.qwav.tech/">Ask the corpus</a></li><li><a href="https://papers.qnfo.org/rss.xml">RSS</a></li></ul></div>' +
      '<div><h2>Legal</h2><ul><li><a href="https://legal.qnfo.org/">License (QNFO-ULA)</a></li><li><a href="https://qnfo.org/about">About the author</a></li></ul></div></div>' +
      '<div class="q-foot-base"><span>\u00a9 2025\u20132026 Rowan Brad Quni-Gudzinas</span><span>Research content under QNFO-ULA v2.0. No commercial product exists yet.</span></div></div></footer>';
  }
  return '<footer class="q-foot"><div class="q-wrap"><div class="q-foot-grid"><div><a class="q-brand" href="https://qnfo.org/">' + QDS_MARK.qnfo + 'QNFO</a><p style="margin-top:12px;max-width:38ch">The independent research imprint of Rowan Brad Quni-Gudzinas. Corrections ship as new versions of the same paper.</p></div>' +
    '<div><h2>Research</h2><ul><li><a href="https://papers.qnfo.org/papers">Papers</a></li><li><a href="https://qnfo.org/#selected-works">Selected works</a></li><li><a href="https://ask.qwav.tech/">Ask the corpus</a></li><li><a href="https://ideas.qnfo.org/">Ideas</a></li><li><a href="https://archive.qnfo.org/">Archive</a></li><li><a href="https://ipatent.qnfo.org/">Provisional drafting tool</a></li></ul></div>' +
    '<div><h2>Author</h2><ul><li><a href="https://qnfo.org/about">About</a></li><li><a href="https://qnfo.org/work-with-me">Work with me</a></li><li><a href="https://orcid.org/' + OWNER_ORCID + '">ORCID ' + OWNER_ORCID + '</a></li><li><a href="https://qnfo.org/work-with-me#contact">Contact</a></li></ul></div>' +
    '<div><h2>Follow</h2><ul><li><a href="https://qnfo.org/#subscribe">New papers by email</a></li><li><a href="https://papers.qnfo.org/rss.xml">RSS</a></li><li><a href="https://legal.qnfo.org/">License (QNFO-ULA)</a></li><li><a href="https://legal.qnfo.org/privacy">Privacy</a></li></ul></div></div>' +
    '<div class="q-foot-base"><span>\u00a9 2025\u20132026 QNFO \u00b7 Rowan Brad Quni-Gudzinas</span><span>Prepared with an AI-assisted research pipeline; the author is responsible for the content.</span></div></div></footer>';
}
function qdsPage(o, body) {
  return qdsHead(o) + "<body>" + qdsHeader(o.brand || "qnfo", o.active) + '<main id="main">' + body + "</main>" + qdsFooter(o.brand || "qnfo") + (o.scripts || "") + "</body></html>";
}
function qdsAsset(kind) {
  const css = kind === "css";
  return new Response(css ? QDS_CSS : QDS_JS, { headers: { "Content-Type": css ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800", "Access-Control-Allow-Origin": "*", "X-QDS-Version": QDS_VERSION } });
}
// ---- QDS-1:END ----

function stripFrontmatter(md) {
  if (!md) return "";
  let b = md.trimStart();
  if (b.startsWith("---")) {
    const s = b.indexOf("---", 3);
    if (s !== -1) b = b.slice(s + 3).trimStart();
  }
  if (b.startsWith("+++")) {
    const s = b.indexOf("+++", 3);
    if (s !== -1) b = b.slice(s + 3).trimStart();
  }
  return b;
}
__name(stripFrontmatter, "stripFrontmatter");
__name2(stripFrontmatter, "stripFrontmatter");
__name22(stripFrontmatter, "stripFrontmatter");
__name222(stripFrontmatter, "stripFrontmatter");
__name2222(stripFrontmatter, "stripFrontmatter");
__name22222(stripFrontmatter, "stripFrontmatter");
__name222222(stripFrontmatter, "stripFrontmatter");
__name2222222(stripFrontmatter, "stripFrontmatter");
__name22222222(stripFrontmatter, "stripFrontmatter");
__name222222222(stripFrontmatter, "stripFrontmatter");
__name2222222222(stripFrontmatter, "stripFrontmatter");
var MATH_SYM = {"\\langle": "\u27E8", "\\rangle": "\u27E9", "\\lvert": "|", "\\rvert": "|", "\\vert": "|", "\\Vert": "\u2016", "\\alpha": "\u03B1", "\\beta": "\u03B2", "\\gamma": "\u03B3", "\\delta": "\u03B4", "\\epsilon": "\u03B5", "\\varepsilon": "\u03B5", "\\zeta": "\u03B6", "\\eta": "\u03B7", "\\theta": "\u03B8", "\\iota": "\u03B9", "\\kappa": "\u03BA", "\\lambda": "\u03BB", "\\mu": "\u03BC", "\\nu": "\u03BD", "\\xi": "\u03BE", "\\pi": "\u03C0", "\\rho": "\u03C1", "\\sigma": "\u03C3", "\\tau": "\u03C4", "\\upsilon": "\u03C5", "\\phi": "\u03C6", "\\varphi": "\u03C6", "\\chi": "\u03C7", "\\psi": "\u03C8", "\\omega": "\u03C9", "\\Gamma": "\u0393", "\\Delta": "\u0394", "\\Theta": "\u0398", "\\Lambda": "\u039B", "\\Xi": "\u039E", "\\Pi": "\u03A0", "\\Sigma": "\u03A3", "\\Phi": "\u03A6", "\\Psi": "\u03A8", "\\Omega": "\u03A9", "\\times": "\u00D7", "\\cdot": "\u00B7", "\\pm": "\u00B1", "\\mp": "\u2213", "\\div": "\u00F7", "\\le": "\u2264", "\\leq": "\u2264", "\\ge": "\u2265", "\\geq": "\u2265", "\\neq": "\u2260", "\\ne": "\u2260", "\\approx": "\u2248", "\\equiv": "\u2261", "\\sim": "\u223C", "\\simeq": "\u2243", "\\propto": "\u221D", "\\ll": "\u226A", "\\gg": "\u226B", "\\to": "\u2192", "\\rightarrow": "\u2192", "\\leftarrow": "\u2190", "\\leftrightarrow": "\u2194", "\\mapsto": "\u21A6", "\\Rightarrow": "\u21D2", "\\Leftarrow": "\u21D0", "\\iff": "\u21D4", "\\in": "\u2208", "\\notin": "\u2209", "\\subset": "\u2282", "\\supset": "\u2283", "\\subseteq": "\u2286", "\\supseteq": "\u2287", "\\cup": "\u222A", "\\cap": "\u2229", "\\emptyset": "\u2205", "\\forall": "\u2200", "\\exists": "\u2203", "\\neg": "\u00AC", "\\land": "\u2227", "\\lor": "\u2228", "\\partial": "\u2202", "\\nabla": "\u2207", "\\sum": "\u2211", "\\prod": "\u220F", "\\int": "\u222B", "\\oint": "\u222E", "\\sqrt": "\u221A", "\\infty": "\u221E", "\\otimes": "\u2297", "\\oplus": "\u2295", "\\odot": "\u2299", "\\circ": "\u2218", "\\star": "\u22C6", "\\dagger": "\u2020", "\\hbar": "\u210F", "\\ell": "\u2113", "\\Re": "\u211C", "\\Im": "\u2111"};
function _mathToText(m){
  var out = m;
  out = out.replace(/\\(?:text|textrm|textbf|mathrm|mathbf|mathit|mathsf|mathcal|mathbb|mathfrak|operatorname|boldsymbol|hat|widehat|tilde|widetilde|bar|overline|vec)\{([^{}]*)\}/g, "$1");
  out = out.replace(/\\[dt]?frac(\d)(\d)/g, "$1/$2").replace(/\\[dt]frac\{/g, "\\frac{").replace(/\\[,;:!]|\\ /g, " ");
  out = out.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
  out = out.replace(/\\[a-zA-Z]+/g, function(c){ return Object.prototype.hasOwnProperty.call(MATH_SYM, c) ? MATH_SYM[c] : c.slice(1); });
  out = out.replace(/[{}]/g, "");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}
function mathPlain(s){
  if (!s) return "";
  return mdiRender(s, "plain");
}
// MD-INLINE-1 (3.14.0): one inline Markdown + math reader for titles and abstracts. Math spans ($..$, $$..$$, \(..\), \[..\])
// and code spans are lifted out first (so "_" and "*" inside them are never emphasis), then *em*, _em_, **strong**, ~~x~~,
// [[x]] and [text](url) are read from the rest. "$" is math only by the pandoc rule (no space after the opener or before
// the closer, no digit after the closer) and only when the span looks like TeX, so "$1,032" and "$5 and $6" stay currency.
// mdiRender(s, "html") -> escaped HTML with <em>/<strong>/<code>, math left as its delimiters for MathJax;
// mdiRender(s, "strip") -> markup removed, math kept as raw $..$ (displayTitle then converts it to symbols);
// mdiRender(s, "plain") -> readable plain text, math converted to symbols (titles in <title>/og/JSON-LD/RSS, abstracts).
var MDI_LIFT_RE = /`[^`\n]+`|\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$(?=[^\s$])((?:\\.|[^$\\\n])*?[^\s$\\])\$(?!\d)/g;
// NOZ-DOI-1 safety net: text still carrying a retired-deposit DOI or host name is cleaned at display time (the data is also
// scrubbed at its source): the parenthetical or bare identifier goes, and a sentence that still names the service goes.
var MDI_RETIRED = /10\.5281\/|zeno\x64o/i;
function mdiCleanRetired(s) {
  if (!MDI_RETIRED.test(s)) return s;
  const id = "(?:https?:\\/\\/(?:dx\\.)?doi\\.org\\/)?10\\.5281\\/zeno\\x64o[.,]?\\d+";
  s = s.replace(new RegExp("\\s*[(\\[]\\s*(?:the |its )?(?:DOI|doi)?:?\\s*" + id + "\\s*[)\\]]", "gi"), "").replace(new RegExp("[,;]?\\s*(?:\\b(?:DOI|doi)\\b:?\\s*)?" + id, "gi"), "");
  if (/zeno\x64o/i.test(s)) s = s.split(/(?<=[.!?])\s+/).filter(function(p) { return !/zeno\x64o/i.test(p); }).join(" ");
  return s.replace(/\s+([.,;:])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}
function mdiLift(src) {
  const st = [];
  const t = mdiCleanRetired(String(src == null ? "" : src)).replace(MDI_LIFT_RE, function(m, inner) {
    if (m.charAt(0) === "$" && m.charAt(1) !== "$" && inner != null && !/[\\^_{}]/.test(inner) && (/\s/.test(inner) || /^[\d.,]+$/.test(inner))) return m;
    st.push(m);
    return "\uE000" + (st.length - 1) + "\uE001";
  });
  return { t: t, st: st };
}
function mdiEmph(t, html) {
  const em = html ? "<em>$2</em>" : "$2";
  const strong = html ? "<strong>$1</strong>" : "$1";
  t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, strong).replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?![\w])/g, html ? "$1<strong>$2</strong>" : "$1$2");
  t = t.replace(/(^|[^\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/g, html ? "$1<em>$2</em>" : "$1$2");
  t = t.replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w])/g, html ? "$1<em>$2</em>" : "$1$2");
  t = t.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1").replace(/\[\[([^\]\n]+)\]\]/g, "$1").replace(/\[([^\]\n]+)\]\((?:[^()\s]|\([^()\s]*\))*\)/g, "$1");
  return t;
}
function mdiMathText(m) {
  let inner = m.replace(/^\$\$|\$\$$/g, "").replace(/^\\\(|\\\)$/g, "").replace(/^\\\[|\\\]$/g, "").replace(/^\$|\$$/g, "");
  inner = _mathToText(inner);
  inner = inner.replace(/\^\{?([0-9])\}?/g, function(x, d) { return "\u2070\xB9\xB2\xB3\u2074\u2075\u2076\u2077\u2078\u2079".charAt(+d); });
  inner = inner.replace(/_\{?([0-9])\}?/g, function(x, d) { return String.fromCharCode(0x2080 + +d); });
  return inner;
}
function mdiRender(src, mode) {
  const L = mdiLift(src);
  let t = L.t;
  if (mode === "html") {
    t = esc(t);
    t = t.replace(/\$/g, '<span class="usd">$</span>');
  }
  t = mdiEmph(t, mode === "html");
  return t.replace(/\uE000(\d+)\uE001/g, function(x, i) {
    const m = L.st[+i];
    if (m.charAt(0) === "`") return mode === "html" ? "<code>" + esc(m.slice(1, -1)) + "</code>" : m.slice(1, -1);
    if (mode === "html") return esc(m);
    if (mode === "strip") return m;
    return mdiMathText(m);
  });
}
function mdPlain(s) {
  return mdiRender(s, "plain").replace(/\s+/g, " ").trim();
}
__name(mathPlain, "mathPlain");

function esc(t) {
  if (!t) return "";
  return String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(esc, "esc");
__name2(esc, "esc");
__name22(esc, "esc");
__name222(esc, "esc");
__name2222(esc, "esc");
__name22222(esc, "esc");
__name222222(esc, "esc");
__name2222222(esc, "esc");
__name22222222(esc, "esc");
__name222222222(esc, "esc");
__name2222222222(esc, "esc");
function escAttr(t) {
  if (!t) return "";
  return String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(escAttr, "escAttr");
__name2(escAttr, "escAttr");
__name22(escAttr, "escAttr");
__name222(escAttr, "escAttr");
__name2222(escAttr, "escAttr");
__name22222(escAttr, "escAttr");
__name222222(escAttr, "escAttr");
__name2222222(escAttr, "escAttr");
__name22222222(escAttr, "escAttr");
__name222222222(escAttr, "escAttr");
__name2222222222(escAttr, "escAttr");
function displayTitle(t) {
  if (!t) return "";
  var s = mdiRender(t, "strip").replace(/\*\*/g, "").replace(/\[\[|\]\]/g, "").replace(/~~/g, "").trim();
  s = s.replace(/\$([^\$\n]*)\$/g, function(m, inner) {
    if (/\s/.test(inner)) {
      if (inner.indexOf("\\") < 0 && inner.indexOf("_") < 0 && inner.indexOf("^") < 0) return m;
    }
    return inner;
  });
  var M = { "\\mathbb{Z}": "\u2124", "\\mathbb{R}": "\u211D", "\\mathbb{Q}": "\u211A", "\\mathbb{N}": "\u2115", "\\mathbb{C}": "\u2102", "\\mathbb{H}": "\u210D", "\\mathbb{F}": "\u{1D53D}", "\\mathbb{P}": "\u2119", "\\mathbb{A}": "\u{1D538}", "\\mathbb{T}": "\u{1D54B}", "\\mathbb{O}": "\u{1D546}", "\\pi": "\u03C0", "\\nu": "\u03BD", "\\mu": "\u03BC", "\\lambda": "\u03BB", "\\alpha": "\u03B1", "\\beta": "\u03B2", "\\gamma": "\u03B3", "\\Gamma": "\u0393", "\\delta": "\u03B4", "\\Delta": "\u0394", "\\theta": "\u03B8", "\\Theta": "\u0398", "\\sigma": "\u03C3", "\\Sigma": "\u03A3", "\\tau": "\u03C4", "\\phi": "\u03C6", "\\Phi": "\u03A6", "\\psi": "\u03C8", "\\omega": "\u03C9", "\\Omega": "\u03A9", "\\times": "\xD7", "\\cdot": "\xB7", "\\pm": "\xB1", "\\leq": "\u2264", "\\geq": "\u2265", "\\approx": "\u2248", "\\neq": "\u2260", "\\infty": "\u221E", "\\rightarrow": "\u2192", "\\to": "\u2192", "\\leftarrow": "\u2190", "\\left": "", "\\right": "", "\\quad": " ", "\\qquad": " " };
  var keys = Object.keys(M).sort(function(a, b) {
    return b.length - a.length;
  });
  for (var i = 0; i < keys.length; i++) s = s.split(keys[i]).join(M[keys[i]]);
  s = s.replace(/\^\{?([0-9])\}?/g, function(m, d) {
    return ["\u2070", "\xB9", "\xB2", "\xB3", "\u2074", "\u2075", "\u2076", "\u2077", "\u2078", "\u2079"][+d];
  });
  s = s.replace(/_\{?([0-9])\}?/g, function(m, d) {
    return ["\u2080", "\u2081", "\u2082", "\u2083", "\u2084", "\u2085", "\u2086", "\u2087", "\u2088", "\u2089"][+d];
  });
  s = s.replace(/\\[\(\)\[\]]/g, "");
  s = s.replace(/[{}\\]+/g, "");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}
__name(displayTitle, "displayTitle");
__name2(displayTitle, "displayTitle");
__name22(displayTitle, "displayTitle");
__name222(displayTitle, "displayTitle");
__name2222(displayTitle, "displayTitle");
function looksLikeTeX(x) {
  return /\\[a-zA-Z]+/.test(x) || /[\\^{}_]/.test(x);
}
__name(looksLikeTeX, "looksLikeTeX");
__name2(looksLikeTeX, "looksLikeTeX");
__name22(looksLikeTeX, "looksLikeTeX");
__name222(looksLikeTeX, "looksLikeTeX");
__name2222(looksLikeTeX, "looksLikeTeX");
function titleHTML(t) {
  if (!t) return "";
  return mdiRender(String(t).trim(), "html");
}
function absHTML(ab, n) {
  let a = String(ab || "").replace(/\s+/g, " ").trim();
  if (a.length > n) {
    let cut = a.lastIndexOf(" ", n) > n * 0.6 ? a.lastIndexOf(" ", n) : n;
    const re = new RegExp(MDI_LIFT_RE.source, "g");
    let m;
    while ((m = re.exec(a)) !== null) { if (m.index < cut && m.index + m[0].length > cut) { cut = m.index; break; } if (m.index >= cut) break; }
    a = a.slice(0, cut).replace(/\s+\S*$/, function(x) { return cut < n * 0.5 ? "" : x; }).replace(/[\s*_]+$/, "") + "\u2026";
  }
  return mdiRender(a, "html");
}
__name(titleHTML, "titleHTML");
__name2(titleHTML, "titleHTML");
__name22(titleHTML, "titleHTML");
__name222(titleHTML, "titleHTML");
__name2222(titleHTML, "titleHTML");
function xmlEscape(t) {
  if (!t) return "";
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
__name(xmlEscape, "xmlEscape");
__name2(xmlEscape, "xmlEscape");
__name22(xmlEscape, "xmlEscape");
__name222(xmlEscape, "xmlEscape");
__name2222(xmlEscape, "xmlEscape");
__name22222(xmlEscape, "xmlEscape");
__name222222(xmlEscape, "xmlEscape");
__name2222222(xmlEscape, "xmlEscape");
__name22222222(xmlEscape, "xmlEscape");
__name222222222(xmlEscape, "xmlEscape");
__name2222222222(xmlEscape, "xmlEscape");
function detectCategory(title, abstract) {
  const t = ((title || "") + " " + (abstract || "")).toLowerCase();
  if (t.includes("error correction") || t.includes("stabilizer") || t.includes("fault-tolerant") || t.includes("qec") || t.includes("ldpc") || t.includes("surface code")) return "qec";
  if (t.includes("number theory") || t.includes("p-adic") || t.includes("adelic") || t.includes("ostrowski") || t.includes("gamma function") || t.includes("morita") || t.includes("langlands")) return "number-theory";
  if (t.includes("physics") || t.includes("quantum field") || t.includes("quantum gravity") || t.includes("wheeler-dewitt") || t.includes("zbw") || t.includes("zitterbewegung") || t.includes("topological") || t.includes("majorana") || t.includes("holograph")) return "physics";
  if (t.includes("algorithm") || t.includes("machine learning") || t.includes("cryptograph") || t.includes("benchmark") || t.includes("verification") || t.includes("lwe") || t.includes("neural network") || t.includes("computation")) return "computer-science";
  return "other";
}
__name(detectCategory, "detectCategory");
__name2(detectCategory, "detectCategory");
__name22(detectCategory, "detectCategory");
__name222(detectCategory, "detectCategory");
__name2222(detectCategory, "detectCategory");
__name22222(detectCategory, "detectCategory");
__name222222(detectCategory, "detectCategory");
__name2222222(detectCategory, "detectCategory");
__name22222222(detectCategory, "detectCategory");
__name222222222(detectCategory, "detectCategory");
__name2222222222(detectCategory, "detectCategory");
var CATEGORY_LABELS = { "qec": "QEC", "number-theory": "Number theory", "physics": "Physics", "computer-science": "CS", "other": "Other" };
function texSafe(s) {
  if (!s) return "";
  s = String(s);
  // MATH-ESCAPE-1 (3.9.7): a doubled backslash before # or % ("|\\#E(F_p)|") is a markdown-escaped \# as well, and \' (an
  // escaped apostrophe, "\prod\'_p") is a prime. An amsCD diagram keeps its @>>> arrows: < and > become HTML entities, which
  // the browser hands to MathJax as < and >, instead of \lt and \gt, which broke every arrow.
  s = s.replace(/(\\{2,})(?=[A-Za-z#%])/g, function(mm) {
    return "\\".repeat(Math.floor(mm.length / 2));
  });
  s = s.replace(/\\'/g, "'");
  if (/\\begin\{CD\}/.test(s)) return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\\left\s*</g, "\\left\\langle ");
  s = s.replace(/\\right\s*>/g, "\\right\\rangle ");
  s = s.replace(/<=/g, "\\leq ");
  s = s.replace(/>=/g, "\\geq ");
  s = s.replace(/<(?=\\)/g, "\\langle ");
  s = s.replace(/</g, "\\lt ");
  s = s.replace(/>/g, "\\gt ");
  return s;
}
__name(texSafe, "texSafe");
__name2(texSafe, "texSafe");
__name22(texSafe, "texSafe");
__name222(texSafe, "texSafe");
__name2222(texSafe, "texSafe");
function cleanPunct(s) {
  return String(s || "").replace(/[ \t]+([,.!?;:])/g, "$1");
}
__name(cleanPunct, "cleanPunct");
__name2(cleanPunct, "cleanPunct");
__name22(cleanPunct, "cleanPunct");
__name222(cleanPunct, "cleanPunct");
__name2222(cleanPunct, "cleanPunct");
// MATH-TYPESET-1 (3.9.3, 2026-10-03, pillar reach): plain-text pseudo-math ("D_C = e^{2\u03c0i c / 8}", "\u03ba = dim(A)\u00b2", "10\u207b\u2074")
// carries no $ delimiters, so MathJax has nothing to typeset and the reader sees raw underscores and carets. A live sweep of
// the 458 paper pages on 2026-10-03 found 47 pages with plain-text math only and 160 more with LaTeX plus leftover plain text;
// paper_render_defect_pages read 0 because none of its four tests looks at math. pseudoMath() finds runs of such notation in
// running text (after real $...$ and \(...\) are saved, outside code spans and link targets) and hands each to saveMath as TeX.
// Conservative by design: a run needs an anchor (subscript or superscript on a single letter, a Unicode script character, a Greek
// letter or a math symbol), words of three or more letters break it, URLs, DOIs and snake_case identifiers are never touched, and a
// run that would not be valid TeX (unbalanced braces, a double script, a stray backslash, a non-ASCII leftover) is left as text.
// Offline corpus check: scripts/math-corpus-check.mjs (9,056 runs over 458 pages, 0 KaTeX parse errors; 8,023 -> 1,204 residual).
// MATH-TYPESET-1 prototype: plain-text pseudo-math -> TeX spans, conservative.
// pseudoMath(line, save) returns the line with each detected run replaced by save(tex).
var PM_GREEK = {"\u03b1":"\\alpha","\u03b2":"\\beta","\u03b3":"\\gamma","\u03b4":"\\delta","\u03b5":"\\varepsilon","\u03f5":"\\epsilon","\u03b6":"\\zeta","\u03b7":"\\eta","\u03b8":"\\theta","\u03d1":"\\vartheta","\u03b9":"\\iota","\u03ba":"\\kappa","\u03bb":"\\lambda","\u03bc":"\\mu","\u00b5":"\\mu","\u03bd":"\\nu","\u03be":"\\xi","\u03c0":"\\pi","\u03d6":"\\varpi","\u03c1":"\\rho","\u03f1":"\\varrho","\u03c3":"\\sigma","\u03c2":"\\varsigma","\u03c4":"\\tau","\u03c5":"\\upsilon","\u03c6":"\\varphi","\u03d5":"\\phi","\u03c7":"\\chi","\u03c8":"\\psi","\u03c9":"\\omega","\u0393":"\\Gamma","\u0394":"\\Delta","\u0398":"\\Theta","\u039b":"\\Lambda","\u039e":"\\Xi","\u03a0":"\\Pi","\u03a3":"\\Sigma","\u03a5":"\\Upsilon","\u03a6":"\\Phi","\u03a8":"\\Psi","\u03a9":"\\Omega","\u0391":"A","\u0392":"B","\u0395":"E","\u0396":"Z","\u0397":"H","\u0399":"I","\u039a":"K","\u039c":"M","\u039d":"N","\u039f":"O","\u03a1":"P","\u03a4":"T","\u03a7":"X"};
var PM_SYM = {"\u00d7":"\\times ","\u00b7":"\\cdot ","\u22c5":"\\cdot ","\u2212":"-","\u2013":"-","\u2264":"\\leq ","\u2265":"\\geq ","\u2248":"\\approx ","\u2260":"\\neq ","\u226a":"\\ll ","\u226b":"\\gg ","\u2208":"\\in ","\u2209":"\\notin ","\u2295":"\\oplus ","\u2297":"\\otimes ","\u2192":"\\to ","\u2190":"\\leftarrow ","\u2194":"\\leftrightarrow ","\u21d2":"\\Rightarrow ","\u21d4":"\\Leftrightarrow ","\u221e":"\\infty ","\u2202":"\\partial ","\u2207":"\\nabla ","\u2211":"\\sum ","\u220f":"\\prod ","\u211a":"\\mathbb{Q}","\u211d":"\\mathbb{R}","\u2124":"\\mathbb{Z}","\u2102":"\\mathbb{C}","\u2115":"\\mathbb{N}","\u27e8":"\\langle ","\u27e9":"\\rangle ","\u2016":"\\Vert ","\u223c":"\\sim ","\u2261":"\\equiv ","\u00b1":"\\pm ","\u2213":"\\mp ","\u221d":"\\propto ","\u2200":"\\forall ","\u2203":"\\exists ","\u2227":"\\wedge ","\u2228":"\\vee ","\u00ac":"\\neg ","\u2282":"\\subset ","\u2286":"\\subseteq ","\u2283":"\\supset ","\u222a":"\\cup ","\u2229":"\\cap ","\u2205":"\\emptyset ","\u2218":"\\circ ","\u22a5":"\\perp ","\u2245":"\\cong ","\u2243":"\\simeq ","\u2032":"'","\u02b9":"'","\u02bc":"'","\u2026":"\\ldots ","\u2020":"\\dagger ","\u00b0":"^{\\circ}","\u2223":"\\mid ","\u2308":"\\lceil ","\u2309":"\\rceil ","\u230a":"\\lfloor ","\u230b":"\\rfloor ","\u2272":"\\lesssim ","\u2273":"\\gtrsim ","\u210f":"\\hbar ","\u0127":"\\hbar ","\u2113":"\\ell "};  // MATH-RESIDUE-3: script-l is a base ("\u2113_P")
var PM_SUPM = {"\u2070":"0","\u00b9":"1","\u00b2":"2","\u00b3":"3","\u2074":"4","\u2075":"5","\u2076":"6","\u2077":"7","\u2078":"8","\u2079":"9","\u207a":"+","\u207b":"-","\u207c":"=","\u207d":"(","\u207e":")","\u207f":"n","\u2071":"i","\u1d43":"a","\u1d47":"b","\u1d9c":"c","\u1d48":"d","\u1d49":"e","\u1da0":"f","\u1d4d":"g","\u02b0":"h","\u02b2":"j","\u1d4f":"k","\u02e1":"l","\u1d50":"m","\u1d52":"o","\u1d56":"p","\u02b3":"r","\u02e2":"s","\u1d57":"t","\u1d58":"u","\u1d5b":"v","\u02b7":"w","\u02e3":"x","\u02b8":"y","\u1dbb":"z"};
var PM_SUBM = {"\u2080":"0","\u2081":"1","\u2082":"2","\u2083":"3","\u2084":"4","\u2085":"5","\u2086":"6","\u2087":"7","\u2088":"8","\u2089":"9","\u208a":"+","\u208b":"-","\u208c":"=","\u208d":"(","\u208e":")","\u2090":"a","\u2091":"e","\u2092":"o","\u2093":"x","\u2095":"h","\u2096":"k","\u2097":"l","\u2098":"m","\u2099":"n","\u209a":"p","\u209b":"s","\u209c":"t","\u1d62":"i","\u2c7c":"j","\u1d63":"r","\u1d64":"u","\u1d65":"v"};
var PM_SUPC = Object.keys(PM_SUPM).join(""), PM_SUBC = Object.keys(PM_SUBM).join("");
var PM_FUNCS = "dim|log|ln|exp|sin|cos|tan|sinh|cosh|tanh|max|min|det|gcd|lim|sup|inf|tr|Tr|deg|arg|ord|val|rank|Re|Im|mod|Pr|Var|Cov|sign|sgn";  // MATH-RESIDUE-3: sign, sgn
var PM_FUNC_RE = new RegExp("^(" + PM_FUNCS + ")$");
var PM_UNITS = "fJ|pJ|nJ|\u00b5J|mJ|J|fs|ps|ns|\u00b5s|ms|s|Hz|kHz|MHz|GHz|THz|mK|K|eV|meV|keV|MeV|GeV|TeV|nm|\u00b5m|mm|cm|dm|km|m|W|mW|\u00b5W|nW|pW|V|mV|A|mA|dB|kB|MB|GB|Gb|bits?|qubits?";
var PM_UNIT_RE = new RegExp("^(" + PM_UNITS + ")$");
var PM_GREEK_CLASS = "[\u0391-\u03a9\u03b1-\u03c9\u03d1\u03d5\u03d6\u03f1\u03f5\u00b5]";
var PM_SYM_CLASS = "[" + Object.keys(PM_SYM).filter(function (k) { return !/^[\u00d7\u00b7\u22c5\u2212\u2013\u2032\u2026\u00b0\u0127\u2113]$/.test(k); }).join("") + "]";  // MATH-RESIDUE-3: Latin \u0127 and script-l convert inside a run but never anchor one
var PM_OPS = new Set(["=", "\u2248", "\u2260", "\u2264", "\u2265", "<", ">", "\u226a", "\u226b", "+", "\u2212", "\u00d7", "\u00b7", "\u22c5", "\u2295", "\u2297", "\u2208", "\u2209", "\u2192", "\u2190", "\u2194", "\u21d2", "\u21d4", "\u223c", "\u2261", "\u00b1", "/", "*", "\u2218", "\u221d", "\u2282", "\u2286", "\u222a", "\u2229", "\u2243", "\u2245", "\u2272", "\u2273", "-", "\u2013", "|", "\u2223"]);
var PM_EQ_OPS = new Set(["=", "\u2248", "\u2260", "\u2264", "\u2265", "<", ">", "\u226a", "\u226b", "\u2208", "\u2261", "\u223c"]);
var PM_SUBBASE = "(?:\ud835[\udd38-\udd6b]|[A-Za-z\u0391-\u03a9\u03b1-\u03c9\u2113\u2115\u211a\u211d\u2124\u2102\u220f\u2211\\)\\]])";
var PM_RE_SUB = new RegExp("(?:(?<![A-Za-z0-9_\\\\])" + PM_SUBBASE + "|[\\)\\]])\\\\?_(?:\\{[^{}]{1,40}\\}|[A-Za-z0-9\u03b1-\u03c9\u0391-\u03a9]{1,8}(?![A-Za-z0-9_\u03b1-\u03c9])|[A-Za-z0-9](?=[\u0391-\u03a9\u03b1-\u03c9]))");
var PM_RE_PIPE_SUB = /\|[^|\s]{1,12}\|_[A-Za-z0-9]{1,4}/;
var PM_RE_CARET = /(?:(?<![A-Za-z0-9_\\])[A-Za-z0-9\u0391-\u03a9\u03b1-\u03c9]|[\)\]])\^(?:\{[^{}\s]{1,40}\}|\([^()\s]{1,30}\)|[A-Za-z0-9\u03b1-\u03c9\-\u2212]{1,6}(?![A-Za-z0-9_]))/;
var PM_RE_UNI = new RegExp("(?<![a-z][A-Za-z\\u0370-\\u03ff]|[A-Za-z\\u0370-\\u03ff][a-z])(?<=[A-Za-z0-9\\u0370-\\u03ff\\)\\]" + PM_SUPC + PM_SUBC + "])[" + PM_SUPC + PM_SUBC + "]");
var PM_RE_GREEK = new RegExp(PM_GREEK_CLASS);
// MATH-RESIDUE-2 (3.9.8, #2023): shapes the 2026-10-06 06:00 sweep still counted as residue on 68 pages.
var PM_RE_COEF = /^[+\u2212-]?\d+(?:\.\d+)?[A-Za-z\u0391-\u03a9\u03b1-\u03c9](?:\\?_|\^)/;              // 3p_Z, 2d^2
var PM_RE_FUNC_SCRIPT = new RegExp("(?<![A-Za-z])(?:" + PM_FUNCS + ")[" + PM_SUBC + PM_SUPC + "]+");  // log\u2082(0.1)
var PM_RE_PI = /(?<![A-Za-z0-9_\\])pi\^/;                                                          // pi^2/6
// MATH-RESIDUE-3 (3.11.2, #2023): a unit raised to a power ("1 dm^3 of water", "cm^-2") is math, not a word.
var PM_RE_UNIT_POW = new RegExp("^(?:" + PM_UNITS + ")\\^[\u2212-]?\\d$");
var PM_CHEM = "(?:[A-Z][a-z]?[" + PM_SUBC + "]*|\\((?:[A-Z][a-z]?[" + PM_SUBC + "]*)+\\)[" + PM_SUBC + "]*)+";
var PM_RE_CHEM = new RegExp("^" + PM_CHEM + "$");                                                      // Si\u2083N\u2084, Ca\u2089(PO\u2084)\u2086, AdS\u2083
function pmIsChem(c) { return PM_RE_CHEM.test(c) && new RegExp("[" + PM_SUBC + "]").test(c) && /[A-Z][a-z]|[A-Z][^A-Z]*[A-Z]/.test(c); }
var PM_RE_SYM = new RegExp(PM_SYM_CLASS + "|\u221a");

function pmBalanced(s) {
  var d = 0, c = 0;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch === "(") d++; else if (ch === ")") { d--; if (d < 0) return false; }
    else if (ch === "{") c++; else if (ch === "}") { c--; if (c < 0) return false; }
  }
  return d === 0 && c === 0;
}
function pmStripPunct(w) {
  var lead = "", trail = "";
  var m = /^[(\[{"'\u201c\u2018*]+/.exec(w);
  if (m) { lead = m[0]; w = w.slice(lead.length); }
  var changed = true;
  while (changed && w.length) {
    changed = false;
    var last = w[w.length - 1];
    if (/[.,;:!?"'\u201d\u2019*]/.test(last)) { trail = last + trail; w = w.slice(0, -1); changed = true; }
    else if ((last === ")" || last === "]" || last === "}") && !pmBalanced(w)) { trail = last + trail; w = w.slice(0, -1); changed = true; }
  }
  // a leading paren that never closes inside the core stays out
  while (w[0] === "(" && !pmBalanced(w)) { lead += "("; w = w.slice(1); }
  // MATH-RESIDUE-2: a leading "(" that does close inside the word is part of it ("(1\u2212p)^N", "(31/3)^4")
  while (lead.length && lead[lead.length - 1] === "(" && !pmBalanced(w) && pmBalanced("(" + w)) { w = "(" + w; lead = lead.slice(0, -1); }
  // MATH-RESIDUE-3 (3.11.2, #2023): a word that opens with "(" and closes a script after it ("(p/p_th)^(d/2),", "(\u22121)^{2s}",
  // "(p+1)p^{n\u22121}") lost both ends above; take the "(" back with the first stripped closer when the pair balances it.
  while (lead.length && lead[lead.length - 1] === "(" && /^[)\]}]/.test(trail) && !pmBalanced(w) && pmBalanced("(" + w + trail[0])) { w = "(" + w + trail[0]; lead = lead.slice(0, -1); trail = trail.slice(1); }
  return { lead: lead, core: w, trail: trail };
}
function pmIsStrong(c) {
  return PM_RE_COEF.test(c) || PM_RE_FUNC_SCRIPT.test(c) || PM_RE_PI.test(c) || new RegExp("^(?:" + PM_UNITS + ")[" + PM_SUPC + "]+$").test(c) || PM_RE_UNIT_POW.test(c) || PM_RE_SUB.test(c) || PM_RE_PIPE_SUB.test(c) || PM_RE_CARET.test(c) || PM_RE_UNI.test(c) || PM_RE_GREEK.test(c) || PM_RE_SYM.test(c) || /\u221a/.test(c);
}
function pmAtomish(c) {
  if (!/^[()\[\]A-Za-z0-9.,+\-\u2212\u00b7\u00d7\u22c5*\/]{1,30}$/.test(c)) return false;
  if (/[A-Za-z]\.[A-Za-z]/.test(c)) return false;
  var r = c.replace(new RegExp("(?:" + PM_FUNCS + "|" + PM_UNITS + ")", "g"), "");
  if (/[A-Za-z]{2,}/.test(r)) return false;
  return /[0-9()\/]/.test(c) && /[A-Za-z0-9]/.test(c);
}
function pmIsAtom(c) {
  if (pmAtomish(c)) return true;
  if (/^[+\u2212-]?\d[\d.,]*%?$/.test(c)) return true;            // number
  if (/^[A-Za-z]$/.test(c)) return true;                           // single variable
  if (/^\(?[\d.]+\/[\d.]+\)?$/.test(c)) return true;               // 8/64
  if (PM_FUNC_RE.test(c) || PM_UNIT_RE.test(c)) return true;
  if (/^(?:[A-Za-z]|\d+(?:\.\d+)?)(?:\([^()\s]{1,30}\))$/.test(c) && pmBalanced(c)) return true;    // f(p), dim(A), p(k)
  if (new RegExp("^(?:" + PM_FUNCS + ")\\([^()\\s]{1,30}\\)$").test(c) && pmBalanced(c)) return true;
  if (/^\([A-Za-z0-9+\-\u2212*\/.,=\u2264\u2265]{1,30}\)$/.test(c)) return true; // (a+b) (8/64)
  return false;
}
function pmWordLike(core) {
  var c = core.replace(/\\?_\{[^{}]*\}|\\?_[A-Za-z0-9\u03b1-\u03c9\u0391-\u03a9]+|\^\{[^{}]*\}|\^[A-Za-z0-9\-]+/g, " ").replace(/[^A-Za-z]+/g, " ").trim().split(" ");
  for (var i = 0; i < c.length; i++) {
    var w = c[i];
    if (w.length >= 3 && !PM_FUNC_RE.test(w) && !PM_UNIT_RE.test(w)) return true;
    if (w.length === 2 && /^[A-Z][a-z]$/.test(w)) return true;
  }
  return false;
}
function pmGreekWord(core) { return /[\u1f00-\u1fff\u0386\u0388-\u038a\u038c\u038e-\u0390\u03ac-\u03b0\u03ca-\u03ce]/.test(core); }
function pmClassify(core) {
  if (!core) return "break";
  if (/^\u0003/.test(core) || /\u0003/.test(core)) return "break";    // existing math placeholder
  if (/:\/\/|^www\.|@|^10\.\d{4,}\//.test(core)) return "break";
  if (/-[a-z]{2,}-/.test(core)) return "break";                       // 3.9.7: prose compound ("Q-vs-R", "kappa-to-error")
  if (/\*\*|\*[^*\s]+\*/.test(core)) return "break";                  // 3.9.7: markdown emphasis inside the word ("A(*v*)") stays markdown
  // MATH-RESIDUE-2: a lone "*" after a non-operand ("\u222b*{") or before a relation or brace ("D\u03d5*>") is an emphasis marker,
  // not math; "\u03c4*" (tau-star) and "a*b" stay math.
  if (core.length > 1 && /(?:^|[^A-Za-z0-9\u0370-\u03ff)\]*])\*(?!\*)|\*[<>{=]/.test(core)) return "break";
  if (PM_OPS.has(core)) return "op";
  if (pmGreekWord(core)) return "break";
  if (pmIsChem(core)) return "strong";                                // MATH-RESIDUE-2: a formula is not a word
  if (pmIsStrong(core)) {
    if (pmWordLike(core)) return "break";
    // multi-letter plain prefix words (snake_case) must not be strong: base must be a single token char
    return "strong";
  }
  if (pmIsAtom(core)) return "atom";
  return "break";
}

function pmToTex(s) {
  s = s.replace(/\\([_*#])/g, "$1");
  s = s.replace(/\\/g, "\\backslash ");
  // MATH-RESIDUE-2: element groups of a formula token are upright (\mathrm{Si}_{3}\mathrm{N}_{4}); pi before ^ is \pi.
  s = s.replace(new RegExp("(?<![A-Za-z\\\\_^])" + PM_CHEM + "(?![A-Za-z])", "g"), function (m) { return pmIsChem(m) ? m.replace(/[A-Z][a-z]?/g, function (e) { return "\\mathrm{" + e + "}"; }) : m; });
  s = s.replace(/(?<![A-Za-z\\])pi(?=\^)/g, "\\pi ");
  s = s.replace(/(.)\u0303/gu, "\\tilde{$1}").replace(/(.)\u0304/gu, "\\bar{$1}").replace(/(.)\u0302/gu, "\\hat{$1}").replace(/(.)\u0307/gu, "\\dot{$1}");
  // sqrt
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch === "\u221a") {
      var rest = s.slice(i + 1), m;
      if (rest[0] === "(") {
        var d = 0, j = 0;
        for (; j < rest.length; j++) { if (rest[j] === "(") d++; else if (rest[j] === ")") { d--; if (d === 0) break; } }
        out += "\\sqrt{" + pmToTex(rest.slice(1, j)) + "}"; i += j + 1; continue;
      }
      m = /^[A-Za-z0-9.\u03b1-\u03c9\u0391-\u03a9]+(?:[_^](?:\{[^{}]+\}|[A-Za-z0-9]+))?/.exec(rest);
      if (m) { out += "\\sqrt{" + pmToTex(m[0]) + "}"; i += m[0].length; continue; }
      out += "\\surd "; continue;
    }
    out += ch;
  }
  s = out;
  // unicode super/subscript runs
  s = s.replace(new RegExp("[" + PM_SUPC + "]+", "g"), function (m) { return "^{" + m.split("").map(function (c) { return PM_SUPM[c]; }).join("") + "}"; });
  s = s.replace(new RegExp("[" + PM_SUBC + "]+", "g"), function (m) { return "_{" + m.split("").map(function (c) { return PM_SUBM[c]; }).join("") + "}"; });
  // bare _sub and ^sup: braces, \mathrm for multi-letter words (recursive for nested subscripts)
  function scripts(x) {
    return x.replace(/_\{([^{}]+)\}|_([A-Za-z0-9]+(?![\u03b1-\u03c9\u0391-\u03a9])|[A-Za-z0-9](?=[\u03b1-\u03c9\u0391-\u03a9])|[\u03b1-\u03c9\u0391-\u03a9][A-Za-z0-9\u03b1-\u03c9\u0391-\u03a9]*)/g, function (m, a, b) {
      var t = a != null ? scripts(a) : b;
      if (a == null && /^[A-Za-z]{2,}$/.test(t) && !/^[a-z]{2}$/.test(t)) t = "\\mathrm{" + t + "}";
      else if (a != null && /^[A-Za-z]{3,}$/.test(t)) t = "\\mathrm{" + t + "}";
      return "_{" + t + "}";
    });
  }
  s = scripts(s);
  s = s.replace(/\^\(([^()]+)\)/g, "^{$1}");
  s = s.replace(/\^(-?\d+|\u2212\d+|[A-Za-z](?![A-Za-z])|[A-Za-z]{2,6}(?![A-Za-z]))/g, function (m, a) { return "^{" + a.replace(/\u2212/g, "-") + "}"; });
  s = s.replace(/[\u{1D538}-\u{1D56B}]/gu, function (c) { var o = c.codePointAt(0) - 0x1D538; return "\\mathbb{" + String.fromCharCode(o < 26 ? 65 + o : 97 + o - 26) + "}"; });
  // greek and symbols
  s = s.replace(/[\u0391-\u03a9\u03b1-\u03c9\u03d1\u03d5\u03d6\u03f1\u03f5\u00b5]/g, function (c) { return PM_GREEK[c] != null ? PM_GREEK[c] + (/[A-Za-z]$/.test(PM_GREEK[c]) && PM_GREEK[c].length > 1 ? " " : "") : c; });
  s = s.replace(/[^\x00-\x7f]/g, function (c) { return PM_SYM[c] != null ? PM_SYM[c] : c; });
  // functions and units
  s = s.replace(new RegExp("(?<![A-Za-z\\\\])(" + PM_FUNCS + ")(?![A-Za-z])", "g"), function (m, f) { return f === "mod" ? "\\bmod " : "\\" + (f === "Tr" || f === "tr" ? "operatorname{" + f + "}" : f === "ord" || f === "val" || f === "rank" || f === "sign" || f === "sgn" || f === "Var" || f === "Cov" || f === "Pr" || f === "Re" || f === "Im" ? "operatorname{" + f + "}" : f); });
  s = s.replace(new RegExp("(?<![A-Za-z\\\\{])(" + PM_UNITS + ")(?![A-Za-z\\\\}])", "g"), function (m, u, off, str) {
    // only treat as unit when it follows a number token
    var before = str.slice(0, off);
    if (u.length > 1) return (/(\d|\})\s*$/.test(before) ? "\\," : "") + "\\mathrm{" + u + "}";
    if (/\d\s*$/.test(before)) return "\\,\\mathrm{" + u + "}";
    return u;
  });
  s = s.replace(/~/g, "\\sim ");
  s = s.replace(/[%#&]/g, function(ch) {
    return String.fromCharCode(92) + ch;
  });
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function pseudoMath(text, save, stats) {
  // protect code spans and link targets
  var keep = [];
  var t = String(text).replace(/`[^`]*`|\]\([^)]*\)/g, function (m) { keep.push(m); return "\u0001" + (keep.length - 1) + "\u0001"; });
  var parts0 = t.split(/(\s+)/);          // words and whitespace
  var parts = [];
  for (var pi = 0; pi < parts0.length; pi++) {
    var cur = parts0[pi];
    if (pi % 2 === 0 && (cur.split("{").length - 1) > (cur.split("}").length - 1)) {
      var tmp = cur, pj = pi;
      while ((tmp.split("{").length - 1) > (tmp.split("}").length - 1) && pj + 2 < parts0.length && pj - pi < 12) { tmp += parts0[pj + 1] + parts0[pj + 2]; pj += 2; }
      if ((tmp.split("{").length - 1) === (tmp.split("}").length - 1)) { cur = tmp; pi = pj; }
    }
    parts.push(cur);
    if (pi + 1 < parts0.length) { parts.push(parts0[pi + 1]); pi++; }
  }
  var words = [];                       // {i, w, kind, lead, core, trail}
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 === 1 || parts[i] === "") continue;
    var sp = pmStripPunct(parts[i]);
    // MATH-RESIDUE-3: a comma subscript with no space after the comma ("t_Q,total", "P_q,op") is one subscript; the
    // original text stays in res, so the braces reach only an emitted run.
    var csub = /^([A-Za-z\u0391-\u03a9\u03b1-\u03c9])_([A-Za-z0-9]{1,3}),([A-Za-z]{2,8})(?![A-Za-z0-9_,])/.exec(sp.core);
    if (csub) sp = { lead: sp.lead, core: csub[1] + "_{" + csub[2] + "," + csub[3] + "}" + sp.core.slice(csub[0].length), trail: sp.trail };
    var hs = /^(.+?)(-[A-Za-z]{2,}(?:-[A-Za-z]+)*)$/.exec(sp.core);   // 3.9.7: two-letter suffixes too ("Q-as-base")
    if (hs && pmClassify(hs[1]) === "strong" && !/^[A-Za-z]+$/.test(hs[1])) { sp = { lead: sp.lead, core: hs[1], trail: hs[2] + sp.trail }; }
    // MATH-RESIDUE-3: an emphasis opened in the lead ("*") that closes inside the core ("*\u0127c*/\u2113P\u00b2") is markdown, not math.
    var kind = /\u0001/.test(sp.core) || (/\*/.test(sp.lead) && /\*/.test(sp.core)) ? "break" : pmClassify(sp.core);
    words.push({ idx: i, sp: sp, kind: kind });
  }
  var res = parts.slice();
  var n = 0;
  // MATH-RESIDUE-2 (3.9.8): a run that fails validation is no longer all-or-nothing. It is split at words whose own
  // brackets do not balance ("{\u03b3_i," "t_g)") and each part is tried again; failing that, each strong word is tried alone.
  // Every emitted part passes the same checks as a whole run, so nothing new reaches KaTeX unchecked.
  function splitEmit(a, b, depth) {
    var start = a, segs = [];
    for (var k = a; k <= b; k++) {
      var w = words[k], whole = w.sp.lead + w.sp.core + w.sp.trail;
      if (/[(){}\[\]]/.test(w.sp.lead + w.sp.trail) && !pmBalanced(whole)) { if (start <= k - 1) segs.push([start, k - 1]); segs.push([k, k]); start = k + 1; }
    }
    if (start <= b) segs.push([start, b]);
    if (segs.length > 1) { segs.forEach(function (sg) { emit(sg[0], sg[1], depth + 1); }); return; }
    for (var j = a; j <= b; j++) if (words[j].kind === "strong") emit(j, j, depth + 1);
  }
  function emit(a, b, depth) {
    depth = depth || 0;
    // a..b inclusive indices into words
    while (a <= b && words[a].kind === "op" && !/^[+\u2212-]$/.test(words[a].sp.core) ) a++;
    while (b >= a && words[b].kind === "op") b--;
    // drop edge ambiguous lone letters (article "a"/"A", pronoun "I") not next to an operator
    while (a < b && words[a].kind === "atom" && /^[aAI]$/.test(words[a].sp.core) && words[a + 1].kind !== "op") a++;
    while (b > a && words[b].kind === "atom" && /^[aAI]$/.test(words[b].sp.core) && words[b - 1].kind !== "op") b--;
    // 3.9.7: a run never starts with a bare multi-letter unit ("1 logical qubit, E_g ..." keeps "qubit," as prose)
    while (a < b && words[a].kind === "atom" && words[a].sp.core.length > 1 && PM_UNIT_RE.test(words[a].sp.core) && words[a + 1].kind !== "op") a++;
    if (a > b) return;
    var kinds = words.slice(a, b + 1).map(function (x) { return x.kind; });
    var strong = kinds.indexOf("strong") >= 0;
    var eqs = words.slice(a, b + 1).some(function (x) { return x.kind === "op" && PM_EQ_OPS.has(x.sp.core); });
    var atoms = kinds.filter(function (k) { return k === "atom"; }).length;
    if (!strong && !(eqs && atoms >= 2)) return;
    var segs = [];
    for (var k = a; k <= b; k++) {
      var w = words[k];
      var core = w.sp.core;
      var firstSeg = k === a, lastSeg = k === b;
      segs.push({ k: k, core: core, lead: firstSeg ? w.sp.lead : "", trail: lastSeg ? w.sp.trail : "" });
    }
    // glue: inner words keep their own lead/trail (parens balance); only the run edges release punctuation
    var raw = [];
    for (var q = a; q <= b; q++) {
      var ww = words[q];
      raw.push((q === a ? "" : ww.sp.lead) + ww.sp.core + (q === b ? "" : ww.sp.trail));
    }
    var src = raw.join(" ");
    var retry = function () { if (depth < 3 && b > a) splitEmit(a, b, depth); };
    if (/\$/.test(src)) return;
    var tailx = words[b].sp.trail, leadx = words[a].sp.lead;
    while (!pmBalanced(src) && /^[)\]}]/.test(tailx)) { src += tailx[0]; tailx = tailx.slice(1); }
    // MATH-RESIDUE-3: a run whose first word lost its "(" ("(1 - p^{-s})^{-1}") takes it back when that balances the run.
    if (!pmBalanced(src) && /\($/.test(leadx) && pmBalanced("(" + src)) { src = "(" + src; leadx = leadx.slice(0, -1); }
    if (!pmBalanced(src)) return retry();
    var tex;
    try { tex = pmToTex(src); } catch (e) { return retry(); }
    if (!tex || /[^\x00-\x7f]/.test(tex) || /\\/.test(src.replace(/\\([_*#])/g, "$1")) || !pmScriptsOk(tex) || /[\u0000-\u0008]/.test(tex) || !pmBalanced(tex) || /\\[^a-zA-Z,;:!%#&{} ]|[\u0300-\u036f]/.test(tex.replace(/\\(?=[A-Za-z,;:!%#&{}\\ ])/g, ""))) return retry();
    var token = save(tex, src);
    // replace in res: first word gets lead + token + ... last word's trail kept
    var fw = words[a], lw = words[b];
    res[fw.idx] = leadx + token + tailx;
    for (var z = fw.idx + 1; z <= lw.idx; z++) res[z] = "";
    n++;
  }
  var a = -1;
  for (var j = 0; j <= words.length; j++) {
    var kd = j < words.length ? words[j].kind : "break";
    if (kd === "break") { if (a >= 0) { emit(a, j - 1); a = -1; } }
    else if (a < 0) a = j;
    // 3.9.7: emphasis markers never go inside math. A word opening "*"/"**" starts a new run (its marker stays outside);
    // a word followed by "**" ends the run ("**Step 1:** D_C = 2" and "= **441 detectors**" kept their bold).
    else if (j < words.length && a < j && /\*/.test(words[j].sp.lead)) { emit(a, j - 1); a = j; }
    // a word with trailing sentence punctuation ends the run after itself
    if (j < words.length && kd !== "break" && /[.;:!?]$|\*\*/.test(words[j].sp.trail) ) { if (a >= 0) { emit(a, j); a = -1; } }
  }
  if (stats) stats.n = n;
  return res.join("").replace(/\u0001(\d+)\u0001/g, function (m, i) { return keep[+i]; });
}

function pmScriptsOk(tex) {
  var i = 0, n = tex.length, used = { _: false, "^": false };
  function skipArg(j) {
    while (tex[j] === " ") j++;
    if (tex[j] === "{") { var d = 0; for (; j < n; j++) { if (tex[j] === "{") d++; else if (tex[j] === "}") { d--; if (d === 0) return j + 1; } } return n; }
    // MATH-RESIDUE-2: a command's brace argument belongs to it ("_\\mathrm{Zp}_{1}" is a double subscript).
    if (tex[j] === "\\") { j++; while (j < n && /[A-Za-z]/.test(tex[j])) j++; if (tex[j] === "{") { var e = 0; for (; j < n; j++) { if (tex[j] === "{") e++; else if (tex[j] === "}") { e--; if (e === 0) return j + 1; } } return n; } return j; }
    return j + 1;
  }
  while (i < n) {
    var c = tex[i];
    if (c === "_" || c === "^") {
      if (used[c]) return false;
      used[c] = true; i = skipArg(i + 1);
      var k = i; while (tex[k] === " ") k++;
      if (tex[k] !== "_" && tex[k] !== "^") { used._ = false; used["^"] = false; }
      continue;
    }
    if (c !== " ") { used._ = false; used["^"] = false; }
    i++;
  }
  return true;
}
function _mdInline(t) {
  t = String(t || "");
  var _math = [];
  function saveMath(c, disp) {
    // 3.9.7: the display flag is a control character; a "D" prefix turned every formula starting with D ("D_C = 2") into "$$_C = 2$$".
    _math.push((disp ? "\u0002" : "") + c);
    return "M" + (_math.length - 1) + "";
  }
  __name(saveMath, "saveMath");
  __name2(saveMath, "saveMath");
  __name22(saveMath, "saveMath");
  __name222(saveMath, "saveMath");
  __name2222(saveMath, "saveMath");
  t = t.replace(/\$\$([^\n$]+?)\$\$/g, function(m, c) {
    return saveMath(c, true);
  });
  t = t.replace(/([^\s$])\$\$(?=[\^_])/g, "$1");
  t = t.replace(/(?<!\\)\$((?=\s*\d)(?:\\[^\n]|[^$\n\\])+?(?=\$(?!\d))|(?!\s*\d)(?:\\[^\n]|[^$\n\\])+?)\$/g, function(m, c) {
    return saveMath(c, false);
  });
  t = t.replace(/\\\(([^\n]*?)\\\)/g, function(m, c) {
    return saveMath(c, false);
  });
  t = pseudoMath(t, function(tex) {
    return saveMath(tex, false);
  });
  // MATH-ESCAPE-1 (3.9.7): markdown backslash escapes in running text ("k\_B", "\|", "\*") print the character, not the
  // backslash (ostrowski-dimensionless-reformulation showed "k\_B" 196 times). They are held in private-use code points
  // until the end so an escaped _ or * opens no emphasis; < > & " are not in the set, so restoring after esc() is safe.
  t = t.replace(/\\([\\`*_{}\[\]()#+.!|~^-])/g, function(m, c) {
    return String.fromCharCode(57344 + c.charCodeAt(0));
  });
  t = esc(t).replace(/\$/g, "\u0007");
  // MATH-RESIDUE-3 (3.11.2): a link target may hold one level of balanced parentheses ("..._(Dourmashkin)/03..."), as in
  // CommonMark; the first ")" no longer ends the target and spills the rest of the URL into the text.
  t = t.replace(/!\[([^\]]*)\]\(((?:[^()]|\([^()]*\))+)\)/g, '<img src="$2" alt="$1">');
  t = t.replace(/\[([^\]]+)\]\(((?:[^()]|\([^()]*\))+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*\*(?=\S)([^*]+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(?<![\w)\]*])\*\*(?=\S)((?:[^*]|\*(?!\*))+?)\*\*(?![\w(])/g, "<strong>$1</strong>");
  t = t.replace(/(?<![\p{L}\p{N}\\])__(?=\S)([^_\n]+?)__(?![\p{L}\p{N}])/gu, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  t = t.replace(/(?<![\p{L}\p{N}\\_])_(?=\S)([^_\n]+?)_(?![\p{L}\p{N}_])/gu, "<em>$1</em>");
  t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  var _bt = String.fromCharCode(96);
  t = t.replace(new RegExp(_bt + "([^" + _bt + "]+)" + _bt, "g"), "<code>$1</code>");
  t = t.replace(/\u0003M(\d+)\u0003/g, function(m, i) {
    var c = _math[+i];
    var disp = c.charAt(0) === "\u0002";
    return (disp ? "$$" : "$") + texSafe(disp ? c.slice(1) : c) + (disp ? "$$" : "$");
  });
  return t.replace(/\u0007/g, '<span class="usd">$</span>').replace(/[\ue000-\ue07f]/g, function(c) {
    return String.fromCharCode(c.charCodeAt(0) - 57344);
  });
}
__name(_mdInline, "_mdInline");
__name2(_mdInline, "_mdInline");
__name22(_mdInline, "_mdInline");
__name222(_mdInline, "_mdInline");
__name2222(_mdInline, "_mdInline");
function fixMojibake(s) {
  if (!s) return "";
  const map = [
    ["\xE2\u20AC\u2122", "\u2019"],
    // '  right single quote
    ["\xE2\u20AC\u0153", "\u201C"],
    // "  left double quote
    ["\xE2\u20AC\x9D", "\u201D"],
    // "  right double quote
    ["\xE2\u20AC\u201C", "\u2013"],
    // -  en dash
    ["\xE2\u20AC\u201D", "\u2014"],
    // -- em dash
    ["\xE2\u20AC\u02DC", "\u2018"],
    // '  left single quote
    ["\xE2\u20AC\xA6", "\u2026"],
    // ... ellipsis
    ["\xC3\u2014", "\xD7"],
    // x  multiplication sign
    ["\xC3\u2013", "\xD7"],
    // x  multiplication sign (alt)
    ["\xE2\u2020\u2019", "\u2192"],
    // -> arrow
    ["\xC2\xB3", "\xB3"],
    // 3  superscript three
    ["\xE2\x81\xB4", "\u2074"],
    // 4  superscript four
    ["\xE2\x81\xB6", "\u2076"],
    // 6  superscript six
    ["\xC2\xB2", "\xB2"],
    // 2  superscript two
    ["\xC2\xB9", "\xB9"],
    // 1  superscript one
    ["\xC2\xB1", "\xB1"],
    // +/- plus-minus
    ["\xC2\xB0", "\xB0"]
    // deg degree
  ];
  let out = s;
  for (const [bad, good] of map) {
    if (out.indexOf(bad) !== -1) out = out.split(bad).join(good);
  }
  return out;
}
__name(fixMojibake, "fixMojibake");
__name2(fixMojibake, "fixMojibake");
__name22(fixMojibake, "fixMojibake");
__name222(fixMojibake, "fixMojibake");
__name2222(fixMojibake, "fixMojibake");
__name22222(fixMojibake, "fixMojibake");
__name222222(fixMojibake, "fixMojibake");
__name2222222(fixMojibake, "fixMojibake");
__name22222222(fixMojibake, "fixMojibake");
function renderMarkdown(md) {
  if (!md) return "";
  var m = String(md).replace(/\r\n?/g, "\n");
  var mb = [], mi = [], L, o = "", i;
  m = m.replace(/^[ \t]*@[A-Za-z0-9_:-]+:[ \t]*$/gm, "");
  m = m.replace(/\[[@][A-Za-z0-9_:-]+(?:[ \t;,]+[@A-Za-z0-9_:-]+)*\]/g, "");
  m = m.replace(/(^|[^A-Za-z0-9_])@[A-Za-z][A-Za-z0-9_:-]+/g, "$1");
  var _bt2 = String.fromCharCode(96);
  // PANDOC-CODE-1 (3.8.5): code exported by pandoc without fences keeps a "[](#cb1-25)" anchor on every line; those runs
  // are code (their ** is exponentiation, not bold), so they become one fenced block with the anchors removed.
  m = m.replace(/(?:^\[\]\(#cb\d+-\d+\)[^\n]*(?:\n|$))+/gm, function(run) {
    return "\n" + _bt2 + _bt2 + _bt2 + "\n" + run.replace(/^\[\]\(#cb\d+-\d+\)/gm, "").replace(/\n*$/, "\n") + _bt2 + _bt2 + _bt2 + "\n";
  });
  var _fence = new RegExp(_bt2 + _bt2 + _bt2 + "(\\w*)\\n([\\s\\S]*?)" + _bt2 + _bt2 + _bt2, "g");
  m = m.replace(_fence, function(_, l2, c) {
    mb.push("<pre" + (l2 ? ' class="lang-' + l2 + '"' : "") + "><code>" + esc(c) + "</code></pre>");
    return "B" + mb.length + "";
  });
  // RENDER-FIX-3 (3.9.1): heading markers glued to the previous line are split off only outside code (this ran before
  // fence extraction and moved Python comments in fenced and pandoc-anchored code onto lines of their own, where they
  // became headings), never inside a table row ("| Crossing # $n$ |") or inline code, and also when the marker ends the
  // line. A bare marker followed by a bold line is that heading ("##" / "**Abstract**"); a bare marker alone is dropped.
  m = m.replace(/([^\n])[ \t]+(---)[ \t]*(?=\n)/g, "$1\n$2\n");
  m = m.split("\n").map(function(line) {
    var tl = line.trim();
    if (tl.charAt(0) === "|" || (tl.match(/\|/g) || []).length >= 2) return line;
    return line.replace(/([^\n|])[ \t]+(#{1,6})(?=[ \t]|$)/g, function(all, pre, hs, off) {
      return ((line.slice(0, off).split(String.fromCharCode(96)).length - 1) % 2) ? all : pre + "\n" + hs;
    });
  }).join("\n");
  m = m.replace(/^(#{1,6})[ \t]*\n[ \t]*\*\*((?:[^*\n]|\*(?!\*)|\n(?![ \t]*\n))+?)\*\*[ \t]*/gm, function(all, hs, t) {
    return hs + " " + t.replace(/\s+/g, " ").trim() + "\n\n";
  });
  // A heading whose bold runs onto the next lines ("###### **1.4.1.1. Legitimate" / "Invalidation ... Model** text") is
  // joined up to the closing **; the rest of that line starts the paragraph.
  m = m.replace(/^(#{1,6}[ \t]+(?:[^*\n]|\*(?!\*))*)\*\*((?:[^*\n]|\*(?!\*))*\n(?:[^*\n]|\*(?!\*)|\n(?![ \t]*\n))*?)\*\*[ \t]*/gm, function(all, h, t) {
    return h + "**" + t.replace(/\s+/g, " ").trim() + "**\n\n";
  });
  m = m.replace(/^[ \t]*#{1,6}[ \t]*$/gm, "");
  // HEADING-WRAP-1 (3.8.5): a heading wrapped onto the next line ("# **Appendix A: Formal Proof of Emergent Temporal" /
  // "dynamics**") left an unclosed ** in the heading and a stray one in the text; the continuation is joined back.
  m = m.replace(/^(#{1,6}[ \t][^\n]*)\n([^\n#|][^\n]*)$/gm, function(all, h, nx) {
    return (h.split("**").length - 1) % 2 === 1 && nx.indexOf("**") >= 0 ? h + " " + nx.trim() : all;
  });
  // MATH-ESCAPE-1 (3.9.7, #1935): pandoc exported math as "[\\(x\_1\\)]{.math .inline}" and "[\\\[...\\\]]{.math .display}",
  // with the delimiters and the TeX ^ _ * \ escaped for markdown. The renderer printed "[\", "]{.math .inline}" and a
  // trailing backslash that broke every formula (compton-ontology-bt-coordinates: 101 spans; bqnn-classical-baseline uses
  // bare "\\(...\\)"). Such spans become math with the markdown escapes removed.
  var _mdUnesc = function(c) {
    return c.replace(/\\([\\^_*\[\]])/g, "$1");
  };
  m = m.replace(/\[\\\\\\\[([\s\S]*?)\\\\\\\]\]\{\.math\s*\.display\}/g, function(_, c) {
    mb.push('<div class="math-display">$$' + texSafe(_mdUnesc(c)) + "$$</div>");
    return "\n\u0001B" + mb.length + "\u0001\n";
  });
  m = m.replace(/\[\\\\\(((?:[^\n]|\n(?![ \t]*\n))*?)\\\\\)\]\{\.math\s*\.inline\}|\\\\\(((?:[^\n]|\n(?![ \t]*\n))*?)\\\\\)/g, function(_, a, b) {
    mi.push(_mdUnesc(a != null ? a : b).replace(/[ \t]*\n[ \t]*/g, " "));
    return "\u0001M" + (mi.length - 1) + "\u0001";
  });
  // A formula followed by an escaped or bare script ("$\tilde{x}$\_i") takes the script inside: "{\tilde{x}}_{i}".
  // Only a short formula with no space, opened after a space or punctuation, so a closing $ is never taken for an opening one.
  m = m.replace(/(?<![\\$A-Za-z0-9])\$([\\A-Za-z0-9{(|][^$\s]{0,59})\$\\?([_^])(\{[^{}\n]{1,30}\}|[A-Za-z0-9])(?![A-Za-z0-9_])/g, function(all, c, op, sc) {
    return "${" + c + "}" + op + (sc.charAt(0) === "{" ? sc : "{" + sc + "}") + "$";
  });
  m = m.replace(/([^\s$])\$\$(?=[\^_])/g, "$1").replace(/([^\s$])\$\$(?=[\\A-Za-z0-9{(])/g, "$1$ $");
  m = m.replace(/\$\$([\s\S]*?)\$\$/g, function(_, c) {
    // MATH-ESCAPE-1: "$$ \[ ... \] $$" and "$$ $...$ $$" carried a second set of delimiters inside display math.
    c = c.replace(/^\s*\\\[([\s\S]*)\\\]\s*$/, "$1").replace(/^\s*\$([^$]+)\$\s*$/, "$1");
    mb.push('<div class="math-display">$$' + texSafe(c) + "$$</div>");
    return "B" + mb.length + "";
  });
  m = m.replace(/\\\[([\s\S]*?)\\\]/g, function(_, c) {
    c = c.replace(/^\s*\$([^$]+)\$\s*$/, "$1");
    mb.push('<div class="math-display">$$' + texSafe(c) + "$$</div>");
    return "B" + mb.length + "";
  });
  m = m.replace(/(?<!\\)\$((?=\s*\d)(?:\\[^\n]|[^$\n\\])+?(?=\$(?!\d))|(?!\s*\d)(?:\\[^\n]|[^$\n\\])+?)\$/g, function(_, c) {
    mi.push(c);
    return "M" + (mi.length - 1) + "";
  });
  m = m.replace(/\\\(((?:[^\n]|\n(?![ \t]*\n))*?)\\\)/g, function(_, c) {
    c = c.replace(/[ \t]*\n[ \t]*/g, " ");
    mi.push(c);
    return "M" + (mi.length - 1) + "";
  });
  m = m.replace(/\\\$/g, "\x07");
  function isTableSep(s) {
    // TABLE-SEP-1 (3.8.2): any GFM delimiter row, e.g. "|:--|:---|" (the old test needed 3 dashes in the first cell,
    // so 32 papers printed their tables as raw pipes). Every cell is :?-+:? and the row has at least 3 dashes.
    var t = String(s || "").trim();
    if (t.indexOf("|") < 0 || (t.match(/-/g) || []).length < 3) return false;
    var cells = t.replace(/^\|/, "").replace(/\|$/, "").split("|");
    for (var c = 0; c < cells.length; c++) if (!/^\s*:?-+:?\s*$/.test(cells[c])) return false;
    return true;
  }
  __name(isTableSep, "isTableSep");
  __name2(isTableSep, "isTableSep");
  __name22(isTableSep, "isTableSep");
  __name222(isTableSep, "isTableSep");
  __name2222(isTableSep, "isTableSep");
  function emitBlockText(text) {
    var parts = text.split(/(\u0001B\d+\u0001)/g), h = "", cur = "", k;
    for (k = 0; k < parts.length; k++) {
      var p = parts[k], tm = /^\u0001B(\d+)\u0001$/.exec(p);
      if (tm) {
        if (cur.trim()) {
          h += "<p>" + _mdInline(cleanPunct(cur)) + "</p>";
          cur = "";
        }
        h += mb[+tm[1] - 1] + "\n";
      } else cur += p;
    }
    if (cur.trim()) h += "<p>" + _mdInline(cleanPunct(cur)) + "</p>";
    return h;
  }
  __name(emitBlockText, "emitBlockText");
  __name2(emitBlockText, "emitBlockText");
  __name22(emitBlockText, "emitBlockText");
  __name222(emitBlockText, "emitBlockText");
  __name2222(emitBlockText, "emitBlockText");
  function isListStart(s) {
    return /^[-*+]\s/.test(s) || /^\d+[.)]\s/.test(s);
  }
  __name(isListStart, "isListStart");
  __name2(isListStart, "isListStart");
  __name22(isListStart, "isListStart");
  __name222(isListStart, "isListStart");
  __name2222(isListStart, "isListStart");
  function isContinuation(s) {
    return /^[ \t]+\S/.test(s);
  }
  __name(isContinuation, "isContinuation");
  __name2(isContinuation, "isContinuation");
  __name22(isContinuation, "isContinuation");
  __name222(isContinuation, "isContinuation");
  __name2222(isContinuation, "isContinuation");
  // FLAT-TABLE-1 (3.9.1): pandoc flattened about 240 docx tables in 77 papers into paragraphs of "cell |" lines, one
  // paragraph per row ("Scenario |" / "Fab Yield |" ...), which printed as prose full of pipes. A run of at least two
  // such paragraphs whose body rows have the same number of cells (2 or more) is a table; the first is its header.
  function ftPara(k) {
    var ls = [];
    while (k < L.length && L[k].trim() && !/^#{1,6}\s/.test(L[k].trim()) && !/^\u0001B\d+\u0001$/.test(L[k].trim())) {
      ls.push(L[k].trim());
      k++;
    }
    return { lines: ls, end: k };
  }
  function ftCells(ls) {
    if (!ls.length || ls[0].charAt(0) === "|" || !/\|$/.test(ls[ls.length - 1])) return null;
    return ls.join(" ").split("|").map(function(x) {
      return x.trim();
    }).filter(function(x) {
      return x;
    });
  }
  function ftSkip(k) {
    while (k < L.length && (!L[k].trim() || L[k].trim() === "|")) k++;
    return k;
  }
  function flatTableAt(k0) {
    var p = ftPara(k0), c = ftCells(p.lines);
    if (!c || c.length < 2) return null;
    var rows = [c], k = ftSkip(p.end);
    while (k < L.length) {
      var q = ftPara(k), qc = ftCells(q.lines);
      if (!qc || qc.length < 2) break;
      if (rows.length > 1 && qc.length !== rows[1].length) break;
      if (rows.length === 1 && Math.abs(qc.length - c.length) > 1) break;
      rows.push(qc);
      k = ftSkip(q.end);
    }
    if (rows.length < 2) return null;
    var n = rows[1].length, hdr = rows[0].slice(0, n), h = "<table><thead><tr>", r, x;
    while (hdr.length < n) hdr.push("");
    for (x = 0; x < n; x++) h += "<th>" + _mdInline(cleanPunct(hdr[x])) + "</th>";
    h += "</tr></thead><tbody>";
    for (r = 1; r < rows.length; r++) {
      h += "<tr>";
      for (x = 0; x < n; x++) h += "<td>" + _mdInline(cleanPunct(rows[r][x])) + "</td>";
      h += "</tr>";
    }
    return { html: h + "</tbody></table>\n", next: k };
  }
  L = m.split("\n");
  i = 0;
  while (i < L.length) {
    var l = L[i], t = l.trim();
    if (!t) {
      i++;
      continue;
    }
    var bm = /^\u0001B(\d+)\u0001$/.exec(t);
    if (bm) {
      o += mb[+bm[1] - 1] + "\n";
      i++;
      continue;
    }
    var hm = /^(#{1,6})\s+(.+)/.exec(t);
    if (hm) {
      o += "<h" + hm[1].length + ">" + _mdInline(cleanPunct(hm[2])) + "</h" + hm[1].length + ">\n";
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      o += "<hr>\n";
      i++;
      continue;
    }
    if (t.charAt(0) === ">") {
      var q = "";
      while (i < L.length && L[i].trim().charAt(0) === ">") {
        var qt = L[i].trim().replace(/^>\s?/, "");
        q += (q ? " " : "") + qt;
        i++;
      }
      o += "<blockquote><p>" + _mdInline(cleanPunct(q)) + "</p></blockquote>\n";
      continue;
    }
    if (t.indexOf("|") >= 0) {
      var si = i + 1;
      while (si < L.length && L[si].trim() === "") si++;
      if (si < L.length && isTableSep(L[si].trim())) {
        var sepCols = L[si].trim().split("|").map(function(x) {
          return x.trim();
        }).filter(function(x) {
          return x;
        }).length || 1;
        var hdrCells = t.split("|").map(function(x) {
          return x.trim();
        }).filter(function(x) {
          return x;
        });
        var prefixProse = "";
        if (t.trim().charAt(0) !== "|" && hdrCells.length > sepCols) {
          var cutAt = t.indexOf("|");
          prefixProse = t.slice(0, cutAt).trim();
          hdrCells = hdrCells.slice(hdrCells.length - sepCols);
        } else if (hdrCells.length > sepCols) {
          hdrCells = hdrCells.slice(0, sepCols);
        }
        o += "<table><thead><tr>";
        for (var hc = 0; hc < hdrCells.length; hc++) o += "<th>" + _mdInline(cleanPunct(hdrCells[hc])) + "</th>";
        o += "</tr></thead><tbody>";
        i = si + 1;
        var tailProse = "";
        while (i < L.length) {
          if (L[i].trim() === "") {
            i++;
            continue;
          }
          var lc = L[i], lct = lc.trim();
          if (isListStart(lct) || /^(#{1,6})\s/.test(lct) || /^\u0001B\d+\u0001$/.test(lct) || lct.charAt(0) === ">" || lct.indexOf("|") < 0) break;
          var segs = lc.trim().split("|");
          if (segs.length && segs[0].trim() === "") segs.shift();
          if (segs.length && segs[segs.length - 1].trim() === "") segs.pop();
          var cs = segs.map(function(x) {
            return x.trim();
          });
          if (cs.length > sepCols) {
            var used = 0, cutIdx = segs.length - 1, k2;
            for (k2 = 0; k2 < segs.length; k2++) {
              if (segs[k2].trim() !== "") {
                used++;
                if (used === sepCols) {
                  cutIdx = k2;
                  break;
                }
              }
            }
            cs = segs.slice(0, cutIdx + 1).map(function(x) {
              return x.trim();
            }).filter(function(x) {
              return x;
            });
            tailProse = segs.slice(cutIdx + 1).join("|").trim();
          }
          o += "<tr>";
          for (var c3 = 0; c3 < cs.length; c3++) o += "<td>" + _mdInline(cleanPunct(cs[c3])) + "</td>";
          for (var pd = cs.length; pd < sepCols; pd++) o += "<td></td>";
          o += "</tr>";
          i++;
          if (tailProse) break;
        }
        o += "</tbody></table>\n";
        if (prefixProse) o += "<p>" + _mdInline(cleanPunct(prefixProse)) + "</p>\n";
        if (tailProse) o += "<p>" + _mdInline(cleanPunct(tailProse)) + "</p>\n";
        continue;
      }
    }
    var ft = flatTableAt(i);
    if (ft) {
      o += ft.html;
      i = ft.next;
      continue;
    }
    if (isListStart(t)) {
      var ordered = /^\d+[.)]\s/.test(t);
      o += ordered ? "<ol>" : "<ul>";
      var inItem = false, itemText = "";
      while (i < L.length) {
        var liRaw = L[i];
        if (!liRaw.trim()) break;
        var lit = liRaw.trim();
        var mList = /^([-*+]|\d+[.)])\s+(.*)$/.exec(lit);
        if (mList) {
          if (inItem) {
            o += "<li>" + _mdInline(cleanPunct(itemText)) + "</li>";
            itemText = "";
          }
          itemText = mList[2];
          inItem = true;
          i++;
        } else if (inItem && !/^\|?[\s:]* -{3,}/.test(lit) && !isTableSep(lit) && (isContinuation(liRaw) || !(/^#{1,6}\s/.test(lit) || /^(-{3,}|\*{3,}|_{3,})$/.test(lit) || lit.charAt(0) === ">" || (lit.indexOf("|") >= 0 && i + 1 < L.length && isTableSep(L[i + 1].trim())) || /^\u0001B\d+\u0001$/.test(lit)))) {
          itemText += " " + lit;
          i++;
        } else break;
      }
      if (inItem) o += "<li>" + _mdInline(cleanPunct(itemText)) + "</li>";
      o += ordered ? "</ol>" : "</ul>";
      o += "\n";
      continue;
    }
    var para = [];
    while (i < L.length) {
      var pl = L[i], pt = pl.trim();
      if (!pt) break;
      if (/^(#{1,6})\s/.test(pt)) break;
      if (isListStart(pt) && !(para.length && (para.join(" ").split("**").length - 1) % 2 === 1)) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(pt)) break;
      if (pt.charAt(0) === ">") break;
      if (/^\u0001B\d+\u0001$/.test(pt)) break;
      if (pt.indexOf("|") >= 0 && i + 1 < L.length && isTableSep(L[i + 1].trim())) break;
      para.push(pt);
      i++;
    }
    if (para.length) {
      var pj = para.join(" ");
      if ((pj.match(/\|/g) || []).length === 1 && /\s\|$/.test(pj)) pj = pj.replace(/\s*\|$/, "");
      if (pj.trim() === "|" || !pj.trim()) continue;
      if ((pj.split("**").length - 1) % 2 === 1) {
        if (/^\*\*\S/.test(pj)) pj = pj + "**";
        else if (/\S\*\*[.,;:!?)]*$/.test(pj)) pj = "**" + pj;
      }
      o += emitBlockText(cleanPunct(pj)) + "\n";
    } else {
      i++;
    }
  }
  o = o.replace(/\u0001M(\d+)\u0001/g, function(mm, n) {
    return "$" + texSafe(mi[+n]) + "$";
  });
  o = o.replace(/\u0007/g, '<span class="usd">$</span>');
  o = o.replace(/\u0001B(\d+)\u0001/g, function(mm, n) {
    return mb[+n - 1] || "";
  });
  return o;
}
__name(renderMarkdown, "renderMarkdown");
__name2(renderMarkdown, "renderMarkdown");
__name22(renderMarkdown, "renderMarkdown");
__name222(renderMarkdown, "renderMarkdown");
__name2222(renderMarkdown, "renderMarkdown");
var LD_CSS = `
.ld-top{display:flex;align-items:center;gap:1.2rem;max-width:920px;margin:0 auto;padding:1rem 1.6rem;border-bottom:1px solid var(--border)}
.ld-brand{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:1.18rem;color:var(--ink);text-decoration:none;display:inline-flex;align-items:center;gap:.5rem}
.ld-nav{margin-left:auto;display:flex;gap:.3rem;flex-wrap:wrap}
.ld-nav a{color:var(--muted);font-size:.85rem;font-weight:500;text-decoration:none;padding:.3rem .55rem;border-radius:6px;transition:all .15s}
.ld-nav a:hover{color:var(--accent);background:var(--accent-soft)}
.ld-main{max-width:920px;margin:0 auto;padding:0 1.6rem 3.2rem}
.ld-hero{text-align:center;padding:4rem 0 2.2rem}
.ld-tag{display:inline-block;font-size:.7rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:.9rem}
.ld-hero h1{font-family:'Fraunces',Georgia,serif;font-size:3rem;font-weight:600;margin:0 0 .8rem;letter-spacing:-.015em;border:none;padding:0}
.ld-hero p{color:var(--muted);font-size:1.06rem;max-width:620px;margin:0 auto;line-height:1.7}
.ld-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin-top:1.4rem}
.ld-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem 1.3rem;display:block;color:var(--ink);text-decoration:none;transition:all .15s}
.ld-card:hover{border-color:var(--accent);transform:translateY(-1px)}
.ld-card h3{font-family:'Fraunces',Georgia,serif;font-size:1.06rem;font-weight:600;margin:0 0 .3rem}
.ld-card p{margin:0;font-size:.85rem;color:var(--muted);line-height:1.55}
.ld-go{display:block;margin-top:.55rem;font-size:.78rem;color:var(--accent)}
.ld-latest{margin-top:2.8rem;border-top:1px solid var(--border);padding-top:1.5rem}
.ld-latest h2{font-family:'Fraunces',Georgia,serif;font-size:1.25rem;font-weight:600;margin:0 0 .35rem}
.ld-latest ul{list-style:none;padding:0;margin:.4rem 0 0}
.ld-latest li{display:flex;gap:1rem;align-items:baseline;padding:.6rem 0;border-bottom:1px solid var(--border)}
.ld-latest li a{flex:1;color:var(--ink);text-decoration:none;font-family:'Fraunces',Georgia,serif;font-size:1rem;line-height:1.45}
.ld-latest li a:hover{color:var(--accent)}
.ld-date{color:var(--muted);font-size:.76rem;white-space:nowrap}
.ld-more{margin:.9rem 0 0;text-align:center}
.ld-selected ol{list-style:none;padding:0;margin:.4rem 0 0}
.ld-selected li{display:flex;flex-direction:column;gap:.15rem;padding:.65rem 0;border-bottom:1px solid var(--border)}
.ld-selected li>a{color:var(--ink);text-decoration:none;font-family:'Fraunces',Georgia,serif;font-size:1.02rem;line-height:1.45}
.ld-selected li>a:hover{color:var(--accent)}
.ld-selected .ld-date a{color:var(--muted)}
.ld-sel-note{color:var(--muted);font-size:.84rem;margin:.3rem 0 .4rem}
.ld-byline{color:var(--muted);font-size:.9rem;margin:.9rem auto 0}
.ld-more a{font-size:.86rem;color:var(--accent);text-decoration:none}
.ld-sub{margin-top:3rem;padding:1.9rem 1.6rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg)}
.ld-sub h2{font-family:'Fraunces',Georgia,serif;font-size:1.25rem;font-weight:600;margin:0 0 .5rem}
.ld-sub p{color:var(--muted);font-size:.92rem;line-height:1.7;margin:0 0 1.1rem;max-width:640px}
.ld-sub form{display:flex;gap:.6rem;flex-wrap:wrap}
.ld-sub input[type=email]{flex:1;min-width:220px;padding:.65rem .85rem;border:1.5px solid var(--border);border-radius:var(--radius);font:inherit;font-size:.95rem;background:#fff;color:var(--ink);outline:none}
.ld-sub input[type=email]:focus{border-color:var(--accent)}
.ld-sub button{padding:.65rem 1.3rem;border:1.5px solid var(--accent);background:var(--accent);color:#fff;border-radius:var(--radius);font:inherit;font-size:.92rem;font-weight:500;cursor:pointer;transition:all .15s}
.ld-sub button:hover{background:#1a2547;border-color:#1a2547}
.ld-sub button:disabled{opacity:.6;cursor:default}
.ld-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.ld-sr{position:absolute;left:-9999px}
.ld-msg{font-size:.86rem;margin:.75rem 0 0;min-height:1.2em}
.ld-msg.ok{color:var(--live)}
.ld-msg.err{color:#a4453c}
.ld-foot{max-width:920px;margin:0 auto;padding:1.4rem 1.6rem 2.4rem;border-top:1px solid var(--border);display:flex;gap:1.2rem;justify-content:center;flex-wrap:wrap;font-size:.78rem;color:var(--muted)}
.ld-foot a{color:var(--muted);text-decoration:none}
.ld-foot a:hover{color:var(--accent)}
@media(max-width:640px){.ld-top{flex-wrap:wrap}.ld-nav{margin-left:0;width:100%}.ld-hero h1{font-size:2.35rem}.ld-hero{padding:3rem 0 1.8rem}}
`;
// HOME-IDENTITY-1 (STRATEGY 2.2, 2.4, 2.5, 10): one identity on qnfo.org. The person is the author of record
// (Rowan Brad Quni-Gudzinas, ORCID 0009-0002-4317-5604); QNFO is the imprint. The home page leads with the selected
// works (STRATEGY 2.4, exactly these seven), never with a corpus count, QWAV or physics headlines.
var OWNER_ORCID = "0009-0002-4317-5604";
var SELECTED_WORKS = [
  { t: "The Joules-per-Solution Metric: Definition, Measurement Protocol, and Anti-Gaming Provisions", slug: "joules-per-solution-metric", pillar: "Energy-honest computing" },
  { t: "Error Correction Is a Landauer Machine: The Thermodynamic Floor of QEC Overhead", slug: "jpcub-qec-landauer", pillar: "Energy-honest computing" },
  { t: "JPCUB Competitive Landscape v2.0 (17 platforms)", slug: "jpcub-competitive-landscape", pillar: "Energy-honest computing" },
  { t: "Joules-per-Solution for Stochastic and Agentic Inference (LLMs)", slug: "jpcub-llm-energy", pillar: "Energy-honest computing" },
  { t: "The Universal Ignorance Audit", slug: "universal-ignorance-audit", pillar: "Epistemics of AI-assisted science" },
  { t: "Epistemic Legibility in AI-Assisted Science", slug: "ai4metascience-ignorance-audit", pillar: "Epistemics of AI-assisted science" },
  { t: "Operating the Quniverse Fleet: Objectives, Successes, Failures, Roadmap", slug: "quniverse-fleet-lessons", pillar: "Autonomous research operations" }
];
function workHref(w) { return "https://papers.qnfo.org/papers/" + w.slug; }
// opts (WORK-WITH-ME-1): person/page add properties to those nodes, nodes appends more @graph entries.
function identityJsonLd(pageUrl, opts) {
  opts = opts || {};
  const person = { "@type": "Person", "@id": "https://qnfo.org/#person", name: "Rowan Brad Quni-Gudzinas", alternateName: ["Brad Gudzinas", "Bradley Gudzinas", "Rowan Quni"], url: "https://qnfo.org/about", identifier: "https://orcid.org/" + OWNER_ORCID, sameAs: ["https://orcid.org/" + OWNER_ORCID], affiliation: { "@id": "https://qnfo.org/#org" }, jobTitle: "Research systems builder" };
  Object.assign(person, opts.person || {});
  const org = { "@type": "Organization", "@id": "https://qnfo.org/#org", name: "QNFO", url: "https://qnfo.org", description: "QNFO (independent research): the independent research imprint that publishes the work of Rowan Brad Quni-Gudzinas.", founder: { "@id": "https://qnfo.org/#person" } };
  const site = { "@type": "WebSite", "@id": "https://qnfo.org/#site", url: "https://qnfo.org", name: "QNFO", publisher: { "@id": "https://qnfo.org/#org" } };
  const page = Object.assign({ "@type": "WebPage", url: pageUrl, isPartOf: { "@id": "https://qnfo.org/#site" }, about: { "@id": "https://qnfo.org/#person" } }, opts.page || {});
  return '<script type="application/ld+json">' + JSON.stringify({ "@context": "https://schema.org", "@graph": [person, org, site, page].concat(opts.nodes || []) }).replace(/</g, "\\u003c") + "<\/script>";
}
function selectedWorksHTML() {
  return '<section class="ld-latest ld-selected" id="selected-works" aria-labelledby="ld-sel-h"><h2 id="ld-sel-h">Selected works</h2><p class="ld-sel-note">The works QNFO leads with; the full library is on <a href="/papers">papers.qnfo.org</a>.</p><ol>' + SELECTED_WORKS.map(
    (w) => '<li><a href="' + workHref(w) + '">' + esc(w.t) + '</a><span class="ld-date">' + esc(w.pillar) + "</span></li>"
  ).join("") + '</ol><p class="ld-sel-note">Quni-Gudzinas, R. B. Published by QNFO. Prepared with an AI-assisted research pipeline; the author is responsible for the content.</p></section>';
}
function renderHubHTML(recentPapers, paperCount, nodesCount = 0) {
  const pillars = [
    { t: "Energy-honest computing", d: "What a correct answer costs in joules, across quantum processors, HPC and AI inference.", w: [0, 1, 2, 3] },
    { t: "Epistemics of AI-assisted science", d: "What an AI-assisted claim is worth, and how to audit what a model does not know.", w: [4, 5] },
    { t: "Autonomous research operations", d: "What an autonomous research system actually delivers, from its own failure ledger.", w: [6] }
  ];
  const selected = '<section class="q-section" id="selected-works" aria-labelledby="sel-h"><div class="q-wrap"><div class="q-section-head"><h2 class="q-h2" id="sel-h">Selected works</h2><a href="https://papers.qnfo.org/papers">The full library</a></div>' +
    '<div class="q-grid q-grid-3">' + pillars.map(function(p) {
      return '<div><p class="q-eyebrow">' + esc(p.t) + '</p><p class="q-meta" style="margin:0 0 8px">' + esc(p.d) + '</p><ol class="q-list">' + p.w.map(function(i) {
        const w = SELECTED_WORKS[i];
        return '<li class="q-item"><a class="q-item-title" style="font-size:1.0625rem" href="' + workHref(w) + '">' + esc(w.t) + "</a></li>";
      }).join("") + "</ol></div>";
    }).join("") + '</div><p class="q-small" style="margin-top:20px">Quni-Gudzinas, R. B. Published by QNFO. Prepared with an AI-assisted research pipeline; the author is responsible for the content.</p></div></section>';
  let latest = "";
  if (recentPapers && recentPapers.length > 0) {
    latest = '<section class="q-section" aria-labelledby="latest-h"><div class="q-wrap"><div class="q-section-head"><h2 class="q-h2" id="latest-h">Latest papers</h2><a href="https://papers.qnfo.org/papers">Browse the library</a></div><ul class="q-list q-compact" style="max-width:860px">' + recentPapers.slice(0, 6).map(function(p) {
      return '<li class="q-item"><a class="q-item-title" href="https://papers.qnfo.org/papers/' + escAttr(p.slug) + '">' + titleHTML(p.title) + '</a><div class="q-item-meta"><time>' + esc(String(p.created_at || "").slice(0, 10)) + "</time></div></li>";
    }).join("") + "</ul></div></section>";
  }
  const explore = [
    { t: "Ask the corpus", d: "Questions answered from the papers, with citations and the knowledge graph around each answer.", h: "https://ask.qwav.tech/" },
    { t: "Work with me", d: "Energy-per-correct-answer assessments, reviews of AI agent operations, talks, collaboration and roles.", h: "/work-with-me" },
    { t: "Ideas", d: "Research conversations as they develop, with the questions that start them.", h: "https://ideas.qnfo.org/" },
    { t: "Archive", d: "The library by field, feeds and the tools for finding your way through it.", h: "https://archive.qnfo.org/" },
    { t: "iPatent", d: "A free, private-by-default assistant for drafting US provisional patent disclosures.", h: "https://ipatent.qnfo.org/" },
    { t: "License", d: "The QNFO Unified License Agreement: open science with commercial protections.", h: "https://legal.qnfo.org/" }
  ];
  const exploreHtml = '<section class="q-section" aria-labelledby="ex-h"><div class="q-wrap"><h2 class="q-h2" id="ex-h">Explore</h2><div class="q-grid q-grid-3" style="margin-top:8px">' + explore.map(function(c) {
    return '<a class="q-link-card" href="' + c.h + '"><h3>' + c.t + "</h3><p>" + c.d + "</p></a>";
  }).join("") + "</div></div></section>";
  const hero = '<section class="q-hero"><div class="q-wrap q-hero-grid"><div><p class="q-eyebrow">Independent research by Rowan Brad Quni-Gudzinas</p><h1 class="q-display">What computation really costs, and what it delivers.</h1>' +
    '<p class="q-lede">QNFO is the independent research imprint of Rowan Brad Quni-Gudzinas. The work asks what computation really costs and delivers: energy per correct answer (Joules-per-Solution), what an AI-assisted claim is worth (ignorance audits), and what an autonomous research system actually delivers. Corrections ship as new versions of the same paper.</p>' +
    '<div class="q-actions"><a class="q-btn" href="#selected-works">Start with the selected works</a><a class="q-btn q-btn-ghost" href="/work-with-me">Work with me</a></div>' +
    '<p class="q-meta" style="margin-top:18px">Rowan Brad Quni-Gudzinas \u00b7 <a href="https://orcid.org/' + OWNER_ORCID + '">ORCID ' + OWNER_ORCID + '</a> \u00b7 <a href="/about">About</a></p></div>' +
    '<form class="q-panel" action="https://ask.qwav.tech/" method="get" role="search" aria-label="Ask the research corpus"><label class="q-h3" for="hub-q" style="display:block">Ask the corpus</label><p class="q-meta" style="margin:0 0 12px">Answers come from the papers, with citations.</p><div class="q-field"><input id="hub-q" name="q" placeholder="What does JPCUB measure?" autocomplete="off"><button class="q-btn" type="submit">Ask</button></div></form></div></section>';
  const body = hero + selected + latest + exploreHtml + '<div class="q-wrap">' + subscribeBlock("qnfo.org") + "</div>";
  return qdsPage({ title: "QNFO \u2014 independent research by Rowan Brad Quni-Gudzinas", description: "QNFO is the independent research imprint of Rowan Brad Quni-Gudzinas: what computation really costs and delivers, from energy per correct answer (Joules-per-Solution) to what an AI-assisted claim is worth.", canonical: "https://qnfo.org/", jsonld: identityJsonLd("https://qnfo.org/"), rss: true, active: "" }, body);
}
__name(renderHubHTML, "renderHubHTML");
__name2(renderHubHTML, "renderHubHTML");
__name22(renderHubHTML, "renderHubHTML");
__name222(renderHubHTML, "renderHubHTML");
__name2222(renderHubHTML, "renderHubHTML");
__name22222(renderHubHTML, "renderHubHTML");
__name222222(renderHubHTML, "renderHubHTML");
__name2222222(renderHubHTML, "renderHubHTML");
__name22222222(renderHubHTML, "renderHubHTML");
__name222222222(renderHubHTML, "renderHubHTML");
__name2222222222(renderHubHTML, "renderHubHTML");
function renderPaperRow(p) {
  return lpPaperRow(p);
}
__name(renderPaperRow, "renderPaperRow");
__name2(renderPaperRow, "renderPaperRow");
__name22(renderPaperRow, "renderPaperRow");
__name222(renderPaperRow, "renderPaperRow");
__name2222(renderPaperRow, "renderPaperRow");
__name22222(renderPaperRow, "renderPaperRow");
function renderIndexHTML(papers, total, offset, hasMore, activeCategory, searchQuery, extra) {
  return lpIndexHTML(papers, total, offset, hasMore, activeCategory, searchQuery, extra);
}
__name(renderIndexHTML, "renderIndexHTML");
__name2(renderIndexHTML, "renderIndexHTML");
__name22(renderIndexHTML, "renderIndexHTML");
__name222(renderIndexHTML, "renderIndexHTML");
__name2222(renderIndexHTML, "renderIndexHTML");
__name22222(renderIndexHTML, "renderIndexHTML");
__name222222(renderIndexHTML, "renderIndexHTML");
__name2222222(renderIndexHTML, "renderIndexHTML");
__name22222222(renderIndexHTML, "renderIndexHTML");
__name222222222(renderIndexHTML, "renderIndexHTML");
__name2222222222(renderIndexHTML, "renderIndexHTML");
// AUTHOR-OF-RECORD-1 (2026-10-01, docs/STRATEGY.md s2.1): 273 published rows carry a placeholder author ("QNFO Research",
// "QNFO", "QNFO Research Agent", "QNFO Research / QWAV") while their registry records list Quni-Gudzinas, Rowan Brad with
// ORCID 0009-0002-4317-5604. Pages must match the registered record, so placeholders render as the author of record.
var AUTHOR_OF_RECORD = "Rowan Brad Quni-Gudzinas";
var PLACEHOLDER_AUTHOR_RE = /^\s*qnfo(\s+research(\s+agent)?)?(\s*\/\s*qwav)?\s*$/i;
function paperAuthors(paper) {
  const rawAuth = paper.authors || "";
  let authors = [];
  try {
    const p = JSON.parse(rawAuth);
    if (Array.isArray(p)) authors = p.map((a) => typeof a === "object" && a ? a.name || "" : String(a));
  } catch (e) {
    authors = String(rawAuth).split(",").map((st) => st.trim()).filter(Boolean);
  }
  const out = [];
  for (const a of authors) {
    let n = String(a || "").trim();
    if (!n) continue;
    if (PLACEHOLDER_AUTHOR_RE.test(n)) n = AUTHOR_OF_RECORD;
    if (/^quni-gudzinas,\s*rowan brad$/i.test(n)) n = AUTHOR_OF_RECORD;
    if (out.indexOf(n) < 0) out.push(n);
  }
  return out;
}
// LICENSE-ONE-1: the licence URL a paper's JSON-LD carries, from papers.license.
function paperLicenseUrl(lic) {
  const l = String(lic || "").toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  if (/^cc-by-4/.test(l)) return "https://creativecommons.org/licenses/by/4.0/";
  if (/^cc-by-nc-sa-4/.test(l)) return "https://creativecommons.org/licenses/by-nc-sa/4.0/";
  return "https://legal.qnfo.org/";
}
function buildPaperJsonLd(paper) {
  const title = displayTitle(paper.title) || "Untitled";
  const slug = paper.slug || "";
  const doi = lpDoi(paper.doi) || "";
  const abs = mdPlain(paper.abstract).slice(0, 3e3);
  const authors = paperAuthors(paper);
  // PAPER-PAGE-SEO-1 (2026-10-01): tie the owner's byline to the owner's ORCID iD so scholarly indexes
  // attribute the paper to one person. Serialised by the same JSON.stringify + <>& escape below.
  const authorObjs = authors.map((n) => String(n).indexOf("Quni-Gudzinas") >= 0 ? { "@type": "Person", name: n, sameAs: "https://orcid.org/0009-0002-4317-5604" } : { "@type": "Person", name: n });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    headline: title,
    name: title,
    url: "https://papers.qnfo.org/papers/" + slug,
    identifier: doi ? [{ "@type": "PropertyValue", propertyID: "DOI", value: doi }] : [],
    sameAs: doi ? "https://doi.org/" + doi : "",
    author: authorObjs,
    abstract: abs,
    datePublished: (paper.created_at || "").slice(0, 10) || void 0,
    inLanguage: "en",
    license: paperLicenseUrl(paper.license),
    publisher: { "@type": "Organization", name: "QNFO", url: "https://qnfo.org" },
    isAccessibleForFree: true
  };
  const jsonStr = JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return '<script type="application/ld+json">' + jsonStr + "<\/script>";
}
__name(buildPaperJsonLd, "buildPaperJsonLd");
__name2(buildPaperJsonLd, "buildPaperJsonLd");
__name22(buildPaperJsonLd, "buildPaperJsonLd");
__name222(buildPaperJsonLd, "buildPaperJsonLd");
__name2222(buildPaperJsonLd, "buildPaperJsonLd");
__name22222(buildPaperJsonLd, "buildPaperJsonLd");
function citationAuthorsMeta(paper) {
  const authors = paperAuthors(paper);
  return authors.map((n) => '<meta name="citation_author" content="' + escAttr(n) + '">').join("");
}
__name(citationAuthorsMeta, "citationAuthorsMeta");
__name2(citationAuthorsMeta, "citationAuthorsMeta");
__name22(citationAuthorsMeta, "citationAuthorsMeta");
__name222(citationAuthorsMeta, "citationAuthorsMeta");
__name2222(citationAuthorsMeta, "citationAuthorsMeta");
__name22222(citationAuthorsMeta, "citationAuthorsMeta");
__name222222(citationAuthorsMeta, "citationAuthorsMeta");

function subscribeBlock(source) {
  const form = '<section class="q-subscribe" id="subscribe" aria-labelledby="q-sub-h"><div><h2 class="q-h2" id="q-sub-h">New papers by email</h2><p class="q-meta" style="margin:0">One short weekly digest: titles and links, nothing else. Unsubscribe any time.</p></div>' +
    '<form id="ld-sub-form" novalidate><label class="q-sr" for="ld-email">Email address</label><input class="q-input" id="ld-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required><input class="q-sr" type="text" id="ld-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="q-btn" type="submit" id="ld-btn">Subscribe</button></form><p class="q-msg" id="ld-msg" role="status" aria-live="polite"></p></section>';
  const js = "<script>(function(){var f=document.getElementById('ld-sub-form');if(!f)return;var msg=document.getElementById('ld-msg');var btn=document.getElementById('ld-btn');f.addEventListener('submit',function(e){e.preventDefault();var email=(document.getElementById('ld-email').value||'').trim();var hp=(document.getElementById('ld-hp')||{}).value||'';if(!email||email.indexOf('@')<1){msg.className='q-msg err';msg.textContent='Enter a valid email address.';return;}btn.disabled=true;msg.className='q-msg';msg.textContent='Subscribing...';fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,hp:hp,source:'" + source + "'})}).then(function(r){return r.json().catch(function(){return {};});}).then(function(j){if(j&&j.ok){msg.className='q-msg ok';msg.textContent='Check your inbox to confirm the subscription.';f.reset();}else{msg.className='q-msg err';msg.textContent=(j&&j.error)||'The subscription did not go through. Try again.';}}).catch(function(){msg.className='q-msg err';msg.textContent='Network error. Try again.';}).then(function(){btn.disabled=false;});});})();<\/script>";
  return form + js;
}
__name(subscribeBlock, "subscribeBlock");

function renderPaperHTML(paper) {
  return lpPaperHTML(paper);
}
__name(renderPaperHTML, "renderPaperHTML");
__name2(renderPaperHTML, "renderPaperHTML");
__name22(renderPaperHTML, "renderPaperHTML");
__name222(renderPaperHTML, "renderPaperHTML");
__name2222(renderPaperHTML, "renderPaperHTML");
__name22222(renderPaperHTML, "renderPaperHTML");
__name222222(renderPaperHTML, "renderPaperHTML");
__name2222222(renderPaperHTML, "renderPaperHTML");
__name22222222(renderPaperHTML, "renderPaperHTML");
__name222222222(renderPaperHTML, "renderPaperHTML");
__name2222222222(renderPaperHTML, "renderPaperHTML");
function json(data, status) {
  status = status || 200;
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://qnfo.org" }
  });
}
__name(json, "json");
__name2(json, "json");
__name22(json, "json");
__name222(json, "json");
__name2222(json, "json");
__name22222(json, "json");
__name222222(json, "json");
__name2222222(json, "json");
__name22222222(json, "json");
__name222222222(json, "json");
__name2222222222(json, "json");
async function handlePapers(request, env) {
  try {
    const u = new URL(request.url);
    const category = u.searchParams.get("category");
    const search = (u.searchParams.get("search") || "").trim();
    const limit = Math.min(Math.max(parseInt(u.searchParams.get("limit") || "50", 10), 1), 200);
    const offset = Math.max(parseInt(u.searchParams.get("offset") || "0", 10), 0);
    let sql = "SELECT slug,title,doi,abstract,created_at,status,version,authors FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint')";
    const params = [];
    if (search) {
      sql += " AND (title LIKE ? OR abstract LIKE ? OR authors LIKE ?)";
      const term = "%" + search + "%";
      params.push(term, term, term);
    }
    sql += " ORDER BY created_at DESC";
    const res = await env.LIVING_PAPER.prepare(sql).bind(...params).all();
    let all = res.results || [];
    for (const p of all) p.doi = lpDoi(p.doi);
    const withDoi = all.filter((p) => p.doi).length;
    // LIVING-PAPERS-1: topic facets (before the topic filter, so every chip shows its count), a 12-month histogram,
    // the newest date and the unfiltered total feed the index; ?sort=new|old|title.
    const facets = {};
    for (const p of all) { p._cat = detectCategory(p.title, p.abstract); facets[p._cat] = (facets[p._cat] || 0) + 1; }
    const latest = all.length ? all[0].created_at : null;
    let allTotal = all.length;
    if (search) { try { const c = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS n FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint')").first(); allTotal = c ? c.n : allTotal; } catch (e) {} }
    const months = [];
    { const now = new Date(); for (let k = 11; k >= 0; k--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)); const key = d.toISOString().slice(0, 7); months.push({ key, label: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()] + " '" + String(d.getUTCFullYear()).slice(2), n: 0 }); }
      const idx = {}; months.forEach((m, i) => { idx[m.key] = i; }); for (const p of all) { const k = String(p.created_at || "").slice(0, 7); if (idx[k] != null) months[idx[k]].n++; } }
    if (category && category !== "all") {
      all = all.filter((p) => p._cat === category);
    }
    const sort = ["old", "title"].indexOf(u.searchParams.get("sort")) >= 0 ? u.searchParams.get("sort") : "new";
    if (sort === "old") all = all.slice().reverse();
    if (sort === "title") all = all.slice().sort((x, y) => displayTitle(x.title).localeCompare(displayTitle(y.title)));
    for (const p of all) delete p._cat;
    const total = all.length;
    const page = all.slice(offset, offset + limit);
    const hasMore = offset + page.length < total;
    if (u.searchParams.get("format") === "json") {
      return json({ papers: page, rows: page.map(renderPaperRow), count: page.length, total, offset, limit, hasMore, category: category || null, search: search || null, sort, facets });
    }
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/html") || !accept.includes("application/json")) {
      return new Response(renderIndexHTML(page, total, offset, hasMore, category || null, search, { facets, months, latest, all_total: allTotal, sort, with_doi: search ? null : withDoi }), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
      });
    }
    return json({ papers: page, count: page.length, total, offset, limit, hasMore, category: category || null, search: search || null });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
__name(handlePapers, "handlePapers");
__name2(handlePapers, "handlePapers");
__name22(handlePapers, "handlePapers");
__name222(handlePapers, "handlePapers");
__name2222(handlePapers, "handlePapers");
__name22222(handlePapers, "handlePapers");
__name222222(handlePapers, "handlePapers");
__name2222222(handlePapers, "handlePapers");
__name22222222(handlePapers, "handlePapers");
__name222222222(handlePapers, "handlePapers");
__name2222222222(handlePapers, "handlePapers");
// NO-BLANK-PAPER-1 gate: live invariant over the paper surface. A published,
// renderable paper must have either a body (>=40 chars) or an abstract; if both
// are absent the detail page would render blank. Must report blank_count = 0.
async function handleBlankPapers(env) {
  try {
    const r = await env.LIVING_PAPER.prepare("SELECT slug,title,status,paper_type,length(COALESCE(body_md,'')) AS body_len,length(COALESCE(abstract,'')) AS abstract_len FROM papers WHERE status IN ('published','distributed','external_preprint') AND length(trim(COALESCE(body_md,''))) < 40 AND length(trim(COALESCE(abstract,''))) < 1 ORDER BY status, slug").all();
    const rows = (r && r.results) || [];
    const published = rows.filter(function (x) { return x.status === "published"; });
    return json({ ok: published.length === 0, invariant: "NO-BLANK-PAPER-1", published_no_content: published.length, other_no_content: rows.length - published.length, note: "Renderer emits an abstract/placeholder fallback so no page renders blank; this flags papers with no content at all.", items: rows });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
__name(handleBlankPapers, "handleBlankPapers");
// SCHOLAR-PDF-URL-1 (2026-10-01, agent_issues 1714): Google Scholar indexes a paper only with an absolute citation_pdf_url
// in the same directory as the abstract page, resolving to a searchable PDF of at most 5 MB. /papers/<slug>.pdf serves the
// PDF that qnfo-pdf renders for the paper (papers.pdf_path in the RELEASES bucket); the page emits citation_pdf_url only
// when that file exists within the limit. NOZ-DOI-1 (3.14.0): no outside record is consulted for a PDF.
var SCHOLAR_PDF_MAX = 5 * 1024 * 1024;
// The rendered fallback: qnfo-pdf stores pdf/<slug>.pdf in qnfo-releases and records it in papers.pdf_path.
async function servedRenderedPdf(env, paper) {
  if (!paper || !paper.pdf_path || !env.RELEASES) return null;
  const obj = await env.RELEASES.get(String(paper.pdf_path));
  if (!obj || !obj.body || Number(obj.size || 0) <= 0 || Number(obj.size) > SCHOLAR_PDF_MAX) return null;
  return new Response(obj.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="' + paper.slug + '.pdf"', "Cache-Control": "public, max-age=86400", "X-PDF-Source": "rendered" } });
}
__name(servedRenderedPdf, "servedRenderedPdf");
async function handlePaperPdf(env, slug) {
  const nf = new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const paper = await env.LIVING_PAPER.prepare(
    "SELECT slug,doi,pdf_path FROM papers WHERE slug = ? AND status IN ('published','distributed','external_preprint') LIMIT 1"
  ).bind(slug).first();
  if (!paper) return nf;
  const rendered = await servedRenderedPdf(env, paper);
  if (rendered) return rendered;
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
__name(handlePaperPdf, "handlePaperPdf");
async function handlePaperDetail(request, env, path) {
  const slug = path.split("/")[2];
  if (!slug) return json({ error: "Missing paper slug" }, 400);
  if (/\.pdf$/i.test(slug)) {
    try {
      return await handlePaperPdf(env, slug.replace(/\.pdf$/i, ""));
    } catch (e) {
      return new Response("PDF temporarily unavailable", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }
  try {
    const paper = await env.LIVING_PAPER.prepare(
      "SELECT slug,title,body_md,abstract,authors,doi,created_at,status,version,pdf_path,license FROM papers WHERE slug = ? AND status IN ('published','distributed','external_preprint') LIMIT 1"
    ).bind(slug).first();
    if (!paper) return notFoundPage(request, env, "papers.qnfo.org", "/papers/" + slug, slug);
    paper.doi = lpDoi(paper.doi);
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/html") || !accept.includes("application/json")) {
      if (!paper._pdf && paper.pdf_path && env.RELEASES) {
        try {
          const _h = await env.RELEASES.head(String(paper.pdf_path));
          paper._pdf = !!(_h && Number(_h.size || 0) > 0 && Number(_h.size) <= SCHOLAR_PDF_MAX);
        } catch (e) {
        }
      }
      return new Response(renderPaperHTML(paper), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" }
      });
    }
    return json(Object.assign({}, paper, { body_md: fixMojibake(paper.body_md || "") }));
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
__name(handlePaperDetail, "handlePaperDetail");
__name2(handlePaperDetail, "handlePaperDetail");
__name22(handlePaperDetail, "handlePaperDetail");
__name222(handlePaperDetail, "handlePaperDetail");
__name2222(handlePaperDetail, "handlePaperDetail");
__name22222(handlePaperDetail, "handlePaperDetail");
__name222222(handlePaperDetail, "handlePaperDetail");
__name2222222(handlePaperDetail, "handlePaperDetail");
__name22222222(handlePaperDetail, "handlePaperDetail");
__name222222222(handlePaperDetail, "handlePaperDetail");
__name2222222222(handlePaperDetail, "handlePaperDetail");
async function handleHub(env) {
  try {
    const [papersRes, countRes, nodesRes] = await Promise.all([
      env.LIVING_PAPER.prepare("SELECT slug,title,created_at FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint') ORDER BY created_at DESC LIMIT 8").all(),
      env.LIVING_PAPER.prepare("SELECT COUNT(*) as cnt FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint')").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM nodes").first()
    ]);
    const paperCount = countRes ? countRes.cnt : 0;
    const nodesCount = nodesRes ? nodesRes.count : 0;
    return new Response(renderHubHTML(papersRes.results, paperCount, nodesCount), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
    });
  } catch (e) {
    return new Response(renderHubHTML([], 0), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" }
    });
  }
}
__name(handleHub, "handleHub");
// HUB-SWR-1 (3.9.4, GATEWAY-COLD-TTFB-1 #1910): the qnfo.org home ran three D1 reads in ENAM on every request (first byte
// 0.5-0.8 s steady, 8.5 s and 18 s right after deploys). It is now served from the colo's edge cache and rebuilt in the
// background once older than HUB_FRESH_MS, so a visitor never waits on D1 unless the colo has no copy at all. A failed
// rebuild (handleHub's catch returns an empty hub with max-age=60) is never cached over a good copy.
var HUB_CACHE_KEY = "https://qnfo.org/__hub-cache-v1";
var HUB_FRESH_MS = 5 * 60 * 1000;
async function hubBuildAndStore(env, cache) {
  const res = await handleHub(env);
  if (res.status !== 200 || /max-age=60\b/.test(res.headers.get("Cache-Control") || "")) return res;
  const html = await res.text();
  const hd = new Headers(res.headers);
  hd.set("X-Hub-Built", String(Date.now()));
  hd.set("Cache-Control", "public, max-age=86400");
  try { await cache.put(new Request(HUB_CACHE_KEY), new Response(html, { status: 200, headers: hd })); } catch (e) {}
  return new Response(html, { status: 200, headers: res.headers });
}
async function handleHubCached(env, ctx) {
  const cache = typeof caches !== "undefined" && caches.default;
  if (!cache) return handleHub(env);
  let hit = null;
  try { hit = await cache.match(new Request(HUB_CACHE_KEY)); } catch (e) { hit = null; }
  if (!hit) return hubBuildAndStore(env, cache);
  const age = Date.now() - Number(hit.headers.get("X-Hub-Built") || 0);
  if (age > HUB_FRESH_MS && ctx && ctx.waitUntil) ctx.waitUntil(hubBuildAndStore(env, cache).catch(function() {}));
  const hd = new Headers(hit.headers);
  hd.set("Cache-Control", "public, max-age=300");
  hd.set("X-Hub-Cache", age > HUB_FRESH_MS ? "stale-revalidating" : "fresh");
  hd.delete("X-Hub-Built");
  return new Response(hit.body, { status: 200, headers: hd });
}
__name2(handleHub, "handleHub");
__name22(handleHub, "handleHub");
__name222(handleHub, "handleHub");
__name2222(handleHub, "handleHub");
__name22222(handleHub, "handleHub");
__name222222(handleHub, "handleHub");
__name2222222(handleHub, "handleHub");
__name22222222(handleHub, "handleHub");
__name222222222(handleHub, "handleHub");
__name2222222222(handleHub, "handleHub");
async function handleAbout(env) {
  try {
    const [pc, nc, ec] = await Promise.all([
      env.LIVING_PAPER.prepare("SELECT COUNT(*) as cnt FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint')").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM nodes").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM edges").first()
    ]);
    return new Response(renderAboutHTML({ papers: pc ? pc.cnt : 0, nodes: nc ? nc.count : 0, edges: ec ? ec.count : 0 }), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
    });
  } catch (e) {
    return new Response(renderAboutHTML({ papers: 0, nodes: 0, edges: 0 }), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" }
    });
  }
}
__name(handleAbout, "handleAbout");
__name2(handleAbout, "handleAbout");
__name22(handleAbout, "handleAbout");
__name222(handleAbout, "handleAbout");
__name2222(handleAbout, "handleAbout");
function renderAboutHTML(stats) {
  const fmt = function(n) { return Number(n || 0).toLocaleString("en-US"); };
  const body = '<section class="q-hero" style="padding-bottom:16px"><div class="q-wrap"><p class="q-eyebrow">About</p><h1 class="q-display" style="max-width:18ch">About QNFO</h1><p class="q-lede">QNFO is the independent research imprint of Rowan Brad Quni-Gudzinas: one researcher with an open, auditable, AI-assisted research pipeline. The work asks what computation really costs and delivers: energy per correct answer (Joules-per-Solution), what an AI-assisted claim is worth (ignorance audits), and what an autonomous research system actually delivers. The <a href="/#selected-works">selected works</a> are the place to start.</p></div></section>' +
    '<div class="q-wrap"><article class="q-article"><div class="q-prose">' +
    '<h2>What QNFO is</h2><p>Open research in three lines, in this order: energy-honest computing (the Joules-per-Solution metric), the epistemics of AI-assisted science, and autonomous research operations. The corpus is browsable on <a href="https://papers.qnfo.org/papers">papers.qnfo.org</a>, and <a href="https://ask.qwav.tech/">Ask the corpus</a> answers questions from it with citations and the knowledge graph around each answer.</p><p class="q-meta">QNFO is not an acronym. The name is the name.</p>' +
    '<h2>The thesis</h2><p>Computational advantage is measured in joules per solution, not qubit counts or press releases. The <a href="https://github.com/rwnq8/joules-per-compute-benchmark">joules-per-compute benchmark</a> formalizes the questions the industry prefers to defer: the Landauer floor for cryogenic controllers, the Margolus\u2013Levitin bound as a scheduling constraint, and the energy floor of surface-code error correction at a thousand logical qubits.</p>' +
    '<h2>The record</h2><div class="q-table-wrap"><table class="q-table"><tbody><tr><td>Papers in the corpus</td><td class="q-num">' + fmt(stats.papers) + ' (counted live)</td></tr><tr><td>Knowledge graph</td><td class="q-num">' + fmt(stats.nodes) + " nodes, " + fmt(stats.edges) + ' edges (counted live)</td></tr><tr><td>Readership on paper pages</td><td class="q-num">about 400 requests a day (2026-09-03)</td></tr></tbody></table></div><p class="q-meta">The first two rows are queried on every request. Roughly nine in ten requests to the zone are scanner noise; the readership figure excludes it.</p>' +
    '<h2>How QNFO runs</h2><p>A cloud-scheduled pipeline keeps the corpus alive: an arXiv radar each morning, a research brief, an hourly errata watch that turns corrections into new versions of the same record, a citation watch, and a weekly visibility digest. Outreach is capped and opt-out. If the laptop is off, the pipeline does not notice.</p>' +
    '<h2>How QNFO holds itself</h2><p>Every quantitative claim is computationally verified before publication, with the verification artifacts deposited beside the paper. Traffic is never fabricated. Disconfirmation criteria are stated in advance. Corrections ship as new versions of the same record.</p>' +
    '<h2>The author</h2><p>QNFO is operated by Rowan Brad Quni-Gudzinas (<a href="https://orcid.org/' + OWNER_ORCID + '">ORCID ' + OWNER_ORCID + '</a>). Contact: <a href="mailto:rowan.quni@qnfo.org">rowan.quni@qnfo.org</a>. For assessments, reviews of AI agent operations, talks, research collaboration or roles, see <a href="/work-with-me">Work with me</a>.</p>' +
    '<h2>Changelog</h2><div class="q-table-wrap"><table class="q-table"><tbody><tr><td class="q-num">2026-10-02</td><td>One design system across every QNFO site, with reading type for the papers and light and dark themes.</td></tr><tr><td class="q-num">2026-09-03</td><td>This page, with record counts rendered live.</td></tr><tr><td class="q-num">2026-09-02</td><td>Outreach live, capped and opt-out. A weekly scorecard publishes real traffic changes.</td></tr><tr><td class="q-num">2026-08-29</td><td>Universal Ignorance Audit re-pointed to v0.4.</td></tr><tr><td class="q-num">2026-08-28</td><td>OSF pre-registrations placed; results attached as comments on frozen registrations.</td></tr><tr><td class="q-num">2026-08-10</td><td>Email deliverability hardened: SPF, DKIM and DMARC at reject on every sending domain.</td></tr></tbody></table></div>' +
    '<p class="q-small">Prepared with an AI-assisted research pipeline; the author is responsible for the content.</p></div>' +
    '<aside class="q-article-aside" aria-label="On this page"><section class="q-toc-wrap"><h2>On this page</h2><ol class="q-toc" data-q-toc=".q-prose"></ol></section></aside></article>' + subscribeBlock("about") + '</div>';
  return qdsPage({ title: "About QNFO \u2014 independent research", description: "About QNFO, the independent research imprint of Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604): the research line, the selected works and how the work is made.", canonical: "https://qnfo.org/about", jsonld: identityJsonLd("https://qnfo.org/about"), active: "about" }, body);
}
__name(renderAboutHTML, "renderAboutHTML");
__name2(renderAboutHTML, "renderAboutHTML");
__name22(renderAboutHTML, "renderAboutHTML");
__name222(renderAboutHTML, "renderAboutHTML");
__name2222(renderAboutHTML, "renderAboutHTML");
// WORK-WITH-ME-1 (2026-10-02, charter pillar: reach; docs/STRATEGY.md s2.2, s2.4, s2.5, s3, s7). One public page that
// says what someone can contact the owner about and how: five offers (JPCUB assessment, review of an AI agent operation,
// talks, research collaboration, roles), each with who it is for, what they get and how to start. Contact is a mailto to
// rowan.quni@qnfo.org (the address the fleet reads, qnfo-audit.emails) whose subject starts with [work-with-me:<key>];
// qnfo-fleet-dashboard WORK-WITH-ME-METRIC-1 counts those messages per key, so the keys below and WWM_OFFER_KEYS there
// change together (qnfo-gateway/work-with-me.test.mjs checks parity). No form, so the page stores nothing. Claims are the
// published record only: the CV, the selected works and the deployed fleet size.
var WWM_EMAIL = "rowan.quni@qnfo.org";
var WWM_URL = "https://qnfo.org/work-with-me";
var WWM_TAG_PREFIX = "[work-with-me:";
var WWM_OFFERS = [
  {
    key: "jpcub",
    title: "Energy per correct answer (JPCUB) assessment",
    service: "Energy-per-correct-answer measurement and assessment of a computing platform or data centre, under the published Joules-per-Solution (JPCUB) protocol.",
    forWho: "Teams building a computing platform (quantum, AI inference or HPC) and data-centre operators who need an energy figure tied to correct results, not to peak throughput.",
    getLabel: "What you get",
    get: [
      "A measurement plan under the published Joules-per-Solution protocol: the task, the check that decides whether an answer is correct, and a whole-system boundary that includes memory, I/O, cooling and power conversion, not only the processor.",
      "The measured joules per correct answer, with its uncertainty stated and the protocol's anti-gaming provisions (pre-registration, adversarial validation) applied.",
      "A written report, published only if you agree."
    ],
    status: "The protocol is published. The JPCUB figures published so far, including those for 17 quantum platforms, are estimates built from published specifications and third-party data, not metered measurements, so a first engagement is also the protocol's first field test, and the report says so.",
    start: "Email me the system, the workload you care about, and the metering you already have (rack, facility or wall plug).",
    subject: "JPCUB energy assessment",
    body: ["System or site:", "Workload to measure:", "Metering you already have:", "Timeline:"],
    works: [0, 2, 3]
  },
  {
    key: "agent-review",
    title: "Review of an AI research or agent operation",
    service: "Review of an AI research or agent operation: what it costs, what it delivers and what it gets wrong, using a failure-ledger method.",
    forWho: "Teams running AI agents or an AI-assisted research pipeline in production who want to know what it costs, what it delivers and what it gets wrong.",
    getLabel: "What you get",
    get: [
      "A cost line: what the operation spends per month and per delivered result, from your bills and logs.",
      "A delivery line: what it actually ships, measured from its outputs rather than from the agents' own reports.",
      "A failure ledger: each recurring failure with its evidence, and the check or rule that would stop it coming back, ranked by what it costs you."
    ],
    status: "This is the method I use on my own system, a fleet of 44 deployed Cloudflare Workers (October 2026), whose objectives, successes and failures are published as a ledger.",
    start: "Email me what the operation does, its agents and models, roughly what it spends a month, and which logs and bills you can share.",
    subject: "Review of an AI agent operation",
    body: ["What the operation does:", "Agents and models:", "Rough monthly spend:", "Logs and bills you can share:"],
    works: [6]
  },
  {
    key: "talk",
    title: "Talks and workshops",
    service: "Talks and workshops on AI-assisted research integrity and energy-honest computing.",
    forWho: "Conferences, labs, research offices and engineering teams.",
    getLabel: "Topics",
    get: [
      "Joules per correct answer: what computation really costs, and how to measure it without gaming the number.",
      "Running an autonomous research system: what it delivered, what it cost and what went wrong, from a published failure ledger.",
      "Reading an AI-assisted claim: ignorance audits and epistemic legibility, as a talk or as a workshop that audits your own AI-assisted work."
    ],
    status: "Remote by default. Slides and materials are shared afterwards.",
    start: "Email me the audience, the date and the format (talk, panel or workshop).",
    subject: "Talk or workshop request",
    body: ["Event and audience:", "Date and time zone:", "Format (talk, panel or workshop):"],
    works: [0, 4, 5, 6]
  },
  {
    key: "research",
    title: "Research collaboration",
    service: "Research collaboration on JPCUB measurements, the Universal Ignorance Audit and an open dataset of corrections to AI agents.",
    forWho: "Researchers in energy-aware computing, metascience and AI oversight.",
    getLabel: "Three open lines",
    get: [
      "JPCUB measurements: run the protocol on hardware you operate, or test its anti-gaming provisions. Status: protocol published; first measurements wanted.",
      "The ignorance audit: apply the Universal Ignorance Audit to an AI-assisted corpus or pipeline and publish what it finds. Status: method published.",
      "The agent-correction dataset: an open, de-identified record of the corrections a running AI agent fleet receives (rule changes, blocked changes, owner overrides, reopened false closures) and what happened next. Status: planned; I am looking for researchers in AI oversight and corrigibility to shape it."
    ],
    status: "Results are published openly, and every contributor is credited.",
    start: "Email me which line interests you and what you would bring: hardware, data or a method.",
    subject: "Research collaboration",
    body: ["Which line (JPCUB, ignorance audit, agent-correction dataset):", "What you would bring:"],
    works: [0, 4, 6]
  },
  {
    key: "role",
    title: "Roles in research management and applied AI",
    service: "",
    forWho: "Organisations hiring for research management, applied AI, or data and policy research leadership.",
    getLabel: "What I bring",
    get: [
      "Research programme management: a $1.5M federal research portfolio managed as a certified Contracting Officer's Representative at the U.S. Federal Highway Administration.",
      "National data products: I led the AARP Livability Index, which scores U.S. neighborhoods from 50+ data sources across 7 domains.",
      "AI systems in production: I built and run QNFO's autonomous research system and publish what it costs and where it fails."
    ],
    status: "Remote, based in Amsterdam; EU and US hours.",
    start: "Email me the role and a link to its description. I will send my CV on request.",
    subject: "Role in research management or applied AI",
    body: ["Role and organisation:", "Link to the description:", "Remote or location:"],
    works: []
  }
];
// The contact-section button: anything that fits none of the offers. Counted as its own key.
var WWM_GENERAL = { key: "general", subject: "Hello", body: ["What you have in mind:"] };
function wwmTag(key) {
  return WWM_TAG_PREFIX + key + "]";
}
function wwmMailto(o) {
  const body = o.body.join("\n\n") + "\n\n(The tag at the start of the subject tells me which offer you came from. Please keep it.)";
  return "mailto:" + WWM_EMAIL + "?subject=" + encodeURIComponent(wwmTag(o.key) + " " + o.subject) + "&amp;body=" + encodeURIComponent(body);
}
function workWithMeJsonLd() {
  const person = { "@id": "https://qnfo.org/#person" };
  const offers = WWM_OFFERS.filter(function(o) {
    return o.service;
  }).map(function(o) {
    return { "@type": "Offer", "@id": WWM_URL + "#offer-" + o.key, url: WWM_URL + "#" + o.key, name: o.title, description: o.service, offeredBy: person, itemOffered: { "@type": "Service", name: o.title, description: o.service, serviceType: o.title, provider: person, areaServed: "Worldwide (remote)", audience: { "@type": "Audience", audienceType: o.forWho } } };
  });
  const role = WWM_OFFERS.find(function(o) {
    return o.key === "role";
  });
  return identityJsonLd(WWM_URL, {
    person: {
      email: WWM_EMAIL,
      contactPoint: { "@type": "ContactPoint", email: WWM_EMAIL, contactType: "collaboration and employment", url: WWM_URL + "#contact", availableLanguage: "English" },
      makesOffer: offers.map(function(o) {
        return { "@id": o["@id"] };
      }),
      seeks: { "@type": "Demand", name: role.title, description: role.forWho + " " + role.status, url: WWM_URL + "#role" },
      knowsAbout: ["energy cost of computation", "Joules-per-Solution (JPCUB)", "AI-assisted research integrity", "autonomous AI research operations", "research programme management", "travel demand modelling"]
    },
    page: { "@type": "ProfilePage", name: "Work with me", mainEntity: person },
    nodes: offers
  });
}
var WWM_CSS = `
.ww-jump{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0 0;padding:0;list-style:none}
.ww-offers{display:grid;gap:20px;margin:8px 0 0}
.ww-offer{background:var(--q-surface);border:1px solid var(--q-rule);border-radius:var(--q-r-lg);padding:28px;scroll-margin-top:90px}
.ww-offer h2{font:500 var(--q-fs-xl)/1.2 var(--q-serif);margin:0 0 6px}
.ww-offer h3{font:600 var(--q-fs-sm)/1.3 var(--q-sans);color:var(--q-accent);margin:18px 0 6px}
.ww-offer p,.ww-offer li{font:400 1.0625rem/1.6 var(--q-serif);margin:0;color:var(--q-ink-2)}
.ww-offer ul{margin:0;padding-left:1.2em}
.ww-offer li+li{margin-top:6px}
.ww-note{color:var(--q-muted)!important;font-size:var(--q-fs-sm)!important;font-family:var(--q-sans)!important;border-left:2px solid var(--q-rule);padding-left:12px;margin-top:14px!important}
.ww-basis{color:var(--q-muted);font:400 var(--q-fs-sm)/1.5 var(--q-sans)!important;margin-top:12px!important}
.ww-basis a{color:var(--q-muted)}
.ww-btn{margin-top:18px}
.ww-tag{display:block;margin-top:8px;font:400 var(--q-fs-xs)/1.4 var(--q-mono);color:var(--q-muted)}
.ww-sec{margin-top:48px;border-top:1px solid var(--q-rule);padding-top:28px;max-width:var(--q-measure)}
.ww-sec h2{font:500 var(--q-fs-xl)/1.2 var(--q-serif);margin:0 0 12px}
.ww-sec p{font:400 1.0625rem/1.65 var(--q-serif);margin:0 0 12px}
.ww-record{list-style:none;padding:0;margin:4px 0 12px}
.ww-record li{display:grid;grid-template-columns:8rem 1fr;gap:16px;padding:12px 0;border-bottom:1px solid var(--q-rule);font:400 1rem/1.6 var(--q-serif)}
.ww-record .ww-when{color:var(--q-muted);font:400 var(--q-fs-sm)/1.6 var(--q-sans);font-variant-numeric:tabular-nums}
.ww-record b{font-weight:600}
@media(max-width:640px){.ww-offer{padding:20px}.ww-record li{grid-template-columns:1fr;gap:2px}}
`;
function wwmWorkLinks(idx) {
  if (!idx || !idx.length) return "";
  return '<p class="ww-basis">Based on: ' + idx.map(function(i) {
    const w = SELECTED_WORKS[i];
    return '<a href="' + workHref(w) + '">' + esc(w.t) + "</a>";
  }).join("; ") + ".</p>";
}
function wwmOfferHTML(o) {
  const extra = o.key === "role" ? '<p class="ww-basis">CV: sent on request. Earlier work is published under Brad Gudzinas.</p>' : wwmWorkLinks(o.works);
  return '<section class="ww-offer" id="' + o.key + '" aria-labelledby="ww-h-' + o.key + '"><h2 id="ww-h-' + o.key + '">' + esc(o.title) + "</h2><h3>Who it is for</h3><p>" + esc(o.forWho) + "</p><h3>" + esc(o.getLabel) + "</h3><ul>" + o.get.map(function(g) {
    return "<li>" + esc(g) + "</li>";
  }).join("") + '</ul><p class="ww-note">' + esc(o.status) + "</p><h3>How to start</h3><p>" + esc(o.start) + "</p>" + extra + '<a class="q-btn ww-btn" data-wwm="' + o.key + '" href="' + wwmMailto(o) + '">Email me about this</a><span class="ww-tag">Subject starts with ' + esc(wwmTag(o.key)) + "</span></section>";
}
function renderWorkWithMeHTML() {
  const title = "Work with me \u00b7 Rowan Brad Quni-Gudzinas \u00b7 QNFO";
  const desc = "Work with Rowan Brad Quni-Gudzinas: energy-per-correct-answer (JPCUB) assessments, reviews of AI research and agent operations, talks and workshops, research collaboration, and research-management and applied-AI roles.";
  const jump = '<ul class="ww-jump" aria-label="Offers">' + WWM_OFFERS.map(function(o) {
    return '<li><a class="q-chip" href="#' + o.key + '">' + esc(o.title) + "</a></li>";
  }).join("") + '<li><a class="q-chip" href="#contact">Something else</a></li></ul>';
  const hero = '<section class="q-hero" style="padding-bottom:28px"><div class="q-wrap"><p class="q-eyebrow">Work with me</p><h1 class="q-display" style="max-width:16ch">Work with me</h1><p class="q-lede" style="max-width:62ch">I am Rowan Brad Quni-Gudzinas, and I build research systems that people can check. I have spent 15 years turning data into public decisions, including national research programmes at the U.S. Federal Highway Administration and at AARP\'s Public Policy Institute, where I led the Livability Index. Since 2024 I have run QNFO, an independent research imprint that asks what computation really costs and delivers: energy per correct answer (Joules-per-Solution), what an AI-assisted claim is worth, and what an autonomous research system actually delivers.</p><p class="q-meta">Five ways to work together. Each says who it is for, what you get and how to start, and each button opens an email to me.</p>' + jump + "</div></section>";
  const offers = '<div class="ww-offers">' + WWM_OFFERS.map(wwmOfferHTML).join("") + "</div>";
  const record = '<section class="ww-sec" id="record" aria-labelledby="ww-rec-h"><h2 id="ww-rec-h">The record</h2><ul class="ww-record"><li><span class="ww-when">2011 to 2015</span><span><b>U.S. Federal Highway Administration</b>, Data Analyst and Research Manager. Managed a $1.5M federal research portfolio as a certified Contracting Officer\'s Representative, and worked on the national long-distance passenger travel forecasting model.</span></li><li><span class="ww-when">2016 to 2021</span><span><b>AARP Public Policy Institute</b>, Product Manager and Senior Methods Advisor. Led the AARP Livability Index (50+ data sources across 7 domains, scoring U.S. neighborhoods, across multiple public releases) and co-authored its 2018 report.</span></li><li><span class="ww-when">2024 to now</span><span><b>QNFO</b> (independent research), Founder. An open, AI-assisted research pipeline that runs on 44 deployed Cloudflare Workers (October 2026). Corrections ship as new versions of the same paper.</span></li></ul><p class="ww-basis">Earlier work is published under Brad Gudzinas. Full CV on request \u00b7 <a href="https://orcid.org/' + OWNER_ORCID + '">ORCID ' + OWNER_ORCID + "</a></p></section>";
  const how = '<section class="ww-sec" id="how" aria-labelledby="ww-how-h"><h2 id="ww-how-h">How I work</h2><p>AI agents do much of QNFO\'s engineering, analysis and drafting under my direction. I am accountable for every result, and each deliverable says which parts were AI-assisted.</p><p>There is no price list. Scope and fee are agreed for each engagement before any work starts; research collaboration has no fee.</p></section>';
  const contact = '<section class="ww-sec" id="contact" aria-labelledby="ww-con-h"><h2 id="ww-con-h">Contact</h2><p>Email <a data-wwm="' + WWM_GENERAL.key + '" href="' + wwmMailto(WWM_GENERAL) + '">' + WWM_EMAIL + "</a>. The buttons above start the subject with a tag such as <code>" + esc(wwmTag("jpcub")) + "</code>. Please keep it: it is how I count which offers bring people here. There is no form on this page; your message arrives in my qnfo.org mailbox like any other email.</p>" + '<a class="q-btn q-btn-ghost ww-btn" data-wwm="' + WWM_GENERAL.key + '" href="' + wwmMailto(WWM_GENERAL) + '">Something else? Email me</a><span class="ww-tag">Subject starts with ' + esc(wwmTag(WWM_GENERAL.key)) + '</span><p class="ww-basis">New papers by email: <a href="/#subscribe">subscribe on the home page</a>.</p></section>';
  const works = '<section class="ww-sec" id="selected-works" aria-labelledby="ww-sel-h"><h2 id="ww-sel-h">Selected works</h2><ol class="q-list q-compact">' + SELECTED_WORKS.map(function(w) {
    return '<li class="q-item"><a class="q-item-title" href="' + workHref(w) + '">' + esc(w.t) + '</a><div class="q-item-meta">' + esc(w.pillar) + "</div></li>";
  }).join("") + '</ol><p class="ww-basis">Quni-Gudzinas, R. B. Published by QNFO. Prepared with an AI-assisted research pipeline; the author is responsible for the content.</p></section>';
  const disclosure = '<p class="ww-basis">This page was prepared with an AI-assisted research pipeline; the author is responsible for the content.</p>';
  const body = hero + '<div class="q-wrap" style="padding-bottom:56px">' + offers + record + how + contact + works + disclosure + "</div>";
  return qdsPage({ title: title, description: desc, canonical: WWM_URL, jsonld: workWithMeJsonLd(), extra: "<style>" + WWM_CSS + "</style>", active: "work" }, body);
}
function handleWorkWithMe() {
  return new Response(renderWorkWithMeHTML(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
async function collectPaperUrls(env, recentDays) {
  // WS-A1 (2026-09-26): the scheduled cron submits ONLY recently-changed papers. A full 460-URL
  // submit (ok on the first, operator-side run) exceeds the IndexNow per-key rate budget when
  // repeated daily and returns 429 from the Cloudflare egress IP (FM2). The full set remains
  // available via /api/indexnow?full=1; the cron stays inside the budget.
  var sql = "SELECT slug, created_at FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint')";
  if (recentDays) sql += " AND created_at >= datetime('now','-" + Number(recentDays) + " days')";
  sql += " ORDER BY created_at DESC";
  const res = await env.LIVING_PAPER.prepare(sql).all();
  const base = "https://papers.qnfo.org";
  return [base + "/", base + "/papers"].concat(res.results.map((r) => base + "/papers/" + encodeURIComponent(r.slug)));
}
__name(collectPaperUrls, "collectPaperUrls");
async function indexNowSubmit(urls, host) {
  host = host || "papers.qnfo.org";
  const out = [];
  const CHUNK = 100;
  // R1/FM2 (2026-09-26): api.indexnow.org answers 429 to the Cloudflare EGRESS IP even for a few
  // URLs (an operator submit from a different IP returned 200/202 for the same key + keyLocation).
  // Fan out to the engine-specific endpoints as well - Bing and Yandex keep their own rate budgets,
  // so a 429 from the shared relay does not imply a 429 from the engines. First endpoint that
  // ACCEPTS a chunk wins; the exhausted case records the last status for diagnosis.
  // R1: ordered by empirically-observed acceptance from the Cloudflare egress. yandex.com is the
  // proven-accepting endpoint (202) and goes FIRST; the shared relay + Bing 429 the CF egress IP;
  // Seznam + Naver are additional IndexNow participants kept as further redundancy.
  const _EPS = ["https://yandex.com/indexnow", "https://api.indexnow.org/indexnow", "https://www.bing.com/indexnow", "https://search.seznam.cz/indexnow", "https://searchadvisor.naver.com/indexnow"];
  for (let i = 0; i < urls.length; i += CHUNK) {
    const chunk = urls.slice(i, i + CHUNK);
    const body = JSON.stringify({ host: host, key: INDEXNOW_KEY, keyLocation: "https://" + host + "/" + INDEXNOW_KEY + ".txt", urlList: chunk });
    let hit = null, last = null;
    for (let e = 0; e < _EPS.length && !hit; e++) {
      for (let attempt = 0; attempt < 2 && !hit; attempt++) {
        try {
          const r = await fetch(_EPS[e], { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
          last = _EPS[e] + ":" + r.status;
          if (r.status < 400) hit = { ep: _EPS[e], status: r.status };
        } catch (err) {
          last = _EPS[e] + ":err";
        }
        if (!hit) await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
      }
    }
    out.push(hit ? { chunk: chunk.length, ep: hit.ep, status: hit.status } : { chunk: chunk.length, status: 429, note: "no endpoint accepted", last });
    if (i + CHUNK < urls.length) await new Promise((res) => setTimeout(res, 1000));
  }
  return out;
}
__name(indexNowSubmit, "indexNowSubmit");
var QNFO_CORE_URLS = ["https://qnfo.org/", "https://qnfo.org/work-with-me", "https://qnfo.org/about", "https://qnfo.org/papers"];
async function indexNowLog(env, host, results) {
  try {
    await env.LIVING_PAPER.prepare("CREATE TABLE IF NOT EXISTS indexnow_log (ts TEXT DEFAULT (datetime('now')), host TEXT, urls INTEGER, accepted INTEGER, detail TEXT)").run();
    const urls = (results || []).reduce(function(a, r) { return a + (r.chunk || 0); }, 0);
    const acc = (results || []).filter(function(r) { return r.status && r.status < 400; }).reduce(function(a, r) { return a + (r.chunk || 0); }, 0);
    await env.LIVING_PAPER.prepare("INSERT INTO indexnow_log (host, urls, accepted, detail) VALUES (?1, ?2, ?3, ?4)").bind(host, urls, acc, JSON.stringify(results || []).slice(0, 1000)).run();
  } catch (e) {}
}
async function handleIndexNow(env, full) {
  const urls = await collectPaperUrls(env, full ? null : 7);
  const res = await indexNowSubmit(urls);
  return new Response(JSON.stringify({ ok: true, submitted: urls.length, indexnow: res }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
__name(handleIndexNow, "handleIndexNow");
// RENDER-HEALTH-1 (3.9.2, 2026-10-02, pillar reach; guard metric paper_render_defect_pages): the 06:00 cron renders every
// public paper exactly as its page does and stores what still shows through as raw Markdown on the row
// (papers.render_defects, papers.render_checked_at): raw bold opening a word, a raw heading marker, a raw table rule, or
// an odd number of unescaped $. qnfo-paper-indexer turns the count of pages with defects into the metric at 06:05, and
// GET /api/render-health lists them, so a regression in the renderer or in a source is seen without a session. The
// 2026-10-02 session sweep (446 -> 33 -> RENDER-FIX-3) used the same four tests.
function renderDefectCount(html) {
  const t = String(html || "").replace(/<span class="usd">\$<\/span>/g, "\u00a4").replace(/<(pre|code|table)[\s\S]*?<\/\1>/g, " ").replace(/<div class="math-display">[\s\S]*?<\/div>/g, " ").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const bold = (t.match(/(^|[\s(])\*\*[^\s*]/g) || []).length;
  const head = (t.match(/(^|\s)#{1,6}\s+\w/g) || []).length;
  const rule = (t.match(/\|\s*:?-{3,}/g) || []).length;
  const odd = (t.replace(/\\\$/g, "").split("$").length - 1) % 2;
  // 3.9.7: identifiers with a multi-letter stem ("noise_sigma", "MODEL_HTS_45", "run_simulation(") are names, not math.
  // RENDER-HEALTH-PRECISION-1 (3.11.1, agent_issues 2023): four false-positive classes measured on the 68 pages flagged on
  // 2026-10-06 (25 of the 47 still flagged were not render defects): an escaped \$ inside math shifted the $ pairing, so
  // drop it before pairing (the odd test already does); URLs carry file names with underscores; a one-letter stem with a
  // word subscript of 3+ letters ("t_gate", "y_true", "I_syn") is a name, not math ("p_th" still counts); and correct
  // Unicode sub- and superscripts ("Bi\u2082Sr\u2082", "x\u2080") display as intended, so they are no longer residue.
  const noMath = t.replace(/\\\$/g, " ").replace(/\bhttps?:\/\/\S+/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, " ").replace(/(?<![\w\\])[A-Za-z][A-Za-z0-9]+_\w+/g, " ").replace(/(?<![\w\\])[A-Za-z]_[A-Za-z]{3,}\w*/g, " ");
  const resid = (noMath.match(/[A-Za-z\u0370-\u03ff\)\]][_^][{(]?[A-Za-z0-9+\-]/g) || []).length;
  return bold + head + rule + odd + (resid >= 3 ? 1 : 0);
}
function paperRenderHtml(row) {
  const stripped = stripFrontmatter(String(row.body_md || "")).trim();
  if (stripped.length < 40) return "";
  return renderMarkdown(lpStripTitle(fixMojibake(stripped), row.title));
}
async function renderHealthSweep(env) {
  let last = 0, checked = 0, withDefects = 0;
  const started = Date.now();
  for (let page = 0; page < 60; page++) {
    const r = await env.LIVING_PAPER.prepare("SELECT rowid AS rid, slug, title, body_md, render_defects FROM papers WHERE rowid > ?1 AND status IN ('published','distributed','external_preprint') ORDER BY rowid LIMIT 15").bind(last).all();
    const rows = r.results || [];
    if (!rows.length) break;
    const upd = [];
    for (const row of rows) {
      last = row.rid;
      let n = 0;
      try { n = renderDefectCount(paperRenderHtml(row)); } catch (e) { n = -1; }
      checked++;
      if (n !== 0) withDefects++;
      upd.push(env.LIVING_PAPER.prepare("UPDATE papers SET render_defects = ?1, render_checked_at = datetime('now') WHERE rowid = ?2").bind(n, row.rid));
    }
    await env.LIVING_PAPER.batch(upd);
    if (Date.now() - started > 600000) break;
  }
  console.log("RENDER-HEALTH-1 checked " + checked + " pages, " + withDefects + " with defects");
  return { checked, with_defects: withDefects };
}
// MATH-BROWSER-2 (3.9.7, #1890, #1935): the string tests above cannot see what MathJax does in a browser. Once a day, after
// the sweep and inside the same 06:00 cron, five live paper pages are loaded in a real browser through qnfo-pdf's internal
// /math-check (PDF_SVC service binding): the two-index anyon paper every day plus four more in rowid rotation. The report
// (typeset containers, MathJax errors, raw $...$ and pseudo-math left on the page) is kept in RELEASES
// render-health/browser-latest.json and served as browser_sample by /api/render-health. No new worker, cron or model call;
// Browser Run time is not a fleet_budget class (read 2026-10-05) and five pages a day is a few minutes a month.
var BROWSER_SAMPLE_PIN = "a-two-index-framework-for-the-bulk-boundary-correspondence-of-anyon-condensation";
var BROWSER_SAMPLE_KEY = "render-health/browser-latest.json";
async function browserMathSample(env) {
  if (!env.PDF_SVC || !env.RELEASES || !env.LIVING_PAPER) return null;
  let prev = null;
  try {
    const o = await env.RELEASES.get(BROWSER_SAMPLE_KEY);
    if (o) prev = await o.json();
  } catch (e) {
  }
  const pick = (after, n) => env.LIVING_PAPER.prepare("SELECT rowid AS rid, slug FROM papers WHERE rowid > ?1 AND slug IS NOT NULL AND slug <> ?2 AND status IN ('published','distributed','external_preprint') ORDER BY rowid LIMIT ?3").bind(after, BROWSER_SAMPLE_PIN, n).all();
  let rows = (await pick(prev && Number(prev.cursor) || 0, 4)).results || [];
  if (rows.length < 4) rows = rows.concat((await pick(0, 4 - rows.length)).results || []);
  const results = [], started = Date.now();
  for (const slug of [BROWSER_SAMPLE_PIN].concat(rows.map((x) => x.slug))) {
    if (Date.now() - started > 240000) break;
    try {
      const res = await env.PDF_SVC.fetch("https://qnfo-pdf/math-check/" + encodeURIComponent(slug));
      const j = await res.json();
      results.push(j && j.ok ? { slug, ok: true, typeset: j.typeset, errors: j.errors, raw_dollar: j.raw_dollar, pseudo_residual: j.pseudo_residual, pass: !!j.pass } : { slug, ok: false, pass: false, error: String(j && j.error || "HTTP " + res.status).slice(0, 200) });
    } catch (e) {
      results.push({ slug, ok: false, pass: false, error: String(e && e.message || e).slice(0, 200) });
    }
  }
  const sum = (k) => results.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const out = { checked_at: new Date().toISOString(), source: "qnfo-pdf /math-check (Browser Run, MathJax typeset)", pages: results.length, typeset: sum("typeset"), errors: sum("errors"), raw_dollar: sum("raw_dollar"), failing: results.filter((x) => !x.pass).length, cursor: rows.length ? rows[rows.length - 1].rid : 0, results };
  await env.RELEASES.put(BROWSER_SAMPLE_KEY, JSON.stringify(out), { httpMetadata: { contentType: "application/json" } });
  console.log("MATH-BROWSER-2 sampled " + out.pages + " pages: typeset " + out.typeset + ", errors " + out.errors + ", failing " + out.failing);
  return out;
}
async function handleRenderHealth(env) {
  try {
    const r = await env.LIVING_PAPER.prepare("SELECT slug, render_defects, render_checked_at FROM papers WHERE status IN ('published','distributed','external_preprint') AND render_defects IS NOT NULL AND render_defects <> 0 ORDER BY render_defects DESC, slug").all();
    const n = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS checked, MAX(render_checked_at) AS last FROM papers WHERE status IN ('published','distributed','external_preprint') AND render_checked_at IS NOT NULL").first();
    let browser = null;
    try {
      const o = env.RELEASES ? await env.RELEASES.get(BROWSER_SAMPLE_KEY) : null;
      if (o) browser = await o.json();
    } catch (e) {
    }
    return json({ metric: "paper_render_defect_pages", value: (r.results || []).length, checked: n ? n.checked : 0, last_checked: n ? n.last : null, tests: ["raw ** opening a word", "raw heading marker", "raw table rule", "odd number of unescaped $", "3+ pseudo-math tokens outside math (MATH-TYPESET-1)"], pages: r.results || [], browser_sample: browser });
  } catch (e) {
    console.log("RENDER-HEALTH-1 read failed: " + String(e && e.message || e).slice(0, 200));
    return json({ error: "render health unavailable" }, 503);
  }
}
async function handleSitemap(env, sitemapHost) {
  try {
    const res = await env.LIVING_PAPER.prepare("SELECT slug, created_at FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint') ORDER BY created_at DESC").all();
    const isSite = sitemapHost === "qnfo.org" || sitemapHost === "www.qnfo.org";
    const base = isSite ? "https://qnfo.org" : "https://papers.qnfo.org";
    const ALL = isSite
      ? [
        { loc: "https://qnfo.org/", priority: "1.0" },
        { loc: "https://qnfo.org/papers", priority: "0.9" },
        { loc: "https://qnfo.org/about", priority: "0.8" },
        { loc: "https://qnfo.org/work-with-me", priority: "0.8" },
        { loc: "https://qnfo.org/graph", priority: "0.7" },
        { loc: "https://ideas.qnfo.org", priority: "0.6" },
        { loc: "https://qwav.org", priority: "0.6" },
        { loc: "https://ipatent.qnfo.org/", priority: "0.7" },
        { loc: "https://ipatent.qnfo.org/guide", priority: "0.7" }
      ].concat(res.results.map((p) => ({
        loc: "https://papers.qnfo.org/papers/" + encodeURIComponent(p.slug),
        lastmod: p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : "",
        priority: "0.8"
      })))
      : [
        { loc: base + "/", priority: "1.0" },
        { loc: base + "/papers", priority: "0.9" },
        { loc: base + "/reading", priority: "0.9" }
      ];
    const all = ALL.concat(isSite ? [] : res.results.map((p) => ({
      loc: base + "/papers/" + encodeURIComponent(p.slug),
      lastmod: p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : "",
      priority: "0.8"
    })));
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + all.map((u) => "  <url>\n    <loc>" + xmlEscape(u.loc) + "</loc>" + (u.lastmod ? "\n    <lastmod>" + u.lastmod + "</lastmod>" : "") + "\n    <priority>" + u.priority + "</priority>\n  </url>").join("\n") + "\n</urlset>";
    return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return new Response(
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      { status: 500, headers: { "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
}
__name(handleSitemap, "handleSitemap");
__name2(handleSitemap, "handleSitemap");
__name22(handleSitemap, "handleSitemap");
__name222(handleSitemap, "handleSitemap");
__name2222(handleSitemap, "handleSitemap");
__name22222(handleSitemap, "handleSitemap");
__name222222(handleSitemap, "handleSitemap");
__name2222222(handleSitemap, "handleSitemap");
__name22222222(handleSitemap, "handleSitemap");
__name222222222(handleSitemap, "handleSitemap");
__name2222222222(handleSitemap, "handleSitemap");
function handlePapersRobots() {
  return new Response(
    "User-agent: *\nAllow: /\nSitemap: https://papers.qnfo.org/sitemap.xml\n",
    { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } }
  );
}
__name(handlePapersRobots, "handlePapersRobots");
__name2(handlePapersRobots, "handlePapersRobots");
__name22(handlePapersRobots, "handlePapersRobots");
__name222(handlePapersRobots, "handlePapersRobots");
__name2222(handlePapersRobots, "handlePapersRobots");
__name22222(handlePapersRobots, "handlePapersRobots");
__name222222(handlePapersRobots, "handlePapersRobots");
__name2222222(handlePapersRobots, "handlePapersRobots");
__name22222222(handlePapersRobots, "handlePapersRobots");
__name222222222(handlePapersRobots, "handlePapersRobots");
__name2222222222(handlePapersRobots, "handlePapersRobots");
async function handleLlmsTxt(env) {
  try {
    const res = await env.LIVING_PAPER.prepare("SELECT slug,title,doi,abstract,created_at FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint') ORDER BY created_at DESC LIMIT 200").all();
    const base = "https://papers.qnfo.org";
    let body = "# QNFO Papers\n\n> Open-science research across p-adic mathematics, ultrametric geometry, topological quantum computation.\n\n## Site\n\n- [About QNFO](https://qnfo.org/about)\n- [Work with me: assessments, reviews, talks, collaboration and roles](https://qnfo.org/work-with-me)\n\n## Papers\n\n";
    body += "\n## Open data\n\n- [OAI-PMH 2.0](" + base + "/oai?verb=Identify)\n- [JSON API](" + base + "/api/papers)\n- [OpenAPI](" + base + "/openapi.json)\n- [JSON Feed](" + base + "/feed.json)\n\n## Papers\n\n";
    body += res.results.map((p) => "- [" + displayTitle(p.title) + "](" + base + "/papers/" + encodeURIComponent(p.slug) + ")" + (lpDoi(p.doi) ? " (DOI: " + lpDoi(p.doi) + ")" : "")).join("\n");
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return new Response(
      "# QNFO Papers\n\nIndex temporarily unavailable.\n",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
}
__name(handleLlmsTxt, "handleLlmsTxt");
__name2(handleLlmsTxt, "handleLlmsTxt");
__name22(handleLlmsTxt, "handleLlmsTxt");
__name222(handleLlmsTxt, "handleLlmsTxt");
__name2222(handleLlmsTxt, "handleLlmsTxt");
__name22222(handleLlmsTxt, "handleLlmsTxt");
__name222222(handleLlmsTxt, "handleLlmsTxt");
__name2222222(handleLlmsTxt, "handleLlmsTxt");
__name22222222(handleLlmsTxt, "handleLlmsTxt");
__name222222222(handleLlmsTxt, "handleLlmsTxt");
__name2222222222(handleLlmsTxt, "handleLlmsTxt");
async function handleRss(env) {
  try {
    const res = await env.LIVING_PAPER.prepare("SELECT slug,title,doi,abstract,created_at FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint') ORDER BY created_at DESC LIMIT 50").all();
    const base = "https://papers.qnfo.org";
    const now = (/* @__PURE__ */ new Date()).toUTCString();
    const items = res.results.map((p) => {
      let pubDate = now;
      try {
        pubDate = new Date(p.created_at).toUTCString();
      } catch (e) {
      }
      const link = base + "/papers/" + encodeURIComponent(p.slug);
      return "  <item>\n    <title>" + xmlEscape(displayTitle(p.title)) + "</title>\n    <link>" + xmlEscape(link) + '</link>\n    <guid isPermaLink="true">' + xmlEscape(link) + "</guid>\n    <description>" + xmlEscape(mathPlain(p.abstract || "")) + "</description>\n    <pubDate>" + pubDate + "</pubDate>\n  </item>";
    }).join("\n");
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n  <title>QNFO Papers</title>\n  <link>' + base + "/papers</link>\n  <description>Latest QNFO research publications</description>\n  <lastBuildDate>" + now + "</lastBuildDate>\n" + items + "\n</channel>\n</rss>";
    return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return new Response(
      '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>',
      { status: 500, headers: { "Content-Type": "application/rss+xml; charset=utf-8" } }
    );
  }
}
__name(handleRss, "handleRss");
__name2(handleRss, "handleRss");
__name22(handleRss, "handleRss");
__name222(handleRss, "handleRss");
__name2222(handleRss, "handleRss");
__name22222(handleRss, "handleRss");
__name222222(handleRss, "handleRss");
__name2222222(handleRss, "handleRss");
__name22222222(handleRss, "handleRss");
__name222222222(handleRss, "handleRss");
__name2222222222(handleRss, "handleRss");

// OPEN-DATA-1 (3.12.0, 2026-10-09, pillar reach): open data exchange for papers.qnfo.org. Adds an OAI-PMH 2.0 endpoint
// (/oai, oai_dc, stateless resumption tokens), an open JSON API (/api/papers, /api/papers/<slug>, /feed.json) with an
// OpenAPI 3.1 description (/openapi.json). NOZ-DOI-1 (3.14.0): lpDoi() drops every identifier of the retired deposit prefix, so no page, link,
// citation_doi, JSON-LD, API or OAI record carries one; third-party DOIs pass through unchanged.
var OAI_PAGE = 100;
function oaiStamp(s) {
  const t = String(s || "").trim();
  if (!t) return "1970-01-01T00:00:00Z";
  const d = new Date(/T/.test(t) ? t : t.replace(" ", "T") + "Z");
  return isNaN(d) ? "1970-01-01T00:00:00Z" : d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
function oaiArg(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v + " 00:00:00";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)) return v.slice(0, 10) + " " + v.slice(11, 19);
  return false;
}
function paperKeywords(p) {
  const raw = p.keywords || "";
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map(String).filter(Boolean);
  } catch (e) {
  }
  return String(raw).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
}
function paperSpdx(lic) {
  const l = String(lic || "").toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  if (/^cc-by-4/.test(l)) return "CC-BY-4.0";
  if (/^cc-by-nc-sa-4/.test(l)) return "CC-BY-NC-SA-4.0";
  return null;
}
function openRecord(p) {
  const doi = lpDoi(p.doi);
  return {
    id: "oai:papers.qnfo.org:" + p.slug,
    slug: p.slug,
    title: displayTitle(p.title),
    authors: paperAuthors(p),
    abstract: mdPlain(p.abstract),
    abstract_markdown: p.abstract || "",
    date: String(p.created_at || "").slice(0, 10),
    modified: oaiStamp(p.updated_at || p.created_at),
    version: String(p.version || "").replace(/^v/i, "") || null,
    language: p.language || "en",
    keywords: paperKeywords(p),
    doi: doi,
    doi_url: doi ? "https://doi.org/" + doi : null,
    url: "https://papers.qnfo.org/papers/" + p.slug,
    license_url: paperLicenseUrl(p.license),
    license_spdx: paperSpdx(p.license)
  };
}
var OPEN_COLS = "slug,title,authors,abstract,created_at,updated_at,doi,version,language,keywords,license";
var OPEN_WHERE = "slug IS NOT NULL AND status IN ('published','distributed','external_preprint')";
function oaiXml(body, reqAttrs) {
  const now = (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">\n<responseDate>' + now + "</responseDate>\n<request" + (reqAttrs || "") + ">https://papers.qnfo.org/oai</request>\n" + body + "\n</OAI-PMH>\n", { headers: { "Content-Type": "text/xml; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
}
function oaiError(code, msg, attrs) {
  return oaiXml('<error code="' + code + '">' + xmlEscape(msg) + "</error>", attrs);
}
function oaiHeader(r) {
  return "<header><identifier>" + xmlEscape(r.id) + "</identifier><datestamp>" + r.modified + "</datestamp><setSpec>papers</setSpec></header>";
}
function oaiDc(r) {
  const f = (tag, v) => v ? "<dc:" + tag + ">" + xmlEscape(v) + "</dc:" + tag + ">" : "";
  return '<metadata><oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">' + f("title", r.title) + r.authors.map((a) => f("creator", a)).join("") + r.keywords.map((k) => f("subject", k)).join("") + f("description", r.abstract.slice(0, 3e3)) + f("publisher", "QNFO") + f("date", r.date) + f("type", "Text") + f("format", "text/html") + f("identifier", r.url) + f("identifier", r.doi_url) + f("language", r.language) + f("rights", r.license_url) + "</oai_dc:dc></metadata>";
}
async function handleOai(request, env) {
  const u = new URL(request.url);
  const q = {};
  const dup = [];
  for (const [k, v] of u.searchParams) {
    if (k in q) dup.push(k);
    q[k] = v;
  }
  const attrsOf = (keys) => keys.filter((k) => q[k] !== void 0).map((k) => " " + k + '="' + escAttr(q[k]) + '"').join("");
  const verb = q.verb;
  const known = ["Identify", "ListMetadataFormats", "ListSets", "ListIdentifiers", "ListRecords", "GetRecord"];
  if (!verb || known.indexOf(verb) < 0) return oaiError("badVerb", "Illegal or missing verb", "");
  const reqA = attrsOf(["verb", "identifier", "metadataPrefix", "from", "until", "set", "resumptionToken"]);
  const allowed = { Identify: ["verb"], ListMetadataFormats: ["verb", "identifier"], ListSets: ["verb", "resumptionToken"], GetRecord: ["verb", "identifier", "metadataPrefix"], ListIdentifiers: ["verb", "from", "until", "set", "metadataPrefix", "resumptionToken"], ListRecords: ["verb", "from", "until", "set", "metadataPrefix", "resumptionToken"] }[verb];
  if (dup.length || Object.keys(q).some((k) => allowed.indexOf(k) < 0)) return oaiError("badArgument", "Illegal, repeated or unsupported argument", reqA);
  if (verb === "Identify") {
    let earliest = "1970-01-01T00:00:00Z";
    try {
      const r = await env.LIVING_PAPER.prepare("SELECT MIN(created_at) m FROM papers WHERE " + OPEN_WHERE).first();
      if (r && r.m) earliest = oaiStamp(r.m);
    } catch (e) {
    }
    return oaiXml("<Identify><repositoryName>QNFO Papers</repositoryName><baseURL>https://papers.qnfo.org/oai</baseURL><protocolVersion>2.0</protocolVersion><adminEmail>papers@qnfo.org</adminEmail><earliestDatestamp>" + earliest + "</earliestDatestamp><deletedRecord>no</deletedRecord><granularity>YYYY-MM-DDThh:mm:ssZ</granularity></Identify>", reqA);
  }
  if (verb === "ListMetadataFormats") {
    if (q.identifier) {
      const row = await env.LIVING_PAPER.prepare("SELECT slug FROM papers WHERE " + OPEN_WHERE + " AND slug = ?").bind(q.identifier.replace(/^oai:papers\.qnfo\.org:/, "")).first();
      if (!row) return oaiError("idDoesNotExist", "No such identifier", reqA);
    }
    return oaiXml("<ListMetadataFormats><metadataFormat><metadataPrefix>oai_dc</metadataPrefix><schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema><metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace></metadataFormat></ListMetadataFormats>", reqA);
  }
  if (verb === "ListSets") {
    if (q.resumptionToken) return oaiError("badResumptionToken", "No resumption tokens for ListSets", reqA);
    return oaiXml("<ListSets><set><setSpec>papers</setSpec><setName>All QNFO papers</setName></set></ListSets>", reqA);
  }
  if (verb === "GetRecord") {
    if (!q.identifier || !q.metadataPrefix) return oaiError("badArgument", "identifier and metadataPrefix are required", reqA);
    if (q.metadataPrefix !== "oai_dc") return oaiError("cannotDisseminateFormat", "Only oai_dc is supported", reqA);
    const row = await env.LIVING_PAPER.prepare("SELECT " + OPEN_COLS + " FROM papers WHERE " + OPEN_WHERE + " AND slug = ?").bind(q.identifier.replace(/^oai:papers\.qnfo\.org:/, "")).first();
    if (!row || q.identifier.indexOf("oai:papers.qnfo.org:") !== 0) return oaiError("idDoesNotExist", "No such identifier", reqA);
    const r = openRecord(row);
    return oaiXml("<GetRecord><record>" + oaiHeader(r) + oaiDc(r) + "</record></GetRecord>", reqA);
  }
  let from = q.from, until = q.until, prefix = q.metadataPrefix, offset = 0;
  if (q.resumptionToken) {
    if (from !== void 0 || until !== void 0 || prefix !== void 0 || q.set !== void 0) return oaiError("badArgument", "resumptionToken is exclusive", reqA);
    let t;
    try {
      t = JSON.parse(atob(q.resumptionToken.replace(/-/g, "+").replace(/_/g, "/")));
    } catch (e) {
      return oaiError("badResumptionToken", "Invalid resumptionToken", reqA);
    }
    if (!t || !Number.isInteger(t.o) || t.o < 0) return oaiError("badResumptionToken", "Invalid resumptionToken", reqA);
    offset = t.o;
    from = t.f || void 0;
    until = t.u || void 0;
    prefix = t.p;
  } else if (!prefix) return oaiError("badArgument", "metadataPrefix is required", reqA);
  if (prefix !== "oai_dc") return oaiError("cannotDisseminateFormat", "Only oai_dc is supported", reqA);
  if (q.set !== void 0 && q.set !== "papers") return oaiError("noRecordsMatch", "Unknown set", reqA);
  const f = from !== void 0 ? oaiArg(from) : null, t2 = until !== void 0 ? oaiArg(until) : null;
  if (f === false || t2 === false || from !== void 0 && until !== void 0 && from.length !== until.length) return oaiError("badArgument", "from/until must be YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ, with equal granularity", reqA);
  const dateExpr = "COALESCE(NULLIF(updated_at,''),created_at)";
  const where = [OPEN_WHERE];
  const binds = [];
  if (f) {
    where.push(dateExpr + " >= ?");
    binds.push(f);
  }
  if (t2) {
    where.push(dateExpr + " <= ?");
    binds.push(until.length === 10 ? until + " 23:59:59" : t2);
  }
  const rows = await env.LIVING_PAPER.prepare("SELECT " + OPEN_COLS + " FROM papers WHERE " + where.join(" AND ") + " ORDER BY " + dateExpr + ", slug LIMIT ? OFFSET ?").bind(...binds, OAI_PAGE + 1, offset).all();
  const list = rows.results || [];
  if (!list.length) return oaiError("noRecordsMatch", "No records match", reqA);
  const more = list.length > OAI_PAGE;
  const recs = list.slice(0, OAI_PAGE).map(openRecord);
  let tok = "";
  if (more) {
    const raw = btoa(JSON.stringify({ o: offset + OAI_PAGE, f: from || "", u: until || "", p: prefix })).replace(/\+/g, "-").replace(/\//g, "_");
    tok = '<resumptionToken completeListSize="' + (await env.LIVING_PAPER.prepare("SELECT COUNT(*) n FROM papers WHERE " + where.join(" AND ")).bind(...binds).first()).n + '" cursor="' + offset + '">' + raw + "</resumptionToken>";
  } else if (offset > 0) tok = '<resumptionToken cursor="' + offset + '"></resumptionToken>';
  const body = verb === "ListIdentifiers" ? "<ListIdentifiers>" + recs.map(oaiHeader).join("") + tok + "</ListIdentifiers>" : "<ListRecords>" + recs.map((r) => "<record>" + oaiHeader(r) + oaiDc(r) + "</record>").join("") + tok + "</ListRecords>";
  return oaiXml(body, reqA);
}
function openJson(data, status, extra) {
  return new Response(JSON.stringify(data, null, 2), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" }, extra || {}) });
}
function dataciteOf(r, p) {
  return {
    schemaVersion: "http://datacite.org/schema/kernel-4",
    identifiers: [{ identifier: r.url, identifierType: "URL" }].concat(r.doi ? [{ identifier: r.doi, identifierType: "DOI" }] : []),
    creators: r.authors.map((n) => String(n).indexOf("Quni-Gudzinas") >= 0 ? { name: n, nameType: "Personal", nameIdentifiers: [{ nameIdentifier: "https://orcid.org/" + OWNER_ORCID, nameIdentifierScheme: "ORCID", schemeUri: "https://orcid.org" }] } : { name: n }),
    titles: [{ title: r.title }],
    publisher: "QNFO",
    publicationYear: r.date.slice(0, 4),
    resourceType: { resourceTypeGeneral: "Text", resourceType: "ScholarlyArticle" },
    subjects: r.keywords.map((k) => ({ subject: k })),
    dates: [{ date: r.date, dateType: "Issued" }, { date: r.modified.slice(0, 10), dateType: "Updated" }],
    language: r.language,
    version: r.version,
    rightsList: [Object.assign({ rightsUri: r.license_url }, r.license_spdx ? { rightsIdentifier: r.license_spdx, rightsIdentifierScheme: "SPDX", schemeUri: "https://spdx.org/licenses/" } : {})],
    descriptions: r.abstract ? [{ description: r.abstract.slice(0, 3e3), descriptionType: "Abstract" }] : [],
    formats: ["text/html"]
  };
}
async function handleOpenData(request, env, p) {
  const u = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Max-Age": "86400" } });
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  try {
    if (p === "/oai") return await handleOai(request, env);
    if (p === "/openapi.json") return openJson(OPENAPI_DOC);
    if (p === "/api/papers" || p === "/feed.json") {
      const limit = Math.max(1, Math.min(200, parseInt(u.searchParams.get("limit") || (p === "/feed.json" ? "50" : "50"), 10) || 50));
      const offset = Math.max(0, parseInt(u.searchParams.get("offset") || "0", 10) || 0);
      const since = oaiArg(u.searchParams.get("since") || "");
      if (since === false) return openJson({ error: "since must be YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ" }, 400);
      const dateExpr = "COALESCE(NULLIF(updated_at,''),created_at)";
      const where = OPEN_WHERE + (since ? " AND " + dateExpr + " >= ?" : "");
      const binds = since ? [since] : [];
      const total = (await env.LIVING_PAPER.prepare("SELECT COUNT(*) n FROM papers WHERE " + where).bind(...binds).first()).n;
      const rows = (await env.LIVING_PAPER.prepare("SELECT " + OPEN_COLS + " FROM papers WHERE " + where + " ORDER BY created_at DESC, slug LIMIT ? OFFSET ?").bind(...binds, limit, offset).all()).results || [];
      const recs = rows.map(openRecord);
      if (p === "/feed.json") return openJson({ version: "https://jsonfeed.org/version/1.1", title: "QNFO Papers", home_page_url: "https://papers.qnfo.org/papers", feed_url: "https://papers.qnfo.org/feed.json", language: "en", authors: [{ name: "Rowan Brad Quni-Gudzinas", url: "https://orcid.org/" + OWNER_ORCID }], items: recs.map((r) => ({ id: r.url, url: r.url, title: r.title, summary: r.abstract.slice(0, 600), date_published: r.date + "T00:00:00Z", date_modified: r.modified, tags: r.keywords, external_url: r.doi_url || void 0 })) }, 200, { "Content-Type": "application/feed+json; charset=utf-8" });
      return openJson({ total, limit, offset, next: offset + limit < total ? "https://papers.qnfo.org/api/papers?limit=" + limit + "&offset=" + (offset + limit) + (since ? "&since=" + encodeURIComponent(u.searchParams.get("since")) : "") : null, license_note: "Metadata is CC0 1.0; each paper carries its own license_url.", items: recs });
    }
    if (p.indexOf("/api/papers/") === 0) {
      const slug = decodeURIComponent(p.slice(12));
      const row = await env.LIVING_PAPER.prepare("SELECT " + OPEN_COLS + " FROM papers WHERE " + OPEN_WHERE + " AND slug = ?").bind(slug).first();
      if (!row) return openJson({ error: "not found" }, 404);
      const r = openRecord(row);
      return openJson(Object.assign({}, r, { datacite: dataciteOf(r, row) }));
    }
  } catch (e) {
    return openJson({ error: "open data endpoint failed", detail: String(e && e.message || e).slice(0, 200) }, 500, { "Cache-Control": "no-store" });
  }
  return null;
}
var OPENAPI_DOC = {
  openapi: "3.1.0",
  info: { title: "QNFO Papers open data API", version: "1.0.0", description: "Read-only, CORS-open metadata for the papers published at papers.qnfo.org. Metadata is CC0 1.0; each paper carries its own license_url. Also served: OAI-PMH 2.0 at /oai (oai_dc).", license: { name: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" }, contact: { name: "QNFO", url: "https://qnfo.org" } },
  servers: [{ url: "https://papers.qnfo.org" }],
  paths: {
    "/api/papers": { get: { summary: "List papers, newest first", parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } }, { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } }, { name: "since", in: "query", description: "Only papers modified at or after this date (YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ).", schema: { type: "string" } }], responses: { "200": { description: "A page of papers", content: { "application/json": { schema: { $ref: "#/components/schemas/PaperList" } } } } } } },
    "/api/papers/{slug}": { get: { summary: "One paper with DataCite-style metadata", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "The paper", content: { "application/json": { schema: { $ref: "#/components/schemas/Paper" } } } }, "404": { description: "No such paper" } } } },
    "/feed.json": { get: { summary: "JSON Feed 1.1 of the newest papers", responses: { "200": { description: "JSON Feed", content: { "application/feed+json": { schema: { type: "object" } } } } } } },
    "/oai": { get: { summary: "OAI-PMH 2.0 (Identify, ListMetadataFormats, ListSets, ListIdentifiers, ListRecords, GetRecord; oai_dc)", parameters: [{ name: "verb", in: "query", required: true, schema: { type: "string", enum: ["Identify", "ListMetadataFormats", "ListSets", "ListIdentifiers", "ListRecords", "GetRecord"] } }, { name: "metadataPrefix", in: "query", schema: { type: "string", enum: ["oai_dc"] } }, { name: "identifier", in: "query", schema: { type: "string" } }, { name: "from", in: "query", schema: { type: "string" } }, { name: "until", in: "query", schema: { type: "string" } }, { name: "set", in: "query", schema: { type: "string", enum: ["papers"] } }, { name: "resumptionToken", in: "query", schema: { type: "string" } }], responses: { "200": { description: "OAI-PMH XML (errors are returned in-band as <error>)", content: { "text/xml": { schema: { type: "string" } } } } } } }
  },
  components: { schemas: {
    Paper: { type: "object", properties: { id: { type: "string", description: "OAI identifier" }, slug: { type: "string" }, title: { type: "string" }, authors: { type: "array", items: { type: "string" } }, abstract: { type: "string" }, abstract_markdown: { type: "string", description: "The abstract as written, Markdown with TeX math." }, date: { type: "string", format: "date" }, modified: { type: "string", format: "date-time" }, version: { type: ["string", "null"] }, language: { type: "string" }, keywords: { type: "array", items: { type: "string" } }, doi: { type: ["string", "null"], description: "Only a DOI that currently resolves; deleted DOIs are omitted." }, doi_url: { type: ["string", "null"] }, url: { type: "string", format: "uri" }, license_url: { type: "string", format: "uri" }, license_spdx: { type: ["string", "null"] }, datacite: { type: "object" } } },
    PaperList: { type: "object", properties: { total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" }, next: { type: ["string", "null"] }, items: { type: "array", items: { $ref: "#/components/schemas/Paper" } } } }
  } }
};
function health() {
  return json({ status: "ok", worker: "qnfo-gateway", version: VERSION, capabilities: ["papers-site", "paper-pages", "living-paper-reader", "paper-context-api", "graph-api", "ask-a-paper", "legal-pages", "work-with-me-page"], limitations: ["paper pages ask through ask.qwav.tech /api/ask (qnfo-ai-search 2.1+, the paper pinned as source [1], capped per address); without JavaScript the page is the full static paper", "GET /api/paper-context/<slug> matches qnfo-graph nodes on title terms (two terms, or one of 6+ letters), so a paper outside the graph shows an empty Context tab; versions are papers whose normalized titles match", "qnfo.org/work-with-me has no form: each offer is a mailto to rowan.quni@qnfo.org whose subject starts with [work-with-me:<offer>], counted by qnfo-fleet-dashboard", "Ask-a-paper (POST /api/ask) uses one model (llama-3.3-70b-instruct-fp8-fast) with a 1200-token cap and only the first 6000 characters of the named paper", "Ask-a-paper allows 10 questions per address per hour and 300 per day in total, questions up to 1000 characters; duplicate, kg-backfill and quarantined papers are excluded", "graph-api reads are public; /query and /sync need the sync token"] });
}
__name(health, "health");
__name2(health, "health");
__name22(health, "health");
__name222(health, "health");
__name2222(health, "health");
__name22222(health, "health");
__name222222(health, "health");
__name2222222(health, "health");
__name22222222(health, "health");
__name222222222(health, "health");
__name2222222222(health, "health");
// LEGAL-VERSIONS-1 (3.11.0, 2026-10-06, pillar research): QNFO-ULA v2.1 adds Software Terms (section 12), because
// Creative Commons licenses are not written for software. QNFO/license is the canonical source of the text; a version is
// posted when its Markdown file is on that repository's default branch. legal.qnfo.org serves the newest posted
// version at /, each version at /v<x.y>, and plain text at /plain and /v<x.y>/plain. A version is read from R2
// (legal/ula-v<x.y>.md) and, when absent there, once from QNFO/license on GitHub and kept in R2; a version that is not
// posted is remembered as missing for an hour, so an unposted v2.1 costs one GitHub read an hour, not one a request.
// Until v2.1 is on QNFO/license, every path serves v2.0 exactly as before.
var ULA_VERSIONS = ["2.1", "2.0"];
var ulaMissUntil = {};
function legalRedirectPath(p) {
  const m = /\/v?(\d+\.\d+)$/.exec(p);
  return m && ULA_VERSIONS.indexOf(m[1]) >= 0 ? "/v" + m[1] : "/";
}
async function ulaText(env, ver) {
  const key = "legal/ula-v" + ver + ".md";
  const o = await env.QNFO_BUCKET.get(key);
  if (o) return o.text();
  if ((ulaMissUntil[ver] || 0) > Date.now()) return null;
  try {
    const r = await fetch("https://raw.githubusercontent.com/QNFO/license/HEAD/QNFO-ULA-v" + ver + ".md", { headers: { "User-Agent": "qnfo-gateway/" + VERSION } });
    const t = r.status === 200 ? await r.text() : "";
    if (t.length > 2000 && t.indexOf("QNFO Unified License Agreement") >= 0 && t.indexOf("Version " + ver) >= 0) {
      await env.QNFO_BUCKET.put(key, t, { httpMetadata: { contentType: "text/markdown; charset=utf-8" } });
      return t;
    }
  } catch (e) {
  }
  ulaMissUntil[ver] = Date.now() + 3600 * 1000;
  return null;
}
async function ulaLatest(env) {
  for (const v of ULA_VERSIONS) {
    const t = await ulaText(env, v);
    if (t) return { ver: v, text: t };
  }
  return { ver: "2.0", text: "# QNFO Unified License Agreement v2.0\n\nFull text at https://legal.qnfo.org" };
}
async function handleLegal(path, env) {
  // SEO-HYGIENE-1 (2026-10-06): legal.qnfo.org answered every path with the license page, so /robots.txt and /sitemap.xml
  // were HTML and every typo was a soft 404. Known paths serve the license; robots and sitemap are real; the rest is 404.
  if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: https://legal.qnfo.org/sitemap.xml\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
  if (path === "/sitemap.xml") return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://legal.qnfo.org/</loc></url><url><loc>https://legal.qnfo.org/privacy</loc></url></urlset>', { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
  const vm = /^\/v(\d+\.\d+)(\/plain)?$/.exec(path);
  if (!vm && ["/", "/index.html", "/legal", "/license", "/plain", "/text"].indexOf(path) < 0) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
  if (vm && ULA_VERSIONS.indexOf(vm[1]) < 0) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
  try {
    let doc;
    if (vm) {
      const t = await ulaText(env, vm[1]);
      if (!t) return new Response("QNFO-ULA v" + vm[1] + " is not posted. The current version is at https://legal.qnfo.org/", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
      doc = { ver: vm[1], text: t };
    } else doc = await ulaLatest(env);
    const ver = doc.ver, text = doc.text;
    const isPlain = path === "/plain" || path === "/text" || !!(vm && vm[2]);
    if (isPlain) return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
    let md = fixMojibake(text).replace(/^\s*#\s+[^\n]*\n+/, "");
    const others = ULA_VERSIONS.filter((v) => v !== ver).map((v) => '<a href="/v' + v + '">v' + v + "</a>").join(", ");
    const body = '<div class="q-wrap"><article class="q-article"><div><header class="q-article-head"><p class="q-eyebrow">License</p><h1 class="q-h1">QNFO Unified License Agreement, version ' + ver + '</h1><p class="q-meta">The license for all QNFO research, data, code and sites. <a href="' + (vm ? "/v" + ver + "/plain" : "/plain") + '">Plain text</a>' + (others ? " \u00b7 Other versions: " + others : "") + '</p></header><div class="q-prose">' + renderMarkdown(md) + '</div></div><aside class="q-article-aside" aria-label="Contents"><section class="q-toc-wrap"><h2>Contents</h2><ol class="q-toc" data-q-toc=".q-prose"></ol></section></aside></article></div>';
    return new Response(qdsPage({ title: "QNFO Unified License Agreement v" + ver + " (QNFO-ULA)", description: "The QNFO Unified License Agreement v" + ver + ": open science with commercial protections, for all QNFO research, data, code and sites.", canonical: "https://legal.qnfo.org/" + (vm ? "v" + ver : ""), math: false, active: "" }, body), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
__name(handleLegal, "handleLegal");
__name2(handleLegal, "handleLegal");
__name22(handleLegal, "handleLegal");
__name222(handleLegal, "handleLegal");
__name2222(handleLegal, "handleLegal");
__name22222(handleLegal, "handleLegal");
__name222222(handleLegal, "handleLegal");
__name2222222(handleLegal, "handleLegal");
__name22222222(handleLegal, "handleLegal");
__name222222222(handleLegal, "handleLegal");
__name2222222222(handleLegal, "handleLegal");
/* GATEWAY-ASK-RATE-LIMIT-1 (2026-10-01): POST /api/ask is public and each call is a Workers AI completion.
   Counters live in this worker's own D1 (qnfo-graph, table ask_rate): ASK_PER_IP_HOUR per hashed client IP
   per UTC hour, ASK_PER_DAY across all callers per UTC day. Raw IPs are never stored. The daily cron
   prunes rows older than two days. A counter failure lets the call through (the AI cost stays bounded by
   the question cap below); a limit hit returns 429 before any model call. */
var ASK_PER_IP_HOUR = 10;
var ASK_PER_DAY = 300;
var ASK_QUESTION_MAX = 1000;
var askRateReady = false;
async function askRateHit(env, key) {
  if (!askRateReady) {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS ask_rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, ts TEXT NOT NULL)").run();
    askRateReady = true;
  }
  const r = await env.DB.prepare("INSERT INTO ask_rate (k, n, ts) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n").bind(key, new Date().toISOString()).first();
  return r && r.n || 0;
}
async function askRateCheck(request, env) {
  if (!env.DB) return null;
  try {
    const now = new Date().toISOString();
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ask-rate:" + (env.SYNC_TOKEN || "") + ":" + ip));
    const h = Array.from(new Uint8Array(digest).slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (await askRateHit(env, "ip:" + h + ":" + now.slice(0, 13)) > ASK_PER_IP_HOUR) return json({ error: "Too many questions from this address; try again next hour." }, 429);
    if (await askRateHit(env, "day:" + now.slice(0, 10)) > ASK_PER_DAY) return json({ error: "The daily question budget is spent; try again tomorrow (UTC)." }, 429);
  } catch (e) {
  }
  return null;
}
async function askRatePrune(env) {
  if (!env.DB) return;
  try {
    await env.DB.prepare("DELETE FROM ask_rate WHERE ts < ?1").bind(new Date(Date.now() - 2 * 864e5).toISOString()).run();
  } catch (e) {
  }
}
// ---- ASK-GROUND-BEGIN: ASK-GROUND-1 (owner directive 2026-10-10): /api/ask answers only from the supplied paper text ----
var ASK_PAPER_MAX = 36000;
var ASK_NO_SOURCE = "No paper text was supplied for this question, so no answer is given.";
function askGroundNums(text) {
  var set = new Set();
  (String(text || "").match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(function (n) { set.add(n.replace(/,/g, "").replace(/\.0+$/, "")); });
  return set;
}
// Problems in one sentence of the answer: identifiers, links, citations and figures that the supplied text does not contain.
function askSentenceProblems(sent, gl, gnums) {
  var out = [];
  var s = String(sent).replace(/`[^`]*`/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, " ");
  (s.match(/\b10\.\d{4,9}\/[^\s"<>)\]]+/g) || []).forEach(function (d) { d = d.replace(/[.,;:]+$/, "").toLowerCase(); if (gl.indexOf(d) < 0) out.push("doi: " + d); });
  (s.match(/https?:\/\/[^\s)<>\]"]+/gi) || []).forEach(function (u) { var k = u.toLowerCase().replace(/[.,;:)\]]+$/, "").replace(/\/+$/, ""); if (gl.indexOf(k) < 0) out.push("link: " + u); });
  if (/\bet al\b/i.test(s) && gl.indexOf("et al") < 0) out.push("author citation: et al");
  var body = s.replace(/^\s*(?:[-*+]\s+|\d{1,2}[.)]\s+)/, " ").replace(/10\.\d{4,9}\/\S+/g, " ").replace(/https?:\/\/\S+/gi, " ");
  var re = /(\$?)(\d[\d,]*(?:\.\d+)?)(\s*(?:%|percent|[a-z]{2,}\b)?)/gi, m;
  while ((m = re.exec(body))) {
    var num = m[2].replace(/,/g, "").replace(/\.0+$/, "");
    if (gnums.has(num)) continue;
    if (/^\d{1,2}$/.test(num) && Number(num) <= 10 && !m[1] && !/^(%|percent)$/i.test((m[3] || "").trim())) continue;
    out.push("figure: " + (m[1] + m[2] + " " + (m[3] || "")).trim());
  }
  return out;
}
// Removes every sentence with an identifier, link, citation or figure absent from `ground`. Returns { text, removed }.
function askGroundAnswer(text, ground) {
  var gl = String(ground || "").toLowerCase(), gnums = askGroundNums(ground), removed = 0;
  var parts = String(text || "").split(/(```[\s\S]*?```)/);
  for (var pi = 0; pi < parts.length; pi++) {
    if (/^```/.test(parts[pi])) continue;
    var lines = parts[pi].split("\n");
    for (var li = 0; li < lines.length; li++) {
      if (!lines[li].trim()) continue;
      var lead = (lines[li].match(/^\s*(?:[-*+]\s+|\d{1,2}[.)]\s+|>\s*)?/) || [""])[0];
      var kept = [];
      lines[li].slice(lead.length).split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[*_])/).forEach(function (sn) {
        if (askSentenceProblems(sn, gl, gnums).length) removed++; else kept.push(sn);
      });
      lines[li] = kept.length ? lead + kept.join(" ") : "";
    }
    parts[pi] = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }
  var out = parts.join("").trim();
  if (removed) out += "\n\n_" + removed + " statement" + (removed === 1 ? "" : "s") + " removed: each carried a DOI, link, author citation or figure that is not in the paper text._";
  return { text: out, removed: removed };
}
function askSystemPrompt(paperTitle) {
  return 'You answer questions about one paper titled "' + paperTitle + '". The only source is the PAPER TEXT in the user message. '
    + "Rules: (1) State only what the paper text states or what follows directly from it; quote or paraphrase it closely. "
    + "(2) Your memory is not a source: add no names, dates, figures, citations, identifiers or links that are not in the paper text. "
    + "(3) When the paper text does not cover the question, or covers it only in part, say exactly which part it does not cover. "
    + "(4) If the supplied text is cut off, say that the answer is limited to the text supplied. Output the answer only.";
}
async function handleAskAI(request, env) {
  if (!env.AI) return json({ error: "AI binding not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const { slug, question } = body;
  if (!question || typeof question !== "string" || !question.trim()) return json({ error: "Missing question" }, 400);
  if (question.length > ASK_QUESTION_MAX) return json({ error: "Question too long (max " + ASK_QUESTION_MAX + " characters)" }, 413);
  // ASK-GROUND-1: no paper, no answer. A missing or unknown slug used to send an empty "Paper content:" to the model, which then
  // answered from memory. It now returns a no-source response and makes no model call (and spends no rate-limit budget).
  if (!slug || typeof slug !== "string" || !slug.trim()) return json({ error: "no_source", answer: null, grounded: false, message: "A paper slug is required; this endpoint answers only from the text of one published paper." }, 400);
  const limited = await askRateCheck(request, env);
  if (limited) return limited;
  try {
    let paperTitle = "", paperBody = "", truncated = false;
    const paper = await env.LIVING_PAPER.prepare("SELECT title,body_md,abstract FROM papers WHERE slug = ? AND status IN ('published','distributed','external_preprint') LIMIT 1").bind(slug).first();
    if (paper) {
      paperTitle = paper.title || "";
      const full = stripFrontmatter(paper.body_md) || paper.abstract || "";
      paperBody = full.slice(0, ASK_PAPER_MAX);
      truncated = full.length > ASK_PAPER_MAX;
    }
    if (!paperBody.trim()) return json({ error: "no_source", answer: null, grounded: false, slug, message: "No published paper text was found for this slug, so no answer is given." }, 404);
    // ASK-MODEL-1 (3.8.4): glm-5.3-flash is a reasoning model; within 2048 tokens it often returned no answer at all
    // (measured on ask.qwav.tech, ASK-LOOP-1 2.0.2). Same non-reasoning model as ask.qwav.tech's champion; any <think>
    // block is removed. Paper pages ask through ask.qwav.tech; this route stays for API callers.
    const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: askSystemPrompt(paperTitle) },
        { role: "user", content: "QUESTION: " + question + "\n\nPAPER TEXT" + (truncated ? " (first " + ASK_PAPER_MAX + " characters of a longer paper)" : "") + ":\n" + paperBody }
      ],
      max_tokens: 1200,
      temperature: 0.1
    });
    const raw = String(result && (result.response || (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content)) || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!raw) return json({ error: "The model returned no answer; try again later." }, 502);
    const g = askGroundAnswer(raw, paperTitle + "\n" + question + "\n" + paperBody);
    return json({ answer: g.text || "No part of the generated answer could be matched to the paper text, so no answer is given.", slug, grounded: true, removed_statements: g.removed, source_chars: paperBody.length, source_truncated: truncated, model: "llama-3.3-70b-instruct-fp8-fast" });
  } catch (e) {
    return json({ error: "The model call failed; try again later." }, 502);
  }
}
// ---- ASK-GROUND-END ----
__name(handleAskAI, "handleAskAI");
__name2(handleAskAI, "handleAskAI");
__name22(handleAskAI, "handleAskAI");
__name222(handleAskAI, "handleAskAI");
__name2222(handleAskAI, "handleAskAI");
__name22222(handleAskAI, "handleAskAI");
__name222222(handleAskAI, "handleAskAI");
__name2222222(handleAskAI, "handleAskAI");
__name22222222(handleAskAI, "handleAskAI");
__name222222222(handleAskAI, "handleAskAI");
__name2222222222(handleAskAI, "handleAskAI");
async function handleStats(env) {
  try {
    const [nc, ec, nl, et] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM nodes").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM edges").first(),
      env.DB.prepare("SELECT DISTINCT label FROM nodes ORDER BY label").all(),
      env.DB.prepare("SELECT DISTINCT relationship_type FROM edges ORDER BY relationship_type").all()
    ]);
    return json({
      totalNodes: nc?.count || 0,
      totalEdges: ec?.count || 0,
      nodeLabels: nl.results.map((r) => r.label),
      relationshipTypes: et.results.map((r) => r.relationship_type)
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
__name(handleStats, "handleStats");
__name2(handleStats, "handleStats");
__name22(handleStats, "handleStats");
__name222(handleStats, "handleStats");
__name2222(handleStats, "handleStats");
__name22222(handleStats, "handleStats");
__name222222(handleStats, "handleStats");
__name2222222(handleStats, "handleStats");
__name22222222(handleStats, "handleStats");
__name222222222(handleStats, "handleStats");
__name2222222222(handleStats, "handleStats");
function sjp(str) {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch (e) {
    return {};
  }
}
__name(sjp, "sjp");
__name2(sjp, "sjp");
__name22(sjp, "sjp");
__name222(sjp, "sjp");
__name2222(sjp, "sjp");
__name22222(sjp, "sjp");
__name222222(sjp, "sjp");
__name2222222(sjp, "sjp");
__name22222222(sjp, "sjp");
__name222222222(sjp, "sjp");
__name2222222222(sjp, "sjp");
async function handleNodesList(url, env) {
  const label = url.searchParams.get("label");
  const search = url.searchParams.get("search");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  let sql = "SELECT id,name,label,properties FROM nodes";
  const conds = [], pars = [];
  if (label) {
    conds.push("label = ?");
    pars.push(label);
  }
  if (search) {
    conds.push("name LIKE ?");
    pars.push("%" + search + "%");
  }
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += " ORDER BY name LIMIT ?";
  pars.push(limit);
  const res = await env.DB.prepare(sql).bind(...pars).all();
  return json({ nodes: res.results.map((r) => {
    r.properties = sjp(r.properties);
    return r;
  }), count: res.results.length });
}
__name(handleNodesList, "handleNodesList");
__name2(handleNodesList, "handleNodesList");
__name22(handleNodesList, "handleNodesList");
__name222(handleNodesList, "handleNodesList");
__name2222(handleNodesList, "handleNodesList");
__name22222(handleNodesList, "handleNodesList");
__name222222(handleNodesList, "handleNodesList");
__name2222222(handleNodesList, "handleNodesList");
__name22222222(handleNodesList, "handleNodesList");
__name222222222(handleNodesList, "handleNodesList");
__name2222222222(handleNodesList, "handleNodesList");
async function handleNodeGet(id, env) {
  const node = await env.DB.prepare("SELECT id,name,label,properties FROM nodes WHERE id = ? OR name = ?").bind(id, id).first();
  if (!node) return json({ error: "Node not found: " + id }, 404);
  const rels = await env.DB.prepare(
    "SELECT e.id,e.relationship_type,e.properties, CASE WHEN e.source_id = ? THEN 'outgoing' ELSE 'incoming' END as direction, CASE WHEN e.source_id = ? THEN e.target_id ELSE e.source_id END as other_id FROM edges e WHERE e.source_id = ? OR e.target_id = ? ORDER BY e.relationship_type"
  ).bind(node.id, node.id, node.id, node.id).all();
  return json({
    id: node.id,
    name: node.name,
    label: node.label,
    properties: sjp(node.properties),
    relationships: rels.results.map((r) => ({ id: r.id, type: r.relationship_type, direction: r.direction, otherId: r.other_id, properties: sjp(r.properties) }))
  });
}
__name(handleNodeGet, "handleNodeGet");
__name2(handleNodeGet, "handleNodeGet");
__name22(handleNodeGet, "handleNodeGet");
__name222(handleNodeGet, "handleNodeGet");
__name2222(handleNodeGet, "handleNodeGet");
__name22222(handleNodeGet, "handleNodeGet");
__name222222(handleNodeGet, "handleNodeGet");
__name2222222(handleNodeGet, "handleNodeGet");
__name22222222(handleNodeGet, "handleNodeGet");
__name222222222(handleNodeGet, "handleNodeGet");
__name2222222222(handleNodeGet, "handleNodeGet");
async function handleNeighbors(id, env) {
  const node = await env.DB.prepare("SELECT id,name,label FROM nodes WHERE id = ? OR name = ?").bind(id, id).first();
  if (!node) return json({ error: "Node not found: " + id }, 404);
  const nbrs = await env.DB.prepare(
    "SELECT DISTINCT n.id,n.name,n.label,n.properties,e.relationship_type, CASE WHEN e.source_id = ? THEN 'outgoing' ELSE 'incoming' END as direction FROM edges e JOIN nodes n ON (CASE WHEN e.source_id = ? THEN e.target_id ELSE e.source_id END) = n.id WHERE e.source_id = ? OR e.target_id = ? ORDER BY n.label,n.name"
  ).bind(node.id, node.id, node.id, node.id).all();
  return json({
    node: { id: node.id, name: node.name, label: node.label },
    neighbors: nbrs.results.map((n) => ({ id: n.id, name: n.name, label: n.label, relationshipType: n.relationship_type, direction: n.direction, properties: sjp(n.properties) })),
    count: nbrs.results.length
  });
}
__name(handleNeighbors, "handleNeighbors");
__name2(handleNeighbors, "handleNeighbors");
__name22(handleNeighbors, "handleNeighbors");
__name222(handleNeighbors, "handleNeighbors");
__name2222(handleNeighbors, "handleNeighbors");
__name22222(handleNeighbors, "handleNeighbors");
__name222222(handleNeighbors, "handleNeighbors");
__name2222222(handleNeighbors, "handleNeighbors");
__name22222222(handleNeighbors, "handleNeighbors");
__name222222222(handleNeighbors, "handleNeighbors");
__name2222222222(handleNeighbors, "handleNeighbors");
async function handleEdges(url, env) {
  const type = url.searchParams.get("type");
  const source = url.searchParams.get("source");
  const target = url.searchParams.get("target");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  const conds = [], pars = [];
  if (type) {
    conds.push("e.relationship_type = ?");
    pars.push(type);
  }
  if (source) {
    conds.push("e.source_id = ?");
    pars.push(source);
  }
  if (target) {
    conds.push("e.target_id = ?");
    pars.push(target);
  }
  let sql = "SELECT e.id,e.source_id,e.target_id,e.relationship_type,e.properties FROM edges e";
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += " ORDER BY e.relationship_type LIMIT ?";
  pars.push(limit);
  const res = await env.DB.prepare(sql).bind(...pars).all();
  return json({ edges: res.results.map((e) => {
    e.properties = sjp(e.properties);
    return e;
  }), count: res.results.length });
}
__name(handleEdges, "handleEdges");
__name2(handleEdges, "handleEdges");
__name22(handleEdges, "handleEdges");
__name222(handleEdges, "handleEdges");
__name2222(handleEdges, "handleEdges");
__name22222(handleEdges, "handleEdges");
__name222222(handleEdges, "handleEdges");
__name2222222(handleEdges, "handleEdges");
__name22222222(handleEdges, "handleEdges");
__name222222222(handleEdges, "handleEdges");
__name2222222222(handleEdges, "handleEdges");
async function handleImpact(name, env) {
  const node = await env.DB.prepare("SELECT id,name,label FROM nodes WHERE id = ? OR name = ?").bind(name, name).first();
  if (!node) return json({ error: "Node not found: " + name }, 404);
  const deps = [], visited = /* @__PURE__ */ new Set([node.id]);
  let queue = [node.id], depth = 0;
  while (queue.length > 0 && depth < 10) {
    depth++;
    const nq = [];
    for (let i = 0; i < queue.length; i++) {
      const cid = queue[i];
      const edges = await env.DB.prepare(
        "SELECT e.id,e.source_id,e.target_id,e.relationship_type,e.properties, n.name as source_name,n.label as source_label, n2.name as target_name,n2.label as target_label FROM edges e JOIN nodes n ON e.source_id=n.id JOIN nodes n2 ON e.target_id=n2.id WHERE e.source_id = ?"
      ).bind(cid).all();
      for (let j = 0; j < edges.results.length; j++) {
        const edge = edges.results[j];
        if (!visited.has(edge.target_id)) {
          visited.add(edge.target_id);
          deps.push({ id: edge.target_id, name: edge.target_name, label: edge.target_label, relationshipType: edge.relationship_type, depth });
          nq.push(edge.target_id);
        }
      }
    }
    queue = nq;
  }
  return json({ node: { id: node.id, name: node.name, label: node.label }, dependents: deps, totalDependents: deps.length, maxDepth: depth });
}
__name(handleImpact, "handleImpact");
__name2(handleImpact, "handleImpact");
__name22(handleImpact, "handleImpact");
__name222(handleImpact, "handleImpact");
__name2222(handleImpact, "handleImpact");
__name22222(handleImpact, "handleImpact");
__name222222(handleImpact, "handleImpact");
__name2222222(handleImpact, "handleImpact");
__name22222222(handleImpact, "handleImpact");
__name222222222(handleImpact, "handleImpact");
__name2222222222(handleImpact, "handleImpact");
// QUERY-AUTH-1 (2026-10-01): /query executes caller-supplied SQL on the graph D1, so it takes the
// same X-Sync-Token as /sync. Fails closed when SYNC_TOKEN is unset; constant-time compare.
function syncTokenOk(request, env) {
  const exp = env.SYNC_TOKEN;
  const got = request.headers.get("X-Sync-Token");
  if (!exp || !got || got.length !== exp.length) return false;
  let d = 0;
  for (let i = 0; i < exp.length; i++) d |= got.charCodeAt(i) ^ exp.charCodeAt(i);
  return d === 0;
}
async function handleQuery(request, env) {
  if (!syncTokenOk(request, env)) {
    return json({ error: "Unauthorized: missing or invalid X-Sync-Token" }, 401);
  }
  const body = await request.json().catch(() => ({}));
  const { query, params: qParams } = body;
  if (!query) return json({ error: "Missing query" }, 400);
  try {
    let stmt = env.DB.prepare(query);
    if (qParams && qParams.length) stmt = stmt.bind(...qParams);
    const res = await stmt.all();
    return json(res);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
__name(handleQuery, "handleQuery");
__name2(handleQuery, "handleQuery");
__name22(handleQuery, "handleQuery");
__name222(handleQuery, "handleQuery");
__name2222(handleQuery, "handleQuery");
__name22222(handleQuery, "handleQuery");
__name222222(handleQuery, "handleQuery");
__name2222222(handleQuery, "handleQuery");
__name22222222(handleQuery, "handleQuery");
__name222222222(handleQuery, "handleQuery");
__name2222222222(handleQuery, "handleQuery");
async function handleSync(request, env) {
  if (request.headers.get("X-Sync-Token") !== env.SYNC_TOKEN) {
    return json({ error: "Unauthorized: missing or invalid X-Sync-Token" }, 401);
  }
  const body = await request.json().catch(() => ({}));
  const { action, nodes = [], edges = [] } = body;
  if (action !== "bulk") return json({ error: "Only bulk sync supported" }, 400);
  const results = { nodesInserted: 0, edgesInserted: 0, errors: [] };
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    try {
      await env.DB.prepare(
        "INSERT INTO nodes (id,name,label,properties) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,label=excluded.label,properties=excluded.properties"
      ).bind(node.id, node.name, node.label, typeof node.properties === "object" ? JSON.stringify(node.properties) : node.properties || "{}").run();
      results.nodesInserted++;
    } catch (e) {
      results.errors.push("Node " + node.id + ": " + e.message);
    }
  }
  for (let j = 0; j < edges.length; j++) {
    const edge = edges[j];
    try {
      await env.DB.prepare(
        "INSERT INTO edges (id,source_id,target_id,relationship_type,properties) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,target_id=excluded.target_id,relationship_type=excluded.relationship_type,properties=excluded.properties"
      ).bind(edge.id, edge.source_id, edge.target_id, edge.relationship_type, typeof edge.properties === "object" ? JSON.stringify(edge.properties) : edge.properties || "{}").run();
      results.edgesInserted++;
    } catch (e) {
      results.errors.push("Edge " + edge.id + ": " + e.message);
    }
  }
  return json({ success: true, nodesInserted: results.nodesInserted, edgesInserted: results.edgesInserted, errors: results.errors });
}
__name(handleSync, "handleSync");
__name2(handleSync, "handleSync");
__name22(handleSync, "handleSync");
__name222(handleSync, "handleSync");
__name2222(handleSync, "handleSync");
__name22222(handleSync, "handleSync");
__name222222(handleSync, "handleSync");
__name2222222(handleSync, "handleSync");
__name22222222(handleSync, "handleSync");
__name222222222(handleSync, "handleSync");
__name2222222222(handleSync, "handleSync");
var SUBSCRIBERS_ENDPOINT = "https://qnfo-subscribers.q08.workers.dev";
async function handleConfirmProxy(request, env) {
  const u = new URL(request.url);
  const token = u.searchParams.get("token") || "";
  if (!token) return new Response("Missing confirmation token.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const ctrl = new AbortController();
  const timer = setTimeout(function() {
    ctrl.abort();
  }, 9e3);
  try {
    const r = await fetch(SUBSCRIBERS_ENDPOINT + "/confirm?token=" + encodeURIComponent(token), { signal: ctrl.signal });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response("Confirmation is unavailable right now.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } finally {
    clearTimeout(timer);
  }
}
__name(handleConfirmProxy, "handleConfirmProxy");
__name2(handleConfirmProxy, "handleConfirmProxy");
// SUBSCRIBE-SOURCE-1 (3.9.2, 2026-10-02, pillar reach): a subscription records the form, the page it was made on and that
// page's utm_campaign ("papers|/reading|living-papers"), read from the Referer the same-origin form fetch sends, so a
// subscription can be joined to the post or page that caused it (subscribers.source, 80 characters; STRATEGY 6.4 named
// "subscriptions per post" as unmeasurable). Without a Referer it is the form's own label, as before.
function subscribeSource(request, payload) {
  const form = String(payload && payload.source || "qnfo.org").replace(/\|/g, "/").slice(0, 24);
  let page = "", camp = "";
  try {
    const ref = new URL(request.headers.get("Referer") || "");
    page = ref.pathname.slice(0, 40);
    camp = String(ref.searchParams.get("utm_campaign") || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24);
  } catch (e) {
  }
  return (form + (page ? "|" + page : "") + (camp ? "|" + camp : "")).slice(0, 80);
}
async function handleSubscribeProxy(request, env) {
  let payload = {};
  try {
    payload = await request.json();
  } catch (e) {
    payload = {};
  }
  const email = String(payload && payload.email || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^@\s]{1,64}@[^@\s.]{1,255}\.[^@\s.]{2,}$/.test(email)) {
    return json({ ok: false, error: "Please enter a valid email address." }, 400);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(function() {
    ctrl.abort();
  }, 9e3);
  try {
    const r = await fetch(SUBSCRIBERS_ENDPOINT + "/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "qnfo-gateway/3.6",
        "X-Forwarded-For": request.headers.get("CF-Connecting-IP") || "",
        "X-Client-UA": String(request.headers.get("User-Agent") || "").slice(0, 300)
      },
      body: JSON.stringify({ email, hp: String(payload && payload.hp || ""), source: subscribeSource(request, payload) }),
      signal: ctrl.signal
    });
    const data = await r.json().catch(function() {
      return {};
    });
    return json(data && typeof data === "object" ? data : { ok: false, error: "Sign-up failed." }, r.status);
  } catch (e) {
    return json({ ok: false, error: "Sign-up is unavailable right now. Please try again shortly." }, 502);
  } finally {
    clearTimeout(timer);
  }
}
__name(handleSubscribeProxy, "handleSubscribeProxy");
__name2(handleSubscribeProxy, "handleSubscribeProxy");
async function handleUnsubscribeProxy(request, env) {
  const u = new URL(request.url);
  const token = u.searchParams.get("token") || "";
  if (!token) return new Response("Missing unsubscribe token.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const ctrl = new AbortController();
  const timer = setTimeout(function() {
    ctrl.abort();
  }, 9e3);
  try {
    const r = await fetch(SUBSCRIBERS_ENDPOINT + "/unsubscribe?token=" + encodeURIComponent(token), { signal: ctrl.signal });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response("Unsubscribe is unavailable right now.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } finally {
    clearTimeout(timer);
  }
}
__name(handleUnsubscribeProxy, "handleUnsubscribeProxy");
__name2(handleUnsubscribeProxy, "handleUnsubscribeProxy");
// FLEET-CTL-ROLLOUT-1 (2026-10-02, owner request, agent_issues 1757): every HTML page this worker serves (qnfo.org,
// papers.qnfo.org, legal.qnfo.org, ...) gets the discreet fleet command-line link, appended at the end of <body> by
// HTMLRewriter so every page, present and future, carries it without editing each template. Non-HTML responses (PDF, JSON,
// XML, feeds) pass through untouched. The link itself is https://fleet.qnfo.org/ctl.js (qnfo-fleet-dashboard FLEET-CMD-1).
// ARCHIVE-ON-GATEWAY-1 (2026-10-02, fixes ARCHIVE-PAGES-UNDEPLOYABLE-1 / agent_issues 1393): archive.qnfo.org was a Pages
// project no workflow could deploy, so it served corrupted CSS and stale counts. The gateway serves it from live data;
// a zone route sends archive.qnfo.org/* here (scripts/attach-surface-routes.py).
async function handleArchive(env) {
  let rows = [], latest = [];
  try {
    const r = await env.LIVING_PAPER.prepare("SELECT slug, title, abstract, created_at, doi FROM papers WHERE status IN ('published','distributed','external_preprint') ORDER BY created_at DESC").all();
    rows = r.results || [];
    latest = rows.slice(0, 5);
  } catch (e) {}
  const counts = {};
  rows.forEach(function(p) { const c = detectCategory(p.title, p.abstract); counts[c] = (counts[c] || 0) + 1; });
  const fields = [
    { k: "qec", t: "Quantum error correction", d: "Stabilizer codes, ultrametric error correction, code constructions beyond the stabilizer formalism." },
    { k: "number-theory", t: "Number theory", d: "p-adic valuation, Ostrowski's theorem, Tate's thesis, the Langlands programme." },
    { k: "physics", t: "Physics", d: "Topological quantum matter, Majorana zero modes, energy limits of computation." },
    { k: "computer-science", t: "Computer science", d: "Formal verification, ultrametric algorithms, computational benchmarking." },
    { k: "other", t: "Other subjects", d: "Papers outside the four fields above, such as methods, AI-assisted science and research operations." }
  ];
  const fieldHtml = '<div class="q-grid q-grid-3">' + fields.map(function(f) {
    return '<a class="q-link-card" href="https://papers.qnfo.org/papers?category=' + f.k + '"><h3>' + f.t + ' <span class="q-badge q-badge-muted q-num">' + (counts[f.k] || 0) + "</span></h3><p>" + f.d + "</p></a>";
  }).join("") + '<a class="q-link-card" href="https://papers.qnfo.org/papers"><h3>Everything <span class="q-badge q-badge-muted q-num">' + rows.length + "</span></h3><p>The full library, newest first, with search.</p></a></div>";
  const tools = '<div class="q-grid q-grid-3">' + [
    { t: "Ask the corpus", d: "Natural-language questions answered from the papers, with citations and the knowledge graph.", h: "https://ask.qwav.tech/" },
    { t: "Ideas", d: "Research conversations as they develop.", h: "https://ideas.qnfo.org/" },
    { t: "RSS feed", d: "New papers as they are published.", h: "https://papers.qnfo.org/rss.xml" },
    { t: "Sitemap", d: "Every paper page, for crawlers and archivists.", h: "https://papers.qnfo.org/sitemap.xml" },
    { t: "Machine-readable index", d: "llms.txt: the corpus described for language-model agents.", h: "https://papers.qnfo.org/llms.txt" },
    { t: "License", d: "QNFO Unified License Agreement (QNFO-ULA).", h: "https://legal.qnfo.org/" }
  ].map(function(c) { return '<a class="q-link-card" href="' + c.h + '"><h3>' + c.t + "</h3><p>" + c.d + "</p></a>"; }).join("") + "</div>";
  const latestHtml = latest.length ? '<ul class="q-list q-compact" style="max-width:860px">' + latest.map(function(p) {
    return '<li class="q-item"><a class="q-item-title" href="https://papers.qnfo.org/papers/' + escAttr(p.slug) + '">' + titleHTML(p.title) + '</a><div class="q-item-meta"><time>' + esc(String(p.created_at || "").slice(0, 10)) + "</time>" + "</div></li>";
  }).join("") + "</ul>" : "";
  const body = '<section class="q-hero" style="padding-bottom:24px"><div class="q-wrap"><p class="q-eyebrow">Archive</p><h1 class="q-display" style="max-width:16ch">The research archive</h1><p class="q-lede">Every QNFO publication, dataset and research artifact, by field. Corrections are new versions of the same record. All content is licensed under the QNFO Unified License Agreement v2.0.</p></div></section>' +
    '<section class="q-section" style="padding-top:24px" aria-labelledby="f-h"><div class="q-wrap"><h2 class="q-h2" id="f-h">By field</h2>' + fieldHtml + "</div></section>" +
    '<section class="q-section" aria-labelledby="l-h"><div class="q-wrap"><div class="q-section-head"><h2 class="q-h2" id="l-h">Newest</h2><a href="https://papers.qnfo.org/papers">All papers</a></div>' + latestHtml + "</div></section>" +
    '<section class="q-section" aria-labelledby="t-h"><div class="q-wrap"><h2 class="q-h2" id="t-h">Ways in</h2>' + tools + "</div></section>";
  return new Response(qdsPage({ title: "QNFO Research Archive", description: "The QNFO research archive: every publication by field, with feeds and discovery tools. Licensed under QNFO-ULA v2.0.", canonical: "https://archive.qnfo.org/", jsonld: identityJsonLd("https://archive.qnfo.org/"), rss: true, active: "archive" }, body), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
}
// QWAV-ON-GATEWAY-1 (2026-10-02): qwav.org and qwav.tech were a Pages project outside the repository. The gateway serves the
// QWAV page on the shared design system (QWAV accent), with the copy corrected to STRATEGY 2.1: QNFO is an independent
// research imprint (never a "collective"), QWAV is a parked, pre-commercial label, and every number says whether it is
// published or estimated. A zone route sends qwav.org/* and qwav.tech/* here.
function renderQwavHTML(host) {
  const canon = "https://qwav.org/"; // one canonical for both QWAV domains (the Pages site used qwav.org)
  const landscape = [
    ["IBM", "Superconducting transmon", "~15 mK", "Active (surface code)", "0.89 J per solution", "published (JPCUB P0)"],
    ["Google", "Superconducting", "~15 mK", "Active (surface code)", "~0.05 J per solution", "estimate (landscape v2.3)"],
    ["Rigetti", "Superconducting", "~15 mK", "Active", "~0.61 J per solution", "estimate (landscape v2.3)"],
    ["IonQ", "Trapped ions", "Room temperature", "Active", "~16.3 J per solution", "estimate (landscape v2.3)"],
    ["D-Wave", "Quantum annealing", "~15 mK", "None (annealing)", "~50 to 200 J per optimisation", "estimate (landscape v2.3)"],
    ["QWAV", "p-adic ultrametric (qudits)", "Room-temperature target", "Intrinsic (Ostrowski)", "< 10\u207b\u00b3 J per solution", "design target, not measured"]
  ];
  const research = [
    { t: "JPCUB P0: the metric", d: "Definition, measurement protocol and anti-gaming provisions. Worked example: IBM Eagle at 0.89 J per solution.", slug: "joules-per-solution-metric" },
    { t: "The physics of computation", d: "Landauer, Margolus\u2013Levitin and Bremermann limits; joules per solution as the falsifiable criterion for physical computational advantage.", slug: "paper-physics-of-computation" },
    { t: "JPCUB competitive landscape", d: "System-level estimates for 17 platforms from published specifications and third-party data.", slug: "jpcub-competitive-landscape" },
    { t: "Problem-substrate mapping", d: "A framework for matching computational problems to physical substrates before investing in them.", slug: "paper-problem-substrate-mapping" }
  ];
  const stack = [
    ["Application", "QWAV SDK (Python), QWAV Cloud API (REST), JPCUB benchmark dashboard"],
    ["Compilation", "Fontaine-stack compiler: problem, p-adic encoding, Bruhat\u2013Tits building, ZBW observable, readout"],
    ["Runtime", "Adelic QEC (Ostrowski intrinsic protection), ZBW engine, Bruhat\u2013Tits readout protocol"],
    ["Physical", "Trapped-ion Dirac simulator, room-temperature adelic nuclear-spin qubit (v2.0), 343-qubit tree topology"]
  ];
  const body = '<section class="q-hero"><div class="q-wrap q-hero-grid"><div><p class="q-eyebrow">Pre-commercial computing platform</p><h1 class="q-display">Benchmarked in joules per solution, not qubit counts.</h1><p class="q-lede">QWAV explores p-adic ultrametric architectures as an alternative to the qubit-gate-circuit model. The approach draws on Ostrowski\'s theorem for intrinsic error protection and targets room-temperature operation. Every performance claim is benchmarked with JPCUB, an open, falsifiable measure of energy per correct answer.</p><div class="q-actions"><a class="q-btn q-btn-accent" href="https://papers.qnfo.org/papers/joules-per-solution-metric">Read the JPCUB protocol</a><a class="q-btn q-btn-ghost" href="https://papers.qnfo.org/papers/qwav-gtm-strategy">Strategy whitepaper</a></div></div>' +
    '<div class="q-note"><strong>Status.</strong> QWAV is pre-commercial: no production system exists, and no commercial product is offered. The architecture is published as open research. The JPCUB protocol is open, so anyone can measure any platform, including QWAV, with the same procedure.</div></div></section>' +
    '<section class="q-section" id="jpcub" aria-labelledby="j-h"><div class="q-wrap q-hero-grid" style="align-items:start"><div><p class="q-eyebrow">The benchmark</p><h2 class="q-h1" id="j-h">Energy per correct answer</h2><p class="q-lede" style="font-size:1.125rem">JPCUB measures total system energy per correct answer: memory, input and output, cooling and power conversion included, not only the processor. Do not trust anyone\'s numbers, ours included: measure any platform yourself in joules per correct answer.</p><a class="q-btn q-btn-ghost" href="https://papers.qnfo.org/papers/joules-per-solution-metric">JPCUB P0 protocol</a></div>' +
    '<div class="q-panel"><p class="q-meta" style="margin:0 0 6px">QWAV design target</p><p style="font:500 3rem/1 var(--q-serif);margin:0 0 10px">&lt; 10<sup>\u22123</sup> J</p><p class="q-meta" style="margin:0">per solution. A target, not a measurement. For scale, the only published P0 measurement so far is IBM Eagle at 0.89 J per solution for factoring.</p></div></div></section>' +
    '<section class="q-section" id="landscape" aria-labelledby="ls-h"><div class="q-wrap"><p class="q-eyebrow">Landscape</p><h2 class="q-h1" id="ls-h">How platforms compare on energy</h2><p class="q-lede" style="font-size:1.125rem">QWAV does not compete on qubit counts. Only IBM carries a published P0-protocol measurement; the others are conservative system-level upper bounds from the competitive landscape paper (<a href="https://papers.qnfo.org/papers/jpcub-competitive-landscape">JPCUB Competitive Landscape</a>).</p>' +
    '<div class="q-table-wrap"><table class="q-table"><thead><tr><th>Platform</th><th>Approach</th><th>Operating temperature</th><th>Error correction</th><th class="q-num">JPCUB</th><th>Basis</th></tr></thead><tbody>' + landscape.map(function(r) {
      return "<tr" + (r[0] === "QWAV" ? ' style="background:var(--q-accent-wash)"' : "") + "><td><strong>" + r[0] + "</strong></td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + '</td><td class="q-num">' + r[4] + '</td><td class="q-meta">' + r[5] + "</td></tr>";
    }).join("") + "</tbody></table></div></div></section>" +
    '<section class="q-section" id="stack" aria-labelledby="st-h"><div class="q-wrap"><p class="q-eyebrow">Architecture</p><h2 class="q-h1" id="st-h">The QWAV stack</h2><p class="q-lede" style="font-size:1.125rem">From p-adic mathematics to applications. These layers are published as research papers; the hardware remains pre-commercial.</p><div class="q-table-wrap"><table class="q-table"><tbody>' + stack.map(function(r) {
      return '<tr><th scope="row" style="width:160px">' + r[0] + "</th><td>" + r[1] + "</td></tr>";
    }).join("") + "</tbody></table></div></div></section>" +
    '<section class="q-section" id="research" aria-labelledby="rs-h"><div class="q-wrap"><p class="q-eyebrow">Research</p><h2 class="q-h1" id="rs-h">Built on published research</h2><p class="q-lede" style="font-size:1.125rem">The work behind QWAV is by Rowan Brad Quni-Gudzinas and published by QNFO, an independent research imprint. Every paper is open and can be checked independently.</p><div class="q-grid q-grid-2">' + research.map(function(r) {
      return '<a class="q-link-card" href="https://papers.qnfo.org/papers/' + r.slug + '"><h3>' + r.t + "</h3><p>" + r.d + "</p></a>";
    }).join("") + '</div><div class="q-actions" style="margin-top:28px"><a class="q-btn" href="https://papers.qnfo.org/papers">Browse all papers</a><a class="q-btn q-btn-ghost" href="https://ask.qwav.tech/">Ask the corpus</a></div></div></section>';
  return new Response(qdsPage({ brand: "qwav", title: "QWAV \u2014 benchmarked in joules per solution | p-adic ultrametric computing", description: "QWAV is a pre-commercial computing platform concept exploring p-adic ultrametric architectures, benchmarked with JPCUB: energy per correct answer, not qubit counts.", canonical: canon, active: "" }, body), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
// NOT-FOUND-HTML-1 (2026-10-02, visitor audit): a mistyped paper link answered {"error":"Paper not found"} as raw JSON.
// A browser now gets a QDS page with the closest papers by slug words, a search box and the ways back; API clients
// (Accept without text/html) keep the JSON body and the same 404 status.
async function notFoundPage(request, env, host, path, slug) {
  const accept = (request && request.headers.get("Accept")) || "";
  if (!/text\/html/.test(accept)) return json(slug ? { error: "Paper not found", slug } : { error: "Not found", path }, 404);
  let near = [];
  const words = String(slug || path || "").toLowerCase().replace(/^\/+papers\/+/, "").split(/[^a-z0-9]+/).filter(function(w) { return w.length >= 4 && !/^(paper|papers|html|v\d+)$/.test(w); }).slice(0, 4);
  if (words.length && env.LIVING_PAPER) {
    try {
      const cond = words.map(function(_, i) { return "(slug LIKE ?" + (i + 1) + " OR lower(title) LIKE ?" + (i + 1) + ")"; }).join(" + ");
      const sql = "SELECT slug, title, (" + words.map(function(_, i) { return "(slug LIKE ?" + (i + 1) + ")"; }).join(" + ") + ") AS hits FROM papers WHERE slug IS NOT NULL AND status IN ('published','distributed','external_preprint') AND (" + cond.replace(/ \+ /g, " OR ") + ") ORDER BY hits DESC, created_at DESC LIMIT 5";
      const st = env.LIVING_PAPER.prepare(sql);
      near = ((await st.bind.apply(st, words.map(function(w) { return "%" + w + "%"; })).all()).results) || [];
    } catch (e) { near = []; }
  }
  const q = words.join(" ");
  const list = near.length ? '<h2 class="q-h3" style="margin:28px 0 8px">Did you mean</h2><ul class="q-list q-compact">' + near.map(function(p) {
    return '<li class="q-item"><a class="q-item-title" href="https://papers.qnfo.org/papers/' + escAttr(p.slug) + '">' + titleHTML(p.title) + "</a></li>";
  }).join("") + "</ul>" : "";
  const body = '<section class="q-hero"><div class="q-wrap" style="max-width:760px"><p class="q-eyebrow">Not found</p><h1 class="q-h1">' + (slug ? "There is no paper at this address" : "There is nothing at this address") + "</h1>" +
    '<p class="q-lede">The link may be mistyped, or the paper may have a new address after a revision. Every paper keeps its address across versions.</p>' +
    '<form class="q-field" action="https://papers.qnfo.org/papers" method="get" role="search" style="max-width:560px;margin-top:20px"><label class="q-sr" for="nf-q">Search the papers</label><input id="nf-q" name="search" type="search" value="' + escAttr(q) + '" placeholder="Search titles and abstracts"><button class="q-btn q-btn-accent" type="submit">Search</button></form>' +
    list + '<p class="q-meta" style="margin-top:28px"><a href="https://papers.qnfo.org/papers">The library</a> \u00b7 <a href="https://ask.qwav.tech/' + (q ? "?q=" + encodeURIComponent(q) : "") + '">Ask the corpus</a> \u00b7 <a href="https://qnfo.org/">Home</a></p></div></section>';
  return new Response(qdsPage({ title: "Not found \u00b7 QNFO", description: "No page at this address.", robots: "noindex", brand: "qnfo", active: slug ? "papers" : "" }, body), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
// LIVING-PAPERS-PAGE-1 (3.9.2, 2026-10-02, pillar reach; docs/outreach/living-papers-launch-2026-10.md): the launch
// landing page. It says what a living paper does for a reader, sends them to one sample, and states the limits plainly.
var READING_SAMPLE = "joules-per-solution-metric";
function renderReadingHTML() {
  const feat = function(h, p) { return '<div class="q-card" style="padding:20px 22px"><h3 style="margin:0 0 6px;font-size:1.05rem">' + h + '</h3><p class="q-meta" style="margin:0;line-height:1.6">' + p + "</p></div>"; };
  const body = '<section class="q-hero" style="padding-bottom:24px"><div class="q-wrap"><p class="q-eyebrow">Living papers</p><h1 class="q-display" style="max-width:20ch">Research papers you can actually read</h1>' +
    '<p class="q-lede" style="max-width:62ch">Every paper on papers.qnfo.org opens as a living paper. The words are the author\u2019s, unchanged. The page around them does the work a PDF leaves to you: it shows the shape of the paper, typesets its mathematics, explains a reference without losing your place, and answers questions from the paper itself, with citations.</p>' +
    '<p style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px"><a class="q-btn q-btn-accent" href="/papers/' + READING_SAMPLE + '">Open a sample paper</a><a class="q-btn" href="/papers">Browse all papers</a></p></div></section>' +
    '<section class="q-wrap" style="padding-bottom:40px"><h2 class="q-h2" style="margin:8px 0 18px">What every paper page does</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">' +
    feat("See the whole paper at once", "A contents rail follows you down the page and a progress bar shows how far you are. Every section has a link you can share.") +
    feat("Mathematics, tables and code, rendered", "Formulas are typeset, tables are tables, and code keeps its lines. Nothing is a picture of text.") +
    feat("References without the scroll", "Hover or focus a citation such as [12] to read the reference in place, then carry on reading.") +
    feat("Ask the paper", "Ask in plain language. The answer is written from the paper, which is always source [1], and every claim points to the passage or paper it came from.") +
    feat("Select, ask, quote", "Select a passage to ask about exactly that passage, or copy it as a quote that carries its citation.") +
    feat("Context, versions and related work", "The concepts the paper touches in the QNFO knowledge graph, every version of the work, and its nearest neighbours in the library.") +
    feat("Cite in one click", "APA, BibTeX or plain text, with the paper's address and any registered third-party identifier.") +
    feat("Open by default", "Free, no account, no paywall, a licence on every paper, and RSS, a sitemap and llms.txt for machines.") +
    "</div></section>" +
    '<section class="q-wrap" style="padding-bottom:56px"><div class="q-prose" style="max-width:68ch"><h2>What it is not</h2>' +
    "<p>These are one researcher\u2019s preprints, prepared with an AI-assisted research pipeline; they are not peer reviewed, and the author is responsible for the content. Every paper states its claim, how it was tested and its status. The format is an experiment in making dense research readable; it does not change what a paper says or make it more right.</p>" +
    "<p>The rendering is automatic. A few older papers came through word-processor conversions and still show formatting defects, and the Ask panel is rate-limited so it stays free. If something reads badly, say so: <a href=\"mailto:rowan.quni@qnfo.org?subject=%5Bliving-papers%5D%20feedback\">rowan.quni@qnfo.org</a>.</p>" +
    '<h2>Start here</h2><p><a href="/papers/' + READING_SAMPLE + '">The Joules-per-Solution metric</a> is a good first paper: it has sections, equations, references and a knowledge-graph context to try every feature on. Or <a href="/papers">search the library</a>.</p></div></section>';
  return new Response(qdsPage({ title: "Living papers \u00b7 QNFO Papers", description: "Research papers you can actually read: contents, rendered mathematics, reference previews, versions, and an Ask panel that answers from the paper and cites it. Free and open.", canonical: "https://papers.qnfo.org/reading", brand: "qnfo", active: "papers" }, body), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
// PRIVACY-PAGE-1 (2026-10-02, visitor audit): the footer's "Privacy" link (legal.qnfo.org/privacy) served the licence text
// and qnfo.org/privacy was a 404. This states what the QNFO sites actually collect, from the code that collects it.
function renderPrivacyHTML() {
  const sec = function(h, id, inner) { return '<h2 id="' + id + '">' + h + "</h2>" + inner; };
  const body = '<div class="q-wrap"><article class="q-article"><div><header class="q-article-head"><p class="q-eyebrow">Privacy</p><h1 class="q-h1">What the QNFO sites collect</h1><p class="q-meta">Applies to qnfo.org, papers.qnfo.org, legal.qnfo.org, archive.qnfo.org, ideas.qnfo.org, ask.qwav.tech, ipatent.qnfo.org, qwav.org and qwav.tech. Updated 2 October 2026.</p></header><div class="q-prose">' +
    "<p>QNFO is one researcher, Rowan Brad Quni-Gudzinas, who is responsible for these sites and for this notice. Nothing is sold, and nothing is shared for advertising.</p>" +
    sec("Visit statistics", "statistics", "<p>Pages load Google Analytics 4 (property G-LV7RHRVW6R), which sets cookies and counts visits, pages and referrers. Cloudflare, which hosts the sites, may also add its Web Analytics beacon, which uses no cookies. When a link carries campaign tags (utm_source, utm_medium, utm_campaign, as links in our posts and digests do), the site counts that page load by day, page, tag values, country and whether the visitor is an automated preview, with no cookie, network address or browser details. These figures are used only to see which pages people read and which posts brought them.</p>") +
    sec("Email digest", "digest", "<p>If you subscribe, your email address is stored to send the weekly digest. You confirm by email first, and every digest has an unsubscribe link that removes you. Digest emails carry no tracking pixels.</p>") +
    sec("Ask the corpus", "ask", "<p>Questions you ask and the ratings you give are stored with the answer, without your network address, to measure and improve the answers. A question the papers cannot answer may be added, with no identifier, to the research idea queue that decides what to study next.</p>") +
    sec("iPatent", "ipatent", "<p>Your invention text is sent to the drafting model and is not kept unless you tick the box to keep a private copy. A one-way hash of your network address is stored to enforce the daily drafting limit.</p>") +
    sec("Email to the author", "email", "<p>Mail you send to rowan.quni@qnfo.org is kept to answer it, and the subject tag of a work-with-me email is counted to measure contacts.</p>") +
    sec("Your rights", "rights", '<p>To see, correct or delete what is held about you, email <a href="mailto:rowan.quni@qnfo.org?subject=Privacy%20request">rowan.quni@qnfo.org</a>. q08.org is a separate publication with its own practices and is not covered here.</p>') +
    '</div></div><aside class="q-article-aside" aria-label="On this page"><section class="q-toc-wrap"><h2>On this page</h2><ol class="q-toc" data-q-toc=".q-prose"></ol></section></aside></article></div>';
  return new Response(qdsPage({ title: "Privacy \u00b7 QNFO", description: "What the QNFO sites collect, why, and how to have it removed.", canonical: "https://legal.qnfo.org/privacy", brand: "qnfo" }, body), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
var FLEET_CTL_TAG = '<script src="https://fleet.qnfo.org/ctl.js" defer></script>';
function withFleetCtl(res) {
  try {
    const ct = res && res.headers && res.headers.get("Content-Type") || "";
    if (!res || res.status !== 200 || ct.indexOf("text/html") !== 0 || typeof HTMLRewriter === "undefined") return res;
    return new HTMLRewriter().on("body", { element(el) { el.append(FLEET_CTL_TAG, { html: true }); } }).transform(res);
  } catch (e) {
    return res;
  }
}
// ---- LIVING-PAPERS-1:BEGIN (3.8.0, 2026-10-02, pillar reach) ----
// papers.qnfo.org as a living-paper reader in the QNFO design system shared with ask.qwav.tech (Newsreader + Familjen
// Grotesk, navy ink, teal accent, light and dark).
//   index  /papers   instant search, topic facets with counts, sort, a 12-month publication histogram, cards with
//                    read / ask actions, infinite load (the JSON `rows` are the same cards).
//   paper  /papers/x section ids and a server-built contents list (no layout shift), abstract lede, reading progress,
//                    reference previews on [n], select-to-ask and quote-with-citation, cite dialog (BibTeX, APA),
//                    and a "living" rail: Ask this paper (ask.qwav.tech /api/ask with `paper` pinned as source [1], so
//                    every answer is measured by ASK-LOOP-1), knowledge-graph context, versions and related papers
//                    from GET /api/paper-context/<slug> (D1 living-paper FTS + qnfo-graph; cached 1 h).
// Fixes carried in the same change: the index page's MathJax loader threw "Unexpected token '}'" on every load (one
// brace too many, and an unescaped quote in its onerror attribute); intraword underscores (Q_p, x_i) no longer open
// <em> runs; the title is no longer printed twice; paper text is left-aligned (justified prose made rivers).
// Everything stays server-rendered and readable without JavaScript; SEO metas, JSON-LD, citation_* and GA4 unchanged.
var LP_ASK = "https://ask.qwav.tech";
var LP_PUBLIC = "('published','distributed','external_preprint')";
var LP_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap">';
var LP_THEME_BOOT = "<script>(function(){try{var t=localStorage.getItem('qnfo-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}})()<\/script>";
var LP_GA = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script>';
var LP_MATHJAX = '<script>window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]],displayMath:[["$$","$$"],["\\\\[","\\\\]"]],processEscapes:true,macros:{lambdabar:"{\\\\bar{\\\\lambda}}",parr:"\\\\mathbin{\\\\unicode{x214B}}"}},svg:{scale:1.05,fontCache:"global"},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"],enableMenu:false},startup:{typeset:true}};<\/script><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js" id="MathJax-script" onerror="this.onerror=null;var s=document.createElement(&quot;script&quot;);s.src=&quot;https://unpkg.com/mathjax@3/es5/tex-svg-full.js&quot;;document.head.appendChild(s);"><\/script>';
var LP_MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 16h7M13 16l7-8M13 16l7 8M20 8h6M20 24h6M20 8l4-4M20 24l4 4" stroke="var(--teal)" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="6" cy="16" r="3" fill="var(--ink)"/></svg>';
var LP_THEME_BTN = '<button class="q-theme" id="q-theme" type="button" aria-label="Switch colour theme"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/></svg></button>';
var LP_CAT_ORDER = ["qec", "number-theory", "physics", "computer-science", "other"];
var LP_CAT_VAR = { "qec": "--teal", "number-theory": "--violet", "physics": "--rust", "computer-science": "--amber", "other": "--muted" };
var LP_DS = ":root{--paper:#F5F7FB;--surface:#FFFFFF;--ink:#182042;--muted:#5A6386;--rule:#D9DEEC;--wash:#E9EDF7;--teal:#0E7C70;--teal-wash:#DDF1EE;--amber:#8A5300;--amber-wash:#FCEFD6;--red:#B42318;--red-wash:#FDECEA;--green:#157F3B;--green-wash:#E5F4EA;--violet:#5B4BB7;--violet-wash:#ECE9FA;--rust:#B5562A;--rust-wash:#FBE9E0;--serif:\"Newsreader\",Georgia,\"Times New Roman\",serif;--sans:\"Familjen Grotesk\",system-ui,-apple-system,\"Segoe UI\",sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--r-sm:6px;--r:10px;--r-lg:14px;--shadow:0 1px 2px rgba(24,32,66,.06),0 8px 24px -12px rgba(24,32,66,.18);color-scheme:light}@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){--paper:#141A33;--surface:#1B2346;--ink:#E6E8F3;--muted:#9AA3C6;--rule:#2D3762;--wash:#222B52;--teal:#5FD3C4;--teal-wash:#173B45;--amber:#F2B544;--amber-wash:#3A2F1A;--red:#FF8A80;--red-wash:#3A1D22;--green:#6FD39A;--green-wash:#163326;--violet:#A99BFF;--violet-wash:#2A2752;--rust:#F08A5D;--rust-wash:#3A2420;--shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px -14px rgba(0,0,0,.6);color-scheme:dark}}:root[data-theme=\"dark\"]{--paper:#141A33;--surface:#1B2346;--ink:#E6E8F3;--muted:#9AA3C6;--rule:#2D3762;--wash:#222B52;--teal:#5FD3C4;--teal-wash:#173B45;--amber:#F2B544;--amber-wash:#3A2F1A;--red:#FF8A80;--red-wash:#3A1D22;--green:#6FD39A;--green-wash:#163326;--violet:#A99BFF;--violet-wash:#2A2752;--rust:#F08A5D;--rust-wash:#3A2420;--shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px -14px rgba(0,0,0,.6);color-scheme:dark}[hidden]{display:none!important}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-padding-top:84px}body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.5 var(--sans);font-feature-settings:\"tnum\" 1;-webkit-font-smoothing:antialiased}a{color:inherit;text-underline-offset:3px;text-decoration-thickness:1px}a:hover{color:var(--teal)}:focus-visible{outline:2px solid var(--teal);outline-offset:2px;border-radius:4px}button{font:inherit;color:inherit;cursor:pointer}.sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.wrap{max-width:1240px;margin:0 auto;padding:0 24px}.q-top{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid transparent;transition:border-color .2s}.q-top.scrolled{border-bottom-color:var(--rule)}.q-top .wrap{display:flex;align-items:center;gap:22px;height:64px}.q-mark{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:600;font-size:17px;letter-spacing:-.01em;white-space:nowrap}.q-mark svg{width:26px;height:26px;flex:none}.q-mark small{font-weight:400;color:var(--muted);font-size:15px}.q-nav{display:flex;gap:4px;margin-left:auto;font-size:14.5px;color:var(--muted)}.q-nav a{text-decoration:none;padding:6px 10px;border-radius:8px}.q-nav a:hover{background:var(--wash);color:var(--ink)}.q-nav a[aria-current]{color:var(--ink);background:var(--wash);font-weight:500}.q-theme{border:1px solid var(--rule);background:none;border-radius:999px;width:34px;height:34px;display:grid;place-items:center;color:var(--muted);flex:none}.q-theme:hover{color:var(--ink);border-color:var(--muted)}.q-theme svg{width:16px;height:16px}.q-btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--rule);background:var(--surface);border-radius:10px;padding:8px 14px;font-weight:500;font-size:14px;text-decoration:none;color:var(--ink);white-space:nowrap;transition:border-color .15s,background .15s}.q-btn:hover{border-color:var(--muted);color:var(--ink)}.q-btn svg{width:16px;height:16px;flex:none}.q-btn.pri{background:var(--ink);border-color:var(--ink);color:var(--paper)}.q-btn.pri:hover{opacity:.9;color:var(--paper)}.q-btn.teal{background:var(--teal);border-color:var(--teal);color:var(--paper)}.q-btn.teal:hover{color:var(--paper);opacity:.92}.q-btn:disabled{opacity:.45;cursor:default}.q-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--rule);background:var(--surface);border-radius:999px;padding:5px 12px;font-size:13.5px;text-decoration:none;color:var(--ink);white-space:nowrap}.q-chip:hover{border-color:var(--muted);color:var(--ink)}.q-chip[aria-pressed=\"true\"],.q-chip.on{background:var(--ink);border-color:var(--ink);color:var(--paper)}.q-chip b{font-weight:600;font-variant-numeric:tabular-nums;opacity:.7}.q-eyebrow{font:600 12px/1 var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--teal)}.q-card{background:var(--surface);border:1px solid var(--rule);border-radius:var(--r-lg)}.q-tag{display:inline-flex;align-items:center;gap:5px;font:600 11.5px/1 var(--sans);letter-spacing:.04em;text-transform:uppercase;padding:4px 8px;border-radius:6px;background:var(--wash);color:var(--muted)}.q-foot{border-top:1px solid var(--rule);margin-top:64px;padding:26px 0 44px;font-size:13.5px;color:var(--muted)}.q-foot .wrap{display:flex;gap:10px 22px;flex-wrap:wrap;align-items:center}.q-foot a{color:var(--muted)}.q-foot a:hover{color:var(--teal)}.q-skel{display:block;height:13px;border-radius:4px;background:linear-gradient(90deg,var(--wash),var(--rule),var(--wash));background-size:200% 100%;animation:qsk 1.4s ease infinite;margin:10px 0}@keyframes qsk{to{background-position:-200% 0}}.q-spin{display:inline-block;width:12px;height:12px;border:2px solid var(--rule);border-top-color:var(--teal);border-radius:50%;animation:qsp .8s linear infinite;vertical-align:-1px}@keyframes qsp{to{transform:rotate(360deg)}}.q-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:var(--ink);color:var(--paper);padding:10px 16px;border-radius:10px;font-size:14px;opacity:0;pointer-events:none;transition:all .2s;z-index:90}.q-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}.q-menu{display:none;position:relative}.q-menu summary{list-style:none;cursor:pointer;border:1px solid var(--rule);border-radius:999px;width:34px;height:34px;display:grid;place-items:center;color:var(--muted)}.q-menu summary::-webkit-details-marker{display:none}.q-menu summary svg{width:16px;height:16px}.q-menu-panel{position:absolute;right:0;top:44px;z-index:50;min-width:200px;background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:8px;display:grid;box-shadow:var(--shadow)}.q-menu-panel a{padding:10px 12px;border-radius:8px;text-decoration:none;font-size:15px}.q-menu-panel a:hover,.q-menu-panel a[aria-current]{background:var(--wash)}@media (max-width:1000px){.q-nav a{padding:6px 7px}.q-nav{font-size:14px}}@media (max-width:860px){.q-nav{display:none}.q-menu{display:block;margin-left:auto}}@media (max-width:760px){.wrap{padding:0 16px}.q-top .wrap{height:56px;gap:10px}}@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}@media print{.q-top,.q-foot,.q-theme,.no-print{display:none!important}body{background:#fff;color:#000}}";
var LP_CSS = ".dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c,var(--muted));flex:none}/* index */.ix-hero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.75fr);gap:56px;padding:44px 24px 36px;align-items:start}.ix-intro h1{font:500 clamp(34px,4.4vw,56px)/1.04 var(--serif);letter-spacing:-.02em;margin:14px 0 18px;max-width:17ch}.lede{font:400 19px/1.55 var(--serif);color:var(--muted);max-width:56ch;margin:0 0 26px}.ix-search{position:relative;display:flex;align-items:center;background:var(--surface);border:1.5px solid var(--rule);border-radius:var(--r-lg);padding:0 14px;max-width:620px;transition:border-color .15s,box-shadow .15s}.ix-search:focus-within{border-color:var(--teal);box-shadow:0 0 0 4px var(--teal-wash)}.ix-search svg{width:19px;height:19px;color:var(--muted);flex:none}.ix-search input{flex:1;border:0;background:none;outline:none;font:400 18px/1.3 var(--serif);color:var(--ink);padding:15px 12px;min-width:0}.ix-search input::placeholder{color:var(--muted)}.ix-search input::-webkit-search-cancel-button{-webkit-appearance:none}kbd{font:500 12px/1 var(--mono);border:1px solid var(--rule);border-bottom-width:2px;border-radius:5px;padding:3px 6px;color:var(--muted);background:var(--paper)}.ix-hint{font-size:14px;color:var(--muted);margin:12px 2px 0}.ix-hint a{color:var(--teal);font-weight:500}.ix-stats{padding:22px 22px 18px}.ix-n{display:flex;align-items:flex-end;gap:12px;margin-bottom:16px}.ix-n b{font:500 54px/.9 var(--serif);letter-spacing:-.03em}.ix-n span{font-size:13.5px;color:var(--muted);line-height:1.35;padding-bottom:4px}.hist{width:100%;height:auto;display:block}.hist rect{fill:var(--teal);opacity:.35}.hist rect.now{opacity:1}.hist g:hover rect{opacity:.85}.hist text{font:500 10.5px var(--sans);fill:var(--muted)}.ix-cap{font-size:12px;color:var(--muted);margin:4px 0 16px}.catbar{display:flex;height:8px;border-radius:99px;overflow:hidden;gap:2px;margin-bottom:12px}.catbar span{background:var(--c)}.ix-legend{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:13px;color:var(--muted)}.ix-legend li{display:flex;align-items:center;gap:7px}.ix-legend b{margin-left:auto;color:var(--ink);font-weight:600}.ix-controls{position:sticky;top:64px;z-index:30;background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}.ix-controls .wrap{display:flex;align-items:center;gap:16px;padding-top:10px;padding-bottom:10px}.ix-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;flex:1;padding:2px}.ix-chips::-webkit-scrollbar{display:none}.ix-chips .q-chip.on .dot{background:var(--paper)}.ix-sort{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--muted)}.ix-sort select{font:500 14px var(--sans);color:var(--ink);background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:6px 26px 6px 10px;-webkit-appearance:none;appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 13px) 50%,calc(100% - 8px) 50%;background-size:5px 5px;background-repeat:no-repeat}.ix-list{padding-top:28px}.ix-h{font:500 26px/1.2 var(--serif);margin:0 0 6px;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.ix-count{font:500 14px var(--sans);color:var(--muted)}.plist{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 40px}.plist.busy{opacity:.45;transition:opacity .15s}.pc{padding:22px 0;border-bottom:1px solid var(--rule);display:flex;flex-direction:column;animation:pcin .3s ease both}@keyframes pcin{from{opacity:0;transform:translateY(6px)}}.pc-meta{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);margin-bottom:8px;flex-wrap:wrap}.pc-cat{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--c)}.pc-cat::before{content:\"\";width:7px;height:7px;border-radius:50%;background:var(--c)}.pc-v{font:600 11.5px var(--sans);background:var(--wash);border-radius:5px;padding:2px 6px}.pc-t{font:500 21px/1.25 var(--serif);margin:0 0 8px;letter-spacing:-.005em}.pc-t a{text-decoration:none}.pc-t a:hover{color:var(--teal)}.pc-a{margin:0 0 12px;font-size:14.5px;line-height:1.55;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.pc-x{display:flex;gap:16px;font-size:13.5px;margin-top:auto;flex-wrap:wrap}.pc-x a{color:var(--teal);font-weight:600;text-decoration:none}.pc-x a:hover{text-decoration:underline}.empty{grid-column:1/-1;padding:40px 0;color:var(--muted);font:400 18px var(--serif)}.empty a{color:var(--teal)}.ix-more{text-align:center;padding:26px 0}.sub{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:8px 32px;align-items:center;padding:24px 26px;margin:40px 0 0}.sub h2{font:500 22px/1.2 var(--serif);margin:0 0 4px}.sub p{margin:0;color:var(--muted);font-size:14px}.sub form{display:flex;gap:8px}.sub input[type=email]{flex:1;min-width:0;border:1px solid var(--rule);background:var(--paper);color:var(--ink);border-radius:10px;padding:10px 12px;font:inherit}.sub input[type=email]:focus{outline:none;border-color:var(--teal)}#ld-msg{grid-column:1/-1;min-height:18px;font-size:13.5px}/* paper */.rp{position:fixed;top:0;left:0;right:0;height:3px;z-index:60;pointer-events:none}.rp span{display:block;height:100%;width:0;background:var(--teal);transition:width .08s linear}.pp{padding-top:22px}.crumbs{display:flex;gap:8px;font-size:13.5px;color:var(--muted);margin-bottom:22px}.crumbs a{text-decoration:none}.crumbs a:hover{color:var(--teal)}.ph{max-width:880px;margin:0 0 30px}.ph h1{font:500 clamp(30px,3.7vw,46px)/1.1 var(--serif);letter-spacing:-.018em;margin:0 0 16px;text-wrap:balance}.by{font:400 17px/1.4 var(--serif);margin:0 0 14px}.by a{text-decoration:none}.by a:hover{text-decoration:underline}.orcid{width:15px;height:15px;vertical-align:-2px;margin-left:5px}.ph-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;font-size:14px;color:var(--muted)}.ph-meta a{color:var(--muted)}.q-tag.live{background:var(--teal-wash);color:var(--teal);text-transform:none;letter-spacing:0;font-size:12.5px;padding:5px 9px}.q-tag.live i{width:7px;height:7px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 0 var(--teal);animation:pulse 2.4s ease infinite}@keyframes pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--teal) 55%,transparent)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}.ph-act{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.pp-grid{display:grid;grid-template-columns:220px minmax(0,1fr) 360px;gap:48px;align-items:start}.toc{position:sticky;top:88px;max-height:calc(100vh - 110px);overflow:auto;font-size:13.5px;scrollbar-width:thin}.toc-d summary{font:600 12px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);cursor:pointer;list-style:none;margin-bottom:10px}.toc-d summary::-webkit-details-marker{display:none}.toc-l{list-style:none;margin:0;padding:0;border-left:1px solid var(--rule)}.toc-l a{display:block;padding:5px 0 5px 14px;margin-left:-1px;border-left:2px solid transparent;text-decoration:none;color:var(--muted);line-height:1.35}.toc-l .lv3 a{padding-left:26px;font-size:13px}.toc-l a:hover{color:var(--ink)}.toc-l a.on{color:var(--ink);border-left-color:var(--teal);font-weight:500}.prose{font:400 18.5px/1.68 var(--serif);max-width:72ch;min-width:0;overflow-wrap:break-word;hyphens:auto;-webkit-hyphens:auto}.prose p{margin:0 0 1.05em}.prose h2{font:500 27px/1.2 var(--serif);letter-spacing:-.01em;margin:2em 0 .6em;position:relative;hyphens:none}.prose h3{font:600 20px/1.3 var(--serif);margin:1.7em 0 .5em;position:relative;hyphens:none}.prose h4{font:600 italic 18.5px/1.35 var(--serif);margin:1.4em 0 .4em;position:relative}.prose .hx{position:absolute;left:-1.05em;color:var(--rule);text-decoration:none;opacity:0;transition:opacity .15s;font-weight:400}.prose h2:hover .hx,.prose h3:hover .hx,.prose h4:hover .hx,.prose .hx:focus{opacity:1}.prose .hx:hover{color:var(--teal)}.prose ul,.prose ol{padding-left:1.4em;margin:0 0 1.05em}.prose li{margin-bottom:.35em}.prose a{color:var(--teal);text-decoration-color:color-mix(in srgb,var(--teal) 40%,transparent)}.prose blockquote{margin:1.3em 0;padding:.2em 0 .2em 1.1em;border-left:3px solid var(--teal);color:var(--muted);font-style:italic}.prose table{width:100%;border-collapse:collapse;margin:1.3em 0;font:400 14.5px/1.45 var(--sans);display:block;overflow-x:auto}.prose th{text-align:left;font-weight:600;border-bottom:1.5px solid var(--ink);padding:8px 10px;white-space:nowrap}.prose td{border-bottom:1px solid var(--rule);padding:7px 10px;vertical-align:top}.prose pre{font:13.5px/1.55 var(--mono);background:var(--surface);border:1px solid var(--rule);border-radius:var(--r);padding:14px 16px;overflow-x:auto;white-space:pre}.prose code{font:.84em var(--mono);background:var(--wash);padding:1px 5px;border-radius:4px}.prose pre code{background:none;padding:0}.prose hr{border:0;border-top:1px solid var(--rule);margin:2em 0}.prose img{max-width:100%;height:auto;border-radius:var(--r)}.prose mjx-container{max-width:100%;overflow-x:auto;overflow-y:hidden}.prose mjx-container[display=\"true\"]{margin:1.1em 0!important;padding:4px 0}.prose .math-display{text-align:center;margin:1.1em 0;overflow-x:auto}.abstract{background:var(--surface);border:1px solid var(--rule);border-left:3px solid var(--teal);border-radius:0 var(--r-lg) var(--r-lg) 0;padding:6px 26px 10px;margin:0 0 2.2em;font-size:17.5px}.abstract h2{font:600 12px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--teal);margin:16px 0 10px}.abstract .hx{display:none}.cite-n{color:var(--teal);font:600 .82em var(--sans);text-decoration:none;cursor:help;padding:0 1px;border-radius:3px}.cite-n:hover,.cite-n:focus{background:var(--teal-wash)}.refpop{position:absolute;z-index:70;max-width:380px;background:var(--surface);border:1px solid var(--rule);border-radius:var(--r);box-shadow:var(--shadow);padding:12px 14px;font:400 14px/1.45 var(--sans);color:var(--ink)}.refpop b{color:var(--teal)}.selpop{position:absolute;z-index:70;display:flex;gap:2px;background:var(--ink);border-radius:10px;padding:4px;box-shadow:var(--shadow)}.selpop[hidden]{display:none}.selpop button{display:flex;align-items:center;gap:6px;border:0;background:none;color:var(--paper);font-size:13.5px;font-weight:500;padding:7px 10px;border-radius:7px}.selpop button:hover{background:color-mix(in srgb,var(--paper) 16%,transparent)}.selpop svg{width:15px;height:15px}mark.hl{background:var(--amber-wash);color:inherit;border-radius:3px;box-shadow:0 0 0 2px var(--amber-wash)}.rail{position:sticky;top:88px;max-height:calc(100vh - 104px);display:flex}.rail-in{display:flex;flex-direction:column;width:100%;background:var(--surface);border:1px solid var(--rule);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow)}.tabs{display:flex;border-bottom:1px solid var(--rule);padding:0 6px;flex:none}.tabs button{flex:1;border:0;background:none;padding:13px 4px 11px;font-size:13.5px;font-weight:500;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}.tabs button[aria-selected=\"true\"]{color:var(--ink);border-bottom-color:var(--teal)}.tabs button:hover{color:var(--ink)}.tp{padding:16px;overflow:auto;flex:1;min-height:0}#ask-f{display:flex;flex-direction:column;gap:8px}#ask-q{width:100%;border:1.5px solid var(--rule);border-radius:var(--r);background:var(--paper);color:var(--ink);font:400 16px/1.4 var(--serif);padding:10px 12px;resize:vertical;min-height:64px;max-height:200px}#ask-q:focus{outline:none;border-color:var(--teal)}#ask-f .q-btn{align-self:flex-end}.sugg{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}.sugg .q-chip{font-size:12.5px;padding:4px 10px;white-space:normal;text-align:left}.fine{font-size:12px;color:var(--muted);margin:14px 0 0;line-height:1.45}.turn{border-top:1px solid var(--rule);margin-top:14px;padding-top:14px}.turn .q{font:500 15.5px/1.35 var(--serif);margin:0 0 8px}.turn .st{font-size:13px;color:var(--muted);display:flex;gap:8px;align-items:center}.ans{font:400 15.5px/1.6 var(--serif)}.ans p{margin:0 0 .75em}.ans ul,.ans ol{padding-left:1.25em;margin:0 0 .75em}.ans h3,.ans h4{font:600 15px var(--sans);margin:1em 0 .35em}.ans a.c{color:var(--amber);font:600 .78em var(--sans);text-decoration:none;background:var(--amber-wash);border-radius:4px;padding:0 4px;margin:0 1px;vertical-align:1px}.ans .cur::after{content:\"\";display:inline-block;width:7px;height:15px;background:var(--teal);vertical-align:-2px;margin-left:2px;animation:blink 1s steps(2) infinite}@keyframes blink{50%{opacity:0}}.srcs{list-style:none;margin:10px 0 0;padding:0;font-size:13px}.srcs li{display:grid;grid-template-columns:22px 1fr;gap:8px;padding:6px 0;border-top:1px dashed var(--rule)}.srcs .n{font:600 11.5px/20px var(--sans);text-align:center;background:var(--amber-wash);color:var(--amber);border-radius:5px;height:20px}.srcs a{text-decoration:none;font:500 14px/1.3 var(--serif)}.srcs a:hover{color:var(--teal)}.srcs .here{color:var(--teal);font:600 11px var(--sans);text-transform:uppercase;letter-spacing:.05em;margin-left:6px}.fu{display:flex;flex-direction:column;gap:6px;margin-top:10px}.fu button{text-align:left;border:1px solid var(--rule);background:var(--paper);border-radius:8px;padding:7px 10px;font:400 14px/1.35 var(--serif)}.fu button:hover{border-color:var(--teal)}.fb{display:flex;gap:10px;align-items:center;font-size:12.5px;color:var(--muted);margin-top:10px}.fb button{border:1px solid var(--rule);background:none;border-radius:6px;padding:3px 9px;font-size:12.5px}.fb button:hover{border-color:var(--teal);color:var(--teal)}.err{color:var(--red);font-size:14px}.ctx-g{margin:0 0 18px}.ctx-g h3{font:600 12px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}.ctx-l{display:flex;flex-wrap:wrap;gap:6px}.ctx-l button{display:inline-flex;align-items:center;gap:7px;text-align:left;border:1px solid var(--rule);background:var(--paper);border-radius:8px;padding:6px 10px;font:400 14px/1.3 var(--serif);color:var(--ink)}.ctx-l button:hover{border-color:var(--c)}.ctx-l button i{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}.ctx-l.q button{width:100%}.ctx-l.q button i{border-radius:2px;transform:rotate(45deg)}.mini{width:100%;height:190px;display:block;margin:0 0 14px;border-radius:var(--r);background:var(--paper)}.mini line{stroke:var(--rule);stroke-width:1.2}.mini circle{stroke:var(--surface);stroke-width:2}.mini text{font:500 9.5px var(--sans);fill:var(--muted)}.mini g.c{cursor:pointer}.mini g.c:hover text{fill:var(--ink)}.vl,.rl{list-style:none;margin:0;padding:0}.vl li{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--rule);font-size:13.5px;align-items:baseline}.vl .v{font:600 12px var(--sans);background:var(--wash);border-radius:5px;padding:2px 7px;text-align:center}.vl .cur .v{background:var(--teal);color:var(--paper)}.vl a{text-decoration:none;font:400 14.5px/1.3 var(--serif)}.vl small{grid-column:2;color:var(--muted)}.rl li{padding:11px 0;border-bottom:1px solid var(--rule)}.rl a{text-decoration:none;font:500 15px/1.3 var(--serif);display:block;margin-bottom:3px}.rl a:hover{color:var(--teal)}.rl p{margin:0;font-size:13px;color:var(--muted);line-height:1.45}.rl small{font-size:12px;color:var(--muted)}.none{font-size:14px;color:var(--muted)}.fab{display:none}dialog#cite-d{padding:24px;max-width:620px;width:calc(100% - 32px);color:var(--ink);box-shadow:var(--shadow)}dialog#cite-d::backdrop{background:rgba(10,14,30,.45);backdrop-filter:blur(2px)}#cite-d h2{font:500 24px var(--serif);margin:0 0 14px}.cite-tabs{display:flex;gap:6px;margin-bottom:12px}#cite-t{font:13px/1.55 var(--mono);background:var(--paper);border:1px solid var(--rule);border-radius:var(--r);padding:14px;white-space:pre-wrap;word-break:break-word;margin:0 0 14px;max-height:50vh;overflow:auto}.cite-a{display:flex;gap:8px;justify-content:flex-end}@media (max-width:1240px){.pp-grid{grid-template-columns:190px minmax(0,1fr) 320px;gap:32px}}@media (max-width:1080px){.pp-grid{grid-template-columns:minmax(0,1fr) 330px}.toc{position:static;grid-column:1/-1;max-height:none}.toc-d{background:var(--surface);border:1px solid var(--rule);border-radius:var(--r-lg);padding:14px 16px}.toc-d:not([open]) summary{margin:0}.ix-hero{grid-template-columns:1fr;gap:28px}.plist{grid-template-columns:1fr}}@media (max-width:860px){.pp-grid{grid-template-columns:minmax(0,1fr)}.rail{position:static;max-height:none}.rail-in{max-height:none}.tp{max-height:none}.fab{display:inline-flex;position:fixed;right:16px;bottom:18px;z-index:50;align-items:center;gap:8px;border:0;background:var(--teal);color:var(--paper);border-radius:999px;padding:12px 18px;font-weight:600;box-shadow:var(--shadow)}.fab svg{width:18px;height:18px}.prose{font-size:17.5px}.prose .hx{display:none}.sub{grid-template-columns:1fr}}@media (max-width:560px){.ix-hero{padding:24px 16px 22px}.ix-intro h1{font-size:34px}.lede{font-size:17px}.ix-stats{display:none}.ix-controls{top:56px}.ix-sort span{display:none}.pc-t{font-size:19px}.ph h1{font-size:28px}.ph-act .q-btn{padding:8px 11px}.abstract{padding:4px 16px 8px;font-size:16.5px}.prose{font-size:17px;line-height:1.62}.sub form{flex-direction:column}}@media print{.pp-grid{display:block}.prose{max-width:none;font-size:11pt}.abstract{border:1px solid #999}.rp{display:none}}";
function lpHeader(current) {
  const nav = [["Papers", "/papers", "papers"], ["Ask the corpus", LP_ASK + "/", "ask"], ["Ideas", "https://ideas.qnfo.org/", "ideas"], ["Archive", "https://archive.qnfo.org/", "archive"], ["About", "https://qnfo.org/about", "about"], ["Work with me", "https://qnfo.org/work-with-me", "work"]];
  return '<header class="q-top" id="q-top"><div class="wrap"><a class="q-mark" href="/papers" aria-label="QNFO Papers home">' + LP_MARK + 'QNFO <small>Papers</small></a><nav class="q-nav" aria-label="QNFO sites">' + nav.map(function(n) {
    return '<a href="' + n[1] + '"' + (n[2] === current ? ' aria-current="page"' : "") + ">" + n[0] + "</a>";
  }).join("") + "</nav>" + '<details class="q-menu"><summary aria-label="Menu"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></summary><div class="q-menu-panel">' + nav.map(function(n) { return '<a href="' + n[1] + '"' + (n[2] === current ? ' aria-current="page"' : "") + ">" + n[0] + "</a>"; }).join("") + "</div></details>" + LP_THEME_BTN + "</div></header>";
}
function lpFooter() {
  return '<footer class="q-foot"><div class="wrap"><span>QNFO Papers: open research from the QNFO program</span><a href="/rss.xml">RSS</a><a href="/sitemap.xml">Sitemap</a><a href="/llms.txt">llms.txt</a><a href="' + LP_ASK + '">Ask the corpus</a><a href="https://qnfo.org/about">About</a><a href="https://qnfo.org/work-with-me#contact">Contact</a><a href="https://legal.qnfo.org/">License: QNFO-ULA v2.0</a><a href="https://legal.qnfo.org/privacy">Privacy</a><a href="https://orcid.org/' + OWNER_ORCID + '">ORCID</a></div></footer><div class="q-toast" id="q-toast" role="status" aria-live="polite"></div>';
}
function lpDoc(o) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F5F7FB" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#141A33" media="(prefers-color-scheme: dark)">' + LP_THEME_BOOT + (o.head || "") + LP_FONTS + (o.math ? LP_MATHJAX : "") + "<style>" + LP_DS + LP_CSS + "</style>" + LP_GA + '</head><body class="' + (o.cls || "") + '">' + lpHeader(o.nav) + o.body + lpFooter() + "<script>" + LP_COMMON_JS + "<\/script>" + (o.js ? "<script>" + o.js + "<\/script>" : "") + "</body></html>";
}
// DOI-HYGIENE-1 (3.8.2): the doi column held "pending" (2 rows) and a full https://doi.org/ URL (1 row); both were
// printed as dead doi.org links and sent to Scholar as citation_doi. Only a real DOI (10.<registrant>/<suffix>) is used.
function lpDoi(d) {
  const x = String(d || "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  return /^10\.\d{4,9}\/\S+$/.test(x) && !/^10\.5281\//.test(x) && !/zeno\x64o/i.test(x) ? x : null;
}
function lpDate(s) {
  const d = String(s || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1];
  return Number(d.slice(8, 10)) + " " + m + " " + d.slice(0, 4);
}
function lpNorm(t) {
  return String(t || "").toLowerCase().replace(/\((version|v)[^)]*\)|\bv\d+(\.\d+)*\b|[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
}
var LP_STOP = new Set("constructs construct establish shows about above after again against also among answer because been before being below between both could does doing down during each from further have having here into itself just more most other over same should some such than that their them then there these they this those through under until very what when where which while whom with within would your toward towards using based framework paper study theory approach model models analysis results result quantum version first second third second-order new".split(" "));
function lpStem(w) {
  const s = w.replace(/(ations?|ings?|ically|ical|ness|ities|ity|ed|es|s)$/, "");
  return s.length >= 4 ? s : w;
}
// Key terms of a title or abstract, stemmed (braiding -> braid) so graph names and FTS prefixes match.
function lpTerms(s) {
  const seen = new Set(), out = [];
  (String(s || "").toLowerCase().match(/[a-z][a-z0-9]{4,}/g) || []).forEach(function(w) {
    if (LP_STOP.has(w)) return;
    w = lpStem(w);
    if (!LP_STOP.has(w) && !seen.has(w)) { seen.add(w); out.push(w); }
  });
  return out;
}
function lpExcerpt(ab, n) {
  let a = mdPlain(ab);
  if (a.length > n) a = a.slice(0, a.lastIndexOf(" ", n) > n * 0.6 ? a.lastIndexOf(" ", n) : n) + "\u2026";
  return a;
}
// ---------------------------------------------------------------- index
function lpPaperRow(p) {
  const cat = detectCategory(p.title, p.abstract);
  const cl = CATEGORY_LABELS[cat] || "Other";
  const href = "/papers/" + escAttr(p.slug);
  const askHref = LP_ASK + "/?q=" + encodeURIComponent("What does \u201c" + displayTitle(p.title).slice(0, 140) + "\u201d show, and what would falsify it?");
  const ver = p.version && !/^1(\.0)*$/.test(String(p.version)) ? '<span class="pc-v">v' + esc(String(p.version).replace(/^v/i, "")) + "</span>" : "";
  return '<li class="pc" data-cat="' + cat + '"><div class="pc-meta"><span class="pc-cat" style="--c:var(' + (LP_CAT_VAR[cat] || "--muted") + ')">' + esc(cl) + '</span><time datetime="' + escAttr(String(p.created_at || "").slice(0, 10)) + '">' + esc(lpDate(p.created_at)) + "</time>" + ver + '</div><h3 class="pc-t"><a href="' + href + '">' + titleHTML(p.title) + '</a></h3><p class="pc-a">' + absHTML(p.abstract, 300) + '</p><div class="pc-x"><a href="' + href + '">Read</a><a href="' + escAttr(askHref) + '">Ask about it</a>' + "" + "</div></li>";
}
function lpHistogram(months) {
  if (!months || !months.length) return "";
  const max = Math.max.apply(null, months.map(function(m) { return m.n; })) || 1;
  const W = 300, H = 72, bw = W / months.length;
  const bars = months.map(function(m, i) {
    const h = Math.max(m.n ? 3 : 1, Math.round((m.n / max) * (H - 18)));
    return '<g><title>' + esc(m.label) + ": " + m.n + ' papers</title><rect x="' + (i * bw + 2).toFixed(1) + '" y="' + (H - 14 - h) + '" width="' + (bw - 4).toFixed(1) + '" height="' + h + '" rx="2" class="' + (i === months.length - 1 ? "now" : "") + '"/></g>';
  }).join("");
  const lab = '<text x="2" y="' + (H - 1) + '">' + esc(months[0].label) + '</text><text x="' + W + '" y="' + (H - 1) + '" text-anchor="end">' + esc(months[months.length - 1].label) + "</text>";
  return '<svg class="hist" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Papers published per month, last ' + months.length + ' months">' + bars + lab + "</svg>";
}
function lpIndexHTML(papers, total, offset, hasMore, activeCategory, searchQuery, extra) {
  extra = extra || {};
  const facets = extra.facets || {};
  const all = extra.all_total != null ? extra.all_total : total;
  const sort = extra.sort || "new";
  const qs = function(cat) {
    const p = [];
    if (cat && cat !== "all") p.push("category=" + cat);
    if (searchQuery) p.push("search=" + encodeURIComponent(searchQuery));
    if (sort !== "new") p.push("sort=" + sort);
    return "/papers" + (p.length ? "?" + p.join("&") : "");
  };
  const facetSum = LP_CAT_ORDER.reduce(function(a, c) { return a + (facets[c] || 0); }, 0);
  const chips = ['<a class="q-chip' + (!activeCategory ? " on" : "") + '" data-cat="all" href="' + qs("all") + '">All <b>' + facetSum + "</b></a>"].concat(LP_CAT_ORDER.map(function(c) {
    return '<a class="q-chip' + (activeCategory === c ? " on" : "") + '" data-cat="' + c + '" href="' + qs(c) + '"><i class="dot" style="--c:var(' + LP_CAT_VAR[c] + ')"></i>' + esc(CATEGORY_LABELS[c] || c) + " <b>" + (facets[c] || 0) + "</b></a>";
  })).join("");
  const bar = facetSum ? '<div class="catbar" aria-hidden="true">' + LP_CAT_ORDER.map(function(c) {
    const n = facets[c] || 0;
    return n ? '<span style="flex:' + n + ";--c:var(" + LP_CAT_VAR[c] + ')" title="' + escAttr((CATEGORY_LABELS[c] || c) + ": " + n) + '"></span>' : "";
  }).join("") + "</div>" : "";
  const heading = searchQuery ? "Results for \u201c" + esc(searchQuery) + "\u201d" : activeCategory ? esc(CATEGORY_LABELS[activeCategory] || activeCategory) + " papers" : "All papers";
  const latest = extra.latest ? lpDate(extra.latest) : "";
  const title = searchQuery ? 'Search: "' + esc(searchQuery) + '" \u2014 QNFO Papers' : activeCategory ? (CATEGORY_LABELS[activeCategory] || activeCategory) + " Papers \u2014 QNFO" : "QNFO Papers \u2014 open research you can read, cite and question";
  const head = "<title>" + title + '</title><meta name="description" content="' + escAttr(all + " open-access papers from the QNFO research program: p-adic and adelic physics, ultrametric information, topological quantum computing and computer science, all free to read.") + '"><link rel="canonical" href="https://papers.qnfo.org/papers"><link rel="alternate" type="application/rss+xml" title="QNFO Papers RSS" href="/rss.xml"><meta property="og:title" content="QNFO Papers"><meta property="og:type" content="website"><meta property="og:url" content="https://papers.qnfo.org/papers"><meta property="og:description" content="' + escAttr(all + " open research papers from the QNFO program.") + '">';
  const body = '<main id="main"><section class="wrap ix-hero"><div class="ix-intro"><p class="q-eyebrow">Open research library</p><h1>Papers you can read, cite and question</h1><p class="lede">' + all + ' papers from the QNFO program on p-adic and adelic physics, ultrametric information, topological quantum computing and the computer science around them' + "" + '. Every page renders its mathematics and can be questioned in place. <a href="/reading">How a living paper works</a>.</p><form class="ix-search" method="get" action="/papers" role="search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14 14l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><label class="sr" for="ix-q">Search papers</label><input id="ix-q" type="search" name="search" value="' + (searchQuery ? escAttr(searchQuery) : "") + '" placeholder="Search titles and abstracts" autocomplete="off">' + (activeCategory ? '<input type="hidden" name="category" value="' + escAttr(activeCategory) + '">' : "") + '<kbd>/</kbd></form><p class="ix-hint">Looking for an answer rather than a paper? <a href="' + LP_ASK + '">Ask the whole corpus</a>: answers cite the papers they come from.</p></div><aside class="ix-stats q-card" aria-label="Library at a glance"><div class="ix-n"><b>' + all + "</b><span>papers" + (latest ? "<br>newest " + esc(latest) : "") + "</span></div>" + lpHistogram(extra.months) + '<p class="ix-cap">Published per month</p>' + bar + '<ul class="ix-legend">' + LP_CAT_ORDER.map(function(c) {
    return '<li><i class="dot" style="--c:var(' + LP_CAT_VAR[c] + ')"></i>' + esc(CATEGORY_LABELS[c] || c) + " <b>" + (facets[c] || 0) + "</b></li>";
  }).join("") + '</ul></aside></section><section class="ix-controls"><div class="wrap"><div class="ix-chips" id="ix-chips" role="group" aria-label="Topic">' + chips + '</div><label class="ix-sort"><span>Sort</span><select id="ix-sort" aria-label="Sort papers"><option value="new"' + (sort === "new" ? " selected" : "") + '>Newest</option><option value="old"' + (sort === "old" ? " selected" : "") + '>Oldest</option><option value="title"' + (sort === "title" ? " selected" : "") + '>Title A\u2013Z</option></select></label></div></section><section class="wrap ix-list"><h2 class="ix-h"><span id="ix-head">' + heading + '</span> <span class="ix-count" id="paper-count">' + total + " paper" + (total === 1 ? "" : "s") + '</span></h2><ol class="plist paper-list" id="plist" data-offset="' + (offset + papers.length) + '" data-more="' + (hasMore ? "1" : "0") + '">' + (papers.length ? papers.map(lpPaperRow).join("") : '<li class="empty">No paper matches. <a href="' + LP_ASK + "/?q=" + encodeURIComponent(searchQuery || "") + '">Ask the corpus instead</a>.</li>') + '</ol><div class="ix-more" id="ix-more">' + (hasMore ? '<button class="q-btn" id="load-more" type="button">Load more papers</button>' : "") + "</div>" + lpSubscribe("papers") + "</section></main>";
  return lpDoc({ head, body, math: true, nav: "papers", cls: "ix", js: LP_INDEX_JS });
}
function lpSubscribe(source) {
  return '<section class="sub q-card" aria-labelledby="sub-h"><div><h2 id="sub-h">New papers by email</h2><p>One short weekly digest: titles and links. No tracking; unsubscribe any time.</p></div><form id="ld-sub-form" novalidate data-source="' + escAttr(source) + '"><label for="ld-email" class="sr">Email address</label><input id="ld-email" type="email" name="email" placeholder="you@example.com" required autocomplete="email"><input id="ld-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="sr"><button type="submit" id="ld-btn" class="q-btn pri">Subscribe</button></form><p id="ld-msg" role="status" aria-live="polite"></p></section>';
}
// ---------------------------------------------------------------- paper
function lpSlug(t, used) {
  // Text between tags only; the slug is then reduced to [a-z0-9-], so it never carries markup.
  let s = String(t || "").split("<").map(function(part, i) { return i ? part.slice(part.indexOf(">") + 1) : part; }).join("").replace(/&[a-z#0-9]+;/gi, " ").toLowerCase().replace(/\$[^$]*\$/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";
  let k = s, i = 2;
  while (used.has(k)) k = s + "-" + i++;
  used.add(k);
  return k;
}
function lpStripTitle(md, title) {
  const m = /^\s*#\s+([^\n]+)\n/.exec(md);
  if (m && lpNorm(m[1]).slice(0, 40) === lpNorm(title).slice(0, 40)) return md.slice(m[0].length);
  return md;
}
// Section ids + contents list from the rendered HTML; the Abstract section becomes the lede.
function lpStructure(html) {
  const used = new Set(), toc = [];
  if (/<h1>/.test(html)) html = html.replace(/<(\/?)h([1-5])>/g, function(m, sl, n) { return "<" + sl + "h" + (Number(n) + 1) + ">"; });
  html = html.replace(/<h([234])>([\s\S]*?)<\/h\1>/g, function(m, lv, inner) {
    const id = lpSlug(inner, used);
    if (lv !== "4") toc.push({ lv: Number(lv), id, html: inner });
    return "<h" + lv + ' id="' + id + '"><a class="hx" href="#' + id + '" aria-label="Link to this section">#</a>' + inner + "</h" + lv + ">";
  });
  html = html.replace(/(<h2 id="abstract">[\s\S]*?<\/h2>)([\s\S]*?)(?=<h2 |$)/, function(m, h, b) {
    return '<section class="abstract" aria-labelledby="abstract">' + h + b + "</section>";
  });
  return { html, toc };
}
function lpTocHTML(toc) {
  if (toc.length < 2) return "";
  return '<ol class="toc-l">' + toc.map(function(t) {
    return '<li class="lv' + t.lv + '"><a href="#' + t.id + '">' + t.html.replace(/<a [^>]*>|<\/a>/g, "") + "</a></li>";
  }).join("") + "</ol>";
}
function lpIcon(n) {
  const I = {
    ask: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h7A2.5 2.5 0 0 1 16 5.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3A2.5 2.5 0 0 1 4 10.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    cite: '<path d="M5 6h4v4H6.5c0 1.6.6 2.6 2 3M11 6h4v4h-2.5c0 1.6.6 2.6 2 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    pdf: '<path d="M6 3h6l3 3v11H6z M12 3v3h3 M8.5 10.5v4 M10 12.5l-1.5 2-1.5-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>',
    share: '<path d="M10 3v10M6.5 6.5L10 3l3.5 3.5M5 11v5h10v-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    doi: '<circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6.5v7M6.5 10h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  };
  return '<svg viewBox="0 0 20 20" aria-hidden="true">' + (I[n] || "") + "</svg>";
}
function lpPaperHTML(paper) {
  const rawBody = paper.body_md || "";
  const _stripped = stripFrontmatter(rawBody).trim();
  let md = _stripped ? fixMojibake(_stripped) : "";
  if (md.trim().length < 40) {
    const _abs = (paper && paper.abstract ? String(paper.abstract) : "").trim();
    md = _abs ? "## Abstract\n\n" + _abs : "## Abstract\n\nFull text is being prepared and will appear here shortly.";
  }
  md = lpStripTitle(md, paper.title);
  const st = lpStructure(renderMarkdown(md));
  const words = md.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, " x ").split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 230));
  const t = displayTitle(paper.title) || "Untitled";
  const abstract = lpExcerpt(paper.abstract, 300);
  const dateStr = paper.created_at ? paper.created_at.slice(0, 10) : "";
  const cat = detectCategory(paper.title, paper.abstract);
  const authors = paperAuthors(paper);
  const ver = String(paper.version || "1.0.0").replace(/^v/i, "");
  const url = "https://papers.qnfo.org/papers/" + paper.slug;
  const data = { slug: paper.slug, title: t, doi: paper.doi || null, date: dateStr, version: ver, authors: authors.length ? authors : [AUTHOR_OF_RECORD], url, ask: LP_ASK, pdf: paper._pdf ? url + ".pdf" : null, words, cat: CATEGORY_LABELS[cat] || "Other" };
  const head = buildPaperJsonLd(paper) + "<title>" + esc(t) + ' \u2014 QNFO Papers</title><meta name="description" content="' + escAttr(abstract) + '"><meta property="og:title" content="' + escAttr(t) + '"><meta property="og:type" content="article"><meta property="og:url" content="' + escAttr(url) + '"><meta property="og:description" content="' + escAttr(abstract) + '"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="' + escAttr(t) + '"><meta name="twitter:description" content="' + escAttr(abstract) + '">' + (paper.doi ? '<meta name="citation_doi" content="' + escAttr(paper.doi) + '">' : "") + '<meta name="citation_title" content="' + escAttr(t) + '">' + citationAuthorsMeta(paper) + '<meta name="citation_publication_date" content="' + escAttr(dateStr || "Unknown") + '">' + (paper._pdf ? '<meta name="citation_pdf_url" content="' + escAttr(url) + '.pdf">' : "") + '<meta name="citation_publisher" content="QNFO"><link rel="canonical" href="' + escAttr(url) + '">';
  const byline = data.authors.map(function(n) {
    return n.indexOf("Quni-Gudzinas") >= 0 ? '<a href="https://orcid.org/' + OWNER_ORCID + '" rel="author">' + esc(n) + '<svg class="orcid" viewBox="0 0 20 20" aria-label="ORCID"><circle cx="10" cy="10" r="9" fill="#A6CE39"/><path d="M7 6.2v.01M7 8.5v6M9.5 8.5v6h2a3 3 0 0 0 0-6z" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></a>' : esc(n);
  }).join(", ");
  const toc = lpTocHTML(st.toc);
  const sugg = ["What is the main result, in plain terms?", "What would falsify this?", "Which assumptions does it rest on?", "How does it connect to other QNFO work?"];
  const body = '<div class="rp" id="rp" aria-hidden="true"><span></span></div><main id="main" class="wrap pp"><nav class="crumbs" aria-label="Breadcrumb"><a href="/papers">Papers</a><span aria-hidden="true">/</span><a href="/papers?category=' + cat + '">' + esc(CATEGORY_LABELS[cat] || "Other") + '</a></nav><header class="ph"><h1>' + titleHTML(paper.title) + '</h1><p class="by">' + byline + '</p><div class="ph-meta"><span class="q-tag live" title="This paper is versioned: new versions keep the same address here"><i></i>Living paper \u00b7 v' + esc(ver) + "</span>" + (dateStr ? '<span>Published <time datetime="' + escAttr(dateStr) + '">' + esc(lpDate(dateStr)) + "</time></span>" : "") + "<span>" + minutes + " min read \u00b7 " + words.toLocaleString("en-US") + " words</span>" + '</div><div class="ph-act no-print"><button class="q-btn teal" type="button" data-go="ask">' + lpIcon("ask") + 'Ask this paper</button><button class="q-btn" type="button" id="b-cite">' + lpIcon("cite") + "Cite</button>" + (paper._pdf ? '<a class="q-btn" href="' + escAttr(url) + '.pdf">' + lpIcon("pdf") + "PDF</a>" : "") + '<button class="q-btn" type="button" id="b-share">' + lpIcon("share") + "Share</button></div></header>" + '<div class="pp-grid"><aside class="toc no-print" aria-label="Contents">' + (toc ? '<details class="toc-d" open><summary>Contents</summary>' + toc + "</details>" : "") + '</aside><article class="prose rendered-md" id="doc">' + st.html + '</article><aside class="rail no-print" id="rail" aria-label="Living paper"><div class="rail-in"><div class="tabs" role="tablist"><button role="tab" aria-selected="true" aria-controls="t-ask" id="tb-ask" data-tab="ask">Ask</button><button role="tab" aria-selected="false" aria-controls="t-ctx" id="tb-ctx" data-tab="ctx">Context</button><button role="tab" aria-selected="false" aria-controls="t-ver" id="tb-ver" data-tab="ver">Versions</button><button role="tab" aria-selected="false" aria-controls="t-rel" id="tb-rel" data-tab="rel">Related</button></div>' + '<section class="tp" id="t-ask" role="tabpanel" aria-labelledby="tb-ask"><form id="ask-f" autocomplete="off"><label class="sr" for="ask-q">Ask a question about this paper</label><textarea id="ask-q" rows="2" maxlength="1000" placeholder="Ask anything about this paper"></textarea><button class="q-btn pri" type="submit" id="ask-go">Ask</button></form><div class="sugg" id="ask-sugg">' + sugg.map(function(s) {
    return '<button type="button" class="q-chip">' + esc(s) + "</button>";
  }).join("") + '</div><div id="ask-out" aria-live="polite"></div><p class="fine">Answers are written from this paper first and other QNFO papers second, with numbered citations. Select any passage in the text to ask about it.</p></section><section class="tp" id="t-ctx" role="tabpanel" aria-labelledby="tb-ctx" hidden><div class="ld"><span class="q-skel"></span><span class="q-skel" style="width:70%"></span></div></section><section class="tp" id="t-ver" role="tabpanel" aria-labelledby="tb-ver" hidden><div class="ld"><span class="q-skel"></span></div></section><section class="tp" id="t-rel" role="tabpanel" aria-labelledby="tb-rel" hidden><div class="ld"><span class="q-skel"></span><span class="q-skel" style="width:80%"></span></div></section></div></aside></div>' + lpSubscribe("papers") + '</main><button class="fab no-print" type="button" data-go="ask" aria-label="Ask this paper">' + lpIcon("ask") + '<span>Ask</span></button><div class="selpop no-print" id="selpop" role="toolbar" aria-label="Selection" hidden><button type="button" data-sel="ask">' + lpIcon("ask") + 'Ask about this</button><button type="button" data-sel="quote">' + lpIcon("cite") + 'Copy quote</button></div><div class="refpop" id="refpop" role="tooltip" hidden></div><dialog id="cite-d" class="q-card"><form method="dialog"><h2>Cite this paper</h2><div class="cite-tabs" role="tablist"><button type="button" class="q-chip on" data-fmt="apa">APA</button><button type="button" class="q-chip" data-fmt="bibtex">BibTeX</button><button type="button" class="q-chip" data-fmt="plain">Plain</button></div><pre id="cite-t" tabindex="0"></pre><div class="cite-a"><button type="button" class="q-btn pri" id="cite-copy">Copy</button><button class="q-btn" value="close">Close</button></div></form></dialog><script type="application/json" id="lp-data">' + JSON.stringify(data).replace(/</g, "\\u003c") + "<\/script>";
  return lpDoc({ head, body, math: true, nav: "papers", cls: "paper", js: LP_PAPER_JS });
}
// ---------------------------------------------------------------- /api/paper-context/<slug>
var LP_PUBLIC_LABELS = ["Concept", "ResearchQuestion", "Finding", "Theorem"];
var LP_PRIVATE = /(infra|deploy|worker|cloudflare|\br2\b|kv-|d1-|handoff|session|skill|vault|\bcv\b|personal|email|outreach|\bops\b|fleet|governance|automation|storage|asset|yogananda)/i;
async function handlePaperContext(env, slug) {
  const H = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" };
  const out = function(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: H }); };
  if (!/^[a-z0-9][a-z0-9-]{1,180}$/.test(slug)) return out({ error: "bad slug" }, 400);
  const paper = await env.LIVING_PAPER.prepare("SELECT slug,title,abstract,doi,version,created_at FROM papers WHERE slug = ? AND status IN " + LP_PUBLIC + " LIMIT 1").bind(slug).first();
  if (!paper) return out({ error: "Paper not found" }, 404);
  const norm = lpNorm(paper.title);
  const terms = lpTerms(paper.title).slice(0, 5).concat(lpTerms(String(paper.abstract || "").slice(0, 500)).slice(0, 3)).filter(function(w, i, a) { return a.indexOf(w) === i; }).slice(0, 6);
  const none = { results: [] };
  const q = function(p) { return p.then(function(r) { return r || none; }, function() { return none; }); };
  const res = await Promise.all([
    q(env.LIVING_PAPER.prepare("SELECT slug,title,version,created_at,doi FROM papers WHERE slug IS NOT NULL AND status IN " + LP_PUBLIC + " AND lower(substr(title,1,22)) = ? ORDER BY created_at DESC LIMIT 24").bind(String(paper.title || "").toLowerCase().slice(0, 22)).all()),
    terms.length ? q(env.LIVING_PAPER.prepare("SELECT p.slug,p.title,p.created_at,p.doi,p.abstract FROM papers_fts JOIN papers p ON p.rowid = papers_fts.rowid WHERE papers_fts MATCH ? AND p.slug IS NOT NULL AND p.slug != ? AND p.status IN " + LP_PUBLIC + " ORDER BY papers_fts.rank LIMIT 24").bind(terms.map(function(w) { return w + "*"; }).join(" OR "), slug).all()) : Promise.resolve(none)
  ]);
  // Graph matches use the most specific title terms; a node needs two of them, or one term of 6+ letters.
  const gTerms = lpTerms(paper.title).filter(function(w) { return w.length >= 5; }).sort(function(x, y) { return y.length - x.length; }).slice(0, 8);
  let graphRows = none;
  if (gTerms.length && env.DB) {
    const st = env.DB.prepare("SELECT id,name,label,properties FROM nodes WHERE label IN ('Concept','ResearchQuestion','Finding','Theorem') AND (" + gTerms.map(function() { return "name LIKE ?"; }).join(" OR ") + ") LIMIT 120");
    graphRows = await q(st.bind.apply(st, gTerms.map(function(w) { return "%" + w + "%"; })).all());
  }
  const gScore = function(name) {
    const n = String(name || "").toLowerCase();
    let k = 0, long = false;
    gTerms.forEach(function(w) { if (new RegExp("(^|[^a-z])" + w).test(n)) { k++; if (w.length >= 6) long = true; } });
    return k >= 2 || long ? k : 0;
  };
  const versions = (res[0].results || []).filter(function(r) { return lpNorm(r.title) === norm; }).map(function(r) {
    return { slug: r.slug, title: displayTitle(r.title), version: String(r.version || "").replace(/^v/i, "") || null, date: String(r.created_at || "").slice(0, 10), doi: lpDoi(r.doi), current: r.slug === slug };
  });
  const seen = new Set([norm]);
  const related = [];
  (res[1].results || []).forEach(function(r) {
    const n = lpNorm(r.title);
    if (seen.has(n) || related.length >= 6) return;
    seen.add(n);
    related.push({ slug: r.slug, title: displayTitle(r.title), date: String(r.created_at || "").slice(0, 10), doi: lpDoi(r.doi), cat: CATEGORY_LABELS[detectCategory(r.title, r.abstract)] || "Other", excerpt: lpExcerpt(r.abstract, 170) });
  });
  const rank = { Concept: 0, ResearchQuestion: 1, Finding: 2, Theorem: 3 };
  const cseen = new Set();
  const concepts = (graphRows.results || []).map(function(r) {
    let props = {};
    try { props = JSON.parse(r.properties || "{}") || {}; } catch (e) {}
    const name = String(r.label === "ResearchQuestion" ? props.question || r.name : r.name || "").replace(/^RQ-[\w-]+\s*:\s*/i, "").replace(/^"|"$/g, "").trim();
    return { id: r.id, name, label: r.label, status: props.status || null };
  }).filter(function(c) {
    const k = c.name.toLowerCase();
    if (!c.name || c.name.length > 160 || LP_PRIVATE.test(c.id) || LP_PRIVATE.test(c.name) || cseen.has(k)) return false;
    c._s = gScore(c.name);
    if (!c._s) return false;
    cseen.add(k);
    return true;
  }).sort(function(a, b) { return b._s - a._s || rank[a.label] - rank[b.label]; }).slice(0, 14).map(function(c) { delete c._s; return c; });
  return out({ slug, terms, graph_terms: gTerms, versions, related, concepts, generated_at: new Date().toISOString() });
}
var LP_COMMON_JS = "(function(){\n  var root = document.documentElement;\n  window.qToast = function(msg){ var t = document.getElementById('q-toast'); if(!t) return; t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(function(){ t.classList.remove('on'); }, 2200); };\n  var tb = document.getElementById('q-theme');\n  if (tb) tb.addEventListener('click', function(){\n    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');\n    var next = cur === 'dark' ? 'light' : 'dark';\n    root.setAttribute('data-theme', next);\n    try { localStorage.setItem('qnfo-theme', next); } catch(e) {}\n  });\n  var top = document.getElementById('q-top');\n  if (top) { var onS = function(){ top.classList.toggle('scrolled', scrollY > 4); }; addEventListener('scroll', onS, {passive:true}); onS(); }\n  window.qCopy = function(text, msg){\n    var done = function(){ qToast(msg || 'Copied'); };\n    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function(){ fallback(); });\n    else fallback();\n    function fallback(){ var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch(e) {} document.body.removeChild(ta); }\n  };\n  var f = document.getElementById('ld-sub-form');\n  if (f) f.addEventListener('submit', function(e){\n    e.preventDefault();\n    var msg = document.getElementById('ld-msg'), btn = document.getElementById('ld-btn');\n    var email = (document.getElementById('ld-email').value || '').trim(), hp = (document.getElementById('ld-hp') || {}).value || '';\n    if (!email || email.indexOf('@') < 1) { msg.textContent = 'Please enter a valid email address.'; return; }\n    btn.disabled = true; msg.textContent = 'Subscribing\u2026';\n    fetch('/api/subscribe', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email: email, hp: hp, source: f.getAttribute('data-source') || 'papers'})})\n      .then(function(r){ return r.json().catch(function(){ return {}; }); })\n      .then(function(j){ if (j && j.ok) { msg.textContent = 'Thanks. Check your inbox to confirm the subscription.'; f.reset(); } else { msg.textContent = (j && j.error) || 'Something went wrong. Please try again.'; } })\n      .catch(function(){ msg.textContent = 'Network error. Please try again.'; })\n      .then(function(){ btn.disabled = false; });\n  });\n})();\n";
var LP_INDEX_JS = "(function(){\n  var list = document.getElementById('plist'), q = document.getElementById('ix-q'), chips = document.getElementById('ix-chips'), sortSel = document.getElementById('ix-sort');\n  var count = document.getElementById('paper-count'), head = document.getElementById('ix-head'), more = document.getElementById('ix-more');\n  if (!list) return;\n  var params = new URLSearchParams(location.search);\n  var state = { search: params.get('search') || '', category: params.get('category') || '', sort: params.get('sort') || 'new', offset: Number(list.getAttribute('data-offset')) || 0, more: list.getAttribute('data-more') === '1', busy: false, seq: 0 };\n  var LABELS = {}; [].forEach.call(chips.querySelectorAll('[data-cat]'), function(a){ LABELS[a.getAttribute('data-cat')] = a.firstChild && a.textContent.replace(/\\s*\\d+\\s*$/, '').trim(); });\n  function qs(extra){\n    var p = new URLSearchParams();\n    if (state.search) p.set('search', state.search);\n    if (state.category) p.set('category', state.category);\n    if (state.sort !== 'new') p.set('sort', state.sort);\n    if (extra) Object.keys(extra).forEach(function(k){ p.set(k, extra[k]); });\n    return p.toString();\n  }\n  function headText(){ return state.search ? 'Results for \u201c' + state.search + '\u201d' : state.category ? (LABELS[state.category] || state.category) + ' papers' : 'All papers'; }\n  function setMore(){\n    more.innerHTML = state.more ? '<button class=\"q-btn\" id=\"load-more\" type=\"button\">Load more papers</button>' : '';\n    var b = document.getElementById('load-more'); if (b) b.addEventListener('click', loadMore);\n    if (io && b) io.observe(b);\n  }\n  function paintChips(f){\n    [].forEach.call(chips.querySelectorAll('[data-cat]'), function(a){\n      var c = a.getAttribute('data-cat');\n      a.classList.toggle('on', (c === 'all' && !state.category) || c === state.category);\n      if (f) { var n = c === 'all' ? Object.keys(f).reduce(function(s,k){ return s + f[k]; }, 0) : (f[c] || 0); var b = a.querySelector('b'); if (b) b.textContent = n; }\n    });\n  }\n  function reload(push){\n    var my = ++state.seq;\n    list.classList.add('busy');\n    fetch('/papers?' + qs({format:'json', limit:50, offset:0})).then(function(r){ return r.json(); }).then(function(d){\n      if (my !== state.seq) return;\n      list.innerHTML = d.rows && d.rows.length ? d.rows.join('') : '<li class=\"empty\">No paper matches. <a href=\"https://ask.qwav.tech/?q=' + encodeURIComponent(state.search) + '\">Ask the corpus instead</a>.</li>';\n      state.offset = (d.rows || []).length; state.more = !!d.hasMore;\n      count.textContent = d.total + (d.total === 1 ? ' paper' : ' papers');\n      head.textContent = headText();\n      paintChips(d.facets); setMore(); typeset();\n      if (push !== false) history.replaceState(null, '', '/papers' + (qs() ? '?' + qs() : ''));\n    }).catch(function(){}).then(function(){ if (my === state.seq) list.classList.remove('busy'); });\n  }\n  function loadMore(){\n    if (state.busy || !state.more) return;\n    state.busy = true; var b = document.getElementById('load-more'); if (b) { b.disabled = true; b.textContent = 'Loading\u2026'; }\n    fetch('/papers?' + qs({format:'json', limit:50, offset: state.offset})).then(function(r){ return r.json(); }).then(function(d){\n      if (d.rows && d.rows.length) list.insertAdjacentHTML('beforeend', d.rows.join(''));\n      state.offset += (d.rows || []).length; state.more = !!d.hasMore; setMore(); typeset();\n    }).catch(function(){ if (b) { b.disabled = false; b.textContent = 'Load more papers'; } }).then(function(){ state.busy = false; });\n  }\n  function typeset(){ if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([list]).catch(function(){}); }\n  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) loadMore(); }); }, {rootMargin: '600px'}) : null;\n  setMore();\n  var t;\n  if (q) {\n    q.addEventListener('input', function(){ clearTimeout(t); t = setTimeout(function(){ var v = q.value.trim(); if (v === state.search) return; state.search = v; reload(); }, 220); });\n    q.form.addEventListener('submit', function(e){ e.preventDefault(); clearTimeout(t); state.search = q.value.trim(); reload(); });\n  }\n  chips.addEventListener('click', function(e){\n    var a = e.target.closest('[data-cat]'); if (!a) return; e.preventDefault();\n    var c = a.getAttribute('data-cat'); state.category = c === 'all' ? '' : c; reload();\n  });\n  if (sortSel) sortSel.addEventListener('change', function(){ state.sort = sortSel.value; reload(); });\n  document.addEventListener('keydown', function(e){\n    if (e.key === '/' && q && document.activeElement !== q && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) { e.preventDefault(); q.focus(); q.select(); }\n    if (e.key === 'Escape' && document.activeElement === q && q.value) { q.value = ''; state.search = ''; reload(); }\n  });\n})();\n";
var LP_PAPER_JS = "(function(){\n  var D = {}; try { D = JSON.parse(document.getElementById('lp-data').textContent); } catch(e) {}\n  var doc = document.getElementById('doc'), rail = document.getElementById('rail');\n  if (!doc) return;\n  function $(id){ return document.getElementById(id); }\n  function esc(s){ return String(s == null ? '' : s).replace(/[&<>\"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]; }); }\n  function typeset(el){ if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise(el ? [el] : undefined).catch(function(){}); }\n\n  // ---- reading progress + contents scroll-spy\n  var bar = document.querySelector('#rp span');\n  function prog(){ var r = doc.getBoundingClientRect(), h = r.height - innerHeight * 0.6; var p = h > 0 ? Math.min(1, Math.max(0, -r.top / h)) : 0; if (bar) bar.style.width = (p * 100).toFixed(1) + '%'; }\n  addEventListener('scroll', prog, {passive:true}); addEventListener('resize', prog); prog();\n  var links = {}; [].forEach.call(document.querySelectorAll('.toc-l a'), function(a){ links[a.getAttribute('href').slice(1)] = a; });\n  var heads = [].slice.call(doc.querySelectorAll('h2[id],h3[id]')).filter(function(h){ return links[h.id]; });\n  if (heads.length && 'IntersectionObserver' in window) {\n    var vis = {};\n    var spy = new IntersectionObserver(function(es){\n      es.forEach(function(e){ vis[e.target.id] = e.isIntersecting; });\n      var cur = null;\n      for (var i = 0; i < heads.length; i++) { if (heads[i].getBoundingClientRect().top < innerHeight * 0.35) cur = heads[i].id; }\n      Object.keys(links).forEach(function(k){ links[k].classList.toggle('on', k === cur); });\n      if (cur && links[cur] && links[cur].scrollIntoView && document.querySelector('.toc').scrollHeight > document.querySelector('.toc').clientHeight) { var tc = document.querySelector('.toc'), lr = links[cur].getBoundingClientRect(), tr = tc.getBoundingClientRect(); if (lr.top < tr.top || lr.bottom > tr.bottom) tc.scrollTop += lr.top - tr.top - tr.height / 3; }\n    }, {rootMargin: '0px 0px -60% 0px'});\n    heads.forEach(function(h){ spy.observe(h); });\n  }\n  if (innerWidth < 1080) { var td = document.querySelector('.toc-d'); if (td) td.open = false; }\n  doc.addEventListener('click', function(e){ var a = e.target.closest('.hx'); if (!a) return; e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); qCopy(location.href, 'Link to this section copied'); });\n\n  // ---- references: [n] previews and jumps\n  var refs = {}, refHead = [].slice.call(doc.querySelectorAll('h2,h3')).filter(function(h){ return /^(#\\s*)?(\\d+\\.?\\s*)?(references|bibliography|works cited)/i.test(h.textContent.trim()); })[0];\n  if (refHead) {\n    var n = refHead.nextElementSibling, k = 0;\n    while (n && !/^H[12]$/.test(n.tagName)) {\n      var items = n.tagName === 'OL' || n.tagName === 'UL' ? [].slice.call(n.children) : [n];\n      items.forEach(function(it){\n        var t = it.textContent.replace(/\\s+/g, ' ').trim(); if (!t) return;\n        // One paragraph often carries several entries: \"[1] A ... [2] B ...\"\n        var parts = t.split(/(?:^|\\s)(?=\\[\\d{1,3}\\]\\s)/).filter(Boolean);\n        if (parts.length > 1 || /^\\[\\d{1,3}\\]\\s/.test(t)) {\n          parts.forEach(function(pt){ var m = /^\\[(\\d{1,3})\\]\\s*/.exec(pt.trim()); if (m) refs[Number(m[1])] = pt.trim().slice(m[0].length); });\n          var m0 = /^\\[(\\d{1,3})\\]/.exec(t); if (m0 && !it.id) it.id = 'ref-' + m0[1];\n        } else if (n.tagName === 'OL') { refs[++k] = t; if (!it.id) it.id = 'ref-' + k; }\n      });\n      n = n.nextElementSibling;\n    }\n  }\n  if (Object.keys(refs).length) {\n    var walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, { acceptNode: function(node){\n      if (!/\\[\\d/.test(node.nodeValue) || /[$\\\\]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;\n      var p = node.parentNode; if (!p || p.closest('pre,code,mjx-container,a,.refs-skip') || (refHead && refHead.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING)) return NodeFilter.FILTER_REJECT;\n      return NodeFilter.FILTER_ACCEPT; } });\n    var hits = []; while (walker.nextNode()) hits.push(walker.currentNode);\n    hits.forEach(function(node){\n      var html = esc(node.nodeValue).replace(/(^|[^\\[\\],\\d\\w])\\[(\\d{1,3}(?:\\s*[,\u2013-]\\s*\\d{1,3})*)\\](?![\\[\\w(])/g, function(m, pre, inner){\n        var nums = inner.split(/\\s*[,\u2013-]\\s*/).map(Number);\n        if (nums.some(function(x){ return !x || !refs[x]; })) return m;\n        return pre + '[' + inner.split(/\\s*,\\s*/).map(function(part){ var first = Number(part.split(/\\s*[\u2013-]\\s*/)[0]); return '<a class=\"cite-n\" href=\"#ref-' + first + '\" data-ref=\"' + first + '\">' + esc(part) + '</a>'; }).join(', ') + ']';\n      });\n      if (html === esc(node.nodeValue)) return;\n      var span = document.createElement('span'); span.innerHTML = html; node.parentNode.replaceChild(span, node);\n    });\n    var pop = $('refpop'), hideT;\n    function showRef(a){ clearTimeout(hideT); var n = a.getAttribute('data-ref'); pop.innerHTML = '<b>[' + esc(n) + ']</b> ' + esc(refs[n]).slice(0, 600); pop.hidden = false; var r = a.getBoundingClientRect(); var x = Math.min(scrollX + r.left, scrollX + innerWidth - pop.offsetWidth - 12); pop.style.left = Math.max(8, x) + 'px'; pop.style.top = (scrollY + r.bottom + 8) + 'px'; }\n    doc.addEventListener('mouseover', function(e){ var a = e.target.closest('.cite-n'); if (a) showRef(a); });\n    doc.addEventListener('focusin', function(e){ var a = e.target.closest('.cite-n'); if (a) showRef(a); });\n    doc.addEventListener('mouseout', function(e){ if (e.target.closest('.cite-n')) hideT = setTimeout(function(){ pop.hidden = true; }, 150); });\n    doc.addEventListener('focusout', function(){ pop.hidden = true; });\n  }\n\n  // ---- tabs and the living rail\n  var tabs = [].slice.call(document.querySelectorAll('.tabs [role=tab]'));\n  function openTab(name){\n    tabs.forEach(function(t){ var on = t.getAttribute('data-tab') === name; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; $('t-' + t.getAttribute('data-tab')).hidden = !on; });\n    if (name !== 'ask') loadContext();\n  }\n  tabs.forEach(function(t, i){\n    t.addEventListener('click', function(){ openTab(t.getAttribute('data-tab')); });\n    t.addEventListener('keydown', function(e){ var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; var n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); n.click(); });\n  });\n  var ctx = null, ctxP = null;\n  function loadContext(){\n    if (ctxP) return ctxP;\n    ctxP = fetch('/api/paper-context/' + encodeURIComponent(D.slug)).then(function(r){ return r.json(); }).then(function(d){ ctx = d; paintContext(d); return d; }).catch(function(){\n      ['ctx','ver','rel'].forEach(function(k){ $('t-' + k).innerHTML = '<p class=\"none\">Could not load this right now.</p>'; }); ctxP = null;\n    });\n    return ctxP;\n  }\n  var COL = { Concept: '--teal', ResearchQuestion: '--rust', Finding: '--violet', Theorem: '--amber' };\n  var LBL = { Concept: 'Concepts', ResearchQuestion: 'Open questions', Finding: 'Findings', Theorem: 'Theorems' };\n  function paintContext(d){\n    var c = d.concepts || [];\n    var html = '';\n    if (c.length) {\n      if (c.length >= 3) html += miniGraph(c);\n      ['Concept','ResearchQuestion','Finding','Theorem'].forEach(function(lb){\n        var xs = c.filter(function(x){ return x.label === lb; }); if (!xs.length) return;\n        html += '<div class=\"ctx-g\"><h3>' + LBL[lb] + '</h3><div class=\"ctx-l' + (lb === 'ResearchQuestion' ? ' q' : '') + '\">' + xs.map(function(x){ return '<button type=\"button\" data-ask=\"' + esc(lb === 'ResearchQuestion' ? 'Does this paper bear on the open question: ' + x.name : 'How does this paper use or relate to ' + x.name + '?') + '\" style=\"--c:var(' + COL[lb] + ')\"><i></i>' + esc(x.name) + '</button>'; }).join('') + '</div></div>';\n      });\n      html += '<p class=\"fine\">From the QNFO knowledge graph, matched on this paper\u2019s key terms. Pick one to ask how it connects.</p>';\n    } else html = '<p class=\"none\">No knowledge-graph nodes match this paper yet.</p>';\n    $('t-ctx').innerHTML = html;\n    var v = d.versions || [];\n    var vh = v.length ? '<ul class=\"vl\">' + v.map(function(x){ return '<li class=\"' + (x.current ? 'cur' : '') + '\"><span class=\"v\">' + esc(x.version ? 'v' + x.version : '\u2013') + '</span>' + (x.current ? '<span>This version</span>' : '<a href=\"/papers/' + esc(x.slug) + '\">' + esc(x.title) + '</a>') + '<small>' + esc(x.date) + (x.doi ? ' \u00b7 doi:' + esc(x.doi) : '') + '</small></li>'; }).join('') + '</ul>' : '';\n    vh += '<p class=\"fine\">' + (v.length > 1 ? v.length + ' versions of this work are on papers.qnfo.org. ' : 'This is the only version on papers.qnfo.org. ') + (D.doi ? 'DOI: <a href=\"https://doi.org/' + esc(D.doi) + '\">' + esc(D.doi) + '</a>.' : '') + '</p>';\n    $('t-ver').innerHTML = vh;\n    var r = d.related || [];\n    $('t-rel').innerHTML = r.length ? '<ul class=\"rl\">' + r.map(function(x){ return '<li><a href=\"/papers/' + esc(x.slug) + '\">' + esc(x.title) + '</a><p>' + esc(x.excerpt) + '</p><small>' + esc(x.cat) + ' \u00b7 ' + esc(x.date) + '</small></li>'; }).join('') + '</ul>' : '<p class=\"none\">No closely related papers found.</p>';\n    typeset($('rail'));\n  }\n  function miniGraph(c){\n    var W = 320, H = 190, cx = W / 2, cy = H / 2, xs = c.slice(0, 10);\n    var out = '<svg class=\"mini\" viewBox=\"0 0 ' + W + ' ' + H + '\" role=\"img\" aria-label=\"This paper and the knowledge-graph nodes it touches\">';\n    var pts = xs.map(function(x, i){ var a = -Math.PI / 2 + i * 2 * Math.PI / xs.length, rx = x.label === 'Concept' ? 118 : 96, ry = x.label === 'Concept' ? 70 : 58; return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), n: x }; });\n    pts.forEach(function(p){ out += '<line x1=\"' + cx + '\" y1=\"' + cy + '\" x2=\"' + p.x.toFixed(1) + '\" y2=\"' + p.y.toFixed(1) + '\"/>'; });\n    out += '<circle cx=\"' + cx + '\" cy=\"' + cy + '\" r=\"9\" fill=\"var(--ink)\"/>';\n    pts.forEach(function(p, i){ var nm = p.n.name.length > 22 ? p.n.name.slice(0, 21) + '...' : p.n.name; var right = p.x >= cx; out += '<g class=\"c\" data-i=\"' + i + '\"><title>' + esc(p.n.label + ': ' + p.n.name) + '</title><circle cx=\"' + p.x.toFixed(1) + '\" cy=\"' + p.y.toFixed(1) + '\" r=\"6\" fill=\"var(' + COL[p.n.label] + ')\"/><text x=\"' + (p.x + (right ? 9 : -9)).toFixed(1) + '\" y=\"' + (p.y + 3).toFixed(1) + '\" text-anchor=\"' + (right ? 'start' : 'end') + '\">' + esc(nm) + '</text></g>'; });\n    return out + '</svg>';\n  }\n  rail.addEventListener('click', function(e){\n    var b = e.target.closest('[data-ask]'); if (b) { openTab('ask'); ask(b.getAttribute('data-ask')); return; }\n    var g = e.target.closest('g.c'); if (g && ctx) { var x = ctx.concepts[Number(g.getAttribute('data-i'))]; if (x) { openTab('ask'); ask('How does this paper use or relate to ' + x.name + '?'); } }\n  });\n  if ('requestIdleCallback' in window) requestIdleCallback(function(){ loadContext(); }, {timeout: 4000}); else setTimeout(loadContext, 2500);\n\n  // ---- Ask this paper (ask.qwav.tech, paper pinned as source [1])\n  var form = $('ask-f'), qa = $('ask-q'), out = $('ask-out'), hist = [];\n  function md(s){\n    var lines = String(s).replace(/\\r/g, '').split('\\n'), o = [], list = null, para = [];\n    function inl(t){ return esc(t).replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>').replace(/(^|[^*\\w])\\*([^*\\n]+)\\*(?!\\w)/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\\[(\\d{1,2}(?:\\s*[,\u2013-]\\s*\\d{1,2})*)\\]/g, function(m, x){ return x.split(/\\s*,\\s*/).map(function(n){ return '<a class=\"c\" href=\"#\" data-src=\"' + parseInt(n, 10) + '\">' + n + '</a>'; }).join(''); }); }\n    function flush(){ if (para.length) { o.push('<p>' + inl(para.join(' ')) + '</p>'); para = []; } }\n    function endList(){ if (list) { o.push('</' + list + '>'); list = null; } }\n    lines.forEach(function(l){\n      var h = /^#{1,4}\\s+(.+)/.exec(l), ul = /^\\s*[-*]\\s+(.+)/.exec(l), ol = /^\\s*\\d+[.)]\\s+(.+)/.exec(l);\n      if (h) { flush(); endList(); o.push('<h4>' + inl(h[1]) + '</h4>'); }\n      else if (ul || ol) { flush(); var t = ul ? 'ul' : 'ol'; if (list !== t) { endList(); o.push('<' + t + '>'); list = t; } o.push('<li>' + inl((ul || ol)[1]) + '</li>'); }\n      else if (!l.trim()) { flush(); endList(); }\n      else { endList(); para.push(l.trim()); }\n    });\n    flush(); endList(); return o.join('');\n  }\n  function ask(text){\n    text = String(text || '').trim(); if (text.length < 3) return;\n    $('ask-sugg').hidden = true;\n    var turn = document.createElement('div'); turn.className = 'turn';\n    turn.innerHTML = '<p class=\"q\">' + esc(text) + '</p><div class=\"st\"><span class=\"q-spin\"></span><span>Reading the paper</span></div><div class=\"ans\"></div>';\n    out.insertBefore(turn, out.firstChild);\n    var st = turn.querySelector('.st span:last-child'), ans = turn.querySelector('.ans'), raw = '', sources = [], doneD = null;\n    qa.value = ''; $('ask-go').disabled = true;\n    if (innerWidth < 860) turn.scrollIntoView({behavior:'smooth', block:'start'}); else $('t-ask').scrollTop = 0;\n    fetch(D.ask + '/api/ask', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({query: text, paper: D.slug, history: hist.slice(-2)})}).then(function(r){\n      if (!r.ok || !r.body) return r.json().then(function(j){ throw new Error(j.error || ('HTTP ' + r.status)); });\n      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';\n      function pump(){ return rd.read().then(function(x){\n        if (x.done) return;\n        buf += dec.decode(x.value, {stream:true});\n        var parts = buf.split('\\n\\n'); buf = parts.pop();\n        parts.forEach(function(b){\n          var ev = (/^event: (.+)$/m.exec(b) || [])[1], dl = (/^data: (.+)$/m.exec(b) || [])[1]; if (!ev || !dl) return;\n          var d; try { d = JSON.parse(dl); } catch(e) { return; }\n          if (ev === 'status') st.textContent = d.stage === 'writing' ? 'Writing from ' + sources.length + ' sources' : d.stage === 'thinking' ? 'Reasoning over ' + sources.length + ' sources' : 'Reading the paper';\n          else if (ev === 'meta') sources = d.sources || [];\n          else if (ev === 'token') { raw += d.t; var vis = raw.split(/\\n?\\s*\\**FOLLOWUPS:?/i)[0]; ans.innerHTML = md(vis); ans.lastElementChild && ans.lastElementChild.classList.add('cur'); }\n          else if (ev === 'done') doneD = d;\n          else if (ev === 'error') { ans.insertAdjacentHTML('beforeend', '<p class=\"err\">' + esc(d.error) + '</p>'); }\n        });\n        return pump();\n      }); }\n      return pump();\n    }).catch(function(e){ ans.insertAdjacentHTML('beforeend', '<p class=\"err\">' + esc(e && e.message ? 'The answer could not be fetched (' + e.message + ').' : 'The answer could not be fetched.') + '</p>'); }).then(function(){\n      var body = raw.split(/\\n?\\s*\\**FOLLOWUPS:?/i)[0].trim();\n      ans.innerHTML = md(body) + (ans.querySelector('.err') ? ans.querySelector('.err').outerHTML : '');\n      turn.querySelector('.st').remove();\n      if (sources.length) ans.insertAdjacentHTML('beforeend', '<ol class=\"srcs\">' + sources.map(function(s){ var here = s.slug === D.slug; return '<li id=\"as-' + s.n + '\"><span class=\"n\">' + s.n + '</span><span>' + (here ? '<a href=\"#main\">' + esc(s.title) + '</a><span class=\"here\">this paper</span>' : '<a href=\"' + esc(s.url || ('/papers/' + s.slug)) + '\">' + esc(s.title) + '</a>') + '</span></li>'; }).join('') + '</ol>');\n      if (doneD && doneD.followups && doneD.followups.length) ans.insertAdjacentHTML('beforeend', '<div class=\"fu\">' + doneD.followups.map(function(f){ return '<button type=\"button\" data-ask=\"' + esc(f) + '\">' + esc(f) + '</button>'; }).join('') + '</div>');\n      if (doneD && doneD.id) { ans.insertAdjacentHTML('beforeend', '<div class=\"fb\">Useful? <button type=\"button\" data-h=\"1\">Yes</button><button type=\"button\" data-h=\"0\">No</button></div>'); var fb = ans.querySelector('.fb'); fb.addEventListener('click', function(e){ var b = e.target.closest('button'); if (!b) return; fetch(D.ask + '/api/feedback', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id: doneD.id, helpful: Number(b.getAttribute('data-h'))})}).then(function(r){ fb.textContent = r.ok ? 'Thanks, recorded.' : 'Could not record that.'; }, function(){ fb.textContent = 'Could not record that.'; }); }); }\n      if (body) hist.push({q: text, a: body.slice(0, 1500)});\n      $('ask-go').disabled = false; typeset(ans);\n    });\n  }\n  out.addEventListener('click', function(e){\n    var c = e.target.closest('a.c'); if (c) { e.preventDefault(); var li = c.closest('.ans').querySelector('#as-' + c.getAttribute('data-src')); if (li) { li.scrollIntoView({block:'nearest', behavior:'smooth'}); li.style.background = 'var(--amber-wash)'; setTimeout(function(){ li.style.background = ''; }, 1200); } }\n  });\n  form.addEventListener('submit', function(e){ e.preventDefault(); ask(qa.value); });\n  qa.addEventListener('keydown', function(e){ if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(qa.value); } });\n  $('ask-sugg').addEventListener('click', function(e){ var b = e.target.closest('button'); if (b) ask(b.textContent); });\n  [].forEach.call(document.querySelectorAll('[data-go=ask]'), function(b){ b.addEventListener('click', function(){ openTab('ask'); if (innerWidth < 860) rail.scrollIntoView({behavior:'smooth'}); setTimeout(function(){ qa.focus({preventScroll: innerWidth >= 860}); }, innerWidth < 860 ? 450 : 0); }); });\n\n  // ---- select a passage: ask about it, or copy it as a quote with its citation\n  var sp = $('selpop'), selText = '';\n  function citeLine(){ return D.authors.join(', ') + ' (' + String(D.date).slice(0, 4) + '). ' + D.title + '.' + (D.doi ? ' https://doi.org/' + D.doi : ' ' + D.url); }\n  document.addEventListener('mouseup', function(e){\n    if (sp.contains(e.target)) return;\n    setTimeout(function(){\n      var s = getSelection(), t = s && String(s).trim();\n      if (!t || t.length < 12 || t.length > 900 || !s.rangeCount || !doc.contains(s.getRangeAt(0).commonAncestorContainer)) { sp.hidden = true; return; }\n      selText = t.replace(/\\s+/g, ' ');\n      var r = s.getRangeAt(0).getBoundingClientRect();\n      sp.hidden = false;\n      sp.style.left = Math.max(8, Math.min(scrollX + r.left + r.width / 2 - sp.offsetWidth / 2, scrollX + innerWidth - sp.offsetWidth - 8)) + 'px';\n      sp.style.top = (scrollY + r.top - sp.offsetHeight - 10) + 'px';\n    }, 10);\n  });\n  document.addEventListener('scroll', function(){ if (!sp.hidden && !getSelection().toString()) sp.hidden = true; }, {passive:true});\n  sp.addEventListener('click', function(e){\n    var b = e.target.closest('button'); if (!b) return;\n    if (b.getAttribute('data-sel') === 'ask') { openTab('ask'); ask('Explain this passage and how it fits the paper: \u201c' + selText.slice(0, 600) + '\u201d'); if (innerWidth < 860) rail.scrollIntoView({behavior:'smooth'}); }\n    else qCopy('\u201c' + selText + '\u201d \u2014 ' + citeLine(), 'Quote copied with its citation');\n    sp.hidden = true; getSelection().removeAllRanges();\n  });\n\n  // ---- cite and share\n  var dlg = $('cite-d'), fmt = 'apa';\n  function citeText(f){\n    var y = String(D.date).slice(0, 4) || 'n.d.', a = D.authors;\n    var apaA = a.map(function(n){ var p = n.trim().split(/\\s+/); var last = p.pop(); return last + ', ' + p.map(function(x){ return x.charAt(0) + '.'; }).join(' '); }).join(', ');\n    if (f === 'bibtex') { var key = (a[0] || 'qnfo').split(/\\s+/).pop().toLowerCase().replace(/[^a-z]/g, '') + y + (D.title.toLowerCase().match(/[a-z]{4,}/) || ['paper'])[0]; return '@misc{' + key + ',\\n  title     = {' + D.title + '},\\n  author    = {' + a.map(function(n){ var p = n.trim().split(/\\s+/); var last = p.pop(); return last + ', ' + p.join(' '); }).join(' and ') + '},\\n  year      = {' + y + '},\\n  version   = {' + D.version + '},\\n  publisher = {QNFO},\\n' + (D.doi ? '  doi       = {' + D.doi + '},\\n' : '') + '  url       = {' + (D.doi ? 'https://doi.org/' + D.doi : D.url) + '}\\n}'; }\n    if (f === 'plain') return citeLine();\n    return apaA + ' (' + y + '). ' + D.title + ' (Version ' + D.version + '). QNFO.' + (D.doi ? ' https://doi.org/' + D.doi : ' ' + D.url);\n  }\n  function paintCite(){ $('cite-t').textContent = citeText(fmt); [].forEach.call(dlg.querySelectorAll('[data-fmt]'), function(b){ b.classList.toggle('on', b.getAttribute('data-fmt') === fmt); }); }\n  $('b-cite').addEventListener('click', function(){ paintCite(); if (dlg.showModal) dlg.showModal(); else qCopy(citeText('apa'), 'Citation copied'); });\n  dlg.addEventListener('click', function(e){ var b = e.target.closest('[data-fmt]'); if (b) { fmt = b.getAttribute('data-fmt'); paintCite(); } if (e.target === dlg) dlg.close(); });\n  $('cite-copy').addEventListener('click', function(){ qCopy(citeText(fmt), 'Citation copied'); });\n  $('b-share').addEventListener('click', function(){ if (navigator.share) navigator.share({title: D.title, url: D.url}).catch(function(){}); else qCopy(D.url, 'Link copied'); });\n  if (location.hash) { var t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) setTimeout(function(){ t.scrollIntoView(); }, 300); }\n})();\n";
// ---- LIVING-PAPERS-1:END ----
// ---- REACH-LAYER-1:BEGIN (3.8.6, 2026-10-02, owner directive "FIX AUTOMATICALLY"; pillar reach) ----
// REACH-IDEATION-1 found 12 reach gaps on gateway pages (no share image on the qnfo.org home, no contact or iPatent link on
// paper pages, ...). The code loop may not edit this control-plane worker, and a per-template fix misses the next template.
// So the gateway guarantees the basics on every HTML page it serves, present and future, at one point in the response path:
//   head  og:image (+ size, twitter:card summary_large_image) when the page has none; a canonical (https, no query) when
//         none; a WebPage JSON-LD crediting the author (ORCID) and QNFO when the page has no JSON-LD.
//   body  one quiet strip before </body> with only what the page lacks: the author credit, "Work with me", the flagship
//         tool (iPatent) and the existing double opt-in subscribe box (subscribeBlock -> /api/subscribe). Every link is UTM-tagged with the host and campaign reach-layer.
// A page that already has an element is left as it is; the layer never edits existing markup. Non-200, non-HTML and
// non-owned hosts pass through untouched. reach-layer.test.mjs locks the behaviour (deploy-gate).
var RL_HOSTS = { "qnfo.org": 1, "www.qnfo.org": 1, "papers.qnfo.org": 1 };
// Pages with their own tested rules (work-with-me.test.mjs: "no form: the page stores nothing", and no visible "patent",
// so nothing reads as a patent claim). There the strip links to the subscribe box instead of embedding one, marks the
// strip data-reach-policy="no-form" (REACH-IDEATION's subscribe-box check accepts it), and names iPatent neutrally.
var RL_PLAIN = { "/work-with-me": 1 };
var RL_AUTHOR = { name: "Rowan Brad Quni-Gudzinas", orcid: "0009-0002-4317-5604" };
var RL_OG_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAJ2BLADASIAAhEBAxEB/8QAHQABAAICAwEBAAAAAAAAAAAAAAcIBQYDBAkCAf/EAGUQAAEDAwIDBAUECgsMBwUHBQEAAgMEBREGBxIhMQgTQVEUImFxgRUyN5EWNnR1hKGxsrO0FxgjM0JSYnJzgpI1VVZmlKKkpcHS0+MkNDhDk8LRJSZT4fBEY4OFlaPD8UZUZHb/xAAaAQEBAQEBAQEAAAAAAAAAAAAAAQIDBAYF/8QAMBEBAQACAQMDAwMDBAIDAAAAAAECEQMSITEyQXEEM1ETImEFgfAVobHRFEIjweH/2gAMAwEAAhEDEQA/AIXREX0LxLi7A/RJYfwj9YlUhKPdgfoksP4R+sSqQl8/zfcy+a92HpgiIuTQiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiDz4REX0r89cXYH6JLD+EfrEqkJR7sD9Elh/CP1iVSEvn+b7mXzXuw9MERFyaEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQefCIi+lfnri7A/RJYfwj9YlUhKPdgfoksP4R+sSqQl8/zfcy+a92HpgiIuTQiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiDz4REX0r89cXYH6JLD+EfrEqkJR7sD9Elh/CP1iVSEvn+b7mXzXuw9MERFyaEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQefCIi+lfnri7A/RJYfwj9YlUhKPdgfoksP4R+sSqQl8/zfcy+a92HpgiIuTQiIgIiICIte13rW36C07UXm4Hi4fUhhBw6eUg8LB9RJPgASrjjcrqJbruzdXWU1vp31NZUQ00DBl0szwxrfeTyC06v3r29t0hjm1PSPIOMwMkmH1saQqo6019fdd3F9Zd6x7o+IuipWOIhgHk1ufx9StdX6eH9Pmv3157z/AIXF/Z+22/wj/wBCqP8Ahp+z9tt/hH/oVR/w1TpFv/T+P83/AD+yfr5Li/s/bbf4R/6FUf8ADT9n7bb/AAj/ANCqP+GqdIn+n8f5v+f2P18lxf2fttv8I/8AQqj/AIafs/bbf4R/6FUf8NU6RP8AT+P83/P7H6+S4zd/Nt3ODRqQZPnR1AH6NbJYtdaY1M4Ms99oKyU9ImSgSf2Dh34lRVfUcj4ZGyRvcx7SHNc04IPmCpl/T8Pa0nPfd6Coq97Hb3VVTWwaW1RVOnMx4KOulcS8vPSN5PXPQHrnkc55WEX53LxZceXTk9GOUym4IiLk0IiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiI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PCWbERFFEREBERAX4QHAggEHkQfFfqIOOGCKmjEUETIo29GMaGgfALkREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAXDBR01KXmCnhhLzlxjYG8R9uOq5kQEREBERAREQEREBERAXFFSwQySSRQRRvkOXua0AuPtPiuVEBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREHnwiIvpX564uwP0SWH8I/WJVISj3YH6JLD+EfrEqkJfP833Mvmvdh6YIiLk0IiICIiAqdb/fS3fvwf8AV4lcVU63++lu/fg/6vEvd/T/ALl+P+nHn9KPURF+u8rats9cTbf6tpbw1rpKYgw1UTTzkidjOPaCA4e0BWL3h0XFuromkuun5I6urpQamjcx3KojcBxMB8zgEZ8W45ZVSlum327Oodu5DHQSMqbfI7ikop8lhPiWnq0+0fEFebn4bllOTDzHTDOSdN8NPnp5qWZ8FRFJDNG4tfHI0tc0jqCD0K41YGq3X2m19+6av0xPSVnCAZwwuJx0HeRkPOPaMLY9D7dbO6phnuOn6J11FK/D4ppZgWOIyAWPIyD4E5B58+RUv1XTN542E49+KhbaTbOt3B1DD3kEjbNTPD6yoIIaQOfdtPi53T2A5U19oDcum01YJdL22Vpulwi7uVrP/s0BGDnyLhyA8iT5Z1LWvaBnskMmnNIaedYDTEwudVQtY+D2NiHqtPjk59ygysrKm4VUtXWTy1FRM4vkllcXOe4+JJ6rM4suXOZ8naTxF6pjNYuFERexyFcXYH6JLD+EfrEqp0ri7A/RJYfwj9YlXh/qH258/wDbtwepISIi/IeoREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREHnwiIvpX564uwP0SWH8I/WJVISj3YH6JLD+EfrEqkJfP8AN9zL5r3YemCIi5NCIiAiIgKofaJon0u6lxle0gVUMEzSfECJrMj4sP1K3ihntH7ez6issGpLbC6WstbHNnjb1fT9SR7WnJ9xd5L1fR8kw5O/u5cuO8VXkRF+28giIgLZNBa8um3t9bdbYWva4d3PTvPqTx5zg+R8j4fWDraKZYzKapLrvFs7fuXtZuRTR/LTbXFUtaMw3iJjTGfJsjvVPj0OfYFBe91vsVt1w6HTkdFHbzSxPaKRwdGXHOSCDhaAi4cX0048t43t+G8uTqmrBERehgVztkKJ9BtXp+KRpaXQvmwfJ8r3g/U4Kqu32iK7X2pqa0UjXCIuD6qYDlBCD6zvf4AeJIV3aKjgt9HBR00Yjgp42xRsHRrWjAH1Bfnf1Dkmpg78GPu5kRF+W9IiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiIPPhERfSvz1xdgfoksP4R+sSqQlHuwP0SWH8I/WJVIS+f5vuZfNe7D0wREXJoREQEREBfhAIwRkFfqIIX3B7N1s1BUS3HTNRFaKuTm6lez/oz3eYxzZ8AR7Aopq+zxuJTSuZFZ4KpoOA+KsiAd7RxOafxK3yL1cf1nJhNeXLLixqnX7AO5P+Dn+m0/8AxE/YB3J/wc/02n/4iuKi6f6hyfif5/dP0MVOv2Adyf8ABz/Taf8A4ifsA7k/4Of6bT/8RXFRP9Q5PxP8/ufoYqdfsA7k/wCDn+m0/wDxE/YB3J/wc/02n/4iuKif6hyfif5/c/QxU6GwG5BOPscA9praf/iLYtN9mLVFwna6+VdHaaYH1mtf30x9wb6vx4vgVaNFL9fyWexOHFruitB2PQNrFBZqbgLsGaofgyzuHi93xOB0GTgLYkRePLK5XddZNeBERRRERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQefCIi+lfnri7A/RJYfwj9YlUhKPdgfoksP4R+sSqQl8/wA33Mvmvdh6YIiLk0IiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg8+ERF9K/PXF2B+iSw/hH6xKpCUe7A/RJYfwj9YlUhL5/m+5l817sPTBERcmhERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREHnwiIvpX564uwP0SWH8I/WJVISj3YH6JLD+EfrEqkJfP833Mvmvdh6YIiLk0IiICIiDT91Llq21aUdUaKo/TLt37GiLuxJ+5nPEcEj2Kul/7Qe7mlri623qGioaxrQ8wy0TQ7hPQ9VbtVn7YGl+GSx6oiZ84Ot87seIy+P/APk+oLeOvFZrTGdqLciR7WNqLYXOOB/0RvX61OG0Ood1rvqGrh13aPQrc2kc+F/o7Y8zcbABkE/wS76lTBX62i1P9l+3Niurn8c5phDOc8+9j9RxPvLc/FXOaiRuCr7v1vtqDQmr4LFpuWkaIqVstUZoRIe8cSQ32Ybwn+srAPe2NjnvcGtaMkk4AC899f6kdq/Wt5vpcS2sqnviz4Rg4YPg0NHwUwm6tqcNoe0TqjU2vrbZNRzUTqKuL4QYoAwtl4SWc8+JHD/WVml5v2y4VFouVJcaV/BUUkzJ4neT2uDgfrC9EbFd6fUFkoLvSnMFdTx1EfPoHtDgPxpnNErQN475uTZ5rUNAWv05kjZTVnuBJwEFvB1Ix1d9ShqDfLee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iAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiDz4REX0r89cXYH6JLD+EfrEqkJR7sD9Elh/CP1iVSEvn+b7mXzXuw9MERFyaEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQefCIi+lfnri7A/RJYfwj9YlUhKPdgfoksP4R+sSqQl8/wA33Mvmvdh6YIiLk0IiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg8+ERF9K/PXF2B+iSw/hH6xKpCUe7A/RJYfwj9YlUhL5/m+5l817sPTBERcmhERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREHnwiIvpX564uwP0SWH8I/WJVISj3YH6JLD+EfrEqkJfP833Mvmvdh6YIiLk0IiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg8+ERF9K/PXF2B+iSw/hH6xKpCUe7A/RJYfwj9YlUhL5/m+5l817sPTBERcmhERAREQFp+5dXfLPp6qvVnu4ohRQl74DTMkExyAPWd83C3Balux9HV9+5/8AzBXHylYbS9LrvUmnqC8fZvBTemRCXuvkiN/BnwzxDP1LI2dmsbZrCCgut2dd7ZLRySunZbmwMjkDgGtLmk8yMnGVgtAu3AGjLR8mRaWNF6M3uTUyTiTh/lcLcZ9yz+08lbJpWR1wcXVPp1SH8yRnvD0zzx5exaqRuaKHdfWh9BuXpuCy1dXQy3WSV1RI2okfzJ9ZzWuJAIBcQAMA45Lj3L0pQ7dUlBqzTslZT18Faxs7n1L5PSGkEnj4ic5xjyIJU6TaZkWkbu6xqdH6OfV293DWVcraaCTke7LgXF2D5Bp+JCwEFg24dZmxVOqbY+8Oi9e6fK47/viMl4PH/G8OiSe67SsijrbC9u3G0NNRX5z6mamm9Fnkjlcx0wbwua7iYQR4DkefD7Vq+2emfsqm1FQ3asrpbNRV7446QVMg7x2SPXcDxENaBgZ6uJPgnT+TabUUP6qpZNmNFXVtkq3/APtSvayjzzdSNcwl3M9ThhwfaFsVo2mtlstkc0NTXR6g7sONzNTIXibGclueEtz/AASDkdfNNQ235FDmy1gpNTaduddevS6is9OlpXO9MmYAzgjPCA14A5k8+vtXPtrb4bFuHfrDcH1UtbS/u9BNLUyODqd3hwl3CSA5vPGc8XklxNpcRRzDpy36h3NuU7BVCktccff8NXMGzVjyHDkHYAa0DIGBl3NSMpYCKIN5bc+23iwXCzTVFLc6+4MjdJ38jmOI4Q3MZdw4zjkAMrMas2ttUdirLpQz3GK+0kD6hlxNXIZZZGji9bJxzI8AMeGFdQ2kdFGlt3MqnbPS6qna2S400Zp3Zxh83GGNcR/Wa4j3rF6XodCXTT9NX6q1Dba691sff1E1RdAyWFzhkMaA8cHCMDAA5j4J0m0vooy2r1A6/Rah0pX15ukFuldDBWCbLp6Z3E0eu05JwPnA59Yc+SwGmtNuuW5Gp9Otrq+GxUwYZIGVUhc8YHDHxlxcGkuJPPJ4QOidJtNiLUdI7d0Wi73cqy1yvZQ1scYFK5znd29pOTxEknOR15+1bRWVUdDRz1cue7gjdI7Hk0ZP5FKOZFEu31ni3Qpq3VGqxJWiWpfDSUTpXCGnjbjo0EAnJxk+Weq2bSuiqrSWq7g6hqJvseqKZroaV87niGbi9YNBPTAzn248FbNG26Iok0wxu7WqL5XXt80tmtkwpqKgEhbETzy94aRxHDQeefnY6AL7uTjtZr6xU1rlnbYr6/0eWhklL2Qy8TW8bOLJb89pI9/sw6fY2lhFEG8duktl807cLNLPT3O4XBrHPM8jo3uHAG5ZxcIGcZAAys/V7P2t9dbLpS1taLrR1cVRNWVEz5XVIa7LmkE4GfYBjyTUNpARQrU6efBvAzTtprq6ht09B3lQG1Uj3hnMu4XOcSC7AbnwBOOa2ym2+tGhLzUartj5oaWnoJjU0rpHSGUgcXFxOJPQHr+JNG2/IoW0XWaX1lR1F/13e7bLX1M7hDR1Ve2JtJEDhrWx8QxzzzIz0PmTlNBakgtu4Nw0jb7q26WSWH0mge2oE/cHALow/JyOZ5E8sDzKXE2lVFFFvcd0twL7SXOWc2Gwu7iOijlLGTS8Tm8by3Bd8x5A93tzm49uvsf1habppl0lDbsyNuNI2od3bxwHgIaSc+t4ewFNG2Qums6ig3Es+lW0sT4LhTSTunLjxMLWyHAHT+APrW2KGdTaTtEm9dioXQ1HcV1LPPO30qUFz8THIdxZaMgcmkD2KVrJYbfp2lfS26OWOJ8hkIknklPEQB1e4noByzhLJ2IyCIogprVtvaDNS6kvkd5vRke6epMsz3tJJ5DgJ4cDl1znPuUk2WpfRRps7qGSvqdQ2UXCe40VtqGmiqJy4yGF/FhpLufLhHXzKwuo7E6j3gs1os9bXUENwpJJagtqZHnn3vGW8TjwktbgY6HBCvT30bTKihvW+mqLbS76f1Dp19VSumr2U1XG6ofI2oY7meLiJPRp/F5LY957nXWywUD4jVMtkldGy5SUpIkFP4gEcwD0z7h4p0/g2kFFFLNL6K1LQRzaButNb7uxzJIpIKuRknCHDiEjCeLm3PUdceGVzb42ItsQ1JRuqW1VFLEKhrKiRrZIMkFvCHYHNw5jnjKdPfRtKCKOtYTA6Atll0o6Vkt84I6LMz3PbGWmV7uJxLvmgjr/AAl1NO6lor5svJW3jvJ/k6B0NQ0TPje+SLHAOJpDsu/c/HnlOk2lBFF9fLLtRtWa2IzPvNRFEySSeV0mJ3jmcOJA4efIDB4RldSy2fbyqsNPLfNSW2qvNRCJKitkuzROyVwyeE8fq4JwBjw5p0m0too12qvsms9O3axXmpdcXW+Y0rqpkpBqITnhdxtOc+qfWB5jHNa7oTTRv+rNX2aqra75CoKzg9FbVSAyHikDGl+eLhADiRnmeHPROk2mxFqmitA0uh627m3zvNDXPifDTuJcYC0EO9Ynnkn8XitrWaCLVNydNfZFpisMDqhlwpYZJaR8Mz2EPABxhpAdnhxzzjK1rRt/orTs/Jf6FsvpnclkjXzPlL6sfubfnE44ncJwOXrdFddjaUF1rlRfKNDLSek1NL3ox31M/gkZzz6rvBRvs/WVbKTUGkL9O+WrtlQ4Pc+U5dE8EEh2c4yCc/ygsntTYqNlFU6ihFSBXTzCkbLUyyCOl4wGDDnEZPBxZPPn1wrZo26+0dxuNVX6ro665VlfHQXE08DqqUvc1jS8dT7gpGUKaA0xDqnUetaa5TVBtkd1kLqaGV0YneXv+eWkEhoHIZ6u59Astoul+wvdS56ToZpzZ6iiFXDBK8v7p/q9Cf634s9Fcp3SVKqLRNwbVp+e7W+46qvjaa1QRPYLe+ZzBUSkj1sNOSAPADy8OR0u4ah03pnUmn6vRNwljgqKttNXULe+EMkbiBxcL+WRk4x7PapMdrtJW4eqptF6WqLzT08dTJE+NojkJAPE4Dw96ztBUmsoKapc0NM0TZCB0GQCo538s9HPouour2SGrgdFHG4TPDQ0yDOWA8J69SMrZdI6Mstop6G5UcFSypdTMy59ZNI31mjPqueW/iTU0e7aURR9ru16ZdqOnuer74xlvbSiKC2STOa18nE4mXhacu5EDp4DPgpJsSCihaPUFh0/rzTrNG3Cb5PuUxpa2g/de5BJaGPa1/Q5d4eXtKzm+1ugi0pNfInVMVwhdFCyWOokYAwv5jhDuE9TzIyr09zaTUUW3nbShumjJbzcamumv7aE1Tav0h4EcgZxBjWZ4QwdOmceOea2fa291WodBWi4Vsjpal0bo5Hu5l5Y9zMk+JIaCSpZ22bbWule7rBYrRWXSpOIaSF0zufXAzge09Piu6tM16Ply5WTSTPWjrp/S60eHo0JDiD7HP4B9aQYbaXX161HcLrZtShrLlTBtRGzuwwiM4yMDyy0+frKQrnT1dVQyw0Nb6DUuA4KjuhJwcxn1TyPLI+Kivchp0RuRYNaRjgpKo+h1xHTpjJ/qHI/o1LoIIyDkFXL8wiL9vb3qzUmpb7R1uomGmsdaIHMFDGPSW8bwckc2/M8M9VKKirZ37b9wfvn/wDyTreq/WumrXVyUddfrbTVMRAfFLUNa5uRnmCfIhMp37EZtFqWt6e36l0xTyv1Cy3Wkzxzz1Uc3C2eEZywOBHzsjHXoORUd6rrdA2ywzV+i7pJQXil4XwS0rp8S4Iy15PquBGev/ySY7LU4otRul9utftg+92mM/KVRbWVDGxtyWucwF3CPEgE49wWj6RodttWWGnjfWtjv8sLRNPUVb2VXpGObmlzvW9bnyyPYkxNpmRR3rBmptL7RvhgrJqq7U0LGT1cT3OfwcXrPBPrZA8eoGT4LC2yx7c6tsnBpuvjor4+L9wmfVyR1TJsci4F2Xc+uAR1wnT7m0m6gius1mq47HPBT3JzMU8s7csa7PiMHwz4FclmjuEVqpGXaaGavbE0VEkIwxz8cyB5fAe4LV9b2Fsm3s77jLPNcLXbZHsqI6iRhMzYubzwkcXNufWyulpiuuzNloay3GSe5tt8j4ifXeXguwRnqfIeKa7G0hLrXKqdQ26qqmtDnQQvkDT0JDScfiUP6Kptt9VWOnZcKwN1BJGBUzVVW+OpM/i5jnO58+YxnwyFusuk5BtyLTqGqluNTRQSyGdlRK0veA/hJcCHEAHGDy5JZo2yG3uqZtZ6Wpb1UU8dPJM6RpjjJIHC8t8fctkUS7M6Mstx0XbbrUwVLqsTSODm1kzG5bIceo14b4Dw5+Kar1JS3/cz7FrvdorZYLbAJqpr6kQNrJSGkML8jkONvq5/gu+C49+yb7JaRQpq+7aa0G63X7RF3oC+OpbFWW6krmysqISCSSziOCMY4gP4Sz+7Go62abT2mLTVSUpv87Wy1MRw9sJLRgeWeLJ/m48U6V22fcGjml0vcK2nuVwoJqClnqY3Uk3d8bmxkgO5cxkdFw7W3CrumgbRWV1RLU1Msby+WV3E5x7xw5n3ALXtV7b2vTeirvU6edVUdXFRSmWQ1D3ipj4D3jZGklpy3OCAMHBCzWz30bWT+jf+kensnu3JEUS6ZY3dnVF8rb0+aWzWyYU1FQNkc2Jx55e8NxxHDQef8bHQBSRdpaUXxPuNk3lt9kZe7rV0FRb31T4aqoMjeMmQchyGBwjCy9t2/fpnWtHcLBJLTWWWCRtZRd+4xiTHqODST1z8Me1Yu6/9oCz/AHnd+WZWJUmotJ3GtdmrZ7VV6jvgoLRSulM1I6Z0YrHkN4RyIJ4cE8gTz8Oa0DUuodKaVltd30LcJIJmVbGVVJF3whqIDnOWu9UnkOnnnwSY7XaYtSw3mex1cen6inpro5o7iWduWNORnIwfDOOR54XZtjK2O20rLlLFLWtiaJ3xDDHSY9YgeWcrV917VS1mjrhcJO/bU0FNJJTyRTyR8DiBzIa4B3Qdcr90ZboNRba2aluffTxzUsbnkTPY9xByPWaQ7qPNTXYbiihPavS0esbXeYL5VVtVbKa4SRw0vpMjQXcLclxBy7ADcAnAy7rlc2kLPVv1hqHQUtzrnaeoiKgRiZwkLXAYi4wchh48kDGeAeZzelNpmRRPabezQO7tDp+0TVDbRdqF8ppJJXPZHI0POW5Of+76n+MVLClmljE6ohvlRZKiPTlTTUtzPD3UtQ3LBzGfA88Z8Cu/QNqmUNO2tfHJViJomfGMNc/A4iB4DOVpu8Frpp9G190d37KyhhLqeSKeSPgJc3OQ1wDviCuCevvFNsnT1tpdLJchaYHNe3Ln82t43DxyGlx94V12EgIoc0zbNt9W2CGOkrWQX+SEB081XIyrFRw83Aud63rc+WQpS07Q1ltsVBRXGqNXWQQNjmnLi7vHAc3ZPM/FSzRKyKLo3mz0l+t8lBWiUwyYJ7qV0bgRzBDmkHqo22WbT2+O/wANzkmN2tFQ+nqZpaiRzTDnIdwlxaObHcwOgCSdtm0rooc221LdW7g1UV3fI2HUtL8pUUb3EhjQ5xY0A9PUDunkFsGndO2+47g326QiqFLbpmQxj0uUsfVEF8rsF2OXE1vD832K3HRtIaKJNMMbu1qi+V17fNLZrZMKaioBIWxE88veGkcRw0Hnn52OgC+7k47Wa+sVNa5Z22K+v9HloZJS9kMvE1vGziyW/PaSPf7MOn2NpYRRFvbQG2VNmu1qfPDc6y4RxOd6RJwPw3DQWcXCByGcAZWbuOztuq5KK4R19ab1T1Ec8lfPM+QzYcC4FucNB544cYTUNstDrOol3In0kaWIQRUQqhPxHjJy3ljpjmvvceknfpa4XCmudxoJ7fSzVEZpJu7D3BhID+XMZCj6DRdlk3pq7Q6Cp9DbbBMGCsmDuLLefHx8WOZ5Zwt+1VaKOx7cX6hoWSMgZb6kgSSvkOSxxPrPJP41dTcRy7Z11Vc9CWesraiSoqJYSXyyO4nOPEepWzqI9AbdW3VugbXUagkq6hzonNpo2VD42UzA4gFrQcFxxxEkHr5BZfZG6VtVpyvttdUPqX2qukpI5HnJMYAwMnyOfhgeClnklSKiIstCIiAiIgIiICIiAiIgIiICIiAiIgIiIPPhERfSvz1xdgfoksP4R+sSqQlHuwP0SWH8I/WJVIS+f5vuZfNe7D0wREXJoREQEREBaHvHfbZQaLuVtqqyKKsrKc+jwuPrSYcM4W+IrLqoi3QO6Gj7Roy0UFde4YamCmaySMxyEtd5cm4Wctu51s1Bq+gs1jqqeuppqeaWeUMe10bm44QM465K3ZE3BDmvtV2Rm6ml5nXKAR2x80dY7JxA7phy7G/uoLXPo6CgirYn1VRJDVxRA83wniw8exS2ivV4NI03Lt0e5O3on03My4PpJ2zxiLJMha0tc1vtw7OPHC7dt1vt/PY4q+tfZqSobGO/pJImCaOQD1md3jiJByOQUgLgfQ0sk4nfTQOmb0kLAXD49U37GmtaXvgptLzX69UFHYaWSQysY2PgLICQIzIP4xz+MLSdl9UWaGtv1FJcYG1NwusklLGSczNPQhTEibNNA3s0xW6n0WW26J01VRTtqmxsGXPaA5rg324dnHsXJbN39P3KywTwzmW7SsDBbGMcZnT4+YBjpn+F0wtl1Wb03T9Y7TzWOuoaDTtfw4J4hkety6Z6rXYtWXSop5TR6Eu0F7fHwl00cTIQ/wAzKXes0HyGT5JO8Rhuz13n2IXPvcd58rS8ePPu4sr83fjn0xeLFr2hiL5KCX0WrYDjvIXZwCfDq8Z83DyWx6D0nV6E0Y+h446u4nvKmTh+Y+Yjk0dCRyaM8vgsS+a+7g/JFtuOnq200kEzKq6uqWtbHM5mC2KMcRLml+CScYAV332ezYdv7PPaNNQurh/7Rr3urq0kYJmlPEQfcMN/qrZERYqop31kqIptJyUkXfVLLmHRR5xxvBbwjPtOFkdWbsadGma2KiqnzXSpifTRUHduE7ZXDh4XNIyME8/dyyurufSX++XuyC3abr6iG0V7Kp87XxBszRwkhuXZzyI5gKQLbw18ENwqLYaKre3myZrDLHzxguaT+IrfbURHVr24uB2Vm05LG2O51LTVd27lwycYe1hPgcNDT5Elcuh9S6Pp9LUlFfxarZdbdEKaqp66NkcocwYzhwy7IAPLPVSeuCehpal7Xz00Erm/Nc9gcR7sqdX5XTVtG3uO4U91vYtdJbLKxx9DnEPdyTwsBLpXfySenIcsrSNFay0/BufqqtlutOynr3QtpZCTiY9MBTOibNC4K+kZX0NRSSfMnidE73OBB/KudFlUTbXXyl0DR1mkdVVEVrrKWofLBJUO4IqiJ2PWY88jzB+vzytw0zq6bVd8uBt0MT9P0rGxx1vC4Gpnz63B4FjRyzjr4rZKilp6tgZUQRTNHPEjA4fjX2xjY2BjGta1owGtGAFq3aaRJoqpg2v1VfrJqCRtDRXCo9Kt9ZJ6sMgyct4ugIBb18j7M/V+mj3O3D0/HZHCrtVhl9Jq61oJhLy5ru7Dujj6jRy/jHyKleaCKojMc0TJWHq17QQfgV+xRRwsEcTGxsHRrRgD4J1e5pEe8eo7SzUulqV1dCJ7bdI5qtmTmFhLHcTvZjmpTtN4oL7Qsr7ZVR1VK8kNlj6Eg4P413EUt7CFn6106zeo3d12phQNtncGoyeESZ+b06qW7jSxX2yVVI2QGGupnxB/UFr2kZ+orvIlppEG2lXY9K2yo0zrCK22650M7y11c1rWzxOOQ9j3DDhni8fJbXpa9Ul/1LVPsVroBY6OLg+UmQcLp5yebYzyy0DqfP2FbfUUlPVtDaiCKZo5gSMDgPrX2xjY2BjGta1owGtGAFbdmkTWOaPbHcXUDL2fRLTfpBU0ta4HuQ8Oc7uy7o0+u7r5DzW2w66bfNU0lo006muNJG10txrWkujgbj1GscDguJ9+B8VtckUczDHKxsjD1a4ZB+C/IKeGlj7uCGOJg/gsaGj6gluzSMtbTxWbeHSd5uErKW3+izQGpldwxtfwyci48h89vXzW56W1ZDqx9xlooD6DSVHo8NWH5ZVEDLnN5dATjPPKzU9PDVRmOeKOVh6te0OH1FfUcbImBkbGsY0YDWjAClvYdO+09VV2S4U9C/u6uWmljhfnHDIWkNOfDnhRftHqrTWk9Jutl3qYbTdqeeQVkVQ0slkdxEtOMZd6pA+Cl5cMtHTTTMmlp4ZJY/mPcwFzfcfBJe2jSIdstTW/9kbVvpchoprnUx+iwTtLZJOb+WPA4IOD0yvnUOsLAzeyy3F10pxSUVFLT1EuTwxSfuo4T7ckfWpmRXq7ppEW+9/tZpbNbxWxGrhuMNTJFnm2Lhd6x9nMLatRbi2y2UlmuLO7rbFcppIaira1zmxNAIzjHTiGDnwBW5om4ukGblUGiK2npajRklIdSvqI/RY7O4Zec8y5rOTcdc8jlTBXWo3rTk1ruJa59VSmCdwHLic3BI+PMLuQ0NLTSOkhpoInu+c5jACfeQudLTSG9lYrlcq/u7pGQzS0MtvhDuf7tJIS8/1WtDfcV0IbLWUm51w0THH/AOyLlXw3eT+KIWcUhbjyL+Fv9QKc0Tq7ppp+6+mKnVmiqyhoWB9XG5s8LD/Dc082j2kZA9qw+mNX6H+xqldd3Wi319LC2KrpqqJrJmStGHeoRxHmM8gVJC4JaGlnlbLLTQSSN6PcwEj4qb7aXTWNI3tslluF/rbbSWS2GRz6ciLu5HU7ekkg8CeZA8vetJ2u1bYoNaavElzgabrc2ehZJ/6Rl8mOH+0361MiK7NNf1HrKk03drLbJqaonnvE5gi7rGGYLQXOyeg4h08itgWvDR0E2sDqeuq5auaGLuaKBzQI6RpHrEebjz5nwOPALYVLoFB2m7NWUe5FZogR4tFPchfBjoGNbljfaOJ0Q/qKcUSXRYhbdKmuen9fwVtnZ6+p6J1ref8A7w8LOL3gGMj3FSuz5O0pYImSyspqC3wMj7x/RrGgAErJIluzSINnNRWl+ptVUra6EzXG5yTUjM85mAvdxD2Y5rrjWWnxva66G60/oXyb6P32Tw95xfN96mdFerumkR6odBYd56C96jbizy0ndUtTI0uip5QDyJ6A5yf6wPhkdDd3WdnvL9PC21TaulpbkyWoq4wTDGR0bxdCcZOBnAHtCmiWKOeN0crGyMcMFrhkH4L8gp4aaIRQRRxRt6MY0NA+ASZGkf7tTw6l2qrq20SCspyY5mvi5hzGyAOI92D9RXfsGvrbXVGn7JaXR3KSppO8qZIJQRRNbGPn4B5k+rjkQVunVcVPR01Jxej08MPEcu7tgbn34U320unMohrJ6XTO91XdtT4ioauja23VkzcxRPDWAjPRp9V/9r+UpeXHNBFURmKaJksburXtBB+BSXRYhjcnWlmuerdGVVJVCW30Fw7yetAPcg8cZIDv4RAGTjOMhZTfDU9mrNBei09whknre5qadjScyx8fzh7ORUqRQxwRtihjZHG0YaxgwAPYAvtXq8JppNdrGwO27lrBdac08lK6ibJk4M3dH1PesbsRerfU6GorVDVxvrqUSvmgHzow6Z5BPvBCkhFN9tLpwVtbT26kmrKuVsNPAwySSO6NaBkkqLLDDpLdXV19rLmYLi6EtgoKYveCynj5Ol5EcnPf4qWkSXQiTczbfQ1j0fW1MNJTWusIxSzOleeKUAuDBkkZcGuHNZLbPcyzVmi6YXS5wwVlup+GqEhOQxrgxrz7+JnxKklFertqmkLbQ6ns0OstXskuELXXS5A0QJP7uDJKRw/2m/WpRrtHabudVJV11htdVUSYL5ZqVjnuwMcyRk8gFmES3d2SIp3otHotBpqeKh4rBbKwOraWnj9VsWW4PCOXCGh4/re1cm5OvNOXHQVyt9krYq+aanaGxUrS4Qx8Qy5+BhgA88c8BSj1XFT0dNSF5p6eGEvOXd2wN4j7cdUmRpHun9a09v2lgr7P3dzq7TRU8c1OzOWvw0Fpx5DJ+CxmsavavVOnqm4yVFtZXSROfE6DDKvvccgWD1nHPLDgR+VS2uB1DSunFQ6mgMw6SFg4h8eqbNI4sOob1onamz193o56mZkrGTRyAmSKmc84JHmGYwD7AVhtxmbZ3vTs9dbJ7abw9vFSfJ2BPJKegdG3nz8eIZCmdcDaGlZOahtNA2Y9ZAwcR+PVOrvs0j++3c2TaEUepq0Q3WrtMkDWzH15Je7I4T5u5gH2rp6G1nTW/aVslqdFcLjaaTjlpG5JaS84Bx7Mnl5KU0TZpFGprhtVq7T81yrZ7bDVyRF4dHhlY2THQtHrOIPLBBCzG21BenbWR0d0bMKqSCZkDJvntjIIYDn8WfDC3h9DSyTid9NA6YdJCwFw+PVc6b7aNIb2311QaX26oreA2rvbax9My1Nk4Z3PdL4jBIABzkjHLC7N/t8GkN2Xalu9JHJYbvTinlqJIuOOmlw0Dj5HGSwc/wCUfIqVRR0zag1Ap4ROeRkDBxH49Vyua17S1wDgeRBHIp1dzSPb1qfT0slLbdJUVjvV3q5WtayKJskUEefWkkc3oAPDOcro7w2usoa7TmrqKldURWSoDqqKJvrCLiacgeQ4XA+XEPDKkuno6akDhT08MIdzPdsDc/UuZJdGkbax3JsV60XdKawVfyjWVdDKO5iY7iij4DxvfkeoGtyefU4A6rs7KXu3Vuh7dbaerjlrKOJxnhb86PMjiM+9b3BS09MXGCCKIvOXcDA3iPtwuVNzWjQoj0VUwbX6qv1k1BI2horhUelW+sk9WGQZOW8XQEAt6+R9mZcXHNBFURmOaJkrD1a9oIPwKko1a262+yPVbbdYBT1tppoXPrq8ZLBIfmRxuBwT4nqMLRLrrTT37Ndtu3ytTeg09tdTyz5PCyTMvqnl15j61MsMMVPGI4Y2RMHRrGgAfAL7VlhpEm4PdW3dLTWoL1GZNPNgMQlcwuihm9fDnDoObmHPs/krob3azs990zS0loqm14jro5Jp4AXRRDhfgF/TiOeQ8gVND2NkaWPaHNIwQRkFfFPTQUkfdU8MUMec8MbQ0Z9wSZeE00PcXWenqvb24OgutPI24000VKQT+7ObgOA5eBIX7txrCwU23dDJLdKdjbZTQsrCSf3Bzjhod7zyUgIpua0qINi9R2mG33qikroW1L7hPVtjJ5mEMbl/u5FcWjNWWOTeDUdSy5QGG5NghpHgnEz8MHC325UyIr1GkNam1dYot67FXPudO2mt9NPT1UpJxDJiVvCfbkgfFTHHIyaNskbg5jwHNI8QV9IpbsaHvLe7dQaIuNvqquOKrrYCKeJ3WXDm5x9a6Nk13S2vaikr7TwXOptVJSRVNPHklhPA1wOPEDiPwUlIm+2jSINdS7Wak05VXCOotguMkTn07qTDKl02PVDmDmcnAPEPq6redtIbrBoa0R3rvfThCeMS/PDeI8Ad7Qzh681n/QaUz+kejQd9/wDE4BxfX1XOrb20aFCW4NuuNp3HkpbWC2LWNI2ikcOQY7ia2R3wYM/1yptRSXRZtFm8dCdOU+nNVW2AB1iqWRGNvIGE4AaT5erw/wBdbft5a5rZpOjNXzrazirqpxHMyynjdn2jIHwWyIm+2jSItFVMG1+qr9ZNQSNoaK4VHpVvrJPVhkGTlvF0BALevkfZn6v00e524en47I4VdqsMvpNXWtBMJeXNd3Yd0cfUaOX8Y+RUrzQRVEZjmiZKw9WvaCD8Cv2KKOFgjiY2Ng6NaMAfBXq9zSJN79QWptbYKA1sQqqK5xT1EWecUeM8R9mCpQs96t1/ohW2urjq6YuLRJH0yOoXeRS3to0iu4VtLpzfF1wu1TFRUdXaeGKedwZGXAjI4jyz6p5e7zC7uo9f2277c3urqMUEVZHV0dvMrifTQGENe3kMcR8PYpCqKWnq2hlRBFM0HIEjA4A/FcjWhrQ1oAAGAB0CuzSPNq9V2Sn24pDLcoGC2QNFZkn9w4nu4eL3rC7H6gtbqy/0ArYjVVlzlnp4s85I8Z4h7MKXl+EEggHB8035NMBRaypK/WVfpaKmqPSKCBs8s5x3frBpDeuc+v5eBWwLXtJaOg0v6bUOqpa+5XCXvquslADpD4AAcmtGTge1bCpf4BERRRERAREQEREBERAREQEREBERAREQefCIi+lfnri7A/RJYfwj9YlUhKPdgfoksP4R+sSqQl8/zfcy+a92HpgiIuTQiIgIiICIiAiIgIiICIo51xfdR6a1dpyOnvLX2+8XGOndSGlZ+5s4mBwD+pzxHywrJtKkZERRRERAREQEREBERAREQEREBERAREQERRzdb7qOybmWSzSXltVbbq+aQwGlYwxMAcWs4hzOOXP2KybRIyLBatrtR0FHTP03a6a41DqhrZmTy8AZFzy4cx7PPHkV2tTXyPTVhrbxLC+aOkj7x0bDgu545fWmhk0XQsF3ZfrJQ3WKJ0TKyBkzWOOS0OGcFd9RREUc7lX3UelbjaqugvLRRV9dFSmjdSsPdtI9Y8Z5nOD7sqybSpGRF0L3S3CsoTHbLl8m1AcHd93DZuXiOF3Ln5qK76LSNoNT3TVukTcbvM2ap9Jkj4msDBwgNxyAx4lburZrsgiIooiIgIiICIiAiIgIiICIiAiIgIsJq9t0FknqLTdBbpqZj53ONO2XvA1pPDh3Tnjmsftdf6/U+iKC63OVstXM6UPe1gaDwyOaOQ5dAFddto2tERRRERAREQEREBFrt21nBadW2jTb6WWSW5se9kzXANZwgnmPgtiTSCIiKIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg8+ERF9K/PXF2B+iSw/hH6xKpCUe7A/RJYfwj9YlUhL5/m+5l817sPTBERcmhERAREQFretbbebpTUcNrvBtFMJ+KuqWODXiAA5DSRyOcc+X+xbIoo3nd3moNJ0l1kfHpyaqIq/WLY3Oy3AeR0GM/Di8lcfKVxauubdEWxt607reouU1NKzv6CtuDKoVDC4AgA+s08+o8MqQL3E6+6cbU0lyr7dmIVTJaN7WvcOAkNJc0jHMfUOaj7eSDSNp0JU01vo7PDWzOibAKWKMSAB7SXeqMgYGM+0DxW7265UI0HTSGspgxtvZEXd63Af3Q9XOevsWr42kaPt1S6k3D0kyrumqrtRRxyvjjdRSCOWYg5LnvxnAyGhox80nx5Zzai+XWoqNQ6dvFa+vnslX3TKqT58kbi4DPn8wnnk+tjwXX2IrKZm3sEbqiFr4pZnyNLwCxvF1I8B7V1dsq6kO4mu8VUH7vVRd1+6D905yfN8/grfcns/RcrvuRry72ajvVdZ7LZD3UrqF3dzTy5LT6/gMtd8B058sTr623Ky6y0LRT3KouVA66xPp5ash08bu8jDmOcAOIfNIJGeo5rt6Fq4NF7nass93kZR/Kkwq6SSZ3C2RvE9wAceROJPraR1XHulqOgrtc6KpaWpimjornG+omY8GOMmSPDS7pkBpJHgCEnlPZMSwWt9Tx6P0xXXl8feugYBHGej5HENaD7MkZ9mVmoZoqiNssMjJI3c2vY4EH3ELUN3rFVah0DcaWiidLUx8E7I29X8DgSB5nh4sDxKxPLVYzTmlb1qXT9Pervq2+U9wuEQqY2UU4igp2uGWNEYGHYBGc/8AzXJt7qi46npr5pq81UkV3tMrqWSspgGOe3LmiRuQQHAtPhjpyWU0Fqu03DQ9urDXU0TaWljiqQ+QN7l7Ghrg7PTp4+GFrGz9NLdNR6r1YInsobjVFlI5wx3rQ9xLsf2efnnyWvztHT0s/U151tqTTDtS3MWyhe0OqXOaakAEgNa7hw0uzkux0bgYzldq51922u1bZo5r5cLvYrxIYHsuD+9lp35ADg/y9YHHkD7Curou/Udo3a1jT10rKeKrma1k0p4Wd40khhceQJBcR58JX7upV0+sNW6Y0zaZWVlRFVGoqjC4OEDMt6kdOQcfq8wr7p7Ng19qi5HU1m0VY6g0dZdMy1FWG5dDAOLPBnlxEMfz8Me3I6utLfdtA2R2pLNqC71jqJ7HVFJcagzxVEbnBp5EeqeYORjxWH3Ss1FT7ladvl7pGT2KeP0KpdJ+9sf6/CXHwHrtP9UrNao0ztzpezPuM2n7fO8gCnp4yS+peeTWs5nOT5A4U7dld7WtfNddA/ZRaLtcrcYqE1kTad7WiTiaCBIC05x7COpWH01YNR650fQXWu1deLfUywfuDKKQMby5B8hAy8uIz1GAQPDKzGtvRbZtVXUhghthdbi2OjMgPdnhBLGn+FjOOS7W2dwo2be2Zzquna2CkjEpMgAjJ6B3l8U9ux7uts/qe4an0kX3STva2iqX0csp6ycIaQT7cOAz44W8KLNhaun+RrzB38Xevu0z2x8Y4nN4GcwPL2rfKTVNrrtQ1un4JnuuFDG2SdndkNaCGket0PzgplO6zwy61XWdqu10q7b3F/kstni7x1wlhlEUr/m92GuI5c+LPPx8eS2pRJuK2Cr3X0zQ6icBp58DnMZK7EL5/X+d4Zz3Y+I8ymPkr81HqBmgqi2XKzaxmvFJJVMp62gqq5lU4xuyS9p+c3GPxj3La90m1tNpSsu1Bdrhb57fE6RraZ7Q2UktHrgtJOPDBHUrRd8maXt+n6GitdLaoa51Yx5bSRMa5kQa7JJaOQyW9evwUhbgsF52+vjaB7KnipHlpicHB3DzIGPHkr+Kj904yr1Lt/aTUXOup6qqo4ZJKumc1s3FgEkEgjn48vFYfZW93K+6XrZ7pWzVs0VxlhbJKcuDAxmB+M/WvzQet7FR7cWqWS40xmpqVsBpmyAzOkaOEMDOpcSOQxzysZ2fKuI6UrYJJYm1TrlK8w8Q4scEeTjrhLO1Hxp+su+61/u1W2/XK0WK3TCnpobfJ3Uk55+s53PwAOP5WOWOfRu1HcrbvJpKgrq6S4QRMkdTVMwHfFha/LXkABxBHXAyCPFc2zVZT6RuOoNI3aaOjrIqwzQiZwb3zCMZaT15Bp9zveuPU2o7fcd6NMOp6mF9JRskjfUh47rvC1xc0O6HALc+04V99IzO9dRdLBYvl61Xy50czZI6f0eJ7RCQeIl2OHPF8fDou/u7b31ugq6qFwracU1MXOhhc0MqMlvKQFpJAxywR1KxW/8AW0smhBCyphdI+phkawPBc5vresB5e1Z/cKWO47aXp1HLHUNFGSTE4OHq4J6eQCk9ldLbTTU0em7BcjqG9vYaSN/oTpY/R+bPm44OLAzy9bwXNfLJW1Wo6usvWram0WQMjbR09LWCmLncPrl7uR69Ofj4YwvnR+qbdZ9F6OppnvlmuMUNJDHCA53Fw4LiM8mtwcnwWradpbbdt2tUs1eynqKuBwFuhrcOYIcnm1ruXzeA/EnzT3tGVsepZrLuJSaah1Eb/ablTvkhklmZNLTStDiWl7eoIb0PmPLnw7+ySw23T0sDBJMy6Mcxh6OcGnA+tYy71mnqberTTLV8nU8FNFKKiSnDGRh5Y/kSMDIGPrC7u/FyhbRWD0aSOoqIblHKII3Bz3eqSOQ58+WPerJ3h7MzqHRuoorRUXem1leReYInTmNsjRSPcBxFgixgN5YGSfblZjbvVzta6Rp7rKxrKn1oahrRhveN6kewgg/FfN+19p+l0lVXdlzpZY307u6Y2QF8jy3kzh68WSAR4eKwezFudprbqKW5uZSemTPqW984Nw1wAb18w3PxWfbue7g7P72x7eve84a2smJJ8Bhq/NIVVy3UkuN6qLvc7ZaIqh1NRUlBN3DnAAEvkcOZJBHLOM5XBsM6mq9vp7c6eMSy1E4MYeOMNLWjOOvisLtLo/Tc8d0sGp7RSPvtBVOBbPyc+IgYLefMZB5jwI81q+aNtsV+uWm9w36KudfPcqWrp/SrfUVGDM3qSx7hjiHqP59eQ8+UhqPbNbtHUmuo7dp7T1I+pooXTVFfA/1aQnLQw9cudz5Z6ZUhLGSxGG9dZddNWmG/Wu+XOmkfUx05pmSNEPDwvJOOHOTwjx+C7N50Nq66W9tzh1dc6e9OLZTRxz91RsyQTGA0ZOBkZOc459V0+0FVQfYnR0/fxd8LjC8x8Q4uHhk54649qkymq6atjMlLURTsB4S6J4cAfLIWt6kT3R9WXy5a03BqtLW+41Nstdqi7ysnpTwzTyHHqB/PhHreH8U+xcOorhcNr71ZqkXe4XKx3Cf0Wqhr5e+fC49HseefTOQfL2jGBbpmzU28d2pNU0EEtJd2GooJag4Y5+QS0Hz+cMeweYWf1DpzQVjr7bbaXS9DX3OvnbHHSxPIcxnV0ruuGtHP/wDoVew5txtSzUeqrDp+e7TWO01zZJKmvhcI3kgHhYHkHgGcZP8AKC7zNMXq1Xe0V1h1HdLhbZJuGugraoVDTFg+uxzufXyPj7Cuxqm4aYuuoKfR+o6OnlFTTelQSVDg1pdxFvA08iHYBPIjktDu2notuNcaej0dc6gfKVWIqm1GYyN7vIy4jrw4J5uyRjIPJSfgbZrbU1yqtX2nQ9kqnUM9awz1dYxoL4oQCcMzyDiGO545ZC6mtaa7bdWlupbTfbrXR0srBV0dxqDPHNG5wbyJGWnJHTzWH3GslBTbq2S73+kjmsNdD6LNJL+9xygOA4j4Dmw5Pt8lmtV6a270tavTH6doKqolLWUtJET3lS9xwGtGTnr1wr27DY9Qm6an0rSzaauXyca3uZjVOwHMp3AOcRyPPhPs94WnaoMOl7JUXOw7hVlRcqNok9HrLiypZUAH1mmM9DjOOHC495Y5qDSOnaNsMlvs3pEUVfDA8kRR4GGZHVo9b4gexd3cGk0RZtv6/wBAo7IySWmLKQwRxukeSOTmkczy5l3kCcqQrb6KY610lQVkVbWWx1bBHOZKJ7Q9hIBLQXNIxnI6KOdtPso3BsdYLjqe50lJTVT4mz0r2tqJn8LTgvx6rWjHIdS88+S3TbO5UUe3tmL6ynaIaVjZCZGjgJ6A8+XxWudn+spm6Vq6Y1EInfcpnNiLxxuHAzmB1PQ/UniUfN5veoNrNGTU1XcJLvdqy4vhts9RIZXCIgYc/i8Rg8skZcOoWbl28vBtDnjWmoTeu74hMKrEBlxnHdYxwZ+Kxm+1rqprLa71SwOnForBPMxvMiM4y7HkCB7srdJdY2OLTztQfKNO6gEXeiQPHPlnhA/jeGOueSe24MbQTXefbWSS/te26G3zekB7Q08XC7qBy6Y6LRtq9M3XU2gKIO1Dc7PRwvlZTx22QRukPeOJe92MnmccIwPVz4rfqi+/KWgZrncKcWt9ZRSubBNKMtyx3CMnHMjBwsHshW0rNtrex1TC10PfukaXgGMd6/m7yHvT2H3tJf7pXxXuyXmrdW1dkrXUvpL/AJ0jMuAz5nLXc/IhSAor2nraU6z120VMJM9zzEOMfug4pTlvn8FKimXlYjLUuoX1+5I0vcr9VWC1x0bZon08wgdVzOIwO8PQY4hgYyWlZy16cv1j1PTupb5cbjYJ4JO/ZXTtmfFIMcBa4jiwc/i59QuG8u0hrXUldpW+0FPJWUDI3wulfwPkD28R7twIdy5ZGfELUrFbHaG3Wt+n9N3aorLVWQyS1dE+XvBSgB3M45DmG4PI88HOVfZHaj+WLJurSafueqL5LbaqEVFC50sf7q9vMxyHgwQeF4wMHm3zWf1xFcK3VVhtlrvt0oZ6wuNRHTSMEcdNHkvkwWkh5LmtBzj2Lr71WaefTtNqG38rhYZ21cbgOfBkcX1Ya73NK7G3VU7VtwuWtpYXRMq2soqFj+rII+b/AO1IXf2U9tn8MVqW+SDXdBpG46hrrNa46Bsoq2TNimrZs8IDpccuh6YyQfMYz1v03fbHqegloL7crjYpo5fS4q+oExjcG/uZY53rYJPh5e1fF9m0lq7UlTpK/wBDTyVNLCyaB8z+F0geOYjcCHAjAyAefwWnW+0HQO6Vos2l7rUVNvr2vdWW58veNp2gH1jjp5gnnyxk5QfWtbBK/d7TcPy3dmmsbPI2QSM46Xk48MXqYDfDmDyW9XSqG3Wk7ndam5XK79w3vGmuka53EcNawFrW4aXEeHiVretx3O8GiZ5PVjeyaNrj0LsEY9/rD613dfVMWvNK6psNmZNUVdt7ric0DgkeCJCxhB9YgNII8yE86HzpfTl41Tp+mvl51Pe6euuEfpDI6Go7mGnY4ZYAwDB5YPPP+1cu3upbhqKC/aavFU8XW0SvpH1kADHSMPE1sg5EB2Wk9MdOXVYjb3SugdQ6OoK2e0W51VDCIqwyHDmStGHF4zyyRn4rO7ffY2ai81enrJBb7fBIKcV7H+pV8OS4jP8ABafHJBS+5Gr6fOpbprvUWlBqe6Nt9GGE1T3MdUNby9Vp4QGkl3zscg3HjlfUdXqnSu4DNFU9+qrjT3WmE1PVV+JZaPm7idk/OIEb8A8slvLrns6Dr6Q7s6ycKqAtnMIiPeDEhx0b5/Bfl8uNEN+LFMaynEUdskY95kHCx37tyJzyPsV90Lz8tbc6s089mpLpdrbd6oUlTBcJBJwEloDmnAwPWzgAfN8crM7sanq9P01npoKyS201xrW09XcGNBdTxcuLhJBw4jJz4cJWI3mrKb5U0hH6RDxxXaN8jeMZY3LTkjwC2nV2odOMktVovcVLVW+9OkY2aVzTCwsAIyfaSACOhU/FViKvS11io6S6aP1bd6+QTRlzKmubUw1ERcOPHFyBxz5eXmpCUHbg6Rt23Qo75oy5VFvuMlQyNlvjnMjakHyaSXEew5BypW1Hq62aPtUNwvkxp45HtiwxheeMgnAA9gPP2KWfgjNouOnqIquniqIHh8UrA9jh0c0jIP1LkWWhERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQefCIi+lfnri7A/RJYfwj9YlUhKPdgfoksP4R+sSqQl8/zfcy+a92HpgiIuTQiIgIiIC69fbqO60r6SvpYKunf86KZge0/ArsIgwVFoTS9vgnp6ewW1sVTjvmOga4SAEEA5ByAQDjpkLsDSmnxQm3ixWoUZk740/okfdl+McXDjHFjlnqsqiu0Yuk0rp+gbO2jsdrphURmKYQ0kbBKw9WuwOYPkeS+KTR+m6CojqaTT9op54zxMlio42PYfMEDIWXRTYxt503Z9RRsju9spa5seeDvow4sz1weo+C4fsP02aKGhdYLU+lhJdHC+lY5rCcZIBHU4GT44WYRNjhpKOmoKaOlo6eGmp4xhkULAxjB5ADkFzIiKwNboPS1xrHVtXp+2zVDncTpHQNy8+bvM+9ZWeWntFvfKISynpYiRHBESQ1o6Na0c+Q5ABdlE2iG9Gy0NZrfVQu1lr5aC+VEQpxU26QxvwXc3cTcNxkczhShZdL2TTvH8kWqkojJye6GMBzh5E9SFlEVt2SOGrpKevppKWrgiqIJRwvilYHNePIg8isRbtC6YtFYK2hsNvp6lpy2RkIyw/wAny+CzqKbHRudjtV6bG26WyirxESWCpgbLwZ644gcdAuGLSun6ejnoobHa46WoLTNAykjEcuDkcTQMHB6ZWURNjFUWlrHaZTU2uyWqjqg0tbLDSsjcM+GWgHCxeidHTadkuNzudVHWXm6y97VTRtIY0DPCxgPPhGfj8FtKK7BdO6Wi3XumNLc6GmrYCc93PGHgHzGeh9q7iKKwdLobS9HROootP2z0Z7xI6N9O14c4ZwTxA5IyceWSsnQW6itdM2loKOno6dpJEUEYjYCevIDC7KJtGHpNH6doLi65Utkt0FY4575kDQ4HzHLkfaFy0OmLFa6r0ugstspKnBHfQUrGPwevrAZ5rJomxibzpSxaiex92tNHWyRjDXyxAuaOuM9cexfkukNOVEEEE1gtMsVO0shZJSRuEYJyQ0EcufPksuiuxiavSenq90bquw2qoMUbYozLSRvLGDo0ZHIDwHRduitFuttI6jobfSUtK4kuhghaxhz1y0DHNdtFNjC2vRem7LWmut1koKWpOQJY4gHNz1x5fBct60rYtR8Ju1qo61zBhr5YwXNHkHdQFlUV2MM7RemXwQU8mnrTJFTt4YmSUkbgwZyQMjlz5rkm0pp6oqm1c1itUtQ3h4Zn0kZeOEANw4jPIAAeWAsqibGDn0NpipuJuM1gtslWXcZldA0lzuvEeWCfaeayVwtdBd6f0a40VNWwcQd3VRE2RuR0OHAjK7SKbGMt2mbFaKg1Ftsttopy0sMlPSsjdwnqMtAOOQXxedKWLUTmvu1po617BwtfLEC5o8g7rhZZE2OjabJbLFTejWugpqKEnJZBGGgnzOOp967yIisZcdMWK71HpNxstsrZ+EN72opWSOwOgy4E4XYttpt1mgdT2ygpKGFzi8x00LY2l2AMkNAGcAc/Yu2ibHTulmtt8pvRrnQ01bDniDJ4w8A+Yz0PtXVsuk7Dp1732m00dHI8Yc+KMBxHlnrhZZE2jH3SwWi+NDbpbKKuDRhvpELXlvuJHL4Lr2bSGn9PSumtVnoqOVwwZI4gH48s9cLMImxwVtFS3Gmkpa2mhqaeQYfFMwPa4e0HkVirZofTNmqxWW+x0FNUD5srIRxN9x8Pgs4ibHFVUtPW076aqgingkHC+OVoc1w8iDyKw1DoPS1tdO6lsFtjNQ0sk/cGkOaercHwPl0WeRNjEx6S07DSzUcdhtLKactdLC2kjDJC3oXNxg48M9EodJ6etlUyrobDaqSpjzwTQUkbHtyMHDgMjkSPissibH4QHAggEHkQVr7NvtJR1grGadtbZ2niDhTtAB88dM/BbCibHUuVpt15gbT3OgpK6FruNsdTC2RodgjIDgRnBPP2rrUuldP0Mc8VLY7XTx1LO7mZFSRtErf4rgBzHsKyiJsYmj0jpy3VLKqisFppqiM5ZLDRxse3ljkQMhZZERWKu2lrFfXF90s9BWPxjvJoGueB7HYyPrX1ZtNWbTrHttNspKIP+eYYw0u956lZNE2iOtQa9N6t9403brbWC+SzS26KB8D3MLC4sM5fw8IZw5dzPh5c1u1is8Gn7NRWqlH7jSQtiacY4sDmT7Scn4rvoraMZdtMWO+niulooa12MB80DXOA9jiMhfll0vZNOh/yTa6SiL+T3QxgOcPInqVlEU2MfebBatQ07ae7W+mrYmnia2ZgdwnzHl8FyWqz26xUgo7ZRQUdOCXd3CwNBJ8Tjqfau4iDA3HQml7tVurK6w26eoceJ0roRxPPm4jr8Vlo7fRxUXoEdJAyk4DH6O2MCPgPVvD0x7F2ETYw9No3TVFUR1NLp2zwTxODmSxUcbXMI6EENyCvmXROl55XzTabsskkji5730MRc4nmSSW8ys0iu6MTW6T09cqh1TXWG1VU7gA6Wekje8gDAySM8gAFyzadstRQR2+a0W+Sji/e6d1Owxs/mtxgfBZFFNjB2zQ+mbNVist9ioKaoHzZWQjib7j4fBd+62a3X2lFJdKKnrYA4PEczA4Bw6Hn/wDXNd1E2PljGxtDGNDWtGAAMABfSIiiIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg8+ERF9K/PXF2B+iSw/hH6xKpCUe7A/RJYfwj9YlUhL5/m+5l817sPTBERcmhERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREHnwiIvpX564uwP0SWH8I/WJVISj3YH6JLD+EfrEqkJfP833Mvmvdh6YIiLk0IiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg8+ERF9K/PXF2B+iSw/hH6xKpCUe7A/RJYfwj9YlUhL5/m+5l817sPTBERcmhERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBE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B4iQT7uuQFKkcMcPF3cbGcRy7hAGT5lfRAcCCAQeRBU2aQZf9cWrWu823T7FK6soKSWtb6a2NwikkdCOJjSQMloa0nH8cLIb47h0lHdKHQUt3FjgucXf3O5uDiYqQkgxx4BJe/hcM4wB7+UxRxMhYGRsaxg6NaMAL6TZppm3msdCXWlj09ou4000NugGKeGN7e7jzjJLgMkk8z1JOVHW9+5+j7jFZbZS3uGWstmpKaWriEbwYWRF4kJJbg4PllTwib7jUYNcad1vpa+T6eucdwip6aVkrmMc3hcY3ED1gFrO2f8A2d6T70VX/wDIpURNiA5prtB2X7K+1GraO6hFY6kz3zabvT3hbjn0648M+C1DdVm0rdAVcegbVT1twb3MktZTtleaOIyNHHI9/QuJDMdfWPkVatfEcMUPF3cbGcRy7haBk+ZVmRpp+vrro+g0vSU+t4WSWmtcyEulgdJGx/DkFxaCWdOTvA+IUaaO+R6DdWyUm2F7uVwsMkM5vFKZpJqOlYG/uWHP6OLugyTyHgSp8exsjCx7Q5rhggjIIX5FFHCwMijZG0fwWjAUlNPtERRRERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQefCIi+lfnri7A/RJYfwj9YlUhKPdgfoksP4R+sSqQl8/zfcy+a92HpgiIuTQiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiDz4REX0r89cXYH6JLD+EfrEqkJR7sD9Elh/CP1iVSEvn+b7mXzXuw9MERFyaEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQefCIi+lfnri7A/RJYfwj9YlUhKPdgfoksP4R+sSqQl8/zfcy+a92HpgiIuTQiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiDz4REX0r89cXYH6JLD+EfrEqkJEXz/ADfcy+a92HpgiIuTQiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiD//Z";
function rlEsc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function rlUtm(url, host) { return url + (url.indexOf("?") >= 0 ? "&" : "?") + "utm_source=" + encodeURIComponent(host) + "&utm_medium=referral&utm_campaign=reach-layer"; }
// Pure: (html, page URL) -> html with the missing basics added. Returns the input unchanged when nothing is missing.
function reachLayerHtml(html, pageUrl) {
  var h = String(html || "");
  var u;
  try { u = new URL(pageUrl); } catch (e) { return h; }
  if (!RL_HOSTS[u.hostname]) return h;
  var hi = h.search(/<\/head>/i), bi = h.toLowerCase().lastIndexOf("</body>");
  if (hi < 0 || bi < 0 || bi < hi) return h;
  var headPart = h.slice(0, hi), bodyPart = h.slice(hi, bi);
  var add = [];
  if (!/<meta[^>]+property=["']og:image["']/i.test(headPart)) {
    add.push('<meta property="og:image" content="https://qnfo.org/og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">');
    if (/<meta[^>]+name=["']twitter:card["'][^>]*content=["']summary["']/i.test(headPart)) headPart = headPart.replace(/(<meta[^>]+name=["']twitter:card["'][^>]*content=["'])summary(["'])/i, "$1summary_large_image$2");
    else if (!/<meta[^>]+name=["']twitter:card["']/i.test(headPart)) add.push('<meta name="twitter:card" content="summary_large_image">');
  }
  var canon = "https://" + u.hostname + (u.pathname.replace(/\/+$/, "") || "/");
  if (!/<link[^>]+rel=["']canonical["']/i.test(headPart)) add.push('<link rel="canonical" href="' + rlEsc(canon) + '">');
  if (!/application\/ld\+json/i.test(headPart + bodyPart)) {
    var tm = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(headPart);
    var ld = { "@context": "https://schema.org", "@type": "WebPage", "url": canon, "name": tm ? tm[1].trim() : "QNFO",
      "author": { "@type": "Person", "name": RL_AUTHOR.name, "sameAs": ["https://orcid.org/" + RL_AUTHOR.orcid] },
      "publisher": { "@type": "Organization", "name": "QNFO", "url": "https://qnfo.org" } };
    add.push('<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + "</script>");
  }
  var doc = headPart + bodyPart;
  var bits = [];
  if (!/Quni-Gudzinas/.test(doc)) bits.push('By <a href="https://orcid.org/' + RL_AUTHOR.orcid + '">' + RL_AUTHOR.name + "</a>");
  if (!/work-with-me/.test(doc)) bits.push('<a href="' + rlUtm("https://qnfo.org/work-with-me", u.hostname) + '">Work with me</a>');
  var plain = !!RL_PLAIN[u.pathname.replace(/\/+$/, "") || "/"];
  if (!/ipatent\.qnfo\.org/.test(doc)) bits.push('<a href="' + rlUtm("https://ipatent.qnfo.org/example", u.hostname) + '">' + (plain ? "A free tool I built: provisional application drafting with a claim-support check" : "iPatent: free provisional patent drafting") + "</a>");
  var needSub = !/type=["']email["']/i.test(doc);
  if (needSub && plain) { bits.push('<a href="' + rlUtm("https://qnfo.org/", u.hostname) + '#subscribe">New papers by email</a>'); needSub = false; }
  var strip = bits.length || needSub ? '<aside class="qnfo-reach"' + (plain && !/type=["']email["']/i.test(doc) ? ' data-reach-policy="no-form"' : "") + ' style="max-width:760px;margin:24px auto;padding:12px 16px;border-top:1px solid rgba(127,127,127,.35);font:14px/1.6 system-ui,sans-serif;text-align:center;opacity:.9">' + bits.join(" \u00b7 ") + (needSub ? subscribeBlock(u.hostname + "/reach-layer") : "") + "</aside>" : "";
  if (!add.length && !strip) return h;
  return headPart + add.join("") + bodyPart + strip + h.slice(bi);
}
async function withReachLayer(res, request) {
  try {
    var ct = res && res.headers && res.headers.get("Content-Type") || "";
    if (!res || res.status !== 200 || ct.indexOf("text/html") !== 0 || !request || request.method !== "GET") return res;
    var host = new URL(request.url).hostname;
    if (!RL_HOSTS[host]) return res;
    var html = await res.text();
    var out = reachLayerHtml(html, request.url);
    var hd = new Headers(res.headers);
    hd.delete("Content-Length");
    hd.set("X-Reach-Layer", out === html ? "none" : "applied");
    return new Response(out, { status: res.status, statusText: res.statusText, headers: hd });
  } catch (e) {
    return res;
  }
}
function reachOgImage() {
  var bin = Uint8Array.from(atob(RL_OG_B64), function(c) { return c.charCodeAt(0); });
  return new Response(bin, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
}
// ---- REACH-LAYER-1:END ----
// ---- UTM-CLICK-LEDGER-1:BEGIN ----
// UTM-CLICK-LEDGER-1 (3.10.0, transformation lever T7.9, pillar reach; owner directive 2026-10-06 "do real humans find and visit
// the pages"): every qnfo.org link the fleet posts or mails carries utm_source/utm_medium/utm_campaign (qnfo-social
// POST-ID-UTM-1), but RUM drops the query string and nothing read the tags, so no post or digest could be joined to the
// visits it caused. A GET for an HTML page that carries utm_source is counted once, after the response is built, into the
// gateway's own D1 (qnfo-graph, binding DB) table utm_clicks: one row per (day, host, path, source, medium, campaign,
// ua_class, country) with a counter. No cookie, no IP, no user agent string, no per-recipient id; ua_class is bot when the
// user agent names a crawler or link-preview fetcher. Values are lower-cased, limited to [a-z0-9._-] and 64 characters; an
// isolate records at most UTM_ISOLATE_CAP clicks so a flood of invented tags cannot grow the table without bound.
// qnfo-fleet-dashboard's daily reach ingest reads the rows into qnfo-audit.reach_signals (source utm).
var UTM_BOT_RE = /bot|crawler|spider|preview|facebookexternalhit|slackbot|twitterbot|linkedinbot|mastodon|bluesky|cardyb|headless/i;
var UTM_ISOLATE_CAP = 5000;
var utmIsolateCount = 0;
var utmTableReady = false;
function utmClean(v) {
  return String(v || "").toLowerCase().trim().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}
// The row a response earns, or null: GET, a utm_source on the URL, a 200 HTML answer.
function utmClickRow(request, res, nowMs) {
  try {
    if (!request || request.method !== "GET" || !res || res.status !== 200) return null;
    if (!/text\/html/i.test(res.headers.get("Content-Type") || "")) return null;
    const u = new URL(request.url);
    const src = utmClean(u.searchParams.get("utm_source"));
    if (!src) return null;
    const cf = request.cf || {};
    return {
      day: new Date(nowMs || Date.now()).toISOString().slice(0, 10),
      host: u.hostname.toLowerCase().slice(0, 64),
      path: (u.pathname.replace(/\/+$/, "") || "/").slice(0, 200),
      utm_source: src,
      utm_medium: utmClean(u.searchParams.get("utm_medium")),
      utm_campaign: utmClean(u.searchParams.get("utm_campaign")),
      ua_class: UTM_BOT_RE.test(request.headers.get("User-Agent") || "") ? "bot" : "human",
      country: typeof cf.country === "string" ? cf.country.slice(0, 2).toUpperCase() : ""
    };
  } catch (e) {
    return null;
  }
}
async function utmRecord(env, row) {
  if (!row || !env || !env.DB || utmIsolateCount >= UTM_ISOLATE_CAP) return false;
  utmIsolateCount++;
  if (!utmTableReady) {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS utm_clicks (day TEXT NOT NULL, host TEXT NOT NULL, path TEXT NOT NULL, utm_source TEXT NOT NULL, utm_medium TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '', ua_class TEXT NOT NULL, country TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, host, path, utm_source, utm_medium, utm_campaign, ua_class, country))").run();
    utmTableReady = true;
  }
  await env.DB.prepare("INSERT INTO utm_clicks (day, host, path, utm_source, utm_medium, utm_campaign, ua_class, country, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1) ON CONFLICT (day, host, path, utm_source, utm_medium, utm_campaign, ua_class, country) DO UPDATE SET n = n + 1").bind(row.day, row.host, row.path, row.utm_source, row.utm_medium, row.utm_campaign, row.ua_class, row.country).run();
  return true;
}
// ---- UTM-CLICK-LEDGER-1:END ----
var gateway_worker_default = {
  async fetch(request, env, ctx) {
    // HEAD too: some link-preview crawlers check the image with HEAD before fetching it (REACH-LAYER-1 3.8.7).
    if ((request.method === "GET" || request.method === "HEAD") && new URL(request.url).pathname === "/og.jpg" && RL_HOSTS[new URL(request.url).hostname]) {
      var ogr = reachOgImage();
      return request.method === "HEAD" ? new Response(null, { status: 200, headers: ogr.headers }) : ogr;
    }
    const served = await gateway_worker_default.serve(request, env, ctx);
    // UTM-CLICK-LEDGER-1: count a tagged page load after the answer is built; never delays or changes the response.
    const utmRow = utmClickRow(request, served);
    if (utmRow && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(utmRecord(env, utmRow).catch(function() {}));
    return withFleetCtl(await withReachLayer(served, request));
  },
  async serve(request, env, ctx) {
    const u = new URL(request.url);
    const p = u.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get("Origin") || "https://qnfo.org";
    const host = u.hostname;
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,User-Agent"
        }
      });
    }
    // QDS-1: the shared design system, served on every gateway host.
    if (p === "/qds.css") return qdsAsset("css");
    if (p === "/qds.js") return qdsAsset("js");
    // ARCHIVE-ON-GATEWAY-1 and QWAV-ON-GATEWAY-1: hosts that were undeployable Pages projects.
    if (host === "archive.qnfo.org" || host === "qwav.org" || host === "www.qwav.org" || host === "qwav.tech" || host === "www.qwav.tech") {
      if (host.indexOf("www.") === 0) return new Response(null, { status: 301, headers: { Location: "https://" + host.slice(4) + p + u.search } });
      if (p === "/health") return health();
      if (p === "/robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: https://" + host + "/sitemap.xml\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
      if (p === "/sitemap.xml") return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://' + host + '/</loc><changefreq>weekly</changefreq></url></urlset>\n', { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
      if (host === "archive.qnfo.org") {
        if (p === "/" || p === "/index.html") return handleArchive(env);
        return new Response(null, { status: 301, headers: { Location: "https://archive.qnfo.org/" } });
      }
      if (p === "/legal" || p.indexOf("/legal/") === 0 || p === "/license" || p === "/privacy") return new Response(null, { status: 301, headers: { Location: "https://legal.qnfo.org" + (p === "/privacy" ? "/privacy" : legalRedirectPath(p)) } });
      if (p === "/" || p === "/index.html") return renderQwavHTML(host);
      return new Response(null, { status: 301, headers: { Location: "https://" + host + "/" } });
    }
    if (p === "/privacy" && (host === "legal.qnfo.org" || host === "qnfo.org" || host === "www.qnfo.org" || host === "papers.qnfo.org")) return renderPrivacyHTML();
    // LEGAL-URL-1 (3.11.0): https://qnfo.org/legal/license is the address the license names for itself (every SPDX header,
    // the attribution statement, section 10.3 "effective upon posting"), and it answered a JSON 404; only the QWAV hosts
    // redirected. Now qnfo.org and www.qnfo.org send /legal, /legal/license (and a version below it) and /license to
    // legal.qnfo.org.
    if ((host === "qnfo.org" || host === "www.qnfo.org") && (p === "/legal" || p.indexOf("/legal/") === 0 || p === "/license")) return new Response(null, { status: 301, headers: { Location: "https://legal.qnfo.org" + legalRedirectPath(p) } });
    if (host === "legal.qnfo.org") return handleLegal(p, env);
    if (host === "papers.qnfo.org" || host === "qnfo-publications.pages.dev") {
      if (p === "/oai" || p === "/openapi.json" || p === "/feed.json" || p.indexOf("/api/papers") === 0 && p !== "/api/paper-context") {
        const od = await handleOpenData(request, env, p);
        if (od) return od;
      }
      if (p === "/api/ask" && method === "POST") return handleAskAI(request, env);
      if (p === "/api/subscribe" && method === "POST") return handleSubscribeProxy(request, env);
      if (p === "/api/unsubscribe" && (method === "GET" || method === "POST")) return handleUnsubscribeProxy(request, env);
      if (p === "/api/confirm" && (method === "GET" || method === "POST")) return handleConfirmProxy(request, env);
      if (p === "/sitemap.xml") return handleSitemap(env, host);
      if (p === "/robots.txt") return handlePapersRobots();
      if (p === "/llms.txt") return handleLlmsTxt(env);
      if (p === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
      if (p === "/api/indexnow" && (method === "GET" || method === "POST")) return handleIndexNow(env, u.searchParams.get("full") === "1");
      if (p === "/rss.xml" || p === "/feed.xml") return handleRss(env);
      if (p.startsWith("/api/paper-context/") && method === "GET") return handlePaperContext(env, decodeURIComponent(p.slice(19)));
      if (p === "/api/render-health" && method === "GET") return handleRenderHealth(env);
      if (p === "/_audit/blank-papers") return handleBlankPapers(env);
      if (p.startsWith("/papers/") && p.split("/").length >= 3) return handlePaperDetail(request, env, p);
      if (p === "/ipatent" || p === "/ipatent/") return new Response(null, { status: 301, headers: { Location: "https://ipatent.qnfo.org/" } });
      if (p === "/reading" || p === "/reading/") return renderReadingHTML();
      if (p === "/papers" || p === "/") return handlePapers(request, env);
      return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (host === "graph-api.qnfo.org") {
      try {
        if ((method === "GET" || method === "HEAD") && p === "/stats") return handleStats(env);
        if (method === "POST" && p === "/query") return handleQuery(request, env);
        if (method === "POST" && p === "/sync") return handleSync(request, env);
        if (method === "GET" && p === "/nodes") return handleNodesList(u, env);
        if (method === "GET" && p.startsWith("/nodes/")) return handleNodeGet(p.replace("/nodes/", ""), env);
        if (method === "GET" && p.startsWith("/neighbors/")) return handleNeighbors(p.replace("/neighbors/", ""), env);
        if (method === "GET" && p === "/edges") return handleEdges(u, env);
        if (method === "GET" && p.startsWith("/impact/")) return handleImpact(p.replace("/impact/", ""), env);
        if (p === "/" || p === "/health") return json({ status: "ok", worker: "qnfo-gateway", version: VERSION, database: "qnfo-graph" });
        return json({ error: "Not found", path: p }, 404);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    // SEO-HYGIENE-1: www.qnfo.org served a full 200 duplicate of every page; pages now 301 to the canonical host
    // (API and form posts are left alone so nothing a browser sends is lost).
    if (host === "www.qnfo.org" && (method === "GET" || method === "HEAD") && p.indexOf("/api/") !== 0) {
      return new Response(null, { status: 301, headers: { Location: "https://qnfo.org" + u.pathname + u.search, "Cache-Control": "public, max-age=86400" } });
    }
    if (host === "qnfo.org" || host === "www.qnfo.org") {
      if (p === "/health") return health();
      if (p === "/legal" || p === "/license") return handleLegal(p, env);
      if (p === "/api/ask" && method === "POST") return handleAskAI(request, env);
      if (p === "/api/subscribe" && method === "POST") return handleSubscribeProxy(request, env);
      if (p === "/api/unsubscribe" && (method === "GET" || method === "POST")) return handleUnsubscribeProxy(request, env);
      if (p === "/api/confirm" && (method === "GET" || method === "POST")) return handleConfirmProxy(request, env);
      if (p.startsWith("/api/paper-context/") && method === "GET") return handlePaperContext(env, decodeURIComponent(p.slice(19)));
      if (p === "/api/render-health" && method === "GET") return handleRenderHealth(env);
      if (p === "/_audit/blank-papers") return handleBlankPapers(env);
      if (p.startsWith("/papers/") && p.split("/").length >= 3) return handlePaperDetail(request, env, p);
      if (p === "/papers" || p.startsWith("/papers?")) return handlePapers(request, env);
      if (p === "/sitemap.xml") return handleSitemap(env, host);
      if (p === "/robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: https://qnfo.org/sitemap.xml\nSitemap: https://papers.qnfo.org/sitemap.xml\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } }); // DISCOVERY-1: qnfo.org lists its own sitemap
      if (p === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } }); // DISCOVERY-1: IndexNow key on qnfo.org too
      if (p === "/llms.txt") return handleLlmsTxt(env);
      if (p === "/rss.xml" || p === "/feed.xml") return handleRss(env);
      if (method === "GET" && p === "/stats") return handleStats(env);
      if (method === "POST" && p === "/query") return handleQuery(request, env);
      if (method === "POST" && p === "/sync") return handleSync(request, env);
      if (method === "GET" && p === "/nodes") return handleNodesList(u, env);
      if (method === "GET" && p.startsWith("/nodes/")) return handleNodeGet(p.replace("/nodes/", ""), env);
      if (method === "GET" && p.startsWith("/neighbors/")) return handleNeighbors(p.replace("/neighbors/", ""), env);
      if (method === "GET" && p === "/edges") return handleEdges(u, env);
      if (method === "GET" && p.startsWith("/impact/")) return handleImpact(p.replace("/impact/", ""), env);
      if (p === "/graph") return new Response(null, { status: 302, headers: { Location: "https://graph-api.qnfo.org/stats" } });
      if (p === "/ipatent" || p === "/ipatent/") return new Response(null, { status: 301, headers: { Location: "https://ipatent.qnfo.org/" } });
      if (p === "/about") return handleAbout(env);
      if (p === "/work-with-me") return handleWorkWithMe();
      if (p === "/contact") return new Response(null, { status: 301, headers: { Location: "https://qnfo.org/work-with-me" } });
      if (p === "/" || p === "") return handleHubCached(env, ctx);
      return notFoundPage(request, env, host, p, null);
    }
    if (p === "/health") return health();
    if (p === "/legal" || p === "/license") return handleLegal(p, env);
    if (p === "/api/ask" && method === "POST") return handleAskAI(request, env);
    if (p.startsWith("/api/paper-context/") && method === "GET") return handlePaperContext(env, decodeURIComponent(p.slice(19)));
    if (p === "/_audit/blank-papers") return handleBlankPapers(env);
    if (p.startsWith("/papers/") && p.split("/").length >= 3) return handlePaperDetail(request, env, p);
    if (p.startsWith("/papers") || p === "/") return handlePapers(request, env);
    if (p === "/sitemap.xml") return handleSitemap(env, host);
    if (p === "/robots.txt") return handlePapersRobots();
    if (p === "/llms.txt") return handleLlmsTxt(env);
    if (p === "/rss.xml" || p === "/feed.xml") return handleRss(env);
    if (method === "GET" && p === "/stats") return handleStats(env);
    if (method === "POST" && p === "/query") return handleQuery(request, env);
    if (method === "POST" && p === "/sync") return handleSync(request, env);
    if (method === "GET" && p === "/nodes") return handleNodesList(u, env);
    if (method === "GET" && p.startsWith("/nodes/")) return handleNodeGet(p.replace("/nodes/", ""), env);
    if (method === "GET" && p.startsWith("/neighbors/")) return handleNeighbors(p.replace("/neighbors/", ""), env);
    if (method === "GET" && p === "/edges") return handleEdges(u, env);
    if (method === "GET" && p.startsWith("/impact/")) return handleImpact(p.replace("/impact/", ""), env);
    return notFoundPage(request, env, host, p, null);
  },
  async scheduled(event, env, ctx) {
    try {
      // DISCOVERY-1 (2026-10-06): every submission is logged (living-paper indexnow_log) so search reach is measurable,
      // and on Mondays the qnfo.org core pages are submitted on their own host (key file now served there too).
      const pr = await indexNowSubmit(await collectPaperUrls(env, 7), "papers.qnfo.org");
      await indexNowLog(env, "papers.qnfo.org", pr);
      if (new Date().getUTCDay() === 1) {
        const qr = await indexNowSubmit(QNFO_CORE_URLS, "qnfo.org");
        await indexNowLog(env, "qnfo.org", qr);
      }
    } catch (e) {
    }
    await askRatePrune(env);
    try {
      await renderHealthSweep(env);
    } catch (e) {
      console.log("RENDER-HEALTH-1 sweep failed: " + String(e && e.message || e).slice(0, 200));
    }
    try {
      await browserMathSample(env);
    } catch (e) {
      console.log("MATH-BROWSER-2 sample failed: " + String(e && e.message || e).slice(0, 200));
    }
  }
};
export {
  gateway_worker_default as default
};
//# sourceMappingURL=worker.js.map
