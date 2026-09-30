#!/usr/bin/env python3
"""CRON-ALIAS-DISPATCH-1 (issue #1500, CLOUD-OPS-CRON-DISPATCH-NOOP-1).

Measured 2026-09-30.  qnfo-cloud-ops is a TOTAL dispatch noop.

  Registered Cloudflare trigger set (worker_schedules, refreshed
  2026-09-29T20:31Z): ["30 5 * * 1"]  -- exactly one cron.
  buildCrons(2) generates 21 crons, and dispatchMap(2) contains none of them
  equal to "30 5 * * 1".  "30 5 * * 1" is the PRE-#1473 spelling of the
  `visibility` job (AMS days="1" passed through as ISO, before isoDowToCf).

  The handler therefore hits
      const job = map[cron];
      if (!job || !JOBS[job]) { console.log("no job for cron", cron, ...); return; }
  on every single fire and returns.  That one fact explains the dead
  research-scan lane (silent since 2026-09-24), the 21-day publish-lane
  silence and the outreach stall: every scheduled job in this worker is
  unreachable.

  The trigger list is repaired by re-deploying the worker through
  scripts/raw_put.py (which PUTs /schedules from wrangler.toml and now
  records the failure reason -- SCHEDULES-DIAG-LEGIBLE-1).  This patch fixes
  the two things the worker itself must own regardless:

  F1 ALIAS DISPATCH.  Register the ISO-day-of-week spelling of every cron as
     a dispatch alias, so a stale trigger list written before #1473 still
     resolves to its job instead of silently no-op'ing.  This restores
     dispatch for the currently-registered trigger immediately, and makes the
     worker immune to the same class recurring on any future DOW change.

  F2 NOOP OBSERVABILITY.  An unmatched cron used to be a console.log only --
     invisible in D1, which is why this failure ran dark.  It now records a
     `cron-noop` cloud_ops_events row.

  F3 SYNC FAILURE LEGIBILITY.  syncSchedules() failures were also silent (the
     guard is fingerprint-based, so a failing PUT retries forever without
     recording why).  The outcome is now persisted to scheduler_state as
     `cron_sync_error`.

Applies to BOTH worker.js and deployed-current.worker.js so the mirror-guard
parity invariant stays green.  Fail-closed: exits 1 unless the post-state
carries the required predicates.  Idempotent.
"""
import os
import re
import sys

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
WDIR = os.path.join(ROOT, "qnfo-cloud-ops")
TARGETS = [
    os.path.join(WDIR, "worker.js"),
    os.path.join(WDIR, "deployed-current.worker.js"),
]

MARK = "CRON-ALIAS-DISPATCH-1"
NEW_VERSION = "1.15.1-cron-alias-dispatch"

OLD_DISPATCH = '''function dispatchMap(offset) {
  const map = {};
  for (const c of buildCrons(offset)) map[c.cron] = c.job;
  return map;
}'''

NEW_DISPATCH = '''function cfDowToIso(spec) {
  const s = String(spec == null ? "*" : spec).trim();
  if (s === "*" || s === "") return "*";
  const conv = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return n;
    return String((v - 2 + 7) % 7 + 1);
  };
  return s.split(",").map((part) => {
    const p = part.trim();
    const m = /^(\\d+)-(\\d+)$/.exec(p);
    if (m) return conv(m[1]) + "-" + conv(m[2]);
    if (/^\\d+$/.test(p)) return conv(p);
    return p;
  }).join(",");
}
__name(cfDowToIso, "cfDowToIso");
function dispatchMap(offset) {
  const map = {};
  const all = buildCrons(offset);
  for (const c of all) map[c.cron] = c.job;
  /* CRON-ALIAS-DISPATCH-1 (#1500): a trigger list written before the #1473
     ISO->CF day-of-week fix still fires ISO-spelled crons (e.g. "30 5 * * 1").
     Register that spelling as an alias so a stale registration dispatches its
     job instead of silently returning "no job for cron". */
  for (const c of all) {
    const p = String(c.cron).split(" ");
    if (p.length === 5 && p[4] !== "*") {
      const iso = p.slice();
      iso[4] = cfDowToIso(p[4]);
      const alt = iso.join(" ");
      if (alt && !(alt in map)) map[alt] = c.job;
    }
  }
  return map;
}'''

OLD_SCHED = '''    const map = dispatchMap(off);
    try {
      await syncSchedules(env, false);
    } catch (e) {
      console.log("schedule self-repair err", e && e.message || e);
    }
    const job = map[cron];
    if (!job || !JOBS[job]) {
      console.log("no job for cron", cron, "offset", off);
      return;
    }'''

NEW_SCHED = '''    const map = dispatchMap(off);
    try {
      const sr = await syncSchedules(env, false);
      if (sr && sr.changed) {
        await stateSet(env, "cron_sync_error", sr.ok ? "" : "PUT failed status=" + sr.status + " at " + (/* @__PURE__ */ new Date()).toISOString());
      }
    } catch (e) {
      console.log("schedule self-repair err", e && e.message || e);
      try {
        await stateSet(env, "cron_sync_error", "threw: " + String(e && e.message || e).slice(0, 200));
      } catch (e2) {}
    }
    const job = map[cron];
    if (!job || !JOBS[job]) {
      console.log("no job for cron", cron, "offset", off);
      try {
        await recordEvent(env, "cron-noop", "cn-" + String(cron).replace(/[^0-9a-z]/gi, "") + "-" + Date.now().toString(36), "CRON-DISPATCH-NOOP-1: no job mapped for registered cron " + cron + " (offset " + off + ")", { cron, offset: off });
      } catch (e) {}
      return;
    }'''

REQUIRED = [
    "cfDowToIso",
    "CRON-ALIAS-DISPATCH-1",
    "cron_sync_error",
    "cron-noop",
]


def patch_js(path):
    if not os.path.exists(path):
        print("MISSING %s" % path)
        return -1
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    if MARK in src and "cfDowToIso" in src:
        print("ALREADY-PATCHED %s" % path)
        return 0
    if OLD_DISPATCH not in src:
        print("ANCHOR-MISS dispatchMap in %s -- refusing to guess" % path)
        return -1
    if OLD_SCHED not in src:
        print("ANCHOR-MISS scheduled-handler in %s -- refusing to guess" % path)
        return -1
    orig = src
    n = 0
    src = src.replace(OLD_DISPATCH, NEW_DISPATCH, 1)
    n += 1
    src = src.replace(OLD_SCHED, NEW_SCHED, 1)
    n += 1
    src, k = re.subn(r'var VERSION = "[^"]+";',
                     'var VERSION = "%s";' % NEW_VERSION, src, count=1)
    n += k
    missing = [r for r in REQUIRED if r not in src]
    if missing:
        print("POST-STATE-FAIL %s missing=%s" % (path, missing))
        return -1
    if src == orig:
        print("NO-OP %s" % path)
        return 0
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)
    print("PATCHED %s (%d edits)" % (path, n))
    return n


def main():
    total = 0
    for t in TARGETS:
        r = patch_js(t)
        if r < 0:
            print("FAIL-CLOSED %s" % t)
            return 1
        total += r
    for t in TARGETS:
        if os.path.exists(t):
            with open(t, "r", encoding="utf-8") as fh:
                s = fh.read()
            print("STATE %s alias=%d noop=%d syncerr=%d version=%s"
                  % (os.path.basename(t),
                     s.count("cfDowToIso"),
                     s.count("cron-noop"),
                     s.count("cron_sync_error"),
                     (re.search(r'var VERSION = "([^"]+)"', s) or [None, "?"])[1]))
    print("TOTAL_EDITS %d" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
