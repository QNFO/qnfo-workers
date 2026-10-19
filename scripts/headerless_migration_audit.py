#!/usr/bin/env python3
"""MIGRATION-HEADERLESS-AUDIT-1 (agent_issues 100056): a read-only audit of the grandfathered headerless migrations.

migrations/headerless-allowlist.txt lists the migration files that carry executable SQL and no APPLY-BY header. For each one this
script extracts what the file creates (tables, views, triggers, indexes, added columns), what it writes (INSERT/UPDATE/DELETE
targets) and what a later file drops, compares that with a snapshot of the live qnfo-audit schema and classifies it:

  applied-live   every object it creates exists in D1                     header to add: APPLY-BY: manual (applied live ...)
  partial        some of the objects it creates exist, some do not        decision: complete it in a CI migration or retire it
  unapplied      none of its objects exist and nothing later drops them   decision: give it APPLY-BY: ci (safe files) or retire it
  obsolete       its objects are dropped by a later file, or it only writes rows in tables that no longer exist
                                                                           header to add: APPLY-BY: none (obsolete ...)
  rows-only      it creates nothing and writes rows in tables that exist; the effect cannot be proven from the schema
                                                                           header to add: APPLY-BY: manual (rows-only ...)
  other-db       the file names a database other than qnfo-audit in a "-- DB:" line

The audit never writes: it reads migrations/ and a snapshot, prints JSON, and changes no file and no database. The snapshot is the
result of two SELECTs on sqlite_master and pragma_table_info (`--emit-sql` prints them, restricted to the names the files create),
passed as JSON with --snapshot, or fetched with --d1 (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, SELECT only).

  python3 scripts/headerless_migration_audit.py --emit-sql
  python3 scripts/headerless_migration_audit.py --snapshot snapshot.json [--summary]
  python3 scripts/headerless_migration_audit.py --d1 --summary
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import apply_migrations as M  # noqa: E402

MIG_DIR = os.path.join(HERE, "..", "migrations")
IDENT = r'[`"\[]?([A-Za-z_][A-Za-z0-9_]*)[`"\]]?'
CREATE = re.compile(r"(?is)^\s*CREATE\s+(?:UNIQUE\s+)?(?:TEMP(?:ORARY)?\s+)?(TABLE|VIEW|TRIGGER|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?" + IDENT)
ADD_COL = re.compile(r"(?is)^\s*ALTER\s+TABLE\s+" + IDENT + r"\s+ADD\s+(?:COLUMN\s+)?" + IDENT)
DROP = re.compile(r"(?is)^\s*DROP\s+(TABLE|VIEW|TRIGGER|INDEX)\s+(?:IF\s+EXISTS\s+)?" + IDENT)
WRITE = re.compile(r"(?is)^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+" + IDENT)
DB_LINE = re.compile(r"(?m)^--[ \t]*DB:[ \t]*(\S+)")
WITH_WRITE_HEAD = re.compile(r"(?is)\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+" + IDENT)
BAK = re.compile(r"^(?:bak_|backup_|.*_bak(?:_|$))", re.I)
# Files whose SQL targets a database other than qnfo-audit but carry no "-- DB:" line. Measured 2026-10-19: living-paper has the tables
# paper_tag and paper_category (sqlite_master of living-paper); personal-life is private and is not queried by this audit.
OTHER_DB = {
    "2026-10-18-paper-tags.sql": "living-paper",
    "2026-10-18-paper-audience-categories.sql": "living-paper",
    "2026-10-01-personal-life-vestigial-planes.sql": "personal-life",
}


def sql_of(stmt):
    return M.strip_sql(M.body(stmt))


def analyse(text):
    """What one migration file creates, adds, drops and writes. Backup tables a file creates for itself are not counted as objects."""
    creates, columns, drops, writes = [], [], [], []
    for s in M.statements(text):
        b = sql_of(s.replace("__INCOMPLETE__", "", 1))
        m = CREATE.match(b)
        if m:
            kind, name = m.group(1).lower(), m.group(2)
            if not (kind == "table" and BAK.match(name)):
                creates.append((kind, name))
            continue
        m = ADD_COL.match(b)
        if m:
            columns.append((m.group(1), m.group(2)))
            continue
        m = DROP.match(b)
        if m:
            drops.append((m.group(1).lower(), m.group(2)))
            continue
        m = WRITE.match(b)
        if not m and re.match(r"(?is)^\s*WITH\b", b):
            # WITH v(...) AS (VALUES ...) INSERT INTO t ...: look for the write head outside the string literals.
            m = WITH_WRITE_HEAD.search(re.sub(r"'(?:[^']|'')*'", "''", b))
        if m and not BAK.match(m.group(1)):
            writes.append(m.group(1))
    db = DB_LINE.search(text)
    return {"creates": creates, "columns": columns, "drops": drops, "writes": sorted(set(writes)), "db": db.group(1) if db else None}


def needed_names(infos):
    names = set()
    for i in infos.values():
        names.update(n for _, n in i["creates"])
        names.update(t for t, _ in i["columns"])
        names.update(i["writes"])
    return sorted(names)


def emit_sql(infos):
    q = lambda names: ", ".join("'" + n.replace("'", "''") + "'" for n in names)
    coltables = sorted({t for i in infos.values() for t, _ in i["columns"]}) or ["-"]
    return [
        "SELECT name, type FROM sqlite_master WHERE name IN (" + q(needed_names(infos)) + ")",
        # Column lists are only needed for the tables a file adds a column to.
        "SELECT m.name AS tbl, p.name AS col FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type = 'table' AND m.name IN (" + q(coltables) + ")",
    ]


def snapshot_from_rows(master_rows, column_rows):
    cols = {}
    for r in column_rows:
        cols.setdefault(r["tbl"], []).append(r["col"])
    return {"objects": {r["name"]: r["type"] for r in master_rows}, "columns": cols}


def classify(name, info, snap, dropped_later):
    """(class, detail, recommended_header)"""
    db = info["db"] if info["db"] and info["db"] != "qnfo-audit" else OTHER_DB.get(name)
    if db:
        return "other-db", "targets " + db, "-- APPLY-BY: manual (targets " + db + "; qnfo-audit is the only runner database, verify the objects there)"
    objs = snap["objects"]
    present, missing = [], []
    for kind, n in info["creates"]:
        (present if n in objs else missing).append(kind + ":" + n)
    for t, c in info["columns"]:
        (present if c in snap["columns"].get(t, []) else missing).append("column:" + t + "." + c)
    if present or missing:
        gone = [x for x in missing if x.split(":", 1)[1] in dropped_later]
        if not missing:
            return "applied-live", str(len(present)) + " object(s) exist", "-- APPLY-BY: manual (applied live: " + ", ".join(present[:3]) + (" ..." if len(present) > 3 else "") + " exist in qnfo-audit)"
        if present:
            return "partial", "missing " + ", ".join(missing[:4]), None
        if len(gone) == len(missing):
            return "obsolete", "dropped later: " + ", ".join(sorted(set(dropped_later[x.split(":", 1)[1]] for x in gone))), "-- APPLY-BY: none (obsolete: its objects are dropped by a later migration)"
        return "unapplied", "missing " + ", ".join(missing[:4]), None
    if info["drops"]:
        still = [n for _, n in info["drops"] if n in objs]
        if still:
            return "unapplied", "still present: " + ", ".join(still[:4]), None
        return "applied-live", "dropped objects are absent: " + ", ".join(n for _, n in info["drops"][:3]), "-- APPLY-BY: manual (applied live: " + ", ".join(n for _, n in info["drops"][:3]) + " absent from qnfo-audit)"
    if info["writes"]:
        absent = [t for t in info["writes"] if t not in objs]
        if absent and len(absent) == len(info["writes"]):
            return "obsolete", "writes only tables that no longer exist: " + ", ".join(absent[:3]), "-- APPLY-BY: none (obsolete: it writes only " + ", ".join(absent[:3]) + ", which no longer exist)"
        return "rows-only", "writes " + ", ".join(info["writes"][:4]), "-- APPLY-BY: manual (rows-only: applied by hand before MIGRATION-RUNNER-1; tables " + ", ".join(info["writes"][:3]) + " exist)"
    return "no-effect", "no create, alter or write found", None


def run(allow_names, snapshot=None, mig_dir=MIG_DIR):
    infos = {}
    for n in sorted(allow_names):
        try:
            infos[n] = analyse(open(os.path.join(mig_dir, n), encoding="utf-8").read())
        except OSError:
            infos[n] = None
    present = {n: i for n, i in infos.items() if i}
    # A later file (any migration, by name order) that drops an object the earlier file created.
    dropped_by = {}
    for fname in sorted(os.listdir(mig_dir)):
        if not fname.endswith(".sql"):
            continue
        try:
            d = analyse(open(os.path.join(mig_dir, fname), encoding="utf-8").read())["drops"]
        except OSError:
            continue
        for _, obj in d:
            dropped_by.setdefault(obj, []).append(fname)
    files = []
    for n in sorted(infos):
        if infos[n] is None:
            files.append({"file": n, "class": "missing-file", "detail": "listed in the allowlist but not in migrations/", "header": None})
            continue
        if snapshot is None:
            files.append({"file": n, "class": "unclassified", "detail": "no snapshot", "header": None, "creates": [k + ":" + v for k, v in infos[n]["creates"]], "writes": infos[n]["writes"]})
            continue
        later = {}
        for _, obj in infos[n]["creates"]:
            for f in dropped_by.get(obj, []):
                if f > n:
                    later[obj] = f
        cls, detail, header = classify(n, infos[n], snapshot, later)
        files.append({"file": n, "class": cls, "detail": detail, "header": header})
    return {"infos": present, "files": files}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--allowlist", default=M.ALLOWLIST)
    ap.add_argument("--snapshot", help="JSON {objects: {name: type}, columns: {table: [col]}} or {master: [...], columns: [...]} rows")
    ap.add_argument("--d1", action="store_true", help="read the snapshot from qnfo-audit with two SELECTs (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)")
    ap.add_argument("--emit-sql", action="store_true", help="print the two read-only SELECTs that produce the snapshot")
    ap.add_argument("--summary", action="store_true", help="print only the class counts and the files that need a decision")
    a = ap.parse_args(argv)
    names, expires = M.load_allowlist(a.allowlist)
    base = run(names)
    if a.emit_sql:
        for q in emit_sql(base["infos"]):
            print(q)
        return 0
    snap = None
    if a.snapshot:
        raw = json.load(open(a.snapshot, encoding="utf-8"))
        snap = raw if "objects" in raw else snapshot_from_rows(raw["master"], raw["columns"])
    elif a.d1:
        tok, acct = os.environ.get("CLOUDFLARE_API_TOKEN"), os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        if not tok or not acct:
            print("--d1 needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID", file=sys.stderr)
            return 2
        q1, q2 = emit_sql(base["infos"])
        db = M.DATABASES["qnfo-audit"]
        snap = snapshot_from_rows(M.d1(acct, tok, db, q1), M.d1(acct, tok, db, q2))
    out = run(names, snap)
    counts = {}
    for f in out["files"]:
        counts[f["class"]] = counts.get(f["class"], 0) + 1
    res = {"allowlist_files": len(names), "expires": expires, "counts": counts}
    res["files"] = [f for f in out["files"] if f["class"] in ("partial", "unapplied", "unclassified", "missing-file", "no-effect", "other-db")] if a.summary else out["files"]
    print(json.dumps(res, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
