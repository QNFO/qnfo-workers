#!/usr/bin/env python3
"""BP26 provenance_marking_coverage collector (2026-10-28, charter pillar research; agent_issues predicate BP26-PROVENANCE-MARKING).

provenance_marking_coverage: generated assets published since 2026-08-02 with a valid C2PA manifest or a signed sidecar that verifies / all such assets.
STATE: NO SOURCE EXISTS. The catalogue entry itself records "no signed manifest or sidecar yet" (q08.org JSON-LD carries creditText only), and the
repository holds no provenance ledger table, no manifest or sidecar column and no asset-publication registry (the only c2pa mentions are Cloudflare's
bridge-pack tag). Inventing a table or counting JSON-LD creditText as a signature would manufacture a number, so this collector returns UNKNOWN (None)
and names the missing source. It reads qnfo-audit's catalogue once to see whether a ledger has appeared (a table named like provenance_ledger or
asset_provenance); when one does, the note says so and the collector still returns None until someone writes the verifying query against its real
columns. Unknown, never zero: 0 would claim "all assets unmarked" with no asset list to count.

Offline suite: python3 scripts/bp26_provenance_marking_coverage.py --selftest
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

SQL = ("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%provenance%' OR name LIKE '%c2pa%' OR name LIKE '%asset_manifest%') ORDER BY name LIMIT 20")
MISSING = ("no source: no asset-publication registry and no C2PA manifest or signed-sidecar verification record exists in qnfo-audit "
           "(catalogue state 2026-10-26: no signed manifest or sidecar yet)")


def collect_coverage(ctx):
    try:
        names = [str(r.get("name")) for r in ctx.d1(SQL)]
    except Exception as e:  # noqa: BLE001
        return [Result("provenance_marking_coverage", None, MISSING + "; catalogue unreadable: " + str(e)[:80], [])]
    if names:
        return [Result("provenance_marking_coverage", None, "candidate table(s) now exist (%s) but no verifying query is written against their columns; " % ", ".join(names[:5]) + MISSING.split(": ", 1)[0], [])]
    return [Result("provenance_marking_coverage", None, MISSING, [])]


COLLECTORS = [Collector("provenance_marking", collect_coverage, ["provenance_marking_coverage"], 55)]


def selftest():
    c = sqlite3.connect(":memory:")

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
    out = collect_coverage(ctx)[0]
    ok(out.value is None and "no source" in out.note, "no ledger: unknown with the missing source named: %r" % (out,))
    c.execute("CREATE TABLE asset_provenance (id INTEGER)")
    out = collect_coverage(ctx)[0]
    ok(out.value is None and "asset_provenance" in out.note, "a candidate table is named but the value stays unknown: %r" % (out,))
    print("bp26_provenance_marking_coverage selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
