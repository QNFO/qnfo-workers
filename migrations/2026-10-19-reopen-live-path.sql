-- REOPEN-LIVE-PATH-1 (2026-10-19, pillar autonomy; issue 2954 VERIFICATION-DEFERRAL-STALL-1, the live-path half of its definition of done:
-- every open issue has one live verification path). Also repairs the false fail of the issue-2954 contract on issue-2068.
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 17:26Z to about 19:45Z)
--   The deferral half of 2954 is live (rtEscalateStaleDeferrals, deferred_since, VERIFICATION-DEFERRED-7D-1). The live-path half is not:
--   open issues with no contract in status active, holding, monitoring or escalated numbered 9 at 17:26Z, 14 at 18:10Z, 19 at 18:30Z, 18 at about 18:55Z
--   (2047, 2215, 2450, 2455, 2522, 2607, 2695, 2832, 2925, 100140, 100151, 100238 to 100241, 100247, 100248, 100250) and 20 at about 19:45Z (2455 had left
--   the list; 2192, 100161 and 100166 had joined it). Three causes (the third, a birth path, is the follow-up REOPEN-LIVE-PATH-2 below):
--     1. A reopened issue loses its path. agent_issues_birth_contract_ins is AFTER INSERT only, and issue_refile_reopen is BEFORE INSERT and ends in
--        RAISE(IGNORE): it reopens the OLD row by UPDATE, so no birth trigger ever sees it. The one-off sweep that set the contract of every closed
--        issue to superseded:contract-on-closed-issue (2026-10-18 12:17Z) has no inverse, so the contract of a reopened issue stays superseded (or
--        closed) and nothing revives it. 2047, 2450, 2455, 2522, 2607 and 2655 and 2695 (superseded) and 2192 and 2215 (status closed, verdict pass) were
--        reopened after it, and the same hand repair was needed for issue-2244 (migrations/2026-10-19-remedy-efficacy-per-trigger.sql).
--     2. A probe that cannot judge is never replaced. 2832 and 2925 (superseded:probe-unusable) and 100140 and 100151 (superseded:closure-observing-probe-
--        at-birth) hold a vacuous probe and nobody is told to write a real one.
--     3. Issues are born without a live path: contract_probe_templates_v3_generic supersedes the birth contract of an issue whose source is not itself the
--        name of a live service, and its WHEN clause does not read issue_source_hosts, so the loop-owned template never sees them. 13 of the 20 at 19:45Z
--        (2832, 2925, 100140, 100151, 100161, 100166, 100238 to 100241, 100247, 100248, 100250 are all born that way; the first three are session filings).
--   Nothing revives a contract when an issue goes from closed to open, and nothing records that a probe has to be written.
--
-- WHAT THIS CHANGES
--   1. D1 trigger agent_issues_reopen_live_path_upd, AFTER UPDATE OF status ON agent_issues, WHEN the issue goes to open from any other status and
--      has no contract in a live status. Because issue_refile_reopen reopens by an UPDATE inside its own body, this trigger fires on the INSERT
--      path too. It touches only the rows of NEW.id, so it cannot fan out, and it never fires for a close. In order, each step skipped once the
--      issue has a live contract:
--        a. revive: a contract retired because the issue closed (status closed, or superseded with a verdict that names the closure:
--           contract-on-closed-issue, closure-superseded, issue-wontfix) and whose probe can judge goes back to active with attempts 0, no verdict,
--           no deferral start and a due time of now;
--        b. park: a loop-owned contract whose probe reads the status of its own issue (module probe-template-v2*-loop) goes to monitoring with the
--           verdict of LOOP-OWNED-CONTRACT-MONITORING-1, the state red-drain step 6 already leaves alone and the dead-end detector already skips.
--      An issue whose retired contract no probe can judge (probe-unusable, closure-observing at birth, any other retired contract, or no contract row at
--      all) is left exactly as it is: see "NO PLACEHOLDER" below. The trigger writes only remediation_contracts (it shares the shape of
--      agent_issues_superseded_contracts_upd and agent_issues_runtime_probe_upd, so the D1 trigger-depth canary of the runner compiles nothing deeper than
--      those). It never inserts into agent_issues: D1 refuses that shape inside a deep trigger chain (the runner's TRIGGER-DEPTH-INSERT-ADVISORY-1 note:
--      every INSERT .. SELECT into agent_issues is refused with 7500).
--   2. The same two steps once, as a backfill, for EVERY open issue that has no live contract when the file applies. The two UPDATEs select their rows
--      with issue_id IN (SELECT id FROM agent_issues WHERE status = 'open') and keep the trigger's own guards (no live contract, the closure-retired
--      verdict whitelist, a usable probe), so the set is exactly what the trigger would have fixed had it existed. An id list would drift from the
--      audit the moment another issue reopened. The rows the statements can change are copied to bak_20261019_reopen_live_path first, with the same
--      predicate.
--   3. One PROBE-NEEDED-1 issue per issue that stands without a probe and is already named by the dead-end view (2832, 2925, 100140, 100151), titled
--      'PROBE-NEEDED-1: issue-<id>', as a single-row INSERT OR IGNORE: the unique open-title index and agent_issues_open_dup_annotate dedupe it against open
--      issues of the same title, so a second apply or a second reopen files nothing more. Its description names the probe to write and the doer; its own
--      contract is a real measurement, not a constant: it reads 'pending' while the target issue is open and none of its contracts is active or holding
--      with a probe of its own (not needs-machine-probe, not a read of the issue's own status), and ok once the target has one or is no longer open;
--      the autoclose path then closes the PROBE-NEEDED-1 issue.
--   4. The contract of issue 2954 gets the corrected closing probe. The old one anchored on remediation_contracts.ts (the contract's birth) instead of
--      deferred_since, so it read 2 on 2026-10-19 17:26Z: issue-2068 (contract born 10-06, deferred_since reset 10-19 13:58Z, so not deferred for 10080 minutes) and
--      issue-2381 (a contract of a closed issue). The new probe has two terms: (T1) open issues with no live contract for 60 minutes since their last
--      open or reopen event; (T2) active contracts deferred over 10110 minutes with no escalation issue, leaving out the escalation issues' own contracts.
--   5. failure mode reopen-without-live-path with its detector fm-reopen-without-live-path (term T1 of that probe), a capability_ledger row
--      and a decision_log row.
--   6. Two follow-up issues. REOPEN-LIVE-PATH-2 for cause 3 (the birth path): map the loop labels whose loop is verified to close its own issue
--      (chaos-drill and fleet-journeys; qnfo-fleet-advisor is mapped already) and make the v3 template leave a mapped label to the loop-owned template, so
--      such a contract is born monitoring:loop-owned-48h. A label with no verified closer (cf-model-eval, the [ai-cal] rows of agent_issues) is not mapped:
--      it needs a closer or a PROBE-NEEDED-1 issue first. REOPEN-LIVE-PATH-3 for the standing behaviour D1 cannot hold inside a trigger (its depth rules out
--      an INSERT into agent_issues): a function rtEnsureLivePath in the qnfo-fleet-control remediation tick that files one deduped PROBE-NEEDED-1 issue per
--      orphan older than 60 minutes (code-task and code-probe lines, so the code loop owns it), after REOPEN-LIVE-PATH-2 has landed for the mapped
--      loop labels.
--   7. control_registry (DOCTRINE-1): the park this file adds (step b of the trigger and the second backfill statement) is a second producer of the state
--      the registered hold loop-owned-contract-park makes, so that row's location and evidence name it and its reviewed_at is set; the Rollback line
--      removes the appended text again.
--
-- NO PLACEHOLDER (review of 2026-10-19; replaces the first version of this file, which gave such an issue an active contract whose probe was a constant
-- reading 'pending')
--   A constant that reads pending measures nothing, but 'active' is the only status the older measures accept as a live path, so it silenced them without a
--   probe being written. A dry run of that first version on live qnfo-audit at 19:12Z: fm-open-issue-no-doer (DEAD-END-DOER-1, whose header says it falls as
--   probes are written) would have gone from 10 to 0 with 8 of the 10 gone through the constant alone, issues_without_next_action (v_issues_no_next_action
--   counts only active or holding contracts; a guard metric) would have lost about ten issues on the constant, and the two follow-ups would have made it structural (every vacuous birth contract born as the
--   constant, every orphan older than 60 minutes given it). Those are exactly the probe-unusable and closure-observing rows the dead-end view exists to hand
--   to a probe author. So an issue nothing can judge keeps its retired contract, stays in v_issue_dead_end and in issues_without_next_action, and is counted
--   by T1 of fm-reopen-without-live-path and of the issue-2954 probe 60 minutes after it opened. That is the honest state; the 2954 contract stays red until
--   the probes exist, which is its live-path definition of done and not a defect of this file. The audit spec's alternative, parking the contract as
--   escalated:probe-needed, is not viable either: red-drain step 6 (PARKED-REARM-1) sets an escalated or monitoring contract of an open, non-METRIC-TRIGGER
--   issue back to active when the issue has no active or holding contract and nothing was verified for 50 minutes, and step 0 supersedes the vacuous probe
--   again on the next hour, so the row would be live for under an hour.
--
-- WHAT THE APPLY DOES TO THE OLDER MEASURES (read from qnfo-audit 2026-10-19 19:4xZ; the numbers move with the fleet, the mechanism does not)
--   fm-open-issue-no-doer (DEAD-END-DOER-1): 12 before, 10 after. 2192 (closed, verdict pass) is revived and 2695 (circular loop-owned probe) is parked, which the
--     detector skips. The ten left (2832, 2925, 100140, 100151, 100161, 100166, 100238 to 100241) are the issues that need a probe author; 100247, 100248
--     and 100250 join them when they pass 120 minutes. No issue leaves it for a constant.
--   issues_without_next_action (guard metric): 70 before, 64 after. Six real revives leave it (2047, 2192, 2215, 2450, 2522, 2607); a park (2695) does not,
--     because the view counts only active and holding contracts. The other twelve orphans that are in it (2832, 100140, 100151, 100161, 100166, 100238 to
--     100241, 100247, 100248, 100250; 2925 is not, it has a code task) stay in it until a probe is written or the issue closes.
--   issues_unprobed_60m: no change at the apply (a revived contract is probed at its next due time).
--   fm-reopen-without-live-path and the issue-2954 probe: 13 issues are left without a live contract at the same read (2832, 2925, 100140, 100151, 100161,
--     100166, 100238 to 100241, 100247, 100248, 100250); the first term counts those older than 60 minutes, so the probes read 11 then (100161 and 100166
--     had opened at 19:41Z) and 13 an hour later, and fall as probes are written, loop-owned mappings land (REOPEN-LIVE-PATH-2) or the issues close. A
--     red reading is the intended state.
--
-- WHAT STAYS OPEN (nothing is dropped silently)
--   1. The probes themselves: 2832, 2925, 100140 and 100151 have a PROBE-NEEDED-1 issue that names the probe to write; any later orphan is named by
--      REOPEN-LIVE-PATH-3 once it lands, and counted by T1 until then. Of the loop-filed ones, 100161 and 100166 (fleet-journeys), 100247 and 100248
--      (chaos-drill) are the case of REOPEN-LIVE-PATH-2: their loops are verified to close them (fleet-journeys closed 100161 and 100166 with close_channel
--      auto-recovery at 20:00Z on 2026-10-19), so they need no probe author, they need the loop-owned park the other loop-filed issues already have.
--      100238 to 100241 (the ai-calibration prober, rows with source NULL) and 100250 (cf-model-eval) are NOT that case: nothing was found that closes them
--      (qnfo-model-eval has no code that closes an issue and all ten closed cf-model-eval issues were closed by a session or a sweep; the closeIssue of
--      qnfo-ai-calibration acts on issue_ledger and the writer of the agent_issues copy is unknown), so a loop-owned park would hide them without a probe.
--      They stay counted by T1 until a closer is found and shown, or a PROBE-NEEDED-1 issue (REOPEN-LIVE-PATH-3) names the probe to write.
--   2. The birth path (cause 3): an issue born through contract_probe_templates_v3_generic is born superseded. REOPEN-LIVE-PATH-2 changes the lever so a later
--      birth under a label with a verified closer gets the loop-owned state, and until it lands T1 counts any later birth that has none after 60 minutes (a
--      change to a remediation_contracts trigger needs its own depth review, so it is not made here).
--   3. An issue reopened after the apply is the trigger's; one reopened between the audit read and the apply is the backfill's, because the backfill
--      selects by state and not by id. No issue is left to a window.
--
-- Backups: bak_20261019_reopen_live_path (every contract row of an open issue that has no live contract, and the issue-2954 contract; the
--   CREATE TABLE runs before any change, so the set is the one the backfill then acts on). The Rollback line restores them. It also takes the text it
--   appended to the control_registry row loop-owned-contract-park out again with replace() (reviewed_at is a review stamp and stays).
-- spof-review: the trigger is the first path to a live verification path at a reopen and the set-based backfill covers every issue open at the apply.
--   The second path is fm-reopen-without-live-path plus the issue-2954 probe (T1 counts an open issue that has none after 60 minutes) and
--   REOPEN-LIVE-PATH-3, which files the PROBE-NEEDED-1 issue for it; a session or loop can always close an issue with issue_triage.close_evidence.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_reopen_live_path
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_reopen_live_path_upd; UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class), deferred_since = (SELECT b.deferred_since FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261019_reopen_live_path b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_reopen_live_path); UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback of REOPEN-LIVE-PATH-1' WHERE issue_id IN (SELECT id FROM agent_issues WHERE (title IN ('PROBE-NEEDED-1: issue-2832', 'PROBE-NEEDED-1: issue-2925', 'PROBE-NEEDED-1: issue-100140', 'PROBE-NEEDED-1: issue-100151') OR title LIKE 'REOPEN-LIVE-PATH-2:%' OR title LIKE 'REOPEN-LIVE-PATH-3:%') AND status = 'open'); UPDATE agent_issues SET status = 'superseded' WHERE (title IN ('PROBE-NEEDED-1: issue-2832', 'PROBE-NEEDED-1: issue-2925', 'PROBE-NEEDED-1: issue-100140', 'PROBE-NEEDED-1: issue-100151') OR title LIKE 'REOPEN-LIVE-PATH-2:%' OR title LIKE 'REOPEN-LIVE-PATH-3:%') AND status = 'open'; DELETE FROM remediation_contracts WHERE class = 'fm-reopen-without-live-path'; DELETE FROM failure_modes WHERE fm_key = 'reopen-without-live-path'; DELETE FROM capability_ledger WHERE capability = 'reopen-live-path'; UPDATE control_registry SET location = replace(location, ', D1 trigger agent_issues_reopen_live_path_upd and the REOPEN-LIVE-PATH-1 backfill (a reopened or open issue gets the same park)', ''), evidence = replace(evidence, ' REOPEN-LIVE-PATH-1 (2026-10-19): a second producer of the same state. Step b of the trigger agent_issues_reopen_live_path_upd and the second backfill statement park the contract of a reopened or open issue whose probe reads the status of its own issue (module probe-template-v2 loop) as monitoring, with the verdict of this row, and the park ends when the issue closes. It parks nothing a probe could judge and makes no contract for an issue nothing can judge (fm-reopen-without-live-path counts those after 60 minutes).', '') WHERE control = 'loop-owned-contract-park'

-- The backup holds every contract row of an open issue that has no live contract (the set the backfill below acts on, read before any change here)
-- and the issue-2954 contract.
CREATE TABLE IF NOT EXISTS bak_20261019_reopen_live_path AS
  SELECT * FROM remediation_contracts
   WHERE class = 'issue-2954'
      OR issue_id IN (SELECT a.id FROM agent_issues a WHERE a.status = 'open'
                       AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding', 'monitoring', 'escalated')));

-- 1. The trigger. Steps a and b are described in the header. The live statuses are the ones the 2954 measure counts.
CREATE TRIGGER IF NOT EXISTS agent_issues_reopen_live_path_upd AFTER UPDATE OF status ON agent_issues
WHEN NEW.status = 'open' AND COALESCE(OLD.status, '') <> 'open'
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active', 'holding', 'monitoring', 'escalated'))
BEGIN
  UPDATE remediation_contracts
     SET status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
   WHERE issue_id = NEW.id
     AND (status = 'closed'
          OR (status = 'superseded' AND (instr(COALESCE(last_verdict, ''), 'superseded:contract-on-closed-issue') = 1
                                         OR instr(COALESCE(last_verdict, ''), 'superseded:closure-superseded') = 1
                                         OR instr(COALESCE(last_verdict, ''), 'superseded:issue-wontfix') = 1)))
     AND instr(verify_probe, 'needs-machine-probe') = 0
     AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') = 0
     AND instr(verify_probe, 'agent_issues WHERE id = ' || NEW.id || ')') = 0;
  UPDATE remediation_contracts
     SET status = 'monitoring', next_due_at = NULL,
         last_verdict = 'monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)',
         action = 'REOPEN-LIVE-PATH-1 (LOOP-OWNED-CONTRACT-MONITORING-1): the filing loop closes this reopened issue on recovery. This contract is parked as monitoring and is not probed, so it cannot block that close (close-while-contract-fails). The 120-minute issue SLA (issues_open_over_120m) and the stale views still report the open issue.'
   WHERE issue_id = NEW.id
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active', 'holding', 'monitoring', 'escalated'))
     AND status IN ('superseded', 'closed')
     AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') > 0
     AND COALESCE(module, '') LIKE 'probe-template-v2%-loop';
END;

-- 2. The backfill: the same two steps for every open issue, by state and not by id. Each step runs only for an open issue that has no live contract,
-- so an issue that already has a live path (and a closed issue) is never touched, and no contract of any other issue moves.
UPDATE remediation_contracts
   SET status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE issue_id IN (SELECT o.id FROM agent_issues o WHERE o.status = 'open')
   AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open')
   AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = remediation_contracts.issue_id AND c.status IN ('active', 'holding', 'monitoring', 'escalated'))
   AND (status = 'closed'
        OR (status = 'superseded' AND (instr(COALESCE(last_verdict, ''), 'superseded:contract-on-closed-issue') = 1
                                       OR instr(COALESCE(last_verdict, ''), 'superseded:closure-superseded') = 1
                                       OR instr(COALESCE(last_verdict, ''), 'superseded:issue-wontfix') = 1)))
   AND instr(verify_probe, 'needs-machine-probe') = 0
   AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') = 0
   AND instr(verify_probe, 'agent_issues WHERE id = ' || issue_id || ')') = 0;

UPDATE remediation_contracts
   SET status = 'monitoring', next_due_at = NULL,
       last_verdict = 'monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)',
       action = 'REOPEN-LIVE-PATH-1 (LOOP-OWNED-CONTRACT-MONITORING-1): the filing loop closes this reopened issue on recovery. This contract is parked as monitoring and is not probed, so it cannot block that close (close-while-contract-fails). The 120-minute issue SLA (issues_open_over_120m) and the stale views still report the open issue.'
 WHERE issue_id IN (SELECT o.id FROM agent_issues o WHERE o.status = 'open')
   AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open')
   AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = remediation_contracts.issue_id AND c.status IN ('active', 'holding', 'monitoring', 'escalated'))
   AND status IN ('superseded', 'closed')
   AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') > 0
   AND COALESCE(module, '') LIKE 'probe-template-v2%-loop';

