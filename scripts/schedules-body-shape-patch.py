#!/usr/bin/env python3
"""SCHEDULES-BODY-SHAPE-1  (issues #1500 / #1390 / #1495 / #1468)

ROOT CAUSE - proven against Cloudflare's own API reference (2026-09-30):

  The Workers schedules endpoint expects a JSON ARRAY OF OBJECTS:

      PUT /accounts/<acct>/workers/scripts/<worker>/schedules
      -H 'Content-Type: application/json'
      -d '[{"cron": "*/30 * * * *"}]'

  scripts/raw_put.py has always sent an OBJECT:

      data = json.dumps({"crons": list(crons)})

  Cloudflare answers HTTP 400 / error 10026 "Could not parse request body.
  Please ensure the request is valid".  That failure reproduces for EVERY
  worker on EVERY deploy - including a trivially valid "0 7 * * *" - so it
  is a body-shape defect, not cron syntax, not token scope, not User-Agent.

  Consequence: no repo `crons = [...]` declaration has ever reached the
  Cloudflare API.  Every worker's live trigger set is frozen at whatever it
  was before the declaration changed.  qnfo-cloud-ops is the worst case:
  declared 21 crons, live 1 ("30 5 * * 1"), which is absent from
  dispatchMap(2), so scheduled() falls through for every trigger and all 21
  jobs are dead (issue #1500).  Because that lone trigger is weekly, the
  worker's own self-repair path (syncSchedules) is unreachable between
  firings.

This patch does three things:

  1. Fixes the schedules PUT body to the documented array-of-objects shape.
     This is the fleet-wide unblock: 60 wrangler.toml files declare crons.

  2. Removes the stale [[vectorize]] OPS_VZ binding from the DECLARED config.
     The index "qnfo-cloud-ops" has been deleted, so any deploy that carries
     declared bindings fails with CF 10160 ("Vectorize binding 'OPS_VZ'
     references index 'qnfo-cloud-ops' which has been deleted") - which is
     why qnfo-cloud-ops cannot be deployed through the binding-aware path at
     all (issue #1468).  Live qnfo-cloud-ops already has NO OPS_VZ binding
     (15 bindings read back, none of type vectorize) and worker.js guards its
     use with `if (env.OPS_VZ)`, so removing the dead declaration aligns the
     declared config with live instead of inventing a new index.

  3. Bumps the qnfo-cloud-ops VERSION so the applier deploys the worker in
     this same run, which exercises the corrected schedules PUT immediately
     and re-registers the 21 declared triggers.

Fail-closed: refuses to write when an anchor is not present exactly once.
Idempotent: no-ops when its marker is already present.
"""
import pathlib
import re
import sys

MARK = "SCHEDULES-BODY-SHAPE-1"
ROOT = pathlib.Path(__file__).resolve().parent.parent

changes = []
fails = []


def patch(rel, old, new, regex=False, optional=False, note=""):
    p = ROOT / rel
    if not p.exists():
        if optional:
            print("SKIP(missing): %s" % rel)
            return
        fails.append("missing file: %s" % rel)
        return
    src = p.read_text()
    if new in src:
        print("SKIP(already-applied): %s" % rel)
        return
    n = len(re.findall(old, src)) if regex else src.count(old)
    if n == 0 and optional:
        print("SKIP(anchor absent%s): %s" % (note, rel))
        return
    if n != 1:
        fails.append("%s: anchor count=%d (expected 1)" % (rel, n))
        return
    out = re.sub(old, new, src, count=1) if regex else src.replace(old, new, 1)
    p.write_text(out)
    changes.append(rel)
    print("PATCHED: %s" % rel)


# --- 1. the schedules PUT body shape -------------------------------------------
patch(
    "scripts/raw_put.py",
    'data = json.dumps({"crons": list(crons)}).encode("utf-8")',
    "# SCHEDULES-BODY-SHAPE-1: the CF schedules endpoint takes an ARRAY OF OBJECTS\n"
    '    # ([{"cron": "..."}]), NOT {"crons": [...]}.  The object shape returned\n'
    '    # HTTP 400 / error 10026 "Could not parse request body" on EVERY deploy for\n'
    "    # EVERY worker, so no repo crons declaration ever reached the API\n"
    "    # (issues #1500 / #1390 / #1495).\n"
    '    data = json.dumps([{"cron": c} for c in crons]).encode("utf-8")',
)

# --- 2. drop the dead OPS_VZ binding from the declared config -------------------
patch(
    "qnfo-cloud-ops/wrangler.toml",
    '[[vectorize]]\nbinding = "OPS_VZ"\nindex_name = "qnfo-cloud-ops"\n',
    "# SCHEDULES-BODY-SHAPE-1 / #1468: [[vectorize]] OPS_VZ REMOVED. The index\n"
    '# "qnfo-cloud-ops" was deleted, so every deploy carrying declared bindings\n'
    "# failed with CF 10160 and this worker could not be deployed at all. Live has\n"
    "# no OPS_VZ binding; worker.js guards its use with `if (env.OPS_VZ)`.\n",
    optional=True,
    note=" (OPS_VZ block already gone)",
)

# --- 3. force a deploy so the corrected schedules PUT runs now ------------------
VER_RE = r'var VERSION = "1\.15\.[0-9]+[^"]*";'
NEW_VER = 'var VERSION = "1.15.3-schedules-body-shape"; // ' + MARK
for rel in ("qnfo-cloud-ops/worker.js", "qnfo-cloud-ops/deployed-current.worker.js"):
    patch(rel, VER_RE, NEW_VER, regex=True, optional=True, note=" (no 1.15.x VERSION)")

if fails:
    print("FAIL: " + "; ".join(fails))
    sys.exit(1)
print("changed=%d %s" % (len(changes), changes))
sys.exit(0)
