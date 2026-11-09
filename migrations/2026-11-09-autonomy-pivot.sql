-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key IN ('OWNER_DIRECTIVE_2026_11_09_AUTONOMY_PIVOT_1','outreach_pivot_autonomy'); UPDATE reach_channel_profiles SET status = 'withdrawn', updated_at = datetime('now') WHERE status = 'draft'; (ops_config outreach_pivot_autonomy = off alone restores the quantum cold-email queue and releases every held row)
-- spof-review: no new cron, trigger, binding, host or credential; two ops_config rows, rewritten draft text nothing posts from, one decision_log row.
-- AUTONOMY-PIVOT-1 (2026-11-09, charter pillar reach; owner directive 2026-11-09): quantum-computing cold email to academics drew declines and no collaboration, so the owner's
-- professional brand, outreach and job search lead with AI autonomous systems research (systems researcher, not software engineer). Code: qnfo-cloud-ops OUTREACH-PIVOT-1 (holds
-- non-autonomy first contacts and follow-ups, reversible), qnfo-jobsearch headline H2, qnfo-gateway Person jobTitle and work-with-me pitch, docs/STRATEGY.md 2.2 to 3.
-- CAUSE-MAPPED: registers no metric.
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_11_09_AUTONOMY_PIVOT_1',
  '{"id":"AUTONOMY-PIVOT-1","directive_summary":"Quantum computing outreach is a dead end: academics do not engage and replies are few and negative. Pivot outreach, personal brand, websites, resume and job search to AI autonomous systems research, positioned as a systems researcher, not a software engineer.","recorded":"2026-11-09","limits":["identity claims stay verified (jobsearch claim ledger)","outreach consent, suppression and opt-out","harness permission checks","owner-approved profile text before it is posted"]}',
  'Owner directive 2026-11-09: brand and outreach lead with AI autonomous systems research; STRATEGY.md section 2.2 carries it.');
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('outreach_pivot_autonomy', 'on',
  'OUTREACH-PIVOT-1: first-contact cold email goes only to authors of AI autonomous-systems work; other queued rows are held (held-pivot-quantum) and follow-ups are skipped. off = previous queue, held rows released.');

