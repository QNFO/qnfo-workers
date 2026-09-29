#!/usr/bin/env python3
"""
GITHUB-FILE-WRITE-409-NO-RETRY-1 (issue 1372, 2026-09-29). v2 -- equivalence-aware.

v1 patched githubFileWrite() from a single contents PUT to a bounded retry that re-reads
the head sha. A concurrent fleet agent then landed an EQUIVALENT repair under a DIFFERENT
marker (GITHUB-409-RETRY-1) and version label (2.37.22-github409-retry), so v1's exact
marker and exact anchor could never match main again: it failed closed (safe, nothing
written) but left this apply-* re-apply path permanently unusable.

v2 detects the DEFECT CLASS, not one implementation:
  * any known retry marker, OR
  * the behavioural signature inside githubFileWrite() -- a bounded attempts loop
    guarding HTTP 409/422
means "already repaired" -> clean no-op, exit 0, source/mirror parity asserted, VERSION
untouched. Only when NO repair is detectable is the pre-patch single-PUT anchor replaced
and VERSION bumped.

FAIL-CLOSED invariants (unchanged): the anchor must match exactly once; the mirror must
stay byte-identical; any mismatch exits non-zero having written nothing. Idempotent.
"""
import pathlib
import re
import sys

SRC = pathlib.Path("qnfo-ops/worker.js")
MIR = pathlib.Path("qnfo-ops/deployed-current.worker.js")

NEW_VER = "2.37.23-github409-retry-verified"
MARKERS = ["GITHUB-409-RETRY-1", "GITHUB-FILE-WRITE-409-NO-RETRY-1"]

A1_OLD = '''  const body = { message, content: b64encode(content) };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;
  const res = await githubApi(env, "PUT", "/repos/" + encPath(repo) + "/contents/" + encPath(path), body);
  if (res.status === 201 || res.status === 200) return { ok: true, repo, path, commit: res.json && res.json.commit && res.json.commit.sha, url: res.json && res.json.content && res.json.content.html_url };
  return { ok: false, error: "GitHub " + res.status + ": " + String(res.json && res.json.message || res.text).slice(0, 300) };'''

A1_NEW = '''  const apiPath = "/repos/" + encPath(repo) + "/contents/" + encPath(path);
  let res = await githubApi(env, "PUT", apiPath, body);
  let attempts = 1;
  let conflictStatus = null;
  while (attempts < 4 && res && (res.status === 409 || res.status === 422)) {
    conflictStatus = res.status;
    try {
      const cur = await githubApi(env, "GET", apiPath + (branch ? "?ref=" + encodeURIComponent(branch) : ""), void 0);
      if (cur && cur.status === 200 && cur.json && cur.json.sha) body.sha = cur.json.sha;
      else delete body.sha;
    } catch (e) {
    }
    await new Promise((r) => setTimeout(r, 250 * attempts));
    attempts++;
    res = await githubApi(env, "PUT", apiPath, body);
  }
  if (res.status === 201 || res.status === 200) return { ok: true, repo, path, commit: res.json && res.json.commit && res.json.commit.sha, url: res.json && res.json.content && res.json.content.html_url, attempts, sha_retried: attempts > 1, marker: "GITHUB-FILE-WRITE-409-NO-RETRY-1" };
  return { ok: false, error: "GitHub " + res.status + ": " + String(res.json && res.json.message || res.text).slice(0, 300), attempts, conflict_status: conflictStatus, marker: "GITHUB-FILE-WRITE-409-NO-RETRY-1" };'''


def block(src):
    i = src.find("function githubFileWrite")
    if i < 0:
        return ""
    nxt = len(src)
    for pat in ("\nfunction ", "\nasync function "):
        j = src.find(pat, i + 10)
        if j >= 0 and j < nxt:
            nxt = j
    return src[i:min(nxt, i + 8000)]


def detect(src):
    blk = block(src)
    hits = sorted(set([m for m in MARKERS if m in src]))
    sig = ("attempts" in blk) and ("409" in blk) and ("422" in blk) and ("githubApi" in blk)
    return hits, sig, blk


def main():
    if not SRC.exists():
        sys.exit("FAIL-CLOSED: %s not found" % SRC)
    src = SRC.read_text(encoding="utf-8")
    before = len(src)
    hits, sig, blk = detect(src)
    if hits or sig:
        why = ("marker(s) " + ", ".join(hits)) if hits else "behavioural retry signature in githubFileWrite()"
        if MIR.exists():
            if MIR.read_bytes() != SRC.read_bytes():
                sys.exit("FAIL-CLOSED: already repaired (%s) but source/mirror diverge" % why)
            parity = "source==mirror"
        else:
            parity = "mirror absent"
        print("ALREADY REPAIRED (%s); no change" % why)
        print("bytes: %d (unchanged)" % before)
        print("parity: %s" % parity)
        return

    n = src.count(A1_OLD)
    if n != 1:
        sys.exit("FAIL-CLOSED: expected exactly 1 pre-patch anchor, found %d; nothing written" % n)
    src = src.replace(A1_OLD, A1_NEW, 1)

    m = re.search(r'var VERSION = "([^"]*)";', src)
    if not m:
        sys.exit("FAIL-CLOSED: no VERSION constant found")
    old_ver = m.group(1)
    src = src.replace('var VERSION = "%s";' % old_ver, 'var VERSION = "%s";' % NEW_VER, 1)

    SRC.write_text(src, encoding="utf-8")
    MIR.write_text(src, encoding="utf-8")
    if SRC.read_bytes() != MIR.read_bytes():
        sys.exit("FAIL-CLOSED: source and mirror diverged after write")

    hits2, sig2, blk2 = detect(src)
    if not sig2:
        sys.exit("FAIL-CLOSED: post-patch behavioural signature absent")
    if A1_OLD in blk2:
        sys.exit("FAIL-CLOSED: pre-patch anchor still present after patch")

    print("APPLIED: %s -> %s" % (old_ver, NEW_VER))
    print("bytes: %d -> %d" % (before, len(src)))
    print("markers: attempts_refs=%d" % blk2.count("attempts"))


if __name__ == "__main__":
    main()
