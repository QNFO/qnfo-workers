#!/usr/bin/env python3
"""FLEETFIX-1299-1193 applier (fail-closed, idempotent).

Two independent standing defects, both confirmed by live evidence:

#1299 DISSEMINATION-BLUESKY-REPLY-ARITY-1
  qnfo-social drainDissemination() called:
      postText(s, text, { embed: {...} })
  but postText's signature is postText(s, text, reply, opts) -- so the embed object
  was bound to the REPLY slot. Bluesky therefore received
  record.reply = {embed:...} with no root/parent, the API rejected it with
      400 InvalidRequest: Invalid app.bsky.feed.post record:
      Missing required key "root" at $.record.reply
  and the embed was never applied at all.
  Live evidence (qnfo-audit dissemination_tracker): id=rev-quniverse-fleet-lessons,
  channel=bluesky, action=failed, retry_count=3, post_text_snippet carries exactly
  that 400. Because the retry sweep is terminal at retry_count=3, the row is
  permanently stalled.
  FIX: pass null in the reply slot and the embed in the opts slot.

#1193 CRON-LASTFIRED-SHARED-TIMESTAMP-1
  fleet-exec/worker.js merges fleet-executor/0.3.1 with a scheduler module whose own
  header documents a PER-MINUTE tick, but fleet-exec/wrangler.toml registered
      crons = ["0 * * * *"]
  i.e. one tick per hour at :00. Every fleet_crons job registered at a sub-hourly
  minute (:09/:17/:23/:42) was silently swept up in that single hourly catch-up
  batch, so six rows recorded an identical last_fired and next_fire lied about when
  jobs actually run.
  FIX: cadence */10 (the maximum allowed by CRON-RATE-CEILING-1) so sub-hourly jobs
  fire in their own tick instead of a shared hourly sweep.

FAIL-CLOSED: aborts (exit 3) unless the pre-patch VERSION matches, every anchor
occurs exactly once, and `node --check` passes on every patched artifact.
IDEMPOTENT: exits 0 with no change if the post-patch VERSION is already present.

NOTE: paths are relative to the repository root; the workflow runs this from root.
"""
import pathlib
import subprocess
import sys


def die(m):
    print("FAIL-CLOSED: " + m)
    sys.exit(3)


def patch(path, pre, post, pairs, label):
    p = pathlib.Path(path)
    if not p.exists():
        die("missing " + path)
    s = p.read_text(encoding="utf-8")
    if post in s:
        print("[%s] already applied (idempotent skip)" % label)
        return False
    if s.count(pre) != 1:
        die("[%s] pre-version anchor occurs %d times (want 1): %r" % (label, s.count(pre), pre))
    s = s.replace(pre, post, 1)
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            die("[%s] anchor occurs %d times (want 1): %r" % (label, n, old[:90]))
        s = s.replace(old, new, 1)
    p.write_text(s, encoding="utf-8")
    print("[%s] patched %s" % (label, path))
    return True


# ---- #1299: qnfo-social drainDissemination passes the embed as postText()'s reply arg ----
S_PRE = "var VERSION = '0.7.15-no-retire-on-redirect';"
S_POST = "var VERSION = '0.7.16-dissem-reply-arity';"
S_OLD = r"""const r = await postText(s, text, { embed: { title: String(row.paper_title || 'QNFO'), desc: 'QNFO research \u2014 open access' } });"""
S_NEW = r"""const r = await postText(s, text, null, { embed: { title: String(row.paper_title || 'QNFO'), desc: 'QNFO research \u2014 open access' } });"""

# ---- #1193: fleet-exec cadence ----
F1_PRE, F1_POST = 'const VERSION = "fleet-executor/0.3.1";', 'const VERSION = "fleet-executor/0.3.2";'
F2_PRE, F2_POST = 'const VERSION = "1.0.1";', 'const VERSION = "1.0.2";'

changed = []

for f in ("qnfo-social/worker.js", "qnfo-social/deployed-current.worker.js"):
    if patch(f, S_PRE, S_POST, [(S_OLD, S_NEW)], "1299:" + f):
        changed.append(f)

for f in ("fleet-exec/worker.js", "fleet-exec/deployed-current.worker.js"):
    s = pathlib.Path(f).read_text(encoding="utf-8")
    if F2_POST in s:
        print("[1193:%s] already applied (idempotent skip)" % f)
        continue
    if s.count(F1_PRE) != 1:
        die("[1193:%s] exec VERSION anchor x%d" % (f, s.count(F1_PRE)))
    if s.count(F2_PRE) != 1:
        die("[1193:%s] sched VERSION anchor x%d" % (f, s.count(F2_PRE)))
    s = s.replace(F1_PRE, F1_POST, 1).replace(F2_PRE, F2_POST, 1)
    pathlib.Path(f).write_text(s, encoding="utf-8")
    print("[1193:%s] patched" % f)
    changed.append(f)

T = pathlib.Path("fleet-exec/wrangler.toml")
t = T.read_text(encoding="utf-8")
if 'crons = ["*/10 * * * *"]' in t:
    print("[1193:toml] already applied")
else:
    if t.count('crons = ["0 * * * *"]') != 1:
        die("[1193:toml] cron anchor x%d" % t.count('crons = ["0 * * * *"]'))
    T.write_text(t.replace('crons = ["0 * * * *"]', 'crons = ["*/10 * * * *"]', 1), encoding="utf-8")
    print("[1193:toml] crons -> */10")
    changed.append(str(T))

for f in ("qnfo-social/worker.js", "qnfo-social/deployed-current.worker.js",
          "fleet-exec/worker.js", "fleet-exec/deployed-current.worker.js"):
    r = subprocess.run(["node", "--check", f], capture_output=True, text=True)
    if r.returncode != 0:
        die("node --check failed on %s: %s" % (f, r.stderr[:300]))
    print("node --check OK: " + f)

print("CHANGED=" + str(len(changed)))
