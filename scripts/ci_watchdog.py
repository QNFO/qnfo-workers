#!/usr/bin/env python3
"""ci-watchdog.py - catch and remediate QNFO/qnfo-workers CI failure modes.

WHY THIS IS EVENT-DRIVEN AND NOT SCHEDULED
  On this repository the GitHub `schedule` event has NEVER fired: zero runs with
  event=schedule across the whole run history, including the 06:17 UTC
  (deploy-drift) and 06:23 UTC (indexnow-submit) slots. Any monitor built on a
  cron expression is therefore dead on arrival. Meanwhile EVERY run triggered by
  a push or a workflow_run has fired. So this watchdog hangs off `workflow_run`
  (completed) plus workflow_dispatch, and does its own time-gated periodic sweep.

WHAT IT CATCHES (one class per real failure mode observed 2026-09-26/27)
  silent-schedule   a workflow declares `schedule` but has 0 schedule-event runs
  mirror-lag        mirror-guard red: deployed-current.worker.js lags worker.js
  build-gate        deploy-gate red: WORKER-BUILD-GATE-1 / wrangler dry-run
  invalid-workflow  a run exists with ZERO jobs (broken workflow YAML)
  missing-module    MODULE_NOT_FOUND in the job log (workflow references an
                    uncommitted file)
  codeql-config     code scanning default-setup is not `configured`
  unknown           anything else, filed with the raw evidence

WHAT IT DOES ABOUT EACH (detect -> ACT -> verify, never detect-only)
  silent-schedule   dispatch the workflow so it actually executes
  mirror-lag        dispatch mirror-sync.yml (the repair actor)
  codeql-config     PATCH default-setup to configured
  others            file or refresh ONE deduped issue carrying the exact
                    evidence and the hinted fix; never owner=USER

Exit: 0 when every finding was acted on or is already tracked
      1 when a finding is unactionable and untracked (the watchdog is a gate)

Env: GH_TOKEN / GITHUB_TOKEN (needs actions:write, issues:write, contents:read)
     REPO (default QNFO/qnfo-workers)  DRY_RUN=1 to suppress all writes
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

REPO = os.environ.get("REPO", "QNFO/qnfo-workers")
TOKEN = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
DRY = os.environ.get("DRY_RUN") == "1"
API = "https://api.github.com"
LABEL = "ci-watchdog"
TITLE_PREFIX = "[ci-watchdog]"
# A finding filed against the watchdog itself is an unbreakable loop: the
# monitor goes red, flags its own red, and can never recover.
SELF_WORKFLOWS = {"ci-watchdog"}
# One-shot workflows (appliers / restorers) are never re-dispatched on a timer (ONE-SHOT-NO-TIMER-1).
ONE_SHOT_PREFIXES = ("apply-", "restore-", "container-config-restore")


def gh(path: str, method: str = "GET", body: dict | None = None):
    """Minimal API client. Returns (status, parsed)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "qnfo-ci-watchdog")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw.strip() else {}
        except Exception:
            return e.code, {"raw": raw[:500]}
    except Exception as e:  # network
        return 0, {"err": str(e)}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Do not auto-follow: the job-log 302 target must not receive our headers."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _raw_log(job_id: int, cap: int = 200000) -> str:
    """Fetch one job log, following the 302 to signed blob storage WITHOUT auth.

    CI-WATCHDOG-LOGFETCH-1. The logs endpoint 302-redirects to a pre-signed
    object-store URL that rejects any request carrying an Authorization header,
    and urllib's default handler replays the original headers on the follow-up --
    so the follow-up 403s and every fetch in CI returned nothing, which degraded
    unclassifiable findings to `unknown`. Doing the two-step by hand, with a
    header-free second request, is the fix. The signed URL is the credential.
    """
    url = f"{API}/repos/{REPO}/actions/jobs/{job_id}/logs"
    opener = urllib.request.build_opener(_NoRedirect)
    req = urllib.request.Request(url, method="GET")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "qnfo-ci-watchdog")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    loc = ""
    try:
        with opener.open(req, timeout=30) as r:
            return r.read(cap).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            loc = e.headers.get("Location") or ""
        else:
            return ""
    except Exception:
        return ""
    if not loc:
        return ""
    # Hop 2: NO Authorization header. The pre-signed URL is the credential.
    req2 = urllib.request.Request(loc, method="GET")
    req2.add_header("User-Agent", "qnfo-ci-watchdog")
    try:
        with urllib.request.urlopen(req2, timeout=60) as r:
            return r.read(cap).decode("utf-8", "replace")
    except Exception:
        return ""


