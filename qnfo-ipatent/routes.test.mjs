// ROUTES-GUARD-1 (qnfo-ipatent 3.9.0): every public iPatent page answers 200, carries a canonical, and credits only the
// author's ORCID. Autonomous code tasks change this worker (REACH-IDEATION-1 -> code loop -> merge runner); on 2026-10-02 a
// code-agent draft replaced the /guide route and invented an author and ORCID. This suite fails CI on either, so such a
// change is never merged. Run: node qnfo-ipatent/routes.test.mjs   (prints "N passed, 0 failed")
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("./worker.js");
const W = mod.default;
let passed = 0, failed = 0;
const ok = (c, l) => { if (c) passed++; else { failed++; console.error("FAIL " + l); } };
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const env = { IPATENT_DB: { prepare: stmt } };
const ctx = { waitUntil() {} };
const get = async (p) => { const r = await W.fetch(new Request("https://ipatent.qnfo.org" + p, { headers: { "User-Agent": "routes-test" } }), env, ctx); return { status: r.status, ct: r.headers.get("content-type") || "", text: p === "/og.jpg" ? "" : await r.text() }; };
const AUTHOR_ORCID = "0009-0002-4317-5604";
const slugs = [...src.matchAll(/\{ slug: "([a-z0-9-]+)", title:/g)].map((m) => m[1]);
ok(slugs.length >= 4, "GUIDE_PAGES has at least the four guide pages (found " + slugs.length + ")");
// Every literal page route in the source counts too, so a hand-written route cannot escape the attribution checks.
const literal = [...src.matchAll(/path === "(\/(?:guide|example)[a-z0-9\/-]*?)\/?"/g)].map((m) => m[1]).filter((p) => !p.endsWith("/"));
const pages = [...new Set(["/", "/guide", "/example"].concat(slugs.map((s) => "/guide/" + s), literal))];
for (const p of pages) {
  const r = await get(p);
  ok(r.status === 200 && /text\/html/.test(r.ct), p + " answers 200 HTML (got " + r.status + ")");
  ok(/<link rel="canonical" href="https:\/\/ipatent\.qnfo\.org/.test(r.text), p + " has a canonical on ipatent.qnfo.org");
  const orcids = [...r.text.matchAll(/\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/g)].map((m) => m[0]);
  ok(orcids.every((o) => o === AUTHOR_ORCID), p + " credits no ORCID but the author's (found " + [...new Set(orcids)].join(",") + ")");
  ok(!/all rights reserved/i.test(r.text), p + " has no 'all rights reserved' (QNFO-ULA)");
}
for (const p of ["/guide"].concat(slugs.map((s) => "/guide/" + s))) {
  const r = await get(p);
  ok(r.text.includes(AUTHOR_ORCID) && r.text.includes("Rowan Brad Quni-Gudzinas"), p + " credits the author with ORCID");
}
for (const p of ["/sitemap.xml", "/robots.txt", "/llms.txt", "/og.jpg", "/health"]) ok((await get(p)).status === 200, p + " answers 200");
const sm = (await get("/sitemap.xml")).text;
for (const p of pages.filter((x) => x === "/" || x === "/guide" || x === "/example" || slugs.includes(x.slice(7)))) ok(sm.includes("https://ipatent.qnfo.org" + (p === "/" ? "/" : p) + "<"), "sitemap lists " + p);
ok((await get("/guide/no-such-page")).status === 404, "unknown guide page is 404, not the guide");
const ver = (src.match(/var VERSION = "([^"]+)"/) || [])[1];
ok(JSON.parse((await get("/health")).text).version === ver, "/health reports the VERSION constant");
console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
