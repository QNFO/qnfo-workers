#!/usr/bin/env python3
"""CONSUMER-PENDING-IS-DEFERRAL-1 offline test (2026-10-19, pillar autonomy; agent_issues 2954, 2826, 2880, 2881, 2953).

A d1-query read whose observed starts with 'pending' means "the probe cannot judge yet". qnfo-fleet-control's tick treats it as a
deferral (verdict 'deferred', no remediation_verifications row, DEFERRAL-NOT-A-FAILURE-1), but the consumer, which probes the same
contracts, wrote pass = 0 and stamped last_verdict 'fail'. Measured 2026-10-19: 223 such rows in 24 h, and the loop-owned contracts
issue-2826, issue-2880 and issue-2881 sat at last_verdict 'fail' on "pending: filed by qnfo-fleet-control, which owns it for 48h", which
is what the autoclose triggers read to refuse the filing loop's own close. The measured-pending shape (a number against a bound, e.g.
"pending: worker_count 33 (needs <= 24)") is still a failure, exactly as the D1 trigger remediation_reopen_on_relapse_d1 counts it.

Runs the real consume_one against an in-memory sqlite behind a fake d1, and checks the consumer's carve-out against the trigger's own WHEN
expression, read from migrations/2026-10-17-measured-pending-triggers.sql, over a corpus of observed strings.

Run: python3 scripts/remediation_consumer_pending_test.py
"""
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "acct")
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "tok")
os.environ.setdefault("CF_API_TOKEN", "tok")

import remediation_consumer as rc  # noqa: E402

fails = 0


def check(cond, msg, extra=None):
    global fails
    if cond:
        print("ok   " + msg)
    else:
        fails += 1
        print("FAIL " + msg + ("" if extra is None else " -- " + repr(extra)))


db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, status TEXT, attempts INTEGER, last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT)")
db.execute("CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT, "
           "expected TEXT, observed TEXT, pass INTEGER, verifier TEXT, verified_at TEXT DEFAULT (datetime('now')))")
probe_read = {}


def fake_d1(sql, params=None):
    s = sql.lstrip()
    if s.startswith("SELECT 'ok' AS expected"):
        return [{"expected": probe_read["expected"], "observed": probe_read["observed"]}]
    if s.startswith("UPDATE remediation_contracts SET attempts") or s.startswith("INSERT INTO remediation_verifications"):
        db.execute(sql, params or [])
        return []
    return []


def run(observed, expected="ok", transport="d1-query", trusted=("d1-query",), status="active"):
    """One consume_one on a d1-query contract whose probe reads (expected, observed); returns (rows, contract, local counters, rec)."""
    db.execute("DELETE FROM remediation_contracts")
    db.execute("DELETE FROM remediation_verifications")
    db.execute("INSERT INTO remediation_contracts (class, status, attempts) VALUES ('issue-1', ?, 4)", (status,))
    probe_read.update(expected=expected, observed=observed)
    c = {"class": "issue-1", "issue_id": 1, "verify_transport": transport, "expected_cadence_h": 1, "max_attempts": 3,
         "verify_probe": "SELECT 'ok' AS expected, 'x' AS observed"}
    rec, local = rc.consume_one(c, set(trusted))
    rows = db.execute("SELECT expected, observed, pass FROM remediation_verifications").fetchall()
    contract = db.execute("SELECT status, attempts, last_verdict FROM remediation_contracts WHERE class = 'issue-1'").fetchone()
    return rows, contract, local, rec


