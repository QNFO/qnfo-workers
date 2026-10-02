// CRON-SINGLE-TRIGGER-1: one tick, an in-code due table in Amsterdam time. The table must fire exactly the slots the 21
// per-slot cron triggers fired (replayed minute by minute against the old cron list), across both daylight-saving states.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const block = cut("// ---- CRON-SINGLE-TRIGGER-1:BEGIN", "// ---- CRON-SINGLE-TRIGGER-1:END");
const sched = cut("var AMS_SCHEDULE = {", "function isoDowToCf(spec)").replace(/\/\/ ---- CRON-SINGLE-TRIGGER-1:BEGIN[\s\S]*$/, "");
const legacy = cut("function isoDowToCf(spec)", "/* CF-DOW-1 */").replace(/__name\([^)]*\);\n/g, "");
const sandbox = { Intl, Date, Math, Object, Array, String, Number };
vm.createContext(sandbox);
vm.runInContext(sched + block + legacy + "\n__export = { AMS_SCHEDULE, TICK_CRON, TICK_MS, TICK_LOOKBACK_SLOTS, amsParts, isoDayMatch, dueJobs, tickDue, buildCrons };", sandbox);
const { AMS_SCHEDULE, TICK_CRON, TICK_MS, TICK_LOOKBACK_SLOTS, amsParts, isoDayMatch, dueJobs, tickDue, buildCrons } = sandbox.__export;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// A Cloudflare cron field: "*", lists and ranges; day of week 1 = Sunday .. 7 = Saturday.
const fieldMatch = (spec, v) => spec === "*" || String(spec).split(",").some((p) => { const r = /^(\d+)-(\d+)$/.exec(p); return r ? v >= +r[1] && v <= +r[2] : +p === v; });
const cfCronMatch = (expr, d) => { const f = expr.split(" "); return fieldMatch(f[0], d.getUTCMinutes()) && fieldMatch(f[1], d.getUTCHours()) && fieldMatch(f[2], d.getUTCDate()) && fieldMatch(f[3], d.getUTCMonth() + 1) && fieldMatch(f[4], d.getUTCDay() + 1); };

check(TICK_CRON === "*/10 * * * *" && TICK_MS === 300000, "one tick every 10 minutes (CRON-RATE-CEILING-1), 5-minute slots");
check(Object.keys(AMS_SCHEDULE).every((j) => AMS_SCHEDULE[j].times.every((t) => /^\d\d:\d[05]$/.test(t))), "every slot sits on a 5-minute mark, so a five-minute tick reaches it");
check(isoDayMatch("*", 3) && isoDayMatch("1-5", 5) && !isoDayMatch("1-5", 6) && isoDayMatch("7", 7) && !isoDayMatch("7", 1) && isoDayMatch("1,3", 3), "ISO day specs");
check(JSON.stringify(amsParts(Date.UTC(2026, 9, 2, 15, 0))) === JSON.stringify({ y: 2026, mo: 10, d: 2, hm: "17:00", isoDow: 5, date: "2026-10-02" }), "Friday 2026-10-02 15:00Z is Friday 17:00 in Amsterdam (CEST)");
check(amsParts(Date.UTC(2026, 10, 2, 16, 0)).hm === "17:00", "after the 2026-10-25 change 16:00Z is 17:00 in Amsterdam (CET)");
check(dueJobs(AMS_SCHEDULE, Date.UTC(2026, 9, 2, 15, 0)).map((x) => x.job).join() === "weekly", "the weekly digest is due Friday 17:00 Amsterdam");
check(dueJobs(AMS_SCHEDULE, Date.UTC(2026, 9, 4, 7, 2, 30)).map((x) => x.job).join() === "zenodo-stats", "zenodo-stats is due Sunday 09:00 Amsterdam, and a tick 150 s late still names its slot");
check(dueJobs(AMS_SCHEDULE, Date.UTC(2026, 8, 3, 9, 0)).some((x) => x.job === "nlnet") && !dueJobs(AMS_SCHEDULE, Date.UTC(2026, 9, 3, 9, 0)).some((x) => x.job === "nlnet"), "a fixed date (3 September) fires on that date only");

