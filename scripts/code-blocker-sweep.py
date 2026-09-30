#!/usr/bin/env python3
"""CODE-BLOCKER-SWEEP-1 -- automated system-wide worker code-blocker audit.

Runs the four checks that the manual 2026-09-29 ops sweep established as the
real blocker classes across QNFO/qnfo-workers. Designed to run unattended in CI
(daily) and to fail closed on class A.

CLASSES
-------
A. SYNTAX          worker.js does not parse as an ES module.   FAIL-CLOSED.
                   Known instance: qnfo-errata-publish (MIME envelope,
                   fixed by scripts/unmangle-worker-js.py).
B. MIME-ENVELOPE   worker.js is a raw multipart/form-data API response.
                   FAIL-CLOSED. Detected structurally (boundary + part header).
C. MISSING-SNAPSHOT no deployed-current.worker.js beside worker.js.
                   REPORT-ONLY (deploy bookkeeping, not a code defect).
D. REPO-DRIFT      worker.js != deployed-current.worker.js.     REPORT-ONLY.
                   The repo convention is that the two are byte-identical;
                   a difference means the snapshot was not refreshed after the
                   last source change.
E. HANDLER-NO-CRON worker.js exports `scheduled` but wrangler.toml declares no
                   [triggers] crons.                             REPORT-ONLY.
                   A scheduled handler with no trigger never runs.

USAGE
-----
    python scripts/code-blocker-sweep.py            # human report
    python scripts/code-blocker-sweep.py --json     # machine report
    python scripts/code-blocker-sweep.py --strict   # exit 1 on class A or B
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AS_JSON = "--json" in sys.argv
STRICT = "--strict" in sys.argv

BOUNDARY_RE = re.compile(rb"\A--([0-9A-Za-z'()+_,\-./:=?]{8,})\r?\n")
MIME_MARKER = b"Content-Disposition: form-data"
SCHEDULED_RE = re.compile(rb"\bscheduled\s*[:(]")
CRONS_RE = re.compile(r"^\s*crons\s*=", re.M)


def worker_dirs():
    out = []
    for name in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, name)
        if not os.path.isdir(d):
            continue
        if os.path.isfile(os.path.join(d, "worker.js")):
            out.append(name)
    return out


def is_mime_envelope(raw):
    m = BOUNDARY_RE.match(raw)
    return bool(m) and MIME_MARKER in raw[:4096]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def syntax_ok(path):
    """Parse a file as an ES module. Returns (ok, error_text)."""
    with tempfile.NamedTemporaryFile("wb", suffix=".mjs", delete=False) as tmp:
        tmp.write(open(path, "rb").read())
        tmp_path = tmp.name
    try:
        proc = subprocess.run(
            ["node", "--check", tmp_path],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return proc.returncode == 0, (proc.stderr or "").strip().splitlines()[:3]
    except (OSError, subprocess.SubprocessError) as exc:
        return False, ["checker-error: %s" % exc]
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def main():
    report = {"A_syntax": [], "B_mime": [], "C_no_snapshot": [], "D_drift": [], "E_handler_no_cron": []}

    for name in worker_dirs():
        wpath = os.path.join(ROOT, name, "worker.js")
        dpath = os.path.join(ROOT, name, "deployed-current.worker.js")
        tpath = os.path.join(ROOT, name, "wrangler.toml")
        raw = open(wpath, "rb").read()

        if is_mime_envelope(raw):
            report["B_mime"].append(name)

        ok, err = syntax_ok(wpath)
        if not ok:
            report["A_syntax"].append({"worker": name, "error": err})

        if not os.path.isfile(dpath):
            report["C_no_snapshot"].append(name)
        elif sha256(wpath) != sha256(dpath):
            report["D_drift"].append(
                {"worker": name, "worker_bytes": os.path.getsize(wpath),
                 "snapshot_bytes": os.path.getsize(dpath)}
            )

        if SCHEDULED_RE.search(raw):
            toml = ""
            if os.path.isfile(tpath):
                toml = open(tpath, "r", errors="replace").read()
            if not CRONS_RE.search(toml):
                report["E_handler_no_cron"].append(name)

    counts = {k: len(v) for k, v in report.items()}
    blocking = counts["A_syntax"] + counts["B_mime"]

    if AS_JSON:
        print(json.dumps({"counts": counts, "blockers": blocking, "report": report}, indent=2))
    else:
        print("CODE-BLOCKER-SWEEP-1")
        print("  A syntax failures      : %d" % counts["A_syntax"])
        for row in report["A_syntax"]:
            print("      - %s: %s" % (row["worker"], row["error"][:1]))
        print("  B MIME envelopes       : %d  %s" % (counts["B_mime"], report["B_mime"]))
        print("  C missing snapshot     : %d" % counts["C_no_snapshot"])
        print("  D repo drift           : %d" % counts["D_drift"])
        print("  E handler without cron : %d  %s" % (counts["E_handler_no_cron"], report["E_handler_no_cron"]))
        print("  WORKERS SCANNED        : %d" % len(worker_dirs()))
        print("  BLOCKING (A+B)         : %d" % blocking)

    if STRICT and blocking:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
