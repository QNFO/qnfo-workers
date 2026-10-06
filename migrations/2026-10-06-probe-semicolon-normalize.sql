-- PROBE-SEMICOLON-NORMALIZE-1 (2026-10-06, pillar autonomy). The hourly remediation tick (qnfo-fleet-control
-- remediationContractsTick) and remediation-consumer run a d1-query probe only when it is one literal SELECT with no ';'
-- anywhere in its text, because a semicolon outside a string would start a second statement. Authors write ';' inside the
-- probe's own text ("pending: ...; the fill job waits"), and such a probe is skipped as probe-not-machine-executable on
-- every tick, so its issue can never close on evidence. On 2026-10-06 seven active contracts carried it (issues 1779, 1815,
-- 1901, 2037, 2050, 2052, 2060), each repaired by hand. A ';' can never be legal in a single-statement probe, so these two
-- triggers normalise it at write time: a trailing ';' is dropped and every other ';' becomes ',' (a string literal keeps
-- its meaning; nothing outside a literal can hold one). Refusing the write instead would abort the INSERT that
-- contract_probe_templates_v1 performs when an issue is filed. Probes of other transports (external-https JSON) are left
-- alone. The keyword rule of the tick (" update ", " create " ... in text) is not repairable this way and is unchanged.
-- Idempotent: CREATE TRIGGER IF NOT EXISTS; the UPDATE only touches d1-query rows that still contain ';' (none on
-- 2026-10-06T12:16Z among active and holding contracts; one closed contract, which this leaves as it is).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS remediation_probe_semicolon_ins; DROP TRIGGER IF EXISTS remediation_probe_semicolon_upd;

CREATE TRIGGER IF NOT EXISTS remediation_probe_semicolon_ins AFTER INSERT ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;

CREATE TRIGGER IF NOT EXISTS remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;

UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',')
WHERE verify_transport LIKE 'd1-query%' AND status IN ('active', 'holding') AND instr(verify_probe, ';') > 0;
