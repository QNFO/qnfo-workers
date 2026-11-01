#!/usr/bin/env python3
"""cron_rate_guard.py - CRON-RATE-CEILING-1 enforcement.

OWNER DIRECTIVE (2026-10-18) - TEMPO-120M-5M-1
  "No time-related metric or schedule shall ever exceed 120 minutes, and heartbeat/tick
   time/tempo shall increase to a maximum of once every 5 minutes."
  Two readings, both enforced here:
    * HEARTBEAT workers (fleet-exec dispatch tick, qnfo-fleet-control fast lane,
      qnfo-code-orchestrator) must fire at least every 5 minutes -- a slower trigger fails.
    * every other declared cron must fire at least every 120 minutes. Producers that are
      still on a daily/weekly period are listed as TEMPO entries (visible in every run) and
      are being migrated in tracked work; they are not silently ignored.

OWNER DIRECTIVE (2026-09-23)
  No Cloudflare quniverse worker cron shall execute more than once every 10 minutes,
  and not more than 144 times in any 24-hour period.

WHY
  144 == 24*60/10: the two clauses are the same invariant stated two ways. Cloudflare's
  own floor for Workers cron is one minute, so nothing upstream stops a `*/5` or `* * * * *`
  from being applied -- the ceiling has to be enforced by us. A cron finer than 10 minutes
  multiplies invocations, AI/neuron spend, D1 writes and rate-limit exposure with no
  diagnostic gain. Canonical violations at issue time (2026-09-23):
    - qnfo-calendar-intake  `*/5 * * * *`  288 fires/24h, 5-minute spacing  (LIVE + repo)
    - vault-indexer         `*/5 * * * *`  288 fires/24h, 5-minute spacing  (LIVE + repo)
    - qnfo-email            `*/5 * * * *`  repo-only latent (LIVE was already 0 7 * * *)

WHAT (fail-closed)
  Statically evaluates every `crons = [...]` declaration under */wrangler.toml:
    fires_per_day  mean fires per day over a 365-day simulation
    max_fires_24h  worst-case fires inside any rolling 24-hour window
    min_gap_minutes  smallest spacing between consecutive fires (circular, wrap included)
  FAILS (exit 1) when any single cron expression exceeds 144 fires/24h OR is spaced
  closer than 10 minutes.
  WARNS (exit unchanged) when a WORKER's crons combined fall inside 10 minutes -- two
  triggers landing on the same minute, or (canonically) jnl-pipeline's `23 */2` and
  `*/30` producing a 7-minute spacing. Pass --strict-worker to escalate those to failures.
  Also audits .github/workflows schedule triggers: one run per rolling 24 hours by
  default, with named limits for the hourly assignment backfill and 6-hour IndexNow fallback.

USAGE
  python3 scripts/cron_rate_guard.py                   # sweep ./<worker>/wrangler.toml
  python3 scripts/cron_rate_guard.py --root .          # explicit root
  python3 scripts/cron_rate_guard.py --strict-worker   # aggregate warnings become failures
  python3 scripts/cron_rate_guard.py --live            # also audit LIVE CF schedules
  python3 scripts/cron_rate_guard.py --json            # machine-readable report

  --live needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.

EXIT  0 compliant | 1 violation(s) | 2 usage error
"""
import argparse
import datetime as _dt
import json
import os
import re
import sys
import urllib.request

