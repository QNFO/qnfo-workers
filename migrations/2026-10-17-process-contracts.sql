-- PROCESS-CONTRACT-1 (2026-10-17, owner directive: "ALL STEPS, ALL PROCESSES SHALL HAVE SLA AND MULTIPLE
-- EXECUTION/REMEDIATION/WORKAROUND PATHS TO SUCCESSFUL DEFINITION OF DONE")
--
-- Every process in the fleet is a row here. A row is valid only when it names:
--   * an owner (who is accountable when it stops),
--   * an SLA in minutes (the fleet ceiling is 120; a longer SLA must justify itself),
--   * a definition of done (the observable state that means the process completed), and
--   * at least TWO ordered paths to that definition of done: a primary plus at least one
--     remediation/workaround that does not depend on the same failing component.
--
-- The registry is deliberately a table plus views rather than another fleet_tick trigger: the D1 trigger
-- graph is already deep enough to fail `remediation_verifications` inserts with "triggers nested too deep"
-- (see agent_issues VERIFICATION-WRITE-DEADLOCK-1). Enforcement lives in v_process_contract_gaps, which any
-- reader can query, and in the fleet audit, not in a new trigger on every tick.

CREATE TABLE IF NOT EXISTS process_contracts (
  process TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  sla_min INTEGER NOT NULL,
  definition_of_done TEXT NOT NULL,
  paths_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A gap view rather than four booleans spread through queries.
DROP VIEW IF EXISTS v_process_contract_gaps;
CREATE VIEW v_process_contract_gaps AS
SELECT
  process,
  owner,
  sla_min,
  CASE
    WHEN sla_min IS NULL OR sla_min <= 0 THEN 'no-sla'
    WHEN sla_min > 120 THEN 'sla-over-120'
    ELSE 'ok'
  END AS sla_state,
  CASE
    WHEN definition_of_done IS NULL OR trim(definition_of_done) = '' THEN 'no-dod'
    ELSE 'ok'
  END AS dod_state,
  CASE
    WHEN json_valid(paths_json) = 0 THEN 'paths-not-json'
    WHEN json_array_length(paths_json) < 2 THEN 'single-path'
    ELSE 'ok'
  END AS path_state
FROM process_contracts;

DROP VIEW IF EXISTS v_process_contract_violations;
CREATE VIEW v_process_contract_violations AS
SELECT process, owner, sla_state, dod_state, path_state
FROM v_process_contract_gaps
WHERE sla_state <> 'ok' OR dod_state <> 'ok' OR path_state <> 'ok';

-- Seed: the fleet's real processes. Each path list is ordered: the first entry is the primary, the rest are
-- remediation or workaround routes that do not depend on the same failing component.
INSERT INTO process_contracts (process, owner, sla_min, definition_of_done, paths_json) VALUES
('research-intake', 'idea-hub', 120,
 'An idea row exists in research_queue with decision=ACCEPT and a score.',
 '[{"name":"signal-intake","kind":"primary","action":"idea-hub triage writes the ACCEPT row"},
   {"name":"manual-intake","kind":"workaround","action":"a session inserts the row directly through research_queue"},
   {"name":"replay-deferred-pool","kind":"remediation","action":"RESEARCH-BACKPRESSURE-1 releases a deferred row"}]'),

('research-ground', 'qnfo-research-exec', 120,
 'The row holds a grounding bibliography and stage advances to ensemble.',
 '[{"name":"arxiv-grounding","kind":"primary","action":"stageGround fetches the arXiv/DataCite bibliography"},
   {"name":"corpus-only-ground","kind":"fallback","action":"ground from the QNFO corpus when the arXiv API fails"},
   {"name":"reclaim-and-retry","kind":"remediation","action":"reclaimStaleResearching re-queues the row at the stage ceiling"}]'),

('research-draft', 'qnfo-research-exec', 120,
 'A body of at least MIN_PAPER_CHARS exists in R2 for the row and stage advances to review.',
 '[{"name":"ensemble-two-legs","kind":"primary","action":"stageEnsemble drafts two legs and reconciles them"},
   {"name":"single-leg-lean","kind":"fallback","action":"lean ensemble runs one leg when the budget breaker is open"},
   {"name":"continue-rounds","kind":"remediation","action":"stageComplete extends the body until it passes the length gate"}]'),

('research-review', 'qnfo-research-exec', 120,
 'A review verdict exists with no unresolved HARD finding, and stage advances to verify.',
 '[{"name":"review-with-revise","kind":"primary","action":"stageReview sends HARD findings to stageRevise for another cycle"},
   {"name":"reparse","kind":"workaround","action":"an unreadable review is re-run twice before it counts as a finding"},
   {"name":"widen-cycle-budget","kind":"remediation","action":"ops_config research_max_review_cycles raises the cycle ceiling up to 12"}]'),

('research-publish', 'qnfo-research-exec', 120,
 'The paper is live on papers.qnfo.org with a passing release gate and published_at set.',
 '[{"name":"inhouse-publish","kind":"primary","action":"publishStageV2 writes the living-paper row and page"},
   {"name":"artifact-deposit","kind":"fallback","action":"the artifact-deposit pipeline publishes when the inline path fails"},
   {"name":"held-release","kind":"remediation","action":"research_hold_expiry_tick releases a held row back to publish after 6 h"}]'),

('remediation-probe', 'qnfo-fleet-control', 120,
 'A remediation_verifications row records pass=1 for the issue, or the issue is closed with evidence.',
 '[{"name":"contract-probe","kind":"primary","action":"remediationContractsTick evaluates verify_probe"},
   {"name":"consumer-probe","kind":"fallback","action":"remediation-consumer evaluates the same contract from its own runner"},
   {"name":"triage-close","kind":"workaround","action":"close through issue_triage.close_evidence when the probe engine is down"}]'),

('code-task', 'qnfo-code-orchestrator', 120,
 'The change is merged to main with the worker suites green, or explicitly handed to a session.',
 '[{"name":"propose-verify-merge","kind":"primary","action":"ladder propose, verify, publisher, merge runner"},
   {"name":"suite-scope-widen","kind":"remediation","action":"SUITE-SCOPE-1 adds the failing test as a companion and retries"},
   {"name":"anchor-repair","kind":"workaround","action":"ANCHOR-MULTILINE-1 relocates the edit or the task reroutes to agent_issues"}]'),

('deploy', 'qnfo-cloud-ops', 120,
 'The live worker reports the version on main via /health.',
 '[{"name":"canonical-deploy","kind":"primary","action":"GitHub Actions canonical-deploy through qnfo-ops /ops/deploy"},
   {"name":"deploy-drift-cf","kind":"fallback","action":"DEPLOY-DRIFT-CF-1 redeploys a worker ahead of live for 45 minutes"},
   {"name":"manual-dispatch","kind":"workaround","action":"dispatch canonical-deploy or fleet-autodeploy with gh, then verify /health"}]'),

('social-distribution', 'qnfo-social', 120,
 'The item is posted on its channel or explicitly parked with a reason.',
 '[{"name":"channel-drain","kind":"primary","action":"weekly-capped channel drain posts the item"},
   {"name":"rollup","kind":"fallback","action":"paper rollup carries it to Substack/Bluesky when the channel cap is spent"},
   {"name":"slot-clamp","kind":"remediation","action":"LEARNER-SLOT-REACHABLE-1 clamps an expired posting window to the current one"}]'),

('errata-correction', 'qnfo-research-exec', 120,
 'The corrected version is published, or the erratum is closed with a stated reason.',
 '[{"name":"errata-members","kind":"primary","action":"errata members regenerate the corrected text"},
   {"name":"slug-rekey","kind":"remediation","action":"DOI-REKEY-1 re-points an erratum from a dead DOI to the internal slug"},
   {"name":"session-correction","kind":"workaround","action":"a session publishes the v2 and links the erratum"}]'),

('email-send', 'qnfo-email', 120,
 'The message is accepted by the provider and recorded as sent.',
 '[{"name":"primary-transport","kind":"primary","action":"qnfo-email sends through the Cloudflare Email binding"},
   {"name":"secondary-transport","kind":"fallback","action":"the alternate transport sends when the binding is unavailable"},
   {"name":"queue-and-retry","kind":"remediation","action":"the row stays queued and is retried on the next run"}]'),

('issue-close', 'qnfo-fleet-control', 120,
 'The issue status is closed/resolved/wontfix with close evidence recorded in issue_triage.',
 '[{"name":"verified-autoclose","kind":"primary","action":"remediation_verification_autoclose_ins closes on pass=1"},
   {"name":"triage-close","kind":"workaround","action":"issue_triage.close_evidence plus the triage_close_sync trigger"},
   {"name":"parent-supersede","kind":"remediation","action":"close as superseded by a parent issue that tracks the root cause"}]');
