#!/usr/bin/env python3
"""PRESERVE-WORKER-METADATA-1 applier (issue #1487). VERSION-AGNOSTIC (v2).

WHY v2 EXISTS -- the v1 applier ROTTED
--------------------------------------
v1 pinned the anchor `var VERSION = "2.37.28-affirm-veto";`. A concurrent writer
advanced qnfo-ops to 2.37.30-container-deploy-guard before the applier's workflow
ran, so v1 would have exited 3 (anchor mismatch) and the fix would never land.
That is the STALE-PREFLIGHT-1 / frozen-literal-gate class: a fix whose own gate
guarantees it stops applying as soon as anything else moves. v2 derives the
version literal from the source instead of pinning it.

ROOT CAUSE (unchanged, measured)
--------------------------------
qnfo-ops cfWorkerDeploy() rebuilds the deploy metadata from GET /bindings only:

    Object.assign(_mp, { bindings: bindingsOut }, { compatibility_date: _compatDate },
                  _compatFlags.length ? { compatibility_flags: _compatFlags } : {},
                  Object.keys(_exports).length ? { exports: _exports } : {})

Worker-LEVEL metadata (containers, migrations, limits, observability, logpush,
placement, tail_consumers, assets) is neither a binding nor a /content field, so a
deploy through this path silently STRIPS it.

OBSERVED CONSEQUENCE (outage #1485, 2026-09-29)
-----------------------------------------------
deployment_history id 172 -> qnfo-containers-pilot deployed 2026-09-29T19:30:35.100Z
by "qnfo-ops:cf_worker_deploy". The first cloud_ops_events row matching "Cannot read
properties of undefined (reading 'running')" landed 19:30:43.591Z -- 8 SECONDS later.
Every container tool then returned HTTP 500: shell_exec, exec_python, exec_node,
container_install, git_clone_exec, container_workspace_exec, shell_pipeline,
container_status.

SCOPE CORRECTION (measured, not assumed)
----------------------------------------
Only cf_worker_deploy strips metadata. scripts/raw_put.py uses the /content endpoint,
which replaces the module while PRESERVING settings/metadata. raw_put.py is the SAFE
deploy path; cf_worker_deploy is the stripper.

FIX
---
1. Read back /settings and re-send every present worker-level metadata key.
2. Fail CLOSED for a container worker whose container config could not be read:
   refuse the deploy rather than strip it.

Exit codes: 0 = applied or already applied (idempotent); 3 = anchor mismatch or
precondition failure (fail closed, nothing written).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "qnfo-ops", "worker.js")
MIRROR = os.path.join(ROOT, "qnfo-ops", "deployed-current.worker.js")

MARKER = "PRESERVE-WORKER-METADATA-1"
NEW_TAG = "preserve-worker-meta"
# version-agnostic: capture the 2.37.<minor> prefix and bump <minor> by one
VERSION_RE = re.compile(r'var VERSION = "(2\.37\.)(\d+)(?:-[^"]*)?";')

A1_OLD = "    let _compatFlags = [];\n"
A1_NEW = (
    "    let _compatFlags = [];\n"
    "    // PRESERVE-WORKER-METADATA-1 (issue #1487): worker-level metadata read back from\n"
    "    // /settings and re-sent on every deploy so this path can no longer strip it.\n"
    "    let _preservedMeta = {};\n"
)

A2_OLD = (
    "        if (_sr && Array.isArray(_sr.compatibility_flags)) "
    "_compatFlags = _sr.compatibility_flags.slice();\n"
)
A2_NEW = A2_OLD + (
    "        // PRESERVE-WORKER-METADATA-1 (issue #1487): /settings also carries worker-LEVEL\n"
    "        // metadata that is NOT a binding and NOT a /content field. Rebuilding metadata\n"
    "        // from bindings alone silently strips it. Observed 2026-09-29: a cf_worker_deploy\n"
    "        // removed [[containers]] from qnfo-containers-pilot and every container route\n"
    "        // returned \"Cannot read properties of undefined (reading 'running')\" 8s later.\n"
    "        if (_sr) {\n"
    "          for (const _pk of [\"containers\", \"migrations\", \"limits\", \"observability\", "
    "\"logpush\", \"placement\", \"tail_consumers\", \"assets\"]) {\n"
    "            if (_sr[_pk] !== undefined && _sr[_pk] !== null) _preservedMeta[_pk] = _sr[_pk];\n"
    "          }\n"
    "        }\n"
)

A3_OLD = (
    "    const metadataPart = JSON.stringify(Object.assign(_mp, { bindings: bindingsOut }, "
    "{ compatibility_date: _compatDate }, _compatFlags.length ? { compatibility_flags: "
    "_compatFlags } : {}, Object.keys(_exports).length ? { exports: _exports } : {}));\n"
)
A3_NEW = (
    "    // PRESERVE-WORKER-METADATA-1 (issue #1487): fail CLOSED rather than strip. A\n"
    "    // container worker deployed without its [[containers]] config serves HTTP 500 on\n"
    "    // every container route (outage #1485). Refusing is strictly better than breaking.\n"
    "    const _containerish = /ctx\\.container|getContainer\\s*\\(|@cloudflare\\/containers/.test(content);\n"
    "    if (_containerish && !_preservedMeta.containers) {\n"
    "      return { ok: false, rejected: true, error: \"PRESERVE-WORKER-METADATA-1: source references ctx.container/getContainer but no [[containers]] config could be read from GET /settings for \" + worker + \". Deploying through this path would STRIP the container config and return HTTP 500 on every container route (outage #1485, 2026-09-29). Refusing deploy. Use `wrangler deploy` for container workers.\" };\n"
    "    }\n"
    "    const metadataPart = JSON.stringify(Object.assign(_mp, { bindings: bindingsOut }, "
    "{ compatibility_date: _compatDate }, _compatFlags.length ? { compatibility_flags: "
    "_compatFlags } : {}, Object.keys(_exports).length ? { exports: _exports } : {}, "
    "_preservedMeta));\n"
)

EDITS = [
    ("A1 compat-flags declaration", A1_OLD, A1_NEW),
    ("A2 settings read-back", A2_OLD, A2_NEW),
    ("A3 metadata rebuild + fail-closed guard", A3_OLD, A3_NEW),
]


def main():
    if not os.path.exists(TARGET):
        print("FAIL (fail-closed): target not found: %s" % TARGET)
        return 3

    with open(TARGET, "r", encoding="utf-8") as fh:
        src = fh.read()

    if MARKER in src:
        print("already applied: %s present in %s (%d bytes) - no change" % (MARKER, TARGET, len(src)))
        return 0

    # derive the version literal from the source (no pinned literal -> no rot)
    m = VERSION_RE.search(src)
    if not m:
        print("FAIL (fail-closed): could not find a 2.37.<minor> VERSION literal in %s" % TARGET)
        return 3
    old_version_literal = m.group(0)
    new_version_literal = 'var VERSION = "%s%d-%s";' % (m.group(1), int(m.group(2)) + 1, NEW_TAG)
    if src.count(old_version_literal) != 1:
        print("FAIL (fail-closed): version literal %r matched %d times, expected 1"
              % (old_version_literal, src.count(old_version_literal)))
        return 3

    all_edits = EDITS + [("A4 version bump (derived)", old_version_literal, new_version_literal)]

    # fail closed on any ambiguous anchor BEFORE mutating anything
    for name, old, _new in all_edits:
        n = src.count(old)
        if n != 1:
            print("FAIL (fail-closed): anchor %s matched %d times, expected exactly 1" % (name, n))
            return 3

    out = src
    for _name, old, new in all_edits:
        out = out.replace(old, new, 1)

    # structural sanity: the delimiter deltas must be unchanged by the patch
    def deltas(s):
        return [s.count("{") - s.count("}"), s.count("(") - s.count(")"), s.count("[") - s.count("]")]

    if deltas(out) != deltas(src):
        print("FAIL (fail-closed): delimiter delta changed %s -> %s" % (deltas(src), deltas(out)))
        return 3

    for need in (MARKER, "_preservedMeta", "_containerish", new_version_literal):
        if need not in out:
            print("FAIL (fail-closed): expected marker missing after patch: %s" % need)
            return 3
    if old_version_literal in out:
        print("FAIL (fail-closed): old version literal survived: %s" % old_version_literal)
        return 3
    # the stripper form must be gone: metadataPart must now spread _preservedMeta
    if "_exports } : {}, _preservedMeta));" not in out:
        print("FAIL (fail-closed): metadataPart still strips worker-level metadata")
        return 3

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(out)

    wrote_mirror = False
    if os.path.exists(MIRROR):
        with open(MIRROR, "w", encoding="utf-8") as fh:
            fh.write(out)
        wrote_mirror = True

    print("PRESERVE-WORKER-METADATA-1 applied to %s" % TARGET)
    print("  bytes: %d -> %d (+%d)" % (len(src), len(out), len(out) - len(src)))
    print("  version: %s -> %s" % (old_version_literal, new_version_literal))
    print("  mirror updated: %s" % wrote_mirror)
    return 0


if __name__ == "__main__":
    sys.exit(main())
