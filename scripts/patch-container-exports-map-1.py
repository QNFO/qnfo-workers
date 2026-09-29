#!/usr/bin/env python3
"""CONTAINER-EXPORTS-MAP-1 (issues #1485 / #1487) -- applier for scripts/restore_container_config.py

WHAT THIS FIXES -- MEASURED, NOT INFERRED
  scripts/restore_container_config.py (RESTORE-4) tries seven upload-metadata shapes, four of
  which declare the provisioned Durable Object class through `exports`. All four encode it as
  a LIST of objects carrying a "name" key:

      sqlite_exp = [{"type": "durable-object", "name": class_name, "storage": "sqlite"}]

  Cloudflare's own rejection (ci-status/restore-container-config.json, 2026-09-29T19:43:35Z)
  prescribes a MAP keyed by class name instead:

      PUT /content -> HTTP 400
      errors[0].code = 100402
      "[provisioned_class_missing_from_config] class 'ShellContainer': class 'ShellContainer'
       has a provisioned Durable Object namespace (f3e32894405c49f9b33e8612c6d27861) but is
       not declared in `exports`. Every provisioned class must be declared in `exports`
       (live or tombstone); silent drift is not permitted. (add 'ShellContainer' back to
       `exports` as {"type": "durable-object", "storage": "sqlite"} (or "legacy-kv"), or
       replace the entry with a `deleted` / `renamed` ..."

  The phrase "add 'ShellContainer' back to `exports` as {...}" reads as
  exports["ShellContainer"] = {...}, i.e.

      {"ShellContainer": {"type": "durable-object", "storage": "sqlite"}}

  If the server requires that map encoding, then EVERY list-shaped strategy (S1, S2, S4, and
  the control S7) fails for one and the same reason, the log records "every declaration shape
  rejected", and #1485 survives another iteration while looking like a retry problem. That is
  the exact failure class this repo keeps hitting: a correct diagnosis paired with a payload
  the server never accepts.

WHAT THE PATCH DOES
  Inserts two map-shaped strategies and orders them FIRST, so the encoding the server's own
  error text prescribes is attempted before the list encoding:

      add("S0-exports-map-sqlite",     {"exports": {class_name: {"type": "durable-object", "storage": "sqlite"}}})
      add("S0b-exports-map-legacy-kv", {"exports": {class_name: {"type": "durable-object", "storage": "legacy-kv"}}})

  Nothing else changes: same fail-closed preconditions, same post-200 read-back assertion,
  same binding-regression repair, same exit codes.

IDEMPOTENT + FAIL-CLOSED
  If the anchor is already patched the script exits 0 without writing. If an anchor is missing
  the script exits 2 WITHOUT writing -- a silent partial patch is worse than no patch, because
  the next run would report "applied" while the payload stayed wrong.

ADVERSARIAL
  (a) The map-vs-list reading is an INFERENCE from the error text, not a verified API contract.
      This applier is therefore additive: it does not remove the list shapes, so if the map
      form is also rejected the run degrades to exactly today's behaviour (exit 3, no mutation)
      and the recorded STRATEGY RESULT line names both encodings.
  (b) If the server accepts a shape but silently drops `containers`, the existing post-200
      read-back still catches it and continues to the next shape.
  (c) This applier does not run the restore. It only corrects the payload the runner sends;
      the runner is .github/workflows/restore-container-config-1485.yml.

Usage: python3 scripts/patch-container-exports-map-1.py [--check]
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "restore_container_config.py")

ANCHOR_LIST = '    sqlite_exp = [{"type": "durable-object", "name": class_name, "storage": "sqlite"}]\n'
INSERT_LIST = (
    "    # CONTAINER-EXPORTS-MAP-1: the 100402 message prescribes a MAP keyed by class\n"
    "    # name ('add ShellContainer back to `exports` as {\"type\": \"durable-object\",\n"
    "    # \"storage\": \"sqlite\"}'), i.e. exports = {\"ShellContainer\": {...}}. The list\n"
    "    # encodings below carry an explicit \"name\" key instead. Both are tried; the map\n"
    "    # form is attempted first because it is the one the server asked for.\n"
    "    map_sqlite = {class_name: {\"type\": \"durable-object\", \"storage\": \"sqlite\"}}\n"
    "    map_legacy = {class_name: {\"type\": \"durable-object\", \"storage\": \"legacy-kv\"}}\n"
)

ANCHOR_S1 = '    add("S1-exports-sqlite", {"exports": sqlite_exp})\n'
INSERT_S1 = (
    '    add("S0-exports-map-sqlite", {"exports": map_sqlite})\n'
    '    add("S0b-exports-map-legacy-kv", {"exports": map_legacy})\n'
)

MARKER = "CONTAINER-EXPORTS-MAP-1"


def main():
    check = "--check" in sys.argv
    if not os.path.isfile(TARGET):
        print("FAIL (fail-closed): %s not found" % TARGET)
        return 2

    src = open(TARGET, encoding="utf-8").read()

    if "S0-exports-map-sqlite" in src:
        print("ALREADY PATCHED (%s present) -- nothing to do" % MARKER)
        return 0

    for label, anchor in (("sqlite_exp list anchor", ANCHOR_LIST),
                          ("S1 strategy anchor", ANCHOR_S1)):
        if src.count(anchor) != 1:
            print("FAIL (fail-closed): anchor '%s' matched %d times, expected exactly 1 "
                  "-- aborting WITHOUT writing" % (label, src.count(anchor)))
            return 2

    out = src.replace(ANCHOR_LIST, ANCHOR_LIST + INSERT_LIST, 1)
    out = out.replace(ANCHOR_S1, INSERT_S1 + ANCHOR_S1, 1)

    if "S0-exports-map-sqlite" not in out or "map_legacy" not in out:
        print("FAIL (fail-closed): post-condition failed -- aborting WITHOUT writing")
        return 2

    print("anchors applied: 2/2")
    print("inserted strategies: S0-exports-map-sqlite, S0b-exports-map-legacy-kv (ordered first)")

    if check:
        print("--check: not writing")
        return 0

    open(TARGET, "w", encoding="utf-8").write(out)
    print("WROTE %s (%d -> %d bytes)" % (TARGET, len(src), len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
