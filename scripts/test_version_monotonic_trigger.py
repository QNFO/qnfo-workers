#!/usr/bin/env python3
"""VERSION-MONOTONIC-TUPLE-1: generator + regression test for the ledger's version-monotonic trigger.

WHY
  qnfo-audit.deployment_history carries trigger `deployment_history_version_monotonic_ins`
  (issue #1451) which aborts an insert whose version is lower than the highest already
  recorded for that resource. It compares versions by DELETING THE DOTS and casting to an
  integer, so 2.37.32 -> 23732 and 2.38.2 -> 2382, and the upgrade is rejected as a
  "regression". Measured 2026-09-30: raw_put.py logged
      DEPLOY-LEDGER: HTTP 400 FAILED ... VERSION-MONOTONIC-1: version regresses below ...
  for a qnfo-ops 2.38.2 deploy, and deployment_history has no qnfo-ops row after
  2.37.32 (08:10Z) although 2.38.1 and 2.38.2 were deployed. A deploy that succeeded but
  has no ledger row is what qnfo-deploy-guard files as DEPLOY-UNLOGGED-MUTATION.
  The same trick also ACCEPTS real regressions (2.9.99 after 2.10.0 -> 2999 > 2100).

WHAT THIS DOES
  Builds the replacement trigger (compares (major, minor, patch) as integers) and runs both
  the production trigger text (embedded below, read from sqlite_master on 2026-09-30) and the
  replacement against the same cases on a scratch SQLite DB. Exit 0 only if the replacement
  is right on every case. `--emit` prints the trigger; the test also asserts the committed
  migration file contains exactly that text.

  python3 scripts/test_version_monotonic_trigger.py           # run the test
  python3 scripts/test_version_monotonic_trigger.py --emit    # print the replacement CREATE TRIGGER
"""
import os, sqlite3, sys

# Generates the tuple-compare replacement trigger SQL.
def core(v):  return f"substr({v},1,CASE WHEN instr({v},'-')>0 THEN instr({v},'-')-1 ELSE length({v}) END)"
def looks_versioned(v):
    c = core(v)
    return f"({c} GLOB '[0-9]*.[0-9]*' AND length(replace({c},'.','')) <= 6)"
def vkey(v):
    c = core(v)
    r1 = f"substr({c},instr({c},'.')+1)"
    s1 = f"CAST(substr({c},1,instr({c},'.')-1) AS INTEGER)"
    s2 = f"CAST(CASE WHEN instr({r1},'.')>0 THEN substr({r1},1,instr({r1},'.')-1) ELSE {r1} END AS INTEGER)"
    s3 = f"CASE WHEN instr({r1},'.')>0 THEN CAST(substr({r1},instr({r1},'.')+1) AS INTEGER) ELSE 0 END"
    return f"({s1}*100000000 + {s2}*10000 + {s3})"
NAME = "deployment_history_version_monotonic_ins"
def trigger_sql():
    return (f"CREATE TRIGGER {NAME} BEFORE INSERT ON deployment_history FOR EACH ROW "
      f"WHEN NEW.version_id IS NOT NULL AND NEW.version_id != '' "
      f"AND instr(COALESCE(NEW.notes,''),'ROLLBACK-OK') = 0 "
      f"AND {looks_versioned('NEW.version_id')} "
      f"AND {vkey('NEW.version_id')} < COALESCE((SELECT MAX({vkey('version_id')}) FROM deployment_history "
      f"WHERE resource_name = NEW.resource_name AND {looks_versioned('version_id')}), -1) "
      f"BEGIN SELECT RAISE(ABORT,'VERSION-MONOTONIC-1: version regresses below the highest already deployed for this resource (issue #1451); add ROLLBACK-OK to notes for an intentional rollback.'); END")

