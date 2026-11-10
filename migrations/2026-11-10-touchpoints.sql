-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS touch_targets; DROP TABLE IF EXISTS touch_actions; DELETE FROM owner_asks WHERE kind IN ('touch-account','touch-topic') AND answered_at IS NULL; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('touchpoints_7d','touch_reciprocation_30d','touch_stale_follows'); DELETE FROM metric_breach_cause WHERE metric_key IN ('touchpoints_7d','touch_reciprocation_30d','touch_stale_follows'); DELETE FROM metric_registry WHERE metric IN ('touchpoints_7d','touch_reciprocation_30d','touch_stale_follows');
-- spof-review: new tables only. qnfo-social (Bluesky, Mastodon, LinkedIn and X tap items) and qnfo-fleet-dashboard (GitHub, the /touch page) write them; if either worker is down its platform's touchpoints pause and nothing else depends on them. No new cron, host or credential.
-- CAUSE-MAPPED: the three metrics map to the existing cause key `publishing` (the reach metrics' cause) in this same file.
--
-- TOUCHPOINTS-1 (owner, 2026-11-10, charter pillar reach): "Make sure I'm following people that matter who can promote me who actually pay attention to their followers ... I don't want stale anything.
-- If I'm going to star a repo, I want them to know that I'm starring it ... all of that needs a complete overhaul for what we're doing now. Autonomous systems."
-- touch_targets is the scored model of people and repositories (one row per platform and handle, every score with its evidence); touch_actions is the ledger of every follow, like, star,
-- prune, reply draft and tap item with its outcome (follow-back, reply), so the engine learns which sources reciprocate.

CREATE TABLE IF NOT EXISTS touch_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,            -- bluesky | mastodon | github | github-repo | x | linkedin
  handle TEXT NOT NULL,              -- bsky handle, mastodon acct, github login, owner/repo
  ext_id TEXT,                       -- did, mastodon account id
  name TEXT, bio TEXT, url TEXT,
  followers INTEGER, following INTEGER,
  last_post_at TEXT, posts_30d INTEGER, reply_share REAL,
  relevance REAL, activity REAL, attentiveness REAL, reach REAL, score INTEGER,
  topics TEXT,                       -- comma list of matched topic keys
  quantum_only INTEGER DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'candidate', -- candidate | followed | pruned | dismissed
  known INTEGER DEFAULT 0,           -- owner said he knows this person (never pruned)
  follow_ref TEXT,                   -- bluesky follow record uri
  followed_by INTEGER DEFAULT 0,     -- they follow the owner's account
  source TEXT,                       -- discovery query or 'following'
  evidence_json TEXT,
  scored_at TEXT, followed_at TEXT, pruned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(platform, handle)
);
CREATE INDEX IF NOT EXISTS touch_targets_state ON touch_targets(platform, state, score);

CREATE TABLE IF NOT EXISTS touch_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  target TEXT NOT NULL,              -- touch_targets.handle
  kind TEXT NOT NULL,                -- follow | unfollow | like | reply | star | unstar | gh-follow | gh-unfollow | tap-follow
  mode TEXT NOT NULL,                -- auto | approve (one tap posts it) | tap (the owner does it on the platform)
  status TEXT NOT NULL,              -- proposed | approved | done | skipped | refused | failed
  text TEXT,                         -- reply or suggested comment
  url TEXT,                          -- where the tap goes
  subject TEXT,                      -- the post or repo acted on (uri, url, owner/repo)
  grounding TEXT,                    -- the live text a draft is grounded on
  note TEXT,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  decided_at TEXT, done_at TEXT,
  outcome TEXT, outcome_at TEXT      -- followed-back | replied | liked-back | none
);
CREATE INDEX IF NOT EXISTS touch_actions_day ON touch_actions(platform, kind, day);
CREATE INDEX IF NOT EXISTS touch_actions_status ON touch_actions(status, mode);

