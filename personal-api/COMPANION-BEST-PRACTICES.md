# Companion best practices: what the research says and what changed

Written 2026-10-19 for the Personal Companion (personal-api 4.11.0). The companion that went live in 4.10.0 already did
several things the research recommends: one small step at a time, no tasks on a low day, a shared daily cap with quiet
hours, fixed crisis lines on risk language, and full export and delete. This note lists the evidence and the eight
changes that follow from it.

## What the evidence says

1. **Behavioral activation works, and the mechanism is the link between doing and feeling.** Digital behavioral
   activation (BA) reduces depression and anxiety symptoms in meta-analyses
   ([Internet BA, JMIR 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10251223/);
   [digital BA, 2025](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12227033/)). The active ingredient is scheduling
   activities and rating how they felt (enjoyment and achievement), so the person sees which activities lift their mood
   and chooses those first. A fixed "go for a walk" suggestion is a weaker version of that.
2. **Just-in-time nudges should be tailored, sparse, and keep learning.** The JITAI framework (Nahum-Shani et al.) asks
   for decision points, tailoring variables, a "do nothing" option and a proximal outcome per nudge. Micro-randomized
   trials ([design paper](https://arxiv.org/pdf/2005.05880)) show that the effect of a nudge type changes over time, so
   a system that stops trying a nudge forever after a bad week cannot notice when it starts working again.
3. **Engagement with mental-health apps falls off fast.** Median 15-day retention is about 4%
   ([Baumel et al., JMIR 2019](https://jmir.org/2019/9/e14567)). What keeps people engaged is personal relevance,
   low effort, a sense of being accompanied, and control over when the app reaches out, not streaks or pressure.
4. **Safety planning is the evidence-based crisis tool.** The Stanley-Brown Safety Planning Intervention (warning
   signs, coping, distraction, people, professionals, a safer space, reasons for living), written in the person's own
   words, reduces suicidal behaviour, and electronic versions are used and valued
   ([written vs electronic trial](https://clinicaltrials.gov/study/NCT04026308);
   [app evaluation](https://pmc.ncbi.nlm.nih.gov/articles/PMC6618059)). Crisis lines alone are necessary but generic.
5. **Measure with a validated instrument, and route to people when it stays low.** The WHO-5 Well-Being Index is five
   items about the last two weeks, scored 0 to 100; under 50 means poor well-being and 28 or less is the usual
   depression screening cut-off, and a 10-point change is meaningful
   ([WHO-5](https://www.psytoolkit.org/survey-library/who5.html)). Daily 1-5 taps track the day, not the trend.
6. **AI companions can deepen loneliness when they replace people.** The MIT and OpenAI studies of 2025 found the
   heaviest chatbot users reported more loneliness and emotional dependence (correlational)
   ([summary](https://www.analyticsvidhya.com/blog/2025/03/impact-of-ai-chatbots/)). Good practice: be honest that it is
   an AI, do not flatter, and act as a bridge to friends, family and a GP.
7. **Mental-health data is special-category data.** Minimise what is kept, keep it private on the lock screen, and let
   the person see, export and delete it. Raw voice recordings are the most sensitive and least needed once transcribed.

## What changed in personal-api 4.11.0

| Evidence | Change |
|---|---|
| 1 | After "Did it", the companion asks how it felt (enjoyment and achievement, 1-5). An activity bank across movement, nature, connection, mastery, pleasure and rest, plus your own ideas. Shapeless-day suggestions and low-day care draw on what you rated as helping. The Data tab shows "what helps" and your mood on days with and without a rated activity. |
| 4 | A safety plan you write in your own words (Data tab). Every crisis reply shows it right after the crisis lines. |
| 5 | Every two weeks, the WHO-5 (about a minute). A score of 28 or less, or two readings under 50 in a row, adds a gentle suggestion to talk to your GP (huisarts). It never diagnoses. |
| 3 | A pause button: 4 hours, 1 day or 3 days of no reach-outs. Only a single care message after risk words still goes out. |
| 2 | A nudge type that was retired for never landing gets one fresh try a week instead of staying off for a month. |
| 6 | One gentle nudge toward a real person when nothing social has shown up for four days (never on thin data). The chat persona is honest about being an AI, does not flatter, and points to people and the GP when things stay hard. |
| 7 | Care and presence notifications show "A note for you" on the lock screen; the text is in the app. Raw voice notes are deleted after 30 days; the transcript stays. The new data is in the privacy view, export and delete-everything. |

All of it runs inside the existing personal API on Cloudflare (D1 `personal-life`, the companion Durable Object, R2
`personal-media`), with no new worker, binding, cron or secret. 145 automated checks cover it.

## Settings (in `wellbeing_config`)

`discreet_push` care / all / off (default care) · `media_retention_days` (30, 0 keeps everything) ·
`measure_every_days` (14) · `retire_retry_days` (7) · `pause_until` (set by the pause button) · `safety_plan` (set on
the Data tab).
