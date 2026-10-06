#!/usr/bin/env python3
"""Offline tests for PROBE-TEMPLATES-1 (migrations/2026-10-06-probe-templates.sql, transformation lever T5.2).

Builds a local replica of the production schema (agent_issues, remediation_contracts, analytics_metric_triggers,
v_metric_trigger_state with its three value sources, cloud_ops_events; DDL copied from qnfo-audit on 2026-10-06), applies
the migration through scripts/apply_migrations.py's own statement splitter, and proves: a new METRIC-TRIGGER-<id> issue's
placeholder contract becomes an active d1-query probe that passes only when that trigger's verdict reads hit = 0 on a
measured value (unmeasured, disabled and breaching all read 0); only the integer trigger id from the title reaches the probe
text (no SQL built from unsafe data); TOOL-FAILURE issues are deliberately not templated; other families stay
needs-machine-probe; existing placeholders of open issues are templated once; generated rows are marked
probe-template-v1; the migration passes the runner's --check and is idempotent.
Run: python3 scripts/probe_templates_test.py   (prints "N passed, 0 failed")
"""
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import apply_migrations as M  # noqa: E402

MIG = os.path.join(HERE, "..", "migrations", "2026-10-06-probe-templates.sql")
passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + str(extra)[:400]))


db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE analytics_dash_meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE analytics_dash_records(metric TEXT PRIMARY KEY, value INTEGER);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE VIEW v_metric_trigger_state AS
WITH raw AS (
  SELECT t.id, t.metric_key, t.title, t.operator, t.threshold, t.owner, t.queue_target, t.priority,
    COALESCE(
      CASE WHEN t.source_table = 'records' THEN (SELECT CASE WHEN rtrim(trim(x.value), '% ') <> '' AND rtrim(trim(x.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(x.value), '% ') AS REAL) END FROM analytics_dash_records x WHERE x.metric = t.metric_key) END,
      (SELECT CASE WHEN rtrim(trim(m.value), '% ') <> '' AND rtrim(trim(m.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(m.value), '% ') AS REAL) END FROM analytics_dash_meta m WHERE m.key = t.metric_key),
      (SELECT CASE WHEN rtrim(trim(r.last_value), '% ') <> '' AND rtrim(trim(r.last_value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(r.last_value), '% ') AS REAL) END FROM metric_registry r WHERE r.metric = t.metric_key)
    ) AS val
  FROM analytics_metric_triggers t WHERE t.enabled = 1
)
SELECT id, metric_key, title, operator, threshold, owner, queue_target, priority, val,
  CASE WHEN val IS NULL THEN NULL
       WHEN operator = 'gt' THEN val > threshold
       WHEN operator = 'lte' THEN val <= threshold
       WHEN operator = 'lt' THEN val < threshold
       WHEN operator = 'eq' THEN val = threshold
       ELSE val >= threshold END AS hit
