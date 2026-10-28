#!/usr/bin/env python3
"""BP26 collector for correction_latency_p95_h (2026-10-28, charter pillar research).

Definition: p95 hours from error detection (audit fail, erratum, reader report confirmed) to a published correction or retraction notice,
last 30 days; target <= 24. PROXY, labelled in the note: the errata pipeline is the only ledger with both ends. Detection = errata_queue.created_at;
published = errata_actions.updated_at of an action whose status is 'published' or 'verified' (queue_id joins errata_queue.id) and which was
updated in the last 30 days. Limits: (1) 'verified' rows have had updated_at rewritten by the verify step, so their latency is an upper bound;
(2) errata still unpublished are not in the sample (censored), which understates the true p95; (3) reader reports and q08/companion retractions
are not joined. p95 is nearest-rank. Unknown (None) when the tables cannot be read or the window holds no resolved erratum, never zero.

Offline suite: python3 scripts/bp26_corrections.py --selftest
"""
import math
import os
import sqlite3
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

SQL = ("SELECT a.id AS id, q.created_at AS detected, a.updated_at AS published, a.status AS status FROM errata_actions a "
       "JOIN errata_queue q ON q.id = a.queue_id WHERE a.status IN ('published', 'verified') "
       "AND datetime(a.updated_at) >= datetime('now', '-30 days') ORDER BY a.id DESC LIMIT 2000")
LABEL = "PROXY (errata_queue.created_at -> errata_actions.updated_at; unpublished errata excluded, verified rows upper-bound)"


def _ts(s):
    return datetime.fromisoformat(str(s).replace("T", " ").replace("Z", "")[:19])


def collect_latency(ctx):
    try:
        rows = ctx.d1(SQL)
    except Exception as e:  # noqa: BLE001
        return [Result("correction_latency_p95_h", None, "errata_queue/errata_actions unreadable: " + str(e)[:100], [])]
    lat = []
    for r in rows:
        try:
            h = (_ts(r["published"]) - _ts(r["detected"])).total_seconds() / 3600.0
            if h >= 0:
                lat.append((h, r["id"], r["status"]))
        except Exception:  # noqa: BLE001
            continue
    if not lat:
        return [Result("correction_latency_p95_h", None, "no resolved erratum in the last 30 days (or timestamps unparsable); " + LABEL, [])]
    lat.sort()
    k = max(1, math.ceil(0.95 * len(lat)))
    p95 = round(lat[k - 1][0], 2)
    ev = [("errata_action:%s" % i, h <= 24, "%.1f h (%s)" % (h, s)) for h, i, s in sorted(lat, reverse=True)[:20]]
    return [Result("correction_latency_p95_h", p95, "p95 of %d resolved errata = %s h; %s" % (len(lat), p95, LABEL), ev)]


COLLECTORS = [Collector("correction_latency", collect_latency, ["correction_latency_p95_h"], 60)]


def selftest():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE errata_queue (id INTEGER PRIMARY KEY, created_at TEXT)")
    c.execute("CREATE TABLE errata_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, queue_id INTEGER, status TEXT, updated_at TEXT)")
    for i in range(1, 21):  # 20 errata, latencies 1..20 h
        c.execute("INSERT INTO errata_queue VALUES (?, datetime('now', ?))", (i, "-%d hours" % (i + 1)))
        c.execute("INSERT INTO errata_actions (queue_id, status, updated_at) VALUES (?, 'published', datetime('now', '-1 hours'))", (i,))
    c.execute("INSERT INTO errata_queue VALUES (99, datetime('now', '-9 days'))")  # unresolved: excluded
    c.execute("INSERT INTO errata_actions (queue_id, status, updated_at) VALUES (99, 'routed', datetime('now'))")

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, x)) for x in cur.fetchall()]

    class Ctx:
        pass
    ctx = Ctx()
    ctx.d1 = d1
    fails = []

    def ok(cond, m):
        if not cond:
            fails.append(m)
            print("FAIL " + m)
    out = collect_latency(ctx)[0]
    ok(out.value is not None and 18.9 <= out.value <= 19.1 and "PROXY" in out.note, "p95 of 1..20 h is 19 (nearest rank): %r" % (out,))
    c.execute("DELETE FROM errata_actions")
    ok(collect_latency(ctx)[0].value is None, "empty window is unknown, not 0")
    c.execute("DROP TABLE errata_actions")
    ok(collect_latency(ctx)[0].value is None, "unreadable table is unknown")
    print("bp26_corrections selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
