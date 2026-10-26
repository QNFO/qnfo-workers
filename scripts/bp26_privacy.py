#!/usr/bin/env python3
"""BP26-PRIVACY-1 collectors (2026-10-26, charter pillar security; agent_issues 1000342 GDPR records, 1000343 DPIAs, 1000344 retention, 1000346 AI Act Art. 4).

The runner half of five privacy metrics of the BP26 catalogue, run by scripts/bp26_producers.py from the remediation-consumer job. Every value is measured; a collector that
cannot measure returns None and writes nothing (unknown is never a value). No address, message or subscriber row is stored or printed: only counts and per-surface verdicts.

  collect_review_docs          ropa_last_reviewed_days, dpia_current
        GitHub commits API on docs/ROPA.md and docs/dpia/{email-agent,personal-twin,ipatent}.md (path filter, newest commit on main). The consume job checkout is shallow, so git log
        cannot answer; a 403, 429 or network error is None, never a guess. These two measure that the record is kept and was changed recently, NOT that it is adequate: the documents
        are drafts for the owner to review (their own status line says so).
  collect_consent_proof        subscribers_with_consent_proof
        Aggregates only: confirmed subscribers with a stored consent timestamp / all confirmed, over qnfo-audit.subscribers (status subscribed, confirmed_at) and q08-signal.subscribers
        (status confirmed, confirmed_at). The companion list (personal-life.companion_subscribers) is the personal plane: this collector does not read it, and says so in its note.
  collect_pii_in_logs          pii_in_logs
        A bounded sample of Workers Logs through the Workers Observability telemetry API with the runner's token: the newest 250 events in each of eight three-hour windows of the last 24 h
        (at most 2000 events), every event serialised and scanned for raw e-mail addresses; the value is the number of matches, the rows are per worker with counts only. File-name look-alikes
        (chunk@1.2.js) are not addresses. If the API refuses the token the exact refusal goes into the note and the value is None.
  collect_retention_other_dbs  (records_past_retention is written by the D1 trigger bp26_retention_heavy_tick; this feeds it)
        Runs the registered read-only past_sql of every retention_policy row measured_by = 'runner' against its own database (ipatent-db, q08-signal, living-paper) and writes the count
        into that row; the trigger's next gated refresh adds it to the metric. It returns no metric value of its own (two writers would overwrite each other) but keeps one evidence row
        per policy. A database it cannot read leaves the row's last count and is recorded as unknown.

Usage:
  python3 scripts/bp26_privacy.py --selftest     offline suite (no network, no secrets)
  CF_ACCOUNT_ID=<id> python3 scripts/bp26_producers.py --dry --only collect_pii_in_logs     live read-only run through the framework
"""
import json
import os
import re
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

