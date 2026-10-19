// TYPED-INPUT-MODEL-1 data migration suite: applies migrations/2026-10-19-clairic-typed-input.sql on SQLite.
// Proves: the standing chat/candidate clairic row becomes modality 'extraction', status 'catalogued' with the reason in notes; a row the worker already moved, another model and a model in
// production are untouched; the born-superseded contract of issue-100250 becomes an active d1-query probe that reads 0 while the catalog row is a chat candidate, 1 once it is classified,
// does not read agent_issues, and is one literal read; another issue's contract is untouched; a second apply changes nothing; one decision_log row with a prediction in the parsed form;
// the Rollback header restores both rows from the backup tables; the file passes scripts/apply_migrations.py --check.
// Run: node migrations/clairic-typed-input.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mig = readFileSync(new URL("./2026-10-19-clairic-typed-input.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE cf_model_catalog (slug TEXT PRIMARY KEY, model_id TEXT, task_type TEXT, modality TEXT, status TEXT, last_eval_ts TEXT, best_score REAL, notes TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT NOT NULL DEFAULT '', verify_transport TEXT, status TEXT DEFAULT 'active', last_verdict TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT, next_due_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
INSERT INTO cf_model_catalog (slug, model_id, task_type, modality, status, last_eval_ts, best_score, notes) VALUES
 ('clairic', '@cf/cloudflare/clairic', 'Text Generation', 'chat', 'candidate', '2026-10-19 18:20:16', 0, 'last verdict: harness_error (every probe failed at the harness level)'),
 ('other-chat', '@cf/vendor/other-chat', 'Text Generation', 'chat', 'candidate', NULL, NULL, 'x'),
 ('prod', '@cf/vendor/prod', 'Text Generation', 'chat', 'in_production', NULL, 1, 'y');
INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, status, last_verdict, attempts, next_due_at) VALUES
 ('issue-100250', 100250, 'no earlier birth template matched', 'VACUOUS-PROBE-V3-1', 'SELECT ''closed'' AS expected, ''x'' AS observed', 'd1-query', 'superseded', 'superseded:closure-observing-probe-at-birth', 2, '2026-10-19 18:20:33'),
 ('issue-100251', 100251, 'p', 'a', 'SELECT 1', 'd1-query', 'superseded', 'superseded:x', 0, '2026-10-19 18:20:33');
INSERT INTO agent_issues (id, status) VALUES (100250, 'open');
`);
const cat = (slug) => db.prepare("SELECT modality, status, notes FROM cf_model_catalog WHERE slug = ?").get(slug);
const con = (cls) => db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(cls);
const before = { other: JSON.stringify(cat("other-chat")), prod: JSON.stringify(cat("prod")), c51: JSON.stringify(con("issue-100251")) };
const origCon = JSON.stringify(con("issue-100250"));

const probeOf = () => con("issue-100250").verify_probe;
db.exec(mig);

const c = cat("clairic");
ok(c.modality === "extraction" && c.status === "catalogued" && /extraction model/.test(c.notes) && /\{model, fields\}/.test(c.notes) && /TYPED-INPUT-MODEL-1/.test(c.notes), "clairic is classified out of the chat lane with the reason", c);
ok(JSON.stringify(cat("other-chat")) === before.other && JSON.stringify(cat("prod")) === before.prod, "another chat model and a model in production are untouched");

const k = con("issue-100250");
ok(k.status === "active" && k.verify_transport === "d1-query" && k.last_verdict === null && k.attempts === 0 && k.deferred_since === null && k.next_due_at !== "2026-10-19 18:20:33", "the contract is active, reset and due now", k);
ok(JSON.stringify(con("issue-100251")) === before.c51, "another issue's contract is untouched");
const low = " " + probeOf().toLowerCase() + " ";
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "alter table", "create table", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
ok(/^ select /.test(low) && low.indexOf(";") === -1 && !WRITE_KW.some((w) => low.indexOf(w) !== -1) && !low.includes("agent_issues"), "the probe is one literal read free of write keywords that does not read agent_issues");
const read = () => db.prepare(probeOf()).get();
ok(read().expected === "1" && read().observed === "1", "the probe reads 1 for the classified row", read());
db.prepare("UPDATE cf_model_catalog SET modality = 'chat', status = 'candidate' WHERE slug = 'clairic'").run();
ok(read().observed === "0", "and 0 when clairic is a chat candidate again", read());
db.prepare("UPDATE cf_model_catalog SET modality = 'typed-input', status = 'catalogued' WHERE slug = 'clairic'").run();
ok(read().observed === "1", "typed-input counts as classified", read());
db.prepare("DELETE FROM cf_model_catalog WHERE slug = 'clairic'").run();
ok(read().observed === "0", "a missing row reads 0", read());
db.prepare("INSERT INTO cf_model_catalog (slug, model_id, task_type, modality, status, notes) VALUES ('clairic', '@cf/cloudflare/clairic', 'Text Generation', 'extraction', 'catalogued', ?)").run(c.notes);

const snap = () => JSON.stringify([db.prepare("SELECT * FROM cf_model_catalog ORDER BY slug").all(), db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT COUNT(*) AS n FROM decision_log").get(), db.prepare("SELECT * FROM bak_20261019_clairic_catalog").all(), db.prepare("SELECT * FROM bak_20261019_clairic_contract").all()]);
const s1 = snap();
db.exec(mig);
ok(s1 === snap(), "a second apply changes nothing");
const dl = db.prepare("SELECT action, predicted_outcome FROM decision_log").all();
ok(dl.length === 1 && /^TYPED-INPUT-MODEL-1: /.test(dl[0].action) && /^[a-z_0-9]+ <= \d+ within 12 h$/.test(dl[0].predicted_outcome), "one decision_log row with a prediction in the parsed form", dl);

const bc = db.prepare("SELECT modality, status FROM bak_20261019_clairic_catalog").all();
ok(bc.length === 1 && bc[0].modality === "chat" && bc[0].status === "candidate", "the backup holds the chat candidate row", bc);
ok(JSON.stringify(db.prepare("SELECT status, verify_probe FROM bak_20261019_clairic_contract").all()) === JSON.stringify([{ status: "superseded", verify_probe: "SELECT 'closed' AS expected, 'x' AS observed" }]), "the backup holds the superseded contract");

const rb = mig.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
db.exec(rb);
ok(cat("clairic").modality === "chat" && cat("clairic").status === "candidate" && /harness_error/.test(cat("clairic").notes), "the Rollback restores the catalog row", cat("clairic"));
ok(con("issue-100250").status === "superseded" && con("issue-100250").verify_probe === "SELECT 'closed' AS expected, 'x' AS observed", "the Rollback restores the contract", con("issue-100250"));
void origCon;

const chk = spawnSync("python3", [fileURLToPath(new URL("../scripts/apply_migrations.py", import.meta.url)), "--check", fileURLToPath(new URL("./2026-10-19-clairic-typed-input.sql", import.meta.url))], { encoding: "utf8" });
ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "the file passes scripts/apply_migrations.py --check", chk.stdout + chk.stderr);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
