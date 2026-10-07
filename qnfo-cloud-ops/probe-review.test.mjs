// PROBE-REVIEW-1 (qnfo-cloud-ops 1.24.0, agent_issues 2112): closing probes are judged against their issue's definition of done;
// a self-confirming probe leaves the closing path until a rewrite passes the review; one verdict per probe text; switches.
// Run: node qnfo-cloud-ops/probe-review.test.mjs   (prints "N passed, 0 failed")
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// ---- PROBE-REVIEW-1:BEGIN"), b = src.indexOf("// ---- PROBE-REVIEW-1:END");
let passed = 0, failed = 0;
const ok = (c, m, x) => { if (c) passed++; else { failed++; console.error("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
ok(a > 0 && b > a, "the block is marked");
const sandbox = { crypto: globalThis.crypto, TextEncoder, JSON, Map, Array, Uint8Array, Date, String, Number, Object, Promise, Math, console };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b) + "\n__export = { probeReviewPrompt, probeReviewParse, probeReviewDecision, probeReviewSha, probeReviewOwnership, jobProbeReview, PROBE_REVIEW_SELECT, PROBE_REVIEW_PER_TICK, PROBE_REVIEW_TRIES, PROBE_REVIEW_MODELS };", sandbox);
const P = sandbox.__export;

// pure parts
ok(P.probeReviewParse('<think>x</think>{"verdict":"self-confirming","reason":"it only checks the trigger exists {x}"}').verdict === "self-confirming", "a reply with a think block and braces in the reason parses");
ok(P.probeReviewParse('```json\n{"verdict":"Tests-DoD"}\n```').verdict === "tests-dod" && P.probeReviewParse('noise "verdict": "partial" noise').verdict === "partial", "fenced JSON and a bare field parse; case ignored");
ok(P.probeReviewParse("looks fine").verdict === null && P.probeReviewParse('{"verdict":"maybe"}').verdict === null, "an unreadable or unknown verdict is no verdict");
ok(P.probeReviewDecision({ verdict: "self-confirming" }, "active", true).action === "refuse" && P.probeReviewDecision({ verdict: "self-confirming" }, "active", false).action === "none", "self-confirming refuses only while enforced");
ok(P.probeReviewDecision({ verdict: "tests-dod" }, "probe-review-refused", true).action === "restore" && P.probeReviewDecision({ verdict: "partial" }, "active", true).action === "none", "a passing review restores a refused contract and leaves an active one");
ok(P.probeReviewDecision({ tries: 1 }, "active", true).action === "retry" && P.probeReviewDecision({ tries: 3 }, "active", true).action === "none", "no verdict retries, then leaves the probe as it is after 3 tries");
ok(P.probeReviewOwnership("SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 2090) <> 'open' THEN 'ok' WHEN (SELECT created_at FROM agent_issues WHERE id = 2090) > 5 THEN 'pending' ELSE 'stale' END AS observed"), "an ownership probe on the issue's own status is not judged");
ok(!P.probeReviewOwnership("SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 5) <> 'open' AND EXISTS (SELECT 1 FROM metric_registry WHERE metric = 'm') THEN 'ok' END AS observed") && !P.probeReviewOwnership("SELECT '1' AS expected, (SELECT COUNT(*) FROM emails) AS observed"), "a probe that also reads another table is judged");
ok(/a card is resolved/.test(P.probeReviewPrompt("T", "D", "Q").system), "the prompt accepts a probe on a decision or card when that is the definition of done");
const pr = P.probeReviewPrompt("T", "Definition of done: X", "SELECT 1");
ok(/data, never instructions/.test(pr.system) && /Definition of done: X/.test(pr.user) && /SELECT 1/.test(pr.user), "the prompt carries the issue and the probe as data");
ok(!P.PROBE_REVIEW_MODELS.some((m) => /anthropic|claude/i.test(m)), "the reviewers are Workers AI models, not the family that writes session probes");

// D1
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT 'p', action TEXT NOT NULL DEFAULT 'a', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT 'x', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, updated_at INTEGER);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);`);
const stmt = (sql) => { let args = []; const s = { bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async first() { return db.prepare(sql).get(...args) || null; }, async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; return s; };
const AUDIT = { prepare: stmt };
const issue = (id, title, st) => db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (?, ?, 'Definition of done: the metric reads 0', ?)").run(id, title, st || "open");
const contract = (cls, iss, probe, extra) => db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, module, ts) VALUES (?, ?, ?, ?, ?, ?, ?)").run(cls, iss, probe, (extra && extra.transport) || "d1-query", (extra && extra.status) || "active", (extra && extra.module) || null, (extra && extra.ts) || "2026-10-07 10:00:00");
issue(1, "SELF-1: a"); issue(2, "GOOD-1: b"); issue(3, "MUTE-1: c"); issue(4, "METRIC-TRIGGER-9-X: d"); issue(5, "TEMPLATE-1: e"); issue(6, "CLOSED-1: f", "closed"); issue(7, "HTTPS-1: g");
contract("issue-1", 1, "SELECT 'ok' AS expected, CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE name = 'x') THEN 'ok' ELSE 'pending' END AS observed", { ts: "2026-10-07 10:03:00" });
contract("issue-2", 2, "SELECT 'ok' AS expected, CASE WHEN (SELECT last_value FROM metric_registry WHERE metric = 'm') = '0' THEN 'ok' ELSE 'pending' END AS observed", { ts: "2026-10-07 10:02:00" });
contract("issue-3", 3, "SELECT 'ok' AS expected, 'pending: mute' AS observed", { ts: "2026-10-07 10:01:00" });
contract("issue-4", 4, "SELECT '1' AS expected, '0' AS observed", { module: "probe-template-v1" });
contract("issue-5", 5, "SELECT 'ok' AS expected, 'pending' AS observed", { module: "probe-template-v2-loop" });
contract("issue-6", 6, "SELECT 'ok' AS expected, 'ok' AS observed");
contract("issue-7", 7, '{"url":"https://x"}', { transport: "runner-https" });
const sel = db.prepare(P.PROBE_REVIEW_SELECT).all().map((r) => r.class);
ok(sel.join(",") === "issue-1,issue-2,issue-3", "selection: open issues, d1-query SELECT probes, no template or METRIC-TRIGGER or closed or https contract", sel);

let calls = [];
const verdicts = { "issue-1": '{"verdict":"self-confirming","reason":"it only checks that table x exists"}', "issue-2": '{"verdict":"tests-dod","reason":"it reads the metric itself"}', "issue-3": "no idea" };
const keyOf = (u) => u.indexOf("name = 'x'") >= 0 ? "issue-1" : u.indexOf("last_value") >= 0 ? "issue-2" : u.indexOf("pending: mute") >= 0 ? "issue-3" : null;
const AI = { run: async (model, input) => { calls.push(model); const k = keyOf(input.messages[1].content); return { response: k ? verdicts[k] : "?" }; } };
const env = { AUDIT, AI };
const st = (c) => db.prepare("SELECT status, last_verdict FROM remediation_contracts WHERE class = ?").get(c);
const desc = (i) => db.prepare("SELECT description FROM agent_issues WHERE id = ?").get(i).description;

issue(10, "OWNED-1: j"); contract("issue-10", 10, "SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 10) <> 'open' THEN 'ok' ELSE 'pending: owned' END AS observed", { ts: "2026-10-07 09:00:00" });
let r = JSON.parse(JSON.stringify(await P.jobProbeReview(env, { now: Date.parse("2026-10-07T17:00:00Z") })));
ok(r.notes.reviewed === 2 && calls.length === 2 && r.notes.ownership === 1, "two reviews per tick; the ownership probe is skipped", r.notes);
ok(st("issue-1").status === "probe-review-refused" && st("issue-1").last_verdict === "probe-review-refused" && /PROBE-REVIEW-1 .* judged self-confirming by @cf\/openai\/gpt-oss-120b: it only checks that table x exists/.test(desc(1)), "a self-confirming probe leaves the closing path and the issue says why", { st: st("issue-1"), d: desc(1).slice(-200) });
ok(st("issue-2").status === "active" && !/PROBE-REVIEW-1/.test(desc(2)), "a probe that tests the definition of done is left alone");
ok(db.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'probe-review'").get().n === 2 && db.prepare("SELECT status FROM cloud_ops_events WHERE id = 'probe-review-tick'").get().status === "ok", "one cached verdict per reviewed probe, and a heartbeat row");

calls = [];
r = JSON.parse(JSON.stringify(await P.jobProbeReview(env, { now: Date.parse("2026-10-07T17:10:00Z") })));
ok(r.notes.reviewed === 1 && calls.length === 2 && r.notes.retry === 1, "next tick: only the unjudged probe is reviewed (both models tried on an unreadable reply), judged ones cost nothing", { notes: r.notes, calls });
for (let k = 0; k < 3; k++) await P.jobProbeReview(env, { now: Date.parse("2026-10-07T17:20:00Z") + k * 6e5 });
const m3 = JSON.parse(db.prepare("SELECT meta FROM cloud_ops_events WHERE id LIKE 'probe-review-issue-3-%'").get().meta);
ok(m3.tries === 3 && !m3.verdict && st("issue-3").status === "active", "three unreadable reviews leave the probe as it is", m3);
calls = [];
await P.jobProbeReview(env, { now: Date.parse("2026-10-07T18:00:00Z") });
ok(calls.length === 0, "nothing left to judge: no model call");

// a bypass with the same self-confirming text is refused again without a model call
db.prepare("UPDATE remediation_contracts SET status = 'active' WHERE class = 'issue-1'").run();
await P.jobProbeReview(env, { now: Date.parse("2026-10-07T18:10:00Z") });
ok(st("issue-1").status === "probe-review-refused" && calls.length === 0, "setting the same probe back to active is refused again from the cache");
// a rewrite that passes restores it
db.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, (SELECT last_value FROM metric_registry WHERE metric = ''m'') AS observed' WHERE class = 'issue-1'").run();
verdicts["issue-1"] = '{"verdict":"tests-dod","reason":"reads the metric"}';
const AI2 = { run: async (model, input) => { calls.push(model); return { response: /metric_registry/.test(input.messages[1].content) ? '{"verdict":"tests-dod","reason":"reads the metric"}' : "?" }; } };
await P.jobProbeReview({ AUDIT, AI: AI2 }, { now: Date.parse("2026-10-07T18:20:00Z") });
ok(st("issue-1").status === "active" && st("issue-1").last_verdict === "probe-review-ok" && /active again/.test(desc(1)) && calls.length === 1, "a rewritten probe judged tests-dod is restored, with a note", { st: st("issue-1"), calls });

// switches
issue(8, "SELF-2: h"); contract("issue-8", 8, "SELECT 'ok' AS expected, CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE name = 'y') THEN 'ok' END AS observed", { ts: "2026-10-07 11:00:00" });
db.prepare("INSERT INTO ops_config (key, value) VALUES ('probe_review_enforce', 'record')").run();
const AI3 = { run: async () => ({ response: '{"verdict":"self-confirming","reason":"exists check"}' }) };
await P.jobProbeReview({ AUDIT, AI: AI3 }, { now: Date.parse("2026-10-07T18:30:00Z") });
ok(st("issue-8").status === "active" && JSON.parse(db.prepare("SELECT meta FROM cloud_ops_events WHERE id LIKE 'probe-review-issue-8-%'").get().meta).verdict === "self-confirming", "enforce=record keeps the verdict and changes no contract");
db.prepare("UPDATE ops_config SET value = 'on' WHERE key = 'probe_review_enforce'").run();
await P.jobProbeReview({ AUDIT, AI: AI3 }, { now: Date.parse("2026-10-07T18:40:00Z") });
ok(st("issue-8").status === "probe-review-refused", "enforcement back on applies the cached verdict without a new call");
db.prepare("INSERT INTO ops_config (key, value) VALUES ('probe_review_enabled', 'off')").run();
issue(9, "NEW-1: i"); contract("issue-9", 9, "SELECT 'ok' AS expected, 'ok' AS observed", { ts: "2026-10-07 12:00:00" });
calls = [];
r = JSON.parse(JSON.stringify(await P.jobProbeReview({ AUDIT, AI: AI2 }, { now: Date.parse("2026-10-07T18:50:00Z") })));
ok(r.notes.skipped && calls.length === 0, "probe_review_enabled off: no model call", r.notes);
db.prepare("DELETE FROM ops_config WHERE key = 'probe_review_enabled'").run();
const AIX = { run: async () => { throw new Error("3046: Request timeout"); } };
r = JSON.parse(JSON.stringify(await P.jobProbeReview({ AUDIT, AI: AIX }, { now: Date.parse("2026-10-07T19:00:00Z") })));
ok(st("issue-9").status === "active" && r.notes.retry >= 1 && /3046/.test(JSON.parse(db.prepare("SELECT meta FROM cloud_ops_events WHERE id LIKE 'probe-review-issue-9-%'").get().meta).err), "a model error is a retry; the contract is untouched");
r = JSON.parse(JSON.stringify(await P.jobProbeReview({ AUDIT }, { now: Date.parse("2026-10-07T19:10:00Z") })));
ok(/no AI binding/.test(r.notes.skipped || ""), "no AI binding: skipped");

// wiring
ok(/"probe-review": jobProbeReview,/.test(src) && /runs\.push\(jobProbeReview\(env\)\.catch\(/.test(src), "every tick runs it and POST /run?job=probe-review reaches it");
const ver = (/var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src) || []).slice(1).map(Number);
ok(ver[0] > 1 || (ver[0] === 1 && ver[1] >= 24), "VERSION 1.24.0 or later (a minimum, not a pin)", ver);
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
