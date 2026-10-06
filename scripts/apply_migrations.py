#!/usr/bin/env python3
"""MIGRATION-RUNNER-1 (transformation lever T5.3, pillar autonomy): merged migrations apply themselves.

WHAT   A migration file opts in with two header lines:
           -- APPLY-BY: ci
           -- DB: qnfo-audit
       and must carry a rollback line in its header comments ("-- Rollback: ..."). Every DELETE FROM / DROP TABLE /
       DROP INDEX / DROP VIEW statement additionally needs a "-- BACKUP: <table>" line; the named table must exist in the
       same database and hold at least one row before anything runs (no data is deleted without a backup).
       --check validates opted-in files (the PR gate). --apply runs them on Cloudflare D1 statement by statement and records
       each run in qnfo-audit.migration_runs (file, sha256, commit, status, statements, error); a file whose sha256 already
       has an ok run is skipped, so a re-run or a hand-applied twin is harmless (migrations here are idempotent by
       convention). A failed file records the error, files one deduped agent_issues row (MIGRATION-APPLY-FAILED-1: <file>)
       and exits 1, so the workflow turns red and ci-watchdog sees it.
WHY    On 2026-10-06 all 75 files under migrations/ had been applied by hand by the session that wrote them; nothing
       recorded which ones ran, and a merged migration that nobody applied was invisible. Files without the header are
       ignored, so nothing already applied runs again.
USAGE  python3 scripts/apply_migrations.py --check  migrations/a.sql [...]
       python3 scripts/apply_migrations.py --apply  migrations/a.sql [...] [--commit SHA]
       --apply reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Exit 0 = every opted-in file passed (or was skipped).
"""
import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

DATABASES = {"qnfo-audit": "35e2e573-92f3-46ac-83c6-22f6429fc5e5"}
DESTRUCTIVE = re.compile(r"^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b", re.I)
LEDGER_DDL = ("CREATE TABLE IF NOT EXISTS migration_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT NOT NULL, "
              "sha256 TEXT NOT NULL, commit_sha TEXT, db TEXT, status TEXT NOT NULL, statements INTEGER, error TEXT, "
              "applied_by TEXT, applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))")


def header(text):
    """The leading comment block (lines starting with --, before the first statement)."""
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            out.append("")
            continue
        if s.startswith("--"):
            out.append(s[2:].strip())
            continue
        break
    return out


def header_value(lines, key):
    for l in lines:
        m = re.match(r"^" + re.escape(key) + r"\s*:\s*(.+)$", l, re.I)
        if m:
            return m.group(1).strip()
    return None


def body(stmt):
    """A statement without its full-line comments (the header and any "--" notes): D1 receives only SQL."""
    return "\n".join(l for l in stmt.splitlines() if not l.strip().startswith("--")).strip()


def statements(text):
    """Split SQL into complete statements with SQLite's own tokenizer (quotes, comments and semicolons inside strings)."""
    out, buf = [], ""
    for line in text.splitlines(keepends=True):
        buf += line
        if sqlite3.complete_statement(buf):
            s = buf.strip()
            b = body(s)
            if b and b != ";":
                out.append(s)
            buf = ""
    rest = body(buf)
    if rest:
        out.append("__INCOMPLETE__" + rest[:200])
    return out


def plan(path, text):
    """Validate one file. Returns (opted_in, problems, info)."""
    lines = header(text)
    by = header_value(lines, "APPLY-BY")
    if not by or by.split()[0].lower() != "ci":
        return False, [], {"skip": "no APPLY-BY: ci header"}
    problems = []
    db = header_value(lines, "DB")
    if db not in DATABASES:
        problems.append("DB header must name one of " + ", ".join(sorted(DATABASES)) + " (got " + str(db) + ")")
    if not any(re.match(r"^rollback\s*:", l, re.I) for l in lines):
        problems.append("no '-- Rollback:' line in the header")
    stmts = statements(text)
    if any(s.startswith("__INCOMPLETE__") for s in stmts):
        problems.append("the file ends with an incomplete statement")
    if not [s for s in stmts if not s.startswith("__INCOMPLETE__")]:
        problems.append("no statement to apply")
    destructive = [s for s in stmts if DESTRUCTIVE.match(body(s))]
    backup = header_value(lines, "BACKUP")
    if destructive and not backup:
        problems.append(str(len(destructive)) + " destructive statement(s) (DELETE/DROP) need a '-- BACKUP: <table>' header line")
    if backup and not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", backup):
        problems.append("BACKUP must name one table")
    return True, problems, {"db": db, "statements": len(stmts), "destructive": len(destructive), "backup": backup}


