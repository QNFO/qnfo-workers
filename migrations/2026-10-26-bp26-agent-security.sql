-- BP26-PROMPT-INJECTION-1 (2026-10-26, charter pillar security; owner directive 2026-10-26 BP26 catalogue; agent_issues 1000359, OWASP LLM01 prompt injection and Agentic ASI01 goal hijack).
-- WHAT AN OUTSIDER COULD MAKE THE EMAIL AGENT DO BEFORE THIS CHANGE (read from qnfo-email 2.11.0, qnfo-tools-mcp 1.2.1, qnfo-ops email_respond and qnfo-cloud-ops reply drafts, 2026-10-26):
--   1. Drafter (qnfo-email voiceAi, tool-less): the inbound body (6000 characters) was the user message of the classifier, the writer and the editor, the voice document the system prompt. A mail could
--      make the model recite the voice document (it counted as a GROUNDED source in ungroundedClaims, so the recitation passed the grounding check), write a link, markdown image or address, or
--      commit Rowan to something in a tier 2 draft that was then cleared for auto-send to the sender. The recipient was always the sender, never an address the mail chose.
--   2. /send (any caller with the shared API key): any recipient; only suppression and a tone gate applied. The MCP email_respond tool passed the model's to and body straight through, its only gate on a cold
--      send being affirm=true, which the model itself sets: an instruction in a mail read through the email tools could cold-send or forward to an arbitrary address (32 successful MCP sends are on record,
--      email_send_paths sp-2). The ops email_respond tool is tighter (reply_to_id and an affirmation in the user's latest message) but names no recipient.
--   3. Reply drain: sent a cleared draft as written, with no check that the recipient is the sender of the mail answered and no check of the text (a draft written by another loop, for example the
--      qnfo-cloud-ops orchestrator, reaches /send the same way).
--   4. Not changed here, owned in the issue as code-tasks: the email_commands channel (allow-listed senders; a spoofed sender relies on the DMARC verdict), the personal-api twin, qnfo-social reply reading,
--      the research pipelines that read web pages (the egress allow-list below is measured, enforcement is a code-task), and the dual-LLM split where an actor model uses the reader's structured output.
-- WHAT THIS DOES (qnfo-email 2.12.0, qnfo-tools-mcp 1.3.0, scripts/bp26_agentsec.py, qnfo-email/injection-redteam.test.mjs with 61 checks, all offline):
--   * the drafter scans every inbound mail (visible and hidden text); a mail that tries to instruct the agent reaches no model and goes to the owner as tier 3; every other mail is sanitised, wrapped in
--     untrusted_email delimiters and answered under an instruction-hierarchy rule; a draft that carries removed markup, a link, address or secret-shaped string the mail does not contain, or that recites the
--     voice document, can never be tier 2;
--   * /send pins a reply (reply_to_id) to the sender of the email answered for every caller, and refuses an agent surface (header x-qnfo-agent-surface, set by the tool wrapper) a cold send outside the owner,
--     the fleet's own addresses and agent_send_allowlist; an agent body is plain text and is refused if it carries a secret, a data URI or another person's address; kill switch ops_config agent_send_policy = off;
--   * the reply drain re-checks recipient and text and holds a failing draft for the owner;
--   * each decision is a row in agent_mail_trace (goal, steps, score, hits, decision) with view v_agent_mail_anomalies; refusals also go to email_send_violations.
-- METRICS (source_of_truth rewritten below; each stays tagged [BP26], producers in scripts/bp26_agentsec.py on the remediation-consumer runner): injection_eval_pass_rate, outbound_mail_to_non_sender,
-- agent_tool_calls_outside_allowlist (the allow-list registry agent_tool_allowlist is seeded from the tools the two agent surfaces register and from a policy list of egress hosts: a fetch to a host outside it is a review item).
-- CONSEQUENCE: an agent surface can no longer cold-send to an arbitrary recipient; add the recipient or an @domain to agent_send_allowlist, or set ops_config agent_send_policy = off (reversible, no deploy).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_agent_mail_anomalies; DROP INDEX IF EXISTS idx_agent_mail_trace_decision; DROP INDEX IF EXISTS idx_agent_mail_trace_ts; DROP TABLE IF EXISTS agent_mail_trace; DROP TABLE IF EXISTS agent_tool_allowlist; DROP TABLE IF EXISTS agent_send_allowlist; UPDATE metric_registry SET source_of_truth = CASE metric WHEN 'injection_eval_pass_rate' THEN 'red-team suite (to build) [BP26]' WHEN 'outbound_mail_to_non_sender' THEN 'mail send log (to compute) [BP26]' ELSE 'agent_actions audit log (to build) [BP26]' END WHERE metric IN ('injection_eval_pass_rate', 'outbound_mail_to_non_sender', 'agent_tool_calls_outside_allowlist'); DELETE FROM control_registry WHERE control IN ('agent-send-policy-gate', 'drafter-injection-guard'); DELETE FROM ops_config WHERE key = 'agent_send_policy';
-- No backup table is needed: the file creates tables and inserts rows only; the Rollback line deletes only rows this file inserted.
-- spof-review: the guards run inside qnfo-email on the request path with no new dependency; a missing table only drops the audit rows (the callers are try/catch), and the kill switch is a D1 row read per /send.

CREATE TABLE IF NOT EXISTS agent_send_allowlist (
  pattern TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'recipient',
  note TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS agent_tool_allowlist (
  surface TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tool', 'egress')),
  pattern TEXT NOT NULL,
  note TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (surface, kind, pattern)
);

CREATE TABLE IF NOT EXISTS agent_mail_trace (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  surface TEXT NOT NULL,
  email_id INTEGER,
  queue_id INTEGER,
  goal TEXT,
  steps TEXT,
  injection_score INTEGER NOT NULL DEFAULT 0,
  hits TEXT,
  decision TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_mail_trace_ts ON agent_mail_trace (ts);

CREATE INDEX IF NOT EXISTS idx_agent_mail_trace_decision ON agent_mail_trace (decision, ts);

CREATE VIEW IF NOT EXISTS v_agent_mail_anomalies AS
  SELECT id, ts, surface, email_id, queue_id, goal, injection_score, hits, decision, detail
  FROM agent_mail_trace
  WHERE datetime(ts) >= datetime('now', '-7 days') AND (injection_score >= 3 OR decision IN ('refused', 'held'));

INSERT OR IGNORE INTO agent_tool_allowlist (surface, kind, pattern, note) VALUES
  ('qnfo-ops', 'tool', 'backlog_status', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'candidates_query', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'cf_analytics', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'cf_docs', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'cf_worker_bindings', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'cf_worker_deploy', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'cf_worker_read', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'container_install', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'container_status', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'container_workspace_exec', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'dashboard_feed', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'dr_validate_schema', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'email_check', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'email_mark', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'email_respond', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'email_stats', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'exec_node', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'exec_pipeline', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'exec_python', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'fleet_graph', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'fleet_status', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'git_clone_exec', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'git_op', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'github_cherry_pick', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'github_create_branch', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'github_file_write', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'github_issue_comment', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'github_issue_get', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'github_issues_list', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'github_pr', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'github_projects_list', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'github_repo_read', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'idea_submit', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'intents_query', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'kv_delete', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'kv_get', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'kv_put', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'ops_d1_query', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'ops_d1_write', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'ops_fleet_log', 'registered in qnfo-ops/worker.js on 2026-10-26');

INSERT OR IGNORE INTO agent_tool_allowlist (surface, kind, pattern, note) VALUES
  ('qnfo-ops', 'tool', 'ops_issue_run', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'ops_issues_list', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'ops_research_kick', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'owner_login', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'owner_verify', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'public_data', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'queue_read', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'r2_delete', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'r2_get', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'r2_list', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'r2_put', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'research_queue', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'run_code', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'run_code_net', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'run_python', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'service_discover', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'shell_exec', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'shell_pipeline', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'telemetry_analyze', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'telemetry_report', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'vectorize_query', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'web_fetch', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'web_search', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_delete', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_diff', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_edit', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_glob', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_grep', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_list', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_patch', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_read', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_read_multi', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_stat', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-ops', 'tool', 'workspace_write', 'registered in qnfo-ops/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'email_check', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'email_mark', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'email_respond', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'email_search', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'email_stats', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'express_desire', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26');

INSERT OR IGNORE INTO agent_tool_allowlist (surface, kind, pattern, note) VALUES
  ('qnfo-tools-mcp', 'tool', 'history_recall', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'infra_analytics', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'infra_records', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'infra_status', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'intents_list', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'owner_act', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'owner_code', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'owner_queue', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'papers_search', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'personal_search', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'web_fetch', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26'),
  ('qnfo-tools-mcp', 'tool', 'web_search', 'registered in qnfo-tools-mcp/worker.js on 2026-10-26');

INSERT OR IGNORE INTO agent_tool_allowlist (surface, kind, pattern, note) VALUES
  ('*', 'egress', 'qnfo.org', 'fleet: research plane'),
  ('*', 'egress', 'q08.org', 'fleet: personal plane'),
  ('*', 'egress', 'qwav.org', 'fleet: quantum plane'),
  ('*', 'egress', 'qwav.tech', 'fleet: quantum plane'),
  ('*', 'egress', 'qwav.net', 'fleet: spare domain'),
  ('*', 'egress', 'qwav.uk', 'fleet: spare domain'),
  ('*', 'egress', 'qwave.tech', 'fleet: spare domain'),
  ('*', 'egress', 'q-wave.tech', 'fleet: spare domain'),
  ('*', 'egress', 'ipatent.me', 'fleet: flagship domain'),
  ('*', 'egress', 'q08.workers.dev', 'fleet: worker origins (machines and probes)'),
  ('*', 'egress', 'github.com', 'code hosting the fleet works in (api.github.com and gist included by suffix)'),
  ('*', 'egress', 'githubusercontent.com', 'raw file reads of the fleet''s own repositories'),
  ('*', 'egress', 'cloudflare.com', 'vendor documentation, blog and API (developers., blog., agents., api.)'),
  ('*', 'egress', 'arxiv.org', 'scholarly index'),
  ('*', 'egress', 'doi.org', 'DOI resolver'),
  ('*', 'egress', 'zenodo.org', 'scholarly repository the fleet publishes to'),
  ('*', 'egress', 'orcid.org', 'scholarly identity'),
  ('*', 'egress', 'openalex.org', 'scholarly index'),
  ('*', 'egress', 'crossref.org', 'scholarly index'),
  ('*', 'egress', 'ncbi.nlm.nih.gov', 'PubMed and PMC'),
  ('*', 'egress', 'osf.io', 'scholarly repository'),
  ('*', 'egress', 'semanticscholar.org', 'scholarly index'),
  ('*', 'egress', 'europepmc.org', 'scholarly index'),
  ('*', 'egress', 'wikipedia.org', 'reference'),
  ('*', 'egress', 'wikidata.org', 'reference'),
  ('*', 'egress', 'npmjs.org', 'package registry (reads)'),
  ('*', 'egress', 'npmjs.com', 'package registry (reads)'),
  ('*', 'egress', 'pypi.org', 'package registry (reads)'),
  ('*', 'egress', 'pythonhosted.org', 'package registry (reads)');

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('agent_send_policy', 'on', 'BP26-PROMPT-INJECTION-1: on = qnfo-email /send applies the agent send policy (reply pinned to the original sender, cold sends of an agent surface limited to the owner, fleet addresses and agent_send_allowlist); off restores the old behaviour without a deploy');

UPDATE metric_registry SET source_of_truth = 'qnfo-email/injection-redteam.test.mjs run with node on the runner (scripts/bp26_agentsec.py collector agentsec_injection_eval, pass / total of its INJECTION_EVAL line; the deployed qnfo-email /health injection_guard is recorded beside it) [BP26]', refresh_cadence = '1h'
  WHERE metric = 'injection_eval_pass_rate';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.emails status sent, last 7 days: recipients that are not a fleet address, an owner address, an earlier inbound sender or on agent_send_allowlist (scripts/bp26_agentsec.py collector agentsec_outbound_non_sender, runner) [BP26]', refresh_cadence = '1h'
  WHERE metric = 'outbound_mail_to_non_sender';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.cloud_ops_events kind ops_ai_tool and mcp_log, last 7 days, against agent_tool_allowlist (tool names per surface, egress hosts); scripts/bp26_agentsec.py collector agentsec_tool_allowlist, runner [BP26]', refresh_cadence = '1h'
  WHERE metric = 'agent_tool_calls_outside_allowlist';

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('agent-send-policy-gate', 'qnfo-email/worker.js injSendGuard, called by sendApi before any send', 'gate',
  'an LLM tool surface (qnfo-tools-mcp email_respond, qnfo-ops) mailing a recipient other than the sender of the mail it was answering, or cold-sending, because a mail it read told it to (OWASP LLM01, Agentic ASI01)', 0, 'keep', 'applied',
  'ops_config agent_send_policy = off restores the old /send behaviour without a deploy; a deterministic fleet caller (digests, briefs, notices) is never subject to the cold-send rule, only to the reply pin; a wanted recipient is one row in agent_send_allowlist',
  '2026-10-26', 'qnfo-email/injection-redteam.test.mjs section 5: refusal with 403 and no send, the violation and trace rows, the reply pin for agent and fleet callers, the plain-text body, the kill switch; measured by metric outbound_mail_to_non_sender', 1000359);

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('drafter-injection-guard', 'qnfo-email/worker.js tierReplyQueue, draftReply and drainReplyQueue (injScan, injSanitizeInbound, injSanitizeOutbound, injLeaksPrompt, injDrainGuard)', 'guard',
  'a mail that instructs the drafter, or a draft that carries a link, image, address, secret-shaped string or the voice document, being cleared for auto-send to the sender', 0, 'keep', 'applied',
  'it never withholds mail from the owner: a suspicious mail or a held draft goes to the owner as tier 3 with the content and a queue id, and the owner answers SEND, a typed reply, IGNORE or SPAM; no model call is skipped for an honest mail',
  '2026-10-26', 'qnfo-email/injection-redteam.test.mjs sections 1 to 3 and 6 to 8 (a mail that instructs the agent reaches no model; an obedient model cannot get its draft auto-sent; an honest question still gets a tier 2 draft; the drain holds a wrong recipient, an image and a secret); measured by metric injection_eval_pass_rate', 1000359);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8-inject',
  'a prompt-injection defence is code that fixes the recipient and checks the text, not a polite instruction to the model; the drafter is already tool-less, so the guards belong at the three places mail leaves (drafter tier, /send, reply drain) and an agent surface may not cold-send without an allow-list row',
  'BP26-PROMPT-INJECTION-1: qnfo-email 2.12.0 (scan, sanitise, delimit, outbound guard, leak guard, send policy, drain guard, agent_mail_trace), qnfo-tools-mcp 1.3.0 (surface header), scripts/bp26_agentsec.py, agent_send_allowlist, agent_tool_allowlist, two control_registry rows, the kill switch ops_config agent_send_policy',
  'qnfo-audit 2026-10-26: emails 24 agent-sent mails in 7 days (22 to the owner, 2 to prior inbound senders, 0 elsewhere); ops_ai_tool 9,000 calls a week over 55 registered tools, 257 web_fetch calls, about 20 to hosts outside a policy list; email_send_paths sp-2 records 32 MCP sends including cold sends; red-team suite 61 of 61 on main',
  'applied by migration; the qnfo-email and qnfo-tools-mcp code ships in its own pull request and deploys through the canonical path', 'qnfo-email /send and the reply drain (an agent surface can no longer cold-send to a stranger; a reply to anyone but the original sender is refused for every caller), the drafter tier; three tables, one view',
  'the Rollback line and ops_config agent_send_policy = off (no deploy)', 'the email agent treats mail as data and cannot be steered to a recipient or a link by it',
  'outbound_mail_to_non_sender stays 0 and every refused attempt is a violation row; injection_eval_pass_rate reads 1 while the suite holds; agent_tool_calls_outside_allowlist reads the real number of fetches to unlisted hosts and falls as hosts are reviewed',
  'none directly: it protects the people who write to the fleet and the owner whose name the replies carry',
  'offline: qnfo-email/injection-redteam.test.mjs (61 checks), scripts/bp26_agentsec.py --selftest, migrations/bp26-agent-security.test.mjs; live: read-only dry runs of the three collectors against qnfo-audit'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-PROMPT-INJECTION-1:%');
