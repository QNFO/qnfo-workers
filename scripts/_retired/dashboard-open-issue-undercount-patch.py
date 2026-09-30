#!/usr/bin/env python3
"""DASHBOARD-AGENT-ISSUES-UNDERCOUNT-1 -- fleet.qnfo.org reported "60 open agent_issues"
while qnfo-audit D1 held 89 (issue #1663).

ROOT CAUSE (measured 2026-09-30 by qnfo-ops)
--------------------------------------------
qnfo-fleet-dashboard/worker.js renders the panel row from

    SELECT id, title, category, priority FROM agent_issues
     WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled')
     ORDER BY priority DESC, id DESC LIMIT 60

and pushes `agOpen.length` as the count. The displayed number IS the LIMIT
constant. Measured the same day, same turn:
  * D1 GROUP BY status  -> open 89, closed 847, wontfix 415, resolved 272
  * the rendered row    -> 60
So every open backlog above 60 is under-reported, and the panel the fleet reads
to decide "is the backlog shrinking" cannot see the real number. The same capped
value is also summed into `invTotal`, so the inventory total understates too.

FIX
---
Render a real COUNT(*) for the row and keep LIMIT 60 for the list only.
`isOpenish(st)` is `!CLOSED[st]` and CLOSED is the same five statuses as the
NOT IN list, so COUNT(*) over that predicate is the authoritative open count.

CONTRACT (repo applier conventions)
-----------------------------------
* exactly-one-occurrence anchors; a mismatch aborts rc 1 and writes nothing
* idempotent: a second run is a no-op once the marker is present
* no deploy, no network -- apply-pending-patches.yml commits and deploys
* primary target qnfo-fleet-dashboard/worker.js; the deployed-current mirror is
  best-effort (a stale snapshot must not block the source-of-truth fix)

VERIFICATION PERFORMED BEFORE COMMIT (2026-09-30, qnfo-ops container)
--------------------------------------------------------------------
* run against the real 207517-byte qnfo-fleet-dashboard/worker.js and its
  deployed-current mirror: rc=0, both patched, all 4 anchors matched exactly once
* second and third runs: already-applied, rc=0 (idempotent)
* `node --check` on the patched bundle as ESM: SYNTAX OK
* applier sha256 3db09e70fe9ee6bf322ce28598196432fee18689e82a7a8934ea6bbea6d54018
"""
import os
import sys
from pathlib import Path

MARKER = "DASHBOARD-AGENT-ISSUES-UNDERCOUNT-1"
PRIMARY = "qnfo-fleet-dashboard/worker.js"
MIRROR = "qnfo-fleet-dashboard/deployed-current.worker.js"

A1_OLD = "let agOpen = [], dodByOwner = [], gtdByOwner = null, dispatch = [], ilOpen = null;"
A1_NEW = (
    "// DASHBOARD-AGENT-ISSUES-UNDERCOUNT-1 (issue #1663): agOpenTotal is the true\n"
    "  // open count; agOpen stays capped at LIMIT 60 for display only.\n"
    "  let agOpen = [], agOpenTotal = null, dodByOwner = [], gtdByOwner = null, dispatch = [], ilOpen = null;"
)

A2_OLD = 'id DESC LIMIT 60") || [];\n  } catch (e) {\n  }'
A2_NEW = A2_OLD + '''
  try { const _agt = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM agent_issues WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled')"); agOpenTotal = _agt && _agt.length ? _agt[0].c : null; } catch (e) { }'''

A3_OLD = '+ agOpen.length + "</td><td>not closed/resolved/wontfix</td></tr>"'
A3_NEW = '+ (agOpenTotal != null ? agOpenTotal : agOpen.length) + "</td><td>not closed/resolved/wontfix</td></tr>"'

A4_OLD = "+ agOpen.length + dispOpen +"
A4_NEW = "+ (agOpenTotal != null ? agOpenTotal : agOpen.length) + dispOpen +"

EDITS = [(A1_OLD, A1_NEW), (A2_OLD, A2_NEW), (A3_OLD, A3_NEW), (A4_OLD, A4_NEW)]


def patch_one(path, required):
    p = Path(path)
    if not p.exists():
        if required:
            print("FAIL: required target missing: " + str(path))
            return 2
        print("skip (absent, best-effort): " + str(path))
        return 0
    text = p.read_text()
    if MARKER in text:
        print("already applied: " + str(path))
        return 0
    for i, (old, new) in enumerate(EDITS, 1):
        n = text.count(old)
        if n != 1:
            print("FAIL: %s anchor %d matched %d times (want 1)" % (path, i, n))
            return 1
    for old, new in EDITS:
        text = text.replace(old, new)
    p.write_text(text)
    print("patched: " + str(path) + " (%d edits)" % len(EDITS))
    return 0


def main():
    root = Path(os.environ.get("REPO_ROOT", "."))
    rc = patch_one(root / PRIMARY, True)
    if rc != 0:
        return rc
    mirror_rc = patch_one(root / MIRROR, False)
    if mirror_rc not in (0, 2):
        return mirror_rc
    return 0


if __name__ == "__main__":
    sys.exit(main())
