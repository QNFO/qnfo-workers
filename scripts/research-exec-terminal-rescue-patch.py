#!/usr/bin/env python3
"""RESEARCH-TERMINAL-RESCUE-1 (2026-09-29).

Root cause of the RESEARCH-TERMINAL cluster (open agent_issues; research_queue rows
stuck at status='failed', recover_count>=3, oldest created 2026-09-14):

  D1. markError()'s terminal branch (recover_count >= 3) sets status='failed' and
      returns. FAILED-REARM-1 (the only re-arm path) requires recover_count < 3, so a
      terminal row can NEVER be re-armed: the wedge is permanent by construction. The
      table already carries an UNUSED `terminal_rearms` column - the intended
      second-tier bound. Observed live: 19 rows, all recover_count=4,
      terminal_rearms=1, attempt=0 (the prior "un-wedge" reset nothing).

  D2. stageRevise() escalates to markError() on the FIRST short gateway output
      (absolute floor 1e4 chars against a 34e3-char input) with no retry, so one
      truncated generation permanently terminalises the row. Observed: 3 rows with
      "revise: output too short".

  D3. stageReconcile() has the same shape; a retry is added before its existing
      best-leg degrade path.

  D4. VERSION bump (VERSION-BUMP-1 / issue #1371) so the deploy is version-visible.

CONTEXT: issue #1448 removed the QNFO_AI-binding defect that produced the short
gw-fallback outputs feeding D2. This script fixes the wedge mechanism itself.

FAIL-CLOSED: every anchor must be present exactly once and every post-condition must
hold, else exit 1 without writing. IDEMPOTENT: marker-based; a re-run is a no-op.

Usage: python3 scripts/research-exec-terminal-rescue-patch.py [--check]
"""
import os
import re
import subprocess
import sys

MARKER = "TERMINAL-RESCUE-1"
REVISE_MARKER = "REVISE-RETRY-1"
RECONCILE_MARKER = "RECONCILE-RETRY-1"
NEW_VER = "0.9.22-terminal-rescue"

TARGETS = [
    "qnfo-research-exec/worker.js",
    "qnfo-research-exec/deployed-current.worker.js",
]

A_OLD = (
    "await env.QNFO_AUDIT.prepare(\"UPDATE research_queue SET status='failed', "
    "error=? WHERE id=?\").bind(String(msg).slice(0, 300), row.id).run();"
)

A_NEW = (
    "var _trArm = Number(row.terminal_rearms || 0);\n"
    "    if (_trArm < 2) {\n"
    "      await env.QNFO_AUDIT.prepare(\"UPDATE research_queue SET status='queued', stage='ground', error=?, recover_count=0, attempt=0, terminal_rearms=terminal_rearms+1, claimed_at=NULL WHERE id=?\").bind(String(msg).slice(0, 300), row.id).run();\n"
    "      try { await logEvent(env, \"terminal-rearm\", \"" + MARKER + " re-armed terminal row \" + String(row.id).slice(0, 8) + \" terminal_rearms=\" + (_trArm + 1), \"ok\"); } catch (eTR) {}\n"
    "      return;\n"
    "    }\n"
    "    await env.QNFO_AUDIT.prepare(\"UPDATE research_queue SET status='failed', error=? WHERE id=?\").bind(String(msg).slice(0, 300), row.id).run();"
)

B_OLD = (
    "  const revised = await gwCall(env, REVISE_PROMPT + \"\\n\\n\" + fixes.slice(0, 8e3) + \"\\n\\nPAPER:\\n\" + paper.slice(0, 34e3), 3e4);\n"
    "  if (!revised || revised.length < 1e4) {\n"
    "    await markError(env, row, \"revise: output too short\");"
)

B_NEW = (
    "  let revised = await gwCall(env, REVISE_PROMPT + \"\\n\\n\" + fixes.slice(0, 8e3) + \"\\n\\nPAPER:\\n\" + paper.slice(0, 34e3), 3e4);\n"
    "  if (!revised || revised.length < 1e4) {\n"
    "    // " + REVISE_MARKER + " (2026-09-29): one bounded retry before terminal escalation.\n"
    "    // The prior code escalated on the first short output: an absolute 1e4 floor with no\n"
    "    // retry permanently wedged the row (RESEARCH-TERMINAL cluster).\n"
    "    let _r2 = await gwCall(env, REVISE_PROMPT + \"\\n\\n\" + fixes.slice(0, 8e3) + \"\\n\\nPAPER:\\n\" + paper.slice(0, 34e3) + \"\\n\\nIMPORTANT: output the COMPLETE revised paper, start to finish. Do not summarize and do not truncate.\", 3e4);\n"
    "    if (_r2 && _r2.length > (revised ? revised.length : 0)) revised = _r2;\n"
    "  }\n"
    "  if (!revised || revised.length < 1e4) {\n"
    "    await markError(env, row, \"revise: output too short (\" + (revised ? revised.length : 0) + \" chars after retry)\");"
)

