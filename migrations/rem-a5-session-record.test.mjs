// REM-A5-SESSION-RECORD-1 offline suite: replays migrations/2026-10-26-rem-a5-session-record.sql on node:sqlite against the live session_records layout.
// Proves: the header opts in (the DELETE sits in the Rollback header only); one row is written, keyed by its session id and written once (a replay changes nothing and an existing row of that id is kept);
// execution_ratio is completed_tasks / total_tasks to two places; the summary names what was done and what was not; the record carries every PR it lists and no secret or claude.ai link; Rollback removes it.
// Output MUST contain "0 failed" on success.   node migrations/rem-a5-session-record.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sql = readFileSync(new URL("migrations/2026-10-26-rem-a5-session-record.sql", root), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "the body deletes and drops nothing");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9]{16,})/.test(sql), "no claude.ai link and no secret value");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE session_records (
        session_id TEXT PRIMARY KEY,
        wbs_code TEXT NOT NULL,
        agent_name TEXT,
        summary TEXT NOT NULL,
        decisions_made TEXT,
        files_changed TEXT,
        commits TEXT,
        infrastructure_changes TEXT,
        handoff_notes TEXT,
        execution_ratio REAL,
        total_tasks INTEGER,
        completed_tasks INTEGER,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  return w;
}
const w = world();
w.exec(sql);
const r = w.prepare("SELECT * FROM session_records").all();
ok(r.length === 1 && r[0].session_id === "session-rem-a5-metric-triggers" && r[0].wbs_code === "QNFO.OPS", "one row, keyed by the session id", r.map((x) => x.session_id));
const x = r[0];
ok(x.total_tasks === 16 && x.completed_tasks === 11 && Math.abs(x.execution_ratio - Math.round(100 * x.completed_tasks / x.total_tasks) / 100) < 1e-9, "execution_ratio is completed over total to two places (11 of 16 = 0.69)", { t: x.total_tasks, c: x.completed_tasks, r: x.execution_ratio });
ok(x.started_at < x.completed_at && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(x.started_at) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(x.completed_at), "started_at is before completed_at, both ISO UTC", { s: x.started_at, c: x.completed_at });
ok(/Not done:/.test(x.summary) && /Nothing was closed by this session/.test(x.summary) && /Open and why:/.test(x.handoff_notes), "the summary says what was not done and the hand-off names the open items and why");
for (const pr of ["4800", "4828", "4833", "4840", "4846", "4857", "4866"]) ok(x.commits.includes(pr), "the commits field lists PR " + pr);
ok(/unbind-service/.test(x.infrastructure_changes) && /delete-worker/.test(x.infrastructure_changes) && /40383849057/.test(x.infrastructure_changes) && /40384144124/.test(x.infrastructure_changes), "the infrastructure change names both cf-ops-actions runs");
{ const s1 = JSON.stringify(w.prepare("SELECT * FROM session_records").all()); w.exec(sql); ok(JSON.stringify(w.prepare("SELECT * FROM session_records").all()) === s1, "a second apply changes nothing"); }
{
  const k = world();
  k.prepare("INSERT INTO session_records (session_id, wbs_code, summary, started_at) VALUES ('session-rem-a5-metric-triggers', 'X', 'written first', '2026-10-26T00:00:00Z')").run();
  k.exec(sql);
  ok(k.prepare("SELECT summary s FROM session_records").get().s === "written first", "an existing row of that id is never overwritten");
}
{
  const d = world();
  d.exec(sql);
  d.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(d.prepare("SELECT COUNT(*) n FROM session_records").get().n === 0, "Rollback removes the row");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
