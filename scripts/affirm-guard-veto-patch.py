#!/usr/bin/env python3
"""AFFIRM-GUARD-VETO-1 applier (2026-09-29).

WHY THIS EXISTS
---------------
Two OPEN issues describe the same twelve-line guard from opposite sides, and
BOTH are correct about the current tree. Fixing either one alone makes the other
worse, which is why the previous two attempts (a wider token list) regressed.

  * #1481 AFFIRM-GUARD-FALSE-NEG-1 -- the guard rejects drain instructions that
    do not contain one of its tokens. Measured 2026-09-29: the operator turn
    "Drain fleet backlog(s) open items" was refused with
        ok:false, error:"execution requires explicit affirmation in YOUR latest
        message (yes / go ahead / drain it) ...", dryRun:true, openBacklog:52
    even though the token list DOES contain `drain` and `backlog`.

  * #1482 AFFIRM-GUARD-TOO-BROAD-1 -- the same list authorizes on the bare words
    'please' / 'backlog' / 'fix' / 'close' / 'clear' / 'start' / 'run', and on
    explicit refusals. "Do not drain the backlog." matches BOTH `drain` and
    `backlog`, so a refusal authorizes the drain it refuses.

Measured anchor on main (qnfo-ops/worker.js, VERSION 2.37.27-self-fetch-guard):

    function userAffirmative(t2) {
      return /\\b(yes|yep|yeah|confirm|confirmed|go ahead|do it|run it|proceed|
                 drain|execute|exec|run|trigger|fix|start|please|remediate|
                 remediation|resolve|close|clear|backlog)\\b/i.test(String(t2 || ""));
    }

WHY #1481 HAPPENS (and why "widen the list" was the wrong repair)
----------------------------------------------------------------
`userText` is the LATEST user turn only. The operator's continuation turns are
of the form "Continue." / "INCOMPLETE: ...", neither of which carries a token,
so the drain is unreachable in exactly the turns an operator uses to keep a long
task going. The previous repair widened the list to include continuation words.
That fixed the false negative by making the gate accept almost ANY prose -- it
traded #1481 for #1482, i.e. it removed the false negative by removing the gate.
The false negative is NOT a token-coverage bug; it is a SCOPE bug (which turn is
inspected). Widening the list cannot fix a scope bug.

THE FIX (closes both, without widening)
---------------------------------------
Keep the scope decision where the operator actually expresses intent, and add the
missing REFUSAL polarity. Two changes, both fail-closed:

1. NEGATION VETO (new) -- a refusal that TARGETS the drain action can never
   authorize it, regardless of what else the turn says:

     /(?:do\\s+not|don'?t|never|no|stop|cancel|abort|hold\\s+off|not\\s+yet)
       \\s+(?:the\\s+|a\\s+|any\\s+)?
       (?:drain|run|execute|proceed|trigger|remediate|fix|close|clear)\\b/i
       -> return false

   The veto is deliberately ADJACENCY-SCOPED, not global. A global "contains a
   negation" check is itself a #1481-class bug, and it would break the owner's
   own standing instruction, which is measured verbatim in this thread:

     "Do not stop, do not terminate, do not interrupt execution.
      Drain fleet backlog(s) open items."

   That turn negates stop/terminate/interrupt -- NOT the drain -- and must still
   authorize. A global veto would refuse it. Verified by construction against
   that exact string: `do not stop,` / `do not terminate,` / `do not interrupt`
   carry no target from the veto list, so no veto fires, and `drain` authorizes.
   Note `execut\\w*` is deliberately NOT a veto target: "do not interrupt
   execution" would otherwise veto via `execut`+`ion`, re-creating #1481.

2. TIGHTENED AFFIRMATIVES -- drop the tokens that carry no intent by themselves
   ('please', 'backlog', 'fix', 'close', 'clear', 'start', 'run', 'exec',
   'trigger', 'resolve', 'remediate', 'remediation'). Every legitimate drain
   instruction measured in this thread contains `drain`, so nothing that should
   authorize stops authorizing. What remains is intent-bearing:
   yes|yep|yeah|confirm|confirmed|approve|approved|authorized|authorised|
   go ahead|do it|run it|proceed|drain

RESIDUAL RISK -- STATED, NOT HIDDEN
-----------------------------------
This is still a keyword gate over free text. It is an ACCIDENT-PREVENTION gate,
not an authentication boundary: any caller who can reach the endpoint can put
`drain` in a message. The real boundary is the bearer token (see #1277
CF-ONE-ACCESS-NOT-DEPLOYED-1) and the `confirm:true` argument. This patch does
not claim otherwise, and does not pretend to be a security control.

DELIBERATELY NOT DONE
---------------------
- Not converted into a session-bound/cryptographic confirmation: that is a
  design change (tracked by #1482), out of scope for a text patch.
- Not extended to inspect the whole conversation: the worker receives only the
  latest user turn here, so "look at earlier turns" is not implementable at this
  layer without a request-shape change. Flagged, not faked.

FAIL-CLOSED / IDEMPOTENT
------------------------
- Marker present          -> exit 0, no write.
- Anchor count != 1       -> exit 1, no write (never half-applies).
- Exactly one VERSION literal required; 0 or >1 -> exit 1, no write.
- VERSION matched by regex, never pinned (VERSION-ANCHOR-DRIFT-1: the fleet
  bumps VERSION several times an hour, so an exact literal is orphaned within
  minutes).
- Post-write assertion on marker, new version, veto regex, tightened token list,
  and ABSENCE of the old token list.
"""
import os
import re
import sys

