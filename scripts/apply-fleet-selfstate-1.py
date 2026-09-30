#!/usr/bin/env python3
"""FLEET-SELFSTATE-1 - embed worker observability + issues + health into qnfo-fleet-control.

OWNER REQUIREMENT (2026-09-30): "EMBED WORKER OBSERVABILITY AND ISSUES IN FLEET CONTROL AND
OPS. THE SYSTEM SHALL ALWAYS KNOW ITS OWN STATE, ITS OWN ISSUES, ITS OWN HEALTH."

MEASURED DEFICIT (qnfo-audit, read 2026-09-30):
  fleet_heartbeat       = 3 rows / 3 distinct workers, of 38 deployed  -> heartbeat is vestigial
  ops fleet_status tool = healthy=null for 27/38  (ops probes only its 12 service bindings)
  service_registry      = base_url present for 38/38 -> the DATA exists, the PROBE does not
  fleet_state_snapshots = did not exist; there was no time-series of fleet state at all
  fleet_drift_report    = SCAN rows only; no single document answers "what is my state now?"

FIX: a read-only GET /state on qnfo-fleet-control (the worker that already owns scan/heal/
registerWatch/drift) that
  S1 probes every service_registry base_url + /health in parallel (6s timeout, AbortController)
     and records up, http, live_version, and drift vs the registry version;
  S2 aggregates open agent_issues by priority + the 12 highest-priority open titles;
  S3 aggregates outreach_queue depth by status;
  S4 records freshness: d1_schema_index refresh, heartbeat coverage 24h, drift rows 24h;
  S5 writes one fleet_state_snapshots row per cron run (30-day retention) so self-knowledge is
     instantaneous AND time-series.

This is the same probe the ops endpoint could not do: fleet_status is binding-scoped, so it can
only ever see the 12 services it holds bindings for. /state is registry-scoped, so it sees all 38.

FAIL-CLOSED + IDEMPOTENT: every anchor must match exactly once or nothing is written; if the
file already carries the new version the script exits 0 having changed nothing.

COMPANION: qnfo-audit fleet_state_snapshots (created 2026-09-30 by qnfo-ops):
  CREATE TABLE IF NOT EXISTS fleet_state_snapshots (id TEXT PRIMARY KEY, ts TEXT NOT NULL,
    source TEXT, workers_total INTEGER, workers_up INTEGER, workers_down INTEGER,
    open_issues INTEGER, open_high INTEGER, payload TEXT);
"""
import subprocess
import sys
from pathlib import Path

TARGETS = ["qnfo-fleet-control/worker.js"]

OLD_VERSION = 'var VERSION = "0.4.38-reorg-dispose-guards1";'
LANDED_MARKERS = ("FLEET-SELFSTATE-1", "async function selfState(env)", 'if (p === "/state")')
NEW_VERSION = 'var VERSION = "0.4.39-selfstate-1";'

