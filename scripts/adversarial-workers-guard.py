#!/usr/bin/env python3
"""adversarial-workers-guard.py - cloud-runnable half of adversarial-guard (GUARDS-LOCAL-ONLY-1, #1686).

QNFO/qnfo-ops/scripts/adversarial-guard.py checks two things: (a) the owner's local skills/templates/system
prompt (C:/Users/LENOVO/...; NOT checkable from a cloud runner) and (b) that worker prompt surfaces carry the
ADVERSARIAL-REASONING-1 block. Only (b) reads files in this repo, so only (b) lives here.

  core workers  -> FAIL (exit 1) if the marker is missing  (same CORE_WORKERS list as the canonical guard)
  full sweep    -> ADVISORY: workers with a prompt surface and no marker are listed, never fail the run
                   (the canonical guard prints them as GAP without counting a violation)

A worker.js that is only a REDACTION PLACEHOLDER (<512 B or contains REDACTED) is read via its
deployed-current.worker.js instead, as the canonical guard does, so a placeholder cannot raise a false FAIL.
Exit 0 = core surfaces pass | 1 = violation | 2 = a core worker artifact is missing.
"""
import glob, os, re, sys

MARKER = "ADVERSARIAL-REASONING-1"
CORE = ["qnfo-ai", "qnfo-ops", "personal-api", "agent-orchestrator", "qnfo-ipatent", "qnfo-intent-orchestrator"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def artifact(w):
    p = os.path.join(ROOT, w, "worker.js")
    try:
        with open(p, "rb") as f:
            head = f.read(300)
        if os.path.getsize(p) >= 512 and b"REDACTED" not in head:
            return p
    except OSError:
        return p
    alt = os.path.join(ROOT, w, "deployed-current.worker.js")
    return alt if os.path.isfile(alt) else p


def read(p):
    with open(p, encoding="utf-8", errors="replace") as f:
        return f.read()


bad, missing = [], []
for w in CORE:
    p = artifact(w)
    if not os.path.isfile(p):
        missing.append(w)
        print(f"MISSING {w}: no artifact at {os.path.relpath(p, ROOT)}")
        continue
    ok = MARKER in read(p)
    print(("PASS " if ok else "FAIL ") + f"core worker {w} carries {MARKER}")
    if not ok:
        bad.append(w)

print("\n== full sweep (advisory) ==")
gaps = []
for p in sorted(glob.glob(os.path.join(ROOT, "*", "worker.js"))):
    w = os.path.basename(os.path.dirname(p))
    a = artifact(w)
    if not os.path.isfile(a):
        continue
    s = read(a)
    surface = (re.search(r'role\s*:\s*["\']system', s) or "SYSTEM_PROMPT" in s or "systemPrompt" in s)
    if surface and MARKER not in s:
        gaps.append(w)
print(f"  {len(gaps)} worker(s) with a prompt surface and no marker: {', '.join(gaps) or 'none'}")

if missing:
    print(f"\nRESULT: {len(missing)} core artifact(s) missing")
    sys.exit(2)
if bad:
    print(f"\nRESULT: {len(bad)} core violation(s)")
    sys.exit(1)
print("\nRESULT: all core adversarial-reasoning surfaces pass")
