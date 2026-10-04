#!/usr/bin/env python3
"""issue_owner_client_keys.py - OWNER-CLIENT-KEY-DRIFT-1 (#1886). Charter pillar: security.

WHY: the 2026-10-01 rotation (#1676, #1701) replaced the router and personal keys but never reached the owner's
Chatbox/DeepChat providers (runbook step 3), and Cloudflare secrets cannot be read back, so nobody held a working
client key. This script issues a DEDICATED owner-client credential per host and keeps it where the fleet can read it:

  qnfo-ai      secret ROUTER_AUTH_KEY_2      (ROUTER_AUTH_KEY and every worker that uses it are untouched)
  qnfo-ops     secret OPS_ROUTER_AUTH_KEY_2  (OPS_ROUTER_AUTH_KEY untouched)
  personal-api secret API_KEY                (no second slot exists; its only consumers are the owner's clients)

Order per host: store the new value in the private D1 `qnfo-identity.owner_client_keys` first (so it can never be
lost), then PUT the worker secret under the secrets:<worker> lease, then verify NEW -> 200 live.
Values are never printed (this is a public repository and its Actions logs are public); only HTTP statuses are.

  python3 scripts/issue_owner_client_keys.py issue [host ...]   # hosts: ai ops personal (default all)
  python3 scripts/issue_owner_client_keys.py check              # probe each host with the stored key (no secret write)

Both modes also refresh the owner-client probe ledger qnfo-audit.owner_client_probes (one row per
host: http status + public-read flag, never the key). ai-health-prober monitors that ledger each cron
and the remediation contract for issue 1886 verifies it, so a broken owner-client key is caught
server-side and no rotation issue can close without a passing client probe (OWNER-CLIENT-PROBE-1).

Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Exit 1 if any host fails verification.
"""
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from secret_lock import secret_lock  # noqa: E402

API = "https://api.cloudflare.com/client/v4"
IDENTITY_DB = "6c26125a-908a-4774-9812-f1f0e60afc5f"  # qnfo-identity (private; bound only to qnfo-fleet-dashboard)
AUDIT_DB = "35e2e573-92f3-46ac-83c6-22f6429fc5e5"  # qnfo-audit (owner_client_probes ledger, OWNER-CLIENT-PROBE-1 #1886)
UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; issue_owner_client_keys.py)"

HOSTS = {
    "ai": {"worker": "qnfo-ai", "secret": "ROUTER_AUTH_KEY_2", "base": "https://ai.qnfo.org", "model": "qnfo", "prefix": "oc-ai-"},
    "ops": {"worker": "qnfo-ops", "secret": "OPS_ROUTER_AUTH_KEY_2", "base": "https://ops.qnfo.org", "model": "ops", "prefix": "oc-ops-"},
    "personal": {"worker": "personal-api", "secret": "API_KEY", "base": "https://personal.qnfo.org", "model": "personal", "prefix": "oc-pl-"},
}


