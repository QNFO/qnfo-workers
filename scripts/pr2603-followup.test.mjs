// scripts/pr2603-followup.test.mjs -- PR2603-FOLLOWUP-SCRIPTS-1 (independent review of PR 2603, pillar autonomy). Runs in the full suite set
// (SUITE-RUNNER-1), which runs only *.test.mjs files, so it runs the two Python suites that otherwise ran nowhere:
//   scripts/conflict_repair_test.py  settle_issue against the LIVE issue_triage definition and close triggers (CONFLICT-REPAIR-SETTLE-2);
//   scripts/cf_token_watch_test.py   cloudflare_token_ok is 0 only for a definite refusal, never for a missing answer (CF-TOKEN-WATCH-2).
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = process.env.PYTHON || "python3";
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };

if (spawnSync(PY, ["--version"]).status !== 0) {
  console.log("pr2603-followup: python3 is absent on this runner; skipped");
  process.exit(0);
}
const env = Object.assign({}, process.env, { CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "", CF_ACCOUNT_ID: "", CF_API_TOKEN: "", GITHUB_RUN_ID: "" });
for (const t of ["conflict_repair_test.py", "cf_token_watch_test.py"]) {
  const r = spawnSync(PY, [join(HERE, t)], { cwd: HERE, encoding: "utf8", env });
  ok(r.status === 0 && /FAILS=0/.test(r.stdout), t + " passes" + (r.status === 0 ? "" : ": " + (r.stdout + r.stderr).slice(-1500)));
}
process.exit(fails ? 1 : 0);
