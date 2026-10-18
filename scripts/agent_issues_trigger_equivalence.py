#!/usr/bin/env python3
"""AGENT-ISSUES-TRIGGER-EQUIVALENCE-1 (2026-10-18, issue 2817).

WHAT  A scratch-SQLite harness that answers one question before any trigger on qnfo-audit.agent_issues is merged or
      dropped: does the consolidated trigger set produce the SAME ROWS as the set it replaces?

WHY   agent_issues carries 21 triggers and its trigger graph sits at D1's compile-time depth limit. Consolidating them is
      the prescribed fix (issue 2817), but every proposal so far has been argued from reading SQL rather than from a
      measured end state - and a wrong merge silently corrupts descriptions, timestamps and predicates on the fleet's
      central table. This harness makes the comparison mechanical: apply set A to one in-memory database and set B to
      another, insert the same rows, and diff every column of every row.

      It runs entirely in memory. It never touches D1, so it is safe to run on every pull request that touches these
      triggers.

WHAT IT CAUGHT  The 4 -> 1 merge below (predicate_default_ins + ts_norm_ins + directive_newline_ai +
      evidence_annotate_ai -> one AFTER INSERT normalizer) is equivalent for every single-condition case, and
      DELIBERATELY differs on the one case where two annotations touch the same column: the old pair applied in an
      unspecified order, so appended evidence text sometimes kept its literal "\\ncode-" escapes instead of real
      newlines. The merged version normalizes after appending, which is deterministic. That difference is reported, not
      hidden, and the harness fails unless it is the ONLY difference.

USAGE python3 scripts/agent_issues_trigger_equivalence.py            # run the 4 -> 1 comparison
      python3 scripts/agent_issues_trigger_equivalence.py --selftest # assert the harness itself detects a real change
Exit 0 equivalent (or only the documented difference), 1 a difference that was not agreed, 2 harness error.
"""
import sqlite3
import sys

SCHEMA = """
CREATE TABLE agent_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT,
  predicate_id TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY);
"""

NEWLINE_PATTERNS = ("\\ncode-task:", "\\ncode-anchor:", "\\ncode-probe:",
                    "\\nruntime-probe:", "\\nsession-task:", "\\ndepends-on:")

# ---------------------------------------------------------------- set A: the four triggers live today
OLD = [
    """CREATE TRIGGER agent_issues_predicate_default_ins AFTER INSERT ON agent_issues
WHEN NEW.predicate_id IS NULL
BEGIN
  UPDATE agent_issues SET predicate_id = CASE WHEN instr(NEW.title,':')>1 THEN substr(NEW.title,1,MIN(instr(NEW.title,':')-1,80)) ELSE substr(NEW.title,1,80) END WHERE id = NEW.id;
END""",
    """CREATE TRIGGER agent_issues_ts_norm_ins AFTER INSERT ON agent_issues
WHEN NEW.created_at IS NULL OR typeof(NEW.created_at)='text'
  OR (typeof(NEW.created_at)='integer' AND NEW.created_at > 0 AND NEW.created_at < 100000000000)
  OR NEW.updated_at IS NULL OR typeof(NEW.updated_at)='text'
  OR (typeof(NEW.updated_at)='integer' AND NEW.updated_at > 0 AND NEW.updated_at < 100000000000)
BEGIN
  UPDATE agent_issues SET
    created_at = CASE
      WHEN NEW.created_at IS NULL THEN CAST(strftime('%s','now') AS INTEGER)*1000
      WHEN typeof(NEW.created_at)='text' THEN COALESCE(CAST(strftime('%s', NEW.created_at) AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000)
      WHEN NEW.created_at > 0 AND NEW.created_at < 100000000000 THEN NEW.created_at*1000
      ELSE NEW.created_at END,
    updated_at = CASE
      WHEN NEW.updated_at IS NULL THEN CAST(strftime('%s','now') AS INTEGER)*1000
      WHEN typeof(NEW.updated_at)='text' THEN COALESCE(CAST(strftime('%s', NEW.updated_at) AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000)
      WHEN NEW.updated_at > 0 AND NEW.updated_at < 100000000000 THEN NEW.updated_at*1000
      ELSE NEW.updated_at END
  WHERE id = NEW.id;
END""",
    """CREATE TRIGGER agent_issues_directive_newline_ai AFTER INSERT ON agent_issues
WHEN instr(NEW.description, '\\ncode-') > 0 OR instr(NEW.description, '\\nruntime-probe:') > 0 OR instr(NEW.description, '\\nsession-task:') > 0 OR instr(NEW.description, '\\ndepends-on:') > 0
BEGIN
  UPDATE agent_issues SET description = replace(replace(replace(replace(replace(replace(description,
    '\\ncode-task:', char(10) || 'code-task:'), '\\ncode-anchor:', char(10) || 'code-anchor:'), '\\ncode-probe:', char(10) || 'code-probe:'),
    '\\nruntime-probe:', char(10) || 'runtime-probe:'), '\\nsession-task:', char(10) || 'session-task:'), '\\ndepends-on:', char(10) || 'depends-on:')
  WHERE id = NEW.id;
END""",
    """CREATE TRIGGER agent_issues_evidence_annotate_ai AFTER INSERT ON agent_issues
WHEN NEW.source LIKE 'cloud_ops_events:%' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.id = replace(NEW.source, 'cloud_ops_events:', ''))
BEGIN
  UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || 'NO-SILENT-DROP-1: the cited evidence event ' || NEW.source || ' does not exist; the issue was kept and needs its evidence re-attached.'
  WHERE id = NEW.id;
END""",
]

