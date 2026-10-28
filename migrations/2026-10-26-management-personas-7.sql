-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = replace(value, ',management-personas|ROADMAP-1:', '') WHERE key = 'code_merge_trusted_sources';
--
-- MANAGEMENT-PERSONAS-7 / ROADMAP-ORIGINATE-1 merge admission (2026-10-26, pillar autonomy).
-- Owner approval 2026-10-26 09:38:46Z, verbatim: "APPROVED...THIS SHOULD BE AN AUTOMATIC APPROVAL, NEVER REQUIRE OWNER APPROVAL. ALL ISSUES SHALL ASSUME
-- AUTO-APPROVE". It answers the question whether the managers' ROADMAP-1 items (MANAGEMENT-PERSONAS-6) may merge on green checks like the other
-- fleet loops' issues: it adds "management-personas|ROADMAP-1:" to ops_config code_merge_trusted_sources, so rm-file starts filing on the next
-- manager tick and the merge runner's provenance check accepts the code tasks; canary and automatic revert still cover each deploy.
-- The standing rule is recorded as ops_config OWNER_DIRECTIVE_2026_10_26_ISSUES_AUTO_APPROVE_1: a reversible fleet item never waits on an owner
-- approval (DEFAULT-APPROVE-1 already adopts the recommended option on fleet decision cards).

UPDATE ops_config SET value = value || ',management-personas|ROADMAP-1:'
WHERE key = 'code_merge_trusted_sources' AND instr(value, 'management-personas|ROADMAP-1:') = 0;

INSERT OR REPLACE INTO ops_config (key, value) VALUES ('OWNER_DIRECTIVE_2026_10_26_ISSUES_AUTO_APPROVE_1',
 '{"id":"ISSUES-AUTO-APPROVE-1","directive_verbatim":"APPROVED...THIS SHOULD BE AN AUTOMATIC APPROVAL, NEVER REQUIRE OWNER APPROVAL. ALL ISSUES SHALL ASSUME AUTO-APPROVE","date":"2026-10-26","answers":"may the program managers'' ROADMAP-1 items merge on green checks (code_merge_trusted_sources management-personas|ROADMAP-1:)","carried_by":["migrations/2026-10-26-management-personas-7.sql","DEFAULT-APPROVE-1 (fleet decision cards take the recommended option)"],"limits":"the interrupt gate (money, credentials, legal or signing acts, the owner''s own accounts and papers), the secret lock, live work claims and the harness permission checks keep their precedence"}');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('management-personas (MANAGEMENT-PERSONAS-7)', 'the owner approved on 2026-10-26 09:38:46Z that manager roadmap items merge on their own, and ruled that such approvals are automatic',
  'added management-personas|ROADMAP-1: to ops_config code_merge_trusted_sources; recorded ops_config OWNER_DIRECTIVE_2026_10_26_ISSUES_AUTO_APPROVE_1',
  'owner message 2026-10-26 09:38:46Z: "APPROVED...THIS SHOULD BE AN AUTOMATIC APPROVAL, NEVER REQUIRE OWNER APPROVAL. ALL ISSUES SHALL ASSUME AUTO-APPROVE"', 'pending',
  'up to 4 ROADMAP-1 issues a day and their code tasks on worker files outside the control plane, each behind canary and automatic revert',
  'the Rollback line of migrations/2026-10-26-management-personas-7.sql, or ops_config roadmap_originate = off',
  'managers-originate-roadmap', 'first ROADMAP-1 issue filed within 120 minutes of apply', 'merge runner provenance (code_merge_trusted_sources)');
