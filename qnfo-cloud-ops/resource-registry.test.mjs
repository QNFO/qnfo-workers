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
test("CF-RESOURCE-USAGE-HONEST-1: a failed or empty usage read never yields 'unused'", () => {
  assert.match(job, /const workerUseOk = !errs\.some\(\(e\) => e\.startsWith\("worker-usage"\)\) && Object\.keys\(wuse\)\.length > 0/);
  assert.match(job, /const d1UseOk = !errs\.some\(\(e\) => e\.startsWith\("d1-usage"\)\) && Object\.keys\(d1use\)\.length > 0/);
  const w = job.slice(job.indexOf('} else if (it.t === "worker")'), job.indexOf("if (cost) usd += cost;"));
  assert.ok(w.indexOf("!workerUseOk") >= 0 && w.indexOf("!workerUseOk") < w.indexOf('verdict = "unused"'));
  const d = job.slice(job.indexOf('if (it.t === "d1")'), job.indexOf('} else if (it.t === "worker")'));
  assert.ok(d.indexOf("!d1UseOk") >= 0 && d.indexOf("!d1UseOk") < d.indexOf('verdict = "unused"'));
});
test("CF-RESOURCE-USAGE-HONEST-1: the issue probe names the registry row id and accepts resolved", () => {
  assert.match(job, /SELECT id,rtype,name,verdict/);
  assert.match(job, /verdict IN \('ok', 'resolved'\) THEN 'ok'/);
  assert.match(job, /WHERE id = '" \+ String\(f\.id\)/);
  assert.ok(!job.includes("'\" + f.rtype + \":\" + String(f.name)"), "probe must not rebuild the id from rtype:name (dangling rows are dangling:<type>:<name>)");
});
test("CF-RESOURCE-USAGE-HONEST-1: dangling rows resolve only after a complete binding scan; the upsert batch is not re-run", () => {
  assert.match(job, /if \(settingsFailed === 0\) dstmts\.push/);
  assert.ok(!/if \(missing\.size\) for \(let i = 0; i < stmts\.length/.test(job));
});
