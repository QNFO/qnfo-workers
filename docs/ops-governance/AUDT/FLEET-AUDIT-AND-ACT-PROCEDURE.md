# FLEET AUDIT & ACT PROCEDURE - automated review/audit/act/learn over ALL QNFO events and logs

- WBS: QNFO.OPS.AUDITLOOP.001 | Status: ACTIVE (P0) | Date: 2026-09-02
- Owner: qnfo-auditor worker (fleet automation) - runs unattended, 100% automated, user-free, cloud-native
- Canonical source: QNFO/qnfo-workers/qnfo-auditor | Canonical repo: QNFO/qnfo-ops (this file)
- Authority: user directive (2026-09-02): 100% cloud-native autonomous operations; review/audit/act on all events and logs as part of self-awareness and continuous improvement; NO-DEFERRED-ZERO-1; RECURRENCE-ZERO-1

## 1. Purpose

Every QNFO component writes events/logs (scheduler job events, alerts, issue ledger, agent-issue tracker, audit trail, deployment history, errata queue, kaizen reports). What was missing is a standing procedure that systematically REVIEWS every store, AUDITS against invariants, ACTS to keep the estate healthy, and LEARNS (feeds continuous improvement) - with no user and no in-app session required.

This runbook defines that procedure. It is executed by the qnfo-auditor worker (v1.1.2) on a fixed schedule and on demand via its API. Deterministic checks C1-C10 plus feedback subloops F1-F4 below are the procedure body.

## 2. Inputs (every event/log source reviewed)

| Store | Table(s) in qnfo-audit | Owner | What the auditor reads |
|---|---|---|---|
| Issue ledger | issue_ledger / issue_events | qnfo-events | open/resolved lifecycle, recurrence, staleness |
| Scheduler job events | cloud_ops_events | qnfo-cloud-ops | job success/failure, job silence, sweep-lag |
| Legacy alerts | alerts | qnfo-events / fleet | mirrored into ledger; lag detection |
| Agent issue tracker | agent_issues | autonomous pipeline | stale open high/critical bridge |
| Agent phase trail | audit_trail | sessions | counts in run snapshot (dangling-phase signals: future C10) |
| Deployments | deployment_history | fleet | deploy counts/context for run snapshot |
| Errata pipeline | errata_queue / errata_actions | qnfo-errata-* | stuck non-terminal rows |
| Improvement reports | kaizen_reports / kaizen_candidates | qnfo-kaizen + auditor | candidate promotion feed |

## 3. The loop (executed every pass)

1. REVIEW - snapshot all stores (counts + open-HIGH list + 48h/7d windows).
2. AUDIT - run checks C1-C9 (each isolated in try/catch; a failing check degrades to a finding, never aborts the pass).
3. ACT - apply only safe, evidence-based mutations (auto-close stale low; reopen recurrence-after-resolution; ensure ledger visibility for job-silence, sweep-lag, stale agent-issues, stuck errata; promote mature kaizen candidates).
4. LEARN - write findings/actions/digest + open-HIGH fingerprint set to fleet_audit_runs; create/update kaizen_candidates for recurrence-after-resolve clusters and high-volume event clusters; mature (>7d) candidates are promoted into the issue ledger for the next ops/agent cycle.
5. DIGEST - email (alerts@qnfo.org to DIGEST_TO) ONLY when a new/increased unresolved HIGH appears (standard pass) or on the Monday deep pass (weekly summary). All other runs stay silent in email and land in fleet_audit_runs + ledger (SILENCE POLICY).

## 4. Checks

