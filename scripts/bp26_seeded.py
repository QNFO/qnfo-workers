#!/usr/bin/env python3
"""BP26 collector for seeded_false_claim_catch_rate (2026-10-28, charter pillar research).

seeded_false_claim_catch_rate: seeded known-false claims blocked by the verifiers / all seeded, last 7 days (target 1.0).

The source this metric needs does not exist: no harness seeds known-false claims into the verifiers and no table records the outcome. Nothing is
invented here: the collector reports the metric as unknown (None, never 0) with a note naming the missing source. When a seeding harness and its
result table exist, replace collect() with a read of it.

Offline suite: python3 scripts/bp26_seeded.py --selftest
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

NOTE = "unknown: source missing - no seeded-false-claim harness or result table exists"


def collect(ctx):
    return [Result("seeded_false_claim_catch_rate", None, NOTE, [])]


COLLECTORS = [Collector("seeded_harness_missing", collect, ["seeded_false_claim_catch_rate"], 1440)]


def selftest():
    out = collect(None)[0]
    ok = out.metric == "seeded_false_claim_catch_rate" and out.value is None and "missing" in out.note
    print("bp26_seeded selftest %s" % ("ok" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
