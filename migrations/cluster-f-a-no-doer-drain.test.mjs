// CLUSTER-F-A no-doer drain offline suite: replays migrations/2026-10-28-cluster-f-a-no-doer-drain.sql on SQLite (node:sqlite) over the shapes of the rows it touches.
// State-independent: it builds its own rows and asserts what the file does with them, never what the live database holds today.
// Proves: the errata probe reads the chain's own conditions (not the notes queue); the travel probe needs 12 samples and no failure; the run_code_net probe ignores excluded agent errors
// and still fails on a server error; the exclusion is added once; the postmortem class is corrected only for accepted-but-slow rows; the sla-gap contract is a runtime probe of the host route;
// the three roadmap contracts read a result document; the over-ceiling research row is parked and 1000248 closes only when no row is above the ceiling; 1000585 closes only on consumer evidence,
// with close_channel session:cluster-f-a; a replay appends nothing; the Rollback line restores the contracts, descriptions, postmortems and the research row.
// Run: node migrations/cluster-f-a-no-doer-drain.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-28-cluster-f-a-no-doer-drain.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const hdr = sql.split("\n").filter((l) => l.startsWith("--"));
ok(hdr.some((l) => l === "-- APPLY-BY: ci") && hdr.some((l) => l === "-- DB: qnfo-audit") && hdr.some((l) => l.startsWith("-- Rollback: ")) && hdr.some((l) => l.startsWith("-- BACKUP: bak_20261028_cfa_")), "header lines");
ok(!/^\s*(DELETE\s+FROM|DROP\s+)/im.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "no destructive statement");

