#!/usr/bin/env python3
"""Offline test for scripts/headerless_migration_audit.py (MIGRATION-HEADERLESS-AUDIT-1, agent_issues 100056).

Synthetic migration files and a synthetic schema snapshot. Proves each class: applied-live (every created object, added column
or dropped-and-absent object checked), partial, unapplied, obsolete (a later file drops the object; rows written only to a table
that no longer exists), rows-only (a WITH ... INSERT counts as a write), other-db (a "-- DB:" line and the OTHER_DB map), the
emitted SELECTs are read-only and name only what the files touch, the audit changes no file, and the real allowlist on main
parses to files that exist.
Run: python3 scripts/headerless_migration_audit_test.py   (prints "N passed, 0 failed")
"""
import hashlib
import os
import re
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import headerless_migration_audit as A  # noqa: E402
import apply_migrations as M  # noqa: E402

passed = failed = 0


def ok(cond, msg, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + msg + ((" :: " + str(extra)[:300]) if extra is not None else ""))


FILES = {
    "2026-01-01-live.sql": "CREATE TABLE IF NOT EXISTS t_live (a TEXT);\nCREATE INDEX IF NOT EXISTS idx_t_live ON t_live(a);\nALTER TABLE t_other ADD COLUMN extra TEXT;\n",
    "2026-01-02-partial.sql": "CREATE TABLE IF NOT EXISTS t_half (a TEXT);\nCREATE INDEX IF NOT EXISTS idx_t_half_missing ON t_half(a);\n",
    "2026-01-03-unapplied.sql": "CREATE TABLE IF NOT EXISTS t_never (a TEXT);\n",
    "2026-01-04-obsolete-created.sql": "CREATE TABLE IF NOT EXISTS t_gone (a TEXT);\n",
    "2026-01-05-drops-it.sql": "DROP TABLE IF EXISTS t_gone;\n",
    "2026-01-06-obsolete-rows.sql": "INSERT INTO t_removed (a) VALUES ('x');\n",
    "2026-01-07-rows-only.sql": "WITH v(k) AS (VALUES ('INSERT INTO t_decoy x'), ('b')) INSERT INTO t_live (a) SELECT k FROM v;\n",
    "2026-01-08-other-db.sql": "-- DB: living-paper\nCREATE TABLE IF NOT EXISTS paper_x (a TEXT);\n",
    "2026-01-09-drop-applied.sql": "DROP TRIGGER IF EXISTS trg_old;\n",
    "2026-01-10-drop-pending.sql": "DROP TABLE IF EXISTS t_live;\n",
    "2026-01-11-self-backup.sql": "CREATE TABLE bak_20260101_x AS SELECT 1;\nUPDATE t_live SET a = 'y';\n",
}
SNAP = {"objects": {"t_live": "table", "idx_t_live": "index", "t_other": "table", "t_half": "table"},
        "columns": {"t_other": ["id", "extra"]}}

with tempfile.TemporaryDirectory() as d:
    for n, t in FILES.items():
        open(os.path.join(d, n), "w", encoding="utf-8").write(t)
    before = {n: hashlib.sha256(open(os.path.join(d, n), "rb").read()).hexdigest() for n in os.listdir(d)}
    out = A.run(set(FILES), SNAP, d)
    by = {f["file"]: f for f in out["files"]}
    cls = lambda n: by[n]["class"]
    ok(cls("2026-01-01-live.sql") == "applied-live", "tables, indexes and an added column that exist are applied-live", by["2026-01-01-live.sql"])
    ok(by["2026-01-01-live.sql"]["header"].startswith("-- APPLY-BY: manual (applied live:"), "applied-live recommends a manual declaration")
    ok(cls("2026-01-02-partial.sql") == "partial" and "idx_t_half_missing" in by["2026-01-02-partial.sql"]["detail"], "an existing table with a missing index is partial", by["2026-01-02-partial.sql"])
    ok(cls("2026-01-03-unapplied.sql") == "unapplied" and by["2026-01-03-unapplied.sql"]["header"] is None, "nothing present and nothing dropping it is unapplied, with no header recommended")
    ok(cls("2026-01-04-obsolete-created.sql") == "obsolete" and "2026-01-05-drops-it.sql" in by["2026-01-04-obsolete-created.sql"]["detail"], "an object a later file drops is obsolete", by["2026-01-04-obsolete-created.sql"])
    ok(by["2026-01-04-obsolete-created.sql"]["header"].startswith("-- APPLY-BY: none (obsolete"), "obsolete recommends APPLY-BY: none")
    ok(cls("2026-01-06-obsolete-rows.sql") == "obsolete", "rows written only to a table that no longer exists are obsolete", by["2026-01-06-obsolete-rows.sql"])
    ok(cls("2026-01-07-rows-only.sql") == "rows-only" and "t_live" in by["2026-01-07-rows-only.sql"]["detail"] and "t_decoy" not in by["2026-01-07-rows-only.sql"]["detail"], "a WITH ... INSERT is a write to its real target, not to a name inside a string", by["2026-01-07-rows-only.sql"])
    ok(cls("2026-01-08-other-db.sql") == "other-db", "a -- DB: line other than qnfo-audit is other-db")
    ok(cls("2026-01-09-drop-applied.sql") == "applied-live", "a drop of an absent object is applied-live", by["2026-01-09-drop-applied.sql"])
    ok(cls("2026-01-10-drop-pending.sql") == "unapplied", "a drop of an object that still exists is unapplied", by["2026-01-10-drop-pending.sql"])
    ok(cls("2026-01-11-self-backup.sql") == "rows-only", "a file's own bak_ table is not counted as an object it creates", by["2026-01-11-self-backup.sql"])
    ok(A.run({"nope.sql"}, SNAP, d)["files"][0]["class"] == "missing-file", "an allowlist name without a file is reported")
    ok(A.run({"2026-01-01-live.sql"}, None, d)["files"][0]["class"] == "unclassified", "without a snapshot nothing is classified")
    qs = A.emit_sql(out["infos"])
    ok(len(qs) == 2 and all(q.lstrip().upper().startswith("SELECT") for q in qs) and not re.search(r"(?i)\b(insert|update|delete|drop|alter|create)\b", " ".join(qs)), "the emitted statements are two SELECTs", qs)
    ok("'t_other'" in qs[1] and "'t_live'" not in qs[1], "column lists are requested only for tables a file adds a column to", qs[1])
    after = {n: hashlib.sha256(open(os.path.join(d, n), "rb").read()).hexdigest() for n in os.listdir(d)}
    ok(before == after, "the audit changed no migration file")

# The real allowlist: every listed name exists, and a snapshot-less run extracts objects without failing.
names, expires = M.load_allowlist()
real = A.run(names)
ok(len(names) == 0 and not [f for f in real["files"] if f["class"] == "missing-file"], "migrations/headerless-allowlist.txt is empty (MIGRATION-HEADERLESS-AUDIT-1) and every name still listed would be a file in migrations/", [f["file"] for f in real["files"] if f["class"] == "missing-file"])

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
