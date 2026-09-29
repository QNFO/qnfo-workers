#!/usr/bin/env python3
"""dashboard-gate-failopen-patch.py - GATE-EVAL-METRIC-STALENESS-FAILOPEN-1 (issue #1301).

FIVE verified defects, all in qnfo-fleet-dashboard/worker.js. The affected code is the /red
SURVIVAL METERS panel, which WRITES qnfo-audit.survival_state and therefore the SAI
external_impact term -- so these defects do not merely mis-render a page, they mis-record the
system's own survival score.

1. The metric_registry SELECT fetched `last_value` but NOT `last_refreshed` or
   `refresh_cadence`. The renderer was structurally incapable of noticing staleness. Live
   evidence: rows last_refreshed 2026-09-27T17:28:59Z against a declared `daily` cadence
   (full_reports_live_30d) rendered as live on 2026-09-29 -- ~48h stale.
2. `regVal()` applied no freshness check at all.
3. `const driftBad = (ig.drift && ig.drift.ghost || 0) + ...` -- a FAILED drift read coalesces
   to 0, i.e. a broken read reports "no drift".
4. `head: c01(1 - (driftBad || 0))` -- the coalesced 0 yields head = 1, i.e. a failed read
   reports 100% headroom.
5. `gateRows.forEach(... if (typeof x.head === "number") ...)` -- a null gate was SKIPPED and
   its weight dropped from `wsum`, so the weighted mean was computed over the surviving
   subset. Missing data therefore RAISED the reported headroom.

FAIL-CLOSED FIX: a registry value that is stale against its declared cadence (2x grace) or
whose timestamp is unparseable resolves to null; a drift read that failed stays null instead
of 0; every gate contributes its full weight and a null head contributes 0; the stale set and
the null-gate count are rendered on the panel and written into the survival_state note. After
this patch a failed or stale read can only LOWER the score, never raise it.

IDEMPOTENT: re-running on an already-patched file is a no-op (each edit is skipped when its
replacement text is already present).
FAIL-CLOSED: every edit must match EXACTLY ONCE; anything else raises and nothing is written.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.path.join(ROOT, "qnfo-fleet-dashboard", "worker.js")
MIRROR = os.path.join(ROOT, "qnfo-fleet-dashboard", "deployed-current.worker.js")
MARK = "GATE-EVAL-METRIC-STALENESS-FAILOPEN-1"

# ---------------------------------------------------------------- edit 1: fetch freshness
E1_OLD = 'last_value FROM metric_registry ORDER BY kind DESC, layer, metric"'
E1_NEW = ('last_value, last_refreshed, refresh_cadence FROM metric_registry '
          'ORDER BY kind DESC, layer, metric"')

# ---------------------------------------------------------------- edit 2: freshness gate
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
    const m = s.match(/^\\*\\/(\\d+)\\s*(h?)/);
    if (!m) return null;
    return Number(m[1]) * (m[2] === "h" ? 60 : 1);
  };
  const gateTsMs = function(v) {
    if (!v) return null;
    let s = String(v).trim().replace(" ", "T");
    if (!/[Zz]$/.test(s) && !/[+-]\\d\\d:?\\d\\d$/.test(s)) s += "Z";
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

# ---------------------------------------------------------------- edit 3: drift read null
E3_OLD = ('const driftBad = (ig.drift && ig.drift.ghost || 0) + '
          '(ig.drift && ig.drift.unregistered || 0) + '
          '(ig.drift && ig.drift.unversioned || 0);')
E3_NEW = ('const driftBad = ig.drift ? ((ig.drift.ghost || 0) + (ig.drift.unregistered || 0) + '
          '(ig.drift.unversioned || 0)) : null; '
          '// FAIL-CLOSED #1301: a failed drift read is null, never 0')

# ---------------------------------------------------------------- edit 4: drift gate head
E4_OLD = '{ m: "drift_total", live: String(driftBad || 0), head: c01(1 - (driftBad || 0)) }'
E4_NEW = ('{ m: "drift_total", live: (driftBad == null ? "n/a (drift read failed)" : '
          'String(driftBad)), head: driftBad == null ? 0 : c01(1 - driftBad) } '
          '// FAIL-CLOSED #1301')

# ---------------------------------------------------------------- edit 5: null gate = 0
E5_OLD = ('let wnum = 0, wsum = 0;\\s*\\n\\s*'
          'gateRows\\.forEach\\(function\\(x\\) \\{ if \\(typeof x\\.head === "number"\\) \\{ '
          'const w = gateW\\[x\\.m\\] != null \\? gateW\\[x\\.m\\] : 0\\.1; '
          'wnum \\+= w \\* x\\.head; wsum \\+= w; \\} \\}\\);')
E5_NEW = """let wnum = 0, wsum = 0, nullGates = 0;
  // FAIL-CLOSED (issue #1301): a null head used to be SKIPPED, which dropped its weight from
  // wsum and therefore RAISED the weighted mean -- a failed read improved the score. Every gate
  // now contributes its full weight; a null head contributes 0.
  gateRows.forEach(function(x) { const w = gateW[x.m] != null ? gateW[x.m] : 0.1; const h = typeof x.head === "number" ? x.head : (nullGates += 1, 0); wnum += w * h; wsum += w; });"""

# ---------------------------------------------------------------- edit 6: panel visibility
E6_OLD = ('Registry + causal edges in qnfo-audit (metric_registry + survival_model).'
          '</span></div></div>\');')
E6_NEW = """Registry + causal edges in qnfo-audit (metric_registry + survival_model).</span></div></div>');
  H.push('<div class="sub" style="margin-top:4px">GATE FRESHNESS (GATE-EVAL-METRIC-STALENESS-FAILOPEN-1, issue #1301, FAIL-CLOSED): ' + (staleMetrics.length ? '<b class="bad">' + staleMetrics.length + ' stale registry metric(s) treated as FAILED</b>: ' + esc(staleMetrics.join(", ")) : 'all registry-backed gates fresh') + ' &middot; ' + nullGates + ' gate(s) with no readable value counted as head=0</div>');"""

# ---------------------------------------------------------------- edit 7: record it
E7_OLD = ('"weighted gate headroom x cost-efficiency = SAI external_impact (objectives.id=2 v2)")'
          '.run();')
E7_NEW = ('"weighted gate headroom x cost-efficiency = SAI external_impact (objectives.id=2 v2); '
          'FAIL-CLOSED #1301 null_gates=" + nullGates + " stale=" + staleMetrics.join(",")).run();')

EDITS = [
    ("select-freshness", E1_OLD, E1_NEW, 0),
    ("freshness-gate", E2_OLD, E2_NEW, 0),
    ("drift-null", E3_OLD, E3_NEW, 0),
    ("drift-gate-head", E4_OLD, E4_NEW, 0),
    ("null-gate-zero", E5_OLD, E5_NEW, re.S),
    ("panel-visibility", E6_OLD, E6_NEW, 0),
    ("record-stale", E7_OLD, E7_NEW, 0),
]


def apply_edits(path):
    if not os.path.isfile(path):
        raise SystemExit("FAIL-CLOSED: missing artifact " + path)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    changed = False
    for label, old, new, flags in EDITS:
        pattern = old if (flags & re.S) else re.escape(old)
        new_text, n = re.subn(pattern, lambda m: new, text, flags=flags)
        if n == 0:
            if new in text:
                print("  already applied: " + label)
                continue
            raise SystemExit("FAIL-CLOSED: anchor '%s' not found in %s" % (label, path))
        if n != 1:
            raise SystemExit("FAIL-CLOSED: anchor '%s' matched %d times in %s"
                             % (label, n, path))
        text = new_text
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
        "select fetches refresh_cadence": "refresh_cadence FROM metric_registry" in t,
        "freshness predicate present": "gateIsStale" in t,
        "stale collector present": "staleMetrics" in t,
        "drift read is null-safe": "ig.drift ? ((ig.drift.ghost" in t,
        "drift gate fails closed": 'driftBad == null ? 0 : c01(1 - driftBad)' in t,
        "null gate counted as 0": "nullGates += 1, 0" in t,
        "panel renders freshness": "GATE FRESHNESS" in t,
        "survival note records staleness": "FAIL-CLOSED #1301 null_gates=" in t,
        "no coalescing drift read left": "(driftBad || 0)" not in t,
        "marker present": MARK in t,
    }
    bad = [k for k, v in checks.items() if not v]
    for k, v in checks.items():
        print("  %-36s %s" % (k, "OK" if v else "FAIL"))
    if bad:
        raise SystemExit("FAIL-CLOSED: post-conditions failed: " + ", ".join(bad))
    print("POST_CONDITIONS_OK " + path)


def main():
    print("=== " + MARK + " ===")
    apply_edits(WORKER)
    post_conditions(WORKER)
    if os.path.isfile(MIRROR):
        apply_edits(MIRROR)
        post_conditions(MIRROR)
        with open(WORKER, "rb") as a, open(MIRROR, "rb") as b:
            if a.read() != b.read():
                raise SystemExit("FAIL-CLOSED: mirror parity violated (mirror-guard invariant)")
        print("MIRROR_PARITY_OK")
    else:
        print("NOTE: no deployed-current mirror for qnfo-fleet-dashboard; parity not applicable")
    return 0


if __name__ == "__main__":
    sys.exit(main())
