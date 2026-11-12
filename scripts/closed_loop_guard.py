#!/usr/bin/env python3
"""CLOSED-LOOP-1 (owner directive 2026-11-12): a pull request may not add a wait on a person.

Owner, verbatim in substance: "Never assume that anything is needed externally ... Don't ever assume that anything will ever be reviewed
... Stop creating all of this stuff that is not getting consumed by its own loops, like documents and owner decisions." So an added line
that parks work for a person to read, review, approve or decide fails the pull request, and so does a migration that inserts a
human_actions card without an IDENTITY-BOUND: line (credential, money, legal signature, the owner's own account). Orphan documents are
DOC-IS-CODE-1's job (scripts/doc_audit.py); this guard covers the waits.

  python3 scripts/closed_loop_guard.py --files pr-files.json   # the JSON of GET /pulls/{n}/files (with patch); exit 1 on a finding
"""
import json, re, sys

WAIT = [re.compile(p, re.I) for p in (
    r"\b(owner|person|human|rowan|maintainer)\b[^.;]{0,30}\b(must|should|needs? to|will|to)\s+(review|approve|decide|read|confirm|sign off)\b",
    r"\bawait(s|ing)?\s+(an?\s+)?(owner|human|manual)?\s*(approval|review|decision|sign-?off)\b",
    r"\b(manual|human)\s+(review|approval)\s+(required|needed|gate|step)\b",
    r"\bfor (the )?(owner|human|person|rowan) to (read|review|decide|approve|pick|choose)\b",
    r"\bpending (owner|human) (review|approval|decision)\b",
)]
NEGATION = re.compile(r"\b(never|no|not|without|don't|do not|nothing|assume nothing|instead of|retired?|removes?|replaces?)\b", re.I)
EXEMPT = ("scripts/closed_loop_guard.py", "scripts/closed_loop_guard.test.mjs", "CLAUDE.md", "AGENTS.md", "docs/DOCTRINE-KERNEL.md",
          "docs/AUTONOMOUS-OPERATION-DOCTRINE.md")
TEXT = re.compile(r"\.(js|mjs|cjs|ts|py|sql|sh|ya?ml|toml|md|json|html)$")


def findings(files):
    out = []
    for f in files:
        name, patch = f.get("filename", ""), f.get("patch") or ""
        if name in EXEMPT or not TEXT.search(name) or f.get("status") == "removed":
            continue
        added = [l[1:] for l in patch.splitlines() if l.startswith("+") and not l.startswith("+++")]
        for l in added:
            if NEGATION.search(l) or "IDENTITY-BOUND" in l:
                continue
            for r in WAIT:
                m = r.search(l)
                if m:
                    out.append(f"{name}: adds a wait on a person ('{m.group(0)}'). Close the loop in code: an automated default, a check and a rollback (CLOSED-LOOP-1)")
                    break
        if name.startswith("migrations/") and name.endswith(".sql"):
            body = "\n".join(added)
            if re.search(r"INSERT\s+(OR\s+\w+\s+)?INTO\s+human_actions\b", body, re.I) and "IDENTITY-BOUND:" not in body:
                out.append(f"{name}: inserts a human_actions card without an IDENTITY-BOUND: line; only a credential, money, a legal signature or the owner's own account waits on the owner (CLOSED-LOOP-1)")
    return out


def main(argv):
    if "--files" not in argv:
        print(__doc__); return 2
    files = json.load(open(argv[argv.index("--files") + 1]))
    if isinstance(files, list) and files and isinstance(files[0], list):  # gh --paginate --slurp
        files = [x for page in files for x in page]
    bad = findings(files)
    for b in bad:
        print("FAIL", b)
    print(f"closed-loop-guard: {len(files)} file(s), {len(bad)} wait(s) on a person")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
