#!/usr/bin/env python3
"""cf-import-guard.py -- CF-IMPORT-GUARD-1: fail CI when a worker bundle imports a name that the
Cloudflare Workers runtime is known NOT to provide.

WHY THIS EXISTS
  qnfo-containers-pilot/worker.js carried

      import { Container } from "cloudflare:workers";
      class ShellContainer extends Container { ... }

  Cloudflare rejects that module at upload time:

      10021: Uncaught SyntaxError: The requested module 'cloudflare:workers' does not provide
      an export named 'Container'

  (restore-container-config-1485 run 36706155802). The pattern was manufactured by
  .github/workflows/fix-pilot-container-class.yml, an autonomous "fix" that rewrote the working
  plain class into this form and committed it to main. Every later restore/deploy of the worker
  from the repo then failed at upload, the failure was misread as "the container config is
  missing", and ~18 hours of retries followed while the LIVE worker (still the plain class)
  served normally. This guard makes the bad shape a red CI check instead of a production
  surprise, whoever or whatever writes it.

  It is a DENY-LIST of (module, name) pairs with evidence, on purpose: an allow-list of real
  `cloudflare:workers` exports would go stale and block legitimate new APIs.

USAGE
  python3 scripts/cf-import-guard.py            # scan every */worker.js and */deployed-current.worker.js
  python3 scripts/cf-import-guard.py PATH...    # scan the given files
Exit: 0 clean; 1 a forbidden import was found; 2 usage/IO error (fail closed).
"""
from __future__ import annotations

import glob
import os
import re
import sys

# (module, exported name) -> why it is forbidden. Add entries only with a measured failure.
FORBIDDEN = {
    ("cloudflare:workers", "Container"): (
        "'cloudflare:workers' does not export 'Container' (Cloudflare error 10021, run 36706155802). "
        "Containers are configured with [[containers]] in wrangler.toml and reached through "
        "ctx.container in a plain Durable Object class; the `Container` helper class ships in the "
        "@cloudflare/containers npm package and needs a bundling deploy."
    ),
}

IMPORT_RE = re.compile(
    r"""import\s*\{(?P<names>[^}]*)\}\s*from\s*['"](?P<mod>[^'"]+)['"]""", re.S
)


def imported_names(clause: str) -> list[str]:
    out = []
    for part in clause.split(","):
        part = part.strip()
        if not part:
            continue
        # `Original as alias` -> the exported name is Original
        out.append(part.split(" as ")[0].strip())
    return out


def scan_text(text: str) -> list[tuple[str, str, str]]:
    hits = []
    for m in IMPORT_RE.finditer(text):
        mod = m.group("mod")
        for name in imported_names(m.group("names")):
            why = FORBIDDEN.get((mod, name))
            if why:
                hits.append((mod, name, why))
    return hits


def main(argv: list[str]) -> int:
    paths = argv or sorted(
        glob.glob("*/worker.js") + glob.glob("*/deployed-current.worker.js")
    )
    if not paths:
        print("cf-import-guard: no worker bundles found (run from the repository root)", file=sys.stderr)
        return 2
    bad = 0
    for p in paths:
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError as e:
            print(f"cf-import-guard: cannot read {p}: {e}", file=sys.stderr)
            return 2
        for mod, name, why in scan_text(text):
            bad += 1
            print(f"FORBIDDEN-IMPORT {p}: import {{ {name} }} from \"{mod}\"")
            print(f"    {why}")
    if bad:
        print(f"\nCF-IMPORT-GUARD-1 FAILED: {bad} forbidden import(s) in {len(paths)} bundle(s)")
        return 1
    print(f"CF-IMPORT-GUARD-1 PASS: {len(paths)} bundle(s), no forbidden imports")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
