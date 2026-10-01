#!/usr/bin/env python3
"""Stop hook: re-prompt the session while actionable open items remain (>0).

Open = GitHub issues not carrying a rolling-report label (fleet-autoaudit,
fleet-drain-routine) + non-SYNC classes in the newest audits/fleet-autoaudit-*.json
(DRIFT / CONTENT_DRIFT / LIVE_ERR / NO_*_VERSION). Exit 2 + stderr = Claude continues.
Loop-capped (MAX_ROUNDS consecutive blocks) so a blocked owner-decision item cannot spin forever.
Fails open: any error -> exit 0.
"""
import glob, json, os, sys, urllib.request

MAX_ROUNDS = int(os.environ.get("DRAIN_MAX_ROUNDS", "8"))
REPO = os.environ.get("DRAIN_REPO", "QNFO/qnfo-workers")
REPORT_LABELS = {"fleet-autoaudit", "fleet-drain-routine"}
BAD = ("DRIFT", "CONTENT_DRIFT", "LIVE_ERR", "NO_REPO_VERSION", "NO_LIVE_VERSION")
root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
counter = os.path.join(os.environ.get("TMPDIR", "/tmp"), "qnfo-drain-rounds")

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
        out.append(f"#{i['number']} {i['title']}")
    return out

def audit():
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
