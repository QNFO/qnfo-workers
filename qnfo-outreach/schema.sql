-- qnfo-outreach D1 schema (schema.sql) - applied 2026-09-03, additive to legacy tables
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  org TEXT,
  role TEXT,
  audience TEXT,
  tags TEXT,
  source TEXT,
  source_ref TEXT,
  first_seen TEXT,
  last_contacted TEXT,
  contact_count INTEGER DEFAULT 0,
  suppress INTEGER DEFAULT 0,
  suppress_reason TEXT,
  status TEXT DEFAULT 'new'
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT,
  audience TEXT,
  template_key TEXT,
  subject_template TEXT,
  body_template TEXT,
  channel TEXT DEFAULT 'email',
  status TEXT DEFAULT 'active',
  starts_at TEXT,
  daily_cap INTEGER DEFAULT 5,
  total_cap INTEGER DEFAULT 40,
  followup_days INTEGER,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT,
  contact_id INTEGER,
  kind TEXT,
  channel TEXT DEFAULT 'email',
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'draft',
  message_id TEXT,
  sent_at TEXT,
  reply_to_id INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  send_id INTEGER,
  contact_id INTEGER,
  from_addr TEXT,
  subject TEXT,
  body TEXT,
  classified_as TEXT,
  routed_to_user INTEGER DEFAULT 0,
  auto_replied INTEGER DEFAULT 0,
  received_at TEXT
);
CREATE TABLE IF NOT EXISTS rfc_topics (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT,
  question TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS rfc_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rfc_topic TEXT,
  contact_id INTEGER,
  from_email TEXT,
  question TEXT,
  answer TEXT,
  received_at TEXT
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT,
  target TEXT,
  payload_ref TEXT,
  status TEXT DEFAULT 'drafted',
  submitted_at TEXT,
  evidence TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS funnel_daily (
  day TEXT PRIMARY KEY,
  mined INTEGER DEFAULT 0,
  drafted INTEGER DEFAULT 0,
  sent INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  opted_out INTEGER DEFAULT 0,
  submissions INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pipeline_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
