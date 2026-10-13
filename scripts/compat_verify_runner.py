#!/usr/bin/env python3
"""COMPAT-VERIFY-RUNNER-1 (2026-10-13, agent_issues 2411, metric workers_compat_date_behind, pillar core).

WHAT   The second half of a caller-verified compatibility-date advance. canonical-deploy.yml calls /ops/deploy with
       compat_verify "caller" (scripts/canonical_deploy.py --compat-verify caller), and every answer that says
       compat.pending_verify is one JSON line in --pending (worker, previous_date, new_date, expected_version, reviewed,
       source_sha, path). This script polls each worker's /health from the GitHub runner for up to --window-min minutes, all
       workers in the same rounds (canary_revert.poll), until it answers the expected VERSION, then answers
       POST /ops/compat-verify on qnfo-ops: ok true records the verification, ok false makes qnfo-ops upload the deployed
       source again with the previous date (deployment_history compat-restore).
WHY    qnfo-ops verifies an advance by reading the worker's /health, and a Worker cannot fetch its own account's workers.dev
       hosts (Cloudflare error 1042, issue 1190): qnfo-ops itself stayed at 2026-08-01 under a reviewed 2026-10-10
       (deployment_history 2026-10-13T07:01Z: compat_not_advanced=/health of qnfo-ops cannot be read from qnfo-ops). The
       runner is outside the account, so the read the gate needs works here; the health host is the one the control-plane
       canary reads (canary_revert.HEALTH_URL), plus ops.qnfo.org for qnfo-ops.
USAGE  python3 scripts/compat_verify_runner.py --pending /tmp/compat_pending.jsonl [--window-min 2] [--poll-sec 10] [--dry-run]
       python3 scripts/compat_verify_runner.py --selftest
       Reads OPS_ROUTER_AUTH_KEY (the /ops/deploy key), OPS_DEPLOY_URL (default https://ops.qnfo.org/ops/deploy; the verify
       route is its sibling, qnfo-ops's workers.dev host is the second path), GITHUB_RUN_ID, and CLOUDFLARE_API_TOKEN with
       CLOUDFLARE_ACCOUNT_ID for COMPAT-RESTORE-DIRECT-1: when qnfo-ops cannot restore a date that did not verify (qnfo-ops
       itself broken by its own advance, or unreachable), the runner sets the previous date with Cloudflare's PATCH
       script-settings call, which changes only that key.
EXIT   0 when every pending date was verified and recorded, or was not verified and qnfo-ops put the previous date back (a
       warning names it). 1 when a date was not verified and the restore failed or could not be asked for: the worker then runs
       at an unverified date, and qnfo-ops has filed COMPAT-RESTORE-FAILED-1 when it tried. A record that fails after a
       verified /health is a warning only. No secret is printed.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from canary_revert import HEALTH_URL, judge, poll  # noqa: E402  (the control-plane canary's health host, verdict and poll)

OPS_DEPLOY_URL = os.environ.get("OPS_DEPLOY_URL", "https://ops.qnfo.org/ops/deploy")
# qnfo-ops also answers on its custom domain; its workers.dev host stays first, as for every other worker.
EXTRA_HEALTH = {"qnfo-ops": ["https://ops.qnfo.org/health"]}
SECOND_VERIFY_URL = "https://qnfo-ops.q08.workers.dev/ops/compat-verify"
UA = "qnfo-compat-verify/1.0 (+canonical-deploy)"
REQUIRED = ("worker", "previous_date", "new_date", "expected_version")


def emit(msg):
    print(msg, flush=True)


def health_urls(worker):
    return [HEALTH_URL.format(worker=worker)] + EXTRA_HEALTH.get(worker, [])


def verify_urls(deploy_url=None):
    """The verify route next to the deploy route, then qnfo-ops's workers.dev host (a second path when ops.qnfo.org fails)."""
    base = str(deploy_url or OPS_DEPLOY_URL).rstrip("/")
    first = (base[: -len("/ops/deploy")] if base.endswith("/ops/deploy") else base.rsplit("/", 1)[0]) + "/ops/compat-verify"
    return [first] + ([SECOND_VERIFY_URL] if SECOND_VERIFY_URL != first else [])


