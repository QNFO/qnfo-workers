#!/usr/bin/env python3
"""
SELFHEAL-METRIC-TABLE-FIX-1 (issues 1370, 1165, 1353, 2026-09-29).

WHY THIS EXISTS
---------------
telemetry_report() is the endpoint's own self-report surface. Two defects were proven
live 2026-09-29 by direct query, not by inference.

DEFECT 1 -- SELFHEAL-METRIC-TABLE-MISMATCH-1 (issue 1370, HIGH)
  telemetry_report() counted open self-heal tickets in the WRONG TABLE:

      SELECT COUNT(*) c FROM agent_issues WHERE status = 'open'
        AND category = 'telemetry-self-heal'

  but telemetry_analyze() INSERTS into issue_ledger, not agent_issues:

      INSERT INTO issue_ledger (... category ...) VALUES (... 'telemetry-self-heal' ...)

  Verified live 2026-09-29 15:38Z:
      agent_issues  WHERE status='open' AND category='telemetry-self-heal' -> 0
      issue_ledger  WHERE status='open' AND category='telemetry-self-heal' -> 8
  So the report advertised open_self_heal_issues=0 while 8 self-heal tickets were
  genuinely open. The counter is now pointed at the table the loop actually writes.

DEFECT 2 -- SELFHEAL-CENSUS-COUNTS-AGENT-MISTAKES-1 (issues 1165, 1353)
  The failure census summed every status='error' row for a tool. Verified live: all 8
  distinct recent ops_d1_query errors carry meta.resultOk=false with a REAL D1 error,
  e.g. {"error":"D1_ERROR: no such column: worker at offset 7"} -- i.e. malformed SQL
  authored by the calling agent while probing an unknown schema, NOT a malfunction of
  ops_d1_query. Counting those as tool failures inflates the census (48 errors / 431
  calls = 11.1% in 6h) and, with a low-threshold gate, would auto-file a FALSE-POSITIVE
  tool-defect ticket that could never auto-resolve.

  Remediation is therefore two-sided and deliberate:
    (a) exclude client-authored query mistakes ("no such column" / "no such table") from
        the error census, so the loop measures TOOL health rather than AGENT mistakes;
    (b) add an ABSOLUTE error gate (_errs >= 25 in the window) alongside the existing
        rate gate (_rate >= 0.15), so a high-volume tool that is genuinely broken still
        files even when a large success denominator keeps its rate low -- which is
        exactly the blind spot issue 1165 named.

  LIMITATION (stated, not hidden): the exclusion is a LIKE heuristic over meta text. It
  will not catch every client-side error class (e.g. "syntax error", "no such function"),
  and it is over-broad if a tool ever legitimately fails by emitting bad SQL itself.

SAFETY
  Writes worker.js AND its deployed-current mirror in the SAME commit so mirror-guard
  stays green and the qnfo-fleet-control */20 redeploy cron cannot revert the fix.
  Fail-closed: every anchor must match exactly once, the ESM parse must succeed in the
  workflow, and any mismatch exits non-zero having written nothing.
"""
import pathlib
import re
import sys

SRC = pathlib.Path("qnfo-ops/worker.js")
MIR = pathlib.Path("qnfo-ops/deployed-current.worker.js")

NEW_VER = "2.37.21-selfheal-metric-table-fix"

# ---------------------------------------------------------------------------
# 1. telemetry_report: count self-heal tickets in the table the loop writes
# ---------------------------------------------------------------------------
A1_OLD = r'''const openIssues = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM agent_issues WHERE status = 'open' AND category = 'telemetry-self-heal'").first();'''

A1_NEW = r'''// SELFHEAL-METRIC-TABLE-MISMATCH-1 (issue 1370): telemetry_analyze() INSERTs into
    // issue_ledger, but this counter read agent_issues -- verified live 2026-09-29:
    // agent_issues/telemetry-self-heal = 0 while issue_ledger/telemetry-self-heal = 8 open.
    // The report advertised open_self_heal_issues=0 against 8 genuinely open tickets.
    const openIssues = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM issue_ledger WHERE status = 'open' AND category = 'telemetry-self-heal'").first();'''

# ---------------------------------------------------------------------------
# 2. telemetry_analyze: stop counting agent-authored SQL mistakes as tool failures
# ---------------------------------------------------------------------------
A2_OLD = r'''const okRow = await env.QNFO_AUDIT.prepare("SELECT SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) e, SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) s FROM cloud_ops_events WHERE ts >= ?1 AND kind = 'ops_ai_tool' AND job = 'qnfo-ops' AND text = ?2").bind(since, toolKey).first();'''

