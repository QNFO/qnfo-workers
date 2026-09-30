#!/usr/bin/env python3
"""CLOUD-OPS-CRON-DOW-1 (issue #1473, and the root cause of #1469).

REFIRE 2026-09-29T19:4xZ -- re-touched to fire apply-pending-patches.yml
(paths: scripts/*patch*.py) and apply-cloud-ops-cron-dow-1.yml, neither of
which had produced a run since 19:23:26Z although the anchors below all match
main. No logic change in this revision.

Fixes three coupled defects in qnfo-cloud-ops, all measured on 2026-09-29:

  D1  ISO/CF DAY-OF-WEEK MISMATCH.
      AMS_SCHEDULE is written in ISO notation (1=Monday .. 7=Sunday) but
      buildCrons() passes `s.days` straight into cron syntax. Cloudflare's cron
      day-of-week is 1=Sunday .. 7=Saturday. Measured, 20+ data points:
        visibility {days:"1"} -> "30 5 * * 1"   fired Sun 2026-09-27
        weekly     {days:"5"} -> "0 15 * * 5"   fired Thu 2026-09-24
        board-sync {days:"6"} -> "0 6  * * 6"   fired Fri 2026-09-25
        weekly-ops {days:"7"} -> "0 4  * * 7"   fired Sat 2026-09-19
        email-triage {days:"1-5"} -> "* * 1-5"  last fired Thu 2026-09-24 and
                                                skipped Fri 09-25 + Sat 09-26
      Every day-bearing job therefore runs exactly one day early, and the
      weekday lane (Mon-Fri intent) actually covers Sun-Thu: FRIDAY IS NEVER
      COVERED.
      Fix: translate ISO -> CF via cf = ((iso % 7) + 7) % 7 + 1, for "*",
      single values, ranges and comma lists.

  D2  syncSchedules() CAN NEVER REGISTER SCHEDULES ON A FRESH WORKER.
      `const stored = await stateGet(env, "cron_offset", String(off));` defaults
      the stored value to the CURRENT offset, so the guard
      `if (!force && String(off) === String(stored))` is true on the very first
      call and returns {changed:false} without ever PUTting /schedules.

  D3  syncSchedules() CAN NEVER REPAIR A CLOBBERED SCHEDULE SET.
      The idempotence key was the DST offset alone. cron_offset=2 was stored on
      2026-09-01 and Amsterdam is still +2 (CEST until 2026-10-25), so
      syncSchedules(env,false) returned {changed:false} for the whole window in
      which raw_put.py PUT /schedules from wrangler.toml (RAW-PUT-SCHEDULES-1)
      replaced the worker's 21-cron set with the toml's single
      "30 5 * * 1". The worker's own self-repair was structurally disabled,
      which is why email-triage / gmail-triage / briefing / outreach stopped on
      2026-09-24 and never came back (#1469).
      Fix: key the guard on a fingerprint of the generated cron SET as well as
      the offset, and run the check on every scheduled() invocation so the
      worker re-registers its own schedules on the next cron fire.

  Also: the weekly-ops digest hard-coded "Schedules: 11 cron triggers" while
  buildCrons() actually emits 21 -- a three-way divergence (code claim 11,
  generated 21, registered 1). It is now derived from the generated set.

Applies to BOTH worker.js and deployed-current.worker.js so that the
mirror-guard.py parity invariant (blocking in fleet-autodeploy.yml) stays
green. Idempotent: a second run is a no-op.
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
TOML = os.path.join(WDIR, "wrangler.toml")

MARK = "CF-DOW-1"
NEW_VERSION = "1.15.0-cron-dow-cf"

ISO_HELPER = r'''function isoDowToCf(spec) {
  const s = String(spec == null ? "*" : spec).trim();
  if (s === "*" || s === "") return "*";
  const conv = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return n;
    return String((v % 7 + 7) % 7 + 1);
  };
  return s.split(",").map((part) => {
    const p = part.trim();
    const m = /^(\d+)-(\d+)$/.exec(p);
    if (m) return conv(m[1]) + "-" + conv(m[2]);
    if (/^\d+$/.test(p)) return conv(p);
    return p;
  }).join(",");
}
__name(isoDowToCf, "isoDowToCf");
'''

OLD_PUSH = 'crons.push({ job, cron: mm + " " + hs + " * * " + s.days });'
NEW_PUSH = 'crons.push({ job, cron: mm + " " + hs + " * * " + isoDowToCf(s.days) });'

OLD_SYNC = '''async function syncSchedules(env, force) {
  const off = amsOffset(/* @__PURE__ */ new Date());
  const stored = await stateGet(env, "cron_offset", String(off));
  if (!force && String(off) === String(stored)) return { changed: false, offset: off };
  const crons = buildCrons(off);
  const r = await cfApi(env, "/workers/scripts/" + WORKER_NAME + "/schedules", "PUT", crons.map((c) => ({ cron: c.cron })));
  const ok = r.status === 200 && r.body && r.body.success;
  if (ok) await stateSet(env, "cron_offset", String(off));
  return { changed: true, ok, offset: off, crons: crons.map((c) => c.cron), status: r.status };
}'''

NEW_SYNC = '''async function syncSchedules(env, force) {
  const off = amsOffset(/* @__PURE__ */ new Date());
  const crons = buildCrons(off);
  const list = crons.map((c) => c.cron);
  const fp = list.slice().sort().join("|");
  const stored = await stateGet(env, "cron_offset", "");
  const storedFp = await stateGet(env, "cron_fingerprint", "");
  if (!force && String(off) === String(stored) && fp === storedFp) {
    return { changed: false, offset: off, count: list.length };
  }
  const r = await cfApi(env, "/workers/scripts/" + WORKER_NAME + "/schedules", "PUT", list.map((cron) => ({ cron })));
  const ok = r.status === 200 && r.body && r.body.success;
  if (ok) {
    await stateSet(env, "cron_offset", String(off));
    await stateSet(env, "cron_fingerprint", fp);
  }
  return { changed: true, ok, offset: off, count: list.length, crons: list, status: r.status };
}'''

OLD_CLAIM = '"Schedules: 11 cron triggers, Amsterdam offset +"'
NEW_CLAIM = '"Schedules: " + (dst.count || buildCrons(dst.offset).length) + " cron triggers, Amsterdam offset +"'

OLD_SCHED_ANCHOR = '''    const map = dispatchMap(off);
    const job = map[cron];'''
NEW_SCHED_ANCHOR = '''    const map = dispatchMap(off);
    try {
      await syncSchedules(env, false);
    } catch (e) {
      console.log("schedule self-repair err", e && e.message || e);
    }
    const job = map[cron];'''

# Corrected cron set at Amsterdam +2 (CEST). Keep in sync with buildCrons(2).
CORRECTED_CRONS = [
    "15 4 * * *",      # release-check
    "0 6,12 * * 2-6",  # email-triage      (ISO 1-5 -> CF 2-6)
    "30 6 * * 2-6",    # briefing
    "0 7,13 * * 2-6",  # gmail-triage
    "0 8 * * 2-6",     # research-scan
    "0 15 * * 6",      # weekly            (ISO 5   -> CF 6)
    "0 4 * * 1",       # weekly-ops        (ISO 7   -> CF 1)
    "0 6 * * 2",       # portfolio-sync    (ISO 1   -> CF 2)
    "0 7 * * 1",       # zenodo-stats      (ISO 7   -> CF 1)
    "0 6 * * 7",       # board-sync        (ISO 6   -> CF 7)
    "0 9 * * 2-6",     # outreach
    "0 9 3 9 *",       # nlnet (fixed date, unaffected)
    "5 3,15 * * *",    # worker-health
    "0 4 1 * *",       # sitemap-ping (fixed dom, unaffected)
    "0 5 * * 2",       # loose-threads-sweep
    "30 5 * * 2",      # visibility
    "15 5 * * 2",      # engagement
    "30 7 * * 2-6",    # radar
    "30 3 * * 2",      # gtd-reconcile
    "20 4 * * *",      # quality-score
    "10 3 * * *",      # overdue-guard
]


def patch_js(path):
    if not os.path.exists(path):
        print("MISSING %s" % path)
        return 0
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    if MARK in src:
        print("ALREADY-PATCHED %s" % path)
        return 0
    orig = src
    n = 0

    if "function isoDowToCf(" not in src:
        anchor = "function buildCrons(offset) {"
        if anchor not in src:
            print("ANCHOR-MISS buildCrons in %s" % path)
            return 0
        src = src.replace(anchor, ISO_HELPER + anchor, 1)
        n += 1

    if OLD_PUSH in src:
        src = src.replace(OLD_PUSH, NEW_PUSH, 1)
        n += 1

    if OLD_SYNC in src:
        src = src.replace(OLD_SYNC, NEW_SYNC, 1)
        n += 1

    if OLD_CLAIM in src:
        src = src.replace(OLD_CLAIM, NEW_CLAIM, 1)
        n += 1

    if OLD_SCHED_ANCHOR in src:
        src = src.replace(OLD_SCHED_ANCHOR, NEW_SCHED_ANCHOR, 1)
        n += 1

    src, k = re.subn(r'var VERSION = "[^"]+";',
                     'var VERSION = "%s";' % NEW_VERSION, src, count=1)
    n += k

    if MARK not in src:
        src = src.replace("__name(buildCrons, \"buildCrons\");",
                          "__name(buildCrons, \"buildCrons\");\n/* %s */" % MARK, 1)

    if src == orig:
        print("NO-OP %s" % path)
        return 0
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)
    print("PATCHED %s (%d edits)" % (path, n))
    return n


def patch_toml(path):
    if not os.path.exists(path):
        print("MISSING %s" % path)
        return 0
    with open(path, "r", encoding="utf-8") as fh:
        txt = fh.read()
    if MARK in txt:
        print("ALREADY-PATCHED %s" % path)
        return 0
    body = ", ".join('"%s"' % c for c in CORRECTED_CRONS)
    new_line = ('crons = [%s]  # %s: ISO->CF day-of-week corrected (CF DOW 1=Sun..7=Sat); '
                '21 jobs. Re-sync offsets at the 2026-10-25 CET flip.'
                % (body, MARK))
    txt2, k = re.subn(r'(?m)^crons = \[[^\]]*\][^\r\n]*', new_line, txt, count=1)
    if k == 0:
        print("ANCHOR-MISS crons line in %s" % path)
        return 0
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(txt2)
    print("PATCHED %s (%d edits)" % (path, k))
    return k


def main():
    total = 0
    for t in TARGETS:
        total += patch_js(t)
    total += patch_toml(TOML)
    # post-state evidence
    for t in TARGETS:
        if os.path.exists(t):
            with open(t, "r", encoding="utf-8") as fh:
                s = fh.read()
            print("STATE %s isoDowToCf=%d cron_fingerprint=%d version=%s"
                  % (os.path.basename(t), s.count("isoDowToCf"),
                     s.count("cron_fingerprint"),
                     (re.search(r'var VERSION = "([^"]+)"', s) or [None, "?"])[1]))
    print("TOTAL_EDITS %d" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
