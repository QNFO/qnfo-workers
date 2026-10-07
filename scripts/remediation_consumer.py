#!/usr/bin/env python3
# REMEDIATION-CONSUMER-1 (2026-09-30)
"""Consume the qnfo-audit `remediation_contracts` registry.

MEASURED STATE BEFORE THIS FILE
  qnfo-audit held 18 active rows in `remediation_contracts`, 8 enabled rows in
  `remediation_modules`, and TWO armed auto-close triggers
  (remediation_verification_autoclose_ins / _upd) that close an `agent_issues`
  row the moment a `remediation_verifications` row lands with pass=1, a trusted
  transport and non-empty expected/observed. What did NOT exist was any process
  that read the contract table, so every contract sat at attempts=0 /
  last_verdict=NULL and the auto-close machine could never fire once.

CONTRACT (do not weaken)
  1. A probe is executed only when it is a LITERAL read-only SELECT. Anything
     else is SKIPPED and stamped `probe-not-machine-executable`; the issue stays
     OPEN. Fail-closed by design: a guessed pass would auto-close a live defect.
  2. The probe MUST return one row carrying `expected` and `observed` (by name,
     or positionally as the first two columns). The consumer never invents either
     value - both come from the probe - so the
     `remediation_verification_evidence_guard_ins` BEFORE-INSERT guard
     (VACUOUS-VERIFICATION-EVIDENCE-1) cannot be tripped and no close can rest on
     a fabricated expectation.
  3. pass = 1 only when expected == observed and both are non-empty.
  4. The verification transport must be `trusted=1` in `transport_trust`, or the
     row is not written at all.
  5. This consumer writes no repository file except its own ci-status artifact.

RUNTIME PROBES (PROBE-TRANSPORT-MONOCULTURE-1, agent_issues 2060, 2026-10-06)
  From 2026-10-01 to 2026-10-06 every automated verification (1707 rows) was a
  SQL read of qnfo-audit: fleet-control's tick selects verify_transport =
  'd1-query' only and this file knew only D1. transport_trust listed nine trusted
  runtime transports with no executor behind any of them, so a runtime defect (a
  slow page, a dead route) could only be closed by narrative. This file now runs
  runtime probes from the GitHub-hosted runner, a vantage outside the Cloudflare
  account whose code it checks, as transport `runner-https`. It is
  the mirror of PROBE-TRANSPORTS-1 (agent_issues 2059): there qnfo-fleet-control
  runs `external-https` from Cloudflare against hosts OUTSIDE the fleet and
  refuses fleet hosts (a same-account fetch is not independent, issue 1190);
  here the runner checks the fleet's own hosts from outside. The two transports
  never select each other's contracts. The probe is declarative JSON, never
  code: {"url": "https://...", "status": 200, "contains": "...", "max_ms": 3000}.
  6. GET only, https only, no credentials, hosts in HTTPS_HOSTS only (every
     redirect hop too), at most HTTPS_READ_CAP bytes read.
  7. expected is the literal token 'ok'; observed is 'ok' or a failure token
     (status=404, missing-marker, slow=4123ms, error:<type>). No response body
     ever leaves the probe: this repository is public.
  8. A pass holds the contract for RT_HOLD_D days before it closes (the
     REMEDIATION-HOLD-1 rule fleet-control applies to d1-query); a fail streak of
     max_attempts after a pass or closure reopens the issue (REMEDIATION-REOPEN-1).
     A module 'runtime-liveness-v1' contract never closes; when it has no issue
     and fails max_attempts times in a row it files one RUNTIME-PROBE-FAIL-1
     issue and adopts it, so the autoclose trigger closes that issue on recovery.
  9. Each run writes metric runtime_verified_share_24h (share of the last 24h of
     verifications on a trusted, independent, runtime-observable transport); its
     trigger breaches if this runner stops, which a Cloudflare cron evaluates.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CF_API = "https://api.cloudflare.com/client/v4"
ACCOUNT = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or ""
TOKEN = (os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN") or "")
DB_NAME = os.environ.get("REMEDIATION_DB", "qnfo-audit")
DB_ID = os.environ.get("D1_DATABASE_ID", "")
VERIFIER = "remediation-consumer@%s" % (os.environ.get("GITHUB_SHA", "local")[:12])
MAX_ITEMS = int(os.environ.get("REMEDIATION_MAX_ITEMS", "10"))

WRITE_KW = (
    "insert into", "update ", "delete from", "drop table", "drop index",
    "alter table", "create table", "create index", "create trigger",
    "attach ", "detach ", "pragma ", "replace into", "vacuum",
)

CONTRACT_SQL = """
SELECT class, issue_id, precondition, action, verify_probe, verify_transport,
       max_attempts, escalate_to, expected_cadence_h, module, budget_ms,
       next_due_at, max_items, attempts, last_verdict
