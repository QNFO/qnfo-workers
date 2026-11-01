import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("./2026-11-01-act-bridge-379-levers.sql");
const sql = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];
const anchors = new Map([
  ["qnfo-ai-search/worker.js", ["async function retrieve(env, query, cfg) {", "function buildMessages(query, sources, graph, history, pinned) {"]],
  ["qnfo-fleet-control/worker.js", ["async function rtAuthorLivePathProbe(db, env, orphan) {"]],
]);
let pass = 0, fail = 0;
const check = (condition, message, value) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (value === undefined ? "" : " :: " + JSON.stringify(value)));
  }
};

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, action TEXT NOT NULL);
  CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT, prerequisites TEXT, reliability TEXT, acquired_at TEXT, evidence TEXT);
  CREATE TABLE decision_log (actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
`);
const initial = new Map([
  [392, "Pillar reach. Optimize retrieval after two daily p95 kill readings."],
  [14731, "Pillar autonomy. Fix the most common probe-author rejection in the authoring path."],
  [14837, "Pillar reach. Improve the answer-opening plain-language rule from sampled answers."],
  [404, "Existing action must remain untouched."],
]);
for (const [id, action] of initial) db.prepare("INSERT INTO analytics_metric_triggers (id, action) VALUES (?, ?)").run(id, action);

db.exec(sql);
const once = new Map(db.prepare("SELECT id, action FROM analytics_metric_triggers").all().map(({ id, action }) => [id, action]));
db.exec(sql);
const twice = new Map(db.prepare("SELECT id, action FROM analytics_metric_triggers").all().map(({ id, action }) => [id, action]));
check(Boolean(rollback), "migration declares a rollback");
check(once.get(392) === twice.get(392) && once.get(14731) === twice.get(14731) && once.get(14837) === twice.get(14837), "replay does not duplicate marker blocks");
check(twice.get(404) === initial.get(404), "unselected triggers are unchanged");

const expected = new Map([
  [392, ["code-task: repo=qnfo-workers path=qnfo-ai-search/worker.js", "code-anchor: async function retrieve(env, query, cfg) {"]],
  [14731, ["code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js", "code-anchor: async function rtAuthorLivePathProbe(db, env, orphan) {"]],
  [14837, ["code-task: repo=qnfo-workers path=qnfo-ai-search/worker.js", "code-anchor: function buildMessages(query, sources, graph, history, pinned) {"]],
]);
for (const [id, [task, anchor]] of expected) {
  const action = twice.get(id);
  check(action.includes("\n" + task + "\n" + anchor), `trigger ${id} has separate task and anchor lines`);
  check((action.match(/^code-task:/gm) || []).length === 1, `trigger ${id} has one task marker`);
  check((action.match(/^code-anchor:/gm) || []).length === 1, `trigger ${id} has one anchor marker`);
}

for (const [path, signatures] of anchors) {
  const source = read(new URL(`../${path}`, import.meta.url));
  for (const signature of signatures) {
    check(source.split(signature).length - 1 === 1, `${path} contains anchor exactly once`, signature);
  }
}

db.exec(rollback);
for (const [id, action] of initial) {
  check(db.prepare("SELECT action FROM analytics_metric_triggers WHERE id = ?").get(id).action === action, `rollback restores trigger ${id}`);
}
check(db.prepare("SELECT COUNT(*) AS count FROM capability_ledger").get().count === 1, "migration records the capability");
check(db.prepare("SELECT COUNT(*) AS count FROM decision_log").get().count === 1, "migration records the decision");

console.log(`act-bridge-379-levers: ${pass} passed, ${fail} failed`);
db.close();
process.exit(fail ? 1 : 0);
