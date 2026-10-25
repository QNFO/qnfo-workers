import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE research_queue(id TEXT,status TEXT,paper_slug TEXT,published_at TEXT,doi TEXT,paper_url TEXT);
CREATE TABLE entity_map(slug TEXT,page_url TEXT,doi TEXT);
CREATE TABLE social_media_posts(status TEXT,post_id TEXT,buffer_id TEXT,paper_doi TEXT);
CREATE TABLE reach_signals(date TEXT,source TEXT,entity_type TEXT,metric TEXT,quality TEXT,value REAL);
CREATE TABLE subscribers(status TEXT,confirmed_at TEXT);
CREATE TABLE fleet_runs(task_id TEXT,status TEXT,finished_at TEXT);
CREATE TABLE metric_registry(metric TEXT PRIMARY KEY,layer TEXT,kind TEXT,formula TEXT,source_of_truth TEXT,target TEXT,owner TEXT,disposition_actor TEXT,refresh_cadence TEXT,state TEXT,last_value TEXT,last_refreshed TEXT);
CREATE TABLE analytics_metric_triggers(metric_key TEXT PRIMARY KEY,title TEXT,source_table TEXT,operator TEXT,threshold REAL,priority INTEGER,action TEXT,owner TEXT,queue_target TEXT,cooldown_hours INTEGER,enabled INTEGER,notes TEXT);
CREATE TABLE fleet_tasks(id TEXT PRIMARY KEY,name TEXT,type TEXT,definition TEXT,timeout_ms INTEGER,retries INTEGER,version INTEGER,enabled INTEGER,updated_at TEXT);
CREATE TABLE fleet_crons(name TEXT PRIMARY KEY,cron_expr TEXT,task_id TEXT,enabled INTEGER,timezone TEXT,updated_at TEXT);
CREATE TABLE cloud_ops_events(id TEXT PRIMARY KEY,ts TEXT,kind TEXT,text TEXT,meta TEXT,job TEXT,status TEXT);
CREATE TABLE remediation_contracts(class TEXT PRIMARY KEY,precondition TEXT,action TEXT,verify_probe TEXT,verify_transport TEXT,max_attempts INTEGER,escalate_to TEXT,expected_cadence_h INTEGER,status TEXT,module TEXT);
CREATE TABLE failure_modes(fm_key TEXT PRIMARY KEY,failure_mode TEXT,root_cause TEXT,remediation TEXT,detector TEXT,probe_class TEXT,first_seen TEXT,trigger_condition TEXT,symptom TEXT,blast_radius TEXT);
CREATE TABLE capability_ledger(capability TEXT PRIMARY KEY,provenance TEXT,prerequisites TEXT,reliability TEXT,acquired_at TEXT,evidence TEXT);
CREATE TABLE decision_log(actor TEXT,assumption TEXT,action TEXT,evidence TEXT,outcome TEXT,blast_radius TEXT,rollback_path TEXT,capability_gain TEXT,predicted_outcome TEXT,reach_gain TEXT,surfaces_tested TEXT);
`);
const migration = readFileSync(new URL("./2026-10-25-prd-funnel-monitor.sql", import.meta.url), "utf8");
db.exec(migration);
const one = sql => db.prepare(sql).get();
const health = () => one("SELECT * FROM v_prd_funnel_health");
const stages = () => Object.fromEntries(db.prepare("SELECT * FROM v_prd_funnel_stages").all().map(r => [r.stage, r]));
assert.equal(stages().publication.value, 0);
assert.equal(stages().human_pageviews.value, null);
assert.equal(health().attention_state, "unmeasured");
assert.equal(health().monitor_stale, 1);

db.exec(`INSERT INTO research_queue VALUES
 ('old','published','old',datetime('now','-180 minutes'),'',''),
 ('new','published','new',datetime('now','-60 minutes'),NULL,NULL),
 ('complete','published','complete',datetime('now','-1 day'),'doi:complete','https://papers.qnfo.org/complete'),
 ('ancient','published','ancient',datetime('now','-31 days'),NULL,NULL),
 ('queued','queued','queued',NULL,NULL,NULL);
 INSERT INTO entity_map VALUES('complete','https://papers.qnfo.org/complete',NULL);
 INSERT INTO social_media_posts VALUES('published','post-1',NULL,'doi:complete'),
 ('published','unrelated',NULL,'doi:other'),('draft','draft',NULL,'');
 INSERT INTO subscribers VALUES('subscribed',NULL),('unsubscribed',datetime('now')),('subscribed',datetime('now'));
 INSERT INTO reach_signals VALUES(date('now','-1 day'),'cf-rum-human','site','pageviews','human',5),
 (date('now','-1 day'),'cf-rum-human','page','pageviews','human',10),
 (date('now','-1 day'),'cf-rum','site','pageviews','unknown',100),
 (date('now'),'cf-rum-human','site','pageviews','human',900);
