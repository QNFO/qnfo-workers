#!/usr/bin/env python3
"""
TELEMETRY-TRUTH-1 (issue 1370) + BACKLOG-PROBE-TIMEOUT-1 (issues 1368/1369).

WHY THIS EXISTS
---------------
Two verified observability defects in live qnfo-ops. Neither is a crash; both corrupt the
signal the self-healing loop depends on, so they are fixed together.

ROOT CAUSE 1 -- TELEMETRY-TRUTH-1 (issue 1370): the counter reads the wrong store
  telemetryReport() reported open_self_heal_issues with:

      SELECT COUNT(*) c FROM agent_issues WHERE status='open' AND category='telemetry-self-heal'

  but telemetryAnalyze() files into `issue_ledger` (INSERT INTO issue_ledger ...), NOT into
  agent_issues. VERIFIED LIVE 2026-09-29:
      issue_ledger   WHERE category='telemetry-self-heal' AND status='open'  -> 8 rows
      agent_issues   WHERE category='telemetry-self-heal' AND status='open'  -> 0 rows
  The reported value was therefore pinned at 0 BY CONSTRUCTION, not because the fleet was
  healthy. Issue 1370 recorded the same mismatch (report 0 vs analyzer 4+). Fix: count BOTH
  stores -- issue_ledger is the live path, agent_issues preserves historical rows.

ROOT CAUSE 2 -- TELEMETRY-TRUTH-1 (filters): the report's denominators differ from the
  analyzer's. telemetryAnalyze() scopes to job='qnfo-ops' AND text IS NOT NULL; the report's
  calls/fails/top queries omitted both, so tool_calls and tool_failures were not the same
  population the analyzer reasons over. Fix: apply the identical scope.

ROOT CAUSE 3 -- BACKLOG-PROBE-TIMEOUT-1 (issues 1368/1369): a timeout logged as ""
  backlogStatus() returns ok: h.ok from probeService(), and probeService() aborts at a
  HARD-CODED 5000 ms (setTimeout(..., 5e3)). Live event cloud_ops_events
  id=evt-efe861ecce656e records tool backlog_status, status='error',
  meta {"resultOk":false,"error":"","ms":5000} -- ms is exactly the abort budget, so the
  probe was aborted on a cold qnfo-backlog-exec binding. This REFUTES the premise of issue
  1369 ("logs resultOk=false for calls that returned successfully"): the call genuinely
  returned ok:false. The real defect is narrower and is what is fixed here -- backlogStatus
  DROPPED h.error when building its return object, so the audit log stored error:"" and the
  diagnosis was destroyed. Fix: propagate the reason, and give this probe its own budget.

  Deliberately NOT done: probeService's 5s default is left unchanged so fleet-wide probe
  latency is unaffected; only the backlog probe opts into a longer budget.

SAFETY
  Writes worker.js AND its deployed-current mirror in the SAME commit so mirror-guard stays
  green and the qnfo-fleet-control */20 redeploy cron cannot revert the fix. Fail-closed:
  every anchor must match EXACTLY once, or the applier exits non-zero having written nothing.
"""
import pathlib
import re
import sys

SRC = pathlib.Path("qnfo-ops/worker.js")
MIR = pathlib.Path("qnfo-ops/deployed-current.worker.js")

NEW_VER = "2.37.21-telemetry-truth"

# ---------------------------------------------------------------------------
# A. open_self_heal_issues must count issue_ledger (the live store) + agent_issues
# ---------------------------------------------------------------------------
A_OLD = r'''    const openIssues = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM agent_issues WHERE status = 'open' AND category = 'telemetry-self-heal'").first();'''

A_NEW = r'''    // TELEMETRY-TRUTH-1 (issue 1370): telemetryAnalyze() files into `issue_ledger`
    // (INSERT INTO issue_ledger ...), but this counter read `agent_issues`. Live
    // 2026-09-29: issue_ledger had 8 open telemetry-self-heal rows and agent_issues had 0,
    // so open_self_heal_issues was pinned at 0 by construction. Count BOTH stores:
    // issue_ledger is the live path, agent_issues preserves historical rows.
    const openIssues = await env.QNFO_AUDIT.prepare("SELECT ((SELECT COUNT(*) FROM issue_ledger WHERE status = 'open' AND category = 'telemetry-self-heal') + (SELECT COUNT(*) FROM agent_issues WHERE status = 'open' AND category = 'telemetry-self-heal')) c").first();'''

# ---------------------------------------------------------------------------
# B. align the report's denominators with telemetryAnalyze's own scope
# ---------------------------------------------------------------------------
B_OLD = r'''    const calls = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM cloud_ops_events WHERE ts >= ?1 AND kind = 'ops_ai_tool'").bind(since).first();
    const fails = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM cloud_ops_events WHERE ts >= ?1 AND status = 'error' AND kind = 'ops_ai_tool'").bind(since).first();'''