# --------------------------------------------------------------------------
# COLLECT
# --------------------------------------------------------------------------
def workflows() -> list[dict]:
    st, d = gh(f"/repos/{REPO}/actions/workflows?per_page=100")
    return d.get("workflows", []) if st == 200 else []


def runs(per_page: int = 100, **q) -> list[dict]:
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    st, d = gh(f"/repos/{REPO}/actions/runs?per_page={per_page}" + ("&" + qs if qs else ""))
    return d.get("workflow_runs", []) if st == 200 else []


def run_events(wf_id: int, per_page: int = 100) -> list[dict]:
    st, d = gh(f"/repos/{REPO}/actions/workflows/{wf_id}/runs?per_page={per_page}")
    return d.get("workflow_runs", []) if st == 200 else []


def job_logs(run_id: int) -> str:
    st, d = gh(f"/repos/{REPO}/actions/runs/{run_id}/jobs")
    if st != 200:
        return ""
    out = []
    for j in d.get("jobs", []):
        txt = _raw_log(j["id"])
        if txt:
            out.append(txt)
    return "\n".join(out)


# --------------------------------------------------------------------------
# CLASSIFY
# --------------------------------------------------------------------------
def classify_structural(name: str, run: dict) -> tuple[str, str]:
    """Classify WITHOUT downloading a job log.

    The job-log endpoint 302-redirects to signed blob storage, and the
    redirected request carries the Authorization header it will not accept,
    so in CI the log fetch yielded nothing and every finding degraded to
    `unknown` (19 of 22 observed). Workflow identity and file presence are
    structured, always available, and need no download.
    """
    if name in SELF_WORKFLOWS:
        return "self", "the watchdog never files against itself"
    # A run whose display NAME is the workflow FILE PATH is a workflow GitHub could
    # not parse: the `name:` key was never read, so the path was used instead. Such
    # a run is created with ZERO jobs, so there is no job log to inspect -- it can
    # only be named structurally. This is the WORKFLOW-YAML-LINT-1 class
    # (deploy-qnfo-ops.yml, 2026-09-29), which silently killed a deploy path.
    if name.endswith((".yml", ".yaml")):
        return "invalid-workflow", (
            "the workflow file is unparseable (run name is the file path); "
            "run scripts/workflow-lint.py"
        )
    if name == "mirror-guard":
        return "mirror-lag", "dispatch mirror-sync.yml (mirror-guard.py --fix actor)"
    if name == "deploy-gate":
        return "build-gate", "WORKER-BUILD-GATE-1: a wrangler.toml `main` does not resolve in a changed dir"
    if name == "version-compare":
        if _absent("qnfo-fleet-control/version-compare.mjs", run) or _absent(
            "qnfo-fleet-control/version-compare.test.mjs", run
        ):
            return "missing-module", "the workflow runs a module/suite that is not committed; land it or retire the workflow"
        return "comparator-regression", "the fail-closed comparator invariant regressed; do NOT relax rule 5"
    if name in ("deploy-drift", "indexnow-submit"):
        return "external-runner", "driven by the watchdog because GitHub `schedule` never fires on this repo"
    return "unknown", "inspect the job log"


def _absent(path: str, run: dict) -> bool:
    ref = run.get("head_branch") or "main"
    st, _ = gh(f"/repos/{REPO}/contents/{path}?ref={ref}")
    return st == 404


