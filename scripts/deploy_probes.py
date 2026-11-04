#!/usr/bin/env python3
"""DEPLOY-PROBES-1 (2026-11-04, pillar autonomy; owner: "make every deploy prove itself").

WHAT   A worker declares what must still work after its deploy in `<worker>/probes.json`, next to its worker.js:
           {"mode": "revert",                      // optional: "revert" (default) | "observe" (file the issue, never revert)
            "health": "https://x.q08.workers.dev/health",   // optional: the VERSION poll, for a worker outside the control plane
            "http": [{"url": "https://x.q08.workers.dev/y", "status": 200, "contains": ["marker"], "absent": ["Internal Error"]}],
            "d1":   [{"binding": "DB", "explain": ["SELECT col FROM v_view LIMIT 1"],
                      "noop_write": ["INSERT INTO t (a, b) SELECT 1, 2 WHERE 0"]}]}
       canonical-deploy.yml runs them from the runner after the deploy (scripts/canary_revert.py imports this module), and a probe that
       passed before the deploy and fails after it is a regression: the push is reverted by the existing REVERT path and a closed-loop issue
       carries the failing probe. A probe that already failed before the deploy (and was already declared) is a pre-existing failure: it is
       filed, never reverted. `scripts/deploy_probes.py --check-pr` is the PR-time half: it validates every declaration and requires one for
       a changed worker that is not on scripts/probes-allowlist.txt (shrink-only), or `probes: none (<reason>)` in the PR body.
WHY    2026-11-04: a dashboard rewrite broke three liveness contracts for pages that worked (the probes looked for old-page text) and the
       canary, which proved only that the new VERSION reached /health, passed; `no such table: issue_assignments` and a 24 minute dead
       fleet_tick (a view read a missing column through a trigger) were found by their victims, not by the deploy. SQLite compiles every
       trigger body and view when a statement is PREPARED, so two statement kinds surface exactly those errors on the live D1 without
       touching a row: `explain` (EXPLAIN QUERY PLAN of a SELECT/WITH: views and the tables they read) and `noop_write` (a real INSERT ...
       SELECT ... WHERE 0, UPDATE ... WHERE 0 or DELETE ... WHERE 0: the exact path a worker's write takes, so every trigger and the D1
       trigger-depth limit are compiled, zero rows change; the runner fails the probe if `changes` is not 0). Verified on D1 2026-11-04:
       `EXPLAIN QUERY PLAN INSERT` returned "no such column: zz: SQLITE_ERROR" for a trigger body that read a missing column, and on
       qnfo-audit `INSERT INTO cloud_ops_events ... SELECT ... WHERE 0` returned "triggers nested too deep" while the OR IGNORE form passed:
       the first probe run found a live outage (plain INSERTs into cloud_ops_events failing since migration 1176, 18:57Z; agent_issues
       CLOUD-OPS-EVENTS-INSERT-DEPTH-1), which no test or canary had seen.
DESIGN * Reuses the runner transport of the CONTROL-PLANE-FUNCTIONAL-CANARY-1 step (urllib GET from the GitHub runner, outside the account,
         because a Worker's request to its own account's hosts is the issue-1190 artifact) and its revert; no new system.
       * A D1 error counts as a failure only when it is a compile-class error (no such table / column / function / view, syntax error,
         "nested too deep", ambiguous column ...). "D1 DB is overloaded", timeouts and HTTP 429/5xx are INCONCLUSIVE, never a revert:
         qnfo-audit refused a work claim for that reason while this was being written.
       * A probe whose request failed at the runner (status 0) is inconclusive too: a dead runner network must not revert a good deploy.
       * Private databases (qnfo-identity, qnfo-outreach, personal-life) are refused: the run log is public (PROBE-SYSTEMWIDE-1).
       * URLs are limited to the fleet's own hosts and carry no query secret; the runner only ever sends GET.
USAGE  python3 scripts/deploy_probes.py --selftest
       python3 scripts/deploy_probes.py --validate [dir ...]          # every <dir>/probes.json (default: all) against its wrangler.toml
       python3 scripts/deploy_probes.py --check-pr --changed FILE --body FILE [--root DIR]
       python3 scripts/deploy_probes.py --live <worker> [--d1] [--tries N]   # run one worker's probes against production now
       python3 scripts/deploy_probes.py --baseline --targets /tmp/targets.txt --out /tmp/probe_baseline.json   # before the deploy
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

# Hosts the declarations may name: the fleet's own (DOMAIN-PLANE-1: q08.org personal, qnfo.org research and fleet, qwav.org quantum) and
# the workers.dev account subdomain. A probe is a GET from the runner, so an arbitrary host would make the deploy path a request proxy.
HOST_SUFFIXES = (".q08.workers.dev", ".qnfo.org", ".q08.org", ".qwav.org", ".qwav.tech")
HOST_EXACT = ("qnfo.org", "q08.org", "qwav.org", "qwav.tech")
PRIVATE_DATABASES = ("qnfo-identity", "qnfo-outreach", "personal-life")
MAX_HTTP, MAX_D1_SQL, MAX_MARKERS = 8, 6, 6
DECL_KEYS = {"_note", "mode", "health", "http", "d1"}
HTTP_KEYS = {"_note", "url", "status", "contains", "absent"}
D1_KEYS = {"_note", "binding", "explain", "noop_write"}
NOOP_TAIL = re.compile(r"(?is)\bWHERE\s+(?:0|1\s*=\s*0|false)\s*$")
SECRET_QUERY = re.compile(r"(?i)(token|key|secret|password|auth|sig|code)=")
# D1 errors that mean "the statement does not compile" (the schema or a trigger/view body is broken). Anything else is inconclusive.
COMPILE_ERROR = re.compile(r"(?i)no such (table|column|function|view|index|trigger|collation sequence|module)|has no column named|syntax error|"
                           r"nested too deep|not a no-op|ambiguous column|misuse of aggregate|wrong number of arguments|not authorized|unrecognized token|"
                           r"incomplete input|table \S+ has \d+ columns|cannot (?:join|use)|too many (?:levels|terms)")
TRANSIENT = re.compile(r"(?i)overload|timed? ?out|HTTP (?:0|408|425|429|500|502|503|504)\b|network connection lost|internal error|"
                       r"temporarily|try again|too many resources|connection (?:reset|refused)|ECONN|unavailable")


def emit(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------------------------------------------------------- declarations
def host_ok(host):
    h = (host or "").lower().rstrip(".")
    return h in HOST_EXACT or h.endswith(HOST_SUFFIXES)


def as_list(v):
    if v is None:
        return []
    return list(v) if isinstance(v, (list, tuple)) else [v]


def d1_bindings(wrangler_text):
    """{binding: (database_name, database_id)} from the [[d1_databases]] blocks of a wrangler.toml (regex: no tomllib on 3.10)."""
    out = {}
    for block in re.split(r"(?m)^\s*\[\[d1_databases\]\]\s*$", str(wrangler_text or ""))[1:]:
        block = re.split(r"(?m)^\s*\[", block, maxsplit=1)[0]
        b = re.search(r'(?m)^\s*binding\s*=\s*"([^"]+)"', block)
        n = re.search(r'(?m)^\s*database_name\s*=\s*"([^"]+)"', block)
        i = re.search(r'(?m)^\s*database_id\s*=\s*"([^"]+)"', block)
        if b and i:
            out[b.group(1)] = (n.group(1) if n else "", i.group(1))
    return out


def validate(decl, bindings=None):
    """The list of problems with a parsed declaration (empty = valid). `bindings` (d1_bindings) is optional: without it a d1 binding is not resolved."""
    errs = []
    if not isinstance(decl, dict):
        return ["the declaration must be a JSON object"]
    for k in decl:
        if k not in DECL_KEYS:
            errs.append("unknown key " + json.dumps(k))
    if decl.get("mode", "revert") not in ("revert", "observe"):
        errs.append('mode must be "revert" or "observe"')
    health = decl.get("health")
    if health is not None:
        u = urlparse(str(health))
        if u.scheme != "https" or not host_ok(u.hostname) or SECRET_QUERY.search(u.query or ""):
            errs.append("health must be an https URL on a fleet host without a secret query")
    http = decl.get("http", [])
    d1 = decl.get("d1", [])
    if not isinstance(http, list) or not isinstance(d1, list):
        return errs + ['"http" and "d1" must be lists']
    if len(http) > MAX_HTTP:
        errs.append("at most %d http probes" % MAX_HTTP)
    for n, p in enumerate(http):
        tag = "http[%d]" % n
        if not isinstance(p, dict):
            errs.append(tag + " must be an object")
            continue
        for k in p:
            if k not in HTTP_KEYS:
                errs.append(tag + " unknown key " + json.dumps(k))
        u = urlparse(str(p.get("url", "")))
        if u.scheme != "https" or not u.hostname:
            errs.append(tag + " url must be an https URL")
        elif not host_ok(u.hostname):
            errs.append(tag + " host " + u.hostname + " is not a fleet host (" + ", ".join(HOST_EXACT) + " and their subdomains, *.q08.workers.dev)")
        elif SECRET_QUERY.search(u.query or ""):
            errs.append(tag + " url carries a secret-looking query parameter; probes send no credential")
        st = p.get("status", 200)
        if not (isinstance(st, int) and not isinstance(st, bool) and 100 <= st <= 599):
            errs.append(tag + " status must be an HTTP status integer")
        for k in ("contains", "absent"):
            ms = as_list(p.get(k))
            if len(ms) > MAX_MARKERS or any(not isinstance(m, str) or not m.strip() for m in ms):
                errs.append("%s %s must be at most %d non-empty strings" % (tag, k, MAX_MARKERS))
        if not as_list(p.get("contains")) and not as_list(p.get("absent")) and st == 200:
            errs.append(tag + " needs a contains marker (a bare 200 proves only that something answers; the 2026-11-04 liveness miss was a page that answered)")
    nsql = 0
    for n, p in enumerate(d1):
        tag = "d1[%d]" % n
        if not isinstance(p, dict):
            errs.append(tag + " must be an object")
            continue
        for k in p:
            if k not in D1_KEYS:
                errs.append(tag + " unknown key " + json.dumps(k))
        b = p.get("binding")
        if not isinstance(b, str) or not b:
            errs.append(tag + " needs a binding name")
        elif bindings is not None:
            if b not in bindings:
                errs.append(tag + " binding " + b + " is not a [[d1_databases]] binding of the worker's wrangler.toml")
            elif bindings[b][0] in PRIVATE_DATABASES:
                errs.append(tag + " binding " + b + " is the private database " + bindings[b][0] + ": its errors would reach the public run log")
        explain, writes = p.get("explain", []), p.get("noop_write", [])
        if not isinstance(explain, list) or not isinstance(writes, list) or not (explain or writes):
            errs.append(tag + " needs an explain list (SELECT statements) and/or a noop_write list (INSERT/UPDATE/DELETE ... WHERE 0)")
            continue
        for kind, sqls in (("explain", explain), ("noop_write", writes)):
            for s_ in sqls:
                nsql += 1
                if not isinstance(s_, str) or not s_.strip():
                    errs.append(tag + " " + kind + " entries must be non-empty strings")
                    continue
                body = s_.strip().rstrip(";").strip()
                if ";" in body:
                    errs.append(tag + " one statement per entry (no ';'): " + s_[:60])
                if kind == "explain" and not re.match(r"(?is)^(SELECT|WITH)\b", body):
                    errs.append(tag + " explain takes a SELECT or WITH statement (the runner adds EXPLAIN QUERY PLAN); put writes in noop_write: " + s_[:60])
                if kind == "noop_write" and not (re.match(r"(?is)^(INSERT|UPDATE|DELETE)\b", body) and NOOP_TAIL.search(body)):
                    errs.append(tag + " noop_write takes an INSERT, UPDATE or DELETE that ends in WHERE 0 (it runs for real and must change no row): " + s_[:60])
    if nsql > MAX_D1_SQL:
        errs.append("at most %d d1 statements per worker" % MAX_D1_SQL)
    if not http and not d1 and not decl.get("health"):
        errs.append("the declaration has no probe (add http, d1 or health)")
    return errs


def load_declaration(text, wrangler_text=None):
    """(declaration or None, errors) from the text of a probes.json."""
    try:
        decl = json.loads(text)
    except ValueError as e:
        return None, ["not valid JSON: " + str(e)[:120]]
    errs = validate(decl, d1_bindings(wrangler_text) if wrangler_text is not None else None)
    return (decl if not errs else None), errs


def probe_list(decl):
    """Flat list of (key, kind, spec) for every probe of a declaration. key is stable across edits that do not change the probe."""
    out = []
    for p in (decl or {}).get("http") or []:
        spec = {"url": p.get("url"), "status": p.get("status", 200), "contains": as_list(p.get("contains")), "absent": as_list(p.get("absent"))}
        out.append((probe_key("http", spec), "http", spec))
    for p in (decl or {}).get("d1") or []:
        for write, field in ((False, "explain"), (True, "noop_write")):
            for s in p.get(field) or []:
                spec = {"binding": p.get("binding"), "sql": str(s).strip().rstrip(";").strip(), "write": write}
                out.append((probe_key("d1", spec), "d1", spec))
    return out


def probe_key(kind, spec):
    return hashlib.sha1((kind + ":" + json.dumps(spec, sort_keys=True)).encode("utf-8")).hexdigest()[:12]


def label(kind, spec):
    if kind == "http":
        return "GET " + str(spec["url"])[:120]
    return ("NOOP-WRITE " if spec.get("write") else "EXPLAIN ") + str(spec["binding"]) + ": " + str(spec["sql"])[:110]


# -------------------------------------------------------------------------------------------------------------------- running
def fetch_text(url, timeout=25):
    """(status, body text) of one GET; (0, error text) when the request itself fails."""
    req = urllib.request.Request(url, headers={"User-Agent": "qnfo-deploy-probe/1.0 (+canonical-deploy)", "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(2_000_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read(200_000).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            body = ""
        return e.code, body
    except (urllib.error.URLError, ValueError, OSError) as e:
        return 0, str(e)[:160]


def compact(s):
    return re.sub(r"\s+", "", str(s or ""))


def judge_http(status, body, spec):
    """One answer against its probe -> None when it passes, else the reason. A status 0 reason starts with 'HTTP 0' (inconclusive)."""
    want = spec.get("status", 200)
    if status != want:
        return "HTTP " + str(status) + (" (wanted " + str(want) + ")" if status else (": " + str(body)[:80]))
    text, c = str(body or ""), compact(body)
    for m in as_list(spec.get("contains")):
        if m not in text and compact(m) not in c:
            return "marker " + m[:80] + " absent"
    low = text.lower()
    for m in as_list(spec.get("absent")):
        if m.lower() in low or compact(m).lower() in c.lower():
            return "forbidden text " + m[:80] + " present"
    return None


def d1_run(acct, token, db_id, sql, write=False):
    """(ok, message) of one probe statement on a D1 database: `EXPLAIN QUERY PLAN <sql>` for a read, the statement itself for a no-op write
    (WHERE 0: no row changes; a statement that does change one fails the probe)."""
    import cf_ops_actions as C
    try:
        st, j = C.call("POST", "/accounts/%s/d1/database/%s/query" % (acct, db_id), token, {"sql": sql if write else "EXPLAIN QUERY PLAN " + sql, "params": []}, timeout=60)
    except Exception as e:  # noqa: BLE001
        return False, "request failed: " + str(e)[:120]
    if st == 200 and (j or {}).get("success", False):
        meta = (((j or {}).get("result") or [{}])[0] or {}).get("meta") or {}
        if write and int(meta.get("changes") or 0) != 0:
            return False, "D1 statement was not a no-op: changed %s row(s)" % meta.get("changes")
        return True, ""
    errs = (j or {}).get("errors") or []
    msg = "; ".join(str((e or {}).get("message", e)) for e in errs)[:300] or json.dumps(j)[:200]
    return False, "D1 HTTP " + str(st) + ": " + msg


def judge_d1(ok, message):
    """-> 'ok' | 'fail' | 'inconclusive'. A compile-class error is a failure; an overload, a timeout or an unknown error is not."""
    if ok:
        return "ok"
    if TRANSIENT.search(message or ""):
        return "inconclusive"
    return "fail" if COMPILE_ERROR.search(message or "") else "inconclusive"


def run_probe(kind, spec, ctx, tries=1, wait_sec=15, sleep=time.sleep):
    """One probe with up to `tries` attempts -> {"state": ok|fail|inconclusive, "reason": str, "tries": n}.
    ctx: {"fetch": f(url)->(status, body), "d1": f(binding, sql)->(ok, message)}."""
    last = ("fail", "")
    n = 0
    for attempt in range(max(1, tries)):
        n = attempt + 1
        if kind == "http":
            st, body = ctx["fetch"](spec["url"])
            reason = judge_http(st, body, spec)
            state = "ok" if reason is None else ("inconclusive" if st == 0 else "fail")
        else:
            ok, msg = ctx["d1"](spec["binding"], spec["sql"], bool(spec.get("write")))
            state = judge_d1(ok, msg)
            reason = None if state == "ok" else msg
        last = (state, reason or "")
        if state == "ok":
            break
        if attempt + 1 < max(1, tries):
            sleep(wait_sec)
    return {"state": last[0], "reason": last[1], "tries": n}


def evaluate(decl, ctx, tries=4, wait_sec=15, sleep=time.sleep, d1_tries=2, d1_wait=5):
    """Every probe of a declaration. -> {"state": ok|failed|inconclusive|none, "probes": [{key, kind, label, state, reason, tries, spec}]}.
    failed = at least one probe failed; inconclusive = none failed but some could not be judged."""
    results = []
    for key, kind, spec in probe_list(decl):
        r = run_probe(kind, spec, ctx, tries if kind == "http" else d1_tries, wait_sec if kind == "http" else d1_wait, sleep)
        results.append({"key": key, "kind": kind, "label": label(kind, spec), "spec": spec, **r})
    if not results:
        return {"state": "none", "probes": []}
    states = [r["state"] for r in results]
    return {"state": "failed" if "fail" in states else ("inconclusive" if "inconclusive" in states else "ok"), "probes": results}


def classify(result, baseline, base_keys):
    """Split the failed probes of one worker into (regressions, pre_existing).
    baseline: {key: state} measured before the deploy (None = not measured); base_keys: the keys the parent commit already declared
    (None = unknown). A probe is pre-existing only when it was already declared AND already failed before the deploy: a new probe, or one
    that passed before, is the change's own responsibility."""
    reg, pre = [], []
    for p in result.get("probes") or []:
        if p["state"] != "fail":
            continue
        was_failing = baseline is not None and baseline.get(p["key"]) == "fail"
        declared = base_keys is not None and p["key"] in base_keys
        (pre if (was_failing and declared) else reg).append(p)
    return reg, pre


