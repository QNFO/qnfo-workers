#!/usr/bin/env python3
"""OUTREACH-SELECTOR-TERMINAL-STATUS-1 applier (issues 1294 / 1508).

Root cause (confirmed by direct read of the deployed bundle, 2026-09-30):
`qnfo-cloud-ops/worker.js` jobOutreach() drains outreach_queue with
    WHERE status IN ('pending','needs-email') ORDER BY created_at ASC LIMIT 10
and two of its non-terminal branches `continue` WITHOUT writing a status:

  * duplicate-contact branch  -> out.skipped_dupe++; continue;      (no write)
  * invalid-email branch      -> out.errors.push(...); continue;    (no write)

Because both branches leave the row at status='pending', the row is
re-selected on every run and permanently occupies a slot in the oldest-10
window. The no-email branch DOES write, but it writes status='needs-email',
which the selector also matches -- a closed loop.

This applier is idempotent and fails closed: every OLD anchor must appear
exactly once or the run aborts without writing.

Scope note: on live data (2026-09-30) all 25 pending rows classify as
SENDABLE, so this defect is LATENT, not the current blocker for the lane.
The current blocker is cron registration (issue 1500: qnfo-cloud-ops is
registered with a single cron `30 5 * * 1` while AMS_SCHEDULE declares 22
jobs), which this applier deliberately does NOT touch.
"""
import sys
import pathlib

TARGETS = ["qnfo-cloud-ops/worker.js", "qnfo-cloud-ops/deployed-current.worker.js"]

E_SELECTOR_OLD = (
    "SELECT id, paper_id, author, email, reason FROM outreach_queue "
    "WHERE status IN ('pending','needs-email') ORDER BY created_at ASC LIMIT 10"
)
E_SELECTOR_NEW = (
    "SELECT id, paper_id, author, email, reason FROM outreach_queue "
    "WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10"
)

E_DUP_OLD = """      if (dup) {
        out.skipped_dupe++;
        continue;
      }"""
E_DUP_NEW = """      if (dup) {
        out.skipped_dupe++;
        await env.AUDIT.prepare("UPDATE outreach_queue SET status='skipped-dup', error='duplicate contact (contact_ledger/outreach_log)' WHERE id=?1 AND status='pending'").bind(r.id).run().catch(function() {
        });
        continue;
      }"""

E_INVALID_OLD = """      if (!validEmail(email)) {
        out.errors.push({ id: r.id, error: "invalid email " + email });
        continue;
      }"""
E_INVALID_NEW = """      if (!validEmail(email)) {
        out.errors.push({ id: r.id, error: "invalid email " + email });
        await env.AUDIT.prepare("UPDATE outreach_queue SET status='skipped-invalid', error='invalid recipient syntax: ' || ?1 WHERE id=?2 AND status='pending'").bind(String(email).slice(0, 120), r.id).run().catch(function() {
        });
        continue;
      }"""

EDITS = [
    ("selector narrowed to status='pending'", E_SELECTOR_OLD, E_SELECTOR_NEW),
    ("dup branch writes status=skipped-dup", E_DUP_OLD, E_DUP_NEW),
    ("invalid branch writes status=skipped-invalid", E_INVALID_OLD, E_INVALID_NEW),
]


def apply_to(path: pathlib.Path) -> int:
    if not path.exists():
        print("SKIP (absent): %s" % path)
        return 0
    src = path.read_text(encoding="utf-8")
    original = src
    applied = 0
    for label, old, new in EDITS:
        n = src.count(old)
        if n == 0:
            print("  - already applied / not present: %s" % label)
            continue
        if n != 1:
            print("ABORT: anchor %r occurs %d times in %s (expected 1)" % (label, n, path))
            sys.exit(2)
        src = src.replace(old, new, 1)
        applied += 1
        print("  + %s" % label)
    if src != original:
        path.write_text(src, encoding="utf-8")
        print("WROTE %s (%d edit(s))" % (path, applied))
    else:
        print("NO-OP %s (idempotent)" % path)
    return applied


def main() -> int:
    total = 0
    for t in TARGETS:
        total += apply_to(pathlib.Path(t))
    print("OUTREACH-SELECTOR-TERMINAL-STATUS-1: %d edit(s) applied" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
