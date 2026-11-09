-- REPO-CONSOLIDATION-1 (2026-11-09, owner request; rwnq8/agent-operating-system#3 and #5). While consolidating repositories, the fleet read
-- rwnq8/r2-infra scripts/r2_archive_upload.ps1 and scripts/r2_releases_upload.ps1: each holds a bucket-scoped R2 access key id and secret in plain
-- text and in git history. The repository is archived in place (private, read-only) and not folded into public QNFO/qnfo-workers, so the values
-- are copied nowhere. Revoking and minting R2 tokens on the owner's Cloudflare account stays human-gated (credentials), so this is one owner card
-- with its default in effect. No value is written here.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM human_actions WHERE slug = 'r2-infra-rotate-tokens' AND status = 'open';

INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source, created_at, updated_at)
SELECT 'r2-infra-rotate-tokens', 'Replace the two R2 upload tokens that were saved inside the old r2-infra scripts',
 'IDENTITY-BOUND: two bucket-scoped R2 tokens (archive bucket, releases bucket) are written in plain text in the private repository rwnq8/r2-infra and its history. Revoking and creating tokens on your Cloudflare account is a credential step the fleet does not take for you.',
 'The repository is archived and private, so nothing new can be added to it and the values are copied nowhere. The old tokens keep working until revoked.',
 'Open the R2 API tokens page, delete the two tokens named for the archive and releases buckets, create two new bucket-scoped tokens, and paste them only into the rclone config on the computer that runs the upload scripts. Tap Done when finished.',
 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens', 'medium', 'open', 'session:repo-consolidation', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = 'r2-infra-rotate-tokens');
