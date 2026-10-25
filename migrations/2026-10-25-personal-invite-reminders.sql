-- PERSONAL-CALENDAR-MAIL-1; charter pillar personal; US-08 synthetic acceptance.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: revert qnfo-email to its preceding version; disable fleet_crons personal-calendar-monitor-10m and fleet_tasks personal-calendar-monitor; retire personal_calendar_delivery_over_120m metric and trigger; supersede fm-personal-calendar-delivery contract; retain additive views, invite/delivery tombstones and audit records.
-- No raw mail, descriptions, attendees, organizer details or private history are copied here.
-- Calendar rows retain existing personal-plane cancellation tombstones; no retention is shortened.

CREATE TABLE IF NOT EXISTS calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT NOT NULL, uid TEXT UNIQUE,
  title TEXT NOT NULL, description TEXT, location TEXT, dtstart TEXT NOT NULL,
  dtend TEXT, all_day INTEGER DEFAULT 0, url TEXT, source TEXT DEFAULT 'manual',
  domain TEXT, relevance REAL, friction REAL, status TEXT DEFAULT 'confirmed',
  created TEXT DEFAULT (datetime('now')), updated TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS calendar_meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS email_calendar_invites (
  uid TEXT PRIMARY KEY, sequence INTEGER NOT NULL CHECK(sequence>=0),
  digest TEXT NOT NULL, sender TEXT NOT NULL, revision_token TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_calendar_delivery (
  id INTEGER PRIMARY KEY, uid TEXT NOT NULL, sequence INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('ack','reminder')), offset_min INTEGER NOT NULL,
  recipient TEXT NOT NULL, due_at TEXT NOT NULL, next_attempt_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','skipped','superseded')),
  claim_token TEXT, claimed_at TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT, provider_id TEXT, last_error TEXT,
  UNIQUE(uid,sequence,kind,offset_min)
);
CREATE INDEX IF NOT EXISTS email_calendar_delivery_due ON email_calendar_delivery(status,due_at);
CREATE VIEW IF NOT EXISTS v_personal_calendar_delivery_health AS
SELECT
  COUNT(CASE WHEN julianday(due_at)<julianday('now','-120 minutes') THEN 1 END) AS over_120m,
  COALESCE(MAX((CAST(strftime('%s','now') AS INTEGER)-CAST(strftime('%s',due_at) AS INTEGER))/60),0) AS oldest_min
FROM email_calendar_delivery
WHERE status IN ('pending','sending') AND julianday(due_at)<=julianday('now');

-- Registry statements follow the schema above, which is also exercised against synthetic SQLite.
-- Preserve the live shared view verbatim, including columns/logic added by other owners.
-- The queue's own monitor reads its additive extension, not an unverified replacement.
CREATE VIEW IF NOT EXISTS v_stuck_summary_personal_calendar AS
SELECT s.*,h.over_120m AS personal_calendar_delivery_over_120m,h.oldest_min AS personal_calendar_delivery_oldest_min
FROM v_stuck_summary s CROSS JOIN v_personal_calendar_delivery_health h;

INSERT OR IGNORE INTO queue_sla(stuck_type,queue,definition,cycle_min,sla_min,auto_fix,owner,summary_column)
VALUES('personal-calendar-delivery','email_calendar_delivery',
  'Unsent calendar mail more than 120 minutes after due_at; oldest due age is measured separately',15,120,
  'qnfo-email drainCalendarMail reclaims sending after 10 minutes on its existing 15-minute tick; provider failures retry after 15 minutes without resetting original due age. Revert worker for rollback.',
  'qnfo-email','v_stuck_summary_personal_calendar.personal_calendar_delivery_over_120m');

INSERT OR IGNORE INTO metric_registry(metric,layer,kind,formula,source_of_truth,target,owner,disposition_actor,refresh_cadence,state)
VALUES('personal_calendar_delivery_over_120m','operational','guard','Unsent calendar acknowledgments/reminders older than 120 minutes after due_at',
  'v_personal_calendar_delivery_health','0','qnfo-email','fleet:personal-calendar-monitor','10m','UNMEASURED');