FROM raw;
""")


def issue(title, status="open"):
    return db.execute("INSERT INTO agent_issues (title, status) VALUES (?, ?)", (title, status)).lastrowid


def placeholder(iid):
    db.execute("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES (?, ?, 'issue open', 'x', 'needs-machine-probe', 'needs-machine-probe', 'x', 'needs-machine-probe')", ("issue-" + str(iid), iid))


def contract(iid):
    return db.execute("SELECT status, verify_transport, verify_probe, module FROM remediation_contracts WHERE class = ?", ("issue-" + str(iid),)).fetchone()


def probe(iid):
    sql = contract(iid)[2]
    r = db.execute(sql).fetchone()
    return r[1] if r else None


# Existing placeholders before the migration (an open METRIC-TRIGGER, a closed one, an unrelated one).
db.execute("INSERT INTO analytics_metric_triggers (id, metric_key, operator, threshold) VALUES (404, 'social_engagement_rate_30d', 'lt', 0.2)")
db.execute("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES ('social_engagement_rate_30d', 'fleet', 'leading', '0')")
old_open = issue("METRIC-TRIGGER-404-SOCIAL-ENGAGEMENT-RATE-30D: Reach gap")
old_closed = issue("METRIC-TRIGGER-404-OLD: closed one", "closed")
other = issue("TWIN-NATIVE-TOOLS-1: a feature")
for i in (old_open, old_closed, other):
    placeholder(i)

text = open(MIG, encoding="utf-8").read()
okp, problems, info = M.plan("migrations/2026-10-06-probe-templates.sql", text)
ok(okp and not problems and info["destructive"] == 0, "the migration passes the runner's --check (opted in, rollback line, nothing destructive)", (problems, info))
for s in M.statements(text):
    db.execute(s)
db.commit()

c = contract(old_open)
ok(c[0] == "active" and c[1] == "d1-query" and c[3] == "probe-template-v1", "an open METRIC-TRIGGER issue's existing placeholder is templated once", c)
ok(contract(old_closed)[0] == "needs-machine-probe" and contract(other)[0] == "needs-machine-probe", "closed issues and other families are left alone")
ok(probe(old_open) == "0", "the probe reads 0 while the trigger is in breach (0 < 0.2)")
db.execute("UPDATE metric_registry SET last_value = '0.35' WHERE metric = 'social_engagement_rate_30d'")
ok(probe(old_open) == "1", "the probe reads 1 once the trigger's own verdict clears (0.35 >= 0.2)")
db.execute("UPDATE metric_registry SET last_value = 'n/a' WHERE metric = 'social_engagement_rate_30d'")
ok(probe(old_open) == "0", "an unmeasured value never passes")
db.execute("UPDATE analytics_metric_triggers SET enabled = 0 WHERE id = 404")
db.execute("UPDATE metric_registry SET last_value = '0.9' WHERE metric = 'social_engagement_rate_30d'")
ok(probe(old_open) == "0", "a disabled trigger never passes")
db.execute("UPDATE analytics_metric_triggers SET enabled = 1 WHERE id = 404")

# New issues born after the migration: the trigger templates them at insert.
db.execute("INSERT INTO analytics_metric_triggers (id, metric_key, operator, threshold) VALUES (395, 'ask_retrieval_mrr', 'lt', 0.3)")
db.execute("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES ('ask_retrieval_mrr', 'fleet', 'quality', '0.2969')")
mt = issue("METRIC-TRIGGER-395-ASK-RETRIEVAL-MRR: quality gap")
placeholder(mt)
ok(contract(mt)[0] == "active" and contract(mt)[3] == "probe-template-v1" and probe(mt) == "0", "a new METRIC-TRIGGER issue is born with an active probe that reads its trigger", contract(mt))
db.execute("UPDATE metric_registry SET last_value = '0.95' WHERE metric = 'ask_retrieval_mrr'")
ok(probe(mt) == "1", "it passes when that metric recovers")

tf = issue("TOOL-FAILURE: ops_d1_query [error]")
placeholder(tf)
ok(contract(tf)[0] == "needs-machine-probe" and contract(tf)[2] == "needs-machine-probe", "a TOOL-FAILURE issue is not templated (its 7-day probe would fail for ever)", contract(tf))
evil = issue("METRIC-TRIGGER-x'); DROP TABLE agent_issues; -- [error]")
placeholder(evil)
ok(contract(evil)[0] == "needs-machine-probe", "a METRIC-TRIGGER title without an integer id is never templated", contract(evil))
evil2 = issue("METRIC-TRIGGER-7'); DROP TABLE agent_issues; --: x")
db.execute("INSERT INTO analytics_metric_triggers (id, metric_key, operator, threshold) VALUES (7, 'm7', 'gte', 5)")
placeholder(evil2)
ok(contract(evil2)[0] == "active" and "id = 7)" in contract(evil2)[2] and "DROP" not in contract(evil2)[2], "only the integer id reaches the probe text, never the rest of the title", contract(evil2))
ok(db.execute("SELECT COUNT(*) FROM agent_issues").fetchone()[0] >= 6, "nothing was dropped")
ok(contract(mt)[3] == "probe-template-v1" and db.execute("SELECT attempts, next_due_at IS NOT NULL FROM remediation_contracts WHERE class = ?", ("issue-" + str(mt),)).fetchone() == (0, 1), "a templated contract is due now with zero attempts")

nf = issue("Q08-PUBLISH-STALL-AUTO-1: q08 stalled")
placeholder(nf)
ok(contract(nf)[0] == "needs-machine-probe", "an unknown family stays needs-machine-probe")

# Idempotent: a second application changes nothing (CREATE TRIGGER IF NOT EXISTS, UPDATE only placeholders).
before = db.execute("SELECT class, status, verify_probe FROM remediation_contracts ORDER BY class").fetchall()
for s in M.statements(text):
    db.execute(s)
after = db.execute("SELECT class, status, verify_probe FROM remediation_contracts ORDER BY class").fetchall()
ok(before == after, "applying the migration twice changes nothing")

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
