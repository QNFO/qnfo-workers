#!/usr/bin/env python3
"""BLOCKER-REDTEAM-AUTO-1 (2026-10-11, pillar autonomy; owner directive 2026-10-11 "Remediate all open items and failure modes,
as well as automatic resolution of root causes for future issues 100% autonomously").

WHY   unverified_blocker_claims read 43 and could never fall: v_blocker_claims expires a red-team after 24 hours, and the only 9
      blocker_redteam rows ever written came from sessions. Doctrine section 3 asks that a blocker be attempted before it is
      believed; nothing attempted any automatically.
WHAT  Each run takes every row of v_blocker_claims and makes one deterministic attempt, recording it in blocker_redteam:
        - an issue claiming the owner is needed is confirmed only by an IDENTITY-BOUND: line in its text, else left counted;
        - an issue that already has a doer (a code-task line or a live work claim; a closing probe verifies, it is not a doer:
          BLOCKER-REDTEAM-AUTO-2) is not blocked: verdict false-belief-removed, naming the doer;
        - an issue claiming a missing token: the repository token is verified live against the Cloudflare API; a success is
          false-belief-removed with the verify result, a refusal is confirmed-with-evidence with the refusal text;
        - an owner card whose why carries an IDENTITY-BOUND: line: confirmed-with-evidence, quoting it (the gate, not this
          runner, reroutes cards without one).
      Anything else is left unrecorded, so it stays counted and visible: this runner never writes a verdict it did not test.
RUNS  A step of remediation-consumer.yml. Deterministic, no model call, never fails the job.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import remediation_consumer as RC  # noqa: E402

ACTOR = "blocker-redteam-runner"
TOKEN_RE = re.compile(r"needs a token|no token", re.I)
OWNER_RE = re.compile(r"owner only|owner-only|needs the owner", re.I)
BOUND_RE = re.compile(r"IDENTITY-BOUND:[^\n]{0,240}")
SURFACES = "surfaces: D1 contract and work-claim ledgers, issue text, Cloudflare token verify API, owner-card why"


def doer_of(d1, iid, desc):
    # BLOCKER-REDTEAM-AUTO-2: a closing probe verifies a fix, it does not do the work, so only a code-loop task line or a
    # live work claim counts as a doer (the first run counted active probes and so cleared owner-bound #1750).
    m = re.search(r"code-task: repo=\S+ path=\S+", desc or "")
    if m:
        return "code-loop task line '%s'" % m.group(0)
    rows = d1("SELECT holder FROM work_claims WHERE issue_id = ?1 AND released_at IS NULL "
              "AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') LIMIT 1", [iid])
    if rows:
        return "live work claim by %s" % rows[0]["holder"]
    return None


def token_attempt(req=None):
    """(ok, evidence). Verifies the repository Cloudflare token the runner holds."""
    req = req or RC._req
    for path in ("/accounts/%s/tokens/verify" % RC.ACCOUNT, "/user/tokens/verify"):
        try:
            r = req("GET", RC.CF_API + path)
        except Exception as e:  # noqa: BLE001
            last = "%s refused: %s" % (path, str(e)[:160])
            continue
        status = ((r or {}).get("result") or {}).get("status")
        if (r or {}).get("success") and status == "active":
            return True, "%s returned status active" % path
        last = "%s returned %s" % (path, json.dumps(r)[:160])
    return False, last


def record(d1, target, claim, attempt, verdict, evidence):
    d1("INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, ts) "
       "VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
       [target, claim[:300], attempt[:300], verdict, (evidence + " | " + SURFACES)[:600], ACTOR])


def main(d1=None, req=None):
    d1 = d1 or RC.d1
    out = {"marker": "BLOCKER-REDTEAM-AUTO-1", "tested": 0, "removed": 0, "confirmed": 0, "left": 0}
    token_result = None
    try:
        claims = d1("SELECT target, text FROM v_blocker_claims")
    except Exception as e:  # noqa: BLE001
        out["error"] = str(e)[:200]
        print(json.dumps(out))
        return 0
    for c in claims:
        target, text = c.get("target") or "", c.get("text") or ""
        try:
            if target.startswith("issue:"):
                iid = int(target.split(":", 1)[1])
                row = d1("SELECT description FROM agent_issues WHERE id = ?1", [iid])
                desc = (row[0].get("description") if row else "") or ""
                bound = BOUND_RE.search(desc)
                if OWNER_RE.search(text + " " + desc):
                    if not bound:
                        out["left"] += 1
                        continue
                    record(d1, target, text, "read the issue's identity-bound statement", "confirmed-with-evidence", bound.group(0))
                    out["confirmed"] += 1
                    out["tested"] += 1
                    continue
                doer = doer_of(d1, iid, desc)
                if doer:
                    record(d1, target, text, "looked for a doer that can close it", "false-belief-removed",
                           "not blocked: " + doer)
                    out["removed"] += 1
                elif TOKEN_RE.search(text + " " + desc):
                    if token_result is None:
                        token_result = token_attempt(req)
                    ok, ev = token_result
                    record(d1, target, text, "verified the repository Cloudflare token live",
                           "false-belief-removed" if ok else "confirmed-with-evidence", ev)
                    out["removed" if ok else "confirmed"] += 1
                else:
                    out["left"] += 1
                    continue
            elif target.startswith("card:"):
                cid = int(target.split(":", 1)[1])
                row = d1("SELECT why FROM human_actions WHERE id = ?1", [cid])
                why = (row[0].get("why") if row else "") or ""
                m = BOUND_RE.search(why)
                if not m:
                    out["left"] += 1
                    continue
                record(d1, target, text, "read the card's identity-bound statement", "confirmed-with-evidence", m.group(0))
                out["confirmed"] += 1
            else:
                out["left"] += 1
                continue
            out["tested"] += 1
        except Exception as e:  # noqa: BLE001 - one claim must not stop the rest
            out.setdefault("errors", []).append("%s: %s" % (target, str(e)[:120]))
    print(json.dumps(out))
    return 0


def selftest():
    import sqlite3
    c = sqlite3.connect(":memory:")
    c.executescript("""
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT);
CREATE TABLE remediation_contracts (class TEXT, issue_id INTEGER, status TEXT, verify_probe TEXT, verify_transport TEXT);
CREATE TABLE work_claims (issue_id INTEGER, holder TEXT, released_at TEXT, expires_at TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY, why TEXT);
CREATE TABLE blocker_redteam (id INTEGER PRIMARY KEY, target TEXT, claim TEXT, attempt TEXT, verdict TEXT, evidence TEXT, actor TEXT, ts TEXT);
CREATE TABLE claims (target TEXT, text TEXT);
CREATE VIEW v_blocker_claims AS SELECT * FROM claims;
INSERT INTO agent_issues VALUES (1, 'blocked on x', 'needs fixing'), (2, 'blocked', 'fix it\ncode-task: repo=qnfo-workers path=a/worker.js'),
  (3, 'needs a token', 'cannot write routes, no token'), (4, 'blocked', 'nothing'), (5, 'blocked', 'claimed'),
  (6, 'owner only', 'needs the owner
IDENTITY-BOUND: a signing act'), (9, 'owner only: x', 'code-task: repo=qnfo-workers path=a/worker.js');
INSERT INTO remediation_contracts VALUES ('issue-1', 1, 'active', 'SELECT 1', 'd1-query'), ('issue-4', 4, 'needs-machine-probe', 'needs-machine-probe', 'd1-query');
INSERT INTO work_claims VALUES (5, 'session_x', NULL, '2999-01-01T00:00:00Z');
INSERT INTO human_actions VALUES (7, 'Post the license.\nIDENTITY-BOUND: a legal act in the owner''s name'), (8, 'just do it');
INSERT INTO claims VALUES ('issue:1', 'blocked on x'), ('issue:2', 'blocked'), ('issue:3', 'needs a token'), ('issue:4', 'blocked'),
  ('issue:5', 'blocked'), ('issue:6', 'owner only'), ('issue:9', 'owner only: x'), ('card:7', 'Post the license'), ('card:8', 'do it');
""")

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def req_ok(method, url, body=None):
        return {"success": True, "result": {"status": "active"}}

    main(d1, req_ok)
    got = {r[0]: (r[1], r[2]) for r in c.execute("SELECT target, verdict, evidence FROM blocker_redteam")}
    assert "issue:1" not in got, "an active probe alone is not a doer"
    assert got["issue:6"][0] == "confirmed-with-evidence" and "signing" in got["issue:6"][1], got
    assert "issue:9" not in got, "an owner claim without IDENTITY-BOUND stays counted"
    assert got["issue:2"][0] == "false-belief-removed" and "code-task" in got["issue:2"][1], got
    assert got["issue:3"][0] == "false-belief-removed" and "active" in got["issue:3"][1], got
    assert "issue:4" not in got, "an untested claim must stay unrecorded"
    assert got["issue:5"][0] == "false-belief-removed" and "session_x" in got["issue:5"][1], got
    assert got["card:7"][0] == "confirmed-with-evidence" and "legal act" in got["card:7"][1], got
    assert "card:8" not in got, got
    assert all("surfaces:" in v[1] for v in got.values())

    def req_no(method, url, body=None):
        raise RuntimeError("HTTP 401")
    assert token_attempt(req_no)[0] is False and "401" in token_attempt(req_no)[1]
    print("blocker_redteam_runner selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
