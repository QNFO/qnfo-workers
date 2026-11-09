-- RECALL-LOOP-1 (2026-11-09, charter pillar research, program QNFO.RSCH; PROMPTED-RECALL-1). Owner, 2026-11-09: "Even research, I could tell you by now
-- what research is working and what's not. And so I think we need to be much clearer on what we're focusing our attention on. I'm trying to give
-- feedback where you ask for it, but you're not asking me for enough feedback. And that needs to be done via existing interfaces."
-- WHAT WAS MEASURED (qnfo-audit.research_queue and living-paper.paper_category, 2026-11-09): papers published in the last 30 days by category were physics 100,
--   mathematics 49, qec 20, ai-epistemics 19, ai-operations 15, logic 13, synthesis 10, energy 7. Of the queued and deferred non-remediation ideas, about 505 match
--   quantum-foundation terms and 31 match autonomous-AI terms, while the owner's stated direction since 2026-11-09 is autonomous AI systems research.
--   Nothing in the fleet asked the owner which research lines work; the queue order came from model scores only.
-- WHAT THIS ADDS (no worker code; the apply logic is triggers, so any surface that records an answer gets the same effect):
--  (1) owner_asks: one fleet-wide queue of prompted-recall questions for the owner (plane research | jobs | fleet), 2 to 4 options plus "Not sure",
--      shown one at a time on the companion (me.q08.org Today, personal-api 4.40.0) and on fleet.qnfo.org/focus (qnfo-fleet-dashboard).
--  (2) research_lines + research_line_terms: nine research lines named in the owner's words, each with the LIKE patterns that place a queued idea in it.
--  (3) owner_focus: the owner's stance per line (push | keep | pause), written only from an answer. Triggers apply it to research_queue:
--      pause  -> queued or deferred ground-stage ideas of that line (not remediation, not an owner intent, not in a pushed line) become status 'owner_paused'
--                (the backpressure release in qnfo-fleet-control reads only 'deferred', so they stay out of the pipeline); new inserts of that line too.
--      push   -> score lifted to at least 0.95, so the line wins the in-class claim order and the backpressure release order (both score DESC).
--      keep / a later push -> rows this file paused for that line go back to 'deferred' and the normal release order.
--  (4) fleet_tasks recall-loop (daily 07:20 UTC): asks again about every line 14 days after the last answer, once a week asks which line matters most,
--      and writes a cloud_ops_events ledger row.
-- PREDICTION: owner_asks_answered_14d >= 9 within 14 d (every line answered once). Falsifier: fewer than 3 answers in 14 days means the card is not where the owner
--   looks: move it, do not add more questions.
-- Strongest argument against: LIKE patterns misplace ideas (an AI-alignment idea that mentions "quantum" is also a quantum idea). Mitigation: a pushed line always wins
--   over a paused one, remediation and owner intents are never paused, and every pause is reversible by one tap ("Keep it as is").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE research_queue SET status = 'deferred', error = NULL WHERE status = 'owner_paused' AND error LIKE 'OWNER-FOCUS-1 paused %'; DROP TRIGGER IF EXISTS owner_asks_research_line_au; DROP TRIGGER IF EXISTS owner_asks_research_top_au; DROP TRIGGER IF EXISTS owner_focus_apply_ai; DROP TRIGGER IF EXISTS research_queue_owner_focus_ai; UPDATE fleet_crons SET enabled = 0 WHERE name = 'recall-loop-daily'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'recall-loop'
-- Rollback note: owner_asks, owner_focus, owner_focus_log, research_lines and research_line_terms stay as the record of what the owner answered.
-- CAUSE-MAPPED: registers no metric.
-- spof-review: a trigger error would fail the research_queue INSERT that fired it; the trigger bodies only read small seeded tables and update by id, and
--   migrations/recall-loop.test.mjs replays them against the real research_queue shape, including the backpressure release.

CREATE TABLE IF NOT EXISTS owner_asks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, question TEXT NOT NULL, cue TEXT,
  options_json TEXT NOT NULL, priority INTEGER DEFAULT 5, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  answered_at TEXT, answer TEXT, answer_label TEXT, answered_via TEXT, UNIQUE(kind, ref));
