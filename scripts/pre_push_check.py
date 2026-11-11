#!/usr/bin/env python3
"""PUSH-GATE-1: run a worker's suites, the narrative guard and the mirror check; exit 1 on any failure.
Usage: python3 scripts/pre_push_check.py <worker> [--skip-guard]

COMPANION-LOCAL-CLEAN-1: Session sandbox cleanup is handled by scripts/session_closeout.py,
which verifies origin/main contains HEAD, prunes worktrees, and emits the git-safe cleanup
command so no unpushed work remains. This script remains the pre-push gate."""
import glob
import os
import subprocess
import sys


def run(cmd, cwd):
    """Execute *cmd* in *cwd*, returning (returncode, combined stdout+stderr)."""
    p = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    return p.returncode, (p.stdout + p.stderr)


def main(argv):
    if not argv:
        print("usage: pre_push_check.py <worker> [--skip-guard]")
        return 2

    # Repository root (two levels up from this script)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    worker = argv[0]
    worker_dir = os.path.join(root, worker)

    if not os.path.isdir(worker_dir):
        print("FAIL no such worker directory: " + worker)
        return 2

    failed = []

    # Run each *.test.mjs file
    for test_path in sorted(glob.glob(os.path.join(worker_dir, "*.test.mjs"))):
        rc, out = run(["node", "--no-warnings", test_path], worker_dir)

        # Consider any line that begins with "FAIL" (ignoring leading whitespace) as a failure indicator
        bad_lines = [
            line for line in out.splitlines() if line.lstrip().startswith("FAIL")
        ]

        if rc != 0 or bad_lines:
            failed.append(os.path.basename(test_path))
            print(
                f"FAIL {os.path.basename(test_path)} (exit {rc})"
            )
            # Show up to the first few failure lines for context
            for line in bad_lines[:5]:
                print("  " + line)

    # Mirror check: ensure deployed-current.worker.js matches worker.js
    src_path = os.path.join(worker_dir, "worker.js")
    deployed_path = os.path.join(worker_dir, "deployed-current.worker.js")
    if os.path.exists(src_path) and os.path.exists(deployed_path):
        if open(src_path, "rb").read() != open(deployed_path, "rb").read():
            failed.append("mirror")
            print("FAIL deployed-current.worker.js differs from worker.js")

    # Narrative guard (optional)
    if "--skip-guard" not in argv:
        guard_script = os.path.join(root, "scripts", "narrative-prompt-guard.py")
        rc, out = run(["python3", guard_script], root)
        if rc != 0:
            failed.append("narrative-prompt-guard")
            # Show the tail of the guard output for debugging
            tail = out[-400:] if len(out) > 400 else out
            print("FAIL narrative-prompt-guard\n" + tail)

    # Final status report
    if failed:
        print("pre_push_check: FAILED " + ", ".join(failed))
        return 1
    else:
        print("pre_push_check: ok")
        return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