FROM remediation_contracts
WHERE (status = 'active' OR (status = 'holding' AND verify_transport = 'runner-https'))
  AND verify_transport NOT IN ('external-https', 'd1-query@portfolio-state')
  AND (next_due_at IS NULL OR datetime(next_due_at) <= datetime('now'))
ORDER BY COALESCE(next_due_at, ts)
LIMIT ?
"""

# PROBE-TRANSPORT-MONOCULTURE-1: the runtime transport this file executes itself (see the docstring, rules 6-9).
HTTPS_TRANSPORT = "runner-https"
# PROBE-PLANES-1: qwav.tech (ask.qwav.tech) and qwav.org are fleet hosts in fleet-control RT_FLEET_HOSTS as well, and a
# Worker may not probe them (issue 1190), so only this runner can.
HTTPS_HOSTS = ("qnfo.org", "q08.org", "q08.workers.dev", "qwav.tech", "qwav.org")
HTTPS_READ_CAP = 512 * 1024
HTTPS_TIMEOUT_S = 20
RT_HOLD_D = 7
RT_HOLD_CADENCE_H = 24
LIVENESS_MODULE = "runtime-liveness-v1"


def log(msg):
    sys.stderr.write("[consumer] %s\n" % msg)
    sys.stderr.flush()


def _req(method, url, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "qnfo-remediation-consumer/1")
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode("utf-8"))


def resolve_db_id():
    global DB_ID
    if DB_ID:
        return DB_ID
    r = _req("GET", "%s/accounts/%s/d1/database?per_page=100" % (CF_API, ACCOUNT))
    for d in (r.get("result") or []):
        if d.get("name") == DB_NAME:
            DB_ID = d.get("uuid") or d.get("id")
            return DB_ID
    raise RuntimeError("D1 database %r not found for this account" % DB_NAME)


def d1(sql, params=None):
    url = "%s/accounts/%s/d1/database/%s/query" % (CF_API, ACCOUNT, resolve_db_id())
    r = _req("POST", url, {"sql": sql, "params": params or []})
    if not r.get("success"):
        raise RuntimeError("d1 error: %s" % json.dumps(r.get("errors")))
    res = r.get("result") or []
    return (res[0].get("results") or []) if res else []


# PLANE-PROBE-1 (2026-10-01, #1649; owner directive: no dependency on continued Claude usage). Some evidence lives in a
# separate data plane that no QNFO worker may bind (PERSONAL-QNFO-SEPARATION-1): personal-api writes brief_cron_runs to
# personal-life only. A contract whose transport names an allowlisted plane runs its probe against that database through
# the Cloudflare API, read-only and subject to the same literal-SELECT gate. Only the probe's expected/observed tokens
# leave the plane; this repository is public, so a plane probe must never select content. fleet-control's hourly tick
# runs transport 'd1-query' only, so plane contracts are executed here alone.
PLANE_DBS = {"d1-query@personal-life": "e8d6c61a-10b7-4086-b81e-9e6e85afa407"}
# PROBE-PLANES-1 (2026-10-06, agent_issues 2075, owner question "why do fleet probes only run as SQL against qnfo-audit"):
# a contract may name any D1 database of the account by name, d1-query@<name>, resolved through the Cloudflare API at run
# time (one list call per run). Before this, a d1-query@<name> other than personal-life fell through to qnfo-audit and ran
# the probe against the wrong database. Refused planes hold other people's data (owner documents, outreach contacts): a
# probe there could copy a row into this public repository's run log, so their contracts are skipped, never run.
# d1-query@portfolio-state and external-https are qnfo-fleet-control's (its hourly tick runs them on Cloudflare), so the
# due query above leaves them alone instead of stamping them unexecutable.
PLANE_REFUSED = ("qnfo-identity", "qnfo-outreach")
FLEET_CONTROL_TRANSPORTS = ("external-https", "d1-query@portfolio-state")
_PLANE_IDS = {}


def plane_db_id(transport, lister=None):
    """d1-query@<name> -> (database id, None) or (None, reason). lister() returns the account's [{name, uuid}] list."""
    t = str(transport or "")
    if t in PLANE_DBS:
        return PLANE_DBS[t], None
    if not t.startswith("d1-query@"):
        return None, "not-a-plane"
    name = t.split("@", 1)[1].strip()
    if not name or name == DB_NAME:
        return None, "plane-is-the-default-db"
    if name in PLANE_REFUSED:
        return None, "plane-refused"
    if name not in _PLANE_IDS:
        listed = (lister or _list_dbs)()
        for d in listed or []:
            _PLANE_IDS[d.get("name")] = d.get("uuid") or d.get("id")
    pid = _PLANE_IDS.get(name)
    return (pid, None) if pid else (None, "plane-not-found")


