-- EMAIL-CLASSIFICATION-PERSONAL-CATCHALL-1 (#1474, 2026-10-01)
-- qnfo-email 2.1.9 classifies alias mail as "personal" only for verified correspondents
-- (contact_ledger, not suppressed, or an exact enabled owner command sender). This backfill applies
-- the same rule to historical rows: 87 unverified rows (58 spam, 29 archived) move to
-- personal-unverified; 26 verified rows (15 archived, 8 replied, 3 processed) stay personal.
UPDATE emails SET classification = 'personal-unverified'
WHERE classification = 'personal'
  AND lower(sender) NOT IN (SELECT lower(email) FROM contact_ledger WHERE COALESCE(suppress, 0) = 0)
  AND lower(sender) NOT IN (SELECT lower(pattern) FROM email_command_senders WHERE COALESCE(enabled, 1) = 1);
