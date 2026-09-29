#!/usr/bin/env python3
"""patch-version-precedence-2.py - fix issue #1388 (VERSION-PRECEDENCE-2-MULTI-DECLARATION-1).

DEFECT
  scripts/deploy-drift-guard.py::_repo_version() returned the FIRST plain `const VERSION`
  match in file order. An artifact that composes two modules into one file therefore
  reports the FIRST module's constant, producing a permanent false DRIFT on that worker.

  Measured case (fleet-exec, one of only TWO entries in deploy-targets.txt):
    line   7  const VERSION = "fleet-executor/0.3.2";   <- INSIDE the `execMod` IIFE
    line 186  const VERSION = "1.0.2";                  <- module scope
    line 265  if (url.pathname === "/health") return json({ ok: true, version: VERSION });
  The module-scope /health handler at line 265 is the one the fetch export serves, and it
  resolves to the module-scope binding. Live /health serves 1.0.2. The guard reported
  repo=fleet-executor/0.3.2 vs live=1.0.2 -> permanent DRIFT row on the 2026-09-29
  16:05:10Z run (DRIFT=2, one of which was this false positive).

WHY "LAST WINS" IS EVIDENCE-BACKED, NOT A GUESS
  Read from the artifact's own scope structure, not from /health: the serving handler is
  the MODULE-SCOPE /health (line 265) and the module-scope binding is the LAST declaration
  (line 186). Line 7's binding lives inside the `execMod` IIFE, whose own /health (line 129)
  is not what the worker exports. This also REFUTES the reverse reading recorded in the
  issue (that the guard is right and live /health is stale): a stale /health would have to
  be produced by the IIFE scope, which is not the exported handler.

SAFETY (the part that matters)
  "Last wins" is a fact about THIS artifact shape, not a general law. So the fix does two
  things together:
    1. resolves the version by last-wins (removes the false DRIFT);
    2. EXCLUDES any multi-declaration artifact from --ahead, so an ambiguous version is
       NEVER auto-deployed. .github/workflows/fleet-autodeploy.yml applies exactly the
       --ahead list, so this is the load-bearing guard on the deploy path.
  The worker still lands in `drift`/`sync` as before and gains an ADDITIVE
  `multi_version_declarations` JSON field. A new top-level class was deliberately avoided:
  an unrecognised class risks the consumer's stale-row purge silently dropping the worker,
  which is the defect class this repo keeps re-filing.

FAIL-CLOSED / IDEMPOTENT
  Every anchor must match exactly once. Any miss -> exit 3 and NOTHING is written.
  Re-running after success is a no-op (marker present -> exit 0), so the apply workflow
  cannot flap red merely because a previous run already landed the fix.

ADVERSARIAL
  (a) last-wins is a heuristic for an ambiguous artifact: an artifact whose SERVING
      constant is declared before a later non-serving one would now resolve wrongly. That
      is why the ambiguous case is reported and barred from --ahead rather than trusted.
  (b) the post-checks are string assertions; a behaviour-preserving rewrite that keeps
      `for prefix, val in hits:` would fail spuriously (loudly, not silently).
  (c) this applier's anchors are taken from the guard as of VERSION-QUOTE-1 (issue #1389).
      If a later writer rewrites _repo_version, the anchors miss and the job goes red
      (ANCHOR-INVALIDATION-RED-JOB-1, issue #1383) rather than mis-patching.
"""
import importlib.util
import os
import py_compile
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
MARKER = "VERSION-PRECEDENCE-2"
ISSUE = "#1388"

E1 = "repo == live"
R1 = """repo == live
  MULTI_VERSION_DECLARATION  the artifact declares MORE THAN ONE plain `VERSION`
                   constant, so the guard cannot prove which binding the serving scope
                   resolves (VERSION-PRECEDENCE-2, issue #1388). It is REPORTED and it is
                   NEVER auto-deployed (excluded from --ahead). The worker still appears in
                   its normal class (DRIFT/SYNC) so no consumer silently loses the row."""

