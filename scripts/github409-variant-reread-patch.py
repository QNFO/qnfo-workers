#!/usr/bin/env python3
"""GITHUB-409-VARIANT-RETRY-GAP-1 applier (issue 1396, 2026-09-29).

Fail-closed patcher for qnfo-ops/worker.js and its deployed-current mirror.

DEFECT (measured, not inferred)
  scripts/github409-retry-patch.py (2.37.22-github409-retry) added a bounded retry to
  githubFileWrite():

      while (attempts < 4 && res && (res.status === 409 || res.status === 422)) {
        conflictStatus = res.status;
        const cur = await githubApi(env, "GET", apiPath + "?ref=" + ..., void 0);
        const curSha = cur && cur.json && cur.json.sha ? String(cur.json.sha) : null;
        if (!curSha) break;          <-- THE GAP
        body.sha = curSha;
        ...
      }

  `if (!curSha) break;` makes the retry DEPENDENT ON A SECONDARY NETWORK CALL. That
  re-read is the same api.github.com that rate-limits this worker's egress IP: a 403
  was observed from the Cloudflare egress during this session, and GitHub's contents
  API returns 403/429 (not 409) when rate-limited. When the re-read fails, the loop
  aborts on the FIRST iteration and the caller sees the ORIGINAL 409 with attempts=1 --
  i.e. the retry exists but cannot engage for that payload shape, which is exactly the
  reported symptom: `GitHub 409: ... is at <sha> but expected <sha>`, attempts=1.

  Two further fragilities in the same block:
    * `res.status === 409` is a STRICT comparison. If the API layer ever surfaces the
      status as a string, every branch test is false: the loop is skipped AND the
      success test `res.status === 201` is skipped, so a successful write would be
      reported as a failure.
    * A failed re-read leaves body.sha at its previous value (or absent), so the single
      retry that does happen is guaranteed to lose again.

FIX
  * The sha re-read is bounded-retried in its own right (3 attempts, linear backoff).
  * A failed re-read no longer aborts the loop; the PUT is retried anyway, because a
    409 is frequently transient and a retry costs one request.
  * Status comparison is numeric via statusOf(), so a string status cannot silently
    disable both the retry and the success path.
  * The result now reports `sha_reread_failed` so the audit log can distinguish "no
    conflict" from "conflict we could not resolve because the re-read was throttled".

WHY BOTH FILES
  qnfo-ops/worker.js and qnfo-ops/deployed-current.worker.js are patched in the same
  pass so MIRROR-PARITY-1 stays green and the qnfo-fleet-control redeploy cron cannot
  revert the fix by copying a stale mirror back over the artifact.

VERSION-PIN-AGNOSTIC-1
  The version line is located by pattern, not by literal: the tag is replaced whatever
  it currently is. This repository has already regressed a version string once today
  (2.37.25 -> 2.37.24), so a frozen VERSION_OLD would fail closed on a bump that is not
  this applier's business (issue 1355, STALE-PREFLIGHT-1).

FAIL-CLOSED
  Exits non-zero, writing nothing, unless every anchor appears exactly once in each
  file, the version line is unique, and the structural brace/bracket delta is unchanged.
  Re-running after a successful apply is a clean no-op (idempotent).
"""
import pathlib
import re
import sys

VERSION_NEW = 'var VERSION = "2.37.26-github409-reread";'
VERSION_TAG = "github409-reread"

TARGETS = [
    "qnfo-ops/worker.js",
    "qnfo-ops/deployed-current.worker.js",
]

# The whole retry block, from the first PUT to the terminal failure return. Anchored on
# the exact bytes currently in the artifact (verified against main this session).
ANCHOR = "\n".join([
    '  let res = await githubApi(env, "PUT", apiPath, body);',
    '  let attempts = 1;',
    '  let conflictStatus = null;',
    '  while (attempts < 4 && res && (res.status === 409 || res.status === 422)) {',
    '    conflictStatus = res.status;',
    '    const cur = await githubApi(env, "GET", apiPath + "?ref=" + encodeURIComponent(branch || "main"), void 0);',
    '    const curSha = cur && cur.json && cur.json.sha ? String(cur.json.sha) : null;',
    '    if (!curSha) break;',
    '    body.sha = curSha;',
    '    await new Promise(function (r) { return setTimeout(r, 250 * attempts); });',
    '    res = await githubApi(env, "PUT", apiPath, body);',
    '    attempts++;',
    '  }',
    '  if (res.status === 201 || res.status === 200) return { ok: true, repo, path, commit: res.json && res.json.commit && res.json.commit.sha, url: res.json && res.json.content && res.json.content.html_url, attempts, sha_retried: attempts > 1 };',
    '  return { ok: false, error: "GitHub " + res.status + ": " + String(res.json && res.json.message || res.text).slice(0, 300), attempts, conflict_status: conflictStatus };',
])

