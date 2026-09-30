#!/usr/bin/env python3
"""SELFHEAL-WRITEBACK-CLOSE-1 (2026-09-30, qnfo-ops).

Closes the orphaned-ledger defect measured live on 2026-09-30.

D1 (#1511) ORPHANED-DISPATCH-ROW.  qnfo-fleet-dashboard dispatchIssue()
   INSERTs a self_heal_actions row at status='dispatched' under a dedupe guard
   (WHERE NOT EXISTS ... status='dispatched'), and execOne() records the outcome
   as a NEW 'fleet-execute' row keyed by the same ref.  Nothing ever transitions
   the original row, so every auto-dispatched fleet issue is orphaned at
   'dispatched' forever -- and the dedupe guard then blocks re-insertion, so the
   ledger both lies and stops recording.  Measured 2026-09-30T07:30Z: 6 such
   rows, all with verified counterparts in the same cycle.
   Fix: execOne transitions the paired row in place after writing its receipt.

D2 NODE-BUDGET DETECT-ONLY.  qnfo-fleet-control records a budget overage at
   status='detected' under a 30-minute throttle with no close-out path, so
   detections accumulate with no lifecycle.
   Fix: (a) a new detection cycle resolves the detections it supersedes;
   (b) when no class is over cap, open detections are resolved.

Mirrors to deployed-current.worker.js where present (mirror-guard parity).
Fail-closed: exits 1 on a missing anchor (the transactional applier then reverts
every write).  Idempotent: a second run is a no-op.
"""
import os
import re
import sys

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
MARK = "SELFHEAL-WRITEBACK-CLOSE-1"

DASH = [os.path.join(ROOT, "qnfo-fleet-dashboard", "worker.js"),
        os.path.join(ROOT, "qnfo-fleet-dashboard", "deployed-current.worker.js")]
CTRL = [os.path.join(ROOT, "qnfo-fleet-control", "worker.js"),
        os.path.join(ROOT, "qnfo-fleet-control", "deployed-current.worker.js")]

DASH_A = ('await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, verified_at) '
          'VALUES (?,?,?,?,?,?)").bind("fleet-execute", row.fingerprint, "[" + state2 + "] " + (spec && spec.note || ""), '
          'now, state2, now).run();')
DASH_A_ADD = ('\n        await env.AUDIT.prepare("UPDATE self_heal_actions SET status=?1, verified_at=?2, '
              'claim=COALESCE(claim,?3), confidence=COALESCE(confidence,\'high\') WHERE kind=\'fleet-issue\' AND ref=?4 '
              'AND status=\'dispatched\'").bind(state2, now, "SELFHEAL-WRITEBACK-CLOSE-1: closed by paired fleet-execute receipt", '
              'row.fingerprint).run();')

DASH_B = ('await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, verified_at) '
          'VALUES (?,?,?,?,?,?)").bind("fleet-execute", row.fingerprint, "[" + state + "] " + spec.note + " :: " + '
          'body.slice(0, 200), now, state, now).run();')
DASH_B_ADD = ('\n      await env.AUDIT.prepare("UPDATE self_heal_actions SET status=?1, verified_at=?2, '
              'claim=COALESCE(claim,?3), confidence=COALESCE(confidence,\'high\') WHERE kind=\'fleet-issue\' AND ref=?4 '
              'AND status=\'dispatched\'").bind(state, now, "SELFHEAL-WRITEBACK-CLOSE-1: closed by paired fleet-execute receipt", '
              'row.fingerprint).run();')

CTRL_A = ('var recent = await env.AUDIT.prepare("SELECT COUNT(*) n FROM self_heal_actions WHERE kind=\'node-budget\' '
          'AND ts > datetime(\'now\',\'-30 minutes\')").first();')
CTRL_A_ADD = ('await env.AUDIT.prepare("UPDATE self_heal_actions SET status=\'resolved\', verified_at=datetime(\'now\'), '
              'claim=COALESCE(claim,\'SELFHEAL-WRITEBACK-CLOSE-1: superseded by a newer budget detection cycle\'), '
              'confidence=COALESCE(confidence,\'high\') WHERE kind=\'node-budget\' AND status=\'detected\'").run();\n        ')

CTRL_B = ('    if (out.over.length) {\n      out.note = "BUDGET-OVER " + out.over.join("; ");')
CTRL_B_ADD = ('    if (!out.over.length) {\n      try {\n'
              '        await env.AUDIT.prepare("UPDATE self_heal_actions SET status=\'resolved\', verified_at=datetime(\'now\'), '
              'claim=COALESCE(claim,\'SELFHEAL-WRITEBACK-CLOSE-1: budget back under cap, detection resolved\'), '
              'confidence=COALESCE(confidence,\'high\') WHERE kind=\'node-budget\' AND status=\'detected\'").run();\n'
              '      } catch (e) {\n      }\n    }\n'
              '    if (out.over.length) {\n      out.note = "BUDGET-OVER " + out.over.join("; ");')


def bump_ver(src):
    m = re.search(r'var VERSION = "([^"]+)";', src)
    if not m:
        return src, 0
    cur = m.group(1)
    if cur.endswith("-writeback1"):
        return src, 0
    return re.sub(r'var VERSION = "[^"]+";', 'var VERSION = "%s-writeback1";' % cur, src, count=1), 1


def patch_dash(path):
    if not os.path.exists(path):
        return 0
    src = open(path, encoding="utf-8").read()
    if MARK in src:
        print("ALREADY-PATCHED %s" % path)
        return 0
    if DASH_A not in src or DASH_B not in src:
        print("ANCHOR-MISS dashboard execOne receipt in %s -- refusing to guess" % path)
        return -1
    orig = src
    src = src.replace(DASH_A, DASH_A + DASH_A_ADD, 1)
    src = src.replace(DASH_B, DASH_B + DASH_B_ADD, 1)
    if src.count("SELFHEAL-WRITEBACK-CLOSE-1") < 2:
        print("POST-STATE-FAIL %s" % path)
        return -1
    src, k = bump_ver(src)
    if src == orig:
        print("NO-OP %s" % path)
        return 0
    open(path, "w", encoding="utf-8").write(src)
    print("PATCHED %s (3 edits)" % path)
    return 3


def patch_ctrl(path):
    if not os.path.exists(path):
        return 0
    src = open(path, encoding="utf-8").read()
    if MARK in src:
        print("ALREADY-PATCHED %s" % path)
        return 0
    if CTRL_A not in src or CTRL_B not in src:
        print("ANCHOR-MISS control budget block in %s -- refusing to guess" % path)
        return -1
    orig = src
    src = src.replace(CTRL_A, CTRL_A_ADD + CTRL_A, 1)
    src = src.replace(CTRL_B, CTRL_B_ADD, 1)
    if src.count("SELFHEAL-WRITEBACK-CLOSE-1") < 2:
        print("POST-STATE-FAIL %s" % path)
        return -1
    src, k = bump_ver(src)
    if src == orig:
        print("NO-OP %s" % path)
        return 0
    open(path, "w", encoding="utf-8").write(src)
    print("PATCHED %s (3 edits)" % path)
    return 3


def main():
    total = 0
    for t in DASH:
        r = patch_dash(t)
        if r < 0:
            print("FAIL-CLOSED %s" % t)
            return 1
        total += r
    for t in CTRL:
        r = patch_ctrl(t)
        if r < 0:
            print("FAIL-CLOSED %s" % t)
            return 1
        total += r
    print("TOTAL_EDITS %d" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
