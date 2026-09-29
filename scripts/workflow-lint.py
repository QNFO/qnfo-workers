#!/usr/bin/env python3
"""workflow-lint.py -- WORKFLOW-YAML-LINT-1 + ARTIFACT-STAGING-1 + FAILURE-ARTIFACT-LOSS-1.

WHY THIS EXISTS
  .github/workflows/deploy-qnfo-ops.yml was pushed on 2026-09-29 at 12:35:49Z with
  an unquoted colon inside a step NAME:

      - name: Verify live VERSION equals the artifact VERSION (retry: CF /content is eventually consistent)

  `(retry: ` is a colon followed by a space inside a plain YAML scalar. Both PyYAML
  and GitHub's own parser reject it -- "mapping values are not allowed here", line 105
  column 69. GitHub therefore created every subsequent deploy-qnfo-ops run with ZERO
  jobs and conclusion=failure, so the canonical deploy path for qnfo-ops was dead while
  the live worker silently stayed behind main.

  Nothing caught it. The run produced no job, so there was no job log, so the watchdog
  had no evidence to classify and could only file it as `unknown`. A workflow that
  cannot produce a job is not a workflow, and that is checkable statically.

RULES ENFORCED (fail closed; exit 1 on any violation)
  R1 WORKFLOW-YAML-LINT-1  every .github/workflows/*.yml MUST parse as YAML and MUST
                           declare a non-empty `jobs:` mapping. An unparseable workflow
                           is a silent outage, not a warning.
  R2 ARTIFACT-STAGING-1    any workflow that WRITES a ci-status/ status artifact MUST
                           have a commit-back step that STAGES it. ci-status/*.json is
                           the only outcome channel reachable without the GitHub Actions
                           API (that API is unreachable/rate-limited from the Cloudflare
                           egress IP), so an unstaged artifact is a lost audit trail.
                           Matching is continuation-aware: `git add a \\ b \\ c` is
                           joined before matching. The first version of the external
                           scan that produced this rule did NOT join continuations and
                           raised a false positive against two workflows -- hence the
                           explicit helper below.
  R3 FAILURE-ARTIFACT-LOSS-1
                           if every step that stages the artifact also early-exits when
                           job.status != success, then a FAILED run's artifact is
                           discarded -- precisely the run whose outcome most needs
                           reading (issue 1381). Fix by splitting commit-back: persist
                           the artifact unconditionally, keep the source commit-back
                           green-only so the repo never runs ahead of live.

Exit: 0 every workflow valid and artifact-safe
      1 at least one violation (fail closed)
      2 PyYAML unavailable (cannot lint; do not report green)
"""
from __future__ import annotations

import os
import re
import sys

try:
    import yaml
except ImportError:  # pragma: no cover
    print("workflow-lint: PyYAML missing; pip install pyyaml", file=sys.stderr)
    sys.exit(2)

ROOT = os.environ.get("WF_ROOT", ".github/workflows")

# `git add` that stages a ci-status path, or that stages everything (-A / --all / . / -u).
STAGES_CI_RE = re.compile(
    r"git add\b[^\n]*(?:ci-status|--all|\s-A(?:\s|$)|\s\.(?:\s|$)|-u(?:\s|$))"
)
WRITES_CI_RE = re.compile(r"ci-status/")
# Green-only guard: compares job.status to success and bails out.
GREEN_ONLY_RE = re.compile(r"job\.status[^\n]*!=[^\n]*success")
EXIT_RE = re.compile(r"\bexit\s+0\b")


def join_continuations(text: str) -> str:
    """Collapse backslash line-continuations so a multi-line `git add a \\ b \\ c`
    is a single logical line. Without this, path matching is wrong (see R2)."""
    return re.sub(r"\\[ \t]*\n[ \t]*", " ", text)


def run_blocks(doc: dict) -> list[str]:
    out: list[str] = []
    jobs = doc.get("jobs")
    if not isinstance(jobs, dict):
        return out
    for job in jobs.values():
        if not isinstance(job, dict):
            continue
        steps = job.get("steps")
        if not isinstance(steps, list):
            continue
        for step in steps:
            if isinstance(step, dict) and isinstance(step.get("run"), str):
                out.append(join_continuations(step["run"]))
    return out


def main() -> int:
    if not os.path.isdir(ROOT):
        print(f"workflow-lint: no {ROOT} directory; nothing to lint")
        return 0

    files = sorted(
        os.path.join(ROOT, f) for f in os.listdir(ROOT) if f.endswith((".yml", ".yaml"))
    )
    bad: list[str] = []

    for p in files:
        try:
            with open(p, encoding="utf-8") as fh:
                doc = yaml.safe_load(fh)
        except yaml.YAMLError as e:
            mark = getattr(e, "problem_mark", None)
            loc = f"line {mark.line + 1} column {mark.column + 1}" if mark else "unknown location"
            prob = getattr(e, "problem", None) or str(e).splitlines()[0]
            bad.append(f"{p}: YAML PARSE ERROR at {loc}: {prob}")
            print(f"BROKEN {p}: {prob} ({loc})")
            continue

        if not isinstance(doc, dict):
            bad.append(f"{p}: top level is not a mapping")
            print(f"BROKEN {p}: top level is not a mapping")
            continue

        jobs = doc.get("jobs")
        if not isinstance(jobs, dict) or not jobs:
            bad.append(
                f"{p}: no `jobs:` mapping -- GitHub would create a run with ZERO jobs "
                "and conclusion=failure"
            )
            print(f"BROKEN {p}: no jobs")
            continue

        blocks = run_blocks(doc)
        writes_ci = any(WRITES_CI_RE.search(b) for b in blocks)
        staging = [b for b in blocks if STAGES_CI_RE.search(b)]

        notes: list[str] = []

        if writes_ci and not staging:
            bad.append(
                f"{p}: ARTIFACT-STAGING-1 -- writes a ci-status/ status artifact but no "
                "step stages it (add `git add ci-status/<name>.json` to commit-back)"
            )
            print(f"BROKEN {p}: writes ci-status but never stages it")
            continue

        if writes_ci and staging:
            guarded = [b for b in staging if GREEN_ONLY_RE.search(b) and EXIT_RE.search(b)]
            if len(guarded) == len(staging):
                bad.append(
                    f"{p}: FAILURE-ARTIFACT-LOSS-1 -- every step that stages ci-status also "
                    "early-exits when job.status != success, so a FAILED run's artifact is "
                    "never persisted (split commit-back: artifact always, source green-only)"
                )
                print(f"BROKEN {p}: failure-run artifact would be discarded")
                continue
            notes.append("ci-status staged")

        print(f"OK     {p} jobs={sorted(jobs)}" + (f" [{'; '.join(notes)}]" if notes else ""))

    print()
    if bad:
        print(f"=== WORKFLOW-LINT FAILED: {len(bad)} invalid workflow file(s) ===")
        for b in bad:
            print("  " + b)
        return 1

    print(f"=== WORKFLOW-LINT PASSED: {len(files)} workflow file(s) valid ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
