// CRON-HOURLY-FLOOR-1 (owner directive 2026-10-19: no cron shall execute less than once every hour).
// scripts/cron_rate_guard.py fails a slow producer that is not on scripts/cron-tempo-allowlist.txt, an allowlist entry past
// its expiry, and an entry that no longer matches a slow cron (shrink-only). RETIRED and FOLDED directories never deploy, so
// their crons are skipped, except a worker the guard itself treats as a heartbeat or override (fleet-exec carries a stale
// FOLDED file but is the live 5-minute dispatcher).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

function fixture(workers, allowlist) {
  const root = mkdtempSync(join(tmpdir(), "cron-guard-"));
  for (const [name, w] of Object.entries(workers)) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, "wrangler.toml"), 'name = "' + name + '"\n[triggers]\ncrons = [' + w.crons.map((c) => '"' + c + '"').join(", ") + "]\n");
    if (w.marker) writeFileSync(join(root, name, w.marker), "x\n");
  }
  mkdirSync(join(root, "scripts"), { recursive: true });
  if (allowlist !== null) writeFileSync(join(root, "scripts", "cron-tempo-allowlist.txt"), allowlist);
  return root;
}
function guard(root, today) {
  const r = spawnSync("python3", ["-I", join(repo, "scripts", "cron_rate_guard.py"), "--root", root, "--json"], { encoding: "utf8", env: Object.assign({}, process.env, { CRON_GUARD_TODAY: today || "2026-10-20" }) });
  let rep = null;
  try { rep = JSON.parse(r.stdout).reports.repo; } catch (e) { /* reported by the caller */ }
  return { code: r.status, rep, text: r.stdout + r.stderr };
}
const reasons = (g) => (g.rep ? g.rep.violations.map((v) => v.reason).join(" | ") : g.text);

// 1. A new slow cron that is not on the allowlist fails.
let root = fixture({ "demo-worker": { crons: ["0 6 * * *"] } }, "# empty\n");
let g = guard(root);
check(g.code === 1 && /SLOW-PRODUCER/.test(reasons(g)), "a daily cron that is not allowlisted fails the guard: " + reasons(g).slice(0, 110));
rmSync(root, { recursive: true, force: true });

// 2. The same cron, allowlisted and unexpired, passes and is still listed.
root = fixture({ "demo-worker": { crons: ["0 6 * * *"] } }, "demo-worker|0 6 * * *|2026-11-02|CRON-HOURLY-FLOOR-1:demo-worker\n");
g = guard(root);
check(g.code === 0 && g.rep.tempo.length === 1 && g.rep.tempo[0].allowlisted_until === "2026-11-02", "an unexpired allowlist entry passes and stays visible as a TEMPO item");
rmSync(root, { recursive: true, force: true });

// 3. Past its expiry the same entry fails.
root = fixture({ "demo-worker": { crons: ["0 6 * * *"] } }, "demo-worker|0 6 * * *|2026-11-02|CRON-HOURLY-FLOOR-1:demo-worker\n");
g = guard(root, "2026-11-03");
check(g.code === 1 && /TEMPO-ALLOWLIST-EXPIRED/.test(reasons(g)), "an allowlist entry past its expiry fails: " + reasons(g).slice(0, 90));
rmSync(root, { recursive: true, force: true });

// 4. Shrink-only: an entry for a cron that is now hourly (the worker was converted) fails until the line is removed.
root = fixture({ "demo-worker": { crons: ["0 * * * *"] } }, "demo-worker|0 6 * * *|2026-11-02|CRON-HOURLY-FLOOR-1:demo-worker\n");
g = guard(root);
check(g.code === 1 && /STALE-TEMPO-ALLOWLIST-ENTRY/.test(reasons(g)), "an entry that matches no slow cron fails (shrink-only): " + reasons(g).slice(0, 90));
rmSync(root, { recursive: true, force: true });

// 5. An hourly cron needs no entry.
root = fixture({ "demo-worker": { crons: ["0 * * * *", "*/15 * * * *"] } }, "# empty\n");
g = guard(root);
check(g.code === 0 && g.rep.tempo.length === 0, "an hourly cron and a 15-minute cron pass with an empty allowlist");
rmSync(root, { recursive: true, force: true });

// 6. A RETIRED or FOLDED directory never deploys: its slow cron is skipped, not counted.
root = fixture({ "old-a": { crons: ["0 4 * * *"], marker: "RETIRED" }, "old-b": { crons: ["0 5 * * 1"], marker: "FOLDED" } }, "# empty\n");
g = guard(root);
check(g.code === 0 && g.rep.tempo.length === 0 && g.rep.not_deployed.length === 2, "RETIRED and FOLDED directories are skipped and listed as not deployed");
rmSync(root, { recursive: true, force: true });

// 7. fleet-exec carries a stale FOLDED file but is the live dispatcher: it is still audited (a 15-minute trigger fails).
// CRON-MANDATE-1 (0.45.4, 2026-10-25) makes 10 minutes the fastest permitted tempo, so the heartbeat bound follows it and
// the fixture has to be slower than 10 minutes to still prove the assertion. The point under test - a FOLDED marker does
// not exempt a live heartbeat worker from the tempo audit - is unchanged.
root = fixture({ "fleet-exec": { crons: ["*/15 * * * *"], marker: "FOLDED" } }, "# empty\n");
g = guard(root);
check(g.code === 1 && g.rep.not_deployed === undefined, "a heartbeat/override worker is audited even with a FOLDED file (fleet-exec at */15 fails): " + reasons(g).slice(0, 90));
rmSync(root, { recursive: true, force: true });

// 8. The real repository passes, and its allowlist names exactly the slow crons of the live workers.
g = guard(repo); // pinned to 2026-10-20 so the suite does not age; the live guard in deploy-gate uses the real date and fails after the expiry
check(g.code === 0, "the repository passes the guard today (violations: " + (g.rep ? g.rep.violations.length : "n/a") + ")");
check(g.rep && g.rep.tempo.length === g.rep.tempo.filter((t) => t.allowlisted_until).length, "every slow cron in the repository is allowlisted with an expiry, none is silent");
check(g.rep && g.rep.tempo.every((t) => !/RETIRED|FOLDED/.test(t.worker)), "no allowlisted entry belongs to a not-deployed directory");

console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
process.exit(fails ? 1 : 0);
