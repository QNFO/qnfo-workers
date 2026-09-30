#!/usr/bin/env python3
"""GITCLONE-WARM-RETRY-1 (issue #1465).

Defect: gitCloneExec dispatches POST /git/clone with NO warm-up and NO retry.
A container cold start consumes the timeout budget, so the tool returns
`clone failed: container timeout after Nms` (observed: 24 errors / 113 calls
= 21.2% over 7 days; several were cold-start timeouts at 180s and 300s).

Fix: probe /health before the clone, and on a timeout-class failure retry the
clone exactly once into a fresh directory (a partially-populated /workspace/<name>
from the first attempt would otherwise make the retry fail with "already exists").

Fail-closed: the patcher verifies (a) exactly one target site, (b) the retry
marker is present afterwards, (c) the pre-patch shape is gone, (d) `node --check`
passes, and (e) worker.js and deployed-current.worker.js stay byte-identical.
Idempotent: a second run reports already-patched and writes nothing.
"""
import hashlib
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
TARGETS = [REPO / "qnfo-ops" / "worker.js", REPO / "qnfo-ops" / "deployed-current.worker.js"]
MARKER = "GITCLONE-WARM-RETRY-1"

OLD = '''  if (!url2) return { ok: false, error: "url required" };
  const cloneJ = await containerDispatch(env, "/git/clone", { url: url2, branch, depth, name }, timeout);
  if (!cloneJ.ok) return { ok: false, error: "clone failed: " + (cloneJ.error || JSON.stringify(cloneJ.result || {}).slice(0, 200)), clone_result: cloneJ.result };
  if (!cmd) return { ok: true, cloned: true, path: "/workspace/" + name, clone_result: fmtContainer(cloneJ) };
  const execJ = await containerDispatch(env, "/workspace/exec", { dir: name, cmd }, timeout);
  return { ok: (execJ.result || {}).exitCode === 0, cloned: true, path: "/workspace/" + name, clone_result: fmtContainer(cloneJ), exec_result: fmtContainer(execJ) };'''

NEW = '''  if (!url2) return { ok: false, error: "url required" };
  // GITCLONE-WARM-RETRY-1 (issue #1465): warm the container, then retry once on
  // a timeout-class failure. Without this a cold start consumes the whole budget
  // and every clone reports "container timeout after Nms".
  try { await containerDispatch(env, "/health", {}, 2e4); } catch (e) { }
  let effName = name;
  let cloneJ = await containerDispatch(env, "/git/clone", { url: url2, branch, depth, name: effName }, timeout);
  let warmRetried = false;
  if (!cloneJ.ok && /timeout|timed out|ETIMEDOUT/i.test(String(cloneJ.error || "") + " " + String((cloneJ.result || {}).stderr || ""))) {
    warmRetried = true;
    effName = name + "-r" + Math.random().toString(36).slice(2, 6);
    try { await containerDispatch(env, "/health", {}, 3e4); } catch (e) { }
    cloneJ = await containerDispatch(env, "/git/clone", { url: url2, branch, depth, name: effName }, timeout);
  }
  if (!cloneJ.ok) return { ok: false, error: "clone failed: " + (cloneJ.error || JSON.stringify(cloneJ.result || {}).slice(0, 200)), clone_result: cloneJ.result, warm_retry: warmRetried };
  if (!cmd) return { ok: true, cloned: true, path: "/workspace/" + effName, clone_result: fmtContainer(cloneJ), warm_retry: warmRetried };
  const execJ = await containerDispatch(env, "/workspace/exec", { dir: effName, cmd }, timeout);
  return { ok: (execJ.result || {}).exitCode === 0, cloned: true, path: "/workspace/" + effName, clone_result: fmtContainer(cloneJ), exec_result: fmtContainer(execJ), warm_retry: warmRetried };'''


def sha(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else "-"


def main() -> int:
    changed = 0
    for path in TARGETS:
        if not path.exists():
            print(f"::error file={path}::missing target", file=sys.stderr)
            return 2
        src = path.read_text(encoding="utf-8")

        if MARKER in src:
            print(f"already-patched: {path.name}")
            continue

        n = src.count(OLD)
        if n != 1:
            print(f"::error file={path}::anchor count {n} (expected 1); aborting", file=sys.stderr)
            return 1

        out = src.replace(OLD, NEW, 1)

        # post-conditions
        if MARKER not in out:
            print(f"::error file={path}::marker absent after patch; aborting", file=sys.stderr)
            return 1
        if OLD in out:
            print(f"::error file={path}::pre-patch shape still present; aborting", file=sys.stderr)
            return 1
        if out.count('warm_retry') != 3:
            print(f"::error file={path}::warm_retry count {out.count('warm_retry')} (expected 3); aborting", file=sys.stderr)
            return 1

        path.write_text(out, encoding="utf-8")
        changed += 1
        print(f"patched: {path.name} bytes {len(src)} -> {len(out)} sha {sha(path)}")

    if changed:
        # parity: source and mirror must stay byte-identical
        a, b = TARGETS[0].read_bytes(), TARGETS[1].read_bytes()
        if a != b:
            print("::error::PARITY-FAIL worker.js != deployed-current.worker.js", file=sys.stderr)
            return 1
        print("PARITY_OK")

        for path in TARGETS:
            r = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
            if r.returncode != 0:
                print(f"::error file={path}::SYNTAX_ERROR {r.stderr[:400]}", file=sys.stderr)
                return 1
        print("SYNTAX_OK")

    print(f"changed_files={changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
