// CRAWL-HEALTH-1 offline suite: the Googlebot evaluator over httpRequestsAdaptiveGroups rows.
// Run: node qnfo-fleet-control/crawl-health.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var CRAWL_ZONE"), b = src.indexOf("async function crawlHealthTick");
const ctx = vm.createContext({ String, Number, Math, JSON }); vm.runInContext(src.slice(a, b) + "\nthis.e = crawlHealthEval;", ctx);
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + " :: " + JSON.stringify(x)); } };
const G = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const row = (h, p, st, n, ua) => ({ count: n, dimensions: { clientRequestHTTPHost: h, clientRequestPath: p, edgeResponseStatus: st, userAgent: ua || G } });
// 2026-10-06 09:53Z: real Googlebot fetched all three sitemaps with 200 while Search Console still said "Couldn't fetch".
let r = ctx.e([row("qnfo.org", "/sitemap.xml", 200, 1), row("papers.qnfo.org", "/sitemap.xml", 200, 1), row("ipatent.qnfo.org", "/sitemap.xml", 200, 1), row("papers.qnfo.org", "/papers/x", 200, 40), row("papers.qnfo.org", "/papers/gone", 404, 3), row("papers.qnfo.org", "/sitemap.xml", 200, 5, "AhrefsBot")]);
ok(r.sitemapsOk === 1 && r.missing.length === 0 && r.failures.length === 0 && r.total === 46 && r.errPct === 0, "all sitemaps 200: ok; a 404 page is not a crawler failure; other bots ignored", r);
r = ctx.e([row("qnfo.org", "/sitemap.xml", 200, 1), row("papers.qnfo.org", "/sitemap.xml", 200, 1)]);
ok(r.sitemapsOk === 0 && r.missing.length === 1 && r.missing[0] === "ipatent.qnfo.org/sitemap.xml", "a sitemap Googlebot never fetched is reported", r);
r = ctx.e([row("qnfo.org", "/sitemap.xml", 200, 1), row("papers.qnfo.org", "/sitemap.xml", 200, 1), row("ipatent.qnfo.org", "/sitemap.xml", 200, 1), row("ipatent.qnfo.org", "/sitemap.xml", 503, 1), row("qnfo.org", "/robots.txt", 403, 2), row("papers.qnfo.org", "/papers/y", 500, 2)]);
ok(r.sitemapsOk === 0 && r.failures.length === 3 && r.errPct > 0, "a 503 on a sitemap, a 403 on robots and a 500 page are failures", r);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
