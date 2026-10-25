import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/2026-10-25-learner-arm-probe-scope.sql", import.meta.url), "utf8");
let pass = 0;
let fail = 0;
function ok(value, message) {
  if (value) pass++;
  else {
    fail++;
    console.error("FAIL " + message);
  }
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE social_learner_posts (
    post_key TEXT PRIMARY KEY, slug TEXT, link_slug TEXT, topic TEXT, status TEXT,
    reward_detail TEXT, chosen_by TEXT, posted_at TEXT
  );
  CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, content_preview TEXT);
  CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_title TEXT, pages_url TEXT);
  CREATE TABLE social_threads (id INTEGER PRIMARY KEY, title TEXT, posts TEXT);
  CREATE TABLE remediation_contracts (
    class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT DEFAULT '', action TEXT DEFAULT '',
    verify_probe TEXT DEFAULT '', verify_transport TEXT DEFAULT '', max_attempts INTEGER DEFAULT 3,
    escalate_to TEXT DEFAULT '', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', module TEXT
  );
  CREATE TABLE failure_modes (
    fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT,
    probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT
  );
  CREATE TABLE belief_registry (
    belief_key TEXT PRIMARY KEY, claim TEXT, confidence REAL, evidence TEXT, probe_class TEXT, built_on TEXT
  );
  CREATE TABLE decision_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT,
    outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT,
    reach_gain TEXT, surfaces_tested TEXT
  );
  CREATE TABLE capability_ledger (
    capability TEXT PRIMARY KEY, provenance TEXT, prerequisites TEXT, reliability TEXT, acquired_at TEXT,
    last_exercised_at TEXT, evidence TEXT
  );`);
  return db;
}

const db = fixture();
const now = Date.now();
const recent = new Date(now - 2 * 864e5).toISOString();
const excluded = [];
for (let i = 0; i < 6; i++) {
  const slug = (i < 3 ? "q08-paper-" : "ultrametric-paper-") + i;
  const key = "channel:excluded-" + i;
  db.prepare("INSERT INTO social_learner_posts (post_key, slug, link_slug, topic, status, reward_detail, chosen_by, posted_at) VALUES (?, ?, ?, NULL, 'not-arm', NULL, 'channel-drain', ?)").run(key, slug, slug, recent);
  db.prepare("INSERT INTO social_media_posts (id, content_preview) VALUES (?, ?)").run("excluded-" + i, i < 3 ? "A paper at https://q08.org/papers/" + slug : "An ultrametric paper https://papers.qnfo.org/papers/" + slug);
  excluded.push(key);
}
for (let i = 0; i < 20; i++) {
  const topic = i < 3 ? "energy" : i < 6 ? "physics" : i < 9 ? "mathematics" : "research";
  const status = i < 9 ? "credited" : "pending";
  db.prepare("INSERT INTO social_learner_posts (post_key, slug, link_slug, topic, status, chosen_by, posted_at) VALUES (?, ?, ?, ?, ?, 'scheduler', ?)").run("thread:eligible-" + i, "eligible-paper-" + i, "eligible-paper-" + i, topic, status, recent);
}
db.prepare("INSERT INTO remediation_contracts (class, issue_id, action, verify_probe, verify_transport, escalate_to) VALUES ('issue-2722', 2722, 'old issue action', 'SELECT ''1'' AS expected, ''0'' AS observed', 'd1-query', 'qnfo-fleet-control')").run();
db.prepare("INSERT INTO remediation_contracts (class, issue_id, action, verify_probe, verify_transport, escalate_to) VALUES ('fm-learner-topic-null', 2722, 'old fm action', 'SELECT ''1'' AS expected, ''0'' AS observed', 'd1-query', 'qnfo-fleet-control')").run();
db.prepare("INSERT INTO failure_modes (fm_key, detector) VALUES ('learner-topic-null', 'old detector')").run();

const beforeDecisionCount = db.prepare("SELECT COUNT(*) n FROM decision_log").get().n;
db.exec(migration);
const reason = (key) => db.prepare("SELECT json_extract(reward_detail, '$.not_arm') AS reason FROM social_learner_posts WHERE post_key = ?").get(key)?.reason;
ok(excluded.slice(0, 3).every((key) => reason(key) === "q08 link"), "migration records q08 exclusions from source text");
ok(excluded.slice(3).every((key) => reason(key) === "pillar 4"), "migration records pillar-4 exclusions from source text");
const issueProbe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2722'").get().verify_probe;
const fmProbe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-learner-topic-null'").get().verify_probe;
const run = (sql) => db.prepare(sql).get();
ok(run(issueProbe).expected === "1" && run(issueProbe).observed === "1", "issue DoD passes with 20 eligible rows, three credited arms, and intentional exclusions excluded from the ratio");
ok(run(fmProbe).observed === "1", "learner-topic-null detector passes when all not-arm paper links are explicit policy exclusions");
const scopeProbe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-learner-probe-exclusion-scope'").get().verify_probe;
const beliefProbe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'belief-learner-exclusion-reasons-labelled'").get().verify_probe;
ok(run(scopeProbe).observed === "1" && run(beliefProbe).observed === "1", "the failure-mode and belief probes confirm exclusion provenance");
ok(db.prepare("SELECT detector FROM failure_modes WHERE fm_key = 'learner-topic-null'").get().detector.includes("intentional q08 and pillar-4"), "the existing detector describes the corrected eligibility scope");

for (let i = 9; i < 15; i++) {
  db.prepare("UPDATE social_learner_posts SET status = 'not-arm', topic = NULL WHERE post_key = ?").run("thread:eligible-" + i);
}
ok(run(scopeProbe).observed === "0" && run(beliefProbe).observed === "0", "unmarked paper-linked not-arm rows fail the provenance probes");
ok(run(issueProbe).observed === "0" && run(fmProbe).observed === "0", "a 30% unmarked not-arm share fails both issue and classifier guards");
for (let i = 9; i < 15; i++) {
  db.prepare("UPDATE social_learner_posts SET status = 'pending', topic = 'research' WHERE post_key = ?").run("thread:eligible-" + i);
}
ok(run(issueProbe).observed === "1" && run(fmProbe).observed === "1", "the issue and classifier guards recover when eligible rows are correctly classified");

const decisionCount = db.prepare("SELECT COUNT(*) n FROM decision_log").get().n;
db.exec(migration);
ok(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === decisionCount && db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-learner-probe-exclusion-scope'").get().n === 1, "reapplying is idempotent for the decision log and new detector");

const rollback = /^-- Rollback: (.+)$/m.exec(migration)?.[1];
ok(!!rollback, "migration provides one rollback statement");
db.exec(rollback);
ok(excluded.every((key) => db.prepare("SELECT reward_detail FROM social_learner_posts WHERE post_key = ?").get(key).reward_detail === null), "rollback restores every backed-up exclusion reason");
ok(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2722'").get().verify_probe === "SELECT '1' AS expected, '0' AS observed", "rollback restores the issue probe");
ok(db.prepare("SELECT detector FROM failure_modes WHERE fm_key = 'learner-topic-null'").get().detector === "old detector", "rollback restores the detector text");
ok(db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class IN ('fm-learner-probe-exclusion-scope', 'belief-learner-exclusion-reasons-labelled')").get().n === 0, "rollback removes only the new contracts");
ok(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'learner-probe-exclusion-scope'").get().n === 0, "rollback removes the new failure mode");
ok(db.prepare("SELECT COUNT(*) n FROM belief_registry").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM capability_ledger").get().n === 0, "rollback removes the new belief and capability");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === beforeDecisionCount + 1, "decision log remains append-only across rollback");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
