#!/usr/bin/env python3
"""CONTAINER-CONFIG-DROPPED-1 (issue #1485) -- fail-closed guard so no automated
deployer can silently destroy a worker's [[containers]] config.

WHY THIS EXISTS -- MEASURED, NOT INFERRED
  qnfo-containers-pilot declares [[containers]] in qnfo-containers-pilot/wrangler.toml.
  Cloudflare stores that block as SCRIPT-LEVEL config, NOT as a binding. So
  GET /workers/scripts/qnfo-containers-pilot/bindings returns only:
      {d1 AUDIT, secret_text PILOT_TOKEN, durable_object_namespace SHELL_CONTAINER}
  Both automated deployers in this fleet rebuild the script from that binding list:
      * qnfo-ops cf_worker_deploy   (BINDING-PRESERVE-1)
      * scripts/raw_put.py          (CF /content PUT)
  Neither can transmit [[containers]], so each one silently DESTROYS it.

  deployment_history evidence (qnfo-audit, read this session):
      id 172  2026-09-29T19:30:35.100Z  qnfo-ops:cf_worker_deploy  1.0.2-apt-clean-enospc
      id 175  2026-09-29T19:34:11.789Z  qnfo-ops:cf_worker_deploy  1.0.3-clone-egress-timeout-fallback
      id 177  2026-09-29T19:34:27.607Z  scripts/raw_put.py         1.0.3-clone-egress-timeout-fallback
  First cloud_ops_events kind=container.error row with text
  "Cannot read properties of undefined (reading 'running')" landed 19:30:43.591Z --
  EIGHT SECONDS after id 172. Blast radius: shell_exec, exec_python, exec_node,
  shell_pipeline, container_install, git_clone_exec, container_workspace_exec,
  container_status -- i.e. the single largest genuine tool-failure family in the fleet.

WHAT IT PATCHES
  1. qnfo-ops/worker.js -- cfWorkerDeploy() returns rejected:true for a container worker
     unless the caller passes allow_container_config_drop:true (deliberate teardown).
  2. scripts/fleet-autoaudit.py -- apply_ahead() skips container workers with a loud
     ::warning:: instead of silently raw_put-ing them.

DESIGN CONSTRAINTS
  * VERSION-ANCHOR-DRIFT-1: no anchor is a VERSION literal. The qnfo-ops VERSION bump is
    derived by regex from whatever is live in the tree, so a concurrent agent's bump cannot
    orphan this patcher.
  * Idempotent: a marker check short-circuits a second run.
  * Fail-closed: every anchor must match exactly once, else exit 1 with NO partial write.
  * ADVERSARIAL: (a) the qnfo-ops guard is a NAME LIST, not detection -- a NEW container
    worker is still exposed until added; real detection needs the worker's wrangler.toml,
    which this endpoint has no binding for. (b) the fleet-autoaudit guard only covers the
    --apply path; a manual raw_put.py invocation still bypasses it. (c) a successful deploy
    of the patched qnfo-ops is required before either guard is actually in force.
"""
import os
import re
import sys

MARKER = "CONTAINER-CONFIG-DROPPED-1"


def find_root():
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(6):
        d = os.path.dirname(d)
        if os.path.isfile(os.path.join(d, "qnfo-ops", "worker.js")):
            return d
    return os.getcwd()


ROOT = find_root()
changed = []


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)


def once(text, anchor, label):
    n = text.count(anchor)
    if n != 1:
        print("[fail] anchor " + label + " matched " + str(n) + " times, expected exactly 1")
        sys.exit(1)
    return True


# ---------------------------------------------------------------- 1. qnfo-ops/worker.js
OPS = os.path.join(ROOT, "qnfo-ops", "worker.js")
ops = read(OPS)

if "_CONTAINER_WORKERS" in ops:
    print("[skip] qnfo-ops/worker.js already carries the container-deploy guard")
