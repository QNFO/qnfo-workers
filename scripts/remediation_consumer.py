#!/usr/bin/env python3
# REMEDIATION-CONSUMER-1 (2026-09-30)
"""Consume the qnfo-audit `remediation_contracts` registry.

MEASURED STATE BEFORE THIS FILE
  qnfo-audit held 18 active rows in `remediation_contracts`, 8 enabled rows in
  `remediation_modules`, and TWO armed auto-close triggers
  (remediation_verification_autoclose_ins / _upd) that close an `agent_issues`
  row the moment a `remediation_verifications` row lands with pass=1, a trusted
  transport and non-empty expected/observed. What did NOT exist was any process
  that read the contract table, so every contract sat at attempts=0 /
  last_verdict=NULL and the auto-close machine could never fire once.

CONTRACT (do not weaken)
  1. A probe is executed only when it is a LITERAL read-only SELECT. Anything
     else is SKIPPED and stamped `probe-not-machine-executable`; the issue stays
     OPEN. Fail-closed by design: a guessed pass would auto-close a live defect.
  2. The probe MUST return one row carrying `expected` and `observed` (by name,
     or positionally as the first two columns). The consumer never invents either
     value - both come from the probe - so the
     `remediation_verification_evidence_guard_ins` BEFORE-INSERT guard
     (VACUOUS-VERIFICATION-EVIDENCE-1) cannot be tripped and no close can rest on
     a fabricated expectation.
  3. pass = 1 only when expected == observed and both are non-empty.
  4. The verification transport must be `trusted=1` in `transport_trust`, or the
     row is not written at all.
  5. This consumer writes no repository file except its own ci-status artifact.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

CF_API = "https://api.cloudflare.com/client/v4"
ACCOUNT = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or ""
TOKEN = (os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN") or "")
DB_NAME = os.environ.get("REMEDIATION_DB", "qnfo-audit")
DB_ID = os.environ.get("D1_DATABASE_ID", "")
VERIFIER = "remediation-consumer@%s" % (os.environ.get("GITHUB_SHA", "local")[:12])
MAX_ITEMS = int(os.environ.get("REMEDIATION_MAX_ITEMS", "10"))

WRITE_KW = (
    "insert into", "update ", "delete from", "drop table", "drop index",
    "alter table", "create table", "create index", "create trigger",
    "attach ", "detach ", "pragma ", "replace into", "vacuum",
)

CONTRACT_SQL = """
SELECT class, issue_id, precondition, action, verify_probe, verify_transport,
       max_attempts, escalate_to, expected_cadence_h, module, budget_ms,
       next_due_at, max_items, attempts, last_verdict
FROM remediation_contracts
WHERE status = 'active'
  AND (next_due_at IS NULL OR datetime(next_due_at) <= datetime('now'))