`);
assert.equal(health().missing_transitions, 1, "one old paper, not three missing fields");
assert.equal(health().attention_state, "measured");
assert.equal(stages().publication.value, 3, "exclude queued and old-window papers");
assert.equal(stages().distribution.value, 1, "do not count unrelated or draft posts");
assert.equal(stages().human_pageviews.value, 5, "exclude bots, page/site duplication and partial day");
assert.equal(stages().confirmed_subscribers.value, 1);
db.exec(`UPDATE research_queue SET doi='doi:old',paper_url='https://papers.qnfo.org/old' WHERE id='old';
 INSERT INTO entity_map VALUES('old','https://papers.qnfo.org/old',NULL);
 INSERT INTO social_media_posts VALUES('published','',NULL,'doi:old');`);
assert.equal(health().missing_transitions, 1, "blank post ID is not distribution evidence");
db.exec("UPDATE social_media_posts SET post_id='post-old' WHERE paper_doi='doi:old'");
assert.equal(health().missing_transitions, 0);
db.exec(`UPDATE research_queue SET paper_url=NULL,doi=NULL WHERE id='old';
 UPDATE entity_map SET doi='doi:old' WHERE slug='old';`);
assert.equal(health().missing_transitions, 0, "canonical mapping supplies URL and DOI when queue copies are absent");
db.exec("INSERT INTO fleet_runs VALUES('prd-funnel-monitor','error',datetime('now'))");
assert.equal(health().monitor_stale, 1, "failed runs never count as fresh");
db.exec("INSERT INTO fleet_runs VALUES('prd-funnel-monitor','ok',datetime('now','-121 minutes'))");
assert.equal(health().monitor_stale, 1);
db.exec("INSERT INTO fleet_runs VALUES('prd-funnel-monitor','ok',datetime('now'))");
assert.equal(health().monitor_stale, 0);
const steps = JSON.parse(one("SELECT definition FROM fleet_tasks").definition).steps;
for (const step of steps) {
  assert.equal(step.type, "sql");
  assert.equal(step.db, "AUDIT");
  db.prepare(step.sql).all();
}
assert.equal(one("SELECT last_value FROM metric_registry WHERE metric='prd_funnel_monitor_stale'").last_value, "0");
const evidence = JSON.parse(one("SELECT meta FROM cloud_ops_events").meta);
assert.equal(evidence.stages.length, 6);
assert.equal(evidence.attention_state, "measured");
assert.equal(one("SELECT cron_expr FROM fleet_crons").cron_expr, "*/10 * * * *");
const probe = one("SELECT verify_probe FROM remediation_contracts").verify_probe;
assert.equal(one(probe).observed, 0);
db.exec(migration);
assert.equal(one("SELECT COUNT(*) n FROM decision_log").n, 1, "reapply is idempotent");
assert.equal(one("SELECT COUNT(*) n FROM fleet_tasks").n, 1);
db.exec("UPDATE reach_signals SET date=date('now','-3 days')");
assert.equal(health().attention_state, "unmeasured", "stale attention is not a zero-success fallback");
assert.equal(one("SELECT meta LIKE '%ghp_%' AS matched FROM cloud_ops_events").matched, 1, "reproduce production scrubber match on explanatory prose");
db.exec(`
CREATE TRIGGER fixture_secret_guard AFTER INSERT ON cloud_ops_events
WHEN NEW.meta LIKE '%ghp_%'
BEGIN
  UPDATE cloud_ops_events SET meta=CASE
    WHEN instr(NEW.meta,'ghp_')>0 THEN substr(NEW.meta,1,instr(NEW.meta,'ghp_')-1)||'[REDACTED-GH-TOKEN]'
    ELSE '[REDACTED-SECRET-ADJACENT]' END
  WHERE rowid=NEW.rowid;
