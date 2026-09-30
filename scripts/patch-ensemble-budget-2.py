#!/usr/bin/env python3
"""patch-ensemble-budget-2.py -- ENSEMBLE-BUDGET-2 + GW-CANNED-DETECT-1 (2026-09-29)

DEFECT A -- qnfo-ai runEnsemble() budget starvation.
  Every stage was given Math.min(<stageCap>, _remaining()) inside ONE 45e3 deadline, with the
  primary stage capped at 4e4. A primary that runs long consumes ~40s of the 45s budget, after
  which _remaining() ~= 0 and each fallback stage is handed a 0 ms timeout that rejects
  immediately. primaryText stays "" and the handler returns FALLBACK_TEXT.
  MEASURED (QNFO_AUDIT.ai_queries, model='ensemble'):
    2026-09-29  n=24  canned=24  max completion_tokens=112   avg latency 50034 ms
    2026-09-26  n=6   canned=0   max completion_tokens=2488  avg latency 71296 ms
    2026-09-22  n=3   canned=0   max completion_tokens=345   avg latency  9535 ms

DEFECT B -- qnfo-research-exec gwCall() accepted the canned text.
  FALLBACK_TEXT is returned with HTTP 200 and non-empty content, so gwCall returned it as a real
  answer. stageReconcile() and stageRevise() require >= 10000 chars, saw ~370, and terminalised
  every row (the RESEARCH-TERMINAL cluster plus 'revise: output too short').

FIX A: stage-share caps (primary 50%, deepseek fallback 30%, Workers-AI retry 15%) with floors,
       still bounded by the same 45e3 deadline.
FIX B: gwCall detects the canned signature and degrades to the Workers AI path instead.

Idempotent (marker-guarded) and fail-closed (missing anchor => non-zero exit, no write).
Markers: ENSEMBLE-BUDGET-2, GW-CANNED-DETECT-1
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARK_A = "ENSEMBLE-BUDGET-2"
MARK_B = "GW-CANNED-DETECT-1"

A_FILES = ["qnfo-ai/worker.js", "qnfo-ai/deployed-current.worker.js"]
B_FILES = ["qnfo-research-exec/worker.js", "qnfo-research-exec/deployed-current.worker.js"]

A_ANCHOR = "const ENSEMBLE_BUDGET_MS = 45e3;"

A_INSERT = (
    A_ANCHOR + "\n"
    "  // ENSEMBLE-BUDGET-2 (2026-09-29): stage-share caps. Previously every stage took\n"
    "  // Math.min(<cap>, _remaining()) with the primary capped at 4e4 inside a 45e3 budget, so a\n"
    "  // slow primary left ~0 ms for each fallback and the ensemble was guaranteed to return\n"
    "  // FALLBACK_TEXT (measured 24/24 canned on 2026-09-29, avg latency 50034 ms). Each stage now\n"
    "  // keeps a real slice of the same deadline instead of racing the whole budget.\n"
    "  const _stageCap = (share, floorMs) => Math.max(floorMs, Math.min(Math.floor(ENSEMBLE_BUDGET_MS * share), _remaining()));"
)

A_SUBS = [
    ('Math.min(4e4, _remaining()), "ensemble-primary")',
     '_stageCap(0.5, 8e3), "ensemble-primary")'),
    ('Math.min(4e4, _remaining()), "ensemble-fallback")',
     '_stageCap(0.3, 6e3), "ensemble-fallback")'),
    ('Math.min(25e3, _remaining()), "ensemble-primary-retry")',
     '_stageCap(0.15, 5e3), "ensemble-primary-retry")'),
]

B_ANCHOR = (
    '    const c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;\n'
    '    if (typeof c === "string" && c) return c;\n'
    '    await logEvent(env, "gw-fallback", "gateway empty content; falling back to Workers AI", "warn");'
)

B_REPL = (
    '    const c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;\n'
    '    // GW-CANNED-DETECT-1 (2026-09-29): the gateway answers HTTP 200 with a ~370-char canned\n'
    '    // FALLBACK_TEXT when its ensemble budget is exhausted. gwCall used to return that as a real\n'
    '    // answer, so stageReconcile/stageRevise (>= 10000 chars) terminalised every row. Detect the\n'
    '    // canned signature and degrade to the Workers AI path instead of feeding it downstream.\n'
    '    const _canned = typeof c === "string" && /I do not have a reliable answer for that right now|ensemble mode \\(model=ensemble\\) cross-checks answers across models/i.test(c);\n'
    '    if (typeof c === "string" && c && !_canned) return c;\n'
    '    await logEvent(env, _canned ? "gw-canned" : "gw-fallback", _canned ? "gateway returned canned FALLBACK_TEXT (len=" + String(c).trim().length + "); falling back to Workers AI" : "gateway empty content; falling back to Workers AI", "warn");'
)


def read(path):
    with open(os.path.join(ROOT, path), "r", encoding="utf-8") as fh:
        return fh.read()


def write(path, text):
    with open(os.path.join(ROOT, path), "w", encoding="utf-8") as fh:
        fh.write(text)


def patch_a(src):
    if MARK_A in src:
        return src, "already-applied"
    if A_ANCHOR not in src:
        raise SystemExit("FAIL: anchor missing: " + A_ANCHOR)
    for old, new in A_SUBS:
        n = src.count(old)
        if n != 1:
            raise SystemExit("FAIL: expected exactly 1 occurrence of %r, found %d" % (old, n))
        src = src.replace(old, new, 1)
    src = src.replace(A_ANCHOR, A_INSERT, 1)
    return src, "patched"


def patch_b(src):
    if MARK_B in src:
        return src, "already-applied"
    n = src.count(B_ANCHOR)
    if n != 1:
        raise SystemExit("FAIL: expected exactly 1 gwCall anchor, found %d" % n)
    return src.replace(B_ANCHOR, B_REPL, 1), "patched"


def run(files, patcher, label, strict):
    changed = 0
    for path in files:
        fp = os.path.join(ROOT, path)
        if not os.path.exists(fp):
            print("%s SKIP (absent) %s" % (label, path))
            continue
        src = read(path)
        try:
            out, status = patcher(src)
        except SystemExit as exc:
            if strict:
                raise
            print("%s WARN (mirror unpatched: %s) %s" % (label, exc, path))
            continue
        if status == "patched":
            write(path, out)
            changed += 1
        print("%s %-15s %s" % (label, status, path))
    return changed


def main():
    a = run(A_FILES, patch_a, "A", strict=True)
    b = run(B_FILES, patch_b, "B", strict=True)
    print("changed=%d" % (a + b))
    return 0


if __name__ == "__main__":
    sys.exit(main())
