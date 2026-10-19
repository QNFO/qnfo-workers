// SUBSCRIBERS-ATTRIBUTION-CHAIN-1 offline test (agent_issues 2899, QNFO/qnfo-workers#2489): the subscriber attribution snapshot
// the Sunday 16:00Z cron writes into reach_signals. Runs against the REAL reach_signals DDL (copied from qnfo-audit
// sqlite_master, CHECK (quality IN ('human','bot','unknown')) included) in an in-memory sqlite.
// (1) the snapshot insert is accepted by the CHECK (the base worker wrote quality 'derived' and every insert was refused);
// (2) the DELETE and the INSERTs are one batch, so a failed insert keeps the previous snapshot;
// (3) the utm columns are ensured one ALTER at a time, also when only one of them is missing (half-migrated table);
// (4) two sources under one campaign sum into one row instead of colliding on the primary key;
// (5) the migration file opts in to apply-migrations (APPLY-BY, DB, Rollback headers).
// Run: node qnfo-subscribers/utm-schema.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(here, "worker.js")).href);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

const REACH_DDL = "CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT CHECK (quality IN ('human','bot','unknown')), collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric))";
const SUBS_BASE = "email TEXT PRIMARY KEY, status TEXT, source TEXT, unsub_token TEXT, created_at TEXT, updated_at TEXT, welcomed_at TEXT, ip_hash TEXT, user_agent TEXT, last_digest_at TEXT, confirmed_at TEXT";