-- Draft profile text per channel (first-person claims: status stays draft until the owner approves; nothing posts from this table).
UPDATE reach_channel_profiles SET status = 'draft', updated_at = datetime('now'), text = 'Systems researcher studying autonomous AI systems: how they operate, fail and get audited | Research program lead (FHWA, AARP) | Founder, QNFO' WHERE channel = 'linkedin' AND field = 'headline';
UPDATE reach_channel_profiles SET status = 'draft', updated_at = datetime('now'), text = 'Systems researcher: autonomous AI systems, agent reliability and oversight. Ex-FHWA, AARP. Amsterdam. qnfo.org' WHERE channel = 'github' AND field = 'bio';
UPDATE reach_channel_profiles SET status = 'draft', updated_at = datetime('now'), text = 'Systems researcher on autonomous AI: how agents operate, fail and get audited. Ex-FHWA, AARP. Amsterdam. Open work: qnfo.org' WHERE channel = 'x' AND field = 'bio';
UPDATE reach_channel_profiles SET status = 'draft', updated_at = datetime('now'), text = 'Systems researcher studying autonomous AI systems: how they operate, fail and get audited. Ex-FHWA and AARP. Some posts are drafted by my research pipeline. Open work and failures: qnfo.org' WHERE channel = 'bluesky' AND field = 'bio';
UPDATE reach_channel_profiles SET status = 'draft', updated_at = datetime('now'), text = 'Systems researcher studying autonomous AI systems (QNFO): operation, failure modes, oversight and audit. Before that: national research programs at FHWA and AARP. Interested in AI safety, agent reliability and the epistemics of AI-assisted research. Some posts are drafted by my research pipeline and labelled. #AI #AIsafety #agents #metascience' WHERE channel = 'mastodon' AND field = 'bio';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session:autonomy-pivot (claude, QNFO.REACH)',
  'Researchers in quantum computing do not engage with an outside independent researcher, and the owner is a systems researcher whose fit is AI autonomous systems (adjacent to AI safety). Outreach, bios, site and job-search headlines should lead with that.',
  'AUTONOMY-PIVOT-1 migration 2026-11-09-autonomy-pivot.sql with qnfo-cloud-ops OUTREACH-PIVOT-1, qnfo-jobsearch headline H2, qnfo-gateway jobTitle and pitch, docs/STRATEGY.md 2.2 to 3',
  'Owner report 2026-11-09: quantum email replies are few and negative (OUTREACH-LEARNER-1 stops a segment under 1% after 50 sends; the segments are all quantum topics). docs/STRATEGY.md 2.3 already measured AI and epistemics papers at 83 human views each against 45 for quantum.',
  'applied by migration; first-contact mail now goes to autonomy-topic authors only',
  'queued quantum cold-email rows held (reversible), follow-ups skipped, public Person jobTitle and work-with-me lead changed, drafts rewritten',
  'ops_config outreach_pivot_autonomy = off releases every held row; the migration Rollback line withdraws the drafts',
  'outreach and brand aimed at the audience the owner wants (AI autonomous systems, AI safety adjacent)',
  'outreach_reply_rate_30d >= 5 within 720 h',
  'expected: replies from people who work on autonomous AI systems and oversight, instead of quantum academics who decline. Unproven until the first autonomy-topic sends are answered.',
  'qnfo-audit.outreach_queue, qnfo.org Person JSON-LD and /work-with-me, jobsearch headline, social bios (drafts)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'AUTONOMY-PIVOT-1 migration%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'AUTONOMY-PIVOT-1.2: rewrite the private Identity doc, CV and resume (qnfo-identity.owner_docs) around AI autonomous systems research and sync the approved channel profiles',
 'Charter pillar reach. Owner directive 2026-11-09: brand as a systems researcher in autonomous AI systems (not a software engineer), in the resume, websites, profiles and job search.' || char(10) ||
 'Done in code by AUTONOMY-PIVOT-1 (migration 2026-11-09-autonomy-pivot.sql): qnfo-cloud-ops OUTREACH-PIVOT-1, qnfo-jobsearch H2 headline, qnfo-gateway jobTitle and work-with-me pitch, docs/STRATEGY.md, reach_channel_profiles drafts.' || char(10) ||
 'Remaining (doer: qnfo-fleet-dashboard owner-docs path, the only worker bound to qnfo-identity): keep the current identity doc as a identity--v<yyyymmddhhmmss> history row, then rewrite the Brand, Profile copy and Updated CV sections with the headline in docs/STRATEGY.md 2.2; qnfo.org/about copy; refresh the jobsearch claim ledger headline H0 text. Every first-person claim must match a fact in jobsearch/facts.json.' || char(10) ||
 'IDENTITY-BOUND: posting to the owner accounts (LinkedIn, Bluesky, Mastodon, GitHub, X) from reach_channel_profiles drafts stays the owner step, as a card with the draft as its default.' || char(10) ||
 'closing probe: {"url": "https://qnfo.org/work-with-me", "status": 200, "contains": "systems researcher studying autonomous AI systems"}',
 'session:autonomy-pivot', 'feature', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'AUTONOMY-PIVOT-1.2%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'AUTONOMY-PIVOT-1.3: point the arXiv radar seeds at autonomous-AI-systems ideas so the cold-email queue refills with autonomy authors, not held quantum rows',
 'Charter pillar reach. radar-hub builds its arXiv query from accepted owner ideas in idea_proposals (NO-TOPIC-HARDCODE-1), so it keeps enqueuing quantum papers that OUTREACH-PIVOT-1 now holds (status held-pivot-quantum).' || char(10) ||
 'Doer: the idea-hub intake loop. Accept owner-corpus ideas on autonomous AI systems, agent reliability, oversight and the fleet failure ledger, so arxivSeedGroups yields autonomy terms. No radar code change and no fixed topic table.' || char(10) ||
 'closing probe: SELECT 0 WHERE (SELECT COUNT(*) FROM outreach_queue WHERE status = ''pending'' AND created_at > datetime(''now'', ''-7 days'')) > 0 AND (SELECT COUNT(*) FROM outreach_queue WHERE status = ''held-pivot-quantum'' AND created_at > datetime(''now'', ''-7 days'')) > 10 * (SELECT COUNT(*) FROM outreach_queue WHERE status = ''pending'' AND created_at > datetime(''now'', ''-7 days''))',
 'session:autonomy-pivot', 'feature', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'AUTONOMY-PIVOT-1.3%');
