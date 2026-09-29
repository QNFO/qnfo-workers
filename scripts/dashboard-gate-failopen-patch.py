#!/usr/bin/env python3
"""dashboard-gate-failopen-patch.py - GATE-EVAL-METRIC-STALENESS-FAILOPEN-1 (issue #1301), rev 2.

SIX verified defects, all in qnfo-fleet-dashboard/worker.js, all inside the /red SURVIVAL METERS
panel, which WRITES qnfo-audit.survival_state and therefore the SAI external_impact term -- so
these defects do not merely mis-render a page, they mis-record the system's own survival score.

1. The metric_registry SELECT fetched `last_value` but NOT `last_refreshed` or `refresh_cadence`,
   so the renderer was structurally incapable of noticing staleness.
2. `regVal()` applied no freshness check at all.
3. `const driftBad = (ig.drift && ig.drift.ghost || 0) + ...` -- a FAILED drift read coalesces to 0.
4. `head: c01(1 - (driftBad || 0))` -- the coalesced 0 yields head = 1, i.e. 100% headroom.
5. `gateRows.forEach(... if (typeof x.head === "number") ...)` -- a null gate was SKIPPED and its
   weight dropped from `wsum`, so MISSING DATA RAISED the reported headroom.
6. (rev 2) The COLLAPSED GREENS line rendered `(driftBad || 0)` raw -- the same fail-open in a
   second place. rev 1 left this occurrence behind, which is why rev 1's own post-condition
   `"(driftBad || 0)" not in t` could never pass.

rev 2 also fixes a rev-1 IDEMPOTENCY defect: rev 1 tested `new in text` ONLY when the anchor
matched zero times. Edit 6's replacement text CONTAINS its own anchor, so on a second run the
anchor still matched once and the panel line was appended AGAIN (observed: the panel line
duplicated on pass 2). rev 2 tests `new in text` FIRST, for every edit.

rev 2 additionally uses LITERAL anchors only (rev 1's edit 5 used a regex, which is the class of
escaping bug that has repeatedly broken this family of appliers).

FAIL-CLOSED: every edit must match EXACTLY ONCE; anything else raises and nothing is written.
IDEMPOTENT: re-running on an already-patched file is a no-op.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.path.join(ROOT, "qnfo-fleet-dashboard", "worker.js")
MIRROR = os.path.join(ROOT, "qnfo-fleet-dashboard", "deployed-current.worker.js")
MARK = "GATE-EVAL-METRIC-STALENESS-FAILOPEN-1"
Q = chr(39)
DQ = chr(34)


def j(s):
    return s.replace("~", Q)


E1_OLD = 'last_value FROM metric_registry ORDER BY kind DESC, layer, metric"'
E1_NEW = ('last_value, last_refreshed, refresh_cadence FROM metric_registry '
          'ORDER BY kind DESC, layer, metric"')

E2_OLD = """  const regVal = function(name) {
    const mm = (mr || []).filter(function(x) { return x.metric === name; })[0];
    if (!mm || mm.last_value == null) return null;
    const n = Number(String(mm.last_value).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  };"""

E2_NEW = """  // GATE-EVAL-METRIC-STALENESS-FAILOPEN-1 (issue #1301): a registry value is only usable if it
  // is FRESH against its declared cadence. The SELECT above did not even fetch last_refreshed,
  // so a row ~48h stale against `daily` rendered as live. A stale or unparseable timestamp now
  // resolves to null and the metric is recorded in staleMetrics.
  const staleMetrics = [];
  const gateCadenceMin = function(c) {
    const s = String(c == null ? "" : c).trim().toLowerCase();
    if (!s) return null;
    if (s === "hourly") return 60;
    if (s === "daily") return 1440;
    if (s === "30m") return 30;
    if (s.indexOf("*/") !== 0) return null;
    const body = s.slice(2);
    let i = 0;
    while (i < body.length && body.charAt(i) >= "0" && body.charAt(i) <= "9") i++;
    if (i === 0) return null;
    const n = Number(body.slice(0, i));
    const unit = body.slice(i);
    if (unit === "h") return n * 60;
    if (unit === "") return n;
    return null;
  };
  const gateTsMs = function(v) {
    if (!v) return null;
    let s = String(v).trim().replace(" ", "T");
    const last = s.slice(-1);
    if (last !== "Z" && last !== "z" && s.indexOf("+", 10) < 0) s += "Z";
    const t = Date.parse(s);
    return isNaN(t) ? null : t;
  };
  const gateIsStale = function(mm) {
    if (!mm) return true;
    const cad = gateCadenceMin(mm.refresh_cadence);
    if (cad == null) return false;
    const t = gateTsMs(mm.last_refreshed);
    if (t == null) return true;
    return (Date.now() - t) > cad * 60000 * 2;
  };
  const regVal = function(name) {
    const mm = (mr || []).filter(function(x) { return x.metric === name; })[0];
    if (!mm || mm.last_value == null) return null;
    if (gateIsStale(mm)) {
      if (staleMetrics.indexOf(name) < 0) staleMetrics.push(name);
      return null;
    }
    const n = Number(String(mm.last_value).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  };"""

E3_OLD = ('  const driftBad = (ig.drift && ig.drift.ghost || 0) + '
          '(ig.drift && ig.drift.unregistered || 0) + '
          '(ig.drift && ig.drift.unversioned || 0);')
E3_NEW = ('  const driftBad = ig.drift ? ((ig.drift.ghost || 0) + (ig.drift.unregistered || 0) + '
          '(ig.drift.unversioned || 0)) : null; '
          '// FAIL-CLOSED #1301: a failed drift read is null, never 0')

E4_OLD = '    { m: "drift_total", live: String(driftBad || 0), head: c01(1 - (driftBad || 0)) }'
E4_NEW = ('    { m: "drift_total", live: (driftBad == null ? "n/a (drift read failed)" : '
          'String(driftBad)), head: driftBad == null ? 0 : c01(1 - driftBad) } // FAIL-CLOSED #1301')

E5_OLD = ('  let wnum = 0, wsum = 0;\n'
          '  gateRows.forEach(function(x) { if (typeof x.head === "number") { '
          'const w = gateW[x.m] != null ? gateW[x.m] : 0.1; '
          'wnum += w * x.head; wsum += w; } });')
E5_NEW = ('  let wnum = 0, wsum = 0, nullGates = 0;\n'
          '  // FAIL-CLOSED (issue #1301): a null head used to be SKIPPED, which dropped its weight\n'
          '  // from wsum and therefore RAISED the weighted mean -- a failed read improved the score.\n'
          '  // Every gate now contributes its full weight; a null head contributes 0.\n'
          '  gateRows.forEach(function(x) { const w = gateW[x.m] != null ? gateW[x.m] : 0.1; '
          'const h = typeof x.head === "number" ? x.head : (nullGates += 1, 0); '
          'wnum += w * h; wsum += w; });')

E6_OLD = 'Registry + causal edges in qnfo-audit (metric_registry + survival_model).</span></div></div>~);'
E6_OLD = j(E6_OLD)
E6_NEW = E6_OLD + '\n  H.push(' + j(
    '~<div class="sub" style="margin-top:4px">GATE FRESHNESS (GATE-EVAL-METRIC-STALENESS-FAILOPEN-1, '
    'issue #1301, FAIL-CLOSED): ~ + (staleMetrics.length ? '
    '~<b class="bad">~ + staleMetrics.length + ~ stale registry metric(s) treated as FAILED</b>: ~ + '
    'esc(staleMetrics.join(", ")) : ~all registry-backed gates fresh~) + ~ &middot; ~ + nullGates + '
    '~ gate(s) with no readable value counted as head=0</div>~);')

E7_OLD = '"weighted gate headroom x cost-efficiency = SAI external_impact (objectives.id=2 v2)").run();'
E7_NEW = ('"weighted gate headroom x cost-efficiency = SAI external_impact (objectives.id=2 v2); '
          'FAIL-CLOSED #1301 null_gates=" + nullGates + " stale=" + staleMetrics.join(", ")).run();')

E8_OLD = j('(driftBad || 0) + ~')
E8_NEW = '(driftBad == null ? ' + DQ + 'n/a' + DQ + ' : String(driftBad)) + ' + Q

EDITS = [
    ("select-freshness", E1_OLD, E1_NEW),
    ("freshness-gate", E2_OLD, E2_NEW),
    ("drift-null", E3_OLD, E3_NEW),
    ("drift-gate-head", E4_OLD, E4_NEW),
    ("null-gate-zero", E5_OLD, E5_NEW),
    ("panel-visibility", E6_OLD, E6_NEW),
    ("record-stale", E7_OLD, E7_NEW),
    ("collapsed-greens-drift", E8_OLD, E8_NEW),
]


def apply_edits(path):
    if not os.path.isfile(path):
        raise SystemExit("FAIL-CLOSED: missing artifact " + path)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    changed = False
    for label, old, new in EDITS:
        if new in text:
            print("  already applied: " + label)
            continue
        n = text.count(old)
        if n != 1:
            raise SystemExit("FAIL-CLOSED: anchor '%s' matched %d times in %s"
                             % (label, n, path))
        text = text.replace(old, new)
        changed = True
        print("  applied: " + label)
    if changed:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        print("patched " + path)
    else:
        print("already applied: " + path)
    return changed


def post_conditions(path):
    with open(path, encoding="utf-8") as fh:
        t = fh.read()
    checks = {
        "select fetches last_refreshed": "last_refreshed, refresh_cadence FROM metric_registry" in t,
        "freshness predicate present": "gateIsStale" in t,
        "stale collector present": "staleMetrics" in t,
        "drift read is null-safe": "ig.drift ? ((ig.drift.ghost" in t,
        "drift gate fails closed": "driftBad == null ? 0 : c01(1 - driftBad)" in t,
        "null gate counted as 0": "nullGates += 1, 0" in t,
        "collapsed-greens drift null-safe": E8_NEW in t,
        "panel renders freshness": "GATE FRESHNESS" in t,
        "survival note records staleness": "FAIL-CLOSED #1301 null_gates=" in t,
        "no coalescing drift read left": "(driftBad || 0)" not in t,
        "marker present": MARK in t,
    }
    bad = [k for k, v in checks.items() if not v]
    for k, v in checks.items():
        print("  %-38s %s" % (k, "OK" if v else "FAIL"))
    if bad:
        raise SystemExit("FAIL-CLOSED: post-conditions failed: " + ", ".join(bad))
    print("POST_CONDITIONS_OK " + path)


def main():
    print("=== " + MARK + " rev2 ===")
    apply_edits(WORKER)
    post_conditions(WORKER)
    if os.path.isfile(MIRROR):
        apply_edits(MIRROR)
        post_conditions(MIRROR)
        with open(WORKER, "rb") as a, open(MIRROR, "rb") as b:
            if a.read() != b.read():
                raise SystemExit("FAIL-CLOSED: mirror parity violated (mirror-guard invariant)")
        print("MIRROR_PARITY_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
