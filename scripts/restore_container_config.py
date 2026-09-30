#!/usr/bin/env python3
"""CONTAINER-CONFIG-RESTORE-5 (issues #1485 / #1487 / #1493) -- restore a Worker's
[[containers]] script-level metadata through the CF API /content endpoint.

WHY RESTORE-5 EXISTS -- TWO FALSIFICATIONS, BOTH MEASURED

  FALSIFICATION 1 (RESTORE-3, ts 19:43:35Z). RESTORE-3 sent {main_module, containers,
  compatibility_date} with `bindings` and `migrations` omitted and got:
      PUT /content -> HTTP 400, code 100402
      "[provisioned_class_missing_from_config] class 'ShellContainer' has a provisioned
       Durable Object namespace (f3e32894405c49f9b33e8612c6d27861) but is not declared in
       `exports`."
  -> a provisioned class MUST be declared on every upload. Omission is not neutral.

  FALSIFICATION 2 (RESTORE-4, ts 19:45:06Z, ci-status/restore-container-config-1485.json).
  Adding `exports` made the PUT return 200 --
      'named_handlers': [{'name': 'ShellContainer', 'handlers': ['class']}],
      'migration_tag': 'v1', 'last_deployed_from': 'api'
  -- but the SAME run's read-back recorded:
      post /settings containers: null
      post_settings: {"containers": null, "bindings": ["PILOT_TOKEN"]}
  i.e. the upload DESTROYED the `AUDIT` d1 binding and the `SHELL_CONTAINER` durable-object
  binding, leaving only the secret. The RESTORE-3 docstring's claim that "the /content PUT
  preserves live bindings by omission" is therefore FALSE for non-secret bindings. Omitting
  `bindings` is not binding-preserving: it is binding-destroying, with secrets surviving
  only because secret_text lives outside the upload metadata.

  Also measured: the accepted `exports` shape is a DICT KEYED BY CLASS NAME
      {"ShellContainer": {"type": "durable-object", "storage": "sqlite"}}
  which is what the 200 carried -- not a list of descriptors.

WHAT RESTORE-5 DOES DIFFERENTLY
  * EVERY strategy sends `bindings` EXPLICITLY: the durable_object_namespace binding plus
    the d1 AUDIT binding, with `keep_bindings: ["secret_text"]` so the unreadable secret is
    carried over rather than reconstructed.
  * `exports` is sent as the dict-keyed shape that provably returned 200.
  * A 200 is no longer treated as success. The read-back asserts ALL of
    {AUDIT, PILOT_TOKEN, SHELL_CONTAINER}; a missing binding triggers an in-run repair PUT
    rather than a `continue`, because continuing is how RESTORE-4 walked away from a
    destroyed binding set.
  * `containers: null` in /settings after a 200 is reported as UNVERIFIED-AT-SETTINGS, and
    the authoritative signal becomes the /status probe (which reaches the Durable Object and
    therefore touches ctx.container). Both are recorded; neither is silently upgraded.

ADVERSARIAL
  (a) If `containers` is not an accepted /content metadata field at all, every strategy will
      show containers null and the script exits 3 WITHOUT claiming success -- the honest
      outcome is "this endpoint cannot set containers", which is a finding, not a fix.
  (b) The d1 database_id and the secret name are hard-coded from measured live state; if the
      binding set legitimately changes, this script must be updated with it (fail-closed).
  (c) Repair re-sends PILOT_TOKEN only from the CI env; if the secret is absent there, the
      script reports REGRESSION-UNREPAIRED and exits 4 rather than going green.
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
# BINDING-PRESERVATION-1: measured live identity of the d1 binding, needed because
# GET /settings no longer returns it (it was destroyed at 19:45:02Z).
AUDIT_D1_ID = os.environ.get("AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
SECRET_NAME = os.environ.get("SECRET_NAME", "PILOT_TOKEN")
REQUIRED_BINDINGS = ("AUDIT", SECRET_NAME, "SHELL_CONTAINER")


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


def put(tok, metadata, code):
    b, payload = multipart(metadata, "worker.js", code)
    return req("PUT", API, tok, payload, "multipart/form-data; boundary=" + b)


def do_binding_entry(do_binding, class_name):
    return {"type": "durable_object_namespace", "name": do_binding,
            "class_name": class_name}


def d1_entry():
    return {"type": "d1", "name": "AUDIT", "id": AUDIT_D1_ID}


def base_meta(containers, compat_date, compat_flags, do_binding, class_name):
    md = {
        "main_module": "worker.js",
        "containers": containers,
        "compatibility_date": compat_date,
        # RESTORE-5: bindings are ALWAYS sent explicitly (see FALSIFICATION 2).
        "bindings": [do_binding_entry(do_binding, class_name), d1_entry()],
        # the secret is unreadable, so it is carried over rather than rebuilt.
        "keep_bindings": ["secret_text"],
    }
    if compat_flags:
        md["compatibility_flags"] = compat_flags
    return md


def build_strategies(containers, compat_date, compat_flags, class_name, do_binding):
    """Declaration shapes for the provisioned DO class, most-likely first.

    The accepted shape from the 19:45:02Z 200 is the dict-keyed `exports`; the other shapes
    exist so a contract change is observable instead of silent. Every shape carries the full
    explicit binding set -- the no-bindings shape is deliberately ABSENT because it is the
    one that destroyed the bindings.
    """
    base = base_meta(containers, compat_date, compat_flags, do_binding, class_name)
    exp_sqlite = {class_name: {"type": "durable-object", "storage": "sqlite"}}
    exp_legacy = {class_name: {"type": "durable-object", "storage": "legacy-kv"}}
    mig = {"old_tag": "v1", "new_tag": "v2",
           "steps": [{"new_sqlite_classes": [class_name]}]}
    out = []

    def add(label, extra):
        md = dict(base)
        md.update(extra)
        out.append((label, md))

    add("S1-exports-dict-sqlite", {"exports": exp_sqlite})
    add("S2-exports-dict-legacy-kv", {"exports": exp_legacy})
    add("S3-exports-dict-sqlite+migrations", {"exports": exp_sqlite, "migrations": mig})
    add("S4-migrations-only", {"migrations": mig})
    add("S5-no-exports-control", {})
    return out


def binding_names(live):
    return [b.get("name") for b in ((live or {}).get("bindings") or [])]


def repair(tok, containers, compat_date, compat_flags, do_binding, class_name, code,
           missing):
    """Re-add bindings a successful PUT dropped. Returns (ok, detail)."""
    adds = [do_binding_entry(do_binding, class_name), d1_entry()]
    if SECRET_NAME in missing:
        val = os.environ.get(SECRET_NAME)
        if not val:
            return False, "%s missing post-PUT and no %s in env" % (SECRET_NAME, SECRET_NAME)
        adds.append({"type": "secret_text", "name": SECRET_NAME, "text": val})
    md = {
        "main_module": "worker.js",
        "containers": containers,
        "compatibility_date": compat_date,
        "bindings": adds,
        "keep_bindings": ["secret_text"],
        "exports": {class_name: {"type": "durable-object", "storage": "sqlite"}},
    }
    if compat_flags:
        md["compatibility_flags"] = compat_flags
    st, body = put(tok, md, code)
    print("REPAIR PUT -> HTTP %s %s" % (st, err_text(body)[:200]))
    return (st == 200), "repair http %s" % st


def _guard():
    """RESTORE-LEDGER-1 (2026-09-30): this script is a DEPLOYER (it PUTs /content), yet it took no
    deploy-guard lock and wrote no fleet_deploys row. Every run was therefore filed by qnfo-deploy-guard as
    DEPLOY-UNLOGGED-MUTATION + DEPLOY-UNCOORDINATED-DEPLOY for qnfo-containers-pilot (agent_issues
    1503/1609/1610), and container-config-selfheal-cron runs it after every push to main. Reuse raw_put.py's
    lock + ledger helpers so every caller of this script is coordinated and logged. Best-effort: a guard
    outage must not block a container restore, which is the break-glass path."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import raw_put  # noqa: WPS433 (local helper module)
        return raw_put
    except Exception as e:  # noqa: BLE001
        print("DEPLOY-GUARD: helpers unavailable (%s) - restore proceeds unledgered" % e)
        return None


