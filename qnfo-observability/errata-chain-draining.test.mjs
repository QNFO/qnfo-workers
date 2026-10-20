// ERRATA-CHAIN-DRAINING-1 (qnfo-observability 1.5.2, agent_issues 2679) offline suite. No network.
// Proves: the errata chain reads `draining` (not `stuck`) when a backlog above its ceiling has a consumer that moved a row in the last 3 hours, and
// `stuck` only when nothing moved; the terminal statuses `rejected` and `no-paper` are not pending; a backlog at or under the ceiling is healthy; the
// chain definition carries the progress clause and the status list; VERSION is at least 1.5.2 (asserted by minimum, never exact).
// Run: node --no-warnings qnfo-observability/errata-chain-draining.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { assessIntegration as __assess, INTEGRATION_CHAINS as __chains, VERSION as __v };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

function mk() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE errata_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, created_at TEXT, updated_at TEXT)");
  const AUDIT = { prepare(sql) { let a = []; const s = { bind: (...x) => { a = x; return s; }, run: async () => { db.prepare(sql).run(...a); return {}; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return s; } };
  return { db, env: { AUDIT } };
}
// live shape: created_at and updated_at are SQLite datetime text; a consumer touch sets updated_at after created_at
const add = (db, status, n, created, updated) => { const st = db.prepare("INSERT INTO errata_queue (status, created_at, updated_at) VALUES (?, datetime('now', ?), datetime('now', ?))"); for (let i = 0; i < n; i++) st.run(status, created, updated); };
const errata = async (env) => { const realErr = console.error; console.error = () => {}; try { const s = await mod.__assess(env); return s.chains.find((c) => c.id === "errata"); } finally { console.error = realErr; } };

// A. a backlog of 30 internal-open rows created 10 hours ago; one row advanced 20 minutes ago -> draining
{
  const { db, env } = mk();
  add(db, "internal-open", 30, "-10 hours", "-10 hours");
  add(db, "implemented", 3, "-9 days", "-20 minutes"); // a consumer finished a row 20 minutes ago (updated after created)
  const c = await errata(env);
  ok(c && c.n === 30, "A1 the 30 internal-open rows are pending (implemented is not)", c && c.n);
  ok(c && c.status === "draining", "A2 a backlog above the ceiling with a consumer that moved a row 20 minutes ago reads draining", c);
  ok(c && /draining: 30 waiting above ceiling/.test(c.detail) && /advanced \d+m ago/.test(c.detail), "A3 the detail says how long ago the consumer advanced", c && c.detail);
}

// B. the same backlog with nothing updated in 4 hours -> stuck, and it says there was no progress
{
  const { db, env } = mk();
  add(db, "internal-open", 30, "-10 hours", "-10 hours");
  add(db, "implemented", 3, "-9 days", "-4 hours");
  const c = await errata(env);
  ok(c && c.status === "stuck", "B1 no row moved in 3 hours: stuck", c);
  ok(c && /no consumer progress in 3h/.test(c.detail), "B2 the detail names the missing progress", c && c.detail);
}

// C. a row that was only inserted (updated_at = created_at) is not progress
{
  const { db, env } = mk();
  add(db, "internal-open", 30, "-1 hours", "-1 hours");
  const c = await errata(env);
  ok(c && c.status === "stuck", "C1 a freshly queued row (updated_at equals created_at) is production, not consumption: stuck", c);
}

// D. rejected and no-paper are terminal, not pending
{
  const { db, env } = mk();
  add(db, "rejected", 4, "-14 hours", "-8 hours");
  add(db, "no-paper", 1, "-14 days", "-7 days");
  add(db, "internal-open", 2, "-1 hours", "-1 hours");
  const c = await errata(env);
  ok(c && c.n === 2, "D1 rejected (4) and no-paper (1) are not counted: 2 pending", c && c.n);
  ok(c && c.status === "healthy", "D2 two pending is under the ceiling: healthy", c);
  ok(c && (c.oldest_h == null || c.oldest_h < 24), "D3 the 14-day-old no-paper row no longer sets oldest_h", c && c.oldest_h);
}

// E. at the ceiling exactly (10) is healthy; one above it with progress is draining
{
  const { db, env } = mk();
  add(db, "internal-open", 10, "-2 hours", "-2 hours");
  const c = await errata(env);
  ok(c && c.n === 10 && c.status === "healthy", "E1 ten pending is the ceiling: healthy", c);
  add(db, "audited", 1, "-2 hours", "-2 hours");
  add(db, "implemented", 1, "-3 days", "-5 minutes");
  const d = await errata(env);
  ok(d && d.n === 11 && d.status === "draining", "E2 eleven pending with a consumer 5 minutes ago: draining", d);
}

// F. the chain definition and the version
{
  const def = mod.__chains.find((c) => c.id === "errata");
  ok(def && typeof def.progress === "string" && /MAX\(updated_at\)/.test(def.progress) && /updated_at > created_at/.test(def.progress) && def.progressWindowH === 3, "F1 the errata chain carries the progress clause and a 3 hour window", def && def.progress);
  ok(def && /'rejected'/.test(def.sql) && /'no-paper'/.test(def.sql), "F2 the pending predicate leaves out rejected and no-paper", def && def.sql);
  ok(def && def.max === 10 && def.expectEmpty === true, "F3 the ceiling (10) and expectEmpty are unchanged", def);
  const v = /^(\d+)\.(\d+)\.(\d+)/.exec(String(mod.__v));
  ok(v && (Number(v[1]) > 1 || (Number(v[1]) === 1 && (Number(v[2]) > 5 || (Number(v[2]) === 5 && Number(v[3]) >= 2)))), "F4 VERSION is at least 1.5.2 (by minimum)", mod.__v);
  const research = mod.__chains.find((c) => c.id === "research");
  ok(research && research.progressWindowH === 3 && /MAX\(ts\)/.test(research.progress), "F5 the research chain keeps its own progress clause (unchanged)");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
