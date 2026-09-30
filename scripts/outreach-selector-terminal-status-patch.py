#!/usr/bin/env python3
"""OUTREACH-TERMINAL-STATUS-1 -- land terminal statuses for the two branches in
jobOutreach that `continue` without writing one (issues #1294, #1508).

WHY THIS EXISTS (measured 2026-09-30 by qnfo-ops)
-------------------------------------------------
qnfo-cloud-ops/worker.js jobOutreach selects its work set with

    SELECT id, paper_id, author, email, reason FROM outreach_queue
     WHERE status IN ('pending','needs-email') ORDER BY created_at ASC LIMIT 10

and two row classes then `continue` WITHOUT writing a status:

  * duplicate contact (already in contact_ledger or outreach_log)
  * invalid email (validEmail() false)

Both stay 'pending' forever, keep occupying the oldest-10 window, and starve
every row behind them. Measured head-of-queue on 2026-09-30: rows created
2026-09-16 still 'pending' after 14 days, one of them carrying the error text
"remediated 2026-09-28 by qnfo-ops: email" and STILL 'pending' -- proof that the
branch never rewrites status, which is the invariant #1508 states.

outreach_queue.status is unconstrained TEXT and the table has an `error` column
(verified against sqlite_master, 2026-09-30), so both writes are schema-valid.

FAIL-CLOSED / IDEMPOTENT (the repo applier contract)
----------------------------------------------------
* exactly-one-occurrence anchors; any mismatch aborts with rc 1 and writes nothing
* re-running is a no-op once the marker is present
* no deploy, no network: the caller (apply-pending-patches.yml) commits and the
  canonical deploy path handles the deploy
* the primary target (qnfo-cloud-ops/worker.js) must be patched or already
  applied; the deployed-current mirror is best-effort because it is a snapshot
  and a stale snapshot must not block the source-of-truth fix

VERIFICATION PERFORMED BEFORE COMMIT (2026-09-30, qnfo-ops container)
--------------------------------------------------------------------
* run against the real 125646-byte qnfo-cloud-ops/worker.js and the 125067-byte
  mirror: rc=0, both patched, anchors matched exactly once each
* second run: already-applied, nothing written (idempotent)
* `node --check` on the patched file as ESM: SYNTAX OK
"""
import sys
from pathlib import Path

MARKER = "OUTREACH-TERMINAL-STATUS-1"
PRIMARY = "qnfo-cloud-ops/worker.js"
MIRROR = "qnfo-cloud-ops/deployed-current.worker.js"

DUP_OLD = """      if (dup) {
        out.skipped_dupe++;
        continue;
      }
"""
DUP_NEW = """      if (dup) {
        out.skipped_dupe++;
        /* OUTREACH-TERMINAL-STATUS-1 (#1294/#1508): a duplicate must leave the
           work set. It used to `continue` with no status write, so the
           ORDER BY created_at ASC LIMIT 10 window re-selected it on every run
           and starved every row behind it. */
        await env.AUDIT.prepare("UPDATE outreach_queue SET status='skipped-dup', error='duplicate contact (contact_ledger/outreach_log)' WHERE id=?1").bind(r.id).run().catch(function() {
        });
        continue;
      }
"""

INV_OLD = """      if (!validEmail(email)) {
        out.errors.push({ id: r.id, error: "invalid email " + email });
        continue;
      }
"""
INV_NEW = """      if (!validEmail(email)) {
        out.errors.push({ id: r.id, error: "invalid email " + email });
        /* OUTREACH-TERMINAL-STATUS-1 (#1294/#1508): an un-sendable address must
           leave the work set, not be re-selected forever. This is the same
           class that sent a malformed address twice (#1479); the row is now
           parked instead of re-queued. */
        await env.AUDIT.prepare("UPDATE outreach_queue SET status='skipped-invalid', error=?2 WHERE id=?1").bind(r.id, "invalid email " + email).run().catch(function() {
        });
        continue;
      }
"""


def repo_root() -> Path:
    import os
    for cand in (os.environ.get("REPO_ROOT"), os.environ.get("GITHUB_WORKSPACE"), "."):
        if not cand:
            continue
        p = Path(cand).resolve()
        if (p / "scripts").is_dir() or (p / "qnfo-cloud-ops").is_dir():
            return p
    return Path(".").resolve()


def patch_one(path: Path, required: bool) -> str:
    if not path.is_file():
        if required:
            raise SystemExit(f"FAIL (fail-closed): required target missing: {path}")
        return "absent"
    text = path.read_text()
    if MARKER in text:
        return "already-applied"
    for name, old in (("dup", DUP_OLD), ("invalid", INV_OLD)):
        n = text.count(old)
        if n != 1:
            if required:
                raise SystemExit(
                    f"FAIL (fail-closed): {name} anchor occurrences = {n} (expected 1) in {path}"
                )
            return f"stale-anchor:{name}={n}"
    text = text.replace(DUP_OLD, DUP_NEW, 1).replace(INV_OLD, INV_NEW, 1)
    # POST-CONDITIONS (VERIFY-NOT-ASSUME-1): the marker must be present and both
    # bare `continue` branches must be gone, or nothing is written.
    if MARKER not in text or DUP_OLD in text or INV_OLD in text:
        raise SystemExit(f"FAIL (post-write assertion) in {path}")
    path.write_text(text)
    return "patched"


def main() -> int:
    root = repo_root()
    results = {}
    results[PRIMARY] = patch_one(root / PRIMARY, required=True)
    results[MIRROR] = patch_one(root / MIRROR, required=False)
    print(f"{MARKER}: " + ", ".join(f"{k}={v}" for k, v in results.items()))
    if results[PRIMARY] == "already-applied":
        print("already applied (marker present) - nothing written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
