// ERRATA-CHAIN-DISPATCH-1: a binding-only HTTP kick is durable, coalesced and consumed by the cron.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(source + "\nexport { runErrataMember, errataMod };\n").toString("base64"));
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT)");
const audit = { prepare(sql) {
  let args = [];
  const stmt = {
    bind(...values) { args = values; return stmt; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { return db.prepare(sql).run(...args); }
  };
  return stmt;
} };
const env = { QNFO_AUDIT: audit, LIVING_PAPER: {} };
const props = { caller: "qnfo-fleet-dashboard", member: "errata-hub" };
const pending = () => db.prepare("SELECT COUNT(*) n FROM ops_config").get().n;
const request = (method = "POST", headers) => new Request("https://research.qnfo.org/run/errata-respond", { method, headers });
const tick = (minute) => ({ scheduledTime: Date.UTC(2026, 9, 30, 10, minute) });

for (const ctx of [{}, { props: { caller: "evil", member: "errata-hub" } }, { props: { caller: "qnfo-fleet-dashboard" } }]) {
  const res = await mod.default.fetch(request("POST", { "X-Erratta-Token": "spoofed" }), env, ctx);
  assert.equal(res.status, 404, "public requests and untrusted props cannot enqueue work");
}
assert.equal(pending(), 0);
assert.equal((await mod.default.fetch(request("GET"), env, { props })).status, 405);
for (let i = 0; i < 2; i++) {
  const res = await mod.default.fetch(request(), env, { props });
  assert.equal(res.status, 202);
  assert.equal((await res.json()).queued, true);
}
assert.equal(pending(), 1, "repeated dispatches coalesce without running a model in HTTP");
const calls = [];
mod.errataMod.scheduled = async (event, mapped, ctx) => {
  assert.equal(mapped.WATCH_DB, audit);
  assert.equal(mapped.PAPERS_DB, env.LIVING_PAPER);
  calls.push(event.cron);
  ctx.waitUntil(Promise.resolve().then(() => calls.push("finished")));
};
assert.equal(await mod.runErrataMember(tick(0), env), "0 * * * *");
assert.equal(pending(), 1, "watch is not displaced by a consumer kick");
assert.equal(await mod.runErrataMember(tick(10), env), "15 * * * *");
assert.equal(pending(), 0);
assert.deepEqual(calls, ["0 * * * *", "finished", "15 * * * *", "finished"]);
assert.equal(await mod.runErrataMember(tick(50), env), null, "consumed kick is not replayed");
assert.equal(await mod.runErrataMember(tick(30), env), "30 * * * *", "publish keeps its existing gated cron");
await mod.default.fetch(request(), env, { props });
mod.errataMod.scheduled = async () => { throw new Error("consumer failed"); };
await assert.rejects(mod.runErrataMember(tick(40), env), /consumer failed/);
assert.equal(pending(), 1, "a failed consumer restores the coalesced request");
mod.errataMod.scheduled = async (_event, _mapped, ctx) => {
  const failure = Promise.reject(new Error("background failed"));
  failure.catch(() => {});
  ctx.waitUntil(failure);
};
await assert.rejects(mod.runErrataMember(tick(50), env), /background failed/);
assert.equal(pending(), 1, "a failed waitUntil task also restores the request");
db.close();
console.log("ERRATA-CHAIN-DISPATCH-1: private admission, durable coalescing, cron consumption and publish scheduling passed");
