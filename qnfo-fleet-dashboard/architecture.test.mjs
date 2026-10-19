// ARCH-SELF-MODEL-1 (1.48.0) offline suite: the fleet answers "what are you" from its own records.
// Proves: (A) the model is wired: the block, the platform area page, the feed index row, the health capability; (B) built from a code+live
// graph, a service registry, heartbeats and a cron table it names each worker with its layer, version, schedules, databases, service
// dependencies in both directions and the tables its code reads and writes, and it assigns a worker no layer names to "unclassified"
// instead of guessing; (C) the lookups: a worker, a table by suffix, an ambiguous name (candidates, no detail), an unknown name (no
// match, no detail), the blast radius (transitive dependents, tables others read), a search; (D) the page renders every section, escapes
// what is typed into it and lights the Platform area; (E) honesty: with the graph unbound the model still answers from the registry and
// names what it could not read (never an empty list passed off as a fact), and a retired worker is not listed; (F) no secret name or
// value leaves the feed; (G) the model is kept for its TTL per env.
// Run: node qnfo-fleet-dashboard/architecture.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });
const src = readFileSync(join(here, "worker.js"), "utf8");

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 500) : "")); } };

function shim(db, counter) {
  return {
    prepare(sql) {
      if (counter) counter.n++;
      const st = db.prepare(sql);
      let args = [];
      return { bind(...a) { args = a; return this; }, async all() { return { results: st.all(...args) }; }, async first() { return st.get(...args) || null; }, async run() { st.run(...args); return {}; } };
    }
  };
}
const NOW = new Date().toISOString();
function graphDb(extraCrons) {
  const g = new DatabaseSync(":memory:");
  g.exec(`CREATE TABLE fg_node (id TEXT, scope TEXT, kind TEXT, name TEXT, worker TEXT, path TEXT, line INTEGER, attrs TEXT, source TEXT, h TEXT, updated_at TEXT);
  CREATE TABLE fg_edge (src TEXT, rel TEXT, dst TEXT, scope TEXT, confidence TEXT, source TEXT, path TEXT, attrs TEXT, h TEXT, updated_at TEXT);
  CREATE TABLE fg_finding (id TEXT, kind TEXT, subject TEXT, severity TEXT, detail TEXT, h TEXT, first_seen TEXT, last_seen TEXT);
  CREATE TABLE fg_state (scope TEXT, sha TEXT, built_at TEXT, nodes INTEGER, edges INTEGER, written INTEGER, deleted INTEGER, ms INTEGER, status TEXT, detail TEXT, version TEXT);`);
  const node = (id, scope, kind, name, worker, attrs) => g.prepare("INSERT INTO fg_node (id, scope, kind, name, worker, attrs) VALUES (?,?,?,?,?,?)").run(id, scope, kind, name, worker, JSON.stringify(attrs || {}));
  const edge = (src, rel, dst, scope) => g.prepare("INSERT INTO fg_edge (src, rel, dst, scope) VALUES (?,?,?,?)").run(src, rel, dst, scope || "code");
  for (const w of ["qnfo-fleet-control", "qnfo-ops", "qnfo-gateway", "mystery-worker"]) {
    node("worker:" + w, "code", "worker", w, w, { version: "1.0.0" });
    node("worker:" + w, "live", "worker", w, w, { live: true, modified_on: "2026-10-19T07:00:00Z", handlers: ["fetch", "scheduled"] });
  }
  // fleet-control binds the audit database and the ops service, has a cron, reads and writes tables
  node("binding:qnfo-fleet-control.AUDIT", "code", "binding", "AUDIT", "qnfo-fleet-control", { type: "d1" });
  edge("worker:qnfo-fleet-control", "has_binding", "binding:qnfo-fleet-control.AUDIT");
  edge("binding:qnfo-fleet-control.AUDIT", "binds", "d1:qnfo-audit");
  edge("worker:qnfo-fleet-control", "has_binding", "binding:qnfo-fleet-control.SVC_OPS");
  edge("binding:qnfo-fleet-control.SVC_OPS", "binds", "worker:qnfo-ops");
  edge("worker:qnfo-fleet-control", "has_binding", "binding:qnfo-fleet-control.SECRET_X", "live");
  edge("worker:qnfo-fleet-control", "has_secret", "secret:qnfo-fleet-control.SUPER_SECRET_KEY", "live");
  edge("worker:qnfo-fleet-control", "has_cron", "cron:qnfo-fleet-control@*/5 * * * *", "live");
  edge("worker:qnfo-ops", "has_binding", "binding:qnfo-ops.AUDIT");
  edge("binding:qnfo-ops.AUDIT", "binds", "d1:qnfo-audit");
  edge("worker:qnfo-gateway", "has_binding", "binding:qnfo-gateway.SVC_OPS");
  edge("binding:qnfo-gateway.SVC_OPS", "binds", "worker:qnfo-ops");
  edge("worker:qnfo-gateway", "serves", "route:papers.qnfo.org/*", "live");
  for (const [w, fn, rel, t] of [["qnfo-fleet-control", "tick", "reads", "qnfo-audit.agent_issues"], ["qnfo-fleet-control", "tick", "writes", "qnfo-audit.code_tasks"], ["qnfo-ops", "deploy", "writes", "qnfo-audit.deployment_history"], ["qnfo-ops", "deploy", "reads", "qnfo-audit.code_tasks"], ["qnfo-gateway", "page", "reads", "living-paper.papers"]]) {
    node("fn:" + w + "#" + fn, "code", "function", fn, w, {});
    edge("fn:" + w + "#" + fn, rel, "d1t:" + t);
  }
  for (const [w, expr] of extraCrons || []) edge("worker:" + w, "has_cron", "cron:" + w + "@" + expr, "live");
  g.prepare("INSERT INTO fg_finding (id, kind, subject, severity, detail) VALUES ('f1','env-undeclared','qnfo-gateway.SOME_VAR','warn','read but not declared'), ('f2','resource-orphan','d1:personal-prefs','info','bound to no worker')").run();
  g.prepare("INSERT INTO fg_state (scope, sha, built_at, nodes, edges, status) VALUES ('code','abc1234',?,10,12,'ok'), ('live','abc1234',?,5,6,'ok')").run(NOW, NOW);
  return g;
}
function auditDb(opts) {
  const a = new DatabaseSync(":memory:");
  a.exec(`CREATE TABLE service_registry (service TEXT, kind TEXT, version TEXT, base_url TEXT, purpose TEXT, capabilities TEXT, routes TEXT, tools TEXT, models TEXT, deps TEXT, updated_at TEXT, state TEXT);
  CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
  CREATE TABLE fleet_crons (id INTEGER, name TEXT, cron_expr TEXT, task_id TEXT, enabled INTEGER, timezone TEXT, last_fired TEXT, next_fire TEXT, updated_at TEXT);
  CREATE TABLE agent_issues (id INTEGER); CREATE TABLE code_tasks (id TEXT);
  CREATE TABLE cron_fire_log (id INTEGER PRIMARY KEY, cron_name TEXT, task_id TEXT, cron_expr TEXT, fired_at TEXT, fired_epoch_ms INTEGER, outcome TEXT, source TEXT, note TEXT);`);
  for (const [w, expr, outcome, agoMin] of (opts && opts.fires) || []) a.prepare("INSERT INTO cron_fire_log (cron_name, task_id, cron_expr, fired_at, fired_epoch_ms, outcome, source, note) VALUES (?, ?, ?, ?, ?, ?, ?, '')").run(w + "|" + expr, w, expr, new Date(Date.now() - (agoMin || 0) * 60000).toISOString(), Date.now() - (agoMin || 0) * 60000, outcome, "worker:" + w);
  a.prepare("INSERT INTO service_registry (service, kind, version, purpose, state) VALUES ('qnfo-fleet-control','worker','0.34.0','merged fleet control','live'), ('qnfo-ops','worker','2.49.0','ops endpoint','live'), ('qnfo-gateway','worker','3.26.5','landing and papers','live'), ('old-folded','member','1.0.0','gone','retired')").run();
  a.prepare("INSERT INTO fleet_heartbeat VALUES ('qnfo-fleet-control','0.34.0',?,1), ('qnfo-ops','2.49.0',?,0)").run(NOW, NOW);
  for (const [w, ago, ok] of (opts && opts.beats) || []) a.prepare("INSERT OR REPLACE INTO fleet_heartbeat VALUES (?, '1.0.0', ?, ?)").run(w, new Date(Date.now() - ago * 60000).toISOString(), ok);
  a.prepare("INSERT INTO fleet_crons (id, name, cron_expr, enabled, last_fired) VALUES (1,'fleet-exec dispatch','*/5 * * * *',1,?)").run(opts && opts.loopAgo ? new Date(Date.now() - opts.loopAgo * 60000).toISOString() : NOW);
  a.prepare("INSERT INTO agent_issues VALUES (1),(2),(3)").run();
  return a;
}
const get = async (env, path) => {
  const r = await worker.fetch(new Request("https://fleet.qnfo.org" + path), env, { waitUntil() {} });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch (e) { j = null; }
  return { s: r.status, t, j, h: r.headers };
};
const mkEnv = (opts) => { const c = { n: 0 }; const env = { AUDIT: shim(auditDb(opts), c), GRAPH: opts && opts.noGraph ? undefined : shim(graphDb(opts && opts.crons), c) }; env.__count = c; return env; };

