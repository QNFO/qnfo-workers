// OUTREACH-CHAIN-DRAINED-1 (qnfo-observability 1.5.4, agent_issues 100487) offline suite. No network.
// Proves: a drained outreach queue (every row in a terminal status, none waiting) reads `healthy`, not `empty-match`, so the dashboard stops saying "0 of N rows matched the pending predicate ... verify
// the status enum"; a backlog above the ceiling (20 waiting) still reads `stuck`; a few waiting rows are healthy; the chain definition keeps its pending predicate (needs-contact included) and ceiling; the
// research chain keeps its empty-match guard (expectEmpty false); VERSION is at least 1.5.4 (asserted by minimum, never exact).
// Run: node --no-warnings qnfo-observability/outreach-chain-drained.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { assessIntegration as __assess, INTEGRATION_CHAINS as __chains, VERSION as __v };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

function mk() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE outreach_queue (id TEXT PRIMARY KEY, paper_id TEXT, author TEXT, email TEXT, reason TEXT, status TEXT, created_at TEXT, sent_at TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0)");
  const AUDIT = { prepare(sql) { let a = []; const s = { bind: (...x) => { a = x; return s; }, run: async () => { db.prepare(sql).run(...a); return {}; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return s; } };
  return { db, env: { AUDIT } };
}
let seq = 0;
const add = (db, status, n, created) => { const st = db.prepare("INSERT INTO outreach_queue (id, status, created_at) VALUES (?, ?, datetime('now', ?))"); for (let i = 0; i < n; i++) st.run("o" + (++seq), status, created); };
const outreach = async (env) => { const realErr = console.error; console.error = () => {}; try { const s = await mod.__assess(env); return s.chains.find((c) => c.id === "outreach"); } finally { console.error = realErr; } };

// A. the live shape of 2026-10-26: 193 rows, every one terminal (102 sent, 27 skipped, 26 skipped-no-email, 25 held-segment-stopped, 13 skipped-dup), none waiting
{
  const { db, env } = mk();
  add(db, "sent", 102, "-20 days"); add(db, "skipped", 27, "-40 days"); add(db, "skipped-no-email", 26, "-9 days"); add(db, "held-segment-stopped", 25, "-3 days"); add(db, "skipped-dup", 13, "-12 days");
  const c = await outreach(env);
  ok(c && c.total === 193 && c.n === 0, "A1 193 rows, none waiting", c);
  ok(c && c.status === "healthy", "A2 a drained queue reads healthy (it read empty-match before 1.5.4)", c);
  ok(c && !/verify the status enum/.test(c.detail), "A3 the detail no longer asks anyone to verify the status enum", c && c.detail);
}

// B. a backlog above the ceiling of 20 is still stuck (the chain has no progress clause)
{
  const { db, env } = mk();
  add(db, "sent", 40, "-20 days"); add(db, "needs-contact", 25, "-5 hours");
  const c = await outreach(env);
  ok(c && c.n === 25 && c.status === "stuck", "B1 25 needs-contact rows are above the ceiling: stuck", c);
}

// C. a few waiting rows (the radar-hub batch before the 09:00 job) are healthy, with the oldest age reported
{
  const { db, env } = mk();
  add(db, "sent", 40, "-20 days"); add(db, "needs-contact", 3, "-2 minutes"); add(db, "pending", 1, "-2 minutes"); add(db, "needs-email", 1, "-2 minutes");
  const c = await outreach(env);
  ok(c && c.n === 5 && c.status === "healthy", "C1 needs-contact, pending and needs-email all count as waiting: 5, healthy", c);
}

// D. the definition and the version
{
  const def = mod.__chains.find((c) => c.id === "outreach");
  ok(def && def.expectEmpty === true && def.max === 20 && def.minOk === null, "D1 expectEmpty true, ceiling 20 and no activity floor", def);
  ok(def && /'needs-contact'/.test(def.sql) && /'pending'/.test(def.sql) && /'needs-email'/.test(def.sql) && /'queued'/.test(def.sql), "D2 the pending predicate keeps all four waiting statuses", def && def.sql);
  const research = mod.__chains.find((c) => c.id === "research");
  ok(research && research.expectEmpty === false, "D3 the research chain keeps its empty-match guard (unchanged)", research && research.expectEmpty);
  const v = /^(\d+)\.(\d+)\.(\d+)/.exec(String(mod.__v));
  ok(v && (Number(v[1]) > 1 || (Number(v[1]) === 1 && (Number(v[2]) > 5 || (Number(v[2]) === 5 && Number(v[3]) >= 4)))), "D4 VERSION is at least 1.5.4 (by minimum)", mod.__v);
  ok(/OUTREACH-CHAIN-DRAINED-1/.test(src) && /fm-outreach-chain-enum/.test(src), "D5 the source names the change and the live enum-drift detector that replaces the guard for this chain");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
