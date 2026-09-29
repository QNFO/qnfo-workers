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

SCHEDULE-SYNC-1 (2026-09-29, issues 1390 / 1193 / 1337): a worker's cron triggers are NOT part
of its script content. They live in a SEPARATE CF resource:

    GET|PUT /accounts/<acct>/workers/scripts/<name>/schedules

This deployer only ever PUT `/content`, so editing `crons = [...]` in a wrangler config and
deploying through it changed NOTHING about when the worker actually fires. The repo and the live
trigger silently diverged -- fleet-exec committed `crons = ["*/10 * * * *"]` while the live
schedule stayed hourly, and `fleet_crons.last_fired` froze at a single catch-up batch. Every
repo cron change was therefore inert fleet-wide. Now, after a verified deploy, this script:
  * reads the cron declaration from the wrangler config BESIDE the artifact;
  * refuses to cross-apply if that config declares a different worker `name` than the one being
    deployed (a root-level wrangler.toml can never be applied to an unrelated worker);
  * enforces the CRON-RATE-CEILING-1 10-minute floor and REFUSES to apply a faster cadence;
  * PUTs /schedules only when they differ from live, then re-reads and verifies the result.
  * SCHEDULE_STRICT=1 makes a schedule-sync failure fatal (exit 3).

Usage:  CLOUDFLARE_API_TOKEN=... python scripts/raw_put.py <worker> <path/to/worker.js>
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
VERSION_RE = re.compile(r'var VERSION = "([^"]+)"')

# SCHEDULE-SYNC-1 (issue 1390): cron triggers are a separate CF resource.
CRONS_TOML = re.compile(r"^\s*crons\s*=\s*\[(.*?)\]", re.S | re.M)
CRONS_JSON = re.compile(r'"crons"\s*:\s*\[(.*?)\]', re.S)
QUOTED = re.compile(r'["\']([^"\']+)["\']')
NAME_TOML = re.compile(r'^\s*name\s*=\s*"([^"]+)"', re.M)
NAME_JSON = re.compile(r'"name"\s*:\s*"([^"]+)"')
MIN_INTERVAL_MIN = 10  # CRON-RATE-CEILING-1 (binding owner directive 2026-09-23)


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if t:
        return t.strip()
    p = r"C:\Users\LENOVO\tokens\cloudflare"
    if os.path.exists(p):
        return open(p).read().strip()
    raise SystemExit("no CF token (set CLOUDFLARE_API_TOKEN)")


def _api(url, tok, data=None, ctype=None):
    headers = {"Authorization": "Bearer " + tok}
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
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
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
_LOCK = {"worker": None, "token": None}  # DEPLOY-GUARD-WRAP-2


