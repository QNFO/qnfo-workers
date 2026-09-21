# qnfo-calendar-intake

Email -> event -> calendar/reminders intake worker (EMAIL-EVENT-CALENDAR-LIVE-1).

Renamed from an earlier misnamed `qnfo-events` deploy (which collided with the retired
issue-ledger worker of the same name). Parses forwarded event/appointment/confirmation
mail (`.ics` VEVENT, TZID-aware -> UTC, or AI extraction fallback), writes it to
calendar-api with `source=email`, and schedules reminders at -1440 / -60 min.

- Bindings: D1 (qnfo-audit), AI, SEND_EMAIL (allowed: rwnquni@outlook.com), CAL_API (service -> calendar-api)
- Secrets: INGEST_TOKEN, CAL_EMAIL_TOKEN
- Cron: `*/5 * * * *` (reminder dispatch)
- Endpoints: POST /ingest, POST /feedback, GET /run-reminders, GET /inbox|/reminders|/prefs, GET /health
- D1 tables (qnfo-audit): event_inbox, event_reminders, event_feedback, event_prefs
- Consumed by: qnfo-email (service binding EVENTS -> qnfo-calendar-intake)
