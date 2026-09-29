#!/usr/bin/env python3
"""patch-ensemble-budget-3.py -- ENSEMBLE-BUDGET-3 (2026-09-29)

DEFECT: qnfo-ai runEnsemble() still returned FALLBACK_TEXT after ENSEMBLE-BUDGET-2.
ENSEMBLE-BUDGET-2 rebalanced the *shares* but left the total deadline at 45e3 ms, and the
measured latencies of the legs are far larger than the slices it hands out:
  ENSEMBLE.primary.wa = @cf/moonshotai/kimi-k2.7-code  (reasoning model, 262k ctx)
  fallback            = api.deepseek.com deepseek-chat  (MODELS["deepseek-v4-flash"].api)
  retry               = @cf/moonshotai/kimi-k2.7-code

MEASURED (QNFO_AUDIT.ai_queries, 2026-09-27 -> 2026-09-29):
  model=gpt-oss-120b    max completion  7379 tok  avg latency 144947 ms
  model=deepseek-v4-pro max completion 10119 tok  avg latency  31087 ms
  model=kimi-k2.6       max completion    14 tok  avg latency  59479 ms
  model=ensemble        n=26  canned=26  max completion 112 tok avg latency  49925 ms

The legs that do succeed need 31 s - 145 s. Inside a 45e3 deadline with a 22.5e3 primary slice
the primary is cut off, the 13.5e3 DeepSeek fallback is cut off and the 6.75e3 retry is cut off,
so primaryText stays "" and the handler returns FALLBACK_TEXT (335 chars, 112 completion tokens).
The observed ensemble latency (47431-50746 ms) is exactly the exhausted budget.

FIX: raise the total ensemble deadline to 120e3 ms and give the stages real slices of it
(primary 60e3, DeepSeek fallback 36e3, retry 18e3; floors 20e3 / 15e3 / 8e3). The caller
(qnfo-research-exec gwCall) aborts at 24e4 ms, so 120e3 fits with margin.

Idempotent (marker-guarded) and fail-closed (missing anchor => non-zero exit, no write).
Marker: ENSEMBLE-BUDGET-3
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARK = "ENSEMBLE-BUDGET-3"

FILES = ["qnfo-ai/worker.js", "qnfo-ai/deployed-current.worker.js"]

BUDGET_OLD = "const ENSEMBLE_BUDGET_MS = 45e3;"

BUDGET_NEW = (
    "// ENSEMBLE-BUDGET-3 (2026-09-29): the 45e3 total deadline was smaller than the real leg\n"
    "  // latencies (measured 31 s - 145 s per leg), so every stage was cut off and the ensemble\n"
    "  // always returned FALLBACK_TEXT. 120e3 fits inside the caller's 24e4 ms abort.\n"
    "  const ENSEMBLE_BUDGET_MS = 120e3;"
)

SUBS = [
    (BUDGET_OLD, BUDGET_NEW),
    ("_stageCap(0.5, 8e3)", "_stageCap(0.5, 2e4)"),
    ("_stageCap(0.3, 6e3)", "_stageCap(0.3, 1.5e4)"),
    ("_stageCap(0.15, 5e3)", "_stageCap(0.15, 8e3)"),
]


def patch(src):
    if MARK in src:
        return src, "already-applied"
    for old, new in SUBS:
        n = src.count(old)
        if n != 1:
            raise SystemExit("FAIL: expected exactly 1 occurrence of %r, found %d" % (old, n))
        src = src.replace(old, new, 1)
    return src, "patched"


def main():
    changed = 0
    for path in FILES:
        fp = os.path.join(ROOT, path)
        if not os.path.exists(fp):
            print("SKIP (absent) %s" % path)
            continue
        with open(fp, "r", encoding="utf-8") as fh:
            src = fh.read()
        out, status = patch(src)
        if status == "patched":
            with open(fp, "w", encoding="utf-8") as fh:
                fh.write(out)
            changed += 1
        print("%-15s %s" % (status, path))
    print("changed=%d" % changed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