E2 = """    not_deployed, sync_workers, live_err, no_health = [], [], [], []
    not_a_worker = []"""
R2 = """    not_deployed, sync_workers, live_err, no_health = [], [], [], []
    not_a_worker = []
    # VERSION-PRECEDENCE-2 (issue #1388): artifacts declaring >1 plain VERSION constant.
    multi_ver = []"""

E3 = """    hits = CONST.findall(text)
    if hits:
        for prefix, val in hits:
            if not prefix:
                return val
        return hits[0][1]"""
R3 = """    hits = CONST.findall(text)
    if hits:
        plain = [val for prefix, val in hits if not prefix]
        if plain:
            # VERSION-PRECEDENCE-2 (2026-09-29, issue #1388): the LAST plain declaration
            # wins. Measured on fleet-exec: line 7 `const VERSION = "fleet-executor/0.3.2"`
            # sits INSIDE the `execMod` IIFE closure while line 186 `const VERSION = "1.0.2"`
            # is module scope, and the module-scope /health handler (line 265) is the one
            # the worker serves. Live /health = 1.0.2 agrees, so last-wins resolves THAT
            # artifact correctly. It is a fact about that artifact shape, not a general law:
            # >1 plain VERSION is ambiguous, is reported as MULTI_VERSION_DECLARATION, and
            # is excluded from --ahead so it is never auto-deployed.
            # VERSION-PRECEDENCE-1 (plain beats QNFO_VERSION) is preserved below.
            return plain[-1]
        return hits[0][1]"""

E4 = "def repo_artifact(d):"
R4 = '''def _plain_versions(text):
    """VERSION-PRECEDENCE-2 (issue #1388): every plain `VERSION` declaration, in file order.

    len() > 1 means the artifact is ambiguous: this regex cannot tell which binding the
    serving scope resolves. Used both to resolve by last-wins and to exclude the worker
    from --ahead, so an ambiguous version is never auto-deployed.
    """
    return [val for prefix, val in CONST.findall(text) if not prefix]


def repo_artifact(d):'''

E5 = """        elif lv != rv:
            drift.append((d, worker, rv, lv))
            if cmp_ver(rv, lv) == 1:
                ahead.append((d, worker, rv, lv, rpath))"""
R5 = """        elif lv != rv:
            drift.append((d, worker, rv, lv))
            # VERSION-PRECEDENCE-2 (issue #1388): a multi-declaration artifact is reported
            # and NEVER auto-deployed -- the deploy path must not act on a version the
            # guard could not establish unambiguously. It stays in `drift` (and in the
            # JSON) so no consumer silently loses the row.
            if rtext is not None and len(_plain_versions(rtext)) > 1:
                multi_ver.append((d, worker, rv, lv))
            elif cmp_ver(rv, lv) == 1:
                ahead.append((d, worker, rv, lv, rpath))"""

E6 = '            "name_resolution": True,'
R6 = '''            "multi_version_declarations": [
                {"worker": w, "dir": d, "repo": r, "live": l} for d, w, r, l in multi_ver],
            "multi_version_declaration_count": len(multi_ver),
            "name_resolution": True,'''

E7 = '''        for d, w, rv_, lv_, p in ahead:
            print(f"AHEAD {w} (dir {d}): repo={rv_} live={lv_} artifact={p}")'''
R7 = '''        for d, w, rv_, lv_, p in ahead:
            print(f"AHEAD {w} (dir {d}): repo={rv_} live={lv_} artifact={p}")
        for d, w, rv_, lv_ in multi_ver:
            print(f"MULTI_VERSION_DECLARATION {w} (dir {d}): repo={rv_} live={lv_} "
                  f"ambiguous artifact; excluded from --ahead")'''

