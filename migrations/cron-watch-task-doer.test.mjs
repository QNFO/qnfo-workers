// CRON-WATCH-TASK-DOER-1 offline suite (agent_issues 100154, ct_im100154): runs migrations/2026-10-19-cron-watch.sql, -cron-watch-2.sql and
// -cron-watch-task-doer.sql on SQLite, then the cron-watch workflow steps exactly as fleet-exec runs them (one statement per step, read from
// fleet_tasks). Proves: an escalated task-failed fault carries `code-task: repo=qnfo-workers path=migrations/<file>.sql`, the file chosen by
// name first (nearest in time when several match), by apply time against fleet_tasks.updated_at when no name matches, and with no line (the old
// text) when neither matches; a failed migration run is never chosen; the worker branch is unchanged; a fault is escalated once; a one-failure
// task and a schedule fault are not escalated; re-applying the file changes nothing; the stored step still runs against SQLite.
// Run: node --no-warnings migrations/cron-watch-task-doer.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const base = rd("./2026-10-19-cron-watch.sql") + "\n" + rd("./2026-10-19-cron-watch-2.sql");
const doer = rd("./2026-10-19-cron-watch-task-doer.sql");

// The table shapes the CRON-WATCH-1 suite already pins (one copy, read from it).
const ddlSrc = rd("./cron-watch.test.mjs");
const ds = ddlSrc.indexOf("db.exec(`") + "db.exec(`".length;
const ddl = ddlSrc.slice(ds, ddlSrc.indexOf("`);", ds));
ok(/CREATE TABLE fleet_tasks/.test(ddl) && /CREATE VIEW v_cron_health/.test(ddl), "table shapes read from cron-watch.test.mjs");

const db = new DatabaseSync(":memory:");
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().replace(/\.\d+Z$/, "Z");
const ms = (minAgo) => Math.floor((Date.now() - minAgo * 6e4) / 1000) * 1000;
const one = (q, ...a) => db.prepare(q).get(...a);
const all = (q, ...a) => db.prepare(q).all(...a);
db.exec(ddl);
db.exec("CREATE TABLE migration_runs (id INTEGER PRIMARY KEY, file TEXT NOT NULL, sha256 TEXT NOT NULL DEFAULT '', commit_sha TEXT, db TEXT, status TEXT NOT NULL, statements INTEGER, error TEXT, applied_by TEXT, applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))");

// Fleet state: workers, tasks, migrations.
db.prepare("INSERT INTO worker_schedules VALUES (?, ?, ?)").run("errs", JSON.stringify(["0 * * * *"]), iso(10));
db.prepare("INSERT INTO fleet_heartbeat VALUES ('errs', '1.0.0', ?, 1)").run(iso(3));
db.prepare("INSERT INTO worker_schedules VALUES (?, ?, ?)").run("fleet-exec", JSON.stringify(["*/5 * * * *"]), iso(10));
db.prepare("INSERT INTO fleet_heartbeat VALUES ('fleet-exec', '1.0.0', ?, 1)").run(iso(3));
db.prepare("INSERT INTO fleet_runs (task_id, status, started_at) VALUES ('other', 'ok', ?)").run(iso(1));
const log = db.prepare("INSERT INTO cron_fire_log (cron_name, task_id, cron_expr, fired_at, fired_epoch_ms, outcome, source, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
log.run("errs|0 * * * *", "errs", "0 * * * *", iso(200), ms(200), "ok", "worker:errs", "tick");
for (const m of [150, 90, 30]) log.run("errs|0 4 * * *", "errs", "0 4 * * *", iso(m), ms(m), "error", "worker:errs", "retry: boom " + m);
log.run("errs|0 * * * *", "errs", "0 * * * *", iso(29), ms(29), "ok", "worker:errs", "tick");

const ft = db.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, enabled, updated_at) VALUES (?, ?, 'workflow', '{\"steps\": []}', 2, 1, ?)");
ft.run("task-by-name", "defined by a named migration", "2026-10-19 12:26:18");
ft.run("task-by-time", "defined by a migration whose name does not carry the id", "2026-10-19 11:00:00");
ft.run("task-no-file", "no migration matches", "2026-01-01 00:00:00");
ft.run("task-once-failed", "only one failure", "2026-10-19 12:26:18");
ft.run("task-iso-time", "updated_at in ISO form", "2026-10-19T09:00:00Z");
const mr = db.prepare("INSERT INTO migration_runs (file, status, applied_at) VALUES (?, ?, ?)");
mr.run("migrations/2026-10-18-task-by-name.sql", "ok", "2026-10-18T09:00:00Z");          // name matches, a day older
mr.run("migrations/2026-10-19-task-by-name-2.sql", "ok", "2026-10-19T12:26:21Z");        // name matches, 3 s after the write: chosen
mr.run("migrations/2026-10-19-task-by-name-3.sql", "failed", "2026-10-19T12:26:19Z");    // a failed run is never chosen
mr.run("migrations/2026-10-19-batch-a.sql", "ok", "2026-10-19T11:00:05Z");               // no name, 5 s after task-by-time
mr.run("migrations/2026-10-19-decoy-late.sql", "ok", "2026-10-19T11:30:00Z");            // 30 min after: outside the window
mr.run("migrations/2026-10-19-iso-batch.sql", "ok", "2026-10-19T09:00:04Z");             // 4 s after task-iso-time
mr.run("scripts/not-a-migration.sql", "ok", "2026-10-19T11:00:06Z");                      // not under migrations/