def _list_dbs():
    r = _req("GET", "%s/accounts/%s/d1/database?per_page=100" % (CF_API, ACCOUNT))
    return r.get("result") or []


def d1_plane(transport, sql):
    pid, why = plane_db_id(transport)
    if not pid:
        raise RuntimeError("plane %s: %s" % (transport, why))
    url = "%s/accounts/%s/d1/database/%s/query" % (CF_API, ACCOUNT, pid)
    r = _req("POST", url, {"sql": sql, "params": []})
    if not r.get("success"):
        raise RuntimeError("d1 plane error: %s" % json.dumps(r.get("errors")))
    res = r.get("result") or []
    return (res[0].get("results") or []) if res else []


def is_literal_select(sql):
    """A probe may only be a single literal read-only SELECT/WITH statement."""
    s = (sql or "").strip()
    if not s:
        return False, "empty-probe"
    low = s.lower()
    if not (low.startswith("select") or low.startswith("with")):
        return False, "not-a-select"
    for kw in WRITE_KW:
        if kw in low:
            return False, "write-keyword:%s" % kw.strip()
    body = s.rstrip()
    if body.endswith(";"):
        body = body[:-1]
    if ";" in body:
        return False, "multi-statement"
    return True, "ok"


def extract_pair(rows):
    """Pull (expected, observed) from the probe result. Never invents a value."""
    if not rows:
        return None, None
    row = rows[0]
    if not isinstance(row, dict):
        return None, None
    low = {str(k).lower(): v for k, v in row.items()}
    if "expected" in low and "observed" in low:
        return low["expected"], low["observed"]
    vals = list(row.values())
    if len(vals) >= 2:
        return vals[0], vals[1]
    return None, None


def classify(expected, observed):
    """(pass, verdict). None pass means: no verification row may be written."""
    e = "" if expected is None else str(expected).strip()
    o = "" if observed is None else str(observed).strip()
    if not e or not o:
        return None, "vacuous-probe-result"
    if e == o:
        return 1, "pass"
    return 0, "fail"


def host_allowed(url):
    """https only, and the host is an allowlisted fleet domain or a subdomain of one."""
    try:
        p = urllib.parse.urlsplit(str(url or ""))
    except ValueError:
        return False
    if p.scheme != "https" or p.username or p.password or not p.hostname:
        return False
    h = p.hostname.lower().rstrip(".")
    return any(h == d or h.endswith("." + d) for d in HTTPS_HOSTS)


