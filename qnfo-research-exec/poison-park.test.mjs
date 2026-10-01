// Offline test (node:sqlite as D1 shim) for RESEARCH-POISON-PARK-1 (#1700).
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { markError, reclaimStaleResearching } from "./worker.js";

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT DEFAULT 'queued', stage TEXT, claimed_at TEXT, attempt INTEGER DEFAULT 0, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);`);
function stmt(sql) {
  let args = [];
  const o = { bind(...a) { args = a; return o; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; } };
  return o;
}
const env = { QNFO_AUDIT: { prepare: stmt } };
const get = (id) => db.prepare("SELECT * FROM research_queue WHERE id=?").get(id);
const old = "2020-01-01T00:00:00Z";

// 1. markError below the cap re-queues with recover_count+1
db.prepare("INSERT INTO research_queue (id,status,stage,recover_count) VALUES ('a','researching','revise',1)").run();
await markError(env, get("a"), "boom");
assert.equal(get("a").status, "queued"); assert.equal(get("a").recover_count, 2);

// 2. exhausted row is parked (not re-armed, not deleted), reason recorded, terminal_rearms untouched
db.prepare("INSERT INTO research_queue (id,status,stage,recover_count,terminal_rearms) VALUES ('b','researching','revise',3,0)").run();
await markError(env, get("b"), "revise: output too short");
let b = get("b");
assert.equal(b.status, "wontfix"); assert.equal(b.stage, "parked");
assert.match(b.error, /^PARKED-POISON-1: .*output too short/); assert.equal(b.recover_count, 3); assert.equal(b.terminal_rearms, 0);
assert.equal(db.prepare("SELECT count(*) n FROM cloud_ops_events WHERE kind='poison-park'").get().n, 1);

// 3. stale researching: exhausted row parked, healthy one requeued with counter bumped, fresh claim untouched
db.prepare("INSERT INTO research_queue (id,status,stage,claimed_at,recover_count) VALUES ('c','researching','revise',?,3),('d','researching','revise',?,0),('e','researching','revise',?,3)").run(old, old, new Date().toISOString());
const r = await reclaimStaleResearching(env);
assert.deepEqual(r, { parked: 1, requeued: 1 });
assert.equal(get("c").status, "wontfix"); assert.match(get("c").error, /PARKED-POISON-1/);
assert.equal(get("d").status, "queued"); assert.equal(get("d").recover_count, 1);
assert.equal(get("e").status, "researching");

// 4. a second reclaim pass is a no-op (parked rows never come back)
assert.deepEqual(await reclaimStaleResearching(env), { parked: 0, requeued: 0 });
assert.equal(db.prepare("SELECT count(*) n FROM research_queue").get().n, 5); // nothing deleted
console.log("poison-park tests passed");
