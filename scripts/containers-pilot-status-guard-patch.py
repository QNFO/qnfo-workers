#!/usr/bin/env python3
"""CONTAINER-STATUS-GUARD-1 + CONN-LOST-RETRY-1 applier for qnfo-containers-pilot.

Applies five anchored edits to qnfo-containers-pilot/worker.js. Anchored on
function bodies (never on the VERSION literal) so a concurrent VERSION bump
cannot orphan the applier -- see VERSION-ANCHOR-DRIFT-1.

Fail-closed: every anchor must match exactly once. Idempotent via MARKER.
"""
import sys
from pathlib import Path

MARKER = "CONTAINER-STATUS-GUARD-1"
REL = "qnfo-containers-pilot/worker.js"

V_OLD = 'var VERSION = "1.0.2-apt-clean-enospc";'
V_NEW = 'var VERSION = "1.0.3-status-guard-connretry";'

A2_OLD = """  async ensureStarted() {
    if (this.ctx.container.running) return;
    if (this._starting) return this._starting;"""

A2_NEW = """  _container() {
    return this.ctx && this.ctx.container ? this.ctx.container : null;
  }
  async ensureStarted() {
    const _c = this._container();
    if (!_c) throw new Error("CONTAINER-BINDING-MISSING-1: ctx.container is undefined (container binding not attached to this Durable Object)");
    if (_c.running) return;
    if (this._starting) return this._starting;"""

A3_OLD = """  async _doStart() {
    if (this.ctx.container.running) return;
    let lastErr = null;"""

A3_NEW = """  async _doStart() {
    const _c0 = this._container();
    if (!_c0) throw new Error("CONTAINER-BINDING-MISSING-1: ctx.container is undefined");
    if (_c0.running) return;
    let lastErr = null;"""

A4_OLD = """        await this.ctx.container.start({"""
A4_NEW = """        await _c0.start({"""

A5_OLD = """        if (this.ctx.container.running) {
          lastErr = null;
          break;
        }"""
A5_NEW = """        if (_c0.running) {
          lastErr = null;
          break;
        }"""

A6_OLD = """  async run(cmd) {
    const proc = await this.ctx.container.exec(cmd);
    const output = await proc.output();"""

A6_NEW = """  async run(cmd) {
    const _c = this._container();
    if (!_c) throw new Error("CONTAINER-BINDING-MISSING-1: ctx.container is undefined");
    let proc;
    try {
      proc = await _c.exec(cmd);
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      if (!/Network connection lost|container is not running|not running/i.test(m)) throw e;
      try {
        await _c.start({
          entrypoint: ["bash", "-c", "mkdir -p /workspace && sleep infinity"],
          enableInternet: true
        });
      } catch (se) {
      }
      await new Promise((r) => setTimeout(r, 900));
      proc = await _c.exec(cmd);
    }
    const output = await proc.output();"""

A7_OLD = """      if (path === "/status") {
        return json({ ok: true, containerRunning: this.ctx.container.running, initialized: this._initialized });
      }"""

A7_NEW = """      if (path === "/status") {
        const _cs = this._container();
        return json({
          ok: true,
          containerRunning: _cs ? !!_cs.running : null,
          container_binding: !!_cs,
          initialized: this._initialized,
          note: _cs ? void 0 : "CONTAINER-BINDING-MISSING-1: ctx.container undefined in Durable Object"
        });
      }"""

EDITS = [
    ("version", V_OLD, V_NEW),
    ("ensureStarted", A2_OLD, A2_NEW),
    ("_doStart-guard", A3_OLD, A3_NEW),
    ("_doStart-start", A4_OLD, A4_NEW),
    ("_doStart-running", A5_OLD, A5_NEW),
    ("run-retry", A6_OLD, A6_NEW),
    ("status", A7_OLD, A7_NEW),
]


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    p = root / REL
    if not p.exists():
        print("FAIL: %s not found under %s" % (REL, root))
        return 1
    src = p.read_text(encoding="utf-8")

    if MARKER in src:
        print("already patched (%s present) -- no write" % MARKER)
        return 0

    out = src
    for name, old, new in EDITS:
        n = out.count(old)
        if n != 1:
            print("FAIL: anchor '%s' matched %d times (expected 1) -- fail-closed, no write" % (name, n))
            return 1
        out = out.replace(old, new, 1)

    if "this.ctx.container.running" in out or "this.ctx.container.exec" in out:
        print("FAIL: residual unguarded this.ctx.container dereference remains -- no write")
        return 1

    if MARKER not in out:
        out = out.replace(
            "// ENOSPC-CACHE-1: apt cache + .deb archives reclaimed on cold start (issue #1445)",
            "// ENOSPC-CACHE-1: apt cache + .deb archives reclaimed on cold start (issue #1445)\n// CONTAINER-STATUS-GUARD-1 + CONN-LOST-RETRY-1 (2026-09-29): guarded container accessor,\n// named CONTAINER-BINDING-MISSING-1 error instead of TypeError, /status reports\n// container_binding, and one restart+retry after \"Network connection lost.\"",
            1,
        )

    if out == src:
        print("FAIL: no change produced -- no write")
        return 1

    p.write_text(out, encoding="utf-8")
    print("APPLIED %s: %d -> %d bytes" % (REL, len(src), len(out)))
    for name, _o, _n in EDITS:
        print("  ok %s" % name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
