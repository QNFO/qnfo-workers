#!/usr/bin/env python3
"""Offline tests for D1-FOLD-1 in cf_ops_actions.py (#1822): d1-backup, unbind-d1, delete-d1.

Proves: the SQL dump round-trips exactly (quotes, newlines, unicode, NULL, floats, AUTOINCREMENT ids) and its manifest
matches; unbind-d1 refuses a protected worker, a binding still declared in wrangler.toml, a binding named in worker.js or a
fleet_tasks definition, and otherwise sends only {type: inherit} bindings under the secret-lock; delete-d1 refuses on any
live or repo binder, on writes in 7 days, on a missing, corrupted or stale backup, and deletes only when all checks pass.
Run: python3 scripts/cf_ops_d1_fold_test.py   (prints "N passed, 0 failed")
"""
import contextlib
import hashlib
import json
import os
import sqlite3
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cf_ops_actions as C  # noqa: E402

passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + str(extra)[:300]))


DB_ID = C.D1_RETIRE["jnl-audit"]
SRC = sqlite3.connect(":memory:")
SRC.row_factory = sqlite3.Row
SRC.executescript("""
CREATE TABLE jnl_records (recid INTEGER PRIMARY KEY, title TEXT, avg REAL, note TEXT);
CREATE TABLE jnl_log (id INTEGER PRIMARY KEY AUTOINCREMENT, detail TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX jnl_log_detail ON jnl_log(detail);
INSERT INTO jnl_records VALUES (15877875, 'Sculpting Intelligence', 7.75, NULL);
INSERT INTO jnl_records VALUES (22648524, 'The Digital Straw Man: Heffner''s "Digital Psychopath"', 7.5, 'line1
line2 é—✓');
INSERT INTO jnl_log (detail, created_at) VALUES ('PUBLISH avg=7.75', '2026-09-06 20:45:50');
INSERT INTO jnl_log (detail, created_at) VALUES ('x', '2026-09-06 20:46:00');
DELETE FROM jnl_log WHERE detail = 'x';
INSERT INTO jnl_log (detail, created_at) VALUES ('REVISE avg=7.38', '2026-09-07 20:23:53');
""")


def src_run(sql):
    try:
        return True, [dict(r) for r in SRC.execute(sql).fetchall()]
    except Exception as e:  # noqa: BLE001
        return False, [str(e)]


# --- sql_lit -----------------------------------------------------------------------------------------------------------
ok(C.sql_lit(None) == "NULL" and C.sql_lit(3) == "3" and C.sql_lit(7.75) == "7.75" and C.sql_lit("a'b") == "'a''b'", "sql_lit basics")
ok(C.sql_lit(float("nan")) == "NULL", "NaN is NULL")
try:
    C.sql_lit(b"x")
    ok(False, "bytes refused")
except ValueError:
    ok(True, "bytes refused")

# --- dump round-trip ---------------------------------------------------------------------------------------------------
sql, manifest = C.d1_dump("acct", "tok", DB_ID, run=src_run)
DST = sqlite3.connect(":memory:")
DST.row_factory = sqlite3.Row
DST.executescript(sql)
for t in ("jnl_records", "jnl_log"):
    a = [dict(r) for r in SRC.execute("SELECT * FROM " + t + " ORDER BY rowid")]
    b = [dict(r) for r in DST.execute("SELECT * FROM " + t + " ORDER BY rowid")]
    ok(a == b, "dump round-trips " + t, (a, b))
    ok(manifest[t] == {"n": len(a), "sha256": C.rows_sha(a)}, "manifest " + t)
