#!/usr/bin/env python3
"""patch-cron-only-class.py - CRON-ONLY-CLASS-1 (issue #1402).

DEFECT (verified 2026-09-29)
  scripts/deploy-drift-guard.py classifies every DEPLOYED worker whose /health 404s as
  NO_HEALTH_ROUTE. That taxonomy assumes a deployed worker serves an HTTP route, which a
  cron-only worker violates BY DESIGN.

  Measured case: ai-health-prober is deployed (CF API: version 2.3.5, size 10733) and its
  wrangler.toml declares

      [triggers]
      crons = ["*/20 * * * *"]

  with NO `routes` and NO `workers_dev` setting, so every path on
  https://ai-health-prober.q08.workers.dev 404s -- root and /health alike -- while the
  subdomain itself is live (control: qnfo-agent-orchestrator.q08.workers.dev/health = 200
  from the same subdomain). The worker source does define a /health route, so the 404 is
  the absent workers.dev route, not missing code.

CHAIN OF HARM
  NO_HEALTH_ROUTE is deliberately excluded from the exit code, so this never held CI red.
  It is permanent NOISE: the class re-fires every run for a worker that can never satisfy
  it, and it masks the one signal that class exists to carry -- an INTERACTIVE worker
  whose workers.dev route is genuinely missing.

FIX
  New class CRON_ONLY. When a directory's wrangler config declares a cron trigger AND
  declares no HTTP route, the 404 is expected: the worker is classed CRON_ONLY, reported,
  counted, and kept OUT of the exit code on the same precedent as NO_HEALTH_ROUTE and
  NOT_A_WORKER.

WHY AN APPLIER AND NOT A DIRECT EDIT
  scripts/deploy-drift-guard.py is an artifact several other appliers also target. The
  applier idiom keeps every change to it anchored, verified by CI, and revertible.

ADVERSARIAL / FAILURE MODES
  * FAIL-CLOSED: if any anchor is missing the script exits 1 WITHOUT writing, so the job
    goes RED (#1383 ANCHOR-INVALIDATION-RED-JOB-1) instead of mis-patching the guard. A
    red job here means "re-anchor the applier", not "the guard is broken".
  * IDEMPOTENT: if the CRON-ONLY-CLASS-1 marker is already present the script exits 0
    having written nothing, so re-runs and the commit-back retry loop are safe.
  * NO SILENT SKIP: a directory with no wrangler config is NOT cron-only (returns None),
    so a genuinely unrouted interactive worker keeps its NO_HEALTH_ROUTE row.
  * ROUTE DETECTION IS CONSERVATIVE: only an explicit `routes`/`route`/`pattern`
    declaration or an explicit `workers_dev = true` counts as routed. `workers_dev = false`
    is treated as NOT routed, which is the correct reading and the ai-health-prober case.
  * RESIDUAL RISK: a cron-only worker that ALSO declares `workers_dev = true` will still
    report NO_HEALTH_ROUTE. That is intended -- with workers_dev on, the 404 IS a defect.
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
MARKER = "CRON-ONLY-CLASS-1"


def _L(*lines):
    return "\n".join(lines)


HELPER = r'''

CRON_DECL = re.compile(r'^\s*crons\s*=\s*\[([^\]]*)\]', re.M)
ROUTE_DECL = re.compile(r'^\s*(?:routes|route|pattern)\s*=', re.M)
WORKERS_DEV_TRUE = re.compile(r'^\s*workers_dev\s*=\s*true\s*$', re.M | re.I)


def wrangler_config_text(d):
    """Concatenated wrangler config for a directory, or "" when none is declared."""
    parts = []
    for fn in ("wrangler.toml",) + WRANGLER_JSON:
        p = os.path.join(ROOT, d, fn)
        if os.path.isfile(p):
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    parts.append(fh.read())
            except OSError:
                continue
    return "\n".join(parts)


def cron_only_reason(d):
    """CRON-ONLY-CLASS-1 (issue 1402): the declared cron expressions when this directory
    is a cron-triggered worker with NO HTTP route, else None.

    A deployed worker whose workers.dev route is disabled and which declares a cron
    trigger 404s on EVERY path by design. Reporting that as NO_HEALTH_ROUTE in perpetuity
    is noise that masks the signal the class exists to carry: an interactive worker whose
    route is genuinely missing. No wrangler config -> not cron-only, so a real unrouted
    interactive worker keeps its NO_HEALTH_ROUTE row (never a silent skip)."""
    text = wrangler_config_text(d)
    if not text:
        return None
    m = CRON_DECL.search(text)
    if not m or not m.group(1).strip():
        return None
    if ROUTE_DECL.search(text) or WORKERS_DEV_TRUE.search(text):
        return None
    return " ".join(m.group(1).split())

'''

EDITS = [
    # 1. document the new class in the module docstring's CLASSES block
    (
        "LIVE_ERR /health unreachable or non-404 error",
        _L(
            "CRON_ONLY deployed, declares a cron trigger and NO HTTP route: every path 404s",
            "BY DESIGN (issue #1402). Reported and counted, never in the exit code.",
            "LIVE_ERR /health unreachable or non-404 error",
        ),
    ),
    # 2. the cron-only helpers, inserted ahead of live_result()
    (
        "def live_result(worker):",
        HELPER.lstrip("\n") + "\ndef live_result(worker):",
    ),
    # 3. new accumulator, kept beside its siblings
    (
        "    multi_version = []\n    not_a_worker = []",
        "    multi_version = []\n    cron_only = []\n    not_a_worker = []",
    ),
    # 4. classify instead of mislabelling the 404
    (
        "            if deployed is None or worker in deployed:\n"
        "                no_health.append((d, worker))",
        _L(
            "            if deployed is None or worker in deployed:",
            "                # CRON-ONLY-CLASS-1 (issue 1402): a deployed worker whose",
            "                # workers.dev route is disabled and which declares a cron",
            "                # trigger 404s on EVERY path by design. Classed CRON_ONLY so",
            "                # NO_HEALTH_ROUTE keeps carrying the signal it exists for: an",
            "                # unrouted INTERACTIVE worker.",
            "                _co = cron_only_reason(d)",
            "                if _co:",
            "                    cron_only.append((d, worker, _co))",
            "                else:",
            "                    no_health.append((d, worker))",
        ),
    ),
    # 5. JSON membership (a consumer must be able to write a row per worker)
    (
        '            "no_health_route": [{"worker": w, "dir": d} for d, w in no_health],',
        _L(
            '            "no_health_route": [{"worker": w, "dir": d} for d, w in no_health],',
            '            "cron_only": [{"worker": w, "dir": d, "crons": c}'
            ' for d, w, c in cron_only],',
            '            "cron_only_count": len(cron_only),',
        ),
    ),
    # 6. text membership
    (
        "        for d, w in no_health:\n"
        '            print(f"NO_HEALTH_ROUTE {w} (dir {d})")',
        _L(
            "        for d, w, c in cron_only:",
            '            print(f"CRON_ONLY {w} (dir {d}): crons={c}")',
            "        for d, w in no_health:",
            '            print(f"NO_HEALTH_ROUTE {w} (dir {d})")',
        ),
    ),
    # 7. the summary line
    (
        '              f"no_health_route={len(no_health)} live_err={len(live_err)} "',
        _L(
            '              f"no_health_route={len(no_health)} cron_only={len(cron_only)} "',
            '              f"live_err={len(live_err)} "',
        ),
    ),
]


def main():
    if not os.path.isfile(TARGET):
        sys.stderr.write("FAIL-CLOSED: target absent: %s\n" % TARGET)
        return 1
    with open(TARGET, encoding="utf-8") as fh:
        src = fh.read()
    if MARKER in src:
        print("ALREADY_APPLIED: %s already present, nothing written" % MARKER)
        return 0
    out = src
    for i, (anchor, repl) in enumerate(EDITS, 1):
        n = out.count(anchor)
        if n != 1:
            sys.stderr.write(
                "FAIL-CLOSED ANCHOR-INVALID edit %d: expected exactly 1 match, found %d "
                "for anchor %r\n" % (i, n, anchor[:80])
            )
            return 1
        out = out.replace(anchor, repl, 1)
    if MARKER not in out:
        sys.stderr.write("FAIL-CLOSED: marker absent after all edits\n")
        return 1
    tmp = TARGET + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(out)
    os.replace(tmp, TARGET)
    print(
        "APPLIED %s: %d edits, %d -> %d bytes" % (MARKER, len(EDITS), len(src), len(out))
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
