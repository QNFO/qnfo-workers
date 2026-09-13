# REV6 — `fleet_audit_runs`: the fleet's own auditor, and what it caught that I did not

Date: 2026-09-13. Records a surface the main audit never queried, one precise
schema fix, and **two self-corrections — a misread number and a
mischaracterised instrument.**

---

## 1. SELF-CORRECTION — `ledger_open: 305` is not "305 open issues"

Reading `fleet_audit_runs` I saw `ledger_open: 305` and initially concluded the
real backlog was 305 against `agent_issues`' 3. **That was wrong, and I checked
before publishing.**

```sql
SELECT status, COUNT(*) c, MIN(last_seen) oldest, MAX(last_seen) newest
  FROM issue_ledger GROUP BY status;
```

| status | c | oldest | newest |
|---|---|---|---|
| resolved | **325** | 2026-09-02T19:50:06.431Z | 2026-09-13T12:21:31.052Z |
| acknowledged | 1 | 2026-09-02T19:50:10.777Z | — |

**`issue_ledger` has ZERO open rows** (326 total). Both confirming queries
(`status='open'` by level, and by source) returned `rowCount: 0`.

So `ledger_open: 305` is a **composite** count the auditor maintains across
several sources, not one table's open count. Proof: the auditor's `open_high`
fingerprint list contains `alert:*`, `selfheal:*`, `gwfail:*`,
`errata-pub-403-3`, `69666147` — none are `issue_ledger` rows, whose
fingerprints look like `chat-canary-qnfo-ai-404-2026-09-02`.

**What is actually true:** there are two unreconciled open-counts —
`agent_issues` 3, and the auditor's composite 305 / 76 HIGH-CRITICAL. They
measure different populations. That is a real finding (the "two rosters" problem
noted in the main audit), but it is **not** "the real backlog is 305".

---

## 2. A precise schema fix: `deployment_history` uses `deployed_at`

REV5 recorded that the integration report's decay block fails on every row with:

```json
{"signal":"deployment_history","age_h":null,
 "error":"D1_ERROR: no such column: ts at offset 11: SQLITE_"}
```

The real columns, read directly:

```
id, resource_type, resource_name, action, version_id,
deployed_by, deployed_at, status, notes, _version, wbs_code
```

**The column is `deployed_at`, not `ts`.** A one-word fix restores deploy-record
ageing in the integration monitor. This is the most mechanically simple fix in
the audit, and the only one whose exact edit I can name with certainty, because
I read the schema rather than inferring it.

`deployment_history` is also the **complete** deploy record the main audit §11
found missing from `fleet_deploys` — it carries `status` and `deployed_by`,
which `fleet_deploys` lacks. Sampled:

| id | resource | action | status | deployed_by | note |
|---|---|---|---|---|---|
| 57 | qnfo-ops | deploy | success | deepchat-session | build-fix; 43 bindings; 8 secrets preserved |
| 56 | qnfo-ops | deploy | success | deepchat-session | agent_issues writers → issue_ledger (patch #449) |
| 55 | qnfo-ops | deploy | **failed** | deepchat-session | `Expected 'finally' but found '}' at worker.js:1119` |

Row 55 is a recorded build failure with its compiler error — detail
`fleet_deploys` omits. **Cross-check these two tables before trusting either.**

---

## 3. What the fleet's own auditor caught that my audit missed

`fleet_audit_runs` holds the fleet's self-audit (modes `standard`, `deep`).
Latest at 2026-09-13T13:45:58Z: `ledger_open 305`, `open HIGH/CRITICAL 76`
(8 new), `coe 48h 10514`, `alerts 48h 226`, `agent open 12`, `deploys 7d 10`.

Its `open_high` list includes four self-heal failures against **this endpoint's
own tools**:

| finding | occurrences |
|---|---|
| `[qnfo-ops] [self-heal] tool ops_issue_run failing x11 (24h no recovery)` | 24 |
| `[qnfo-ops] [self-heal] tool web_fetch failing x266 (48h no recovery)` | 46 |
| `[qnfo-ops] [self-heal] tool web_search failing x18 (48h no recovery)` | 14 |
| `[qnfo-ops] [self-heal] tool email_respond failing x15 (168h no recovery)` | 8 |

**`ops_issue_run failing x11` is the drain I was asked to run.** The tool the
instruction depends on is itself failing repeatedly and has been filed as a
self-heal issue — which is why it returned a gate refusal rather than draining.
`email_respond` has been failing for **168 hours (7 days)**.

### SELF-CORRECTION — the two self-heal instruments do NOT disagree

I first wrote that this contradicted my `telemetry_analyze` run, which reported
`persistent: []` / `filed: 0`. **That framing was wrong.** Re-running the
analyzer over the auditor's own 7-day window reconciles them:

```
telemetry_analyze(hours=168) -> scanned 19, persistent [], recovered 10,
                                autoResolved 0, filed 0, alreadyOpen 7
```

`alreadyOpen: 7`. The analyzer's `persistent` list means *failures with no open
ticket*; it correctly suppresses re-filing for issues that already have one.
**The two instruments are consistent** — the auditor tracks the open set, the
analyzer declines to duplicate it.

**The real error was mine, and it was a reporting error, not a tool defect:**
I reported `filed: 0` as though nothing was wrong, when the same call returned
`alreadyOpen: 3` (24h) — 7 tickets already open on this endpoint's tools. I read
the field that said "nothing new" and ignored the field that said "seven known".
Both readings were available in the first call.

### C4 — six jobs silent since 2026-09-10

Both the `deep` and `standard` runs flag, at level **high**:

| job | last event |
|---|---|
| `briefing` | 2026-09-10T06:30:45.800Z |
| `radar` | 2026-09-10T07:30:40.209Z |
| `research-scan` | 2026-09-10T08:01:00.304Z |
| `outreach` | 2026-09-10T09:00:38.902Z |
| `email-triage` | 2026-09-10T12:00:42.351Z |
| `gmail-triage` | 2026-09-10T13:00:42.801Z |

**Six scheduled jobs, all last firing on 2026-09-10, all silent ~72 hours.**
This clusters with `integration_state` dying on 2026-09-11T14:17:37Z (REV5 §1).
Two independent monitors stopped within a day of each other. The auditor itself
took a recovery action: `{"kind":"recovery-close","text":"job-silence radar"}`.

`fleet_crons` does **not** contain these six — it holds only 6 rows
(`report-card-weekly-cron`, `bench-arc-weekly`, `systems-watch-hourly-cron`,
`venue-radar-scan`, `demo-heartbeat-minutely`, `demo-venue-radar-daily`
disabled). Four are fresh (systems-watch 14:09:03Z, demo-heartbeat 14:00:01Z).
So the silent jobs are **worker-level cron triggers not represented in
`fleet_crons`** — a third roster.

### Fresh endpoint failures

`feedback_probes`, read this session:

| k | status | code | ts |
|---|---|---|---|
| `qnfo-ai` | **fail** | 404 | 2026-09-13T13:46:06.699Z |
| `personal-api` | **fail** | 404 | 2026-09-13T13:46:06.991Z |

The same two endpoints the daily health check reports as 530 (main audit §7).
Here they are **404**, fresh, ~22 minutes before my query. The AI gateway's
self-probe is failing now, in two different ways across two probes.

---

## 4. Where this leaves the audit

**For any future ops session on this fleet: query `fleet_audit_runs` first.** It
is the single highest-signal table I found, and the main audit did not touch it.
It aggregates `alerts`, `selfheal`, `gwfail`, `errata` and `issue_ledger`
fingerprints and retains history across runs (270 → 305 open across three runs
today).

Equally: **read every field a tool returns.** `telemetry_analyze` gave me
`filed: 0` and `alreadyOpen: 3` in the same payload. I reported the first.

---

## 5. Limits

- **`ledger_open: 305` remains unexplained in composition.** I proved it is not
  `issue_ledger`'s open count (0). I did not identify which tables sum to 305.
- **The six silent jobs were not independently verified by me.** `cloud_ops_events`
  `kind='outreach'` has only 4 rows, latest 2026-09-02T09:00:36.834Z — *older*
  than the auditor's 09-10 figure, so the auditor reads a different source. I
  report the auditor's claim, corroborated only by the cluster with
  `integration_state`'s death.
- **`fleet_crons` is a third roster** (6 rows) and does not describe the silent
  jobs. I did not locate the table that does.
- **The `web_fetch x266` and `email_respond x15/168h` counts are the auditor's**,
  not mine. My own 24h telemetry gave web_fetch 276 failures — similar order of
  magnitude, so consistent in scale but not identical in window.
- **I do not know which 7 tools `alreadyOpen: 7` refers to.** The auditor's list
  names four; the analyzer does not enumerate its seven.
- **I misread one instrument and mischaracterised the other in the same revision.**
  Both errors were caught by re-running with a different parameter, but neither
  should have reached a commit.