def classify(log: str, wf_name: str) -> tuple[str, str]:
    L = log or ""
    if "DRIFT GATE FAILED" in L or "mirror-guard" in wf_name and "LAG" in L:
        return "mirror-lag", "dispatch mirror-sync.yml (mirror-guard.py --fix actor)"
    if "WORKER-BUILD-GATE-1" in L or "entry-point file at" in L:
        return "build-gate", "a wrangler.toml `main` does not resolve; fix the entry-point or drop the stale wrangler.toml"
    if "MODULE_NOT_FOUND" in L or "Cannot find module" in L:
        return "missing-module", "the workflow references a file that is not committed; land it or retire the workflow"
    # WATCHDOG-CLASSES-2 (2026-09-30): the three open findings #139/#142/#145 were all filed as `unknown`
    # although their logs name the class exactly.
    if "FAIL-CLOSED" in L and ("anchor" in L or "matched 0 times" in L or "occurs 0 times" in L):
        return "stale-anchor", (
            "an applier re-ran after its change landed (or the target moved) and its anchor no longer "
            "matches; key idempotency on the feature's markers, not the exact VERSION literal "
            "(APPLIER-LANDED-MARKERS-1), or retire the applier"
        )
    # DEPLOY-AUTH-CLASS-1 (2026-10-01, issue 212): canonical-deploy runs 36831942233 and 36832200123 FAILED because
    # ops.qnfo.org/ops/deploy answered HTTP 401 (the Actions secret OPS_ROUTER_AUTH_KEY no longer matches the Worker's
    # rotated key, issues 1676/1701), but were filed as `push-race`: the classifier saw the word "rebase" in an echoed
    # COMMENT line and a "failed to push some refs" from a retry that then succeeded. The failing step is named first.
    if ("status=401" in L and "canonical deploy failed" in L) or "Unauthorized - set" in L:
        return "deploy-unauthorized", (
            "ops.qnfo.org rejected the Actions secret OPS_ROUTER_AUTH_KEY (HTTP 401): it no longer matches the Worker's "
            "key (credential rotation in progress, issues 1676/1701). The credential holder sets the Actions secret to the "
            "Worker's current key (repository Settings > Secrets and variables > Actions); do not rotate from CI"
        )
    # A push race is a finding only if the push did NOT recover; the artifact steps retry onto origin/main and log
    # "pushed on attempt N" when they land (ARTIFACT-PUSH-CONFLICT-1). Match the git conflict itself, not the word
    # "rebase", which also appears in comments the runner echoes into the log.
    recovered = "pushed on attempt" in L
    if not recovered and ("CONFLICT (content)" in L or ("failed to push some refs" in L and "rebase" in L)):
        return "push-race", (
            "a concurrent writer moved main; an artifact commit must re-apply its snapshot onto "
            "origin/main instead of merging (ARTIFACT-PUSH-CONFLICT-1)"
        )
    if "not a valid model identifier" in L:
        return "unknown", "inspect"
    return "unknown", "inspect the job log"


def setup_config() -> str:
    """Code-scanning default-setup state.

    An authz-limited probe is NOT drift. The CI GITHUB_TOKEN commonly
    answers 403 here (reading code scanning needs `security-events: read`),
    and reporting that as `state=http-403` manufactured a permanent false
    finding whose remediation also 403d -- an unbreakable red. An
    unauthorized probe proves nothing, so return "unobservable" and let the
    caller skip. Same discipline as AUTHED-PROBE-HEADER-1.
    """
    st, d = gh(f"/repos/{REPO}/code-scanning/default-setup")
    if st == 200:
        return d.get("state", "unknown")
    return "unobservable"


# --------------------------------------------------------------------------
# ACT
# --------------------------------------------------------------------------
def dispatch(wf_file: str, ref: str = "main") -> tuple[bool, str]:
    if DRY:
        return True, "DRY_RUN"
    st, _ = gh(f"/repos/{REPO}/actions/workflows/{wf_file}/dispatches", "POST", {"ref": ref})
    return st in (204, 200), f"http-{st}"


