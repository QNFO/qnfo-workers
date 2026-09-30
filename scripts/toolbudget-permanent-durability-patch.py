#!/usr/bin/env python3
"""TOOLBUDGET-PERMANENT-1 -- make the tool-budget remediation durable fleet-wide.

MEASURED 2026-09-30. The tool-budget canonical build (MAX_TOOL_ITERS=40,
BUDGET_EXHAUSTED_DIRECTIVE, CONTINUE_DIRECTIVE + FUTURE_WORK_RE) is committed as
qnfo-ops/worker.js VERSION 2.38.0-toolbudget-canonical, but the remediation was NOT
durable and NOT live:

  A1  qnfo-ops/worker.js (381117 B, VERSION 2.38.0-toolbudget-canonical) !=
      qnfo-ops/deployed-current.worker.js (378404 B, VERSION 2.37.31-continuation-inherit).
      The canonical/redeploy route reads the MIRROR, so every redeploy silently
      REVERTS the tool-budget fix two versions back. Live /health is 2.37.31 on both
      qnfo-ops.q08.workers.dev and ops.qnfo.org while the ledger's last deploy is
      2.37.32 -- the revert is observable, not hypothetical.
  A2  scripts/mirror-guard.py cannot repair it: an import-using source lands in
      CONTENT-DIFF-REVIEW ("report only"), so the scheduled mirror-sync can never
      restore qnfo-ops parity (issue #1513).
  A3  qnfo-ops/scripts/guard-timebudget.sh asserted only the deadline default and the
      absence of the old panic stub, so 3 of the 4 landed tool-budget fixes could
      regress with CI still green (issue #1515).

FAIL-CLOSED: every edit is computed first; if any anchor is missing or ambiguous
nothing is written and the script exits 1. IDEMPOTENT: a second run is a no-op, so
apply-pending-patches.py can run this on every push and parity self-heals.

Marker: TOOLBUDGET-PERMANENT-1
"""
import os
import re
import shutil
import sys
from pathlib import Path

MARK = "TOOLBUDGET-PERMANENT-1"
MG_MARK = "MIRROR-GUARD-IMPORT-BLINDSPOT-1"
GUARD_MARK = "GUARD-TIMEBUDGET-COVERAGE-GAP-1"
MIN_SRC_BYTES = 100000
REQUIRED_MARKERS = ("BUDGET_EXHAUSTED_DIRECTIVE", "var MAX_TOOL_ITERS = ", "OPS_LOOP_DEADLINE_MS")


def repo_root() -> Path:
    for cand in (os.environ.get("REPO_ROOT"), os.environ.get("GITHUB_WORKSPACE"), "."):
        if not cand:
            continue
        p = Path(cand).resolve()
        if (p / "scripts").is_dir():
            return p
    return Path(".").resolve()


R = repo_root()
notes, edits, fails = [], [], []

# ---------------- A1: mirror parity (drift-driven, re-runs every CI pass) ----------------
src_p = R / "qnfo-ops/worker.js"
mir_p = R / "qnfo-ops/deployed-current.worker.js"
if not src_p.is_file():
    fails.append("A1 qnfo-ops/worker.js missing")
else:
    src_bytes = src_p.read_bytes()
    if len(src_bytes) < MIN_SRC_BYTES:
        fails.append("A1 source implausibly small (%d B)" % len(src_bytes))
    src_txt = src_bytes.decode("utf-8", "replace")
    for need in REQUIRED_MARKERS:
        if need not in src_txt:
            fails.append("A1 source lacks tool-budget marker %r - refusing to propagate" % need)
    if not mir_p.is_file():
        fails.append("A1 mirror qnfo-ops/deployed-current.worker.js missing")
    elif not fails:
        if src_bytes != mir_p.read_bytes():
            edits.append(("A1", mir_p, src_bytes))
            notes.append("A1 mirror parity RESTORED: deployed-current <- worker.js (%d B)" % len(src_bytes))
        else:
            notes.append("A1 mirror parity already byte-identical")

# ---------------- A2: mirror-guard.py import blindspot (issue #1513) ----------------
mg_p = R / "scripts/mirror-guard.py"
BLOCK_RE = re.compile(
    r'(\n[ \t]*if is_import_free\(src_p\):\n'
    r'[ \t]*content_drift\.append\(name\)\n'
    r'[ \t]*drift\.append\(name\)\n'
    r'[ \t]*rows\.append\(\(name, "CONTENT-DRIFT", "sha=%s" % hs\[:12\], "sha=%s" % hm\[:12\]\)\)\n'
    r'[ \t]*if fix:\n'
    r'[ \t]*shutil\.copyfile\(src_p, mir_p\)\n'
    r'[ \t]*fixed\.append\(name\)\n'
    r'[ \t]*else:\n'
    r'[ \t]*review\.append\(name\)\n'
    r'[ \t]*rows\.append\(\(name, "CONTENT-DIFF-REVIEW", "import-using source - report only", "sha=%s" % hm\[:12\]\)\)\n)'
)
if not mg_p.is_file():
    fails.append("A2 scripts/mirror-guard.py missing")
