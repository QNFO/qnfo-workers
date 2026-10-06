#!/usr/bin/env python3
"""Offline tests for MIGRATION-RUNNER-1 (scripts/apply_migrations.py, transformation lever T5.3).

A fake Cloudflare D1 (an in-memory sqlite3 database behind cf_ops_actions.call) stands in for qnfo-audit. Proves: a file
without "-- APPLY-BY: ci" is skipped (the 75 hand-applied files never run again); an opted-in file needs a known DB and a
Rollback line; DELETE/DROP needs a BACKUP table that exists and is non-empty, checked before anything runs; statements are
split by SQLite's tokenizer (a semicolon inside a string literal is not a boundary); an applied file is recorded in
migration_runs and skipped on the next run with the same sha256, and runs again when its content changes; a failing
statement records an error row, files one deduped MIGRATION-APPLY-FAILED-1 issue and returns 1; --check refuses a bad
header without touching D1; every migration already in migrations/ is skipped by --check.
Run: python3 scripts/apply_migrations_test.py   (prints "N passed, 0 failed")
"""
import glob
import io
import json
import os
import sqlite3
import sys
import contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import apply_migrations as M  # noqa: E402
import cf_ops_actions as C  # noqa: E402

passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + str(extra)[:400]))


db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER)")
db.execute("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT)")
calls = []


def fake_call(method, path, token, body=None, timeout=60):
    calls.append(body["sql"][:60])
    sql = body["sql"]
    params = body.get("params") or []
    q = __import__("re").sub(r"\?(\d+)", lambda m: ":p" + m.group(1), sql)
    try:
        cur = db.execute(q, {"p" + str(i + 1): v for i, v in enumerate(params)}) if params else db.execute(sql)
        rows = [dict(zip([d[0] for d in cur.description], r)) for r in cur.fetchall()] if cur.description else []
        db.commit()
        return 200, {"success": True, "result": [{"results": rows}]}
    except sqlite3.Error as e:
        return 400, {"success": False, "errors": [{"message": str(e)}]}


C.call = fake_call
out = []
emit = out.append

GOOD = """-- MIGRATION-RUNNER-1 test
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key IN ('a', 'b;c');
INSERT OR REPLACE INTO ops_config (key, value) VALUES ('a', 'x; y');
INSERT OR REPLACE INTO ops_config (key, value) VALUES ('b;c', 'it''s; fine');
"""

# 1. Opt-in: no header means skip, and nothing reaches D1.
ok(M.apply_file("migrations/old.sql", "CREATE TABLE t (x);\n", "a", "t", "c1", emit) == 0 and "skipped" in out[-1] and not calls, "a file without APPLY-BY: ci is skipped and D1 is not called")

# 2. Splitting respects string literals.
st = M.statements(GOOD)
ok(len(st) == 2 and "'x; y'" in st[0] and "'it''s; fine'" in st[1], "semicolons inside string literals are not statement boundaries", st)

# 3. Apply, record, skip on re-run, re-run on change.
rc = M.apply_file("migrations/good.sql", GOOD, "a", "t", "c1", emit)
ok(rc == 0 and json.loads(out[-1]).get("ok") and json.loads(out[-1])["statements"] == 2, "an opted-in file applies its statements", out[-1])
ok(db.execute("SELECT value FROM ops_config WHERE key = 'b;c'").fetchone()[0] == "it's; fine", "the statements really ran")
ok(db.execute("SELECT status, statements, commit_sha FROM migration_runs WHERE file = 'migrations/good.sql'").fetchone() == ("ok", 2, "c1"), "the run is recorded in migration_runs")
n_before = len(calls)
rc = M.apply_file("migrations/good.sql", GOOD, "a", "t", "c2", emit)
ok(rc == 0 and json.loads(out[-1]).get("already_applied") and db.execute("SELECT COUNT(*) FROM migration_runs").fetchone()[0] == 1, "the same sha256 is not applied twice", out[-1])
rc = M.apply_file("migrations/good.sql", GOOD + "INSERT OR REPLACE INTO ops_config (key, value) VALUES ('d', '1');\n", "a", "t", "c3", emit)
ok(rc == 0 and db.execute("SELECT COUNT(*) FROM migration_runs WHERE file = 'migrations/good.sql' AND status = 'ok'").fetchone()[0] == 2, "changed content (a new sha256) runs again")

