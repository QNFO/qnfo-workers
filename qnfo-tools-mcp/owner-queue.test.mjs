// OWNER-QUEUE-MCP-1 offline suite: owner_queue / owner_code / owner_act in qnfo-tools-mcp.
// Proves: the tools are listed and gated by token scope (read token cannot send a code or act); owner_act refuses a missing
// or malformed code BEFORE any network call; a wrong code changes nothing; a right code runs the whole batch through the
// dashboard's own /api/cmd routes with the session cookie it returned; the dashboard's step-up and ha:-only rules still
// bite; the code never reaches mcp_log; a dashboard outage is reported verbatim, never as success.
// Run: node qnfo-tools-mcp/owner-queue.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

let passed = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + ": " + (e && e.message || e)); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || "eq") + ": got " + JSON.stringify(a) + " want " + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion"); };

const COOKIE = "ab".repeat(32);
const GOOD = "123456";
const calls = [];
const state = { used: false, codeSent: 0, snoozed: [], done: [], notes: [], stepup: true, down: false };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const path = u.pathname;
  const body = init.body ? JSON.parse(init.body) : null;
  const h = init.headers || {};
  calls.push({ method: init.method, path, headers: h, body });
  if (state.down) throw new Error("connect ECONNREFUSED");
  if (u.origin !== "https://fleet.qnfo.org") return new Response("{}", { status: 404 });
  const j = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...extra } });
  if (path === "/api/human") return j({ verdict: "ACTION", count: 2, snoozed: 1, items: [
    { key: "ha:outlook-graph-entra-app", source: "queue", title: "Register the Entra app", why: "w", action: "do x", url: "https://example.org/pr/3", sev: "urgent", due: "", age: 1, fallback: "none" },
    { key: "reg:7", source: "register", title: "Derived", why: "", action: "", url: "", sev: "normal", due: "2026-10-20", age: null }], upcoming: [] });
  if (h["x-fleet-ui"] !== "1") return j({ error: "missing x-fleet-ui header" }, 400);
  if (path === "/api/cmd/code") { state.codeSent++; return j({ ok: true, sent: true, note: "Code sent to rw...@outlook.com. It is valid for 10 minutes." }); }
  if (path === "/api/cmd/verify") {
    if (state.used || body.code !== GOOD) return j({ ok: false, error: "That code is not valid (wrong, expired or already used)." }, 401);
    state.used = true;
    return j({ ok: true, text: "Signed in for 12 hours." }, 200, { "Set-Cookie": "fleet_cmd=" + COOKIE + "; Path=/; HttpOnly; Secure; SameSite=Lax" });
  }
  if (path === "/api/cmd/run") {
    if (!String(h.Cookie || "").includes("fleet_cmd=" + COOKIE)) return j({ ok: false, need: "code", error: "Actions need your email code." }, 401);
    const { op, args } = body;
    if ((op === "done" || op === "dismiss") && !state.stepup) return j({ ok: false, need: "stepup", error: "destructive: enter a fresh code" }, 401);
    if ((op === "done" || op === "dismiss") && !String(args.key).startsWith("ha:")) return j({ ok: false, error: "only queue items can be marked " + op }, 400);
    if (op === "snooze") { state.snoozed.push([args.key, args.days]); return j({ ok: true, text: "Snoozed until 2026-10-10." }); }
    if (op === "note") { state.notes.push([args.key, args.note]); return j({ ok: true, text: "Note kept and filed as fleet work." }); }
    if (op === "done") { state.done.push(args.key); return j({ ok: true, text: "Marked done." }); }
    return j({ ok: false, error: "unknown action" }, 400);
  }
  return j({ error: "not found" }, 404);
};

