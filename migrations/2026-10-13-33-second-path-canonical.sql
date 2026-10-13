-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-second-path-flagged-non-canonical', 'fm-companion-context-invented', 'fm-blockquote-quote-unchecked'); DELETE FROM failure_modes WHERE fm_key IN ('second-path-flagged-non-canonical', 'companion-context-invented', 'blockquote-quote-unchecked'); DELETE FROM decision_log WHERE instr(action, 'SECOND-PATH-CANONICAL-1:') = 1 OR instr(action, 'COMPANION-CONTEXT-20261013:') = 1 OR instr(action, 'ABSTRACT-REPAIR-NOW-1:') = 1
-- SECOND-PATH-CANONICAL-1 and the companion changes of 2026-10-13 15:00-15:20 UTC (pillars core and personal; DOCTRINE-1 registries).
-- (1) qnfo-deploy-guard 1.3.25 (same pull request): a successful deploy by canonical-deploy.yml's second path
--     (scripts/direct_content_deploy.py, actor canonical-deploy/direct_content_deploy) is not a non-canonical deploy. The idea-hub
--     fallback at 06:54 UTC (fleet_deploys 5795) kept DEPLOY-NON-CANONICAL-DEPLOY: fleet (agent_issues 2391) open, and
--     issue_refile_reopen reopened it after every close. The guard's own DEPLOY-TICKET-AUTORESOLVE-1 closes 2391 on its next scan
--     once the deploy lands.
-- (2) personal-companion 1.21.4 and 1.21.5 (PR 1150, merged 15:19 UTC): CRITIC-PRUNE-2, CONTEXT-LINKS-1, BLOCKQUOTE-GROUND-1.
-- (3) The one published paper fm-paper-abstract-empty counted (critical-examination-of-the-null-hypotheses-in-fundamental-physics)
--     received the abstract qnfo-research-exec 0.17.5 bodySummary computes for it, written by this session at 15:16 UTC with the
--     sweep's own backup (living-paper abstract_repair_bak). 0.17.5 changed bodySummary but not SWEEP_RULES, so its sweep would only
--     have run at 03:00 UTC tomorrow.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('second-path-flagged-non-canonical', 'a deploy by the canonical workflow''s second path (direct_content_deploy) is reported as a non-canonical deploy, so DEPLOY-NON-CANONICAL-DEPLOY: fleet reopens after every close',
  'NON-CANONICAL-DEPLOY-1 in qnfo-deploy-guard accepted only rows whose note says "opsDeploy route" (and container deployers); DEPLOY-SECOND-PATH-1 added a second canonical path whose ledger rows carry the actor canonical-deploy/direct_content_deploy and no such note',
  'SECOND-PATH-CANONICAL-1 (qnfo-deploy-guard 1.3.25): a successful row of that actor is canonical; a failed one is still flagged',
  'qnfo-deploy-guard/worker.js on main carries the second-path rule', 'fm-second-path-flagged-non-canonical', '2026-10-13', 2391,
  'any canonical deploy whose /ops/deploy call times out', 'agent_issues 2391 reopened by issue_refile_reopen; deploy-guard /report non_canonical 1 with sample idea-hub', 'the deploy ticket stream and every metric that counts open issues'),
 ('companion-context-invented', 'the companion writer, required to give context and systems analysis, invents the context because its source material holds only the subject article and two random links',
  'wikiAnchors drew the two articles beside the primary at random from its first 60 links in alphabetical order, so the people, bodies and events the subject is about were rarely in the source material',
  'CONTEXT-LINKS-1 (personal-companion 1.21.5): the linked articles the primary names most are read first; seeded random links fill in',
  'personal-companion/worker.js on main ranks linked articles by mention', 'fm-companion-context-invented', '2026-10-13', 2222,
  'a companion run whose subject has central actors', 'companion_runs 5519-5552: motives, expectations and recipients invented; 25 sentences pruned by the fact-check in one attempt', 'every companion piece'),
 ('blockquote-quote-unchecked', 'an invented quotation set as a markdown blockquote passes the deterministic quotation check, which only reads quotation marks',
  'QUOTE-GROUND-1 matched quoted spans between quotation marks; a "> " blockquote carries none',
  'BLOCKQUOTE-GROUND-1 (personal-companion 1.21.5): a blockquote of five or more words must occur verbatim in the source, and the grounding repair deletes its line',
  'personal-companion/worker.js on main checks blockquotes', 'fm-blockquote-quote-unchecked', '2026-10-13', 2222,
  'a draft that sets a quotation as a blockquote', 'companion_runs 5550: critique grounding=0 for an invented Ehrenburg blockquote', 'every companion piece');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-second-path-flagged-non-canonical', NULL, 'SECOND-PATH-CANONICAL-1', 'failure-mode detector',
  '{"paths": ["qnfo-deploy-guard/worker.js"], "contains": "if (isSecondPath(nlr)) { if (nlr.ok === 0) nonCanon.push(ncw); continue; }"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-context-invented', NULL, 'CONTEXT-LINKS-1', 'failure-mode detector',
  '{"paths": ["personal-companion/worker.js"], "contains": "var named = rankLinked(pool, primary.text, primary.title);"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-blockquote-quote-unchecked', NULL, 'BLOCKQUOTE-GROUND-1', 'failure-mode detector',
  '{"paths": ["personal-companion/worker.js"], "contains": "if (/^\\s*>/.test(l)) { if (!cur) { cur = []; blocks.push(cur); }"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a path the canonical workflow itself takes is canonical; a detector that flags it raises a ticket nobody can close',
  'SECOND-PATH-CANONICAL-1: qnfo-deploy-guard 1.3.25 treats a successful canonical-deploy/direct_content_deploy row as canonical and still flags a failed one',
  'deploy-guard /report 15:01 UTC: non_canonical 1, sample idea-hub; fleet_deploys 5795 (idea-hub 06:54 UTC, actor canonical-deploy/direct_content_deploy, ok 1, MIRRORED-FROM-DEPLOYMENT-HISTORY-1); agent_issues 2391 reopened 07:01 UTC by issue_refile_reopen',
  'pull request to the stale-PR lane (control plane)', 'the non-canonical deploy detector', 'revert of qnfo-deploy-guard 1.3.25',
  'the second deploy path no longer raises a false deploy ticket', 'agent_issues 2391 is closed by DEPLOY-TICKET-AUTORESOLVE-1 within one deploy-guard scan after 1.3.25 is live, and stays closed for 24 h unless a deploy fails or bypasses both paths', 'none',
  'd1:fleet_deploys, agent_issues; code:qnfo-deploy-guard scan nonCanon, scripts/direct_content_deploy.py DEPLOYED_BY'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SECOND-PATH-CANONICAL-1:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a writer told to give context invents it unless the context is in its source material; a prune that converges over rounds keeps a draft a single round throws away',
  'COMPANION-CONTEXT-20261013: personal-companion 1.21.4 CRITIC-PRUNE-2 (critic prune up to 3 rounds), 1.21.5 CONTEXT-LINKS-1 (linked articles the subject names most) and BLOCKQUOTE-GROUND-1 (blockquotes verbatim or deleted)',
  'companion_runs 5519-5552 (15:00 UTC run, The Black Book of Soviet Jewry): three attempts ended on one more invented detail after a one-round critic prune; attempt 4 reached the fact-check and lost 25 sentences of invented context; attempt 5 failed on an invented blockquote. Live check of the ranking: Ilya Ehrenburg and Vasily Grossman rank first for that article',
  'merged through the canonical path (PR 1150)', 'the companion topic sources, critic prune and grounding check', 'revert of personal-companion 1.21.4-1.21.5',
  'the writer has the context it is asked for', 'a companion piece is published by 20:15 UTC 2026-10-13, and fewer than 10 sentences are pruned by the fact-check in the attempt that publishes', 'reading.q08.org publishes again at the owner''s bar',
  'd1:companion_runs; code:personal-companion wikiAnchors rankLinked, groundingProblems, critic prune loop; live Wikipedia links for five topics'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-CONTEXT-20261013:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a repair the live worker computes the same way is safe to apply now instead of waiting a day for its sweep',
  'ABSTRACT-REPAIR-NOW-1: the abstract of critical-examination-of-the-null-hypotheses-in-fundamental-physics was replaced with the qnfo-research-exec 0.17.5 bodySummary of its body, old text kept in living-paper abstract_repair_bak',
  'fm-paper-abstract-empty counted 1 paper (abstract = YAML front matter); last completeness-sweep 09:16 UTC under rules abstract-clean-2, before 0.17.5; 0.17.5 left SWEEP_RULES unchanged, so its next sweep was 03:00 UTC 2026-10-14; bodySummary run offline on the body returned 1043 characters, not flagged by abstractNeedsRepair',
  'applied 15:16 UTC: living-paper papers 1 row, abstract_repair_bak 1 row; detector query reads 0', 'one paper abstract', 'UPDATE papers SET abstract = (SELECT old_abstract FROM abstract_repair_bak WHERE slug = ''critical-examination-of-the-null-hypotheses-in-fundamental-physics'') WHERE slug = ''critical-examination-of-the-null-hypotheses-in-fundamental-physics'' (living-paper)',
  'no published paper shows front matter as its summary', 'fm-paper-abstract-empty passes at its next probe and stays passing through the 03:00 UTC sweep', 'readers of the paper card see its summary',
  'd1:living-paper papers, abstract_repair_bak; code:qnfo-research-exec bodySummary, completenessSweep SWEEP_RULES'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'ABSTRACT-REPAIR-NOW-1:') = 1);
