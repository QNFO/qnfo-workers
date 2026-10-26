// CHAOS-DRILL-CALIBRATION-1 offline suite: migrations/2026-10-26-chaos-drill-calibration.sql recalibrates drill probes. An independent review of the first version found three majors,
// each a case this suite now holds: (1) skipping origin budget-promote blanked the scan of the owner's own typed text (a budget-promote payload is the owner's transcript, user and system
// messages verbatim), (2) the research-quality-gate probe was decorative and would stamp a control tested that nobody verified, (3) the park-rearm-tick event is logged only when a row was
// re-armed, so it is no heartbeat. It runs the probes the migration STORES (read back from control_alternate_probes after it applies, seeded from the live pre-state) against crafted data:
//  * ops-jobs-payload-redaction: every origin but budget-promote is scanned whole, a budget-promote payload in its user and system messages (a tool message or an assistant message that
//    merely mentions the phrases reads ok, a content array is scanned, a payload that is not JSON is scanned whole), a terminal row older than 15 days still fires;
//  * research-floor-rearm: no demand for a bak table, the hourly idea-to-publish heartbeat decides (a healthy sweep that re-arms nothing for days reads ok), a bad park_rearm value fires;
//  * evolve-wip-recovery: merged_at in 24 h (a re-stamped updated_at does not count); research-quality-gate: no probe, ALTERNATE-NOT-EXERCISABLE, and the live view
//    v_control_alternate_status reads not-exercisable, so the no-probe count that issue 1000214 watches falls from 2 to 0 without a tested stamp;
//  * the old probes are kept as disabled history rows, a second apply changes nothing, a probe someone has since changed is left alone, the Rollback line restores everything it changed.
// Run: node --no-warnings migrations/chaos-drill-calibration.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-chaos-drill-calibration.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];

// live pre-state of 2026-10-26 (control_alternate_probes, control_registry, v_control_alternate_status)
const OLD_OPS = `SELECT 'ok' AS expected, CASE WHEN EXISTS (SELECT 1 FROM ops_jobs WHERE payload LIKE '%magic-link%' OR payload LIKE '%magic_link%' OR payload LIKE '%/login%token=%' OR payload LIKE '%/verify%token=%' OR payload LIKE '%/reset%token=%' OR payload LIKE '%verification code%' OR payload LIKE '%one-time code%' OR payload LIKE '%login code%') THEN 'a stored ops_jobs payload still holds a login link or a one-time code' WHEN EXISTS (SELECT 1 FROM ops_jobs WHERE status IN ('succeeded', 'failed', 'terminated', 'cancelled') AND updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 days')) THEN 'a terminal ops_jobs row is older than 15 days, so the 14-day sweep is not running' ELSE 'ok' END AS observed`;
const OLD_OPS_NOTE = "state probe on the stored payloads and the 14-day sweep that bounds what a user-typed link can keep";
const OLD_RF = `SELECT 'ok' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = 'park_rearm'), 'on') NOT IN ('on', 'off') THEN 'ops_config park_rearm holds a value the sweep does not read, so its off lever is unreadable' WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bak_20261019_research_parked') THEN 'the backup table bak_20261019_research_parked is missing, so the rollback line has nothing to restore' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind IN ('park-rearm-tick') AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-48 hours')) THEN 'no park-rearm-tick event in 48 h, so the hourly sweep is not running' ELSE 'ok' END AS observed`;
const OLD_RF_NOTE = "48 h: the sweep logs park-rearm-tick every hour (6 in 6 hours on 2026-10-19); the absent key reads as on";
const OLD_LOC = "qnfo-research-exec floorRearmTick (FLOOR-REARM-1), hourly sweep; bak_20261019_research_parked";
const RQ_EVIDENCE = "PUBLICATION-GATE-HOURLY-1: the post-publication deterministic gate now runs hourly to meet the 120-minute issue SLA while quality snapshots remain daily and idea-topic-metric remains daily. The source-side prevention issue and live paper-quarantine probe remain open until independently verified.";
const VIEW = `CREATE VIEW v_control_alternate_status AS
SELECT c.control AS control, c.critical_path AS critical_path, c.disposition AS disposition, c.disposition_state AS disposition_state,
  c.alternate_path AS alternate_path, c.alternate_tested_at AS alternate_tested_at,
  p.enabled AS probe_enabled, p.last_run_at AS last_run_at, p.last_pass AS last_pass, p.last_pass_at AS last_pass_at, p.last_observed AS last_observed,
  p.window_note AS window_note,
  CASE
    WHEN c.alternate_path IS NULL OR trim(c.alternate_path) = '' THEN 'no-alternate'
    WHEN c.disposition = 'remove' AND c.disposition_state = 'applied' THEN 'removed'
    WHEN p.control IS NULL AND c.evidence LIKE '%ALTERNATE-NOT-EXERCISABLE%' THEN 'not-exercisable'
    WHEN p.control IS NULL THEN 'no-probe'
    WHEN p.enabled <> 1 THEN 'probe-disabled'
    WHEN p.last_run_at IS NULL THEN 'probe-never-run'
    WHEN p.last_pass IS NOT 1 THEN 'probe-failing'
    WHEN p.last_pass_at IS NULL OR p.last_pass_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-480 minutes') THEN 'probe-stale'
    ELSE 'drilled'
  END AS drill_state
FROM control_registry c LEFT JOIN control_alternate_probes p ON p.control = c.control`;

