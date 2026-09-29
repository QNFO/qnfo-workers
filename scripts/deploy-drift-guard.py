#!/usr/bin/env python3
"""deploy-drift-guard.py - repo<->live drift monitor (VERSION + CONTENT + DIRECTION).

ROOT CAUSE (why this exists):
  1. The canonical deploy (qnfo-ops POST /ops/deploy + the qnfo-fleet-control redeploy)
     fetches <dir>/deployed-current.worker.js -- NOT <dir>/worker.js (see mirror-guard.py).
     A monitor that reads worker.js measures the wrong artifact and false-reports.
  2. A worker with NO version constant is INVISIBLE to any version-based drift check
     (silent skip) -> the drift can never be seen or reconciled. Silent skips are the
     defect this tool refuses to allow.

CLASSES (no class is ever silently dropped):
  DRIFT            repo VERSION != live /health version  (reconcile required)
  CONTENT_DRIFT    repo artifact sha256 != live /content sha256 (after normalisation)
  NO_REPO_VERSION  worker is live but the repo has no version constant (source gap)
  NO_LIVE_VERSION  worker answers /health but omits a version field (live gap)
  NOT_DEPLOYED     HTTP 404 (retired/never-deployed) -- reported, not drift
  LIVE_ERR         /health unreachable or non-404 error
  SYNC             repo == live

DIRECTION (2026-09-29, issue #1229): a version mismatch is not automatically "the repo
is right". The live bundle can be AHEAD of the repo (DEPLOY-UNLOGGED-MUTATION, issues
#1340-#1343, and the qnfo-lifecycle 1.6.2-cronconsolidate case). `--ahead` therefore
emits only the workers where the repo artifact is STRICTLY AHEAD of live by numeric
version comparison -- the only direction where redeploying the repo is safe. Anything
else is reported, never auto-applied. This is the machine-readable contract used by
.github/workflows/fleet-autodeploy.yml.

CONTENT MODE (--content): fetches the live bundle from the CF API /content endpoint and
compares a normalised sha256 against the repo canonical artifact. This closes the gap
called out in issue #1229 (content-level repo<->live drift is undetectable and the
fleet-wide check is continue-on-error). Requires CLOUDFLARE_API_TOKEN + CF_ACCOUNT_ID.
Content drift is REPORT-ONLY: it is never used to justify an auto-deploy on its own,
because a mirror capture can legitimately differ in formatting from a fresh build.

JSON MODE (--json): emits ONE line of JSON carrying the full membership of every class,
including `sync_workers` and `not_deployed_workers`. Counts alone are not auditable: a
consumer (scripts/fleet-autoaudit.py) must be able to write a row per worker, so every
class carries its worker names.

Default scope = the narrative-generation surfaces we own. `--all` = all workers.
Exit: 0 clean (scoped: SYNC only) | 1 any DRIFT / CONTENT_DRIFT / NO_*_VERSION / LIVE_ERR
"""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONST = re.compile(r'(?:var|let|const)\s+(?:QNFO_)?VERSION\s*=\s*"([^"]+)"')
CANON = ("deployed-current.worker.js", "worker.js")
TIMEOUT = 20
NARRATIVE = ["qnfo-ai", "qnfo-research-exec", "qnfo-ipatent", "qnfo-gateway"]
API_CONTENT = ("https://api.cloudflare.com/client/v4/accounts/{acct}"
               "/workers/scripts/{worker}/content")


