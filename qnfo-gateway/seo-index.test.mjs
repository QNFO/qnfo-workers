// SEO-INDEX-1 (qnfo-gateway 3.30.0): regression suite for the crawl/discovery path.
// Run: node qnfo-gateway/seo-index.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(x).slice(0, 300) : "")); } };
const slice = (a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i + 1); return i < 0 || j < 0 ? "" : src.slice(i, j); };

ok(src.includes('var VERSION="3.30.2-seo-index-3"'), "version is 3.30.2-seo-index-3");

// (a) IndexNow reaches every engine: the loop must not stop at the first acceptance.
const idx = slice("async function indexNowSubmit", "__name(indexNowSubmit");
ok(idx.includes("for (let e = 0; e < _EPS.length; e++)"), "indexnow iterates every endpoint");
ok(!idx.includes("_EPS.length && !hit"), "indexnow no longer stops at the first accepting endpoint");
ok(idx.includes("eps.push") && idx.includes("eps: eps"), "indexnow records each engine answer");
ok(idx.includes("error: errText"), "indexnow records the real failure per engine");
ok(src.indexOf("/api/indexnow/urls") > 0, "public URL list for the off-Worker fallback");
ok(src.includes("async function seoPublishMetrics"), "metrics are republished from source");
ok(src.includes("await seoPublishMetrics(env)"), "the cron calls the publisher");

// (b) crawl telemetry exists and is wired into the request path.
ok(src.includes("CREATE TABLE IF NOT EXISTS seo_crawl_log"), "seo_crawl_log table");
ok(src.includes("seoCrawlRow(request, served && served.status)"), "fetch records crawler requests with served status");
ok(src.includes('"/api/seo/crawl"'), "crawl stats endpoint routed");
ok(src.includes('"/api/seo/audit"'), "seo audit endpoint routed");

// (c) the audit answers the owner question with numbers, not a vibe.
for (const k of ["googlebot_crawling", "bingbot_crawling", "ai_crawler_reaching", "sitemap_covers_corpus", "indexnow_multi_engine"]) {
  ok(src.includes("out.checks." + k), "audit check " + k);
}

// (d) sitemap freshness is the real change date, not the publication date.
const sm = slice("async function handleSitemap", "__name(handleSitemap");
ok(sm.includes("updated_at, version FROM papers"), "sitemap reads updated_at");
ok(sm.includes("lastmod: smLastmod(p)"), "sitemap lastmod uses the shared helper");
ok(!sm.includes("lastmod: p.created_at ?"), "sitemap no longer advertises created_at as lastmod");
ok(sm.includes('"/papers/tags"'), "tag catalogue listed in the papers sitemap");

// (e) one address per paper.
ok(src.includes("status: 308"), "trailing-slash paper URL 308s to the canonical slug");
ok(src.includes("replace(/\\/+$/, \"\") + (u.search"), "the 308 target drops the trailing slash and keeps the query");

// (f) Markdown mirror for agent ingestion.
ok(src.includes("handlePaperMarkdown") && src.includes("text/markdown; charset=utf-8"), "paper markdown endpoint");
ok(src.includes('type="text/markdown" href="'), "paper page advertises the markdown mirror");
ok(src.includes('rel=\\"canonical\\"'), "markdown response carries a canonical Link header");

// (g) robots names the crawlers instead of relying on the wildcard.
for (const ua of ["Googlebot", "Google-Extended", "Bingbot", "GPTBot", "OAI-SearchBot", "PerplexityBot", "ClaudeBot", "Applebot", "CCBot", "Amazonbot"]) {
  ok(src.includes("User-agent: " + ua), "robots names " + ua);
}

// (h) llms.txt: one Papers heading, whole corpus.
const llms = slice("async function handleLlmsTxt", "__name(handleLlmsTxt");
ok(llms.indexOf('## Papers') === llms.lastIndexOf('## Papers'), "exactly one Papers heading in llms.txt");
ok(llms.includes("LIMIT 800"), "llms.txt covers the whole corpus");
ok(llms.includes(".md"), "llms.txt points at the markdown mirror");

// (i) dead-DOI policy is unchanged on purpose.
ok(src.includes("!/^10\\.5281\\//"), "lpDoi still drops the retired deposit prefix (all 575 recorded DOIs are 410 tombstones)");

// (j) JSON-LD states freshness and containment.
ok(src.includes("dateModified:"), "JSON-LD dateModified");
ok(src.includes('isPartOf: { "@type": "WebSite"'), "JSON-LD isPartOf");

// (k) weekly full submission, not only the 7-day window.
ok(src.includes("weekly full submit"), "weekly full IndexNow pass");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);