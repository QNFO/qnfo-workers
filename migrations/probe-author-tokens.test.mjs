// PROBE-TOKEN-OUTPUT-1: applies migrations/2026-11-14-probe-author-tokens.sql to an in-memory SQLite (node:sqlite), runs each rewritten probe across its passing, failing
// and empty states, and checks every expected and observed value against the consumer's sink-guard token regex (scripts/remediation_consumer.py SINK_TOKEN_RE). A sentence there
// is a probe-error forever (free-text-value), so the issue can never close.
// Run: node --no-warnings migrations/probe-author-tokens.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

const consumer = readFileSync(new URL("../scripts/remediation_consumer.py", import.meta.url), "utf8");
const m = consumer.match(/SINK_TOKEN_RE = re\.compile\(r"([^"]+)"\)/);
ok(!!m, "the consumer still defines SINK_TOKEN_RE");
const TOKEN = new RegExp("^(?:" + (m ? m[1] : "[A-Za-z0-9_.:+-]{1,64}") + ")$");

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, module TEXT, verify_probe TEXT, attempts INTEGER, last_verdict TEXT, next_due_at TEXT, status TEXT);
CREATE TABLE code_tasks (id TEXT, status TEXT, updated_at TEXT);
CREATE TABLE funding_pipeline (id INTEGER, submitted_at TEXT);
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, calls INTEGER, errors INTEGER);
INSERT INTO remediation_contracts VALUES ('issue-1002456', 'probe-author-1', 'old', 3, 'probe-error', NULL, 'active'), ('issue-1002942', 'probe-author-1', 'old', 1, 'probe-error', NULL, 'active'), ('issue-1002946', 'probe-author-1', 'old', 1, 'probe-error', NULL, 'active');
`);
db.exec(readFileSync(new URL("./2026-11-14-probe-author-tokens.sql", import.meta.url), "utf8"));

const probe = (cls) => db.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = ?").get(cls).p;
const run = (cls) => db.prepare(probe(cls)).get();
const tokens = (cls, label, want) => {
  const r = run(cls);
  ok(TOKEN.test(String(r.expected)) && TOKEN.test(String(r.observed)), `${cls} ${label}: expected and observed are tokens`, r);
  if (want !== undefined) ok(r.observed === want, `${cls} ${label}: observed is ${want}`, r.observed);
  return r;
};

for (const c of ["issue-1002456", "issue-1002942", "issue-1002946"]) {
  const row = db.prepare("SELECT attempts, last_verdict, next_due_at FROM remediation_contracts WHERE class = ?").get(c);
  ok(row.attempts === 0 && row.last_verdict === null && row.next_due_at, `${c} is re-armed`, row);
}
ok(db.prepare("SELECT COUNT(*) n FROM bak_20261114_probe_author_tokens WHERE verify_probe = 'old'").get().n === 3, "the old probes are kept in the backup table");

// issue-1002456: code-task yield over 7 days
tokens("issue-1002456", "no tasks", "no-tasks-7d");
for (let i = 0; i < 9; i++) db.exec(`INSERT INTO code_tasks VALUES ('m${i}', 'merged', datetime('now','-1 days'))`);
db.exec(`INSERT INTO code_tasks VALUES ('f1', 'failed', datetime('now','-1 days'))`);
tokens("issue-1002456", "9 of 10 merged", "yield-ok");
for (let i = 0; i < 5; i++) db.exec(`INSERT INTO code_tasks VALUES ('p${i}', 'publish_failed', datetime('now','-1 days'))`);
tokens("issue-1002456", "9 of 15 merged", "yield:0.60");

// issue-1002942: funding submission freshness
tokens("issue-1002942", "no submission", "no-submission");
db.exec(`INSERT INTO funding_pipeline VALUES (1, date('now','-30 days'))`);
tokens("issue-1002942", "30 days old", "age-days:30");
db.exec(`INSERT INTO funding_pipeline VALUES (2, date('now','-2 days'))`);
tokens("issue-1002942", "2 days old", "fresh-14d");

// issue-1002946: qnfo-youtube-shorts binding error rate
tokens("issue-1002946", "no rows", "low-calls:0");
db.exec(`INSERT INTO ai_call_counters VALUES (date('now'), 'qnfo-youtube-shorts', 'binding', 200, 30)`);
tokens("issue-1002946", "15% errors", "err-pct:15.0");
db.exec(`UPDATE ai_call_counters SET errors = 4`);
tokens("issue-1002946", "2% errors", "pass");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
