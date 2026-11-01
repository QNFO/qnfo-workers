// REM-A5-METRIC-TRIGGERS-1 offline suite: replays migrations/2026-10-26-rem-a5-metric-triggers.sql on node:sqlite against a fixture with the live layout.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped, decision_log only inserted into); the three ACT-BRIDGE-1 triggers (388, 1867,
// 10931) end in a code-task line and a code-anchor line that the repository's own readers accept (the anchor occurs exactly once in its file on this checkout, the worker is one the code loop
// may change, the lever sentence sits inside the 300 characters of prose that qnfo-fleet-control triggerIssueDescription keeps, no new text trips the orchestrator's PLAN_DENY_TEXT), the old action
// text and the Pillar header are kept, and the live breach_code_task_pct SQL moves from 6 of 64 to 9 of 64; the four blocker verdicts clear exactly their four rows from the live v_blocker_claims
// text, are written only when the ticket text is the one that was read, and leave an unrelated claim counted; the notes land once on the listed tickets and on no other (the four verdict tickets
// keep their text, because the verdict is tied to it); the seven decision rows parse into decision_predictions with the metric, operator, value and deadline they state; a replay changes nothing;
// the Rollback line puts every row back.
// Output MUST contain "0 failed" on success.   node migrations/rem-a5-metric-triggers.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rd = (rel) => readFileSync(new URL(rel, root), "utf8");
const sql = rd("migrations/2026-10-26-rem-a5-metric-triggers.sql");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };
const countOf = (text, needle) => { let n = 0, i = 0; while ((i = text.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "the body deletes and drops nothing (no BACKUP header needed)");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai or anthropic.com link");
ok(Array.from(body.matchAll(/LIKE\s+'((?:[^']|'')*)'/gi)).every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes (D1 limit)");
ok(!/(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9]{16,})/.test(sql), "no secret value in the file");

// ---- what the repository says (read from the sources, as migrations/code-anchor-once.test.mjs does)
const fc = rd("qnfo-fleet-control/worker.js");
const a0 = fc.indexOf("var ACT_BRIDGE_MARK = "), a1 = fc.indexOf("// TRIGGER-DISPATCH-1", a0);
if (a0 < 0 || a1 < 0) throw new Error("ACT_BRIDGE_MARK / triggerIssueDescription not found in qnfo-fleet-control/worker.js");
const bridge = new Function(fc.slice(a0, a1) + "; return { MARK: ACT_BRIDGE_MARK, desc: triggerIssueDescription };")();
const orch = rd("qnfo-code-orchestrator/worker.js");
const orchConst = (name, re) => { const m = re.exec(orch); if (!m) throw new Error("qnfo-code-orchestrator/worker.js: " + name + " not found in the expected shape"); return m[1]; };
const denyText = new Function("return " + orchConst("PLAN_DENY_TEXT", /const PLAN_DENY_TEXT = (\/.*\/[a-z]*);/))();
const controlPlane = JSON.parse(orchConst("PLAN_CONTROL_PLANE", /const PLAN_CONTROL_PLANE = (\[[^\]]*\]);/));
const canaried = JSON.parse(orchConst("PLAN_LOOP_CANARIED", /const PLAN_LOOP_CANARIED = (\[[^\]]*\]);/));
const denyWorkers = controlPlane.filter((w) => canaried.indexOf(w) < 0);
const pairOf = (action) => {
  const marks = String(action || "").match(bridge.MARK) || [];
  const t = marks.filter((l) => /code-task:/.test(l))[0], an = marks.filter((l) => /code-anchor:/.test(l))[0];
  if (!t || !an) return null;
  return { path: (/path=(\S+)/.exec(t) || [])[1], anchor: an.replace(/^\s*code-anchor:[ \t]*/, "").replace(/[ \t]+$/, "") };
};
// BREACH-CODE-ANCHORS-1: the live anchor is the LAST writer's (migrations/code-anchor-once.test.mjs reads it the same way). A worker change may rewrite an anchored line
// (10931: REVISE-NOOP-BOUND-1, pull request 5500) and its author repoints the anchor in a later migration, so this file's "occurs exactly once" check must see the repointed
// anchor, not the 2026-10-26 one. The later statements of the form UPDATE analytics_metric_triggers SET action = replace(action, char(10) || 'code-anchor: OLD', ... 'NEW') WHERE id = N
// are replayed in file order on a one-row copy; a row no statement names is returned unchanged.
const REPOINT = /^UPDATE analytics_metric_triggers SET action = replace\(action, char\(10\) \|\| 'code-anchor: (?:[^']|'')*', char\(10\) \|\| 'code-anchor: (?:[^']|'')*'\) WHERE id = \d+(?: AND metric_key = '[^']*')?;[ \t]*$/gm;
const LATER = readdirSync(new URL("migrations/", root)).filter((n) => /^\d{4}-\d{2}-\d{2}.*\.sql$/.test(n) && n > "2026-10-26-rem-a5-metric-triggers.sql").sort();
const effectiveAction = (id, metricKey, action) => {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, action TEXT)");
  d.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, action) VALUES (?, ?, ?)").run(id, metricKey, action);
  for (const f of LATER) for (const m of rd("migrations/" + f).matchAll(REPOINT)) d.exec(m[0]);
  const out = d.prepare("SELECT action FROM analytics_metric_triggers WHERE id = ?").get(id).action;
  d.close();
  return out;
};

