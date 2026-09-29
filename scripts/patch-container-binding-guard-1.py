#!/usr/bin/env python3
"""CONTAINER-BINDING-GUARD-1 patcher (issue filed 2026-09-29, live incident).

WHY THIS EXISTS
---------------
Measured live incident, 2026-09-29:
  * 19:30:35.100Z  deployment_history row: qnfo-containers-pilot deployed_by
                   "qnfo-ops:cf_worker_deploy", version_id 1.0.2-apt-clean-enospc.
  * 19:30:37.492Z  last successful container.sh.
  * 19:30:43.591Z  FIRST cloud_ops_events kind='container.error'
                   text="Cannot read properties of undefined (reading 'running')".
  * 19:32:58Z      49 such errors in the window; container calls keep failing.
  * shell_exec / exec_python / exec_node / git_clone_exec / shell_pipeline /
    container_workspace_exec all route through this worker and are ALL down.

MECHANISM (read from the live qnfo-ops bundle, cfWorkerDeploy):
    const metadataPart = JSON.stringify(Object.assign(_mp,
        { bindings: bindingsOut },
        { compatibility_date: _compatDate },
        _compatFlags.length ? { compatibility_flags: _compatFlags } : {}));

The ops deploy path re-declares `bindings` and carries NO `containers` field.
Cloudflare's Containers model attaches the container to the Durable Object
binding (docs: "A Container can only be accessed through its Durable Object.
A Worker sends a request to the Durable Object, which accesses the Container
through ctx.container"). Re-declaring the DO binding without its container
association therefore leaves `ctx.container` undefined, and the very first
unguarded dereference -- `this.ctx.container.running` in ensureStarted() --
throws the TypeError above.

Contrast: scripts/raw_put.py sends metadata of `{"main_module": ...}` plus
compatibility fields and NO `bindings`, which is why its 17:06:43Z and
17:10:18Z deploys of this same worker did NOT break it. The regression is
specific to the bindings-re-declaring path.

WHAT THIS PATCH DOES
--------------------
It does not restore the container config (that requires `wrangler deploy`,
which is what .github/workflows/apply-container-binding-guard-1.yml does).
It makes the failure legible and non-catastrophic:
  1. ensureStarted() and _doStart() fail with an actionable
     CONTAINER-BINDING-MISSING error naming the cause and the fix, instead of
     an opaque "Cannot read properties of undefined".
  2. /status reports containerBindingPresent, so a binding-loss regression is
     observable from a probe rather than inferred from TypeError volume.
  3. VERSION is bumped so the deploy is verifiable end-to-end.

Idempotent: a second run is a no-op and exits 0.
Fail-closed: if an anchor is missing and its replacement is not already
present, exit 3 and change nothing.
"""
import pathlib
import sys

ARTIFACT = pathlib.Path("qnfo-containers-pilot/worker.js")

OLD_VER = 'var VERSION = "1.0.2-apt-clean-enospc";'
NEW_VER = 'var VERSION = "1.0.3-container-guard";'

OLD_ENSURE = """  async ensureStarted() {
    if (this.ctx.container.running) return;"""
NEW_ENSURE = """  async ensureStarted() {
    if (!this.ctx || !this.ctx.container) {
      throw new Error("CONTAINER-BINDING-MISSING: ctx.container is undefined - the deployed script carries no [[containers]] config. Redeploy with `wrangler deploy`; the CF API /content path cannot carry it (CONTAINER-BINDING-GUARD-1).");
    }
    if (this.ctx.container.running) return;"""

OLD_DOSTART = """  async _doStart() {
    if (this.ctx.container.running) return;"""
NEW_DOSTART = """  async _doStart() {
    if (!this.ctx || !this.ctx.container) {
      throw new Error("CONTAINER-BINDING-MISSING: ctx.container is undefined in _doStart (CONTAINER-BINDING-GUARD-1).");
    }
    if (this.ctx.container.running) return;"""

OLD_STATUS = """      if (path === "/status") {
        return json({ ok: true, containerRunning: this.ctx.container.running, initialized: this._initialized });
      }"""
NEW_STATUS = """      if (path === "/status") {
        const hasContainer = !!(this.ctx && this.ctx.container);
        return json({
          ok: hasContainer,
          containerBindingPresent: hasContainer,
          containerRunning: hasContainer ? this.ctx.container.running : null,
          initialized: this._initialized
        });
      }"""

EDITS = [
    ("version", OLD_VER, NEW_VER),
    ("ensureStarted guard", OLD_ENSURE, NEW_ENSURE),
    ("_doStart guard", OLD_DOSTART, NEW_DOSTART),
    ("/status binding probe", OLD_STATUS, NEW_STATUS),
]


def main():
    if not ARTIFACT.is_file():
        print("FAIL-CLOSED: %s not found" % ARTIFACT, file=sys.stderr)
        return 3
    text = ARTIFACT.read_text(encoding="utf-8")

    applied, already, missing = [], [], []
    for name, old, new in EDITS:
        if new in text:
            already.append(name)
        elif old in text:
            text = text.replace(old, new, 1)
            applied.append(name)
        else:
            missing.append(name)

    if missing:
        print("FAIL-CLOSED: anchor(s) not found and replacement absent: %s" % ", ".join(missing),
              file=sys.stderr)
        return 3

    if applied:
        ARTIFACT.write_text(text, encoding="utf-8")
        print("APPLIED: %s" % ", ".join(applied))
    else:
        print("ALREADY-APPLIED: %s" % ", ".join(already))

    if "CONTAINER-BINDING-MISSING" not in text:
        print("FAIL-CLOSED: marker absent after patch", file=sys.stderr)
        return 3
    if NEW_VER not in text:
        print("FAIL-CLOSED: version bump absent after patch", file=sys.stderr)
        return 3
    print("MARKER OK: CONTAINER-BINDING-MISSING present; VERSION=%s" % NEW_VER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
