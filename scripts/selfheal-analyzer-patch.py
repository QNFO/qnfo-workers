#!/usr/bin/env python3
"""
SELFHEAL-ANALYZER-LIVE-1 (issue 1165, 2026-09-29).

WHY THIS EXISTS
---------------
telemetry_analyze() on qnfo-ops IS the endpoint's self-healing loop. Its contract is:
find tools that are persistently failing and auto-file fix tickets. It has been
STRUCTURALLY DEAD -- it can never file anything.

ROOT CAUSE 1 -- SELFHEAL-EXTRACTOR-BARE-NAME-1 (primary)
  cloud_ops_events.text holds the BARE tool name, e.g. "ops_d1_query". The extractor
  required a "tool=NAME" pair instead:

      const _tm = String(r.text).match(/(?:tool|tool_name|called)[=: ]+([A-Za-z0-9_.-]+)/i);
      const toolKey = _tm ? _tm[1] : "";
      if (!toolKey) continue;

  VERIFIED 2026-09-29 by executing that exact regex against all 15 distinct text values
  present in cloud_ops_events: 15 of 15 returned no match, so toolKey was always "" and
  EVERY row was discarded by the guard. filed:0 was therefore permanent, not transient.
  Corroborating ledger evidence: issue_ledger category 'telemetry-self-heal' last wrote
  2026-09-26 09:30:41 -- the loop has filed nothing for three days.

ROOT CAUSE 2 -- SELFHEAL-RATE-NOT-ABSENCE-1
  Even with extraction repaired, the recovery gate skipped any tool that had ONE success
  after its last error. A tool failing hundreds of times per day alongside thousands of
  successes can therefore never file. Live 24h census: ops_d1_query 260 errors,
  shell_exec 64, web_fetch 32, ops_d1_write 28, github_repo_read 13. Filing now keys off
  a FAILURE RATE (>= 15% of calls in the window) plus recency, not off absence of success.

ROOT CAUSE 3 -- SELFHEAL-FINGERPRINT-MISMATCH-1
  The auto-resolve path fingerprinted on String(r.text).slice(0, 60) while the file path
  fingerprinted on toolKey, so the two fingerprints could never meet and a recovered
  tool's ticket could never be auto-resolved. Both now use toolKey.

SAFETY
  This patcher writes worker.js AND its deployed-current mirror in the SAME commit so
  mirror-guard stays green and the qnfo-fleet-control */20 redeploy cron cannot revert the
  fix. It is fail-closed: every anchor must match exactly once, the ESM parse must succeed
  in the workflow, and any mismatch exits non-zero having written nothing.
"""
import pathlib
import re
import sys

SRC = pathlib.Path("qnfo-ops/worker.js")
MIR = pathlib.Path("qnfo-ops/deployed-current.worker.js")

NEW_VER = "2.37.20-selfheal-analyzer-live"

# ---------------------------------------------------------------------------
# A. extractor + rate state (declared in loop scope so the title line can read it)
# ---------------------------------------------------------------------------
A_OLD = r'''      if ((r.n || 0) < 2) continue;
      const _tm = String(r.text).match(/(?:tool|tool_name|called)[=: ]+([A-Za-z0-9_.-]+)/i);
      const toolKey = _tm ? _tm[1] : "";
      if (!toolKey) continue;'''

A_NEW = r'''      if ((r.n || 0) < 3) continue;
      // SELFHEAL-EXTRACTOR-BARE-NAME-1 (issue 1165): cloud_ops_events.text holds the BARE
      // tool name ("ops_d1_query"), not a "tool=NAME" pair. The previous extractor required
      // the latter, so toolKey was "" for 15 of 15 real values and every row was discarded
      // by the guard below -- the self-heal loop filed 0 tickets permanently.
      const _raw = String(r.text).trim();
      const _bm = /^[A-Za-z0-9_.-]+$/.test(_raw) ? [_raw, _raw] : null;
      const _tm = _bm || _raw.match(/(?:tool|tool_name|called)[=: ]+([A-Za-z0-9_.-]+)/i);
      const toolKey = _tm ? _tm[1] : "";
      if (!toolKey) continue;
      let _errs = r.n || 0;
      let _oks = 0;
      let _rate = 1;
      let _fresh = true;'''