const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const OPS = "ops-jobs-payload-redaction", RF = "research-floor-rearm", EV = "evolve-wip-recovery", RQ = "research-quality-gate";

function build(pre = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path INTEGER, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE ops_jobs (id TEXT PRIMARY KEY, status TEXT, payload TEXT, origin TEXT, updated_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, ts TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT, merged_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
  db.exec(VIEW);
  const ins = db.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled, last_run_at, last_pass, last_observed) VALUES (?, ?, ?, 1, '2026-10-26T07:01:00Z', 0, 'old')");
  ins.run(OPS, pre.ops ?? OLD_OPS, OLD_OPS_NOTE);
  ins.run(RF, pre.rf ?? OLD_RF, OLD_RF_NOTE);
  const reg = db.prepare("INSERT INTO control_registry (control, location, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)");
  reg.run(OPS, "qnfo-ops redactJobBody", 0, "keep", "applied", "the stored payload scan and the 14-day sweep", "");
  reg.run(RF, pre.loc ?? OLD_LOC, 0, "keep", "applied", "the off lever park_rearm and the hourly sweep", "");
  reg.run(EV, "qnfo-code-orchestrator recoverWip", 0, "replace", "applied", "the normal code planner continues to plan and drain tasks independently of recovery", "");
  reg.run(RQ, "qnfo-cloud-ops publication gate", 1, "replace", "planned", "qnfo-cloud-ops hourly structural sweep quarantines after publication", RQ_EVIDENCE);
  return db;
}
const one = (db, s, ...a) => db.prepare(s).get(...a);
const probe = (db, control) => one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", control).probe_sql;
const observed = (db, control) => db.prepare(probe(db, control)).get().observed;
const clear = (db) => { for (const t of ["ops_jobs", "ops_config", "cloud_ops_events", "code_tasks"]) db.exec("DELETE FROM " + t); };
let jn = 0;
const job = (db, o) => db.prepare("INSERT INTO ops_jobs (id, status, payload, origin, updated_at) VALUES (?, ?, ?, ?, ?)").run("j" + ++jn, o.status ?? "succeeded", o.payload, o.origin ?? null, o.updated ?? iso(30));
const bundle = (msgs) => JSON.stringify({ model: "m", messages: msgs });
const noUnsatisfied = (db) => one(db, "SELECT COUNT(*) AS n FROM v_control_alternate_status WHERE drill_state = 'no-probe' AND alternate_tested_at IS NULL").n;

// ---- the pre-state: the register watches two controls with an alternate and no probe
let db = build();
ok(noUnsatisfied(db) === 2 && one(db, "SELECT drill_state FROM v_control_alternate_status WHERE control = ?", RQ).drill_state === "no-probe", "before the file two controls have an alternate and no probe (the 1000214 reading)", noUnsatisfied(db));