def baseline_state(decl, ctx):
    """Single attempt per probe, before the deploy -> {key: state}."""
    return {key: run_probe(kind, spec, ctx, 1)["state"] for key, kind, spec in probe_list(decl)}


def summary(result, limit=3):
    bad = [p for p in result.get("probes") or [] if p["state"] != "ok"]
    return "; ".join("%s: %s" % (p["label"], p["reason"][:140] or p["state"]) for p in bad[:limit]) or "every probe passed"


def runtime_probe_line(p):
    """The `runtime-probe:` line of an issue (PROBE-BIRTH-RUNTIME-1) for a failed http probe: D1 makes it the issue's runner-https contract,
    so the hourly remediation tick closes the issue when the route answers its marker again. None for a d1 probe."""
    if p.get("kind") != "http":
        return None
    spec = p["spec"]
    contains = as_list(spec.get("contains"))
    obj = {"url": spec["url"], "status": spec.get("status", 200)}
    if contains:
        obj["contains"] = contains[0]
    elif as_list(spec.get("absent")):
        obj["absent"] = as_list(spec["absent"])[0]
    else:
        return None
    return "runtime-probe: " + json.dumps(obj)


# ----------------------------------------------------------------------------------------------------- repository declarations
def read_file(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return None


def worker_dirs(root=ROOT):
    out = []
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d)
        if os.path.isfile(os.path.join(p, "worker.js")) and os.path.isfile(os.path.join(p, "wrangler.toml")):
            out.append(d)
    return out


