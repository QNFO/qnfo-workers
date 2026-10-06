-- SIGNAL-INTAKE-SOURCES-1 (2026-10-06, agent_issues 1947 SIGNAL-INTAKE-1; pillar: research). Owner directive 2026-10-06:
-- the Quniverse must consider broader interdisciplinary signals, not only arXiv papers about quantum computing (QNFO) and
-- Hacker News / GitHub (q08). Measured before (qnfo-audit, 30 days to 2026-10-06): `signals` rows by source were
-- artifact_reentry 520, q08 104, reading 49 and nothing else; accepted idea_proposals came from auto-scan (arXiv,
-- qnfo-cloud-ops), auto-reentry and auto-miner only; idea_topic_concentration_30d = 0.596 (breached).
-- radar-hub 1.3.0 (intakeMod) reads radar_sources rows with kind 'signal' once a day, scores every item by lexicon (no
-- model call) and writes the best few, spread across families, into idea_proposals (name intake:<family>). This file
-- holds the sources (data, not code: add a row and the next run reads it), the dedupe ledger, the metric and its
-- trigger (METRIC-CLOSED-LOOP-1: a metric is registered together with its trigger). Idempotent; applied by the session
-- that wrote it; a trigger whose metric has no numeric value yet never fires (hit IS NULL).
-- Rollback: DELETE FROM radar_sources WHERE kind='signal'; DELETE FROM analytics_metric_triggers WHERE metric_key='signal_source_families_7d';
--   DELETE FROM metric_registry WHERE metric='signal_source_families_7d'; DROP TABLE signal_intake_seen;
--   UPDATE radar_sources SET kind='feed', category='news-science' WHERE url='https://www.quantamagazine.org/feed/';

