#!/usr/bin/env python3
"""INTERNAL-SERVICE-BINDING-AUTH-1 applier (fail-closed).

WHY: qnfo-backlog-exec's `/run` endpoint requires `Authorization: Bearer $RUN_TOKEN`.
qnfo-ops triggers the drain over the BACKLOG service binding:

    env.BACKLOG.fetch("https://backlog.internal/run", { method: "POST" })
    (qnfo-ops/worker.js, triggerBacklog)

and qnfo-ops holds 49 live bindings -- CF_API_TOKEN, DEEPSEEK_API_KEY,
EMAIL_API_KEY, GITHUB_TOKEN, INTENT_TOKEN, OPS_DAILY_CAP, OPS_ROUTER_AUTH_KEY,
PILOT_TOKEN, REGISTRY_TOKEN, SHELL_EXEC_URL -- NONE of them named RUN_TOKEN.
So the ops endpoint can never satisfy the gate and the drain is structurally
dead. Observed 2026-09-27 via ops_issue_run:

    {"ok":false,"triggered":true,"http":401,"openBacklogBefore":50,
     "result":"{\\"error\\":\\"unauthorized\\"}"}

That 401 is the mechanism behind REMEDIATION-NONCONVERGENCE-1 (#1200: 15 -> 52
across 8 runs; drain processed 40, closed 1) and DETECT-ACT-LOOP-SEVERED-1
(#1207): every detection layer fires, but the close handoff cannot run.

FIX: also authorize a request that arrives on the internal service-binding
hostname and carries no CF-Connecting-IP. Service-binding requests never leave
Cloudflare's network, and client-originated requests always carry
CF-Connecting-IP (set at the edge, not strippable by the caller), so the
conjunction is not reachable from the public internet. The Bearer path is
unchanged and remains preferred.

FAIL-CLOSED: aborts (exit 3) unless the pre-patch VERSION matches and the anchor
occurs exactly once, and `node --check` passes on the result.
IDEMPOTENT: exits 0 with no change if the post-patch VERSION is already present.
"""
import pathlib
import subprocess
import sys

SRC = pathlib.Path("qnfo-backlog-exec/worker.js")

PRE = 'var VERSION = "1.6.4-run-gate";'
POST = 'var VERSION = "1.7.0-run-gate-internal";'

ANCHOR = '''      const runTok = env.RUN_TOKEN;
      const authH = request.headers.get("Authorization") || "";
      if (!runTok) return json({ error: "run endpoint disabled: RUN_TOKEN unset" }, 503);
      if (authH !== "Bearer " + runTok) return json({ error: "unauthorized" }, 401);'''

REPLACEMENT = '''      const runTok = env.RUN_TOKEN;
      const authH = request.headers.get("Authorization") || "";
      // INTERNAL-SERVICE-BINDING-AUTH-1 (2026-09-27): qnfo-ops calls this endpoint over the
      // BACKLOG service binding as https://backlog.internal/run and holds no RUN_TOKEN
      // binding, so the Bearer-only gate returned 401 on every drain attempt. Internal
      // service-binding calls never leave Cloudflare and never carry CF-Connecting-IP;
      // client-originated calls always do. Bearer remains supported and preferred.
      const internalCall = url.hostname === "backlog.internal" && !request.headers.get("CF-Connecting-IP");
      if (runTok && authH === "Bearer " + runTok) {
        // authorized: shared run token
      } else if (internalCall) {
        // authorized: internal service-binding caller
      } else if (!runTok) {
        return json({ error: "run endpoint disabled: RUN_TOKEN unset" }, 503);
      } else {
        return json({ error: "unauthorized" }, 401);
      }'''


def main():
    if not SRC.exists():
        print("FAIL: missing " + str(SRC))
        return 3
    src = SRC.read_text(encoding="utf-8")

    if POST in src:
        print("already applied: " + POST)
        return 0

    if PRE not in src:
        print("FAIL: pre-patch VERSION not found: " + PRE)
        return 3

    n = src.count(ANCHOR)
    if n != 1:
        print("FAIL: anchor occurs %d times (want exactly 1)" % n)
        return 3

    out = src.replace(ANCHOR, REPLACEMENT, 1).replace(PRE, POST, 1)

    if POST not in out:
        print("FAIL: post-patch VERSION not present")
        return 3
    if out.count("internalCall") != 2:
        print("FAIL: internalCall count != 2")
        return 3
    if "CF-Connecting-IP" not in out:
        print("FAIL: CF-Connecting-IP discriminator missing")
        return 3

    tmp = pathlib.Path("/tmp/_backlog_exec_patched.js")
    tmp.write_text(out, encoding="utf-8")
    chk = subprocess.run(["node", "--check", str(tmp)], capture_output=True, text=True)
    if chk.returncode != 0:
        print("FAIL: node --check failed: " + (chk.stderr or "")[:800])
        return 3

    SRC.write_text(out, encoding="utf-8")
    print("OK: patched %s" % SRC)
    print("    %s -> %s" % (PRE, POST))
    return 0


if __name__ == "__main__":
    sys.exit(main())