// D1-shaped adapter over node:sqlite. batch() is atomic like D1's (BEGIN .. COMMIT, ROLLBACK on the first error).
function makeEnv(subsExtraCols, failOn) {
  const db = new DatabaseSync(":memory:");
  db.exec(REACH_DDL);
  db.exec("CREATE TABLE subscribers (" + SUBS_BASE + (subsExtraCols ? ", " + subsExtraCols : "") + ")");
  const errors = [];
  const origErr = console.error;
  const mk = (sql0) => {
    const order = [];
    const sql = sql0.replace(/\?(\d+)/g, (m, n) => { order.push(Number(n) - 1); return "?"; });
    let a = [];
    const st = {
      sql: sql0,
      bind: (...x) => { a = order.length ? order.map((i) => (x[i] === undefined ? null : x[i])) : x; return st; },
      exec: () => {
        if (failOn && failOn(sql0, a)) throw new Error("simulated insert failure");
        return db.prepare(sql).run(...a);
      },
      run: async () => { const r = st.exec(); return { meta: { changes: Number(r.changes) } }; },
      first: async () => db.prepare(sql).get(...a) || null,
      all: async () => ({ results: db.prepare(sql).all(...a) })
    };
    return st;
  };
  const AUDIT = {
    prepare: mk,
    batch: async (list) => {
      db.exec("BEGIN");
      try { for (const s of list) s.exec(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      return list.map(() => ({ success: true }));
    }
  };
  return { db, env: { AUDIT }, errors, origErr };
}
const cols = (db) => db.prepare("SELECT name FROM pragma_table_info('subscribers')").all().map((r) => r.name);
const snap = (db) => db.prepare("SELECT entity_id, value, quality FROM reach_signals WHERE source='subscriber-attribution' ORDER BY entity_id").all().map((r) => ({ ...r }));
const addSub = (db, email, status, src, camp) => db.prepare("INSERT INTO subscribers (email, status, utm_source, utm_campaign, confirmed_at) VALUES (?, ?, ?, ?, ?)").run(email, status, src, camp, status === "subscribed" ? "2026-10-19" : null);
const quiet = async (f) => { const o = console.error; console.error = () => {}; try { return await f(); } finally { console.error = o; } };

ok(typeof mod.writeSubscriberAttribution === "function" && typeof mod.ensureSubscriberUtm === "function", "worker exports writeSubscriberAttribution and ensureSubscriberUtm for tests");
const write = mod.writeSubscriberAttribution, ensure = mod.ensureSubscriberUtm;

// (1) fully migrated table: the snapshot lands and passes the live CHECK.
{
  const t = makeEnv("utm_source TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT ''");
  addSub(t.db, "a@x.edu", "subscribed", "digest", "digest-2026-10-18");
  addSub(t.db, "b@x.edu", "subscribed", "digest", "digest-2026-10-18");
  addSub(t.db, "c@x.edu", "pending", "digest", "never-confirmed");
  addSub(t.db, "d@x.edu", "subscribed", "", "");
  await quiet(() => write(t.env));
  const s = snap(t.db);
  ok(s.length === 1 && s[0].entity_id === "digest-2026-10-18" && s[0].value === 2, "snapshot has one row: 2 confirmed subscribers of the tagged campaign", s);
  ok(s.length === 1 && ["human", "bot", "unknown"].includes(s[0].quality), "snapshot quality is a value the live CHECK allows", s);
}

// (2) a failed insert keeps the previous snapshot (one batch: DELETE and INSERTs commit together).
{
  const t = makeEnv("utm_source TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT ''", (sql, a) => /INSERT INTO reach_signals/.test(sql) && a.includes("boom"));
  t.db.prepare("INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES ('2026-10-12','subscriber-attribution','email','campaign','old-campaign','subscribers_confirmed_attributed',7,'unknown')").run();
  addSub(t.db, "a@x.edu", "subscribed", "digest", "ok-campaign");
  addSub(t.db, "b@x.edu", "subscribed", "digest", "boom");
  await quiet(() => write(t.env));
  const s = snap(t.db);
  ok(s.length === 1 && s[0].entity_id === "old-campaign" && s[0].value === 7, "previous snapshot survives a failed insert", s);
}

// (3) half-migrated table: utm_source present, utm_campaign absent. The base ensure stopped at the first ALTER.
{
  const t = makeEnv("utm_source TEXT NOT NULL DEFAULT ''");
  await quiet(() => ensure(t.env));
  ok(cols(t.db).includes("utm_campaign") && cols(t.db).includes("utm_source"), "ensureSubscriberUtm adds the missing utm_campaign when utm_source already exists", cols(t.db));
}
// no utm column at all, and the cron path (writeSubscriberAttribution) heals the schema before it reads.
{
  const t = makeEnv("");
  await quiet(() => write(t.env));
  ok(cols(t.db).includes("utm_source") && cols(t.db).includes("utm_campaign"), "writeSubscriberAttribution ensures both utm columns before it reads", cols(t.db));
  const t2 = makeEnv("utm_source TEXT NOT NULL DEFAULT ''");
  await quiet(() => write(t2.env));
  ok(cols(t2.db).includes("utm_campaign"), "writeSubscriberAttribution heals a half-migrated table", cols(t2.db));
  addSub(t2.db, "a@x.edu", "subscribed", "digest", "late-campaign");
  await quiet(() => write(t2.env));
  ok(snap(t2.db).length === 1, "after healing, the next snapshot writes", snap(t2.db));
}
// the failure is logged with the real error and a failed ALTER is retried (the isolate guard is set only on success).
{
  let fails = 0;
  const t = makeEnv("", (sql) => { if (/ALTER TABLE subscribers ADD COLUMN utm_source/.test(sql) && fails < 1) { fails++; return true; } return false; });
  const logged = [];
  const o = console.error; console.error = (m) => logged.push(String(m));
  try { await ensure(t.env); await ensure(t.env); } finally { console.error = o; }
  ok(logged.some((l) => /simulated insert failure/.test(l)), "a real ALTER failure is logged with its message", logged);
  ok(cols(t.db).includes("utm_source") && cols(t.db).includes("utm_campaign"), "the next call retries after a real failure and both columns land", cols(t.db));
}

// (4) two sources under one campaign: one row per entity_id (primary key), values summed.
{
  const t = makeEnv("utm_source TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT ''");
  addSub(t.db, "a@x.edu", "subscribed", "digest", "spring");
  addSub(t.db, "b@x.edu", "subscribed", "bluesky", "spring");
  addSub(t.db, "c@x.edu", "subscribed", "bluesky", "");
  await quiet(() => write(t.env));
  const s = snap(t.db);
  ok(s.length === 2 && s.find((r) => r.entity_id === "spring").value === 2 && s.find((r) => r.entity_id === "bluesky").value === 1, "campaign with two sources sums into one row", s);
}

// (5) the migration opts in to apply-migrations.
{
  const m = readFileSync(join(here, "..", "migrations", "2026-10-18-subscribers-utm-attribution.sql"), "utf8");
  ok(/^-- APPLY-BY: ci\s*$/m.test(m), "migration declares APPLY-BY: ci");
  ok(/^-- DB: qnfo-audit\s*$/m.test(m), "migration declares DB: qnfo-audit");
  ok(/^-- Rollback: .*DROP COLUMN utm_campaign/m.test(m), "migration declares a Rollback line");
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE subscribers (" + SUBS_BASE + ")");
  db.exec(m);
  ok(cols(db).includes("utm_source") && cols(db).includes("utm_campaign"), "migration SQL adds both columns", cols(db));
}

console.log("utm-schema.test: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
