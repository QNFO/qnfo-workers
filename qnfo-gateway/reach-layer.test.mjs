// REACH-LAYER-1 offline suite (qnfo-gateway, pillar reach). The gateway guarantees, on every HTML page it serves for
// qnfo.org, www.qnfo.org and papers.qnfo.org, the basics REACH-IDEATION-1 checks: a share image, a canonical, JSON-LD
// crediting the author, the author's name, a "Work with me" contact path, the iPatent flagship link and a subscribe box.
// This suite checks the pure transform (missing pieces are added, present ones are never duplicated or edited, other
// hosts and non-HTML pass through, the author is always the owner's ORCID) and the real fetch handler end to end with a
// stubbed D1: /og.jpg serves a 1200x630 JPEG, served pages carry X-Reach-Layer and pass every IDEA_CHECKS test copied
// from qnfo-fleet-control (so the ideation loop closes its gateway issues on its next run).
// Run: node qnfo-gateway/reach-layer.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra).slice(0, 400) : "")); } };

// ---- pure transform, extracted from the worker source (no copy that could drift) ----
const b = src.indexOf("// ---- REACH-LAYER-1:BEGIN"), e = src.indexOf("// ---- REACH-LAYER-1:END");
ok(b > 0 && e > b, "REACH-LAYER-1 block markers present");
const ctx = { URL, Headers, Response, atob, Uint8Array, subscribeBlock: (s) => '<form><input type="email" data-src="' + s + '"></form>' };
vm.createContext(ctx);
vm.runInContext(src.slice(b, e) + "\nthis.reachLayerHtml = reachLayerHtml; this.withReachLayer = withReachLayer; this.reachOgImage = reachOgImage;", ctx);
const L = (html, url) => ctx.reachLayerHtml(html, url || "https://qnfo.org/");
const count = (h, re) => (h.match(re) || []).length;

const bare = "<!DOCTYPE html><html><head><title>Bare page</title></head><body><p>Hi</p></body></html>";
const out = L(bare, "https://papers.qnfo.org/papers/x?utm_source=y");
ok(/property="og:image" content="https:\/\/qnfo\.org\/og\.jpg"/.test(out), "bare page gets og:image");
ok(/name="twitter:card" content="summary_large_image"/.test(out), "bare page gets twitter:card summary_large_image");
ok(/rel="canonical" href="https:\/\/papers\.qnfo\.org\/papers\/x"/.test(out), "canonical is https, host + path, no query");
const ldm = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(out);
let ld = null; try { ld = JSON.parse(ldm[1]); } catch (x) {}
ok(ld && ld["@type"] === "WebPage" && ld.name === "Bare page" && ld.author.sameAs[0] === "https://orcid.org/0009-0002-4317-5604", "JSON-LD WebPage with the owner's ORCID", ld);
ok(/Quni-Gudzinas/.test(out) && /work-with-me\?utm_source=papers\.qnfo\.org&utm_medium=referral&utm_campaign=reach-layer/.test(out), "author credit and UTM-tagged Work with me");
ok(/ipatent\.qnfo\.org\/example\?utm_source=papers\.qnfo\.org/.test(out), "UTM-tagged iPatent link");
ok(/type="email" data-src="papers\.qnfo\.org\/reach-layer"/.test(out), "subscribe box with source host/reach-layer");
ok(out.indexOf('<aside class="qnfo-reach"') < out.lastIndexOf("</body>") && out.indexOf("<p>Hi</p>") < out.indexOf('<aside class="qnfo-reach"'), "strip sits after content, before </body>");
ok(L(out, "https://papers.qnfo.org/papers/x") === out, "idempotent: a second pass changes nothing");

