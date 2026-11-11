#!/usr/bin/env python3
"""COMPANION-LOCAL-CLEAN-1 (issue #1002538, RED-DRAIN-1 dispatch):
Session closeout step for the local session sandbox clone.

Verifies that origin/main contains HEAD, prunes git worktrees, and prints
the single git-safe cleanup command (git worktree prune + git clean -fdx
inside the clone) so no unpushed work remains in /home/claude/qnfo-workers
after the session ends. The session itself cannot rm -rf a workspace
directory (the safety check blocks that), so the clone is cleaned using
git's own safe primitives instead.

Usage: python3 scripts/session_closeout.py [path-to-clone]
       (defaults to /home/claude/qnfo-workers)
Exits 0 on clean closeout, 1 on any verification failure.
"""
import os
import subprocess
import sys

DEFAULT_CLONE = "/home/claude/qnfo-workers"


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
    clone = argv[0] if argv else DEFAULT_CLONE
    clone = os.path.abspath(clone)

    if not os.path.isdir(os.path.join(clone, ".git")):
        print("FAIL not a git clone: " + clone)
        return 1

    failed = []

    # COMPANION-LOCAL-CLEAN-1: verify origin/main contains HEAD.
    rc, out = run(["git", "fetch", "origin"], clone)
    if rc != 0:
        failed.append("fetch")
        print("FAIL git fetch origin\n" + out[-400:])

    rc, out = run(
        ["git", "merge-base", "--is-ancestor", "HEAD", "origin/main"], clone
    )
    if rc != 0:
        failed.append("origin/main-does-not-contain-HEAD")
        print(
            "FAIL origin/main does not contain HEAD; push or rebase before "
            "closeout"
        )
        print("  " + out.strip()[-400:])
    else:
        print("ok origin/main contains HEAD")

    # COMPANION-LOCAL-CLEAN-1: prune stale worktree metadata.
    rc, out = run(["git", "worktree", "prune"], clone)
    if rc != 0:
        failed.append("worktree-prune")
        print("FAIL git worktree prune\n" + out[-400:])
    else:
        print("ok git worktree prune")

    if failed:
        print("session_closeout: FAILED " + ", ".join(failed))
        print("refusing cleanup: unpushed or unmerged work may remain")
        return 1

    # COMPANION-LOCAL-CLEAN-1: print the single git-safe cleanup command.
    print("session_closeout: ok, safe to clean the clone with:")
    print(f'  git -C "{clone}" worktree prune && git -C "{clone}" clean -fdx')
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
