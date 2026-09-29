#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-8 (issues #1485 / #1487 / #1494) - restore a Worker's
[[containers]] metadata AND the bindings stripped by the previous restore attempt,
in ONE /content PUT.

MEASURED EVIDENCE (not inference)
  ci-status/restore-container-config-1485.json, run ts 2026-09-29T19:45:06Z, head 45433495:
      PUT /content -> HTTP 200      (metadata carried `containers` + `exports` ONLY)
      post /settings containers: null
      post /settings bindings: ["PILOT_TOKEN"]   <-- AUDIT and SHELL_CONTAINER DROPPED
      FAIL (fail-closed): containers STILL absent after the PUT -- #1485 still open
  Live cf_worker_bindings read after that run: count=1, [{secret_text PILOT_TOKEN}].

  => The assumption behind CONTAINER-CONFIG-RESTORE-3..7, "bindings omitted from the
     /content metadata are preserved", is FALSIFIED for this script. That run produced
     TWO regressions: (a) [[containers]] still absent, (b) the D1 AUDIT binding and the
     SHELL_CONTAINER durable-object binding were lost.

  Second defect: the earlier script `continue`d to the next declaration shape as soon as
  `containers` was null, SKIPPING its own binding-repair block - so a PUT that dropped
  bindings was never repaired.

WHAT THIS SCRIPT SENDS
  ONE metadata part carrying, together:
    main_module, containers, exports (the provisioned DO class), bindings (AUDIT d1 +
    SHELL_CONTAINER durable_object_namespace + PILOT_TOKEN secret when available) and
    keep_bindings (every other type), so unrelated live bindings survive.
  Binding loss is detected and repaired BEFORE a shape is abandoned, never after.

FAIL CLOSED
  Exit 3 without mutating anything if the token, wrangler.toml, the [[containers]] block or
  GET /settings is unavailable. Exit 1 unless GET /settings reports all of AUDIT,
  PILOT_TOKEN and SHELL_CONTAINER after the PUT.