saved = rc.d1
rc.d1 = fake_d1
try:
    # the loop-owned template read that blocked issues 2826, 2880 and 2881
    loop = "pending: filed by qnfo-fleet-control, which owns it for 48h"
    rows, contract, local, rec = run(loop)
    check(rows == [], "a pending read writes no verification row", rows)
    check(contract[2] == "deferred", "the contract is stamped deferred, not fail", contract)
    check(contract[1] == 5 and contract[0] == "active", "the attempt is counted and the contract stays active", contract)
    check(local["skipped"] == 1 and local["fail"] == 0 and local["pass"] == 0, "it counts as skipped, never as a fail", local)
    check(rec["verdict"] == "deferred", "the run record says deferred", rec)
    gate = ("fail", "vacuous-probe-result", "probe-error", "probe-not-machine-executable", "probe-same-account-host")
    check(contract[2] not in gate, "the stamp is not one the autoclose triggers read as a failing sibling", contract)

    for obs in ("pending", "Pending: window not open", "  pending: no data yet", "PENDING", "pending: 7 rows so far", "pending: no limit reached"):
        rows, contract, local, rec = run(obs)
        check(rows == [] and contract[2] == "deferred" and local["fail"] == 0, "deferral variant %r" % obs, (rows, contract, local))

    # a pending read is a deferral even when the probe's expected value equals it (the worker tick checks the read before it compares)
    rows, contract, local, _ = run("pending", expected="pending")
    check(rows == [] and contract[2] == "deferred", "an expected value equal to a pending read does not become a pass", (rows, contract))

    # the measured-pending carve-out: a number against a bound is a failure, as remediation_reopen_on_relapse_d1 counts it
    for obs in ("pending: worker_count 33 (needs <= 24)", "pending: unmanaged_direct_spend_share reads 0.5554 (target <= 0.5, lever: x)",
                "pending: 169 open issues, ceiling 50", "pending: code_task_success_rate_30d 0.34 (needs >= 0.6 on 14 days)",
                "pending: queue 398.8 min > 120"):
        rows, contract, local, rec = run(obs)
        check(len(rows) == 1 and rows[0][2] == 0 and rows[0][1] == obs, "measured-pending keeps its pass = 0 row: %r" % obs, rows)
        check(contract[2] == "fail" and local["fail"] == 1 and local["skipped"] == 0, "measured-pending keeps the fail stamp", (contract, local))

    # other reads keep their paths
    rows, contract, local, _ = run("stale: the filing loop qnfo-fleet-control did not close it within 48h")
    check(len(rows) == 1 and rows[0][2] == 0 and contract[2] == "fail" and local["fail"] == 1, "a stale read is still a failure", (rows, contract))
    rows, contract, local, _ = run("ok")
    check(len(rows) == 1 and rows[0][2] == 1 and contract[2] == "pass" and local["pass"] == 1, "a pass is still written", (rows, contract))
    rows, contract, local, _ = run("closed", expected="closed")
    check(len(rows) == 1 and rows[0][2] == 1 and contract[2] == "pass", "a pass on another token is still written", (rows, contract))
    rows, contract, local, _ = run(None)
    check(rows == [] and contract[2] == "vacuous-probe-result" and local["skipped"] == 1, "an empty observation is still vacuous, not deferred", (rows, contract))
    rows, contract, local, _ = run(loop, trusted=())
    check(rows == [] and contract[2] == "untrusted-transport", "an untrusted transport still reports itself before a deferral", contract)

    # a deferral followed by a real failure writes the failure: the deferral hides nothing
    run(loop)
    rows, contract, local, _ = run("stale: x")
    check(len(rows) == 1 and contract[2] == "fail", "the next real failure is recorded", (rows, contract))
finally:
    rc.d1 = saved


def trigger_when_expression():
    """The pending/measured term of remediation_reopen_on_relapse_d1's WHEN clause, as the migration that reproduces the live trigger has it."""
    text = open(os.path.join(HERE, "..", "migrations", "2026-10-17-measured-pending-triggers.sql"), encoding="utf-8").read()
    m = re.search(r"CREATE TRIGGER remediation_reopen_on_relapse_d1[^\n]*\nWHEN [^\n]*?(\(lower\(trim\(NEW\.observed\)\) NOT LIKE 'pending%')", text)
    if not m:
        return None
    start, depth = m.start(1), 0
    for i in range(start, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[start:i + 1].replace("NEW.observed", ":o")
    return None


expr = trigger_when_expression()
check(expr is not None and "GLOB '*[0-9]*'" in expr and "'%ceiling%'" in expr, "the trigger's measured-pending expression is found in its migration", expr)
corpus = [
    "pending", "pending: filed by qnfo-fleet-control, which owns it for 48h", "Pending: window not open", "  pending: x", "PENDING: 12 target",
    "pending: worker_count 33 (needs <= 24)", "pending: worker_count 32 (needs <= 24)", "pending: 169 open issues, ceiling 50", "pending: 5 CEILING",
    "pending: 5 Target", "pending: 5 THRESHOLD", "pending: 5 Limit", "pending: fewer than 3 seen", "pending: 4 More Than 2", "pending: a>=b 3", "pending: 3 >= 2",
    "pending: x < 5", "pending: 5 > 4", "pending: 5 <= 6", "pending: 5<6", "pending: no limit reached", "pending: no target set", "pending: 7 rows so far",
    "pending: the newest workers best-practice audit reads 0 fail and 41 advisory findings at 2026-10-19T11:38:25Z (target 0)",
    "pending: fleet_ai_run_rate_30d_usd 474.45, workers_ai_cost_30d_usd 167.26 (needs <= 40 on 14 days and <= 25)",
    "stale: the filing loop did not close it within 48h", "ok", "status=404", "0", "closed", "off-target 31455", "pendingly: 5 target", "not pending: 5 target",
]
if expr is not None:
    q = "SELECT %s AS counts_as_failure" % expr
    for obs in corpus:
        sql_says = bool(db.execute(q, {"o": obs}).fetchone()[0])
        py_says = not rc.is_deferred_read(obs)
        check(sql_says == py_says, "same verdict as the D1 trigger on %r (failure: %s)" % (obs, sql_says), (sql_says, py_says))

print("%d failed" % fails if fails else "all passed")
sys.exit(1 if fails else 0)
