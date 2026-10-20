// REVISE-REFS-EXTEND-1 offline suite (agent_issues 100329, qnfo-research-exec 0.30.0).
// Applies migrations/2026-10-20-revise-guard-measure.sql (the state live today: the lever at measure) and then
// migrations/2026-10-20-revise-refs-extend.sql on SQLite (node:sqlite) over fixtures with the live column lists, the append-only decision_log triggers,
// the two live remediation_contracts triggers that rewrite a probe or set it due, and a cloud_ops_events table. It proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log, no DELETE or DROP in the body) and that apply_migrations.py --check accepts the file;
//   2. ops_config research_revise_shrink_guard goes measure -> on, and a row at any other value, or no row, is left alone;
//   3. the closing read of issue 100329 (d1-query, no semicolon, no write keyword, windows in minutes and at most 120) passes only when the lever is not measure, a routed
//      revise-refs-below-floor event sits 60 to 120 minutes back, and every such event has a floor-extend on the same row after it; the detector reads the same as a count;
//   4. control research-revise-refs-floor is demoted -> replace with its earlier evidence kept, control research-revise-refs-extend is added off the critical path with an alternate probe;
//   5. one decision row, a replay that changes nothing, and a Rollback that removes what the file added (and leaves the decision row);
//   6. the worker still emits the event texts the reads match on, and no longer gates the route on measure.
// Run: node --no-warnings migrations/revise-refs-extend.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const FILE = process.env.RRE_MIGRATION ? resolve(process.env.RRE_MIGRATION) : join(here, "2026-10-20-revise-refs-extend.sql");
const sql = norm(readFileSync(FILE, "utf8"));
const prior = norm(readFileSync(join(here, "2026-10-20-revise-guard-measure.sql"), "utf8"));
const worker = norm(readFileSync(join(root, "qnfo-research-exec", "worker.js"), "utf8"));
const consumer = norm(readFileSync(join(root, "scripts", "remediation_consumer.py"), "utf8"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
const rollback = hdr("Rollback");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 200, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body) && hdr("BACKUP") === "", "the body runs no DELETE FROM or DROP statement, so no BACKUP header is needed (the lever is updated, not deleted)");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai link and no skip-CI token");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");
ok(/Ordering, stated plainly/.test(sql) && /old 0\.29\.0 worker/.test(sql), "the file states the ordering hazard between the migration and the deploy");

const PY = ["python3", "python"].find((c) => spawnSync(c, ["-I", "-c", "print(1)"], { encoding: "utf8" }).status === 0);
if (PY) {
  const chk = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", FILE], { encoding: "utf8" });
  ok(chk.status === 0, "apply_migrations.py --check accepts the file", String(chk.stdout) + String(chk.stderr));
}