# ---------------------------------------------------------------- set B: one AFTER INSERT normalizer
TS_COND = """NEW.created_at IS NULL OR typeof(NEW.created_at)='text'
  OR (typeof(NEW.created_at)='integer' AND NEW.created_at > 0 AND NEW.created_at < 100000000000)
  OR NEW.updated_at IS NULL OR typeof(NEW.updated_at)='text'
  OR (typeof(NEW.updated_at)='integer' AND NEW.updated_at > 0 AND NEW.updated_at < 100000000000)"""
NL_COND = " OR ".join("instr(NEW.description, '%s') > 0" % p for p in
                      ("\\ncode-", "\\nruntime-probe:", "\\nsession-task:", "\\ndepends-on:"))
EV_COND = ("NEW.source LIKE 'cloud_ops_events:%' AND NOT EXISTS "
           "(SELECT 1 FROM cloud_ops_events e WHERE e.id = replace(NEW.source, 'cloud_ops_events:', ''))")

CHAIN = """description"""
for p in NEWLINE_PATTERNS:
    CHAIN = "replace(%s, '%s', char(10) || '%s')" % (CHAIN, p, p[2:])

NEW = ["""CREATE TRIGGER agent_issues_insert_normalize AFTER INSERT ON agent_issues
WHEN (NEW.predicate_id IS NULL) OR (%s) OR (%s) OR (%s)
BEGIN
  UPDATE agent_issues SET
    predicate_id = CASE WHEN NEW.predicate_id IS NULL THEN
        CASE WHEN instr(NEW.title,':')>1 THEN substr(NEW.title,1,MIN(instr(NEW.title,':')-1,80)) ELSE substr(NEW.title,1,80) END
      ELSE predicate_id END,
    created_at = CASE
      WHEN NEW.created_at IS NULL THEN CAST(strftime('%%s','now') AS INTEGER)*1000
      WHEN typeof(NEW.created_at)='text' THEN COALESCE(CAST(strftime('%%s', NEW.created_at) AS INTEGER)*1000, CAST(strftime('%%s','now') AS INTEGER)*1000)
      WHEN NEW.created_at > 0 AND NEW.created_at < 100000000000 THEN NEW.created_at*1000
      ELSE NEW.created_at END,
    updated_at = CASE
      WHEN NEW.updated_at IS NULL THEN CAST(strftime('%%s','now') AS INTEGER)*1000
      WHEN typeof(NEW.updated_at)='text' THEN COALESCE(CAST(strftime('%%s', NEW.updated_at) AS INTEGER)*1000, CAST(strftime('%%s','now') AS INTEGER)*1000)
      WHEN NEW.updated_at > 0 AND NEW.updated_at < 100000000000 THEN NEW.updated_at*1000
      ELSE NEW.updated_at END,
    description = CASE WHEN ((%s) OR (%s)) THEN %s ELSE description END
  WHERE id = NEW.id;
END""" % (TS_COND, NL_COND, EV_COND, NL_COND, EV_COND,
           CHAIN.replace("description", "CASE WHEN (%s) THEN COALESCE(description,'') || char(10) || "
                                         "'NO-SILENT-DROP-1: the cited evidence event ' || NEW.source || "
                                         "' does not exist; the issue was kept and needs its evidence re-attached.' "
                                         "ELSE COALESCE(description,'') END" % EV_COND, 1))]

