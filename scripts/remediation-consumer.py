#!/usr/bin/env python3
# REMEDIATION-CONSUMER-1 path shim.
#
# The workflow `.github/workflows/remediation-consumer.yml` invokes
# `scripts/remediation-consumer.py` (HYPHEN). The implementation lives in
# `scripts/remediation_consumer.py` (UNDERSCORE, PEP 8 module name).
#
# MEASURED FAILURE THIS FIXES
#   ci-status/remediation-consumer.json at head ec5d51f2 recorded
#     {"ok": false, "error": "no parseable consumer output:
#      [Errno 2] No such file or directory: '/tmp/remediation-consumer.json'",
#      "job_status": "failure"}
#   Cause: the hyphen path did not exist, so the "Self-test the verdict
#   classifier" step exited 2 (can't open file) and the job stopped before the
#   consumer ever ran. The consumer had never executed a single contract.
#
# This shim executes the real module with __main__ semantics, preserving argv
# (so `--selftest` still reaches the module) and the module's exit code. The
# logic is NOT duplicated here, so the two paths cannot drift.
#
# ADVERSARIAL: a green run from this shim proves the consumer executed and what
# the probes returned. It does NOT prove the fleet is healthy - a contract whose
# probe is not a literal SELECT is skipped by design and its issue stays OPEN.

import os
import runpy
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_TARGET = os.path.join(_HERE, "remediation_consumer.py")

if not os.path.exists(_TARGET):
    sys.stderr.write("remediation-consumer: implementation missing at %s\n" % _TARGET)
    sys.exit(2)

runpy.run_path(_TARGET, run_name="__main__")
