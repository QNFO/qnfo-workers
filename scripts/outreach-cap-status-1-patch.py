#!/usr/bin/env python3
"""
OUTREACH-CAP-STATUS-1 (2026-09-30) -- idempotent, fail-closed source patch.

WHY THIS EXISTS (#1662)
-----------------------
qnfo-cloud-ops jobOutreach reports status "error"/"partial" when it merely hits
the fleet daily send cap (CAP=8).  Measured 2026-09-30T18:20:53Z:

    jr-outreach-muofl8ok  status=error    errors:[{id:aq-mu3ucf8hzps1,error:daily cap reached}]
    jr-outreach-muofl8na  status=partial  same payload
    scheduler_state outreach_sent_2026-09-30 = 8 == CAP

Hitting the cap is the EXPECTED terminal condition of a healthy drain, not a
failure.  Recording it as an error makes the failure inventory and any alert
keyed on status=error fire every single day, and gives self-heal a phantom
defect to churn on.

WHAT IT DOES
------------
1. out gains `capped` so the cap is recorded explicitly.
2. The cap branch sets out.capped/out.cap instead of pushing a pseudo-error.
3. The terminal status becomes: errors -> "error"; capped -> "capped"; else "ok".
   `out.status` is free-form (logRun + recordEvent only), so "capped" is safe.
4. VERSION 1.15.4-outreach-attempt-cap-1 -> 1.15.5-outreach-cap-status-1

Idempotent: a second run detects the post-state and writes nothing.
Fail-closed: a missing anchor writes NOTHING and exits non-zero.

LANDING NOTE (2026-09-30)
-------------------------
The first push of this patcher (commit b831ccc) did NOT land.  Its
apply-pending-patches run (id 36768582932, created 19:51:37Z) finished with
conclusion "cancelled" while the concurrency group reports
cancel-in-progress: false, and a concurrent agent pushed 1281aec 13 seconds
later.  A patch script being present on main is therefore NOT evidence that the
applier ran it; the run's own conclusion must be read.  This revision is a
re-push whose only purpose is to trigger a fresh applier run.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = ["qnfo-cloud-ops/worker.js", "qnfo-cloud-ops/deployed-current.worker.js"]

MARKER = "OUTREACH-CAP-STATUS-1"
VERSION_OLD = 'var VERSION = "1.15.4-outreach-attempt-cap-1";'
VERSION_NEW = 'var VERSION = "1.15.5-outreach-cap-status-1";'

OUT_OLD = "const out = { pending: 0, sent: 0, followups: 0, skipped_no_email: 0, skipped_dupe: 0, errors: [] };"
OUT_NEW = "const out = { pending: 0, sent: 0, followups: 0, skipped_no_email: 0, skipped_dupe: 0, errors: [], capped: false };"

CAP_RE = re.compile(
    r'if \(sentToday >= CAP\) \{\s*\n'
    r'\s*out\.errors\.push\(\{ id: r\.id, error: "daily cap reached" \}\);\s*\n'
    r'\s*break;\s*\n'
    r'\s*\}'
)
CAP_NEW = """if (sentToday >= CAP) {
      /* OUTREACH-CAP-STATUS-1 (#1662): hitting the daily cap is the EXPECTED terminal
         state of a healthy drain, not a failure. Pushing it into out.errors made the
         failure inventory and every status=error alert fire daily on a clean run. */
      out.capped = true;
      out.cap = CAP;
      break;
    }"""

TAIL_OLD = """  await recordEvent(env, "job-run", "jr-outreach-" + Date.now().toString(36), "outreach run: " + JSON.stringify(out), { job: "outreach", status: out.errors.length ? "partial" : "ok" });
  return { status: out.errors.length ? "error" : "ok", notes: out };"""
TAIL_NEW = """  /* OUTREACH-CAP-STATUS-1 (#1662): reserve "error" for genuine failures; report a
     cap-limited drain as "capped" so it is visible without being an alarm. */
  const _outStatus = out.errors.length ? "error" : out.capped ? "capped" : "ok";
  await recordEvent(env, "job-run", "jr-outreach-" + Date.now().toString(36), "outreach run: " + JSON.stringify(out), { job: "outreach", status: out.errors.length ? "partial" : _outStatus });
  return { status: _outStatus, notes: out };"""


def patch(path):
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        print("SKIP %s (absent)" % path)
        return 0, False

    src = open(full, encoding="utf-8", errors="surrogateescape").read()
    orig = src

    # --- fail-closed anchor checks (pre-state) -------------------------------
    if src.count(TAIL_OLD) == 0 and src.count(TAIL_NEW) == 0:
        print("FAIL-CLOSED %s: tail anchor matched 0 times (expected 1) - nothing written" % path)
        return 1, False
    if src.count(OUT_OLD) == 0 and src.count(OUT_NEW) == 0:
        print("FAIL-CLOSED %s: out-initializer anchor matched 0 times - nothing written" % path)
        return 1, False
    if CAP_RE.search(src) is None and (MARKER in src):
        pass  # already applied, cap site rewritten
    elif CAP_RE.search(src) is None:
        print("FAIL-CLOSED %s: cap-branch anchor matched 0 times - nothing written" % path)
        return 1, False

    # --- idempotence ---------------------------------------------------------
    if (MARKER in src) and (VERSION_NEW in src) and (src.count(OUT_NEW) == 1) and (src.count(TAIL_NEW) == 1):
        print("already applied %s" % path)
        return 0, False

    # --- apply ---------------------------------------------------------------
    src = src.replace(OUT_OLD, OUT_NEW, 1)
    src = CAP_RE.sub(CAP_NEW, src, count=1)
    src = src.replace(TAIL_OLD, TAIL_NEW, 1)
    src = src.replace(VERSION_OLD, VERSION_NEW, 1)

    # --- post-conditions -----------------------------------------------------
    for probe, label in ((OUT_NEW, "out.capped"), (TAIL_NEW, "tail status"), (VERSION_NEW, "VERSION")):
        if probe not in src:
            print("FAIL-CLOSED %s: post-condition %s missing - nothing written" % (path, label))
            return 1, False
    if MARKER not in src:
        src = src.replace("/* OUTREACH-ATTEMPT-CAP-1 */", "/* OUTREACH-ATTEMPT-CAP-1; " + MARKER + " */", 1)

    if src == orig:
        print("no change %s" % path)
        return 0, False

    open(full, "w", encoding="utf-8", errors="surrogateescape").write(src)
    print("PATCHED %s (%d -> %d bytes)" % (path, len(orig), len(src)))
    return 0, True


def main():
    rc = 0
    changed = False
    for t in TARGETS:
        r, c = patch(t)
        rc = rc or r
        changed = changed or c
    print("RESULT rc=%d changed=%s" % (rc, changed))
    return rc


if __name__ == "__main__":
    sys.exit(main())