ok([r["id"] for r in DST.execute("SELECT id FROM jnl_log ORDER BY id")] == [1, 3], "AUTOINCREMENT ids preserved (gap kept)")
ok(DST.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='jnl_log_detail'").fetchone()[0] == 1, "indexes recreated")
ok("Heffner" not in json.dumps(manifest), "the manifest carries counts and hashes, never row text")

# --- copy_tables (jnlaudit_* in qnfo-audit) -----------------------------------------------------------------------------
AUD = sqlite3.connect(":memory:")
AUD.row_factory = sqlite3.Row
def mk_run(conn):
    def run(sql, params=None):
        try:
            cur = conn.execute(sql, params or [])
            conn.commit()
            return True, [dict(r) for r in cur.fetchall()]
        except Exception as e:  # noqa: BLE001
            return False, [str(e)]
    return run
cp = C.copy_tables("a", "t", DB_ID, manifest, run_src=mk_run(SRC), run_dst=mk_run(AUD))
ok(all(v["ok"] and v["sha256_match"] and not v["existed"] for v in cp.values()) and set(v["copy"] for v in cp.values()) == {"jnlaudit_records", "jnlaudit_log"}, "every table is copied as jnlaudit_* and verified by count and hash", cp)
ok([dict(r) for r in AUD.execute("SELECT * FROM jnlaudit_log ORDER BY rowid")] == [dict(r) for r in SRC.execute("SELECT * FROM jnl_log ORDER BY rowid")], "the copy is row-for-row identical (ids kept)")
cp2 = C.copy_tables("a", "t", DB_ID, manifest, run_src=mk_run(SRC), run_dst=mk_run(AUD))
ok(all(v["ok"] and v["existed"] for v in cp2.values()) and AUD.execute("SELECT COUNT(*) FROM jnlaudit_log").fetchone()[0] == 2, "a re-run keeps a matching copy and inserts nothing twice")
AUD.execute("UPDATE jnlaudit_records SET title = 'changed' WHERE recid = 15877875"); AUD.commit()
cp3 = C.copy_tables("a", "t", DB_ID, manifest, run_src=mk_run(SRC), run_dst=mk_run(AUD))
ok(not cp3["jnl_records"]["ok"] and AUD.execute("SELECT title FROM jnlaudit_records WHERE recid = 15877875").fetchone()[0] == "changed", "a copy that differs is reported, never overwritten")
AUD.execute("UPDATE jnlaudit_records SET title = 'Sculpting Intelligence' WHERE recid = 15877875"); AUD.commit()
ok(C.copy_name("jnl_review_log") == "jnlaudit_review_log" and C.copy_name("misc") == "jnlaudit_misc", "copy names follow the owner's jnlaudit_* scheme")

# --- wrangler_binders / worker_dir -------------------------------------------------------------------------------------
root = tempfile.mkdtemp()
def mkw(d, name, extra="", marker=None, js="export default {}"):
    os.makedirs(os.path.join(root, d))
    open(os.path.join(root, d, "wrangler.toml"), "w").write('name = "' + name + '"\n' + extra)
    open(os.path.join(root, d, "worker.js"), "w").write(js)
    if marker:
        open(os.path.join(root, d, marker), "w").write("x")
mkw("jnl-referee", "jnl-referee", 'database_id = "' + DB_ID + '"\n', marker="RETIRED")
mkw("fleet-exec", "fleet-exec", "# no binding\n", js="function dbFor(def, env) { return env[def.db || 'AUDIT']; }")
mkw("other", "other-worker", 'database_id = "' + DB_ID + '"\n')
ok(C.wrangler_binders(DB_ID, root) == ["other"], "a RETIRED directory does not count as a binder", C.wrangler_binders(DB_ID, root))
ok(C.worker_dir("fleet-exec", root) == "fleet-exec" and C.worker_dir("nope", root) is None, "worker_dir maps the script name")

# --- unbind-d1 ---------------------------------------------------------------------------------------------------------
emitted, patched, locks = [], [], []
C.emit = lambda o: emitted.append(o)
SETTINGS = {"bindings": [{"type": "d1", "name": "AUDIT", "id": "35e2e573"}, {"type": "d1", "name": "JNL", "id": DB_ID}, {"type": "secret_text", "name": "CF_TOKEN"}]}
TASK_HITS = {"n": 0}


def fake_call(method, path, token, body=None, timeout=60):
    if "/workers/durable_objects/namespaces" in path:
        return 200, {"success": True, "result": [], "result_info": {"total_pages": 1}}
    if path.endswith("/settings") and method == "GET":
        return 200, {"success": True, "result": SETTINGS}
    if "/d1/database/" + C.AUDIT_DB + "/query" in path:
        if "fleet_tasks" in body["sql"]:
            return 200, {"success": True, "result": [{"results": [{"n": TASK_HITS["n"]}]}]}
    return 404, {}


class FakeResp:
    status = 200
    def __init__(self, data): self.data = data
    def read(self): return self.data
    def __enter__(self): return self
    def __exit__(self, *a): return False


def fake_urlopen(req, timeout=60):
    body = req.data.decode()
    patched.append({"method": req.get_method(), "url": req.full_url, "body": body})
    part = body.split("\r\n\r\n", 1)[1].rsplit("\r\n--", 1)[0]
    SETTINGS["bindings"] = [b for b in SETTINGS["bindings"] if b["name"] in {x["name"] for x in json.loads(part)["bindings"]}]
    return FakeResp(json.dumps({"success": True}).encode())


@contextlib.contextmanager
def fake_lock(worker, ttl_sec=900, owner="x", call=None):
    locks.append(worker)
    yield "tok"

import secret_lock  # noqa: E402
secret_lock.secret_lock = fake_lock
C.call = fake_call
C.urllib.request.urlopen = fake_urlopen
cwd = os.getcwd()
os.chdir(root)
try:
    ok(C.unbind_d1("qnfo-ops:JNL", "a", "t") == 3 and emitted[-1]["refused"] == "protected", "a protected worker is refused")
    open(os.path.join(root, "fleet-exec", "wrangler.toml"), "a").write('database_id = "' + DB_ID + '"\n')
    ok(C.unbind_d1("fleet-exec:JNL", "a", "t") == 3 and "still declares" in emitted[-1]["refused"] and not patched, "refused while wrangler.toml still declares the database")
    open(os.path.join(root, "fleet-exec", "wrangler.toml"), "w").write('name = "fleet-exec"\n')
    open(os.path.join(root, "fleet-exec", "worker.js"), "w").write("const db = env.JNL;")
    ok(C.unbind_d1("fleet-exec:JNL", "a", "t") == 3 and "worker.js" in emitted[-1]["refused"] and not patched, "refused while worker.js names the binding")
    open(os.path.join(root, "fleet-exec", "worker.js"), "w").write("function dbFor(def, env) { return env[def.db || 'AUDIT']; }")
    TASK_HITS["n"] = 1
    ok(C.unbind_d1("fleet-exec:JNL", "a", "t") == 3 and "fleet_tasks" in emitted[-1]["refused"] and not patched, "refused while a fleet_tasks definition names the binding")
    TASK_HITS["n"] = 0
    ok(C.unbind_d1("fleet-exec:AUDIT", "a", "t") == 3 and "D1_RETIRE" in emitted[-1]["refused"], "a binding to a database outside D1_RETIRE is refused")
    rc = C.unbind_d1("fleet-exec:JNL", "a", "t")
    sent = json.loads(patched[-1]["body"].split("\r\n\r\n", 1)[1].rsplit("\r\n--", 1)[0])
    ok(rc == 0 and emitted[-1]["ok"] and emitted[-1]["bindings_after"] == 2, "unbinds and verifies", emitted[-1])
    ok(patched[-1]["method"] == "PATCH" and sent["bindings"] == [{"type": "inherit", "name": "AUDIT"}, {"type": "inherit", "name": "CF_TOKEN"}], "only inherit entries are sent, no values", sent)
    ok(locks == ["fleet-exec"], "the mutation ran under the secret-lock for the worker", locks)
    ok(C.unbind_d1("fleet-exec:JNL", "a", "t") == 0 and emitted[-1].get("already_absent"), "a second run is a no-op")
finally:
    os.chdir(cwd)

# --- delete-d1 ---------------------------------------------------------------------------------------------------------
state = {"exists": True, "writes": 0, "binders": [], "backup": None, "deleted": 0}
C.wrangler_binders = lambda db_id, root=".": []
C.live_binders = lambda a, t, db_id: list(state["binders"])
C.d1_writes_7d = lambda a, t, db_id: state["writes"]
C.d1_dump = lambda a, t, db, run=None: (sql, manifest)


FT = {"n": 0}
R2 = {"text": None}
COPIES = {"ok": True}
C.r2_get_text = lambda a, t, bucket, key: (200, R2["text"]) if R2["text"] is not None else (404, "")
C.copy_tables = lambda a, t, db_id, m, run_src=None, run_dst=None: {k: {"ok": COPIES["ok"], "existed": True} for k in m}


def fake_call2(method, path, token, body=None, timeout=60):
    if "/query" in path and "fleet_tasks" in body["sql"]:
        return 200, {"success": True, "result": [{"results": [{"n": FT["n"]}]}]}
    if path.endswith("/d1/database/" + DB_ID):
        if method == "DELETE":
            state["exists"] = False
            state["deleted"] += 1
            return 200, {"success": True}
        return (200 if state["exists"] else 404), {}
    if "/query" in path and "d1_fold_backups" in body["sql"]:
        return 200, {"success": True, "result": [{"results": [state["backup"]] if state["backup"] else []}]}
    return 404, {}


C.call = fake_call2
good = {"id": 7, "sql_sha256": hashlib.sha256(sql.encode()).hexdigest(), "manifest_json": json.dumps(manifest, sort_keys=True), "sql_text": sql, "age_days": 0.01, "r2_key": "d1-folds/jnl-audit/x.sql"}
R2["text"] = sql
ok(C.delete_d1("qnfo-audit", "a", "t") == 3 and state["deleted"] == 0, "a database outside D1_RETIRE is refused")
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and "no d1_fold_backups row" in emitted[-1]["refused"] and state["deleted"] == 0, "refused without a backup")
state["backup"] = dict(good, sql_text=sql + "tampered")
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and "backup hash does not verify" in emitted[-1]["refused"], "refused when the stored backup does not verify")
state["backup"] = dict(good, manifest_json=json.dumps({"jnl_log": {"n": 1, "sha256": "x"}}))
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and "database changed since the backup" in emitted[-1]["refused"], "refused when the database changed since the backup")
state["backup"] = good
state["binders"] = ["fleet-exec:JNL"]
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and any("live bindings" in r for r in emitted[-1]["refused"]), "refused while a live worker binds it")
state["binders"] = []
state["writes"] = 2
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and any("write queries" in r for r in emitted[-1]["refused"]), "refused after writes in 7 days")
state["writes"] = None
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and state["deleted"] == 0, "refused when the write count cannot be read (fail closed)")
state["writes"] = 0
state["backup"] = dict(good, r2_key=None)
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and "no verified R2 copy of the dump" in emitted[-1]["refused"] and state["deleted"] == 0, "refused without a verified R2 copy")
state["backup"] = good
R2["text"] = sql + "x"
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and any("R2 copy" in r for r in emitted[-1]["refused"]) and state["deleted"] == 0, "refused when the R2 copy's SHA-256 differs")
R2["text"] = sql
COPIES["ok"] = False
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and any("jnlaudit_" in r for r in emitted[-1]["refused"]) and state["deleted"] == 0, "refused when a jnlaudit_* copy is missing or differs")
COPIES["ok"] = True
FT["n"] = 1
ok(C.delete_d1("jnl-audit", "a", "t") == 3 and any("fleet_tasks" in r for r in emitted[-1]["refused"]) and state["deleted"] == 0, "refused when a fleet_tasks definition names JNL")
FT["n"] = 0
ok(C.D1_OBSERVE_DAYS == 0, "owner directive: no observation window")
ok(C.delete_d1("jnl-audit", "a", "t") == 0 and emitted[-1]["ok"] and state["deleted"] == 1 and emitted[-1]["backup_id"] == 7, "deletes when every check passes", emitted[-1])
ok(C.delete_d1("jnl-audit", "a", "t") == 0 and emitted[-1].get("already_absent") and state["deleted"] == 1, "a second run is a no-op")

print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
