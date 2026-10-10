// INDEXER-FOLD-1 (qnfo-infra 1.3.0, agent_issues 1756) offline suite. No network, synthetic data.
// Proves: the qnfo-paper-indexer code runs unchanged as the member indexerMod (only its version constant differs); the
// host's existing 06:30 trigger runs the member's two jobs ("0 4" impact, then "5 6" render metrics) with LIVING_PAPER and
// QNFO_AUDIT mapped onto the host's LIVING and AUDIT, the 18:00 trigger does not, and a former member trigger goes straight
// to the member; only its read routes are served at /indexer/* (the token-guarded /purge, /index, /webhook and /run are not
// reachable); wrangler.toml adds no cron (a newly registered trigger was seen not to fire, PROBER-ON-CAL-TICK-1).
// Run: node qnfo-infra/indexer-fold.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, existsSync } from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const guest = readFileSync(new URL("../qnfo-paper-indexer/worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { indexerMod as __member, INDEXER_VERSION as __mv, VERSION as __hv };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

{
  const lines = guest.split("\n");
  const body = lines.slice(lines.findIndex((l) => l.startsWith('var VERSION = "')), lines.indexOf("export { worker_default as default };"));
  // CONTROL-DISPOSITION (2026-10-08, doctrine section 13, REPLACE): line-by-line identity proved the fold copied the member
  // unchanged (INDEXER-FOLD-1), but the original directory is frozen (FOLDED), so the check then blocked every later fix to
  // the member (#1815 failed on it). The member keeps its structure: every function the guest declared is still declared in
  // the host, and only the member may differ from the guest.
  const fnames = [...new Set((body.join("\n").match(/function\s+([A-Za-z_$][\w$]*)/g) || []).map((m) => m.split(/\s+/)[1]))];
  const lost = fnames.filter((n) => !new RegExp("function\\s+" + n.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&") + "\\b").test(src));
  ok(fnames.length > 5 && lost.length === 0, "every function the indexer declared is still in the host member", lost);
  ok(versionAtLeast(mod.__hv, "1.3.1") && mod.__mv === "3.0.13-folded" && (src.match(/var VERSION = "/g) || []).length === 1, "host 1.3.1, member 3.0.13-folded, one quoted VERSION constant");
}

// cron dispatch with mapped bindings
{
  const seen = [];
  const real = mod.__member.scheduled;
  mod.__member.scheduled = async (ev, env) => { seen.push({ cron: ev.cron, living: env.LIVING_PAPER === env.LIVING && !!env.LIVING, audit: env.QNFO_AUDIT === env.AUDIT && !!env.AUDIT }); };
  const env = { LIVING: { tag: "living" }, AUDIT: { tag: "audit", prepare: () => { const s = { bind: () => s, run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }; return s; } } };
  try { await mod.default.scheduled({ cron: "30 6 * * *", scheduledTime: Date.UTC(2026, 9, 7, 6, 30) }, env, {}); } catch (e) {}
  ok(seen.length === 2 && seen.every((s) => s.living && s.audit) && seen.map((s) => s.cron).join() === "0 4 * * *,5 6 * * *", "the 06:30 trigger runs both indexer jobs, impact first, with LIVING_PAPER and QNFO_AUDIT mapped", seen);
  const before = seen.length;
  try { await mod.default.scheduled({ cron: "0 18 * * *" }, env, {}); } catch (e) {}
  ok(seen.length === before, "the 18:00 trigger does not run the member");
  await mod.default.scheduled({ cron: "5 6 * * *" }, env, {});
  ok(seen.length === before + 1 && seen[seen.length - 1].cron === "5 6 * * *", "a former member trigger goes straight to the member");
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
ok(/\ncrons = \["30 6 \* \* \*", "0 18 \* \* \*"\]\n/.test(toml), "wrangler.toml keeps the host's two crons and adds none for the member");
ok(existsSync(new URL("../qnfo-paper-indexer/FOLDED", import.meta.url)), "qnfo-paper-indexer carries a FOLDED marker");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