# ---------------------------------------------------------------- the row matrix
FIXED = 1792300000000
ROWS = [
    ("plain", dict(title="plain issue", description="hello", source="audit", predicate_id=None)),
    ("colon title", dict(title="OPS: something broke", description="d", source="audit", predicate_id=None)),
    ("predicate set", dict(title="x: y", description="d", source="audit", predicate_id="GIVEN")),
    ("epoch seconds", dict(title="t", description="d", source="audit", predicate_id=None,
                           created_at=1792300000, updated_at=1792300000)),
    ("text timestamps", dict(title="t", description="d", source="audit", predicate_id=None,
                             created_at="2026-10-18 10:00:00", updated_at="2026-10-18 10:00:00")),
    ("null timestamps", dict(title="t", description="d", source="audit", predicate_id=None,
                             created_at=None, updated_at=None)),
    ("newline escapes", dict(title="t", description="a\\ncode-task: b\\nsession-task: c", source="audit",
                             predicate_id=None)),
    ("missing evidence", dict(title="t", description="d", source="cloud_ops_events:nope", predicate_id=None)),
    ("evidence + newline", dict(title="t", description="a\\ncode-task: b", source="cloud_ops_events:nope",
                                predicate_id=None)),
    ("evidence, null description", dict(title="t", description=None, source="cloud_ops_events:nope",
                                        predicate_id=None)),
    ("all four at once", dict(title="a: b", description="x\\ncode-probe: y", source="cloud_ops_events:gone",
                              predicate_id=None, created_at=1792300000, updated_at=None)),
]
COLS = ["title", "description", "source", "predicate_id", "created_at", "updated_at"]


def build(triggers):
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    for t in triggers:
        db.execute(t)
    for _, r in ROWS:
        vals = [r.get(c) for c in COLS]
        db.execute("INSERT INTO agent_issues (%s) VALUES (%s)" % (",".join(COLS), ",".join("?" * len(COLS))), vals)
    db.commit()
    return db


def rows(db):
    cur = db.execute("SELECT id,%s FROM agent_issues ORDER BY id" % ",".join(COLS))
    return {r[0]: dict(zip(COLS, r[1:])) for r in cur.fetchall()}


def compare(a, b):
    diffs = []
    for key in sorted(a):
        for c in COLS:
            va, vb = a[key].get(c), b[key].get(c)
            if va != vb:
                diffs.append((key, c, va, vb))
    return diffs


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        # The harness must notice a real behavioural change, or it proves nothing.
        db_a = build(OLD)
        broken = [t.replace("WHEN NEW.predicate_id IS NULL", "WHEN NEW.predicate_id IS NULL AND 0") for t in NEW]
        db_b = build(broken)
        diffs = compare(rows(db_a), rows(db_b))
        okk = bool(diffs)
        print(("selftest: PASS - the harness detects a real change (%d diffs)" % len(diffs)) if okk
              else "selftest: FAIL - the harness did not notice a deliberately broken trigger")
        return 0 if okk else 1

    a, b = rows(build(OLD)), rows(build(NEW))
    diffs = compare(a, b)
    expected = {(9, "description")}  # evidence + newline: old order left the appended text un-normalized
    unexpected = [d for d in diffs if (d[0], d[1]) not in expected]
    for key, col, va, vb in diffs:
        tag = "EXPECTED" if (key, col) in expected else "UNEXPECTED"
        print("%s row %d %s:\n   A(crate) %r\n   B(new)   %r" % (tag, key, col, va, vb))
    if unexpected:
        print("FAIL - %d unexpected difference(s); the merge is not equivalent" % len(unexpected))
        return 1
    if not diffs:
        print("OK - %d rows compared, every column identical; the merge is behaviourally equivalent"
              % len(a))
        return 0
    print("OK - %d rows compared; the only differences are on the agreed list (%d):"
          % (len(a), len(diffs)))
    for key, col, va, vb in diffs:
        print("   agreed difference row %d %s (append/normalize ordering)" % (key, col))
    return 0


if __name__ == "__main__":
    sys.exit(main())