def parse_https_probe(spec):
    """(probe dict, None) or (None, reason). The spec is JSON data, never code."""
    try:
        p = json.loads(spec or "")
    except (TypeError, ValueError):
        return None, "not-json"
    if not isinstance(p, dict):
        return None, "not-an-object"
    unknown = set(p) - {"url", "status", "contains", "max_ms"}
    if unknown:
        return None, "unknown-key:%s" % sorted(unknown)[0]
    if not host_allowed(p.get("url")):
        return None, "url-not-allowlisted"
    st = p.get("status", 200)
    if not isinstance(st, int) or not 100 <= st <= 599:
        return None, "bad-status"
    c = p.get("contains")
    if c is not None and (not isinstance(c, str) or not c or len(c) > 200):
        return None, "bad-contains"
    m = p.get("max_ms")
    if m is not None and (not isinstance(m, int) or m <= 0 or m > HTTPS_TIMEOUT_S * 1000):
        return None, "bad-max_ms"
    return {"url": p["url"], "status": st, "contains": c, "max_ms": m}, None


class _AllowlistRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not host_allowed(newurl):
            raise urllib.error.URLError("redirect-off-allowlist")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_HTTPS_OPENER = urllib.request.build_opener(_AllowlistRedirect)


def judge_https(probe, status, elapsed_ms, body):
    """observed token for one response. Order: status, marker, latency."""
    if status != probe["status"]:
        return "status=%d" % status
    if probe.get("contains") and probe["contains"].encode("utf-8") not in (body or b""):
        return "missing-marker"
    if probe.get("max_ms") and elapsed_ms > probe["max_ms"]:
        return "slow=%dms" % elapsed_ms
    return "ok"


def run_https_probe(probe):
    """Execute one GET. Returns the observed token; never raises."""
    req = urllib.request.Request(probe["url"], method="GET")
    req.add_header("User-Agent", "qnfo-remediation-consumer/2 (runner-https probe; +https://fleet.qnfo.org)")
    req.add_header("Cache-Control", "no-cache")
    t0 = time.time()
    try:
        with _HTTPS_OPENER.open(req, timeout=HTTPS_TIMEOUT_S) as r:
            body = r.read(HTTPS_READ_CAP)
            status = r.status
    except urllib.error.HTTPError as e:
        body, status = b"", e.code
    except Exception as e:  # noqa: BLE001 - the failure is the observation
        reason = getattr(e, "reason", None)
        if isinstance(reason, str) and reason == "redirect-off-allowlist":
            return "error:redirect-off-allowlist"
        return "error:%s" % type(e).__name__
    return judge_https(probe, status, int((time.time() - t0) * 1000), body)


def rt_pass_streak_days(cls):
    """Days since the first pass after the last real failure (pending/empty are deferrals). Mirrors fleet-control."""
    rows = d1(
        "SELECT MIN(verified_at) AS t FROM remediation_verifications WHERE class = ?1 AND pass = 1 AND verified_at > "
        "COALESCE((SELECT MAX(verified_at) FROM remediation_verifications WHERE class = ?1 AND pass = 0 "
        "AND COALESCE(observed, '') <> '' AND lower(trim(observed)) NOT LIKE 'pending%'), '1970-01-01')",
        [cls])
    t = rows[0].get("t") if rows else None
    if not t:
        return 0.0
    t = str(t).replace("T", " ")[:19]
    try:
        ts = time.mktime(time.strptime(t, "%Y-%m-%d %H:%M:%S")) - time.timezone
    except ValueError:
        return 0.0
    return max(0.0, (time.time() - ts) / 86400.0)


def fails_since_last_pass(cls):
    rows = d1(
        "SELECT COUNT(*) AS n FROM remediation_verifications WHERE class = ?1 AND pass = 0 AND verified_at > "
        "COALESCE((SELECT MAX(verified_at) FROM remediation_verifications WHERE class = ?1 AND pass = 1), '1970-01-01')",
        [cls])
    return int(rows[0].get("n") or 0) if rows else 0


