#!/usr/bin/env python3
"""ci_watchdog_resolve.py - close-on-green for ci-watchdog findings.

WHY THIS EXISTS
  scripts/ci_watchdog.py is DETECT-AND-FILE only: `file_or_refresh()` opens one
  deduped issue per (class, subject) and nothing ever closes it. A finding
  therefore outlives its own fix. Observed: issue #36 ([ci-watchdog] build-gate:
  deploy-gate) stayed open after the repair commit 0c028255 produced a GREEN
  deploy-gate run (36351631444). A gate that can only go red is not a gate.

WHY IT IS NOT "close anything the watchdog did not report this run"
  The watchdog's failure window is only 6h (CI_WD_WINDOW_HOURS). Absence from
  that window proves nothing - an old failure simply ages out, so an
  absence-based close would silently bury a still-broken workflow. A close here
  requires POSITIVE evidence: a SUCCESSFUL run of the SAME workflow created
  strictly AFTER the failing run recorded in the issue body. No green run, no
  close. Every other outcome leaves the issue open (fail-closed).

SUBJECT-SHAPE-1 (2026-09-30)
  The reaper matched `subject` against the Actions API's workflow `name` only.
  For `invalid-workflow` findings the watchdog records the FILE PATH as the
  subject, while a valid workflow is registered under its bare name, so those
  findings could not be closed by any amount of green CI. Measured on
  QNFO/qnfo-workers: 8 open findings (#43, #44, #45, #46, #47, #68, #69, #70)
  sat in exactly that state. `_subject_candidates()` now accepts both shapes.
  The change is inert for subjects that are already bare names.

Exit: always 0 - this is a reaper, not a gate. Its failures must never turn CI
      red, or the reaper becomes a finding of the thing it reaps.

Env: GH_TOKEN/GITHUB_TOKEN (issues:write, actions:read, contents:read)
     REPO (default QNFO/qnfo-workers)  DRY_RUN=1 to suppress writes
"""
from __future__ import annotations

import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.request

REPO = os.environ.get("REPO", "QNFO/qnfo-workers")
TOKEN = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
DRY = os.environ.get("DRY_RUN") == "1"
API = "https://api.github.com"
LABEL = "ci-watchdog"
PREFIX = "[ci-watchdog]"
# RATE-LIMIT-AWARE-1: GITHUB_TOKEN gives a repo ~1000 API calls/hour, shared by every workflow and by
# CodeQL's SARIF upload. This reaper runs on every push to main, so it must not burn the budget blind.
MIN_BUDGET = 25          # below this many remaining core calls a pass is not worth starting
RATE_LIMITED = False     # set by gh() when GitHub answers 403/429 with a rate-limit signal


def _looks_rate_limited(e) -> bool:
    """True if an HTTPError is GitHub saying "you are out of budget" rather than "forbidden"."""
    try:
        h = e.headers
        if h is not None and (h.get("x-ratelimit-remaining") == "0" or h.get("retry-after")):
            return True
        return "rate limit" in e.read().decode("utf-8", "replace").lower()
    except Exception:  # noqa: BLE001
        return False


def gh(path: str, method: str = "GET", body: dict | None = None):
    global RATE_LIMITED
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "qnfo-ci-watchdog-resolve")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode() or "null"
            return r.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        if e.code in (403, 429) and _looks_rate_limited(e):
            RATE_LIMITED = True
        return e.code, None
    except Exception as e:  # noqa: BLE001
        print(f"  ! request failed {path}: {e}", file=sys.stderr)
        return 0, None


def rate_limit_core():
    """(remaining, limit, reset_epoch) for the core budget, or None if it cannot be read.

    GET /rate_limit does not itself count against the limit, so it is safe to call when nearly out.
    """
    st, d = gh("/rate_limit")
    if st != 200 or not isinstance(d, dict):
        return None
    c = (d.get("resources") or {}).get("core") or d.get("rate") or {}
    return c.get("remaining"), c.get("limit"), c.get("reset")


def _utc(epoch) -> str:
    try:
        return datetime.datetime.fromtimestamp(int(epoch), datetime.timezone.utc).strftime("%H:%M:%SZ")
    except Exception:  # noqa: BLE001
        return "?"


def _subject_candidates(subject: str) -> list[str]:
    """Every workflow-name shape `subject` could refer to.

    SUBJECT-SHAPE-1: `invalid-workflow` findings carry a FILE PATH as their
    subject ('.github/workflows/x.yml') while the Actions API reports a
    workflow's `name` ('x'). Matching the raw subject finds no workflow for
    that shape, so the finding is unclosable no matter how green CI gets.
    Both shapes are therefore accepted. Order matters: the raw subject is
    tried first, so subjects that are already bare names behave exactly as
    before (no regression).
    """
    cands = [subject]
    base = subject.rsplit("/", 1)[-1]
    for suf in (".yml", ".yaml"):
        if base.endswith(suf):
            base = base[: -len(suf)]
            break
    if base and base != subject:
        cands.append(base)
    return cands


