#!/usr/bin/env python3
"""cron-tick-5m-patch.py -- CRON-TICK-5M-1 (2026-10-19).

OWNER DIRECTIVE (2026-10-19)
  "ACCELERATE ALL SCHEDULED CRON EXECUTION. ALL CRON TICKS SHALL BE MEASURED IN
   5-MINUTE INTERVALS, AND NO CRON SHALL EXECUTE LESS THAN ONCE EVERY HOUR."

Three changes, all fail-closed on a missing/ambiguous anchor:

  1. qnfo-fleet-control: cronDrift healed a live trigger set ONLY when it was empty.
     fleet-exec declares */5 in wrangler.toml but ran */10 live, so the drift was
     reported on every sweep and never corrected -- the entire fleet ticked at 10
     minutes. The dispatcher is now healed whenever declared != live.
  2. fleet-exec: version bump so the applier redeploys it; raw_put.py then applies
     the declared ["*/5 * * * *"] to PUT /schedules (it only PUTs on deploy).
  3. scripts/cron_rate_guard.py: encode the new ceiling -- 5-minute spacing and
     288 fires/24h (was 10/144), producer floor 60 minutes (was 120).
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = "CRON-TICK-5M-1"
changed = []


def one(s, old, new):
    n = s.count(old)
    if n != 1:
        sys.exit("ANCHOR-AMBIGUOUS: expected 1 occurrence, found %d for %r" % (n, old[:70]))
    return s.replace(old, new, 1)


def rw(rel, fn):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        sys.exit("MISSING " + rel)
    s = open(p, encoding="utf-8").read()
    if MARK in s:
        return
    out = fn(s)
    if not out or out == s:
        sys.exit("ANCHOR-MISS " + rel)
    open(p, "w", encoding="utf-8").write(out)
    changed.append(rel)


def fc(s):
    s = one(
        s,
        'var NO_SELF = ["qnfo-fleet-deploy"];',
        'var NO_SELF = ["qnfo-fleet-deploy"];\n'
        '// CRON-TICK-5M-1 (2026-10-19): heal a declared trigger that differs from live for the\n'
        '// dispatcher too. Before, only an EMPTY live set was healed, so fleet-exec stayed on a stale\n'
        '// */10 while wrangler.toml declared */5 and the whole fleet ticked at 10 minutes forever.\n'
        'var CRON_EXACT_HEAL = ["fleet-exec"];',
    )
    s = one(
        s,
        'if (r.decl.length > 0 && r.live.length === 0) {',
        'if (r.decl.length > 0 && (r.live.length === 0 || (CRON_EXACT_HEAL.indexOf(r.n) >= 0 && ds !== ls))) {',
    )
    s = one(s, 'var VERSION = "0.34.1-publish-dispatch-fast";', 'var VERSION = "0.34.2-cron-tick-5m-1";')
    return s


def fe(s):
    return one(
        s,
        'var VERSION = "1.0.4-capability-contract";',
        'var VERSION = "1.0.5-cron-tick-5m-1"; // CRON-TICK-5M-1: redeploy so raw_put applies the declared */5 tick',
    )


def gd(s):
    s = one(s, 'MAX_FIRES_24H = 144', 'MAX_FIRES_24H = 288')
    s = one(s, 'MIN_GAP_MINUTES = 10', 'MIN_GAP_MINUTES = 5')
    s = one(s, 'PRODUCER_MAX_GAP_MINUTES = 120', 'PRODUCER_MAX_GAP_MINUTES = 60')
    s = one(
        s,
        'DAYS = 365',
        '# CRON-TICK-5M-1 (2026-10-19, owner directive): 5-minute spacing and 288 fires/24h are the\n'
        '# ceiling (was 10/144), and no cron may be slower than hourly (producer floor 120 -> 60).\n'
        'DAYS = 365',
    )
    return s


rw("qnfo-fleet-control/worker.js", fc)
rw("qnfo-fleet-control/deployed-current.worker.js", fc)
rw("fleet-exec/worker.js", fe)
rw("fleet-exec/deployed-current.worker.js", fe)
rw("scripts/cron_rate_guard.py", gd)

print("APPLIED " + ", ".join(changed) if changed else "ALREADY-APPLIED")
sys.exit(0)