// Replay: over two CEST weeks and two CET weeks, drive a tick every 10 minutes through the claim ledger. Every fire of the
// old per-slot triggers (buildCrons with that week's offset, Cloudflare day numbering) must happen exactly once, at most
// 5 minutes late, and nothing else may fire. Then the same with every seventh tick lost.
const replay = (dropEvery) => {
  let oldFires = 0, newFires = 0, late = 0, problems = [];
  for (const [startMs, off] of [[Date.UTC(2026, 8, 28), 2], [Date.UTC(2026, 10, 2), 1]]) {
    const crons = buildCrons(off), want = new Map(), claimed = new Map(), got = new Map();
    for (let ms = startMs; ms < startMs + 14 * 864e5; ms += 60000) {
      const d = new Date(ms);
      for (const c of crons) if (cfCronMatch(c.cron, d)) { want.set(c.job + "@" + ms, ms); oldFires++; }
    }
    let n = 0;
    for (let ms = startMs; ms < startMs + 14 * 864e5 + 20 * 60000; ms += 600000) {
      if (dropEvery && ++n % dropEvery === 0) continue;
      for (const x of tickDue(AMS_SCHEDULE, ms)) {
        if (claimed.get(x.job) === x.slot) continue;
        claimed.set(x.job, x.slot);
        // the slot's own instant: the latest 5-minute mark at or before this tick whose Amsterdam time is the slot
        let at = null;
        for (let k = 0; k <= TICK_LOOKBACK_SLOTS; k++) { const p = amsParts(ms - k * TICK_MS); if (p.date + " " + p.hm === x.slot) { at = Math.floor((ms - k * TICK_MS) / TICK_MS) * TICK_MS; break; } }
        const key = x.job + "@" + at;
        got.set(key, (got.get(key) || 0) + 1); newFires++;
        late = Math.max(late, (ms - at) / 60000);
      }
    }
    for (const [k] of want) if (got.get(k) !== 1 && problems.length < 5) problems.push("missed or doubled " + k.split("@")[0] + " " + new Date(+k.split("@")[1]).toISOString() + " x" + (got.get(k) || 0));
    for (const [k] of got) if (!want.has(k) && want.size && problems.length < 5 && +k.split("@")[1] < startMs + 14 * 864e5) problems.push("extra " + k);
  }
  return { oldFires, newFires, late, problems };
};
const r0 = replay(0);
check(r0.problems.length === 0 && r0.oldFires === r0.newFires, "every fire of the 21 per-slot triggers happens exactly once (" + r0.newFires + " of " + r0.oldFires + " over 4 weeks)" + (r0.problems.length ? ": " + r0.problems.join("; ") : ""));
check(r0.late <= 5, "no job runs more than 5 minutes after its slot (worst " + r0.late + " min)");
const r7 = replay(7);
check(r7.problems.length === 0 && r7.oldFires === r7.newFires && r7.late <= 15, "with every seventh tick lost, still exactly once (worst delay " + r7.late + " min)" + (r7.problems.length ? ": " + r7.problems.join("; ") : ""));

// Lookback: a tick names its own slot and the three before it.
const t0 = Date.UTC(2026, 9, 5, 6, 0); // Monday 08:00 Amsterdam: email-triage and portfolio-sync
check(tickDue(AMS_SCHEDULE, t0).map((x) => x.job).sort().join() === "email-triage,portfolio-sync", "two jobs share Monday 08:00");
check(tickDue(AMS_SCHEDULE, Date.UTC(2026, 9, 5, 3, 10)).map((x) => x.job).sort().join() === "overdue-guard,worker-health", "the 05:10 tick runs worker-health (05:05) and overdue-guard (05:10)");
check(tickDue(AMS_SCHEDULE, t0 + 3 * TICK_MS).filter((x) => x.slot === "2026-10-05 08:00").length === 2 && tickDue(AMS_SCHEDULE, t0 + 4 * TICK_MS).filter((x) => x.slot === "2026-10-05 08:00").length === 0, "a slot is covered for 15 minutes, then dropped");
check(/const list = \[TICK_CRON\];/.test(src) && /await Promise\.allSettled\(runs\)/.test(src) && /async function claimSlot\(env, job, slot\)/.test(src), "syncSchedules registers the one tick; due jobs run under claimSlot");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
