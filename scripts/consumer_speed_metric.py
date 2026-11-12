#!/usr/bin/env python3
"""CONSUMER-SPEED-METRIC-1 (2026-11-12, charter pillar autonomy): the speed of remediation-consumer.yml as two measured metrics, so a regression files its own issue.

Measured 2026-11-04: one consume job took 26-32 minutes and three runs were cancelled at the 30-minute cap. CONSUMER-SPEED-1 split the workflow (a run is now about 7 minutes) and
scripts/consumer-run-timing.mjs measured it by hand. This is the producer that runs every cycle (the `audits` job, with the run's own token) and writes, to qnfo-audit.metric_registry
(refresh_class 'runner'):
  consumer_run_median_min_24h          median wall-clock minutes of the scheduled and push runs of the last 24 h that did not start the heavy job (target < 12)
  consumer_run_cap_cancellations_24h   jobs of those runs that were cancelled after running to within a minute of their cap (target 0)
It ports summarize() of consumer-run-timing.mjs: a skipped job carries equal start and end times and is not a run of that job; a run whose consume job never finished (gated out or
superseded) says nothing about speed; workflow_dispatch runs queue behind each other and inflate wall-clock, so they are excluded. GitHub REST budget (shared token): one runs list
and at most MAX_JOBS_READS (12) jobs reads per cycle. A metric that cannot be measured (no run in the window, an API error) is left untouched: unknown is never a value.

Usage: python3 scripts/consumer_speed_metric.py [--dry]      python3 scripts/consumer_speed_metric.py --selftest
Never fails the job.
"""
import calendar
import json
import os
import sys
import time
import urllib.parse
import urllib.request

REPO = os.environ.get("GITHUB_REPOSITORY", "QNFO/qnfo-workers")
WORKFLOW = "remediation-consumer.yml"
HOURS = 24
MAX_JOBS_READS = 12
CAPS_MIN = {"consume": 25, "sweeps": 25, "audits": 25, "views": 25, "heavy": 50}
LEGACY_CAP_MIN = 30
M_MEDIAN = "consumer_run_median_min_24h"
M_CAPS = "consumer_run_cap_cancellations_24h"


def epoch(iso):
    return calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S"))


def minutes(a, b):
    return (epoch(b) - epoch(a)) / 60.0


def median(xs):
    if not xs:
        return None
    s = sorted(xs)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2.0


def ran(j):
    return bool(j.get("started_at") and j.get("completed_at") and j.get("conclusion") != "skipped")


def finished(j):
    return ran(j) and j.get("conclusion") in ("success", "failure")


def capped(j):
    cap = CAPS_MIN.get(j.get("name"))
    return bool(ran(j) and j.get("conclusion") == "cancelled" and cap and minutes(j["started_at"], j["completed_at"]) >= min(cap, LEGACY_CAP_MIN) - 1)


def summarize(runs):
    """runs: [{id, jobs: [...]}] already filtered to non-dispatch runs in the window. -> (median_min or None, cap_cancellations, counted runs)."""
    noheavy, caps, counted = [], 0, 0
    for r in runs:
        jobs = [j for j in (r.get("jobs") or []) if ran(j)]
        caps += sum(1 for j in jobs if capped(j))
        c = next((j for j in jobs if j.get("name") == "consume" and (finished(j) or capped(j))), None)
        if not c:
            continue
        counted += 1
        if not any(j.get("name") == "heavy" for j in jobs):
            noheavy.append((max(epoch(j["completed_at"]) for j in jobs) - min(epoch(j["started_at"]) for j in jobs)) / 60.0)
    return median(noheavy), caps, counted, len(noheavy)


def gh(path, token):
    req = urllib.request.Request("https://api.github.com/" + path, headers={"Accept": "application/vnd.github+json", "User-Agent": "qnfo-consumer-speed",
                                                                          **({"Authorization": "Bearer " + token} if token else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def collect(get, now=None):
    now = now or time.time()
    since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - HOURS * 3600))
    q = "repos/%s/actions/workflows/%s/runs?per_page=30&status=completed&created=%s" % (REPO, WORKFLOW, urllib.parse.quote(">=" + since))
    listing = get(q).get("workflow_runs") or []
    picked = [r for r in listing if r.get("event") != "workflow_dispatch"][:MAX_JOBS_READS]
    runs = [{"id": r["id"], "jobs": get("repos/%s/actions/runs/%s/jobs?per_page=20" % (REPO, r["id"])).get("jobs") or []} for r in picked]
    return summarize(runs)


def fmt(v):
    return str(int(v)) if float(v) == int(v) else ("%.1f" % v)


def main(d1=None, get=None, dry=False):
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    get = get or (lambda p: gh(p, token))
    try:
        med, caps, counted, n_noheavy = collect(get)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"consumer_speed_metric": "read-failed", "error": str(e)[:200]}))
        return 0
    out = {"consumer_speed_metric": "ok", "runs_counted": counted, "runs_without_heavy": n_noheavy, M_MEDIAN: med, M_CAPS: caps if counted else None}
    print(json.dumps(out))
    if dry or counted == 0:
        return 0
    if d1 is None:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import remediation_consumer as RC  # noqa: E402
        d1 = RC.d1
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for metric, val in ((M_MEDIAN, med), (M_CAPS, caps)):
        if val is None:
            continue
        try:
            d1("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2, state = 'MEASURED', refresh_class = 'runner' WHERE metric = ?3", [fmt(val), stamp, metric])
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"consumer_speed_metric": "write-failed", "metric": metric, "error": str(e)[:160]}))
    return 0


