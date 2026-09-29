#!/usr/bin/env python3
"""
OPS-DEPLOY-LEDGER-1 (2026-09-29) -- issue #1373

DEFECT
------
qnfo-ops.cfWorkerDeploy() -- the implementation behind this endpoint's own
`cf_worker_deploy` tool -- performed the CF API PUT and returned. It wrote
NOTHING to qnfo-audit.deployment_history. Verified 2026-09-29T15:41Z: the source
at main contained ZERO occurrences of the string "deployment_history".

CONSEQUENCE
-----------
The ops endpoint could deploy any worker in the fleet while remaining invisible
to the fleet's own deploy ledger. deployment_history.deployed_by is dominated by
client/agent labels, and the only self-written deployer row came from
scripts/raw_put.py (n=1). "Who deployed this, when, and from which source" was
therefore unanswerable for every deploy made through the ops tool, and such a
deploy could not be correlated or rolled back by version_id.

FIX
---
1. add recordDeployLedger(env, row) -- FAIL-OPEN (a ledger write must never fail
   a deploy). It always writes a non-empty `notes`, because qnfo-audit carries a
   BEFORE INSERT trigger `deployment_history_provenance_required_ins` that
   ABORTs with 'deploy-ledger-row-without-provenance' on a blank note.
2. call it on the CF API failure path -> status='failed'
3. call it on the success path        -> status='success'
   and surface the ledger outcome as `ledger` in the tool's return payload, so a
   caller can see whether the row landed and why not if it did not.

GUARDS (fail-closed, pre-flight)
  A1  'async function cfWorkerDeploy(env, args) {'                          x1
  A2  '    return { ok: true, worker, deployed: true, http: resp.status,'    x1
  A3  '    if (!resp.ok) return { ok: false, error: "CF API " + resp.status + ": " + JSON.stringify(j).slice(0, 400) };' x1
POST-CONDITIONS
  - 'OPS-DEPLOY-LEDGER-1' present
  - 'recordDeployLedger' >= 3 (1 definition + 2 call sites)
  - 'deployment_history' present  (the entire point of the fix)
  - A2's unpatched form is gone
IDEMPOTENT: marker present => no-op, exit 0.
"""
import sys
import pathlib

MARKER = "OPS-DEPLOY-LEDGER-1"
ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = [
    ROOT / "qnfo-ops" / "worker.js",
    ROOT / "qnfo-ops" / "deployed-current.worker.js",
]

A1 = "async function cfWorkerDeploy(env, args) {"
A2 = "    return { ok: true, worker, deployed: true, http: resp.status,"
A3 = '    if (!resp.ok) return { ok: false, error: "CF API " + resp.status + ": " + JSON.stringify(j).slice(0, 400) };'

HELPER = """// OPS-DEPLOY-LEDGER-1 (2026-09-29, issue #1373): cf_worker_deploy is this
// endpoint's OWN deploy tool and it had NO deployment_history writer, so the
// fleet deploy ledger could not see deploys made through this endpoint at all
// (verified: zero occurrences of "deployment_history" in this file). Every
// deploy attempt now records a row. FAIL-OPEN by design: a ledger failure must
// never fail a deploy. `notes` is always non-empty because qnfo-audit carries a
// BEFORE INSERT trigger `deployment_history_provenance_required_ins` that
// ABORTs with 'deploy-ledger-row-without-provenance' on a blank note.
async function recordDeployLedger(env, row) {
  try {
    if (!env || !env.QNFO_AUDIT) return { ok: false, error: "no QNFO_AUDIT binding" };
    const _n = row && row.notes != null && String(row.notes).trim() ? String(row.notes) : "cf_worker_deploy: no note supplied";
    const _r = await env.QNFO_AUDIT.prepare(
      "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, deployed_at, status, notes, _version) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)"
    ).bind(
      String(row && row.resource_type || "worker"),
      String(row && row.resource_name || ""),
      String(row && row.action || "deploy"),
      row && row.version_id != null ? String(row.version_id) : null,
      String(row && row.deployed_by || "qnfo-ops:cf_worker_deploy"),
      iso(),
      String(row && row.status || "success"),
      _n.slice(0, 500),
      1
    ).run();
    return { ok: true, changes: _r && _r.meta ? _r.meta.changes : null };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }
}

"""

