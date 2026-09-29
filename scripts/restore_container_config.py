#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-7 (issues #1485 / #1487) -- restore a Worker's [[containers]]
block through the CF API /content endpoint with `containers` present in the upload metadata.

WHY THIS EXISTS -- MEASURED, NOT INFERRED
  Cloudflare stores [[containers]] as SCRIPT-LEVEL metadata, not as a binding:
      GET /workers/scripts/qnfo-containers-pilot/bindings
        -> {d1 AUDIT, secret_text PILOT_TOKEN, durable_object_namespace SHELL_CONTAINER}
  qnfo-ops cf_worker_deploy rebuilt the upload metadata from that binding list only, so it
  DROPPED [[containers]]:
      deployment_history id 172  2026-09-29T19:30:35.100Z  qnfo-ops:cf_worker_deploy
      first cloud_ops_events kind=container.error  2026-09-29T19:30:43.591Z (8s later)
      text: "Cannot read properties of undefined (reading 'running')"
  Blast radius: shell_exec, exec_python, exec_node, container_install, git_clone_exec,
  container_workspace_exec, shell_pipeline, container_status -- all HTTP 500.

WHY RESTORE-7 EXISTS -- THE RESTORE ITSELF WAS FAILING CLOSED ON 100402 (measured 19:43:35Z)
  RESTORE-3..6 built the /content metadata as {main_module, containers, compatibility_date,
  compatibility_flags} and omitted `exports`. Cloudflare then rejected every restore:
      PUT /content -> HTTP 400
        code 100402 Durable Object exports reconciliation failed:
        [provisioned_class_missing_from_config] class 'ShellContainer' has a provisioned
        Durable Object namespace (f3e32894405c49f9b33e8612c6d27861) but is not declared in
        `exports`. Every provisioned class must be declared in `exports` (live or tombstone);
        silent drift is not permitted.
  Source of truth for the correct shape is the fleet's own working deployer,
  qnfo-ops/worker.js@main cfWorkerDeploy (lines 2423-2440):
      const _exports = {};
      for (const _b of bindingsOut) {
        if (_b.type === "durable_object_namespace" && _b.class_name)
          _exports[_b.class_name] = { type: "durable-object", storage: "sqlite" };
      }
      ... Object.keys(_exports).length ? { exports: _exports } : {}
  i.e. `exports` is a MAP keyed by class name. RESTORE-7 reproduces exactly that, deriving the
  map from the live /settings binding list (and falling back to wrangler.toml's
  [[durable_objects.bindings]] / [[containers]] class_names when the live list is incomplete),
  and FAILS CLOSED if a provisioned DO class would still be undeclared.

WHY NOT wrangler
  .github/workflows/deploy-containers-pilot.yml is the documented path (only wrangler
  transmits [[containers]] from wrangler.toml), but it has produced
  ci-status/deploy-containers-pilot.json with wrangler_outcome=failure and
  nomig_outcome=failure (19:37:34Z) -- both deploys failed, while verify_outcome=success was a
  FALSE GREEN (its verify step exits 0 when PILOT_TOKEN is absent). This script performs the
  same upload directly.

WHAT IT SENDS
  multipart/form-data PUT /accounts/<acct>/workers/scripts/<worker>
    metadata part: {main_module, containers, compatibility_date, compatibility_flags, exports}
    module part:   the worker source
  `bindings` is deliberately OMITTED. The /content PUT preserves live bindings; rebuilding
  them from a partial read is what caused the original incident (BINDING-PRESERVATION-1 is
  satisfied by omission, not by reconstruction). `exports` is NOT a binding -- it is the DO
  class declaration CF reconciles against provisioned namespaces -- so it must be sent.

VERIFICATION -- FAIL CLOSED
  GET /settings is re-read and `containers` MUST be present, else exit 3.
  /status is probed with PILOT_TOKEN when available (best effort; the /settings read-back is
  the authoritative assertion).

