# Outreach evidence + failure-mode audit — 2026-09-15 (qnfo-ops / ops-exec)

Session: `session-2026-09-15-ops-exec-closeout`. All claims below are backed by tool output
captured in this session; where a claim was falsified it is marked **RETRACTED**.

---

## 0. Definition of done (stated explicitly — no plan file existed on disk)

`workspace_glob **/*2026-09-1[45]*` returned 0 files and `**/*outreach*` returned 0 files, so the
"plan" from the interrupted turns existed only in the (truncated) conversation. Reconstructed and
fixed here as the DoD:

| # | Criterion | Status |
|---|---|---|
| DoD-1 | Named researcher enrolled in the outreach system with correct identity/tags | **MET** |
| DoD-2 | Outreach email dispatched **with verifiable transport evidence** | **PARTIAL** — dispatched; transport id discarded at send time, not retro-verifiable |
| DoD-3 | Failure modes enumerated with evidence, incl. self-refutation | **MET** (FM-1…FM-10) |
| DoD-4 | Remediation executed for everything fixable from this endpoint | **MET** |
| DoD-5 | Closeout persisted (ops-workspace + repo) | **MET** |
| DoD-6 | Live deploy of the sender fix | **NOT MET** — deliberately blocked by FM-3 (see §3) |

---

## 1. The original request — enrol Yining Wu (Distinction Theory / FDS)

Source URLs: `distinctiontheory.org/about` + `/papers/fds-core` (both HTTP 200).

- **Identity:** Yining Wu, Independent Researcher, `yining.wu@alumni.upenn.edu`,
  ORCID `0009-0009-4991-4501`.
- **Work:** *Distinction Theory: A General Theory of Finite Systems* (DOI 10.5281/zenodo.20130174)
  and **FDS-0** *Active Finite Distinction Systems: A Formal Core for Boundary Maintenance under
  Finite Capacity* (DOI 10.5281/zenodo.20158923, 2026-05-12). CC-BY-4.0.
- **Alignment:** the user's DLF thread (existence-as-realizability, filter R, Landauer/JPCUB energy
  axis) is adjacent to FDS's "capacity deficit / boundary maintenance / invariant-supported
  persistence".

**Enrolment evidence** — `qnfo-outreach.contacts`, row `c-wu-dt`:

```
id=c-wu-dt  email=yining.wu@alumni.upenn.edu  name=Yining Wu
org=Distinction Theory / FDS (independent)    audience=academic
tags=finite-systems,landauer,rate-distortion,information-thermodynamics,capacity-deficit,energy-accounting
first_seen=2026-09-15 06:30:43   status=contacted   last_contacted=2026-09-15 11:00:42   contact_count=1
```

**Dispatch evidence** — `qnfo-outreach.sends`, row `s-mu2k9bh5im1ddc`:

```
campaign_id=c-interview-academic  kind=interview  status=sent  sent_at=2026-09-15 11:00:42
message_id=NULL                   created_at=2026-09-15 11:00:39
subject="Three questions on energy accounting in quantum computing research"
body="Hi Yining Wu - the QNFO/QWAV open research group runs a public benchmark of computational
      energy cost (Zenodo DOIs, reproduction scripts). Your finite-systems work is adjacent. ..."
```

Personalisation is correct: `{{name}}`→"Yining Wu", `{{topic}}`→"finite-systems" (first tag).
The send came from the **cron** `0 11 * * 1-5` (Tuesday 2026-09-15, 11:00Z), not from a manual action:
`funnel_daily[2026-09-15] = {drafted:1, sent:1}`.

**Disposition: NO RE-SEND.** The row is `sent`, the contact is `contacted`, `noRepeat()` gates
re-sends, and 3h50m elapsed with zero NDR. A second cold email would be a duplicate against a
first-contact academic and is not warranted. The counter-argument — that a re-send via the
*qnfo-email POST /send* path would produce the missing `messageId` — is rejected because it buys
evidence with a duplicate email to a human.

---

## 2. Failure modes

### FM-1 — Transport `messageId` discarded (root cause of the missing evidence)
`qnfo-outreach` v0.2.1 `sendRaw()` did:
`await env.SEND_EMAIL.send({...}); return { ok: true, err: "" }` — it **threw away `EmailSendResult`**.
Cloudflare's `send_email` binding is documented to return `{ messageId }` and to throw
`E_SENDER_NOT_VERIFIED` / `E_RATE_LIMIT_EXCEEDED` / `E_VALIDATION_ERROR`. So the transport id was
available and discarded.

