// GH-TOKEN-WATCH-1 (qnfo-cloud-ops 1.30.0): the tick reads GitHub's answer for the worker token and turns it into three metrics.
// Replays the pure parser and checks the wiring. Run: node qnfo-cloud-ops/gh-token-watch.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// ---- GH-TOKEN-WATCH-1:BEGIN"), b = src.indexOf("// ---- GH-TOKEN-WATCH-1:END");
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x) : "")); if (!c) fails++; };
check(a > 0 && b > a, "the pure block is marked");
const sandbox = { Date, Math, Number, String, isNaN };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b) + "\n__export = { GH_TOKEN_WATCH_WARN_MIN, ghTokenWatchParse };", sandbox);
const { GH_TOKEN_WATCH_WARN_MIN, ghTokenWatchParse } = sandbox.__export;
const now = Date.parse("2026-10-14T08:00:00Z");

let w = ghTokenWatchParse(200, "2026-10-24 08:00:00 UTC", "4990", "5000", now);
check(w.ok === 1 && w.expires_in_min === 14400 && w.remaining === 4990 && w.limit === 5000, "a valid token with a UTC expiry header", w);
check(/expires in 14400 min/.test(w.why), "an expiry inside the warning window is named", w.why);
w = ghTokenWatchParse(200, "2026-10-24 10:00:00 +0200", "10", "5000", now);
check(w.expires_in_min === 14400, "an offset expiry header is read", w);
w = ghTokenWatchParse(200, null, "4999", "5000", now);
check(w.ok === 1 && w.expires_in_min === null && /no expiry/.test(w.why), "a token without an expiry date", w);
w = ghTokenWatchParse(401, null, null, null, now);
check(w.ok === 0 && w.remaining === null && /HTTP 401/.test(w.why), "a refused token reads ok 0", w);
w = ghTokenWatchParse(200, "2026-10-14 07:00:00 UTC", "5000", "5000", now);
check(w.expires_in_min < 0 && w.why === "token expired", "an expired date reads expired", w);
check(GH_TOKEN_WATCH_WARN_MIN === 20160, "the warning window is 20160 minutes (14 days)");

check(/runs\.push\(jobGhTokenWatch\(env\)/.test(src), "the 10-minute tick runs the watch");
check(/"gh-token-watch": jobGhTokenWatch/.test(src), "POST /run?job=gh-token-watch runs it");
check(/api\.github\.com\/rate_limit/.test(src), "the watch reads /rate_limit, which costs no quota");
for (const m of ["github_token_ok", "github_token_expires_in_min", "github_api_remaining"]) check(src.includes('"' + m + '"'), "writes " + m);
const v = (/var VERSION = "([^"]+)"/.exec(src) || [])[1];
check(versionAtLeast(v, "1.30.0"), "VERSION is at least 1.30.0", v);
console.log(fails ? fails + " failed" : "all passed");
if (fails) process.exit(1);
