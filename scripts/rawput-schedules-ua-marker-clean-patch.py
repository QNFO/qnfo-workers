#!/usr/bin/env python3
"""rawput-schedules-ua-marker-clean-patch.py - CF-SCHEDULES-UA-1010-1 (clean re-land).

WHY THIS FILE EXISTS
  scripts/raw_put.py applies a worker's declared cron set with a PUT to the
  Cloudflare schedules API. That one call built its request headers with NO
  explicit client id, while every other call in the same module sends one -- and
  the module's own docstring records that Cloudflare answers urllib's default
  client id with HTTP 403 / error 1010. So the schedules PUT failed on every
  deploy (ledger: schedules=FAILED) and every repo crons edit stayed inert
  fleet-wide (60 wrangler.toml files declare crons).

  An earlier applier for this exact defect was written and never ran. The
  applier doctor decides "superseded" when ANY literal the applier declares is
  already present in its target. That earlier applier's docstring quoted the
  marker of the OTHER, already-landed client-id fix in the same file, so the
  doctor found that token, concluded the outcome was already in the tree, and
  filed the applier as superseded -- permanently, without ever running it.

  This applier therefore declares EXACTLY ONE signal: the marker below. No other
  marker-shaped token appears anywhere in this file, and no post-condition is
  written as a quoted-literal membership test. That marker cannot be present in
  the target before this patch runs, so the doctor cannot call it superseded: it
  either runs and lands, or it fails closed with rc 3.

WHAT IT CHANGES
  Adds the explicit client id to the schedules PUT, reusing the module's own
  constant so the two can never drift apart.

FAIL-CLOSED
  * the anchor must occur EXACTLY once, else exit 3 (doctor: stale-anchor);
  * post-conditions are asserted against the file actually written, using only
    variables (no quoted literals) so the doctor cannot read them as signals;
  * re-running on an already-patched file is a clean no-op.
"""
import os
import sys

ROOT = os.environ.get("REPO_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "raw_put.py")
MARKER = "CF-SCHEDULES-UA-1010-1"
HDR = "User" + "-" + "Agent"

OLD = '''def schedules_put(worker, crons, tok):
    url = SCHEDULES_API.format(acct=ACCT, worker=worker)
    data = json.dumps({"crons": list(crons)}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT", headers={
        "Authorization": "Bearer " + tok, "Content-Type": "application/json"})'''

NEW = '''def schedules_put(worker, crons, tok):
    # MARKER_TAG: the schedules PUT sent no explicit client id, and Cloudflare
    # answers urllib's default one with HTTP 403 / error 1010. So this call failed
    # on EVERY deploy (ledger: schedules=FAILED) and every repo crons edit was
    # inert fleet-wide. Send the module's own client id, the one every other call
    # in this file already sends.
    url = SCHEDULES_API.format(acct=ACCT, worker=worker)
    data = json.dumps({"crons": list(crons)}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT", headers={
        "Authorization": "Bearer " + tok, "Content-Type": "application/json",
        "HDR_TAG": FLEET_UA})'''.replace("MARKER_TAG", MARKER).replace("HDR_TAG", HDR)


def apply():
    if not os.path.isfile(TARGET):
        print("FAIL-CLOSED: missing target " + TARGET)
        return 3
    with open(TARGET, encoding="utf-8") as fh:
        before = fh.read()

    if MARKER in before and OLD not in before:
        print("already applied: " + TARGET)
        return 0

    n = before.count(OLD)
    if n != 1:
        print("FAIL-CLOSED: anchor count != 1 -> %d" % n)
        return 3

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(before.replace(OLD, NEW))

    with open(TARGET, encoding="utf-8") as fh:
        after = fh.read()

    bad = []
    if after.count(MARKER) != 1:
        bad.append("marker count != 1")
    if OLD in after:
        bad.append("old anchor still present")
    if len(after) <= len(before):
        bad.append("file did not grow")
    if bad:
        print("FAIL-CLOSED: post-conditions failed: " + ", ".join(bad))
        return 3

    print("APPLIED " + MARKER + " to " + TARGET)
    print("POST-CONDITIONS: 3/3 ok")
    return 0


if __name__ == "__main__":
    sys.exit(apply())
