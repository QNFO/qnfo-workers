#!/usr/bin/env python3
"""secret-mutation-guard.py - CONCURRENT-SESSION-SHARED-SECRET-CLOBBER-1 (#1701).

Fails CI (exit 1) when a workflow or script mutates a worker's secrets or bindings
through the Cloudflare API (or wrangler) WITHOUT referencing the qnfo-deploy-guard
secret-lock (`secret-lock` / `secret_lock`). Mutations must hold the lease
secrets:<worker> so concurrent sessions cannot clobber each other.

Mutation signals (any one, in a scanned file):
  M1 `wrangler secret put|bulk|delete`            (also argv form "secret", "put")
  M2 a `/secrets` API path together with PUT/POST/PATCH/DELETE
  M3 a `/settings` API path together with PATCH
  M4 a `workers/scripts/` API path together with an HTTP PUT (script upload rewrites bindings)

Allowlist: scripts/secret-mutation-allowlist.txt, one `path  # justification` per line.
An entry without a justification, or pointing at a missing file, is itself an error.
Usage: python3 scripts/secret-mutation-guard.py [--root DIR]
"""
import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOCK_RE = re.compile(r"secret[-_]lock", re.I)
M1 = re.compile(r"wrangler\s+secret\s+(put|bulk|delete)|[\"']secret[\"']\s*,\s*[\"'](put|bulk|delete)[\"']", re.I)
M2_PATH = re.compile(r"/secrets\b")
M3_PATH = re.compile(r"/settings\b")
M4_PATH = re.compile(r"workers/scripts/")
VERB_ANY = re.compile(r"\b(PUT|POST|PATCH|DELETE)\b|requests\.(put|post|patch|delete)", re.I)
VERB_PATCH = re.compile(r"(-X|--request)\s+PATCH\b|[\"']PATCH[\"']|method\s*=\s*[\"']?PATCH|requests\.patch", re.I)
VERB_PUT = re.compile(r"[\"']PUT[\"']|(-X|--request)\s+PUT\b|method\s*=\s*[\"']?PUT|requests\.put", re.I)
SELF = {"secret-mutation-guard.py", "secret-mutation-guard_test.py", "secret_lock.py", "secret_lock_test.py"}


def signals(text):
    out = []
    if M1.search(text):
        out.append("M1 wrangler secret mutation")
    if M2_PATH.search(text) and VERB_ANY.search(text):
        out.append("M2 /secrets endpoint with mutating verb")
    if M3_PATH.search(text) and VERB_PATCH.search(text):
        out.append("M3 /settings PATCH")
    if M4_PATH.search(text) and VERB_PUT.search(text):
        out.append("M4 workers/scripts PUT (rewrites bindings)")
    return out


def load_allowlist(root):
    path = os.path.join(root, "scripts", "secret-mutation-allowlist.txt")
    allowed, errors = set(), []
    if not os.path.isfile(path):
        return allowed, errors
    for n, line in enumerate(open(path, encoding="utf-8"), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        entry, _, why = line.partition("#")
        entry, why = entry.strip(), why.strip()
        if not why:
            errors.append("allowlist line %d: %r has no justification (`path  # why`)" % (n, entry))
        if not os.path.isfile(os.path.join(root, entry)):
            errors.append("allowlist line %d: %r does not exist" % (n, entry))
        allowed.add(entry)
    return allowed, errors


def scan(root):
    allowed, errors = load_allowlist(root)
    files = sorted(glob.glob(os.path.join(root, "scripts", "*.py")) + glob.glob(os.path.join(root, ".github", "workflows", "*.yml")))
    violations = []
    for f in files:
        rel = os.path.relpath(f, root).replace(os.sep, "/")
        if os.path.basename(f) in SELF or rel in allowed:
            continue
        try:
            text = open(f, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        sig = signals(text)
        if sig and not LOCK_RE.search(text):
            violations.append((rel, sig))
    return violations, errors


def main(argv):
    root = os.path.dirname(HERE)
    if "--root" in argv:
        root = argv[argv.index("--root") + 1]
    violations, errors = scan(root)
    for e in errors:
        print("ALLOWLIST-ERROR: " + e)
    for rel, sig in violations:
        print("VIOLATION: %s mutates secrets/bindings without the secret-lock: %s" % (rel, "; ".join(sig)))
    if violations or errors:
        print("FAIL: acquire POST /secret-lock/acquire before and /secret-lock/release after (try/finally), "
              "or add a justified entry to scripts/secret-mutation-allowlist.txt")
        return 1
    print("OK: every secrets/bindings mutation path references the secret-lock")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
