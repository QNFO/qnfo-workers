#!/usr/bin/env python3
"""OPS-D1-SCHEMA-HINT-FULL-1 + PRESERVE-WORKER-METADATA-2 + CONTAINER-GUARD-AFTER-READ-1
(issues #1490, #1487, #1485).

Target: qnfo-ops/worker.js (377,540 bytes, 6,010 lines at 2026-09-29T19:50Z).

WHY -- all three measured live this session, not inferred:

  #1490 OPS-D1-QUERY-SCHEMA-HINT-TRUNCATED-1
    d1Query()'s "no such table" hint built its table list as
        rows2.map(r => r.tbl).slice(0, 80)
    over an ALPHABETICAL list. MEASURED: QNFO_AUDIT holds 306 tables
    (SELECT COUNT(*) FROM sqlite_master WHERE type='table' -> 306), and the live hint response
    ended at "email_commands" -- so 226 tables were invisible to every agent, which is exactly
    the "agents keep guessing column names" failure the hint was written to end.
    Fix: never truncate silently. Emit schema_tables_total + schema_tables_truncated and name
    sqlite_master as the authoritative enumerator.

  #1487 PRESERVE-WORKER-METADATA-2 (containers half)
    cf_worker_deploy's upload metadata carried `exports` but never `containers`.
    [[containers]] is script-level config, not a binding, so BINDING-PRESERVE-1 could not
    protect it. MEASURED: deployment_history id 172 at 19:30:35.100Z, first kind=container.error
    at 19:30:43.591Z (8 s later), text "Cannot read properties of undefined (reading 'running')".
    Fix: carry `containers` from the SAME GET /settings read already used for compatibility_date.

  #1485 CONTAINER-GUARD-AFTER-READ-1
    The container guard returned BEFORE the /settings read, so it could never distinguish
    "container config unreadable" from "container config absent" -- and it would refuse the very
    deploy that restores the config. Fix: evaluate it AFTER the read; refuse only when the read
    genuinely returned no containers.

ADVERSARIAL
  (a) This patch CANNOT restore a container config that is already absent: if GET /settings
      returns containers=null the guard still refuses. Deliberate (fail closed). Restoration is
      scripts/restore_container_config_v5.py's job.
  (b) Every anchor count is asserted == 1. Any drift aborts rc 3 and writes NOTHING (the
      applier-rot lesson: a partially applied patch is worse than none).
  (c) The `_isContainerWorker` rename leaves the original name list in place, so a NEW container
      worker still must be added by hand. Detection from wrangler.toml is out of scope here.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "qnfo-ops", "worker.js")
MARKER = "OPS-D1-SCHEMA-HINT-FULL-1"

R1_OLD = (
    '        if (!out.available_columns) out.schema_tables = rows2.map(function(r) '
    '{ return r.tbl; }).slice(0, 80);'
)
R1_NEW = (
    '        if (!out.available_columns) {\n'
    '          // OPS-D1-SCHEMA-HINT-FULL-1 (issue #1490): this list was capped at 80 entries in\n'
    '          // ALPHABETICAL order. MEASURED 2026-09-29: QNFO_AUDIT holds 306 tables, so every\n'
    '          // table sorting after "email_commands" was INVISIBLE and agents kept guessing names\n'
    '          // (166 agent-schema-guess tool failures in the preceding 24h). Never truncate\n'
    '          // silently again: report the total, flag truncation, and name the enumerator.\n'
    '          const _tblAll = rows2.map(function(r) { return r.tbl; })\n'
    '            .filter(function(t) { return !!t; });\n'
    '          out.schema_tables = _tblAll.slice(0, 400);\n'
    '          out.schema_tables_total = _tblAll.length;\n'
    '          out.schema_tables_truncated = _tblAll.length > out.schema_tables.length;\n'
    '          out.hint = "table not found. schema_tables lists " + out.schema_tables.length +\n'
    '            " of " + out.schema_tables_total + " tables; enumerate all with: " +\n'
    '            "SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name";\n'
    '        }'
)

R2_OLD = (
    '    let _compatDate = "2026-08-01";\n'
    '    let _compatFlags = [];\n'
    '    try {'
)
R2_NEW = (
    '    let _compatDate = "2026-08-01";\n'
    '    let _compatFlags = [];\n'
    '    // PRESERVE-WORKER-METADATA-2 (issues #1485/#1487): [[containers]] is SCRIPT-LEVEL\n'
    '    // config, not a binding, so BINDING-PRESERVE-1 never carried it and every /content PUT\n'
    '    // silently dropped it (MEASURED: deployment_history id 172 at 19:30:35.100Z, first\n'
    '    // container.error at 19:30:43.591Z -- 8s later). Read it from the SAME GET /settings\n'
    '    // call already used for compatibility_date.\n'
    '    let _containers = [];\n'
    '    try {'
)

R3_OLD = (
    '        if (_sr && Array.isArray(_sr.compatibility_flags)) '
    '_compatFlags = _sr.compatibility_flags.slice();'
)
R3_NEW = (
    '        if (_sr && Array.isArray(_sr.compatibility_flags)) '
    '_compatFlags = _sr.compatibility_flags.slice();\n'
    '        if (_sr && Array.isArray(_sr.containers)) _containers = _sr.containers.slice();'
)

R4_OLD = (
    '    const metadataPart = JSON.stringify(Object.assign(_mp, { bindings: bindingsOut }, '
    '{ compatibility_date: _compatDate }, _compatFlags.length ? { compatibility_flags: '
    '_compatFlags } : {}, Object.keys(_exports).length ? { exports: _exports } : {}));'
)
R4_NEW = (
    '    const metadataPart = JSON.stringify(Object.assign(_mp, { bindings: bindingsOut }, '
    '{ compatibility_date: _compatDate }, _compatFlags.length ? { compatibility_flags: '
    '_compatFlags } : {}, Object.keys(_exports).length ? { exports: _exports } : {}, '
    '_containers.length ? { containers: _containers } : {}));'
)

R5_OLD = (
    '  const _CONTAINER_WORKERS = ["qnfo-containers-pilot"];\n'
    '  if (_CONTAINER_WORKERS.indexOf(worker) !== -1 && !(args && args.allow_container_config_drop)) {\n'
    '    return {\n'
    '      ok: false,\n'
    '      rejected: true,\n'
    '      error: "CONTAINER-CONFIG-DROPPED-1: " + worker + " declares [[containers]]; '
    'cf_worker_deploy PUTs /content and rebuilds bindings from GET /bindings, and [[containers]] '
    'is not a binding, so this deploy would destroy the container config and take the whole '
    'container tool family down. Deploy with wrangler deploy '
    '(.github/workflows/deploy-containers-pilot.yml). Pass allow_container_config_drop:true only '
    'for a deliberate container teardown."\n'
    '    };\n'
    '  }'
)
R5_NEW = (
    '  const _CONTAINER_WORKERS = ["qnfo-containers-pilot"];\n'
    '  // CONTAINER-GUARD-AFTER-READ-1 (issues #1485/#1487): the decision moved BELOW the live\n'
    '  // /settings read. A name check evaluated before the read can never distinguish\n'
    '  // "container config unreadable" from "container config absent", and it refuses the very\n'
    '  // deploy that would restore the config.\n'
    '  const _isContainerWorker = _CONTAINER_WORKERS.indexOf(worker) !== -1;'
)

R6_OLD = '    if (!_compatDate) _compatDate = "2026-08-01";'
R6_NEW = (
    '    if (!_compatDate) _compatDate = "2026-08-01";\n'
    '    if (_isContainerWorker && !_containers.length &&\n'
    '        !(args && args.allow_container_config_drop)) {\n'
    '      return {\n'
    '        ok: false,\n'
    '        rejected: true,\n'
    '        error: "CONTAINER-CONFIG-DROPPED-1: " + worker + " is a container worker and "\n'
    '          + "GET /settings returned NO containers array, so this PUT would leave the "\n'
    '          + "container config absent (the measured #1485 failure). Restore it with "\n'
    '          + "scripts/restore_container_config_v5.py (versions API). Pass "\n'
    '          + "allow_container_config_drop:true only for a deliberate teardown."\n'
    '      };\n'
    '    }'
)

PAIRS = [
    ("R1 schema-hint-full-list (#1490)", R1_OLD, R1_NEW),
    ("R2 containers declaration (#1487)", R2_OLD, R2_NEW),
    ("R3 read containers from /settings (#1487)", R3_OLD, R3_NEW),
    ("R4 carry containers in metadata (#1487)", R4_OLD, R4_NEW),
    ("R5 guard: name check -> flag (#1485)", R5_OLD, R5_NEW),
    ("R6 guard: evaluate after read (#1485)", R6_OLD, R6_NEW),
]


def main():
    if not os.path.isfile(TARGET):
        print("FAIL (fail-closed): %s not found" % TARGET)
        return 3
    src = open(TARGET, encoding="utf-8").read()

    if MARKER in src and "_containers.length ? { containers: _containers }" in src:
        print("ALREADY APPLIED: %s present; nothing to do" % MARKER)
        return 0

    out = src
    for name, old, new in PAIRS:
        n = out.count(old)
        if n != 1:
            print("FAIL (fail-closed): anchor for %s matched %d times, expected 1" % (name, n))
            print("  anchor head: %s" % old.split("\n")[0][:110])
            return 3
        out = out.replace(old, new, 1)
        print("applied %s" % name)

    if out == src:
        print("FAIL (fail-closed): no bytes changed")
        return 3

    open(TARGET, "w", encoding="utf-8").write(out)
    print("WROTE %s  %d -> %d bytes (+%d)" % (TARGET, len(src), len(out), len(out) - len(src)))
    print("OK: %s landed (issues #1490, #1487, #1485)" % MARKER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
