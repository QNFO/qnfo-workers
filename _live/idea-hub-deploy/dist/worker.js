var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.10.6-admission-cap";
var QDS_OWNER_ORCID = "0009-0002-4317-5604";
var QDS_VERSION = "1.0.0";
var QDS_ORIGIN = "https://qnfo.org";
var QDS_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap">';
var QDS_GA = '<script src="/cdn-cgi/zaraz/i.js"><\/script>';
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
__name(qdsAttr, "qdsAttr");
function qdsHead(o) {
  const brand = o.brand || "qnfo";
  const t = qdsAttr(o.title), d = qdsAttr(o.description || "");
  const site = brand === "qwav" ? "QWAV" : "QNFO";
  return '<!DOCTYPE html><html lang="en" data-brand="' + brand + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + t + '</title><meta name="description" content="' + d + '">' + (o.canonical ? '<link rel="canonical" href="' + qdsAttr(o.canonical) + '">' : "") + (o.robots ? '<meta name="robots" content="' + qdsAttr(o.robots) + '">' : "") + '<meta name="author" content="Rowan Brad Quni-Gudzinas"><meta property="og:site_name" content="' + site + '"><meta property="og:title" content="' + t + '"><meta property="og:description" content="' + d + '"><meta property="og:type" content="' + (o.ogType || "website") + '">' + (o.canonical ? '<meta property="og:url" content="' + qdsAttr(o.canonical) + '">' : "") + (brand === "qwav" ? '<meta name="twitter:card" content="summary">' : '<meta property="og:image" content="https://qnfo.org/og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">') + '<meta name="twitter:title" content="' + t + '"><meta name="twitter:description" content="' + d + '"><meta name="theme-color" content="#F5F7FB" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#121731" media="(prefers-color-scheme: dark)"><link rel="icon" type="image/svg+xml" href="' + QDS_FAVICON[brand === "qwav" ? "qwav" : "qnfo"] + '">' + (o.rss ? '<link rel="alternate" type="application/rss+xml" title="QNFO Papers" href="https://papers.qnfo.org/rss.xml">' : "") + QDS_FONTS + '<link rel="stylesheet" href="' + QDS_ORIGIN + "/qds.css?v=" + QDS_VERSION + '"><script src="' + QDS_ORIGIN + "/qds.js?v=" + QDS_VERSION + '" defer><\/script>' + (o.jsonld || "") + (o.math ? QDS_MATHJAX : "") + (o.extra || "") + QDS_GA + "</head>";
}
__name(qdsHead, "qdsHead");
function qdsHeader(brand, active) {
  const nav = brand === "qwav" ? QDS_NAV_QWAV : QDS_NAV_QNFO;
  const home = brand === "qwav" ? "https://qwav.org/" : "https://qnfo.org/";
  const name = brand === "qwav" ? "QWAV" : "QNFO";
  const links = nav.map(function(n) {
    return '<a href="' + n.h + '"' + (n.k === active ? ' aria-current="page"' : "") + ">" + n.t + "</a>";
  }).join("");
  return '<a class="q-skip" href="#main">Skip to main content</a><header class="q-top"><div class="q-wrap"><a class="q-brand" href="' + home + '" aria-label="' + name + ' home">' + QDS_MARK[brand === "qwav" ? "qwav" : "qnfo"] + name + '</a><nav class="q-nav q-nav-wide" aria-label="Main">' + links + '</nav><details class="q-menu"><summary aria-label="Menu">' + QDS_MENU_ICON + '</summary><nav class="q-nav" aria-label="Main">' + links + "</nav></details>" + QDS_THEME_BTN + "</div></header>";
}
__name(qdsHeader, "qdsHeader");
function qdsFooter(brand) {
  if (brand === "qwav") {
    return '<footer class="q-foot"><div class="q-wrap"><div class="q-foot-grid"><div><a class="q-brand" href="https://qwav.org/">' + QDS_MARK.qwav + 'QWAV</a><p style="margin-top:12px;max-width:36ch">A pre-commercial computing platform concept, benchmarked in joules per correct answer. Research by Rowan Brad Quni-Gudzinas, published by QNFO.</p></div><div><h2>Platform</h2><ul><li><a href="#jpcub">JPCUB benchmark</a></li><li><a href="#stack">Architecture</a></li><li><a href="#landscape">Landscape</a></li><li><a href="#research">Research</a></li></ul></div><div><h2>Research</h2><ul><li><a href="https://papers.qnfo.org/papers">Papers</a></li><li><a href="https://ask.qwav.tech/">Ask the corpus</a></li><li><a href="https://papers.qnfo.org/rss.xml">RSS</a></li></ul></div><div><h2>Legal</h2><ul><li><a href="https://legal.qnfo.org/">License (QNFO-ULA v2.0)</a></li><li><a href="https://qnfo.org/about">About the author</a></li></ul></div></div><div class="q-foot-base"><span>\xA9 2025\u20132026 Rowan Brad Quni-Gudzinas</span><span>Research content under QNFO-ULA v2.0. No commercial product exists yet.</span></div></div></footer>';
  }
  return '<footer class="q-foot"><div class="q-wrap"><div class="q-foot-grid"><div><a class="q-brand" href="https://qnfo.org/">' + QDS_MARK.qnfo + 'QNFO</a><p style="margin-top:12px;max-width:38ch">The independent research imprint of Rowan Brad Quni-Gudzinas. Every work carries a DOI, and corrections ship as new versions.</p></div><div><h2>Research</h2><ul><li><a href="https://papers.qnfo.org/papers">Papers</a></li><li><a href="https://qnfo.org/#selected-works">Selected works</a></li><li><a href="https://ask.qwav.tech/">Ask the corpus</a></li><li><a href="https://ideas.qnfo.org/">Ideas</a></li><li><a href="https://archive.qnfo.org/">Archive</a></li><li><a href="https://ipatent.qnfo.org/?utm_source=ideas.qnfo.org&amp;utm_medium=referral&amp;utm_campaign=footer">iPatent: free provisional patent drafting</a></li></ul></div><div><h2>Author</h2><ul><li><a href="https://qnfo.org/about">About</a></li><li><a href="https://qnfo.org/work-with-me">Work with me</a></li><li><a href="https://orcid.org/' + QDS_OWNER_ORCID + '">ORCID ' + QDS_OWNER_ORCID + '</a></li><li><a href="https://qnfo.org/work-with-me#contact">Contact</a></li></ul></div><div><h2>Follow</h2><ul><li><a href="https://qnfo.org/#subscribe">New papers by email</a></li><li><a href="https://papers.qnfo.org/rss.xml">RSS</a></li><li><a href="https://legal.qnfo.org/">License (QNFO-ULA v2.0)</a></li><li><a href="https://legal.qnfo.org/privacy">Privacy</a></li></ul></div></div><div class="q-foot-base"><span>\xA9 2025\u20132026 QNFO \xB7 Rowan Brad Quni-Gudzinas</span><span>Prepared with an AI-assisted research pipeline; the author is responsible for the content.</span></div></div></footer>';
}
__name(qdsFooter, "qdsFooter");
function qdsPage(o, body) {
  return qdsHead(o) + "<body>" + qdsHeader(o.brand || "qnfo", o.active) + '<main id="main">' + body + "</main>" + qdsFooter(o.brand || "qnfo") + (o.scripts || "") + "</body></html>";
}
__name(qdsPage, "qdsPage");
var BASE = "https://ideas.qnfo.org";
var INTERNAL = ["system-reminder", "<system-reminder", "system prompt", "role instructions", "respond with the exact first sentence", "reply with ok", "reply with exactly", "write 200 words", "write one self-contained python", "extract every quantitative claim", "you are an adversarial reviewer", "you are the revising author", "revision round-2 mandate", "l8 specification", "operator-shared thread", "numerical verification sprint", "paper-reviser", "tool_call", "tool result", "strict json only", "compare paqit", "guard-probe", "probe-", "research and publish", "calendar event", "email received", "attachment_file", "file_index", "file_key", "file_content", "read-only context data", "working memory", "context-data", "treat them strictly as data"];
var OPS = ["audit and remediate", "remediate all failure modes", "failure-mode", "failure modes", "backlog", "open issues", "ops_issue_run", "fleet_status", "backlog_status", "ops_d1_query", "ops_d1_write", "cf_worker_read", "cf_worker_deploy", "cf_worker_bindings", "workspace_write", "workspace_read", "web_fetch", "web_search", "github_", "r2_", "kv_", "vectorize_query", "telemetry_report", "telemetry_analyze", "dr_validate_schema", "service_discover", "shell_exec", "exec_python", "exec_node", "container_status", "qnfo-ops", "worker deploy", "patches not deployed", "source drift", "canonical source", "binding missing", "retired health stub", "email-orchestrator", "schema guard", "dod audit", "claim sheet", "wbs plan", "confirm:true", "dryrun", "incomplete:", "ops endpoint", "server-side ops", "cloudflare worker"];
var JUNK = ["say ok", "say okay", "test", "testing", "what is the capital", "who are you", "what is your name", "tell me a joke", "write a poem", "write me a", "make me a", "create me", "explain like i", "good morning", "good night", "thank you", "thanks", "continue", "repeat", "again", "what time is it", "write code", "implement a", "give this conversation a name", "hello world", "what is 2+2", "daily planning", "life advice", "productivity", "planning a", "trip to", "overwinter", "show my partner", "weather in", "weather for", "what color is in this image", "what colour is in this image", "color is in this image", "colour is in this image", "image?", "what relevant conferences are coming up"];
var DEFAULT_RESEARCH = ["quantum", "qec", "p-adic", "ultrametric", "thermodynamic", "landauer", "majorana", "topological", "number theory", "physics", "mathematics", "set theory", "self-reference", "measurement", "decoherence", "gravity", "spacetime", "riemann", "zeta", "matrix", "computation", "ai-assisted science", "consilience", "distinction", "entropy", "hilbert", "wheeler", "page-wootters", "cause", "block", "linguistic", "etymological", "sea peoples", "conflict", "misunderstanding", "ignorance", "slime mold", "citation", "marginalia"];
var RESEARCH = DEFAULT_RESEARCH.slice();
var _researchSet = null;
var _researchAt = 0;
var RESEARCH_TTL = 3e5;
async function refreshResearchTerms(env) {
  const n = Date.now();
  if (_researchSet && n - _researchAt < RESEARCH_TTL) return _researchSet;
  let terms = null;
  try {
    const r = await env.QNFO_AUDIT.prepare("SELECT value FROM ops_config WHERE key='idea_topic_clusters'").first();
    if (r && r.value) {
      const data = JSON.parse(String(r.value));
      terms = (data.clusters || []).flatMap((c) => Array.isArray(c.terms) ? c.terms.map(String) : []);
    }
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "refreshResearchTerms", error: String(e && e.message || e).slice(0, 300) }));
  }
  if (!terms || !terms.length) {
    terms = DEFAULT_RESEARCH;
  }
  _researchSet = terms;
  RESEARCH = terms;
  _researchAt = n;
  return terms;
}
__name(refreshResearchTerms, "refreshResearchTerms");
function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
__name(cors, "cors");
function json(x, s = 200) {
  return new Response(JSON.stringify(x), { status: s, headers: { ...cors(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
__name(json, "json");
function stripInj(s) {
  return String(s || "").replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, " ").replace(/<system-reminder>[\s\S]*$/gi, " ").replace(/<attachment_file>[\s\S]*?<\/attachment_file>/gi, " ").replace(/<context-data[^>]*>[\s\S]*?<\/context-data>/gi, " ").replace(/<file_content>[\s\S]*?<\/file_content>/gi, " ");
}
__name(stripInj, "stripInj");
function clean(s, max = 240) {
  return stripInj(s).replace(/^(User|Assistant|System|Human|AI)\s*:\s*/i, "").replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[redacted]").replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]").replace(/\s+/g, " ").trim().slice(0, max);
}
__name(clean, "clean");
function reEsc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
__name(reEsc, "reEsc");
var _wordRe = /* @__PURE__ */ new Map();
function wordHit(t, p) {
  let re = _wordRe.get(p);
  if (!re) {
    re = new RegExp("(?<![a-z0-9])" + reEsc(p) + "(?![a-z0-9])", "i");
    _wordRe.set(p, re);
  }
  return re.test(t);
}
__name(wordHit, "wordHit");
function has(s, a) {
  const t = String(s || "").toLowerCase();
  return a.some(function(x) {
    const p = String(x).toLowerCase();
    if (/^[a-z0-9]+$/.test(p)) return wordHit(t, p);
    return t.includes(p);
  });
}
__name(has, "has");
var STAMP = /(prior submission was dropped|expressed-step abort|dropped by an expressed|notation-commissioning|cross-link to qnf-|cross-link to dlf-|before execution|retry\s*\()/i;
var TOOLINV = /(?:use|invoke|call|run)\s+(?:your\s+|the\s+|a\s+|an\s+)?[a-z][a-z0-9_]{1,}(?:_[a-z0-9]+)*\s+(?:tools?|functions?|verbs?|apis?|endpoints?|actions?)\b|call\s+[a-z][a-z0-9_]{1,}(?:_[a-z0-9]+)+\s+with\b|(?<![a-z0-9])[a-z][a-z0-9]*(?:_[a-z0-9]+)+\s+(?:tool|function|verb)\b/i;
var ROLEPROMPT = /^\s*(you are (the|an|a)\b|write (one|a|the|two)\b|extract (every|all|the)\b|produce (the|a|one|two)\b|output (the|a|only|strict)\b|audit (this|the)\b|reconcil(e|ing)\b|based on the chat history|give this conversation a name)/i;
function pubQuestion(s) {
  const t = clean(s, 1e3);
  if (STAMP.test(t)) return false;
  if (TOOLINV.test(t)) return false;
  if (ROLEPROMPT.test(t)) return false;
  return t.length >= 12 && !has(t, INTERNAL) && !has(t, OPS) && !has(t, JUNK);
}
__name(pubQuestion, "pubQuestion");
function publicTitle(s) {
  const t = clean(s, 1e3);
  return pubQuestion(t) && has(t, RESEARCH);
}
__name(publicTitle, "publicTitle");
function ts(v) {
  if (!v) return null;
  if (typeof v === "number") return new Date(v).toISOString();
  let s = String(v).replace(" ", "T");
  if (!/Z$|[+-]\d\d:\d\d$/.test(s)) s += "Z";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}
__name(ts, "ts");
var _qSet = null;
var _qAt = 0;
async function quarantined(env) {
  const n = Date.now();
  if (_qSet && n - _qAt < 6e4) return _qSet;
  const r = (await env.QNFO_AUDIT.prepare("SELECT DISTINCT thread FROM chat_feed_quarantine_20260926 WHERE thread IS NOT NULL LIMIT 5000").all()).results || [];
  _qSet = new Set(r.map(function(x) {
    return String(x.thread);
  }));
  _qAt = n;
  return _qSet;
}
__name(quarantined, "quarantined");
var _eSet = null;
var _eAt = 0;
async function errataThreads(env) {
  const n = Date.now();
  if (_eSet && n - _eAt < 6e4) return _eSet;
  const r = (await env.QNFO_AUDIT.prepare("SELECT target_ref FROM internal_errata WHERE target_kind='chat_log' AND COALESCE(status,'open') NOT IN ('closed','resolved','rejected') LIMIT 5000").all()).results || [];
  _eSet = new Set(r.map(function(x) {
    return String(x.target_ref).split(":")[0];
  }));
  _eAt = n;
  return _eSet;
}
__name(errataThreads, "errataThreads");
async function blocked(env, id) {
  try {
    if ((await quarantined(env)).has(String(id))) return true;
    if ((await errataThreads(env)).has(String(id))) return true;
    const r = (await env.QNFO_AUDIT.prepare("SELECT role,content FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 200").bind(id).all()).results || [];
    if (r.some((x) => x.role === "system")) return true;
    const first = r.find((x) => x.role === "user");
    if (!first) return true;
    const c = clean(first.content, 4e3);
    return has(c, INTERNAL) || has(c, OPS) || has(c, JUNK);
  } catch (e) {
    return true;
  }
}
__name(blocked, "blocked");
function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
__name(esc, "esc");
async function all(env) {
  await refreshResearchTerms(env);
  const rows = (await env.QNFO_AUDIT.prepare("SELECT c.thread AS id,COUNT(*) AS n,MIN(c.ts) first_ts,MAX(c.ts) last_ts,(SELECT content FROM chat c2 WHERE c2.thread=c.thread AND c2.role='user' ORDER BY c2.ts ASC,c2.id ASC LIMIT 1) title,(SELECT model FROM chat c2 WHERE c2.thread=c.thread ORDER BY c2.ts DESC LIMIT 1) model FROM chat c GROUP BY c.thread ORDER BY last_ts DESC LIMIT 500").all()).results || [];
  const out = [];
  for (const r of rows) {
    if (!publicTitle(r.title)) continue;
    if (await blocked(env, r.id)) continue;
    out.push({ id: r.id, kind: "thread", source: "live", title: clean(r.title, 220), created_at: ts(r.first_ts) || ts(r.last_ts), updated_at: ts(r.last_ts) || ts(r.first_ts), message_count: Number(r.n) || 0, model: r.model || null, tags: ["conversation", "live"] });
  }
  try {
    const ar = (await env.QNFO_AUDIT.prepare("SELECT thread_id id,title,created_at,updated_at FROM chat_sessions WHERE category='research' ORDER BY COALESCE(updated_at,created_at) DESC LIMIT 500").all()).results || [];
    for (const r of ar) {
      if (!publicTitle(r.title)) continue;
      if (await blocked(env, r.id)) continue;
      out.push({ id: r.id, kind: "session", source: "archive", title: clean(r.title, 220), created_at: ts(r.created_at), updated_at: ts(r.updated_at) || ts(r.created_at), message_count: 0, model: null, tags: ["conversation", "archive"] });
    }
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "all", error: String(e && e.message || e).slice(0, 300) }));
  }
  try {
    const qr = (await env.QNFO_AUDIT.prepare("SELECT id,ts,question FROM self_questions WHERE status='open' ORDER BY ts DESC LIMIT 60").all()).results || [];
    for (const r of qr) {
      if (!pubQuestion(r.question)) continue;
      out.push({ id: "q-" + r.id, kind: "question", source: "ideation", title: clean(r.question, 300), created_at: ts(r.ts), updated_at: ts(r.ts), message_count: 0, model: null, tags: ["question", "ideation"] });
    }
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "all", error: String(e && e.message || e).slice(0, 300) }));
  }
  try {
    const pr = (await env.QNFO_AUDIT.prepare("SELECT id,idea,status,created_at FROM idea_proposals WHERE status IN ('triaged_accepted','triaged_hold') ORDER BY created_at DESC LIMIT 120").all()).results || [];
    for (const r of pr) {
      if (!pubQuestion(r.idea)) continue;
      out.push({ id: "p-" + r.id, kind: "proposal", source: "ideation", title: clean(r.idea, 300), created_at: ts(r.created_at), updated_at: ts(r.created_at), message_count: 0, model: null, tags: ["proposal", "ideation", String(r.status)] });
    }
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "all", error: String(e && e.message || e).slice(0, 300) }));
  }
  const seen = /* @__PURE__ */ new Set();
  return out.sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0)).filter((x) => {
    const k = x.title.toLowerCase().slice(0, 100);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
__name(all, "all");
async function rss(env) {
  const it = (await all(env)).slice(0, 40);
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>QNFO Idea Factory</title><link>' + BASE + "/</link><description>Public read-only research conversations from QNFO - ideas as they develop.</description><lastBuildDate>" + (/* @__PURE__ */ new Date()).toUTCString() + "</lastBuildDate>\n" + it.map((x) => "<item><title>" + esc(x.title) + "</title><link>" + BASE + "/s/" + encodeURIComponent(x.id) + '</link><guid isPermaLink="false">' + esc(x.id) + "</guid><description>" + esc(x.title) + "</description><pubDate>" + new Date(x.updated_at || x.created_at || Date.now()).toUTCString() + "</pubDate></item>").join("\n") + "\n</channel></rss>";
  return new Response(body, { headers: { ...cors(), "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "no-store" } });
}
__name(rss, "rss");
async function sessions(url, env) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 100);
  return json({ sessions: (await all(env)).slice(0, limit), limit });
}
__name(sessions, "sessions");
async function session(path, env) {
  await refreshResearchTerms(env);
  const id = decodeURIComponent(path.split("/").slice(3).join("/"));
  if (/^[qp]-\d+$/.test(id)) {
    const k = id[0], num = id.slice(2);
    let row = null;
    try {
      if (k === "q") {
        const r = (await env.QNFO_AUDIT.prepare("SELECT question AS q,ts,status FROM self_questions WHERE id=?").bind(num).all()).results || [];
        row = r[0];
        if (row) row = { id, kind: "question", title: clean(row.q, 500), status: row.status || "", created_at: ts(row.ts) };
      } else {
        const r = (await env.QNFO_AUDIT.prepare("SELECT idea AS q,created_at,status FROM idea_proposals WHERE id=?").bind(num).all()).results || [];
        row = r[0];
        if (row) row = { id, kind: "proposal", title: clean(row.q, 500), status: row.status || "", created_at: ts(row.created_at) };
      }
    } catch (e) {
      console.error(JSON.stringify({ worker: "idea-hub", where: "session", error: String(e && e.message || e).slice(0, 300) }));
    }
    if (!row || !pubQuestion(row.title)) return json({ error: "Session not found or not public" }, 404);
    return json(row);
  }
  const rows = (await env.QNFO_AUDIT.prepare("SELECT ts,role,content,model FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 500").bind(id).all()).results || [];
  const first = rows.find((r) => r.role === "user");
  if (!first || !publicTitle(first.content) || await blocked(env, id)) return json({ error: "Session not found or not public" }, 404);
  return json({ id, title: clean(first.content, 500), messages: rows.filter((r) => r.role !== "system" && !has(r.content, INTERNAL) && !has(r.content, OPS) && !has(r.content, JUNK)).map((r) => ({ role: r.role, content: clean(r.content, 2e5), timestamp: ts(r.ts), model: r.model || null })) });
}
__name(session, "session");
var TRIAGE_BATCH = 10;
var T_MODELS = { a: "@cf/zai-org/glm-5.3-flash", b: "@cf/deepseek-ai/deepseek-v4-flash-0731", tiebreak: "@cf/qwen/qwen3-30b-a3b-fp8" };
var T_CHAIN = ["@cf/zai-org/glm-5.3-flash", "@cf/zai-org/glm-5.3", "@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/zai-org/glm-5.2"];
var ACCEPT_MIN = 0.7;
var FEAS_MIN = 0.5;
var RISK_MAX = 0.4;
var STD_TIE = 0.25;
var REASONING_MAX_TOKENS = 2e3;
var T_KEYS = ["novelty", "technical_merit", "impact_potential", "exposure_potential", "feasibility", "risk"];
var SCORECARD_PROMPT = `You are QNFO's research-idea merit reviewer. Score the idea below for the QNFO autonomous research pipeline.
Return JSON ONLY: {"novelty":0-1,"technical_merit":0-1,"impact_potential":0-1,"exposure_potential":0-1,"feasibility":0-1,"risk":0-1,"rationale":"<=120 chars","hook":"<=90 chars, one-line public-facing hook"}
Scoring guide: technical_merit = depth of technical content + verifiability; impact_potential = significance if proven; exposure_potential = breadth of audience/attention it can attract (social, media, cross-field); risk = probability of producing nothing citable (1 = near-certain dead end). IMPORTANT: feasibility means feasibility of the THEORETICAL/COMPUTATIONAL research itself (can the derivation, simulation, formal analysis, and computational verification be carried out by the QNFO autonomous pipeline) - NOT experimental testability. QNFO has no laboratory; an idea is feasible if its mathematics/computation can be executed and verified in silico, even if a confirming experiment would require external labs years away. Do NOT mark a theoretical idea infeasible merely because no experiment currently exists.
IDEA: `;
function tExtract(r) {
  if (!r) return "";
  var ch = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (ch) return String(ch);
  if (typeof r.response === "string") return r.response;
  if (r.result && typeof r.result.response === "string") return r.result.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  return "";
}
__name(tExtract, "tExtract");
async function aiRunAttr(env, worker, purpose, model, input, opts) {
  var t0 = Date.now(), ok = 1, res;
  try {
    res = await env.AI.run(model, input, promptCacheOpts(model, input, opts));
  } catch (e) {
    ok = 0;
    throw e;
  } finally {
    try {
      var db = env.QNFO_AUDIT;
      if (db) {
        var ic = 0;
        try {
          ic = JSON.stringify(input && input.messages || input || "").length;
        } catch (e2) {
          console.error(JSON.stringify({ worker: "idea-hub", where: "aiRunAttr", error: String(e2 && e2.message || e2).slice(0, 300) }));
        }
        var day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        await db.prepare("CREATE TABLE IF NOT EXISTS ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))").run();
        await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms) VALUES (?1,?2,?3,?4,1,?5,?6,?7) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+?5, in_chars=in_chars+?6, ms=ms+?7").bind(day, worker, purpose, String(model), ok ? 0 : 1, ic, Date.now() - t0).run();
        var u = res && typeof res === "object" && res.usage || {};
        if (!/bge|embed|whisper|m2m100|resnet|flux|sdxl/i.test(String(model))) {
          var cTok = Number(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens || u.cached_tokens || u.input_tokens_details && u.input_tokens_details.cached_tokens || 0) || 0;
          var inTok = Number(u.prompt_tokens || u.input_tokens || 0) || 0;
          await db.prepare("INSERT INTO ai_cache_counters (day, worker, model, calls, cached_calls, in_tok, cached_tok) VALUES (?1,?2,?3,1,?4,?5,?6) ON CONFLICT(day, worker, model) DO UPDATE SET calls=calls+1, cached_calls=cached_calls+excluded.cached_calls, in_tok=in_tok+excluded.in_tok, cached_tok=cached_tok+excluded.cached_tok").bind(day, worker, String(model).slice(0, 120), cTok > 0 ? 1 : 0, inTok, cTok).run();
        }
      }
    } catch (e3) {
      console.error(JSON.stringify({ worker: "idea-hub", where: "aiRunAttr", error: String(e3 && e3.message || e3).slice(0, 300) }));
    }
  }
  return res;
}
__name(aiRunAttr, "aiRunAttr");
function promptCacheOpts(model, input, opts) {
  try {
    if (opts && opts.extraHeaders && opts.extraHeaders["x-session-affinity"]) return opts;
    var m = input && input.messages, c = m && m.length ? m[0].content : input && input.prompt;
    var t = typeof c === "string" ? c : JSON.stringify(c || "");
    if (t.length < 1024) return opts;
    t = String(model) + "|" + t.slice(0, 4096);
    var h = 2166136261;
    for (var i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    var o = Object.assign({}, opts || {});
    o.extraHeaders = Object.assign({}, o.extraHeaders || {}, { "x-session-affinity": "pc-" + (h >>> 0).toString(36) });
    return o;
  } catch (e) {
    return opts;
  }
}
__name(promptCacheOpts, "promptCacheOpts");
async function aiBudgetBreach(env) {
  try {
    var rows = (await env.QNFO_AUDIT.prepare("SELECT node_class, cap, current FROM fleet_budget WHERE node_class LIKE 'ai_spend:%' AND current > cap ORDER BY node_class").all()).results || [];
    return { breached: rows.length > 0, caps: rows.map(function(r) {
      return r.node_class + " " + r.current + "/" + r.cap;
    }) };
  } catch (e) {
    return { breached: true, caps: ["fleet_budget unreadable: " + String(e && e.message || e).slice(0, 80)] };
  }
}
__name(aiBudgetBreach, "aiBudgetBreach");
async function tRunModel(env, name, prompt) {
  var lastErr = "";
  var chain = [name].concat(T_CHAIN.filter(function(x) {
    return x !== name;
  })).slice(0, 4);
  for (var i = 0; i < chain.length; i++) {
    try {
      var r = await aiRunAttr(env, "idea-hub", "triage", chain[i], { messages: [{ role: "user", content: prompt }], max_tokens: REASONING_MAX_TOKENS, temperature: 0.2 });
      var mm = tExtract(r).match(/\{[\s\S]*\}/);
      if (!mm) {
        lastErr = chain[i] + ": no JSON";
        continue;
      }
      var c = JSON.parse(mm[0]);
      var ok = true;
      for (var k = 0; k < T_KEYS.length; k++) {
        var v = parseFloat(c[T_KEYS[k]]);
        if (!isFinite(v)) {
          ok = false;
          break;
        }
        c[T_KEYS[k]] = Math.max(0, Math.min(1, v));
      }
      if (!ok) {
        lastErr = chain[i] + ": invalid scorecard";
        continue;
      }
      return { card: c, model: chain[i] };
    } catch (e) {
      lastErr = chain[i] + ": " + (e && e.message || e);
    }
  }
  return { error: lastErr };
}
__name(tRunModel, "tRunModel");
async function scoreIdea(env, desire, lean) {
  var prompt = SCORECARD_PROMPT + String(desire || "").slice(0, 3e3);
  if (lean) {
    var one = await tRunModel(env, T_MODELS.a, prompt);
    if (!one.card) return { error: "lean scoring failed: " + one.error };
    var lc = one.card, ls = 0.3 * lc.novelty + 0.3 * lc.technical_merit + 0.2 * lc.impact_potential + 0.2 * lc.exposure_potential;
    return { score: Math.round(ls * 1e3) / 1e3, decision: ls >= ACCEPT_MIN && lc.feasibility >= FEAS_MIN && lc.risk <= RISK_MAX ? "ACCEPT" : "HOLD", rationale: lc.rationale, model: one.model + " (lean: ai_spend cap breached)" };
  }
  var res = await Promise.all([tRunModel(env, T_MODELS.a, prompt), tRunModel(env, T_MODELS.b, prompt)]);
  var a = res[0].card ? res[0] : null, b = res[1].card ? res[1] : null, card, models;
  if (a && b) {
    card = {};
    T_KEYS.forEach(function(k) {
      card[k] = (a.card[k] + b.card[k]) / 2;
    });
    card.rationale = a.card.rationale || "";
    models = [a.model, b.model];
    var std = Math.sqrt(T_KEYS.map(function(k) {
      return Math.pow(a.card[k] - b.card[k], 2);
    }).reduce(function(x, y) {
      return x + y;
    }, 0) / T_KEYS.length);
    if (std > STD_TIE) {
      var t = await tRunModel(env, T_MODELS.tiebreak, prompt);
      if (t.card) {
        T_KEYS.forEach(function(k) {
          card[k] = (a.card[k] + b.card[k] + t.card[k]) / 3;
        });
        models.push(t.model);
      }
    }
  } else if (a || b) {
    card = (a || b).card;
    models = [(a || b).model];
  } else return { error: "all scoring models failed: " + [res[0].error, res[1].error].join(" | ") };
  var score = 0.3 * card.novelty + 0.3 * card.technical_merit + 0.2 * card.impact_potential + 0.2 * card.exposure_potential;
  var decision = score >= ACCEPT_MIN && card.feasibility >= FEAS_MIN && card.risk <= RISK_MAX ? "ACCEPT" : "HOLD";
  return { score: Math.round(score * 1e3) / 1e3, decision, rationale: card.rationale, model: models.join("+") };
}
__name(scoreIdea, "scoreIdea");
var NOVELTY_K = 4;
var NOVELTY_PAYOFF_MIN = 3;
var NOVELTY_FOUNDATIONAL_QUOTA = 0.3;
var NOVELTY_MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/google/gemma-4-26b-a4b-it"];
var NOVELTY_EMBED = "@cf/baai/bge-base-en-v1.5";
var NOVELTY_LABELS = ["none", "partial", "substantial", "duplicate"];
var NOVELTY_STOP = /^(about|above|after|again|against|among|another|based|being|below|between|both|could|does|doing|during|each|either|every|from|further|have|having|here|into|itself|more|most|much|must|other|over|same|should|some|such|than|that|their|them|then|there|these|they|this|those|through|under|until|very|what|when|where|whether|which|while|whose|will|with|within|without|would|your|using|study|paper|approach|method|novel|propose|proposed|research|question|questions|result|results|show|shows|whether)$/i;
function noveltyTerms(text) {
  var seen = {}, out = [];
  String(text || "").toLowerCase().replace(/[^a-z0-9\- ]+/g, " ").split(/\s+/).forEach(function(w) {
    w = w.replace(/^-+|-+$/g, "");
    if (w.length < 5 || NOVELTY_STOP.test(w) || seen[w]) return;
    seen[w] = 1;
    out.push(w);
  });
  return out.sort(function(a, b) {
    return b.length - a.length;
  }).slice(0, 6);
}
__name(noveltyTerms, "noveltyTerms");
function arxivEntries(xml) {
  var out = [], re = /<entry>([\s\S]*?)<\/entry>/g, m;
  var pick = /* @__PURE__ */ __name(function(s, tag) {
    var x = s.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">"));
    return x ? x[1].replace(/\s+/g, " ").trim() : "";
  }, "pick");
  while ((m = re.exec(String(xml || ""))) && out.length < NOVELTY_K) {
    var id = pick(m[1], "id").replace(/^https?:\/\/arxiv\.org\/abs\//, "");
    var title = pick(m[1], "title"), summary = pick(m[1], "summary");
    if (title) out.push({ ref: "arXiv " + id, title, text: summary.slice(0, 1200) });
  }
  return out;
}
__name(arxivEntries, "arxivEntries");
async function arxivNeighbours(idea) {
  var terms = noveltyTerms(idea);
  if (terms.length < 2) return [];
  var queries = [terms.slice(0, 3).map(function(t) {
    return "all:" + t;
  }).join(" AND "), terms.map(function(t) {
    return "all:" + t;
  }).join(" OR ")];
  for (var i = 0; i < queries.length; i++) {
    var init = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? { signal: AbortSignal.timeout(8e3) } : {};
    var r = await fetch("https://export.arxiv.org/api/query?sortBy=relevance&max_results=" + NOVELTY_K + "&search_query=" + encodeURIComponent(queries[i]), init);
    if (!r.ok) throw new Error("arXiv HTTP " + r.status);
    var es = arxivEntries(await r.text());
    if (es.length) return es;
  }
  return [];
}
__name(arxivNeighbours, "arxivNeighbours");
async function corpusNeighbours(env, idea) {
  if (!env.PAPER_VZ || !env.LIVING_PAPER) return [];
  var emb = await aiRunAttr(env, "idea-hub", "novelty-embed", NOVELTY_EMBED, { text: [String(idea || "").slice(0, 1500)] });
  var vec = emb && emb.data && emb.data[0];
  if (!vec) throw new Error("no embedding");
  var hits = await env.PAPER_VZ.query(vec, { topK: 12, returnValues: false, returnMetadata: "all" });
  var slugs = [];
  (hits && hits.matches || []).forEach(function(h) {
    var s = h && h.metadata && h.metadata.slug;
    if (s && slugs.indexOf(s) < 0 && slugs.length < NOVELTY_K) slugs.push(String(s));
  });
  var out = [];
  for (var i = 0; i < slugs.length; i++) {
    var p = await env.LIVING_PAPER.prepare("SELECT title, COALESCE(NULLIF(abstract, ''), substr(body_md, 1, 1500)) AS s FROM papers WHERE slug = ?1 LIMIT 1").bind(slugs[i]).first();
    if (p && p.title) out.push({ ref: "QNFO " + slugs[i], title: String(p.title), text: String(p.s || "").slice(0, 1200) });
  }
  return out;
}
__name(corpusNeighbours, "corpusNeighbours");
var NOVELTY_PROMPT = 'You compare a proposed research idea with existing work. For each numbered neighbour, label its overlap with the IDEA: none | partial | substantial | duplicate (duplicate = the neighbour already asks or answers the same question), and name the overlapping element in at most 80 characters. delta = the difference from the closest neighbour that the IDEA text itself states, quoted or closely paraphrased from the IDEA; empty when the IDEA states none (do not invent one). payoff 1-5, anchored: 5 = a named decision or design parameter changes if the result holds; 4 = a named method or model choice changes; 3 = a named open question narrows; 2 = only general understanding improves; 1 = nothing named changes. foundational = true when the IDEA is foundational theory whose value is conceptual rather than a decision. Return JSON ONLY: {"neighbours":[{"n":1,"overlap":"none","element":""}],"delta":"","payoff":3,"foundational":false}\n';
function noveltyLabel(raw) {
  var m = String(raw || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  var j = JSON.parse(m[0]);
  if (!j || !Array.isArray(j.neighbours)) return null;
  var p = Math.round(Number(j.payoff));
  return {
    neighbours: j.neighbours.map(function(x) {
      return { n: Number(x && x.n), overlap: NOVELTY_LABELS.indexOf(String(x && x.overlap || "").toLowerCase()) >= 0 ? String(x.overlap).toLowerCase() : "none", element: String(x && x.element || "").slice(0, 80) };
    }),
    delta: String(j.delta || "").trim().slice(0, 200),
    payoff: isFinite(p) ? Math.max(1, Math.min(5, p)) : null,
    foundational: j.foundational === true || String(j.foundational).toLowerCase() === "true"
  };
}
__name(noveltyLabel, "noveltyLabel");
function noveltyVerdict(lab, nbrs, mix) {
  var worst = -1, at = null;
  lab.neighbours.forEach(function(x) {
    var k = NOVELTY_LABELS.indexOf(x.overlap);
    if (k > worst && nbrs[x.n - 1]) {
      worst = k;
      at = x;
    }
  });
  var label = worst >= 0 ? NOVELTY_LABELS[worst] : "none", nb = at ? nbrs[at.n - 1] : null;
  var counts = NOVELTY_LABELS.map(function(l) {
    return lab.neighbours.filter(function(x) {
      return x.overlap === l;
    }).length;
  }).join("/");
  var base = "[novelty " + nbrs.length + " neighbours none/partial/substantial/duplicate " + counts + "; payoff " + (lab.payoff === null ? "?" : lab.payoff);
  if (label === "duplicate") return { hold: true, tag: base + "; HOLD duplicate of " + nb.ref + " (" + at.element + ")]" };
  if (label === "substantial" && !lab.delta) return { hold: true, tag: base + "; HOLD substantial overlap with " + nb.ref + " (" + at.element + ") and no stated delta]" };
  if (lab.payoff !== null && lab.payoff < NOVELTY_PAYOFF_MIN) {
    var room = !mix || (mix.foundational || 0) < Math.max(1, Math.ceil(NOVELTY_FOUNDATIONAL_QUOTA * (mix.n + 1)));
    if (lab.foundational && room) return { hold: false, foundational_quota: true, tag: base + "; foundational-quota]" };
    return { hold: true, tag: base + "; HOLD practical payoff below " + NOVELTY_PAYOFF_MIN + (lab.foundational ? ", foundational quota full" : "") + "]" };
  }
  return { hold: false, tag: base + (label === "substantial" ? "; delta stated" : "") + "]" };
}
__name(noveltyVerdict, "noveltyVerdict");
async function noveltyScreen(env, idea, mix, lean) {
  var nbrs = [], errs = [];
  try {
    nbrs = nbrs.concat(await corpusNeighbours(env, idea));
  } catch (e) {
    errs.push("corpus: " + String(e && e.message || e).slice(0, 80));
  }
  try {
    nbrs = nbrs.concat(await arxivNeighbours(idea));
  } catch (e) {
    errs.push("arxiv: " + String(e && e.message || e).slice(0, 80));
  }
  if (!nbrs.length) return { screened: false, error: errs.join("; ") || "no neighbours" };
  var prompt = NOVELTY_PROMPT + "IDEA: " + String(idea || "").slice(0, 2e3) + "\n" + nbrs.map(function(n, i2) {
    return "NEIGHBOUR " + (i2 + 1) + " (" + n.ref + "): " + n.title + ". " + n.text;
  }).join("\n");
  var models = lean ? NOVELTY_MODELS.slice().reverse() : NOVELTY_MODELS;
  for (var i = 0; i < models.length; i++) {
    try {
      var r = await aiRunAttr(env, "idea-hub", "novelty", models[i], { messages: [{ role: "user", content: prompt }], max_tokens: REASONING_MAX_TOKENS, temperature: 0.1 });
      var lab = noveltyLabel(tExtract(r));
      if (!lab) {
        errs.push(models[i] + ": no labels");
        continue;
      }
      var v = noveltyVerdict(lab, nbrs, mix);
      v.screened = true;
      v.model = models[i];
      v.errors = errs;
      return v;
    } catch (e) {
      errs.push(models[i] + ": " + String(e && e.message || e).slice(0, 80));
    }
  }
  return { screened: false, error: errs.join("; ") };
}
__name(noveltyScreen, "noveltyScreen");
var NOISE_RE = [/^call (the )?[a-z_]+( tool)?(\s|$)/i, /(email_check|express_intent|intents_list|social_compose|search_research|search_papers tool)/i, /output the (complete )?raw json/i, /^reply with the single word/i, /^give this conversation a name/i, /^max \d+ chars/i, /based on the chat history/i, /rotation verification/i, /redirect probe/i, /auto-express block/i, /wrapped in/i, /^ok$/i];
function isNoise(t) {
  t = String(t || "");
  return NOISE_RE.some(function(re) {
    return re.test(t);
  });
}
__name(isNoise, "isNoise");
function isQuestion(t) {
  t = String(t || "").trim();
  return t.length < 160 && /\?\s*$/.test(t) && /^(what|who|where|when|why|how|is|are|do|does|did|can|could|should|would|will|has|have|quick|one line|one sentence|in one sentence|probe)/i.test(t);
}
__name(isQuestion, "isQuestion");
var TOPIC_DERIVE_DAYS = 90;
var TOPIC_MIN_DF = 3;
var TOPIC_CANDIDATES = 60;
var TOPIC_JOIN = 0.5;
var TOPIC_CLUSTER_MAX = 6;
var TOPIC_CLUSTER_TERMS = 8;
var TOPIC_TEMPLATE_MIN_DOCS = 10;
var TOPIC_TEMPLATE_SHARE = 0.9;
var TOPIC_CACHE_KEY = "idea_topic_clusters";
var TOPIC_CACHE_MAX_AGE_H = 72;
var TOPIC_DERIVE_SQL = "SELECT name, idea FROM idea_proposals WHERE decision = 'ACCEPT' AND replace(substr(created_at, 1, 19), 'T', ' ') >= datetime('now', '-" + TOPIC_DERIVE_DAYS + " day') ORDER BY id";
var TOPIC_STOPWORDS = new Set("about above across after again against also among because been before being between both cannot could does doing during each either every from further gives given have having here however into itself just keep known like made make many more most much must need neither often only other over said same should since some such than that their them then there these they this those through thus under until upon using very want were what when where whether which while whose will with within without would your idea ideas research question questions paper papers study studies analysis approach method methods result results claim claims note notes proposal proposals show shows shown based work works novel first second third author authors conjecture conjectures hypothesis hypotheses propose proposes proposed rather single standard yield yields test tests testable explore investigate framework".split(" "));
function topicTerms(text) {
  var out = [], seen = /* @__PURE__ */ Object.create(null);
  var words = String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").split(" ");
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (w.length < 4 || /^[0-9]/.test(w) || TOPIC_STOPWORDS.has(w)) continue;
    if (/ies$/.test(w)) w = w.slice(0, -3) + "y";
    else if (w.length > 4 && /[^su]s$/.test(w)) w = w.slice(0, -1);
    if (TOPIC_STOPWORDS.has(w) || seen[w]) continue;
    seen[w] = 1;
    out.push(w);
  }
  return out;
}
__name(topicTerms, "topicTerms");
function deriveTopicClusters(rows) {
  var docs = (rows || []).map(function(r) {
    return { src: String(r && r.name || ""), terms: topicTerms(r && r.idea) };
  });
  var bySrc = /* @__PURE__ */ Object.create(null);
  docs.forEach(function(d) {
    (bySrc[d.src] = bySrc[d.src] || []).push(d.terms);
  });
  var template = [];
  Object.keys(bySrc).sort().forEach(function(s) {
    var ds = bySrc[s];
    if (ds.length < TOPIC_TEMPLATE_MIN_DOCS) return;
    var c = /* @__PURE__ */ Object.create(null);
    ds.forEach(function(t) {
      t.forEach(function(w) {
        c[w] = (c[w] || 0) + 1;
      });
    });
    Object.keys(c).sort().forEach(function(w) {
      if (c[w] >= TOPIC_TEMPLATE_SHARE * ds.length && template.indexOf(w) < 0) template.push(w);
    });
  });
  var docsOf = /* @__PURE__ */ Object.create(null);
  docs.forEach(function(d, i) {
    d.terms.forEach(function(w) {
      if (template.indexOf(w) < 0) (docsOf[w] = docsOf[w] || []).push(i);
    });
  });
  var cands = Object.keys(docsOf).filter(function(w) {
    return docsOf[w].length >= TOPIC_MIN_DF;
  }).sort(function(a, b) {
    return docsOf[b].length - docsOf[a].length || (a < b ? -1 : a > b ? 1 : 0);
  }).slice(0, TOPIC_CANDIDATES);
  var seeds = [];
  cands.forEach(function(t) {
    var best = null, bs = 0;
    seeds.forEach(function(c) {
      var n = 0;
      docsOf[t].forEach(function(i) {
        if (c.docs.has(i)) n++;
      });
      if (n / docsOf[t].length > bs) {
        bs = n / docsOf[t].length;
        best = c;
      }
    });
    if (best && bs >= TOPIC_JOIN) {
      if (best.terms.length < TOPIC_CLUSTER_TERMS) best.terms.push(t);
    } else if (seeds.length < 3 * TOPIC_CLUSTER_MAX) seeds.push({ label: t, terms: [t], docs: new Set(docsOf[t]) });
  });
  var clusters = seeds.filter(function(c) {
    return c.terms.length >= 2;
  }).slice(0, TOPIC_CLUSTER_MAX).map(function(c) {
    return { label: c.label, terms: c.terms };
  });
  return { clusters, docs: docs.length, template_terms: template };
}
__name(deriveTopicClusters, "deriveTopicClusters");
function topicCluster(text, clusters) {
  var terms = topicTerms(text);
  for (var i = 0; i < (clusters || []).length; i++) {
    for (var j = 0; j < clusters[i].terms.length; j++) if (terms.indexOf(clusters[i].terms[j]) >= 0) return clusters[i].label;
  }
  return "other";
}
__name(topicCluster, "topicCluster");
async function loadTopicClusters(db, force) {
  var cacheError = null;
  if (!force) {
    try {
      var row = await db.prepare("SELECT value FROM ops_config WHERE key = ?1").bind(TOPIC_CACHE_KEY).first();
      var v = row && row.value ? JSON.parse(row.value) : null;
      var age = v && v.derived_at ? (Date.now() - Date.parse(v.derived_at)) / 36e5 : Infinity;
      if (v && Array.isArray(v.clusters) && age >= 0 && age <= TOPIC_CACHE_MAX_AGE_H) return Object.assign(v, { source: "cache", cache_error: null });
    } catch (e) {
      cacheError = "read: " + String(e && e.message || e).slice(0, 120);
    }
  }
  var rows = (await db.prepare(TOPIC_DERIVE_SQL).all()).results || [];
  var d = deriveTopicClusters(rows);
  var rec = { version: 1, derived_at: (/* @__PURE__ */ new Date()).toISOString(), window_days: TOPIC_DERIVE_DAYS, docs: d.docs, clusters: d.clusters, template_terms: d.template_terms };
  try {
    await db.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES (?1, ?2, ?3, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at").bind(TOPIC_CACHE_KEY, JSON.stringify(rec), "TOPIC-CLUSTERS-DERIVED-1 (agent_issues 2281): topic clusters derived from ACCEPTed idea_proposals; re-derived daily by qnfo-cloud-ops idea-topic-metric").run();
  } catch (e) {
    cacheError = (cacheError ? cacheError + "; " : "") + "write: " + String(e && e.message || e).slice(0, 120);
  }
  return Object.assign(rec, { source: "derived", cache_error: cacheError });
}
__name(loadTopicClusters, "loadTopicClusters");
var DIVERSITY_MAX_SHARE = 0.5;
var DIVERSITY_MIN_N = 10;
var DIVERSITY_RELEASE_SCAN = 50;
var DIVERSITY_WINDOW_SQL = "replace(substr(created_at, 1, 19), 'T', ' ') >= datetime('now', '-30 day')";
var DIVERSITY_NOTE_RE = /^\[diversity hold [^\]]*\] ?/;
function proposalCluster(idea, clusters) {
  return topicCluster(idea, clusters);
}
__name(proposalCluster, "proposalCluster");
function diversityExempt(row) {
  var name = String(row && row.name || "");
  return /owner|rowan/i.test(name) || /^intake:/i.test(name) || String(row && row.contact || "") === "owner" || proposalKind(row) !== "generated";
}
__name(diversityExempt, "diversityExempt");
var OWNER_CORPUS_SCORE_MIN = 0;
function proposalKind(row) {
  var name = String(row && row.name || ""), contact = String(row && row.contact || "");
  if (name === "owner-corpus") return "corpus";
  if (/^intake:/i.test(name)) return "generated";
  if (/^(owner|rowan)/i.test(name) || name === "chat-session" || contact === "owner" || /^rowan/i.test(contact)) return "direct";
  return "generated";
}
__name(proposalKind, "proposalKind");
function ownerDecision(kind, s) {
  var r = Object.assign({}, s);
  if (kind === "direct") {
    r.decision = "ACCEPT";
    r.rationale = "[owner-authored: accepted, OWNER-SIGNAL-INTAKE-1] " + (s.rationale || "");
  } else if (kind === "corpus") {
    var ok = s.decision === "ACCEPT" || Number(s.score) >= OWNER_CORPUS_SCORE_MIN;
    r.decision = ok ? "ACCEPT" : "HOLD";
    r.rationale = "[owner notebook, bar " + OWNER_CORPUS_SCORE_MIN + "] " + (s.rationale || "");
  }
  return r;
}
__name(ownerDecision, "ownerDecision");
async function acceptedMix(env) {
  var topics = await loadTopicClusters(env.QNFO_AUDIT, false);
  var rs = (await env.QNFO_AUDIT.prepare("SELECT idea, rationale FROM idea_proposals WHERE decision = 'ACCEPT' AND " + DIVERSITY_WINDOW_SQL).all()).results || [];
  var mix = { n: rs.length, by: /* @__PURE__ */ Object.create(null), foundational: 0, clusters: topics.clusters || [], topics: { source: topics.source, derived_at: topics.derived_at, docs: topics.docs, cache_error: topics.cache_error || null } };
  rs.forEach(function(r) {
    var k = proposalCluster(r.idea, mix.clusters);
    mix.by[k] = (mix.by[k] || 0) + 1;
    if (/foundational-quota/.test(String(r.rationale || ""))) mix.foundational++;
  });
  return mix;
}
__name(acceptedMix, "acceptedMix");
function diversityBlocks(mix, cluster) {
  if (!mix.clusters || !mix.clusters.length) return false;
  return mix.n >= DIVERSITY_MIN_N && ((mix.by[cluster] || 0) + 1) / (mix.n + 1) > DIVERSITY_MAX_SHARE;
}
__name(diversityBlocks, "diversityBlocks");
function mixShare(mix) {
  var top = null;
  Object.keys(mix.by).forEach(function(k) {
    if (top === null || mix.by[k] > mix.by[top]) top = k;
  });
  return { n: mix.n, top, share: mix.n ? Math.round(1e3 * mix.by[top] / mix.n) / 1e3 : null, by_cluster: Object.assign({}, mix.by), clusters: (mix.clusters || []).map(function(c) {
    return c.label;
  }), topics: mix.topics || null };
}
__name(mixShare, "mixShare");
async function enqueueAccepted(env, id, idea, score, now) {
  try {
    var qcap = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM research_queue WHERE status IN ('queued','researching','review','deferred')").first();
    if (qcap && Number(qcap.n) >= RESEARCH_ADMISSION_CAP) {
      await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET status='triaged_hold', rationale=substr('[research admission cap ' || ?1 || '/' || ?2 || '] ' || COALESCE(rationale, ''), 1, 2000) WHERE id=?").bind(String(qcap.n), String(RESEARCH_ADMISSION_CAP), String(id)).run();
      return false;
    }
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "enqueueAccepted", error: String(e && e.message || e).slice(0, 300) }));
  }
  await env.QNFO_AUDIT.prepare("INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at) VALUES (?1,'proposal',?2,?3,'',?4,?5,'queued',?6)").bind(crypto.randomUUID(), String(id), String(idea || "").slice(0, 3e3), score, "ACCEPT", now).run();
  return true;
}
__name(enqueueAccepted, "enqueueAccepted");
async function diversityRelease(env, mix, breached, out) {
  var now = (/* @__PURE__ */ new Date()).toISOString();
  var ex = await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET status = 'triaged_hold', decision = 'HOLD', triaged_at = ?1, rationale = substr('[diversity hold expired: left the 30-day window] ' || COALESCE(rationale, ''), 1, 2000) WHERE status = 'deferred_diversity' AND NOT COALESCE(" + DIVERSITY_WINDOW_SQL + ", 0)").bind(now).run();
  out.diversity_expired = Number(ex && ex.meta && ex.meta.changes) || 0;
  var held = (await env.QNFO_AUDIT.prepare("SELECT id, name, idea, rationale, score FROM idea_proposals WHERE status = 'deferred_diversity' AND " + DIVERSITY_WINDOW_SQL + " ORDER BY score DESC, created_at ASC LIMIT ?1").bind(DIVERSITY_RELEASE_SCAN).all()).results || [];
  for (var i = 0; i < held.length && out.diversity_released < TRIAGE_BATCH; i++) {
    var h = held[i], rationale = String(h.rationale || "").replace(DIVERSITY_NOTE_RE, ""), k = proposalCluster(h.idea, mix.clusters);
    if (diversityBlocks(mix, k)) continue;
    var up = await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision = 'ACCEPT', status = 'triaged_accepted', rationale = ?1, triaged_at = ?2 WHERE id = ?3 AND status = 'deferred_diversity'").bind(rationale, now, h.id).run();
    if (!(Number(up && up.meta && up.meta.changes) > 0)) continue;
    await enqueueAccepted(env, h.id, h.idea, h.score, now);
    mix.n++;
    mix.by[k] = (mix.by[k] || 0) + 1;
    out.diversity_released++;
    out.accepted++;
  }
}
__name(diversityRelease, "diversityRelease");
async function triageProposals(env) {
  var out = { triaged: 0, accepted: 0, errors: 0, deferred: 0, released: 0, diversity_held: 0, diversity_released: 0, diversity_expired: 0, novelty: { screened: 0, held: 0, foundational_quota: 0, unscreened: 0, last_error: null } };
  var budget = await aiBudgetBreach(env);
  out.budget_breached = budget.breached;
  out.lean = budget.breached;
  {
    try {
      var rel = await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET status='new' WHERE id IN (SELECT id FROM idea_proposals WHERE status='deferred_budget' ORDER BY created_at ASC LIMIT ?1)").bind(TRIAGE_BATCH).run();
      out.released = Number(rel && rel.meta && rel.meta.changes) || 0;
    } catch (e) {
      out.errors++;
    }
  }
  var rows = (await env.QNFO_AUDIT.prepare("SELECT id, idea, name, contact FROM idea_proposals WHERE status='new' ORDER BY created_at ASC LIMIT ?1").bind(TRIAGE_BATCH).all()).results || [];
  var mix = null;
  try {
    mix = await acceptedMix(env);
  } catch (e) {
    out.errors++;
  }
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i], now = (/* @__PURE__ */ new Date()).toISOString();
    try {
      var kind = proposalKind(row);
      var internal = row.name === "think-loop" || row.name === "auto-reentry" || row.name === "ask-gap" || kind === "corpus";
      if (isNoise(row.idea) || !internal && isQuestion(row.idea)) {
        await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision='HOLD', rationale=?, triaged_at=?, status='triaged_hold' WHERE id=?").bind("noise/question filter", now, row.id).run();
        out.triaged++;
        continue;
      }
      var s = await scoreIdea(env, row.idea, budget.breached);
      if (s.error && kind !== "direct") {
        out.errors++;
        continue;
      }
      if (s.error) s = { score: null, decision: "HOLD", rationale: "scoring unavailable: " + String(s.error).slice(0, 80) };
      s = ownerDecision(kind, s);
      if (kind !== "generated") out.owner_accepted = (out.owner_accepted || 0) + (s.decision === "ACCEPT" ? 1 : 0);
      var fq = false;
      if (s.decision === "ACCEPT" && kind === "generated") {
        var nv = await noveltyScreen(env, row.idea, mix, budget.breached);
        if (!nv.screened) {
          out.novelty.unscreened++;
          out.novelty.last_error = String(nv.error || "").slice(0, 300);
        } else {
          out.novelty.screened++;
          if (nv.errors && nv.errors.length) out.novelty.last_error = nv.errors.join("; ").slice(0, 300);
          s.rationale = nv.tag + " " + (s.rationale || "");
          if (nv.hold) {
            s.decision = "HOLD";
            out.novelty.held++;
          } else if (nv.foundational_quota) {
            fq = true;
            out.novelty.foundational_quota++;
          }
        }
      }
      var cluster = s.decision === "ACCEPT" ? proposalCluster(row.idea, mix ? mix.clusters : []) : null;
      if (cluster && mix && !diversityExempt(row) && mix.n >= DIVERSITY_MIN_N && ((mix.by[cluster] || 0) + 1) / (mix.n + 1) > DIVERSITY_MAX_SHARE) {
        var pct = Math.round(100 * ((mix.by[cluster] || 0) + 1) / (mix.n + 1));
        await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision='DEFER-DIVERSITY', score=?, rationale=?, triaged_at=?, status='deferred_diversity' WHERE id=?").bind(s.score, "[diversity hold " + now.slice(0, 16) + "Z: " + cluster + " would be " + pct + "% of 30-day accepts, cap " + Math.round(100 * DIVERSITY_MAX_SHARE) + "%] " + (s.rationale || ""), now, row.id).run();
        out.triaged++;
        out.diversity_held++;
        continue;
      }
      await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision=?, score=?, rationale=?, triaged_at=?, status=? WHERE id=?").bind(s.decision, s.score, s.rationale || "", now, s.decision === "ACCEPT" ? "triaged_accepted" : "triaged_hold", row.id).run();
      out.triaged++;
      if (s.decision === "ACCEPT") {
        await enqueueAccepted(env, row.id, row.idea, s.score, now);
        out.accepted++;
        if (mix) {
          mix.n++;
          mix.by[cluster] = (mix.by[cluster] || 0) + 1;
          if (fq) mix.foundational++;
        }
      }
    } catch (e) {
      out.errors++;
    }
  }
  if (mix) {
    try {
      await diversityRelease(env, mix, false, out);
    } catch (e) {
      out.errors++;
    }
    out.diversity = mixShare(mix);
  }
  try {
    var dc = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status='deferred_budget'").first();
    out.deferred_total = Number(dc && dc.n) || 0;
    var dd = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status='deferred_diversity'").first();
    out.diversity_held_total = Number(dd && dd.n) || 0;
    var at = (/* @__PURE__ */ new Date()).toISOString();
    await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES ('idea-triage-budget', ?1, 'idea-triage-budget', ?2, ?3, 'idea-hub', ?4)").bind(at, "idea triage: " + (budget.breached ? "AI budget caps breached, scored lean on one cheap model; " : "caps clear; ") + out.released + " released, " + out.triaged + " triaged, " + out.deferred_total + " waiting as deferred_budget, " + out.diversity_held_total + " as deferred_diversity", JSON.stringify({ version: VERSION, breached: budget.breached, caps: budget.caps, deferred_run: out.deferred, released_run: out.released, deferred_total: out.deferred_total, triaged_run: out.triaged, diversity_held_run: out.diversity_held, diversity_released_run: out.diversity_released, diversity_expired_run: out.diversity_expired, diversity_held_total: out.diversity_held_total, diversity: out.diversity || null, novelty: out.novelty }), budget.breached ? "lean" : "ok").run();
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "triageProposals", error: String(e && e.message || e).slice(0, 300) }));
  }
  try {
    var osm = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN p.name = 'owner-corpus' OR p.name LIKE 'owner%' OR p.name LIKE 'rowan%' OR p.name = 'chat-session' OR p.contact = 'owner' OR p.contact LIKE 'rowan%' THEN 1 ELSE 0 END) AS own FROM research_queue q LEFT JOIN idea_proposals p ON q.source = 'proposal' AND CAST(p.id AS TEXT) = q.source_id WHERE replace(substr(q.created_at, 1, 19), 'T', ' ') >= datetime('now', '-30 day') AND q.source <> 'diagnostic'").first();
    var osn = Number(osm && osm.n) || 0, oso = Number(osm && osm.own) || 0;
    out.owner_signal_share_30d = osn ? Math.round(1e3 * oso / osn) / 1e3 : 0;
    await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2 WHERE metric = 'owner_signal_share_30d'").bind(String(out.owner_signal_share_30d), (/* @__PURE__ */ new Date()).toISOString()).run();
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "triageProposals", error: String(e && e.message || e).slice(0, 300) }));
  }
  console.log("BUDGET-SOFT-ROUTE-1 idea-triage " + JSON.stringify(out));
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO fleet_heartbeat (worker, version, ts, ok) VALUES ('idea-hub', ?1, ?2, ?3) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind(VERSION, (/* @__PURE__ */ new Date()).toISOString(), out.errors ? 0 : 1).run();
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "triageProposals", error: String(e && e.message || e).slice(0, 300) }));
  }
  return out;
}
__name(triageProposals, "triageProposals");
var REENTRY_BATCH = 20;
var CONSUME_SIGNALS = 2;
var CONSUME_QUESTIONS = 3;
var PROPOSAL_BACKPRESSURE = 30;
var PROPOSAL_FILL_TO = 25;
async function proposalRoom(env) {
  var p = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status IN ('new', 'deferred_budget')").first().catch(function(e) {
    console.error("idea-hub proposalRoom: " + String(e && e.message || e).slice(0, 160));
    return null;
  });
  return p ? PROPOSAL_FILL_TO - Number(p.n) : null;
}
__name(proposalRoom, "proposalRoom");
var RESCORE_BATCH = 10;
var REENTRY_NOQ_TTL_H = 20;
var REENTRY_TTL_DAYS = 7;
var REENTRY_EXPIRE_BATCH = 50;
var PAPER_KEY_SQL = "COALESCE(NULLIF(doi, ''), slug)";
var REENTRY_OWNER_TYPES = ["slug", "doi", "internal", "owner", "zenodo"];
var REENTRY_BOUNDARY_SOURCE = "artifact_reentry_owner";
function extractOpenQuestions(bodyMd) {
  if (!bodyMd) return [];
  var text = String(bodyMd), out = [], seen = /* @__PURE__ */ new Set();
  var push = /* @__PURE__ */ __name(function(x) {
    var t = String(x).replace(/\s+/g, " ").replace(/^[\s*\-\d.]+/, "").trim();
    if (t.length < 15 || t.length > 320) return;
    var k = t.slice(0, 80).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    if (out.length < 15) out.push(t);
  }, "push");
  var m = text.match(/##?\s*(Open Questions?|Open Problems?|Future Work|Future Directions?|Limitations?|Outlook|Unresolved|Discussion)[\s\S]{0,4000}/i);
  if (m) m[0].split("\n").forEach(function(l) {
    if (/^\s*([-*]|\d+\.)\s+\S/.test(l)) push(l);
  });
  (text.match(/[^.\n]{12,300}?(open question|remains? open|open problem|unresolved|future work|not yet (known|understood|resolved|established)|unknown whether|remains? to be)[^.\n]{0,240}[.?]/gi) || []).forEach(push);
  (text.match(/[^.\n?]{25,300}\?/g) || []).forEach(push);
  return out;
}
__name(extractOpenQuestions, "extractOpenQuestions");
async function reentryPermitted(env) {
  try {
    var b = await env.QNFO_AUDIT.prepare("SELECT permitted FROM signal_worker_boundary WHERE worker='idea-hub' AND source='" + REENTRY_BOUNDARY_SOURCE + "'").first();
    return !!b && Number(b.permitted) === 1;
  } catch (e) {
    return false;
  }
}
__name(reentryPermitted, "reentryPermitted");
async function runReentry(env) {
  var out = { scanned: 0, emitted: 0, errors: 0, permitted: await reentryPermitted(env) };
  var papers = [], have = /* @__PURE__ */ new Set();
  if (out.permitted) {
    var ownDois = (await ownerPipelineDois(env)).slice(0, 200);
    papers = (await env.LIVING_PAPER.prepare("SELECT " + PAPER_KEY_SQL + " AS doi, title FROM papers WHERE " + PAPER_KEY_SQL + " IS NOT NULL AND " + PAPER_KEY_SQL + " != '' AND body_md IS NOT NULL AND body_md != '' AND status IN ('published','distributed') AND (identifier_type IN (" + REENTRY_OWNER_TYPES.map(function() {
      return "?";
    }).join(",") + ")" + (ownDois.length ? " OR " + PAPER_KEY_SQL + " IN (" + ownDois.map(function() {
      return "?";
    }).join(",") + ")" : "") + ") ORDER BY created_at DESC LIMIT 500").bind(...REENTRY_OWNER_TYPES, ...ownDois).all()).results || [];
    have = new Set(((await env.QNFO_AUDIT.prepare("SELECT source_ref FROM signals WHERE source='artifact_reentry'").all()).results || []).map(function(r) {
      return String(r.source_ref);
    }));
  } else out.emit_paused = "signal_worker_boundary idea-hub/" + REENTRY_BOUNDARY_SOURCE + " not permitted";
  out.scanned = papers.length;
  var todo = papers.filter(function(p2) {
    return !have.has(String(p2.doi));
  }).slice(0, REENTRY_BATCH);
  for (var i = 0; i < todo.length; i++) {
    var p = todo[i];
    try {
      var pr = await env.LIVING_PAPER.prepare("SELECT substr(body_md, 1, 12000) AS b FROM papers WHERE " + PAPER_KEY_SQL + " = ? LIMIT 1").bind(p.doi).first();
      var oq = extractOpenQuestions(pr && pr.b || "");
      var now = (/* @__PURE__ */ new Date()).toISOString();
      await env.QNFO_AUDIT.prepare("INSERT OR IGNORE INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("artifact_reentry:" + String(p.doi).replace(/[^a-z0-9]+/gi, "-").slice(0, 80), now, "artifact_reentry", p.doi, String(p.title || "").slice(0, 500), JSON.stringify(oq), oq.length ? 0.9 : 0, "research", "new", now).run();
      out.emitted++;
    } catch (e) {
      out.errors++;
    }
  }
  out.rescored = 0;
  out.expired = 0;
  out.expired_noq = 0;
  out.expired_stale = 0;
  var nowMs = Date.now(), cutNoq = new Date(nowMs - REENTRY_NOQ_TTL_H * 36e5).toISOString();
  try {
    var st = await env.QNFO_AUDIT.prepare("UPDATE signals SET status='expired', decision=?1, ts=?2 WHERE id IN (SELECT id FROM signals WHERE source='artifact_reentry' AND status='new' AND COALESCE(evidential_weight,0) > 0 AND created_at < ?3 ORDER BY created_at ASC LIMIT ?4)").bind("idea-hub " + VERSION + ": REENTRY-DRAIN-1 not consumed within " + REENTRY_TTL_DAYS + " days (consume leg paused or backed up); open_questions kept", (/* @__PURE__ */ new Date()).toISOString(), new Date(nowMs - REENTRY_TTL_DAYS * 864e5).toISOString(), REENTRY_EXPIRE_BATCH).run();
    out.expired_stale = Number(st && st.meta && st.meta.changes) || 0;
  } catch (e) {
    out.errors++;
  }
  var old0 = (await env.QNFO_AUDIT.prepare("SELECT id, source_ref FROM signals WHERE source='artifact_reentry' AND status='new' AND COALESCE(evidential_weight,0)=0 AND created_at < ?1 ORDER BY created_at ASC LIMIT ?2").bind(cutNoq, REENTRY_EXPIRE_BATCH).all()).results || [];
  if (old0.length) {
    var refs = old0.map(function(r) {
      return String(r.source_ref);
    }), bodies = /* @__PURE__ */ new Map();
    try {
      var pb = (await env.LIVING_PAPER.prepare("SELECT " + PAPER_KEY_SQL + " AS doi, substr(body_md, 1, 12000) AS b FROM papers WHERE " + PAPER_KEY_SQL + " IN (" + refs.map(function() {
        return "?";
      }).join(",") + ")").bind(...refs).all()).results || [];
      pb.forEach(function(r) {
        var k = String(r.doi);
        if (!bodies.has(k) || !bodies.get(k) && r.b) bodies.set(k, r.b || "");
      });
    } catch (e) {
      out.errors++;
      old0 = [];
    }
    for (var x = 0; x < old0.length; x++) {
      var so = old0[x], ref = String(so.source_ref), nowX = (/* @__PURE__ */ new Date()).toISOString();
      try {
        if (!bodies.has(ref)) {
          await env.QNFO_AUDIT.prepare("UPDATE signals SET status='expired', decision=?, ts=? WHERE id=? AND status='new'").bind("idea-hub " + VERSION + ": paper " + ref.slice(0, 80) + " not in living-paper", nowX, so.id).run();
          out.expired++;
          continue;
        }
        var oqx = extractOpenQuestions(bodies.get(ref));
        if (oqx.length) {
          await env.QNFO_AUDIT.prepare("UPDATE signals SET open_questions=?, evidential_weight=0.9, ts=? WHERE id=?").bind(JSON.stringify(oqx), nowX, so.id).run();
          out.rescored++;
          continue;
        }
        await env.QNFO_AUDIT.prepare("UPDATE signals SET status='expired', decision=?, ts=? WHERE id=? AND status='new'").bind("idea-hub " + VERSION + ": REENTRY-DRAIN-1 no open question found in the paper after " + REENTRY_NOQ_TTL_H + " h of re-checks (a weight-0 signal is never consumed)", nowX, so.id).run();
        out.expired_noq++;
      } catch (e) {
        out.errors++;
      }
    }
  }
  var zero = (await env.QNFO_AUDIT.prepare("SELECT id, source_ref FROM signals WHERE source='artifact_reentry' AND status='new' AND COALESCE(evidential_weight,0)=0 AND created_at >= ?1 ORDER BY ts ASC LIMIT ?2").bind(cutNoq, RESCORE_BATCH).all()).results || [];
  for (var z = 0; z < zero.length; z++) {
    var sg = zero[z], nowZ = (/* @__PURE__ */ new Date()).toISOString();
    try {
      var pz = await env.LIVING_PAPER.prepare("SELECT substr(body_md, 1, 12000) AS b FROM papers WHERE " + PAPER_KEY_SQL + " = ? LIMIT 1").bind(sg.source_ref).first();
      if (!pz) {
        await env.QNFO_AUDIT.prepare("UPDATE signals SET status='expired', decision=?, ts=? WHERE id=?").bind("idea-hub " + VERSION + ": paper " + String(sg.source_ref).slice(0, 80) + " not in living-paper", nowZ, sg.id).run();
        out.expired++;
        continue;
      }
      var oqz = extractOpenQuestions(pz.b || "");
      if (oqz.length) {
        await env.QNFO_AUDIT.prepare("UPDATE signals SET open_questions=?, evidential_weight=0.9, ts=? WHERE id=?").bind(JSON.stringify(oqz), nowZ, sg.id).run();
        out.rescored++;
      } else await env.QNFO_AUDIT.prepare("UPDATE signals SET ts=? WHERE id=?").bind(nowZ, sg.id).run();
    } catch (e) {
      out.errors++;
    }
  }
  return out;
}
__name(runReentry, "runReentry");
var OWNER_PROPOSAL_SQL = "p.name = 'owner-corpus' OR p.name LIKE 'owner%' OR p.name LIKE 'rowan%' OR p.name = 'chat-session' OR p.contact = 'owner' OR p.contact LIKE 'rowan%'";
async function ownerPipelineDois(env) {
  try {
    var rs = (await env.QNFO_AUDIT.prepare("SELECT DISTINCT COALESCE(NULLIF(q.doi, ''), q.paper_slug) AS doi FROM research_queue q JOIN idea_proposals p ON q.source = 'proposal' AND CAST(p.id AS TEXT) = q.source_id WHERE q.status = 'published' AND COALESCE(NULLIF(q.doi, ''), q.paper_slug) IS NOT NULL AND COALESCE(NULLIF(q.doi, ''), q.paper_slug) <> '' AND (" + OWNER_PROPOSAL_SQL + ")").all()).results || [];
    return rs.map(function(r) {
      return String(r.doi);
    });
  } catch (e) {
    return [];
  }
}
__name(ownerPipelineDois, "ownerPipelineDois");
async function ownerPaper(env, doi) {
  if (!env.LIVING_PAPER || !doi) return false;
  if ((await ownerPipelineDois(env)).indexOf(String(doi)) >= 0) return true;
  try {
    var p = await env.LIVING_PAPER.prepare("SELECT identifier_type FROM papers WHERE " + PAPER_KEY_SQL + " = ?1 AND identifier_type IN (" + REENTRY_OWNER_TYPES.map(function() {
      return "?";
    }).join(",") + ") LIMIT 1").bind(String(doi), ...REENTRY_OWNER_TYPES).first();
    return !!p;
  } catch (e) {
    return false;
  }
}
__name(ownerPaper, "ownerPaper");
function realQuestion(t) {
  t = String(t || "").trim();
  if (/\?\s*$/.test(t)) return true;
  return /\b(whether|remains? (open|unknown|unresolved|to be (shown|determined|established))|unresolved|not yet (known|understood|resolved|established)|open problem)\b/i.test(t) && !/\b(we|this paper|this note) (flag|leave|treat|mark)\b/i.test(t);
}
__name(realQuestion, "realQuestion");
var REENTRY_NONOWNER_PER_DAY = 2;
var CONSUME_WINDOW = 20;
var REENTRY_NONOWNER_MARK = "HOLD-RELEASE-REENTRY-1 non-owner";
async function runConsume(env) {
  var out = { consumed: 0, proposals: 0, paused: false, errors: 0 };
  var pending = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE status IN ('new','deferred_budget')").first();
  if (pending && Number(pending.n) > PROPOSAL_BACKPRESSURE) {
    out.paused = true;
    return out;
  }
  var room = pending ? PROPOSAL_FILL_TO - Number(pending.n) : null;
  if (room !== null && room <= 0) {
    out.paused = true;
    out.room = room;
    return out;
  }
  var b = await env.QNFO_AUDIT.prepare("SELECT permitted FROM signal_worker_boundary WHERE worker='idea-hub' AND source='" + REENTRY_BOUNDARY_SOURCE + "'").first();
  if (!b || Number(b.permitted) !== 1) {
    out.paused = true;
    return out;
  }
  var rows = (await env.QNFO_AUDIT.prepare("SELECT id, source_ref, open_questions FROM signals WHERE source='artifact_reentry' AND status='new' AND evidential_weight > 0 ORDER BY created_at LIMIT ?1").bind(CONSUME_WINDOW).all()).results || [];
  var dayStart = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + "T00:00:00Z";
  var nonOwnerToday = 0;
  try {
    var nt = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM signals WHERE source='artifact_reentry' AND status='consumed' AND instr(COALESCE(decision, ''), ?1) > 0 AND ts >= ?2").bind(REENTRY_NONOWNER_MARK, dayStart).first();
    nonOwnerToday = nt ? Number(nt.n) : 0;
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "runConsume", error: String(e && e.message || e).slice(0, 300) }));
  }
  for (var i = 0; i < rows.length && out.consumed < CONSUME_SIGNALS; i++) {
    var sg = rows[i], oq = [], nonOwner = false;
    try {
      oq = JSON.parse(sg.open_questions || "[]");
    } catch (e) {
      console.error(JSON.stringify({ worker: "idea-hub", where: "runConsume", error: String(e && e.message || e).slice(0, 300) }));
    }
    if (!await ownerPaper(env, sg.source_ref)) {
      if (nonOwnerToday >= REENTRY_NONOWNER_PER_DAY) {
        out.deferred_not_owner = (out.deferred_not_owner || 0) + 1;
        continue;
      }
      nonOwner = true;
    }
    var ok = true;
    var qs = Array.isArray(oq) ? oq.filter(realQuestion).slice(0, CONSUME_QUESTIONS) : [];
    if (room !== null && qs.length > room - out.proposals) {
      out.room_left = room - out.proposals;
      break;
    }
    for (var j = 0; j < qs.length; j++) {
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES (?,?,?,?,?,?)").bind("auto-reentry", "Re-entry from " + String(sg.source_ref || "").slice(0, 120) + ": " + String(qs[j]).slice(0, 1800), "auto", "new", "l8-reentry", (/* @__PURE__ */ new Date()).toISOString()).run();
        out.proposals++;
      } catch (e) {
        out.errors++;
        ok = false;
      }
    }
    if (ok) {
      await env.QNFO_AUDIT.prepare("UPDATE signals SET status='consumed', decision=?, ts=? WHERE id=?").bind("idea-hub " + VERSION + ": " + (nonOwner ? REENTRY_NONOWNER_MARK + ": " : "") + qs.length + " of " + oq.length + " open questions proposed", (/* @__PURE__ */ new Date()).toISOString(), sg.id).run();
      if (nonOwner) nonOwnerToday++;
      out.consumed++;
    }
  }
  return out;
}
__name(runConsume, "runConsume");
var THINK_SEED_N = 3;
async function thinkSeed(env) {
  var rows = [];
  try {
    rows = (await env.QNFO_AUDIT.prepare("SELECT idea FROM idea_proposals WHERE decision='ACCEPT' AND (name='owner-corpus' OR contact='owner' OR name LIKE 'rowan%' OR name LIKE 'owner%') ORDER BY random() LIMIT ?1").bind(THINK_SEED_N).all()).results || [];
  } catch (e) {
    console.error(JSON.stringify({ worker: "idea-hub", where: "thinkSeed", error: String(e && e.message || e).slice(0, 300) }));
  }
  if (!rows.length) {
    var recentQs = [];
    try {
      recentQs = ((await env.QNFO_AUDIT.prepare("SELECT question FROM self_questions ORDER BY id DESC LIMIT 12").all()).results || []).map(function(r) {
        return String(r.question || "").replace(/\s+/g, " ").slice(0, 200);
      }).filter(Boolean);
    } catch (e) {
      console.error(JSON.stringify({ worker: "idea-hub", where: "thinkSeed", error: String(e && e.message || e).slice(0, 300) }));
    }
    return "Generate one novel research question that fills a gap in the existing QNFO corpus." + (recentQs.length ? " Questions already asked recently (cover different ground from all of them):\n" + recentQs.map(function(q) {
      return "- " + q;
    }).join("\n") : "");
  }
  return "The author's own lines of work:\n" + rows.map(function(r) {
    return "- " + String(r.idea || "").replace(/\s+/g, " ").slice(0, 500);
  }).join("\n") + "\n\nPropose ONE novel, falsifiable question that extends one of these lines or connects two of them. Stay in the author's own terms and fields.";
}
__name(thinkSeed, "thinkSeed");
var OWNER_CORPUS_BATCH = 10;
var OWNER_CORPUS_SLOW_BATCH = 2;
var OWNER_CORPUS_MIN_CHARS = 600;
var OWNER_CORPUS_EXCERPT = 7e3;
var OWNER_CORPUS_RQ_CAP = 12;
var RESEARCH_ADMISSION_CAP = 120;
var OWNER_CORPUS_FLEET_ERA = "notes/v1/2026/08";
var OWNER_CORPUS_TYPES = ["note", "synthesis", "synthesis-working-draft", "development-note", "lesson"];
var OWNER_NOTE_RETRY_MIN = 120;
var OWNER_CORPUS_MODEL = "@cf/zai-org/glm-5.3-flash";
var OWNER_CORPUS_PROMPT = 'You read one note from the private research notebook of Rowan Brad Quni-Gudzinas, an independent researcher. Extract the single strongest ORIGINAL research idea the author is developing in it: a claim, conjecture or question that a theoretical or computational paper could investigate. Ignore assistant boilerplate, chat pleasantries, task lists, system prompts and operations notes. Return JSON only, either {"title": "<= 14 words", "idea": "<= 160 words: the claim or question, why it matters, and how a derivation, simulation or formal analysis could test it"} or {"none": "<= 15 words why"} when the note holds no research idea.\n\nNOTE:\n';
function corpusBody(t) {
  return String(t || "").replace(/^---\n[\s\S]*?\n---\n/, "").replace(/\r/g, "").trim();
}
__name(corpusBody, "corpusBody");
async function shortHash(s) {
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(d)).slice(0, 8).map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
__name(shortHash, "shortHash");
async function runOwnerCorpus(env) {
  var out = { ok: true, picked: 0, proposed: 0, none: 0, short: 0, missing: 0, errors: 0 };
  if (!env.VAULT) {
    out.ok = false;
    out.why = "VAULT binding absent";
    return out;
  }
  var pending = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE status IN ('new','deferred_budget')").first();
  if (pending && Number(pending.n) > PROPOSAL_BACKPRESSURE) {
    out.paused = "proposal backpressure";
    return out;
  }
  var rq = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM research_queue WHERE status IN ('queued','researching','review','deferred')").first();
  var batch = OWNER_CORPUS_BATCH;
  if (rq && Number(rq.n) >= OWNER_CORPUS_RQ_CAP) {
    batch = OWNER_CORPUS_SLOW_BATCH;
    out.slowed = "research_queue at " + rq.n;
  }
  var room = await proposalRoom(env);
  if (room !== null) {
    if (room <= 0) {
      out.paused = "proposal headroom";
      out.room = room;
      return out;
    }
    if (room < batch) {
      batch = room;
      out.capped = "room " + room;
    }
  }
  await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS owner_corpus_seen (path TEXT PRIMARY KEY, sig TEXT, ts TEXT, outcome TEXT, proposal_id INTEGER, note TEXT)").run();
  var rows = (await env.QNFO_AUDIT.prepare("SELECT n.path, n.sig, s.outcome AS prev FROM notes_intake n LEFT JOIN owner_corpus_seen s ON s.path = n.path WHERE (s.path IS NULL OR (s.outcome IN ('error', 'error1', 'error2') AND s.ts < ?)) AND n.type IN (" + OWNER_CORPUS_TYPES.map(function() {
    return "?";
  }).join(",") + ") AND n.path LIKE 'notes/%' AND COALESCE(n.status, '') NOT IN ('archived', 'done') ORDER BY CASE WHEN n.path GLOB 'notes/v1/20[0-9][0-9]/*' THEN 0 ELSE 1 END, CASE WHEN n.path < ? THEN 0 ELSE 1 END, n.path DESC LIMIT ?").bind(new Date(Date.now() - OWNER_NOTE_RETRY_MIN * 6e4).toISOString(), ...OWNER_CORPUS_TYPES, OWNER_CORPUS_FLEET_ERA, batch).all()).results || [];
  for (var i = 0; i < rows.length; i++) {
    var n = rows[i], now = (/* @__PURE__ */ new Date()).toISOString(), outcome = "error", pid = null, note = "";
    out.picked++;
    try {
      var obj = await env.VAULT.get(n.path);
      if (!obj) {
        outcome = "missing";
        out.missing++;
      } else {
        var body = corpusBody(await obj.text());
        if (body.length < OWNER_CORPUS_MIN_CHARS) {
          outcome = "short";
          out.short++;
        } else {
          var ai = await aiRunAttr(env, "idea-hub", "owner-corpus", OWNER_CORPUS_MODEL, { messages: [{ role: "user", content: OWNER_CORPUS_PROMPT + body.slice(0, OWNER_CORPUS_EXCERPT) }], max_tokens: REASONING_MAX_TOKENS, temperature: 0.2, reasoning_effort: "low" });
          var m = tExtract(ai).match(/\{[\s\S]*\}/), j = null;
          if (m) {
            try {
              j = JSON.parse(m[0]);
            } catch (e) {
            }
          }
          if (j && j.idea && String(j.idea).trim().length >= 40) {
            var idea = (j.title ? String(j.title).trim().replace(/[.\s]+$/, "") + ". " : "") + String(j.idea).trim().slice(0, 1600) + "\n\nSource: owner notebook " + n.path;
            var tag = "corpus:" + await shortHash(n.path);
            var seen = await env.QNFO_AUDIT.prepare("SELECT id FROM idea_proposals WHERE ip_hash = ?1 LIMIT 1").bind(tag).first();
            if (seen) pid = seen.id;
            else {
              var ins = await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES ('owner-corpus', ?1, 'owner', 'new', ?2, ?3)").bind(idea, tag, now).run();
              pid = ins && ins.meta && ins.meta.last_row_id || null;
            }
            outcome = "proposed";
            out.proposed++;
          } else if (j && j.none) {
            outcome = "none";
            note = String(j.none).slice(0, 200);
            out.none++;
          } else {
            outcome = "error";
            note = "unparseable model reply";
            out.errors++;
          }
        }
      }
    } catch (e) {
      outcome = "error";
      note = String(e && e.message || e).slice(0, 200);
      out.errors++;
    }
    if (outcome === "error") {
      var tries = /^error(\d)$/.exec(String(n.prev || ""));
      outcome = "error" + Math.min(3, (tries ? Number(tries[1]) : n.prev === "error" ? 1 : 0) + 1);
    }
    try {
      await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO owner_corpus_seen (path, sig, ts, outcome, proposal_id, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(n.path, n.sig || null, now, outcome, pid, note).run();
    } catch (e) {
      out.errors++;
    }
  }
  return out;
}
__name(runOwnerCorpus, "runOwnerCorpus");
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
  if (m) {
    try {
      q = JSON.parse(m[0]);
    } catch (e) {
    }
  }
  if (!q || !q.question) {
    var qm = text.match(/"question"\s*:\s*"([^"]+)"/);
    if (qm) q = { question: qm[1], hypothesis: "" };
  }
  if (!q || !q.question) return { ok: false, why: "no parseable question" };
  var sig = /* @__PURE__ */ __name(function(x) {
    var o = /* @__PURE__ */ new Set();
    String(x || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).forEach(function(w) {
      if (w.length > 4) o.add(w);
    });
    return o;
  }, "sig");
  var contain = /* @__PURE__ */ __name(function(a, b) {
    if (!a.size || !b.size) return 0;
    var n = 0;
    a.forEach(function(x) {
      if (b.has(x)) n++;
    });
    return n / Math.min(a.size, b.size);
  }, "contain");
  var cand = sig(q.question);
  var recent = (await env.QNFO_AUDIT.prepare("SELECT question FROM self_questions WHERE status='open' AND ts >= ?1").bind(new Date(Date.now() - 7 * 864e5).toISOString()).all()).results || [];
  if (recent.some(function(r) {
    return contain(cand, sig(r.question)) >= 0.6;
  })) return { ok: true, skipped: "near-duplicate theme" };
  var now = (/* @__PURE__ */ new Date()).toISOString(), question = String(q.question).slice(0, 300);
  await env.QNFO_AUDIT.prepare("INSERT INTO self_questions (ts, question, hypothesis, source, status) VALUES (?1, ?2, ?3, 'think-loop', 'open')").bind(now, question, String(q.hypothesis || "").slice(0, 300)).run();
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(question));
  var qh = Array.from(new Uint8Array(d)).slice(0, 4).map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
  var existing = await env.QNFO_AUDIT.prepare("SELECT id FROM idea_proposals WHERE ip_hash = ?1 LIMIT 1").bind(qh).first();
  if (!existing) await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES ('think-loop', ?1, '', 'new', ?2, ?3)").bind(question, qh, now).run();
  return { ok: true, question, routed: !existing };
}
__name(thinkLoop, "thinkLoop");
var ASK_GAP_BATCH = 5;
async function runAskGap(env) {
  var out = { ok: true, candidates: 0, inserted: 0, skipped: 0 };
  var pending = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status IN ('new', 'deferred_budget')").first().catch(function() {
    return null;
  });
  if (pending && Number(pending.n) > PROPOSAL_BACKPRESSURE) {
    out.paused = true;
    return out;
  }
  var room = pending ? PROPOSAL_FILL_TO - Number(pending.n) : null;
  if (room !== null && room <= 0) {
    out.paused = true;
    out.room = room;
    return out;
  }
  var rows = (await env.QNFO_AUDIT.prepare("SELECT qhash, MIN(query) AS query, COUNT(*) AS n FROM ask_events WHERE uncovered = 1 AND COALESCE(cached, 0) = 0 AND error IS NULL AND query IS NOT NULL AND ts > datetime('now', '-7 days') GROUP BY qhash ORDER BY n DESC, MAX(ts) DESC LIMIT 25").all().catch(function() {
    return { results: [] };
  })).results || [];
  out.candidates = rows.length;
  for (var i = 0; i < rows.length && out.inserted < ASK_GAP_BATCH && (room === null || out.inserted < room); i++) {
    var q = clean(String(rows[i].query || "").replace(/^\[paper:[^\]]*\]\s*/, ""), 600);
    if (!publicTitle(q)) {
      out.skipped++;
      continue;
    }
    var tag = "ask-gap:" + String(rows[i].qhash || "").slice(0, 32);
    var seen = await env.QNFO_AUDIT.prepare("SELECT id FROM idea_proposals WHERE ip_hash = ?1 OR idea = ?2 LIMIT 1").bind(tag, q).first().catch(function() {
      return null;
    });
    if (seen) {
      out.skipped++;
      continue;
    }
    await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES ('ask-gap', ?1, '', 'new', ?2, datetime('now'))").bind(q, tag).run();
    out.inserted++;
  }
  return out;
}
__name(runAskGap, "runAskGap");
async function ideationCycle(env) {
  var r = {};
  try {
    r.reentry = await runReentry(env);
  } catch (e) {
    r.reentry = { error: String(e && e.message || e) };
  }
  try {
    r.consume = await runConsume(env);
  } catch (e) {
    r.consume = { error: String(e && e.message || e) };
  }
  try {
    r.askgap = await runAskGap(env);
  } catch (e) {
    r.askgap = { error: String(e && e.message || e) };
  }
  try {
    r.corpus = await runOwnerCorpus(env);
  } catch (e) {
    r.corpus = { error: String(e && e.message || e) };
  }
  if ((/* @__PURE__ */ new Date()).getUTCHours() % THINK_EVERY_H === 0) {
    try {
      r.think = await thinkLoop(env);
    } catch (e) {
      r.think = { error: String(e && e.message || e) };
    }
  }
  r.triage = await triageProposals(env);
  return r;
}
__name(ideationCycle, "ideationCycle");
function ideaText(s, max) {
  return stripInj(s).replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[redacted]").replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max || 2e5);
}
__name(ideaText, "ideaText");
function ideaReflow(s) {
  if (s.indexOf("\n") >= 0 || s.length < 300) return s;
  s = s.replace(/ (#{1,6}) (?=\S)/g, "\n\n$1 ").replace(/\| \|/g, "|\n|").replace(/ (```)/g, "\n$1").replace(/ - (?=\*\*)/g, "\n- ").replace(/([.:)]) (\d{1,2}\. )(?=\*\*|[A-Z])/g, "$1\n$2");
  return s.split("\n").map(function(l) {
    const m = /^(#{1,6} )(.*)$/.exec(l);
    if (!m) return l;
    const w = m[2].split(" ");
    for (let k = 1; k < Math.min(w.length - 1, 16); k++) {
      if (!/[A-Za-z]{2}/.test(w.slice(0, k).join(" "))) continue;
      const starter = /^(The|This|These|That|A|An|It|Its|Your|Before|After|We|There|Here|Each|Every|Most|What|When|Yes|No|In|For|To|Let|Suppose|Consider|Define|Take|Given|If|Assume|Write|Our|One|Two|Three)$/.test(w[k]);
      if (/^[A-Z][a-z]+[,;:]?$/.test(w[k]) && (starter || /^[a-z(]/.test(w[k + 1]) && !/^(and|or|of|the|in|on|for|to|vs\.?|with|as)$/.test(w[k + 1])) && !/^(and|or|of|the|a|an|in|on|to|for|vs\.?)$/i.test(w[k - 1])) {
        return m[1] + w.slice(0, k).join(" ") + "\n\n" + w.slice(k).join(" ");
      }
    }
    return m[2].length > 100 ? m[2] : l;
  }).join("\n").replace(/([^|\n]) (\| [^\n]*\|)\n(\|[-:| ]+\|)/g, "$1\n$2\n$3");
}
__name(ideaReflow, "ideaReflow");
function ideaShort(t, n) {
  t = String(t || "");
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, "") + "\u2026";
}
__name(ideaShort, "ideaShort");
function ideaTitle(t) {
  return String(t || "").replace(/^#+\s*/, "").replace(/^\d+\.\s+/, "").replace(/\*\*/g, "");
}
__name(ideaTitle, "ideaTitle");
function ideaInline(s) {
  return s.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>").replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="nofollow noopener">$1</a>').replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" rel="nofollow noopener">$2</a>');
}
__name(ideaInline, "ideaInline");
function ideaMd(src) {
  const lines = esc(ideaReflow(String(src || ""))).split("\n");
  const out = [];
  let para = [], list = null, fence = null;
  const flush = /* @__PURE__ */ __name(function() {
    if (para.length) {
      out.push("<p>" + ideaInline(para.join(" ")) + "</p>");
      para = [];
    }
    if (list) {
      out.push("<" + list.t + ">" + list.items.map(function(i) {
        return "<li>" + ideaInline(i) + "</li>";
      }).join("") + "</" + list.t + ">");
      list = null;
    }
  }, "flush");
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, "");
    if (fence !== null) {
      if (/^```/.test(l)) {
        out.push("<pre><code>" + fence.join("\n") + "</code></pre>");
        fence = null;
      } else fence.push(raw);
      continue;
    }
    if (/^```/.test(l)) {
      flush();
      fence = [];
      continue;
    }
    let m;
    if (!l.trim()) {
      flush();
      continue;
    }
    if (m = /^(#{1,6})\s+(.*)$/.exec(l)) {
      flush();
      const n = Math.min(4, Math.max(2, m[1].length + 1));
      out.push("<h" + n + ">" + ideaInline(m[2]) + "</h" + n + ">");
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(l.trim())) {
      flush();
      out.push("<hr>");
      continue;
    }
    if (m = /^\s*(?:[-*\u2022])\s+(.*)$/.exec(l)) {
      if (para.length) flush();
      if (!list || list.t !== "ul") {
        flush();
        list = { t: "ul", items: [] };
      }
      list.items.push(m[1]);
      continue;
    }
    if (m = /^\s*\d+[.)]\s+(.*)$/.exec(l)) {
      if (para.length) flush();
      if (!list || list.t !== "ol") {
        flush();
        list = { t: "ol", items: [] };
      }
      list.items.push(m[1]);
      continue;
    }
    if (m = /^&gt;\s?(.*)$/.exec(l)) {
      flush();
      out.push("<blockquote><p>" + ideaInline(m[1]) + "</p></blockquote>");
      continue;
    }
    if (/^\|.*\|$/.test(l.trim())) {
      flush();
      out.push('<pre class="idea-table">' + l + "</pre>");
      continue;
    }
    if (list) {
      list.items[list.items.length - 1] += " " + l.trim();
      continue;
    }
    para.push(l.trim());
  }
  if (fence !== null) out.push("<pre><code>" + fence.join("\n") + "</code></pre>");
  flush();
  return out.join("\n").replace(/<\/pre>\n<pre class="idea-table">/g, "\n").replace(/<pre class="idea-table">([\s\S]*?)<\/pre>/g, function(_, body) {
    const rows = body.split("\n").filter(function(r) {
      return !/^\|[-:| ]+\|$/.test(r.trim());
    }).map(function(r) {
      return r.trim().replace(/^\||\|$/g, "").split("|").map(function(c) {
        return ideaInline(c.trim());
      });
    });
    if (!rows.length) return "";
    return '<div class="q-table-wrap"><table class="q-table"><thead><tr>' + rows[0].map(function(c) {
      return "<th>" + c + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.slice(1).map(function(r) {
      return "<tr>" + r.map(function(c) {
        return "<td>" + c + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table></div>";
  });
}
__name(ideaMd, "ideaMd");
function ideaScorecard(content) {
  const t = String(content || "").trim();
  if (t.charAt(0) !== "{") return null;
  let j;
  try {
    j = JSON.parse(t);
  } catch (e) {
    return null;
  }
  if (!j || typeof j !== "object" || !("technical_merit" in j)) return null;
  const rows = [["Technical merit", j.technical_merit], ["Impact potential", j.impact_potential], ["Novelty", j.novelty], ["Feasibility", j.feasibility]].filter(function(r) {
    return typeof r[1] === "number";
  });
  return '<div class="q-panel idea-score"><p class="q-eyebrow">Automated triage score</p>' + (j.question ? '<p class="idea-score-q">' + ideaInline(esc(j.question)) + "</p>" : "") + '<dl class="idea-bars">' + rows.map(function(r) {
    const v = Math.max(0, Math.min(100, Math.round(r[1])));
    return "<div><dt>" + r[0] + '</dt><dd><span class="idea-bar"><i style="width:' + v + '%"></i></span><b class="q-num">' + v + "</b></dd></div>";
  }).join("") + '</dl><p class="q-meta">Scored 0 to 100 by two models when the question was proposed. A score ranks questions for the research queue; it is not a finding.</p></div>';
}
__name(ideaScorecard, "ideaScorecard");
var IDEA_CSS = "<style>.idea-list{list-style:none;margin:0;padding:0}.idea-list li{padding:20px 0;border-bottom:1px solid var(--q-rule)}.idea-list li[hidden]{display:none}.idea-t{font:500 1.22rem/1.35 var(--q-serif);text-decoration:none;color:var(--q-ink);display:block;max-width:70ch}.idea-t:hover{color:var(--q-accent)}.idea-m{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:var(--q-fs-sm);color:var(--q-muted)}.idea-filter{max-width:560px;margin:8px 0 6px}.idea-q{font:500 clamp(1.5rem,2.6vw,2.1rem)/1.25 var(--q-serif);letter-spacing:-.01em;margin:0 0 14px;max-width:34ch;overflow-wrap:anywhere}.idea-q-full{font:400 var(--q-fs-read)/1.6 var(--q-serif);color:var(--q-muted);margin:0 0 24px;max-width:var(--q-measure)}.idea-turn{margin:36px 0 0}.idea-role{font:600 var(--q-fs-sm)/1 var(--q-sans);color:var(--q-accent);margin:0 0 12px;display:flex;gap:10px;align-items:center}.idea-score{margin:24px 0;max-width:640px}.idea-score-q{font:500 1.1rem/1.45 var(--q-serif);margin:6px 0 16px}.idea-bars{display:grid;gap:10px;margin:0 0 14px}.idea-bars div{display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:center}.idea-bars dt{font-size:var(--q-fs-sm);color:var(--q-muted)}.idea-bars dd{margin:0;display:flex;gap:10px;align-items:center}.idea-bar{flex:1;height:8px;border-radius:99px;background:var(--q-rule);overflow:hidden}.idea-bar i{display:block;height:100%;background:var(--q-accent)}.idea-table{font:400 .8rem/1.5 var(--q-mono)}@media (max-width:560px){.idea-bars div{grid-template-columns:1fr}}</style>";
function ideaPage(o, body, status) {
  const html = qdsPage({ title: o.title, description: o.description, canonical: o.canonical, brand: "qnfo", active: "ideas", jsonld: o.jsonld, math: !!o.math, robots: o.robots, extra: IDEA_CSS + (o.head || "") }, body);
  return new Response(html, { status: status || 200, headers: { ...cors(), "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
__name(ideaPage, "ideaPage");
function ideaDate(s) {
  const d = new Date(s || 0);
  return Number.isNaN(d.getTime()) || !s ? "" : d.toISOString().slice(0, 10);
}
__name(ideaDate, "ideaDate");
function ideaLd(o) {
  return '<script type="application/ld+json">' + JSON.stringify(Object.assign({ "@context": "https://schema.org", author: { "@type": "Person", name: "Rowan Brad Quni-Gudzinas", sameAs: ["https://orcid.org/" + QDS_OWNER_ORCID] }, publisher: { "@type": "Organization", name: "QNFO", url: "https://qnfo.org/" } }, o)).replace(/</g, "\\u003c") + "<\/script>";
}
__name(ideaLd, "ideaLd");
async function ideasHome(env) {
  let items = [];
  try {
    items = await all(env);
  } catch (e) {
    items = [];
  }
  const list = items.filter(function(x) {
    return x.source === "live" || x.source === "ideation";
  }).slice(0, 20);
  const newest = list.length ? ideaDate(list[0].updated_at) : "";
  const rows = list.map(function(x) {
    const t = ideaShort(ideaTitle(x.title), 200);
    return '<li data-t="' + esc(t.toLowerCase()) + '"><a class="idea-t" href="/s/' + encodeURIComponent(x.id) + '">' + esc(t) + '</a><div class="idea-m"><time datetime="' + esc(x.updated_at || "") + '">' + ideaDate(x.updated_at) + "</time>" + (x.message_count ? "<span>" + x.message_count + (x.message_count === 1 ? " message" : " messages") + "</span>" : "") + "</div></li>";
  }).join("");
  const body = '<section class="q-hero" style="padding-bottom:16px"><div class="q-wrap"><p class="q-eyebrow">Ideas</p><h1 class="q-display" style="max-width:18ch">Research questions as they develop</h1><p class="q-lede">Questions put to the QNFO research assistant and the answers it wrote from the corpus, published as they happen. Personal, operational and quarantined conversations never appear here. When a question holds up, it becomes a paper; <a href="https://papers.qnfo.org/papers">the papers</a> are the record.</p></div></section><section class="q-section" style="padding-top:8px" aria-labelledby="ideas-h"><div class="q-wrap"><div class="q-section-head"><h2 class="q-h2" id="ideas-h">' + (list.length === 20 ? "The latest 20" : list.length + " public items") + "</h2>" + (newest ? '<span class="q-meta">Newest ' + newest + "</span>" : "") + "</div>" + (list.length ? '<label class="q-field idea-filter"><span class="q-sr">Filter threads</span><input id="idea-f" type="search" placeholder="Filter by words in the question" autocomplete="off"></label><p class="q-meta" id="idea-n" aria-live="polite"></p><ul class="idea-list" id="idea-l">' + rows + "</ul>" : '<div class="q-note">No public threads right now. New questions appear here within five minutes of being asked; <a href="https://ask.qwav.tech/">ask the corpus</a> or read <a href="https://papers.qnfo.org/papers">the papers</a> meanwhile.</div>') + // REACH-IDEA-1 (1.5.7, agent_issues 2001): an inline subscribe box (email input) posting to /api/subscribe, which forwards to
  // the qnfo-subscribers double opt-in with source ideas.qnfo.org; the honeypot field is the same one qnfo.org uses.
  '<section class="q-panel" id="subscribe" aria-labelledby="ideas-sub-h" style="margin-top:40px"><h2 class="q-h3" id="ideas-sub-h" style="margin:0 0 4px">Follow new work</h2><p class="q-meta" style="margin:0 0 12px">New threads by <a href="/rss.xml">RSS</a>. New papers by email: one short weekly digest, confirm by the link we send, unsubscribe any time.</p><form id="ideas-sub-form" novalidate style="display:flex;gap:8px;flex-wrap:wrap"><label class="q-sr" for="ideas-sub-email">Email address</label><input class="q-input" id="ideas-sub-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required style="flex:1 1 220px;min-width:0"><input class="q-sr" type="text" id="ideas-sub-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="q-btn q-btn-accent" type="submit" id="ideas-sub-btn">Subscribe</button></form><p class="q-meta" id="ideas-sub-msg" role="status" aria-live="polite" style="min-height:1.4em;margin:8px 0 0"></p></section></div></section>';
  const subJs = "<script>(function(){var f=document.getElementById('ideas-sub-form');if(!f)return;var m=document.getElementById('ideas-sub-msg'),b=document.getElementById('ideas-sub-btn');f.addEventListener('submit',function(e){e.preventDefault();var em=(document.getElementById('ideas-sub-email').value||'').trim(),hp=(document.getElementById('ideas-sub-hp')||{}).value||'';if(!em||em.indexOf('@')<1){m.textContent='Enter a valid email address.';return}b.disabled=true;m.textContent='Subscribing...';fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,hp:hp})}).then(function(r){return r.json().catch(function(){return {}})}).then(function(j){if(j&&j.ok){m.textContent='Check your inbox to confirm the subscription.';f.reset()}else{m.textContent=(j&&j.error)||'The subscription did not go through. Try again.'}}).catch(function(){m.textContent='Network error. Try again.'}).then(function(){b.disabled=false})})})();<\/script>";
  const js = subJs + '<script>(function(){if(/^#\\/s\\//.test(location.hash)){location.replace("/s/"+location.hash.slice(4));return}var f=document.getElementById("idea-f"),l=document.getElementById("idea-l"),n=document.getElementById("idea-n");if(!f||!l)return;f.addEventListener("input",function(){var q=f.value.trim().toLowerCase(),k=0;l.querySelectorAll("li").forEach(function(li){var h=!q||li.getAttribute("data-t").indexOf(q)>=0;li.hidden=!h;if(h)k++});n.textContent=q?k+" of "+l.children.length+" threads":""})})()<\/script>';
  return ideaPage({
    title: "Ideas \xB7 research questions as they develop \xB7 QNFO",
    description: "Public research conversations from the QNFO research assistant: questions, answers written from the paper corpus, and automated triage scores.",
    canonical: BASE + "/",
    math: /\$|\\\(|\\\[/.test(rows),
    jsonld: ideaLd({ "@type": "CollectionPage", name: "QNFO Ideas", url: BASE + "/", description: "Public research conversations from the QNFO research assistant." }),
    head: ""
  }, body + js);
}
__name(ideasHome, "ideasHome");
async function ideasQuestion(env, kind, num) {
  let row = null, q = "", status = "", created = null;
  try {
    if (kind === "q") {
      const r = (await env.QNFO_AUDIT.prepare("SELECT question AS q, ts, status FROM self_questions WHERE id=?").bind(num).all()).results || [];
      row = r[0];
      if (row) {
        q = row.q;
        created = ts(row.ts);
        status = row.status || "";
      }
    } else {
      const r = (await env.QNFO_AUDIT.prepare("SELECT idea AS q, created_at, status FROM idea_proposals WHERE id=?").bind(num).all()).results || [];
      row = r[0];
      if (row) {
        q = row.q;
        created = ts(row.created_at);
        status = row.status || "";
      }
    }
  } catch (e) {
    row = null;
  }
  if (!row || !pubQuestion(q)) {
    return ideaPage(
      { title: "Question not found \xB7 QNFO Ideas", description: "This question is not public.", robots: "noindex" },
      '<section class="q-hero"><div class="q-wrap"><p class="q-eyebrow">Ideas</p><h1 class="q-h1">This question is not public</h1><p class="q-lede"><a href="/">See every public question</a>.</p></div></section>',
      404
    );
  }
  const title = ideaShort(ideaTitle(clean(q, 300)), 160);
  const kindLabel = kind === "q" ? "Open research question" : status === "triaged_accepted" ? "Queued research question" : "Proposed research question";
  const body = '<div class="q-wrap" style="padding-top:36px;padding-bottom:64px"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">\u2190 All questions</a></p><h1 class="idea-q">' + esc(title) + '</h1><p class="q-meta">' + kindLabel + (created ? " \xB7 " + ideaDate(created) : "") + ' \xB7 generated autonomously by the QNFO research pipeline</p><p class="q-note" style="margin-top:24px">This is a question the QNFO pipeline is developing. Answers become <a href="https://papers.qnfo.org/papers">papers</a> when they hold up. <a href="https://ask.qwav.tech/?q=' + encodeURIComponent(title.slice(0, 300)) + '">Ask it against the current corpus</a>.</p></div>';
  return ideaPage({
    title: title.slice(0, 90) + " \xB7 QNFO Ideas",
    description: ideaTitle(clean(q, 300)),
    canonical: BASE + "/s/" + (kind === "q" ? "q-" : "p-") + num,
    math: /\$|\\\(|\\\[/.test(q),
    jsonld: ideaLd({ "@type": "Question", name: title.slice(0, 110), url: BASE + "/s/" + (kind === "q" ? "q-" : "p-") + num })
  }, body);
}
__name(ideasQuestion, "ideasQuestion");
async function ideasThread(env, rawId) {
  let id = "";
  try {
    id = decodeURIComponent(rawId);
  } catch (e) {
    id = rawId;
  }
  if (/^q-\d+$/.test(id)) return ideasQuestion(env, "q", id.slice(2));
  if (/^p-\d+$/.test(id)) return ideasQuestion(env, "p", id.slice(2));
  let rows = [];
  try {
    rows = (await env.QNFO_AUDIT.prepare("SELECT ts,role,content,model FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 500").bind(id).all()).results || [];
  } catch (e) {
    rows = [];
  }
  const first = rows.find(function(r) {
    return r.role === "user";
  });
  if (!first || !publicTitle(first.content) || await blocked(env, id)) {
    return ideaPage(
      { title: "Thread not found \xB7 QNFO Ideas", description: "This thread is not public.", robots: "noindex" },
      '<section class="q-hero"><div class="q-wrap"><p class="q-eyebrow">Ideas</p><h1 class="q-h1">This thread is not public</h1><p class="q-lede">It may have been removed, or it never passed the public filter. <a href="/">See every public thread</a>.</p></div></section>',
      404
    );
  }
  const shown = rows.filter(function(r) {
    return r.role !== "system" && r !== first && !has(r.content, INTERNAL) && !has(r.content, OPS) && !has(r.content, JUNK);
  });
  const q = ideaText(first.content, 2e4);
  const qTitle = ideaShort(ideaTitle(clean(first.content, 2e3)), 160);
  const long = q.length > 260;
  const turns = shown.map(function(r) {
    const card = r.role === "assistant" ? ideaScorecard(r.content) : null;
    if (card) return card;
    const who = r.role === "user" ? "Follow-up" : "Research assistant";
    return '<div class="idea-turn"><p class="idea-role">' + who + (r.ts ? ' <span class="q-meta" style="font-weight:400">' + ideaDate(ts(r.ts)) + "</span>" : "") + '</p><div class="q-prose">' + ideaMd(ideaText(r.content)) + "</div></div>";
  }).join("");
  const updated = ts(rows[rows.length - 1].ts), created = ts(first.ts);
  const body = '<div class="q-wrap" style="padding-top:36px;padding-bottom:64px"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">\u2190 All threads</a></p><h1 class="idea-q">' + esc(long ? qTitle : ideaTitle(q)) + "</h1>" + (long ? '<div class="idea-q-full q-prose">' + ideaMd(q) + "</div>" : "") + '<p class="q-meta">Asked ' + ideaDate(created) + (updated && updated !== created ? " \xB7 updated " + ideaDate(updated) : "") + ' \xB7 <a href="https://ask.qwav.tech/?q=' + encodeURIComponent(qTitle.slice(0, 300)) + '">Ask it again against the current corpus</a></p>' + (turns || '<div class="q-note" style="margin-top:24px">No public answer yet.</div>') + '<p class="q-note" style="margin-top:40px">Answers here were written by an AI research assistant over the QNFO corpus and have not been reviewed. Cite <a href="https://papers.qnfo.org/papers">the papers</a>, not this thread.</p></div>';
  return ideaPage({
    title: qTitle.slice(0, 90) + " \xB7 QNFO Ideas",
    description: ideaTitle(clean(first.content, 300)),
    canonical: BASE + "/s/" + encodeURIComponent(id),
    math: /\$|\\\(|\\\[/.test(q + turns),
    jsonld: ideaLd({ "@type": "DiscussionForumPosting", headline: qTitle.slice(0, 110), url: BASE + "/s/" + encodeURIComponent(id), datePublished: created, dateModified: updated })
  }, body);
}
__name(ideasThread, "ideasThread");
async function ideasCached(req, ctx, make) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL(req.url).origin + new URL(req.url).pathname + "?__swr=1", { method: "GET" });
  const store = /* @__PURE__ */ __name(async function() {
    const res = await make();
    if (!cache || res.status !== 200) return res;
    const body = await res.text();
    const hd = new Headers(res.headers);
    hd.set("X-Ideas-Built", String(Date.now()));
    hd.set("X-Ideas-Version", VERSION);
    hd.set("Cache-Control", "public, max-age=604800");
    try {
      await cache.put(key, new Response(body, { status: 200, headers: hd }));
    } catch (e) {
      console.log("ideasCached: cache.put failed: " + (e && e.message || e));
    }
    return new Response(body, { status: 200, headers: res.headers });
  }, "store");
  const logFail = /* @__PURE__ */ __name(function(e) {
    console.log("ideasCached: rebuild failed: " + (e && e.message || e));
    return null;
  }, "logFail");
  const served = /* @__PURE__ */ __name(function(r, mark) {
    const hd = new Headers(r.headers);
    hd.delete("X-Ideas-Built");
    hd.delete("X-Ideas-Version");
    hd.set("Cache-Control", "public, max-age=14400");
    if (mark) hd.set("X-Ideas-Cache", mark);
    return new Response(r.body, { status: 200, headers: hd });
  }, "served");
  let hit = null;
  if (cache) {
    try {
      hit = await cache.match(key);
    } catch (e) {
      console.log("ideasCached: cache.match failed: " + (e && e.message || e));
      hit = null;
    }
  }
  if (!hit) return store();
  if (hit.headers.get("X-Ideas-Version") !== VERSION) {
    const build = store().catch(logFail);
    let timer = null;
    const timeout = new Promise(function(resolve) {
      timer = setTimeout(function() {
        resolve(null);
      }, IDEAS_VERSION_WAIT_MS);
    });
    const fresh = await Promise.race([build, timeout]);
    if (timer !== null) clearTimeout(timer);
    if (fresh && fresh.status === 200) return fresh;
    if (!fresh && ctx && ctx.waitUntil) ctx.waitUntil(build);
    return served(hit, "stale-version");
  }
  const age = Date.now() - Number(hit.headers.get("X-Ideas-Built") || 0);
  if (age > IDEAS_FRESH_MS && ctx && ctx.waitUntil) ctx.waitUntil(store().catch(logFail));
  return served(hit, null);
}
__name(ideasCached, "ideasCached");
var IDEAS_VERSION_WAIT_MS = 2500;
var IDEAS_FRESH_MS = 15 * 60 * 1e3;
function ownerTokens(env) {
  return [env.OWNER_TOKEN, env.SYNC_TOKEN].filter(function(t) {
    return typeof t === "string" && t.length >= 16;
  });
}
__name(ownerTokens, "ownerTokens");
function ctEq(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
__name(ctEq, "ctEq");
function ownerOk(req, env) {
  var wants = ownerTokens(env);
  if (!wants.length) return false;
  var h = req.headers.get("Authorization") || "";
  var m = /^Bearer\s+(.+)$/i.exec(h.trim());
  var sup = m ? m[1].trim() : "";
  if (!sup) {
    try {
      sup = new URL(req.url).searchParams.get("token") || "";
    } catch (e) {
      console.error(JSON.stringify({ worker: "idea-hub", where: "ownerOk", error: String(e && e.message || e).slice(0, 300) }));
    }
  }
  if (!sup) return false;
  var ok = false;
  for (var i = 0; i < wants.length; i++) {
    if (ctEq(wants[i], sup)) ok = true;
  }
  return ok;
}
__name(ownerOk, "ownerOk");
async function intake(req, env) {
  var b;
  try {
    b = await req.json();
  } catch (e) {
    return json({ error: "invalid JSON body" }, 400);
  }
  var kind = String(b.kind || "idea").toLowerCase();
  var title = clean(b.title || "", 300);
  var body = String(b.body || b.text || "").slice(0, 2e5);
  if (!title && !body) return json({ error: "title or body required" }, 400);
  var src = "owner-chat", now = Date.now();
  if (kind === "paper") {
    var slug = String(b.slug || title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "owner-" + now;
    try {
      await env.LIVING_PAPER.prepare("INSERT OR IGNORE INTO papers (identifier,slug,title,authors,abstract,body_md,status,created_at,updated_at,version) VALUES (?,?,?,?,?,?,'draft',datetime('now'),datetime('now'),'0.0.1')").bind("owner-" + slug, slug, title || "Untitled", '["Rowan Brad Quni-Gudzinas"]', clean(body, 2e3), body).run();
    } catch (e) {
      return json({ error: "paper insert failed: " + (e && e.message || e) }, 500);
    }
    return json({ ok: true, kind: "paper", slug, status: "draft", provenance: src, held: true });
  }
  if (kind === "issue") {
    try {
      await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (title,description,source,category,priority,status,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,?)").bind(title || "Owner-filed item", body || title, src, b.category || "owner-intake", b.priority || "medium", now, now).run();
    } catch (e) {
      return json({ error: "issue insert failed: " + (e && e.message || e) }, 500);
    }
    return json({ ok: true, kind: "issue", provenance: src, held: true });
  }
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name,idea,contact,status,created_at) VALUES (?,?,?,?,datetime('now'))").bind(src, (title ? title + "\n\n" : "") + body, "owner", "new").run();
  } catch (e) {
    return json({ error: "idea insert failed: " + (e && e.message || e) }, 500);
  }
  return json({ ok: true, kind: "idea", provenance: src, status: "new", held: true });
}
__name(intake, "intake");
var SUBSCRIBERS_ENDPOINT = "https://qnfo-subscribers.q08.workers.dev";
async function subscribeProxy(req) {
  var payload = {};
  try {
    payload = await req.json();
  } catch (e) {
    payload = {};
  }
  var email = String(payload && payload.email || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^@\s]{1,64}@[^@\s.]{1,255}\.[^@\s.]{2,}$/.test(email)) return json({ ok: false, error: "Please enter a valid email address." }, 400);
  var ctrl = new AbortController(), timer = setTimeout(function() {
    ctrl.abort();
  }, 9e3);
  try {
    var r = await fetch(SUBSCRIBERS_ENDPOINT + "/subscribe", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "User-Agent": "idea-hub/" + VERSION, "X-Forwarded-For": req.headers.get("CF-Connecting-IP") || "", "X-Client-UA": String(req.headers.get("User-Agent") || "").slice(0, 300) },
      body: JSON.stringify({ email, hp: String(payload && (payload.hp || payload.website) || ""), source: "ideas.qnfo.org" })
    });
    var data = await r.json().catch(function() {
      return {};
    });
    return json(data && typeof data === "object" ? data : { ok: false, error: "Sign-up failed." }, r.status);
  } catch (e) {
    return json({ ok: false, error: "Sign-up is unavailable right now. Please try again shortly." }, 502);
  } finally {
    clearTimeout(timer);
  }
}
__name(subscribeProxy, "subscribeProxy");
var worker_default = { async scheduled(event, env, ctx) {
  ctx.waitUntil(ideationCycle(env));
}, async fetch(req, env, ctx) {
  const u = new URL(req.url);
  if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: https://ideas.qnfo.org/sitemap.xml\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
  if (u.pathname === "/sitemap.xml") return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://ideas.qnfo.org/</loc><changefreq>daily</changefreq></url></urlset>', { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  try {
    if (u.pathname === "/api/subscribe" && req.method === "POST") return await subscribeProxy(req);
    if (u.pathname === "/health") {
      let qt = -1;
      try {
        qt = (await quarantined(env)).size;
      } catch (e) {
        console.error(JSON.stringify({ worker: "idea-hub", route: "/health", read: "quarantine", error: String(e && e.message || e) }));
      }
      let td = -1, tdd = -1;
      try {
        const r = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status='deferred_budget'").first();
        td = Number(r && r.n) || 0;
        const r2 = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE status='deferred_diversity'").first();
        tdd = Number(r2 && r2.n) || 0;
      } catch (e) {
        console.error(JSON.stringify({ worker: "idea-hub", route: "/health", read: "deferred", error: String(e && e.message || e) }));
      }
      let oc = null;
      try {
        oc = {};
        ((await env.QNFO_AUDIT.prepare("SELECT outcome, COUNT(*) AS n FROM owner_corpus_seen GROUP BY outcome").all()).results || []).forEach(function(x) {
          oc[x.outcome] = x.n;
        });
      } catch (e) {
        oc = null;
        console.error(JSON.stringify({ worker: "idea-hub", route: "/health", read: "owner_corpus_seen", error: String(e && e.message || e) }));
      }
      return json({ ok: true, worker: "idea-hub", version: VERSION, private: false, owner_signal_intake: { vault_bound: !!env.VAULT, corpus_seen: oc, reentry_owner_types: REENTRY_OWNER_TYPES, corpus_score_min: OWNER_CORPUS_SCORE_MIN }, triage_deferred_budget: td, triage_deferred_diversity: tdd, diversity_cap: { max_share: DIVERSITY_MAX_SHARE, min_n: DIVERSITY_MIN_N }, novelty_screen: { models: NOVELTY_MODELS, neighbours_per_source: NOVELTY_K, sources: ["qnfo-corpus", "arxiv"], payoff_min: NOVELTY_PAYOFF_MIN, foundational_quota: NOVELTY_FOUNDATIONAL_QUOTA, corpus_bound: !!(env.PAPER_VZ && env.LIVING_PAPER) }, public_filter: true, thread_filter: true, strict_filter: true, match_mode: "boundary", quarantine_wired: true, errata_wired: true, quarantine_threads: qt, mutation_routes: false, capabilities: ["public-ideas-feed", "questions-feed", "rss", "session-pages", "ideation", "qds-pages", "owner-intake", "novelty-screen"], limitations: ["read-only public surface: /, /s/*, /rss.xml, /api/sessions, /api/session/* load with no credential", "chat threads: only a first research-domain question passes the public filter; personal, ops and quarantined threads are never shown", "the feed also carries the pipeline's own open questions and triaged proposals (kind q-N / p-N, source ideation)", "/api/ask, /api/proposals and /run answer 503; POST /api/intake is owner-authenticated; POST /api/subscribe forwards an address to the qnfo-subscribers double opt-in (source ideas.qnfo.org; nobody is subscribed without clicking the confirmation link)", "ideation runs on the hourly :23 cron", "while a fleet_budget ai_spend cap is breached, triage still runs and scores on one cheap model (BUDGET-SOFT-ROUTE-1); rows left as status deferred_budget by older versions are released every run (count in triage_deferred_budget)", "a generated proposal scored ACCEPT waits as deferred_diversity (count in triage_deferred_diversity) while its topic cluster would exceed half of the 30-day accepts; owner and intake:* rows are never held"], bindings: { audit: !!env.QNFO_AUDIT } });
    }
    if (u.pathname === "/api/gate") {
      const q = u.searchParams.get("q") || "";
      return json({ q, public: publicTitle(q), internal: has(q, INTERNAL), ops: has(q, OPS), junk: has(q, JUNK), research: has(q, RESEARCH), match_mode: "boundary" });
    }
    if (u.pathname === "/rss.xml") return rss(env);
    if (u.pathname === "/api/sessions" || u.pathname === "/api/feed") return sessions(u, env);
    if (u.pathname.startsWith("/api/session/")) return session(u.pathname, env);
    if (u.pathname === "/api/suggest") return json({ policy: "research-domain only; personal/ops/actions/runtime metadata are never suggested", groups: [] });
    if (u.pathname === "/api/ask" || u.pathname === "/api/proposals" || u.pathname === "/run") return json({ error: "mutation or ask route disabled on public ideas surface" }, 503);
    if (u.pathname === "/" || u.pathname === "/index.html") return ideasCached(req, ctx, function() {
      return ideasHome(env);
    });
    if (u.pathname.startsWith("/s/") && u.pathname.length > 3) return ideasCached(req, ctx, function() {
      return ideasThread(env, u.pathname.slice(3));
    });
    if (u.pathname === "/api/intake") {
      if (!ownerOk(req, env)) return json({ error: "Authentication required" }, 401);
      if (req.method !== "POST") return json({ error: "POST required" }, 405);
      return await intake(req, env);
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: "Server error: " + (e && e.message || String(e)) }, 500);
  }
} };
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
