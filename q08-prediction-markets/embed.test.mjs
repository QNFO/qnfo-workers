// Q08-EMBED-1 offline suite (#11874). 2 of 6 competitors offer an embeddable forecast widget and q08 did not; /embed/<slug> is that widget.
// Proves: the card shows the question, q08's number against the market and the settle state, links back to the full page in a new tab, and uses design tokens only;
// the snippet frames /embed/<slug>; the embedding site is read from the Referer (q08's own host and garbage are "direct"); each load adds one counted row per day,
// question and site; the competitor gap for embeds is closed; and the deployed block in worker.js exposes the names the /embed/ route calls.
// Run: node --no-warnings q08-prediction-markets/embed.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { renderEmbed, embedSnippet, embedHost, recordEmbedView, FEATURES, renderForecast } from "./forecast-engine.mjs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const head = (title, desc, css) => `<title>${title}</title><meta name="description" content="${desc}"><style>${css}</style>`;
const d = { slug: "fed-cut-december", title: "Will the Fed cut in December?", forecast: 0.62, crowd: 0.48, deadline: "2026-12-18", call: null };
const html = renderEmbed(d, head);
ok(html.includes("Will the Fed cut in December?") && html.includes("62%") && html.includes("48%"), "the card shows the question, q08's number and the market's", html.slice(0, 200));
ok(html.includes("Settles by 2026-12-18"), "an open question shows its settle date");
ok(html.includes('href="https://markets.q08.org/f/fed-cut-december"') && html.includes('<base target="_blank">'), "the card links to the full page and opens it outside the frame");
ok(!/#[0-9a-f]{3,6}\b/i.test(html.replace(/<title>[\s\S]*?<\/title>/, "")), "no raw hex colour: design tokens only");
const settled = renderEmbed({ ...d, call: { outcome: 1, right_side: true, beat_crowd: true, brier: 0.14, brier_crowd: 0.27 } }, head);
ok(/Settled: /.test(settled), "a settled question says so", settled.slice(0, 400));

const snip = embedSnippet(d.slug, d.title);
ok(snip.startsWith('<iframe src="https://markets.q08.org/embed/fed-cut-december"') && /title="Will the Fed cut in December\?"/.test(snip), "the snippet frames the embed route with a title", snip);
ok(/loading="lazy"/.test(snip), "the frame loads lazily");
const page = renderForecast({ ...d, position: null, entries: [{ at: "2026-11-01T00:00:00Z", hash: "abc" }], evidence: [], related_reports: [], related_markets: [], verdicts: [], resolution: { rule: "r" }, market_url: "https://x", moves: "m", proxy: null }, head);
ok(page.includes("Embed this forecast") && page.includes("/embed/fed-cut-december"), "each forecast page offers the snippet");

ok(embedHost("https://example.com/post/1") === "example.com", "the embedding site is the Referer host");
ok(embedHost("https://markets.q08.org/f/x") === "direct" && embedHost("") === "direct" && embedHost("not a url") === "direct", "q08's own host, no Referer and garbage count as direct");

const db = new DatabaseSync(":memory:");
const D1 = { prepare: (sql) => { let a = []; const st = { bind: (...b) => { a = b; return st; }, run: async () => db.prepare(sql).run(...a), first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
const t = Date.parse("2026-11-14T12:00:00Z");
ok(await recordEmbedView(D1, d.slug, "https://example.com/a", t), "a load is recorded");
await recordEmbedView(D1, d.slug, "https://example.com/b", t);
await recordEmbedView(D1, d.slug, "https://other.org/", t);
await recordEmbedView(D1, d.slug, "", t);
const rows = db.prepare("SELECT host, n FROM fe_embed_view ORDER BY host").all();
ok(JSON.stringify(rows.map((r) => [r.host, r.n])) === JSON.stringify([["direct", 1], ["example.com", 2], ["other.org", 1]]), "one row per day, question and site, counted", rows);
ok(await recordEmbedView(null, d.slug, "", t) === false, "no database: nothing recorded, no throw");

ok(FEATURES.find((f) => f.key === "embed").have === true, "the competitor gap for embeds is closed (FEATURES embed have: true)");

const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
ok(/return \{[^}]*\brenderEmbed\b[^}]*\brecordEmbedView\b/.test(worker), "the deployed FE block exposes renderEmbed and recordEmbedView");
ok(/p\.startsWith\("\/embed\/"\)/.test(worker) && /frame-ancestors \*/.test(worker), "worker.js serves /embed/ and allows framing");
ok(/async fetch\(req, env, ctx\)/.test(worker), "the fetch handler receives ctx for the counted view");
ok(worker === readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8"), "deployed-current.worker.js is identical to worker.js");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