-- 3. One PROBE-NEEDED-1 issue per issue that stands without a probe and that the dead-end view already names. Single-row VALUES inserts: agent_issues
-- refuses the INSERT .. SELECT shape at compile time. The unique open-title index and agent_issues_open_dup_annotate dedupe against open issues of the
-- same title.
INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'PROBE-NEEDED-1: issue-2832',
 'Charter pillar: autonomy. REOPEN-LIVE-PATH-1 (migrations/2026-10-19-reopen-live-path.sql) found issue 2832 open with no live verification path: its only contract was superseded as probe-unusable (the probe it held reads the status of its own issue and cannot pass while the issue is open). That file leaves the contract as it is on purpose: a probe that only reads pending would take 2832 out of fm-open-issue-no-doer and issues_without_next_action without anything measuring it. 2832 therefore stays in the dead-end view and in the first term of fm-reopen-without-live-path and of the issue-2954 probe until a real probe exists.' || char(10) ||
 'The probe to write: one that measures the issue''s own definition of done where the fleet can see it. The Windows box itself is outside the fleet''s view, so a candidate is a code-probe or runtime-probe line over the four suites the issue still lists as failing (qnfo-code-orchestrator multi-file, no-eol, self-repair and scripts/direct-content-deploy-ledger), asserting they no longer depend on CRLF output or a live fetch. If no probe can measure it, park the contract by a recorded decision.' || char(10) ||
 'How: a migration (APPLY-BY ci, DB qnfo-audit, a Rollback line) with UPDATE remediation_contracts SET verify_probe = <d1-query SQL returning expected and observed>, verify_transport = ''d1-query'', status = ''active'', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime(''now'') WHERE class = ''issue-2832''. The probe must not read the status of issue 2832 itself.' || char(10) ||
 'Doer: the session or loop that takes issue 2832 (take the work claim issue:2832 first).' || char(10) ||
 'Definition of done: issue 2832 has a contract in status active or holding whose probe measures the defect (it is not needs-machine-probe and does not read the status of the issue itself), or issue 2832 is no longer open. The d1-query contract on this issue reads pending until then and ok after, and the autoclose path closes this issue.',
 'qnfo-fleet-control', 'reliability', 'medium', 'open',
 CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'PROBE-NEEDED-1: issue-100140',
 'Charter pillar: autonomy. REOPEN-LIVE-PATH-1 (migrations/2026-10-19-reopen-live-path.sql) found issue 100140 open with no live verification path: its contract was born superseded because no probe existed (a closure-observing probe at birth, which measures nothing while the issue is open). That file leaves the contract as it is on purpose: a probe that only reads pending would take 100140 out of fm-open-issue-no-doer and issues_without_next_action without anything measuring it. 100140 therefore stays in the dead-end view and in the first term of fm-reopen-without-live-path and of the issue-2954 probe until a real probe exists.' || char(10) ||
 'The probe to write: one that reads the five corrections the issue lists out of the papers it names. Candidate: a d1-query@living-paper probe on papers.body_md showing that universal-ignorance-audit carries the Whitcomb citation as 94(3), 509-539 and no longer as 91(1), and that ai4metascience-ignorance-audit points 2026b to qwave-qudit-advantage; each paper republished as a new version.' || char(10) ||
 'How: a migration (APPLY-BY ci, DB qnfo-audit, a Rollback line) with UPDATE remediation_contracts SET verify_probe = <SQL returning expected and observed>, verify_transport = ''d1-query@living-paper'', status = ''active'', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime(''now'') WHERE class = ''issue-100140''. The probe must not read the status of issue 100140 itself.' || char(10) ||
 'Doer: the session or loop that takes issue 100140 (take the work claim issue:100140 first).' || char(10) ||
 'Definition of done: issue 100140 has a contract in status active or holding whose probe measures the defect (it is not needs-machine-probe and does not read the status of the issue itself), or issue 100140 is no longer open. The d1-query contract on this issue reads pending until then and ok after, and the autoclose path closes this issue.',
 'qnfo-fleet-control', 'reliability', 'medium', 'open',
 CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'PROBE-NEEDED-1: issue-100151',
 'Charter pillar: autonomy. REOPEN-LIVE-PATH-1 (migrations/2026-10-19-reopen-live-path.sql) found issue 100151 open with no live verification path: its contract was born superseded because no probe existed (a closure-observing probe at birth, which measures nothing while the issue is open). That file leaves the contract as it is on purpose: a probe that only reads pending would take 100151 out of fm-open-issue-no-doer and issues_without_next_action without anything measuring it. 100151 therefore stays in the dead-end view and in the first term of fm-reopen-without-live-path and of the issue-2954 probe until a real probe exists.' || char(10) ||
 'The probe to write: one that reads the condition qnfo-fleet-advisor reports, the degraded model list in the issue title. Candidate: SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ai_model_health WHERE status = ''degraded'' AND model_id IN (<the models named in the title>)) AS TEXT) AS observed. qnfo-backlog-exec already closes a MODEL-DEGRADED issue when none of its named models is degraded, so the probe and that closer read the same table.' || char(10) ||
 'How: a migration (APPLY-BY ci, DB qnfo-audit, a Rollback line) with UPDATE remediation_contracts SET verify_probe = <d1-query SQL returning expected and observed>, verify_transport = ''d1-query'', status = ''active'', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime(''now'') WHERE class = ''issue-100151''. The probe must not read the status of issue 100151 itself.' || char(10) ||
 'Doer: the session or loop that takes issue 100151 (take the work claim issue:100151 first).' || char(10) ||
 'Definition of done: issue 100151 has a contract in status active or holding whose probe measures the defect (it is not needs-machine-probe and does not read the status of the issue itself), or issue 100151 is no longer open. The d1-query contract on this issue reads pending until then and ok after, and the autoclose path closes this issue.',
 'qnfo-fleet-control', 'reliability', 'medium', 'open',
 CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'PROBE-NEEDED-1: issue-2925',
 'Charter pillar: autonomy. REOPEN-LIVE-PATH-1 (migrations/2026-10-19-reopen-live-path.sql) found issue 2925 open with no live verification path: its only contract was superseded as probe-unusable (no machine-executable probe; the issue stays open and needs a real one) and had been so for over 1500 minutes. That file leaves the contract as it is on purpose: a probe that only reads pending would take 2925 out of fm-open-issue-no-doer without anything measuring it. 2925 therefore stays in the dead-end view and in the first term of fm-reopen-without-live-path and of the issue-2954 probe until a real probe exists.' || char(10) ||
 'The probe to write: one that measures the two halves of the issue''s definition of done, as one d1-query or as two contracts. (1) The Mastodon field: the account fields of mstdn.science/@QNFO list https://qnfo.org with a non-null verified_at; an external-https read of the public account lookup (GET https://mstdn.science/api/v1/accounts/lookup?acct=QNFO, the public API MASTODON-PUBLIC-STATS-1 already reads) can check it. (2) The engagement half: posts_unmeasured for mastodon = 0, read from the D1 table or view that holds the per-channel metrics count (the issue names buffer_channel; find the real table or view in sqlite_master before writing the probe). If only one half can be measured, probe that one and say which in the contract''s action.' || char(10) ||
 'How: a migration (APPLY-BY ci, DB qnfo-audit, a Rollback line) with UPDATE remediation_contracts SET verify_probe = <SQL returning expected and observed>, status = ''active'', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime(''now'') WHERE class = ''issue-2925'' (set verify_transport to match the probe). The probe must not read the status of issue 2925 itself.' || char(10) ||
 'Doer: the session or loop that takes issue 2925 (take the work claim issue:2925 first).' || char(10) ||
 'Definition of done: issue 2925 has a contract in status active or holding whose probe measures the defect (it is not needs-machine-probe and does not read the status of the issue itself), or issue 2925 is no longer open. The d1-query contract on this issue reads pending until then and ok after, and the autoclose path closes this issue.',
 'qnfo-fleet-control', 'reliability', 'medium', 'open',
 CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- The closing probe of each PROBE-NEEDED-1 issue: a measurement of the target, not a constant. It reads ok when the target is no longer open or holds an
