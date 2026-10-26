-- ERRATA-REMEDIATION-MERGE-1 (2026-10-26, session rem-a1, pillars research and cost; agent_issues 1000293 and 1000292). Data side of qnfo-research-exec 0.37.0 (PR 4755).
--   1. ERRATA-ROUTE-PER-PAPER-1: routing made one remediation row per erratum and a remediation row is a full rewrite of the paper through the pipeline. 233 unclaimed errata rows (queued or deferred, claimed_at NULL) cover
--      149 papers, so 84 of them repeat a rewrite that another row for the same paper does. For each paper with several, the oldest row keeps its place and takes the errata text of the others (one idea that lists every erratum,
--      at most 6,000 characters); the others become wontfix, stage parked, with the id of the row that carries them and a revert line. Nothing is deleted; rows already claimed are not touched.
--   2. PAPER-CONFIRM-FALLBACK-1: the confirm read only the first 24,000 characters of a paper; 100 PAPER-LEARN-1 errata were rejected, 21 with a window reason ('not in the excerpt', 'not provided'), 15 of them with a quotation the new
--      confirm can find. Those 15 return to internal-open (errata_queue and internal_errata) with their earlier verdict kept in internal_errata.remediation and a marker line, so each is confirmed again on the passage it quotes.
--      The confirm bar is unchanged; a row the new window still cannot support is rejected again, and a marked row is never reopened twice. Cost: about 15 confirm calls (about 4,000 neurons).
-- Backups: bak_20261026_errata_rem_merge (all 233 rows as they were), bak_20261026_errata_reopen (the 15 rows with their earlier status and note).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_errata_rem_merge
-- Rollback: UPDATE research_queue SET status = (SELECT b.status FROM bak_20261026_errata_rem_merge b WHERE b.id = research_queue.id), stage = (SELECT b.stage FROM bak_20261026_errata_rem_merge b WHERE b.id = research_queue.id), idea = (SELECT b.idea FROM bak_20261026_errata_rem_merge b WHERE b.id = research_queue.id), error = (SELECT b.error FROM bak_20261026_errata_rem_merge b WHERE b.id = research_queue.id) WHERE id IN (SELECT id FROM bak_20261026_errata_rem_merge); UPDATE errata_queue SET status = 'rejected' WHERE id IN (SELECT id FROM bak_20261026_errata_reopen) AND status = 'internal-open'; UPDATE internal_errata SET status = 'rejected', remediation = (SELECT b.remediation FROM bak_20261026_errata_reopen b WHERE b.internal_id = internal_errata.id) WHERE id IN (SELECT internal_id FROM bak_20261026_errata_reopen);

-- backups first (a replay keeps the first copy)
CREATE TABLE IF NOT EXISTS bak_20261026_errata_rem_merge AS SELECT id, source_id, paper_slug, status, stage, idea, error, claimed_at, created_at FROM research_queue WHERE source = 'remediation' AND source_id LIKE 'errata:%' AND status IN ('queued', 'deferred') AND claimed_at IS NULL AND paper_slug IS NOT NULL;
CREATE TABLE IF NOT EXISTS bak_20261026_errata_reopen AS SELECT q.id AS id, q.subject AS internal_id, q.status AS status, q.updated_at AS updated_at, i.status AS internal_status, i.remediation AS remediation FROM errata_queue q JOIN internal_errata i ON i.id = q.subject WHERE q.status = 'rejected' AND q.source = 'internal_audit' AND (instr(lower(i.remediation), 'excerpt') > 0 OR instr(lower(i.remediation), 'provided') > 0 OR instr(lower(i.remediation), 'not present') > 0) AND (instr(q.claim, char(39)) > 0 OR instr(q.claim, '"') > 0 OR instr(q.claim, char(8220)) > 0) AND instr(q.claim, 'At: "') = 0 AND instr(COALESCE(i.remediation, ''), 'PAPER-CONFIRM-FALLBACK-1') = 0;

-- 1a. the oldest row of each paper takes the errata text of the others
UPDATE research_queue
   SET idea = substr(idea || char(10) || char(10) || 'ERRATA-ROUTE-PER-PAPER-1 merged errata of the same paper (one rewrite resolves all of them):' || (
         SELECT group_concat(char(10) || '- ' || substr(replace(d.idea, char(10), ' '), 1, 700), '')
           FROM research_queue d
          WHERE d.paper_slug = research_queue.paper_slug AND d.source = 'remediation' AND d.source_id LIKE 'errata:%' AND d.status IN ('queued', 'deferred') AND d.claimed_at IS NULL AND d.id <> research_queue.id), 1, 6000)
 WHERE source = 'remediation' AND source_id LIKE 'errata:%' AND status IN ('queued', 'deferred') AND claimed_at IS NULL AND paper_slug IS NOT NULL
   AND instr(idea, 'ERRATA-ROUTE-PER-PAPER-1 merged errata') = 0
   AND NOT EXISTS (SELECT 1 FROM research_queue o WHERE o.paper_slug = research_queue.paper_slug AND o.source = 'remediation' AND o.source_id LIKE 'errata:%' AND o.status IN ('queued', 'deferred') AND o.claimed_at IS NULL AND (o.created_at < research_queue.created_at OR (o.created_at = research_queue.created_at AND o.id < research_queue.id)))
   AND EXISTS (SELECT 1 FROM research_queue d WHERE d.paper_slug = research_queue.paper_slug AND d.source = 'remediation' AND d.source_id LIKE 'errata:%' AND d.status IN ('queued', 'deferred') AND d.claimed_at IS NULL AND d.id <> research_queue.id);