function mkEnv() {
  const db = new DatabaseSync(":memory:");
  const AUDIT = { prepare: (sql) => { const st = db.prepare(sql); let b = []; const o = { bind: (...a) => { b = a; return o; }, run: async () => { st.run(...b); return { meta: {} }; }, all: async () => ({ results: st.all(...b) }) }; return o; } };
  return { env: { MCP_TOKEN: "w-token", MCP_READ_TOKEN: "r-token", RT: "x", AUDIT }, db };
}
async function rpc(env, token, method, params) {
  const r = await worker.fetch(new Request("https://t/mcp?token=" + token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), env, { waitUntil() {} });
  return r.json();
}
const call = async (env, token, name, args) => { const j = await rpc(env, token, "tools/call", { name, arguments: args }); if (j.error) return { rpcError: j.error }; const tx = j.result.content[0].text; return j.result.isError ? { isError: tx } : JSON.parse(tx); };
const reset = () => { calls.length = 0; Object.assign(state, { used: false, codeSent: 0, snoozed: [], done: [], notes: [], stepup: true, down: false }); };

await t("tools/list: write token sees all three, read token sees only owner_queue", async () => {
  const { env } = mkEnv();
  const w = (await rpc(env, "w-token", "tools/list")).result.tools.map((x) => x.name);
  const r = (await rpc(env, "r-token", "tools/list")).result.tools.map((x) => x.name);
  for (const n of ["owner_queue", "owner_code", "owner_act"]) ok(w.includes(n), n + " missing for write token");
  ok(r.includes("owner_queue") && !r.includes("owner_code") && !r.includes("owner_act"), "read token must see only owner_queue: " + r.join());
});

await t("read token cannot call owner_code or owner_act (-32003) and nothing leaves the worker", async () => {
  reset(); const { env } = mkEnv();
  for (const n of ["owner_code", "owner_act"]) {
    const j = await rpc(env, "r-token", "tools/call", { name: n, arguments: { code: GOOD, actions: [{ key: "ha:x1", kind: "snooze", days: 3 }] } });
    eq(j.error && j.error.code, -32003, n);
  }
  eq(calls.length, 0, "no fetch");
});

await t("owner_queue returns keys, urgency, action text; read token allowed", async () => {
  reset(); const { env } = mkEnv();
  const q = await call(env, "r-token", "owner_queue", {});
  eq(q.open, 2); eq(q.snoozed, 1);
  eq(q.items[0].key, "ha:outlook-graph-entra-app"); eq(q.items[0].sev, "urgent"); eq(q.items[0].action, "do x");
  eq(calls[0].method, "GET");
});

await t("owner_code asks the dashboard to email the code and never returns one", async () => {
  reset(); const { env } = mkEnv();
  const r = await call(env, "w-token", "owner_code", {});
  eq(r.sent, true); eq(state.codeSent, 1); ok(!/\d{6}/.test(JSON.stringify(r)), "no digits in the reply");
});

await t("owner_act refuses a missing/short/non-numeric code before any network call", async () => {
  reset(); const { env } = mkEnv();
  for (const code of [undefined, "", "12345", "abcdef"]) {
    const r = await call(env, "w-token", "owner_act", { code, actions: [{ key: "ha:x1", kind: "snooze", days: 3 }] });
    ok(r.error && /6 digits/.test(r.error), "code " + code + " -> " + JSON.stringify(r));
  }
  eq(calls.length, 0, "no fetch");
});

await t("owner_act validates actions before spending the code", async () => {
  reset(); const { env } = mkEnv();
  const bad = [[{ key: "ha:x1", kind: "delete" }], [{ key: "ha:x1", kind: "snooze" }], [{ key: "ha:x1", kind: "note" }], [{ key: "a b", kind: "done" }], []];
  for (const actions of bad) { const r = await call(env, "w-token", "owner_act", { code: GOOD, actions }); ok(r.error, JSON.stringify(actions)); }
  eq(calls.length, 0, "no fetch, code not consumed"); eq(state.used, false);
});

await t("wrong code: nothing is run, error is reported", async () => {
  reset(); const { env } = mkEnv();
  const r = await call(env, "w-token", "owner_act", { code: "000000", actions: [{ key: "ha:x1", kind: "done" }] });
  ok(/code not accepted/.test(r.error), JSON.stringify(r));
  eq(calls.filter((c) => c.path === "/api/cmd/run").length, 0); eq(state.done.length, 0);
});