db.exec(base);
// Before the new migration: the escalate step has no migration branch.
const defBefore = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'cron-watch'").definition);
ok(defBefore.steps[6].name === "escalate" && !/path=migrations\//.test(defBefore.steps[6].sql), "before: the escalate step carries no migration line");
const versionBefore = one("SELECT version FROM fleet_tasks WHERE id = 'cron-watch'").version;
db.exec(doer);
const defAfter = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'cron-watch'").definition);
ok(defAfter.steps.length === defBefore.steps.length && defAfter.steps.every((s, i) => i === 6 || s.sql === defBefore.steps[i].sql), "only step 7 changed");
ok(defAfter.steps[6].name === "escalate" && defAfter.steps[6].type === "sql" && defAfter.steps[6].db === "AUDIT", "step 7 is still the escalate sql step");
ok(/code-task: repo=qnfo-workers path=migrations\//.test(JSON.stringify(defAfter)) && one("SELECT instr(definition, 'path=migrations/') > 0 AS h FROM fleet_tasks WHERE id = 'cron-watch'").h === 1, "the stored definition contains the issue's probe text");
ok(one("SELECT version FROM fleet_tasks WHERE id = 'cron-watch'").version === versionBefore + 1, "the task version moves up by one");
ok(one("SELECT COUNT(*) AS n FROM bak_20261019_cron_watch_escalate").n === 1 && !/path=migrations\//.test(one("SELECT definition FROM bak_20261019_cron_watch_escalate").definition), "the backup holds the old definition");
ok(one("SELECT COUNT(*) AS n FROM decision_log WHERE capability_gain = 'cron-task-fault-code-line'").n === 1, "one decision_log row");

// Failures: three in a row for the escalated tasks, one for task-once-failed.
const fr = db.prepare("INSERT INTO fleet_runs (task_id, status, started_at, error) VALUES (?, 'failed', ?, 'D1_ERROR: boom')");
for (const t of ["task-by-name", "task-by-time", "task-no-file", "task-iso-time"]) for (let i = 0; i < 3; i++) fr.run(t, iso(0));
fr.run("task-once-failed", iso(0));
fr.run("task-unknown-row", iso(0)); fr.run("task-unknown-row", iso(0)); fr.run("task-unknown-row", iso(0)); // a fleet_runs task that has no fleet_tasks row

const run = () => { for (const s of defAfter.steps) { try { db.prepare(s.sql).all(); } catch (e) { ok(false, "step " + s.name + " runs", String(e.message)); } } };
run();
db.exec("UPDATE cron_fault_seen SET first_seen = '" + iso(10) + "'");
run();
const issues = () => Object.fromEntries(all("SELECT * FROM agent_issues").map((r) => [r.title.slice(14), r]));
const is = issues();
const line = (k) => { const m = /code-task: repo=qnfo-workers path=(\S+)/.exec((is[k] || {}).description || ""); return m ? m[1] : null; };

ok(line("task-failed:task-by-name") === "migrations/2026-10-19-task-by-name-2.sql", "name match: the nearest applied file whose name carries the task id", line("task-failed:task-by-name"));
ok(line("task-failed:task-by-time") === "migrations/2026-10-19-batch-a.sql", "no name match: the file applied within the window after the write", line("task-failed:task-by-time"));
ok(line("task-failed:task-iso-time") === "migrations/2026-10-19-iso-batch.sql", "an ISO updated_at is read the same way", line("task-failed:task-iso-time"));
ok(line("task-failed:task-no-file") === null && /fix it by migration/.test(is["task-failed:task-no-file"].description) && /No applied migration file matches/.test(is["task-failed:task-no-file"].description), "no match: the old text, no invented path");
ok(line("task-failed:task-unknown-row") === null && /fix it by migration/.test(is["task-failed:task-unknown-row"].description), "a task with no fleet_tasks row gets the old text");
ok(is["task-failed:task-by-name"].priority === "high" && is["task-failed:task-by-time"].priority === "high" && is["task-failed:task-no-file"].priority === "high", "escalated issues are high");
ok(is["task-failed:task-once-failed"].priority === "medium" && !/ESCALATED|code-task:/.test(is["task-failed:task-once-failed"].description), "one failure is not escalated and carries no line");
ok(is["task-failed:task-by-name"].description.includes("(CRON-WATCH-TASK-DOER-1)"), "the escalation names the rule");
const lines = Object.values(is).flatMap((i) => (i.description || "").match(/code-task: repo=\S+ path=\S+/g) || []);
ok(lines.every((l) => /^code-task: repo=qnfo-workers path=(migrations\/[A-Za-z0-9._-]+\.sql|errs\/worker\.js)$/.test(l)), "every emitted line is a plain repo path", lines);
ok(!/failed|decoy|scripts\//.test(String(line("task-failed:task-by-name")) + String(line("task-failed:task-by-time"))), "a failed run, a late decoy and a non-migration file are never chosen");

// The worker branch is unchanged.
const wk = is["worker-error:errs|0 4 * * *"];
ok(wk && wk.priority === "high" && /code-task: repo=qnfo-workers path=errs\/worker\.js/.test(wk.description) && !/path=migrations\//.test(wk.description), "a worker fault still gets its worker.js line", wk && wk.description);

// A schedule fault (not a task) is never given a migration line.
ok(!Object.values(is).some((i) => /^CRON-FAULT-1: (schedule|worker-silent|heartbeat)/.test(i.title) && /path=migrations\//.test(i.description || "")), "no non-task fault gets a migration line");

// Once only: a second run adds nothing.
const snap = JSON.stringify(Object.values(issues()).map((i) => [i.id, i.description]));
run();
ok(JSON.stringify(Object.values(issues()).map((i) => [i.id, i.description])) === snap, "a second run changes no description");
ok(all("SELECT fault_key FROM cron_watch_actions WHERE action = 'escalated' AND fault_key LIKE 'task-failed:%'").length === 5, "each escalation is logged once", all("SELECT fault_key FROM cron_watch_actions WHERE action = 'escalated'"));

// Re-apply: nothing moves.
db.exec(doer);
ok(one("SELECT version FROM fleet_tasks WHERE id = 'cron-watch'").version === versionBefore + 1, "re-applying keeps the version");
ok(one("SELECT COUNT(*) AS n FROM decision_log WHERE capability_gain = 'cron-task-fault-code-line'").n === 1, "re-applying adds no decision_log row");
ok(one("SELECT COUNT(*) AS n FROM bak_20261019_cron_watch_escalate").n === 1, "re-applying keeps one backup row");

// Header contract (MIGRATION-RUNNER-1).
ok(/^-- APPLY-BY: ci$/m.test(doer) && /^-- DB: qnfo-audit$/m.test(doer) && /^-- Rollback: .+/m.test(doer) && /^-- BACKUP: bak_20261019_cron_watch_escalate$/m.test(doer), "the file opts in with APPLY-BY, DB, Rollback and BACKUP");
ok(!/claude\.ai|anthropic\.com/.test(doer), "no claude.ai link");

// Rollback restores the old step.
const rb = /^-- Rollback: (.+)$/m.exec(doer)[1];
db.exec(rb);
ok(!/path=migrations\//.test(one("SELECT definition FROM fleet_tasks WHERE id = 'cron-watch'").definition) && one("SELECT COUNT(*) AS n FROM decision_log WHERE capability_gain = 'cron-task-fault-code-line'").n === 0, "the Rollback line restores the old definition and removes the decision row");

console.log(`cron-watch-task-doer: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
