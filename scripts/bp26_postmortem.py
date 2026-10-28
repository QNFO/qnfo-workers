#!/usr/bin/env python3
"""BP26 collector for postmortem_coverage (2026-10-28, charter pillar autonomy).

postmortem_coverage: incidents in the last 30 days with a completed postmortem within 72 hours / all incidents (target 1.0).

The source this metric needs does not exist: no incident table and no postmortem table appear in migrations/ or any worker.js (the catalogue
row itself says "incident and postmortem tables (to build)"). Nothing is invented here: the collector reports the metric as unknown (None,
never 0) with a note naming the missing source, so the gap stays visible until the source is built. agent_issues is not an incident ledger
and is not used as a stand-in. When the tables exist, replace collect() with a read of them.

Offline suite: python3 scripts/bp26_postmortem.py --selftest
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

NOTE = "unknown: source missing - no incident or postmortem table exists (catalogue: 'to build')"


def collect(ctx):
    return [Result("postmortem_coverage", None, NOTE, [])]


COLLECTORS = [Collector("postmortem_source_missing", collect, ["postmortem_coverage"], 1440)]


def selftest():
    out = collect(None)[0]
    ok = out.metric == "postmortem_coverage" and out.value is None and "missing" in out.note
    print("bp26_postmortem selftest %s" % ("ok" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
