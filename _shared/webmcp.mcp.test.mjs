// WEBMCP-FLEET-1 MCP endpoint tests (2026-10-25). Run: node --test _shared/webmcp.mcp.test.mjs
//
// The /mcp surface is what Cloudflare's own WebMCP bridge drives (pack mcp-server-client): initialize, then
// notifications/initialized, then tools/list, then tools/call with the visitor's session. These tests lock that
// contract against the shapes read out of the live platform bundle on 2026-10-25, so a change here fails before a
// browser agent sees a broken tool.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOCK = readFileSync(join(ROOT, "_shared", "webmcp.js"), "utf8");
const EXPORTS =
  "\n;globalThis.__wm = { wmMcp, wmMcpCard, wmManifest, wmToolUrl, wmExecTool, wmRoute, WM_VERSION, WM_MCP_PATH, WM_MANIFEST_URL, WM_MCP_PROTOCOLS };";

function load() {
  const sandbox = { URL, URLSearchParams, Response, Headers, Request, console, String, Number, Array, Object, JSON, RegExp, Math, Date, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(BLOCK + EXPORTS).runInContext(sandbox);
  return sandbox.__wm;
}

const HOST = "https://papers.qnfo.org";
function rpc(wm, body, opts) {
  const init = { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(body) };
  return wm.wmMcp(new Request(HOST + wm.WM_MCP_PATH, init), {}, {}, (opts && opts.origFetch) || (async () => new Response("{}", { headers: { "Content-Type": "application/json" } })), "qnfo-gateway");
}

test("GET /mcp publishes a server card an MCP client can read", async () => {
  const wm = load();
  const res = await wm.wmMcp(new Request(HOST + wm.WM_MCP_PATH), {}, {}, async () => new Response(""), "qnfo-gateway");
  assert.equal(res.status, 200);
  const card = await res.json();
  assert.equal(card.schema_version, "mcp/server-card/v1");
  assert.equal(card.serverInfo.name, "qnfo-webmcp");
  assert.equal(card.transport.path, "/mcp");
  assert.ok(card.tool_count > 0);
  assert.ok(card.packs.includes("papers"));
});

test("initialize negotiates a known protocol version and advertises tools", async () => {
  const wm = load();
  const res = await rpc(wm, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  const body = await res.json();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, 1);
  assert.equal(body.result.protocolVersion, "2025-06-18");
  assert.deepEqual(body.result.capabilities.tools.listChanged, false);
  assert.equal(body.result.serverInfo.name, "qnfo-webmcp");
  // An unknown version is answered with the newest we speak rather than refused: the platform bridge sends all three.
  const res2 = await rpc(wm, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  const body2 = await res2.json();
  assert.ok(wm.WM_MCP_PROTOCOLS.includes(body2.result.protocolVersion));
});

test("notifications answer 202 with no body, which is what the platform bridge expects", async () => {
  const wm = load();
  const res = await rpc(wm, { jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(res.status, 202);
  assert.equal((await res.text()).length, 0);
});

test("tools/list returns exactly the manifest's tools with object schemas", async () => {
  const wm = load();
  const man = wm.wmManifest("papers.qnfo.org", "qnfo-gateway");
  const res = await rpc(wm, { jsonrpc: "2.0", id: 3, method: "tools/list" });
  const body = await res.json();
  const names = body.result.tools.map((t) => t.name);
  assert.equal(names.length, man.tool_count);
  for (const t of body.result.tools) {
    assert.equal(t.inputSchema.type, "object", t.name + " schema is an object");
    assert.ok(t.description.length > 20, t.name + " carries a description");
  }
  assert.ok(names.includes("search_papers"));
  assert.ok(names.includes("read_page"));
});

test("tools/call executes through the worker's own router and returns an MCP CallToolResult", async () => {
  const wm = load();
  const seen = [];
  const origFetch = async (req) => {
    seen.push(req.method + " " + req.url);
    return new Response(JSON.stringify({ total: 698, items: [{ slug: "ultrametric-intelligence" }] }), { headers: { "Content-Type": "application/json" } });
  };
  const res = await rpc(wm, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_papers", arguments: { q: "p-adic", limit: 3 } } }, { origFetch });
  const body = await res.json();
  assert.equal(body.id, 4);
  assert.equal(body.result.content[0].type, "text");
  assert.match(body.result.content[0].text, /ultrametric-intelligence/);
  assert.equal(body.result.isError, undefined);
  assert.deepEqual(seen, ["GET https://papers.qnfo.org/api/papers?q=p-adic&limit=3"]);
});

test("tools/call reports an upstream failure as isError instead of a silent success", async () => {
  const wm = load();
  const origFetch = async () => new Response("nope", { status: 503, headers: { "Content-Type": "text/plain" } });
  const res = await rpc(wm, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_paper", arguments: { slug: "x" } } }, { origFetch });
  const body = await res.json();
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /HTTP 503/);
});

test("unknown tools, unknown methods and malformed bodies are JSON-RPC errors, never 200-with-nothing", async () => {
  const wm = load();
  const unknownTool = await (await rpc(wm, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "drop_database", arguments: {} } })).json();
  assert.equal(unknownTool.error.code, -32602);
  const unknownMethod = await (await rpc(wm, { jsonrpc: "2.0", id: 7, method: "resources/list" })).json();
  assert.equal(unknownMethod.error.code, -32601);
  const bad = await wm.wmMcp(new Request(HOST + wm.WM_MCP_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }), {}, {}, async () => new Response(""), "qnfo-gateway");
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, -32700);
});

test("/mcp is inert for other paths and other methods", async () => {
  const wm = load();
  assert.equal(await wm.wmMcp(new Request(HOST + "/api/papers"), {}, {}, async () => new Response(""), "w"), null);
  assert.equal(await wm.wmMcp(new Request(HOST + "/mcp/x"), {}, {}, async () => new Response(""), "w"), null);
  const put = await wm.wmMcp(new Request(HOST + wm.WM_MCP_PATH, { method: "PUT", body: "{}" }), {}, {}, async () => new Response(""), "w");
  assert.equal(put.status, 405);
  const del = await wm.wmMcp(new Request(HOST + wm.WM_MCP_PATH, { method: "DELETE" }), {}, {}, async () => new Response(""), "w");
  assert.equal(del.status, 204);
});

test("a host gets only the tools its packs advertise, on /mcp as well as in the manifest", async () => {
  const wm = load();
  const mind = await (await wm.wmMcp(new Request("https://mind.q08.org/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }) }), {}, {}, async () => new Response("{}", { headers: { "Content-Type": "application/json" } }), "q08-mind")).json();
  const names = mind.result.tools.map((t) => t.name);
  assert.ok(names.includes("list_entries"));
  assert.equal(names.includes("search_papers"), false, "a mind host never advertises the paper corpus");
});
