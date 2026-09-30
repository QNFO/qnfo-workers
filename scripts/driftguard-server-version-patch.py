#!/usr/bin/env python3
"""driftguard-server-version-patch.py

DRIFT-GUARD-SERVER-VERSION-1 + DUP-WORKER-NAME-DIR-1 (issue #1384).

Two VERIFIED defects in scripts/deploy-drift-guard.py.

DEFECT 1 -- NO_REPO_VERSION FALSE POSITIVE.
    CONST = re.compile(r'(?:var|let|const)\\s+(QNFO_)?VERSION\\s*=\\s*"([^"]+)"')
cannot match `SERVER_VERSION`. Evidence read from main this session: all four
qnfo-memory-mcp artifacts
    memory-mcp/worker.js
    memory-mcp/deployed-current.worker.js
    qnfo-memory-mcp/worker.js
    qnfo-memory-mcp/deployed-current.worker.js
declare only `SERVER_VERSION = "2.0.3"`; live /health (and the deployed bundle)
report 2.0.3; yet qnfo-audit.worker_live_audit recorded
    note='NO_REPO_VERSION' for worker qnfo-memory-mcp, probed_at 2026-09-29 16:05:10.
So a worker that is IN SYNC was published as a repo source gap, and it could never
be emitted by --ahead (no numeric repo version to compare).

PROTOCOL_VERSION is deliberately NOT accepted: it is a dated MCP protocol revision
("2024-11-05"), not a build version. Proven safe: with the new regex each of the
four artifacts yields exactly ONE match (SERVER_VERSION) while PROTOCOL_VERSION is
present in the same file -- so the pattern provably does not capture it.

DEFECT 2 -- DUP WORKER NAME ACROSS DIRECTORIES.
memory-mcp/ and qnfo-memory-mcp/ both declare `name = "qnfo-memory-mcp"`, so the
guard probed the same worker twice and tallied it twice in every class. That
produced the malformed composite note "NO_REPO_VERSION+NO_REPO_VERSION" in
worker_live_audit -- a note no classifier or query matched, so the row was
effectively invisible to every downstream consumer (issue #1384).
Exactly one directory per worker is now tallied; the others are reported in the
new `dup_dirs` array so nothing is silently dropped.

FAIL-CLOSED: every anchor must occur exactly once, the patched file must
py_compile, and a regex self-test must pass -- otherwise the script exits non-zero
and writes nothing.
IDEMPOTENT: if the SERVER-VERSION-1 marker is already present, exit 0, write nothing.
"""
import py_compile
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "scripts" / "deploy-drift-guard.py"

MARK = "SERVER-VERSION-1"
DUP_MARK = "DUP-WORKER-NAME-DIR-1"

# ---------------------------------------------------------------- single-line anchors
L_CONST = r'''CONST = re.compile(r'(?:var|let|const)\s+(QNFO_)?VERSION\s*=\s*"([^"]+)"')'''

L_CONST_NEW = "\n".join([
    "# SERVER-VERSION-1 (2026-09-29, issue #1384): the fleet version-constant convention is",
    "# not uniform. Several workers declare ONLY `SERVER_VERSION` (MCP convention:",
    "# SERVER_NAME/SERVER_VERSION), which the previous regex could not match -- the worker",
    "# was then reported NO_REPO_VERSION while its repo version was present AND equal to live",
    "# (verified: SERVER_VERSION=2.0.3 == live 2.0.3 for qnfo-memory-mcp). The prefix group",
    "# now also accepts SERVER_. PROTOCOL_VERSION is deliberately NOT accepted: it is a dated",
    "# MCP protocol revision (\"2024-11-05\"), not a build version.",
    r'''CONST = re.compile(r'(?:var|let|const)\s+(QNFO_|SERVER_)?VERSION\s*=\s*"([^"]+)"')''',
])

L_FALLBACK = "    QNFO_VERSION remains a fallback so no worker becomes invisible to the drift check."
L_FALLBACK_NEW = "\n".join([
    L_FALLBACK,
    "    SERVER-VERSION-1 adds SERVER_VERSION as a second fallback for workers that follow",
    "    the MCP naming convention (SERVER_NAME/SERVER_VERSION) and declare no plain VERSION.",
])

L_NAME = "        worker = declared or d"
L_NAME_NEW = "\n".join([
    L_NAME,
    "        # DUP-WORKER-NAME-DIR-1 (issue #1384): two directories can declare the same",
    "        # worker name. Only the canonical directory is tallied; the rest are recorded",
    "        # in `dup_dirs` so no directory is silently dropped.",
    "        if worker in dup_map and dup_map[worker] != d:",
    "            dup_skipped.append((d, worker, dup_map[worker]))",
    "            continue",
])

