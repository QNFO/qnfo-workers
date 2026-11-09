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


AGENT_BRANCH = re.compile(r"^(codeagent-|ccr-|claude/|fleet-artifacts)[A-Za-z0-9._/-]*$")  # safe charset: the name is embedded in a probe command
BRANCH_IDLE_DAYS = 7


def branch_findings(branches, pr_heads, now=None):
    """COMPANION-BRANCHES-1: agent branches that no open PR uses and that sat idle for BRANCH_IDLE_DAYS are deletion decisions.
    `branches` is [{name, date}] (date = last commit, ISO 8601); `pr_heads` are the head names of open PRs (the allowlist)."""
    import datetime
    now = now or datetime.datetime.now(datetime.timezone.utc)
    out = []
    for b in branches:
        n = b.get("name", "")
        if not AGENT_BRANCH.match(n) or n in pr_heads or not b.get("date"):
            continue
        age = (now - datetime.datetime.fromisoformat(b["date"].replace("Z", "+00:00"))).days
        if age >= BRANCH_IDLE_DAYS:
            out.append({"kind": "stale-branch", "key": f"branch:{n}", "title": f"FLEET-AUDIT stale-branch: {n}",
                        "detail": f"Agent branch `{n}` has no open PR and has been idle {age} days (COMPANION-BRANCHES-1).",
                        "probe": f"gh api repos/OWNER/REPO/branches/{n} (404 once the branch is deleted)"})
    return out


UNREACHABLE = []


def gh_pages(path, max_pages=10):
    """All pages of a list endpoint (per_page=100), so an item past the first 100 is not missed."""
    out = []
    for n in range(1, max_pages + 1):
        page = gh_json([f"{path}{'&' if '?' in path else '?'}per_page=100&page={n}"])
        if not isinstance(page, list):
            break
        out += page
        if len(page) < 100:
            break
    return out


def gh_json(args):
    r = subprocess.run(["gh", "api", *args], capture_output=True, text=True)
    if r.returncode != 0:
        UNREACHABLE.append(args[0].split("?")[0])
        return []
    return json.loads(r.stdout) if r.stdout.strip() else []


DEFAULT_REPOS = ["QNFO/qnfo-workers", "QNFO/qnfo-research", "QNFO/.github", "QNFO/qnfo-fleet-issues", "rwnq8/qnfo-fleet-dashboard", "rwnq8/ipatent", "rwnq8/rwnq8"]


def tag(findings, repo, hub):
    """Findings from a repo other than the hub carry the repo in key and title so the hub issue says where to look."""
    for f in findings:
        f["repo"] = repo
        if repo != hub:
            f["key"] = f"{repo}{f['key']}" if f["key"].startswith(("#", "PR#")) else f["key"]
            f["title"] = f["title"].replace("FLEET-AUDIT ", f"FLEET-AUDIT [{repo}] ", 1)
            f["probe"] = f["probe"].replace("gh issue view", f"gh issue view --repo {repo}").replace("gh pr view", f"gh pr view --repo {repo}")
    return findings


def repo_findings(repo, hub):
    """Loop and PR checks for any repo the token can read; (findings, reachable)."""
    issues = gh_json([f"repos/{repo}/issues?labels=loop&state=open&per_page=100"])
    prs = gh_json([f"repos/{repo}/pulls?state=open&per_page=100"])
    heads = {(p.get("head") or {}).get("ref") for p in gh_pages(f"repos/{repo}/pulls?state=open")}
    cands = [b for b in gh_pages(f"repos/{repo}/branches") if AGENT_BRANCH.match(b.get("name", "")) and b["name"] not in heads]
    dated = []
    for b in cands:
        c = gh_json([f"repos/{repo}/commits/{b['commit']['sha']}"])
        d = (((c or {}).get("commit") or {}).get("committer") or {}).get("date") if isinstance(c, dict) else None
        if not d:
            UNREACHABLE.append(f"repos/{repo}/commits/{b['name']}")  # a failed fetch is reported, not silently skipped
        dated.append({"name": b["name"], "date": d})
    return tag(loop_findings(issues) + pr_findings(prs) + branch_findings(dated, heads), repo, hub)


def collect(root="."):
    files = {}
    for pat in ("AGENTS.md", "CLAUDE.md", "docs/handoff/*.md"):
        for p in glob.glob(os.path.join(root, pat)):
            files[os.path.relpath(p, root)] = open(p, encoding="utf-8", errors="replace").read()
    findings = claim_findings(files, lambda c: os.path.exists(os.path.join(root, c)))
    repo = os.environ.get("GITHUB_REPOSITORY", "QNFO/qnfo-workers")
    tag(findings, repo, repo)
    repos = [r for r in os.environ.get("AUDIT_REPOS", " ".join(DEFAULT_REPOS)).split() if r]
    for r in repos:
        findings += repo_findings(r, repo)
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
        print(json.dumps({**file_and_close(findings, repo), "unreachable": sorted(set(UNREACHABLE))}), file=sys.stderr)
    else:
        print(json.dumps({"open_findings": len(findings), "unreachable": sorted(set(UNREACHABLE))}), file=sys.stderr)
    sys.exit(1 if findings and "--file" not in sys.argv else 0)