E8 = '              f"not_a_worker={len(not_a_worker)} "'
R8 = '''              f"not_a_worker={len(not_a_worker)} "
              f"multi_version={len(multi_ver)} "'''

EDITS = [
    ("docstring-classes", E1, R1),
    ("main-init", E2, R2),
    ("repo-version-plain", E3, R3),
    ("plain-versions-helper", E4, R4),
    ("ahead-exclusion", E5, R5),
    ("json-field", E6, R6),
    ("human-print", E7, R7),
    ("summary-line", E8, R8),
]


def behavioural_verify(path):
    spec = importlib.util.spec_from_file_location("ddg_patched", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    checks = []
    two = 'const VERSION = "first";\nconst VERSION = "second";\n'
    checks.append(("two-plain-last-wins", mod._repo_version(two) == "second"))
    checks.append(("two-plain-list", mod._plain_versions(two) == ["first", "second"]))
    one = 'const VERSION = "only";\n'
    checks.append(("one-plain-unchanged", mod._repo_version(one) == "only"))
    checks.append(("one-plain-list", mod._plain_versions(one) == ["only"]))
    qnfo = 'const QNFO_VERSION = "tag";\nconst VERSION = "served";\n'
    checks.append(("precedence-1-preserved", mod._repo_version(qnfo) == "served"))
    qnfo_only = 'const QNFO_VERSION = "tag-only";\n'
    checks.append(("qnfo-only-fallback", mod._repo_version(qnfo_only) == "tag-only"))
    # The artifact that caused the defect, if this checkout carries it.
    for rel in ("fleet-exec/deployed-current.worker.js", "fleet-exec/worker.js"):
        p = os.path.join(ROOT, rel)
        if os.path.isfile(p):
            with open(p, encoding="utf-8", errors="replace") as fh:
                txt = fh.read()
            got = mod._repo_version(txt)
            checks.append((rel + " resolves 1.0.2", got == "1.0.2"))
            checks.append((rel + " is flagged ambiguous",
                           len(mod._plain_versions(txt)) == 2))
            break
    return checks


def main():
    if not os.path.isfile(TARGET):
        print("FATAL: missing target " + TARGET)
        return 3
    with open(TARGET, encoding="utf-8") as fh:
        src = fh.read()
    if MARKER in src:
        print("ALREADY APPLIED: " + MARKER + " present; idempotent no-op")
        return 0
    out = src
    for name, anchor, repl in EDITS:
        n = out.count(anchor)
        if n != 1:
            print("ANCHOR-MISS [%s] %s: count=%d (expected 1) - refusing to write"
                  % (name, ISSUE, n))
            return 3
        out = out.replace(anchor, repl, 1)
    # Post-conditions: the defect is gone and the fix is present.
    if "for prefix, val in hits:" in out:
        print("POST-CHECK FAILED: legacy first-match loop still present")
        return 3
    if out.count(MARKER) < 5:
        print("POST-CHECK FAILED: marker count=%d" % out.count(MARKER))
        return 3
    if out.count("_plain_versions") < 3:
        print("POST-CHECK FAILED: _plain_versions count=%d" % out.count("_plain_versions"))
        return 3
    tmp = TARGET + ".new"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(out)
    try:
        py_compile.compile(tmp, doraise=True)
    except py_compile.PyCompileError as e:
        print("POST-CHECK FAILED: patched guard does not compile: %s" % e)
        os.remove(tmp)
        return 3
    os.replace(tmp, TARGET)
    print("APPLIED %s: %d edits, %d bytes" % (MARKER, len(EDITS), len(out)))
    bad = []
    for name, ok in behavioural_verify(TARGET):
        print("  verify %-40s %s" % (name, "OK" if ok else "FAIL"))
        if not ok:
            bad.append(name)
    if bad:
        print("BEHAVIOURAL VERIFY FAILED: %s" % ", ".join(bad))
        return 3
    print("BEHAVIOURAL VERIFY OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
