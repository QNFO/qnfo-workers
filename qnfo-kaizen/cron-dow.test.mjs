// KAIZEN-CF-MONDAY-1 offline check: the declared drift-scan cron fires on Monday under Cloudflare's weekday numbering
// (1=Sunday..7=Saturday, developers.cloudflare.com/workers/configuration/cron-triggers) and worker.js scheduled() matches
// exactly the declared strings, so a schedule change cannot silently stop the job. Run: node qnfo-kaizen/cron-dow.test.mjs
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const cfDay = (t) => { const u = String(t).toUpperCase(); const i = NAMES.indexOf(u); return i >= 0 ? NAMES[i] : NAMES[Number(u) - 1]; };

const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const m = /\[triggers\][^\[]*?crons\s*=\s*\[([^\]]*)\]/.exec(toml);
const crons = m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : [];
ok(crons.length === 2, "two declared crons (got " + crons.length + ")");
const scan = crons.find((c) => c.split(/\s+/)[4] !== "*");
ok(!!scan && cfDay(scan.split(/\s+/)[4]) === "MON", "the drift scan fires on Monday under Cloudflare numbering (" + scan + ")");
for (const c of crons) ok(src.includes('event.cron === "' + c + '"'), "scheduled() handles the declared cron " + c);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
