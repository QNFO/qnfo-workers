#!/usr/bin/env python3
"""Offline tests for the read-only Cloudflare Access identity-provider probe.

Proves the probe reports provider types and app allowlists without emitting OAuth credentials, and fails visibly when
the identity-provider endpoint cannot be read.
Run: python3 scripts/cf_ops_access_probe_test.py
"""
import contextlib
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cf_ops_actions as C  # noqa: E402

passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + str(extra)[:300]))


responses = {}
emitted = []
C.emit = emitted.append


def fake_call(method, path, token, body=None, timeout=60):
    assert method == "GET"
    return responses[path]


C.call = fake_call
base = "/accounts/account/access/"
responses = {
    base + "organizations": (200, {"result": {"auth_domain": "team.cloudflareaccess.com"}}),
    base + "apps": (200, {"result": [{"name": "private-api", "domain": "api.example.com",
                                     "type": "self_hosted", "allowed_idps": ["github-id"],
                                     "policies": [{"include": [{"email": {"email": "private@example.com"}}]}]}]}),
    base + "identity_providers": (200, {"result": [
        {"id": "cf-id", "name": "Cloudflare", "type": "cloudflare",
         "config": {"restrict_to_account_members": True}},
        {"id": "gh-id", "name": "GitHub", "type": "github",
         "config": {"client_id": "public-client-id", "client_secret": "secret-marker"}},
        {"id": "otp-id", "name": "One-time PIN", "type": "onetimepin", "config": {}},
    ]}),
}
rc = C.access_probe("account", "token")
result = emitted[-1]
serialized = json.dumps(result)
ok(rc == 0 and result["ok"], "complete Access probe succeeds", result)
ok([p["type"] for p in result["identity_providers"]] == ["cloudflare", "github", "onetimepin"],
   "all provider types are represented", result["identity_providers"])
ok(result["identity_providers"][0]["restrict_to_account_members"] is True,
   "Cloudflare account-member restriction is reported")
ok(result["identity_providers"][1]["oauth_client_id_present"] is True,
   "OAuth client-ID presence is reported as a boolean only")
ok(result["apps"][0]["allowed_idps"] == ["github-id"], "application IdP allowlist is reported")
ok("secret-marker" not in serialized and "public-client-id" not in serialized,
   "OAuth credentials and client ID are never emitted", serialized)
ok("private@example.com" not in serialized and "policies" not in result["apps"][0],
   "email and policy contents are not emitted", serialized)

responses[base + "identity_providers"] = (200, {"success": False, "errors": [{"code": 9109, "message": "permission denied"}]})
rc = C.access_probe("account", "token")
result = emitted[-1]
ok(rc == 1 and not result["ok"] and result["identity_providers_http"] == 200,
   "identity-provider read failure is surfaced as failure", result)
ok(any(e.get("stage") == "identity_providers" for e in result["errors"]),
   "the error identifies the failed API stage", result["errors"])

# Existing Cloudflare provider is a no-op. An unrestricted existing provider is reported but never mutated.
provider_calls = []
responses[base + "identity_providers"] = (200, {"result": [
    {"id": "cf-open", "name": "Cloudflare", "type": "cloudflare", "config": {"restrict_to_account_members": False}}
]})
def track_call(method, path, token, body=None, timeout=60):
    provider_calls.append((method, path, body))
    return fake_call(method, path, token, body, timeout)
C.call = track_call
rc = C.access_ensure_cloudflare("account", "token")
result = emitted[-1]
ok(rc == 1 and result["created"] is False and result["unchanged"] is True,
   "unrestricted existing Cloudflare IdP is not overwritten", result)
ok(not any(method == "POST" for method, _, _ in provider_calls),
   "existing provider configuration is never mutated")

# Missing Cloudflare provider is created with account-member restriction, then verified by a fresh list.
provider_calls.clear()
responses[base + "identity_providers"] = (200, {"result": []})
verify_responses = [
    (201, {"success": True, "result": {"id": "cf-new"}}),
    (200, {"success": True, "result": [
        {"id": "cf-new", "name": "Cloudflare account", "type": "cloudflare",
         "config": {"restrict_to_account_members": True}}
    ]}),
]
def create_and_verify_call(method, path, token, body=None, timeout=60):
    provider_calls.append((method, path, body))
    if method == "POST":
        return verify_responses.pop(0)
    if verify_responses and len(verify_responses) == 1:
        return verify_responses.pop(0)
    return (200, {"success": True, "result": []})
C.call = create_and_verify_call
rc = C.access_ensure_cloudflare("account", "token")
result = emitted[-1]
ok(rc == 0 and result["created"] and result["restrict_to_account_members"],
   "missing Cloudflare provider is created and read-back verified", result)
creation = next((call for call in provider_calls if call[0] == "POST"), None)
ok(creation is not None and creation[2]["config"] == {"restrict_to_account_members": True},
   "creation is restricted to Cloudflare account members", creation)

print(str(passed) + " passed, " + str(failed) + " failed")
sys.exit(1 if failed else 0)
