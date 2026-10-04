#!/usr/bin/env python3
"""OWNER-SENDER-NO-REPLY-1 (2026-10-03, owner directive "don't spam me about my own replies!").

DEFECT (measured live, qnfo-email 2.2.4)
---------------------------------------
qnfo-email treats EVERY inbound message that is not machine-generated as "a
nuanced human email held for your reply": enqueueHumanReply() inserts an
email_reply_queue row, writes a handoffs row, and calls notifyOwner(), which
mails a "[handoff] <subject>" notice to the owner's Outlook address. Nothing in
that path asked whether the message WAS the owner. So when the owner replied to
a handoff notice, the reply itself became a new handoff, which produced a new
notice, which the owner replied to again:

  inbound predatory-journal spam (email 915) -> queue row 52 -> notice
    -> owner: "This is predatory journal spam delete and do not bother me
       with this kind of junk"  (email 916, 2026-10-03T12:24:11Z)
       -> queue row 53 -> notice "[handoff] Re: [handoff] A journal for ..."
    -> owner: "Don't spam me about my own replies!"  (email 917, 13:11:24Z)
       -> queue row 54 -> next notice ...

Evidence: email_reply_queue rows 53/54 (sender rwnquni@outlook.com), handoffs
rows email-reply-916 / email-reply-917, and the quoted notice text inside the
body of emails 916/917 ("A nuanced human email is held for your reply (queue id
53)..."). The pre-existing email_filters rows 34-37 (action "accept" for the
owner's addresses, added 2026-10-03T12:26:40Z) do NOT stop it: applyFilters()
maps "accept" to {action:"process"}, which is exactly the enqueue path, and row
54 was created at 13:11:25Z, 45 minutes AFTER those filters existed.

FIX
---
Two guards, both fail-closed in the safe direction (they can only suppress a
reply-queue row, a strategic handoff row and an owner notice):

  1. isOwnerSender(from)      - from is one of the owner's own addresses.
  2. isHandoffNoticeReply(subject) - the message is a reply (Re:/AW:/Fwd:) to a
     fleet handoff notice, i.e. it is addressed to the fleet's own notice.

Owner mail is still ingested, still classified, and still runs processCommand
(the owner email command surface: read/status/pause outreach), so no owner
capability is lost. Recipient-side delivery is untouched; only the
self-notification loop stops.

VERSION 2.2.4-handoff-claim-sheet -> 2.2.5-owner-sender-no-reply
(VERSION-BUMP-GUARD-1: a worker fix committed without a bump never deploys).

Applies to BOTH worker.js and deployed-current.worker.js so mirror-guard.py's
source/mirror parity invariant stays green. Idempotent: a second run is a no-op.

ADVERSARIAL
-----------
This guard keys on an explicit address list plus the "[handoff]" subject form.
An owner alias that is in neither list and not a [handoff] reply would still be
queued. The offline companion test qnfo-email/owner-sender-no-reply.test.mjs
proves the guard functions and the two enqueue paths; it does NOT prove the
deployed worker carries them - that needs a live VERSION + bundle read.
"""
import os
import re
import sys

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
WDIR = os.path.join(ROOT, "qnfo-email")
TARGETS = [
    os.path.join(WDIR, "worker.js"),
    os.path.join(WDIR, "deployed-current.worker.js"),
]

MARK = "OWNER-SENDER-NO-REPLY-1"
NEW_VERSION = "2.2.5-owner-sender-no-reply"

HELPERS = '''/* OWNER-SENDER-NO-REPLY-1 (2026-10-03, owner directive "don't spam me about my own replies!"): a message FROM one of
   the owner's own addresses, or a reply to a fleet handoff notice, is the owner's own voice - never "a nuanced human
   email held for your reply". Before this guard the owner's reply to a handoff notice was itself queued for an authored
   reply (email 916 -> email_reply_queue 53) and notifyOwner mailed a NEW handoff notice back to the owner about that
   very reply, which the owner answered again (email 917 -> queue 54): an unbounded owner<->fleet notice loop,
   measured 2026-10-03. Owner mail is still ingested, still classified and still runs processCommand (the owner email
   command surface); this only stops creating a reply-queue row, a strategic handoff row and an owner notice. */
var OWNER_SENDERS=["rwnquni@outlook.com","rowan.quni@outlook.com","rwnqni@outlook.com","rowan.quni@qnfo.org","rwnquni@qnfo.org"];
function isOwnerSender(from){var s=String(from||"").toLowerCase();var m=s.match(/<([^>]+)>/);if(m)s=m[1];return OWNER_SENDERS.indexOf(s.trim())>=0}
function isHandoffNoticeReply(subject){var s=String(subject||"");return /^\\s*(re|aw|sv|antw|fwd?)\\s*:/i.test(s)&&/\\[handoff\\]/i.test(s)}
'''

OLD_ENQ = ('async function enqueueHumanReply(env,d){try{if(isMachineSender(d.from))return null;'
           'if(isInternalLoop(d.from,d.to))return null;')
NEW_ENQ = (HELPERS +
           'async function enqueueHumanReply(env,d){try{if(isMachineSender(d.from))return null;'
           'if(isInternalLoop(d.from,d.to))return null;if(isOwnerSender(d.from))return null;'
           'if(isHandoffNoticeReply(d.subject))return null;')

OLD_HANDOFF = 'async function enqueueHandoff(e,x){try{if(strategic(x.from,x.subject))'
NEW_HANDOFF = 'async function enqueueHandoff(e,x){try{if(isOwnerSender(x.from))return;if(strategic(x.from,x.subject))'


def patch_js(path):
    if not os.path.exists(path):
        print("MISSING %s" % path)
        return 0
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    if MARK in src:
        print("ALREADY-PATCHED %s" % path)
        return 0
    orig = src
    n = 0

    if OLD_ENQ in src:
        src = src.replace(OLD_ENQ, NEW_ENQ, 1)
        n += 1
    else:
        print("ANCHOR-MISS enqueueHumanReply in %s" % path)

    if OLD_HANDOFF in src:
        src = src.replace(OLD_HANDOFF, NEW_HANDOFF, 1)
        n += 1
    else:
        print("ANCHOR-MISS enqueueHandoff in %s" % path)

    src, k = re.subn(r'var VERSION="[^"]+"',
                     'var VERSION="%s"' % NEW_VERSION, src, count=1)
    if k == 0:
        print("ANCHOR-MISS VERSION in %s" % path)
    n += k

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
        total += patch_js(t)
    for t in TARGETS:
        if os.path.exists(t):
            with open(t, "r", encoding="utf-8") as fh:
                s = fh.read()
            print("STATE %s isOwnerSender=%d handoff_reply_guard=%d version=%s"
                  % (os.path.basename(t), s.count("isOwnerSender"),
                     s.count("isHandoffNoticeReply"),
                     (re.search(r'var VERSION="([^"]+)"', s) or [None, "?"])[1]))
    print("TOTAL_EDITS %d" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
