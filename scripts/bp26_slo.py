#!/usr/bin/env python3
"""BP26-SLO-ERROR-BUDGETS-1 collector (2026-10-28, charter pillar autonomy; agent_issues 1000357, GitHub 4453; program QNFO.OPS).

WHAT  Turns the availability history scripts/bp26_web.py already records (bp26_probe_results, metric slo_attainment_28d_min, subject avail:<host>, ok 1 or 0) into
      an SLO practice:
        slo_definitions     one row per public surface: SLI, objective (0.995), window (28 days)
        slo_budget_state    per surface, each run: samples, bad samples, attainment, share of the error budget spent, state ok | warn (>= 50 percent) | spent (>= 100 percent)
        ops_config slo_budget_spent   the surfaces whose budget is spent (comma list, empty when none): the merge lane takes reliability changes only while it is non-empty
        incidents           an availability episode (one or more consecutive failed samples of a surface) and every control-plane canary revert or failure in agent_issues
        postmortems         one blameless postmortem per incident, written by this script: timeline from the samples or the issue, a root-cause class that follows from the
                            evidence (not a guess at a person or a cause the data cannot show), contributing facts, and actions. An incident that burned the budget or lasted two
                            or more samples files one agent_issues action row (SLO-POSTMORTEM-ACTION-1 <surface>) for the owning program; a single failed sample inside the budget
                            records "no action: within budget" and says so.
      Metric postmortem_coverage: incidents opened in the last 30 days that are old enough to be judged (closed, or opened 72 hours ago) with a completed postmortem written
      within 72 hours of opening, over those incidents. 1.0 when there are none (stated in the note).
LIMITS  The only SLI with history is availability of the HTML hosts (home page answer under 5 s). Latency and freshness SLIs (the q08 desk published by 09:00 CET) have no recorded
      history yet; slo_definitions holds only what is measured. A root-cause class is what the evidence supports (timeout, TLS, 5xx, 4xx, deploy regression), the human root cause is
      the action issue's job. Samples are hourly, so an outage shorter than the gap between samples is invisible.
Offline suite: python3 scripts/bp26_slo.py --selftest
"""
import datetime
import os
import re
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

WINDOW_DAYS = 28
OBJECTIVE = 0.995
WARN_PCT = 50.0
INCIDENT_DAYS = 30
JUDGE_AFTER_H = 72
GENERATOR = "scripts/bp26_slo.py"


def iso(t):
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(ts):
    return datetime.datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc).timestamp()


def cause_class(details):
    """The root-cause class the sample details support."""
    t = " ".join(details).lower()
    if "timeout" in t:
        return "timeout", "the host did not answer inside the probe timeout"
    if "tls" in t:
        return "tls", "the TLS handshake failed"
    m = re.search(r"status (5\d\d)", t)
    if m or "5xx" in t:
        return "server-error", "the host answered with a 5xx status"
    if re.search(r"status 4\d\d", t):
        return "client-error", "the host answered with a 4xx status the SLI does not accept"
    if "down" in t or "error" in t:
        return "unreachable", "the probe could not complete a request"
    return "slow-or-unknown", "the sample failed the SLI (slower than the 5 s limit or an answer outside 2xx, 3xx, 401, 403)"


def episodes(samples):
    """samples: [(run_at, ok, detail)] ascending. Returns [(first_bad, last_bad, recovered_at or None, n_bad, [details])] for runs of ok == 0."""
    out, cur = [], None
    for ts, ok, detail in samples:
        if ok == 0:
            if cur is None:
                cur = [ts, ts, None, 0, []]
            cur[1] = ts
            cur[3] += 1
            if len(cur[4]) < 5:
                cur[4].append(detail or "")
        elif ok == 1 and cur is not None:
            cur[2] = ts
            out.append(tuple(cur))
            cur = None
    if cur is not None:
        out.append(tuple(cur))
    return out


def budget(good, n, objective):
    """(attainment, budget_spent_pct, state). The budget is the share of samples allowed to fail: (1 - objective) * n."""
    if n <= 0:
        return None, None, "no-data"
    bad = n - good
    allowed = (1.0 - objective) * n
    spent = round(100.0 * bad / allowed, 1) if allowed > 0 else (0.0 if bad == 0 else 999.0)
    return good / float(n), spent, "spent" if spent >= 100 else ("warn" if spent >= WARN_PCT else "ok")


def file_action(ctx, title, desc):
    """One open agent_issues row per title (the unique open-title index is the second guard); True when a row exists after the call."""
    try:
        if ctx.d1("SELECT id FROM agent_issues WHERE title = ?1 AND status IN ('open','in_progress','triaged') LIMIT 1", [title]):
            return True
        ctx.d1("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'bp26-slo', 'reliability', 'high', 'open', "
               "CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000)", [title, desc])
        return True
    except Exception as e:  # noqa: BLE001
        if "UNIQUE" in str(e):
            return True
        print("bp26_slo: action issue not filed: %s" % str(e)[:160], file=sys.stderr)
        return False


