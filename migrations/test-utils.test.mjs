/**
 * Tests for test-utils.mjs production schema exports
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { PRODUCTION_SCHEMAS, validateColumnReferences, setupTestDatabase } from './test-utils.mjs';

describe('PRODUCTION_SCHEMAS', () => {
  it('contains remediation_contracts schema', () => {
    assert.ok(PRODUCTION_SCHEMAS.remediation_contracts);
    assert.ok(PRODUCTION_SCHEMAS.remediation_contracts.includes('expected_cadence_h'));
    assert.ok(!PRODUCTION_SCHEMAS.remediation_contracts.includes('verify_cadence_h'));
  });

  it('contains failure_modes schema', () => {
    assert.ok(PRODUCTION_SCHEMAS.failure_modes);
    assert.ok(PRODUCTION_SCHEMAS.failure_modes.includes('fm_key'));
    assert.ok(PRODUCTION_SCHEMAS.failure_modes.includes('detector'));
  });

  it('contains decision_log schema', () => {
    assert.ok(PRODUCTION_SCHEMAS.decision_log);
    assert.ok(PRODUCTION_SCHEMAS.decision_log.includes('capability_gain'));
    assert.ok(PRODUCTION_SCHEMAS.decision_log.includes('predicted_outcome'));
  });
});

describe('validateColumnReferences', () => {
  it('accepts valid INSERT with correct columns', () => {
    const sql = `INSERT INTO remediation_contracts (class, action, verify_probe) VALUES ('test', 'x', 'y')`;
    const result = validateColumnReferences(sql, 'remediation_contracts');
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('rejects INSERT with wrong column name', () => {
    // This is the actual error from PR #8560
    const sql = `INSERT INTO remediation_contracts (class, hit_action) VALUES ('test', 'x')`;
    const result = validateColumnReferences(sql, 'remediation_contracts');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('hit_action')));
  });

  it('accepts valid UPDATE with correct columns', () => {
    const sql = `UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = 'test'`;
    const result = validateColumnReferences(sql, 'remediation_contracts');
    assert.equal(result.valid, true);
  });

  it('rejects UPDATE with wrong column name', () => {
    // This is another actual error from PR #8560
    const sql = `UPDATE remediation_contracts SET verify_cadence_h = 2 WHERE class = 'test'`;
    const result = validateColumnReferences(sql, 'remediation_contracts');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('verify_cadence_h')));
  });

  it('handles unknown table', () => {
    const sql = `INSERT INTO unknown_table (col1) VALUES ('x')`;
    const result = validateColumnReferences(sql, 'unknown_table');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Unknown table')));
  });
});

describe('setupTestDatabase', () => {
  it('creates tables from production schemas', () => {
    const db = new DatabaseSync(':memory:');
    setupTestDatabase(db, ['remediation_contracts', 'failure_modes']);
    
    // Verify tables exist
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('remediation_contracts', 'failure_modes')
    `).all();
    assert.equal(tables.length, 2);
    
    // Verify columns match production
    const columns = db.prepare(`PRAGMA table_info(remediation_contracts)`).all();
    const columnNames = columns.map(c => c.name);
    assert.ok(columnNames.includes('expected_cadence_h'));
    assert.ok(!columnNames.includes('verify_cadence_h')); // Wrong name
    assert.ok(!columnNames.includes('hit_action')); // Wrong name
    
    db.close();
  });

  it('throws on unknown table', () => {
    const db = new DatabaseSync(':memory:');
    assert.throws(
      () => setupTestDatabase(db, ['unknown_table']),
      /Unknown table: unknown_table/
    );
    db.close();
  });
});

describe('regression tests for PR #8560 failures', () => {
  it('catches verify_cadence_h vs expected_cadence_h error', () => {
    const badSql = `UPDATE remediation_contracts SET verify_cadence_h = 1`;
    const result = validateColumnReferences(badSql, 'remediation_contracts');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('verify_cadence_h')));
  });

  it('catches hit_action column error', () => {
    const badSql = `INSERT INTO remediation_contracts (class, hit_action) VALUES ('x', 'y')`;
    const result = validateColumnReferences(badSql, 'remediation_contracts');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('hit_action')));
  });

  it('catches metric_name vs metric error', () => {
    // Simulating the metric_registry error pattern
    const badSql = `INSERT INTO metric_registry (metric_name, last_value) VALUES ('x', 'y')`;
    const result = validateColumnReferences(badSql, 'metric_registry');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('metric_name')));
  });
});
