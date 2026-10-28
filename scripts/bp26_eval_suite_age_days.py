#!/usr/bin/env python3
"""BP26 eval_suite_age_days collector (2026-10-28, charter pillar research; catalogue item on eval-suite freshness).

eval_suite_age_days: whole days since the golden set was last refreshed (target <= 30). The only golden set the repository defines is qnfo-ai-search's
ask_golden table in qnfo-audit (refreshGolden inserts questions generated from papers, ASK-LOOP-1); a refresh is a row with a new added_at, so the age
is now minus MAX(added_at) over the COMPLETE questions (rtrim(question) LIKE '%?', the same filter the retrieval eval scores with, so an old fragment
does not count as a refresh). Limits: it covers the ask golden set only; qnfo-model-eval and qnfo-ai-calibration suites are not read. A refresh that
adds nothing (every candidate paper already has a question) leaves the age growing, which is what the metric should show. Unknown when the table is
unreadable or holds no complete question, never zero.

Offline suite: python3 scripts/bp26_eval_suite_age_days.py --selftest
"""
import datetime
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

SQL = "SELECT COUNT(*) AS n, MAX(added_at) AS newest FROM ask_golden WHERE rtrim(question) LIKE '%?'"


def _parse(s):
    s = str(s or "").strip().replace(" ", "T")
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        d = datetime.datetime.fromisoformat(s)
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=datetime.timezone.utc)


def collect_age(ctx):
    try:
        r = ctx.d1(SQL)
    except Exception as e:  # noqa: BLE001
        return [Result("eval_suite_age_days", None, "ask_golden unreadable: " + str(e)[:100], [])]
    n = int((r[0].get("n") if r else 0) or 0)
    newest = _parse(r[0].get("newest")) if r else None
    if not n or newest is None:
        return [Result("eval_suite_age_days", None, "ask_golden holds no complete question with a readable added_at: no refresh date exists", [])]
    now = getattr(ctx, "now", None) or datetime.datetime.now(datetime.timezone.utc).timestamp()
    age = max(0, int((now - newest.timestamp()) // 86400))
    note = ("%d day(s) since the newest complete ask_golden question was added (%s); %d complete questions; covers the ask golden set only"
            % (age, r[0].get("newest"), n))
    return [Result("eval_suite_age_days", age, note, [("ask_golden newest added_at", n, str(r[0].get("newest")))])]


COLLECTORS = [Collector("eval_suite_age", collect_age, ["eval_suite_age_days"], 55)]


def selftest():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE ask_golden (slug TEXT PRIMARY KEY, question TEXT, title TEXT, added_at TEXT)")
    c.executemany("INSERT INTO ask_golden VALUES (?,?,?,?)", [
        ("a", "What is X?", "t", "2026-09-01T00:00:00.000Z"),
        ("b", "What is Y?", "t", "2026-10-08T12:00:00.000Z"),
        ("c", "A truncated fragment with no end", "t", "2026-10-27T00:00:00.000Z")])

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, x)) for x in cur.fetchall()]

    class Ctx:
        pass
    ctx = Ctx()
    ctx.d1 = d1
    ctx.now = datetime.datetime(2026, 10, 28, tzinfo=datetime.timezone.utc).timestamp()
    fails = []

    def ok(cond, m):
        if not cond:
            fails.append(m)
            print("FAIL " + m)
    out = collect_age(ctx)[0]
    ok(out.value == 19, "newest complete question is 2026-10-08T12:00, 19 whole days; the newer fragment is ignored: %r" % (out,))
    c.execute("DELETE FROM ask_golden")
    ok(collect_age(ctx)[0].value is None, "empty table is unknown")
    c.execute("DROP TABLE ask_golden")
    ok(collect_age(ctx)[0].value is None, "missing table is unknown")
    print("bp26_eval_suite_age_days selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
