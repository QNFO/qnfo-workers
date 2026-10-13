// HOST-CENSUS-FP-1 (2026-10-13, agent_issues 2130, pillar core): runs the Python census suites on every pull request that
// touches scripts/ (scripts/run-suites.mjs runs the full set for a shared path), so a census rule change is tested before it
// reaches main, where a red `remediation-consumer.py --selftest` would stop the whole contract run.
// 1. scripts/host_census.py selftest (also called by remediation_consumer.py --selftest).
// 2. scripts/host_census_test.py: retry, redirect chain and loop, intentional 410, owner-bound split, record() and run().
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = process.env.PYTHON || "python3";
let fails = 0;
const ok = (c, m, detail) => { if (!c) { fails++; console.log("FAIL " + m + (detail ? ": " + detail : "")); } else console.log("PASS " + m); };

if (spawnSync(PY, ["--version"]).status !== 0) {
  console.log("host-census: python3 is absent on this runner; skipped");
  process.exit(0);
}

const env = Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: "1" });
const self = spawnSync(PY, [join(HERE, "host_census.py")], { cwd: HERE, encoding: "utf8", env, timeout: 60000 });
ok(self.status === 0 && /"ok": true/.test(self.stdout), "host_census.py selftest", (self.stdout + self.stderr).slice(-600));

const suite = spawnSync(PY, [join(HERE, "host_census_test.py")], { cwd: HERE, encoding: "utf8", env, timeout: 120000 });
ok(suite.status === 0 && /"ok": true/.test(suite.stdout), "host_census_test.py", (suite.stdout + suite.stderr).slice(-1200));

process.exit(fails ? 1 : 0);