-- active or holding contract with a probe of its own, and pending until then. Guarded on the module, so a second apply (or a doer who already changed the
-- probe) leaves it alone. The two markers it excludes are written in two literals each: red-drain step 0 supersedes an active contract whose probe text
-- contains the first marker, and fm-loop-owned-contract-circular and step 7 match the second, so a probe that spelled them out would be retired within the hour.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = 2832 AND x.status = ''open'') THEN ''ok'' WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = 2832 AND c.status IN (''active'', ''holding'') AND instr(c.verify_probe, ''needs-machine'' || ''-probe'') = 0 AND instr(c.verify_probe, ''SELECT status FROM agent_issues WHERE'' || '' id ='') = 0 AND instr(c.verify_probe, ''agent_issues WHERE id = 2832)'') = 0) THEN ''ok'' ELSE ''pending: issue 2832 has no probe of its own yet, a doer writes one'' END AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'reopen-live-path',
  precondition = 'issue 2832 is open and none of its contracts holds a probe that can judge it',
  action = 'a doer writes the probe that measures issue 2832 and sets its contract active', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1
 WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title = 'PROBE-NEEDED-1: issue-2832' AND status = 'open')
   AND COALESCE(module, '') <> 'reopen-live-path';

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = 100140 AND x.status = ''open'') THEN ''ok'' WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = 100140 AND c.status IN (''active'', ''holding'') AND instr(c.verify_probe, ''needs-machine'' || ''-probe'') = 0 AND instr(c.verify_probe, ''SELECT status FROM agent_issues WHERE'' || '' id ='') = 0 AND instr(c.verify_probe, ''agent_issues WHERE id = 100140)'') = 0) THEN ''ok'' ELSE ''pending: issue 100140 has no probe of its own yet, a doer writes one'' END AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'reopen-live-path',
  precondition = 'issue 100140 is open and none of its contracts holds a probe that can judge it',
  action = 'a doer writes the probe that measures issue 100140 and sets its contract active', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1
 WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title = 'PROBE-NEEDED-1: issue-100140' AND status = 'open')
   AND COALESCE(module, '') <> 'reopen-live-path';

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = 100151 AND x.status = ''open'') THEN ''ok'' WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = 100151 AND c.status IN (''active'', ''holding'') AND instr(c.verify_probe, ''needs-machine'' || ''-probe'') = 0 AND instr(c.verify_probe, ''SELECT status FROM agent_issues WHERE'' || '' id ='') = 0 AND instr(c.verify_probe, ''agent_issues WHERE id = 100151)'') = 0) THEN ''ok'' ELSE ''pending: issue 100151 has no probe of its own yet, a doer writes one'' END AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'reopen-live-path',
  precondition = 'issue 100151 is open and none of its contracts holds a probe that can judge it',
  action = 'a doer writes the probe that measures issue 100151 and sets its contract active', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1
 WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title = 'PROBE-NEEDED-1: issue-100151' AND status = 'open')
   AND COALESCE(module, '') <> 'reopen-live-path';

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = 2925 AND x.status = ''open'') THEN ''ok'' WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = 2925 AND c.status IN (''active'', ''holding'') AND instr(c.verify_probe, ''needs-machine'' || ''-probe'') = 0 AND instr(c.verify_probe, ''SELECT status FROM agent_issues WHERE'' || '' id ='') = 0 AND instr(c.verify_probe, ''agent_issues WHERE id = 2925)'') = 0) THEN ''ok'' ELSE ''pending: issue 2925 has no probe of its own yet, a doer writes one'' END AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'reopen-live-path',
  precondition = 'issue 2925 is open and none of its contracts holds a probe that can judge it',
  action = 'a doer writes the probe that measures issue 2925 and sets its contract active', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1
 WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title = 'PROBE-NEEDED-1: issue-2925' AND status = 'open')
   AND COALESCE(module, '') <> 'reopen-live-path';