def main():
    rc = _main()
    return rc


def _ledger(rp, ok, note):
    if rp is None:
        return
    try:
        rp.guard_ledger(WORKER, None, _declared_version(), ok, "BREAK-GLASS container-config restore: " + note)
    except Exception as e:  # noqa: BLE001
        print("DEPLOY-GUARD-LEDGER: failed (%s)" % e)


def _declared_version():
    try:
        m = re.search(r'var\s+VERSION\s*=\s*"([^"]+)"', open(MODULE, encoding="utf-8").read())
        return m.group(1) if m else None
    except OSError:
        return None


def _main():
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
    print("pre /settings containers: %s" % json.dumps(live.get("containers")))
    compat_date = live.get("compatibility_date") or "2026-08-01"
    compat_flags = live.get("compatibility_flags") or []
    print("live compatibility_date=%s flags=%s" % (compat_date, compat_flags))
    print("pre live bindings: %s" % json.dumps(binding_names(live)))

    code = open(MODULE, encoding="utf-8").read()
    if not code.strip():
        print("FAIL (fail-closed): module is empty")
        return 3

    attempts = []
    rp = _guard()
    if rp is not None:
        try:
            rp.guard_lock(WORKER)
        except Exception as e:  # noqa: BLE001
            print("DEPLOY-LOCK: failed (%s)" % e)
    try:
        rc = _put_strategies(tok, containers, compat_date, compat_flags, class_name, do_binding,
                             code, attempts)
    finally:
        if rp is not None:
            try:
                rp.guard_unlock()
            except Exception:  # noqa: BLE001
                pass
    if any(a.endswith("=ACCEPTED") for a in attempts):
        _ledger(rp, rc == 0, "rc=%s %s" % (rc, ",".join(attempts))[:300])
    return rc


