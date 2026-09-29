#!/usr/bin/env python3
"""rawput-version-regex-quote-patch.py - LEDGER-VERSION-QUOTE-1 (issue 1451/1370-B follow-on). rev 2.

rev 2 note: identical logic to rev 1; this commit exists to trigger
.github/workflows/apply-rawput-version-regex-quote.yml now that the workflow file is
present on main (a workflow added in the same push is not reliably evaluated for that
push event, so the applier needed a follow-up commit on a watched path).

DEFECT (verified live 2026-09-29):
  scripts/raw_put.py:81
      VERSION_RE = re.compile(r'(?:var|let|const)\\s+(?:QNFO_)?VERSION\\s*=\\s*"([^"]+)"')
  accepts ONLY a double-quoted version literal. Workers written with a single-quoted
  constant -- e.g. idea-hub/worker.js:13  const VERSION='1.0.7-rss-pipeline-stamp-gate';
  -- therefore deploy with version_id="unknown" in qnfo-audit.deployment_history.

  Live contrast proof (deployment_history, QNFO_AUDIT, both by scripts/raw_put.py):
    id 120  qnfo-lifecycle  version_id "unknown"                 (16:13:04Z)
    id 141  idea-hub        version_id "unknown"                 (17:13:00Z)
    id 129  qnfo-lifecycle  version_id "1.6.4-metric-freshness"  (double-quoted constant)
  Same deployer, same day, same code path: the only difference is the quote character.
  The deploy ledger DEPLOY-LEDGER-1 exists to keep honest, so a null version for a whole
  class of workers defeats it.

FIX: accept both quote styles by using \\x27 (the single quote) inside the character
class, so the pattern needs no quote escaping at all and cannot be broken by a future
editor's escaping mistake:
    ["\\x27]([^"\\x27]+)["\\x27]

FAIL-CLOSED: the old line must occur exactly once; a miss raises and nothing is written.
Re-running on an already-patched file is a no-op, not an error.
POST-CONDITION: the patched module must import, and the new regex must match BOTH a
double-quoted and a single-quoted version literal, extracting the right value.

VERIFIED 2026-09-29 by qnfo-ops in a Cloudflare container against a fresh clone:
  pass 1 -> "patched /tmp/vq/scripts/raw_put.py", POST-CONDITIONS OK (4/4 literals)
  pass 2 -> "already applied", POST-CONDITIONS OK (4/4)  [idempotent]
  git diff --stat -> scripts/raw_put.py | 2 +-  (1 insertion, 1 deletion)
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "raw_put.py")

OLD = "VERSION_RE = re.compile(r'(?:var|let|const)\\s+(?:QNFO_)?VERSION\\s*=\\s*\"([^\"]+)\"')"
NEW = "VERSION_RE = re.compile(r'(?:var|let|const)\\s+(?:QNFO_)?VERSION\\s*=\\s*[\"\\x27]([^\"\\x27]+)[\"\\x27]')"


def main():
    if not os.path.isfile(TARGET):
        raise SystemExit("FAIL-CLOSED: missing " + TARGET)
    with open(TARGET, encoding="utf-8") as fh:
        text = fh.read()

    n = text.count(OLD)
    if n == 0:
        if NEW in text:
            print("already applied: " + TARGET)
        else:
            raise SystemExit("FAIL-CLOSED: anchor not found in " + TARGET)
    elif n != 1:
        raise SystemExit("FAIL-CLOSED: anchor occurs %d times in %s" % (n, TARGET))
    else:
        text = text.replace(OLD, NEW)
        with open(TARGET, "w", encoding="utf-8") as fh:
            fh.write(text)
        print("patched " + TARGET)

    # POST-CONDITIONS -- prove the effect, not just the edit.
    with open(TARGET, encoding="utf-8") as fh:
        after = fh.read()
    assert NEW in after, "POST-CONDITION FAILED: new regex not present"
    assert OLD not in after, "POST-CONDITION FAILED: old regex still present"

    ns = {}
    exec(compile(after, TARGET, "exec"), ns)
    rx = ns["VERSION_RE"]
    cases = [
        ('var VERSION = "1.2.3-dq";', "1.2.3-dq"),
        ("const VERSION='1.0.7-sq';", "1.0.7-sq"),
        ('const QNFO_VERSION = "1.6.4-mixed";', "1.6.4-mixed"),
        ("let VERSION = '2.0.0-let';", "2.0.0-let"),
    ]
    for src, want in cases:
        m = rx.search(src)
        got = m.group(1) if m else None
        assert got == want, "POST-CONDITION FAILED: %r -> %r (want %r)" % (src, got, want)
        print("  ok %-42s -> %s" % (src, got))

    print("POST-CONDITIONS OK (4/4 literals extracted, incl. single-quoted)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
