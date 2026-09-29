#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-4 (issues #1485 / #1487) -- restore a Worker's [[containers]]
block through the CF API /content endpoint with `containers` present in the upload metadata.

RESTORE-4 CHANGE -- THE MEASURED BLOCKER THAT RESTORE-3 HIT
  RESTORE-3 shipped and ran (ci-status/restore-container-config.json, ts 2026-09-29T19:43:35Z)
  and FAILED at the PUT:

      PUT /content -> HTTP 400
      code 100402: Durable Object exports reconciliation failed:
        [provisioned_class_missing_from_config] class 'ShellContainer': class 'ShellContainer'
        has a provisioned Durable Object namespace (f3e32894405c49f9b33e8612c6d27861) but is
        not declared in `exports`. Every provisioned class must be declared in `exports`
        (live or tombstone); silent drift is not permitted.
        (add 'ShellContainer' back to `exports` as {"type": "durable-object",
         "storage": "sqlite"} (or "legacy-kv"), ...)

  So `containers` inside /content metadata IS accepted by Cloudflare -- the PUT died on a
  DIFFERENT missing field. RESTORE-3 sent {main_module, containers, compatibility_date[, flags]}
  and omitted `exports`. This is the SAME defect class as the original incident, mirrored:
      qnfo-ops cf_worker_deploy  metadata = {main_module, bindings, ..., exports}  -> drops `containers`
      RESTORE-3                  metadata = {main_module, containers, ...}         -> drops `exports`
  Neither path sent both. RESTORE-4 sends BOTH, and fails closed if `exports` cannot be
  determined, because a blind PUT would just reproduce the 100402.

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

WHY NOT wrangler
  .github/workflows/deploy-containers-pilot.yml is the documented path (only wrangler
  transmits [[containers]] from wrangler.toml), but ci-status/deploy-containers-pilot.json
  records wrangler_outcome=failure, nomig_outcome=failure -- both the migration and the
  no-migration wrangler paths are rejected. This script performs the same upload directly.

WHAT IT SENDS
  multipart/form-data PUT /accounts/<acct>/workers/scripts/<worker>
    metadata part: {main_module, containers, exports, compatibility_date, compatibility_flags}
    module part:   the worker source
  `bindings` is deliberately OMITTED. The /content PUT preserves live bindings; rebuilding
  them from a partial read is what caused the original incident (BINDING-PRESERVATION-1 is
  satisfied by omission, not by reconstruction).

  `exports` is NOT omitted: unlike bindings it is subject to reconciliation against
  provisioned Durable Object namespaces, and CF rejects the upload (100402) if a provisioned
  class is absent from it. It is derived, in priority order:
    1. the live `exports` map from GET /settings, when present (preserve-what-is-live);
    2. [[migrations]] new_sqlite_classes  -> {"type": "durable-object", "storage": "sqlite"}
       [[migrations]] new_classes         -> {"type": "durable-object", "storage": "legacy-kv"}
    3. [[durable_objects.bindings]] class_name;
    4. any live durable_object_namespace binding's class_name (this is the belt-and-braces
       path -- it is the source that proved ShellContainer is provisioned).

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
  (d) Deriving `exports` from wrangler.toml rather than from the live config could in
      principle declare a class that is NOT provisioned. Cloudflare rejects that too, but
      with a different code; the PUT status is printed verbatim so the two are
      distinguishable. Step 1 (live exports) avoids the guess entirely when CF returns it.
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


def derive_exports(toml_text, live):
    """Build the upload metadata's `exports` map.

    CF error 100402 (provisioned_class_missing_from_config) rejects any upload that omits a
    provisioned Durable Object class from `exports`, so this MUST be non-empty for a worker
    that owns a DO namespace (qnfo-containers-pilot owns ShellContainer).
    """
    exports = {}

    # 1. preserve the live exports map when the API returns one.
    live_exports = live.get("exports") if isinstance(live, dict) else None
    if isinstance(live_exports, dict) and live_exports:
        for k, v in live_exports.items():
            exports[k] = v

    # 2. wrangler.toml [[migrations]]
    for block in re.findall(r"\[\[migrations\]\]([\s\S]*?)(?=\n\[\[|\Z)", toml_text):
        for cls_list in re.findall(r"new_sqlite_classes\s*=\s*\[([^\]]*)\]", block):
            for c in re.findall(r'"([^"]+)"', cls_list):
                exports.setdefault(c, {"type": "durable-object", "storage": "sqlite"})
        for cls_list in re.findall(r"new_classes\s*=\s*\[([^\]]*)\]", block):
            for c in re.findall(r'"([^"]+)"', cls_list):
                exports.setdefault(c, {"type": "durable-object", "storage": "legacy-kv"})

    # 3. wrangler.toml [[durable_objects.bindings]]
    for block in re.findall(r"\[\[durable_objects\.bindings\]\]([\s\S]*?)(?=\n\[\[|\Z)",
                            toml_text):
        m = re.search(r'class_name\s*=\s*"([^"]+)"', block)
        if m:
            exports.setdefault(m.group(1), {"type": "durable-object", "storage": "sqlite"})

    # 4. any DO namespace already live on the script MUST also be declared (the 100402 trigger)
    for b in ((live.get("bindings") or []) if isinstance(live, dict) else []):
        if b.get("type") == "durable_object_namespace" and b.get("class_name"):
            exports.setdefault(b["class_name"],
                               {"type": "durable-object", "storage": "sqlite"})
    return exports


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

    # RESTORE-4: `exports` is mandatory, not optional. CF 100402 otherwise.
    exports = derive_exports(toml_text, live)
    print("derived exports: %s" % json.dumps(exports))
    if not exports:
        print("FAIL (fail-closed): no Durable Object exports could be determined, but a "
              "provisioned class must be declared in `exports` (CF 100402). Refusing to PUT "
              "blind -- it would reproduce the RESTORE-3 failure.")
        return 3

    code = open(MODULE, encoding="utf-8").read()
    if not code.strip():
        print("FAIL (fail-closed): module is empty")
        return 3

    metadata = {
        "main_module": "worker.js",
        "containers": containers,
        "exports": exports,
        "compatibility_date": compat_date,
    }
    if compat_flags:
        metadata["compatibility_flags"] = compat_flags

    boundary, payload = multipart(metadata, "worker.js", code)
    st, body = req("PUT", API, tok, payload,
                   "multipart/form-data; boundary=" + boundary)
    print("PUT /content -> HTTP %s" % st)
    print("  body: %s" % str(body)[:600])
    if st != 200:
        print("FAIL (fail-closed): /content PUT rejected; script NOT restored (#1485 still open)")
        if "100402" in str(body) or "provisioned_class_missing_from_config" in str(body):
            print("  NOTE: 100402 means `exports` still does not reconcile with the provisioned "
                  "DO namespaces; derived exports above are the thing to correct.")
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

    print("RESTORED: %s carries [[containers]] again (#1485 closed by this run)" % WORKER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
