-- CF-CAPABILITY-DECIDE-1 tls (agent_issues 1003039, GitHub QNFO/qnfo-workers#10875; charter pillar autonomy, security).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261111_cf_capability_tls
-- Rollback: UPDATE cloudflare_capability_catalog SET status = (SELECT b.status FROM bak_20261111_cf_capability_tls b WHERE b.k = 'tls'), linked_issue = CAST((SELECT b.v FROM bak_20261111_cf_capability_tls b WHERE b.k = 'tls') AS INTEGER), when_to_choose = (SELECT b.w FROM bak_20261111_cf_capability_tls b WHERE b.k = 'tls') WHERE slug = 'tls' AND EXISTS (SELECT 1 FROM bak_20261111_cf_capability_tls b WHERE b.k = 'tls')
-- CAUSE-MAPPED: no metric is registered here; this edits one catalog row.
--
-- Evidence (read 2026-11-11 through GET /zones/<id>/settings for all 16 account zones): 12 zones (empoweringchange.today, ipatent.me, q08.org, qnfo.net, qnfo.org, qnfo.uk,
-- q-wave.tech, qwave.tech, qwav.net, qwav.org, qwav.tech, qwav.uk) run ssl=strict, min_tls_version=1.2, always_use_https=on, TLS 1.3 on or zrt. The 4 ultrastable.* zones run
-- ssl=full, min_tls_version=1.0, always_use_https=off. Decision: in_use for the fleet zones; the ultrastable.* settings are a recorded gap, not a fleet surface.

CREATE TABLE IF NOT EXISTS bak_20261111_cf_capability_tls (k TEXT PRIMARY KEY, status TEXT, v TEXT, w TEXT);
INSERT OR IGNORE INTO bak_20261111_cf_capability_tls (k, status, v, w) SELECT slug, status, CAST(linked_issue AS TEXT), when_to_choose FROM cloudflare_capability_catalog WHERE slug = 'tls';

UPDATE cloudflare_capability_catalog
SET status = 'in_use', linked_issue = 1003039,
    when_to_choose = COALESCE(when_to_choose, '') || ' | CF-CAPABILITY-DECIDE-1 2026-11-11 (agent_issues 1003039): in_use. Read from the zone settings API on 2026-11-11: 12 of 16 account zones (every qnfo.*, q08.org, qwav.*, qwave.tech, q-wave.tech, ipatent.me, empoweringchange.today) run ssl=strict, min_tls_version=1.2, always_use_https=on, TLS 1.3 on or zrt. Gap: the 4 ultrastable.* zones run ssl=full, min_tls_version=1.0, always_use_https=off; whether they carry fleet traffic was not checked.',
    last_synced = datetime('now')
WHERE slug = 'tls' AND instr(COALESCE(when_to_choose, ''), 'CF-CAPABILITY-DECIDE-1 2026-11-11') = 0;
