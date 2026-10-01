#!/usr/bin/env python3
"""
OPS-1042-UNKNOWN-1 + DRAIN-AFFIRM-EXECUTE-1 (2026-10-01)

Two measured defects in qnfo-ops/worker.js, both with same-day evidence.

DEFECT 1 -- DRAIN-AFFIRM-EXECUTE-1 (false-negative affirmation gate).
  ops_issue_run logged 196 errors/24h (cloud_ops_events kind=ops_ai_tool,
  status=error, text=ops_issue_run), every one of them the same string:
  "execution requires explicit affirmation in YOUR latest message".
  Cause: userAffirmative()'s POSITIVE token list omits execute/remediate/resolve
  while its NEGATION veto list already includes execute/remediate. The gate is
  asymmetric: "do not execute" vetoes, but "EXECUTE REMEDIATION" does not affirm.
  Fix: add the three action verbs. The segment-scoped negation veto and the
  confirm:true requirement still gate the action, so the gate stays non-vacuous.

DEFECT 2 -- OPS-1042-UNKNOWN-1 (fleet_status reports a false DOWN).
  fleet_status reported qnfo-signal-loop healthy:false, http:404, version:"".
  Measured 2026-10-01 from a non-Worker client (container curl):
    qnfo-signal-loop.q08.workers.dev/health           -> 404 "error code: 1042"
    zzz-nonexistent-probe-9271.q08.workers.dev/health -> 404 "error code: 1042"  IDENTICAL
    q08-signal-engine.q08.workers.dev/health          -> 200  (control, same client, same run)
  A CF error 1042 on this zone therefore means "hostname is not a published
  Worker route" -- a ROUTING verdict, not a health verdict; it says nothing
  about the target. qnfo-fleet-control already encodes this (FLEET-PROBE-1042-1:
  recorded up:null, "never as down") and qnfo-ops' own capability-audit path
  documents it (IN-WORKER-PROBE-BLOCKED-1). The fleet_status registry-probe
  path did not apply it: it parsed the 1042 text as JSON (failed -> {}), kept
  resp.ok=false, and returned healthy:false.
  Fix: detect the 1042 answer and record ok:null (UNKNOWN), never false-down,
  and keep counting the worker as deployed (it IS in the CF Workers API listing).

Fail-closed + idempotent: each anchor must match exactly once; a second run is a
no-op; any anomaly exits 3 without writing.
"""
import re
import sys
from pathlib import Path

TARGET = Path("qnfo-ops/worker.js")

AFFIRM_OLD = r'return /\b(?:yes|yep|yeah|confirm|confirmed|approve|approved|authorized|authorised|go\s+ahead|do\s+it|run\s+it|proceed|drain)\b/i.test(__s);'
AFFIRM_NEW = r'return /\b(?:yes|yep|yeah|confirm|confirmed|approve|approved|authorized|authorised|go\s+ahead|do\s+it|run\s+it|proceed|drain|execute|remediate|resolve)\b/i.test(__s); /* DRAIN-AFFIRM-EXECUTE-1 */'

FETCH_OLD = ('const resp = await fetch(base + "/health", { signal: rctrl.signal, '
             'headers: { "User-Agent": "qnfo-ops-fleet-status/registry-health" } });\n'
             '        clearTimeout(rt);')
FETCH_NEW = FETCH_OLD + """
        /* OPS-1042-UNKNOWN-1 (2026-10-01): a CF error 1042 answer means the hostname is not a
           published Worker route (verified against a nonexistent *.q08.workers.dev control that
           returns the identical body). That is a ROUTING verdict, not a health verdict. */
        let _cf1042 = false;
        try { _cf1042 = /error code:?\\s*1042/i.test(await resp.clone().text()); } catch (e) { _cf1042 = false; }"""

RH_OLD = 'rh = { ok: resp.ok, http: resp.status, version: body.version || body.VERSION || "", error: null };'
RH_NEW = ('rh = _cf1042 ? { ok: null, http: resp.status, version: "", '
          'error: "cf-1042-no-published-route (probe blocked; target state unknown)" } '
          ': { ok: resp.ok, http: resp.status, version: body.version || body.VERSION || "", error: null };')

DEPLOYED_OLD = 'return x.healthy === true || x.probe === "api";'
DEPLOYED_NEW = ('return x.healthy === true || x.probe === "api" '
                '|| /cf-1042-no-published-route/.test(String(x.error || ""));')

# VERSION-BUMP-GUARD-1 (issue 1371): a worker.js change committed WITHOUT a VERSION bump is
# invisible to fleet-autoaudit.py --apply (strictly-ahead numeric version), deploy-drift.yml and
# mirror-guard.py -- all three stay green while the fix never deploys. Regex-based so it survives
# main advancing under us, and strictly-ahead of whatever is on main at apply time.
VERSION_RE = re.compile(r'(var VERSION = ")(\d+)\.(\d+)\.(\d+)(?:-[^"]*)?(";)', re.M)

ANCHORS = (("AFFIRM", AFFIRM_OLD), ("FETCH", FETCH_OLD), ("RH", RH_OLD), ("DEPLOYED", DEPLOYED_OLD))


def main() -> int:
    src = TARGET.read_text(encoding="utf-8")
    if "OPS-1042-UNKNOWN-1" in src and "DRAIN-AFFIRM-EXECUTE-1" in src:
        print("already applied -- idempotent no-op")
        return 0
    for name, old in ANCHORS:
        n = src.count(old)
        if n != 1:
            print("FAIL-CLOSED: anchor %s matched %d times, expected exactly 1" % (name, n), file=sys.stderr)
            return 3
    vm = VERSION_RE.search(src)
    if not vm:
        print("FAIL-CLOSED: VERSION anchor not found", file=sys.stderr)
        return 3
    nv = "%s.%s.%d-fleet-1042-unknown" % (vm.group(2), vm.group(3), int(vm.group(4)) + 1)
    src = src[:vm.start()] + vm.group(1) + nv + vm.group(5) + src[vm.end():]
    print("VERSION bumped -> %s" % nv)

    out = src.replace(AFFIRM_OLD, AFFIRM_NEW, 1)
    out = out.replace(FETCH_OLD, FETCH_NEW, 1)
    out = out.replace(RH_OLD, RH_NEW, 1)
    out = out.replace(DEPLOYED_OLD, DEPLOYED_NEW, 1)
    if out == src:
        print("FAIL-CLOSED: no change produced", file=sys.stderr)
        return 3
    TARGET.write_text(out, encoding="utf-8")
    print("anchors: 4/4 replaced, VERSION bumped")
    print("applied OPS-1042-UNKNOWN-1 + DRAIN-AFFIRM-EXECUTE-1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