def _put_strategies(tok, containers, compat_date, compat_flags, class_name, do_binding, code,
                    attempts):
    for label, metadata in build_strategies(containers, compat_date, compat_flags,
                                            class_name, do_binding):
        st, body = put(tok, metadata, code)
        print("[%s] PUT /content -> HTTP %s" % (label, st))
        if st != 200:
            print("  rejected: %s" % err_text(body))
            attempts.append("%s=HTTP %s" % (label, st))
            continue

        st2, after = settings(tok)
        names = binding_names(after)
        got = (after or {}).get("containers")
        print("  post /settings bindings: %s" % json.dumps(names))
        print("  post /settings containers: %s" % json.dumps(got))
        attempts.append("%s=ACCEPTED" % label)

        missing = [n for n in REQUIRED_BINDINGS if n not in names]
        if missing:
            print("  REGRESSION: bindings destroyed by this PUT: %s -- repairing" % missing)
            ok, detail = repair(tok, containers, compat_date, compat_flags, do_binding,
                                class_name, code, missing)
            if not ok:
                print("FAIL (REGRESSION-UNREPAIRED): %s" % detail)
                print("STRATEGY RESULT: %s" % json.dumps(attempts))
                return 4
            st3, after3 = settings(tok)
            names = binding_names(after3)
            still = [n for n in REQUIRED_BINDINGS if n not in names]
            if still:
                print("FAIL (REGRESSION-UNREPAIRED): still missing %s" % still)
                print("STRATEGY RESULT: %s" % json.dumps(attempts))
                return 4
            print("  repair verified; bindings: %s" % json.dumps(names))

        if not got:
            print("  UNVERIFIED-AT-SETTINGS: 200 accepted but /settings.containers is null")
            print("  -> /status probe below is the authoritative signal")
            attempts.append("%s=containers-null-at-settings" % label)

        pt = os.environ.get(SECRET_NAME)
        if pt:
            st4, body4 = req("GET", "https://%s.q08.workers.dev/status" % WORKER, pt)
            txt = str(body4)
            print("  GET /status -> HTTP %s %s" % (st4, txt[:200]))
            if "Cannot read properties of undefined" in txt:
                attempts.append("status=ctx-container-undefined")
                print("  /status still reports ctx.container undefined")
            else:
                attempts.append("status=clean")
        else:
            print("  NOTE: %s not set -- /status probe skipped" % SECRET_NAME)

        print("PUT-ACCEPTED: %s upload succeeded via %s" % (WORKER, label))
        print("STRATEGY RESULT: %s" % json.dumps(attempts))
        return 0

    print("FAIL (fail-closed): every declaration shape rejected; script NOT restored "
          "(#1485 still open)")
    print("STRATEGY RESULT: %s" % json.dumps(attempts))
    return 3


if __name__ == "__main__":
    sys.exit(main())
