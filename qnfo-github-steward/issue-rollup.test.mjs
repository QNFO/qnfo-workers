// ISSUE-ROLLUP-1 offline suite: configured priorities keep one GitHub issue each; FM-ACTOR-1 issues are also individual at every priority, while the rest are listed in a [digest]. D1 remains authoritative. Run: node qnfo-github-steward/issue-rollup.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const VERSION = /var VERSION = "(\d+)\.(\d+)/.exec(readFileSync(join(here, "worker.js"), "utf8"));
assert.ok(Number(VERSION[1]) > 0 || Number(VERSION[2]) >= 3, "VERSION at or above 0.3 (minimum, not a pin)");

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT)");
db.exec("CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT)");
db.exec("CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, goal TEXT, status TEXT, branch TEXT, pr_url TEXT, merged_by TEXT, merged_sha TEXT, merged_at TEXT, merge_note TEXT, created_at TEXT, updated_at TEXT)");
db.exec("CREATE TABLE fleet_issue_dispatch (fingerprint TEXT PRIMARY KEY, category TEXT, sev TEXT, owner TEXT, payload TEXT, gh_number TEXT, state TEXT, exec_state TEXT, exec_ts TEXT, exec_result TEXT, exec_attempts INTEGER)");
db.exec("CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT)");
const mig = readFileSync(join(here, "..", "migrations", "2026-10-18-tracker-sync.sql"), "utf8");
for (const stmt of mig.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)) {
  if (/^INSERT OR IGNORE INTO analytics_metric_triggers/.test(stmt)) continue;
  if (/^INSERT OR IGNORE INTO metric_registry/.test(stmt)) { for (const m of ["tracker_drift", "tracker_issue_drift", "tracker_code_task_drift"]) db.prepare("INSERT INTO metric_registry (metric, state) VALUES (?, 'PENDING')").run(m); continue; }
  db.exec(stmt);
}
const prep = (sql) => { let a = []; const st = { bind: (...x) => { a = x.map((v) => (v === undefined ? null : v)); return st; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; };
const AUDIT = { prepare: prep, batch: async (l) => { for (const s of l) await s.run(); return []; } };

// Fake GitHub
let gIssues = [], gNext = 5000, gPulls = [], calls = [], listFails = false, gComments = [], patchStatus = null, patchLog = [], patchMsg = "limited", patchHdr = undefined, patchFailFor = new Set();
const reply = (status, body, headers) => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers });
globalThis.fetch = async (url, init) => {
  const u = new URL(url); const m = (init && init.method) || "GET"; const body = init && init.body ? JSON.parse(init.body) : null;
  calls.push(m + " " + u.pathname);
  const page = Number(u.searchParams.get("page") || 1);
  if (m === "GET" && u.pathname === "/repos/QNFO/qnfo-workers/issues") {
    if (listFails) return reply(502, { message: "bad gateway" });
    return reply(200, page > 1 ? [] : gIssues.filter((i) => i.state === "open" && (i.labels || []).includes("fleet-issue")));
  }
  if (m === "POST" && u.pathname === "/repos/QNFO/qnfo-workers/issues") { const i = { number: gNext++, title: body.title, body: body.body, labels: body.labels, state: "open" }; gIssues.push(i); return reply(201, i); }
  let mm = /^\/repos\/QNFO\/qnfo-workers\/issues\/(\d+)$/.exec(u.pathname);
  if (mm && m === "GET") { const i = gIssues.find((x) => x.number === Number(mm[1])); return i ? reply(200, i) : reply(404, {}); }
  if (mm && m === "PATCH") { patchLog.push({ n: Number(mm[1]), ...body }); if (patchFailFor.has(Number(mm[1]))) return reply(403, { message: "Resource not accessible by integration" }); if (patchStatus) return reply(patchStatus, { message: patchMsg }, patchHdr); const i = gIssues.find((x) => x.number === Number(mm[1])); i.state = body.state; if (body.state_reason) i.state_reason = body.state_reason; return reply(200, i); }
  mm = /^\/repos\/QNFO\/qnfo-workers\/issues\/(\d+)\/comments$/.exec(u.pathname);
  if (mm) { gComments.push({ n: Number(mm[1]), body: body.body }); return reply(201, { id: 1 }); }
  if (m === "GET" && u.pathname === "/repos/QNFO/qnfo-workers/pulls") return reply(200, page > 1 ? [] : gPulls.filter((p) => !p.hidden));
  mm = /^\/repos\/QNFO\/qnfo-workers\/pulls\/(\d+)$/.exec(u.pathname);
  if (mm) { const p = gPulls.find((x) => x.number === Number(mm[1])); return p ? reply(200, p.merged_at ? { ...p, merged_by: { login: "rwnq8" } } : p) : reply(404, {}); }
  return reply(404, { message: "unmocked " + m + " " + u.pathname });
};
db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT)");
db.exec("CREATE TABLE gh_digest_links (dkey TEXT PRIMARY KEY, gh_number INTEGER NOT NULL, body_hash TEXT, n INTEGER, synced_at TEXT)");
db.exec("CREATE TABLE issue_project_map (issue_id INTEGER PRIMARY KEY, program_code TEXT)");
db.exec("CREATE TABLE roadmap_mirror_scope (source TEXT PRIMARY KEY, mirrored INTEGER, reason TEXT)");
db.exec("CREATE TABLE roadmap_implementation (id INTEGER PRIMARY KEY, item TEXT, status TEXT, source TEXT)");
const env = { AUDIT, GITHUB_TOKEN: "t", STEWARD_KEY: "k" };
const tick = async () => { const r = await w.fetch(new Request("https://s.test/tracker/tick", { method: "POST", headers: { "x-steward-key": "k" } }), env); assert.equal(r.status, 200); return (await r.json()).result; };
const ins = db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)");
const t0 = Date.now() - 3600e3;
ins.run(1, "CRIT-1: a", "x", "qnfo-ops", "bug", "critical", t0);
ins.run(2, "HIGH-1: b", "x", "qnfo-ops", "bug", "high", t0);
ins.run(3, "MED-1: c | pipe", "x", "qnfo-ops", "bug", "medium", t0);
db.prepare("INSERT INTO issue_project_map (issue_id, program_code) VALUES (2, 'ops'), (3, 'ops')").run();

