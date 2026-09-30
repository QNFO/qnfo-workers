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


def gh(path: str, method: str = "GET", body: dict | None = None):
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
        return e.code, None
    except Exception as e:  # noqa: BLE001
        print(f"  ! request failed {path}: {e}", file=sys.stderr)
        return 0, None


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


def latest_green(subject: str, since_iso: str | None):
    """Newest successful run of workflow `subject` created strictly after since_iso."""
    cands = _subject_candidates(subject)
    st, d = gh(f"/repos/{REPO}/actions/workflows?per_page=100")
    wf_id = None
    if st == 200 and d:
        for w in d.get("workflows", []):
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
    st, items = gh(f"/repos/{REPO}/issues?state=open&labels={LABEL}&per_page=100")
    if st != 200 or not isinstance(items, list):
        print(f"ci-watchdog-resolve: cannot list issues (http-{st})")
        return 0
    print(f"ci-watchdog-resolve: repo={REPO} open[{LABEL}]={len(items)} dry={DRY}")
    closed = kept = 0
    for it in items:
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
        fail_run, fail_created = (m.group(1) if m else None), None
        if fail_run:
            stx, rx = gh(f"/repos/{REPO}/actions/runs/{fail_run}")
            if stx == 200 and rx:
                fail_created = rx.get("created_at")
        g = latest_green(subj, fail_created)
        if not g:
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
