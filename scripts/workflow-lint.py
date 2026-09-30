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


# BRANCH-FILTER-1 (warn-only): a workflow whose `push` trigger is not restricted to `main` but
# whose steps deploy to production or push to main runs those steps for a push to ANY branch
# that touches its trigger paths. Measured 2026-09-30: 36 of 95 push-triggered workflows, and
# run 36728140486 deployed qnfo-ops from a PR branch that had merely been updated from main.
# Not blocking yet: each affected workflow lists its own file in its trigger paths, so editing
# it re-fires it on main; fixing all 36 in one merge would launch ~35 applier runs at once.
DEPLOYS_RE = re.compile(
    r"raw_put\.py|wrangler(?:@\d+)? deploy|canonical_deploy\.py|git push origin HEAD:main"
    r"|api\.cloudflare\.com/client/v4/accounts/\S*/workers/scripts/\S*(?:content|schedules)"
)


# UNVALIDATED-BUNDLE-COMMIT-1 (warn-only): a workflow that commits worker source to main but never
# runs a syntax / import validity check first. Commits pushed by a workflow with the default
# GITHUB_TOKEN do not trigger other workflows (GitHub's documented behaviour), so the push-time
# guards (version-bump-guard, cf-import-guard) never see them: the workflow itself must validate
# before it commits. Measured 2026-09-30: fix-pilot-container-class.yml committed a bundle that
# Cloudflare rejects (error 10021) and nothing in CI saw it; 8 of 29 such workflows had no check.
COMMITS_SRC_RE = re.compile(
    r"git add[^\n]*(?:worker\.js|deployed-current\.worker\.js|qnfo-[a-z-]+/)|git add -A(?![^\n]*ci-status)"
)
PUSHES_MAIN_RE = re.compile(r"git push[^\n]*(?:HEAD:main|origin main)")
VALIDATES_RE = re.compile(
    r"node --check|node -c|esbuild|wrangler[^\n]*--dry-run|cf-import-guard|d1guard-battery"
)


def unvalidated_bundle_committers(files: list[str]) -> list[str]:
    out: list[str] = []
    for p in files:
        try:
            with open(p, encoding="utf-8") as fh:
                doc = yaml.safe_load(fh)
            runs = " ".join(
                (s.get("run") or "")
                for j in (doc.get("jobs") or {}).values()
                for s in (j.get("steps") or [])
            )
            runs = join_continuations(runs)
            if COMMITS_SRC_RE.search(runs) and PUSHES_MAIN_RE.search(runs) and not VALIDATES_RE.search(runs):
                out.append(os.path.basename(p))
        except Exception:  # warn-only pass: never let it break the lint
            continue
    return out


def unfiltered_deployers(files: list[str]) -> list[str]:
    """Workflows with a push trigger not restricted to main whose run steps deploy or push to main."""
    out: list[str] = []
    for p in files:
        try:
            with open(p, encoding="utf-8") as fh:
                doc = yaml.safe_load(fh)
            on = doc.get(True, doc.get("on")) if isinstance(doc, dict) else None
            if isinstance(on, str):
                on = {on: None}
            elif isinstance(on, list):
                on = {k: None for k in on}
            if not isinstance(on, dict) or "push" not in on:
                continue
            branches = (on["push"] or {}).get("branches")
            if branches and set(branches) <= {"main"}:
                continue
            runs = " ".join(
                (s.get("run") or "")
                for j in (doc.get("jobs") or {}).values()
                for s in (j.get("steps") or [])
            )
            if DEPLOYS_RE.search(join_continuations(runs)):
                out.append(os.path.basename(p))
        except Exception:  # warn-only pass: never let it break the lint
            continue
    return out


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
    risky = unfiltered_deployers(files)
    if risky:
        print(f"WARN BRANCH-FILTER-1: {len(risky)} workflow(s) deploy or push to main but their push trigger "
              "is not restricted to `main` (a push to any branch touching their paths runs them):")
        for name in risky:
            print(f"  WARN {name}")
        print()
    unval = unvalidated_bundle_committers(files)
    if unval:
        print(f"WARN UNVALIDATED-BUNDLE-COMMIT-1: {len(unval)} workflow(s) commit worker source to main without a "
              "syntax/import check (pushes made with the default GITHUB_TOKEN do not trigger the guard workflows, "
              "so validate before committing):")
        for name in unval:
            print(f"  WARN {name}")
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