# 4. Header refusals, before any D1 call.
n0 = len(calls)
bad_db = GOOD.replace("-- DB: qnfo-audit", "-- DB: living-paper")
ok(M.apply_file("migrations/x.sql", bad_db, "a", "t", "c", emit) == 1 and "DB header" in out[-1] and len(calls) == n0, "an unknown DB is refused without touching D1", out[-1])
no_rb = GOOD.replace("-- Rollback: DELETE FROM ops_config WHERE key IN ('a', 'b;c');\n", "")
ok(M.apply_file("migrations/x.sql", no_rb, "a", "t", "c", emit) == 1 and "Rollback" in out[-1] and len(calls) == n0, "a file without a Rollback line is refused", out[-1])
destr = GOOD + "DELETE FROM ops_config WHERE key = 'a';\n"
ok(M.apply_file("migrations/x.sql", destr, "a", "t", "c", emit) == 1 and "BACKUP" in out[-1] and len(calls) == n0, "a DELETE without a BACKUP header is refused", out[-1])
incomplete = GOOD + "INSERT INTO ops_config (key, value) VALUES ('z', 'no end')\n"
ok(M.apply_file("migrations/x.sql", incomplete, "a", "t", "c", emit) == 1 and "incomplete" in out[-1], "a file ending in an incomplete statement is refused", out[-1])

# 5. BACKUP must exist and hold rows before a destructive file runs.
with_bk = destr.replace("-- DB: qnfo-audit", "-- DB: qnfo-audit\n-- BACKUP: ops_config_bak_test")
rc = M.apply_file("migrations/destr.sql", with_bk, "a", "t", "c4", emit)
ok(rc == 1 and "does not exist" in out[-1] and db.execute("SELECT COUNT(*) FROM ops_config WHERE key = 'a'").fetchone()[0] == 1, "a missing backup table stops the file before any statement", out[-1])
db.execute("CREATE TABLE ops_config_bak_test AS SELECT * FROM ops_config WHERE 0")
db.commit()
rc = M.apply_file("migrations/destr.sql", with_bk, "a", "t", "c4", emit)
ok(rc == 1 and "is empty" in out[-1], "an empty backup table stops the file", out[-1])
db.execute("INSERT INTO ops_config_bak_test SELECT * FROM ops_config")
db.commit()
rc = M.apply_file("migrations/destr.sql", with_bk, "a", "t", "c4", emit)
ok(rc == 0 and db.execute("SELECT COUNT(*) FROM ops_config WHERE key = 'a'").fetchone()[0] == 0, "with a non-empty backup the destructive file runs", out[-1])

# 5b. A file that creates its own backup ahead of the delete: checked right before the DELETE, not before anything.
own_bk = """-- own backup
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_test_own
-- Rollback: INSERT OR IGNORE INTO ops_config SELECT * FROM bak_test_own;
INSERT OR REPLACE INTO ops_config (key, value) VALUES ('own1', 'x');
CREATE TABLE IF NOT EXISTS bak_test_own AS SELECT * FROM ops_config;
DELETE FROM ops_config WHERE key = 'own1';
"""
okp, probs, inf = M.plan("migrations/own.sql", own_bk)
ok(okp and not probs and inf["creates_backup"] is True, "a CREATE TABLE <backup> AS SELECT ahead of the delete is recognised", (probs, inf))
rc = M.apply_file("migrations/own.sql", own_bk, "a", "t", "c4b", emit)
ok(rc == 0 and db.execute("SELECT COUNT(*) FROM bak_test_own WHERE key = 'own1'").fetchone()[0] == 1 and db.execute("SELECT COUNT(*) FROM ops_config WHERE key = 'own1'").fetchone()[0] == 0, "the backup is written first, then the delete runs", out[-1])
late_bk = own_bk.replace("bak_test_own", "bak_test_late").replace("CREATE TABLE IF NOT EXISTS bak_test_late AS SELECT * FROM ops_config;\nDELETE FROM ops_config WHERE key = 'own1';", "DELETE FROM ops_config WHERE key = 'own1';\nCREATE TABLE IF NOT EXISTS bak_test_late AS SELECT * FROM ops_config;")
okp, probs, inf = M.plan("migrations/late.sql", late_bk)
ok(inf["creates_backup"] is False, "a backup created after the delete does not count", inf)
db.execute("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('own1', 'x')")
db.commit()
rc = M.apply_file("migrations/late.sql", late_bk, "a", "t", "c4c", emit)
ok(rc == 1 and "does not exist" in out[-1] and db.execute("SELECT COUNT(*) FROM ops_config WHERE key = 'own1'").fetchone()[0] == 1, "so the file is stopped before any statement and nothing is deleted", out[-1])
empty_bk = own_bk.replace("bak_test_own", "bak_test_empty").replace("AS SELECT * FROM ops_config;", "AS SELECT * FROM ops_config WHERE 0;")
rc = M.apply_file("migrations/empty.sql", empty_bk, "a", "t", "c4d", emit)
ok(rc == 1 and "is empty" in out[-1] and "before statement 3" in out[-1] and db.execute("SELECT COUNT(*) FROM ops_config WHERE key = 'own1'").fetchone()[0] == 1, "an empty self-made backup stops the file right before the delete", out[-1])

