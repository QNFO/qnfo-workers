#!/usr/bin/env python3
"""PROBE-AUTHOR-SINK-GUARD-1 offline test, consumer half (2026-10-26, pillar security; agent_issues 1000421).

qnfo-fleet-control 0.54.0 bounds the value of a probe the live-path author writes at birth (one number or one short token). Every later pass of
the contract re-runs the stored SQL and the runner copied the first row's expected and observed untruncated into remediation_verifications and
into its run log, whose first 8000 characters the remediation-consumer workflow commits to main of the public repository. For a contract whose
module is probe-author-1, consume_d1 now raises 'free-text-value' before anything is recorded; consume_one turns it into a probe-error that
names the reason and never the value.

Runs the real consume_one against an in-memory sqlite behind a fake d1.
Run: python3 scripts/remediation_consumer_sink_guard_test.py
"""
import os
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
events = []


def fake_d1(sql, params=None):
    s = sql.lstrip()
    if s.startswith("SELECT 'ok' AS expected"):
        return [{"expected": probe_read["expected"], "observed": probe_read["observed"]}]
    if s.startswith("UPDATE remediation_contracts SET attempts") or s.startswith("INSERT INTO remediation_verifications"):
        db.execute(sql, params or [])
        return []
    if s.startswith("INSERT INTO cloud_ops_events"):
        events.append(params)
        return []
    return []


logged = []
saved_log = rc.log


def fake_log(msg):
    logged.append(str(msg))


def run(observed, expected="ok", module="probe-author-1"):
    db.execute("DELETE FROM remediation_contracts")
    db.execute("DELETE FROM remediation_verifications")
    del events[:]
    del logged[:]
    db.execute("INSERT INTO remediation_contracts (class, status, attempts) VALUES ('issue-1', 'active', 0)")
    probe_read.update(expected=expected, observed=observed)
    c = {"class": "issue-1", "issue_id": 1, "verify_transport": "d1-query", "expected_cadence_h": 1, "max_attempts": 3, "module": module,
         "verify_probe": "SELECT 'ok' AS expected, 'x' AS observed"}
    rec, local = rc.consume_one(c, {"d1-query"})
    rows = db.execute("SELECT expected, observed, pass FROM remediation_verifications").fetchall()
    contract = db.execute("SELECT status, attempts, last_verdict FROM remediation_contracts WHERE class = 'issue-1'").fetchone()
    return rows, contract, local, rec


saved = rc.d1
rc.d1 = fake_d1
rc.log = fake_log
try:
    SECRET = "Rowan Quni-Gudzinas private note: the sentence that must never reach the public run log"
    # a later pass whose observed is a sentence: refused, nothing recorded, the reason is named, the value is not
    rows, contract, local, rec = run(SECRET)
    check(rows == [], "free text in observed writes no verification row", rows)
    check(rec["verdict"] == "probe-error" and rec["reason"] == "free-text-value", "the run record says probe-error with the reason free-text-value", rec)
    check("expected" not in rec and "observed" not in rec, "the run record carries neither value", rec)
    check(SECRET not in repr(rec) and SECRET not in " ".join(logged) and SECRET not in repr(events), "the value is in no record, log line or audit event", (rec, logged, events))
    check(local["skipped"] == 1 and local["pass"] == 0 and local["fail"] == 0, "it counts as skipped, never as pass or fail", local)
    check(contract[2] == "probe-error", "the contract is stamped probe-error (the autoclose triggers read that as a failing sibling)", contract)
    check(len(events) == 1 and "error=free-text-value" in events[0][1] and SECRET not in events[0][1], "one remediation.probe-error audit row names the reason", events)

    # the same through the expected column
    rows, contract, local, rec = run("ok", expected=SECRET)
    check(rows == [] and rec["verdict"] == "probe-error" and rec["reason"] == "free-text-value", "free text in expected is refused the same way", (rows, rec))

    # a 65-character token and a token with a space or a comma are refused; the boundary cases pass
    for bad in ("a" * 65, "two words", "a,b", "x\ny", "a/b", "ünï", "(null)"):
        rows, contract, local, rec = run(bad)
        check(rows == [] and rec["verdict"] == "probe-error", "refused: %r" % bad[:20], (rows, rec))
    for good, exp in (("ok", "ok"), ("0", "0"), ("1234", "1234"), ("closed", "closed"), ("a" * 64, "a" * 64), ("v1.2.3-rc+7:x", "v1.2.3-rc+7:x"), ("3", "0")):
        rows, contract, local, rec = run(good, expected=exp)
        check(len(rows) == 1 and rows[0][1] == good, "a short token is recorded as before: %r" % good[:20], rows)
        check(rec["verdict"] in ("pass", "fail"), "and carries a verdict: %r" % good[:20], rec)

    # empty values keep their old paths (vacuous), a pending read stays a deferral
    rows, contract, local, rec = run(None)
    check(rows == [] and rec["verdict"] == "vacuous-probe-result", "an empty observation is still vacuous, not free text", rec)
    rows, contract, local, rec = run("pending: no data yet")
    check(rows == [] and rec["verdict"] == "probe-error", "a pending sentence on a probe-author contract is free text too (the author's gate allows tokens only)", rec)

    # any other module keeps the old behaviour: free text is recorded, as for the 1919 non-token rows of other probes
    for module in (None, "", "probe-template-v3-generic", "issue-contract-bridge", "failure-mode", "Probe-Author-1"):
        rows, contract, local, rec = run("stale: the filing loop did not close it within 48h", module=module)
        check(len(rows) == 1 and rows[0][1].startswith("stale:") and rec["verdict"] == "fail", "module %r is untouched" % (module,), (rows, rec))
finally:
    rc.d1 = saved
    rc.log = saved_log

check(rc.sink_guard({"module": "probe-author-1"}, "ok", "ok") is None, "sink_guard returns quietly for tokens")
check(rc.SINK_TOKEN_RE.pattern == "[A-Za-z0-9_.:+-]{1,64}", "the token pattern is the one the worker uses", rc.SINK_TOKEN_RE.pattern)

if fails:
    print("%d FAILED" % fails)
    sys.exit(1)
print("all passed")
