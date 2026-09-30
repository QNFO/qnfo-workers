#!/usr/bin/env python3
"""PANEL6-MEDIATED-COUNT-1 (2026-09-29) -- issue #1486.

DEFECT (measured in D1 qnfo-audit, 2026-09-29)
  qnfo-fleet-dashboard renders two panels that inventory the SAME registers:
    panel 4  "OPERATIONAL LANES"        (REGISTER-INVENTORY-COMPLETE-2)
    panel 6  "UNREMEDIATED REGISTERS"
  For email_loop_quarantine they disagreed on the live page: panel 4 printed 0,
  panel 6 printed 105.  D1 proves panel 4 right and panel 6 wrong:

    SELECT status, COUNT(*) FROM email_loop_quarantine GROUP BY status
      spam 41 | archived 41 | processed 23      => total 105, mediated open 0

  Panel 6 used an UNFILTERED  SELECT COUNT(*) AS n FROM email_loop_quarantine
  and rendered it with class "bad" whenever > 0, so 105 fully-remediated rows were
  displayed under a heading that says UNREMEDIATED.

THREE FURTHER DIVERGENCES (latent on 2026-09-29, able to misreport once rows appear)
  deploy_locks           panel 6 seconds-cast  vs  panel 4 millisecond typeof-guarded
                         (live table had 0 rows, so the wrong unit was masked)
  email_parse_failures   panel 6 status='open'  vs  panel 4 status IN ('open','handoff')
                         (3 rows, both filters returned 0)
  email_send_violations  panel 6 resolved=0     vs  panel 4 COALESCE(resolved,0)=0
                         (2 rows, neither filter matched; a NULL resolved would diverge)

FIX
  Panel 6 stops re-deriving its own counts and reuses panel 4's mediated values
  (single source of truth), so the two panels cannot disagree again.  The label is
  made explicit that the number is the OPEN (unmediated) count.

Idempotent.  Asserts every post-condition and exits non-zero on any failure.
"""
import sys

MARK = "PANEL6-MEDIATED-COUNT-1"
FILES = [
    "qnfo-fleet-dashboard/worker.js",
    "qnfo-fleet-dashboard/deployed-current.worker.js",
]

REPS = [
    (
        "panel6 email_loop_quarantine to mediated panel-4 value",
        '    const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM email_loop_quarantine");\n'
        '    qu = r && r.length ? r[0].n : null;\n',
        '    // ' + MARK + ' issue #1486 - reuse panel 4 mediated count.  An unfiltered\n'
        '    // COUNT(*) here displayed 105 already-remediated rows as UNREMEDIATED.\n'
        '    qu = (typeof _elq === "number") ? _elq : null;\n',
    ),
    (
        "panel6 email_parse_failures status set aligned with panel 4",
        "\"SELECT COUNT(*) AS n FROM email_parse_failures WHERE status='open'\"",
        "\"SELECT COUNT(*) AS n FROM email_parse_failures WHERE status IN ('open','handoff')\"",
    ),
    (
        "panel6 email_send_violations NULL-safe predicate",
        '"SELECT COUNT(*) AS n FROM email_send_violations WHERE resolved=0"',
        '"SELECT COUNT(*) AS n FROM email_send_violations WHERE COALESCE(resolved,0)=0"',
    ),
    (
        "panel6 deploy_locks millisecond typeof-guarded comparison",
        "\"SELECT COUNT(*) AS n FROM deploy_locks WHERE expires_at > CAST(strftime('%s','now') AS INTEGER)\"",
        "\"SELECT COUNT(*) AS n FROM deploy_locks WHERE typeof(expires_at) IN ('integer','real') AND expires_at > (strftime('%s','now')*1000)\"",
    ),
    (
        "panel6 label names the mediated scope",
        "<td>email_loop_quarantine</td>",
        "<td>email_loop_quarantine (open)</td>",
    ),
    (
        "panel6 meaning text names the mediation",
        "self-ingested email loops held in quarantine",
        "self-ingested email loops not yet processed/archived/spam",
    ),
    (
        "version bump",
        'var VERSION = "1.7.33-drift-failclosed";',
        'var VERSION = "1.7.34-panel6-mediated-count";',
    ),
]


def apply_one(path):
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    before = src
    for label, old, new in REPS:
        n = src.count(old)
        if n != 1:
            print("FAIL [%s] expected exactly 1 occurrence, found %d" % (label, n))
            return 1
        src = src.replace(old, new, 1)

    decl = src.find("const _elq = await _n(")
    use = src.find('qu = (typeof _elq === "number")')
    if decl < 0 or use < 0 or decl > use:
        print("FAIL scope: _elq decl=%d use=%d (must be declared before use)" % (decl, use))
        return 1
    if 'FROM email_loop_quarantine")' in src:
        print("FAIL unfiltered quarantine count still present")
        return 1
    if src.count(MARK) != 1:
        print("FAIL marker occurrences = %d (expected 1)" % src.count(MARK))
        return 1

    if src == before:
        print("already applied: %s" % path)
        return 0
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)
    print("patched %s (%d replacements)" % (path, len(REPS)))
    return 0


def main():
    rc = 0
    for p in FILES:
        try:
            if apply_one(p):
                rc = 1
        except FileNotFoundError:
            print("skip missing %s" % p)
    print("applier_rc=%d" % rc)
    return rc


if __name__ == "__main__":
    sys.exit(main())
