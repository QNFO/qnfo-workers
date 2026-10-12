// AUTOAUDIT-DEAD-CALLERS-1 (agent_issues 2302) offline suite for qnfo-tools-mcp.
// Proves: worker.js names no retired search worker or removed binding; personal_search reaches qnfo-intent-orchestrator
// /personal/search over QNFO_INTENT with the intent key and the caller's topK, and maps the answer; an upstream failure is
// reported as an error, never as an empty success.
// Run: node qnfo-tools-mcp/personal-search.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

let passed = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + ": " + (e && e.message || e)); } };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion"); };

function mkEnv(reply) {
  const db = new DatabaseSync(":memory:");
  const AUDIT = { prepare: (sql) => { let st = null; try { st = db.prepare(sql); } catch (e) { st = null; } let b = []; const o = { bind: (...a) => { b = a; return o; }, run: async () => { if (st) st.run(...b); return { meta: {} }; }, all: async () => ({ results: st ? st.all(...b) : [] }), first: async () => (st ? st.get(...b) || null : null) }; return o; }, exec: async (sql) => db.exec(sql) };
  const seen = [];
  const QNFO_INTENT = { fetch: async (url, init = {}) => { seen.push({ url: String(url), headers: init.headers || {} }); return reply(); } };
  return { env: { MCP_TOKEN: "w-token", RT: "x", INTENT_TOKEN: "intent-key", AUDIT, QNFO_INTENT }, seen };
}
async function call(env, name, args) {
  const r = await worker.fetch(new Request("https://t/mcp?token=w-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env, { waitUntil() {} });
  const j = await r.json();
  if (j.error) return { rpcError: j.error };
  return JSON.parse(j.result.content[0].text);
}

await t("worker.js names no retired search worker and no removed binding", async () => {
  ok(!/personal-life-search/.test(src), "retired worker named");
  ok(!/env\.PL_SEARCH\b/.test(src), "removed binding used");
});
await t("VERSION is at least 1.2.1", async () => {
  const m = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  const n = m ? Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]) : 0;
  ok(n >= 1002001, "version " + (m && m[0]));
});
await t("personal_search goes to the intent orchestrator with the key and topK and maps the files", async () => {
  const { env, seen } = mkEnv(() => new Response(JSON.stringify({ count: 1, files: [{ path: "activities/2026-10-10/int-1.md", bestScore: 0.81, snippet: "dinner" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const out = await call(env, "personal_search", { q: "dinner at home", topK: 3 });
  ok(seen.length === 1, "calls " + seen.length);
  const u = new URL(seen[0].url);
  ok(u.pathname === "/personal/search" && u.searchParams.get("q") === "dinner at home" && u.searchParams.get("topK") === "3", seen[0].url);
  ok(seen[0].headers.Authorization === "Bearer intent-key", "auth header");
  ok(out.count === 1 && out.files[0].path === "activities/2026-10-10/int-1.md" && out.files[0].score === 0.81 && out.files[0].snippet === "dinner", JSON.stringify(out));
});
await t("an upstream failure is an error, not an empty result", async () => {
  const { env } = mkEnv(() => new Response(JSON.stringify({ error: "search failed" }), { status: 502, headers: { "Content-Type": "application/json" } }));
  const out = await call(env, "personal_search", { q: "x" });
  ok(/search failed/.test(JSON.stringify(out)) && out.count === undefined, JSON.stringify(out));
  const { env: env2 } = mkEnv(() => new Response("upstream down", { status: 500 }));
  const out2 = await call(env2, "personal_search", { q: "x" });
  ok(/HTTP 500/.test(JSON.stringify(out2)), JSON.stringify(out2));
});

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
