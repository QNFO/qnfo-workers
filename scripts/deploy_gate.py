#!/usr/bin/env python3
"""deploy_gate.py - fail-closed DEPLOY + BUILD gate for QNFO/qnfo-workers.

WHY (each gate below has a canonical incident behind it)
  WORKER-BUILD-GATE-1     a JavaScript syntax error in a git-sourced worker.js makes EVERY
                          `wrangler deploy` fail to bundle -- the repo-sourced redeploy cron
                          can never carry it, so the LIVE silently stales while main diverges.
  CONFLICT-MARKER-GATE-1  `<<<<<<<` / `=======` / `>>>>>>>` markers (or duplicate decls from a
                          stash-pop) fail identically to a botched edit.
  DEPLOY-GUARD-BYPASS-1   a bare `wrangler deploy` (or CF API PUT /workers/scripts/<name>)
                          bypasses the qnfo-deploy-guard distributed lock, so concurrent sessions
                          sharing one Cloudflare API token race last-write-wins.
  DEPLOY-UNLOGGED-MUTATION a deploy not written to the ledger is un-auditable.
  CRON-RATE-CEILING-1     a cron finer than 10 minutes (or above 144 fires/24h) multiplies
                          invocations, AI spend, D1 writes and rate-limit exposure for no
                          diagnostic gain. Cloudflare will happily accept a `*/5`; the ceiling
                          is ours to enforce (owner directive 2026-09-23).

WHAT (fail-closed: any failure deploys NOTHING and exits 3)
  1. CONFLICT-MARKER-GATE  scan the worker dir for merge markers
  2. CRON-RATE-CEILING-1   evaluate every `crons = [...]` entry: <=144 fires/24h AND >=10 min spacing
  3. WORKER-BUILD-GATE-1   run `wrangler deploy --dry-run` -- a REAL bundle build
  4. DEPLOY-GUARD-BYPASS-1 run the deploy UNDER `deploy_guard.py with-lock`, so it is
                           coordinated (lock; exit 2 on conflict) AND logged to the ledger
  5. DEPLOY-VERIFY-VERSION-1 (best effort) poll DEPLOY_HEALTH_URL for the expected version

USAGE
  python scripts/deploy_gate.py <worker_dir> <from_ver> <to_ver>     # full gated deploy
  python scripts/deploy_gate.py --check <worker_dir>                 # gate-only, no deploy
  DEPLOY_HEALTH_URL=https://<w>.workers.dev/health python scripts/deploy_gate.py ...

EXIT  0 ok | 2 lock held by another owner (fail-closed) | 3 build/conflict/failure (fail-closed)
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
# Windows: npx is npx.cmd -- subprocess without a resolved path raises WinError 2.
NPX = shutil.which("npx") or ("npx.cmd" if os.name == "nt" else "npx")
CONFLICT = re.compile(rb"(?m)^(<{7}|={7}|>{7})")
SCAN_EXT = (".js", ".mjs", ".cjs", ".ts", ".toml", ".json", ".jsonc")
SKIP_DIRS = {"node_modules", ".git", ".wrangler", ".dryrun-tmp"}

# Single source of truth for CRON-RATE-CEILING-1 (also runnable standalone:
# `python3 scripts/cron_rate_guard.py [--live]`).
sys.path.insert(0, HERE)
try:
    import cron_rate_guard as _crg
except Exception:  # pragma: no cover - the gate warns, it never silently passes
    _crg = None


def conflict_gate(wdir):
    bad = []
    for root, dirs, files in os.walk(wdir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if fn.endswith(SCAN_EXT):
                p = os.path.join(root, fn)
                try:
                    if CONFLICT.search(open(p, "rb").read()):
                        bad.append(os.path.relpath(p, wdir))
                except Exception:
                    pass
    if bad:
        print("FAIL CONFLICT-MARKER-GATE-1:", bad)
        return False
    print("PASS conflict-marker gate")
    return True


def cron_rate_gate(wdir):
    """CRON-RATE-CEILING-1: no cron more than once per 10 min, nor >144 fires/24h."""
    if _crg is None:
        print("WARN cron-rate gate skipped: cron_rate_guard.py not importable")
        return True
    crons = _crg.toml_crons(os.path.join(wdir, "wrangler.toml"))
    if not crons:
        print("PASS cron-rate gate (no cron triggers declared)")
        return True
    bad = []
    for cron in crons:
        try:
            stats = _crg.cron_stats(_crg.cron_fires(cron))
        except Exception as exc:
            bad.append((cron, "PARSE:%s" % exc))
            continue
        reason = _crg.violates(stats)
        if reason:
            bad.append((cron, "%s (max_fires_24h=%s, min_gap=%s min)"
                        % (reason, stats["max_fires_24h"], stats["min_gap_minutes"])))
    if bad:
        print("FAIL CRON-RATE-CEILING-1:", bad)
        print("  rule: <=%d fires/24h AND >=%d-minute spacing (owner directive 2026-09-23)"
              % (_crg.MAX_FIRES_24H, _crg.MIN_GAP_MINUTES))
        return False
    print("PASS cron-rate gate (%d cron expression(s))" % len(crons))
    return True


def build_gate(wdir):
    outdir = os.path.join(wdir, ".dryrun-tmp")
    print("BUILD GATE: npx wrangler deploy --dry-run  (cwd=%s)" % wdir)
    rc = subprocess.call(
        [NPX, "--yes", "wrangler", "deploy", "--dry-run", "--outdir", outdir],
        cwd=wdir,
    )
    if rc != 0:
        print("FAIL WORKER-BUILD-GATE-1: dry-run exit", rc)
        return False
    print("PASS build gate")
    return True


def deploy_locked(wdir, worker, frm, to):
    guard = os.environ.get("DEPLOY_GUARD_SCRIPT", os.path.join(HERE, "deploy_guard.py"))
    if not os.path.exists(guard):
        print("FAIL: deploy_guard.py not found at", guard, "(set DEPLOY_GUARD_SCRIPT)")
        return 3
    cmd = [sys.executable, guard, "with-lock", worker, frm, to, "--", NPX, "--yes", "wrangler", "deploy"]
    print("DEPLOY (locked + logged):", " ".join(cmd))
    rc = subprocess.call(cmd, cwd=wdir)
    print("deploy rc:", rc)
    return 0 if rc == 0 else (2 if rc == 2 else 3)


def health_verify(expected):
    url = os.environ.get("DEPLOY_HEALTH_URL")
    if not url:
        print("health-verify: skipped (set DEPLOY_HEALTH_URL)")
        return True
    for _ in range(6):
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                j = json.loads(r.read().decode())
            v = str(j.get("version", ""))
            if v == expected:
                print("health-verify PASS: live version", v)
                return True
            print("health-verify: live", v, "!= expected", expected)
        except Exception as e:
            print("health-verify probe:", e)
        time.sleep(5)
    print("health-verify: WARN version not confirmed (deploy still logged)")
    return False


def main(argv):
    check = "--check" in argv
    pos = [a for a in argv[1:] if not a.startswith("--")]
    if check:
        if len(pos) < 1:
            print(__doc__)
            return 3
        wdir = pos[0]
        frm = to = None
    else:
        if len(pos) < 3:
            print(__doc__)
            return 3
        wdir, frm, to = pos[0], pos[1], pos[2]

    if not os.path.isdir(wdir) or not os.path.exists(os.path.join(wdir, "wrangler.toml")):
        print("FAIL: %s is not a worker dir (no wrangler.toml)" % wdir)
        return 3
    worker = os.path.basename(os.path.abspath(wdir))

    if not conflict_gate(wdir):
        return 3
    if not cron_rate_gate(wdir):
        return 3
    if not build_gate(wdir):
        return 3
    if check:
        print("CHECK OK: %s passes the gate (no deploy)" % worker)
        return 0

    rc = deploy_locked(wdir, worker, frm, to)
    if rc == 0:
        health_verify(to)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv))
