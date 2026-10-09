#!/usr/bin/env python3
"""MIGRATION-RUNNER-1 (transformation lever T5.3, pillar autonomy): merged migrations apply themselves.

WHAT   A migration file opts in with two header lines:
           -- APPLY-BY: ci
           -- DB: qnfo-audit
       and must carry a rollback line in its header comments ("-- Rollback: ..."). Every DELETE FROM / DROP TABLE /
       DROP INDEX / DROP VIEW statement additionally needs a "-- BACKUP: <table>" line; the named table must exist in the
       same database and hold at least one row before the first destructive statement runs (no data is deleted without a
       backup). A file may create its own backup ("CREATE TABLE [IF NOT EXISTS] <table> AS SELECT ...") ahead of the first
       destructive statement; then the check runs right before that statement, otherwise before anything runs.
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
# D1 caps a LIKE/GLOB pattern at 50 bytes and rejects longer ones at run time ("LIKE or GLOB pattern too complex",
# MIGRATION-APPLY-FAILED-1, issue 2046). --check catches it in the PR; use instr(col, 'text') = 0 / > 0 instead.
LIKE_MAX_BYTES = 50
LIKE_LITERAL = re.compile(r"\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'", re.I)
# metric_registry.refresh_cadence is guarded on D1 by the BEFORE INSERT/UPDATE triggers metric_registry_cadence_canonical_*
# (METRIC-CADENCE-CANONICAL-1), which abort the statement at apply time (MIGRATION-APPLY-FAILED-1, issue 2063: "hourly (D1
# triggers ...)"). --check evaluates the triggers' own WHEN expression in SQLite on every literal cadence a migration writes,
# so the PR fails instead of the merge. Keep this expression equal to the trigger (read from sqlite_master on 2026-10-06).
CADENCE_REJECT_SQL = ("SELECT ?1 IS NOT NULL AND trim(?1) <> '' AND (instr(trim(?1),' ') > 0 OR NOT ("
                      "lower(trim(?1)) IN ('hourly','daily','weekly','monthly') OR trim(?1) GLOB '*/[0-9]*' "
                      "OR trim(?1) GLOB '[0-9]*m' OR trim(?1) GLOB '[0-9]*h'))")
METRIC_INSERT = re.compile(r"^\s*(?:INSERT|REPLACE)\s+(?:OR\s+\w+\s+)?INTO\s+\"?metric_registry\"?\s*\(", re.I)
METRIC_UPDATE_CADENCE = re.compile(r"^\s*UPDATE\s+\"?metric_registry\"?\s+SET\b.*?\brefresh_cadence\s*=\s*'((?:[^']|'')*)'", re.I | re.S)
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


def _close(s, i):
    """Index of the parenthesis that closes the one at s[i], skipping string literals ('' is an escaped quote)."""
    depth, q, j = 0, False, i
    while j < len(s):
        c = s[j]
        if q:
            if c == "'":
                if j + 1 < len(s) and s[j + 1] == "'":
                    j += 2
                    continue
                q = False
        elif c == "'":
            q = True
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return j
        j += 1
    return -1


def _split_top(s):
    """Split on commas that are outside parentheses and string literals."""
    out, depth, q, cur, j = [], 0, False, "", 0
    while j < len(s):
        c = s[j]
        if q:
            cur += c
            if c == "'":
                if j + 1 < len(s) and s[j + 1] == "'":
                    cur += "'"
                    j += 1
                else:
                    q = False
        elif c == "'":
            q, cur = True, cur + c
        elif c == "(":
            depth, cur = depth + 1, cur + c
        elif c == ")":
            depth, cur = depth - 1, cur + c
        elif c == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += c
        j += 1
    if cur.strip():
        out.append(cur.strip())
    return out


def metric_cadences(sql):
    """The literal refresh_cadence values a statement writes to metric_registry (INSERT ... VALUES, INSERT ... SELECT,
    UPDATE ... SET). An expression rather than a single string literal is not judged here."""
    vals = []
    m = METRIC_INSERT.match(sql)
    if m:
        cstart = m.end() - 1
        cend = _close(sql, cstart)
        if cend < 0:
            return vals
        cols = [c.strip().strip('"').lower() for c in _split_top(sql[cstart + 1:cend])]
        if "refresh_cadence" not in cols:
            return vals
        k = cols.index("refresh_cadence")
        rest = sql[cend + 1:].lstrip()
        rows = []
        if re.match(r"VALUES\b", rest, re.I):
            j = 6
            while True:
                while j < len(rest) and rest[j] in " \t\r\n":
                    j += 1
                if j >= len(rest) or rest[j] != "(":
                    break
                e = _close(rest, j)
                if e < 0:
                    break
                rows.append(_split_top(rest[j + 1:e]))
                j = e + 1
                while j < len(rest) and rest[j] in " \t\r\n":
                    j += 1
                if j < len(rest) and rest[j] == ",":
                    j += 1
                    continue
                break
        elif re.match(r"SELECT\b", rest, re.I):
            body_, depth, q, j = rest[6:], 0, False, 0
            while j < len(body_):
                c = body_[j]
                if q:
                    if c == "'" and not (j + 1 < len(body_) and body_[j + 1] == "'"):
                        q = False
                    elif c == "'":
                        j += 1
                elif c == "'":
                    q = True
                elif c == "(":
                    depth += 1
                elif c == ")":
                    depth -= 1
                elif depth == 0 and re.match(r"\s(FROM|WHERE|UNION|ON\s+CONFLICT)\b", body_[j:], re.I):
                    break
                j += 1
            rows.append(_split_top(body_[:j]))
        for r in rows:
            v = r[k].strip() if k < len(r) else ""
            lm = re.match(r"^'((?:[^']|'')*)'$", v, re.S)
            if lm:
                vals.append(lm.group(1).replace("''", "'"))
    u = METRIC_UPDATE_CADENCE.match(sql)
    if u:
        vals.append(u.group(1).replace("''", "'"))
    return vals


def cadence_rejected(value):
    """True when the D1 triggers metric_registry_cadence_canonical_* would abort on this refresh_cadence."""
    con = sqlite3.connect(":memory:")
    try:
        return bool(con.execute(CADENCE_REJECT_SQL, (value,)).fetchone()[0])
    finally:
        con.close()


# D1-COMPOUND-LIMIT-1 (2026-10-09): D1 refuses a compound SELECT of more than 5 terms (UNION / UNION ALL / INTERSECT /
# EXCEPT at one level), far below SQLite's default 500: migration 2026-10-09-09 stopped at a 7-term UNION ALL. A multi-row
# VALUES list is not limited the same way (a 7-row VALUES insert applied in the same file).
COMPOUND_MAX_TERMS = 5
COMPOUND_OP = re.compile(r"\b(UNION(\s+ALL)?|INTERSECT|EXCEPT)\b", re.I)


def compound_terms(sql):
    """Largest number of terms joined by compound operators at one parenthesis level, ignoring string literals."""
    text = re.sub(r"'(?:[^']|'')*'", "''", sql)
    counts, stack, depth_id = {}, [0], 0
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "(":
            depth_id += 1
            stack.append(depth_id)
        elif ch == ")":
            if len(stack) > 1:
                stack.pop()
        else:
            m = COMPOUND_OP.match(text, i)
            if m and (i == 0 or not (text[i - 1].isalnum() or text[i - 1] == "_")):
                counts[stack[-1]] = counts.get(stack[-1], 0) + 1
                i = m.end()
                continue
        i += 1
    return (max(counts.values()) + 1) if counts else 1


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
    for s in stmts:
        for m in LIKE_LITERAL.finditer(body(s)):
            lit = m.group(1).replace("''", "'")
            if len(lit.encode("utf-8")) > LIKE_MAX_BYTES:
                problems.append("LIKE/GLOB pattern of " + str(len(lit.encode("utf-8"))) + " bytes (D1 rejects over "
                                + str(LIKE_MAX_BYTES) + "; use instr()): '" + lit[:60] + "'")
    for s in stmts:
        worst = compound_terms(body(s))
        if worst > COMPOUND_MAX_TERMS:
            problems.append("compound SELECT of " + str(worst) + " terms (D1 rejects over " + str(COMPOUND_MAX_TERMS)
                            + ": 'too many terms in compound SELECT'; split it into several INSERT ... SELECT statements or a VALUES list)")
    for s in stmts:
        for cad in metric_cadences(body(s)):
            if cadence_rejected(cad):
                problems.append("metric_registry refresh_cadence '" + cad[:60] + "' is not a canonical token (D1 trigger "
                                "METRIC-CADENCE-CANONICAL-1 aborts it: use */N, */Nh, Nm, Nh or hourly|daily|weekly|monthly)")
    destructive = [s for s in stmts if DESTRUCTIVE.match(body(s))]
    backup = header_value(lines, "BACKUP")
    if destructive and not backup:
        problems.append(str(len(destructive)) + " destructive statement(s) (DELETE/DROP) need a '-- BACKUP: <table>' header line")
    if backup and not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", backup):
        problems.append("BACKUP must name one table")
    creates = False
    if backup:
        # BACKUP-CREATES-1: a file that creates its backup before any destructive statement (or has none, e.g. an UPDATE
        # whose Rollback line restores from the backup) must not demand the table already exist (#856).
        first = next((i for i, s in enumerate(stmts) if DESTRUCTIVE.match(body(s))), len(stmts))
        mk = re.compile(r"^\s*CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?\"?" + re.escape(backup) + r"\"?\s+AS\s+SELECT\b", re.I)
        creates = any(mk.match(body(s)) for s in stmts[:first])
    return True, problems, {"db": db, "statements": len(stmts), "destructive": len(destructive), "backup": backup, "creates_backup": creates}


def d1(acct, token, db_id, sql, params=None):
    import cf_ops_actions as C
    st, j = C.call("POST", f"/accounts/{acct}/d1/database/{db_id}/query", token, {"sql": sql, "params": params or []}, timeout=90)
    if st != 200 or not j.get("success", False):
        raise RuntimeError("D1 HTTP " + str(st) + ": " + json.dumps(j.get("errors") or j)[:300])
    res = j.get("result") or []
    return (res[0].get("results") if res else []) or []


# D1-TRIGGER-DEPTH-1 (2026-10-08): D1 refuses any write whose trigger programs nest more than 10 levels ("triggers nested
# too deep"), and it counts at compile time: a trigger whose WHEN is never true still counts, and so does an INSERT ... WHERE 0.
# Measured on scratch tables: a 10-trigger chain compiles, 11 fails. On 2026-10-08 two migrations (fleet_tick feeders in
# -10, self-updating agent_issues triggers in -13) pushed the cron log, heartbeat, event and metric writes over it for about
# 30 minutes. So after every CREATE TRIGGER the runner compiles a zero-row INSERT, UPDATE and DELETE on every table whose
# trigger chain can reach the new trigger's table, and drops the trigger at once if any of them is refused.
TRIGGER_ON = re.compile(r'(?is)^\s*CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+(?:BEFORE|AFTER|INSTEAD\s+OF)?\s*(?:INSERT|UPDATE|DELETE)\b.*?\bON\s+"?(\w+)"?')
WRITE_TARGET = re.compile(r'(?is)\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+"?(\w+)"?')
ADD_COLUMN = re.compile(r"(?is)^\s*ALTER\s+TABLE\s+\S+\s+ADD\s+(?:COLUMN\s+)?")


def trigger_upstream(trigger_rows, table):
    """Tables whose writes can reach `table` through trigger bodies (the table itself included)."""
    edges = {}
    for r in trigger_rows:
        m = TRIGGER_ON.match(r.get("sql") or "")
        if not m:
            continue
        sql = r["sql"]
        begin = re.search(r"(?is)\bBEGIN\b", sql)
        for t in WRITE_TARGET.findall(sql[begin.end():] if begin else ""):
            edges.setdefault(t.lower(), set()).add(m.group(2).lower())
    seen, todo = {table.lower()}, [table.lower()]
    while todo:
        for src in edges.get(todo.pop(), ()):
            if src not in seen:
                seen.add(src)
                todo.append(src)
    return seen


def depth_canary(acct, token, db_id, table):
    """None when every zero-row write upstream of `table` still compiles, else the refused statement and error."""
    trig = d1(acct, token, db_id, "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'")
    tables = {r["name"].lower(): r["name"] for r in d1(acct, token, db_id, "SELECT name FROM sqlite_master WHERE type = 'table'")}
    for t in sorted(trigger_upstream(trig, table)):
        if t not in tables:
            continue
        name = tables[t]
        cols = [c["name"] for c in d1(acct, token, db_id, "SELECT name FROM pragma_table_info(?1)", [name])]
        probes = ['INSERT INTO "%s" SELECT * FROM "%s" WHERE 0' % (name, name), 'DELETE FROM "%s" WHERE 0' % name]
        if cols:
            probes.append('UPDATE "%s" SET %s WHERE 0' % (name, ", ".join('"%s" = "%s"' % (c, c) for c in cols)))
        for q in probes:
            try:
                d1(acct, token, db_id, q)
            except Exception as e:  # noqa: BLE001
                if "nested too deep" in str(e) or "too many levels of trigger" in str(e):
                    return q[:120] + " -> " + str(e)[:200]
    return None


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
    def backup_missing():
        n = d1(acct, token, db_id, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?1", [info["backup"]])
        if not n or int(n[0].get("n") or 0) == 0:
            return "BACKUP table " + info["backup"] + " does not exist"
        rows = d1(acct, token, db_id, 'SELECT COUNT(*) AS n FROM "' + info["backup"] + '"')
        if not rows or int(rows[0].get("n") or 0) == 0:
            return "BACKUP table " + info["backup"] + " is empty"
        return None
    checked = not info["backup"]
    if info["backup"] and not info.get("creates_backup"):
        why = backup_missing()
        if why:
            return record_failure(path, sha, commit, info, acct, token, db_id, why, emit)
        checked = True
    done_n = 0
    for s in statements(text):
        if not checked and DESTRUCTIVE.match(body(s)):
            why = backup_missing()
            if why:
                return record_failure(path, sha, commit, info, acct, token, db_id, why + " (checked before statement " + str(done_n + 1) + ")", emit, done_n)
            checked = True
        try:
            d1(acct, token, db_id, body(s))
            done_n += 1
        except Exception as e:  # noqa: BLE001
            # A re-run after a partial apply meets the columns it already added; SQLite has no ADD COLUMN IF NOT EXISTS.
            if ADD_COLUMN.match(body(s)) and "duplicate column name" in str(e):
                done_n += 1
                continue
            return record_failure(path, sha, commit, info, acct, token, db_id, "statement " + str(done_n + 1) + ": " + str(e)[:400], emit, done_n)
        tm = TRIGGER_ON.match(body(s))
        if tm:
            refused = depth_canary(acct, token, db_id, tm.group(2))
            if refused:
                try:
                    d1(acct, token, db_id, 'DROP TRIGGER IF EXISTS "%s"' % tm.group(1))
                except Exception:  # noqa: BLE001
                    pass
                return record_failure(path, sha, commit, info, acct, token, db_id, "statement " + str(done_n) + " (trigger " + tm.group(1) +
                                      "): D1-TRIGGER-DEPTH-1, a write now nests deeper than D1's limit, so the trigger was dropped at once: " + refused, emit, done_n)
    d1(acct, token, db_id, "INSERT INTO migration_runs (file, sha256, commit_sha, db, status, statements, applied_by) VALUES (?1, ?2, ?3, ?4, 'ok', ?5, 'ci:apply-migrations')",
       [path, sha, commit or "", info["db"], str(done_n)])
    resolve_failure(path, sha, acct, token, db_id, done_n)
    emit(json.dumps({"file": path, "ok": True, "statements": done_n, "sha256": sha[:12]}))
    return 0


def resolve_failure(path, sha, acct, token, db_id, done_n):
    """MIGRATION-APPLY-RESOLVE-1 (2026-10-08): a later ok run closes the MIGRATION-APPLY-FAILED-1 issue this runner filed
    for the file, with the ok run as evidence. Before, nothing closed it: its birth probe read pending for 48h and then
    stale, so a migration fixed within the hour still left an open issue (2188-2190). Best effort; never fails the run."""
    title = "MIGRATION-APPLY-FAILED-1: " + os.path.basename(path)
    ev = "migration_runs ok for " + path + " (sha256 " + sha[:12] + ", " + str(done_n) + " statements, ci:apply-migrations)"
    try:
        d1(acct, token, db_id, "UPDATE issue_triage SET close_evidence = ?2 WHERE issue_id IN (SELECT id FROM agent_issues WHERE title = ?1 "
           "AND status NOT IN ('closed','resolved','wontfix'))", [title, ev])
        d1(acct, token, db_id, "UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000, "
           "description = COALESCE(description, '') || char(10) || 'MIGRATION-APPLY-RESOLVE-1: ' || ?2 WHERE title = ?1 "
           "AND status NOT IN ('closed','resolved','wontfix')", [title, ev])
    except Exception as e:  # noqa: BLE001
        print("resolve " + title + " failed: " + str(e)[:200], file=sys.stderr)


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
