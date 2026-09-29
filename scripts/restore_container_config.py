#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-6 (issues #1485 / #1487) -- restore a Worker's [[containers]]
block through the CF API /content endpoint with `containers` AND `exports` present in the
upload metadata.

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

DO-EXPORTS-RECONCILE-1 (this revision) -- WHY RESTORE-3/4/5 ALL FAILED
  RESTORE-3 through RESTORE-5 each ended in:
      PUT /content -> HTTP 400
      code 100402: Durable Object exports reconciliation failed:
        [provisioned_class_missing_from_config] class 'ShellContainer': class
        'ShellContainer' has a provisioned Durable Object namespace
        (f3e32894405c49f9b33e8612c6d27861) but is not declared in `exports`. Every
        provisioned class must be declared in `exports` (live or tombstone); silent drift
        is not permitted.
  i.e. declaring a container CLASS without also declaring that class in `exports` is the
  "silent drift" Cloudflare refuses. Omitting `bindings` was correct (BINDING-PRESERVATION-1)
  but it is not sufficient: `exports` is a separate script-level declaration and was never
  sent. This revision sends it.

WHY NOT wrangler
  .github/workflows/deploy-containers-pilot.yml is the documented path (only wrangler
  transmits [[containers]] from wrangler.toml), but after repeated pushes AND a
  qnfo-containers-pilot/.deploy-trigger touch it has produced NO successful run: both the
  migrate and no-migrate variants recorded wrangler_outcome=failure (head 139b2dce,
  ts 19:37:34Z). This script performs the same upload directly.

WHAT IT SENDS
  multipart/form-data PUT /accounts/<acct>/workers/scripts/<worker>
    metadata part: {main_module, containers, exports, compatibility_date,
                    compatibility_flags}
    module part:   the worker source
  `bindings` is deliberately OMITTED. The /content PUT preserves live bindings; rebuilding
  them from a partial read is what caused the original incident (BINDING-PRESERVATION-1 is
  satisfied by omission, not by reconstruction).

VERIFICATION -- FAIL CLOSED
  GET /settings is re-read and `containers` MUST be present, else exit 3.
  GET /settings `exports` MUST list every container class, else exit 3.
  /status is probed with PILOT_TOKEN when available (best effort; the /settings read-back is
  the authoritative assertion).

ADVERSARIAL
  (a) If Cloudflare rejects `containers`/`exports` inside /content metadata, the PUT returns
      non-200 and this script exits 3 WITHOUT having mutated the script (fail closed).
  (b) Omitting `bindings` relies on the measured behaviour that /content preserves them
      (raw_put.py's 17:06/17:10/19:34 deploys did not strip bindings). If that behaviour
      ever changes, bindings are lost -- the /settings read-back below therefore also
      asserts the D1 binding is still present.
  (c) The [[migrations]] block is NOT sent: the ShellContainer class already exists, and
      wrangler.toml itself warns a creating migration for an already-depended-on class can
      be rejected (DO-MIGRATION-NOTE-1).
  (d) If the provisioned namespace is legacy-kv rather than sqlite, the sqlite declaration
      is rejected with 100402 and this script retries once as legacy-kv. A wrong-type
      declaration that CF ACCEPTS would be silently wrong -- which is why the post-deploy
      read-back asserts `exports` presence AND the caller independently probes /status.
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


def build_exports(live, containers):
    """DO-EXPORTS-RECONCILE-1: `containers` alone is not a complete class declaration.

    Cloudflare reconciles every provisioned Durable Object class against `exports`; a class
    declared as a container but absent from `exports` is rejected with code 100402
    ([provisioned_class_missing_from_config]). Reuse the live `exports` verbatim when it
    exists; otherwise synthesize the shape CF's own error text prescribes.
    """
    live_exports = live.get("exports")
    if isinstance(live_exports, dict) and live_exports:
        print("live exports: %s" % json.dumps(live_exports))
        return live_exports, "live"
    exports = {}
    for c in containers:
        cls = c.get("class_name")
        if cls:
            exports[cls] = {"type": "durable-object", "storage": "sqlite"}
    print("live exports ABSENT -> synthesized from [[containers]]: %s" % json.dumps(exports))
    return exports, "synthesized"


def as_legacy_kv(exports):
    out = {}
    for k, v in exports.items():
        if isinstance(v, dict) and v.get("type") == "durable-object":
            v = dict(v)
            v["storage"] = "legacy-kv"
        out[k] = v
    return out


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

    exports, origin = build_exports(live, containers)

    code = open(MODULE, encoding="utf-8").read()
    if not code.strip():
        print("FAIL (fail-closed): module is empty")
        return 3

    base_metadata = {
        "main_module": "worker.js",
        "containers": containers,
        "compatibility_date": compat_date,
    }
    if compat_flags:
        base_metadata["compatibility_flags"] = compat_flags

    # DO-EXPORTS-RECONCILE-1: attempt 1 uses the live/synthesized exports; attempt 2 retries
    # as legacy-kv ONLY when CF rejects with the 100402 reconciliation code (the sole other
    # storage value CF accepts). Any other status stops immediately -- never guess further.
    attempts = [(exports, origin)]
    if any(isinstance(v, dict) and v.get("storage") == "sqlite" for v in exports.values()):
        attempts.append((as_legacy_kv(exports), "legacy-kv-retry"))

    st, body = 0, None
    for i, (ex, label) in enumerate(attempts, 1):
        metadata = dict(base_metadata)
        metadata["exports"] = ex
        boundary, payload = multipart(metadata, "worker.js", code)
        st, body = req("PUT", API, tok, payload,
                       "multipart/form-data; boundary=" + boundary)
        print("PUT /content attempt %d (%s) exports=%s -> HTTP %s"
              % (i, label, json.dumps(ex), st))
        print("  body: %s" % str(body)[:700])
        if st == 200:
            break
        if "100402" not in str(body):
            print("  (non-100402 rejection -- not retrying)")
            break
        print("  (100402 DO exports reconciliation -- retrying with the other storage type)")
    if st != 200:
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

    post_exports = after.get("exports") or {}
    print("post /settings exports: %s" % json.dumps(post_exports))
    missing = [c.get("class_name") for c in containers
               if c.get("class_name") and c.get("class_name") not in post_exports]
    if missing:
        print("FAIL (fail-closed): exports missing %s -- the next /content PUT will be "
              "rejected with 100402 (DO-EXPORTS-RECONCILE-1)" % missing)
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

    print("RESTORED: %s carries [[containers]] + exports again (#1485 closed by this run)"
          % WORKER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
