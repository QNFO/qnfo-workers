#!/usr/bin/env python3
"""
QUEUE-DRAIN-DISPATCH-FALSE-TIMEOUT-1 (issue 1667) -- idempotent, fail-closed.

WHY
---
qnfo-fleet-dashboard execOne dispatches the research chain with
    svc.fetch("https://SVC_QNFO_RESEARCH_EXEC/run", {signal: AbortSignal.timeout(3e4)})
and records state="failed" whenever that fetch rejects. Measured 2026-09-30:
    POST https://qnfo-research-exec.q08.workers.dev/run -> HTTP 202 in 28-84 ms
    including the full 250-byte body, across three payload variants.
So the target does NOT hang; the abort is a client-side subrequest-queue artefact.
research-exec logged 54 kind=done status=ok events in the same window it was
reported as 9 timeouts, and the false verdicts accrued 174 fleet-execute + 166
fleet-issue rows in 8h.

FIX
---
An aborted dispatch is only a failure when the consumer is NOT demonstrably
advancing. On abort, consult the consumer's own progress signal (cloud_ops_events
job=<progressJob>, kind=done, status=ok, last 3h) -- the same convention as
CHAIN-DRAINING-1 in qnfo-observability. progressJob is attached ONLY to the four
research-exec dispatch specs, so no other target can be reclassified by a foreign
worker's progress.

The wall budget stays 3e4 on purpose: the defect is the false verdict, and raising
it would lengthen the dashboard cron's worst case.

Idempotent: a second run detects the post-state and writes nothing.
Fail-closed: a missing or ambiguous anchor writes NOTHING and exits non-zero.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = ["qnfo-fleet-dashboard/worker.js"]
MARKER = "QUEUE-DRAIN-DISPATCH-FALSE-TIMEOUT-1"
NEW_VERSION = "1.7.40-dispatch-abort-classify"

DECL_OLD = '  let ok = false, status = 0, body = "";'
DECL_NEW = '  let ok = false, status = 0, body = "", aborted = false;'

CATCH_OLD = '''  } catch (e) {
    body = "ERR " + squash(String(e.message || e)).slice(0, 180);
  }
  const ms = Date.now() - t0;
  const state = ok ? "executed" : "failed";'''

CATCH_NEW = '''  } catch (e) {
    aborted = /abort/i.test(String((e && e.name) || "") + " " + String((e && e.message) || e));
    body = "ERR " + squash(String(e.message || e)).slice(0, 180);
  }
  // QUEUE-DRAIN-DISPATCH-FALSE-TIMEOUT-1 (issue 1667): an aborted dispatch is only a failure when the
  // consumer is NOT demonstrably advancing. POST research-exec /run answers 202 in 28-84ms incl. body
  // (measured 2026-09-30), so an abort here is a client-side subrequest-queue artefact, not a dead
  // target. Same convention as CHAIN-DRAINING-1 in qnfo-observability. progressJob is set only on the
  // research-exec specs, so no other target can be reclassified by a foreign worker's progress.
  if (!ok && aborted && spec.progressJob) {
    try {
      const pr = await env.AUDIT.prepare("SELECT MAX(ts) latest FROM cloud_ops_events WHERE job=?1 AND kind='done' AND status='ok' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-3 hours')").bind(spec.progressJob).first();
      if (pr && pr.latest) {
        ok = true;
        body = "accepted (dispatch aborted; consumer " + spec.progressJob + " advanced " + pr.latest + ")";
      }
    } catch (eP) {
    }
  }
  const ms = Date.now() - t0;
  const state = ok ? "executed" : "failed";'''

SPEC_RE = re.compile(r'(\{ safe: true, svc: "SVC_QNFO_RESEARCH_EXEC",)')
SPEC_NEW = r'\1 progressJob: "qnfo-research-exec",'


def patch(path):
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        print("FAIL-CLOSED %s: absent" % path)
        return 1, False

    src = open(full, encoding="utf-8", errors="surrogateescape").read()
    orig = src

    if MARKER in src and DECL_NEW in src:
        print("already applied %s" % path)
        return 0, False

    if src.count(DECL_OLD) != 1:
        print("FAIL-CLOSED %s: declaration anchor matched %d times (expected 1) - nothing written"
              % (path, src.count(DECL_OLD)))
        return 1, False
    if src.count(CATCH_OLD) != 1:
        print("FAIL-CLOSED %s: catch/state anchor matched %d times (expected 1) - nothing written"
              % (path, src.count(CATCH_OLD)))
        return 1, False
    n_spec = len(SPEC_RE.findall(src))
    if n_spec != 4:
        print("FAIL-CLOSED %s: research-exec dispatch spec matched %d times (expected 4) - nothing written"
              % (path, n_spec))
        return 1, False

    src = src.replace(DECL_OLD, DECL_NEW, 1)
    src = src.replace(CATCH_OLD, CATCH_NEW, 1)
    src = SPEC_RE.sub(SPEC_NEW, src)

    vm = re.search(r'var VERSION = "([^"]*)"', src)
    if not vm:
        print("FAIL-CLOSED %s: VERSION constant not found" % path)
        return 1, False
    old_ver = vm.group(1)
    if old_ver != NEW_VERSION:
        src = src.replace('var VERSION = "%s"' % old_ver, 'var VERSION = "%s"' % NEW_VERSION, 1)
        print("OK %s: VERSION %s -> %s" % (path, old_ver, NEW_VERSION))

    if MARKER not in src:
        src = src.rstrip("\n") + (
            "\n// %s (2026-09-30, issue 1667): aborted dispatches are reclassified as executed when the\n"
            "// consumer demonstrably advanced in the last 3h; progressJob set on the 4 research-exec specs.\n"
            % MARKER
        )

    if src == orig:
        print("no change %s" % path)
        return 0, False

    open(full, "w", encoding="utf-8", errors="surrogateescape").write(src)
    print("WROTE %s (%d -> %d bytes)" % (path, len(orig), len(src)))
    return 0, True


def main():
    print("== %s ==" % MARKER)
    rc = 0
    changed = 0
    for t in TARGETS:
        r, c = patch(t)
        rc = max(rc, r)
        changed += 1 if c else 0
    if rc != 0:
        print("FAIL: %s aborted (fail-closed)" % MARKER)
        return rc
    print("OK: %s complete, %d target(s) changed" % (MARKER, changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
