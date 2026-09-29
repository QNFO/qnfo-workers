#!/usr/bin/env python3
"""DEPLOY-GUARD-MS-FAILCLOSED-1 (2026-09-29)

Hardens ms() and the `logged` predicate in qnfo-deploy-guard/worker.js.

WHY THIS EXISTS
---------------
qnfo-deploy-guard/worker.js:18 defined

    function ms(s) { if (!s) return 0; ...; return isNaN(v) ? 0 : v; }

and line 133 consumed it as

    var logged = !!(lg && ms(lg.ts) >= ms(mo) - 180000);

with `mo` = the worker's live `modified_on` from the CF fleet probe.

When `mo` is TRUTHY but unparseable (a CF API anomaly, a format change, a
non-ISO value), ms(mo) collapses to 0, so the comparison becomes
`ms(lg.ts) >= -180000` -- satisfied by ANY ledger row for that worker. An
UNLOGGED deploy mutation is then classified "logged" and NO anomaly is filed.
That is a fail-OPEN in the one guard whose entire job is to notice unlogged
deploys: the failure is silent and invisible.

Verified behaviourally before the patch (real ms() body, 7 cases):
    normal ledger-after-deploy      -> logged    (correct)
    normal ledger-before-deploy     -> unlogged  (correct)
    space-format ledger ts          -> logged    (correct)
    microsecond ledger ts           -> logged    (correct)
    MALFORMED mo                    -> logged    *** FAIL-OPEN ***
    NULL ledger ts                  -> unlogged  (correct)
(Note: `mo` NULL is unreachable -- the caller guards with `was.mo && mo &&`
before entering the branch -- so only the truthy-but-unparseable case bites.)

THE FIX
-------
1. ms(): unparseable input returns NaN instead of 0.
2. logged: require BOTH sides finite before comparing, so an unparseable
   `mo` yields `logged = false` -> the mutation is surfaced as an anomaly.
   Fail-CLOSED: a broken clock hides nothing.

This is strictly a hardening. The four real-world timestamp formats observed
live in fleet_deploys.ts (space len19 n=116, ISO-T len24 n=541, ISO-T len27
micro n=3, ISO-T len19 n=1) all still parse to exact milliseconds.

NOT A FIX FOR: the mixed-format column itself. That was investigated and is
NOT currently a defect -- every consumer of fleet_deploys orders by `id`
(ORDER BY id / ORDER BY id DESC), never by `ts`, and every table that DOES
have an ORDER BY ts DESC consumer is internally uniform (fleet_drift_report
4084x space, fleet_audit_runs 34x ISO-T, fleet_probe_log / fleet_heartbeat
ISO-T writers; cron_fire_log carries fired_epoch_ms instead of ts). The mixed
column is a latent landmine for a FUTURE ts-ordering consumer, not a live bug.

Idempotent. Fail-closed: exit 3 and writes NOTHING if any anchor is not
unique. Also refreshes the deployed-current mirror in the same commit so
mirror-guard stays green.
"""
import os
import shutil
import subprocess
import sys