# CRON-TICK-5M-1 (2026-10-19, owner directive): 5-minute spacing and 288 fires/24h are the
# ceiling (was 10/144), and no cron may be slower than hourly (producer floor 120 -> 60).
DAYS = 365
START = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)
MAX_FIRES_24H = 288
MIN_GAP_MINUTES = 5
# TEMPO-120M-5M-1: the slow side of the same policy.
PRODUCER_MAX_GAP_MINUTES = 60
# CRON-MANDATE-1 (0.45.4, 2026-10-25) caps every Quniverse cron at 144 fires/24h and 10-minute spacing, and
# qnfo-fleet-control's wrangler.toml was moved from */5 to */10 to comply. A heartbeat bound of 5 minutes then
# demanded a cadence the binding mandate forbids, so the worker could satisfy EITHER the guard OR the mandate and
# never both - the sweep failed on every push to main while the schedule was correct. The bound is the SLOW side of
# the same policy ("a heartbeat must tick at least this often"), so it follows the mandate's 10-minute floor: a
# heartbeat worker that drifts to hourly still fails, a worker ticking at the mandated 10 minutes passes.
# NOTE: the OWNER_OVERRIDES below still permit */5 (fleet-exec) and */2 (qnfo-code-orchestrator), which are FASTER
# than CRON-MANDATE-1 allows. That conflict predates this change and is recorded, not silently resolved here.
HEARTBEAT_MAX_GAP_MINUTES = 10
HEARTBEAT_WORKERS = ("fleet-exec", "qnfo-fleet-control", "qnfo-code-orchestrator")

# ---- OWNER OVERRIDES (2026-10-17) -----------------------------------------------------------------
# The owner re-issued the directive twice on 2026-10-17 -- "MAKE TICKS FASTER" and then "MORE PARALLEL
# WORKERS, FASTER TICKS, MORE THROUGHPUT/OUTPUT/RESOLVED" -- after being shown this ceiling, the 1-2
# tasks-per-tick measurement and the fact that 144 fires/day was the binding constraint. A ceiling the
# owner cannot lift is not a ceiling, it is a wall, so the exception is explicit, per worker, dated and
# bounded: anything not named here still meets 144/24h and 10-minute spacing, and an entry is removed
# by deleting it. Each entry states WHO asked, WHEN, and WHY.
#
# qnfo-code-orchestrator is the code loop: it turns agent_issues rows into verified patches. Its SQL is
# small (one claim, one step, one save per lane) and its spend is metered separately by the worker's own
# daily model-call cap, so a one-minute trigger does not multiply unbounded cost.
# TEMPO-120M-5M-1 (2026-10-18): the heartbeat/tick ceiling is 5 minutes, so the two workers that
# ARE the tick carry a 5-minute exception to the 10-minute ceiling. Both are metered: fleet-exec
# runs one claim + one step per due fleet_crons row; fleet-control's fast lane is grid-gated
# (20-minute steps stay on a true 20-minute grid). Removing an entry restores the 10-minute ceiling.
OWNER_OVERRIDES = {
    "fleet-exec": {
        "min_gap_minutes": 5,
        "max_fires_24h": 300,   # */5 = 288 fires/day, plus headroom for the circular window
        "owner_directive": "2026-10-18: heartbeat/tick tempo shall not exceed 5 minutes",
    },
    "qnfo-fleet-control": {
        "min_gap_minutes": 5,
        "max_fires_24h": 300,
        "owner_directive": "2026-10-18: heartbeat/tick tempo shall not exceed 5 minutes",
    },
    "qnfo-code-orchestrator": {
        "min_gap_minutes": 1,
        "max_fires_24h": 730,   # */2 = 720 fires/day, plus headroom for the circular window
        "owner_directive": "2026-10-17: MORE PARALLEL WORKERS, FASTER TICKS, MORE THROUGHPUT/OUTPUT/RESOLVED",
    },
}


# CRON-GRID-1 (2026-10-19, owner directive: "ALL CRON TICKS SHALL BE MEASURED IN 5-MINUTE INTERVALS, AND NO CRON SHALL
# EXECUTE LESS THAN ONCE EVERY HOUR").
#   GRID     a fire lands on a minute that is not a multiple of 5 (a worker whose override allows a sub-5-minute gap,
#            qnfo-code-orchestrator */2, is measured in 5-minute buckets and exempt).
#   TEMPO    a cron slower than hourly fails through CRON-HOURLY-FLOOR-1 (scripts/cron-tempo-allowlist.txt, shrink-only).
#            A daily or weekly job keeps its cadence inside the worker (CRON-GRID-1 cronGridRun on an hourly trigger).
GRID_MINUTES = 5


