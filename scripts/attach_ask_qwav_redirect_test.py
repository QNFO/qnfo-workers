#!/usr/bin/env python3
"""TP-3B-ATTACH-1 offline check: the ask.qwav.tech redirect rule uses a target expression (not the static "$uri" text that never
substituted) and an existing rule with the old action is corrected in place."""
import importlib.util, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "x")
spec = importlib.util.spec_from_file_location("aq", os.path.join(HERE, "attach-ask-qwav-route.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
fail = 0


def ok(c, msg):
    global fail
    if not c:
        fail += 1
        print("FAIL", msg)


e = m.redirect_entry()
tu = e["action_parameters"]["from_value"]["target_url"]
ok("value" not in tu and "http.request.uri.path" in tu["expression"] and "$uri" not in json.dumps(e), "target is an expression, no static $uri")
ok(e["action_parameters"]["from_value"]["status_code"] == 301 and e["action_parameters"]["from_value"]["preserve_query_string"], "301 and query kept")

calls = []
old_rule = {"id": "r1", "name": m.REDIRECT_RULE_NAME, "expression": e["expression"],
            "action_parameters": {"from_value": {"status_code": 301, "target_url": {"value": "https://ask.qwav.org$uri"}}}}


def fake_req(method, path, body=None, timeout=30):
    calls.append((method, path))
    if method == "GET":
        return 200, {"success": True, "result": {"id": "rs", "rules": [dict(old_rule)]}}
    return 200, {"success": True}


m.req = fake_req
ok(m.attach_tech_redirect("z") == "r1" and ("PATCH", "/zones/z/rulesets/rs/rules/r1") in calls, "a rule with the old action is PATCHed")
calls.clear()
old_rule["action_parameters"] = e["action_parameters"]
ok(m.attach_tech_redirect("z") == "r1" and not any(c[0] != "GET" for c in calls), "a correct rule is reused without a write")
print("attach_ask_qwav_redirect_test: " + ("ok" if not fail else "%d failed" % fail))
sys.exit(1 if fail else 0)