ROOT = os.environ.get("ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "qnfo-deploy-guard", "worker.js")
MIRROR = os.path.join(ROOT, "qnfo-deploy-guard", "deployed-current.worker.js")

OLD_MS = 'function ms(s) { if (!s) return 0; var v = new Date(String(s).replace(" ", "T") + (String(s).indexOf("Z") >= 0 ? "" : "Z")).getTime(); return isNaN(v) ? 0 : v; }'
NEW_MS = 'function ms(s) { if (!s) return NaN; var v = new Date(String(s).replace(" ", "T") + (String(s).indexOf("Z") >= 0 ? "" : "Z")).getTime(); return isNaN(v) ? NaN : v; }'

OLD_LOG = 'var logged = !!(lg && ms(lg.ts) >= ms(mo) - 180000);'
NEW_LOG = 'var logged = !!(lg && isFinite(ms(lg.ts)) && isFinite(ms(mo)) && ms(lg.ts) >= ms(mo) - 180000);'

OLD_VER = 'var VERSION = "1.3.14-verifyadvance";'
NEW_VER = 'var VERSION = "1.3.15-ms-failclosed";'


def die(code, msg):
    print("FAIL: " + msg)
    sys.exit(code)


if not os.path.isfile(TARGET):
    die(3, "target not found: " + TARGET)

src = open(TARGET, encoding="utf-8").read()

if "isFinite(ms(mo))" in src and "return isNaN(v) ? NaN : v; }" in src:
    print("ALREADY APPLIED - nothing to do")
    sys.exit(0)

for old, new, label in ((OLD_MS, NEW_MS, "ms()"), (OLD_LOG, NEW_LOG, "logged"), (OLD_VER, NEW_VER, "VERSION")):
    n = src.count(old)
    if n != 1:
        die(3, "anchor %s matched %d times (expected 1) - refusing to write" % (label, n))
    src = src.replace(old, new)

# post-conditions: the guard PROPERTY must hold, not a frozen version literal
if "isFinite(ms(lg.ts)) && isFinite(ms(mo))" not in src:
    die(3, "post-condition failed: fail-closed predicate not present")
if 'return isNaN(v) ? NaN : v; }' not in src:
    die(3, "post-condition failed: ms() still collapses to 0")
if "ms(mo) - 180000" not in src:
    die(3, "post-condition failed: tolerance window lost")

open(TARGET, "w", encoding="utf-8").write(src)
print("wrote " + TARGET)

if os.path.isfile(MIRROR):
    shutil.copyfile(TARGET, MIRROR)
    print("refreshed mirror " + MIRROR)
else:
    print("WARN: mirror not found, skipped: " + MIRROR)

r = subprocess.run(["node", "--check", TARGET], capture_output=True, text=True)
if r.returncode != 0:
    die(3, "node --check FAILED: " + (r.stderr or r.stdout))
print("node --check OK")

PROBE = NEW_MS + """
function logged(lg, mo) { return !!(lg && isFinite(ms(lg.ts)) && isFinite(ms(mo)) && ms(lg.ts) >= ms(mo) - 180000); }
var t = [
 ["ledgerAfterDeploy", {ts:"2026-09-29T09:08:00.658Z"}, "2026-09-29T09:07:50.000Z", true],
 ["ledgerBeforeDeploy", {ts:"2026-09-29T08:58:00.000Z"}, "2026-09-29T09:08:00.000Z", false],
 ["spaceFormatLedger", {ts:"2026-09-29 09:08:00"}, "2026-09-29T09:07:50.000Z", true],
 ["microFormatLedger", {ts:"2026-09-26T16:52:02.920031Z"}, "2026-09-26T16:52:00.000Z", true],
 ["malformedMo_FAILCLOSED", {ts:"2026-01-01T00:00:00Z"}, "not-a-date", false],
 ["nullLedgerTs", {ts:null}, "2026-09-29T09:07:50.000Z", false]
];
var bad = 0;
for (var i = 0; i < t.length; i++) {
  var g = logged(t[i][1], t[i][2]);
  if (g !== t[i][3]) { bad++; console.log("  FAIL " + t[i][0] + " got=" + g + " want=" + t[i][3]); }
  else { console.log("  ok   " + t[i][0] + " = " + g); }
}
console.log("BEHAVIOUR_FAILURES=" + bad);
process.exit(bad === 0 ? 0 : 1);
"""

r2 = subprocess.run(["node", "-e", PROBE], capture_output=True, text=True)
print((r2.stdout or "").strip())
if r2.returncode != 0:
    die(3, "behavioural test failed: " + (r2.stderr or ""))

print("OK - DEPLOY-GUARD-MS-FAILCLOSED-1 applied, guard is fail-closed")
