import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("./worker.js", import.meta.url), "utf8");
const mirror = await readFile(new URL("./deployed-current.worker.js", import.meta.url), "utf8");

test("deployed-current bundle mirrors the worker source", () => {
  assert.equal(mirror, worker);
});

test("health reports supported capabilities without secret-presence flags", () => {
  const start = worker.indexOf('if (path === "/health" && method === "GET")');
  const end = worker.indexOf('if (path === "/" && method === "GET")', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const health = worker.slice(start, end);
  for (const capability of [
    "durable-agent-storage",
    "persistent-chat-history",
    "authenticated-agent-websocket",
    "scheduled-daily-reports",
    "mcp-tool-integration",
    "email-routing",
    "workers-ai-and-qnfo-ai",
    "openai-compatible-chat-api"
  ]) {
    assert.ok(health.includes(capability), `health advertises ${capability}`);
  }
  assert.match(health, /limitations:\s*\[/);
  assert.doesNotMatch(health, /deepseek_key|mcp_cloudflare_api|auth:\s*!!env2\.SYNC_TOKEN/);
});

test("public debug probes are not routed", () => {
  assert.doesNotMatch(worker, /if \(path === "\/debug\/(?:agent|router|mcp)"/);
});

test("authorization matches the Agents SDK router's repeated-slash normalization", () => {
  const agentWorker = worker.indexOf("var agent_ws_default =");
  const start = worker.indexOf("async fetch(request, env2, ctx)", agentWorker);
  const end = worker.indexOf('if (path === "/v1/reports/run"', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const handler = worker.slice(start, end);
  const normalizedPath = handler.match(/const normalizedPath = ([^;]+);/);
  const authCheck = handler.match(/const requiresAuth = ([^;]+);/);
  assert.match(normalizedPath?.[1] || "", /path\.split\("\/"\)\.filter\(Boolean\)\.join\("\/"\)/);
  assert.match(authCheck?.[1] || "", /method === "POST".*normalizedPath\.startsWith\("\/agents\/"\)/);
  const requiresAuth = new Function("path", "method", `${normalizedPath[0]} ${authCheck[0]} return requiresAuth;`);

  for (const path of [
    "/agents/qnfo-agent/guest",
    "//agents//qnfo-agent/guest",
    "///agents///qnfo-agent/guest"
  ]) {
    assert.equal(requiresAuth(path, "GET"), true, `auth applies to ${path}`);
  }
  assert.equal(requiresAuth("/health", "GET"), false);
  assert.equal(requiresAuth("/health", "POST"), true);
});

test("chat IDs use Web Crypto and failures do not expose exception text", () => {
  const start = worker.indexOf("async function handleChatCompletions");
  const end = worker.indexOf('__name(handleChatCompletions', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const handler = worker.slice(start, end);
  assert.match(handler, /crypto\.randomUUID\(\)/);
  assert.match(handler, /Agent request failed/);
  assert.doesNotMatch(handler, /json3\(\{\s*error:\s*e2\.message/);
});

test("inbound email is not written to shared research storage", () => {
  const start = worker.indexOf("async onEmail(email3)");
  const end = worker.indexOf("// Public DO method", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const handler = worker.slice(start, end);
  assert.doesNotMatch(handler, /LIVING_PAPER|email_logs|email3\.from|email3\.subject/);
  assert.doesNotMatch(worker, /No route for email from.*email3\?\.from/);
});
