// GOOGLE-HUB-1 offline suite (agent_issues 1001659): gscOverviewData / gscHtml and the /search, /api/gsc/overview routes.
// A failed panel is null with its reason, never zero; the daily series has null for a missing day; the page renders without throwing.
// Run: node --no-warnings qnfo-fleet-dashboard/gsc-overview.test.mjs
import fs from "node:fs"; import assert from "node:assert";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const m = src.match(/var GSC_OVERVIEW_DAYS = 28;[\s\S]*?\n\}\n(?=function gscHtml)/);
assert(m, "overview block");
const h = src.match(/function gscHtml\(v, holder\) \{[\s\S]*?\n\}\n(?=\nasync function reachIngestTick)/);
assert(h, "html block");
const kfn = (n) => { const x = src.match(new RegExp("\\nfunction " + n + "\\([\\s\\S]*?\\n\\}\\n")); assert(x, n); return x[0]; };
const helpers = ["kpiFmt", "kpiU", "kpiV", "kpiSrc", "kpiNotes", "kpiTile", "kpiNiceMax", "kpiTable"].map(kfn).join("\n");
let fetchMode = "ok";
const calls = [];
const fetchMock = async (url, init) => {
  calls.push(String(url));
  if (/searchAnalytics\/query/.test(url)) {
    const b = JSON.parse(init.body);
    if (fetchMode === "queries403" && b.dimensions && b.dimensions[0] === "query") return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 });
    if (!b.dimensions) return new Response(JSON.stringify({ rows: [{ clicks: b.startDate < "2026-10-01" ? 5 : 10, impressions: 200, ctr: 0.05, position: 12.3 }] }), { status: 200 });
    if (b.dimensions[0] === "date") return new Response(JSON.stringify({ rows: [{ keys: ["2026-10-20"], clicks: 3, impressions: 90, ctr: 0.03, position: 11 }] }), { status: 200 });
    return new Response(JSON.stringify({ rows: [{ keys: ["x <b>"], clicks: 2, impressions: 40, ctr: 0.05, position: 8 }] }), { status: 200 });
  }
  if (/\/sitemaps$/.test(url)) return new Response(JSON.stringify({ sitemap: [{ path: "https://qnfo.org/sitemap.xml", lastDownloaded: "2026-10-30T00:00:00Z", errors: "0", warnings: "1" }] }), { status: 200 });
  if (/webmasters\/v3\/sites$/.test(url)) return new Response(JSON.stringify({ siteEntry: [{ siteUrl: "sc-domain:qnfo.org", permissionLevel: "siteFullUser" }] }), { status: 200 });
  throw new Error("unexpected " + url);
};
const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const factory = new Function("fetch", "esc", "AbortSignal", "ga4ParseKey", "ga4AccessToken", "d1all", "reachErr", "gscQuery", "GSC_SCOPE", "GSC_DEFAULT_SITE", "GSC_LAG_DAYS", "VERSION", "__name", "fleetHead", "fleetTop", "KPI_CSS", "FLEET_SHELL_JS", "kpiDualBars",
  helpers + "\n" + m[0] + "\n" + h[0] + "\nreturn { gscOverviewData, gscHtml, gscPlain };");
const gscQuery = async (token, site, body) => {
  const r = await fetchMock("https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(site) + "/searchAnalytics/query", { body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error("searchAnalytics " + r.status);
  return j;
};
const G = factory(fetchMock, esc, AbortSignal, () => ({ email: "x@y", pem: "", tokenUri: "" }), async () => "tok", async () => [], (e) => String(e && e.message || e), gscQuery, "scope", "sc-domain:qnfo.org", 3, "t", () => {},
  () => "<html>", () => "<header>", "", "", () => "<bars>");
const now = Date.parse("2026-11-01T12:00:00Z");
const v = await G.gscOverviewData({ AUDIT: {}, GA4_SA_KEY: "k" }, { nowMs: now });
assert.equal(v.range.end, "2026-10-29", "window ends three days ago");
assert.equal(v.range.days, 28);
assert.equal(v.totals.clicks, 10);
assert.equal(v.previous_totals.clicks, 5);
assert.equal(v.deltas.clicks, 1);
assert.equal(v.daily.length, 28);
assert.equal(v.daily.filter((d) => d.clicks === null).length, 27, "missing days are null, not zero");
assert.equal(v.permission, "siteFullUser");
assert.equal(v.sitemaps[0].warnings, 1);
assert.deepEqual(v.errors, []);
const html = G.gscHtml(v, false);
assert(html.includes("Search Console") && html.includes("x &lt;b&gt;"), "page renders and escapes keys");
assert(!html.includes("x <b>"));
assert(G.gscHtml(null, false).includes("never shown as a zero"));
// a failed panel is null with its reason
fetchMode = "queries403";
const v2 = await G.gscOverviewData({ AUDIT: {}, GA4_SA_KEY: "k" }, { nowMs: now + 4e5 });
assert.equal(v2.queries, null, "failed panel is null");
assert(v2.errors.some((e) => e.panel === "top queries"));
assert(G.gscHtml(v2, false).includes("not measured"));
// routes and registry are wired
assert(/path === "\/api\/gsc\/overview"/.test(src) && /path === "\/search"/.test(src), "routes");
assert(/href: "\/search", feed: "\/api\/gsc\/overview"/.test(src), "nav entry next to analytics");
console.log("ok");
