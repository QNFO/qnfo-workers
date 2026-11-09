#!/usr/bin/env python3
"""COMPANION-REGRESSION-1: three-way merge the live companion (KV companion-v3/personal-api.1.23.2) into personal-api/worker.js.
base = KV pre-1.19.0 (what the companion was patched from), ours = repo worker.js, theirs = KV 1.23.2.
Writes worker.js + deployed-current.worker.js; exits 1 on conflicts (leaves markers out, prints count)."""
import os, subprocess, sys, tempfile, urllib.request
ACCT = os.environ["CLOUDFLARE_ACCOUNT_ID"]; TOK = os.environ["CLOUDFLARE_API_TOKEN"]
NS = "d3768b93a76640be83151b00a8b42717"
def kv(key):
    u = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/storage/kv/namespaces/{NS}/values/" + urllib.parse.quote(key, safe="")
    r = urllib.request.Request(u, headers={"Authorization": "Bearer " + TOK})
    return urllib.request.urlopen(r, timeout=120).read()
import urllib.parse
d = tempfile.mkdtemp()
paths = {}
for name, key in (("base", "companion-v3/personal-api.pre-1.19.0.worker.js"), ("theirs", "companion-v3/personal-api.1.23.2.worker.js")):
    p = os.path.join(d, name); open(p, "wb").write(kv(key)); paths[name] = p
ours = "personal-api/worker.js"
rc = subprocess.run(["git", "merge-file", "-p", "--diff3", ours, paths["base"], paths["theirs"]], capture_output=True)
out = rc.stdout
print("conflicts", rc.returncode, "bytes", len(out))
if rc.returncode != 0 and b"<<<<<<<" in out:
    open("/tmp/merge-with-conflicts.js", "wb").write(out)
    sys.exit(1)
open(ours, "wb").write(out)
open("personal-api/deployed-current.worker.js", "wb").write(out)
