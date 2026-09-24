#!/usr/bin/env python3
"""cron_rate_guard.py - CRON-RATE-CEILING-1 enforcement.

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

DAYS = 365
START = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)
MAX_FIRES_24H = 144
MIN_GAP_MINUTES = 10
CF_API = "https://api.cloudflare.com/client/v4"

CRONS_RE = re.compile(r"(?m)^\s*crons\s*=\s*\[(.*?)\]", re.S)
STR_RE = re.compile(r"[\"']([^\"']+)[\"']")


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
    return {
        "fires_per_day": round(len(fires) / float(days), 4),
        "max_fires_24h": max24,
        "min_gap_minutes": min_gap,
    }


def violates(stats):
    """True when a single cron expression breaks either clause of the ceiling."""
    if stats.get("max_fires_24h", 0) > MAX_FIRES_24H:
        return "MAX_FIRES_24H>%d" % MAX_FIRES_24H
    gap = stats.get("min_gap_minutes")
    if gap is not None and gap < MIN_GAP_MINUTES:
        return "GAP<%dmin" % MIN_GAP_MINUTES
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


def audit_repo(root, strict_worker=False):
    report = {"violations": [], "warnings": [], "workers": 0, "expressions": 0}
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
        report["workers"] += 1
        combined = []
        for cron in crons:
            report["expressions"] += 1
            try:
                stats = cron_stats(cron_fires(cron))
            except Exception as exc:  # unparseable expression fails closed
                report["violations"].append(
                    {"worker": name, "cron": cron, "reason": "PARSE:%s" % exc})
                continue
            combined.extend(cron_fires(cron))
            reason = violates(stats)
            if reason:
                report["violations"].append(
                    dict({"worker": name, "cron": cron, "reason": reason}, **stats))
        if len(crons) > 1 and combined:
            agg = cron_stats(sorted(combined))
            gap = agg.get("min_gap_minutes")
            if gap is not None and gap < MIN_GAP_MINUTES:
                rec = {"worker": name, "crons": crons, "aggregate": agg,
                       "reason": "AGGREGATE_GAP<%dmin" % MIN_GAP_MINUTES}
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
    report = {"violations": [], "warnings": [], "workers": 0, "expressions": 0}
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
        for cron in crons:
            report["expressions"] += 1
            try:
                stats = cron_stats(cron_fires(cron))
            except Exception as exc:
                report["violations"].append(
                    {"worker": name, "cron": cron, "reason": "PARSE:%s" % exc})
                continue
            combined.extend(cron_fires(cron))
            reason = violates(stats)
            if reason:
                report["violations"].append(
                    dict({"worker": name, "cron": cron, "reason": reason}, **stats))
        if len(crons) > 1 and combined:
            agg = cron_stats(sorted(combined))
            gap = agg.get("min_gap_minutes")
            if gap is not None and gap < MIN_GAP_MINUTES:
                report["warnings"].append(
                    {"worker": name, "crons": crons, "aggregate": agg,
                     "reason": "AGGREGATE_GAP<%dmin" % MIN_GAP_MINUTES})
    return report


def render(report, source):
    lines = ["cron-rate ceiling (%d fires/24h, %d-minute spacing) -- source: %s"
             % (MAX_FIRES_24H, MIN_GAP_MINUTES, source),
             "audited %d workers / %d cron expressions"
             % (report["workers"], report["expressions"])]
    for v in report["violations"]:
        lines.append("  VIOLATION %s  cron=%s  %s" % (v.get("worker"), v.get("cron"),
                                                     v.get("reason")))
    for w in report["warnings"]:
        lines.append("  WARN      %s  crons=%s  %s" % (w.get("worker"), w.get("crons"),
                                                      w.get("reason")))
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

    failed = any(r["violations"] for r in reports.values())
    if args.json:
        print(json.dumps({"ok": not failed, "reports": reports}, indent=2))
    else:
        for source, rep in reports.items():
            print(render(rep, source))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
