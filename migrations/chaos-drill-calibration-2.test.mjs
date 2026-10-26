// CHAOS-DRILL-CALIBRATION-2 offline suite: migrations/2026-10-26-chaos-drill-calibration-2.sql follows migrations/2026-10-26-chaos-drill-calibration.sql.
// An independent review of CHAOS-DRILL-CALIBRATION-1 named three majors. The merged file already holds all three fixes (checked against live qnfo-audit on 2026-10-26), so this suite PINS them
// against the probes the migrations store, in a new section that does not edit the first suite, and covers what file 2 changes (a window note, two register evidence texts, a failure mode
// and its detector, a decision row). The pre-state is the live pre-state of the first file (the two probe texts and the register view are read from migrations/chaos-drill-calibration.test.mjs,
// where they were copied from live, and their live lengths are asserted here).
//  1. The review's four cases against the stored ops-jobs-payload-redaction probe: a tool-role budget-promote bundle that mentions the phrases reads ok, a user-role (and system-role) leak fires for
//     each of the eight patterns, a malformed payload reads ok and fires only when it holds a phrase, an origin-NULL (and any other origin) leak fires. The old assertion that a budget-promote
//     payload with a login link reads ok is restated as a pair: the link in a tool message reads ok, the same link in a user message fires.
//  2. research-quality-gate: a simulated drill that stamps every passing probe never stamps it, the live view reads not-exercisable, and a decorative probe would be stamped (mutation check).
//  3. research-floor-rearm: a healthy sweep that re-arms nothing for 49 hours reads ok, a missing hourly heartbeat fires even when a park-rearm-tick is fresh.
//  4. File 2: the window note says what the unscanned tool messages are, the two evidence texts are appended once, nothing else changes, the failure mode and its detector exist and the detector
//     fails when an enabled drill probe reads park-rearm-tick again, one decision row, a second apply changes nothing, the Rollback line restores the texts without the backup table.
// Run: node --no-warnings migrations/chaos-drill-calibration-2.test.mjs   -> prints "N passed, 0 failed"
// Mutation checks: CDC1_MIGRATION and CDC2_MIGRATION point the suite at a mutated copy of either file.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
const pick = (env, f) => readFileSync(process.env[env] ? resolve(process.env[env]) : here(f), "utf8");
const sql1 = pick("CDC1_MIGRATION", "2026-10-26-chaos-drill-calibration.sql");
const sql2 = pick("CDC2_MIGRATION", "2026-10-26-chaos-drill-calibration-2.sql");
const suite1 = readFileSync(here("chaos-drill-calibration.test.mjs"), "utf8");
const grab = (name) => { const m = new RegExp("const " + name + " = (`[^`]*`|\"[^\"]*\");").exec(suite1); if (!m) throw new Error("cannot read " + name + " from the first suite"); return new Function("return " + m[1])(); };
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql2)[1];
const code2 = sql2.replace(/^--.*$/gm, "");

// live pre-state of file 1 (control_alternate_probes history rows, control_registry, v_control_alternate_status), copied once from live by the first suite
const OLD_OPS = grab("OLD_OPS"), OLD_OPS_NOTE = grab("OLD_OPS_NOTE"), OLD_RF = grab("OLD_RF"), OLD_RF_NOTE = grab("OLD_RF_NOTE"), OLD_LOC = grab("OLD_LOC"), RQ_EVIDENCE = grab("RQ_EVIDENCE"), VIEW = grab("VIEW");
ok(OLD_OPS.length === 700 && OLD_RF.length === 689, "the pre-state probe texts have the lengths of the live history rows of 2026-10-26 (700 and 689 bytes)", [OLD_OPS.length, OLD_RF.length]);