Evidence — 8 rows `status='sent' AND message_id IS NULL`:
`2026-09-14 11:00:16–27Z` ×7 (aaronson, preskill, boixo, gsf, granade, apievangelist, fritschelab)
+ `2026-09-15 11:00:42Z` ×1 (c-wu-dt).
Contrast: the `08:11:49Z` batch (patterson / leiserson / feng) carries real ids
(`3cf3642b-…`, `ae95d69d-…`, `6a675ac0-…`) **and** has `emails` rows 738/739/740 — that batch went
through *qnfo-email POST /send*, a different, evidence-producing path.

### FM-2 — Transient failure was terminal, reason discarded, and blocked re-drafting
`sendGated()` on failure did only `UPDATE sends SET status='failed'` — no reason stored. Worse,
`draftCampaigns()` selects `contacts … NOT EXISTS (SELECT 1 FROM sends s WHERE s.contact_id = contacts.id
AND s.kind = ?)`, so the terminal `failed` row **permanently prevents re-drafting** while the contact
row stays `status='new'`. One transient error = invisible permanent loss of a target.

### FM-3 — `cf_worker_deploy` destroys bindings (code evidence, not inference)
`QNFO/qnfo-workers/qnfo-ops/worker.js:1374`:
`const metadataPart = JSON.stringify({ body_part: "worker.js", bindings: [] });`
An empty `bindings` array in the upload metadata. There is **no binding-write tool** on this endpoint
(`cf_worker_bindings` is read-only), so the wipe is **unrecoverable from here**. `qnfo-outreach` holds
`OUTREACH_D1`, `QNFO_AUDIT`, `LIVING_PAPER` (d1), `SEND_EMAIL` (send_email), `OUTREACH_TOKEN`
(secret_text). This is why FM-1/FM-2 were **not** deployed from this endpoint.

### FM-4 — `ops_d1_query` guard/limit friction
6-branch `UNION ALL` → `D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR`; a plain
`SELECT` without `LIMIT` → `rejected: add LIMIT n`. Worked around by one query per call and explicit
`LIMIT`. Cost: latency, not correctness.

### FM-5 — Schema-assumption errors (my error, not the tool's)
`SELECT … created_at FROM contacts` → `no such column: created_at`; same for
`cloud_ops_events.created_at` (real column is `ts`). Fixed by reading `sqlite_master` first.

### FM-6 — Model-layer drop (the literal instance of the user's complaint)
The turn before last ended with `deepseek 500: {"error":{"message":"Internal Server Error",
"type":"internal_error"}}` — the session died mid-execution with no deliverable. This is the
"prompt silently dropped" failure the user reported; it is upstream of this endpoint and is **not**
fixable here. It is recorded, and every artefact it lost has been re-derived and persisted in §3.

### FM-7 — Self-heal loop was blind to all of it
`agent_issues` open = **0** and `backlog_status` = `{healthy:true, version:"1.4.0", openBacklog:0}`
while 8 defective sends existed. Nothing had filed a ticket. (Related observability gap:
`funnel_daily[2026-09-15].sent = 1` but 4 outbound emails actually left that day — the funnel counts
cron sends only.)

### FM-8 — Concurrent agent session on the same repo/fleet
`cloud_ops_events` shows a **separate** session at `2026-09-15T14:51:51–14:52:14Z` running
`shell_exec` / `container.sh` against `/workspace/qnfo-workers` (grepping `qnfo-fleet-deploy`
routing and `qnfo-ai`) plus 9× `cf_worker_bindings`. I issued no `shell_exec` before 14:5x in this
session. Deploy race hazard — hence `expected_version` guards and no live deploy of a shared worker.

### FM-9 — **RETRACTED**: my own "phantom send" hypothesis
I initially concluded from the absence of the 11:00 sends in the `emails` ledger that they were
never transmitted. **That inference was wrong on two counts**: (a) the cron path
(`qnfo-outreach`) never writes to the `emails` ledger — it is a different worker from
`qnfo-email` — so absence there is *expected* and proves nothing; (b) the binding does expose a
`messageId`, so the id was discarded rather than never issued. Corrected statement: the sends were
almost certainly delivered (`res.ok` gates on the binding not throwing; no NDR in the mailbox since
2026-09-13 across all classifications), but delivery is **not retro-verifiable**.

### FM-10 — Delivery evidence is absent, and absence is weak
No NDR/bounce rows exist for the 09-14 or 09-15 cron sends (searched `emails` for
undeliver/delivery/failure/bounce/mailer-daemon/postmaster, all classifications, since 2026-09-13 →
0 rows). Note `funnel_daily.bounced` is **never written by any code path**, so `bounced:0` is a
dead column, not evidence.

---

## 3. Remediation executed

