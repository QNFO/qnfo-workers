#!/usr/bin/env python3
"""CONTAINER-CONFIG-PRESERVE-1 (2026-09-29, issues #1485 / #1487) -- stop scripts/raw_put.py
from dropping a worker's [[containers]] block, and let it RESTORE one that was already lost.

WHY THIS EXISTS -- MEASURED, NOT INFERRED
  Cloudflare stores [[containers]] as SCRIPT-LEVEL metadata, NOT as a binding:

      GET /workers/scripts/qnfo-containers-pilot/bindings
        -> {d1 AUDIT, secret_text PILOT_TOKEN, durable_object_namespace SHELL_CONTAINER}

  so BINDING-PRESERVATION-1 can never protect it. raw_put.py's /content metadata was
  {"main_module", "compatibility_date", ["compatibility_flags"]} -- it carries bindings,
  compatibility config, cron schedules and the ledger, but had ZERO references to containers
  (measured: `container` occurrences in scripts/raw_put.py == 0). This is the same shape of
  defect as COMPAT-PRESERVE-1 (compatibility_date silently cleared) and
  AUTODEPLOY-SCHEDULES-NOT-APPLIED-1 (crons silently inert) -- a field the deployer does not
  know about is a field the deployer destroys.

  deployment_history evidence for the class (qnfo-audit):
      id 172  2026-09-29T19:30:35.100Z  qnfo-ops:cf_worker_deploy  1.0.2-apt-clean-enospc
      id 175  2026-09-29T19:34:11.789Z  qnfo-ops:cf_worker_deploy  1.0.3-clone-egress-...
      id 177  2026-09-29T19:34:27.607Z  scripts/raw_put.py         1.0.3-clone-egress-...
      id 179  2026-09-29T19:35:04.758Z  scripts/raw_put.py         1.0.3-clone-egress-...
      id 182  2026-09-29T19:37:37.283Z  scripts/raw_put.py         1.0.3-clone-egress-...
  First cloud_ops_events kind=container.error row carrying
  "Cannot read properties of undefined (reading 'running')" landed 19:30:43.591Z -- EIGHT
  SECONDS after id 172. Blast radius: shell_exec, exec_python, exec_node, container_install,
  git_clone_exec, container_workspace_exec, shell_pipeline, container_status -- all HTTP 500.

  scripts/container-config-drop-guard-patch.py closed the cf_worker_deploy path (name list)
  and the fleet-autoaudit --apply path. raw_put.py -- the DEFAULT-ON automatic deployer AND
  the deployer the apply-pending-patches workflow uses for every changed worker -- was left
  open. That is the hole this patch closes.

WHAT IT DOES
  1. reads `containers` from the live GET /settings the script ALREADY performs and carries it
     into the /content PUT metadata -- exactly parallel to COMPAT-PRESERVE-1;
  2. if live has none but the artifact's sibling wrangler.toml DECLARES [[containers]], it
     carries the declaration instead, so this deployer can also RESTORE a dropped config
     (mirrors scripts/restore_container_config.py parse_containers);
  3. after the PUT it re-reads /settings and FAILS CLOSED (exit 3) when the declaration says
     containers must be present but they are absent.

ADVERSARIAL / FAILURE MODES
  (a) If Cloudflare REJECTS `containers` inside /content metadata, the PUT returns non-200 and
      this script exits 3 WITHOUT having mutated the script -- safe, but it also means the
      restore is impossible through this path and must go through `wrangler deploy`. That
      question is UNVERIFIED as of writing; the /settings read-back assertion is what makes it
      decidable, recorded in ci-status/container-config-autoverify.json.
  (b) The fail-closed assertion is keyed on "the sibling wrangler.toml declares containers".
      A container worker whose wrangler.toml was deleted is still silently exposed.
  (c) The cf_worker_deploy guard remains a NAME LIST, not detection, for the same reason.
  (d) This patch edits a CI script, not a worker bundle, so it needs no deploy.
"""
import os
import sys

MARKER = "CONTAINER-CONFIG-PRESERVE-1"


def find_root():
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(6):
        d = os.path.dirname(d)
        if os.path.isfile(os.path.join(d, "qnfo-ops", "worker.js")):
            return d
    return os.getcwd()


ROOT = find_root()
TARGET = os.path.join(ROOT, "scripts", "raw_put.py")


def once(text, anchor, label):
    n = text.count(anchor)
    if n != 1:
        print("[fail] anchor " + label + " matched " + str(n) + " times, expected exactly 1")
        sys.exit(1)


if not os.path.isfile(TARGET):
    print("[fail] " + TARGET + " not found")
    sys.exit(1)

with open(TARGET, encoding="utf-8") as f:
    src = f.read()

if MARKER in src:
    print("[skip] scripts/raw_put.py already carries " + MARKER)
    print("[done] changes: none (already applied)")
    sys.exit(0)