def off_grid(worker, fires):
    """CRON-GRID-1: the first fire minute that is not on the 5-minute grid, or None."""
    if limits_for(worker)[1] < GRID_MINUTES:
        return None
    for f in fires:
        if (f % 60) % GRID_MINUTES:
            return f % 60
    return None


def limits_for(worker):
    """(max_fires_24h, min_gap_minutes) for a worker, honouring a named owner override."""
    o = OWNER_OVERRIDES.get(worker) or {}
    return (int(o.get("max_fires_24h", MAX_FIRES_24H)), int(o.get("min_gap_minutes", MIN_GAP_MINUTES)))
CF_API = "https://api.cloudflare.com/client/v4"

CRONS_RE = re.compile(r"(?m)^\s*crons\s*=\s*\[(.*?)\]", re.S)
STR_RE = re.compile(r"[\"']([^\"']+)[\"']")
ACTIONS_SCHEDULE_MAX_FIRES_24H = 1
ACTIONS_SCHEDULE_OVERRIDES = {
    # The event and workflow_run triggers are primary; the hourly cron is a bounded backfill.
    "assign-copilot-on-issue.yml": {
        "max_fires_24h": 24,
        "reason": "hourly bounded assignment backfill",
    },
    # Independent GitHub-egress fallback for IndexNow complements the worker submission path.
    "indexnow-fallback.yml": {
        "max_fires_24h": 4,
        "reason": "6-hour independent IndexNow fallback",
    },
}


def expand(field, lo, hi):
    """Expand one cron field into the set of integers it matches."""
    out = set()
    for part in str(field).split(","):
        part = part.strip()
        if not part:
            continue
        step = 1
        if "/" in part:
            part, raw = part.split("/", 1)
            try:
                step = int(raw)
            except ValueError:
                step = 1
            if step <= 0:
                step = 1
        if part == "*":
            a, b = lo, hi
        elif "-" in part:
            x, y = part.split("-", 1)
            a, b = int(x), int(y)
        else:
            a = int(part)
            b = hi if step > 1 else a
        out.update(range(a, b + 1, step))
    return out


def cron_fires(cron, days=DAYS, start=START):
    """Return minute offsets (day*1440 + h*60 + m) at which `cron` fires in the window."""
    fields = cron.split()
    if len(fields) != 5:
        raise ValueError("expected 5 cron fields, got %d: %r" % (len(fields), cron))
    mi, ho, dom, mo, dow = fields
    mins = expand(mi, 0, 59)
    hours = expand(ho, 0, 23)
    months = expand(mo, 1, 12)
    doms = expand(dom, 1, 31)
    dows = expand(dow.replace("7", "0"), 0, 6)
    dom_r, dow_r = dom != "*", dow != "*"
    fires = []
    for d in range(days):
        dt = start + _dt.timedelta(days=d)
        if dt.month not in months:
            continue
        cdow = (dt.weekday() + 1) % 7  # cron: 0 = Sunday
        if dom_r and dow_r:
            day_ok = (dt.day in doms) or (cdow in dows)
        elif dom_r:
            day_ok = dt.day in doms
        elif dow_r:
            day_ok = cdow in dows
        else:
            day_ok = True
        if not day_ok:
            continue
        for h in hours:
            for m in mins:
                fires.append(d * 1440 + h * 60 + m)
    return sorted(fires)


def cron_stats(fires, days=DAYS):
    """max_fires_24h (rolling window) + min_gap_minutes (circular) for a fire list."""
    if not fires:
        return {"fires_per_day": 0.0, "max_fires_24h": 0, "min_gap_minutes": None}
    span = days * 1440
    circ = list(fires) + [x + span for x in fires]
    max24 = 0
    right = 0
    for left in range(len(circ)):
        if right < left:
            right = left
        while right < len(circ) and circ[right] - circ[left] < 1440:
            right += 1
        if right - left > max24:
            max24 = right - left
    min_gap = min(circ[i] - circ[i - 1] for i in range(1, len(circ)))
    # TEMPO-120M-5M-1: the largest spacing between consecutive fires, circular (no wrap artefact).
    max_gap = max(circ[i] - circ[i - 1] for i in range(1, len(circ)))
    return {
        "fires_per_day": round(len(fires) / float(days), 4),
        "max_fires_24h": max24,
        "min_gap_minutes": min_gap,
        "max_gap_minutes": max_gap,
    }


