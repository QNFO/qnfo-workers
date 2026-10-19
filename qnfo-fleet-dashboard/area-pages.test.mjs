// AREA-PAGES-1 (1.45.0) offline suite: the dashboard is organised by functional area, and the page, the feed and the model agree.
// Proves: (A) AREA_REGISTRY is the one table: the feed table, the metric model and the page tabs are derived from it, every tab's feed is
// an indexed read of the same area, page tokens and owner-queue cards map to exactly one area; (B) /area/<id> answers for all six areas
// (platform included), an unknown id is a 404 naming the six; (C) each area page carries what belongs to it (Keep investing? under Cost,
// System health under Reliability, the queue cards that are about the area) and the overview no longer carries the cards that moved;
// (D) the navigation is the areas, and a tab page lights its area and shows the area's sub-bar; (E) an area page refreshes like the
// overview: ?frag=1&rev= answers 204 while nothing moved, and the revision moves when the area does; (F) the area styles are shipped
// (AREAS2_CSS was defined and never sent); (G) the API index names each area's page; (H) an unreadable source is named on the area page.
// Run: node qnfo-fleet-dashboard/area-pages.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });
const src = readFileSync(join(here, "worker.js"), "utf8");

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
const IDS = ["cost", "research", "reach", "autonomy", "reliability", "platform"];

// ---- A. the registry (evaluated from its marked block, with nothing else in scope)
const ra = src.indexOf("/* AREA-REGISTRY:BEGIN"), rb = src.indexOf("/* AREA-REGISTRY:END */");
ok(ra > 0 && rb > ra, "A0 registry block markers present");
const cx = vm.createContext({ console, RegExp, String, Object, Array });
vm.runInContext(src.slice(ra, rb) + "\nglobalThis.R = { AREA_REGISTRY, registryArea, areaOfPage, queueAreaOf };", cx);
const R = cx.R;
ok(R.AREA_REGISTRY.map((a) => a.id).join() === IDS.join(), "A1 six areas in a fixed order: " + R.AREA_REGISTRY.map((a) => a.id));
ok(R.AREA_REGISTRY.every((a) => a.name && a.short && a.what && a.sources.length && Array.isArray(a.flows) && Array.isArray(a.widgets) && Array.isArray(a.controls) && Array.isArray(a.pages) && a.queue && Array.isArray(a.queue.sources)), "A2 every area declares name, short, what, sources, flows, widgets, controls, pages and queue");
ok(R.AREA_REGISTRY.filter((a) => a.rx).map((a) => a.id).join() === IDS.slice(0, 5).join() && !R.registryArea("platform").rx && !R.registryArea("platform").star, "A3 five areas carry metrics; platform carries none");
const widgetSet = new Set(["invest", "progress", "system", "controls"]);
ok(R.AREA_REGISTRY.every((a) => a.widgets.every((w) => widgetSet.has(w))), "A4 every widget is one the page can render");
const flowIds = R.AREA_REGISTRY.flatMap((a) => a.flows);
ok(new Set(flowIds).size === flowIds.length && ["issues", "code", "research", "outreach"].every((f) => flowIds.includes(f)), "A5 each pipeline belongs to exactly one area: " + flowIds);
const ctlKeys = R.AREA_REGISTRY.flatMap((a) => a.controls);
ok(new Set(ctlKeys).size === ctlKeys.length && ctlKeys.includes("social_paused") && ctlKeys.includes("owner_queue_delegated"), "A6 each pipeline switch belongs to exactly one area: " + ctlKeys);
ok(R.AREA_REGISTRY.filter((a) => a.controls.length).every((a) => a.widgets.includes("controls")), "A7 an area that owns a switch renders the controls card");
ok(R.areaOfPage("kpi") === "platform" && R.areaOfPage("changelog") === "platform" && R.areaOfPage("cmd") === "platform" && R.areaOfPage("content") === "research" && R.areaOfPage("cost") === "cost", "A8 a tab belongs to the area that lists it; an area id is its own area");
ok(R.areaOfPage("queue") === null && R.areaOfPage("flow") === null && R.areaOfPage("nope") === null && R.areaOfPage(undefined) === null, "A9 the overview's anchors and unknown tokens belong to no area");
const qa = (source, title, key) => R.queueAreaOf({ source, title, key });
ok(qa("billing", "AI credit runs out") === "cost" && qa("decision", "x") === "cost" && qa("shutdown", "Decision due") === "cost", "A10 billing, decision and shutdown cards are Cost");
ok(qa("inbox", "Reply to someone") === "reach" && qa("code-loop", "Code task parked: x") === "autonomy" && qa("issue-loop", "x") === "autonomy" && qa("objectives", "Yes or no") === "autonomy" && qa("register", "x") === "autonomy" && qa("gtd", "x") === "autonomy", "A11 inbox is Reach; loop, objective and register cards are Autonomy");
ok(qa("queue", "Payment decision: authorise a stronger model", "ha:pay") === "cost" && qa("queue", "Publish the paper to Zenodo", "ha:z") === "research" && qa("queue", "Rotate the access token", "ha:t") === "reliability" && qa("queue", "Reply to the Bluesky thread", "ha:b") === "reach", "A12 a queue card with no source of its own is placed by its words");
ok(qa("queue", "Something unrecognised", "ha:u") === "autonomy" && R.queueAreaOf(null) === "autonomy" && R.queueAreaOf({}) === "autonomy", "A13 an unrecognised card falls to Autonomy, never disappears");

