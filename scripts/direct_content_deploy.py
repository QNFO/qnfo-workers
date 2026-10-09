#!/usr/bin/env python3
"""DEPLOY-SECOND-PATH-1 (2026-10-09, pillar core; agent_issues 2178, doctrine section 10 SPOF).

WHAT  The second deploy path for canonical-deploy.yml. When qnfo-ops /ops/deploy is unreachable (connection error or a
      5xx; scripts/canonical_deploy.py exits 3 and lists the workers in its fallback file), this uploads the same worker.js
      straight to Cloudflare with the repository token through the code-only endpoint
      PUT /accounts/{account}/workers/scripts/{name}/content, which replaces the script's code and keeps its bindings,
      settings, secrets and schedules as they are live. It never creates a worker (an absent script is skipped, as
      WORKER-RESURRECTION-GUARD-1 does), never deploys a container worker (its config is script-level), and writes a
      cloud_ops_events row (kind deploy-fallback) for each worker so the ledger shows which path shipped it.
      --drill exercises the path on purpose for one worker at its current main code and, on success, sets
      spof_registry.alternate_tested_at for 'qnfo-ops /ops/deploy' (doctrine section 10: an untested alternate is no
      alternate).
WHY   Every canonical deploy, canary reverts included, went through qnfo-ops; a broken qnfo-ops could not deploy its own fix.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = "https://api.cloudflare.com/client/v4"
SPOF = "qnfo-ops /ops/deploy"


def env(name):
    return os.environ.get(name, "").strip()


def cf(method, path, token, body=None, headers=None, timeout=60):
    req = urllib.request.Request(API + path, data=body, method=method,
                                 headers=dict({"Authorization": "Bearer " + token}, **(headers or {})))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace") or "{}")
        except Exception:  # noqa: BLE001
            return e.code, {}


def is_module(src):
    return bool(re.search(r"^\s*export\s+default\b|^\s*export\s*\{", src, re.M))


def multipart(src, module):
    boundary = "----qnfo" + uuid.uuid4().hex
    meta = {"main_module": "worker.js"} if module else {"body_part": "worker.js"}
    ctype = "application/javascript+module" if module else "application/javascript"
    parts = [
        "--" + boundary, 'Content-Disposition: form-data; name="metadata"', "Content-Type: application/json", "", json.dumps(meta),
        "--" + boundary, 'Content-Disposition: form-data; name="worker.js"; filename="worker.js"', "Content-Type: " + ctype, "", src,
        "--" + boundary + "--", "",
    ]
    return "\r\n".join(parts).encode("utf-8"), "multipart/form-data; boundary=" + boundary


def d1(acct, token, sql, params=None, call=cf):
    st, j = call("GET", "/accounts/%s/d1/database?name=qnfo-audit" % acct, token)
    dbs = [d for d in (j.get("result") or []) if d.get("name") == "qnfo-audit"]
    if not dbs:
        return False
    st, j = call("POST", "/accounts/%s/d1/database/%s/query" % (acct, dbs[0].get("uuid")), token,
                 json.dumps({"sql": sql, "params": params or []}).encode(), {"Content-Type": "application/json"})
    return bool(j.get("success"))


def deploy_one(acct, token, worker, path, call=cf, read=None):
    read = read or (lambda p: open(p, encoding="utf-8").read())
    wdir = os.path.dirname(path) or "."
    toml = os.path.join(wdir, "wrangler.toml")
    try:
        if "[[containers]]" in read(toml):
            return {"worker": worker, "ok": True, "skipped": "container worker (script-level config; deploy-code-orchestrator.yml owns it)"}
    except OSError:
        pass
    st, _ = call("GET", "/accounts/%s/workers/scripts/%s/settings" % (acct, urllib.parse.quote(worker)), token)
    if st == 404:
        return {"worker": worker, "ok": True, "skipped": "absent from the account; never created here (WORKER-RESURRECTION-GUARD-1)"}
    src = read(path)
    body, ctype = multipart(src, is_module(src))
    st, j = call("PUT", "/accounts/%s/workers/scripts/%s/content" % (acct, urllib.parse.quote(worker)), token, body, {"Content-Type": ctype}, 120)
    ok = 200 <= st < 300 and bool(j.get("success", True))
    m = re.search(r'(?:var|const|let)\s+VERSION\s*=\s*["\']([^"\']+)["\']', src)
    return {"worker": worker, "ok": ok, "http": st, "version": m.group(1) if m else None,
            "error": None if ok else json.dumps(j.get("errors") or j)[:400]}


def main(argv=None, call=cf, read=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", help="file of '<worker> <path>' lines (canonical_deploy.py --fallback-file)")
    ap.add_argument("--worker")
    ap.add_argument("--path")
    ap.add_argument("--drill", action="store_true", help="exercise the path on purpose and record alternate_tested_at")
    a = ap.parse_args(argv)
    acct, token = env("CLOUDFLARE_ACCOUNT_ID"), env("CLOUDFLARE_API_TOKEN")
    if not acct or not token:
        print("::error::CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set; the second deploy path cannot run")
        return 1
    targets = []
    if a.worker:
        targets.append((a.worker, a.path or a.worker + "/worker.js"))
    if a.targets and os.path.exists(a.targets):
        for line in open(a.targets, encoding="utf-8"):
            p = line.split()
            if p:
                targets.append((p[0], p[1] if len(p) > 1 else p[0] + "/worker.js"))
    if not targets:
        print("no fallback targets")
        return 0
    failed = 0
    run = env("GITHUB_RUN_ID") or "local"
    for worker, path in targets:
        r = deploy_one(acct, token, worker, path, call, read)
        print(json.dumps(r))
        if not r["ok"]:
            failed += 1
            print("::error::fallback deploy failed for %s" % worker)
            continue
        if r.get("skipped"):
            continue
        stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        d1(acct, token, "INSERT INTO cloud_ops_events (id, ts, kind, status, text, job) VALUES (?1, ?2, 'deploy-fallback', 'ok', ?3, 'canonical-deploy')",
           ["deploy-fallback-%s-%s" % (worker, stamp), stamp, "DEPLOY-SECOND-PATH-1 %s %s via PUT /content (repository token), run %s%s"
            % (worker, r.get("version"), run, " drill" if a.drill else "")], call)
        if a.drill:
            d1(acct, token, "UPDATE spof_registry SET alternate_path = COALESCE(NULLIF(alternate_path, ''), ?1), alternate_tested_at = ?2, "
               "evidence = COALESCE(evidence, '') || ?3 WHERE component = ?4",
               ["canonical-deploy.yml falls back to scripts/direct_content_deploy.py (PUT /content with the repository token) when /ops/deploy is unreachable",
                stamp, " | drill %s: %s %s deployed by the second path (run %s)" % (stamp, worker, r.get("version"), run), SPOF], call)
    return 1 if failed else 0


def selftest():
    calls = []
    files = {"w/wrangler.toml": 'name = "w"', "w/worker.js": 'var VERSION = "1.2.3";\nexport default { fetch() {} };\n',
             "c/wrangler.toml": "[[containers]]\n", "c/worker.js": "x"}

    def read(p):
        if p not in files:
            raise OSError(p)
        return files[p]

    def call(method, path, token, body=None, headers=None, timeout=60):
        calls.append((method, path))
        if path.endswith("/absent/settings"):
            return 404, {}
        if "d1/database?name" in path:
            return 200, {"result": [{"name": "qnfo-audit", "uuid": "db"}]}
        if "/query" in path:
            return 200, {"success": True}
        if method == "PUT":
            assert b'"main_module": "worker.js"' in body and b"application/javascript+module" in body
            return 200, {"success": True}
        return 200, {"success": True}

    os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"] = "acct", "tok"
    assert main(["--worker", "w", "--path", "w/worker.js", "--drill"], call, read) == 0
    assert ("PUT", "/accounts/acct/workers/scripts/w/content") in calls
    assert sum(1 for m, p in calls if p.endswith("/query")) == 2, calls
    calls.clear()
    assert main(["--worker", "absent", "--path", "w/worker.js"], call, read) == 0 and not any(m == "PUT" for m, p in calls)
    calls.clear()
    assert main(["--worker", "c", "--path", "c/worker.js"], call, read) == 0 and not any(m == "PUT" for m, p in calls)
    assert not is_module("addEventListener('fetch', e => {})") and is_module("export default {}")
    print("direct_content_deploy selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