REPO = "QNFO/qnfo-workers"
ROPA = "docs/ROPA.md"
DPIAS = ("docs/dpia/email-agent.md", "docs/dpia/personal-twin.md", "docs/dpia/ipatent.md")
DPIA_MAX_AGE_DAYS = 365
LOG_WINDOWS = 8
LOG_WINDOW_H = 3
LOG_PER_WINDOW = 250
CF_ACCOUNT_ENV = ("CF_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
# A raw address: local part, @, a dotted host with an alphabetic TLD, not glued to more address characters.
EMAIL_RX = re.compile(r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}(?![A-Za-z0-9-])")
FILE_EXT = frozenset("js mjs cjs json css png jpg jpeg gif svg md txt html htm sql map wasm ts woff woff2 ico xml toml yml yaml".split())
_POST = None  # the offline suite replaces this; live it is remediation_consumer._req


def _epoch(iso):
    import calendar
    return calendar.timegm(time.strptime(str(iso)[:19], "%Y-%m-%dT%H:%M:%S"))


def gh_last_commit(ctx, path):
    """(iso date of the newest commit on main touching path | None when the path has no commit, error token | None). A definite empty answer is (None, None)."""
    url = "https://api.github.com/repos/%s/commits?%s" % (REPO, urllib.parse.urlencode({"path": path, "per_page": 1, "sha": "main"}))
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    tok = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    if tok:
        h["Authorization"] = "Bearer " + tok
    r = ctx.http(url, headers=h, external=True, timeout=20, max_bytes=65536)
    if r.error or r.status != 200:
        return None, (r.error or "http %s" % r.status)
    try:
        data = json.loads(r.text)
    except ValueError:
        return None, "unreadable answer"
    if not isinstance(data, list):
        return None, "unexpected answer"
    if not data:
        return None, None
    d = (((data[0] or {}).get("commit") or {}).get("committer") or {}).get("date") or (((data[0] or {}).get("commit") or {}).get("author") or {}).get("date")
    return (d, None) if d else (None, "commit without a date")


def collect_review_docs(ctx):
    out = []
    # ROPA: days since the last change on main.
    d, err = gh_last_commit(ctx, ROPA)
    if err:
        out.append(Result("ropa_last_reviewed_days", None, "GitHub commits API for %s: %s; kept unknown" % (ROPA, err), [(ROPA, None, err)]))
    elif d is None:
        out.append(Result("ropa_last_reviewed_days", None, "%s has no commit on main: no record to age" % ROPA, [(ROPA, 0, "not on main")]))
    else:
        days = max(0, int((ctx.now - _epoch(d)) // 86400))
        out.append(Result("ropa_last_reviewed_days", days, "%s last changed %s (%d days ago), newest commit on main by the GitHub commits API; measures that the record is kept, not that it is adequate" % (ROPA, d, days), [(ROPA, 1 if days <= 180 else 0, "last change %s, %d days" % (d, days))]))
    # DPIAs: files changed in the last 365 days / 3.
    rows, unknown, current = [], [], 0
    for p in DPIAS:
        d, err = gh_last_commit(ctx, p)
        if err:
            unknown.append(p)
            rows.append((p, None, err))
        elif d is None:
            rows.append((p, 0, "not on main"))
        else:
            age = int((ctx.now - _epoch(d)) // 86400)
            good = age <= DPIA_MAX_AGE_DAYS
            current += 1 if good else 0
            rows.append((p, 1 if good else 0, "last change %s, %d days" % (d, age)))
    if unknown:
        why = "; ".join("%s (%s)" % (r[0], r[2]) for r in rows if r[1] is None)
        out.append(Result("dpia_current", None, "GitHub commits API failed for %s; a ratio with an unknown numerator is not written" % why, rows))
    else:
        out.append(Result("dpia_current", round(current / float(len(DPIAS)), 4), "%d of %d DPIA files changed in the last %d days (email agent, personal twin, ipatent); measures existence and recency of the review file, not its adequacy" % (current, len(DPIAS), DPIA_MAX_AGE_DAYS), rows))
    return out


def collect_consent_proof(ctx):
    rows, total, proven, notes = [], 0, 0, []
    q = "SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN confirmed_at IS NOT NULL AND trim(confirmed_at) <> '' THEN 1 ELSE 0 END), 0) AS p FROM subscribers WHERE status = '%s'"
    lists = (("qnfo-audit.subscribers", lambda: ctx.d1(q % "subscribed")), ("q08-signal.subscribers", lambda: ctx.d1_db("q08-signal", q % "confirmed")))
    for name, read in lists:
        try:
            r = (read() or [{}])[0]
            n, p = int(r.get("n") or 0), int(r.get("p") or 0)
        except Exception as e:  # noqa: BLE001
            return [Result("subscribers_with_consent_proof", None, "%s unreadable (%s): a ratio over part of the lists is not written" % (name, str(e)[:100]), rows)]
        total += n
        proven += p
        rows.append((name, 1 if p == n else 0, "confirmed=%d with_consent_timestamp=%d" % (n, p)))
    rows.append(("personal-life.companion_subscribers", None, "personal plane: not read by this runner; a counts-only plane probe needs the owner's approval"))
    if total == 0:
        return [Result("subscribers_with_consent_proof", None, "no confirmed subscriber on the readable lists: 0 of 0 is not a ratio", rows)]
    return [Result("subscribers_with_consent_proof", round(proven / float(total), 4), "%d of %d confirmed subscribers carry a consent timestamp (confirmed_at), over qnfo-audit and q08-signal; the companion list lives in the personal plane and is not read" % (proven, total), rows)]


def _post(ctx, path, body):
    fn = getattr(ctx, "cf_post", None) or _POST
    if fn is None:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import remediation_consumer as RC  # noqa: E402
        return RC._req("POST", RC.CF_API + path, body)
    return fn(path, body)


def address_matches(text):
    """Lower-cased raw e-mail addresses in text, file-name look-alikes excluded."""
    out = []
    for m in EMAIL_RX.finditer(text or ""):
        a = m.group(0)
        if a.rsplit(".", 1)[-1].lower() in FILE_EXT:
            continue
        out.append(a.lower())
    return out


def collect_pii_in_logs(ctx):
    acc = next((os.environ[k] for k in CF_ACCOUNT_ENV if os.environ.get(k)), "")
    if not acc and _POST is None:
        return [Result("pii_in_logs", None, "no Cloudflare account id in this environment", [])]
    now_ms = int(ctx.now * 1000)
    events, with_match, matches, per_worker, distinct, read_windows, refusal = 0, 0, 0, {}, set(), 0, ""
    for i in range(LOG_WINDOWS):
        if ctx.left() < 20:
            refusal = refusal or "time budget"
            break
        hi = now_ms - i * LOG_WINDOW_H * 3600 * 1000
        body = {"queryId": "bp26-pii-in-logs", "timeframe": {"from": hi - LOG_WINDOW_H * 3600 * 1000, "to": hi}, "view": "events", "limit": LOG_PER_WINDOW, "dry": True,
                "parameters": {"datasets": ["cloudflare-workers"], "filters": [], "calculations": [], "groupBys": [], "orderBy": {"value": "timestamp", "order": "desc"}}}
        try:
            r = _post(ctx, "/accounts/%s/workers/observability/telemetry/query" % acc, body)
        except Exception as e:  # noqa: BLE001
            refusal = str(e)[:300]
            continue
        evs = ((((r or {}).get("result") or {}).get("events") or {}).get("events")) if isinstance(r, dict) and r.get("success") else None
        if evs is None:
            refusal = json.dumps((r or {}).get("errors"))[:300] if isinstance(r, dict) else "unreadable answer"
            continue
        read_windows += 1
        for e in evs:
            events += 1
            found = address_matches(json.dumps(e, ensure_ascii=False))
            if found:
                with_match += 1
                matches += len(found)
                w = ((e.get("$workers") or {}).get("scriptName")) or "unknown"
                per_worker[w] = per_worker.get(w, 0) + len(found)
                distinct.update(found)
    if read_windows == 0 or events == 0:
        return [Result("pii_in_logs", None, "Workers Observability telemetry API gave no events (%s); kept unknown" % (refusal or "empty"), [])]
    rows = [(w, 0, "%d raw address matches in the sample" % n) for w, n in sorted(per_worker.items(), key=lambda kv: -kv[1])[:20]]
    rows.append(("_sample", 1, "%d events over %d of %d three-hour windows, %d events with a match, %d distinct addresses" % (events, read_windows, LOG_WINDOWS, with_match, len(distinct))))
    return [Result("pii_in_logs", matches, "%d raw e-mail address matches (%d distinct) in %d events sampled from the last 24 h (newest %d per three-hour window, %d of %d windows read) across %d workers; counts only, no address stored" % (matches, len(distinct), events, LOG_PER_WINDOW, read_windows, LOG_WINDOWS, len(per_worker)), rows)]


COUNT_SQL = re.compile(r"^SELECT COUNT\(\*\) FROM [a-z_]+ WHERE [^;]+$", re.I)


def collect_retention_other_dbs(ctx):
    rows, written = [], 0
    pols = ctx.d1("SELECT policy_key, db, past_sql FROM retention_policy WHERE measured_by = 'runner' ORDER BY policy_key")
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ctx.now))
    for p in pols:
        key, db, sql = p["policy_key"], p["db"], p["past_sql"]
        if not COUNT_SQL.match(sql or "") or re.search(r"\b(insert|update|delete|drop|alter|attach|pragma)\b", sql, re.I):
            rows.append((key, None, "registered SQL is not a plain COUNT: not run"))
            continue
        try:
            n = int((ctx.d1_db(db, sql) or [{}])[0].get("COUNT(*)"))
        except Exception as e:  # noqa: BLE001
            rows.append((key, None, "%s unreadable: %s" % (db, str(e)[:100])))
            continue
        rows.append((key, 1 if n == 0 else 0, "%s: %d rows past the period" % (db, n)))
        if not ctx.dry:
            ctx.d1("UPDATE retention_policy SET past_retention = ?1, checked_at = ?2 WHERE policy_key = ?3 AND measured_by = 'runner'", [n, stamp, key])
            written += 1
    return [Result("records_past_retention", None, "other-database policies counted into retention_policy: %d of %d (the trigger adds them to the metric)" % (written, len(pols)), rows)]


COLLECTORS = [
    Collector("collect_review_docs", collect_review_docs, ["ropa_last_reviewed_days", "dpia_current"], 55),
    Collector("collect_consent_proof", collect_consent_proof, ["subscribers_with_consent_proof"], 55),
    Collector("collect_pii_in_logs", collect_pii_in_logs, ["pii_in_logs"], 360),
    Collector("collect_retention_other_dbs", collect_retention_other_dbs, [], 55),
]


# ---------------------------------------------------------------- selftest
def selftest():
    import sqlite3
    import bp26_producers as P
    fails = []

    def ok(c, m):
        if not c:
            fails.append(m)
            print("FAIL " + m)
    global _POST
    now = time.time()
    iso = lambda days: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - days * 86400))  # noqa: E731

    # ---- address scan
    ok(address_matches("mail a.b+c@example.org and X@Y.CO.UK now") == ["a.b+c@example.org", "x@y.co.uk"], "addresses are found and lower-cased")
    ok(address_matches("chunk@1.2.js sprite@2x.png @cf/openai/gpt-oss-120b user@localhost name@host.json") == [], "file-name look-alikes, model ids and a host without a TLD are not addresses")
    ok(address_matches("noreply@qnfo.org,foo@bar.com;") == ["noreply@qnfo.org", "foo@bar.com"], "separators end an address")

    # ---- review docs
    pages = {}

    def http(url, **kw):
        p = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["path"][0]
        v = pages.get(p, "none")
        if v == "403":
            return P.Resp(403, {}, [], "", url, 1, [], None)
        if v == "err":
            return P.Resp(0, {}, [], "", url, 1, [], "timeout")
        body = json.dumps([] if v == "none" else [{"commit": {"committer": {"date": v}}}])
        return P.Resp(200, {}, [], body, url, 1, [], None)
    mk = lambda **k: P.Ctx(now=now, http=http, **k)  # noqa: E731
    pages.update({ROPA: iso(3), DPIAS[0]: iso(1), DPIAS[1]: iso(400), DPIAS[2]: "none"})
    r = {x.metric: x for x in collect_review_docs(mk())}
    ok(r["ropa_last_reviewed_days"].value == 3, "ROPA last changed 3 days ago reads 3: %r" % (r["ropa_last_reviewed_days"],))
    ok(r["dpia_current"].value == round(1 / 3.0, 4) and [x[1] for x in r["dpia_current"].rows] == [1, 0, 0], "one of three DPIA files is current (one 400 days old, one not on main): %r" % (r["dpia_current"],))
    pages.update({ROPA: "403", DPIAS[0]: iso(1), DPIAS[1]: iso(2), DPIAS[2]: iso(3)})
    r = {x.metric: x for x in collect_review_docs(mk())}
    ok(r["ropa_last_reviewed_days"].value is None and "http 403" in r["ropa_last_reviewed_days"].note, "a 403 from GitHub is unknown, not a guess")
    ok(r["dpia_current"].value == 1.0, "three current DPIA files read 1.0")
    pages.update({DPIAS[2]: "err"})
    r = {x.metric: x for x in collect_review_docs(mk())}
    ok(r["dpia_current"].value is None and "timeout" in r["dpia_current"].note, "a failed read of one DPIA file leaves the ratio unknown")
    pages.update({ROPA: "none"})
    r = {x.metric: x for x in collect_review_docs(mk())}
    ok(r["ropa_last_reviewed_days"].value is None and "no commit on main" in r["ropa_last_reviewed_days"].note, "a missing ROPA file has no age")

    # ---- consent proof
    c = sqlite3.connect(":memory:")
    c.executescript("CREATE TABLE subscribers (email TEXT, status TEXT, confirmed_at TEXT); INSERT INTO subscribers VALUES ('a', 'subscribed', '2026-10-01'), ('b', 'subscribed', ''), ('c', 'pending', NULL);"
                    "CREATE TABLE retention_policy (policy_key TEXT PRIMARY KEY, db TEXT, past_sql TEXT, measured_by TEXT, past_retention INTEGER, checked_at TEXT);")

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, x)) for x in cur.fetchall()]
    q08 = {"rows": [{"n": 2, "p": 2}]}
    r = collect_consent_proof(P.Ctx(now=now, d1=d1, d1_db=lambda name, sql, params=None: q08["rows"]))[0]
    ok(r.value == 0.75 and "3 of 4" in r.note and any("companion" in x[0] and x[1] is None for x in r.rows), "3 of 4 confirmed subscribers carry a timestamp; the companion list is named as not read: %r" % (r,))
    c.execute("DELETE FROM subscribers")
    q08["rows"] = [{"n": 0, "p": 0}]
    ok(collect_consent_proof(P.Ctx(now=now, d1=d1, d1_db=lambda *a: q08["rows"]))[0].value is None, "no confirmed subscriber at all is unknown, not 1.0")
    c.execute("INSERT INTO subscribers VALUES ('z', 'subscribed', '2026-10-02')")
    ok(collect_consent_proof(P.Ctx(now=now, d1=d1, d1_db=lambda *a: q08["rows"]))[0].value == 1.0, "one confirmed subscriber with a timestamp reads 1.0")

    def broken(*a, **k):
        raise RuntimeError("D1 down")
    ok(collect_consent_proof(P.Ctx(now=now, d1=d1, d1_db=broken))[0].value is None, "an unreadable list leaves the ratio unknown")

    # ---- pii in logs
    os.environ["CF_ACCOUNT_ID"] = "acc"
    calls = []

    def post(path, body):
        calls.append(path)
        i = len(calls)
        evs = [{"$workers": {"scriptName": "qnfo-gateway"}, "source": {"message": "ua bot contact: bot%d@example.org and sprite@2x.png" % i}},
               {"$workers": {"scriptName": "qnfo-ops"}, "source": {"message": "clean line"}},
               {"$workers": {"scriptName": "qnfo-email"}, "source": {"message": "to a@b.com, cc a@b.com"}}]
        return {"success": True, "result": {"events": {"events": evs}}}
    _POST = post
    r = collect_pii_in_logs(P.Ctx(now=now))[0]
    ok(r.value == 8 * 3 and len(calls) == 8, "8 windows, 3 matches each (one bot address, two for a@b.com): %r" % (r.value,))
    ok(all("@" not in str(x) for x in r.rows) and "@" not in r.note, "no address reaches the rows or the note")
    ok(any(x[0] == "qnfo-gateway" and x[1] == 0 for x in r.rows) and any(x[0] == "_sample" for x in r.rows), "per-worker counts and a sample row are kept")
    _POST = lambda path, body: {"success": False, "errors": [{"code": 10000, "message": "Authentication error"}]}
    r = collect_pii_in_logs(P.Ctx(now=now))[0]
    ok(r.value is None and "Authentication error" in r.note, "a refused token is recorded verbatim and the value is None: %r" % (r.note,))

    def raises(path, body):
        raise RuntimeError("HTTP 403 from the API: no permission")
    _POST = raises
    r = collect_pii_in_logs(P.Ctx(now=now))[0]
    ok(r.value is None and "no permission" in r.note, "an HTTP refusal is recorded and the value is None")
    _POST = None
    del os.environ["CF_ACCOUNT_ID"]
    os.environ.pop("CLOUDFLARE_ACCOUNT_ID", None)
    ok(collect_pii_in_logs(P.Ctx(now=now))[0].value is None, "without an account id there is nothing to read")

    # ---- other databases
    c.executescript("INSERT INTO retention_policy VALUES ('ipatent_sessions_90d', 'ipatent-db', 'SELECT COUNT(*) FROM sessions WHERE substr(first_seen,1,10) < date(''now'',''-90 days'')', 'runner', NULL, NULL);"
                    "INSERT INTO retention_policy VALUES ('evil', 'ipatent-db', 'SELECT COUNT(*) FROM sessions; DELETE FROM sessions', 'runner', NULL, NULL);"
                    "INSERT INTO retention_policy VALUES ('q08_subscribers_pending_30d', 'q08-signal', 'SELECT COUNT(*) FROM subscribers WHERE status = ''pending''', 'runner', NULL, NULL);"
                    "INSERT INTO retention_policy VALUES ('emails_bodies_30d', 'qnfo-audit', 'SELECT COUNT(*) FROM emails WHERE 1', 'd1-trigger', 7, 'x');")
    seen = []

    def d1_db(name, sql, params=None):
        seen.append(name)
        if name == "q08-signal":
            raise RuntimeError("database unreadable")
        return [{"COUNT(*)": 11}]
    r = collect_retention_other_dbs(P.Ctx(now=now, d1=d1, d1_db=d1_db))[0]
    ok(r.metric == "records_past_retention" and r.value is None, "it returns no metric value of its own (the trigger writes the metric)")
    got = {x["policy_key"]: (x["past_retention"], x["checked_at"]) for x in d1("SELECT * FROM retention_policy")}
    ok(got["ipatent_sessions_90d"][0] == 11 and got["ipatent_sessions_90d"][1], "a runner policy's count is written to its registry row: %r" % (got,))
    ok(got["q08_subscribers_pending_30d"][0] is None and got["evil"][0] is None, "an unreadable database and a non-COUNT statement leave the row as it was")
    ok(got["emails_bodies_30d"] == (7, "x") and seen == ["ipatent-db", "q08-signal"], "the trigger's own rows are not touched and the unsafe statement is never run: %r" % (seen,))
    ok([x[1] for x in r.rows].count(None) == 2, "the two rows it could not count are recorded as unknown")
    c.execute("UPDATE retention_policy SET past_retention = NULL, checked_at = NULL WHERE measured_by = 'runner'")
    collect_retention_other_dbs(P.Ctx(now=now, d1=d1, d1_db=d1_db, dry=True))
    ok(d1("SELECT past_retention p FROM retention_policy WHERE policy_key = 'ipatent_sessions_90d'")[0]["p"] is None, "a dry run writes nothing")

    # ---- the framework accepts the collectors
    ok(len(COLLECTORS) == 4 and all(callable(x.fn) and x.name and x.every_min for x in COLLECTORS), "four collectors are declared")
    ok({m for x in COLLECTORS for m in x.metrics} == {"ropa_last_reviewed_days", "dpia_current", "subscribers_with_consent_proof", "pii_in_logs"}, "they declare the four metrics they write")
    print("bp26_privacy selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    print(__doc__)