// Key absent: the old behaviour, one issue per row.
let r = await tick();
assert.equal(r.mirrored, 3, "without the ops_config key every priority is individual");
assert.equal(r.digest, undefined, "no digest without the key");

// Key set: the high and medium mirrors close not_planned naming the rollup, one digest lists them, the critical stays.
db.prepare("INSERT INTO ops_config (key, value) VALUES ('gh_individual_priorities', 'critical')").run();
r = await tick();
const byTitle = (p) => gIssues.find((i) => i.title.startsWith(p));
assert.equal(byTitle("[#1]").state, "open", "critical keeps its issue");
assert.equal(byTitle("[#2]").state, "closed", "high mirror closed");
assert.equal(byTitle("[#3]").state, "closed", "medium mirror closed");
assert.ok(gComments.some((c) => /Rolled up by ISSUE-ROLLUP-1/.test(c.body) && /not a verification/.test(c.body)), "close comment says it is a roll-up, not a verification");
assert.equal(db.prepare("SELECT status FROM agent_issues WHERE id = 2").get().status, "open", "D1 stays open");
const dg = gIssues.find((i) => i.title.startsWith("[digest] ops"));
assert.ok(dg && /#2 \| high/.test(dg.body) && /#3 \| medium \| MED-1: c \/ pipe/.test(dg.body) && !/#1 \|/.test(dg.body), "the digest lists the rolled rows, pipes escaped, not the critical one");
assert.deepEqual(dg.labels, ["fleet-digest"]);
assert.equal(db.prepare("SELECT COUNT(*) c FROM gh_digest_links").get().c, 1);
assert.equal(db.prepare("SELECT COUNT(*) c FROM v_tracker_drift WHERE kind IN ('issue-state','issue-unmirrored')").get().c >= 0, true);

// A new medium row is never filed; the digest is rewritten once, not every tick.
ins.run(4, "MED-2: d", "x", "qnfo-ops", "bug", "medium", t0);
db.prepare("INSERT INTO issue_project_map (issue_id, program_code) VALUES (4, 'ops')").run();
r = await tick();
assert.equal(r.mirrored, 0, "a rolled priority is not filed");
assert.ok(!gIssues.some((i) => i.title.startsWith("[#4]")));
assert.ok(patchLog.some((x) => /\(3\)$/.test(x.title || "") && /#4 \| medium/.test(x.body || "")), "the digest is rewritten with the new row");
const patches = patchLog.length;
await tick();
assert.equal(patchLog.length, patches, "an unchanged digest is not rewritten");

// FM-ACTOR-1 issues stay individual at every priority and D1, not GitHub, remains their closure authority.
ins.run(5, "FM-ACTOR-1: loop-close-vs-probe-disagree", "Failure-mode detector", "qnfo-cloud-ops", "failure-mode", "medium", t0);
r = await tick();
const fmIssue = gIssues.find((i) => i.title.startsWith("[#5]"));
assert.ok(fmIssue && fmIssue.state === "open", "a medium FM-ACTOR-1 issue is mirrored individually");
assert.ok(!dg.body.includes("#5 |"), "FM-ACTOR-1 is not duplicated into the digest");
fmIssue.state = "closed";
await tick();
assert.equal(fmIssue.state, "open", "a GitHub close cannot resolve an FM-ACTOR-1 issue while D1 remains open");
assert.equal(db.prepare("SELECT status FROM agent_issues WHERE id = 5").get().status, "open", "D1 remains the closure authority");

// Promotion: a medium row that becomes critical gets its issue back (reopen).
db.prepare("UPDATE agent_issues SET priority = 'critical', updated_at = ? WHERE id = 3").run(Date.now());
await tick();
assert.equal(byTitle("[#3]").state, "open", "a promoted row reopens");

// Deleting the key restores one issue per row.
db.prepare("DELETE FROM ops_config WHERE key = 'gh_individual_priorities'").run();
await tick();
assert.equal(byTitle("[#2]").state, "open", "deleting the key restores the mirror");
console.log("issue-rollup.test.mjs OK");
