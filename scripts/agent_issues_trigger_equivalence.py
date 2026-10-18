#!/usr/bin/env python3
"""AGENT-ISSUES-TRIGGER-EQUIVALENCE-2 (2026-10-18, issue 2817).

WHAT  A scratch-SQLite harness that answers one question before any trigger on qnfo-audit.agent_issues is merged or
      dropped: does the consolidated trigger set produce the SAME ROWS AND THE SAME SIDE EFFECTS as the set it replaces?

WHY   agent_issues carries 21 triggers and its graph sits at D1's compile-time depth limit. Consolidating is the prescribed
      fix (issue 2817), but a wrong merge silently corrupts descriptions, timestamps, predicates - and, less obviously,
      the counters that the UPDATE-side triggers maintain. Rendering recheck_count differently or writing a different
      number of issue_lifecycle rows is exactly the kind of damage that would take days to attribute.

      Version 1 of this harness compared only the end state of the inserted row, which cannot see the UPDATE side. This
      version models both:
        * the four INSERT-side normalizers, and
        * the three UPDATE-side triggers that the normalizers' own UPDATE statements fire -
              agent_issues_recheck_count_upd   AFTER UPDATE OF updated_at, open -> open  => recheck_count + 1
              agent_issues_ts_norm_upd         AFTER UPDATE OF created_at, updated_at   => re-normalise
              issue_lifecycle_au               AFTER UPDATE OF status when it changes   => INSERT issue_lifecycle
      and it diffs recheck_count and the whole issue_lifecycle table as well as every agent_issues column.

      It runs entirely in memory. It never touches D1, so it is safe to run on every pull request.

WHAT IT CANNOT DO (stated so nobody trusts it past its remit)
      SQLite has no 10-level trigger limit, so this cannot reproduce D1's refusal. It proves BEHAVIOURAL equivalence, not
      compile depth. A consolidation still has to be probed against D1 with apply_migrations.depth_canary before it lands.

USAGE python3 scripts/agent_issues_trigger_equivalence.py            # run the 4 -> 1 comparison
      python3 scripts/agent_issues_trigger_equivalence.py --selftest # assert the harness detects a real change
Exit 0 equivalent, 1 a difference, 2 harness error.
"""
import sqlite3
import sys

SCHEMA = """
CREATE TABLE agent_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT,
  predicate_id TEXT, created_at INTEGER, updated_at INTEGER, recheck_count INTEGER DEFAULT 0
);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY);
CREATE TABLE issue_lifecycle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER, event TEXT, from_status TEXT, to_status TEXT, has_evidence INTEGER
);
"""

NEWLINE_PATTERNS = ("\\ncode-task:", "\\ncode-anchor:", "\\ncode-probe:",
                    "\\nruntime-probe:", "\\nsession-task:", "\\ndepends-on:")

