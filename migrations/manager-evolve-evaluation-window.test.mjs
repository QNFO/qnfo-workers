// #8391: application time determines the evaluation window; all clocks are frozen.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const sql = readFileSync(new URL('./2026-11-07-manager-evolve-evaluation-window.sql', import.meta.url), 'utf8');
const appliedAt = '2026-12-20T12:34:56Z'; // Delayed well beyond the authored evaluation date.
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE manager_evolve_proposals (
  id INTEGER PRIMARY KEY, status TEXT, evaluate_after TEXT, updated_at TEXT
);
INSERT INTO manager_evolve_proposals VALUES
  (1, 'proposed', '2026-11-19T00:00:00Z', NULL),
  (2, 'applied', '2026-11-19T00:00:00Z', '2026-11-05T00:00:00Z'),
  (3, 'kept', '2026-11-19T00:00:00Z', '2026-11-19T00:00:00Z');`);
const at = time => sql.replaceAll("'now'", `'${time}'`);
db.exec(at(appliedAt));
const row = id => ({ ...db.prepare('SELECT * FROM manager_evolve_proposals WHERE id = ?').get(id) });
assert.equal(row(1).evaluate_after, '2026-11-19T00:00:00Z');
assert.equal(row(2).updated_at, '2026-11-05T00:00:00Z');
assert.equal(row(3).status, 'kept');

db.exec("UPDATE manager_evolve_proposals SET status = 'applied' WHERE id = 1");
assert.equal(row(1).evaluate_after, '2027-01-03T12:34:56Z');
assert.equal(row(1).updated_at, appliedAt);
assert.equal(Date.parse(row(1).evaluate_after) - Date.parse(appliedAt), 14 * 86400e3);
const first = row(1);
db.exec(at('2027-02-01T00:00:00Z'));
db.exec("UPDATE manager_evolve_proposals SET status = 'applied' WHERE id = 1");
assert.deepEqual(row(1), first); // A retry/replay cannot restart observation.
db.exec("UPDATE manager_evolve_proposals SET status = 'kept' WHERE id = 1");
assert.equal(row(1).evaluate_after, first.evaluate_after);

const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
db.exec(rollback);
assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger' AND name = 'manager_evolve_evaluation_window'").get().n, 0);
db.close();
console.log('9 passed, 0 failed (application window, delayed apply, replay, terminal rows, rollback)');
