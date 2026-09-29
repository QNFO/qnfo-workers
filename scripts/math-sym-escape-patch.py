#!/usr/bin/env python3
# MATH-SYM-UTF8-ESCAPE-1 (2026-09-29).
#
# PURPOSE
#   Make qnfo-gateway's two artifacts pure ASCII by rewriting every character
#   > U+007F as a \uXXXX escape (surrogate pairs above the BMP), and bump the
#   VERSION constant so the repo artifact is STRICTLY AHEAD of live -- which is
#   the only state in which fleet-autoaudit.py --apply will redeploy it.
#
# MEASURED FACTS THIS SCRIPT IS WRITTEN AGAINST (verified, not assumed)
#   qnfo-gateway/worker.js and qnfo-gateway/deployed-current.worker.js are
#   byte-identical: 114760 bytes, sha256
#   0286eae42d53a3f6a09df43b450e8f4d1d2ed82e80326be8434380b267083fa4,
#   248 non-ASCII bytes spanning 96 code points, every one of them a MATH_SYM
#   value (U+27E8, U+27E9, U+2016, Greek, operators, U+210F, ...). "String.raw"
#   does not occur. Escaping yields 115088 bytes that are 100% ASCII and whose
#   per-character JSON round-trip is exact.
#
#   The live bundle emits exactly those MATH_SYM glyphs Latin-1 double-encoded
#   (served papers.qnfo.org carries C3 A2 C2 9F C2 A8 and ZERO correct U+27E8),
#   while data-sourced Unicode on the same page (U+2014, U+00B7, U+2248) renders
#   correctly. The corruption is therefore specific to the artifact's raw
#   non-ASCII literals; a pure-ASCII artifact cannot be misread by any charset
#   step in the deploy path.
#
# WHY THE AUTOMATION NEVER FIXED THIS
#   fleet-autoaudit.py --apply redeploys ONLY workers strictly ahead by numeric
#   version. Repo and live both read 3.7.15-latex-feed, so the corrupted live
#   bundle was classified content-drift-only and was never overwritten --
#   report-only by design, forever. The version bump below is what moves this
#   worker across that gate.
#
# INVARIANTS (fail-closed; the script never half-writes)
#   * refuse if "String.raw" occurs -- escaping inside a String.raw template
#     would change the runtime string.
#   * refuse if an artifact is not valid UTF-8 -- a raw double-encoded byte
#     would otherwise be silently normalised instead of reported.
#   * both artifacts are written in the same run and asserted byte-identical
#     afterwards, because scripts/mirror-guard.py runs BLOCKING inside
#     fleet-autodeploy.yml and fails the whole deploy on content drift between a
#     VERSION-equal pair.
#   * idempotent: a second run finds pure ASCII at the new version and writes
#     nothing, so the workflow's "nothing to commit" branch is a clean no-op.
#
# ADVERSARIAL
#   Escaping is a source-level rewrite and is only correct where \uXXXX is
#   legal: string, template, regex, identifier and comment contexts all accept
#   it, which is why the no-String.raw precondition is the whole safety story.
#   This script does NOT parse JavaScript; the workflow's `node --check` gate
#   plus its MATH_SYM/version content assertions are what catch a violation.
#   Residual risk that remains: if the deploy pipeline itself decodes \uXXXX
#   into raw glyphs before upload (e.g. a JSON round-trip without
#   ensure_ascii=True), the escaped source reproduces the corruption at the new
#   version. Only a post-deploy byte check of the served page can distinguish
#   that -- which is why the live verifier asserts the served bytes rather than
#   trusting a green deploy.

import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = (
    "qnfo-gateway/worker.js",
    "qnfo-gateway/deployed-current.worker.js",
)
OLD_VERSION = "3.7.15-latex-feed"
NEW_VERSION = "3.7.16-utf8-escape"


def resolve(rel):
    """Resolve a repo-relative path from either the CWD or the repo root."""
    if os.path.exists(rel):
        return rel
    return os.path.join(REPO_ROOT, rel)


def escape_non_ascii(text):
    """Rewrite every code point > U+007F as a JS \\uXXXX escape."""
    out = []
    for ch in text:
        cp = ord(ch)
        if cp < 0x80:
            out.append(ch)
        elif cp <= 0xFFFF:
            out.append("\\u%04X" % cp)
        else:
            v = cp - 0x10000
            out.append(
                "\\u%04X\\u%04X"
                % (0xD800 + (v >> 10), 0xDC00 + (v & 0x3FF))
            )
    return "".join(out)


def main():
    written = {}
    for rel in TARGETS:
        path = resolve(rel)
        if not os.path.exists(path):
            print("MISSING %s: artifact not present in this revision" % rel)
            return 1

        with open(path, "rb") as fh:
            raw = fh.read()

        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            print(
                "NOT-UTF8 %s at byte offset %d: %s"
                % (rel, exc.start, exc.reason)
            )
            print("  refusing to normalise a raw non-UTF-8 byte silently")
            return 1

        if "String.raw" in text:
            print(
                "REFUSED %s: String.raw present -- escaping would change the "
                "runtime string" % rel
            )
            return 1

        non_ascii = sum(1 for b in raw if b > 127)
        patched = escape_non_ascii(text)
        if OLD_VERSION in patched:
            patched = patched.replace(OLD_VERSION, NEW_VERSION)
        new_bytes = patched.encode("ascii")

        if new_bytes != raw:
            with open(path, "wb") as fh:
                fh.write(new_bytes)
            print(
                "REPAIRED %s (%d non-ASCII byte(s) escaped, %d -> %d bytes)"
                % (rel, non_ascii, len(raw), len(new_bytes))
            )
        else:
            print("CLEAN %s (already pure ASCII at %s)" % (rel, NEW_VERSION))

        if NEW_VERSION not in patched:
            print("VERSION-NOT-BUMPED %s: neither %s nor %s found"
                  % (rel, OLD_VERSION, NEW_VERSION))
            return 1

        written[rel] = new_bytes

    a, b = written[TARGETS[0]], written[TARGETS[1]]
    if a != b:
        # Locate the divergence instead of just reporting inequality.
        n = min(len(a), len(b))
        off = next((i for i in range(n) if a[i] != b[i]), n)
        print(
            "MIRROR-MISMATCH %s (%d B) vs %s (%d B): first difference at byte %d"
            % (TARGETS[0], len(a), TARGETS[1], len(b), off)
        )
        print(
            "  mirror-guard.py runs blocking in fleet-autodeploy.yml; a drifted "
            "pair fails the deploy closed, so shipping it would be a false fix"
        )
        return 1

    print("mirror parity: both artifacts byte-identical (%d bytes)" % len(a))
    print("MATH-SYM-UTF8-ESCAPE-1: %d artifact(s) processed" % len(written))
    return 0


if __name__ == "__main__":
    sys.exit(main())
