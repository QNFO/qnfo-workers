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

## Surfaces and the shared queue (RECALL-LOOP-1, 2026-11-09)
Owner: "you're not asking me for enough feedback. And that needs to be done via existing interfaces ... like with the jobs or like with the
personal companion." Every surface the owner uses asks, and the questions meet in one place he already opens daily.
- **Fleet questions** go into `qnfo-audit.owner_asks` (plane `research` | `jobs` | `fleet`; 2 to 4 options plus Not sure in `options_json`;
  `UNIQUE(kind, ref)` so a producer can re-run). An answer is an `UPDATE owner_asks SET answer ...`; its effect is a D1 trigger, so every
  surface that records the tap gets the same effect (migrations/2026-11-09-recall-loop.sql, tested by migrations/recall-loop.test.mjs).
- **Research focus**: one question per research line (`research_lines`, `research_line_terms`) every 14 days, and weekly "which line matters
  most". `owner_focus` holds the stance; pause holds the line's ideas out of the research queue (`owner_paused`), push lifts them to score 0.95,
  keep releases them. fleet.qnfo.org/focus shows the questions and the focus they set; `GET /api/focus` is the open read.
- **Companion** (me.q08.org, Today, "Quick question"): its own questions live in `personal-life.cmp_asks` (venues and interests that feed For
  You, a weekly "did this help"), and the same card shows and answers the fleet questions. Personal answers never leave personal-life.
- **Jobs** (jobs.q08.org): the per-application recall above.
- A new surface adds a producer (rows in `owner_asks`, or its own plane table for personal data) and a trigger or handler that applies the
  answer. Ask often: a surface that learns nothing from the owner for 14 days is a gap to fill, not a quiet success.
