#!/usr/bin/env python3
"""CLOUDFLARE-ONLY-HOST-1 (owner directive 2026-10-01)

"I don't want to be dependent on continued Claude usage, that violates the intent of the
Quniverse cloud fleet. I want all data (including dashboards and UI) hosted by Cloudflare,
never claude.ai."

The fleet's data, dashboards, owner surfaces, schedules and records of decision live on
Cloudflare (D1, R2, KV, Workers, crons) and in git. An agent session (Claude Code or any
other vendor's) may contribute through git and D1 like any other client, but nothing the
fleet needs to keep working may live on, or point the fleet at, a vendor's hosted surface:
no claude.ai artifact or doc as a system of record, no claude.ai Routine as a scheduler.

This guard fails CI when a tracked text file links to a claude.ai-hosted surface (an artifact, a doc, a
published page). Naming a retired Routine in a historical note is not a dependency and is not flagged.
Run from the repo root:  python3 scripts/cloudflare-only-host-guard.py
Exit 0 = clean, 1 = violations (each printed as a GitHub ::error annotation).
"""
import re
import subprocess
import sys

RULES = [
    ("claude.ai-hosted link (artifact, doc, session or published page)",
     re.compile(r"https?://(?:[a-z0-9-]+\.)*(?:claude\.ai|claude\.site|claudeusercontent\.com)(?:/|\b)", re.I)),
]

# This file states the patterns; nothing else is exempt.
EXEMPT = {"scripts/cloudflare-only-host-guard.py"}

MAX_BYTES = 4 * 1024 * 1024


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], check=True, capture_output=True).stdout
    return [p for p in out.decode("utf-8", "replace").split("\0") if p]


def scan(path):
    try:
        with open(path, "rb") as fh:
            data = fh.read(MAX_BYTES + 1)
    except (FileNotFoundError, IsADirectoryError, PermissionError):
        return []
    if len(data) > MAX_BYTES or b"\0" in data[:8192]:
        return []  # binary or bundle-sized: not a place a link to a hosted surface hides
    hits = []
    for lineno, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
        for label, rx in RULES:
            m = rx.search(line)
            if m:
                hits.append((lineno, label, m.group(0)))
    return hits


def main():
    bad = 0
    for path in tracked_files():
        if path in EXEMPT:
            continue
        for lineno, label, text in scan(path):
            bad += 1
            print(f"::error file={path},line={lineno}::CLOUDFLARE-ONLY-HOST-1: {label}: {text!r}. "
                  "Host the data or page on Cloudflare (D1/R2/KV + a worker route) and link that instead.")
    if bad:
        print(f"CLOUDFLARE-ONLY-HOST-1: {bad} violation(s). Fleet data, dashboards, UI and schedules live on "
              "Cloudflare and in git, never on claude.ai (CLAUDE.md CLOUDFLARE-ONLY-HOST-1).")
        return 1
    print("CLOUDFLARE-ONLY-HOST-1: clean (no claude.ai-hosted links in tracked files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
