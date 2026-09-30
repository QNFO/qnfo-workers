#!/usr/bin/env python3
"""
SELFHEAL-VOLFLOOR-1 + DEPLOY-SELFLOG-1 (issues 1165 / 1352 / 1353 / 1363, 2026-09-29).

WHY THIS EXISTS
---------------
qnfo-ops' telemetry_analyze() IS the endpoint's self-healing loop, and its 30-minute
scheduled() cron ALREADY runs it automatically (verified live: scheduled() calls
registryRefresh(env) then telemetryAnalyze(env, 6), and worker_schedules reports
qnfo-ops crons = ["*/30 * * * *"]). The cron is NOT the gap. Two defects remain inside
the loop and in the deploy ledger.

DEFECT 1 -- SELFHEAL-VOLFLOOR-1 (absolute-volume blind spot)
  The gate added by SELFHEAL-RATE-NOT-ABSENCE-1 is `_rate >= 0.15 && _fresh`. Measured
  live 2026-09-29 over 24h from real telemetry_analyze output:
      ops_d1_query   errors 138  successes 1279  rate 0.0974
      shell_exec     errors  61  successes  472  rate 0.1144
      ops_issue_run  errors   3  successes   19  rate 0.1364
  All three sit BELOW 0.15, so all three are classified "recovered" and file NOTHING
  while 202 tool failures accumulate in a single day. A high-volume tool is a defect at
  any rate. The gate now also fires on an absolute-volume floor: file when the rate is
  high OR when the absolute error count is large and the rate is non-trivial.

DEFECT 2 -- DEPLOY-SELFLOG-1 (deployment_history is blind to this worker)
  Verified live: the newest deployment_history row for qnfo-ops was id=104,
  version_id 2.37.19-d1-guard-literal-fn-aware (2026-09-29T12:31:22Z) written by an
  EXTERNAL BACKFILL, while the live bundle was already 2.37.20-selfheal-analyzer-live.
  grep -c deployment_history qnfo-ops/worker.js == 0: the worker NEVER records its own
  deploys, so every deploy not manually backfilled appears as an unlogged mutation
  (DEPLOY-UNLOGGED-MUTATION / DEPLOY-LEDGER-LAG-1). The worker now reconciles the ledger
  against its own VERSION constant on every scheduled() tick, so the ledger is
  self-healing instead of dependent on an out-of-band backfill.

SAFETY
  Writes worker.js AND its deployed-current mirror in the SAME commit so mirror-guard
  stays green and the qnfo-fleet-control redeploy cron cannot revert the fix. Fail-closed:
  every anchor must match exactly once and any mismatch exits non-zero having written
  nothing.
"""
import pathlib
import re
import sys

SRC = pathlib.Path("qnfo-ops/worker.js")
MIR = pathlib.Path("qnfo-ops/deployed-current.worker.js")

NEW_VER = "2.37.21-selfheal-volfloor-deploylog"

# ---------------------------------------------------------------------------
# A. rate gate -> rate gate OR absolute-volume floor
# ---------------------------------------------------------------------------
A_OLD = r'''        out.rates[toolKey] = { errors: _errs, successes: _oks, failureRate: Number(_rate.toFixed(4)), recent: _fresh };
        if (!(_rate >= 0.15 && _fresh)) {'''

A_NEW = r'''        out.rates[toolKey] = { errors: _errs, successes: _oks, failureRate: Number(_rate.toFixed(4)), recent: _fresh };
        // SELFHEAL-VOLFLOOR-1 (issues 1165/1353, 2026-09-29): the rate gate alone leaves an
        // ABSOLUTE-VOLUME blind spot. Verified live 24h: ops_d1_query failed 138x (rate
        // 0.0974) and shell_exec 61x (0.1144) -- both BELOW the 0.15 gate, so neither filed
        // while 202 tool failures accumulated in one day. A high-volume tool is a defect at
        // any rate. File when the rate is high OR when the absolute error count is large and
        // the rate is non-trivial.
        const _vol = _errs >= 25 && _rate >= 0.02;
        if (!(_fresh && (_rate >= 0.15 || _vol))) {'''

# ---------------------------------------------------------------------------
# B. deploy-ledger self-logging, defined immediately before the analyzer
# ---------------------------------------------------------------------------
B_OLD = r'''async function telemetryAnalyze(env, hours) {'''

B_NEW = r'''// DEPLOY-SELFLOG-1 (issues 1352 / 1363, 2026-09-29): qnfo-ops never recorded its own
// deploys, so deployment_history lagged live and every non-backfilled deploy looked like an
// unlogged mutation. Reconcile the ledger against this bundle's own VERSION on the 30-minute
// cron so the ledger is self-healing rather than dependent on an external backfill.
async function deployLedgerReconcile(env) {
  if (!env.QNFO_AUDIT) return { ok: false, error: "audit db not bound" };
  const me = "qnfo-ops";
  const v = typeof VERSION === "string" && VERSION ? VERSION : "";
  if (!v) return { ok: false, error: "no VERSION constant" };
  try {
    const row = await env.QNFO_AUDIT.prepare("SELECT id, version_id FROM deployment_history WHERE resource_type = 'worker' AND resource_name = ?1 ORDER BY id DESC LIMIT 1").bind(me).first();
    if (row && String(row.version_id) === String(v)) return { ok: true, action: "noop", version: v };
    await env.QNFO_AUDIT.prepare("INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, deployed_at, status, notes) VALUES ('worker', ?1, 'deploy', ?2, 'qnfo-ops self-log', ?3, 'success', ?4)").bind(me, v, iso(), "self-logged by scheduled() deploy-ledger reconcile; previous=" + String((row && row.version_id) || "none")).run();
    return { ok: true, action: "logged", version: v };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function telemetryAnalyze(env, hours) {'''

# ---------------------------------------------------------------------------
# C. wire the reconcile into the existing 30-minute scheduled() cron
# ---------------------------------------------------------------------------
C_OLD = r'''    try {
      await telemetryAnalyze(env, 6);
    } catch (e) {
      console.log("telemetry cron failed:", e && e.message || e);
    }'''

C_NEW = r'''    try {
      await deployLedgerReconcile(env);
    } catch (e) {
      console.log("deploy ledger reconcile failed:", e && e.message || e);
    }
    try {
      await telemetryAnalyze(env, 6);
    } catch (e) {
      console.log("telemetry cron failed:", e && e.message || e);
    }'''


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

    if "SELFHEAL-VOLFLOOR-1" in src and "DEPLOY-SELFLOG-1" in src:
        print("already patched (VOLFLOOR + SELFLOG present); no change")
        return

    src = swap(src, A_OLD, A_NEW, "A/rate-gate-volfloor")
    src = swap(src, B_OLD, B_NEW, "B/deploy-ledger-reconcile")
    src = swap(src, C_OLD, C_NEW, "C/scheduled-wiring")

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
    print("guards present: VOLFLOOR=%d SELFLOG=%d deployment_history=%d deployLedgerReconcile=%d"
          % (src.count("SELFHEAL-VOLFLOOR-1"),
             src.count("DEPLOY-SELFLOG-1"),
             src.count("deployment_history"),
             src.count("deployLedgerReconcile")))


if __name__ == "__main__":
    main()