// (A) wiring
ok(/ARCH-SELF-MODEL:BEGIN/.test(src) && /ARCH-SELF-MODEL:END/.test(src), "the architecture block is delimited");
ok(/\{ key: "architecture", label: "Architecture", href: "\/architecture", feed: "\/api\/architecture" \}/.test(src), "the platform area lists the Architecture page and its feed");
ok(/\{ path: "\/api\/architecture", area: "platform"/.test(src), "the feed index has a row for /api/architecture");
ok(/\/\/ ==== AREA-MAP platform: architecture self-model/.test(src), "the block carries its AREA-MAP banner");
let envA = mkEnv();
let h = await get(envA, "/health");
ok(h.s === 200 && h.j && h.j.capabilities.indexOf("architecture") >= 0, "/health names the architecture capability", h.j && h.j.capabilities);

// (B) the model
let r = await get(envA, "/api/architecture");
ok(r.s === 200 && r.j && r.j.schema_version === "fleet-architecture/v1", "GET /api/architecture answers fleet-architecture/v1", r.s);
const M = r.j || {};
const names = (M.workers || []).map((w) => w.name);
ok(names.join(",") === "mystery-worker,qnfo-fleet-control,qnfo-gateway,qnfo-ops", "every live or registered worker is listed, sorted, the retired one is not", names);
const W = (n) => (M.workers || []).find((w) => w.name === n) || {};
ok(W("qnfo-fleet-control").layer === "control" && W("qnfo-gateway").layer === "publish", "layers come from the table", [W("qnfo-fleet-control").layer, W("qnfo-gateway").layer]);
ok(W("mystery-worker").layer === "unclassified" && (M.layers || []).some((l) => l.id === "unclassified" && l.workers.indexOf("mystery-worker") >= 0), "a worker no layer names is unclassified, and the layer list says so");
ok(M.summary && M.summary.unclassified === 1 && M.summary.workers === 4, "the summary counts workers and unclassified", M.summary);
ok(JSON.stringify(W("qnfo-fleet-control").depends_on) === '["qnfo-ops"]' && JSON.stringify(W("qnfo-ops").depended_on_by) === '["qnfo-fleet-control","qnfo-gateway"]', "service dependencies are recorded in both directions", [W("qnfo-fleet-control").depends_on, W("qnfo-ops").depended_on_by]);
ok(JSON.stringify(W("qnfo-fleet-control").crons) === '["*/5 * * * *"]' && JSON.stringify(W("qnfo-gateway").routes) === '["papers.qnfo.org/*"]', "schedules and routes come from the live graph");
ok(JSON.stringify(W("qnfo-fleet-control").d1) === '["qnfo-audit"]', "a worker names the databases it is bound to");
ok(W("qnfo-fleet-control").reads === 1 && W("qnfo-fleet-control").writes === 1, "the default view counts the tables a worker reads and writes", [W("qnfo-fleet-control").reads, W("qnfo-fleet-control").writes]);
ok(W("qnfo-ops").beat && W("qnfo-ops").beat.ok === false && W("qnfo-fleet-control").beat.ok === true && typeof W("qnfo-ops").beat.age_min === "number", "the last tick and whether it was ok are carried", W("qnfo-ops").beat);
ok(W("qnfo-fleet-control").purpose === "merged fleet control", "the purpose comes from the service registry");
ok(M.data && M.data.d1[0].name === "qnfo-audit" && M.data.d1[0].bound_by.join(",") === "qnfo-fleet-control,qnfo-ops" && M.data.d1[0].tables_seen === 3, "databases list who binds them and how many tables code touches", M.data && M.data.d1);
ok(M.tables === undefined, "the table index is left out of the default view");
ok(M.loops && M.loops[0].name === "fleet-exec dispatch" && M.loops[0].enabled === true, "the fleet-exec loops are listed from fleet_crons", M.loops);
ok(M.change_path.length === 8 && M.change_path[0].name === "Claim" && M.change_path[5].name === "Canary", "the change path has its eight steps in order");
ok(M.authority.some((a) => a.rule === "Interrupt gate") && M.authority.some((a) => a.rule === "Secrets"), "the lanes of authority are listed");
ok(M.registries.find((x) => x.table === "agent_issues").rows === 3 && M.registries.find((x) => x.table === "failure_modes").rows === null, "registries carry their row count, or null where the table could not be read");
ok(M.graph.code && M.graph.code.sha === "abc1234" && M.graph.code.age_min <= 1, "the graph's own freshness is carried", M.graph);
ok(M.findings.total === 2 && M.findings.counts["env-undeclared/warn"] === 1, "the graph findings are carried with counts", M.findings);
ok(M.self && M.self.blind.length === 0 && M.self.sources.some((s) => s.name === "graph edges" && s.status === "read") && M.self.limits.length >= 3, "self names the sources it read and what it cannot see", M.self && M.self.blind);
r = await get(envA, "/api/architecture?full=1");
ok(r.j && r.j.tables && r.j.tables["qnfo-audit.code_tasks"].readers[0] === "qnfo-ops" && r.j.tables["qnfo-audit.code_tasks"].writers[0] === "qnfo-fleet-control", "?full=1 adds the table index with readers and writers");
ok(r.j && Array.isArray(r.j.workers.find((w) => w.name === "qnfo-ops").reads), "?full=1 lists the tables a worker reads, not just a count");

// (C) lookups
r = await get(envA, "/api/architecture/worker/qnfo-fleet-control");
ok(r.s === 200 && r.j.matches.length === 1 && r.j.detail.name === "qnfo-fleet-control" && r.j.detail.reads[0] === "qnfo-audit.agent_issues", "a worker by exact name", r.j);
r = await get(envA, "/api/architecture/worker/qnfo-");
ok(r.j.matches.length === 3 && r.j.detail === null, "an ambiguous name lists its candidates and no detail", r.j.matches);
r = await get(envA, "/api/architecture/worker/does-not-exist");
ok(r.s === 200 && r.j.matches.length === 0 && r.j.detail === null, "an unknown name is no match, not an invented worker", r.j);
r = await get(envA, "/api/architecture/table/code_tasks");
ok(r.j.matches[0] === "qnfo-audit.code_tasks" && r.j.detail.readers.join() === "qnfo-ops" && r.j.detail.writers.join() === "qnfo-fleet-control", "a table by its bare name resolves by suffix with readers and writers", r.j);
r = await get(envA, "/api/architecture/table/qnfo-audit.agent_issues");
ok(r.j.detail && r.j.detail.readers.join() === "qnfo-fleet-control" && r.j.detail.writers.length === 0, "a table by db.table");
r = await get(envA, "/api/architecture/impact/qnfo-ops");
ok(r.j.detail && r.j.detail.all_dependents.join() === "qnfo-fleet-control,qnfo-gateway" && r.j.detail.shared_tables.some((s) => s.table === "qnfo-audit.deployment_history") === false, "blast radius: dependents (and no shared table it writes that nobody else reads)", r.j.detail);
ok(r.j.detail.shared_tables.length === 0, "an unread table is not reported as shared");
r = await get(envA, "/api/architecture/impact/qnfo-fleet-control");
ok(r.j.detail.shared_tables.length === 1 && r.j.detail.shared_tables[0].table === "qnfo-audit.code_tasks" && r.j.detail.shared_tables[0].read_by.join() === "qnfo-ops", "blast radius lists the tables it writes that others read", r.j.detail);
r = await get(envA, "/api/architecture?q=gateway");
ok(r.j.workers.join() === "qnfo-gateway", "?q= searches workers by name or purpose", r.j);
r = await get(envA, "/api/architecture?q=papers");
ok(r.j.workers.join() === "qnfo-gateway" && r.j.tables.join() === "living-paper.papers", "?q= searches purposes and tables", r.j);
r = await get(envA, "/api/architecture/nothing/here");
ok(r.s === 404 && r.j && r.j.try.length === 5, "an unknown architecture path is a 404 that names the five routes", r.s);

// (D) the page
r = await get(envA, "/architecture");
ok(r.s === 200 && /text\/html/.test(r.h.get("content-type")), "GET /architecture answers HTML", r.s);
for (const id of ["layers", "workers", "data", "loops", "path", "authority", "registries", "findings", "self"]) ok(r.t.indexOf('id="' + id + '"') >= 0, "the page has the " + id + " section");
ok(/How this page knows/.test(r.t) && /What it cannot see/.test(r.t), "the page says how it knows and what it cannot see");
ok(/qnfo-fleet-control/.test(r.t) && /href="\/architecture\?worker=qnfo-ops"/.test(r.t), "workers link to their detail");
ok(/aria-current="page"/.test(r.t) && /class="q-sub"/.test(r.t) && /Architecture<\/a>/.test(r.t), "the Platform area is lit and its sub-bar lists Architecture");
r = await get(envA, "/architecture?worker=qnfo-ops");
ok(/Worker: qnfo-ops/.test(r.t) && /ops endpoint/.test(r.t) && /Blast radius/.test(r.t), "?worker= shows the worker's detail");
r = await get(envA, "/architecture?impact=qnfo-ops");
ok(/Blast radius: qnfo-ops/.test(r.t) && /qnfo-gateway/.test(r.t), "?impact= shows the blast radius");
r = await get(envA, "/architecture?table=code_tasks");
ok(/Table: code_tasks/.test(r.t) && /qnfo-fleet-control/.test(r.t), "?table= shows readers and writers");
r = await get(envA, "/architecture?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
ok(r.s === 200 && r.t.indexOf("<script>alert(1)</script>") < 0 && /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(r.t), "what is typed into the search is escaped");
r = await get(envA, "/area/platform");
ok(r.s === 200 && /href="\/architecture"/.test(r.t), "the Platform area page links the Architecture page");

// (E) honesty
const envB = mkEnv({ noGraph: true });
r = await get(envB, "/api/architecture");
ok(r.s === 200 && r.j.self.blind.indexOf("graph edges") >= 0 && r.j.self.blind.indexOf("graph workers") >= 0, "with the graph unbound the model names what it could not read", r.j && r.j.self);
ok(r.j.workers.map((w) => w.name).join() === "qnfo-fleet-control,qnfo-gateway,qnfo-ops", "it still lists the registered workers (the retired one stays out)", r.j.workers.map((w) => w.name));
ok(r.j.workers.every((w) => w.in_live === false && w.crons.length === 0), "and claims no schedule or deployment it could not read", r.j.workers[0]);
r = await get(envB, "/architecture");
ok(/Could not read: /.test(r.t) && /missing, not empty/.test(r.t), "the page says the missing parts are missing, not empty");

// (F) no secret name or value
const full = await get(mkEnv(), "/api/architecture?full=1");
ok(!/SUPER_SECRET_KEY|SECRET_X/.test(full.t), "no secret name leaves the feed");

// (G) kept per env
const envC = mkEnv();
await get(envC, "/api/architecture");
const n1 = envC.__count.n;
await get(envC, "/api/architecture/worker/qnfo-ops");
await get(envC, "/architecture");
ok(envC.__count.n === n1 && n1 > 5, "the model is read once and kept for its TTL", [n1, envC.__count.n]);
const envD = mkEnv();
await get(envD, "/api/architecture");
ok(envD.__count.n > 5, "a different env reads its own");

// (H) ARCH-OVERDUE-LOOPS-1: a loop is late against its own schedule (largest gap in a week + 120 minutes), not against a fixed number
envA = mkEnv();
r = await get(envA, "/api/architecture");
ok(r.j.summary.overdue_loops === 0 && r.j.overdue.length === 0, "a fresh fixture has no overdue loop", r.j.overdue);
ok(r.j.workers.find((w) => w.name === "qnfo-fleet-control").cadence_min === 5 && r.j.workers.find((w) => w.name === "qnfo-fleet-control").beat.overdue === false, "a */5 loop with a fresh tick has cadence 5 and is not overdue");
ok(r.j.workers.find((w) => w.name === "qnfo-ops").cadence_min === null, "a worker with no cron has no cadence and is not judged");
const envH = mkEnv({ crons: [["qnfo-ops", "0 6 * * *"], ["qnfo-gateway", "0 6,18 * * *"], ["mystery-worker", "0 16 * * 1"]],
  beats: [["qnfo-fleet-control", 200, 1], ["qnfo-ops", 1000, 1], ["qnfo-gateway", 900, 1], ["mystery-worker", 1085, 1]], loopAgo: 300 });
r = await get(envH, "/api/architecture");
const WH = (n) => r.j.workers.find((w) => w.name === n);
ok(WH("qnfo-fleet-control").beat.overdue === true, "a */5 loop 200 minutes old is overdue (limit 125)", WH("qnfo-fleet-control").beat);
ok(WH("qnfo-ops").cadence_min === 1440 && WH("qnfo-ops").beat.overdue === false, "a daily loop 1000 minutes old is not overdue (limit 1560)", [WH("qnfo-ops").cadence_min, WH("qnfo-ops").beat]);
ok(WH("qnfo-gateway").cadence_min === 720 && WH("qnfo-gateway").beat.overdue === true, "a twice-daily loop 900 minutes old is overdue (limit 840): the largest gap counts, not the average", [WH("qnfo-gateway").cadence_min, WH("qnfo-gateway").beat]);
ok(WH("mystery-worker").cadence_min === 10080 && WH("mystery-worker").beat.overdue === false, "a weekly cron (Cloudflare day 1 = Sunday) has a 10080-minute cadence and a tick 1085 minutes old is not late", [WH("mystery-worker").cadence_min, WH("mystery-worker").beat]);
ok(r.j.loops[0].overdue === true && r.j.loops[0].age_min >= 299 && r.j.loops[0].cadence_min === 5, "a fleet-exec task last fired 300 minutes ago is overdue", r.j.loops[0]);
ok(r.j.summary.overdue_loops === 3 && r.j.overdue.map((o) => o.kind + ":" + o.name).sort().join() === "loop:fleet-exec dispatch,worker:qnfo-fleet-control,worker:qnfo-gateway", "the summary and the overdue list name exactly the late ones", r.j.overdue);
ok(r.j.overdue.every((o) => o.limit_min === o.cadence_min + 120), "every overdue entry carries its limit (cadence + 120)");
r = await get(envH, "/architecture");
ok(/class="ar-late">overdue</.test(r.t) && /Overdue loops/.test(r.t), "the page marks the late loops and counts them");
const envI = mkEnv({ crons: [["qnfo-fleet-control", "0 0 1 * *"]], beats: [["qnfo-fleet-control", 5000, 1]] });
r = await get(envI, "/api/architecture");
ok(r.j.workers.find((w) => w.name === "qnfo-fleet-control").cadence_min === null && r.j.summary.overdue_loops === 0, "a cron that pins the day of the month is not judged", r.j.workers.find((w) => w.name === "qnfo-fleet-control").cadence_min);
ok(/overdue when its last tick is older than its schedule/.test(JSON.stringify(r.j.self.limits)), "self.limits says how overdue is judged");

// (I) ARCH-OVERDUE-GRID-1: a cron-grid worker's trigger is not its schedule
// personal-api: hourly grid trigger, daily job not run since the grid began (idle ticks only), heartbeat 441 minutes old
// qnfo-gateway: hourly grid trigger, daily job `5 6 * * *` has run (ok), heartbeat 1000 minutes old, then 1700
// qnfo-intent-orchestrator: half-hourly grid trigger, jobs 0,30 are its trigger itself (idle only) - unknown
// qnfo-subscribers: a worker on a plain hourly cron that logs ok rows for its own trigger: no grid, judged by the trigger
const envG = mkEnv({ crons: [["personal-api", "5 * * * *"], ["qnfo-gateway", "0 * * * *"], ["qnfo-intent-orchestrator", "0,30 * * * *"], ["qnfo-subscribers", "0 * * * *"]],
  beats: [["personal-api", 441, 1], ["qnfo-gateway", 1000, 1], ["qnfo-intent-orchestrator", 357, 1], ["qnfo-subscribers", 441, 1]],
  fires: [["personal-api", "5 * * * *", "idle", 20], ["qnfo-gateway", "0 * * * *", "idle", 30], ["qnfo-gateway", "5 6 * * *", "ok", 500], ["qnfo-intent-orchestrator", "0,30 * * * *", "idle", 10], ["qnfo-subscribers", "0 * * * *", "ok", 20]] });
r = await get(envG, "/api/architecture");
const WG = (n) => r.j.workers.find((w) => w.name === n);
ok(WG("personal-api").cadence_min === null && WG("personal-api").cadence_source === "cron-grid-unknown" && WG("personal-api").beat.overdue === false, "a grid worker that has only idled is not judged, however old its heartbeat is", [WG("personal-api").cadence_min, WG("personal-api").cadence_source, WG("personal-api").beat]);
ok(WG("qnfo-gateway").cadence_min === 1440 && WG("qnfo-gateway").cadence_source === "cron-grid" && WG("qnfo-gateway").beat.overdue === false, "a grid worker whose daily job has run is judged by that job (1440), a heartbeat 1000 minutes old is on time", [WG("qnfo-gateway").cadence_min, WG("qnfo-gateway").cadence_source, WG("qnfo-gateway").beat]);
ok(WG("qnfo-intent-orchestrator").cadence_min === null && WG("qnfo-intent-orchestrator").cadence_source === "cron-grid-unknown", "a grid worker whose only logged expression is its own trigger is not judged", WG("qnfo-intent-orchestrator").cadence_source);
ok(WG("qnfo-subscribers").cadence_min === 60 && WG("qnfo-subscribers").cadence_source === "cron" && WG("qnfo-subscribers").beat.overdue === true, "a worker without a grid keeps its trigger as its schedule: hourly with a 441-minute heartbeat is late", [WG("qnfo-subscribers").cadence_min, WG("qnfo-subscribers").cadence_source, WG("qnfo-subscribers").beat]);
ok(r.j.overdue.map((o) => o.name).join() === "qnfo-subscribers" || r.j.overdue.filter((o) => o.kind === "worker").map((o) => o.name).join() === "qnfo-subscribers", "only the worker without a grid is listed late", r.j.overdue);
ok(r.j.workers.find((w) => w.name === "qnfo-ops").cadence_source === null, "a worker with no cron has no cadence source");
// the heartbeat on the qnfo-gateway job goes late when it is older than the job plus 120 minutes
const envG2 = mkEnv({ crons: [["qnfo-gateway", "0 * * * *"]], beats: [["qnfo-gateway", 1700, 1]], fires: [["qnfo-gateway", "0 * * * *", "idle", 30], ["qnfo-gateway", "5 6 * * *", "ok", 500]] });
r = await get(envG2, "/api/architecture");
ok(r.j.workers.find((w) => w.name === "qnfo-gateway").beat.overdue === true, "a grid worker's daily job is still caught when its heartbeat is older than 1440 + 120 minutes", r.j.workers.find((w) => w.name === "qnfo-gateway").beat);
// an unreadable fire log falls back to the trigger and says nothing false about itself
const envG3 = mkEnv({ crons: [["personal-api", "5 * * * *"]], beats: [["personal-api", 441, 1]] });
const auditG3 = envG3.AUDIT;
envG3.AUDIT = { prepare(sql) { return /cron_fire_log/.test(sql) ? { bind() { return this; }, async all() { throw new Error("no such table: cron_fire_log"); } } : auditG3.prepare(sql); } };
r = await get(envG3, "/api/architecture");
ok(r.s === 200 && r.j.workers.find((w) => w.name === "personal-api").cadence_min === 60 && r.j.workers.find((w) => w.name === "personal-api").cadence_source === "cron", "an unreadable fire log falls back to the trigger, and the page still answers", r.j.workers.find((w) => w.name === "personal-api").cadence_source);
ok(JSON.stringify(r.j.self).indexOf("cron fire log") >= 0, "the unreadable source is named in what the model could not read", r.j.self);
ok(/ARCH-OVERDUE-GRID-1/.test(src) && /cron-grid-unknown/.test(src) && /FROM cron_fire_log/.test(src), "the worker reads cron_fire_log and names the unknown grid cadence");
ok(/cron grid \(CRON-GRID-1/.test(JSON.stringify(r.j.self.limits)), "self.limits says how grid workers are judged");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
