#!/usr/bin/env python3
"""artifacts_git_mirror.py -- ARTIFACTS-CANONICAL-SYNC-1 (repair primitive)

WHY A GIT PUSH AND NOT A RE-IMPORT
  Artifacts' import route refuses an existing repo (10201) and the only refresh route is
  DELETE + IMPORT. Measured 2026-10-18 on qnfo/qnfo-workers: the delete+import pair left the
  repository unavailable for >2.5 minutes (10302 "currently being imported and is not yet
  available") and re-transfers every object, even though only a few commits differ. A delta push
  from a mirror clone is seconds, keeps the repository continuously readable, and updates tags.

HOW A TOKEN IS OBTAINED
  Artifacts Git tokens are repo-scoped, so a 130-repo mirror cannot use one long-lived token.
  This script mints a short-lived write token per repository through the control plane
  (POST /artifacts/namespaces/:ns/tokens {repo, scope, ttl}) and never stores it.

USAGE
  python scripts/artifacts_git_mirror.py --namespace qnfo --repo license
  python scripts/artifacts_git_mirror.py --namespace qnfo --repo license --owner QNFO --branch main
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

CF = "https://api.cloudflare.com/client/v4"


def http(url, token, method="GET", body=None, timeout=60):
    import urllib.error
    import urllib.request
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "qnfo-artifacts-git-mirror/1.0")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}
    except Exception as e:
        return 0, {"error": str(e)}


def scrub(s, *secrets):
    out = str(s)
    for sec in secrets:
        if sec:
            out = out.replace(sec, "<token>")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--namespace", required=True)
    ap.add_argument("--repo", required=True, help="Artifacts repo name")
    ap.add_argument("--github-repo", default="", help="GitHub repo name if it differs (.github -> dot-github)")
    ap.add_argument("--owner", default="QNFO")
    ap.add_argument("--branch", default="")
    ap.add_argument("--ttl", type=int, default=1800)
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()

    cf = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
    acct = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID")
    gh = os.environ.get("GITHUB_TOKEN")
    if not (cf and acct and gh):
        print(json.dumps({"ok": False, "error": "need CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_TOKEN"}))
        return 3

    gh_repo = args.github_repo or args.repo
    gh_url = "https://x-access-token:%s@github.com/%s/%s.git" % (gh, args.owner, gh_repo)
    art_host = "%s.artifacts.cloudflare.net" % acct

    st, j = http(CF + "/accounts/" + acct + "/artifacts/namespaces/" + args.namespace + "/tokens",
                 cf, "POST", {"repo": args.repo, "scope": "write", "ttl": args.ttl})
    if st not in (200, 201):
        print(json.dumps({"ok": False, "step": "mint_token", "status": st,
                          "detail": scrub(json.dumps(j.get("errors") or j), gh, cf)[:300]}))
        return 3
    # The control plane answers with `plaintext` (createToken's field name); `token` is what
    # create()/import()/fork() return. Accept either so a shape change is not a silent failure.
    res = j.get("result") or {}
    tok = res.get("plaintext") or res.get("token")
    if not tok:
        print(json.dumps({"ok": False, "step": "mint_token", "status": st,
                          "detail": "no token in control-plane response: " + str(sorted(res.keys()))}))
        return 3
    # The token carries `?expires=<epoch>`; placed raw in the URL the `?` is read as the start of a
    # query string and git rejects the host ("Port number was not a decimal number").
    import urllib.parse as _up
    art_url = "https://x:%s@%s/git/%s/%s.git" % (_up.quote(tok, safe=""), art_host, args.namespace, args.repo)

    work = tempfile.mkdtemp(prefix="art-mirror-")
    clone = os.path.join(work, "repo.git")
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    try:
        r = subprocess.run(["git", "clone", "--mirror", "--quiet", gh_url, clone],
                           capture_output=True, text=True, timeout=900, env=env)
        if r.returncode != 0:
            print(json.dumps({"ok": False, "step": "clone", "detail": scrub(r.stderr, gh, cf, tok)[-400:]}))
            return 3

        pushed_ref = None
        if args.branch:
            r = subprocess.run(["git", "-C", clone, "symbolic-ref", "HEAD",
                                "refs/heads/" + args.branch], capture_output=True, text=True, env=env)

        r = subprocess.run(["git", "-C", clone, "push", "--mirror", "--quiet", art_url],
                           capture_output=True, text=True, timeout=900, env=env)
        if r.returncode != 0:
            print(json.dumps({"ok": False, "step": "push", "detail": scrub(r.stderr, gh, cf, tok)[-400:]}))
            return 3

        head = subprocess.run(["git", "-C", clone, "rev-parse", "HEAD"],
                              capture_output=True, text=True, env=env).stdout.strip()
        pushed_ref = head
        print(json.dumps({"ok": True, "namespace": args.namespace, "repo": args.repo,
                          "github": args.owner + "/" + gh_repo, "head": pushed_ref,
                          "pushed": "mirror"}))
        return 0
    finally:
        if not args.keep:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
