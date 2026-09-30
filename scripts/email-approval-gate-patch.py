#!/usr/bin/env python3
"""EMAIL-APPROVAL-GATE-1 (issues #1476 + #1507).

Fixes three coupled defects in qnfo-email drainReplyQueue(), all measured at
source on 2026-09-30 (qnfo-email/worker.js:331).

  D1 (#1476) AUTOSEND-ON-DRAFT.  The owner-approval gate was removed on
     2026-09-26.  The SEND query selected every row with
     decision='escalate' AND draft_text IS NOT NULL, while the DRAFTER in
     qnfo-email-orchestrator only ever writes draft_text for
     `decision='pending' OR (decision='escalate' AND
      skip_reason LIKE '%cleared for auto-send%')`
     (qnfo-email-orchestrator/worker.js:110 and :128).  Writing draft_text was
     therefore equivalent to sending, including the auto-drafted
     enqueueHumanReply/buildResendDraft rows.
     Fix: require the same approval marker on the send path.

  D2 (#1507) NO SENDER-REPUTATION GATE.  Escalated inbound from a sender
     already marked spam elsewhere still reached the draft queue, one
     auto-send away from an outbound reply to a predatory publisher.
     Fix: skip any row whose sender owns a spam-status message.

  D3 (new -- the failure mode introduced by fixing D1) HELD-ROW SILENCE.
     Rows that now fail the gate would sit unsent forever with no visible
     reason, which is exactly the stall class this queue already suffers from
     (see replyStallGuard at :332, which only covers draft_text IS NULL).
     Fix: stamp them with a legible skip_reason and count them as `held`.

Applies to BOTH worker.js and deployed-current.worker.js so the mirror-guard
parity invariant stays green.  Fail-closed: exits 1 (so the transactional
applier reverts every write) unless the post-state carries the required
predicates.  Idempotent: a second run is a no-op.
"""
import os
import re
import sys

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
TARGETS = [
    os.path.join(ROOT, "qnfo-email", "worker.js"),
    os.path.join(ROOT, "qnfo-email", "deployed-current.worker.js"),
]

MARK = "EMAIL-APPROVAL-GATE-1"
NEW_VERSION = "1.9.0-approval-gate"

OLD_OUT = "async function drainReplyQueue(env){const out={sent:0,skipped:0,errors:0};try{"
NEW_OUT = "async function drainReplyQueue(env){const out={sent:0,skipped:0,errors:0,held:0};try{"

OLD_SEL = ("SELECT q.id,q.email_id,q.sender,q.subject,q.draft_text FROM email_reply_queue q "
           "WHERE q.decision='escalate' AND q.sent_at IS NULL AND q.draft_text IS NOT NULL "
           "AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.id=q.email_id AND e.status='spam') "
           "ORDER BY q.id LIMIT 20")

NEW_SEL = ("SELECT q.id,q.email_id,q.sender,q.subject,q.draft_text FROM email_reply_queue q "
           "WHERE q.decision='escalate' AND q.sent_at IS NULL AND q.draft_text IS NOT NULL "
           "AND q.skip_reason LIKE '%cleared for auto-send%' "
           "AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.id=q.email_id AND e.status='spam') "
           "AND NOT EXISTS (SELECT 1 FROM emails e2 WHERE e2.sender=q.sender AND e2.status='spam') "
           "ORDER BY q.id LIMIT 20")

OLD_TAIL = "out.skipped++}catch(e){}}}catch(e){}return out}"

HELD_BLOCK = (
    "out.skipped++}catch(e){}}"
    "const _held=await env.AUDIT_DB.prepare(\"SELECT q.id FROM email_reply_queue q "
    "WHERE q.decision='escalate' AND q.sent_at IS NULL AND q.draft_text IS NOT NULL "
    "AND (q.skip_reason IS NULL OR q.skip_reason NOT LIKE '%cleared for auto-send%')\").all();"
    "for(const row of _held.results||[]){try{"
    "await env.AUDIT_DB.prepare(\"UPDATE email_reply_queue SET "
    "skip_reason=COALESCE(skip_reason,'')||' | executor: owner-approval marker absent, held "
    "(REPLY-QUEUE-AUTOSEND-ON-DRAFT-1).',updated_at=datetime('now') WHERE id=?1\")"
    ".bind(row.id).run();"
    "out.held++}catch(e){}}"
    "}catch(e){}return out}"
)

REQUIRED = [
    "AND q.skip_reason LIKE '%cleared for auto-send%'",
    "e2.sender=q.sender",
    "out.held",
    "held:0",
]


def patch_js(path):
    if not os.path.exists(path):
        print("MISSING %s" % path)
        return -1
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    if MARK in src:
        print("ALREADY-PATCHED %s" % path)
        return 0
    if OLD_SEL not in src:
        print("ANCHOR-MISS send-query in %s -- refusing to guess" % path)
        return -1
    orig = src
    n = 0
    src = src.replace(OLD_OUT, NEW_OUT, 1)
    n += 1
    src = src.replace(OLD_SEL, NEW_SEL, 1)
    n += 1
    if OLD_TAIL in src:
        src = src.replace(OLD_TAIL, HELD_BLOCK, 1)
        n += 1
    else:
        print("ANCHOR-MISS tail in %s -- refusing to guess" % path)
        return -1
    src, k = re.subn(r'var VERSION = "[^"]+";',
                     'var VERSION = "%s";' % NEW_VERSION, src, count=1)
    n += k
    src = src.replace("async function drainReplyQueue(env){",
                      "/* %s: owner-approval + sender-reputation gate restored */\n"
                      "async function drainReplyQueue(env){" % MARK, 1)
    missing = [r for r in REQUIRED if r not in src]
    if missing:
        print("POST-STATE-FAIL %s missing=%s" % (path, missing))
        return -1
    if src == orig:
        print("NO-OP %s" % path)
        return 0
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)
    print("PATCHED %s (%d edits)" % (path, n))
    return n


def main():
    total = 0
    for t in TARGETS:
        r = patch_js(t)
        if r < 0:
            print("FAIL-CLOSED %s" % t)
            return 1
        total += r
    for t in TARGETS:
        if os.path.exists(t):
            with open(t, "r", encoding="utf-8") as fh:
                s = fh.read()
            print("STATE %s gate=%d reputation=%d held=%d version=%s"
                  % (os.path.basename(t),
                     s.count("cleared for auto-send"),
                     s.count("e2.sender=q.sender"),
                     s.count("out.held"),
                     (re.search(r'var VERSION = "([^"]+)"', s) or [None, "?"])[1]))
    print("TOTAL_EDITS %d" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
