#!/usr/bin/env python3
"""VERSION-ANCHOR-DRIFT-1 applier (2026-09-29).

WHY THIS EXISTS
---------------
scripts/apply-pending-patches.py runs every scripts/*patch*.py inside a
transactional envelope and classifies a fail-closed exit as `stale-anchor`.

Measured on 2026-09-29:

  * 8 patch scripts anchor on an EXACT `var VERSION = "2.37.N-slug";` literal
    (analyzer-exclusion-table, applier-doctor-outcome-aware,
    attachguard-xml-form, cf-worker-read-404-hint, d1guard-literal-aware,
    github409-retry, github409-variant-reread, samezone-fetch-fallback).
  * Fleet agents bump qnfo-ops VERSION several times an hour, so every one of
    those anchors is orphaned within minutes of being written.
  * The runner still returned 0 (`LANDED(0): nothing to apply - main is
    current`), so the CI job went GREEN while the patch silently never landed.

Reproduced live before writing this:
    $ python3 scripts/samezone-fetch-fallback-patch.py
    FAIL (fail-closed): anchor occurrence != 1 in qnfo-ops/worker.js
      count=0  var VERSION = "2.37.24-404hint-list";
    (qnfo-ops/worker.js line 32 is 2.37.25-github-read-404-hint)

Consequence: the SAME-ZONE-FETCH-FALLBACK-1 fix for web_fetch HTTP 522 on fleet
custom domains stayed orphaned while CI reported success.

THE FIX
-------
Two changes to scripts/apply-pending-patches.py:

  1. normalize_version_anchors() -- before a patcher runs, a normalized COPY is
     written beside it and executed instead. Exact VERSION literals are rewritten
     to the version currently in the tree (stale anchors) and, for an explicit
     NEW target, to one patch level past the tree version carrying the script's
     own slug. The original script file is never mutated. The copy is named
     `.<name>.norm.py` and hidden from `git status` via .git/info/exclude so it
     cannot be mistaken for a patch's own write. It lives in scripts/ so that
     `Path(__file__).parent.parent` root resolution keeps working for the many
     patchers that use it.
  2. The runner exits 4 when any script is still `stale-anchor` after
     normalization, instead of returning 0. A green CI run can no longer mean
     "every pending patch silently failed".

FAIL-CLOSED / IDEMPOTENT
------------------------
- Marker `normalize_version_anchors` present -> exit 0, no write.
- Any anchor whose occurrence count != 1 -> exit 1, no write.
- compile() parse-check plus post-write assertions before the write.
"""
import os
import sys
from pathlib import Path

MARKER = "normalize_version_anchors"
TARGETS = ("scripts/apply-pending-patches.py",)

ANCHOR_CLASSIFY = '''    if "already applied" in low and "patched" not in low:
        return "already-applied"
    return "ran"
'''

NEW_FUNCS = ANCHOR_CLASSIFY + '''

VERSION_LITERAL_RE = re.compile(r'var VERSION = "(2\\.\\d+\\.\\d+)(-[^"]*)?";')


def _tree_versions(root: Path, mm: str) -> dict:
    """Every `var VERSION = "<mm>.N-slug";` value in the tree, with a hit count."""
    found: dict = {}
    for cand in root.rglob("worker.js"):
        if ".git" in cand.parts:
            continue
        try:
            txt = cand.read_text(errors="ignore")
        except Exception:  # noqa: BLE001
            continue
        for m in re.finditer(r'var VERSION = "(' + re.escape(mm) + r'\\.[^"]+)"', txt):
            found[m.group(1)] = found.get(m.group(1), 0) + 1
    return found


def _bump(version: str) -> str:
    """2.37.25-slug -> 2.37.26-slug (numeric patch level only)."""
    m = re.match(r"(\\d+\\.\\d+\\.)(\\d+)(.*)$", version)
    if not m:
        return version
    return m.group(1) + str(int(m.group(2)) + 1) + m.group(3)


def normalize_version_anchors(root: Path, text: str):
    """VERSION-ANCHOR-DRIFT-1: return (rewritten_text, changes).

    Rules, in order:
      * a literal that IS a version present in the tree is the patcher's OLD
        anchor -> map to the tree's current (highest) version;
      * a literal that is NOT in the tree is a NEW target the patcher intends to
        write -> keep its own slug, bump to one past the current version.
    Both rules are no-ops when the tree already sits at the literal, so this is
    safe to run repeatedly.
    """
    changes = []
    cache = {}

    def repl(m):
        num, slug = m.group(1), (m.group(2) or "")
        mm = ".".join(num.split(".")[:2])
        if mm not in cache:
            cache[mm] = _tree_versions(root, mm)
        tree = cache[mm]
        if not tree:
            return m.group(0)
        live = sorted(
            tree, key=lambda v: [int(x) for x in re.findall(r"\\d+", v.split("-")[0])]
        )[-1]
        literal = num + slug
        new = live if literal in tree else _bump(live)
        if new == literal:
            return m.group(0)
        changes.append(literal + " -> " + new)
        return 'var VERSION = "' + new + '";'

    return VERSION_LITERAL_RE.sub(repl, text), changes
'''