NEW_A3 = """    if (!resp.ok) {
      const _ledFail = await recordDeployLedger(env, { resource_name: worker, action: "deploy", version_id: versionNote || null, status: "failed", notes: "cf_worker_deploy FAILED http=" + resp.status + " worker=" + worker + " content_bytes=" + content.length + " expected_version=" + String(args && args.expected_version || "n/a") + " err=" + JSON.stringify(j).slice(0, 200) });
      return { ok: false, error: "CF API " + resp.status + ": " + JSON.stringify(j).slice(0, 400), ledger: _ledFail };
    }"""

NEW_A2 = """    const _ledOk = await recordDeployLedger(env, { resource_name: worker, action: "deploy", version_id: versionNote || null, status: "success", notes: "cf_worker_deploy ok http=" + resp.status + " worker=" + worker + " bindings_preserved=" + bindingsOut.length + " etag=" + ((j && j.result && j.result.etag) ? j.result.etag : "n/a") + " content_bytes=" + content.length + " expected_version=" + String(args && args.expected_version || "n/a") });
    return { ledger: _ledOk, ok: true, worker, deployed: true, http: resp.status,"""


def fail(msg):
    print("::error file=qnfo-ops/worker.js::" + msg, file=sys.stderr)
    sys.exit(1)


def main():
    srcs = []
    for p in TARGETS:
        if not p.exists():
            fail("missing target " + str(p))
        srcs.append((p, p.read_bytes().decode("utf-8")))

    if all(MARKER in s for _, s in srcs):
        print("already patched (marker present) - no-op")
        for p, s in srcs:
            print("  %s bytes=%d marker=%d" % (p.name, len(s.encode("utf-8")), s.count(MARKER)))
        return

    for p, s in srcs:
        if s.count(A1) != 1:
            fail("A1 anchor not unique (%d) in %s" % (s.count(A1), p.name))
        if s.count(A2) != 1:
            fail("A2 anchor not unique (%d) in %s" % (s.count(A2), p.name))
        if s.count(A3) != 1:
            fail("A3 anchor not unique (%d) in %s" % (s.count(A3), p.name))

    for p, s in srcs:
        before = len(s.encode("utf-8"))
        new = s.replace(A1, HELPER + A1, 1)
        new = new.replace(A3, NEW_A3, 1)
        new = new.replace(A2, NEW_A2, 1)

        # ---- post-conditions (fail-closed) ----
        if MARKER not in new:
            fail("post-condition: marker missing after patch")
        if new.count("recordDeployLedger") < 3:
            fail("post-condition: recordDeployLedger count %d < 3" % new.count("recordDeployLedger"))
        if "deployment_history" not in new:
            fail("post-condition: deployment_history missing - the fix did not land")
        if A2 in new:
            fail("post-condition: unpatched success-return anchor still present")
        if A3 in new:
            fail("post-condition: unpatched failure-return anchor still present")
        if new.count("INSERT INTO deployment_history") != 1:
            fail("post-condition: expected exactly 1 ledger INSERT, got %d" % new.count("INSERT INTO deployment_history"))

        p.write_bytes(new.encode("utf-8"))
        after = len(new.encode("utf-8"))
        print("%s bytes: %d -> %d (+%d)" % (p.name, before, after, after - before))

    a = TARGETS[0].read_bytes()
    b = TARGETS[1].read_bytes()
    if a != b:
        fail("parity: worker.js and deployed-current.worker.js differ after patch")
    print("parity OK (%d bytes each)" % len(a))
    print("marker count: %d" % a.decode("utf-8").count(MARKER))


if __name__ == "__main__":
    main()