// ---- 6. the worker side of the reads ----
ok(/const _ro = _refsExtend \? reviseRefsOnly\(row, paper, p\.text, _floorGround\) : null;/.test(worker) && !/_refsExtend && !_shrinkMeasure/.test(worker), "the worker does not gate the reference route on measure");
const ver = (worker.match(/^var VERSION = "(\d+)\.(\d+)\.(\d+)/m) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] >= 30), "qnfo-research-exec is at 0.30.0 or later (a minor: a routing decision it now takes on its own)", ver);
ok(/"row=" \+ row\.id \+ " model=" \+ model \+ " applied="[^\n]*"; applied, " \+ \(_need \? "routed to the floor extension" : "no extension needed"\), "warn"\)/.test(worker) && /logEvent\(env, "revise-refs-below-floor"/.test(worker),
  "the worker logs revise-refs-below-floor as 'row=<id> model=...' ending 'routed to the floor extension' or 'no extension needed'");
ok(/logEvent\(env, "floor-extend", "row=" \+ row\.id \+ " round="/.test(worker), "the worker logs floor-extend as 'row=<id> round=...'");
ok(/\(await floorFlag\(env, "research_revise_shrink_guard"\)\) === "measure"/.test(worker) && /\(await floorFlag\(env, "research_revise_refs_extend"\)\) !== "off"/.test(worker), "the worker reads exactly measure for the guard lever and exactly off for the refs switch");

const DDL = `
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')),
  guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0,
  disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')),
  disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')),
  alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL,
  capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, status TEXT, text TEXT, job TEXT, meta TEXT);
`;
const OLD_PROBE = '{"paths": ["qnfo-research-exec/worker.js"], "contains":  "REVISE-REFS-EXTEND-1"}';
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
// live today: REVISE-GUARD-MEASURE-1 applied (lever measure, control demote) and the issue contract is the code-read for a comment
const world = (pre) => {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  if (pre !== "no-prior") db.exec(prior);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, last_verdict) VALUES ('issue-100329', 100329, 'p', 'a', ?, 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'code-probe-line-v1', 'fail')").run(OLD_PROBE);
  return db;
};
const lever = (db) => one(db, "SELECT value, note FROM ops_config WHERE key = 'research_revise_shrink_guard'");
const snap = (db) => JSON.stringify(["ops_config", "remediation_contracts", "failure_modes", "control_registry", "control_alternate_probes", "decision_log"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
let evn = 0;
const ev = (db, kind, text, min, job, status) => db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status, text, job) VALUES (?, ?, ?, ?, ?, ?)").run("e" + (++evn), ago(min), kind, status || "warn", text, job || "qnfo-research-exec");
const refs = (db, id, min, routed, job) => ev(db, "revise-refs-below-floor", "row=" + id + " model=@cf/openai/gpt-oss-120b applied=1 chars 41000->40500 refs 9->7 floor=8: drops the cited references 9 -> 7 under the floor of 8; applied, " + (routed === false ? "no extension needed" : "routed to the floor extension"), min, job);
const ext = (db, id, min, job) => ev(db, "floor-extend", "row=" + id + " round=1 chars 15534->28191 floor=20000 target=24000 uncited=4", min, job, "ok");

// ---- 2. apply on the live starting state ----
const db = world();
ok(lever(db).value === "measure" && one(db, "SELECT disposition FROM control_registry WHERE control = 'research-revise-refs-floor'").disposition === "demote", "fixture: the starting state is the lever at measure and the control demoted (REVISE-GUARD-MEASURE-1)");
const evidenceBefore = one(db, "SELECT evidence FROM control_registry WHERE control = 'research-revise-refs-floor'").evidence;
db.exec(sql);
ok(lever(db).value === "on" && /REVISE-REFS-EXTEND-1/.test(lever(db).note) && /Revert: set this row to measure/.test(lever(db).note), "ops_config research_revise_shrink_guard is on after the file, and the note says why and how to revert", lever(db));
ok(q(db, "SELECT * FROM ops_config").length === 1, "and it is the only ops_config row");
ok(lever(db).value !== "measure" && lever(db).value !== undefined, "the worker reads exactly measure as the lever, so on is the guard");

for (const [name, setup, want] of [
  ["a row at enforce", (d) => d.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('research_revise_shrink_guard', 'enforce', 'kept', '2026-10-01 00:00:00')").run(), { value: "enforce", note: "kept" }],
  ["a row at off", (d) => d.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('research_revise_shrink_guard', 'off', 'kept', '2026-10-01 00:00:00')").run(), { value: "off", note: "kept" }],
  ["a row already on", (d) => d.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('research_revise_shrink_guard', 'on', 'kept', '2026-10-01 00:00:00')").run(), { value: "on", note: "kept" }]
]) {
  const d = world("no-prior");
  setup(d);
  d.exec(sql);
  const r = one(d, "SELECT value, note, updated_at FROM ops_config WHERE key = 'research_revise_shrink_guard'");
  ok(r.value === want.value && r.note === want.note && r.updated_at === "2026-10-01 00:00:00", name + " is left alone", r);
}
{
  const d = world("no-prior");
  d.exec(sql);
  ok(q(d, "SELECT * FROM ops_config").length === 0, "an absent row stays absent (the guard is on when the key is absent)");
}

// ---- 3. the closing read of issue 100329 and the detector ----
const c = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-100329'");
ok(c.verify_transport === "d1-query" && c.status === "active" && c.issue_id === 100329 && c.attempts === 0 && c.last_verdict === null && c.module === "refs-extend-closing-v1", "the issue contract is now an active d1-query read, reset for a fresh verdict", c);
ok(c.verify_probe !== OLD_PROBE && !/;/.test(c.verify_probe) && !/contains/.test(c.verify_probe), "and no longer the code-read for a comment; no semicolon survives the live rewrite trigger");
ok(c.next_due_at !== null, "the live rerun trigger set it due now");
const WRITE_KW = (consumer.match(/WRITE_KW = \(([\s\S]*?)\)\n/) || ["", ""])[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
ok(WRITE_KW.length >= 10, "fixture: the consumer's write-keyword list was read from scripts/remediation_consumer.py", WRITE_KW);
const dt = one(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-revise-refs-extend-unrestored'");
ok(dt && dt.verify_transport === "d1-query" && dt.status === "active" && dt.module === "failure-mode" && dt.issue_id === null && !/;/.test(dt.verify_probe), "the detector is an active d1-query contract without a semicolon", dt && dt.verify_probe);
for (const [name, probe] of [["issue read", c.verify_probe], ["detector", dt.verify_probe]]) {
  const low = probe.toLowerCase();
  ok(WRITE_KW.every((k) => !low.includes(k)), name + " holds none of the write keywords the runners scan for", WRITE_KW.filter((k) => low.includes(k)));
  const wins = Array.from(probe.matchAll(/'-(\d+) (minutes|hours|days)'/g)).map((m) => [Number(m[1]), m[2]]);
  ok(wins.length >= 3 && wins.every(([n, u]) => u === "minutes" && n <= 120), name + " states every window in minutes, none above 120 (SLA-120M-1)", wins);
}
ok(one(db, c.verify_probe).expected === "ok" && one(db, dt.verify_probe).expected === "0", "the issue read expects ok and the detector expects 0");
const R = (d) => one(d, c.verify_probe).observed;
const D = (d) => one(d, dt.verify_probe).observed;

{
  // lever on, nothing logged yet (the deploy has not produced a routed event): a deferral, and the detector reads 0
  const d = world(); d.exec(sql);
  // the consumer's deferral rule: 'pending: <reason>' is a deferral unless it carries a measured-pending word or operator (scripts/remediation_consumer.py is_measured_pending)
  const mpw = (consumer.match(/_MEASURED_PENDING_WORDS = \(([^)]*)\)/) || ["", ""])[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  const mpo = (consumer.match(/_MEASURED_PENDING_OPS = \(([^)]*)\)/) || ["", ""])[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  ok(mpw.length >= 5 && mpo.length === 4, "fixture: the consumer's measured-pending words and operators were read", [mpw, mpo]);
  const pend = R(d).toLowerCase();
  ok(/^pending: /.test(R(d)) && !mpw.some((w) => pend.includes(w)) && !mpo.some((o) => (" " + pend + " ").includes(o)) && D(d) === "0", "no routed event yet: pending and not the measured-pending shape (a deferral for the consumer, never a pass or a fail), detector 0", R(d));
  refs(d, "row-a", 90);
  ok(/has no floor-extend event on its row/.test(R(d)) && D(d) === "1", "a routed event 90 minutes old with no floor-extend: the read fails and the detector counts 1", [R(d), D(d)]);
  ext(d, "row-a", 80);
  ok(R(d) === "ok" && D(d) === "0", "a floor-extend on the same row after it: the read passes and the detector reads 0", [R(d), D(d)]);
}
{
  const d = world(); d.exec(sql);
  // the lever left on measure fails the read whatever the events say, and the detector adds 1
  d.prepare("UPDATE ops_config SET value = 'measure' WHERE key = 'research_revise_shrink_guard'").run();
  refs(d, "row-a", 90); ext(d, "row-a", 80);
  ok(/still measure/.test(R(d)) && D(d) === "1", "the lever back on measure fails the read and counts 1 in the detector", [R(d), D(d)]);
  d.prepare("DELETE FROM ops_config WHERE key = 'research_revise_shrink_guard'").run();
  ok(R(d) === "ok" && D(d) === "0", "an absent lever row is the guard on: the read passes", [R(d), D(d)]);
}
{
  const d = world(); d.exec(sql);
  refs(d, "row-a", 100); ext(d, "row-a", 95);
  refs(d, "row-b", 70);
  ok(/has no floor-extend event on its row/.test(R(d)) && D(d) === "1", "one restored row does not cover another unrestored row", [R(d), D(d)]);
  ext(d, "row-b", 20);
  ok(R(d) === "ok" && D(d) === "0", "the second row's floor-extend (logged later, still inside the window) restores it", [R(d), D(d)]);
}
{
  const d = world(); d.exec(sql);
  refs(d, "idea-reality-x", 90);
  ext(d, "idea-reality-x-2", 80);
  ok(/has no floor-extend event on its row/.test(R(d)) && D(d) === "1", "a floor-extend on a row whose id extends this id (row=a-2 for row=a) does not count for it", [R(d), D(d)]);
  ext(d, "idea-reality-x", 85);
  ok(R(d) === "ok", "the row's own floor-extend does", R(d));
}
{
  const d = world(); d.exec(sql);
  refs(d, "row-a", 90);
  ext(d, "row-a", 100); // logged BEFORE the revise event: not the extension of this patch
  ok(/has no floor-extend event on its row/.test(R(d)) && D(d) === "1", "a floor-extend older than the revise event does not restore it", [R(d), D(d)]);
}
{
  const d = world(); d.exec(sql);
  refs(d, "row-a", 30);                       // too young to judge (inside the 60-minute grace)
  refs(d, "row-b", 150);                      // outside the 120-minute window
  refs(d, "row-c", 90, false);                // no extension needed: not a routed event
  refs(d, "row-d", 90, true, "other-worker");  // another job
  ev(d, "floor-extend", "row=row-e round=1 chars 1->2", 80, "other-worker", "ok");
  ok(/^pending: /.test(R(d)) && D(d) === "0", "an event inside 60 minutes, one older than 120, a 'no extension needed' event and another job's event are not read", [R(d), D(d)]);
  refs(d, "row-e", 90, true);
  ok(/has no floor-extend event on its row/.test(R(d)) && D(d) === "1", "a floor-extend of another job does not restore a row", [R(d), D(d)]);
}
{
  // a paper whose extension ran in several rounds is restored by any of them
  const d = world(); d.exec(sql);
  refs(d, "row-a", 90); ext(d, "row-a", 85); ext(d, "row-a", 75); refs(d, "row-b", 65); ext(d, "row-b", 60);
  ok(R(d) === "ok" && D(d) === "0", "several rounds and several rows all restored: ok, 0", [R(d), D(d)]);
}

// ---- 4. the controls ----
const fl = one(db, "SELECT * FROM control_registry WHERE control = 'research-revise-refs-floor'");
ok(fl.disposition === "replace" && fl.disposition_state === "applied" && fl.critical_path === 0 && fl.kind === "guard" && fl.alternate_tested_at === null && fl.issue_id === 99913, "research-revise-refs-floor is replace/applied off the critical path with no hand stamp", fl);
ok(fl.evidence.startsWith(evidenceBefore) && /REVISE-REFS-EXTEND-1/.test(fl.evidence) && /0\.30\.0/.test(fl.evidence), "and keeps its earlier evidence, with the new evidence appended");
ok(/research_revise_refs_extend = off/.test(fl.alternate_path) && /research_floor_extend/.test(fl.alternate_path) && /gate-refcount/.test(fl.alternate_path), "and names the replacement, the off lever and the release gate", fl.alternate_path);
const flp = one(db, "SELECT * FROM control_alternate_probes WHERE control = 'research-revise-refs-floor'");
ok(flp && flp.enabled === 1 && one(db, flp.probe_sql).observed === "ok", "its alternate probe (the floor extension is not off) is unchanged and reads ok");

const sw = one(db, "SELECT * FROM control_registry WHERE control = 'research-revise-refs-extend'");
ok(sw && sw.kind === "kill-switch" && sw.disposition === "keep" && sw.disposition_state === "applied" && sw.critical_path === 0 && sw.issue_id === 100329 && sw.alternate_tested_at === null && /ops_config research_revise_refs_extend/.test(sw.location), "the new off lever is a kill-switch control, kept, applied, off the critical path", sw);
ok(/research_revise_refs_extend = off restores the refusal/.test(sw.alternate_path) && /control_alternate_probes row research-revise-refs-extend/.test(sw.evidence), "with its alternate path and the probe named in the evidence");
const sp = one(db, "SELECT * FROM control_alternate_probes WHERE control = 'research-revise-refs-extend'");
ok(sp && sp.enabled === 1 && !/;/.test(sp.probe_sql) && WRITE_KW.every((k) => !sp.probe_sql.toLowerCase().includes(k)), "it has an enabled alternate probe without a semicolon or a write keyword");
{
  const wins = Array.from(sp.probe_sql.matchAll(/'-(\d+) (minutes|hours|days)'/g)).map((m) => [Number(m[1]), m[2]]);
  ok(wins.length === 1 && wins[0][1] === "minutes" && wins[0][0] <= 120, "whose window is in minutes and at most 120", wins);
}
{
  const d = world(); d.exec(sql);
  const P = (x) => one(d, x);
  ok(P(sp.probe_sql).expected === "ok" && /no revise-patch event in 120 minutes/.test(P(sp.probe_sql).observed), "the alternate fails with the reason while the revise route logged nothing in 120 minutes", P(sp.probe_sql));
  ev(d, "revise-patch", "row=a applied=1", 10, "qnfo-research-exec", "ok");
  ok(P(sp.probe_sql).observed === "ok", "and reads ok with a recent revise-patch event and the absent switch (on)");
  d.prepare("INSERT INTO ops_config (key, value) VALUES ('research_revise_refs_extend', 'off')").run();
  ok(P(sp.probe_sql).observed === "ok", "off is a value the stage reads");
  d.prepare("UPDATE ops_config SET value = 'OFF' WHERE key = 'research_revise_refs_extend'").run();
  ok(P(sp.probe_sql).observed !== "ok" && /only the exact value off/.test(P(sp.probe_sql).observed), "OFF is not read as off by the stage, so the probe says so", P(sp.probe_sql));
}

// ---- 5. the failure mode, the decision, the replay, the Rollback ----
const fm = one(db, "SELECT * FROM failure_modes WHERE fm_key = 'revise-refs-extend-unrestored'");
ok(fm && fm.issue_id === 100329 && fm.probe_class === "fm-revise-refs-extend-unrestored" && fm.first_seen === "2026-10-20" && fm.trigger_condition && fm.symptom && fm.blast_radius, "one failure mode, filed on issue 100329, with its detector class and the three descriptive fields");
const dl = q(db, "SELECT * FROM decision_log WHERE instr(action, 'REVISE-REFS-EXTEND-1:') = 1");
ok(dl.length === 1 && q(db, "SELECT * FROM decision_log").length === 2, "one new decision row beside REVISE-GUARD-MEASURE-1's", dl.length);
ok(dl[0].predicted_outcome && dl[0].reach_gain && dl[0].surfaces_tested && dl[0].capability_gain && dl[0].rollback_path && /research_revise_refs_extend = off/.test(dl[0].rollback_path), "and it carries predicted_outcome, reach_gain, surfaces_tested, capability_gain and a revert path");
const once = snap(db);
db.exec(sql);
ok(snap(db) === once, "a replay changes nothing (config, contracts, failure mode, controls, probes, decision)");

for (const stmt of rollback.split(/;\s*/).filter(Boolean)) db.exec(stmt);
ok(lever(db).value === "measure" && /REVISE-GUARD-MEASURE-1/.test(lever(db).note), "the Rollback puts the lever back to measure");
ok(q(db, "SELECT * FROM failure_modes WHERE fm_key = 'revise-refs-extend-unrestored'").length === 0 && q(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-revise-refs-extend-unrestored'").length === 0, "removes the failure mode and its detector");
ok(q(db, "SELECT * FROM control_registry WHERE control = 'research-revise-refs-extend'").length === 0 && q(db, "SELECT * FROM control_alternate_probes WHERE control = 'research-revise-refs-extend'").length === 0, "removes the new control and its probe");
ok(one(db, "SELECT disposition FROM control_registry WHERE control = 'research-revise-refs-floor'").disposition === "demote", "puts research-revise-refs-floor back to demote");
ok(q(db, "SELECT * FROM decision_log").length === 2, "and leaves both decision rows");
ok(one(db, "SELECT verify_transport FROM remediation_contracts WHERE class = 'issue-100329'").verify_transport === "d1-query", "and leaves the stronger closing read in place");
db.exec(sql);
ok(lever(db).value === "on" && q(db, "SELECT * FROM decision_log").length === 2, "the file applies again after the Rollback and adds no second decision");

console.log("revise-refs-extend: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