CREATE TABLE IF NOT EXISTS signal_intake_seen (
  url TEXT PRIMARY KEY,
  family TEXT,
  source TEXT,
  title TEXT,
  score REAL,
  accepted INTEGER DEFAULT 0,
  proposal_id INTEGER,
  seen_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_signal_intake_seen_at ON signal_intake_seen (seen_at);

-- Every URL below answered HTTP 200 with a parseable RSS 2.0, RSS 1.0 (RDF) or Atom body on 2026-10-06 (probed from the
-- session that wrote this). Feeds that answered a bot wall, 403, 404 or HTML (Springer search.rss, MDPI, Royal Society,
-- bioRxiv connect, PhilPapers, EurekAlert, SFI, hnrss) are left out; add them when they answer.
-- family = category; cadence 'daily' (the intake reads every enabled signal row each run; the events radar skips kind 'signal').
INSERT OR IGNORE INTO radar_sources (name, url, kind, cadence, category, tags, enabled) VALUES
  ('arXiv cs.AI + cs.CY + cs.HC (AI, computers and society, human factors)', 'https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CY+OR+cat:cs.HC&sortBy=submittedDate&sortOrder=descending&max_results=40', 'signal', 'daily', 'arxiv-ai-society', 'arxiv,ai,society', 1),
  ('arXiv physics.soc-ph + nlin.AO + cond-mat.stat-mech + cond-mat.dis-nn (complexity, self-organisation, statistical mechanics)', 'https://export.arxiv.org/api/query?search_query=cat:physics.soc-ph+OR+cat:nlin.AO+OR+cat:cond-mat.stat-mech+OR+cat:cond-mat.dis-nn&sortBy=submittedDate&sortOrder=descending&max_results=40', 'signal', 'daily', 'arxiv-complexity', 'arxiv,complexity', 1),
  ('arXiv q-bio.NC + q-bio.PE + q-bio.OT (neuroscience, evolution, other biology)', 'https://export.arxiv.org/api/query?search_query=cat:q-bio.NC+OR+cat:q-bio.PE+OR+cat:q-bio.OT&sortBy=submittedDate&sortOrder=descending&max_results=40', 'signal', 'daily', 'arxiv-life-mind', 'arxiv,biology,mind', 1),
  ('arXiv econ.TH + cs.GT + econ.GN (economic theory, games, general economics)', 'https://export.arxiv.org/api/query?search_query=cat:econ.TH+OR+cat:cs.GT+OR+cat:econ.GN&sortBy=submittedDate&sortOrder=descending&max_results=40', 'signal', 'daily', 'arxiv-economics-games', 'arxiv,economics', 1),
  ('arXiv math.LO + cs.LO + physics.hist-ph + math.HO (logic, history and philosophy of physics and mathematics)', 'https://export.arxiv.org/api/query?search_query=cat:math.LO+OR+cat:cs.LO+OR+cat:physics.hist-ph+OR+cat:math.HO&sortBy=submittedDate&sortOrder=descending&max_results=40', 'signal', 'daily', 'arxiv-logic-philosophy', 'arxiv,logic,philosophy', 1),
  ('arXiv cs.DL + stat.OT + cs.SI (digital libraries, metascience, social and information networks)', 'https://export.arxiv.org/api/query?search_query=cat:cs.DL+OR+cat:stat.OT+OR+cat:cs.SI&sortBy=submittedDate&sortOrder=descending&max_results=40', 'signal', 'daily', 'arxiv-metascience', 'arxiv,metascience', 1),
  ('arXiv cs.ET + physics.app-ph + cs.PF + cs.AR (emerging technologies, applied physics, performance, architecture: the energy of computing)', 'https://export.arxiv.org/api/query?search_query=cat:cs.ET+OR+cat:physics.app-ph+OR+cat:cs.PF+OR+cat:cs.AR&sortBy=submittedDate&sortOrder=descending&max_results=40', 'signal', 'daily', 'arxiv-computing-energy', 'arxiv,energy,computing', 1),
  ('LessWrong curated', 'https://www.lesswrong.com/feed.xml?view=curated-rss', 'signal', 'daily', 'community-lesswrong', 'community,epistemics,ai', 1),
  ('Alignment Forum curated', 'https://www.alignmentforum.org/feed.xml?view=curated-rss', 'signal', 'daily', 'community-alignment-forum', 'community,ai,safety', 1),
  ('Aeon essays', 'https://aeon.co/feed.rss', 'signal', 'daily', 'essays-aeon', 'essays,philosophy,science', 1),
  ('Nature (current issue)', 'https://www.nature.com/nature.rss', 'signal', 'daily', 'journal-nature', 'journal,science', 1),
  ('Science news (AAAS)', 'https://www.science.org/rss/news_current.xml', 'signal', 'daily', 'news-science', 'news,science', 1),
  ('MIT Technology Review', 'https://www.technologyreview.com/feed/', 'signal', 'daily', 'news-mit-technology-review', 'news,technology,ai,energy', 1),
  ('Ars Technica science', 'https://feeds.arstechnica.com/arstechnica/science', 'signal', 'daily', 'news-ars-technica-science', 'news,science', 1),
  ('Phys.org latest', 'https://phys.org/rss-feed/', 'signal', 'daily', 'news-phys-org', 'news,physics,science', 1),
  ('PLOS Computational Biology', 'https://journals.plos.org/ploscompbiol/feed/atom', 'signal', 'daily', 'journal-plos-computational-biology', 'journal,biology,computation', 1),
  ('PNAS (current issue)', 'https://www.pnas.org/action/showFeed?type=etoc&feed=rss&jc=pnas', 'signal', 'daily', 'journal-pnas', 'journal,science', 1),
  ('ScienceDaily top science', 'https://www.sciencedaily.com/rss/top/science.xml', 'signal', 'daily', 'news-sciencedaily', 'news,science', 1),
  ('Frontiers in Complex Systems', 'https://www.frontiersin.org/journals/complex-systems/rss', 'signal', 'daily', 'journal-frontiers-complex-systems', 'journal,complexity', 1);
-- Quanta Magazine was row 3 (kind 'feed', category 'news-science'), which only the events radar read, as if it were a venue
-- page. It is a signal feed: re-classed here (UNIQUE(url) forbids a second row). The events radar never used it as a venue.
UPDATE radar_sources SET kind='signal', category='magazine-quanta', cadence='daily', tags='magazine,mathematics,physics,biology' WHERE url='https://www.quantamagazine.org/feed/';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES ('signal_source_families_7d', 'fleet', 'leading',
  'COUNT(DISTINCT family) FROM signal_intake_seen WHERE accepted=1 AND seen_at >= now-7d: interdisciplinary source families (radar_sources kind signal) that produced an accepted idea_proposals row in the last 7 days (radar-hub SIGNAL-INTAKE-SOURCES-1, daily 08:30Z, no model call)',
  'qnfo-audit.signal_intake_seen (radar-hub intake run ledger cloud_ops_events signal-intake-<day>)',
  '0 (2026-10-06: every signal came from arXiv quantum, artifact re-entry, q08 or reading)',
  '>= 5 distinct families a week (SIGNAL-INTAKE-1, owner directive 2026-10-04 and 2026-10-06)',
  'radar-hub', 'trigger: fewer than 3 families -> METRIC-TRIGGER issue (migrations/2026-10-06-signal-intake-sources.sql)', 'daily', '< 5', '< 3', 'MEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'signal_source_families_7d', 'Research gap: fewer than 3 interdisciplinary signal families reached the idea intake this week', 'registry', 'lt', 3, 6,
  'Pillar research (SIGNAL-INTAKE-SOURCES-1, owner directive 2026-10-06: broader interdisciplinary signals, not only arXiv quantum and HN/GitHub). Fewer than 3 radar_sources families of kind signal produced an accepted idea_proposals row in 7 days. Read GET https://radar-hub.q08.workers.dev/intake (RADAR_TOKEN) or SELECT meta FROM cloud_ops_events WHERE id LIKE ''signal-intake-%'' ORDER BY ts DESC LIMIT 3. Levers in order: (1) the run did not happen (no signal-intake row for 2 days): radar-hub 08:30Z slot or the worker is down, see /health; (2) sources answer errors (meta.sources error:*): fix or replace the URL in radar_sources (a feed that moved, a bot wall), never delete the only row of a family; (3) sources answer but nothing passes (candidates 0 with items > 0): the lexicon in radar-hub intakeMod STRONG/WEAK is too narrow for those feeds, widen it with terms from the owner corpus (papers.qnfo.org titles), or lower nothing else; (4) ops_config signal_intake_enabled=0 or signal_intake_max_per_run too low. Never add a model call to the intake while a fleet_budget cap is breached. Definition of done: metric_registry.signal_source_families_7d >= 3 on two consecutive days; record before and after in issue_triage.close_evidence. If the remedy does not move the metric within 7 days, say so on the issue and try a different lever.',
  'radar-hub', 'agent_issues', 24, 1, 'SIGNAL-INTAKE-SOURCES-1 (migrations/2026-10-06-signal-intake-sources.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'signal_source_families_7d');

-- Closing probe for SIGNAL-INTAKE-1 (agent_issues 1947), the part this migration delivers: the intake ran within 48h and
-- at least 3 families produced accepted rows in 7 days. The hourly remediation tick closes nothing by itself here (the
-- issue keeps the other contract its earlier session wrote); this row exists so the claim is checkable (SESSION-RECORD-1).
INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status)
VALUES ('signal-intake-sources-1', 1947,
  'radar-hub 1.3.0+ deployed; radar_sources holds kind=signal rows',
  'observe only: radar-hub intakeMod runs daily at 08:30Z in the existing slot; a failed probe is a METRIC-TRIGGER on signal_source_families_7d',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT MAX(ts) FROM cloud_ops_events WHERE id >= ''signal-intake-'' AND id < ''signal-intake.'') IS NULL THEN ''pending: intake has not run'' WHEN (SELECT MAX(ts) FROM cloud_ops_events WHERE id >= ''signal-intake-'' AND id < ''signal-intake.'') < strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-48 hours'') THEN ''stale: last intake run older than 48h'' WHEN (SELECT COUNT(DISTINCT family) FROM signal_intake_seen WHERE accepted=1 AND seen_at >= datetime(''now'',''-7 days'')) < 3 THEN ''families_7d under 3'' ELSE ''ok'' END AS observed',
  'd1-query', 3, 'radar-hub', 24, 'active')
ON CONFLICT(class) DO UPDATE SET issue_id=excluded.issue_id, precondition=excluded.precondition, action=excluded.action, verify_probe=excluded.verify_probe, status='active';
