var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// qnfo-gateway.js
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
function detectCategory(title, abstract) {
  const t = ((title || "") + " " + (abstract || "")).toLowerCase();
  if (t.includes("error correction") || t.includes("stabilizer") || t.includes("fault-tolerant") || t.includes("qec") || t.includes("ldpc") || t.includes("surface code")) return "qec";
  if (t.includes("number theory") || t.includes("p-adic") || t.includes("adelic") || t.includes("ostrowski") || t.includes("tate") || t.includes("gamma function") || t.includes("morita") || t.includes("langlands")) return "number-theory";
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
var CATEGORY_LABELS = { "qec": "QEC", "number-theory": "Number Theory", "physics": "Physics", "computer-science": "CS", "other": "Other" };
function texSafe(s) {
  if (!s) return "";
  s = String(s);
  s = s.replace(/\\left\s*</g, "\\left\\langle ");
  s = s.replace(/\\right\s*>/g, "\\right\\rangle ");
  s = s.replace(/<=/g, "\\leq ");
  s = s.replace(/>=/g, "\\geq ");
  s = s.replace(/<(?=\\)/g, "\\langle ");
  s = s.replace(/</g, "\\lt ");
  s = s.replace(/>/g, "\\gt ");
  return s;
}
function cleanPunct(s) {
  return String(s || "").replace(/[ \t]+([,.!?;:])/g, "$1");
}
function _mdInline(t) {
  t = String(t || "");
  var _math = [];
  function saveMath(c, disp) { _math.push((disp ? "D" : "") + c); return "\u0003M" + (_math.length - 1) + "\u0003"; }
  t = t.replace(/\$\$([^\n$]+?)\$\$/g, function(m, c) { return saveMath(c, true); });
  t = t.replace(/\$([^$\n]+?)\$/g, function(m, c) { return saveMath(c, false); });
  t = t.replace(/\\\(([^\n]*?)\\\)/g, function(m, c) { return saveMath(c, false); });
  t = esc(t);
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  t = t.replace(/_([^_]+)_/g, "<em>$1</em>");
  t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  var _bt = String.fromCharCode(96);
  t = t.replace(new RegExp(_bt + "([^" + _bt + "]+)" + _bt, "g"), "<code>$1</code>");
  t = t.replace(/\u0003M(\d+)\u0003/g, function(m, i) {
    var c = _math[+i]; var disp = c.charAt(0) === "D";
    return (disp ? "$$" : "$") + texSafe(disp ? c.slice(1) : c) + (disp ? "$$" : "$");
  });
  return t;
}

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
function renderMarkdown(md) {
  if (!md) return "";
  var m = String(md).replace(/\r\n?/g, "\n");
  var mb = [], mi = [], L, o = "", i;
  m = m.replace(/^[ \t]*@[A-Za-z0-9_:-]+:[ \t]*$/gm, "");
  m = m.replace(/\[[@][A-Za-z0-9_:-]+(?:[ \t;,]+[@A-Za-z0-9_:-]+)*\]/g, "");
  m = m.replace(/(^|[^A-Za-z0-9_])@[A-Za-z][A-Za-z0-9_:-]+/g, "$1");
  m = m.replace(/([^\n])[ \t]+(---)[ \t]*(?=\n)/g, "$1\n$2\n");
  m = m.replace(/([^\n])[ \t]+(#{1,6}[ \t])/g, "$1\n$2");
  var _bt2 = String.fromCharCode(96);
  var _fence = new RegExp(_bt2 + _bt2 + _bt2 + "(\\w*)\\n([\\s\\S]*?)" + _bt2 + _bt2 + _bt2, "g");
  m = m.replace(_fence, function(_, l, c) {
    mb.push("<pre" + (l ? ' class="lang-' + l + '"' : "") + "><code>" + esc(c) + "</code></pre>");
    return "\u0001B" + mb.length + "\u0001";
  });
  m = m.replace(/\$\$([\s\S]*?)\$\$/g, function(_, c) {
    mb.push('<div class="math-display">$$' + texSafe(c) + '$$</div>');
    return "\u0001B" + mb.length + "\u0001";
  });
  m = m.replace(/\\\[([\s\S]*?)\\\]/g, function(_, c) {
    mb.push('<div class="math-display">$$' + texSafe(c) + '$$</div>');
    return "\u0001B" + mb.length + "\u0001";
  });
  m = m.replace(/\$([^$\n]+?)\$/g, function(_, c) { mi.push(c); return "\u0001M" + (mi.length - 1) + "\u0001"; });
  m = m.replace(/\\\(([^\n]*?)\\\)/g, function(_, c) { mi.push(c); return "\u0001M" + (mi.length - 1) + "\u0001"; });
  m = m.replace(/\\\$/g, "\u0007");
  function isTableSep(s) { return /^\|?[\s:]*-{3,}[\s:]*\|/.test(s) && /-/.test(s); }
  function emitBlockText(text) {
    var parts = text.split(/(\u0001B\d+\u0001)/g), h = "", cur = "", k;
    for (k = 0; k < parts.length; k++) {
      var p = parts[k], tm = /^\u0001B(\d+)\u0001$/.exec(p);
      if (tm) {
        if (cur.trim()) { h += "<p>" + _mdInline(cleanPunct(cur)) + "</p>"; cur = ""; }
        h += mb[+tm[1] - 1] + "\n";
      } else cur += p;
    }
    if (cur.trim()) h += "<p>" + _mdInline(cleanPunct(cur)) + "</p>";
    return h;
  }
  function isListStart(s) { return /^[-*+]\s/.test(s) || /^\d+[.)]\s/.test(s); }
  function isContinuation(s) { return /^[ \t]+\S/.test(s); }
  L = m.split("\n");
  i = 0;
  while (i < L.length) {
    var l = L[i], t = l.trim();
    if (!t) { i++; continue; }
    var bm = /^\u0001B(\d+)\u0001$/.exec(t);
    if (bm) { o += mb[+bm[1] - 1] + "\n"; i++; continue; }
    var hm = /^(#{1,6})\s+(.+)/.exec(t);
    if (hm) { o += "<h" + hm[1].length + ">" + _mdInline(cleanPunct(hm[2])) + "</h" + hm[1].length + ">\n"; i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { o += "<hr>\n"; i++; continue; }
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
        var sepCols = L[si].trim().split("|").map(function(x) { return x.trim(); }).filter(function(x) { return x; }).length || 1;
        var hdrCells = t.split("|").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
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
          if (L[i].trim() === "") { i++; continue; }
          var lc = L[i], lct = lc.trim();
          if (isListStart(lct) || /^(#{1,6})\s/.test(lct) || /^\u0001B\d+\u0001$/.test(lct) || lct.charAt(0) === ">" || lct.indexOf("|") < 0) break;
          var segs = lc.trim().split("|");
          if (segs.length && segs[0].trim() === "") segs.shift();
          if (segs.length && segs[segs.length - 1].trim() === "") segs.pop();
          var cs = segs.map(function(x) { return x.trim(); });
          if (cs.length > sepCols) {
            var used = 0, cutIdx = segs.length - 1, k2;
            for (k2 = 0; k2 < segs.length; k2++) {
              if (segs[k2].trim() !== "") { used++; if (used === sepCols) { cutIdx = k2; break; } }
            }
            cs = segs.slice(0, cutIdx + 1).map(function(x) { return x.trim(); }).filter(function(x) { return x; });
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
  o = o.replace(/\u0001M(\d+)\u0001/g, function(mm, n) { return "$" + texSafe(mi[+n]) + "$"; });
  o = o.replace(/\u0007/g, "$");
  o = o.replace(/\u0001B(\d+)\u0001/g, function(mm, n) { return mb[+n - 1] || ""; });
  return o;
}

function renderHubHTML(recentPapers, paperCount, nodesCount = 0) {
  const total = paperCount || (recentPapers ? recentPapers.length : 0);
  const kg = nodesCount ? nodesCount + "+" : "\u2014";
  const cards = [
    { icon: "\u{1F4C4}", title: "Research Papers", desc: "Browse the full corpus of publications across number theory, physics, quantum error correction, and computer science \u2014 all with Zenodo DOIs and independent verifiability.", href: "/papers" },
    { icon: "\u{1F517}", title: "Knowledge Graph", desc: "Explore the QNFO concept graph \u2014 " + kg + " interconnected nodes mapping research entities, papers, and their relationships.", href: "/graph" },
    { icon: "\u{1F4A1}", title: "Idea Factory", desc: "A public read-only window into the QNFO research conversations \u2014 prompts, explorations, and open questions as they develop, live.", href: "https://ideas.qnfo.org" },
    { icon: "\u2696\uFE0F", title: "License", desc: "QNFO Unified License Agreement v2.0 \u2014 open-science licensing with commercial protections.", href: "/legal" },
    { icon: "\u{1F5C4}\uFE0F", title: "Archive", desc: "Persistent archival storage with DOI registration and R2-redundant backup infrastructure.", href: "https://archive.qnfo.org" },
    { icon: "\u26A1", title: "QWAV Platform", desc: "Pre-commercial computing platform exploring p-adic ultrametric architectures benchmarked with JPCUB.", href: "https://qwav.org" },
    { icon: "\u{1F50F}", title: "iPatent.me", desc: "Quantum technology patent disclosure framework for prior art documentation.", href: "https://ipatent.qnfo.org" }
  ];
  const cardsHtml = cards.map(
    (c) => '<a href="' + c.href + '" class="hub-card" style="text-decoration:none;color:inherit;display:block"><div class="card-icon">' + c.icon + "</div><h3>" + c.title + "</h3><p>" + c.desc + "</p></a>"
  ).join("");
  let papersHtml = "";
  if (recentPapers && recentPapers.length > 0) {
    papersHtml = '<div class="hub-section-header" style="margin-top:1rem">Latest Papers</div><ul class="latest-papers">' + recentPapers.slice(0, 8).map(
      (p) => '<li><a href="/papers/' + escAttr(p.slug) + '">' + esc(p.title) + '</a><span class="date">' + esc((p.created_at || "").slice(0, 10)) + "</span></li>"
    ).join("") + '</ul><p style="text-align:center;margin-top:.75rem"><a href="/papers" style="color:var(--blue);text-decoration:none;font-weight:500">View all papers \u2192</a></p>';
  }
  const statsHtml = total > 0 ? '<div class="stats-bar"><div class="stat-item"><div class="stat-number">' + total + '+</div><div class="stat-label">Papers</div></div><div class="stat-item"><div class="stat-number">' + kg + '</div><div class="stat-label">KG Nodes</div></div><div class="stat-item"><div class="stat-number">5</div><div class="stat-label">Research Domains</div></div></div>' : "";
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>QNFO \u2014 Research Foundation</title><meta name="description" content="QNFO is an open-science research collective publishing critical analyses of quantum computing, exploring p-adic mathematics, ultrametric geometry, and topological computation \u2014 all with independently verifiable Zenodo DOIs."><meta property="og:title" content="QNFO \u2014 Research Foundation"><meta property="og:description" content="Open-science research collective. ' + total + `+ papers. Independent verification. Zenodo DOIs."><meta property="og:type" content="website"><meta property="og:url" content="https://qnfo.org"><meta name="twitter:card" content="summary"><link rel="canonical" href="https://qnfo.org"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%2324315e'/><text x='16' y='23' text-anchor='middle' font-size='18' fill='white' font-family='system-ui'>N</text></svg>"><style>` + COMMON_CSS + '</style><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script></head><body><a href="#hub-content" class="skip-link">Skip to main content</a><nav class="top-nav" role="navigation" aria-label="Main"><a class="brand" href="/" aria-label="QNFO home"><span class="qmark">Q</span> QNFO</a><a href="/papers">Papers</a><a href="/graph">Knowledge Graph</a><a href="/about">About</a><a href="https://ideas.qnfo.org">Ideas</a><a href="https://qwav.org" class="qwav-badge">QWAV</a><a href="https://archive.qnfo.org">Archive</a><a href="/legal">License</a><a href="https://ipatent.qnfo.org">iPatent</a></nav><main id="hub-content"><header class="hub-hero" role="banner"><h1>QNFO Research Foundation</h1><p class="subtitle">An open-science research collective publishing critical analyses of the $35B quantum computing industry. Our work spans p-adic mathematics, ultrametric geometry, topological quantum computation, and condensed matter approaches \u2014 all published with independently verifiable Zenodo DOIs.</p>' + statsHtml + '</header><div class="container"><div class="about-section"><h2>About QNFO</h2><p>QNFO is a research foundation that publishes analyses of computing paradigms, with a focus on thermodynamic efficiency and architectural honesty. Our core thesis: computational advantage must be measured in joules-per-solution, not qubit counts or press releases.</p><p>We maintain a <a href="/papers" style="color:var(--blue)">growing corpus of research papers</a>, a <a href="/graph" style="color:var(--blue)">knowledge graph</a> mapping conceptual relationships, and the <a href="/legal" style="color:var(--blue)">QNFO Unified License Agreement</a> governing intellectual property. Our commercial platform, <a href="https://qwav.org" style="color:var(--blue)">QWAV</a>, translates this research into pre-commercial computing architectures benchmarked with <a href="https://doi.org/10.5281/zenodo.21637028" style="color:var(--blue)" target="_blank" rel="noopener">JPCUB</a>.</p></div><div class="hub-cards">' + cardsHtml + "</div>" + papersHtml + '</div></main><footer class="site-footer" role="contentinfo"><div class="footer-links"><a href="/papers">Papers</a><a href="/graph">Knowledge Graph</a><a href="/legal">License</a><a href="https://qwav.org">QWAV Platform</a><a href="https://archive.qnfo.org">Archive</a><a href="/legal">Privacy</a></div><p>Licensed under <a href="/legal">QNFO-ULA v2.0</a><br>\xA9 2025\u20132026 QNFO Research Foundation</p></footer></body></html>';
}
__name(renderHubHTML, "renderHubHTML");
__name2(renderHubHTML, "renderHubHTML");
__name22(renderHubHTML, "renderHubHTML");
__name222(renderHubHTML, "renderHubHTML");
__name2222(renderHubHTML, "renderHubHTML");
__name22222(renderHubHTML, "renderHubHTML");
function renderPaperRow(p) {
  const cat = detectCategory(p.title, p.abstract);
  const cl = CATEGORY_LABELS[cat] || "";
  const ab = (p.abstract || "").slice(0, 280);
  return '<li class="paper-item"><a class="paper-title" href="/papers/' + escAttr(p.slug) + '">' + esc(p.title) + '</a><div class="paper-meta"><span>' + esc((p.created_at || "").slice(0, 10)) + "</span>" + (p.doi ? '<span>· DOI: <a href="https://doi.org/' + escAttr(p.doi) + '">' + esc(p.doi) + "</a></span>" : "") + (cl ? '<span class="paper-category">' + cl + "</span>" : "") + "</div>" + (ab ? '<div class="paper-abstract">' + esc(ab) + "</div>" : "") + "</li>";
}
__name(renderPaperRow, "renderPaperRow");
function renderIndexHTML(papers, total, offset, hasMore, activeCategory, searchQuery) {
  const fb = ["all", "qec", "number-theory", "physics", "computer-science", "other"].map((cat) => {
    const label = cat === "all" ? "All" : CATEGORY_LABELS[cat] || cat;
    const isActive = !activeCategory && cat === "all" || activeCategory === cat;
    const href = cat === "all" ? "/papers" : "/papers?category=" + cat;
    return '<a href="' + href + '" class="filter-btn' + (isActive ? " active" : "") + '">' + label + "</a>";
  }).join("");
  const sv = searchQuery ? escAttr(searchQuery) : "";
  const rows = papers.map(renderPaperRow).join("");
  const loadMoreHtml = hasMore ? '<div style="text-align:center;margin:1.4rem 0"><button id="load-more" class="filter-btn" onclick="loadMore()">Load more</button></div><script>var OFFSET=' + offset + ';var LIMIT=50;function loadMore(){var btn=document.getElementById("load-more");if(btn){btn.disabled=true;btn.textContent="Loading...";}var params="format=json&limit="+LIMIT+"&offset="+OFFSET;var q=new URLSearchParams(window.location.search);var cat=q.get("category");var s=q.get("search");if(cat){params+="&category="+encodeURIComponent(cat);}if(s){params+="&search="+encodeURIComponent(s);}fetch("/papers?"+params).then(function(r){return r.json();}).then(function(d){if(d&&d.rows&&d.rows.length){var ul=document.querySelector(".paper-list");ul.insertAdjacentHTML("beforeend",d.rows.join(""));OFFSET=d.offset+d.rows.length;var cnt=document.getElementById("paper-count");if(cnt){cnt.textContent=d.total+" papers";}var btn2=document.getElementById("load-more");if(btn2){btn2.disabled=false;btn2.textContent="Load more";if(!d.hasMore){btn2.style.display="none";}}}else{var btn3=document.getElementById("load-more");if(btn3){btn3.disabled=false;btn3.style.display="none";}}}).catch(function(){var btn4=document.getElementById("load-more");if(btn4){btn4.disabled=false;btn4.textContent="Load more";}});}<\/script>' : '';
  const title = searchQuery ? 'Search: "' + esc(searchQuery) + '" \u2014 QNFO Papers' : activeCategory ? (CATEGORY_LABELS[activeCategory] || activeCategory) + " Papers \u2014 QNFO" : "QNFO Papers";
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + title + '</title><meta name="description" content="QNFO research papers \u2014 open-science publications with Zenodo DOIs"><link rel="canonical" href="https://papers.qnfo.org/papers"><link rel="alternate" type="application/rss+xml" title="QNFO Papers RSS" href="/rss.xml"><style>' + COMMON_CSS + '</style><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script></head><body><nav class="top-nav"><a class="brand" href="https://qnfo.org"><span class="qmark">Q</span> QNFO</a><a href="/papers">Papers</a><a href="https://ideas.qnfo.org">Ideas</a><a href="https://qwav.org" class="qwav-badge">QWAV</a><a href="https://archive.qnfo.org">Archive</a><a href="https://legal.qnfo.org">License</a></nav><div class="container"><h1>' + (searchQuery ? 'Search: "' + esc(searchQuery) + '"' : activeCategory ? (CATEGORY_LABELS[activeCategory] || activeCategory) + " Papers" : "QNFO Papers") + '</h1><div class="filter-bar">' + fb + '</div><form method="get" action="/papers"><input type="text" name="search" class="search-box" placeholder="Search papers..." value="' + sv + '"></form><h2 id="paper-count">' + total + ' papers</h2><ul class="paper-list">' + rows + '</ul>' + loadMoreHtml + '</div><footer class="site-footer"><p>QNFO Papers \xB7 <a href="/rss.xml">RSS</a> \xB7 <a href="/sitemap.xml">Sitemap</a><br>Licensed under <a href="https://legal.qnfo.org">QNFO-ULA v2.0</a></p></footer></body></html>';
}
__name(renderIndexHTML, "renderIndexHTML");
__name2(renderIndexHTML, "renderIndexHTML");
__name22(renderIndexHTML, "renderIndexHTML");
__name222(renderIndexHTML, "renderIndexHTML");
__name2222(renderIndexHTML, "renderIndexHTML");
__name22222(renderIndexHTML, "renderIndexHTML");
function buildPaperJsonLd(paper) {
  const title = paper.title || "Untitled";
  const slug = paper.slug || "";
  const doi = paper.doi || "";
  const abs = (paper.abstract || "").slice(0, 3e3);
  let authors = [];
  const rawAuth = paper.authors || "";
  try {
    const p = JSON.parse(rawAuth);
    if (Array.isArray(p)) authors = p.map((a) => typeof a === "object" ? a.name || "" : String(a));
  } catch (e) {
    authors = rawAuth.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const authorObjs = authors.map((n) => ({ "@type": "Person", name: n }));
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
function citationAuthorsMeta(paper) {
  const rawAuth = paper.authors || "";
  let authors = [];
  try {
    const p = JSON.parse(rawAuth);
    if (Array.isArray(p)) authors = p.map((a) => typeof a === "object" ? a.name || "" : String(a));
  } catch (e) {
    authors = rawAuth.split(",").map((st) => st.trim()).filter(Boolean);
  }
  return authors.map((n) => '<meta name="citation_author" content="' + escAttr(n) + '">').join("");
}
__name(citationAuthorsMeta, "citationAuthorsMeta");
__name2(citationAuthorsMeta, "citationAuthorsMeta");
function renderPaperHTML(paper) {
  const cleanMd = fixMojibake(stripFrontmatter(paper.body_md || ""));
  const md = cleanMd;
  const abstract = (paper.abstract || "").slice(0, 300);
  const dateStr = paper.created_at ? paper.created_at.slice(0, 10) : "Unknown";
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' + buildPaperJsonLd(paper) + "<title>" + esc(paper.title) + ' \u2014 QNFO Papers</title><meta name="description" content="' + escAttr(abstract) + '"><meta property="og:title" content="' + escAttr(paper.title) + '"><meta property="og:type" content="article"><meta property="og:url" content="https://papers.qnfo.org/papers/' + escAttr(paper.slug) + '"><meta property="og:description" content="' + escAttr(abstract) + '">' + (paper.doi ? '<meta name="citation_doi" content="' + escAttr(paper.doi) + '">' : "") + '<meta name="citation_title" content="' + escAttr(paper.title) + '">' + citationAuthorsMeta(paper) + '<meta name="citation_publication_date" content="' + escAttr(dateStr) + '"><meta name="citation_publisher" content="QNFO Research Foundation"><link rel="canonical" href="https://papers.qnfo.org/papers/' + escAttr(paper.slug) + '"><style>' + COMMON_CSS + '.rendered-md{font-family:"STIX Two Text",Cambria,Georgia,"Times New Roman",serif;font-size:15.5px;line-height:1.6;color:#111;text-align:justify;hyphens:auto;-webkit-hyphens:auto;max-width:100%;overflow-wrap:break-word}.rendered-md h1{font-size:22px;font-weight:700;line-height:1.3;margin:0 0 10px 0;text-align:left;hyphens:none}.rendered-md h2{font-size:18px;font-weight:700;margin:28px 0 10px 0;border-bottom:.6px solid #aaa;padding-bottom:4px}.rendered-md h3{font-size:16px;font-weight:700;margin:22px 0 8px 0}.rendered-md h4{font-size:15px;font-weight:700;font-style:italic;margin:18px 0 6px 0}.rendered-md h5{font-size:13.5px;font-weight:700;margin:16px 0 6px 0}.rendered-md h6{font-size:13px;font-weight:700;font-style:italic;margin:14px 0 6px 0}.rendered-md p{margin:0 0 10px 0}.rendered-md ul,.rendered-md ol{margin:0 0 10px 0;padding-left:26px}.rendered-md li{margin-bottom:3px}.rendered-md mjx-container{font-size:1.02em;max-width:100%;overflow-x:auto}.rendered-md mjx-container[display="true"]{margin:14px 0 !important;text-align:center !important}.rendered-md table{width:100%;border-collapse:collapse;margin:12px 0 14px 0;font-size:13.5px;line-height:1.45}.rendered-md thead{display:table-header-group}.rendered-md th{font-weight:700;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;padding:5px 8px}.rendered-md td{border-bottom:.5px solid #bbb;padding:4px 8px;vertical-align:top}.rendered-md tr:last-child td{border-bottom:2px solid #000}.rendered-md pre{font-family:Consolas,"Courier New",monospace;font-size:12.5px;line-height:1.45;background:#f8f8f8;border:.5px solid #ddd;border-radius:4px;padding:10px;margin:12px 0;white-space:pre-wrap;word-wrap:break-word;overflow-x:auto}.rendered-md code{font-family:Consolas,"Courier New",monospace;font-size:.9em;background:#f2f2f2;padding:0 3px;border-radius:3px}.rendered-md blockquote{margin:12px 0;padding:6px 14px;border-left:3px solid #777;background:#fafafa;color:#222}.rendered-md a{color:var(--accent);text-decoration:none}.rendered-md a:hover{text-decoration:underline}.rendered-md hr{border:none;border-top:1px solid #999;margin:16px 0}.rendered-md .math-display{text-align:center;margin:14px 0;overflow-x:auto}</style><script>window.MathJax={tex:{inlineMath:[["$","$"]],displayMath:[["$$","$$"]],processEscapes:true},svg:{scale:1.1,fontCache:"global"},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"],enableMenu:false}};function __mq(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise().catch(function(){})}}if(document.readyState==="complete"){setTimeout(__mq,150)}else{window.addEventListener("load",function(){setTimeout(__mq,150)})}</script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js" id="MathJax-script" onerror="this.onerror=null;var s=document.createElement(&quot;script&quot;);s.src=&quot;https://unpkg.com/mathjax@3/es5/tex-svg-full.js&quot;;document.head.appendChild(s);"></script><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-LV7RHRVW6R"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-LV7RHRVW6R");<\/script></head><body><nav class="top-nav"><a class="brand" href="https://qnfo.org"><span class="qmark">Q</span> QNFO</a><a href="/papers">Papers</a><a href="https://ideas.qnfo.org">Ideas</a><a href="https://qwav.org" class="qwav-badge">QWAV</a></nav><div class="paper-body"><a class="back-link" href="/papers">\u2190 All papers</a><article><h1>' + esc(paper.title) + '</h1><div class="paper-meta">' + (paper.doi ? '<strong>DOI:</strong> <a href="https://doi.org/' + escAttr(paper.doi) + '">' + esc(paper.doi) + "</a><br>" : "") + "<strong>Published:</strong> " + dateStr + '</div><div class="rendered-md">' + renderMarkdown(md) + "</div></article></div></body></html>";
}
__name(renderPaperHTML, "renderPaperHTML");
__name2(renderPaperHTML, "renderPaperHTML");
__name22(renderPaperHTML, "renderPaperHTML");
__name222(renderPaperHTML, "renderPaperHTML");
__name2222(renderPaperHTML, "renderPaperHTML");
__name22222(renderPaperHTML, "renderPaperHTML");
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
async function handlePapers(request, env) {
  try {
    const u = new URL(request.url);
    const category = u.searchParams.get("category");
    const search = (u.searchParams.get("search") || "").trim();
    const limit = Math.min(Math.max(parseInt(u.searchParams.get("limit") || "50", 10), 1), 200);
    const offset = Math.max(parseInt(u.searchParams.get("offset") || "0", 10), 0);
    let sql = "SELECT slug,title,doi,abstract,created_at,status,version,authors FROM papers WHERE slug IS NOT NULL";
    const params = [];
    if (search) {
      sql += " AND (title LIKE ? OR abstract LIKE ? OR authors LIKE ?)";
      const term = "%" + search + "%";
      params.push(term, term, term);
    }
    sql += " ORDER BY created_at DESC";
    const res = await env.LIVING_PAPER.prepare(sql).bind(...params).all();
    let all = res.results || [];
    if (category && category !== "all") {
      all = all.filter((p) => detectCategory(p.title, p.abstract) === category);
    }
    const total = all.length;
    const page = all.slice(offset, offset + limit);
    const hasMore = offset + page.length < total;
    if (u.searchParams.get("format") === "json") {
      return json({ papers: page, rows: page.map(renderPaperRow), count: page.length, total, offset, limit, hasMore, category: category || null, search: search || null });
    }
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/html") || !accept.includes("application/json")) {
      return new Response(renderIndexHTML(page, total, offset, hasMore, category || null, search), {
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
async function handlePaperDetail(request, env, path) {
  const slug = path.split("/")[2];
  if (!slug) return json({ error: "Missing paper slug" }, 400);
  try {
    const paper = await env.LIVING_PAPER.prepare(
      "SELECT slug,title,body_md,abstract,authors,doi,created_at,status,version FROM papers WHERE slug = ? LIMIT 1"
    ).bind(slug).first();
    if (!paper) return json({ error: "Paper not found", slug }, 404);
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/html") || !accept.includes("application/json")) {
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
async function handleHub(env) {
  try {
    const [papersRes, countRes, nodesRes] = await Promise.all([
      env.LIVING_PAPER.prepare("SELECT slug,title,created_at FROM papers WHERE slug IS NOT NULL ORDER BY created_at DESC LIMIT 8").all(),
      env.LIVING_PAPER.prepare("SELECT COUNT(*) as cnt FROM papers WHERE slug IS NOT NULL").first(),
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
async function handleAbout(env) {
  try {
    const [pc, nc, ec] = await Promise.all([
      env.LIVING_PAPER.prepare("SELECT COUNT(*) as cnt FROM papers WHERE slug IS NOT NULL").first(),
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>About QNFO \u2014 QNFO Research Foundation</title><meta name="description" content="What QNFO knows about itself: the thesis, the record, the pipeline, and the operator. Counts queried live."><meta property="og:title" content="About QNFO"><meta property="og:description" content="What QNFO knows about itself. Live record: ${stats.papers} papers, ${stats.nodes} graph nodes."><meta property="og:type" content="website"><meta property="og:url" content="https://qnfo.org/about"><link rel="canonical" href="https://qnfo.org/about"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%2324315e'/><text x='16' y='23' text-anchor='middle' font-size='18' fill='white' font-family='system-ui'>Q</text></svg>"><style>${pageCSS}</style></head><body><a href="#about-main" class="skip-link">Skip to main content</a><nav class="top-nav" role="navigation" aria-label="Main"><a class="brand" href="/" aria-label="QNFO home"><span class="qmark">Q</span> QNFO</a><a href="/papers">Papers</a><a href="/graph">Knowledge Graph</a><a href="/about">About</a><a href="https://ideas.qnfo.org">Ideas</a><a href="https://qwav.org" class="qwav-badge">QWAV</a><a href="https://archive.qnfo.org">Archive</a><a href="/legal">License</a><a href="https://ipatent.qnfo.org">iPatent</a></nav><main id="about-main" class="about-page"><h1>About QNFO</h1><p class="meta-line">established 2025 \u00b7 living record \u00b7 modified 2026-09-03 \u00b7 counts queried live</p><p class="lede">QNFO is a research foundation that publishes critical analyses of the quantum computing industry. This page is what QNFO knows about itself. It changes when the record changes.</p><h2>What QNFO is</h2><p>An open-science research collective working across p-adic mathematics, ultrametric geometry, topological quantum computation, and condensed-matter approaches. Publications carry Zenodo DOIs and are independently verifiable. The corpus is browsable on <a href="/papers">papers.qnfo.org</a> and mapped in the <a href="/graph">knowledge graph</a>.</p><p class="aside">QNFO is not an acronym. The name is the name.</p><h2>The thesis</h2><p>Computational advantage is measured in joules-per-solution, not qubit counts or press releases. The <a href="https://github.com/rwnq8/joules-per-compute-benchmark">joules-per-compute benchmark</a> formalizes the questions the industry prefers to defer: the Landauer floor for cryogenic controllers, the Margolus\u2013Levitin bound as a scheduling constraint, and the energy floor of surface-code error correction at a thousand logical qubits.</p><p class="aside">The current line of work is energy accounting for quantum hardware claims. Recent papers are listed on the front page.</p><h2>The record</h2><table class="record-table"><tbody><tr><td>Papers in the corpus</td><td>${stats.papers} \u2014 counted live</td></tr><tr><td>Knowledge graph</td><td>${stats.nodes} nodes, ${stats.edges} edges \u2014 counted live</td></tr><tr><td>Worker fleet</td><td>62</td></tr><tr><td>Databases, vector indexes, object buckets</td><td>8 \u00b7 9 \u00b7 17</td></tr><tr><td>Queries logged (2026-09-03)</td><td>1,983</td></tr><tr><td>Honest daily readership</td><td>~400 requests per day on /papers/*</td></tr></tbody></table><p class="record-note">The first two rows are queried live on every request. Fleet figures were counted by the operations agent on 2026-09-03. Roughly nine in ten requests to the zone are scanner noise; the readership figure excludes it.</p><h2>How QNFO runs</h2><p>A cloud-scheduled pipeline keeps the corpus alive: an arXiv radar at 08:30 UTC, a research brief at 06:00 UTC, an hourly errata watch that turns corrections into new versions of the same record, a citation watch, and a weekly visibility digest. Outreach is capped and opt-out.</p><p class="aside">If the laptop is off, the pipeline does not notice.</p><h2>How QNFO holds itself</h2><p>Every quantitative claim is computationally verified before publication, with the verification artifacts deposited beside the paper. Traffic is never fabricated. Disconfirmation criteria are stated in advance. Corrections ship as new versions of the same record.</p><p class="aside">The record is the record.</p><h2>The operator</h2><p>QNFO is operated by Rowan Brad Quni-Gudzinas (<a href="https://orcid.org/0009-0002-4317-5604">ORCID 0009-0002-4317-5604</a>). Contact: <a href="mailto:qnfo@qnfo.org">qnfo@qnfo.org</a>.</p><p class="aside">The corpus discloses its own construction. There is nothing else to disclose.</p><h2>Changelog</h2><table class="changelog"><tbody><tr><td>2026-09-03</td><td>This page, with hub record counts rendered live. Model-key guard on a thirty-minute scheduler cadence.</td></tr><tr><td>2026-09-02</td><td>Outreach engine live \u2014 capped and opt-out. Weekly scorecard publishing real traffic deltas. Website-sync gate fixed.</td></tr><tr><td>2026-08-29</td><td>Universal Ignorance Audit re-pointed to v0.4 (<a href="https://doi.org/10.5281/zenodo.22158133">10.5281/zenodo.22158133</a>).</td></tr><tr><td>2026-08-28</td><td>OSF pre-registrations placed; results attached as comments on frozen registrations.</td></tr><tr><td>2026-08-10</td><td>Email deliverability hardened: SPF, DKIM, DMARC at reject on every sending domain.</td></tr></tbody></table><h2>Colophon</h2><p>One design system across every QNFO surface: warm paper, ink, navy. This page is generated by the qnfo-gateway worker. No tracker is added by this page.</p></main><footer class="site-footer" role="contentinfo"><div class="footer-links"><a href="/papers">Papers</a><a href="/graph">Knowledge Graph</a><a href="/about">About</a><a href="/legal">License</a><a href="https://qwav.org">QWAV Platform</a><a href="https://archive.qnfo.org">Archive</a><a href="/legal">Privacy</a></div><p>Licensed under <a href="/legal">QNFO-ULA v2.0</a><br>\u00A9 2025\u20132026 QNFO Research Foundation</p></footer></body></html>`;
}

async function handleSitemap(env) {
  try {
    const res = await env.LIVING_PAPER.prepare("SELECT slug, created_at FROM papers WHERE slug IS NOT NULL ORDER BY created_at DESC").all();
    const base = "https://papers.qnfo.org";
    const all = [
      { loc: base + "/", priority: "1.0" },
      { loc: base + "/papers", priority: "0.9" },
      { loc: "https://qnfo.org/about", priority: "0.8" }
    ].concat(res.results.map((p) => ({
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
async function handleLlmsTxt(env) {
  try {
    const res = await env.LIVING_PAPER.prepare("SELECT slug,title,doi,abstract,created_at FROM papers WHERE slug IS NOT NULL ORDER BY created_at DESC LIMIT 200").all();
    const base = "https://papers.qnfo.org";
    let body = "# QNFO Papers\n\n> Open-science research across p-adic mathematics, ultrametric geometry, topological quantum computation.\n\n## Site\n\n- [About QNFO](https://qnfo.org/about)\n\n## Papers\n\n";
    body += res.results.map((p) => "- [" + p.title + "](" + base + "/papers/" + encodeURIComponent(p.slug) + ")" + (p.doi ? " (DOI: " + p.doi + ")" : "")).join("\n");
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
async function handleRss(env) {
  try {
    const res = await env.LIVING_PAPER.prepare("SELECT slug,title,doi,abstract,created_at FROM papers WHERE slug IS NOT NULL ORDER BY created_at DESC LIMIT 50").all();
    const base = "https://papers.qnfo.org";
    const now = (/* @__PURE__ */ new Date()).toUTCString();
    const items = res.results.map((p) => {
      let pubDate = now;
      try {
        pubDate = new Date(p.created_at).toUTCString();
      } catch (e) {
      }
      const link = base + "/papers/" + encodeURIComponent(p.slug);
      return "  <item>\n    <title>" + xmlEscape(p.title) + "</title>\n    <link>" + xmlEscape(link) + '</link>\n    <guid isPermaLink="true">' + xmlEscape(link) + "</guid>\n    <description>" + xmlEscape(p.abstract || "") + "</description>\n    <pubDate>" + pubDate + "</pubDate>\n  </item>";
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
function health() {
  return json({ status: "ok", worker: "qnfo-gateway", version: "3.5.1-redteam-fixes" });
}
__name(health, "health");
__name2(health, "health");
__name22(health, "health");
__name222(health, "health");
__name2222(health, "health");
__name22222(health, "health");
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
async function handleAskAI(request, env) {
  if (!env.AI) return json({ error: "AI binding not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const { slug, question } = body;
  if (!question || !question.trim()) return json({ error: "Missing question" }, 400);
  try {
    let paperTitle = "", paperBody = "";
    if (slug) {
      const paper = await env.LIVING_PAPER.prepare("SELECT title,body_md,abstract FROM papers WHERE slug = ? LIMIT 1").bind(slug).first();
      if (paper) {
        paperTitle = paper.title || "";
        paperBody = (stripFrontmatter(paper.body_md) || paper.abstract || "").slice(0, 6e3);
      }
    }
    const result = await env.AI.run("@cf/qwen/qwen3-30b-a3b-fp8", {
      messages: [
        { role: "system", content: 'You are a research assistant for a QNFO paper titled "' + paperTitle + '".' },
        { role: "user", content: question + "\n\nPaper content: " + paperBody }
      ]
    });
    return json({ answer: result?.response || "No response generated.", slug: slug || null });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
__name(handleAskAI, "handleAskAI");
__name2(handleAskAI, "handleAskAI");
__name22(handleAskAI, "handleAskAI");
__name222(handleAskAI, "handleAskAI");
__name2222(handleAskAI, "handleAskAI");
__name22222(handleAskAI, "handleAskAI");
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
async function handleQuery(request, env) {
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
var gateway_worker_default = {
  async fetch(request, env) {
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
      if (p === "/sitemap.xml") return handleSitemap(env);
      if (p === "/robots.txt") return handlePapersRobots();
      if (p === "/llms.txt") return handleLlmsTxt(env);
      if (p === "/rss.xml" || p === "/feed.xml") return handleRss(env);
      if (p.startsWith("/papers/") && p.split("/").length >= 3) return handlePaperDetail(request, env, p);
      if (p === "/ipatent" || p === "/ipatent/") return new Response(null, { status: 301, headers: { Location: "https://ipatent.qnfo.org/" } });
      if (p === "/papers" || p === "/") return handlePapers(request, env);
      return handlePapers(request, env);
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
        if (p === "/" || p === "/health") return json({ status: "ok", version: "3.4", database: "qnfo-graph" });
        return json({ error: "Not found", path: p }, 404);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }
    if (host === "qnfo.org" || host === "www.qnfo.org") {
      if (p === "/health") return health();
      if (p === "/legal" || p === "/license") return handleLegal(p, env);
      if (p === "/api/ask" && method === "POST") return handleAskAI(request, env);
      if (p.startsWith("/papers/") && p.split("/").length >= 3) return handlePaperDetail(request, env, p);
      if (p === "/papers" || p.startsWith("/papers?")) return handlePapers(request, env);
      if (p === "/sitemap.xml") return handleSitemap(env);
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
      if (p === "/" || p === "") return handleHub(env);
      return json({ error: "Not found", path: p }, 404);
    }
    if (p === "/health") return health();
    if (p === "/legal" || p === "/license") return handleLegal(p, env);
    if (p === "/api/ask" && method === "POST") return handleAskAI(request, env);
    if (p.startsWith("/papers/") && p.split("/").length >= 3) return handlePaperDetail(request, env, p);
    if (p.startsWith("/papers") || p === "/") return handlePapers(request, env);
    if (p === "/sitemap.xml") return handleSitemap(env);
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
  }
};
export {
  gateway_worker_default as default
};
//# sourceMappingURL=qnfo-gateway.js.map
