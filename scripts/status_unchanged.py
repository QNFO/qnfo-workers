#!/usr/bin/env python3
"""STATUS-NOOP-SKIP-1: tell a CI status-artifact writer whether a freshly written JSON status file differs from
the committed one ONLY in per-run stamps, so the writer can skip a commit that carries no information.

Measured 2026-10-01 over the last 40 commits of each file: ci-status/remediation-consumer.json changed in 6
(33 of 39 commits were stamp-only) and ci-status/remediation-bridge.json in 16 (23 of 39). Those commits, plus the
unmangle status file, were about 100 of the 249 bot commits pushed to main in 3 hours; every main push also
starts CodeQL runs that hit "API rate limit exceeded for installation" and report a configuration error.

usage: status_unchanged.py FILE [--ignore k1,k2,...] [--ref REF]   (REF defaults to HEAD; use origin/main after a fetch)
exit 0  FILE equals its version at HEAD apart from the ignored top-level keys  -> skip the commit
exit 1  anything else: changed, new file, unreadable, not valid JSON, not an object  -> commit (fail-safe)

Default ignored keys are pure run stamps: head (the triggering SHA), ts, spent_ms, verifier, actor.
Outcome keys (ok, job_status, counts, guard_exit, repair_exit, ...) are never ignored.
"""
import json
import subprocess
import sys

DEFAULT_IGNORE = ("head", "ts", "spent_ms", "verifier", "actor")


def strip(d, ignore):
    return {k: v for k, v in d.items() if k not in ignore}


def unchanged(path, ignore=DEFAULT_IGNORE, ref="HEAD"):
    try:
        with open(path, encoding="utf-8") as fh:
            new = json.load(fh)
        old_text = subprocess.run(["git", "show", ref + ":" + path], capture_output=True, text=True)
        if old_text.returncode != 0:
            return False  # not tracked yet: first write must be committed
        old = json.loads(old_text.stdout)
        if not isinstance(new, dict) or not isinstance(old, dict):
            return False
        return strip(new, ignore) == strip(old, ignore)
    except Exception:
        return False


def main(argv):
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return 2
    path, ignore, ref = argv[0], DEFAULT_IGNORE, "HEAD"
    if "--ignore" in argv:
        i = argv.index("--ignore")
        ignore = tuple(x for x in argv[i + 1].split(",") if x) if i + 1 < len(argv) else ignore
    if "--ref" in argv:
        i = argv.index("--ref")
        ref = argv[i + 1] if i + 1 < len(argv) else ref
    same = unchanged(path, ignore, ref)
    print("%s: %s" % (path, "unchanged apart from run stamps" if same else "changed (or not comparable)"))
    return 0 if same else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
