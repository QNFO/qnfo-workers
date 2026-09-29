#!/usr/bin/env python3
"""SELF-FETCH-GUARD-1 applier (2026-09-29).

WHY THIS EXISTS
---------------
SAME-ZONE-FETCH-FALLBACK-1 (2.37.26) taught qnfo-ops `web_fetch` to retry a 5xx from a
fleet custom domain against that worker's `*.q08.workers.dev` origin. That closed the
class for every fleet host EXCEPT the one worker doing the fetching.

A Worker cannot `fetch()` its own hostname. When qnfo-ops fetches `ops.qnfo.org` the
subrequest re-enters the zone, terminates at qnfo-ops itself, and the subrequest waits
on itself until Cloudflare returns HTTP 522. The fallback then retries
`qnfo-ops.q08.workers.dev` -- also qnfo-ops -- and 522s again. Measured 2026-09-29:

    web_fetch(https://ops.qnfo.org/health)
      -> ok:false, error:"HTTP 522",
         tried:["https://ops.qnfo.org/health",
                "https://qnfo-ops.q08.workers.dev/health"]

while the same host is 200 for every OTHER worker and 200/401 externally. Control in
the same probe set: qnfo-ai.q08.workers.dev -> 200, idea-hub.q08.workers.dev -> 200.

WHY IT MATTERS BEYOND ONE TOOL CALL
-----------------------------------
HTTP 522 from a fleet host is the signature this thread repeatedly misread as a fleet
outage, because a self-fetch and a genuine same-zone outage are indistinguishable at
the transport layer. Every reading of "ops.qnfo.org is down" taken from inside
qnfo-ops is this artifact. The defect is not the failed fetch -- it is that the failure
is unlabelled, retried, and slow.

THE FIX
-------
`var WORKER = "qnfo-ops";` and `CANON_BASE` (worker -> custom domain) already exist in
this worker, so self-identity is resolvable without any new binding.

1. New helper `isSelfFetchHost(host)` -- true when the hostname is either
   `<WORKER>.q08.workers.dev` or a CANON_BASE custom domain that maps back to WORKER.
2. `webFetchTool` refuses a self-fetch BEFORE any network call, returning a structured
   error carrying `self_fetch: true` and a `hint` naming the correct tool
   (`fleet_status` for in-fleet health). Fast, legible, and not confusable with 522.
3. Defence in depth: `fleetWorkersDevFallback` returns null for a self host, so the
   fallback leg can never target self even if the guard above is bypassed.

DELIBERATELY NOT EXCLUDED FROM FAILURE COUNTS
---------------------------------------------
This error string is intentionally NOT added to `tool_error_exclusions`. That table's
`HTTP 5` -> `upstream-availability` row carries the rationale "tracked separately" but
no separate tracker exists, and that over-broad pattern is exactly what hid the
same-zone 522 defect for days (web_fetch 75/75 failures auto-excluded). A deterministic,
zero-network guard returning a distinct error is therefore left visible so the
underlying need -- an in-fleet URL read path -- can be filed once and fixed, rather than
silently absorbed.

FAIL-CLOSED / IDEMPOTENT
------------------------
- Marker present            -> exit 0, no write.
- Any anchor count != 1     -> exit 1, no write (never half-applies).
- fleetWorkerNamesForHost must exist (it is SAME-ZONE-FETCH-FALLBACK-1's helper);
  0 matches -> exit 1, so this patch cannot land on a tree missing its dependency.
- Exactly one VERSION literal required; 0 or >1 -> exit 1, no write.
- VERSION is matched by regex, never pinned (VERSION-ANCHOR-DRIFT-1: the fleet bumps
  VERSION several times an hour and an exact literal is orphaned within minutes).
- Post-write assertion on marker, new version, helper, guard flag, and fallback clause.
"""
import os
import re
import sys

MARKER = "SELF-FETCH-GUARD-1"
TARGETS = ("qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js")

# VERSION-ANCHOR-DRIFT-1: match, never pin.
VERSION_RE = re.compile(r'var VERSION = "2\.37\.(\d+)-[^"]*";')
NEW_SLUG = "self-fetch-guard"

# Dependency: SAME-ZONE-FETCH-FALLBACK-1's helper. Must be present exactly once.
ANCHOR_DEP = "function fleetWorkerNamesForHost(host) {"

