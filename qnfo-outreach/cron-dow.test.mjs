// OUTREACH-CF-DOW-1 offline check for qnfo-outreach: the declared cron must fire on weekdays (Monday-Friday) under
// Cloudflare's numbering (1=Sunday..7=Saturday, developers.cloudflare.com/workers/configuration/cron-triggers), and
// /health must report the same cron. The old "0 11 * * 1-5" ran Sunday-Thursday. Run: node qnfo-outreach/cron-dow.test.mjs
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
// Cloudflare weekday field -> set of day names. Supports *, lists, ranges, numbers 1-7 and SUN..SAT.
function cfWeekdays(field) {
  const out = new Set();
  const num = (t) => { const u = String(t).toUpperCase(); const i = NAMES.indexOf(u); if (i >= 0) return i + 1; const n = Number(u); if (!Number.isInteger(n) || n < 1 || n > 7) throw new Error("bad weekday " + t); return n; };
  for (const part of String(field).split(",")) {
    if (part === "*") { NAMES.forEach((d) => out.add(d)); continue; }
    const [a, b] = part.split("-");
    const lo = num(a), hi = b === undefined ? lo : num(b);
    for (let n = lo; n <= hi; n++) out.add(NAMES[n - 1]);
  }
  return out;
}
ok([...cfWeekdays("1-5")].join(",") === "SUN,MON,TUE,WED,THU", "Cloudflare 1-5 is Sunday-Thursday");
ok([...cfWeekdays("2-6")].join(",") === "MON,TUE,WED,THU,FRI", "Cloudflare 2-6 is Monday-Friday");
ok([...cfWeekdays("mon-fri")].join(",") === "MON,TUE,WED,THU,FRI", "MON-FRI is Monday-Friday");

const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const m = /\[triggers\][^\[]*?crons\s*=\s*\[([^\]]*)\]/.exec(toml);
const crons = m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : [];
ok(crons.length === 1, "one declared cron (got " + crons.length + ")");
for (const c of crons) {
  const f = c.trim().split(/\s+/);
  ok(f.length === 5, "five-field cron: " + c);
  ok([...cfWeekdays(f[4])].join(",") === "MON,TUE,WED,THU,FRI", "declared cron " + c + " fires Monday-Friday (got " + [...cfWeekdays(f[4])].join(",") + ")");
}

const IMPORT = 'import { EmailMessage } from "cloudflare:email";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var EmailMessage = class {};")).toString("base64"));
const h = await (await mod.default.fetch(new Request("https://qnfo-outreach.example/health"), {})).json();
ok(h.cron === crons[0], "/health cron equals the declared cron (" + h.cron + " vs " + crons[0] + ")");
ok(h.version === (/var VERSION = "([^"]+)"/.exec(src) || [])[1], "/health version equals VERSION");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
