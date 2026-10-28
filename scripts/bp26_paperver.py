#!/usr/bin/env python3
"""BP26-PAPER-PIDS-1 collector (2026-10-28, charter pillar research; agent_issues 1000338).

paper_version_immutability: 1 - (published paper versions whose body changed in place) / (published papers), from the living-paper
paper_change_ledger. A violation is a live (backfilled = 0) ledger row of the last 30 days where the paper was published, distributed or
external_preprint before the change, version_before = version_after, and body_fp_before differs from body_fp_after: the body changed and
the version did not, so a citation to that version now points at different text. Counted per distinct (slug, version).
PROXY, NOT THE METRIC'S FULL DEFINITION: the metric text says stored content hash versus the served body; no per-version content hash is
stored or served yet (that is the BP26-PAPER-PIDS-1 build: immutable version URLs, hashes, PID route), so this measures the write path
(a body edit without a version bump) and cannot see a body altered outside the ledger. Unknown when the ledger or papers table is
unreadable, never 1.0 by default. Evidence rows carry slug and version, no text.

Offline suite: python3 scripts/bp26_paperver.py --selftest
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

DB = "living-paper"
PUB = "('published', 'distributed', 'external_preprint')"
VIOL = ("SELECT DISTINCT slug, version_before AS version FROM paper_change_ledger WHERE backfilled = 0 AND kind = 'update' "
        "AND status_before IN " + PUB + " AND version_before IS NOT NULL AND version_before = version_after "
        "AND body_fp_before IS NOT NULL AND body_fp_after IS NOT NULL AND body_fp_before <> body_fp_after "
        "AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days') ORDER BY slug LIMIT 500")
TOTAL = "SELECT COUNT(*) AS n FROM papers WHERE status IN " + PUB


def collect_immutability(ctx):
    try:
        total = int((ctx.d1_db(DB, TOTAL) or [{}])[0].get("n") or 0)
        viol = ctx.d1_db(DB, VIOL)
    except Exception as e:  # noqa: BLE001
        return [Result("paper_version_immutability", None, "living-paper ledger unreadable: " + str(e)[:100], [])]
    if not total:
        return [Result("paper_version_immutability", None, "no published paper counted", [])]
    v = min(len(viol), total)
    ev = [("%s@%s" % (r["slug"], r["version"]), 0, "body changed in place under the same version") for r in viol[:40]]
    note = ("%d published version(s) had their body changed without a version bump in 30 days, of %d published papers (ledger write-path proxy: "
            "no per-version content hash is stored yet, so a body altered outside the ledger is not seen)" % (len(viol), total))
    return [Result("paper_version_immutability", round(1 - v / total, 4), note, ev)]


COLLECTORS = [Collector("paper_version_immutability", collect_immutability, ["paper_version_immutability"], 55)]


def selftest():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE papers (slug TEXT, status TEXT)")
    c.execute("CREATE TABLE paper_change_ledger (seq INTEGER PRIMARY KEY, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), slug TEXT, kind TEXT, backfilled INTEGER DEFAULT 0, "
              "status_before TEXT, version_before TEXT, version_after TEXT, body_fp_before TEXT, body_fp_after TEXT)")
    c.executemany("INSERT INTO papers VALUES (?,?)", [("a", "published"), ("b", "published"), ("c", "distributed"), ("d", "published"), ("e", "draft")])
    c.executemany("INSERT INTO paper_change_ledger (slug, kind, backfilled, status_before, version_before, version_after, body_fp_before, body_fp_after) VALUES (?,?,?,?,?,?,?,?)", [
        ("a", "update", 0, "published", "1.0", "1.0", "x", "y"),     # in-place edit: violation
        ("a", "update", 0, "published", "1.0", "1.0", "y", "z"),     # same version again: still one
        ("b", "update", 0, "published", "1.0", "1.1", "x", "y"),     # version bumped: fine
        ("c", "update", 1, "distributed", "1.0", "1.0", "x", "y"),   # backfilled: ignored
        ("d", "update", 0, "draft", "0.1", "0.1", "x", "y")])        # not yet published: fine

    def d1_db(name, sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, x)) for x in cur.fetchall()]

    class Ctx:
        pass
    ctx = Ctx()
    ctx.d1_db = d1_db
    fails = []

    def ok(cond, m):
        if not cond:
            fails.append(m)
            print("FAIL " + m)
    out = collect_immutability(ctx)[0]
    ok(out.value == 0.75 and out.rows[0][0] == "a@1.0" and len(out.rows) == 1, "one distinct violated version of 4 published papers: %r" % (out,))
    c.execute("DELETE FROM papers")
    ok(collect_immutability(ctx)[0].value is None, "no published papers: unknown")
    c.execute("DROP TABLE paper_change_ledger")
    ok(collect_immutability(ctx)[0].value is None, "missing ledger: unknown")
    print("bp26_paperver selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
