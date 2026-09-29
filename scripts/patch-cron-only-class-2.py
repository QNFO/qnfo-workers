#!/usr/bin/env python3
"""patch-cron-only-class-2.py - CRON_ONLY-2 (issue #1402) applier.

DEFECT (issue #1402, re-measured 2026-09-29):
  ai-health-prober is DEPLOYED at v2.3.5 and https://ai-health-prober.q08.workers.dev/health
  returns HTTP 404. deploy-drift-guard.py classifies it NO_HEALTH_ROUTE -- the class that
  means "IS deployed, but /health 404s", i.e. a monitoring gap. But
  ai-health-prober/wrangler.toml declares ONLY a cron trigger:

      [triggers]
      crons = ["*/20 * * * *"]

  with no `routes`, no `workers_dev`, no custom domain. A scheduled-only worker has NO
  HTTP surface by construction, so its /health 404 is the intended shape of the worker,
  not a gap in our monitoring. The false positive is permanent and self-renewing: every
  audit re-reports it as a gap that can never close.

FIX: new class CRON_ONLY. In the 404 branch, a DEPLOYED worker whose directory declares
  >=1 cron trigger AND declares no HTTP surface is classed CRON_ONLY instead of
  NO_HEALTH_ROUTE. Reported in text and JSON, counted in JSON, and -- on the same
  precedent as NO_HEALTH_ROUTE / NOT_A_WORKER / MULTI_VERSION -- deliberately NOT counted
  in the exit code, because it is a property of the worker, not a repo<->live divergence.

FAIL-CLOSED: cron_only_declared() returns False on ANY doubt (no config file, unreadable
  config, zero crons, or any routes/workers_dev/route declaration), so an ambiguous
  directory stays NO_HEALTH_ROUTE. No class is ever silently dropped.

Exit codes: 0 applied | 1 already applied (marker present) | 3 anchor mismatch (abort)
            4 py_compile failed (abort)
"""
import os
import sys
import py_compile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
MARKER = "CRON_ONLY-2"

# ---------------------------------------------------------------- helpers to inject

HELPERS = [
    "",
    "",
    "def declared_crons(d):",
    '    """Cron triggers declared in the wrangler.toml ([] when none)."""',
    '    p = os.path.join(ROOT, d, "wrangler.toml")',
    "    if not os.path.isfile(p):",
    "        return []",
    "    try:",
    '        with open(p, encoding="utf-8", errors="replace") as fh:',
    "            text = fh.read()",
    "    except OSError:",
    "        return []",
    "    out = []",
    "    for line in text.splitlines():",
    "        s = line.strip()",
    '        if not s.startswith("crons"):',
    "            continue",
    '        if "=" not in s or "[" not in s or "]" not in s:',
    "            continue",
    '        body = s.split("[", 1)[1].rsplit("]", 1)[0]',
    '        for tok in body.split(","):',
    "            tok = tok.strip()",
    "            for q in (chr(34), chr(39)):",
    "                tok = tok.strip(q)",
    "            if tok:",
    "                out.append(tok)",
    "    return out",
    "",
    "",
    "def declares_http_surface(d):",
    '    """True when ANY HTTP surface is declared. FAIL-CLOSED on doubt."""',
    '    toks = ("routes", "workers_dev", "route =", "[route", "[[routes]]")',
    '    p = os.path.join(ROOT, d, "wrangler.toml")',
    "    if os.path.isfile(p):",
    "        try:",
    '            with open(p, encoding="utf-8", errors="replace") as fh:',
    "                text = fh.read()",
    "        except OSError:",
    "            return True",
    "        return any(t in text for t in toks)",
    '    for fn in ("wrangler.json", "wrangler.jsonc"):',
    "        q = os.path.join(ROOT, d, fn)",
    "        if os.path.isfile(q):",
    "            try:",
    '                with open(q, encoding="utf-8", errors="replace") as fh:',
    '                    return "routes" in fh.read()',
    "            except OSError:",
    "                return True",
    "    return True",
    "",
    "",
    "def cron_only_declared(d):",
    '    """CRON_ONLY-2 (issue #1402): >=1 cron and no HTTP surface."""',
    "    return bool(declared_crons(d)) and not declares_http_surface(d)",
]

# ---------------------------------------------------------------- anchored edits
# Every anchor below was verified to occur EXACTLY ONCE in
# scripts/deploy-drift-guard.py at main (23,535 bytes) before this applier was written.

