// DISPATCH-LIVENESS-1 offline suite. No network, in-memory D1.
//
// The check exists because every fleet_cron is dispatched by the per-minute tick inside
// qnfo-code-orchestrator, and NEVER-STALL-1 -- the task that would report a stall -- is itself a
// fleet_cron dispatched by that tick. A dead dispatcher therefore kills its own watchdog. This
// worker runs on its own Cloudflare cron, so it can still notice. These cases pin that behaviour.
//
// Run: node qnfo-github-steward/dispatch-liveness.test.mjs   (exit 0 = all passed)
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " :: " + JSON.stringify(d).slice(0, 240) : "")); } };

// Load the worker as a module, exporting the function under test.
const tmp = join(mkdtempSync(join(tmpdir(), "dl-")), "w.mjs");
writeFileSync(tmp, readFileSync(join(here, "worker.js"), "utf8") + "\nexport { dispatchLiveness as __dl };\n");
const { __dl } = await import(pathToFileURL(tmp).href);

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, cron_expr TEXT, task_id TEXT, enabled INTEGER DEFAULT 1, last_fired TEXT)");
db.exec("CREATE TABLE fleet_issue_dispatch (fingerprint TEXT PRIMARY KEY, category TEXT, sev TEXT, owner TEXT, action TEXT, payload TEXT, gh_number TEXT, state TEXT, created_at TEXT, exec_state TEXT, exec_ts TEXT)");
const prep = (sql) => { let a = []; const st = { bind: (...x) => { a = x.map((v) => (v === undefined ? null : v)); return st; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; };
const env = { AUDIT: { prepare: prep } };
const ISO = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const rows = () => db.prepare("SELECT * FROM fleet_issue_dispatch").all();
const clear = () => db.exec("DELETE FROM fleet_crons; DELETE FROM fleet_issue_dispatch");

// 1. Healthy dispatcher: nothing filed.
clear();
db.prepare("INSERT INTO fleet_crons (name, enabled, last_fired) VALUES ('a', 1, ?)").run(ISO(2));
let r = { errors: [] };
await __dl(env, r);
ok(rows().length === 0, "healthy dispatcher files nothing", rows().length);
ok(r.dispatch_liveness && r.dispatch_liveness.stalled === false, "healthy reports stalled=false");
ok(r.errors.length === 0, "healthy run records no error");

// 2. Stalled dispatcher: exactly one critical row, queued for the mirror.
clear();
db.prepare("INSERT INTO fleet_crons (name, enabled, last_fired) VALUES ('a', 1, ?)").run(ISO(45));
r = { errors: [] };
await __dl(env, r);
let rs = rows();
ok(r.errors.length === 0, "the stalled run records no error", r.errors);
ok(rs.length === 1, "stalled dispatcher files one issue", rs.length);
ok(rs[0] && rs[0].state === "queued", "the filed row is queued so ISSUE-SYNC-1 mirrors it", rs[0] && rs[0].state);
ok(rs[0] && rs[0].sev === "critical", "severity is critical", rs[0] && rs[0].sev);
ok(rs[0] && rs[0].category === "liveness", "category is liveness", rs[0] && rs[0].category);
ok(r.dispatch_liveness && r.dispatch_liveness.stalled === true, "stalled reports stalled=true");
const payload = JSON.parse(rs[0].payload);
ok(payload.idle_min >= 44 && payload.idle_min <= 46, "payload carries the measured idle minutes", payload.idle_min);
ok(/per-minute tick/.test(payload.detail), "payload says where to look");

// 3. Idempotent: a second stalled run must not file again.
await __dl(env, r = { errors: [] });
ok(rows().length === 1, "a second stalled run does not duplicate the issue", rows().length);

// 4. Recovery before the mirror ran: the queued alarm is cancelled, not left to file late.
clear();
db.prepare("INSERT INTO fleet_crons (name, enabled, last_fired) VALUES ('a', 1, ?)").run(ISO(45));
await __dl(env, { errors: [] });
db.prepare("UPDATE fleet_crons SET last_fired = ?").run(ISO(1));
await __dl(env, { errors: [] });
rs = rows();
ok(rs.length === 1 && rs[0].state === "done", "a recovered, unmirrored alarm is cancelled", rs[0] && rs[0].state);

// 5. Recovery after the mirror created a GitHub issue: leave it to the normal close path.
clear();
db.prepare("INSERT INTO fleet_crons (name, enabled, last_fired) VALUES ('a', 1, ?)").run(ISO(45));
await __dl(env, { errors: [] });
db.prepare("UPDATE fleet_issue_dispatch SET state = 'tracked', gh_number = '4242'").run();
db.prepare("UPDATE fleet_crons SET last_fired = ?").run(ISO(1));
await __dl(env, { errors: [] });
rs = rows();
ok(rs.length === 1 && rs[0].state === "tracked", "a tracked alarm is not silently closed by this worker", rs[0] && rs[0].state);

// 6. No fleet_crons rows at all (fresh or broken D1) must be treated as stalled, never as healthy.
clear();
r = { errors: [] };
await __dl(env, r);
ok(rows().length === 1, "an empty fleet_crons table is a stall, not a pass", rows().length);

// 7. Disabled crons do not count as evidence of life.
clear();
db.prepare("INSERT INTO fleet_crons (name, enabled, last_fired) VALUES ('a', 0, ?)").run(ISO(1));
r = { errors: [] };
await __dl(env, r);
ok(rows().length === 1, "a disabled cron's timestamp is not liveness", rows().length);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
