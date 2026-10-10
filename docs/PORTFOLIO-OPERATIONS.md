# Portfolio operations (PORTFOLIO-OPS-1)

How docs/STRATEGY.md is run, every day, as an ongoing project. Owner directive 2026-10-01: manage the entire fleet and
portfolio (programmes, projects, products) and its performance, reach, reputation and ROI, on the system's own authority.
**Runs on Cloudflare, not on claude.ai** (owner directive 2026-10-01: the dashboard and its data must not depend on
continued Claude usage). The deterministic duties below (owner-voice guard, kill switches, scorecard snapshot, run log,
owner action list) run as a daily cron in qnfo-fleet-dashboard (`portfolioDailyRun`). The claude.ai Routines that used to
run this procedure (`trig_01KNd7qpeeLwKdWAoKCmDSTt`, `trig_01QXd2AG8oTevkuVRsfZyHG4`), the daily fleet issue sweep and every
session check-in were disabled on 2026-10-01 at the owner's direction. Judgement work runs on the fleet's own Cloudflare
agents: qnfo-fleet-control `evolveTick` (anchored PRs from `agent_issues`), the code loop, the issue pipeline that the
owner's queued tasks and card notes now enter as `agent_issues` rows (OWNER-NOTES-ROUTE-1), and OBJECTIVE-REVISION-APPLY-1
(owner-ratified objective changes, applied by qnfo-fleet-dashboard). An agent session the owner starts is an optional contributor; no step below waits for one.
Any run may improve this file through a pull request; the improvement is part of the job.

## 1. The system of record
| What | Where | Who changes it |
|---|---|---|
| Strategy, identity rules, channels, scorecard, portfolio, targets | `docs/STRATEGY.md` | this procedure (PR) |
| Profile copy, CV, opportunities, the owner's approvals and to-dos | the private D1 `qnfo-identity` (table `owner_docs`, key `identity`; bound only to qnfo-fleet-dashboard) and `owner_actions`, read at fleet.qnfo.org/owner and edited at /owner/edit/identity behind the owner's login (each save keeps the replaced version) | the owner; the Monday identity review reports, never edits |
| Open work | D1 `qnfo-audit.agent_issues` (+ `issue_triage`) | everyone; close only with evidence |
| Gates and metrics | D1 `impact_thresholds`, `metric_registry`, `objectives`, `shutdown_manifest` | this procedure, with a STRATEGY reference |
| Run log | D1 `qnfo-audit.portfolio_runs` (row 1 = the 2026-10-01 baseline) | each run appends one row |
| Launch content | `docs/outreach/` | this procedure |
| Live state | fleet.qnfo.org (`/roi`, `/api/state`), worker `/health` routes | the fleet |

Other recurring work, and the split so nothing runs twice (all of it on Cloudflare crons; CLOUDFLARE-ONLY-HOST-1):
- **Fleet defects** (hourly): qnfo-fleet-control `evolveTick` turns open `agent_issues` into anchored PRs, and
  qnfo-backlog-exec (01:10 UTC) closes or reopens them with evidence. This procedure does not sweep general defects; it
  takes only STRATEGY-tagged issues (source or title naming STRATEGY, whoever filed them) and reach/ROI work.
- **Identity weekly review** (IDENTITY-WEEKLY-1, Mondays after 06:00 UTC, qnfo-fleet-dashboard on its existing `*/15` cron,
  once a day via the `cloud_ops_events` row `identity-weekly-<day>`): Bluesky, Mastodon, ORCID, GitHub and
  OpenAlex metrics; live bios against the canonical copy and the STRATEGY 2.2 never-claim list; deadline and page checks
  for every opportunity; funder and employer replies by domain and subject. It writes one `portfolio_runs` row (kind
  `identity-weekly`), opens one urgent owner queue card when something is urgent, and never edits the Identity doc or a
  public profile.
- Agent sessions are optional contributors and nothing on this list waits for one. Nothing is scheduled on claude.ai
  (no Routines, no check-ins); a session that wants to follow its PR relies on GitHub events while it is open.

