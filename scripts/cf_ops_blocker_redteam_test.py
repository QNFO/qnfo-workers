#!/usr/bin/env python3
"""Offline tests for the token-backed blocker-redteam action."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cf_ops_actions as C  # noqa: E402

passed = failed = 0


def ok(condition, label, extra=None):
    global passed, failed
    if condition:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + str(extra)[:300]))


emitted = []
C.emit = emitted.append
queries = []
records = []
claim_rows = [
    {"target": "issue:11", "text": "needs a token for secret-marker"},
    {"target": "issue:12", "text": "blocked secret-marker"},
]
descriptions = {
    11: "No token is available to test the requested operation.",
    12: "No safe target-specific probe is declared.",
}


def d1x(acct, token, db, sql, params=None):
    queries.append((acct, token, db, sql, params))
    if "FROM v_blocker_claims" in sql:
        return True, claim_rows
    if "SELECT description FROM agent_issues" in sql:
        return True, [{"description": descriptions[params[0]]}]
    if "SELECT holder FROM work_claims" in sql:
        return True, []
    if "INSERT INTO blocker_redteam" in sql:
        records.append(params)
        return True, []
    raise AssertionError("unexpected D1 query: " + sql)


api_calls = []


def call(method, path, token, body=None, timeout=60):
    api_calls.append((method, path, token))
    return 200, {"success": True, "result": {"status": "active"}}


C.d1x, C.call = d1x, call
rc = C.blocker_redteam("account-id", "api-token")
result = emitted[-1]
ok(rc == 0 and result["ok"], "the action runs successfully", result)
ok(result == {"action": "blocker-redteam", "ok": True, "tested": 1, "removed": 1, "confirmed": 0, "left": 1},
   "the action reports tested and unsupported claims separately", result)
ok(len(records) == 1 and records[0][0] == "issue:11" and records[0][3] == "false-belief-removed",
   "a supported token test writes the existing red-team ledger", records)
ok(records[0][4].endswith("surfaces: D1 contract and work-claim ledgers, issue text, Cloudflare token verify API, owner-card why"),
   "the runner records its tested surfaces", records)
ok(len(api_calls) == 1 and api_calls[0][0] == "GET" and "/tokens/verify" in api_calls[0][1],
   "the existing Cloudflare token is tested through its read-only verify endpoint", api_calls)
ok(all(c[0] == "account-id" and c[1] == "api-token" and c[2] == C.AUDIT_DB for c in queries),
   "all ledger reads and writes use the explicit account, token and qnfo-audit database")
ok("secret-marker" not in json.dumps(result), "claim text is not emitted to public workflow output", result)

emitted.clear()


def refused_d1(acct, token, db, sql, params=None):
    return False, ["permission denied: private-row-marker"]


C.d1x = refused_d1
rc = C.blocker_redteam("account-id", "api-token")
result = emitted[-1]
ok(rc == 1 and not result["ok"], "a D1 refusal fails the action", result)
ok(result["tested"] == 0 and result["left"] == 0, "a D1 refusal does not claim any target was tested", result)
ok("private-row-marker" not in json.dumps(result), "D1 errors are not copied to public workflow output", result)

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
