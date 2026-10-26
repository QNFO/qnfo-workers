// PARK-REARM-CAP-1 (qnfo-research-exec 0.36.6, agent_issues 100615 and 1000029). Offline: node:sqlite as D1.
// parkRearmTick counted a re-arm in research_queue.context.parkRearm, which the revise, review and verify stages rewrite without that key, so a row that parked again looked unrearmed:
// rem-rev-b9f3a431 was parked 15 times in 2880 minutes, each time "re-arm 1 of 1". The count is now research_queue.terminal_rearms (shared with PARKED-REGROUND-1): after TERMINAL_RECOVERY_MAX
// recoveries a row stays parked with its reason plus PARK-REARM-EXHAUSTED-1 and one park-rearm-exhausted event, and exhausted rows no longer fill the five-row window.
// Run: node --no-warnings qnfo-research-exec/park-rearm-cap.test.mjs
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parkRearmTick } from "./worker.js";

const here = dirname(fileURLToPath(import.meta.url));
function d1(db) {
  return { prepare(sql) {
    let args = [];
    const o = { bind(...a) { args = a; return o; },
      async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; } };
    return o;
  } };
}
function world() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT DEFAULT 'queued', stage TEXT, claimed_at TEXT, attempt INTEGER DEFAULT 0, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, context TEXT, created_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);`);
  return db;
}
const PARK_ERR = "REVIEW-UNRESOLVED-PARK-1: prior stage revise; revise: no applicable edit for 1 HARD fixes (H10) from two models, strict retry included (not advanced unrevised)";
let n = 0;
const park = (db, id, o = {}) => db.prepare("INSERT INTO research_queue (id, status, stage, error, terminal_rearms, context, created_at) VALUES (?, 'wontfix', 'parked', ?, ?, ?, ?)").run(id, o.error || PARK_ERR, o.rearms || 0, o.context || "{}", o.created || ("2026-10-2" + (n++ % 10) + "T00:00:00Z"));
const get = (db, id) => db.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);
const repark = (db, id) => db.prepare("UPDATE research_queue SET status = 'wontfix', stage = 'parked', error = ?, context = ? WHERE id = ?").run(PARK_ERR, JSON.stringify({ cycles: 0, patch: 0, verifyPass: 1 }), id);
const events = (db) => db.prepare("SELECT * FROM cloud_ops_events WHERE kind = 'park-rearm-exhausted'").all();

// ---- the livelock: a stage rewrites context without parkRearm and the row parks again ----
{
  const db = world(); const env = { QNFO_AUDIT: d1(db) };
  park(db, "rem-rev-b9f3a431");
  let r = await parkRearmTick(env);
  let row = get(db, "rem-rev-b9f3a431");
  assert.equal(r.rearmed, 1); assert.equal(row.status, "queued"); assert.equal(row.stage, "revise"); assert.equal(row.terminal_rearms, 1, "the first re-arm is counted in the durable column");
  assert.match(row.error, /^PARK-REARM-1 re-arm 1 of 2: REVIEW-UNRESOLVED-PARK-1/); assert.equal(JSON.parse(row.context).parkRearm, 1);
  repark(db, "rem-rev-b9f3a431");   // the revise stage rewrote context, dropping parkRearm, and parked the row again
  r = await parkRearmTick(env); row = get(db, "rem-rev-b9f3a431");
  assert.equal(r.rearmed, 1, "the second and last recovery is still given"); assert.equal(row.terminal_rearms, 2); assert.match(row.error, /re-arm 2 of 2/);
  repark(db, "rem-rev-b9f3a431");   // parked a third time
  r = await parkRearmTick(env); row = get(db, "rem-rev-b9f3a431");
  assert.equal(r.rearmed, 0, "a row with its recoveries spent is not re-armed again (the defect: it was re-armed every hour)");
  assert.equal(row.status, "wontfix"); assert.equal(row.stage, "parked"); assert.equal(row.terminal_rearms, 2);
  assert.match(row.error, /^REVIEW-UNRESOLVED-PARK-1: prior stage revise;.* \| PARK-REARM-EXHAUSTED-1: 2 automatic recoveries spent/, "the row keeps its reason and says why it stays parked");
  assert.equal(r.exhausted, 1); const ev = events(db); assert.equal(ev.length, 1, "one event per exhausted row"); assert.match(ev[0].text, /row=rem-rev-b9f3a431 parked for good after 2 automatic recoveries/); assert.equal(ev[0].status, "warn");
  r = await parkRearmTick(env); assert.equal(r.exhausted, 0); assert.equal(events(db).length, 1, "later sweeps neither re-mark nor re-log the row");
  for (let i = 0; i < 5; i++) await parkRearmTick(env);
  assert.equal(get(db, "rem-rev-b9f3a431").error.split("PARK-REARM-EXHAUSTED-1").length, 2, "the marker is appended once");
  assert.equal(get(db, "rem-rev-b9f3a431").terminal_rearms, 2, "spent rows are never counted up again");
}

// ---- exhausted rows do not starve the rows behind them (the window is five rows, oldest first) ----
{
  const db = world();
  for (let i = 0; i < 7; i++) park(db, "rem-old-" + i, { rearms: 2, created: "2026-09-0" + (i + 1) + "T00:00:00Z" });
  park(db, "rem-fresh", { created: "2026-10-25T00:00:00Z" });
  const r = await parkRearmTick({ QNFO_AUDIT: d1(db) });
  assert.equal(get(db, "rem-fresh").status, "queued", "a fresh row behind seven spent ones is re-armed in the same sweep");
  assert.equal(r.rearmed, 1); assert.equal(r.exhausted, 7, "all seven spent rows are marked once and logged"); assert.equal(events(db).length, 7);
  for (let i = 0; i < 7; i++) assert.equal(get(db, "rem-old-" + i).status, "wontfix");
}

// ---- the budget is shared with PARKED-REGROUND-1 ----
{
  const db = world(); const env = { QNFO_AUDIT: d1(db) };
  park(db, "11111111-aaaa-4000-8000-000000000001", { rearms: 1 });   // had one re-ground already
  await parkRearmTick(env);
  const row = get(db, "11111111-aaaa-4000-8000-000000000001");
  assert.ok(row.terminal_rearms >= 1 && row.terminal_rearms <= 2, "recoveries from both sweeps together never pass TERMINAL_RECOVERY_MAX: " + row.terminal_rearms);
}

// ---- untouched cases ----
{
  const db = world(); const env = { QNFO_AUDIT: d1(db) };
  park(db, "other-reason", { error: "PARKED-POISON-1: recover_count 3" });
  db.prepare("INSERT INTO research_queue (id, status, stage, error, terminal_rearms) VALUES ('live', 'queued', 'revise', ?, 0)").run(PARK_ERR);
  await parkRearmTick(env);
  assert.equal(get(db, "other-reason").status, "wontfix"); assert.equal(get(db, "other-reason").terminal_rearms, 0, "a park for another reason is not this sweep's");
  assert.equal(get(db, "live").terminal_rearms, 0, "a row that is not parked is not touched");
  assert.equal(events(db).length, 0);
  park(db, "off-row");
  db.prepare("INSERT INTO ops_config (key, value) VALUES ('park_rearm', 'off')").run();
  const off = await parkRearmTick(env);
  assert.equal(off.enabled, false); assert.equal(get(db, "off-row").status, "wontfix"); assert.equal(get(db, "off-row").terminal_rearms, 0, "park_rearm = off stops the sweep and the marking");
}

// ---- wiring ----
const src = readFileSync(join(here, "worker.js"), "utf8");
const ver = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
assert.ok(ver && Number(ver[1]) === 0 && (Number(ver[2]) > 36 || (Number(ver[2]) === 36 && Number(ver[3]) >= 7)), "VERSION is at least 0.36.7: " + (ver && ver[0]));
assert.equal(readFileSync(join(here, "deployed-current.worker.js"), "utf8"), src, "deployed-current.worker.js mirrors worker.js");
assert.ok(/var PARK_REARM_MAX = TERMINAL_RECOVERY_MAX;/.test(src), "the cap is the shared recovery budget");
console.log("park-rearm-cap: all assertions passed");