def https_after_verdict(c, passed, observed, out):
    """Status transitions for a runner-https contract. Returns (next_status or None, cadence_h)."""
    cls, cad = c.get("class"), max(1, int(c.get("expected_cadence_h") or 1))
    liveness = c.get("module") == LIVENESS_MODULE
    max_att = max(1, int(c.get("max_attempts") or 3))
    if passed == 1:
        if liveness:
            return None, cad
        if rt_pass_streak_days(cls) >= RT_HOLD_D:
            return "closed", cad
        return "holding", max(cad, RT_HOLD_CADENCE_H)
    fails = fails_since_last_pass(cls)
    if fails < max_att:
        return None, cad
    issue_id = c.get("issue_id")
    if issue_id is None and liveness:
        rows = d1(
            "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) "
            "VALUES (?1, ?2, 'remediation-consumer', 'reliability', 'high', 'open', "
            "CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000) RETURNING id",
            ["RUNTIME-PROBE-FAIL-1: %s" % cls,
             "Charter pillar: core. remediation-consumer (%s) ran the runner-https liveness contract %s from a "
             "GitHub-hosted runner and it failed %d times in a row; latest observation %s. Probe: %s. The contract "
             "keeps running and the autoclose trigger closes this issue on its first pass. agent_issues 2060."
             % (VERIFIER, cls, fails, observed, str(c.get("verify_probe"))[:300])])
        if rows:
            issue_id = rows[0].get("id")
            d1("UPDATE remediation_contracts SET issue_id = ?1 WHERE class = ?2 AND issue_id IS NULL", [issue_id, cls])
            out.setdefault("filed", []).append(issue_id)
        return "active", cad
    if issue_id is not None:
        r = d1(
            "UPDATE agent_issues SET status = 'open', description = COALESCE(description, '') || ?2, updated_at = "
            "CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = ?1 AND status IN ('closed', 'resolved') RETURNING id",
            [issue_id, "\nREOPENED %s (REMEDIATION-REOPEN-1 via %s): runner-https contract %s failed %dx in a row, "
             "observed %s." % (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), VERIFIER, cls, fails, observed)])
        if r:
            out.setdefault("reopened", []).append(issue_id)
    return "active", cad


RUNTIME_SHARE_SQL = (
    "SELECT ROUND(100.0 * SUM(CASE WHEN t.trusted = 1 AND t.independent = 1 AND t.runtime_observable = 1 THEN 1 ELSE 0 END) "
    "/ COUNT(*), 1) AS v, COUNT(*) AS n FROM remediation_verifications v LEFT JOIN transport_trust t ON t.transport = v.transport "
    "WHERE replace(substr(v.verified_at, 1, 19), 'T', ' ') >= datetime('now', '-1 day')")


def refresh_runtime_share(out):
    rows = d1(RUNTIME_SHARE_SQL)
    v = rows[0].get("v") if rows else None
    out["runtime_verified_share_24h"] = v
    d1("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2, state = 'MEASURED' "
       "WHERE metric = 'runtime_verified_share_24h'",
       ["n/a" if v is None else str(v), time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())])


