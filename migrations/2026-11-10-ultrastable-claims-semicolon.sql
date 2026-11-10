-- ULTRASTABLE-CLAIMS-1 follow-up: four claim probes carried "; " inside their detail strings, and the probe runners refuse any SQL holding a semicolon
-- (scripts/remediation_consumer.py, qnfo-gateway /platform before 3.64.1), so qnfo.org/platform read "3 of 7 claims pass ... probe is not a single SELECT"
-- on 2026-11-10 07:55Z. The detail text uses ", " instead; product_claims and the claim-ultrastable-* contracts change together.
-- PREDICTION: product_claims rows with instr(probe_sql, ';') > 0 = 0 within 1 h, and qnfo.org/platform shows 7 of 7 passing within 2 h.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: no-op (the semicolons were the defect; the probe meaning is unchanged)
-- CAUSE-MAPPED: registers no metric.
UPDATE product_claims SET probe_sql = replace(probe_sql, '; ', ', ') WHERE product = 'ultrastable' AND instr(probe_sql, ';') > 0;
UPDATE remediation_contracts SET verify_probe = (SELECT probe_sql FROM product_claims WHERE 'claim-ultrastable-' || product_claims.id = remediation_contracts.class)
WHERE class LIKE 'claim-ultrastable-%';
