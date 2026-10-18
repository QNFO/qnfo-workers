#!/usr/bin/env python3
"""artifacts_canonical_sync.py -- ARTIFACTS-CANONICAL-SYNC-1

WHY THIS EXISTS
  Cloudflare Artifacts holds a copy of all 182 QNFO/rwnq8 repositories, but the copy is a
  POINT-IN-TIME SNAPSHOT: it was taken on 2026-10-18 and nothing advances it afterwards. The
  owner directive is that the Artifacts copy stays CANONICALLY IN SYNC WITH GITHUB
  automatically. GitHub is the source of truth; Artifacts is the replica that every Worker,
  database, graph and AI index reads from.

  Artifacts' own `import` route cannot do this: re-importing an existing repo fails with
  `10201: repo already exists` (verified 2026-10-18 against qnfo/ignorance-audit). So
  convergence needs two operations that ARE reachable:
    1. DETECT  -- compare GitHub's HEAD commit for a repo with the Artifacts HEAD commit.
    2. REPAIR  -- recreate the replica by DELETE + IMPORT (asynchronous, verify afterwards).

WHAT IT WRITES
  qnfo-audit.artifact_sync_state  one row per repo: both HEADs, in_sync, drift_since, counters.
  qnfo-audit.artifact_sync_runs   one row per run: the audit trail.

EXIT CONTRACT
  0 all repos converged (or repaired this run)
  2 drift remains (detected but not repaired) -- a caller may gate on this
  3 the run could not read one of its sources (fail closed, never report a false "in sync")

USAGE
  python scripts/artifacts_canonical_sync.py                # audit only, writes state
  python scripts/artifacts_canonical_sync.py --repair       # audit + repair drifted live repos
  python scripts/artifacts_canonical_sync.py --repair --limit 5 --namespace qnfo
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

CF = "https://api.cloudflare.com/client/v4"
GH = "https://api.github.com"
D1_ID = os.environ.get("QNFO_AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
NS_DEFAULT = ["qnfo", "rwnq8"]


def _call(url, token, method="GET", body=None, timeout=45):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "qnfo-artifacts-canonical-sync/1.0")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:400]}
    except Exception as e:  # network / timeout
        return 0, {"error": str(e)}


class Ctx:
    def __init__(self):
        self.cf_token = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
        self.account = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID")
        self.gh_token = os.environ.get("GITHUB_TOKEN")
        missing = [n for n, v in (("CLOUDFLARE_API_TOKEN", self.cf_token),
                                  ("CLOUDFLARE_ACCOUNT_ID", self.account),
                                  ("GITHUB_TOKEN", self.gh_token)) if not v]
        if missing:
            die("missing credentials: " + ", ".join(missing))
        self.art = CF + "/accounts/" + self.account


def die(msg, code=3):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(code)


def d1(ctx, sql, params=None):
    body = {"sql": sql}
    if params:
        body["params"] = params
    st, j = _call(CF + "/accounts/" + ctx.account + "/d1/database/" + D1_ID + "/query",
                  ctx.cf_token, "POST", body)
    if st != 200 or not j.get("success"):
        return None, j.get("errors") or j
    res = j.get("result") or []
    return (res[0].get("results") if res else []), None


def load_ledger(ctx, namespaces):
    rows, err = d1(ctx, "SELECT id, owner, name, artifacts_name, namespace, github_url, default_branch, "
                        "archived, status, waived_reason FROM artifact_repos ORDER BY namespace, name")
    if err:
        die("cannot read artifact_repos: " + json.dumps(err)[:300])
    return [r for r in rows if r["namespace"] in namespaces]


def _iso(v):
    """Artifacts returns committedAt as a Unix epoch integer; GitHub returns an ISO string.
    Normalise both so drift is compared on one clock."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(v))
    return str(v)


def artifacts_head(ctx, ns, name, branch):
    q = urllib.parse.urlencode({"ref": branch, "limit": 1})
    st, j = _call(ctx.art + "/artifacts/namespaces/" + ns + "/repos/" + name + "/log?" + q, ctx.cf_token)
    if st == 200:
        log = j.get("result") or []
        if log:
            return {"sha": log[0].get("hash"), "committed_at": log[0].get("committedAt")}, None
        return {"sha": None, "committed_at": None}, None
    if st == 404:
        return {"sha": None, "committed_at": None}, "artifacts_repo_missing"
    return None, "artifacts_log_http_%s" % st