def slow_reason(worker, stats):
    """TEMPO-120M-5M-1: why a PRODUCER cron is too slow, or None.

    Every declared cron is a producer of its own work and must fire at least every 120 minutes.
    The 5-minute rule is a WORKER-level rule (heartbeat_reason): a heartbeat worker must carry
    at least one trigger at 5-minute tempo; its other triggers keep their own period.
    """
    gap = stats.get("max_gap_minutes")
    if gap is None:
        return None
    if gap > PRODUCER_MAX_GAP_MINUTES:
        return "MAX_GAP>%dmin" % PRODUCER_MAX_GAP_MINUTES
    return None


def heartbeat_reason(worker, gaps):
    """TEMPO-120M-5M-1: why a heartbeat worker has no 5-minute tick, or None."""
    if worker not in HEARTBEAT_WORKERS:
        return None
    fast = [g for g in gaps if g is not None]
    if fast and min(fast) <= HEARTBEAT_MAX_GAP_MINUTES:
        return None
    return "NO_TICK<=%dmin (fastest fire every %s min)" % (
        HEARTBEAT_MAX_GAP_MINUTES, min(fast) if fast else "never")


def violates(stats, limits=None):
    """True when a single cron expression breaks either clause of the ceiling.

    `limits` is (max_fires_24h, min_gap_minutes); omit it for the default ceiling. Pass
    `limits_for(worker)` to honour a named OWNER_OVERRIDES entry.
    """
    max_fires, min_gap_min = limits or (MAX_FIRES_24H, MIN_GAP_MINUTES)
    if stats.get("max_fires_24h", 0) > max_fires:
        return "MAX_FIRES_24H>%d" % max_fires
    gap = stats.get("min_gap_minutes")
    if gap is not None and gap < min_gap_min:
        return "GAP<%dmin" % min_gap_min
    return None


def toml_crons(path):
    """Every cron expression declared in a wrangler.toml `crons = [...]` array."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            txt = fh.read()
    except OSError:
        return []
    out = []
    for m in CRONS_RE.finditer(txt):
        out.extend(s.strip() for s in STR_RE.findall(m.group(1)) if s.strip())
    return out


def workflow_crons(path):
    """Cron expressions under a GitHub Actions workflow's top-level `on.schedule`."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except OSError:
        return []
    in_on = False
    schedule_indent = None
    out = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        if indent == 0:
            in_on = bool(re.fullmatch(r"""(?:on|'on'|"on")\s*:\s*(?:#.*)?""", stripped))
            schedule_indent = None
            continue
        if not in_on:
            continue
        if schedule_indent is not None and indent <= schedule_indent:
            schedule_indent = None
        if schedule_indent is None:
            if re.fullmatch(r"schedule\s*:\s*(?:#.*)?", stripped):
                schedule_indent = indent
            continue
        match = re.match(r"^-\s*cron\s*:\s*(.*?)\s*$", stripped)
        if match:
            value = match.group(1).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            else:
                value = value.split("#", 1)[0].strip()
            if value:
                out.append(value)
    return out


