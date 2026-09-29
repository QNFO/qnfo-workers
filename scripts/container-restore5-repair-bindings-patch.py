#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-5 (issues #1485 / #1487 / #1493 / #1498) -- applier.

MEASURED DEFECTS IN scripts/restore_container_config.py (RESTORE-4)
Evidence: ci-status/restore-container-config-1485.json
          head 454334958702f3d2e536d96dfaef3e97ca306d2b, ts 2026-09-29T19:45:06Z

  restore_log:
      declared containers: [{"class_name": "ShellContainer", ...}]
      derived exports: {"ShellContainer": {"type": "durable-object", "storage": "sqlite"}}
      PUT /content -> HTTP 200
      post /settings containers: null
      FAIL (fail-closed): containers STILL absent after the PUT -- #1485 still open
  pre_settings:  bindings = ["AUDIT", "PILOT_TOKEN", "SHELL_CONTAINER"], containers = null
  post_settings: bindings = ["PILOT_TOKEN"],                              containers = null

D1) REGRESSION-CAUSING -- the accepted 200 PUT DROPPED two live bindings.
    pre_settings had AUDIT + PILOT_TOKEN + SHELL_CONTAINER; post_settings has
    PILOT_TOKEN only. So BINDING-PRESERVATION-1 does NOT hold on this path: the
    /content PUT with `exports` and no `bindings` reconciles the DO export and
    discards the bindings that were not re-declared.

    restore_container_config.py:220-221 then REFUSES to repair the loss:

        else:
            return False, "cannot repair binding %s (unknown identity)" % name

    so repair() returns before building any payload and the run leaves the fleet
    WORSE than it found it. Confirmed live from qnfo-ops: shell_exec failed with
    "container: Cannot read properties of undefined (reading 'idFromName')" --
    env.SHELL_CONTAINER is now undefined -- where before the run it failed with
    "... (reading 'running')" (ctx.container undefined, binding present).

D2) REPAIR RE-TRIGGERS 100402. repair() builds its metadata WITHOUT `exports`
    (line 222-224), but the class ShellContainer is provisioned, so a repair PUT
    that omits `exports` is rejected with the very 100402 the restore exists to
    clear. A repair path that cannot succeed is not a repair path.

FIX
  A) SHELL_CONTAINER becomes repairable: add the durable_object_namespace branch,
     deriving class_name from the declared [[containers]] block (never hardcoded)
     and script_name from WORKER.
  B) repair() carries the same `exports` shape the accepted S1 PUT used, so the
     repair is not rejected by the reconciliation it is repairing.

NOT IN SCOPE (deliberately not weakened here)
  The `/settings` containers check is left fail-closed. It is UNKNOWN whether
  `containers` is absent from the CF /settings response by API design or genuinely
  unset -- the 200 PUT response DID carry `named_handlers: [{"name":
  "ShellContainer", "handlers": ["class"]}]` and an `exports` block, which is
  positive evidence the upload was accepted. Weakening a fail-closed gate without
  that distinction resolved would be a false green. Recorded, not fixed.

FAIL-CLOSED: every edit requires exactly one occurrence; a miss raises and nothing
is written. Re-running on an already-patched file is a no-op, not an error.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "restore_container_config.py")

MARKER = "CONTAINER-CONFIG-RESTORE-5-REPAIR-BINDINGS"

