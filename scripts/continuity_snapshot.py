#!/usr/bin/env python3
"""CONTINUITY-SNAPSHOT-1 (2026-10-09, pillar core; doctrine revision 4 section 14 continuity and resurrection, section 12 SPOF
'qnfo-audit D1').

WHAT  Proves the fleet's state can be rebuilt from durable stores alone, from the GitHub runner, without blocking D1 (a full
      D1 export locks the database while it runs, so it is not used):
        1. D1 Time Travel: reads a restore bookmark for qnfo-audit (Cloudflare's point-in-time restore, 30 days).
        2. Logical snapshot of the state tables, paged by rowid, gzipped JSON lines:
             - every table to R2 qnfo-backups continuity/qnfo-audit/<ts>/<table>.jsonl.gz (private);
             - the public-safe subset (the registers and the issue ledger the open dashboard already serves, without
               personal-category issues, owner cards, ops_config or claims) to $SNAPSHOT_DIR, which the workflow uploads as
               an Actions artifact: a second provider, because the repository is public (doctrine section 7).
        3. continuity_snapshots ledger row: per-table live rows and snapshot rows, integrity = worst snapshot/live ratio,
           sha256, Time Travel bookmark; spof_registry 'qnfo-audit D1' gets its alternate and alternate_tested_at.
        4. metric asset_freshness_90d from living-paper (published papers updated in 90 days / published).
      Runs only when the newest ok snapshot is older than 20 hours (--force overrides). Never fails the job.
"""
import gzip
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import remediation_consumer as RC  # noqa: E402

BUCKET = "qnfo-backups"
PAGE = 500
MAX_PAGES = 60
STATE_TABLES = ["agent_issues", "issue_triage", "issue_lifecycle", "agent_issues_tombstone", "remediation_contracts",
                "decision_log", "decision_outcomes", "belief_registry", "spof_registry", "control_registry", "failure_modes",
                "capability_ledger", "blocker_redteam", "metric_registry", "analytics_metric_triggers", "queue_sla",
                "migration_runs", "human_actions", "ops_config", "fleet_budget", "work_claims", "research_queue"]
PRIVATE_TABLES = {"human_actions", "ops_config", "work_claims", "fleet_budget", "research_queue"}


def cf(method, path, body=None, ctype=None, timeout=60):
    req = urllib.request.Request(RC.CF_API + path, data=body, method=method,
                                 headers=dict({"Authorization": "Bearer " + RC.TOKEN}, **({"Content-Type": ctype} if ctype else {})))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return r.status, (json.loads(raw.decode("utf-8", "replace")) if raw[:1] in (b"{", b"[") else {})


def bookmark(call=cf):
    try:
        st, j = call("GET", "/accounts/%s/d1/database/%s/time_travel/bookmark" % (RC.ACCOUNT, RC.resolve_db_id()))
        return ((j or {}).get("result") or {}).get("bookmark")
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"continuity": "time-travel-failed", "error": str(e)[:160]}))
        return None


def r2_put(key, data, call=cf):
    st, _ = call("PUT", "/accounts/%s/r2/buckets/%s/objects/%s" % (RC.ACCOUNT, BUCKET, urllib.parse.quote(key, safe="/")), data, "application/gzip", 120)
    return 200 <= st < 300


def dump_table(d1, table):
    live = int((d1('SELECT COUNT(*) AS n FROM "%s"' % table) or [{"n": 0}])[0]["n"])
    rows, last = [], -1
    for _ in range(MAX_PAGES):
        page = d1('SELECT rowid AS _rowid, * FROM "%s" WHERE rowid > ?1 ORDER BY rowid LIMIT %d' % (table, PAGE), [last])
        if not page:
            break
        rows.extend(page)
        last = page[-1]["_rowid"]
        if len(page) < PAGE:
            break
    return live, rows


def public_rows(table, rows):
    if table in PRIVATE_TABLES:
        return None
    if table in ("agent_issues", "agent_issues_tombstone"):
        return [r for r in rows if str(r.get("category") or "").lower() != "personal"]
    if table in ("issue_triage", "issue_lifecycle", "remediation_contracts"):
        return rows  # ids, states and probes; personal issues' text is not in these tables
    return rows


def gz_lines(rows):
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as g:
        for r in rows:
            g.write((json.dumps(r, ensure_ascii=False, sort_keys=True, default=str) + "\n").encode("utf-8"))
    return buf.getvalue()


def freshness(d1, plane):
    try:
        r = plane("d1-query@living-paper", "SELECT COUNT(*) AS n, SUM(CASE WHEN datetime(updated_at) > datetime('now', '-90 days') THEN 1 ELSE 0 END) AS f FROM papers WHERE status = 'published'")
        n, f = int(r[0].get("n") or 0), int(r[0].get("f") or 0)
        val = round(f / n, 3) if n else 0
        d1("UPDATE metric_registry SET last_value = ?1, last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'asset_freshness_90d'", [str(val)])
        return {"published": n, "fresh_90d": f, "share": val}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:160]}