def list_workflows() -> list[dict]:
    """Every workflow the Actions API knows, INCLUDING state=deleted ones.

    RETIRED-WORKFLOW-1: this used to read only page 1 (per_page=100). The repo has ~96
    active workflows, and retired ones stay listed as state=deleted, so a single page
    silently truncates as soon as the total passes 100 and a workflow past the cut is
    reported as "no such workflow". Read up to 5 pages (500 entries) instead.
    """
    out: list[dict] = []
    for page in range(1, 6):
        st, d = gh(f"/repos/{REPO}/actions/workflows?per_page=100&page={page}")
        if st != 200 or not d:
            break
        batch = d.get("workflows", [])
        out.extend(batch)
        if len(batch) < 100:
            break
    return out


def _wf_keys(w: dict) -> set[str]:
    """Names a workflow can be referred to by: its `name` and the stem of its file path."""
    keys = {w.get("name") or ""}
    p = (w.get("path") or "").rsplit("/", 1)[-1]
    for suf in (".yml", ".yaml"):
        if p.endswith(suf):
            p = p[: -len(suf)]
            break
    keys.add(p)
    keys.discard("")
    return keys


def retired_workflow(subject: str, workflows: list[dict] | None = None):
    """The state=deleted workflow `subject` refers to, or None.

    RETIRED-WORKFLOW-1: a finding about a workflow that has since been deleted can never
    be closed by the green-run rule (no run will ever come), so it re-alerts forever.
    The deletion is itself positive evidence that the failing thing no longer exists.
    Fail-closed on every ambiguity: a workflow with the same name or file stem that is
    still ACTIVE (a rename, or a deleted-then-restored file) means it is NOT retired.
    """
    cands = set(_subject_candidates(subject))
    ws = workflows if workflows is not None else list_workflows()
    match = [w for w in ws if cands & _wf_keys(w)]
    if not match:
        return None
    if any(w.get("state") != "deleted" for w in match):
        return None
    return sorted(match, key=lambda w: w.get("updated_at") or "")[-1]


def retired_by_id(workflow_id, workflows: list[dict]):
    """Deleted workflow looked up by the id its failing run carries, or None.

    RETIRED-WORKFLOW-1: `GET /actions/workflows/{id}` keeps returning a deleted workflow with
    state=deleted and its name/path intact (verified 2026-09-30 on a workflow deleted minutes
    earlier), so this does not depend on the list endpoint still including deleted entries.
    Same fail-closed rule as retired_workflow(): an ACTIVE workflow sharing its name or file
    stem (a rename, or a restore) means it is not retired.
    """
    if not workflow_id:
        return None
    st, w = gh(f"/repos/{REPO}/actions/workflows/{workflow_id}")
    if st != 200 or not w or w.get("state") != "deleted":
        return None
    keys = _wf_keys(w)
    if any(x.get("state") != "deleted" and keys & _wf_keys(x) for x in workflows):
        return None
    return w


def latest_green(subject: str, since_iso: str | None, workflows: list[dict] | None = None):
    """Newest successful run of workflow `subject` created strictly after since_iso."""
    cands = _subject_candidates(subject)
    wf_id = None
    for w in (workflows if workflows is not None else list_workflows()):
        if w.get("name") in cands:
            wf_id = w["id"]
            break
    if wf_id:
        st, d = gh(f"/repos/{REPO}/actions/workflows/{wf_id}/runs?per_page=50")
        rs = (d.get("workflow_runs", []) if st == 200 and d else [])
    else:
        st, d = gh(f"/repos/{REPO}/actions/runs?per_page=100")
        rs = [r for r in (d.get("workflow_runs", []) if st == 200 and d else [])
              if (r.get("name") or "") in cands]
    for r in rs:  # newest first
        if r.get("conclusion") != "success":
            continue
        if since_iso and (r.get("created_at") or "") <= since_iso:
            continue
        return r
    return None


