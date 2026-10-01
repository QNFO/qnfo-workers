#!/usr/bin/env python3
"""fleet-autoaudit.py - FLEET-AUTOAUDIT-1: automatic fleet self-audit + worker update.

WHY THIS EXISTS (root causes it closes):
  * worker_live_audit froze at 2026-09-27T17:23Z (issue #1351) because NOTHING on a
    schedule wrote it -- the table had no writer. This script is that writer.
  * The fleet-wide repo<->live check was version-only and `continue-on-error: true`
    (issue #1229), so content-level drift could never be seen. This script runs the
    content-aware guard.
  * Repo-ahead workers had no automatic path to live (deploy-qnfo-ops.yml covers ONE
    worker). This script closes that loop for the safe direction only.

MODES
  --audit    (default) run scripts/deploy-drift-guard.py --all --content --json, UPSERT one
             row per worker into qnfo-audit.worker_live_audit, write
             audits/fleet-autoaudit-<date>.json, and open/refresh one tracking issue.
  --apply    redeploy ONLY workers where the repo artifact is STRICTLY AHEAD of live by
             numeric version comparison -- the one direction where redeploying the repo
             cannot revert a live-ahead fix. Uses the repo's binding-preserving deployer
             scripts/raw_put.py and verifies live /health afterwards.

NEVER auto-applied (reported only): content drift on its own, repo-BEHIND (live-ahead)
workers, missing-version workers, unreachable workers. Deliberate: mirror-autosync.yml
documents the regression class where an unattended copy reverted a live fix
(qnfo-lifecycle live 1.6.2-cronconsolidate vs repo 1.6.2).

NAME-RESOLUTION-1 / NO-HEALTH-ROUTE-1 (2026-09-29): the guard now probes the worker name
declared in each directory's wrangler.toml instead of the directory name, and emits a
NO_HEALTH_ROUTE class for workers that ARE deployed but whose workers.dev /health 404s.
Both are consumed below. This matters because `classify()` is an allow-list: any class the
guard emits that is NOT handled here would be silently dropped -- re-introducing exactly
the silent-skip defect the guard refuses to allow. When the guard adds a class, add it
here in the same commit.

NOT-DEPLOYED-KEYED-BY-DIR-1 / NOT-A-WORKER (2026-09-29, issues #1379/#1380): the guard
now emits `not_deployed_workers` as {"worker","dir"} objects instead of bare directory
strings, and routes config-less, artifact-less directories to a separate `not_a_worker`
class. Both are consumed below; the legacy string form is still tolerated so an older
guard cannot crash this consumer.

AUDIT-STALE-ROWS-1 (2026-09-29, issue #1378): the UPSERT is per-worker with no purge, so a
renamed or retired repo directory leaves an orphan row forever and the table can never be
read as a snapshot of the current fleet. After a FULL audit (`scope == "all"`) every row
whose probed_at was not advanced by this run is purged. The purge is deliberately skipped
on a scoped run, where stale rows are expected and meaningful.

ADVERSARIAL NOTE: a green run of this script is NOT proof the fleet is correct. It proves
every worker whose /health answers reports a version equal to the repo artifact, and (in
--content mode) that the normalised live bundle hash matches. It cannot see behavioural
breakage, a worker that answers /health but 500s on its real routes, or a worker with no
version constant at all (that class is reported as NO_REPO_VERSION, never silently skipped).
A NOT_DEPLOYED row now means the worker is absent from the CF account script list -- not
merely that its workers.dev /health 404s (that is NO_HEALTH_ROUTE).
"""
import datetime
import json
import os
import subprocess
import time
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIT_DB = os.environ.get("AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
STATE = "/tmp/fleet-audit.json"
ISSUE_TAG = "FLEET-AUTOAUDIT"

UPSERT = ("INSERT INTO worker_live_audit "
          "(worker,http,live_version,registry_before,match,note,probed_at) "
          "VALUES (?,?,?,?,?,?,?) ON CONFLICT(worker) DO UPDATE SET "
          "http=excluded.http, live_version=excluded.live_version, "
          "registry_before=excluded.registry_before, match=excluded.match, "
          "note=excluded.note, probed_at=excluded.probed_at")
PURGE = "DELETE FROM worker_live_audit WHERE probed_at <> ?"


def die(msg, code=3):
    print(f"::error::{msg}", file=sys.stderr)
    sys.exit(code)


def env(name, required=True):
    v = os.environ.get(name, "")
    if required and not v:
        die(f"missing env {name}")
    return v


# ---------------------------------------------------------------- guard
def _run_guard_once():
    cmd = [sys.executable, os.path.join(ROOT, "scripts", "deploy-drift-guard.py"),
           "--all", "--content", "--json", "--ahead"]
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    out = (p.stdout or "").strip().splitlines()
    if not out:
        die(f"deploy-drift-guard produced no stdout (rc={p.returncode}): {(p.stderr or '')[:200]}")
    try:
        data = json.loads(out[-1])
    except json.JSONDecodeError as e:
        die(f"deploy-drift-guard JSON parse failed: {e}")
    data["_guard_rc"] = p.returncode
    return data


def _has_drift(data):
    return bool(data.get("drift") or data.get("content_drift"))


def _refresh_repo():
    """Fast-forward the checkout to the CURRENT origin/main. True only if HEAD actually moved.

    DRIFT-CONFIRM-1 (2026-10-01): the checkout is fixed when the job STARTS, but the live probes run later, and
    main receives a push every few minutes. Four false DRIFT/repo-ahead rows in one hour (qnfo-fleet-control,
    personal-companion's sibling race, qnfo-fleet-dashboard/ops, qnfo-cloud-ops) were all an old tree compared
    against a live worker that had already been deployed from a newer commit. Never raises: any git failure
    leaves the first result standing.
    """
    def git(*a):
        return subprocess.run(["git"] + list(a), capture_output=True, text=True, cwd=ROOT)
    try:
        before = git("rev-parse", "HEAD").stdout.strip()
        if git("fetch", "-q", "origin", "main").returncode != 0:
            return False
        if git("merge", "-q", "--ff-only", "origin/main").returncode != 0:
            return False
        return git("rev-parse", "HEAD").stdout.strip() != before
    except Exception:
        return False


SETTLE_BUDGET_S = 90      # total wall budget for waiting on in-flight deploys, shared by all candidates
SETTLE_POLL_S = 15
SETTLE_RECENT_S = 900     # only a commit this young can plausibly still be deploying


def _commit_age_s(directory):
    """Seconds since the newest commit touching <directory>; None if unknown."""
    try:
        # A SHALLOW clone reports the single root commit for every path (measured: every directory showed HEAD's age), so
        # the age would be meaningless; unknown is safe (no waiting), a wrong "recent" is not.
        sh = subprocess.run(["git", "rev-parse", "--is-shallow-repository"], capture_output=True, text=True, cwd=ROOT)
        if (sh.stdout or "").strip() != "false":
            return None
        p = subprocess.run(["git", "log", "-1", "--format=%ct", "--", directory],
                           capture_output=True, text=True, cwd=ROOT)
        ts = (p.stdout or "").strip()
        return max(0, int(time.time()) - int(ts)) if ts else None
    except Exception:
        return None


def _settle_inflight(data):
    """DEPLOY-SETTLE-1 (2026-10-01): wait briefly for a deploy that is still landing before calling it DRIFT.

    Every merge that bumps a worker opens a one-to-three-minute window in which the repo is ahead of live and the
    canonical deploy is still running; an audit that probes inside it reports DRIFT for a worker that is about to be
    SYNC (errata-hub 1.1.3 vs 1.1.4, probed 30 s before its deploy completed). Only workers the guard already put in
    `ahead` (repo STRICTLY ahead, one unambiguous version) are considered, and only if their newest commit is recent.
    If live reaches the repo version inside the budget the worker is reported SYNC and removed from `ahead`, so --apply
    cannot redeploy something that just deployed. Anything that does not settle stays DRIFT. Never raises.
    """
    cands = [i for i in data.get("ahead", []) if i.get("worker") and i.get("repo")]
    cands = [i for i in cands if (_commit_age_s(i.get("dir") or i["worker"]) or 10 ** 9) <= SETTLE_RECENT_S]
    if not cands:
        return data
    settled = []
    deadline = time.time() + SETTLE_BUDGET_S
    pending = list(cands)
    while pending:
        still = []
        for it in pending:
            if probe_version(it["worker"]) == it["repo"]:
                settled.append(it)
            else:
                still.append(it)
        pending = still
        if not pending or time.time() + SETTLE_POLL_S > deadline:
            break
        time.sleep(SETTLE_POLL_S)
    if settled:
        names = {i["worker"] for i in settled}
        data["drift"] = [i for i in data.get("drift", []) if _w(i) not in names]
        data["ahead"] = [i for i in data.get("ahead", []) if i.get("worker") not in names]
        data.setdefault("sync_workers", []).extend({"worker": i["worker"], "version": i["repo"]} for i in settled)
        print("DEPLOY-SETTLE-1: in-flight deploy(s) landed within %ds -> SYNC: %s" % (SETTLE_BUDGET_S, sorted(names)))
    if pending:
        print("DEPLOY-SETTLE-1: still ahead after %ds (reported as drift): %s" % (SETTLE_BUDGET_S, sorted(i["worker"] for i in pending)))
    data["_deploy_settle"] = {"waited_for": sorted(i["worker"] for i in cands), "settled": sorted(i["worker"] for i in settled)}
    return data


def run_guard():
    data = _run_guard_once()
    # Confirm before reporting: a drift row must survive a fresh checkout to be real. One extra pass, only when drift
    # was seen, so a clean audit costs nothing and the result converges on the newest main rather than flapping.
    if _has_drift(data) and _refresh_repo():
        first = sorted(_w(i) for i in (data.get("drift", []) + data.get("content_drift", [])))
        data = _run_guard_once()
        data["_drift_confirm"] = {"first_pass": first, "refreshed": True,
                                  "second_pass": sorted(_w(i) for i in (data.get("drift", []) + data.get("content_drift", [])))}
        print("DRIFT-CONFIRM-1: first pass %s; after fast-forwarding to origin/main: %s" % (first, data["_drift_confirm"]["second_pass"]))
    if data.get("ahead"):
        data = _settle_inflight(data)
    # DEAD-STATE-FILE-1 (2026-09-29): apply_ahead() reads STATE and NOTHING in this
    # repository ever wrote it, so `--apply` always reached die() and exited rc=3.
    # Measured: every fleet-autodeploy run failed at the apply step, so the automatic
    # worker-update path had never executed once. run_guard() is the single point both
    # --audit and --apply pass through, so persist here.
    try:
        with open(STATE, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
    except OSError as e:
        print(f"::warning::could not persist audit state to {STATE}: {e}")
    return data


# ---------------------------------------------------------------- D1
def d1(sql, params):
    acct, token = env("CF_ACCOUNT_ID"), env("CLOUDFLARE_API_TOKEN")
    url = (f"https://api.cloudflare.com/client/v4/accounts/{acct}"
           f"/d1/database/{AUDIT_DB}/query")
    body = json.dumps({"sql": sql, "params": params}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code}: {e.read()[:200]!r}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


def d1_changes(res):
    """Rows affected, from either the D1 REST envelope or a plain sqlite3-style reply."""
    try:
        blocks = res.get("result") or []
        if isinstance(blocks, list) and blocks:
            meta = blocks[0].get("meta") or {}
            if "changes" in meta:
                return int(meta["changes"])
        if "changes" in res:
            return int(res["changes"])
    except Exception:
        pass
    return None


# ---------------------------------------------------------------- audit
def _w(it):
    """Resolved worker name from a guard entry, tolerating the legacy bare-string form."""
    if isinstance(it, dict):
        return it.get("worker")
    return it


def classify(d):
    """One dict per worker: the class, live version, repo version, match flag.

    ALLOW-LIST: every class the guard can emit must be handled here. An unhandled class
    is silently dropped, which is the defect this tool exists to prevent.
    """
    rows = {}

    def put(worker, http, live, before, match, note):
        if not worker:
            return
        if worker in rows and rows[worker]["note"] != "SYNC":
            # NOTE-APPEND-IDEMPOTENT-1 (VERSION-PRECEDENCE-1): DUP-WORKER-1 can deliver the
            # same class twice for one resolved worker name; appending it again produced
            # "NO_REPO_VERSION+NO_REPO_VERSION", a note no classifier or query matches.
            if note not in rows[worker]["note"].split("+"):
                rows[worker]["note"] += "+" + note
            rows[worker]["match"] = 0
            return
        rows[worker] = {"worker": worker, "http": http, "live": live,
                        "before": before, "match": match, "note": note}

    for it in d.get("sync_workers", []):
        # SYNC-VERSION-CAPTURE-1 (issue 1509): sync_workers now carries the version.
        # Accept both the object form and the legacy bare-string form so an older guard
        # cannot crash this consumer.
        _v = it.get("version") if isinstance(it, dict) else None
        put(_w(it), 200, _v, _v, 1, "SYNC")
    for it in d.get("drift", []):
        put(it["worker"], 200, it.get("live"), it.get("repo"), 0, "DRIFT")
    for it in d.get("content_drift", []):
        put(it["worker"], 200, None, it.get("repo_sha"), 0, "CONTENT_DRIFT")
    for it in d.get("no_repo_version", []):
        put(it["worker"], 200, it.get("live"), None, 0, "NO_REPO_VERSION")
    for it in d.get("no_live_version", []):
        put(it["worker"], 200, None, it.get("repo"), 0, "NO_LIVE_VERSION")
    # NO_HEALTH_ROUTE-1: deployed per the CF script list, but workers.dev /health 404s.
    # NOT the same as NOT_DEPLOYED; conflating them hid live workers from every check.
    for it in d.get("no_health_route", []):
        put(_w(it), 404, None, None, 0, "NO_HEALTH_ROUTE")
    for it in d.get("live_err", []):
        put(_w(it), 0, None, None, 0, "LIVE_ERR")
    # NOT-DEPLOYED-KEYED-BY-DIR-1: keyed by the RESOLVED worker name like every other
    # class, not by the repo directory. Legacy bare strings are still accepted.
    for it in d.get("not_deployed_workers", []):
        put(_w(it), 404, None, None, 0, "NOT_DEPLOYED")
    # NOT-DEPLOYED-NONWORKER-NOISE-1: a directory with no worker config and no artifact is
    # not a worker. Written in its own class so it cannot inflate NOT_DEPLOYED.
    for it in d.get("not_a_worker", []):
        put(_w(it), 404, None, None, 0, "NOT_A_WORKER")
    # CRON-ONLY-CONSUMER-1: deploy-drift-guard.py emits `cron_only` (deployed, cron-triggered
    # workers with no fetch route, so no /health to probe) deliberately OUTSIDE its exit-code
    # sum. This consumer had no handler, so classify() silently dropped the class: measured
    # 2026-09-30, ai-health-prober and qnfo-email-orchestrator were absent from
    # worker_live_audit although both are live with registered crons. http is NULL because
    # nothing was probed; match stays 0 because the version is unverified, not because it
    # differs (same convention as NO_HEALTH_ROUTE).
    for it in d.get("cron_only", []):
        put(_w(it), None, None, None, 0, "CRON_ONLY")
    # RETIRED-PRESENT-1 (#272): a FOLDED/RETIRED directory whose script exists in the account. Appended to the
    # worker's existing note (CRON_ONLY, NO_HEALTH_ROUTE, ...) so it is visible whatever the health probe returned;
    # match is forced to 0 by put() because a retired worker that exists is by definition not in sync.
    for it in d.get("retired_present", []):
        put(_w(it), None, None, None, 0, "RETIRED_PRESENT")
    return rows


def d1_ok(res):
    """D1-REST-ENVELOPE-OK-1: true success test for a D1 REST reply.

    d1() returns the raw Cloudflare envelope on success -- the shape carrying the keys
    success, errors, messages and result -- and only sets its own "ok" key on a transport
    exception. A truthiness test on that key is therefore None (falsy) for EVERY successful
    call, which is what made every successful write look like a failure.
    """
    if res.get("ok") is False:
        return False
    if res.get("ok") is True:
        return True
    if res.get("success") is not True:
        return False
    blocks = res.get("result") or []
    if blocks and isinstance(blocks[0], dict) and blocks[0].get("success") is False:
        return False
    return True


def d1_err(res):
    """Human-readable failure reason for a d1() reply (never the string None)."""
    if res.get("error") is not None:
        return str(res.get("error"))
    errs = res.get("errors") or []
    if errs:
        return json.dumps(errs)[:200]
    blocks = res.get("result") or []
    if blocks and isinstance(blocks[0], dict):
        blk = blocks[0]
        if blk.get("results") and isinstance(blk["results"], dict):
            return json.dumps(blk["results"])[:200]
        return json.dumps(blk)[:200]
    return "unknown D1 failure (no error, no errors, no result block)"


def write_audit_rows(rows):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    ok, failed = 0, []
    for w in sorted(rows):
        r = rows[w]
        res = d1(UPSERT, [w, r["http"], r["live"], r["before"], r["match"], r["note"], now])
        if d1_ok(res):
            ok += 1
        else:
            failed.append((w, d1_err(res)[:120]))
    return ok, failed, now


def purge_stale(now):
    """AUDIT-STALE-ROWS-1: after a FULL audit, drop rows this run did not advance.

    Only safe for a full run: on a scoped run the untouched rows are legitimately outside
    the scan and purging them would silently shrink the audit surface.
    """
    res = d1(PURGE, [now])
    if not d1_ok(res):
        return None, d1_err(res)[:160]
    return d1_changes(res), None


def summary_md(d, rows, ok, failed, now, purged=None, purge_err=None):
    counts = {}
    for r in rows.values():
        counts[r["note"]] = counts.get(r["note"], 0) + 1
    lines = [
        f"# {ISSUE_TAG} fleet self-audit - {now}Z", "",
        f"- workers classified: **{len(rows)}** | audit rows written: **{ok}** | write failures: **{len(failed)}**",
        f"- content-level check: **{'ON' if d.get('content_checked') else 'OFF (no CF token)'}**",
        f"- name resolution (dir -> wrangler.toml `name`): **{'ON' if d.get('name_resolution') else 'OFF'}**",
        f"- CF account script list (separates NO_HEALTH_ROUTE from NOT_DEPLOYED): **{'ON' if d.get('cf_script_list') else 'OFF (no CF token)'}**",
        f"- guard scope: **{d.get('scope') or 'unknown'}**",
        f"- guard rc: `{d.get('_guard_rc')}`", "", "## Class counts", "", "| class | n |", "|---|---|",
    ]
    for k in sorted(counts):
        lines.append(f"| {k} | {counts[k]} |")
    if d.get("scope") == "all":
        if purge_err:
            lines.append(f"\n- stale-row purge: **FAILED** ({purge_err})")
        else:
            lines.append(f"\n- stale-row purge: **{purged}** rows removed (probed_at <> this run)")
    ahead = d.get("ahead", [])
    lines += ["", f"## Repo-ahead (safe to auto-deploy): {len(ahead)}", ""]
    if ahead:
        for it in ahead:
            lines.append(f"- `{it['worker']}` (dir `{it.get('dir')}`) repo `{it['repo']}` > live `{it['live']}`")
    else:
        lines.append("- none")
    if failed:
        lines += ["", "## D1 write failures", ""]
        for w, e in failed:
            lines.append(f"- `{w}`: {e}")
    lines += ["", "## What this audit cannot see", "",
              "- behavioural breakage behind a 200 /health",
              "- workers with no version constant (reported as NO_REPO_VERSION, not skipped)",
              "- content drift is hash-based on a normalised bundle, so formatting-only diffs are masked",
              "- a worker deployed but with a disabled workers.dev route is NO_HEALTH_ROUTE, not verified",
              "- NOT_A_WORKER rows are directories, not workers: they are recorded for provenance only"]
    return "\n".join(lines) + "\n"


GH_RETRY_MAX = 5          # attempts per call
GH_RETRY_BUDGET_S = 240   # total time one call may spend waiting out a rate limit
GH_RETRY_CAP_S = 120      # longest single wait


def _rate_limit_wait(code, headers, body, attempt):
    """Seconds to wait before retrying, or None if this response is NOT a rate limit (so it must fail now).

    RATELIMIT-RETRY-1 (2026-10-01): run 36836230221 wrote all 113 audit rows to D1 and then failed to publish the report with
    `HTTP 403: API rate limit exceeded for installation`. gh_api made one attempt and returned an error that main() only printed
    as a warning, so issue #52 kept showing a previous run's text: the system's state was right in D1 and wrong where people
    (and the drain hook) read it. This repo is written by many concurrent sessions and workflows, so the installation quota is
    routinely exhausted for a minute at a time. GitHub's own signals are honoured; anything that is not a rate limit (a real 403,
    404, 422) still fails immediately.
    """
    if code not in (403, 429):
        return None
    text = body.decode("utf-8", "replace").lower() if isinstance(body, (bytes, bytearray)) else str(body or "").lower()
    get = (lambda k: headers.get(k)) if headers is not None else (lambda k: None)
    retry_after, remaining, reset = get("Retry-After"), get("x-ratelimit-remaining"), get("x-ratelimit-reset")
    if not (code == 429 or "rate limit" in text or remaining == "0"):
        return None
    if retry_after and str(retry_after).isdigit():
        wait = int(retry_after)
    elif remaining == "0" and reset and str(reset).isdigit():
        wait = max(1, int(reset) - int(time.time())) + 1
    else:
        wait = 15 * (2 ** attempt)  # 15, 30, 60, 120
    return min(wait, GH_RETRY_CAP_S)


def gh_api(method, path, payload=None):
    token = env("GITHUB_TOKEN")
    repo = env("GITHUB_REPOSITORY")
    url = f"https://api.github.com/repos/{repo}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    waited = 0
    for attempt in range(GH_RETRY_MAX):
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "User-Agent": "qnfo-fleet-autoaudit",
            "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read()
            wait = _rate_limit_wait(e.code, e.headers, body, attempt)
            if wait is None or attempt == GH_RETRY_MAX - 1 or waited + wait > GH_RETRY_BUDGET_S:
                tail = f" (rate-limited; gave up after {attempt + 1} attempts, waited {waited}s)" if wait is not None else ""
                return {"_error": f"HTTP {e.code}: {body[:200]!r}{tail}"}
            print(f"::warning::GitHub API rate-limited (HTTP {e.code}) on {method} {path}; retry {attempt + 1}/{GH_RETRY_MAX - 1} in {wait}s")
            time.sleep(wait)
            waited += wait
        except Exception as e:
            return {"_error": str(e)[:200]}
    return {"_error": "unreachable"}


def publish_issue(body):
    existing = gh_api("GET", "/issues?state=open&per_page=100")
    if isinstance(existing, list):
        for it in existing:
            if str(it.get("title", "")).startswith(ISSUE_TAG):
                res = gh_api("PATCH", f"/issues/{it['number']}", {"body": body})
                return "updated", it.get("number"), res.get("_error")
    res = gh_api("POST", "/issues", {"title": f"{ISSUE_TAG}: scheduled fleet self-audit",
                                     "body": body, "labels": ["fleet-autoaudit"]})
    return "created", res.get("number"), res.get("_error")


def _record_publish_failure(action, num, err, now):
    """If the report could not be published even after retries, leave a fleet-visible trace (never raises).

    D1 holds the authoritative audit; issue #52 is the human-readable VIEW of it. When the view goes stale the system must say
    so somewhere other than a log line, or "the system knows its own state" is true only for whoever reads D1.
    """
    try:
        import uuid
        d1("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)",
           ["ce_" + uuid.uuid4().hex[:14], datetime.datetime.utcnow().isoformat() + "Z", "autoaudit.publish-failed",
            ("issue %s failed; D1 worker_live_audit (probed_at=%s) is current, the #52 report is stale: %s" % (action, now, err))[:500],
            json.dumps({"action": action, "issue": num, "audit_at": now, "error": str(err)[:300]}), "fleet-autoaudit", "error"])
    except Exception:
        pass


# ---------------------------------------------------------------- apply
def probe_version(worker):
    url = f"https://{worker}.q08.workers.dev/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "qnfo-fleet-autoaudit"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.load(r)
        return data.get("version") or data.get("VERSION")
    except Exception as e:
        return "ERR:" + str(e)[:60]


def declares_containers(worker):
    """CONTAINER-CONFIG-DROPPED-1: True if <worker>/wrangler.toml declares [[containers]].

    raw_put.py PUTs /content and cannot transmit script-level container config, so an
    automatic redeploy of such a worker silently destroys its container binding.
    Measured: deployment_history ids 172/175/177 vs the first container.error row 8s
    after id 172. Container workers must go through wrangler deploy
    (.github/workflows/deploy-containers-pilot.yml).
    """
    p = os.path.join(ROOT, worker, "wrangler.toml")
    try:
        with open(p, encoding="utf-8", errors="replace") as f:
            txt = f.read()
    except OSError:
        return False
    return "[[containers]]" in txt


def apply_ahead(d=None):
    # DEAD-STATE-FILE-1 (2026-09-29): prefer the caller-supplied payload; the on-disk
    # file is now only a fallback for an out-of-process caller. Previously this read was
    # the ONLY path and no writer existed anywhere, so the function could do nothing but
    # die() - which is why step 8 of fleet-autodeploy.yml failed on every run.
    if d is None:
        if not os.path.isfile(STATE):
            die("no audit state; run --audit first")
        d = json.load(open(STATE))
    ahead = d.get("ahead", [])
    print(f"auto-deploy candidates (repo strictly ahead): {len(ahead)}")
    applied, failed = [], []
    container_skips = []
    canonical = bool(os.environ.get("OPS_ROUTER_AUTH_KEY", "").strip())
    for it in ahead:
        # APPLY-AHEAD-NAMEERROR-1 (2026-09-30): `w` was read by declares_containers() BEFORE it was bound
        # below, so the FIRST repo-ahead worker raised NameError and killed the whole auto-deploy. It was
        # latent only because `ahead` had been empty; unpack first.
        w, art, rv = it["worker"], it["artifact"], it["repo"]
        if declares_containers(w):
            print("::warning::SKIPPED " + w + " -- declares [[containers]]; raw_put.py "
                  "cannot transmit container config (CONTAINER-CONFIG-DROPPED-1, #1485). "
                  "Deploy via .github/workflows/deploy-containers-pilot.yml")
            container_skips.append((w, rv))
            continue
        if canonical:
            # AUTODEPLOY-CANONICAL-1: the canonical route takes the guard lock, ledgers, applies
            # wrangler.toml schedules and declared compat flags. raw_put.py is only the fallback.
            rel = os.path.relpath(os.path.join(ROOT, art), ROOT) if os.path.isabs(art) else art
            print(f"-> canonical /ops/deploy {w} {rel} (repo {rv} > live {it['live']})")
            p = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "canonical_deploy.py"),
                                "--worker", w, "--path", rel], capture_output=True, text=True, cwd=ROOT)
            print((p.stdout or "")[-1200:])
        else:
            print(f"-> raw_put {w} {art} (repo {rv} > live {it['live']})")
            p = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "raw_put.py"), w, art],
                               capture_output=True, text=True, cwd=ROOT)
        if p.returncode != 0:
            failed.append((w, f"deploy rc={p.returncode} {(p.stderr or '')[:160]}"))
            print(f"::warning::deploy failed for {w}")
            continue
        live = probe_version(w)
        if live == rv:
            applied.append((w, rv, live))
        else:
            failed.append((w, f"verify mismatch: expected {rv}, live {live}"))
            print(f"::warning::{w} did not converge to {rv} (live {live})")
    print(f"AUTO-DEPLOY applied={len(applied)} failed={len(failed)}")
    for w, rv, lv in applied:
        print(f"  OK {w} {rv}")
    for w, e in failed:
        print(f"  FAIL {w}: {e}")
    return failed