A2_NEW = r'''// SELFHEAL-CENSUS-COUNTS-AGENT-MISTAKES-1 (issues 1165, 1353): the census summed every
        // status='error' row. Verified live 2026-09-29: all 8 distinct recent ops_d1_query
        // errors are meta.resultOk=false with a REAL D1 error such as
        // {"error":"D1_ERROR: no such column: worker at offset 7"} -- malformed SQL authored
        // by the CALLING AGENT while probing an unknown schema, not a malfunction of the tool.
        // Those are excluded so the loop measures tool health, not agent mistakes.
        const okRow = await env.QNFO_AUDIT.prepare("SELECT SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) e, SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) s FROM cloud_ops_events WHERE ts >= ?1 AND kind = 'ops_ai_tool' AND job = 'qnfo-ops' AND text = ?2 AND (meta IS NULL OR (meta NOT LIKE '%no such column%' AND meta NOT LIKE '%no such table%'))").bind(since, toolKey).first();'''

# ---------------------------------------------------------------------------
# 3. telemetry_analyze: absolute-error gate for high-volume low-rate failures
#    (this single condition governs BOTH filing and auto-resolve, so it stays symmetric)
# ---------------------------------------------------------------------------
A3_OLD = r'''if (!(_rate >= 0.15 && _fresh)) {'''

A3_NEW = r'''// SELFHEAL-RATE-OR-ABSOLUTE-1 (issue 1165): a rate-only gate is blind to a high-volume
        // tool whose large success denominator keeps the rate low. File on rate OR on an
        // absolute error count in the window. Symmetric: the same predicate drives
        // auto-resolve below, so a tool cannot be filed and un-resolvable at once.
        if (!((_rate >= 0.15 || _errs >= 25) && _fresh)) {'''


def swap(text, old, new, label):
    n = text.count(old)
    if n != 1:
        sys.exit(
            "FAIL-CLOSED [%s]: expected exactly 1 anchor match, found %d. "
            "Artifact does not match the expected pre-patch state; nothing written." % (label, n)
        )
    return text.replace(old, new, 1)


def main():
    if not SRC.exists():
        sys.exit("FAIL-CLOSED: %s not found" % SRC)
    src = SRC.read_text(encoding="utf-8")
    before = len(src)

    # idempotency: if already patched, exit cleanly with no change
    if "SELFHEAL-METRIC-TABLE-MISMATCH-1" in src:
        print("already patched (SELFHEAL-METRIC-TABLE-MISMATCH-1 present); no change")
        return

    src = swap(src, A1_OLD, A1_NEW, "1/report-table")
    src = swap(src, A2_OLD, A2_NEW, "2/census-exclusion")
    src = swap(src, A3_OLD, A3_NEW, "3/absolute-gate")

    m = re.search(r'var VERSION = "([^"]*)";', src)
    if not m:
        sys.exit("FAIL-CLOSED: no VERSION constant found")
    old_ver = m.group(1)
    src = src.replace('var VERSION = "%s";' % old_ver, 'var VERSION = "%s";' % NEW_VER, 1)
    if ('var VERSION = "%s";' % NEW_VER) not in src:
        sys.exit("FAIL-CLOSED: VERSION bump did not apply")

    SRC.write_text(src, encoding="utf-8")
    MIR.write_text(src, encoding="utf-8")

    if SRC.read_bytes() != MIR.read_bytes():
        sys.exit("FAIL-CLOSED: source and mirror diverged after write")

    print("APPLIED: %s -> %s" % (old_ver, NEW_VER))
    print("bytes: %d -> %d" % (before, len(src)))
    print("markers: TABLE-MISMATCH-1=%d CENSUS-AGENT-MISTAKES-1=%d RATE-OR-ABSOLUTE-1=%d issue_ledger-counter=%d"
          % (src.count("SELFHEAL-METRIC-TABLE-MISMATCH-1"),
             src.count("SELFHEAL-CENSUS-COUNTS-AGENT-MISTAKES-1"),
             src.count("SELFHEAL-RATE-OR-ABSOLUTE-1"),
             src.count("FROM issue_ledger WHERE status = 'open' AND category = 'telemetry-self-heal'")))


if __name__ == "__main__":
    main()
