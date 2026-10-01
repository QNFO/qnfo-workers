// Offline test: the deploy_locks acquire SQL (extracted from worker.js) used for secrets:<worker> leases.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const m = src.match(/auditRun\(env, "(INSERT INTO deploy_locks[^"]+)"/);
assert.ok(m, "acquire SQL found");
assert.ok(src.includes('"/secret-lock/acquire"'), "secret-lock route present");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE deploy_locks (worker TEXT, token_hash TEXT, owner TEXT, actor TEXT, session_id TEXT, since INTEGER, expires_at INTEGER, expected_version TEXT)");
const sql = m[1].replace(/\?(\d)/g, "?$1");
function acquire(owner, token, now, ttlMs) {
  db.prepare("DELETE FROM deploy_locks WHERE expires_at <= ?").run(now); // reap, as the worker does
  return db.prepare(sql).run("secrets:OPS_ROUTER_AUTH_KEY", token, owner, owner, null, now, now + ttlMs, null).changes;
}
const T = 1_000_000;
// two concurrent writers at the same instant: exactly one wins
assert.equal(acquire("A", "ta", T, 60000) + acquire("B", "tb", T, 60000), 1);
assert.equal(db.prepare("SELECT COUNT(*) n FROM deploy_locks").get().n, 1);
// still held mid-lease
assert.equal(acquire("B", "tb", T + 30000, 60000), 0);
// dead session: lease expired, peer takes over
assert.equal(acquire("B", "tb", T + 61000, 60000), 1);
assert.equal(db.prepare("SELECT owner FROM deploy_locks").get().owner, "B");
console.log("secret-lock test OK");
