// SLA-TICK-10M-1 (qnfo-fleet-control 0.30.0) offline suite. Owner directive 2026-10-14: every SLA is measured at 10-minute
// resolution, none exceeds 120 minutes, and action starts at once past 120 minutes. Proves on the bundle: the 10-minute branch runs
// slaTick10m; the hourly fan-out no longer runs slaEscalate or evaluateMetricTriggers (the */10 cron fires at minute 0 too);
// slaTick10m refreshes sla_breaches_over_120m before it escalates and evaluates; slaEscalate dedupes over 120 minutes through
// datetime(). No network.
// Run: node qnfo-fleet-control/sla-tick-10m.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const tenStart = src.indexOf('if (cron === "*/10 * * * *") {');
const tenEnd = src.indexOf('if (cron === "0 3 * * *") {', tenStart);
const ten = src.slice(tenStart, tenEnd);
ok(tenStart > 0 && tenEnd > tenStart, "the 10-minute branch is found");
ok(/ctx\.waitUntil\(slaTick10m\(env\)/.test(ten), "the 10-minute branch runs slaTick10m on every tick");
ok(!/if \(onTwentyGrid\) ctx\.waitUntil\(slaTick10m/.test(ten), "slaTick10m is not limited to the 20-minute grid");

const rest = src.slice(tenEnd, src.indexOf("calibratorMod.default.scheduled", tenEnd));
ok(!/ctx\.waitUntil\(slaEscalate\(env\)/.test(rest), "the hourly fan-out no longer runs slaEscalate");
ok(!/ctx\.waitUntil\(evaluateMetricTriggers\(env\)/.test(rest), "the hourly fan-out no longer runs evaluateMetricTriggers");

const fnStart = src.indexOf("async function slaTick10m(env)");
const fn = src.slice(fnStart, src.indexOf('__name(slaTick10m, "slaTick10m")', fnStart));
const iRefresh = fn.indexOf("v_sla_over_120m"), iEsc = fn.indexOf("slaEscalate(env)"), iEval = fn.indexOf("evaluateMetricTriggers(env)");
ok(fnStart > 0 && iRefresh > 0 && iRefresh < iEsc && iEsc < iEval, "slaTick10m refreshes the metric, then escalates, then evaluates triggers", [iRefresh, iEsc, iEval]);
ok(/metric = 'sla_breaches_over_120m'/.test(fn), "slaTick10m writes sla_breaches_over_120m");
ok((fn.match(/catch \(e\) \{ console\.error/g) || []).length >= 3, "each step logs its own failure and the others still run");

const esc = src.slice(src.indexOf("async function slaEscalate(env)"), src.indexOf('__name(slaEscalate, "slaEscalate")'));
ok(/datetime\(created_at\) > datetime\('now','-120 minutes'\)/.test(esc), "slaEscalate re-alerts after 120 minutes and reads created_at through datetime()");
ok(!/-1 day/.test(esc), "slaEscalate no longer waits a day");

const v = (/var VERSION = "([^"]+)"/.exec(src) || [])[1];
ok(versionAtLeast(v, "0.30.0"), "VERSION is at least 0.30.0", v);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
