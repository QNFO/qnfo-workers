#!/usr/bin/env python3
"""HEALTH-PROBE-BUDGET-1 (2026-09-29) - qnfo-backlog-exec /health must stay cheap.

DEFECT
------
qnfo-backlog-exec's /health handler ran the full 14-lane openInventory() scan on
EVERY probe:

    if (url.pathname === "/health") {
      const open      = await env.AUDIT.prepare("SELECT COUNT(*) c FROM agent_issues WHERE status='open'").first()...
      const led       = await env.AUDIT.prepare("SELECT COUNT(*) c FROM issue_ledger WHERE status='open'").first()...
      const stranded  = await env.AUDIT.prepare("SELECT COUNT(*) c FROM ops_jobs WHERE ...").first()...
      const inventory = await openInventory(env).catch(() => null);          <-- EXPENSIVE
      return json({ ..., openIssuesTotal: inventory ? inventory.total : -1, inventory });
    }

openInventory() walks 14 registers / 109 rows. On a cold isolate that exceeds the
hard 5s AbortController budget in qnfo-ops probeService() (qnfo-ops/worker.js,
`setTimeout(function(){ ctrl.abort(); }, 5e3)`), so the service-binding fetch
rejects with AbortError and probeService returns {ok:false, http:0, error:"timeout"}.

OBSERVED CONSEQUENCE (false negative - the worker was healthy the whole time)
----------------------------------------------------------------------------
  backlog_status tool -> {ok:false, healthy:false, http:0, version:"", openBacklog:-1}
  fleet_status        -> {name:"qnfo-backlog-exec", healthy:false, error:"timeout"}

while a plain internet client (Cloudflare container, curl, same moment) got:

  GET https://qnfo-backlog-exec.q08.workers.dev/health
  -> http=200 time=1.601152s
  -> {"ok":true,"worker":"qnfo-backlog-exec","version":"2.0.0-full-register-inventory",
      "openBacklog":60,"openLedger":8,"strandedOpsJobs":0,"openIssuesTotal":109,
      "inventory":{"laneCount":14,"total":109,...}}

That false negative auto-filed agent_issues 1368 ("TOOL-FAILURE: backlog_status
[error]", source cloud_ops_events:evt-efe861ecce656e, ts 2026-09-29T15:35:21.710Z)
and hid the true open-backlog count from every consumer of backlog_status.

FIX
---
The full inventory is ALREADY served by the separate /inventory route, so /health
does not need it. This patch removes the openInventory() call from /health and
answers openIssuesTotal from the already-computed cheap COUNT(*) of open issues.
/health becomes three COUNT(*) queries with no multi-register walk.

Idempotent and fail-closed: if the /health block does not contain the expected
anchors the script exits non-zero and patches nothing.
"""
import pathlib
import re
import sys

TARGETS = [
    "qnfo-backlog-exec/worker.js",
    "qnfo-backlog-exec/deployed-current.worker.js",
]

NEW_VERSION = "2.0.1-health-probe-budget"

COMMENT = (
    "      // HEALTH-PROBE-BUDGET-1 (2026-09-29): /health MUST stay cheap. This handler used to\n"
    "      // run the full 14-lane openInventory() scan, which on a cold isolate exceeded the\n"
    "      // 5s AbortController budget in qnfo-ops probeService() -> AbortError -> backlog_status\n"
    "      // and fleet_status both reported this worker as \"timeout\" while it was in fact\n"
    "      // healthy (curl http=200 in 1.6s). That false negative auto-filed agent_issues 1368.\n"
    "      // The full inventory is served by the separate /inventory route.\n"
)

HEALTH_OPEN = 'if (url.pathname === "/health") {'
INV_OPEN = 'if (url.pathname === "/inventory") {'
DROP_INVENTORY = re.compile(
    r"[ \t]*const inventory = await openInventory\(env\)\.catch\(\(\) => null\);\n"
)
OLD_TAIL = "openIssuesTotal: inventory ? inventory.total : -1, inventory }"
NEW_TAIL = "openIssuesTotal: open ? open.c : -1 }"
VERSION_RE = re.compile(r'var VERSION = "[^"]*";')


def patch_one(path: str) -> bool:
    p = pathlib.Path(path)
    if not p.exists():
        print(f"SKIP {path}: file absent")
        return True

    s = p.read_text()
    if "HEALTH-PROBE-BUDGET-1" in s:
        print(f"OK   {path}: already patched (idempotent no-op)")
        return True

    try:
        start = s.index(HEALTH_OPEN)
        end = s.index(INV_OPEN, start)
    except ValueError:
        print(f"::error file={path}::HEALTH-PROBE-BUDGET-1 anchors /health + /inventory not found; refusing to patch", file=sys.stderr)
        return False

    block = s[start:end]
    if "openInventory(env)" not in block:
        print(f"::error file={path}::HEALTH-PROBE-BUDGET-1 /health block has no openInventory() call; refusing to patch", file=sys.stderr)
        return False
    if OLD_TAIL not in block:
        print(f"::error file={path}::HEALTH-PROBE-BUDGET-1 return tail not found verbatim; refusing to patch", file=sys.stderr)
        return False

    new_block = DROP_INVENTORY.sub("", block, count=1)
    new_block = new_block.replace(OLD_TAIL, NEW_TAIL, 1)
    new_block = new_block.replace(
        "      return json({ ok: true, worker: WORKER, version: VERSION, openBacklog:",
        COMMENT + "      return json({ ok: true, worker: WORKER, version: VERSION, openBacklog:",
        1,
    )

    if "openInventory" in new_block:
        print(f"::error file={path}::HEALTH-PROBE-BUDGET-1 openInventory still referenced in /health after patch; aborting", file=sys.stderr)
        return False
    if NEW_TAIL not in new_block:
        print(f"::error file={path}::HEALTH-PROBE-BUDGET-1 new return tail missing after patch; aborting", file=sys.stderr)
        return False

    s = s[:start] + new_block + s[end:]
    s, n = VERSION_RE.subn(f'var VERSION = "{NEW_VERSION}";', s, count=1)
    if n != 1:
        print(f"::error file={path}::HEALTH-PROBE-BUDGET-1 VERSION declaration not found; aborting", file=sys.stderr)
        return False

    p.write_text(s)
    print(f"OK   {path}: /health made cheap; VERSION -> {NEW_VERSION}")
    return True


def main() -> int:
    ok = True
    for t in TARGETS:
        ok = patch_one(t) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
