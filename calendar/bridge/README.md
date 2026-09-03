# outlook_calendar_bridge.py

Native 2-way sync: calendar-api (D1 qnfo-audit.calendar) <-> Outlook desktop accounts for
the QNFO and Personal planes. User request 2026-09-03: QNFO + Personal calendars viewable AND
editable in Outlook on Huawei Android. ICS subscriptions are read-only on every client, so the
bridge mirrors calendar-api events as NATIVE Outlook appointments in dedicated calendar folders of
the cloud-backed Outlook.com accounts (qnfo -> rowan.quni@outlook.com "QNFO Research Calendar",
personal -> rwnquni@outlook.com "Personal Calendar"), then pulls phone edits back into calendar-api.

Mapping user-confirmed 2026-09-03. Items tagged with invisible MAPI named property QNFO_UID.
State persisted to bridge_state.json (last-seen uids + signatures).

Usage:
  python outlook_calendar_bridge.py [--plane qnfo|personal|all] [--dry-run]

Canonical source: github.com/QNFO/qnfo-workers -> calendar/bridge/outlook_calendar_bridge.py
