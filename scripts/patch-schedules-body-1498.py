#!/usr/bin/env python3
"""patch-schedules-body-1498.py - RAWPUT-SCHEDULES-FAILED-1 (issue 1498).

ROOT CAUSE (proven against Cloudflare's official OpenAPI schema, not inferred):
  PUT /accounts/{acct}/workers/scripts/{script}/schedules
      requestBody: application/json  ->  {type: array, items: workers_schedule}
      workers_schedule.required: [cron]
  GET  .../schedules
      result: {type: object, properties: {schedules: {type: array, items: workers_schedule}}}

raw_put.py sent {"crons": [...]} (an OBJECT) where the API requires a top-level ARRAY of
{cron: "..."} objects. Cloudflare answers HTTP 400 / code 10026 "Could not parse request
body. Please ensure the request is valid JSON." - the exact string recorded in
deployment_history rows 188-193 (qnfo-cloud-ops, qnfo-ops, qnfo-fleet-dashboard,
qnfo-fleet-control, qnfo-email). Reproduced against a stub endpoint: object body -> 400/10026,
array body -> 200. So every repo `crons = [...]` edit was INERT fleet-wide.

Second defect in the same call pair: schedules_get parsed the GET `result` as a bare array,
but it is an object, so `sorted(result)` sorted the dict's KEYS and returned ['schedules'].
The in-sync short-circuit therefore never fired and every deploy re-PUT (idempotency broken).

Third defect (server-side-execution rule): token() fell back to a developer workstation path
C:\\Users\\LENOVO\\tokens\\cloudflare inside a CI/container tool. It can never resolve on a
runner and only invites a secret into the repo. Credentials come from the environment only.

Idempotent and fail-closed: exit 0 when applied or already applied, exit 3 when refused.
"""
import os
import sys

TARGET = os.environ.get("TARGET", "scripts/raw_put.py")

BODY_OLD = (
    '    url = SCHEDULES_API.format(acct=ACCT, worker=worker)\n'
    '    data = json.dumps({"crons": list(crons)}).encode("utf-8")\n'
)
BODY_NEW = (
    '    url = SCHEDULES_API.format(acct=ACCT, worker=worker)\n'
    '    # CF-SCHEDULES-BODY-SHAPE-1 (issue 1498, ROOT CAUSE): the PUT requestBody is a\n'
    '    # top-level JSON ARRAY of workers_schedule objects (required field: cron), NOT\n'
    '    # {"crons":[...]}. The object form is rejected with HTTP 400 / code 10026\n'
    '    # "Could not parse request body", which is exactly what deployment_history rows\n'
    '    # 188-193 record for 5 workers - so every repo crons edit was inert fleet-wide.\n'
    '    # Verified against the official schema (cloudflare/api-schemas openapi.yaml,\n'
    '    # operationId worker-cron-trigger-update-cron-triggers: requestBody type: array)\n'
    '    # and reproduced against a stub endpoint: object -> 400/10026, array -> 200.\n'
    '    data = json.dumps([{"cron": c} for c in crons]).encode("utf-8")\n'
)

GET_OLD = (
    'def schedules_get(worker, tok):\n'
    '    st, body = _api(SCHEDULES_API.format(acct=ACCT, worker=worker), tok)\n'
    '    if st == 200 and isinstance(body, dict) and body.get("success"):\n'
    '        return st, sorted(body.get("result") or [])\n'
    '    return st, None\n'
)
GET_NEW = (
    'def schedules_get(worker, tok):\n'
    '    # CF-SCHEDULES-RESPONSE-SHAPE-1 (issue 1498): the GET `result` is an OBJECT\n'
    '    # {"schedules":[{"cron":...}]}, not a bare array. The old\n'
    '    # `sorted(body.get("result") or [])` therefore sorted the dict KEYS and returned\n'
    '    # [\'schedules\'], which never equalled the declared set - so the in-sync\n'
    '    # short-circuit never fired and EVERY deploy re-PUT. The legacy bare-array shape is\n'
    '    # still tolerated so this cannot regress against an older API.\n'
    '    st, body = _api(SCHEDULES_API.format(acct=ACCT, worker=worker), tok)\n'
    '    if st == 200 and isinstance(body, dict) and body.get("success"):\n'
    '        res = body.get("result")\n'
    '        if isinstance(res, dict):\n'
    '            items = res.get("schedules")\n'
    '        elif isinstance(res, list):\n'
    '            items = res\n'
    '        else:\n'
    '            items = None\n'
    '        if items is None:\n'
    '            return st, None\n'
    '        out = []\n'
    '        for s in items:\n'
    '            if isinstance(s, dict):\n'
    '                c = s.get("cron")\n'
    '                if isinstance(c, str) and c.strip():\n'
    '                    out.append(c)\n'
    '            elif isinstance(s, str) and s.strip():\n'
    '                out.append(s)\n'
    '        return st, sorted(out)\n'
    '    return st, None\n'
)

TOK_OLD = (
    '    p = r"C:\\Users\\LENOVO\\tokens\\cloudflare"\n'
    '    if os.path.exists(p):\n'
    '        return open(p).read().strip()\n'
)
TOK_NEW = (
    '    # LOCAL-TOKEN-PATH-REMOVED-1: this deployer used to fall back to a developer\n'
    '    # workstation path (C:\\Users\\...\\tokens\\cloudflare). That is a client-side\n'
    '    # execution remnant inside a CI/container tool: it can never resolve on a runner\n'
    '    # or in a container, and it only invites a secret to be committed to the repo.\n'
    '    # Server-side execution only - credentials come from the environment.\n'
)

REPLACEMENTS = [
    ("CF-SCHEDULES-BODY-SHAPE-1", BODY_OLD, BODY_NEW),
    ("CF-SCHEDULES-RESPONSE-SHAPE-1", GET_OLD, GET_NEW),
    ("LOCAL-TOKEN-PATH-REMOVED-1", TOK_OLD, TOK_NEW),
]


def main(argv):
    if not os.path.isfile(TARGET):
        print("FAIL: %s not found" % TARGET)
        return 3
    with open(TARGET, encoding="utf-8") as fh:
        text = fh.read()

    applied, already, refused = [], [], []
    for marker, old, new in REPLACEMENTS:
        if marker in text:
            already.append(marker)
            continue
        if old in text:
            text = text.replace(old, new, 1)
            applied.append(marker)
            continue
        refused.append(marker)

    if refused:
        print("FAIL: fail-closed - pre-state not found for %s in %s; nothing written" % (refused, TARGET))
        print("      the file changed under this patcher; re-read it before re-running")
        return 3

    if applied:
        with open(TARGET, "w", encoding="utf-8") as fh:
            fh.write(text)
    print("PATCH-1498: applied=%s already=%s" % (applied, already))
    print("PATCH-1498: wrote %s (%d bytes)" % (TARGET, len(text)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
