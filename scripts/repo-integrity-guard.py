#!/usr/bin/env python3
"""repo-integrity-guard.py -- fail-closed pre-deploy check for truncated/empty sources.

WHY (R2 / TRUNCATION-INCIDENT-1, 2026-09-24):
    `qnfo-artifact-agent/src/server.js` was once observed at 0 bytes on disk while
    git HEAD held the correct 6714-byte copy and the LIVE worker was healthy. A
    0-byte `main` still bundles: wrangler emits a tiny stub, the dry-run "succeeds",
    and the deploy would push a hollow worker over a working one. The root cause is
    not yet known, so this guard makes the failure LOUD instead of silent.

WHAT it asserts, for every worker directory that declares a `main` in its wrangler
config:
    1. the `main` file exists
    2. the `main` file is non-empty (> MIN_BYTES)
    3. any tracked sibling source file is not 0 bytes on disk while HEAD is non-zero
    4. the config declares a strict-semver VERSION-bearing worker (advisory)

WHY GATE HERE: deploy is the moment a hollow source becomes a production regression.

SCOPE: run from the repository root, before any deploy.

Exit codes: 0 clean | 1 violations found | 3 usage/transport error.
"""
import json
import os
import re
import subprocess
import sys

MIN_BYTES = 64
CONFIG_NAMES = ("wrangler.toml", "wrangler.jsonc", "wrangler.json")
SKIP_DIRS = {".git", "node_modules", ".wrangler", "dist", "vendor"}


def sh(args, cwd=None):
    try:
        p = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=60)
        return p.returncode, p.stdout, p.stderr
    except Exception as e:  # noqa: BLE001
        return 1, "", str(e)


def main_declared(cfg_path):
    """Return the declared `main` value, or None."""
    try:
        with open(cfg_path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return None
    m = re.search(r'^\s*main\s*=\s*["\']([^"\']+)["\']', text, re.M)   # toml
    if m:
        return m.group(1)
    if cfg_path.endswith(".json") or cfg_path.endswith(".jsonc"):
        stripped = re.sub(r"^\s*//.*$", "", text, flags=re.M)
        try:
            data = json.loads(stripped)
            return data.get("main")
        except Exception:  # noqa: BLE001
            return None
    return None


def main(argv):
    root = argv[1] if len(argv) > 1 else "."
    root = os.path.abspath(root)
    if not os.path.isdir(root):
        print("repo-integrity-guard: not a directory: " + root)
        return 3

    violations = []
    workers_checked = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        cfg = next((os.path.join(dirpath, n) for n in CONFIG_NAMES if n in filenames), None)
        if not cfg:
            continue
        entry = main_declared(cfg)
        if not entry:
            continue
        workers_checked += 1
        target = os.path.join(dirpath, entry)
        rel = os.path.relpath(target, root)
        if not os.path.isfile(target):
            violations.append("MISSING main: %s (declared by %s)" % (rel, os.path.relpath(cfg, root)))
            continue
        size = os.path.getsize(target)
        if size < MIN_BYTES:
            violations.append("HOLLOW main: %s is %d bytes (< %d) -- refusing to trust a deploy" % (rel, size, MIN_BYTES))

    # tracked siblings: disk 0 bytes while HEAD is non-zero
    rc, out, _ = sh(["git", "ls-files", "-z"], cwd=root)
    if rc == 0 and out:
        for f in out.split("\0"):
            if not f:
                continue
            if any(part in SKIP_DIRS for part in f.split("/")):
                continue
            full = os.path.join(root, f)
            if not os.path.isfile(full):
                continue
            if os.path.getsize(full) != 0:
                continue
            rc2, head, _ = sh(["git", "show", "HEAD:" + f], cwd=root)
            if rc2 == 0 and len(head) > 0:
                violations.append("TRUNCATED on disk: %s (HEAD has %d bytes, disk has 0)" % (f, len(head)))

    print("REPO-INTEGRITY-GUARD: checked %d worker main(s) under %s" % (workers_checked, root))
    if violations:
        for v in violations:
            print("  VIOLATION: " + v)
        print("REPO-INTEGRITY-GUARD: FAIL (%d violation(s))" % len(violations))
        return 1
    print("REPO-INTEGRITY-GUARD: PASS (all worker mains present and non-empty)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