END;
CREATE TRIGGER fixture_json_guard AFTER UPDATE OF meta ON cloud_ops_events
WHEN NEW.meta IS NOT NULL AND NOT json_valid(NEW.meta)
BEGIN
  UPDATE cloud_ops_events SET meta=json_object('_truncated',1,'_raw',NEW.meta) WHERE rowid=NEW.rowid;
END;
`);
db.prepare(steps[1].sql).all();
assert(db.prepare("SELECT meta FROM cloud_ops_events").all().some(r => JSON.parse(r.meta)._truncated === 1), "original payload is scrubbed and wrapped under the production guard behavior");
const repair = readFileSync(new URL("./2026-10-25-prd-funnel-evidence.sql", import.meta.url), "utf8");
db.exec(repair);
assert.equal(one("SELECT version FROM fleet_tasks").version, 2);
const evidenceStep = JSON.parse(one("SELECT definition FROM fleet_tasks").definition).steps[1];
db.prepare(evidenceStep.sql).all();
const events = db.prepare("SELECT meta FROM cloud_ops_events").all();
const compact = events.map(r => JSON.parse(r.meta)).find(r => r.stages?.every(s => !Object.hasOwn(s, "limitation")));
assert(compact, "v2 emits structured counts and timestamps, not prose");
assert.equal(compact.stages.length, 6);
for (const stage of compact.stages) {
  assert.equal(typeof stage.stage, "string");
  assert(stage.value === null || typeof stage.value === "number");
  assert(stage.latest_at === null || typeof stage.latest_at === "string");
}
for (const marker of ["%cfat_%", "%ghp_%", "%github_pat_%", "%sk-ant-%", "%AIza%", "%AKIA%"]) {
  assert.equal(db.prepare("SELECT ? LIKE ? AS matched").get(JSON.stringify(compact), marker).matched, 0, "aggregate evidence survives unchanged production secret predicates");
}
const readableProbe = one("SELECT verify_probe FROM remediation_contracts WHERE class='fm-prd-funnel-evidence'").verify_probe;
assert.equal(one(readableProbe).observed, 0);
db.prepare("INSERT INTO cloud_ops_events(id,meta) VALUES('synthetic-secret',?)").run('{"fixture":"ghp_not-a-real-credential"}');
const scrubbed = JSON.parse(one("SELECT meta FROM cloud_ops_events WHERE id='synthetic-secret'").meta);
assert.equal(scrubbed._truncated, 1);
assert(!scrubbed._raw.includes("ghp_"), "actual marker-shaped fixtures remain scrubbed");
db.exec("UPDATE cloud_ops_events SET ts=datetime('now','-121 minutes')");
assert.equal(one(readableProbe).observed, 1, "expired evidence is not fresh");
db.prepare(evidenceStep.sql).all();
assert.equal(one(readableProbe).observed, 0);
db.exec("UPDATE cloud_ops_events SET meta='invalid-json'");
assert.equal(one(readableProbe).observed, 1, "scrubbed or malformed events cannot satisfy the evidence probe");
db.exec(repair);
assert.equal(one("SELECT COUNT(*) n FROM decision_log").n, 2, "repair reapply is idempotent");
db.close();
console.log("PASS PRD funnel: stage joins, null/missing data, age, attention quality, freshness, task execution and idempotence");