| Action | Evidence |
|---|---|
| `ALTER TABLE sends ADD COLUMN error TEXT` (live, qnfo-outreach D1) | `ok`, verified by read-back (`error` present, null) |
| `ALTER TABLE sends ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0` (live) | `ok`, verified by read-back (`attempts=0`) |
| **Commit `9d0ea1dd`** — `qnfo-outreach/worker.js` v0.2.2-evidence: `sendRaw` returns `{ok,err,messageId}` with `e.code` preserved; success persists `message_id` **and** writes the outbound into `qnfo-audit.emails`; failure persists `error`+`attempts` and retries while `attempts < 3`; `/health` exposes `sent_without_message_id` + `failed` | 13,382 → 15,075 B |
| **Commit `120dda8a`** — `qnfo-outreach/schema.sql` mirrors both columns for fresh installs | ok |
| Syntax validation of the committed bundle | `node --check` (Node **v22.23.2**), parsed as ESM → **SYNTAX OK** |
| Ledger column contract validated against live schema | `emails` has `message_id UNIQUE NOT NULL, sender, recipient, subject, body_text, body_html, headers_json, classification, status, received_at` — INSERT matches |
| 4 tickets filed in `agent_issues` | ids **919, 920, 921, 925** (read back: 919 OUTREACH-RETRY-1/medium, 920 OUTREACH-EVIDENCE-1/high, 921 CF-WORKER-DEPLOY-BINDING-WIPE-1/high, 925 OPS-D1-QUERY-GUARD-1/low — all `status='open'`) |
| Closeout persisted | ops-workspace `audits/2026-09-15-…closeout.md` (12,545 B) + this file (commit `75bd76d2`) |

Tickets: `OUTREACH-EVIDENCE-1` (high), `CF-WORKER-DEPLOY-BINDING-WIPE-1` (high),
`OUTREACH-RETRY-1` (medium), `OPS-D1-QUERY-GUARD-1` (low).

---

## 4. Not executed, and why

**The live deploy.** `cf_worker_deploy` would wipe `qnfo-outreach`'s 5 bindings (FM-3) and no tool
can restore them. Committing to the repo is the correct path: `qnfo-outreach/wrangler.toml` declares
all five bindings and cron `0 11 * * 1-5`, so the repo deploy path ships the fix with bindings intact.
`deployed-current.worker.js` was deliberately **not** touched — it must mirror the *live* bundle,
which is still 0.2.1.

**Verified post-condition:** live `qnfo-outreach` is still `version 0.2.1`, size 13,384 B, and all 5
bindings are intact (`cf_worker_bindings` → LIVING_PAPER, OUTREACH_D1, OUTREACH_TOKEN, QNFO_AUDIT,
SEND_EMAIL). Nothing was deployed and nothing was wiped.

**Consequence, stated plainly:** until the deploy runs, the live worker is still v0.2.1, so the next
weekday cron (2026-09-16 11:00Z) will again discard `messageId`. Expected residual damage: at most 8
more unverifiable sends (daily cap) before the fix ships.

---

## 5. Residual risk / falsifiers

- **DoD-2 is not fully satisfiable retroactively.** The Wu email's transport id no longer exists
  anywhere. The only honest claim is "dispatched, binding accepted it, no NDR in 3h50m".
- **FM-1 fix is unproven at runtime.** It is syntax-verified and schema-verified, but it has never
  executed against a live `send_email` binding. First real proof = `/health` returning
  `version: 0.2.2-evidence` and a non-null `message_id` on a new send row.
- **D1 read replication** means `ops_d1_query` results are single-replica reads; the earlier
  `changes:0` on the `ALTER`s was not proof of failure, which is why both were read back.
- **Falsifier for the whole "alignment" premise:** FDS's "capacity deficit / boundary maintenance"
  is not obviously the same object as DLF's realizability filter R. I did not verify that FDS cites
  Landauer or uses a rate–distortion formalism; only the contact `tags` (which I set) assert it.
  If FDS turns out to be purely combinatorial, the outreach hook ("your finite-systems work is
  adjacent") is weaker than the tags imply.
- **Concurrency:** another session is live on the same repo (FM-8); a deploy by it could ship
  `worker.js` v0.2.2 without the corresponding `wrangler.toml` review.

---

## 6. Open items

1. Deploy `qnfo-outreach` v0.2.2-evidence via the repo/wrangler path; verify `/health` →
   `version: 0.2.2-evidence`, `sent_without_message_id: 0` after the next send.
2. Fix `cf_worker_deploy` to re-send live bindings (or refuse to deploy binding-holding workers).
3. Instrument `funnel_daily.bounced` (currently a dead column).
4. Reconcile: which process sent the `2026-09-15 08:11:49Z` batch via *qnfo-email POST /send*?
   It is not logged in `ops_ai_log` and not attributable to this session — an unattributed sender
   with write access to `sends.message_id` is worth identifying.
