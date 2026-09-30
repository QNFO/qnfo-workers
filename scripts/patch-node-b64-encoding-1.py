#!/usr/bin/env python3
"""NODE-EXEC-B64-ENCODING-1 -- patch the qnfo-containers-pilot /node handler.

ROOT CAUSE (reproduced live 2026-09-30, exact stderr captured):
    argv: ['bash','-c','cd "/workspace" && node -e "const a=1;\\nconsole.log(...)"']
    rc=1   SyntaxError: Invalid or unexpected token  /  Expected unicode escape

The /node handler embedded the caller's JS source into a bash command line via
JSON.stringify.  JSON.stringify renders a newline as the two characters backslash-n;
bash double-quoting does NOT interpret that escape, so `node` receives a literal
backslash-n inside its source and dies at parse time.  Single-line code worked,
multi-line code failed -> exec_node 62.5% failure rate over 168h.

/exec (python) never had this bug: it passes code as a DISCRETE argv element
    this.run(["python3", "-c", code, ...argv])
which bash never re-parses.

FIX: base64 the source and decode inside the container, so no shell metacharacter
or escape sequence survives the bash layer:
    const b64 = btoa(unescape(encodeURIComponent(code)));
    ... " && printf %s " + JSON.stringify(b64) + " | base64 -d | node -"

Validated before shipping (exec_python, real container):
    A live form          -> rc=1  SyntaxError
    B discrete-argv form -> rc=0  ok
    C base64 form        -> rc=0  ok

Applies to BOTH worker.js and the canonical repo mirror deployed-current.worker.js
(FLEET-CONTROL-NO-REPO-MIRROR-1).

Idempotent: prints ALREADY-APPLIED and exits 0 when the fix is present.
Fail-closed: exits 2 if the anchor is absent or ambiguous (FAIL-CLOSED-ANCHOR-1).
"""
import io
import sys

TARGETS = [
    "qnfo-containers-pilot/worker.js",
    "qnfo-containers-pilot/deployed-current.worker.js",
]

OLD = ('const out = await this.run(["bash", "-c", "cd " + JSON.stringify(cwd) + '
       '" && node -e " + JSON.stringify(code)]);')
NEW = ('const b64 = btoa(unescape(encodeURIComponent(code)));\n'
       '        const out = await this.run(["bash", "-c", "cd " + JSON.stringify(cwd) + '
       '" && printf %s " + JSON.stringify(b64) + " | base64 -d | node -"]);')


def patch(path):
    try:
        s = io.open(path, encoding="utf-8").read()
    except FileNotFoundError:
        print("SKIP (absent): %s" % path)
        return 0
    if NEW in s:
        print("ALREADY-APPLIED: %s" % path)
        return 0
    n = s.count(OLD)
    if n != 1:
        print("FAIL-CLOSED: %s anchor count=%d (expected 1)" % (path, n), file=sys.stderr)
        return 2
    s = s.replace(OLD, NEW)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    print("PATCHED %s bytes=%d" % (path, len(s.encode("utf-8"))))
    return 0


def main():
    rc = 0
    for t in TARGETS:
        rc |= patch(t)
    return rc


if __name__ == "__main__":
    sys.exit(main())