# COMPAT-RESTORE-DIRECT-1 (2026-10-13): the second restore path. ok false asks qnfo-ops to upload the source again with the
# previous date; when that answer fails (qnfo-ops itself broken by its own advance, or unreachable), the runner sets the
# previous date with Cloudflare's PATCH script-settings call and the repository token (CLOUDFLARE_API_TOKEN,
# CLOUDFLARE_ACCOUNT_ID). A PATCH changes only the keys it names: bindings, observability and code stay as they are.
CF_API = "https://api.cloudflare.com/client/v4"


def cf_patch_compat(worker, date, token, account, timeout=30):
    """PATCH /accounts/{account}/workers/scripts/{worker}/settings with {"compatibility_date": date}. Returns (status, json)."""
    boundary = "----qnfo-compat-" + str(int(time.time() * 1000))
    part = json.dumps({"compatibility_date": date})
    body = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"settings\"\r\nContent-Type: application/json\r\n\r\n"
            + part + "\r\n--" + boundary + "--\r\n").encode("utf-8")
    req = urllib.request.Request(CF_API + "/accounts/" + account + "/workers/scripts/" + worker + "/settings", data=body, method="PATCH",
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "multipart/form-data; boundary=" + boundary, "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8") or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:  # network error: no status
        return 0, {"error": type(e).__name__}


def direct_restore(worker, previous_date, patch=cf_patch_compat, env=None):
    """The runner's own restore. Returns (restored: bool, detail: str); never raises, never prints the token."""
    env = os.environ if env is None else env
    token, account = (env.get("CLOUDFLARE_API_TOKEN") or "").strip(), (env.get("CLOUDFLARE_ACCOUNT_ID") or "").strip()
    if not token or not account:
        return False, "no CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID in the step"
    st, js = patch(worker, previous_date, token, account)
    got = ((js or {}).get("result") or {}).get("compatibility_date")
    if 200 <= st < 300 and (js or {}).get("success") and (got is None or str(got)[:10] == str(previous_date)[:10]):
        return True, "PATCH settings HTTP " + str(st) + (", compatibility_date " + str(got) if got else "")
    errs = (js or {}).get("errors") or (js or {}).get("error") or ""
    return False, "PATCH settings HTTP " + str(st) + " " + json.dumps(errs)[:200]


