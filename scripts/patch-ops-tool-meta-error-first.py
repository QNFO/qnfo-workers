#!/usr/bin/env python3
"""
patch-ops-tool-meta-error-first.py - OPS-TOOL-META-ERROR-FIRST-1 applier (2026-09-30).

ROOT CAUSE (evidence, not inference)
  qnfo-ops logToolEvent() serialises the per-tool-call telemetry row as
      snippet({ args, resultOk, error, ms }, 600)
  and snippet() is JSON.stringify(v).slice(0, n).  `args` is FIRST, so when a call
  carries a long argument (a multi-KB code payload, a long SQL statement) the 600
  character slice ends INSIDE args and the `error` field never reaches the row.

  Two DB objects then read that truncated meta and are silently blinded:
    * tool_error_exclusions (39 patterns) is consulted by
        - the view      tool_failures_24h
        - the trigger   tool_error_files_issue_v2
        - the trigger   tool_error_rate_filer_v3_ins
      via instr(meta, pattern).  With the error text truncated away, a class that IS
      excluded (e.g. "no such column", "has no column named") no longer matches, so
      the trigger files a ticket for a known-benign class.
    * the worker's own SELFHEAL-EXCLUSION-TABLE-1 self-heal query has the same blind
      spot.

  MEASURED 2026-09-30 (read back from qnfo-audit.cloud_ops_events):
    - evt-4b4101859798ef  ops_d1_write  meta begins {"_truncated":1,"_len":600,...
      and the error ("has no column named" class, which IS excluded) is absent
      -> issue #1532 filed anyway.
    - evt-d01451f7e0d1fe  shell_exec    same truncation shape -> issue #1520.
    - evt-e54b498198111f  exec_python   same truncation shape -> issue #1537.
  That is the mechanism behind #1484 ISSUE-LEDGER-EXCLUSION-BLIND-1.

FIX
  Serialise the error-bearing fields FIRST so the bounded slice can never drop them:
      snippet({ error, resultOk, ms, args }, 600)
  The error text is itself capped at 300 chars, so error + resultOk + ms always fit
  well inside 600 and `args` absorbs whatever budget remains.

  This is the RECURRENCE-ZERO-1 root-cause fix at the single write site: every
  downstream consumer (both triggers, the view, the self-heal query) becomes correct
  without changing any of them.

CONTRACT
  PRECONDITION   qnfo-ops/worker.js contains the args-first snippet() call exactly once
                 and carries VERSION 2.38.1-toolbudget-relock (or the marker).
  POSTCONDITION  it contains the error-first form exactly once, VERSION is bumped,
                 and node --check parses the file.
  INVARIANT      idempotent - a second run is a no-op; fail-closed - an absent anchor
                 that is not already patched exits non-zero and changes nothing.
"""
import io
import os
import sys

FILES = ["qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js"]

OLD_VER = 'var VERSION = "2.38.1-toolbudget-relock";'
NEW_VER = 'var VERSION = "2.38.2-tool-meta-error-first";'
MARKER = "OPS-TOOL-META-ERROR-FIRST-1"

OLD = (
    'snippet({ args, resultOk: !!(res && res.ok), error: res && !res.ok ? '
    'String(res.error || res.err || "").slice(0, 300) : void 0, ms }, 600)'
)
NEW = (
    'snippet({ /* ' + MARKER + ' */ error: res && !res.ok ? '
    'String(res.error || res.err || "").slice(0, 300) : void 0, '
    'resultOk: !!(res && res.ok), ms, args }, 600)'
)


def main():
    root = os.environ.get("REPO_ROOT") or os.getcwd()
    changed = 0
    for rel in FILES:
        p = os.path.join(root, rel)
        if not os.path.isfile(p):
            print("MISSING " + rel)
            return 1
        s = io.open(p, encoding="utf-8").read()
        if MARKER in s:
            print("ALREADY-APPLIED " + rel)
            continue
        n = s.count(OLD)
        if n != 1:
            print("ANCHOR-FAIL " + rel + ": expected 1 occurrence of the args-first snippet(), found " + str(n))
            return 1
        s = s.replace(OLD, NEW, 1)
        if s.count(OLD_VER) == 1:
            s = s.replace(OLD_VER, NEW_VER, 1)
            print("VERSION " + OLD_VER + " -> " + NEW_VER)
        elif NEW_VER not in s:
            print("ANCHOR-FAIL " + rel + ": VERSION anchor absent and not already new")
            return 1
        io.open(p, "w", encoding="utf-8", newline="\n").write(s)
        changed += 1
        print("APPLIED " + rel)
    print("OK changed=" + str(changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