// ---- the shared fixtures
function withQueue(env, db) {
  db.prepare("INSERT INTO human_actions (slug,title,why,action,due,source) VALUES ('rt-tok','Rotate the access token','a credential only you can mint','mint it','','queue')").run();
  return env;
}

// ---- B. one page per area
{
  const { env, db } = mk(); withQueue(env, db);
  const idx = await (await call(env, "/api")).json();
  ok(idx.areas.map((a) => a.id).join() === IDS.join() && idx.areas.every((a, i) => a.name === R.AREA_REGISTRY[i].name && a.what === R.AREA_REGISTRY[i].what && a.sources.join() === R.AREA_REGISTRY[i].sources.join()), "B1 GET /api areas are the registry's, same ids, names, descriptions and sources");
  const am = await (await call(env, "/api/areas")).json();
  ok(am.areas.map((a) => a.id).join() === IDS.slice(0, 5).join(), "B2 the metric model has the five areas that carry metrics: " + am.areas.map((a) => a.id));
  for (const a of R.AREA_REGISTRY) for (const p of a.pages) {
    const row = idx.endpoints.find((e) => e.path === p.feed);
    ok(!!row && (row.area || "platform") === a.id, "B3 " + a.id + " lists the page " + p.href + " and its feed " + p.feed + " is an indexed read of the same area");
  }
  for (const id of IDS) {
    const r = await call(env, "/area/" + id);
    const h = await r.text();
    ok(r.status === 200 && /text\/html/.test(r.headers.get("Content-Type")) && /<\/html>\s*$/.test(h), "B4 /area/" + id + " answers a complete HTML page (" + r.status + ")");
    ok(h.includes('<h1 class="fl-h" id="ap-h1">' + R.registryArea(id).name), "B5 /area/" + id + " is titled with the area");
    ok(h.includes('href="/api/area/' + id + '"') && h.includes('id="ap-reads"'), "B6 /area/" + id + " names its feed and lists the reads that belong to it");
    ok(!/undefined|NaN|\[object/.test(h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "")), "B7 /area/" + id + " leaks nothing");
    ok((await (await call(env, "/area/" + id + "/")).text()).includes('id="ap-h1">'), "B8 a trailing slash is the same page");
  }
  const head = await worker.fetch(new Request(O + "/area/cost", { method: "HEAD" }), env, ctx);
  ok(head.status === 200, "B8b HEAD /area/<id> answers like GET (" + head.status + ")");
  const bad = await call(env, "/area/nope");
  const bt = await bad.text();
  ok(bad.status === 404 && IDS.every((i) => bt.includes(i)), "B9 an unknown area is a 404 that names the six");
  const plat = await (await call(env, "/area/platform")).text();
  ok(plat.includes('id="ap-by-area"') && IDS.every((i) => plat.includes('href="/area/' + i + '"')), "B10 the platform page lists every area's page and feed");
  ok(/no metrics here/.test(plat) && !/all clear/.test(plat.split('id="ap-by-area"')[0]), "B11 platform says it carries no metrics instead of claiming all clear");
}