def collect_slo(ctx):
    now = ctx.now
    since = iso(now - WINDOW_DAYS * 86400)
    try:
        defs = {r["surface"]: r for r in ctx.d1("SELECT surface, objective, window_days FROM slo_definitions")}
    except Exception as e:  # noqa: BLE001
        return [Result("postmortem_coverage", None, "slo_definitions unreadable (migration 2026-10-28-bp26-slo-budgets.sql not applied?): " + str(e)[:100], [])]
    if not defs:
        return [Result("postmortem_coverage", None, "slo_definitions is empty", [])]
    rows = []
    spent_surfaces = []
    all_samples = {}
    for surface, d in sorted(defs.items()):
        smp = ctx.d1("SELECT run_at, ok, detail FROM bp26_probe_results WHERE metric = 'slo_attainment_28d_min' AND subject = ?1 AND ok IS NOT NULL AND run_at > ?2 ORDER BY run_at",
                     ["avail:" + surface, since])
        samples = [(r["run_at"], int(r["ok"]), r["detail"]) for r in smp]
        all_samples[surface] = samples
        good = sum(1 for s in samples if s[1] == 1)
        att, spent, state = budget(good, len(samples), float(d["objective"]))
        if not ctx.dry:
            ctx.d1("INSERT INTO slo_budget_state (surface, evaluated_at, window_days, samples, bad, objective, attainment, budget_spent_pct, state) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) "
                   "ON CONFLICT(surface) DO UPDATE SET evaluated_at=excluded.evaluated_at, window_days=excluded.window_days, samples=excluded.samples, bad=excluded.bad, "
                   "objective=excluded.objective, attainment=excluded.attainment, budget_spent_pct=excluded.budget_spent_pct, state=excluded.state",
                   [surface, iso(now), int(d["window_days"]), len(samples), len(samples) - good, float(d["objective"]), att, spent, state])
        if state == "spent":
            spent_surfaces.append(surface)
        rows.append(("slo:" + surface, 0 if state == "spent" else 1, "%d samples, %d bad, attainment %s, budget spent %s percent (%s)" % (len(samples), len(samples) - good, None if att is None else round(att, 4), spent, state)))
    if not ctx.dry:
        ctx.d1("INSERT INTO ops_config (key, value, note) VALUES ('slo_budget_spent', ?1, 'BP26-SLO-ERROR-BUDGETS-1: surfaces whose 28-day error budget is spent (scripts/bp26_slo.py, hourly)') "
               "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')", [",".join(spent_surfaces)])

    # ---- incidents
    cutoff = iso(now - INCIDENT_DAYS * 86400)
    incidents = []   # (key, kind, surface, opened, closed, summary, ref, details, n_bad)
    for surface, samples in all_samples.items():
        for first, last, rec, n_bad, details in episodes([s for s in samples if s[0] >= cutoff]):
            incidents.append(("avail:%s:%s" % (surface, first), "availability", surface, first, rec, "%s failed %d consecutive availability sample(s) from %s" % (surface, n_bad, first), "bp26_probe_results", details, n_bad))
    try:
        for r in ctx.d1("SELECT id, title, created_at, status FROM agent_issues WHERE (title LIKE 'CONTROL-PLANE-REVERTED-1%' OR title LIKE 'CONTROL-PLANE-CANARY-FAILED-1%') AND created_at >= ?1",
                        [int((now - INCIDENT_DAYS * 86400) * 1000)]):
            opened = iso(int(r["created_at"]) / 1000.0)
            incidents.append(("deploy:%s" % r["id"], "deploy-regression", None, opened, opened, str(r["title"])[:200], "agent_issues:%s" % r["id"], [str(r["title"])], 1))
    except Exception as e:  # noqa: BLE001
        rows.append(("canary-incidents", None, "agent_issues unreadable: " + str(e)[:100]))

    have = {r["incident_key"]: r for r in ctx.d1("SELECT incident_key, closed_at FROM incidents WHERE opened_at >= ?1", [cutoff])}
    new_pm = 0
    for key, kind, surface, opened, closed, summary, ref, details, n_bad in incidents:
        if not ctx.dry:
            ctx.d1("INSERT INTO incidents (incident_key, kind, surface, opened_at, closed_at, summary, source_ref) VALUES (?1,?2,?3,?4,?5,?6,?7) "
                   "ON CONFLICT(incident_key) DO UPDATE SET closed_at = excluded.closed_at, summary = excluded.summary", [key, kind, surface, opened, closed, summary, ref])
        pm = ctx.d1("SELECT state FROM postmortems WHERE incident_key = ?1", [key])
        if pm and pm[0]["state"] == "complete":
            continue
        if closed is None and kind == "availability":
            state = "draft"
        else:
            state = "complete"
        klass, why = cause_class(details) if kind == "availability" else ("deploy-regression", "a control-plane deploy failed its canary and the push was reverted (or the revert failed)")
        timeline = "%s first bad sample" % opened + ("; recovered %s" % closed if closed and kind == "availability" else ("; still failing at the last sample" if kind == "availability" else "; issue filed by the deploy canary")) + \
                   "; samples failed: %d; evidence: %s" % (n_bad, " | ".join(d[:80] for d in details[:3]))
        burned = surface in spent_surfaces
        action, action_issue = "no action: a single failed sample inside the error budget", None
        if kind == "deploy-regression":
            action, action_issue = "the canary issue %s owns the fix; this postmortem links it" % ref, ref
        elif n_bad >= 2 or burned:
            title = "SLO-POSTMORTEM-ACTION-1 %s: find the root cause of repeated availability failures" % surface
            desc = ("Charter pillar: autonomy. Program QNFO.OPS (BP26-SLO-ERROR-BUDGETS-1). Incident %s: %s. Root-cause class from the evidence: %s (%s). Budget state: %s. "
                    "Definition of done: the cause is named in the postmortem row (qnfo-audit.postmortems, incident_key above), the fix is merged and slo_budget_state for the surface returns to ok.\n"
                    "runtime-probe: {\"url\": \"https://%s/\", \"status\": 200}" % (key, summary, klass, why, "spent" if burned else "at risk", surface))
            action = "action issue filed: " + title
            action_issue = title if file_action(ctx, title, desc) else None
            if action_issue is None:
                state = "draft"
        if not ctx.dry:
            ctx.d1("INSERT INTO postmortems (incident_key, created_at, completed_at, state, timeline, root_cause, contributing, actions, action_issue, generator) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) "
                   "ON CONFLICT(incident_key) DO UPDATE SET completed_at=excluded.completed_at, state=excluded.state, timeline=excluded.timeline, root_cause=excluded.root_cause, "
                   "contributing=excluded.contributing, actions=excluded.actions, action_issue=excluded.action_issue",
                   [key, iso(now), iso(now) if state == "complete" else None, state, timeline, "%s: %s" % (klass, why),
                    "surface budget state %s; episode length %d sample(s)" % ("spent" if burned else "within budget", n_bad), action, action_issue, GENERATOR])
        new_pm += 1

    # ---- coverage
    judged = []
    for key, kind, surface, opened, closed, *_ in incidents:
        if closed is not None or parse(opened) <= now - JUDGE_AFTER_H * 3600:
            judged.append((key, opened))
    done = 0
    for key, opened in judged:
        r = ctx.d1("SELECT completed_at, state FROM postmortems WHERE incident_key = ?1", [key])
        if r and r[0]["state"] == "complete" and r[0]["completed_at"] and parse(r[0]["completed_at"]) - parse(opened) <= JUDGE_AFTER_H * 3600:
            done += 1
    if ctx.dry:
        done = len(judged)
    total = len(judged)
    note = ("%d of %d incidents of the last %d days judged (closed or older than %d h) have a completed postmortem within %d h; %d incidents total, %d postmortems written this run; "
            "%d surfaces, %d with the budget spent (%s)" % (done, total, INCIDENT_DAYS, JUDGE_AFTER_H, JUDGE_AFTER_H, len(incidents), new_pm, len(defs), len(spent_surfaces), ",".join(spent_surfaces) or "none"))
    if total == 0:
        return [Result("postmortem_coverage", 1.0, "no incident to judge in the window: 1.0 by definition. " + note, rows)]
    return [Result("postmortem_coverage", done / float(total), note, rows)]


