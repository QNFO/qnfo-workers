// scripts/direct-content-deploy-ledger.test.mjs -- DEPLOY-SECOND-PATH-LEDGER-1 (agent_issues 2451, pillar core). Runs in the full
// suite set (SUITE-RUNNER-1), which runs only *.test.mjs files: it runs the Python suite scripts/direct_content_deploy_ledger_test.py
// (the deployment_history row per direct deploy attempt) and the script's own --selftest, which canonical-deploy.yml runs too.
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = process.env.PYTHON || "python3";
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };

if (spawnSync(PY, ["--version"]).status !== 0) {
  console.log("direct-content-deploy-ledger: python3 is absent on this runner; skipped");
  process.exit(0);
}
const env = Object.assign({}, process.env, { CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "", GITHUB_RUN_ID: "" });
let r = spawnSync(PY, [join(HERE, "direct_content_deploy_ledger_test.py")], { cwd: HERE, encoding: "utf8", env });
ok(r.status === 0 && /direct_content_deploy_ledger_test: ok/.test(r.stdout), "direct_content_deploy_ledger_test.py passes" + (r.status === 0 ? "" : ": " + (r.stdout + r.stderr).slice(-1500)));
r = spawnSync(PY, [join(HERE, "direct_content_deploy.py"), "--selftest"], { cwd: HERE, encoding: "utf8", env });
ok(r.status === 0 && /direct_content_deploy selftest ok/.test(r.stdout), "direct_content_deploy.py --selftest passes" + (r.status === 0 ? "" : ": " + (r.stdout + r.stderr).slice(-800)));
process.exit(fails ? 1 : 0);
