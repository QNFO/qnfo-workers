#!/usr/bin/env python3
"""BP26-LEASES-KILLSWITCH-1 collector (2026-10-28, charter pillar autonomy; agent_issues 1000361).

orphaned_leases: rows of qnfo-audit.work_claims past expires_at and not released (the metric's own definition). A lapsed claim blocks
nothing (the endpoint ignores expired rows) but it records work that stopped without a release, so the count is the number of claims
abandoned by TTL; the evidence lists holder prefix, path and age, never a token. Limits: it covers the work-claim ledger only, not
Durable Object leases (none exist yet) and not the circuit-breaker or kill-switch tests (kill_switch_test_age_days). Unknown when the
table cannot be read, never zero.

Offline suite: python3 scripts/bp26_leases.py --selftest
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

SQL = ("SELECT id, path, substr(holder, 1, 40) AS holder, expires_at FROM work_claims "
       "WHERE released_at IS NULL AND datetime(expires_at) < datetime('now') ORDER BY expires_at LIMIT 500")


def collect_orphans(ctx):
    try:
        rows = ctx.d1(SQL)
    except Exception as e:  # noqa: BLE001
        return [Result("orphaned_leases", None, "work_claims unreadable: " + str(e)[:100], [])]
    ev = [("claim:%s" % r["id"], None, "%s on %s expired %s, never released" % (r["holder"], r["path"], r["expires_at"])) for r in rows[:40]]
    note = ("%d work claim(s) past expires_at and not released (work_claims ledger; Durable Object leases do not exist yet)" % len(rows)
            + ("; the list is capped at 500" if len(rows) >= 500 else ""))
    return [Result("orphaned_leases", len(rows), note, ev)]


COLLECTORS = [Collector("work_claim_orphans", collect_orphans, ["orphaned_leases"], 50)]


def selftest():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE work_claims (id INTEGER PRIMARY KEY, path TEXT, holder TEXT, expires_at TEXT, released_at TEXT)")
    c.executemany("INSERT INTO work_claims (path, holder, expires_at, released_at) VALUES (?,?,?,?)", [
        ("file:a", "s1", "2020-01-01T00:00:00Z", None),
        ("file:b", "s2", "2020-01-01T00:00:00Z", "2020-01-01T01:00:00Z"),
        ("file:c", "s3", "2999-01-01T00:00:00Z", None)])

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
    out = collect_orphans(ctx)[0]
    ok(out.value == 1 and out.rows[0][0] == "claim:1", "one expired unreleased claim: %r" % (out,))
    c.execute("DROP TABLE work_claims")
    ok(collect_orphans(ctx)[0].value is None, "unreadable table is unknown")
    print("bp26_leases selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