def main(argv=None, d1=None, plane=None, call=cf, out_dir=None):
    argv = argv if argv is not None else sys.argv[1:]
    d1, plane = d1 or RC.d1, plane or RC.d1_plane
    out_dir = out_dir or os.environ.get("SNAPSHOT_DIR") or ""
    fresh = freshness(d1, plane)
    try:
        recent = d1("SELECT id FROM continuity_snapshots WHERE ok = 1 AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-20 hours') LIMIT 1")
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"continuity": "ledger-missing", "error": str(e)[:160]}))
        return 0
    if recent and "--force" not in argv:
        print(json.dumps({"continuity": "fresh", "freshness": fresh}))
        return 0
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    prefix = "continuity/qnfo-audit/%s/" % stamp
    bm = bookmark(call)
    tables, total, size, digest, worst, errors = {}, 0, 0, hashlib.sha256(), 1.0, []
    for t in STATE_TABLES:
        try:
            live, rows = dump_table(d1, t)
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if "no such table" in msg:
                continue
            errors.append("%s: %s" % (t, msg[:120]))
            worst = 0.0
            continue
        data = gz_lines(rows)
        ok_put = r2_put(prefix + t + ".jsonl.gz", data, call)
        if not ok_put:
            errors.append("%s: r2 put refused" % t)
        pub = public_rows(t, rows)
        if out_dir and pub is not None:
            os.makedirs(out_dir, exist_ok=True)
            with open(os.path.join(out_dir, t + ".jsonl.gz"), "wb") as fh:
                fh.write(gz_lines(pub))
        ratio = (len(rows) / live) if live else 1.0
        worst = min(worst, ratio)
        tables[t] = {"live": live, "snapshot": len(rows), "bytes": len(data), "public": pub is not None}
        total += len(rows)
        size += len(data)
        digest.update(data)
    ok = 1 if (not errors and bm) else 0
    note = "; ".join(errors)[:400] or ("ok" if bm else "no time-travel bookmark")
    try:
        d1("INSERT INTO continuity_snapshots (tables_json, rows_total, bytes, sha256, r2_prefix, artifact, time_travel_bookmark, integrity, ok, note) "
           "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
           [json.dumps(tables)[:20000], total, size, digest.hexdigest(), BUCKET + "/" + prefix,
            ("actions artifact continuity-snapshot run %s" % os.environ.get("GITHUB_RUN_ID", "local")) if out_dir else None,
            bm, round(worst, 4), ok, note])
        if ok:
            d1("UPDATE spof_registry SET alternate_path = ?1, alternate_tested_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE component = 'qnfo-audit D1'",
               ["D1 Time Travel restore bookmark (30 days) plus a daily logical snapshot of the state tables to R2 qnfo-backups "
                "continuity/ and the public-safe subset to a GitHub Actions artifact (scripts/continuity_snapshot.py)"])
        d1("INSERT INTO cloud_ops_events (id, ts, kind, status, text, job) VALUES (?1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'continuity-snapshot', ?2, ?3, 'continuity-snapshot')",
           ["continuity-" + stamp, "ok" if ok else "warn", "CONTINUITY-SNAPSHOT-1 %d rows, %d bytes, integrity %.4f, bookmark %s; %s" % (total, size, worst, "yes" if bm else "no", note)])
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"continuity": "ledger-write-failed", "error": str(e)[:200]}))
    print(json.dumps({"continuity": "ok" if ok else "partial", "rows": total, "bytes": size, "integrity": round(worst, 4),
                      "bookmark": bool(bm), "errors": errors[:5], "freshness": fresh}))
    return 0


def selftest():
    import sqlite3
    import tempfile
    c = sqlite3.connect(":memory:")
    c.executescript("""
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, category TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY, why TEXT);
CREATE TABLE continuity_snapshots (id INTEGER PRIMARY KEY, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), tables_json TEXT, rows_total INTEGER, bytes INTEGER, sha256 TEXT, r2_prefix TEXT, artifact TEXT, time_travel_bookmark TEXT, integrity REAL, ok INTEGER, note TEXT);
CREATE TABLE spof_registry (component TEXT, alternate_path TEXT, alternate_tested_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, status TEXT, text TEXT, job TEXT);
CREATE TABLE metric_registry (metric TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
INSERT INTO spof_registry VALUES ('qnfo-audit D1', NULL, NULL);
INSERT INTO metric_registry VALUES ('asset_freshness_90d', NULL, NULL, NULL);
INSERT INTO human_actions VALUES (1, 'owner card');
""")
    for i in range(1, 1203):
        c.execute("INSERT INTO agent_issues VALUES (?, ?, ?)", [i, "t%d" % i, "personal" if i % 100 == 0 else "ops"])

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, x)) for x in cur.fetchall()]

    puts = []

    def call(method, path, body=None, ctype=None, timeout=60):
        if "time_travel" in path:
            return 200, {"result": {"bookmark": "00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683"}}
        puts.append(path)
        return 200, {}

    RC.resolve_db_id = lambda: "db"
    d = tempfile.mkdtemp()
    assert main(["--force"], d1, lambda t, s: [{"n": 10, "f": 9}], call, d) == 0
    snap = d1("SELECT * FROM continuity_snapshots")[0]
    tj = json.loads(snap["tables_json"])
    assert snap["ok"] == 1 and snap["integrity"] == 1.0 and tj["agent_issues"]["snapshot"] == 1202, snap
    assert any(p.endswith("/agent_issues.jsonl.gz") for p in puts) and any(p.endswith("/human_actions.jsonl.gz") for p in puts)
    assert "human_actions.jsonl.gz" not in os.listdir(d) and "agent_issues.jsonl.gz" in os.listdir(d), os.listdir(d)  # owner cards never reach the public artifact
    with gzip.open(os.path.join(d, "agent_issues.jsonl.gz"), "rt") as fh:
        assert sum(1 for _ in fh) == 1202 - 12  # personal-category issues excluded
    assert d1("SELECT alternate_tested_at FROM spof_registry")[0]["alternate_tested_at"]
    assert d1("SELECT last_value FROM metric_registry")[0]["last_value"] == "0.9"
    assert main([], d1, lambda t, s: [{"n": 0, "f": 0}], call, d) == 0 and len(d1("SELECT id FROM continuity_snapshots")) == 1  # fresh: skipped
    print("continuity_snapshot selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