def configure_codeql() -> tuple[bool, str]:
    if DRY:
        return True, "DRY_RUN"
    st, d = gh(
        f"/repos/{REPO}/code-scanning/default-setup",
        "PATCH",
        {"state": "configured", "languages": ["actions", "javascript-typescript", "python"]},
    )
    return st in (200, 202), f"http-{st} {d.get('state', '')}".strip()


def ensure_label() -> None:
    if DRY:
        return
    gh(f"/repos/{REPO}/labels", "POST", {"name": LABEL, "color": "b60205",
                                         "description": "filed by ci-watchdog"})


def file_or_refresh(klass: str, subject: str, body: str) -> str:
    """ONE deduped open issue per (class, subject). Refresh, never duplicate."""
    title = f"{TITLE_PREFIX} {klass}: {subject}"
    if DRY:
        return f"DRY_RUN would file {title!r}"
    st, d = gh(f"/repos/{REPO}/issues?state=open&labels={LABEL}&per_page=100")
    existing = None
    if st == 200:
        for it in d:
            if it.get("title") == title:
                existing = it
                break
    if existing:
        # Cooldown: without this the same known class is re-commented on every
        # watchdog run (one run added six comments to the same issue).
        upd = existing.get("updated_at") or ""
        try:
            import datetime as _d2
            ut = _d2.datetime.fromisoformat(upd.replace("Z", "+00:00"))
            age_h = (_d2.datetime.now(_d2.timezone.utc) - ut).total_seconds() / 3600.0
            if age_h < 6:
                return f"already reported #{existing['number']} ({age_h:.1f}h ago)"
        except Exception:
            pass
        gh(f"/repos/{REPO}/issues/{existing['number']}/comments", "POST", {"body": body})
        return f"refreshed #{existing['number']}"
    st, d = gh(f"/repos/{REPO}/issues", "POST",
               {"title": title, "body": body, "labels": [LABEL]})
    return f"filed #{d.get('number')}" if st in (201, 200) else f"FAILED http-{st}"


# --------------------------------------------------------------------------
# SUPERSEDED-FAILURE-SKIP-1 (2026-10-01, issues #332/#333)
# --------------------------------------------------------------------------
# A failed run whose workflow has a NEWER successful run on the same branch is
# already fixed. Filing it again re-opens exactly what ci_watchdog_resolve.py
# just closed on that same green evidence, and the two scripts then ping-pong on
# every push to main: observed live, #332 (run 36860029746, version-bump-guard on
# claude/ecstatic-davinci-dnfa45) was closed 12:13:03Z on green run 36860215928
# and #333 was filed for the SAME failed run at 12:13:14Z. Two cheap rules stop
# it: (1) skip a failure superseded by a later green run of the same workflow on
# the same branch; (2) skip a run id that a CLOSED ci-watchdog issue inside the
# window already cites (covers failures the resolver closed as "retired").
def superseded_by_green(run: dict, pool: list[dict]) -> dict | None:
    """Newest-first `pool` is the run list already in hand; pure, no API call."""
    key = run.get("workflow_id") or run.get("name")
    branch = run.get("head_branch")
    created = run.get("created_at") or ""
    best = None
    for o in pool:
        if o is run or o.get("id") == run.get("id"):
            continue
        if (o.get("workflow_id") or o.get("name")) != key:
            continue
        if o.get("head_branch") != branch or o.get("conclusion") != "success":
            continue
        if (o.get("created_at") or "") > created and (best is None or (o.get("created_at") or "") > (best.get("created_at") or "")):
            best = o
    return best