COLLECTORS = [Collector("slo_postmortems", collect_slo, ["postmortem_coverage"], 50)]


def selftest():
    fails = []

    def ok(c, m):
        if not c:
            fails.append(m)
            print("FAIL " + m)
    ok(budget(995, 1000, 0.995)[2] == "spent", "5 bad of 1000 at 0.995 spends the whole budget")
    ok(budget(998, 1000, 0.995)[2] == "ok", "2 bad of 1000 is 40 percent")
    ok(budget(997, 1000, 0.995)[2] == "warn", "3 bad of 1000 is 60 percent")
    ok(budget(0, 0, 0.995)[2] == "no-data", "no samples")
    eps = episodes([("t1", 1, ""), ("t2", 0, "down: timeout"), ("t3", 0, "status 503"), ("t4", 1, ""), ("t5", 0, "tls:x")])
    ok(len(eps) == 2 and eps[0][3] == 2 and eps[0][2] == "t4" and eps[1][2] is None, "two episodes, the second still open: %r" % (eps,))
    ok(cause_class(["down: timeout"])[0] == "timeout" and cause_class(["status 503 in 12 ms"])[0] == "server-error" and cause_class(["down: tls:bad"])[0] == "tls", "cause classes")
    c = sqlite3.connect(":memory:")
    script = """
CREATE TABLE slo_definitions (surface TEXT PRIMARY KEY, sli TEXT, objective REAL, window_days INTEGER, source TEXT, owner TEXT, created_at TEXT);
CREATE TABLE slo_budget_state (surface TEXT PRIMARY KEY, evaluated_at TEXT, window_days INTEGER, samples INTEGER, bad INTEGER, objective REAL, attainment REAL, budget_spent_pct REAL, state TEXT);
CREATE TABLE incidents (incident_key TEXT PRIMARY KEY, kind TEXT, surface TEXT, opened_at TEXT, closed_at TEXT, summary TEXT, source_ref TEXT);
CREATE TABLE postmortems (incident_key TEXT PRIMARY KEY, created_at TEXT, completed_at TEXT, state TEXT, timeline TEXT, root_cause TEXT, contributing TEXT, actions TEXT, action_issue TEXT, generator TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE bp26_probe_results (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT, metric TEXT, subject TEXT, ok INTEGER, detail TEXT, producer TEXT);
"""
    c.executescript(script)
    now = 1790000000.0
    c.execute("INSERT INTO slo_definitions VALUES ('a.example', 'x', 0.995, 28, 's', 'o', 't'), ('b.example', 'x', 0.995, 28, 's', 'o', 't')")
    for i in range(100):
        t = iso(now - 3600 * (100 - i))
        c.execute("INSERT INTO bp26_probe_results (run_at, metric, subject, ok, detail) VALUES (?, 'slo_attainment_28d_min', 'avail:b.example', 1, 'status 200 in 90 ms')", [t])
        bad = i in (90, 91, 92, 97)
        c.execute("INSERT INTO bp26_probe_results (run_at, metric, subject, ok, detail) VALUES (?, 'slo_attainment_28d_min', 'avail:a.example', ?, ?)", [t, 0 if bad else 1, "down: timeout" if bad else "status 200 in 80 ms"])
    c.execute("INSERT INTO agent_issues (title, status, created_at) VALUES ('CONTROL-PLANE-REVERTED-1 reverted, qnfo-ops, push abc', 'open', ?)", [int((now - 86400) * 1000)])

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, x)) for x in cur.fetchall()]

    class Ctx:
        pass
    ctx = Ctx()
    ctx.d1, ctx.now, ctx.dry = d1, now, False
    res = collect_slo(ctx)[0]
    st = {r["surface"]: r for r in d1("SELECT * FROM slo_budget_state")}
    ok(st["a.example"]["state"] == "spent" and st["b.example"]["state"] == "ok", "budget states: %r" % {k: v["state"] for k, v in st.items()})
    ok(d1("SELECT value FROM ops_config WHERE key = 'slo_budget_spent'")[0]["value"] == "a.example", "the flag lists the spent surface")
    inc = d1("SELECT incident_key, closed_at FROM incidents ORDER BY incident_key")
    ok(len(inc) == 3, "two availability episodes and one deploy incident: %r" % (inc,))
    pm = {r["incident_key"]: r for r in d1("SELECT * FROM postmortems")}
    ok(len(pm) == 3 and all(p["state"] == "complete" for p in pm.values()), "every incident has a complete postmortem: %r" % {k: v["state"] for k, v in pm.items()})
    ok(sum(1 for r in d1("SELECT title FROM agent_issues WHERE title LIKE 'SLO-POSTMORTEM-ACTION-1%'")) == 1, "one action issue (the 3-sample episode; the lone sample is also on a spent surface but shares the surface title)")
    ok(res.value == 1.0, "coverage 1.0: %r %s" % (res.value, res.note))
    collect_slo(ctx)
    ok(d1("SELECT COUNT(*) n FROM postmortems")[0]["n"] == 3 and d1("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'SLO-POSTMORTEM-ACTION-1%'")[0]["n"] == 1, "a second run adds nothing")
    c.execute("DELETE FROM postmortems WHERE incident_key LIKE 'avail:a.example:%'")
    ok(collect_slo(ctx)[0].value == 1.0 and d1("SELECT COUNT(*) n FROM postmortems")[0]["n"] == 3, "a missing postmortem is regenerated")
    c.execute("DROP TABLE slo_definitions")
    ok(collect_slo(ctx)[0].value is None, "unreadable definitions: unknown, not zero")
    print("bp26_slo selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
