# qnfo-email

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Email transport inbound/outbound for QNFO domains
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## US-08 personal acceptance (pillar: personal)

Run `node --no-warnings qnfo-email/personal-acceptance.test.mjs` from the repository root.
The suite invokes real inbound email and scheduled handlers against synthetic SQLite:
commands execute and acknowledge through mocked OPS/mail; calendar MIME creates a
personal event, acknowledgment and reminders. Positive controls and instrumented
sentinels prove both accepted and rejected calendar input bypass shared email storage,
raw archival, commands, reply queues and model-facing paths. The active folded
`qnfo-lifecycle` calendar member publishes those same rows to an in-memory private
ICS feed, never the research/host feeds. Unexpected network/model calls fail.

### Supported calendar input

Only an existing owner command sender with the existing aligned DMARC authorization
can import a `text/calendar` MIME part. Configured `COMMAND_TOKEN` is still required;
put it in the plain-text part of multipart mail. No HTTP ingestion route, sender
authorization, credential, binding or Worker is added. The retired intake stays retired.

The deterministic subset is one VEVENT in VCALENDAR 2.0, METHOD REQUEST or CANCEL,
a UID and a nonnegative SEQUENCE (default zero). Dates must be explicit UTC
`YYYYMMDDTHHMMSSZ`; malformed dates, floating/TZID/all-day values, recurrence,
multiple events, alarms and unsupported properties/encodings are explicitly rejected.
UTF-8 plain, base64 and quoted-printable calendar parts are supported. Organizer and
attendee fields never cause RSVP or outbound contact. Descriptions and raw history
are not persisted. Calendar title, location and times stay in `plane=personal`.

UID hashes and monotonic sequence/digest checks prevent duplicate/stale/conflicting
imports. An atomic D1 batch changes the event and delivery ledger together; newer
revisions supersede unsent old work. Cancellation retains tombstones and prevents
stale resurrection. Existing calendar retention is unchanged, and removed calendar
rows are not recreated by the delivery tick. Feed publication remains on the
existing lifecycle schedule; acknowledgment is not proof of subscription refresh.

### Delivery and rollout

The existing 15-minute email tick drains acknowledgments and 1440/60-minute reminders.
Late invitations skip the elapsed 1440-minute reminder and schedule the 60-minute
reminder immediately if the event has not started. Reminders require the existing
personal preference `email_mode=all`; missing/off/daily does not authorize them.
Both mail kinds honor `email_suppression`, `owner_notice_enabled`, and current owner
sender authorization. Non-send dispositions are explicit; no preference is enabled
or suppression removed automatically.

Conditional ten-minute claims prevent concurrent ordinary retries. Provider/store
failure retries after 15 minutes without resetting original due age; the aggregate
observer measures oldest pending age and alerts beyond 120 minutes. Its additive
`v_stuck_summary_personal_calendar` extends the existing shared view without replacing
unknown/newer logic. The separate ten-minute fleet task measures this queue directly;
it does not pretend the unchanged central stuck-items sum includes the new column.
No private content enters metric issues.

Provider acceptance records `sent_at` and, when available, `provider_id`; it is not a
mailbox receipt. A call already in flight when an event changes cannot be recalled:
its late acceptance is recorded without undoing supersession. A crash after provider
acceptance but before the durable receipt can still produce a duplicate on recovery;
the native binding provides no cross-store exactly-once transaction.

Apply `migrations/2026-10-25-personal-invite-reminders.sql` through the canonical
migration runner, then deploy version 2.11.0 or newer through canonical-deploy.
The aggregate observer uses the existing fleet executor, not a new privileged path.
Verify the migration run and health version before calling this rolled out. No live
invite, reminder or test send is authorized by the synthetic acceptance suite.

Private document/history regression coverage is in the existing synthetic suites:
`node --no-warnings qnfo-fleet-dashboard/owner-edit.test.mjs`,
`node --no-warnings qnfo-fleet-dashboard/open-access.test.mjs`, and
`node --no-warnings qnfo-gateway/private-isolation-acceptance.test.mjs`.
These use fixture documents, not personal records. The morning-brief test exercises
the actual delivery helper with failure, retry and same-day deduplication, not the
entire companion scheduled pipeline. Mailbox receipt, subscription refresh, deployed
binding parity and broader generic personal-mail isolation remain unverified.
This bounded H0 slice does not advance H1/H2 or declare the full roadmap complete.

### Open subscriber-sequence acceptance handoff

The active `qnfo-lifecycle/worker.js` `calendarApiFoldMod.buildICS` currently omits
SEQUENCE on confirmed events, uses `created` for DTSTAMP, and contains this exact
unique cancellation anchor:

```js
L.push("SUMMARY:" + escICal(e.title), "STATUS:CANCELLED", "SEQUENCE:1", "END:VEVENT");
```

The lifecycle owner's synthetic feed contract is one fixed UID carried through
REQUEST/0, changed REQUEST/1, CANCEL/2, then REQUEST/3. After each publication,
the private feed must carry that revision's SEQUENCE, changed title/time where
applicable, CANCELLED only at revision 2, and a revision-aware DTSTAMP/LAST-MODIFIED.
The research and host feeds must omit the event in every phase. The current
publisher does not satisfy this contract; the backend ledger tests do not prove
subscriber acceptance or resurrection. This is an explicit open H0 acceptance
item, not a claimed lifecycle edit or a reason to read a real subscribed calendar.
