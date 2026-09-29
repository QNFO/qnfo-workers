#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-4-EXPORTS (2026-09-29, issue #1485).

WHY THE PREVIOUS RESTORE FAILED -- measured, not inferred
  ci-status/restore-container-config.json (ts 2026-09-29T19:43:35Z) recorded:
    PUT /content -> HTTP 400
    errors[0].code 100402  "Durable Object exports reconciliation failed:
    [provisioned_class_missing_from_config] class 'ShellContainer': class
    'ShellContainer' has a provisioned Durable Object namespace
    (f3e32894405c49f9b33e8612c6d27861) but is not declared in `exports`."
  scripts/restore_container_config.py sent metadata
  {main_module, containers, compatibility_date[, compatibility_flags]} and NO
  `exports`, so EVERY restore attempt was rejected. HTTP 400 (not 401/403) also
  proves the CI Cloudflare token authenticates fine -- the blocker was always the
  request BODY, never the credential. That single omitted field is why #1485
  survived ~7 hours of "remediation" runs.

THE FIX (one field)
  metadata gains "exports": {"ShellContainer": {"type": "durable-object",
  "storage": "sqlite"}} -- literally the remediation the API error prescribed.
  `bindings` stays omitted on purpose (BINDING-PRESERVATION-1 by omission: the
  /content PUT preserves live bindings, and REBUILDING them from a partial read is
  precisely what destroyed the container config at 19:30:35Z, deployment_history
  id 172).

FAIL-CLOSED CHECKS
  * no [[containers]] block in wrangler.toml     -> exit 3, no mutation
  * live /settings unreadable                    -> exit 3 (COMPAT-PRESERVE-1)
  * PUT != 200                                   -> exit 3
  * containers absent in post-deploy /settings   -> exit 3
  * AUDIT or SHELL_CONTAINER binding missing     -> exit 3
  * /status still reports ctx.container undefined -> exit 3 (when PILOT_TOKEN set)

Usage: CLOUDFLARE_API_TOKEN=... python3 scripts/restore_container_config_exports.py
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

MARKER = "CONTAINER-CONFIG-RESTORE-4-EXPORTS"
ACCT = (os.environ.get("CF_ACCOUNT_ID")
        or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        or "edb167b78c9fb901ea5bca3ce58ccc4b")
WORKER = os.environ.get("WORKER", "qnfo-containers-pilot")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOML = os.path.join(ROOT, WORKER, "wrangler.toml")
MODULE = os.path.join(ROOT, WORKER, "worker.js")
# CF-URLLIB-UA-1010-1: Cloudflare 403/1010-bans the default urllib User-Agent.
UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; restore_container_config_exports.py)"
API = "https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s" % (ACCT, WORKER)


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if t:
        return t.strip()
    print("FAIL (fail-closed): no CLOUDFLARE_API_TOKEN in env")
    sys.exit(3)


def parse_containers(text):
    """[[containers]] block(s) -> list of dicts, as wrangler would upload them."""
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


def main():
    print("marker: %s" % MARKER)
    tok = token()
    for p in (TOML, MODULE):
        if not os.path.isfile(p):
            print("FAIL (fail-closed): %s not found" % p)
            return 3

    containers = parse_containers(open(TOML, encoding="utf-8").read())
    if not containers:
        print("FAIL (fail-closed): %s declares no [[containers]] block -- refusing" % TOML)
        return 3
    print("declared containers: %s" % json.dumps(containers))

    st, live = settings(tok)
    if st != 200 or live is None:
        print("FAIL (fail-closed): GET /settings HTTP %s -- refusing to deploy blind "
              "(COMPAT-PRESERVE-1)" % st)
        return 3
    compat_date = live.get("compatibility_date") or "2026-08-01"
    compat_flags = live.get("compatibility_flags") or []
    live_names = [b.get("name") for b in (live.get("bindings") or [])]
    print("live compatibility_date=%s flags=%s" % (compat_date, compat_flags))
    print("live bindings: %s" % json.dumps(live_names))
    if live.get("containers"):
        print("NOTE: container config ALREADY live: %s" % json.dumps(live["containers"]))

    exports = {}
    for c in containers:
        cn = c.get("class_name")
        if not cn:
            print("FAIL (fail-closed): a [[containers]] block has no class_name")
            return 3
        exports[cn] = {"type": "durable-object", "storage": "sqlite"}

    metadata = {
        "main_module": "worker.js",
        "containers": containers,
        "exports": exports,
        "compatibility_date": compat_date,
    }
    if compat_flags:
        metadata["compatibility_flags"] = compat_flags
    print("metadata keys: %s" % json.dumps(sorted(metadata.keys())))
    print("exports: %s" % json.dumps(exports))

    code = open(MODULE, encoding="utf-8").read()
    if not code.strip():
        print("FAIL (fail-closed): module is empty")
        return 3

    boundary, payload = multipart(metadata, "worker.js", code)
    st, body = req("PUT", API, tok, payload, "multipart/form-data; boundary=" + boundary)
    print("PUT /content -> HTTP %s" % st)
    print("  body: %s" % str(body)[:600])
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

    names = [b.get("name") for b in (after.get("bindings") or [])]
    print("post /settings bindings: %s" % json.dumps(names))
    for need in ("AUDIT", "SHELL_CONTAINER"):
        if need not in names:
            print("FAIL: binding %s was lost by this deploy -- investigate immediately" % need)
            return 3

    pt = os.environ.get("PILOT_TOKEN")
    if pt:
        st3, body3 = req("GET", "https://%s.q08.workers.dev/status" % WORKER, pt)
        print("GET /status -> HTTP %s %s" % (st3, str(body3)[:300]))
        if "Cannot read properties of undefined" in str(body3):
            print("FAIL: /status still reports the ctx.container-undefined signature")
            return 3
    else:
        print("NOTE: PILOT_TOKEN not set -- /status probe skipped; the /settings read-back "
              "above is the authoritative assertion")

    print("RESTORED: %s carries [[containers]] again (#1485 closed by this run)" % WORKER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
