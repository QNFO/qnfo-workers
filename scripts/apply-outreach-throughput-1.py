#!/usr/bin/env python3
"""OUTREACH-THROUGHPUT-1 - permanent fix for the qnfo-cloud-ops outreach drain (issue #1508).

EVIDENCE (qnfo-audit D1, read 2026-09-30):
  outreach_queue = 69 rows -> 20 sent / 22 pending / 27 skipped.
  20 sends in 30 days = 4.7/wk, and only 5 send-days out of 30.
  cloud_ops_events job='outreach' shows a 7-day dead gap 2026-09-23..2026-09-29.
  jobOutreach CAP=3/day x Tue-Sat = 15/wk ceiling, while research-scan inserts up to
  4 candidates per run (worker.js:729) = 20/wk. Arrival >= drain, so the lane never empties.

FIXES
  F1 CAP 3 -> 8. Aligned to the fleet's ALREADY-EXISTING constant GLOBAL_DAILY_CAP=8
     (qnfo-outreach/worker.js:9). Not a new number, no new policy.
  F2 Selector window LIMIT 10 -> 25. With CAP=8 and many skipped rows, the 10-row window
     was itself the binding constraint and starved rows behind it.
  F3 'needs-email' -> 'skipped-no-email'. 'needs-email' is BOTH the error write AND a member
     of the drain selector (worker.js:1547), so a failed lookup was re-selected forever.
     This is the last surviving member of the OUTREACH-TERMINAL-STATUS-1 class.
  F4 Followup branch: skip (and park) addresses failing validEmail(). outreach_log #7 and #26
     show '%4w@0h.oS' was actually emailed twice; the main send path already guarded this,
     the followup path did not.
  F5 VERSION bump so the deploy is externally verifiable.

VERIFIED 2026-09-30 in qnfo-containers-pilot against the real 126,602-byte worker.js:
  all 6 anchors matched exactly once, `node --check` exit 0, changed lines 6/1544/1547/1564/1620/1623.
  NOTE: the first revision of F4b anchored on a two-line pattern that matched TWICE
  (`if (sentToday >= CAP) break;` recurs elsewhere); the fail-closed count caught it and the
  anchor was narrowed to the unique `for (const f of fu.results || []) {`.

FAIL-CLOSED: every anchor must match exactly once, in every target, or nothing is written.
"""
import subprocess
import sys
from pathlib import Path

TARGETS = ["qnfo-cloud-ops/worker.js", "qnfo-cloud-ops/deployed-current.worker.js"]

EDITS = [
    (
        "F1 CAP 3->8",
        """const CAP = 3;""",
        """const CAP = 8; // OUTREACH-THROUGHPUT-1: aligned to fleet GLOBAL_DAILY_CAP=8 (qnfo-outreach/worker.js:9)""",
    ),
    (
        "F2 selector window 10->25",
        """ORDER BY created_at ASC LIMIT 10").all();""",
        """ORDER BY created_at ASC LIMIT 25").all();""",
    ),
    (
        "F3 needs-email -> terminal",
        """SET status='needs-email', error='email lookup failed (HTML+e-print)' WHERE id=?1 AND status='pending'""",
        """SET status='skipped-no-email', error='email lookup failed (HTML+e-print)' WHERE id=?1 AND status='pending'""",
    ),
    (
        "F4a followup select id",
        """SELECT email, subject FROM outreach_log WHERE status='sent'""",
        """SELECT id, email, subject FROM outreach_log WHERE status='sent'""",
    ),
    (
        "F4b followup validEmail guard",
        """for (const f of fu.results || []) {""",
        """for (const f of fu.results || []) {\n        if (!validEmail(f.email)) {\n          await env.AUDIT.prepare(\"UPDATE outreach_log SET status='rejected' WHERE id=?1\").bind(f.id).run().catch(function() {});\n          continue;\n        }""",
    ),
    (
        "F5 version bump",
        """var VERSION = "1.15.3-schedules-live-1"; /* SCHEDULES-LIVE-1 */""",
        """var VERSION = "1.15.4-outreach-throughput-1"; /* OUTREACH-THROUGHPUT-1 */""",
    ),
]

failures = []
for target in TARGETS:
    p = Path(target)
    if not p.exists():
        failures.append(f"{target}: missing")
        continue
    src = p.read_text()
    for name, old, new in EDITS:
        n = src.count(old)
        if n != 1:
            failures.append(f"{target}: anchor {name!r} matched {n}x (need exactly 1)")
            continue
        src = src.replace(old, new)
    if failures:
        continue
    p.write_text(src)
    print(f"patched {target}")

if failures:
    print("FAIL-CLOSED, nothing written:")
    for f in failures:
        print("  " + f)
    sys.exit(1)

for target in TARGETS:
    r = subprocess.run(["node", "--check", target], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"SYNTAX FAIL {target}: {r.stderr}")
        sys.exit(1)
    print(f"syntax OK {target}")

print("OUTREACH-THROUGHPUT-1 applied cleanly")
