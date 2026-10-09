#!/usr/bin/env python3
"""CLAIM-REAPER-1 (2026-10-09, pillar autonomy; owner request 2026-10-09 "Schedule regular audits and remediate as needed").

WHAT  Releases work claims whose pull request is already merged or closed. CLAUDE.md WORK-CLAIM-1: a session holds a claim
      "until your PR merges or you stop, then release"; a session that stops without releasing leaves the claim live until
      its expiry (up to 2 h), and every other session is refused the file meanwhile. Measured 2026-10-09: the claim on
      qnfo-research-exec/worker.js for PR 826 stayed live for 2 h after the merge while the in-house publish defect it left
      blocked every paper. For each unreleased, unexpired work_claims row with a pr, this reads the PR from the GitHub API
      and, when it was merged or closed more than GRACE_MIN minutes ago, sets released_at and outcome ('merged-reaped' or
      'closed-reaped') in the ledger and ends the matching deploy_locks lease (worker 'work:<key>'), the two records
      qnfo-deploy-guard /work-lock/acquire reads. Each release is a cloud_ops_events row (kind claim-reaper) and the run
      writes a heartbeat row. Claims without a pr, and claims on an open PR, are never touched.
RUNS  A step of remediation-consumer.yml (hourly, dispatched by qnfo-cloud-ops when the consumer is idle 60 min). Never fails
      the job.
"""
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import remediation_consumer as RC  # noqa: E402

REPO = os.environ.get("GITHUB_REPOSITORY", "QNFO/qnfo-workers")
GRACE_MIN = int(os.environ.get("CLAIM_REAPER_GRACE_MIN", "30"))


def gh_pr(n, token=None):
    token = token or os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    req = urllib.request.Request("https://api.github.com/repos/%s/pulls/%d" % (REPO, int(n)),
                                 headers=dict({"Accept": "application/vnd.github+json", "User-Agent": "qnfo-claim-reaper"},
                                              **({"Authorization": "Bearer " + token} if token else {})))
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def age_min(iso, now=None):
    if not iso:
        return None
    t = time.mktime(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone
    return ((now or time.time()) - t) / 60.0


def lock_key(path, issue_id):
    return "work:" + ("issue:%s" % issue_id if path and path.startswith("issue:") else (path if path.startswith("file:") else "file:" + path))


def main(d1=None, pr=gh_pr, now=None):
    d1 = d1 or RC.d1
    out = {"claim_reaper": "ok", "checked": 0, "released": []}
    try:
        rows = d1("SELECT id, path, holder, issue_id, pr, expires_at FROM work_claims WHERE released_at IS NULL AND pr IS NOT NULL "
                  "AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ORDER BY claimed_at LIMIT 50")
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"claim_reaper": "read-failed", "error": str(e)[:200]}))
        return 0
    seen = {}
    for r in rows:
        n = int(r.get("pr") or 0)
        if n <= 0:
            continue
        out["checked"] += 1
        try:
            p = seen.get(n) or pr(n)
            seen[n] = p
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"claim_reaper": "pr-read-failed", "pr": n, "error": str(e)[:160]}))
            continue
        if p.get("state") != "closed":
            continue
        ended = p.get("merged_at") or p.get("closed_at")
        a = age_min(ended, now)
        if a is None or a < GRACE_MIN:
            continue
        outcome = "merged-reaped" if p.get("merged_at") else "closed-reaped"
        path = str(r.get("path") or "")
        try:
            d1("UPDATE work_claims SET released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), outcome = ?1 WHERE id = ?2 AND released_at IS NULL", [outcome, r["id"]])
            d1("UPDATE deploy_locks SET expires_at = ?1 WHERE worker = ?2 AND owner = ?3 AND typeof(expires_at) IN ('integer', 'real')",
               [int(time.time() * 1000), lock_key(path, r.get("issue_id")), r.get("holder")])
            stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            d1("INSERT INTO cloud_ops_events (id, ts, kind, status, text, job) VALUES (?1, ?2, 'claim-reaper', 'ok', ?3, 'claim-reaper')",
               ["claim-reaper-%s-%s" % (r["id"], stamp), stamp, "CLAIM-REAPER-1 released %s held by %s: PR %d %s %d min ago" % (path, r.get("holder"), n, outcome.split("-")[0], int(a))])
            out["released"].append({"path": path, "pr": n, "outcome": outcome})
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"claim_reaper": "release-failed", "path": path, "error": str(e)[:160]}))
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        d1("INSERT INTO cloud_ops_events (id, ts, kind, status, text, job) VALUES (?1, ?2, 'claim-reaper-run', 'ok', ?3, 'claim-reaper') "
           "ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, text = excluded.text", ["claim-reaper-run-" + stamp[:13], stamp, json.dumps(out)[:500]])
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"claim_reaper": "heartbeat-failed", "error": str(e)[:160]}))
    print(json.dumps(out))
    return 0


