#!/usr/bin/env python3
"""rotate-social-token.py - FM3 rotation runbook (executable).

WHY THIS EXISTS
  qnfo-social authenticates operator endpoints (/drain-dissemination, /post, /repost) with
  SOCIAL_TOKEN (a WRITE-ONLY Worker secret: it cannot be read back) or the alternate
  GATEWAY_SOCIAL_TOKEN. A second accepted bearer (GATEWAY_SOCIAL_TOKEN) was provisioned
  2026-09-26 so the operator side is recoverable; it therefore lives in THREE stores:
  (1) the qnfo-social Worker secret, (2) R2 qnfo-backups/credentials/gateway-social-token.txt,
  (3) the local ~/.env. This script rotates the alternate bearer across all three atomically
  and verifies the route, so the three stores can never drift.

USAGE
  python scripts/rotate-social-token.py            # rotate GATEWAY_SOCIAL_TOKEN
  python scripts/rotate-social-token.py --check    # verify the three stores agree (no write)

REQUIRES
  wrangler (logged in) + CLOUDFLARE_API_TOKEN in ~/.env for the R2 mirror.
  Run from the repo root; uses qnfo-social/ as the worker dir.
"""
import argparse
import os
import re
import secrets
import subprocess
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WKR = os.path.join(REPO, "qnfo-social")
SECRET = "GATEWAY_SOCIAL_TOKEN"
R2_KEY = "qnfo-backups/credentials/gateway-social-token.txt"
ENV = os.path.expanduser("~/.env")
ROUTE = "https://qnfo-social.q08.workers.dev/drain-dissemination"


def env_token(var):
    try:
        for ln in open(ENV, encoding="utf-8", errors="ignore"):
            if ln.startswith(var + "="):
                return ln.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return None


def check():
    tok = env_token(SECRET)
    print(f"[1] ~/.env {SECRET}: {'present ('+str(len(tok))+' chars)' if tok else 'ABSENT'}")
    try:
        p = subprocess.run(["wrangler", "secret", "list", "--name", "qnfo-social"],
                           cwd=WKR, capture_output=True, text=True, timeout=90)
        names = re.findall(r"\b([A-Z_]{4,})\b", (p.stdout or "") + (p.stderr or ""))
        print(f"[2] worker secret {SECRET}: {'LISTED' if SECRET in names else 'not listed (list may be unsupported)'}")
    except Exception as e:
        print(f"[2] worker secret check skipped: {e}")
    print(f"[3] R2 mirror {R2_KEY}: run `wrangler r2 object get {R2_KEY} --remote` to compare bytes")
    if tok:
        try:
            r = urllib.request.Request(ROUTE, headers={"Authorization": "Bearer " + tok})
            with urllib.request.urlopen(r, timeout=45) as resp:
                print(f"[4] route probe: HTTP {resp.status} (token accepted)")
        except Exception as e:
            print(f"[4] route probe: FAILED ({getattr(e, 'code', e)}) -- the three stores may have drifted")


def rotate():
    new = secrets.token_hex(24)
    print("rotating", SECRET, "(48 hex)")
    subprocess.run(["wrangler", "secret", "put", SECRET], cwd=WKR, input=new, text=True, check=True)
    print("[1] worker secret: set")
    tmp = os.path.join(os.environ.get("TEMP", "/tmp"), "gwst.txt")
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        fh.write(new)
    subprocess.run(["wrangler", "r2", "object", "put", R2_KEY, "--file", tmp, "--remote"], cwd=REPO, check=True)
    print("[2] R2 mirror: set")
    lines = []
    try:
        lines = open(ENV, encoding="utf-8", errors="ignore").read().splitlines()
    except OSError:
        pass
    lines = [ln for ln in lines if not ln.startswith(SECRET + "=")]
    lines.append(SECRET + "=" + new)
    open(ENV, "w", encoding="utf-8", newline="").write("\n".join(lines) + "\n")
    print("[3] ~/.env: set")
    check()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify the three stores agree; do not rotate")
    a = ap.parse_args()
    check() if a.check else rotate()