def main() -> int:
    if not TOKEN and not DRY:
        print("ci-watchdog-resolve: no token; refusing to run non-dry", file=sys.stderr)
        return 0
    rl = rate_limit_core()
    if rl is not None:
        rem, lim, reset = rl
        print(f"ci-watchdog-resolve: core rate limit {rem}/{lim} remaining, resets {_utc(reset)}")
        if isinstance(rem, int) and rem < MIN_BUDGET:
            print(f"ci-watchdog-resolve: only {rem} calls left (< {MIN_BUDGET}); skipping this pass rather than "
                  f"starving CodeQL and other jobs or misreporting API errors. Nothing is closed (fail-closed).")
            return 0
    st, items = gh(f"/repos/{REPO}/issues?state=open&labels={LABEL}&per_page=100")
    if st != 200 or not isinstance(items, list):
        print(f"ci-watchdog-resolve: cannot list issues (http-{st})")
        return 0
    print(f"ci-watchdog-resolve: repo={REPO} open[{LABEL}]={len(items)} dry={DRY}")
    closed = kept = 0
    all_wfs = list_workflows()
    run_cache: dict = {}
    for it in items:
        if RATE_LIMITED:
            print("ci-watchdog-resolve: GitHub rate limit hit mid-pass; stopping. Remaining findings are untouched.")
            break
        if it.get("pull_request"):
            continue
        title = it.get("title") or ""
        if not title.startswith(PREFIX):
            continue
        rest = title[len(PREFIX):].strip()
        if ":" not in rest:
            print(f"  - #{it.get('number')} unparseable title; left open")
            kept += 1
            continue
        klass, subj = [x.strip() for x in rest.split(":", 1)]
        num = it.get("number")
        m = re.search(r"run=(\d+)", it.get("body") or "")
        fail_run, fail_created, fail_wf_id, why = (m.group(1) if m else None), None, None, None
        if not fail_run:
            why = "no run id in the issue body"
        else:
            if fail_run not in run_cache:
                run_cache[fail_run] = gh(f"/repos/{REPO}/actions/runs/{fail_run}")
            stx, rx = run_cache[fail_run]
            if stx == 200 and rx and rx.get("created_at"):
                fail_created = rx.get("created_at")
                fail_wf_id = rx.get("workflow_id")
            else:
                why = f"cannot read failing run {fail_run} (http-{stx})"
        # FAIL-CLOSED-NO-BASELINE-1: the green-run rule means "strictly NEWER than the failure". With no
        # failure timestamp there is nothing to be newer than, and latest_green(subj, None) would accept ANY
        # success, including one older than the failure (reproduced: a 2020 run closed two findings). So the
        # green-run rule only runs when the failure time is known; a retired workflow needs no timestamp.
        g = latest_green(subj, fail_created, all_wfs) if fail_created else None
        if not g:
            rw = retired_by_id(fail_wf_id, all_wfs) or retired_workflow(subj, all_wfs)
            if rw:
                comment = (
                    f"Auto-closed by `scripts/ci_watchdog_resolve.py` (workflow retired).\n\n"
                    f"**{klass} / {subj}** can no longer fail: the workflow "
                    f"[`{rw.get('path')}`]({rw.get('html_url')}) has been deleted from the repository "
                    f"(Actions state `deleted`, last updated {rw.get('updated_at')}), and no active "
                    f"workflow carries the same name.\n\n"
                    f"- failing run: `{fail_run}` created {fail_created}\n"
                    f"- rule: a deleted workflow with no active namesake. The deletion went through "
                    f"review and git history keeps the file, so this is reversible; if the workflow "
                    f"is restored and fails again the watchdog will open a new finding.\n"
                )
                if DRY:
                    print(f"  - #{num} {klass}/{subj}: WOULD CLOSE (workflow retired: {rw.get('path')})")
                    closed += 1
                    continue
                cst, _ = gh(f"/repos/{REPO}/issues/{num}/comments", "POST", {"body": comment})
                pst, _ = gh(f"/repos/{REPO}/issues/{num}", "PATCH",
                            {"state": "closed", "state_reason": "not_planned"})
                ok = pst in (200, 201)
                print(f"  - #{num} {klass}/{subj}: {'CLOSED (retired)' if ok else f'FAILED http-{pst}'} "
                      f"(comment http-{cst}, workflow {rw.get('path')})")
                closed += 1 if ok else 0
                kept += 0 if ok else 1
                continue
            if why:
                print(f"  - #{num} {klass}/{subj}: {why}; left open (fail-closed, no baseline to compare against)")
            else:
                print(f"  - #{num} {klass}/{subj}: NO green run after the failure "
                      f"(fail_run={fail_run} at {fail_created}, "
                      f"names={_subject_candidates(subj)}); left open")
            kept += 1
            continue
        comment = (
            f"Auto-closed by `scripts/ci_watchdog_resolve.py` (close-on-green).\n\n"
            f"**{klass} / {subj}** is cleared.\n\n"
            f"- failing run: `{fail_run}` created {fail_created}\n"
            f"- green run: [`{g['id']}`]({g.get('html_url')}) conclusion=success "
            f"created {g.get('created_at')} branch=`{g.get('head_branch')}` "
            f"sha=`{(g.get('head_sha') or '')[:8]}`\n"
            f"- rule: a SUCCESSFUL run of the SAME workflow, strictly newer than the "
            f"failure. Absence from the watchdog's 6h window alone never closes an "
            f"issue, because an aged-out failure is not a fixed failure.\n"
        )
        if DRY:
            print(f"  - #{num} {klass}/{subj}: WOULD CLOSE (green {g['id']} "
                  f"{g.get('created_at')} > fail {fail_created})")
            closed += 1
            continue
        cst, _ = gh(f"/repos/{REPO}/issues/{num}/comments", "POST", {"body": comment})
        pst, _ = gh(f"/repos/{REPO}/issues/{num}", "PATCH",
                    {"state": "closed", "state_reason": "completed"})
        ok = pst in (200, 201)
        print(f"  - #{num} {klass}/{subj}: {'CLOSED' if ok else f'FAILED http-{pst}'} "
              f"(comment http-{cst}, green {g['id']})")
        closed += 1 if ok else 0
        kept += 0 if ok else 1
    print(f"ci-watchdog-resolve: closed={closed} kept={kept}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
