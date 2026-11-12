#!/usr/bin/env python3
# SELF-CLOSED-LOOPS-1: instruction files carry the rule, and a change adds no text that waits on a person.
# Usage: self_closed_lint.py [--base origin/main] [--selftest]
import re, subprocess, sys
from pathlib import Path

RULE = "SELF-CLOSED-LOOPS-1"
INSTRUCTION = ["CLAUDE.md", "AGENTS.md", "agents/AGENTS.md", "GLOBAL-AGENTS.md"]
WAITS = re.compile(
    r"(awaiting|pending|needs?|for|requires?)\s+(the\s+)?(owner|human|manual|person'?s?)\s+(review|approval|decision|sign-?off)"
    r"|please\s+review|for\s+(your|the\s+owner'?s)\s+review|owner\s+to\s+(decide|approve|review)"
    r"|waiting\s+(on|for)\s+(the\s+)?(owner|a\s+human|a\s+person)|ready\s+for\s+(human|owner)\s+review",
    re.I,
)
ALLOW = re.compile(r"IDENTITY-BOUND|IC-GATE-001|lint-allow:\s*waits-on-person", re.I)
EXT = (".md", ".sql", ".yml", ".yaml", ".json", ".txt")


def hits(lines):
    return [l for l in lines if WAITS.search(l) and not ALLOW.search(l)]


def selftest():
    assert hits(["pending owner decision on X"]), "must flag"
    assert hits(["Please review this PR"]), "must flag"
    assert hits(["IDENTITY-BOUND: pending owner decision"]) == [], "gate exempt"
    assert hits(["the system decides and proceeds"]) == [], "clean"
    print("self_closed_lint selftest: 4 passed, 0 failed")


def sh(*a):
    return subprocess.run(a, capture_output=True, text=True)


def main():
    if "--selftest" in sys.argv:
        return selftest()
    fail = []
    present = [f for f in INSTRUCTION if Path(f).exists()]
    carrying = [f for f in present if RULE in Path(f).read_text(encoding="utf-8", errors="replace")]
    if not carrying:
        fail.append(f"no instruction file carries {RULE} (checked {present})")
    pointed = [f for f in carrying if "AGENT-BOOTSTRAP-1" in Path(f).read_text(encoding="utf-8", errors="replace")]
    if carrying and not pointed:
        fail.append("no instruction file carries the AGENT-BOOTSTRAP-1 pointer (python3 sync_agent_bootstrap.py <file>)")
    argv = sys.argv
    base = "origin/main"
    if "--base" in argv:
        i = argv.index("--base")
        if i + 1 >= len(argv):
            print("FAIL --base needs a ref"); sys.exit(1)
        base = argv[i + 1]
    if "--no-diff" in argv:
        print("self_closed_lint: --no-diff given; added-line scan not run (instruction-file check only)")
    elif sh("git", "rev-parse", "--verify", base).returncode != 0:
        fail.append(f"base {base} not found, so the added-line scan cannot run (fetch it, or pass --no-diff to check instruction files only)")
    else:
        d = sh("git", "diff", "-U0", f"{base}...HEAD").stdout.splitlines()
        cur = None
        for l in d:
            if l.startswith("+++ b/"):
                cur = l[6:]
            elif l.startswith("+") and not l.startswith("+++") and cur and cur.endswith(EXT):
                if cur in INSTRUCTION or "self_closed_lint" in cur:
                    continue
                if hits([l[1:]]):
                    fail.append(f"{cur}: waits on a person: {l[1:].strip()[:100]}")
    for f in fail:
        print("FAIL " + f)
    print(f"self_closed_lint: {'FAILED' if fail else 'ok'} ({len(carrying)} instruction file(s) carry {RULE})")
    sys.exit(1 if fail else 0)


main()
