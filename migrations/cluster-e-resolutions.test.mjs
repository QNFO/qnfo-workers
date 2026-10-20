// CLUSTER-E-RESOLUTIONS-1 offline suite: replays migrations/2026-10-20-cluster-e-resolutions.sql on SQLite.
// Proves: (1) issue 2993: a closed issue of each legacy no-mapped-work project is mapped to it, only when the issue is closed or resolved,
// the project exists and the issue has no map row yet (an existing mapping is never moved); the second apply changes nothing;
// (2) issue 2930: the replacement probe answers 1 when every check holds on the last full day and 0 when any one fails (glm error share,
// gpt-oss share, an unreadable revise-noop inside 24 h, fewer than 5 published, cost per published paper at or above 10-17's, a
// deepseek empty reply), the old probe is kept in cluster_e_probe_backup, and a probe that is already replaced is left alone;
// (3) every note is appended once to its issue and only to an issue that exists; the 2047 note carries the code-task and code-anchor
// lines each on a line of its own; the decision_log row is written once; (4) the Rollback line restores what the file changed.
// Run: node migrations/cluster-e-resolutions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-20-cluster-e-resolutions.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

function fresh() {
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT);
    CREATE TABLE projects (project_code TEXT PRIMARY KEY, status TEXT, completed_at TEXT);
    CREATE TABLE issue_project_map (issue_id INTEGER PRIMARY KEY, project_code TEXT NOT NULL, program_code TEXT NOT NULL, kind TEXT NOT NULL, synced_milestone INTEGER, synced_labels TEXT, gh_node TEXT, gh_item TEXT, updated_at TEXT, synced_at TEXT);
    CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, last_verdict TEXT, attempts INTEGER, next_due_at TEXT);
    CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
    CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER, errors INTEGER);
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT);
    CREATE TABLE research_queue (id TEXT PRIMARY KEY, published_at TEXT);
    CREATE TABLE cost_daily (date TEXT, source TEXT, usd REAL);
    CREATE TABLE code_tasks (id TEXT PRIMARY KEY, last_error TEXT, updated_at TEXT);`);
  return d;
}
const OLD_PROBE = "SELECT '1' AS expected, CASE WHEN COALESCE((SELECT usd FROM cost_daily WHERE source = 'workers_ai' AND date = date('now', '-1 day')), 999) < 15.33 AND date('now') >= '2026-10-21' THEN '1' ELSE '0' END AS observed";
const d = fresh();
for (const [id, st] of [[2324, "closed"], [100275, "closed"], [428, "resolved"], [2448, "closed"], [2409, "open"], [2414, "closed"]]) d.prepare("INSERT INTO agent_issues VALUES (?, ?, 'body', ?)").run(id, "T-" + id, st);
for (const p of ["QNFO.OPS.AUDT", "QNFO.OPS.HAND", "QNFO.OPS.SKIL", "QNFO.RSCH.KGPH", "QNFO.RSCH.LITS", "QNFO.RSCH.PAPER"]) d.prepare("INSERT INTO projects VALUES (?, 'active', NULL)").run(p);
d.prepare("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (2448, 'W.qnfo-graph', 'QNFO.OPS', 'fix')").run(); // already mapped elsewhere
for (const id of [2323, 2957, 2446, 2852, 2562, 2679, 2930, 2993, 100120, 100294, 2346, 1838, 2047, 2215, 2573, 2393, 2961, 100045, 2522]) d.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, 'open')").run(id, "T-" + id, "original text of " + id);
d.prepare("INSERT INTO remediation_contracts VALUES ('issue-2930', 2930, ?, 'fail', 7, '2030-01-01 00:00:00')").run(OLD_PROBE);
d.exec(sql);

// 1. mapping
const map = Object.fromEntries(d.prepare("SELECT issue_id, project_code, program_code, kind FROM issue_project_map").all().map((r) => [r.issue_id, r]));
ok(map[2324] && map[2324].project_code === "QNFO.OPS.AUDT" && map[2324].program_code === "QNFO.OPS", "2324 maps to QNFO.OPS.AUDT", map[2324]);
ok(map[100275] && map[100275].project_code === "QNFO.OPS.HAND", "100275 maps to QNFO.OPS.HAND");
ok(map[428] && map[428].project_code === "QNFO.OPS.SKIL", "a resolved issue maps (428 to QNFO.OPS.SKIL)");
ok(map[2414] && map[2414].project_code === "QNFO.RSCH.PAPER" && map[2414].kind === "enhancement", "2414 maps to QNFO.RSCH.PAPER");
ok(!map[2409], "an open issue is never mapped as finished work (2409 stays unmapped)");
ok(map[2448] && map[2448].project_code === "W.qnfo-graph", "an existing mapping is never moved (2448 stays on W.qnfo-graph)", map[2448]);
ok(d.prepare("SELECT COUNT(*) n FROM issue_project_map").get().n === 5, "five rows in the map after apply: the four new ones and the one that was already mapped", d.prepare("SELECT COUNT(*) n FROM issue_project_map").get().n);

// 2. probe
const probe = () => d.prepare("SELECT verify_probe, last_verdict, attempts FROM remediation_contracts WHERE class = 'issue-2930'").get();
const bak = d.prepare("SELECT old_probe FROM cluster_e_probe_backup WHERE class = 'issue-2930'").get();
ok(bak && bak.old_probe === OLD_PROBE, "the old probe is kept in cluster_e_probe_backup");
ok(probe().verify_probe !== OLD_PROBE && probe().last_verdict === null && probe().attempts === 0, "the probe is replaced and its verdict and attempts reset", probe().last_verdict);
const yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const nowIso = (h) => new Date(Date.now() - h * 36e5).toISOString().slice(0, 19) + "Z";
function scenario(over) {
  d.exec("DELETE FROM ai_call_counters; DELETE FROM cloud_ops_events; DELETE FROM research_queue; DELETE FROM cost_daily; DELETE FROM code_tasks");
  const o = Object.assign({ glm: [1266, 8], oss: [5103, 4], unreadable: 0, published: 71, usd: 55.3, empty: 0 }, over || {});
  d.prepare("INSERT INTO ai_call_counters VALUES (?, 'qnfo-research-exec', 'x', '@cf/zai-org/glm-5.3-flash', ?, ?)").run(yday, o.glm[0], o.glm[1]);
  d.prepare("INSERT INTO ai_call_counters VALUES (?, 'qnfo-research-exec', 'x', '@cf/openai/gpt-oss-120b', ?, ?)").run(yday, o.oss[0], o.oss[1]);
  for (let i = 0; i < o.unreadable; i++) d.prepare("INSERT INTO cloud_ops_events VALUES (?, ?, 'revise-noop', 'row=1 no applicable patch edit; the review output was unreadable, rev')").run("u" + i, nowIso(3));
  d.prepare("INSERT INTO cloud_ops_events VALUES ('other', ?, 'revise-noop', 'row=2 no applicable patch edit (fixes=0)')").run(nowIso(1));
  for (let i = 0; i < o.published; i++) d.prepare("INSERT INTO research_queue VALUES (?, ?)").run("r" + i, yday + "T10:00:00Z");
  d.prepare("INSERT INTO cost_daily VALUES (?, 'workers_ai', ?)").run(yday, o.usd);
  for (let i = 0; i < o.empty; i++) d.prepare("INSERT INTO code_tasks VALUES (?, 'deepseek-v4-flash: reply was empty', '2026-10-19T00:00:00Z')").run("c" + i);
  d.prepare("INSERT INTO code_tasks VALUES ('old', 'deepseek-v4-flash: reply was empty', '2026-10-17T00:00:00Z')").run(); // before the fix: ignored
  return d.prepare(probe().verify_probe).get();
}
let r = scenario();
ok(r && r.expected === "1" && r.observed === "1", "all checks hold: the probe answers 1 (cost 0.78 per paper against 1.70)", r);
ok(scenario({ glm: [100, 54] }).observed === "0", "a glm-5.3-flash error share of 0.54 fails");
ok(scenario({ oss: [100, 20] }).observed === "0", "a gpt-oss-120b error share of 0.20 fails");
ok(scenario({ unreadable: 1 }).observed === "0", "one unreadable revise-noop in the last 24 h fails");
ok(scenario({ published: 4, usd: 3 }).observed === "0", "fewer than 5 published fails");
ok(scenario({ usd: 130 }).observed === "0", "130 USD for 71 papers (1.83 each, above 1.70) fails");
ok(scenario({ published: 9, usd: 15.3328 }).observed === "0", "10-17's own figures (15.3328 for 9) do not pass: the cost per paper must be below that baseline");
ok(scenario({ empty: 1 }).observed === "0", "a deepseek-v4-flash empty reply after 10-18T09:00Z fails; the one before it is ignored");
d.exec("DELETE FROM ai_call_counters"); ok(d.prepare(probe().verify_probe).get().observed === "0", "no counters at all answers 0, never 1");

// 3. notes, once; decision_log once
const desc = (id) => d.prepare("SELECT description FROM agent_issues WHERE id = ?").get(id).description;
for (const id of [2323, 2957, 2446, 2852, 2562, 2679, 2930, 2993, 100120, 100294, 2346, 1838, 2047, 2215, 2573, 2393, 2961, 100045, 2522])
  ok(desc(id).startsWith("original text of " + id) && desc(id).split("CLUSTER-E 2026-10-20").length === 2, "note appended once to " + id);
ok(/\ncode-task: repo=qnfo-workers path=qnfo-cloud-ops\/worker\.js\n/.test(desc(2047)), "2047 carries code-task on a line of its own");
ok(/\ncode-anchor: const rs = await env\.AUDIT\.prepare\("SELECT idea FROM idea_proposals WHERE decision = 'ACCEPT'/.test(desc(2047)) && desc(2047).trimEnd().endsWith(".all();"), "2047 carries the verbatim anchor as its last line");
ok(!/code-task:/.test(desc(2323) + desc(2957) + desc(2852) + desc(2573)), "no other note carries a code-task line");
ok(desc(2852).includes("qnfo-github-steward 0.7.4") && desc(2573).includes("radar-hub 1.5.0"), "the notes name the versions that carry the fixes");
ok(d.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'CLUSTER-E-RESOLUTIONS-1:%'").get().n === 1, "one decision_log row");

// second apply changes nothing
const before = JSON.stringify([d.prepare("SELECT * FROM issue_project_map ORDER BY issue_id").all(), d.prepare("SELECT * FROM agent_issues ORDER BY id").all(), probe(), d.prepare("SELECT COUNT(*) n FROM decision_log").get(), d.prepare("SELECT * FROM cluster_e_probe_backup").all()]);
d.exec(sql);
const after = JSON.stringify([d.prepare("SELECT * FROM issue_project_map ORDER BY issue_id").all(), d.prepare("SELECT * FROM agent_issues ORDER BY id").all(), probe(), d.prepare("SELECT COUNT(*) n FROM decision_log").get(), d.prepare("SELECT * FROM cluster_e_probe_backup").all()]);
ok(before === after, "a second apply changes nothing");

// 4. the Rollback line restores what the file changed
const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback:")).slice("-- Rollback:".length).trim();
d.exec(rb);
ok(d.prepare("SELECT COUNT(*) n FROM issue_project_map WHERE issue_id IN (2324, 100275, 428, 2414)").get().n === 0, "rollback removes the four mappings");
ok(d.prepare("SELECT project_code FROM issue_project_map WHERE issue_id = 2448").get().project_code === "W.qnfo-graph", "rollback leaves the mapping the file did not make");
ok(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2930'").get().verify_probe === OLD_PROBE, "rollback restores the old probe");
ok(d.prepare("SELECT description FROM agent_issues WHERE id = 2323").get().description === "original text of 2323", "rollback removes the appended notes");
ok(d.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 0, "rollback removes the decision row");
ok(!d.prepare("SELECT name FROM sqlite_master WHERE name = 'cluster_e_probe_backup'").get(), "rollback drops the backup table");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