SELFSTATE_FN = r'''
/* FLEET-SELFSTATE-1 (2026-09-30): the fleet must always know its own state, its own issues and
   its own health. Measured deficit before this fix: fleet_heartbeat held 3 workers of 38, and the
   ops fleet_status tool returned healthy=null for 27/38 because it probes only the 12 services it
   holds service bindings for. service_registry carries base_url for 38/38, so the gap was the
   PROBE, not the data. This route probes every registry base_url /health, aggregates issues +
   queues + freshness, and snapshots the result so self-knowledge is also time-series. */
var STATE_SCHEMA = "fleet-state/v1";
async function selfState(env) {
  var ts = (/* @__PURE__ */ new Date()).toISOString();
  var out = { schema: STATE_SCHEMA, worker: "qnfo-fleet-control", version: VERSION, generated_at: ts, workers: [], issues: {}, queues: {}, freshness: {}, summary: {} };
  var reg = [];
  try {
    var rr = await env.DB_AUDIT.prepare("SELECT service, version, base_url FROM service_registry ORDER BY service").all();
    reg = rr.results || [];
  } catch (e) {
    out.registry_error = String(e && e.message || e).slice(0, 160);
  }
  var jobs = reg.map(function (s) {
    var base = String(s.base_url || "").replace(/\/+$/, "");
    if (!base) {
      return Promise.resolve({ service: s.service, registry_version: s.version, up: false, http: null, live_version: null, error: "no base_url" });
    }
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, 6e3);
    return fetch(base + "/health", { signal: ctrl.signal, headers: { "User-Agent": "qnfo-fleet-selfstate/" + VERSION } }).then(function (res) {
      return res.text().then(function (t) { return { st: res.status, t: t }; });
    }).then(function (o) {
      clearTimeout(to);
      var lv = null;
      try {
        var j = JSON.parse(o.t);
        lv = j.version || j.VERSION || null;
      } catch (e) {
        var m = String(o.t).match(/"?version"?\s*[:=]\s*"?([^",}\s]+)/i);
        lv = m ? m[1] : null;
      }
      return { service: s.service, registry_version: s.version, base_url: base, up: o.st === 200, http: o.st, live_version: lv, drift: !!(lv && s.version && lv !== s.version) };
    }).catch(function (e) {
      clearTimeout(to);
      return { service: s.service, registry_version: s.version, base_url: base, up: false, http: null, live_version: null, error: String(e && e.message || e).slice(0, 120) };
    });
  });
  out.workers = await Promise.all(jobs);
  var up = 0, down = 0, drift = 0, unk = 0;
  for (var i = 0; i < out.workers.length; i++) {
    var w = out.workers[i];
    if (w.up) up++; else down++;
    if (w.drift) drift++;
    if (!w.live_version) unk++;
  }
  out.summary = { workers_total: out.workers.length, workers_up: up, workers_down: down, version_drift: drift, version_unknown: unk };
  try {
    var ir = await env.DB_AUDIT.prepare("SELECT priority, COUNT(*) AS n FROM agent_issues WHERE status='open' GROUP BY priority").all();
    var by = {}, tot = 0;
    (ir.results || []).forEach(function (x) { by[x.priority] = x.n; tot += x.n; });
    var tr = await env.DB_AUDIT.prepare("SELECT id, priority, substr(title,1,140) AS title FROM agent_issues WHERE status='open' ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id LIMIT 12").all();
    out.issues = { open_total: tot, by_priority: by, top: tr.results || [] };
  } catch (e) {
    out.issues = { error: String(e && e.message || e).slice(0, 160) };
  }
  try {
    var qr = await env.DB_AUDIT.prepare("SELECT status, COUNT(*) AS n FROM outreach_queue GROUP BY status").all();
    out.queues = { outreach_queue: qr.results || [] };
  } catch (e) {
    out.queues = { error: String(e && e.message || e).slice(0, 160) };
  }
  try {
    var fr = await env.DB_AUDIT.prepare("SELECT MAX(refreshed_at) AS schema_index_at, COUNT(DISTINCT tbl) AS schema_tables FROM d1_schema_index").first();
    var hb = await env.DB_AUDIT.prepare("SELECT COUNT(DISTINCT worker) AS heartbeat_workers_24h, MAX(ts) AS heartbeat_newest FROM fleet_heartbeat WHERE ts >= datetime('now','-1 day')").first();
    var dr = await env.DB_AUDIT.prepare("SELECT COUNT(*) AS drift_rows_24h FROM fleet_drift_report WHERE ts >= datetime('now','-1 day')").first();
    out.freshness = {
      schema_index_at: fr && fr.schema_index_at,
      schema_tables: fr && fr.schema_tables,
      heartbeat_workers_24h: hb && hb.heartbeat_workers_24h,
      heartbeat_newest: hb && hb.heartbeat_newest,
      drift_rows_24h: dr && dr.drift_rows_24h
    };
  } catch (e) {
    out.freshness = { error: String(e && e.message || e).slice(0, 160) };
  }
  try {
    await env.DB_AUDIT.prepare("INSERT INTO fleet_state_snapshots (id, ts, source, workers_total, workers_up, workers_down, open_issues, open_high, payload) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(
      "fs-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      ts,
      "fleet-control/state",
      out.summary.workers_total,
      out.summary.workers_up,
      out.summary.workers_down,
      out.issues.open_total || 0,
      (out.issues.by_priority || {}).high || 0,
      JSON.stringify(out).slice(0, 6e4)
    ).run();
    out.snapshot = "written";
    await env.DB_AUDIT.prepare("DELETE FROM fleet_state_snapshots WHERE ts < datetime('now','-30 day')").run();
  } catch (e) {
    out.snapshot_error = String(e && e.message || e).slice(0, 160);
  }
  return out;
}
'''

ROUTE_ANCHOR = '    if (p === "/register" && request.method === "GET" && (admin || sh)) {'
ROUTE_NEW = '''    if (p === "/state") {
      try {
        return json(await selfState(env));
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 500);
      }
    }
''' + ROUTE_ANCHOR

SCHED_ANCHOR = '    var res = await scan(env, heal);\n    var opt = await optimizeFleet(env);\n'
SCHED_NEW = '    var res = await scan(env, heal);\n    var opt = await optimizeFleet(env);\n    try {\n      await selfState(env);\n    } catch (e) {\n    }\n'

EDITS = [
    ("E1 version bump + selfState() insertion", OLD_VERSION, NEW_VERSION + "\n" + SELFSTATE_FN),
    ("E2 GET /state route", ROUTE_ANCHOR, ROUTE_NEW),
    ("E3 cron snapshot call", SCHED_ANCHOR, SCHED_NEW),
]


def fail(msg):
    print("FAIL-CLOSED: " + msg)
    sys.exit(1)


def main():
    touched = 0
    for rel in TARGETS:
        p = Path(rel)
        if not p.exists():
            fail("target missing: " + rel)
        src = p.read_text()
        # APPLIER-LANDED-MARKERS-1 (2026-09-30, GitHub issue #142): idempotency keyed on the exact NEW_VERSION
        # literal broke as soon as the worker moved PAST it (0.4.39-selfstate-1 -> 0.4.39-selfstate-obs4 ...):
        # every re-run then fell through to the E1 anchor, found 0 matches and went RED although the feature
        # was live. The feature's own markers are version-independent, so they decide "already landed".
        if NEW_VERSION in src or all(m in src for m in LANDED_MARKERS):
            print("already applied: " + rel + " (feature markers present; idempotent no-op)")
            continue
        for label, old, new in EDITS:
            n = src.count(old)
            if n != 1:
                fail(label + " anchor matched " + str(n) + " times in " + rel + " (need exactly 1)")
            src = src.replace(old, new, 1)
            print("applied: " + label + " -> " + rel)
        tmp = Path("/tmp/selfstate-check.mjs")
        tmp.write_text(src)
        r = subprocess.run(["node", "--check", str(tmp)], capture_output=True, text=True)
        if r.returncode != 0:
            fail("node --check failed for " + rel + ": " + (r.stderr or "").strip()[:400])
        print("node --check OK: " + rel)
        p.write_text(src)
        touched += 1
    if touched == 0:
        print("nothing to do (all targets already patched)")
    else:
        print("patched " + str(touched) + " target(s)")


if __name__ == "__main__":
    main()
