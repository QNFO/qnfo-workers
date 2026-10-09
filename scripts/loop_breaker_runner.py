#!/usr/bin/env python3
"""LOOP-BREAKER-1 and DOCTRINE-AUDIT-1 filing from the GitHub runner (2026-10-09, pillar autonomy; agent_issues 2183, 2181).

WHAT  1. Reads qnfo-audit.v_loop_breaker_signatures (2026-10-09-06): an error signature seen 3 or more times in 24 h that
         recurred in the last 2 h gets one open LOOP-BREAKER-1 issue (deduped on the open title), and its issue-<id> contract
         gets a probe that passes once the signature has not recurred for 6 hours.
      2. Once per ISO week, files DOCTRINE-AUDIT-<year>-W<week>: the v_doctrine_scorecard_v2 clause furthest from its target,
         with the measured value, and a probe that passes when the clause reaches the target. It never edits the doctrine
         (amendments land by PR).
WHY   An agent_issues insert from a fleet_tick trigger nests the issue triggers past D1's 10 levels (D1-TRIGGER-DEPTH-1);
      the runner writes at depth 0. Deterministic: no model call.
RUNS  A step of remediation-consumer.yml (hourly). Never fails the job.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import remediation_consumer as RC  # noqa: E402

TITLE = "LOOP-BREAKER-1: %s: %s"
# Scorecard clauses with their targets (doctrine sections) and the direction that is good.
CLAUSES = [
    ("silent_drops", 0, "section 6, no silent drop"),
    ("issues_unaccounted", 0, "section 6, issue accounting"),
    ("spofs_on_critical_path", 0, "section 10, single points of failure with an untested alternate"),
    ("controls_on_critical_path_untested", 0, "section 11, controls on a critical path without a tested alternate"),
    ("beliefs_unverified_60m", 0, "section 5, beliefs acted on without a fresh probe"),
    ("failure_modes_unprobed_pct", 0, "section 12, failure modes without a detector"),
    ("root_causes_unremediated", 0, "section 12, recurring root causes"),
]


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def now_ms():
    return int(time.time() * 1000)


def file_issue(d1, title, description, probe, priority="high", category="reliability", source="loop-breaker"):
    if d1("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1", [title]):
        return None
    d1("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) "
       "VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?6)", [title, description, source, category, priority, now_ms()])
    row = d1("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' ORDER BY id DESC LIMIT 1", [title])
    if not row:
        return None
    iid = int(row[0]["id"])
    d1("UPDATE remediation_contracts SET verify_probe = ?1, verify_transport = 'd1-query', status = 'active' WHERE class = ?2",
       [probe, "issue-%d" % iid])
    return iid


def loop_breakers(d1):
    filed = []
    rows = d1("SELECT src, producer, sig, n, last_ts, example FROM v_loop_breaker_signatures "
              "WHERE datetime(last_ts) > datetime('now', '-2 hours') ORDER BY n DESC LIMIT 10")
    for r in rows:
        producer, sig = str(r.get("producer") or "?")[:60], str(r.get("sig") or "")
        if not sig.strip():
            continue
        title = TITLE % (producer, sig)
        probe = ("SELECT '1' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM v_loop_breaker_signatures WHERE producer = %s AND sig = %s "
                 "AND datetime(last_ts) > datetime('now', '-6 hours')) THEN '1' ELSE '0' END AS observed") % (q(producer), q(sig))
        desc = ("Charter pillar: autonomy (doctrine revision 2 section 2, loop breaker). The same failure recurred %s times in 24 h "
                "(source %s, producer %s, last %s). One defect is the likely root cause; fix it rather than retrying. "
                "Example: %s\nCloses when the signature has not recurred for 6 hours (v_loop_breaker_signatures)."
                % (r.get("n"), r.get("src"), producer, r.get("last_ts"), str(r.get("example") or "")[:300]))
        iid = file_issue(d1, title, desc, probe)
        if iid:
            filed.append(iid)
    return filed


def doctrine_audit(d1, week=None):
    week = week or time.strftime("%G-W%V", time.gmtime())
    title = "DOCTRINE-AUDIT-" + week
    if d1("SELECT id FROM agent_issues WHERE title = ?1 LIMIT 1", [title]):
        return None
    card = (d1("SELECT * FROM v_doctrine_scorecard_v2") or [{}])[0]
    worst = None
    for key, target, clause in CLAUSES:
        v = card.get(key)
        if v is None:
            continue
        gap = float(v) - target
        if gap > 0 and (worst is None or gap > worst[0]):
            worst = (gap, key, target, clause, v)
    if not worst:
        return None
    gap, key, target, clause, v = worst
    probe = ("SELECT '1' AS expected, CASE WHEN (SELECT %s FROM v_doctrine_scorecard_v2) <= %s THEN '1' ELSE '0' END AS observed" % (key, target))
    desc = ("Charter pillar: autonomy (doctrine revision 2 sections 5 and 10, weekly self-audit). Weakest clause this week by "
            "v_doctrine_scorecard_v2: %s = %s (target %s), %s. Build the machinery that moves it (a detector, an alternate path, "
            "a probe); amendments to the doctrine itself land by PR. Closes when the clause reaches its target." % (key, v, target, clause))
    return file_issue(d1, title, desc, probe, priority="medium", category="governance", source="doctrine-audit")


def main(d1=None):
    d1 = d1 or RC.d1
    out = {"loop_breaker": "ok"}
    try:
        out["filed"] = loop_breakers(d1)
    except Exception as e:  # noqa: BLE001
        out["loop_breaker"] = "failed: " + str(e)[:200]
    try:
        out["doctrine_audit"] = doctrine_audit(d1)
    except Exception as e:  # noqa: BLE001
        out["doctrine_audit"] = "failed: " + str(e)[:200]
    print(json.dumps(out))
    return 0


def selftest():
    import sqlite3
    c = sqlite3.connect(":memory:")
    c.executescript("""
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, verify_transport TEXT, status TEXT);
CREATE TRIGGER birth AFTER INSERT ON agent_issues BEGIN INSERT INTO remediation_contracts VALUES ('issue-' || NEW.id, 'needs', 'd1-query', 'needs-machine-probe'); END;
CREATE TABLE sigs (src TEXT, producer TEXT, sig TEXT, n INTEGER, last_ts TEXT, example TEXT);
CREATE VIEW v_loop_breaker_signatures AS SELECT * FROM sigs;
CREATE TABLE card (silent_drops INTEGER, issues_unaccounted INTEGER, failure_modes_unprobed_pct INTEGER);
CREATE VIEW v_doctrine_scorecard_v2 AS SELECT * FROM card;
INSERT INTO card VALUES (0, 3, 90);
""")
    c.execute("INSERT INTO sigs VALUES ('event', 'qnfo-research-exec', 'slot : D_ERROR: no such column: zenodo_enabled', 11, strftime('%Y-%m-%dT%H:%M:%SZ','now'), 'x')")
    c.execute("INSERT INTO sigs VALUES ('event', 'old', 'stale sig', 5, '2020-01-01T00:00:00Z', 'x')")

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    assert main(d1) == 0 and main(d1) == 0
    titles = [r[0] for r in c.execute("SELECT title FROM agent_issues ORDER BY id")]
    assert titles == ["LOOP-BREAKER-1: qnfo-research-exec: slot : D_ERROR: no such column: zenodo_enabled", "DOCTRINE-AUDIT-" + time.strftime("%G-W%V", time.gmtime())], titles
    probes = dict(c.execute("SELECT class, verify_probe FROM remediation_contracts"))
    assert all(p.startswith("SELECT '1' AS expected") for p in probes.values()), probes
    assert d1(probes["issue-1"])[0]["observed"] == "0"
    c.execute("UPDATE sigs SET last_ts = '2020-01-01T00:00:00Z'")
    assert d1(probes["issue-1"])[0]["observed"] == "1"
    assert "failure_modes_unprobed_pct" in c.execute("SELECT description FROM agent_issues WHERE id = 2").fetchone()[0]
    print("loop_breaker_runner selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
