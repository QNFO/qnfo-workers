"""Offline sensitivity test for BREACH-TICKET-COVERAGE-1 (migrations/2026-10-18-breach-ticket-coverage.sql).

The view is the whole point of that migration: if its predicate is wrong, the second path for "a live breach must have
an open ticket" reads 0 while a gap exists, which is worse than not having it. This proves the predicate on synthetic
rows, including the cases that must NOT alarm (alert-routed trigger, ticket closed 10 minutes ago, open ticket present)
and the case that must (closed ticket 3 hours old, still breaching, no open ticket).

The view SQL is read out of the migration file, so the test cannot drift from what ships.
Run: python3 scripts/breach_ticket_coverage_test.py
"""
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MIGRATION = os.path.join(HERE, "..", "migrations", "2026-10-18-breach-ticket-coverage.sql")

passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + str(extra)[:400]))


text = open(MIGRATION, encoding="utf-8").read()
m = re.search(r"CREATE VIEW IF NOT EXISTS v_breaches_without_ticket AS\s*(.*?);\s*\n", text, re.S)
ok(bool(m), "the migration carries the view definition")
view_select = m.group(1) if m else "SELECT 1 WHERE 0"

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, updated_at INTEGER);
CREATE TABLE v_metric_trigger_state (id INTEGER, metric_key TEXT, val REAL, threshold REAL, hit INTEGER, queue_target TEXT);
""")
db.execute("CREATE VIEW v_breaches_without_ticket AS " + view_select)

MS = 1000
# minutes-ago -> the two formats the view tolerates
def ms_ago(minutes):
    now_s = int(db.execute("SELECT strftime('%s','now')").fetchone()[0])
    return (now_s - minutes * 60) * MS

def seed(rows, issues):
    db.execute("DELETE FROM agent_issues")
    db.execute("DELETE FROM v_metric_trigger_state")
    for r in rows:
        db.execute("INSERT INTO v_metric_trigger_state (id, metric_key, val, threshold, hit, queue_target) VALUES (?,?,?,?,?,?)", r)
    for t, status, mins in issues:
        db.execute("INSERT INTO agent_issues (title, status, updated_at) VALUES (?,?,?)", (t, status, ms_ago(mins)))

def count():
    return db.execute("SELECT COUNT(*) FROM v_breaches_without_ticket").fetchone()[0]

T = "METRIC-TRIGGER-{}-SOME-METRIC: a title"
TRIG = [(40, "some_metric", 9, 5, 1, "agent_issues")]

seed(TRIG, [(T.format(40), "closed", 180)])
ok(count() == 1, "a breach whose ticket has been closed for 3 hours is counted")

seed(TRIG, [(T.format(40), "closed", 10)])
ok(count() == 0, "a ticket closed 10 minutes ago is not counted (the reopener has not had a tick yet)")

seed(TRIG, [(T.format(40), "open", 5)])
ok(count() == 0, "an open ticket means the invariant holds")

seed([(40, "some_metric", 9, 5, 1, "alerts")], [(T.format(40), "closed", 180)])
ok(count() == 0, "an alert-routed trigger is out of scope (6123 shape)")

seed([(40, "some_metric", 9, 5, 0, "agent_issues")], [(T.format(40), "closed", 180)])
ok(count() == 0, "a recovered metric (hit=0) is not a live breach")

seed([(40, "some_metric", 9, 5, 1, "agent_issues"), (41, "other_metric", 9, 5, 1, "agent_issues")],
     [(T.format(40), "closed", 180), ("METRIC-TRIGGER-41-SOME-METRIC: a title", "open", 3)])
ok([r[0] for r in db.execute("SELECT trigger_id FROM v_breaches_without_ticket").fetchall()] == [40],
   "only the trigger with the gap is counted; a covered twin trigger is not")

# A breach that was never filed at all has no breach-start timestamp anywhere in v_metric_trigger_state, so no grace
# period can be applied to it; counting it would alarm on every new breach before the filer's first attempt. It is the
# reopener ledger's third bucket ("needs a title, not a reopen"), measured 0 for agent_issues-routed triggers on
# 2026-10-18 (the only such row was trigger 6123, which is alert-routed). Excluded here on purpose.
seed(TRIG, [])
ok(count() == 0, "a never-filed breach is out of scope (no breach-start timestamp to apply a grace period to)")

# seconds-era updated_at must not hide a gap (mixed-format history, sla_due_at 2026-10-18)
seed(TRIG, [(T.format(40), "closed", 0)])
db.execute("UPDATE agent_issues SET updated_at = CAST(strftime('%s','now','-3 hours') AS INTEGER)")
ok(count() == 1, "a seconds-era updated_at is still read as a 3-hour-old closure")

# two tickets, one open: still covered
seed(TRIG, [(T.format(40), "closed", 180), (T.format(40), "open", 2)])
ok(count() == 0, "a closed twin next to an open twin is covered, not a gap")

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