def github_head(ctx, owner, repo, branch):
    url = GH + "/repos/" + owner + "/" + repo + "/commits?" + urllib.parse.urlencode(
        {"sha": branch, "per_page": 1})
    st, j = _call(url, ctx.gh_token)
    if st == 200 and isinstance(j, list) and j:
        c = j[0]
        return {"sha": c.get("sha"),
                "committed_at": ((c.get("commit") or {}).get("committer") or {}).get("date")}, None
    if st == 404:
        return None, "github_repo_missing"
    if st == 409:
        return None, "github_repo_empty"
    return None, "github_http_%s" % st


def github_meta(ctx, owner, repo):
    """The branch to compare on must come from GitHub, not from the ledger.

    Measured 2026-10-18: `repos/QNFO/ultrametric-tree-universality` has default branch
    `feature/initial-setup`. Asking GitHub for commits?sha=main does NOT fail on a missing ref --
    it falls back to the default branch -- so a ledger that says "main" silently compares GitHub's
    default-branch HEAD against Artifacts' main HEAD and reports drift that does not exist.
    """
    st, j = _call(GH + "/repos/" + owner + "/" + repo, ctx.gh_token)
    if st == 200:
        return {"default_branch": j.get("default_branch"), "archived": bool(j.get("archived"))}, None
    if st == 404:
        return None, "github_repo_missing"
    return None, "github_meta_http_%s" % st


def probe(ctx, row):
    ns = row["namespace"]
    # `.github` is stored in Artifacts as `dot-github` (repo names must start alphanumeric);
    # artifacts_name is the authority for the Artifacts path, name is the GitHub one.
    name = row.get("artifacts_name") or row["name"]
    owner, repo = row["owner"], row["name"]
    url = row.get("github_url") or ""
    # Artifacts repo name differs from the GitHub name for `.github` (stored as dot-github).
    if url:
        parts = url.rstrip("/").removesuffix(".git").split("/")
        if len(parts) >= 2:
            owner, repo = parts[-2], parts[-1]
    meta, merr = github_meta(ctx, owner, repo)
    branch = (meta or {}).get("default_branch") or row["default_branch"] or "main"
    archived = bool(row.get("archived")) or bool((meta or {}).get("archived"))
    if merr:
        return {"id": row["id"], "namespace": ns, "name": name, "branch": branch,
                "owner": owner, "repo": repo, "archived": archived,
                "artifacts_sha": None, "github_sha": None,
                "artifacts_committed_at": None, "github_committed_at": None,
                "in_sync": False, "error": merr}
    a, aerr = artifacts_head(ctx, ns, name, branch)
    g, gerr = github_head(ctx, owner, repo, branch)
    in_sync = bool(a and g and a.get("sha") and a.get("sha") == g.get("sha"))
    err = aerr or gerr
    if not (a or {}).get("sha") and not err:
        err = "artifacts_branch_missing:%s" % branch
    return {
        "id": row["id"], "namespace": ns, "name": name, "branch": branch,
        "owner": owner, "repo": repo, "archived": 1 if archived else 0,
        "waived": row.get("waived_reason"),
        "artifacts_sha": (a or {}).get("sha"), "github_sha": (g or {}).get("sha"),
        "artifacts_committed_at": _iso((a or {}).get("committed_at")),
        "github_committed_at": _iso((g or {}).get("committed_at")),
        "in_sync": in_sync, "error": err,
    }


def repair(ctx, row):
    """Converge one repo.

    Measured 2026-10-18: DELETE+IMPORT is correct but wrong-shaped for a live estate -- qnfo-workers
    stayed unreadable (10302) for over two and a half minutes and re-transferred every object for a
    few commits of difference. A delta push from a mirror clone is atomic, seconds long and leaves
    the repo readable throughout, so it is the primary path; delete+import is kept as the fallback
    for a replica that is missing entirely.
    """
    if row.get("error") == "artifacts_repo_missing":
        return reimport(ctx, row)

    args = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                         "artifacts_git_mirror.py"),
            "--namespace", row["namespace"], "--repo", row["name"],
            "--owner", row["owner"], "--github-repo", row["repo"],
            "--branch", row["branch"]]
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=900)
    except subprocess.TimeoutExpired:
        return {"repaired": False, "step": "git_mirror", "status": 0, "detail": "timeout"}
    out = (p.stdout or "").strip().splitlines()
    detail = out[-1] if out else (p.stderr or "")[-200:]
    return {"repaired": p.returncode == 0, "step": "git_mirror", "status": p.returncode,
            "detail": detail[:300]}