# Insertion point for the new helper (and the anchor for the fallback hardening).
ANCHOR_FALLBACK = '''function fleetWorkersDevFallback(u) {
  try {
    const host = String(u && u.hostname || "").toLowerCase();
    if (!host || host.endsWith(".workers.dev")) return null;
    const names = fleetWorkerNamesForHost(host);
    if (!names.length) return null;'''

NEW_FALLBACK = '''function fleetWorkersDevFallback(u) {
  try {
    const host = String(u && u.hostname || "").toLowerCase();
    if (!host || host.endsWith(".workers.dev")) return null;
    if (isSelfFetchHost(host)) return null; /* SELF-FETCH-GUARD-1: never fall back to self */
    const names = fleetWorkerNamesForHost(host);
    if (!names.length) return null;'''

HELPER = '''// SELF-FETCH-GUARD-1 (2026-09-29): a Worker cannot fetch its own hostname. The
// subrequest re-enters the zone, terminates at this worker, waits on itself, and
// surfaces as HTTP 522 -- indistinguishable from a genuine fleet outage. Resolve
// self-identity from WORKER + CANON_BASE so the refusal can be labelled.
function isSelfFetchHost(host) {
  try {
    const h = String(host || "").toLowerCase();
    if (!h) return false;
    if (h === WORKER + ".q08.workers.dev") return true;
    const names = fleetWorkerNamesForHost(h);
    for (let i = 0; i < names.length; i++) {
      if (names[i] === WORKER) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

'''

ANCHOR_GUARD = '  if (isPrivateHost(u.hostname)) return { ok: false, error: "blocked host (private/internal): " + u.hostname };'

NEW_GUARD = '''  if (isPrivateHost(u.hostname)) return { ok: false, error: "blocked host (private/internal): " + u.hostname };
  // SELF-FETCH-GUARD-1 (2026-09-29): refuse a self-fetch before any network call.
  // Without this the call burns two 522 subrequests and reports the result as a fleet
  // outage, which is how "ops.qnfo.org is down" readings from inside qnfo-ops arise.
  if (isSelfFetchHost(u.hostname)) {
    return {
      ok: false,
      error: "self-fetch blocked: " + WORKER + " cannot fetch its own hostname (" + u.hostname + ")",
      url,
      self_fetch: true,
      hint: "use fleet_status for in-fleet health, or the *.q08.workers.dev origin of a DIFFERENT worker"
    };
  }'''


def main():
    root = os.getcwd()
    touched = []
    for rel in TARGETS:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            print("SKIP (missing): " + rel)
            continue
        src = open(path, encoding="utf-8").read()
        if MARKER in src:
            print("OK (already patched): " + rel)
            continue
        counts = {n: src.count(n) for n in (ANCHOR_DEP, ANCHOR_FALLBACK, ANCHOR_GUARD)}
        bad = {n: c for n, c in counts.items() if c != 1}
        if bad:
            print("FAIL (fail-closed): anchor occurrence != 1 in " + rel)
            for n, c in bad.items():
                print("  count=%d  %s" % (c, n.splitlines()[0][:90]))
            return 1
        vms = list(VERSION_RE.finditer(src))
        if len(vms) != 1:
            print("FAIL (fail-closed): VERSION literal occurrences = %d in %s" % (len(vms), rel))
            return 1
        vm = vms[0]
        old_version = vm.group(0)
        new_version = 'var VERSION = "2.37.%d-%s";' % (int(vm.group(1)) + 1, NEW_SLUG)
        out = src.replace(ANCHOR_FALLBACK, NEW_FALLBACK, 1)
        out = out.replace(ANCHOR_FALLBACK.split("function fleetWorkersDevFallback")[0] + "function fleetWorkersDevFallback(u) {", HELPER + "function fleetWorkersDevFallback(u) {", 1)
        out = out.replace(ANCHOR_GUARD, NEW_GUARD, 1)
        out = out.replace(old_version, new_version, 1)
        for probe in (
            MARKER,
            new_version,
            "function isSelfFetchHost(host)",
            "SELF-FETCH-GUARD-1: never fall back to self",
            "self_fetch: true",
        ):
            if probe not in out:
                print("FAIL (post-write assertion): missing %r in %s" % (probe, rel))
                return 1
        open(path, "w", encoding="utf-8").write(out)
        print("PATCHED %s  (%d -> %d bytes)  %s -> %s" % (rel, len(src), len(out), old_version, new_version))
        touched.append(rel)
    if not touched:
        print("nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())
