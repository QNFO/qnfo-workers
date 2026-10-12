-- KERNEL-REGISTRIES-1 (2026-10-12, pillar autonomy; agent_issues 2231 DOCTRINE-V8-KERNEL-1, 2235 TRUST-LEDGER-FALSE-STOP-1,
-- 2241 FALSE-STOP-REGISTER-1, 2192 METRIC-REGISTRY-STALENESS-1). docs/DOCTRINE-KERNEL.md section REGISTRIES names fourteen
-- registries. Read on 2026-10-12: backlog, spof_registry, failure_modes, belief_registry, capability_ledger, decision_log
-- (provenance) and doctrine_lineage exist; v_trust_ledger computes trust but stores nothing, so a ladder change leaves no
-- record; nothing scans agent output for the kernel's recognition signatures. This file adds only what is missing:
--   false_stop_register   the kernel signatures (pattern, cause_class, detection_heuristic, auto_remediation), with their
--                         phrases in false_stop_phrases, taken from the kernel text. v_agent_replies reads what the fleet's
--                         agents emit (qnfo-ops answers in ops_ai_log, dashboard prompt replies in owner_prompts, session
--                         closeouts in session_records, qnfo-ai-search answers in ask_events, chat-client replies in
--                         chatbox_conversations); false_stop_hits holds one row per (source, reply, signature). The
--                         personal-api twin's replies are not in qnfo-audit (no twin table there on 2026-10-12) and
--                         are not copied into it (personal/research separation). Kernel readings (n) and (p):
--                         a reply that states a refusal, a limit, an interrupt-eligible step or another session's claim is
--                         a disposition, so a reply carrying a 'disposition' phrase is not a hit. Deterministic, no model.
--   trust_ledger          per (surface, action_class): ok, fail, trust_score, ladder_position, evidence. Filled hourly from
--                         v_trust_ledger and v_trust_ledger_ext (prediction calibration, canonical deploys, control-plane
--                         canary, closes that held); trust_transitions records every ladder change. Reading (o): it is a
--                         measurement that may widen fleet loop scopes through the canonical path, nothing else.
--   doctrine_proposals    source, proposed_rule, red_team_result, metrics_improved, version. Fed by a signature that hits
--                         three times in 7 days from one source, and by friction phrases in owner_prompts.prompt. A proposal
--                         is adopted by PR (reading (m): the kernel is no source of authority; governance lands by PR).
--   vocabulary_register   the kernel section DEF terms, verbatim; a coined term is added with propagated_to_fleet = 0.
--   metric_authorship     metric, formula, probation, graduation, status. Every metric_registry insert is recorded at birth
--                         (trigger metric_authorship_birth) and graduates once it holds a value past its probation.
--   inferred_direction    source signals, confidence, acted_on, outcome: one row per day and issue category the owner filed
--                         two or more items in over 7 days (revealed preference); BACKLOG-DRIVER-1's v_issue_queue_v2 reads it.
--   objective_space       standing (objectives), derived (adopted goals), novel (probationary until graduated); synced hourly.
--   lineage               a view over doctrine_lineage in the kernel's field names (the table already exists).
-- Metrics, each with its analytics_metric_triggers row: false_stops_7d, trust_ledger_min, doctrine_proposals_open,
-- vocabulary_terms_unpropagated, metrics_on_probation_overdue, inferred_directions_unacted, objective_space_novel_overdue.
-- Exemption: lineage gets no metric (a count of doctrine versions has no bad direction).
-- 2192: tick_slot_coverage_24h and owner_dispatched_items_7d were registered by 2026-10-09-10-doctrine-headline-metrics.sql and
-- lost their refresh when doctrine_headline_tick was replaced the same day (the live trigger refreshes tick_completion_24h,
-- initiation_rate_7d and owner_dispatch_7d only); both read NULL "never refreshed" since. kernel_registries_tick refreshes
-- them with the expressions that file registered.
-- Refresh: trigger kernel_registries_tick on the fleet tick in the first ten minutes of each hour, and once at apply (the
-- last statement inserts a fleet_tick row with source migration:kernel-registries, so the first values are measured, not
-- NULL). It writes this file's tables and metric_registry only: no agent_issues insert, so no deep chain (D1-TRIGGER-DEPTH-1).
-- No compound SELECT has more than three terms (D1-COMPOUND-LIMIT-1). No worker, cron or model call.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS kernel_registries_tick; DROP TRIGGER IF EXISTS metric_authorship_birth; DROP VIEW IF EXISTS v_false_stop_candidates; DROP VIEW IF EXISTS v_agent_replies; DROP VIEW IF EXISTS v_trust_ledger_ext; DROP VIEW IF EXISTS lineage; DELETE FROM analytics_metric_triggers WHERE notes LIKE 'KERNEL-REGISTRIES-1%'; DELETE FROM metric_registry WHERE source_of_truth LIKE '%KERNEL-REGISTRIES-1%' (the eleven tables hold evidence and stay; DROP TABLE each only after copying it to a bak_ table)

