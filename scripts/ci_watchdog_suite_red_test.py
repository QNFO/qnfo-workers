#!/usr/bin/env python3
"""MERGE-BOUNDARY-GATE-1 offline suite for scripts/ci_watchdog.py deploy_gate_failure (agent_issues 2830, no network).

A pull request validates its changed directories (and the full set for control-plane and shared paths); the full sweep on main
is the net under that. Before this change every red deploy-gate run on main was filed as `build-gate` with the hint "a
wrangler.toml main does not resolve", so a red full suite sweep carried the wrong title and the wrong fix. Proves:
  * a failed SUITE-RUNNER-1 step is `suite-red`, names `node scripts/run-suites.mjs --all` and the quarantine file as the only override
  * a failed load-gate step is `load-gate-red`
  * a failed build step stays `build-gate`; any other failed step is `gate-step-red` and names the step
  * suite-red wins when several steps failed (the red suite is the finding a person must act on)
  * no failed step (cancelled, skipped) yields None, so the structural class is kept
  * the deploy-gate workflow still names the steps the watchdog matches on (a rename would silently demote the class)
Run: python3 scripts/ci_watchdog_suite_red_test.py   -> "N passed, 0 failed"
"""
import importlib.util, os, pathlib, re, sys
HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("ciw", HERE / "ci_watchdog.py")
W = importlib.util.module_from_spec(spec)
os.environ.setdefault("DRY_RUN", "1")
spec.loader.exec_module(W)
passed = failed = 0


def ok(c, m):
    global passed, failed
    if c:
        passed += 1
    else:
        failed += 1
        print("FAIL " + m)


def job(*steps):
    return {"name": "gate", "conclusion": "failure", "steps": [{"name": n, "conclusion": c} for n, c in steps]}


SUITE = "SUITE-RUNNER-1 changed-worker suites (full set for control-plane and shared changes)"
LOAD = "MERGE-BOUNDARY-GATE-1 worker load gate (every worker directory, every event)"
BUILD = "Gate every changed worker dir (build + conflict markers)"

k, h = W.deploy_gate_failure([job(("Set up job", "success"), (BUILD, "success"), (SUITE, "failure"))])
ok(k == "suite-red", "a failed SUITE-RUNNER-1 step is suite-red: " + k)
ok("node scripts/run-suites.mjs --all" in h and "scripts/suite-quarantine.txt" in h and "must not reach main" in h, "the hint names the reproduction, the recorded override and the rule: " + h)
k, h = W.deploy_gate_failure([job((LOAD, "failure"), (SUITE, "success"))])
ok(k == "load-gate-red" and "scripts/worker-load-gate.mjs" in h, "a failed load gate is load-gate-red: " + k)
k, h = W.deploy_gate_failure([job((BUILD, "failure"))])
ok(k == "build-gate" and "WORKER-BUILD-GATE-1" in h, "a failed build step stays build-gate")
k, h = W.deploy_gate_failure([job(("Gate ALL worker dirs (full sweep on manual dispatch)", "failure"))])
ok(k == "build-gate", "the dispatch-only full build sweep is build-gate too")
k, h = W.deploy_gate_failure([job(("CRON-RATE-CEILING-1 sweep (all worker dirs)", "failure"))])
ok(k == "gate-step-red" and "CRON-RATE-CEILING-1" in h, "any other failed step is gate-step-red and names the step: " + h)
k, h = W.deploy_gate_failure([job((BUILD, "failure"), (LOAD, "failure"), (SUITE, "failure"))])
ok(k == "suite-red", "suite-red wins when several steps failed")
k, h = W.deploy_gate_failure([job((LOAD, "failure"), (BUILD, "failure"))])
ok(k == "load-gate-red", "load-gate-red wins over a build failure")
ok(W.deploy_gate_failure([job(("Set up job", "success"), (SUITE, "cancelled"), ("Post", "skipped"))]) is None, "a cancelled or skipped step is no finding")
ok(W.deploy_gate_failure(None) is None and W.deploy_gate_failure([]) is None and W.deploy_gate_failure([{"steps": None}]) is None, "an empty or missing jobs list is no finding")

# the watchdog still routes it: every class has a branch that files it, and the structural default is unchanged for other workflows
ok(W.classify_structural("deploy-gate", {})[0] == "build-gate", "classify_structural keeps build-gate as the fallback when no jobs are readable")

# the workflow's step names are what deploy_gate_failure matches on
wf = (HERE.parent / ".github" / "workflows" / "deploy-gate.yml").read_text(encoding="utf-8")
names = re.findall(r"^\s*- name: (.+)$", wf, re.M)
ok(any(n.startswith("SUITE-RUNNER-1") for n in names), "deploy-gate.yml has a step named SUITE-RUNNER-1 ...")
ok(any(n.startswith("MERGE-BOUNDARY-GATE-1 worker load gate") for n in names), "deploy-gate.yml has the worker load gate step")
ok(any(n.startswith("Gate every changed worker dir") for n in names), "deploy-gate.yml has the build step the watchdog recognises")
ok("merge_group:" in wf and "worker-load-gate.mjs" in wf and "changed-suites.txt" in wf, "deploy-gate.yml carries the merge_group trigger, the load gate and the root-file marker")
ok(re.search(r"--changed-file /tmp/changed-suites\.txt", wf) is not None, "the PR suite selection reads the file that carries the root-file marker")

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
