// Q08-ARXIV-POOL-1 (0.37.2, agent_issues 100439 and 100453): the arXiv scrape reads ops_config q08_arxiv_pool newest submissions (30 to 200,
// absent = 100) instead of a fixed 30, and the dead structuralPreflight (never called) is gone. Output MUST contain "0 failed".
//   node q08-signal-engine/arxiv-pool.test.mjs
import { readFileSync } from "node:fs";
const G = (await import("./worker.js")).__gen;
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

// parseArxivPool: integers 30..200, anything else is the default (100)
check("the default pool is 100", G.ARXIV_POOL_DEFAULT === 100, G.ARXIV_POOL_DEFAULT);
check("absent, empty and null read as the default", G.parseArxivPool(undefined) === 100 && G.parseArxivPool(null) === 100 && G.parseArxivPool("") === 100 && G.parseArxivPool("   ") === 100);
check("30 restores the earlier pool", G.parseArxivPool("30") === 30 && G.parseArxivPool(30) === 30);
check("a value below 30 is clamped up, above 200 clamped down", G.parseArxivPool("5") === 30 && G.parseArxivPool("0") === 30 && G.parseArxivPool("500") === 200 && G.parseArxivPool("9999") === 200);
check("an in-range integer is used as written", G.parseArxivPool("150") === 150 && G.parseArxivPool(" 64 ") === 64);
check("a non-integer or unusable value reads as the default", G.parseArxivPool("12.5") === 100 && G.parseArxivPool("-5") === 100 && G.parseArxivPool("abc") === 100 && G.parseArxivPool("1e2") === 100 && G.parseArxivPool("10000") === 100);

// arxivPoolSize: one read, cached for a minute, fail-safe
const mkEnv = (value, opts) => {
  const calls = { n: 0, sql: [], key: [] };
  const env = { AUDIT: { prepare: (sql) => ({ bind: (k) => ({ first: async () => { calls.n++; calls.sql.push(sql); calls.key.push(k); if (opts && opts.fail) throw new Error("d1 down"); return value === undefined ? null : { value }; } }) }) } };
  return { env, calls };
};
{
  G.resetArxivPool();
  const { env, calls } = mkEnv("60");
  check("the configured pool is read from ops_config", (await G.arxivPoolSize(env)) === 60 && /ops_config/.test(calls.sql[0]) && calls.key[0] === "q08_arxiv_pool", calls);
  await G.arxivPoolSize(env); await G.arxivPoolSize(env);
  check("a second and third call inside a minute do not read again", calls.n === 1, calls);
}
{
  G.resetArxivPool();
  const { env } = mkEnv(undefined);
  check("no row reads as the default", (await G.arxivPoolSize(env)) === 100);
}
{
  G.resetArxivPool();
  const { env } = mkEnv("30");
  check("a row of 30 gives the earlier pool back", (await G.arxivPoolSize(env)) === 30);
}
{
  G.resetArxivPool();
  const { env } = mkEnv("nonsense");
  check("an invalid row reads as the default", (await G.arxivPoolSize(env)) === 100);
}
{
  G.resetArxivPool();
  const { env } = mkEnv("60", { fail: true });
  const origErr = console.error; console.error = () => {};
  const n = await G.arxivPoolSize(env);
  console.error = origErr;
  check("an unreadable ops_config reads as the default and never throws", n === 100, n);
}
{
  G.resetArxivPool();
  check("no AUDIT binding reads as the default", (await G.arxivPoolSize({})) === 100 && (await G.arxivPoolSize(undefined)) === 100);
}

// scrapeArxiv: the request carries the pool size; the keyword filter, the order and the 12 kept are unchanged
const entry = (i, title, abs) => "<entry><id>http://arxiv.org/abs/2610." + String(30000 + i) + "v1</id><published>2026-10-26T10:" + String(10 + (i % 50)).padStart(2, "0") + ":00Z</published><title>" + title + "</title><summary>" + abs + "</summary></entry>";
const feed = (n) => { let x = "<feed>"; for (let i = 0; i < n; i++) x += entry(i, "Paper " + i, i % 3 === 0 ? "A note on security and privacy and protocol design for network architecture." : i % 3 === 1 ? "A study of fault tolerance and consensus." : "A paper about flowers."); return x + "</feed>"; };
const realFetch = globalThis.fetch;
const seen = [];
globalThis.fetch = async (url) => { seen.push(String(url)); return { ok: true, status: 200, text: async () => feed(40) }; };
try {
  G.resetArxivPool();
  const a = await G.scrapeArxiv(mkEnv("100").env);
  check("the request asks for the configured pool (100)", /[?&]max_results=100(?:&|$)/.test(seen[0]), seen[0]);
  check("the request still sorts by submission date, newest first", /sortBy=submittedDate/.test(seen[0]) && /sortOrder=descending/.test(seen[0]), seen[0]);
  check("at most 12 candidates are kept, all with a keyword hit", a.length === 12 && a.every((c) => c.source === "arxiv" && c.points >= 1 && /^2610\./.test(c.id)), a.length);
  check("the candidates are ordered by keyword hits, highest first", a.every((c, i) => i === 0 || a[i - 1].volatility_score >= c.volatility_score), a.map((c) => c.volatility_score));
  check("papers with no keyword hit are dropped", !a.some((c) => /^Paper (2|5|8|11)$/.test(c.title)), a.map((c) => c.title));
  G.resetArxivPool();
  await G.scrapeArxiv(mkEnv("30").env);
  check("a row of 30 asks for 30 submissions again", /[?&]max_results=30(?:&|$)/.test(seen[1]), seen[1]);
  G.resetArxivPool();
  await G.scrapeArxiv({});
  check("with no binding the request asks for the default pool", /[?&]max_results=100(?:&|$)/.test(seen[2]), seen[2]);
} finally { globalThis.fetch = realFetch; }

// the dead preflight is gone, the real pre-compose source checks are still in generate()
check("structuralPreflight is removed from the worker", !/structuralPreflight\s*\(/.test(src.replace(/\/\/[^\n]*/g, "")), "still present");
check("the pre-compose source checks (MIN_GROUND_CHARS, THIN_MIN_ARTICLE, learnedSourceFloor) are untouched", /var MIN_GROUND_CHARS = 2200/.test(src) && /var THIN_MIN_ARTICLE = 600/.test(src) && /thinSourceVerdict\(bestThin/.test(src));
check("generate() passes env to the arXiv scrape", /await scrapeArxiv\(env\)/.test(src));
{
  // the new block (the removal note and the pool reader) is ASCII (Q08-ASCII-SOURCE-1: typographic characters are \u escapes)
  const a = src.indexOf("// Q08-ARXIV-POOL-1 (0.37.2, 2026-10-26; agent_issues"), b = src.indexOf("// r: { scraped, scored, published, top, model, ms, status, error, sourceChars, sourceKind }");
  const c = src.indexOf("// Q08-ARXIV-POOL-1 (0.37.2): how many of the newest submissions"), d = src.indexOf("async function extractGitHubFriction");
  check("the removal note and the pool reader are ASCII-only", a > 0 && b > a && c > 0 && d > c && !/[^\x00-\x7f]/.test(src.slice(a, b)) && !/[^\x00-\x7f]/.test(src.slice(c, d)));
}

console.log("arxiv-pool.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
