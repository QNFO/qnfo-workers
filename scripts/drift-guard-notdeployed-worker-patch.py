#!/usr/bin/env python3
"""drift-guard-notdeployed-worker-patch.py

NOT-DEPLOYED-IDENTITY-1 + DUP-WORKER-1 (2026-09-29).

TWO VERIFIED DEFECTS IN scripts/deploy-drift-guard.py, both found by RE-PROBING the
15:51:44 FLEET-AUTOAUDIT-1 pass rather than trusting the class counts:

  1. NOT-DEPLOYED-IDENTITY-1 -- the not_deployed class appends the repo DIRECTORY name
     (`not_deployed.append(d)`) while every other class carries the RESOLVED worker name.
     worker_live_audit therefore mixed two identifier spaces in ONE column: a row reading
     `agent-orchestrator` is a directory, a row reading `qnfo-agent-orchestrator` is a
     deployed script. That ambiguity is what issue #1377 mis-read as a false negative.
     Measured at 15:51:44Z: `agent-orchestrator` NOT_DEPLOYED (dir) sat beside
     `qnfo-agent-orchestrator` NO_REPO_VERSION live=1.1.0 (resolved) -- the same worker,
     two keys. Fix: append the resolved `worker`.

  2. DUP-WORKER-1 -- two directories can resolve to the SAME deployed worker (e.g. a dir
     named `memory-mcp` and a second dir both declaring name = "qnfo-memory-mcp"). The
     guard emitted that worker twice, fleet-autoaudit.py's classify() concatenated the note
     into the malformed value `NO_REPO_VERSION+NO_REPO_VERSION`, and the fleet was
     double-counted. Fix: dedupe on the resolved worker.

WHAT THIS PATCH DOES NOT DO (adversarial, read before trusting it)
  It does NOT change which workers are considered deployed, and it does NOT "fix" the 72
  genuine NOT_DEPLOYED rows. Ten of those were re-probed directly: every one either
  declares name == the directory (audit-hub, errata-hub, jnl-pipeline) or has no
  wrangler.toml at all (ci-status, docs, ops-gateway, papers, personal-life-search,
  qnfo-analytics, funding), and every one returns Cloudflare error 1042. The NOT_DEPLOYED
  CLASS WAS CORRECT; only its identifier and its duplicate emission were wrong.
  A green run here proves the identifier is now consistent and the file compiles. It does
  NOT prove any worker is healthy, and it does not prove the next audit pass classifies
  correctly -- that is verified separately by reading worker_live_audit after the next
  fleet-autodeploy run.
"""
import os
import py_compile
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
MARK = "NOT-DEPLOYED-IDENTITY-1"

A1_OLD = "            else:\n                not_deployed.append(d)\n"
A1_NEW = ("            else:\n"
          "                # NOT-DEPLOYED-IDENTITY-1: emit the RESOLVED worker, not the\n"
          "                # directory. Mixing the two spaces in one column made a\n"
          "                # directory name look like a worker name (issue #1377).\n"
          "                not_deployed.append(worker)\n")

A2_OLD = ("        worker = wrangler_name(d) or d\n"
          "        if wanted and d not in wanted and worker not in wanted:\n"
          "            continue\n")
A2_NEW = ("        worker = wrangler_name(d) or d\n"
          "        if wanted and d not in wanted and worker not in wanted:\n"
          "            continue\n"
          "        # DUP-WORKER-1: two directories can resolve to the SAME deployed worker.\n"
          "        # Emitting it twice produced the malformed note\n"
          "        # \"NO_REPO_VERSION+NO_REPO_VERSION\" and double-counted the fleet.\n"
          "        if worker in seen_workers:\n"
          "            continue\n"
          "        seen_workers.add(worker)\n")

A3_OLD = "    not_deployed, sync_workers, live_err, no_health = [], [], [], []\n"
A3_NEW = ("    not_deployed, sync_workers, live_err, no_health = [], [], [], []\n"
          "    seen_workers = set()\n")

ANCHORS = [("A1", A1_OLD, A1_NEW), ("A2", A2_OLD, A2_NEW), ("A3", A3_OLD, A3_NEW)]


def main():
    if not os.path.isfile(TARGET):
        print("::error::missing " + TARGET)
        return 3
    with open(TARGET, encoding="utf-8") as fh:
        src = fh.read()

    if MARK in src:
        print("ALREADY_PATCHED: no change")
        return 0

    for name, old, _ in ANCHORS:
        n = src.count(old)
        if n != 1:
            print("::error::anchor %s matched %d times (need exactly 1) - fail closed"
                  % (name, n))
            return 3

    out = src
    for _, old, new in ANCHORS:
        out = out.replace(old, new, 1)

    for probe in ("not_deployed.append(worker)", "seen_workers = set()",
                  "if worker in seen_workers:"):
        if probe not in out:
            print("::error::expected marker missing after patch: " + probe)
            return 3
    if "not_deployed.append(d)" in out:
        print("::error::old dir-name append still present - fail closed")
        return 3

    tmp = TARGET + ".patched"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(out)
    try:
        py_compile.compile(tmp, doraise=True)
    except py_compile.PyCompileError as e:
        print("::error::patched file does not compile: %s" % e)
        return 3
    os.replace(tmp, TARGET)

    print("PATCHED ok: %d -> %d bytes (+%d)" % (len(src), len(out), len(out) - len(src)))
    print("markers: NOT-DEPLOYED-IDENTITY-1 present, dir-name append removed, "
          "seen_workers dedupe present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