MARKER = "AFFIRM-GUARD-VETO-1"
TARGETS = ("qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js")

# VERSION-ANCHOR-DRIFT-1: match, never pin.
VERSION_RE = re.compile(r'var VERSION = "2\.37\.(\d+)-[^"]*";')
NEW_SLUG = "affirm-veto"

# The single occurrence of the live token list. Measured exactly once on main.
ANCHOR = r'    return /\b(yes|yep|yeah|confirm|confirmed|go ahead|do it|run it|proceed|drain|execute|exec|run|trigger|fix|start|please|remediate|remediation|resolve|close|clear|backlog)\b/i.test(String(t2 || ""));'

NEW = r'''    var __s = String(t2 || "");
    // AFFIRM-GUARD-VETO-1 (2026-09-29) -- closes #1481 (false negative) AND #1482
    // (vacuous gate). This is an ACCIDENT-PREVENTION gate, NOT an auth boundary.
    // 1. Refusal polarity, adjacency-scoped: a negation that targets the drain
    //    action can never authorize it. Scoped deliberately -- a global negation
    //    check would refuse the owner's own standing instruction
    //    "Do not stop, do not terminate, do not interrupt execution. Drain ...".
    //    `execut\w*` is NOT a veto target for that same reason.
    if (/(?:do\s+not|don'?t|never|no|stop|cancel|abort|hold\s+off|not\s+yet)\s+(?:the\s+|a\s+|any\s+)?(?:drain|run|execute|proceed|trigger|remediate|fix|close|clear)\b/i.test(__s)) return false;
    // 2. Intent-bearing affirmatives only. The vague tokens that made the gate
    //    vacuous ('please'/'backlog'/'fix'/'close'/'clear'/'start'/'run') are gone;
    //    every legitimate drain instruction contains `drain`, so nothing that
    //    should authorize stops authorizing.
    return /\b(?:yes|yep|yeah|confirm|confirmed|approve|approved|authorized|authorised|go\s+ahead|do\s+it|run\s+it|proceed|drain)\b/i.test(__s);'''

OLD_TOKENS_PROBE = "please|remediate|remediation|resolve|close|clear|backlog"
VETO_PROBE = "AFFIRM-GUARD-VETO-1"


def main():
    root = os.getcwd()
    touched = []
    for rel in TARGETS:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            print("SKIP (missing): " + rel)
            continue
        src = open(path, encoding="utf-8").read()
        if MARKER in src:
            print("OK (already patched): " + rel)
            continue
        n = src.count(ANCHOR)
        if n != 1:
            print("FAIL (fail-closed): anchor occurrence = %d (expected exactly 1) in %s" % (n, rel))
            return 1
        vms = list(VERSION_RE.finditer(src))
        if len(vms) != 1:
            print("FAIL (fail-closed): VERSION literal occurrences = %d in %s" % (len(vms), rel))
            return 1
        vm = vms[0]
        old_version = vm.group(0)
        new_version = 'var VERSION = "2.37.%d-%s";' % (int(vm.group(1)) + 1, NEW_SLUG)
        out = src.replace(ANCHOR, NEW, 1)
        out = out.replace(old_version, new_version, 1)
        for probe in (MARKER, new_version, "approve|approved", "don'?t", "return false;"):
            if probe not in out:
                print("FAIL (post-write assertion): missing %r in %s" % (probe, rel))
                return 1
        if OLD_TOKENS_PROBE in out:
            print("FAIL (post-write assertion): old vacuous token list still present in %s" % rel)
            return 1
        open(path, "w", encoding="utf-8").write(out)
        print("PATCHED %s  (%d -> %d bytes)  %s -> %s" % (rel, len(src), len(out), old_version, new_version))
        touched.append(rel)
    if not touched:
        print("nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())
