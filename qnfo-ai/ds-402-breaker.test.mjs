// DEEPSEEK-402-BREAKER-1 (#1939) offline suite for qnfo-ai callDeepSeek. Run: node qnfo-ai/ds-402-breaker.test.mjs
// A direct DeepSeek 402 (balance exhausted) opens a 60-min per-isolate breaker: later calls fail fast with the same
// "deepseek 402" error (no fetch, no spend-guard read) so the caller's free fallback runs at once; after the window the
// paid path is probed again; other statuses and successes never open it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.log("FAIL " + m); } }

const src = readFileSync(join(here, "worker.js"), "utf8");
const start = src.indexOf("var DS_402_BREAKER_MS = ");
const end = src.indexOf('__name(callDeepSeek, "callDeepSeek");', start);
ok(start > 0 && end > start, "breaker and callDeepSeek found in worker.js");
const body = src.slice(start, end);

function load(fetchStatus) {
  const seen = { fetches: 0, guards: 0 };
  const fetchImpl = async () => { seen.fetches++; return new Response(fetchStatus === 200 ? JSON.stringify({ choices: [{ message: { content: "paid" } }], usage: {} }) : JSON.stringify({ error: { message: "Insufficient Balance" } }), { status: fetchStatus }); };
  const make = new Function("fetch", "spendGuardPaid", "clampTokens", "MAX_OUT", "DEFAULT_MAX_OUT", "isOAIUpstream", "spendMeterStream", "spendUsageOf", "spendInEstimate", "spendOutEstimate", "spendRecord", "DEEPSEEK_URL",
    body + "\nreturn callDeepSeek;");
  const fn = make(fetchImpl, async () => { seen.guards++; }, (n) => n, {}, 8192, () => false, (e, r) => r, () => ({ in: 0, out: 0 }), () => 0, () => 0, () => {}, "https://api.deepseek.com/v1/chat/completions");
  return { fn, seen, set status(s) { fetchStatus = s; } };
}
const MSG = [{ role: "user", content: "hi" }];
const tryCall = async (fn) => { try { await fn({ DEEPSEEK_API_KEY: "k" }, "deepseek-chat", MSG, 64, false); return null; } catch (e) { return String(e && e.message || e); } };

// 1. the first 402 is fetched once and throws the usual error
let t = load(402);
let err = await tryCall(t.fn);
ok(/^deepseek 402/.test(err || "") && t.seen.fetches === 1, "first 402 fetched once and thrown as deepseek 402: " + err);

// 2. while open: no fetch, no spend-guard read, same error prefix (callers' fallbacks key on a thrown error)
err = await tryCall(t.fn);
ok(/^deepseek 402/.test(err || "") && /DEEPSEEK-402-BREAKER-1/.test(err), "open breaker throws deepseek 402 with the marker: " + err);
ok(t.seen.fetches === 1 && t.seen.guards === 1, "open breaker made no fetch and no spend-guard read (fetches " + t.seen.fetches + ", guards " + t.seen.guards + ")");

// 3. after the window the paid path is probed again (and a recovered balance answers)
const realNow = Date.now;
Date.now = () => realNow() + 61 * 60e3;
try {
  t.status = 200;
  err = await tryCall(t.fn);
  ok(err === null && t.seen.fetches === 2, "after the window the paid path is probed and a 200 is returned (err " + err + ", fetches " + t.seen.fetches + ")");
  err = await tryCall(t.fn);
  ok(err === null && t.seen.fetches === 3, "a recovered balance keeps the paid path");
} finally { Date.now = realNow; }

// 4. other errors never open the breaker
t = load(500);
await tryCall(t.fn);
await tryCall(t.fn);
ok(t.seen.fetches === 2, "a 500 does not open the breaker (fetches " + t.seen.fetches + ")");

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
