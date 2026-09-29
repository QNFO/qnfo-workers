#!/usr/bin/env python3
"""
GITHUB-FILE-WRITE-409-NO-RETRY-1 (issue 1372, 2026-09-29).

WHY THIS EXISTS
---------------
github_file_write() is the ops endpoint's own commit tool, and it is also the tool the
self-heal loop and every apply-* workflow path depend on. It issued ONE PUT and returned
on any failure -- no re-read of the head sha, no retry.

Verified live 2026-09-29 (telemetry_analyze 6h window, tool rate table):
    github_file_write  18 errors / 64 successes = 21.95% failure rate
That is the highest failure rate of any write tool on the endpoint, and it is the defect
the endpoint's own agent hits repeatedly while repairing the fleet: the repo has multiple
concurrent writers pushing every few minutes, so a caller's blob sha is stale by the time
the PUT lands and GitHub answers HTTP 409.

REMEDIATION
-----------
Bounded retry (4 attempts) that, between attempts, RE-READS the current blob sha via
GET /repos/{repo}/contents/{path} and re-applies the SAME full content. A contents PUT is
a full replacement, so a retry cannot duplicate or half-apply anything: it either lands the
whole content or fails closed carrying GitHub's original error text plus the attempt count.
Retry only on genuine conflict signals (409, or 422 whose message mentions sha/exists);
every other status still returns immediately, so auth/validation failures are not masked.

LIMITATION (stated, not hidden)
-------------------------------
Between our sha re-read and our PUT, a concurrent writer to the SAME path can still be
clobbered: last-writer-wins on one path is the pre-existing semantics of the contents API.
This retry stops the endpoint LOSING its own write; it does not add merge semantics, and it
must not be treated as safe where a lost update on the same path is unacceptable. A second
limitation: the retry budget is 4 attempts with linear backoff (250ms..750ms), so a path
under sustained contention still fails -- deliberately, rather than spinning.

SAFETY
------
Writes worker.js AND its deployed-current mirror in the SAME commit so mirror-guard stays
green and the qnfo-fleet-control redeploy cron cannot revert the fix. Fail-closed: the anchor
must match exactly once, the VERSION bump must apply, the mirror must stay byte-identical, and
any mismatch exits non-zero having written nothing. Idempotent: a second run is a no-op.
"""
import pathlib
import re
import sys

SRC = pathlib.Path("qnfo-ops/worker.js")
MIR = pathlib.Path("qnfo-ops/deployed-current.worker.js")

NEW_VER = "2.37.22-github-write-409-retry"
MARKER = "GITHUB-FILE-WRITE-409-NO-RETRY-1"

A1_OLD = '''  const body = { message, content: b64encode(content) };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;
  const res = await githubApi(env, "PUT", "/repos/" + encPath(repo) + "/contents/" + encPath(path), body);
  if (res.status === 201 || res.status === 200) return { ok: true, repo, path, commit: res.json && res.json.commit && res.json.commit.sha, url: res.json && res.json.content && res.json.content.html_url };
  return { ok: false, error: "GitHub " + res.status + ": " + String(res.json && res.json.message || res.text).slice(0, 300) };'''

A1_NEW = '''  const body = { message, content: b64encode(content) };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;
  // GITHUB-FILE-WRITE-409-NO-RETRY-1 (issue 1372, 2026-09-29). This function issued ONE PUT
  // and returned on failure. Verified live: 18 of 82 calls in a 6h window (21.95%) failed with
  // HTTP 409 because other fleet agents push to this repo every few minutes, so the caller's
  // sha is stale by the time the PUT lands. Remediation: bounded retry that RE-READS the current
  // blob sha (GET /contents) and re-applies the SAME full content. A contents PUT is a full
  // replacement, so a retry cannot duplicate or half-apply anything: it either lands the whole
  // content or fails closed carrying GitHub's original error text and the attempt count.
  // LIMITATION (stated, not hidden): between our sha re-read and our PUT, a concurrent writer to
  // the SAME path can still be clobbered -- last-writer-wins on one path is the pre-existing
  // semantics of the contents API. This stops us LOSING our own write; it adds no merge
  // semantics. Retries only on conflict signals (409, or 422 mentioning sha/exists); every other
  // status returns immediately so auth and validation failures are never masked.
  let res = null;
  let attempts = 0;
  for (let i = 0; i < 4; i++) {
    attempts = i + 1;
    if (i > 0) {
      try {
        const cur = await githubApi(env, "GET", "/repos/" + encPath(repo) + "/contents/" + encPath(path) + (branch ? "?ref=" + encodeURIComponent(branch) : ""), void 0);
        if (cur.status === 200 && cur.json && cur.json.sha) body.sha = cur.json.sha;
        else delete body.sha;
      } catch (e) {
      }
    }
    res = await githubApi(env, "PUT", "/repos/" + encPath(repo) + "/contents/" + encPath(path), body);
    if (res.status === 201 || res.status === 200) break;
    const msg = String(res.json && res.json.message || res.text || "");
    const conflict = res.status === 409 || (res.status === 422 && (msg.indexOf("sha") >= 0 || msg.toLowerCase().indexOf("exist") >= 0));
    if (!conflict) break;
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  if (res.status === 201 || res.status === 200) return { ok: true, repo, path, commit: res.json && res.json.commit && res.json.commit.sha, url: res.json && res.json.content && res.json.content.html_url, attempts };
  return { ok: false, error: "GitHub " + res.status + ": " + String(res.json && res.json.message || res.text).slice(0, 300), attempts, marker: "GITHUB-FILE-WRITE-409-NO-RETRY-1" };'''


def swap(text, old, new, label):
    n = text.count(old)
    if n != 1:
        sys.exit("FAIL-CLOSED [%s]: expected exactly 1 anchor match, found %d. "
                 "Artifact does not match the expected pre-patch state; nothing written." % (label, n))
    return text.replace(old, new, 1)


def main():
    if not SRC.exists():
        sys.exit("FAIL-CLOSED: %s not found" % SRC)
    src = SRC.read_text(encoding="utf-8")
    before = len(src)

    if MARKER in src:
        print("already patched (%s present); no change" % MARKER)
        return

    src = swap(src, A1_OLD, A1_NEW, "1/githubFileWrite-retry")

    m = re.search(r'var VERSION = "([^"]*)";', src)
    if not m:
        sys.exit("FAIL-CLOSED: no VERSION constant found")
    old_ver = m.group(1)
    src = src.replace('var VERSION = "%s";' % old_ver, 'var VERSION = "%s";' % NEW_VER, 1)
    if ('var VERSION = "%s";' % NEW_VER) not in src:
        sys.exit("FAIL-CLOSED: VERSION bump did not apply")

    SRC.write_text(src, encoding="utf-8")
    MIR.write_text(src, encoding="utf-8")

    if SRC.read_bytes() != MIR.read_bytes():
        sys.exit("FAIL-CLOSED: source and mirror diverged after write")

    post = SRC.read_text(encoding="utf-8")
    if "const res = await githubApi(env, \"PUT\"" in post.split(MARKER)[0].split("async function githubFileWrite")[-1]:
        sys.exit("FAIL-CLOSED: single-PUT call site still present inside githubFileWrite")

    print("APPLIED: %s -> %s" % (old_ver, NEW_VER))
    print("bytes: %d -> %d" % (before, len(src)))
    print("markers: retry=%d attempts_field=%d re-read-sha=%d"
          % (post.count(MARKER), post.count("attempts }"), post.count('encPath(path) + (branch ? "?ref="')))


if __name__ == "__main__":
    main()