CREATE INDEX IF NOT EXISTS idx_owner_asks_open ON owner_asks (answered_at, plane, priority);
CREATE TABLE IF NOT EXISTS research_lines (line TEXT PRIMARY KEY, label TEXT NOT NULL, sort INTEGER DEFAULT 50);
CREATE TABLE IF NOT EXISTS research_line_terms (line TEXT NOT NULL, pattern TEXT NOT NULL, PRIMARY KEY (line, pattern));
CREATE TABLE IF NOT EXISTS owner_focus (line TEXT PRIMARY KEY, stance TEXT NOT NULL CHECK (stance IN ('push','keep','pause')), ask_id INTEGER, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS owner_focus_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), line TEXT NOT NULL, stance TEXT NOT NULL, ask_id INTEGER, paused_now INTEGER, pushed_now INTEGER);

INSERT OR REPLACE INTO research_lines (line, label, sort) VALUES
  ('ai-systems', 'Autonomous AI systems (agents, audits, alignment)', 10),
  ('epistemics', 'How theories get tested (falsification, epicycles, belief)', 20),
  ('quantum-foundations', 'Quantum foundations (measurement, quantization)', 30),
  ('physics', 'Particle physics and cosmology', 40),
  ('qec', 'Quantum error correction', 50),
  ('math', 'Number theory and p-adic mathematics', 60),
  ('logic', 'Logic and computation (Laws of Form, constructivism)', 70),
  ('information', 'Information theory and entropy', 80),
  ('energy', 'Energy limits of computing', 90);

INSERT OR IGNORE INTO research_line_terms (line, pattern) VALUES
  ('ai-systems', '%autonom%'),
  ('ai-systems', '%agentic%'),
  ('ai-systems', '%ai agent%'),
  ('ai-systems', '%llm%'),
  ('ai-systems', '%language model%'),
  ('ai-systems', '%alignment%'),
  ('ai-systems', '%ai safety%'),
  ('ai-systems', '%machine learning%'),
  ('ai-systems', '%neural net%'),
  ('ai-systems', '%artificial intelligence%'),
  ('ai-systems', '%multi-agent%'),
  ('epistemics', '%epicycle%'),
  ('epistemics', '%falsif%'),
  ('epistemics', '%bayesian%'),
  ('epistemics', '%epistem%'),
  ('epistemics', '%belief%'),
  ('epistemics', '%free will%'),
  ('epistemics', '%perception%'),
  ('epistemics', '%theory development%'),
  ('epistemics', '%scientific theor%'),
  ('quantum-foundations', '%quantum%'),
  ('quantum-foundations', '%planck%'),
  ('quantum-foundations', '%wavefunction%'),
  ('quantum-foundations', '%wave function%'),
  ('quantum-foundations', '%moyal%'),
  ('quantum-foundations', '%wigner%'),
  ('quantum-foundations', '%decoherence%'),
  ('quantum-foundations', '%entangle%'),
  ('quantum-foundations', '%measurement problem%'),
  ('physics', '%gravity%'),
  ('physics', '%spacetime%'),
  ('physics', '%cosmolog%'),
  ('physics', '%relativity%'),
  ('physics', '%particle%'),
  ('physics', '%field theor%'),
  ('physics', '%fine-structure%'),
  ('physics', '%fine structure%'),
  ('physics', '%standard model%'),
  ('physics', '%gauge%'),
  ('physics', '%string theor%'),
  ('physics', '%yukawa%'),
  ('physics', '%renormaliz%'),
  ('physics', '%zitterbewegung%'),
  ('physics', '%singularit%'),
  ('qec', '%error correction%'),
  ('qec', '%error-correct%'),
  ('qec', '%qec%'),
  ('qec', '%stabilizer%'),
  ('qec', '%surface code%'),
  ('qec', '%logical qubit%'),
  ('qec', '%fault-toleran%'),
  ('math', '%p-adic%'),
  ('math', '%adelic%'),
  ('math', '%ultrametric%'),
  ('math', '%number theor%'),
  ('math', '%riemann%'),
  ('math', '%prime%'),
  ('math', '%topolog%'),
  ('math', '%category theor%'),
  ('math', '%functor%'),
  ('logic', '%laws of form%'),
  ('logic', '%spencer-brown%'),
  ('logic', '%constructiv%'),
  ('logic', '%excluded middle%'),
  ('logic', '%intuitionist%'),
  ('logic', '%turing%'),
  ('logic', '%computabil%'),
  ('logic', '%godel%'),
  ('logic', '%gödel%'),
  ('logic', '%self-reference%'),
  ('logic', '%intractab%'),
  ('information', '%shannon%'),
  ('information', '%information theor%'),
  ('information', '%information-theor%'),
  ('information', '%entropy%'),
  ('information', '%infomatics%'),
  ('energy', '%landauer%'),
  ('energy', '%joules%'),
  ('energy', '%energy per%'),
  ('energy', '%thermodynamic%'),
  ('energy', '%margolus%'),
  ('energy', '%energy cost%');

