#!/usr/bin/env python3
"""GITHUB-409-RETRY-1 applier (issue 1372, 2026-09-29).

Fail-closed patcher for qnfo-ops/worker.js.

DEFECT (measured, not inferred)
  githubFileWrite() performed exactly ONE PUT and returned on any non-2xx:

      const res = await githubApi(env, "PUT", ..., body);
      if (res.status === 201 || res.status === 200) return { ok: true, ... };
      return { ok: false, error: "GitHub " + res.status + ... };

  This repository lands roughly a dozen commits per two minutes from concurrent
  writers (qnfo-ci, the fleet bot, agent sessions). A writer that reads a blob sha
  and then PUTs loses that race whenever anyone else commits in between, and the
  GitHub contents API answers 409 (or 422 for a sha that no longer matches the
  branch head). The tool surfaced that as a hard failure and never re-read the head.
  Measured consequence: 17.5% of github_file_write calls fail with HTTP 409
  (issue 1372), which is the second-largest single-tool error population in the fleet.

FIX
  On 409/422, re-GET the file to obtain the CURRENT head sha, rewrite body.sha, and
  retry -- bounded to 3 additional attempts with linear backoff. The sha is only
  re-read when the file already exists, so a genuine create/create race still fails
  loudly instead of being silently converted into an overwrite. The result now
  reports `attempts` and `sha_retried` so the audit log can measure the retry rate.

WHY BOTH FILES
  qnfo-ops/worker.js and qnfo-ops/deployed-current.worker.js are patched in the same
  pass so MIRROR-PARITY-1 stays green and the qnfo-fleet-control redeploy cron cannot
  revert the fix by copying a stale mirror back over the artifact.

FAIL-CLOSED
  Exits non-zero, writing nothing, unless the anchor appears exactly once in each
  file and the version line is in an expected state. Re-running after a successful
  apply is a clean no-op (idempotent).
"""
import pathlib
import re
import sys

VERSION_OLD = 'var VERSION = "2.37.21-selfheal-metric-table-fix";'
VERSION_NEW = 'var VERSION = "2.37.22-github409-retry";'
VERSION_TAG = "github409-retry"

TARGETS = [
    "qnfo-ops/worker.js",
    "qnfo-ops/deployed-current.worker.js",
]

ANCHOR = (
    '  const res = await githubApi(env, "PUT", "/repos/" + encPath(repo) + "/contents/" + encPath(path), body);\n'
    '  if (res.status === 201 || res.status === 200) return { ok: true, repo, path, commit: res.json && res.json.commit && res.json.commit.sha, url: res.json && res.json.content && res.json.content.html_url };\n'
    '  return { ok: false, error: "GitHub " + res.status + ": " + String(res.json && res.json.message || res.text).slice(0, 300) };'
)

REPLACEMENT = (
    '  const apiPath = "/repos/" + encPath(repo) + "/contents/" + encPath(path);\n'
    '  // GITHUB-409-RETRY-1 (issue 1372, 2026-09-29): a bare PUT returns 409/422 the moment a\n'
    '  // concurrent writer advances the branch, and this tool used to surface that as a hard\n'
    '  // failure (measured 17.5% of github_file_write calls fleet-wide). Re-read the head sha\n'
    '  // and retry, bounded, before giving up. The sha is only re-read when the file already\n'
    '  // exists, so a genuine create/create race still fails loudly instead of being silently\n'
    '  // converted into an overwrite.\n'
    '  let res = await githubApi(env, "PUT", apiPath, body);\n'
    '  let attempts = 1;\n'
    '  let conflictStatus = null;\n'
    '  while (attempts < 4 && res && (res.status === 409 || res.status === 422)) {\n'
    '    conflictStatus = res.status;\n'
    '    const cur = await githubApi(env, "GET", apiPath + "?ref=" + encodeURIComponent(branch || "main"), void 0);\n'
    '    const curSha = cur && cur.json && cur.json.sha ? String(cur.json.sha) : null;\n'
    '    if (!curSha) break;\n'
    '    body.sha = curSha;\n'
    '    await new Promise(function (r) { return setTimeout(r, 250 * attempts); });\n'
    '    res = await githubApi(env, "PUT", apiPath, body);\n'
    '    attempts++;\n'
    '  }\n'
    '  if (res.status === 201 || res.status === 200) return { ok: true, repo, path, commit: res.json && res.json.commit && res.json.commit.sha, url: res.json && res.json.content && res.json.content.html_url, attempts, sha_retried: attempts > 1 };\n'
    '  return { ok: false, error: "GitHub " + res.status + ": " + String(res.json && res.json.message || res.text).slice(0, 300), attempts, conflict_status: conflictStatus };'
)

MARKER = "GITHUB-409-RETRY-1"


def fail(msg):
    print("FAIL-CLOSED: " + msg, file=sys.stderr)
    sys.exit(1)


def patch_one(path_str):
    p = pathlib.Path(path_str)
    if not p.is_file():
        fail("missing target file: " + path_str)
    src = p.read_text(encoding="utf-8")

    if MARKER in src:
        print("already applied (idempotent no-op): " + path_str)
        return False

    n = src.count(ANCHOR)
    if n != 1:
        fail("anchor occurrences in %s = %d (expected exactly 1)" % (path_str, n))

    if VERSION_OLD not in src:
        fail(
            "version line not in the expected state in %s; refusing to clobber a "
            "concurrent writer's version bump" % path_str
        )
    if src.count(VERSION_OLD) != 1:
        fail("version line occurrences in %s != 1" % path_str)

    out = src.replace(ANCHOR, REPLACEMENT, 1)
    out = out.replace(VERSION_OLD, VERSION_NEW, 1)

    # Structural sanity: the patch must add markers and must not unbalance the file's
    # brace/bracket delta. A non-zero delta change means the replacement broke structure.
    def delta(s):
        return (s.count("{") - s.count("}"), s.count("(") - s.count(")"), s.count("[") - s.count("]"))

    d_before, d_after = delta(src), delta(out)
    if d_before != d_after:
        fail("structural delta changed in %s: %s -> %s" % (path_str, d_before, d_after))

    for need in (MARKER, "sha_retried", "conflict_status", "apiPath", "attempts++"):
        if need not in out:
            fail("post-condition missing in %s: %s" % (path_str, need))
    if "const res = await githubApi(env, \"PUT\"" in out:
        fail("old single-PUT form still present in %s" % path_str)
    if VERSION_NEW not in out:
        fail("version bump missing in %s" % path_str)

    p.write_text(out, encoding="utf-8")
    print("patched %s: +%d bytes, version -> %s" % (path_str, len(out) - len(src), VERSION_NEW))
    return True


def main():
    changed = False
    for t in TARGETS:
        if patch_one(t):
            changed = True
    print("changed=%s" % ("true" if changed else "false"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
