import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const original = readFileSync(new URL("./2026-10-29-finops-digest.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("./2026-10-30-finops-digest-upsert.sql", import.meta.url), "utf8");
const upsert = `INSERT INTO ai_spend_ledger (day, provider, caller, model, calls, usd, downgraded)
VALUES (?, 'workers-ai', ?, ?, ?, ?, ?)
ON CONFLICT(day, provider, caller, model) DO UPDATE SET calls = calls + excluded.calls, usd = usd + excluded.usd, downgraded = downgraded + excluded.downgraded`;
function world() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, PRIMARY KEY(day, provider, caller, model));
    CREATE TABLE agent_actions (target TEXT, ts TEXT);`);
  db.exec(original);
  return db;
}
const totals = (db, caller = "qnfo-ai") => ({ ...db.prepare("SELECT calls, usd, downgraded FROM finops_digest WHERE caller = ? AND week = strftime('%Y-W%W', '2026-10-30')").get(caller) });

test("reproduces the original outer UPSERT / trigger OR REPLACE conflict", () => {
  const db = world();
  try {
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 1, 0.1, 0);
    assert.throws(() => db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 1, 0.1, 0), /UNIQUE constraint failed: finops_digest/);
  } finally { db.close(); }
});

test("explicit trigger UPSERT handles existing calls, new model rows and new day rows", () => {
  const db = world();
  try {
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 1, 0.1, 0);
    db.exec(migration);
    db.exec(migration);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 2, 0.2, 1);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m2", 3, 0.3, 2);
    db.prepare(upsert).run("2026-10-29", "qnfo-ai", "m1", 4, 0.4, 1);
    const result = totals(db);
    assert.equal(result.calls, 10);
    assert.ok(Math.abs(result.usd - 1) < 1e-10);
    assert.equal(result.downgraded, 4);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM bak_20261030_finops_triggers").get().n, 2);
  } finally { db.close(); }
});

test("moving or deleting a ledger row reconciles old groups without corrupting other callers", () => {
  const db = world();
  try {
    db.exec(migration);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 2, 0.2, 1);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai-search", "m1", 3, 0.3, 0);
    db.exec("UPDATE ai_spend_ledger SET caller = 'qnfo-ai-moved', day = '2026-11-06' WHERE caller = 'qnfo-ai'");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM finops_digest WHERE caller = 'qnfo-ai' AND week = strftime('%Y-W%W', '2026-10-30')").get().n, 1, "the emptied group keeps one zero-valued row");
    assert.deepEqual(totals(db), { calls: 0, usd: 0, downgraded: 0 });
    assert.equal(db.prepare("SELECT calls FROM finops_digest WHERE caller = 'qnfo-ai-moved'").get().calls, 2);
    db.exec("DELETE FROM ai_spend_ledger WHERE caller = 'qnfo-ai-moved'");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM finops_digest WHERE caller = 'qnfo-ai-moved' AND week = strftime('%Y-W%W', '2026-11-06')").get().n, 1, "the group emptied by a delete keeps one zero-valued row");
    assert.equal(db.prepare("SELECT calls FROM finops_digest WHERE caller = 'qnfo-ai-moved'").get().calls, 0);
    assert.equal(totals(db, "qnfo-ai-search").calls, 3);
    assert.doesNotThrow(() => db.exec(migration.match(/^-- Rollback: (.+)$/m)[1]));
  } finally { db.close(); }
});

// FINOPS-DIGEST-ZERO-EMPTY-1 (review of #5366): the digest equals the ledger aggregate and a group the ledger no longer holds reads zero.
const zeroEmpty = () => readFileSync(new URL("./2026-10-30-finops-digest-zero-empty-groups.sql", import.meta.url), "utf8");
const groups = (rows) => new Map(rows.map((r) => [`${r.week}|${r.caller}`, { calls: r.calls, usd: r.usd, downgraded: r.downgraded }]));
function assertDigestMatchesLedger(db, step) {
  const want = groups(db.prepare("SELECT strftime('%Y-W%W', day) week, caller, SUM(calls) calls, SUM(usd) usd, SUM(downgraded) downgraded FROM ai_spend_ledger GROUP BY 1, 2").all());
  const got = groups(db.prepare("SELECT week, caller, calls, usd, downgraded FROM finops_digest").all());
  for (const [key, row] of got) {
    const live = want.get(key) ?? { calls: 0, usd: 0, downgraded: 0 };
    assert.equal(row.calls, live.calls, `${step}: calls of ${key}`);
    assert.ok(Math.abs(row.usd - live.usd) < 1e-9, `${step}: usd of ${key}`);
    assert.equal(row.downgraded, live.downgraded, `${step}: downgraded of ${key}`);
  }
  for (const key of want.keys()) assert.ok(got.has(key), `${step}: no digest row for ${key}`);
}
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("one statement that moves every row of a group leaves a zero row behind, totals the target group and spares other callers", () => {
  const db = world();
  try {
    db.exec(migration);
    for (const model of ["m1", "m2", "m3"]) db.prepare(upsert).run("2026-10-30", "qnfo-ai", model, 1, 0.1, 1);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai-b", "m9", 5, 0.5, 0);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai-search", "m1", 7, 0.7, 0);
    db.exec("UPDATE ai_spend_ledger SET caller = 'qnfo-ai-b' WHERE caller = 'qnfo-ai'");
    assert.deepEqual(totals(db), { calls: 0, usd: 0, downgraded: 0 });
    assert.equal(totals(db, "qnfo-ai-b").calls, 8);
    assert.equal(totals(db, "qnfo-ai-search").calls, 7);
    assertDigestMatchesLedger(db, "after the move");
    db.exec("DELETE FROM ai_spend_ledger WHERE caller = 'qnfo-ai-b'");
    assert.deepEqual(totals(db, "qnfo-ai-b"), { calls: 0, usd: 0, downgraded: 0 });
    assertDigestMatchesLedger(db, "after the delete");
  } finally { db.close(); }
});

test("the digest equals the ledger after random upserts, replaces, moves and deletes, with a zero row for every emptied group", () => {
  for (const seed of [1, 2, 3, 4]) {
    const db = world();
    try {
      db.exec(migration);
      const next = seeded(seed);
      const pick = (items) => items[Math.floor(next() * items.length)];
      const days = ["2026-10-26", "2026-10-30", "2026-11-02", "2026-11-06"];
      const callers = ["a", "b", "c"];
      const models = ["m1", "m2"];
      for (let step = 1; step <= 300; step++) {
        const [day, caller, model, other] = [pick(days), pick(callers), pick(models), pick(callers)];
        const op = pick([
          () => db.prepare(upsert).run(day, caller, model, 1 + Math.floor(next() * 5), next(), Math.floor(next() * 3)),
          () => db.prepare("INSERT OR REPLACE INTO ai_spend_ledger (day, provider, caller, model, calls, usd, downgraded) VALUES (?, 'workers-ai', ?, ?, 2, 0.5, 1)").run(day, caller, model),
          () => db.prepare("UPDATE ai_spend_ledger SET day = ?, caller = ? WHERE day = ? AND caller = ? AND model = ?").run(pick(days), other, day, caller, model),
          () => db.prepare("UPDATE ai_spend_ledger SET caller = ? WHERE caller = ?").run(other, caller),
          () => db.prepare("UPDATE ai_spend_ledger SET calls = calls + 1, usd = usd + 0.25 WHERE caller = ?").run(caller),
          () => db.prepare("DELETE FROM ai_spend_ledger WHERE day = ? AND caller = ? AND model = ?").run(day, caller, model),
          () => db.prepare("DELETE FROM ai_spend_ledger WHERE caller = ?").run(caller),
        ]);
        try { op(); } catch (e) {
          // A move onto an occupied key is refused whole, trigger writes included; a digest UNIQUE failure is the original defect and must surface.
          if (!/UNIQUE constraint failed: ai_spend_ledger\./.test(e.message)) throw e;
        }
        assertDigestMatchesLedger(db, `seed ${seed} step ${step}`);
      }
    } finally { db.close(); }
  }
});

test("a digest group the first triggers stranded is zeroed by the forward migration, which then changes nothing", () => {
  const db = world();
  try {
    const insert = db.prepare("INSERT INTO ai_spend_ledger (day, provider, caller, model, calls, usd, downgraded) VALUES (?, 'workers-ai', ?, ?, ?, ?, ?)");
    insert.run("2026-10-30", "qnfo-ai", "m1", 5, 0.5, 1);
    insert.run("2026-10-30", "qnfo-ai-search", "m1", 3, 0.3, 0);
    insert.run("2026-10-30", "qnfo-ai-live", "m1", 4, 0.4, 2);
    // 2026-10-29-finops-digest.sql recomputed only the NEW group and had no DELETE trigger, so a move or a delete stranded the old totals.
    db.exec("UPDATE ai_spend_ledger SET caller = 'qnfo-ai-moved' WHERE caller = 'qnfo-ai'");
    db.exec("DELETE FROM ai_spend_ledger WHERE caller = 'qnfo-ai-search'");
    db.exec(migration);
    assert.equal(totals(db).calls, 5, "the upsert migration backfills only groups that still hold ledger rows, so the moved-from group is still stale");
    assert.equal(totals(db, "qnfo-ai-search").calls, 3, "and so is the deleted group");
    db.exec(zeroEmpty());
    assert.deepEqual(totals(db), { calls: 0, usd: 0, downgraded: 0 });
    assert.deepEqual(totals(db, "qnfo-ai-search"), { calls: 0, usd: 0, downgraded: 0 });
    assert.equal(totals(db, "qnfo-ai-moved").calls, 5);
    assert.equal(totals(db, "qnfo-ai-live").calls, 4);
    assertDigestMatchesLedger(db, "after the forward migration");
    db.exec(zeroEmpty());
    assert.equal(db.prepare("SELECT changes() n").get().n, 0, "a second run rewrites no row");
    assertDigestMatchesLedger(db, "after the second run");
  } finally { db.close(); }
});
