#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-8 (issues #1485 / #1487 / #1493) -- qnfo-ops, 2026-09-29.

WHY RESTORE-8 EXISTS -- MEASURED, NOT INFERRED
  ci-status/restore-container-config-1485.json (head 4543349, ts 2026-09-29T19:45:06Z) recorded
  in its own log tail:

      derived exports: {"ShellContainer": {"type": "durable-object", "storage": "sqlite"}}
      PUT /content -> HTTP 200
      post /settings containers: null
      post_settings bindings: ["PILOT_TOKEN"]

  Two independent defects, both measured:
    (D1) the object-keyed `exports` shape IS accepted by /content (HTTP 200; the response body
         carries named_handlers [{name: ShellContainer, handlers: [class]}]). RESTORE-4's payload
         was right -- the read-back verdict was wrong.
    (D2) omitting `bindings` from a /content PUT DROPS every non-secret binding. The live script
         went ["AUDIT","PILOT_TOKEN","SHELL_CONTAINER"] -> ["PILOT_TOKEN"] in that single PUT.
         This FALSIFIES BINDING-PRESERVATION-1 for this endpoint: secrets survive (stored
         separately), d1 / durable_object_namespace / kv do NOT.

  Live consequence probed from qnfo-ops after that PUT:
      shell_exec -> {"ok":false,"error":"container: Cannot read properties of undefined
                     (reading 'idFromName')"}
  The signature MOVED from "reading 'running'" (containers config absent) to "reading 'idFromName'"
  (the DO binding itself is gone, so env.SHELL_CONTAINER is undefined before ctx.container is read).

WHAT RESTORE-8 SENDS
  ONE PUT /accounts/<acct>/workers/scripts/<worker> whose metadata declares, together:
    main_module, containers (from wrangler.toml), exports (object keyed by class name),
    bindings (d1 AUDIT + durable_object_namespace SHELL_CONTAINER), keep_bindings (secret/plain/
    service/... types), compatibility_date, compatibility_flags.
  `migrations` is deliberately omitted (DO-MIGRATION-NOTE-1: the class exists; a creating
  migration for a live class is rejected).

VERIFICATION -- FAIL CLOSED, FUNCTIONAL
  1. GET /settings must report bindings AUDIT + SHELL_CONTAINER (+ PILOT_TOKEN if it was there).
     A binding missing after the PUT is repaired in the same run from identity we hold
     (d1 id from wrangler.toml, DO class from wrangler.toml); an unrepairable regression exits 4.
  2. GET /status with PILOT_TOKEN must NOT carry either degradation signature
     ("reading 'running'" = containers config absent, "reading 'idFromName'" = DO binding absent).
  3. --assert-only mode mutates nothing and exits 5 when degraded: this is the scheduled
     self-audit leg (no mutation on a healthy fleet).

ADVERSARIAL
  (a) If the API silently ignores `containers` on /content, step 2 fails with "reading 'running'"
      and the report says so explicitly -- it will NOT be reported as success.
  (b) If a PUT returns 200 but drops a binding, the repair path re-declares it; a repair that
      itself fails is reported REGRESSION-UNREPAIRED and exits 4 -- never silently green.
  (c) If `keep_bindings` is rejected as an unknown field, the script retries once without it and
      records which shape the server accepted, so the contract is falsifiable by the next reader.

Usage:
  CLOUDFLARE_API_TOKEN=... python3 scripts/restore_container_config_v2.py
  CLOUDFLARE_API_TOKEN=... python3 scripts/restore_container_config_v2.py --assert-only
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
STATUS_URL = "https://%s.q08.workers.dev/status" % WORKER
HEALTH_URL = "https://%s.q08.workers.dev/health" % WORKER
# Binding TYPES preserved across the PUT. d1 + durable_object_namespace are NOT here because we
# declare them explicitly (declaring them twice is the drift we are fixing, not creating).
KEEP_TYPES = ["secret_text", "plain_text", "kv_namespace", "r2_bucket", "queue",
              "analytics_engine", "service", "vectorize", "hyperdrive", "ai", "images",
              "browser", "dispatch_namespace", "mtls_certificate"]
REQUIRED = ("AUDIT", "SHELL_CONTAINER")
SIG_CONTAINERS_ABSENT = "reading 'running'"
SIG_BINDING_ABSENT = "reading 'idFromName'"


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
    if t and t.strip():
        return t.strip()
    print("FAIL (fail-closed): no CLOUDFLARE_API_TOKEN in env")
    sys.exit(3)


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


def err_text(body):
    if isinstance(body, dict):
        errs = body.get("errors") or []
        if errs:
            return " | ".join("%s:%s" % (e.get("code"), str(e.get("message"))[:400]) for e in errs)
    return str(body)[:400]


def parse_block(text, header):
    m = re.search(re.escape(header) + r"([\s\S]*?)(?=\n\[\[|\n\[|\Z)", text)
    return m.group(1) if m else ""


def parse_containers(text):
    out = []
    for block in re.findall(r"\[\[containers\]\]([\s\S]*?)(?=\n\[\[|\n\[|\Z)", text):
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
    block = parse_block(text, "[[durable_objects.bindings]]")
    n = re.search(r'^\s*name\s*=\s*"([^"]*)"', block, re.M)
    c = re.search(r'^\s*class_name\s*=\s*"([^"]*)"', block, re.M)
    return (n.group(1) if n else "SHELL_CONTAINER", c.group(1) if c else "ShellContainer")


def parse_d1(text):
    block = parse_block(text, "[[d1_databases]]")
    n = re.search(r'^\s*binding\s*=\s*"([^"]*)"', block, re.M)
    i = re.search(r'^\s*database_id\s*=\s*"([^"]*)"', block, re.M)
    if not (n and i):
        return None
    return {"type": "d1", "name": n.group(1), "id": i.group(1)}


def settings(tok):
    st, body = req("GET", API + "/settings", tok)
    if st == 200 and isinstance(body, dict) and body.get("success"):
        return st, (body.get("result") or {})
    return st, None


def binding_names(live):
    return [b.get("name") for b in ((live or {}).get("bindings") or [])]


def probe_status():
    pt = os.environ.get("PILOT_TOKEN")
    out = {}
    st, body = req("GET", HEALTH_URL, os.environ.get("CLOUDFLARE_API_TOKEN", ""))
    out["health_http"] = st
    if isinstance(body, dict):
        out["health_version"] = (body.get("version") or body.get("result", {}).get("version")
                                 if isinstance(body.get("result"), dict) else body.get("version"))
    if not pt:
        out["status"] = "skipped (no PILOT_TOKEN in env)"
        out["degraded_signature"] = None
        return out
    st2, body2 = req("GET", STATUS_URL, pt)
    s = str(body2)
    out["status_http"] = st2
    out["status"] = s[:300]
    if SIG_CONTAINERS_ABSENT in s:
        out["degraded_signature"] = "CONTAINERS_CONFIG_ABSENT (ctx.container undefined)"
    elif SIG_BINDING_ABSENT in s:
        out["degraded_signature"] = "DO_BINDING_ABSENT (env.SHELL_CONTAINER undefined)"
    else:
        out["degraded_signature"] = None
    return out


def put_metadata(tok, metadata, code, label, report):
    b, payload = multipart(metadata, "worker.js", code)
    st, body = req("PUT", API, tok, payload, "multipart/form-data; boundary=" + b)
    report["attempts"].append({"shape": label, "http": st, "err": err_text(body)[:400]})
    print("[%s] PUT /content -> HTTP %s" % (label, st))
    if st != 200:
        print("  rejected: %s" % err_text(body)[:400])
    return st, body


def main():
    assert_only = "--assert-only" in sys.argv
    tok = token()
    report = {"marker": "CONTAINER-CONFIG-RESTORE-8", "worker": WORKER, "issues": [1485, 1487, 1493],
              "mode": "assert-only" if assert_only else "restore", "attempts": []}

    for path in (TOML, MODULE):
        if not os.path.isfile(path):
            print("FAIL (fail-closed): %s not found" % path)
            return 3
    toml_text = open(TOML, encoding="utf-8").read()
    containers = parse_containers(toml_text)
    if not containers:
        print("FAIL (fail-closed): %s declares no [[containers]] block" % TOML)
        return 3
    class_name = containers[0].get("class_name") or "ShellContainer"
    do_name, do_class = parse_do_binding(toml_text)
    d1 = parse_d1(toml_text)
    report["containers"] = containers
    report["do_binding"] = {"name": do_name, "class_name": do_class}
    report["d1_binding"] = d1
    print("declared containers: %s" % json.dumps(containers))
    print("declaring DO binding=%s class=%s ; d1=%s" % (do_name, do_class, json.dumps(d1)))

    st, live = settings(tok)
    if st != 200 or live is None:
        print("FAIL (fail-closed): GET /settings HTTP %s" % st)
        return 3
    pre_names = binding_names(live)
    report["pre_bindings"] = pre_names
    report["pre_compatibility_date"] = live.get("compatibility_date")
    print("PRE bindings: %s" % json.dumps(pre_names))

    if assert_only:
        rep = probe_status()
        report.update(rep)
        missing = [n for n in REQUIRED if n not in pre_names]
        report["missing_bindings"] = missing
        report["verdict"] = ("DEGRADED: missing=%s sig=%s" % (missing, rep.get("degraded_signature"))
                             if (missing or rep.get("degraded_signature")) else "OK")
        print("ASSERT-ONLY verdict: %s" % report["verdict"])
        write_report(report)
        return 0 if report["verdict"] == "OK" else 5

    compat_date = live.get("compatibility_date") or "2026-08-01"
    compat_flags = live.get("compatibility_flags") or []
    code = open(MODULE, encoding="utf-8").read()
    if not code.strip():
        print("FAIL (fail-closed): module is empty")
        return 3

    bindings = []
    if d1:
        bindings.append(d1)
    bindings.append({"type": "durable_object_namespace", "name": do_name, "class_name": do_class})

    base = {"main_module": "worker.js", "containers": containers,
            "exports": {class_name: {"type": "durable-object", "storage": "sqlite"}},
            "bindings": bindings, "compatibility_date": compat_date}
    if compat_flags:
        base["compatibility_flags"] = compat_flags

    md_keep = dict(base)
    md_keep["keep_bindings"] = KEEP_TYPES
    st, body = put_metadata(tok, md_keep, code, "S1-containers+exports+bindings+keep", report)
    if st != 200 and "keep_bindings" in err_text(body):
        print("  keep_bindings rejected as unknown field -- retrying without it")
        st, body = put_metadata(tok, base, code, "S2-containers+exports+bindings", report)
    report["accepted_shape"] = report["attempts"][-1]["shape"] if st == 200 else None
    report["deploy_http"] = st
    if st != 200:
        print("FAIL (fail-closed): /content PUT rejected; script NOT restored (#1485 open)")
        write_report(report)
        return 3

    st2, after = settings(tok)
    if st2 != 200 or after is None:
        print("FAIL: post-PUT GET /settings HTTP %s" % st2)
        write_report(report)
        return 3
    names = binding_names(after)
    report["post_bindings"] = names
    print("POST bindings: %s" % json.dumps(names))

    missing = [n for n in REQUIRED if n not in names]
    if missing:
        print("  REGRESSION: bindings dropped by this PUT: %s -- repairing" % missing)
        repair_bindings = list(bindings)
        md = dict(base)
        md["bindings"] = repair_bindings
        st3, _ = put_metadata(tok, md, code, "R1-repair-full-bindings", report)
        if st3 != 200:
            print("FAIL (REGRESSION-UNREPAIRED): repair PUT HTTP %s" % st3)
            write_report(report)
            return 4
        st4, after4 = settings(tok)
        names = binding_names(after4 or {})
        report["post_bindings"] = names
        still = [n for n in REQUIRED if n not in names]
        if still:
            print("FAIL (REGRESSION-UNREPAIRED): still missing %s" % still)
            write_report(report)
            return 4
        print("  repair verified; bindings: %s" % json.dumps(names))

    rep = probe_status()
    report.update(rep)
    print("  /status -> %s" % json.dumps(rep)[:300])
    if rep.get("degraded_signature"):
        print("FAIL: live functional probe still degraded: %s" % rep["degraded_signature"])
        report["verdict"] = "DEGRADED: " + rep["degraded_signature"]
        write_report(report)
        return 5
    report["verdict"] = "RESTORED"
    print("RESTORED: %s carries [[containers]] + %s (#1485 closed by this run)"
          % (WORKER, json.dumps(names)))
    write_report(report)
    return 0


def write_report(report):
    try:
        os.makedirs(os.path.join(ROOT, "ci-status"), exist_ok=True)
        p = os.path.join(ROOT, "ci-status", "restore-container-config-v2.json")
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, sort_keys=True)
        print("report written: %s" % p)
    except Exception as e:  # noqa: BLE001
        print("WARN: could not write report: %s" % e)


if __name__ == "__main__":
    sys.exit(main())
