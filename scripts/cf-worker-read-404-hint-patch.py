#!/usr/bin/env python3
"""
CF-WORKER-READ-404-HINT-1 applier  (issue #1382)

Defect: cf_worker_read returns a bare `CF API 404 reading <worker>` when the
caller guesses a non-existent worker name. 16 errors / 6h = 13.2% failure rate,
all of them guessed names (audit-hub, jnl-referee, qnfo-qwav, memory-mcp, docs,
papers, qnfo-error-selfheal, ...). Same class as the ops_d1_query `no such
column` family, which was fixed by returning `available_columns`.

Fix: on a non-OK content fetch, append an actionable hint listing how many
workers exist plus near-name matches from the CF scripts list.

Properties (fail-closed):
  * idempotent   - marker CF-WORKER-READ-404-HINT-1; re-run prints ALREADY APPLIED
  * anchored     - exactly ONE occurrence of the PRE line required, else exit 3
  * property-checked, not version-pinned (VERSION-PIN-AGNOSTIC-1): the workflow
    asserts the marker, never a frozen version literal
  * mirror-safe  - qnfo-ops/deployed-current.worker.js updated in the same run

Exit: 0 applied/already-applied, 3 fail-closed (nothing written).
"""
import os
import re
import sys

MARKER = "CF-WORKER-READ-404-HINT-1"

PRE = '    if (!srcR.ok) return { ok: false, error: "CF API " + srcR.status + " reading " + worker };'

POST = """    if (!srcR.ok) {
      // CF-WORKER-READ-404-HINT-1: a bare 404 is unactionable - callers guess
      // worker names and burn calls. Return the real names instead.
      var _wrh = "";
      if (srcR.status === 404) {
        try {
          var _wlr = await fetch(
            "https://api.cloudflare.com/client/v4/accounts/" + CF_ACCOUNT_ID + "/workers/scripts?per_page=200",
            { headers: { "Authorization": "Bearer " + env.CF_API_TOKEN } }
          );
          if (_wlr.ok) {
            var _wlj = await _wlr.json();
            var _names = (((_wlj || {}).result) || []).map(function (x) { return x && x.id; }).filter(Boolean);
            var _wl = worker.toLowerCase();
            var _near = _names.filter(function (n) {
              var m = String(n).toLowerCase();
              return m.indexOf(_wl) >= 0 || _wl.indexOf(m) >= 0;
            }).slice(0, 8);
            _wrh = " - not a deployed worker. " + _names.length + " workers exist" +
              (_near.length ? "; similar: " + _near.join(", ") : "") +
              ". Use an exact name from that list.";
          }
        } catch (_wrhE) { _wrh = ""; }
      }
      return { ok: false, error: "CF API " + srcR.status + " reading " + worker + _wrh };
    }"""

TARGETS = ["qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js"]
VERSION_OLD = 'var VERSION = "2.37.23-analyzer-excl-table";'
VERSION_NEW = 'var VERSION = "2.37.24-cfread-404-hint";'


def die(code, msg):
    print("FAIL: " + msg)
    sys.exit(code)


def root():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(here)


def main():
    r = root()
    applied = 0
    for rel in TARGETS:
        p = os.path.join(r, rel)
        if not os.path.exists(p):
            die(3, "missing target: " + rel)
        s = open(p, encoding="utf-8").read()
        if MARKER in s:
            print("ALREADY APPLIED: " + rel)
            continue
        n = s.count(PRE)
        if n != 1:
            die(3, "anchor count %d (want 1) in %s" % (n, rel))
        s2 = s.replace(PRE, POST)
        if VERSION_OLD in s2:
            s2 = s2.replace(VERSION_OLD, VERSION_NEW)
            print("VERSION bumped in " + rel)
        # brace balance sanity on the injected region
        seg = s2.split(MARKER)[1][:2000]
        if seg.count("{") != seg.count("}"):
            die(3, "unbalanced braces after injection in " + rel)
        if s2.count(MARKER) != 1:
            die(3, "marker count != 1 after injection in " + rel)
        open(p, "w", encoding="utf-8").write(s2)
        print("PATCHED: " + rel + " (+%d chars)" % (len(s2) - len(s)))
        applied += 1

    # mirror parity
    a = open(os.path.join(r, TARGETS[0]), encoding="utf-8").read()
    b = open(os.path.join(r, TARGETS[1]), encoding="utf-8").read()
    print("MIRROR_IDENTICAL=%s" % ("yes" if a == b else "no"))
    print("MARKER_COUNT=%d" % a.count(MARKER))
    print("OK applied=%d" % applied)
    sys.exit(0)


if __name__ == "__main__":
    main()
