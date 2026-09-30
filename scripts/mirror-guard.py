#!/usr/bin/env python3
"""mirror-guard.py - MIRROR-STALENESS-DEPLOY-FAIL-1 (issue 1077, MIRROR-AUTOMATION-1).
MIRROR-CONTENT-DRIFT-1 (issue 1229, 2026-09-29): VERSION-only parity was a blind spot.
MIRROR-MISSING-REPAIR-1 (2026-09-29): MISSING mirrors were a permanent blind spot.

WHY: the canonical server-side deploy (qnfo-ops POST /ops/deploy) fetches the
CANONICAL artifact from qnfo-workers main at <dir>/deployed-current.worker.js, NOT
<dir>/worker.js. If the mirror lags the source, the route verifies a stale version
and fails closed with an OPAQUE ok=0. Canonical case: osf-integrity-check,
2026-09-24T11:49:27Z, where worker.js carried QNFO_VERSION="2.1.0" while
deployed-current.worker.js still carried the non-semver
"osf-integrity-check/fabric-20260910". A worker.js version bump is ALSO invisible to
the qnfo-fleet-control redeploy cron and the drift scanner unless the mirror moves.

WHAT: for every <dir>/worker.js with a sibling deployed-current.worker.js, extract
every version constant from each file and compare. Same constant NAMES but different
VALUES = a genuine lag (safe to regenerate with cp). Different NAME SETS = a
structural difference (probably a build artifact) = report only, never auto-copy.

CONTENT LAYER (2026-09-29, issue 1229): comparing version constants alone is a blind
spot -- a VERSION-equal pair can still differ in content, and because the canonical
deploy reads the MIRROR, a stale mirror silently ships code that no version bump
reveals. A VERSION-equal pair is therefore ALSO compared by content hash:
  CONTENT-DRIFT        source import-free, mirror not a capture -> auto-fixable (cp)
  CONTENT-DIFF-REVIEW  source uses imports (build artifact)    -> report only
Detection is always on; only --fix mutates.

RETRACTION (2026-09-29, same day, after review): the FIRST revision of this content
layer claimed "lagging=0 while 20 workers were VERSION-identical and content-divergent
by ~3720 lines". THAT FIGURE IS WITHDRAWN -- it came from a scan of a local container
clone, and it measured checkout/EOL state rather than repository content. Direct
GitHub blob-sha comparison of five pairs found FOUR byte-identical
(qnfo-lifecycle d3b76f91, personal-api 4865eed7, qnfo-auditor b09949a9,
events-radar aacdf94e) and ONE differing by CRLF line endings only
(qnfo-ai-calibration). The content-hash check BELOW IS KEPT regardless: it is strictly
stronger than VERSION-only comparison and needs no incident to justify it. Only the
supporting figure is withdrawn. Do not cite the 20-worker/3720-line number again.

MISSING LAYER (2026-09-29, MIRROR-MISSING-REPAIR-1): a directory holding worker.js but
NO deployed-current.worker.js used to be printed and then dropped on the floor. Two
independent defects kept it that way forever:
  (a) this script never created the mirror -- the `if m is None` branch only recorded
      the name; and
  (b) mirror-sync.yml staged with `git add -u`, which by definition stages only
      MODIFIED TRACKED files, so a newly created mirror could never be committed even
      if this script had made one.
A MISSING mirror is benign for the deploy route -- canonical() falls through to
<dir>/worker.js -- so it is deliberately NOT added to `drift`, and the report gate
stays green. Under --fix it is regenerated from source, but ONLY when the source is a
self-contained deployable (import-free) and non-empty: the same safety precondition
used for CONTENT-DRIFT. An empty source (0 bytes) is reported as EMPTY-SOURCE and
never mirrored -- there is nothing to deploy, and mirroring it would manufacture a
second empty artifact. Canonical case: paper-hub/worker.js is a 0-byte placeholder
(git empty blob e69de29b).

PR SCOPE (2026-09-30, MIRROR-GUARD-PR-SCOPE-1): on a pull request the workflow checks out the MERGE ref, so
lag that already exists on main counts against a PR that never touched that worker. The fleet's own ops bot
lands worker.js source-only (its file-write tool writes one file per commit) and qnfo-mirror-bot repairs the
mirror a few minutes later; PRs whose checks ran in that window went red for a worker they did not touch
(seen on three PRs in one session, qnfo-fleet-control each time). With --scope-to-diff=REF only workers whose
worker.js or deployed-current.worker.js differ between REF and HEAD can fail the gate; lag elsewhere is printed
as PRE-EXISTING and does not block. If the diff cannot be computed it falls back to the strict global gate.
The push-to-main run passes no flag, so main itself is still held to strict global parity.

Usage:
  python scripts/mirror-guard.py                          # report; exit 1 if any drift
  python scripts/mirror-guard.py --fix                    # regenerate lagging/missing mirrors
  python scripts/mirror-guard.py --scope-to-diff=HEAD^1   # PR mode: only fail on workers this change touches
Exit: 0 clean | 1 drift found
"""
import hashlib, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONST = re.compile(r'(?:var|let|const)\s+([A-Za-z0-9_]*VERSION[A-Za-z0-9_]*)\s*=\s*"([^"]*)"')