A0 = "def main(argv):\n"
A1 = '    meta = {"main_module": "worker.js", "compatibility_date": compat_date}\n'
A1B = A1 + "    if compat_flags:\n"
A2 = (
    "    if got_flags != compat_flags:\n"
    '        print(f"FAIL: compatibility_flags changed across the deploy ({compat_flags} -> {got_flags}) - COMPAT-PRESERVE-1 violated")\n'
    "        return 3\n"
)
once(src, A0, "A0 main() def")
once(src, A1, "A1 metadata init")
once(src, A1B, "A1B metadata init + compat_flags branch")
once(src, A2, "A2 compat_flags read-back assertion")

HELPER = r'''
# --- CONTAINER-CONFIG-PRESERVE-1 (issues #1485 / #1487) ------------------------------
# Cloudflare stores [[containers]] as SCRIPT-LEVEL metadata, NOT as a binding, so
# BINDING-PRESERVATION-1 cannot protect it and a /content PUT that omits it DESTROYS it.
CONTAINER_BLOCK_RE = re.compile(r"\[\[containers\]\]([\s\S]*?)(?=\n\[\[|\Z)")
CONTAINER_KEY_RE = {
    "class_name": re.compile(r'^\s*class_name\s*=\s*"([^"]*)"', re.M),
    "image": re.compile(r'^\s*image\s*=\s*"([^"]*)"', re.M),
    "instance_type": re.compile(r'^\s*instance_type\s*=\s*"([^"]*)"', re.M),
}
CONTAINER_MAX_RE = re.compile(r"^\s*max_instances\s*=\s*(\d+)", re.M)


def declared_containers(artifact_path):
    """[[containers]] declared beside the artifact -> list of dicts, or [] when none."""
    d = os.path.dirname(os.path.abspath(artifact_path))
    for fn in ("wrangler.toml", "wrangler.json", "wrangler.jsonc"):
        p = os.path.join(d, fn)
        if not os.path.isfile(p):
            continue
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            return []
        if fn != "wrangler.toml":
            try:
                data = json.loads(text)
            except ValueError:
                return []
            cr = data.get("containers") if isinstance(data, dict) else None
            return [c for c in cr if isinstance(c, dict)] if isinstance(cr, list) else []
        out = []
        for block in CONTAINER_BLOCK_RE.findall(text):
            entry = {}
            for key, rx in CONTAINER_KEY_RE.items():
                m = rx.search(block)
                if m:
                    entry[key] = m.group(1)
            m = CONTAINER_MAX_RE.search(block)
            if m:
                entry["max_instances"] = int(m.group(1))
            if entry:
                out.append(entry)
        return out
    return []


'''

INSERT = '''    # CONTAINER-CONFIG-PRESERVE-1: /content PUT metadata that omits `containers` DESTROYS the
    # script-level container config (it is NOT a binding, so BINDING-PRESERVATION-1 never
    # covered it). Carry the live config forward; if it is already gone, carry the sibling
    # wrangler.toml declaration so this deployer can also RESTORE it.
    _live_containers = (live or {}).get("containers") or []
    _decl_containers = declared_containers(path)
    _want_containers = _live_containers or _decl_containers
    if _want_containers:
        meta["containers"] = _want_containers
        _csrc = "live /settings" if _live_containers else "wrangler.toml declaration"
        print("CONTAINERS: carrying " + str(len(_want_containers)) + " entr(y|ies) from "
              + _csrc + " -> " + json.dumps(_want_containers))
    else:
        print("CONTAINERS: none live and none declared - nothing to preserve")

'''

ASSERT = '''    # CONTAINER-CONFIG-PRESERVE-1 fail-closed assertion: a worker whose sibling wrangler.toml
    # declares [[containers]] must come out of this deploy still carrying its container config.
    if _decl_containers:
        got_containers = after.get("containers") or []
        if not got_containers:
            print("FAIL: " + worker + " declares [[containers]] but /settings reports none after "
                  "the deploy - CONTAINER-CONFIG-PRESERVE-1 violated (#1485)")
            print("      restore via .github/workflows/container-config-autoverify.yml, "
                  ".github/workflows/restore-container-config-1485.yml, or wrangler deploy")
            return 3
        print("post-deploy containers: " + json.dumps(got_containers))

'''

src = src.replace(A0, HELPER + A0, 1)
src = src.replace(A1B, A1 + INSERT + "    if compat_flags:\n", 1)
src = src.replace(A2, A2 + ASSERT, 1)

if MARKER not in src:
    print("[fail] marker missing after edit - refusing to write")
    sys.exit(1)

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)

print("[ok] scripts/raw_put.py now preserves and can restore [[containers]]")
print("[done] changes: scripts/raw_put.py -> " + MARKER)