def selftest():
    import sqlite3
    c = sqlite3.connect(":memory:")
    c.executescript("""
CREATE TABLE work_claims (id INTEGER PRIMARY KEY, path TEXT, intent TEXT, holder TEXT, issue_id INTEGER, pr INTEGER, claimed_at TEXT, expires_at TEXT, released_at TEXT, outcome TEXT);
CREATE TABLE deploy_locks (worker TEXT PRIMARY KEY, owner TEXT, since INTEGER, expires_at INTEGER);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, status TEXT, text TEXT, job TEXT);
""")
    fut = "2999-01-01T00:00:00Z"
    c.execute("INSERT INTO work_claims VALUES (1,'qnfo-research-exec/worker.js','x','s1',NULL,826,'2026-10-09T07:00:00Z',?,NULL,NULL)", [fut])
    c.execute("INSERT INTO work_claims VALUES (2,'idea-hub/worker.js','x','s2',NULL,900,'2026-10-09T07:00:00Z',?,NULL,NULL)", [fut])
    c.execute("INSERT INTO work_claims VALUES (3,'docs/x.md','x','s3',NULL,NULL,'2026-10-09T07:00:00Z',?,NULL,NULL)", [fut])
    c.execute("INSERT INTO work_claims VALUES (4,'issue:2186','x','s4',2186,901,'2026-10-09T07:00:00Z',?,NULL,NULL)", [fut])
    for w, o in (("work:file:qnfo-research-exec/worker.js", "s1"), ("work:file:idea-hub/worker.js", "s2"), ("work:issue:2186", "s4")):
        c.execute("INSERT INTO deploy_locks VALUES (?, ?, 0, 99999999999999)", [w, o])

    def d1(sql, params=None):
        sql = sql.replace("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", "'2026-10-09T09:00:00Z'")
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, x)) for x in cur.fetchall()]

    prs = {826: {"state": "closed", "merged_at": "2026-10-09T07:37:00Z"}, 900: {"state": "open"},
           901: {"state": "closed", "merged_at": None, "closed_at": "2026-10-09T08:50:00Z"}}
    now = time.mktime(time.strptime("2026-10-09T09:00:00", "%Y-%m-%dT%H:%M:%S")) - time.timezone
    assert main(d1, lambda n: prs[n], now) == 0
    rel = dict(c.execute("SELECT id, outcome FROM work_claims WHERE released_at IS NOT NULL"))
    assert rel == {1: "merged-reaped"}, rel  # 900 open; 901 closed only 10 min ago (grace); 3 has no pr
    locks = dict(c.execute("SELECT worker, expires_at FROM deploy_locks"))
    assert locks["work:file:qnfo-research-exec/worker.js"] < 99999999999999 and locks["work:file:idea-hub/worker.js"] == 99999999999999
    assert c.execute("SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'claim-reaper'").fetchone()[0] == 1
    print("claim_reaper selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