// ---- the live rows this file touches (read 2026-10-26 from qnfo-audit)
const ORIG = {
  388: "Read https://qnfo-fleet-control.q08.workers.dev/improvement (relapses). Each METRIC-FIX-RELAPSED-1 issue names the closed issue whose remediation did not hold: replace that remediation with a structural fix, not a re-run, and add a remediation_contracts probe that would have caught the relapse. Close when metric_registry.fix_hold_rate_30d >= 0.8.",
  1867: "Pillar reach (ATTENTION-LOOP-1, guard). Two or more social channels read STOP (share 0) at once: the evidence says the content, format or timing draws no human attention anywhere, so promoting better comes before stopping more. Read the attention_decisions rows for each stop (evidence and prediction), the learner's posterior (GET https://qnfo-social.q08.workers.dev/learner) and the noticed items (GET https://fleet.qnfo.org/api/attention). Levers: a different format or hook on the noticed items, the re-test (28 days, automatic), or ops_config attention_thresholds (JSON: min_items, stop_items, stop_per_item, improve_per_item, promote_per_item) with the reason recorded on this issue; never raise an owner cap. Definition of done: attention_channels_stopped <= 1; record before and after in issue_triage.close_evidence.",
  10931: "Pillar cost. Unit cost of a publication rose: read cloud_ops_events kinds revise-noop, revise-shrink-refused, rerun-route and the review cycle counts for qnfo-research-exec (7 days); a paid call that produces no edit is the usual cause. Never lower a review, verify or claim gate. Done when research_neurons_per_publication_7d <= 20000 for 3 days.",
};
const KEYS = { 388: "fix_hold_rate_30d", 1867: "attention_channels_stopped", 10931: "research_neurons_per_publication_7d" };
const NOTES = { 388: "seeded by IMPROVEMENT-LOOP-1", 1867: "ATTENTION-LOOP-1 guard (migrations/2026-10-06-attention-loop.sql)", 10931: "COST-SUSTAIN-3 2026-10-21" };
const HANDED_ALREADY = [9, 537, 786, 5394, 9263, 14426]; // the six breaching triggers that carried a code-task line at 18:42Z
const NOTED = [2670, 2861, 2875, 3001, 99909, 99926, 99927, 99936, 99940, 100084, 100122];
const VERDICT = { 1798: [82, 3405], 2455: [130, 5480], 99934: [105, 1131], 99948: [98, 2775] };
const textOf = (id, extra = "") => "x".repeat((VERDICT[id] ? VERDICT[id][1] : 200) - extra.length) + extra; // exactly the length that was read, keyword included
const titleOf = (id) => "T".repeat(VERDICT[id] ? VERDICT[id][0] : 50);

