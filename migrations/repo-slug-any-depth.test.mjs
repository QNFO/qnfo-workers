// REPO-SLUG-ANY-DEPTH-1 offline suite: runs migrations/2026-10-19-repo-slug-any-depth.sql on SQLite after the file it replaces.
// Proves: before the apply a 'QNFO/QNFO/qnfo-workers' row stays as written and the detector reads pass (the blind spot); after
// it, live rows of any depth are repaired, new inserts and later updates are reduced to the bare slug, a bare slug and a
// non-QNFO repo are untouched, the detector fails on a slash it cannot repair and passes again once it is gone, the failure
// mode is recorded, re-applying changes nothing, and the Rollback line restores the trigger, the probe and the rows.
// Run: node migrations/repo-slug-any-depth.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-repo-slug-any-depth.sql", import.meta.url), "utf8");
const prior = readFileSync(new URL("./2026-10-19-resolve-code-task-publish-slug.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, status TEXT, updated_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, next_due_at TEXT, status TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);`);
// The trigger and probe as the prior migration wrote them (the live definitions on 2026-10-19).
const trig = prior.match(/CREATE TRIGGER code_tasks_repo_slug_ai[\s\S]*?END;/);
ok(!!trig, "the prior trigger is found");
db.exec(trig[0]);
const pm = prior.match(/'fm-code-task-repo-slug'[\s\S]*?'(SELECT ''1'' AS expected,(?:[^']|'')*)'/);
ok(!!pm, "the prior probe is found");
const oldProbe = pm[1].replace(/''/g, "'");
db.prepare("INSERT INTO remediation_contracts VALUES ('fm-code-task-repo-slug', ?, '2026-10-19 06:00:00', 'active')").run(oldProbe);
const ins = db.prepare("INSERT INTO code_tasks VALUES (?,?,?,?,?)");
const now = new Date().toISOString();
ins.run("ct_double", "QNFO/QNFO/qnfo-workers", "a/worker.js", "queued", now);
ins.run("ct_bare", "qnfo-workers", "b/worker.js", "queued", now);
ins.run("ct_other", "someone/else", "c/worker.js", "queued", now);
const repo = (id) => db.prepare("SELECT repo FROM code_tasks WHERE id = ?").get(id).repo;
const probe = () => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-code-task-repo-slug'").get().verify_probe).get();
ok(repo("ct_double") === "QNFO/QNFO/qnfo-workers", "BLIND SPOT: the prior trigger keeps a double owner");
db.prepare("DELETE FROM code_tasks WHERE id = 'ct_other'").run();
ok(probe().observed === "1", "BLIND SPOT: the prior detector reads pass while the row is refused at every read", probe());
ins.run("ct_other", "someone/else", "c/worker.js", "queued", now);
db.exec(sql);
ok(repo("ct_double") === "qnfo-workers", "the live double-owner row is repaired", repo("ct_double"));
ok(repo("ct_bare") === "qnfo-workers" && repo("ct_other") === "someone/else", "a bare slug and a non-QNFO repo are untouched");
ins.run("ct_new1", "QNFO/qnfo-workers", "d/worker.js", "queued", now);
ins.run("ct_new2", "qnfo/QNFO/qnfo/qnfo-workers", "e/worker.js", "queued", now);
ok(repo("ct_new1") === "qnfo-workers" && repo("ct_new2") === "qnfo-workers", "inserts of one or three owner segments become the bare slug", [repo("ct_new1"), repo("ct_new2")]);
db.prepare("UPDATE code_tasks SET repo = 'QNFO/QNFO/qnfo-workers' WHERE id = 'ct_bare'").run();
ok(repo("ct_bare") === "qnfo-workers", "a later update to a double owner is reduced too");
ok(probe().observed === "0", "the new detector fails on a slash it cannot repair (someone/else)", probe());
db.prepare("UPDATE code_tasks SET status = 'closed' WHERE id = 'ct_other'").run();
ok(probe().observed === "1", "and passes once no unfinished task holds a slash", probe());
ok(db.prepare("SELECT next_due_at FROM remediation_contracts").get().next_due_at === null, "the detector is due now");
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'code-task-repo-double-owner'").get();
ok(fm && fm.probe_class === "fm-code-task-repo-slug" && fm.issue_id === 100050, "the failure mode is recorded with its detector", fm);
const bak = db.prepare("SELECT id, repo FROM bak_20261019_repo_slug_any_depth").all();
ok(bak.length === 1 && bak[0].id === "ct_double" && bak[0].repo === "QNFO/QNFO/qnfo-workers", "the backup holds the row as it was", bak);
const snap = JSON.stringify(db.prepare("SELECT * FROM code_tasks ORDER BY id").all()) + JSON.stringify(db.prepare("SELECT * FROM remediation_contracts").all());
db.exec(sql);
ok(JSON.stringify(db.prepare("SELECT * FROM code_tasks ORDER BY id").all()) + JSON.stringify(db.prepare("SELECT * FROM remediation_contracts").all()) === snap, "re-applying the file changes nothing");
const rb = sql.match(/^-- Rollback: (.*)$/m);
ok(!!rb, "the file has a Rollback line");
db.exec(rb[1]);
ok(repo("ct_double") === "QNFO/QNFO/qnfo-workers", "the Rollback line restores the row");
ok(probe().observed !== undefined && db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe === oldProbe, "the Rollback line restores the probe");
ok(!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'code_tasks_repo_slug_upd'").get() && !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'code_tasks_repo_slug_ai'").get(), "the Rollback line restores the one-segment insert trigger and drops the update trigger");
ok(!db.prepare("SELECT 1 FROM failure_modes WHERE fm_key = 'code-task-repo-double-owner'").get(), "the Rollback line removes the failure mode");
console.log(`repo-slug-any-depth: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