## 2. Daily run (every day)
Steps 2, 4 and 7 run unattended in `portfolioDailyRun`. Steps 1, 3, 5 and 6 are what a contributor does with that run
(the fleet's code loop and issue loop, or an optional session); none of them blocks the cron.
1. **Orient.** Read `CLAUDE.md`, `docs/STRATEGY.md`, this file, the last 3 `portfolio_runs` rows, open PRs, and open
   STRATEGY-tagged agent_issues (source or title naming STRATEGY). Skip anything another contributor is visibly working on
   (an open PR or a comment within the last 2 hours).
2. **Protect the owner's name** (before anything else ships):
   - Bluesky `qnfo.bsky.social`, last 24 h (public AppView `getAuthorFeed`): every post on-pillar, no mojibake
     (`Ã`, `â€`, `â\x80`), no q08 essay, within cadence (1-2/week).
   - `outreach_log`, last 24 h: opt-out line present, no `Re:` follow-ups, at most 8 a day in total.
   - On a violation: set the stream's kill switch (`pipeline_state.external_sends_enabled`, the social pause flag), file
     one agent_issue with the evidence, and say so in the run summary.
3. **Ship.** Drive STRATEGY PRs to merge: CI green, conflicts resolved by merging main, VERSION bumped, mirrors identical.
   After a deploy, confirm the version on `/health` and do the post-deploy step its issue names (for example #1710: re-enable
   `external_sends_enabled`, drop the D1 trigger `q08_personal_channel_hold`). Close issues only with a live measurement.
4. **Measure.** Read whatever scorecard sources are live (STRATEGY 6.3): RUM pageviews (fleet.qnfo.org/roi), confirmed
   subscribers (both lists), outreach sends and replies, Bluesky engagement, OpenAlex citations, credibility events; GA4
   and Search Console once the owner grants access. Never fill a missing source from memory; write `null`.
5. **Advance one thing end to end.** Pick the highest-value open item by (reach or credibility gained) / effort, in this
   order unless the data says otherwise: owner-name protection, measurement (REACH-SIGNALS-INGEST-1, POST-ID-UTM-1),
   distribution (LINKEDIN-BUFFER-DRAFTS-1), discoverability (SCHOLAR-PDF-URL-1, front-end fixes), cost (gateway AI to
   $60/30d, direct-provider throttles), then the plan in STRATEGY 10. Branch from main, implement, validate locally, PR,
   merge when green, verify live.
6. **Distribute.** Queue only approved content (`docs/outreach/`, owner voice approved in the Identity doc): Bluesky
   automatically within cadence; LinkedIn as Buffer drafts for the owner's one-tap approval. Store each post's id and
   UTM campaign.
7. **Log and report.** Append one `portfolio_runs` row (summary, scorecard JSON, actions JSON, needs_owner). Finish with a
   summary of at most 12 lines: what shipped, scorecard changes, risks, and the owner-only items still open.

## 3. Weekly (Mondays, after the daily run)
The Monday `portfolio_runs` row (kind `weekly-cron`) carries the 7- and 28-day KPI deltas unattended; the rest of this
section is contributor work that reads it.
- Scorecard trend over 7 and 28 days; update STRATEGY section 1 "Where we are" and the section 9 progress column.
- Distribution allocation for the coming week (STRATEGY 6.4): which selected works, formats and slots, from the attributed
  results. Until the bandit is built, choose by hand from the data and record the reasoning in the run row.
- Outreach by segment: reply rate per segment; any segment under 1% after 50 sends stops.
- Search loop once Search Console is connected: low-CTR pages get new titles and descriptions; log each change.
- Read this week's `portfolio_runs` row of kind `identity-weekly` and the Identity doc's tracker; act on anything it
  approved or flagged.

## 4. Monthly (the 1st)
- Portfolio review against STRATEGY section 7: invest, maintain, reposition or retire each line, with the numbers.
- Cost review: total monthly cost (about $725 on 2026-09-26) by source, against the targets in section 8.
- Funding and career pipeline: deadlines in the next 45 days and their state (Identity doc Opportunities).
- The report of record is the `portfolio_runs` row of kind `monthly-cron` written on the 1st (scorecard, deltas, owner
  actions), read at fleet.qnfo.org. A one-page write-up in `docs/reports/YYYY-MM.md` (decisions, next month's three
  priorities) is a contributor's addition, not a dependency.

## 5. Dates that drive the plan
| Date | What |
|---|---|
| 2026-10-06 | first launch post (docs/outreach/launch-queue-2026-10.md), if the owner has approved the voice |
| 2026-10-07 | Identity doc tracker item 1: owner approves brand line, bios, CV |
| 2026-10-15 | Maryland Travel Survey teaming deadline (Identity doc lead 4) |
| 2026-10-31 | q08 review (agent_issues 1716); Foresight AI for Science Nodes and Corrigibility Fund deadlines |
| 2026-11-03 | NLnet Restack Fund deadline 12:00 CET (rewrite by 2026-10-20, owner submits by 2026-11-02) |
| 2026-12-31 | review gate (STRATEGY 9) |

## 6. Owner-only actions (keep this list current; repeat it in every run summary until done)
1. Approve the brand line, bios and CV in the Identity doc (tracker item 1).
2. Connect LinkedIn (and optionally Mastodon, Threads, X) in Buffer; then approve each LinkedIn draft with one tap.
3. Google Analytics 4: add the fleet's service account as Viewer; share the property ID. Search Console: verify qnfo.org
   and add the same account as a Full user.
4. (Retired 2026-10-01: no claude.ai connectors are needed; everything runs on Cloudflare.)
5. Ask one established arXiv author in the field for a personal endorsement (not a mass request).
6. Add the selected works (STRATEGY 2.4) to ORCID with "Search & link".

## 7. Guardrails (in addition to CLAUDE.md)
- STRATEGY section 5 owner-voice gates; LinkedIn posts always need the owner's tap.
- Never: raise a spend cap; mint, rotate or overwrite a credential; delete data; disable a guard; bypass the canonical
  deploy; change the owner's name, bio, CV or public profiles; send an application or an email to a funder or employer.
- Secrets follow the lease rule in CLAUDE.md (#1701). A run that would need a secret it cannot read records the blocker and
  moves on.
- A number in a summary comes from a live read in that run, with its source; a gap is reported as a gap.