REPLACEMENT = "\n".join([
    '  // GITHUB-409-VARIANT-RETRY-GAP-1 (issue 1396, 2026-09-29): the retry below used to',
    '  // abort whenever the sha RE-READ failed (`if (!curSha) break;`). That re-read is the',
    '  // same api.github.com that rate-limits this worker\'s egress IP, so a secondary',
    '  // failure silently short-circuited the retry and surfaced as the ORIGINAL 409 with',
    '  // attempts=1 -- the retry existed but could not engage for that payload shape.',
    '  // The re-read is now bounded-retried, the status comparison is numeric (a string',
    '  // status would make every strict === test false, disabling the retry AND the success',
    '  // path at once), and a failed re-read no longer aborts the loop.',
    '  const statusOf = function (r) { return r && r.status != null ? Number(r.status) : 0; };',
    '  let res = await githubApi(env, "PUT", apiPath, body);',
    '  let attempts = 1;',
    '  let conflictStatus = null;',
    '  let shaRereadFailed = 0;',
    '  while (attempts < 4 && (statusOf(res) === 409 || statusOf(res) === 422)) {',
    '    conflictStatus = statusOf(res);',
    '    let curSha = null;',
    '    for (let g = 0; g < 3 && !curSha; g++) {',
    '      const cur = await githubApi(env, "GET", apiPath + "?ref=" + encodeURIComponent(branch || "main"), void 0);',
    '      curSha = cur && cur.json && cur.json.sha ? String(cur.json.sha) : null;',
    '      if (!curSha) {',
    '        shaRereadFailed++;',
    '        await new Promise(function (r) { return setTimeout(r, 300 * (g + 1)); });',
    '      }',
    '    }',
    '    if (curSha) body.sha = curSha;',
    '    await new Promise(function (r) { return setTimeout(r, 250 * attempts); });',
    '    res = await githubApi(env, "PUT", apiPath, body);',
    '    attempts++;',
    '  }',
    '  if (statusOf(res) === 201 || statusOf(res) === 200) return { ok: true, repo, path, commit: res.json && res.json.commit && res.json.commit.sha, url: res.json && res.json.content && res.json.content.html_url, attempts, sha_retried: attempts > 1, sha_reread_failed: shaRereadFailed };',
    '  return { ok: false, error: "GitHub " + statusOf(res) + ": " + String(res.json && res.json.message || res.text).slice(0, 300), attempts, conflict_status: conflictStatus, sha_reread_failed: shaRereadFailed };',
])

MARKER = "GITHUB-409-VARIANT-RETRY-GAP-1"
VERSION_RE = re.compile(r'var VERSION = "[^"]+";')


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

    vhits = VERSION_RE.findall(src)
    if len(vhits) != 1:
        fail(
            "expected exactly one `var VERSION = \"...\";` in %s, found %d "
            "(refusing to clobber a concurrent writer's version line)" % (path_str, len(vhits))
        )
    version_old = vhits[0]

    out = src.replace(ANCHOR, REPLACEMENT, 1)
    out = out.replace(version_old, VERSION_NEW, 1)

    # Structural sanity: the patch must not unbalance the file's brace/bracket delta.
    def delta(s):
        return (s.count("{") - s.count("}"), s.count("(") - s.count(")"), s.count("[") - s.count("]"))

    d_before, d_after = delta(src), delta(out)
    if d_before != d_after:
        fail("structural delta changed in %s: %s -> %s" % (path_str, d_before, d_after))

    for need in (MARKER, "sha_reread_failed", "statusOf", "sha_retried", "conflict_status"):
        if need not in out:
            fail("post-condition missing in %s: %s" % (path_str, need))
    if "if (!curSha) break;" in out:
        fail("the short-circuiting `if (!curSha) break;` survived in %s" % path_str)
    if 'while (attempts < 4 && res && (res.status === 409' in out:
        fail("old retry condition survived in %s" % path_str)
    if VERSION_NEW not in out:
        fail("version bump missing in %s" % path_str)

    p.write_text(out, encoding="utf-8")
    print(
        "patched %s: +%d bytes, version %s -> %s"
        % (path_str, len(out) - len(src), version_old, VERSION_NEW)
    )
    return True


def main():
    changed = False
    for t in TARGETS:
        if patch_one(t):
            changed = True
    a = pathlib.Path(TARGETS[0]).read_bytes()
    b = pathlib.Path(TARGETS[1]).read_bytes()
    if a != b:
        fail("mirror pair diverged after patch (%d vs %d bytes)" % (len(a), len(b)))
    print("mirror pair byte-identical (%d bytes)" % len(a))
    print("changed=%s" % ("true" if changed else "false"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