def _selftest():
    cases = [
        ("SELECT 'a' AS expected, 'a' AS observed", 1, "pass"),
        ("SELECT 'a' AS expected, 'b' AS observed", 0, "fail"),
        ("SELECT NULL AS expected, 'b' AS observed", None, "vacuous-probe-result"),
        ("SELECT '' AS expected, '' AS observed", None, "vacuous-probe-result"),
    ]
    for sql, want_pass, want_verdict in cases:
        rows = [dict(zip(("expected", "observed"), ())) ] if False else None
        # simulate the probe result rather than executing it
        if "NULL" in sql:
            rows = [{"expected": None, "observed": "b"}]
        elif "'' AS expected" in sql:
            rows = [{"expected": "", "observed": ""}]
        else:
            rows = [{"expected": sql.split("'")[1], "observed": sql.split("'")[3]}]
        e, o = extract_pair(rows)
        p, v = classify(e, o)
        if p != want_pass or v != want_verdict:
            print(json.dumps({"ok": False, "case": sql, "got": [p, v],
                              "want": [want_pass, want_verdict]}))
            return 1
    probes = [
        ("SELECT 1", True), ("WITH x AS (SELECT 1) SELECT * FROM x", True),
        ("UPDATE t SET a=1", False), ("SELECT 1; DROP TABLE t", False),
        ("SELECT 1; SELECT 2", False), ("", False),
        ("SELECT * FROM t WHERE a='DELETE FROM'", False),
    ]
    for sql, want in probes:
        got, why = is_literal_select(sql)
        if got != want:
            print(json.dumps({"ok": False, "probe": sql, "got": got, "why": why}))
            return 1
    # PROBE-PLANES-1: any account D1 by name, refused planes never run, fleet-control's transports never selected.
    fake = lambda: [{"name": "living-paper", "uuid": "lp-1"}, {"name": "qnfo-identity", "uuid": "id-1"}, {"name": "qnfo-outreach", "uuid": "or-1"}]
    _PLANE_IDS.clear()
    planes = [
        ("d1-query@personal-life", ("e8d6c61a-10b7-4086-b81e-9e6e85afa407", None)),
        ("d1-query@living-paper", ("lp-1", None)),
        ("d1-query@qnfo-identity", (None, "plane-refused")),
        ("d1-query@qnfo-outreach", (None, "plane-refused")),
        ("d1-query@no-such-db", (None, "plane-not-found")),
        ("d1-query@" + DB_NAME, (None, "plane-is-the-default-db")),
        ("d1-query", (None, "not-a-plane")),
    ]
    for t, want in planes:
        got = plane_db_id(t, lister=fake)
        if got != want:
            print(json.dumps({"ok": False, "plane": t, "got": got, "want": want}))
            return 1
    _PLANE_IDS.clear()
    if not all(("'%s'" % t) in CONTRACT_SQL for t in FLEET_CONTROL_TRANSPORTS) or "NOT IN" not in CONTRACT_SQL:
        print(json.dumps({"ok": False, "why": "the due query must leave fleet-control's transports alone"}))
        return 1
    # PROBE-TRANSPORT-MONOCULTURE-1: the runner-https parser, allowlist and judge, offline.
    hosts = [
        ("https://qnfo.org/health", True), ("https://fleet.qnfo.org/", True), ("https://q08.org/", True),
        ("https://x.q08.workers.dev/health", True), ("http://qnfo.org/", False), ("https://evilqnfo.org/", False),
        ("https://qnfo.org.evil.com/", False), ("https://user:pw@qnfo.org/", False), ("ftp://qnfo.org/", False),
        ("https://example.com/", False), ("", False),
        ("https://ask.qwav.tech/api/ask", True), ("https://qwav.org/", True), ("https://qwav.tech.evil.com/", False),
    ]
    for url, want in hosts:
        if host_allowed(url) != want:
            print(json.dumps({"ok": False, "host": url, "want": want}))
            return 1
    specs = [
        ('{"url": "https://qnfo.org/health", "status": 200, "contains": "qnfo-gateway"}', None),
        ('{"url": "https://qnfo.org/", "max_ms": 3000}', None),
        ('{"url": "https://example.com/"}', "url-not-allowlisted"),
        ('{"url": "https://qnfo.org/", "method": "POST"}', "unknown-key:method"),
        ('{"url": "https://qnfo.org/", "status": "200"}', "bad-status"),
        ('{"url": "https://qnfo.org/", "contains": ""}', "bad-contains"),
        ('{"url": "https://qnfo.org/", "max_ms": 999999}', "bad-max_ms"),
        ("SELECT 1", "not-json"), ("[1]", "not-an-object"),
    ]
    for spec, want_err in specs:
        p, err = parse_https_probe(spec)
        if err != want_err or (want_err is None and p is None):
            print(json.dumps({"ok": False, "spec": spec, "got": err, "want": want_err}))
            return 1
    pr = {"url": "https://qnfo.org/", "status": 200, "contains": "gateway", "max_ms": 1000}
    judged = [
        ((200, 50, b"..gateway.."), "ok"), ((404, 50, b"gateway"), "status=404"),
        ((200, 50, b"nothing"), "missing-marker"), ((200, 1500, b"gateway"), "slow=1500ms"),
    ]
    for (st, ms, body), want in judged:
        got = judge_https(pr, st, ms, body)
        if got != want:
            print(json.dumps({"ok": False, "judge": [st, ms], "got": got, "want": want}))
            return 1
    if classify("ok", "status=404") != (0, "fail") or classify("ok", "ok") != (1, "pass"):
        print(json.dumps({"ok": False, "case": "https-classify"}))
        return 1
    try:
        import host_census
        hc = host_census.selftest()
    except Exception as e:  # noqa: BLE001
        hc = {"ok": False, "error": str(e)[:200]}
    if not hc.get("ok"):
        print(json.dumps({"ok": False, "case": "host-census", "detail": hc}))
        return 1
    print(json.dumps({"ok": True, "marker": "REMEDIATION-CONSUMER-1",
                      "selftest": "classify+probe-guard+runner-https+host-census green"}))
    return 0


