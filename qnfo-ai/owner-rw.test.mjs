// OWNER-RW-ANY-LLM-1 offline suite (qnfo-ai 5.38.0): a keyed caller (either router key, or a key qnfo-ops accepts) can write and
// read the idea and issue queues over REST and MCP; a wrong key is a 401 key_rejected; verify-key answers only qnfo-ops.
// Run: node qnfo-ai/owner-rw.test.mjs -> prints "N passed, 0 failed".
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = mkdtempSync(join(tmpdir(), "qnfo-ai-rw-"));
writeFileSync(join(dir, "worker.mjs"), readFileSync(new URL("./worker.js", import.meta.url), "utf8"));
const worker = (await import(pathToFileURL(join(dir, "worker.mjs")).href)).default;
const say = console.log.bind(console);
console.log = () => {};
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; say("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
globalThis.fetch = async () => new Response("blocked in test", { status: 599 });

function d1(db) {
  return { prepare(sql) { let a = []; const q = { bind(...x) { a = x; return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return q; } };
}
function mk(extra) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at TEXT, updated_at TEXT); CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT, contact TEXT, status TEXT, created_at TEXT);");
  return { db, env: Object.assign({ ROUTER_AUTH_KEY: "key-one", ROUTER_AUTH_KEY_2: "key-two", QNFO_AUDIT: d1(db), AI: { async run() { return { data: [[0.1]] }; } } }, extra || {}) };
}
async function req(t, method, path, headers, body, props) {
  const ctx = { waitUntil() {}, passThroughOnException() {}, props };
  const res = await worker.fetch(new Request("https://ai.qnfo.org" + path, { method, headers: Object.assign({ "Content-Type": "application/json" }, headers), body: body === undefined ? undefined : JSON.stringify(body) }), t.env, ctx);
  const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch (e) { }
  return { res, text, j };
}
const K1 = { Authorization: "Bearer key-one" }, K2 = { Authorization: "Bearer key-two" };
{
  const t = mk();
  let r = await req(t, "POST", "/v1/ideas", {}, { title: "x" });
  ok(r.res.status === 401 && r.text.indexOf("key_rejected") >= 0, "A1 no key is 401");
  r = await req(t, "POST", "/v1/ideas", { Authorization: "Bearer 003bad" }, { title: "x" });
  ok(r.res.status === 401, "A2 wrong key is 401");
  r = await req(t, "POST", "/v1/ideas", K1, { title: "Idea", body: "b" });
  ok(r.j && r.j.ok && r.j.kind === "idea", "B1 key one files an idea");
  r = await req(t, "POST", "/v1/ideas", K2, { kind: "issue", title: "Task", priority: "high" });
  ok(r.j && r.j.ok && r.j.kind === "issue", "B2 key two files an issue");
  ok(t.db.prepare("SELECT source FROM agent_issues").get().source === "owner-chat" && t.db.prepare("SELECT contact FROM idea_proposals").get().contact === "owner", "B3 rows are owner-authored");
  r = await req(t, "GET", "/v1/queue?which=all", K2);
  ok(r.j && r.j.issues.length === 1 && r.j.ideas.length === 1, "C1 queue read");
  r = await req(t, "POST", "/v1/tools/call", K1, { name: "idea_submit", arguments: { title: "t" } });
  ok(r.j && r.j.ok === true, "D1 tools/call idea_submit");
  r = await req(t, "POST", "/v1/tools/call", K1, { name: "run_code", arguments: { code: "1" } });
  ok(r.j && r.j.ok === false, "D2 tools/call refuses tools outside the owner set");
  r = await req(t, "POST", "/mcp", K1, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  ok(r.j && r.j.result.tools.some((x) => x.name === "idea_submit") && r.j.result.tools.some((x) => x.name === "queue_read"), "E1 mcp tools/list");
  r = await req(t, "POST", "/mcp", K1, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "queue_read", arguments: { which: "ideas" } } });
  ok(r.j && r.j.result.isError === false, "E2 mcp tools/call");
  r = await req(t, "POST", "/mcp", {}, { jsonrpc: "2.0", id: 3, method: "tools/list" });
  ok(r.res.status === 401, "E3 mcp without key is 401");
  r = await req(t, "GET", "/openapi.json", {});
  ok(r.j && r.j.paths["/v1/ideas"], "F1 openapi.json");
  r = await req(t, "POST", "/internal/verify-key", K1, undefined, { caller: "qnfo-ops" });
  ok(r.j && r.j.ok === true && r.j.scope === "owner", "G1 verify-key yes for qnfo-ops caller");
  r = await req(t, "POST", "/internal/verify-key", { Authorization: "Bearer nope" }, undefined, { caller: "qnfo-ops" });
  ok(r.j && r.j.ok === false, "G2 verify-key no for a bad key");
  r = await req(t, "POST", "/internal/verify-key", K1, undefined, { caller: "qnfo-email" });
  ok(r.res.status === 404, "G3 verify-key refuses other service callers");
  r = await req(t, "POST", "/internal/verify-key", K1, undefined, undefined);
  ok(r.res.status === 404, "G4 verify-key hidden from public callers");
}
{
  const t = mk({ OPS: { async fetch(u, o) { return new Response(JSON.stringify(o.headers.Authorization === "Bearer ops-owner" ? { ok: true, scope: "owner" } : { ok: false })); } } });
  let r = await req(t, "POST", "/v1/ideas", { Authorization: "Bearer ops-owner" }, { title: "fed" });
  ok(r.j && r.j.ok === true, "H1 a key qnfo-ops accepts files an idea");
  r = await req(t, "POST", "/v1/ideas", { Authorization: "Bearer other" }, { title: "fed" });
  ok(r.res.status === 401, "H2 a key neither accepts is 401");
}
say(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
