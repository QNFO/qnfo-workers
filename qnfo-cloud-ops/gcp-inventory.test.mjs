// GCP-INVENTORY-1: the job is registered, wired into the tick, read-only, and keeps its secret out of events.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
test("job is registered and ticked", () => {
  assert.match(src, /"gcp-inventory": \(env\) => jobGcpInventory\(env, \{ force: true \}\)/);
  assert.match(src, /runs\.push\(jobGcpInventory\(env\)/);
});
test("VERSION is at least 1.42.0", () => {
  const [a, b] = /var VERSION = "(\d+)\.(\d+)/.exec(src).slice(1).map(Number);
  assert.ok(a > 1 || b >= 42);
});
test("read-only: only GET and the getIamPolicy POST, and the key is never recorded", () => {
  const job = src.slice(src.indexOf("async function jobGcpInventory"), src.indexOf("__name(jobGcpInventory"));
  assert.ok(!/:enable|:disable|setIamPolicy|DELETE|PATCH/.test(job));
  assert.ok(!/private_key/.test(job.replace(/!key\.private_key/g, "")));
});
