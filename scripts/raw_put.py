#!/usr/bin/env python3
"""raw_put.py - binding-preserving AND settings-preserving module deploy via CF API /content.

WHY /content AND NOT wrangler: `wrangler deploy` sets bindings FROM wrangler.toml. Where the
toml cannot reproduce the live bindings, a wrangler deploy SILENTLY DROPS them
(BINDING-PRESERVATION-1). Canonical: qnfo-fleet-control's wrangler.toml declares 17 bindings
while live has 24 -- it omits the FleetAdvisor Durable Object and 6 secrets -- so a wrangler
deploy of that worker would break it. The CF API `/content` endpoint updates ONLY the code,
preserving every live binding. This is the same method qnfo-fleet-control uses to redeploy the
fleet.

COMPAT-PRESERVE-1 (2026-09-29, issue 1358): this deployer used to send multipart metadata of
`{"main_module": "worker.js"}` ONLY -- it omitted compatibility_date and compatibility_flags.
Ledger entry 2.36.46 records the identical defect in cfWorkerDeploy: omitting the date CLEARED
it on every deploy, which turned off streams_enable_constructors, made `new ReadableStream()`
throw at all 5 call sites, and broke EVERY streaming response while non-streaming kept working
(silent, half-broken worker). A deploy through this script could therefore re-break streaming
across the fleet. Now:
  * the live /settings are read FIRST and compatibility_date + compatibility_flags are carried
    into the metadata, so the PUT can never clear them;
  * a brand-new worker gets a compatibility_date FLOOR instead of an empty date;
  * if the settings cannot be read for an existing worker the script FAILS CLOSED (exit 3) and
    deploys nothing -- it never guesses;
  * after the PUT the settings are re-read and the date/flags are asserted to have survived;
    a cleared date is a hard failure, not a silent regression.

DEPLOY-LEDGER-1 (2026-09-29, issues 1352 / 1363): after the deploy is verified this script now
records the mutation in qnfo-audit.deployment_history through the D1 REST API, using the same
CLOUDFLARE_API_TOKEN it already needs. Root cause of the class: this deployer changed live code
and wrote NO ledger row, so the ledger drifted (the newest qnfo-ops row was 2.37.14 while live
had advanced to 2.37.17, then 2.37.19, then 2.37.20) and every drift check built on the ledger
returned a false verdict -- including one that reported "no drift" on a worker that had moved
three versions. The row carries the artifact VERSION parsed out of the bundle being deployed.
  * LEDGER_STRICT=1 makes a failed ledger write fatal (exit 3).
  * Default is non-fatal but LOUD: it prints "DEPLOY-LEDGER: FAILED" and still exits 0, because
    a token-scope problem must not block every fleet deploy. CI should grep for that marker.

AUTODEPLOY-SCHEDULES-NOT-APPLIED-1 (2026-09-29, issue 1390): /content PUTs NEVER touch a
worker's cron trigger, and this script had ZERO references to schedules/crons/triggers. So a
repo `crons = [...]` EDIT was inert forever -- the #1193/#1337 fix (fleet-exec hourly -> */10)
was committed, deployed, and still never fired (last_fired never advanced past 08:00:47Z). 60
wrangler.toml files in this repo declare crons, so the class was fleet-wide, and this script is
the deployer used by the DEFAULT-ON automatic path (fleet-autodeploy.yml -> fleet-autoaudit.py
--apply -> raw_put.py). Now the declared trigger set is read from the artifact's sibling
wrangler.toml and applied to PUT /accounts/<acct>/workers/scripts/<name>/schedules, then read
back and compared. Contract (fail-loud, never destructive):
  * toml declares no crons      -> SKIP. An empty list is NEVER PUT: /schedules REPLACES the
                                   whole trigger set, so an empty PUT would CLEAR live triggers.
  * PUT fails / not permitted   -> "SCHEDULES: FAILED" marker; fatal only under SCHEDULES_STRICT=1
                                   (a token-scope problem must not block every fleet deploy).
  * PUT ok, read-back differs   -> "SCHEDULES-DRIFT" marker (fatal under SCHEDULES_STRICT=1).
  * already in sync             -> no PUT at all (idempotent; no needless mutation).
  * >3 declared                 -> WARNING (the CF limit is 3 cron triggers per Worker).
The before/after trigger sets are printed and recorded in the ledger note, so a cron change can
never again be applied without an audit trail.

Usage:  CLOUDFLARE_API_TOKEN=... python scripts/raw_put.py <worker> <path/to/worker.js>
Env:    LEDGER_STRICT=1, SCHEDULES_STRICT=1 (fail-closed on ledger / schedules failures)
Exit:   0 ok | 3 fail-closed (nothing is deployed on error)
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
import atexit
from datetime import datetime, timezone

ACCT = os.environ.get("CF_ACCOUNT_ID", "edb167b78c9fb901ea5bca3ce58ccc4b")
DATE_FLOOR = "2026-08-01"
AUDIT_DB = os.environ.get("CF_AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
# LEDGER-VERSION-EXTRACT-1 (issue 1370 defect B): the old regex matched ONLY
# `var VERSION = "..."`. A worker using `const QNFO_VERSION = "..."`
# (qnfo-lifecycle, qnfo-memory-mcp) was recorded in deployment_history as
# version_id="unknown" -- confirmed live: row 120, qnfo-lifecycle, deployed
# 2026-09-29T16:13:04Z, while the bundle it shipped declares
# const QNFO_VERSION = "1.6.3-version-sot". Same alternation as
# scripts/deploy-drift-guard.py CONST, so the two tools cannot disagree.
VERSION_RE = re.compile(r'(?:var|let|const)\s+(?:QNFO_)?VERSION\s*=\s*["\x27]([^"\x27]+)["\x27]')


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if t:
        return t.strip()
    p = r"C:\Users\LENOVO\tokens\cloudflare"
    if os.path.exists(p):
        return open(p).read().strip()
    raise SystemExit("no CF token (set CLOUDFLARE_API_TOKEN)")


def _api(url, tok, data=None, ctype=None):
    headers = {"Authorization": "Bearer " + tok, "User-Agent": FLEET_UA}
    if ctype:
        headers["Content-Type"] = ctype
    req = urllib.request.Request(url, data=data, method="PUT" if data else "GET", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw)
            except ValueError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, body
    except Exception as e:
        return 0, "ERR " + str(e)


def _post_json(url, tok, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json",
                 "User-Agent": FLEET_UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, "ERR " + str(e)


def _settings(worker, tok):
    st, body = _api(f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/workers/scripts/{worker}/settings", tok)
    if st == 200 and isinstance(body, dict) and body.get("success"):
        return st, (body.get("result") or {})
    return st, None


GUARD = os.environ.get("DEPLOY_GUARD_URL", "https://qnfo-deploy-guard.q08.workers.dev")

# CF-URLLIB-UA-1010-1 - explicit UA; Cloudflare 403/1010 bans the urllib default UA.
FLEET_UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; raw_put.py)"
_LOCK = {"worker": None, "token": None}  # DEPLOY-GUARD-WRAP-2


def _guard_call(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(GUARD + path, data=data, method="POST",
                                 headers={"Content-Type": "application/json",
                                          "User-Agent": FLEET_UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except ValueError:
            return e.code, None
    except Exception as e:
        return 0, {"error": str(e)}


def guard_lock(worker):
    """Acquire a deploy_locks lease. Non-fatal: the fleet_deploys row is the rule
    that closes unlogged-mutation; the lease only closes uncoordinated-deploy."""
    st, j = _guard_call("/lock/acquire", {"worker": worker, "owner": "ci/raw_put",
                                          "actor": "scripts/raw_put.py",
                                          "session_id": uuid.uuid4().hex, "ttl_sec": 900})
    if st == 200 and j and j.get("acquired"):
        _LOCK["worker"], _LOCK["token"] = worker, j.get("token")
        print("DEPLOY-LOCK: acquired ttl=900")
        return True
    print("DEPLOY-LOCK: NOT acquired (HTTP %s) %s - deploying anyway; uncoordinated-deploy may fire"
          " | CF-URLLIB-UA-1010-1: HTTP 403 code 1010 means the User-Agent was rejected"
          % (st, str(j)[:160]))
    return False


def guard_unlock():
    if _LOCK["worker"] and _LOCK["token"]:
        st, j = _guard_call("/lock/release", {"worker": _LOCK["worker"], "token": _LOCK["token"]})
        print("DEPLOY-LOCK: release HTTP %s %s" % (st, str(j)[:120]))
        _LOCK["worker"], _LOCK["token"] = None, None


def guard_ledger(worker, frm, to, ok, note):
    """POST /ledger so fleet_deploys advances - the table the guard actually reads."""
    st, j = _guard_call("/ledger", {"worker": worker, "actor": "scripts/raw_put.py",
                                    "from": frm, "to": to, "source_path": "scripts/raw_put.py",
                                    "ok": bool(ok), "note": note})
    good = st == 200 and bool(j and j.get("logged"))
    print("DEPLOY-GUARD-LEDGER: HTTP %s %s %s" % (st, "OK" if good else "FAILED", str(j)[:160]))
    if st == 403:
        print("  ^ CF-URLLIB-UA-1010-1: guard rejected this client (Cloudflare 1010). The ledger did NOT advance.")
    return good


def artifact_version(code):
    m = VERSION_RE.search(code)
    return m.group(1) if m else "unknown"


# --- AUTODEPLOY-SCHEDULES-NOT-APPLIED-1 (issue 1390) --------------------------------
SCHEDULES_API = ("https://api.cloudflare.com/client/v4/accounts/{acct}"
                 "/workers/scripts/{worker}/schedules")
CRON_BLOCK_RE = re.compile(r'^\s*crons\s*=\s*\[(.*?)\]', re.M | re.S)
CRON_STR_RE = re.compile(r'"([^"]*)"')
CF_MAX_CRONS = 3


def declared_crons(artifact_path):
    """Read `crons = [...]` from the wrangler config beside the artifact.

    Returns a list (possibly empty) when the config declares crons, or None when no config
    declares them. None MUST NOT be read as "clear the live trigger": /schedules REPLACES the
    whole set, so PUTting an empty list would silently delete live crons.
    """
    d = os.path.dirname(os.path.abspath(artifact_path))
    for fn in ("wrangler.toml", "wrangler.json", "wrangler.jsonc"):
        p = os.path.join(d, fn)
        if not os.path.isfile(p):
            continue
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            return None
        if fn == "wrangler.toml":
            m = CRON_BLOCK_RE.search(text)
            if not m:
                return None
            return [c for c in CRON_STR_RE.findall(m.group(1)) if c.strip()]
        try:
            data = json.loads(text)
        except ValueError:
            return None
        if not isinstance(data, dict):
            return None
        cr = ((data.get("triggers") or {}) if isinstance(data.get("triggers"), dict) else {}).get("crons")
        if cr is None:
            cr = data.get("crons")
        if not isinstance(cr, list):
            return None
        return [c for c in cr if isinstance(c, str) and c.strip()]
    return None


def schedules_get(worker, tok):
    st, body = _api(SCHEDULES_API.format(acct=ACCT, worker=worker), tok)
    if st == 200 and isinstance(body, dict) and body.get("success"):
        return st, sorted(body.get("result") or [])
    return st, None


def schedules_put(worker, crons, tok):
    # CF-SCHEDULES-UA-1010-1: the schedules PUT sent no explicit client id, and Cloudflare
    # answers urllib's default one with HTTP 403 / error 1010. So this call failed
    # on EVERY deploy (ledger: schedules=FAILED) and every repo crons edit was
    # inert fleet-wide. Send the module's own client id, the one every other call
    # in this file already sends.
    url = SCHEDULES_API.format(acct=ACCT, worker=worker)
    data = json.dumps({"crons": list(crons)}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT", headers={
        "Authorization": "Bearer " + tok, "Content-Type": "application/json",
        "User-Agent": FLEET_UA})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, r.read().decode()[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]
    except Exception as e:
        return 0, "ERR " + str(e)


def schedules_apply(worker, artifact_path, tok):
    """Apply + verify the trigger set declared beside the artifact. True when the live
    trigger matches the declaration (or nothing was declared); False on any failure."""
    want = declared_crons(artifact_path)
    if not want:
        print("SCHEDULES: SKIP - no crons declared beside the artifact (live trigger untouched)")
        return True
    if len(want) > CF_MAX_CRONS:
        print("SCHEDULES: WARNING - %d crons declared but the CF limit is %d per Worker"
              % (len(want), CF_MAX_CRONS))
    st0, have = schedules_get(worker, tok)
    print("SCHEDULES: declared=%s live=%s" % (want, have if st0 == 200 else "HTTP %s" % st0))
    if st0 == 200 and have == sorted(want):
        print("SCHEDULES: already in sync (%d cron(s)) - no PUT" % len(want))
        return True
    st, out = schedules_put(worker, want, tok)
    print("SCHEDULES: PUT HTTP %s %s" % (st, out))
    if st != 200:
        print("SCHEDULES: FAILED - repo crons are INERT for %s (AUTODEPLOY-SCHEDULES-NOT-APPLIED-1)" % worker)
        return False
    st2, after = schedules_get(worker, tok)
    if st2 == 200 and after == sorted(want):
        print("SCHEDULES: VERIFIED %s" % after)
        return True
    print("SCHEDULES-DRIFT: read-back %s != declared %s (HTTP %s)" % (after, want, st2))
    return False


def ledger_write(worker, version, tok, notes):
    """DEPLOY-LEDGER-1: record the mutation so the ledger can never silently lag live again."""
    sql = (
        "INSERT INTO deployment_history "
        "(resource_type, resource_name, action, version_id, deployed_by, deployed_at, status, notes) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    params = ["worker", worker, "deploy", version, "scripts/raw_put.py", stamp, "success", notes]
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/d1/database/{AUDIT_DB}/query"
    st, body = _post_json(url, tok, {"sql": sql, "params": params})
    ok = False
    try:
        parsed = json.loads(body)
        ok = st == 200 and bool(parsed.get("success"))
    except ValueError:
        ok = False
    print(f"DEPLOY-LEDGER: HTTP {st} {'OK' if ok else 'FAILED'} {str(body)[:200]}")
    return ok



# --- CONTAINER-CONFIG-PRESERVE-1 (issues #1485 / #1487) ------------------------------
# Cloudflare stores [[containers]] as SCRIPT-LEVEL metadata, NOT as a binding, so
# BINDING-PRESERVATION-1 cannot protect it and a /content PUT that omits it DESTROYS it.
CONTAINER_BLOCK_RE = re.compile(r"\[\[containers\]\]([\s\S]*?)(?=\n\[\[|\Z)")
CONTAINER_KEY_RE = {
    "class_name": re.compile(r'^\s*class_name\s*=\s*"([^"]*)"', re.M),
    "image": re.compile(r'^\s*image\s*=\s*"([^"]*)"', re.M),
    "instance_type": re.compile(r'^\s*instance_type\s*=\s*"([^"]*)"', re.M),
}
CONTAINER_MAX_RE = re.compile(r"^\s*max_instances\s*=\s*(\d+)", re.M)


def declared_containers(artifact_path):
    """[[containers]] declared beside the artifact -> list of dicts, or [] when none."""
    d = os.path.dirname(os.path.abspath(artifact_path))
    for fn in ("wrangler.toml", "wrangler.json", "wrangler.jsonc"):
        p = os.path.join(d, fn)
        if not os.path.isfile(p):
            continue
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            return []
        if fn != "wrangler.toml":
            try:
                data = json.loads(text)
            except ValueError:
                return []
            cr = data.get("containers") if isinstance(data, dict) else None
            return [c for c in cr if isinstance(c, dict)] if isinstance(cr, list) else []
        out = []
        for block in CONTAINER_BLOCK_RE.findall(text):
            entry = {}
            for key, rx in CONTAINER_KEY_RE.items():
                m = rx.search(block)
                if m:
                    entry[key] = m.group(1)
            m = CONTAINER_MAX_RE.search(block)
            if m:
                entry["max_instances"] = int(m.group(1))
            if entry:
                out.append(entry)
        return out
    return []


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 3
    worker, path = argv[1], argv[2]
    tok = token()
    guard_lock(worker)
    atexit.register(guard_unlock)
    code = open(path, encoding="utf-8").read()
    if not code.strip():
        print("REFUSING: artifact is empty")
        return 3

    st, live = _settings(worker, tok)
    if st == 200 and live is not None:
        compat_date = live.get("compatibility_date")
        compat_flags = live.get("compatibility_flags") or []
        print(f"live settings read: compatibility_date={compat_date!r} compatibility_flags={compat_flags}")
    elif st == 404:
        compat_date, compat_flags = None, []
        print(f"note: {worker} does not exist yet; will apply compatibility_date floor {DATE_FLOOR}")
    else:
        print(f"FAIL-CLOSED: could not read live /settings for {worker} (HTTP {st}).")
        print("Refusing to PUT: an unread date would be cleared by the deploy (COMPAT-PRESERVE-1).")
        return 3
    if not compat_date:
        compat_date = DATE_FLOOR

    meta = {"main_module": "worker.js", "compatibility_date": compat_date}
    # CONTAINER-CONFIG-PRESERVE-1: /content PUT metadata that omits `containers` DESTROYS the
    # script-level container config (it is NOT a binding, so BINDING-PRESERVATION-1 never
    # covered it). Carry the live config forward; if it is already gone, carry the sibling
    # wrangler.toml declaration so this deployer can also RESTORE it.
    _live_containers = (live or {}).get("containers") or []
    _decl_containers = declared_containers(path)
    _want_containers = _live_containers or _decl_containers
    if _want_containers:
        meta["containers"] = _want_containers
        _csrc = "live /settings" if _live_containers else "wrangler.toml declaration"
        print("CONTAINERS: carrying " + str(len(_want_containers)) + " entr(y|ies) from "
              + _csrc + " -> " + json.dumps(_want_containers))
    else:
        print("CONTAINERS: none live and none declared - nothing to preserve")

    if compat_flags:
        meta["compatibility_flags"] = compat_flags
    meta_json = json.dumps(meta)

    b = "----cfgate" + uuid.uuid4().hex
    body = "".join([
        f"--{b}\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n{meta_json}\r\n",
        f"--{b}\r\nContent-Disposition: form-data; name=\"worker.js\"; filename=\"worker.js\"\r\nContent-Type: application/javascript+module\r\n\r\n{code}\r\n",
        f"--{b}--\r\n",
    ]).encode("utf-8")
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/workers/scripts/{worker}/content"
    print(f"PUT {url} metadata={meta_json}")
    st, out = _api(url, tok, data=body, ctype="multipart/form-data; boundary=" + b)
    print("HTTP", st, str(out)[:200])
    if st != 200:
        return 3

    st2, after = _settings(worker, tok)
    if st2 != 200 or after is None:
        print(f"FAIL: deployed but could not re-read /settings (HTTP {st2}) - verify compatibility_date manually")
        return 3
    got_date = after.get("compatibility_date")
    got_flags = after.get("compatibility_flags") or []
    print(f"post-deploy settings: compatibility_date={got_date!r} compatibility_flags={got_flags}")
    if got_date != compat_date:
        print(f"FAIL: compatibility_date changed across the deploy ({compat_date!r} -> {got_date!r}) - COMPAT-PRESERVE-1 violated")
        return 3
    if got_flags != compat_flags:
        print(f"FAIL: compatibility_flags changed across the deploy ({compat_flags} -> {got_flags}) - COMPAT-PRESERVE-1 violated")
        return 3
    # CONTAINER-CONFIG-PRESERVE-1 fail-closed assertion: a worker whose sibling wrangler.toml
    # declares [[containers]] must come out of this deploy still carrying its container config.
    if _decl_containers:
        got_containers = after.get("containers") or []
        if not got_containers:
            print("FAIL: " + worker + " declares [[containers]] but /settings reports none after "
                  "the deploy - CONTAINER-CONFIG-PRESERVE-1 violated (#1485)")
            print("      restore via .github/workflows/container-config-autoverify.yml, "
                  ".github/workflows/restore-container-config-1485.yml, or wrangler deploy")
            return 3
        print("post-deploy containers: " + json.dumps(got_containers))


    # AUTODEPLOY-SCHEDULES-NOT-APPLIED-1 (issue 1390): the /content PUT above does NOT touch
    # the cron trigger, so the declared set is applied and verified here.
    sched_ok = schedules_apply(worker, path, tok)
    if not sched_ok and os.environ.get("SCHEDULES_STRICT") == "1":
        print("FAIL: schedules not applied and SCHEDULES_STRICT=1 - AUTODEPLOY-SCHEDULES-NOT-APPLIED-1")
        return 3
    if not sched_ok:
        print("WARNING: deploy succeeded but the declared crons were not applied (issue 1390). "
              "Set SCHEDULES_STRICT=1 to make this fatal.")

    ver = artifact_version(code)
    sched_note = "schedules=applied" if sched_ok else "schedules=FAILED"
    notes = (f"raw_put.py /content deploy; compatibility_date={got_date}; "
             f"flags={len(got_flags)}; {sched_note}; DEPLOY-LEDGER-1")
    if not ledger_write(worker, ver, tok, notes):
        if os.environ.get("LEDGER_STRICT") == "1":
            print("FAIL: ledger row not written and LEDGER_STRICT=1 - DEPLOY-LEDGER-1")
            return 3
        print("WARNING: deploy succeeded but the ledger row was not written (DEPLOY-LEDGER-1). "
              "Set LEDGER_STRICT=1 to make this fatal.")

    guard_ledger(worker, None, ver, True, notes)
    guard_unlock()
    print(f"OK: {worker} {ver} deployed with compatibility_date={got_date}, "
          f"{len(got_flags)} flag(s) preserved, {sched_note}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
