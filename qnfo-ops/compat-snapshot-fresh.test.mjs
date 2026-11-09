// COMPAT-SNAPSHOT-FRESH-1: the 6 h snapshot throttle is lifted by a compat-advancing deploy recorded after the newest snapshot.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const start = src.indexOf("async function compatSnapshot(");
assert.ok(start >= 0, "compatSnapshot found");
const rest = src.slice(start + 20);
const m = /\n(?:async )?function \w+\(/.exec(rest);
const fn = src.slice(start, start + 20 + (m ? m.index : rest.length));
function run(lastIso, advIso) {
  const fetched = [];
  const env = { CF_API_TOKEN: "x", QNFO_AUDIT: { prepare: (sql) => ({ first: async () => ({ t: /FROM worker_compat_state/.test(sql) ? lastIso : /FROM deployment_history/.test(sql) ? advIso : null }) }) } };
  const ctx = vm.createContext({ fetch: async (u) => { fetched.push(u); return { ok: false, status: 500, json: async () => null }; }, iso: () => "2026-11-09T09:00:00.000Z", Date, Promise, String, CF_ACCOUNT_ID: "acct", console });
  vm.runInContext(fn + "\nthis.f = compatSnapshot;", ctx);
  return ctx.f(env, {}).then((out) => ({ out, fetched }));
}
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
{ const r = await run(ago(1), null); assert.ok(r.out.skipped && r.fetched.length === 0, "fresh snapshot, no advance: skipped"); }
{ const r = await run(ago(2), ago(3)); assert.ok(r.out.skipped && r.fetched.length === 0, "an advance older than the snapshot does not lift the throttle"); }
{ const r = await run(ago(3), ago(1)); assert.ok(!r.out.skipped && r.fetched.length > 0, "an advance after the snapshot lifts the throttle"); }
{ const r = await run(ago(7), null); assert.ok(!r.out.skipped && r.fetched.length > 0, "a snapshot over 6 h old is refreshed"); }
console.log("compat-snapshot-fresh: passed");
