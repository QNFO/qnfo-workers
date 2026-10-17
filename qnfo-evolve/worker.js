/* qnfo-evolve — EVOLVE-1
 *
 * WHY THIS EXISTS
 *   On 2026-10-17 the fleet's own registers said, in its own words, what was wrong and nobody was
 *   doing anything about it. v_process_path_gaps listed three steps whose only path read
 *   "none automatic" (research-head-stalled, code-task-stalled, issue-unremediated); v_dod_spof_gaps
 *   listed qnfo-research-exec as NO-ALTERNATE-PATH and GitHub Actions plus the GitHub token as
 *   ALTERNATE-NEVER-TESTED. The owner doctrine (SLA-AND-PATHS-1, 2026-10-17) says every step needs
 *   an SLA and at least two independent paths, and it is VIOLATED BY THE FLEET'S OWN TABLES with no
 *   consequence, because nothing in the fleet reads those tables and turns them into work.
 *
 *   Measured the same day: 169 issues open, 25 carrying a code-task line; issue_plans held 6 queued
 *   against 128 "not-code", and 67 of those refusals were the same sentence -- "the issue names no
 *   worker the code loop may change". So the loop was not idle because the fleet had nothing to fix.
 *   It was idle because the fleet never said WHICH WORKER should fix it.
 *
 * WHAT IT DOES
 *   Every quarter hour it reads the fleet's structural gap registers, keeps only the gaps whose
 *   owning worker it can name, and files ONE issue per gap in the shape the code loop accepts:
 *   the live worker named, the file named, the reproduction SQL, and a machine-evaluable definition
 *   of done. It then re-runs each probe and closes the issue itself when the gap disappears.
 *   That closes the missing arc: registered gap -> named work -> merged change -> verified closure.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   * It never edits code, never opens a pull request, never deploys, never changes a view. It writes
 *     only agent_issues rows (its own source) and its own three tables. A bug here can file a bad
 *     issue; it cannot damage a worker.
 *   * It never re-words a gap into something easier. If the owning worker cannot be named it records
 *     the skip and moves on, rather than filing the unplannable prose that starved the loop.
 *   * It files at most MAX_NEW_PER_TICK per tick and holds at most MAX_OPEN open filings, so a wide
 *     register cannot flood a loop that plans a handful of tasks a day.
 *
 * READING
 *   GET /health  version, last run, open filings (public read)
 *   GET /report  the last 20 filings and the last run (public read)
 *   POST /tick   same work as the cron; needs x-loop-token when LOOP_TOKEN is configured
 */
var VERSION = "0.1.0-evolve";
var WORKER = "qnfo-evolve";
var SOURCE = "qnfo-evolve|EVOLVE-1";
var MAX_OPEN = 5;
var MAX_NEW_PER_TICK = 2;

