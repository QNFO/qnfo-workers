#!/usr/bin/env python3
"""MIRROR-PARITY-RESTORE-1 applier (fail-closed, DURABLE parity guard).

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
Blocks present in worker.js but absent from the mirror:
    - TOOL-BUDGET-PENDING-1   (PENDING_TOOLCALLS_NOTE + summarizePendingToolCalls
                               + both guard call sites, chat loop and job loop)
    - OPS-D1-SCHEMA-HINT-FULL-1
    - two further hunks

DRIFT DIRECTION VERIFIED 2026-09-30T08:03Z (both blobs at 56c159e0 fetched raw and
compared byte-wise, not inferred from commit text):
    source 385973 B / 6114 lines   vs   mirror 381327 B / 6052 lines
=> the MIRROR was BEHIND, so this restore was a fix and NOT a clobber of a mirror-ahead
hotfix. Pre-repair marker counts: TOOL-BUDGET-PENDING-1 src=3 mirror=0,
summarizePendingToolCalls src=3 mirror=0, OPS-D1-SCHEMA-HINT-FULL-1 src=1 mirror=0.
Normalised line-set delta pre-repair: 62 lines source-only vs 8 mirror-only, and all 8
are differently-wrapped build variants whose semantic equivalent IS present in the source
(out.schema_tables, CONTAINER-CONFIG-DROPPED-1, metadataPart); token multiset delta 279
source-only vs 10 mirror-only tokens - no feature lived only in the mirror.
CAVEAT: the old mirror was a differently FORMATTED build of an older revision, so this
applier makes the mirror a byte-copy of the source bundle rather than a separately built
artifact. That is intended (the asserted invariant is byte equality) but it does mean the
artifact the canonical deploy uploads changes formatting; only the version marker
equality (VERSION "2.37.32-tool-budget-ceiling-1" in both source and live bundle) has
been checked, not behavioural equivalence of the two builds.

WHY IT MATTERS: the mirror is the artifact the canonical/redeploy route reads
(.github/workflows/mirror-sync.yml: "the canonical deploy reads
<dir>/deployed-current.worker.js, so a worker.js version bump that does not move the
mirror in the same commit leaves the deploy route verifying a stale version and failing
closed with an opaque ok=0"). apply-telemetry-truth.yml:119 states the same for the
redeploy cron. A stale mirror therefore makes the tool-budget fix live-but-not-durable:
the next redeploy reverts it.

WHY THE EXISTING MECHANISM DOES NOT COVER THIS (measured 2026-09-30T07:59Z):
scripts/mirror-guard.py classified qnfo-ops as CONTENT-DIFF-REVIEW /
"import-using source - report only" and its summary read
`lagging=0 content_drift=0 review=6 fixed=0`, i.e. `--fix` never touches an
import-using worker. Six workers are in that blind spot
(errata-orchestrator, qnfo-cloud-ops, qnfo-containers-pilot, qnfo-errata-publish,
qnfo-ops, qnfo-research-supervisor). qnfo-ops is the only worker with a tool loop,
so it is the one that matters for tool-budget durability.

CONTRACT v3 (durable, self-healing): the mirror is a DERIVED artifact. Every
apply-pending-patches run re-executes this script, so parity is repaired on every
run instead of once. v1's size/`markers-missing` preconditions were removed because
they made the applier a one-shot: after the first repair the mirror carries all
markers, so every later drift would have aborted with "manual review" - a silent
durability hole. v2's separate "mirror ahead" branch was removed in v3 because it
was UNREACHABLE (any REQUIRED marker absent from the source is already caught by
the source-marker check, which returns first); that was found by direct test, not
by reading.

FAIL-CLOSED:
  * source or mirror missing
  * source implausibly small (< 1024 bytes)
  * source lacks any REQUIRED tool-budget marker (would propagate a broken bundle)
POST-CONDITION: byte equality, verified by re-read.
IDEMPOTENT: byte-identical inputs => "nothing to do".
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "qnfo-ops" / "worker.js"
MIR = ROOT / "qnfo-ops" / "deployed-current.worker.js"

MIN_BYTES = 1024
REQUIRED = (
    b"TOOL-BUDGET-PENDING-1",
    b"summarizePendingToolCalls",
    b"BUDGET-AUTO-CONTINUE-1",
    b"var MAX_TOOL_ITERS = 40;",
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
    if len(src) < MIN_BYTES:
        print("FAIL-CLOSED: source is implausibly small (%d bytes)" % len(src))
        return 3
    missing_src = [m.decode() for m in REQUIRED if m not in src]
    if missing_src:
        print("FAIL-CLOSED: source worker.js lacks required markers: %s" % missing_src)
        return 3
    gained = [m.decode() for m in REQUIRED if m not in mir]
    MIR.write_bytes(src)
    if MIR.read_bytes() != src:
        print("FAIL-CLOSED: post-condition failed: mirror != source after write")
        return 3
    print("MIRROR-PARITY-RESTORE-1: parity synced %d -> %d bytes; markers gained: %s"
          % (len(mir), len(src), gained or "(none - content sync)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