CREATE TRIGGER IF NOT EXISTS owner_asks_research_line_au AFTER UPDATE OF answer ON owner_asks
WHEN NEW.kind = 'research-line' AND NEW.answer IN ('push','keep','pause') AND (OLD.answer IS NULL OR OLD.answer != NEW.answer)
BEGIN
  INSERT OR REPLACE INTO owner_focus (line, stance, ask_id, updated_at) VALUES (substr(NEW.ref, 1, instr(NEW.ref, '@') - 1), NEW.answer, NEW.id, strftime('%Y-%m-%dT%H:%M:%SZ','now'));
END;

CREATE TRIGGER IF NOT EXISTS owner_asks_research_top_au AFTER UPDATE OF answer ON owner_asks
WHEN NEW.kind = 'research-top' AND NEW.answer IS NOT NULL AND NEW.answer != 'unsure' AND (OLD.answer IS NULL OR OLD.answer != NEW.answer)
  AND EXISTS (SELECT 1 FROM research_lines WHERE line = NEW.answer)
BEGIN
  INSERT OR REPLACE INTO owner_focus (line, stance, ask_id, updated_at) VALUES (NEW.answer, 'push', NEW.id, strftime('%Y-%m-%dT%H:%M:%SZ','now'));
END;

CREATE TRIGGER IF NOT EXISTS owner_focus_apply_ai AFTER INSERT ON owner_focus
BEGIN
  UPDATE research_queue SET status = 'deferred', error = 'OWNER-FOCUS-1 released ' || NEW.line || ' ' || NEW.stance || ' ' || strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE NEW.stance != 'pause' AND status = 'owner_paused' AND error LIKE 'OWNER-FOCUS-1 paused ' || NEW.line || ' %';
  UPDATE research_queue SET status = 'deferred', error = 'OWNER-FOCUS-1 released ' || NEW.line || ' push wins'
    WHERE NEW.stance = 'push' AND status = 'owner_paused' AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = NEW.line AND lower(research_queue.idea) LIKE t.pattern);
  UPDATE research_queue SET score = MAX(COALESCE(score, 0), 0.95)
    WHERE NEW.stance = 'push' AND status IN ('queued','deferred') AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = NEW.line AND lower(research_queue.idea) LIKE t.pattern);
  UPDATE research_queue SET status = 'owner_paused', error = 'OWNER-FOCUS-1 paused ' || NEW.line || ' ' || strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE NEW.stance = 'pause' AND status IN ('queued','deferred') AND COALESCE(stage, 'ground') = 'ground' AND source NOT IN ('remediation','intent','chat')
      AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = NEW.line AND lower(research_queue.idea) LIKE t.pattern) AND NOT EXISTS (SELECT 1 FROM owner_focus pf JOIN research_line_terms pt ON pt.line = pf.line WHERE pf.stance = 'push' AND lower(research_queue.idea) LIKE pt.pattern);
  INSERT INTO owner_focus_log (line, stance, ask_id, paused_now, pushed_now) VALUES (NEW.line, NEW.stance, NEW.ask_id,
    (SELECT COUNT(*) FROM research_queue WHERE status = 'owner_paused' AND error LIKE 'OWNER-FOCUS-1 paused ' || NEW.line || ' %'),
    CASE WHEN NEW.stance = 'push' THEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued','deferred') AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = NEW.line AND lower(research_queue.idea) LIKE t.pattern)) ELSE 0 END);
END;

CREATE TRIGGER IF NOT EXISTS research_queue_owner_focus_ai AFTER INSERT ON research_queue
WHEN NEW.status IN ('queued','deferred') AND NEW.source NOT IN ('remediation','intent','chat') AND EXISTS (SELECT 1 FROM owner_focus WHERE stance IN ('push','pause'))
BEGIN
  UPDATE research_queue SET score = MAX(COALESCE(score, 0), 0.95)
    WHERE id = NEW.id AND EXISTS (SELECT 1 FROM owner_focus pf JOIN research_line_terms pt ON pt.line = pf.line WHERE pf.stance = 'push' AND lower(research_queue.idea) LIKE pt.pattern);
  UPDATE research_queue SET status = 'owner_paused', error = 'OWNER-FOCUS-1 paused ' || (SELECT pf.line FROM owner_focus pf JOIN research_line_terms pt ON pt.line = pf.line WHERE pf.stance = 'pause' AND lower(NEW.idea) LIKE pt.pattern LIMIT 1) || ' ' || strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE id = NEW.id AND COALESCE(stage, 'ground') = 'ground'
      AND EXISTS (SELECT 1 FROM owner_focus pf JOIN research_line_terms pt ON pt.line = pf.line WHERE pf.stance = 'pause' AND lower(research_queue.idea) LIKE pt.pattern)
      AND NOT EXISTS (SELECT 1 FROM owner_focus pf JOIN research_line_terms pt ON pt.line = pf.line WHERE pf.stance = 'push' AND lower(research_queue.idea) LIKE pt.pattern);
END;

CREATE VIEW IF NOT EXISTS v_owner_focus AS
SELECT l.line, l.label, l.sort, f.stance, f.updated_at AS stance_at,
  (SELECT COUNT(*) FROM research_queue q WHERE q.status IN ('queued','deferred') AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = l.line AND lower(q.idea) LIKE t.pattern)) AS waiting,
  (SELECT COUNT(*) FROM research_queue q WHERE q.status = 'owner_paused' AND q.error LIKE 'OWNER-FOCUS-1 paused ' || l.line || ' %') AS paused_by_owner,
  (SELECT COUNT(*) FROM research_queue q WHERE q.status = 'published' AND q.published_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 days') AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = l.line AND lower(q.idea) LIKE t.pattern)) AS published_30d,
  (SELECT COUNT(*) FROM owner_asks a WHERE a.kind = 'research-line' AND substr(a.ref, 1, length(l.line) + 1) = l.line || '@' AND a.answered_at IS NULL) AS open_asks
FROM research_lines l LEFT JOIN owner_focus f ON f.line = l.line;

INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority, created_at)
SELECT 'research', 'research-line', l.line || '@' || strftime('%Y-%m-%d','now'),
  'Research line: ' || l.label || '. Is it working for you?',
  'In the queue: ' || (SELECT COUNT(*) FROM research_queue q WHERE q.status IN ('queued','deferred','owner_paused') AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = l.line AND lower(q.idea) LIKE t.pattern))
    || ' ideas. Published in the last 30 days: ' || (SELECT COUNT(*) FROM research_queue q WHERE q.status = 'published' AND q.published_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 days') AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = l.line AND lower(q.idea) LIKE t.pattern)) || '.'
    || COALESCE(' Latest: ' || (SELECT substr(substr(q.idea, 1, instr(q.idea || '. ', '. ') - 1), 1, 100) FROM research_queue q WHERE q.status = 'published' AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = l.line AND lower(q.idea) LIKE t.pattern) ORDER BY q.published_at DESC LIMIT 1) || '.', '')
    || COALESCE(' You said last time: ' || (SELECT CASE f.stance WHEN 'push' THEN 'do more' WHEN 'pause' THEN 'pause it' ELSE 'keep it' END FROM owner_focus f WHERE f.line = l.line) || '.', ''),
  '[{"key":"push","label":"Yes, do more of it"},{"key":"keep","label":"Keep it as is"},{"key":"pause","label":"No, pause it"},{"key":"unsure","label":"Not sure"}]', 3, strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM research_lines l
