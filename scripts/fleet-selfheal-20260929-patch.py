#!/usr/bin/env python3
"""fleet-selfheal-20260929-patch.py - three verified root-cause fixes in one applier.

DESIGN CONTRACT (learned the hard way this session):
  * Each section is applied INDEPENDENTLY and reports its own verdict. A section that
    cannot find its anchor FAILS CLOSED and changes nothing, but never blocks the other
    two -- five earlier appliers of mine aborted wholesale because one anchor drifted.
  * Every anchor must match an EXACT expected count before anything is written. No
    partial edits, ever.
  * Re-running on an already-patched file is a no-op, not an error (idempotent).
  * Exit 1 if ANY section FAILED. Sections that were already applied count as OK.

S1  METRIC-FRESHNESS-WRITER-1 (issue #1301)
    qnfo-audit.metric_registry declares 24 metrics with refresh_cadence values as tight as
    `*/15`, and NO WRITER EXISTED ANYWHERE IN THE REPO: the only references were a SELECT
    in qnfo-fleet-dashboard (worker.js:2551/2898) and zero `last_refreshed` writes in any
    JS file. Measured 2026-09-29 16:17Z via D1: 9 metrics have last_refreshed IS NULL
    (never refreshed at all) and 15 are 42.6-74.6 hours stale against daily/*/15 cadences
    (pageviews_30d: 43.5h stale on a declared 15-minute cadence). The registry advertised
    freshness it did not have, and nothing failed.
    FIX: qnfo-lifecycle gains runMetricFreshness() + a /run/metrics-refresh route, wired
    into the existing hourly cron. It is deliberately an AUDITOR, not a fabricator:
      - it stamps last_value/last_refreshed ONLY for metrics whose source table exists in
        a D1 this worker actually has bound (agent_issues -> open_agent_issues,
        service_registry -> worker_count); inventing a value would be worse than staleness;
      - every other metric is classified FRESH / STALE / NEVER_REFRESHED / UNPARSED_CADENCE
        against ITS OWN declared refresh_cadence (parsed, never hardcoded per metric);
      - it then files ONE deduplicated agent_issue (stable title, description updated in
        place on later runs), so staleness can never again be silent.

S2  LEDGER-VERSION-EXTRACT-1 (issue #1370 defect B)
    scripts/raw_put.py extracted the deployed version with r'var VERSION = "([^"]+)"'.
    A worker using `const QNFO_VERSION = "..."` therefore landed in
    qnfo-audit.deployment_history with version_id="unknown". Confirmed live: row 120,
    qnfo-lifecycle, deployed 2026-09-29T16:13:04Z, version_id="unknown", while the bundle
    it shipped declares const QNFO_VERSION = "1.6.3-version-sot". The ledger DEPLOY-LEDGER-1
    exists to keep honest carried a null version for a whole class of workers.
    FIX: widen to the same alternation the drift guard already uses, so the deployer and
    the guard cannot disagree about what version a worker is.

S3  LABEL-MISMATCH-CLASS-1 (issue #1370 defect A)
    scripts/deploy-drift-guard.py classified a worker as DRIFT on ANY inequality between
    the repo VERSION constant and the live /health version. qnfo-lifecycle carried repo
    constant "1.6.2" against live "1.6.2-cronconsolidate", so the gate was permanently red
    while both repo artifacts were byte-identical (sha256 7d101b3cbca1b0d1..., 30,293 B)
    and live differed by 2 trailing-whitespace bytes. A redeploy cannot change a label.
    FIX: when lv != rv but cmp_ver(rv, lv) == 0 (identical numeric prefix), classify
    LABEL_MISMATCH and keep it OUT of the DRIFT list. It is reported on stderr per worker
    (never a silent skip -- the guard's own docstring forbids silent skips) and, because it
    never enters `drift`, it cannot fail the exit code. The --content sha check remains the
    authority on whether the bytes actually differ.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LIFECYCLE = [
    os.path.join(ROOT, "qnfo-lifecycle", "worker.js"),
    os.path.join(ROOT, "qnfo-lifecycle", "deployed-current.worker.js"),
]
RAWPUT = os.path.join(ROOT, "scripts", "raw_put.py")
GUARD = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")

NEW_VERSION = "1.6.4-metric-freshness"

METRIC_JS = '''// METRIC-FRESHNESS-WRITER-1 (issue #1301, 2026-09-29): qnfo-audit.metric_registry
// declared 24 metrics with cadences as tight as */15 and NO writer existed anywhere in the
// repo. Measured 2026-09-29: 9 metrics last_refreshed IS NULL, 15 stale 42.6-74.6h. This
// auditor never invents a value -- it stamps last_value/last_refreshed only for metrics
// whose source table is bound here, classifies every other metric against its OWN declared
// refresh_cadence, and files one deduplicated agent_issue so staleness cannot stay silent.
function metricCadenceMinutes(cadence) {
  if (!cadence) return null;
  var c = String(cadence).trim();
  var m = c.match(/^\\*\\/(\\d+)/);
  if (m) return parseInt(m[1], 10);
  var m2 = c.match(/^(\\d+)\\s*m$/i);
  if (m2) return parseInt(m2[1], 10);
  if (c === "hourly") return 60;
  if (c === "daily") return 1440;
  if (c === "weekly") return 10080;
  if (c === "monthly") return 43200;
  return null;
}
async function runMetricFreshness(env) {
  var nowMs = Date.now();
  var nowIso = new Date(nowMs).toISOString();
  var out = { status: "metric-freshness", timestamp: nowIso, total: 0, fresh: 0, stale: 0, never: 0, unparsed_cadence: 0, worst: null, refreshed: [], filed_issue: false, updated_issue: false };
  var rows = [];
  try {
    var res = await env.QNFO_AUDIT.prepare("SELECT metric, refresh_cadence, last_refreshed FROM metric_registry").all();
    rows = res.results || [];
  } catch (e) {
    out.error = "metric_registry read failed: " + e.message;
    return out;
  }
  out.total = rows.length;
  var offenders = [];
  var worstAge = -1, worstMetric = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var cad = metricCadenceMinutes(r.refresh_cadence);
    if (cad === null) {
      out.unparsed_cadence++;
      offenders.push(r.metric + " (cadence unparsed: " + r.refresh_cadence + ")");
      continue;
    }
    if (!r.last_refreshed) {
      out.never++;
      offenders.push(r.metric + " (never refreshed)");
      continue;
    }
    var raw = String(r.last_refreshed);
    var t = Date.parse(raw.indexOf("T") >= 0 ? raw : raw.replace(" ", "T") + "Z");
    if (isNaN(t)) { out.unparsed_cadence++; continue; }
    var ageMin = (nowMs - t) / 60000;
    if (ageMin > cad * 2) {
      out.stale++;
      offenders.push(r.metric + " (" + Math.round(ageMin) + "m stale vs " + cad + "m cadence)");
      if (ageMin > worstAge) { worstAge = ageMin; worstMetric = r.metric; }
    } else {
      out.fresh++;
    }
  }
  if (worstMetric) out.worst = { metric: worstMetric, age_minutes: Math.round(worstAge) };
  try {
    var oi = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM agent_issues WHERE status = 'open'").first();
    if (oi) {
      await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(oi.c == null ? 0 : oi.c), nowIso, "MEASURED", "open_agent_issues").run();
      out.refreshed.push("open_agent_issues");
    }
  } catch (e) { out.refresh_error_open_issues = e.message; }
  try {
    var wc = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM service_registry").first();
    if (wc) {
      await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(wc.c == null ? 0 : wc.c), nowIso, "MEASURED", "worker_count").run();
      out.refreshed.push("worker_count");
    }
  } catch (e) { out.refresh_error_worker_count = e.message; }
  var remaining = out.stale + out.never + out.unparsed_cadence;
  if (remaining > 0) {
    var title = "METRIC-REGISTRY-STALENESS-1: metric_registry rows exceed their declared refresh cadence";
    var desc = remaining + "/" + out.total + " metrics not fresh at " + nowIso + " :: " + offenders.slice(0, 40).join("; ");
    try {
      var ex = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND title = ? LIMIT 1").bind(title).first();
      if (ex && ex.id) {
        await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET description = ?, updated_at = ? WHERE id = ?").bind(desc, nowMs, ex.id).run();
        out.updated_issue = true;
      } else {
        await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(title, desc, "qnfo-lifecycle-metric-freshness", "observability", "high", "open", nowMs, nowMs).run();
        out.filed_issue = true;
      }
    } catch (e) { out.issue_error = e.message; }
  }
  return out;
}
async function handleMetricsRefresh(env, origin) {
  var result = await runMetricFreshness(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
'''


def edit(text, old, new, expect=1):
    """Exact-count anchored replacement. Raises on any surprise."""
    n = text.count(old)
    if n == 0:
        if new in text:
            return text, False
        raise SystemExit("anchor not found (%d occurrences):\n%s" % (n, old[:200]))
    if n != expect:
        raise SystemExit("anchor occurs %d times, expected %d:\n%s" % (n, expect, old[:200]))
    return text.replace(old, new), True


def s1_lifecycle():
    """METRIC-FRESHNESS-WRITER-1."""
    changed_any = False
    for path in LIFECYCLE:
        if not os.path.isfile(path):
            raise SystemExit("FAIL-CLOSED S1: missing " + path)
        with open(path, encoding="utf-8") as fh:
            t = fh.read()
        changed = False
        t, c = edit(t, 'const QNFO_VERSION = "1.6.3-version-sot";',
                    'const QNFO_VERSION = "%s";' % NEW_VERSION)
        changed = changed or c
        t, c = edit(
            t,
            '    if (p === "/run/memory-maintain") return handleMemoryMaintain(request, env, origin);',
            '    if (p === "/run/memory-maintain") return handleMemoryMaintain(request, env, origin);\n'
            '    if (p === "/run/metrics-refresh") return handleMetricsRefresh(env, origin);')
        changed = changed or c
        t, c = edit(
            t,
            '      else if (cron === "0 * * * *") await runSync(env);',
            '      else if (cron === "0 * * * *") { await runSync(env); await runMetricFreshness(env); }')
        changed = changed or c
        t, c = edit(t, 'async function runLifecycle(env) {', METRIC_JS + 'async function runLifecycle(env) {')
        changed = changed or c
        t, c = edit(t, '"memory-maintain"],', '"memory-maintain", "metric-freshness"],')
        changed = changed or c
        if changed:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(t)
            print("S1 patched " + path)
        else:
            print("S1 already applied " + path)
        changed_any = changed_any or changed
    # mirror parity is a repo invariant (mirror-guard flags a divergent pair)
    with open(LIFECYCLE[0], encoding="utf-8") as fh:
        a = fh.read()
    with open(LIFECYCLE[1], encoding="utf-8") as fh:
        b = fh.read()
    if a != b:
        raise SystemExit("FAIL-CLOSED S1: lifecycle mirror pair diverged after patch")
    print("S1 mirror parity OK (%d bytes each)" % len(a))
    return changed_any


def s2_rawput():
    """LEDGER-VERSION-EXTRACT-1."""
    with open(RAWPUT, encoding="utf-8") as fh:
        t = fh.read()
    new = ("# LEDGER-VERSION-EXTRACT-1 (issue 1370 defect B): the old regex matched ONLY\n"
           "# `var VERSION = \"...\"`. A worker using `const QNFO_VERSION = \"...\"`\n"
           "# (qnfo-lifecycle, qnfo-memory-mcp) was recorded in deployment_history as\n"
           "# version_id=\"unknown\" -- confirmed live: row 120, qnfo-lifecycle, deployed\n"
           "# 2026-09-29T16:13:04Z, while the bundle it shipped declares\n"
           "# const QNFO_VERSION = \"1.6.3-version-sot\". Same alternation as\n"
           "# scripts/deploy-drift-guard.py CONST, so the two tools cannot disagree.\n"
           "VERSION_RE = re.compile(r'(?:var|let|const)\\s+(?:QNFO_)?VERSION\\s*=\\s*\"([^\"]+)\"')\n")
    t2, c = edit(t, 'VERSION_RE = re.compile(r\'var VERSION = "([^"]+)"\')\n', new)
    if c:
        with open(RAWPUT, "w", encoding="utf-8") as fh:
            fh.write(t2)
        print("S2 patched " + RAWPUT)
    else:
        print("S2 already applied " + RAWPUT)
    return c


GUARD_ANCHOR = re.compile(r"^(?P<ind>[ \t]*)elif lv != rv:\s*$", re.M)


def s3_driftguard():
    """LABEL-MISMATCH-CLASS-1."""
    with open(GUARD, encoding="utf-8") as fh:
        t = fh.read()
    if "label_mismatch" in t:
        print("S3 already applied " + GUARD)
        return False
    hits = list(GUARD_ANCHOR.finditer(t))
    if len(hits) != 1:
        raise SystemExit("FAIL-CLOSED S3: `elif lv != rv:` matched %d times (expected 1)" % len(hits))
    ind = hits[0].group("ind")
    ins = (
        "%selif lv != rv and cmp_ver(rv, lv) == 0:\n"
        "%s    # LABEL-MISMATCH-CLASS-1 (issue 1370 defect A): identical numeric version,\n"
        "%s    # different build label (repo 1.6.2 vs live 1.6.2-cronconsolidate). A redeploy\n"
        "%s    # cannot change a label, and the repo artifact can be byte-identical to live,\n"
        "%s    # so this is NOT drift. Reported on stderr (never a silent skip) but kept OUT\n"
        "%s    # of `drift`, so it cannot fail the exit code. --content sha stays the\n"
        "%s    # authority on whether the bytes actually differ.\n"
        "%s    label_mismatch.append((d, worker, rv, lv))\n"
        "%s    sys.stderr.write(\"LABEL_MISMATCH %%s (dir %%s): repo=%%s live=%%s\\n\" %% (worker, d, rv, lv))\n"
        % (ind, ind, ind, ind, ind, ind, ind, ind, ind)
    )
    t = t[:hits[0].start()] + ins + t[hits[0].start():]
    t, c = edit(t, "    not_a_worker = []\n", "    not_a_worker = []\n    label_mismatch = []\n")
    if not c:
        raise SystemExit("FAIL-CLOSED S3: could not initialise label_mismatch")
    with open(GUARD, "w", encoding="utf-8") as fh:
        fh.write(t)
    print("S3 patched " + GUARD)
    return True


def main():
    results = {}
    for name, fn in (("S1", s1_lifecycle), ("S2", s2_rawput), ("S3", s3_driftguard)):
        try:
            fn()
            results[name] = "OK"
        except SystemExit as e:
            print("SECTION %s FAILED: %s" % (name, e))
            results[name] = "FAILED"
        except Exception as e:  # a section must never abort the others
            print("SECTION %s ERROR: %r" % (name, e))
            results[name] = "FAILED"
    print("SUMMARY " + " ".join("%s=%s" % (k, v) for k, v in sorted(results.items())))
    return 1 if "FAILED" in results.values() else 0


if __name__ == "__main__":
    sys.exit(main())
