#!/usr/bin/env python3
"""BP26-AUDIT-LOG-1 and BP26-LEASES-KILLSWITCH-1 collectors (2026-10-26, charter pillars security and autonomy; agent_issues 1000362, 1000361).

Metrics: audit_chain_verify, audit_coverage, kill_switch_test_age_days. Tables: migrations/2026-10-26-bp26-audit-log.sql.

collect_audit_chain  (hourly)  SQLite has no sha256, so the runner seals. Every agent_actions row not yet in agent_action_chain is appended in id order with
                     row_hash = sha256(prev_hash + "|" + canonical(row)), prev_hash of the first row = 64 zeros. canonical(row) is the JSON array of the columns
                     id, ts, actor, session, tool, action_kind, target, inputs_hash, outputs_hash, version_id, cost, outcome, source_table, source_id, via in that
                     order (separators "," and ":", ASCII only), so anyone can recompute it. The whole chain (or its last VERIFY_MAX rows) is then re-read and
                     recomputed, the link of every row is checked, every daily root (agent_action_roots) is compared with the chain row it names, and the latest
                     root is compared with its copy in R2 qnfo-backups/audit-chain/<day>.json. The first run of each UTC day writes that day's root to D1 and to
                     R2 (a copy outside D1). Value 1 when everything recomputes, 0 on the first mismatch (the evidence names the seq), None when the table is empty.
collect_audit_coverage (hourly) side effects judged against INDEPENDENT records, never against the triggers' own output: Cloudflare Workers deployments (API)
                     against agent_actions of kind deploy, settings, secret-write and rollback for the same worker within 20 minutes; a platform's public timeline
                     (Mastodon, no credential) against agent_actions of kind publish; Cloudflare's secret-triggered versions (workers/triggered_by = secret) against secret-write rows, which the qnfo-ops secret watch writes via
                     the cloud_ops_events trigger of migrations/2026-10-26-bp26-audit-log-secrets.sql. Window: 7 days, ending 30 minutes ago so a ledger row has time to land.
                     value = matched / all over the classes that have an independent record; a class that has none (mail, other platforms, papers, q08 pieces,
                     secret writes outside the ledger) is named in the evidence rows with its ledger parity and is NOT counted.
collect_kill_switch_age (hourly) days since the last live drill with outcome pass in kill_switch_tests. None while none exists: no global kill switch exists yet
                     (docs/KILL-SWITCH-DRILL.md), so no honest age exists.
Dry runs (python3 scripts/bp26_producers.py --dry --only audit_chain) read and verify but never seal, never write a root and never write R2.
Offline: python3 scripts/bp26_auditchain.py --selftest
"""
import bisect
import calendar
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

GENESIS = "0" * 64
COLS = ("id", "ts", "actor", "session", "tool", "action_kind", "target", "inputs_hash", "outputs_hash", "version_id", "cost", "outcome", "source_table", "source_id", "via")
SEAL_MAX = 1200          # rows sealed per run (12 per statement, 100 statements): the 8-day backfill is sealed within a few runs
VERIFY_MAX = 20000       # rows re-verified per run; the whole chain until it is longer than this
PAGE = 500
WINDOW_S = 7 * 86400
GRACE_S = 30 * 60
SECRET_GRACE_S = 90 * 60
MATCH_S = 20 * 60
MAX_SCRIPTS = 60
DEPLOY_KINDS = ("deploy", "settings", "secret-write", "rollback")
CLASS_RECORD = {"deploy": "Cloudflare Workers deployments API, independent of every D1 ledger", "publish:mastodon": "the platform's own public timeline, independent",
                "secret-write": "Cloudflare Workers versions annotated workers/triggered_by = secret, independent of every ledger (the qnfo-ops secret watch writes the row)",
                "publish:papers": "living-paper paper_change_ledger, the papers system of record in another database; the runner mirrors it, so this checks the mirror, not the publisher", "publish:q08": "q08-signal published_pieces, the q08 system of record in another database; the runner mirrors it, so this checks the mirror, not the publisher"}