def consume_https(c, rec, out, trusted):
    """Run one runner-https contract. Returns (next_status, cadence_h)."""
    probe, why = parse_https_probe(c.get("verify_probe"))
    if probe is None:
        rec["verdict"], rec["reason"] = "probe-not-machine-executable", why
        out["skipped"] += 1
        return None, None
    if HTTPS_TRANSPORT not in trusted:
        rec["verdict"], rec["reason"] = "untrusted-transport", "%r not trusted" % HTTPS_TRANSPORT
        out["skipped"] += 1
        return None, None
    obs = run_https_probe(probe)
    passed, verdict = classify("ok", obs)
    rec.update({"expected": "ok", "observed": obs, "verdict": verdict})
    d1(
        "INSERT INTO remediation_verifications "
        "(issue_id, class, probe_url, transport, expected, observed, pass, verifier) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [c.get("issue_id"), c.get("class"), probe["url"], HTTPS_TRANSPORT, "ok", obs, passed, VERIFIER],
    )
    rec["written"] = True
    out["pass" if passed == 1 else "fail"] += 1
    out["https"] = out.get("https", 0) + 1
    return https_after_verdict(c, passed, obs, out)


def consume_d1(c, rec, out, trusted):
    """Run one d1-query (or d1-query@plane) contract: the REMEDIATION-CONSUMER-1 path, unchanged."""
    cls = c.get("class")
    ok_probe, why = is_literal_select(c.get("verify_probe"))
    if not ok_probe:
        rec["verdict"] = "probe-not-machine-executable"
        rec["reason"] = why
        out["skipped"] += 1
        return
    transport = c.get("verify_transport")
    if str(transport or "").startswith("d1-query@"):
        pid, why = plane_db_id(transport)
        if not pid:
            rec["verdict"] = why
            rec["reason"] = "%s is not run here (%s)" % (transport, why)
            out["skipped"] += 1
            return
        rows = d1_plane(transport, c["verify_probe"])
    else:
        rows = d1(c["verify_probe"])
    exp, obs = extract_pair(rows)
    passed, verdict = classify(exp, obs)
    rec["expected"] = exp
    rec["observed"] = obs
    rec["verdict"] = verdict
    if verdict == "vacuous-probe-result":
        out["skipped"] += 1
        rec["reason"] = "probe returned no expected/observed pair"
    elif transport not in trusted:
        out["skipped"] += 1
        rec["verdict"] = "untrusted-transport"
        rec["reason"] = "%r not trusted" % transport
    else:
        d1(
            "INSERT INTO remediation_verifications "
            "(issue_id, class, probe_url, transport, expected, observed, pass, verifier) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [c.get("issue_id"), cls,
             "d1:remediation_contracts/" + str(cls),
             transport, str(exp).strip(), str(obs).strip(), passed, VERIFIER],
        )
        rec["written"] = True
        if passed == 1:
            out["pass"] += 1
        else:
            out["fail"] += 1