# ---------------------------------------------------------------------------
# B. recovery gate: failure RATE + recency, not absence-of-success
# ---------------------------------------------------------------------------
B_OLD = r'''        const okRow = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM cloud_ops_events WHERE ts > ?1 AND status = 'ok' AND kind = 'ops_ai_tool' AND job = 'qnfo-ops' AND text LIKE ('%' || ?2 || '%')").bind(r.last_ts, toolKey).first();
        if (okRow && okRow.c > 0) {'''

B_NEW = r'''        // SELFHEAL-RATE-NOT-ABSENCE-1 (issue 1165): the previous gate treated ONE success
        // after the last error as full recovery, so a tool failing hundreds of times a day
        // alongside thousands of successes could never file. File on a FAILURE RATE.
        const okRow = await env.QNFO_AUDIT.prepare("SELECT SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) e, SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) s FROM cloud_ops_events WHERE ts >= ?1 AND kind = 'ops_ai_tool' AND job = 'qnfo-ops' AND text = ?2").bind(since, toolKey).first();
        _errs = (okRow && okRow.e) || r.n || 0;
        _oks = (okRow && okRow.s) || 0;
        _rate = _errs / Math.max(1, _errs + _oks);
        _fresh = String(r.last_ts || "") >= new Date(Date.now() - h * 1800 * 1e3).toISOString();
        out.rates = out.rates || {};
        out.rates[toolKey] = { errors: _errs, successes: _oks, failureRate: Number(_rate.toFixed(4)), recent: _fresh };
        if (!(_rate >= 0.15 && _fresh)) {'''

# ---------------------------------------------------------------------------
# C. unify the auto-resolve fingerprint with the file-path fingerprint
# ---------------------------------------------------------------------------
C_OLD = r'''            const _fp = "selfheal:" + fnv32("[self-heal] tool " + String(r.text).slice(0, 60));'''

C_NEW = r'''            // SELFHEAL-FINGERPRINT-MISMATCH-1: this used String(r.text).slice(0,60) while
            // the file path below used toolKey, so the two fingerprints could never match
            // and a recovered tool's ticket could never be auto-resolved.
            const _fp = "selfheal:" + fnv32("[self-heal] tool " + toolKey);'''

# ---------------------------------------------------------------------------
# D. title now reports the measured rate instead of the misleading "no recovery"
# ---------------------------------------------------------------------------
D_OLD = r'''      const title = "[self-heal] tool " + toolKey + " failing x" + r.n + " (" + h + "h no recovery)";'''

D_NEW = r'''      const title = "[self-heal] tool " + toolKey + " failing x" + _errs + " (" + (100 * _rate).toFixed(1) + "% of " + (_errs + _oks) + " calls in " + h + "h)";'''

# ---------------------------------------------------------------------------
# E. declare the rates map on the result object
# ---------------------------------------------------------------------------
E_OLD = r'''  const out = { ok: true, windowHours: h, scanned: 0, persistent: [], recovered: 0, autoResolved: 0, filed: 0, alreadyOpen: 0, ts: iso() };'''

E_NEW = r'''  const out = { ok: true, windowHours: h, scanned: 0, persistent: [], recovered: 0, autoResolved: 0, filed: 0, alreadyOpen: 0, rates: {}, ts: iso() };'''


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
    if "SELFHEAL-EXTRACTOR-BARE-NAME-1" in src:
        print("already patched (SELFHEAL-EXTRACTOR-BARE-NAME-1 present); no change")
        return

    src = swap(src, E_OLD, E_NEW, "E/out-init")
    src = swap(src, A_OLD, A_NEW, "A/extractor")
    src = swap(src, B_OLD, B_NEW, "B/recovery-gate")
    src = swap(src, C_OLD, C_NEW, "C/fingerprint")
    src = swap(src, D_OLD, D_NEW, "D/title")

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
    print("guards present: SELFHEAL-EXTRACTOR-BARE-NAME-1=%d SELFHEAL-RATE-NOT-ABSENCE-1=%d out.rates=%d"
          % (src.count("SELFHEAL-EXTRACTOR-BARE-NAME-1"),
             src.count("SELFHEAL-RATE-NOT-ABSENCE-1"),
             src.count("out.rates")))


if __name__ == "__main__":
    main()
