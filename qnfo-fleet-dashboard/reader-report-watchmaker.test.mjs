// READER-REPORT-WATCHMAKER-1 offline suite (agent_issues 100264, qnfo-fleet-dashboard 1.51.15). WATCHMAKER_OPS must count the hourly reader-report sweep of qnfo-gateway.
// Proves: the entry exists with its runner, hourly cadence and a first_due after the gateway deploy; its SQL reads the gateway tick in cron_fire_log (not reader_reports,
// which is empty until a reader writes), returns the newest hourly tick and ignores another worker and another expression; the mirror is identical.
// Run: node qnfo-fleet-dashboard/reader-report-watchmaker.test.mjs
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
const m = /\{ key: "reader-report", what: "([^"]+)", runner: "([^"]+)", cadence_h: (\d+), first_due: "([^"]+)", sql: "([^"]+)" \}/.exec(src);
ok(!!m, "the reader-report entry is in WATCHMAKER_OPS");
const [, what, runner, cadence, firstDue, sql] = m || [];
ok(/READER-REPORT-1/.test(what) && runner === "cron:qnfo-gateway" && Number(cadence) === 1 && firstDue >= "2026-10-19T22:00:00Z", "runner, hourly cadence and a first_due after the gateway deploy", { runner, cadence, firstDue });
ok(src.indexOf("var WATCHMAKER_OPS = [") < src.indexOf('key: "reader-report"') && src.indexOf('key: "reader-report"') < src.indexOf('key: "paper-learn"'), "it is the first entry");
ok(!/reader_reports/.test(sql), "the evidence is not a reader's row");
const d = new DatabaseSync(":memory:");
d.exec("CREATE TABLE cron_fire_log (cron_name TEXT, task_id TEXT, cron_expr TEXT, fired_at TEXT, fired_epoch_ms INTEGER, outcome TEXT, source TEXT, note TEXT)");
const ins = d.prepare("INSERT INTO cron_fire_log (task_id, cron_expr, fired_at, outcome) VALUES (?, ?, ?, 'idle')");
ok(d.prepare(sql).get().last === null, "no tick, no last");
ins.run("qnfo-gateway", "0 * * * *", "2026-10-19T21:00:43.749Z");
ins.run("qnfo-gateway", "0 * * * *", "2026-10-19T22:00:43.749Z");
ins.run("qnfo-gateway", "0 6 * * *", "2026-10-19T23:59:00.000Z");
ins.run("qnfo-other", "0 * * * *", "2026-10-19T23:30:00.000Z");
ok(d.prepare(sql).get().last === "2026-10-19T22:00:43.749Z", "the newest hourly gateway tick, not another expression or worker", d.prepare(sql).get());
ok(src === mirror, "the mirror is identical");
const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(Number(v[1]) > 1 || Number(v[2]) > 51 || (Number(v[2]) === 51 && Number(v[3]) >= 15), "the worker is at least 1.51.15 (a minimum)", v && v[0]);
console.log("reader-report-watchmaker: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
