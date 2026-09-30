#!/usr/bin/env python3
"""UNMANGLE-WORKER-JS-1 -- repair MIME-mangled worker.js sources.

ROOT CAUSE (established 2026-09-29, ops endpoint)
-------------------------------------------------
Commit 7046ce02 ("chore(fleet): deploy-state sync for errata-publish/
idea-triage/research-exec/social", 2026-09-08) wrote the RAW body of a
Cloudflare Workers API response

    GET /accounts/:id/workers/scripts/:name/content

into `qnfo-errata-publish/worker.js`. That endpoint answers with a
`multipart/form-data` envelope (RFC 7578), not with the script itself, so the
committed file began with a MIME boundary line:

    --90d68a4da6d33cfc21fc0f758d58a642556a756ea83c594bf1c75e48ada2
    Content-Disposition: form-data; name="deployed-current.worker.js"

    var __defProp = Object.defineProperty;
    ...
    --90d68a4da6d33cfc21fc0f758d58a642556a756ea83c594bf1c75e48ada2--

Consequences observed:
  * `node --check` FAILS on the file -> repo-wide syntax blocker.
  * `git log` for the path shows exactly ONE commit, so there is no
    pre-corruption revision to restore -- the file was BORN corrupt.
  * The size delta is the signature: envelope = payload + ~197 bytes.
    All 94 workers in the repo have `worker.js` byte-identical to
    `deployed-current.worker.js`; only qnfo-errata-publish differs (+197).

WHAT THIS SCRIPT DOES
---------------------
Scans every `*/worker.js` in the repo. If a file is a single-part MIME
envelope, it extracts the payload, refuses to write anything it cannot cleanly
parse out of, and writes the payload back. Idempotent: a clean file is never
touched.

USAGE
-----
    python scripts/unmangle-worker-js.py          # repair in place
    python scripts/unmangle-worker-js.py --check  # exit 1 if anything mangled

`--check` is the fail-closed CI guard: a red run means a mangled source is
about to be deployed.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK_ONLY = "--check" in sys.argv

# Boundary line: --<token>\n  (RFC 2046 bchars: alnum + '()+_,-./:=?)
BOUNDARY_RE = re.compile(rb"\A--([0-9A-Za-z'()+_,\-./:=?]{8,})\r?\n")
MIME_MARKER = b"Content-Disposition: form-data"


def extract_payload(raw):
    """Return the MIME payload of a single-part envelope, else None."""
    m = BOUNDARY_RE.match(raw)
    if not m:
        return None
    boundary = m.group(1)
    # Require the MIME part header near the top: this separates a real
    # envelope from a JS file that merely happens to start with "--".
    if MIME_MARKER not in raw[:4096]:
        return None

    # The part header block terminates at the first blank line.
    idx = raw.find(b"\r\n\r\n")
    if idx >= 0:
        start = idx + 4
    else:
        idx = raw.find(b"\n\n")
        if idx < 0:
            return None
        start = idx + 2

    closing = b"--" + boundary + b"--"
    end = raw.rfind(closing)
    if end < 0 or end <= start:
        return None

    payload = raw[start:end]
    # Strip the single newline belonging to the envelope formatting, not to the
    # payload. This makes the result byte-identical to the canonical
    # `deployed-current.worker.js` snapshot (verified: 738040 -> 738039).
    if payload.endswith(b"\r\n"):
        payload = payload[:-2]
    elif payload.endswith(b"\n"):
        payload = payload[:-1]

    if not payload.strip():
        return None
    if BOUNDARY_RE.match(payload):
        return None  # nested envelope: refuse to guess
    return payload


def main():
    mangled = []
    repaired = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
        if "worker.js" not in filenames:
            continue
        path = os.path.join(dirpath, "worker.js")
        try:
            with open(path, "rb") as fh:
                raw = fh.read()
        except OSError as exc:
            print("READ-ERROR %s: %s" % (path, exc))
            continue
        payload = extract_payload(raw)
        if payload is None:
            continue
        rel = os.path.relpath(path, ROOT)
        mangled.append((rel, len(raw), len(payload)))
        if CHECK_ONLY:
            continue
        with open(path, "wb") as fh:
            fh.write(payload)
        repaired.append(rel)

    if not mangled:
        print("UNMANGLE-WORKER-JS-1: clean (no MIME-mangled worker.js found)")
        return 0

    for rel, before, after in mangled:
        print("MIME-ENVELOPE %s: %d -> %d bytes" % (rel, before, after))

    if CHECK_ONLY:
        print(
            "UNMANGLE-WORKER-JS-1: FAIL -- %d mangled source(s). "
            "Remediate with: python scripts/unmangle-worker-js.py" % len(mangled)
        )
        return 1

    for rel in repaired:
        print("REPAIRED %s" % rel)
    print("UNMANGLE-WORKER-JS-1: repaired %d file(s)" % len(repaired))
    return 0


if __name__ == "__main__":
    sys.exit(main())
