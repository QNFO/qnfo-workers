-- AI-METER-AE-3 (2026-11-09, pillar cost, program QNFO.INFRA, roadmap RM-ANALYTICS-ENGINE-METERS-1 row 56, agent_issues 1002133).
-- One row per complete UTC day that compares the Analytics Engine call count (ai_meter_ae_daily) with the spend ledger (ai_spend_ledger) through
-- v_ai_meter_ae_vs_ledger. scripts/ai_meter_ae.py reconcile() writes it from the heavy job of remediation-consumer.yml. missed_share is the number the decision on adding an
-- Analytics Engine write to __aiAttrEnv rests on. Additive only. CAUSE-MAPPED: no metric is registered in this file.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS ai_meter_reconcile_daily;

CREATE TABLE IF NOT EXISTS ai_meter_reconcile_daily (
  day TEXT PRIMARY KEY,
  ae_calls INTEGER NOT NULL,
  ledger_calls INTEGER NOT NULL,
  missed_calls INTEGER NOT NULL,
  missed_share REAL NOT NULL,
  checked_at TEXT NOT NULL
);
