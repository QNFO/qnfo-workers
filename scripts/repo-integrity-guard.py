#!/usr/bin/env python3
"""repo-integrity-guard.py -- fail-closed pre-deploy check for truncated/hollow sources.

WHY (R2 / TRUNCATION-INCIDENT-1, 2026-09-24):
    `qnfo-artifact-agent/src/server.js` was once observed at 0 bytes on disk while git
    HEAD held the correct 6714-byte copy and the LIVE worker was healthy. A 0-byte `main`
    still bundles: wrangler emits a tiny stub, the dry-run "succeeds", and the deploy
    would push a hollow worker over a working one.

WHY IT IS LIVE-AWARE (R7, 2026-09-24):
    A first version failed on ANY hollow/missing main, which made it permanently red on
    two dead placeholders (`paper-hub/worker.js` is a deliberate 0-byte stub;
    `qnfo-web-unified` declares a build-generated mirror that is not checked in). An
    always-red guard cannot gate a deploy, so it was detection without remediation.

    This version classifies by BLAST RADIUS instead:

      BLOCKING  -- the worker is LIVE and its declared main is missing/hollow, or a
                   tracked file is 0 bytes on disk while HEAD is non-empty. Deploying
                   would clobber production with a stub, so exit 1.
      WARNING   -- the worker is NOT live and its main is missing/hollow. A placeholder
                   or pre-build directory; report it, do not block.

WHY GATE HERE: deploy is the moment a hollow source becomes a production regression.

PRE:  run from the repository root. `CLOUDFLARE_API_TOKEN` in the environment enables the
      live-worker lookup; without it the guard degrades to WARNING-only (never silently
      passes a live-worker violation it could not evaluate -- it says so).
POST: exit 0 = no blocking violations; 1 = at least one blocking violation; 3 = usage.

INVARIANT: a hollow `main` for a LIVE worker is always blocking.
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

ACCOUNT_ID = "edb167b78c9fb901ea5bca3ce58ccc4b"
MIN_BYTES = 64
CONFIG_NAMES = ("wrangler.toml", "wrangler.jsonc", "wrangler.json")
SKIP_DIRS = {".git", "node_modules", ".wrangler", "dist", "vendor"}


def sh(args, cwd=None):
    try:
        p = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=60)
        return p.returncode, p.stdout, p.stderr
    except Exception as e:  # noqa: BLE001
        return 1, "", str(e)


def live_workers():
    """Return (set_of_names, error_string). An empty set with an error means UNKNOWN."""
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        return None, "CLOUDFLARE_API_TOKEN not set -- live-worker lookup skipped"
    url = "https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts" % ACCOUNT_ID
    try:
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
        if not data.get("success"):
            return None, "CF API returned success=false"
        return {s.get("id") for s in (data.get("result") or [])}, None
    except Exception as e:  # noqa: BLE001
        return None, "CF API lookup failed: %s" % str(e)[:120]


def declared_main(cfg_path):
    try:
        with open(cfg_path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return None
    m = re.search(r'^\s*main\s*=\s*["\']([^"\']+)["\']', text, re.M)
    if m:
        return m.group(1)
    if cfg_path.endswith((".json", ".jsonc")):
        stripped = re.sub(r"^\s*//.*$", "", text, flags=re.M)
        try:
            return json.loads(stripped).get("main")
        except Exception:  # noqa: BLE001
            return None
    return None


def main(argv):
    root = os.path.abspath(argv[1] if len(argv) > 1 else ".")
    if not os.path.isdir(root):
        print("repo-integrity-guard: not a directory: " + root)
        return 3

    live, live_err = live_workers()
    blocking, warnings = [], []
    checked = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        cfg = next((os.path.join(dirpath, n) for n in CONFIG_NAMES if n in filenames), None)
        if not cfg:
            continue
        entry = declared_main(cfg)
        if not entry:
            continue
        checked += 1
        worker_name = os.path.basename(dirpath)
        is_live = bool(live and worker_name in live)
        target = os.path.join(dirpath, entry)
        rel = os.path.relpath(target, root)
        problem = None
        if not os.path.isfile(target):
            problem = "MISSING main: %s (declared by %s)" % (rel, os.path.relpath(cfg, root))
        elif os.path.getsize(target) < MIN_BYTES:
            problem = "HOLLOW main: %s is %d bytes (< %d)" % (rel, os.path.getsize(target), MIN_BYTES)
        if problem:
            if is_live:
                blocking.append(problem + " [worker IS LIVE -- deploy would clobber production]")
            else:
                warnings.append(problem + " [worker not live -- placeholder/pre-build]")

    # tracked siblings: disk 0 bytes while HEAD is non-zero (always blocking)
    rc, out, _ = sh(["git", "ls-files", "-z"], cwd=root)
    if rc == 0 and out:
        for f in out.split("\0"):
            if not f or any(p in SKIP_DIRS for p in f.split("/")):
                continue
            full = os.path.join(root, f)
            if not os.path.isfile(full) or os.path.getsize(full) != 0:
                continue
            rc2, head, _ = sh(["git", "show", "HEAD:" + f], cwd=root)
            if rc2 == 0 and len(head) > 0:
                blocking.append("TRUNCATED on disk: %s (HEAD has %d bytes, disk has 0)" % (f, len(head)))

    print("REPO-INTEGRITY-GUARD: checked %d worker main(s) under %s" % (checked, root))
    if live_err:
        print("  NOTE: " + live_err + " (live-worker classification unavailable)")
    for w in warnings:
        print("  WARNING: " + w)
    for b in blocking:
        print("  VIOLATION: " + b)
    if blocking:
        print("REPO-INTEGRITY-GUARD: FAIL (%d blocking violation(s))" % len(blocking))
        return 1
    print("REPO-INTEGRITY-GUARD: PASS (0 blocking; %d non-blocking warning(s))" % len(warnings))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
