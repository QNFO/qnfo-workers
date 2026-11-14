// D1-HOT-STATEMENTS-1 (fleet_deploys expression index): applies migrations/2026-11-14-fleet-deploys-tsms-index.sql to an in-memory SQLite (node:sqlite) and proves the
// dashboard's worker-observability count, as recorded live by d1QueriesAdaptiveGroups on 2026-11-14, now seeks fleet_deploys on worker, ok and the timestamp expression
// (before: worker and ok only, every successful deploy of the worker read per open loop), and that the answer is unchanged.
// Run: node --no-warnings migrations/fleet-deploys-tsms-index.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE fleet_deploys (id INTEGER PRIMARY KEY, worker TEXT, ok INTEGER, ts TEXT, note TEXT);
CREATE INDEX idx_fdeploy_worker_ok ON fleet_deploys (worker, ok, ts);
CREATE TABLE fleet_issue_loop (fingerprint TEXT PRIMARY KEY, category TEXT, closed_at TEXT, last_seen TEXT);
CREATE TABLE fleet_issue_dispatch (fingerprint TEXT PRIMARY KEY, payload TEXT);
`);
// The live statement (qnfo-fleet-dashboard worker-observability count), verbatim from d1QueriesAdaptiveGroups.
const Q = "SELECT COUNT(*) AS n, GROUP_CONCAT(DISTINCT x.svc) AS workers FROM (SELECT l.fingerprint, COALESCE((SELECT CASE WHEN json_valid(d.payload) THEN CAST(json_extract(d.payload, '$.lastObserved') AS REAL) END FROM fleet_issue_dispatch d WHERE d.fingerprint = l.fingerprint), (CASE WHEN CAST(l.last_seen AS REAL) > 1e12 THEN CAST(l.last_seen AS REAL) ELSE (julianday(l.last_seen) - 2440587.5) * 864e5 END)) AS seen_ms, (SELECT CASE WHEN json_valid(d.payload) THEN json_extract(d.payload, '$.service') END FROM fleet_issue_dispatch d WHERE d.fingerprint = l.fingerprint) AS svc FROM fleet_issue_loop l WHERE l.category='worker-observability' AND l.closed_at IS NULL) x WHERE x.seen_ms >= ? AND NOT EXISTS (SELECT 1 FROM fleet_deploys f WHERE x.svc IS NOT NULL AND f.worker = x.svc AND f.ok = 1 AND COALESCE(f.note,'') NOT LIKE 'SETTINGS-ONLY%' AND (julianday(f.ts) - 2440587.5) * 864e5 > x.seen_ms)";
const plan = () => db.prepare("EXPLAIN QUERY PLAN " + Q).all(0).map((r) => r.detail).filter((d) => /\bf\b/.test(d));

// Seed: worker w1 observed at 2026-11-10, deployed before and after; worker w2 observed at 2026-11-12 with only older deploys.
const ms = (iso) => Date.parse(iso);
db.exec(`INSERT INTO fleet_issue_loop VALUES ('fp1', 'worker-observability', NULL, '${ms("2026-11-10T00:00:00Z")}'), ('fp2', 'worker-observability', NULL, '${ms("2026-11-12T00:00:00Z")}')`);
db.exec(`INSERT INTO fleet_issue_dispatch VALUES ('fp1', '{"service":"w1"}'), ('fp2', '{"service":"w2"}')`);
for (let i = 0; i < 40; i++) db.exec(`INSERT INTO fleet_deploys (worker, ok, ts, note) VALUES ('w1', 1, '2026-10-${String(1 + (i % 28)).padStart(2, "0")} 00:00:00', ''), ('w2', 1, '2026-10-${String(1 + (i % 28)).padStart(2, "0")} 00:00:00', '')`);
db.exec(`INSERT INTO fleet_deploys (worker, ok, ts, note) VALUES ('w1', 1, '2026-11-11 00:00:00', ''), ('w2', 1, '2026-11-13 00:00:00', 'SETTINGS-ONLY rebind')`);

const before = plan();
const answerBefore = db.prepare(Q).get(0);
ok(before.some((d) => /idx_fdeploy_worker_ok \(worker=\? AND ok=\?\)/.test(d)), "before: fleet_deploys seeks only on worker and ok", before);

db.exec(readFileSync(new URL("./2026-11-14-fleet-deploys-tsms-index.sql", import.meta.url), "utf8"));
const after = plan();
ok(after.some((d) => /idx_fdeploy_worker_ok_tsms \(worker=\? AND ok=\? AND <expr>>\?\)/.test(d)), "after: fleet_deploys seeks on worker, ok and the timestamp expression", after);
const answerAfter = db.prepare(Q).get(0);
ok(answerAfter.n === answerBefore.n && answerAfter.workers === answerBefore.workers, "the answer is unchanged", { answerBefore, answerAfter });
ok(answerAfter.n === 1 && answerAfter.workers === "w2", "w1 was redeployed after it was observed; w2 only had a settings-only change, so it still counts", answerAfter);
db.exec(readFileSync(new URL("./2026-11-14-fleet-deploys-tsms-index.sql", import.meta.url), "utf8"));
ok(true, "the migration re-applies (IF NOT EXISTS)");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