A_DOC = ['  NO_HEALTH_ROUTE  IS deployed, but https://<name>.q08.workers.dev/health 404s']
R_DOC = A_DOC + [
    '  CRON_ONLY        IS deployed, /health 404s, AND the directory declares >=1 cron trigger',
    '                   with NO HTTP surface (no routes / workers_dev / custom domain). A',
    '                   scheduled-only worker has no HTTP surface by construction, so its',
    '                   404 is not a monitoring gap (CRON_ONLY-2, issue #1402).',
]

A_TAIL = [
    '            n = data.get("name")',
    '            if isinstance(n, str) and n.strip():',
    '                return n.strip()',
    '    return None',
]

A_INIT = ['    not_a_worker = []']
R_INIT = ['    not_a_worker = []', '    cron_only = []']

A_BRANCH = [
    '            if deployed is None or worker in deployed:',
    '                no_health.append((d, worker))',
]
R_BRANCH = [
    '            if deployed is None or worker in deployed:',
    '                # CRON_ONLY-2 (issue #1402): a scheduled-only worker has no HTTP',
    '                # surface by construction. Fail-closed: ambiguous stays NO_HEALTH_ROUTE.',
    '                if cron_only_declared(d):',
    '                    cron_only.append((d, worker))',
    '                else:',
    '                    no_health.append((d, worker))',
]

A_TEXT = [
    '        for d, w in no_health:',
    '            print(f"NO_HEALTH_ROUTE {w} (dir {d})")',
]
R_TEXT = A_TEXT + [
    '        for d, w in cron_only:',
    "            print(f\"CRON_ONLY {w} (dir {d}): crons={','.join(declared_crons(d))}\")",
]

A_JSON = ['            "no_health_route": [{"worker": w, "dir": d} for d, w in no_health],']
R_JSON = A_JSON + [
    '            "cron_only": [{"worker": w, "dir": d, "crons": declared_crons(d)}',
    '                          for d, w in cron_only],',
    '            "cron_only_count": len(cron_only),',
]

A_SUM = ['              f"no_health_route={len(no_health)} live_err={len(live_err)} "']
R_SUM = [
    '              f"no_health_route={len(no_health)} cron_only={len(cron_only)} "',
    '              f"live_err={len(live_err)} "',
]

EDITS = [
    ("docstring class list", A_DOC, R_DOC),
    ("helpers", A_TAIL, A_TAIL + HELPERS),
    ("main() list init", A_INIT, R_INIT),
    ("404 branch", A_BRANCH, R_BRANCH),
    ("text output", A_TEXT, R_TEXT),
    ("json output", A_JSON, R_JSON),
    ("summary line", A_SUM, R_SUM),
]


def diagnose():
    """Non-blocking: show the predicate inputs and verdict for the measured case."""
    try:
        sys.path.insert(0, os.path.dirname(TARGET))
        import importlib
        mod = importlib.import_module("deploy-drift-guard")
        print("DIAG declared_crons(ai-health-prober) = %r"
              % (mod.declared_crons("ai-health-prober"),))
        print("DIAG declares_http_surface(ai-health-prober) = %r"
              % (mod.declares_http_surface("ai-health-prober"),))
        print("DIAG cron_only_declared(ai-health-prober) = %r"
              % (mod.cron_only_declared("ai-health-prober"),))
    except Exception as e:
        print("DIAG failed (non-blocking): %s" % e)


def main():
    if not os.path.isfile(TARGET):
        print("ABORT: target not found: %s" % TARGET)
        return 3
    with open(TARGET, encoding="utf-8") as fh:
        src = fh.read()

    if MARKER in src:
        print("ALREADY APPLIED: %s present in %s" % (MARKER, TARGET))
        diagnose()
        return 1

    out = src
    for name, anchor, repl in EDITS:
        sa = "\n".join(anchor) + "\n"
        n = out.count(sa)
        if n != 1:
            print("ABORT: anchor %r matched %d times (expected exactly 1) -- "
                  "target drifted, refusing to patch" % (name, n))
            return 3
        out = out.replace(sa, "\n".join(repl) + "\n", 1)
        print("applied: %s" % name)

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(out)

    # the ONLY gate before the workflow commits: the patched file must compile.
    try:
        py_compile.compile(TARGET, doraise=True)
    except Exception as e:
        print("POST-CHECK FAILED py_compile: %s" % e)
        return 4

    print("py_compile OK (%d bytes)" % len(out))
    diagnose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
