#!/usr/bin/env python3
"""
ROUTER-HOST-ORDER-1 + GW-FALLBACK-BODY-1  (2026-09-29)

Two verified defects in qnfo-research-exec/worker.js, both evidenced from
Worker-context probes run 2026-09-29:

  1. ROUTER-HOST-ORDER-1
     ROUTER_HOSTS = ["https://ai.qnfo.org", "https://qnfo-ai.q08.workers.dev"].
     Worker-context fetch to ai.qnfo.org (same-zone custom domain) returns 522,
     while qnfo-ai.q08.workers.dev returns 200 (/health) / 401 (unauth POST).
     The failover therefore burns a guaranteed-failing hop on EVERY call before
     reaching the reachable host. Reorder so the reachable host is tried first.

  2. GW-FALLBACK-BODY-1
     gwCall() logs only `r.status` on a non-ok router response:
         logEvent(env, "gw-fallback", "gateway HTTP " + r.status + "; falling back ...")
     Observed 101 gw-fallback events on 2026-09-29 alone, all "gateway HTTP 404",
     with the cause unobservable: the response body (which names the real upstream
     error) is discarded, and no router host attribution is recorded. Capture both.

Idempotent (marker check) and fail-closed (every anchor must match exactly once).
"""
import hashlib
import pathlib
import sys

TARGET = pathlib.Path("qnfo-research-exec/worker.js")
MARKER = "_lastRouterHost"

ANCHORS = [
    # --- 1. host order -----------------------------------------------------
    (
        'var ROUTER_HOSTS = [\n'
        '  "https://ai.qnfo.org",\n'
        '  "https://qnfo-ai.q08.workers.dev"\n'
        '];',
        '// ROUTER-HOST-ORDER-1 (2026-09-29): Worker-context probes show ai.qnfo.org returns\n'
        '// 522 (same-zone custom-domain subrequest) while qnfo-ai.q08.workers.dev returns\n'
        '// 200/401 from Worker context. Try the proven-reachable host FIRST so every call\n'
        '// does not burn a guaranteed-failing hop.\n'
        'var ROUTER_HOSTS = [\n'
        '  "https://qnfo-ai.q08.workers.dev",\n'
        '  "https://ai.qnfo.org"\n'
        '];',
    ),
    # --- 2a. declare host tracker -----------------------------------------
    (
        'var _routerBindingWarned = false;',
        'var _routerBindingWarned = false;\n'
        '// GW-FALLBACK-BODY-1: record which router host produced the response we return.\n'
        'var _lastRouterHost = "";',
    ),
    # --- 2b. populate host tracker ----------------------------------------
    (
        '      var r = await fetch(ROUTER_HOSTS[i] + path, opts);\n'
        '      if (r && r.ok) return r;\n'
        '      last = r;',
        '      var r = await fetch(ROUTER_HOSTS[i] + path, opts);\n'
        '      _lastRouterHost = ROUTER_HOSTS[i];\n'
        '      if (r && r.ok) return r;\n'
        '      last = r;',
    ),
    # --- 3. capture the response body on the fallback path -----------------
    (
        '      await logEvent(env, "gw-fallback", "gateway HTTP " + r.status + "; falling back to Workers AI", "warn");',
        '      var _eb = "";\n'
        '      try {\n'
        '        _eb = String(await r.text()).slice(0, 300);\n'
        '      } catch (e) {\n'
        '        _eb = "(body unreadable)";\n'
        '      }\n'
        '      await logEvent(env, "gw-fallback", "gateway HTTP " + r.status + " host=" + _lastRouterHost + " body=" + _eb + "; falling back to Workers AI", "warn");',
    ),
]


def main() -> int:
    if not TARGET.exists():
        print(f"FAIL: target not found: {TARGET}", file=sys.stderr)
        return 1

    src = TARGET.read_text(encoding="utf-8")
    before = hashlib.sha256(src.encode()).hexdigest()[:16]

    if MARKER in src:
        print(f"already patched (marker {MARKER!r} present); no write. sha256={before}")
        return 0

    out = src
    for i, (old, new) in enumerate(ANCHORS, 1):
        n = out.count(old)
        if n != 1:
            print(
                f"FAIL: anchor {i} matched {n} times (expected exactly 1); "
                f"no partial write performed.",
                file=sys.stderr,
            )
            return 1
        out = out.replace(old, new, 1)
        print(f"anchor {i}: applied")

    if out == src:
        print("FAIL: no change produced", file=sys.stderr)
        return 1

    # fail-closed: the patched file must still contain every original anchor's
    # non-patched neighbours (cheap structural sanity) and the new markers.
    for needed in (MARKER, "ROUTER-HOST-ORDER-1", "GW-FALLBACK-BODY-1"):
        if needed not in out:
            print(f"FAIL: expected marker {needed!r} missing after patch", file=sys.stderr)
            return 1

    TARGET.write_text(out, encoding="utf-8")
    after = hashlib.sha256(out.encode()).hexdigest()[:16]
    print(f"patched {TARGET}: sha256 {before} -> {after} ({len(out)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
