# Prompted recall (PROMPTED-RECALL-1, owner directive 2026-11-09)

The owner recognizes experience and preferences when asked, but cannot recall them from scratch or type them out.
Every fleet surface that needs to learn something from the owner asks a prompted-recall question instead of an
open-ended one. Reference implementation: `qnfo-jobsearch/worker.js` (`recallQuestion`, `recallAnswer`,
`recallQueue`, `RECALL_UI_JS`), tested by `qnfo-jobsearch/recall.test.mjs`.

## Question shape
- One question at a time, answered by tapping: **Yes / No / Not sure**. Never a free-text box.
- A concrete cue under the question: the sentence that triggered it (a posting line, a paper title, a calendar entry),
  or named places and examples ("Think of the FHWA Tour-Based Model").
- A yes leads to at most two more taps, each multiple choice: where (chips built from the owner's own record) and
  how much (for example led / hands-on / on the team).
- Each final button shows the exact sentence it will save. Nothing reaches an output the owner did not tap.

## Answer storage
- Answers live with the canonical record they change (for jobs: the CV bank `b.recall[key]` in D1, versioned by
  `jobsearch_bank_history`), keyed by a stable question key (`term:<vocabulary term>`, `seed:<id>`).
- Record `{answer, at}` and, on yes, the ids of what was added. Changing an answer removes what the old one added.
- **No** is never asked again. **Not sure** rests for 14 days, then comes back.

## Loop
- Ask at the moment of use (before every application), and keep a queue page for idle moments, most-asked first.
- Each answer changes behavior right away: a yes adds the fact and re-runs the search, so the next ranking and the
  next resume use it. A surface that asks and changes nothing is a defect.

## Surfaces

- Jobs app (qnfo-jobsearch): Apply shows the job's questions; "Questions about you" opens the queue.
- Fleet dashboard overview (qnfo-fleet-dashboard RECALL-CARD-1): the most-asked question for the signed-in owner, Yes / No / Not sure, then how involved. Reached through the `SVC_JOBSEARCH` service binding with the loop token after the dashboard's own owner-session check; `GET /api/recall` and `POST /api/recall` on the dashboard are owner-only.
