#!/usr/bin/env python3
"""dashboard-drift-failclosed-patch.py - DRIFT-FAILCLOSED-1 (issue #1301 residual).

WHY THIS EXISTS INSTEAD OF THE SIBLING APPLIER:
scripts/dashboard-gate-failopen-patch.py (rev 2, GATE-EVAL-METRIC-STALENESS-FAILOPEN-1)
is the single entry in applier-doctor's `errored` list. It cannot run any more because one
of its anchors -- the regVal() body -- was consumed by a DIFFERENT, competing applier
(STALE-GATE-FAILCLOSED-1, marker present x1, staleOf x4, cadenceMs x2) that landed the
FRESHNESS half of #1301 and deployed as 1.7.32-stale-gate-failclosed
(deployment_history id 152, status success). Its regVal anchor therefore matches 0 times,
it raises, and the DRIFT half of the same defect was never delivered.

VERIFIED STILL-LIVE RESIDUAL in qnfo-fleet-dashboard/worker.js on main (182,520 bytes):
  L2768  const driftBad = (ig.drift && ig.drift.ghost || 0) + ...   failed read coalesces to 0
  L2948  { m: "drift_total", live: String(driftBad || 0), head: c01(1 - (driftBad || 0)) }
  L2956  if (typeof x.head === "number") { ... }   a null gate is SKIPPED, its weight is
                                                   dropped from wsum, so MISSING DATA
                                                   RAISES the reported headroom
  L2974  collapsed greens renders (driftBad || 0) raw
  grep -c '(driftBad || 0)' = 2

This panel WRITES qnfo-audit.survival_state -- the SAI external_impact term -- so a
fail-open here does not merely mis-render a page, it mis-records the system's own
survival score.

DESIGN: NARROW. Only the drift / null-gate sites. Anchors taken from the CURRENT file.
Idempotency tested BEFORE matching (the rev-1 defect that duplicated a line). VERSION is
bumped so fleet-autodeploy (strictly-ahead) ships it.

FAIL-CLOSED: every edit must match EXACTLY ONCE; anything else raises and nothing is
written. IDEMPOTENT: re-running on an already-patched file is a no-op.

REV 2 (APPLIER-SELFPOSTCONDITION-1): rev 1 applied all six edits correctly -- proven by
  PRE grep '(driftBad || 0)' = 2 -> POST = 0 with `node --check` OK -- and then FAILED ITS
  OWN post-condition check, raising SystemExit and reporting rc=1. The check string was
  "nullGates += 1, wsum += w" (COMMA) while E4_NEW emits "nullGates += 1; wsum += w;"
  (SEMICOLON). The applier was therefore self-blocking: a correct patch never reached
  main, CI classified the traceback as stale-anchor/error, and the #1301 residual
  fail-open stayed live. A post-condition that can never pass is worse than no
  post-condition: it converts a working patch into a permanent silent failure. Fixed here,
  and the check now matches the emitted text byte-for-byte.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.path.join(ROOT, "qnfo-fleet-dashboard", "worker.js")
MIRROR = os.path.join(ROOT, "qnfo-fleet-dashboard", "deployed-current.worker.js")
MARK = "DRIFT-FAILCLOSED-1"

E1_OLD = '''  const driftBad = (ig.drift && ig.drift.ghost || 0) + (ig.drift && ig.drift.unregistered || 0) + (ig.drift && ig.drift.unversioned || 0);'''
E1_NEW = '''  // DRIFT-FAILCLOSED-1 (issue #1301 residual): a FAILED integration read must not
  // coalesce to 0. driftBad == null means "no readable drift signal"; every consumer
  // below then treats it as FAIL-CLOSED (head 0), never as perfect headroom.
  const driftBad = ig.drift ? ((ig.drift.ghost || 0) + (ig.drift.unregistered || 0) + (ig.drift.unversioned || 0)) : null;'''

E2_OLD = '''    { m: "drift_total", live: String(driftBad || 0), head: c01(1 - (driftBad || 0)) }'''
E2_NEW = '''    { m: "drift_total", live: driftBad == null ? "n/a" : String(driftBad), head: driftBad == null ? 0 : c01(1 - driftBad) }'''

E3_OLD = '''" err/24h &middot; drift total " + (driftBad || 0) + ' &middot; full green detail at'''
E3_NEW = '''" err/24h &middot; drift total " + (driftBad == null ? "n/a" : String(driftBad)) + ' &middot; full green detail at'''

E4_OLD = '''  let wnum = 0, wsum = 0;
  gateRows.forEach(function(x) {
    const w = gateW[x.m] != null ? gateW[x.m] : 0.1;
    const rmm = (mr || []).filter(function(y) { return y.metric === x.m; })[0];
    if (staleOf(rmm)) { wsum += w; return; }
    if (typeof x.head === "number") { wnum += w * x.head; wsum += w; }
  });'''
E4_NEW = '''  // GATE-EVAL-METRIC-STALENESS-FAILOPEN-1 (issue #1301): a gate with NO readable value
  // was SKIPPED, dropping its weight from wsum, so MISSING DATA RAISED the reported
  // headroom. A null gate is now counted as head 0: absent evidence is not health.
  let wnum = 0, wsum = 0, nullGates = 0;
  gateRows.forEach(function(x) {
    const w = gateW[x.m] != null ? gateW[x.m] : 0.1;
    const rmm = (mr || []).filter(function(y) { return y.metric === x.m; })[0];
    if (staleOf(rmm)) { wsum += w; return; }
    if (typeof x.head === "number") { wnum += w * x.head; wsum += w; }
    else { nullGates += 1; wsum += w; }
  });'''

E5_OLD = '''"weighted gate headroom x cost-efficiency = SAI external_impact (objectives.id=2 v2)").run();'''
E5_NEW = '''"weighted gate headroom x cost-efficiency = SAI external_impact (objectives.id=2 v2); FAIL-CLOSED #1301 null_gates=" + nullGates).run();'''

E6_OLD = '''var VERSION = "1.7.32-stale-gate-failclosed";'''
E6_NEW = '''var VERSION = "1.7.33-drift-failclosed";'''

EDITS = [
    ("version-bump", E6_OLD, E6_NEW),
    ("drift-read-null-safe", E1_OLD, E1_NEW),
    ("drift-gate-head", E2_OLD, E2_NEW),
    ("collapsed-greens-drift", E3_OLD, E3_NEW),
    ("null-gate-zero", E4_OLD, E4_NEW),
    ("record-null-gates", E5_OLD, E5_NEW),
]

# APPLIER-SELFPOSTCONDITION-1: post-conditions are asserted against the EXACT bytes the
# edits emit. A post-condition that cannot match its own edit is a self-blocking bug.
POST_CONDITIONS = {
    "no coalescing drift read left": lambda t: "(driftBad || 0)" not in t,
    "drift read is null-safe": lambda t: "const driftBad = ig.drift ? (" in t,
    "drift gate fails closed": lambda t: 'head: driftBad == null ? 0 : c01(1 - driftBad)' in t,
    "collapsed greens null-safe": lambda t: 'driftBad == null ? "n/a" : String(driftBad)' in t,
    "null gate counted as 0": lambda t: "nullGates += 1; wsum += w" in t,
    "survival note records null gates": lambda t: "FAIL-CLOSED #1301 null_gates=" in t,
    "marker present": lambda t: MARK in t,
    "version bumped": lambda t: 'var VERSION = "1.7.33-drift-failclosed";' in t,
}


def apply_edits(path):
    if not os.path.isfile(path):
        raise SystemExit("FAIL-CLOSED: missing artifact " + path)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    changed = False
    for label, old, new in EDITS:
        if new in text:
            print(" already applied: " + label)
            continue
        n = text.count(old)
        if n != 1:
            raise SystemExit("FAIL-CLOSED: edit '%s' matched %d times in %s" % (label, n, path))
        text = text.replace(old, new)
        changed = True
        print(" applied: " + label)
    if changed:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        print("patched " + path)
    else:
        print("already applied: " + path)
    return changed


def post_conditions(path):
    with open(path, encoding="utf-8") as fh:
        t = fh.read()
    checks = {k: fn(t) for k, fn in POST_CONDITIONS.items()}
    bad = [k for k, v in checks.items() if not v]
    for k, v in checks.items():
        print(" %-38s %s" % (k, "OK" if v else "FAIL"))
    if bad:
        raise SystemExit("FAIL-CLOSED: post-conditions failed: " + ", ".join(bad))
    print("POST_CONDITIONS_OK " + path)


def main():
    print("=== " + MARK + " rev2 ===")
    apply_edits(WORKER)
    post_conditions(WORKER)
    if os.path.isfile(MIRROR):
        apply_edits(MIRROR)
        post_conditions(MIRROR)
        with open(WORKER, "rb") as a, open(MIRROR, "rb") as b:
            if a.read() != b.read():
                raise SystemExit("FAIL-CLOSED: mirror parity violated (mirror-guard invariant)")
        print("MIRROR_PARITY_OK")
    else:
        print("no mirror present, skipping mirror parity: " + MIRROR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