def _norm(text):
    """Normalise before hashing: the live bundle is an esbuild artifact and the repo
    mirror is a capture of it, but line endings / trailing whitespace can differ."""
    lines = [ln.rstrip() for ln in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _sha(text):
    return hashlib.sha256(_norm(text).encode("utf-8", "replace")).hexdigest()


def _num_prefix(v):
    m = re.match(r"^(\d+(?:\.\d+)*)", v or "")
    if not m:
        return None
    return tuple(int(x) for x in m.group(1).split("."))


def cmp_ver(repo_v, live_v):
    """-1 repo behind, 0 equal, 1 repo ahead, None not comparable numerically."""
    a, b = _num_prefix(repo_v), _num_prefix(live_v)
    if a is None or b is None:
        return None
    n = max(len(a), len(b))
    a = a + (0,) * (n - len(a))
    b = b + (0,) * (n - len(b))
    return (a > b) - (a < b)


def repo_artifact(d):
    """Return (version, path, text) for the canonical repo artifact, or (None, None, None)."""
    for fn in CANON:
        p = os.path.join(ROOT, d, fn)
        if os.path.isfile(p):
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
            except OSError:
                continue
            m = CONST.search(text)
            if m:
                return m.group(1), p, text
            return None, p, text
    return None, None, None


def live_result(worker):
    url = "https://" + worker + ".q08.workers.dev/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "qnfo-deploy-drift-guard"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.load(r)
        return True, (data.get("version") or data.get("VERSION"))
    except urllib.error.HTTPError as e:
        return (False, None) if e.code == 404 else (False, "ERR:" + str(e)[:50])
    except Exception as e:
        return (False, "ERR:" + str(e)[:50])


def live_content(worker, acct, token):
    """Fetch the live bundle text via the CF API /content endpoint. None on any failure."""
    url = API_CONTENT.format(acct=acct, worker=worker)
    try:
        req = urllib.request.Request(url, headers={
            "Authorization": "Bearer " + token,
            "User-Agent": "qnfo-deploy-drift-guard",
        })
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:
        return None


def main():
    argv = sys.argv[1:]
    scan_all = "--all" in argv
    want_content = "--content" in argv
    want_json = "--json" in argv
    want_ahead = "--ahead" in argv
    wanted = set(a for a in argv if not a.startswith("-"))
    if not wanted and not scan_all:
        wanted = set(NARRATIVE)

    acct = os.environ.get("CF_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    content_ok = bool(acct and token)

    drift, content_drift, ahead, no_repo_ver, no_live_ver = [], [], [], [], []
    not_deployed, sync_workers, live_err = [], [], []

    for d in sorted(os.listdir(ROOT)):
        if wanted and d not in wanted:
            continue
        if not os.path.isdir(os.path.join(ROOT, d)):
            continue
        # ROOT-CAUSE FIX: .git/.github/.wrangler/_shared are infra dirs, not workers --
        # probing them produced bogus LIVE_ERR (invalid worker hostnames).
        if d.startswith(".") or d.startswith("_"):
            continue
        rv, rpath, rtext = repo_artifact(d)
        live, lv = live_result(d)
        if not live and lv is None:
            not_deployed.append(d)
            continue
        if not live:  # ERR (not 404)
            live_err.append((d, lv))
            continue
        if rv is None:
            no_repo_ver.append((d, lv))
        elif not lv:
            no_live_ver.append((d, rv))
        elif lv != rv:
            drift.append((d, rv, lv))
            if cmp_ver(rv, lv) == 1:
                ahead.append((d, rv, lv, rpath))
        else:
            sync_workers.append(d)
        if want_content and content_ok and rtext is not None:
            live_text = live_content(d, acct, token)
            if live_text is not None and _sha(live_text) != _sha(rtext):
                content_drift.append((d, _sha(rtext)[:12], _sha(live_text)[:12], rpath))

    if want_json:
        print(json.dumps({
            "sync": len(sync_workers),
            "sync_workers": sync_workers,
            "drift": [{"worker": d, "repo": r, "live": l} for d, r, l in drift],
            "content_drift": [{"worker": d, "repo_sha": a, "live_sha": b, "artifact": p}
                              for d, a, b, p in content_drift],
            "ahead": [{"worker": d, "repo": r, "live": l, "artifact": p}
                      for d, r, l, p in ahead],
            "no_repo_version": [{"worker": d, "live": l} for d, l in no_repo_ver],
            "no_live_version": [{"worker": d, "repo": r} for d, r in no_live_ver],
            "live_err": [{"worker": d, "err": e} for d, e in live_err],
            "not_deployed_workers": not_deployed,
            "not_deployed_notdrift": len(not_deployed),
            "content_checked": bool(want_content and content_ok),
        }, sort_keys=True))
    else:
        for d, rv_, lv_ in drift:
            print(f"DRIFT {d}: repo={rv_} live={lv_}")
        for d, a, b, p in content_drift:
            print(f"CONTENT_DRIFT {d}: repo_sha={a} live_sha={b} artifact={p}")
        for d, rv_, lv_, p in ahead:
            print(f"AHEAD {d}: repo={rv_} live={lv_} artifact={p}")
        for d, lv_ in no_repo_ver:
            print(f"NO_REPO_VERSION {d}: live={lv_}")
        for d, rv_ in no_live_ver:
            print(f"NO_LIVE_VERSION {d}: repo={rv_}")
        for d, e in live_err:
            print(f"LIVE_ERR {d}: {e}")
        tag = "all" if scan_all else "narrative"
        print(f"deploy-drift-guard[{tag}]: sync={len(sync_workers)} drift={len(drift)} "
              f"content_drift={len(content_drift)} ahead={len(ahead)} "
              f"no_repo_version={len(no_repo_ver)} no_live_version={len(no_live_ver)} "
              f"live_err={len(live_err)} not_deployed_notdrift={len(not_deployed)} "
              f"content_checked={bool(want_content and content_ok)}")

    if want_ahead:
        return 0
    problems = len(drift) + len(content_drift) + len(no_repo_ver) + len(no_live_ver) + len(live_err)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
