-- RADAR-CAP-GRADING-1 (2026-10-06, agent_issues 1641, pillar reach; OWNER-NO-LOOSE-ENDS-1). qnfo-cloud-ops 1.21.1 stops
-- grading a mention-radar source that an external per-IP quota blocks (StackExchange: no answer from Cloudflare since
-- 2026-10-02, http:400 then capped:throttle_violation; Workers share egress IPs and the key-less quota is per IP). The blind
-- spot stays visible as this owner card; qnfo-cloud-ops resolves it itself on the first ok StackExchange answer.
-- Idempotent: INSERT OR IGNORE on the slug.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM human_actions WHERE slug = 'stackexchange-key' AND status = 'open';

INSERT OR IGNORE INTO human_actions (slug, title, why, default_in_effect, action, url, sev, due, status, source) VALUES
 ('stackexchange-key',
  'Register a free Stack Apps key so the mention radar can read StackExchange',
  'The radar has never read StackExchange from Cloudflare: without an application key the API allows 300 requests a day per IP address, and Workers share their egress addresses, so every run since 2026-10-02 was refused (capped:throttle_violation). A key lifts the quota to 10,000 a day. The API documents the key as public, not secret.',
  'StackExchange mentions of QNFO are not monitored; the other radar sources (Hacker News, lobste.rs, Bluesky, OpenAlex citations) are, and the run is graded on them.',
  'Register an application at stackapps.com (Apps, register; any name and the domain qnfo.org), then add its key as STACKEXCHANGE_KEY under [vars] in qnfo-cloud-ops/wrangler.toml. The card closes itself on the first radar run that reads StackExchange.',
  'https://stackapps.com/apps/oauth/register', 'normal', NULL, 'open', 'issue:1641');
