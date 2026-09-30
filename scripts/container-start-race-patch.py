#!/usr/bin/env python3
"""container-start-race-patch.py - START-RACE-1 (2026-09-29, issue #1344).

ROOT CAUSE (measured, not inferred)
  qnfo-containers-pilot `ShellContainer.ensureStarted()` tests
  `this.ctx.container.running` and, when false, calls `ctx.container.start()`
  with NO in-flight lock. Every ops container call routes to the SAME DO
  instance (`idFromName("default")`). Two concurrent `/sh` requests therefore
  both observe `running === false` and both call `start()`; the loser throws and
  the error surfaces as ops tool `shell_exec` -> "container error".

  Evidence (qnfo-audit.cloud_ops_events, 2026-09-29 08:00-12:34Z):
    shell_exec  57 error / 442 ok
    errors are `"container error"` with ms 1220-1723 (fast reject, not a boot
    timeout) and cluster in parallel batches: 12:22:05, :17, :38, :42, :53, :56
    — with successes interleaved, which is the signature of a start race, not of
    a dead container.

FIX
  (a) memoise the in-flight start promise, so concurrent callers JOIN the start
      instead of racing it;
  (b) one bounded retry that re-checks `running` before retrying (covers the
      case where the peer request's start landed between our check and our call);
  (c) the apt-get bootstrap stays UNCONDITIONAL after a successful start, because
      container scale-to-zero destroys the filesystem — skipping it when a stale
      in-memory `_initialized` flag is set would ship a container without git /
      ripgrep. Deliberately NOT optimised.

Idempotent and fail-closed: exactly-one-match anchors, `node --check` on the
patched output before it is written, nothing written on any mismatch.

Exit 0 applied-or-already-applied | 3 fail-closed (anchor missing / invalid output).
"""
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGET = ROOT / "qnfo-containers-pilot" / "worker.js"

OLD_CONSTRUCTOR = """  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this._initialized = false;
  }
"""

NEW_CONSTRUCTOR = """  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this._initialized = false;
    this._starting = null;
  }
"""

OLD_ENSURE = """  async ensureStarted() {
    if (this.ctx.container.running) return;
    await this.ctx.container.start({
      entrypoint: ["bash", "-c", "mkdir -p /workspace && sleep infinity"],
      enableInternet: true
    });
    await this.run([
      "bash",
      "-c",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git curl ripgrep 2>&1 | tail -3; git config --global user.email ops@qnfo.org; git config --global user.name 'QNFO ops'; echo INIT_DONE"
    ]);
    this._initialized = true;
  }
"""

NEW_ENSURE = """  async ensureStarted() {
    if (this.ctx.container.running) return;
    if (this._starting) return this._starting;
    this._starting = this._doStart().finally(() => {
      this._starting = null;
    });
    return this._starting;
  }
  async _doStart() {
    if (this.ctx.container.running) return;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.ctx.container.start({
          entrypoint: ["bash", "-c", "mkdir -p /workspace && sleep infinity"],
          enableInternet: true
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (this.ctx.container.running) {
          lastErr = null;
          break;
        }
        await new Promise((r) => setTimeout(r, 750));
      }
    }
    if (lastErr) throw lastErr;
    await this.run([
      "bash",
      "-c",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git curl ripgrep 2>&1 | tail -3; git config --global user.email ops@qnfo.org; git config --global user.name 'QNFO ops'; echo INIT_DONE"
    ]);
    this._initialized = true;
  }
"""

OLD_VERSION = 'var VERSION = "1.0.0";'
NEW_VERSION = 'var VERSION = "1.0.1-start-race-lock";'


def main():
    if not TARGET.exists():
        print("FAIL-CLOSED: %s missing" % TARGET)
        return 3
    src = TARGET.read_text(encoding="utf-8")

    if "1.0.1-start-race-lock" in src and "_doStart" in src:
        print("ALREADY APPLIED: %s" % TARGET)
        return 0

    anchors = [
        ("constructor", OLD_CONSTRUCTOR),
        ("ensureStarted", OLD_ENSURE),
        ("VERSION", OLD_VERSION),
    ]
    for label, old in anchors:
        n = src.count(old)
        if n != 1:
            print("FAIL-CLOSED: anchor %r matched %d times (expected exactly 1)" % (label, n))
            return 3

    out = src
    for old, new in ((OLD_CONSTRUCTOR, NEW_CONSTRUCTOR), (OLD_ENSURE, NEW_ENSURE), (OLD_VERSION, NEW_VERSION)):
        out = out.replace(old, new)

    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False, encoding="utf-8") as fh:
        fh.write(out)
        tmp = fh.name
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if r.returncode != 0:
        print("FAIL-CLOSED: node --check rejected the patched output\n" + (r.stderr or r.stdout))
        return 3

    TARGET.write_text(out, encoding="utf-8")
    print("APPLIED: %s (%d -> %d bytes)" % (TARGET, len(src), len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
