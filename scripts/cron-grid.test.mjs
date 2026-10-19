// CRON-GRID-1 (owner directive 2026-10-19): the helper block inlined in each scheduled worker is the same text everywhere and in
// each deployed-current mirror, and it behaves: a job runs on the first grid tick after its slot (with the tick's lag), a failed
// job retries on later ticks at most CRON_GRID_RETRIES times in a row, a job marked retry false never retries, Cloudflare weekday
// numbering (1 = Sunday) holds, every run is one cron_fire_log row (ok, error, idle), an error is rethrown after it is logged,
// and a trigger that is not the tick runs the worker once. The workers' wrangler crons repeat at least hourly on 5-minute minutes.
// Run: node scripts/cron-grid.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const BEGIN = "// ---- CRON-GRID-1:BEGIN", END = "// ---- CRON-GRID-1:END ----";
const block = (text) => { const i = text.indexOf(BEGIN), j = text.indexOf(END); return i < 0 || j < i ? null : text.slice(i, j + END.length); };
const users = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(root, d.name, "worker.js")))
  .map((d) => d.name).filter((w) => readFileSync(join(root, w, "worker.js"), "utf8").includes(BEGIN));
ok(users.length >= 9, "the helper is inlined in the grid workers", users);
const ref = block(readFileSync(join(root, "q08-signal-engine", "worker.js"), "utf8"));
for (const w of users) {
  const src = readFileSync(join(root, w, "worker.js"), "utf8");
  ok(block(src) === ref, w + ": the helper block matches q08-signal-engine's");
  const mirror = join(root, w, "deployed-current.worker.js");
  if (existsSync(mirror)) ok(readFileSync(mirror, "utf8") === src, w + ": deployed-current mirror is identical");
  ok(/CRON_GRID_CFG\s*=/.test(src) && /cronGridRun\(/.test(src), w + ": declares CRON_GRID_CFG and calls cronGridRun");
  const toml = readFileSync(join(root, w, "wrangler.toml"), "utf8");
  const m = /^\s*crons\s*=\s*(\[[^\]]*\])/m.exec(toml);
  const crons = m ? JSON.parse(m[1]) : [];
  ok(crons.length > 0 && crons.every((c) => { const f = c.split(" "); return f.slice(1).join(" ") === "* * * *" && f[0].split(",").every((p) => /^\*\/(5|10|15|20|30)$/.test(p) || (/^\d+$/.test(p) && +p % 5 === 0)); }),
    w + ": every trigger repeats at least hourly on a 5-minute minute", crons);
}
const H = new Function(ref + "\nreturn { CRON_GRID_RETRIES, cronGridMatch, cronGridSlot, cronGridDue, cronGridRun };")();
// D1 stand-in on SQLite (?N parameters are SQLite syntax too).
const sq = new DatabaseSync(":memory:");
sq.exec("CREATE TABLE cron_fire_log (id INTEGER PRIMARY KEY AUTOINCREMENT, cron_name TEXT NOT NULL, task_id TEXT, cron_expr TEXT, fired_at TEXT, fired_epoch_ms INTEGER NOT NULL, outcome TEXT, source TEXT, note TEXT)");
const db = { prepare: (s) => ({ bind: (...a) => ({ run: async () => sq.prepare(s).run(...a), first: async () => sq.prepare(s).get(...a) }) }) };
const rows = (w) => sq.prepare("SELECT cron_expr, outcome, note FROM cron_fire_log WHERE task_id = ? ORDER BY id").all(w);
const at = (d, h, mi) => Date.UTC(2026, 9, d, h, mi);
// matcher
ok(H.cronGridMatch("30 3 * * 1", new Date(at(18, 3, 30))) && !H.cronGridMatch("30 3 * * 1", new Date(at(19, 3, 30))), "weekday 1 is Sunday (2026-10-18)");
ok(H.cronGridMatch("17 */6 * * *", new Date(at(19, 12, 17))) && !H.cronGridMatch("17 */6 * * *", new Date(at(19, 13, 17))), "*/6 hours");
ok(H.cronGridMatch("0 4 1 * *", new Date(at(1, 4, 0))) && !H.cronGridMatch("0 4 1 * *", new Date(at(2, 4, 0))), "day of month");
ok(H.cronGridMatch("5,15,25,35,45,55 * * * *", new Date(at(19, 10, 25))) && !H.cronGridMatch("5,15,25,35,45,55 * * * *", new Date(at(19, 10, 20))), "minute list");
ok(H.cronGridSlot("0 17 * * *", at(19, 16, 0), at(19, 17, 0)) && !H.cronGridSlot("0 17 * * *", at(19, 17, 0), at(19, 18, 0)), "slot window is (since, until]");
// runs
const calls = [];
const runner = (fails) => async (ev, ctx) => { calls.push(ev.cron); ctx.waitUntil(Promise.resolve()); if (fails.has(ev.cron)) throw new Error("boom " + ev.cron); };
const cfg = { worker: "w1", tick: "0 * * * *", tickMin: 60, lagMin: 0, jobs: [{ cron: "0 17 * * *", periodMin: 1440, retry: true }, { cron: "0 7 * * *", periodMin: 1440, retry: false }], own: "self" };
const tick = (ms) => ({ cron: "0 * * * *", scheduledTime: ms, type: "scheduled" });
await H.cronGridRun(db, tick(at(19, 16, 0)), null, cfg, runner(new Set()));
ok(JSON.stringify(calls) === JSON.stringify(["0 * * * *"]) && rows("w1").length === 1 && rows("w1")[0].outcome === "ok", "a tick with no slot and no history runs only the worker's own tick", rows("w1"));
calls.length = 0;
let threw = null;
try { await H.cronGridRun(db, tick(at(19, 17, 0)), null, cfg, runner(new Set(["0 17 * * *", "0 7 * * *"]))); } catch (e) { threw = e; }
ok(threw && /boom 0 17/.test(threw.message) && calls[0] === "0 17 * * *" && calls[1] === "0 * * * *", "the slot job runs, fails, the tick still runs, the error is rethrown", calls);
ok(rows("w1").filter((r) => r.cron_expr === "0 17 * * *" && r.outcome === "error").length === 1, "the failure is logged as error");
for (const h of [18, 19, 20, 21]) { calls.length = 0; try { await H.cronGridRun(db, tick(at(19, h, 0)), null, cfg, runner(new Set(["0 17 * * *"]))); } catch (e) { /* counted below */ } }
ok(rows("w1").filter((r) => r.cron_expr === "0 17 * * *" && r.outcome === "error").length === H.CRON_GRID_RETRIES, "retries stop after " + H.CRON_GRID_RETRIES + " errors in a row", rows("w1").filter((r) => r.cron_expr === "0 17 * * *"));
ok(!calls.includes("0 17 * * *"), "no fourth attempt");
sq.exec("DELETE FROM cron_fire_log");
await H.cronGridRun(db, tick(at(19, 17, 0)), null, cfg, runner(new Set()));
calls.length = 0;
await H.cronGridRun(db, tick(at(19, 18, 0)), null, cfg, runner(new Set()));
ok(!calls.includes("0 17 * * *"), "a job whose last good run is within its period is not retried");
calls.length = 0;
try { await H.cronGridRun(db, tick(at(19, 7, 0)), null, cfg, runner(new Set(["0 7 * * *"]))); } catch (e) { /* expected */ }
calls.length = 0;
await H.cronGridRun(db, tick(at(19, 8, 0)), null, cfg, runner(new Set()));
ok(!calls.includes("0 7 * * *"), "a job marked retry false is never retried");
// lag, own none, idle, ownWhenDue false, non-tick trigger
const fc = { worker: "w2", tick: "*/5 * * * *", tickMin: 5, lagMin: 5, jobs: [{ cron: "0 3 * * *", periodMin: 1440, retry: true }], own: "none" };
calls.length = 0;
await H.cronGridRun(db, { cron: "*/5 * * * *", scheduledTime: at(19, 3, 0) }, null, fc, runner(new Set()));
ok(calls.length === 0 && rows("w2").length === 1 && rows("w2")[0].outcome === "idle", "own none: an idle tick is logged idle", rows("w2"));
await H.cronGridRun(db, { cron: "*/5 * * * *", scheduledTime: at(19, 3, 5) }, null, fc, runner(new Set()));
ok(calls.length === 1 && calls[0] === "0 3 * * *", "with a 5-minute lag the 03:00 job runs on the 03:05 tick", calls);
const od = { worker: "w3", tick: "30 * * * *", tickMin: 60, jobs: [{ cron: "30 6 * * *", periodMin: 1440, retry: true }], own: "0 * * * *", ownWhenDue: false };
calls.length = 0;
await H.cronGridRun(db, { cron: "30 * * * *", scheduledTime: at(19, 6, 30) }, null, od, runner(new Set()));
ok(JSON.stringify(calls) === JSON.stringify(["30 6 * * *"]), "ownWhenDue false: the due job replaces the own run", calls);
calls.length = 0;
await H.cronGridRun(db, { cron: "30 * * * *", scheduledTime: at(19, 7, 30) }, null, od, runner(new Set()));
ok(JSON.stringify(calls) === JSON.stringify(["0 * * * *"]), "own '<cron>': the tick runs the worker as that cron", calls);
calls.length = 0;
await H.cronGridRun(db, { cron: "0 6 * * *", scheduledTime: at(19, 6, 0) }, null, od, runner(new Set()));
ok(calls[0] === "0 6 * * *" && rows("w3").some((r) => r.note.startsWith("fire")), "a trigger that is not the tick runs once and is logged as a fire");
console.log(`cron-grid: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