def read_pending(text):
    """JSON lines from canonical_deploy.py --compat-pending-file -> [entry]; the last line of a worker wins, bad lines are skipped."""
    out = {}
    for line in str(text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            e = json.loads(line)
        except ValueError:
            emit("::warning::compat-verify: a pending line is not JSON and is skipped: " + line[:120])
            continue
        if not isinstance(e, dict) or not all(e.get(k) for k in REQUIRED):
            emit("::warning::compat-verify: a pending line lacks " + ", ".join(k for k in REQUIRED if not (isinstance(e, dict) and e.get(k))) + " and is skipped")
            continue
        out[str(e["worker"])] = e
    return [out[w] for w in sorted(out)]


def fetch_json(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read(200_000).decode("utf-8", "replace"))
    except (urllib.error.URLError, ValueError, OSError):
        return None


def make_fetch(wanted, via, get=fetch_json):
    """A canary_revert.poll fetch over every health host of a worker: the first answer with the wanted VERSION, else the last
    answer that carried one, else None. `via` records which host answered."""
    def fetch(worker):
        last = None
        for url in health_urls(worker):
            h = get(url)
            st, _ = judge(h, wanted.get(worker))
            if st == "ok":
                via[worker] = url
                return h
            if st == "wrong-version" or last is None:
                last = h if h is not None else last
                if h is not None:
                    via[worker] = url
        return last
    return fetch


def post_json(url, body, token, timeout=150):
    """(status, parsed body); status 0 when the request itself failed."""
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            text = r.read().decode("utf-8", "replace")
            st = r.status
    except urllib.error.HTTPError as e:
        text, st = e.read().decode("utf-8", "replace"), e.code
    except (urllib.error.URLError, OSError, ValueError) as e:
        return 0, {"error": type(e).__name__ + ": " + str(e)[:200]}
    try:
        js = json.loads(text)
    except ValueError:
        js = {"raw": text[:300]}
    return st, js if isinstance(js, dict) else {"raw": str(js)[:300]}


def retryable(st, js):
    return st == 0 or st >= 500 or bool(isinstance(js, dict) and js.get("retryable"))


def answer(body, token, urls, post=post_json, sleep=time.sleep, attempts=3, wait_sec=15):
    """POST the verdict to the first url; a transport failure or an answer that is not qnfo-ops JSON (an edge error page)
    tries the second url, a retryable answer waits and tries again (up to `attempts` rounds). Returns (status, body) of the
    last answer."""
    st, js = 0, {"error": "not sent"}
    for attempt in range(max(1, attempts)):
        for url in urls:
            st, js = post(url, body, token)
            if 200 <= st < 300 and js.get("ok"):
                return st, js
            if st != 0 and "raw" not in js:
                break  # qnfo-ops answered; its second host would answer the same
        if not retryable(st, js) or attempt + 1 >= max(1, attempts):
            return st, js
        sleep(wait_sec * (attempt + 1))
    return st, js


def verdict_body(entry, result, via, run_id):
    ok = result.get("state") == "ok"
    body = {"worker": entry["worker"], "ok": ok, "observed_version": result.get("seen") or "", "previous_date": entry["previous_date"],
            "new_date": entry["new_date"], "expected_version": entry["expected_version"], "via": via.get(entry["worker"]) or "",
            "run": str(run_id or "")}
    for k in ("reviewed", "source_sha", "path"):
        if entry.get(k):
            body[k] = entry[k]
    return body


def settle(entries, token, window_min=2, poll_sec=10, run_id=None, get=fetch_json, post=post_json, clock=time.monotonic, sleep=time.sleep, urls=None, restore=None):
    """Poll every pending worker, then answer each verdict. Returns (exit_code, [outcome])."""
    wanted = {e["worker"]: str(e["expected_version"]) for e in entries}
    via = {}
    results = poll(wanted, window_min, poll_sec, fetch=make_fetch(wanted, via, get), clock=clock, sleep=sleep)
    urls = urls or verify_urls()
    restore = restore or direct_restore
    rc, outcomes = 0, []
    for e in entries:
        w = e["worker"]
        res = results[w]
        body = verdict_body(e, res, via, run_id)
        o = {"worker": w, "verified": body["ok"], "seen": res.get("seen"), "polls": res.get("polls"), "via": body["via"]}
        if not token:
            o.update(status=0, answer={"error": "OPS_ROUTER_AUTH_KEY is not set"})
        else:
            st, js = answer(body, token, urls, post=post, sleep=sleep)
            o.update(status=st, answer=js)
        js = o["answer"]
        done = 200 <= o["status"] < 300 and bool(js.get("ok"))
        if body["ok"]:
            o["outcome"] = "kept" if done else "kept-unrecorded"
            if done:
                emit("compat-verify: " + w + " answered " + str(res.get("seen")) + " at " + e["new_date"] + " (" + str(res.get("polls")) + " polls, " + body["via"] + "); recorded")
            else:
                emit("::warning::compat-verify: " + w + " answered " + str(res.get("seen")) + " at " + e["new_date"] + ", but the record failed (HTTP " + str(o["status"]) + ": " + json.dumps(js)[:200] + ")")
        elif done:
            o["outcome"] = "restored" if js.get("restored") else ("settled" if js.get("already") or js.get("noop") else "answered")
            emit("::warning::compat-verify: " + w + " did not answer " + e["expected_version"] + " within " + str(window_min) + " min (" + res.get("state", "") + ", saw " + str(res.get("seen")) + "); qnfo-ops answered " + o["outcome"] + ", the date is " + str(js.get("compatibility_date") or js.get("live_date") or e["previous_date"]))
        else:
            ok2, detail = restore(w, e["previous_date"])
            if ok2:
                o["outcome"] = "restored-direct"
                emit("::warning::compat-verify: " + w + " did not answer " + e["expected_version"] + " at " + e["new_date"] + "; qnfo-ops could not restore it (HTTP " + str(o["status"]) + "), so the runner set " + e["previous_date"] + " directly (" + detail + ")")
            else:
                o["outcome"] = "restore-failed"
                rc = 1
                emit("::error::compat-verify: " + w + " did not answer " + e["expected_version"] + " at " + e["new_date"] + " and the restore to " + e["previous_date"] + " failed (qnfo-ops HTTP " + str(o["status"]) + ": " + json.dumps(js)[:300] + "; direct: " + detail + ")")
        outcomes.append(o)
    return rc, outcomes


def selftest():
    checks = []

    def ok(cond, name, detail=None):
        checks.append((bool(cond), name))
        emit(("PASS " if cond else "FAIL ") + name + ("" if cond or detail is None else " -- " + str(detail)[:400]))

    ok(health_urls("qnfo-ai") == ["https://qnfo-ai.q08.workers.dev/health"], "a worker's health host is the canary's workers.dev host")
    ok(health_urls("qnfo-ops") == ["https://qnfo-ops.q08.workers.dev/health", "https://ops.qnfo.org/health"], "qnfo-ops is also read on ops.qnfo.org")
    ok(verify_urls("https://ops.qnfo.org/ops/deploy") == ["https://ops.qnfo.org/ops/compat-verify", SECOND_VERIFY_URL], "the verify route is the deploy route's sibling, workers.dev second")
    ok(verify_urls("https://qnfo-ops.q08.workers.dev/ops/deploy") == [SECOND_VERIFY_URL], "no duplicate second path")
    good = {"worker": "w", "previous_date": "2026-08-01", "new_date": "2026-10-10", "expected_version": "1.0.1", "reviewed": "2026-10-12", "source_sha": "a" * 40, "path": "w/worker.js"}
    pend = read_pending("\n".join([json.dumps(dict(good, expected_version="1.0.0")), "not json", json.dumps({"worker": "x"}), "", json.dumps(good), json.dumps(dict(good, worker="v"))]))
    ok([e["worker"] for e in pend] == ["v", "w"] and pend[1]["expected_version"] == "1.0.1", "read_pending: last line per worker wins, bad and incomplete lines are skipped", pend)

    # canonical_deploy.py: the request field and the pending line
    import canonical_deploy as cd
    ok(cd.deploy_body("w", "w/worker.js", "main", False, "caller") == {"worker": "w", "path": "w/worker.js", "ref": "main", "compat_verify": "caller"}, "canonical_deploy sends compat_verify caller when asked")
    ok("compat_verify" not in cd.deploy_body("w", "w/worker.js", "main", True), "and nothing without it (the default mode is unchanged)")
    ans = {"ok": True, "compat": {"pending_verify": True, "previous_date": "2026-08-01", "new_date": "2026-10-10", "expected_version": "1.0.1", "reviewed": "2026-10-12", "source_sha": "a" * 40, "path": "w/worker.js"}}
    ok(cd.pending_entry("w", "w/worker.js", ans) == good, "pending_entry: an answer with compat.pending_verify becomes one pending line", cd.pending_entry("w", "w/worker.js", ans))
    ok(cd.pending_entry("w", "p", {"ok": True, "compat": {"applied": True, "kept": True}}) is None and cd.pending_entry("w", "p", dict(ans, ok=False)) is None and cd.pending_entry("w", "p", {"ok": True}) is None, "no pending line for an in-account advance, a failed deploy or no compat")

    # the poll over two hosts, and the verdicts
    def clocked():
        t = {"v": 0.0}
        return (lambda: t["v"]), (lambda s: t.__setitem__("v", t["v"] + s))
    answers = {"https://w.q08.workers.dev/health": [{"version": "1.0.0"}, {"version": "1.0.1"}],
               "https://qnfo-ops.q08.workers.dev/health": [None], "https://ops.qnfo.org/health": [{"version": "2.46.0"}],
               "https://v.q08.workers.dev/health": [{"version": "0.9.0"}]}
    seen_n = {}

    def get(url):
        i = seen_n.get(url, 0)
        seen_n[url] = i + 1
        a = answers.get(url, [None])
        return a[min(i, len(a) - 1)]
    posts = []

    def post(url, body, token):
        posts.append((url, body))
        if body["ok"]:
            return 200, {"ok": True, "kept": True, "recorded": True}
        return 200, {"ok": True, "restored": True, "compatibility_date": body["previous_date"]}
    clock, sleep = clocked()
    entries = [good, dict(good, worker="qnfo-ops", expected_version="2.46.0"), dict(good, worker="v")]
    rc, outs = settle(sorted(entries, key=lambda e: e["worker"]), "tok", 2, 10, run_id=99, get=get, post=post, clock=clock, sleep=sleep, urls=["https://ops/x"])
    by = {o["worker"]: o for o in outs}
    ok(rc == 0 and by["w"]["outcome"] == "kept" and by["w"]["polls"] == 2 and by["qnfo-ops"]["outcome"] == "kept" and by["qnfo-ops"]["via"] == "https://ops.qnfo.org/health", "a VERSION that arrives is kept; qnfo-ops is read on ops.qnfo.org when workers.dev is silent", outs)
    ok(by["v"]["outcome"] == "restored" and by["v"]["seen"] == "0.9.0" and by["v"]["polls"] >= 12, "a VERSION that never arrives within the window is answered ok false and restored", by["v"])
    pb = {b["worker"]: b for _, b in posts}
    ok(pb["w"]["ok"] is True and pb["w"]["observed_version"] == "1.0.1" and pb["w"]["run"] == "99" and pb["w"]["source_sha"] == "a" * 40 and pb["w"]["reviewed"] == "2026-10-12", "the verdict carries the observed VERSION, the run and the restore source", pb["w"])
    ok(pb["v"]["ok"] is False and pb["v"]["previous_date"] == "2026-08-01" and pb["v"]["observed_version"] == "0.9.0", "ok false names the previous date and what /health said", pb["v"])

    # restore failure is the only failing exit; a failed record after a verified /health is a warning
    clock, sleep = clocked()
    no_direct = lambda w, d: (False, "no direct path in the test")  # noqa: E731
    rc, outs = settle([dict(good, worker="v")], "tok", 1, 10, get=get, post=lambda u, b, t: (502, {"ok": False, "restored": False, "restore_error": "CF API 400", "retryable": True}), clock=clock, sleep=sleep, urls=["https://ops/x"], restore=no_direct)
    ok(rc == 1 and outs[0]["outcome"] == "restore-failed", "a failed restore fails the step", outs)
    # COMPAT-RESTORE-DIRECT-1: when qnfo-ops cannot restore (it is the broken worker, or unreachable), the runner's PATCH does
    clock, sleep = clocked()
    direct_calls = []
    rc, outs = settle([dict(good, worker="qnfo-ops")], "tok", 1, 10, get=lambda url: (0, {}), post=lambda u, b, t: (0, {"error": "URLError"}), clock=clock, sleep=sleep, urls=["https://ops/x"], restore=lambda w, d: (direct_calls.append((w, d)) or True, "PATCH settings HTTP 200"))
    ok(rc == 0 and outs[0]["outcome"] == "restored-direct" and direct_calls == [("qnfo-ops", "2026-08-01")], "qnfo-ops broken by its own advance is restored by the runner directly", [outs, direct_calls])
    fake_patch = lambda w, d, t, a: (200, {"success": True, "result": {"compatibility_date": d}})  # noqa: E731
    ok(direct_restore("qnfo-ops", "2026-08-01", patch=fake_patch, env={"CLOUDFLARE_API_TOKEN": "t", "CLOUDFLARE_ACCOUNT_ID": "a"})[0] is True, "direct_restore accepts a PATCH that reports the previous date")
    ok(direct_restore("qnfo-ops", "2026-08-01", patch=lambda w, d, t, a: (200, {"success": True, "result": {"compatibility_date": "2026-10-10"}}), env={"CLOUDFLARE_API_TOKEN": "t", "CLOUDFLARE_ACCOUNT_ID": "a"})[0] is False, "direct_restore refuses a PATCH whose answer keeps the new date")
    ok(direct_restore("qnfo-ops", "2026-08-01", patch=lambda w, d, t, a: (403, {"success": False, "errors": [{"code": 10000}]}), env={"CLOUDFLARE_API_TOKEN": "t", "CLOUDFLARE_ACCOUNT_ID": "a"})[0] is False, "direct_restore reports a refused PATCH")
    r_noenv = direct_restore("qnfo-ops", "2026-08-01", patch=fake_patch, env={})
    ok(r_noenv[0] is False and "CLOUDFLARE_API_TOKEN" in r_noenv[1], "direct_restore without the repository token says so and does nothing", r_noenv)
    leak = direct_restore("qnfo-ops", "2026-08-01", patch=lambda w, d, t, a: (401, {"success": False, "errors": [{"message": "bad"}]}), env={"CLOUDFLARE_API_TOKEN": "sekret-token", "CLOUDFLARE_ACCOUNT_ID": "a"})
    ok("sekret-token" not in leak[1], "the token never appears in the detail")
    seen_n.clear()
    clock, sleep = clocked()
    rc, outs = settle([good], "tok", 1, 10, get=get, post=lambda u, b, t: (0, {"error": "timeout"}), clock=clock, sleep=sleep, urls=["https://ops/x"])
    ok(rc == 0 and outs[0]["outcome"] == "kept-unrecorded", "a verified date whose record fails is a warning, not a failure", outs)
    clock, sleep = clocked()
    rc, outs = settle([dict(good, worker="v")], "", 1, 10, get=get, post=post, clock=clock, sleep=sleep, urls=["https://ops/x"], restore=no_direct)
    ok(rc == 1 and outs[0]["outcome"] == "restore-failed", "without the key a date that did not verify is a failure (nothing could restore it)", outs)
    clock, sleep = clocked()
    rc, outs = settle([dict(good, worker="v")], "tok", 1, 10, get=get, post=lambda u, b, t: (200, {"ok": True, "already": "compat-restore"}), clock=clock, sleep=sleep, urls=["https://ops/x"])
    ok(rc == 0 and outs[0]["outcome"] == "settled", "an advance qnfo-ops already settled is not a failure", outs)

    # answer(): second host on a transport failure, retry on a retryable answer, stop on a definite refusal
    calls, slept = [], []

    def seq(answers_):
        it = iter(answers_)

        def p(url, body, token):
            calls.append(url)
            return next(it)
        return p
    st, js = answer({"ok": False}, "t", ["https://a", "https://b"], post=seq([(0, {"error": "x"}), (200, {"ok": True, "restored": True})]), sleep=slept.append)
    ok(st == 200 and calls == ["https://a", "https://b"] and slept == [], "a transport failure tries the second host at once", calls)
    calls.clear()
    st, js = answer({"ok": False}, "t", ["https://a", "https://b"], post=seq([(502, {"raw": "<html>bad gateway"}), (200, {"ok": True, "restored": True})]), sleep=slept.append)
    ok(st == 200 and calls == ["https://a", "https://b"], "an edge error page tries the second host too", calls)
    calls.clear()
    st, js = answer({"ok": False}, "t", ["https://a", "https://b"], post=seq([(502, {"ok": False, "restored": False, "retryable": True}), (200, {"ok": True, "restored": True})]), sleep=slept.append)
    ok(st == 200 and calls == ["https://a", "https://a"] and slept == [15], "qnfo-ops's own failed restore is asked again after a wait, not twice at once", [calls, slept])
    del slept[:]
    calls.clear()
    st, js = answer({"ok": False}, "t", ["https://a", "https://b"], post=seq([(409, {"ok": False, "retryable": True}), (200, {"ok": True})]), sleep=slept.append)
    ok(st == 200 and calls == ["https://a", "https://a"] and slept == [15], "a retryable answer (held lock) waits and asks again", [calls, slept])
    calls.clear()
    st, js = answer({"ok": False}, "t", ["https://a", "https://b"], post=seq([(409, {"ok": False, "error": "no pending"})]), sleep=slept.append)
    ok(st == 409 and calls == ["https://a"], "a definite refusal is returned at once", calls)
    calls.clear()
    st, js = answer({"ok": False}, "t", ["https://a"], post=seq([(502, {"ok": False})] * 3), sleep=slept.append, attempts=3)
    ok(st == 502 and len(calls) == 3, "at most three rounds", calls)

    fails = [n for c, n in checks if not c]
    emit("compat-verify-runner selftest: " + ("ok, " + str(len(checks)) + " checks" if not fails else str(len(fails)) + " FAILED"))
    return 0 if not fails else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pending", help="JSON lines written by canonical_deploy.py --compat-pending-file")
    ap.add_argument("--window-min", type=int, default=2, help="minutes to wait for the expected VERSION (default 2)")
    ap.add_argument("--poll-sec", type=int, default=10)
    ap.add_argument("--dry-run", action="store_true", help="print the plan, poll nothing, answer nothing")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    if not a.pending:
        ap.error("--pending is required")
    try:
        with open(a.pending, encoding="utf-8") as fh:
            entries = read_pending(fh.read())
    except OSError:
        entries = []
    if not entries:
        emit("compat-verify: no compatibility date awaits verification")
        return 0
    emit("compat-verify: " + ", ".join(e["worker"] + " " + e["previous_date"] + "->" + e["new_date"] + " expects " + e["expected_version"] for e in entries) + " (window " + str(a.window_min) + " min)")
    if a.dry_run:
        return 0
    token = os.environ.get("OPS_ROUTER_AUTH_KEY", "").strip()
    rc, _ = settle(entries, token, a.window_min, a.poll_sec, run_id=os.environ.get("GITHUB_RUN_ID"))
    return rc


if __name__ == "__main__":
    sys.exit(main())