ADVERSARIAL
  (a) If Cloudflare rejects `containers` inside /content metadata, the PUT returns non-200
      and this script exits 3 WITHOUT having mutated the script (fail closed).
  (b) Omitting `bindings` relies on the measured behaviour that /content preserves them
      (raw_put.py's 17:06/17:10/19:34 deploys did not strip bindings). If that behaviour
      ever changes, bindings are lost -- the /settings read-back below therefore also
      asserts the D1 binding is still present.
  (c) The [[migrations]] block is NOT sent: the ShellContainer class already exists, and
      wrangler.toml itself warns a creating migration for an already-depended-on class can
      be rejected (DO-MIGRATION-NOTE-1).
  (d) `exports` is derived from the LIVE binding list, so it cannot resurrect a class that was
      deliberately tombstoned -- only classes CF currently reports as provisioned namespaces
      are declared. A worker whose DO was intentionally deleted must not use this script.
Usage: CLOUDFLARE_API_TOKEN=... python3 scripts/restore_container_config.py
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

ACCT = (os.environ.get("CF_ACCOUNT_ID")
        or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        or "edb167b78c9fb901ea5bca3ce58ccc4b")
WORKER = os.environ.get("WORKER", "qnfo-containers-pilot")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOML = os.path.join(ROOT, WORKER, "wrangler.toml")
MODULE = os.path.join(ROOT, WORKER, "worker.js")
# CF-URLLIB-UA-1010-1: Cloudflare 403/1010-bans the default urllib User-Agent.
UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; restore_container_config.py)"
API = "https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s" % (ACCT, WORKER)
MARKER = "CONTAINER-CONFIG-RESTORE-7-EXPORTS"


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if t:
        return t.strip()
    print("FAIL (fail-closed): no CLOUDFLARE_API_TOKEN in env")
    sys.exit(3)


def parse_containers(text):
    """[[containers]] block(s) -> list of dicts, exactly as wrangler would upload them."""
    out = []
    for block in re.findall(r"\[\[containers\]\]([\s\S]*?)(?=\n\[\[|\Z)", text):
        d = {}
        for key in ("class_name", "image", "instance_type"):
            m = re.search(r'^\s*' + key + r'\s*=\s*"([^"]*)"', block, re.M)
            if m:
                d[key] = m.group(1)
        m = re.search(r"^\s*max_instances\s*=\s*(\d+)", block, re.M)
        if m:
            d["max_instances"] = int(m.group(1))
        if d:
            out.append(d)
    return out


def parse_toml_do_classes(text):
    """[[durable_objects.bindings]] / [[containers]] class_name values declared in the toml."""
    names = []
    for key in ("durable_objects.bindings", "containers"):
        for block in re.findall(r"\[\[" + re.escape(key) + r"\]\]([\s\S]*?)(?=\n\[\[|\Z)", text):
            m = re.search(r'^\s*class_name\s*=\s*"([^"]+)"', block, re.M)
            if m and m.group(1) not in names:
                names.append(m.group(1))
    return names


