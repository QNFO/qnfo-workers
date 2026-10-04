# calendar-api Worker (QNFO.OPS.010)

Canonical cloud-native calendar store (D1 qnfo-audit.calendar) for BOTH the QNFO research
and Personal planes. Every radar worker (events-radar, personal-events-radar) and both twin
APIs (qnfo-ai, personal-api) read/write this one store so answers are calendar-aware and
holistic. R2 .ics export provides the public "subscribe" URL for Outlook/Apple/Google.

Tables (schema auto-created): calendar(plane qnfo|personal, title, dtstart/dtend, all_day,
location, url, source radar|catalog|manual|personal-radar|personal-profile, domain,
relevance, friction, status confirmed|cancelled|tentative).

Endpoints:
- GET  /health                    -> { ok, worker, version }
- GET  /events?plane=..&from=&to= -> list (500 cap, ordered)
- POST /events                    -> create { title, dtstart, ... }
- GET  /events/:id                -> single
- PUT  /events/:id                -> update fields
- DELETE /events/:id
- GET  /events.ics?plane=..       -> RFC5545 export (Outlook/Google subscribe URL)
- GET/POST /e/:id?s=<sig>         -> (0.5.0) feedback page for a suggested personal event: keep / I went / not for me.
                                    Signed link (HMAC of the id with CAL_TOKEN), no login; GET only shows, POST changes.
                                    Personal feed events from personal-radar and personal-twin carry this link.
- GET  /feedback?since=&limit=    -> (0.5.0, bearer) stored answers from calendar_feedback, newest first

Owner questions (0.6.0, CONNECTION-PRODUCER-1): after publishICS the hourly :17 tick calls queueOwnerQuestions, which
INSERT OR IGNOREs rows into qnfo-audit.owner_questions (UNIQUE(kind, ref)); personal-companion mails them.
- after-event ref=<calendar id>: confirmed timed personal-radar/personal-twin events (not trip-, not all-day or date-only,
  not outside Amsterdam) whose end passed 1-6h ago; no dtend = 2h long; priority 3, not_before = end + 1h; signed link.
- triage ref=<ISO week>: Sundays (Amsterdam), up to 5 tentative personal-radar events within 14 days, one signed link each; priority 5.
Tests: node --no-warnings calendar-api/queue.test.mjs

Deploy: cd qnfo-workers/calendar && npx wrangler deploy
Canonical source: github.com/QNFO/qnfo-workers -> qnfo-workers/calendar/worker.js
