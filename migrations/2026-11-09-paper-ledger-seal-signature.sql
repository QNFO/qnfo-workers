-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: the column stays (nullable, unread when no key is set); to stop signing remove the Worker secret LEDGER_SEAL_KEY / PROVENANCE_SIGNING_KEY from qnfo-lifecycle
-- PAPER-LEDGER-SIGN-1 (agent_issues 1002060, RM-ADR-013-014-ENFORCEMENT-1, charter pillar security): qnfo-lifecycle signs "head_seq:head_hash" of each new seal (HMAC-SHA256, key held as a Worker secret, in neither database)
-- and verifies the newest three seals in plcCheckAnchors. Nullable and append-only as before: the seals_no_update trigger stays, the signature is written in the same INSERT as the seal.
ALTER TABLE paper_ledger_seals ADD COLUMN signature TEXT;
