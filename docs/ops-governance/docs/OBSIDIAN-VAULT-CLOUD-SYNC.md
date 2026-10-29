# Obsidian Vault → Cloud Sync & Knowledge Integration (2026-09-04, v1.1)

Status: LIVE. Claim/evidence/confidence/status per FRAMEWORK-DOGFOOD-1.
v1.1 additions: personal-life ingest triggered & verified; INDEX_TOKEN rotated; indexer bugs documented.

## Topology
D:\Obsidian (local canonical) --obsidian_sync.py (rclone copy --update, 15 min + logon)--> R2 d-drive
prefix obsidian/ --> personal-life-indexer /index?prefix=obsidian (per-folder full-cover) --> personal-life
D1 files/chunks + Vectorize personal-life --> personal twin RAG (personal-api).
Obsidian-writer worker --> obsidian-vault bucket (fleet briefs, separate upstream plane).

## Mechanisms (verified 2026-09-04)
- obsidian_sync.py: push-only mirror driver (rclone --checksum --filter-from; msvcrt lock; run log).
- obsidian_index_trigger.py v1.6: per-day-folder /index drain (scanCap=1000), curl subprocess per folder
  (fresh-process = reliable; long-lived pythonw+urllib stalls observed), resumable state file
  (logs/obsidian-index-folder-state.json), run log obsidian-index-run.log.
- Task Scheduler: QNFO_Obsidian_Sync (every 15 min), QNFO_Obsidian_Index_Daily (06:50 daily, pythonw).
- pl_phase_obsidian.vbs REPOINTED to obsidian_index_trigger.py (was calling missing email-composer
  scripts/obsidian_to_r2.py - skill drift ~2026-08-29).
- HKCU Run keys: Obsidian + ObsidianSync (logon autostart).

## 2026-09-04 findings (evidence in qnfo-audit-adjacent logs/runlogs)
1. INDEX_TOKEN (personal-life-indexer secret) ROTATED 2026-09-04 -> stored in
   .deepchat/secrets/qnfo-agent-tokens.json (index_token). Skill-doc token (plx-idx-v1-...) was STALE
   (401 since indexer redeploy 2026-08-20). PERSONAL-INDEX-AUTH-1 references must be updated.
2. INDEXER PAGE-SKIP BUG (HIGH, owner: personal-life-indexer): indexAll lists 1000 keys/page but
   stops scanning at scanCap and returns the PAGE-END cursor -> every call with scanCap<1000 silently
   skips (1000-scanCap) keys. The 12h cron (scanCap 400, no prefix) therefore only ever maintains the
   first 400 keys of d-drive (all archive/) and NEVER reaches obsidian/ (verified: first 400 keys =
   400 archive, 0 obsidian). Prefix runs with scanCap>=1000 are the only full-cover path today.
   Suggested fix: cursor = position of scanCap break, or loop pages within one call.
3. ERROR-CLASS FILES: subset of md keys (~5-25% per folder in 2025/08-09) error on every embed attempt
   (never registry-recorded -> re-attempted each run; bounded ~1-3s/folder/day). Owner: indexer
   (needs error registry/backoff). Symptom folders: notes/v1/2025/08/20-31 (i=0 k=0 e=all).
4. D1 files.path convention obsidian/<vault-relative>; sig dedupe = size|uploaded-ts.

## Integration status (2026-09-04)
- obsidian/% rows in personal-life D1: 1,631 (2026-08-29) -> 2,524 (02:29Z) -> 3,523 (02:39Z) ->
  climbing during full-cover drain; indexed_at verified 2026-09-04T02:xxZ. Vault notes ARE in the
  personal twin KB path (files -> chunks -> Vectorize personal-life -> twin RAG).
- Category classification caveat: keyword-based (finance/health/...); research notes can mis-classify
  (evidence: p-adic QM.md -> finance). QNFO-side vault consumer still NOT built (recommended worker
  vault-kb-bridge binding d-drive, classify personal|research|both).

## Open items (owner + trigger)
- Verify D1 obsidian/% rows reach ~5-7k after full-cover drain completes (this session).
- Skill docs token refresh: personal-knowledge/SKILL.md INDEX_TOKEN value -> v2 (qnfo-skills repo).
- Indexer page-skip + error-class fixes (owner: personal-life-indexer maintainer).
- QNFO-side consumer (vault-kb-bridge, owner: QNFO fleet, trigger: next ops planning).