INSERT OR IGNORE INTO analytics_metric_triggers(metric_key,title,source_table,operator,threshold,priority,action,owner,queue_target,cooldown_hours,enabled,notes)
VALUES('personal_calendar_delivery_over_120m','PERSONAL-CALENDAR-DELIVERY-1: overdue calendar mail','v_personal_calendar_delivery_health','>',0,2,
  'Inspect aggregate oldest_min, qnfo-email tick failures and configured mail binding without copying private content into issues. Restore the existing 15-minute drain; failed sends remain pending, expired claims retry, cancelled/expired/suppressed work receives an explicit skipped disposition. Close only when over_120m=0. Never enable preferences or clear suppression to reduce this count.',
  'qnfo-email','agent_issues',1,1,'US-08; provider acceptance is not mailbox receipt');
INSERT OR IGNORE INTO fleet_tasks(id,name,type,definition,timeout_ms,retries,version,enabled,updated_at)
VALUES('personal-calendar-monitor','Personal calendar delivery age observer','workflow',
  json_object('steps',json_array(json_object('name','measure','type','sql','db','AUDIT','sql',
    'UPDATE metric_registry SET last_value=CAST((SELECT over_120m FROM v_personal_calendar_delivery_health) AS TEXT),last_refreshed=datetime(''now''),state=''MEASURED'' WHERE metric=''personal_calendar_delivery_over_120m'''))),
  30000,1,1,1,datetime('now'));
INSERT OR IGNORE INTO fleet_crons(name,cron_expr,task_id,enabled,timezone,updated_at)
VALUES('personal-calendar-monitor-10m','*/10 * * * *','personal-calendar-monitor',1,'UTC',datetime('now'));
INSERT OR IGNORE INTO failure_modes(fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,trigger_condition,symptom,blast_radius)
VALUES('personal-calendar-delivery','Active personal invite/reminder integration was absent',
  'Retired intake was not replaced by the folded calendar member',
  'Authenticated deterministic email intake, private calendar plane, atomic sequence ledger and retryable existing email tick',
  'SELECT over_120m FROM v_personal_calendar_delivery_health','fm-personal-calendar-delivery',datetime('now'),
  'Pending or sending mail is overdue by 120 minutes','No timestamped provider acceptance or explicit non-send disposition','Personal calendar mail only');
INSERT OR IGNORE INTO remediation_contracts(class,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,module)
VALUES('fm-personal-calendar-delivery','Personal calendar delivery queue exists',
  'Restore qnfo-email scheduled delivery without bypassing sender authorization, preferences or suppression',
  'SELECT 0 AS expected,over_120m AS observed FROM v_personal_calendar_delivery_health',
  'd1-query',3,'qnfo-fleet-control',1,'active','personal-calendar-mail-v1');
INSERT OR IGNORE INTO failure_modes(fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,trigger_condition,symptom,blast_radius)
VALUES('personal-calendar-intake-missing','Calendar MIME falls through to shared archival and command/model queues',
  'Retired intake had no active replacement; the generic personal mail classifier can consume shared email bodies',
  'Keep the early calendar branch before storeEmail and test positive/rejected input with instrumented handler sentinels',
  'Early receiveCalendarMail branch exists before generic archival','fm-personal-calendar-intake',datetime('now'),
  'Early calendar branch is absent','Invite fails to become a private calendar event','Personal calendar privacy and availability');
INSERT OR IGNORE INTO remediation_contracts(class,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,module)
VALUES('fm-personal-calendar-intake','US-08 calendar intake is implemented',
  'Restore the early private branch and rerun synthetic handler isolation acceptance',
  '{"paths":["qnfo-email/worker.js"],"contains":"if(isCalendarMail(rawText)){await receiveCalendarMail(m,e,rawText,bodyText);return}"}',
  'code-read',3,'qnfo-fleet-control',1,'active','personal-calendar-mail-v1');