def selftest():
    fail = 0
    t0 = calendar.timegm(time.strptime("2026-11-12T10:00:00", "%Y-%m-%dT%H:%M:%S"))

    def at(m):
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t0 + m * 60))

    def job(name, start, mins, conc="success"):
        return {"name": name, "conclusion": conc, "started_at": at(start), "completed_at": at(start + mins)}

    def skipped(name, start):
        return {"name": name, "conclusion": "skipped", "started_at": at(start), "completed_at": at(start)}

    def ok(c, m, x=None):
        nonlocal fail
        print(("PASS " if c else "FAIL ") + m + ("" if c else " " + json.dumps(x)))
        fail += 0 if c else 1

    clean = {"id": 1, "jobs": [job("consume", 0, 6.5), job("sweeps", 0, 6.2), job("audits", 0, 5.4), job("views", 0, 3.8), skipped("heavy", 0)]}
    med, caps, n, nh = summarize([clean])
    ok(abs(med - 6.5) < 1e-9 and caps == 0 and n == 1, "a clean 7-minute run reads about 6.5 minutes, no cancellations", (med, caps, n))
    bad = {"id": 2, "jobs": [job("consume", 0, 30, "cancelled")]}
    med, caps, n, nh = summarize([bad, bad])
    ok(med == 30 and caps == 2, "the 2026-11-04 shape (consume cancelled at the 30-minute cap) reads 30 minutes and 2 cancellations", (med, caps))
    med, caps, n, nh = summarize([{"id": 3, "jobs": [job("consume", 0, 3, "cancelled"), job("sweeps", 0, 5)]}])
    ok(caps == 0 and n == 0 and med is None, "a consume job cancelled after 3 minutes is superseded: no cancellation, not a counted run", (med, caps, n))
    heavy = {"id": 4, "jobs": [job("consume", 0, 6), job("heavy", 0, 24)]}
    med, caps, n, nh = summarize([clean, heavy])
    ok(n == 2 and nh == 1 and abs(med - 6.5) < 1e-9, "a run that ran the heavy job is counted but kept out of the median", (med, n, nh))
    ok(summarize([{"id": 5, "jobs": [skipped("consume", 0), skipped("sweeps", 0)]}])[2] == 0, "a gated-out run is not counted")
    ok(summarize([])[0] is None, "no run is unknown (None), never a value")
    ok(median([3, 1, 2]) == 2 and median([1, 2, 3, 4]) == 2.5 and fmt(6.5) == "6.5" and fmt(0) == "0", "median and fmt")

    # The REST budget and the dispatch exclusion, through collect() with a fake API.
    calls = []

    def fake(path):
        calls.append(path)
        if "/jobs" in path:
            return {"jobs": clean["jobs"]}
        evs = ["workflow_dispatch"] + ["schedule"] * 20
        return {"workflow_runs": [{"id": 100 + i, "event": e} for i, e in enumerate(evs)]}

    med, caps, n, nh = collect(fake, now=t0 + 3600)
    jobs_calls = [c for c in calls if "/jobs" in c]
    ok(len(calls) == 1 + MAX_JOBS_READS and len(jobs_calls) == MAX_JOBS_READS and all("/runs/100/" not in c for c in jobs_calls), "one runs list plus at most 12 jobs reads, and the manual dispatch is never read", calls)

    writes = []
    main(d1=lambda sql, p=None: writes.append((sql, p)), get=fake)
    ok(len(writes) == 2 and {w[1][2] for w in writes} == {M_MEDIAN, M_CAPS} and all("refresh_class = 'runner'" in w[0] for w in writes), "main writes both metrics as runner-refreshed", writes)
    writes.clear()
    main(d1=lambda sql, p=None: writes.append(1), get=lambda p: {"workflow_runs": []})
    ok(not writes, "no run in the window writes nothing")
    print("consumer_speed_metric selftest: " + ("%d FAILED" % fail if fail else "ok"))
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main(dry="--dry" in sys.argv))