# ---------------------------------------------------------------- main
def main():
    mode = "--apply" if "--apply" in sys.argv else "--audit"
    d = run_guard()
    rows = classify(d)
    ok, failed, now = write_audit_rows(rows)
    purged, purge_err = (None, None)
    if d.get("scope") == "all":
        purged, purge_err = purge_stale(now)
        if purge_err:
            print(f"::warning::stale-row purge failed: {purge_err}")
    body = summary_md(d, rows, ok, failed, now, purged, purge_err)
    os.makedirs(os.path.join(ROOT, "audits"), exist_ok=True)
    out = os.path.join(ROOT, "audits", f"fleet-autoaudit-{now[:10]}.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"audited_at": now, "guard": d, "rows": rows,
                   "d1_writes_ok": ok, "d1_write_failures": failed,
                   "stale_rows_purged": purged, "purge_error": purge_err}, fh, indent=2, sort_keys=True)
    print(body)
    action, num, err = publish_issue(body)
    if err:
        print(f"::warning::issue publish {action} failed: {err}")
        _record_publish_failure(action, num, err, now)
    else:
        print(f"self-audit issue {action}: #{num}")

    rc = 1 if (failed or purge_err) else 0
    if mode == "--apply":
        rc = 1 if apply_ahead(d) else rc
    sys.exit(rc)


if __name__ == "__main__":
    main()
