-- NO-CLAUDE-RUNTIME-DEPENDENCY-1 (owner directive 2026-10-01): an owner queue card (qnfo-audit.human_actions) never routes
-- work to Claude or links claude.ai / anthropic.com. Three cards written directly into D1 by sessions told the owner
-- "Claude can do it in your signed-in Chrome"; the dashboard's safeLink check only covers its own /api/human route, so the
-- rule is enforced in D1 for every writer. Applied live 2026-10-01 15:35Z (verified: a test insert was refused, 0 rows).
CREATE TRIGGER IF NOT EXISTS human_actions_no_claude_ins BEFORE INSERT ON human_actions
WHEN COALESCE(NEW.action,'') LIKE '%Claude%' OR COALESCE(NEW.why,'') LIKE '%Claude%' OR COALESCE(NEW.default_in_effect,'') LIKE '%Claude%'
  OR COALESCE(NEW.title,'') LIKE '%Claude%' OR COALESCE(NEW.url,'') LIKE '%claude.ai%' OR COALESCE(NEW.url,'') LIKE '%anthropic.com%'
BEGIN SELECT RAISE(ABORT, 'NO-CLAUDE-RUNTIME-DEPENDENCY-1: an owner queue card never routes work to Claude or links claude.ai/anthropic.com; describe what the owner does on Cloudflare (fleet.qnfo.org) or on the site itself'); END;
CREATE TRIGGER IF NOT EXISTS human_actions_no_claude_upd BEFORE UPDATE OF action, why, default_in_effect, title, url ON human_actions
WHEN COALESCE(NEW.action,'') LIKE '%Claude%' OR COALESCE(NEW.why,'') LIKE '%Claude%' OR COALESCE(NEW.default_in_effect,'') LIKE '%Claude%'
  OR COALESCE(NEW.title,'') LIKE '%Claude%' OR COALESCE(NEW.url,'') LIKE '%claude.ai%' OR COALESCE(NEW.url,'') LIKE '%anthropic.com%'
BEGIN SELECT RAISE(ABORT, 'NO-CLAUDE-RUNTIME-DEPENDENCY-1: an owner queue card never routes work to Claude or links claude.ai/anthropic.com; describe what the owner does on Cloudflare (fleet.qnfo.org) or on the site itself'); END;
