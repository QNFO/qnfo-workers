var VERSION="3.8.1-living-papers";
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
  out = out.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
  out = out.replace(/\\[a-zA-Z]+/g, function(c){ return Object.prototype.hasOwnProperty.call(MATH_SYM, c) ? MATH_SYM[c] : c.slice(1); });
  out = out.replace(/[{}]/g, "");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}
function mathPlain(s){
  if (!s) return "";
  var t = String(s);
  t = t.replace(/\$\$([^$]+)\$\$/g, function(_, m){ return _mathToText(m); });
  t = t.replace(/\$([^$]+)\$/g, function(_, m){ return _mathToText(m); });
  return t;
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
  var s = String(t).replace(/\*\*/g, "").replace(/\[\[|\]\]/g, "").replace(/~~/g, "").trim();
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
  var s = String(t).replace(/\*\*/g, "").replace(/\[\[|\]\]/g, "").replace(/~~/g, "").trim();
  s = esc(s);
  s = s.replace(/\$([^$\n]*)\$/g, function(m, inner) {
    if (inner.indexOf("$") >= 0) return m;
    if (looksLikeTeX(inner)) return m;
    return m.split("$").join("&#36;");
  });
  return s;
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
var CATEGORY_LABELS = { "qec": "QEC", "number-theory": "Number Theory", "physics": "Physics", "computer-science": "CS", "other": "Other" };
function texSafe(s) {
  if (!s) return "";
  s = String(s);
  s = s.replace(/(\\{2,})(?=[A-Za-z])/g, function(mm) {
    return "\\".repeat(Math.floor(mm.length / 2));
  });
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
function _mdInline(t) {
  t = String(t || "");
  var _math = [];
  function saveMath(c, disp) {
    _math.push((disp ? "D" : "") + c);
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
  t = t.replace(/\$([^$\n]+?)\$/g, function(m, c) {
    return saveMath(c, false);
  });
  t = t.replace(/\\\(([^\n]*?)\\\)/g, function(m, c) {
    return saveMath(c, false);
  });
  t = esc(t);
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(?<![\p{L}\p{N}\\])__(?=\S)([^_\n]+?)__(?![\p{L}\p{N}])/gu, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  t = t.replace(/(?<![\p{L}\p{N}\\_])_(?=\S)([^_\n]+?)_(?![\p{L}\p{N}_])/gu, "<em>$1</em>");
  t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  var _bt = String.fromCharCode(96);
  t = t.replace(new RegExp(_bt + "([^" + _bt + "]+)" + _bt, "g"), "<code>$1</code>");
  t = t.replace(/\u0003M(\d+)\u0003/g, function(m, i) {
    var c = _math[+i];
    var disp = c.charAt(0) === "D";
    return (disp ? "$$" : "$") + texSafe(disp ? c.slice(1) : c) + (disp ? "$$" : "$");
  });
  return t;
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
  m = m.replace(/([^\n])[ \t]+(---)[ \t]*(?=\n)/g, "$1\n$2\n");
  m = m.replace(/([^\n|])[ \t]+(#{1,6}[ \t])/g, "$1\n$2");
  var _bt2 = String.fromCharCode(96);
  var _fence = new RegExp(_bt2 + _bt2 + _bt2 + "(\\w*)\\n([\\s\\S]*?)" + _bt2 + _bt2 + _bt2, "g");
  m = m.replace(_fence, function(_, l2, c) {
    mb.push("<pre" + (l2 ? ' class="lang-' + l2 + '"' : "") + "><code>" + esc(c) + "</code></pre>");
    return "B" + mb.length + "";
  });
  m = m.replace(/\$\$([\s\S]*?)\$\$/g, function(_, c) {
    mb.push('<div class="math-display">$$' + texSafe(c) + "$$</div>");
    return "B" + mb.length + "";
  });
  m = m.replace(/\\\[([\s\S]*?)\\\]/g, function(_, c) {
    mb.push('<div class="math-display">$$' + texSafe(c) + "$$</div>");
    return "B" + mb.length + "";
  });
  m = m.replace(/\$([^$\n]+?)\$/g, function(_, c) {
    mi.push(c);
    return "M" + (mi.length - 1) + "";
  });
  m = m.replace(/\\\(([^\n]*?)\\\)/g, function(_, c) {
    mi.push(c);
    return "M" + (mi.length - 1) + "";
  });
  m = m.replace(/\\\$/g, "\x07");
  function isTableSep(s) {
    return /^\|?[\s:]*-{3,}[\s:]*\|/.test(s) && /-/.test(s);
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
        } else if (inItem && isContinuation(liRaw) && !/^\|?[\s:]* -{3,}/.test(lit) && !isTableSep(lit)) {
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
      if (isListStart(pt)) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(pt)) break;
      if (pt.charAt(0) === ">") break;
      if (/^\u0001B\d+\u0001$/.test(pt)) break;
      if (pt.indexOf("|") >= 0 && i + 1 < L.length && isTableSep(L[i + 1].trim())) break;
      para.push(pt);
      i++;
    }
    if (para.length) {
      o += emitBlockText(cleanPunct(para.join(" "))) + "\n";
    } else {
      i++;
    }
  }
  o = o.replace(/\u0001M(\d+)\u0001/g, function(mm, n) {
    return "$" + texSafe(mi[+n]) + "$";
  });
  o = o.replace(/\u0007/g, "$");
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
  { t: "The Joules-per-Solution Metric: Definition, Measurement Protocol, and Anti-Gaming Provisions", doi: "10.5281/zenodo.21637028", pillar: "Energy-honest computing" },
  { t: "Error Correction Is a Landauer Machine: The Thermodynamic Floor of QEC Overhead", doi: "10.5281/zenodo.22261547", pillar: "Energy-honest computing" },
  { t: "JPCUB Competitive Landscape v2.0 (17 platforms)", doi: "10.5281/zenodo.21821767", pillar: "Energy-honest computing" },
  { t: "Joules-per-Solution for Stochastic and Agentic Inference (LLMs)", doi: "10.5281/zenodo.21945415", pillar: "Energy-honest computing" },
  { t: "The Universal Ignorance Audit", doi: "10.5281/zenodo.21901984", pillar: "Epistemics of AI-assisted science" },
  { t: "Epistemic Legibility in AI-Assisted Science", doi: "10.5281/zenodo.22026592", pillar: "Epistemics of AI-assisted science" },
  { t: "Operating the Quniverse Fleet: Objectives, Successes, Failures, Roadmap", doi: "10.5281/zenodo.23079905", pillar: "Autonomous research operations" }
];
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
  return '<section class="ld-latest ld-selected" id="selected-works" aria-labelledby="ld-sel-h"><h2 id="ld-sel-h">Selected works</h2><p class="ld-sel-note">The works QNFO leads with. Each has a permanent DOI; the full library is on <a href="/papers">papers.qnfo.org</a>.</p><ol>' + SELECTED_WORKS.map(
    (w) => '<li><a href="https://doi.org/' + w.doi + '">' + esc(w.t) + '</a><span class="ld-date">' + esc(w.pillar) + ' \u00b7 <a href="https://doi.org/' + w.doi + '">doi:' + w.doi + "</a></span></li>"
  ).join("") + '</ol><p class="ld-sel-note">Quni-Gudzinas, R. B. Published by QNFO. Prepared with an AI-assisted research pipeline; the author is responsible for the content.</p></section>';
}
function renderHubHTML(recentPapers, paperCount, nodesCount = 0) {
  const total = paperCount || (recentPapers ? recentPapers.length : 0);
  const kg = nodesCount ? nodesCount.toLocaleString("en-US") + "+" : "\u2014";
  const cards = [
    { t: "Work with me", d: "Energy-per-correct-answer assessments, reviews of AI agent operations, talks, research collaboration and roles.", go: "See the offers \u2192", h: "/work-with-me" },
    { t: "Research Papers", d: "The full corpus \u2014 number theory, physics, QEC and computer science \u2014 every paper with a Zenodo DOI.", go: "Browse papers \u2192", h: "/papers" },
    { t: "Knowledge Graph", d: kg + " nodes mapping the conceptual structure of the research program.", go: "Explore the graph \u2192", h: "/graph" },
    { t: "Ideas \u2014 Live", d: "Research conversations as they develop, streamed from the QNFO AI worker.", go: "Watch ideas \u2192", h: "https://ideas.qnfo.org" },
    { t: "iPatent", d: "A free, private-by-default assistant for drafting US provisional patent disclosures, with a plain-language guide to what a provisional protects.", go: "Draft a disclosure \u2192", h: "https://ipatent.qnfo.org/" },
    { t: "Research Archive", d: "Persistent archival storage with DOI registration and redundant backup.", go: "Open the archive \u2192", h: "https://archive.qnfo.org" },
    { t: "License", d: "The QNFO Unified License Agreement \u2014 open science with commercial protections.", go: "Read the license \u2192", h: "/legal" }
  ];
  const cardsHtml = cards.map(
    (c) => '<a class="ld-card" href="' + c.h + '"><h3>' + c.t + "</h3><p>" + c.d + '</p><span class="ld-go">' + c.go + "</span></a>"
  ).join("");
  let papersHtml = "";
  if (recentPapers && recentPapers.length > 0) {
    papersHtml = '<section class="ld-latest"><h2>Latest papers</h2><ul>' + recentPapers.slice(0, 8).map(
      (p) => '<li><a href="/papers/' + escAttr(p.slug) + '">' + titleHTML(p.title) + '</a><span class="ld-date">' + esc(String(p.created_at || "").slice(0, 10)) + "</span></li>"
    ).join("") + '</ul><p class="ld-more"><a href="/papers">Browse the full library \u2192</a></p></section>';
  }
  const formScript = '<script>(function(){var f=document.getElementById("ld-sub-form");if(!f)return;var msg=document.getElementById("ld-msg");var btn=document.getElementById("ld-btn");f.addEventListener("submit",function(e){e.preventDefault();var email=(document.getElementById("ld-email").value||"").trim();var hp=(document.getElementById("ld-hp")||{}).value||"";if(!email||email.indexOf("@")<1){msg.className="ld-msg err";msg.textContent="Please enter a valid email address.";return;}btn.disabled=true;msg.className="ld-msg";msg.textContent="Subscribing\u2026";fetch("/api/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email,hp:hp,source:"qnfo.org"})}).then(function(r){return r.json().then(function(j){return {s:r.status,j:j};}).catch(function(){return {s:r.status,j:{}};});}).then(function(res){if(res.s===200&&res.j&&res.j.ok){msg.className="ld-msg ok";msg.textContent="Thanks \u2014 check your inbox to confirm your subscription.";f.reset();}else{msg.className="ld-msg err";msg.textContent=(res.j&&res.j.error)||"Something went wrong. Please try again.";}}).catch(function(){msg.className="ld-msg err";msg.textContent="Network error. Please try again.";}).then(function(){btn.disabled=false;});});})();<\/script>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>QNFO \u2014 independent research by Rowan Brad Quni-Gudzinas</title><meta name="description" content="QNFO is the independent research imprint of Rowan Brad Quni-Gudzinas: what computation really costs and delivers, from energy per correct answer (Joules-per-Solution) to what an AI-assisted claim is worth."><meta name="author" content="Rowan Brad Quni-Gudzinas"><meta property="og:site_name" content="QNFO"><meta property="og:title" content="QNFO \u2014 independent research by Rowan Brad Quni-Gudzinas"><meta property="og:description" content="QNFO is the independent research imprint of Rowan Brad Quni-Gudzinas: what computation really costs and delivers, from energy per correct answer (Joules-per-Solution) to what an AI-assisted claim is worth."><meta property="og:type" content="website"><meta property="og:url" content="https://qnfo.org/"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="QNFO \u2014 independent research by Rowan Brad Quni-Gudzinas"><meta name="twitter:description" content="QNFO is the independent research imprint of Rowan Brad Quni-Gudzinas: what computation really costs and delivers, from energy per correct answer (Joules-per-Solution) to what an AI-assisted claim is worth."><link rel="canonical" href="https://qnfo.org/">` + identityJsonLd("https://qnfo.org/") + `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%2324315e'/><text x='16' y='23' text-anchor='middle' font-size='18' fill='%23faf7f2' font-family='Georgia,serif'>Q</text></svg>"><script>window.MathJax={tex:{inlineMath:[["$","$"]],displayMath:[["$$","$$"]],processEscapes:true},svg:{scale:1.1,fontCache:"global"},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"],enableMenu:false}};function __mq(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise().catch(function(){})}}if(document.readyState==="complete"){setTimeout(__mq,150)}else{window.addEventListener("load",function(){setTimeout(__mq,150)})}<\/script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js" id="MathJax-script" onerror="this.onerror=null;var s=document.createElement('script');s.src='https://unpkg.com/mathjax@3/es5/tex-svg-full.js';document.head.appendChild(s);"><\/script><style>` + COMMON_CSS + LD_CSS + '</style><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script></head><body><a href="#ld-main" class="skip-link">Skip to main content</a><header class="ld-top"><a class="ld-brand" href="/" aria-label="QNFO home"><span class="qmark">Q</span> QNFO</a><nav class="ld-nav" aria-label="Main"><a href="/papers">Papers</a><a href="#selected-works">Selected works</a><a href="/about">About</a><a href="/work-with-me">Work with me</a><a href="https://ideas.qnfo.org">Ideas</a><a href="https://archive.qnfo.org">Archive</a><a href="/legal">License</a></nav></header><main class="ld-main" id="ld-main"><section class="ld-hero"><span class="ld-tag">Independent research</span><h1>QNFO</h1><p>QNFO is the independent research imprint of Rowan Brad Quni-Gudzinas. The work asks what computation really costs and delivers: energy per correct answer (Joules-per-Solution), what an AI-assisted claim is worth (ignorance audits), and what an autonomous research system actually delivers. Every work carries a DOI, and corrections ship as new versions.</p><p class="ld-byline">Rowan Brad Quni-Gudzinas \u00b7 <a href="https://orcid.org/0009-0002-4317-5604">ORCID 0009-0002-4317-5604</a> \u00b7 <a href="/about">About</a> \u00b7 <a href="/work-with-me">Work with me</a></p></section>' + selectedWorksHTML() + '<div class="ld-cards">' + cardsHtml + "</div>" + papersHtml + '<section class="ld-sub" id="subscribe" aria-labelledby="ld-sub-h"><h2 id="ld-sub-h">New papers by email</h2><p>QNFO is moving off the social feeds. When new research is published, subscribers get one short weekly digest \u2014 titles, links and DOIs, nothing else.</p><form id="ld-sub-form" novalidate><label class="ld-sr" for="ld-email">Email address</label><input id="ld-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required><input class="ld-hp" type="text" id="ld-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit" id="ld-btn">Subscribe</button></form><p class="ld-msg" id="ld-msg" role="status" aria-live="polite"></p></section></main><footer class="ld-foot"><span>\xA9 2026 QNFO \u00b7 Rowan Brad Quni-Gudzinas</span><a href="/papers">Papers</a><a href="/about">About</a><a href="/work-with-me">Work with me</a><a href="https://ipatent.qnfo.org/">iPatent</a><a href="https://orcid.org/0009-0002-4317-5604">ORCID</a><a href="/legal">QNFO-ULA</a></footer>' + formScript + "</body></html>";
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
// "QNFO", "QNFO Research Agent", "QNFO Research / QWAV") while their Zenodo DOI records list Quni-Gudzinas, Rowan Brad with
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
function buildPaperJsonLd(paper) {
  const title = displayTitle(paper.title) || "Untitled";
  const slug = paper.slug || "";
  const doi = paper.doi || "";
  const abs = (paper.abstract || "").slice(0, 3e3);
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
    license: "https://creativecommons.org/licenses/by/4.0/",
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
  var form = '<section style="max-width:720px;margin:36px auto 10px;padding:18px 20px;border:1px solid #e2dcd0;border-radius:12px;background:#f4f1ea">'
    + '<h2 style="margin:0 0 6px;font-size:17px;color:#1b1915">Get new papers by email</h2>'
    + '<p style="margin:0 0 12px;color:#6b665b;font-size:13.5px">One short weekly digest &mdash; titles, links and DOIs. No tracking; unsubscribe anytime.</p>'
    + '<form id="ld-sub-form" novalidate style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<label for="ld-email" style="position:absolute;left:-9999px">Email address</label>'
    + '<input id="ld-email" type="email" name="email" placeholder="you@example.com" required style="flex:1;min-width:220px;padding:9px 11px;border:1px solid #cfc7b8;border-radius:8px;font-size:14px">'
    + '<input id="ld-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">'
    + '<button type="submit" id="ld-btn" style="padding:9px 16px;border:0;border-radius:8px;background:#24315e;color:#fff;font-size:14px;cursor:pointer">Subscribe</button>'
    + '</form><p id="ld-msg" role="status" aria-live="polite" style="min-height:18px;margin:8px 0 0;font-size:13px"></p></section>';
  var js = "<script>(function(){var f=document.getElementById('ld-sub-form');if(!f)return;var msg=document.getElementById('ld-msg');var btn=document.getElementById('ld-btn');f.addEventListener('submit',function(e){e.preventDefault();var email=(document.getElementById('ld-email').value||'').trim();var hp=(document.getElementById('ld-hp')||{}).value||'';if(!email||email.indexOf('@')<1){msg.textContent='Please enter a valid email address.';return;}btn.disabled=true;msg.textContent='Subscribing...';fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,hp:hp,source:'" + source + "'})}).then(function(r){return r.json().catch(function(){return {};});}).then(function(j){if(j&&j.ok){msg.textContent='Thanks - check your inbox to confirm your subscription.';f.reset();}else{msg.textContent=(j&&j.error)||'Something went wrong. Please try again.';}}).catch(function(){msg.textContent='Network error. Please try again.';}).then(function(){btn.disabled=false;});});})();<\/script>";
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
    let sql = "SELECT slug,title,doi,abstract,created_at,status,version,authors FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined')";
    const params = [];
    if (search) {
      sql += " AND (title LIKE ? OR abstract LIKE ? OR authors LIKE ?)";
      const term = "%" + search + "%";
      params.push(term, term, term);
    }
    sql += " ORDER BY created_at DESC";
    const res = await env.LIVING_PAPER.prepare(sql).bind(...params).all();
    let all = res.results || [];
    // LIVING-PAPERS-1: topic facets (before the topic filter, so every chip shows its count), a 12-month histogram,
    // the newest date and the unfiltered total feed the index; ?sort=new|old|title.
    const facets = {};
    for (const p of all) { p._cat = detectCategory(p.title, p.abstract); facets[p._cat] = (facets[p._cat] || 0) + 1; }
    const latest = all.length ? all[0].created_at : null;
    let allTotal = all.length;
    if (search) { try { const c = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS n FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined')").first(); allTotal = c ? c.n : allTotal; } catch (e) {} }
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
      return new Response(renderIndexHTML(page, total, offset, hasMore, category || null, search, { facets, months, latest, all_total: allTotal, sort }), {
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
    const r = await env.LIVING_PAPER.prepare("SELECT slug,title,status,paper_type,length(COALESCE(body_md,'')) AS body_len,length(COALESCE(abstract,'')) AS abstract_len FROM papers WHERE status NOT IN ('duplicate','kg-backfill','quarantined') AND length(trim(COALESCE(body_md,''))) < 40 AND length(trim(COALESCE(abstract,''))) < 1 ORDER BY status, slug").all();
    const rows = (r && r.results) || [];
    const published = rows.filter(function (x) { return x.status === "published"; });
    return json({ ok: published.length === 0, invariant: "NO-BLANK-PAPER-1", published_no_content: published.length, other_no_content: rows.length - published.length, note: "Renderer emits an abstract/placeholder fallback so no page renders blank; this flags papers with no content at all.", items: rows });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
__name(handleBlankPapers, "handleBlankPapers");
// SCHOLAR-PDF-URL-1 (2026-10-01, agent_issues 1714): Google Scholar indexes a paper only with an absolute citation_pdf_url
// in the same directory as the abstract page, resolving to a searchable PDF of at most 5 MB. Every Zenodo deposit of a paper
// carries its PDF, so /papers/<slug>.pdf streams that file from the paper's own record and the page emits citation_pdf_url
// only when the record has a PDF within the limit. The record lookup is cached for a day (an hour when no PDF is found).
var SCHOLAR_PDF_MAX = 5 * 1024 * 1024;
// SCHOLAR-PDF-UA-1: Zenodo rejects requests without a User-Agent (a Worker fetch sends none), so 3.7.19 cached every
// lookup as "no PDF". The UA is sent, only an HTTP 200 answer is cached, and the lookup status is exposed for diagnosis.
var ZENODO_UA = "QNFO-papers-gateway/3.7 (+https://papers.qnfo.org)";
async function zenodoPdfInfo(recId) {
  const ck = new Request("https://papers.qnfo.org/__zenodo-pdf-info/v2/" + recId);
  try {
    const hit = await caches.default.match(ck);
    if (hit) return await hit.json();
  } catch (e) {
  }
  let info = { url: null, key: null, size: 0, status: 0 };
  try {
    const r = await fetch("https://zenodo.org/api/records/" + recId, { headers: { Accept: "application/json", "User-Agent": ZENODO_UA } });
    info.status = r.status;
    if (r.ok) {
      const d = await r.json();
      const f = (d.files || []).find(function(x) {
        return /\.pdf$/i.test(String(x && x.key || "")) && Number(x.size || 0) > 0 && Number(x.size) <= SCHOLAR_PDF_MAX;
      });
      if (f) info = { url: f.links && f.links.self || "https://zenodo.org/api/records/" + recId + "/files/" + encodeURIComponent(f.key) + "/content", key: f.key, size: Number(f.size), status: r.status };
    }
  } catch (e) {
    info.status = -1;
  }
  if (info.status === 200) {
    try {
      await caches.default.put(ck, new Response(JSON.stringify(info), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + (info.url ? 86400 : 3600) } }));
    } catch (e) {
    }
  }
  return info;
}
__name(zenodoPdfInfo, "zenodoPdfInfo");
function zenodoRecId(doi) {
  const m = String(doi || "").match(/zenodo\.(\d+)\s*$/i);
  return m ? m[1] : null;
}
__name(zenodoRecId, "zenodoRecId");
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
    "SELECT slug,doi,pdf_path FROM papers WHERE slug = ? AND status NOT IN ('duplicate','kg-backfill','quarantined') LIMIT 1"
  ).bind(slug).first();
  if (!paper) return nf;
  const rec = zenodoRecId(paper.doi);
  const info = rec ? await zenodoPdfInfo(rec) : { url: null, status: 0 };
  if (!info.url) {
    const rendered = await servedRenderedPdf(env, paper);
    if (rendered) return rendered;
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-PDF-Lookup": "zenodo-" + info.status } });
  }
  const r = await fetch(info.url, { headers: { "User-Agent": ZENODO_UA }, cf: { cacheEverything: true, cacheTtl: 86400 } });
  if (!r.ok || !r.body) return new Response("PDF temporarily unavailable", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "X-PDF-Lookup": "content-" + r.status } });
  return new Response(r.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="' + slug + '.pdf"', "Cache-Control": "public, max-age=86400" } });
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
      "SELECT slug,title,body_md,abstract,authors,doi,created_at,status,version,pdf_path FROM papers WHERE slug = ? AND status NOT IN ('duplicate','kg-backfill','quarantined') LIMIT 1"
    ).bind(slug).first();
    if (!paper) return json({ error: "Paper not found", slug }, 404);
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/html") || !accept.includes("application/json")) {
      const _rec = zenodoRecId(paper.doi);
      if (_rec) {
        try {
          paper._pdf = !!(await zenodoPdfInfo(_rec)).url;
        } catch (e) {
        }
      }
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
      env.LIVING_PAPER.prepare("SELECT slug,title,created_at FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined') ORDER BY created_at DESC LIMIT 8").all(),
      env.LIVING_PAPER.prepare("SELECT COUNT(*) as cnt FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined')").first(),
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
      env.LIVING_PAPER.prepare("SELECT COUNT(*) as cnt FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined')").first(),
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
  const pageCSS = COMMON_CSS + `
.about-page{max-width:760px;margin:0 auto;padding:1.4rem 1.6rem 0}
.about-page .meta-line{color:var(--muted);font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;margin:-.7rem 0 1.7rem}
.about-page p{color:var(--ink);font-size:.98rem;line-height:1.75;margin-bottom:1.05rem}
.about-page .lede{color:var(--muted);font-size:1.04rem;line-height:1.75}
.about-page .aside{color:var(--muted);font-size:.9rem;line-height:1.7;border-left:2px solid var(--border);padding-left:.9rem;margin:1rem 0}
.record-table{width:100%;border-collapse:collapse;margin:.6rem 0 .5rem;font-size:.95rem}
.record-table td{padding:.55rem .4rem;border-bottom:1px solid var(--border);vertical-align:top}
.record-table td:first-child{color:var(--muted);width:46%}
.record-table td:last-child{font-variant-numeric:tabular-nums}
.record-note{color:var(--muted);font-size:.78rem;line-height:1.65;margin:.4rem 0 1.2rem}
.changelog{width:100%;border-collapse:collapse;font-size:.88rem;margin:.8rem 0 1.2rem}
.changelog td{padding:.5rem .4rem;border-bottom:1px solid var(--border);vertical-align:top}
.changelog td:first-child{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;padding-right:1.2rem;width:7.2rem}
.changelog a{color:var(--accent)}`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>About QNFO \u2014 independent research</title><meta name="description" content="About QNFO, the independent research imprint of Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604): the research line, the selected works and how the work is made."><meta property="og:title" content="About QNFO"><meta property="og:description" content="QNFO is the independent research imprint of Rowan Brad Quni-Gudzinas: what computation really costs and delivers."><meta property="og:type" content="website"><meta property="og:url" content="https://qnfo.org/about"><link rel="canonical" href="https://qnfo.org/about"><meta property="og:site_name" content="QNFO"><meta name="twitter:card" content="summary">${identityJsonLd("https://qnfo.org/about")}<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%2324315e'/><text x='16' y='23' text-anchor='middle' font-size='18' fill='white' font-family='system-ui'>Q</text></svg>"><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script><style>${pageCSS}</style></head><body><a href="#about-main" class="skip-link">Skip to main content</a><nav class="top-nav" role="navigation" aria-label="Main"><a class="brand" href="/" aria-label="QNFO home"><span class="qmark">Q</span> QNFO</a><a href="/papers">Papers</a><a href="/graph">Knowledge Graph</a><a href="/about">About</a><a href="/work-with-me">Work with me</a><a href="https://ideas.qnfo.org">Ideas</a><a href="https://archive.qnfo.org">Archive</a><a href="/legal">License</a></nav><main id="about-main" class="about-page"><h1>About QNFO</h1><p class="meta-line">established 2025 \xB7 living record \xB7 modified 2026-09-03 \xB7 counts queried live</p><p class="lede">QNFO is the independent research imprint of Rowan Brad Quni-Gudzinas: one researcher with an open, auditable, AI-assisted research pipeline. The work asks what computation really costs and delivers: energy per correct answer (Joules-per-Solution), what an AI-assisted claim is worth (ignorance audits), and what an autonomous research system actually delivers. The <a href="/#selected-works">selected works</a> are the place to start.</p><h2>What QNFO is</h2><p>Open research in three lines, in this order: energy-honest computing (the Joules-per-Solution metric), the epistemics of AI-assisted science, and autonomous research operations. Publications carry Zenodo DOIs. The corpus is browsable on <a href="/papers">papers.qnfo.org</a> and mapped in the <a href="/graph">knowledge graph</a>.</p><p class="aside">QNFO is not an acronym. The name is the name.</p><h2>The thesis</h2><p>Computational advantage is measured in joules-per-solution, not qubit counts or press releases. The <a href="https://github.com/rwnq8/joules-per-compute-benchmark">joules-per-compute benchmark</a> formalizes the questions the industry prefers to defer: the Landauer floor for cryogenic controllers, the Margolus\u2013Levitin bound as a scheduling constraint, and the energy floor of surface-code error correction at a thousand logical qubits.</p><p class="aside">The current line of work is energy accounting for quantum hardware claims. Recent papers are listed on the front page.</p><h2>The record</h2><table class="record-table"><tbody><tr><td>Papers in the corpus</td><td>${stats.papers} \u2014 counted live</td></tr><tr><td>Knowledge graph</td><td>${stats.nodes} nodes, ${stats.edges} edges \u2014 counted live</td></tr><tr><td>Queries logged (2026-09-03)</td><td>1,983</td></tr><tr><td>Honest daily readership</td><td>~400 requests per day on /papers/*</td></tr></tbody></table><p class="record-note">The first two rows are queried live on every request. Fleet figures were counted by the operations agent on 2026-09-03. Roughly nine in ten requests to the zone are scanner noise; the readership figure excludes it.</p><h2>How QNFO runs</h2><p>A cloud-scheduled pipeline keeps the corpus alive: an arXiv radar at 08:30 UTC, a research brief at 06:00 UTC, an hourly errata watch that turns corrections into new versions of the same record, a citation watch, and a weekly visibility digest. Outreach is capped and opt-out.</p><p class="aside">If the laptop is off, the pipeline does not notice.</p><h2>How QNFO holds itself</h2><p>Every quantitative claim is computationally verified before publication, with the verification artifacts deposited beside the paper. Traffic is never fabricated. Disconfirmation criteria are stated in advance. Corrections ship as new versions of the same record.</p><p class="aside">The record is the record.</p><h2>The operator</h2><p>QNFO is operated by Rowan Brad Quni-Gudzinas (<a href="https://orcid.org/0009-0002-4317-5604">ORCID 0009-0002-4317-5604</a>). Contact: <a href="mailto:rowan.quni@qnfo.org">rowan.quni@qnfo.org</a>. For assessments, reviews of AI agent operations, talks, research collaboration or roles, see <a href="/work-with-me">Work with me</a>.</p><p class="aside">The corpus discloses its own construction. There is nothing else to disclose.</p><h2>Changelog</h2><table class="changelog"><tbody><tr><td>2026-09-03</td><td>This page, with hub record counts rendered live. Model-key guard on a thirty-minute scheduler cadence.</td></tr><tr><td>2026-09-02</td><td>Outreach engine live \u2014 capped and opt-out. Weekly scorecard publishing real traffic deltas. Website-sync gate fixed.</td></tr><tr><td>2026-08-29</td><td>Universal Ignorance Audit re-pointed to v0.4 (<a href="https://doi.org/10.5281/zenodo.22158133">10.5281/zenodo.22158133</a>).</td></tr><tr><td>2026-08-28</td><td>OSF pre-registrations placed; results attached as comments on frozen registrations.</td></tr><tr><td>2026-08-10</td><td>Email deliverability hardened: SPF, DKIM, DMARC at reject on every sending domain.</td></tr></tbody></table><h2>Colophon</h2><p>One design system across every QNFO surface: warm paper, ink, navy. This page is generated by the qnfo-gateway worker. No tracker is added by this page.</p></main><footer class="site-footer" role="contentinfo"><div class="footer-links"><a href="/papers">Papers</a><a href="/graph">Knowledge Graph</a><a href="/about">About</a><a href="/work-with-me">Work with me</a><a href="/legal">License</a><a href="https://archive.qnfo.org">Archive</a><a href="/legal">Privacy</a></div><p>Licensed under <a href="/legal">QNFO-ULA v2.0</a><br>\xA9 2025\u20132026 QNFO</p></footer></body></html>`;
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
// published record only: the CV (10.5281/zenodo.23082080), the selected works and the deployed fleet size.
var WWM_EMAIL = "rowan.quni@qnfo.org";
var WWM_URL = "https://qnfo.org/work-with-me";
var WWM_CV_DOI = "10.5281/zenodo.23082080";
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
    status: "Results are published openly with DOIs, and every contributor is credited.",
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
    start: "Email me the role and a link to its description. My CV is on Zenodo.",
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
.ww-hero{text-align:left;padding:3.2rem 0 1.4rem}
.ww-hero h1{font-family:'Fraunces',Georgia,serif;font-size:2.6rem;font-weight:600;margin:0 0 .9rem;letter-spacing:-.015em}
.ww-hero p{color:var(--ink);font-size:1.04rem;line-height:1.75;max-width:680px;margin:0 0 .9rem}
.ww-hero .ww-sub{color:var(--muted);font-size:.96rem}
.ww-jump{display:flex;flex-wrap:wrap;gap:.45rem;margin:1.2rem 0 0;padding:0;list-style:none}
.ww-jump a{display:inline-block;font-size:.84rem;color:var(--accent);text-decoration:none;border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:.32rem .8rem}
.ww-jump a:hover{border-color:var(--accent)}
.ww-offers{display:grid;gap:1.1rem;margin-top:1.8rem}
.ww-offer{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem 1.6rem;scroll-margin-top:1rem}
.ww-offer h2{font-family:'Fraunces',Georgia,serif;font-size:1.3rem;font-weight:600;margin:0 0 .2rem}
.ww-offer h3{font-family:'Public Sans',system-ui,sans-serif;font-size:.7rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:1.05rem 0 .3rem}
.ww-offer p,.ww-offer li{font-size:.95rem;line-height:1.65;margin:0}
.ww-offer ul{margin:.1rem 0 0;padding-left:1.15rem}
.ww-offer li+li{margin-top:.35rem}
.ww-note{color:var(--muted);font-size:.88rem!important;border-left:2px solid var(--border);padding-left:.85rem;margin-top:.9rem!important}
.ww-basis{color:var(--muted);font-size:.82rem!important;margin-top:.75rem!important}
.ww-basis a{color:var(--muted)}
.ww-btn{display:inline-block;margin-top:1.1rem;padding:.6rem 1.25rem;border-radius:999px;background:var(--accent);border:1.5px solid var(--accent);color:#fff;text-decoration:none;font-weight:500;font-size:.9rem;transition:all .15s}
.ww-btn:hover{background:#1a2547;border-color:#1a2547}
.ww-btn.ww-ghost{background:transparent;color:var(--accent)}
.ww-btn.ww-ghost:hover{background:var(--accent-soft)}
.ww-tag{display:block;margin-top:.45rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.76rem;color:var(--muted)}
.ww-sec{margin-top:2.8rem;border-top:1px solid var(--border);padding-top:1.5rem}
.ww-sec h2{font-family:'Fraunces',Georgia,serif;font-size:1.25rem;font-weight:600;margin:0 0 .6rem}
.ww-sec p{font-size:.95rem;line-height:1.7;max-width:700px;margin:0 0 .8rem}
.ww-record{list-style:none;padding:0;margin:.3rem 0 .8rem}
.ww-record li{display:grid;grid-template-columns:7.5rem 1fr;gap:1rem;padding:.65rem 0;border-bottom:1px solid var(--border);font-size:.94rem;line-height:1.6}
.ww-record .ww-when{color:var(--muted);font-variant-numeric:tabular-nums;font-size:.86rem}
.ww-record b{font-weight:600}
@media(max-width:640px){.ww-hero h1{font-size:2.1rem}.ww-offer{padding:1.2rem 1.15rem}.ww-record li{grid-template-columns:1fr;gap:.15rem}}
`;
function wwmWorkLinks(idx) {
  if (!idx || !idx.length) return "";
  return '<p class="ww-basis">Based on: ' + idx.map(function(i) {
    const w = SELECTED_WORKS[i];
    return '<a href="https://doi.org/' + w.doi + '">' + esc(w.t) + "</a>";
  }).join("; ") + ".</p>";
}
function wwmOfferHTML(o) {
  const extra = o.key === "role" ? '<p class="ww-basis">CV: <a href="https://doi.org/' + WWM_CV_DOI + '">doi:' + WWM_CV_DOI + "</a>. Earlier work is published under Brad Gudzinas.</p>" : wwmWorkLinks(o.works);
  return '<section class="ww-offer" id="' + o.key + '" aria-labelledby="ww-h-' + o.key + '"><h2 id="ww-h-' + o.key + '">' + esc(o.title) + "</h2><h3>Who it is for</h3><p>" + esc(o.forWho) + "</p><h3>" + esc(o.getLabel) + "</h3><ul>" + o.get.map(function(g) {
    return "<li>" + esc(g) + "</li>";
  }).join("") + '</ul><p class="ww-note">' + esc(o.status) + "</p><h3>How to start</h3><p>" + esc(o.start) + "</p>" + extra + '<a class="ww-btn" data-wwm="' + o.key + '" href="' + wwmMailto(o) + '">Email me about this</a><span class="ww-tag">Subject starts with ' + esc(wwmTag(o.key)) + "</span></section>";
}
function renderWorkWithMeHTML() {
  const title = "Work with me \u00b7 Rowan Brad Quni-Gudzinas \u00b7 QNFO";
  const desc = "Work with Rowan Brad Quni-Gudzinas: energy-per-correct-answer (JPCUB) assessments, reviews of AI research and agent operations, talks and workshops, research collaboration, and research-management and applied-AI roles.";
  const ga = '<!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script>';
  const head = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + esc(title) + '</title><meta name="description" content="' + escAttr(desc) + '"><meta name="author" content="Rowan Brad Quni-Gudzinas"><meta property="og:site_name" content="QNFO"><meta property="og:title" content="' + escAttr(title) + '"><meta property="og:description" content="' + escAttr(desc) + '"><meta property="og:type" content="website"><meta property="og:url" content="' + WWM_URL + '"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="' + escAttr(title) + '"><meta name="twitter:description" content="' + escAttr(desc) + '"><link rel="canonical" href="' + WWM_URL + '">' + workWithMeJsonLd() + `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%2324315e'/><text x='16' y='23' text-anchor='middle' font-size='18' fill='%23faf7f2' font-family='Georgia,serif'>Q</text></svg>"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Public+Sans:wght@400;500;600&display=swap"><style>` + COMMON_CSS + LD_CSS + WWM_CSS + "</style>" + ga + "</head>";
  const nav = '<header class="ld-top"><a class="ld-brand" href="/" aria-label="QNFO home"><span class="qmark">Q</span> QNFO</a><nav class="ld-nav" aria-label="Main"><a href="/papers">Papers</a><a href="#selected-works">Selected works</a><a href="/about">About</a><a href="/work-with-me" aria-current="page">Work with me</a><a href="https://ideas.qnfo.org">Ideas</a><a href="https://archive.qnfo.org">Archive</a><a href="/legal">License</a></nav></header>';
  const jump = '<ul class="ww-jump" aria-label="Offers">' + WWM_OFFERS.map(function(o) {
    return '<li><a href="#' + o.key + '">' + esc(o.title) + "</a></li>";
  }).join("") + '<li><a href="#contact">Something else</a></li></ul>';
  const hero = '<section class="ww-hero"><span class="ld-tag">Work with me</span><h1>Work with me</h1><p>I am Rowan Brad Quni-Gudzinas, and I build research systems that people can check. I have spent 15 years turning data into public decisions, including national research programmes at the U.S. Federal Highway Administration and at AARP\'s Public Policy Institute, where I led the Livability Index. Since 2024 I have run QNFO, an independent research imprint that asks what computation really costs and delivers: energy per correct answer (Joules-per-Solution), what an AI-assisted claim is worth, and what an autonomous research system actually delivers.</p><p class="ww-sub">Five ways to work together. Each says who it is for, what you get and how to start, and each button opens an email to me.</p>' + jump + "</section>";
  const offers = '<div class="ww-offers">' + WWM_OFFERS.map(wwmOfferHTML).join("") + "</div>";
  const record = '<section class="ww-sec" id="record" aria-labelledby="ww-rec-h"><h2 id="ww-rec-h">The record</h2><ul class="ww-record"><li><span class="ww-when">2011 to 2015</span><span><b>U.S. Federal Highway Administration</b>, Data Analyst and Research Manager. Managed a $1.5M federal research portfolio as a certified Contracting Officer\'s Representative, and worked on the national long-distance passenger travel forecasting model.</span></li><li><span class="ww-when">2016 to 2021</span><span><b>AARP Public Policy Institute</b>, Product Manager and Senior Methods Advisor. Led the AARP Livability Index (50+ data sources across 7 domains, scoring U.S. neighborhoods, across multiple public releases) and co-authored its 2018 report.</span></li><li><span class="ww-when">2024 to now</span><span><b>QNFO</b> (independent research), Founder. An open, AI-assisted research pipeline that runs on 44 deployed Cloudflare Workers (October 2026). Every work carries a DOI, and corrections ship as new versions.</span></li></ul><p class="ww-basis">Earlier work is published under Brad Gudzinas. Full CV: <a href="https://doi.org/' + WWM_CV_DOI + '">doi:' + WWM_CV_DOI + '</a> \u00b7 <a href="https://orcid.org/' + OWNER_ORCID + '">ORCID ' + OWNER_ORCID + "</a></p></section>";
  const how = '<section class="ww-sec" id="how" aria-labelledby="ww-how-h"><h2 id="ww-how-h">How I work</h2><p>AI agents do much of QNFO\'s engineering, analysis and drafting under my direction. I am accountable for every result, and each deliverable says which parts were AI-assisted.</p><p>There is no price list. Scope and fee are agreed for each engagement before any work starts; research collaboration has no fee.</p></section>';
  const contact = '<section class="ww-sec" id="contact" aria-labelledby="ww-con-h"><h2 id="ww-con-h">Contact</h2><p>Email <a data-wwm="' + WWM_GENERAL.key + '" href="' + wwmMailto(WWM_GENERAL) + '">' + WWM_EMAIL + "</a>. The buttons above start the subject with a tag such as <code>" + esc(wwmTag("jpcub")) + "</code>. Please keep it: it is how I count which offers bring people here. There is no form on this page; your message arrives in my qnfo.org mailbox like any other email.</p>" + '<a class="ww-btn ww-ghost" data-wwm="' + WWM_GENERAL.key + '" href="' + wwmMailto(WWM_GENERAL) + '">Something else? Email me</a><span class="ww-tag">Subject starts with ' + esc(wwmTag(WWM_GENERAL.key)) + '</span><p class="ww-basis">New papers by email: <a href="/#subscribe">subscribe on the home page</a>.</p></section>';
  const disclosure = '<p class="ww-basis">This page was prepared with an AI-assisted research pipeline; the author is responsible for the content.</p>';
  const foot = '<footer class="ld-foot"><span>\xA9 2026 QNFO \u00b7 Rowan Brad Quni-Gudzinas</span><a href="/papers">Papers</a><a href="/about">About</a><a href="/work-with-me">Work with me</a><a href="https://orcid.org/' + OWNER_ORCID + '">ORCID</a><a href="/legal">QNFO-ULA</a></footer>';
  return head + '<body><a href="#ld-main" class="skip-link">Skip to main content</a>' + nav + '<main class="ld-main" id="ld-main">' + hero + offers + record + how + contact + selectedWorksHTML() + disclosure + "</main>" + foot + "</body></html>";
}
function handleWorkWithMe() {
  return new Response(renderWorkWithMeHTML(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
async function collectPaperUrls(env, recentDays) {
  // WS-A1 (2026-09-26): the scheduled cron submits ONLY recently-changed papers. A full 460-URL
  // submit (ok on the first, operator-side run) exceeds the IndexNow per-key rate budget when
  // repeated daily and returns 429 from the Cloudflare egress IP (FM2). The full set remains
  // available via /api/indexnow?full=1; the cron stays inside the budget.
  var sql = "SELECT slug, created_at FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined')";
  if (recentDays) sql += " AND created_at >= datetime('now','-" + Number(recentDays) + " days')";
  sql += " ORDER BY created_at DESC";
  const res = await env.LIVING_PAPER.prepare(sql).all();
  const base = "https://papers.qnfo.org";
  return [base + "/", base + "/papers"].concat(res.results.map((r) => base + "/papers/" + encodeURIComponent(r.slug)));
}
__name(collectPaperUrls, "collectPaperUrls");
async function indexNowSubmit(urls) {
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
    const body = JSON.stringify({ host: "papers.qnfo.org", key: INDEXNOW_KEY, keyLocation: "https://papers.qnfo.org/" + INDEXNOW_KEY + ".txt", urlList: chunk });
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
async function handleIndexNow(env, full) {
  const urls = await collectPaperUrls(env, full ? null : 7);
  const res = await indexNowSubmit(urls);
  return new Response(JSON.stringify({ ok: true, submitted: urls.length, indexnow: res }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
__name(handleIndexNow, "handleIndexNow");
async function handleSitemap(env, sitemapHost) {
  try {
    const res = await env.LIVING_PAPER.prepare("SELECT slug, created_at FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined') ORDER BY created_at DESC").all();
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
        { loc: base + "/papers", priority: "0.9" }
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
    const res = await env.LIVING_PAPER.prepare("SELECT slug,title,doi,abstract,created_at FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined') ORDER BY created_at DESC LIMIT 200").all();
    const base = "https://papers.qnfo.org";
    let body = "# QNFO Papers\n\n> Open-science research across p-adic mathematics, ultrametric geometry, topological quantum computation.\n\n## Site\n\n- [About QNFO](https://qnfo.org/about)\n- [Work with me: assessments, reviews, talks, collaboration and roles](https://qnfo.org/work-with-me)\n\n## Papers\n\n";
    body += res.results.map((p) => "- [" + displayTitle(p.title) + "](" + base + "/papers/" + encodeURIComponent(p.slug) + ")" + (p.doi ? " (DOI: " + p.doi + ")" : "")).join("\n");
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
    const res = await env.LIVING_PAPER.prepare("SELECT slug,title,doi,abstract,created_at FROM papers WHERE slug IS NOT NULL AND status NOT IN ('duplicate','kg-backfill','quarantined') ORDER BY created_at DESC LIMIT 50").all();
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
function health() {
  return json({ status: "ok", worker: "qnfo-gateway", version: VERSION, capabilities: ["papers-site", "paper-pages", "living-paper-reader", "paper-context-api", "graph-api", "ask-a-paper", "legal-pages", "work-with-me-page"], limitations: ["paper pages ask through ask.qwav.tech /api/ask (qnfo-ai-search 2.1+, the paper pinned as source [1], capped per address); without JavaScript the page is the full static paper", "GET /api/paper-context/<slug> matches qnfo-graph nodes on title terms (two terms, or one of 6+ letters), so a paper outside the graph shows an empty Context tab; versions are papers whose normalized titles match", "qnfo.org/work-with-me has no form: each offer is a mailto to rowan.quni@qnfo.org whose subject starts with [work-with-me:<offer>], counted by qnfo-fleet-dashboard", "Ask-a-paper uses one model (glm-5.3-flash) with a 2048-token cap and only the first 6000 characters of the named paper", "Ask-a-paper allows 10 questions per address per hour and 300 per day in total, questions up to 1000 characters; duplicate, kg-backfill and quarantined papers are excluded", "graph-api reads are public; /query and /sync need the sync token"] });
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
async function handleLegal(path, env) {
  try {
    const body = await env.QNFO_BUCKET.get("legal/ula-v2.0.md").then((o) => o ? o.text() : "QNFO Unified License Agreement v2.0\nFull text at https://legal.qnfo.org");
    const ct = path === "/plain" || path === "/text" ? "text/plain; charset=utf-8" : "text/html; charset=utf-8";
    const isPlain = path === "/plain" || path === "/text";
    if (isPlain) return new Response(await body, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400" } });
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QNFO ULA v2.0</title><meta name="viewport" content="width=device-width,initial-scale=1.0"><link rel="canonical" href="https://legal.qnfo.org"><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script></head><body style="font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:1.5rem"><nav style="margin-bottom:1.5rem"><a href="https://qnfo.org" style="color:#1a56db;text-decoration:none;font-weight:600">\u2190 QNFO Hub</a></nav><pre style="white-space:pre-wrap;font-family:Consolas,monospace;font-size:.88rem;line-height:1.6">' + (await body).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</pre></body></html>",
      { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400" } }
    );
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
async function handleAskAI(request, env) {
  if (!env.AI) return json({ error: "AI binding not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const { slug, question } = body;
  if (!question || typeof question !== "string" || !question.trim()) return json({ error: "Missing question" }, 400);
  if (question.length > ASK_QUESTION_MAX) return json({ error: "Question too long (max " + ASK_QUESTION_MAX + " characters)" }, 413);
  const limited = await askRateCheck(request, env);
  if (limited) return limited;
  try {
    let paperTitle = "", paperBody = "";
    if (slug) {
      const paper = await env.LIVING_PAPER.prepare("SELECT title,body_md,abstract FROM papers WHERE slug = ? AND status NOT IN ('duplicate','kg-backfill','quarantined') LIMIT 1").bind(slug).first();
      if (paper) {
        paperTitle = paper.title || "";
        paperBody = (stripFrontmatter(paper.body_md) || paper.abstract || "").slice(0, 6e3);
      }
    }
    const result = await env.AI.run("@cf/zai-org/glm-5.3-flash", {
      messages: [
        { role: "system", content: 'You are a research assistant for a QNFO paper titled "' + paperTitle + '".' },
        { role: "user", content: question + "\n\nPaper content: " + paperBody }
      ],
      max_tokens: 2048
    });
    return json({ answer: result?.response || "No response generated.", slug: slug || null });
  } catch (e) {
    return json({ error: "The model call failed; try again later." }, 502);
  }
}
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
      body: JSON.stringify({ email, hp: String(payload && payload.hp || ""), source: String(payload && payload.source || "qnfo.org").slice(0, 80) }),
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
var LP_EXCLUDE = "('duplicate','kg-backfill','quarantined')";
var LP_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap">';
var LP_THEME_BOOT = "<script>(function(){try{var t=localStorage.getItem('qnfo-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}})()<\/script>";
var LP_GA = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script>';
var LP_MATHJAX = '<script>window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]],displayMath:[["$$","$$"]],processEscapes:true},svg:{scale:1.05,fontCache:"global"},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"],enableMenu:false},startup:{typeset:true}};<\/script><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js" id="MathJax-script" onerror="this.onerror=null;var s=document.createElement(&quot;script&quot;);s.src=&quot;https://unpkg.com/mathjax@3/es5/tex-svg-full.js&quot;;document.head.appendChild(s);"><\/script>';
var LP_MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 16h7M13 16l7-8M13 16l7 8M20 8h6M20 24h6M20 8l4-4M20 24l4 4" stroke="var(--teal)" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="6" cy="16" r="3" fill="var(--ink)"/></svg>';
var LP_THEME_BTN = '<button class="q-theme" id="q-theme" type="button" aria-label="Switch colour theme"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/></svg></button>';
var LP_CAT_ORDER = ["qec", "number-theory", "physics", "computer-science", "other"];
var LP_CAT_VAR = { "qec": "--teal", "number-theory": "--violet", "physics": "--rust", "computer-science": "--amber", "other": "--muted" };
var LP_DS = ":root{--paper:#F5F7FB;--surface:#FFFFFF;--ink:#182042;--muted:#5A6386;--rule:#D9DEEC;--wash:#E9EDF7;--teal:#0E7C70;--teal-wash:#DDF1EE;--amber:#8A5300;--amber-wash:#FCEFD6;--red:#B42318;--red-wash:#FDECEA;--green:#157F3B;--green-wash:#E5F4EA;--violet:#5B4BB7;--violet-wash:#ECE9FA;--rust:#B5562A;--rust-wash:#FBE9E0;--serif:\"Newsreader\",Georgia,\"Times New Roman\",serif;--sans:\"Familjen Grotesk\",system-ui,-apple-system,\"Segoe UI\",sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--r-sm:6px;--r:10px;--r-lg:14px;--shadow:0 1px 2px rgba(24,32,66,.06),0 8px 24px -12px rgba(24,32,66,.18);color-scheme:light}@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){--paper:#141A33;--surface:#1B2346;--ink:#E6E8F3;--muted:#9AA3C6;--rule:#2D3762;--wash:#222B52;--teal:#5FD3C4;--teal-wash:#173B45;--amber:#F2B544;--amber-wash:#3A2F1A;--red:#FF8A80;--red-wash:#3A1D22;--green:#6FD39A;--green-wash:#163326;--violet:#A99BFF;--violet-wash:#2A2752;--rust:#F08A5D;--rust-wash:#3A2420;--shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px -14px rgba(0,0,0,.6);color-scheme:dark}}:root[data-theme=\"dark\"]{--paper:#141A33;--surface:#1B2346;--ink:#E6E8F3;--muted:#9AA3C6;--rule:#2D3762;--wash:#222B52;--teal:#5FD3C4;--teal-wash:#173B45;--amber:#F2B544;--amber-wash:#3A2F1A;--red:#FF8A80;--red-wash:#3A1D22;--green:#6FD39A;--green-wash:#163326;--violet:#A99BFF;--violet-wash:#2A2752;--rust:#F08A5D;--rust-wash:#3A2420;--shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px -14px rgba(0,0,0,.6);color-scheme:dark}[hidden]{display:none!important}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-padding-top:84px}body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.5 var(--sans);font-feature-settings:\"tnum\" 1;-webkit-font-smoothing:antialiased}a{color:inherit;text-underline-offset:3px;text-decoration-thickness:1px}a:hover{color:var(--teal)}:focus-visible{outline:2px solid var(--teal);outline-offset:2px;border-radius:4px}button{font:inherit;color:inherit;cursor:pointer}.sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.wrap{max-width:1240px;margin:0 auto;padding:0 24px}.q-top{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid transparent;transition:border-color .2s}.q-top.scrolled{border-bottom-color:var(--rule)}.q-top .wrap{display:flex;align-items:center;gap:22px;height:64px}.q-mark{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:600;font-size:17px;letter-spacing:-.01em;white-space:nowrap}.q-mark svg{width:26px;height:26px;flex:none}.q-mark small{font-weight:400;color:var(--muted);font-size:15px}.q-nav{display:flex;gap:4px;margin-left:auto;font-size:14.5px;color:var(--muted)}.q-nav a{text-decoration:none;padding:6px 10px;border-radius:8px}.q-nav a:hover{background:var(--wash);color:var(--ink)}.q-nav a[aria-current]{color:var(--ink);background:var(--wash);font-weight:500}.q-theme{border:1px solid var(--rule);background:none;border-radius:999px;width:34px;height:34px;display:grid;place-items:center;color:var(--muted);flex:none}.q-theme:hover{color:var(--ink);border-color:var(--muted)}.q-theme svg{width:16px;height:16px}.q-btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--rule);background:var(--surface);border-radius:10px;padding:8px 14px;font-weight:500;font-size:14px;text-decoration:none;color:var(--ink);white-space:nowrap;transition:border-color .15s,background .15s}.q-btn:hover{border-color:var(--muted);color:var(--ink)}.q-btn svg{width:16px;height:16px;flex:none}.q-btn.pri{background:var(--ink);border-color:var(--ink);color:var(--paper)}.q-btn.pri:hover{opacity:.9;color:var(--paper)}.q-btn.teal{background:var(--teal);border-color:var(--teal);color:var(--paper)}.q-btn.teal:hover{color:var(--paper);opacity:.92}.q-btn:disabled{opacity:.45;cursor:default}.q-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--rule);background:var(--surface);border-radius:999px;padding:5px 12px;font-size:13.5px;text-decoration:none;color:var(--ink);white-space:nowrap}.q-chip:hover{border-color:var(--muted);color:var(--ink)}.q-chip[aria-pressed=\"true\"],.q-chip.on{background:var(--ink);border-color:var(--ink);color:var(--paper)}.q-chip b{font-weight:600;font-variant-numeric:tabular-nums;opacity:.7}.q-eyebrow{font:600 12px/1 var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--teal)}.q-card{background:var(--surface);border:1px solid var(--rule);border-radius:var(--r-lg)}.q-tag{display:inline-flex;align-items:center;gap:5px;font:600 11.5px/1 var(--sans);letter-spacing:.04em;text-transform:uppercase;padding:4px 8px;border-radius:6px;background:var(--wash);color:var(--muted)}.q-foot{border-top:1px solid var(--rule);margin-top:64px;padding:26px 0 44px;font-size:13.5px;color:var(--muted)}.q-foot .wrap{display:flex;gap:10px 22px;flex-wrap:wrap;align-items:center}.q-foot a{color:var(--muted)}.q-foot a:hover{color:var(--teal)}.q-skel{display:block;height:13px;border-radius:4px;background:linear-gradient(90deg,var(--wash),var(--rule),var(--wash));background-size:200% 100%;animation:qsk 1.4s ease infinite;margin:10px 0}@keyframes qsk{to{background-position:-200% 0}}.q-spin{display:inline-block;width:12px;height:12px;border:2px solid var(--rule);border-top-color:var(--teal);border-radius:50%;animation:qsp .8s linear infinite;vertical-align:-1px}@keyframes qsp{to{transform:rotate(360deg)}}.q-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:var(--ink);color:var(--paper);padding:10px 16px;border-radius:10px;font-size:14px;opacity:0;pointer-events:none;transition:all .2s;z-index:90}.q-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}@media (max-width:760px){.wrap{padding:0 16px}.q-nav{display:none}.q-theme{margin-left:auto}.q-top .wrap{height:56px}}@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}@media print{.q-top,.q-foot,.q-theme,.no-print{display:none!important}body{background:#fff;color:#000}}";
var LP_CSS = ".dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c,var(--muted));flex:none}/* index */.ix-hero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.75fr);gap:56px;padding:44px 24px 36px;align-items:start}.ix-intro h1{font:500 clamp(34px,4.4vw,56px)/1.04 var(--serif);letter-spacing:-.02em;margin:14px 0 18px;max-width:17ch}.lede{font:400 19px/1.55 var(--serif);color:var(--muted);max-width:56ch;margin:0 0 26px}.ix-search{position:relative;display:flex;align-items:center;background:var(--surface);border:1.5px solid var(--rule);border-radius:var(--r-lg);padding:0 14px;max-width:620px;transition:border-color .15s,box-shadow .15s}.ix-search:focus-within{border-color:var(--teal);box-shadow:0 0 0 4px var(--teal-wash)}.ix-search svg{width:19px;height:19px;color:var(--muted);flex:none}.ix-search input{flex:1;border:0;background:none;outline:none;font:400 18px/1.3 var(--serif);color:var(--ink);padding:15px 12px;min-width:0}.ix-search input::placeholder{color:var(--muted)}.ix-search input::-webkit-search-cancel-button{-webkit-appearance:none}kbd{font:500 12px/1 var(--mono);border:1px solid var(--rule);border-bottom-width:2px;border-radius:5px;padding:3px 6px;color:var(--muted);background:var(--paper)}.ix-hint{font-size:14px;color:var(--muted);margin:12px 2px 0}.ix-hint a{color:var(--teal);font-weight:500}.ix-stats{padding:22px 22px 18px}.ix-n{display:flex;align-items:flex-end;gap:12px;margin-bottom:16px}.ix-n b{font:500 54px/.9 var(--serif);letter-spacing:-.03em}.ix-n span{font-size:13.5px;color:var(--muted);line-height:1.35;padding-bottom:4px}.hist{width:100%;height:auto;display:block}.hist rect{fill:var(--teal);opacity:.35}.hist rect.now{opacity:1}.hist g:hover rect{opacity:.85}.hist text{font:500 10.5px var(--sans);fill:var(--muted)}.ix-cap{font-size:12px;color:var(--muted);margin:4px 0 16px}.catbar{display:flex;height:8px;border-radius:99px;overflow:hidden;gap:2px;margin-bottom:12px}.catbar span{background:var(--c)}.ix-legend{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:13px;color:var(--muted)}.ix-legend li{display:flex;align-items:center;gap:7px}.ix-legend b{margin-left:auto;color:var(--ink);font-weight:600}.ix-controls{position:sticky;top:64px;z-index:30;background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}.ix-controls .wrap{display:flex;align-items:center;gap:16px;padding-top:10px;padding-bottom:10px}.ix-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;flex:1;padding:2px}.ix-chips::-webkit-scrollbar{display:none}.ix-chips .q-chip.on .dot{background:var(--paper)}.ix-sort{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--muted)}.ix-sort select{font:500 14px var(--sans);color:var(--ink);background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:6px 26px 6px 10px;-webkit-appearance:none;appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 13px) 50%,calc(100% - 8px) 50%;background-size:5px 5px;background-repeat:no-repeat}.ix-list{padding-top:28px}.ix-h{font:500 26px/1.2 var(--serif);margin:0 0 6px;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.ix-count{font:500 14px var(--sans);color:var(--muted)}.plist{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 40px}.plist.busy{opacity:.45;transition:opacity .15s}.pc{padding:22px 0;border-bottom:1px solid var(--rule);display:flex;flex-direction:column;animation:pcin .3s ease both}@keyframes pcin{from{opacity:0;transform:translateY(6px)}}.pc-meta{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);margin-bottom:8px;flex-wrap:wrap}.pc-cat{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--c)}.pc-cat::before{content:\"\";width:7px;height:7px;border-radius:50%;background:var(--c)}.pc-v{font:600 11.5px var(--sans);background:var(--wash);border-radius:5px;padding:2px 6px}.pc-t{font:500 21px/1.25 var(--serif);margin:0 0 8px;letter-spacing:-.005em}.pc-t a{text-decoration:none}.pc-t a:hover{color:var(--teal)}.pc-a{margin:0 0 12px;font-size:14.5px;line-height:1.55;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.pc-x{display:flex;gap:16px;font-size:13.5px;margin-top:auto;flex-wrap:wrap}.pc-x a{color:var(--teal);font-weight:600;text-decoration:none}.pc-x a:hover{text-decoration:underline}.pc-x a.pc-doi{color:var(--muted);font-weight:400;margin-left:auto;font-variant-numeric:tabular-nums}.empty{grid-column:1/-1;padding:40px 0;color:var(--muted);font:400 18px var(--serif)}.empty a{color:var(--teal)}.ix-more{text-align:center;padding:26px 0}.sub{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:8px 32px;align-items:center;padding:24px 26px;margin:40px 0 0}.sub h2{font:500 22px/1.2 var(--serif);margin:0 0 4px}.sub p{margin:0;color:var(--muted);font-size:14px}.sub form{display:flex;gap:8px}.sub input[type=email]{flex:1;min-width:0;border:1px solid var(--rule);background:var(--paper);color:var(--ink);border-radius:10px;padding:10px 12px;font:inherit}.sub input[type=email]:focus{outline:none;border-color:var(--teal)}#ld-msg{grid-column:1/-1;min-height:18px;font-size:13.5px}/* paper */.rp{position:fixed;top:0;left:0;right:0;height:3px;z-index:60;pointer-events:none}.rp span{display:block;height:100%;width:0;background:var(--teal);transition:width .08s linear}.pp{padding-top:22px}.crumbs{display:flex;gap:8px;font-size:13.5px;color:var(--muted);margin-bottom:22px}.crumbs a{text-decoration:none}.crumbs a:hover{color:var(--teal)}.ph{max-width:880px;margin:0 0 30px}.ph h1{font:500 clamp(30px,3.7vw,46px)/1.1 var(--serif);letter-spacing:-.018em;margin:0 0 16px;text-wrap:balance}.by{font:400 17px/1.4 var(--serif);margin:0 0 14px}.by a{text-decoration:none}.by a:hover{text-decoration:underline}.orcid{width:15px;height:15px;vertical-align:-2px;margin-left:5px}.ph-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;font-size:14px;color:var(--muted)}.ph-meta a{color:var(--muted)}.q-tag.live{background:var(--teal-wash);color:var(--teal);text-transform:none;letter-spacing:0;font-size:12.5px;padding:5px 9px}.q-tag.live i{width:7px;height:7px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 0 var(--teal);animation:pulse 2.4s ease infinite}@keyframes pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--teal) 55%,transparent)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}.ph-act{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.pp-grid{display:grid;grid-template-columns:220px minmax(0,1fr) 360px;gap:48px;align-items:start}.toc{position:sticky;top:88px;max-height:calc(100vh - 110px);overflow:auto;font-size:13.5px;scrollbar-width:thin}.toc-d summary{font:600 12px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);cursor:pointer;list-style:none;margin-bottom:10px}.toc-d summary::-webkit-details-marker{display:none}.toc-l{list-style:none;margin:0;padding:0;border-left:1px solid var(--rule)}.toc-l a{display:block;padding:5px 0 5px 14px;margin-left:-1px;border-left:2px solid transparent;text-decoration:none;color:var(--muted);line-height:1.35}.toc-l .lv3 a{padding-left:26px;font-size:13px}.toc-l a:hover{color:var(--ink)}.toc-l a.on{color:var(--ink);border-left-color:var(--teal);font-weight:500}.prose{font:400 18.5px/1.68 var(--serif);max-width:72ch;min-width:0;overflow-wrap:break-word;hyphens:auto;-webkit-hyphens:auto}.prose p{margin:0 0 1.05em}.prose h2{font:500 27px/1.2 var(--serif);letter-spacing:-.01em;margin:2em 0 .6em;position:relative;hyphens:none}.prose h3{font:600 20px/1.3 var(--serif);margin:1.7em 0 .5em;position:relative;hyphens:none}.prose h4{font:600 italic 18.5px/1.35 var(--serif);margin:1.4em 0 .4em;position:relative}.prose .hx{position:absolute;left:-1.05em;color:var(--rule);text-decoration:none;opacity:0;transition:opacity .15s;font-weight:400}.prose h2:hover .hx,.prose h3:hover .hx,.prose h4:hover .hx,.prose .hx:focus{opacity:1}.prose .hx:hover{color:var(--teal)}.prose ul,.prose ol{padding-left:1.4em;margin:0 0 1.05em}.prose li{margin-bottom:.35em}.prose a{color:var(--teal);text-decoration-color:color-mix(in srgb,var(--teal) 40%,transparent)}.prose blockquote{margin:1.3em 0;padding:.2em 0 .2em 1.1em;border-left:3px solid var(--teal);color:var(--muted);font-style:italic}.prose table{width:100%;border-collapse:collapse;margin:1.3em 0;font:400 14.5px/1.45 var(--sans);display:block;overflow-x:auto}.prose th{text-align:left;font-weight:600;border-bottom:1.5px solid var(--ink);padding:8px 10px;white-space:nowrap}.prose td{border-bottom:1px solid var(--rule);padding:7px 10px;vertical-align:top}.prose pre{font:13.5px/1.55 var(--mono);background:var(--surface);border:1px solid var(--rule);border-radius:var(--r);padding:14px 16px;overflow-x:auto;white-space:pre}.prose code{font:.84em var(--mono);background:var(--wash);padding:1px 5px;border-radius:4px}.prose pre code{background:none;padding:0}.prose hr{border:0;border-top:1px solid var(--rule);margin:2em 0}.prose img{max-width:100%;height:auto;border-radius:var(--r)}.prose mjx-container{max-width:100%;overflow-x:auto;overflow-y:hidden}.prose mjx-container[display=\"true\"]{margin:1.1em 0!important;padding:4px 0}.prose .math-display{text-align:center;margin:1.1em 0;overflow-x:auto}.abstract{background:var(--surface);border:1px solid var(--rule);border-left:3px solid var(--teal);border-radius:0 var(--r-lg) var(--r-lg) 0;padding:6px 26px 10px;margin:0 0 2.2em;font-size:17.5px}.abstract h2{font:600 12px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--teal);margin:16px 0 10px}.abstract .hx{display:none}.cite-n{color:var(--teal);font:600 .82em var(--sans);text-decoration:none;cursor:help;padding:0 1px;border-radius:3px}.cite-n:hover,.cite-n:focus{background:var(--teal-wash)}.refpop{position:absolute;z-index:70;max-width:380px;background:var(--surface);border:1px solid var(--rule);border-radius:var(--r);box-shadow:var(--shadow);padding:12px 14px;font:400 14px/1.45 var(--sans);color:var(--ink)}.refpop b{color:var(--teal)}.selpop{position:absolute;z-index:70;display:flex;gap:2px;background:var(--ink);border-radius:10px;padding:4px;box-shadow:var(--shadow)}.selpop[hidden]{display:none}.selpop button{display:flex;align-items:center;gap:6px;border:0;background:none;color:var(--paper);font-size:13.5px;font-weight:500;padding:7px 10px;border-radius:7px}.selpop button:hover{background:color-mix(in srgb,var(--paper) 16%,transparent)}.selpop svg{width:15px;height:15px}mark.hl{background:var(--amber-wash);color:inherit;border-radius:3px;box-shadow:0 0 0 2px var(--amber-wash)}.rail{position:sticky;top:88px;max-height:calc(100vh - 104px);display:flex}.rail-in{display:flex;flex-direction:column;width:100%;background:var(--surface);border:1px solid var(--rule);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow)}.tabs{display:flex;border-bottom:1px solid var(--rule);padding:0 6px;flex:none}.tabs button{flex:1;border:0;background:none;padding:13px 4px 11px;font-size:13.5px;font-weight:500;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}.tabs button[aria-selected=\"true\"]{color:var(--ink);border-bottom-color:var(--teal)}.tabs button:hover{color:var(--ink)}.tp{padding:16px;overflow:auto;flex:1;min-height:0}#ask-f{display:flex;flex-direction:column;gap:8px}#ask-q{width:100%;border:1.5px solid var(--rule);border-radius:var(--r);background:var(--paper);color:var(--ink);font:400 16px/1.4 var(--serif);padding:10px 12px;resize:vertical;min-height:64px;max-height:200px}#ask-q:focus{outline:none;border-color:var(--teal)}#ask-f .q-btn{align-self:flex-end}.sugg{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}.sugg .q-chip{font-size:12.5px;padding:4px 10px;white-space:normal;text-align:left}.fine{font-size:12px;color:var(--muted);margin:14px 0 0;line-height:1.45}.turn{border-top:1px solid var(--rule);margin-top:14px;padding-top:14px}.turn .q{font:500 15.5px/1.35 var(--serif);margin:0 0 8px}.turn .st{font-size:13px;color:var(--muted);display:flex;gap:8px;align-items:center}.ans{font:400 15.5px/1.6 var(--serif)}.ans p{margin:0 0 .75em}.ans ul,.ans ol{padding-left:1.25em;margin:0 0 .75em}.ans h3,.ans h4{font:600 15px var(--sans);margin:1em 0 .35em}.ans a.c{color:var(--amber);font:600 .78em var(--sans);text-decoration:none;background:var(--amber-wash);border-radius:4px;padding:0 4px;margin:0 1px;vertical-align:1px}.ans .cur::after{content:\"\";display:inline-block;width:7px;height:15px;background:var(--teal);vertical-align:-2px;margin-left:2px;animation:blink 1s steps(2) infinite}@keyframes blink{50%{opacity:0}}.srcs{list-style:none;margin:10px 0 0;padding:0;font-size:13px}.srcs li{display:grid;grid-template-columns:22px 1fr;gap:8px;padding:6px 0;border-top:1px dashed var(--rule)}.srcs .n{font:600 11.5px/20px var(--sans);text-align:center;background:var(--amber-wash);color:var(--amber);border-radius:5px;height:20px}.srcs a{text-decoration:none;font:500 14px/1.3 var(--serif)}.srcs a:hover{color:var(--teal)}.srcs .here{color:var(--teal);font:600 11px var(--sans);text-transform:uppercase;letter-spacing:.05em;margin-left:6px}.fu{display:flex;flex-direction:column;gap:6px;margin-top:10px}.fu button{text-align:left;border:1px solid var(--rule);background:var(--paper);border-radius:8px;padding:7px 10px;font:400 14px/1.35 var(--serif)}.fu button:hover{border-color:var(--teal)}.fb{display:flex;gap:10px;align-items:center;font-size:12.5px;color:var(--muted);margin-top:10px}.fb button{border:1px solid var(--rule);background:none;border-radius:6px;padding:3px 9px;font-size:12.5px}.fb button:hover{border-color:var(--teal);color:var(--teal)}.err{color:var(--red);font-size:14px}.ctx-g{margin:0 0 18px}.ctx-g h3{font:600 12px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}.ctx-l{display:flex;flex-wrap:wrap;gap:6px}.ctx-l button{display:inline-flex;align-items:center;gap:7px;text-align:left;border:1px solid var(--rule);background:var(--paper);border-radius:8px;padding:6px 10px;font:400 14px/1.3 var(--serif);color:var(--ink)}.ctx-l button:hover{border-color:var(--c)}.ctx-l button i{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}.ctx-l.q button{width:100%}.ctx-l.q button i{border-radius:2px;transform:rotate(45deg)}.mini{width:100%;height:190px;display:block;margin:0 0 14px;border-radius:var(--r);background:var(--paper)}.mini line{stroke:var(--rule);stroke-width:1.2}.mini circle{stroke:var(--surface);stroke-width:2}.mini text{font:500 9.5px var(--sans);fill:var(--muted)}.mini g.c{cursor:pointer}.mini g.c:hover text{fill:var(--ink)}.vl,.rl{list-style:none;margin:0;padding:0}.vl li{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--rule);font-size:13.5px;align-items:baseline}.vl .v{font:600 12px var(--sans);background:var(--wash);border-radius:5px;padding:2px 7px;text-align:center}.vl .cur .v{background:var(--teal);color:var(--paper)}.vl a{text-decoration:none;font:400 14.5px/1.3 var(--serif)}.vl small{grid-column:2;color:var(--muted)}.rl li{padding:11px 0;border-bottom:1px solid var(--rule)}.rl a{text-decoration:none;font:500 15px/1.3 var(--serif);display:block;margin-bottom:3px}.rl a:hover{color:var(--teal)}.rl p{margin:0;font-size:13px;color:var(--muted);line-height:1.45}.rl small{font-size:12px;color:var(--muted)}.none{font-size:14px;color:var(--muted)}.fab{display:none}dialog#cite-d{padding:24px;max-width:620px;width:calc(100% - 32px);color:var(--ink);box-shadow:var(--shadow)}dialog#cite-d::backdrop{background:rgba(10,14,30,.45);backdrop-filter:blur(2px)}#cite-d h2{font:500 24px var(--serif);margin:0 0 14px}.cite-tabs{display:flex;gap:6px;margin-bottom:12px}#cite-t{font:13px/1.55 var(--mono);background:var(--paper);border:1px solid var(--rule);border-radius:var(--r);padding:14px;white-space:pre-wrap;word-break:break-word;margin:0 0 14px;max-height:50vh;overflow:auto}.cite-a{display:flex;gap:8px;justify-content:flex-end}@media (max-width:1240px){.pp-grid{grid-template-columns:190px minmax(0,1fr) 320px;gap:32px}}@media (max-width:1080px){.pp-grid{grid-template-columns:minmax(0,1fr) 330px}.toc{position:static;grid-column:1/-1;max-height:none}.toc-d{background:var(--surface);border:1px solid var(--rule);border-radius:var(--r-lg);padding:14px 16px}.toc-d:not([open]) summary{margin:0}.ix-hero{grid-template-columns:1fr;gap:28px}.plist{grid-template-columns:1fr}}@media (max-width:860px){.pp-grid{grid-template-columns:minmax(0,1fr)}.rail{position:static;max-height:none}.rail-in{max-height:none}.tp{max-height:none}.fab{display:inline-flex;position:fixed;right:16px;bottom:18px;z-index:50;align-items:center;gap:8px;border:0;background:var(--teal);color:var(--paper);border-radius:999px;padding:12px 18px;font-weight:600;box-shadow:var(--shadow)}.fab svg{width:18px;height:18px}.prose{font-size:17.5px}.prose .hx{display:none}.sub{grid-template-columns:1fr}}@media (max-width:560px){.ix-hero{padding:24px 16px 22px}.ix-intro h1{font-size:34px}.lede{font-size:17px}.ix-stats{display:none}.ix-controls{top:56px}.ix-sort span{display:none}.pc-t{font-size:19px}.pc-x a.pc-doi{display:none}.ph h1{font-size:28px}.ph-act .q-btn{padding:8px 11px}.abstract{padding:4px 16px 8px;font-size:16.5px}.prose{font-size:17px;line-height:1.62}.sub form{flex-direction:column}}@media print{.pp-grid{display:block}.prose{max-width:none;font-size:11pt}.abstract{border:1px solid #999}.rp{display:none}}";
function lpHeader(current) {
  const nav = [["Papers", "/papers", "papers"], ["Ask", LP_ASK, "ask"], ["Idea threads", "https://ideas.qnfo.org", "ideas"], ["QWAV", "https://qwav.org", "qwav"], ["QNFO", "https://qnfo.org", "qnfo"]];
  return '<header class="q-top" id="q-top"><div class="wrap"><a class="q-mark" href="/papers" aria-label="QNFO Papers home">' + LP_MARK + 'QNFO <small>Papers</small></a><nav class="q-nav" aria-label="QNFO sites">' + nav.map(function(n) {
    return '<a href="' + n[1] + '"' + (n[2] === current ? ' aria-current="page"' : "") + ">" + n[0] + "</a>";
  }).join("") + "</nav>" + LP_THEME_BTN + "</div></header>";
}
function lpFooter() {
  return '<footer class="q-foot"><div class="wrap"><span>QNFO Papers: open research, every paper with a permanent DOI</span><a href="/rss.xml">RSS</a><a href="/sitemap.xml">Sitemap</a><a href="/llms.txt">llms.txt</a><a href="' + LP_ASK + '">Ask the corpus</a><a href="https://legal.qnfo.org">License: QNFO-ULA v2.0</a><a href="https://orcid.org/' + OWNER_ORCID + '">ORCID</a></div></footer><div class="q-toast" id="q-toast" role="status" aria-live="polite"></div>';
}
function lpDoc(o) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F5F7FB" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#141A33" media="(prefers-color-scheme: dark)">' + LP_THEME_BOOT + (o.head || "") + LP_FONTS + (o.math ? LP_MATHJAX : "") + "<style>" + LP_DS + LP_CSS + "</style>" + LP_GA + '</head><body class="' + (o.cls || "") + '">' + lpHeader(o.nav) + o.body + lpFooter() + "<script>" + LP_COMMON_JS + "<\/script>" + (o.js ? "<script>" + o.js + "<\/script>" : "") + "</body></html>";
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
  let a = mathPlain(String(ab || "").replace(/\s+/g, " ").trim());
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
  return '<li class="pc" data-cat="' + cat + '"><div class="pc-meta"><span class="pc-cat" style="--c:var(' + (LP_CAT_VAR[cat] || "--muted") + ')">' + esc(cl) + '</span><time datetime="' + escAttr(String(p.created_at || "").slice(0, 10)) + '">' + esc(lpDate(p.created_at)) + "</time>" + ver + '</div><h3 class="pc-t"><a href="' + href + '">' + titleHTML(p.title) + '</a></h3><p class="pc-a">' + esc(lpExcerpt(p.abstract, 300)) + '</p><div class="pc-x"><a href="' + href + '">Read</a><a href="' + escAttr(askHref) + '">Ask about it</a>' + (p.doi ? '<a class="pc-doi" href="https://doi.org/' + escAttr(p.doi) + '">doi:' + esc(p.doi) + "</a>" : "") + "</div></li>";
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
  const title = searchQuery ? 'Search: "' + esc(searchQuery) + '" \u2014 QNFO Papers' : activeCategory ? (CATEGORY_LABELS[activeCategory] || activeCategory) + " Papers \u2014 QNFO" : "QNFO Papers \u2014 open research with permanent DOIs";
  const head = "<title>" + title + '</title><meta name="description" content="' + escAttr(all + " open-access papers from the QNFO research program: p-adic and adelic physics, ultrametric information, topological quantum computing and computer science. Every paper has a Zenodo DOI.") + '"><link rel="canonical" href="https://papers.qnfo.org/papers"><link rel="alternate" type="application/rss+xml" title="QNFO Papers RSS" href="/rss.xml"><meta property="og:title" content="QNFO Papers"><meta property="og:type" content="website"><meta property="og:url" content="https://papers.qnfo.org/papers"><meta property="og:description" content="' + escAttr(all + " open research papers, each with a permanent DOI.") + '">';
  const body = '<main id="main"><section class="wrap ix-hero"><div class="ix-intro"><p class="q-eyebrow">Open research library</p><h1>Papers you can read, cite and question</h1><p class="lede">' + all + ' papers from the QNFO program on p-adic and adelic physics, ultrametric information, topological quantum computing and the computer science around them. Each one has a permanent Zenodo DOI, renders its mathematics, and can be questioned in place.</p><form class="ix-search" method="get" action="/papers" role="search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14 14l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><label class="sr" for="ix-q">Search papers</label><input id="ix-q" type="search" name="search" value="' + (searchQuery ? escAttr(searchQuery) : "") + '" placeholder="Search titles and abstracts" autocomplete="off">' + (activeCategory ? '<input type="hidden" name="category" value="' + escAttr(activeCategory) + '">' : "") + '<kbd>/</kbd></form><p class="ix-hint">Looking for an answer rather than a paper? <a href="' + LP_ASK + '">Ask the whole corpus</a>: answers cite the papers they come from.</p></div><aside class="ix-stats q-card" aria-label="Library at a glance"><div class="ix-n"><b>' + all + "</b><span>papers" + (latest ? "<br>newest " + esc(latest) : "") + "</span></div>" + lpHistogram(extra.months) + '<p class="ix-cap">Published per month</p>' + bar + '<ul class="ix-legend">' + LP_CAT_ORDER.map(function(c) {
    return '<li><i class="dot" style="--c:var(' + LP_CAT_VAR[c] + ')"></i>' + esc(CATEGORY_LABELS[c] || c) + " <b>" + (facets[c] || 0) + "</b></li>";
  }).join("") + '</ul></aside></section><section class="ix-controls"><div class="wrap"><div class="ix-chips" id="ix-chips" role="group" aria-label="Topic">' + chips + '</div><label class="ix-sort"><span>Sort</span><select id="ix-sort" aria-label="Sort papers"><option value="new"' + (sort === "new" ? " selected" : "") + '>Newest</option><option value="old"' + (sort === "old" ? " selected" : "") + '>Oldest</option><option value="title"' + (sort === "title" ? " selected" : "") + '>Title A\u2013Z</option></select></label></div></section><section class="wrap ix-list"><h2 class="ix-h"><span id="ix-head">' + heading + '</span> <span class="ix-count" id="paper-count">' + total + " paper" + (total === 1 ? "" : "s") + '</span></h2><ol class="plist paper-list" id="plist" data-offset="' + (offset + papers.length) + '" data-more="' + (hasMore ? "1" : "0") + '">' + (papers.length ? papers.map(lpPaperRow).join("") : '<li class="empty">No paper matches. <a href="' + LP_ASK + "/?q=" + encodeURIComponent(searchQuery || "") + '">Ask the corpus instead</a>.</li>') + '</ol><div class="ix-more" id="ix-more">' + (hasMore ? '<button class="q-btn" id="load-more" type="button">Load more papers</button>' : "") + "</div>" + lpSubscribe("papers") + "</section></main>";
  return lpDoc({ head, body, math: true, nav: "papers", cls: "ix", js: LP_INDEX_JS });
}
function lpSubscribe(source) {
  return '<section class="sub q-card" aria-labelledby="sub-h"><div><h2 id="sub-h">New papers by email</h2><p>One short weekly digest: titles, links and DOIs. No tracking; unsubscribe any time.</p></div><form id="ld-sub-form" novalidate data-source="' + escAttr(source) + '"><label for="ld-email" class="sr">Email address</label><input id="ld-email" type="email" name="email" placeholder="you@example.com" required autocomplete="email"><input id="ld-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="sr"><button type="submit" id="ld-btn" class="q-btn pri">Subscribe</button></form><p id="ld-msg" role="status" aria-live="polite"></p></section>';
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
  const abstract = (paper.abstract || "").slice(0, 300);
  const dateStr = paper.created_at ? paper.created_at.slice(0, 10) : "";
  const cat = detectCategory(paper.title, paper.abstract);
  const authors = paperAuthors(paper);
  const ver = String(paper.version || "1.0.0").replace(/^v/i, "");
  const url = "https://papers.qnfo.org/papers/" + paper.slug;
  const data = { slug: paper.slug, title: t, doi: paper.doi || null, date: dateStr, version: ver, authors: authors.length ? authors : [AUTHOR_OF_RECORD], url, ask: LP_ASK, pdf: paper._pdf ? url + ".pdf" : null, words, cat: CATEGORY_LABELS[cat] || "Other" };
  const head = buildPaperJsonLd(paper) + "<title>" + esc(t) + ' \u2014 QNFO Papers</title><meta name="description" content="' + escAttr(mathPlain(abstract)) + '"><meta property="og:title" content="' + escAttr(t) + '"><meta property="og:type" content="article"><meta property="og:url" content="' + escAttr(url) + '"><meta property="og:description" content="' + escAttr(mathPlain(abstract)) + '"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="' + escAttr(t) + '"><meta name="twitter:description" content="' + escAttr(mathPlain(abstract)) + '">' + (paper.doi ? '<meta name="citation_doi" content="' + escAttr(paper.doi) + '">' : "") + '<meta name="citation_title" content="' + escAttr(t) + '">' + citationAuthorsMeta(paper) + '<meta name="citation_publication_date" content="' + escAttr(dateStr || "Unknown") + '">' + (paper._pdf ? '<meta name="citation_pdf_url" content="' + escAttr(url) + '.pdf">' : "") + '<meta name="citation_publisher" content="QNFO"><link rel="canonical" href="' + escAttr(url) + '">';
  const byline = data.authors.map(function(n) {
    return n.indexOf("Quni-Gudzinas") >= 0 ? '<a href="https://orcid.org/' + OWNER_ORCID + '" rel="author">' + esc(n) + '<svg class="orcid" viewBox="0 0 20 20" aria-label="ORCID"><circle cx="10" cy="10" r="9" fill="#A6CE39"/><path d="M7 6.2v.01M7 8.5v6M9.5 8.5v6h2a3 3 0 0 0 0-6z" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></a>' : esc(n);
  }).join(", ");
  const toc = lpTocHTML(st.toc);
  const sugg = ["What is the main result, in plain terms?", "What would falsify this?", "Which assumptions does it rest on?", "How does it connect to other QNFO work?"];
  const body = '<div class="rp" id="rp" aria-hidden="true"><span></span></div><main id="main" class="wrap pp"><nav class="crumbs" aria-label="Breadcrumb"><a href="/papers">Papers</a><span aria-hidden="true">/</span><a href="/papers?category=' + cat + '">' + esc(CATEGORY_LABELS[cat] || "Other") + '</a></nav><header class="ph"><h1>' + titleHTML(paper.title) + '</h1><p class="by">' + byline + '</p><div class="ph-meta"><span class="q-tag live" title="This paper is versioned: new versions keep the same address here and on Zenodo"><i></i>Living paper \u00b7 v' + esc(ver) + "</span>" + (dateStr ? '<span>Published <time datetime="' + escAttr(dateStr) + '">' + esc(lpDate(dateStr)) + "</time></span>" : "") + "<span>" + minutes + " min read \u00b7 " + words.toLocaleString("en-US") + " words</span>" + (paper.doi ? '<a href="https://doi.org/' + escAttr(paper.doi) + '">doi:' + esc(paper.doi) + "</a>" : "") + '</div><div class="ph-act no-print"><button class="q-btn teal" type="button" data-go="ask">' + lpIcon("ask") + 'Ask this paper</button><button class="q-btn" type="button" id="b-cite">' + lpIcon("cite") + "Cite</button>" + (paper._pdf ? '<a class="q-btn" href="' + escAttr(url) + '.pdf">' + lpIcon("pdf") + "PDF</a>" : "") + '<button class="q-btn" type="button" id="b-share">' + lpIcon("share") + "Share</button></div></header>" + '<div class="pp-grid"><aside class="toc no-print" aria-label="Contents">' + (toc ? '<details class="toc-d" open><summary>Contents</summary>' + toc + "</details>" : "") + '</aside><article class="prose rendered-md" id="doc">' + st.html + '</article><aside class="rail no-print" id="rail" aria-label="Living paper"><div class="rail-in"><div class="tabs" role="tablist"><button role="tab" aria-selected="true" aria-controls="t-ask" id="tb-ask" data-tab="ask">Ask</button><button role="tab" aria-selected="false" aria-controls="t-ctx" id="tb-ctx" data-tab="ctx">Context</button><button role="tab" aria-selected="false" aria-controls="t-ver" id="tb-ver" data-tab="ver">Versions</button><button role="tab" aria-selected="false" aria-controls="t-rel" id="tb-rel" data-tab="rel">Related</button></div>' + '<section class="tp" id="t-ask" role="tabpanel" aria-labelledby="tb-ask"><form id="ask-f" autocomplete="off"><label class="sr" for="ask-q">Ask a question about this paper</label><textarea id="ask-q" rows="2" maxlength="1000" placeholder="Ask anything about this paper"></textarea><button class="q-btn pri" type="submit" id="ask-go">Ask</button></form><div class="sugg" id="ask-sugg">' + sugg.map(function(s) {
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
  const paper = await env.LIVING_PAPER.prepare("SELECT slug,title,abstract,doi,version,created_at FROM papers WHERE slug = ? AND status NOT IN " + LP_EXCLUDE + " LIMIT 1").bind(slug).first();
  if (!paper) return out({ error: "Paper not found" }, 404);
  const norm = lpNorm(paper.title);
  const terms = lpTerms(paper.title).slice(0, 5).concat(lpTerms(String(paper.abstract || "").slice(0, 500)).slice(0, 3)).filter(function(w, i, a) { return a.indexOf(w) === i; }).slice(0, 6);
  const none = { results: [] };
  const q = function(p) { return p.then(function(r) { return r || none; }, function() { return none; }); };
  const res = await Promise.all([
    q(env.LIVING_PAPER.prepare("SELECT slug,title,version,created_at,doi FROM papers WHERE slug IS NOT NULL AND status NOT IN " + LP_EXCLUDE + " AND lower(substr(title,1,22)) = ? ORDER BY created_at DESC LIMIT 24").bind(String(paper.title || "").toLowerCase().slice(0, 22)).all()),
    terms.length ? q(env.LIVING_PAPER.prepare("SELECT p.slug,p.title,p.created_at,p.doi,p.abstract FROM papers_fts JOIN papers p ON p.rowid = papers_fts.rowid WHERE papers_fts MATCH ? AND p.slug IS NOT NULL AND p.slug != ? AND p.status NOT IN " + LP_EXCLUDE + " ORDER BY papers_fts.rank LIMIT 24").bind(terms.map(function(w) { return w + "*"; }).join(" OR "), slug).all()) : Promise.resolve(none)
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
    return { slug: r.slug, title: displayTitle(r.title), version: String(r.version || "").replace(/^v/i, "") || null, date: String(r.created_at || "").slice(0, 10), doi: r.doi || null, current: r.slug === slug };
  });
  const seen = new Set([norm]);
  const related = [];
  (res[1].results || []).forEach(function(r) {
    const n = lpNorm(r.title);
    if (seen.has(n) || related.length >= 6) return;
    seen.add(n);
    related.push({ slug: r.slug, title: displayTitle(r.title), date: String(r.created_at || "").slice(0, 10), doi: r.doi || null, cat: CATEGORY_LABELS[detectCategory(r.title, r.abstract)] || "Other", excerpt: lpExcerpt(r.abstract, 170) });
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
var LP_PAPER_JS = "(function(){\n  var D = {}; try { D = JSON.parse(document.getElementById('lp-data').textContent); } catch(e) {}\n  var doc = document.getElementById('doc'), rail = document.getElementById('rail');\n  if (!doc) return;\n  function $(id){ return document.getElementById(id); }\n  function esc(s){ return String(s == null ? '' : s).replace(/[&<>\"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]; }); }\n  function typeset(el){ if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise(el ? [el] : undefined).catch(function(){}); }\n\n  // ---- reading progress + contents scroll-spy\n  var bar = document.querySelector('#rp span');\n  function prog(){ var r = doc.getBoundingClientRect(), h = r.height - innerHeight * 0.6; var p = h > 0 ? Math.min(1, Math.max(0, -r.top / h)) : 0; if (bar) bar.style.width = (p * 100).toFixed(1) + '%'; }\n  addEventListener('scroll', prog, {passive:true}); addEventListener('resize', prog); prog();\n  var links = {}; [].forEach.call(document.querySelectorAll('.toc-l a'), function(a){ links[a.getAttribute('href').slice(1)] = a; });\n  var heads = [].slice.call(doc.querySelectorAll('h2[id],h3[id]')).filter(function(h){ return links[h.id]; });\n  if (heads.length && 'IntersectionObserver' in window) {\n    var vis = {};\n    var spy = new IntersectionObserver(function(es){\n      es.forEach(function(e){ vis[e.target.id] = e.isIntersecting; });\n      var cur = null;\n      for (var i = 0; i < heads.length; i++) { if (heads[i].getBoundingClientRect().top < innerHeight * 0.35) cur = heads[i].id; }\n      Object.keys(links).forEach(function(k){ links[k].classList.toggle('on', k === cur); });\n      if (cur && links[cur] && links[cur].scrollIntoView && document.querySelector('.toc').scrollHeight > document.querySelector('.toc').clientHeight) { var tc = document.querySelector('.toc'), lr = links[cur].getBoundingClientRect(), tr = tc.getBoundingClientRect(); if (lr.top < tr.top || lr.bottom > tr.bottom) tc.scrollTop += lr.top - tr.top - tr.height / 3; }\n    }, {rootMargin: '0px 0px -60% 0px'});\n    heads.forEach(function(h){ spy.observe(h); });\n  }\n  if (innerWidth < 1080) { var td = document.querySelector('.toc-d'); if (td) td.open = false; }\n  doc.addEventListener('click', function(e){ var a = e.target.closest('.hx'); if (!a) return; e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); qCopy(location.href, 'Link to this section copied'); });\n\n  // ---- references: [n] previews and jumps\n  var refs = {}, refHead = [].slice.call(doc.querySelectorAll('h2,h3')).filter(function(h){ return /^(#\\s*)?(\\d+\\.?\\s*)?(references|bibliography|works cited)/i.test(h.textContent.trim()); })[0];\n  if (refHead) {\n    var n = refHead.nextElementSibling, k = 0;\n    while (n && !/^H[12]$/.test(n.tagName)) {\n      var items = n.tagName === 'OL' || n.tagName === 'UL' ? [].slice.call(n.children) : [n];\n      items.forEach(function(it){\n        var t = it.textContent.replace(/\\s+/g, ' ').trim(); if (!t) return;\n        // One paragraph often carries several entries: \"[1] A ... [2] B ...\"\n        var parts = t.split(/(?:^|\\s)(?=\\[\\d{1,3}\\]\\s)/).filter(Boolean);\n        if (parts.length > 1 || /^\\[\\d{1,3}\\]\\s/.test(t)) {\n          parts.forEach(function(pt){ var m = /^\\[(\\d{1,3})\\]\\s*/.exec(pt.trim()); if (m) refs[Number(m[1])] = pt.trim().slice(m[0].length); });\n          var m0 = /^\\[(\\d{1,3})\\]/.exec(t); if (m0 && !it.id) it.id = 'ref-' + m0[1];\n        } else if (n.tagName === 'OL') { refs[++k] = t; if (!it.id) it.id = 'ref-' + k; }\n      });\n      n = n.nextElementSibling;\n    }\n  }\n  if (Object.keys(refs).length) {\n    var walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, { acceptNode: function(node){\n      if (!/\\[\\d/.test(node.nodeValue) || /[$\\\\]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;\n      var p = node.parentNode; if (!p || p.closest('pre,code,mjx-container,a,.refs-skip') || (refHead && refHead.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING)) return NodeFilter.FILTER_REJECT;\n      return NodeFilter.FILTER_ACCEPT; } });\n    var hits = []; while (walker.nextNode()) hits.push(walker.currentNode);\n    hits.forEach(function(node){\n      var html = esc(node.nodeValue).replace(/(^|[^\\[\\],\\d\\w])\\[(\\d{1,3}(?:\\s*[,\u2013-]\\s*\\d{1,3})*)\\](?![\\[\\w(])/g, function(m, pre, inner){\n        var nums = inner.split(/\\s*[,\u2013-]\\s*/).map(Number);\n        if (nums.some(function(x){ return !x || !refs[x]; })) return m;\n        return pre + '[' + inner.split(/\\s*,\\s*/).map(function(part){ var first = Number(part.split(/\\s*[\u2013-]\\s*/)[0]); return '<a class=\"cite-n\" href=\"#ref-' + first + '\" data-ref=\"' + first + '\">' + esc(part) + '</a>'; }).join(', ') + ']';\n      });\n      if (html === esc(node.nodeValue)) return;\n      var span = document.createElement('span'); span.innerHTML = html; node.parentNode.replaceChild(span, node);\n    });\n    var pop = $('refpop'), hideT;\n    function showRef(a){ clearTimeout(hideT); var n = a.getAttribute('data-ref'); pop.innerHTML = '<b>[' + esc(n) + ']</b> ' + esc(refs[n]).slice(0, 600); pop.hidden = false; var r = a.getBoundingClientRect(); var x = Math.min(scrollX + r.left, scrollX + innerWidth - pop.offsetWidth - 12); pop.style.left = Math.max(8, x) + 'px'; pop.style.top = (scrollY + r.bottom + 8) + 'px'; }\n    doc.addEventListener('mouseover', function(e){ var a = e.target.closest('.cite-n'); if (a) showRef(a); });\n    doc.addEventListener('focusin', function(e){ var a = e.target.closest('.cite-n'); if (a) showRef(a); });\n    doc.addEventListener('mouseout', function(e){ if (e.target.closest('.cite-n')) hideT = setTimeout(function(){ pop.hidden = true; }, 150); });\n    doc.addEventListener('focusout', function(){ pop.hidden = true; });\n  }\n\n  // ---- tabs and the living rail\n  var tabs = [].slice.call(document.querySelectorAll('.tabs [role=tab]'));\n  function openTab(name){\n    tabs.forEach(function(t){ var on = t.getAttribute('data-tab') === name; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; $('t-' + t.getAttribute('data-tab')).hidden = !on; });\n    if (name !== 'ask') loadContext();\n  }\n  tabs.forEach(function(t, i){\n    t.addEventListener('click', function(){ openTab(t.getAttribute('data-tab')); });\n    t.addEventListener('keydown', function(e){ var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; var n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); n.click(); });\n  });\n  var ctx = null, ctxP = null;\n  function loadContext(){\n    if (ctxP) return ctxP;\n    ctxP = fetch('/api/paper-context/' + encodeURIComponent(D.slug)).then(function(r){ return r.json(); }).then(function(d){ ctx = d; paintContext(d); return d; }).catch(function(){\n      ['ctx','ver','rel'].forEach(function(k){ $('t-' + k).innerHTML = '<p class=\"none\">Could not load this right now.</p>'; }); ctxP = null;\n    });\n    return ctxP;\n  }\n  var COL = { Concept: '--teal', ResearchQuestion: '--rust', Finding: '--violet', Theorem: '--amber' };\n  var LBL = { Concept: 'Concepts', ResearchQuestion: 'Open questions', Finding: 'Findings', Theorem: 'Theorems' };\n  function paintContext(d){\n    var c = d.concepts || [];\n    var html = '';\n    if (c.length) {\n      if (c.length >= 3) html += miniGraph(c);\n      ['Concept','ResearchQuestion','Finding','Theorem'].forEach(function(lb){\n        var xs = c.filter(function(x){ return x.label === lb; }); if (!xs.length) return;\n        html += '<div class=\"ctx-g\"><h3>' + LBL[lb] + '</h3><div class=\"ctx-l' + (lb === 'ResearchQuestion' ? ' q' : '') + '\">' + xs.map(function(x){ return '<button type=\"button\" data-ask=\"' + esc(lb === 'ResearchQuestion' ? 'Does this paper bear on the open question: ' + x.name : 'How does this paper use or relate to ' + x.name + '?') + '\" style=\"--c:var(' + COL[lb] + ')\"><i></i>' + esc(x.name) + '</button>'; }).join('') + '</div></div>';\n      });\n      html += '<p class=\"fine\">From the QNFO knowledge graph, matched on this paper\u2019s key terms. Pick one to ask how it connects.</p>';\n    } else html = '<p class=\"none\">No knowledge-graph nodes match this paper yet.</p>';\n    $('t-ctx').innerHTML = html;\n    var v = d.versions || [];\n    var vh = v.length ? '<ul class=\"vl\">' + v.map(function(x){ return '<li class=\"' + (x.current ? 'cur' : '') + '\"><span class=\"v\">' + esc(x.version ? 'v' + x.version : '\u2013') + '</span>' + (x.current ? '<span>This version</span>' : '<a href=\"/papers/' + esc(x.slug) + '\">' + esc(x.title) + '</a>') + '<small>' + esc(x.date) + (x.doi ? ' \u00b7 doi:' + esc(x.doi) : '') + '</small></li>'; }).join('') + '</ul>' : '';\n    vh += '<p class=\"fine\">' + (v.length > 1 ? v.length + ' versions of this work are on papers.qnfo.org. ' : 'This is the only version on papers.qnfo.org. ') + (D.doi ? 'Zenodo keeps every deposited version: <a href=\"https://doi.org/' + esc(D.doi) + '\">open the record</a>.' : '') + '</p>';\n    $('t-ver').innerHTML = vh;\n    var r = d.related || [];\n    $('t-rel').innerHTML = r.length ? '<ul class=\"rl\">' + r.map(function(x){ return '<li><a href=\"/papers/' + esc(x.slug) + '\">' + esc(x.title) + '</a><p>' + esc(x.excerpt) + '</p><small>' + esc(x.cat) + ' \u00b7 ' + esc(x.date) + '</small></li>'; }).join('') + '</ul>' : '<p class=\"none\">No closely related papers found.</p>';\n    typeset($('rail'));\n  }\n  function miniGraph(c){\n    var W = 320, H = 190, cx = W / 2, cy = H / 2, xs = c.slice(0, 10);\n    var out = '<svg class=\"mini\" viewBox=\"0 0 ' + W + ' ' + H + '\" role=\"img\" aria-label=\"This paper and the knowledge-graph nodes it touches\">';\n    var pts = xs.map(function(x, i){ var a = -Math.PI / 2 + i * 2 * Math.PI / xs.length, rx = x.label === 'Concept' ? 118 : 96, ry = x.label === 'Concept' ? 70 : 58; return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), n: x }; });\n    pts.forEach(function(p){ out += '<line x1=\"' + cx + '\" y1=\"' + cy + '\" x2=\"' + p.x.toFixed(1) + '\" y2=\"' + p.y.toFixed(1) + '\"/>'; });\n    out += '<circle cx=\"' + cx + '\" cy=\"' + cy + '\" r=\"9\" fill=\"var(--ink)\"/>';\n    pts.forEach(function(p, i){ var nm = p.n.name.length > 22 ? p.n.name.slice(0, 21) + '...' : p.n.name; var right = p.x >= cx; out += '<g class=\"c\" data-i=\"' + i + '\"><title>' + esc(p.n.label + ': ' + p.n.name) + '</title><circle cx=\"' + p.x.toFixed(1) + '\" cy=\"' + p.y.toFixed(1) + '\" r=\"6\" fill=\"var(' + COL[p.n.label] + ')\"/><text x=\"' + (p.x + (right ? 9 : -9)).toFixed(1) + '\" y=\"' + (p.y + 3).toFixed(1) + '\" text-anchor=\"' + (right ? 'start' : 'end') + '\">' + esc(nm) + '</text></g>'; });\n    return out + '</svg>';\n  }\n  rail.addEventListener('click', function(e){\n    var b = e.target.closest('[data-ask]'); if (b) { openTab('ask'); ask(b.getAttribute('data-ask')); return; }\n    var g = e.target.closest('g.c'); if (g && ctx) { var x = ctx.concepts[Number(g.getAttribute('data-i'))]; if (x) { openTab('ask'); ask('How does this paper use or relate to ' + x.name + '?'); } }\n  });\n  if ('requestIdleCallback' in window) requestIdleCallback(function(){ loadContext(); }, {timeout: 4000}); else setTimeout(loadContext, 2500);\n\n  // ---- Ask this paper (ask.qwav.tech, paper pinned as source [1])\n  var form = $('ask-f'), qa = $('ask-q'), out = $('ask-out'), hist = [];\n  function md(s){\n    var lines = String(s).replace(/\\r/g, '').split('\\n'), o = [], list = null, para = [];\n    function inl(t){ return esc(t).replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>').replace(/(^|[^*\\w])\\*([^*\\n]+)\\*(?!\\w)/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\\[(\\d{1,2}(?:\\s*[,\u2013-]\\s*\\d{1,2})*)\\]/g, function(m, x){ return x.split(/\\s*,\\s*/).map(function(n){ return '<a class=\"c\" href=\"#\" data-src=\"' + parseInt(n, 10) + '\">' + n + '</a>'; }).join(''); }); }\n    function flush(){ if (para.length) { o.push('<p>' + inl(para.join(' ')) + '</p>'); para = []; } }\n    function endList(){ if (list) { o.push('</' + list + '>'); list = null; } }\n    lines.forEach(function(l){\n      var h = /^#{1,4}\\s+(.+)/.exec(l), ul = /^\\s*[-*]\\s+(.+)/.exec(l), ol = /^\\s*\\d+[.)]\\s+(.+)/.exec(l);\n      if (h) { flush(); endList(); o.push('<h4>' + inl(h[1]) + '</h4>'); }\n      else if (ul || ol) { flush(); var t = ul ? 'ul' : 'ol'; if (list !== t) { endList(); o.push('<' + t + '>'); list = t; } o.push('<li>' + inl((ul || ol)[1]) + '</li>'); }\n      else if (!l.trim()) { flush(); endList(); }\n      else { endList(); para.push(l.trim()); }\n    });\n    flush(); endList(); return o.join('');\n  }\n  function ask(text){\n    text = String(text || '').trim(); if (text.length < 3) return;\n    $('ask-sugg').hidden = true;\n    var turn = document.createElement('div'); turn.className = 'turn';\n    turn.innerHTML = '<p class=\"q\">' + esc(text) + '</p><div class=\"st\"><span class=\"q-spin\"></span><span>Reading the paper</span></div><div class=\"ans\"></div>';\n    out.insertBefore(turn, out.firstChild);\n    var st = turn.querySelector('.st span:last-child'), ans = turn.querySelector('.ans'), raw = '', sources = [], doneD = null;\n    qa.value = ''; $('ask-go').disabled = true;\n    if (innerWidth < 860) turn.scrollIntoView({behavior:'smooth', block:'start'}); else $('t-ask').scrollTop = 0;\n    fetch(D.ask + '/api/ask', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({query: text, paper: D.slug, history: hist.slice(-2)})}).then(function(r){\n      if (!r.ok || !r.body) return r.json().then(function(j){ throw new Error(j.error || ('HTTP ' + r.status)); });\n      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';\n      function pump(){ return rd.read().then(function(x){\n        if (x.done) return;\n        buf += dec.decode(x.value, {stream:true});\n        var parts = buf.split('\\n\\n'); buf = parts.pop();\n        parts.forEach(function(b){\n          var ev = (/^event: (.+)$/m.exec(b) || [])[1], dl = (/^data: (.+)$/m.exec(b) || [])[1]; if (!ev || !dl) return;\n          var d; try { d = JSON.parse(dl); } catch(e) { return; }\n          if (ev === 'status') st.textContent = d.stage === 'writing' ? 'Writing from ' + sources.length + ' sources' : d.stage === 'thinking' ? 'Reasoning over ' + sources.length + ' sources' : 'Reading the paper';\n          else if (ev === 'meta') sources = d.sources || [];\n          else if (ev === 'token') { raw += d.t; var vis = raw.split(/\\n?\\s*\\**FOLLOWUPS:?/i)[0]; ans.innerHTML = md(vis); ans.lastElementChild && ans.lastElementChild.classList.add('cur'); }\n          else if (ev === 'done') doneD = d;\n          else if (ev === 'error') { ans.insertAdjacentHTML('beforeend', '<p class=\"err\">' + esc(d.error) + '</p>'); }\n        });\n        return pump();\n      }); }\n      return pump();\n    }).catch(function(e){ ans.insertAdjacentHTML('beforeend', '<p class=\"err\">' + esc(e && e.message ? 'The answer could not be fetched (' + e.message + ').' : 'The answer could not be fetched.') + '</p>'); }).then(function(){\n      var body = raw.split(/\\n?\\s*\\**FOLLOWUPS:?/i)[0].trim();\n      ans.innerHTML = md(body) + (ans.querySelector('.err') ? ans.querySelector('.err').outerHTML : '');\n      turn.querySelector('.st').remove();\n      if (sources.length) ans.insertAdjacentHTML('beforeend', '<ol class=\"srcs\">' + sources.map(function(s){ var here = s.slug === D.slug; return '<li id=\"as-' + s.n + '\"><span class=\"n\">' + s.n + '</span><span>' + (here ? '<a href=\"#main\">' + esc(s.title) + '</a><span class=\"here\">this paper</span>' : '<a href=\"' + esc(s.url || ('/papers/' + s.slug)) + '\">' + esc(s.title) + '</a>') + '</span></li>'; }).join('') + '</ol>');\n      if (doneD && doneD.followups && doneD.followups.length) ans.insertAdjacentHTML('beforeend', '<div class=\"fu\">' + doneD.followups.map(function(f){ return '<button type=\"button\" data-ask=\"' + esc(f) + '\">' + esc(f) + '</button>'; }).join('') + '</div>');\n      if (doneD && doneD.id) { ans.insertAdjacentHTML('beforeend', '<div class=\"fb\">Useful? <button type=\"button\" data-h=\"1\">Yes</button><button type=\"button\" data-h=\"0\">No</button></div>'); var fb = ans.querySelector('.fb'); fb.addEventListener('click', function(e){ var b = e.target.closest('button'); if (!b) return; fetch(D.ask + '/api/feedback', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id: doneD.id, helpful: Number(b.getAttribute('data-h'))})}).then(function(r){ fb.textContent = r.ok ? 'Thanks, recorded.' : 'Could not record that.'; }, function(){ fb.textContent = 'Could not record that.'; }); }); }\n      if (body) hist.push({q: text, a: body.slice(0, 1500)});\n      $('ask-go').disabled = false; typeset(ans);\n    });\n  }\n  out.addEventListener('click', function(e){\n    var c = e.target.closest('a.c'); if (c) { e.preventDefault(); var li = c.closest('.ans').querySelector('#as-' + c.getAttribute('data-src')); if (li) { li.scrollIntoView({block:'nearest', behavior:'smooth'}); li.style.background = 'var(--amber-wash)'; setTimeout(function(){ li.style.background = ''; }, 1200); } }\n  });\n  form.addEventListener('submit', function(e){ e.preventDefault(); ask(qa.value); });\n  qa.addEventListener('keydown', function(e){ if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(qa.value); } });\n  $('ask-sugg').addEventListener('click', function(e){ var b = e.target.closest('button'); if (b) ask(b.textContent); });\n  [].forEach.call(document.querySelectorAll('[data-go=ask]'), function(b){ b.addEventListener('click', function(){ openTab('ask'); if (innerWidth < 860) rail.scrollIntoView({behavior:'smooth'}); setTimeout(function(){ qa.focus({preventScroll: innerWidth >= 860}); }, innerWidth < 860 ? 450 : 0); }); });\n\n  // ---- select a passage: ask about it, or copy it as a quote with its citation\n  var sp = $('selpop'), selText = '';\n  function citeLine(){ return D.authors.join(', ') + ' (' + String(D.date).slice(0, 4) + '). ' + D.title + '.' + (D.doi ? ' https://doi.org/' + D.doi : ' ' + D.url); }\n  document.addEventListener('mouseup', function(e){\n    if (sp.contains(e.target)) return;\n    setTimeout(function(){\n      var s = getSelection(), t = s && String(s).trim();\n      if (!t || t.length < 12 || t.length > 900 || !s.rangeCount || !doc.contains(s.getRangeAt(0).commonAncestorContainer)) { sp.hidden = true; return; }\n      selText = t.replace(/\\s+/g, ' ');\n      var r = s.getRangeAt(0).getBoundingClientRect();\n      sp.hidden = false;\n      sp.style.left = Math.max(8, Math.min(scrollX + r.left + r.width / 2 - sp.offsetWidth / 2, scrollX + innerWidth - sp.offsetWidth - 8)) + 'px';\n      sp.style.top = (scrollY + r.top - sp.offsetHeight - 10) + 'px';\n    }, 10);\n  });\n  document.addEventListener('scroll', function(){ if (!sp.hidden && !getSelection().toString()) sp.hidden = true; }, {passive:true});\n  sp.addEventListener('click', function(e){\n    var b = e.target.closest('button'); if (!b) return;\n    if (b.getAttribute('data-sel') === 'ask') { openTab('ask'); ask('Explain this passage and how it fits the paper: \u201c' + selText.slice(0, 600) + '\u201d'); if (innerWidth < 860) rail.scrollIntoView({behavior:'smooth'}); }\n    else qCopy('\u201c' + selText + '\u201d \u2014 ' + citeLine(), 'Quote copied with its citation');\n    sp.hidden = true; getSelection().removeAllRanges();\n  });\n\n  // ---- cite and share\n  var dlg = $('cite-d'), fmt = 'apa';\n  function citeText(f){\n    var y = String(D.date).slice(0, 4) || 'n.d.', a = D.authors;\n    var apaA = a.map(function(n){ var p = n.trim().split(/\\s+/); var last = p.pop(); return last + ', ' + p.map(function(x){ return x.charAt(0) + '.'; }).join(' '); }).join(', ');\n    if (f === 'bibtex') { var key = (a[0] || 'qnfo').split(/\\s+/).pop().toLowerCase().replace(/[^a-z]/g, '') + y + (D.title.toLowerCase().match(/[a-z]{4,}/) || ['paper'])[0]; return '@misc{' + key + ',\\n  title     = {' + D.title + '},\\n  author    = {' + a.map(function(n){ var p = n.trim().split(/\\s+/); var last = p.pop(); return last + ', ' + p.join(' '); }).join(' and ') + '},\\n  year      = {' + y + '},\\n  version   = {' + D.version + '},\\n  publisher = {Zenodo},\\n' + (D.doi ? '  doi       = {' + D.doi + '},\\n' : '') + '  url       = {' + (D.doi ? 'https://doi.org/' + D.doi : D.url) + '}\\n}'; }\n    if (f === 'plain') return citeLine();\n    return apaA + ' (' + y + '). ' + D.title + ' (Version ' + D.version + '). Zenodo.' + (D.doi ? ' https://doi.org/' + D.doi : ' ' + D.url);\n  }\n  function paintCite(){ $('cite-t').textContent = citeText(fmt); [].forEach.call(dlg.querySelectorAll('[data-fmt]'), function(b){ b.classList.toggle('on', b.getAttribute('data-fmt') === fmt); }); }\n  $('b-cite').addEventListener('click', function(){ paintCite(); if (dlg.showModal) dlg.showModal(); else qCopy(citeText('apa'), 'Citation copied'); });\n  dlg.addEventListener('click', function(e){ var b = e.target.closest('[data-fmt]'); if (b) { fmt = b.getAttribute('data-fmt'); paintCite(); } if (e.target === dlg) dlg.close(); });\n  $('cite-copy').addEventListener('click', function(){ qCopy(citeText(fmt), 'Citation copied'); });\n  $('b-share').addEventListener('click', function(){ if (navigator.share) navigator.share({title: D.title, url: D.url}).catch(function(){}); else qCopy(D.url, 'Link copied'); });\n  if (location.hash) { var t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) setTimeout(function(){ t.scrollIntoView(); }, 300); }\n})();\n";
// ---- LIVING-PAPERS-1:END ----
var gateway_worker_default = {
  async fetch(request, env) {
    return withFleetCtl(await gateway_worker_default.serve(request, env));
  },
  async serve(request, env) {
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
    if (host === "legal.qnfo.org") return handleLegal(p, env);
    if (host === "papers.qnfo.org" || host === "qnfo-publications.pages.dev") {
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
      if (p === "/_audit/blank-papers") return handleBlankPapers(env);
      if (p.startsWith("/papers/") && p.split("/").length >= 3) return handlePaperDetail(request, env, p);
      if (p === "/ipatent" || p === "/ipatent/") return new Response(null, { status: 301, headers: { Location: "https://ipatent.qnfo.org/" } });
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
    if (host === "qnfo.org" || host === "www.qnfo.org") {
      if (p === "/health") return health();
      if (p === "/legal" || p === "/license") return handleLegal(p, env);
      if (p === "/api/ask" && method === "POST") return handleAskAI(request, env);
      if (p === "/api/subscribe" && method === "POST") return handleSubscribeProxy(request, env);
      if (p === "/api/unsubscribe" && (method === "GET" || method === "POST")) return handleUnsubscribeProxy(request, env);
      if (p === "/api/confirm" && (method === "GET" || method === "POST")) return handleConfirmProxy(request, env);
      if (p.startsWith("/api/paper-context/") && method === "GET") return handlePaperContext(env, decodeURIComponent(p.slice(19)));
      if (p === "/_audit/blank-papers") return handleBlankPapers(env);
      if (p.startsWith("/papers/") && p.split("/").length >= 3) return handlePaperDetail(request, env, p);
      if (p === "/papers" || p.startsWith("/papers?")) return handlePapers(request, env);
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
      if (p === "/graph") return new Response(null, { status: 302, headers: { Location: "https://graph-api.qnfo.org/stats" } });
      if (p === "/ipatent" || p === "/ipatent/") return new Response(null, { status: 301, headers: { Location: "https://ipatent.qnfo.org/" } });
      if (p === "/about") return handleAbout(env);
      if (p === "/work-with-me") return handleWorkWithMe();
      if (p === "/contact") return new Response(null, { status: 301, headers: { Location: "https://qnfo.org/work-with-me" } });
      if (p === "/" || p === "") return handleHub(env);
      return json({ error: "Not found", path: p }, 404);
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
    return json({ error: "Not found", path: p }, 404);
  },
  async scheduled(event, env, ctx) {
    try {
      await indexNowSubmit(await collectPaperUrls(env, 7));
    } catch (e) {
    }
    await askRatePrune(env);
  }
};
export {
  gateway_worker_default as default
};
//# sourceMappingURL=worker.js.map
