// Q08-SITEMAP-INDEXABLE-1 offline suite (q08-signal-engine 0.8.8): the real fetch handler over in-memory SQLite.
// /sitemap.xml is valid sitemap XML with the canonical home URL (trailing slash), one <loc> per published piece with a
// valid <lastmod>, no feed, slugs escaped; robots.txt advertises it; www.q08.org pages 301 to q08.org (API routes stay).
// Run: node q08-signal-engine/sitemap.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const w = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href)).default;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT, published_at TEXT, reads INTEGER DEFAULT 0);
INSERT INTO published_pieces (slug, title, published_at) VALUES ('2026-10-05-a-b', 'A', '2026-10-05T07:00:00Z'), ('2026-10-04-c&d', 'C', '2026-10-04T07:00:00Z'), ('no-date', 'N', NULL);`);
const D1 = { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { try { db.prepare(sql).run(...a); } catch (e) {} return {}; } }; return st; } };
const env = { DB: D1 };
const ctx = { waitUntil() {} };
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const r = await w.fetch(new Request("https://q08.org/sitemap.xml"), env, ctx);
const x = await r.text();
ok(r.status === 200 && /application\/xml/.test(r.headers.get("Content-Type")), "sitemap 200 application/xml");
ok(x.startsWith('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">') && x.endsWith("</urlset>"), "sitemap envelope");
ok(/<url><loc>https:\/\/q08\.org\/<\/loc><lastmod>2026-10-05<\/lastmod><\/url>/.test(x), "home loc has the canonical trailing slash and the newest date", x.slice(0, 300));
ok(!/feed\.xml/.test(x), "the RSS feed is not listed");
ok((x.match(/<loc>https:\/\/q08\.org\/p\//g) || []).length === 3, "one loc per published piece");
ok(/<loc>https:\/\/q08\.org\/p\/2026-10-04-c%26d<\/loc><lastmod>2026-10-04<\/lastmod>/.test(x), "slug URL-encoded, date kept");
ok(/<loc>https:\/\/q08\.org\/p\/no-date<\/loc><\/url>/.test(x) && !/<lastmod><\/lastmod>/.test(x), "a piece without a date gets no empty lastmod");
ok(!/&(?!amp;|lt;|gt;)/.test(x), "no bare ampersand in the XML");
const rb = await (await w.fetch(new Request("https://q08.org/robots.txt"), env, ctx)).text();
ok(/Sitemap: https:\/\/q08\.org\/sitemap\.xml/.test(rb), "robots.txt advertises the sitemap");
const ww = await w.fetch(new Request("https://www.q08.org/p/2026-10-05-a-b?x=1"), env, ctx);
ok(ww.status === 301 && ww.headers.get("Location") === "https://q08.org/p/2026-10-05-a-b?x=1", "www page 301 to the canonical host", [ww.status, ww.headers.get("Location")]);
const ws = await w.fetch(new Request("https://www.q08.org/sitemap.xml"), env, ctx);
ok(ws.status === 301 && ws.headers.get("Location") === "https://q08.org/sitemap.xml", "www sitemap 301 to the canonical host");
const wa = await w.fetch(new Request("https://www.q08.org/api/metrics"), env, ctx).catch((e) => ({ status: -1 }));
ok(wa.status !== 301, "www API routes are not redirected");
// soft-404 fix: unknown paths are a real 404 with noindex; the index is still served at / and /index.html.
for (const p of ["/.ssh/id_ed25519", "/config/application.properties", "/.env", "/no-such-page"]) {
  const r404 = await w.fetch(new Request("https://q08.org" + p), env, ctx);
  const t404 = await r404.text();
  ok(r404.status === 404 && /noindex/.test(t404) && /Go to q08/.test(t404), p + " -> 404 noindex", r404.status);
}
const home = await w.fetch(new Request("https://q08.org/"), env, ctx);
ok(home.status === 200, "/ still serves the index", home.status);
ok((await w.fetch(new Request("https://q08.org/index.html"), env, ctx)).status === 200, "/index.html still serves the index");
ok((await w.fetch(new Request("https://q08.org/p/2026-10-05-a-b"), env, ctx)).status === 200, "a piece still serves 200");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