const full = '<html><head><meta property="og:image" content="https://x/a.png"><meta name="twitter:card" content="summary"><link rel="canonical" href="https://qnfo.org/a"><script type="application/ld+json">{}</script></head><body>Rowan Brad Quni-Gudzinas <a href="/work-with-me">w</a> <a href="https://ipatent.qnfo.org/">i</a><input type="email"></body></html>';
ok(L(full) === full, "a page with everything is returned unchanged (byte-identical)");
const partial = '<html><head><meta property="og:image" content="https://x/a.png"></head><body>by Rowan Brad Quni-Gudzinas</body></html>';
const po = L(partial);
ok(count(po, /og:image"/g) === 1 && po.includes("https://x/a.png"), "an existing og:image is kept, not duplicated");
ok(count(po, /Quni-Gudzinas/g) === 2 && !/By <a href="https:\/\/orcid/.test(po), "an existing author credit is not repeated in the strip (the second mention is the JSON-LD)");
const sm = '<html><head><meta name="twitter:card" content="summary"></head><body></body></html>';
ok(/content="summary_large_image"/.test(L(sm)) && count(L(sm), /twitter:card/g) === 1, "twitter:card summary upgraded in place when the share image is added");
ok(L(bare, "https://example.com/") === bare && L(bare, "https://legal.qnfo.org/") === bare, "non-owned hosts are untouched");
ok(L("not html", "https://qnfo.org/") === "not html" && L("<head></head>", "https://qnfo.org/") === "<head></head>", "fragments without </head> and </body> are untouched");
ok(!/0000-0002-1825-0097/.test(src.slice(b, e)) && count(src.slice(b, e), /\d{4}-\d{4}-\d{4}-\d{3}[\dX]/g) === 1, "the only ORCID in the layer is the owner's");

const wp = L(bare, "https://qnfo.org/work-with-me/");
ok(!/<form|<input/i.test(wp) && /data-reach-policy="no-form"/.test(wp) && /#subscribe">New papers by email/.test(wp), "work-with-me (RL_PLAIN): subscribe link, no form, policy declared");
ok(/ipatent\.qnfo\.org\/example/.test(wp) && !/patent/i.test(wp.replace(/<[^>]+>/g, " ")), "work-with-me: iPatent linked without the visible word 'patent'");
// withReachLayer: only 200 + text/html + GET on owned hosts
const mk = (body, ct, status) => new Response(body, { status: status || 200, headers: { "Content-Type": ct, "Content-Length": String(body.length) } });
let r = await ctx.withReachLayer(mk(bare, "text/html; charset=utf-8"), new Request("https://qnfo.org/x"));
ok(r.headers.get("X-Reach-Layer") === "applied" && !r.headers.get("Content-Length") && /og:image/.test(await r.text()), "HTML 200 on qnfo.org: applied, stale Content-Length dropped");
r = await ctx.withReachLayer(mk(full, "text/html"), new Request("https://qnfo.org/a"));
ok(r.headers.get("X-Reach-Layer") === "none" && (await r.text()) === full, "complete page: header none, body identical");
r = await ctx.withReachLayer(mk('{"a":1}', "application/json"), new Request("https://qnfo.org/api"));
ok(!r.headers.get("X-Reach-Layer") && (await r.text()) === '{"a":1}', "JSON passes through");
r = await ctx.withReachLayer(mk(bare, "text/html", 404), new Request("https://qnfo.org/nope"));
ok(!r.headers.get("X-Reach-Layer"), "non-200 passes through");
r = await ctx.withReachLayer(mk(bare, "text/html"), new Request("https://qnfo.org/x", { method: "POST", body: "" }));
ok(!r.headers.get("X-Reach-Layer"), "POST passes through");

// og image: a real 1200x630 JPEG
const img = ctx.reachOgImage();
const buf = new Uint8Array(await img.arrayBuffer());
ok(img.headers.get("Content-Type") === "image/jpeg" && buf[0] === 0xff && buf[1] === 0xd8 && buf.length > 20000 && buf.length < 200000, "og.jpg is a JPEG of plausible size", buf.length);
let wh = null;
for (let i = 2; i < buf.length - 9; ) {
  if (buf[i] !== 0xff) { i++; continue; }
  const m = buf[i + 1], len = (buf[i + 2] << 8) | buf[i + 3];
  if (m >= 0xc0 && m <= 0xc3) { wh = [(buf[i + 7] << 8) | buf[i + 8], (buf[i + 5] << 8) | buf[i + 6]]; break; }
  i += 2 + len;
}
ok(wh && wh[0] === 1200 && wh[1] === 630, "og.jpg is 1200x630", wh);

// ---- the real fetch handler, end to end ----
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const stmt = { bind() { return stmt; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { return {}; } };
const env = { LIVING_PAPER: { prepare: () => stmt }, DB: { prepare: () => stmt } };
const get = async (url) => { const res = await gw.fetch(new Request(url, { redirect: "manual" }), env); return { status: res.status, headers: res.headers, text: res.status === 200 && /image/.test(res.headers.get("Content-Type") || "") ? "" : await res.text() }; };

const og = await get("https://qnfo.org/og.jpg");
ok(og.status === 200 && og.headers.get("Content-Type") === "image/jpeg", "GET qnfo.org/og.jpg -> 200 image/jpeg", og.status);
ok((await get("https://papers.qnfo.org/og.jpg")).status === 200, "GET papers.qnfo.org/og.jpg -> 200");

// IDEA_CHECKS tests, copied from qnfo-fleet-control (REACH-IDEATION-1) so a drift there fails here too.
const fc = readFileSync(join(here, "..", "qnfo-fleet-control", "worker.js"), "utf8");
const checks = {};
for (const m of fc.matchAll(/\{ key: "([a-z-]+)",[^\n]*?test: (function\(h(?:, ms)?\) \{[^\n]*?\}),/g)) checks[m[1]] = vm.runInNewContext("(" + m[2] + ")", { IDEA_SLOW_MS: 2500 });
ok(["share-image", "canonical", "structured-data", "author-credit", "contact-path", "flagship-link", "subscribe-box"].every((k) => typeof checks[k] === "function"), "IDEA_CHECKS tests extracted from qnfo-fleet-control", Object.keys(checks));
for (const url of ["https://qnfo.org/", "https://qnfo.org/work-with-me", "https://papers.qnfo.org/", "https://papers.qnfo.org/papers"]) {
  const pg = await get(url);
  if (pg.status !== 200) { ok(false, url + " -> 200", pg.status); continue; }
  ok(pg.headers.get("X-Reach-Layer") === "applied" || pg.headers.get("X-Reach-Layer") === "none", url + " carries X-Reach-Layer", pg.headers.get("X-Reach-Layer"));
  for (const k of ["share-image", "canonical", "structured-data", "author-credit", "contact-path", "flagship-link", "subscribe-box"]) {
    if (!checks[k]) continue;
    ok(checks[k](pg.text, 0), url + " passes " + k);
  }
  ok(count(pg.text, /property=["']og:image["']/g) === 1, url + " has exactly one og:image", count(pg.text, /property=["']og:image["']/g));
  ok(count(pg.text, /rel=["']canonical["']/g) === 1, url + " has exactly one canonical");
}
const api = await get("https://qnfo.org/health");
ok(!api.headers.get("X-Reach-Layer"), "/health (JSON) is not touched");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