else:
    A1 = '  if (!content) return { ok: false, error: "content (JS source) required" };\n'
    once(ops, A1, "A1 content-required check")

    GUARD = (
        '  // CONTAINER-CONFIG-DROPPED-1 (2026-09-29, issue #1485): refuse to deploy a worker\n'
        '  // that declares [[containers]]. Cloudflare stores that block as script-level config,\n'
        '  // NOT as a binding, so it never appears in GET /bindings -- and BINDING-PRESERVE-1\n'
        '  // rebuilds the script from exactly that list, which therefore DROPS it. Measured:\n'
        '  // deployment_history id 172 (19:30:35.100Z) and id 175 (19:34:11.789Z) each dropped\n'
        '  // qnfo-containers-pilot\'s container config; the first container.error row landed at\n'
        '  // 19:30:43.591Z, 8s after id 172. Use wrangler deploy instead\n'
        '  // (.github/workflows/deploy-containers-pilot.yml).\n'
        '  // ADVERSARIAL: this is a name list, not detection -- a NEW container worker added\n'
        '  // without extending it is still exposed. Detection would require reading the\n'
        '  // worker\'s wrangler.toml, which this endpoint has no binding for.\n'
        '  const _CONTAINER_WORKERS = ["qnfo-containers-pilot"];\n'
        '  if (_CONTAINER_WORKERS.indexOf(worker) !== -1 && !(args && args.allow_container_config_drop)) {\n'
        '    return {\n'
        '      ok: false,\n'
        '      rejected: true,\n'
        '      error: "CONTAINER-CONFIG-DROPPED-1: " + worker + " declares [[containers]]; cf_worker_deploy PUTs /content and rebuilds bindings from GET /bindings, and [[containers]] is not a binding, so this deploy would destroy the container config and take the whole container tool family down. Deploy with wrangler deploy (.github/workflows/deploy-containers-pilot.yml). Pass allow_container_config_drop:true only for a deliberate container teardown."\n'
        '    };\n'
        '  }\n'
    )
    ops = ops.replace(A1, A1 + GUARD, 1)

    vr = r'var VERSION = "(\d+)\.(\d+)\.(\d+)-([^"]*)";'
    hits = re.findall(vr, ops)
    if len(hits) != 1:
        print("[fail] expected exactly 1 VERSION line, found " + str(len(hits)))
        sys.exit(1)
    newv = hits[0][0] + "." + hits[0][1] + "." + str(int(hits[0][2]) + 1) + "-container-deploy-guard"
    ops = re.sub(vr, 'var VERSION = "' + newv + '";', ops, count=1)
    write(OPS, ops)
    changed.append("qnfo-ops/worker.js -> " + newv)
    print("[ok] qnfo-ops/worker.js guarded, VERSION -> " + newv)

# ------------------------------------------------------- 2. scripts/fleet-autoaudit.py
FA = os.path.join(ROOT, "scripts", "fleet-autoaudit.py")
fa = read(FA)

if "declares_containers" in fa:
    print("[skip] scripts/fleet-autoaudit.py already skips container workers")
else:
    A2 = "def apply_ahead(d=None):\n"
    once(fa, A2, "A2 apply_ahead def")

    HELPER = (
        'def declares_containers(worker):\n'
        '    """CONTAINER-CONFIG-DROPPED-1: True if <worker>/wrangler.toml declares [[containers]].\n'
        '\n'
        '    raw_put.py PUTs /content and cannot transmit script-level container config, so an\n'
        '    automatic redeploy of such a worker silently destroys its container binding.\n'
        '    Measured: deployment_history ids 172/175/177 vs the first container.error row 8s\n'
        '    after id 172. Container workers must go through wrangler deploy\n'
        '    (.github/workflows/deploy-containers-pilot.yml).\n'
        '    """\n'
        '    p = os.path.join(ROOT, worker, "wrangler.toml")\n'
        '    try:\n'
        '        with open(p, encoding="utf-8", errors="replace") as f:\n'
        '            txt = f.read()\n'
        '    except OSError:\n'
        '        return False\n'
        '    return "[[containers]]" in txt\n'
        '\n'
        '\n'
    )
    fa = fa.replace(A2, HELPER + A2, 1)

    A3 = "    applied, failed = [], []\n"
    once(fa, A3, "A3 applied/failed init")
    fa = fa.replace(A3, "    applied, failed = [], []\n    container_skips = []\n", 1)

    A4 = '        w, art, rv = it["worker"], it["artifact"], it["repo"]\n'
    once(fa, A4, "A4 loop body")
    SKIP = (
        '        if declares_containers(w):\n'
        '            print("::warning::SKIPPED " + w + " -- declares [[containers]]; raw_put.py "\n'
        '                  "cannot transmit container config (CONTAINER-CONFIG-DROPPED-1, #1485). "\n'
        '                  "Deploy via .github/workflows/deploy-containers-pilot.yml")\n'
        '            container_skips.append((w, rv))\n'
        '            continue\n'
    )
    fa = fa.replace(A4, SKIP + A4, 1)

    write(FA, fa)
    changed.append("scripts/fleet-autoaudit.py -> container skip guard")
    print("[ok] scripts/fleet-autoaudit.py skips container workers")

print("[done] changes: " + (", ".join(changed) if changed else "none (already applied)"))
