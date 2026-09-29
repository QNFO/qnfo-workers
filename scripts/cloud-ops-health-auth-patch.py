#!/usr/bin/env python3
"""CLOUD-OPS-HEALTH-AUTH-1 -- issue #1471.

qnfo-cloud-ops serves /health UNAUTHENTICATED and returns, to any anonymous
caller:
  * a binding-presence map (audit/portfolio/living/outreach/graph/email/
    email_key/qnfo_infra/send_email/vault/ai/ops_vz)
  * a `secrets` object naming which secrets exist
    (gh, gmail, cf, admin, infra_token)
  * the complete cron map (`crons`: "<cron> -> <job>") and the job list

/health is handled at line 2165, BEFORE the auth gate at line 2196, so it is
the single route that bypasses auth(). Effect: anonymous reconnaissance of the
worker's secret inventory and its entire schedule.

Fix: keep /health public (fleet probes and the dashboard read `ok`/`version`)
but return only {ok, worker, version} to unauthenticated callers. The full
body still goes to callers presenting a valid bearer token, so no
authenticated consumer loses data.

Anchors measured on qnfo-cloud-ops/worker.js @ main, 2026-09-29 (123351 chars).
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / "qnfo-cloud-ops" / "worker.js"

MARKER = "CLOUD-OPS-HEALTH-AUTH-1"

A1_OLD = '''    if (path === "/health" && request.method === "GET") {
      if (ctx && ctx.waitUntil && env.QNFO_OPS && env.REGISTRY_TOKEN) {
        ctx.waitUntil(selfRegister(env).catch((err) => console.log("self-register err", err && err.message || err)));
      }
      const off = amsOffset(/* @__PURE__ */ new Date());'''

A1_NEW = '''    if (path === "/health" && request.method === "GET") {
      if (ctx && ctx.waitUntil && env.QNFO_OPS && env.REGISTRY_TOKEN) {
        ctx.waitUntil(selfRegister(env).catch((err) => console.log("self-register err", err && err.message || err)));
      }
      // CLOUD-OPS-HEALTH-AUTH-1 (#1471): this route is handled before the auth
      // gate below, so it used to disclose binding/secret presence and the
      // full cron map to anonymous callers. Serve a minimal public body; the
      // detailed body requires a valid bearer token.
      const publicBody = { ok: true, worker: WORKER_NAME, version: VERSION };
      const healthToken = (request.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");
      if (!auth(healthToken, env)) {
        return new Response(JSON.stringify(publicBody), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      const off = amsOffset(/* @__PURE__ */ new Date());'''

A2_OLD = '''      return new Response(JSON.stringify({
        ok: true,
        worker: WORKER_NAME,
        version: VERSION,
        jobs: Object.keys(JOBS),'''

A2_NEW = '''      return new Response(JSON.stringify({
        ...publicBody,
        jobs: Object.keys(JOBS),'''


def main() -> int:
    if not TARGET.exists():
        print("MISSING target: %s" % TARGET)
        return 3
    src = TARGET.read_text(encoding="utf-8")
    if MARKER in src:
        print("ALREADY PATCHED (%s present); no change" % MARKER)
        return 0
    n1 = src.count(A1_OLD)
    n2 = src.count(A2_OLD)
    print("anchor1=%d anchor2=%d" % (n1, n2))
    if n1 != 1 or n2 != 1:
        print("ANCHOR MISMATCH -- refusing to patch")
        return 3
    out = src.replace(A1_OLD, A1_NEW, 1).replace(A2_OLD, A2_NEW, 1)
    if MARKER not in out:
        print("PATCH DID NOT APPLY")
        return 3
    TARGET.write_text(out, encoding="utf-8")
    print("PATCHED %s (%d -> %d chars)" % (TARGET, len(src), len(out)))
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