B_NEW = r'''    // TELEMETRY-TRUTH-1 (issue 1370): scope calls/fails exactly as telemetryAnalyze does
    // (job='qnfo-ops' AND text IS NOT NULL). Without it the report's denominators covered a
    // different population than the analyzer reasons over, so the two could never agree.
    const calls = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM cloud_ops_events WHERE ts >= ?1 AND kind = 'ops_ai_tool' AND job = 'qnfo-ops' AND text IS NOT NULL").bind(since).first();
    const fails = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM cloud_ops_events WHERE ts >= ?1 AND status = 'error' AND kind = 'ops_ai_tool' AND job = 'qnfo-ops' AND text IS NOT NULL").bind(since).first();'''

# ---------------------------------------------------------------------------
# C. top_failing_tools: same scope, so the list matches the counters
# ---------------------------------------------------------------------------
C_OLD = r'''    const top = await env.QNFO_AUDIT.prepare("SELECT text, COUNT(*) n FROM cloud_ops_events WHERE ts >= ?1 AND status = 'error' AND kind = 'ops_ai_tool' GROUP BY text ORDER BY n DESC LIMIT 5").bind(since).all()'''

C_NEW = r'''    const top = await env.QNFO_AUDIT.prepare("SELECT text, COUNT(*) n FROM cloud_ops_events WHERE ts >= ?1 AND status = 'error' AND kind = 'ops_ai_tool' AND job = 'qnfo-ops' AND text IS NOT NULL GROUP BY text ORDER BY n DESC LIMIT 5").bind(since).all()'''

# ---------------------------------------------------------------------------
# D. backlogStatus: stop discarding the probe's failure reason
# ---------------------------------------------------------------------------
D_OLD = r'''  const h = await probeService(env, { binding: "BACKLOG", name: "qnfo-backlog-exec" }, "/health");
  return { ok: h.ok, healthy: h.ok, http: h.http, version: h.body && h.body.version || "", openBacklog: h.body && typeof h.body.openBacklog === "number" ? h.body.openBacklog : -1 };'''

D_NEW = r'''  // BACKLOG-PROBE-TIMEOUT-1 (issues 1368/1369): a cold qnfo-backlog-exec binding can exceed
  // probeService's 5s abort, which returned ok:false with the reason DISCARDED -- the audit
  // log stored error:"" (cloud_ops_events evt-efe861ecce656e, ms=5000 exactly) and a spurious
  // TOOL-FAILURE ticket was filed. Give this probe its own budget and propagate the reason
  // so the log records "timeout" instead of an empty string.
  const h = await probeService(env, { binding: "BACKLOG", name: "qnfo-backlog-exec", timeoutMs: 12e3 }, "/health");
  return { ok: h.ok, healthy: h.ok, http: h.http, version: h.body && h.body.version || "", openBacklog: h.body && typeof h.body.openBacklog === "number" ? h.body.openBacklog : -1, error: h.error || "" };'''

# ---------------------------------------------------------------------------
# E. probeService: budget becomes an opt-in parameter; default unchanged at 5s
# ---------------------------------------------------------------------------
E_OLD = r'''  const ctrl = new AbortController();
  const t = setTimeout(function() {
    ctrl.abort();
  }, 5e3);'''

E_NEW = r'''  // PROBE-TIMEOUT-PARAM-1 (issue 1369): the budget was hard-coded at 5s, so a cold
  // service-binding start could abort a probe that would have succeeded. Callers may now
  // pass f.timeoutMs; the DEFAULT IS UNCHANGED at 5s so fleet-wide probe latency is
  // unaffected and only the caller that opted in pays the longer budget.
  const ctrl = new AbortController();
  const _probeBudget = f && typeof f.timeoutMs === "number" ? f.timeoutMs : 5e3;
  const t = setTimeout(function() {
    ctrl.abort();
  }, _probeBudget);'''


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

    if "TELEMETRY-TRUTH-1" in src:
        print("already patched (TELEMETRY-TRUTH-1 present); no change")
        return

    src = swap(src, A_OLD, A_NEW, "A/openIssues-store")
    src = swap(src, B_OLD, B_NEW, "B/calls-fails-scope")
    src = swap(src, C_OLD, C_NEW, "C/top-scope")
    src = swap(src, D_OLD, D_NEW, "D/backlog-error-propagate")
    src = swap(src, E_OLD, E_NEW, "E/probe-budget-param")

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
    print("markers: TELEMETRY-TRUTH-1=%d PROBE-TIMEOUT-PARAM-1=%d BACKLOG-PROBE-TIMEOUT-1=%d issue_ledger=%d"
          % (src.count("TELEMETRY-TRUTH-1"),
             src.count("PROBE-TIMEOUT-PARAM-1"),
             src.count("BACKLOG-PROBE-TIMEOUT-1"),
             src.count("issue_ledger")))


if __name__ == "__main__":
    main()