def retired(root, d):
    return os.path.exists(os.path.join(root, d, "RETIRED")) or os.path.exists(os.path.join(root, d, "FOLDED"))


def read_allowlist(root=ROOT):
    text = read_file(os.path.join(root, "scripts", "probes-allowlist.txt")) or ""
    return {ln.split("#")[0].strip() for ln in text.splitlines() if ln.split("#")[0].strip()}


def validate_repo(root=ROOT, only=None):
    """Every <worker>/probes.json against its wrangler.toml -> [(dir, problem)]. `only` limits the directories."""
    bad = []
    for d in (only if only else worker_dirs(root)):
        text = read_file(os.path.join(root, d, "probes.json"))
        if text is None:
            continue
        _, errs = load_declaration(text, read_file(os.path.join(root, d, "wrangler.toml")) or "")
        bad.extend((d, e) for e in errs)
    return bad


WAIVER = re.compile(r"(?im)^\s*probes:\s*none\s*\(([^)\n]{12,})\)")


def check_pr(changed, body, root=ROOT):
    """The PR-time rule -> (errors, notices). changed: repository paths the pull request touches; body: its description.
    * every changed or declared probes.json must validate against its wrangler.toml;
    * a changed <worker>/worker.js needs <worker>/probes.json, unless the worker is on scripts/probes-allowlist.txt (shrink-only: a notice
      asks for a declaration) or the body carries `probes: none (<reason of 12+ characters>)`;
    * a worker with a probes.json must not stay on the allowlist (delete the line)."""
    errs, notes = [], []
    allow = read_allowlist(root)
    waived = bool(WAIVER.search(body or ""))
    dirs = sorted({c.split("/")[0] for c in changed if "/" in c})
    for d, e in validate_repo(root, [x for x in dirs if os.path.isdir(os.path.join(root, x))]):
        errs.append("%s/probes.json: %s" % (d, e))
    if any(c.startswith("scripts/probes-allowlist.txt") for c in changed):
        for d in sorted(allow):
            if os.path.isfile(os.path.join(root, d, "probes.json")):
                errs.append("scripts/probes-allowlist.txt lists %s, which has a probes.json: delete the line (shrink-only)" % d)
            elif not os.path.isdir(os.path.join(root, d)) or retired(root, d):
                errs.append("scripts/probes-allowlist.txt lists %s, which is not a live worker directory: delete the line" % d)
    for c in changed:
        m = re.match(r"^([^/]+)/worker\.js$", c)
        if not m:
            continue
        d = m.group(1)
        if not os.path.isfile(os.path.join(root, d, "wrangler.toml")) or retired(root, d) or os.path.isfile(os.path.join(root, d, "probes.json")):
            continue
        if d in allow:
            notes.append("%s changes without a probes.json (on the allowlist): declare what must keep working, then delete its line from scripts/probes-allowlist.txt" % d)
        elif waived:
            notes.append("%s: probes waived in the PR body" % d)
        else:
            errs.append("%s/worker.js changes but %s/probes.json does not exist and %s is not on scripts/probes-allowlist.txt: declare the routes or SQL this "
                        "deploy must keep working (see scripts/deploy_probes.py), or put `probes: none (<reason>)` in the PR description" % (d, d, d))
    return errs, notes


