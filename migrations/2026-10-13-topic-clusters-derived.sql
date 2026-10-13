-- TOPIC-CLUSTERS-DERIVED-1 (2026-10-13, pillar research; ACCURACY-FLEET-2a, agent_issues 2281; owner directive 2026-10-10: no topic
-- or noun may be hard-coded in instructions). idea-hub 1.10.0 and qnfo-cloud-ops 1.28.0 retire the fixed four-cluster keyword table
-- IDEA_TOPIC_CLUSTERS that both workers carried (parity-tested). The topic clusters are now derived from data: the ACCEPTed
-- idea_proposals of the last 90 days (the owner's own ideas, owner-corpus notes, accepted generated proposals), idea text only,
-- top content words by document frequency with each producer's boilerplate dropped, grouped by co-occurrence, at most 6 clusters;
-- the result is cached in ops_config idea_topic_clusters (re-derived daily by qnfo-cloud-ops idea-topic-metric, and by either worker
-- when the cache is older than 72 h). No data gives no clusters: the diversity cap holds nothing and the metric is not written.
-- 1. Metric continuity: metric_registry idea_topic_concentration_30d keeps its name, target and trigger; its formula and source text
--    now carry both definitions with the change date. Measured on the live rows at 2026-10-13 ~21:40 UTC: old definition 0.42
--    (last_value written 04:20 UTC), new definition 0.368 (92 of 250 accepts in the derived "quantum" cluster; 264 accepts in 90 days).
-- 2. Follow-up ACCURACY-FLEET-2b: the other hard-coded topic tables issue 2281 lists, filed so none is dropped.
-- 3. decision_log and capability_ledger rows for the decision and the capability.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET formula = 'share of accepted idea_proposals in the last 30 days that fall in the single largest topic cluster (keyword classifier; ensembles deferred)', source_of_truth = 'qnfo-audit.idea_proposals WHERE decision=''ACCEPT'' AND created_at>=datetime(''now'',''-30 day'')' WHERE metric = 'idea_topic_concentration_30d'; UPDATE agent_issues SET status = 'closed', close_channel = 'rollback-topic-clusters-derived', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE instr(title, 'ACCURACY-FLEET-2b:') = 1 AND status = 'open'; DELETE FROM capability_ledger WHERE capability = 'data-derived-topic-clusters'; DELETE FROM ops_config WHERE key = 'idea_topic_clusters'

UPDATE metric_registry
SET formula = 'Since 2026-10-13 (TOPIC-CLUSTERS-DERIVED-1, idea-hub 1.10.0, qnfo-cloud-ops 1.28.0): share of ACCEPTed idea_proposals in the last 30 days whose idea text falls in the single largest topic cluster, where the clusters (at most 6, plus other) are derived daily from the ACCEPTed idea_proposals of the last 90 days: content words of 4+ characters by document frequency (min 3, top 60), a producer''s boilerplate (a term in 90% of one producer''s 10+ texts) dropped, each term joining the seed it co-occurs with in at least half its texts, seeds nothing joins dropped; a text belongs to the first cluster (largest seed first) sharing a term with it. Cache ops_config idea_topic_clusters. ' ||
  'Until 2026-10-13 (idea-hub 1.5.8-1.9.0, qnfo-cloud-ops 1.19.1-1.27.1): share of accepted idea_proposals in the last 30 days that fall in the single largest topic cluster (keyword classifier; ensembles deferred), the classifier being the fixed table IDEA_TOPIC_CLUSTERS (quantum, ultrametric, energy, ai-epistemics, other; first match wins) over name, idea and rationale. ' ||
  'Continuity: 2026-10-13 old definition 0.42, new definition 0.368 on the same rows.',
    source_of_truth = 'qnfo-audit.idea_proposals WHERE decision=''ACCEPT'' AND created_at>=datetime(''now'',''-30 day'') (idea text), clusters from qnfo-audit.ops_config key idea_topic_clusters (derived from the ACCEPTed idea_proposals of 90 days); producer qnfo-cloud-ops jobIdeaTopicMetric'
WHERE metric = 'idea_topic_concentration_30d';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ACCURACY-FLEET-2b: replace the remaining hard-coded topic keyword lists with data-derived ones (idea-hub RESEARCH allowlist first)',
  'Charter pillar: research. Successor of agent_issues 2281 ACCURACY-FLEET-2a (owner directive 2026-10-10: no topic or noun hard-coded in instructions). 2a replaced IDEA_TOPIC_CLUSTERS in idea-hub and qnfo-cloud-ops with clusters derived from the ACCEPTed idea_proposals (TOPIC-CLUSTERS-DERIVED-1; cached in qnfo-audit ops_config idea_topic_clusters as JSON {clusters: [{label, terms}], derived_at, docs}, re-derived daily). The tables 2281 also lists remain:' || char(10) ||
  '1. idea-hub/worker.js const RESEARCH (the allowlist publicTitle uses for chat-thread titles): read the terms from ops_config idea_topic_clusters (all clusters'' terms, read with the same freshness rule as loadTopicClusters, already in idea-hub since 1.10.0) instead of the fixed list; with no cache and no derived clusters, publicTitle keeps its denylist gate only, as pubQuestion does. Bump VERSION (minor).' || char(10) ||
  '2. radar-hub/worker.js TASTE_PRIOR_TOPICS and TASTE_PRIOR_DOMAIN (personal radar stated-taste prior): learn them from calendar_feedback (RADAR-TASTE-LEARN-1 already learns per-venue and per-domain taste) or drop the prior.' || char(10) ||
  '3. qnfo-intent-orchestrator/worker.js domain classification regexes (research / qwav / personal keyword lists, around line 42): derive the research keywords from ops_config idea_topic_clusters.' || char(10) ||
  '4. qnfo-cloud-ops/worker.js static outreach email templates: make the topic phrase come from the paper being contacted about, not a fixed line.' || char(10) ||
  'This issue closes when all four are data-derived; the code loop takes item 1 (below), and the doer of each later item names its file in a new code-task line here.' || char(10) ||
  'code-task: repo=qnfo-workers path=idea-hub/worker.js' || char(10) ||
  'code-anchor: const RESEARCH=[''quantum''',
  'session_01BCBpN3cZdS57dweqCs9rwt/agent-2281', 'research', 'medium', 'open',
  CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE instr(title, 'ACCURACY-FLEET-2b:') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
 ('session_01BCBpN3cZdS57dweqCs9rwt/agent-2281',
  'topic clusters derived from the accepted ideas measure concentration as well as the fixed four-cluster table did, without naming a topic',
  'idea-hub 1.10.0 and qnfo-cloud-ops 1.28.0 derive the clusters from ACCEPTed idea_proposals (shared, parity-tested block), cache them in ops_config idea_topic_clusters, and the diversity cap and idea_topic_concentration_30d read them',
  'live rows 2026-10-13: derivation over 264 accepts gives 6 clusters led by quantum (quantum, error, correction ...) and tree (ultrametric, bruhat, tits ...); producer boilerplate (arxiv, daily, scan, triage, zenodo ...) dropped; metric old 0.42, new 0.368',
  'pending deploy', 'idea-hub triage diversity hold, qnfo-cloud-ops daily idea-topic-metric, ops_config key idea_topic_clusters',
  'revert the PR (restores IDEA_TOPIC_CLUSTERS) and run the Rollback line of migrations/2026-10-13-topic-clusters-derived.sql',
  'topic clusters follow the owner''s ideas as they change, with no table to edit',
  'idea_topic_concentration_30d stays below 0.50 and is written daily; ops_config idea_topic_clusters is refreshed within 26 h of each quality-score slot',
  'none', 'code, D1 (live idea_proposals), offline suites');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence) VALUES
 ('data-derived-topic-clusters', 'TOPIC-CLUSTERS-DERIVED-1 (agent_issues 2281): idea-hub 1.10.0, qnfo-cloud-ops 1.28.0',
  'qnfo-audit idea_proposals (ACCEPT rows), ops_config', 'deterministic; re-derived daily, 72 h cache, either worker re-derives',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'idea-hub/diversity-cap.test.mjs and qnfo-cloud-ops/idea-topic.test.mjs; ops_config idea_topic_clusters after the first quality-score slot');