-- 1b. the others are parked with the id of the row that carries them
UPDATE research_queue
   SET status = 'wontfix', stage = 'parked', claimed_at = NULL,
       error = 'ERRATA-ROUTE-PER-PAPER-1: merged into ' || (SELECT k.id FROM research_queue k WHERE k.paper_slug = research_queue.paper_slug AND k.source = 'remediation' AND k.source_id LIKE 'errata:%' AND k.status IN ('queued', 'deferred') AND k.claimed_at IS NULL AND instr(k.idea, 'ERRATA-ROUTE-PER-PAPER-1 merged errata') > 0 ORDER BY k.created_at, k.id LIMIT 1) || ' (same paper; its errata text is carried by that row and one rewrite resolves all of them). Revert: status queued, stage ground, see bak_20261026_errata_rem_merge'
 WHERE source = 'remediation' AND source_id LIKE 'errata:%' AND status IN ('queued', 'deferred') AND claimed_at IS NULL AND paper_slug IS NOT NULL
   AND instr(idea, 'ERRATA-ROUTE-PER-PAPER-1 merged errata') = 0
   AND EXISTS (SELECT 1 FROM research_queue k WHERE k.paper_slug = research_queue.paper_slug AND k.source = 'remediation' AND k.source_id LIKE 'errata:%' AND k.status IN ('queued', 'deferred') AND k.claimed_at IS NULL AND k.id <> research_queue.id AND instr(k.idea, 'ERRATA-ROUTE-PER-PAPER-1 merged errata') > 0);

-- 2. window-reason rejections return to internal-open (history kept)
UPDATE errata_queue SET status = 'internal-open', updated_at = created_at
 WHERE status = 'rejected' AND source = 'internal_audit' AND id IN (SELECT b.id FROM bak_20261026_errata_reopen b)
   AND NOT EXISTS (SELECT 1 FROM internal_errata i WHERE i.id = errata_queue.subject AND instr(COALESCE(i.remediation, ''), 'PAPER-CONFIRM-FALLBACK-1') > 0);
UPDATE internal_errata SET status = 'open',
       remediation = substr(COALESCE(remediation, '') || char(10) || 'PAPER-CONFIRM-FALLBACK-1 ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (reopened): the first verdict read only the first 24,000 characters of the paper and gave a window reason; the confirm now centres its window on the passage the claim quotes, so it is confirmed again. The earlier verdict stays above.', 1, 4000),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE status = 'rejected' AND id IN (SELECT b.internal_id FROM bak_20261026_errata_reopen b) AND instr(COALESCE(remediation, ''), 'PAPER-CONFIRM-FALLBACK-1') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a1', 'one remediation row per paper is enough because the pipeline rewrites the whole paper from the idea text, so the errata of one paper belong in one brief; re-confirming a rejection that rested on a window the checker could not see lowers no bar', 'ERRATA-REMEDIATION-MERGE-1: merged the unclaimed errata remediation rows of each paper into its oldest row (84 rows parked with the carrying id), and reopened the PAPER-LEARN-1 rejections that gave a window reason for a confirm on the quoted passage', 'research_queue 2026-10-26 18:20Z: 233 unclaimed rows (queued 174, deferred 59) over 149 papers, none claimed or published since 2026-10-18; errata_queue: 100 internal_audit rejections, 21 with a window reason, 15 of them quoting a passage; 448 of 556 internal-open claims carry no At: anchor; replay of the new confirm on 10 real long papers: the first window held the quoted passage 0 of 40 times, the new window 40 of 40', 'applied by migration', 'research_queue (84 rows parked, 149 rows kept), errata_queue and internal_errata (15 rows each); no paper, no worker change', 'the Rollback line of migrations/2026-10-26-errata-remediation-merge.sql restores both sets from the backup tables', 'the research queue carries one rewrite per paper; a rejection that could not see its passage is judged again', 'the research queue holds 149 unclaimed errata rows instead of 233 (content_items_over_stage_sla falls by the parked rows); the 15 reopened errata are settled by the next confirm ticks, some confirmed', 'research quality: errata are judged on the text they quote', 'research_queue, errata_queue, internal_errata read on 2026-10-26; the offline suite replays the file on node:sqlite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log x WHERE x.action LIKE 'ERRATA-REMEDIATION-MERGE-1:%');
