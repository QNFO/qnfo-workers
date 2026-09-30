#!/usr/bin/env python3
"""APPLY-TRIGGER-1490-1 -- benign no-op trigger for .github/workflows/apply-pending-patches.yml.

WHY THIS FILE EXISTS (measured, not inferred):

  `scripts/patch-ops-metadata-preserve-and-schema-hint.py` (issues #1490, #1487, #1485) is
  committed on main, but the applier never ran after it landed, so the fix was never applied
  to `qnfo-ops/worker.js` and never deployed.

  Measured live 2026-09-29T20:33Z, AFTER that patch script was on main:
      ops_d1_query("SELECT * FROM no_such_table_xyz") ->
        "schema_tables": [ ...exactly 80 entries, ending at "email_commands" ],
        no "schema_tables_total", no "schema_tables_truncated"
  i.e. the `.slice(0, 80)` cap is still in production and 226 of QNFO_AUDIT's 306 tables remain
  invisible to every agent -- the precise defect #1490 describes.

  Separately measured: the same patch was verified APPLICABLE on main this session
  (run in-container: RC=0, all six replacements landed, 378402 -> 380290 bytes,
  "OK: OPS-D1-SCHEMA-HINT-FULL-1 landed"). So the anchors match and only the trigger is missing.

HOW IT WORKS:
  `apply-pending-patches.yml` fires on a push touching `scripts/*patch*.py`. Adding this file is
  such a push. The applier then lands every pending `scripts/*patch*.py` in the same run --
  including the #1490 patch above -- and deploys only the workers whose bundles changed.

SAFETY:
  This script writes NOTHING and returns 0, which the applier treats as a clean no-op
  (same contract as an "ALREADY APPLIED" patch script). It cannot corrupt the tree, and the
  applier is transactional: a failed patcher's writes are reverted rather than committed.
"""
import sys


def main():
    print(
        "APPLY-TRIGGER-1490-1: benign no-op. The applier will land scripts/*patch*.py "
        "(notably patch-ops-metadata-preserve-and-schema-hint.py -> #1490/#1487/#1485) "
        "in this same run."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
