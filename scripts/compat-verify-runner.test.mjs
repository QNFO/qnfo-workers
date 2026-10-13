// scripts/compat-verify-runner.test.mjs -- COMPAT-VERIFY-RUNNER-1 (agent_issues 2411, pillar core). Runs in the full suite set
// (SUITE-RUNNER-1 runs only *.test.mjs files): the Python selftest of scripts/compat_verify_runner.py (pending lines, the health
// hosts it shares with the control-plane canary, the poll window, the verdict it answers, which outcome fails the step, the
// retry and second-host rules) and of the canonical_deploy.py pieces it reads (the compat_verify request field and the pending
// line), plus a source check that canonical-deploy.yml wires both and keeps its existing steps. No network, no secrets.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = process.env.PYTHON || "python3";
let fails = 0;
const ok = (c, m, d) => { if (!c) { fails++; console.log("FAIL " + m + (d ? ": " + d : "")); } else console.log("PASS " + m); };

const wf = readFileSync(join(HERE, "..", ".github", "workflows", "canonical-deploy.yml"), "utf8");
ok(/python3 scripts\/canonical_deploy\.py --worker "\$name" --path "\$path" --fallback-file \/tmp\/fallback\.txt --compat-verify caller --compat-pending-file \/tmp\/compat_pending\.jsonl \$DRY \$CR/.test(wf), "the deploy loop asks for caller verification and records pending dates");
const iDeploy = wf.indexOf("- name: Deploy through the canonical path");
const iVerify = wf.indexOf("- name: Verify advanced compatibility dates from the runner");
const iCanary = wf.indexOf("- name: Canary the control-plane workers and revert a push that did not arrive");
const iFail = wf.indexOf("- name: Fail the run when an unverified compatibility date could not be restored");
const iStatus = wf.indexOf("- name: Write the ci-status artifact");
ok(iDeploy > 0 && iVerify > iDeploy && iCanary > iVerify && iFail > iCanary && iStatus > iFail, "order: deploy, compat verify, canary, the restore-failure gate, ci-status");
const vstep = wf.slice(iVerify, iCanary);
ok(/id: compat/.test(vstep) && /if: \$\{\{ !cancelled\(\) && github\.event\.inputs\.dry_run != 'true' \}\}/.test(vstep), "the verify step runs after a failed deploy step too (a date another target advanced still needs its check), never on a dry run");
ok(/python3 scripts\/compat_verify_runner\.py --pending \/tmp\/compat_pending\.jsonl --window-min 2 --poll-sec 10 \|\| rc=\$\?/.test(vstep) && /restore_failed=/.test(vstep) && /\nexit 0|\n\s+exit 0/.test(vstep), "it records a failed restore as an output and never fails itself, so the canary still runs");
ok(/OPS_ROUTER_AUTH_KEY: \$\{\{ secrets\.OPS_ROUTER_AUTH_KEY \}\}/.test(vstep), "it has the router key to answer /ops/compat-verify");
const fstep = wf.slice(iFail, iStatus);
ok(/if: \$\{\{ !cancelled\(\) && steps\.compat\.outputs\.restore_failed == '1' \}\}/.test(fstep) && /exit 1/.test(fstep), "only a failed restore fails the run");
ok(/if: steps\.deploy\.outcome == 'success' && github\.event\.inputs\.dry_run != 'true'/.test(wf.slice(iCanary, iFail)), "the canary step keeps its condition");

if (spawnSync(PY, ["--version"]).status !== 0) {
  console.log("compat-verify-runner: python3 is absent on this runner; the Python selftest is skipped");
  process.exit(fails ? 1 : 0);
}
const env = Object.assign({}, process.env, { OPS_ROUTER_AUTH_KEY: "", GITHUB_RUN_ID: "", PYTHONDONTWRITEBYTECODE: "1" });
const r = spawnSync(PY, [join(HERE, "compat_verify_runner.py"), "--selftest"], { cwd: HERE, encoding: "utf8", env, timeout: 60000 });
ok(r.status === 0 && /compat-verify-runner selftest: ok/.test(r.stdout), "compat_verify_runner.py --selftest passes", (r.stdout + r.stderr).slice(-1500));
const e = spawnSync(PY, [join(HERE, "compat_verify_runner.py"), "--pending", join(HERE, "does-not-exist.jsonl")], { cwd: HERE, encoding: "utf8", env, timeout: 30000 });
ok(e.status === 0 && /no compatibility date awaits verification/.test(e.stdout), "no pending file: nothing to verify, exit 0", (e.stdout + e.stderr).slice(-400));
process.exit(fails ? 1 : 0);
