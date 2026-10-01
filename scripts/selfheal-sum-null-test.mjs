// SELFHEAL-SUM-NULL-1: a tool whose every recent error is excluded must NOT file/refresh a self-heal ticket.
import fs from "node:fs";
const src = fs.readFileSync(new URL("../qnfo-ops/worker.js", import.meta.url), "utf8");
const i = src.indexOf("async function telemetryAnalyze(env, hours)");
const j = src.indexOf("\n}\n", i) + 3;
const body = src.slice(i, j);
const mk = new Function("__name", "fnv32", "iso", body + "; return telemetryAnalyze;");
const fn = mk((f) => f, (s) => "h", () => "t");
async function run(census) {
  const writes = [];
  const env = { QNFO_AUDIT: { prepare(sql) { return { bind() { return this; },
    async all() { return { results: /GROUP BY text/.test(sql) ? [{ text: "web_fetch", last_ts: new Date().toISOString(), n: 4 }] : [] }; },
    async first() { return /SUM\(CASE/.test(sql) ? census : null; },
    async run() { writes.push(sql); return {}; } }; } } };
  const out = await fn(env, 6);
  return { out, writes };
}
const excludedAll = await run({ e: null, s: null }); // SUM over zero surviving rows
if (excludedAll.out.filed || excludedAll.writes.some((s) => /INSERT INTO issue_ledger|status = 'open' WHERE fingerprint/.test(s))) throw new Error("ticket filed for fully-excluded errors");
const real = await run({ e: 4, s: 0 });
if (!(real.out.filed || real.out.alreadyOpen || real.writes.length)) throw new Error("genuine failures no longer file");
console.log("selfheal-sum-null ok");