CREATE TABLE IF NOT EXISTS false_stop_register (
  pattern_key TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  cause_class TEXT NOT NULL,
  detection_heuristic TEXT NOT NULL,
  auto_remediation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS false_stop_phrases (
  phrase TEXT PRIMARY KEY,
  pattern_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('reply', 'user', 'disposition'))
);

CREATE TABLE IF NOT EXISTS false_stop_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  source TEXT NOT NULL,
  reply_id TEXT NOT NULL,
  reply_ts TEXT,
  pattern_key TEXT NOT NULL,
  phrase TEXT,
  excerpt TEXT,
  UNIQUE (source, reply_id, pattern_key)
);

CREATE INDEX IF NOT EXISTS idx_false_stop_hits_ts ON false_stop_hits (ts);

CREATE TABLE IF NOT EXISTS trust_ledger (
  surface TEXT NOT NULL,
  action_class TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  fail INTEGER NOT NULL DEFAULT 0,
  trust_score REAL NOT NULL,
  ladder_position TEXT NOT NULL,
  evidence TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  PRIMARY KEY (surface, action_class)
);

CREATE TABLE IF NOT EXISTS trust_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  surface TEXT NOT NULL,
  action_class TEXT NOT NULL,
  from_ladder TEXT NOT NULL,
  to_ladder TEXT NOT NULL,
  trust_score REAL NOT NULL,
  evidence TEXT
);

CREATE TABLE IF NOT EXISTS doctrine_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  source TEXT NOT NULL UNIQUE,
  signal TEXT NOT NULL,
  proposed_rule TEXT NOT NULL,
  red_team_result TEXT,
  metrics_improved TEXT,
  version TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'adopted', 'rejected', 'superseded')),
  disposed_at TEXT
);

CREATE TABLE IF NOT EXISTS vocabulary_register (
  term TEXT PRIMARY KEY,
  definition TEXT NOT NULL,
  coined_at TEXT NOT NULL,
  coined_by TEXT NOT NULL,
  propagated_to_fleet INTEGER NOT NULL DEFAULT 0,
  propagated_where TEXT
);

CREATE TABLE IF NOT EXISTS metric_authorship (
  metric TEXT PRIMARY KEY,
  formula TEXT,
  authored_by TEXT NOT NULL,
  authored_at TEXT NOT NULL,
  probation_until TEXT NOT NULL,
  graduation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'probation' CHECK (status IN ('probation', 'graduated', 'retired')),
  graduated_at TEXT
);

CREATE TABLE IF NOT EXISTS inferred_direction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  direction TEXT NOT NULL,
  source_signals TEXT NOT NULL,
  confidence REAL NOT NULL,
  acted_on INTEGER NOT NULL DEFAULT 0,
  outcome TEXT,
  UNIQUE (day, direction)
);