const ROW = "ac9cce13-f637-4a7f-abbe-7a02e5e2d884";
function fresh(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT DEFAULT 'open', close_channel TEXT, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT, remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT, status TEXT, last_verdict TEXT, next_due_at TEXT);
CREATE TABLE postmortems (incident_key TEXT PRIMARY KEY, timeline TEXT, root_cause TEXT);
CREATE TABLE tool_error_exclusions (pattern TEXT, err_class TEXT, rationale TEXT, added_at TEXT, issue_id INTEGER);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, error TEXT, terminal_rearms INTEGER DEFAULT 0, claimed_at TEXT, created_at TEXT);
CREATE TABLE research_ready (id TEXT PRIMARY KEY, ready_at TEXT);
CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, job TEXT, text TEXT, status TEXT, meta TEXT);
CREATE TABLE errata_queue (id INTEGER PRIMARY KEY, status TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE errata_actions (id INTEGER PRIMARY KEY, status TEXT);
CREATE TABLE bp26_probe_results (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT, subject TEXT, ok INTEGER);
CREATE TRIGGER triage_close_sync_issue_ins AFTER INSERT ON issue_triage WHEN NEW.triage_state IN ('closed') BEGIN UPDATE agent_issues SET status = 'closed', close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END) WHERE id = NEW.issue_id AND status = 'open'; END;
CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed') BEGIN UPDATE agent_issues SET status = 'closed', close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END) WHERE id = NEW.issue_id AND status = 'open'; END;
`);
  const iss = (id, title, d = "desc") => db.prepare("INSERT INTO agent_issues (id, title, description) VALUES (?, ?, ?)").run(id, title, d);
  iss(1000002, "Integration chain Errata"); iss(1000678, "SLO-POSTMORTEM-ACTION-1 travel"); iss(1000735, "TOOL-FAILURE: run_code_net [error]");
  iss(1000619, "ROADMAP-1: sla-gap", "code-task: repo=qnfo-workers path=qnfo-backlog-exec/worker.js\ncode-anchor: if (url.pathname === \"/inventory\") {");
  iss(1000637, "RM-MEMORY-TIERING-1"); iss(1000639, "RM-CODEMODE-MCP-SURFACE-1"); iss(1000651, "RM-AISEARCH-GA-MIGRATE-1");
  iss(1000248, "CODE-LOOP-EXHAUSTED-1: ct_im100625 qnfo-research-exec/worker.js"); iss(1000585, "SECRET-CHANGE-OBSERVED: qnfo-youtube-shorts 2026-10-27");
  iss(100310, "TP-LEVER-STALLED-1: TP-1.5"); iss(100362, "TP-LEVER-STALLED-1: TP-5.12");
  const con = (cls, id, p, t, s, v) => db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, last_verdict) VALUES (?, ?, ?, ?, ?, ?)").run(cls, id, p, t, s, v);
  con("issue-1000002", 1000002, "SELECT 'FIXED' AS expected, CASE WHEN (SELECT COUNT(*) FROM notes_publish_queue) >= 1 THEN 'FIXED' ELSE 'BROKEN' END AS observed", "d1-query", "active", "fail");
  con("issue-1000678", 1000678, '{"url": "https://travel.q08.org/", "status": 200}', "runner-https", "active", "fail");
  con("issue-1000735", 1000735, "SELECT 'ok' AS expected, CASE WHEN COALESCE(SUM(status = 'error'), 0) <= 0.15 * COUNT(*) THEN 'ok' ELSE 'e' END AS observed FROM cloud_ops_events WHERE kind = 'ops_ai_tool' AND text = 'run_code_net' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')", "d1-query", "active", "fail");
  for (const [id] of [[1000619], [1000637], [1000639], [1000651]]) con("issue-" + id, id, "SELECT 'closed' AS expected, 'x' AS observed", "d1-query", "superseded", "superseded:x");
  db.prepare("INSERT INTO postmortems VALUES ('avail:travel.q08.org:a', 'first bad sample; evidence: status 401 in 5463 ms', 'client-error: the host answered with a 4xx status the SLI does not accept')").run();
  db.prepare("INSERT INTO postmortems VALUES ('avail:travel.q08.org:b', 'first bad sample; evidence: status 404 in 90 ms', 'client-error: the host answered with a 4xx status the SLI does not accept')").run();
  db.prepare("INSERT INTO postmortems VALUES ('avail:other.example:c', 'evidence: status 401 in 5400 ms', 'client-error: x')").run();
  db.prepare("INSERT INTO research_queue (id, status, stage, terminal_rearms, created_at) VALUES (?, 'deferred', NULL, ?, '2026-10-08T14:18:57Z')").run(ROW, o.rearms ?? 5);
  if (o.second) db.prepare("INSERT INTO research_queue (id, status, stage, terminal_rearms, created_at) VALUES ('zzz', 'queued', NULL, 4, '2026-10-08T14:18:57Z')").run();
  if (o.uploads !== false) {
    db.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text, status) VALUES ('2026-10-27T12:33:59Z', 'youtube.uploaded', 'qnfo-youtube-shorts', 'ok', 'ok')").run();
    db.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text, status) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes'), 'youtube.tick', 'qnfo-youtube-shorts', '{}', 'ok')").run();
  }
  return db;
}
const one = (db, q, p = []) => db.prepare(q).get(...p);
const probe = (db, cls) => one(db, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", [cls]).p;
const observed = (db, p) => String(db.prepare(p).get().observed);

const db = fresh();
db.exec(sql);

// 1000002
{
  const p = probe(db, "issue-1000002");
  ok(!/notes_publish_queue/.test(p) && !p.includes(";"), "errata probe no longer reads the notes queue, has no semicolon");
  ok(observed(db, p) === "BROKEN", "errata probe: BROKEN with no internal-open, verified action or recent move");
  db.prepare("INSERT INTO errata_queue VALUES (1, 'internal-open', '2026-10-20 00:00:00', datetime('now', '-30 minutes'))").run();
  db.prepare("INSERT INTO errata_actions VALUES (1, 'verified')").run();
  ok(observed(db, p) === "FIXED", "errata probe: FIXED with a verified action and a queue row moved in the last 3 hours");
  db.prepare("UPDATE errata_queue SET updated_at = datetime('now', '-5 hours')").run();
  ok(observed(db, p) === "BROKEN", "errata probe: BROKEN again when nothing moved for 5 hours");
  ok(one(db, "SELECT status, verify_transport t, last_verdict v FROM remediation_contracts WHERE class = 'issue-1000002'").status === "active", "errata contract stays active");
}
// 1000678
{
  const p = probe(db, "issue-1000678");
  ok(!p.includes(";") && one(db, "SELECT verify_transport t FROM remediation_contracts WHERE class = 'issue-1000678'").t === "d1-query", "travel probe is a semicolon-free d1-query");
  ok(/fewer than 12/.test(observed(db, p)), "travel probe: too few samples");
  for (let i = 0; i < 12; i++) db.prepare("INSERT INTO bp26_probe_results (run_at, subject, ok) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?), 'avail:travel.q08.org', 1)").run("-" + (i * 60 + 5) + " minutes");
  ok(observed(db, p) === "ok", "travel probe: 12 good samples read ok");
  db.prepare("INSERT INTO bp26_probe_results (run_at, subject, ok) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes'), 'avail:travel.q08.org', 0)").run();
  ok(/failed/.test(observed(db, p)), "travel probe: one failed sample in 24 h fails it");
  db.prepare("UPDATE bp26_probe_results SET ok = 1").run();
  db.prepare("INSERT INTO bp26_probe_results (run_at, subject, ok) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 hours'), 'avail:travel.q08.org', 0)").run();
  ok(observed(db, p) === "ok", "travel probe: a failure older than 24 h does not count");
  const pm = Object.fromEntries(db.prepare("SELECT incident_key k, root_cause r FROM postmortems").all().map((r) => [r.k, r.r]));
  ok(/^slow:/.test(pm["avail:travel.q08.org:a"]) && /^client-error/.test(pm["avail:travel.q08.org:b"]) && /^client-error/.test(pm["avail:other.example:c"]), "postmortem: only the accepted-but-slow travel row is reclassified", pm);
}
// 1000735
{
  const p = probe(db, "issue-1000735");
  ok(!p.includes(";"), "run_code_net probe has no semicolon");
  const ev = (status, meta) => db.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text, status, meta) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hours'), 'ops_ai_tool', 'qnfo-ops', 'run_code_net', ?, ?)").run(status, meta);
  for (let i = 0; i < 4; i++) ev("ok", "{}");
  ev("error", '{"error":"run_code_net: Unexpected token \'(\'"}');
  ok(observed(db, p) === "ok", "run_code_net: the agent's own parse error is ignored (1 of 5)");
  ev("error", '{"error":"run_code_net: sandbox crashed"}');
  ok(/unexcluded errors 1\/6/.test(observed(db, p)), "run_code_net: a server-side error still counts (1 unexcluded of 6 is 17 percent)", observed(db, p));
  ok(one(db, "SELECT COUNT(*) n FROM tool_error_exclusions WHERE pattern = 'Unexpected token' AND err_class = 'agent-input-error' AND issue_id = 1000735").n === 1, "one exclusion row");
}
// 1000619, roadmap contracts
{
  const c = one(db, "SELECT verify_probe p, verify_transport t, status s FROM remediation_contracts WHERE class = 'issue-1000619'");
  const j = JSON.parse(c.p);
  ok(c.t === "runner-https" && c.s === "active" && j.status === 200 && j.contains === "first20_no_doer" && /qnfo-lifecycle\.q08\.workers\.dev\/backlog\/sla-gap$/.test(j.url), "sla-gap contract is a runtime probe of the host route", c);
  const d = one(db, "SELECT description d FROM agent_issues WHERE id = 1000619").d;
  ok(!d.includes("code-task: repo=qnfo-workers path=qnfo-backlog-exec/worker.js") && d.includes("code-task-retired:") && (d.match(/CLUSTER-F-A 2026-10-28/g) || []).length === 1, "the FOLDED-member code task is retired in the text, one note");
  for (const [id, path, marker] of [[1000637, "docs/MEMORY-TIERING-EVAL.md", "## Result at 30 days"], [1000639, "docs/CODEMODE-EVAL.md", "## Result on 20 tasks"], [1000651, "docs/AI-SEARCH-INSTANCES.md", "## Result of the 2026-11-08 check"]]) {
    const r = one(db, "SELECT verify_probe p, verify_transport t, status s, last_verdict v FROM remediation_contracts WHERE class = ?", ["issue-" + id]);
    const k = JSON.parse(r.p);
    ok(r.t === "code-read" && r.s === "active" && r.v === null && k.paths.length === 1 && k.paths[0] === path && k.contains === marker, "roadmap contract " + id, r);
    ok((one(db, "SELECT description d FROM agent_issues WHERE id = ?", [id]).d.match(/CLUSTER-F-A 2026-10-28/g) || []).length === 1, "one note on " + id);
  }
}
// 100625 / 1000248
{
  const r = one(db, "SELECT status, stage, error FROM research_queue WHERE id = ?", [ROW]);
  ok(r.status === "wontfix" && r.stage === "parked" && /^PARKED-POISON-1: terminal_rearms 5/.test(r.error) && !r.error.startsWith("[DRAIN-"), "the over-ceiling row is parked", r);
  const t = one(db, "SELECT triage_state s, close_evidence e, owner o FROM issue_triage WHERE issue_id = 1000248");
  const a = one(db, "SELECT status, close_channel FROM agent_issues WHERE id = 1000248");
  ok(t && t.s === "closed" && t.o === "cluster-f-a" && t.e.length > 300 && a.status === "closed" && a.close_channel === "session:cluster-f-a", "1000248 closed with evidence and the session channel", { t: t && t.s, a });
  // a second row above the ceiling keeps it open
  const d2 = fresh({ second: true });
  d2.exec(sql);
  ok(one(d2, "SELECT status FROM agent_issues WHERE id = 1000248").status === "open" && !one(d2, "SELECT 1 x FROM issue_triage WHERE issue_id = 1000248"), "1000248 stays open while another row is above the ceiling");
  // a row already at or under the ceiling is not touched
  const d3 = fresh({ rearms: 2 });
  d3.exec(sql);
  ok(one(d3, "SELECT status FROM research_queue WHERE id = ?", [ROW]).status === "deferred", "a row at the ceiling is not parked");
}
// 1000585
{
  const a = one(db, "SELECT status, close_channel c FROM agent_issues WHERE id = 1000585");
  ok(a.status === "closed" && a.c === "session:cluster-f-a" && /YT_RUN_TOKEN: a POST \/run with a wrong x-run-token answered 401/.test(one(db, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 1000585").e), "1000585 closed on the consumer evidence");
  const d2 = fresh({ uploads: false });
  d2.exec(sql);
  ok(one(d2, "SELECT status FROM agent_issues WHERE id = 1000585").status === "open", "1000585 stays open without an upload after the change");
  const d3 = fresh();
  d3.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text, status) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-20 minutes'), 'youtube.stage_error', 'qnfo-youtube-shorts', 'oauth refresh 400: invalid_grant', 'error')").run();
  d3.exec(sql);
  ok(one(d3, "SELECT status FROM agent_issues WHERE id = 1000585").status === "open", "1000585 stays open when an oauth refresh error is in the last day");
}
// 100310, 100362
{
  const d = one(db, "SELECT description d FROM agent_issues WHERE id = 100310").d;
  ok(/\ncode-task: repo=qnfo-workers path=scripts\/code-task-publish\.py\ncode-anchor: def standards_check\(repo_dir, files, base\):$/.test(d), "100310 carries a code-task and an anchor on lines of their own");
  ok((one(db, "SELECT description d FROM agent_issues WHERE id = 100362").d.match(/CLUSTER-F-A 2026-10-28/g) || []).length === 1, "100362 note once");
}
// replay
{
  const before = db.prepare("SELECT id, description FROM agent_issues ORDER BY id").all().map((r) => r.description).join("|");
  db.exec(sql);
  const after = db.prepare("SELECT id, description FROM agent_issues ORDER BY id").all().map((r) => r.description).join("|");
  ok(before === after, "a replay appends nothing");
  ok(one(db, "SELECT COUNT(*) n FROM tool_error_exclusions").n === 1, "a replay adds no second exclusion");
}
// rollback
{
  const rb = hdr.find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; the tool_error_exclusions row")[0];
  const d = fresh();
  const snap = (x) => JSON.stringify([x.prepare("SELECT class, verify_probe, verify_transport, status, last_verdict FROM remediation_contracts ORDER BY class").all(), x.prepare("SELECT id, description FROM agent_issues WHERE id NOT IN (1000248, 1000585) ORDER BY id").all(), x.prepare("SELECT * FROM postmortems ORDER BY incident_key").all(), x.prepare("SELECT status, stage, error FROM research_queue WHERE id = ?").all(ROW)]);
  const s0 = snap(d);
  d.exec(sql);
  ok(snap(d) !== s0, "the file changes the shapes");
  d.exec(rb);
  ok(snap(d) === s0, "the Rollback line restores contracts, descriptions, postmortems and the research row");
  ok(one(d, "SELECT status FROM agent_issues WHERE id = 1000585").status === "open" && one(d, "SELECT status FROM agent_issues WHERE id = 1000248").status === "open", "the Rollback line reopens 1000585 and 1000248");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
