#!/usr/bin/env python3
"""BP26 collector for claim_coverage (2026-10-28, charter pillar research).

claim_coverage: verified atomic claims / all atomic claims in artifacts published in the last 7 days (claims ledger; target 1.0).

The source this metric needs does not exist: there is no ledger of atomic claims. paper_claim_audits (CLAIM-INTEGRITY-1) records per-paper audits
of fabricated empirical statements only (rules, verdict, candidates), so a ratio from it would measure a different thing; meta_claims is the
kaizen skill-change ledger. Nothing is invented here: the collector reports the metric as unknown (None, never 0) with a note naming the
missing source. When a claims ledger exists, replace collect() with a read of it.

Offline suite: python3 scripts/bp26_claims.py --selftest
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result  # noqa: E402

NOTE = ("unknown: source missing - no atomic-claims ledger exists (paper_claim_audits covers fabricated-empirical rules per paper, "
        "not atomic claims; meta_claims is unrelated)")


def collect(ctx):
    return [Result("claim_coverage", None, NOTE, [])]


COLLECTORS = [Collector("claims_ledger_missing", collect, ["claim_coverage"], 1440)]


def selftest():
    out = collect(None)[0]
    ok = out.metric == "claim_coverage" and out.value is None and "missing" in out.note
    print("bp26_claims selftest %s" % ("ok" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