// ---- C. each area carries what belongs to it
{
  const { env, db } = mk(); withQueue(env, db);
  const get = async (p) => (await call(env, p)).text();
  const [cost, reach, rel, aut, res] = await Promise.all(["/area/cost", "/area/reach", "/area/reliability", "/area/autonomy", "/area/research"].map(get));
  ok(cost.includes('id="invest"') && cost.includes("Keep investing?"), "C1 Cost carries the Keep investing? card");
  ok(rel.includes('id="system"') && rel.includes("System health"), "C2 Reliability carries System health");
  ok(!reach.includes('id="invest"') && !rel.includes('id="invest"') && !aut.includes('id="invest"'), "C3 the investment card appears on Cost only");
  ok(cost.includes("Fleet AI run-rate") && cost.includes("Every breach in this area"), "C4 Cost lists its breach (the seeded run-rate trigger)");
  ok(/Waiting on you here <span class="ct">1<\/span>/.test(cost) && cost.includes("Top up the AI credit"), "C5 the billing card is under Cost");
  ok(/Waiting on you here <span class="ct">0<\/span>/.test(reach) && reach.includes("Nothing in this area needs you"), "C6 and not under Reach");
  ok(/Waiting on you here <span class="ct">1<\/span>/.test(rel) && rel.includes("Rotate the access token"), "C7 a credential card is under Reliability, placed by its words");
  ok(!/Waiting on you here <span class="ct">0<\/span>/.test(aut) || aut.includes("Nothing in this area needs you"), "C8 Autonomy page renders its queue section");
  ok(res.includes("Content pipeline") && res.includes('href="/content"'), "C9 Research lists the Content tab among its reads");
  const note = (h) => (h.match(/<div class="note">Could not read: ([^<]*)\./) || [])[1] || "";
  ok(note(res).includes("research queue") && note(res).includes("code tasks") && !note(res).includes("outreach queue"), "C14 an area names the unreadable sources it is built from (Research: its queue and code tasks): " + note(res));
  ok(/can't confirm/.test(res) && !/all clear/.test(res.split('id="ap-queue"')[0]) && !res.includes("is on target") && res.includes("not an all clear"), "C14b an area whose sources could not be read says can't confirm, never all clear or on target");
  ok(note(reach).includes("outreach queue") && !note(reach).includes("research queue") && !note(cost).includes("research queue") && !note(cost).includes("outreach queue"), "C15 and not the ones other areas use (Reach: outreach queue; Cost: neither): " + note(reach) + " | " + note(cost));
  const home = await get("/");
  ok(home.includes('id="invest"') && home.includes('id="system"'), "C10 the overview keeps the two headline answers");
  ok(!home.includes("Pipelines and bottlenecks") && !home.includes('id="flow"') && !home.includes('id="progress"') && !home.includes('id="controls"'), "C11 pipelines, progress and controls moved off the overview");
  ok((home.match(/<article class="card item[^"]*" data-area="(cost|research|reach|autonomy|reliability)"/g) || []).length === 2 && /class="it-area" href="\/area\/cost">Cost</.test(home) && /class="it-area" href="\/area\/reliability">Reliability</.test(home), "C12 every queue card on the overview names its area");
  const rowOf = (id) => (home.match(new RegExp('id="area-' + id + '"[\\s\\S]*?</section>')) || [""])[0];
  ok(/can't confirm: could not read/.test(rowOf("research")) && /code tasks/.test(rowOf("research")) && /research queue/.test(rowOf("research")) && /can't confirm: could not read outreach queue/.test(rowOf("reach")), "C12b an overview row whose sources could not be read says can't confirm, not all clear");
  ok(home.includes('id="areas"') && IDS.slice(0, 5).every((i) => home.includes('id="area-' + i + '"')), "C13 the overview still has one row per metric area");
}

// ---- D. the navigation is the areas
{
  const { env } = mk();
  const links = (h) => [...h.split('<nav class="q-nav"')[1].split("</nav>")[0].matchAll(/<a href="([^"]*)"( aria-current="page")?>([^<]*)</g)].map((m) => [m[3], m[1], !!m[2]]);
  const home = links(await (await call(env, "/")).text());
  ok(home.map((l) => l[0]).join() === "Overview,Cost,Research,Reach,Autonomy,Reliability,Platform,Command line", "D1 the navigation is Overview, the six areas, the command line: " + home.map((l) => l[0]));
  ok(home.find((l) => l[2]) && home.find((l) => l[2])[0] === "Overview" && home.filter((l) => l[2]).length === 1, "D2 the overview lights Overview only");
  const area = links(await (await call(env, "/area/reach")).text());
  ok(area.filter((l) => l[2]).map((l) => l[0]).join() === "Reach", "D3 an area page lights its area");
  for (const [path, lit, subbar] of [["/kpi", "Platform", ["Overview", "Metrics", "Architecture", "Changelog", "Command line"]], ["/content", "Research", ["Overview", "Content pipeline"]], ["/changelog", "Platform", ["Overview", "Metrics", "Architecture", "Changelog", "Command line"]], ["/cmd", "Command line", ["Overview", "Metrics", "Architecture", "Changelog", "Command line"]]]) {
    const r = await call(env, path);
    const h = await r.text();
    ok(r.status === 200, "D4 " + path + " still answers (" + r.status + ")");
    ok(links(h).filter((l) => l[2]).map((l) => l[0]).join() === lit, "D5 " + path + " lights " + lit);
    const sb = (h.split('<nav class="q-sub"')[1] || "").split("</nav>")[0];
    ok([...sb.matchAll(/<a [^>]*>([^<]*)</g)].map((m) => m[1]).join() === subbar.join(), "D6 " + path + " shows its area's sub-bar: " + subbar);
  }
  const kj = await (await call(env, "/api/kpi")).json();
  ok(Array.isArray(kj.days) && kj.days.length === 14 && kj.issues && kj.reach, "D6b /api/kpi serves the document as computed (it answered 500 on 1.44.5: the days array reached the page as an object)");
  ok(!(await (await call(env, "/area/cost")).text()).includes('<nav class="q-sub"'), "D7 an area with no tabs has no sub-bar");
  ok((await (await call(env, "/area/platform")).text()).includes('<nav class="q-sub"'), "D8 platform shows its sub-bar");
}

// ---- E. an area page refreshes like the overview
{
  const { env, db } = mk();
  const full = await call(env, "/area/cost");
  const html = await full.text();
  const dataRev = (html.match(/id="live" data-rev="([^"]*)"/) || [])[1];
  const f1 = await call(env, "/area/cost?frag=1");
  const t1 = f1.headers.get("X-Content-Revision");
  const b1 = await f1.text();
  ok(f1.status === 200 && b1.includes("<!--ap-foot-->") && !!t1 && b1.indexOf("<!--ap-foot-->") > 100, "E1 the fragment is the area plus a footer marker, with a revision");
  ok(dataRev && dataRev.replace(/&quot;/g, '"') === t1, "E2 the full page carries the revision the fragment reports");
  ok(/id="ap-foot"/.test(html) && html.includes("setInterval(tick,15000)") && html.includes("location.pathname+'?frag=1'"), "E3 the page polls its own fragment");
  const same = await call(env, "/area/cost?frag=1&rev=" + encodeURIComponent(t1));
  ok(same.status === 204 && (await same.text()) === "", "E4 while nothing moved the poll answers 204 with no body");
  const cond = await call(env, "/area/cost?frag=1", { "If-None-Match": t1 });
  ok(cond.status === 304, "E5 If-None-Match is honoured too");
  const t1b = (await call(env, "/area/cost?frag=1")).headers.get("X-Content-Revision");
  ok(t1b === t1, "E6 ages and the version live in the footer, so an unchanged area keeps its revision");
  db.prepare("UPDATE metric_registry SET last_value = '7' WHERE metric = 'fleet_ai_run_rate_30d_usd'").run();
  await new Promise((r) => setTimeout(r, 5));
  // the model is cached 60 s per isolate; the revision of the page must still follow a change in the queue, which is read live
  db.prepare("INSERT INTO human_actions (slug,title,why,action,due,source) VALUES ('rt-two','Another billing decision','w','a','','billing')").run();
  const moved = await call(env, "/area/cost?frag=1&rev=" + encodeURIComponent(t1));
  ok(moved.status === 200 && moved.headers.get("X-Content-Revision") !== t1, "E7 a new card in the area moves the revision and the poll gets the new fragment");
}

// ---- F. styles that were defined and never sent
{
  const { env } = mk();
  const h = await (await call(env, "/")).text();
  ok(h.includes(".fx-r{") && h.includes(".ctl-l{") && h.includes(".fl-sum{"), "F1 the per-area row, switch-list and summary styles are in the page head (AREAS2_CSS)");
  const plat = await (await call(env, "/area/platform")).text();
  ok((plat.match(/<div class="ap-scroll"><table class="ap-reads"/g) || []).length === 2 && h.includes(".ap-scroll{overflow-x:auto"), "F3 the area tables scroll inside their card, so a phone does not get a sideways page");
  ok(h.includes(".q-sub{") && h.includes(".ap-star{") && h.includes(".it-area{"), "F2 the sub-bar, area-page and area-chip styles are in the page head");
}

// ---- G. the API index names each area's page
{
  const { env } = mk();
  const j = await (await call(env, "/api")).json();
  ok(IDS.every((id) => j.by_area.find((a) => a.id === id && a.page === "/area/" + id && Array.isArray(a.pages))), "G1 every by_area row names its page and tabs");
  const plat = j.by_area.find((a) => a.id === "platform");
  ok(plat.pages.map((p) => p.href).join() === "/kpi,/architecture,/changelog,/cmd" && plat.pages.every((p) => j.endpoints.some((e) => e.path === p.feed)), "G2 platform's tabs are /kpi, /architecture, /changelog, /cmd and each has its feed in the index");
  const f = await (await call(env, "/api/area/research")).json();
  ok(f.area.page === "/area/research", "G3 the area feed names its page");
  const health = await (await call(env, "/health")).json();
  ok(health.capabilities.includes("area-pages"), "G4 /health advertises area-pages");
}

// ---- H. an unreadable source is named on the page, never shown as clear
{
  const { env, db } = mk();
  db.exec("DROP TABLE metric_history");
  // the area model is cached 60 s per isolate and earlier sections filled it: step past the cache the way a later request would
  const realNow = Date.now; Date.now = () => realNow() + 120000;
  const h = await (await call(env, "/area/cost")).text();
  Date.now = realNow;
  ok(h.includes("Could not read:") && h.includes("metric history"), "H1 the page names the source it could not read");
}

// ---- I. the code map: one file, mapped by area
{
  const banners = [...src.matchAll(/^\/\/ ==== AREA-MAP ([a-z]+): (.+?) ====$/gm)].map((m) => ({ area: m[1], label: m[2] }));
  ok(banners.length >= 30, "I1 the file is mapped by area (" + banners.length + " regions)");
  ok(banners.every((b) => IDS.includes(b.area)), "I2 every banner names an area of AREA_REGISTRY: " + [...new Set(banners.map((b) => b.area))]);
  ok(IDS.every((id) => banners.some((b) => b.area === id)), "I3 every area has at least one region: " + IDS.map((id) => id + "=" + banners.filter((b) => b.area === id).length));
  ok(new Set(banners.map((b) => b.label)).size === banners.length, "I4 a region is named once");
  ok(/CODE MAP BY FUNCTIONAL AREA/.test(src) && src.includes('grep -n "AREA-MAP reach"'), "I5 the top of the file says how to read the map");
  const readme = readFileSync(join(here, "README.md"), "utf8");
  const mapSec = readme.split("## Code map by functional area")[1] || "";
  ok(IDS.every((id) => new RegExp("\\| `" + id + "` \\|").test(mapSec.split("\n## ")[0])), "I6 README's code map has a row for every area");
  const pagesSec = readme.split("## Pages by functional area")[1] || "";
  ok(/AREA_REGISTRY/.test(pagesSec) && IDS.every((id) => readme.includes("`/area/" + id + "`")), "I7 README describes the registry and names every area page");
  // the one-file contract: nothing imports a sibling module, or the canonical path (a single uploaded module) would break
  ok(!/^import\s/m.test(src), "I8 worker.js imports nothing: the canonical deploy uploads one module");
}

// ---- J. the Code loop flow splits "closed" by what happened to the pull request (CODE-FLOW-PR-SPLIT-1)
{
  const { env, db } = mk();
  db.exec(`DROP TABLE code_tasks;
    CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, goal TEXT, status TEXT, merge_state TEXT, last_error TEXT, pr_url TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE code_task_pr_links (task_id TEXT PRIMARY KEY, pr_number INTEGER, pr_state TEXT, merged_at TEXT, head_sha TEXT, task_status TEXT, drift TEXT, synced_at TEXT);`);
  const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();
  let n = 0;
  const task = (status, pr, o) => {
    const id = "ct" + (++n), x = o || {};
    db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, merge_state, last_error, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, "qnfo-workers", "a/worker.js", "g", status, x.merge || null, x.err || null, iso(x.age || 2), iso(1));
    if (pr) db.prepare("INSERT INTO code_task_pr_links (task_id, pr_number, pr_state) VALUES (?,?,?)").run(id, 1000 + n, pr);
  };
  for (let i = 0; i < 3; i++) task("merged", "merged");
  task("merged", "merged", { err: "superseded by a later change" });       // a merged task is never superseded
  for (let i = 0; i < 2; i++) task("queued", "never-opened");
  task("ready_to_publish", "never-opened");
  for (let i = 0; i < 4; i++) task("closed", "never-opened");
  task("closed", null);                                                    // no link row yet: read as never opened
  for (let i = 0; i < 2; i++) task("closed", "closed");
  for (let i = 0; i < 3; i++) task("closed", "never-opened", { merge: "superseded" });
  task("closed", "closed", { err: "superseded by #12: already on main" });
  task("superseded", "never-opened");
  for (let i = 0; i < 4; i++) task("failed", "never-opened");
  task("closed", "open");                                                  // a closed task whose PR is open: drift, shown as such
  task("closed", "never-opened", { age: 40 });                             // outside the 30 days
  const realNow = Date.now; Date.now = () => realNow() + 600000;
  const feed = await (await call(env, "/api/area/autonomy")).json();
  Date.now = realNow;
  const flow = (feed.flows || []).find((f) => f.id === "code");
  const st = (k) => (flow && flow.stages.find((x) => x.k === k) || {}).n;
  ok(!!flow && flow.stages.map((x) => x.k).join() === "queued,merged,closed-no-pr,closed-pr,closed-other,superseded,failed", "J1 the Code loop flow has the split stages: " + (flow && flow.stages.map((x) => x.k)));
  ok(st("queued") === 3 && st("merged") === 4, "J2 queued counts queued and ready_to_publish; a merged task stays merged however its last_error reads");
  ok(st("closed-no-pr") === 5, "J3 closed, never opened a PR matches code_task_pr_links (4 never-opened rows and 1 task with no row): " + st("closed-no-pr"));
  ok(st("closed-pr") === 2, "J4 PR closed unmerged matches the links (2): " + st("closed-pr"));
  ok(st("superseded") === 5, "J5 superseded counts merge_state, a last_error starting with superseded and the status (3 + 1 + 1): " + st("superseded"));
  ok(st("closed-other") === 1 && st("failed") === 4, "J6 a closed task whose PR is open is its own stage; failed is unchanged");
  const sup = flow && flow.stages.find((x) => x.k === "superseded");
  ok(sup && sup.kind === "drop" && /not a failure/.test(sup.label), "J7 superseded is labelled not a failure and sits outside finished work");
  ok(flow && flow.bottleneck && flow.bottleneck.k === "closed-no-pr" && /75%/.test(flow.bottleneck.why), "J8 the failure share leaves superseded out: 12 of 16 finished (4 merged), 75%, largest stage closed-no-pr: " + JSON.stringify(flow && flow.bottleneck));
  ok(!flow.stages.some((x) => x.k === "closed") && ((feed.breaches || {}).total >= 0), "J9 the old closed, unmerged stage is gone");
}

// ---- K. a receipt for a closed owner request is not a card that waits on the owner (OWNER-REQUEST-RECEIPT-1)
{
  const { env, db } = mk();
  const card = (slug, title, why, source) => db.prepare("INSERT INTO human_actions (slug,title,why,action,source) VALUES (?,?,?,?,?)").run(slug, title, why, "Open fleet.qnfo.org and decide or dismiss this card.", source);
  card("issue-2783", "INTENT-TASK-int-1: HANDOFF the fleet closed", "PRIVATE-NOTE-TEXT from the owner's chat", "owner-request-issue");
  card("issue-100023", "OWNER-TASK-op-1: restore a binding", "another private note", "owner-request-issue");
  const hv = await (await call(env, "/api/human")).json();
  const titles = (hv.items || []).map((i) => i.title);
  ok(hv.receipts.length === 2 && !titles.some((t) => /HANDOFF|restore a binding/.test(t)), "K1 /api/human lists the two receipts apart from items");
  ok(hv.count === (hv.items || []).length && hv.count === 1 && titles.includes("Top up the AI credit"), "K2 the count and the banner leave receipts out (one real card remains): " + hv.count);
  const home = await (await call(env, "/")).text();
  ok(/<details class="card up" id="receipts"><summary>Closed for you <span class="ct">2<\/span>/.test(home) && home.includes("issue #2783") && home.includes("issue #100023"), "K3 the overview lists them under Closed for you, with the issue number");
  ok(!home.includes("PRIVATE-NOTE-TEXT") && !home.includes("another private note"), "K4 the receipt shows no issue text, which can quote private notes");
  ok(/<h1 id="fl-h1">1 thing needs you<\/h1>/.test(home), "K5 the headline counts what waits on the owner only");
  ok(!home.includes('data-key="ha:issue-2783"'), "K6 a visitor with no owner session gets no Done control on a receipt");
  const aut = await (await call(env, "/area/autonomy")).text();
  ok(!aut.includes("HANDOFF the fleet closed"), "K7 receipts are not in an area's waiting list");
  // a database whose human_actions has no source column still lists its cards
  db.exec("ALTER TABLE human_actions DROP COLUMN source");
  const old = await (await call(env, "/api/human")).json();
  ok(old.count === 3 && old.receipts.length === 0, "K8 without the source column every card is a card (count " + old.count + ")");
}

// ---- L. the service-level counters that grow every minute do not move the revision of /api/kpi (RT-API-1)
{
  const { env, db } = mk();
  db.exec(`ALTER TABLE metric_registry ADD COLUMN owner TEXT; ALTER TABLE metric_registry ADD COLUMN warning_band TEXT; ALTER TABLE metric_history ADD COLUMN ts TEXT;
    CREATE TABLE v_sla_over_120m (issues_open_over_120m INTEGER, oldest_open_issue_min INTEGER, total_over_120m INTEGER);
    INSERT INTO v_sla_over_120m VALUES (3, 500, 3);`);
  for (let k = 1; k <= 3; k++) db.prepare("INSERT INTO metric_history (metric, day, value) VALUES ('fleet_ai_run_rate_30d_usd', date('now', ?), ?)").run("-" + k + " day", 200 + k);
  const realNow = Date.now;
  Date.now = () => realNow() + 700000;
  const a = await call(env, "/api/kpi");
  const ja = await a.json();
  Date.now = () => realNow() + 700000 + 5 * 60000;   // five minutes later, past the 60 s cache
  const b = await call(env, "/api/kpi");
  const jb = await b.json();
  Date.now = realNow;
  const row = (j) => (j.service_levels.metrics || []).find((m) => m.metric === "fleet_ai_run_rate_30d_usd");
  ok(row(ja) && row(ja).state === "BREACH" && row(jb).time_in_breach_min - row(ja).time_in_breach_min >= 4, "L1 time in breach grows with the clock: " + (row(ja) && row(ja).time_in_breach_min) + " then " + (row(jb) && row(jb).time_in_breach_min));
  const sla = (j) => (j.sla.classes || []).find((c) => c.class === "issues_open_over_120m");
  ok(sla(ja) && sla(ja).oldest_min === 500 && sla(ja).n === 3, "L2 the SLA class reports its count and the age of its oldest item");
  ok(a.headers.get("ETag") && a.headers.get("ETag") === b.headers.get("ETag"), "L3 the two counters are clock fields: five minutes later the ETag is unchanged (" + a.headers.get("ETag") + " vs " + b.headers.get("ETag") + ")");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