def audit_actions_schedules(root):
    """Enforce the per-workflow GitHub Actions schedule ceiling."""
    report = {"workflows": 0, "expressions": 0, "violations": []}
    workflow_dir = os.path.join(root, ".github", "workflows")
    try:
        paths = sorted(
            os.path.join(workflow_dir, name)
            for name in os.listdir(workflow_dir)
            if name.endswith((".yml", ".yaml"))
        )
    except OSError:
        return report
    for path in paths:
        crons = workflow_crons(path)
        if not crons:
            continue
        name = os.path.basename(path)
        report["workflows"] += 1
        report["expressions"] += len(crons)
        fires = []
        parse_errors = []
        for cron in crons:
            try:
                fires.extend(cron_fires(cron))
            except Exception as exc:
                parse_errors.append({"workflow": name, "cron": cron, "reason": "PARSE:%s" % exc})
        report["violations"].extend(parse_errors)
        if parse_errors:
            continue
        stats = cron_stats(sorted(fires))
        override = ACTIONS_SCHEDULE_OVERRIDES.get(name)
        limit = int((override or {}).get("max_fires_24h", ACTIONS_SCHEDULE_MAX_FIRES_24H))
        if stats["max_fires_24h"] > limit:
            reason = "ACTIONS_DAILY_CEILING>%d" % limit
            if override:
                reason += " (%s)" % override["reason"]
            report["violations"].append(
                dict({"workflow": name, "crons": crons, "reason": reason, "limit": limit}, **stats)
            )
    return report


TEMPO_ALLOWLIST = os.path.join("scripts", "cron-tempo-allowlist.txt")


def load_tempo_allowlist(path):
    """CRON-HOURLY-FLOOR-1: {(worker, cron): (expires 'YYYY-MM-DD', tracking)} from worker|cron|expires|tracking lines."""
    out = {}
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return out
    for ln in lines:
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        parts = [x.strip() for x in ln.split("|")]
        if len(parts) >= 3:
            out[(parts[0], parts[1])] = (parts[2], parts[3] if len(parts) > 3 else "")
    return out


def apply_tempo_allowlist(report, allow, today):
    """CRON-HOURLY-FLOOR-1 (owner directive 2026-10-19: no cron shall execute less than once every hour).

    A producer slower than hourly fails unless it is on the allowlist and the entry has not expired. The list is
    shrink-only: an entry that no longer matches a slow cron is a violation until its line is removed, so a
    converted worker cannot be silently re-slowed and a new slow cron cannot ride on an old entry.
    """
    seen = set()
    for t in report.get("tempo") or []:
        key = (t.get("worker"), t.get("cron"))
        seen.add(key)
        hit = allow.get(key)
        if hit is None:
            report["violations"].append(dict(t, reason="SLOW-PRODUCER %s: fire at least hourly (owner directive 2026-10-19) "
                                              "or gate the heavy work inside the handler; not on %s" % (t.get("reason"), TEMPO_ALLOWLIST)))
        elif hit[0] < today:
            report["violations"].append(dict(t, reason="TEMPO-ALLOWLIST-EXPIRED %s (tracking %s): convert it" % (hit[0], hit[1] or "none")))
        else:
            t["allowlisted_until"] = hit[0]
            t["tracking"] = hit[1]
    for key in sorted(allow):
        if key not in seen:
            report["violations"].append({"worker": key[0], "cron": key[1],
                                         "reason": "STALE-TEMPO-ALLOWLIST-ENTRY: no such slow cron any more; remove the line from %s" % TEMPO_ALLOWLIST})
    return report