| # | Check | Trigger | Action | Level |
|---|---|---|---|---|
| C1 | Stale open HIGH | open/acknowledged HIGH/CRITICAL untouched >7d | finding (digest set) | warning |
| C2 | Auto-close stale low | open info/warning/low, no recurrence >=14d, occ<=3 | resolve with evidence note | - |
| C3 | Recurrence after resolution | resolved/acknowledged/muted entry with newer issue_events | reopen + note | - |
| C4 | Job silence | recurring scheduler job (>=3 event-days/14d) silent >48h | ledger HIGH (cloud-ops/job-silence) | high |
| C5 | Events sweep lag | coe/alerts error rows >12h not mirrored (src:coe:/src:alert: marker) | ledger warning (auditor/pipeline) | warning |
| C6 | Agent-issue bridge | agent_issues open high/critical >30d | ledger HIGH (agent-issues/stale-open) | high |
| C7 | Errata stuck | errata_queue non-terminal >24h | ledger HIGH (errata/stuck) | high |
| C8 | Kaizen feed | recurrence-after-resolve >=2 / event cluster >=5 in 7d | kaizen_candidates upsert; promote mature >7d to ledger | - |
| C9 | Digest state machine | new HIGH or count increase (standard) / always (deep) | email digest + persist open-HIGH fps | - |
| F1 | Subloop supervision | an automated subloop stops writing side effects (qnfo-events sweep src rows >30h, kaizen_reports >4d) | ledger HIGH/warning (auditor/subloop) | high |
| F2 | Improvement-effectiveness | promoted kaizen candidate's improvement entry resolved | verify recurrence stopped -> verified_effective / ineffective (reopen) | - |
| F3 | Self-trend | auditor's own finding history >=6/12 runs for a check | recurring-finding kaizen candidate + digest trend line | - |
| F4 | Remediation watchdog | open HIGH/error health row >6h old, no recurrence 12h, title names qnfo-ai/personal-api | throttled live /health probe; resolve on 200+version | - |
| C10 | Resolve-on-recovery | open ledger entry whose underlying source condition cleared (job resumed / errata row terminal / agent_issue closed) | resolve with evidence note (closes the loop after C4/C6/C7) | - |

## 5. Cadence (crons on qnfo-auditor, UTC)

- 45 1,13 * * * - standard passes (2x/day: catches the 03:15 qnfo-events sweep outcome + afternoon events).
- 45 6 * * 1 - deep pass (Monday weekly digest + candidate promotion; complements fleet-drift 06:00 device cron and loose-threads-sweep 05:00 Mon - no collision).

## 6. Action policy boundaries

- Auto-close (C2) only for low-severity entries with >=14 days of no recurrence - safe, evidence-based, reversible.
- Auto-reopen (C3) fixes a real lifecycle bug class: qnfo-events ingest increments occurrences on an existing fingerprint but never flips status back from resolved; the auditor closes that loop.
- HIGH/CRITICAL entries are never auto-closed. They stay visible in the ledger/digest until an agent/ops cycle resolves them with evidence (same philosophy as loose-threads-sweep verified-resolved rows).
- Email is a last resort: digest only per section 3 step 5. Store-first, email-only-when-needed (ADR storage/events architecture 2026-09-02).
- Every mutation is recorded: resolved/reopened to last_detail note; ledger inserts to issue_events row; run digest to fleet_audit_runs JSON.
- C10 closes the loop the other direction: entries opened by C4/C6/C7 are auto-resolved (with evidence) when the underlying condition clears - the ledger never accumulates stale HIGH entries whose cause is gone. HIGH entries whose cause persists stay open and stay visible in the digest.
- F1-F4 (v1.1.0) make the loop self-closing: the auditor supervises its own subloops (F1), verifies that applied improvements actually stopped recurrence (F2), tracks its own finding trends for self-improvement (F3), and re-probes recovered workers to clear stale health rows (F4). F4 probes ONLY failure subjects named in the entry title (qnfo-ai/personal-api in worker-health JSON); chat-canary/blank-audit entries are never auto-resolved on a canary-health probe (no false resolution).

## 7. Self-awareness and continuous improvement

- fleet_audit_runs accumulates a per-pass self-model (counts, findings, actions, open-HIGH fingerprint set, digest text) - the audit trail of the audit, enabling trend analysis and drift-vs-baseline checks.
- kaizen_candidates is the machine-generated improvement queue (classes: event-cluster, repeat-resolution). Promotion after >7d of continued evidence moves a candidate into the issue ledger for the next kaizen/ops cycle (qnfo-kaizen + in-app kaizen runs consume it with the standard verification pipeline).
- Recurring findings that are really systemic (e.g., events-sweep cadence, worker-health false 404/530 on a worker) should be converted into permanent gates or schedule changes - RECURRENCE-ZERO-1.

## 8. Operations quick-reference

- Health: GET https://qnfo-auditor.q08.workers.dev/health (public; shows version + bindings)
- Manual pass: POST /v1/run with {"mode":"standard"|"deep"} (Bearer AUDITOR_TOKEN)
- Inspect: GET /v1/runs?limit=20 | GET /v1/state (open ledger + candidates)
- Secrets: AUDITOR_TOKEN (also in .deepchat secrets store + SECRETS-INVENTORY), DIGEST_TO (alerts@qnfo.org sink - user directive 2026-09-02: digests NEVER email personal-domain recipients; the domain sink is machine-consumed, matching cloud scheduler f2802f3)
- Deploy: wrangler deploy from qnfo-workers/qnfo-auditor; then cp worker.js deployed-current.worker.js
- Data: qnfo-audit D1 - fleet_audit_runs, kaizen_candidates (auto-created IF NOT EXISTS)

