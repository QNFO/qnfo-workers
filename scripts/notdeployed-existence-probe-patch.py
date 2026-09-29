#!/usr/bin/env python3
"""notdeployed-existence-probe-patch.py - NOT-DEPLOYED-EXISTENCE-PROBE-1 (issue #1376).

DEFECT (measured, 2026-09-29)
  qnfo-audit.worker_live_audit carries a row `qnfo-email-orchestrator` with
  note=NOT_DEPLOYED (written by the 2026-09-29 15:44:42Z FLEET-AUTOAUDIT-1 run).
  That worker IS deployed: the CF API serves it, live VERSION
  "0.4.1-escalate-deadend-fix", 17,015 B. The row asserts the absence of a worker
  that exists.

ROOT CAUSE (in scripts/deploy-drift-guard.py)
  The 404 branch used LIST MEMBERSHIP as a proxy for EXISTENCE:

      if deployed is None or worker in deployed:
          no_health.append((d, worker))
      else:
          not_deployed.append(d)

  Two independent faults:
  1. `worker in deployed` is a membership test against a PAGINATED list
     (deployed_workers() walks ?per_page=100&page=N and stops at result_info
     total_pages). A truncation, a token scoped to a subset of scripts, or any
     pagination defect silently converts "I did not see it in the list" into
     "it does not exist". A list is not an existence oracle.
  2. `not_deployed.append(d)` appends the DIRECTORY name, while every other class
     records the resolved worker name (`(d, worker)`). So the consumer
     (fleet-autoaudit.py classify()) writes the DIRECTORY into the `worker` PRIMARY
     KEY of worker_live_audit. Identity spaces are mixed, and the resulting row
     cannot be told apart from a true absence -- the guard's own docstring claims
     this was fixed for every class ("a consumer cannot confuse the two again"),
     but the NOT_DEPLOYED class was never converted.

  Consequence: the one class that is supposed to mean "retired / never deployed"
  is also the one class that can name a LIVE worker, and it is not self-correcting.

FIX (three anchored edits + one consumer gate; all fail-closed)
  A. New script_exists(worker, acct, token) -> True/False/None. A direct existence
     probe of that ONE script via GET /workers/scripts/{worker}. True = the account
     serves it, False = the API answered 404 (genuinely absent), None = unknown.
  B. The 404 branch now requires an EXPLICIT False before NOT_DEPLOYED is emitted.
     Anything not established as absent degrades to NO_HEALTH_ROUTE. Unknown is
     never read as absent.
  C. JSON emits `not_deployed_workers` (resolved worker names) AND
     `not_deployed_dirs` (the directories), so the two can no longer be conflated.
  D. fleet-autoaudit.py classify() writes NOT_DEPLOYED only when the guard reports
     cf_script_list=true; otherwise it writes the distinct class UNPROBED_NO_CF_LIST.

ADVERSARIAL / WHAT THIS DOES NOT FIX
  * It does not explain WHY the paginated list missed a deployed script. The probe
    makes the class self-correcting for that symptom; if the list is truncated the
    account still has an undiscovered membership bug. That is tracked separately.
  * One extra API call per would-be NOT_DEPLOYED worker. On the 15:44:42Z run that
    is ~76 calls -- acceptable for a scheduled audit, and it is the price of not
    fabricating absences.
  * This script patches SOURCE, not live behaviour. The guard is a CI script, so
    the fix takes effect on the next workflow run, not at deploy time.

USAGE
  python scripts/notdeployed-existence-probe-patch.py            # apply in place
  python scripts/notdeployed-existence-probe-patch.py --check    # verify anchors only
Exit: 0 ok / already patched | 3 anchor mismatch (nothing written) | 4 compile failure
"""
import os
import py_compile
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
AUDIT = os.path.join(ROOT, "scripts", "fleet-autoaudit.py")

MARK = "NOT-DEPLOYED-EXISTENCE-PROBE-1"

# ---------------------------------------------------------------- guard edits
GUARD_BRANCH_OLD = '''        if not live and lv is None:
            # 404. Only NOT_DEPLOYED when the worker is genuinely absent from the account:
            # a deployed worker with a disabled workers.dev route also 404s here, and
            # calling that NOT_DEPLOYED is the false negative NAME-RESOLUTION-1 closes.
            if deployed is None or worker in deployed:
                no_health.append((d, worker))
            else:
                not_deployed.append(d)
            continue
'''

GUARD_BRANCH_NEW = '''        if not live and lv is None:
            # 404. Only NOT_DEPLOYED when the worker is genuinely absent from the account:
            # a deployed worker with a disabled workers.dev route also 404s here, and
            # calling that NOT_DEPLOYED is the false negative NAME-RESOLUTION-1 closes.
            # NOT-DEPLOYED-EXISTENCE-PROBE-1 (issue #1376): list membership is not
            # existence. `worker in deployed` is a membership test against a PAGINATED
            # list, and it produced a NOT_DEPLOYED row for `qnfo-email-orchestrator`,
            # which the CF API serves (live VERSION 0.4.1-escalate-deadend-fix). A
            # would-be NOT_DEPLOYED is now confirmed by a direct existence probe of that
            # one script. Only an explicit False (API answered 404) yields NOT_DEPLOYED;
            # unknown (None) degrades to NO_HEALTH_ROUTE rather than fabricating absence.
            if deployed is None or worker in deployed:
                no_health.append((d, worker))
            elif script_exists(worker, acct, token) is False:
                not_deployed.append((d, worker))
            else:
                no_health.append((d, worker))
            continue
'''

