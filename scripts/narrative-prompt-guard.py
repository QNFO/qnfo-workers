#!/usr/bin/env python3
"""NARRATIVE-PROMPT-GUARD-1

A free-form NARRATIVE system prompt must guide PROCESS, not prescribe specific output
TEXT. This guard fails CI if a narrative-generation worker source re-acquires the
output-text prescriptions that were stripped from qnfo-ai on 2026-09-26 (v5.28.6):

  - "name the owning program/WBS thread"      (was RESPONSE DEPTH PROTOCOL item 2)
  - "with a fit table"
  - "primary home / adjacent / restatement"
  - "each with its falsification condition"   (was item 4)
  - "definition commitments with intended meaning"  (was item 3)

Scope: narrative-generation worker sources ONLY. Operations/infrastructure prompts
(qnfo-ops OPS_SYSTEM_PROMPT / CODE_ONLY_SYSTEM_PROMPT) are EXEMPT - their specific
nouns (tool/table/worker/guard names) are legitimate process references, not output
text. Extend TARGETS as new narrative surfaces are identified (sweep 2026-09-26 found
no other repo worker carrying these prescriptions).
"""
import os
import sys

BANNED = [
    "name the owning program/WBS thread",
    "with a fit table",
    "primary home / adjacent / restatement",
    "each with its falsification condition",
    "definition commitments with intended meaning",
]

TARGETS = [
    "qnfo-ai/worker.js",
    "qnfo-ai/deployed-current.worker.js",
]


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    violations = []
    scanned = 0
    for t in TARGETS:
        path = os.path.join(root, t)
        if not os.path.isfile(path):
            continue
        scanned += 1
        with open(path, encoding="utf-8", errors="replace") as fh:
            src = fh.read()
        for bad in BANNED:
            if bad in src:
                violations.append((t, bad))
    if violations:
        print("NARRATIVE-PROMPT-GUARD-1 FAIL: output-text prescription found in a narrative prompt")
        for t, bad in violations:
            print(f"  {t}: {bad!r}")
        return 1
    print(f"NARRATIVE-PROMPT-GUARD-1 PASS: {scanned} narrative source(s) clean of output-text prescriptions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