ANCHOR_RUN = '''            proc = subprocess.run(
                [sys.executable, str(path.relative_to(root))],
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=timeout,
                env={**os.environ, "REPO_ROOT": str(root)},
            )'''

NEW_RUN = '''            run_path = path
            norm = []
            try:
                fixed, norm = normalize_version_anchors(
                    root, path.read_text(errors="ignore")
                )
                if norm:
                    run_path = scripts_dir / ("." + path.name + ".norm.py")
                    run_path.write_text(fixed)
                    print(
                        f"  {path.name:<52} VERSION-ANCHOR-DRIFT-1 normalized: "
                        + ", ".join(norm)
                    )
            except Exception as exc:  # noqa: BLE001
                print(f"  {path.name:<52} normalize-skip ({exc})")
            proc = subprocess.run(
                [sys.executable, str(run_path.relative_to(root))],
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=timeout,
                env={**os.environ, "REPO_ROOT": str(root)},
            )'''

ANCHOR_SNAP = '''        after = snapshot(root)
        changed = before != after'''

NEW_SNAP = '''        if run_path != path:
            try:
                run_path.unlink()
            except Exception:  # noqa: BLE001
                pass
        after = snapshot(root)
        changed = before != after'''

ANCHOR_EXCLUDE = '''    timeout = int(os.environ.get("APPLIER_DOCTOR_TIMEOUT", "60") or "60")'''

NEW_EXCLUDE = '''    # VERSION-ANCHOR-DRIFT-1: normalized copies are written into scripts/ so
    # __file__-based root resolution keeps working, and hidden from git status.
    try:
        exc_path = root / ".git" / "info" / "exclude"
        if exc_path.parent.is_dir():
            cur = exc_path.read_text() if exc_path.exists() else ""
            if "*.norm.py" not in cur:
                exc_path.write_text(cur + "\\n*.norm.py\\n")
    except Exception:  # noqa: BLE001
        pass

    timeout = int(os.environ.get("APPLIER_DOCTOR_TIMEOUT", "60") or "60")'''

ANCHOR_RET = '''    print(f"wrote ci-status/applier-doctor.json")
    return 0'''

NEW_RET = '''    print(f"wrote ci-status/applier-doctor.json")
    stale = summary.get("stale-anchor", 0)
    if stale:
        print(
            "VERSION-ANCHOR-DRIFT-1: "
            + str(stale)
            + " script(s) still fail-closed after version normalization "
            + "- see ci-status/applier-doctor.json"
        )
        return 4
    return 0'''


def main() -> int:
    root = Path(os.environ.get("REPO_ROOT") or ".").resolve()
    for rel in TARGETS:
        p = root / rel
        if not p.exists():
            print(f"FAIL: missing {rel}")
            return 1
        text = p.read_text()
        if MARKER in text:
            print(f"already applied: {rel} carries {MARKER}")
            return 0

        for name, old, new in (
            ("classify tail", ANCHOR_CLASSIFY, NEW_FUNCS),
            ("subprocess run block", ANCHOR_RUN, NEW_RUN),
            ("snapshot after run", ANCHOR_SNAP, NEW_SNAP),
            ("exclude hook", ANCHOR_EXCLUDE, NEW_EXCLUDE),
            ("exit code", ANCHOR_RET, NEW_RET),
        ):
            count = text.count(old)
            if count != 1:
                print(f"FAIL (fail-closed): anchor '{name}' occurrence != 1 in {rel}")
                print(f"  count={count}  {old.splitlines()[0][:70]}")
                return 1
            text = text.replace(old, new, 1)

        for probe in (
            "def normalize_version_anchors",
            "def _tree_versions",
            "def _bump",
            "*.norm.py",
            "return 4",
        ):
            if probe not in text:
                print(f"FAIL (post-write): {rel} missing {probe!r}")
                return 1

        try:
            compile(text, rel, "exec")
        except SyntaxError as exc:
            print(f"FAIL (post-write): {rel} does not compile: {exc}")
            return 1

        p.write_text(text)
        print(f"OK patched {rel} ({len(text)} bytes)")

    print(f"VERSION-ANCHOR-DRIFT-1 applied to {len(TARGETS)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
