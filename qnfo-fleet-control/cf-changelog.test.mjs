/**
 * cf-changelog.test.mjs -- offline regression lock for CF-CHANGELOG-LOOP-1.
 * Slices the block out of worker.js and drives the pure half (parse, match, classify, schedule) with real items copied
 * from developers.cloudflare.com/changelog/rss/index.xml (cf-changelog.fixture.xml, fetched 2026-10-03).
 * Output MUST contain "0 failed" on success; charter-guard.yml greps for exactly that string.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- CF-CHANGELOG-LOOP-1:BEGIN";
const END = "// ---- CF-CHANGELOG-LOOP-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) { console.error("FAIL cf-changelog block markers missing"); console.log("1 failed"); process.exit(1); }
const sandbox = { charterRows: null, charterOne: null, timedFetch: null, VERSION: "test", console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, TextDecoder, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b + END.length) + "\n__export = { cfcParseItems, cfcMatch, cfcClassify, cfcNeedsRun, cfcDeadlineMs, cfcSlug, CFC_STALE_H, CFC_MAX_ITEMS };", sandbox, { filename: "cf-changelog-block.js" });
const C = sandbox.__export;

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (actual === expected) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }

const NOW = Date.parse("2026-10-03T09:00:00Z");
const xml = readFileSync(join(here, "cf-changelog.fixture.xml"), "utf8");
const items = C.cfcParseItems(xml, 100);
const by = (needle) => items.find((i) => i.title.includes(needle));

// the live catalog rows (qnfo-audit.cloudflare_capability_catalog, 2026-10-03) that these items touch
const catalog = [
  { slug: "managed-rag", product: "AI Search", status: "proposed" },
  { slug: "kv-config", product: "KV", status: "in_use" },
  { slug: "stateful-coordination", product: "Durable Objects", status: "in_use" },
  { slug: "ai-observability", product: "AI Gateway", status: "in_use" },
  { slug: "api-webhooks", product: "Workers", status: "in_use" },
  { slug: "mcp", product: "Workers + Agents SDK", status: "in_use" },
  { slug: "sandbox", product: "Sandbox SDK", status: "rejected" },
  { slug: "data-pipelines", product: "Pipelines, R2 Data Catalog, R2 SQL", status: "rejected" },
];
const ctx = { catalog, fleetText: "qnfo-ai-search ask.qwav.tech retrieval; qnfo-containers-pilot; qnfo-ipatent", nowMs: NOW };
const cls = (needle) => C.cfcClassify(by(needle), ctx);

// --- parsing
eq(items.length, 10, "ten fixture items parse");
eq(items[0].title, "AI Gateway, Web Search API - Introducing Web Search API", "first title decoded");
eq(items[0].products.join("|"), "AI Gateway|Web Search API", "categories become the product list");
eq(items[0].primary, "AI Gateway", "primary product of the first item");
eq(items[0].headline, "Introducing Web Search API", "headline is the part after the product prefix");
eq(new Date(items[0].pub_ms).toISOString(), "2026-10-02T13:00:00.000Z", "pubDate parsed");
eq(items[0].text.indexOf("<"), -1, "description html stripped");
eq(items[0].text.indexOf("&lt;"), -1, "description entities decoded");
eq(C.cfcParseItems(xml.slice(0, xml.indexOf("<item>") + 400), 10).length, 0, "an item cut off by the byte cap is dropped, never half-read");
eq(C.cfcParseItems("", 10).length, 0, "empty feed");
eq(C.cfcParseItems("<rss><item><title>x</title></item></rss>", 10).length, 0, "an item with neither guid nor link cannot be deduped and is skipped");
eq(C.cfcParseItems("<rss><item><title>x</title><link>https://e/x</link></item></rss>", 10).length, 1, "link stands in for a missing guid");

// --- date and slug helpers
eq(C.cfcDeadlineMs("usage-based billing begins on November 1, 2026."), Date.UTC(2026, 10, 1), "long month name");
eq(C.cfcDeadlineMs("billing on Oct 14, 2026 for all"), Date.UTC(2026, 9, 14), "short month name");
eq(C.cfcDeadlineMs("no date here"), null, "no date");
eq(C.cfcSlug("Web Search API"), "cfc-web-search-api", "slug");

// --- matching (whole name or one part of an A + B name; renames through the alias map)
eq(C.cfcMatch(["Workers"], catalog).slug, "api-webhooks", "Workers matches the plain Workers row, not 'Workers + Agents SDK' by prefix");
eq(C.cfcMatch(["Agents SDK"], catalog).status, "in_use", "a part of 'Workers + Agents SDK' matches");
eq(C.cfcMatch(["Basin Pipelines"], catalog).slug, "data-pipelines", "renamed product reaches the old catalog row");
eq(C.cfcMatch(["Sandboxes"], catalog).slug, "sandbox", "Sandboxes -> Sandbox SDK");
eq(C.cfcMatch(["Artifacts"], catalog), null, "unknown product has no match");
// the feed says "Agents" and "Access"; the catalog says "Agents SDK" and "Cloudflare Access (one-time PIN by email)"
const verbose = catalog.concat([{ slug: "agents", product: "Agents SDK", status: "in_use" }, { slug: "access-owner-control", product: "Cloudflare Access (one-time PIN by email)", status: "proposed" }, { slug: "managed-inference", product: "Workers AI", status: "in_use" }]);
eq(C.cfcMatch(["Agents"], verbose).slug, "agents", "short feed name matches a longer catalog name as whole words");
eq(C.cfcMatch(["Access"], verbose).slug, "access-owner-control", "Access matches 'Cloudflare Access (...)'");
eq(C.cfcMatch(["Workers"], verbose).slug, "api-webhooks", "an exact name beats a looser match on 'Workers AI'");
eq(C.cfcMatch(["Work"], verbose), null, "a partial word never matches");
eq(C.cfcMatch(["AI"], verbose), null, "names under 4 characters only match exactly");
eq(C.cfcMatch(["AI Search", "KV"], catalog).slug, "kv-config", "the strongest status wins among several products (in_use beats proposed)");
eq(C.cfcMatch(["Workers", "KV"], catalog).slug, "api-webhooks", "equal strength keeps the first product listed");

// --- classification of real items
const ais = cls("AI Search is generally available");
eq(ais.klass, "deadline", "AI Search GA with a billing start date is a deadline (the fleet runs qnfo-ai-search)");
eq(ais.deadline_ms, Date.UTC(2026, 10, 1), "AI Search billing starts 2026-11-01");
eq(ais.in_fleet, true, "service registry text shows the fleet uses it although the catalog says proposed");
eq(by("Artifacts is now in open beta").products.join("|"), "Artifacts|Workers", "Artifacts is also tagged Workers in the feed");
eq(by("Artifacts is now in open beta").primary, "Artifacts", "the <product> tag is the primary product");
eq(cls("Artifacts is now in open beta").klass, "new_product", "Artifacts: unknown to the catalog and the fleet, launched in open beta; the in-use Workers tag must not hide it");
eq(cls("Artifacts is now in open beta").match, null, "...and it has no catalog match");
eq(cls("Cloudflare Basin is now generally available").klass, "reopen", "Basin GA reopens the rejected Pipelines / R2 Data Catalog / R2 SQL row");
eq(cls("Cloudflare Basin is now generally available").match.slug, "data-pipelines", "...and names that row");
eq(cls("Sandbox SDK 1.0").klass, "reopen", "Sandbox SDK 1.0 reopens the rejected Sandbox SDK row");
eq(cls("Workers KV namespace jurisdictions").klass, "in_use_change", "KV is in use and the item has no deadline: recorded only");
eq(cls("Pending I/O operations").klass, "in_use_change", "a Durable Objects runtime change is recorded only");
eq(cls("Pay for AI inference with Machine Payments").klass, "in_use_change", "AI Gateway is in use");
eq(cls("WAF Release").klass, "noise", "WAF rule drops are noise");
eq(items[9].pub_ms < NOW - 45 * 86400000, true, "last fixture item is older than the window");
eq(C.cfcClassify(items[9], ctx).klass, "old", "stale news is never actioned");

// a billing change tagged with an in-use product but about another product is not a deadline for the in-use one
const tagged = { guid: "g3", title: "Spectrum, Workers - Spectrum billing", headline: "Spectrum billing", products: ["Spectrum", "Workers"], primary: "Spectrum", text: "Billing will begin on Nov 1, 2026.", pub_ms: NOW - 86400000 };
eq(C.cfcClassify(tagged, ctx).klass === "deadline", false, "an in-use secondary tag does not turn another product's billing change into a deadline");

// a deadline for a product the fleet does not use is not an issue
const phantom = { guid: "g", title: "Spectrum - Spectrum billing will begin Nov 1, 2026", headline: "Spectrum billing will begin Nov 1, 2026", products: ["Spectrum"], text: "Usage-based billing begins soon.", pub_ms: NOW - 86400000 };
eq(C.cfcClassify(phantom, ctx).klass === "deadline", false, "a billing change to a product the fleet and catalog do not use is not a deadline");
const used = { guid: "g2", title: "KV - KV pricing change", headline: "KV pricing change", products: ["KV"], text: "KV pricing changes on Dec 1, 2026.", pub_ms: NOW - 86400000 };
eq(C.cfcClassify(used, ctx).klass, "deadline", "a pricing change to an in-use product is a deadline");

// --- schedule
eq(C.cfcNeedsRun(null, NOW), "never ran", "no run yet");
eq(C.cfcNeedsRun({ ts: new Date(NOW - 3 * 3600000).toISOString() }, NOW), null, "3h old is fresh");
eq(C.cfcNeedsRun({ ts: new Date(NOW - 21 * 3600000).toISOString() }, NOW) !== null, true, "21h old is stale");
eq(C.cfcNeedsRun({ ts: "garbage" }, NOW), "unreadable last run", "unreadable timestamp re-runs");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