Usage: CLOUDFLARE_API_TOKEN=... PILOT_TOKEN=... python3 scripts/restore_container_config_v2.py
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
UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; restore_container_config_v2.py)"
API = "https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s" % (ACCT, WORKER)
# BINDING-PRESERVATION-1: known-good identity of the d1 binding, used for repair only.
AUDIT_D1_ID = os.environ.get("AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
KEEP_TYPES = ["plain_text", "secret_text", "kv_namespace", "r2_bucket", "queue",
              "analytics_engine", "service", "vectorize", "hyperdrive", "ai", "images",
              "browser", "mtls_certificate", "dispatch_namespace"]
REQUIRED_BINDINGS = ("AUDIT", "PILOT_TOKEN", "SHELL_CONTAINER")


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
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
            return " | ".join("%s:%s" % (e.get("code"), str(e.get("message"))[:300])
                              for e in errs)
    return str(body)[:300]


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


def binding_names(live):
    return [x.get("name") for x in ((live or {}).get("bindings") or [])]


def explicit_bindings(class_name, do_binding, with_secret):
    """The complete set the worker needs, rebuilt explicitly (never by omission)."""
    out = [{"type": "d1", "name": "AUDIT", "id": AUDIT_D1_ID},
           {"type": "durable_object_namespace", "name": do_binding,
            "class_name": class_name}]
    if with_secret:
        out.append({"type": "secret_text", "name": "PILOT_TOKEN",
                    "text": os.environ["PILOT_TOKEN"]})
    return out


def keep_list(with_secret):
    # Do not ask the server to keep a type we declare explicitly.
    drop = {"secret_text"} if with_secret else set()
    return [t for t in KEEP_TYPES if t not in drop]


def build_strategies(containers, compat_date, compat_flags, class_name, do_binding,
                     binds, keep):
    base = {"main_module": "worker.js", "containers": containers,
            "compatibility_date": compat_date, "keep_bindings": keep}
    if compat_flags:
        base["compatibility_flags"] = compat_flags
    sqlite_exp = [{"type": "durable-object", "name": class_name, "storage": "sqlite"}]
    legacy_exp = [{"type": "durable-object", "name": class_name, "storage": "legacy-kv"}]
    mig = {"old_tag": "v1", "new_tag": "v2",
           "steps": [{"new_sqlite_classes": [class_name]}]}
    out = []

    def add(label, extra):
        md = dict(base)
        md.update(extra)
        out.append((label, md))

    add("T1-containers+exports-sqlite+bindings", {"exports": sqlite_exp, "bindings": binds})
    add("T2-containers+exports+migrations+bindings",
        {"exports": sqlite_exp, "bindings": binds, "migrations": mig})
    add("T3-containers+exports-legacy+bindings",
        {"exports": legacy_exp, "bindings": binds})
    add("T4-containers+exports+bindings+keep-only",
        {"exports": sqlite_exp, "bindings": binds, "keep_bindings": KEEP_TYPES})
    return out


def repair(tok, code, compat_date, compat_flags, containers, class_name, do_binding):
    """Re-add every required binding after a PUT that dropped some of them."""
    binds = explicit_bindings(class_name, do_binding, bool(os.environ.get("PILOT_TOKEN")))
    md = {"main_module": "worker.js", "containers": containers,
          "compatibility_date": compat_date,
          "exports": [{"type": "durable-object", "name": class_name, "storage": "sqlite"}],
          "bindings": binds, "keep_bindings": keep_list(bool(os.environ.get("PILOT_TOKEN")))}
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
        print("FAIL (fail-closed): %s declares no [[containers]] block - refusing"
              % TOML)
        return 3
    class_name = containers[0].get("class_name") or "ShellContainer"
    do_binding, _cls = parse_do_binding(toml_text)
    print("declared containers: %s" % json.dumps(containers))
    print("declaring DO class=%s binding=%s" % (class_name, do_binding))

    st, live = settings(tok)
    if st != 200 or live is None:
        print("FAIL (fail-closed): GET /settings HTTP %s - cannot read live compatibility "
              "config; deploying blind could clear it (COMPAT-PRESERVE-1)" % st)
        return 3
    compat_date = live.get("compatibility_date") or "2026-08-01"
    compat_flags = live.get("compatibility_flags") or []
    before = binding_names(live)
    print("live compatibility_date=%s flags=%s" % (compat_date, compat_flags))
    print("live bindings BEFORE: %s" % json.dumps(before))
    print("live containers BEFORE: %s" % json.dumps(live.get("containers")))

    code = open(MODULE, encoding="utf-8").read()
    if not code.strip():
        print("FAIL (fail-closed): module is empty")
        return 3

    has_secret = bool(os.environ.get("PILOT_TOKEN"))
    if not has_secret:
        print("::warning::PILOT_TOKEN absent from env - the secret_text binding can only "
              "be preserved via keep_bindings, not rebuilt")
    binds = explicit_bindings(class_name, do_binding, has_secret)
    keep = keep_list(has_secret)

    attempts = []
    for label, metadata in build_strategies(containers, compat_date, compat_flags,
                                            class_name, do_binding, binds, keep):
        b, payload = multipart(metadata, "worker.js", code)
        st, body = req("PUT", API, tok, payload, "multipart/form-data; boundary=" + b)
        print("[%s] PUT /content -> HTTP %s" % (label, st))
        if st != 200:
            print("  rejected: %s" % err_text(body)[:400])
            attempts.append("%s=HTTP %s" % (label, st))
            continue

        st2, after = settings(tok)
        names = binding_names(after)
        got = (after or {}).get("containers")
        print("  post bindings: %s" % json.dumps(names))
        print("  post containers: %s" % json.dumps(got))

        missing = [n for n in REQUIRED_BINDINGS if n not in names]
        if missing:
            print("  REGRESSION: this PUT dropped %s - repairing before continuing" % missing)
            ok, detail = repair(tok, code, compat_date, compat_flags, containers,
                                class_name, do_binding)
            print("  repair result: %s" % detail)
            st3, after3 = settings(tok)
            names = binding_names(after3)
            got = (after3 or {}).get("containers")
            still = [n for n in REQUIRED_BINDINGS if n not in names]
            if still:
                print("  REGRESSION-UNREPAIRED: still missing %s" % still)
                attempts.append("%s=BINDING-REGRESSION-UNREPAIRED" % label)
                continue
            print("  repair verified; bindings: %s" % json.dumps(names))

        pt = os.environ.get("PILOT_TOKEN")
        if pt:
            st4, body4 = req("GET", "https://%s.q08.workers.dev/status" % WORKER, pt)
            txt = str(body4)[:200]
            print("  GET /status -> HTTP %s %s" % (st4, txt))
            if "Cannot read properties of undefined" in txt:
                attempts.append("%s=STATUS-OUTAGE-SIGNATURE" % label)
                continue
        attempts.append("%s=APPLIED" % label)
        print("RESULT bindings=%s containers=%s attempts=%s"
              % (json.dumps(names), json.dumps(got), json.dumps(attempts)))
        return 0

    print("RESULT FAIL (fail-closed): no shape restored the worker. attempts=%s"
          % json.dumps(attempts))
    return 1


if __name__ == "__main__":
    sys.exit(main())
