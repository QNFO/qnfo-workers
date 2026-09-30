#!/usr/bin/env python3
"""version-bump-guard.py - VERSION-BUMP-GUARD-1 (2026-09-29, issue 1371).

WHY THIS EXISTS
  Three independent mechanisms decide whether a worker fix reaches live:
    * scripts/fleet-autoaudit.py --apply  -> redeploys only workers STRICTLY AHEAD by
      NUMERIC version comparison;
    * .github/workflows/deploy-drift.yml  -> compares VERSION strings;
    * scripts/mirror-guard.py             -> compares source vs its deployed mirror.
  A worker fix committed WITHOUT bumping the `var VERSION = "..."` constant is invisible to
  ALL THREE. Repo and live report the SAME version, so nothing is "ahead", nothing is
  "drifted", and the fix never reaches live - while every check stays green. That is a silent
  never-deploys class, and it is not hypothetical:

    LIVE INSTANCE OF THE CLASS (verified 2026-09-29)
      qnfo-backlog-exec HEALTH-PROBE-BUDGET-1 (#1368) - repo qnfo-backlog-exec/worker.js is
      33,159 bytes, the live script is 33,161 bytes, and BOTH report
      VERSION 2.0.0-full-register-inventory. Version comparison sees parity; the auto-deployer
      sees "not strictly ahead"; so the committed fix is structurally undeployable.

    SECOND LIVE INSTANCE (verified 2026-09-29)
      worker_live_audit (the fleet self-audit table) still records qnfo-ops as
      2.37.14-callglm-reasoning while live is 2.37.20-selfheal-analyzer-live - a six-version
      lag - because the audit writer had no scheduled writer and the ledger/audit comparisons
      built on it returned false verdicts.

WHAT IT DOES
  For every worker entry bundle that CHANGED between two refs, extract the VERSION constant on
  both sides. If the bundle bytes changed but VERSION did not, exit 1 and name the worker.

  Formatting-only changes are reported too, deliberately: the deployer cannot distinguish a
  whitespace edit from a real fix either, so neither can this guard.

USAGE
  python3 scripts/version-bump-guard.py <base_ref> <head_ref>
  python3 scripts/version-bump-guard.py                 # falls back to HEAD~1..HEAD

EXIT
  0  nothing to check, or every changed bundle bumped VERSION
  1  at least one changed bundle kept its VERSION   (the defect)
  3  cannot evaluate (bad ref, git unavailable, unreadable blob) - fail-closed, never green

ADVERSARIAL
  This guard proves only that a VERSION STRING changed alongside the bytes. It cannot prove the
  change is correct, that the version was bumped in the right direction, or that the worker
  deploys. A worker can be bumped and still never reach live; that is deploy-drift.yml's job.
"""
import re
import subprocess
import sys

VERSION_RE = re.compile(r'var\s+VERSION\s*=\s*"([^"]*)"')
ENTRY_RE = re.compile(r'^(?P<dir>[^/]+)/worker\.js$')
# Files that are copies/mirrors, not deploy sources.
SKIP_SUFFIXES = ("deployed-current.worker.js",)


def git(*args):
    """Run git, return (ok, stdout). Never raises."""
    try:
        p = subprocess.run(
            ["git"] + list(args),
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception as exc:  # noqa: BLE001 - any failure is fail-closed
        return False, "git invocation failed: %s" % exc
    if p.returncode != 0:
        return False, (p.stderr or "").strip()
    return True, p.stdout


def rev_exists(ref):
    ok, _ = git("rev-parse", "--verify", "--quiet", ref + "^{commit}")
    return ok


def blob(ref, path):
    ok, out = git("show", "%s:%s" % (ref, path))
    return (ok, out)


def version_of(text):
    m = VERSION_RE.search(text)
    return m.group(1) if m else None


def main(argv):
    base = argv[1] if len(argv) > 1 else None
    head = argv[2] if len(argv) > 2 else None

    if base in (None, "", "0000000000000000000000000000000000000000"):
        base = "HEAD~1"
    if not head:
        head = "HEAD"

    for ref in (base, head):
        if not rev_exists(ref):
            print("FAIL-CLOSED: cannot resolve ref %r (shallow clone? fetch-depth: 0 required)" % ref)
            return 3

    ok, out = git("diff", "--name-only", base, head)
    if not ok:
        print("FAIL-CLOSED: git diff %s %s failed: %s" % (base, head, out))
        return 3

    candidates = []
    for line in out.splitlines():
        path = line.strip()
        if not path or path.endswith(SKIP_SUFFIXES):
            continue
        if ENTRY_RE.match(path):
            candidates.append(path)

    if not candidates:
        print("no worker entry bundles changed between %s and %s - nothing to check" % (base, head))
        return 0

    violations = []
    bumped = []
    checked = 0

    for path in sorted(candidates):
        ok_old, old = blob(base, path)
        if not ok_old:
            # Added in this range: no previous VERSION to compare against.
            old = ""
        ok_new, new = blob(head, path)
        if not ok_new:
            print("FAIL-CLOSED: cannot read %s at %s: %s" % (path, head, new))
            return 3

        if old == new:
            continue  # bytes unchanged (e.g. rename-only diff) - not this guard's business

        checked += 1
        v_old, v_new = version_of(old), version_of(new)

        if v_new is None:
            violations.append((path, v_old, "NO VERSION CONSTANT in the new bundle"))
            continue
        if v_old == v_new:
            violations.append((path, v_old, "unchanged VERSION after a byte change"))
            continue
        bumped.append((path, v_old, v_new))

    for path, v_old, v_new in bumped:
        print("OK    %s  %s -> %s" % (path, v_old, v_new))

    if not violations:
        print("PASS: %d changed worker bundle(s) checked, all bumped VERSION" % checked)
        return 0

    print("")
    print("VERSION-BUMP-GUARD-1 VIOLATION (%d of %d changed bundle(s)):" % (len(violations), checked))
    for path, v_old, why in violations:
        print("  %s  [VERSION=%s]  %s" % (path, v_old, why))
    print("")
    print("Why this blocks: fleet-autoaudit.py --apply only redeploys a worker that is STRICTLY")
    print("AHEAD by numeric version comparison, and deploy-drift.yml compares VERSION strings. A")
    print("bundle that changes without a VERSION bump is therefore invisible to every drift check")
    print("and is never auto-deployed - the fix stays on main forever (see issue 1371).")
    print("")
    print("FIX: bump `var VERSION = \"...\"` in the changed bundle(s) in this same commit.")
    print("If the change is genuinely cosmetic, bump anyway - the deployer cannot tell the")
    print("difference, and neither can a future reader of the ledger.")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