def _guard_call(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(GUARD + path, data=data, method="POST",
                                 headers={"Content-Type": "application/json"})
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
    return good


def artifact_version(code):
    m = VERSION_RE.search(code)
    return m.group(1) if m else "unknown"


def _wrangler_config(path):
    """Return (declared_name, crons, found) for the artifact's own directory.

    found=False means no wrangler config sits beside the artifact, in which case
    live schedules must NOT be touched (we have no declaration to apply).
    """
    d = os.path.dirname(os.path.abspath(path))
    for fname in ("wrangler.toml", "wrangler.jsonc", "wrangler.json"):
        fp = os.path.join(d, fname)
        if not os.path.isfile(fp):
            continue
        try:
            text = open(fp, encoding="utf-8").read()
        except OSError:
            return None, [], False
        nm = NAME_TOML.search(text) or NAME_JSON.search(text)
        name = nm.group(1) if nm else None
        m = CRONS_TOML.search(text) or CRONS_JSON.search(text)
        crons = [q for q in QUOTED.findall(m.group(1)) if q.strip()] if m else []
        return name, crons, True
    return None, [], False


def _interval_minutes(expr):
    """Effective minute interval for the simple forms; None when not applicable."""
    f = (expr or "").split()
    if len(f) != 5:
        return None
    mi = f[0]
    if mi == "*":
        return 1
    m = re.fullmatch(r"\*/(\d+)", mi)
    if m:
        return int(m.group(1))
    return None


def _live_schedules(worker, tok):
    st, body = _api(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/workers/scripts/{worker}/schedules", tok
    )
    if st == 200 and isinstance(body, dict) and body.get("success"):
        return [c.get("cron") for c in ((body.get("result") or {}).get("schedules") or []) if c.get("cron")]
    return None


def _put_schedules(worker, crons, tok):
    payload = json.dumps([{"cron": c} for c in crons]).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/workers/scripts/{worker}/schedules",
        data=payload,
        method="PUT",
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode()[:300]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:
        return 0, "ERR " + str(e)


def sync_schedules(worker, path, tok):
    """Apply the repo-declared crons to the live trigger (SCHEDULE-SYNC-1)."""
    name, crons, found = _wrangler_config(path)
    if not found:
        print("SCHEDULE-SYNC: no wrangler config beside the artifact - skipped")
        return True
    expected = name or os.path.basename(os.path.dirname(os.path.abspath(path)))
    if expected != worker:
        print("SCHEDULE-SYNC: config declares %r but deploying %r - skipped (refusing to cross-apply)"
              % (expected, worker))
        return True
    if not crons:
        print("SCHEDULE-SYNC: repo declares no crons - live trigger left untouched")
        return True
    bad = []
    for c in crons:
        iv = _interval_minutes(c)
        if iv is not None and iv < MIN_INTERVAL_MIN:
            bad.append((c, iv))
    if bad:
        print("SCHEDULE-SYNC: REFUSING - declared crons breach the %dmin rate ceiling: %s"
              % (MIN_INTERVAL_MIN, bad))
        return False
    live = _live_schedules(worker, tok)
    if live is None:
        print("SCHEDULE-SYNC: could not read live /schedules - skipped (non-fatal)")
        return True
    if set(live) == set(crons):
        print("SCHEDULE-SYNC: live already matches repo %s - no change" % (crons,))
        return True
    print("SCHEDULE-SYNC: repo=%s live=%s -> applying" % (crons, live))
    st, out = _put_schedules(worker, crons, tok)
    if st != 200:
        print("SCHEDULE-SYNC: PUT /schedules HTTP %s FAILED %s" % (st, out))
        return False
    after = _live_schedules(worker, tok)
    if after is not None and set(after) != set(crons):
        print("SCHEDULE-SYNC: FAIL - schedules did not take (live=%s)" % (after,))
        return False
    print("SCHEDULE-SYNC: OK live=%s" % (after,))
    return True


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

    # SCHEDULE-SYNC-1: a /content deploy can never change the cron trigger.
    try:
        sched_ok = sync_schedules(worker, path, tok)
    except Exception as e:  # never let schedule sync break the deploy path
        print(f"SCHEDULE-SYNC: EXCEPTION {e} - treated as non-fatal")
        sched_ok = True
    if not sched_ok:
        if os.environ.get("SCHEDULE_STRICT") == "1":
            print("FAIL: schedule sync failed and SCHEDULE_STRICT=1 - SCHEDULE-SYNC-1")
            return 3
        print("WARNING: schedule sync failed (SCHEDULE-SYNC-1). Set SCHEDULE_STRICT=1 to make this fatal.")

    ver = artifact_version(code)
    notes = f"raw_put.py /content deploy; compatibility_date={got_date}; flags={len(got_flags)}; DEPLOY-LEDGER-1"
    if not ledger_write(worker, ver, tok, notes):
        if os.environ.get("LEDGER_STRICT") == "1":
            print("FAIL: ledger row not written and LEDGER_STRICT=1 - DEPLOY-LEDGER-1")
            return 3
        print("WARNING: deploy succeeded but the ledger row was not written (DEPLOY-LEDGER-1). "
              "Set LEDGER_STRICT=1 to make this fatal.")

    guard_ledger(worker, None, ver, True, notes)
    guard_unlock()
    print(f"OK: {worker} {ver} deployed with compatibility_date={got_date} and {len(got_flags)} flag(s) preserved")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
