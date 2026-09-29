#!/usr/bin/env python3
"""workflow-lint.py -- WORKFLOW-YAML-LINT-1 (2026-09-29).

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

THE RULE THIS ENFORCES
  Every .github/workflows/*.yml on the ref MUST parse as YAML AND MUST declare a
  non-empty `jobs:` mapping. Exit 1 on any violation, naming file + line + reason.
  Fail closed: an unparseable workflow is a silent outage, not a warning.

Exit: 0 every workflow parses and declares jobs
      1 at least one workflow is invalid (fail closed)
      2 PyYAML unavailable (cannot lint; do not report green)
"""
from __future__ import annotations

import os
import sys

try:
    import yaml
except ImportError:  # pragma: no cover
    print("workflow-lint: PyYAML missing; pip install pyyaml", file=sys.stderr)
    sys.exit(2)

ROOT = os.environ.get("WF_ROOT", ".github/workflows")


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

        print(f"OK     {p} jobs={sorted(jobs)}")

    print()
    if bad:
        print(f"=== WORKFLOW-YAML-LINT-1 FAILED: {len(bad)} invalid workflow file(s) ===")
        for b in bad:
            print("  " + b)
        return 1

    print(f"=== WORKFLOW-YAML-LINT-1 PASSED: {len(files)} workflow file(s) valid ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
