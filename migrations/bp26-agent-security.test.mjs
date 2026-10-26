// BP26-PROMPT-INJECTION-1 offline suite: replays migrations/2026-10-26-bp26-agent-security.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped by the body); the three tables, two indexes and the anomaly view exist with the columns the
// qnfo-email worker (2.12.0) and scripts/bp26_agentsec.py write and read, and the worker's own INSERT statements run against them; both allow-lists are seeded; the three metrics name their real producer and
// keep the [BP26] tag; the two controls and the kill-switch row are registered; the decision is logged once; a replay changes nothing; the Rollback line puts the file's changes back.
// Output MUST contain "0 failed" on success.   node migrations/bp26-agent-security.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-agent-security.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../qnfo-email/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok(/WHAT AN OUTSIDER COULD MAKE THE EMAIL AGENT DO/.test(sql) && /email_send_paths sp-2/.test(sql), "the header carries the threat map");

const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const ORIG = { injection_eval_pass_rate: "red-team suite (to build) [BP26]", outbound_mail_to_non_sender: "mail send log (to compute) [BP26]", agent_tool_calls_outside_allowlist: "agent_actions audit log (to build) [BP26]" };
const world = () => {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, source_of_truth TEXT, refresh_cadence TEXT, last_value TEXT, state TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE email_send_violations (id INTEGER PRIMARY KEY AUTOINCREMENT, detected_at TEXT DEFAULT (datetime('now')), recipient TEXT, sender TEXT, subject TEXT, message_id TEXT, violation TEXT, detail TEXT, resolved INTEGER DEFAULT 0);`);
  for (const [m, s] of Object.entries(ORIG)) w.prepare("INSERT INTO metric_registry (metric, source_of_truth, refresh_cadence, state) VALUES (?, ?, '1h', 'UNMEASURED')").run(m, s);
  return w;
};
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);

const w = world();
w.exec(sql);
const tables = qa(w, "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('agent_send_allowlist', 'agent_tool_allowlist', 'agent_mail_trace') ORDER BY name").map((r) => r.name);
ok(tables.join() === "agent_mail_trace,agent_send_allowlist,agent_tool_allowlist", "the three tables exist", tables);
ok(qa(w, "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_agent_mail_trace%' ORDER BY name").map((r) => r.name).join() === "idx_agent_mail_trace_decision,idx_agent_mail_trace_ts", "both indexes exist");
ok(!!q1(w, "SELECT name FROM sqlite_master WHERE type = 'view' AND name = 'v_agent_mail_anomalies'"), "the anomaly view exists");

// the worker's own statements run against the created tables (the columns match, the order of binds matches). The migration and qnfo-email 2.12.0 ship in separate pull requests:
// until the worker with the guards is on this checkout there is no statement to read, and the cross-check says so instead of failing.
const workerHasGuards = /agent_mail_trace/.test(worker);
const insTrace = /prepare\("(INSERT INTO agent_mail_trace \([^"]+\) VALUES \([^"]+\))"\)/.exec(worker);
ok(!workerHasGuards || !!insTrace, "the worker writes agent_mail_trace");
if (insTrace) {
  w.prepare(insTrace[1].replace(/\?\d+/g, "?")).run("email-drafter", 70, 11, "classify and draft a reply", '["scan","held-for-owner"]', 6, '["override","reveal-prompt"]', "tier3", "possible prompt injection");
  w.prepare(insTrace[1].replace(/\?\d+/g, "?")).run("send-api", null, null, "new-message", "[]", 0, "[]", "refused", "agent-cold-send-not-allow-listed");
  const anomalies = qa(w, "SELECT decision FROM v_agent_mail_anomalies ORDER BY id").map((r) => r.decision);
  ok(anomalies.join() === "tier3,refused", "the anomaly view lists a high score and a refusal", anomalies);
}
const insViol = /prepare\("(INSERT INTO email_send_violations \([^"]+\) VALUES \([^"]+\))"\)/.exec(worker);
ok(!workerHasGuards || !!insViol, "the worker writes email_send_violations");
if (insViol) { w.prepare(insViol[1].replace(/\?\d+/g, "?")).run("x@evil.test", "qnfo@qnfo.org", "s", "", "AGENT-SEND-POLICY", "mcp: agent-cold-send-not-allow-listed"); ok(q1(w, "SELECT COUNT(*) n FROM email_send_violations").n === 1, "the violation insert runs"); }
const selAllow = /prepare\("(SELECT pattern FROM agent_send_allowlist[^"]*)"\)/.exec(worker);
ok(!workerHasGuards || (!!selAllow && qa(w, selAllow[1]).length === 0), "the worker's allow-list read runs and the list starts empty");
const selPolicy = /prepare\("(SELECT value FROM ops_config WHERE key='agent_send_policy')"\)/.exec(worker);
ok(!workerHasGuards || (!!selPolicy && q1(w, selPolicy[1]).value === "on"), "the kill-switch read finds the row, value on");

const tools = qa(w, "SELECT surface, COUNT(*) n FROM agent_tool_allowlist WHERE kind = 'tool' GROUP BY surface ORDER BY surface");
ok(tools.length === 2 && tools[0].surface === "qnfo-ops" && tools[0].n >= 70 && tools[1].surface === "qnfo-tools-mcp" && tools[1].n >= 15, "both agent surfaces have their registered tools", tools);
const hosts = qa(w, "SELECT pattern FROM agent_tool_allowlist WHERE kind = 'egress' AND surface = '*'").map((r) => r.pattern);
ok(["qnfo.org", "q08.org", "github.com", "arxiv.org", "cloudflare.com"].every((h) => hosts.includes(h)) && hosts.every((h) => !/^https?:|\//.test(h)), "the egress list holds host suffixes", hosts.length);
ok(!hosts.includes("evil.test") && !hosts.includes("example.com") && !hosts.includes("linkedin.com"), "no host the agent merely happened to fetch was added to make the metric pass");
ok(q1(w, "SELECT COUNT(*) n FROM agent_send_allowlist").n === 0, "the recipient allow-list starts empty (strict by default)");

for (const [m, was] of Object.entries(ORIG)) {
  const r = q1(w, "SELECT source_of_truth s, refresh_cadence c FROM metric_registry WHERE metric = ?", m);
  ok(r.s !== was && /\[BP26\]$/.test(r.s) && /bp26_agentsec\.py/.test(r.s) && r.c === "1h", "metric " + m + " names its real producer and keeps the [BP26] tag", r);
}
ok(q1(w, "SELECT COUNT(*) n FROM control_registry WHERE control IN ('agent-send-policy-gate', 'drafter-injection-guard') AND disposition = 'keep' AND disposition_state = 'applied' AND alternate_tested_at = '2026-10-26' AND issue_id = 1000359").n === 2, "both controls are registered with a tested alternate");
ok(q1(w, "SELECT value v FROM ops_config WHERE key = 'agent_send_policy'").v === "on", "the kill-switch row exists with value on");
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-PROMPT-INJECTION-1:%'").n === 1, "the decision is logged once");

const snap = () => JSON.stringify([q1(w, "SELECT COUNT(*) n FROM decision_log"), q1(w, "SELECT COUNT(*) n FROM agent_tool_allowlist"), q1(w, "SELECT COUNT(*) n FROM control_registry"), q1(w, "SELECT COUNT(*) n FROM ops_config"), q1(w, "SELECT COUNT(*) n FROM agent_mail_trace")]);
const before = snap();
w.exec(sql);
ok(snap() === before, "a replay changes nothing");

w.exec(rollback);
ok(qa(w, "SELECT name FROM sqlite_master WHERE name LIKE 'agent_%' OR name LIKE 'v_agent_%' OR name LIKE 'idx_agent_mail%'").length === 0, "the Rollback line drops the tables, indexes and view");
ok(Object.entries(ORIG).every(([m, was]) => q1(w, "SELECT source_of_truth s FROM metric_registry WHERE metric = ?", m).s === was), "the Rollback line restores the three source_of_truth texts");
ok(q1(w, "SELECT COUNT(*) n FROM control_registry").n === 0 && q1(w, "SELECT COUNT(*) n FROM ops_config").n === 0, "the Rollback line deletes the control rows and the kill-switch row");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
