import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sql = readFileSync(new URL('./2026-11-07-output-failure-detectors.sql', import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE remediation_contracts (
  class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT,
  verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER,
  escalate_to TEXT, expected_cadence_h INTEGER, status TEXT);
  CREATE TABLE false_stop_hits (ts TEXT, pattern_key TEXT);`);
db.exec(sql);
db.exec(sql);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM remediation_contracts').get().n, 2);
const rows = db.prepare('SELECT * FROM remediation_contracts ORDER BY class').all();
const probe = row => db.prepare(row.verify_probe.replaceAll("'now'", "'2026-11-07T06:00:00Z'")).get();
for (const row of rows) {
  assert.equal(row.issue_id, null);
  assert.equal(row.status, 'active');
  assert.equal(row.expected_cadence_h, 1);
  assert.equal(row.verify_transport, 'd1-query');
  assert.deepEqual({ ...probe(row) }, { expected: '0', observed: '0' });
}
db.exec(`INSERT INTO false_stop_hits VALUES
 ('2026-10-31T05:59:59Z', 'text-as-output'),
 ('2026-10-31 05:59:59', 'sole-safeguard'),
 ('2026-11-07T05:00:00Z', 'unrelated');`);
for (const row of rows) assert.equal(probe(row).observed, '0');
db.exec(`INSERT INTO false_stop_hits VALUES
 ('2026-10-31T06:00:00Z', 'text-as-output'),
 ('2026-10-31 06:00:00', 'sole-safeguard');`);
for (const row of rows) assert.equal(probe(row).observed, '1');
db.exec(`INSERT INTO false_stop_hits VALUES
 ('2026-11-07 05:00:00', 'text-as-output');`);
assert.equal(probe(rows.find(row => row.class === 'fm-output-as-text')).observed, '2');
assert.equal(probe(rows.find(row => row.class === 'fm-sole-safeguard')).observed, '1');
// A repeated migration preserves a subsequent operational disposition.
db.exec("UPDATE remediation_contracts SET status='holding' WHERE class='fm-output-as-text'");
db.exec(sql);
assert.equal(db.prepare("SELECT status FROM remediation_contracts WHERE class='fm-output-as-text'").get().status, 'holding');
console.log('PASS output-failure-detectors: idempotency, live SQL, positive detection, seven-day boundary, mixed timestamp formats, pattern isolation, standing contracts');
