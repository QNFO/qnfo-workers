// INDEXER-FOLD-1 (qnfo-infra 1.3.0, agent_issues 1756) offline suite. No network, synthetic data.
// Proves: the qnfo-paper-indexer code runs unchanged as the member indexerMod (only its version constant differs); its two
// crons ("0 4 * * *", "5 6 * * *") reach the member with LIVING_PAPER and QNFO_AUDIT mapped onto the host's LIVING and AUDIT,
// and the host's own crons do not; only its read routes are served at /indexer/* (the token-guarded /purge, /index, /webhook
// and /run are not reachable); wrangler.toml declares all four crons.
// Run: node qnfo-infra/indexer-fold.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, existsSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const guest = readFileSync(new URL("../qnfo-paper-indexer/worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { indexerMod as __member, INDEXER_VERSION as __mv, VERSION as __hv };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

{
  const lines = guest.split("\n");
  const body = lines.slice(lines.findIndex((l) => l.startsWith('var VERSION = "3.0.12-math-browser-metric";')), lines.indexOf("export { worker_default as default };"));
  const missing = body.filter((l) => l.trim() && !src.includes(l.trim()));
  ok(missing.length === 1 && missing[0].startsWith("var VERSION = "), "every indexer line is in the host except its VERSION line", missing.map((l) => l.slice(0, 60)));
  ok(/^1\.3\.0/.test(mod.__hv) && mod.__mv === "3.0.13-folded" && (src.match(/var VERSION = "/g) || []).length === 1, "host 1.3.0, member 3.0.13-folded, one quoted VERSION constant");
}

// cron dispatch with mapped bindings
{
  const seen = [];
  const real = mod.__member.scheduled;
  mod.__member.scheduled = async (ev, env) => { seen.push({ cron: ev.cron, living: env.LIVING_PAPER === env.LIVING && !!env.LIVING, audit: env.QNFO_AUDIT === env.AUDIT && !!env.AUDIT }); };
  const env = { LIVING: { tag: "living" }, AUDIT: { tag: "audit", prepare: () => { const s = { bind: () => s, run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }; return s; } } };
  await mod.default.scheduled({ cron: "0 4 * * *" }, env, {});
  await mod.default.scheduled({ cron: "5 6 * * *" }, env, {});
  ok(seen.length === 2 && seen.every((s) => s.living && s.audit) && seen.map((s) => s.cron).join() === "0 4 * * *,5 6 * * *", "both indexer crons reach the member with LIVING_PAPER and QNFO_AUDIT mapped", seen);
  mod.__member.scheduled = real;
  let hostRan = 0;
  const env2 = { AUDIT: { prepare: () => { hostRan++; const s = { bind: () => s, run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }; return s; } } };
  const before = seen.length;
  mod.__member.scheduled = async () => { seen.push("member"); };
  try { await mod.default.scheduled({ cron: "30 6 * * *" }, env2, {}); } catch (e) {}
  ok(seen.length === before, "the host's own 06:30 cron does not run the member");
  mod.__member.scheduled = real;
}

// routes
{
  const q = () => { const s = { bind: () => s, first: async () => ({ c: 7 }), all: async () => ({ results: [] }), run: async () => ({}) }; return s; };
  const env = { LIVING: { prepare: q }, AUDIT: { prepare: q } };
  const get = (p, m) => mod.default.fetch(new Request("https://qnfo-infra.q08.workers.dev" + p, { method: m || "GET" }), env, {});
  const h = await (await get("/indexer/health")).json();
  ok(h.worker === "qnfo-paper-indexer" && h.version === "3.0.13-folded", "/indexer/health answers as the member", h);
  const c = await (await get("/indexer/count")).json();
  ok(c.count === 7 && c.corpus_total === 7, "/indexer/count reads living-paper through the mapped binding", c);
  for (const p of ["/indexer/purge", "/indexer/index", "/indexer/webhook", "/indexer/run"]) {
    const r = await get(p);
    ok(r.status === 404, p + " is not reachable through the host", r.status);
  }
  ok((await get("/indexer/count", "POST")).status === 404, "only GET reaches the member");
}
ok(/crons = \["30 6 \* \* \*", "0 18 \* \* \*", "0 4 \* \* \*", "5 6 \* \* \*"\]/.test(toml), "wrangler.toml declares the host's and the member's crons");
ok(existsSync(new URL("../qnfo-paper-indexer/FOLDED", import.meta.url)), "qnfo-paper-indexer carries a FOLDED marker");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