-- The follow-up for cause 3 (the birth path). Single-row VALUES insert, deduped by the open-title index like the four above. It maps only the labels whose
-- loop is verified to close its own issue (chaos-drill and fleet-journeys); cf-model-eval and the [ai-cal] rows have no verified closer and are left to a
-- closer or a PROBE-NEEDED-1 issue first, because a loop-owned park on them would hide the issue without a probe (review of 2026-10-19).
INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'REOPEN-LIVE-PATH-2: an issue filed by a fleet loop under a mapped or unmapped label is born with no live verification path',
 'Charter pillar: autonomy. REOPEN-LIVE-PATH-1 (migrations/2026-10-19-reopen-live-path.sql) gives a reopened issue its live contract back where a probe can judge it, but an issue is also born without one: contract_probe_templates_v3_generic (CLOSE-PROBE-CIRCULAR-1) supersedes the birth contract of every issue whose source is not itself the name of a live service, and its WHEN clause does not read issue_source_hosts, so the loop-owned template (contract_probe_templates_loop_merged, which parks the contract as monitoring:loop-owned-48h) never sees an issue filed under a loop label. Measured 2026-10-19 19:4xZ: once the revive and the park of REOPEN-LIVE-PATH-1 are counted out, 13 open issues had no live contract and 10 of them were born that way: 100151 (qnfo-fleet-advisor, mapped to qnfo-fleet-control in issue_source_hosts and still claimed by v3), 100161 and 100166 (fleet-journeys), 100238 to 100241 (the ai-calibration prober, which reaches agent_issues with no source), 100247 and 100248 (chaos-drill) and 100250 (cf-model-eval). The other three (2832, 2925, 100140) are session filings with a PROBE-NEEDED-1 issue each.' || char(10) ||
 'WHICH LABELS THIS ISSUE MAPS: only a label whose loop is verified to close its own issue. A loop-owned park (monitoring:loop-owned-48h, the filing loop closes it) is true only then, and the dead-end view skips a parked issue without a probe, so a park on a label nobody closes would hide the issue. Verified (code on main, and closed rows read 2026-10-19 20:1xZ): chaos-drill (the chaos drill pass of qnfo-fleet-control closes the CHAOS-DRILL-FAILED-1 issue when the alternate''s probe passes again: its close step writes the close evidence CHAOS-DRILL-1 and sets the issue closed) and fleet-journeys (journeyTick in qnfo-fleet-control and scripts/fleet_journeys.py close the issue with close_channel auto-recovery on the first run in which the journey passes every step; 100161 and 100166 were closed that way at 20:00Z). qnfo-fleet-advisor is mapped already (qnfo-backlog-exec closes a MODEL-DEGRADED issue when none of its named models is degraded). NOT verified, so neither mapped nor parked by this issue: cf-model-eval (qnfo-model-eval/worker.js files an issue and has no code that closes one; all ten closed cf-model-eval issues were closed by a session or a sweep, none by the loop) and the [ai-cal] model-probe rows of agent_issues (the closeIssue of qnfo-ai-calibration acts on issue_ledger; the copy has source NULL and its writer is unknown; qnfo-backlog-exec has a close predicate for the title, but at 21:0xZ the four models named by the open rows 100238 to 100241 all read status ok in ai_model_health, so the predicate holds, the rows have been open since 17:15Z, and no cloud_ops_events row records a backlog-exec close of an [ai-cal] issue). Any other label is treated the same until its closer is read in code or shown on a closed row.' || char(10) ||
 'REOPEN-LIVE-PATH-1 gives the ten no contract of any kind on purpose: an active contract whose probe is a constant that reads pending would take them out of fm-open-issue-no-doer and issues_without_next_action without measuring anything. They are counted by the first term of fm-reopen-without-live-path until a park or a probe exists. This issue covers the issues filed under a verified label (at the 19:4xZ read 100151, 100161, 100166, 100247 and 100248) and any later birth under one. It does not cover 100238 to 100241 and 100250: they stay counted until a closer is shown or a PROBE-NEEDED-1 issue names the probe to write.' || char(10) ||
 'Edit (one migration with APPLY-BY ci, DB qnfo-audit, a Rollback line and a BACKUP table holding the current trigger text and the rows it parks): (1) insert into issue_source_hosts the two verified labels that are not mapped, chaos-drill and fleet-journeys (both filed by qnfo-fleet-control), each to a host that is live in service_registry; (2) re-create contract_probe_templates_v3_generic as the NEWEST remediation_contracts trigger, so it still fires first (see migrations/2026-10-19-loop-owned-contract-monitoring.sql, the order trap), with one more condition in its WHEN clause: NOT EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source JOIN service_registry s ON s.service = m.host AND s.state = ''live'' WHERE a.id = NEW.issue_id), so a mapped label is left to the loop-owned template and its contract is born monitoring:loop-owned-48h, a state the dead-end detector already skips; it must set the same columns as the current one, because the runner compiles zero-row writes on remediation_contracts and agent_issues after it (D1-TRIGGER-DEPTH-1); (3) one guarded UPDATE that parks the standing v3-superseded contracts of the open issues filed under a mapped label as the loop-owned monitoring state; (4) update the control_registry row loop-owned-contract-park in the same migration (location: the re-created v3 template and this park; evidence: the labels mapped and the closer verified for each), because the v3 change is a filter (DOCTRINE-1). It creates no contract that only reads pending. Add a test beside migrations/loop-owned-contract-monitoring.test.mjs.' || char(10) ||
 'NOT in this edit, because each needs a closer or a probe first (a PROBE-NEEDED-1 issue is the fallback, and REOPEN-LIVE-PATH-3 files it): cf-model-eval (a code-task gives qnfo-model-eval a recovery close for its CF-MODEL-EVAL-1 issue, then a later migration maps the label) and the [ai-cal] rows (find the writer that copies them into agent_issues and find why qnfo-backlog-exec has not closed 100238 to 100241 while their models read ok; only when rows that writer made are shown closed on recovery, give the copy the ledger source qnfo-ai-calibration, a live service name that v3 already leaves alone, and park it).' || char(10) ||
 'Doer: the session or loop that takes this issue (take the work claim issue:<id> first).' || char(10) ||
 'Definition of done: no open issue filed under a mapped label, chaos-drill or fleet-journeys holds a contract born superseded by v3 (first term of the closing probe), chaos-drill and fleet-journeys are mapped (second term), and the live text of contract_probe_templates_v3_generic reads issue_source_hosts (third term). The d1-query contract on this issue reads the sum, expected 0. cf-model-eval and the [ai-cal] rows are outside the probe on purpose: they are not parked, so this issue cannot be closed by hiding them.',
 'qnfo-fleet-control', 'reliability', 'high', 'open',
 CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST(((SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.module = ''probe-template-v3-generic'' AND c.status = ''superseded'') AND (a.source IN (''chaos-drill'', ''fleet-journeys'') OR a.source IN (SELECT m.source FROM issue_source_hosts m JOIN service_registry s ON s.service = m.host AND s.state = ''live''))) + (SELECT COUNT(*) FROM (SELECT ''chaos-drill'' AS lbl UNION ALL SELECT ''fleet-journeys'') w WHERE NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = w.lbl)) + (SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name = ''contract_probe_templates_v3_generic'' AND instr(sql, ''issue_source_hosts'') = 0)) AS TEXT) AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'reopen-live-path',
  precondition = 'the v3 birth template still supersedes the contract of an issue filed under a fleet-loop label whose loop closes its own issue',
  action = 'one migration maps the verified loop labels (chaos-drill, fleet-journeys), re-creates the v3 template so a mapped label is left to the loop-owned template, and parks the standing contracts', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1
 WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'REOPEN-LIVE-PATH-2:%' AND status = 'open')
   AND COALESCE(module, '') <> 'reopen-live-path';

