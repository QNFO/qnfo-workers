#!/usr/bin/env python3
"""NARRATIVE-PROMPT-GUARD-1 (broadened 2026-09-26)

A free-form NARRATIVE system prompt must guide PROCESS, not prescribe specific output
TEXT. This guard fails CI if any narrative-generation worker source re-acquires an
output-text prescription from the family stripped from qnfo-ai (v5.28.6+).

SCOPE / CATEGORY RULE:
  - This guard polices the INSTRUCTION (the deployed source), NOT the model's OUTPUT.
    Grounded citations drawn from retrieved corpus/registry context (a real WBS code
    returned by the RAG layer) are NOT a guard concern.
  - It targets free-form narrative prompts. A STRUCTURED-DELIVERABLE template (e.g.
    qnfo-research-exec WRITER_PROMPT) legitimately specifies required section headings
    and lengths because DOWNSTREAM parsers depend on them (qnfo-paper-reviser parses
    '## References'/'## Abstract'); such structural specs are NOT the anti-pattern and
    are intentionally not matched here.

TARGETS auto-discovered: every <dir>/worker.js and <dir>/deployed-current.worker.js,
minus EXEMPT_DIRS (ops/personal prompts legitimately carry tool/table/worker nouns).

Two-sided: (a) BANNED patterns fail on a re-introduced output-text prescription;
(b) REQUIRED anchors fail if a narrative prompt's PROCESS items are dropped wholesale.
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
    # SOURCE-VOICE-1 (2026-10-13, agent_issues 2468; owner: "Papers shall cite full texts, not merely reference work
    # summaries" and "highly inappropriate for a research paper to say so explicitly"): a prompt must never tell a writer to
    # report to its readers that a source was thin, empty or summarised. 78 of 147 pipeline papers did, because the
    # qnfo-research-exec writer prompt said "say in one sentence that the summary supplied gives no further detail".
    ("disclose a thin source entry",
     r"(?:where|when|if)\s+(?:an?\s+|the\s+)?(?:bibliography\s+)?entry(?:'s\s+summary)?\s+is\s+(?:thin|empty|missing)[^\"\n]{0,30}(?:say|state|note)"),
    ("say the summary gives no detail",
     r"say\s+(?:in\s+one\s+sentence\s+)?that\s+the\s+(?:summary|abstract|entry)\s+(?:supplied\s+)?(?:gives|supplies|provides|is)\s+(?:no|thin|empty)"),
    ("relate a work only through its summary or title", r"relate\s+the\s+work\s+to\s+your\s+argument\s+only\s+through"),
    ("disclose where the supplied summary is thin", r"state\s+plainly\s+where\s+the\s+supplied\s+(?:summary|abstract)"),
]

# Positive anchors: the flagship narrative prompt must retain its PROCESS items, so a
# wholesale revert/replacement is caught even if no banned phrase is reintroduced.
REQUIRED = {
    "qnfo-ai/worker.js": [
        ("ground in the corpus first", r"ground in the corpus first"),
        ("place the answer in context", r"place the answer in context"),
        ("make it falsifiable", r"make it falsifiable"),
    ],
}

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
                violations.append((t, "banned: " + label))
    for t, anchors in REQUIRED.items():
        path = os.path.join(root, t)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8", errors="replace") as fh:
            src = fh.read()
        for label, pat in anchors:
            if not re.search(pat, src, re.IGNORECASE):
                violations.append((t, "missing process anchor: " + label))
    if violations:
        print("NARRATIVE-PROMPT-GUARD-1 FAIL")
        for t, label in violations:
            print(f"  {t}: {label}")
        return 1
    print(f"NARRATIVE-PROMPT-GUARD-1 PASS: {len(targets)} narrative source(s) clean + {len(REQUIRED)} anchor set(s) present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