def audit_repo(root, strict_worker=False):
    actions = audit_actions_schedules(root)
    report = {
        "violations": list(actions["violations"]),
        "warnings": [],
        "tempo": [],
        "workers": 0,
        "expressions": 0,
        "actions": actions,
    }
    for name in sorted(os.listdir(root)):
        wdir = os.path.join(root, name)
        if name.startswith(".") or not os.path.isdir(wdir):
            continue
        wtoml = os.path.join(wdir, "wrangler.toml")
        if not os.path.isfile(wtoml):
            continue
        crons = toml_crons(wtoml)
        if not crons:
            continue
        # CRON-HOURLY-FLOOR-1 (2026-10-19): a RETIRED or FOLDED directory is never deployed by the canonical
        # path, so its declared crons do not execute (24 of the 34 directories with a slow cron on 2026-10-19).
        # Counting them made the migration look three times bigger than it is and hid the 11 live workers.
        marker = [m for m in ("RETIRED", "FOLDED") if os.path.exists(os.path.join(wdir, m))]
        # A worker the guard names as a heartbeat or an owner override is live whatever its directory says: fleet-exec
        # carries a stale FOLDED file but is the live 5-minute dispatcher (service_registry state live, 2026-10-19), so
        # its cron rules keep applying.
        if marker and name not in HEARTBEAT_WORKERS and name not in OWNER_OVERRIDES:
            report.setdefault("not_deployed", []).append({"worker": name, "marker": marker[0], "crons": crons})
            continue
        report["workers"] += 1
        lim = limits_for(name)
        if name in OWNER_OVERRIDES:
            report.setdefault("overrides", []).append({"worker": name, "limits": lim,
                                                       "owner_directive": OWNER_OVERRIDES[name]["owner_directive"]})
        combined = []
        gaps_seen = []
        for cron in crons:
            report["expressions"] += 1
            try:
                stats = cron_stats(cron_fires(cron))
            except Exception as exc:  # unparseable expression fails closed
                report["violations"].append(
                    {"worker": name, "cron": cron, "reason": "PARSE:%s" % exc})
                continue
            combined.extend(cron_fires(cron))
            reason = violates(stats, lim)
            if reason:
                report["violations"].append(
                    dict({"worker": name, "cron": cron, "reason": reason}, **stats))
            slow = slow_reason(name, stats)
            if slow:
                # TEMPO-120M-5M-1: a producer above 120 minutes is a migration item: listed in
                # every run (visible, never silent) and failing under --tempo-strict.
                report.setdefault("tempo", []).append(
                    dict({"worker": name, "cron": cron, "reason": slow}, **stats))
            og = off_grid(name, cron_fires(cron, days=8))
            if og is not None:
                report["violations"].append({"worker": name, "cron": cron, "reason": "GRID: fires at minute %d, not a multiple of %d" % (og, GRID_MINUTES)})
            gaps_seen.append(stats.get("max_gap_minutes"))
        hb = heartbeat_reason(name, gaps_seen)
        if hb:
            report["violations"].append({"worker": name, "crons": crons, "reason": hb})
        if len(crons) > 1 and combined:
            agg = cron_stats(sorted(combined))
            gap = agg.get("min_gap_minutes")
            if gap is not None and gap < lim[1]:
                rec = {"worker": name, "crons": crons, "aggregate": agg,
                       "reason": "AGGREGATE_GAP<%dmin" % lim[1]}
                if strict_worker:
                    report["violations"].append(rec)
                else:
                    report["warnings"].append(rec)
    return report


