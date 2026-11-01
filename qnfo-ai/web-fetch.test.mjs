import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "qnfo-ai-web-fetch-"));
writeFileSync(join(dir, "worker.mjs"), readFileSync(new URL("./worker.js", import.meta.url), "utf8"));
const worker = (await import(pathToFileURL(join(dir, "worker.mjs")).href)).default;
const realFetch = globalThis.fetch;
const realTimeout = AbortSignal.timeout;
let calls = [];
let plan = [];
let budgets = [];
AbortSignal.timeout = (ms) => {
  budgets.push(ms);
  return new AbortController().signal;
};
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  const next = plan.shift();
  assert.ok(next, "unexpected upstream request");
  if (next instanceof Error) throw next;
  return next;
};
const page = (body = "readable page ".repeat(50)) => new Response(body, { headers: { "Content-Type": "text/html" } });
const request = async (url, responses = [], extra = {}, ctx = { props: { caller: "qnfo-fleet-control" } }) => {
  calls = [];
  budgets = [];
  plan = responses;
  const response = await worker.fetch(new Request("https://ai.test/v1/web/fetch?" + new URLSearchParams({ url, max: "500" })), extra, ctx);
  return { status: response.status, body: await response.json() };
};

try {
  for (const status of [502, 503, 504]) {
    const result = await request("https://example.com", [new Response("", { status }), page("<h1>Recovered</h1>" + "body ".repeat(150))]);
    assert.equal(result.status, 200, "transient HTTP " + status + " recovers");
    assert.equal(calls.length, 2, "only one retry");
    assert.equal(result.body.url, "https://example.com/");
    assert.equal(result.body.text.length, 500);
    assert.equal(result.body.truncated, true);
    assert.ok(result.body.text.startsWith("Recovered") && !result.body.text.includes("<h1>"));
    assert.equal(calls[0].init.signal, calls[1].init.signal, "retry shares the direct-fetch deadline");
    assert.deepEqual(budgets, [10000]);
  }
  let result = await request("https://example.com", [new Response("", { status: 502 }), new Response("", { status: 502 })]);
  assert.equal(result.status, 502, "persistent failure remains visible");
  assert.equal(result.body.error, "HTTP 502");
  assert.equal(calls.length, 2);

  result = await request("https://example.com", [new TypeError("connection failed"), page()]);
  assert.equal(result.status, 200, "transient network error recovers");
  assert.equal(calls.length, 2);
  result = await request("https://example.com", [new TypeError("connection failed"), new TypeError("connection failed")]);
  assert.equal(result.status, 502, "network errors are upstream failures, not uncaught 500s");

  for (const status of [401, 403, 404, 429]) {
    result = await request("https://example.com", [new Response("", { status })]);
    assert.equal(result.status, 502);
    assert.equal(result.body.error, "HTTP " + status);
    assert.equal(calls.length, 1, "do not retry permanent errors or rate limits");
  }
  for (const url of ["not a URL", "file:///etc/passwd", "http://localhost", "http://sub.localhost", "http://127.0.0.1", "http://10.0.0.1", "http://[::1]", "http://[::]", "http://[fc00::1]", "http://[fe80::1]", "http://[::ffff:127.0.0.1]"]) {
    result = await request(url);
    assert.equal(result.status, 400, "invalid or private URL is a client error");
    assert.equal(calls.length, 0, "rejected URL makes no upstream request");
  }
  result = await request("https://example.com", [new Response(null, { status: 302, headers: { Location: "/article" } }), page()]);
  assert.equal(result.status, 200, "public redirects still work");
  assert.equal(calls[1].url, "https://example.com/article");
  assert.equal(calls[0].init.redirect, "manual");
  result = await request("https://example.com", [new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private" } })]);
  assert.equal(result.status, 400, "redirect cannot bypass private-host validation");
  assert.equal(calls.length, 1);
  result = await request("https://example.com", [new Response(null, { status: 302, headers: { Location: "file:///etc/passwd" } })]);
  assert.equal(result.status, 400, "redirect cannot bypass scheme validation");
  assert.equal(calls.length, 1);

  AbortSignal.timeout = (ms) => {
    budgets.push(ms);
    return AbortSignal.abort();
  };
  result = await request("https://example.com", [new DOMException("timed out", "TimeoutError")]);
  assert.equal(result.status, 502);
  assert.equal(calls.length, 1, "an exhausted deadline starts no retry");
  AbortSignal.timeout = (ms) => {
    budgets.push(ms);
    return new AbortController().signal;
  };

  const brokenBody = new Response(new ReadableStream({ start(controller) { controller.error(new Error("body disconnected")); } }));
  result = await request("https://example.com", [brokenBody]);
  assert.equal(result.status, 502, "body-read errors remain upstream failures");
  assert.equal(result.body.error, "upstream body read failed");
  const brokenErrorBody = new Response(new ReadableStream({ start(controller) { controller.error(new Error("body disconnected")); } }), { status: 502 });
  result = await request("https://example.com", [brokenErrorBody, page()]);
  assert.equal(result.status, 200, "failed error-body cleanup does not prevent the bounded retry");

  result = await request("https://example.com", Array.from({ length: 6 }, () => new Response(null, { status: 302, headers: { Location: "/loop" } })));
  assert.equal(result.status, 502, "redirect loops remain bounded");
  assert.equal(calls.length, 6);

  result = await request("https://example.com", [page("small"), Response.json({ success: true, result: "rendered ".repeat(100) })], { CF_TOKEN: "test-browser-token" });
  assert.equal(result.status, 200, "existing short-page browser fallback remains");
  assert.equal(result.body.text.length, 500);
  assert.equal(result.body.truncated, true);
  assert.deepEqual(budgets, [10000, 15000]);
  assert.equal(JSON.parse(calls[1].init.body).gotoOptions.timeout, 10000);
  assert.ok(!calls[0].init.headers.Authorization, "browser credential is never sent to the target");

  result = await request("https://example.com", [], {}, { props: {} });
  assert.equal(result.status, 401, "route remains authenticated");
  assert.equal(calls.length, 0);
  console.log("web-fetch regression checks passed");
} finally {
  globalThis.fetch = realFetch;
  AbortSignal.timeout = realTimeout;
  rmSync(dir, { recursive: true, force: true });
}
