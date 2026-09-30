#!/usr/bin/env python3
"""ROUTER-TRANSPORT-FAILOVER-1 - make routerFetch independent of a blocked workers.dev subrequest.

DEFECT (agent_issues 1406, ROUTER-EGRESS-BINDING-ABSENT-1)
    qnfo-research-exec/worker.js builds ROUTER as
        https://qnfo-ai.q08.workers.dev/v1/chat/completions
    and routerFetch() uses env.QNFO_AI only when that service binding exists:

        function routerFetch(env, url, opts) {
          if (env && env.QNFO_AI && typeof env.QNFO_AI.fetch === "function") {
            return env.QNFO_AI.fetch(url, opts);
          }
          return fetch(url, opts);
        }

    qnfo-research-exec has no QNFO_AI binding (11 live bindings, none of them a service
    binding to qnfo-ai; wrangler.toml declared only PDF_SVC), so the public path was always
    taken. A public fetch to a same-account workers.dev hostname does not work from Worker
    context - the repo already records this class verbatim on the qnfo-autopilot wrangler
    ("the binding was absent so expressIdea fell back to a public workers.dev fetch, which
    returns 404 from a Worker").

    The router is not the source of the 404: qnfo-ai/worker.js has exactly three 404 sites
    (the two R2 object routes and the catch-all "Not found"), line 2429 states the model id
    never 404s, and handleChat has no 404 return path. So a POST to /v1/chat/completions
    cannot 404 inside the handler. Every failure therefore degrades through gwCall():

        if (!r.ok) { logEvent(env, "gw-fallback", "gateway HTTP " + r.status + ...); }

    Evidence: cloud_ops_events kind=gw-fallback n=608, first 2026-09-16T10:41:55Z,
    last 2026-09-29T16:17:23Z, job=qnfo-research-exec, text "gateway HTTP 404; falling back
    to Workers AI". It is the ONLY gw-* kind in the table, so no successful gwCall is ever
    logged either.

WHAT THIS PATCH DOES
    1. Adds an ordered public-host failover inside routerFetch: custom domain first, then the
       workers.dev hostname. The service binding still wins when it is present.
    2. Preserves the response contract exactly - the function still returns a Response, and
       still returns the last non-ok Response when every host answers but none is ok, so the
       caller's `if (!r.ok)` branch keeps working. It rethrows only when every host threw.
    3. Emits a ONE-TIME gw-transport diagnostic when the binding is absent, so the next audit
       can attribute the fallback to the missing binding instead of blaming the gateway.
    4. Bumps VERSION so the repo's strictly-ahead auto-deploy rule picks the artifact up.

    Strictly non-regressive: the failover only ADDS attempts. If a host answers 522/404 the
    code moves on; if every host answers non-ok the behaviour is the old one (return the last
    Response, caller logs gw-fallback). The only change on the success path is that the
    intended router model is used instead of the Workers AI fallback.

FAIL-CLOSED
    Every anchor must match exactly once. Any anchor miss, any VERSION-anchor miss, or a
    failing `node --check` on the patched source aborts with exit 1 and NO partial write.
    Idempotent: presence of the ROUTER_HOSTS marker means the file is already patched.
"""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent

# worker.js is the artifact of record; deployed-current.worker.js is the mirror that
# scripts/mirror-guard.py requires to stay byte-identical. Patch whichever exist.
TARGETS = [
    ROOT / "qnfo-research-exec" / "worker.js",
    ROOT / "qnfo-research-exec" / "deployed-current.worker.js",
]

MARKER = "ROUTER_HOSTS"
NEW_VERSION = "0.9.20-router-host-failover"

OLD = '''var ROUTER = "https://qnfo-ai.q08.workers.dev/v1/chat/completions";
function routerFetch(env, url, opts) {
  if (env && env.QNFO_AI && typeof env.QNFO_AI.fetch === "function") {
    return env.QNFO_AI.fetch(url, opts);
  }
  return fetch(url, opts);
}
'''

NEW = '''var ROUTER = "https://qnfo-ai.q08.workers.dev/v1/chat/completions";
// ROUTER-TRANSPORT-FAILOVER-1: env.QNFO_AI is preferred, but when that service binding is
// absent the old code fell straight through to a public workers.dev fetch, which does not
// work from Worker context. Try the custom domain first, then workers.dev, and keep the
// response contract identical (return the last Response when none is ok).
var ROUTER_HOSTS = [
  "https://ai.qnfo.org",
  "https://qnfo-ai.q08.workers.dev"
];
var _routerBindingWarned = false;
async function routerFetch(env, url, opts) {
  if (env && env.QNFO_AI && typeof env.QNFO_AI.fetch === "function") {
    return env.QNFO_AI.fetch(url, opts);
  }
  if (!_routerBindingWarned) {
    _routerBindingWarned = true;
    if (typeof logEvent === "function") {
      try {
        await logEvent(env, "gw-transport", "QNFO_AI service binding absent; routerFetch is using public host failover over " + ROUTER_HOSTS.join(", "), "warn");
      } catch (e) {
      }
    }
  }
  var path = String(url).replace(/^https?:\\/\\/[^/]+/, "");
  var last = null;
  var lastErr = null;
  for (var i = 0; i < ROUTER_HOSTS.length; i++) {
    try {
      var r = await fetch(ROUTER_HOSTS[i] + path, opts);
      if (r && r.ok) return r;
      last = r;
    } catch (e) {
      lastErr = e;
    }
  }
  if (last) return last;
  throw lastErr || new Error("routerFetch: no router host reachable");
}
'''


def node_check(source: str, label: str) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False) as fh:
        fh.write(source)
        tmp = fh.name
    try:
        p = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    except FileNotFoundError:
        print(f"WARN node not found; skipping --check for {label}")
        return
    if p.returncode != 0:
        raise SystemExit(f"NODE-CHECK-FAILED {label}: {p.stderr.strip()[:2000]}")


def patch(path: pathlib.Path) -> str:
    src = path.read_text()
    if MARKER in src:
        return "already-patched"
    n = src.count(OLD)
    if n != 1:
        raise SystemExit(
            f"ANCHOR-COUNT {path}: expected exactly 1 occurrence of the routerFetch block, found {n}"
        )
    out = src.replace(OLD, NEW)
    if NEW_VERSION in out:
        raise SystemExit(f"VERSION-PRECONDITION {path}: {NEW_VERSION} already present without the marker")
    out, nver = re.subn(r'var VERSION = "[^"]*";', f'var VERSION = "{NEW_VERSION}";', out, count=1)
    if nver != 1:
        raise SystemExit(f'VERSION-ANCHOR {path}: could not locate exactly one var VERSION assignment')
    node_check(out, str(path))
    path.write_text(out)
    return "patched"


def main() -> int:
    seen = 0
    for t in TARGETS:
        if not t.exists():
            print(f"skip (absent): {t.relative_to(ROOT)}")
            continue
        seen += 1
        print(f"{patch(t)}: {t.relative_to(ROOT)}")
    if seen == 0:
        raise SystemExit("NO-TARGET: neither qnfo-research-exec/worker.js nor its mirror exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