def sha256(path):
    """Content hash, CRLF-normalised so line-ending churn is not read as drift."""
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read().replace(b"\r\n", b"\n")).hexdigest()
    except OSError:
        return None


def is_captured(path):
    """True if the mirror is a CAPTURED multipart-upload body (the raw CF API
    PUT /content request), not a plain source mirror. Detected by a leading MIME
    boundary or a Content-Disposition: form-data header. cp is DESTRUCTIVE on these:
    it strips the envelope and silently replaces a captured artifact with the source.
    Canonical near-miss 2026-09-24: qnfo-ops (298900 B capture vs 301146 B source) and
    qnfo-infra (26594 vs 26475) were each one cp away from corruption.
    """
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            head = f.read(400)
    except OSError:
        return False
    return "Content-Disposition: form-data" in head or head.startswith("--")


def is_import_free(path):
    """True if worker.js is a self-contained deployable artifact (no static
    import / export-from). A file with imports is a SOURCE needing bundling; its
    mirror is a build artifact and must never be overwritten by cp."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            src = f.read()
    except OSError:
        return False
    for line in src.splitlines():
        ls = line.lstrip()
        if ls.startswith("import ") or (ls.startswith("export ") and " from " in ls):
            return False
    return True


def versions(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            src = f.read()
    except OSError:
        return None
    return dict(CONST.findall(src))


def touched_workers(base_ref):
    """Worker directories whose worker.js / deployed-current.worker.js differ between base_ref and HEAD.

    Returns None when git cannot say (bad ref, shallow clone), so the caller falls back to the strict
    global gate rather than silently passing.
    """
    try:
        out = subprocess.run(["git", "diff", "--name-only", base_ref, "HEAD"], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout.split()
    except Exception:  # noqa: BLE001
        return None
    names = set()
    for path in out:
        parts = path.split("/")
        if len(parts) == 2 and parts[1] in ("worker.js", "deployed-current.worker.js"):
            names.add(parts[0])
    return names


def main(argv):
    fix = "--fix" in argv
    scope_ref = next((a.split("=", 1)[1] for a in argv if a.startswith("--scope-to-diff=")), None)
    rows, drift, missing, fixed, captured = [], [], [], [], []
    content_drift, review, empty, fixed_missing = [], [], [], []

    for name in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, name)
        if not os.path.isdir(d) or name.startswith(".") or name in ("scripts", "docs"):
            continue
        src_p = os.path.join(d, "worker.js")
        mir_p = os.path.join(d, "deployed-current.worker.js")
        if not os.path.exists(src_p):
            continue

        # MIRROR-MISSING-REPAIR-1: a 0-byte source is a placeholder, not a deployable.
        # Counting it as MISSING is noise; mirroring it would create a second empty
        # artifact. Classify and move on before any version parsing.
        try:
            if os.path.getsize(src_p) == 0:
                empty.append(name)
                rows.append((name, "EMPTY-SOURCE", "0 bytes", "-"))
                continue
        except OSError:
            pass

        s = versions(src_p)
        m = versions(mir_p) if os.path.exists(mir_p) else None

        if m is None:
            # MIRROR-MISSING-REPAIR-1: repair only a self-contained, non-empty source.
            # Deliberately NOT added to `drift`: a missing mirror does not break the
            # deploy route (canonical() falls through to <dir>/worker.js), so gating on
            # it would red the report on every push that adds a worker directory.
            if fix and is_import_free(src_p):
                shutil.copyfile(src_p, mir_p)
                fixed_missing.append(name)
                rows.append((name, "MISSING", str(s), "regenerated from source"))
            else:
                missing.append(name)
                rows.append((name, "MISSING", str(s), "-"))
            continue
        if s == m:
            # MIRROR-CONTENT-DRIFT-1 (issue 1229): equal version constants do NOT
            # imply parity, and the canonical deploy reads the MIRROR, so a stale
            # mirror silently ships code no version bump reveals. Compare bytes, not
            # just the constants. (The "20 workers / ~3.7k lines" figure from the
            # first revision of this layer is WITHDRAWN -- see the docstring
            # retraction. The check stays; the figure does not.)
            hs, hm = sha256(src_p), sha256(mir_p)
            if hs == hm:
                continue
            if is_captured(mir_p):
                captured.append(name)
                rows.append((name, "CAPTURED", "plain source", "multipart-upload capture - NOT auto-fixable"))
                continue
            # MIRROR-GUARD-IMPORT-BLINDSPOT-1 (2026-09-30, issue #1513): an import-using source is a bundle
            # INPUT, not a plain deployable, so the previous rule left it report-only and
            # the scheduled mirror-sync could NEVER repair qnfo-ops parity. This branch is
            # only reached when the source and mirror carry the SAME version constant, so the
            # mirror is not version-ahead; worker.js is the source of truth and the canonical
            # deploy reads the mirror, so a byte-divergent version-equal pair silently reverts
            # the source. Repair it when the source is at least as large as the mirror (a stale
            # same-version build is smaller; a mirror-ahead hotfix is larger and is left alone).
            if is_import_free(src_p) or os.path.getsize(src_p) >= os.path.getsize(mir_p):
                content_drift.append(name)
                drift.append(name)
                rows.append((name, "CONTENT-DRIFT-IMPORT-SOT", "sha=%s" % hs[:12], "sha=%s" % hm[:12]))
                if fix:
                    shutil.copyfile(src_p, mir_p)
                    fixed.append(name)
            else:
                review.append(name)
                rows.append((name, "CONTENT-DIFF-REVIEW", "import-using source - mirror larger - report only", "sha=%s" % hm[:12]))
            continue
        if is_captured(mir_p):
            captured.append(name)
            rows.append((name, "CAPTURED", "plain source", "multipart-upload capture - NOT auto-fixable"))
            continue

        same_names = set(s) == set(m)
        lag = sorted(k for k in s if k in m and s[k] != m[k])
        if same_names and lag:
            rows.append((name, "LAG", ",".join("%s=%s" % (k, s[k]) for k in lag),
                         ",".join("%s=%s" % (k, m[k]) for k in lag)))
            drift.append(name)
            if fix:
                shutil.copyfile(src_p, mir_p)
                fixed.append(name)
        else:
            src_only = set(s) - set(m)
            # A name-set difference is a build artifact for an import-using source,
            # but for a self-contained deployable it is genuine drift: the mirror
            # omits a constant the source defines (e.g. worker.js gained a function
            # and a VERSION while the mirror was never regenerated). The canonical
            # deploy reads the mirror, so this silently reverts the source.
            if src_only and not is_captured(mir_p) and is_import_free(src_p):
                rows.append((name, "DEPLOYABLE-DRIFT", str(s), str(m)))
                drift.append(name)
                if fix:
                    shutil.copyfile(src_p, mir_p)
                    fixed.append(name)
            else:
                rows.append((name, "NAMESET-DIFF", str(s), str(m)))

    if rows:
        print("%-34s %-20s %-40s %s" % ("worker", "verdict", "source", "mirror"))
        for r in rows:
            print("%-34s %-20s %-40s %s" % r)
    print("\nsummary: lagging=%d content_drift=%d review=%d fixed=%d missing_mirror=%d fixed_missing=%d empty_source=%d captured=%d"
          % (len(drift), len(content_drift), len(review), len(fixed), len(missing),
             len(fixed_missing), len(empty), len(captured)))
    if missing:
        print("missing mirror: " + ", ".join(missing))
    if fixed_missing:
        print("regenerated missing mirror: " + ", ".join(fixed_missing))
    if empty:
        print("empty source (not mirrorable): " + ", ".join(empty))
    if captured:
        print("captured mirror: " + ", ".join(captured))
    if review:
        print("report-only (import-using source): " + ", ".join(review))
    blocking = drift
    if scope_ref and drift:
        touched = touched_workers(scope_ref)
        if touched is None:
            print("\nscope-to-diff: cannot compute the diff against %r; using the strict global gate" % scope_ref)
        else:
            blocking = [w for w in drift if w in touched]
            pre = [w for w in drift if w not in touched]
            if pre:
                print("\nPRE-EXISTING lag in workers this change does not touch (reported, NOT blocking here; "
                      "the push-to-main gate still enforces it): " + ", ".join(pre))
    if blocking and not fix:
        print("\nDRIFT GATE FAILED - run with --fix to regenerate from source, then commit BOTH files")
    return 1 if (blocking and not fix) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
