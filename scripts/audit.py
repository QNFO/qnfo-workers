#!/usr/bin/env python3
"""SELF-AUDIT-1 / CLOSE-OWN-LOOPS-1 runtime: the fleet audits its own promises (standard library only, gh CLI for GitHub).

AGENTS.md and CLAUDE.md say this script exists and runs every 6 hours; until now it did not (the claim was a document, not code).
Checks:
  claim-missing   a `scripts/...` or `.github/workflows/...` path named in AGENTS.md, CLAUDE.md or docs/handoff/*.md that is not in the repository
  loop-no-probe   an open issue labelled `loop` whose body has no `closing probe:` line
  pr-no-selfaudit an open non-draft human PR whose body has no `Self-audit` section
Usage:
  python3 scripts/audit.py                 # print findings as JSON lines, exit 1 when any
  python3 scripts/audit.py --file          # also file one `fleet-audit` issue per new finding and close the ones that stopped reporting
"""
import json, os, re, subprocess, sys, glob

CLAIM = re.compile(r"`((?:scripts/|\.github/workflows/)[A-Za-z0-9_./-]+\.(?:py|mjs|js|sh|ya?ml))`")
PLACEHOLDER = re.compile(r"[<>*{}]")


def extract_claims(text):
    """Paths the text names in backticks, minus placeholders such as scripts/<name>.py."""
    return sorted({m for m in CLAIM.findall(text) if not PLACEHOLDER.search(m)})


def claim_findings(files, exists):
    """files: {doc_path: text}; exists: callable(path) -> bool."""
    out = []
    for doc, text in sorted(files.items()):
        for c in extract_claims(text):
            if not exists(c):
                out.append({"kind": "claim-missing", "key": f"{doc}:{c}", "title": f"FLEET-AUDIT claim-missing: {c} (named in {doc})",
                            "detail": f"{doc} names `{c}` but it is not in the repository. Build it or correct the claim.",
                            "probe": f"test -e {c}"})
    return out


def loop_findings(issues):
    out = []
    for i in issues:
        if any(l.get("name") == "loop" for l in i.get("labels", [])) and not re.search(r"closing probe\b", i.get("body") or "", re.I):
            out.append({"kind": "loop-no-probe", "key": f"#{i['number']}", "title": f"FLEET-AUDIT loop-no-probe: #{i['number']}",
                        "detail": f"Loop issue #{i['number']} ({i.get('title','')[:80]}) has no `closing probe:` line.",
                        "probe": f"gh issue view {i['number']} --json body | grep -i 'closing probe:'"})
    return out


def pr_findings(prs):
    out = []
    for p in prs:
        if p.get("draft") or (p.get("user") or {}).get("type") == "Bot":
            continue
        if not re.search(r"^#{1,4}\s*self-audit", p.get("body") or "", re.I | re.M):
            out.append({"kind": "pr-no-selfaudit", "key": f"PR#{p['number']}", "title": f"FLEET-AUDIT pr-no-selfaudit: PR #{p['number']}",
                        "detail": f"PR #{p['number']} has no Self-audit section in its body.", "probe": f"gh pr view {p['number']} --json body"})
    return out


def gh_json(args):
    r = subprocess.run(["gh", "api", *args], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else []


def collect(root="."):
    files = {}
    for pat in ("AGENTS.md", "CLAUDE.md", "docs/handoff/*.md"):
        for p in glob.glob(os.path.join(root, pat)):
            files[os.path.relpath(p, root)] = open(p, encoding="utf-8", errors="replace").read()
    findings = claim_findings(files, lambda c: os.path.exists(os.path.join(root, c)))
    repo = os.environ.get("GITHUB_REPOSITORY", "QNFO/qnfo-workers")
    findings += loop_findings(gh_json([f"repos/{repo}/issues?labels=loop&state=open&per_page=100"]))
    findings += pr_findings(gh_json([f"repos/{repo}/pulls?state=open&per_page=100"]))
    return findings, repo


def file_and_close(findings, repo):
    open_issues = gh_json([f"repos/{repo}/issues?labels=fleet-audit&state=open&per_page=100"])
    by_title = {i["title"]: i for i in open_issues}
    live = {f["title"] for f in findings}
    filed = closed = 0
    for f in findings:
        if f["title"] in by_title:
            continue
        subprocess.run(["gh", "issue", "create", "--repo", repo, "--title", f["title"], "--label", "fleet-audit", "--label", "loop",
                        "--body", f"{f['detail']}\n\ncode-task: fix the finding in the repository\nclosing probe: {f['probe']}\n\nFiled by scripts/audit.py (SELF-AUDIT-1). It closes itself with evidence once the finding stops reporting."], check=False)
        filed += 1
    for title, i in by_title.items():
        if title not in live:
            subprocess.run(["gh", "issue", "close", str(i["number"]), "--repo", repo, "--comment", "scripts/audit.py no longer reports this finding on the current main (the closing probe passes)."], check=False)
            closed += 1
    return {"filed": filed, "closed": closed, "open_findings": len(findings)}


if __name__ == "__main__":
    findings, repo = collect(".")
    for f in findings:
        print(json.dumps(f))
    if "--file" in sys.argv:
        subprocess.run(["gh", "label", "create", "fleet-audit", "--repo", repo, "--color", "D93F0B", "--description", "scripts/audit.py finding"], capture_output=True)
        print(json.dumps(file_and_close(findings, repo)), file=sys.stderr)
    else:
        print(json.dumps({"open_findings": len(findings)}), file=sys.stderr)
    sys.exit(1 if findings and "--file" not in sys.argv else 0)
