// BUDGET-SOFT-ROUTE-1 (1.6.0, replaces IDEA-TRIAGE-BREACH-DEFER-1 #1878) + COST-ATTRIBUTION (#1833) + OWNER-TOKEN-SHADOW-1 (#1966) offline suite. Runs the
// worker's own triageProposals, runConsume backpressure and ownerOk in a vm against an in-memory SQLite D1 and a counting
// Workers AI stub. Proves: while a fleet_budget ai_spend cap is breached each proposal is scored by one cheap model and
// never deferred, rules still hold noise and chat questions, old deferred_budget rows are released and scored, the run is
// published as lean; an unreadable fleet_budget selects lean too; with clear caps two models score; each triage model
// call is counted in ai_call_counters; backpressure still pauses producers; the intake accepts
// OWNER_TOKEN or SYNC_TOKEN and nothing else.
// Run: node idea-hub/triage-budget.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8").replace(/export default\s*\{/, "var __default = {");
const logs = [];
const sb = { console: { log: (m) => logs.push(String(m)) }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto, fetch: async () => { throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { triageProposals, runConsume, ownerOk, aiBudgetBreach, TRIAGE_BATCH, PROPOSAL_BACKPRESSURE };", sb);
const api = sb.__x;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT, decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap REAL, target REAL, current REAL, unit TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT, created_at TEXT);
CREATE TABLE signals (id TEXT PRIMARY KEY, ts TEXT, source TEXT, source_ref TEXT, content TEXT, open_questions TEXT, evidential_weight REAL, domain TEXT, status TEXT, decision TEXT, created_at TEXT);
CREATE TABLE signal_worker_boundary (worker TEXT, source TEXT, permitted INTEGER);`);
const d1 = { prepare(sql) { let a = []; const q = sql.replace(/\?(\d+)/g, "?"); const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(q).all(...a) }; }, async first() { return db.prepare(q).get(...a) ?? null; }, async run() { const r = db.prepare(q).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return st; } };
const calls = [];
const AI = { async run(model) { calls.push(model); return { response: '{"novelty":0.9,"technical_merit":0.9,"impact_potential":0.8,"exposure_potential":0.8,"feasibility":0.9,"risk":0.1,"rationale":"ok","hook":"h"}' }; } };
const env = { QNFO_AUDIT: d1, AI };
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const add = (name, idea, at) => Number(db.prepare("INSERT INTO idea_proposals (name, idea, contact, status, created_at) VALUES (?, ?, '', 'new', ?)").run(name, idea, at).lastInsertRowid);
const st = (id) => db.prepare("SELECT status FROM idea_proposals WHERE id = ?").get(id).status;

// 1. BUDGET-SOFT-ROUTE-1 (1.6.0): breached caps score lean (one cheap model per proposal), never defer; rules still run.
db.prepare("INSERT INTO fleet_budget (node_class, cap, current) VALUES ('ai_spend:total', 150, 224.55), ('ai_spend:workers-ai', 25, 60.22), ('workers', 30, 44)").run();
add("owner-chat", "A falsifiable bound on the energy per logical gate from the Margolus-Levitin limit across cryogenic stages", "2026-10-05T10:00:00Z");
add("auto-scan", "Topological codes on ultrametric lattices and their thresholds under biased noise", "2026-10-05T10:01:00Z");
add("rowan-chat", "Call the search_papers tool now", "2026-10-05T10:02:00Z");
add("chat-session", "What is a qubit?", "2026-10-05T10:03:00Z");
let out = await api.triageProposals(env);
ok(calls.length === 2 && calls.every((m) => m === "@cf/zai-org/glm-5.3-flash"), "while a cap is breached each proposal is scored by one cheap model (no second model, no tiebreak)", calls);
ok(out.budget_breached === true && out.lean === true && out.deferred === 0 && out.triaged === 4, "nothing is deferred: 2 scored lean, 2 held by the zero-cost rules", out);
ok(st(1) === "triaged_accepted" && st(2) === "triaged_accepted" && st(3) === "triaged_hold" && st(4) === "triaged_hold", "the human and the machine idea get real decisions; noise and a chat question are held");
const ev = db.prepare("SELECT status, meta FROM cloud_ops_events WHERE id = 'idea-triage-budget'").get();
const meta = ev ? JSON.parse(ev.meta) : {};
ok(ev && ev.status === "lean" && meta.breached === true && meta.deferred_total === 0 && meta.triaged_run === 4, "the run is published as lean in cloud_ops_events idea-triage-budget", ev);
ok(logs.some((l) => /^BUDGET-SOFT-ROUTE-1 idea-triage /.test(l)), "each run logs a line");
// 2. Rows a 1.5.x run left as deferred_budget are released and scored even while the caps stay breached.
const old1 = Number(db.prepare("INSERT INTO idea_proposals (name, idea, status, created_at) VALUES ('auto-scan', 'Adelic product formulas as constraints on scattering amplitudes', 'deferred_budget', '2026-10-04T09:00:00Z')").run().lastInsertRowid);
const before = calls.length;
out = await api.triageProposals(env);
ok(out.released === 1 && st(old1) === "triaged_accepted" && calls.length === before + 1, "a deferred_budget row is released and scored lean while the caps are breached", out);
// 3. An unreadable fleet_budget selects lean scoring (one model), it does not stop triage.
db.exec("ALTER TABLE fleet_budget RENAME TO fleet_budget_x");
const id5 = add("auto-scan", "Another research idea about adelic product formulas and statistics", "2026-10-05T12:00:00Z");
const b2 = calls.length;
out = await api.triageProposals(env);
ok(out.budget_breached === true && st(id5) === "triaged_accepted" && calls.length === b2 + 1, "with fleet_budget unreadable the proposal is still scored, by one model", out);
db.exec("ALTER TABLE fleet_budget_x RENAME TO fleet_budget");
// 4. Caps clear: full two-model scoring; every call is attributed; producers still count backlog for backpressure.
db.prepare("UPDATE fleet_budget SET current = 10 WHERE node_class LIKE 'ai_spend:%'").run();
const id6 = add("auto-scan", "Ultrametric bounds on decoder latency in surface codes", "2026-10-05T13:00:00Z");
const b3 = calls.length;
out = await api.triageProposals(env);
ok(out.budget_breached === false && out.lean === false && st(id6) === "triaged_accepted" && calls.length >= b3 + 2, "caps clear: two scoring models run", { out, calls: calls.length - b3 });
const cc = db.prepare("SELECT SUM(calls) n FROM ai_call_counters WHERE worker = 'idea-hub' AND purpose = 'triage'").get();
ok(cc && cc.n === calls.length, "every triage model call is counted in ai_call_counters (worker idea-hub, purpose triage)", { counted: cc && cc.n, calls: calls.length });
for (let i = 0; i < api.PROPOSAL_BACKPRESSURE; i++) db.prepare("INSERT INTO idea_proposals (name, idea, status, created_at) VALUES ('auto-reentry', ?, 'new', '2026-10-05T11:00:00Z')").run("backlog filler " + i);
const c = await api.runConsume(env);
ok(c.paused === true, "a pending backlog above PROPOSAL_BACKPRESSURE still pauses the re-entry producer", c);
db.prepare("DELETE FROM idea_proposals WHERE idea LIKE 'backlog filler %'").run();
// 5. OWNER-TOKEN-SHADOW-1: either secret opens the intake, nothing else does.
const OWN = "o".repeat(40), SYN = "s".repeat(32);
const req = (h, q) => new Request("https://ideas.qnfo.org/api/intake" + (q || ""), { method: "POST", headers: h || {} });
const e2 = { OWNER_TOKEN: OWN, SYNC_TOKEN: SYN };
ok(api.ownerOk(req({ Authorization: "Bearer " + OWN }), e2) && api.ownerOk(req({ Authorization: "Bearer " + SYN }), e2) && api.ownerOk(req({}, "?token=" + SYN), e2), "OWNER_TOKEN and SYNC_TOKEN are both accepted (header or ?token=)");
ok(!api.ownerOk(req({ Authorization: "Bearer " + "x".repeat(40) }), e2) && !api.ownerOk(req({ Authorization: "Bearer " + "x".repeat(32) }), e2) && !api.ownerOk(req({}), e2), "a wrong key of either length, or none, is refused");
ok(!api.ownerOk(req({ Authorization: "Bearer short" }), { OWNER_TOKEN: "short", SYNC_TOKEN: "" }) && !api.ownerOk(req({ Authorization: "Bearer x" }), {}), "secrets under 16 characters or unset open nothing");
ok(api.ownerOk(req({ Authorization: "Bearer " + SYN }), { SYNC_TOKEN: SYN }), "SYNC_TOKEN alone still works when OWNER_TOKEN is unset");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