L_LOOP = "    for d in sorted(os.listdir(ROOT)):"
L_LOOP_NEW = "\n".join([
    "    # DUP-WORKER-NAME-DIR-1 (issue #1384): resolve exactly ONE canonical directory per",
    "    # worker name BEFORE tallying. memory-mcp/ and qnfo-memory-mcp/ both declare",
    "    # name = \"qnfo-memory-mcp\", which made the guard probe one worker twice and emit the",
    "    # malformed composite note \"NO_REPO_VERSION+NO_REPO_VERSION\" that no classifier or",
    "    # query matched. Canonical = the directory named after the worker (fleet convention,",
    "    # and the directory holding the compiled deployable artifact), else the first",
    "    # alphabetically. Deterministic; skipped dirs are reported in `dup_dirs`.",
    "    dup_map = {}",
    "    dup_skipped = []",
    "    _by_worker = {}",
    "    for _d in sorted(os.listdir(ROOT)):",
    "        if (not os.path.isdir(os.path.join(ROOT, _d))",
    "                or _d.startswith(\".\") or _d.startswith(\"_\")):",
    "            continue",
    "        _by_worker.setdefault(wrangler_name(_d) or _d, []).append(_d)",
    "    for _w, _ds in _by_worker.items():",
    "        if len(_ds) > 1:",
    "            dup_map[_w] = _w if _w in _ds else _ds[0]",
    L_LOOP,
])

L_JSON = '            "name_resolution": True,'
L_JSON_NEW = "\n".join([
    '            "dup_dirs": [{"worker": w, "skipped_dir": d, "canonical_dir": c}',
    "                          for d, w, c in dup_skipped],",
    L_JSON,
])

EDITS = [
    ("CONST", L_CONST, L_CONST_NEW),
    ("fallback-docstring", L_FALLBACK, L_FALLBACK_NEW),
    ("dup-skip", L_NAME, L_NAME_NEW),
    ("json-dup-dirs", L_JSON, L_JSON_NEW),
    ("dup-prepass", L_LOOP, L_LOOP_NEW),
]

SELFTESTS = [
    ('var SERVER_VERSION = "2.0.3";', [("SERVER_", "2.0.3")], "SERVER_VERSION must be captured"),
    ('const VERSION = "1.2.3";', [("", "1.2.3")], "plain VERSION must still be captured"),
    ('var PROTOCOL_VERSION = "2024-11-05";', [], "PROTOCOL_VERSION must NOT be captured"),
    ('var QNFO_VERSION = "fabric-1";', [("QNFO_", "fabric-1")], "QNFO_VERSION must still be captured"),
]


def fail(msg):
    print("FAIL: " + msg, file=sys.stderr)
    return 2


def main():
    if not TARGET.is_file():
        return fail("target not found: %s" % TARGET)

    src = TARGET.read_text(encoding="utf-8")

    if MARK in src and DUP_MARK in src:
        print("ALREADY-APPLIED: %s present, nothing written" % MARK)
        return 0

    # fail-closed anchor check
    for name, anchor, _ in EDITS:
        n = src.count(anchor)
        if n != 1:
            return fail("anchor '%s' occurs %d times (expected exactly 1)" % (name, n))

    new = src
    for name, anchor, repl in EDITS:
        new = new.replace(anchor, repl, 1)

    # regex self-test on the patched CONST line
    m = re.search(r'^CONST = re\.compile\(.*\)$', new, re.M)
    if not m:
        return fail("patched CONST line not found")
    ns = {}
    try:
        exec(m.group(0), ns)
    except Exception as exc:  # noqa: BLE001
        return fail("patched CONST does not execute: %s" % exc)
    rx = ns["CONST"]
    for sample, expect, why in SELFTESTS:
        got = rx.findall(sample)
        if got != expect:
            return fail("self-test %r -> %r (expected %r): %s" % (sample, got, expect, why))
    print("SELFTEST-OK: 4/4 regex cases")

    # compile gate on a temp copy before writing
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as fh:
        fh.write(new)
        tmp = fh.name
    try:
        py_compile.compile(tmp, doraise=True)
    except py_compile.PyCompileError as exc:
        return fail("patched file does not compile: %s" % exc)
    print("PY_COMPILE-OK")

    TARGET.write_text(new, encoding="utf-8")
    print("APPLIED %s + %s -> %s (%d -> %d bytes)"
          % (MARK, DUP_MARK, TARGET, len(src), len(new)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
