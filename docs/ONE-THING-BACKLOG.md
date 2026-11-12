# One Thing / Focus backlog and roadmap

Owner request: productive activity without required typing, with Yes/No controls, one-tap choices, checklists, and no additional LLM spend.

## Architecture (fixed)

- Product surface: **Focus** inside `https://me.q08.org/companion`.
- Canonical source: `QNFO/qnfo-workers`, `personal-api/companion.js` (inlined into `personal-api/worker.js`); `deployed-current.worker.js` is the byte-identical mirror.
- Runtime: existing `personal-api` Cloudflare Worker on the `quniverse` account.
- State: existing D1 `tasks`, `cmp_activities`, and `cmp_activity_log` tables through existing authenticated APIs. Timer and handoff progress are session-local; the cost checklist and preferences are browser-local only, not cross-device sync.
- Delivery: pull request to `main`, then the existing `canonical-deploy.yml` / `qnfo-ops` deployment path.
- Cost: no model call, new Worker, database, binding, route, subscription, or mirrored ticket system.

## Closeout — native Focus follow-through

- [x] Keep Focus inside the existing companion with button/checklist controls and visible keyboard focus.
- [x] Offer 5 / 15 / 30-minute choices. Recommendations use existing actions and activities APIs, include only next actions that fit the time and selected energy, and filter activities by active state, duration, and energy.
- [x] Provide a local start / pause / resume / reset timer. It is optional, ephemeral, and makes no background request.
- [x] Record completion through the existing action and activity APIs.
- [x] Copy a one-click session handoff with the current goal, completed items, an eligible next action, and time/energy/checklist constraints. The read and clipboard write occur only after the button is pressed.
- [x] Keep the free token/subscription checklist in this browser only. It makes no provider calls, purchases, or subscription changes.
- [x] Keep the existing Data-tab export and delete APIs.
- [x] Keep one-tap Qniverse presets in the existing action backlog.

## Explicitly rejected

- [x] Restore from a backup file: rejected for now because the current export spans related personal stores, while the companion has no validated, transactional, conflict-safe restore path. A file picker alone would not prevent partial or unsafe writes; no import route or UI is added.
- [x] Duplicate voice capture beside Focus: the existing Capture flow already supports voice, and a duplicate adds no evidenced benefit.
- [x] Rank recommendations from activity ratings: defer until Focus usage evidence supports changing recommendation order.
- [x] Calendar-aware suggestions: not needed for this follow-through and no Focus usage evidence calls for it.
- [x] Home-screen shortcuts: defer until usage evidence shows Focus is the main entry point.
- [x] Standalone or localhost prototype: not deployed; it is not the canonical UI.

## Canonical path

Open `https://me.q08.org/companion`, choose **Focus**, and use its time/energy choices, timer, checklist, and handoff buttons. Use **Data → Download everything** for a portable export. The standalone prototype remains undeployed. Changes ship only through a pull request and the canonical deployment workflow.

## Zero typing and visible cost (COMPANION-NO-TYPING-1, owner 2026-10-29)

Owner, 2026-10-29 (dictated): "I'm not going to fill in any free text ... if you want free text from me ... ask me to dictate";
"I need yes, no buttons ... checklists"; "if I keep using LLMs, the cost keeps adding up"; "write it to backlogs". The owner's
therapist raised possible autism on 2026-10-28: structure, clear finish lines and predictable choices, no open-ended prompts.
Idleness is distressing, so "what can I do right now" must always have an answer.

Shipped in personal-api 4.33.0 (companion 1.18.0):

- [x] Dictate beside every box that takes words (Talk, Journal, Capture). The phone records, the server writes the words with
      Workers AI Whisper (`POST /companion/api/dictate`, nothing stored). Browser speech recognition is not used: it does not
      work for the owner.
- [x] Journal: one-tap lines (Got something done, Went outside, Talked to someone, Learned something, Rested, Hard day).
- [x] Today opens with "What can I do right now?": Give me one thing (Focus), Read something (mind.q08.org pick), Talk (dictate).
- [x] AI cost as one number: `GET /companion/api/ai-use` reads personal-api's rows of `qnfo-audit.ai_call_counters` (counts
      only) for today and the last 7 days, priced at Workers AI list price ($0.011 per 1,000 neurons). Shown on Focus and Data.

Backlog (`agent_issues` 1001637-1001643, family `COMPANION-NO-TYPING-1:*`; the fleet is the doer):

1. [ ] **Videos** (`COMPANION-NO-TYPING-1:videos`): a curated `q08-mind/data/videos.json` (talks and explainers on how minds
       work, autism and ADHD from autistic and clinical authors, no guru material), `/now?kind=video` and a "Watch something"
       button on Today. Deterministic, no model. Each URL checked live before it is added.
