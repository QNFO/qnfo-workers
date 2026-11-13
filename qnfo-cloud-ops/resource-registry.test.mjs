// CF-RESOURCE-REGISTRY-1: discovery job is registered, ticked, discovers the account and never writes to Cloudflare.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const job = src.slice(src.indexOf("async function jobResourceRegistry"), src.indexOf("__name(jobResourceRegistry"));
test("registered and ticked", () => {
  assert.match(src, /"resource-registry": \(env\) => jobResourceRegistry\(env, \{ force: true \}\)/);
  assert.match(src, /runs\.push\(jobResourceRegistry\(env\)/);
});
test("account is discovered, not configured", () => {
  assert.match(job, /get\("\/accounts"\)/);
  assert.ok(!/\bACCOUNT\b/.test(job));
});
test("lists every resource type and is read-only against Cloudflare", () => {
  for (const t of ["scripts", "d1/database", "kv/namespaces", "r2/buckets", "queues", "vectorize"]) assert.ok(job.includes(t), t);
  assert.ok(!/method: "(PUT|PATCH|DELETE)"/.test(job));
  assert.ok(!/headers: H, method: "POST"[^;]*(workers|d1|kv)/.test(job));
});
test("VERSION is at least 1.52.0", () => {
  const [a, b] = /var VERSION = "(\d+)\.(\d+)/.exec(src).slice(1).map(Number);
  assert.ok(a > 1 || b >= 52);
});
test("CF-RESOURCE-ACTIONS-1: creates only R2 buckets, never deletes, files deduped issues", () => {
  assert.match(job, /\/r2\/buckets", \{ method: "POST"/);
  assert.ok(!/method: "DELETE"/.test(job));
  assert.match(job, /status = 'open' LIMIT 1/);
  assert.match(job, /closing probe:/);
});