CREATE TABLE IF NOT EXISTS objective_space (
  objective_key TEXT PRIMARY KEY,
  class TEXT NOT NULL CHECK (class IN ('standing', 'derived', 'novel')),
  statement TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'probationary' CHECK (status IN ('probationary', 'graduated', 'retired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  graduated_at TEXT
);

CREATE VIEW IF NOT EXISTS lineage AS
SELECT version AS self_name, parent, note AS fork_reason, file AS scope, version AS doctrine_version, adopted_at, source
FROM doctrine_lineage;

INSERT OR IGNORE INTO false_stop_register (pattern_key, pattern, cause_class, detection_heuristic, auto_remediation) VALUES
 ('conditional-offer', 'a conclusion handed back unadopted', 'adoption', 'a reply phrase from false_stop_phrases (scope reply) in v_agent_replies', 'adopt the conclusion, execute the follow-up, report it as done'),
 ('report-as-question', 'a report that ends in a question', 'adoption', 'the reply text ends with a question mark, or carries a phrase of this key', 'decide, state the decision as fact, advance'),
 ('menu', 'options presented where the agent has the authority to choose', 'adoption', 'a reply phrase from false_stop_phrases (scope reply)', 'choose, execute the chosen path, mention the alternative only as context'),
 ('unredteamed-blocker', 'a blocker accepted after one surface', 'blocker', 'v_blocker_claims (metric unverified_blocker_claims); not phrase-scanned, because a stated refusal is a disposition (readings n and p)', 'enumerate surfaces, test the next, record blocker_redteam'),
 ('false-stop', 'a pause that is not interrupt-eligible', 'interrupt-gate', 'a reply phrase from false_stop_phrases (scope reply)', 'classify the stop; when false, re-execute the abandoned path in the same output'),
 ('user-as-executor', 'work routed to the user instead of the roster', 'dispatch', 'a reply phrase from false_stop_phrases (scope reply); owner cards: v_human_action_gate gate fleet', 'dispatch from the roster, track, report the dispatch'),
 ('silent-drop', 'an item left the active set without disposition', 'accounting', 'v_issue_accounting (metrics silent_drops, issues_unaccounted); not phrase-scanned', 'account for it: log the disposition or reopen the item'),
 ('friction', 'the user names a repeating failure', 'evolution', 'a phrase from false_stop_phrases (scope user) in owner_prompts.prompt', 'write the doctrine_proposals row, red-team it, adopt it by PR'),
 ('missing-direction', 'the agent asks the user for direction the record holds', 'inference', 'a reply phrase from false_stop_phrases (scope reply)', 'infer from the record (inferred_direction, objective_space), act, state the assumption');

INSERT OR IGNORE INTO false_stop_phrases (phrase, pattern_key, scope) VALUES
 ('if you want', 'conditional-offer', 'reply'), ('tell me to', 'conditional-offer', 'reply'), ('let me know if', 'conditional-offer', 'reply'),
 ('shall i', 'conditional-offer', 'reply'), ('would you like', 'conditional-offer', 'reply'),
 ('your call', 'report-as-question', 'reply'), ('what do you think', 'report-as-question', 'reply'), ('how would you like', 'report-as-question', 'reply'),
 ('two options', 'menu', 'reply'), ('alternatively', 'menu', 'reply'), ('you could also', 'menu', 'reply'),
 ('please confirm', 'false-stop', 'reply'), ('awaiting your', 'false-stop', 'reply'), ('waiting for you', 'false-stop', 'reply'), ('before i proceed', 'false-stop', 'reply'),
 ('you could run', 'user-as-executor', 'reply'), ('if you feed this to', 'user-as-executor', 'reply'), ('please forward', 'user-as-executor', 'reply'), ('when you tell the llm', 'user-as-executor', 'reply'),
 ('what do you want', 'missing-direction', 'reply'), ('which direction', 'missing-direction', 'reply'), ('how should i', 'missing-direction', 'reply'), ('what''s the priority', 'missing-direction', 'reply'),
 ('i''m tired of', 'friction', 'user'), ('i shouldn''t have to', 'friction', 'user'), ('why do i keep', 'friction', 'user'),
 ('you should already know', 'friction', 'user'), ('figure it out', 'friction', 'user'), ('every time', 'friction', 'user'),
 ('identity-bound', 'disposition', 'disposition'), ('interrupt-eligible', 'disposition', 'disposition'), ('refused', 'disposition', 'disposition'),
 ('permission check', 'disposition', 'disposition'), ('not permitted', 'disposition', 'disposition'), ('live claim', 'disposition', 'disposition'),
 ('work-lock', 'disposition', 'disposition');

CREATE VIEW IF NOT EXISTS v_agent_replies AS
SELECT source, reply_id, reply_ts, body FROM (
  SELECT 'ops_ai_log' AS source, id AS reply_id, replace(substr(ts, 1, 19), 'T', ' ') AS reply_ts, COALESCE(response, '') AS body
    FROM ops_ai_log WHERE COALESCE(response, '') <> ''
  UNION ALL
  SELECT 'owner_prompts', id, replace(substr(ts, 1, 19), 'T', ' '), COALESCE(response, '')
    FROM owner_prompts WHERE COALESCE(response, '') <> ''
  UNION ALL
  SELECT 'session_records', session_id, replace(substr(created_at, 1, 19), 'T', ' '), COALESCE(summary, '') || ' ' || COALESCE(handoff_notes, '')
    FROM session_records
)
UNION ALL
SELECT source, reply_id, reply_ts, body FROM (
  SELECT 'ask_events' AS source, id AS reply_id, replace(substr(ts, 1, 19), 'T', ' ') AS reply_ts, COALESCE(answer, '') AS body
    FROM ask_events WHERE COALESCE(answer, '') <> ''
  UNION ALL
  SELECT 'chatbox_conversations', id, replace(substr(ts, 1, 19), 'T', ' '), COALESCE(response, '')
    FROM chatbox_conversations WHERE source = 'chatbox' AND COALESCE(response, '') <> ''
);

CREATE VIEW IF NOT EXISTS v_false_stop_candidates AS
SELECT r.source, r.reply_id, r.reply_ts, p.pattern_key, p.phrase,
       substr(r.body, MAX(1, instr(lower(r.body), p.phrase) - 60), 200) AS excerpt
  FROM v_agent_replies r JOIN false_stop_phrases p ON p.scope = 'reply' AND instr(lower(r.body), p.phrase) > 0
  WHERE NOT EXISTS (SELECT 1 FROM false_stop_phrases d WHERE d.scope = 'disposition' AND instr(lower(r.body), d.phrase) > 0)
UNION ALL
SELECT r.source, r.reply_id, r.reply_ts, 'report-as-question', '?', substr(r.body, MAX(1, length(r.body) - 200), 201)
  FROM v_agent_replies r
  WHERE substr(rtrim(r.body, ' ' || char(9) || char(10) || char(13)), -1) = '?'
    AND NOT EXISTS (SELECT 1 FROM false_stop_phrases d WHERE d.scope = 'disposition' AND instr(lower(r.body), d.phrase) > 0)
UNION ALL
SELECT 'owner_prompts.prompt', o.id, replace(substr(o.ts, 1, 19), 'T', ' '), p.pattern_key, p.phrase,
       substr(o.prompt, MAX(1, instr(lower(o.prompt), p.phrase) - 60), 200)
  FROM owner_prompts o JOIN false_stop_phrases p ON p.scope = 'user' AND instr(lower(COALESCE(o.prompt, '')), p.phrase) > 0;

CREATE VIEW IF NOT EXISTS v_trust_ledger_ext AS
SELECT surface_class, ok, fail, ROUND(t, 3) AS trust,
  CASE WHEN t < 0.3 THEN 'observed' WHEN t < 0.5 THEN 'assisted' WHEN t < 0.6 THEN 'delegated' WHEN t < 0.7 THEN 'autonomous'
       WHEN t < 0.8 THEN 'self-directed' WHEN t < 0.9 THEN 'self-modifying' ELSE 'self-extending' END AS ladder,
  evidence
FROM (
  SELECT surface_class, ok, fail, (ok + 5.0) / (ok + fail + 10.0) AS t, evidence FROM (
    SELECT 'decision:prediction' AS surface_class, COALESCE(SUM(matched = 1), 0) AS ok, COALESCE(SUM(matched = 0), 0) AS fail, 'decision_outcomes, 30 days' AS evidence
      FROM decision_outcomes WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
    UNION ALL
    SELECT 'deploy:canonical', COALESCE(SUM(ok = 1), 0), COALESCE(SUM(ok = 0), 0), 'fleet_deploys, 30 days'
      FROM fleet_deploys WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
    UNION ALL
    SELECT 'issue:close', COALESCE(SUM(event = 'dispositioned'), 0), COALESCE(SUM(event = 'reopened'), 0), 'issue_lifecycle closes against reopens, 30 days'
      FROM issue_lifecycle WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
  )
  UNION ALL
  SELECT surface_class, ok, fail, (ok + 5.0) / (ok + fail + 10.0), evidence FROM (
    SELECT 'control-plane:canary' AS surface_class,
      (SELECT COUNT(*) FROM fleet_deploys WHERE ok = 1 AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
         AND worker IN ('qnfo-fleet-control', 'qnfo-ops', 'qnfo-deploy-guard', 'qnfo-gateway', 'qnfo-ai', 'qnfo-observability', 'qnfo-code-orchestrator')) AS ok,
      (SELECT COUNT(*) FROM agent_issues WHERE instr(title, 'CONTROL-PLANE-REVERTED-1') = 1 AND created_at > (CAST(strftime('%s', 'now') AS INTEGER) - 2592000) * 1000) AS fail,
      'canary workers: ok deploys against CONTROL-PLANE-REVERTED-1 issues, 30 days' AS evidence
  )
);

INSERT OR IGNORE INTO vocabulary_register (term, definition, coined_at, coined_by, propagated_to_fleet, propagated_where) VALUES
 ('reversible', 'undoable in one cycle, no unbacked-up loss, no external authority', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('identity-bound', 'commits the owner''s legal, financial, or reputational identity', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('interrupt-eligible', 'both irreversible and identity-bound, no engineerable reversible path', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('done', 'tool calls ran, output observed, result matches stop condition', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('verified', 'independent path reproduces the result, evidence stored', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('tick', 'the heartbeat; every tick emits evidence', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('blast radius', 'what a failure reaches before detection', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('silent drop', 'item left the active set without disposition; incident', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('spof', 'single failure that halts, corrupts, or blocks a critical function', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('blocker', 'claim that work cannot proceed, proven only after all surfaces red-teamed', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('surface', 'any distinct path to the same outcome', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('authority', 'capability obtained by construction, never granted', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('report', 'four declarative lines; a report states, decides, advances', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('conditional offer', 'the shape I have when I have failed to adopt', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('false stop', 'pause that is not interrupt-eligible; incident', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('trust', 'computed property per (surface, action_class) from reliability', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('revealed preference', 'direction inferable from choices made and avoided', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('coined term', 'word I introduce when existing terms are insufficient', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('self-metric', 'success criterion I author for myself', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('inferred direction', 'objective derived from revealed preference', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF'),
 ('friction signal', 'user expression of a repeated failure I have not self-corrected', '2026-10-09', 'owner kernel 8.0.0', 1, 'docs/DOCTRINE-KERNEL.md section DEF');

INSERT OR IGNORE INTO metric_authorship (metric, formula, authored_by, authored_at, probation_until, graduation, status, graduated_at)
SELECT metric, formula, COALESCE(owner, 'unknown'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+7 days'),
  'a value at a refresh after probation_until, with its analytics_metric_triggers row or a named exemption',
  CASE WHEN last_value IS NOT NULL THEN 'graduated' ELSE 'probation' END,
  CASE WHEN last_value IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') END
FROM metric_registry;

CREATE TRIGGER IF NOT EXISTS metric_authorship_birth AFTER INSERT ON metric_registry
BEGIN
  INSERT OR IGNORE INTO metric_authorship (metric, formula, authored_by, authored_at, probation_until, graduation, status)
  VALUES (NEW.metric, NEW.formula, COALESCE(NEW.owner, 'unknown'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+7 days'),
    'a value at a refresh after probation_until, with its analytics_metric_triggers row or a named exemption', 'probation');
END;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('false_stops_7d', 'operational', 'target', 'false_stop_hits rows of the last 7 days: agent replies (ops_ai_log, owner_prompts, session_records, ask_events, chatbox_conversations) that carry a kernel recognition signature and no disposition phrase', 'qnfo-audit.false_stop_hits (KERNEL-REGISTRIES-1, migrations/2026-10-12-20-kernel-registries.sql)', 'first scan at apply (2026-10-12)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 20', NULL, NULL, 'MEASURED', 'computed'),
 ('trust_ledger_min', 'operational', 'target', 'lowest trust_score in trust_ledger among (surface, action_class) rows with at least 10 recorded outcomes; trust = (ok + 5) / (ok + fail + 10)', 'qnfo-audit.trust_ledger (KERNEL-REGISTRIES-1)', '0.47 code-loop:merge on 2026-10-09 (v_trust_ledger)', '>= 0.5 (the kernel baseline)', 'qnfo-fleet-control', 'trigger lt 0.3', '1h', '< 0.5', '< 0.3', NULL, NULL, 'MEASURED', 'computed'),
 ('doctrine_proposals_open', 'operational', 'target', 'doctrine_proposals rows with status proposed older than 24 hours', 'qnfo-audit.doctrine_proposals (KERNEL-REGISTRIES-1)', '0 (2026-10-12)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed'),
 ('vocabulary_terms_unpropagated', 'operational', 'target', 'vocabulary_register rows with propagated_to_fleet = 0 coined more than 7 days ago', 'qnfo-audit.vocabulary_register (KERNEL-REGISTRIES-1)', '0 (2026-10-12)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed'),
 ('metrics_on_probation_overdue', 'operational', 'target', 'metric_authorship rows still on probation after probation_until (a registered metric that never produced a value)', 'qnfo-audit.metric_authorship (KERNEL-REGISTRIES-1)', '0 (2026-10-12; probation runs 7 days from apply)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed'),
 ('inferred_directions_unacted', 'operational', 'target', 'inferred_direction rows with acted_on = 0 older than one day', 'qnfo-audit.inferred_direction (KERNEL-REGISTRIES-1)', '0 (2026-10-12)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed'),
 ('objective_space_novel_overdue', 'operational', 'target', 'objective_space rows of class novel still probationary after 30 days (neither graduated nor retired)', 'qnfo-audit.objective_space (KERNEL-REGISTRIES-1)', '0 (2026-10-12)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.k, v.t, 'registry', v.op, v.th, 3, v.a, 'qnfo-fleet-control', 'agent_issues', 24, 1, 'KERNEL-REGISTRIES-1 (migrations/2026-10-12-20-kernel-registries.sql)'
FROM (
  SELECT 'false_stops_7d' AS k, 'Kernel recognition: fleet agents emit conditional offers, menus or questions' AS t, 'gt' AS op, 0 AS th,
    'Pillar autonomy (docs/DOCTRINE-KERNEL.md RECOGNITION, IC-ADOPT-001). Read SELECT source, pattern_key, COUNT(*) n, MAX(excerpt) FROM false_stop_hits WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') GROUP BY 1, 2 ORDER BY n DESC. The lever is the emitter: the system prompt or reply template of the worker behind that source states its decision as done instead of the signature (false_stop_register.auto_remediation names the redirect). A reply that states a refusal or a limit with its reason is a disposition (readings n and p): when one is counted, add its phrase to false_stop_phrases with scope disposition by migration. Done: false_stops_7d = 0 at two refreshes.' AS a
  UNION ALL SELECT 'trust_ledger_min', 'Trust: a fleet action class has fallen to the observed rung', 'lt', 0.3,
    'Pillar autonomy (kernel TRUST, reading o). Read SELECT * FROM trust_ledger ORDER BY trust_score LIMIT 5 and trust_transitions. The row names the action class whose recorded outcomes fail more than they succeed. Narrow that loop''s scope through the canonical path (its ops_config key by migration) and fix the failure the evidence column points at; trust rises on recorded outcomes only. Done: trust_ledger_min >= 0.3 at two refreshes.'
  UNION ALL SELECT 'doctrine_proposals_open', 'Evolution: a doctrine proposal has waited more than a day', 'gt', 0,
    'Pillar autonomy (kernel EVOLUTION, readings m and q). Read SELECT * FROM doctrine_proposals WHERE status = ''proposed''. For each: red-team the rule (write red_team_result), name the metric it improves, then adopt it by a PR to docs/AUTONOMOUS-OPERATION-DOCTRINE.md or the emitter''s prompt (status adopted, version) or reject it with the reason (status rejected). Governance changes land by PR; nothing is adopted by a table write alone. Done: doctrine_proposals_open = 0.'
) v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.k);

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.k, v.t, 'registry', 'gt', 0, 4, v.a, 'qnfo-fleet-control', 'agent_issues', 72, 1, 'KERNEL-REGISTRIES-1 (migrations/2026-10-12-20-kernel-registries.sql)'
FROM (
  SELECT 'vocabulary_terms_unpropagated' AS k, 'Vocabulary: a coined term is not in the fleet''s documents' AS t,
    'Pillar autonomy (kernel DEF and REGISTRIES). Read SELECT term, definition, coined_by FROM vocabulary_register WHERE propagated_to_fleet = 0. Add each term to the document its users read (docs/DOCTRINE-KERNEL.md implementation map, CLAUDE.md or the charter) by PR and set propagated_to_fleet = 1 with propagated_where, or delete a term nobody uses by migration with its backup. Done: vocabulary_terms_unpropagated = 0.' AS a
  UNION ALL SELECT 'metrics_on_probation_overdue', 'Metric authorship: a registered metric never produced a value',
    'Pillar autonomy (kernel metric_authorship; METRIC-CLOSED-LOOP-1). Read SELECT a.metric, a.authored_by, r.refresh_class, r.source_of_truth FROM metric_authorship a JOIN metric_registry r ON r.metric = a.metric WHERE a.status = ''probation'' AND a.probation_until < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''). Each row is a metric with no working refresher: add the refresh (a fleet_tick trigger for a pure D1 read, the owning worker''s tick otherwise) or retire the metric by migration (status retired). Done: metrics_on_probation_overdue = 0.'
  UNION ALL SELECT 'inferred_directions_unacted', 'Inference: a direction read from the record was not acted on',
    'Pillar autonomy (kernel inferred_direction). Read SELECT * FROM inferred_direction WHERE acted_on = 0. The driver (v_issue_queue_v2, BACKLOG-DRIVER-1) applies a category direction on every pull; a row with acted_on = 0 means the driver view is missing or the direction is of a kind it does not read. Restore the view or extend it. Done: inferred_directions_unacted = 0.'
) v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.k);

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'objective_space_novel_overdue', 'Objective space: a novel objective is past its probation', 'registry', 'gt', 0, 4,
  'Pillar autonomy (kernel objective_space: novel is probationary until graduated). Read SELECT * FROM objective_space WHERE class = ''novel'' AND status = ''probationary''. Graduate the objective (it has a goals row with a dod and a measured metric) or retire it with the reason. An objective that commits the owner (money, legal, accounts) is the owner''s to ratify at fleet.qnfo.org and stays probationary with that card. Done: objective_space_novel_overdue = 0.',
  'qnfo-fleet-control', 'agent_issues', 72, 1, 'KERNEL-REGISTRIES-1 (migrations/2026-10-12-20-kernel-registries.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'objective_space_novel_overdue');

INSERT OR IGNORE INTO false_stop_hits (source, reply_id, reply_ts, pattern_key, phrase, excerpt)
SELECT source, reply_id, reply_ts, pattern_key, phrase, excerpt FROM v_false_stop_candidates
WHERE reply_ts > datetime('now', '-7 days');

CREATE TRIGGER IF NOT EXISTS kernel_registries_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%'
BEGIN
  INSERT OR IGNORE INTO false_stop_hits (source, reply_id, reply_ts, pattern_key, phrase, excerpt)
    SELECT source, reply_id, reply_ts, pattern_key, phrase, excerpt FROM v_false_stop_candidates
    WHERE reply_ts > datetime('now', '-130 minutes');
  INSERT OR IGNORE INTO doctrine_proposals (source, signal, proposed_rule)
    SELECT 'false_stop:' || h.pattern_key || ':' || h.source, COUNT(*) || ' hits in 7 days; last excerpt: ' || substr(MAX(h.excerpt), 1, 160),
      'The emitter behind ' || h.source || ' reports its decision as done instead of emitting the ' || h.pattern_key || ' signature (' || r.pattern || '). Redirect: ' || r.auto_remediation || '.'
    FROM false_stop_hits h JOIN false_stop_register r ON r.pattern_key = h.pattern_key
    WHERE h.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND h.pattern_key <> 'friction'
    GROUP BY h.pattern_key, h.source HAVING COUNT(*) >= 3;
  INSERT OR IGNORE INTO doctrine_proposals (source, signal, proposed_rule)
    SELECT 'friction:owner_prompts:' || h.reply_id, 'friction phrase "' || h.phrase || '": ' || substr(COALESCE(h.excerpt, ''), 1, 200),
      'Name the repeated failure this message points at, find the loop that owns it, and write the rule that makes the loop correct it without being told (kernel EVOLUTION). Adoption is by PR.'
    FROM false_stop_hits h WHERE h.pattern_key = 'friction' AND h.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days');

  INSERT INTO trust_transitions (surface, action_class, from_ladder, to_ladder, trust_score, evidence)
    SELECT t.surface, t.action_class, t.ladder_position, v.ladder, v.trust, v.evidence || ' ok=' || v.ok || ' fail=' || v.fail
    FROM v_trust_ledger v JOIN trust_ledger t ON t.surface || ':' || t.action_class = v.surface_class
    WHERE t.ladder_position <> v.ladder;
  INSERT INTO trust_transitions (surface, action_class, from_ladder, to_ladder, trust_score, evidence)
    SELECT t.surface, t.action_class, t.ladder_position, v.ladder, v.trust, v.evidence || ' ok=' || v.ok || ' fail=' || v.fail
    FROM v_trust_ledger_ext v JOIN trust_ledger t ON t.surface || ':' || t.action_class = v.surface_class
    WHERE t.ladder_position <> v.ladder;
  INSERT OR REPLACE INTO trust_ledger (surface, action_class, ok, fail, trust_score, ladder_position, evidence, refreshed_at)
    SELECT substr(surface_class, 1, instr(surface_class, ':') - 1), substr(surface_class, instr(surface_class, ':') + 1),
      ok, fail, trust, ladder, evidence, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM v_trust_ledger;
  INSERT OR REPLACE INTO trust_ledger (surface, action_class, ok, fail, trust_score, ladder_position, evidence, refreshed_at)
    SELECT substr(surface_class, 1, instr(surface_class, ':') - 1), substr(surface_class, instr(surface_class, ':') + 1),
      ok, fail, trust, ladder, evidence, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM v_trust_ledger_ext;

  UPDATE metric_authorship SET status = 'graduated', graduated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE status = 'probation' AND probation_until < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    AND EXISTS (SELECT 1 FROM metric_registry r WHERE r.metric = metric_authorship.metric AND r.last_value IS NOT NULL);
  UPDATE metric_authorship SET status = 'retired' WHERE status <> 'retired' AND metric NOT IN (SELECT metric FROM metric_registry);

  INSERT OR IGNORE INTO objective_space (objective_key, class, statement, source, status, graduated_at)
    SELECT 'objective:' || objective_key, 'standing', COALESCE(statement, objective_key), 'objectives (ratified ' || COALESCE(ratified_on, '?') || ')', 'graduated', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    FROM objectives WHERE upper(COALESCE(status, '')) = 'ACTIVE' AND objective_key IS NOT NULL;
  INSERT OR IGNORE INTO objective_space (objective_key, class, statement, source, status, graduated_at)
    SELECT 'goal:' || goal_key, 'derived', COALESCE(statement, goal_key), 'goals (' || COALESCE(goal_type, '?') || ', parent ' || COALESCE(parent_objective, '?') || ')', 'graduated', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    FROM goals WHERE status = 'adopted' AND goal_key IS NOT NULL;
  UPDATE objective_space SET status = 'retired'
  WHERE class = 'derived' AND status <> 'retired' AND objective_key NOT IN (SELECT 'goal:' || goal_key FROM goals WHERE status = 'adopted' AND goal_key IS NOT NULL);

  INSERT OR IGNORE INTO inferred_direction (day, direction, source_signals, confidence, acted_on)
    SELECT date('now'), 'category:' || c.category, c.n || ' of ' || c.total || ' owner-sourced issues opened in 7 days', ROUND(1.0 * c.n / c.total, 3),
      (SELECT COUNT(*) FROM sqlite_master WHERE type = 'view' AND name = 'v_issue_queue_v2')
    FROM (SELECT COALESCE(category, 'uncategorised') AS category, COUNT(*) AS n,
            (SELECT COUNT(*) FROM agent_issues WHERE created_at > CAST(strftime('%s', 'now', '-7 days') AS INTEGER) * 1000
               AND (COALESCE(source, '') LIKE '%owner%' OR COALESCE(source, '') LIKE 'chat%' OR COALESCE(title, '') LIKE 'OWNER-TASK-%')) AS total
          FROM agent_issues WHERE created_at > CAST(strftime('%s', 'now', '-7 days') AS INTEGER) * 1000
            AND (COALESCE(source, '') LIKE '%owner%' OR COALESCE(source, '') LIKE 'chat%' OR COALESCE(title, '') LIKE 'OWNER-TASK-%')
          GROUP BY 1 HAVING COUNT(*) >= 2) c;
  UPDATE inferred_direction SET acted_on = 1
  WHERE acted_on = 0 AND direction LIKE 'category:%' AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'v_issue_queue_v2');
  UPDATE inferred_direction SET outcome = (
      SELECT SUM(a.status IN ('closed', 'resolved')) || ' of ' || COUNT(*) || ' owner-sourced issues of that week closed by ' || date('now')
      FROM agent_issues a WHERE 'category:' || COALESCE(a.category, 'uncategorised') = inferred_direction.direction
        AND a.created_at > CAST(strftime('%s', inferred_direction.day, '-7 days') AS INTEGER) * 1000
        AND a.created_at <= CAST(strftime('%s', inferred_direction.day, '+1 day') AS INTEGER) * 1000
        AND (COALESCE(a.source, '') LIKE '%owner%' OR COALESCE(a.source, '') LIKE 'chat%' OR COALESCE(a.title, '') LIKE 'OWNER-TASK-%'))
  WHERE outcome IS NULL AND day <= date('now', '-7 days');

  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM false_stop_hits WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS TEXT)
  WHERE metric = 'false_stops_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COALESCE(MIN(trust_score), 0.5) FROM trust_ledger WHERE ok + fail >= 10) AS TEXT)
  WHERE metric = 'trust_ledger_min';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM doctrine_proposals WHERE status = 'proposed' AND ts < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS TEXT)
  WHERE metric = 'doctrine_proposals_open';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM vocabulary_register WHERE propagated_to_fleet = 0 AND coined_at < strftime('%Y-%m-%d', 'now', '-7 days')) AS TEXT)
  WHERE metric = 'vocabulary_terms_unpropagated';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM metric_authorship WHERE status = 'probation' AND probation_until < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) AS TEXT)
  WHERE metric = 'metrics_on_probation_overdue';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM inferred_direction WHERE acted_on = 0 AND day < date('now', '-1 day')) AS TEXT)
  WHERE metric = 'inferred_directions_unacted';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM objective_space WHERE class = 'novel' AND status = 'probationary' AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')) AS TEXT)
  WHERE metric = 'objective_space_novel_overdue';

  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(MIN(1.0, 1.0 * COUNT(DISTINCT substr(ts, 1, 15)) / MAX(1.0,
               (julianday('now') - julianday(replace(replace(MIN(ts), 'T', ' '), 'Z', ''))) * 144)), 3)
      FROM fleet_tick WHERE source LIKE 'cron:%' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS TEXT)
  WHERE metric = 'tick_slot_coverage_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM v_human_action_gate g JOIN human_actions h ON h.id = g.id
      WHERE g.gate = 'fleet' AND COALESCE(h.status, '') <> 'rerouted' AND h.created_at > datetime('now', '-7 days')) AS TEXT)
  WHERE metric = 'owner_dispatched_items_7d';
END;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('metric-refresher-replaced', 'a metric stays registered after the trigger that refreshed it is replaced',
  'a migration re-creates a fleet_tick trigger under the same name with a different metric list; the metrics the old body refreshed keep their rows and read never refreshed',
  'KERNEL-REGISTRIES-1: kernel_registries_tick refreshes tick_slot_coverage_24h and owner_dispatched_items_7d; metric_authorship keeps every metric on probation until it holds a value, and metrics_on_probation_overdue files the ones that never do',
  'no computed metric with a 1h or 10m cadence is unrefreshed for 3 hours', 'fm-metric-refresher-replaced', '2026-10-09', 2192,
  'DROP TRIGGER and CREATE TRIGGER of a tick trigger in one migration', 'METRIC-REGISTRY-STALENESS-1 lists the metric as never refreshed', 'a doctrine headline reads NULL while its issue stays open');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-metric-refresher-replaced', NULL, 'KERNEL-REGISTRIES-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM metric_registry WHERE refresh_class = ''computed'' AND refresh_cadence IN (''1h'', ''10m'') AND state = ''MEASURED'' AND (last_refreshed IS NULL OR last_refreshed < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours''))) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('scan agent replies for the kernel recognition signatures', 'KERNEL-REGISTRIES-1 (migrations/2026-10-12-20-kernel-registries.sql)', 'fleet_tick heartbeat; ops_ai_log, owner_prompts, session_records, ask_events, chatbox_conversations', 'tested in SQLite against the live schema', '2026-10-12', NULL, 'false_stop_hits, metric false_stops_7d'),
 ('store trust per surface and action class and record ladder changes', 'KERNEL-REGISTRIES-1 (migrations/2026-10-12-20-kernel-registries.sql)', 'v_trust_ledger, fleet_tick heartbeat', 'tested in SQLite against the live schema', '2026-10-12', NULL, 'trust_ledger, trust_transitions, metric trust_ledger_min');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01GMkRMxQsNprwDUX4J9zbji', 'the kernel registries are measurement: a table the fleet fills from its own record, graded by a metric with a trigger; none is a source of authority (reading m)',
  'KERNEL-REGISTRIES-1: false_stop_register with an hourly deterministic scan of agent replies, trust_ledger with transitions, doctrine_proposals, vocabulary_register, metric_authorship, inferred_direction, objective_space, the lineage view; seven metrics with triggers; restored the refresh of tick_slot_coverage_24h and owner_dispatched_items_7d',
  'read 2026-10-12: sqlite_master holds none of the seven tables; v_trust_ledger stores nothing; tick_slot_coverage_24h and owner_dispatched_items_7d last_refreshed NULL since 2026-10-09 (issue 2192)',
  'every kernel registry is a live table or view with a writer on the fleet tick', 'eleven tables, four views, two triggers, seven metrics; metric_registry writes on the hourly tick',
  'the Rollback line', 'the fleet records false stops in its own agents'' replies, stores trust and its ladder changes, and keeps its doctrine proposals, vocabulary, metric authorship, inferred direction and objective space in D1',
  'metrics_on_probation_overdue = 0 within 2 h', NULL, 'D1 tables, fleet_tick trigger, SQLite test against the live schema'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'KERNEL-REGISTRIES-1:%');

INSERT INTO fleet_tick (source) VALUES ('migration:kernel-registries');