def sha256_hex(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def canon(row):
    return json.dumps([row.get(c) for c in COLS], separators=(",", ":"), ensure_ascii=True)


def row_hash(prev, row):
    return sha256_hex(prev + "|" + canon(row))


def parse_ts(s):
    """ISO or SQLite time to epoch seconds (UTC); None when it is neither."""
    m = re.match(r"^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)", str(s or ""))
    if not m:
        return None
    try:
        return calendar.timegm(time.strptime(m.group(1) + "T" + m.group(2), "%Y-%m-%dT%H:%M:%S"))
    except (ValueError, OverflowError):
        return None


def iso(t):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


# ---------------------------------------------------------------- R2 (a copy of each daily root outside D1)
# The module never calls the object store itself: it uses the existing, reviewed helpers of scripts/continuity_snapshot.py (bucket qnfo-backups, the runner token), imported
# lazily so the offline suite never reaches the network. A refused write is recorded on the root row (r2_ok = 0) and in the evidence rows, never hidden.
def _r2_put(key, data):
    import continuity_snapshot as CS  # noqa: E402
    return (200, b"") if CS.r2_put_obj(key, data, "application/json") else (0, b"")


def _r2_get(key):
    import continuity_snapshot as CS  # noqa: E402
    obj = CS.r2_get_json(key)
    return (200, json.dumps(obj).encode("utf-8")) if obj is not None else (404, b"")


R2 = {"write": _r2_put, "read": _r2_get}


# ---------------------------------------------------------------- chain
def seal(d1, stamp, limit=SEAL_MAX):
    """Append the unsealed agent_actions rows to the chain. Returns (rows sealed, head seq, head hash)."""
    head = d1("SELECT seq, action_id, row_hash FROM agent_action_chain ORDER BY seq DESC LIMIT 1")
    prev = head[0]["row_hash"] if head else GENESIS
    last_id = int(head[0]["action_id"]) if head else 0
    rows = d1("SELECT * FROM agent_actions WHERE id > ?1 ORDER BY id LIMIT ?2", [last_id, int(limit)])
    for i in range(0, len(rows), 12):
        chunk, params = rows[i:i + 12], []
        for r in chunk:
            h = row_hash(prev, r)
            params += [int(r["id"]), prev, h, stamp]
            prev = h
        d1("INSERT INTO agent_action_chain (action_id, prev_hash, row_hash, sealed_at) VALUES " + ", ".join(["(?,?,?,?)"] * len(chunk)), params)
    h2 = d1("SELECT seq, row_hash FROM agent_action_chain ORDER BY seq DESC LIMIT 1")
    return len(rows), (int(h2[0]["seq"]) if h2 else 0), (h2[0]["row_hash"] if h2 else GENESIS)


def verify(d1, max_rows=VERIFY_MAX):
    """(ok, rows checked, detail). ok is None when the chain is empty, False on the first mismatch (the detail names the seq)."""
    t = d1("SELECT COUNT(*) AS n, MAX(seq) AS mx FROM agent_action_chain")[0]
    if not int(t["n"]):
        return None, 0, "the chain is empty"
    mx = int(t["mx"])
    since, prev = 0, GENESIS
    if mx > max_rows:
        since = mx - max_rows
        anchor = d1("SELECT row_hash FROM agent_action_chain WHERE seq = ?1", [since])
        if not anchor:
            return False, 0, "seq %d is missing from the chain" % since
        prev = anchor[0]["row_hash"]
    checked, last_seq = 0, since
    while True:
        page = d1("SELECT c.seq AS c_seq, c.action_id AS c_aid, c.prev_hash AS c_prev, c.row_hash AS c_hash, a.id AS id, a.ts AS ts, a.actor AS actor, a.session AS session, a.tool AS tool, "
                  "a.action_kind AS action_kind, a.target AS target, a.inputs_hash AS inputs_hash, a.outputs_hash AS outputs_hash, a.version_id AS version_id, a.cost AS cost, "
                  "a.outcome AS outcome, a.source_table AS source_table, a.source_id AS source_id, a.via AS via "
                  "FROM agent_action_chain c LEFT JOIN agent_actions a ON a.id = c.action_id WHERE c.seq > ?1 ORDER BY c.seq LIMIT %d" % PAGE, [last_seq])
        if not page:
            break
        for r in page:
            seq = int(r["c_seq"])
            if r.get("id") is None:
                return False, checked, "seq %d: the agent_actions row %s is missing" % (seq, r["c_aid"])
            if r["c_prev"] != prev:
                return False, checked, "seq %d: prev_hash does not match the row before it" % seq
            if row_hash(prev, r) != r["c_hash"]:
                return False, checked, "seq %d: the row recomputes to a different hash (agent_actions id %s was changed after sealing)" % (seq, r["id"])
            prev = r["c_hash"]
            checked += 1
            last_seq = seq
        if len(page) < PAGE:
            break
    return True, checked, "every row recomputes and every link holds"


def check_roots(d1):
    """(ok, roots checked, detail): each daily root must equal the chain row it names."""
    roots = d1("SELECT day, head_seq, head_hash FROM agent_action_roots ORDER BY day")
    for r in roots:
        row = d1("SELECT row_hash FROM agent_action_chain WHERE seq = ?1", [int(r["head_seq"])])
        if not row or row[0]["row_hash"] != r["head_hash"]:
            return False, len(roots), "the root of %s names seq %s with a hash the chain no longer has" % (r["day"], r["head_seq"])
    return True, len(roots), "every daily root matches its chain row"


def ensure_root(d1, day, seq, head, total, stamp, r2_put):
    """Once per UTC day: the chain head to D1 (append-only) and to R2. Returns a short text, or None when today's root exists."""
    if d1("SELECT 1 AS x FROM agent_action_roots WHERE day = ?1", [day]):
        return None
    key = "audit-chain/%s.json" % day
    body = json.dumps({"day": day, "head_seq": seq, "head_hash": head, "rows_total": total, "written_at": stamp, "scheme": "sha256(prev_hash|canonical row)"}, sort_keys=True)
    try:
        st, _ = r2_put(key, body.encode("utf-8"))
        r2_ok = 1 if 200 <= int(st) < 300 else 0
    except Exception:  # noqa: BLE001
        st, r2_ok = 0, 0
    d1("INSERT INTO agent_action_roots (day, head_seq, head_hash, rows_total, r2_key, r2_ok, written_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", [day, seq, head, total, key, r2_ok, stamp])
    return "root %s written to D1%s" % (day, " and R2" if r2_ok else " (R2 refused: status %s)" % st)


def collect_audit_seal(ctx):
    """Sealing runs on every consumer run (no metric, so the framework never skips it): a row is exposed to rewriting only between its insert and its seal, so the gap should be one
    consumer run (10 to 20 minutes), not the 50-minute cadence of the verifier, and the first backlog (the 8-day backfill, 1200 rows a run) drains in a few runs."""
    if ctx.dry:
        return []
    try:
        seal(ctx.d1, iso(ctx.now))
    except Exception as e:  # noqa: BLE001
        # not a metric result: the framework would count it as an unknown metric on every run; a failed seal shows as rows awaiting sealing (evidence row `unsealed` of audit_chain_verify)
        print(json.dumps({"bp26_auditchain": "seal-failed", "error": str(e)[:160]}))
    return []


def collect_audit_chain(ctx):
    rows_out, stamp, day = [], iso(ctx.now), time.strftime("%Y-%m-%d", time.gmtime(ctx.now))
    sealed, note = 0, []
    try:
        if not ctx.dry:
            sealed, _seq, _head = seal(ctx.d1, stamp)
            if sealed:
                note.append("sealed %d new rows" % sealed)
        ok, checked, detail = verify(ctx.d1)
    except Exception as e:  # noqa: BLE001
        return [Result("audit_chain_verify", None, "chain unreadable: %s" % str(e)[:160], [("chain", None, str(e)[:200])])]
    rows_out.append(("chain", None if ok is None else (1 if ok else 0), "%s (%d rows checked)" % (detail, checked)))
    if ok is None:
        return [Result("audit_chain_verify", None, "agent_action_chain is empty: nothing to verify yet", rows_out)]
    rok, rn, rdetail = check_roots(ctx.d1)
    rows_out.append(("roots", 1 if rok else 0, "%s (%d roots)" % (rdetail, rn)))
    head = ctx.d1("SELECT seq, row_hash FROM agent_action_chain ORDER BY seq DESC LIMIT 1")[0]
    total = int(ctx.d1("SELECT COUNT(*) AS n FROM agent_action_chain")[0]["n"])
    if not ctx.dry:
        try:
            made = ensure_root(ctx.d1, day, int(head["seq"]), head["row_hash"], total, stamp, R2["write"])
            if made:
                note.append(made)
        except Exception as e:  # noqa: BLE001
            rows_out.append(("root:write", 0, str(e)[:200]))
    latest = ctx.d1("SELECT day, head_hash, r2_key, r2_ok FROM agent_action_roots ORDER BY day DESC LIMIT 1")
    r2_bad = False
    if latest and int(latest[0]["r2_ok"] or 0):
        try:
            st, raw = R2["read"](latest[0]["r2_key"])
            if 200 <= int(st) < 300:
                copy = json.loads(raw.decode("utf-8"))
                r2_bad = copy.get("head_hash") != latest[0]["head_hash"]
                rows_out.append(("r2:latest-root", 0 if r2_bad else 1, "R2 copy of %s %s the D1 root" % (latest[0]["day"], "DIFFERS from" if r2_bad else "matches")))
            else:
                rows_out.append(("r2:latest-root", None, "R2 copy not readable (status %s)" % st))
        except Exception as e:  # noqa: BLE001
            rows_out.append(("r2:latest-root", None, "R2 copy not readable: %s" % str(e)[:120]))
    elif latest:
        rows_out.append(("r2:latest-root", None, "the latest root has no R2 copy (the runner token's R2 write was refused)"))
    unsealed = int(ctx.d1("SELECT COUNT(*) AS n FROM agent_actions WHERE id > COALESCE((SELECT MAX(action_id) FROM agent_action_chain), 0)")[0]["n"])
    rows_out.append(("unsealed", 1 if unsealed == 0 else None, "%d agent_actions rows await sealing" % unsealed))
    good = bool(ok and rok and not r2_bad)
    note.append("%d rows verified: %s" % (checked, "ok" if good else "MISMATCH"))
    return [Result("audit_chain_verify", 1 if good else 0, "; ".join(note), rows_out)]


# ---------------------------------------------------------------- coverage against independent records
def _match(sorted_ts, t, tol=MATCH_S):
    i = bisect.bisect_left(sorted_ts, t - tol)
    return i < len(sorted_ts) and sorted_ts[i] <= t + tol


def _scripts(ctx, acct, since):
    """The worker scripts modified inside the window, read once per run (the deploy and secret classes share it)."""
    if getattr(ctx, "_bp26_scripts", None) is None:
        names = []
        for s in (ctx.cf("/accounts/%s/workers/scripts" % acct).get("result") or []):
            mod = parse_ts(s.get("modified_on"))
            if s.get("id") and (mod is None or mod >= since):
                names.append(s["id"])
        ctx._bp26_scripts = sorted(names)[:MAX_SCRIPTS]
    return ctx._bp26_scripts


def secret_class(ctx, ledger):
    """Secret writes: Cloudflare Workers versions annotated workers/triggered_by = secret (independent of every ledger) against agent_actions rows of kind secret-write for the same
    worker within 20 minutes. The grace is 90 minutes: qnfo-ops SECRET-CHANGE-WATCH-1 copies a change into cloud_ops_events every 30 minutes, and that event is the writer."""
    acct = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or ""
    if not acct:
        return None, "no account id in this environment"
    since, until = ctx.now - WINDOW_S, ctx.now - SECRET_GRACE_S
    by_worker = {}
    for r in ledger:
        if r["action_kind"] == "secret-write" and r.get("target"):
            t = parse_ts(r["ts"])
            if t is not None:
                by_worker.setdefault(r["target"], []).append(t)
    for v in by_worker.values():
        v.sort()
    names = _scripts(ctx, acct, since)
    matched, total, missing = 0, 0, []
    for name in names:
        if ctx.left() < 20:
            break
        try:
            items = (ctx.cf("/accounts/%s/workers/scripts/%s/versions?per_page=100" % (acct, name)).get("result") or {}).get("items") or []
        except Exception:  # noqa: BLE001
            continue
        for v in items:
            if (v.get("annotations") or {}).get("workers/triggered_by") != "secret":
                continue
            t = parse_ts((v.get("metadata") or {}).get("created_on"))
            if t is None or t < since or t > until:
                continue
            total += 1
            if _match(by_worker.get(name, []), t):
                matched += 1
            elif len(missing) < 20:
                missing.append(("secret-write:%s@%s" % (name, iso(t)), 0, "Cloudflare version %s of %s was triggered by a secret change and has no secret-write row in agent_actions within 20 minutes" % (v.get("number"), name)))
    return (matched, total, missing, len(names)), None


def deploy_class(ctx, ledger):
    """Cloudflare Workers deployments in the window against ledger rows (agent_actions of a deploy kind) for the same worker."""
    acct = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or ""
    if not acct:
        return None, "no account id in this environment"
    since, until = ctx.now - WINDOW_S, ctx.now - GRACE_S
    by_worker = {}
    for r in ledger:
        if r["action_kind"] in DEPLOY_KINDS and r.get("target"):
            t = parse_ts(r["ts"])
            if t is not None:
                by_worker.setdefault(r["target"], []).append(t)
    for v in by_worker.values():
        v.sort()
    names = _scripts(ctx, acct, since)
    matched, total, missing = 0, 0, []
    for name in names:
        if ctx.left() < 20:
            break
        try:
            dep = (ctx.cf("/accounts/%s/workers/scripts/%s/deployments" % (acct, name)).get("result") or {}).get("deployments") or []
        except Exception:  # noqa: BLE001
            continue
        for d in dep:
            t = parse_ts(d.get("created_on"))
            if t is None or t < since or t > until:
                continue
            total += 1
            if _match(by_worker.get(name, []), t):
                matched += 1
            elif len(missing) < 40:
                missing.append(("deploy:%s@%s" % (name, iso(t)), 0, "Cloudflare deployment (source %s, %s) has no deploy, settings, secret-write or rollback row in agent_actions within 20 minutes" % (d.get("source"), (d.get("annotations") or {}).get("workers/triggered_by"))))
    return (matched, total, missing, len(names)), None


def mastodon_class(ctx, ledger):
    """The public Mastodon timeline of the account the ledger posts to, against agent_actions publish rows (a status id found in a target)."""
    row = ctx.d1("SELECT url FROM social_media_posts WHERE platform = 'buffer-mastodon' AND url LIKE 'https://%/@%/%' ORDER BY created_at DESC LIMIT 1")
    m = re.match(r"^https://([^/]+)/@([^/]+)/", (row[0]["url"] if row else "") or "")
    if not m:
        return None, "no Mastodon post URL in the ledger to name the account"
    host, handle = m.group(1), m.group(2)
    who = ctx.http("https://%s/api/v1/accounts/lookup?acct=%s" % (host, urllib.parse.quote(handle)), external=True, headers={"Accept": "application/json"})
    if who.status != 200:
        return None, "Mastodon lookup answered %s %s" % (who.status, who.error or "")
    aid = json.loads(who.text).get("id")
    tl = ctx.http("https://%s/api/v1/accounts/%s/statuses?limit=40&exclude_replies=true&exclude_reblogs=true" % (host, aid), external=True, headers={"Accept": "application/json"})
    if tl.status != 200:
        return None, "Mastodon timeline answered %s %s" % (tl.status, tl.error or "")
    ids = set()
    for r in ledger:
        if r["action_kind"] == "publish":
            ids.update(re.findall(r"\d{8,}", r.get("target") or ""))
    since, until = ctx.now - WINDOW_S, ctx.now - GRACE_S
    matched, total, missing = 0, 0, []
    for s in json.loads(tl.text):
        t = parse_ts(s.get("created_at"))
        if t is None or t < since or t > until:
            continue
        total += 1
        if str(s.get("id")) in ids:
            matched += 1
        elif len(missing) < 20:
            missing.append(("publish:mastodon@%s" % iso(t), 0, "status %s is on the public timeline of @%s@%s and has no publish row in agent_actions" % (s.get("id"), handle, host)))
    return (matched, total, missing, 1), None


PAPER_EVENTS = ("SELECT seq, ts, slug, actor, status_before, status_after, version_before, version_after, withdrawal FROM paper_change_ledger "
                "WHERE ts >= ?1 AND ts <= ?2 AND seq > ?3 AND (withdrawal = 1 OR (status_after IN ('published', 'distributed', 'external_preprint') "
                "AND (COALESCE(status_before, '') <> COALESCE(status_after, '') OR COALESCE(version_before, '') <> COALESCE(version_after, '')))) ORDER BY seq LIMIT 2000")
Q08_EVENTS = ("SELECT id, slug, published_at FROM published_pieces WHERE strftime('%Y-%m-%dT%H:%M:%SZ', published_at) >= ?1 AND strftime('%Y-%m-%dT%H:%M:%SZ', published_at) <= ?2 "
              "ORDER BY published_at LIMIT 500")
PAPERS_TABLE, Q08_TABLE = "living-paper.paper_change_ledger", "q08-signal.published_pieces"


def _have(ctx, table, since):
    return {str(r["source_id"]) for r in ctx.d1("SELECT source_id FROM agent_actions WHERE source_table = ?1 AND ts >= ?2", [table, iso(since)])}


def papers_class(ctx, ledger):
    """Papers published or re-versioned in the window, from the papers system of record (living-paper paper_change_ledger), against agent_actions."""
    since, until = ctx.now - WINDOW_S, ctx.now - GRACE_S
    events = ctx.d1_db("living-paper", PAPER_EVENTS, [iso(since), iso(until), 0])
    have = _have(ctx, PAPERS_TABLE, since - 86400)
    matched, missing = 0, []
    for e in events:
        if str(e["seq"]) in have:
            matched += 1
        elif len(missing) < 20:
            missing.append(("publish:papers@%s" % e["ts"], 0, "paper_change_ledger seq %s (%s, actor %s) has no agent_actions row" % (e["seq"], e["slug"], e["actor"])))
    return (matched, len(events), missing, 1), None


def q08_class(ctx, ledger):
    """q08 pieces published in the window, from the q08-signal system of record (published_pieces), against agent_actions."""
    since, until = ctx.now - WINDOW_S, ctx.now - GRACE_S
    events = ctx.d1_db("q08-signal", Q08_EVENTS, [iso(since), iso(until)])
    have = _have(ctx, Q08_TABLE, since - 86400)
    matched, missing = 0, []
    for e in events:
        if str(e["id"]) in have:
            matched += 1
        elif len(missing) < 20:
            missing.append(("publish:q08@%s" % e["published_at"], 0, "published_pieces %s has no agent_actions row" % e["slug"]))
    return (matched, len(events), missing, 1), None


def _insert_publishes(d1, rows):
    """rows: (ts, actor, tool, target, version_id, outcome, source_table, source_id). INSERT OR IGNORE on the unique source index; 8 binds per row, 10 rows per statement (the D1 limit is 100)."""
    for i in range(0, len(rows), 10):
        chunk, params = rows[i:i + 10], []
        for r in chunk:
            params += list(r)
        d1("INSERT OR IGNORE INTO agent_actions (ts, actor, tool, action_kind, target, version_id, outcome, source_table, source_id, via) VALUES "
           + ", ".join(["(?,?,?,'publish',?,?,?,?,?,'runner-mirror')"] * len(chunk)), params)


def collect_mirror_publishes(ctx):
    """The runner is the writer for the two publishers whose ledgers live in other databases (a D1 trigger cannot cross databases): papers and q08 pieces.
    New events since the last mirrored one (the first run takes 8 days) become agent_actions rows, via runner-mirror. Runs before the coverage collector."""
    note, wrote = [], 0
    try:
        last = ctx.d1("SELECT MAX(CAST(source_id AS INTEGER)) AS m FROM agent_actions WHERE source_table = ?1", [PAPERS_TABLE])[0]["m"] or 0
        ev = ctx.d1_db("living-paper", PAPER_EVENTS, [iso(ctx.now - 8 * 86400), iso(ctx.now), int(last)])
        rows = [(iso(parse_ts(e["ts"]) or ctx.now), e["actor"] or "unattributed", "paper-change-ledger", "paper:%s" % e["slug"], e["version_after"], "withdrawn" if e["withdrawal"] else "ok", PAPERS_TABLE, str(e["seq"])) for e in ev]
        if rows and not ctx.dry:
            _insert_publishes(ctx.d1, rows)
        wrote += len(rows)
        note.append("papers %d" % len(rows))
    except Exception as e:  # noqa: BLE001
        note.append("papers unread: %s" % str(e)[:100])
    try:
        lt = ctx.d1("SELECT MAX(ts) AS t FROM agent_actions WHERE source_table = ?1", [Q08_TABLE])[0]["t"] or iso(ctx.now - 8 * 86400)
        ev = ctx.d1_db("q08-signal", Q08_EVENTS, [lt, iso(ctx.now)])
        rows = [(iso(parse_ts(e["published_at"]) or ctx.now), "q08-signal-engine", "q08-publish", "q08:%s" % e["slug"], None, "ok", Q08_TABLE, str(e["id"])) for e in ev]
        if rows and not ctx.dry:
            _insert_publishes(ctx.d1, rows)
        wrote += len(rows)
        note.append("q08 %d" % len(rows))
    except Exception as e:  # noqa: BLE001
        note.append("q08 unread: %s" % str(e)[:100])
    return [Result("audit_coverage", None, "mirror %s (%s)" % ("would write" if ctx.dry else "wrote", ", ".join(note)), [])]


def collect_audit_coverage(ctx):
    since = iso(ctx.now - WINDOW_S - 3600)
    try:
        ledger = ctx.d1("SELECT action_kind, target, ts FROM agent_actions WHERE ts >= ?1", [since])
    except Exception as e:  # noqa: BLE001
        return [Result("audit_coverage", None, "agent_actions unreadable: %s" % str(e)[:140], [("agent_actions", None, str(e)[:200])])]
    rows, matched, total, parts, unmeasured = [], 0, 0, [], []
    for name, fn in (("deploy", deploy_class), ("publish:mastodon", mastodon_class), ("secret-write", secret_class), ("publish:papers", papers_class), ("publish:q08", q08_class)):
        try:
            res, why = fn(ctx, ledger)
        except Exception as e:  # noqa: BLE001
            res, why = None, "%s: %s" % (type(e).__name__, str(e)[:140])
        if res is None:
            unmeasured.append(name)
            rows.append(("class:" + name, None, "no independent read this run: %s" % why))
            continue
        m, t, missing, n = res
        matched, total = matched + m, total + t
        parts.append("%s %d of %d" % (name, m, t))
        rows.append(("class:" + name, 1 if t and m == t else (None if not t else 0), "%d of %d records have an agent_actions row (record: %s; %d sources read, window 7 days)" % (m, t, CLASS_RECORD[name], n)))
        rows += missing
    # Classes with a ledger but no independent record: parity only, never counted.
    try:
        em = int(ctx.d1("SELECT COUNT(*) AS n FROM emails WHERE status = 'sent' AND strftime('%Y-%m-%dT%H:%M:%SZ', received_at) >= ?1 AND strftime('%Y-%m-%dT%H:%M:%SZ', received_at) <= ?2", [since, iso(ctx.now - GRACE_S)])[0]["n"])
        ea = int(ctx.d1("SELECT COUNT(*) AS n FROM agent_actions WHERE source_table = 'emails' AND ts >= ?1 AND ts <= ?2", [since, iso(ctx.now - GRACE_S)])[0]["n"])
        rows.append(("ledger-only:send", None, "emails sent in the window %d, agent_actions send rows %d: ledger parity only, no independent record (the runner token cannot read Cloudflare Email Service logs); not counted" % (em, ea)))
        sp = int(ctx.d1("SELECT COUNT(*) AS n FROM social_media_posts WHERE status = 'published' AND strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(published_at, created_at)) >= ?1 AND platform <> 'buffer-mastodon'", [since])[0]["n"])
        pa = int(ctx.d1("SELECT COUNT(*) AS n FROM agent_actions WHERE source_table = 'social_media_posts' AND ts >= ?1 AND tool <> 'buffer-mastodon'", [since])[0]["n"])
        rows.append(("ledger-only:publish-other-platforms", None, "posts on Buffer-routed platforms and Bluesky roll-ups %d, agent_actions rows %d: ledger parity only (their rows carry no public post id to match); not counted" % (sp, pa)))
    except Exception as e:  # noqa: BLE001
        rows.append(("ledger-only", None, "parity read failed: %s" % str(e)[:140]))
    for cls, why in (("bluesky-and-buffer-platforms", "their rows carry no public post id to match against a timeline; ledger parity only (see ledger-only:publish-other-platforms)"),
                     ("send:independent", "no independent record of sent mail is readable with the runner token (Cloudflare Email Service logs); see ledger-only:send")):
        rows.append(("no-ledger:" + cls, None, why))
    if not total:
        return [Result("audit_coverage", None, "no independent record could be read this run (%s)" % "; ".join(unmeasured) if unmeasured else "no independent record fell in the window", rows)]
    note = "%s; share over the classes with an outside record only%s" % ("; ".join(parts), ("; unread this run: " + ", ".join(unmeasured)) if unmeasured else "")
    return [Result("audit_coverage", matched / float(total), note, rows)]


# ---------------------------------------------------------------- kill switch
def collect_kill_switch_age(ctx):
    n = int(ctx.d1("SELECT COUNT(*) AS n FROM kill_switch_tests")[0]["n"])
    last = ctx.d1("SELECT MAX(ts) AS t FROM kill_switch_tests WHERE outcome = 'pass' AND mode = 'live'")[0]["t"]
    t = parse_ts(last)
    if t is None:
        return [Result("kill_switch_test_age_days", None, "no live drill has passed (%d ledger rows): no global kill switch exists yet, so no honest age exists" % n,
                       [("kill_switch_tests", None, "%d rows, 0 live passes; protocol docs/KILL-SWITCH-DRILL.md; owner of the build: BP26-LEASES-KILLSWITCH-1" % n)])]
    days = max(0.0, (ctx.now - t) / 86400.0)
    return [Result("kill_switch_test_age_days", round(days, 1), "last live pass %s" % last, [("kill_switch_tests", 1 if days <= 30 else 0, "last live pass %s, %.1f days ago" % (last, days))])]


COLLECTORS = [
    Collector("audit_seal", collect_audit_seal, [], 0),                                  # every run: keeps the unsealed window to one consumer run
    Collector("audit_chain", collect_audit_chain, ["audit_chain_verify"], 50),
    Collector("mirror_publishes", collect_mirror_publishes, ["audit_coverage"], 50),   # before the coverage collector: the denominators come from the source databases, never from this mirror
    Collector("audit_coverage", collect_audit_coverage, ["audit_coverage"], 50),
    Collector("kill_switch_age", collect_kill_switch_age, ["kill_switch_test_age_days"], 50),
]




# ---------------------------------------------------------------- selftest (offline: sqlite replays the real migration; no network, no token)
def _world():
    """A sqlite database with the ledgers the migration reads and the migration itself applied: (connection, d1 shim)."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    mig = open(os.path.join(root, "migrations", "2026-10-26-bp26-audit-log.sql"), encoding="utf-8").read()
    c = sqlite3.connect(":memory:")
    c.executescript("""
CREATE TABLE fleet_deploys (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, actor TEXT, from_sha TEXT, to_sha TEXT, source_path TEXT, ok INTEGER, note TEXT, ts TEXT, session_id TEXT);
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, status TEXT DEFAULT 'received', received_at TEXT DEFAULT (datetime('now')));
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, status TEXT DEFAULT 'published', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, status TEXT DEFAULT 'queued', posted_at TEXT, post_uri TEXT);
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, intent TEXT NOT NULL, holder TEXT NOT NULL, issue_id INTEGER, pr INTEGER, claimed_at TEXT NOT NULL, expires_at TEXT NOT NULL, released_at TEXT, outcome TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, source_of_truth TEXT, last_value TEXT, state TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
""")
    c.executescript(mig)

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        out = [dict(zip(cols, r)) for r in cur.fetchall()]
        c.commit()
        return out
    return c, d1


def selftest():
    import bp26_producers as P
    fails = []

    def ok(cond, msg):
        if not cond:
            fails.append(msg)
            print("FAIL " + msg)
    now = time.time()
    # ---- sealing and verification
    c, d1 = _world()

    def deploy(worker, t, note="server-side deploy"):
        c.execute("INSERT INTO fleet_deploys (worker, actor, to_sha, ok, note, ts) VALUES (?, 'qnfo-ops/ops-deploy', '1.0.0', 1, ?, ?)", [worker, note, iso(t)])
        c.commit()
    ok(verify(d1)[0] is None and collect_audit_chain(P.Ctx(d1=d1, now=now))[0].value is None, "an empty chain verifies to None, never 1 or 0")
    for i in range(5):
        deploy("w%d" % (i % 2), now - 3600 * (i + 1))
    ok(d1("SELECT COUNT(*) AS n FROM agent_actions")[0]["n"] == 5, "the writer trigger recorded the five ledger rows")
    n, seq, head = seal(d1, iso(now))
    ok(n == 5 and seq == 5, "five rows sealed: %r" % ((n, seq),))
    ok(seal(d1, iso(now))[0] == 0, "sealing is idempotent")
    chain = d1("SELECT seq, action_id, prev_hash, row_hash FROM agent_action_chain ORDER BY seq")
    prev = GENESIS
    for r in chain:   # an independent recomputation: stdlib only, written out here, not the module's own helpers
        a = d1("SELECT * FROM agent_actions WHERE id = ?1", [r["action_id"]])[0]
        want = hashlib.sha256((prev + "|" + json.dumps([a[k] for k in COLS], separators=(",", ":"), ensure_ascii=True)).encode()).hexdigest()
        ok(r["prev_hash"] == prev and r["row_hash"] == want, "seq %s recomputes independently" % r["seq"])
        prev = r["row_hash"]
    deploy("w0", now - 60)
    ok(seal(d1, iso(now))[0] == 1 and d1("SELECT prev_hash FROM agent_action_chain ORDER BY seq DESC LIMIT 1")[0]["prev_hash"] == chain[-1]["row_hash"], "a new row chains from the previous head")
    ok(verify(d1)[:2] == (True, 6), "verify: 6 rows recompute")
    stored = {}
    R2["write"] = lambda key, data: (stored.__setitem__(key, data), (200, b""))[1]
    R2["read"] = lambda key: (200, stored[key]) if key in stored else (404, b"")
    day = time.strftime("%Y-%m-%d", time.gmtime(now))
    r = collect_audit_chain(P.Ctx(d1=d1, now=now))[0]
    ok(r.value == 1 and ("audit-chain/%s.json" % day) in stored and d1("SELECT COUNT(*) AS n FROM agent_action_roots")[0]["n"] == 1, "the first run of the day verifies and writes one root to D1 and R2: %r" % (r,))
    collect_audit_chain(P.Ctx(d1=d1, now=now))
    ok(d1("SELECT COUNT(*) AS n FROM agent_action_roots")[0]["n"] == 1, "a second run the same day writes no second root")
    # the append-only guards stand in the way of an honest writer; a writer with raw access is simulated by dropping them
    try:
        c.execute("UPDATE agent_actions SET target = 'forged' WHERE id = 3")
        ok(False, "the guard must refuse an UPDATE of agent_actions")
    except sqlite3.DatabaseError:
        pass
    good_root = d1("SELECT head_hash FROM agent_action_roots")[0]["head_hash"]
    stored["audit-chain/%s.json" % day] = json.dumps({"head_hash": "forged"}).encode()
    r = collect_audit_chain(P.Ctx(d1=d1, now=now))[0]
    ok(r.value == 0 and any(x[0] == "r2:latest-root" and x[1] == 0 for x in r.rows), "a forged R2 copy of the root reads 0: %r" % (r,))
    stored["audit-chain/%s.json" % day] = json.dumps({"head_hash": good_root}).encode()
    original = d1("SELECT target FROM agent_actions WHERE id = 3")[0]["target"]
    c.execute("DROP TRIGGER agent_actions_no_update")
    c.execute("UPDATE agent_actions SET target = 'forged' WHERE id = 3")
    c.commit()
    ok(verify(d1)[0] is False and "seq 3" in verify(d1)[2], "an agent_actions row changed after sealing is named by seq: %r" % (verify(d1),))
    ok(collect_audit_chain(P.Ctx(d1=d1, now=now))[0].value == 0, "and the metric reads 0")
    c.execute("UPDATE agent_actions SET target = ?1 WHERE id = 3", [original])
    c.commit()
    ok(verify(d1)[0] is True, "restoring the original text makes the chain verify again")
    c.execute("DROP TRIGGER agent_action_chain_no_update")
    c.execute("UPDATE agent_action_chain SET prev_hash = 'x' WHERE seq = 4")
    c.commit()
    ok(verify(d1)[0] is False and "seq 4" in verify(d1)[2], "a broken link is named by seq: %r" % (verify(d1),))
    c.execute("UPDATE agent_action_chain SET prev_hash = (SELECT row_hash FROM agent_action_chain WHERE seq = 3) WHERE seq = 4")
    c.commit()
    c.execute("DROP TRIGGER agent_action_roots_no_update")
    c.execute("UPDATE agent_action_roots SET head_hash = 'forged'")
    c.commit()
    ok(check_roots(d1)[0] is False, "a daily root that no longer matches its chain row is detected")
    c.execute("DROP TRIGGER agent_actions_no_delete")
    c.execute("DELETE FROM agent_actions WHERE id = 2")
    c.commit()
    ok(verify(d1)[0] is False and "missing" in verify(d1)[2], "a deleted agent_actions row is detected as missing: %r" % (verify(d1),))
    # ---- the seal collector (every run, no metric)
    c, d1 = _world()
    ok(collect_audit_seal(P.Ctx(d1=d1, now=now)) == [] and collect_audit_seal(P.Ctx(d1=d1, now=now, dry=True)) == [], "the seal collector reports nothing when there is nothing to seal and never writes in a dry run")
    deploy("w5", now - 20)
    ok(collect_audit_seal(P.Ctx(d1=d1, now=now, dry=True)) == [] and d1("SELECT COUNT(*) AS n FROM agent_action_chain")[0]["n"] == 0, "dry: a new row stays unsealed")
    r = collect_audit_seal(P.Ctx(d1=d1, now=now))
    ok(r == [] and d1("SELECT COUNT(*) AS n FROM agent_action_chain")[0]["n"] == 1, "the seal collector seals the new row and returns no metric result: %r" % (r,))
    # ---- a dry run seals nothing
    c, d1 = _world()
    deploy("w0", now - 60)
    r = collect_audit_chain(P.Ctx(d1=d1, now=now, dry=True))[0]
    ok(d1("SELECT COUNT(*) AS n FROM agent_action_chain")[0]["n"] == 0 and r.value is None, "dry: nothing is sealed and an empty chain stays unknown")
    # ---- coverage against independent records
    c, d1 = _world()
    for trg in ("agent_actions_from_fleet_deploys", "agent_actions_from_social_posts", "agent_actions_from_emails_sent", "agent_actions_from_social_threads"):
        c.execute("DROP TRIGGER " + trg)   # the ledger rows here are written directly, as the writers would
    os.environ["CF_ACCOUNT_ID"] = "acct"
    t_a1, t_a2, t_a3 = now - 86400, now - 2 * 86400, now - 3 * 86400
    for kind, tgt, t in (("deploy", "worker-a", t_a1 + 120), ("settings", "worker-a", t_a2 - 300), ("deploy", "worker-b", now - 5 * 86400 + 60), ("publish", "https://mstdn.example/@QNFO/117506044806056387", now - 86400 * 2)):
        c.execute("INSERT INTO agent_actions (ts, action_kind, target, source_table, source_id) VALUES (?, ?, ?, 'x', ?)", [iso(t), kind, tgt, "%s-%s" % (kind, t)])
    c.execute("INSERT INTO social_media_posts (id, platform, url, status, published_at) VALUES ('p1', 'buffer-mastodon', 'https://mstdn.example/@QNFO/117506044806056387', 'published', ?)", [iso(now - 86400 * 2)])
    c.commit()
    deployments = {"worker-a": [{"created_on": iso(t_a1), "source": "api", "annotations": {"workers/triggered_by": "upload"}}, {"created_on": iso(t_a2), "source": "api"}, {"created_on": iso(t_a3), "source": "api"},
                                {"created_on": iso(now - 600), "source": "api"}, {"created_on": iso(now - 9 * 86400), "source": "api"}],
                   "worker-b": [{"created_on": iso(now - 5 * 86400), "source": "api"}]}

    def ver(n, t, by):
        return {"number": n, "metadata": {"created_on": iso(t)}, "annotations": {"workers/triggered_by": by}}
    versions = {"worker-a": [ver(5, now - 86400 * 1.5, "secret"), ver(4, now - 86400, "upload"), ver(3, now - 600, "secret"), ver(2, now - 9 * 86400, "secret")],   # one matched, one inside the 90-minute grace, one outside the window
                "worker-b": [ver(9, now - 4 * 86400, "secret"), ver(8, now - 3 * 86400, "upload")]}                                                              # one unmatched
    c.execute("INSERT INTO agent_actions (ts, action_kind, target, source_table, source_id) VALUES (?, 'secret-write', 'worker-a', 'cloud_ops_events', 'sc-1')", [iso(now - 86400 * 1.5 + 30)])
    c.execute("INSERT INTO agent_actions (ts, action_kind, target, source_table, source_id) VALUES (?, 'deploy', 'worker-b', 'x', 'near-deploy')", [iso(now - 4 * 86400 + 60)])   # a deploy near the secret version is not a secret-write row
    c.commit()

    def cf(path):
        if path.endswith("/workers/scripts"):
            return {"result": [{"id": "worker-a", "modified_on": iso(now - 600)}, {"id": "worker-b", "modified_on": iso(now - 5 * 86400)}, {"id": "idle", "modified_on": iso(now - 40 * 86400)}]}
        name = path.split("/scripts/")[1].split("/")[0]
        if "/versions" in path:
            return {"result": {"items": versions.get(name, [])}}
        return {"result": {"deployments": deployments.get(name, [])}}

    class Resp(object):
        def __init__(self, status, text):
            self.status, self.text, self.error = status, text, None

    def http(url, **kw):
        if "/lookup" in url:
            return Resp(200, json.dumps({"id": "42"}))
        return Resp(200, json.dumps([{"id": "117506044806056387", "created_at": iso(now - 86400 * 2)}, {"id": "999999999999", "created_at": iso(now - 86400 * 3)}]))
    # the two other databases the papers and q08 publishers write to (read-only for the collector)
    lp, q8 = sqlite3.connect(":memory:"), sqlite3.connect(":memory:")
    lp.executescript("CREATE TABLE paper_change_ledger (seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, slug TEXT, actor TEXT, status_before TEXT, status_after TEXT, version_before TEXT, version_after TEXT, withdrawal INTEGER DEFAULT 0);")
    q8.executescript("CREATE TABLE published_pieces (id TEXT PRIMARY KEY, slug TEXT, published_at TEXT);")
    pl = lp.cursor()
    for ts, slug, actor, sb, sa, vb, va, wd in ((now - 86400, "p-new", "unattributed", "quarantined", "published", "1", "1", 0),          # a publish
                                                (now - 2 * 86400, "p-ver", "session_x", "published", "published", "1", "2", 0),             # a re-version of a published paper
                                                (now - 3 * 86400, "p-same", "session_y", "published", "published", "2", "2", 0),            # a change that is no publish
                                                (now - 4 * 86400, "p-draft", "session_z", "draft", "draft", "1", "1", 0),                   # not published
                                                (now - 5 * 86400, "p-wd", "session_w", "published", "withdrawn", "2", "2", 1),              # a withdrawal
                                                (now - 12 * 86400, "p-old", "unattributed", "quarantined", "published", "1", "1", 0),       # outside the window
                                                (now - 900, "p-recent", "unattributed", "quarantined", "published", "1", "1", 0)):          # inside the grace period
        pl.execute("INSERT INTO paper_change_ledger (ts, slug, actor, status_before, status_after, version_before, version_after, withdrawal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   [time.strftime("%Y-%m-%dT%H:%M:%S.123Z", time.gmtime(ts)), slug, actor, sb, sa, vb, va, wd])
    lp.commit()
    for pid, slug, t in (("q1", "q-a", now - 86400), ("q2", "q-b", now - 3 * 86400), ("q3", "q-old", now - 30 * 86400)):
        q8.execute("INSERT INTO published_pieces VALUES (?, ?, ?)", [pid, slug, time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(t))])   # SQLite default time format
    q8.commit()

    def d1_db(name, sql, params=None):
        conn = {"living-paper": lp, "q08-signal": q8}[name]
        cur = conn.execute(sql, params or [])
        cols = [x[0] for x in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    ctx0 = P.Ctx(d1=d1, d1_db=d1_db, cf=cf, http=http, now=now)
    r = collect_audit_coverage(ctx0)[0]
    # before the mirror: deploys 3 of 4 (worker-a t_a1 and t_a2 matched, t_a3 not; worker-b matched), statuses 1 of 2, papers 0 of 3 (publish, re-version, withdrawal), q08 0 of 2
    ok(r.value is not None and abs(r.value - 5.0 / 13.0) < 1e-9, "coverage before the mirror is 5 of 13 (deploys 3/4, statuses 1/2, secret writes 1/2, papers 0/3, q08 0/2): got %r" % (r.value,))
    miss = [x[0] for x in r.rows if x[1] == 0 and x[0].startswith(("deploy:", "publish:"))]
    ok(sum(1 for m in miss if m.startswith("publish:papers@")) == 3 and sum(1 for m in miss if m.startswith("publish:q08@")) == 2 and any(m.startswith("deploy:worker-a@") for m in miss) and any(m.startswith("publish:mastodon@") for m in miss),
       "the uncovered deployment, status, three paper events and two pieces are listed: %r" % miss)
    ok(any(x[0] == "ledger-only:send" for x in r.rows) and sum(1 for x in r.rows if x[0].startswith("no-ledger:")) == 2, "classes with no outside record are named and not counted")
    ok(any(x[0].startswith("secret-write:worker-b@") and x[1] == 0 for x in r.rows) and not any(x[0].startswith("secret-write:worker-a@") for x in r.rows), "the unmatched secret version is listed; the matched one, the one in the grace period and the one outside the window are not")
    m1 = collect_mirror_publishes(P.Ctx(d1=d1, d1_db=d1_db, now=now, dry=True))[0]
    ok(m1.value is None and d1("SELECT COUNT(*) AS n FROM agent_actions WHERE via = 'runner-mirror'")[0]["n"] == 0 and "papers 4" in m1.note and "q08 2" in m1.note, "a dry mirror writes nothing: %r" % (m1,))
    m2 = collect_mirror_publishes(ctx0)[0]
    # the mirror takes the last 8 days, including the in-grace paper event (it happened), so 4 papers
    ok(d1("SELECT COUNT(*) AS n FROM agent_actions WHERE source_table = 'living-paper.paper_change_ledger'")[0]["n"] == 4 and d1("SELECT COUNT(*) AS n FROM agent_actions WHERE source_table = 'q08-signal.published_pieces'")[0]["n"] == 2, "the mirror wrote 4 paper events and 2 pieces: %r" % (m2,))
    wd = d1("SELECT outcome, target FROM agent_actions WHERE target = 'paper:p-wd'")[0]
    ok(wd["outcome"] == "withdrawn" and d1("SELECT actor FROM agent_actions WHERE target = 'paper:p-new'")[0]["actor"] == "unattributed", "a withdrawal is recorded as withdrawn and an unattributed actor stays unattributed")
    collect_mirror_publishes(ctx0)
    ok(d1("SELECT COUNT(*) AS n FROM agent_actions WHERE via = 'runner-mirror'")[0]["n"] == 6, "a second mirror run writes nothing new (idempotent)")
    r = collect_audit_coverage(ctx0)[0]
    ok(abs(r.value - 10.0 / 13.0) < 1e-9, "after the mirror the denominators (from the source databases) are unchanged and papers 3/3, q08 2/2 give 10 of 13: got %r" % (r.value,))

    def refuse(path):
        raise RuntimeError("HTTP 403")

    def no_db(name, sql, params=None):
        raise RuntimeError("database unreadable")
    r = collect_audit_coverage(P.Ctx(d1=d1, d1_db=no_db, cf=refuse, http=lambda u, **k: Resp(500, ""), now=now))[0]
    ok(r.value is None and any("no independent read" in str(x[2]) for x in r.rows), "nothing readable at all gives None, never a number: %r" % (r,))
    ok(P.Ctx(d1=d1, d1_db=d1_db, now=now).d1_db("living-paper", "SELECT 1 AS x") == [{"x": 1}], "the framework allows a research database read")
    try:
        P.Ctx(d1=d1, d1_db=d1_db, now=now).d1_db("personal-life", "SELECT 1")
        ok(False, "the personal plane must stay refused")
    except RuntimeError:
        pass
    # ---- kill switch
    c, d1 = _world()
    ok(collect_kill_switch_age(P.Ctx(d1=d1, now=now))[0].value is None, "no drill: None")
    c.execute("INSERT INTO kill_switch_tests (ts, flag, mode, outcome, evidence) VALUES (?, 'f', 'dry-run', 'pass', 'dry')", [iso(now - 86400)])
    c.commit()
    ok(collect_kill_switch_age(P.Ctx(d1=d1, now=now))[0].value is None, "a dry-run pass does not count")
    c.execute("INSERT INTO kill_switch_tests (ts, flag, mode, outcome, evidence) VALUES (?, 'f', 'live', 'fail', 'x')", [iso(now - 3600)])
    c.execute("INSERT INTO kill_switch_tests (ts, flag, mode, outcome, evidence) VALUES (?, 'f', 'live', 'pass', 'x')", [iso(now - 3 * 86400)])
    c.commit()
    v = collect_kill_switch_age(P.Ctx(d1=d1, now=now))[0].value
    ok(v is not None and abs(v - 3.0) < 0.05, "a live pass three days ago reads 3.0 and a later failed drill does not reset it: %r" % (v,))
    ok([x.name for x in COLLECTORS] == ["audit_seal", "audit_chain", "mirror_publishes", "audit_coverage", "kill_switch_age"] and all(isinstance(x.every_min, int) for x in COLLECTORS), "five collectors registered, the seal first and the mirror before the coverage")
    ok(COLLECTORS[0].metrics == [] , "the seal collector has no metric, so the framework never skips it")
    print("bp26_auditchain selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    print("usage: python3 scripts/bp26_auditchain.py --selftest   (the collectors run through scripts/bp26_producers.py)")