else:
    mg = mg_p.read_text(encoding="utf-8")
    if MG_MARK in mg:
        notes.append("A2 mirror-guard import blindspot already patched")
    else:
        hits = BLOCK_RE.findall(mg)
        if len(hits) != 1:
            fails.append("A2 anchor not unique (n=%d) - fail-closed" % len(hits))
        else:
            new_block = (
                '\n            # %s (2026-09-30, issue #1513): an import-using source is a bundle\n'
                '            # INPUT, not a plain deployable, so the previous rule left it report-only and\n'
                '            # the scheduled mirror-sync could NEVER repair qnfo-ops parity. This branch is\n'
                '            # only reached when the source and mirror carry the SAME version constant, so the\n'
                '            # mirror is not version-ahead; worker.js is the source of truth and the canonical\n'
                '            # deploy reads the mirror, so a byte-divergent version-equal pair silently reverts\n'
                '            # the source. Repair it when the source is at least as large as the mirror (a stale\n'
                '            # same-version build is smaller; a mirror-ahead hotfix is larger and is left alone).\n'
                '            if is_import_free(src_p) or os.path.getsize(src_p) >= os.path.getsize(mir_p):\n'
                '                content_drift.append(name)\n'
                '                drift.append(name)\n'
                '                rows.append((name, "CONTENT-DRIFT-IMPORT-SOT", "sha=%%s" %% hs[:12], "sha=%%s" %% hm[:12]))\n'
                '                if fix:\n'
                '                    shutil.copyfile(src_p, mir_p)\n'
                '                    fixed.append(name)\n'
                '            else:\n'
                '                review.append(name)\n'
                '                rows.append((name, "CONTENT-DIFF-REVIEW", "import-using source - mirror larger - report only", "sha=%%s" %% hm[:12]))\n'
            ) % MG_MARK
            edits.append(("A2", mg_p, BLOCK_RE.sub(lambda _m: new_block, mg, count=1)))
            notes.append("A2 mirror-guard.py: version-equal import-source drift is now auto-repairable")

# ---------------- A3: guard-timebudget.sh coverage (issue #1515) ----------------
g_p = R / "qnfo-ops/scripts/guard-timebudget.sh"
GUARD_ANCHOR = 'if [ "$FAIL" -eq 0 ]; then echo "GUARD PASS"; else echo "GUARD FAIL"; fi'
if not g_p.is_file():
    fails.append("A3 qnfo-ops/scripts/guard-timebudget.sh missing")
else:
    g = g_p.read_text(encoding="utf-8")
    if GUARD_MARK in g:
        notes.append("A3 guard coverage already extended")
    else:
        n = g.count(GUARD_ANCHOR)
        if n != 1:
            fails.append("A3 guard anchor not unique (n=%d) - fail-closed" % n)
        else:
            add = (
                '# %s (2026-09-30, issue #1515): the guard asserted only the deadline default and the\n'
                '# absence of the old panic stub, so 3 of the 4 landed tool-budget fixes could regress with\n'
                '# CI still green. Assert every invariant TOOLBUDGET-CANONICAL-1 relies on.\n'
                'for f in worker.js deployed-current.worker.js; do\n'
                '  if ! grep -q \'var MAX_TOOL_ITERS = 40;\' "$DIR/$f"; then\n'
                '    echo "FAIL: MAX_TOOL_ITERS is not the canonical 40 in $f (TOOLBUDGET-CANONICAL-1)"; FAIL=1\n'
                '  fi\n'
                '  if ! grep -q \'BUDGET_EXHAUSTED_DIRECTIVE\' "$DIR/$f"; then\n'
                '    echo "FAIL: BUDGET_EXHAUSTED_DIRECTIVE missing from $f (final-round directive)"; FAIL=1\n'
                '  fi\n'
                '  if ! grep -q \'CONTINUE_DIRECTIVE\' "$DIR/$f"; then\n'
                '    echo "FAIL: CONTINUE_DIRECTIVE missing from $f (BUDGET-AUTO-CONTINUE-1)"; FAIL=1\n'
                '  fi\n'
                '  if ! grep -q \'FUTURE_WORK_RE\' "$DIR/$f"; then\n'
                '    echo "FAIL: FUTURE_WORK_RE missing from $f (future-work prose detector)"; FAIL=1\n'
                '  fi\n'
                '  if ! grep -q \'const withTools = iter < maxIters && !deadlineHit;\' "$DIR/$f"; then\n'
                '    echo "FAIL: withTools budget predicate missing from $f (chat tool loop)"; FAIL=1\n'
                '  fi\n'
                '  if ! grep -q \'ops_tool_budget_bail\' "$DIR/$f"; then\n'
                '    echo "FAIL: ops_tool_budget_bail event missing from $f (budget-bail observability)"; FAIL=1\n'
                '  fi\n'
                'done\n'
            ) % GUARD_MARK
            edits.append(("A3", g_p, g.replace(GUARD_ANCHOR, add + GUARD_ANCHOR, 1)))
            notes.append("A3 guard-timebudget.sh: now asserts all 4 tool-budget invariants")

for n in notes:
    print("NOTE    " + n)
if fails:
    for f in fails:
        print("FAIL    " + f)
    print("FAIL-CLOSED: no file written")
    sys.exit(1)
for tag, path, content in edits:
    if isinstance(content, bytes):
        path.write_bytes(content)
    else:
        path.write_text(content, encoding="utf-8")
    print("CHANGED %s %s" % (tag, path.name))
print("%s ok (edits=%d)" % (MARK, len(edits)))
sys.exit(0)