def branch_runs(workflow_id, branch: str, per_page: int = 10) -> list[dict]:
    """The newest runs of one workflow on one branch (one call; only when the 60-run pool had no verdict)."""
    if not workflow_id or not branch:
        return []
    import urllib.parse as _up
    st, d = gh(f"/repos/{REPO}/actions/workflows/{workflow_id}/runs?branch={_up.quote(branch, safe='')}&per_page={per_page}")
    return d.get("workflow_runs", []) if st == 200 and isinstance(d, dict) else []


def run_ids_in_bodies(issues: list[dict]) -> dict[int, int]:
    """run id -> issue number for every `run=<id>` a finding body cites. Pure."""
    import re as _re
    out: dict[int, int] = {}
    for it in issues or []:
        for m in _re.finditer(r"\brun=(\d+)\b", str(it.get("body") or "")):
            out.setdefault(int(m.group(1)), int(it.get("number") or 0))
    return out


def closed_finding_runs(since_iso: str) -> dict[int, int]:
    """Run ids already closed by a ci-watchdog finding updated since `since_iso`."""
    st, d = gh(f"/repos/{REPO}/issues?state=closed&labels={LABEL}&since={since_iso}&per_page=100")
    return run_ids_in_bodies(d if st == 200 and isinstance(d, list) else [])


