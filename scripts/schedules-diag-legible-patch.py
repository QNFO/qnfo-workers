#!/usr/bin/env python3
"""schedules-diag-legible-patch.py - SCHEDULES-DIAG-LEGIBLE-1.

WHY THIS EXISTS
  scripts/raw_put.py applies each artifact's declared cron set with a PUT to the
  Cloudflare /schedules API. When that call fails, main() writes a bare
  schedules=FAILED note and discards the HTTP status and the response body. The
  result is a fleet-wide schedules outage that cannot be attributed from the
  ledger: every cron-declaring worker in deployment_history carries the bare
  note (qnfo-ops 13 rows, qnfo-research-exec 4, qnfo-fleet-dashboard 3,
  qnfo-cloud-ops 2, qnfo-deploy-guard 1, qnfo-lifecycle 1), while the only rows
  that reach schedules=applied are artifacts that declare no crons at all. A
  silent systemic failure and a correct skip are indistinguishable in the
  ledger, which is why this cluster stayed open.

WHAT IT CHANGES
  1. the schedules PUT retries the transient and client-id class (403, 429, 5xx)
     with linear backoff instead of failing on the first attempt;
  2. the response body is captured at 600 chars rather than 200;
  3. the last error is recorded verbatim and carried into the ledger note, so
     the next deploy attributes the failure instead of restating it.

FAIL-CLOSED
  * every anchor must occur EXACTLY once, else exit 3;
  * post-conditions are asserted against the file actually written;
  * re-running on an already-patched file is a clean no-op (rc 0, tree unchanged).
"""
import io
import os
import sys

ROOT = os.environ.get("REPO_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "raw_put.py")
MARKER = "SCHEDULES-DIAG-LEGIBLE-1"

A1 = '''        "User-Agent": FLEET_UA})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, r.read().decode()[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]
    except Exception as e:
        return 0, "ERR " + str(e)'''

B1 = '''        "User-Agent": FLEET_UA})
    # SCHEDULES-DIAG-LEGIBLE-1: this call used to fail with a bare ledger note
    # and no error code, so the cause of the fleet-wide schedules outage was
    # unattributable. Retry the transient and client-id class and record the
    # last error verbatim so the ledger carries the real cause.
    global SCHED_LAST_ERROR
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                SCHED_LAST_ERROR = ""
                return r.status, r.read().decode("utf-8", "replace")[:600]
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:600]
            SCHED_LAST_ERROR = "HTTP %s %s" % (e.code, body)
            if e.code in (403, 429) or e.code >= 500:
                time.sleep(2 * attempt)
                continue
            return e.code, body
        except Exception as e:
            SCHED_LAST_ERROR = "ERR " + str(e)
            time.sleep(2 * attempt)
            continue
    return 0, SCHED_LAST_ERROR'''

A2 = "CF_MAX_CRONS = 3"
B2 = 'CF_MAX_CRONS = 3\nSCHED_LAST_ERROR = ""  # ' + MARKER

A3 = '    sched_note = "schedules=applied" if sched_ok else "schedules=FAILED"'
B3 = ('    if sched_ok:\n'
      '        sched_note = "schedules=applied"\n'
      '    else:\n'
      '        _err = (SCHED_LAST_ERROR or "no-error-captured").replace(";", ",")\n'
      '        sched_note = "schedules=FAILED(" + _err[:170] + ")"')

REPL = {"A1": B1, "A2": B2, "A3": B3}


def once(text, anchor, tag):
    n = text.count(anchor)
    if n != 1:
        print("FAIL-CLOSED %s - anchor occurs %d times, want exactly 1" % (tag, n))
        sys.exit(3)
    return text.replace(anchor, REPL[tag], 1)


def main():
    if not os.path.isfile(TARGET):
        print("FAIL-CLOSED - no such file " + TARGET)
        return 3
    src = io.open(TARGET, encoding="utf-8").read()
    if MARKER in src:
        print("NOOP - already applied")
        return 0
    if "import time" not in src:
        src = src.replace("import sys\n", "import sys\nimport time\n", 1)
    src = once(src, A1, "A1")
    src = once(src, A2, "A2")
    src = once(src, A3, "A3")
    for needle in (MARKER, "SCHED_LAST_ERROR", "range(1, 4)", "import time"):
        if needle not in src:
            print("FAIL-CLOSED - post-condition missing " + needle)
            return 3
    io.open(TARGET, "w", encoding="utf-8").write(src)
    print("LANDED " + MARKER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
