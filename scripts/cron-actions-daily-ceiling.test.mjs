import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const check = (condition, message) => {
  console.log((condition ? "PASS " : "FAIL ") + message);
  if (!condition) fails++;
};

function fixture(workflows) {
  const root = mkdtempSync(join(tmpdir(), "actions-cron-guard-"));
  const workflowDir = join(root, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });
  for (const [name, crons] of Object.entries(workflows)) {
    const schedule = crons.map((cron) => `    - cron: '${cron}'`).join("\n");
    writeFileSync(join(workflowDir, name), [
      "name: fixture",
      "on:",
      "  schedule:",
      schedule,
      "jobs:",
      "  check:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: echo ok",
      "",
    ].join("\n"));
  }
  return root;
}

function guard(root) {
  const result = spawnSync(
    "python3",
    ["-I", join(repo, "scripts", "cron_rate_guard.py"), "--root", root, "--json"],
    {
      encoding: "utf8",
      env: { ...process.env, CRON_GUARD_TODAY: "2026-10-20" },
    },
  );
  let report;
  try {
    report = JSON.parse(result.stdout).reports.repo;
  } catch {
    report = null;
  }
  return { code: result.status, report, output: result.stdout + result.stderr };
}

function runFixture(workflows) {
  const root = fixture(workflows);
  try {
    return guard(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

let result = runFixture({ "daily.yml": ["23 11 * * *"] });
check(
  result.code === 0 && result.report?.actions?.workflows === 1,
  "one scheduled run per day passes",
);

result = runFixture({ "twice-daily.yml": ["0 6 * * *", "0 18 * * *"] });
check(
  result.code === 1 &&
    result.report?.actions?.violations.some(
      (violation) => violation.workflow === "twice-daily.yml" && violation.max_fires_24h === 2,
    ),
  "multiple schedule entries are aggregated and a twice-daily workflow fails",
);

result = runFixture({ "frequent.yml": ["*/15 * * * *"] });
check(
  result.code === 1 &&
    result.report?.actions?.violations.some(
      (violation) => violation.workflow === "frequent.yml" && violation.max_fires_24h === 96,
    ),
  "a 15-minute workflow schedule fails the daily ceiling",
);

result = runFixture({
  "assign-copilot-on-issue.yml": ["41 * * * *"],
  "indexnow-fallback.yml": ["23 */6 * * *"],
});
check(
  result.code === 0 && result.report?.actions?.violations.length === 0,
  "documented hourly and six-hourly workflow schedules remain within their named ceilings",
);

result = runFixture({ "indexnow-fallback.yml": ["23 */3 * * *"] });
check(
  result.code === 1 &&
    result.report?.actions?.violations.some(
      (violation) => violation.workflow === "indexnow-fallback.yml" && violation.limit === 4,
    ),
  "a schedule exceeding a named workflow ceiling fails",
);

result = guard(repo);
check(
  result.code === 0,
  "the repository passes the worker and Actions cron guards: " +
    (result.report?.violations?.map((violation) => `${violation.worker || violation.workflow}: ${violation.reason}`).join("; ") ||
      result.output.slice(0, 120)),
);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