# ------------------------------------------------------------------------------------------------------------------ live context
def live_ctx(bindings, acct, token):
    """The real fetch and D1 functions for a worker whose d1 bindings are `bindings`."""
    def d1(binding, sql, write=False):
        if binding not in bindings:
            return False, "binding " + str(binding) + " not in wrangler.toml"
        if not (acct and token):
            return False, "HTTP 0: no Cloudflare credential on this runner"
        return d1_run(acct, token, bindings[binding][1], sql, write)
    return {"fetch": fetch_text, "d1": d1}


# ------------------------------------------------------------------------------------------------------------------------- CLI
def selftest():
    checks = []

    def ok(cond, name, detail=None):
        checks.append((bool(cond), name))
        emit(("PASS " if cond else "FAIL ") + name + ("" if cond or detail is None else " -- " + str(detail)[:300]))

    good = {"mode": "revert", "http": [{"url": "https://qnfo-ops.q08.workers.dev/registry", "contains": ['"ok":true']}],
            "d1": [{"binding": "DB", "explain": ["SELECT a FROM v_x LIMIT 1"], "noop_write": ["INSERT INTO fleet_tick (source) SELECT 'x' WHERE 0", "UPDATE t SET a = a WHERE 1 = 0"]}]}
    wr = '[[d1_databases]]\nbinding = "DB"\ndatabase_name = "qnfo-audit"\ndatabase_id = "35e2e573-92f3-46ac-83c6-22f6429fc5e5"\n\n[[d1_databases]]\nbinding = "ID"\ndatabase_name = "qnfo-identity"\ndatabase_id = "x"\n'
    b = d1_bindings(wr)
    ok(b == {"DB": ("qnfo-audit", "35e2e573-92f3-46ac-83c6-22f6429fc5e5"), "ID": ("qnfo-identity", "x")}, "d1_bindings reads binding, name and id of each block", b)
    ok(validate(good, b) == [], "a complete declaration is valid", validate(good, b))
    ok(any("not a fleet host" in e for e in validate({"http": [{"url": "https://evil.example.com/x", "contains": "a"}]})), "a host outside the fleet is refused")
    ok(any("secret-looking" in e for e in validate({"http": [{"url": "https://qnfo.org/x?token=abc", "contains": "a"}]})), "a secret query parameter is refused")
    ok(any("needs a contains marker" in e for e in validate({"http": [{"url": "https://qnfo.org/x"}]})), "a bare 200 without a marker is refused")
    ok(validate({"http": [{"url": "https://qnfo.org/gone", "status": 404}]}) == [], "a status other than 200 may stand alone")
    ok(any("private database" in e for e in validate({"d1": [{"binding": "ID", "explain": ["SELECT 1"]}]}, b)), "a private database is refused")
    ok(any("not a [[d1_databases]] binding" in e for e in validate({"d1": [{"binding": "NOPE", "explain": ["SELECT 1"]}]}, b)), "an unknown binding is refused")
    ok(any("one statement" in e for e in validate({"d1": [{"binding": "DB", "explain": ["SELECT 1; DROP TABLE t"]}]}, b)), "two statements in one entry are refused")
    ok(any("explain takes a SELECT" in e for e in validate({"d1": [{"binding": "DB", "explain": ["DROP TABLE t"]}]}, b)) and any("explain takes a SELECT" in e for e in validate({"d1": [{"binding": "DB", "explain": ["INSERT INTO t (a) VALUES (1)"]}]}, b)), "explain accepts only SELECT and WITH; a write cannot hide in it")
    ok(all(any("noop_write takes" in e for e in validate({"d1": [{"binding": "DB", "noop_write": [q]}]}, b)) for q in ("INSERT INTO t (a) VALUES (1)", "DELETE FROM t", "UPDATE t SET a = 1 WHERE b = 2", "DROP TABLE t", "INSERT INTO t SELECT 1 WHERE 0 OR 1", "SELECT 1 WHERE 0")), "noop_write accepts only an INSERT, UPDATE or DELETE that ends in WHERE 0: anything that could touch a row is refused")
    ok(validate({"d1": [{"binding": "DB", "noop_write": ["DELETE FROM t WHERE 0", "INSERT OR IGNORE INTO t (a) SELECT 1 WHERE 0;", "update t set a = a where false"]}]}, b) == [], "noop_write accepts WHERE 0, WHERE 1 = 0 and WHERE false in any case")
    ok(any("needs an explain list" in e for e in validate({"d1": [{"binding": "DB"}]}, b)), "a d1 probe with neither list is refused")
    ok(any("unknown key" in e for e in validate({"http": [{"url": "https://qnfo.org/x", "contains": "a", "method": "POST"}]})), "an unknown key (a POST attempt) is refused")
    ok(any("no probe" in e for e in validate({"mode": "revert"})), "an empty declaration is refused")
    ok(load_declaration("{bad", wr)[1] and load_declaration(json.dumps(good), wr)[0] == good, "load_declaration returns the object or the errors")

    ok(judge_http(200, '{"ok": true}', {"status": 200, "contains": ['"ok":true']}) is None, "judge_http: markers match whitespace-insensitively")
    ok(judge_http(200, "x", {"status": 200, "contains": ["MARK"]}) == "marker MARK absent" and judge_http(503, "", {"status": 200}) == "HTTP 503 (wanted 200)", "judge_http: a missing marker and a wrong status say why")
    ok(judge_http(200, "Internal Error 1101", {"status": 200, "contains": [], "absent": ["internal error"]}).startswith("forbidden text"), "judge_http: absent text is case-insensitive")
    ok(judge_http(404, "", {"status": 404}) is None, "judge_http: a wanted 404 passes")
    ok(judge_d1(True, "") == "ok" and judge_d1(False, "D1 HTTP 400: no such column: zz: SQLITE_ERROR") == "fail" and judge_d1(False, "D1 HTTP 400: no such table: issue_assignments: SQLITE_ERROR") == "fail"
       and judge_d1(False, "D1 HTTP 400: triggers nested too deep") == "fail", "judge_d1: a compile-class error is a failure")
    ok(judge_d1(False, "D1 HTTP 429: D1 DB is overloaded. Too many resources consumed within a 10 second window") == "inconclusive"
       and judge_d1(False, "D1 HTTP 500: Network connection lost") == "inconclusive" and judge_d1(False, "weird unknown thing") == "inconclusive", "judge_d1: an overload, a lost connection or an unknown error is inconclusive, never a revert")

    seq = {"https://qnfo.org/a": [(503, ""), (200, "MARK")], "https://qnfo.org/b": [(200, "nope")], "https://qnfo.org/c": [(0, "dns")]}
    cnt = {}

    def fake_fetch(url):
        i = cnt.get(url, 0)
        cnt[url] = i + 1
        a = seq[url]
        return a[min(i, len(a) - 1)]
    d1_calls = []

    def fake_d1(binding, sql, write=False):
        d1_calls.append((binding, sql, write))
        if "v_broken" in sql:
            return False, "D1 HTTP 400: no such column: zz: SQLITE_ERROR"
        if "slow" in sql:
            return False, "D1 HTTP 429: D1 DB is overloaded"
        return True, ""
    ctx = {"fetch": fake_fetch, "d1": fake_d1}
    slept = []
    dec_a = {"http": [{"url": "https://qnfo.org/a", "contains": "MARK"}]}
    ra = evaluate(dec_a, ctx, tries=3, wait_sec=15, sleep=slept.append)
    ok(ra["state"] == "ok" and ra["probes"][0]["tries"] == 2 and slept == [15], "evaluate: a route that recovers inside the tries passes, waiting only between attempts", ra)
    rb = evaluate({"http": [{"url": "https://qnfo.org/b", "contains": "MARK"}]}, ctx, tries=3, wait_sec=15, sleep=lambda s: None)
    ok(rb["state"] == "failed" and rb["probes"][0]["tries"] == 3 and "marker MARK absent" in rb["probes"][0]["reason"], "evaluate: a route that never shows its marker fails with its reason", rb)
    rc = evaluate({"http": [{"url": "https://qnfo.org/c", "contains": "MARK"}]}, ctx, tries=2, wait_sec=1, sleep=lambda s: None)
    ok(rc["state"] == "inconclusive" and rc["probes"][0]["state"] == "inconclusive", "evaluate: a request that failed at the runner (status 0) is inconclusive, not a failure", rc)
    rd = evaluate({"d1": [{"binding": "DB", "explain": ["SELECT 1 FROM v_ok", "SELECT 1 FROM v_broken", "SELECT 1 FROM slow"], "noop_write": ["INSERT INTO t (a) SELECT 1 WHERE 0"]}]}, ctx, sleep=lambda s: None)
    ok(rd["state"] == "failed" and [p["state"] for p in rd["probes"]] == ["ok", "fail", "inconclusive", "ok"], "evaluate: d1 probes are judged one by one (ok, fail, inconclusive, ok)", rd)
    ok(("DB", "INSERT INTO t (a) SELECT 1 WHERE 0", True) in d1_calls and ("DB", "SELECT 1 FROM v_ok", False) in d1_calls and rd["probes"][3]["label"].startswith("NOOP-WRITE DB:") and rd["probes"][0]["label"].startswith("EXPLAIN DB:"), "evaluate: a noop_write probe is run as a write, an explain probe as a read, and they are labelled so", d1_calls)
    ok(judge_d1(False, "D1 statement was not a no-op: changed 3 row(s)") == "fail", "judge_d1: a statement that changed a row is a failed probe, not an inconclusive one")
    ok(evaluate({}, ctx)["state"] == "none", "evaluate: no probe is none")
    # classification: pre-existing vs regression
    kb = rb["probes"][0]["key"]
    reg, pre = classify(rb, {kb: "fail"}, {kb})
    ok(not reg and len(pre) == 1, "classify: declared before and failing before the deploy is pre-existing")
    reg, pre = classify(rb, {kb: "ok"}, {kb})
    ok(len(reg) == 1 and not pre, "classify: passed before, fails after is a regression")
    reg, pre = classify(rb, {kb: "fail"}, set())
    ok(len(reg) == 1 and not pre, "classify: a probe the change itself declares is the change's own, even if it failed before")
    reg, pre = classify(rb, None, None)
    ok(len(reg) == 1 and not pre, "classify: without a baseline every failure is a regression")
    ok(probe_key("http", {"a": 1}) == probe_key("http", {"a": 1}) and probe_key("http", {"a": 1}) != probe_key("d1", {"a": 1}), "probe keys are stable and kind-scoped")
    line = runtime_probe_line(rb["probes"][0])
    ok(line == 'runtime-probe: {"url": "https://qnfo.org/b", "status": 200, "contains": "MARK"}' and runtime_probe_line(rd["probes"][1]) is None, "runtime_probe_line: an http probe becomes a runner-https contract line, a d1 probe none", line)
    base = baseline_state({"http": [{"url": "https://qnfo.org/b", "contains": "MARK"}], "d1": [{"binding": "DB", "explain": ["SELECT 1 FROM v_broken"]}]}, ctx)
    ok(sorted(base.values()) == ["fail", "fail"], "baseline_state: one attempt per probe, keyed", base)

    # PR rule on a throwaway tree
    import tempfile
    with tempfile.TemporaryDirectory() as t:
        def put(rel, text):
            p = os.path.join(t, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(text)
        for d in ("w-new", "w-old", "w-done", "w-gone"):
            put(d + "/worker.js", "var VERSION = \"1\";")
            put(d + "/wrangler.toml", 'name = "' + d + '"\n')
        put("w-gone/RETIRED", "retired")
        put("w-done/probes.json", json.dumps({"http": [{"url": "https://qnfo.org/x", "contains": "a"}]}))
        put("scripts/probes-allowlist.txt", "w-old  # no routes\n")
        e, n = check_pr(["w-new/worker.js"], "", t)
        ok(len(e) == 1 and "w-new/probes.json does not exist" in e[0], "check_pr: a changed worker with no declaration and not allowlisted fails", e)
        e, n = check_pr(["w-new/worker.js"], "x\nprobes: none (static page, nothing to keep alive)\n", t)
        ok(not e and "waived" in n[0], "check_pr: a reasoned `probes: none (...)` waives it", (e, n))
        e, n = check_pr(["w-new/worker.js"], "probes: none (short)", t)
        ok(len(e) == 1, "check_pr: a waiver without a real reason does not count")
        e, n = check_pr(["w-old/worker.js"], "", t)
        ok(not e and "allowlist" in n[0], "check_pr: an allowlisted worker passes with a notice", (e, n))
        e, n = check_pr(["w-done/worker.js", "w-gone/worker.js"], "", t)
        ok(not e and not n, "check_pr: a declared worker and a retired one are quiet", (e, n))
        put("w-done/probes.json", json.dumps({"http": [{"url": "https://evil.example.com/x", "contains": "a"}]}))
        e, n = check_pr(["w-done/probes.json"], "", t)
        ok(len(e) == 1 and "not a fleet host" in e[0], "check_pr: an invalid declaration fails even without a worker.js change", e)
        put("scripts/probes-allowlist.txt", "w-done\nw-gone\nw-missing\n")
        e, n = check_pr(["scripts/probes-allowlist.txt"], "", t)
        ok(len([x for x in e if "delete the line" in x]) == 3, "check_pr: the allowlist is shrink-only (a declared, a retired and a missing worker are refused)", e)
    # the repository's own declarations
    bad = validate_repo()
    ok(not bad, "every probes.json in the repository validates against its wrangler.toml", bad[:3])
    fails = [n for c, n in checks if not c]
    emit("deploy-probes selftest: " + ("ok, " + str(len(checks)) + " checks" if not fails else str(len(fails)) + " FAILED"))
    return 0 if not fails else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--validate", nargs="*", metavar="DIR", help="validate probes.json files (default all workers)")
    ap.add_argument("--check-pr", action="store_true")
    ap.add_argument("--changed", help="file with the pull request's changed paths, one per line")
    ap.add_argument("--body", help="file with the pull request description")
    ap.add_argument("--root", default=ROOT)
    ap.add_argument("--live", metavar="WORKER", help="run one worker's declared probes against production now")
    ap.add_argument("--d1", action="store_true", help="--live: include the d1 probes (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID)")
    ap.add_argument("--tries", type=int, default=2)
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--targets")
    ap.add_argument("--out")
    ap.add_argument("--pushed", default="HEAD", help="--baseline: the commit whose declarations are read (default HEAD)")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    if a.validate is not None:
        bad = validate_repo(a.root, a.validate or None)
        for d, e in bad:
            emit("::error file=%s/probes.json::%s" % (d, e))
        emit("deploy-probes validate: " + ("ok" if not bad else str(len(bad)) + " problem(s)"))
        return 1 if bad else 0
    if a.check_pr:
        changed = [ln.strip() for ln in (read_file(a.changed) or "").splitlines() if ln.strip()] if a.changed else []
        errs, notes = check_pr(changed, read_file(a.body) or "" if a.body else "", a.root)
        for n in notes:
            emit("::notice::DEPLOY-PROBES-1 " + n)
        for e in errs:
            emit("::error::DEPLOY-PROBES-1 " + e)
        emit("deploy-probes check-pr: " + ("ok" if not errs else str(len(errs)) + " problem(s)"))
        return 1 if errs else 0
    if a.live:
        d = a.live.strip("/")
        decl, errs = load_declaration(read_file(os.path.join(a.root, d, "probes.json")) or "", read_file(os.path.join(a.root, d, "wrangler.toml")) or "")
        if errs:
            emit("invalid: " + "; ".join(errs))
            return 2
        binds = d1_bindings(read_file(os.path.join(a.root, d, "wrangler.toml")) or "")
        sub = dict(decl)
        if not a.d1:
            sub["d1"] = []
        res = evaluate(sub, live_ctx(binds, os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")), tries=a.tries)
        for p in res["probes"]:
            emit("%-12s %s (%s)" % (p["state"], p["label"], p["reason"][:160] or "ok"))
        emit(d + ": " + res["state"])
        return 0 if res["state"] in ("ok", "none") else 1
    if a.baseline:
        if not a.targets or not a.out:
            ap.error("--baseline needs --targets and --out")
        import subprocess
        out = {}
        for ln in (read_file(a.targets) or "").splitlines():
            parts = ln.split()
            if len(parts) < 2 or parts[0].startswith("#"):
                continue
            w, path = parts[0], parts[1]
            d = path.split("/")[0]
            try:
                text = subprocess.run(["git", "show", a.pushed + ":" + d + "/probes.json"], capture_output=True, text=True, check=True).stdout
                wr = subprocess.run(["git", "show", a.pushed + ":" + d + "/wrangler.toml"], capture_output=True, text=True, check=True).stdout
            except (subprocess.CalledProcessError, OSError):
                continue
            decl, errs = load_declaration(text, wr)
            if not decl:
                emit("baseline: " + w + " declaration invalid, skipped: " + "; ".join(errs)[:200])
                continue
            out[w] = baseline_state(decl, live_ctx(d1_bindings(wr), os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")))
            emit("baseline: %s %s" % (w, json.dumps(out[w])))
        with open(a.out, "w", encoding="utf-8") as fh:
            json.dump(out, fh)
        return 0
    ap.error("choose --selftest, --validate, --check-pr, --live or --baseline")


if __name__ == "__main__":
    sys.exit(main())