GUARD_HELPER_OLD = '''    except Exception:
        return None
    return out
'''

GUARD_HELPER_NEW = '''    except Exception:
        return None
    return out


def script_exists(worker, acct, token):
    """NOT-DEPLOYED-EXISTENCE-PROBE-1: direct existence test for ONE script.

    True  -> the account serves this script (a workers.dev 404 is NO_HEALTH_ROUTE)
    False -> the API answered 404 for this script (genuinely absent)
    None  -> undetermined (no credentials / non-404 error). Callers MUST NOT read None
             as "absent": that is the false-negative class this probe closes.
    """
    if not (acct and token):
        return None
    url = API_SCRIPTS.format(acct=acct) + "/" + worker
    try:
        req = urllib.request.Request(url, headers={
            "Authorization": "Bearer " + token,
            "User-Agent": "qnfo-deploy-drift-guard"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return bool(json.load(r).get("result"))
    except urllib.error.HTTPError as e:
        return False if e.code == 404 else None
    except Exception:
        return None
'''

GUARD_JSON_OLD = '''            "not_deployed_workers": not_deployed,
            "not_deployed_notdrift": len(not_deployed),
'''

GUARD_JSON_NEW = '''            "not_deployed_workers": [w for _d, w in not_deployed],
            "not_deployed_dirs": [d for d, _w in not_deployed],
            "not_deployed_notdrift": len(not_deployed),
'''

# ---------------------------------------------------------------- consumer edits
AUDIT_DOC_OLD = '''A NOT_DEPLOYED row now means the worker is absent from the CF account script list -- not
merely that its workers.dev /health 404s (that is NO_HEALTH_ROUTE).
"""

'''

AUDIT_DOC_NEW = '''A NOT_DEPLOYED row now means the worker is absent from the CF account script list -- not
merely that its workers.dev /health 404s (that is NO_HEALTH_ROUTE). Since
NOT-DEPLOYED-EXISTENCE-PROBE-1 (issue #1376) absence additionally requires a direct
existence probe of that one script, and the row is only written as NOT_DEPLOYED when the
guard reports cf_script_list=true -- otherwise it is written as UNPROBED_NO_CF_LIST, so a
run without CF credentials can no longer fabricate absences.
"""

'''

AUDIT_CLASSIFY_OLD = '''    for w in d.get("not_deployed_workers", []):
        put(w, 404, None, None, 0, "NOT_DEPLOYED")
    return rows
'''

AUDIT_CLASSIFY_NEW = '''    cf_list = bool(d.get("cf_script_list"))
    for w in d.get("not_deployed_workers", []):
        # NOT-DEPLOYED-EXISTENCE-PROBE-1 (issue #1376): NOT_DEPLOYED asserts absence
        # from the CF account. Without the CF script list that assertion cannot be
        # made, so the row is written under a distinct class instead of fabricating
        # an absence. cf_script_list=false is a degraded run, not a fleet of 76
        # retired workers.
        put(w, 404, None, None, 0, "NOT_DEPLOYED" if cf_list else "UNPROBED_NO_CF_LIST")
    return rows
'''

EDITS = [
    (GUARD, GUARD_BRANCH_OLD, GUARD_BRANCH_NEW, "guard:404-branch-existence-probe"),
    (GUARD, GUARD_HELPER_OLD, GUARD_HELPER_NEW, "guard:script_exists-helper"),
    (GUARD, GUARD_JSON_OLD, GUARD_JSON_NEW, "guard:json-worker-and-dir-split"),
    (AUDIT, AUDIT_DOC_OLD, AUDIT_DOC_NEW, "audit:docstring"),
    (AUDIT, AUDIT_CLASSIFY_OLD, AUDIT_CLASSIFY_NEW, "audit:cf-script-list-gate"),
]


def main():
    check_only = "--check" in sys.argv
    files = {}
    for path, _old, _new, _label in EDITS:
        if path not in files:
            if not os.path.isfile(path):
                print(f"::error::missing target {path}", file=sys.stderr)
                return 3
            with open(path, encoding="utf-8") as fh:
                files[path] = fh.read()

    if all(MARK in files[p] for p in files):
        print(f"{MARK}: already patched (no-op)")
        return 0

    for path, old, new, label in EDITS:
        n = files[path].count(old)
        if n != 1:
            print(f"::error::anchor '{label}' matched {n} times in {os.path.basename(path)} "
                  f"(need exactly 1) -- refusing to write", file=sys.stderr)
            return 3
        files[path] = files[path].replace(old, new, 1)
        print(f"anchor ok: {label}")

    for path, src in files.items():
        if "cf_script_list" not in src:
            print(f"::error::post-patch sanity failed for {path}", file=sys.stderr)
            return 3
    if MARK not in files[GUARD] or MARK not in files[AUDIT]:
        print("::error::marker missing after patch", file=sys.stderr)
        return 3

    if check_only:
        print(f"{MARK}: --check passed, anchors unique (nothing written)")
        return 0

    for path, src in files.items():
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(src)
        print(f"wrote {os.path.relpath(path, ROOT)} ({len(src)} bytes)")

    for path in files:
        try:
            py_compile.compile(path, doraise=True)
            print(f"py_compile OK: {os.path.relpath(path, ROOT)}")
        except py_compile.PyCompileError as e:
            print(f"::error::py_compile failed for {path}: {e}", file=sys.stderr)
            return 4
    print(f"{MARK}: APPLIED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