# ---------------------------------------------------------------- shared: the three UPDATE-side triggers
UPDATE_SIDE = [
    """CREATE TRIGGER agent_issues_recheck_count_upd AFTER UPDATE OF updated_at ON agent_issues
WHEN NEW.status='open' AND OLD.status='open' AND OLD.updated_at IS NOT NULL AND NEW.updated_at IS NOT OLD.updated_at
BEGIN UPDATE agent_issues SET recheck_count = COALESCE(recheck_count,0)+1 WHERE id = NEW.id; END""",
    """CREATE TRIGGER agent_issues_ts_norm_upd AFTER UPDATE OF created_at, updated_at ON agent_issues
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
    """CREATE TRIGGER issue_lifecycle_au AFTER UPDATE OF status ON agent_issues
WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence)
  VALUES (NEW.id, CASE WHEN NEW.status IN ('closed', 'resolved', 'wontfix') THEN 'dispositioned' ELSE 'reopened' END, OLD.status, NEW.status,
    CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') THEN 1 ELSE 0 END);
END""",
]
# issue_lifecycle_au reads issue_triage; give the scratch database the column it probes.
SCHEMA += "CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, close_evidence TEXT);"

# ---------------------------------------------------------------- set A: the four INSERT-side triggers live today
INSERT_OLD = [
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
CHAIN_WITH_APPEND = CHAIN.replace(
    "description",
    "CASE WHEN (%s) THEN COALESCE(description,'') || char(10) || "
    "'NO-SILENT-DROP-1: the cited evidence event ' || NEW.source || "
    "' does not exist; the issue was kept and needs its evidence re-attached.' "
    "ELSE COALESCE(description,'') END" % EV_COND, 1)

INSERT_NEW = ["""CREATE TRIGGER agent_issues_insert_normalize AFTER INSERT ON agent_issues
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
END""" % (TS_COND, NL_COND, EV_COND, NL_COND, EV_COND, CHAIN_WITH_APPEND)]

OLD = INSERT_OLD + UPDATE_SIDE
NEW = INSERT_NEW + UPDATE_SIDE

# ---------------------------------------------------------------- the row matrix
ROWS = [
    ("plain", dict(title="plain issue", description="hello", source="audit", status="open", predicate_id=None)),
    ("colon title", dict(title="OPS: something broke", description="d", source="audit", status="open", predicate_id=None)),
    ("predicate set", dict(title="x: y", description="d", source="audit", status="open", predicate_id="GIVEN")),
    ("epoch seconds", dict(title="t", description="d", source="audit", status="open", predicate_id=None,
                           created_at=1792300000, updated_at=1792300000)),
    ("text timestamps", dict(title="t", description="d", source="audit", status="open", predicate_id=None,
                             created_at="2026-10-18 10:00:00", updated_at="2026-10-18 10:00:00")),
    ("valid epoch ms", dict(title="t", description="d", source="audit", status="open", predicate_id=None,
                            created_at=1792300000000, updated_at=1792300123456)),
    ("newline escapes", dict(title="t", description="a\\ncode-task: b\\nsession-task: c", source="audit",
                             status="open", predicate_id=None)),
    ("missing evidence", dict(title="t", description="d", source="cloud_ops_events:nope", status="open",
                              predicate_id=None)),
    ("evidence + newline", dict(title="t", description="a\\ncode-task: b", source="cloud_ops_events:nope",
                                status="open", predicate_id=None)),
    ("evidence, null description", dict(title="t", description=None, source="cloud_ops_events:nope",
                                        status="open", predicate_id=None)),
    ("all four at once", dict(title="a: b", description="x\\ncode-probe: y", source="cloud_ops_events:gone",
                              status="open", predicate_id=None, created_at=1792300000, updated_at=None)),
    ("closed at insert", dict(title="t", description="d", source="audit", status="closed", predicate_id=None)),
]
COLS = ["title", "description", "source", "predicate_id", "created_at", "updated_at", "status", "recheck_count"]

# Post-insert mutations. The INSERT-side merge changes how many UPDATE statements run, and the UPDATE-side triggers are
# what observe that difference - issue_lifecycle_au only fires on a status change and recheck_count_upd only on an
# updated_at change, so without these a green run would say nothing about them.
MUTATIONS = [
    "UPDATE agent_issues SET status='closed' WHERE id=1",
    "UPDATE agent_issues SET status='open' WHERE id=1",
    "UPDATE agent_issues SET updated_at=updated_at+1000 WHERE id=7",
    "UPDATE agent_issues SET description='changed' WHERE id=9",
    "UPDATE agent_issues SET status='wontfix', updated_at=updated_at+60000 WHERE id=12",
]


def build(triggers):
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    for t in triggers:
        db.execute(t)
    for _, r in ROWS:
        vals = [r.get(c) for c in COLS]
        db.execute("INSERT INTO agent_issues (%s) VALUES (%s)" % (",".join(COLS), ",".join("?" * len(COLS))), vals)
    for m in MUTATIONS:
        db.execute(m)
    db.commit()
    return db


def snapshot(db):
    cur = db.execute("SELECT id,%s FROM agent_issues ORDER BY id" % ",".join(COLS))
    issues = {r[0]: dict(zip(COLS, r[1:])) for r in cur.fetchall()}
    life = db.execute("SELECT issue_id,event,from_status,to_status,has_evidence FROM issue_lifecycle ORDER BY id").fetchall()
    return issues, life


def compare(a, b):
    diffs = []
    ia, la = a
    ib, lb = b
    for key in sorted(ia):
        for c in COLS:
            if ia[key].get(c) != ib[key].get(c):
                diffs.append(("agent_issues", key, c, ia[key].get(c), ib[key].get(c)))
    if la != lb:
        diffs.append(("issue_lifecycle", "table", "rows", la, lb))
    return diffs


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        a = snapshot(build(OLD))
        # A merged trigger that forgets the timestamp normalisation must be caught.
        broken = [t.replace("WHEN (NEW.predicate_id IS NULL)", "WHEN 0 AND (NEW.predicate_id IS NULL)")
                  for t in INSERT_NEW] + UPDATE_SIDE
        b = snapshot(build(broken))
        diffs = compare(a, b)
        print(("selftest: PASS - the harness detects a real change (%d diffs)" % len(diffs)) if diffs
              else "selftest: FAIL - the harness did not notice a deliberately broken trigger")
        return 0 if diffs else 1

    a, b = snapshot(build(OLD)), snapshot(build(NEW))
    diffs = compare(a, b)
    for where, key, col, va, vb in diffs:
        print("DIFF %s %s %s:\n   A(crate) %r\n   B(new)   %r" % (where, key, col, va, vb))
    if diffs:
        print("FAIL - %d difference(s); the merge is not equivalent" % len(diffs))
        return 1
    print("OK - %d issues and %d issue_lifecycle rows compared, every column identical "
          "(including recheck_count); the merge is behaviourally equivalent"
          % (len(a[0]), len(a[1])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