## 9. Failure handling

- A check exception becomes a finding (check failed) - pass continues; email only if the digest gate says so.
- Missing binding/secret degrades gracefully (email: no SEND_EMAIL/DIGEST_TO - recorded, no crash).
- The scheduled handler catches all errors and logs; the next pass retries. Manual /v1/run is always available.

## 10. Claims and Evidence (FRAMEWORK-DOGFOOD-1)

| claim | evidence | confidence | status |
|---|---|---|---|
| Worker deployed with D1 + send_email + both crons | wrangler deploy 2026-09-02: v1.0.0 Version ID 5e35a0f9-1f60-4c92-892c-5c23380578c7; v1.0.1 deployment 0fd99baf-ed6b-464c-a799-2c9436e6c8e2 (20:46:46Z); schedules 45 1,13 * * * + 45 6 * * 1 | high | verified |
| /health live | curl 200: worker qnfo-auditor, version 1.0.0, audit true, sendEmail true, token true | high | verified |
| Secrets set | CF API PUT 201 AUDITOR_TOKEN + DIGEST_TO (alerts@qnfo.org sink per directive); GET list shows both | high | verified |
| Live standard pass works | POST /v1/run run audit-2026-09-02T20-41-49-443Z: findings 2 (C5 sweep-lag, C7 errata-stuck), email sent with messageId | high | verified |
| Run record persisted | D1 fleet_audit_runs row with findings JSON | high | verified |
| Ledger action visible | D1 issue_ledger: errata/stuck HIGH #3 + auditor/pipeline warning created | high | verified |
| Kaizen feed fires | D1 kaizen_candidates: event-cluster worker-health/cloud-ops x8 (proposed) | high | verified |
| Digest state machine quiet on steady state | 2nd pass: email only when open_high 4 to 5 (new errata HIGH) | high | verified |
| Mirror synced (FLEET-SELF-DOC-1) | deployed-current.worker.js == worker.js (19009 B) | high | verified |

## 11. Version history

- v1.1.2 (2026-09-02) - deep digest lists OPEN IMPROVEMENT CANDIDATES with resolve instructions; closes promote->apply->verify loop deterministically (P5 adversarial finding: no cloud consumer read improvement rows; designated apply-owner = weekly Fleet Drift & Self-Improvement Audit session). Live version ID 49cad00f-cc6c-48cc-aed3-877a6f5c8f9f.
- v1.1.1 (2026-09-02) - F2 robustness: promotion title embeds [candidate-id] (survives agent note overwriting last_detail); recurring-finding candidates verified by the auditor future finding trend. Live version ID ed623e4d-0b77-4c4c-b972-d908a7661e6c.
- v1.1.0 (2026-09-02) - feedback loops + subloops (user addendum): F1 subloop supervision heartbeats (events-feed <30h, kaizen <4d), F2 improvement-effectiveness verification (verified_effective/ineffective), F3 self-trend (recurring-finding candidates + digest trend), F4 remediation watchdog (live /health re-probe resolves stale worker-health rows naming qnfo-ai/personal-api). Fixes v1.0.2 scope bug (upsertCandidate referenced runAudit-local cut7d -> C8 error, mature kaizen promotion dead). Live version ID b4a7ce45-11ce-4641-94a0-bfb8f6f728c8.
- v1.0.2 (2026-09-02) - red-team hardening (reviewer PASS-WITH-NOTES addressed): all ISO-8601 column time-window cutoffs now use JS-computed ISO bounds (eliminates SQLite space-format literal mixing boundary skew in C1/C2/C4/C5/C8 + mature-promotion); auth fail-closed when AUDITOR_TOKEN unset. Live version ID 8de67ac8-907e-4a70-8b64-0ec5978eb58c.
- v1.0.1 (2026-09-02) - added C10 resolve-on-recovery (job resumed / errata terminal / agent_issue closed auto-close). Lesson recorded: a wrangler deploy can drop secrets set via the CF API - re-assert after every deploy (README). DIGEST_TO re-pointed to alerts@qnfo.org sink (user directive: no personal-domain digest recipients; initial test digests to own mailbox were before directive awareness - corrected).
- v1.0.0 (2026-09-02) - initial implementation: C1-C9, runbook, crons, secrets, deploy, live verification.