-- The follow-up for the standing behaviour: an orphan made after this file (born without a live contract, or reopened with a retired contract no probe can
-- judge) is named nowhere but in the first term of the detector until a loop files its PROBE-NEEDED-1 issue. The edit is code, so it carries the code-task,
-- code-anchor and code-probe lines (the anchor occurs once in qnfo-fleet-control/worker.js on main, the marker rtEnsureLivePath nowhere), and its closing
-- contract is the code-read probe itself. It skips the issues REOPEN-LIVE-PATH-2 is about to park until that issue has landed.
INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'REOPEN-LIVE-PATH-3: no loop files a PROBE-NEEDED-1 issue for an open issue that stands without a live contract',
 'Charter pillar: autonomy. REOPEN-LIVE-PATH-1 (migrations/2026-10-19-reopen-live-path.sql) revives or parks the contract of a reopened issue when a probe can judge it, and files PROBE-NEEDED-1 issues for the four issues that stand without one at its apply (2832, 2925, 100140, 100151). The D1 trigger cannot file one for a later orphan: D1 refuses an INSERT into agent_issues inside a deep trigger chain (the runner''s TRIGGER-DEPTH-INSERT-ADVISORY-1 note). An issue that is left without a live contract after the apply (born so, or reopened with a retired contract no probe can judge) is therefore named only by the first term of fm-reopen-without-live-path and of the issue-2954 probe, 60 minutes after it opened, and nobody is told which probe to write. OWNER-NO-LOOSE-ENDS-1: the measure is red, and nobody is told which probe to write.' || char(10) ||
 'Edit (qnfo-fleet-control/worker.js, remediation tick, straight after the rtEscalateStaleDeferrals call): add async function rtEnsureLivePath(db, out) in its own try/catch so a failure never breaks the tick, switched off by ops_config rt_ensure_live_path = off. For each open issue with no remediation_contracts row in status active, holding, monitoring or escalated, older than 60 minutes since its last opened or reopened issue_lifecycle event, and with no open issue titled ''PROBE-NEEDED-1: issue-<id>'', file that issue (an INSERT guarded by NOT EXISTS on the open title, the description shape of migrations/2026-10-19-reopen-live-path.sql: the probe to write, how, the doer, the definition of done), at most 3 per tick and 12 per 1440 minutes (the bounds rtEscalateStaleDeferrals uses), and give the new issue the closing contract of the four filed there (pending until the target holds an active or holding contract with a probe of its own, ok when the target is no longer open). It writes no contract for the target and never a probe that only reads pending: an orphan stays visible to fm-open-issue-no-doer and issues_without_next_action until a probe exists. Report probe_needed_filed in the tick output.' || char(10) ||
 'SKIPS, AND THE ORDER AGAINST REOPEN-LIVE-PATH-2: the filer must not file for an issue whose own loop closes it and that REOPEN-LIVE-PATH-2 parks. While an open issue titled ''REOPEN-LIVE-PATH-2:%'' exists, rtEnsureLivePath skips an orphan (a) whose source is mapped in issue_source_hosts to a live host in service_registry, (b) whose source is chaos-drill or fleet-journeys (the two labels REOPEN-LIVE-PATH-2 maps), or (c) whose title starts with ''[ai-cal] '' (its closer is tested in REOPEN-LIVE-PATH-2). It never skips for any other reason, and never skips a cf-model-eval orphan or an orphan of any label with no verified closer: those have no closer, so they get their PROBE-NEEDED-1 issue. Once REOPEN-LIVE-PATH-2 is closed no skip is needed for (a) and (b), because a parked issue holds a monitoring contract, which counts as live, so it is not an orphan; (c) is then filed unless the [ai-cal] copy was parked there. Why: read at about 20:05Z on 2026-10-19, nine open loop-filed issues had no contract of any kind (100161, 100166, 100238 to 100241, 100247, 100248, 100250) and 100151 had a mapped label; filed literally, the 3 per tick bound opens about nine or ten PROBE-NEEDED-1 issues in three or four ticks, each with a 120-minute issue SLA that adds to open_agent_issues and issues_open_over_120m, and the issues of a verified loop (100161 and 100166 closed at 20:00Z) are closed again by that loop. With the skips only the issues that have no verified closer are filed.' || char(10) ||
 'control_registry (DOCTRINE-1): the same PR registers the off switch ops_config rt_ensure_live_path and the two bounds (3 issues per tick, 12 per 1440 minutes) as control_registry rows (kind kill-switch and cap, critical_path 0, the disposition with its reason, and the tested alternate: the first term of fm-reopen-without-live-path keeps counting an orphan the filer skips or stops filing for), in the migration that ships the filer or in a migration of its own.' || char(10) ||
 'Test in qnfo-fleet-control with a node:sqlite fixture: an orphan older than 60 minutes files exactly one issue, a second tick files none, an orphan that gained a live contract files none, a young orphan files none, an issue with a parked loop-owned contract files none, the bounds hold, and the skips hold: while a REOPEN-LIVE-PATH-2 issue is open an orphan with a mapped source, a chaos-drill or fleet-journeys source or an [ai-cal] title files none, a cf-model-eval orphan older than 60 minutes files one, and once that issue is closed an [ai-cal] orphan files one. Raise the minor version (VERSION-MINOR-CAPABILITY-1: the tick now files issues on its own) and put the release note in the notes mechanism of VERSION-LINE-NOTES-1.' || char(10) ||
 'Depends on: REOPEN-LIVE-PATH-2 for the loop labels. The skips above are what holds until it has landed, so this issue may be taken first, but a doer who ships the filer without them breaks the order.' || char(10) ||
 'Doer: the session or loop that takes this issue (take the work claim issue:<id> first).' || char(10) ||
 'Definition of done: qnfo-fleet-control/worker.js defines rtEnsureLivePath with the skips above and the remediation tick calls it, and every open issue older than 60 minutes with no live contract that the skips do not cover has an open PROBE-NEEDED-1 issue. The code-read contract on this issue reads the first part.' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
 'code-anchor: await rtEscalateStaleDeferrals(db, out);' || char(10) ||
 'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "async function rtEnsureLivePath"}',
 'qnfo-fleet-control', 'reliability', 'high', 'open',
 CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

