// CONTROL-ALT-PROBES-RUNNER-1 (qnfo-fleet-control 0.40.0, agent_issues 100217): the 6-hourly chaosDrill also runs the read-only alternate probes of
// control_alternate_probes (CONTROL-ALT-PROBES-1). Slices the CHAOS-DRILL-1 block out of worker.js and runs chaosDrill against an in-memory SQLite D1
// (node:sqlite). Proves: a passing control probe stamps control_registry.alternate_tested_at and the probe row; a failing probe leaves alternate_tested_at
// unchanged and files exactly one CHAOS-DRILL-FAILED-1: control:<name> issue; a second failing run files none; a later pass closes the issue with
// close_evidence and stamps the control; a disabled row is skipped; a probe whose SQL errors fails with the error; a missing control_alternate_probes
// table leaves the spof pass intact; the spof stamp path and the untested metric (spof rows only) are unchanged; the event text carries controls=N
// control_pass=M.
//   node qnfo-fleet-control/chaos-drill-controls.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// ---- CHAOS-DRILL-1:BEGIN"), b = src.indexOf("// ---- CHAOS-DRILL-1:END ----");
if (a < 0 || b < a) { console.log("FAIL block markers"); console.log("1 failed"); process.exit(1); }
const logged = [];
const mod = new Function("__name", "randHex", "pdfBacklogRelay", "console", src.slice(a, b) + "\nreturn { chaosDrill };")(function () {}, () => "abcd", async () => ({ ran: false }), { error: (m) => logged.push(m) });

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 500) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE spof_alternate_probes (component TEXT PRIMARY KEY, probe_sql TEXT, exercise TEXT, window_note TEXT, enabled INTEGER DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT);
CREATE TABLE spof_registry_resolved (component TEXT PRIMARY KEY, alternate_tested_at TEXT);
CREATE TABLE spof_registry (component TEXT PRIMARY KEY, alternate_tested_at TEXT, reviewed_at TEXT, alternate_path TEXT);
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, alternate_tested_at TEXT, reviewed_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT, triaged_at TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, job TEXT, status TEXT, text TEXT);
INSERT INTO metric_registry (metric) VALUES ('spof_alternates_untested_24h');
INSERT INTO spof_alternate_probes (component, probe_sql, window_note) VALUES ('relay', 'SELECT ''ok'' AS expected, ''ok'' AS observed', '24 h');
INSERT INTO spof_registry_resolved (component) VALUES ('relay');
INSERT INTO spof_registry (component, alternate_path) VALUES ('relay', 'a second path');
INSERT INTO control_registry (control) VALUES ('ctl-pass'), ('ctl-fail'), ('ctl-off'), ('ctl-error');
INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES
 ('ctl-pass', 'SELECT ''ok'' AS expected, ''ok'' AS observed', '30 min', 1),
 ('ctl-fail', 'SELECT ''ok'' AS expected, ''no evidence'' AS observed', '30 min', 1),
 ('ctl-off', 'SELECT ''ok'' AS expected, ''no evidence'' AS observed', '30 min', 0);`);
const env = { AUDIT: { prepare(sql) { let args = []; const st = {
  bind: (...x) => { args = x.map((v) => (v === undefined ? null : v)); return st; },
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) || null,
  all: async () => ({ results: db.prepare(sql).all(...args) }) }; return st; } } };
const q = (sql, ...p) => db.prepare(sql).all(...p);
const openIssues = () => q("SELECT title FROM agent_issues WHERE status = 'open' ORDER BY title").map((r) => r.title);

let r = await mod.chaosDrill(env, true);
ok(r.ok === true && r.controls === 2 && r.control_pass === 1, "first drill: two enabled controls judged, one passes (the disabled row is skipped)", r);
ok(r.probes === 1 && r.passed === 1, "the spof pass is unchanged: one probe, one pass", r);
const reg = Object.fromEntries(q("SELECT control, alternate_tested_at, reviewed_at FROM control_registry").map((x) => [x.control, x]));
ok(reg["ctl-pass"].alternate_tested_at && reg["ctl-pass"].reviewed_at === reg["ctl-pass"].alternate_tested_at, "a passing control probe stamps alternate_tested_at and reviewed_at", reg["ctl-pass"]);
ok(reg["ctl-fail"].alternate_tested_at === null && reg["ctl-off"].alternate_tested_at === null, "a failing probe and a disabled row leave alternate_tested_at unchanged", reg);
const cap = Object.fromEntries(q("SELECT control, last_run_at, last_pass, last_pass_at, last_observed FROM control_alternate_probes").map((x) => [x.control, x]));
ok(cap["ctl-pass"].last_pass === 1 && cap["ctl-pass"].last_pass_at && cap["ctl-pass"].last_run_at, "the passing row records last_run_at, last_pass and last_pass_at", cap["ctl-pass"]);
ok(cap["ctl-fail"].last_pass === 0 && cap["ctl-fail"].last_pass_at === null && cap["ctl-fail"].last_observed === "no evidence", "the failing row records last_pass 0 and what it observed, and no last_pass_at", cap["ctl-fail"]);
ok(cap["ctl-off"].last_run_at === null, "a disabled row is never run", cap["ctl-off"]);
ok(openIssues().join("|") === "CHAOS-DRILL-FAILED-1: control:ctl-fail", "exactly one issue is filed, for the failing control", openIssues());
const iss = q("SELECT description, source, priority FROM agent_issues")[0];
ok(/control_alternate_probes \(control ctl-fail\)/.test(iss.description) && /alternate path of this control/.test(iss.description) && iss.source === "chaos-drill", "the issue names the control and its probe table", iss);
const spof = q("SELECT alternate_tested_at FROM spof_registry_resolved WHERE component = 'relay'")[0];
ok(spof.alternate_tested_at, "the spof stamp path still runs for a spof component", spof);
const ev = q("SELECT text, status FROM cloud_ops_events WHERE kind = 'chaos-drill'")[0];
ok(/probes=1 pass=1 controls=2 control_pass=1 /.test(ev.text) && /control:ctl-fail=FAIL/.test(ev.text) && ev.status === "warn", "the event text carries controls=N control_pass=M and the control verdicts; a filed issue makes it a warn", ev);
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'spof_alternates_untested_24h'").get().last_value === "0", "chaosUntested counts the spof rows only: a failing control does not raise spof_alternates_untested_24h");

r = await mod.chaosDrill(env, true);
ok(r.filed === 0 && openIssues().length === 1, "a second failing run files no second issue", { r, open: openIssues() });

db.prepare("UPDATE control_alternate_probes SET probe_sql = 'SELECT ''ok'' AS expected, ''ok'' AS observed' WHERE control = 'ctl-fail'").run();
r = await mod.chaosDrill(env, true);
ok(r.closed === 1 && openIssues().length === 0 && r.control_pass === 2, "a later pass closes the issue", { r, open: openIssues() });
const closed = q("SELECT a.status, t.close_evidence FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id")[0];
ok(closed.status === "closed" && /CHAOS-DRILL-1 .*passed again/.test(closed.close_evidence), "it is closed with close_evidence", closed);
ok(q("SELECT alternate_tested_at FROM control_registry WHERE control = 'ctl-fail'")[0].alternate_tested_at, "and the control is stamped tested");

db.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES ('ctl-error', 'SELECT FROM nowhere', '30 min', 1)").run();
r = await mod.chaosDrill(env, true);
ok(r.control_pass === 2 && r.controls === 3 && /^CHAOS-DRILL-FAILED-1: control:ctl-error$/.test(openIssues().join("|")), "a probe whose SQL errors fails and files its own issue", { r, open: openIssues() });
ok(/probe error/.test(q("SELECT last_observed FROM control_alternate_probes WHERE control = 'ctl-error'")[0].last_observed), "the error is the observed text");

db.exec("DROP TABLE control_alternate_probes");
r = await mod.chaosDrill(env, true);
ok(r.ok === true && r.controls === 0 && r.probes === 1 && r.passed === 1, "a missing control_alternate_probes table leaves the spof pass intact", r);
ok(logged.some((m) => /chaos-drill-controls/.test(m)), "and the unreadable table is logged, not silent");

ok(/chaosDrill\(env\)\.catch\(/.test(src) || src.indexOf('ctx.waitUntil(chaosDrill(env).catch(') > 0, "the hourly tick still runs the drill");
const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(v && (Number(v[1]) > 0 || Number(v[2]) >= 40), "VERSION is at least 0.40.0 (VERSION-MINOR-CAPABILITY-1: the worker now stamps controls tested on its own)", v && v[0]);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
