#!/usr/bin/env python3
"""CI-ACTION-IDENTITY-1 offline suite for scripts/ci_watchdog.py and scripts/ci_watchdog_resolve.py (no network).

Proves, for the workflows that run a different action per manual dispatch (cf-ops-actions, owner-client-keys,
fleet-autodeploy; ci-watchdog #1033):
  * a dispatched run whose run-name names the action is keyed per action; push and plain runs keep the workflow name
  * only a later green run of the SAME action supersedes or closes a failed one
  * the action's own RESULT_JSON line becomes the finding's fix line, not "inspect the job log"
  * the three workflows declare a run-name that names the action
Run: python3 scripts/ci_watchdog_action_test.py   -> "N passed, 0 failed"
"""
import importlib.util, os, pathlib, sys
HERE = pathlib.Path(__file__).resolve().parent
def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
os.environ.setdefault("DRY_RUN", "1")
W = load("ciw", "ci_watchdog.py"); R = load("ciwr", "ci_watchdog_resolve.py")
passed = failed = 0
def ok(c, m):
    global passed, failed
    if c: passed += 1
    else: failed += 1; print("FAIL " + m)

def run(i, title, concl, t, event="workflow_dispatch", name="cf-ops-actions", wf=7):
    return {"id": i, "name": name, "display_title": title, "conclusion": concl, "created_at": t, "event": event, "head_branch": "main", "workflow_id": wf}

fail = run(1, "cf-ops-actions gen-activitypub-key qnfo-gateway", "failure", "2026-10-12T13:53:25Z")
ok(W.action_key(fail) == "cf-ops-actions gen-activitypub-key qnfo-gateway", "a dispatched run is keyed by its action title")
ok(W.action_key(run(2, "cf-ops-actions", "failure", "t")) is None, "a run titled with the bare workflow name keeps the workflow subject")
ok(W.action_key(run(3, "fleet-autodeploy mode", "failure", "t", event="push", name="fleet-autodeploy")) is None, "a push run is never per-action")
ok(W.action_key(run(4, "cf-ops-actions  report   ", "failure", "t")) == "cf-ops-actions report", "whitespace is normalised (an empty target)")

other_green = run(5, "cf-ops-actions report", "success", "2026-10-12T14:00:00Z")
same_green = run(6, "cf-ops-actions gen-activitypub-key qnfo-gateway", "success", "2026-10-12T14:30:00Z")
ok(W.superseded_by_green(fail, [other_green, fail]) is None, "a green run of another action does not supersede the failure")
ok((W.superseded_by_green(fail, [same_green, other_green, fail]) or {}).get("id") == 6, "a green re-run of the same action supersedes it")
plain_fail = run(7, "WORKERS-BP fix (#1022)", "failure", "2026-10-12T12:02:05Z", event="push", name="apply-migrations", wf=9)
plain_green = run(8, "another commit", "success", "2026-10-12T14:06:22Z", event="push", name="apply-migrations", wf=9)
ok((W.superseded_by_green(plain_fail, [plain_green, plain_fail]) or {}).get("id") == 8, "plain workflows keep the any-later-green rule")

log = ("2026-10-12T13:53:20Z some line\n2026-10-12T13:53:21Z RESULT_JSON=" +
       '{"action": "gen-activitypub-key", "next_step": "deploy qnfo-gateway with the actor routes", "ok": false, "put_http": [201, 201], "rotated": false, "verified_present": ["AP_PRIVATE_KEY", "AP_PUBLIC_KEY"], "worker": "qnfo-gateway"}\n')
res = W.result_json(log)
ok(res and res["action"] == "gen-activitypub-key" and res["ok"] is False, "the RESULT_JSON line is read from a timestamped job log")
h = W.result_hint(res)
ok("deploy qnfo-gateway with the actor routes" in h and "[201, 201]" in h and "same run title" in h, "the finding names the next step and the HTTP codes the action saw: " + h)
ok(W.result_json("no result here\n") is None and W.result_json("RESULT_JSON={not json}\n") is None, "no or broken RESULT_JSON is ignored")
ok(W.classify(log, "cf-ops-actions")[0] == "unknown", "the result line does not change the text classes (the loop adds action-result)")

wfs = [{"id": 7, "name": "cf-ops-actions", "path": ".github/workflows/cf-ops-actions.yml", "state": "active"},
       {"id": 9, "name": "apply-migrations", "path": ".github/workflows/apply-migrations.yml", "state": "active"}]
ok(R.split_action("cf-ops-actions gen-activitypub-key qnfo-gateway", wfs) == ("cf-ops-actions", "cf-ops-actions gen-activitypub-key qnfo-gateway"), "the resolver splits a per-action subject")
ok(R.split_action("apply-migrations", wfs) == ("apply-migrations", None), "a plain subject stays plain")
ok(R.split_action("not-a-workflow with spaces", wfs) == ("not-a-workflow with spaces", None), "an unknown head is not split")
calls = []
def fake_gh(path, method="GET", body=None):
    calls.append(path)
    if "/workflows/7/runs" in path: return 200, {"workflow_runs": [other_green]}
    return 404, None
R.gh = fake_gh
ok(R.latest_green("cf-ops-actions gen-activitypub-key qnfo-gateway", "2026-10-12T13:53:25Z", wfs) is None, "the resolver keeps the finding open when only another action went green")
def fake_gh2(path, method="GET", body=None):
    if "/workflows/7/runs" in path: return 200, {"workflow_runs": [other_green, same_green]}
    return 404, None
R.gh = fake_gh2
ok((R.latest_green("cf-ops-actions gen-activitypub-key qnfo-gateway", "2026-10-12T13:53:25Z", wfs) or {}).get("id") == 6, "and closes it on the same action's green run")

root = HERE.parent / ".github" / "workflows"
for f, needle in [("cf-ops-actions.yml", "run-name: cf-ops-actions ${{ inputs.action }}"), ("owner-client-keys.yml", "run-name: owner-client-keys ${{ inputs.mode }}"),
                  ("fleet-autodeploy.yml", "format('fleet-autodeploy {0}', inputs.mode)")]:
    ok(needle in (root / f).read_text(), f + " names the action in its run title")
print("%d passed, %d failed" % (passed, failed)); sys.exit(1 if failed else 0)
