#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-5-BINDINGS (2026-09-29, issues #1485 / #1487).

WHY RESTORE-4 STILL LEFT THE CONTAINER DEAD -- measured, not inferred
  restore-4 (scripts/restore_container_config_exports.py) fixed the exports gap and its
  PUT /content returned HTTP 200 at 2026-09-29T19:45:06Z
  (ci-status/restore-container-config-1485.json). It nonetheless made the outage WORSE,
  because it sent metadata WITHOUT a `bindings` array on the stated assumption that
  "the /content PUT preserves live bindings" (BINDING-PRESERVATION-1 by omission).

  THAT ASSUMPTION IS FALSE. Measured immediately after, cf_worker_bindings returned:
      {"worker":"qnfo-containers-pilot","count":1,
       "bindings":[{"type":"secret_text","name":"PILOT_TOKEN"}]}
  i.e. the D1 binding AUDIT and the Durable Object binding SHELL_CONTAINER were DELETED.
  PUT /content REPLACES the script; it does not merge bindings. Runtime error moved from
  "reading 'running'" (ctx.container undefined) to
  "reading 'idFromName'" (env.SHELL_CONTAINER undefined) -- the binding is gone, so
  shell_exec / exec_python / exec_node / container_install / git_clone_exec /
  container_workspace_exec / shell_pipeline all still return HTTP 500.