WHERE NOT EXISTS (SELECT 1 FROM owner_asks a WHERE a.kind = 'research-line' AND substr(a.ref, 1, length(l.line) + 1) = l.line || '@'
  AND (a.answered_at IS NULL OR a.answered_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-14 days')));

INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority, created_at)
SELECT 'research', 'research-top', strftime('%Y-W%W','now'), 'Which research line matters most for the next two weeks?',
  'Your pick moves to the front of the research queue. Lines you paused are left out.',
  json_insert((SELECT json_group_array(json_object('key', line, 'label', label)) FROM (SELECT l.line, l.label FROM research_lines l LEFT JOIN owner_focus f ON f.line = l.line WHERE COALESCE(f.stance, 'keep') != 'pause' ORDER BY CASE WHEN f.stance = 'push' THEN 0 WHEN l.line = 'ai-systems' THEN 1 ELSE 2 END, l.sort LIMIT 4)), '$[#]', json_object('key', 'unsure', 'label', 'Not sure')),
  2, strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE (SELECT COUNT(*) FROM research_lines l LEFT JOIN owner_focus f ON f.line = l.line WHERE COALESCE(f.stance, 'keep') != 'pause') >= 2;

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('recall-loop', 'RECALL-LOOP-1: ask the owner about each research line every 14 days and which line matters most each week; answers steer the research queue', 'workflow',
  '{"steps":[
    {"type":"sql","name":"ask-lines","db":"AUDIT","sql":"INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority, created_at) SELECT ''research'', ''research-line'', l.line || ''@'' || strftime(''%Y-%m-%d'',''now''),   ''Research line: '' || l.label || ''. Is it working for you?'',   ''In the queue: '' || (SELECT COUNT(*) FROM research_queue q WHERE q.status IN (''queued'',''deferred'',''owner_paused'') AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = l.line AND lower(q.idea) LIKE t.pattern))     || '' ideas. Published in the last 30 days: '' || (SELECT COUNT(*) FROM research_queue q WHERE q.status = ''published'' AND q.published_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-30 days'') AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = l.line AND lower(q.idea) LIKE t.pattern)) || ''.''     || COALESCE('' Latest: '' || (SELECT substr(substr(q.idea, 1, instr(q.idea || ''. '', ''. '') - 1), 1, 100) FROM research_queue q WHERE q.status = ''published'' AND EXISTS (SELECT 1 FROM research_line_terms t WHERE t.line = l.line AND lower(q.idea) LIKE t.pattern) ORDER BY q.published_at DESC LIMIT 1) || ''.'', '''')     || COALESCE('' You said last time: '' || (SELECT CASE f.stance WHEN ''push'' THEN ''do more'' WHEN ''pause'' THEN ''pause it'' ELSE ''keep it'' END FROM owner_focus f WHERE f.line = l.line) || ''.'', ''''),   ''[{\"key\":\"push\",\"label\":\"Yes, do more of it\"},{\"key\":\"keep\",\"label\":\"Keep it as is\"},{\"key\":\"pause\",\"label\":\"No, pause it\"},{\"key\":\"unsure\",\"label\":\"Not sure\"}]'', 3, strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'') FROM research_lines l WHERE NOT EXISTS (SELECT 1 FROM owner_asks a WHERE a.kind = ''research-line'' AND substr(a.ref, 1, length(l.line) + 1) = l.line || ''@''   AND (a.answered_at IS NULL OR a.answered_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-14 days'')))"},
    {"type":"sql","name":"ask-top","db":"AUDIT","sql":"INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority, created_at) SELECT ''research'', ''research-top'', strftime(''%Y-W%W'',''now''), ''Which research line matters most for the next two weeks?'',   ''Your pick moves to the front of the research queue. Lines you paused are left out.'',   json_insert((SELECT json_group_array(json_object(''key'', line, ''label'', label)) FROM (SELECT l.line, l.label FROM research_lines l LEFT JOIN owner_focus f ON f.line = l.line WHERE COALESCE(f.stance, ''keep'') != ''pause'' ORDER BY CASE WHEN f.stance = ''push'' THEN 0 WHEN l.line = ''ai-systems'' THEN 1 ELSE 2 END, l.sort LIMIT 4)), ''$[#]'', json_object(''key'', ''unsure'', ''label'', ''Not sure'')),   2, strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'') WHERE (SELECT COUNT(*) FROM research_lines l LEFT JOIN owner_focus f ON f.line = l.line WHERE COALESCE(f.stance, ''keep'') != ''pause'') >= 2"},
    {"type":"sql","name":"ledger","db":"AUDIT","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, job, status) SELECT ''recall-loop-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''recall-loop'', ''RECALL-LOOP-1: open owner asks '' || (SELECT COUNT(*) FROM owner_asks WHERE answered_at IS NULL) || '', answered 14d '' || (SELECT COUNT(*) FROM owner_asks WHERE answered_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-14 days'')) || '', focus '' || COALESCE((SELECT group_concat(line || '' '' || stance, '', '') FROM owner_focus), ''none yet''), ''recall-loop'', ''ok''"}
  ]}', 60000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('recall-loop-daily', '20 7 * * *', 'recall-loop', 1, 'UTC', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('session claude/project-thread-fpwyq6 (RECALL-LOOP-1)', 'the owner can tell which research lines work when asked by tap, and his answer should order the research queue',
  'owner_asks queue, research_lines, owner_focus triggers on research_queue, daily recall-loop fleet task', 'owner 2026-11-09 thread; 30-day published mix physics 100 vs ai-operations 15',
  'pending', 'research_queue order and the owner_paused status for lines the owner pauses', 'migration Rollback line: owner_paused rows back to deferred, triggers dropped, task disabled',
  'the fleet learns the owner''s research priorities from tap answers', 'owner_asks_answered_14d >= 9 within 14 d', 'companion Today card, fleet.qnfo.org/focus');
