#!/usr/bin/env python3
"""BP26-WORKERS-BP-LINT-1 collector (2026-10-28, charter pillar core; agent_issues 1000348; Workers Best Practices: current compatibility_date).

compat_date_age_days_max: the age in days of the oldest compatibility_date declared by a live worker directory (wrangler.toml or
wrangler.jsonc of this checkout of main). Limits: it reads the declared config, not the deployed script's settings, so a worker whose
config was changed but not yet redeployed reads as current; a live worker with no compatibility_date is reported in the evidence and
counts as the oldest possible only if no dated worker exists (unknown), never as zero. Evidence rows list the oldest workers.

Offline suite: python3 scripts/bp26_compat.py --selftest
"""
import datetime
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

TOML = re.compile(r"^[ \t]*compatibility_date[ \t]*=[ \t]*[\"'](\d{4}-\d{2}-\d{2})[\"']", re.M)
JSON = re.compile(r"\"compatibility_date\"\s*:\s*\"(\d{4}-\d{2}-\d{2})\"")


def declared(cfg):
    m = TOML.search(re.sub(r"(?m)^\s*#.*$", "", cfg)) or JSON.search(cfg)
    return m.group(1) if m else None


def collect_compat(ctx, workers=None):
    if workers is None:
        import bp26_repo
        workers = bp26_repo.live_workers(ctx.root)
    if not workers:
        return [Result("compat_date_age_days_max", None, "no live worker directory found in the checkout", [])]
    now = datetime.datetime.fromtimestamp(getattr(ctx, "now", None) or datetime.datetime.now(datetime.timezone.utc).timestamp(), datetime.timezone.utc).date()
    dated, undated = [], []
    for name, cfg, _ in workers:
        d = declared(cfg)
        if not d:
            undated.append(name)
            continue
        try:
            dated.append((name, d, (now - datetime.date.fromisoformat(d)).days))
        except ValueError:
            undated.append(name)
    if not dated:
        return [Result("compat_date_age_days_max", None, "no live worker declares a compatibility_date", [])]
    dated.sort(key=lambda x: -x[2])
    over = sum(1 for x in dated if x[2] > 90)
    rows = [("worker:" + n, a, "compatibility_date " + d) for n, d, a in dated[:20]]
    rows += [("undated:" + n, None, "no compatibility_date in the config") for n in undated[:20]]
    note = ("oldest declared compatibility_date is %s (%d days, %s); %d of %d dated live workers are over 90 days; %d have no date; read from the checkout's config, not the deployed settings"
            % (dated[0][1], dated[0][2], dated[0][0], over, len(dated), len(undated)))
    return [Result("compat_date_age_days_max", dated[0][2], note, rows)]


COLLECTORS = [Collector("workers_compat_date", collect_compat, ["compat_date_age_days_max"], 55)]


def selftest():
    fails = []

    def ok(c, m):
        if not c:
            fails.append(m)
            print("FAIL " + m)

    class Ctx:
        now = datetime.datetime(2026, 10, 28, tzinfo=datetime.timezone.utc).timestamp()
        root = "."
    ws = [("a", 'name = "a"\ncompatibility_date = "2026-08-01"\n', ""), ("b", '# compatibility_date = "2020-01-01"\ncompatibility_date = "2025-09-01"\n', ""),
          ("c", '{"compatibility_date": "2026-10-01"}', ""), ("d", 'name = "d"\n', "")]
    out = collect_compat(Ctx(), ws)[0]
    ok(out.value == 422, "oldest is 2025-09-01, the commented line is ignored: %r" % (out,))
    ok(any(r[0] == "undated:d" for r in out.rows), "the undated worker is listed, not counted as zero")
    ok(collect_compat(Ctx(), [("d", "", "")])[0].value is None, "no dated worker: unknown")
    ok(collect_compat(Ctx(), [])[0].value is None, "no workers: unknown")
    ok(len(COLLECTORS) == 1, "one collector")
    print("bp26_compat selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