def cf(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"], "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except ValueError:
            return e.code, {}


def d1(sql, params=None, db=None):
    acct = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    st, j = cf("POST", "/accounts/%s/d1/database/%s/query" % (acct, db or IDENTITY_DB), {"sql": sql, "params": params or []})
    if st != 200 or not j.get("success"):
        raise RuntimeError("D1 query failed HTTP %s" % st)
    return (j.get("result") or [{}])[0].get("results") or []


PROBED = []  # per-host (host, http_status, public_read, ok) accumulated this run


def record_probes(rows):
    """OWNER-CLIENT-PROBE-1 (#1886): publish the owner-client probe ledger to qnfo-audit.

    Why: the owner-client key has no other machine monitor. ai-health-prober reads this
    ledger each cron and raises a self_heal_actions breach when it is stale or any host is
    not ok, and the remediation contract for issue 1886 verifies the same ledger. One row per
    host; the current run REPLACES the previous set, so a passing probe stays fresh and a
    stopped producer ages out (observed -> 0) instead of passing forever on a stale green row.
    No key material is ever written here, only the HTTP status and the public-read flag."""
    if not rows:
        return
    try:
        d1("CREATE TABLE IF NOT EXISTS owner_client_probes (id INTEGER PRIMARY KEY AUTOINCREMENT, host TEXT NOT NULL, http_status INTEGER, public_read INTEGER, ok INTEGER NOT NULL, checked_at TEXT NOT NULL, source TEXT)", db=AUDIT_DB)
        d1("DELETE FROM owner_client_probes", db=AUDIT_DB)
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        for host, code, public, ok in rows:
            d1("INSERT INTO owner_client_probes (host,http_status,public_read,ok,checked_at,source) VALUES (?,?,?,?,?,?)",
               [host, int(code), 1 if public else 0, 1 if ok else 0, now, "owner-client-keys workflow"], db=AUDIT_DB)
        print("RESULT probe-ledger: wrote %d rows to qnfo-audit.owner_client_probes" % len(rows))
    except Exception as e:  # noqa: BLE001
        print("RESULT probe-ledger: write failed %s" % str(e)[:160])


def ensure_table():
    d1("CREATE TABLE IF NOT EXISTS owner_client_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, host TEXT NOT NULL, "
       "worker TEXT NOT NULL, secret_name TEXT NOT NULL, key_value TEXT NOT NULL, status TEXT NOT NULL, "
       "issued_at TEXT NOT NULL, verified_at TEXT, note TEXT)")


def probe(host, key):
    """One-token chat call. Returns (http_status, public_read_flag). Never logs the key."""
    h = HOSTS[host]
    body = json.dumps({"model": h["model"], "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1}).encode()
    hdr = {"Content-Type": "application/json", "User-Agent": UA}
    if key:
        hdr["Authorization"] = "Bearer " + key
    req = urllib.request.Request(h["base"] + "/v1/chat/completions", data=body, method="POST", headers=hdr)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, (r.headers.get("x-ops-access") == "public-read")
    except urllib.error.HTTPError as e:
        return e.code, (e.headers.get("x-ops-access") == "public-read")
    except Exception:  # noqa: BLE001
        return 0, False


def put_secret(worker, name, value):
    acct = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    st, _ = cf("PUT", "/accounts/%s/workers/scripts/%s/secrets" % (acct, worker), {"name": name, "text": value, "type": "secret_text"})
    return st


def issue(host):
    h = HOSTS[host]
    value = h["prefix"] + secrets.token_hex(24)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    d1("INSERT INTO owner_client_keys (host, worker, secret_name, key_value, status, issued_at) VALUES (?,?,?,?,?,?)",
       [host, h["worker"], h["secret"], value, "pending", now])
    with secret_lock(h["worker"], ttl_sec=600, owner="ci/issue-owner-client-keys"):
        st = put_secret(h["worker"], h["secret"], value)
        print("RESULT %s: worker update HTTP %s" % (host, int(st)))
        if st != 200:
            d1("UPDATE owner_client_keys SET status='put-failed', note=? WHERE host=? AND key_value=?", ["HTTP %s" % st, host, value])
            return False
    ok = False
    code, public = 0, False
    for _ in range(6):  # a secret PUT becomes live within seconds
        time.sleep(5)
        code, public = probe(host, value)
        if code == 200 and not public:
            ok = True
            break
    print("RESULT %s: NEW key -> HTTP %s public_read=%s verified=%s" % (host, code, public, ok))
    PROBED.append((host, code, public, ok))
    if ok:
        d1("UPDATE owner_client_keys SET status='superseded' WHERE host=? AND status='active'", [host])
        d1("UPDATE owner_client_keys SET status='active', verified_at=? WHERE host=? AND key_value=?",
           [time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), host, value])
    else:
        d1("UPDATE owner_client_keys SET status='verify-failed', note=? WHERE host=? AND key_value=?", ["HTTP %s" % code, host, value])
    print("RESULT %s: wrong-key probe -> HTTP %s" % (host, probe(host, "oc-wrong-" + secrets.token_hex(8))[0]))
    return ok


def check():
    ensure_table()
    all_ok = True
    for host in HOSTS:
        rows = d1("SELECT key_value FROM owner_client_keys WHERE host=? AND status='active' ORDER BY id DESC LIMIT 1", [host])
        if not rows:
            print("RESULT %s: no active key stored" % host)
            all_ok = False
            PROBED.append((host, 0, False, False))
            continue
        code, public = probe(host, rows[0]["key_value"])
        good = code == 200 and not public
        print("RESULT %s: stored key -> HTTP %s public_read=%s ok=%s" % (host, code, public, good))
        PROBED.append((host, code, public, good))
        all_ok = all_ok and good
    return all_ok


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("issue", "check"):
        print(__doc__)
        return 2
    if not os.environ.get("CLOUDFLARE_API_TOKEN") or not os.environ.get("CLOUDFLARE_ACCOUNT_ID"):
        print("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required")
        return 2
    if sys.argv[1] == "check":
        ok = check()
        record_probes(PROBED)
        return 0 if ok else 1
    ensure_table()
    wanted = sys.argv[2:] or list(HOSTS)
    unknown = [w for w in wanted if w not in HOSTS]
    if unknown:
        print("unknown host: %s" % ",".join(unknown))
        return 2
    results = [issue(w) for w in wanted]
    record_probes(PROBED)
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
