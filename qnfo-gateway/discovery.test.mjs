// DISCOVERY-1 offline suite (qnfo-gateway 3.10.1): qnfo.org robots.txt lists its own sitemap and the papers sitemap, qnfo.org
// serves the IndexNow key, submissions carry the host they are for, and every cron submission is logged.
// Run: node qnfo-gateway/discovery.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const key = (src.match(/var INDEXNOW_KEY="([0-9a-f]+)"/) || [])[1];
const logs = [], posts = [];
const stmt = (sql) => { const st = { a: [], bind(...a) { st.a = a; return st; }, async all() { return { results: [{ slug: "a-paper", created_at: "2026-10-05" }] }; }, async first() { return null; }, async run() { if (/INSERT INTO indexnow_log/.test(sql)) logs.push(st.a); return {}; } }; return st; };
const env = { LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt }, QNFO_BUCKET: { get: async () => null } };
globalThis.fetch = async (url, init) => { if (/indexnow/.test(String(url))) { posts.push({ url: String(url), body: JSON.parse(init.body) }); return new Response("", { status: 202 }); } return new Response("", { status: 404 }); };
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const get = async (u) => { const r = await gw.fetch(new Request(u), env, { waitUntil() {} }); return { s: r.status, t: await r.text() }; };
const rb = await get("https://qnfo.org/robots.txt");
ok(rb.s === 200 && /Sitemap: https:\/\/qnfo\.org\/sitemap\.xml/.test(rb.t) && /Sitemap: https:\/\/papers\.qnfo\.org\/sitemap\.xml/.test(rb.t), "qnfo.org robots lists both sitemaps", rb.t);
const kf = await get("https://qnfo.org/" + key + ".txt");
ok(key && kf.s === 200 && kf.t === key, "qnfo.org serves the IndexNow key");
ok((await get("https://papers.qnfo.org/" + key + ".txt")).s === 200, "papers.qnfo.org still serves it");
// SEO-HYGIENE-1: www 301, legal robots/sitemap real, legal unknown path 404.
{ const w1 = await gw.fetch(new Request("https://www.qnfo.org/about?x=1", { redirect: "manual" }), env, { waitUntil() {} });
  ok(w1.status === 301 && w1.headers.get("Location") === "https://qnfo.org/about?x=1", "www.qnfo.org 301 to qnfo.org with path and query", w1.status);
  const lr = await get("https://legal.qnfo.org/robots.txt"); ok(lr.s === 200 && /^User-agent: \*/.test(lr.t) && /legal\.qnfo\.org\/sitemap\.xml/.test(lr.t), "legal robots.txt is text with its sitemap");
  const ls = await get("https://legal.qnfo.org/sitemap.xml"); ok(ls.s === 200 && (ls.t.match(/<loc>/g) || []).length === 2, "legal sitemap lists the license and privacy pages");
  ok((await get("https://legal.qnfo.org/zz-nope")).s === 404, "legal unknown path 404");
  ok((await get("https://legal.qnfo.org/plain")).s === 200, "legal /plain still served"); }
const RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ["2026-10-05T06:00:00Z"])); } static now() { return new RealDate("2026-10-05T06:00:00Z").getTime(); } };
await gw.scheduled({ cron: "0 6 * * *" }, env, { waitUntil() {} }).catch(() => {});
globalThis.Date = RealDate;
const hosts = posts.map((p) => p.body.host);
ok(hosts.some((h) => h === "papers.qnfo.org") && hosts.some((h) => h === "qnfo.org"), "Monday cron submits papers and qnfo.org core pages", hosts);
ok(posts.every((p) => p.body.keyLocation === "https://" + p.body.host + "/" + key + ".txt"), "each submission's keyLocation is on its own host");
ok(posts.filter((p) => p.body.host === "qnfo.org").every((p) => p.body.urlList.every((u) => u.startsWith("https://qnfo.org/"))), "qnfo.org submission lists only qnfo.org URLs");
ok(logs.length >= 2 && logs.some((l) => l[0] === "qnfo.org" && l[2] === 4), "each submission is logged with accepted counts", logs.map((l) => l.slice(0, 3)));
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
