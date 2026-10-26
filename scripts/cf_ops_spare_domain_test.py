#!/usr/bin/env python3
"""SPARE-DOMAIN-CANON-1 offline suite for scripts/cf_ops_actions.py spare-domain-canon (agent_issues 2361).

Drives spare_domain_canon() against a fake Cloudflare API (recorded calls) and a fake verifier. Proves: the backup of the
existing redirect ruleset is emitted before any write; one redirect rule per zone with the canonical target and the query
preserved; proxied=true is patched onto unproxied apex/www records and a missing record becomes a proxied CNAME to
qwav.pages.dev; a zone that already carries the rule writes no ruleset; dry mode writes nothing; a failed verification
restores the backed-up ruleset; a zone outside SPARE_ZONES is refused. SPARE-DOMAIN-CANON-2: each zone redirects to its own
target (ipatent.me -> ipatent.qnfo.org, empoweringchange.today -> qnfo.org), and a paused zone is unpaused before any other write;
a refused unpause stops that zone with the error recorded and no rule written.
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
    def __init__(self, rules_before=None, dns=None, zones=None, paused=False, unpause_ok=True):
        self.rules_before = rules_before
        self.dns = dns if dns is not None else []
        self.zones = zones or [("z-uk", "qwav.uk"), ("z-tech", "qwave.tech"), ("z-org", "qwav.org")]
        self.calls = []
        self.emitted = []
        self.verify_ok = True
        self.paused = paused
        self.unpause_ok = unpause_ok
        self.verify_location = "https://qwav.org/"
        self.ssl_enabled = True
        self.verify_status0 = False

    def call(self, method, path, token, body=None, timeout=60):
        self.calls.append((method, path, body))
        if path.startswith("/zones?"):
            return 200, {"result": [{"id": z, "name": n} for z, n in self.zones], "result_info": {"total_pages": 1}}
        if path.count("/") == 2 and path.startswith("/zones/") and method == "GET":
            return 200, {"result": {"id": path.split("/")[2], "paused": self.paused}}
        if "/ssl/universal/settings" in path and method == "GET":
            return 200, {"result": {"enabled": self.ssl_enabled}}
        if "/ssl/universal/settings" in path and method == "PATCH":
            self.ssl_enabled = True
            return 200, {"success": True, "result": {"enabled": True}}
        if "/ssl/certificate_packs" in path:
            return 200, {"result": [{"type": "universal", "status": "pending_validation" if not self.ssl_enabled else "active", "hosts": ["x"]}]}
        if path.count("/") == 2 and path.startswith("/zones/") and method == "PATCH":
            if self.unpause_ok:
                self.paused = False
                return 200, {"success": True, "result": {"paused": False}}
            return 403, {"success": False, "errors": [{"code": 9109, "message": "Unauthorized to access requested resource"}]}
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
            return 301, self.verify_location
        if self.verify_status0:
            return 0, "error:URLError"
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
ok(f.emitted and f.emitted[0].get("stage") == "zone" and f.emitted[0]["paused"] is False and f.emitted[1].get("stage") == "ssl" and f.emitted[2].get("stage") == "backup" and f.emitted[2]["ruleset_rules"] == [], "the zone status, the ssl state and the backup are emitted before any write (ZONE-DELEGATION-1, EDGE-CERT-1)", f.emitted[:3])
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
ok([e.get("stage") for e in f.emitted[:4]] == ["zone", "ssl", "backup", None], "zone, ssl, backup, then the final report: no write stage precedes the backup", [e.get("stage") for e in f.emitted])
ok(not [c for c in f.calls if c[0] == "PATCH" and c[1].count("/") == 2], "an unpaused zone gets no zone PATCH", f.calls)

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

# 5. every spare zone by default (the fake account holds two of them: the others are reported absent); a zone outside the list is refused
f5 = Fake(rules_before=[], dns=[])
rc = run(f5, "")
ok(rc == 1 and len([c for c in f5.calls if c[0] == "PUT"]) == 2, "no target: every spare zone the account holds gets its rule, an absent zone is reported", [c[1] for c in f5.calls if c[0] == "PUT"])
ok(len([e for e in f5.emitted if e.get("error") == "zone not in the account"]) == len(m.SPARE_ZONES) - 2, "each zone the account lacks is named once", f5.emitted)
f6 = Fake()
rc = run(f6, "qnfo.org")
ok(rc == 2 and not f6.calls, "a zone outside SPARE_ZONES is refused before any API call", f6.emitted)

# 7. SPARE-DOMAIN-CANON-2: per-zone targets; a paused zone is unpaused first; a refused unpause writes nothing else
f7 = Fake(rules_before=[], dns=[], zones=[("z-ip", "ipatent.me"), ("z-ec", "empoweringchange.today")], paused=True)
f7.verify_location = "https://ipatent.qnfo.org/"
rc = run(f7, "ipatent.me")
ok(rc == 0, "ipatent.me returns 0", f7.emitted[-1])
zone_patches = [c for c in f7.calls if c[0] == "PATCH" and c[1] == "/zones/z-ip"]
puts7 = [c for c in f7.calls if c[0] == "PUT"]
ok(len(zone_patches) == 1 and zone_patches[0][2] == {"paused": False}, "the paused zone is unpaused once", zone_patches)
ok(f7.calls.index(zone_patches[0]) < f7.calls.index(puts7[0]), "the unpause comes before the ruleset write", None)
ok(puts7[0][2]["rules"][0]["action_parameters"]["from_value"]["target_url"]["expression"] == 'concat("https://ipatent.qnfo.org", http.request.uri.path)', "ipatent.me redirects to ipatent.qnfo.org + path", puts7[0][2])
ok(f7.emitted[-1]["ok"] is True and f7.emitted[-1]["target"] == "https://ipatent.qnfo.org" and f7.emitted[-1]["unpaused"]["ok"] is True, "the report names the target and the unpause", f7.emitted[-1])
ok(m.canon_target("empoweringchange.today") == "https://qnfo.org" and m.canon_target("q-wave.tech") == "https://qwav.org", "the host map matches issue 2077")
f8 = Fake(rules_before=[], dns=[], zones=[("z-ec", "empoweringchange.today")], paused=True, unpause_ok=False)
rc = run(f8, "empoweringchange.today")
ok(rc == 1 and not [c for c in f8.calls if c[0] in ("PUT", "POST")], "a refused unpause stops the zone before any ruleset or DNS write", f8.calls)
ok(f8.emitted[-1].get("stage") == "unpause" and f8.emitted[-1]["result"]["errors"][0]["code"] == 9109, "the refusal is recorded with its code", f8.emitted[-1])
f9 = Fake(rules_before=[], dns=[], zones=[("z-ip", "ipatent.me")], paused=True)
rc = run(f9, "ipatent.me", mode="dry")
ok(rc == 0 and not [c for c in f9.calls if c[0] in ("PUT", "PATCH", "POST")] and f9.emitted[-1]["paused"] is True, "dry mode reports the pause and writes nothing", f9.emitted[-1])
ok(m.canon_verify("ipatent.me", fetch=lambda u: (301, "https://ipatent.qnfo.org/"), target="https://ipatent.qnfo.org")["ok"] is True, "verify accepts the zone's own target")
ok(m.canon_verify("ipatent.me", fetch=lambda u: (301, "https://qwav.org/"), target="https://ipatent.qnfo.org")["ok"] is False, "verify refuses another zone's target")

# 8. EDGE-CERT-1: Universal SSL off is switched on before the rule; a connection error during verification keeps the rule (no restore)
f10 = Fake(rules_before=[], dns=[], zones=[("z-ec", "empoweringchange.today")], paused=True)
f10.ssl_enabled = False
f10.verify_ok = False
f10.verify_status0 = True
rc = run(f10, "empoweringchange.today")
ssl_patches = [c for c in f10.calls if c[0] == "PATCH" and "/ssl/universal/settings" in c[1]]
puts10 = [c for c in f10.calls if c[0] == "PUT"]
ok(len(ssl_patches) == 1 and ssl_patches[0][2] == {"enabled": True}, "Universal SSL is switched on when it was off", ssl_patches)
ok(rc == 1 and len(puts10) == 1 and f10.emitted[-1]["restored"] is None and f10.emitted[-1]["kept_rule_on_connection_error"] is True, "a connection error keeps the rule and still fails the run", f10.emitted[-1])
ok(f10.emitted[-1]["ssl"]["enabled_now"] is True and f10.emitted[-1]["ssl"]["universal_enabled"] is False, "the report carries the ssl state", f10.emitted[-1]["ssl"])
f11 = Fake(rules_before=[], dns=[], zones=[("z-ec", "empoweringchange.today")])
rc = run(f11, "empoweringchange.today", mode="dry")
ok(not [c for c in f11.calls if c[0] in ("PUT", "PATCH", "POST")], "dry mode never switches ssl on", f11.calls)

# 9. SPARE-DOMAIN-CANON-3 (agent_issues 100307): qwav.tech keeps its primer -> deep rule; the apex/www-only rule is replaced; the canon rule goes first
live_rules = [
    {"id": "f1e0", "version": "1", "last_updated": "2026-05-29T09:10:50Z", "ref": "f1e0", "action": "redirect", "enabled": True,
     "description": "Redirect www.qwav.tech to qwav.tech", "expression": '(http.host eq "www.qwav.tech")',
     "action_parameters": {"from_value": {"status_code": 301, "target_url": {"value": "https://qwav.tech"}}}},
    {"id": "3254", "version": "1", "last_updated": "2026-07-16T11:54:39Z", "ref": "3254", "action": "redirect", "enabled": True,
     "description": "Redirect primer.qwav.tech to deep.qwav.tech", "expression": '(http.host eq "primer.qwav.tech")',
     "action_parameters": {"from_value": {"status_code": 301, "preserve_query_string": True, "target_url": {"value": "https://deep.qwav.tech/"}}}},
]
ok("qwav.tech" in m.SPARE_ZONES and m.canon_target("qwav.tech") == "https://qwav.org", "qwav.tech is a spare zone with the qwav.org target")
f12 = Fake(rules_before=live_rules, zones=[("z-qt", "qwav.tech")],
           dns=[{"id": "a", "type": "CNAME", "name": "qwav.tech", "proxied": True}, {"id": "b", "type": "CNAME", "name": "www.qwav.tech", "proxied": True}])
rc = run(f12, "qwav.tech")
puts12 = [c for c in f12.calls if c[0] == "PUT"]
ok(rc == 0 and len(puts12) == 1, "qwav.tech: one ruleset PUT, run ok", (rc, puts12))
w = puts12[0][2]["rules"]
ok(len(w) == 2 and w[0] == m.canon_rule("qwav.tech"), "the canon rule is first", w)
ok(w[1]["expression"] == '(http.host eq "primer.qwav.tech")' and w[1]["description"].startswith("Redirect primer") and w[1]["ref"] == "3254", "the primer -> deep rule is kept", w[1])
ok(not [r for r in w if r.get("description") == "Redirect www.qwav.tech to qwav.tech"], "the www-only rule is dropped (the canon rule covers it)", w)
ok(all(not ({"id", "version", "last_updated"} & set(r)) for r in w), "no read-only field is sent on the PUT", w)
ok(f12.emitted[2]["ruleset_rules"] == live_rules, "the backup emitted before the write holds both original rules, read-only fields included", f12.emitted[2])
ok(not [c for c in f12.calls if c[0] in ("PATCH", "POST")], "proxied apex and www records need no DNS write", f12.calls)
f13 = Fake(rules_before=m.merged_rules(live_rules, "qwav.tech"), zones=[("z-qt", "qwav.tech")],
           dns=[{"id": "a", "type": "CNAME", "name": "qwav.tech", "proxied": True}, {"id": "b", "type": "CNAME", "name": "www.qwav.tech", "proxied": True}])
rc = run(f13, "qwav.tech")
ok(rc == 0 and not [c for c in f13.calls if c[0] in ("PUT", "PATCH", "POST")] and f13.emitted[-1]["rule_written"] is False, "a second run on the merged ruleset writes nothing", f13.calls)
f14 = Fake(rules_before=live_rules, zones=[("z-qt", "qwav.tech")],
           dns=[{"id": "a", "type": "CNAME", "name": "qwav.tech", "proxied": True}, {"id": "b", "type": "CNAME", "name": "www.qwav.tech", "proxied": True}])
f14.verify_ok = False
rc = run(f14, "qwav.tech")
puts14 = [c for c in f14.calls if c[0] == "PUT"]
ok(rc == 1 and len(puts14) == 2 and [r["ref"] for r in puts14[1][2]["rules"]] == ["f1e0", "3254"] and all("id" not in r for r in puts14[1][2]["rules"]),
   "a failed verification restores both original rules without read-only fields", puts14)
ok(m.merged_rules([], "qwav.uk") == [m.canon_rule("qwav.uk")] and m.merged_rules([m.canon_rule("qwav.uk")], "qwav.uk") == [m.canon_rule("qwav.uk")],
   "a parked zone still ends with exactly the one canon rule")

# 6. canon_verify reads a 301 to qwav.org as ok and anything else as not ok
ok(m.canon_verify("qwav.uk", fetch=lambda u: (301, "https://qwav.org/x?y=1"))["ok"] is True, "301 to qwav.org is ok")
ok(m.canon_verify("qwav.uk", fetch=lambda u: (200, ""))["ok"] is False, "a 200 is not ok")
ok(m.canon_verify("qwav.uk", fetch=lambda u: (301, "https://qwave.tech/"))["ok"] is False, "a 301 elsewhere is not ok")

print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