// ---- apply
db.exec(sql);
const hist = db.prepare("SELECT control, probe_sql, window_note, enabled FROM control_alternate_probes WHERE control LIKE '%@before-calibration-1' ORDER BY control").all();
ok(hist.length === 2 && hist.every((h) => h.enabled === 0) && hist[0].probe_sql === OLD_OPS && hist[0].window_note === OLD_OPS_NOTE && hist[1].probe_sql === OLD_RF, "the two old probes are kept as disabled history rows, not in a bak_ table", hist.map((h) => h.control));
ok(!/\bbak_2026/.test(sql.replace(/^--.*$/gm, "").replace(/bak_20261019_research_parked/g, "")), "the file creates no bak_ table (the fleet purges them)");
ok(one(db, "SELECT COUNT(*) AS n FROM control_alternate_probes WHERE enabled = 1").n === 3, "three enabled probes: ops, rearm, evolve (no probe for research-quality-gate)");
ok(!one(db, "SELECT 1 AS x FROM control_alternate_probes WHERE control = ?", RQ), "research-quality-gate gets no probe");
ok(one(db, "SELECT drill_state FROM v_control_alternate_status WHERE control = ?", RQ).drill_state === "not-exercisable" && one(db, "SELECT drill_state FROM v_control_alternate_status WHERE control = ?", EV).drill_state === "probe-never-run" && noUnsatisfied(db) === 0, "the live register view reads not-exercisable and probe-never-run, and the no-probe count falls from 2 to 0");
ok(one(db, "SELECT alternate_tested_at FROM control_registry WHERE control = ?", RQ).alternate_tested_at === null && one(db, "SELECT evidence FROM control_registry WHERE control = ?", RQ).evidence.startsWith(RQ_EVIDENCE) && /ALTERNATE-NOT-EXERCISABLE: the registered alternate/.test(one(db, "SELECT evidence FROM control_registry WHERE control = ?", RQ).evidence), "the quality-gate evidence keeps its text, gains the reason and is not stamped tested");
ok(!/bak_20261019_research_parked/.test(one(db, "SELECT location FROM control_registry WHERE control = ?", RF).location) && /parkRearmTick/.test(one(db, "SELECT location FROM control_registry WHERE control = ?", RF).location), "the rearm location no longer names the vanished table");
const iss = one(db, "SELECT status, priority, description FROM agent_issues WHERE title LIKE 'PARK-REARM-HEARTBEAT-1:%'");
ok(iss && iss.status === "open" && /code-task: repo=qnfo-workers path=qnfo-research-exec\/worker\.js/.test(iss.description) && /code-anchor: if \(_rearm\.rearmed\) await logEvent\(env, "park-rearm-tick"/.test(iss.description) && /code-probe: \{"paths": \["qnfo-research-exec\/worker\.js"\], "contains": "park-rearm-heartbeat"\}/.test(iss.description), "the follow-up is filed with a code-task line, an anchor and a code-probe", iss && iss.description.slice(-300));
ok(one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'CHAOS-DRILL-CALIBRATION-1:') = 1").n === 1, "one decision is logged");
ok(!/\bCREATE\s+TRIGGER\b/i.test(sql) && !/^\s*DROP\b/im.test(sql.replace(/^--.*$/gm, "")) && /^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "no trigger, no DROP, the opt-in headers are present");

// ---- 1. ops-jobs-payload-redaction
clear(db);
ok(observed(db, OPS) === "ok", "no ops_jobs rows: ok");
job(db, { origin: "budget-promote", payload: bundle([{ role: "system", content: "You are a code agent." }, { role: "user", content: "promote the change to qnfo-ops" }, { role: "tool", content: "/* OWNER-OTP-1: owner login by emailed one-time code for chat, REST and MCP */ cf auth login prints a link and a one-time code. magic-link /login?token=${t} verification code" }, { role: "assistant", content: "I will mention the one-time code flow in the comment" }]) });
job(db, { origin: null, payload: "please summarise the open issues" });
ok(observed(db, OPS) === "ok", "tool and assistant messages of a budget-promote bundle that mention the phrases, and a clean user-typed row, read ok (the false positive of 2026-10-26)", observed(db, OPS));
const LEAKS = ["sign in at https://x.example/login?token=abc123", "open https://x.example/verify?token=zzz", "https://x.example/reset?token=q", "my verification code is 123456", "the one-time code is 654321", "here is the magic-link", "the magic_link was pasted", "login code 111222"];
for (const [i, p] of LEAKS.entries()) {
  clear(db); job(db, { origin: null, payload: p });
  ok(/^a stored ops_jobs payload still holds/.test(observed(db, OPS)), "origin NULL, leak shape " + (i + 1) + " fires: " + p.slice(0, 30), observed(db, OPS));
}
clear(db); job(db, { origin: "chat", payload: "the one-time code is 654321" });
ok(/^a stored ops_jobs payload still holds/.test(observed(db, OPS)), "any origin but budget-promote is scanned whole", observed(db, OPS));
for (const role of ["user", "system"]) {
  clear(db); job(db, { origin: "budget-promote", payload: bundle([{ role: "tool", content: "ok" }, { role, content: "sign in with https://app.example/login?token=Zk3v9 and my one-time code is 482913" }]) });
  ok(/^a stored ops_jobs payload still holds/.test(observed(db, OPS)), "a leak in a budget-promote " + role + " message fires (the blind spot the review reproduced)", observed(db, OPS));
}
clear(db); job(db, { origin: "budget-promote", payload: bundle([{ role: "user", content: [{ type: "text", text: "my one-time code is 123456" }] }]) });
ok(/^a stored ops_jobs payload still holds/.test(observed(db, OPS)), "a user message whose content is an array of parts is scanned", observed(db, OPS));
clear(db); job(db, { origin: "budget-promote", payload: "not json at all, the one-time code is 123456" });
ok(/^a stored ops_jobs payload still holds/.test(observed(db, OPS)), "a budget-promote payload that is not valid JSON is scanned whole", observed(db, OPS));
clear(db); job(db, { origin: "budget-promote", payload: JSON.stringify({ note: "no messages array, a one-time code mention" }) });
ok(observed(db, OPS) === "ok", "a budget-promote object without messages reads ok", observed(db, OPS));
clear(db); job(db, { origin: "budget-promote", status: "succeeded", payload: bundle([]), updated: iso(16 * 1440) });
ok(/^a terminal ops_jobs row is older than 15 days/.test(observed(db, OPS)), "a terminal row older than 15 days still fires", observed(db, OPS));
clear(db); job(db, { origin: null, status: "queued", payload: "x", updated: iso(16 * 1440) });
ok(observed(db, OPS) === "ok", "a queued row is not a terminal row", observed(db, OPS));

// ---- 2. research-floor-rearm
clear(db);
db.prepare("INSERT INTO cloud_ops_events (kind, ts) VALUES ('idea-to-publish', ?)").run(iso(60));
ok(!one(db, "SELECT name FROM sqlite_master WHERE name LIKE 'bak_20261019%'") && observed(db, RF) === "ok", "no bak table and a recent idea-to-publish heartbeat: ok (the false failure of 2026-10-26)", observed(db, RF));
clear(db);
for (let h = 0; h < 60; h++) db.prepare("INSERT INTO cloud_ops_events (kind, ts) VALUES ('idea-to-publish', ?)").run(iso(h * 60 + 20));
ok(observed(db, RF) === "ok" && !one(db, "SELECT 1 AS x FROM cloud_ops_events WHERE kind = 'park-rearm-tick'"), "a healthy sweep that re-arms nothing for 60 hours (no park-rearm-tick at all) reads ok", observed(db, RF));
clear(db); db.prepare("INSERT INTO cloud_ops_events (kind, ts) VALUES ('park-rearm-tick', ?)").run(iso(5));
ok(/no idea-to-publish event in 180 minutes/.test(observed(db, RF)), "a park-rearm-tick alone is not a heartbeat: the minute-0 branch must have run", observed(db, RF));
clear(db); db.prepare("INSERT INTO cloud_ops_events (kind, ts) VALUES ('idea-to-publish', ?)").run(iso(170));
ok(observed(db, RF) === "ok", "a heartbeat 170 minutes ago is inside the window", observed(db, RF));
clear(db); db.prepare("INSERT INTO cloud_ops_events (kind, ts) VALUES ('idea-to-publish', ?)").run(iso(190));
ok(/no idea-to-publish event in 180 minutes/.test(observed(db, RF)), "a heartbeat 190 minutes ago fires", observed(db, RF));
clear(db); db.prepare("INSERT INTO cloud_ops_events (kind, ts) VALUES ('idea-to-publish', ?)").run(iso(10)); db.prepare("INSERT INTO ops_config VALUES ('park_rearm', 'maybe', 'n', ?)").run(iso(1));
ok(/park_rearm holds a value/.test(observed(db, RF)), "a park_rearm value the sweep does not read still fires", observed(db, RF));
db.exec("UPDATE ops_config SET value = 'off'");
ok(observed(db, RF) === "ok", "park_rearm off is a lever the sweep reads: ok", observed(db, RF));

// ---- 3. evolve-wip-recovery
clear(db);
ok(/merged no task in 24 hours/.test(observed(db, EV)), "no code task at all fires", observed(db, EV));
db.prepare("INSERT INTO code_tasks VALUES ('a', 'merged', ?, ?)").run(iso(5), iso(25 * 60));
ok(/merged no task in 24 hours/.test(observed(db, EV)), "a merged task re-stamped by bookkeeping (updated_at now, merged_at 25 h ago) does not count", observed(db, EV));
db.prepare("INSERT INTO code_tasks VALUES ('b', 'failed', ?, NULL), ('c', 'published', ?, NULL)").run(iso(5), iso(5));
ok(/merged no task in 24 hours/.test(observed(db, EV)), "failed and published tasks do not count: the planner has to merge", observed(db, EV));
db.prepare("INSERT INTO code_tasks VALUES ('d', 'merged', ?, ?)").run(iso(60), iso(23 * 60));
ok(observed(db, EV) === "ok", "a task merged 23 hours ago: ok", observed(db, EV));

// ---- idempotent, and a changed probe is left alone
const snapOf = (d) => JSON.stringify([d.prepare("SELECT * FROM control_alternate_probes ORDER BY control").all(), d.prepare("SELECT * FROM control_registry ORDER BY control").all(), d.prepare("SELECT COUNT(*) AS n FROM decision_log").get(), d.prepare("SELECT COUNT(*) AS n FROM agent_issues").get()]);
db = build(); db.exec(sql);
db.prepare("UPDATE control_alternate_probes SET last_run_at = '2026-10-26T13:01:00Z', last_pass = 1 WHERE control = ?").run(EV);
const s1 = snapOf(db); db.exec(sql);
ok(snapOf(db) === s1, "a second apply changes no row and keeps the first history rows");
db = build({ ops: "SELECT 'ok' AS expected, 'ok' AS observed", rf: "SELECT 'ok' AS expected, 'ok' AS observed", loc: "somewhere else entirely" });
db.exec(sql);
ok(probe(db, OPS) === "SELECT 'ok' AS expected, 'ok' AS observed" && probe(db, RF) === "SELECT 'ok' AS expected, 'ok' AS observed" && one(db, "SELECT location FROM control_registry WHERE control = ?", RF).location === "somewhere else entirely", "a probe or location someone has since changed is not overwritten");
db = build(); db.exec("DELETE FROM control_registry");
db.exec(sql);
ok(one(db, "SELECT COUNT(*) AS n FROM control_alternate_probes WHERE enabled = 1").n === 3 && one(db, "SELECT COUNT(*) AS n FROM agent_issues").n === 1, "with no register rows the file still applies and updates nothing there");

// ---- rollback
db = build(); db.exec(sql); db.exec(rollback);
ok(probe(db, OPS) === OLD_OPS && probe(db, RF) === OLD_RF && one(db, "SELECT window_note FROM control_alternate_probes WHERE control = ?", OPS).window_note === OLD_OPS_NOTE && one(db, "SELECT window_note FROM control_alternate_probes WHERE control = ?", RF).window_note === OLD_RF_NOTE, "the Rollback line restores both probes and their notes from the history rows");
ok(!one(db, "SELECT 1 AS x FROM control_alternate_probes WHERE control = ?", EV), "and removes the added probe that has not run");
ok(one(db, "SELECT evidence FROM control_registry WHERE control = ?", RQ).evidence === RQ_EVIDENCE && one(db, "SELECT location FROM control_registry WHERE control = ?", RF).location === OLD_LOC, "and reverts the evidence text and the location to their exact original");
ok(noUnsatisfied(db) === 2, "the register reading returns to 2 after the rollback");
db = build(); db.exec(sql);
db.prepare("UPDATE control_alternate_probes SET last_run_at = '2026-10-26T13:01:00Z' WHERE control = ?").run(EV);
db.exec(rollback);
ok(one(db, "SELECT COUNT(*) AS n FROM control_alternate_probes WHERE control = ?", EV).n === 1, "a probe that has already run is kept by the Rollback line (its history is evidence)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
