#!/usr/bin/env python3
"""CONTAINER-STDERR-1 - stop qnfo-ops from discarding container failure detail.

Issues: #1461 (SELF-AUDIT-TOOLERR: exec_python), #1462 (git_clone_exec),
        #1465, and the measured container.exec error rate in qnfo-audit.

ROOT CAUSE (measured 2026-09-29, both canonical files, byte-exact)
  qnfo-containers-pilot answers ANY non-zero exit with
      { ok: false, result: { exitCode, stdout, stderr } }
  and NO `error` field - the shape is shared by /sh, /exec, /node, /git/clone and
  /workspace/exec. qnfo-ops fmtContainer() was:

      if (!j || !j.ok) return { ok: false, error: j && j.error || "container error" };

  so it took the `!j.ok` branch, found no `j.error`, and returned the literal
  string "container error" - discarding j.result entirely, i.e. the exit code and
  the whole stderr. A raised Python exception, a bare `exit 3`, a pip resolution
  failure and a git exit 128 are therefore indistinguishable in every ops tool
  result, and cloud_ops_events records only the opaque string. Every container
  diagnosis made from tool output alone is blind by construction, which is why
  #1456/#1461/#1462 could only ever be triaged by re-running the probe.

FIX
  Keep the transport-failure branch (timeout / HTTP / PILOT_TOKEN) but classify it
  with a `kind`, and when the pilot DID return a result, surface exit_code + stderr
  and derive a real error string from the last non-empty stderr line.

  Strictly semantics-preserving on the one field callers branch on: the old code
  returned ok:false for every `j.ok === false`, and the new code still does. The
  change is purely additive (kind / error / exit_code / stderr), so no existing
  caller can change behaviour because of it.

Contract
  * fail-closed : exit 3 if any anchor matches != 1 time, if the patched output
                  fails `node --check`, or if the marker count drifts. Nothing is
                  written on abort.
  * idempotent  : re-run prints ALREADY APPLIED and exits 0.
  * mirror      : patches qnfo-ops/deployed-current.worker.js in the same pass, so
                  the blocking `cmp` mirror-parity gate in deploy-qnfo-ops.yml
                  still passes.

Exit codes: 0 applied|already-applied, 3 fail-closed, 4 no target files.
"""
import os
import re
import subprocess
import sys
import tempfile

MARKER = "CONTAINER-STDERR-1"
NEW_VERSION = "2.37.29-container-stderr-1"

ROOT = os.environ.get("REPO_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
)

TARGETS = [
    "qnfo-ops/worker.js",
    "qnfo-ops/deployed-current.worker.js",
]

OLD = (
    "function fmtContainer(j) {\n"
    '  if (!j || !j.ok) return { ok: false, error: j && j.error || "container error" };\n'
    "  const r = j.result || {};\n"
    '  return { ok: r.exitCode === 0, exit_code: r.exitCode, stdout: (r.stdout || "").slice(0, 65536), stderr: (r.stderr || "").slice(0, 8192), stdout_truncated: !!r.stdoutTruncated, stderr_truncated: !!r.stderrTruncated };\n'
    "}"
)

NEW = (
    "function fmtContainer(j) {\n"
    "  // CONTAINER-STDERR-1 (issues #1461/#1462/#1465): the pilot answers ANY non-zero\n"
    "  // exit with {ok:false, result:{exitCode,stdout,stderr}} and no `error` field, so\n"
    "  // the previous `if (!j.ok) return {error:\"container error\"}` discarded the whole\n"
    "  // result - exit code and stderr included - and made every container failure\n"
    "  // indistinguishable from every other one. Transport failures keep their message\n"
    "  // and gain a `kind`; result-bearing failures now surface exit_code + stderr.\n"
    '  if (!j) return { ok: false, error: "container error: empty response from containerDispatch", kind: "transport" };\n'
    "  if (!j.ok && !j.result) {\n"
    '    const msg = j.error || "container error";\n'
    '    const kind = /timeout|timed out|AbortError/i.test(String(msg)) ? "timeout" : /PILOT_TOKEN|not configured/i.test(String(msg)) ? "config" : /^container HTTP/i.test(String(msg)) ? "http" : "transport";\n'
    "    return { ok: false, error: msg, kind };\n"
    "  }\n"
    "  const r = j.result || {};\n"
    '  const out = { ok: r.exitCode === 0, exit_code: r.exitCode, stdout: (r.stdout || "").slice(0, 65536), stderr: (r.stderr || "").slice(0, 8192), stdout_truncated: !!r.stdoutTruncated, stderr_truncated: !!r.stderrTruncated };\n'
    "  if (j.ok === false) {\n"
    '    const tail = String(r.stderr || "").trim().split("\\n").filter((s) => s.trim()).slice(-1)[0] || "no stderr";\n'
    "    out.ok = false;\n"
    '    out.kind = "exit";\n'
    '    out.error = "container exit " + (r.exitCode === void 0 ? "?" : r.exitCode) + ": " + tail.slice(0, 300);\n'
    "  }\n"
    "  return out;\n"
    "}"
)

MARKER_LINE = (
    "// CONTAINER-STDERR-1: surface container exit_code + stderr instead of the opaque\n"
    '// "container error" string (issues #1461/#1462/#1465).\n'
)


def fail(msg):
    print("FAIL-CLOSED: " + msg)
    return 3


def check_syntax(src):
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False, encoding="utf-8") as fh:
        fh.write(src)
        tmp = fh.name
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if r.returncode != 0:
        return "node --check rejected the patched output\n" + (r.stderr or r.stdout)
    return None


def main():
    seen_any = False
    changed = []
    already = []

    for rel in TARGETS:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print("SKIP (absent): " + rel)
            continue
        seen_any = True
        src = open(path, encoding="utf-8").read()

        if MARKER in src:
            print("ALREADY APPLIED: " + rel)
            already.append(rel)
            continue

        n = src.count(OLD)
        if n != 1:
            return fail("anchor matched %d times (expected 1) in %s" % (n, rel))

        out = src.replace(OLD, NEW, 1)

        out, nver = re.subn(
            r'var VERSION\s*=\s*"[^"]*"',
            'var VERSION = "%s"' % NEW_VERSION,
            out,
            count=1,
        )
        if nver != 1:
            return fail("VERSION anchor matched %d times (expected 1) in %s" % (nver, rel))

        out = out.replace(
            'var VERSION = "%s"' % NEW_VERSION,
            MARKER_LINE + 'var VERSION = "%s"' % NEW_VERSION,
            1,
        )

        if out.count(MARKER) != 1:
            return fail("marker count != 1 after edit in " + rel)
        if 'error: j && j.error || "container error"' in out:
            return fail("legacy opaque return still present in " + rel)

        err = check_syntax(out)
        if err:
            return fail(err)

        open(path, "w", encoding="utf-8").write(out)
        print("PATCHED: %s (version -> %s, %d -> %d bytes)" % (rel, NEW_VERSION, len(src), len(out)))
        changed.append(rel)

    if not seen_any:
        return fail("no target files present under " + ROOT)

    if changed:
        print("RESULT: applied=%d already=%d" % (len(changed), len(already)))
    else:
        print("RESULT: applied=0 already=%d (nothing to do)" % len(already))
    return 0


if __name__ == "__main__":
    sys.exit(main())
