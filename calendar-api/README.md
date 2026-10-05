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

Host plane (0.7.0, CAL-HOST-PLANE-1): a third plane `host` = open-house availability (owner decision 2026-10-04: dates only).
- Writes need the CAL_TOKEN bearer like every plane. POST /events?plane=host takes dtstart (YYYY-MM-DD) and optional dtend;
  everything else is dropped and stored as title "Open for guests", all_day, source host.
- The feed (R2 calendar/host-<token>.ics, republished hourly and on every write; /events.ics?plane=host needs the bearer)
  carries only all-day "Open for guests" events: no address, names, contact details, description or url, even if a row holds
  them (scrubbed at read time). Guest records never go in qnfo-audit.
Tests: node --no-warnings calendar-api/host.test.mjs

Internal callers (0.7.1, CAL-CALLER-PROPS-1): a service binding that declares props = { caller = "<worker>" } in its
wrangler.toml is authorized like the CAL_TOKEN bearer (radar-hub declares caller radar-hub; it holds no CAL_TOKEN).
Public requests never carry props. Tests: node --no-warnings calendar-api/caller-props.test.mjs

Source of truth (CAL-SURFACES-1, #1883, recorded 2026-10-05): Cloudflare writes first. The personal calendar is this
store (qnfo-audit.calendar, plane personal) plus personal-life.events (trips and bookings; the brief and the away gate read
it). Google Calendar (rwnquni@gmail.com) is a downstream view only: no worker treats it as truth. personal-api reads Google
only when the owner sets GOOGLE_ICS_URL or connects OAuth (neither is set: /health google_calendar=no-client), its ICS
reader is a plain GET, and it writes to Google only when OAuth-connected. Outlook and Google subscribe to the tokenised R2
feeds published from this store. Events that exist only in Google (for example the two weekly "Free Lunchtime Concert"
entries on 2026-10-08, while the owner is in Krakow) are not seen by the fleet.

Deploy: canonical path only (merge to main in QNFO/qnfo-workers; canonical-deploy.yml -> qnfo-ops /ops/deploy).
Canonical source: QNFO/qnfo-workers -> calendar-api/worker.js