await t("right code: one verify, then the batch runs with the returned session cookie", async () => {
  reset(); const { env } = mkEnv();
  const r = await call(env, "w-token", "owner_act", { code: GOOD, actions: [
    { key: "ha:outlook-graph-entra-app", kind: "snooze", days: 7 },
    { key: "reg:7", kind: "snooze", days: 200 },
    { key: "ha:outlook-graph-entra-app", kind: "note", note: "waiting on Entra signup" },
    { key: "ha:personal-radar-home", kind: "done" }] });
  eq(r.ok, true); eq(r.done, 4); eq(r.failed, 0);
  eq(calls.filter((c) => c.path === "/api/cmd/verify").length, 1);
  const runs = calls.filter((c) => c.path === "/api/cmd/run");
  eq(runs.length, 4); ok(runs.every((c) => c.headers.Cookie === "fleet_cmd=" + COOKIE && c.headers["x-fleet-ui"] === "1"), "cookie + header");
  eq(state.snoozed, [["ha:outlook-graph-entra-app", 7], ["reg:7", 90]], "days clamped to 90");
  eq(state.notes, [["ha:outlook-graph-entra-app", "waiting on Entra signup"]]); eq(state.done, ["ha:personal-radar-home"]);
});

await t("the dashboard's own rules still apply: done on a derived key and a stale step-up are reported as failures", async () => {
  reset(); const { env } = mkEnv();
  const r = await call(env, "w-token", "owner_act", { code: GOOD, actions: [{ key: "reg:7", kind: "done" }, { key: "ha:a1", kind: "snooze", days: 1 }] });
  eq(r.ok, false); eq(r.failed, 1); eq(r.done, 1); ok(/only queue items/.test(r.results[0].error), r.results[0].error);
  reset(); state.stepup = false;
  const r2 = await call(env, "w-token", "owner_act", { code: GOOD, actions: [{ key: "ha:a1", kind: "done" }] });
  eq(r2.ok, false); ok(/fresh code/.test(r2.results[0].error), JSON.stringify(r2)); eq(state.done.length, 0);
});

await t("a used code cannot be replayed", async () => {
  reset(); const { env } = mkEnv();
  await call(env, "w-token", "owner_act", { code: GOOD, actions: [{ key: "ha:a1", kind: "snooze", days: 1 }] });
  const again = await call(env, "w-token", "owner_act", { code: GOOD, actions: [{ key: "ha:a2", kind: "snooze", days: 1 }] });
  ok(/code not accepted/.test(again.error)); eq(state.snoozed.length, 1);
});

await t("the code never reaches mcp_log; other arguments still do", async () => {
  reset(); const { env, db } = mkEnv();
  await call(env, "w-token", "owner_act", { code: GOOD, actions: [{ key: "ha:a1", kind: "snooze", days: 2 }] });
  const rows = db.prepare("SELECT args, result FROM mcp_log WHERE tool='owner_act'").all();
  eq(rows.length, 1); ok(!rows[0].args.includes(GOOD) && !rows[0].result.includes(GOOD) && !rows[0].result.includes(COOK()), "code or cookie leaked: " + rows[0].args);
  ok(rows[0].args.includes("ha:a1") && rows[0].args.includes("[redacted]"));
});
function COOK() { return COOKIE; }

await t("a dashboard outage is an error, never success", async () => {
  reset(); state.down = true; const { env } = mkEnv();
  for (const [n, a] of [["owner_queue", {}], ["owner_code", {}], ["owner_act", { code: GOOD, actions: [{ key: "ha:a1", kind: "snooze", days: 1 }] }]]) {
    const r = await call(env, "w-token", n, a);
    ok(r.error && /unreachable|not accepted/.test(r.error), n + ": " + JSON.stringify(r));
  }
});

await t("existing tools unchanged: health lists them and version is bumped", async () => {
  reset(); const { env } = mkEnv();
  const r = await worker.fetch(new Request("https://t/health"), env, { waitUntil() {} });
  const j = await r.json();
  ok(j.version.startsWith("1.2.0"), j.version);
  for (const n of ["web_search", "email_respond", "owner_queue", "owner_act"]) ok(j.tools.includes(n), n);
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