OLD = """CREATE TRIGGER deployment_history_version_monotonic_ins BEFORE INSERT ON deployment_history FOR EACH ROW WHEN NEW.version_id IS NOT NULL AND NEW.version_id != '' AND instr(COALESCE(NEW.notes,''),'ROLLBACK-OK') = 0 AND instr(substr(NEW.version_id,1,CASE WHEN instr(NEW.version_id,'-')>0 THEN instr(NEW.version_id,'-')-1 ELSE length(NEW.version_id) END),'.') > 0 AND length(replace(substr(NEW.version_id,1,CASE WHEN instr(NEW.version_id,'-')>0 THEN instr(NEW.version_id,'-')-1 ELSE length(NEW.version_id) END),'.','')) <= 6 AND CAST(replace(substr(NEW.version_id,1,CASE WHEN instr(NEW.version_id,'-')>0 THEN instr(NEW.version_id,'-')-1 ELSE length(NEW.version_id) END),'.','') AS INTEGER) < COALESCE((SELECT MAX(CAST(replace(substr(version_id,1,CASE WHEN instr(version_id,'-')>0 THEN instr(version_id,'-')-1 ELSE length(version_id) END),'.','') AS INTEGER)) FROM deployment_history WHERE resource_name = NEW.resource_name AND instr(substr(version_id,1,CASE WHEN instr(version_id,'-')>0 THEN instr(version_id,'-')-1 ELSE length(version_id) END),'.') > 0 AND length(replace(substr(version_id,1,CASE WHEN instr(version_id,'-')>0 THEN instr(version_id,'-')-1 ELSE length(version_id) END),'.','')) <= 6),-1) BEGIN SELECT RAISE(ABORT,'VERSION-MONOTONIC-1: version regresses below the highest already deployed for this resource (issue #1451); add ROLLBACK-OK to notes for an intentional rollback.'); END"""
def fresh(trigger, seed):
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE deployment_history(id INTEGER PRIMARY KEY, resource_name TEXT, version_id TEXT, notes TEXT)")
    for r,v in seed: db.execute("INSERT INTO deployment_history(resource_name,version_id) VALUES(?,?)",(r,v))
    db.execute(trigger); return db
def ok(db, r, v, notes=None):
    try: db.execute("INSERT INTO deployment_history(resource_name,version_id,notes) VALUES(?,?,?)",(r,v,notes)); return "ACCEPT"
    except sqlite3.IntegrityError as e: return "REJECT"
NEW = trigger_sql()
real = [("qnfo-ops","2.37.31-continuation-inherit"),("qnfo-ops","2.37.32-tool-budget-ceiling-1")]
cases = [  # (name, seed, insert, notes, expected_correct, )
 ("REAL LEDGER: 2.38.2 after 2.37.32 (upgrade)", real, ("qnfo-ops","2.38.2-tool-meta-error-first"), None, "ACCEPT"),
 ("REAL LEDGER: 2.38.1 after 2.37.32 (upgrade)", real, ("qnfo-ops","2.38.1-toolbudget-relock"), None, "ACCEPT"),
 ("true regression 2.37.31 after 2.37.32", real, ("qnfo-ops","2.37.31-x"), None, "REJECT"),
 ("true regression 2.37.31 after 2.38.2", real+[("qnfo-ops","2.38.2-a")], ("qnfo-ops","2.37.31-x"), None, "REJECT"),
 ("dot-strip accepts a regression: 2.9.99 after 2.10.0", [("w","2.10.0-a")], ("w","2.9.99-b"), None, "REJECT"),
 ("dot-strip rejects an upgrade: 2.10.0 after 2.9.30", [("w","2.9.30-a")], ("w","2.10.0-b"), None, "ACCEPT"),
 ("same version redeploy", real, ("qnfo-ops","2.37.32-tool-budget-ceiling-1"), None, "ACCEPT"),
 ("intentional rollback with ROLLBACK-OK", real, ("qnfo-ops","2.37.1-x"), "ROLLBACK-OK", "ACCEPT"),
 ("other resource is independent", real, ("qnfo-fleet-control","0.4.37-x"), None, "ACCEPT"),
 ("non-version id (sha) ignored", real, ("qnfo-ops","3f9a1c2b7d"), None, "ACCEPT"),
 ("two-segment version 1.5 after 1.10", [("w","1.10-a")], ("w","1.5-b"), None, "REJECT"),
 ("first row for a resource", [], ("new-w","1.0.0-a"), None, "ACCEPT"),
]
bad_old = bad_new = 0
print(f"{'case':58s} {'want':6s} {'OLD(prod)':10s} {'NEW':8s}")
for name, seed, ins, notes, want in cases:
    o = ok(fresh(OLD, seed), *ins, notes); n = ok(fresh(NEW, seed), *ins, notes)
    bad_old += o != want; bad_new += n != want
    print(f"{name:58s} {want:6s} {o:10s}{'' if o==want else ' <-WRONG'} {n:8s}{'' if n==want else ' <-WRONG'}")

MIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations",
                   "2026-09-30-version-monotonic-tuple-compare.sql")


def main():
    if "--emit" in sys.argv:
        print(trigger_sql()); return 0
    drift = ""
    if os.path.exists(MIG):
        drift = "" if trigger_sql() in open(MIG, encoding="utf-8").read() else "MIGRATION FILE DOES NOT MATCH GENERATOR"
    print(f"\nOLD trigger wrong on {bad_old}/{len(cases)} cases; NEW trigger wrong on {bad_new}/{len(cases)} cases")
    if drift:
        print(drift); return 1
    return 1 if bad_new else 0


if __name__ == "__main__":
    sys.exit(main())
