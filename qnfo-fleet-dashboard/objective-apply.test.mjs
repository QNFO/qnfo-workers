// OBJECTIVE-REVISION-APPLY-1 + OWNER-NOTES-ROUTE-1 offline suite: drives the real worker's owner routes against an
// in-memory SQLite D1 (synthetic weights and revisions shaped like the live goals rows) and replays the cron sweep from
// the worker source. Proves: a balanced weight change applies at once when the owner's emailed-code session ratifies it
// (sai_config, objective-function formula and version, goal adopted, logged) and is held as proposed for the legacy
// owner-key cookie (OBJECTIVE-WEIGHT-OWNER-ONLY-1, #1823); an unbalanced, stale or unknown-term change is refused before
// anything is written; a non-weight revision is filed as fleet work; a weight revision ratified elsewhere with no recorded
// credential goes back to proposed and is never applied by the sweep; reject clears a ratified-but-inapplicable one; a
// card note and a queued task each become exactly one fleet issue.
// Run: node qnfo-fleet-dashboard/objective-apply.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE sai_config (k TEXT PRIMARY KEY, v REAL, source TEXT, updated_at TEXT);
CREATE TABLE objectives (id INTEGER PRIMARY KEY AUTOINCREMENT, objective_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, source TEXT,
  ratified_by TEXT, ratified_on TEXT, version INTEGER DEFAULT 1, status TEXT DEFAULT 'ACTIVE');
CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, goal_type TEXT NOT NULL DEFAULT 'instrumental',
  parent_objective TEXT, alignment TEXT, source TEXT, score REAL, priority INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'proposed', dod TEXT, owner TEXT,
  adopted_at TEXT, completed_at TEXT, retired_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), program_code TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization',
  priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE human_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, until TEXT, ts TEXT DEFAULT (datetime('now')));
CREATE TABLE owner_sessions (token_hash TEXT PRIMARY KEY, created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL, verified_ms INTEGER NOT NULL, revoked INTEGER DEFAULT 0, visitor TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT,
  sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT, updated_at TEXT, resolved_at TEXT, resolution TEXT);
CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, source TEXT, device TEXT, type TEXT, domain TEXT, priority TEXT, summary TEXT, due TEXT, status TEXT,
  wbs_code TEXT, created_at TEXT, processed_at TEXT, triage_decision TEXT, triage_rationale TEXT, triaged_at TEXT);`);
const W = { w_autonomy: 0.2, w_thinking: 0.15, w_decision: 0.15, w_self_improv: 0.15, w_reliability: 0.1, w_integration: 0.1, w_external_impact: 0.1, w_governance: 0.05 };
for (const k of Object.keys(W)) db.prepare("INSERT INTO sai_config (k, v, source) VALUES (?, ?, 'seed')").run(k, W[k]);
db.prepare("INSERT INTO sai_config (k, v, source) VALUES ('uf_step', 0.15, 'seed')").run();
const OBJ = "Maximize SAI = 0.20*autonomy + 0.15*thinking + 0.15*decision + 0.15*self_improv + 0.10*reliability + 0.10*integration + 0.10*external_impact + 0.05*governance, subject to the autonomy-ladder cap. RATIFIED 2026-09-26.";
db.prepare("INSERT INTO objectives (objective_key, statement, version, status) VALUES ('objective-function', ?, 2, 'ACTIVE')").run(OBJ);
const goal = (id, st) => db.prepare("INSERT INTO goals (id, goal_key, statement, goal_type, alignment, status) VALUES (?, ?, ?, 'objective-revision', 'rationale: synthetic', 'proposed')").run(id, "rev-" + id, st);
goal(58, "Decrease the weight of autonomy from 0.20 to 0.15 and increase the weight of self_improv from 0.15 to 0.20");
goal(56, "Increase the weight of external_impact from 0.10 to 0.15");
goal(42, "Increase the weight of self_improv from 0.15 to 0.20");
goal(57, "Add a constraint to limit the UNMANAGED direct-provider spend to 50% of the total fleet cost");
goal(60, "Increase the weight of charisma from 0.10 to 0.20 and decrease the weight of governance from 0.05 to 0.00");
goal(61, "Decrease the weight of governance from 0.05 to 0.03 and increase the weight of reliability from 0.10 to 0.12");
db.prepare("INSERT INTO human_actions (slug, title) VALUES ('ga4', 'Grant GA4 access')").run();

function stmtOn(dbx, sql) {
  let args = [];
  const self = {
    bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return self; },
    async all() { return { results: dbx.prepare(sql).all(...args) }; },
    async first() { return dbx.prepare(sql).get(...args) || null; },
    async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const AUDIT = { prepare: (sql) => stmtOn(db, sql), async batch(list) { db.exec("BEGIN"); try { const out = []; for (const s of list) out.push(await s.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
const OWNER_TOKEN = "o".repeat(32);
const env = { AUDIT, OWNER_TOKEN };
const cookie = "fleet_owner=" + createHash("sha256").update(OWNER_TOKEN).digest("hex");
const ORIGIN = "https://fleet.qnfo.org";
const ctx = { waitUntil() {}, passThroughOnException() {} };
const post = (path, body) => worker.fetch(new Request(ORIGIN + path, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "x-fleet-ui": "1", Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify(body) }), env, ctx);
const w = (k) => db.prepare("SELECT v FROM sai_config WHERE k = ?").get(k).v;
const g = (id) => db.prepare("SELECT status FROM goals WHERE id = ?").get(id).status;
const obj = () => db.prepare("SELECT statement, version, source, ratified_by FROM objectives WHERE objective_key = 'objective-function'").get();
const log = (id) => db.prepare("SELECT outcome, detail, issue_id, via FROM objective_revision_applies WHERE goal_id = ?").get(id);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// 1. Unbalanced: refused before anything is written
let r = await post("/api/owner/objective", { id: 56, decision: "ratify" });
let j = await r.json();
ok(r.status === 409 && /sum to 1\.05/.test(j.error) && g(56) === "proposed" && w("w_external_impact") === 0.1, "an unbalanced weight change is refused and nothing changes");
// 2. Unknown term
r = await post("/api/owner/objective", { id: 60, decision: "ratify" });
j = await r.json();
ok(r.status === 409 && /'charisma' is not a term/.test(j.error) && g(60) === "proposed", "an unknown term is refused");
// 3. Balanced: OBJECTIVE-WEIGHT-OWNER-ONLY-1 (#1823) holds it for the legacy OWNER_TOKEN cookie, then the owner's
// emailed-code session applies it at once
r = await post("/api/owner/objective", { id: 58, decision: "ratify" });
j = await r.json();
const logged = (id) => { try { return !!log(id); } catch (e) { return false; } };
ok(r.status === 403 && j.held === true && j.status === "proposed" && /emailed code/.test(j.error) && g(58) === "proposed" && w("w_autonomy") === 0.2 && !logged(58),"a weight change ratified with the legacy owner-key cookie is held as proposed and nothing is written");
ok(db.prepare("SELECT credential FROM human_responses WHERE key = 'goals:objective-revision:58' AND kind = 'ratify-held'").get().credential === "owner-key", "the held attempt is recorded with its credential");
const sessionToken = "cd".repeat(32);
db.prepare("INSERT INTO owner_sessions (token_hash, created_ms, expires_ms, verified_ms) VALUES (?, ?, ?, ?)").run(createHash("sha256").update(sessionToken).digest("hex"), Date.now(), Date.now() + 36e5, Date.now());
const postSession = (path, body) => worker.fetch(new Request(ORIGIN + path, { method: "POST", headers: { Cookie: "fleet_cmd=" + sessionToken, "Content-Type": "application/json", "x-fleet-ui": "1", Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify(body) }), env, ctx);
r = await postSession("/api/owner/objective", { id: 58, decision: "ratify" });
j = await r.json();
ok(r.status === 200 && j.ok && j.outcome === "applied", "a balanced weight change is applied when the owner's session ratifies it");
ok(w("w_autonomy") === 0.15 && w("w_self_improv") === 0.2 && w("w_thinking") === 0.15, "sai_config holds the new weights, others untouched");
const o = obj();
ok(o.version === 3 && o.statement.includes("SAI = 0.15*autonomy + 0.15*thinking + 0.15*decision + 0.20*self_improv + 0.10*reliability") && o.statement.endsWith("subject to the autonomy-ladder cap. RATIFIED 2026-09-26."), "the objective-function formula is rewritten in place and the version bumped");
// OBJECTIVE-AUTHORITY-TRUTH-1 (1.17.8): the stamp names the credential that acted (owner-surface.test.mjs covers the loop
// token and no record).
ok(/goals\.id=58/.test(o.source) && o.ratified_by === "owner (fleet.qnfo.org, emailed code)", "the objective row names the ratified goal and the credential that ratified it");
ok(g(58) === "adopted" && log(58).outcome === "applied" && log(58).via === "route:owner-session", "the goal is adopted and the apply logged with its credential");
ok(db.prepare("SELECT COUNT(*) n FROM human_responses WHERE key = 'goals:objective-revision:58' AND kind = 'ratify'").get().n === 1, "the decision is recorded in human_responses");
const sum = Object.keys(W).reduce((n, k) => n + w(k), 0);
ok(Math.abs(sum - 1) < 1e-9, "weights still sum to 1.00");
// 4. Stale after the change: self_improv is 0.20 now
r = await post("/api/owner/objective", { id: 42, decision: "ratify" });
j = await r.json();
ok(r.status === 409 && /self_improv is 0\.20 now, not 0\.15/.test(j.error) && g(42) === "proposed", "a stale change is refused");
// 5. Non-weight revision: filed as work
r = await post("/api/owner/objective", { id: 57, decision: "ratify" });
j = await r.json();
const iss = db.prepare("SELECT id, title, source, status, category FROM agent_issues WHERE title LIKE 'OBJECTIVE-REVISION-57:%'").get();
ok(r.status === 200 && j.ok && j.outcome === "filed-as-work" && iss && iss.status === "open" && j.issue_id === iss.id, "a constraint is filed as one fleet issue");
ok(g(57) === "ratified" && log(57).outcome === "filed-as-work" && log(57).issue_id === iss.id, "the goal stays ratified with the issue logged");
r = await post("/api/owner/objective", { id: 57, decision: "ratify" });
ok(r.status === 404, "a decided revision cannot be ratified again");
// 6. Reject a proposed one
r = await post("/api/owner/objective", { id: 56, decision: "reject" });
ok(r.status === 200 && g(56) === "rejected", "reject works on a proposed revision");

// 7. The cron sweep applies a revision ratified elsewhere, once; an inapplicable one is logged, shown, and can be rejected.
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("var OBJREV_WEIGHT_RE"), b = src.indexOf("// NO-CLAUDE-RUNTIME-DEPENDENCY-1: the owner's data and workflow live on Cloudflare.");
ok(a > 0 && b > a, "the OBJECTIVE-REVISION-APPLY-1 block is found in worker.js");
const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, RegExp });
const eo = src.indexOf("async function ensureOwnerTables(env) {");
const ensureOwner = src.slice(eo, src.indexOf("\n}\n", eo) + 3);
vm.runInContext("async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }\n" + ensureOwner + "\n" + src.slice(a, b) + "\n;this.__api = { objectiveRevisionSweep, objRevPlan, ownerNotesRoute };", cx);
const api = cx.__api;
db.prepare("UPDATE goals SET status = 'ratified' WHERE id = 61").run();
db.prepare("UPDATE goals SET status = 'ratified' WHERE id = 42").run();
let sw = await api.objectiveRevisionSweep({ AUDIT });
const s61 = sw.find((x) => x.id === 61);
ok(sw.length === 2 && s61 && s61.outcome === "held" && w("w_governance") === 0.05 && w("w_reliability") === 0.1 && g(61) === "proposed" && !log(61) && obj().version === 3 && obj().ratified_by === "owner (fleet.qnfo.org, emailed code)", "the sweep never applies a weight change ratified elsewhere without the owner's session: it goes back to proposed, unlogged (OBJECTIVE-WEIGHT-OWNER-ONLY-1)");
ok(log(42).outcome === "not-applicable" && g(42) === "ratified", "the sweep logs a stale ratified revision as not applicable");
sw = await api.objectiveRevisionSweep({ AUDIT });
ok(sw.length === 0 && obj().version === 3, "the sweep never applies or retries twice");
r = await post("/api/owner/objective", { id: 42, decision: "reject" });
ok(r.status === 200 && g(42) === "rejected", "reject clears a ratified revision that could not be applied");
// 8. Plan text the card shows
const plan = api.objRevPlan("Increase the weight of thinking from 0.15 to 0.20 and decrease the weight of decision from 0.15 to 0.10", { w_thinking: 0.15, w_decision: 0.15, w_x: 0.7 }, { statement: "SAI = 0.15*thinking + 0.15*decision + 0.70*x", version: 7 });
ok(plan.applicable && /thinking 0\.15 -> 0\.20, decision 0\.15 -> 0\.10/.test(plan.text) && /v7 -> v8/.test(plan.text) && plan.statement === "SAI = 0.20*thinking + 0.10*decision + 0.70*x", "the plan names each change and the version");
ok(!api.objRevPlan("Increase the weight of thinking from 0.15 to 0.10 and increase the weight of decision from 0.15 to 0.20", { w_thinking: 0.15, w_decision: 0.15, w_x: 0.7 }, { statement: "SAI = 0.15*thinking + 0.15*decision + 0.70*x", version: 7 }).applicable, "a verb that contradicts the numbers is refused");
ok(api.objRevPlan("Re-evaluate the terminal objectives", {}, null).kind === "work", "free text is fleet work");

// 9. OWNER-NOTES-ROUTE-1: a card note and a queued task each become exactly one fleet issue
const ownerIssues = () => db.prepare("SELECT id, title, description, source, category, priority, status FROM agent_issues WHERE source = 'qnfo-fleet-dashboard:owner-request' ORDER BY id").all();
r = await post("/api/owner/respond", { key: "ha:ga4", kind: "note", note: "Granted Viewer to the service account today." });
ok(r.status === 200, "a note is accepted");
let oi = ownerIssues();
ok(oi.length === 1 && /^OWNER-NOTE-\d+: Grant GA4 access$/.test(oi[0].title) && oi[0].description.includes("Granted Viewer") && oi[0].category === "owner-request" && oi[0].priority === "high" && oi[0].status === "open", "the note is filed as one open fleet issue naming the card");
ok(db.prepare("SELECT issue_id FROM human_responses WHERE kind = 'note'").get().issue_id === oi[0].id, "the note keeps its issue id");
await api.ownerNotesRoute({ AUDIT });
ok(ownerIssues().length === 1, "a note is filed once");
db.prepare("INSERT INTO human_responses (key, kind, note) VALUES ('code:7', 'note', 'Drop this one.')").run();
const rr = await api.ownerNotesRoute({ AUDIT });
ok(rr.notes === 1 && ownerIssues().some((x) => x.title.endsWith(": code:7") && x.description.includes("Drop this one.")), "the cron files a note the request path missed");
r = await post("/api/owner/respond", { key: "ha:ga4", kind: "snooze", days: 3 });
ok(r.status === 200 && ownerIssues().length === 2, "a snooze is not a note and files nothing");
r = await post("/api/owner/prompt", { text: "Draft the October funder shortlist from the Identity doc deadlines.", mode: "task" });
j = await r.json();
oi = ownerIssues();
const taskIssue = oi.find((x) => /^OWNER-TASK-op-/.test(x.title));
ok(r.status === 200 && j.ok && taskIssue && j.issue_id === taskIssue.id && taskIssue.description.includes("October funder shortlist"), "a queued task is filed as a fleet issue and the route returns its id");
ok(db.prepare("SELECT COUNT(*) n FROM intents WHERE device = 'owner-dashboard'").get().n === 1, "the task is still recorded as an intent (daily digest)");
await api.ownerNotesRoute({ AUDIT });
ok(ownerIssues().length === 3, "a task is filed once");

// 10. TASK-INTENT-INTAKE-1: a type='task' intent nobody triages becomes one fleet issue; a dashboard task is never filed twice
db.prepare("INSERT INTO intents (id, desire, source, device, type, status, created_at, summary) VALUES ('int-feed-1', 'Mirror qnfo-skills-mcp into the repo.\ncode-task: repo=QNFO/qnfo-workers path=docs/x.md', 'deepchat-skills-mcp', 'unknown', 'task', 'pending', '2026-09-26T12:28:44Z', 'REPO-MIRROR-1')").run();
db.prepare("INSERT INTO intents (id, desire, source, device, type, status, created_at) VALUES ('int-res-1', 'A research question', 'feed', 'chatbox', 'research', 'pending', '2026-09-26T12:00:00Z')").run();
const ri = await api.ownerNotesRoute({ AUDIT });
const feedIssue = ownerIssues().find((x) => x.title.startsWith("INTENT-TASK-int-feed-1: REPO-MIRROR-1"));
ok(ri.intents === 1 && feedIssue && /code-task: repo=QNFO\/qnfo-workers path=docs\/x\.md/.test(feedIssue.description), "a feed task intent is filed as one issue carrying its code-task line verbatim");
const fi = db.prepare("SELECT status, triage_decision, triage_rationale FROM intents WHERE id = 'int-feed-1'").get();
ok(fi.status === "promoted" && fi.triage_decision === "TO-AGENT-ISSUE" && fi.triage_rationale.includes("agent_issues " + feedIssue.id), "the intent is marked promoted with the issue id");
const di = db.prepare("SELECT status, triage_rationale FROM intents WHERE device = 'owner-dashboard'").get();
ok(di.status === "promoted" && di.triage_rationale.includes("agent_issues " + taskIssue.id) && ownerIssues().length === 4, "a dashboard task intent is linked to its OWNER-TASK issue when the task is queued, never filed twice");
ok(db.prepare("SELECT status FROM intents WHERE id = 'int-res-1'").get().status === "pending", "research intents are left to the research triage");
await api.ownerNotesRoute({ AUDIT });
ok(ownerIssues().length === 4, "intake is idempotent");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
