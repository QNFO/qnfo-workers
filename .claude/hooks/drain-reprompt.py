#!/usr/bin/env python3
"""Stop hook: re-prompt the session while actionable open items remain (>0).

Open = GitHub issues not carrying a rolling-report label (fleet-autoaudit,
fleet-drain-routine) + non-SYNC classes in the newest audits/fleet-autoaudit-*.json
(DRIFT / CONTENT_DRIFT / LIVE_ERR / NO_*_VERSION). Exit 2 + stderr = Claude continues.
Loop-capped (MAX_ROUNDS consecutive blocks) so a blocked owner-decision item cannot spin forever.
FIX-IN-OPEN-PR-1 (2026-10-02): an item whose fix already sits in an open PR waits on a merge, not on remediation,
so it is not re-prompted: an issue whose number an open PR's title or body cites (#N), and a DRIFT row whose
repo-ahead worker directory an open PR touches. Without this a session was re-prompted 16 times for #451/#452 and
autoaudit #52 while their fix (PR #453) only waited on the owner's merge.
Fails open: any error -> exit 0.
"""
import glob, json, os, re, sys, urllib.request

MAX_ROUNDS = int(os.environ.get("DRAIN_MAX_ROUNDS", "8"))
REPO = os.environ.get("DRAIN_REPO", "QNFO/qnfo-workers")
REPORT_LABELS = {"fleet-autoaudit", "fleet-drain-routine"}
BAD = ("DRIFT", "CONTENT_DRIFT", "LIVE_ERR", "NO_REPO_VERSION", "NO_LIVE_VERSION")
root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
counter = os.path.join(os.environ.get("TMPDIR", "/tmp"), "qnfo-drain-rounds")

def _get(path):
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/{path}",
        headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json", "User-Agent": "qnfo-drain-hook"})
    return json.load(urllib.request.urlopen(req, timeout=10))

_PRS = None

def open_prs():
    """[(number, title + body, set of top-level dirs it touches)] for up to 30 open PRs; [] on any error."""
    global _PRS
    if _PRS is not None:
        return _PRS
    _PRS = []
    try:
        if not (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")):
            return _PRS
        for pr in _get("pulls?state=open&per_page=30"):
            dirs = set()
            try:
                dirs = {f["filename"].split("/")[0] for f in _get(f"pulls/{pr['number']}/files?per_page=100")}
            except Exception:
                pass
            _PRS.append((pr["number"], (pr.get("title") or "") + "\n" + (pr.get("body") or ""), dirs))
    except Exception:
        _PRS = []
    return _PRS

def fixed_by_open_pr(issue_number=None, worker_dirs=()):
    for num, text, dirs in open_prs():
        if issue_number is not None and re.search(r"#%d\b" % issue_number, text):
            return num
        if worker_dirs and set(worker_dirs) & dirs:
            return num
    return None

def issues():
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not tok:
        return []
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/issues?state=open&per_page=100",
        headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json", "User-Agent": "qnfo-drain-hook"})
    out = []
    for i in json.load(urllib.request.urlopen(req, timeout=10)):
        if "pull_request" in i:
            continue
        if {l["name"] for l in i.get("labels", [])} & REPORT_LABELS:
            continue
        if fixed_by_open_pr(issue_number=i["number"]):
            continue
        out.append(f"#{i['number']} {i['title']}")
    return out

def live_audit():
    """Class table of the live fleet-autoaudit issue; None if unavailable (artifact file lags it)."""
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not tok:
        return None
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/issues?state=open&labels=fleet-autoaudit&per_page=1",
        headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json", "User-Agent": "qnfo-drain-hook"})
    rows = json.load(urllib.request.urlopen(req, timeout=10))
    if not rows:
        return None
    body = rows[0].get("body") or ""
    # Repo-ahead rows read "- `worker` (dir `dir`) repo `x` > live `y`": a DRIFT whose every repo-ahead dir is touched by
    # an open PR waits on that PR's merge and deploy.
    ahead = re.findall(r"\(dir `([^`]+)`\)", body.split("## Repo-ahead", 1)[1]) if "## Repo-ahead" in body else []
    out = []
    for line in body.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 2 and cells[0] in BAD and cells[1].isdigit() and int(cells[1]) > 0:
            if cells[0] == "DRIFT" and ahead and int(cells[1]) <= len(ahead) and all(fixed_by_open_pr(worker_dirs=[d]) for d in ahead):
                continue
            out.append(f"autoaudit #{rows[0]['number']}: {cells[1]} x {cells[0]}")
    return out

def audit():
    try:
        live = live_audit()
        if live is not None:
            return live
    except Exception:
        pass
    fs = sorted(glob.glob(os.path.join(root, "audits", "fleet-autoaudit-2*.json")))
    if not fs:
        return []
    rows = json.load(open(fs[-1])).get("rows", {})
    return [f"{k}: {v.get('note')}" for k, v in rows.items() if str(v.get("note", "")).startswith(BAD)]

try:
    items = []
    for f in (issues, audit):
        try:
            items += f()
        except Exception:
            pass
    n = int(open(counter).read() or 0) if os.path.exists(counter) else 0
    if not items:
        if os.path.exists(counter):
            os.remove(counter)
        sys.exit(0)
    if n >= MAX_ROUNDS:
        os.remove(counter)
        sys.exit(0)
    open(counter, "w").write(str(n + 1))
    sys.stderr.write(f"{len(items)} open item(s) remain (round {n+1}/{MAX_ROUNDS}); continue remediating, commit and push:\n"
                     + "\n".join(items[:20]) + "\n")
    sys.exit(2)
except SystemExit:
    raise
except Exception:
    sys.exit(0)
