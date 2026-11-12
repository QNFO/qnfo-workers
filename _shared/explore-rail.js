// ---- EXPLORE-RAIL-1:BEGIN (sourced from _shared/explore-rail.js; applied by scripts/explore-rail-apply.mjs; do not edit inside a worker) ----
// EXPLORE-RAIL-1 (2026-11-10, pillar reach; owner directive: "whatever property a visitor lands on there is always something to do, click or see across the whole
// Qniverse portfolio, without feeling overwhelmed").
//
// WHAT. One "Keep exploring" block at the foot of every public HTML page of every public property: three next steps chosen for the page the visitor is on (a
// rotating window over a per-property ordered list, so the same page offers the same relevant doors but not the same three every day), and the full map of the
// public Qniverse behind one disclosure. Nothing is shown twice: a page that already carries the QDS "Keep exploring" section (class q-explore) gets a compact
// "Also in the Qniverse" row with only the properties that section lacks.
//
// WHY here and not per template. A per-template change misses the next template and the next worker (REACH-LAYER-1 learned that on the gateway). This block is
// generated from this one file into each public-facing worker, attached to the default export the way WEBMCP-FLEET-1 is, and gated by the request HOST, so a worker
// that also serves a private surface never decorates it.
//
// LIMITS. Public properties only: the personal plane (me, jobs, mind, watch, reading, travel on q08.org) is absent from the catalog on purpose, so a visitor to a
// public page is never pointed at the owner's private surfaces and a private page is never decorated (personal/research separation, DOMAIN-PLANE-1). Only
// 200 text/html GET answers are changed; JSON, feeds, PDFs, previews inside frames, API paths, unsubscribe and confirm pages pass through. Every link is tagged
// utm_medium=explore-rail so utm_clicks measures which doors people take (clicks are not readers: READER-YIELD-1).
var ER_VERSION = "1.2.0";
// ULTRASTABLE-FOOTER-1 (2026-11-10, owner directive: the whole autonomous system runs on Ultrastable, so say so in the footer of every page, with more cross-product links).
// One strip at the foot of every rail (full and compact): the platform line plus the doors that prove and show it. Public links only.
var ER_PLATFORM = [
  { t: "Ultrastable", u: "https://ultrastable.io/" },
  { t: "Proof", u: "https://ultrastable.io/proof" },
  { t: "How QNFO runs", u: "https://qnfo.org/platform" },
  { t: "Live fleet", u: "https://fleet.qnfo.org/" },
  { t: "Paper library", u: "https://papers.qnfo.org/papers" },
  { t: "Ask the corpus", u: "https://ask.qwav.org/" },
  { t: "Archive", u: "https://archive.qnfo.org/" },
  { t: "QWAV", u: "https://qwav.org/" }
];
// key, host, path, title, one line a visitor can act on, call to action. `next` is the ordered list of the most useful doors from that property.
var ER_PROPS = [
  { k: "qnfo", hosts: ["qnfo.org", "www.qnfo.org", "legal.qnfo.org"], url: "https://qnfo.org/", t: "QNFO", d: "The research imprint: open papers, an assistant that cites them, and an ideas feed.", cta: "Start here", next: ["papers", "ask", "ideas", "qwav", "ipatent"] },
  { k: "papers", hosts: ["papers.qnfo.org"], url: "https://papers.qnfo.org/papers", t: "Paper library", d: "Every paper is open, versioned and citable, with a Quick read and an Ask panel on each page.", cta: "Browse the papers", next: ["ask", "ideas", "archive", "qwav", "ipatent"] },
  { k: "ask", hosts: ["ask.qwav.org", "ask.qwav.tech"], url: "https://ask.qwav.org/", t: "Ask the corpus", d: "Ask a question and get an answer drawn only from the published papers, with a citation for every claim.", cta: "Ask a question", next: ["papers", "ideas", "qwav", "archive", "ipatent"] },
  { k: "ideas", hosts: ["ideas.qnfo.org"], url: "https://ideas.qnfo.org/", t: "Idea threads", d: "See what is being asked, what the papers cannot yet answer, and what gets studied next.", cta: "Follow the threads", next: ["papers", "ask", "qwav", "archive", "markets"] },
  { k: "qwav", hosts: ["qwav.org", "www.qwav.org", "qwav.tech", "www.qwav.tech"], url: "https://qwav.org/", t: "QWAV", d: "Quantum computing measured in joules per correct answer: the JPCUB benchmark and the p-adic architecture.", cta: "Explore quantum", next: ["papers", "ask", "ideas", "archive", "qnfo"] },
  { k: "archive", hosts: ["archive.qnfo.org"], url: "https://archive.qnfo.org/", t: "Archive", d: "The permanent record: every version of every paper, with what changed and when.", cta: "Open the archive", next: ["papers", "ask", "qwav", "ideas", "fleet"] },
  { k: "ipatent", hosts: ["ipatent.qnfo.org"], url: "https://ipatent.qnfo.org/", t: "iPatent", d: "Free provisional patent drafting with a claim-support check, built on the same research.", cta: "Draft a patent", next: ["papers", "ask", "qnfo", "ideas", "qwav"] },
  { k: "markets", hosts: ["markets.q08.org"], url: "https://markets.q08.org/", t: "q08 forecasts", d: "Pre-registered forecasts on the events that move markets, hash-chained before the event and scored when it settles, misses included.", cta: "See the live calls", next: ["q08", "qnfo", "fleet", "papers", "ideas"] },
  { k: "q08", hosts: ["q08.org", "www.q08.org"], url: "https://q08.org/", t: "q08 signal to value", d: "Public signals become forecasts on real prediction markets, priced as simulated positions, every result in the open.", cta: "Follow the pipeline", next: ["markets", "qnfo", "fleet", "papers", "ideas"] },
  { k: "fleet", hosts: ["fleet.qnfo.org"], url: "https://fleet.qnfo.org/", t: "Live fleet", d: "Watch the autonomous system run: what it is working on, shipping and measuring right now.", cta: "Watch it run", next: ["papers", "ideas", "qnfo", "archive", "ask"] }
];
// Paths that are never decorated: machine routes, one-time-link pages, and the rail's own host-independent exclusions.
var ER_SKIP_PATH = /^\/(api|health|\.well-known|\.webmcp|unsubscribe|confirm|subscribe|v1|mcp|stream|rss|sitemap|robots|og\.jpg|qds|work-with-me)(\/|\.|$)|\.(xml|json|txt|pdf|css|js|png|jpe?g|svg|ico)$/i;
function erProp(host) {
  var h = String(host || "").toLowerCase();
  for (var i = 0; i < ER_PROPS.length; i++) if (ER_PROPS[i].hosts.indexOf(h) >= 0) return ER_PROPS[i];
  return null;
}
function erByKey(k) { for (var i = 0; i < ER_PROPS.length; i++) if (ER_PROPS[i].k === k) return ER_PROPS[i]; return null; }
function erEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function erHash(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; }
function erLink(p, fromHost) { return p.url + (p.url.indexOf("?") >= 0 ? "&" : "?") + "utm_source=" + encodeURIComponent(fromHost) + "&utm_medium=explore-rail&utm_campaign=explore-rail"; }
// The three doors for this page: a window over the property's ordered `next` list, moved by the page path and the day.
function erPicks(cur, path, day, skipKeys) {
  var list = (cur.next || []).filter(function (k) { return k !== cur.k && !(skipKeys && skipKeys.indexOf(k) >= 0) && erByKey(k); });
  if (skipKeys && skipKeys.length) ER_PROPS.forEach(function (q) { if (list.length < 5 && q.k !== cur.k && list.indexOf(q.k) < 0 && skipKeys.indexOf(q.k) < 0) list.push(q.k); }); // compact: pad with doors the page lacks
  if (list.length <= 3) return list.map(erByKey);
  var off = (erHash(path) + (day | 0)) % list.length, out = [];
  for (var i = 0; i < 3; i++) out.push(erByKey(list[(off + i) % list.length]));
  return out;
}
var ER_CSS = ".er{box-sizing:border-box;max-width:960px;margin:32px auto 0;padding:20px 16px;border-top:1px solid #c9d0e6;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#14182e;background:#f5f7fb}"
  + ".er *{box-sizing:border-box}.er h2{margin:0 0 4px;font-size:21px;line-height:1.25;color:#14182e}.er p{margin:0 0 14px;font-size:16px;color:#3a4160}"
  + ".er-row{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}"
  + ".er-card{display:flex;flex-direction:column;gap:4px;min-height:44px;padding:14px;border:1px solid #c9d0e6;border-radius:12px;background:#fff;color:#14182e;text-decoration:none}"
  + ".er-card:hover{border-color:#1b3fd1}.er-card:focus-visible,.er-all a:focus-visible,.er-all summary:focus-visible{outline:3px solid #1b3fd1;outline-offset:2px}"
  + ".er-card b{font-size:17px}.er-card span{font-size:15px;color:#3a4160}.er-card small{font-size:15px;font-weight:650;color:#1b3fd1}"
  + ".er-plat{margin:18px 0 0;padding-top:14px;border-top:1px solid #c9d0e6;font-size:15px;color:#3a4160}.er-plat b{color:#14182e}.er-plat ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:0 16px}.er-plat a{display:inline-flex;align-items:center;min-height:44px;color:#1b3fd1;font-weight:650}.er-plat a:focus-visible{outline:3px solid #1b3fd1;outline-offset:2px}.er-all{margin-top:12px}.er-all summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:650;color:#1b3fd1}"
  + ".er-all ul{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:2px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}"
  + ".er-all li a{display:flex;flex-direction:column;min-height:44px;justify-content:center;padding:6px 4px;color:#14182e;text-decoration:none;font-size:16px}"
  + ".er-all li a:hover b{text-decoration:underline}.er-all li span{font-size:14px;color:#3a4160}.er-all [aria-current]{opacity:.75}"
  + "@media (prefers-color-scheme:dark){.er{background:#141a33;border-color:#3a4270;color:#eef1fb}.er h2{color:#eef1fb}.er p,.er-card span,.er-all li span{color:#c5cbe6}"
  + ".er-plat{border-color:#3a4270;color:#c5cbe6}.er-plat b{color:#eef1fb}.er-plat a{color:#aebfff}.er-plat a:focus-visible{outline-color:#aebfff}.er-card{background:#1b2142;border-color:#3a4270;color:#eef1fb}.er-card small,.er-all summary{color:#aebfff}.er-card:hover{border-color:#aebfff}.er-all li a{color:#eef1fb}"
  + ".er-card:focus-visible,.er-all a:focus-visible,.er-all summary:focus-visible{outline-color:#aebfff}}"
  + "@media (prefers-reduced-motion:reduce){.er *{transition:none!important}}";
