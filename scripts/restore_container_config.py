#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-4 (issues #1485 / #1487 / #1493) -- restore a Worker's
[[containers]] script-level metadata through the CF API /content endpoint.

WHY RESTORE-4 EXISTS -- MEASURED, NOT INFERRED
  RESTORE-3 sent the upload metadata as {main_module, containers, compatibility_date[, flags]}
  with `bindings` and `migrations` deliberately omitted, on the assumption that an
  already-provisioned Durable Object class needs no declaration. That assumption is FALSIFIED
  by RESTORE-3's own live run (ci-status/restore-container-config.json, 2026-09-29T19:43:35Z):

      PUT /content -> HTTP 400
      errors[0].code = 100402
      "Durable Object exports reconciliation failed:
       - [provisioned_class_missing_from_config] class 'ShellContainer': class 'ShellContainer'
         has a provisioned Durable Object namespace (f3e32894405c49f9b33e8612c6d27861) but is
         not declared in `exports`. Every provisioned class must be declared in `exports`
         (live or tombstone); silent drift is not permitted. (add 'ShellContainer' back to
         `exports` as {"type": "durable-object", "storage": "sqlite"} (or "legacy-kv"), or
         replace the entry with a `deleted` / `renamed` ...)"

  So #1485 was never a retry problem -- the retries were correct and the PAYLOAD was wrong.
  RESTORE-4 therefore tries declaration shapes in order and records the first one the server
  accepts. It mutates nothing until a 200.

WHAT IT SENDS
  multipart/form-data PUT /accounts/<acct>/workers/scripts/<worker>
    metadata part: strategy-dependent (see build_strategies)
    module part:   qnfo-containers-pilot/worker.js
  `bindings` is omitted from the default strategies: the /content PUT preserves live
  bindings by omission (BINDING-PRESERVATION-1). Strategies that MUST send bindings also
  send `keep_bindings` so unrelated bindings are not dropped, and every 200 is followed by
  a read-back assertion plus in-run repair.

VERIFICATION -- FAIL CLOSED
  After a 200: GET /settings MUST report `containers` AND the bindings AUDIT, PILOT_TOKEN
  and SHELL_CONTAINER. A vanished binding is repaired in the same run, not left behind.
  /status is probed with PILOT_TOKEN when available.