2. [x] **Do tab without typing** (`:do-tab`): preset next-action chips (tidy one surface, a 10-minute walk, reply to one
       message, one Qniverse task) and Dictate for the title; the minutes box becomes 5/15/30 buttons.
3. [x] **Dictate everywhere else** (`:dictate-rest`): Learn card front/back and each safety-plan field get Dictate.
4. [ ] **Qniverse 15-minute tasks from the fleet backlog** (`:qniverse-tasks`): Focus offers one item a person can do in a
       quarter hour (rate a post, read a new paper's abstract and tap good/unclear, check one fleet.qnfo.org card), read
       from the open queue, Done/Not now, no typing.
5. [ ] **Cheaper Talk** (`:talk-cost`): answer the common one-tap asks (what's on today, what's next) from D1 without a model
       call; cache identical asks for 10 minutes; daily AI-use number on Today when above $0.10.
6. [x] **Home-screen shortcut** (`:shortcut`): manifest `shortcuts` entry that opens Focus directly.
7. [x] **Repair two red suites** (`:red-suites`): `companion-reading.test.mjs` (guide no longer lists the reading pick) and
       `companion-travel.test.mjs` fail on main as of 2026-11-04, before this change.

Items 2 and 3 shipped in personal-api 4.36.0 (companion 1.19.0); 6 and 7 shipped in 4.35.0 (PR 6963: manifest shortcuts, both
suites green).

## What the companion was missing (COMPANION-GAPS-1, owner 2026-11-04)

Owner, 2026-11-04: "What are you missing? You're never done ... Do it ... ALWAYS AND AUTOMATICALLY". Read from live D1 the same
day: the owner is signed in on a phone and a PC (since 29 Oct), the phone takes notifications, and 16 notes were captured, most
of them on 4 Nov. What the record showed, and what 4.36.0 did about it:

- [x] **The phone went silent** (`COMPANION-ONE-THING-PUSH-1`). With check-ins off (PR 6436) the companion only sends an
      upcoming appointment, a due task or a matched event; none existed, so the last notification was 2 Nov 07:01 while open next
      actions waited. Now, once a day between 11:00 and 17:00, after two quiet hours and nothing done yet, one open next action
      is offered as one plain line with Did it / Not today. Never a feelings question; quiet hours, pause, cap and thumbs-down hold.
- [x] **"Go to Foam today" had no date** (`COMPANION-DUE-WORDS-1`). today/tonight/tomorrow and vandaag/vanavond/morgen set the
      due date when the sorter leaves it empty. No model.
- [x] **The same note saved two or three times** (`COMPANION-CAPTURE-DEDUPE-1`). Three photo titles were captured again as text
      within a minute, each paid a sorting call. The same words within 30 minutes now return the earlier item, store nothing and
      call no model.
- [x] **Voice asked the owner to type** (`COMPANION-VOICE-FALLBACK-1`). When on-phone recognition fails or hears nothing, the
      quick-add mic records and the server writes the words down, then saves the note.
- [x] **Costly fallback model** (`TWIN-FALLBACK-CHEAP-1`). Two deepseek-v4-pro fallback answers on 4 Nov cost as much as 44
      flash answers; the fallback is now deepseek-v4-flash (a third of the input price), deepseek-v4-pro last.

Still open (`agent_issues`, family `COMPANION-GAPS-1:*`, the fleet is the doer):

1. [x] **Dictated asks for the Quniverse stay in the personal inbox** (`:fleet-asks`). On 4 Nov the owner dictated four requests
       about the fleet (own assistant and vector store, APK, more virtual-agent roles, Workers AI input-token cost); the sorter
       made each a personal project and nothing else read them. A project-type capture gets a one-tap "Send to the Quniverse"
       button that files an `agent_issues` row with the owner's words (only on that tap: the personal/research separation holds).
2. [x] **Sorting call is large** (`:clarify-cost`). flash calls average about 6,300 input tokens. Short notes (six words or fewer,
       or a verb first) are sorted by `heuristicClarify` without a model; the sorter prompt is trimmed; measured in
       `ai_call_counters` against 4 Nov.
3. [x] **Silence watchdog** (`:silence-watch`). A failure-mode detector reads `personal-life.companion_nudges`: a signed-in phone
       with a live push subscription and open next actions that has had no push for 48 hours files an issue on its own.

All three shipped in personal-api 4.36.0 (PR 7009): Send to the Quniverse (COMPANION-TO-FLEET-1, a card on Today and a button in
the inbox), short-note sorting by rules (COMPANION-CLARIFY-SHORT-1), and the hourly self-check (COMPANION-SELFCHECK-1).

## The companion checks itself (COMPANION-SELFCHECK-1)

Gap-hunting no longer depends on a session. Once an hour the companion's own tick runs `selfCheck` (plain D1 reads, no model)
and keeps one `agent_issues` row titled `COMPANION-SELFCHECK-1:<check>` per problem, filed when the check goes bad and closed
through `issue_triage` with the measurement when it recovers. Checks: `push-silence` (signed-in phone, open next actions, no
push for 48 h), `push-failing`, `inbox-stuck` (unsorted over an hour), `feelings-ask` (a feelings question while check-ins are
off), `duplicate-captures`, `fleet-asks-waiting`. `GET /companion/api/selfcheck` shows the current state. A new rule the owner
sets gets its check added to `SELF_CHECKS` in the PR that implements the rule.

## Best-practice review (COMPANION-BEST-PRACTICE-1, owner 2026-11-12)

Owner: "what are cutting-edge players doing ... keep incorporating new". Sources read 2026-11-12: neurodivergent-design principles
(optional supports, one thing at a time, explicit transitions, no shame, calm default, day recap), 2026 mental-health app feature
surveys (grounding and panic flows, mood-dip forecasting, context-aware timing, crisis detection), EU AI Act Article 50 (AI disclosure
from 2 Aug 2026, repeated at distress or attachment) and Article 5 (no exploiting vulnerability). Already live and matching: behavioural
activation with ratings, WHO-5, safety plan, pause, honest-AI persona, discreet push, export and delete, offline, no typing.

- [x] **Overwhelm reset** (`COMPANION-CALM-1`): one-tap "Calm down" on Today: 4-hour pause, paced breathing, 5-4-3-2-1, better/same/worse
      saved as a rest activity so "what helps" learns; reduced-motion safe; Worse shows 113 and the safety plan. personal-api 4.42.6.
- [x] **Evening recap** (`COMPANION-RECAP-1`): one card after 19:00 listing today's done items, activities and mood, plus "carry nothing (shipped personal-api 4.43.0: `recapFor`, card after 19:00, Let today go)
      over" for the rest. Source: cmp_activity_log, tasks. No model. code-task: repo=qnfo-workers path=personal-api/companion.js
- [x] **Explicit transitions** (`COMPANION-TRANSITION-1`): a "next up in 10 minutes" heads-up before appointments, naming what comes next.  (shipped 4.43.0: `cmp-soon` push 20 minutes before a timed event, names what follows)
- [x] **Low-mood forecast from own data** (`COMPANION-FORECAST-1`): rule-based (two low days plus short sleep) gentle reach-out; no model; measure against next-day mood. (shipped 4.43.0: `lowMoodForecast`, two low days plus under 6 h night; prediction stored as `forecast:<day>` for scoring)
- [ ] **AI reminder at distress** (`COMPANION-AIDISCLOSE-1`): repeat "I am an AI" once when a risk or heavy-mood reply is sent (Art. 50).
- [ ] **Calm-tool outcome metric** (`COMPANION-CALM-MEASURE-1`): add a SELF_CHECKS entry when Worse outweighs Better over 14 days.
- [ ] **Quarterly re-scan** (`COMPANION-RESCAN-1`): re-read the sources above plus new regulation and leading apps, append findings here.

### Scan added 2026-11-12 (owner's cutting-edge scan; the owner's daily mood check-in stays, it overrides "no mood solicitation")
- [x] **One source of truth** (`COMPANION-ONE-TRUTH-1`): a decision made anywhere (reply flag, done, pause) updates every surface from the same D1 row; a self-check compares Today with the row. (shipped 4.43.0: done/Did it close every ask and task that name each other; screens reload after a decision)
- [x] **Silence unless actionable** (`COMPANION-SILENCE-1`): Today shows only items with an action; no pinned wellbeing clutter, no repeated asks (the daily mood check-in is kept). (shipped 4.43.0: button-less check-ins hidden once mood is in, zero counts and footer removed)
- [x] **Plain language only** (`COMPANION-PLAIN-1`): no ids, raw logs or machine output on Today; a test scans rendered Today text for them. (shipped 4.43.0: `PLAIN_BAD`, phone journey `today-plain-language`, self-check `today-plain`)
- [x] **Self-owned defects** (`COMPANION-SELFFIX-1`): extend SELF_CHECKS so a defect is filed, fixed and closed with only "done" reported. (shipped 4.43.0: `selfHeal` repairs stale asks hourly; only unrepairable defects file an issue)

## MIND-IN-COMPANION-1 (2026-11-12)
Mind is part of Today (personal-api 4.45.0). Static cards in `personal-api/companion.js` (`MIND_CARDS`), one linted fleet-written card a day in D1 `cmp_mind_cards` (`mindGrow`, status `rejected` rows count refusals), votes in `cmp_mind_votes`. mind.q08.org (q08-mind 2.4.0) redirects to me.q08.org/companion#mind; feeds and `/health` stay.
Next, in code: `code-task: repo=qnfo-workers path=personal-api/companion.js` add a metric `mind_cards_rejected_7d` and a metric for helps/not-for-me votes per card; retire cards voted down twice.