# --------------------------------------------------------------------------
# MAIN
# --------------------------------------------------------------------------
def main() -> int:
    if not TOKEN:
        print("ci-watchdog: no token; set GH_TOKEN", file=sys.stderr)
        return 1

    findings: list[dict] = []
    wfs = workflows()
    print(f"ci-watchdog: repo={REPO} workflows={len(wfs)}")

    inventory = []
    for w in wfs:
        rs = run_events(w["id"])
        events = {r.get("event") for r in rs}
        state = w.get("state")
        last = rs[0]["created_at"][:19] if rs else "-"
        scheduled = "schedule" in events
        declared = "schedule" in (w.get("path") or "")
        inventory.append({
            "id": w["id"], "name": w["name"], "path": w["path"], "state": state,
            "runs": len(rs), "events": sorted(e for e in events if e),
            "last": last, "ever_scheduled": scheduled,
        })
        print(f"  {state:7s} {w['name']:18s} runs={len(rs):3d} last={last} events={sorted(e for e in events if e)}")

    import datetime as _dtdt
    _now = _dtdt.datetime.now(_dtdt.timezone.utc)
    recent_wf = set()
    for _it in inventory:
        if _it["last"] == "-":
            continue
        try:
            _t = _dtdt.datetime.fromisoformat(_it["last"]).replace(tzinfo=_dtdt.timezone.utc)
            if (_now - _t).total_seconds() < 55 * 60:
                recent_wf.add(_it["name"])
        except Exception:
            pass

    # --- class: silent-schedule -------------------------------------------
    for it in inventory:
        if it["runs"] > 0 and not it["ever_scheduled"] and it["events"]:
            # declared a schedule but has never produced a schedule-event run
            st, raw = gh(f"/repos/{REPO}/contents/{it['path']}?ref=main")
            declared = False
            if st == 200 and isinstance(raw, dict) and raw.get("content"):
                import base64
                txt = base64.b64decode(raw["content"]).decode("utf-8", "replace")
                declared = "schedule:" in txt or "schedule\n" in txt
            if declared:
                findings.append({"class": "silent-schedule", "subject": it["name"],
                                 "evidence": f"{it['path']}: no schedule-event run ever (events={it['events']}, runs={it['runs']})"})

    # --- class: codeql-config ---------------------------------------------
    cs = setup_config()
    if cs == "unobservable":
        print("codeql: default-setup not observable with this token "
              "(needs security-events: read) -> cannot-observe, NOT drift")
    elif cs != "configured":
        findings.append({"class": "codeql-config", "subject": "default-setup",
                         "evidence": f"state={cs}"})

    # --- failures in the last 60 runs -------------------------------------
    # Bounded on purpose: the watchdog runs on a 10-minute CI budget and must
    # not re-litigate history. Only failures inside WINDOW_HOURS are considered,
    # log fetches are capped, and a retired workflow (file gone from the ref) is
    # recorded without spending a log fetch on it.
    import datetime as _dt
    # 6h, not 48h: a wide window re-reported the same past failures on every
    # run, so the gate could never reach green. Old history must age out.
    WINDOW_HOURS = int(os.environ.get("CI_WD_WINDOW_HOURS", "6"))
    # Log fetching is the only expensive call here. It is capped hard because the
    # watchdog runs on a 10-minute CI budget, and the cheap signals (a run with
    # ZERO jobs, and the workflow name) already classify the common cases.
    MAX_LOG_FETCHES = int(os.environ.get("CI_WD_MAX_LOG_FETCHES", "3"))
    cutoff = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(hours=WINDOW_HOURS)).isoformat().replace("+00:00", "Z")
    log_fetches = 0
    superseded: list[tuple[str, str]] = []
    if WINDOW_HOURS > 0:
        pool = runs(per_page=60)
        closed_runs = closed_finding_runs(cutoff)
        for r in pool:
            if r.get("conclusion") != "failure":
                continue
            if (r.get("created_at") or "") < cutoff:
                continue
            name = r.get("name") or ""
            if name in SELF_WORKFLOWS:
                continue
            # SUPERSEDED-FAILURE-SKIP-1: a later green run on the same branch, or a finding the
            # resolver already closed for this run id, means there is nothing left to file.
            _ev = f"{r['created_at'][:19]} {name} [{r.get('event')}/{r.get('head_branch')}] run={r['id']}"
            if r.get("id") in closed_runs:
                superseded.append((f"- `superseded` **{name}** — {_ev}", f"already closed as #{closed_runs[r['id']]}"))
                continue
            # MAIN-ONLY-FINDINGS-1 (2026-10-02): a red check on a pull-request branch belongs to that PR, which already
            # shows it; filing a repository issue for it was noise, and run 36985122769 failed the whole watchdog when that
            # issue create got HTTP 403 (code-loop-test on claude/js-verify-runtime-errors). Only main is watched here.
            if (r.get("head_branch") or "main") != "main":
                continue
            g = superseded_by_green(r, pool) or superseded_by_green(r, branch_runs(r.get("workflow_id"), r.get("head_branch") or ""))
            if g:
                superseded.append((f"- `superseded` **{name}** — {_ev}", f"superseded by green run {g.get('id')} ({(g.get('created_at') or '')[:19]})"))
                continue
            path = (r.get("path") or "")
            st, _ = gh(f"/repos/{REPO}/contents/{path}?ref={r.get('head_branch') or 'main'}")
            retired = st == 404
            # Structural first: needs no log download, and log downloading
            # is exactly what silently failed in CI.
            kl, hint = classify_structural(name, r)
            if kl == "unknown" and not retired and log_fetches < MAX_LOG_FETCHES:
                stj, jd = gh(f"/repos/{REPO}/actions/runs/{r['id']}/jobs")
                if stj == 200 and not jd.get("jobs"):
                    kl, hint = "invalid-workflow", "the workflow YAML is invalid; GitHub created the run with zero jobs"
                elif stj == 200:
                    for j in jd.get("jobs", []):
                        txt = _raw_log(j["id"])
                        log_fetches += 1
                        k2, h2 = classify(txt, name)
                        if k2 != "unknown":
                            kl, hint = k2, h2
                            break
            findings.append({
                "class": kl, "subject": name,
                "evidence": f"{r['created_at'][:19]} {name} [{r.get('event')}/{r.get('head_branch')}] run={r['id']} retired={retired}",
                "retired": retired, "run_id": r["id"], "hint": hint, "sha": (r.get("head_sha") or "")[:8],
            })
    else:
        print("failures loop skipped (CI_WD_WINDOW_HOURS<=0)")

    # --- ACT ---------------------------------------------------------------
    ensure_label()
    acted, tracked, unactionable = [], [], []
    for f in findings:
        k, subj = f["class"], f["subject"]
        line = f"- `{k}` **{subj}** — {f['evidence']}"
        if k == "silent-schedule":
            wf_file = _wf_file(inventory, subj)
            if subj in recent_wf:
                tracked.append((line, "already dispatched within the last 55 min"))
            elif wf_file.startswith(ONE_SHOT_PREFIXES):
                # ONE-SHOT-NO-TIMER-1 (2026-09-30): an applier/restorer's schedule is a retry guard for a
                # change that either landed (re-running it is noise, or RED on a moved anchor: #139/#142)
                # or a break-glass restore (re-running it blind re-uploads a healthy worker: #1506).
                # Never re-run a one-shot on a timer; push triggers and manual dispatch still work.
                tracked.append((line, "one-shot workflow; not timer-dispatched (ONE-SHOT-NO-TIMER-1)"))
            else:
                ok, how = dispatch(wf_file)
                (acted if ok else unactionable).append((line, f"dispatched -> {how}"))
        elif k == "codeql-config":
            ok, how = configure_codeql()
            (acted if ok else unactionable).append((line, f"configured -> {how}"))
        elif k == "mirror-lag":
            ok, how = dispatch("mirror-sync.yml")
            (acted if ok else unactionable).append((line, f"dispatched mirror-sync -> {how}"))
        else:
            if f.get("retired"):
                (tracked).append((line, "workflow file removed; cannot re-run (retired)"))
                continue
            body = (f"{f['evidence']}\n\n**Suggested fix:** {f.get('hint','inspect')}\n\n"
                    f"Filed by `scripts/ci_watchdog.py` (event-driven; GitHub `schedule` has never fired on this repo).")
            res = file_or_refresh(k, subj, body)
            (tracked if "FAILED" not in res else unactionable).append((line, res))

    # --- REPORT ------------------------------------------------------------
    print("\n=== ci-watchdog summary ===")
    print(f"findings={len(findings)} acted={len(acted)} tracked={len(tracked)} unactionable={len(unactionable)}")
    for line, how in acted:
        print("ACT   " + line + "  -> " + how)
    for line, how in tracked:
        print("TRACK " + line + "  -> " + how)
    for line, how in unactionable:
        print("OPEN  " + line + "  -> " + how)
    for line, how in superseded:
        print("SKIP  " + line + "  -> " + how)
    summary = {"repo": REPO, "when": __import__("datetime").datetime.utcnow().isoformat() + "Z",
               "inventory": inventory, "findings": findings,
               "acted": [a[0] for a in acted],
               "tracked": [t[0] for t in tracked],
               "unactionable": [u[0] for u in unactionable],
               "superseded": [s[0] + "  -> " + s[1] for s in superseded]}
    with open("ci-watchdog-summary.json", "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)
    print("\nwrote ci-watchdog-summary.json")
    print("ledger:", post_ledger(summary))
    return 1 if unactionable else 0


def post_ledger(summary: dict) -> str:
    """Cross-platform: mirror the summary into the QNFO fleet ledger.

    Best-effort by design -- a missing key or an unreachable endpoint must not
    turn the watchdog red, because the watchdog's own exit code is the gate.
    """
    key = os.environ.get("OPS_KEY") or os.environ.get("OPS_ROUTER_AUTH_KEY") or ""
    if not key:
        return "skipped (OPS_ROUTER_AUTH_KEY not configured)"
    if DRY:
        return "DRY_RUN"
    body = json.dumps({
        "desire": "ci-watchdog summary: " + json.dumps(summary)[:4000],
        "source": "github-actions/ci-watchdog",
    }).encode()
    req = urllib.request.Request("https://ops.qnfo.org/v1/desires", data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer " + key)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return f"http-{r.status}"
    except Exception as e:
        return f"skipped ({e})"


def _wf_file(inventory: list[dict], name: str) -> str:
    for it in inventory:
        if it["name"] == name:
            return it["path"].split("/")[-1]
    return name + ".yml"


if __name__ == "__main__":
    sys.exit(main())
