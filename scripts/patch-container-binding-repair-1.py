#!/usr/bin/env python3
"""CONTAINER-BINDING-REPAIR-1 (issues #1485 / #1487) -- applier for scripts/restore_container_config.py

WHY THIS IS NEEDED -- MEASURED THIS SESSION, NOT INFERRED
  Two live reads of the same endpoint, ~4 minutes apart, 2026-09-29:

    GET /accounts/.../workers/scripts/qnfo-containers-pilot/bindings  (early)
      count=3  [d1 AUDIT, secret_text PILOT_TOKEN, durable_object_namespace SHELL_CONTAINER]

    GET /accounts/.../workers/scripts/qnfo-containers-pilot/bindings  (later)
      count=1  [secret_text PILOT_TOKEN]

  The D1 binding AND the Durable Object namespace binding were DROPPED during the #1485
  restore loop. The observable consequence is a changed failure signature:

    before:  "Cannot read properties of undefined (reading 'running')"   (ctx.container)
    after:   "Cannot read properties of undefined (reading 'idFromName')" (env.SHELL_CONTAINER)

  This FALSIFIES the assumption recorded in the restore script's own docstring, that
  "the /content PUT preserves live bindings by omission (BINDING-PRESERVATION-1)". Omitting
  `bindings` did not preserve them; it dropped two of three. So a restore that only fixes
  `containers` leaves the worker unable to reach either its Durable Object or its audit D1.

THE GAP THIS CLOSES
  repair() re-adds AUDIT and PILOT_TOKEN but explicitly refuses SHELL_CONTAINER:

      else:
          return False, "cannot repair binding %s (unknown identity)" % name

  With SHELL_CONTAINER unrecoverable, the post-200 check can never pass and the script exits 4
  REGRESSION-UNREPAIRED even when the container config was successfully restored -- a correct
  payload reported as a failure, which is the same class of blindness this repo keeps hitting.

WHAT THE PATCH DOES
  1. Adds SHELL_CONTAINER_NS (the live namespace id observed in GET /bindings before the drop:
     f3e32894405c49f9b33e8612c6d27861), overridable by env SHELL_CONTAINER_NS.
  2. Teaches repair() to rebuild the durable_object_namespace binding from that id, deriving
     class_name from the parsed [[containers]] block (no signature change).

IDEMPOTENT + FAIL-CLOSED
  Already-patched -> exit 0, no write. Anchor missing or ambiguous -> exit 2, NO write.

ADVERSARIAL
  (a) The namespace id is a constant captured from a live read at one instant. If the account
      re-provisions the namespace, the repair re-adds a stale id and Cloudflare rejects the PUT;
      the script then reports REGRESSION-UNREPAIRED rather than going green, and SHELL_CONTAINER_NS
      can be overridden from env. A stale-but-accepted id would be silently wrong -- that is the
      residual risk this patch cannot eliminate from inside the repo.
  (b) This does not make the restore succeed by itself; it removes one specific reason it cannot.
  (c) It does not run anything. The runner is
      .github/workflows/restore-container-config-1485.yml.

Usage: python3 scripts/patch-container-binding-repair-1.py [--check]
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "restore_container_config.py")

ANCHOR_CONST = (
    'AUDIT_D1_ID = os.environ.get("AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")\n'
)
INSERT_CONST = (
    "# CONTAINER-BINDING-REPAIR-1: live namespace id for the container DO class, captured from\n"
    "# GET /bindings BEFORE the 2026-09-29 drop (3 bindings -> 1). Overridable from env so a\n"
    "# re-provisioned namespace does not require a code change.\n"
    'SHELL_CONTAINER_NS = os.environ.get("SHELL_CONTAINER_NS",\n'
    '                                   "f3e32894405c49f9b33e8612c6d27861")\n'
)

ANCHOR_ELSE = (
    '        else:\n'
    '            return False, "cannot repair binding %s (unknown identity)" % name\n'
)
INSERT_ELSE = (
    '        elif name == "SHELL_CONTAINER":\n'
    '            _cls = (containers[0] or {}).get("class_name") or "ShellContainer"\n'
    '            adds.append({"type": "durable_object_namespace", "name": "SHELL_CONTAINER",\n'
    '                         "class_name": _cls, "namespace_id": SHELL_CONTAINER_NS})\n'
) + ANCHOR_ELSE


def main():
    check = "--check" in sys.argv
    if not os.path.isfile(TARGET):
        print("FAIL (fail-closed): %s not found" % TARGET)
        return 2

    src = open(TARGET, encoding="utf-8").read()

    if "SHELL_CONTAINER_NS" in src:
        print("ALREADY PATCHED (SHELL_CONTAINER_NS present) -- nothing to do")
        return 0

    for label, anchor in (("AUDIT_D1_ID constant", ANCHOR_CONST),
                          ("repair() unknown-identity else", ANCHOR_ELSE)):
        if src.count(anchor) != 1:
            print("FAIL (fail-closed): anchor '%s' matched %d times, expected exactly 1 "
                  "-- aborting WITHOUT writing" % (label, src.count(anchor)))
            return 2

    out = src.replace(ANCHOR_CONST, ANCHOR_CONST + INSERT_CONST, 1)
    out = out.replace(ANCHOR_ELSE, INSERT_ELSE, 1)

    if "SHELL_CONTAINER_NS" not in out or 'elif name == "SHELL_CONTAINER"' not in out:
        print("FAIL (fail-closed): post-condition failed -- aborting WITHOUT writing")
        return 2

    print("anchors applied: 2/2")
    print("repair() can now rebuild the SHELL_CONTAINER durable_object_namespace binding")

    if check:
        print("--check: not writing")
        return 0

    open(TARGET, "w", encoding="utf-8").write(out)
    print("WROTE %s (%d -> %d bytes)" % (TARGET, len(src), len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
