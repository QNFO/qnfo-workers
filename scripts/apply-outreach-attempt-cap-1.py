#!/usr/bin/env python3
"""OUTREACH-ATTEMPT-CAP-1 (issue #1562) - permanent fix for the qnfo-cloud-ops outreach drain.

Supersedes and folds in the never-landed OUTREACH-THROUGHPUT-1 (issue #1508) applier,
whose workflow run 36735258890 failed at step "Commit and push" (main is NOT protected;
the failure was a non-fast-forward race in this very high-churn repo). This applier is
idempotent and its workflow rebases + retries the push.

ROOT CAUSE (qnfo-audit D1 + qnfo-cloud-ops/worker.js, read 2026-09-30):
  jobOutreach's drain selector is `status IN ('pending','needs-email')`.
  The email-lookup FAILURE branch wrote status='needs-email' -- which is ITSELF a member
  of that selector. A row whose address could never be resolved was therefore re-selected
  on every run and re-attempted forever, and because the selector is
  `ORDER BY created_at ASC LIMIT 10`, those dead rows permanently occupied the front of
  the window and starved every live row behind them.
  Separately, radar-hub/worker.js:508 writes status='needs-contact', which NO consumer
  selected at all, so those rows were unreachable by design.

FIXES
  F1 CAP 3 -> 8. Aligned to the fleet's existing GLOBAL_DAILY_CAP=8 (qnfo-outreach/worker.js).
  F2 Drain selector window LIMIT 10 -> 25 (with CAP=8 the 10-row window was itself binding).
  F3 Attempt cap: lookup failure now increments outreach_queue.attempts and leaves the work
     set as 'skipped-no-email' after 3 tries. This is the terminal write that #1562 asks for.
  F4 Selector now includes 'needs-contact' (D1) so radar-hub's rows are reachable.
  F5 attempts reset to 0 once an address resolves.
  F6 Followup branch parks addresses failing validEmail() (outreach_log #7/#26 show
     '%4w@0h.oS' was emailed twice; the main send path guarded this, the followup path did not).
  F7 VERSION bump so the deploy is externally verifiable.

REQUIRES the companion migration (applied to qnfo-audit):
  ALTER TABLE outreach_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

FAIL-CLOSED + IDEMPOTENT: every anchor must match exactly once across all targets, or nothing
is written; if the file is already patched the script exits 0 having changed nothing.
"""
import subprocess
import sys
from pathlib import Path

TARGETS = ["qnfo-cloud-ops/worker.js", "qnfo-cloud-ops/deployed-current.worker.js"]

EDITS = [
    (
        "F1 CAP 3->8",
        """const CAP = 3;""",
        """const CAP = 8; // OUTREACH-THROUGHPUT-1: aligned to fleet GLOBAL_DAILY_CAP=8 (qnfo-outreach/worker.js)""",
    ),
    (
        "F2+F4 selector: attempts, needs-contact, window 25",
        """SELECT id, paper_id, author, email, reason FROM outreach_queue WHERE status IN ('pending','needs-email') ORDER BY created_at ASC LIMIT 10""",
        """SELECT id, paper_id, author, email, reason, COALESCE(attempts,0) AS attempts FROM outreach_queue WHERE status IN ('pending','needs-email','needs-contact') ORDER BY created_at ASC LIMIT 25""",
    ),
    (
        "F3 attempt-capped terminal lookup failure",
        """await env.AUDIT.prepare("UPDATE outreach_queue SET status='needs-email', error='email lookup failed (HTML+e-print)' WHERE id=?1 AND status='pending'").bind(r.id).run().catch(function() {""",
        """/* OUTREACH-ATTEMPT-CAP-1 (#1562): 'needs-email' is INSIDE the drain selector,
             so parking a failed lookup there re-selected it forever and starved every
             row behind it in the window. Count attempts; leave the work set at the cap. */
          const att = Number(r.attempts || 0) + 1;
          const terminal = att >= 3;
          await env.AUDIT.prepare("UPDATE outreach_queue SET status=?2, attempts=?3, error=?4 WHERE id=?1").bind(r.id, terminal ? "skipped-no-email" : "needs-email", att, "email lookup failed (HTML+e-print), attempt " + att + (terminal ? " - terminal" : "")).run().catch(function() {""",
    ),
    (
        "F5 reset attempts on resolve",
        """await env.AUDIT.prepare("UPDATE outreach_queue SET email=?1 WHERE id=?2").bind(email, r.id).run();""",
        """await env.AUDIT.prepare("UPDATE outreach_queue SET email=?1, attempts=0, error=NULL WHERE id=?2").bind(email, r.id).run();""",
    ),
    (
        "F6a followup select id",
        """SELECT email, subject FROM outreach_log WHERE status='sent'""",
        """SELECT id, email, subject FROM outreach_log WHERE status='sent'""",
    ),
    (
        "F6b followup validEmail guard",
        """for (const f of fu.results || []) {""",
        """for (const f of fu.results || []) {\n        if (!validEmail(f.email)) {\n          await env.AUDIT.prepare("UPDATE outreach_log SET status='rejected' WHERE id=?1").bind(f.id).run().catch(function() {\n          });\n          continue;\n        }""",
    ),
    (
        "F7 version bump",
        """var VERSION = "1.15.3-schedules-live-1"; /* SCHEDULES-LIVE-1 */""",
        """var VERSION = "1.15.4-outreach-attempt-cap-1"; /* OUTREACH-ATTEMPT-CAP-1 */""",
    ),
]

failures = []
for target in TARGETS:
    p = Path(target)
    if not p.exists():
        failures.append(f"{target}: missing")
        continue
    src = p.read_text()
    if "OUTREACH-ATTEMPT-CAP-1 (#1562)" in src:
        print(f"{target}: already patched (idempotent no-op)")
        continue
    local_fail = []
    for name, old, new in EDITS:
        n = src.count(old)
        if n != 1:
            local_fail.append(f"{target}: anchor {name!r} matched {n}x (need exactly 1)")
            continue
        src = src.replace(old, new)
    if local_fail:
        failures.extend(local_fail)
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

print("OUTREACH-ATTEMPT-CAP-1 applied cleanly")
