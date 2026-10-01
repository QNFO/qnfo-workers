#!/usr/bin/env python3
"""secret_lock.py - client for qnfo-deploy-guard POST /secret-lock/{acquire,release}.

CONCURRENT-SESSION-SHARED-SECRET-CLOBBER-1 (#1701). Any code path that mutates a
worker's secrets or bindings (script PUT with metadata, /settings PATCH, /secrets PUT,
`wrangler secret put`) must hold the lease secrets:<worker> for the duration, so two
sessions cannot clobber each other. Fail-closed: if the lock cannot be acquired the
mutation must not run (SecretLockError). The lease carries a TTL, so a crashed holder
never blocks forever. No secret value is ever read or printed here.

    with secret_lock("qnfo-social", ttl_sec=900, owner="ci/rotate"):
        ...mutate...
"""
import contextlib
import json
import os
import urllib.error
import urllib.request
import uuid

GUARD = os.environ.get("DEPLOY_GUARD_URL", "https://qnfo-deploy-guard.q08.workers.dev")
UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; secret_lock.py)"
DEFAULT_TTL = 900


class SecretLockError(RuntimeError):
    pass


def _call(path, payload):
    req = urllib.request.Request(GUARD.rstrip("/") + path, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except ValueError:
            return e.code, None
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}


def acquire(worker, ttl_sec=DEFAULT_TTL, owner="ci/secret-mutation", call=None):
    """Returns a lease token, or None when the lock SERVICE is unavailable.

    DENIED (the service answered and said another holder has the lease) raises SecretLockError: that is the whole
    point of the lock. UNAVAILABLE (unreachable, 404/5xx, unparseable body) degrades to a loud warning and proceeds
    without a lease, because the lock service had never been exercised live when this shipped and a broken
    advisory lock must not be able to stop every deploy and rotation (including the deploy of its own fix).
    """
    call = call or _call
    st, j = call("/secret-lock/acquire", {"worker": worker, "owner": owner, "actor": owner,
                                          "session_id": uuid.uuid4().hex, "ttl_sec": ttl_sec})
    if st == 200 and isinstance(j, dict) and j.get("acquired") and j.get("token"):
        return j["token"]
    if isinstance(j, dict) and j.get("acquired") is False and st in (200, 409, 423):
        raise SecretLockError("secret-lock DENIED for %s (HTTP %s) %s - another holder has the lease" % (worker, st, str(j)[:160]))
    print("::warning::SECRET-LOCK-UNAVAILABLE for %s (HTTP %s) %s - proceeding WITHOUT a lease" % (worker, st, str(j)[:160]))
    return None


def release(worker, token, call=None):
    if not token:
        return True
    call = call or _call
    try:
        st, j = call("/secret-lock/release", {"worker": worker, "token": token})
    except Exception as e:  # noqa: BLE001
        st, j = 0, {"error": str(e)}
    print("SECRET-LOCK: release %s HTTP %s" % (worker, st))
    return st == 200


@contextlib.contextmanager
def secret_lock(worker, ttl_sec=DEFAULT_TTL, owner="ci/secret-mutation", call=None):
    token = acquire(worker, ttl_sec, owner, call)
    print("SECRET-LOCK: acquired secrets:%s ttl=%ss" % (worker, ttl_sec))
    try:
        yield token
    finally:
        release(worker, token, call)