def _cf_get(path, token):
    req = urllib.request.Request(CF_API + path,
                                 headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def audit_live():
    """Audit the LIVE Cloudflare schedules -- the closed-loop re-probe."""
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    if not token or not account:
        raise SystemExit("--live needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID")
    listing = _cf_get("/accounts/%s/workers/scripts" % account, token)
    if not listing.get("success"):
        raise SystemExit("CF list failed: %s" % listing.get("errors"))
    report = {"violations": [], "warnings": [], "tempo": [], "workers": 0, "expressions": 0}
    for script in listing.get("result") or []:
        name = script.get("id")
        try:
            sched = _cf_get(
                "/accounts/%s/workers/scripts/%s/schedules" % (account, name), token)
        except Exception as exc:
            report["violations"].append({"worker": name, "reason": "SCHED_FETCH:%s" % exc})
            continue
        if not sched.get("success"):
            report["violations"].append(
                {"worker": name, "reason": "SCHED_API:%s" % sched.get("errors")})
            continue
        crons = [s.get("cron") for s in ((sched.get("result") or {}).get("schedules") or [])]
        crons = [c for c in crons if c]
        if not crons:
            continue
        report["workers"] += 1
        combined = []
        gaps_seen = []
        lim = limits_for(name)
        for cron in crons:
            report["expressions"] += 1
            try:
                stats = cron_stats(cron_fires(cron))
            except Exception as exc:
                report["violations"].append(
                    {"worker": name, "cron": cron, "reason": "PARSE:%s" % exc})
                continue
            combined.extend(cron_fires(cron))
            reason = violates(stats, lim)
            if reason:
                report["violations"].append(
                    dict({"worker": name, "cron": cron, "reason": reason}, **stats))
            slow = slow_reason(name, stats)
            if slow:
                # TEMPO-120M-5M-1: a producer above 120 minutes is a migration item: listed in
                # every run (visible, never silent) and failing under --tempo-strict.
                report.setdefault("tempo", []).append(
                    dict({"worker": name, "cron": cron, "reason": slow}, **stats))
            og = off_grid(name, cron_fires(cron, days=8))
            if og is not None:
                report["violations"].append({"worker": name, "cron": cron, "reason": "GRID: fires at minute %d, not a multiple of %d" % (og, GRID_MINUTES)})
            gaps_seen.append(stats.get("max_gap_minutes"))
        hb = heartbeat_reason(name, gaps_seen)
        if hb:
            report["violations"].append({"worker": name, "crons": crons, "reason": hb})
        if len(crons) > 1 and combined:
            agg = cron_stats(sorted(combined))
            gap = agg.get("min_gap_minutes")
            if gap is not None and gap < lim[1]:
                report["warnings"].append(
                    {"worker": name, "crons": crons, "aggregate": agg,
                     "reason": "AGGREGATE_GAP<%dmin" % lim[1]})
    return report


def render(report, source):
    lines = ["cron-rate ceiling (%d fires/24h, %d-minute spacing) -- source: %s"
             % (MAX_FIRES_24H, MIN_GAP_MINUTES, source),
             "audited %d workers / %d cron expressions"
             % (report["workers"], report["expressions"])]
    actions = report.get("actions") or {}
    lines.append("audited %d Actions workflows / %d scheduled cron expressions (default ceiling: %d/day)"
                 % (actions.get("workflows", 0), actions.get("expressions", 0),
                    ACTIONS_SCHEDULE_MAX_FIRES_24H))
    for o in report.get("overrides") or []:
        lines.append("  OVERRIDE  %s  limits=%s  %s"
                     % (o.get("worker"), o.get("limits"), o.get("owner_directive")))
    for v in report["violations"]:
        subject = v.get("worker") or v.get("workflow")
        lines.append("  VIOLATION %s  cron=%s  %s" % (subject, v.get("cron") or v.get("crons"),
                                                     v.get("reason")))
    for w in report["warnings"]:
        lines.append("  WARN      %s  crons=%s  %s" % (w.get("worker"), w.get("crons"),
                                                      w.get("reason")))
    for t in report.get("tempo") or []:
        lines.append("  TEMPO     %s  cron=%s  %s (max_gap=%s min) -- %s"
                     % (t.get("worker"), t.get("cron"), t.get("reason"), t.get("max_gap_minutes"),
                        ("allowlisted until %s (%s)" % (t.get("allowlisted_until"), t.get("tracking") or "no tracking")
                         if t.get("allowlisted_until") else "NOT ALLOWLISTED")))
    for n in report.get("not_deployed") or []:
        lines.append("  SKIPPED   %s  (%s: never deployed, its crons do not run)" % (n.get("worker"), n.get("marker")))
    if not report["violations"]:
        lines.append("  OK - no cron exceeds the ceiling")
    return "\n".join(lines)


def main(argv):
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--root", default=os.getcwd())
    ap.add_argument("--strict-worker", action="store_true")
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv[1:])

    reports = {}
    if args.live:
        reports["live"] = audit_live()
    else:
        reports["repo"] = audit_repo(args.root, args.strict_worker)
        today = os.environ.get("CRON_GUARD_TODAY") or _dt.date.today().isoformat()
        apply_tempo_allowlist(reports["repo"], load_tempo_allowlist(os.path.join(args.root, TEMPO_ALLOWLIST)), today)

    failed = any(r["violations"] for r in reports.values())
    if args.json:
        print(json.dumps({"ok": not failed, "reports": reports}, indent=2))
    else:
        for source, rep in reports.items():
            print(render(rep, source))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
