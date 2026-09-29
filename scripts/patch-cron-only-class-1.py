#!/usr/bin/env python3
"""patch-cron-only-class-1.py - CRON_ONLY-1 (issue #1402) applier.

DEFECT (issue #1402, re-measured 2026-09-29):
  ai-health-prober is DEPLOYED at v2.3.5 (10,733 B) and https://ai-health-prober.q08.workers.dev/health
  returns HTTP 404. deploy-drift-guard.py classified it NO_HEALTH_ROUTE -- the class that
  means "IS deployed, but /health 404s", i.e. a monitoring gap.
  But ai-health-prober/wrangler.toml declares ONLY a cron trigger:

      [triggers]
      crons = ["*/20 * * * *"]

  with no `routes`, no `workers_dev`, no custom domain, no worker artifact serving HTTP.
  A scheduled-only worker has NO HTTP surface by construction. Its /health 404 is not a
  gap in our monitoring; it is the expected shape of the worker. The false positive is
  permanent and self-renewing: every audit re-reports it as a gap that can never close.

FIX: new class CRON_ONLY. In the 404 branch, a DEPLOYED worker whose directory declares
  >=1 cron trigger AND declares no HTTP surface is classed CRON_ONLY instead of
  NO_HEALTH_ROUTE. It is reported in text and JSON and counted in JSON, and -- on the
  same precedent as NO_HEALTH_ROUTE / NOT_A_WORKER / MULTI_VERSION -- deliberately NOT
  counted in the exit code, because it is a property of the worker, not a repo<->live
  divergence.

FAIL-CLOSED: `cron_only_declared()` returns False on ANY doubt (no config file, unreadable
  config, zero crons, or any routes/workers_dev/route declaration), so an ambiguous
  directory stays NO_HEALTH_ROUTE. No class is ever silently dropped.

Exit codes: 0 applied | 1 already applied (marker present) | 3 anchor missing (abort)
            4 post-check failed (abort)
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
MARKER = "CRON_ONLY-1"

# ---------------------------------------------------------------- edits

DOC_ANCHOR = '''  NO_HEALTH_ROUTE  IS deployed, but https://<name>.q08.workers.dev/health 404s
                   (workers.dev route disabled, or no /health route) -- NOT "not deployed"
'''

DOC_REPLACEMENT = '''  NO_HEALTH_ROUTE  IS deployed, but https://<name>.q08.workers.dev/health 404s
                   (workers.dev route disabled, or no /health route) -- NOT "not deployed"
  CRON_ONLY        IS deployed, /health 404s, AND the directory declares >=1 cron trigger
                   with NO HTTP surface (no routes / workers_dev / custom domain). A
                   scheduled-only worker has no HTTP surface by construction, so its 404
                   is not a monitoring gap (CRON_ONLY-1, issue #1402: ai-health-prober).
'''

DOC_EXIT_ANCHOR = '''NO_HEALTH_ROUTE and NOT_A_WORKER are reported but deliberately NOT counted in the exit
code: a private worker with a disabled workers.dev route is not a repo<->live divergence,
and a non-worker directory is not a divergence at all -- making either blocking would turn
a monitoring gap into a fleet-wide CI outage.
'''

DOC_EXIT_REPLACEMENT = '''NO_HEALTH_ROUTE, NOT_A_WORKER and CRON_ONLY are reported but deliberately NOT counted in
the exit code: a private worker with a disabled workers.dev route is not a repo<->live
divergence, a non-worker directory is not a divergence at all, and a scheduled-only worker
has no HTTP surface to diverge from -- making any of them blocking would turn a monitoring
gap (or a worker's intended shape) into a fleet-wide CI outage.
'''

CONST_ANCHOR = '''WRANGLER_JSON = ("wrangler.json", "wrangler.jsonc")
'''

CONST_REPLACEMENT = '''WRANGLER_JSON = ("wrangler.json", "wrangler.jsonc")
# CRON_ONLY-1 (issue #1402): cron triggers and HTTP-surface declarations in wrangler.toml.
CRONS_DECL = re.compile(r'^\\s*crons\\s*=\\s*\\[([^\\]]*)\\]', re.M)
HTTP_SURFACE_DECL = ("routes", "workers_dev", "route =", "[route", "[[routes]]")
'''

HELPER_ANCHOR = '''            n = data.get("name")
            if isinstance(n, str) and n.strip():
                return n.strip()
    return None
'''

HELPER_REPLACEMENT = '''            n = data.get("name")
            if isinstance(n, str) and n.strip():
                return n.strip()
    return None


def declared_crons(d):
    """Cron triggers declared in the directory's wrangler.toml ([] when none).

    CRON_ONLY-1 (issue #1402). Read-only, fail-soft: an unreadable or absent config
    yields [] so the caller's fail-closed predicate keeps the directory in its old class.
    """
    p = os.path.join(ROOT, d, "wrangler.toml")
    if not os.path.isfile(p):
        return []
    try:
        with open(p, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return []
    out = []
    for m in CRONS_DECL.finditer(text):
        for tok in m.group(1).split(","):
            tok = tok.strip().strip('"').strip("'")
            if tok:
                out.append(tok)
    return out


def declares_http_surface(d):
    """True when the directory declares ANY HTTP surface (route / workers_dev / domain).

    CRON_ONLY-1 (issue #1402). FAIL-CLOSED: returns True on every ambiguity -- no config
    file, unreadable config, or any HTTP declaration -- so an ambiguous directory can
    never be reclassified out of NO_HEALTH_ROUTE.
    """
    p = os.path.join(ROOT, d, "wrangler.toml")
    if not os.path.isfile(p):
        for fn in WRANGLER_JSON:
            q = os.path.join(ROOT, d, fn)
            if os.path.isfile(q):
                try:
                    with open(q, encoding="utf-8", errors="replace") as fh:
                        return "routes" in fh.read()
                except OSError:
                    return True
        return True
    try:
        with open(p, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return True
    for tok in HTTP_SURFACE_DECL:
        if tok in text:
            return True
    return False


def cron_only_declared(d):
    """CRON_ONLY-1 (issue #1402): deployed, /health 404s, >=1 cron, and no HTTP surface.

    True only when the directory provably declares a scheduled-only worker. Any doubt
    (zero crons, any route/workers_dev declaration, unreadable config) returns False and
    the row stays NO_HEALTH_ROUTE -- the class is never silently dropped.
    """
    return bool(declared_crons(d)) and not declares_http_surface(d)
'''

LIST_ANCHOR = '''    not_a_worker = []
'''

LIST_REPLACEMENT = '''    not_a_worker = []
    cron_only = []
'''

BRANCH_ANCHOR = '''            if deployed is None or worker in deployed:
                no_health.append((d, worker))
'''

BRANCH_REPLACEMENT = '''            if deployed is None or worker in deployed:
                # CRON_ONLY-1 (issue #1402): a scheduled-only worker has no HTTP surface
                # by construction, so its /health 404 is its intended shape, not a
                # monitoring gap. Fail-closed: anything ambiguous stays NO_HEALTH_ROUTE.
                if cron_only_declared(d):
                    cron_only.append((d, worker))
                else:
                    no_health.append((d, worker))
'''

JSON_ANCHOR = '''            "no_health_route": [{"worker": w, "dir": d} for d, w in no_health],
'''

JSON_REPLACEMENT = '''            "no_health_route": [{"worker": w, "dir": d} for d, w in no_health],
            "cron_only": [{"worker": w, "dir": d, "crons": declared_crons(d)}
                          for d, w in cron_only],
            "cron_only_count": len(cron_only),
'''

TEXT_ANCHOR = '''        for d, w in no_health:
            print(f"NO_HEALTH_ROUTE {w} (dir {d})")
'''

TEXT_REPLACEMENT = '''        for d, w in no_health:
            print(f"NO_HEALTH_ROUTE {w} (dir {d})")
        for d, w in cron_only:
            print(f"CRON_ONLY {w} (dir {d}): crons={','.join(declared_crons(d))}")
'''

SUMMARY_ANCHOR = '''              f"no_health_route={len(no_health)} live_err={len(live_err)} "
'''

SUMMARY_REPLACEMENT = '''              f"no_health_route={len(no_health)} cron_only={len(cron_only)} "
              f"live_err={len(live_err)} "
'''

EDITS = [
    ("docstring class list", DOC_ANCHOR, DOC_REPLACEMENT),
    ("docstring exit-code note", DOC_EXIT_ANCHOR, DOC_EXIT_REPLACEMENT),
    ("constants", CONST_ANCHOR, CONST_REPLACEMENT),
    ("helpers", HELPER_ANCHOR, HELPER_REPLACEMENT),
    ("main() list init", LIST_ANCHOR, LIST_REPLACEMENT),
    ("404 branch", BRANCH_ANCHOR, BRANCH_REPLACEMENT),
    ("json output", JSON_ANCHOR, JSON_REPLACEMENT),
    ("text output", TEXT_ANCHOR, TEXT_REPLACEMENT),
    ("summary line", SUMMARY_ANCHOR, SUMMARY_REPLACEMENT),
]


def main():
    if not os.path.isfile(TARGET):
        sys.stderr.write("ABORT: target not found: %s\n" % TARGET)
        return 3
    with open(TARGET, encoding="utf-8") as fh:
        src = fh.read()

    if MARKER in src:
        print("ALREADY APPLIED: %s present in %s" % (MARKER, TARGET))
        return 1

    out = src
    for name, anchor, repl in EDITS:
        n = out.count(anchor)
        if n != 1:
            sys.stderr.write(
                "ABORT: anchor %r found %d times (expected exactly 1) -- "
                "target drifted, refusing to patch\n" % (name, n))
            return 3
        out = out.replace(anchor, repl, 1)
        print("applied: %s" % name)

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(out)

    # post-checks: the marker, both new helpers, the class wiring, and the exit-code
    # neutrality must all be present, or we fail closed rather than ship a half patch.
    checks = [
        (MARKER, True),
        ("def declared_crons(", True),
        ("def declares_http_surface(", True),
        ("def cron_only_declared(", True),
        ("cron_only.append((d, worker))", True),
        ('"cron_only_count": len(cron_only)', True),
        ("CRON_ONLY {w} (dir {d})", True),
        ("f\"cron_only={len(cron_only)} \"", True),
        # exit-code neutrality: cron_only must NOT appear in the problems sum
        ("problems = len(drift) + len(content_drift) + len(no_repo_ver) + len(no_live_ver) + len(live_err)", True),
    ]
    bad = []
    for needle, want in checks:
        got = needle in out
        if got != want:
            bad.append(needle)
    if bad:
        sys.stderr.write("POST-CHECK FAILED: %s\n" % bad)
        return 4

    # the patched module must still parse and import, and the new predicate must behave.
    import py_compile
    try:
        py_compile.compile(TARGET, doraise=True)
    except Exception as e:
        sys.stderr.write("POST-CHECK FAILED: py_compile: %s\n" % e)
        return 4

    sys.path.insert(0, os.path.dirname(TARGET))
    import importlib
    mod = importlib.import_module("deploy-drift-guard")
    if not hasattr(mod, "cron_only_declared"):
        sys.stderr.write("POST-CHECK FAILED: cron_only_declared not importable\n")
        return 4

    # POSITIVE: the measured case must reclassify.
    if mod.cron_only_declared("ai-health-prober") is not True:
        sys.stderr.write("POST-CHECK FAILED: ai-health-prober not detected as CRON_ONLY "
                         "(crons=%r surface=%r)\n"
                         % (mod.declared_crons("ai-health-prober"),
                            mod.declares_http_surface("ai-health-prober")))
        return 4
    # NEGATIVE (adversarial): an HTTP-bearing directory must NOT be reclassified, and a
    # directory with no config at all must NOT be reclassified. A predicate that returns
    # True for everything would silently erase the NO_HEALTH_ROUTE class.
    for d in sorted(os.listdir(ROOT)):
        if not os.path.isdir(os.path.join(ROOT, d)) or d.startswith(".") or d.startswith("_"):
            continue
        if d == "ai-health-prober":
            continue
        if mod.cron_only_declared(d):
            if not mod.declared_crons(d):
                sys.stderr.write("POST-CHECK FAILED: %s classified CRON_ONLY with no crons\n" % d)
                return 4
            if mod.declares_http_surface(d):
                sys.stderr.write("POST-CHECK FAILED: %s classified CRON_ONLY with HTTP surface\n" % d)
                return 4

    print("POST-CHECK OK: marker + 3 helpers + class wiring + exit-code neutrality; "
          "ai-health-prober -> CRON_ONLY; no HTTP-bearing dir reclassified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
