-- PREFIX-CACHE-1 (2026-10-12, pillar cost; issue 2011 TP-4 lever 2 "cache_read_tokens written to ai_spend_ledger").
-- Measured 2026-10-12: every Workers AI response read through the API reports usage.prompt_tokens_details.cached_tokens = 0,
-- and the ledger has no column for it, so prefix caching could not be seen even if it worked. qnfo-ai 5.35.0 sends the
-- x-session-affinity header (the documented switch for prefix caching) and adds the cached input tokens of each call to this
-- column in a statement of its own, so the ledger row is written whether or not this file has been applied.
-- GET https://qnfo-ai.q08.workers.dev/spend reports router.prefix_cache.cached_tok_30d from it.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: ALTER TABLE ai_spend_ledger DROP COLUMN cached_tok

ALTER TABLE ai_spend_ledger ADD COLUMN cached_tok INTEGER DEFAULT 0;