C_OLD = (
    "  const reconciled = await gwCall(env, RECONCILE_PROMPT + \"\\n\\n\" + parts.join(\"\\n\\n\"), 3e4);\n"
    "  if (!reconciled || reconciled.length < 1e4) {"
)

C_NEW = (
    "  let reconciled = await gwCall(env, RECONCILE_PROMPT + \"\\n\\n\" + parts.join(\"\\n\\n\"), 3e4);\n"
    "  if (!reconciled || reconciled.length < 1e4) {\n"
    "    // " + RECONCILE_MARKER + " (2026-09-29): one bounded retry before the best-leg degrade.\n"
    "    let _rc2 = await gwCall(env, RECONCILE_PROMPT + \"\\n\\n\" + parts.join(\"\\n\\n\") + \"\\n\\nIMPORTANT: output the COMPLETE reconciled paper in full. Do not summarize and do not truncate.\", 3e4);\n"
    "    if (_rc2 && _rc2.length > (reconciled ? reconciled.length : 0)) reconciled = _rc2;\n"
    "  }\n"
    "  if (!reconciled || reconciled.length < 1e4) {"
)

VPAT = re.compile(r'((?:var|const|let)\s+VERSION\s*=\s*")[^"]+(")')


def fail(msg):
    sys.stderr.write("::error file=qnfo-research-exec/worker.js::" + msg + "\n")
    raise SystemExit(1)


def apply_one(src, label):
    if MARKER in src and REVISE_MARKER in src and RECONCILE_MARKER in src:
        return src, False

    n = src.count(A_OLD)
    if n == 0:
        fail("RESCUE-ANCHOR-MISSING-1 D1 markError terminal UPDATE not found")
    if n > 1:
        fail("RESCUE-ANCHOR-AMBIGUOUS-1 D1 anchor occurs %d times" % n)
    src = src.replace(A_OLD, A_NEW, 1)
    if MARKER not in src:
        fail("RESCUE-POSTCOND-1 D1 marker absent after patch")
    if "terminal_rearms=terminal_rearms+1" not in src:
        fail("RESCUE-POSTCOND-1 D1 re-arm increment absent after patch")

    n = src.count(B_OLD)
    if n == 0:
        fail("RESCUE-ANCHOR-MISSING-1 D2 revise gate not found")
    if n > 1:
        fail("RESCUE-ANCHOR-AMBIGUOUS-1 D2 anchor occurs %d times" % n)
    src = src.replace(B_OLD, B_NEW, 1)
    if REVISE_MARKER not in src:
        fail("RESCUE-POSTCOND-1 D2 marker absent after patch")

    n = src.count(C_OLD)
    if n == 0:
        fail("RESCUE-ANCHOR-MISSING-1 D3 reconcile gate not found")
    if n > 1:
        fail("RESCUE-ANCHOR-AMBIGUOUS-1 D3 anchor occurs %d times" % n)
    src = src.replace(C_OLD, C_NEW, 1)
    if RECONCILE_MARKER not in src:
        fail("RESCUE-POSTCOND-1 D3 marker absent after patch")

    m = VPAT.search(src)
    if not m:
        fail("RESCUE-ANCHOR-MISSING-1 D4 VERSION literal not found")
    src = VPAT.sub(lambda mm: mm.group(1) + NEW_VER + mm.group(2), src, count=1)
    if NEW_VER not in src:
        fail("RESCUE-POSTCOND-1 D4 version bump absent after patch")

    if src.count("recover_count < 3") < 1:
        fail("RESCUE-POSTCOND-1 FAILED-REARM-1 bound was disturbed")

    return src, True


def node_check(path):
    r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
    if r.returncode != 0:
        fail("SYNTAX-ERROR-1 node --check failed on %s: %s" % (path, r.stderr.strip()[:300]))


def main():
    check_only = "--check" in sys.argv
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(repo)

    blobs = {}
    total_changed = 0
    for t in TARGETS:
        if not os.path.exists(t):
            fail("TARGET-MISSING-1 %s not found" % t)
        with open(t, "r", encoding="utf-8") as fh:
            src = fh.read()
        new, changed = apply_one(src, t)
        if changed:
            total_changed += 1
            if not check_only:
                with open(t, "w", encoding="utf-8") as fh:
                    fh.write(new)
            print("bytes: %d -> %d (%s)" % (len(src), len(new), t))
        else:
            print("already-patched: %s" % t)
        blobs[t] = new

    if len(set(blobs.values())) != 1:
        fail("PARITY-1 targets diverged after patch")

    if not check_only:
        for t in TARGETS:
            node_check(t)
        print("SYNTAX_OK")
    print("PARITY_OK")
    print("markers: %s=%d %s=%d %s=%d" % (
        MARKER, blobs[TARGETS[0]].count(MARKER),
        REVISE_MARKER, blobs[TARGETS[0]].count(REVISE_MARKER),
        RECONCILE_MARKER, blobs[TARGETS[0]].count(RECONCILE_MARKER)))
    print("version: " + NEW_VER)
    print("changed_files: %d" % total_changed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
