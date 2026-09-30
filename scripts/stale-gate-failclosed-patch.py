#!/usr/bin/env python3
"""STALE-GATE-FAILCLOSED-1 applier - issue #1301 (mitigates #1411).

qnfo-fleet-dashboard's survival-meter gate reads metric_registry but never selects
last_refreshed, so regVal() cannot tell a value refreshed a minute ago from one
refreshed two days ago. Three gate inputs with combined weight 0.60
(impressions_growth_30d 0.45, workers_ai_cost_30d_usd 0.10, drift_total 0.05)
were last written 2026-09-27 and still scored as live; a stale or failed read
coalescing to 0 also satisfies "full_reports_live_30d < 2" and can fire phase 1.

This applier makes the gate staleness-aware and fail-closed:
  E1  the registry SELECT also returns last_refreshed + refresh_cadence;
  E2  cadenceMs()/staleOf() helpers; regVal() returns null when the row is stale;
  E3  the weighted mean scores a STALE row worst-case (head 0, weight KEPT) -
      dropping an unknown metric RAISES the mean, which is the fail-open;
  E4  the panel prints the STALE count so a stale read is never silent;
  E5  VERSION bump.

Fail-closed: exits 3 if any anchor is missing or ambiguous. Idempotent via MARKER.
"""
import json
import pathlib
import re
import sys

MARKER = "STALE-GATE-FAILCLOSED-1"
VERSION_NEW = 'var VERSION = "1.7.32-stale-gate-failclosed";'
TARGET = pathlib.Path("qnfo-fleet-dashboard/worker.js")
MIRROR = pathlib.Path("qnfo-fleet-dashboard/deployed-current.worker.js")

E1_OLD = '"SELECT metric, layer, kind, target, owner, warning_band, kill_band, last_value FROM metric_registry ORDER BY kind DESC, layer, metric"'
E1_NEW = '"SELECT metric, layer, kind, target, owner, warning_band, kill_band, last_value, last_refreshed, refresh_cadence FROM metric_registry ORDER BY kind DESC, layer, metric"'

E2_OLD = """  const regVal = function(name) {
    const mm = (mr || []).filter(function(x) { return x.metric === name; })[0];
    if (!mm || mm.last_value == null) return null;
    const n = Number(String(mm.last_value).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  };"""

E2_NEW = """  // STALE-GATE-FAILCLOSED-1 (#1301, mitigates #1411): a metric whose last_refreshed
  // exceeds its declared refresh_cadence is UNKNOWN, not passing. Unknown is scored
  // worst-case below, never silently dropped.
  const cadenceMs = function(c) {
    const s = String(c == null ? "" : c).trim().toLowerCase();
    if (!s) return null;
    if (s === "daily") return 24 * 60 * 60 * 1e3;
    if (s === "hourly") return 60 * 60 * 1e3;
    if (s === "weekly") return 7 * 24 * 60 * 60 * 1e3;
    const every = s.match(/^\\*\\/(\\d+)/);
    if (every) return Math.max(1, parseInt(every[1], 10)) * 60 * 1e3;
    if (/^\\d+ \\* \\* \\* \\*$/.test(s)) return parseInt(s, 10) * 60 * 60 * 1e3;
    return null;
  };
  const staleOf = function(mm) {
    if (!mm) return true;
    if (mm.last_refreshed == null) return true;
    const base = cadenceMs(mm.refresh_cadence);
    if (base == null) return true;
    const t = Date.parse(String(mm.last_refreshed).replace(" ", "T"));
    if (isNaN(t)) return true;
    return Date.now() - t > 2 * base + 5 * 60 * 1e3;
  };
  const staleN = (mr || []).filter(function(x) { return staleOf(x); }).length;
  const regVal = function(name) {
    const mm = (mr || []).filter(function(x) { return x.metric === name; })[0];
    if (!mm || mm.last_value == null) return null;
    if (staleOf(mm)) return null;
    const n = Number(String(mm.last_value).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  };"""

E3_OLD = '  gateRows.forEach(function(x) { if (typeof x.head === "number") { const w = gateW[x.m] != null ? gateW[x.m] : 0.1; wnum += w * x.head; wsum += w; } });'
E3_NEW = """  gateRows.forEach(function(x) {
    const w = gateW[x.m] != null ? gateW[x.m] : 0.1;
    const rmm = (mr || []).filter(function(y) { return y.metric === x.m; })[0];
    if (staleOf(rmm)) { wsum += w; return; }
    if (typeof x.head === "number") { wnum += w * x.head; wsum += w; }
  });"""

E4_OLD = "' registry metrics (lagging kill-gates + leading indicators) &middot;"
E4_NEW = "' registry metrics (' + staleN + ' STALE beyond cadence) (lagging kill-gates + leading indicators) &middot;"

V_RE = re.compile(r'var VERSION = "[^"]*";')

EDITS = [
    ("E1 select staleness columns", E1_OLD, E1_NEW),
    ("E2 helpers + stale-aware regVal", E2_OLD, E2_NEW),
    ("E3 fail-closed weighted mean", E3_OLD, E3_NEW),
    ("E4 surface stale count", E4_OLD, E4_NEW),
]


def fail(msg, code=3):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(code)


def balance(s):
    return [s.count("{") - s.count("}"),
            s.count("(") - s.count(")"),
            s.count("[") - s.count("]")]


def main():
    if not TARGET.exists():
        fail("target missing: %s" % TARGET)
    src = TARGET.read_text()

    if MARKER in src:
        print(json.dumps({"ok": True, "already_patched": True, "marker": MARKER,
                          "bytes": len(src)}))
        return 0

    for name, old, new in EDITS:
        n = src.count(old)
        if n != 1:
            fail("anchor %s matched %d times (need exactly 1)" % (name, n))
    if len(V_RE.findall(src)) < 1:
        fail("VERSION anchor not found")

    out = src
    for name, old, new in EDITS:
        out = out.replace(old, new, 1)
    out = V_RE.sub(VERSION_NEW, out, count=1)

    for need in (MARKER, "staleOf", "cadenceMs", "refresh_cadence", "staleN",
                 VERSION_NEW):
        if need not in out:
            fail("outcome missing after patch: %s" % need)
    if E3_OLD in out:
        fail("E3 not applied")

    if balance(src) != balance(out):
        fail("delimiter balance changed: %s -> %s" % (balance(src), balance(out)))

    TARGET.write_text(out)
    if MIRROR.exists():
        MIRROR.write_text(out)

    print(json.dumps({"ok": True, "already_patched": False, "marker": MARKER,
                      "version": VERSION_NEW.split('"')[1],
                      "bytes": len(out),
                      "delta_bytes": len(out) - len(src)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
