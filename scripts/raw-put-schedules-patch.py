#!/usr/bin/env python3
"""raw-put-schedules-patch.py -- RAW-PUT-SCHEDULES-1

DEFECT (issue #1390, AUTODEPLOY-SCHEDULES-NOT-APPLIED-1) -- VERIFIED 2026-09-29
  scripts/raw_put.py performed exactly ONE Cloudflare mutation:
      PUT /accounts/<acct>/workers/scripts/<name>/content
  It never PUT /accounts/<acct>/workers/scripts/<name>/schedules, so every cron
  declared in a worker's wrangler.toml was INERT whenever the deploy went through
  raw_put.py. That path is not a corner case: it is the fleet's DEFAULT-ON
  automatic worker-update path --

      .github/workflows/fleet-autodeploy.yml
        -> python scripts/fleet-autoaudit.py --apply      (apply_ahead())
        -> subprocess: python scripts/raw_put.py <worker> <artifact>

  Consequence: editing `crons = [...]` in the repo has no effect on the live
  trigger for any worker updated by the auto-updater. This is also why the
  #1193 / #1337 fleet-exec hourly -> */10 change could be committed and still not
  take effect through this path. scripts/canonical_deploy.py documents the
  omission as its own raison d'etre (route POST /ops/deploy does the /schedules
  PUT); raw_put.py itself had zero occurrences of "schedules".

FIX
  Add _declared_crons() + put_schedules() and call put_schedules() in main()
  after the post-deploy settings verify, before the ledger write.

  Behaviour (deliberately conservative):
    * reads <dir-of-artifact>/wrangler.toml
    * extracts `crons = [...]` from it
    * toml missing / no crons key / empty list  -> live trigger left UNTOUCHED
      (never disable crons the repo does not declare -- that would be a
      destructive guess on a file we cannot see)
    * otherwise PUT /schedules with the declared crons and GET them back
    * a PUT failure or a read-back mismatch is LOUD and non-fatal by default;
      set SCHEDULES_STRICT=1 to make it exit 3

INVARIANTS
  * fail-closed: every anchor must match EXACTLY once, else exit 3, no write
  * idempotent: re-run prints ALREADY APPLIED and exits 0
  * no new imports: raw_put.py already imports json, os, re, sys, urllib.request
  * ast.parse is run on the result before anything is written
"""
import ast
import os
import sys

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
TARGET = os.path.join(ROOT, "scripts", "raw_put.py")

MARKER = "RAW-PUT-SCHEDULES-1"

# --- anchors (each must match exactly once) --------------------------------
A_MAIN = "def main(argv):\n"
A_VER = "    ver = artifact_version(code)\n"
A_TAIL = (
    "    guard_unlock()\n"
    "    print(f\"OK: {worker} {ver} deployed with compatibility_date={got_date} "
    "and {len(got_flags)} flag(s) preserved\")\n"
)

HELPER = '''# RAW-PUT-SCHEDULES-1 (issue #1390): raw_put.py performed exactly ONE mutation
# (PUT .../content) and never PUT .../schedules, so every cron declared in a
# worker's wrangler.toml was INERT on this path -- including the fleet's
# DEFAULT-ON auto-updater (fleet-autodeploy.yml -> fleet-autoaudit.py --apply ->
# raw_put.py). Declared crons are now applied and read back.
def _declared_crons(artifact_path):
    d = os.path.dirname(os.path.abspath(artifact_path))
    toml = os.path.join(d, "wrangler.toml")
    if not os.path.exists(toml):
        return None, "no wrangler.toml next to the artifact"
    try:
        txt = open(toml, encoding="utf-8").read()
    except OSError as exc:
        return None, "unreadable wrangler.toml (%s)" % exc
    m = re.search(r"crons\\s*=\\s*\\[([^\\]]*)\\]", txt, re.S)
    if not m:
        return None, "wrangler.toml declares no crons - live trigger left untouched"
    exprs = re.findall(r\'"([^"]*)"\', m.group(1)) + re.findall(r"\'([^\']*)\'", m.group(1))
    exprs = [e.strip() for e in exprs if e.strip()]
    if not exprs:
        return None, "wrangler.toml declares an empty crons list - live trigger left untouched"
    return exprs, "%d declared cron(s)" % len(exprs)


def put_schedules(worker, artifact_path, tok):
    """RAW-PUT-SCHEDULES-1: apply the artifact's declared crons to the live trigger."""
    crons, note = _declared_crons(artifact_path)
    if crons is None:
        print("SCHEDULES: skipped - " + note)
        return True
    strict = os.environ.get("SCHEDULES_STRICT") == "1"
    url = ("https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s/schedules"
           % (ACCT, worker))
    st, body = _api(url, tok, data=json.dumps({"crons": crons}).encode("utf-8"),
                    ctype="application/json")
    print("SCHEDULES: PUT %s crons=%s -> HTTP %s %s" % (url, crons, st, str(body)[:200]))
    if st != 200:
        print("SCHEDULES-FAIL: declared crons are INERT (issue #1390)%s"
              % (" [STRICT]" if strict else ""))
        return not strict
    try:
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok}, method="GET")
        with urllib.request.urlopen(req, timeout=30) as resp:
            live = resp.read().decode("utf-8", "replace")
        got = [g.get("cron") for g in (json.loads(live).get("result") or []) if isinstance(g, dict)]
    except Exception as exc:
        print("SCHEDULES-VERIFY-UNAVAILABLE: %s (PUT already returned 200)" % exc)
        return True
    if sorted(got) != sorted(crons):
        print("SCHEDULES-MISMATCH: declared=%s live=%s (issue #1390)%s"
              % (sorted(crons), sorted(got), " [STRICT]" if strict else ""))
        return not strict
    print("SCHEDULES: verified live crons=%s" % sorted(got))
    return True


'''


def die(code, msg):
    print("FAIL(%d): %s" % (code, msg))
    sys.exit(code)


def main():
    if not os.path.exists(TARGET):
        die(3, "missing file: %s" % TARGET)
    with open(TARGET, "r", encoding="utf-8") as f:
        txt = f.read()

    if MARKER in txt:
        print("ALREADY APPLIED (marker %s present) - nothing to do" % MARKER)
        return 0

    counts = {name: txt.count(a) for name, a in (("A_MAIN", A_MAIN), ("A_VER", A_VER), ("A_TAIL", A_TAIL))}
    bad = {k: v for k, v in counts.items() if v != 1}
    if bad:
        die(3, "anchor count != 1 -> %r (concurrent writer? re-anchor before retrying)" % bad)

    out = txt.replace(A_MAIN, HELPER + A_MAIN, 1)
    out = out.replace(A_VER, "    _sched_ok = put_schedules(worker, path, tok)  # " + MARKER + "\n" + A_VER, 1)
    out = out.replace(
        A_TAIL,
        "    if not _sched_ok and os.environ.get(\"SCHEDULES_STRICT\") == \"1\":\n"
        "        print(\"FAIL: schedules not applied and SCHEDULES_STRICT=1 - " + MARKER + "\")\n"
        "        return 3\n" + A_TAIL,
        1,
    )

    if out.count(MARKER) < 3:
        die(3, "post-apply marker count too low (%d)" % out.count(MARKER))
    if "/schedules" not in out:
        die(3, "post-apply text has no /schedules reference")
    try:
        ast.parse(out)
    except SyntaxError as exc:
        die(3, "post-apply ast.parse failed: %s" % exc)

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(out)
    print("APPLIED: %s" % TARGET)
    print("markers=%d bytes=%d" % (out.count(MARKER), len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