-- Prompted recall (PROMPTED-RECALL-1): two taps on fleet.qnfo.org/focus steer the engine. qnfo-social reads the answers.
INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority) VALUES
 ('reach', 'touch-account', 'bluesky', 'Should the fleet follow and like people from the QNFO Bluesky and Mastodon accounts (qnfo.bsky.social, mstdn.science)?', 'Those are the accounts the fleet already posts from. A personal account would need its own app password.', '[{"key":"yes","label":"Yes, use those"},{"key":"personal","label":"No, I have a personal one"},{"key":"unsure","label":"Not sure"}]', 2),
 ('reach', 'touch-topic', 'first', 'Which people should your follows and stars favour first?', 'Ultrastable is an autonomous development platform; you study how autonomous AI systems behave, fail and are governed.', '[{"key":"oversight","label":"AI oversight and governance"},{"key":"evals","label":"Agent evaluation and safety"},{"key":"devplatform","label":"Agentic development platforms"},{"key":"systems","label":"Systems research"},{"key":"unsure","label":"Not sure"}]', 2);

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('touchpoints_7d', 'surface', 'target', 'touch_actions done in 7 days that reach a person (follow, like, reply, star, tap-follow; prunes excluded)', 'qnfo-audit.touch_actions, written by qnfo-social and qnfo-fleet-dashboard (TOUCHPOINTS-1)', '0 on 2026-11-10 (engine new)', '>= 20', 'qnfo-social', 'analytics_metric_triggers -> agent_issues', 'hourly', 'none', 'none', 'PENDING', NULL),
 ('touch_reciprocation_30d', 'surface', 'target', 'follows done 3 to 30 days ago whose target followed back or replied / all such follows; null under 10', 'qnfo-audit.touch_actions outcome, read from the platforms by qnfo-social and qnfo-fleet-dashboard', 'null on 2026-11-10', '>= 0.15', 'qnfo-social', 'analytics_metric_triggers -> agent_issues', 'hourly', 'none', 'none', 'PENDING', NULL),
 ('touch_stale_follows', 'surface', 'guard', 'followed or starred targets that are stale (no post or push in 120 days) or quantum-only and not yet pruned', 'qnfo-audit.touch_targets', 'unmeasured on 2026-11-10', '<= 10', 'qnfo-social', 'analytics_metric_triggers -> agent_issues', 'hourly', 'none', 'none', 'PENDING', NULL);

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('touchpoints_7d', 'publishing', 'TOUCHPOINTS-1: the engagement engine that makes the owner visible to the right people'),
 ('touch_reciprocation_30d', 'publishing', 'TOUCHPOINTS-1: whether the people the fleet follows notice the owner'),
 ('touch_stale_follows', 'publishing', 'TOUCHPOINTS-1: stale and quantum-era follows and stars');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'touchpoints_7d', 'Touchpoints: fewer than 20 a week reach the people who matter', 'registry', 'lt', 20, 3,
  'Pillar reach. Read touch_actions for the last 7 days by platform and status: a platform with refused rows needs its token scope (an IDENTITY-BOUND card), one with no candidates needs discovery queries (TOUCH_QUERIES in qnfo-social), one with proposed tap items needs the /touch page surfaced. Never raise the daily caps above TOUCH_CAPS to meet the number.',
  'qnfo-social', 'agent_issues', 24, 1, 'TOUCHPOINTS-1'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'touchpoints_7d');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'touch_reciprocation_30d', 'Touchpoints: under 15 percent of follows are noticed', 'registry', 'lt', 0.15, 3,
  'Pillar reach. Compare reciprocation by touch_targets.source (discovery query) and by attentiveness band: move weight to the sources that reciprocate (touchQueryOrder), raise TOUCH_FOLLOW_MIN, or weigh attentiveness higher in touchScore. The reply share of a target is the attentiveness evidence.',
  'qnfo-social', 'agent_issues', 72, 1, 'TOUCHPOINTS-1'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'touch_reciprocation_30d');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'touch_stale_follows', 'Touchpoints: stale or quantum-era follows and stars remain', 'registry', 'gt', 10, 3,
  'Pillar reach. The prune step (touchPrune in qnfo-social, touchGithubPrune in qnfo-fleet-dashboard) removes up to 10 a day per platform; a count that does not fall means a refused write (read touch_actions status refused) or a mutual follow kept on purpose.',
  'qnfo-social', 'agent_issues', 24, 1, 'TOUCHPOINTS-1'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'touch_stale_follows');
