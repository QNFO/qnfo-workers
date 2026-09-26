#!/usr/bin/env python3
"""NARRATIVE-PROMPT-GUARD-1 (broadened 2026-09-26)

A free-form NARRATIVE system prompt must guide PROCESS, not prescribe specific output
TEXT. This guard fails CI if any narrative-generation worker source re-acquires an
output-text prescription from the family stripped from qnfo-ai (v5.28.6/5.28.7).

SCOPE: this guard polices the INSTRUCTION (the deployed source), NOT the model's OUTPUT.
Grounded citations a model draws from retrieved corpus/registry context (e.g. a real WBS
code returned by the RAG layer) are NOT a guard concern - only the prompt text is.

TARGETS are AUTO-DISCOVERED: every <dir>/worker.js and <dir>/deployed-current.worker.js,
minus EXEMPT_DIRS (operations/infrastructure prompts legitimately carry tool/table/worker
nouns - process references, not output text; PERSONAL-QNFO separation keeps personal-life
out of the QNFO narrative scope).

PATTERNS are regex (case-insensitive) covering the known prescriptions AND common
re-wordings (e.g. "append a program table instead").
"""
import os
import re
import sys

PATTERNS = [
    ("name the owning program/WBS thread", r"name the owning\s+(program|wbs)"),
    ("fit table", r"fit[-\s]?table"),
    ("program placement", r"program[-\s]?placement"),
    ("primary home", r"primary\s+home"),
    ("falsification condition", r"falsification\s+condition"),
    ("definition commitments", r"definition\s+commitments"),
    ("adjacent / restatement", r"adjacent\s*/\s*restatement"),
    ("place the answer in the program", r"place the answer in the program"),
    ("emit/append a program|placement|fit table",
     r"(append|add|emit|include|produce|output|use|build)\s+(a\s+|the\s+)?(program|placement|fit)[-\s]?table"),
]

EXEMPT_DIRS = {"qnfo-ops", "personal-life-workers"}
CANDIDATE_FILES = ("worker.js", "deployed-current.worker.js")


def discover(root):
    targets = []
    for d in sorted(os.listdir(root)):
        if d in EXEMPT_DIRS:
            continue
        dd = os.path.join(root, d)
        if not os.path.isdir(dd):
            continue
        for fn in CANDIDATE_FILES:
            p = os.path.join(dd, fn)
            if os.path.isfile(p):
                targets.append(os.path.join(d, fn))
    return targets


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    targets = discover(root)
    violations = []
    for t in targets:
        with open(os.path.join(root, t), encoding="utf-8", errors="replace") as fh:
            src = fh.read()
        for label, pat in PATTERNS:
            if re.search(pat, src, re.IGNORECASE):
                violations.append((t, label))
    if violations:
        print("NARRATIVE-PROMPT-GUARD-1 FAIL: output-text prescription found in a narrative prompt")
        for t, label in violations:
            print(f"  {t}: {label}")
        return 1
    print(f"NARRATIVE-PROMPT-GUARD-1 PASS: {len(targets)} narrative source(s) clean of output-text prescriptions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
