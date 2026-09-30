#!/usr/bin/env python3
"""D1-GUARD-LITERAL-AND-FN-AWARE-1 applier (fail-closed). Supersedes the literal-only revision.

WHY THIS REVISION EXISTS (issue #1349, still reproducing in production 2026-09-29):
the literal-only revision (2.37.18-d1-guard-literal-aware) strips string literals before
the keyword scan, which fixes the LITERAL class
(WHERE title LIKE '%delete%'). It does NOT fix the FUNCTION class, because the bare-word
scan still lists `replace`, and replace(...) is a SQLite scalar function that is ALSO the
REPLACE INTO keyword. Reproduced live against the committed 2.37.18 tree:

  ops_d1_query  SELECT replace(title,'TOOL-FAILURE','TF') AS t, id FROM agent_issues LIMIT 3
  -> {"ok":false,"rejected":true,
      "error":"read-only SELECT/WITH only - mutation keyword 'replace' appears as SQL..."}

That single guard line is the highest-volume false rejection on ops_d1_query and pushes
agents into schema guessing (489 `no such column` events in the same window).

The PREVIOUS revision of this script could not apply at all: its PRE anchor was
2.37.17-d1-schema-hint and its GUARD_ANCHOR was the pre-literal raw-text scan, so both
anchors failed to match the committed tree and the applier aborted (exit 3) forever.
This revision re-anchors on the CURRENT committed text and is behaviourally tested.

WHAT: `replace` is removed from the bare-word keyword scan and re-checked ONLY as
`REPLACE INTO`. Safe by construction: the statement must already begin with SELECT/WITH
and any interior ';' is rejected, so a REPLACE INTO statement cannot survive inside a read.

The guard is STRICTLY STRONGER where it matters: 'SELECT 1; SELECT 2' is still refused.

FAIL-CLOSED: aborts (exit 3) unless the pre-patch VERSION matches, every anchor occurs
exactly once in both artifacts, node --check passes on both, and SRC == MIRROR afterwards.
IDEMPOTENT: exits 0 with no change when the post-patch VERSION is already present.
"""
import pathlib
import subprocess
import sys

SRC = pathlib.Path("qnfo-ops/worker.js")
MIRROR = pathlib.Path("qnfo-ops/deployed-current.worker.js")

PRE = 'var VERSION = "2.37.18-d1-guard-literal-aware";'
POST = 'var VERSION = "2.37.19-d1-guard-literal-fn-aware";'

OLD = r'''  var mm = /\b(insert|update|delete|drop|alter|create|attach|detach|vacuum|reindex|replace|truncate)\b/i.exec(stripped);'''

NEW = r'''  var mm = /\b(insert|update|delete|drop|alter|create|attach|detach|vacuum|reindex|truncate)\b/i.exec(stripped);'''

EXTRA = r'''
  if (/\breplace\s+into\b/i.test(stripped)) return { ok: false, rejected: true, error: "read-only SELECT/WITH only - 'REPLACE INTO' is a mutation statement", hint: "use ops_d1_write for REPLACE INTO; the replace() scalar function is allowed in reads" };'''


def die(code, msg):
    sys.stderr.write(msg + "\n")
    sys.exit(code)


def patch(path):
    t = path.read_text()
    if POST in t:
        return "already"
    if t.count(PRE) != 1:
        die(3, "ABORT: pre-patch VERSION anchor occurs %d times in %s" % (t.count(PRE), path))
    if t.count(OLD) != 1:
        die(3, "ABORT: keyword-scan anchor occurs %d times in %s" % (t.count(OLD), path))
    path.write_text(t.replace(PRE, POST).replace(OLD, NEW + EXTRA))
    return "patched"


for p in (SRC, MIRROR):
    if not p.exists():
        die(3, "ABORT: missing %s" % p)
    print("%s: %s" % (p, patch(p)))

for p in (SRC, MIRROR):
    r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
    if r.returncode != 0:
        die(3, "ABORT: node --check failed on %s\n%s" % (p, r.stderr))
print("node --check OK on both artifacts")

if SRC.read_bytes() != MIRROR.read_bytes():
    die(3, "ABORT: SRC and MIRROR are not byte-identical after patching")
print("mirror parity OK (%d bytes)" % len(SRC.read_bytes()))
