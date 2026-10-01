#!/usr/bin/env python3
"""
canonical_deploy.py -- deploy QNFO workers through the CANONICAL path.

WHY THIS EXISTS (root cause, 2026-09-29)
----------------------------------------
The legacy path `scripts/raw_put.py` performs exactly one CF API call:
    PUT /accounts/<acct>/workers/scripts/<name>/content
That is enough to change a worker's code, but it performs NONE of the
following, and each omission is an open defect:

  1. no deploy-guard LOCK acquire/release
        -> deploy-guard classifies the mutation as `uncoordinated-deploy`
        -> agent_issues #1340, #1341, #1342, #1343 (DEPLOY-UNCOORDINATED-DEPLOY)
  2. no `fleet_deploys` ledger row
        -> deploy-guard computes logged = (ledger_row_ts >= modified_on - 180s)
        -> false => `DEPLOY-UNLOGGED-MUTATION`
  3. no PUT /accounts/<acct>/workers/scripts/<name>/schedules
        -> crons declared in wrangler.toml are INERT. Editing
           `crons = [...]` in the repo has no effect on the live trigger.
           This is why the #1193 / #1337 fix (fleet-exec hourly -> */10)
           could be committed and still not take effect: `last_fired`
           never advanced past 08:00:47Z.

The canonical path is a single server-side route on qnfo-ops:

    POST https://ops.qnfo.org/ops/deploy
    Authorization: Bearer $OPS_ROUTER_AUTH_KEY
    Content-Type: application/json
    body: {"worker": "<name>", "path": "<repo-relative path to worker.js>", "ref": "main"}

`opsDeploy(env, body)` performs the complete, ordered sequence:
    lock acquire (fail-closed)
      -> fetch source from GitHub at `ref`
      -> PUT /content   (binding-preserving: redeclares existing bindings;
                         BINDING-PRESERVE-1 aborts if bindings can't be read)
      -> live verify
      -> POST guard /ledger
      -> read wrangler.toml  ->  PUT /schedules   <-- cron apply lives here
    lock release

USAGE
-----
    export OPS_ROUTER_AUTH_KEY=...        # never commit this
    python3 scripts/canonical_deploy.py --worker fleet-exec --path fleet-exec/worker.js
    python3 scripts/canonical_deploy.py --manifest deploy-targets.txt
    python3 scripts/canonical_deploy.py --manifest deploy-targets.txt --dry-run

EXIT CODES
----------
    0  all requested deploys succeeded and were verified
    1  one or more deploys failed (route error surfaced verbatim)
    2  configuration error (missing auth key / bad manifest / bad args)
    3  fail-closed abort (lock held, or preflight refused)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import re
import urllib.request

OPS_DEPLOY_URL = os.environ.get("OPS_DEPLOY_URL", "https://ops.qnfo.org/ops/deploy")
AUTH_ENV = "OPS_ROUTER_AUTH_KEY"
DEFAULT_REF = "main"
DEFAULT_TIMEOUT = 180


def die(code: int, msg: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(code)


def post_deploy(worker: str, path: str, ref: str, token: str, timeout: int, allow_create: bool = False) -> dict:
    """POST one deploy request to the canonical route. Returns parsed JSON.

    Fails closed: a non-2xx status is surfaced verbatim, never swallowed.
    """
    body = {"worker": worker, "path": path, "ref": ref}
    # WORKER-RESURRECTION-GUARD-1: the route refuses to CREATE an absent worker unless this is set.
    if allow_create:
        body["allow_create"] = True
    payload = json.dumps(body).encode()
    req = urllib.request.Request(
        OPS_DEPLOY_URL,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "qnfo-canonical-deploy/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
            status = resp.status
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:2000]
        return {"ok": False, "status": e.code, "error": detail}
    except urllib.error.URLError as e:
        return {"ok": False, "status": 0, "error": f"URLError: {e.reason}"}

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        parsed = {"raw": body[:2000]}
    parsed.setdefault("status", status)
    if status >= 300:
        parsed["ok"] = False
    return parsed


VERSION_RE = re.compile(r'var\s+VERSION\s*=\s*"([^"]+)"')
LOCK_WAIT_S = int(os.environ.get("CANONICAL_LOCK_WAIT_S", "240"))
LOCK_POLL_S = 20


def repo_version(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as fh:
            m = VERSION_RE.search(fh.read())
        return m.group(1) if m else None
    except OSError:
        return None


def live_version(worker: str) -> str | None:
    """Live /health version over the public workers.dev route (a GitHub runner is not a Worker, so the
    same-zone 1042 restriction does not apply here)."""
    req = urllib.request.Request(f"https://{worker}.q08.workers.dev/health",
                                 headers={"User-Agent": "qnfo-canonical-deploy/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return (json.loads(resp.read().decode("utf-8", "replace")) or {}).get("version")
    except Exception:  # noqa: BLE001
        return None


def lock_contended(res: dict) -> bool:
    return "lock not acquired" in json.dumps(res)[:4000]


def deploy_with_contention(worker: str, path: str, ref: str, token: str, timeout: int, allow_create: bool = False) -> dict:
    """DEPLOY-LOCK-CONTENTION-1 (2026-09-30). One push to main can start TWO deployers for the same worker
    (deploy-qnfo-ops.yml -> raw_put.py and this workflow -> /ops/deploy; or a fleet-control heal), and the
    deploy-guard lock correctly lets only one through. Measured: canonical-deploy runs 36758875374 and
    36758416523 went RED on "lock not acquired (fail-closed)" while a concurrent deployer shipped the same
    commit. A held lock is contention, not failure: wait (bounded), and if the live worker already reports
    the repo VERSION, the goal state is reached and the deploy is a no-op success."""
    want = repo_version(path)
    deadline = time.time() + LOCK_WAIT_S
    while True:
        res = post_deploy(worker, path, ref, token, timeout, allow_create)
        if res.get("ok") or not lock_contended(res):
            return res
        lv = live_version(worker)
        if want and lv == want:
            return {"ok": True, "status": res.get("status"), "converged": True, "version": lv,
                    "detail": "lock held by a concurrent deployer and live already reports the repo "
                              "VERSION -- goal state reached (DEPLOY-LOCK-CONTENTION-1)"}
        if time.time() >= deadline:
            res["detail"] = (f"lock still held after {LOCK_WAIT_S}s and live={lv!r} != repo={want!r} "
                             "(DEPLOY-LOCK-CONTENTION-1)")
            return res
        print(f"    lock held by a concurrent deployer (live={lv!r}, want={want!r}); retry in {LOCK_POLL_S}s",
              flush=True)
        time.sleep(LOCK_POLL_S)


def read_manifest(path: str) -> list[tuple[str, str]]:
    """Parse deploy-targets.txt.

    Accepted line forms (blank lines and # comments ignored):
        <worker>
        <worker> <repo-relative-path>
    A bare worker name defaults to <worker>/worker.js.
    """
    targets: list[tuple[str, str]] = []
    with open(path, "r", encoding="utf-8") as fh:
        for lineno, raw in enumerate(fh, 1):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) == 1:
                targets.append((parts[0], f"{parts[0]}/worker.js"))
            elif len(parts) == 2:
                targets.append((parts[0], parts[1]))
            else:
                die(2, f"{path}:{lineno}: expected '<worker> [path]', got {line!r}")
    if not targets:
        die(2, f"{path}: manifest contains no deploy targets")
    return targets


def is_resurrection_refusal(res: dict) -> bool:
    """WORKER-RESURRECTION-GUARD-1: the route refused to CREATE an absent worker because creation was not requested.

    That is the guard working, not a deploy failure: in push-diff mode any edit to a repo directory whose worker is absent from the
    account (39+ unmarked directories at 2026-10-01) would otherwise turn canonical-deploy red. Only this exact refusal is a skip;
    every other failure still fails the run.
    """
    try:
        txt = json.dumps(res, default=str)
    except Exception:
        txt = str(res)
    return "WORKER-RESURRECTION-GUARD-1" in txt and not bool(res.get("ok"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Deploy workers via the canonical /ops/deploy route.")
    ap.add_argument("--worker", help="single worker script name")
    ap.add_argument("--path", help="repo-relative path to the worker source (default <worker>/worker.js)")
    ap.add_argument("--manifest", help="file listing '<worker> [path]' per line")
    ap.add_argument("--ref", default=DEFAULT_REF, help=f"git ref to deploy from (default {DEFAULT_REF})")
    ap.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="per-deploy timeout seconds")
    ap.add_argument("--dry-run", action="store_true", help="print the plan, call nothing")
    ap.add_argument("--allow-create", action="store_true", help="allow creating a worker that does not exist on the account (WORKER-RESURRECTION-GUARD-1)")
    args = ap.parse_args(argv)

    if args.worker and args.manifest:
        die(2, "--worker and --manifest are mutually exclusive")
    if args.worker:
        targets = [(args.worker, args.path or f"{args.worker}/worker.js")]
    elif args.manifest:
        targets = read_manifest(args.manifest)
    else:
        die(2, "one of --worker or --manifest is required")

    token = os.environ.get(AUTH_ENV, "").strip()
    if not token and not args.dry_run:
        die(2, f"{AUTH_ENV} is not set (required; never commit it)")

    print(f"canonical deploy: {len(targets)} target(s) -> {OPS_DEPLOY_URL} (ref={args.ref})")
    for worker, path in targets:
        print(f"  - {worker}  <-  {path}")

    if args.dry_run:
        print("dry-run: no requests issued")
        return 0

    results: list[tuple[str, bool, dict]] = []
    for worker, path in targets:
        t0 = time.time()
        print(f"\n==> {worker} ({path})", flush=True)
        res = deploy_with_contention(worker, path, args.ref, token, args.timeout, args.allow_create)
        dt = time.time() - t0
        ok = bool(res.get("ok"))
        skipped = (not ok) and (not args.allow_create) and is_resurrection_refusal(res)
        if skipped:
            ok = True  # a refused creation is a skip, not a failure (see is_resurrection_refusal)
        results.append((worker, ok, res))
        verdict = "SKIP (absent worker; creation refused by WORKER-RESURRECTION-GUARD-1, not requested)" if skipped else ("OK" if ok else "FAIL")
        print(f"    {verdict} in {dt:.1f}s  status={res.get('status')}")
        # Surface the route's own fields without assuming a fixed schema.
        for key in ("converged", "version", "version_id", "modified_on", "ledger", "lock", "schedules", "crons", "error", "detail"):
            if key in res:
                print(f"    {key}: {json.dumps(res[key])[:400]}")
        # ROUTE-LOG-VISIBLE-1: print the route's own per-step log for the declared-config steps, so a skipped or
        # failed schedules / workers_dev apply is visible in CI instead of silently absent (SCHEDULES-PATH-OFF-BY-ONE-1).
        # DEPLOY-ERROR-VISIBLE-1: a failed route returns the Cloudflare error inside res["error"] as an escaped JSON
        # string, and the 400-char cap above cut it before the actual error code and message (run 36842708566,
        # qnfo-fleet-calibrator: "CF API 400: {"result":null,...errors":[{"code"" and nothing after). Decode the
        # failing step and print its error unescaped so the cause is readable in the CI log.
        if not ok:
            try:
                _body = json.loads(res["error"]) if isinstance(res.get("error"), str) else res
            except Exception:
                _body = res
            for step in (_body.get("log") or []) if isinstance(_body, dict) else []:
                if isinstance(step, dict) and step.get("ok") is False and step.get("error"):
                    print(f"    deploy-error[{step.get('step')}]: {str(step['error'])[:2000]}")
        for step in res.get("log") or []:
            if isinstance(step, dict) and step.get("step") in ("crons", "workers_dev", "verify", "lock"):
                print(f"    log.{step.get('step')}: {json.dumps(step)[:300]}")
        if isinstance(res.get("log"), list) and not any(isinstance(x, dict) and x.get("step") == "crons" for x in res["log"]):
            print("    ::warning::route log has no 'crons' step - declared wrangler.toml config was not evaluated")

    failed = [w for w, ok, _ in results if not ok]
    print(f"\nsummary: {len(results) - len(failed)}/{len(results)} ok")
    if failed:
        print(f"failed workers: {', '.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