// compact: the page already has a Keep exploring section, so list only the doors it does not carry.
function erRailHtml(host, path, day, compact) {
  var cur = erProp(host);
  if (!cur) return "";
  var fromHost = String(host).toLowerCase();
  var have = compact ? ["qnfo", "papers", "ask", "ideas", "qwav", "q08"] : [];
  var picks = erPicks(cur, path, day, have);
  if (compact && !picks.length) return "";
  var cards = picks.map(function (p) {
    return '<a class="er-card" href="' + erEsc(erLink(p, fromHost)) + '"><b>' + erEsc(p.t) + "</b><span>" + erEsc(p.d) + "</span><small>" + erEsc(p.cta) + " &rarr;</small></a>";
  }).join("");
  var all = "";
  if (!compact) {
    all = '<details class="er-all"><summary>Everywhere in the Qniverse (' + ER_PROPS.length + ")</summary><ul>" + ER_PROPS.map(function (p) {
      var here = p.k === cur.k;
      return '<li><a href="' + erEsc(erLink(p, fromHost)) + '"' + (here ? ' aria-current="page"' : "") + "><b>" + erEsc(p.t) + (here ? " (you are here)" : "") + "</b><span>" + erEsc(p.d) + "</span></a></li>";
    }).join("") + "</ul></details>";
  }
  var h = compact ? "Also in the Qniverse" : "Keep exploring the Qniverse";
  var s = compact ? "More places that build on the same research." : "Pick one: each opens a different part of the same body of work.";
  var plat = '<div class="er-plat" data-ultrastable-footer><b>QNFO runs on Ultrastable,</b> the autonomous development platform behind every paper, page and answer here.<ul>' + ER_PLATFORM.map(function (l) {
    return '<li><a href="' + erEsc(l.u + (l.u.indexOf("?") >= 0 ? "&" : "?") + "utm_source=" + encodeURIComponent(fromHost) + "&utm_medium=explore-rail&utm_campaign=ultrastable-footer") + '">' + erEsc(l.t) + "</a></li>";
  }).join("") + "</ul></div>";
  return '<aside class="er" data-explore-rail="' + ER_VERSION + '" aria-labelledby="er-h"><style>' + ER_CSS + '</style><h2 id="er-h">' + h + "</h2><p>" + s + '</p><div class="er-row">' + cards + "</div>" + all + plat + "</aside>";
}
// Pure: (html, page URL, day) -> html with the rail added once. Returns the input unchanged when the page is not eligible.
function erInject(html, pageUrl, day) {
  var h = String(html || ""), u;
  try { u = new URL(pageUrl); } catch (e) { return h; }
  if (!erProp(u.hostname) || ER_SKIP_PATH.test(u.pathname) || h.indexOf("data-explore-rail") >= 0 || h.length > 2000000) return h;
  var bi = h.toLowerCase().lastIndexOf("</body>");
  if (bi < 0) return h;
  var rail = erRailHtml(u.hostname, u.pathname.replace(/\/+$/, "") || "/", day, /class="[^"]*\bq-explore\b/.test(h));
  if (!rail) return h;
  var at = bi, mi = h.toLowerCase().lastIndexOf("</main>");
  if (mi >= 0 && mi < bi) { var fi = h.toLowerCase().indexOf("<footer", mi); if (fi >= 0 && fi < bi) at = fi; }
  return h.slice(0, at) + rail + h.slice(at);
}
async function erWithRail(res, request) {
  try {
    var ct = res && res.headers && res.headers.get("Content-Type") || "";
    if (!res || res.status !== 200 || ct.indexOf("text/html") !== 0 || !request || request.method !== "GET") return res;
    var u = new URL(request.url);
    if (!erProp(u.hostname) || ER_SKIP_PATH.test(u.pathname)) return res;
    var dest = request.headers.get("Sec-Fetch-Dest");
    if (dest && dest !== "document") return res; // a frame, an embed or a prefetch is not a place to send people onward
    var html = await res.text();
    var out = erInject(html, request.url, Math.floor(Date.now() / 86400000));
    var hd = new Headers(res.headers);
    hd.delete("Content-Length");
    hd.set("X-Explore-Rail", out === html ? "none" : ER_VERSION);
    return new Response(out, { status: res.status, statusText: res.statusText, headers: hd });
  } catch (e) {
    return res;
  }
}
function erAttach(target) {
  try {
    if (!target || typeof target.fetch !== "function" || target.__er === ER_VERSION) return target;
    var orig = target.fetch;
    target.fetch = async function (request, env, ctx) { return erWithRail(await orig.call(this, request, env, ctx), request); };
    target.__er = ER_VERSION;
    return target;
  } catch (e) {
    return target;
  }
}
// ---- EXPLORE-RAIL-1:END ----
