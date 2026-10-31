#!/usr/bin/env python3
"""
slot-crash-trace-1-patch.py -- SLOT-CRASH-TRACE-1 (2026-10-31, agent_issues 1000556, 1000561,
1000562, 1000564, 1000565, 1000566; GitHub issues #5407, #5408, #5409, #5410, #5419, #5420).

0.40.10 COMPLETE-STRUCTURAL-1 fixed the "Cannot read properties of undefined (reading 'n')" crash
itself. What remained is why it hid for five days: the runSlot/run catches logged e.message only,
so 1904 error events named no location. This patch:

  1. appends the top two stack frames to both error events, so the next occurrence names its
     function and line;
  2. clamps insertSection on an unknown section key (PAPER_SECTION_ORDER[-1].n would throw);
  3. skips falsy entries in the grounding bibBlock (b.n) and the dangling-ref collector (sp.n).

Fail-closed: every anchor must be present exactly once or the script exits without writing.
Idempotent: a worker file that already carries the SLOT-CRASH-TRACE-1 marker is skipped.

Usage: python3 scripts/slot-crash-trace-1-patch.py
"""
import re
import sys

MARK = "SLOT-CRASH-TRACE-1"
NEW_VER = '0.40.11-slot-crash-trace'
VER_NOTE = "/* 0.40.11 SLOT-CRASH-TRACE-1 (2026-10-31, agent_issues 1000556, 1000561, 1000562, 1000564, 1000565, 1000566, pillar autonomy; patch): 0.40.10 COMPLETE-STRUCTURAL-1 fixed the crash itself (spec.n of undefined when pc.middleMissing was empty); what remains is why it hid for five days -- the runSlot and run() catches logged only e.message, so 1904 error events named no location. Both catches now append the top two stack frames, and the bundle's remaining unguarded `.n` reads (insertSection on an unknown section key, the grounding bibBlock, the dangling-ref collector) fail closed instead of throwing. slot-crash-trace.test.mjs. */"

# (anchor, replacement) applied once each; every anchor must occur exactly once.
PAIRS = [
    ('  const bibBlock = bib.map(function(b) {',
     '  const bibBlock = bib.filter(function(b) { return !!b; }).map(function(b) {'),
    ('    if (dangling.indexOf(sp.n) < 0) dangling.push(sp.n);',
     '    if (sp && dangling.indexOf(sp.n) < 0) dangling.push(sp.n);'),
    ('  var at = PAPER_SECTION_ORDER.findIndex(function(x) { return x.key === key; });',
     '  var at = PAPER_SECTION_ORDER.findIndex(function(x) { return x.key === key; });\n  // SLOT-CRASH-TRACE-1: an unknown key indexed PAPER_SECTION_ORDER[-1] and threw "reading \'n\'" (0.40.10 fixed the\n  // one live caller; this clamps the hazard itself). An unknown key appends before the Conclusion slot.\n  if (at < 0) at = PAPER_SECTION_ORDER.length - 1;'),
    ('    return Object.assign(await claimNew(env), { slot });\n  } catch (e) {',
     '    return Object.assign(await claimNew(env), { slot });\n  } catch (e) {\n    // SLOT-CRASH-TRACE-1: e.message alone ("Cannot read properties of undefined (reading \'n\')") locates nothing;\n    // the top stack frames name the function and line, so a recurring slot error is fixable from its first event.'),
    ('    await logEvent(env, "error", "slot " + slot + ": " + msg, "error");',
     '    const frames = e && e.stack ? String(e.stack).split("\\n").slice(1, 3).join(" ").replace(/\\s+/g, " ").trim().slice(0, 300) : "";\n    await logEvent(env, "error", "slot " + slot + ": " + msg + (frames ? " @ " + frames : ""), "error");'),
    ('    await logEvent(env, "error", msg, "error");',
     '    const frames = e && e.stack ? String(e.stack).split("\\n").slice(1, 3).join(" ").replace(/\\s+/g, " ").trim().slice(0, 300) : "";\n    await logEvent(env, "error", msg + (frames ? " @ " + frames : ""), "error");')
]

TARGETS = ["qnfo-research-exec/worker.js", "qnfo-research-exec/deployed-current.worker.js"]


def patch(path: str) -> None:
    src = open(path, encoding="utf-8").read()
    if MARK in src:
        print("skip %s (already patched)" % path)
        return
    out = re.sub(r'var VERSION = "[^"]+";', 'var VERSION = "%s";' % NEW_VER, src, count=1)
    if out == src:
        sys.exit("no VERSION line in %s" % path)
    out = out.replace('var VERSION = "%s";' % NEW_VER,
                      'var VERSION = "%s"; %s' % (NEW_VER, VER_NOTE), 1)
    for old, new in PAIRS:
        if out.count(old) != 1:
            sys.exit("anchor missing or ambiguous in %s: %r" % (path, old[:80]))
        out = out.replace(old, new, 1)
    open(path, "w", encoding="utf-8", newline="\n").write(out)
    print("patched %s -> %s" % (path, NEW_VER))


def main() -> int:
    for t in TARGETS:
        patch(t)
    return 0


if __name__ == "__main__":
    sys.exit(main())
