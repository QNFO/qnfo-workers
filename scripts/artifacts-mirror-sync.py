#!/usr/bin/env python3
"""ARTIFACTS-REDUNDANCY-1: mirror the checked-out source into Cloudflare Artifacts (namespace qnfo, repo fleet-artifacts).

A second, Cloudflare-hosted copy of the fleet source, so the code does not live in one place only. The mirror is a plain git
push of HEAD to one dedicated branch (default github-main) of the Artifacts repo, over the repo's own smart-HTTP remote.

Fail closed, never force:
  - no --force exists; a push the remote refuses (its branch holds commits the source does not) exits 2 and changes nothing;
  - the remote must be an https *.artifacts.cloudflare.net git URL (a local path only with --allow-local, for the offline suite);
  - after the push the branch is read back and must equal HEAD, else exit 3;
  - the repo-scoped write token comes from the ARTIFACTS_TOKEN environment variable (a repository secret), is handed to git
    through GIT_CONFIG_* (never argv, never a URL, never a file) and is scrubbed from everything printed. No token: the run
    says so as a warning and exits 0 without touching the remote (the secret is the owner's to set; --require turns that into exit 5).

Exit codes: 0 pushed, up to date or skipped without a token; 2 diverged or refused; 3 read-back mismatch; 4 refused remote; 5 token required.
"""
import argparse
import os
import re
import subprocess
import sys

ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID") or "edb167b78c9fb901ea5bca3ce58ccc4b"
DEFAULT_REMOTE = "https://%s.artifacts.cloudflare.net/git/qnfo/fleet-artifacts.git" % ACCOUNT_ID
REMOTE_RE = re.compile(r"^https://[a-z0-9-]+\.artifacts\.cloudflare\.net/git/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\.git$")


def scrub(text, token):
    if token:
        text = text.replace(token, "***")
        text = text.replace(token.split("?expires=")[0], "***")
    return text


def git(args, token, cwd, check=False):
    env = dict(os.environ)
    if token:
        env.update({
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "http.extraHeader",
            "GIT_CONFIG_VALUE_0": "Authorization: Bearer " + token,
        })
    env["GIT_TERMINAL_PROMPT"] = "0"
    p = subprocess.run(["git"] + args, cwd=cwd, env=env, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(scrub((p.stderr or p.stdout).strip(), token))
    return p


def remote_sha(remote, branch, token, cwd):
    p = git(["ls-remote", remote, "refs/heads/" + branch], token, cwd)
    if p.returncode != 0:
        raise RuntimeError(scrub((p.stderr or p.stdout).strip(), token))
    line = p.stdout.strip().split("\n")[0].strip()
    return line.split()[0] if line else None


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--remote", default=os.environ.get("ARTIFACTS_REMOTE") or DEFAULT_REMOTE)
    ap.add_argument("--branch", default=os.environ.get("ARTIFACTS_MIRROR_BRANCH") or "github-main")
    ap.add_argument("--source", default=".", help="the git work tree to mirror (default: the current directory)")
    ap.add_argument("--allow-local", action="store_true", help="accept a local path as the remote (offline suite only)")
    ap.add_argument("--require", action="store_true", help="exit 5 instead of skipping when ARTIFACTS_TOKEN is not set")
    a = ap.parse_args(argv)
    token = os.environ.get("ARTIFACTS_TOKEN", "").strip()
    cwd = a.source

    if not (REMOTE_RE.match(a.remote) or (a.allow_local and os.path.isdir(a.remote))):
        print("artifacts-mirror-sync: refused remote (not an https *.artifacts.cloudflare.net git URL)")
        return 4
    if not re.match(r"^[A-Za-z0-9._/-]+$", a.branch) or a.branch in ("main", "master"):
        print("artifacts-mirror-sync: refused branch name (a dedicated mirror branch is required, never main)")
        return 4
    if not token and not a.allow_local:
        msg = "ARTIFACTS_TOKEN is not set; the mirror was not pushed (a repo-scoped write token for fleet-artifacts is a repository secret)"
        if a.require:
            print("artifacts-mirror-sync: " + msg)
            return 5
        print("::warning title=artifacts-mirror-sync::" + msg)
        return 0

    try:
        head = git(["rev-parse", "HEAD"], None, cwd, check=True).stdout.strip()
        if git(["rev-parse", "--is-shallow-repository"], None, cwd).stdout.strip() == "true":
            print("artifacts-mirror-sync: the checkout is shallow; fetch full history (fetch-depth: 0) so ancestry can be proven")
            return 2
        remote = remote_sha(a.remote, a.branch, token, cwd)
        if remote == head:
            print("artifacts-mirror-sync: up to date at %s on %s" % (head[:12], a.branch))
            return 0
        if remote:
            known = git(["cat-file", "-e", remote + "^{commit}"], None, cwd).returncode == 0
            if not known or git(["merge-base", "--is-ancestor", remote, head], None, cwd).returncode != 0:
                print("artifacts-mirror-sync: refused: %s on the remote is not an ancestor of HEAD %s (diverged); nothing pushed, never forced" % (remote[:12], head[:12]))
                return 2
        p = git(["push", a.remote, "HEAD:refs/heads/" + a.branch], token, cwd)
        if p.returncode != 0:
            print("artifacts-mirror-sync: push refused: " + scrub((p.stderr or p.stdout).strip(), token)[-600:])
            return 2
        back = remote_sha(a.remote, a.branch, token, cwd)
        if back != head:
            print("artifacts-mirror-sync: read-back mismatch: remote %s, HEAD %s" % (back, head))
            return 3
        print("artifacts-mirror-sync: pushed %s to %s (was %s)" % (head[:12], a.branch, remote[:12] if remote else "empty"))
        return 0
    except RuntimeError as e:
        print("artifacts-mirror-sync: failed closed: " + str(e)[-600:])
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
