// ROADMAP-SELF-MAINTAIN-SPLIT-1 offline suite: replays the fleet_tasks / fleet_crons statements of migrations/2026-11-05-roadmap-self-maintain-split.sql on node:sqlite
// against a definition built from the step names of the original loop (migrations/2026-10-19-roadmap-self-maintain.sql). Output MUST contain "0 failed" on success.
// Proves: the four name lists cover every step of the original loop exactly once, the split keeps order and content, a replay changes nothing, the catch-up UPDATEs only close
// rows by the same predicates the loop uses, and the migration opts in with its header.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-11-05-roadmap-self-maintain-split.sql", import.meta.url), "utf8");
const original = readFileSync(new URL("./2026-10-19-roadmap-self-maintain.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: /m.test(sql) && /^-- BACKUP: /m.test(sql), "header opts in");
const originalNames = Array.from(original.matchAll(/"name":"([a-z-]+)"/g)).map((m) => m[1]);
ok(originalNames.length >= 20, "original loop step names found", originalNames.length);
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
const listed = (taskId) => {
  const s = stmts.find((x) => x.startsWith("INSERT OR IGNORE INTO fleet_tasks") && x.includes("'" + taskId + "'"));
  return s ? Array.from((s.match(/IN \(([^)]*)\)/) || [, ""])[1].matchAll(/'([a-z-]+)'/g)).map((m) => m[1]) : [];
};
const kept = (() => { const s = stmts.find((x) => x.startsWith("UPDATE fleet_tasks")); return s ? Array.from((s.match(/IN \(([^)]*)\)/) || [, ""])[1].matchAll(/'([a-z-]+)'/g)).map((m) => m[1]) : []; })();
const groups = { "roadmap-close-goals": listed("roadmap-close-goals"), "roadmap-close-rows": listed("roadmap-close-rows"), "roadmap-self-metrics": listed("roadmap-self-metrics"), "roadmap-self-maintain": kept };
const union = Object.values(groups).flat();
ok(union.length === originalNames.length && new Set(union).size === union.length, "every original step is in exactly one task", { union: union.length, original: originalNames.length });
ok(originalNames.every((n) => union.includes(n)), "no original step is dropped");
ok(groups["roadmap-self-metrics"].every((n) => /^metric-|^ledger$/.test(n)) && groups["roadmap-self-metrics"].length === 5, "metrics task holds the metric and ledger steps");
ok(groups["roadmap-close-rows"].every((n) => /^roadmap-/.test(n)) && groups["roadmap-close-rows"].length === 5, "rows task holds the roadmap- steps");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE fleet_tasks(id TEXT PRIMARY KEY,name TEXT,type TEXT,definition TEXT,timeout_ms INT,retries INT,version INT,enabled INT,updated_at TEXT);CREATE TABLE fleet_crons(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,cron_expr TEXT,task_id TEXT,enabled INT,timezone TEXT,next_fire TEXT,updated_at TEXT,last_fired TEXT);");
db.prepare("INSERT INTO fleet_tasks VALUES('roadmap-self-maintain','n','workflow',?,120000,1,2,1,'x')").run(JSON.stringify({ steps: originalNames.map((n) => ({ type: "sql", name: n, db: "AUDIT", sql: "SELECT 1" })) }));
const run = stmts.filter((x) => /^(INSERT OR IGNORE INTO fleet_(tasks|crons)|UPDATE fleet_tasks)/.test(x));
ok(run.length === 7, "three tasks, one update, three crons", run.length);
for (const s of run) db.exec(s);
const names = (id) => JSON.parse(db.prepare("SELECT definition d FROM fleet_tasks WHERE id=?").get(id).d).steps.map((s) => s.name);
const parts = ["roadmap-self-maintain", "roadmap-close-goals", "roadmap-close-rows", "roadmap-self-metrics"].map(names);
ok(parts.map((p) => p.length).join() === "8,4,5,5", "split 8/4/5/5", parts.map((p) => p.length));
ok(parts.flat().slice().sort().join() === originalNames.slice().sort().join(), "content kept");
const pos = (n) => originalNames.indexOf(n);
ok(parts.every((p) => p.every((n, i) => i === 0 || pos(p[i - 1]) < pos(n))), "order kept inside each task");
ok(db.prepare("SELECT COUNT(*) n FROM fleet_crons").get().n === 3, "three crons");
const mins = db.prepare("SELECT cron_expr e FROM fleet_crons").all().map((r) => r.e.split(" ")[0]);
ok(new Set(mins).size === 3 && !mins.includes("30"), "three distinct minutes, none on the original :30", mins);
for (const s of run) db.exec(s);
ok(names("roadmap-self-maintain").length === 8 && db.prepare("SELECT COUNT(*) n FROM fleet_crons").get().n === 3, "a replay changes nothing");
// The catch-up statements close rows only by the loop's own predicates, and never delete.
const updates = stmts.filter((x) => /^UPDATE roadmap_implementation/.test(x));
ok(updates.length === 3 && updates.every((u) => /SET status = 'verified'/.test(u) && /status (<>|NOT IN)/.test(u)), "three guarded catch-up updates", updates.length);
ok(updates.some((u) => /status IN \('completed', 'archived', 'retired'\)/.test(u)) && updates.some((u) => /s\.status = 'absent'/.test(u)), "project and detector predicates match the loop");
ok(!/\bDELETE\b|\bDROP\b/i.test(body), "no delete or drop in the body");
console.log(pass + " passed, " + fail + " failed");