const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const OPS = "ops-jobs-payload-redaction", RF = "research-floor-rearm", EV = "evolve-wip-recovery", RQ = "research-quality-gate";
const RF_EVIDENCE0 = "research_queue 2026-10-19: 31 PARKED-POISON-1 rows with gate-length | CONTROL-ALT-PROBES-2 2026-10-19: probed by its control_alternate_probes row";
const EV_EVIDENCE0 = "EVOLVE-WIP-PLANNER-ALIGNMENT-1 replaces queued-only measurement and evolve_wip_ceiling with the planner active-task status set";

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
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, next_due_at TEXT);`);
  db.exec(VIEW);
  const ins = db.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled, last_run_at, last_pass, last_observed) VALUES (?, ?, ?, 1, '2026-10-26T07:01:00Z', 0, 'old')");
  ins.run(OPS, pre.ops ?? OLD_OPS, OLD_OPS_NOTE);
  ins.run(RF, pre.rf ?? OLD_RF, OLD_RF_NOTE);
  const reg = db.prepare("INSERT INTO control_registry (control, location, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)");
  reg.run(OPS, "qnfo-ops redactJobBody", 0, "keep", "applied", "the stored payload scan and the 14-day sweep", "");
  reg.run(RF, OLD_LOC, 0, "keep", "applied", "the off lever park_rearm and the hourly sweep", RF_EVIDENCE0);
  reg.run(EV, "qnfo-code-orchestrator recoverWip", 0, "replace", "applied", "the normal code planner continues to plan and drain tasks independently of recovery", EV_EVIDENCE0);
  reg.run(RQ, "qnfo-cloud-ops publication gate", 1, "replace", "planned", "qnfo-cloud-ops hourly structural sweep quarantines after publication", RQ_EVIDENCE);
  return db;
}
const one = (db, s, ...a) => db.prepare(s).get(...a);
const probe = (db, control) => one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", control).probe_sql;
const observed = (db, control) => db.prepare(probe(db, control)).get().observed;
const state = (db, control) => one(db, "SELECT drill_state FROM v_control_alternate_status WHERE control = ?", control).drill_state;
const clear = (db) => { for (const t of ["ops_jobs", "ops_config", "cloud_ops_events", "code_tasks"]) db.exec("DELETE FROM " + t); };
let jn = 0;
const job = (db, o) => db.prepare("INSERT INTO ops_jobs (id, status, payload, origin, updated_at) VALUES (?, ?, ?, ?, ?)").run("j" + ++jn, o.status ?? "succeeded", o.payload, o.origin ?? null, o.updated ?? iso(30));
const bundle = (msgs) => JSON.stringify({ model: "m", messages: msgs });
const event = (db, kind, minAgo) => db.prepare("INSERT INTO cloud_ops_events (kind, ts) VALUES (?, ?)").run(kind, iso(minAgo));
const FIRES = /^a stored ops_jobs payload still holds a login link or a one-time code$/;
// the eight patterns of the probe, each as a text that matches it. LIKE reads _ as any one character, so %magic_link% also matches magic-link and the first pattern is redundant in behaviour
// (a mutation that removes only %magic-link% from a branch survives the behavioural cases and is caught by the length pin alone)
const SHAPES = ["https://x.example/a magic-link was pasted", "the magic_link was pasted", "sign in at https://x.example/login?token=abc123", "open https://x.example/verify?token=zzz", "https://x.example/reset?token=q", "my verification code is 123456", "the one-time code is 654321", "login code 111222"];
// the CHAOS-DRILL runner in miniature: run every enabled probe, record the pass, stamp the control on a pass (qnfo-fleet-control stamps alternate_tested_at and reviewed_at the same way)
function drill(db) {
  const now = iso(0);
  for (const p of db.prepare("SELECT control, probe_sql FROM control_alternate_probes WHERE enabled = 1").all()) {
    let r; try { r = db.prepare(p.probe_sql).get(); } catch (e) { r = { expected: "ok", observed: "error " + e.message }; }
    const good = r.expected === r.observed ? 1 : 0;
    db.prepare("UPDATE control_alternate_probes SET last_run_at = ?, last_pass = ?, last_observed = ?, last_pass_at = CASE WHEN ? = 1 THEN ? ELSE last_pass_at END WHERE control = ?").run(now, good, r.observed, good, now, p.control);
    if (good) db.prepare("UPDATE control_registry SET alternate_tested_at = ?, reviewed_at = ? WHERE control = ?").run(now, now, p.control);
  }
}
const healthy = (db) => { clear(db); event(db, "idea-to-publish", 40); db.prepare("INSERT INTO code_tasks VALUES ('t1', 'merged', ?, ?)").run(iso(30), iso(90)); job(db, { origin: null, payload: "please summarise the open issues" }); };
const snap = (db) => JSON.stringify(["control_alternate_probes", "control_registry", "decision_log", "failure_modes", "remediation_contracts", "agent_issues"].map((t) => db.prepare("SELECT * FROM " + t + " ORDER BY 1").all()));

// ---- pre-state, then file 1, then file 2
let db = build();
db.exec(sql1);
const afterOne = { ops: probe(db, OPS), rf: probe(db, RF), ev: probe(db, EV), opsNote: one(db, "SELECT window_note FROM control_alternate_probes WHERE control = ?", OPS).window_note, rqEv: one(db, "SELECT evidence FROM control_registry WHERE control = ?", RQ).evidence };
ok(afterOne.ops.length === 1560 && afterOne.rf.length === 542 && afterOne.ev.length === 311, "file 1 stores probes of the lengths that live qnfo-audit holds on 2026-10-26 (1560, 542, 311 bytes)", [afterOne.ops.length, afterOne.rf.length, afterOne.ev.length]);
const snap1 = snap(db);
db.exec(sql2);
ok(probe(db, OPS) === afterOne.ops && probe(db, RF) === afterOne.rf && probe(db, EV) === afterOne.ev, "file 2 changes no probe text");
ok(one(db, "SELECT evidence FROM control_registry WHERE control = ?", RQ).evidence === afterOne.rqEv && one(db, "SELECT alternate_tested_at FROM control_registry WHERE control = ?", RQ).alternate_tested_at === null && !one(db, "SELECT 1 AS x FROM control_alternate_probes WHERE control = ?", RQ), "file 2 leaves research-quality-gate as file 1 made it: no probe row, evidence unchanged, not stamped");
const store = db; // post-state both files

// ---- 1. the review's four cases, against the probe the migrations store
clear(store);
ok(observed(store, OPS) === "ok", "no ops_jobs rows: ok");
clear(store);
job(store, { origin: "budget-promote", payload: bundle([{ role: "system", content: "You are a code agent." }, { role: "user", content: "promote the change to qnfo-ops" }, { role: "tool", content: SHAPES.join(" / ") }, { role: "assistant", content: "I will mention the one-time code and the login code flow in the comment" }]) });
ok(observed(store, OPS) === "ok", "case 1: a budget-promote bundle whose tool and assistant messages hold all eight phrases and whose user and system messages are clean reads ok", observed(store, OPS));
for (const role of ["user", "system"]) for (const [i, p] of SHAPES.entries()) {
  clear(store); job(store, { origin: "budget-promote", payload: bundle([{ role: "tool", content: "ok" }, { role, content: p }]) });
  ok(FIRES.test(observed(store, OPS)), "case 2: a leak of shape " + (i + 1) + " in a budget-promote " + role + " message fires: " + p.slice(0, 28), observed(store, OPS));
}
clear(store); job(store, { origin: "budget-promote", payload: bundle([{ role: "tool", content: "cf auth login prints a link and a one-time code. /login?token=${t}" }]) });
ok(observed(store, OPS) === "ok", "the restated old assertion, half 1: a login link in a budget-promote TOOL message reads ok", observed(store, OPS));
clear(store); job(store, { origin: "budget-promote", payload: bundle([{ role: "user", content: "sign in with https://app.example/login?token=Zk3v9 and my one-time code is 482913" }]) });
ok(FIRES.test(observed(store, OPS)), "the restated old assertion, half 2: the same kind of link in a budget-promote USER message fires (the blind spot the review reproduced)", observed(store, OPS));
clear(store); job(store, { origin: "budget-promote", payload: bundle([{ role: "tool", content: "magic-link" }, { role: "user", content: "my verification code is 123456" }]) });
ok(FIRES.test(observed(store, OPS)), "a phrase in a tool message does not hide a leak in the user message of the same bundle");
clear(store); job(store, { origin: "budget-promote", payload: "{ this is not json and holds no phrase" });
ok(observed(store, OPS) === "ok", "case 3: a malformed budget-promote payload without a phrase reads ok (no error)", observed(store, OPS));
clear(store); job(store, { origin: "budget-promote", payload: "{ this is not json, the one-time code is 123456" });
ok(FIRES.test(observed(store, OPS)), "a malformed budget-promote payload that holds a phrase is scanned whole and fires", observed(store, OPS));
clear(store); job(store, { origin: "budget-promote", payload: JSON.stringify({ note: "an object without messages" }) });
ok(observed(store, OPS) === "ok", "a budget-promote object without a messages array reads ok", observed(store, OPS));
for (const origin of [null, "chat", "rest"]) for (const [i, p] of SHAPES.entries()) {
  clear(store); job(store, { origin, payload: origin === null && i % 2 ? bundle([{ role: "tool", content: p }]) : p });
  ok(FIRES.test(observed(store, OPS)), "case 4: origin " + origin + ", leak of shape " + (i + 1) + " fires whole, whatever the role", observed(store, OPS));
}
clear(store); job(store, { origin: "budget-promote", status: "succeeded", payload: bundle([]), updated: iso(16 * 1440) });
ok(/^a terminal ops_jobs row is older than 15 days/.test(observed(store, OPS)), "the 15-day sweep branch still fires");

// ---- 2. research-quality-gate is never stamped
db = build(); db.exec(sql1); db.exec(sql2); healthy(db);
ok(state(db, RQ) === "not-exercisable" && state(db, OPS) === "probe-failing", "before a drill pass the live view reads not-exercisable for research-quality-gate");
drill(db);
const rq = one(db, "SELECT alternate_tested_at, reviewed_at FROM control_registry WHERE control = ?", RQ);
ok(rq.alternate_tested_at === null && rq.reviewed_at === null && state(db, RQ) === "not-exercisable", "a drill pass that stamps every passing probe does not stamp research-quality-gate and the view still reads not-exercisable", rq);
ok([OPS, RF, EV].every((c) => state(db, c) === "drilled" && one(db, "SELECT alternate_tested_at AS t FROM control_registry WHERE control = ?", c).t), "and on a healthy world the three calibrated probes pass and read drilled (the probes can pass)", [OPS, RF, EV].map((c) => state(db, c)));
ok(!db.prepare("SELECT control FROM control_alternate_probes WHERE enabled = 1 AND (probe_sql LIKE '%quality_scores%' OR control = ?)").get(RQ), "no enabled probe stands in for the quality gate (a daily snapshot is not its quarantine)");
const enabled = db.prepare("SELECT control, probe_sql FROM control_alternate_probes WHERE enabled = 1").all();
ok(enabled.length === 3 && enabled.every((p) => /^SELECT 'ok' AS expected/.test(p.probe_sql) && !/\b(insert|update|delete|drop|create|alter|pragma|attach)\b/i.test(p.probe_sql)), "three enabled probes, SELECT only, no write keyword in any literal", enabled.map((p) => p.control));

// ---- 3. research-floor-rearm: a healthy sweep that re-arms nothing
db = build(); db.exec(sql1); db.exec(sql2); clear(db);
for (let h = 0; h < 49; h++) event(db, "idea-to-publish", h * 60 + 20);
event(db, "park-rearm-tick", 49 * 60 + 5);
ok(observed(db, RF) === "ok", "case 5: the sweep runs every hour and re-arms nothing for 49 hours (last park-rearm-tick 49 hours ago): ok", observed(db, RF));
clear(db); event(db, "park-rearm-tick", 3);
ok(/no idea-to-publish event in 180 minutes/.test(observed(db, RF)), "a fresh park-rearm-tick alone does not make the sweep healthy: the minute-0 branch must have run", observed(db, RF));
clear(db); event(db, "idea-to-publish", 170); ok(observed(db, RF) === "ok", "a heartbeat 170 minutes ago is inside the window");
clear(db); event(db, "idea-to-publish", 190); ok(/no idea-to-publish event in 180 minutes/.test(observed(db, RF)), "a heartbeat 190 minutes ago fires (the bad state fails)");

// ---- 4. file 2
const note = one(store, "SELECT window_note FROM control_alternate_probes WHERE control = ?", OPS).window_note;
ok(note.includes("GitHub secret scanning does not cover D1 rows") && note.includes("the tool results of the owner session") && note.includes("redactJobBody masks a code, a login-path URL and a token"), "the window note says the tool messages are the owner's tool results, masked at write, and that secret scanning does not cover D1 rows");
ok(!note.includes("repository files, CLI help, test text that mention the phrases") && note.includes("Every other origin, and a budget-promote payload that is not valid JSON, is scanned whole") && note.startsWith(afterOne.opsNote.slice(0, 120)), "and the rest of the note is intact");
const rfEv = one(store, "SELECT evidence FROM control_registry WHERE control = ?", RF).evidence, evEv = one(store, "SELECT evidence FROM control_registry WHERE control = ?", EV).evidence;
ok(rfEv.startsWith(RF_EVIDENCE0 + " CHAOS-DRILL-CALIBRATION-2") && /frozen one-shot input of floorRearmTick \(34 rows re-armed on 2026-10-19\)/.test(rfEv) && /No automated dropper of bak tables/.test(rfEv) && /park-rearm-tick is logged only when a row was re-armed/.test(rfEv) && /PARK-REARM-HEARTBEAT-1/.test(rfEv), "the research-floor-rearm evidence keeps its text and gains why the frozen list is gone and why the drill reads idea-to-publish");
ok(evEv.startsWith(EV_EVIDENCE0 + " CHAOS-DRILL-CALIBRATION-2") && /does not show that the planner works independently of recoverWip/.test(evEv), "the evolve-wip-recovery evidence keeps its text and says what its probe does not show");
const bak = store.prepare("SELECT field, control, old_text FROM bak_20261026_chaos_calib2 ORDER BY control").all();
ok(bak.length === 3 && bak.find((b) => b.control === OPS).old_text === afterOne.opsNote && bak.find((b) => b.control === RF).old_text === RF_EVIDENCE0 && bak.find((b) => b.control === EV).old_text === EV_EVIDENCE0, "the backup table holds the three original texts", bak.length);
const fmRow = one(store, "SELECT * FROM failure_modes WHERE fm_key = 'drill-probe-conditional-heartbeat'");
const det = one(store, "SELECT * FROM remediation_contracts WHERE class = 'fm-drill-probe-conditional-heartbeat'");
ok(fmRow && fmRow.probe_class === "fm-drill-probe-conditional-heartbeat" && fmRow.issue_id === 1000057 && fmRow.root_cause && fmRow.remediation && fmRow.detector && fmRow.trigger_condition && fmRow.symptom && fmRow.blast_radius, "the failure mode row is complete and names issue 1000057", fmRow);
ok(det && det.verify_transport === "d1-query" && det.status === "active" && det.module === "failure-mode" && det.issue_id === null && !/\b(insert|update|delete|drop|create|alter|pragma|attach)\b/i.test(det.verify_probe), "the detector contract is an active d1-query failure-mode probe with no write keyword", det && det.verify_probe);
const detRun = (d) => d.prepare(det ? det.verify_probe : "SELECT '0' AS expected, 'missing detector' AS observed").get();
ok(detRun(store).expected === "0" && detRun(store).observed === "0", "the detector reads 0 on the calibrated state (the old probe is a disabled history row)", detRun(store));
db = build(); db.exec(sql1); db.exec(sql2);
db.prepare("UPDATE control_alternate_probes SET probe_sql = probe_sql || ' /* park-rearm-tick */' WHERE control = ?").run(RF);
ok(detRun(db).observed === "1", "the detector fails when an enabled drill probe reads park-rearm-tick again", detRun(db));
db.prepare("UPDATE control_alternate_probes SET enabled = 0 WHERE control = ?").run(RF);
ok(detRun(db).observed === "0", "and ignores a disabled history row");
ok(one(store, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'CHAOS-DRILL-CALIBRATION-2:') = 1").n === 1, "one decision is logged");
const dl = one(store, "SELECT * FROM decision_log WHERE instr(action, 'CHAOS-DRILL-CALIBRATION-2:') = 1");
const cols = ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"];
ok(cols.every((c) => typeof dl[c] === "string" && dl[c].trim().length > 3 || c === "reach_gain" && dl[c] === "none") && !cols.some((c) => / within /i.test(dl[c])), "the decision row fills all eleven columns and holds no ' within ' (a prediction form the scorecard would grade)", cols.filter((c) => !dl[c]));
ok(dl.predicted_outcome.includes("issues 100482 and 1000057") && dl.rollback_path.includes("Rollback header"), "the decision row states its prediction and its revert path");

// ---- hygiene of the file
const lits = [...code2.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => Buffer.byteLength(m[1]));
ok(lits.every((n) => n <= 50), "no LIKE or GLOB pattern over 50 bytes (D1 limit)", lits);
ok(!/\bCREATE\s+TRIGGER\b/i.test(code2) && !/^\s*(DROP|DELETE)\b/im.test(code2) && /^-- APPLY-BY: ci$/m.test(sql2) && /^-- DB: qnfo-audit$/m.test(sql2) && /^-- BACKUP: bak_20261026_chaos_calib2$/m.test(sql2), "no trigger, no DELETE or DROP in the body, the opt-in headers and the backup header are present");
ok(/^CREATE TABLE IF NOT EXISTS bak_20261026_chaos_calib2 AS\s+SELECT/m.test(code2.trim()) && code2.trim().startsWith("CREATE TABLE IF NOT EXISTS bak_20261026_chaos_calib2"), "the backup is the first statement and is created AS SELECT from the rows it protects");
ok((code2.match(/;\s*$/gm) || []).length === 7 && !/;[^\n]*\S/.test(code2.replace(/;\s*$/gm, "")), "seven statements, no semicolon inside a literal");
ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql2) && !/claude\.ai|anthropic\.com/i.test(sql2) && !/(sk-|ghp_|xox[bp]-)[A-Za-z0-9]{10,}/.test(sql2), "no e-mail address, no claude.ai link, no secret value");
ok(/\n-- Rollback: [^\n]+\n/.test(sql2) && !/^-- Rollback:\s*$/m.test(sql2) && rollback.length > 200, "the Rollback header is one line");

// ---- idempotent, changed text left alone
db = build(); db.exec(sql1); db.exec(sql2);
const s2 = snap(db), bakN = db.prepare("SELECT COUNT(*) AS n FROM bak_20261026_chaos_calib2").get().n;
db.exec(sql2);
ok(snap(db) === s2 && db.prepare("SELECT COUNT(*) AS n FROM bak_20261026_chaos_calib2").get().n === bakN, "a second apply changes no row and adds no backup row");
db = build(); db.exec(sql1);
db.prepare("UPDATE control_alternate_probes SET window_note = 'rewritten by a later session' WHERE control = ?").run(OPS);
db.prepare("UPDATE control_registry SET evidence = evidence || ' CHAOS-DRILL-CALIBRATION-2 already noted' WHERE control IN (?, ?)").run(RF, EV);
db.exec(sql2);
ok(one(db, "SELECT window_note FROM control_alternate_probes WHERE control = ?", OPS).window_note === "rewritten by a later session" && one(db, "SELECT evidence FROM control_registry WHERE control = ?", RF).evidence === RF_EVIDENCE0 + " CHAOS-DRILL-CALIBRATION-2 already noted" && one(db, "SELECT evidence FROM control_registry WHERE control = ?", EV).evidence === EV_EVIDENCE0 + " CHAOS-DRILL-CALIBRATION-2 already noted", "a note or evidence someone has since rewritten is not overwritten and not appended twice");
db = build(); db.exec(sql1); db.exec("DELETE FROM control_registry"); db.exec(sql2);
ok(one(db, "SELECT COUNT(*) AS n FROM failure_modes").n === 1 && one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'CHAOS-DRILL-CALIBRATION-2:') = 1").n === 1, "with no register rows the file still applies");

// ---- rollback, without the backup table
db = build(); db.exec(sql1);
const before = JSON.stringify([db.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all(), db.prepare("SELECT * FROM control_registry ORDER BY 1").all()]);
db.exec(sql2); db.exec("DROP TABLE bak_20261026_chaos_calib2"); db.exec(rollback);
const after = JSON.stringify([db.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all(), db.prepare("SELECT * FROM control_registry ORDER BY 1").all()]);
ok(before === after, "the Rollback line restores the window note and both evidence texts to their exact earlier text, with the backup table gone (it is purged by the fleet)");
ok(one(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'drill-probe-conditional-heartbeat'").n === 0 && one(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-drill-probe-conditional-heartbeat'").n === 0, "and removes the failure mode and its detector");
ok(one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'CHAOS-DRILL-CALIBRATION-2:') = 1").n === 1, "and leaves the decision row (decision_log is append-only)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
