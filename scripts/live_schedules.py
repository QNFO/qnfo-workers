#!/usr/bin/env python3
"""
live_schedules.py -- audit LIVE Cloudflare Worker cron schedules against the repo.

WHY THIS EXISTS (root cause, 2026-09-29)
----------------------------------------
A worker's cron triggers are NOT part of its script content. They live in a
separate CF resource:

    GET /accounts/<acct>/workers/scripts/<name>/schedules

`scripts/raw_put.py` only PUTs `/content`. Therefore editing
`crons = [...]` in a `wrangler.toml` and deploying via raw_put.py changes
NOTHING about when the worker actually fires. The repo and the live trigger
silently diverge. This is the mechanism behind:

  * #1193 / #1337 -- fleet-exec committed `crons = ["*/10 * * * *"]` while the
    live schedule stayed hourly. Observable symptom: `fleet_crons.last_fired`
    frozen at 2026-09-29T08:00:47.267Z and multiple distinct cron_expr rows
    (minute 9/17/23/42) sharing one identical `last_fired` value, because a
    once-per-hour dispatcher swept them all in a single catch-up batch.

This script makes that divergence visible and machine-checkable:

  1. LIVE  -- GET /schedules for every target worker; print cron expressions.
  2. REPO  -- parse `crons = [...]` out of each worker's wrangler.toml/json/jsonc.
  3. DIFF  -- report INERT (repo has crons, live has none/different),
              PHANTOM (live has crons, repo declares none), DRIFT (both, differ).
  4. CEILING -- delegate the rate-ceiling check to scripts/cron_rate_guard.py
              (CRON-RATE-CEILING-1: <= 1 run / 10 min, <= 144 runs / 24 h).

The cron rate ceiling is a BINDING OWNER DIRECTIVE (2026-09-23) enforced in
deploy-gate.yml. A candidate fix at `* * * * *` FAILS CI; `*/10 * * * *` sits
exactly at the ceiling and passes.

USAGE
-----
    export CF_API_TOKEN=... CF_ACCOUNT_ID=...
    python3 scripts/live_schedules.py --workers fleet-exec,qnfo-social
    python3 scripts/live_schedules.py --manifest deploy-targets.txt --json
    python3 scripts/live_schedules.py --all --json > live_schedules.json

EXIT CODES
----------
    0  no divergence found (all LIVE schedules match REPO declarations)
    1  divergence found (inert / phantom / drift) -- fails CI
    2  configuration error (missing token/account, bad args)
    3  API failure (surfaced verbatim)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

CF_API = "https://api.cloudflare.com/client/v4"
CF_TIMEOUT = 45

# Matches:  crons = ["0 * * * *", "*/10 * * * *"]
TOML_CRONS = re.compile(r"^\s*crons\s*=\s*\[(.*?)\]", re.S | re.M)
# JSON form:  "crons": ["0 * * * *"]
JSON_CRONS = re.compile(r'"crons"\s*:\s*\[(.*?)\]', re.S)
QUOTED = re.compile(r'["\']([^"\']+)["\']')


def die(code: int, msg: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(code)


def cf_get(path: str, token: str) -> dict:
    req = urllib.request.Request(
        f"{CF_API}{path}",
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "qnfo-live-schedules/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=CF_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:1000]
        return {"success": False, "errors": [{"code": e.code, "message": detail}]}
    except urllib.error.URLError as e:
        return {"success": False, "errors": [{"code": 0, "message": f"URLError: {e.reason}"}]}


def live_crons(account: str, worker: str, token: str) -> tuple[list[str], str | None]:
    """Return (cron_expressions, error). Empty list + None == no schedules set."""
    data = cf_get(f"/accounts/{account}/workers/scripts/{worker}/schedules", token)
    if not data.get("success"):
        errs = data.get("errors") or []
        msg = errs[0].get("message", "unknown") if errs else "unknown"
        code = errs[0].get("code") if errs else None
        # 404 / "not found" => worker exists but has no schedule resource.
        if code == 404 or "not found" in str(msg).lower():
            return [], None
        return [], f"HTTP {code}: {msg}"
    result = data.get("result") or {}
    crons = result.get("schedules") or []
    return [c.get("cron", "") for c in crons if isinstance(c, dict) and c.get("cron")], None


def repo_crons(repo_root: str, worker: str) -> list[str]:
    """Parse declared crons from the worker's wrangler config, if present."""
    for fname in ("wrangler.toml", "wrangler.jsonc", "wrangler.json"):
        fpath = os.path.join(repo_root, worker, fname)
        if not os.path.isfile(fpath):
            continue
        try:
            with open(fpath, "r", encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        m = TOML_CRONS.search(text) or JSON_CRONS.search(text)
        if not m:
            continue
        return [q for q in QUOTED.findall(m.group(1)) if q.strip()]
    return []


def read_manifest(path: str) -> list[str]:
    workers: list[str] = []
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.split("#", 1)[0].strip()
            if line:
                workers.append(line.split()[0])
    return workers


def classify(repo: list[str], live: list[str]) -> str:
    if repo and not live:
        return "INERT"      # declared in repo, absent live -> fix never applied
    if live and not repo:
        return "PHANTOM"    # live trigger the repo does not declare
    if set(repo) != set(live):
        return "DRIFT"
    return "OK"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Audit live CF cron schedules vs repo declarations.")
    ap.add_argument("--workers", help="comma-separated worker names")
    ap.add_argument("--manifest", help="deploy-targets.txt style manifest (worker per line)")
    ap.add_argument("--all", action="store_true", help="scan every dir in repo_root containing a wrangler config")
    ap.add_argument("--repo-root", default=".", help="local checkout root (default .)")
    ap.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = ap.parse_args(argv)

    account = os.environ.get("CF_ACCOUNT_ID", "").strip()
    token = os.environ.get("CF_API_TOKEN", "").strip()
    if not account or not token:
        die(2, "CF_ACCOUNT_ID and CF_API_TOKEN are required")

    if args.workers:
        workers = [w.strip() for w in args.workers.split(",") if w.strip()]
    elif args.manifest:
        workers = read_manifest(args.manifest)
    elif args.all:
        workers = sorted(
            d for d in os.listdir(args.repo_root)
            if os.path.isdir(os.path.join(args.repo_root, d))
            and any(os.path.isfile(os.path.join(args.repo_root, d, f))
                    for f in ("wrangler.toml", "wrangler.jsonc", "wrangler.json"))
        )
    else:
        die(2, "one of --workers, --manifest, or --all is required")
    if not workers:
        die(2, "no workers selected")

    rows = []
    for w in workers:
        live, err = live_crons(account, w, token)
        repo = repo_crons(args.repo_root, w)
        rows.append({
            "worker": w,
            "repo_crons": repo,
            "live_crons": live,
            "status": "API_ERROR" if err else classify(repo, live),
            "error": err,
        })

    if args.json:
        print(json.dumps({"account": account, "workers": len(rows), "rows": rows}, indent=2))
    else:
        print(f"live schedule audit: {len(rows)} worker(s), account {account[:6]}...\n")
        print(f"{'WORKER':<28} {'STATUS':<10} {'REPO':<20} {'LIVE':<20}")
        print("-" * 82)
        for r in rows:
            print(f"{r['worker']:<28} {r['status']:<10} "
                  f"{(','.join(r['repo_crons']) or '-'):<20} "
                  f"{(','.join(r['live_crons']) or '-'):<20}")
            if r["error"]:
                print(f"    error: {r['error']}")

    bad = [r for r in rows if r["status"] in ("INERT", "PHANTOM", "DRIFT")]
    errored = [r for r in rows if r["status"] == "API_ERROR"]
    if not args.json:
        print(f"\nsummary: {len(rows) - len(bad) - len(errored)} ok, "
              f"{len(bad)} divergent, {len(errored)} api-error")
    if errored:
        return 3
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
