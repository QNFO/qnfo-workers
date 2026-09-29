#!/usr/bin/env python3
"""driftguard-label-and-lifecycle-sot-patch.py - issue 1370 (2026-09-29, rev 4).

FOUR verified defects, plus two self-inflicted ones caught by this patcher's own
verification and fixed here. Rev 1 and rev 2 both FAILED CLOSED in CI and never
landed; rev 3 landed but its heartbeat edit was wrong. Both failure modes are
designed out in rev 4.

E) ANCHOR-DRIFT-1 (why rev 1 and rev 2 never landed). Both used multi-line
   exact-string anchors copied from a read of scripts/deploy-drift-guard.py taken
   earlier in the same session. That file moved under them THREE times while the
   patcher was being written:
        9,781 B (331 lines)  <- rev 1 anchors derived here
       15,139 B (330 lines)  <- rev 2 anchors derived here
       17,531 B (365 lines)  <- rev 3/rev 4 anchors derived here (current main)
   Every multi-line anchor eventually matched 0 times and the patcher aborted by
   design -- correctly, but uselessly. Rev 4 is LINE-ANCHORED: each edit locates
   its target by a single-line regex predicate, asserts EXACTLY ONE match, and
   never depends on surrounding lines or absolute line numbers.

F) QUOTED-LITERAL-TRAP (rev 3 defect, caught by rev 3's own marker assertion).
   The heartbeat source reads .bind("qnfo-lifecycle", "fabric-20260910", ...) --
   the literal is QUOTED. Replacing the bare substring "fabric-20260910" leaves the
   surrounding quotes in place and emits .bind(..., "QNFO_VERSION", ...), i.e. the
   STRING "QNFO_VERSION" instead of the constant's value. That is the same
   two-sources-of-truth defect this file exists to fix, one level worse: the
   heartbeat row would have carried a constant's NAME as its version. Rev 4
   replaces the quoted literal, and asserts the post-condition textually.

G) POST-CONDITION GAP (rev 3 defect). Rev 3 verified that edits APPLIED but never
   that the RESULT was semantically correct, which is why (F) survived to commit.
   Rev 4 asserts the emitted text after every file: the widened VERSION_RE must
   actually match `var`/`let`/`const` forms, and the heartbeat must reference the
   bare identifier. A failed post-condition raises and writes nothing.

A) scripts/deploy-drift-guard.py classified a worker as DRIFT on ANY inequality
   between the repo VERSION constant and the live /health version. qnfo-lifecycle
   carries repo constant "1.6.2" and live /health "1.6.2-cronconsolidate", so it
   reported DRIFT forever -- while qnfo-lifecycle/worker.js and
   qnfo-lifecycle/deployed-current.worker.js are byte-identical (30293 B each,
   sha256 7d101b3cbca1b0d1...) and the live bundle is 30295 B: a 2-byte
   trailing-whitespace delta, NOT a live mutation. The guard's own docstring filed
   that under DEPLOY-UNLOGGED-MUTATION; that attribution is wrong and is corrected.
   FIX: a LABEL_MISMATCH class -- repo != live but cmp_ver() == 0 (numeric prefixes
   equal). Emitted in text and JSON, never counted toward the exit code, because a
   redeploy cannot change a label and the --content sha check remains the authority
   on whether the bytes differ.

B) scripts/raw_put.py extracted the deployed version with r'var VERSION = "([^"]+)"'.
   A worker using `const QNFO_VERSION = "..."` (qnfo-lifecycle, qnfo-memory-mcp)
   therefore landed in qnfo-audit.deployment_history with version_id="unknown" -- a
   null version in the very ledger DEPLOY-LEDGER-1 exists to keep honest.
   FIX: widen to the alternation the guard already uses, so the two tools cannot
   disagree about what version a worker is.

C) qnfo-lifecycle carried THREE sources of truth for one fact: /health answered from
   a hardcoded tag ("1.6.2-cronconsolidate"), the bundle constant said "1.6.2", and
   the scheduled() heartbeat stamped qnfo-audit.fleet_heartbeat with the literal
   "fabric-20260910" -- the only one of the three that actually reached the
   heartbeat table. That divergence is what made (A) fire.
   FIX: /health and the heartbeat both derive from QNFO_VERSION; the constant is
   bumped to the tag describing this build. Applied identically to worker.js and
   deployed-current.worker.js; the calling workflow asserts byte parity afterwards
   because mirror-guard flags a divergent pair.

FAIL-CLOSED: every edit requires exactly one match; a miss raises and NOTHING is
written for that file. Every file is re-parsed after patching; a failed
post-condition raises before anything is written. Re-running is a no-op.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
RAWPUT = os.path.join(ROOT, "scripts", "raw_put.py")
LIFECYCLE = [
    os.path.join(ROOT, "qnfo-lifecycle", "worker.js"),
    os.path.join(ROOT, "qnfo-lifecycle", "deployed-current.worker.js"),
]

NEW_VER = "1.6.3-version-sot"
OLD_VER = "1.6.2"
OLD_TAG = "1.6.2-cronconsolidate"
OLD_HB = "fabric-20260910"
OLD_HB_QUOTED = '"' + OLD_HB + '"'

# The widened extractor, assembled from chr(92) so that no escaping layer between
# this source and raw_put.py's bytes can double or drop a backslash.
_BS = chr(92)
VER_PATTERN = ("(?:var|let|const)" + _BS + "s+(?:QNFO_)?" + "VERSION"
               + _BS + "s*=" + _BS + 's*"([^"]+)"')
VER_LINE = "VERSION_RE = re.compile(r'" + VER_PATTERN + "')"


def _indent(s):
    return re.match(r"^(\s*)", s).group(1)


def _find_one(lines, pat, what, path):
    rx = re.compile(pat)
    hits = [i for i, s in enumerate(lines) if rx.search(s)]
    if len(hits) != 1:
        raise SystemExit(
            "FAIL-CLOSED: anchor %s matched %d lines in %s (need exactly 1)\nregex: %s"
            % (what, len(hits), path, pat)
        )
    return hits[0]


def patch_guard(text, path):
    lines = text.split("\n")

    # A1 -- docstring: DRIFT line becomes DRIFT + LABEL_MISMATCH description.
    if "LABEL_MISMATCH   repo VERSION" not in text:
        i = _find_one(lines, r"^\s*DRIFT\s+repo VERSION != live /health version",
                      "guard-A1", path)
        lines[i] = ("  DRIFT            repo VERSION != live /health version, "
                    "NUMERICALLY different")
        lines[i + 1:i + 1] = [
            "                   (reconcile required)",
            "  LABEL_MISMATCH   repo VERSION != live /health version but the NUMERIC prefix",
            "                   is equal (repo 1.6.2 vs live 1.6.2-cronconsolidate). Reported",
            "                   in text and JSON, NEVER fatal: a redeploy cannot change a",
            "                   label, and the repo artifact can be byte-identical to live.",
            "                   The --content sha check stays the authority on the bytes",
            "                   (issue 1370).",
        ]

    # A2 -- exit-code contract line.
    if "LABEL_MISMATCH is reported but NEVER fatal" not in text:
        i = _find_one(lines, r"^Exit: 0 clean \(scoped: SYNC only\)", "guard-A2", path)
        lines[i + 1:i + 1] = [
            "      LABEL_MISMATCH is reported but NEVER fatal (issue 1370).",
        ]

    # A3 -- accumulator initialisation.
    if "label_mismatch = []" not in text:
        i = _find_one(
            lines,
            r"^\s*not_deployed, sync_workers, live_err, no_health = \[\], \[\], \[\], \[\]\s*$",
            "guard-A3", path)
        lines[i + 1:i + 1] = [_indent(lines[i]) + "label_mismatch = []"]

    # A4 -- the classification branch, inserted BEFORE the plain `elif lv != rv:`
    # so a numerically-equal label never reaches the DRIFT class.
    if "label_mismatch.append(" not in text:
        i = _find_one(lines, r"^\s*elif lv != rv:\s*$", "guard-A4", path)
        ind = _indent(lines[i])
        lines[i:i + 1] = [
            ind + "elif lv != rv and cmp_ver(rv, lv) == 0:",
            ind + "    # LABEL_MISMATCH: identical numeric version, different build tag.",
            ind + "    # A redeploy cannot change a label, and --content is the authority",
            ind + "    # on whether the bytes actually differ (issue 1370).",
            ind + "    label_mismatch.append((d, worker, rv, lv))",
            ind + "elif lv != rv:",
        ]

    # A5 -- JSON output.
    if '"label_mismatch_count"' not in text:
        i = _find_one(lines, r'"no_health_route":', "guard-A5", path)
        ind = _indent(lines[i])
        lines[i + 1:i + 1] = [
            ind + '"label_mismatch": [{"worker": w, "dir": d, "repo": r, "live": l}',
            ind + '                   for d, w, r, l in label_mismatch],',
            ind + '"label_mismatch_count": len(label_mismatch),',
        ]

    # A6 -- text output.
    if "LABEL_MISMATCH {w}" not in text:
        i = _find_one(
            lines,
            r'print\(f"DRIFT \{w\} \(dir \{d\}\): repo=\{rv_\} live=\{lv_\}"\)',
            "guard-A6", path)
        ind = _indent(lines[i])
        lines[i + 1:i + 1] = [
            ind + "for d, w, rv_, lv_ in label_mismatch:",
            ind + '    print(f"LABEL_MISMATCH {w} (dir {d}): repo={rv_} live={lv_} '
                  '(numeric prefix equal)")',
        ]

    # A7 -- summary line (implicit string concatenation; indentation is free).
    if "label_mismatch={len(label_mismatch)}" not in text:
        i = _find_one(
            lines,
            r'print\(f"deploy-drift-guard\[\{tag\}\]: sync=\{len\(sync_workers\)\} '
            r'drift=\{len\(drift\)\}',
            "guard-A7", path)
        lines[i + 1:i + 1] = [
            _indent(lines[i]) + 'f"label_mismatch={len(label_mismatch)} "',
        ]

    # A8 -- keep LABEL_MISMATCH out of the exit code.
    if "label_mismatch is deliberately NOT counted" not in text:
        i = _find_one(lines, r"^\s*problems = len\(drift\) \+ len\(content_drift\)",
                      "guard-A8", path)
        ind = _indent(lines[i])
        lines[i:i] = [
            ind + "# label_mismatch is deliberately NOT counted: it is a labelling defect,",
            ind + "# not a deploy defect, and failing on it kept the gate permanently red",
            ind + "# for a worker whose bytes are identical to live (issue 1370).",
        ]

    out = "\n".join(lines)

    # G -- post-conditions: applied != correct.
    if "cmp_ver" not in out:
        raise SystemExit("FAIL-CLOSED: cmp_ver missing from " + path)
    if '"label_mismatch_count"' not in out:
        raise SystemExit("FAIL-CLOSED: label_mismatch JSON missing from " + path)
    if "LABEL_MISMATCH is reported but NEVER fatal" not in out:
        raise SystemExit("FAIL-CLOSED: exit-code contract missing from " + path)
    problems = [l for l in out.split("\n") if re.match(r"^\s*problems = len\(drift\)", l)]
    if len(problems) != 1 or "label_mismatch" in problems[0]:
        raise SystemExit("FAIL-CLOSED: problems expression wrong in " + path)
    return out


def patch_rawput(text, path):
    if "LEDGER-VERSION-EXTRACT-1" in text:
        return text
    lines = text.split("\n")
    i = _find_one(lines, r"^VERSION_RE = re\.compile\(r'var VERSION", "rawput-B1", path)
    lines[i:i + 1] = [
        "# LEDGER-VERSION-EXTRACT-1 (issue 1370): the old regex matched ONLY",
        '# `var VERSION = "..."`. A worker using `const QNFO_VERSION = "..."`',
        "# (qnfo-lifecycle, qnfo-memory-mcp) was recorded in deployment_history as",
        '# version_id="unknown" -- a null version in the ledger DEPLOY-LEDGER-1',
        "# exists to keep honest. Same alternation as deploy-drift-guard.py, so the",
        "# two tools cannot disagree about what version a worker is.",
        VER_LINE,
    ]
    out = "\n".join(lines)

    # G -- post-condition: the emitted regex must actually match all three forms.
    ns = {}
    exec(VER_LINE, ns)
    rx = ns["VERSION_RE"]
    for probe, want in (('var VERSION = "1.2.3";', "1.2.3"),
                        ('const QNFO_VERSION = "1.6.3-version-sot";', "1.6.3-version-sot"),
                        ('let VERSION = "9.9.9";', "9.9.9")):
        m = rx.search(probe)
        if not m or m.group(1) != want:
            raise SystemExit(
                "FAIL-CLOSED: widened VERSION_RE does not extract %r from %r in %s"
                % (want, probe, path))
    return out


def patch_lifecycle(text, path):
    lines = text.split("\n")

    # C1 -- bump the constant (anchored: "1.6.2" is a prefix of the old tag).
    if NEW_VER not in text:
        i = _find_one(lines, r'^const QNFO_VERSION = "' + re.escape(OLD_VER) + r'";\s*$',
                      "lifecycle-C1", path)
        lines[i] = 'const QNFO_VERSION = "%s";' % NEW_VER

    # C2 -- heartbeat literal -> constant. Replace the QUOTED literal (defect F):
    # replacing the bare text leaves the quotes and writes the string "QNFO_VERSION".
    if OLD_HB_QUOTED in text:
        lines = [s.replace(OLD_HB_QUOTED, "QNFO_VERSION") for s in lines]

    # C3 -- /health tag -> constant.
    if OLD_TAG in text:
        i = _find_one(lines, r'^\s*version: "' + re.escape(OLD_TAG) + r'",\s*$',
                      "lifecycle-C3", path)
        lines[i] = _indent(lines[i]) + "version: QNFO_VERSION,"

    out = "\n".join(lines)

    # G -- post-conditions.
    if OLD_HB in out:
        raise SystemExit("FAIL-CLOSED: heartbeat literal survived in " + path)
    if '"QNFO_VERSION"' in out:
        raise SystemExit("FAIL-CLOSED: heartbeat emitted the STRING \"QNFO_VERSION\" "
                         "instead of the identifier in " + path)
    if "QNFO_VERSION, new Date()" not in out:
        raise SystemExit("FAIL-CLOSED: heartbeat does not reference QNFO_VERSION in " + path)
    if 'const QNFO_VERSION = "%s";' % NEW_VER not in out:
        raise SystemExit("FAIL-CLOSED: version constant not bumped in " + path)
    if OLD_TAG in out:
        raise SystemExit("FAIL-CLOSED: hardcoded /health tag survived in " + path)
    return out


def patch_file(path, fn):
    if not os.path.isfile(path):
        raise SystemExit("FAIL-CLOSED: missing file " + path)
    with open(path, encoding="utf-8") as fh:
        orig = fh.read()
    new = fn(orig, path)
    if new == orig:
        print("already applied: " + path)
        return False
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(new)
    print("patched " + path)
    return True


def main():
    changed = []
    for path, fn in ((GUARD, patch_guard), (RAWPUT, patch_rawput)):
        if patch_file(path, fn):
            changed.append(path)
    for p in LIFECYCLE:
        if patch_file(p, patch_lifecycle):
            changed.append(p)
    print("CHANGED=" + ",".join(changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