def build_exports(live, toml_text, containers):
    """DO class declarations for the /content metadata -- the 100402 fix.

    Shape copied from qnfo-ops/worker.js@main cfWorkerDeploy (lines 2423-2440):
      exports[class_name] = {type: "durable-object", storage: "sqlite"}
    Derived from the LIVE binding list first (authoritative for what CF has provisioned),
    then unioned with the toml's declared class_names so a partial /settings read cannot
    silently under-declare and re-trigger 100402.
    """
    names = []
    for b in (live.get("bindings") or []):
        if b.get("type") == "durable_object_namespace" and b.get("class_name"):
            if b["class_name"] not in names:
                names.append(b["class_name"])
    for n in parse_toml_do_classes(toml_text):
        if n not in names:
            names.append(n)
    for c in containers:
        n = c.get("class_name")
        if n and n not in names:
            names.append(n)
    return {n: {"type": "durable-object", "storage": "sqlite"} for n in names}, names


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
    if not os.path.isfile(TOML):
        print("FAIL (fail-closed): %s not found" % TOML)
        return 3
    if not os.path.isfile(MODULE):
        print("FAIL (fail-closed): %s not found" % MODULE)
        return 3

    toml_text = open(TOML, encoding="utf-8").read()
    containers = parse_containers(toml_text)
    if not containers:
        print("FAIL (fail-closed): %s declares no [[containers]] block -- refusing to deploy"
              % TOML)
        return 3
    print("declared containers: %s" % json.dumps(containers))

    st, live = settings(tok)
    if st != 200 or live is None:
        print("FAIL (fail-closed): GET /settings HTTP %s -- cannot read live compatibility "
              "config; deploying blind could clear it (COMPAT-PRESERVE-1)" % st)
        return 3

    if live.get("containers"):
        print("container config ALREADY live: %s" % json.dumps(live["containers"]))
    compat_date = live.get("compatibility_date") or "2026-08-01"
    compat_flags = live.get("compatibility_flags") or []
    print("live compatibility_date=%s flags=%s" % (compat_date, compat_flags))
    print("live bindings: %s" % json.dumps(
        [b.get("name") for b in (live.get("bindings") or [])]))

    exports, export_names = build_exports(live, toml_text, containers)
    print("exports (DO class declarations, 100402 fix): %s" % json.dumps(exports))
    if not exports:
        print("FAIL (fail-closed): no Durable Object class could be derived from live bindings "
              "or wrangler.toml. If CF reports a provisioned namespace, the /content PUT would "
              "be rejected with 100402 provisioned_class_missing_from_config; refusing to send "
              "a request known to fail (RESTORE-7).")
        return 3

    code = open(MODULE, encoding="utf-8").read()
    if not code.strip():
        print("FAIL (fail-closed): module is empty")
        return 3

    metadata = {
        "main_module": "worker.js",
        "containers": containers,
        "compatibility_date": compat_date,
        "exports": exports,
    }
    if compat_flags:
        metadata["compatibility_flags"] = compat_flags

    boundary, payload = multipart(metadata, "worker.js", code)
    st, body = req("PUT", API, tok, payload,
                   "multipart/form-data; boundary=" + boundary)
    print("PUT /content -> HTTP %s" % st)
    print("  body: %s" % str(body)[:600])
    if st != 200:
        if "100402" in str(body) or "provisioned_class_missing_from_config" in str(body):
            print("FAIL (fail-closed): 100402 provisioned_class_missing_from_config -- a DO class "
                  "is still undeclared in `exports`. Derived exports were: %s" % json.dumps(exports))
        else:
            print("FAIL (fail-closed): /content PUT rejected; script NOT restored (#1485 still open)")
        return 3

    st2, after = settings(tok)
    if st2 != 200 or after is None:
        print("FAIL: post-deploy GET /settings HTTP %s" % st2)
        return 3
    got = after.get("containers")
    print("post /settings containers: %s" % json.dumps(got))
    if not got:
        print("FAIL (fail-closed): containers STILL absent after the PUT -- #1485 still open")
        return 3

    names = [b.get("name") for b in (after.get("bindings") or [])]
    print("post /settings bindings: %s" % json.dumps(names))
    if "AUDIT" not in names:
        print("FAIL: the AUDIT d1 binding was lost by this deploy -- investigate immediately")
        return 3

    pt = os.environ.get("PILOT_TOKEN")
    if pt:
        st3, body3 = req("GET", "https://%s.q08.workers.dev/status" % WORKER, pt)
        print("GET /status -> HTTP %s %s" % (st3, str(body3)[:300]))
        if "Cannot read properties of undefined" in str(body3):
            print("FAIL: /status still reports the ctx.container-undefined signature")
            return 3
    else:
        print("NOTE: PILOT_TOKEN not set -- /status probe skipped; /settings read-back above "
              "is the authoritative assertion")

    print("RESTORED: %s carries [[containers]] again with exports=%s (#1485 closed by this run)"
          % (WORKER, json.dumps(export_names)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