def reimport(ctx, row):
    """Rebuild a replica that does not exist at all (delete is skipped; nothing to delete)."""
    ns, name = row["namespace"], row["name"]
    url = "https://github.com/" + row["owner"] + "/" + row["repo"] + ".git"
    base = ctx.art + "/artifacts/namespaces/" + ns + "/repos/" + name
    # Import is asynchronous and can outlive the client timeout; that is "in progress", not "failed".
    st, j = _call(base + "/import", ctx.cf_token, "POST", {"url": url, "branch": row["branch"]},
                  timeout=300)
    if st in (200, 201):
        return {"repaired": True, "step": "import", "status": st, "detail": "imported " + url}
    if st == 0 and "timed out" in json.dumps(j):
        return {"repaired": True, "step": "import", "status": 0,
                "detail": "import still running server-side after client timeout"}
    return {"repaired": False, "step": "import", "status": st,
            "detail": json.dumps(j.get("errors") or j)[:200]}


UPSERT_STATE = """
INSERT INTO artifact_sync_state
  (repo_id, namespace, repo, branch, github_sha, artifacts_sha, in_sync,
   github_committed_at, artifacts_committed_at, last_checked, last_error,
   drift_since, repair_count, last_repaired)
VALUES %s
ON CONFLICT(repo_id) DO UPDATE SET
  github_sha = excluded.github_sha,
  artifacts_sha = excluded.artifacts_sha,
  in_sync = excluded.in_sync,
  github_committed_at = excluded.github_committed_at,
  artifacts_committed_at = excluded.artifacts_committed_at,
  last_checked = excluded.last_checked,
  last_error = excluded.last_error,
  drift_since = CASE
    WHEN excluded.in_sync = 1 THEN NULL
    WHEN artifact_sync_state.in_sync = 1 THEN excluded.last_checked
    ELSE COALESCE(artifact_sync_state.drift_since, excluded.last_checked) END
"""

STATE_TUPLE = "(?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, 0, NULL)"
PARAMS_PER_ROW = STATE_TUPLE.count("?")  # 11: two triplets + error + drift_since
# D1 refuses a statement with more than ~100 bound variables ("7500: too many SQL variables",
# measured 2026-10-18: 9 rows * 11 = 99 binds, 10 rows = 110 binds fails). 9 is the ceiling for
# this shape; a per-row INSERT instead costs one round trip per repo and runs past the sync window.
BATCH_ROWS = 9