def main():
    t0 = time.time()
    out = {"ok": True, "marker": "REMEDIATION-CONSUMER-1", "verifier": VERIFIER,
           "due": 0, "pass": 0, "fail": 0, "skipped": 0, "contracts": []}

    trusted = {r["transport"] for r in d1("SELECT transport FROM transport_trust WHERE trusted = 1")}
    out["trusted_transports"] = sorted(trusted)
    if not trusted:
        out["ok"] = False
        out["error"] = "transport_trust returned no trusted transport; refusing to run"
        print(json.dumps(out))
        return 1

    contracts = d1(CONTRACT_SQL, [MAX_ITEMS])
    out["due"] = len(contracts)
    log("due contracts: %d" % len(contracts))

    for c in contracts:
        cls = c.get("class")
        rec = {"class": cls, "issue_id": c.get("issue_id"), "verdict": None}
        next_status, cadence = None, None
        try:
            if c.get("verify_transport") == HTTPS_TRANSPORT:
                next_status, cadence = consume_https(c, rec, out, trusted)
            else:
                consume_d1(c, rec, out, trusted)
        except Exception as e:  # noqa: BLE001 - one bad contract must not kill the run
            rec["verdict"] = "probe-error"
            rec["reason"] = str(e)[:300]
            out["skipped"] += 1
            log("contract %s error: %s" % (cls, e))

        if cadence is None:
            cadence = c.get("expected_cadence_h") or 6
        try:
            d1(
                "UPDATE remediation_contracts SET attempts = COALESCE(attempts,0) + 1, "
                "last_attempt_at = datetime('now'), last_verdict = ?, "
                "next_due_at = datetime('now', ?), status = COALESCE(?, status) WHERE class = ?",
                [rec["verdict"], "+%d hours" % int(cadence), next_status, cls],
            )
        except Exception as e:  # noqa: BLE001
            log("contract %s stamp failed: %s" % (cls, e))
        out["contracts"].append(rec)

    try:
        refresh_runtime_share(out)
    except Exception as e:  # noqa: BLE001 - the metric must not kill the run record
        out["runtime_share_error"] = str(e)[:200]

    # HOST-CENSUS-1 (2026-10-07): every public hostname of the account, probed from this runner every 6h; read-only,
    # self-filing and self-closing (scripts/host_census.py). A failure here never stops the contract run.
    try:
        import host_census
        out["host_census"] = host_census.run(d1, lambda path: _req("GET", CF_API + path), VERIFIER)
    except Exception as e:  # noqa: BLE001
        out["host_census_error"] = str(e)[:200]

    spent = int((time.time() - t0) * 1000)
    try:
        d1(
            "INSERT INTO remediation_runs "
            "(run_id, module, issue_ids, budget_ms, spent_ms, items_due, items_attempted, "
            " items_pass, items_fail, stopped_reason, checkpoint, evidence, ended_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            ["remediation-consumer-%d" % int(time.time()), "thread-remediation",
             json.dumps([c.get("issue_id") for c in contracts]),
             45000, spent, len(contracts),
             out["pass"] + out["fail"], out["pass"], out["fail"],
             "completed",
             json.dumps({"contracts": out["contracts"]})[:4000],
             json.dumps({"verifier": VERIFIER, "trusted": sorted(trusted)})],
        )
    except Exception as e:  # noqa: BLE001
        log("run record failed: %s" % e)

    out["spent_ms"] = spent
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    if not TOKEN or not ACCOUNT:
        print(json.dumps({"ok": False, "marker": "REMEDIATION-CONSUMER-1",
                          "error": "CLOUDFLARE_API_TOKEN / CF_ACCOUNT_ID not set"}))
        sys.exit(0)
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "marker": "REMEDIATION-CONSUMER-1",
                          "error": str(exc)[:500]}))
        sys.exit(0)
