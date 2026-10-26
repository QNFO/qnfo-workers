// REM-A7-Q08-3 offline suite: replays migrations/2026-10-26-rem-a7-q08-3.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs.
// Proves: the header opts in; four failure_modes rows and four fm- detector contracts are inserted once (module failure-mode, no semicolon in a d1 probe, code-read probes are valid JSON and
// match the committed worker); the d1 detector reads 0 on a clean q08-signal fixture and 1 after a run ends at a removed check; the engine-side build is filed once as an open issue with a
// code-task line, a code-anchor that occurs exactly once in the worker, a code-probe line and the decided fetch scope; the 1000268 triage text names it; one decision_log row; a replay changes
// nothing; the Rollback header supersedes the four contracts; nothing is deleted.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-q08-3.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-q08-3.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const worker = readFileSync(here("../q08-signal-engine/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "nothing is deleted or dropped");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");
ok(!/^\s*(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+"?(decision_log|issue_lifecycle)\b/im.test(body), "decision_log and issue_lifecycle are only inserted into");
ok((body.match(/INSERT INTO decision_log/g) || []).length === 1, "exactly one decision_log insert");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (1000268, 'Q08-FORECAST-RESEARCH-1: forecast mode', 'original', 'claude-session', 'reach', 'high', 'open', 1, 1)").run();
  w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation) VALUES (1000268, 'AUTOTRIAGE-1', 'triaged', 'q08-signal-engine', '2026-10-01', 'REM-A7-Q08-1 note.')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const snap = (w) => JSON.stringify(["agent_issues", "issue_triage", "remediation_contracts", "failure_modes", "decision_log"].map((t) => w.prepare("SELECT * FROM " + t + " ORDER BY 1").all()));
const FM = ["q08-ground-blind-gate-ban", "q08-arxiv-lane-blocked-by-thin", "q08-dotted-name-refused", "q08-uncalled-preflight"];

{
  const w = world();
  w.exec(sql);
  ok(w.prepare("SELECT fm_key FROM failure_modes ORDER BY fm_key").all().map((r) => r.fm_key).join() === FM.slice().sort().join(), "four failure_modes rows", w.prepare("SELECT fm_key FROM failure_modes").all());
  const fms = w.prepare("SELECT * FROM failure_modes").all();
  ok(fms.every((r) => r.failure_mode && r.root_cause && r.remediation && r.detector && r.probe_class === "fm-" + r.fm_key && r.first_seen === "2026-10-26"), "each row carries a failure mode, root cause, remediation, detector and its probe class");
  const cs = w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all();
  ok(cs.length === 4 && cs.every((c) => c.module === "failure-mode" && c.status === "active" && c.issue_id === null && c.action === "failure-mode detector" && FM.map((k) => "fm-" + k).includes(c.class)), "four active failure-mode detector contracts with no issue id", cs.map((c) => c.class));
  const d1 = cs.find((c) => c.verify_transport === "d1-query@q08-signal");
  ok(d1 && d1.class === "fm-q08-ground-blind-gate-ban" && !/;/.test(d1.verify_probe) && !/\b(update|delete|insert)\s/i.test(d1.verify_probe), "the d1 detector is on the q08-signal transport, with no semicolon (the live trigger rewrites one) and no write keyword");
  const codes = cs.filter((c) => c.verify_transport === "code-read");
  ok(codes.length === 3 && codes.every((c) => { try { const j = JSON.parse(c.verify_probe); return Array.isArray(j.paths) && j.paths[0] === "q08-signal-engine/worker.js" && (typeof j.contains === "string" || typeof j.absent === "string"); } catch (e) { return false; } }), "the three code-read probes are valid JSON on q08-signal-engine/worker.js");
  ok(codes.every((c) => { const j = JSON.parse(c.verify_probe); return j.contains ? worker.includes(j.contains) && !/;/.test(j.contains) : !worker.includes(j.absent); }), "each code-read probe passes on the committed worker (and none has a semicolon)", codes.map((c) => c.verify_probe));

  // the d1 detector against a q08-signal-shaped database
  const q = (rows) => { const d = new DatabaseSync(":memory:"); d.exec("CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT, status TEXT, error TEXT)"); rows.forEach(([t, s, e]) => d.prepare("INSERT INTO engine_runs (ran_at, status, error) VALUES (?, ?, ?)").run(t, s, e)); return d; };
  const run = (d) => d.prepare(d1.verify_probe).get();
  const clean = q([["2026-10-26 19:30:00", "gate_failed", "accuracy: name not in the source: X"], ["2026-10-26 18:00:00", "gate_failed", "large currency amount(s) $1,249 - likely fabricated"]]);
  ok(run(clean).expected === "0" && run(clean).observed === "0", "a run that ended at a removed check BEFORE the fix is not counted: observed 0", run(clean));
  const bad1 = q([["2026-10-26 19:40:00", "gate_failed", "large currency amount(s) $2,484,599, $195,869 - likely fabricated"]]);
  const bad2 = q([["2026-10-27 01:00:00", "gate_failed", "invented decimal metric - no fabricated scores"]]);
  ok(run(bad1).observed === "1" && run(bad2).observed === "1", "a run that ends at either removed check after the fix is counted: observed 1", [run(bad1), run(bad2)]);
  ok(run(q([["2026-10-26 19:40:00", "ok", null]])).observed === "0", "an ok run is not counted");

  const iss = w.prepare("SELECT * FROM agent_issues WHERE title LIKE 'Q08-FORECAST-LEDGER-1:%'").all();
  ok(iss.length === 1 && iss[0].status === "open" && iss[0].source === "session" && iss[0].priority === "high", "the engine-side build is filed once as an open issue from a session source", iss.map((i) => i.title));
  const d = iss[0].description;
  const lines = d.split("\n");
  ok(lines.includes("code-task: repo=qnfo-workers path=q08-signal-engine/worker.js") && lines.some((l) => l.startsWith("code-anchor: ")) && lines.some((l) => /^code-probe: \{"paths": \["q08-signal-engine\/worker\.js"\], "contains": "function researchLedger\("\}$/.test(l)), "it carries a code-task line, a code-anchor and a code-probe, each on a line of its own");
  const anchor = lines.find((l) => l.startsWith("code-anchor: ")).slice("code-anchor: ".length);
  ok(worker.split(anchor).length - 1 === 1, "the code-anchor occurs exactly once in the committed worker", anchor);
  ok(/FETCH SCOPE/.test(d) && /at most 10 documents/.test(d) && /40000 characters/.test(d) && /verbatim sentences of 25 to 280 characters/.test(d) && /q08_forecast_ledger/.test(d) && /absent or anything else = off/.test(d) && /ground_json/.test(d) && /DEFINITION OF DONE/.test(d) && /1000268/.test(d), "it states the decided fetch scope, the ledger rule, the default-off switch and the definition of done");
  ok(/Q08-FORECAST-LEDGER-1/.test(q1(w, "SELECT remediation r FROM issue_triage WHERE issue_id = 1000268").r) && q1(w, "SELECT remediation r FROM issue_triage WHERE issue_id = 1000268").r.startsWith("REM-A7-Q08-1 note."), "1000268's triage text keeps its note and names the new issue");
  const dl = w.prepare("SELECT * FROM decision_log").all();
  ok(dl.length === 1 && dl[0].actor === "rem-a7-f2" && /^REM-A7-Q08-3:/.test(dl[0].action), "one decision_log row", dl);
  const s_1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s_1, "a replay changes nothing");
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(w.prepare("SELECT status FROM remediation_contracts").all().every((r) => r.status === "superseded") && w.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 4 && w.prepare("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'Q08-FORECAST-LEDGER-1:%'").get().n === 1, "Rollback supersedes the four contracts and keeps the history");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
