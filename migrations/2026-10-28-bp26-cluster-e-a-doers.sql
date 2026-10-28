-- BP26-CLUSTER-E-A-DOERS-1 (2026-10-28, session cluster-e-a; charter pillars research, security, reach, cost, autonomy; OWNER-NO-LOOSE-ENDS-1): gives the doer-less BP26 parent issues a recorded doer or state.
-- The parents carry source 'bp26-catalogue', which is not a trusted origin of the merge runner (ops_config code_merge_trusted_sources), so a code-task line on a parent could never merge. The work is
-- therefore filed as child issues with source 'session' (trusted), each with a code-task, a verified anchor and a code-probe; the other parents get a DELTA-NOTE naming the child, PR or loop that is the
-- doer and the exact remaining blocker. Issue 1000346 is closed: its definition of done (the evidence exists on main) holds in docs/AI-USE-POLICY.md and AGENTS.md.
-- The two child issues are withdrawn, if ever, through issue_triage with close_evidence (the live trigger refuses a bare status change). Changes no status except 1000346 (closed through issue_triage with close_evidence).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = substr(description, 1, instr(description, char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28)') - 1) WHERE instr(description, char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28)') > 0; UPDATE issue_triage SET triage_state = 'triaged' WHERE issue_id = 1000346 AND rc = 'bp26-closeout:AI-ACT-ARTICLE4'

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'bp26-closeout:AI-ACT-ARTICLE4', 'closed', 'cluster-e-a', datetime('now'),
  'The definition of done is that the evidence exists on main and is linked here. docs/AI-USE-POLICY.md (PR 4773, commit 79a82535) holds the AI-use policy, the provider/deployer classification table (iPatent and the twin as provider of a self-built generative system for Art. 50(2), q08/reading/papers/e-mail agent/social as deployer, Annex III none, GPAI duties on the model providers) and section 5, the AI-literacy measures with their evidence, which names AGENTS.md and CLAUDE.md as the handbook every operating agent reads (AGENTS.md is at the repository root). Read from origin/main by session cluster-e-a on 2026-10-28.'