UPDATE remediation_contracts SET
  verify_probe = '{"paths": ["qnfo-fleet-control/worker.js"], "contains": "async function rtEnsureLivePath"}',
  verify_transport = 'code-read', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'reopen-live-path',
  precondition = 'the remediation tick has no function that files PROBE-NEEDED-1 for an open issue without a live contract',
  action = 'qnfo-fleet-control defines rtEnsureLivePath (code-task on this issue)', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1
 WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'REOPEN-LIVE-PATH-3:%' AND status = 'open')
   AND COALESCE(module, '') <> 'reopen-live-path';

-- 4. The corrected closing probe of issue 2954. The contract keeps its cadence, takes a fresh due time (remediation_probe_edit_rerun), starts a new
-- run of reads (attempts 0, no verdict) and drops the label circular-probe-deprecated, which the old probe earned and the new one does not.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST(((SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND COALESCE((SELECT MAX(l.ts) FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN (''opened'', ''reopened'')), strftime(''%Y-%m-%dT%H:%M:%SZ'', a.created_at / 1000, ''unixepoch'')) < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'') AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'', ''holding'', ''monitoring'', ''escalated''))) + (SELECT COUNT(*) FROM remediation_contracts c WHERE c.status = ''active'' AND c.last_verdict LIKE ''deferred%'' AND c.deferred_since IS NOT NULL AND c.deferred_since < datetime(''now'', ''-10110 minutes'') AND NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = c.issue_id AND x.title LIKE ''VERIFICATION-DEFERRED-7D-1: %'') AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = ''open'' AND lower(trim(o.title)) = lower(trim(''VERIFICATION-DEFERRED-7D-1: '' || c.class))))) AS TEXT) AS observed',
  status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'verification-path',
  precondition = 'the live-path half of the 2954 definition of done: every open issue has one live verification path (none stands over 60 minutes without a contract in a live status), and no deferral older than 10080 minutes goes without an escalation issue',
  action = 'REOPEN-LIVE-PATH-1 and VERIFICATION-PATH-1 carry the levers: a doer writes a probe for any open issue this counts (the PROBE-NEEDED-1 issue names it), or the deferral escalation issue names the unblocker'
 WHERE class = 'issue-2954' AND issue_id = 2954
   AND instr(verify_probe, 'c.ts<datetime') > 0;

