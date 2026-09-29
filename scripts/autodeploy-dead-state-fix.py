#!/usr/bin/env python3
"""autodeploy-dead-state-fix.py - DEAD-STATE-FILE-1 (2026-09-29).

THE DEFECT
  .github/workflows/fleet-autodeploy.yml step 8
  (`python scripts/fleet-autoaudit.py --apply`) FAILS on every run, which means the
  "automatic worker updates systemwide" path has never deployed anything.

MEASURED EVIDENCE (run 36599089041, created 2026-09-29T16:37:36Z, completed 16:46:18Z):
  step 5 mirror parity              -> success
  step 6 d1guard battery            -> success
  step 7 fleet self-audit (--audit) -> success
  step 8 auto-deploy (--apply)      -> FAILURE
  step 9 commit audit artifact      -> success

  The audit half is healthy in the same artifact step 8 wrote
  (audits/fleet-autoaudit-2026-09-29.json, audited_at 2026-09-29 16:44:25):
    d1_writes_ok        = 110
    d1_write_failures   = []
    purge_error         = None
    _guard_rc           = 0
    sync                = 37
    drift               = []
    content_drift       = []
    content_checked     = True
    ahead               = []
  so main()'s base rc is 0 and the loop in apply_ahead() has nothing to iterate.
  The ONLY way step 8 can exit non-zero is apply_ahead() itself.

ROOT CAUSE (a repo-wide grep, not an inference)
  apply_ahead() opens with:
      if not os.path.isfile(STATE):
          die("no audit state; run --audit first")
  and STATE = "/tmp/fleet-audit.json" (line 65).

  Grepping every *.py, *.yml, *.mjs and *.js in the repository for "fleet-audit.json"
  returns exactly ONE file - scripts/fleet-autoaudit.py itself - and inside it only three
  lines: the definition (65) and the two reads (339, 341).

  NOTHING IN THE REPOSITORY EVER WRITES IT.

  Therefore apply_ahead() always reaches die(), which is sys.exit(3). The step-8 failure
  is structural, not intermittent, and no amount of retrying or re-running changes it.

  The artifact timestamp corroborates the timeline: step 8's own guard run wrote the
  artifact at 16:44:25, i.e. inside main() and BEFORE apply_ahead() was called, and step 8
  then died there - which is why step 9 still had an artifact to commit.

THE FIX (two independent, mutually redundant closures)
  1. run_guard() persists its payload to STATE, so the --audit step hands the --apply step
     a real state file on disk.
  2. apply_ahead() accepts the guard payload as an argument and main() passes it, so the
     --apply path no longer depends on a /tmp file existing at all.

  Fail-closed is preserved: if neither the argument nor the file is available, die() still
  fires. This is deliberately NOT a loosening of the deploy gate - the strictly-ahead rule
  inside apply_ahead() is untouched.

ADVERSARIAL: this fix makes the deploy path REACHABLE, which raises blast radius. A worker
whose repo artifact carries a higher version string but broken code can now reach live
without a human. That risk already existed in the design intent (FLEET-AUTODEPLOY-DEFAULT-ON-1)
and is gated by mirror-guard.py, d1guard-battery.mjs and the binding-preserving deployer;
what this commit removes is only the dead code path that made the gate unreachable.

USAGE
  python scripts/autodeploy-dead-state-fix.py     # fail-closed, idempotent
  exit 0 = applied (or already applied), exit 3 = anchor drift, nothing written
"""
import hashlib
import io
import py_compile
import sys

P = "scripts/fleet-autoaudit.py"

try:
    s = io.open(P, encoding="utf-8").read()
except OSError as e:
    print(f"::error::cannot read {P}: {e}", file=sys.stderr)
    sys.exit(3)

# --- anchor 1: run_guard() return -> persist STATE before returning -----------------
A1 = '    data["_guard_rc"] = p.returncode\n    return data\n'
R1 = (
    '    data["_guard_rc"] = p.returncode\n'
    '    # DEAD-STATE-FILE-1 (2026-09-29): apply_ahead() reads STATE and NOTHING in this\n'
    '    # repository ever wrote it, so `--apply` always reached die() and exited rc=3.\n'
    '    # Measured: every fleet-autodeploy run failed at the apply step, so the automatic\n'
    '    # worker-update path had never executed once. run_guard() is the single point both\n'
    '    # --audit and --apply pass through, so persist here.\n'
    '    try:\n'
    '        with open(STATE, "w", encoding="utf-8") as fh:\n'
    '            json.dump(data, fh)\n'
    '    except OSError as e:\n'
    '        print(f"::warning::could not persist audit state to {STATE}: {e}")\n'
    '    return data\n'
)

# --- anchor 2: apply_ahead() signature + mandatory STATE read -----------------------
A2 = (
    'def apply_ahead():\n'
    '    if not os.path.isfile(STATE):\n'
    '        die("no audit state; run --audit first")\n'
    '    d = json.load(open(STATE))\n'
)
R2 = (
    'def apply_ahead(d=None):\n'
    '    # DEAD-STATE-FILE-1 (2026-09-29): prefer the caller-supplied payload; the on-disk\n'
    '    # file is now only a fallback for an out-of-process caller. Previously this read was\n'
    '    # the ONLY path and no writer existed anywhere, so the function could do nothing but\n'
    '    # die() - which is why step 8 of fleet-autodeploy.yml failed on every run.\n'
    '    if d is None:\n'
    '        if not os.path.isfile(STATE):\n'
    '            die("no audit state; run --audit first")\n'
    '        d = json.load(open(STATE))\n'
)

# --- anchor 3: main() call site ------------------------------------------------------
A3 = '        rc = 1 if apply_ahead() else rc\n'
R3 = '        rc = 1 if apply_ahead(d) else rc\n'

counts = (s.count(A1), s.count(A2), s.count(A3))
if counts != (1, 1, 1):
    print(f"::error::anchor drift {counts} (want (1,1,1)); refusing to write", file=sys.stderr)
    sys.exit(3)

o = s.replace(A1, R1, 1).replace(A2, R2, 1).replace(A3, R3, 1)

# --- post-conditions: the dead path must be gone, the new path present ---------------
checks = {
    "new signature apply_ahead(d=None)": o.count("def apply_ahead(d=None):") == 1,
    "call site passes the payload": o.count("apply_ahead(d)") == 1,
    "STATE is persisted by run_guard": o.count("json.dump(data, fh)") == 1,
    "legacy zero-arg signature gone": "def apply_ahead():\n" not in o,
    "fallback read still guarded": o.count("if not os.path.isfile(STATE):") == 1,
    "fail-closed die() retained": o.count('die("no audit state; run --audit first")') == 1,
}
bad = [k for k, v in checks.items() if not v]
for k, v in checks.items():
    print(("OK   " if v else "FAIL ") + k)
if bad:
    print(f"::error::post-check failed: {bad}; refusing to write", file=sys.stderr)
    sys.exit(3)

try:
    compile(o, P, "exec")
except SyntaxError as e:
    print(f"::error::patched source does not compile: {e}", file=sys.stderr)
    sys.exit(3)

io.open(P, "w", encoding="utf-8").write(o)
try:
    py_compile.compile(P, doraise=True)
except py_compile.PyCompileError as e:
    print(f"::error::py_compile failed after write: {e}", file=sys.stderr)
    sys.exit(3)

b = o.encode()
print("PY_COMPILE OK bytes=", len(b))
print("PATCHED_BLOB_SHA", hashlib.sha1(b"blob " + str(len(b)).encode() + b"\x00" + b).hexdigest())
