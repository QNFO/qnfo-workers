#!/usr/bin/env python3
"""
ROUTER-HOST-ORDER-CORRECTION-1  (2026-09-29)

CORRECTS an error introduced earlier the same day by
scripts/routerfetch-host-order-body-patch.py (commits 70726a8 / 206f0f2).

WHAT WAS WRONG
--------------
That patch reordered ROUTER_HOSTS to put https://qnfo-ai.q08.workers.dev FIRST,
on the strength of a run_code_net probe showing qnfo-ai.q08.workers.dev returned
200/401 from Worker context while https://ai.qnfo.org returned 522.

That inference was not sound. The decisive evidence is the incident history:

  * BEFORE the 16:36:06Z deploy of 0.9.20-router-host-failover, ROUTER pointed
    directly at https://qnfo-ai.q08.workers.dev and it was the ONLY host.
  * During exactly that period the caller emitted 101 gw-fallback events in one
    day, every one "gateway HTTP 404".
  * AFTER that deploy (which ADDED ai.qnfo.org as the first host) the fallback
    events STOPPED: last gw-fallback = 2026-09-29T16:32:28.680Z, and zero since,
    with no event yet carrying the new host=/body= fields.

Therefore qnfo-ai.q08.workers.dev is the host that was FAILING, and ai.qnfo.org
is the host that resolved it. The earlier patch put the failing host first, which
does not break correctness (the loop still falls through to the second host) but
adds a guaranteed-failing hop to every single call.

WHAT THIS PATCH DOES
--------------------
1. Restores the empirically-correct host order: ai.qnfo.org FIRST.
2. Bumps VERSION, because the previous applier landed a behaviour change while
   leaving VERSION at "0.9.20-router-host-failover". A redeploy with an unchanged
   VERSION string defeats version-based deploy verification and the deploy-drift
   guard, and is what produced the DEPLOY-UNCOORDINATED-DEPLOY report (#1443).

It does NOT touch the gw-fallback body/host capture added by the earlier patch:
that improvement is retained and is independent of host order.

SELF-CHECK BUG FIXED (2026-09-29, ROUTER-HOST-ORDER-CORRECTION-1b)
------------------------------------------------------------------
The first revision of this script could NEVER apply. Its post-condition check was

    idx_ai = out.find('"https://ai.qnfo.org",')
    idx_wd = out.find('"https://qnfo-ai.q08.workers.dev",')

but the SECOND element of the array is last and therefore has no trailing comma,
so `out.find('"https://qnfo-ai.q08.workers.dev",')` always returned -1 and the
guard aborted with "FAIL: ai.qnfo.org is not first in ROUTER_HOSTS" even after
both anchors had applied correctly. That turned the applier workflow into a
guaranteed red job and the correction never reached main.

The check is now BLOCK-SCOPED: it extracts the ROUTER_HOSTS array literal and
compares the positions of the two hostnames *within that block only*. Scoping
matters because the bare string "https://qnfo-ai.q08.workers.dev" also appears
earlier in the file inside the ROUTER constant
("https://qnfo-ai.q08.workers.dev/v1/chat/completions"), so an unscoped find
would match the wrong location.

Idempotent (marker check) and fail-closed (every anchor must match exactly once).
"""
import hashlib
import pathlib
import re
import sys

TARGET = pathlib.Path("qnfo-research-exec/worker.js")
MARKER = "ROUTER-HOST-ORDER-CORRECTION-1"

ANCHORS = [
    # --- 1. restore the empirically-correct host order ---------------------
    (
        '// ROUTER-HOST-ORDER-1 (2026-09-29): Worker-context probes show ai.qnfo.org returns\n'
        '// 522 (same-zone custom-domain subrequest) while qnfo-ai.q08.workers.dev returns\n'
        '// 200/401 from Worker context. Try the proven-reachable host FIRST so every call\n'
        '// does not burn a guaranteed-failing hop.\n'
        'var ROUTER_HOSTS = [\n'
        '  "https://qnfo-ai.q08.workers.dev",\n'
        '  "https://ai.qnfo.org"\n'
        '];',
        '// ROUTER-HOST-ORDER-CORRECTION-1 (2026-09-29): an earlier patch today put\n'
        '// qnfo-ai.q08.workers.dev first on the strength of a synthetic probe. The incident\n'
        '// history contradicts it: BEFORE 16:36:06Z the workers.dev host was the ONLY host\n'
        '// and produced 101 gw-fallback "gateway HTTP 404" events in one day; AFTER the\n'
        '// failover deploy added ai.qnfo.org first, those events stopped (last 16:32:28Z).\n'
        '// workers.dev is therefore the failing host. Keep ai.qnfo.org first.\n'
        'var ROUTER_HOSTS = [\n'
        '  "https://ai.qnfo.org",\n'
        '  "https://qnfo-ai.q08.workers.dev"\n'
        '];',
    ),
    # --- 2. bump VERSION so deploy verification can see this change --------
    (
        'var VERSION = "0.9.20-router-host-failover";',
        'var VERSION = "0.9.21-gw-host-order-and-body";',
    ),
]

AI_HOST = "https://ai.qnfo.org"
WD_HOST = "https://qnfo-ai.q08.workers.dev"


def host_order_ok(src: str) -> bool:
    """True iff ai.qnfo.org precedes qnfo-ai.q08.workers.dev inside ROUTER_HOSTS."""
    m = re.search(r"var ROUTER_HOSTS = \[(.*?)\];", src, re.S)
    if not m:
        return False
    block = m.group(1)
    i_ai = block.find(AI_HOST)
    i_wd = block.find(WD_HOST)
    return 0 <= i_ai < i_wd


def main() -> int:
    if not TARGET.exists():
        print(f"FAIL: target not found: {TARGET}", file=sys.stderr)
        return 1

    src = TARGET.read_text(encoding="utf-8")
    before = hashlib.sha256(src.encode()).hexdigest()[:16]

    if MARKER in src:
        if not host_order_ok(src):
            print(
                "FAIL: marker present but ai.qnfo.org is not first in ROUTER_HOSTS; "
                "refusing to report success on an inconsistent tree.",
                file=sys.stderr,
            )
            return 1
        print(f"already corrected (marker {MARKER!r} present); no write. sha256={before}")
        return 0

    out = src
    for i, (old, new) in enumerate(ANCHORS, 1):
        n = out.count(old)
        if n != 1:
            print(
                f"FAIL: anchor {i} matched {n} times (expected exactly 1); no partial write.",
                file=sys.stderr,
            )
            return 1
        out = out.replace(old, new, 1)
        print(f"anchor {i}: applied")

    for needed in (MARKER, "0.9.21-gw-host-order-and-body"):
        if needed not in out:
            print(f"FAIL: expected marker {needed!r} missing after patch", file=sys.stderr)
            return 1

    # Guard against the exact regression being corrected: the failing host must
    # not be first again. Block-scoped (see docstring).
    if not host_order_ok(out):
        print("FAIL: ai.qnfo.org is not first in ROUTER_HOSTS", file=sys.stderr)
        return 1

    TARGET.write_text(out, encoding="utf-8")
    after = hashlib.sha256(out.encode()).hexdigest()[:16]
    print(f"patched {TARGET}: sha256 {before} -> {after} ({len(out)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