# 6. A failing statement is recorded once and filed once.
failing = GOOD.replace("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('b;c', 'it''s; fine');", "INSERT INTO no_such_table VALUES (1);")
rc = M.apply_file("migrations/fail.sql", failing, "a", "t", "c5", emit)
ok(rc == 1 and json.loads(out[-1])["applied_before_failure"] == 1, "a failing statement returns 1 and says how many ran before it", out[-1])
ok(db.execute("SELECT status, statements FROM migration_runs WHERE file = 'migrations/fail.sql'").fetchone() == ("error", 1), "the failure is recorded in migration_runs")
M.apply_file("migrations/fail.sql", failing, "a", "t", "c6", emit)
ok(db.execute("SELECT COUNT(*) FROM agent_issues WHERE title = 'MIGRATION-APPLY-FAILED-1: fail.sql' AND status = 'open'").fetchone()[0] == 1, "one open MIGRATION-APPLY-FAILED-1 issue, not one per run")

# 7. --check never calls D1 and skips every existing migration (they were applied by hand).
n1 = len(calls)
# 5c. D1 caps a LIKE/GLOB pattern at 50 bytes (MIGRATION-APPLY-FAILED-1, issue 2046): --check rejects longer ones.
long_like = """-- long like
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: none needed
UPDATE ops_config SET value = 'y' WHERE key = 'a' AND value NOT LIKE '%code-task: repo=qnfo-workers path=idea-hub/worker.js%';
"""
okp, probs, inf = M.plan("migrations/long.sql", long_like)
ok(okp and any("LIKE/GLOB pattern of 54 bytes" in p for p in probs), "a 54-byte LIKE pattern is a --check problem", probs)
short_like = long_like.replace("'%code-task: repo=qnfo-workers path=idea-hub/worker.js%'", "'%TRIGGER-CODE-TASK-LINES-1%'")
okp, probs, inf = M.plan("migrations/short.sql", short_like)
ok(okp and not probs, "a short LIKE pattern and instr() pass", probs)
# 5d. METRIC-CADENCE-CHECK-1 (issue 2063): the D1 triggers metric_registry_cadence_canonical_* abort a refresh_cadence that
# is not a canonical token; --check runs the triggers' own expression on every literal cadence a file writes.
for c, rej in [("hourly", False), ("Daily", False), ("2h", False), ("30m", False), ("*/15", False), ("*/3h", False), ("", False),
               ("hourly (D1 triggers metric_orphan_issues_au/ai)", True), ("every hour", True), ("0 * * * *", True), ("fortnightly", True)]:
    ok(M.cadence_rejected(c) is rej, "cadence %r is %s like the D1 trigger" % (c, "refused" if rej else "accepted"))
for sql, want in [
        ("INSERT INTO metric_registry (metric, refresh_cadence) VALUES ('a', 'hourly'), ('b', 'every (2) hours'), ('c', 'it''s 2h');", ["hourly", "every (2) hours", "it's 2h"]),
        ("INSERT OR IGNORE INTO metric_registry (metric, formula, refresh_cadence) SELECT 'm', 'f(x, y)', 'daily (x)' WHERE NOT EXISTS (SELECT 1 FROM t);", ["daily (x)"]),
        ("INSERT INTO metric_registry (metric, refresh_cadence) SELECT 'm', 'weekly' FROM t;", ["weekly"]),
        ("UPDATE metric_registry SET last_value = '1', refresh_cadence = '0 * * * *' WHERE metric = 'x';", ["0 * * * *"]),
        ("INSERT INTO metric_registry (metric, refresh_cadence) VALUES ('a', lower('HOURLY'));", []),
        ("INSERT INTO other (metric, refresh_cadence) VALUES ('a', 'bad one');", []),
        ("INSERT INTO metric_registry (metric, last_value) VALUES ('a', 'x y');", [])]:
    ok(M.metric_cadences(M.body(sql)) == want, "the cadences a statement writes are found: " + sql[:60], M.metric_cadences(M.body(sql)))
bad_cad = """-- cadence
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'm';
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, refresh_cadence, state) VALUES
 ('m', 'operational', 'guard', 'hourly (D1 triggers metric_orphan_issues_au/ai on the open_agent_issues refresh)', 'MEASURED');
"""
okp, probs, inf = M.plan("migrations/cad.sql", bad_cad)
ok(okp and any("METRIC-CADENCE-CANONICAL-1" in p for p in probs), "the 2063 cadence is a --check problem", probs)
okp, probs, inf = M.plan("migrations/cad.sql", bad_cad.replace("'hourly (D1 triggers metric_orphan_issues_au/ai on the open_agent_issues refresh)'", "'hourly'"))
ok(okp and not probs, "the canonical 'hourly' passes", probs)
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    rc = M.main(["--check"] + sorted(glob.glob(os.path.join(HERE, "..", "migrations", "*.sql"))))
lines = [json.loads(l) for l in buf.getvalue().splitlines() if l.strip()]
ok(rc == 0 and len(calls) == n1 and lines and all("skipped" in l or l.get("ok") for l in lines), "--check passes the repository's migrations without touching D1", [l for l in lines if not ("skipped" in l or l.get("ok"))][:3])

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
