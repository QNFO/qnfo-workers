#!/usr/bin/env python3
"""OPS-REGISTRY-HEALTH-1 - make the ops fleet_status tool registry-scoped, not binding-scoped.

OWNER REQUIREMENT (2026-09-30): "EMBED WORKER OBSERVABILITY AND ISSUES IN FLEET CONTROL AND
OPS. THE SYSTEM SHALL ALWAYS KNOW ITS OWN STATE, ITS OWN ISSUES, ITS OWN HEALTH."

MEASURED DEFICIT (live ops fleet_status tool, 2026-09-30T15:32Z):
  healthyCount = 11, total = 38, and 27 rows returned healthy:null with probe:"api".
  Root cause: fleetStatus() iterates FLEET, which lists only the 12 services ops holds a service
  binding for. Every other worker in the CF account falls through to the API-list branch, which
  pushes { healthy: null, probe: "api" } and never probes anything.
  service_registry carries base_url for 38/38, so the DATA existed and only the PROBE was missing.
  Compounding lie: deployedCount counted `healthy === true || probe === "api"`, i.e. it reported
  never-probed workers as deployed.

FIX
  R1 Load service_registry (env.QNFO_AUDIT) into a name -> base_url map.
  R2 For each unbound worker, probe base_url + /health over HTTP (6s AbortController) and record
     healthy/http/version/error with probe:"registry-http" instead of null.
  R3 Report probedCount / unprobedCount so the gap is explicit, and stop conflating "api" with
     "deployed".
  R4 VERSION bump so the deploy is externally verifiable.

FAIL-CLOSED + IDEMPOTENT: each anchor must match exactly once or nothing is written.
"""
import subprocess
import sys
from pathlib import Path

TARGETS = ["qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js"]

OLD_VERSION = 'var VERSION = "2.38.3-schema-first";'
NEW_VERSION = 'var VERSION = "2.38.4-registry-health";'

A1_OLD = '''async function fleetStatus(env) {
  const out = await Promise.all(FLEET.map(async function(f) {'''

A1_NEW = '''async function fleetStatus(env) {
  /* OPS-REGISTRY-HEALTH-1 (2026-09-30): FLEET is binding-scoped (12 services), so every other
     worker fell through to { healthy: null, probe: "api" } -- measured 27 of 38 with no health
     at all, while deployedCount counted them as deployed because probe === "api". The registry is
     registry-scoped: service_registry carries base_url for 38/38, so the gap was the PROBE, not
     the data. Resolve unbound workers through it and probe them over HTTP. */
  const regMap = {};
  if (env.QNFO_AUDIT) {
    try {
      const rr = await env.QNFO_AUDIT.prepare("SELECT service, base_url FROM service_registry").all();
      for (const s of rr.results || []) {
        if (s.service && s.base_url) regMap[s.service] = String(s.base_url).replace(/\\/+$/, "");
      }
    } catch (e) {
    }
  }
  const out = await Promise.all(FLEET.map(async function(f) {'''

A2_OLD = '''    const hs = w.handlers || [];
    out.push({ name: w.id, healthy: null, http: null, version: "", error: null, count: null, probe: "api", modified_on: w.modified_on || null, handlers: hs.map(function(h) {
      return Array.isArray(h) ? String(h[0]) : String(h);
    }).slice(0, 8) });'''

A2_NEW = '''    const hs = w.handlers || [];
    const base = regMap[w.id] || null;
    let rh = null;
    if (base) {
      const rctrl = new AbortController();
      const rt = setTimeout(function() {
        rctrl.abort();
      }, 6e3);
      try {
        const resp = await fetch(base + "/health", { signal: rctrl.signal, headers: { "User-Agent": "qnfo-ops-fleet-status/registry-health" } });
        clearTimeout(rt);
        let body = {};
        try {
          body = await resp.json();
        } catch (e) {
          body = {};
        }
        rh = { ok: resp.ok, http: resp.status, version: body.version || body.VERSION || "", error: null };
      } catch (e) {
        clearTimeout(rt);
        rh = { ok: false, http: 0, version: "", error: e && e.name === "AbortError" ? "timeout" : e && e.message ? e.message : String(e) };
      }
    }
    out.push({ name: w.id, healthy: rh ? rh.ok : null, http: rh ? rh.http : null, version: rh ? rh.version : "", error: rh ? rh.error : null, count: null, probe: rh ? "registry-http" : "api", base_url: base, modified_on: w.modified_on || null, handlers: hs.map(function(h) {
      return Array.isArray(h) ? String(h[0]) : String(h);
    }).slice(0, 8) });'''

A3_OLD = '''  const deployed = out.filter(function(x) {
    return x.healthy === true || x.probe === "api";
  }).length;
  return { ok: true, fleet: out, healthyCount: healthy, deployedCount: deployed, total: out.length, ts: iso() };'''

A3_NEW = '''  const deployed = out.filter(function(x) {
    return x.healthy === true || x.probe === "api";
  }).length;
  const probed = out.filter(function(x) {
    return x.healthy !== null;
  }).length;
  const unprobed = out.filter(function(x) {
    return x.healthy === null;
  }).length;
  return { ok: true, fleet: out, healthyCount: healthy, deployedCount: deployed, probedCount: probed, unprobedCount: unprobed, total: out.length, ts: iso() };'''

EDITS = [
    ("R1 registry map + R4 version", OLD_VERSION, NEW_VERSION),
    ("R2 registry-scoped HTTP probe for unbound workers", A1_OLD, A1_NEW),
    ("R2b replace the healthy:null push with a real probe", A2_OLD, A2_NEW),
    ("R3 probedCount / unprobedCount", A3_OLD, A3_NEW),
]


def fail(msg):
    print("FAIL-CLOSED: " + msg)
    sys.exit(1)


def main():
    touched = 0
    for rel in TARGETS:
        p = Path(rel)
        if not p.exists():
            print("skip (absent): " + rel)
            continue
        src = p.read_text()
        if NEW_VERSION in src:
            print("already applied: " + rel + " (idempotent no-op)")
            continue
        for label, old, new in EDITS:
            n = src.count(old)
            if n != 1:
                fail(label + " anchor matched " + str(n) + " times in " + rel + " (need exactly 1)")
            src = src.replace(old, new, 1)
            print("applied: " + label + " -> " + rel)
        tmp = Path("/tmp/registry-health-check.mjs")
        tmp.write_text(src)
        r = subprocess.run(["node", "--check", str(tmp)], capture_output=True, text=True)
        if r.returncode != 0:
            fail("node --check failed for " + rel + ": " + (r.stderr or "").strip()[:400])
        print("node --check OK: " + rel)
        p.write_text(src)
        touched += 1
    if touched == 0:
        print("nothing to do (all present targets already patched)")
    else:
        print("patched " + str(touched) + " target(s)")


if __name__ == "__main__":
    main()