-- 5. The failure mode, its detector (term T1 of the 2954 probe), the capability and the decision.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('reopen-without-live-path',
  'an issue that is reopened (or never had a usable probe) stays open with no contract that anything probes, so a fix to it can never be seen and it cannot close',
  'agent_issues_birth_contract_ins fires on INSERT only and issue_refile_reopen reopens the old row by UPDATE (it ends in RAISE(IGNORE)), so a reopened issue keeps the contract the one-off closed-issue sweep superseded (superseded:contract-on-closed-issue) and nothing revives it; a contract superseded as probe-unusable or closure-observing at birth is never replaced and nobody is told to write a probe. The repair deliberately gives such an issue no stand-in contract: an active contract whose probe is a constant that reads pending counts as a live path for fm-open-issue-no-doer and issues_without_next_action, which would silence both without a probe being written',
  'REOPEN-LIVE-PATH-1 (migrations/2026-10-19-reopen-live-path.sql): the trigger agent_issues_reopen_live_path_upd revives or parks the contract at the moment an issue goes to open, where a probe can judge it; every issue open at the apply was backfilled by state and four PROBE-NEEDED-1 issues name the probes for the issues no probe can judge; the detector below and the issue-2954 probe report any open issue that still has no live contract after 60 minutes; REOPEN-LIVE-PATH-3 files the PROBE-NEEDED-1 issue for a later orphan (skipping, until REOPEN-LIVE-PATH-2 has landed, the issues of the loops that close their own issue) and REOPEN-LIVE-PATH-2 gets the births of the labels whose loop is verified to close its issue (chaos-drill, fleet-journeys) into the loop-owned state; a label with no verified closer (cf-model-eval, the [ai-cal] rows) is not parked. Effect on the older measures at the 19:4xZ read: fm-open-issue-no-doer 12 to 10 and issues_without_next_action 70 to 64, through real revives and one park only; the issues that need a probe author stay in both, and the detector reads 11 at the 19:45Z read (13 issues are left without a live contract, two of them inside the 60-minute window) and 13 an hour later (red is the intended state)',
  'no open issue older than 60 minutes since its last open or reopen event lacks a contract in status active, holding, monitoring or escalated',
  'fm-reopen-without-live-path', '2026-10-19', 2954,
  'an issue goes from closed to open (a refile within 1440 minutes of the close, a relapse reopen or a manual reopen) while its only contracts are superseded or closed, or it is born with a vacuous probe',
  'open issues with no live contract: 9 at 2026-10-19 17:26Z (six of them reopened after the 2026-10-18 12:17Z supersede sweep), 14 at 18:10Z, 19 at 18:30Z, 18 at about 18:55Z and 20 at about 19:45Z (13 of them born through the v3_generic template)',
  'the close loop for every such issue, issues_unprobed_60m, the live-path half of the 2954 definition of done');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-reopen-without-live-path', NULL, 'REOPEN-LIVE-PATH-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND COALESCE((SELECT MAX(l.ts) FROM issue_lifecycle l WHERE l.issue_id = a.id AND l.event IN (''opened'', ''reopened'')), strftime(''%Y-%m-%dT%H:%M:%SZ'', a.created_at / 1000, ''unixepoch'')) < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'') AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'', ''holding'', ''monitoring'', ''escalated''))) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('reopen-live-path', 'migrations/2026-10-19-reopen-live-path.sql (REOPEN-LIVE-PATH-1)',
  'the D1 trigger agent_issues_reopen_live_path_upd on agent_issues and the remediation tick (it probes the revived active contracts); an issue no probe can judge is reported by the first term of the detector after 60 minutes and named by a PROBE-NEEDED-1 issue',
  'measured hourly by fm-reopen-without-live-path and by the issue-2954 closing probe (no live contract after 60 minutes); the trigger writes only remediation_contracts rows of the reopened issue',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'migrations/reopen-live-path.test.mjs');

