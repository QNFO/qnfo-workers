-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: the failure-mode row, its detector contract and the two decision records are append-only registers; set remediation_contracts.status = superseded for fm-probe-author-silent to stop the detector.';
-- PROBE-AUTHOR-BINDING-1 and PAPER-LEDGER-ATTRIBUTION-1 (2026-10-26, charter pillars autonomy and research). Registers what PRs 4344 and 4401 changed: the failure mode behind the PROBE-NEEDED-1 probe author
-- that never ran (fleet-control 0.49.2), its detector, and the decisions taken for the gate attribution (cloud-ops 1.37.0) and the probe author.
-- The detector reads silence, not volume: three or more PROBE-NEEDED-1 filings older than three hours that were made after the 0.49.2 deploy (2026-10-26 08:30Z) with no remediation.probe-authored
-- and no remediation.probe-author-reject event since then. The per-tick bound of three and the daily bound of 12 authored probes mean a busy day writes fewer events than filings, so one event is enough.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'probe-author-silent',
  'The PROBE-NEEDED-1 probe author never ran: it returned false on its first test and left no trace, so 77 filings in 7 days got no authored probe',
  'rtAuthorLivePathProbe read the model from env[qnfo-ai], a binding qnfo-fleet-control has never had (its Workers AI binding is AI), read a reply only as response or result (a chat model answers choices[0].message.content), and wrote decision_log rows with columns the table lacks. No suite referenced the function, and every exit was a bare return or a console line nobody reads.',
  'qnfo-fleet-control 0.49.2: env.AI through aiRunAttr with one plain retry when reasoning_effort is refused, the reply read through cmReviewReply, decision_log with its real columns, and every reject written as one remediation.probe-author-reject event per issue per hour. probe-author.test.mjs (21 checks) fails 13 on 0.49.1.',
  'fm-probe-author-silent d1-query: filings after the 0.49.2 deploy with no probe-authored or probe-author-reject event',
  'fm-probe-author-silent',
  '2026-10-26',
  NULL,
  'a loop that exists to author a probe returns before its first side effect on every call and records nothing',
  'remediation.probe-authored holds no event for days while PROBE-NEEDED-1 issues keep arriving',
  'every orphan issue without a closing probe: it waits for a doer instead of closing itself when its defect is gone'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-probe-author-silent',
  NULL,
  'qnfo-fleet-control 0.49.2 or later is deployed (2026-10-26 08:30Z)',
  'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM agent_issues WHERE title LIKE ''PROBE-NEEDED-1: issue-%'' AND created_at > 1793003400000 AND created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 10800) * 1000) >= 3 AND (SELECT COUNT(*) FROM cloud_ops_events WHERE kind IN (''remediation.probe-authored'', ''remediation.probe-author-reject'') AND ts > ''2026-10-26T08:30'') = 0 THEN ''probe author silent: filings with no event since the 0.49.2 deploy'' ELSE ''ok'' END AS observed',
  'd1-query',
  1000,
  'qnfo-ops',
  1,
  'active',
  'failure-mode'
);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session_017ikgFYTJ6HPpquENrmyWHJ',
  'The ledger can only answer who changed a paper if the writers say so, and the publication gate is the one writer whose change (a restore from quarantine) the ledger records; a verdict write touches release_gate_* alone, which the ledger does not record, so it needs no attribution.',
  'PAPER-LEDGER-ATTRIBUTION-1: qnfo-cloud-ops 1.37.0 sets change_actor = qnfo-cloud-ops:<run id> and change_reason (the quarantine it undoes) on the restore UPDATE, and reads a trailing .0 in a section number (1.0 Introduction) as the section itself.',
  'The 07:21Z gate run restored 252 papers and the ledger filed all 252 as unattributed (v_paper_ledger_health.unattributed_24h = 252). publication-gate.test.mjs now loads the real ledger migration over a production-shaped papers table: the restore is attributed to the run, verdict flips add no ledger row, no withdrawal row appears (50 of 50; the attribution and 1.0 cases fail on 1.36.1). All 22 cloud-ops suites and the full offline suite pass; /health reports 1.37.0 after the 07:48Z merge.',
  'deployed 07:49Z; the next restore after a quality quarantine will carry the actor, none occurred yet because nothing is quarantined',
  'one extra column pair on the restore UPDATE; the structure checker passes more papers (1.0 headings no longer raise a soft issue)',
  'revert the 1.37.0 merge (qnfo-cloud-ops returns to 1.36.1); the ledger keeps what it recorded',
  'gate restores attributable to a run in the paper ledger',
  'the next restore appears in paper_change_ledger with an actor starting qnfo-cloud-ops:pg-',
  'a future mass restore or withdrawal by the gate can be traced to its run without reading worker logs',
  'cloud-ops suite with the real ledger triggers; production-shaped papers table; live /health version'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PAPER-LEDGER-ATTRIBUTION-1: qnfo-cloud-ops 1.37.0 sets change_actor') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session_017ikgFYTJ6HPpquENrmyWHJ',
  'An orphan issue with no probe waits for a doer, so the filer that authors one with a single cheap model call closes work that would otherwise sit open; it only helps if it can run, and it never did.',
  'PROBE-AUTHOR-BINDING-1: qnfo-fleet-control 0.49.2 calls env.AI (the binding the worker has) through aiRunAttr with one plain retry, reads chat and legacy reply shapes, writes decision_log with its real columns, and records every reject as a remediation.probe-author-reject event; detector fm-probe-author-silent added.',
  'remediation.probe-authored held 0 events ever against 77 PROBE-NEEDED-1 filings in 7 days. Three independent defects were found by reading the function, none reachable by an earlier test. probe-author.test.mjs (in-memory SQLite D1 with the real decision_log columns, fake env.AI) fails 13 of 21 on 0.49.1 and passes 21 of 21 on 0.49.2; the full offline suite passes (753); /health reports 0.49.2 at 08:28Z.',
  'deployed 08:28Z; the first live authored or rejected event is expected on the next remediation tick that files a PROBE-NEEDED-1 issue',
  'one Workers AI call per new PROBE-NEEDED-1 filing, at most 3 a tick and 12 a day; an authored probe is a read-only SELECT validated for write keywords, a dry run and a vacuity check, and PROBE-REVIEW-1 in qnfo-cloud-ops re-judges it',
  'revert the 0.49.2 merge or set ops_config rt_probe_author = off (no deploy)',
  'self-authored closing probes for orphan issues',
  'issues_unprobed_60m <= 10 within 24 h',
  'orphan issues close themselves on their own probe when the defect is gone',
  'in-memory SQLite suite (21 checks), full offline suite, live /health version'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PROBE-AUTHOR-BINDING-1: qnfo-fleet-control 0.49.2 calls env.AI') = 1);
