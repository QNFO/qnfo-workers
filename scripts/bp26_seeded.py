#!/usr/bin/env python3
"""BP26 collector for seeded_false_claim_catch_rate (2026-10-28, charter pillar research; RM-SEEDED-CLAIM-HARNESS-1, agent_issues 1000665).

seeded_false_claim_catch_rate: seeded known-false claims blocked by the verifiers / all seeded, last 7 days (target 1.0).

The result table is qnfo-audit.seeded_claim_runs (migrations/2026-10-28-cluster-e-b-doers.sql): one row per seeded false claim with the gate that
saw it and whether it was caught. The seeds are scripts/seeded-claims.json (known-false statements with the rule each is meant to trip). The
harness that seeds them and writes the rows is a code-task on agent_issues 1000665 (qnfo-research-exec); until a row exists this collector
reports the metric as unknown (None, never 0).

Offline suite: python3 scripts/bp26_seeded.py --selftest
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

SQL = ("SELECT COUNT(*) AS n, COALESCE(SUM(caught), 0) AS c FROM seeded_claim_runs WHERE ts >= datetime('now', '-7 days')")
MISSED = ("SELECT seed_id, gate FROM seeded_claim_runs WHERE ts >= datetime('now', '-7 days') AND caught = 0 ORDER BY ts DESC LIMIT 40")


INSERT = "INSERT INTO seeded_claim_runs (ts, seed_id, gate, caught, detail) VALUES (datetime('now'), ?1, ?2, ?3, ?4)"
LAST = "SELECT MAX(ts) AS ts, datetime('now', '-6 hours') AS cut FROM seeded_claim_runs"


def run_node(root):
    """Run scripts/seeded_claim_harness.mjs; return its parsed JSON, or None when node is absent or the run fails."""
    node = shutil.which("node")
    if not node:
        return None
    try:
        r = subprocess.run([node, os.path.join(root, "scripts", "seeded_claim_harness.mjs")], capture_output=True, text=True, timeout=60, cwd=root)
        return json.loads(r.stdout) if r.returncode == 0 else None
    except Exception:  # noqa: BLE001
        return None


def seed_now(ctx, runner=None):
    """Run the harness at most every 6 hours and record one row per seeded claim. Never raises; a failed harness records nothing."""
    if getattr(ctx, "dry", False):
        return "dry: harness not run"
    try:
        last = (ctx.d1(LAST) or [{}])[0]
        if last.get("ts") and last.get("ts") > last.get("cut", ""):
            return "harness ran within 6 hours"
        out = (runner or run_node)(getattr(ctx, "root", os.getcwd()))
        if not out or not out.get("ok"):
            return "harness not usable: " + str((out or {}).get("reason", "node missing or failed"))[:100]
        for r in out["runs"]:
            ctx.d1(INSERT, [r["seed_id"], r["gate"], int(r["caught"]), str(r.get("detail", ""))[:200]])
        return "harness wrote %d run(s)" % len(out["runs"])
    except Exception as e:  # noqa: BLE001
        return "harness error: " + str(e)[:100]


def collect(ctx, runner=None):
    seed_now(ctx, runner)
    try:
        row = (ctx.d1(SQL) or [{}])[0]
        n, c = int(row.get("n") or 0), int(row.get("c") or 0)
        missed = ctx.d1(MISSED)
    except Exception as e:  # noqa: BLE001
        return [Result("seeded_false_claim_catch_rate", None, "unknown: seeded_claim_runs unreadable: " + str(e)[:100], [])]
    if n == 0:
        return [Result("seeded_false_claim_catch_rate", None, "unknown: seeded_claim_runs holds no run of the last 7 days (the harness has not run or is not usable)", [])]
    rows = [("%s@%s" % (m["seed_id"], m["gate"]), 0, "seeded false claim not caught") for m in missed]
    return [Result("seeded_false_claim_catch_rate", round(c / n, 4), "%d of %d seeded false claims were caught in 7 days (seeded_claim_runs)" % (c, n), rows)]


COLLECTORS = [Collector("seeded_claim_runs", collect, ["seeded_false_claim_catch_rate"], 55)]


def selftest():
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE seeded_claim_runs (id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), seed_id TEXT, gate TEXT, caught INTEGER, detail TEXT)")

    def d1(sql, params=None):
        cur = db.execute(sql, params or [])
        db.commit()
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
    unusable = lambda root: {"ok": False, "reason": "control flagged", "runs": []}  # noqa: E731
    ok(collect(ctx, unusable)[0].value is None, "no run and an unusable harness is unknown, not 0")
    fake = lambda root: {"ok": True, "runs": [{"seed_id": "f1", "gate": "g", "caught": 1, "detail": "x"}, {"seed_id": "f2", "gate": "g", "caught": 0, "detail": "y"}]}  # noqa: E731
    out0 = collect(ctx, fake)[0]
    ok(out0.value == 0.5 and out0.rows[0][0] == "f2@g", "harness rows are written then read: %r" % (out0,))
    ok(d1("SELECT COUNT(*) AS n FROM seeded_claim_runs")[0]["n"] == 2, "two rows written")
    collect(ctx, fake)
    ok(d1("SELECT COUNT(*) AS n FROM seeded_claim_runs")[0]["n"] == 2, "a second call within 6 hours writes nothing")
    db.execute("DELETE FROM seeded_claim_runs")
    ctx.dry = True
    ok(collect(ctx, fake)[0].value is None, "dry run never runs the harness")
    ctx.dry = False
    real = run_node(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ok(real is None or ("ok" in real and "runs" in real), "real harness output has the documented shape")
    db.execute("DELETE FROM seeded_claim_runs")
    ctx.root = "."
    db.executemany("INSERT INTO seeded_claim_runs (ts, seed_id, gate, caught) VALUES (datetime('now', ?), ?, ?, ?)", [
        ("-1 days", "s1", "fabricated-scan", 1), ("-1 days", "s2", "fabricated-scan", 1), ("-2 days", "s3", "citation-gate", 0),
        ("-3 days", "s4", "citation-gate", 1), ("-30 days", "s5", "old", 0)])
    out = collect(ctx, unusable)[0]
    ok(out.value == 0.75, "3 caught of 4 recent runs = 0.75, old run ignored: %r" % (out,))
    ok(len(out.rows) == 1 and out.rows[0][0] == "s3@citation-gate", "the missed seed is evidence")
    bad = Ctx()
    bad.d1 = lambda sql, params=None: (_ for _ in ()).throw(RuntimeError("no such table"))
    ok(collect(bad, unusable)[0].value is None, "unreadable table is unknown")
    print("bp26_seeded selftest %s" % ("ok" if not fails else "FAILED"))
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