-- 6. control_registry (DOCTRINE-1: read and update the registry before adding or keeping a hold). The park of step b and of the second backfill statement
-- makes the state the registered hold loop-owned-contract-park already makes (LOOP-OWNED-CONTRACT-MONITORING-1, disposition replace, applied), so it is a
-- second producer of that hold and not a new control: the row's location names it and its evidence says what it parks and what it leaves visible. The
-- guard on the location text makes a second apply a no-op; the Rollback line takes the same two texts out again with replace().
UPDATE control_registry
   SET location = location || ', D1 trigger agent_issues_reopen_live_path_upd and the REOPEN-LIVE-PATH-1 backfill (a reopened or open issue gets the same park)',
       evidence = evidence || ' REOPEN-LIVE-PATH-1 (2026-10-19): a second producer of the same state. Step b of the trigger agent_issues_reopen_live_path_upd and the second backfill statement park the contract of a reopened or open issue whose probe reads the status of its own issue (module probe-template-v2 loop) as monitoring, with the verdict of this row, and the park ends when the issue closes. It parks nothing a probe could judge and makes no contract for an issue nothing can judge (fm-reopen-without-live-path counts those after 60 minutes).',
       reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE control = 'loop-owned-contract-park'
   AND instr(location, 'agent_issues_reopen_live_path_upd') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'every open issue needs one contract that something probes; where no probe can judge an issue the honest state is a visible orphan with a named probe to write, never an active contract whose probe is a constant that reads pending, because that is the one status the older measures read as a live path',
  'REOPEN-LIVE-PATH-1: a trigger revives or parks the contract of a reopened issue where a probe can judge it, every issue open at the apply is backfilled by state, four PROBE-NEEDED-1 issues name the probes to write, the detector and the issue-2954 closing probe report any open issue that stands 60 minutes without a live contract, the park is recorded on the control_registry row loop-owned-contract-park, and two follow-ups (REOPEN-LIVE-PATH-2, REOPEN-LIVE-PATH-3) own the birth path of the labels with a verified closer and the standing PROBE-NEEDED-1 filer',
  'qnfo-audit 2026-10-19 17:26Z to about 19:45Z: open issues with no live contract 9, 14, 19, 18, then 20 (2047, 2192, 2215, 2450, 2455, 2522, 2607, 2655, 2695 reopened after the closed-issue supersede sweep; 2832, 2925, 100140, 100151, 100161, 100166, 100238 to 100241, 100247, 100248, 100250 born with a vacuous probe); live trigger texts read: agent_issues_birth_contract_ins is AFTER INSERT, issue_refile_reopen is BEFORE INSERT ending in RAISE(IGNORE); red-drain step 6 re-arms escalated contracts of open non-METRIC-TRIGGER issues, step 0 supersedes a vacuous probe again; the issue-2954 probe read 2 on a false basis (issue-2068, issue-2381). A review of the first version of this file (active contract with a constant pending probe for an issue nothing can judge) found it silenced two older measures: fm-open-issue-no-doer 10 to 0 with 8 through the constant, issues_without_next_action about 11 lower with 10 through the constant; the constant is removed. A second review (2026-10-19, read of qnfo-model-eval/worker.js, qnfo-fleet-control chaos drill, scripts/fleet_journeys.py and live closed rows) found that cf-model-eval has no closer (all ten closed cf-model-eval issues were closed by a session or a sweep) and the [ai-cal] copies are not shown closed (four models read ok, four rows open since 17:15Z), so REOPEN-LIVE-PATH-2 maps only chaos-drill and fleet-journeys, whose loops close their issues (100161 and 100166 were closed by fleet-journeys at 20:00Z), and REOPEN-LIVE-PATH-3 skips the issues of those loops until REOPEN-LIVE-PATH-2 has landed',
  'migration merged', 'remediation_contracts rows of every issue open at the apply that has no live contract and a probe that can judge it (six revives and one park at the 19:4xZ read) and of any issue reopened later, one new trigger on agent_issues, six new issues (four PROBE-NEEDED-1, REOPEN-LIVE-PATH-2 and REOPEN-LIVE-PATH-3), the issue-2954 probe, one detector, and the location and evidence text of one control_registry row (loop-owned-contract-park)',
  'the Rollback header (from bak_20261019_reopen_live_path, and it supersedes the four PROBE-NEEDED-1 issues, REOPEN-LIVE-PATH-2 and REOPEN-LIVE-PATH-3 instead of deleting them, and takes the appended control_registry text out by replace())',
  'a reopened issue is probed again from the moment it reopens, and an issue nothing can probe is counted instead of hidden',
  'at the 19:4xZ read the apply moves fm-open-issue-no-doer from 12 to 10 (2192 revived, 2695 parked) and issues_without_next_action from 70 to 64 (six revives), both through real contracts only; fm-reopen-without-live-path and the issue-2954 probe read 11 (open over 60 minutes with no live contract; 13 issues are left without one, 100161 and 100166 being inside the window) and fall as probes are written, as the loop-owned mappings of REOPEN-LIVE-PATH-2 land or as the issues close; issues_unprobed_60m is unchanged at the apply',
  'none', 'd1:qnfo-audit remediation_contracts, agent_issues, issue_lifecycle, failure_modes, capability_ledger, control_registry; worker: none'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REOPEN-LIVE-PATH-1:') = 1);
