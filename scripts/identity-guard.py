#!/usr/bin/env python3
"""identity-guard (IDENTITY-GUARD-1, 2026-10-01).

Fails when a live worker's source carries a retired identity label or a claim the public record does not support
(docs/STRATEGY.md s2.1 and s2.2, "Claims we never make"; the owner's Identity doc, "What to stop signalling").
These strings reached public pages, paper metadata and profiles before, and a background check fails on them.

Scope: text files in worker directories that are not RETIRED or FOLDED, excluding deployed-current.worker.js (a mirror
of worker.js), *.test.mjs and *.fixture.json (recorded external data, e.g. a GitHub project name as read on a date).
2026-10-02: also QNFO described as "a research collective/foundation/group/program" in running text (the cold-email
template carried it), and the misspelling JPCub. Skipped on purpose:
  * comment lines (//, /*, *, #): rationale text may name what it removes;
  * lines that define a detector (regex literals with flags, RegExp(, .test(, .match(): the review gates must be able
    to name the claims they block;
  * any line carrying the marker `identity-guard: allow`.
Exit 1 with one line per finding; exit 0 otherwise.
"""
import os
import re
import sys

PATTERNS = [
    (re.compile(r"Quniverse Research Foundation", re.I), "retired label (Quniverse Research Foundation)"),
    (re.compile(r"QNFO Research (Collective|Foundation)", re.I), "retired label (QNFO Research Collective/Foundation)"),
    (re.compile(r"QNFO\s*(--|—|-)\s*Research Foundation", re.I), "retired label (QNFO - Research Foundation)"),
    (re.compile(r"QNFO,?\s+(is\s+)?an?\s+(open\s+)?research\s+(collective|foundation|group|program)\b", re.I), "retired label (QNFO as a research collective/foundation/group/program; STRATEGY 2.1: an independent research imprint)"),
    (re.compile(r"\bJPCub\b"), "misspelt benchmark name (JPCub; the name is JPCUB)"),
    (re.compile(r"patent portfolio|patents developed|foundational (US )?patents", re.I), "patent claim without application numbers"),
    (re.compile(r"clearance[- ]eligible", re.I), "clearance-eligible claim"),
    (re.compile(r"featured in national media", re.I), "unlinked media claim"),
    (re.compile(r"thermodynamic dead end", re.I), "physics headline claim"),
    (re.compile(r"\b(649|891)\+\s*(publications|papers|records)", re.I), "shifting publication count"),
]
COMMENT = re.compile(r"^\s*(//|/\*|\*|#)")
DETECTOR = re.compile(r"/[gimsuy]{1,4}\s*[,\])]|RegExp\(|\.test\(|\.match\(")
ALLOW = "identity-guard: allow"
TEXT_EXT = (".js", ".mjs", ".ts", ".html", ".md", ".json", ".txt", ".toml", ".css", ".svg")


def live_worker_dirs(root):
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d)
        if not os.path.isdir(p) or d.startswith("."):
            continue
        if not (os.path.exists(os.path.join(p, "worker.js")) or os.path.exists(os.path.join(p, "wrangler.toml"))):
            continue
        if os.path.exists(os.path.join(p, "RETIRED")) or os.path.exists(os.path.join(p, "FOLDED")):
            continue
        yield p


def scan_file(path):
    out = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for n, line in enumerate(f, 1):
                if ALLOW in line or COMMENT.match(line) or DETECTOR.search(line):
                    continue
                for rx, why in PATTERNS:
                    m = rx.search(line)
                    if m:
                        out.append((path, n, why, m.group(0)))
    except OSError:
        pass
    return out


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    findings = []
    for wd in live_worker_dirs(root):
        for dirpath, dirnames, filenames in os.walk(wd):
            dirnames[:] = [x for x in dirnames if x not in ("node_modules", ".wrangler", "dist")]
            for fn in filenames:
                if fn == "deployed-current.worker.js" or fn.endswith((".test.mjs", ".fixture.json")) or not fn.endswith(TEXT_EXT):
                    continue
                findings += scan_file(os.path.join(dirpath, fn))
    for path, n, why, hit in findings:
        print(f"IDENTITY-GUARD-1 FAIL {os.path.relpath(path, root)}:{n}: {why}: {hit!r}")
    if findings:
        print(f"{len(findings)} finding(s). Use the STRATEGY-1 wording, or mark a line that must name the claim with "
              f"'{ALLOW}'.")
        return 1
    print("IDENTITY-GUARD-1 PASS: no retired labels or unsupported claims in live worker sources")
    return 0


if __name__ == "__main__":
    sys.exit(main())
