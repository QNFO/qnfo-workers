// RT-API-1 (1.42.0) offline suite: the read API's real-time contract.
// Proves: (A) GET /api indexes every public read with its auth, schema version, cache policy and freshness source, and
// revalidates; (B) GET /api/live is one consolidated snapshot whose numbers agree with /api/areas and /api/human, and it
// answers If-None-Match with 304 and ?since=<revision> with not_modified; (C) /api/areas and /api/human issue an ETag over
// CONTENT and answer 304 with an empty body while nothing moved; (D) a real change in D1 changes the ETag; (E) a response
// carrying owner fields never gets a shared-cache policy, while the public one may be reused; (F) the page's 60 s poll is
// conditional; (G) /health advertises the new capabilities.
// Run: node qnfo-fleet-dashboard/rt-api.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });

const STATE = { schema_version: "fleet-state/v1", generated_at: new Date().toISOString(), version: "t", verdict: "HEALTHY", window: {}, fleet: { workers: 30 }, totals: {}, scheduled: [], audits: [], probes: [{ name: "a", ok: true, status: 200 }, { name: "b", ok: true, status: 200 }], integration: {}, report_card: {}, chains: [], device: {}, issues: [], issue_counts: { err: 0, warn: 0, total: 0 }, queues: [], coverage: {}, unattributed_errors: 0, recovered_workers: [], error_workers: [], loop: {}, meta: {}, refresh_ms: 1 };
const LOOP = "loop-secret-rt-api";

