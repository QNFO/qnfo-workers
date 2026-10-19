# Handoff — 2026-10-18

Scope: five changes shipped today, all merged to `main` and live. This file is the record; anything
below that is not verified is labelled as such.

## 1. Papers library: audience shelves (PAPER-AUDIENCE-CATEGORIES-1)

`papers.qnfo.org` filed every paper into five keyword buckets; **"Other" held 161 of 606 (26%)**.
Replaced with nine audience shelves. Live counts: physics 264, mathematics 131, ai-epistemics 43,
qec 40, logic 39, energy 37, synthesis 24, ai-operations 16, assessment 12. No "Other".

- The assigned shelf per paper is **data**: `living-paper.paper_category` (slug, category, secondary,
  confidence, method, why). Fix a wrong shelf with one `UPDATE`, no deploy.
- Legacy `?category=` slugs alias: `other -> synthesis`, `number-theory -> mathematics`,
  `computer-science -> logic`.
- Verify: `curl -s 'https://papers.qnfo.org/papers?category=assessment' | grep -o 'Assessments papers'`

## 2. Interdisciplinary tags (PAPER-TAGS-1)

Multi-label layer over the shelves: 41 controlled tags in three kinds — method (16), topic (18),
use (7) — 1404 assignments over 607 papers, average ~2.3 tags, 64% of papers span more than one kind.

- Data: `living-paper.paper_tag` + `living-paper.tag_registry`.
- Surfaces: tag row on the index (all 41, composes with `?category=` and `?search=`), two tags per
  card, `Tags:` on the paper page, `/papers/tags` catalogue (HTML + `?format=json`), `tags` in the API.
- Verify: `curl -s 'https://papers.qnfo.org/papers?tag=error-correction' | grep -c 'data-tag'`

## 3. Automatic filing (FILING-2)

The daily pass files **both** layers for new papers (shelf + tags), builds the tag prompt from
`tag_registry`, refuses tags outside the vocabulary, and sweeps orphan tag rows. Bounded: 24 papers
per pass, one model call per 12, fail-soft if AI or D1 is unavailable.

- Verify: `SELECT COUNT(*) FROM papers p WHERE p.status IN ('published','distributed','external_preprint') AND NOT EXISTS (SELECT 1 FROM paper_tag t WHERE t.slug=p.slug)` → 0.

## 4. Portfolio autopilot (PORTFOLIO-AUTOPILOT-1)

Portfolio gaps had no lifecycle: the same 62 observations were re-inserted daily and only 3 issues in
the whole tracker had ever come from the portfolio. Now `portfolio_gaps` carries
status/resolved_at/issue_id, and `fleet_tasks.portfolio-autopilot` (+ cron `:20`) closes unobserved or
retired gaps, closes gaps a later verified upgrade supersedes, files issues for actionable gaps
(cap 8, dedup, high for deploy/upgrade), files one umbrella for unmapped work, links and triages to
the owning service with an SLA, and closes gaps when their issue closes.

- Deploy/upgrade were already partly automatic: `cloud_ops_events` shows `UPG-qnfo-evolve verified`
  (compat bump → PR #2046 → deployed → qnfo-ops compat-verify).
- Verify: `SELECT * FROM portfolio_autopilot_runs ORDER BY id DESC LIMIT 3`

## 5. Red gate (RED-GATE-1)

`red_snapshots` already counts red (312 at 12:26 today: 47 breach contracts, 62 conditional,
42 artifact, 90 failed code tasks, 222 open issues). What did not exist was a state that forbids
"clear". The gate publishes `state=working` while `red_total > 0`, escalates red issues with no
movement in 48 h, and makes total idleness itself a critical issue.

- **Units matter:** `agent_issues.created_at/updated_at` are milliseconds; second-based comparisons
  are silently always-false. The migration documents this.
- Verify: `SELECT text FROM cloud_ops_events WHERE kind='red-gate' ORDER BY ts DESC LIMIT 1`

## Open red items (owned, not hidden)

| item | state |
|---|---|
| 2991 deploy-unrecorded qnfo-code-orchestrator | open, high, qnfo-ops |
| 2992 project-stale-deploy W.qnfo-code-orchestrator | open, high, qnfo-ops |
| 2997 deploy-unrecorded qnfo-artifacts | open, high, qnfo-ops |
| 2998 project-stale-deploy W.qnfo-artifacts | open, high, qnfo-ops |
| 2993 no-mapped-work umbrella (62 projects) | open, medium, qnfo-ops |
| 2994 code-task marker for upgrade-compat gaps | open, medium, qnfo-ops |
| red_total 312 | working, by design — the fleet may not claim clear |

PR #1983 (artifacts canonical sync) is open with **6 failing checks** — deliberately not merged.

## Known debts

1. Tags are model-assigned with registry validation, not human-reviewed; `use` tags are judgement.
2. `assessment` is thin (12 papers) — may deserve folding into the fields it reviews.
3. No owner-facing editor for shelves/tags; corrections go through D1.
4. Tags for a paper published after the daily pass land within 24 h, not instantly.
5. The red-gate views/table were created in D1 before this migration existed; the file now reproduces
   them, but any database restored from a snapshot older than this file needs it applied manually.

## Rollback

- Shelves/tags: `UPDATE paper_category SET category=...` / `DELETE FROM paper_tag WHERE slug=...`;
  the code falls back to the keyword classifier if the tables are absent.
- Fleet automations: `UPDATE fleet_crons SET enabled=0 WHERE task_id IN ('portfolio-autopilot','red-gate')`.
- Worker code: revert the merge commit; `worker.js` and `deployed-current.worker.js` must stay
  byte-identical (mirror-guard).
