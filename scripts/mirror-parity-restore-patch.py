#!/usr/bin/env python3
"""MIRROR-PARITY-RESTORE-1 applier (fail-closed).

INVARIANT (asserted by CI in several workflows):
    qnfo-ops/worker.js  ==  qnfo-ops/deployed-current.worker.js   (byte-identical)
e.g. .github/workflows/apply-github-write-409-retry.yml:102 and
.github/workflows/apply-telemetry-truth.yml:97 run
`cmp qnfo-ops/worker.js qnfo-ops/deployed-current.worker.js`, and
scripts/ops-deploy-ledger-patch.py:185 fails with
"parity: worker.js and deployed-current.worker.js differ after patch".

MEASURED DRIFT 2026-09-30T07:56Z (repo HEAD 56c159e0):
    qnfo-ops/worker.js                  385973 bytes
    qnfo-ops/deployed-current.worker.js 381327 bytes   (75 lines missing)
Blocks present in worker.js but absent from the mirror include:
    - TOOL-BUDGET-PENDING-1   (PENDING_TOOLCALLS_NOTE + summarizePendingToolCalls
                               + both guard call sites, chat loop and job loop)
    - OPS-D1-SCHEMA-HINT-FULL-1
    - two further hunks

WHY IT MATTERS: the mirror is the artifact the fleet redeploy cron deploys
(.github/workflows/apply-telemetry-truth.yml:97 comment - "The applier writes both
worker.js and its deployed-current mirror so the fleet redeploy cron cannot revert
the fix"). A stale mirror therefore REVERTS TOOL-BUDGET-PENDING-1 on the next
redeploy: the tool-budget fix is live but not durable.

FAIL-CLOSED CONTRACT:
  * abort unless the source carries every REQUIRED marker
  * abort unless the source is strictly larger than the mirror (never shrink)
  * abort if the mirror already carries all markers yet still differs (manual review)
  * post-condition: byte equality, verified by re-read
  * idempotent: byte-identical inputs => "nothing to do"
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "qnfo-ops" / "worker.js"
MIR = ROOT / "qnfo-ops" / "deployed-current.worker.js"

REQUIRED = (
    b"TOOL-BUDGET-PENDING-1",
    b"summarizePendingToolCalls",
    b"BUDGET-AUTO-CONTINUE-1",
    b"var MAX_TOOL_ITERS = 40;",
    b"OPS-D1-SCHEMA-HINT-FULL-1",
)


def main() -> int:
    if not SRC.is_file() or not MIR.is_file():
        print("FAIL-CLOSED: missing %s" % (SRC if not SRC.is_file() else MIR))
        return 3
    src = SRC.read_bytes()
    mir = MIR.read_bytes()
    if src == mir:
        print("MIRROR-PARITY-RESTORE-1: nothing to do (already byte-identical, %d bytes)" % len(src))
        return 0
    missing_src = [m.decode() for m in REQUIRED if m not in src]
    if missing_src:
        print("FAIL-CLOSED: source worker.js lacks required markers: %s" % missing_src)
        return 3
    if len(src) <= len(mir):
        print("FAIL-CLOSED: source %d bytes <= mirror %d bytes - refusing to shrink" % (len(src), len(mir)))
        return 3
    missing_mir = [m.decode() for m in REQUIRED if m not in mir]
    if not missing_mir:
        print("FAIL-CLOSED: mirror carries every required marker yet differs - manual review")
        return 3
    MIR.write_bytes(src)
    if MIR.read_bytes() != src:
        print("FAIL-CLOSED: post-condition failed: mirror != source after write")
        return 3
    print("MIRROR-PARITY-RESTORE-1: parity restored %d -> %d bytes; markers restored: %s"
          % (len(mir), len(src), missing_mir))
    return 0


if __name__ == "__main__":
    sys.exit(main())
