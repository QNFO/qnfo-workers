// IPATENT-USAGE-1 offline test: searches are counted per day by broad topic only, bots are not counted, the query text is
// never stored, and /api/metrics serves the totals.
// Run: node qnfo-ipatent/usage.test.mjs
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const db = new DatabaseSync(":memory:");
const prep = (sql) => { let a = []; const q = { bind(...x) { a = x; return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { db.prepare(sql).run(...a); return { success: true }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
const env = { IPATENT_DB: { prepare: prep }, DISCLOSURES_VZ: { query: async () => ({ matches: [] }) }, AI: { run: async () => ({ data: [[0, 0, 0]] }) } };
const waits = [];
const ctx = { waitUntil(p) { waits.push(p); } };
const UA = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const search = (q, ua) => worker.fetch(new Request("https://ipatent.qnfo.org/api/search?q=" + encodeURIComponent(q), { headers: { "User-Agent": ua } }), env, ctx);
const SECRET = "my secret qubit braid anyon ledger invention 7731";
await search(SECRET, UA);
await search("a resonant harmonic oscillator for rf filtering", UA);
await search("a better kitchen drawer hinge", UA);
await search("quantum qubit thing", "Googlebot/2.1 (+http://www.google.com/bot.html)");
await Promise.all(waits.splice(0));
const rows = db.prepare("SELECT kind, field, n FROM usage_counts ORDER BY field").all();
const dump = JSON.stringify(db.prepare("SELECT * FROM usage_counts").all());
ok(rows.length === 3 && rows.every((r) => r.kind === "search" && r.n === 1), "3 human searches counted, the crawler is not", rows);
ok(rows.some((r) => r.field === "Quantum Computing & Information") && rows.some((r) => r.field === "Resonant / Analog Signal Processing") && rows.some((r) => r.field === "Other"), "each search is counted under one broad topic", rows);
ok(!/secret|7731|ledger|drawer|hinge/i.test(dump), "no query text is stored anywhere in the counter", dump);
const tabs = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
ok(!tabs.some((t) => t !== "usage_counts" && t !== "page_views" && t !== "rate_limits" && JSON.stringify(db.prepare("SELECT * FROM " + t).all()).indexOf("7731") >= 0), "no other table received the query either", tabs);
const m = await (await worker.fetch(new Request("https://ipatent.qnfo.org/api/metrics"), env, ctx)).json();
ok(m.windows["7d"].usage.searches === 3 && m.windows["30d"].usage.searches_by_topic.Other === 1, "/api/metrics serves the totals by topic", m.windows["7d"].usage);
const h = await (await worker.fetch(new Request("https://ipatent.qnfo.org/health"), env, ctx)).json();
ok(h.capabilities.includes("usage-topics") && h.limitations.some((l) => /never stored/.test(l)), "/health states the counter and that text is never stored", h.limitations);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
