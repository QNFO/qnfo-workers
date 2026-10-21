// FLEET-PR-SHARE-1 + CLOSE-PROVENANCE-1 RED-DRAIN form (qnfo-github-steward 0.7.6, agent_issues 100420). Offline: fake fetch + fake D1.
// Run: node qnfo-github-steward/fleet-pr-share.test.mjs  -> "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { fleetPrShare as __share, tsCodeChange as __cc };\n").toString("base64"));
function db(rows) {
  const w = [];
  return { w, prepare(sql) { return { bind(...a) { return { run: async () => { w.push({ sql, a }); return {}; }, all: async () => ({ results: rows(sql, a) }) }; } }; } };
}
async function withFetch(fn, impl) { const o = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = o; } }
const resp = (status, body) => ({ status, headers: { get: () => null }, text: async () => JSON.stringify(body) });
{
  const d = db(() => []);
  const r = await withFetch(() => mod.__share({ AUDIT: d, GITHUB_TOKEN: "x" }), async (u) => resp(200, { total_count: /author%3Aapp%2Fqnfo-fleet/.test(u) ? 30 : 120 }));
  ok(r.ok && r.merged === 120 && r.fleet === 30 && r.share === 0.25, "share = fleet / all", r);
  ok(d.w.length === 1 && /fleet_authored_pr_share_7d/.test(d.w[0].sql) && d.w[0].a[0] === "0.25", "writes metric_registry once", d.w);
}
{
  const d = db(() => []);
  const r = await withFetch(() => mod.__share({ AUDIT: d, GITHUB_TOKEN: "x" }), async (u) => /author/.test(u) ? resp(403, { message: "no" }) : resp(200, { total_count: 5 }));
  ok(!r.ok && d.w.length === 0, "a failed read writes nothing (no false zero)", r);
}
{
  const d = db((sql, a) => (a[2] === "%-- issue #100371 (RED-DRAIN-1%" ? [{ pr_url: "https://github.com/QNFO/qnfo-workers/pull/3467" }] : []));
  const t = await mod.__cc({ AUDIT: d }, 100371);
  ok(/#3467/.test(t), "provenance finds a RED-DRAIN-1 goal", t);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