def d1(acct, token, db_id, sql, params=None):
    import cf_ops_actions as C
    st, j = C.call("POST", f"/accounts/{acct}/d1/database/{db_id}/query", token, {"sql": sql, "params": params or []}, timeout=90)
    if st != 200 or not j.get("success", False):
        raise RuntimeError("D1 HTTP " + str(st) + ": " + json.dumps(j.get("errors") or j)[:300])
    res = j.get("result") or []
    return (res[0].get("results") if res else []) or []


def apply_file(path, text, acct, token, commit, emit=print):
    ok, problems, info = plan(path, text)
    if not ok:
        emit(json.dumps({"file": path, "skipped": info.get("skip")}))
        return 0
    if problems:
        emit(json.dumps({"file": path, "refused": problems}))
        return 1
    db_id = DATABASES[info["db"]]
    sha = hashlib.sha256(text.encode()).hexdigest()
    d1(acct, token, db_id, LEDGER_DDL)
    done = d1(acct, token, db_id, "SELECT id FROM migration_runs WHERE file = ?1 AND sha256 = ?2 AND status = 'ok' LIMIT 1", [path, sha])
    if done:
        emit(json.dumps({"file": path, "already_applied": True, "sha256": sha[:12]}))
        return 0
    if info["backup"]:
        n = d1(acct, token, db_id, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?1", [info["backup"]])
        if not n or int(n[0].get("n") or 0) == 0:
            return record_failure(path, sha, commit, info, acct, token, db_id, "BACKUP table " + info["backup"] + " does not exist", emit)
        rows = d1(acct, token, db_id, 'SELECT COUNT(*) AS n FROM "' + info["backup"] + '"')
        if not rows or int(rows[0].get("n") or 0) == 0:
            return record_failure(path, sha, commit, info, acct, token, db_id, "BACKUP table " + info["backup"] + " is empty", emit)
    done_n = 0
    for s in statements(text):
        try:
            d1(acct, token, db_id, body(s))
            done_n += 1
        except Exception as e:  # noqa: BLE001
            return record_failure(path, sha, commit, info, acct, token, db_id, "statement " + str(done_n + 1) + ": " + str(e)[:400], emit, done_n)
    d1(acct, token, db_id, "INSERT INTO migration_runs (file, sha256, commit_sha, db, status, statements, applied_by) VALUES (?1, ?2, ?3, ?4, 'ok', ?5, 'ci:apply-migrations')",
       [path, sha, commit or "", info["db"], str(done_n)])
    emit(json.dumps({"file": path, "ok": True, "statements": done_n, "sha256": sha[:12]}))
    return 0


def record_failure(path, sha, commit, info, acct, token, db_id, err, emit, done_n=0):
    try:
        d1(acct, token, db_id, "INSERT INTO migration_runs (file, sha256, commit_sha, db, status, statements, error, applied_by) VALUES (?1, ?2, ?3, ?4, 'error', ?5, ?6, 'ci:apply-migrations')",
           [path, sha, commit or "", info.get("db") or "", str(done_n), err[:1000]])
        title = "MIGRATION-APPLY-FAILED-1: " + os.path.basename(path)
        d1(acct, token, db_id, "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) "
           "SELECT ?1, ?2, 'ci:apply-migrations', 'migration', 'high', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000 "
           "WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = ?1 AND status NOT IN ('closed','resolved','wontfix'))",
           [title, "Charter pillar: autonomy (MIGRATION-RUNNER-1). " + path + " (sha256 " + sha[:12] + ", commit " + (commit or "?")[:12] + ") failed after " + str(done_n) + " statement(s): " + err[:600] + ". Statements before the failure were applied; migrations are idempotent by convention, so fix the file and merge again (a new sha256 runs again)."])
    except Exception as e2:  # noqa: BLE001
        emit(json.dumps({"file": path, "ledger_error": str(e2)[:300]}))
    emit(json.dumps({"file": path, "ok": False, "error": err[:400], "applied_before_failure": done_n}))
    return 1


def main(argv=None):
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--apply", action="store_true")
    ap.add_argument("--commit", default=os.environ.get("GITHUB_SHA", ""))
    ap.add_argument("files", nargs="*")
    a = ap.parse_args(argv)
    files = [f for f in a.files if f.endswith(".sql") and os.path.exists(f)]
    rc = 0
    if a.check:
        for f in files:
            text = open(f, encoding="utf-8").read()
            ok, problems, info = plan(f, text)
            if not ok:
                print(json.dumps({"file": f, "skipped": info.get("skip")}))
            elif problems:
                rc = 1
                print(json.dumps({"file": f, "refused": problems}))
            else:
                print(json.dumps({"file": f, "ok": True, **info}))
        return rc
    acct, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID", ""), os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not acct or not token:
        print(json.dumps({"error": "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for --apply"}))
        return 2
    for f in sorted(files):
        rc |= apply_file(f, open(f, encoding="utf-8").read(), acct, token, a.commit)
    return rc


if __name__ == "__main__":
    sys.exit(main())
