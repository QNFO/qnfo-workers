#!/usr/bin/env python3
"""CONTAINER-DECLARED-INERT-1 (2026-09-29, issue #1456) -- make the sibling wrangler.toml
the SOURCE OF TRUTH for [[containers]] in scripts/raw_put.py.

MEASURED, NOT INFERRED
  qnfo-containers-pilot/wrangler.toml declares
      [[containers]] class_name="ShellContainer" instance_type="basic" max_instances=3
  (basic = 1/4 vCPU, 1 GiB RAM, 4 GB disk). That declaration is the #1456
  CONTAINER-ROOTFS-CAPACITY-STRUCTURAL-1 fix; the previous geometry was lite
  (1/16 vCPU, 256 MiB, 2 GB disk).

  Live measurement of the running container (2026-09-29):
      df -h /  ->  /dev/vdc  1.9G  1.6G  290M  85%  /
  1.9 G == the LITE geometry. The declared upgrade never took effect.

ROOT CAUSE
  CONTAINER-CONFIG-PRESERVE-1 carries containers as
      _want_containers = _live_containers or _decl_containers
  so LIVE wins and the declaration is inert forever. Same class as
  AUTODEPLOY-SCHEDULES-NOT-APPLIED-1 (#1390): a declared field the deployer does not
  apply is a field the repo edit cannot change.

FIX
  Declared wins when present and different; live remains the fallback.

FAIL-CLOSED / IDEMPOTENT
  marker present       -> exit 0, no write
  anchor count != 1    -> exit 1, no write
  post-assert missing  -> exit 1, no write
"""
import os
import sys

MARKER = "CONTAINER-DECLARED-INERT-1"


def find_root():
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(6):
        d = os.path.dirname(d)
        if os.path.isfile(os.path.join(d, "qnfo-ops", "worker.js")):
            return d
    return os.getcwd()


ROOT = find_root()
TARGET = os.path.join(ROOT, "scripts", "raw_put.py")

ANCHOR = (
    '    _live_containers = (live or {}).get("containers") or []\n'
    '    _decl_containers = declared_containers(path)\n'
    '    _want_containers = _live_containers or _decl_containers\n'
)

REPLACEMENT = (
    '    _live_containers = (live or {}).get("containers") or []\n'
    '    _decl_containers = declared_containers(path)\n'
    '    # CONTAINER-DECLARED-INERT-1 (2026-09-29, issue #1456): `live or declared` made the\n'
    '    # wrangler.toml declaration INERT -- a live lite container carried itself forward on\n'
    '    # every deploy, so the declared instance_type="basic" upgrade (the #1456 rootfs-capacity\n'
    '    # fix) never took effect. MEASURED: wrangler.toml declares basic (4 GB disk) while the\n'
    '    # running container reports /dev/vdc 1.9 G (lite). Same defect class as\n'
    '    # AUTODEPLOY-SCHEDULES-NOT-APPLIED-1 (#1390), which was closed by making the sibling\n'
    '    # wrangler.toml the source of truth for the declared field. Declared wins when it is\n'
    '    # present and differs; live stays the fallback so a worker with no declaration is still\n'
    '    # protected from a config-destroying PUT.\n'
    '    if _decl_containers and _decl_containers != _live_containers:\n'
    '        _want_containers = _decl_containers\n'
    '        print("CONTAINERS: declaration differs from live -> applying wrangler.toml "\n'
    '              "(CONTAINER-DECLARED-INERT-1) live=" + json.dumps(_live_containers)\n'
    '              + " declared=" + json.dumps(_decl_containers))\n'
    '    else:\n'
    '        _want_containers = _live_containers or _decl_containers\n'
)


def main():
    if not os.path.isfile(TARGET):
        print("FAIL (fail-closed): %s not found" % TARGET)
        return 1

    with open(TARGET, encoding="utf-8") as fh:
        src = fh.read()

    if MARKER in src:
        print("OK (already patched): scripts/raw_put.py")
        return 0

    n = src.count(ANCHOR)
    if n != 1:
        print("FAIL (fail-closed): anchor matched %d times, expected exactly 1 -- no write" % n)
        return 1

    out = src.replace(ANCHOR, REPLACEMENT, 1)

    for probe in (MARKER, "CONTAINER-DECLARED-INERT-1) live=",
                  "_want_containers = _decl_containers", "else:"):
        if probe not in out:
            print("FAIL (post-write assertion): missing %r -- no write" % probe)
            return 1
    # the old unconditional live-preference must be gone
    if "_want_containers = _live_containers or _decl_containers\n" not in out:
        print("FAIL (post-write assertion): fallback branch absent -- no write")
        return 1
    if out.count("_want_containers = _live_containers or _decl_containers") != 1:
        print("FAIL (post-write assertion): live-preference occurrences != 1 -- no write")
        return 1

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(out)
    print("PATCHED scripts/raw_put.py (%d -> %d bytes) CONTAINER-DECLARED-INERT-1" % (len(src), len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
