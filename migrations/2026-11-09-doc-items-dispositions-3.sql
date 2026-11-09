-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status='open', close_channel=NULL WHERE id IN (1002693,1002694,1002695) AND close_channel='session:doc-items-sweep-3';
-- spof-review: no new cron, trigger, binding, host or credential; dispositions of three existing DOC-GATE-1 issues.
-- CAUSE-MAPPED: no metric is registered here.
-- DOC-ITEMS-SWEEP-3 (GitHub 9739, 9740, 9741; charter pillar autonomy). Each listed item has an explicit disposition.
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'doc-items-sweep-2026-11-09c', 'triaged', 'session:doc-items-sweep', datetime('now'),
  CASE a.id
    WHEN 1002695 THEN 'DOC-ITEMS-SWEEP-3: (1) Buffer dissemination is implemented: qnfo-social/worker.js drives Buffer queues (Bluesky, LinkedIn, Substack Notes roll-ups; 241 Buffer references read 2026-11-09) at the OUTREACH-ACCELERATE-1 cadence. (2) Cloudflare DNSLink: no worker, route or config references DNSLink (search of every worker.js and wrangler.toml, 2026-11-09) and no IPFS gateway is operated; papers are served from R2/D1 and versioned on Zenodo, so a DNSLink deployment no longer applies.'
    WHEN 1002694 THEN 'DOC-ITEMS-SWEEP-3: the three checklist items belong to a token-rotation procedure the fleet no longer follows. Owner directive 2026-10-08: no new Cloudflare token is issued, the repository CLOUDFLARE_API_TOKEN is used as is; its liveness is exercised on every canonical deploy and by scripts/cf_ops_actions.py (access-probe, report), and secret writes go through the qnfo-deploy-guard secret-lock lease (CLAUDE.md Shared secrets). A rotation is an IDENTITY-BOUND owner step, so no repository code attaches to the unchecked boxes.'
    WHEN 1002693 THEN 'DOC-ITEMS-SWEEP-3: the 2026-07-21 IPFS closeout asked for a choice of free-tier IPFS supplement (web3.storage/Storacha, Cloudflare-only DNSLink mode). Read 2026-11-09: no worker, wrangler.toml or script uses Storacha, web3.storage or DNSLink; durability and open access come from R2/D1 plus Zenodo DOI versions, so the supplement decision no longer applies. Next-step items 2.3 (Ismael) and 2.7 (DIST) are July session notes of the Phase 2 S10 plan, superseded by the fleet roadmap (roadmap_implementation) with no repository surface.'
  END
FROM agent_issues a WHERE a.id IN (1002693,1002694,1002695) AND a.status='open'
ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence;
UPDATE agent_issues SET status='closed', close_channel='session:doc-items-sweep-3', updated_at=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE id IN (1002693,1002694,1002695) AND status='open';
