#!/usr/bin/env python3
"""ci-watchdog-logfetch-patch.py -- CI-WATCHDOG-LOGFETCH-1 (2026-09-29).

DEFECT
  scripts/ci_watchdog.py fetched job logs through gh(), which always attaches
  `Authorization: Bearer <token>`. The GitHub job-log endpoint answers 302 to a
  pre-signed object-store URL, and urllib's default redirect handler REPLAYS the
  original headers on the follow-up request. That signed URL rejects any request
  carrying Authorization, so the follow-up 403s and the log body comes back empty.
  Observed directly: `curl -sSL .../runs/<id>/logs` -> http=403 size=180.

  Consequence: in CI every log fetch returned nothing, so any finding the
  structural classifier could not name degraded to `unknown` (the classifier's own
  docstring records 19 of 22 findings lost this way). A watchdog that cannot read
  evidence cannot name a failure mode, and an `unknown` finding is untriageable.

FIX (two parts)
  1. `_raw_log()` -- manual two-step fetch. Hop 1 asks the API WITH auth and with
     redirect-following DISABLED, reads the 302 Location, then hop 2 fetches that
     pre-signed URL with NO Authorization header -- the signed URL is itself the
     credential. The body is size-capped. `job_logs()` and the inline fetch in
     `main()` both route through it.
  2. `classify_structural()` -- a run whose display NAME is the workflow FILE PATH
     is a workflow GitHub could not parse: the `name:` key was never read, so the
     path was used as the display name. That is exactly the deploy-qnfo-ops.yml
     defect of 2026-09-29, which produced runs with ZERO jobs and therefore no log
     at all. Naming this structurally needs no fetch and cannot degrade to
     `unknown`.

IDEMPOTENT: exits 0 with "already patched" when the marker is present.
FAIL CLOSED: exit 1 if any anchor does not match exactly once (no partial write).
"""
from __future__ import annotations

import sys

TARGET = "scripts/ci_watchdog.py"
MARKER = "_raw_log"

HELPERS = '''class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Do not auto-follow: the job-log 302 target must not receive our headers."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _raw_log(job_id: int, cap: int = 200000) -> str:
    """Fetch one job log, following the 302 to signed blob storage WITHOUT auth.

    CI-WATCHDOG-LOGFETCH-1. The logs endpoint 302-redirects to a pre-signed
    object-store URL that rejects any request carrying an Authorization header,
    and urllib's default handler replays the original headers on the follow-up --
    so the follow-up 403s and every fetch in CI returned nothing, which degraded
    unclassifiable findings to `unknown`. Doing the two-step by hand, with a
    header-free second request, is the fix. The signed URL is the credential.
    """
    url = f"{API}/repos/{REPO}/actions/jobs/{job_id}/logs"
    opener = urllib.request.build_opener(_NoRedirect)
    req = urllib.request.Request(url, method="GET")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "qnfo-ci-watchdog")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    loc = ""
    try:
        with opener.open(req, timeout=30) as r:
            return r.read(cap).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            loc = e.headers.get("Location") or ""
        else:
            return ""
    except Exception:
        return ""
    if not loc:
        return ""
    # Hop 2: NO Authorization header. The pre-signed URL is the credential.
    req2 = urllib.request.Request(loc, method="GET")
    req2.add_header("User-Agent", "qnfo-ci-watchdog")
    try:
        with urllib.request.urlopen(req2, timeout=60) as r:
            return r.read(cap).decode("utf-8", "replace")
    except Exception:
        return ""


'''

A_JOBLOGS_OLD = '''        st2, raw = gh(f"/repos/{REPO}/actions/jobs/{j['id']}/logs")
        if st2 == 200 and isinstance(raw, dict) and "raw" in raw:
            out.append(raw["raw"])
        elif st2 == 200 and isinstance(raw, str):
            out.append(raw)
'''

A_JOBLOGS_NEW = '''        txt = _raw_log(j["id"])
        if txt:
            out.append(txt)
'''

B_MAIN_OLD = '''                        stl, raw = gh(f"/repos/{REPO}/actions/jobs/{j['id']}/logs")
                        log_fetches += 1
                        txt = raw.get("raw", "") if isinstance(raw, dict) else str(raw)
'''

B_MAIN_NEW = '''                        txt = _raw_log(j["id"])
                        log_fetches += 1
'''

C_CLASSIFY_OLD = '''    if name in SELF_WORKFLOWS:
        return "self", "the watchdog never files against itself"
'''

C_CLASSIFY_NEW = '''    if name in SELF_WORKFLOWS:
        return "self", "the watchdog never files against itself"
    # A run whose display NAME is the workflow FILE PATH is a workflow GitHub could
    # not parse: the `name:` key was never read, so the path was used instead. Such
    # a run is created with ZERO jobs, so there is no job log to inspect -- it can
    # only be named structurally. This is the WORKFLOW-YAML-LINT-1 class
    # (deploy-qnfo-ops.yml, 2026-09-29), which silently killed a deploy path.
    if name.endswith((".yml", ".yaml")):
        return "invalid-workflow", (
            "the workflow file is unparseable (run name is the file path); "
            "run scripts/workflow-lint.py"
        )
'''

COLLECT_ANCHOR = '''# --------------------------------------------------------------------------
# COLLECT
# --------------------------------------------------------------------------
'''


def apply_edits(text: str) -> tuple[str, list[str]]:
    """Apply each anchor exactly once. Raises ValueError on any mismatch."""
    applied: list[str] = []

    if text.count(COLLECT_ANCHOR) != 1:
        raise ValueError(f"COLLECT anchor matched {text.count(COLLECT_ANCHOR)}x, expected 1")
    text = text.replace(COLLECT_ANCHOR, HELPERS + COLLECT_ANCHOR, 1)
    applied.append("inserted _NoRedirect + _raw_log")

    for label, old, new in (
        ("job_logs() body", A_JOBLOGS_OLD, A_JOBLOGS_NEW),
        ("main() inline log fetch", B_MAIN_OLD, B_MAIN_NEW),
        ("classify_structural() path-name rule", C_CLASSIFY_OLD, C_CLASSIFY_NEW),
    ):
        n = text.count(old)
        if n != 1:
            raise ValueError(f"anchor '{label}' matched {n}x, expected exactly 1")
        text = text.replace(old, new, 1)
        applied.append(label)

    return text, applied


def main() -> int:
    try:
        with open(TARGET, encoding="utf-8") as fh:
            src = fh.read()
    except OSError as e:
        print(f"FATAL: cannot read {TARGET}: {e}", file=sys.stderr)
        return 1

    if MARKER in src:
        print(f"already patched: {TARGET} contains {MARKER!r}; no change")
        return 0

    try:
        out, applied = apply_edits(src)
    except ValueError as e:
        print(f"FATAL: {e}", file=sys.stderr)
        return 1

    # Parse-check before writing: a patcher that emits broken Python is worse
    # than no patcher.
    try:
        compile(out, TARGET, "exec")
    except SyntaxError as e:
        print(f"FATAL: patched source does not compile: {e}", file=sys.stderr)
        return 1

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(out)

    print(f"patched {TARGET}: {len(src)} -> {len(out)} bytes")
    for a in applied:
        print("  + " + a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
