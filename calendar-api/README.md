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

Deploy: cd qnfo-workers/calendar && npx wrangler deploy
Canonical source: github.com/QNFO/qnfo-workers -> qnfo-workers/calendar/worker.js