function mk() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER);
  CREATE TABLE fleet_loop_meta (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
  CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, source TEXT, device TEXT, type TEXT, domain TEXT, priority TEXT, summary TEXT, due TEXT, status TEXT, wbs_code TEXT, created_at TEXT, processed_at TEXT, triage_decision TEXT);
  CREATE TABLE task_dod_register (id INTEGER PRIMARY KEY, title TEXT, dod TEXT, due TEXT, updated_at TEXT, owner TEXT, status TEXT);
  CREATE VIEW v_waiting_on_human AS SELECT id, title, dod, due, updated_at FROM task_dod_register WHERE owner IN ('user','mixed') AND status='open';
  CREATE TABLE gtd_register (id INTEGER PRIMARY KEY, line TEXT, dod TEXT, section TEXT, updated_at TEXT, owner TEXT, done INTEGER);
  CREATE TABLE fleet_issue_dispatch (fingerprint TEXT, category TEXT, owner TEXT, action TEXT, payload TEXT, gh_number INTEGER, exec_result TEXT, created_at TEXT, state TEXT, exec_state TEXT);
  CREATE TABLE code_tasks (id TEXT, goal TEXT, repo TEXT, last_error TEXT, pr_url TEXT, updated_at TEXT, status TEXT);
  CREATE TABLE shutdown_manifest (id INTEGER, phase INTEGER, component TEXT, condition TEXT, due_date TEXT, state TEXT);
  CREATE TABLE goals (id INTEGER PRIMARY KEY, goal_type TEXT, status TEXT, created_at TEXT, statement TEXT, alignment TEXT, updated_at TEXT);
  CREATE TABLE emails (id INTEGER, sender TEXT, subject TEXT, received_at TEXT, status TEXT);
  CREATE VIEW v_email_human_pending_v2 AS SELECT sender, subject, received_at FROM emails;
  CREATE TABLE invest_facts (key TEXT PRIMARY KEY, value TEXT, evidence TEXT, updated_at TEXT);
  CREATE TABLE owner_docs (key TEXT PRIMARY KEY, title TEXT NOT NULL, body_md TEXT NOT NULL, source TEXT, visibility TEXT NOT NULL DEFAULT 'private', updated_at TEXT);
  CREATE TABLE portfolio_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_date TEXT, kind TEXT, session TEXT, summary TEXT, scorecard_json TEXT, actions_json TEXT, needs_owner TEXT, created_at TEXT);
  CREATE TABLE sai_config (k TEXT PRIMARY KEY, v REAL, source TEXT, updated_at TEXT);
  CREATE TABLE objectives (id INTEGER PRIMARY KEY AUTOINCREMENT, objective_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, source TEXT, ratified_by TEXT, ratified_on TEXT, version INTEGER DEFAULT 1, status TEXT DEFAULT 'ACTIVE');
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);
  CREATE TABLE metric_history (metric TEXT, day TEXT, value REAL);
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
  CREATE TABLE analytics_action_log (id INTEGER PRIMARY KEY AUTOINCREMENT, trigger_id INTEGER, fired_at TEXT);
  CREATE VIEW v_metric_trigger_state AS
    SELECT t.id, t.metric_key, t.title, t.operator, t.threshold, t.owner, t.priority,
      CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = t.metric_key), 0) AS REAL) AS val,
      CASE WHEN t.operator = 'gt' THEN (CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = t.metric_key), 0) AS REAL) > t.threshold)
           WHEN t.operator = 'gte' THEN (CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = t.metric_key), 0) AS REAL) >= t.threshold)
           WHEN t.operator = 'lt' THEN (CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = t.metric_key), 0) AS REAL) < t.threshold)
           WHEN t.operator = 'lte' THEN (CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = t.metric_key), 0) AS REAL) <= t.threshold)
           ELSE 0 END AS hit
    FROM analytics_metric_triggers t;`);
  db.prepare("INSERT INTO fleet_dashboard_state VALUES (1,?,?,1)").run(new Date().toISOString(), JSON.stringify(STATE));
  // Steady state: the money/return snapshot is fresh, so humanView does not fire a background re-measure while the test
  // compares two revisions (that write is real content and would move the revision mid-assertion, not a bug).
  db.prepare("INSERT INTO fleet_loop_meta (k,v) VALUES ('human_gov_snapshot', ?)").run(JSON.stringify({
    at: new Date().toISOString(),
    cost: { spend30: 120, cap: 150, balance: 40, credit_burn7: 8, credit_burn24: 1, metered30: 130, metered_top: [], workers_ai30: 3, period_gross: 120, gateway_limit: null, total_est30: 130 },
    ret: { subs_confirmed: 3, subs_total: 5, subs_new30: 1, pageviews30: 100, pageviews_mom: 5, pageviews_prior_days: 30, reports30: 2, publish_events30: 2, impact_per_usd: 0.1 },
    autonomy: { overall: 3, self_heal: 3 }, fleet: { workers: 30 }, early_trigger: null, trend: null, gates_met: 1, gates_total: 5, survival: 0.5
  }));
  db.prepare("INSERT INTO human_actions (slug,title,why,action,due,source) VALUES ('rt-one','Top up the AI credit','why it is yours','act','','billing')").run();
  db.prepare("INSERT INTO analytics_metric_triggers (metric_key,title,operator,threshold,priority,action,owner) VALUES ('fleet_ai_run_rate_30d_usd','Fleet AI run-rate above $15/30d','gt',95,8,'code-task: repo=QNFO/qnfo-workers path=qnfo-fleet-control/worker.js','qnfo-fleet-control')").run();
  db.prepare("INSERT INTO metric_registry (metric,last_value,last_refreshed) VALUES ('fleet_ai_run_rate_30d_usd','281.14',?)").run(new Date().toISOString());
  db.prepare("INSERT INTO metric_history (metric,day,value) VALUES ('fleet_ai_run_rate_30d_usd',date('now','-1 day'),200)").run();
  db.prepare("INSERT INTO metric_history (metric,day,value) VALUES ('fleet_ai_run_rate_30d_usd',date('now'),281.14)").run();
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  const env = { AUDIT: { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } }, LOOP_TOKEN: LOOP };
  return { env, db };
}

const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughOnException() {} };
const O = "https://fleet.qnfo.org";
const call = (env, path, headers) => worker.fetch(new Request(O + path, { headers: headers || {} }), env, ctx);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const etagOf = (r) => r.headers.get("ETag");

// A. the index
{
  const { env } = mk();
  const r = await call(env, "/api");
  const j = await r.json();
  ok(r.status === 200 && j.schema_version === "fleet-api-index/v2", "A1 GET /api serves the index (v2: reads grouped by functional area)");
  ok(Array.isArray(j.endpoints) && j.endpoints.length >= 20, "A2 the index lists the read surface (" + (j.endpoints || []).length + " rows)");
  ok(j.endpoints.every((e) => e.path && e.method && e.auth && e.schema_version && e.cache && e.freshness && e.what), "A3 every row states path, method, auth, schema, cache and freshness");
  for (const p of ["/api/live", "/api/human", "/api/areas", "/api/decision", "/api/state", "/health"]) {
    ok(j.endpoints.some((e) => e.path === p), "A4 index names " + p);
  }
  const tag = etagOf(r);
  ok(!!tag, "A5 the index carries an ETag");
  const r304 = await call(env, "/api", { "If-None-Match": tag });
  ok(r304.status === 304 && (await r304.text()) === "", "A6 the index revalidates to 304 with no body");
  // every indexed read that this suite can drive answers 200: the table is not fiction
  let live = 0;
  for (const path of ["/api/live", "/api/human", "/api/areas", "/api/decision", "/api/state", "/api/actions", "/api/loop", "/health", "/api"]) {
    const rr = await call(env, path);
    if (rr.status === 200) live++;
  }
  ok(live === 9, "A7 every indexed read this suite drives answers 200 (" + live + "/9)");
}

// B. one consolidated snapshot
{
  const { env } = mk();
  const r = await call(env, "/api/live");
  const j = await r.json();
  ok(r.status === 200 && j.schema_version === "fleet-live/v1", "B1 /api/live serves fleet-live/v1");
  ok(typeof j.revision === "string" && j.revision.length >= 4, "B2 it carries a content revision");
  const areas = await (await call(env, "/api/areas")).json();
  const human = await (await call(env, "/api/human")).json();
  ok(j.areas.total === areas.total, "B3 areas.total agrees with /api/areas (" + j.areas.total + ")");
  ok(j.queue.open === human.count, "B4 queue.open agrees with /api/human (" + j.queue.open + ")");
  ok(j.decision.verdict === human.decision.verdict, "B5 the invest verdict agrees with /api/human");
  ok(j.state.probes_total === 2 && j.state.probes_ok === 2, "B6 probe counts come from the state");
  ok(j.areas.by_area.length === 5 && j.areas.by_area.every((a) => a.id && a.status), "B7 the five areas are present with a status");
  const cost = j.areas.by_area.find((a) => a.id === "cost");
  ok(cost && cost.focus && cost.focus.key === "fleet_ai_run_rate_30d_usd" && cost.focus.lever_kind === "code", "B8 an area names its constraint and its lever type");
  const tag = etagOf(r);
  ok(!!tag && r.headers.get("Cache-Control").includes("public"), "B9 /api/live is public and carries an ETag");
  const r304 = await call(env, "/api/live", { "If-None-Match": tag });
  ok(r304.status === 304 && (await r304.text()) === "", "B10 /api/live revalidates to 304");
  const rs = await (await call(env, "/api/live?since=" + j.revision)).json();
  ok(rs.not_modified === true && rs.revision === j.revision, "B11 ?since=<revision> answers not_modified (sent " + j.revision + ", got " + rs.revision + ", not_modified " + rs.not_modified + ")");
  const rs2 = await (await call(env, "/api/live?since=rev:deadbeef")).json();
  ok(!rs2.not_modified && rs2.queue, "B12 an unknown revision gets the full snapshot");
}

// C. content ETags on the reads the page polls
{
  const { env } = mk();
  const a = await call(env, "/api/areas");
  const tag = etagOf(a);
  ok(!!tag, "C1 /api/areas carries an ETag");
  const b = await call(env, "/api/areas", { "If-None-Match": tag });
  ok(b.status === 304 && (await b.text()) === "", "C2 unchanged content answers 304 with no body");
  const h = await call(env, "/api/human");
  const htag = etagOf(h);
  ok(!!htag, "C3 /api/human carries an ETag");
  const h2 = await call(env, "/api/human", { "If-None-Match": htag });
  ok(h2.status === 304, "C4 /api/human revalidates to 304");
  const f = await call(env, "/?frag=1");
  const ftag = etagOf(f);
  ok(!!ftag, "C5 the live fragment carries an ETag");
  const f2 = await call(env, "/?frag=1", { "If-None-Match": ftag });
  ok(f2.status === 304 && (await f2.text()) === "", "C6 the fragment revalidates to 304 (the poll keeps its DOM)");
  const f3 = await call(env, "/?frag=1&rev=" + encodeURIComponent(ftag));
  ok(f3.status === 204 && (await f3.text()) === "", "C7 ?rev=<revision> answers 204 with no body");
  ok(f3.headers.get("X-Content-Revision") === ftag, "C8 the revision travels in a header the edge keeps");
  const page = await (await call(env, "/")).text();
  ok(page.includes("If-None-Match") && page.includes("&rev="), "C9 the poll is conditional on both the header and the param");
  ok(page.includes("r.status===304||r.status===204"), "C10 the poll treats 304 and 204 the same (no re-render)");
}

// D. a real change moves the revision
{
  const { env, db } = mk();
  const before = await call(env, "/api/human");
  const tag = etagOf(before);
  db.prepare("INSERT INTO human_actions (slug,title,why,action,due,source) VALUES ('rt-two','Reply to the funder','why','act','','inbox')").run();
  const after = await call(env, "/api/human", { "If-None-Match": tag });
  ok(after.status === 200, "D1 a new queue item is not served as 304");
  ok(etagOf(after) !== tag, "D2 the ETag changed with the content");
  const j = await after.json();
  ok(j.count === 2 && j.items.some((i) => i.key === "ha:rt-two"), "D3 the new item is in the payload");
  const frag = await call(env, "/?frag=1", { "If-None-Match": tag });
  ok(frag.status === 200, "D4 the fragment is not served stale either");
}

// E. owner-bearing responses are never publicly cacheable
{
  const { env } = mk();
  const open = await call(env, "/api/human");
  ok(/public/.test(open.headers.get("Cache-Control") || ""), "E1 the public queue may be reused (public, 15 s)");
  const held = await call(env, "/api/human", { "x-loop-token": LOOP });
  const cc = held.headers.get("Cache-Control") || "";
  ok(/private/.test(cc) && /no-store/.test(cc), "E2 a holder's response is private, no-store (" + cc + ")");
  ok(/Cookie/.test(held.headers.get("Vary") || ""), "E3 and varies on the credential");
  const j = await held.json();
  ok("responses" in j, "E4 the holder still gets its extra fields (no behaviour change)");
}

// F. /health advertises the refactor
{
  const { env } = mk();
  const j = await (await call(env, "/health")).json();
  ok(["api-index", "live-snapshot", "conditional-reads"].every((c) => j.capabilities.includes(c)), "F1 capabilities name the new surface");
  // A minimum, never an exact string: an exact pin fails for good on the next bump (VERSION-MINOR-CAPABILITY-1).
  const ver = String(j.version || "").split(".").map((x) => Number(x));
  ok(ver[0] === 1 && ver[1] >= 44, "F2 the worker reports at least 1.44 (" + j.version + ")");
}

// G. the index's auth claims hold (the table is a contract, not documentation)
{
  const { env } = mk();
  const r = await call(env, "/api/owner/prompts");
  ok(r.status === 403, "G1 /api/owner/* is not open (" + r.status + ")");
  const p = await worker.fetch(new Request(O + "/api/cmd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "queue" }) }), env, ctx);
  ok(p.status === 400, "G2 /api/cmd refuses a write without x-fleet-ui (" + p.status + ")");
  const h = await call(env, "/health");
  ok(h.status === 200 && h.headers.get("Cache-Control") === "no-store", "G3 /health stays open and uncached");
}

// H. compaction, paging and the digest contract (COMPACT-READS-1)
{
  const { env, db } = mk();
  const areas = await (await call(env, "/api/areas")).json();
  ok(areas.schema_version === "fleet-areas/v3", "H1 areas schema is v3 (" + areas.schema_version + ")");
  const rowsA = (areas.areas || []).flatMap((a) => [].concat(a.top || [], a.all || []));
  ok(rowsA.length > 0 && rowsA.every((r) => !("fullLever" in r)), "H2 the compact body carries no fullLever (" + rowsA.length + " rows)");
  ok(rowsA.some((r) => typeof r.lever === "string" && r.lever.length > 0), "H3 the clipped lever stays");
  const full = await (await call(env, "/api/areas?full=1")).json();
  const rowsF = (full.areas || []).flatMap((a) => [].concat(a.top || [], a.all || []));
  ok(rowsF.some((r) => typeof r.fullLever === "string" && r.fullLever.length > 0), "H4 ?full=1 restores the full lever text");
  ok(typeof areas.revision === "string" && areas.revision.length >= 4, "H5 the compact body carries its revision");
  const aSince = await (await call(env, "/api/areas?since=" + areas.revision)).json();
  ok(aSince.not_modified === true, "H6 ?since=<revision> works on /api/areas");
  const h = await (await call(env, "/api/human")).json();
  const hSince = await (await call(env, "/api/human?since=" + h.revision)).json();
  ok(hSince.not_modified === true, "H7 ?since=<revision> works on /api/human");
  // the changelog: one page by default, whole history on request, revalidating
  await call(env, "/api/changelog");
  for (let i = 0; i < 25; i++) {
    db.prepare("INSERT INTO fleet_changelog (worker, version, level, released_at, prev_version, title, summary, marker, pr, sha, pillar, public_hosts, enriched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run("w" + i, "1.0." + i, "patch", new Date(Date.now() - i * 36e5).toISOString(), null, "title " + i, "summary " + i, null, null, null, "autonomy", null, null);
  }
  const c1 = await (await call(env, "/api/changelog")).json();
  ok(c1.schema_version === "changelog/v2" && c1.page && c1.page.limit === 20, "H8 changelog is v2 and pages at 20");
  ok(c1.page.total >= 25 && c1.releases.length === 20 && c1.page.has_more === true, "H9 a page is 20 of " + c1.page.total + ", has_more true");
  const cAll = await (await call(env, "/api/changelog?limit=all")).json();
  ok(cAll.releases.length === cAll.page.total && cAll.page.limit === cAll.page.total, "H10 ?limit=all returns the whole history (" + cAll.page.total + ")");
  const cTag = etagOf(await call(env, "/api/changelog"));
  ok(!!cTag, "H11 the changelog revalidates");
  ok((await call(env, "/api/changelog", { "If-None-Match": cTag })).status === 304, "H12 unchanged changelog answers 304");
  db.prepare("UPDATE fleet_changelog SET title='renamed' WHERE version='1.0.3'").run();
  const moved = await call(env, "/api/changelog", { "If-None-Match": cTag });
  ok(moved.status === 200 && etagOf(moved) !== cTag, "H13 a NON-clock field change moves the ETag (no over-stripping)");
}

// I. every open read answers the same contract, not just the three that carried the example
{
  const { env } = mk();
  const probes = ["/api/state", "/api/actions", "/api/loop", "/api/integration", "/api/changes", "/api/watchmaker", "/api/generators", "/api/reach", "/api/attention", "/api/kpi", "/api/content", "/api/ga4", "/api/q08-review", "/api/decision"];
  let live = 0, rev = 0;
  for (const p of probes) {
    const a = await call(env, p);
    if (a.status !== 200) { console.log("  (skip " + p + ": " + a.status + " in this harness)"); continue; }
    live++;
    const tag = etagOf(a);
    if (!tag) { ok(false, "I1 missing ETag on " + p); continue; }
    const body = await a.clone().json();
    if (!body.revision) ok(false, "I2 missing body revision on " + p);
    const b = await call(env, p, { "If-None-Match": tag });
    if (b.status === 304) rev++; else ok(false, "I3 " + p + " did not revalidate (" + b.status + ")");
  }
  ok(live >= 11, "I4 at least eleven extended reads answer 200 here (" + live + "/" + probes.length + ")");
  ok(rev === live, "I5 every one of them revalidates (" + rev + "/" + live + ")");
  const ix = await (await call(env, "/api")).json();
  const rows = ix.endpoints || [];
  for (const p of ["/api/state", "/api/actions", "/api/kpi", "/api/content", "/api/decision", "/api/reach", "/api/changelog", "/api/areas", "/api/human", "/api/live"]) {
    const row = rows.find((e) => e.path === p);
    ok(!!row && /ETag/.test(row.cache), "I6 the index promises ETag for " + p);
  }
}

// J. the clock list is the contract: a clock field never moves the revision, a content field always does.
// This is the assertion that would have caught /api/kpi: its body carries as_of and activity_as_of, which are built from
// Date.now() on every build, so two isolates (or one cache expiry) could never agree on a revision. The route suite could
// not see it, because kpiData hands back an isolate-cached object and both calls in one process saw the same as_of.
{
  const src2 = readFileSync(join(here, "worker.js"), "utf8");
  const a2 = src2.indexOf("function rtHash(");
  const b2 = src2.indexOf("function areasApiRow");
  ok(a2 > 0 && b2 > a2, "J1 the digest block is sliceable");
  const cx2 = vm.createContext({ console, JSON, Math, Object, String, Array, Number, Response, Headers, __name: (f) => f, __name2: (f) => f, __name22: (f) => f, __name222: (f) => f, __name2222: (f) => f });
  vm.runInContext(src2.slice(a2, b2) + "\nglobalThis.rtDigest = rtDigest; globalThis.RT_CLOCK = RT_CLOCK;", cx2);
  const d = cx2.rtDigest;
  ok(d({ x: 1, as_of: "2026-01-01T00:00:00Z" }) === d({ x: 1, as_of: "2026-10-18T11:00:00Z" }), "J2 as_of does not move the revision");
  ok(d({ x: 1, activity_as_of: "a" }) === d({ x: 1, activity_as_of: "b" }), "J3 activity_as_of does not move the revision");
  ok(d({ x: 1, generated_at: "a", age: 1 }) === d({ x: 1, generated_at: "b", age: 99 }), "J4 the clock fields do not move the revision");
  ok(d({ x: 1 }) !== d({ x: 2 }), "J5 a content field does move the revision");
  ok(d({ items: [{ key: "a", age: 1 }] }) === d({ items: [{ key: "a", age: 500 }] }), "J6 a clock field nested in an array is ignored too");
  ok(d({ since: "a", deploys: 1 }) === d({ since: "b", deploys: 1 }), "J7 the echoed window start is a clock field");
  ok(d({ since: "a", deploys: 1 }) !== d({ since: "a", deploys: 2 }), "J8 ...and a change inside that window still moves the revision");
}

// K. AREA-FEEDS-1: every read belongs to exactly one functional area, and each area answers as its own live feed.
// The directive is "refactor the API feeds by functional area, and feeds are always updated from live data": so the
// grouping must be DATA (one area per row, one source and lag per row), each area must have a feed, and that feed must
// agree with /api/areas and revalidate. K17 is the regression for the live 500: an older handler for GET /api/ga4 stood
// in front of the GA4-DATA-API-1 ledger read and called retired helpers, so the route errored while the newer code below
// it was unreachable.
{
  const { env } = mk();
  const ix = await (await call(env, "/api")).json();
  const ids = ["cost", "research", "reach", "autonomy", "reliability", "platform"];
  ok(Array.isArray(ix.by_area) && ix.by_area.length === ids.length, "K1 /api groups the reads into the six areas (" + (ix.by_area || []).length + ")");
  ok(Array.isArray(ix.areas) && ix.areas.length === ids.length && ix.by_area.every((a) => ids.includes(a.id)), "K2 the grouping names only known areas");
  const reads = ix.endpoints.filter((e) => /GET/.test(e.method));
  ok(reads.every((e) => ids.includes(e.area)), "K3 every read names a known functional area");
  ok(reads.every((e) => typeof e.lag_s === "number" && ["live", "snapshot", "mixed"].includes(e.source)), "K4 every read declares source and lag_s");
  ok(ix.by_area.every((a) => a.feeds.length > 0 && a.feed_count === a.feeds.length), "K5 no area is empty in the grouping");
  for (const a of ix.by_area) {
    // the area's own feed is a member of its grouping by construction; the rest must be exactly the rows that name it
    const fromRows = reads.filter((e) => e.area === a.id).map((e) => e.path).sort();
    const grouped = a.feeds.filter((p) => p !== a.path).sort();
    ok(JSON.stringify(fromRows) === JSON.stringify(grouped), "K6 " + a.id + " grouping matches its rows (" + fromRows.length + ")");
    ok(a.feeds.includes(a.path), "K6b " + a.id + " lists its own feed");
  }
  const areas = await (await call(env, "/api/areas")).json();
  for (const id of ids) {
    const r = await call(env, "/api/area/" + id);
    const j = await r.clone().json();
    ok(r.status === 200 && j.schema_version === "fleet-area-feed/v1" && j.area.id === id, "K7 /api/area/" + id + " answers as its own feed");
    const row = (areas.areas || []).find((x) => x.id === id);
    ok(j.breaches.total === (row ? row.count : 0), "K8 /api/area/" + id + " breach count agrees with /api/areas (" + j.breaches.total + ")");
    ok(j.live === true && typeof j.max_lag_s === "number" && j.max_lag_s <= 60, "K9 area " + id + " states it is live and bounds its lag");
    ok(Array.isArray(j.feeds) && j.feeds.length > 0 && j.feeds.every((f) => typeof f.lag_s === "number"), "K10 area " + id + " lists its member reads with their lag");
    ok(Array.isArray(j.computed_from) && j.computed_from.length > 0, "K11 area " + id + " names what it reads");
    ok(j.data && "age_min" in j.data && typeof j.data.metrics === "number", "K11b area " + id + " states the age of the metrics it reports");
    const tag = etagOf(r);
    ok(!!tag && (await call(env, "/api/area/" + id, { "If-None-Match": tag })).status === 304, "K12 area " + id + " revalidates to 304");
    ok((await (await call(env, "/api/area/" + id + "?since=" + j.revision)).json()).not_modified === true, "K13 ?since=<revision> works on area " + id);
  }
  ok((await call(env, "/api/area/nope")).status === 404, "K14 an unknown area is a 404, not an empty 200");
  // A malformed percent sequence must be a 404 like any unknown route, not a 500: decodeURIComponent throws, and every
  // other read in this worker compares the raw path. Measured live on 1.44.1 and fixed in 1.44.2.
  ok((await call(env, "/api/area/%E0%A4%A")).status === 404, "K14b a malformed escape is a 404, not a 500");
  ok((await call(env, "/api/area/cost/")).status === 200, "K14c a trailing slash still resolves");
  const comp = await (await call(env, "/api/area/autonomy")).json();
  ok((comp.breaches.top || []).every((x) => !("fullLever" in x)), "K15 the compact area feed carries no fullLever");
  const fullA = await (await call(env, "/api/area/autonomy?full=1")).json();
  ok(Array.isArray(fullA.breaches.all), "K16 ?full=1 restores every breach row");
  const g = await call(env, "/api/ga4");
  ok(g.status === 200 && (await g.clone().json()).runs !== void 0, "K17 /api/ga4 answers from the ingest ledger (no shadowed 500)");
  const gt = etagOf(g);
  ok(!!gt && (await call(env, "/api/ga4", { "If-None-Match": gt })).status === 304, "K18 /api/ga4 revalidates");
  const h = await (await call(env, "/health")).json();
  ok(["feeds-by-area", "area-feed"].every((c) => h.capabilities.includes(c)), "K19 /health advertises the area feeds");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