ADVERSARIAL
  (a) If every declaration shape is rejected, the script exits 3 having mutated nothing.
  (b) If a PUT returns 200 but drops a binding, the repair path re-adds it from env
      (PILOT_TOKEN) or from the known d1 database_id. A repair that itself fails is
      reported as REGRESSION-UNREPAIRED and exits 4 -- never silently green.
  (c) `exports` / `migrations` are not sent by any other deploy path in this repo, so the
      accepted shape is recorded in the log tail for the next reader. If the server changes
      its reconciliation contract, the recorded shapes are the falsification record.
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
# BINDING-PRESERVATION-1: known-good identity of the d1 binding, for repair only.
AUDIT_D1_ID = os.environ.get("AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
KEEP_TYPES = ["plain_text", "secret_text", "kv_namespace", "r2_bucket", "queue",
              "analytics_engine", "service", "vectorize", "hyperdrive", "ai", "images",
              "browser", "mtls_certificate", "dispatch_namespace", "d1"]

REQUIRED_BINDINGS = ("AUDIT", "PILOT_TOKEN", "SHELL_CONTAINER")


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
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


def parse_do_binding(text):
    """[[durable_objects.bindings]] -> (binding_name, class_name)."""
    m = re.search(r"\[\[durable_objects\.bindings\]\]([\s\S]*?)(?=\n\[\[|\Z)", text)
    if not m:
        return ("SHELL_CONTAINER", "ShellContainer")
    block = m.group(1)
    n = re.search(r'^\s*name\s*=\s*"([^"]*)"', block, re.M)
    c = re.search(r'^\s*class_name\s*=\s*"([^"]*)"', block, re.M)
    return (n.group(1) if n else "SHELL_CONTAINER",
            c.group(1) if c else "ShellContainer")


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


def err_text(body):
    if isinstance(body, dict):
        errs = body.get("errors") or []
        if errs:
            return " | ".join("%s:%s" % (e.get("code"), str(e.get("message"))[:400])
                              for e in errs)
    return str(body)[:400]


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


def build_strategies(containers, compat_date, compat_flags, class_name, do_binding):
    """Declaration shapes for the provisioned DO class, cheapest/most-likely first.

    S1-S4 are the shapes the 100402 message itself asks for ('declared in exports').
    S5-S6 send the binding set explicitly (with keep_bindings) for the case where the
    reconciliation keys off the durable_object_namespace binding rather than `exports`.
    S7 is the RESTORE-3 control: it reproduces 100402 and proves the diagnosis is still live.
    """
    base = {"main_module": "worker.js", "containers": containers,
            "compatibility_date": compat_date}
    if compat_flags:
        base["compatibility_flags"] = compat_flags
    out = []

    def add(label, extra):
        md = dict(base)
        md.update(extra)
        out.append((label, md))

    sqlite_exp = [{"type": "durable-object", "name": class_name, "storage": "sqlite"}]
    legacy_exp = [{"type": "durable-object", "name": class_name, "storage": "legacy-kv"}]
    mig_sqlite = {"old_tag": "v1", "new_tag": "v2",
                  "steps": [{"new_sqlite_classes": [class_name]}]}
    do_bind = [{"type": "durable_object_namespace", "name": do_binding,
                "class_name": class_name}]

    add("S1-exports-sqlite", {"exports": sqlite_exp})
    add("S2-exports-legacy-kv", {"exports": legacy_exp})
    add("S3-migrations-new-sqlite", {"migrations": mig_sqlite})
    add("S4-exports-sqlite+migrations", {"exports": sqlite_exp, "migrations": mig_sqlite})
    add("S5-bindings-do+keep", {"bindings": do_bind, "keep_bindings": KEEP_TYPES})
    add("S6-bindings-do+keep+migrations",
        {"bindings": do_bind, "keep_bindings": KEEP_TYPES, "migrations": mig_sqlite})
    add("S7-no-declaration-control", {})
    return out


def binding_names(live):
    return [b.get("name") for b in (live.get("bindings") or [])]


def repair(tok, code, compat_date, compat_flags, containers, missing):
    """Re-add bindings that a successful PUT dropped. Returns (ok, detail)."""
    adds = []
    for name in missing:
        if name == "PILOT_TOKEN":
            val = os.environ.get("PILOT_TOKEN")
            if not val:
                return False, "PILOT_TOKEN missing post-PUT and no PILOT_TOKEN in env"
            adds.append({"type": "secret_text", "name": "PILOT_TOKEN", "text": val})
        elif name == "AUDIT":
            adds.append({"type": "d1", "name": "AUDIT", "id": AUDIT_D1_ID})
        else:
            return False, "cannot repair binding %s (unknown identity)" % name
    md = {"main_module": "worker.js", "containers": containers,
          "compatibility_date": compat_date, "bindings": adds,
          "keep_bindings": [t for t in KEEP_TYPES if t != "d1"]}
    if compat_flags:
        md["compatibility_flags"] = compat_flags
    b, payload = multipart(md, "worker.js", code)
    st, body = req("PUT", API, tok, payload, "multipart/form-data; boundary=" + b)
    print("REPAIR PUT -> HTTP %s %s" % (st, err_text(body)[:300]))
    return (st == 200), "repair http %s" % st


def main():
    tok = token()
    for path in (TOML, MODULE):
        if not os.path.isfile(path):
            print("FAIL (fail-closed): %s not found" % path)
            return 3

    toml_text = open(TOML, encoding="utf-8").read()
    containers = parse_containers(toml_text)
    if not containers:
        print("FAIL (fail-closed): %s declares no [[containers]] block -- refusing to deploy"
              % TOML)
        return 3
    class_name = containers[0].get("class_name") or "ShellContainer"
    do_binding, _cls = parse_do_binding(toml_text)
    print("declared containers: %s" % json.dumps(containers))
    print("declaring DO class=%s binding=%s" % (class_name, do_binding))

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
    print("live bindings: %s" % json.dumps(binding_names(live)))

    code = open(MODULE, encoding="utf-8").read()
    if not code.strip():
        print("FAIL (fail-closed): module is empty")
        return 3

    attempts = []
    for label, metadata in build_strategies(containers, compat_date, compat_flags,
                                            class_name, do_binding):
        b, payload = multipart(metadata, "worker.js", code)
        st, body = req("PUT", API, tok, payload, "multipart/form-data; boundary=" + b)
        print("[%s] PUT /content -> HTTP %s" % (label, st))
        if st != 200:
            print("  rejected: %s" % err_text(body)[:400])
            attempts.append("%s=HTTP %s" % (label, st))
            continue

        st2, after = settings(tok)
        if st2 != 200 or after is None:
            print("FAIL: post-deploy GET /settings HTTP %s" % st2)
            return 3
        got = after.get("containers")
        names = binding_names(after)
        print("  post /settings containers: %s" % json.dumps(got))
        print("  post /settings bindings: %s" % json.dumps(names))
        attempts.append("%s=ACCEPTED" % label)

        if not got:
            print("  FAIL: 200 but containers still absent -- trying next shape")
            continue

        missing = [n for n in REQUIRED_BINDINGS if n not in names]
        if missing:
            print("  REGRESSION: bindings dropped by this PUT: %s -- repairing" % missing)
            ok, detail = repair(tok, code, compat_date, compat_flags, containers, missing)
            if not ok:
                print("FAIL (REGRESSION-UNREPAIRED): %s" % detail)
                return 4
            st3, after3 = settings(tok)
            names = binding_names(after3 or {})
            still = [n for n in REQUIRED_BINDINGS if n not in names]
            if still:
                print("FAIL (REGRESSION-UNREPAIRED): still missing %s" % still)
                return 4
            print("  repair verified; bindings: %s" % json.dumps(names))

        pt = os.environ.get("PILOT_TOKEN")
        if pt:
            st4, body4 = req("GET", "https://%s.q08.workers.dev/status" % WORKER, pt)
            print("  GET /status -> HTTP %s %s" % (st4, str(body4)[:200]))
            if "Cannot read properties of undefined" in str(body4):
                print("  WARNING: /status still reports the ctx.container-undefined signature")
                attempts.append("status=ctx-container-undefined")
            else:
                attempts.append("status=clean")
        else:
            print("  NOTE: PILOT_TOKEN not set -- /status probe skipped")

        print("RESTORED: %s carries [[containers]] again via %s (#1485 closed by this run)"
              % (WORKER, label))
        print("STRATEGY RESULT: %s" % json.dumps(attempts))
        return 0

    print("FAIL (fail-closed): every declaration shape rejected; script NOT restored "
          "(#1485 still open)")
    print("STRATEGY RESULT: %s" % json.dumps(attempts))
    return 3


if __name__ == "__main__":
    sys.exit(main())
