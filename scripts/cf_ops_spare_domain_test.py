#!/usr/bin/env python3
"""SPARE-DOMAIN-CANON-1 offline suite for scripts/cf_ops_actions.py spare-domain-canon (agent_issues 2361).

Drives spare_domain_canon() against a fake Cloudflare API (recorded calls) and a fake verifier. Proves: the backup of the
existing redirect ruleset is emitted before any write; one redirect rule per zone with the canonical target and the query
preserved; proxied=true is patched onto unproxied apex/www records and a missing record becomes a proxied CNAME to
qwav.pages.dev; a zone that already carries the rule writes no ruleset; dry mode writes nothing; a failed verification
restores the backed-up ruleset; a zone outside SPARE_ZONES is refused.
Run: python3 scripts/cf_ops_spare_domain_test.py   -> prints "N passed, 0 failed"
"""
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("cf_ops_actions", HERE / "cf_ops_actions.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

passed = failed = 0


def ok(cond, msg, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL", msg, json.dumps(extra, default=str)[:400] if extra is not None else "")


class Fake:
    def __init__(self, rules_before=None, dns=None, zones=None):
        self.rules_before = rules_before
        self.dns = dns if dns is not None else []
        self.zones = zones or [("z-uk", "qwav.uk"), ("z-tech", "qwave.tech"), ("z-org", "qwav.org")]
        self.calls = []
        self.emitted = []
        self.verify_ok = True

    def call(self, method, path, token, body=None, timeout=60):
        self.calls.append((method, path, body))
        if path.startswith("/zones?"):
            return 200, {"result": [{"id": z, "name": n} for z, n in self.zones], "result_info": {"total_pages": 1}}
        if "/rulesets/phases/" in path and method == "GET":
            if self.rules_before is None:
                return 404, {"errors": [{"code": 10000, "message": "no entrypoint"}]}
            return 200, {"result": {"rules": self.rules_before}}
        if "/rulesets/phases/" in path and method == "PUT":
            return 200, {"success": True, "result": {"rules": body["rules"]}}
        if "/dns_records?" in path:
            return 200, {"result": self.dns}
        if "/dns_records" in path and method in ("PATCH", "POST"):
            return 200, {"success": True}
        return 500, {"errors": [{"message": "unexpected " + method + " " + path}]}

    def fetch(self, url):
        host = url.split("/")[2]
        if self.verify_ok:
            return 301, "https://qwav.org/"
        return 200, ""


def run(fake, target="", mode="live"):
    m.call = fake.call
    m.emit = lambda obj: fake.emitted.append(obj)
    rc = m.spare_domain_canon(target, mode, "tok", fetch=fake.fetch, sleep=lambda s: None)
    return rc


# 1. fresh zone: backup emitted first, one rule written, unproxied records patched, missing www created, verified
f = Fake(rules_before=[], dns=[{"id": "r1", "type": "CNAME", "name": "qwav.uk", "content": "qwav.pages.dev", "proxied": False}])
rc = run(f, "qwav.uk")
ok(rc == 0, "fresh zone returns 0", rc)
ok(f.emitted and f.emitted[0].get("stage") == "backup" and f.emitted[0]["ruleset_rules"] == [], "the backup is the first thing emitted", f.emitted[:1])
puts = [c for c in f.calls if c[0] == "PUT" and "/rulesets/phases/http_request_dynamic_redirect/entrypoint" in c[1]]
ok(len(puts) == 1 and len(puts[0][2]["rules"]) == 1, "exactly one ruleset PUT with one rule", puts)
rule = puts[0][2]["rules"][0]
fv = rule["action_parameters"]["from_value"]
ok(rule["action"] == "redirect" and rule["expression"] == '(http.host in {"qwav.uk" "www.qwav.uk"})', "the rule matches apex and www", rule)
ok(fv["status_code"] == 301 and fv["preserve_query_string"] is True and fv["target_url"]["expression"] == 'concat("https://qwav.org", http.request.uri.path)', "301 to qwav.org + path, query preserved", fv)
patches = [c for c in f.calls if c[0] == "PATCH"]
posts = [c for c in f.calls if c[0] == "POST" and "/dns_records" in c[1]]
ok(len(patches) == 1 and patches[0][1].endswith("/dns_records/r1") and patches[0][2] == {"proxied": True}, "the unproxied apex record is patched proxied", patches)
ok(len(posts) == 1 and posts[0][2]["name"] == "www.qwav.uk" and posts[0][2]["content"] == "qwav.pages.dev" and posts[0][2]["proxied"] is True, "the missing www record is created as a proxied CNAME", posts)
final = f.emitted[-1]
ok(final["ok"] is True and final["rule_written"] is True and all(c["ok"] for c in final["verify"]) and final["restored"] is None, "the final report is ok with both hosts verified", final)
ok(all(c[0] != "PUT" or f.emitted.index(f.emitted[0]) == 0 for c in f.calls), "no write before the backup", None)

# 2. idempotent: the rule already present and records proxied -> no PUT, no DNS write
f2 = Fake(rules_before=[m.canon_rule("qwave.tech")], dns=[{"id": "a", "type": "CNAME", "name": "qwave.tech", "proxied": True}, {"id": "b", "type": "CNAME", "name": "www.qwave.tech", "proxied": True}])
rc = run(f2, "qwave.tech")
ok(rc == 0 and not [c for c in f2.calls if c[0] in ("PUT", "PATCH", "POST")], "a zone already canonical writes nothing", f2.calls)
ok(f2.emitted[-1]["rule_written"] is False, "the report says the rule was already there", f2.emitted[-1])

# 3. dry mode: plan only
f3 = Fake(rules_before=None, dns=[])
rc = run(f3, "qwav.uk", mode="dry")
ok(rc == 0 and not [c for c in f3.calls if c[0] in ("PUT", "PATCH", "POST")], "dry mode writes nothing", f3.calls)
ok(f3.emitted[-1].get("dry") is True and f3.emitted[-1]["rule_needed"] is True and len(f3.emitted[-1]["dns"]) == 2, "dry mode reports the rule and two DNS creates", f3.emitted[-1])

# 4. verification fails: the backed-up ruleset is restored and the run returns 1
old = [{"action": "redirect", "expression": "(http.host eq \"www.qwave.tech\")", "description": "old www rule"}]
f4 = Fake(rules_before=old, dns=[{"id": "a", "type": "CNAME", "name": "qwave.tech", "proxied": True}, {"id": "b", "type": "CNAME", "name": "www.qwave.tech", "proxied": True}])
f4.verify_ok = False
rc = run(f4, "qwave.tech")
puts4 = [c for c in f4.calls if c[0] == "PUT"]
ok(rc == 1 and len(puts4) == 2 and puts4[1][2] == {"rules": old}, "a failed verification restores the old ruleset", puts4)
ok(f4.emitted[-1]["ok"] is False and f4.emitted[-1]["restored"] == {"http": 200, "rules": 1}, "the report names the restore", f4.emitted[-1])

# 5. both zones by default; a zone outside the list is refused
f5 = Fake(rules_before=[], dns=[])
rc = run(f5, "")
ok(rc == 0 and len([c for c in f5.calls if c[0] == "PUT"]) == 2, "no target: both spare zones", [c[1] for c in f5.calls if c[0] == "PUT"])
f6 = Fake()
rc = run(f6, "qnfo.org")
ok(rc == 2 and not f6.calls, "a zone outside SPARE_ZONES is refused before any API call", f6.emitted)

# 6. canon_verify reads a 301 to qwav.org as ok and anything else as not ok
ok(m.canon_verify("qwav.uk", fetch=lambda u: (301, "https://qwav.org/x?y=1"))["ok"] is True, "301 to qwav.org is ok")
ok(m.canon_verify("qwav.uk", fetch=lambda u: (200, ""))["ok"] is False, "a 200 is not ok")
ok(m.canon_verify("qwav.uk", fetch=lambda u: (301, "https://qwave.tech/"))["ok"] is False, "a 301 elsewhere is not ok")

print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