function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function iso() { return new Date().toISOString(); }
function errText(e) { return String((e && e.message) || e).slice(0, 300); }
function q(s) { return String(s == null ? "" : s).replace(/'/g, "''"); }

/* FNV-1a over the identity of the gap. Deterministic across ticks and isolates, so a gap keeps the
 * same key until it is fixed -- that is what makes dedupe work without a random id. */
function hashKey(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}
function gapKey(kind, a, b) { return kind + ":" + hashKey(kind + "\u0000" + a + "\u0000" + b); }

/* A step is single-path when the register says so, or when its path list literally contains a
 * "none ..." entry -- the fleet writes "none automatic" where a second path should be (measured:
 * research-head-stalled, code-task-stalled, issue-unremediated). */
function isSinglePath(pathsJson) {
  var t = String(pathsJson == null ? "" : pathsJson).toLowerCase();
  if (!t) return true;
  if (t.indexOf('"none') >= 0) return true;
  try {
    var arr = JSON.parse(pathsJson);
    return !Array.isArray(arr) || arr.length < 2;
  } catch (e) {
    return true;
  }
}

/* The issue the code loop can actually farm. Every refusal class measured on 2026-10-17 is answered
 * here: a live worker is named, the file is named, and the definition of done is a query, not prose. */
function buildIssue(kind, row, worker, file) {
  var subject = kind === "single-path"
    ? row.process + " / " + row.step + " has fewer than two live paths"
    : row.component + " has no tested alternate path";
  var probe = row.probe;
  var lines = [
    "EVOLVE-1 structural gap filed from the fleet's own registers, not from a metric breach.",
    "",
    "gap: " + kind,
    "process: " + (row.process || "-"),
    "step: " + (row.step || row.component || "-"),
    "sla_min: " + (row.sla_min == null ? "-" : row.sla_min),
    "",
    "worker: " + worker,
    "file: " + file,
    "",
    "evidence: " + JSON.stringify(row.evidence == null ? null : row.evidence).slice(0, 400),
    "reproduce: " + probe,
    "",
    "definition of done: the reproduce query returns 0 rows, and the new path is exercised once "
      + "(a probe row or a run log line), not merely declared.",
    "",
    "constraint: do not raise the SLA, widen a view, or rename the step to hide it. Add a second "
      + "path that actually runs.",
    "doctrine: SLA-AND-PATHS-1 (owner, 2026-10-17) -- every step has an SLA and at least two "
      + "independent paths to a successful definition of done."
  ];
  return {
    key: gapKey(kind, row.process || "", row.step || row.component || ""),
    kind: kind,
    process: row.process || "",
    step: row.step || row.component || "",
    title: "EVOLVE-1: " + subject,
    description: lines.join("\n"),
    worker: worker,
    file: file,
    probe: probe,
    priority: kind === "single-path" ? "high" : "medium"
  };
}

/* Deterministic selection: dedupe against open filings, keep the register's own order, and never
 * exceed the budget. Pure, so the offline suite can pin it. */
function pickNew(candidates, openKeys, room, perTick) {
  var have = {};
  for (var i = 0; i < (openKeys || []).length; i++) have[openKeys[i]] = true;
  var out = [];
  var cap = Math.min(room, perTick);
  if (cap <= 0) return out;
  for (var j = 0; j < (candidates || []).length && out.length < cap; j++) {
    var c = candidates[j];
    if (!c || !c.key || have[c.key]) continue;
    have[c.key] = true;
    out.push(c);
  }
  return out;
}

async function loadTargets(env) {
  var map = {};
  var r = await env.AUDIT.prepare(
    "SELECT kind, key, worker, file FROM evolve_targets"
  ).all();
  var rows = (r && r.results) || [];
  for (var i = 0; i < rows.length; i++) {
    map[rows[i].kind + "|" + rows[i].key] = { worker: rows[i].worker, file: rows[i].file };
  }
  return map;
}

async function pathGapCandidates(env, targets) {
  var out = [];
  var r = await env.AUDIT.prepare(
    "SELECT process, step, sla_min, paths, no_sla, single_path FROM v_process_path_gaps"
  ).all();
  var rows = (r && r.results) || [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var single = Number(row.single_path || 0) === 1 || isSinglePath(row.paths);
    if (!single) continue;
    var t = targets["process|" + row.process];
    if (!t || !t.worker) continue;
    out.push(buildIssue("single-path", {
      process: row.process,
      step: row.step,
      sla_min: row.sla_min,
      evidence: { paths: row.paths, no_sla: row.no_sla, single_path: row.single_path },
      probe: "SELECT COUNT(*) AS n FROM v_process_path_gaps WHERE process = '" + q(row.process)
        + "' AND step = '" + q(row.step) + "' AND (single_path = 1 OR paths LIKE '%\"none%')"
    }, t.worker, t.file));
  }
  return out;
}

async function spofCandidates(env, targets) {
  var out = [];
  var r = await env.AUDIT.prepare(
    "SELECT component, verdict, critical_path FROM v_dod_spof_gaps "
    + "WHERE verdict IN ('NO-ALTERNATE-PATH','ALTERNATE-NEVER-TESTED')"
  ).all();
  var rows = (r && r.results) || [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var t = targets["component|" + row.component];
    if (!t || !t.worker) continue;
    out.push(buildIssue("no-alternate", {
      component: row.component,
      evidence: { verdict: row.verdict, critical_path: row.critical_path },
      probe: "SELECT COUNT(*) AS n FROM v_dod_spof_gaps WHERE component = '" + q(row.component)
        + "' AND verdict = '" + q(row.verdict) + "'"
    }, t.worker, t.file));
  }
  return out;
}

async function openFilings(env) {
  var r = await env.AUDIT.prepare(
    "SELECT key, process, step, worker, file, issue_id, probe_sql, filed_at "
    + "FROM evolve_filings WHERE state = 'open' ORDER BY filed_at"
  ).all();
  return (r && r.results) || [];
}

async function fileIssue(env, d) {
  var now = Date.now();
  var ins = await env.AUDIT.prepare(
    "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) "
    + "VALUES (?, ?, ?, 'optimization', ?, 'open', ?, ?)"
  ).bind(d.title, d.description, SOURCE, d.priority, now, now).run();
  var issueId = (ins && ins.meta && ins.meta.last_row_id) || null;
  await env.AUDIT.prepare(
    "INSERT OR REPLACE INTO evolve_filings (key, kind, process, step, worker, file, issue_id, probe_sql, state, filed_at) "
    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)"
  ).bind(d.key, d.kind, d.process || "", d.step || "", d.worker, d.file, issueId, d.probe, iso()).run();
  return issueId;
}

/* The closure half. A filing stops being work the moment its probe returns nothing, and this worker
 * closes it with evidence instead of waiting for a session to notice. */
async function closeResolved(env, filings) {
  var closed = 0;
  for (var i = 0; i < filings.length; i++) {
    var f = filings[i];
    var n = null;
    try {
      var r = await env.AUDIT.prepare(f.probe_sql).all();
      var rows = (r && r.results) || [];
      n = rows.length ? Number(rows[0].n) : 0;
    } catch (e) {
      continue;
    }
    if (n !== 0) continue;
    await env.AUDIT.prepare(
      "UPDATE agent_issues SET status = 'closed', close_channel = 'evolve-auto', updated_at = ?, "
      + "description = description || ? WHERE id = ? AND status = 'open'"
    ).bind(Date.now(), "\n\nEVOLVE-1 closure " + iso() + ": probe returned 0 rows; the gap is gone.", f.issue_id).run();
    await env.AUDIT.prepare(
      "UPDATE evolve_filings SET state = 'closed', closed_at = ? WHERE key = ?"
    ).bind(iso(), f.key).run();
    closed++;
  }
  return closed;
}

async function ledger(env, out) {
  try {
    await env.AUDIT.prepare(
      "INSERT INTO evolve_runs (ts, scanned, filed, closed, skipped, detail) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(out.ts, out.scanned, out.filed, out.closed,
      JSON.stringify(out.skipped).slice(0, 2000), JSON.stringify(out.filed_keys)).run();
  } catch (e) { /* the ledger must never fail the tick */ }
}

async function runTick(env) {
  var out = { ts: iso(), scanned: 0, filed: 0, closed: 0, skipped: [], filed_keys: [] };
  if (!env.AUDIT) { out.skipped.push("no AUDIT binding"); return out; }

  var targets = {};
  try { targets = await loadTargets(env); } catch (e) { out.skipped.push("targets: " + errText(e)); }

  var cands = [];
  try { cands = cands.concat(await pathGapCandidates(env, targets)); }
  catch (e) { out.skipped.push("path_gaps: " + errText(e)); }
  try { cands = cands.concat(await spofCandidates(env, targets)); }
  catch (e) { out.skipped.push("spof: " + errText(e)); }
  out.scanned = cands.length;

  var filings = [];
  try { filings = await openFilings(env); } catch (e) { out.skipped.push("filings: " + errText(e)); }

  var keys = [];
  for (var i = 0; i < filings.length; i++) keys.push(filings[i].key);
  var plan = pickNew(cands, keys, MAX_OPEN - filings.length, MAX_NEW_PER_TICK);
  for (var j = 0; j < plan.length; j++) {
    try {
      var id = await fileIssue(env, plan[j]);
      out.filed++;
      out.filed_keys.push(plan[j].key + "->" + id);
    } catch (e) {
      out.skipped.push("file " + plan[j].key + ": " + errText(e));
    }
  }

  try { out.closed = await closeResolved(env, filings); }
  catch (e) { out.skipped.push("close: " + errText(e)); }

  await ledger(env, out);
  return out;
}

async function report(env) {
  var filings = await env.AUDIT.prepare(
    "SELECT key, kind, process, step, worker, file, issue_id, state, filed_at, closed_at "
    + "FROM evolve_filings ORDER BY filed_at DESC LIMIT 20"
  ).all();
  var runs = await env.AUDIT.prepare(
    "SELECT ts, scanned, filed, closed FROM evolve_runs ORDER BY id DESC LIMIT 10"
  ).all();
  return { worker: WORKER, version: VERSION, filings: (filings && filings.results) || [], runs: (runs && runs.results) || [] };
}

/* Constant-time comparison: a loop-token check that short-circuits on the first differing byte
 * leaks the prefix of the secret through response timing. The guard is right to refuse `===`. */
function sameSecret(a, b) {
  var x = String(a == null ? "" : a);
  var y = String(b == null ? "" : b);
  var n = x.length > y.length ? x.length : y.length;
  var d = x.length ^ y.length;
  for (var i = 0; i < n; i++) {
    d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return d === 0 && x.length > 0;
}

function tickAllowed(env, req) {
  if (!env.LOOP_TOKEN) return true;
  return sameSecret(req.headers.get("x-loop-token"), env.LOOP_TOKEN);
}

async function handleFetch(event) {
  var req = event.request;
  var url = new URL(req.url);
  var path = url.pathname;
  try {
    if (path === "/health") {
      var last = null;
      try {
        var lr = await event.env.AUDIT.prepare(
          "SELECT ts, scanned, filed, closed FROM evolve_runs ORDER BY id DESC LIMIT 1"
        ).all();
        last = ((lr && lr.results) || [])[0] || null;
      } catch (e) { last = { error: errText(e) }; }
      return json({ ok: true, worker: WORKER, version: VERSION, last_run: last });
    }
    if (path === "/report") return json(await report(event.env));
    if (path === "/tick" && req.method === "POST") {
      if (!tickAllowed(event.env, req)) return json({ error: "forbidden" }, 403);
      return json(await runTick(event.env));
    }
    return json({ worker: WORKER, version: VERSION, endpoints: ["/health", "/report", "POST /tick"] });
  } catch (e) {
    return json({ error: errText(e) }, 500);
  }
}

/* Service-worker syntax: the runtime ignores a returned promise, so the handler must hand its work
 * to the event explicitly or the request/scheduled event is torn down mid-flight. */
addEventListener("fetch", function (event) {
  event.respondWith(handleFetch(event));
});

addEventListener("scheduled", function (event) {
  event.waitUntil(
    runTick(event.env)
      .then(function (out) { console.log("EVOLVE-1 tick " + JSON.stringify(out)); })
      .catch(function (e) {
        console.error(JSON.stringify({ worker: WORKER, event: "tick-failed", error: errText(e) }));
      })
  );
});
