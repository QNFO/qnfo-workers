// FLEET-JOURNEYS-1 / CENSUS-EXTERNAL-HEARTBEAT-1: runs the offline selftest of scripts/fleet_journeys.py on every pull request that touches scripts/.
// The selftest carried no workflow hook, so a change to the journey runner (or its runner-attested heartbeat for workers qnfo-ops cannot probe) was only exercised by the live
// hourly run. Proves: every canned journey passes and fails where it should, the record/issue lifecycle holds, and external_heartbeat attests only the blind workers and the
// documented retired stub that the runner actually reached.
// Run: node scripts/fleet-journeys.test.mjs   (exit 0 = all passed; needs python3)
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const probe = spawnSync("python3", ["--version"], { encoding: "utf8" });
if (probe.status !== 0) {
  console.log("fleet-journeys: SKIP (python3 is not installed)");
  process.exit(0);
}
const r = spawnSync("python3", [join(here, "fleet_journeys.py"), "--selftest"], { encoding: "utf8", timeout: 120000, cwd: join(here, "..") });
let out = null;
try { out = JSON.parse((r.stdout || "").trim().split("\n").pop()); } catch (e) { out = null; }
const ok = r.status === 0 && out && out.selftest === "ok" && out.checks >= 30 && Array.isArray(out.failed) && out.failed.length === 0;
if (!ok) console.log("FAIL fleet_journeys.py --selftest :: " + ((r.stdout || "") + (r.stderr || "")).slice(-400));
console.log("fleet-journeys: " + (ok ? "1 passed, 0 failed (" + out.checks + " selftest checks)" : "0 passed, 1 failed"));
process.exit(ok ? 0 : 1);
