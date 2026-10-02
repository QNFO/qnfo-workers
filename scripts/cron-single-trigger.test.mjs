// CRON-SINGLE-TRIGGER-1 (#1785): workers that held several cron triggers now hold one hourly tick and a CRON_TABLE.
// For each of them: the table is the former trigger list, and every fire of the former list is delivered exactly once,
// in the hour it fired, through the same per-expression dispatcher.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const FORMER = {
  "radar-hub": ["0 5 * * 2", "30 8 * * *", "0 6 1 * *", "0 8 * * 7", "0 9 * * 7", "0 11 1,15 * *", "0 7 * * 2", "30 5 * * 2", "0 6 * * *"],
  "errata-hub": ["0 * * * *", "15 * * * *", "30 * * * *"],
  "qnfo-lifecycle": ["0 * * * *", "0 0 1 * *", "0 3 * * *", "0 5 * * *", "0 8 * * 1"],
  "personal-companion": ["0 * * * *", "0 21 * * *"]
};
// An independent reading of a Cloudflare cron expression (UTC; day of week 1 = Sunday .. 7 = Saturday).
const fm = (spec, v) => spec === "*" || spec.split(",").some((p) => { const r = /^(\d+)-(\d+)$/.exec(p); return r ? v >= +r[1] && v <= +r[2] : +p === v; });
const fires = (expr, ms) => { const f = expr.split(" "), d = new Date(ms); return fm(f[0], d.getUTCMinutes()) && fm(f[1], d.getUTCHours()) && fm(f[2], d.getUTCDate()) && fm(f[3], d.getUTCMonth() + 1) && fm(f[4], d.getUTCDay() + 1); };
for (const w of Object.keys(FORMER)) {
  const src = readFileSync(join(root, w, "worker.js"), "utf8");
  const toml = readFileSync(join(root, w, "wrangler.toml"), "utf8");
  const a = src.indexOf("// ---- CRON-SINGLE-TRIGGER-1:BEGIN"), b = src.indexOf("// ---- CRON-SINGLE-TRIGGER-1:END");
  const c = src.indexOf("async function cronTickDispatch(event, one) {"), cEnd = src.indexOf("\n}\n", c) + 3;
  const sb = { console: { error() {} } };
  vm.createContext(sb);
  vm.runInContext(src.slice(a, b) + src.slice(c, cEnd) + "\n__export = { TICK_CRON, CRON_TABLE, TICK_PARALLEL, cronFieldMatch, cronMatchesAt, cronDueAtTick, cronTickDispatch };", sb);
  const { TICK_CRON, CRON_TABLE, TICK_PARALLEL, cronFieldMatch, cronMatchesAt, cronDueAtTick, cronTickDispatch } = sb.__export;
  check(TICK_CRON === "0 * * * *" && (toml.match(/^crons = (.*)$/m) || [])[1] === '["0 * * * *"]', w + ": one hourly trigger in worker.js and wrangler.toml");
  check(JSON.stringify(Array.from(CRON_TABLE)) === JSON.stringify(FORMER[w]), w + ": CRON_TABLE is the former trigger list (" + CRON_TABLE.length + " entries)");
  check(CRON_TABLE.every((e) => { const f = e.split(" "); return f.length === 5 && !(f[2] !== "*" && f[4] !== "*"); }), w + ": no entry restricts both day of month and day of week");
  // Replay five weeks (2026-09-27 .. 2026-11-01, across a month start and the 15th) minute by minute.
  const start = Date.UTC(2026, 8, 27), end = start + 35 * 864e5, want = new Map(), got = new Map();
  let late = 0;
  for (let ms = start; ms <= end; ms += 60000) for (const e of FORMER[w]) if (fires(e, ms)) want.set(e + "@" + Math.ceil(ms / 36e5) * 36e5, (want.get(e + "@" + Math.ceil(ms / 36e5) * 36e5) || 0) + 1);
  for (let t = start; t <= end; t += 36e5) for (const e of cronDueAtTick(CRON_TABLE, t + 1500)) { got.set(e + "@" + t, (got.get(e + "@" + t) || 0) + 1); for (let k = 0; k < 60; k++) if (fires(e, t - k * 60000)) { late = Math.max(late, k); break; } }
  const missed = [...want.keys()].filter((k) => got.get(k) !== 1), extra = [...got.keys()].filter((k) => !want.has(k) && +k.split("@")[1] > start);
  check(missed.length === 0 && extra.length === 0 && [...want.values()].every((n) => n === 1), w + ": every former fire is delivered once at the next full hour (" + want.size + " fires, worst " + late + " min late)" + (missed.length || extra.length ? "; missed " + missed.slice(0, 3) + " extra " + extra.slice(0, 3) : ""));
  check(cronFieldMatch("*/15", 30) && !cronFieldMatch("*/15", 20) && cronFieldMatch("1,15", 15) && cronFieldMatch("2-6", 6) && !cronFieldMatch("2-6", 7) && cronMatchesAt("0 5 * * 2", Date.UTC(2026, 9, 5, 5, 0)) && !cronMatchesAt("0 5 * * 2", Date.UTC(2026, 9, 4, 5, 0)), w + ": field matcher (steps, lists, ranges; day 2 is Monday)");
  // The dispatcher: the tick fans out in table order; another trigger passes straight through; one failing job does not stop the rest.
  const seen = [];
  await cronTickDispatch({ cron: "0 * * * *", scheduledTime: Date.UTC(2026, 9, 1, 6, 0) }, async (ev) => { seen.push(ev.cron); if (seen.length === 1) throw new Error("first job fails"); });
  const expect = FORMER[w].filter((e) => { for (let k = 0; k < 60; k++) if (fires(e, Date.UTC(2026, 9, 1, 6, 0) - k * 60000)) return true; return false; });
  check(JSON.stringify(TICK_PARALLEL ? seen.slice().sort() : seen) === JSON.stringify(TICK_PARALLEL ? expect.slice().sort() : expect) && expect.length > 0, w + ": tick at 2026-10-01 06:00Z runs " + JSON.stringify(expect) + (TICK_PARALLEL ? " (in parallel)" : " (in order)") + " even though the first throws");
  const pass = [];
  await cronTickDispatch({ cron: "30 8 * * *" }, async (ev) => { pass.push(ev.cron); });
  check(pass.join() === "30 8 * * *", w + ": a trigger that is not the tick goes straight to the old dispatcher");
  check(/return cronTickDispatch\(event, async function \(event\) \{/.test(src), w + ": scheduled() goes through the tick dispatcher");
}
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