// the live view text (sqlite_master, 2026-10-26), unchanged
const V_BLOCKER_CLAIMS = `CREATE VIEW v_blocker_claims AS
SELECT 'issue:' || a.id AS target, a.title AS text, a.created_at AS created_ms FROM agent_issues a
WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 3600) * 1000
  AND (lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner only%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner-only%'
    OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs a token%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%no token%'
    OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs the owner%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%cannot be done%'
    OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%blocked%' OR lower(COALESCE(a.description, '')) LIKE '%session-task:%')
  AND a.title NOT LIKE 'METRIC-TRIGGER-%UNVERIFIED-BLOCKER-CLAIMS%'
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:' || a.id
    AND (r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
      OR (r.verdict IN ('false-belief-removed', 'workaround-built') AND r.text_sig IS NOT NULL
          AND r.text_sig = CAST(length(a.title) AS TEXT) || ':' || CAST(length(COALESCE(a.description, '')) AS TEXT))))
UNION ALL
SELECT 'card:' || h.id, h.title, CAST(strftime('%s', h.created_at) AS INTEGER) * 1000 FROM human_actions h
WHERE h.status = 'open' AND datetime(h.created_at) < datetime('now', '-60 minutes')
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'card:' || h.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))`;
// the live parser trigger, read from its migration so the fixture cannot drift from it
const calib = rd("migrations/2026-10-12-22-calibration-scorer.sql");
const pt0 = calib.indexOf("CREATE TRIGGER IF NOT EXISTS decision_predictions_parse"), pt1 = calib.indexOf("\nEND;", pt0) + 5;
const PARSE_TRIGGER = calib.slice(pt0, pt1);
ok(pt0 > 0 && /decision_predictions_parse/.test(PARSE_TRIGGER), "the fixture reads the live decision_predictions_parse trigger from its migration");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE trigger_hit (id INTEGER PRIMARY KEY, hit INTEGER);
CREATE VIEW v_metric_trigger_state AS SELECT t.id AS id, t.metric_key AS metric_key, h.hit AS hit FROM analytics_metric_triggers t JOIN trigger_hit h ON h.id = t.id WHERE t.enabled = 1;
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE blocker_redteam (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, claim TEXT, attempt TEXT NOT NULL, verdict TEXT NOT NULL CHECK (verdict IN ('false-belief-removed', 'confirmed-with-evidence', 'workaround-built')), evidence TEXT NOT NULL, actor TEXT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), text_sig TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TABLE decision_predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, decision_id INTEGER NOT NULL, kind TEXT NOT NULL, subject TEXT NOT NULL, op TEXT NOT NULL, value REAL, value2 REAL, due_at TEXT NOT NULL, origin TEXT NOT NULL, scored_at TEXT, UNIQUE (decision_id, kind, subject, op));`);
  w.exec(V_BLOCKER_CLAIMS);
  w.exec(PARSE_TRIGGER);
  for (const m of ["breach_code_task_pct", "unverified_blocker_claims", "tick_sequence_completion_24h", "tick_completion_24h", "tick_slot_coverage_24h", "false_stops_7d", "workers_ai_run_rate_usd", "guard_rcs", "ops_agent_empty_answers_7d"]) w.prepare("INSERT INTO metric_registry (metric, last_value) VALUES (?, '0')").run(m);
  const ins = w.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, action, notes, enabled) VALUES (?, ?, ?, ?, 1)");
  const hit = w.prepare("INSERT INTO trigger_hit (id, hit) VALUES (?, 1)");
  for (const id of [388, 1867, 10931]) { ins.run(id, KEYS[id], ORIG[id], NOTES[id]); hit.run(id); }
  for (const id of HANDED_ALREADY) { ins.run(id, "m_" + id, "Pillar x. something\ncode-task: repo=qnfo-workers path=qnfo-ops/worker.js", null); hit.run(id); }
  for (let i = 0; i < 55; i++) { const id = 20000 + i; ins.run(id, "n_" + id, "Pillar x. prose only with code-task: mentioned mid-sentence", null); hit.run(id); } // 64 breaching in all
  const iss = w.prepare("INSERT INTO agent_issues (id, title, description, status, created_at) VALUES (?, ?, ?, 'open', ?)");
  const old = (Date.now() - 86400000);
  for (const id of [1798, 2455, 99934, 99948]) iss.run(id, titleOf(id), textOf(id, " blocked"), old);
  for (const id of NOTED) iss.run(id, id === 3001 ? "METRIC-TRIGGER-3061-UNVERIFIED-BLOCKER-CLAIMS: Red team" : "TICKET " + id, "original text of " + id, old);
  iss.run(777, "UNRELATED", "this one is owner-only for real", old);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const pct = (w) => { const r = q1(w, "SELECT COUNT(*) n, SUM(CASE WHEN instr(t.action, char(10) || 'code-task:') > 0 OR t.action LIKE 'code-task:%' THEN 1 ELSE 0 END) h FROM v_metric_trigger_state s JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1"); return { n: r.n, h: r.h, pct: Math.round(1000 * r.h / r.n) / 10 }; };

const w = world();
const before = pct(w);
ok(before.n === 64 && before.h === 6 && before.pct === 9.4, "fixture: 6 of 64 breaching triggers carry a code-task line (9.4, as read at 18:42Z)", before);
const blockedBefore = qa(w, "SELECT target FROM v_blocker_claims ORDER BY target").map((r) => r.target);
ok(blockedBefore.join() === "issue:1798,issue:2455,issue:777,issue:99934,issue:99948", "fixture: v_blocker_claims lists the four tickets and one unrelated claim", blockedBefore);
const snapIssues = JSON.stringify(qa(w, "SELECT id, description FROM agent_issues ORDER BY id"));
w.exec(sql);

// ---- 1. ACT-BRIDGE-1
for (const id of [388, 1867, 10931]) {
  const a = q1(w, "SELECT action, notes FROM analytics_metric_triggers WHERE id = ?", id);
  const p = pairOf(a.action);
  ok(!!p, id + ": the action ends in a code-task line and a code-anchor line the repository's reader parses", a.action.slice(-260));
  ok(a.action.includes(ORIG[id].replace(/^Pillar [^.]*\. /, "").slice(0, 60)) || a.action.includes(ORIG[id].slice(40, 120)), id + ": the old action text is kept");
  ok(/REM-A5-METRIC-TRIGGERS-1 2026-10-26/.test(a.notes) && a.notes.startsWith(NOTES[id]), id + ": the note is appended to the old note");
  const file = p && p.path ? rd(p.path) : "";
  const pe = pairOf(effectiveAction(id, KEYS[id], a.action));
  ok(!!p && !!pe && pe.path === p.path && countOf(file, pe.anchor) === 1, id + ": the effective anchor (after any later repoint) occurs exactly once in " + (p && p.path), pe && { path: p.path, n: countOf(file, pe.anchor), anchor: pe.anchor.slice(0, 100) });
  ok(!!p && /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/.test(p.path) && p.anchor.length > 0 && p.anchor.length <= 300 && !/^\s|\s$/.test(p.anchor), id + ": the path is a repository file and the anchor one trimmed line of at most 300 characters");
  ok(!!p && denyWorkers.indexOf(p.path.split("/")[0]) < 0 && /^[a-z0-9][a-z0-9-]*\/worker\.js$/.test(p.path), id + ": the worker is one the code loop may change (not in PLAN_DENY_WORKERS)", denyWorkers);
  const issueText = bridge.desc("METRIC-TRIGGER #" + id + " " + KEYS[id] + "=1 gt 0 -> ", a.action, " (owner x, target agent_issues)");
  ok(issueText.includes("Lever: in ") && issueText.indexOf("Lever: in ") < 340, id + ": the lever sentence is inside the prose the filed issue keeps", issueText.slice(0, 420));
  const lever = /Lever: in [^\n]*?(?:issue \d+\)\.|ct_[a-z0-9]+\)\.)/.exec(issueText);
  ok(!!lever, id + ": the whole lever sentence survives the 300 character cut", issueText.slice(0, 420));
  ok(issueText.endsWith("\ncode-task: repo=qnfo-workers path=" + p.path + "\ncode-anchor: " + p.anchor), id + ": the filed issue carries the code-task and code-anchor lines", issueText.slice(-220));
  const added = a.action.replace(ORIG[id], "");
  ok(!denyText.test(added) && !denyText.test(a.action.slice(0, 700)), id + ": no new text trips PLAN_DENY_TEXT", { re: String(denyText).slice(0, 120) });
  const pillarRe = /^Pillar [a-z]+(?: [a-z]+)?(?: \([^)]*\))?(?:\.|:)\s*/i; // the dashboard parser (qnfo-fleet-dashboard worker.js)
  if (id !== 388) ok(pillarRe.test(a.action) && a.action.startsWith(pillarRe.exec(ORIG[id])[0].trim()), id + ": the Pillar header the dashboard parses is unchanged", a.action.slice(0, 60));
}
const after = pct(w);
ok(after.h === 9 && after.n === 64 && after.pct === 14.1, "breach_code_task_pct SQL: 9 of 64 (14.1) after, 6 of 64 (9.4) before", after);
ok(after.pct >= 10 && Math.ceil(0.1 * 89) === 9 && Math.ceil(0.1 * 91) === 10, "9 handed triggers keep the share at or above 10 up to 90 breaching triggers");
ok(q1(w, "SELECT COUNT(*) n FROM analytics_metric_triggers WHERE action LIKE '%REM-A5%' OR notes LIKE '%REM-A5-METRIC-TRIGGERS-1%'").n === 3, "only the three intended trigger rows changed");

// ---- 2. blocker verdicts
const verdicts = qa(w, "SELECT * FROM blocker_redteam ORDER BY target");
ok(verdicts.length === 4 && verdicts.every((r) => r.actor === "rem-a5" && r.verdict === "false-belief-removed" && r.text_sig && r.attempt.length > 120 && r.evidence.length > 40 && r.claim), "four verdicts false-belief-removed, each with a claim, an attempt, evidence and a text_sig", verdicts.map((r) => r.target));
ok(verdicts.map((r) => r.target + "=" + r.text_sig).join() === "issue:1798=82:3405,issue:2455=130:5480,issue:99934=105:1131,issue:99948=98:2775", "each text_sig is the title length and description length that were read", verdicts.map((r) => r.text_sig));
const blockedAfter = qa(w, "SELECT target FROM v_blocker_claims ORDER BY target").map((r) => r.target);
ok(blockedAfter.join() === "issue:777", "the live v_blocker_claims text now lists only the unrelated claim", blockedAfter);
{ // a ticket whose text changed since it was read gets no verdict
  const x = world();
  x.prepare("UPDATE agent_issues SET description = description || ' appended by someone' WHERE id = 99934").run();
  x.exec(sql);
  ok(qa(x, "SELECT target FROM blocker_redteam ORDER BY target").map((r) => r.target).join() === "issue:1798,issue:2455,issue:99948", "a ticket whose text changed since it was read gets no verdict (no row is written for 99934)");
  ok(qa(x, "SELECT target FROM v_blocker_claims ORDER BY target").map((r) => r.target).includes("issue:99934"), "and it stays counted");
}
{ // a closed ticket gets none
  const x = world();
  x.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 1798").run();
  x.exec(sql);
  ok(!qa(x, "SELECT target FROM blocker_redteam").map((r) => r.target).includes("issue:1798"), "a closed ticket gets no verdict");
}
ok(JSON.stringify(qa(w, "SELECT id, description FROM agent_issues WHERE id IN (1798, 2455, 99934, 99948) ORDER BY id")) === JSON.stringify(JSON.parse(snapIssues).filter((r) => [1798, 2455, 99934, 99948].includes(r.id))), "the four verdict tickets keep their text (the verdict is tied to it)");

// ---- 3. notes
for (const id of NOTED) {
  const d = q1(w, "SELECT description FROM agent_issues WHERE id = ?", id).description;
  ok(d.startsWith("original text of " + id + "\nREM-A5 2026-10-26: ") && countOf(d, "REM-A5 2026-10-26") === 1, id + ": one note appended to the old text", d.slice(0, 120));
  ok(!/^\s*(runtime-probe|code-probe|code-task|code-anchor):/im.test(d), id + ": the note has no probe or code-task marker line (the description triggers read them)");
  ok(!denyText.test(d.slice("original text of ".length + String(id).length)), id + ": the note does not trip PLAN_DENY_TEXT", d.match(denyText) && d.match(denyText)[0]);
}
ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 777").d === "this one is owner-only for real", "an unrelated issue is untouched");
ok(qa(w, "SELECT target FROM v_blocker_claims WHERE target IN (" + NOTED.map((i) => "'issue:" + i + "'").join(",") + ")").length === 0, "no note adds a phrase that v_blocker_claims counts as a blocker claim (the notes must not raise the metric they are about)");
{
  const d = q1(w, "SELECT description d FROM agent_issues WHERE id = 2875").d;
  ok(/04:40Z to 05:59Z/.test(d) && /2026-10-27T05:00Z/.test(d) && /2026-10-27T03:00Z/.test(d), "the heartbeat note carries the gap and the two dates");
  ok(/40379913871/.test(q1(w, "SELECT description d FROM agent_issues WHERE id = 2670").d) && /qnfo-ops\/worker\.js:501/.test(q1(w, "SELECT description d FROM agent_issues WHERE id = 2670").d), "the guard_rcs note names the run and the line");
}

// ---- 4. decisions and predictions
const dec = qa(w, "SELECT id, action, predicted_outcome, actor FROM decision_log ORDER BY id");
ok(dec.length === 7 && dec.every((r) => r.actor === "rem-a5") && new Set(dec.map((r) => r.action.split(":")[0])).size === 7, "seven decision rows, one per REM-A5 key", dec.map((r) => r.action.split(":")[0]));
const preds = qa(w, "SELECT p.subject, p.op, p.value, CAST(round((julianday(p.due_at) - julianday('now')) * 24) AS INTEGER) AS hours FROM decision_predictions p ORDER BY p.subject");
const expectP = { breach_code_task_pct: [">=", 10, 3], unverified_blocker_claims: ["<=", 15, 3], tick_sequence_completion_24h: [">=", 0.9, 12], false_stops_7d: ["<=", 1, 48], workers_ai_run_rate_usd: ["<", 450, 96], guard_rcs: ["<=", 0, 6], ops_agent_empty_answers_7d: ["<", 1, 144] };
ok(preds.length === 7 && preds.every((p) => expectP[p.subject] && expectP[p.subject][0] === p.op && expectP[p.subject][1] === p.value && Math.abs(expectP[p.subject][2] - p.hours) <= 1), "the parser reads one prediction per decision with the metric, operator, value and deadline the text states", preds);
ok(qa(w, "SELECT 1 FROM decision_log WHERE predicted_outcome LIKE '%within%' AND predicted_outcome LIKE '% d%' AND predicted_outcome NOT LIKE '%days%'").length === 0, "no hours prediction carries a word that starts with ' d' (the parser would read days)");
{ let blocked = false; try { w.exec("UPDATE decision_log SET actor = 'x'"); } catch (e) { blocked = /append-only/.test(String(e.message)); } ok(blocked, "fixture check: decision_log refuses an UPDATE like the live triggers (the file never updates it)"); }

// ---- replay and rollback
{
  const snap = (x) => JSON.stringify([qa(x, "SELECT id, action, notes FROM analytics_metric_triggers ORDER BY id"), qa(x, "SELECT id, description FROM agent_issues ORDER BY id"), qa(x, "SELECT target, text_sig FROM blocker_redteam ORDER BY id"), qa(x, "SELECT action FROM decision_log ORDER BY id"), qa(x, "SELECT decision_id, subject FROM decision_predictions ORDER BY id")]);
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a second apply changes nothing (triggers, notes, verdicts, decisions, predictions)");
  const r = world();
  const orig = snap(r).split('"decision_id"')[0];
  r.exec(sql);
  r.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  const back = JSON.stringify([qa(r, "SELECT id, action, notes FROM analytics_metric_triggers ORDER BY id"), qa(r, "SELECT id, description FROM agent_issues ORDER BY id")]);
  const fresh = world();
  const want = JSON.stringify([qa(fresh, "SELECT id, action, notes FROM analytics_metric_triggers ORDER BY id"), qa(fresh, "SELECT id, description FROM agent_issues ORDER BY id")]);
  ok(back === want, "Rollback restores every trigger action, note and issue description byte for byte");
  ok(q1(r, "SELECT COUNT(*) n FROM blocker_redteam WHERE actor = 'rem-a5'").n === 0, "and removes the four verdicts");
  r.exec(sql);
  ok(pct(r).h === 9, "the file applies again after a rollback");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
