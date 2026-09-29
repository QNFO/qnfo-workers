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
  NOT_DEPLOYED     genuinely absent: HTTP 404 AND not in the CF account script list
  NO_HEALTH_ROUTE  IS deployed, but https://<name>.q08.workers.dev/health 404s
                   (workers.dev route disabled, or no /health route) -- NOT "not deployed"
  NOT_A_WORKER     the directory declares no worker config (no wrangler.toml/json/jsonc)
                   AND ships no worker artifact AND the name is absent from the CF script
                   list. Repo scaffolding / non-worker directories, reported separately so
                   they cannot inflate NOT_DEPLOYED (issue #1379).
  LIVE_ERR         /health unreachable or non-404 error
  SYNC             repo == live

NAME-RESOLUTION-1 (2026-09-29, FLEET-AUTOAUDIT false negatives):
  The repo DIRECTORY is not the worker name. `agent-orchestrator/wrangler.toml` declares
  `name = "qnfo-agent-orchestrator"`, which IS deployed and answers /health v1.1.0 -- while
  `agent-orchestrator.q08.workers.dev` is a host that never existed. Probing the directory
  name returned 404, and the worker was written as NOT_DEPLOYED. Measured on the first
  FLEET-AUTOAUDIT-1 run (2026-09-29 15:44:42Z): 112 rows, 76 NOT_DEPLOYED -- a 68%
  false-negative rate on the class that is supposed to mean "retired/never-deployed".
  The guard now resolves the probe target from wrangler.toml `name` (json/jsonc fallback,
  directory name as last resort) and cross-checks the CF API script list so that
  NO_HEALTH_ROUTE is never conflated with NOT_DEPLOYED. When the CF script list is
  unavailable (no token / API error) the guard degrades to the previous NOT_DEPLOYED
  reading and reports `cf_script_list: false` rather than guessing.
  Every directory still yields exactly one class -- the fix removes a false negative,
  it does not introduce a silent skip.

NOT-DEPLOYED-KEYED-BY-DIR-1 / NOT-DEPLOYED-NONWORKER-NOISE-1 (2026-09-29, issues
#1379/#1380): two residual defects in the class above.
  (a) KEYING: every other class emitted the RESOLVED worker name, but NOT_DEPLOYED emitted
      the raw repo DIRECTORY, so the consumer wrote `worker_live_audit.worker` values that
      are not worker names and cannot be joined against the CF account or the service
      registry. `not_deployed_workers` is now a list of {"worker","dir"} objects (the legacy
      bare-string list is still emitted as `not_deployed_dirs` so no consumer silently
      changes meaning).
  (b) NOISE: a directory with no worker config and no worker artifact is not a worker; the
      old code reported it as NOT_DEPLOYED purely because its name was absent from the
      account. Measured 2026-09-29: ~26% of the class. Such directories are now classed
      NOT_A_WORKER, which is reported and counted but never treated as a worker.
  `scope` is emitted in JSON ("all" | "narrative") so the consumer knows whether the run
  covered every directory and may therefore purge stale rows (issue #1378).

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
class carries its worker names. Entries carry BOTH `worker` (the resolved CF script name,
the value that is actually probed) and `dir` (the repo directory), so a consumer cannot
confuse the two again.

Default scope = the narrative-generation surfaces we own. `--all` = all workers.
Exit: 0 clean (scoped: SYNC only) | 1 any DRIFT / CONTENT_DRIFT / NO_*_VERSION / LIVE_ERR
NO_HEALTH_ROUTE and NOT_A_WORKER are reported but deliberately NOT counted in the exit
code: a private worker with a disabled workers.dev route is not a repo<->live divergence,
and a non-worker directory is not a divergence at all -- making either blocking would turn
a monitoring gap into a fleet-wide CI outage.
"""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# VERSION-PRECEDENCE-1: capture the prefix so the plain VERSION constant can win.
# VERSION-QUOTE-1 (2026-09-29): accept single OR double quoted VERSION constants.
CONST = re.compile(r'(?:var|let|const)\s+(QNFO_)?VERSION\s*=\s*[\'"]([^\'"]+)[\'"]')
# VERSION-QUOTE-1 (2026-09-29): SERVER_VERSION fallback. PROTOCOL_VERSION is a
# different fact and is deliberately NOT matched (see the module docstring).
SERVER_CONST = re.compile(r'(?:var|let|const)\s+SERVER_VERSION\s*=\s*[\'"]([^\'"]+)[\'"]')
CANON = ("deployed-current.worker.js", "worker.js")
TIMEOUT = 20
NARRATIVE = ["qnfo-ai", "qnfo-research-exec", "qnfo-ipatent", "qnfo-gateway"]
API_CONTENT = ("https://api.cloudflare.com/client/v4/accounts/{acct}"
               "/workers/scripts/{worker}/content")
API_SCRIPTS = ("https://api.cloudflare.com/client/v4/accounts/{acct}"
               "/workers/scripts")
WRANGLER_NAME = re.compile(r'^\s*name\s*=\s*"([^"]+)"', re.M)
WRANGLER_JSON = ("wrangler.json", "wrangler.jsonc")


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


def wrangler_name(d):
    """NAME-RESOLUTION-1: resolve the DEPLOYED worker name for a repo directory.

    The directory name is not the worker name (`agent-orchestrator` deploys as
    `qnfo-agent-orchestrator`). Probing the directory produced 404 -> NOT_DEPLOYED on a
    healthy worker. Prefer the wrangler.toml `name`; fall back to wrangler.json/jsonc;
    return None when nothing is declared so the caller can use the directory name.
    """
    p = os.path.join(ROOT, d, "wrangler.toml")
    if os.path.isfile(p):
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                m = WRANGLER_NAME.search(fh.read())
        except OSError:
            m = None
        if m and m.group(1).strip():
            return m.group(1).strip()
    for fn in WRANGLER_JSON:
        p = os.path.join(ROOT, d, fn)
        if os.path.isfile(p):
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    data = json.load(fh)
            except Exception:
                continue
            n = data.get("name")
            if isinstance(n, str) and n.strip():
                return n.strip()
    return None


def deployed_workers(acct, token):
    """The authoritative deployed-script set from the CF API.

    None when unavailable (no credentials / API error). Callers MUST NOT read None as
    "nothing is deployed" -- that would re-introduce the false negative this closes.
    """
    if not (acct and token):
        return None
    out, page = set(), 1
    try:
        while True:
            url = API_SCRIPTS.format(acct=acct) + f"?per_page=100&page={page}"
            req = urllib.request.Request(url, headers={
                "Authorization": "Bearer " + token,
                "User-Agent": "qnfo-deploy-drift-guard"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                body = json.load(r)
            for it in body.get("result", []):
                if it.get("id"):
                    out.add(it["id"])
            info = body.get("result_info") or {}
            if page >= int(info.get("total_pages") or 1):
                break
            page += 1
    except Exception:
        return None
    return out


def _repo_version(text):
    """VERSION-PRECEDENCE-1: prefer the plain `VERSION` constant over `QNFO_VERSION`.

    A worker artifact can declare both. `QNFO_VERSION` is a build/fabric tag
    (e.g. "qnfo-archive/fabric-20260910"); `VERSION` is the value the worker actually
    serves on /health. Returning the first regex match made qnfo-archive report a fabric
    tag as its repo version -- a permanent false DRIFT against a live /health of 1.2.0,
    and a corrupted numeric direction comparison for --ahead. The plain constant wins;
    QNFO_VERSION remains a fallback so no worker becomes invisible to the drift check.
    """
    hits = CONST.findall(text)
    if hits:
        for prefix, val in hits:
            if not prefix:
                return val
        return hits[0][1]
    # VERSION-QUOTE-1: explicit SERVER_VERSION fallback, never a wildcard prefix.
    # PROTOCOL_VERSION precedes SERVER_VERSION in qnfo-memory-mcp and is not the
    # value the worker serves on /health.
    m = SERVER_CONST.search(text)
    return m.group(1) if m else None


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
            v = _repo_version(text)
            if v:
                return v, p, text
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
    deployed = deployed_workers(acct, token)

    drift, content_drift, ahead, no_repo_ver, no_live_ver = [], [], [], [], []
    not_deployed, sync_workers, live_err, no_health = [], [], [], []
    not_a_worker = []

    for d in sorted(os.listdir(ROOT)):
        if not os.path.isdir(os.path.join(ROOT, d)):
            continue
        # ROOT-CAUSE FIX: .git/.github/.wrangler/_shared are infra dirs, not workers --
        # probing them produced bogus LIVE_ERR (invalid worker hostnames).
        if d.startswith(".") or d.startswith("_"):
            continue
        # NAME-RESOLUTION-1: the directory is not the worker name. Probe what is deployed.
        declared = wrangler_name(d)
        worker = declared or d
        if wanted and d not in wanted and worker not in wanted:
            continue
        rv, rpath, rtext = repo_artifact(d)
        live, lv = live_result(worker)
        if not live and lv is None:
            # 404. Only NOT_DEPLOYED when the worker is genuinely absent from the account:
            # a deployed worker with a disabled workers.dev route also 404s here, and
            # calling that NOT_DEPLOYED is the false negative NAME-RESOLUTION-1 closes.
            if deployed is None or worker in deployed:
                no_health.append((d, worker))
            elif declared is None and rpath is None:
                # NOT-DEPLOYED-NONWORKER-NOISE-1: no wrangler config, no worker artifact,
                # and the name is absent from the account -- this directory is not a worker.
                # Reporting it as NOT_DEPLOYED inflated the class with repo scaffolding.
                not_a_worker.append((d, worker))
            else:
                not_deployed.append((d, worker))
            continue
        if not live:  # ERR (not 404)
            live_err.append((d, worker, lv))
            continue
        if rv is None:
            no_repo_ver.append((d, worker, lv))
        elif not lv:
            no_live_ver.append((d, worker, rv))
        elif lv != rv:
            drift.append((d, worker, rv, lv))
            if cmp_ver(rv, lv) == 1:
                ahead.append((d, worker, rv, lv, rpath))
        else:
            sync_workers.append(worker)
        if want_content and content_ok and rtext is not None:
            live_text = live_content(worker, acct, token)
            if live_text is not None and _sha(live_text) != _sha(rtext):
                content_drift.append((d, worker, _sha(rtext)[:12], _sha(live_text)[:12], rpath))

    if want_json:
        print(json.dumps({
            "scope": "all" if scan_all else "narrative",
            "sync": len(sync_workers),
            "sync_workers": sync_workers,
            "drift": [{"worker": w, "dir": d, "repo": r, "live": l} for d, w, r, l in drift],
            "content_drift": [{"worker": w, "dir": d, "repo_sha": a, "live_sha": b, "artifact": p}
                              for d, w, a, b, p in content_drift],
            "ahead": [{"worker": w, "dir": d, "repo": r, "live": l, "artifact": p}
                      for d, w, r, l, p in ahead],
            "no_repo_version": [{"worker": w, "dir": d, "live": l} for d, w, l in no_repo_ver],
            "no_live_version": [{"worker": w, "dir": d, "repo": r} for d, w, r in no_live_ver],
            "live_err": [{"worker": w, "dir": d, "err": e} for d, w, e in live_err],
            "no_health_route": [{"worker": w, "dir": d} for d, w in no_health],
            "not_deployed_workers": [{"worker": w, "dir": d} for d, w in not_deployed],
            "not_deployed_dirs": [d for d, w in not_deployed],
            "not_deployed_notdrift": len(not_deployed),
            "not_a_worker": [{"worker": w, "dir": d} for d, w in not_a_worker],
            "not_a_worker_count": len(not_a_worker),
            "name_resolution": True,
            "cf_script_list": deployed is not None,
            "content_checked": bool(want_content and content_ok),
        }, sort_keys=True))
    else:
        for d, w, rv_, lv_ in drift:
            print(f"DRIFT {w} (dir {d}): repo={rv_} live={lv_}")
        for d, w, a, b, p in content_drift:
            print(f"CONTENT_DRIFT {w} (dir {d}): repo_sha={a} live_sha={b} artifact={p}")
        for d, w, rv_, lv_, p in ahead:
            print(f"AHEAD {w} (dir {d}): repo={rv_} live={lv_} artifact={p}")
        for d, w, lv_ in no_repo_ver:
            print(f"NO_REPO_VERSION {w} (dir {d}): live={lv_}")
        for d, w, rv_ in no_live_ver:
            print(f"NO_LIVE_VERSION {w} (dir {d}): repo={rv_}")
        for d, w in no_health:
            print(f"NO_HEALTH_ROUTE {w} (dir {d})")
        for d, w in not_a_worker:
            print(f"NOT_A_WORKER {w} (dir {d})")
        for d, w, e in live_err:
            print(f"LIVE_ERR {w} (dir {d}): {e}")
        tag = "all" if scan_all else "narrative"
        print(f"deploy-drift-guard[{tag}]: sync={len(sync_workers)} drift={len(drift)} "
              f"content_drift={len(content_drift)} ahead={len(ahead)} "
              f"no_repo_version={len(no_repo_ver)} no_live_version={len(no_live_ver)} "
              f"no_health_route={len(no_health)} live_err={len(live_err)} "
              f"not_deployed_notdrift={len(not_deployed)} "
              f"not_a_worker={len(not_a_worker)} "
              f"cf_script_list={deployed is not None} "
              f"content_checked={bool(want_content and content_ok)}")

    if want_ahead:
        return 0
    problems = len(drift) + len(content_drift) + len(no_repo_ver) + len(no_live_ver) + len(live_err)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
