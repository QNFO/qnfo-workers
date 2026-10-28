#!/usr/bin/env python3
"""BP26-D1-DISCIPLINE-1 collector (2026-10-28, charter pillar core; agent_issues 1000349).

pre_migration_bookmark_recorded: of the migrations applied ok since the first one that recorded a D1 Time Travel bookmark
(scripts/apply_migrations.py writes migration_runs.bookmark before a file runs), the share that carries a bookmark. Runs before the
first recorded bookmark are excluded: they could not have one. Unknown (nothing written) until a bookmark exists or when the column
is not there yet, never 1.0 by default. Limits: it proves the bookmark was recorded, not that a restore from it works; that is the
restore drill (d1_restore_drill_age_days), still to build.

Offline suite: python3 scripts/bp26_d1.py --selftest
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

SQL = ("SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE(bookmark, '') <> '' THEN 1 ELSE 0 END) AS marked FROM migration_runs "
       "WHERE status = 'ok' AND id >= (SELECT MIN(id) FROM migration_runs WHERE COALESCE(bookmark, '') <> '') "
       "AND datetime(applied_at) >= datetime('now', '-30 days')")


def collect_bookmarks(ctx):
    try:
        rows = ctx.d1(SQL)
    except Exception as e:  # noqa: BLE001
        return [Result("pre_migration_bookmark_recorded", None, "migration_runs.bookmark unreadable (%s): the runner has not added it yet" % str(e)[:80], [])]
    r = rows[0] if rows else {}
    total, marked = int(r.get("total") or 0), int(r.get("marked") or 0)
    if not total:
        return [Result("pre_migration_bookmark_recorded", None, "no migration has recorded a Time Travel bookmark yet", [])]
    return [Result("pre_migration_bookmark_recorded", round(marked / total, 4),
                   "%d of %d migrations applied ok in 30 days since the first bookmark carry one" % (marked, total),
                   [("migrations with a bookmark", marked, "of %d" % total)])]


COLLECTORS = [Collector("d1_bookmark_recorded", collect_bookmarks, ["pre_migration_bookmark_recorded"], 50)]


def selftest():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE migration_runs (id INTEGER PRIMARY KEY, status TEXT, bookmark TEXT, applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))")

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, x)) for x in cur.fetchall()]

    class Ctx:
        pass
    ctx = Ctx()
    ctx.d1 = d1
    fails = []

    def ok(cond, msg):
        if not cond:
            fails.append(msg)
            print("FAIL " + msg)
    ok(collect_bookmarks(ctx)[0].value is None, "no runs: unknown")
    c.execute("INSERT INTO migration_runs (status, bookmark) VALUES ('ok', NULL)")
    ok(collect_bookmarks(ctx)[0].value is None, "runs without any bookmark: unknown, not 1.0")
    c.execute("INSERT INTO migration_runs (status, bookmark) VALUES ('ok', 'bm1')")
    c.execute("INSERT INTO migration_runs (status, bookmark) VALUES ('ok', '')")
    c.execute("INSERT INTO migration_runs (status, bookmark) VALUES ('error', NULL)")
    out = collect_bookmarks(ctx)[0]
    ok(out.value == 0.5, "the run before the first bookmark and the failed run are excluded: %r" % (out,))
    c.execute("DROP TABLE migration_runs")
    ok(collect_bookmarks(ctx)[0].value is None, "missing table: unknown")
    print("bp26_d1 selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
