#!/usr/bin/env python3
"""VERSION-PRECEDENCE-2-MULTI-DECLARATION-1 applier - issue #1388.

WHY THIS EXISTS
  scripts/deploy-drift-guard.py resolves the repo-side version with _repo_version(),
  which returned the FIRST `const VERSION` it found. A concatenated worker artifact can
  declare that constant TWICE in different scopes.

MEASURED (2026-09-29, in-container against main)
  fleet-exec/deployed-current.worker.js
    line   7: const VERSION = "fleet-executor/0.3.2";   <- wrapped exec module
    line 186: const VERSION = "1.0.2";                  <- the value /health serves
  live https://fleet-exec.q08.workers.dev/health -> {"ok":true,"version":"1.0.2"}
  the guard reported repo=fleet-executor/0.3.2 vs live=1.0.2, so worker_live_audit
  carried a PERMANENT false DRIFT row on a canonical deploy target. It also corrupted
  the numeric --ahead comparison (cmp_ver returns None for "fleet-executor/0.3.2").

FIX (two surgical edits, both fail-closed)
  1. _repo_version: the LAST plain VERSION wins -- in a concatenated artifact the later
     binding is the effective one. QNFO_VERSION stays the fallback (VERSION-PRECEDENCE-1
     is preserved: a plain VERSION still beats QNFO_VERSION).
  2. repo_artifact: stop returning None after the first canonical artifact. The second
     candidate is consulted before NO_REPO_VERSION is declared.

Contract: idempotent (marker present -> exit 0 no-op); fail-closed (missing or ambiguous
anchor -> exit 4, never a silent skip). Exit 0 applied-or-already-applied, 4 anchor,
5 verification failed.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
MARK = "VERSION-PRECEDENCE-2-MULTI-DECLARATION-1"

A1_OLD = (
    "    hits = CONST.findall(text)\n"
    "    if hits:\n"
    "        for prefix, val in hits:\n"
    "            if not prefix:\n"
    "                return val\n"
    "        return hits[0][1]\n"
)
A1_NEW = (
    "    hits = CONST.findall(text)\n"
    "    if hits:\n"
    "        # VERSION-PRECEDENCE-2-MULTI-DECLARATION-1 (2026-09-29, issue #1388): a\n"
    "        # concatenated bundle can declare the SAME constant twice in different scopes\n"
    "        # (fleet-exec: line 7 \"fleet-executor/0.3.2\" inside the wrapped exec module,\n"
    "        # line 186 \"1.0.2\" = the value /health actually serves). Returning the FIRST\n"
    "        # match produced a permanent false DRIFT on a canonical deploy target. In a\n"
    "        # concatenated artifact the LATER binding is the effective one, so the LAST\n"
    "        # plain VERSION wins; QNFO_VERSION remains the fallback.\n"
    "        plain = [val for prefix, val in hits if not prefix]\n"
    "        if plain:\n"
    "            return plain[-1]\n"
    "        return hits[-1][1]\n"
)
A2_OLD = (
    '    """Return (version, path, text) for the canonical repo artifact, or (None, None, None)."""\n'
    "    for fn in CANON:\n"
)
A2_NEW = (
    '    """Return (version, path, text) for the canonical repo artifact, or (None, None, None)."""\n'
    "    first = None\n"
    "    for fn in CANON:\n"
)
A3_OLD = (
    "            v = _repo_version(text)\n"
    "            if v:\n"
    "                return v, p, text\n"
    "            return None, p, text\n"
    "    return None, None, None\n"
)
A3_NEW = (
    "            v = _repo_version(text)\n"
    "            if v:\n"
    "                return v, p, text\n"
    "            # VERSION-PRECEDENCE-2: do NOT give up on the first candidate. Returning\n"
    "            # None here reported NO_REPO_VERSION without ever consulting the second\n"
    "            # canonical artifact -- a false source-gap whenever only the mirror lacks\n"
    "            # the constant.\n"
    "            if first is None:\n"
    "                first = (None, p, text)\n"
    "    return first if first is not None else (None, None, None)\n"
)

EDITS = [("A1 _repo_version selection", A1_OLD, A1_NEW),
         ("A2 repo_artifact loop head", A2_OLD, A2_NEW),
         ("A3 repo_artifact early return", A3_OLD, A3_NEW)]


def load_guard():
    """Import the guard without letting a module-level main() abort the applier."""
    import importlib.util
    saved = sys.argv
    sys.argv = ["deploy-drift-guard.py", "__no_such_worker__"]
    try:
        spec = importlib.util.spec_from_file_location("ddg_guard_vp2", TARGET)
        mod = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(mod)
        except SystemExit:
            pass
        return mod
    finally:
        sys.argv = saved


def verify():
    """Behavioural verification. Returns a list of failure strings ([] == pass)."""
    import py_compile
    fails = []
    try:
        py_compile.compile(TARGET, doraise=True)
    except Exception as exc:
        return ["py_compile failed: %r" % (exc,)]
    try:
        mod = load_guard()
    except Exception as exc:
        return ["guard import failed: %r" % (exc,)]
    if MARK not in open(TARGET, encoding="utf-8", errors="replace").read():
        fails.append("marker %s absent after apply" % MARK)
    rv = getattr(mod, "_repo_version", None)
    if rv is None:
        return fails + ["_repo_version missing from guard"]
    cases = [
        ("two plain declarations -> LAST wins",
         'const VERSION = "fleet-executor/0.3.2";\nconst VERSION = "1.0.2";\n', "1.0.2"),
        ("single declaration unchanged",
         'const VERSION = "2.0.0";\n', "2.0.0"),
        ("plain VERSION still beats QNFO_VERSION",
         'const QNFO_VERSION = "qnfo-archive/fabric-20260910";\nconst VERSION = "1.2.0";\n', "1.2.0"),
        ("single-quoted VERSION (VERSION-QUOTE-1 preserved)",
         "const VERSION='1.0.6-cronconsolidate';\n", "1.0.6-cronconsolidate"),
        ("SERVER_VERSION fallback (VERSION-QUOTE-1 preserved)",
         'var SERVER_VERSION = "2.0.3";\n', "2.0.3"),
        ("PROTOCOL_VERSION alone is still not a version",
         'const PROTOCOL_VERSION = "9";\n', None),
        ("QNFO_VERSION-only artifact stays visible",
         'const QNFO_VERSION = "qnfo-archive/fabric-20260910";\n', "qnfo-archive/fabric-20260910"),
    ]
    for label, text, want in cases:
        got = rv(text)
        if got != want:
            fails.append("%s: got %r want %r" % (label, got, want))
    ra = getattr(mod, "repo_artifact", None)
    if ra is not None:
        v, path, _ = ra("fleet-exec")
        if v != "1.0.2":
            fails.append("repo_artifact('fleet-exec') -> %r (want '1.0.2', issue #1388)" % (v,))
        if path is None:
            fails.append("repo_artifact('fleet-exec') found no artifact")
    else:
        fails.append("repo_artifact missing from guard")
    return fails


def main():
    verify_only = "--verify-only" in sys.argv
    if not os.path.isfile(TARGET):
        print("APPLY-FAIL: target not found: %s" % TARGET)
        return 4
    text = open(TARGET, encoding="utf-8", errors="replace").read()
    already = MARK in text
    if verify_only:
        fails = verify()
        if fails:
            for f in fails:
                print("VERIFY-FAIL: " + f)
            return 5
        print("VERIFY-OK: %s present and behaviour correct" % MARK)
        return 0
    if already:
        print("ALREADY-APPLIED: %s present, no edit made" % MARK)
        fails = verify()
        for f in fails:
            print("VERIFY-FAIL: " + f)
        return 0 if not fails else 5
    new = text
    for label, old, repl in EDITS:
        n = new.count(old)
        if n != 1:
            print("APPLY-FAIL: anchor %s matched %d times (need exactly 1) -- refusing to "
                  "edit a file this applier does not understand" % (label, n))
            return 4
        new = new.replace(old, repl, 1)
    open(TARGET, "w", encoding="utf-8").write(new)
    print("APPLIED: %s" % MARK)
    fails = verify()
    if fails:
        for f in fails:
            print("VERIFY-FAIL: " + f)
        return 5
    print("VERIFY-OK: %s applied and behaviour verified" % MARK)
    return 0


if __name__ == "__main__":
    sys.exit(main())