ORDER BY COALESCE(next_due_at, ts)
LIMIT ?
"""


def log(msg):
    sys.stderr.write("[consumer] %s\n" % msg)
    sys.stderr.flush()


def _req(method, url, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "qnfo-remediation-consumer/1")
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode("utf-8"))


def resolve_db_id():
    global DB_ID
    if DB_ID:
        return DB_ID
    r = _req("GET", "%s/accounts/%s/d1/database?per_page=100" % (CF_API, ACCOUNT))
    for d in (r.get("result") or []):
        if d.get("name") == DB_NAME:
            DB_ID = d.get("uuid") or d.get("id")
            return DB_ID
    raise RuntimeError("D1 database %r not found for this account" % DB_NAME)


def d1(sql, params=None):
    url = "%s/accounts/%s/d1/database/%s/query" % (CF_API, ACCOUNT, resolve_db_id())
    r = _req("POST", url, {"sql": sql, "params": params or []})
    if not r.get("success"):
        raise RuntimeError("d1 error: %s" % json.dumps(r.get("errors")))
    res = r.get("result") or []
    return (res[0].get("results") or []) if res else []


# PLANE-PROBE-1 (2026-10-01, #1649; owner directive: no dependency on continued Claude usage). Some evidence lives in a
# separate data plane that no QNFO worker may bind (PERSONAL-QNFO-SEPARATION-1): personal-api writes brief_cron_runs to
# personal-life only. A contract whose transport names an allowlisted plane runs its probe against that database through
# the Cloudflare API, read-only and subject to the same literal-SELECT gate. Only the probe's expected/observed tokens
# leave the plane; this repository is public, so a plane probe must never select content. fleet-control's hourly tick
# runs transport 'd1-query' only, so plane contracts are executed here alone.
PLANE_DBS = {"d1-query@personal-life": "e8d6c61a-10b7-4086-b81e-9e6e85afa407"}


def d1_plane(transport, sql):
    url = "%s/accounts/%s/d1/database/%s/query" % (CF_API, ACCOUNT, PLANE_DBS[transport])
    r = _req("POST", url, {"sql": sql, "params": []})
    if not r.get("success"):
        raise RuntimeError("d1 plane error: %s" % json.dumps(r.get("errors")))
    res = r.get("result") or []
    return (res[0].get("results") or []) if res else []


def is_literal_select(sql):
    """A probe may only be a single literal read-only SELECT/WITH statement."""
    s = (sql or "").strip()
    if not s:
        return False, "empty-probe"
    low = s.lower()
    if not (low.startswith("select") or low.startswith("with")):
        return False, "not-a-select"
    for kw in WRITE_KW:
        if kw in low:
            return False, "write-keyword:%s" % kw.strip()
    body = s.rstrip()
    if body.endswith(";"):
        body = body[:-1]
    if ";" in body:
        return False, "multi-statement"
    return True, "ok"


def extract_pair(rows):
    """Pull (expected, observed) from the probe result. Never invents a value."""
    if not rows:
        return None, None
    row = rows[0]
    if not isinstance(row, dict):
        return None, None
    low = {str(k).lower(): v for k, v in row.items()}
    if "expected" in low and "observed" in low:
        return low["expected"], low["observed"]
    vals = list(row.values())
    if len(vals) >= 2:
        return vals[0], vals[1]
    return None, None


def classify(expected, observed):
    """(pass, verdict). None pass means: no verification row may be written."""
    e = "" if expected is None else str(expected).strip()
    o = "" if observed is None else str(observed).strip()
    if not e or not o:
        return None, "vacuous-probe-result"
    if e == o:
        return 1, "pass"
    return 0, "fail"


def _selftest():
    cases = [
        ("SELECT 'a' AS expected, 'a' AS observed", 1, "pass"),
        ("SELECT 'a' AS expected, 'b' AS observed", 0, "fail"),
        ("SELECT NULL AS expected, 'b' AS observed", None, "vacuous-probe-result"),
        ("SELECT '' AS expected, '' AS observed", None, "vacuous-probe-result"),
    ]
    for sql, want_pass, want_verdict in cases:
        rows = [dict(zip(("expected", "observed"), ())) ] if False else None
        # simulate the probe result rather than executing it
        if "NULL" in sql:
            rows = [{"expected": None, "observed": "b"}]
        elif "'' AS expected" in sql:
            rows = [{"expected": "", "observed": ""}]
        else:
            rows = [{"expected": sql.split("'")[1], "observed": sql.split("'")[3]}]
        e, o = extract_pair(rows)
        p, v = classify(e, o)
        if p != want_pass or v != want_verdict:
            print(json.dumps({"ok": False, "case": sql, "got": [p, v],
                              "want": [want_pass, want_verdict]}))
            return 1
    probes = [
        ("SELECT 1", True), ("WITH x AS (SELECT 1) SELECT * FROM x", True),
        ("UPDATE t SET a=1", False), ("SELECT 1; DROP TABLE t", False),
        ("SELECT 1; SELECT 2", False), ("", False),
        ("SELECT * FROM t WHERE a='DELETE FROM'", False),
    ]
    for sql, want in probes:
        got, why = is_literal_select(sql)
        if got != want:
            print(json.dumps({"ok": False, "probe": sql, "got": got, "why": why}))
            return 1
    print(json.dumps({"ok": True, "marker": "REMEDIATION-CONSUMER-1",
                      "selftest": "classify+probe-guard green"}))
    return 0


def main():
    t0 = time.time()
    out = {"ok": True, "marker": "REMEDIATION-CONSUMER-1", "verifier": VERIFIER,
           "due": 0, "pass": 0, "fail": 0, "skipped": 0, "contracts": []}

    trusted = {r["transport"] for r in d1("SELECT transport FROM transport_trust WHERE trusted = 1")}
    out["trusted_transports"] = sorted(trusted)
    if not trusted:
        out["ok"] = False
        out["error"] = "transport_trust returned no trusted transport; refusing to run"
        print(json.dumps(out))
        return 1

    contracts = d1(CONTRACT_SQL, [MAX_ITEMS])
    out["due"] = len(contracts)
    log("due contracts: %d" % len(contracts))

    for c in contracts:
        cls = c.get("class")
        rec = {"class": cls, "issue_id": c.get("issue_id"), "verdict": None}
        try:
            ok_probe, why = is_literal_select(c.get("verify_probe"))
            if not ok_probe:
                rec["verdict"] = "probe-not-machine-executable"
                rec["reason"] = why
                out["skipped"] += 1
            else:
                transport = c.get("verify_transport")
                rows = d1_plane(transport, c["verify_probe"]) if transport in PLANE_DBS else d1(c["verify_probe"])
                exp, obs = extract_pair(rows)
                passed, verdict = classify(exp, obs)
                rec["expected"] = exp
                rec["observed"] = obs
                rec["verdict"] = verdict
                if verdict == "vacuous-probe-result":
                    out["skipped"] += 1
                    rec["reason"] = "probe returned no expected/observed pair"
                elif transport not in trusted:
                    out["skipped"] += 1
                    rec["verdict"] = "untrusted-transport"
                    rec["reason"] = "%r not trusted" % transport
                else:
                    d1(
                        "INSERT INTO remediation_verifications "
                        "(issue_id, class, probe_url, transport, expected, observed, pass, verifier) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        [c.get("issue_id"), cls,
                         "d1:remediation_contracts/" + str(cls),
                         transport, str(exp).strip(), str(obs).strip(), passed, VERIFIER],
                    )
                    rec["written"] = True
                    if passed == 1:
                        out["pass"] += 1
                    else:
                        out["fail"] += 1
        except Exception as e:  # noqa: BLE001 - one bad contract must not kill the run
            rec["verdict"] = "probe-error"
            rec["reason"] = str(e)[:300]
            out["skipped"] += 1
            log("contract %s error: %s" % (cls, e))

        cadence = c.get("expected_cadence_h") or 6
        try:
            d1(
                "UPDATE remediation_contracts SET attempts = COALESCE(attempts,0) + 1, "
                "last_attempt_at = datetime('now'), last_verdict = ?, "
                "next_due_at = datetime('now', ?) WHERE class = ?",
                [rec["verdict"], "+%d hours" % int(cadence), cls],
            )
        except Exception as e:  # noqa: BLE001
            log("contract %s stamp failed: %s" % (cls, e))
        out["contracts"].append(rec)

    spent = int((time.time() - t0) * 1000)
    try:
        d1(
            "INSERT INTO remediation_runs "
            "(run_id, module, issue_ids, budget_ms, spent_ms, items_due, items_attempted, "
            " items_pass, items_fail, stopped_reason, checkpoint, evidence, ended_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            ["remediation-consumer-%d" % int(time.time()), "thread-remediation",
             json.dumps([c.get("issue_id") for c in contracts]),
             45000, spent, len(contracts),
             out["pass"] + out["fail"], out["pass"], out["fail"],
             "completed",
             json.dumps({"contracts": out["contracts"]})[:4000],
             json.dumps({"verifier": VERIFIER, "trusted": sorted(trusted)})],
        )
    except Exception as e:  # noqa: BLE001
        log("run record failed: %s" % e)

    out["spent_ms"] = spent
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    if not TOKEN or not ACCOUNT:
        print(json.dumps({"ok": False, "marker": "REMEDIATION-CONSUMER-1",
                          "error": "CLOUDFLARE_API_TOKEN / CF_ACCOUNT_ID not set"}))
        sys.exit(0)
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "marker": "REMEDIATION-CONSUMER-1",
                          "error": str(exc)[:500]}))
        sys.exit(0)