FROM agent_issues a
WHERE a.id = 1000346 AND a.status = 'open' AND a.title LIKE 'BP26-AI-ACT-ARTICLE4-1:%'
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'BP26-PROVENANCE-MARKING-1 (implement): q08 serves a machine-readable provenance sidecar per piece',
 'Implements the first slice of #1000335 (provenance_marking_coverage has no source; EU AI Act Art. 50(2) marking is due 2026-12-02). Charter pillar: research. Add GET /p/<slug>/provenance.json to q08-signal-engine: a JSON manifest per published piece with slug, sha256 of the served body, generated_at, claim_generator (q08-signal-engine and VERSION), digitalSourceType trainedAlgorithmicMedia (IPTC), and a signature field: HMAC-SHA256 over the canonical manifest with env.PROVENANCE_SIGNING_KEY when that secret is bound, otherwise signature null and signed false (never a fake signature; minting the key goes through the secret lock). Link it from the piece page with <link rel="c2pa-manifest" href="/p/<slug>/provenance.json">. Keep every existing route unchanged. Add an offline suite q08-signal-engine/provenance-sidecar.test.mjs and bump VERSION (minor: new route).' || char(10) ||
 'code-task: repo=qnfo-workers path=q08-signal-engine/worker.js' || char(10) ||
 'code-anchor: if (path === "/retractions" || path === "/api/retractions" || path === "/corrections" || path === "/api/corrections") {' || char(10) ||
 'code-probe: {"paths": ["q08-signal-engine/worker.js"], "contains": "provenance.json"}' || char(10) ||
 'Definition of done: the route answers 200 JSON for a published slug with a sha256 matching the served body; scripts/bp26_provenance_marking_coverage.py can then count sidecars (follow-up on #1000335).',
 'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'BP26-PROVENANCE-MARKING-1 (implement):%' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'BP26-EMAIL-AUTH-1 (implement): personal-companion digest and piece mail carry RFC 8058 List-Unsubscribe headers',
 'Implements the REM-ORCH handoff of #1000347 (metric rfc8058_headers_present 0.6667: the personal-companion reading digest is list mail with only a footer link). Charter pillar: reach. In personal-companion/worker.js: digestMail and pieceMail return the per-subscriber unsubscribe URL (base + "/unsubscribe?t=" + token) as an extra field unsub; sendRun passes it to sendOne as pre.unsub; sendOne, only when pre.unsub is set, adds headers {"List-Unsubscribe": "<url>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"} to the SEND_EMAIL.send object (and to the JSON body of the EMAIL.fetch fallback). One-to-one mail (confirmation, owner notices) gets no such headers. The /unsubscribe route already handles any method, so a one-click POST works; keep it unchanged. The header names must appear in the source as quoted strings so scripts/bp26_reach.py scan_list_mail_source sees them. Add an offline test and bump VERSION (patch). Parse-check the 590 KB worker with node --check on a .mjs copy.' || char(10) ||
 'code-task: repo=qnfo-workers path=personal-companion/worker.js' || char(10) ||
 'code-anchor: await env.SEND_EMAIL.send({ to, from: "rowan.quni@qnfo.org", subject, text: body });' || char(10) ||
 'code-probe: {"paths": ["personal-companion/worker.js"], "contains": "\"List-Unsubscribe-Post\": \"List-Unsubscribe=One-Click\""}' || char(10) ||
 'Definition of done: metric rfc8058_headers_present reaches 1.0 at two consecutive refreshes (bp26_reach.py collect_rfc8058).',
 'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'BP26-EMAIL-AUTH-1 (implement):%' AND status = 'open');

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): claim ledger doer is #1000664 (RM-CLAIMS-LEDGER-1, qnfo-research-exec) with scripts/bp26_claims.py under a live claim by session cluster-e-b; claim_coverage reads unknown until that table exists.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000333 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): slice 1 (type, original_url, /corrections) is live in q08 0.39.x. The metric lever is the errata respond loop: correction_latency_p95_h read 727.49 h from resolved errata_queue items; the doer is the content-stage SLA issue #100456 (errata 882 stalled), not the feed. No further code change belongs on this parent.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000334 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): doer is the session-source child "BP26-PROVENANCE-MARKING-1 (implement)" (first slice: a sidecar route in q08-signal-engine). Blocker for a signed sidecar: a signing secret must be minted under the secret lock (POST qnfo-deploy-guard /secret-lock/acquire); until then the sidecar reports signed=false and the metric stays unknown, never 1.0. C2PA manifests for PDFs and images are a later slice.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000335 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): forecast_resolution_criteria_complete reads 0 because every open forecast predates the 0.38.0 gate and q08_gate_pass_rate_7d reads 0.01, so no new compliant forecast is being published. Doers: the q08 gate recovery (metric q08_gate_pass_rate_7d) and #1000662 (scoring the last update before the horizon). A backfill of legacy forecasts is not allowed (q08_forecast_updates is append-only, published claims are immutable); the old forecasts age out as they resolve.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000337 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): doers are the open ROADMAP-1 children #1000646 (content hash and immutable version URL) and #1000647 (CITATION exports); both carry code-task lines for the code loop. Crossref/DOI stays the identity-bound card bp26-crossref-membership.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000338 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): a11y_violations_serious read 4 (ai.qnfo.org label x1, me.q08.org label x3) in the collect_web run of 18:19Z. Doer: PR 5141 (BP26-A11Y-LABELS-1, session cluster-d) labels the unlabeled form controls; personal-api/worker.js is under its claim. Closing probe: metric a11y_violations_serious at 0 on two refreshes.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000339 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): the REM-ORCH marker-length item is already in qnfo-social (MARKER_MAX_CHARS, withAutomationMarker at the Bluesky, Mastodon and service paths). What is left is account-side: social_bot_label_enabled 0 needs the platform label on the owner accounts, the IDENTITY-BOUND card bp26-social-bot-labels (resolved with the in-text marker as the default in effect). The issue stays open until the metric producer counts the marker; no code change is owed on this parent.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000340 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): ai_label_coverage 0.8 (social post text: 0 of 42 posts of 14 days carry the marker; qnfo-social 0.20.0 added it, so the 14-day window should clear as older posts age out) and ai_interaction_disclosure 0.6667 (e-mail agent signature: IDENTITY-BOUND card bp26-email-agent-ai-disclosure, default no change). The papers provenance field from the 2026-10-26 FINDING is a qnfo-gateway change with no doer yet; it is the next child to file once #1000655 and #1000667 free qnfo-gateway/worker.js.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000341 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): non_essential_cookies_set 3 and third_party_trackers 4 are the Google tag G-LV7RHRVW6R injected by qnfo-gateway GA4_TAG on qnfo.org and papers.qnfo.org, and the same measurement id is served on archive.qnfo.org (ask.qwav.tech is already clean live). Doer: #1000655 (gateway gtag removal, code-task queued in qnfo-code-orchestrator); ipatent_ab was removed in qnfo-ipatent 3.19.1.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000345 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): doer is the session-source child "BP26-EMAIL-AUTH-1 (implement)" for the RFC 8058 headers (rfc8058_headers_present 0.6667). dmarc_aligned_pass_rate 0.9231 is a producer-side reading of rua reports by bp26_reach.py collect_dmarc; its lever is the DMARC alignment of the sending domains, not code in this repository.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000347 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): doer is #1000614 (implement), shipped as PR 5148 (q08-signal-engine 0.39.2: compose, title repair, forecast repair, fact-check and judge through aiGatewayRun). The calls in qnfo-code-orchestrator and idea-hub are the next two sites; gateway_coverage 0.5249 is re-read after the deploy.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000351 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): the staged-rollout script, workflow and canonical-path adoption exist (docs/GRADUAL-DEPLOYS.md; scripts/gradual-deploy-workers.txt lists qnfo-model-eval). Clean proofs: qnfo-model-eval run 40690859757 and qnfo-deploy-guard run 40690566265. Proofs dispatched on 2026-10-28 for qnfo-ai-search (run 40753753338) and qnfo-paper-indexer (run 40753758804) both failed in scripts/gradual_deploy.py selftest (IndexError at the rollback assertion, line 262); PR 5140 (GRADUAL-ALREADY-LIVE-1) is the open fix, so re-dispatch after it merges. A worker is added to the allowlist only after a clean proof. deploys_via_gradual 0.0035 rises with each listed worker.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000352 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): observability_enabled_share reads 1.0. What is left is log_ingest_gb_month, unknown because no Cloudflare API reports Workers Logs ingest bytes (scripts/bp26_cfapi.py collect_log_ingest names this); the dashboard billing page is the only source before the 2026-12-01 pricing change. Owner of the next step: the cf-ops-actions allowlist (scripts/cf_ops_actions.py), not a worker.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000354 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): security_headers_pass 0.9231: the only failing host is qwav.org (missing hsts, frame), a Cloudflare Pages project; the fix is QNFO/QWAV PR 133 (EDGE-HEADERS-1), open. Turnstile on public forms: children #1000667 (qnfo-gateway forms) and #1000668 (q08.org forms), both queued with code-tasks; the Durable Object rate limit on the OTP endpoints is not covered by a child yet.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000356 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): scripts/bp26_slo.py and migrations/2026-10-28-bp26-slo-budgets.sql produce slo_attainment_28d_min (0.7632 against 0.995) and postmortem_coverage (0.875); the remaining defects are real availability failures, tracked per surface as SLO-POSTMORTEM-ACTION issues (e.g. #1000678 travel.q08.org). A trigger-owned reading, so this parent closes when the metric triggers #1000618 and #1000684 recover.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000357 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): ci_gate_bypass_count reads 1 (trigger #1000702 owns it); the dependency allow-list and diff cap are not built. Gradual deploy (the item 2.5 prerequisite) is in adoption under #1000352. The next code step is a diff-size and dependency check in scripts/ run by deploy-gate; no doer is filed for it yet.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000358 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';

UPDATE agent_issues
SET description = description || char(10) || 'DELTA-NOTE (session-cluster-e-a, 2026-10-28): eval_suite_age_days 0 and injection_eval_pass_rate 1.0 are met (BP26-PROMPT-INJECTION); the open metric is seeded_false_claim_catch_rate (unknown). Doer: #1000665 (RM-SEEDED-CLAIM-HARNESS-1), scripts/bp26_seeded.py under a live claim by session cluster-e-b.',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000360 AND status = 'open' AND description NOT LIKE '%DELTA-NOTE (session-cluster-e-a%';