def write_state(ctx, rows):
    """One statement per 20 rows: D1 charges a round trip per statement, and 182 of them ran longer
    than the sync window itself. 20 rows * 11 params stays under D1's SQL-variable ceiling."""
    params, tuples = [], []
    for r in rows:
        tuples.append(STATE_TUPLE)
        params.extend([r["id"], r["namespace"], r["name"], r["branch"],
                       r["github_sha"], r["artifacts_sha"], 1 if r["in_sync"] else 0,
                       r["github_committed_at"], r["artifacts_committed_at"],
                       r["error"], None])
    assert len(params) == len(tuples) * PARAMS_PER_ROW
    written = 0
    for i in range(0, len(tuples), BATCH_ROWS):
        chunk = tuples[i:i + BATCH_ROWS]
        sql = UPSERT_STATE % ", ".join(chunk)
        _, err = d1(ctx, sql, params[i * PARAMS_PER_ROW:(i + BATCH_ROWS) * PARAMS_PER_ROW])
        if err:
            die("state write failed at batch %d: %s" % (i // BATCH_ROWS, json.dumps(err)[:200]))
        written += len(chunk)
    return written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repair", action="store_true", help="delete+import drifted live repos")
    ap.add_argument("--limit", type=int, default=0, help="cap repairs per run")
    ap.add_argument("--namespace", action="append", default=None)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--include-archived", action="store_true",
                    help="also audit archived repos (default: audit all, repair none)")
    ap.add_argument("--json-out", default="")
    args = ap.parse_args()

    ctx = Ctx()
    namespaces = args.namespace or NS_DEFAULT
    ledger = load_ledger(ctx, namespaces)

    run_start = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        rows = list(ex.map(lambda r: probe(ctx, r), ledger))

    in_sync = [r for r in rows if r["in_sync"]]
    drifted = [r for r in rows if not r["in_sync"]]
    # A waived repo is excluded from repair AND from the error count: its reason is recorded, so
    # counting it as a failure means the meter can never reach zero. Measured 2026-10-18: the
    # waived 76MB repo alone consumed a 900s clone timeout, 90% of a 1000s run.
    errored = [r for r in rows if r["error"] and not r.get("waived")]

    repaired, repair_attempts = [], 0
    if args.repair:
        # Archived is NOT a synonym for frozen in this estate: 20 repositories marked archived on
        # GitHub received a real commit today (2026-10-18T11:28, "license: QNFO Unified License
        # Agreement v2.1"), so skipping them would have left 20 replicas permanently stale while
        # their GitHub copies moved. Repair follows HEAD, not the archived flag.
        # An `artifacts_*` error means the REPLICA is the problem (missing ref, missing repo) and a
        # mirror push fixes it; a `github_*` error means GitHub itself is unreadable and no amount
        # of pushing helps.
        candidates = [r for r in drifted
                      if not r.get("waived")
                      and (not r["error"] or str(r["error"]).startswith("artifacts_"))]
        candidates.sort(key=lambda r: r["github_committed_at"] or "")
        for r in reversed(candidates):
            if args.limit and repair_attempts >= args.limit:
                break
            repair_attempts += 1
            out = repair(ctx, r)
            r["repair"] = out
            if out["repaired"]:
                time.sleep(3)
                again = probe(ctx, {"id": r["id"], "namespace": r["namespace"],
                                    "name": r["repo"], "artifacts_name": r["name"],
                                    "default_branch": r["branch"], "owner": r["owner"],
                                    "github_url": "https://github.com/" + r["owner"] + "/" + r["repo"] + ".git",
                                    "archived": r["archived"]})
                r["verified_in_sync"] = again["in_sync"]
                if again["in_sync"]:
                    repaired.append(r)

    # A waived repo is not convergable and not silently green either: it is reported separately
    # with the reason recorded in artifact_repos.waived_reason (rwnq8/Friend: one 76MB blob against
    # Artifacts' 32MB per-blob hard limit, so no honest mirror can contain it).
    remaining = [r for r in drifted if r not in repaired and not r.get("waived")]
    waived = [r for r in drifted if r.get("waived") and r not in repaired]

    for r in rows:
        pass
    write_state(ctx, rows)
    for r in repaired:
        d1(ctx, "UPDATE artifact_sync_state SET repair_count = repair_count + 1, "
                "last_repaired = datetime('now'), in_sync = 1, drift_since = NULL "
                "WHERE repo_id = ?", [r["id"]])

    summary = {
        "repos": len(rows), "in_sync": len(in_sync), "drifted": len(remaining),
        "errors": len(errored), "repaired": len(repaired), "waived": len(waived),
        "waived_detail": [{"repo": r["namespace"] + "/" + r["name"], "reason": r["waived"]}
                          for r in waived],
        "namespaces": namespaces,
        "drifted_sample": [{"repo": r["namespace"] + "/" + r["name"],
                            "github": (r["github_sha"] or "")[:10],
                            "artifacts": (r["artifacts_sha"] or "")[:10],
                            "gh_at": r["github_committed_at"],
                            "art_at": r["artifacts_committed_at"],
                            "archived": bool(r["archived"])} for r in remaining[:25]],
        "error_sample": [{"repo": r["namespace"] + "/" + r["name"], "error": r["error"]}
                         for r in errored[:10]],
        "duration_s": round(time.time() - run_start, 1),
    }

    d1(ctx, "INSERT INTO artifact_sync_runs (started_at, finished_at, checked, in_sync, drifted, "
            "repaired, failed, detail) VALUES (datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?)",
       [len(rows), len(in_sync), len(remaining), len(repaired), len(errored),
        json.dumps({"duration_s": summary["duration_s"], "repair_attempts": repair_attempts})])

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump({"summary": summary, "rows": rows}, f, indent=2)

    print(json.dumps({"ok": True, "summary": summary}, indent=2))
    sys.exit(0 if not remaining else 2)


if __name__ == "__main__":
    main()
