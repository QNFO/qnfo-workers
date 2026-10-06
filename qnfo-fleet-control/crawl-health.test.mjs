// CRAWL-HEALTH-1 offline suite: the Googlebot evaluator over httpRequestsAdaptiveGroups rows.
// Run: node qnfo-fleet-control/crawl-health.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var CRAWL_ZONE"), b = src.indexOf("async function crawlHealthTick");
const ctx = vm.createContext({ String, Number, Math, JSON, BigInt, Array, parseInt }); vm.runInContext(src.slice(a, b) + "\nthis.e = crawlHealthEval;", ctx);
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + " :: " + JSON.stringify(x)); } };
const G = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const row = (h, p, st, n, ua, ip) => ({ count: n, dimensions: { clientRequestHTTPHost: h, clientRequestPath: p, edgeResponseStatus: st, userAgent: ua || G, clientIP: ip || "66.249.66.1" } });
// 2026-10-06 09:53Z: real Googlebot fetched all three sitemaps with 200 while Search Console still said "Couldn't fetch".
let r = ctx.e([row("qnfo.org", "/sitemap.xml", 200, 1), row("papers.qnfo.org", "/sitemap.xml", 200, 1), row("ipatent.qnfo.org", "/sitemap.xml", 200, 1), row("q08.org", "/sitemap.xml", 200, 1), row("papers.qnfo.org", "/papers/x", 200, 40), row("papers.qnfo.org", "/papers/gone", 404, 3), row("papers.qnfo.org", "/sitemap.xml", 200, 5, "AhrefsBot")]);
ok(r.sitemapsOk === 1 && r.missing.length === 0 && r.failures.length === 0 && r.total === 47 && r.errPct === 0, "all sitemaps 200: ok; a 404 page is not a crawler failure; other bots ignored", r);
r = ctx.e([row("qnfo.org", "/sitemap.xml", 200, 1), row("papers.qnfo.org", "/sitemap.xml", 200, 1)]);
ok(r.sitemapsOk === 0 && r.missing.length === 2 && r.missing.some((m) => m === "ipatent.qnfo.org/sitemap.xml") && r.missing.some((m) => m === "q08.org/sitemap.xml"), "sitemaps Googlebot never fetched are reported (q08.org included)", r);
r = ctx.e([row("qnfo.org", "/sitemap.xml", 200, 1), row("papers.qnfo.org", "/sitemap.xml", 200, 1), row("ipatent.qnfo.org", "/sitemap.xml", 200, 1), row("q08.org", "/sitemap.xml", 200, 1), row("ipatent.qnfo.org", "/sitemap.xml", 503, 1), row("qnfo.org", "/robots.txt", 503, 2), row("papers.qnfo.org", "/papers/y", 500, 2)]);
ok(r.sitemapsOk === 0 && r.failures.length === 3 && r.errPct > 0, "a 503 on a sitemap, a 503 on robots and a 500 page are failures", r);
// CRAWL-VERIFIED-GOOGLEBOT-1: the 2026-10-06 scans from 35.221.245.4 with a Googlebot user agent are not Googlebot.
const ranges = ["66.249.64.0/27", "66.249.66.0/27", "2001:4860:4801:10::/64"];
const base = [row("qnfo.org", "/sitemap.xml", 200, 1), row("papers.qnfo.org", "/sitemap.xml", 200, 1), row("ipatent.qnfo.org", "/sitemap.xml", 200, 1), row("q08.org", "/sitemap.xml", 200, 1)];
r = ctx.e(base.concat([row("qnfo.org", "/functionRouter", 404, 24, G, "35.221.245.4"), row("analytics.qnfo.org", "//.env", 522, 18, G, "35.221.245.4"), row("papers.qnfo.org", "/papers/z", 200, 3, G, "2001:4860:4801:10::2a")]), ranges);
ok(r.spoofed === 42 && r.total === 7 && r.errPct === 0 && r.failures.length === 0 && r.sitemapsOk === 1 && r.spoofedTop[0] === "qnfo.org/functionRouter", "spoofed Googlebot (Google Cloud scanner) is reported, not counted; IPv6 Googlebot counts", r);
r = ctx.e(base.concat([row("analytics.qnfo.org", "/robots.txt", 522, 2, G, "66.249.66.5"), row("ideas.qnfo.org", "/robots.txt", 404, 3), row("personal.qnfo.org", "/sitemap.xml", 404, 2)]), ranges);
ok(r.failures.length === 1 && r.failures[0].url === "analytics.qnfo.org/robots.txt", "real Googlebot 522 is a failure; robots 404 and an unsubmitted sitemap 404 are not", r.failures);
const src2 = src.slice(src.indexOf("var GOOGLEBOT_RANGES_URL"), src.indexOf("function crawlHealthEval"));
const c2 = vm.createContext({ String, Number, BigInt, Array, parseInt }); vm.runInContext(src2 + "\nthis.inC = ipInCidr; this.real = isRealGooglebot;", c2);
ok(c2.inC("66.249.79.1", "66.249.64.0/19") && !c2.inC("66.249.96.1", "66.249.64.0/19") && c2.inC("2001:4860:4801:1a::5", "2001:4860:4801:1a::/64") && !c2.inC("2001:4860:4801:1b::5", "2001:4860:4801:1a::/64") && !c2.inC("66.249.79.1", "2001:4860:4801::/48") && !c2.inC("bad", "66.249.64.0/19"), "CIDR matching for IPv4 and IPv6");
ok(c2.real("66.249.70.10", null) && !c2.real("35.221.245.4", null), "fallback ranges when googlebot.json cannot be read");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