THE FIX (bindings must be re-declared explicitly)
  metadata = {main_module, compatibility_date, compatibility_flags,
              bindings:      [{type:d1, name:AUDIT, id:<database_id>},
                              {type:durable_object_namespace, name:SHELL_CONTAINER,
                               class_name:ShellContainer}],
              keep_bindings: ["secret_text"],          # preserves PILOT_TOKEN's value
              exports:       {ShellContainer: {type:"durable-object", storage:"sqlite"}},
              containers:    [{class_name, image, instance_type, max_instances}]}
  All four are required together:
    * no `exports`      -> HTTP 400 / 100402 (restore-3's failure)
    * no `containers`   -> script deploys but ctx.container is undefined (#1485)
    * no `bindings`     -> DO + D1 bindings deleted (restore-4's regression)
    * no keep_bindings  -> PILOT_TOKEN secret value destroyed

FAIL-CLOSED CHECKS
  * no [[containers]] block in wrangler.toml      -> exit 3, no mutation
  * no [[d1_databases]] / [[durable_objects.bindings]] -> exit 3, no mutation
  * live /settings unreadable                     -> exit 3 (COMPAT-PRESERVE-1)
  * PUT != 200                                    -> exit 3
  * post-deploy /settings missing containers, AUDIT or SHELL_CONTAINER -> exit 3

Usage: CLOUDFLARE_API_TOKEN=... python3 scripts/restore_container_config_bindings.py
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

MARKER = "CONTAINER-CONFIG-RESTORE-5-BINDINGS"
ACCT = (os.environ.get("CF_ACCOUNT_ID")
        or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        or "edb167b78c9fb901ea5bca3ce58ccc4b")
WORKER = os.environ.get("WORKER", "qnfo-containers-pilot")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOML = os.path.join(ROOT, WORKER, "wrangler.toml")
MODULE = os.path.join(ROOT, WORKER, "worker.js")
# CF-URLLIB-UA-1010-1: Cloudflare 403/1010-bans the default urllib User-Agent.
UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; restore_container_config_bindings.py)"
API = "https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s" % (ACCT, WORKER)


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if t:
        return t.strip()
    print("FAIL (fail-closed): no CLOUDFLARE_API_TOKEN in env")
    sys.exit(3)


def _blocks(text, table):
    """All [[table]] blocks as raw strings."""
    return re.findall(r"\[\[" + table + r"\]\]([\s\S]*?)(?=\n\[\[|\Z)", text)


def _s(block, key):
    m = re.search(r'^\s*' + key + r'\s*=\s*"([^"]*)"', block, re.M)
    return m.group(1) if m else None


def parse_containers(text):
    out = []
    for block in _blocks(text, "containers"):
        d = {}
        for key in ("class_name", "image", "instance_type"):
            v = _s(block, key)
            if v:
                d[key] = v
        m = re.search(r"^\s*max_instances\s*=\s*(\d+)", block, re.M)
        if m:
            d["max_instances"] = int(m.group(1))
        if d:
            out.append(d)
    return out


def parse_bindings(text):
    """Rebuild the non-secret bindings from wrangler.toml (secret values cannot be read)."""
    binds = []
    for block in _blocks(text, "d1_databases"):
        name, dbid = _s(block, "binding"), _s(block, "database_id")
        if name and dbid:
            binds.append({"type": "d1", "name": name, "id": dbid})
    for block in _blocks(text, "durable_objects.bindings"):
        name, cls = _s(block, "name"), _s(block, "class_name")
        if name and cls:
            binds.append({"type": "durable_object_namespace",
                          "name": name, "class_name": cls})
    return binds


def parse_exports(text, containers):
    """DO export entries derived from the container class + migrations storage kind."""
    storage = "sqlite" if re.search(r"new_sqlite_classes", text) else "legacy-kv"
    out = {}
    for c in containers:
        cls = c.get("class_name")
        if cls:
            out[cls] = {"type": "durable-object", "storage": storage}
    return out


def req(method, url, tok, data=None, ctype=None):
    headers = {"Authorization": "Bearer " + tok, "User-Agent": UA}
    if ctype:
        headers["Content-Type"] = ctype
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                return resp.status, json.loads(raw)
            except ValueError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, body
    except Exception as e:  # noqa: BLE001
        return 0, "ERR " + str(e)


def settings(tok):
    st, body = req("GET", API + "/settings", tok)
    if st == 200 and isinstance(body, dict) and body.get("success"):
        return st, (body.get("result") or {})
    return st, None


def multipart(metadata, name, code):
    b = "----qnfoform" + uuid.uuid4().hex
    buf = bytearray()
    buf += ("--" + b + "\r\n").encode()
    buf += b'Content-Disposition: form-data; name="metadata"\r\n'
    buf += b"Content-Type: application/json\r\n\r\n"
    buf += json.dumps(metadata).encode()
    buf += b"\r\n"
    buf += ("--" + b + "\r\n").encode()
    buf += ('Content-Disposition: form-data; name="%s"; filename="%s"\r\n' % (name, name)).encode()
    buf += b"Content-Type: application/javascript+module\r\n\r\n"
    buf += code.encode()
    buf += b"\r\n"
    buf += ("--" + b + "--\r\n").encode()
    return b, bytes(buf)


def main():
    print("marker: %s" % MARKER)
    tok = token()
    for p in (TOML, MODULE):
        if not os.path.isfile(p):
            print("FAIL (fail-closed): %s not found" % p)
            return 3

    text = open(TOML, encoding="utf-8").read()
    containers = parse_containers(text)
    if not containers:
        print("FAIL (fail-closed): %s declares no [[containers]] block -- refusing" % TOML)
        return 3
    bindings = parse_bindings(text)
    names = [b["name"] for b in bindings]
    if not any(b["type"] == "d1" for b in bindings) or \
       not any(b["type"] == "durable_object_namespace" for b in bindings):
        print("FAIL (fail-closed): wrangler.toml must declare a [[d1_databases]] and a "
              "[[durable_objects.bindings]] entry -- refusing to deploy a partial binding "
              "set (this is the exact regression that restore-4 caused). found=%s" % names)
        return 3
    exports = parse_exports(text, containers)
    if not exports:
        print("FAIL (fail-closed): could not derive any durable-object export entry")
        return 3

    print("declared containers: %s" % json.dumps(containers))
    print("declared bindings:   %s" % json.dumps(bindings))
    print("derived exports:     %s" % json.dumps(exports))

    st, live = settings(tok)
    if st != 200 or live is None:
        print("FAIL (fail-closed): GET /settings HTTP %s -- refusing to deploy blind "
              "(COMPAT-PRESERVE-1)" % st)
        return 3
    compat_date = live.get("compatibility_date") or "2026-08-01"
    compat_flags = live.get("compatibility_flags") or []
    print("live compatibility_date=%s flags=%s" % (compat_date, compat_flags))
    print("live binding names: %s" % [b.get("name") for b in (live.get("bindings") or [])])

    metadata = {
        "main_module": os.path.basename(MODULE),
        "compatibility_date": compat_date,
        "compatibility_flags": compat_flags,
        "bindings": bindings,
        "keep_bindings": ["secret_text"],
        "exports": exports,
        "containers": containers,
    }
    print("metadata: %s" % json.dumps(metadata))

    b, body = multipart(metadata, os.path.basename(MODULE),
                        open(MODULE, encoding="utf-8").read())
    st, resp = req("PUT", API + "/content", tok, data=body,
                   ctype="multipart/form-data; boundary=" + b)
    print("PUT /content -> HTTP %s" % st)
    if st != 200:
        print("  body: %s" % json.dumps(resp)[:1500])
        print("FAIL (fail-closed): /content PUT rejected; script NOT restored (#1485 still open)")
        return 3

    st2, after = settings(tok)
    if st2 != 200 or after is None:
        print("FAIL (fail-closed): post-deploy GET /settings HTTP %s" % st2)
        return 3
    got = [b_.get("name") for b_ in (after.get("bindings") or [])]
    print("post-deploy binding names: %s" % got)
    print("post-deploy containers: %s" % json.dumps(after.get("containers")))
    missing = [n for n in names if n not in got]
    if missing:
        print("FAIL (fail-closed): bindings missing after deploy: %s" % missing)
        return 3
    if not after.get("containers"):
        print("FAIL (fail-closed): containers still absent from /settings after deploy")
        return 3
    print("RESTORED: containers=%s bindings=%s exports=%s"
          % (len(after.get("containers") or []), got, list(exports)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