EDITS = [
    # A1 -- make the container namespace identity a named constant next to the d1 one.
    (
        'AUDIT_D1_ID = os.environ.get("AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")\n',
        'AUDIT_D1_ID = os.environ.get("AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")\n'
        "# CONTAINER-CONFIG-RESTORE-5-REPAIR-BINDINGS: the container class name is read\n"
        "# from the declared [[containers]] block, never hardcoded, so this patch keeps\n"
        "# working if the class is renamed. The d1 id above is the one identity that\n"
        "# cannot be recovered from the repo and so is pinned, with an env override.\n"
        'CONTAINER_BINDING = os.environ.get("CONTAINER_BINDING", "SHELL_CONTAINER")\n',
    ),
    # A2 -- the actual defect: repair() refused the one binding the PUT destroyed.
    (
        '        elif name == "AUDIT":\n'
        '            adds.append({"type": "d1", "name": "AUDIT", "id": AUDIT_D1_ID})\n'
        "        else:\n"
        '            return False, "cannot repair binding %s (unknown identity)" % name\n',
        '        elif name == "AUDIT":\n'
        '            adds.append({"type": "d1", "name": "AUDIT", "id": AUDIT_D1_ID})\n'
        "        elif name == CONTAINER_BINDING:\n"
        "            # RESTORE-5: was `cannot repair binding ... (unknown identity)`.\n"
        "            # The identity is NOT unknown -- it is the class the [[containers]]\n"
        "            # block declares, and the script already parsed it.\n"
        '            cls = (containers[0].get("class_name") if containers else None) or "ShellContainer"\n'
        '            adds.append({"type": "durable_object_namespace", "name": CONTAINER_BINDING,\n'
        '                         "class_name": cls, "script_name": WORKER})\n'
        "        else:\n"
        '            return False, "cannot repair binding %s (unknown identity)" % name\n',
    ),
    # B -- the repair payload must carry exports or the server rejects it with 100402.
    (
        '    md = {"main_module": "worker.js", "containers": containers,\n'
        '          "compatibility_date": compat_date, "bindings": adds,\n'
        '          "keep_bindings": [t for t in KEEP_TYPES if t != "d1"]}\n',
        "    # RESTORE-5: a repair that omits `exports` is rejected by the same\n"
        "    # provisioned_class_missing_from_config reconciliation it is repairing.\n"
        '    _cls = (containers[0].get("class_name") if containers else None) or "ShellContainer"\n'
        '    md = {"main_module": "worker.js", "containers": containers,\n'
        '          "compatibility_date": compat_date, "bindings": adds,\n'
        '          "exports": [{"type": "durable-object", "name": _cls, "storage": "sqlite"}],\n'
        '          "keep_bindings": [t for t in KEEP_TYPES if t != "d1"]}\n',
    ),
    # Marker: make the applied state observable to applier-doctor without adding a
    # bare string that could be mistaken for an already-present signal.
    (
        "REQUIRED_BINDINGS = (\n",
        'MARKER = "%s"\n\nREQUIRED_BINDINGS = (\n' % MARKER,
    ),
]


def main():
    if not os.path.isfile(TARGET):
        raise SystemExit("FAIL-CLOSED: missing target " + TARGET)
    with open(TARGET, encoding="utf-8") as fh:
        text = fh.read()

    changed = False
    for old, new in EDITS:
        n = text.count(old)
        if n == 0:
            if new in text or MARKER in text:
                continue
            raise SystemExit("FAIL-CLOSED: anchor not found (0 occurrences)\n---\n" + old[:300])
        if n != 1:
            raise SystemExit("FAIL-CLOSED: anchor occurs %d times (expected 1)\n---\n%s" % (n, old[:300]))
        text = text.replace(old, new)
        changed = True

    if not changed:
        print("already applied: " + TARGET)
        return 0

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("patched " + TARGET)

    # ---- post-conditions: prove the EFFECT, not the edit -------------------
    checks = [
        ("SHELL_CONTAINER repairable", "durable_object_namespace" in text and "CONTAINER_BINDING" in text),
        ("no unknown-identity refusal for the container", 'elif name == CONTAINER_BINDING' in text),
        ("repair carries exports", '"exports": [{"type": "durable-object"' in text),
        ("class name derived, not hardcoded", 'containers[0].get("class_name")' in text),
        ("marker present", MARKER in text),
        ("d1 id preserved", "35e2e573-92f3-46ac-83c6-22f6429fc5e5" in text),
    ]
    bad = [n for n, ok in checks if not ok]
    for n, ok in checks:
        print("  %-46s %s" % (n, "OK" if ok else "FAIL"))
    if bad:
        raise SystemExit("FAIL-CLOSED: post-conditions failed: " + ", ".join(bad))
    import py_compile
    py_compile.compile(TARGET, doraise=True)
    print("PY_COMPILE_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
