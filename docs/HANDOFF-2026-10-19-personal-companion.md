# Handoff: the Personal Companion runs on the fleet (2026-10-19)

Owner request in the Personal Companion project: "CLOSEOUT THIS THREAD AND HANDOFF ALL WORK SERVER-SIDE TO CLOUDFLARE
QUNIVERSE FLEET". Charter pillar: `personal`. COMPANION-FLEET-HANDOFF-1.

State at handoff: **personal-api 4.12.0** (deployment_history 1667, 04:58:36 UTC) and **personal-companion 1.31.1**
(deployment_history 1668, 04:58:42 UTC), both through the canonical path. Nothing about the companion runs in, reads
from or depends on claude.ai.

## What was built

| PR | Version | What it added |
|---|---|---|
| [2587](https://github.com/QNFO/qnfo-workers/pull/2587) | personal-api 4.10.0 | `/companion`: capture (text, voice, photos), next actions, mood and energy check-ins, journal, flashcards, one suggested action a day, Web Push from the companion Durable Object on a 15-minute alarm sharing the wellbeing ladder's budget (max 3 a day, none at night), crisis lines (113, 0800-0113, 112), nudge learning, export and delete |
| [2594](https://github.com/QNFO/qnfo-workers/pull/2594) | personal-api 4.11.0 | behavioral-activation ratings and an activity bank, a Stanley-Brown safety plan in every crisis reply, two-weekly WHO-5 with a gentle GP (huisarts) suggestion, pause, weekly retry of retired nudges, a social nudge after four quiet days, honest AI persona, discreet lock-screen pushes, voice recordings deleted after 30 days. Evidence: `personal-api/COMPANION-BEST-PRACTICES.md` |
| [2602](https://github.com/QNFO/qnfo-workers/pull/2602) | personal-api 4.12.0, personal-companion 1.31.1 | the 13 red-team fixes below, 38 new assertions (companion.test.mjs 185, wellbeing.test.mjs 149) |

## What runs where

| Job | Runs on | Writes to |
|---|---|---|
| Morning check-in (cmp-checkin, 08:30-12:00 without a mood) and evening reflection (cmp-reflect, 19:30-21:45 without a journal entry) | companion Durable Object in personal-api, 15-minute alarm (`planNudge`) | D1 `personal-life` (`wellbeing_checkins`, nudge ledger) |
| E-mail ladder: check-in, asks, weekly review; skipped while paused | personal-companion hourly cron | D1 `personal-life` |
| Tick heartbeat | each companion tick | `personal-life.wellbeing_config.cmp_last_tick`; agent_issues 100031 COMPANION-HEARTBEAT-1 probes it (d1-query@personal-life, under 45 minutes) |
| Model calls | Workers AI through the AI Gateway | none outside the personal plane |
| Media | R2 `personal-media`, prefix `companion/` | voice expires after 30 days |

The project's two claude.ai routines ("Morning check-in" 08:58 and "Evening reflection" 20:57, Europe/Berlin) are disabled;
neither ever fired. The project check-in log held one placeholder entry with no answer from the owner, so nothing was
imported. The owner's time zone is assumed to be Europe/Berlin (Dutch crisis lines, message times); the companion reads
it from `wellbeing_config`.

## Red-team (2026-10-19)

Fixed in PR 2602: curly apostrophes and missing English and Dutch risk phrasings; care and presence never retire; a plain
safety check-in naming 113 after risk words, with the lines on Today for 24 hours; mirrored pushes wait out quiet hours;
the pause stops the e-mail ladder; receptive hours reopen after three days without an optional nudge; tool-call syntax and
role labels stripped from captured text; chat rows and crisis rows in export and delete; crisis ledger rows hidden from
Today; a warm fixed reply when the model is down; the lock-screen setting on the Data tab; the stalled-tick notice.

Kept by design (decision_log `COMPANION-FLEET-HANDOFF-20261019:`): crisis lines show on negated or quoted risk words (a
false alarm costs less than a miss); photos are kept until deleted; no lockout on wrong API keys (a lockout could keep the
owner out on a bad day); presence mode sends one "I'm here" a day while asks go unanswered.

## Open work, handed to the fleet

| Issue | Doer | Closes when |
|---|---|---|
| COMPANION-CRISIS-PARITY-1 (high): personal-companion's e-mail reply matcher lacks the apostrophe and Dutch fixes; it waited on PR 2589 | code loop (`code-task` on `personal-companion/wellbeing.js`, then `scripts/inline-companion-modules.mjs`) | code-probe: `personal-companion/worker.js` contains `zelfmoord` |
| COMPANION-CONTEXT-QUERY-URL-1 (medium): `GET /companion/api/context?q=` puts the owner's words in a logged URL | code loop (`code-task` on `personal-api/companion.js`, then `personal-api/inline-companion.mjs`) | code-probe: the GET route is absent from `personal-api/worker.js` |
| 100031 COMPANION-HEARTBEAT-1 | remediation tick | `cmp_last_tick` under 45 minutes old |
| 100028 TRAVEL-PLANNER-DEPLOY-1 (PR 2589, a separate project) | stale-PR lane | its runtime probe |

All four are rows in `qnfo-audit.agent_issues` (the first two filed by `migrations/2026-10-19-companion-fleet-handoff.sql`).
This session's record is in `session_records` under `session_01NzewstG2ZVyaKp17FfXYDt`.

## Notes for the next change

- Edit `personal-api/companion.js` and re-run `node personal-api/inline-companion.mjs`; edit `personal-companion/wellbeing.js`
  and re-run `node scripts/inline-companion-modules.mjs`. Each deploy uploads `worker.js` as one module.
- Personal data stays in `personal-life`, `personal-media` and the companion Durable Object. Nothing about the owner's
  mood, words or captures goes into `qnfo-audit`; the issues above name code, never content.
- The work-lock endpoint on q08.workers.dev was unreachable from this session's container (proxy 403), so this PR adds
  only new files and no claim was taken.