INSERT OR IGNORE INTO belief_registry(belief_key,claim,confidence,evidence,probe_class,built_on)
VALUES('personal-calendar-isolation','Recognized calendar MIME bypasses generic mail archival, command, reply and model paths',
  0.95,'Synthetic positive and rejected MIME fixtures; positive-control instrumented real functions; no claim about unrelated personal mail',
  'belief-personal-calendar-isolation','US-08; early private branch');
INSERT OR IGNORE INTO remediation_contracts(class,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,module)
VALUES('belief-personal-calendar-isolation','Early calendar branch precedes generic storage',
  'Rerun actual-handler privacy sentinels and restore early branch',
  '{"paths":["qnfo-email/worker.js"],"contains":"if(isCalendarMail(rawText)){await receiveCalendarMail(m,e,rawText,bodyText);return}"}',
  'code-read',3,'qnfo-fleet-control',1,'active','personal-calendar-mail-v1');
INSERT OR IGNORE INTO control_registry(control,location,kind,guards_against,critical_path,disposition,disposition_state,alternate_path,alternate_tested_at,evidence)
VALUES('personal-calendar-owner-and-consent','qnfo-email receiveCalendarMail/drainCalendarMail','gate',
  'Unauthorized calendar changes and mail without current recipient authorization, suppression clearance and reminder opt-in',1,'keep','applied',
  'Existing authorized structured calendar handler and private feed; never bypass the sender/security boundary',datetime('now'),
  'Synthetic allowlist, aligned DMARC, COMMAND_TOKEN, suppression, owner_notice_enabled and email_mode fixtures; UTC subset rejects unsupported semantics');
INSERT OR IGNORE INTO spof_registry(component,critical_path,alternate_path,alternate_tested_at,evidence)
VALUES('personal-calendar-invite-input','Availability of personal calendar events when raw email ingestion is unavailable',
  'Existing active lifecycle calendar member structured event handler and scheduled private feed',datetime('now'),
  'Both input paths exercised against one synthetic SQLite store; no extra Worker, binding or credential. Mailbox receipt and subscribed-calendar refresh remain unproven.');
INSERT OR IGNORE INTO capability_ledger(capability,provenance,prerequisites,reliability,acquired_at,evidence)
VALUES('personal-calendar-mail','US-08; PERSONAL-CALENDAR-MAIL-1',
  'Existing owner sender authorization, native SEND_EMAIL, personal calendar, opt-in email preferences and canonical deploy',
  'Synthetic handler/store evidence; production delivery not established',datetime('now'),
  'UTC single-event request/update/cancel; no raw personal mail in shared email/model queues; claim-safe retries and explicit non-send reasons');
INSERT INTO decision_log(actor,assumption,action,evidence,outcome,blast_radius,rollback_path,capability_gain,predicted_outcome,reach_gain,surfaces_tested)
SELECT 'copilot-dd20d15c-us08','Calendar MIME must never reach generic shared-mail research classification',
  'PERSONAL-CALENDAR-MAIL-1: ingest before generic archival and reuse email tick; preserve personal plane and consent',
  'Synthetic actual handlers and SQLite; research-exec generic personal-mail classifier found during source trace; lifecycle source has another live claim',
  'Runtime change requires canonical migration/deployment; mocks do not prove real delivery',
  'qnfo-email and additive private calendar metadata; aggregate age observer only',
  'Revert worker and disable aggregate observer; retain sequence and cancellation tombstones',
  'Authenticated idempotent personal invite and reminder integration',
  'Synthetic positive/rejection privacy sentinels pass; provider failures retry without false sent timestamps',
  'None; no external outreach','Actual email and folded calendar handlers, synthetic SQLite, mocked native mail, feed privacy'
WHERE NOT EXISTS(SELECT 1 FROM decision_log WHERE action='PERSONAL-CALENDAR-MAIL-1: ingest before generic archival and reuse email tick; preserve personal plane and consent');
