// scripts/cf-ops-infra-actions.test.mjs -- UNBIND-UNUSED-1, D2C-CF-ACTIONS-1, RM-BS-CAPABILITY-SECURITY-1, TP-3B-ATTACH-1, DIRECT-DEPLOY-WINDOWS-1.
// Runs in the full suite set (SUITE-RUNNER-1, *.test.mjs only): the Python offline suites for the new cf_ops_actions actions, the ask.qwav.tech
// redirect rule and the direct_content_deploy selftest (Windows-shaped path case).
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = process.env.PYTHON || "python3";
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
if (spawnSync(PY, ["--version"]).status !== 0) { console.log("cf-ops-infra-actions: python3 absent; skipped"); process.exit(0); }
const env = Object.assign({}, process.env, { CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "", GITHUB_RUN_ID: "" });
for (const [file, args, re] of [["cf_ops_infra_actions_test.py", [], /, 0 failed/], ["attach_ask_qwav_redirect_test.py", [], /: ok/], ["direct_content_deploy.py", ["--selftest"], /selftest ok/]]) {
  const r = spawnSync(PY, [join(HERE, file), ...args], { cwd: HERE, encoding: "utf8", env });
  ok(r.status === 0 && re.test(r.stdout), file + " passes" + (r.status === 0 ? "" : ": " + (r.stdout + r.stderr).slice(-800)));
}
process.exit(fails ? 1 : 0);
