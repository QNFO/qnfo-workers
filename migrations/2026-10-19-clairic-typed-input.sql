-- TYPED-INPUT-MODEL-1 data side (2026-10-19, pillar autonomy; agent_issues 100250 CF-MODEL-EVAL-1: harness cannot run @cf/cloudflare/clairic, PROBE-NEEDED-1 issue 100272).
-- Clairic is an extraction model (Cloudflare changelog 2026-10-19): it takes {model, fields} and answers typed values, so the chat battery cannot drive it and Workers AI answers every chat
-- probe with "5006: Error: required properties at '/' are 'model,fields'". qnfo-model-eval 1.7.0 classifies such a model out of the chat lane (modality 'extraction' by name, 'typed-input' by
-- the error) and files no harness issue. This file brings the one standing catalog row to the state the worker now writes, and gives issue 100250 the contract that measures it.
--   1. backup tables bak_20261019_clairic_catalog and bak_20261019_clairic_contract hold the rows before the change (CREATE IF NOT EXISTS, so a second apply keeps the first snapshot).
--   2. cf_model_catalog clairic: modality 'extraction', status 'catalogued', notes name the reason (guarded: only while it is still the chat candidate the sweeps left it as).
--   3. remediation_contracts issue-100250: the born-superseded vacuous probe (VACUOUS-PROBE-V3-1) becomes an active d1-query probe on the catalog row, which does not read the issue's status.
--   4. one decision_log row with a parseable prediction.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE cf_model_catalog SET modality = (SELECT modality FROM bak_20261019_clairic_catalog WHERE slug = 'clairic'), status = (SELECT status FROM bak_20261019_clairic_catalog WHERE slug = 'clairic'), notes = (SELECT notes FROM bak_20261019_clairic_catalog WHERE slug = 'clairic') WHERE slug = 'clairic' AND EXISTS (SELECT 1 FROM bak_20261019_clairic_catalog WHERE slug = 'clairic'); UPDATE remediation_contracts SET verify_probe = (SELECT verify_probe FROM bak_20261019_clairic_contract), status = (SELECT status FROM bak_20261019_clairic_contract) WHERE class = 'issue-100250' AND EXISTS (SELECT 1 FROM bak_20261019_clairic_contract);

CREATE TABLE IF NOT EXISTS bak_20261019_clairic_catalog AS SELECT * FROM cf_model_catalog WHERE slug = 'clairic';
CREATE TABLE IF NOT EXISTS bak_20261019_clairic_contract AS SELECT * FROM remediation_contracts WHERE class = 'issue-100250';

UPDATE cf_model_catalog
   SET modality = 'extraction',
       status = 'catalogued',
       notes = 'extraction model: Workers AI wants {model, fields} (typed schema), not chat messages, so the chat battery cannot drive it; left out of the chat lane (TYPED-INPUT-MODEL-1, qnfo-model-eval 1.7.0)'
 WHERE slug = 'clairic' AND model_id = '@cf/cloudflare/clairic' AND modality = 'chat' AND status = 'candidate';

UPDATE remediation_contracts
   SET precondition = 'qnfo-model-eval re-evaluated @cf/cloudflare/clairic on every sweep and filed CF-MODEL-EVAL-1: harness cannot run, although the model takes a typed schema and not chat messages',
       action = 'TYPED-INPUT-MODEL-1: qnfo-model-eval 1.7.0 classifies the model as extraction (typed-input) and leaves it out of the chat lane; this probe reads the catalog row',
       verify_probe = 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cf_model_catalog WHERE model_id = ''@cf/cloudflare/clairic'' AND modality IN (''extraction'', ''typed-input'') AND status = ''catalogued'') THEN ''1'' ELSE ''0'' END AS observed',
       verify_transport = 'd1-query',
       status = 'active',
       last_verdict = NULL,
       attempts = 0,
       deferred_since = NULL,
       next_due_at = datetime('now')
 WHERE class = 'issue-100250' AND status IN ('superseded', 'needs-machine-probe');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a model whose input is a typed schema cannot be measured by a chat battery, so re-running it every sweep and filing a harness issue measures nothing and leaves an issue that no prompt change can close',
  'TYPED-INPUT-MODEL-1: qnfo-model-eval 1.7.0 names clairic an extraction model and reclassifies any chat run that fails only on the "required properties" schema error as typed-input (catalogued, no harness issue); the standing clairic catalog row and the contract of issue 100250 are brought to that state',
  'qnfo-audit 2026-10-19 22:3xZ read-only: cf_model_catalog clairic chat/candidate with notes "last verdict: harness_error"; all ten chat probes failed with 5006 required properties model,fields; Cloudflare changelog 2026-10-19 describes clairic as an extraction model taking typed fields; qnfo-model-eval/typed-input.test.mjs and migrations/clairic-typed-input.test.mjs',
  'migration merged',
  'one catalog row and one contract; the next sweep skips clairic; a chat model that fails for a system-role error is unchanged and still files its issue',
  'restore the two backup rows with the Rollback header, or revert qnfo-model-eval to 1.6.1',
  'the sweep stops filing harness issues for models that need a typed schema',
  'issues_without_next_action <= 62 within 12 h',
  'none',
  'd1:qnfo-audit read-only (cf_model_catalog, cf_model_evals, remediation_contracts), Cloudflare docs search, node:sqlite fixtures'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'TYPED-INPUT-MODEL-1:') = 1);
