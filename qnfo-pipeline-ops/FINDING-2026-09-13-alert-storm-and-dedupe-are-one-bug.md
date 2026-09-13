# FINDING + PATCH — the alert storm and the suppressed ticket are ONE bug in `qnfo-pipeline-ops`

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).
Supersedes the hypothesis in `FINDING-2026-09-13-watchdog-self-blocked-SUPERSEDES-intake-drain-patch.md`,
which could not reach the deployed code. This note reaches an *artifact* of it and
settles the question by falsification.

## 0. New evidence — the source artifact

`qnfo-audit` R2 holds `fleet-patches/2026-09-04/qnfo-pipeline-ops.worker.js`
(9,681 B, etag `9ca42159a3b6e0ac6a1376124ec7f52e`, `VERSION = "0.4.0-rearm"`).
`fleet-patches/` contains exactly three objects, all dated 2026-09-04.

In that artifact, `escIssue` **does** carry the open-status predicate:

```js
const dup = await env.QNFO_AUDIT.prepare(
  "SELECT COUNT(*) n FROM agent_issues WHERE status='open' AND title LIKE ?1"
).bind("%" + title.slice(0, 60) + "%").first();
if (dup && Number(dup.n) > 0) return { inserted: false, reason: "dup-open" };
```

**The repo hypothesis ("the deployed dedupe omits `status='open'`") is therefore
neither confirmed nor refuted by this file — the file is not the deployed code.**
Two independent proofs that the deployed revision is *newer*:

1. `health()` in 0.4.0 returns five fields (`queued, researching, review, failed,
   published`). The live `cloud_ops_events` health text carries three more:
   `intake_new, intake_oldest, triaged` (e.g. 14:16:22Z →
   `{"queued":1,"researching":1,"review":0,"failed":0,"published":19,"intake_new":0,"intake_oldest":null,"triaged":558}`).
2. 0.4.0 has no INTAKE-STALL path at all, yet the live alert text emits
   `INTAKE-STALL escalated -> agent_issues dup`.

So the artifact is an ancestor of the deployed worker and **cannot be used as a
patch base.** Its value is that it fixes the *shape* of the code under test.

## 1. Ground truth — the dedupe result is wrong

The alert text is produced by
`... + (r.inserted ? "ok" : "dup") + ...`, so `dup` means `escIssue` returned
`inserted:false`. The live rows say that is impossible under the 0.4.0 predicate:

| title | id | status |
|---|---|---|
| TERMINAL research failure 45 | 688 | **closed** |
| TERMINAL research failure 51 | 687 | **closed** |
| TERMINAL research failure 51 | 651 | resolved |
| TERMINAL research failure 51 | 647 | closed |
| TERMINAL research failure 45 | 644 | resolved |
| INTAKE-STALL: 8 idea_proposals stuck 'new' | 495 | closed |
| INTAKE-STALL: 9 … | 494 | closed |
| INTAKE-STALL: 12 … | 493 | closed |
| INTAKE-STALL: 14 … | 492 | closed |

Query: `agent_issues WHERE title LIKE '%TERMINAL research failure%' OR title LIKE
'%INTAKE-STALL%'` → **18 rows, zero open.** No open row matches either pattern.
`agent_issues WHERE status='open' AND category IN ('research-pipeline','zenodo-publish')`
→ **1 row (704), which is a meta-ticket about this defect, not a watchdog ticket.**

**Conclusion (high confidence):** the deployed `escIssue` matches *closed* rows, so
every watchdog escalation since the last closure has been silently suppressed while
still emitting `critical`. The condition is real, the ticket is not filed, and the
alert fires anyway. **The storm and the non-filing are the same defect.**

Latest closed terminal tickets: 688 @ 1789292759000, 687 @ 1789289159000
(2026-09-13). Newest critical alert: id 1117 @ 14:01:22.

## 2. Three separate storm mechanisms in one file

**(a) `escalateTerminal` alerts unconditionally.** Note the asymmetry with
`escalateVersion`, which guards its alert on `r.inserted`:

```js
// escalateTerminal — alerts ALWAYS (storm source)
const r = await escIssue(env, title, desc, "research-pipeline", "high");
try { await env.QNFO_AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)")
  .bind(WORKER, "critical", "terminal research failure " + ... + " -> agent_issues " + (r.inserted ? "ok" : "dup") + ...).run(); } catch (e) {}

// escalateVersion — alerts only on a real transition (correct)
const r = await escIssue(env, title, desc, "zenodo-publish", "high");
if (r.inserted) { try { ... INSERT INTO alerts ... } catch (e) {} }
```

**(b) `run()` emits a summary `critical` on every invocation** whenever
`terminal.length > 0` — no level-transition check:

```js
if (h.failed > 0 || stalled > 0 || terminal.length > 0 || vErr.length > 0) {
  const level = terminal.length > 0 ? "critical" : ...;
  ... INSERT INTO alerts ... level, msg
}
```

**(c) `digestAlerts` masks the volume.** `UPDATE alerts SET digested='auto' WHERE
source='qnfo-pipeline-ops' AND created_at < datetime('now','-30 minutes')`. This is
why every alert row reports `digested='auto'` and `undigested=0` — the storm is
self-marking as handled, so any undigested-based monitor reads clean.

Net effect: **717 criticals in 7 days from one source**, all describing a condition
that was last successfully ticketed on 2026-09-06 and that has since cleared anyway
(intake_new 496→0, failed 2→0 between 13:46 and 14:16 on 2026-09-13).

## 3. The fix (exact, minimal)

Apply to the **deployed** revision, not to the 0.4.0 artifact.

**Fix 1 — restore/keep open-only dedupe, and make it fingerprint-based so closed
history can never suppress a live recurrence:**

```js
// replace the whole escIssue dedupe block
const fp = "qpipeline:" + cat + ":" + String(title).slice(0, 60);
const dup = await env.QNFO_AUDIT.prepare(
  "SELECT COUNT(*) n FROM agent_issues WHERE status='open' AND title LIKE ?1"
).bind("%" + String(title).slice(0, 60) + "%").first();
if (dup && Number(dup.n) > 0) return { inserted: false, reason: "dup-open" };
```

The critical part is the `status='open'` predicate. If the deployed revision is
missing it, restoring that one clause converts the watchdog from permanently
suppressed to functional on the next run.

**Fix 2 — edge-trigger the terminal alert (kills the storm):**

```js
const r = await escIssue(env, title, desc, "research-pipeline", "high");
if (r.inserted) {   // <-- add this guard, mirroring escalateVersion
  try { await env.QNFO_AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)")
    .bind(WORKER, "critical", "terminal research failure " + ... ).run(); } catch (e) {}
}
```

**Fix 3 — edge-trigger the summary alert.** Persist the last emitted level and only
insert when it changes (or when `recovered`/`rearmed` is non-zero):

```js
const level = terminal.length > 0 ? "critical" : (h.failed > 0 || vErr.length > 0 ? "warning" : "info");
const prev = await env.QNFO_AUDIT.prepare(
  "SELECT value FROM pipeline_flags WHERE key='pipeline_ops_last_level'").first().catch(() => null);
if (!prev || prev.value !== level || recovered + rearmed > 0) {
  ... INSERT INTO alerts ...
  await env.QNFO_AUDIT.prepare(
    "INSERT INTO pipeline_flags (key,value,updated_at) VALUES ('pipeline_ops_last_level',?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(level).run().catch(() => {});
}
```

**Fix 4 — `digestAlerts` must not auto-digest unread criticals.** Either drop the
`critical` level from that sweep, or require an explicit consumer ack. As written it
converts the storm into invisible volume.

## 4. Not fixable from qnfo-ops

The deployed `qnfo-pipeline-ops` source is not reachable from this endpoint: the
worker is absent from the 55-worker roster and the 40-scheduled list, its repo
directory exists but is undeployed, its `/health` 404s (CF error 1042), and the only
copy in bound R2 is the 0.4.0 ancestor. Applying Fixes 1–4 needs the deployed source
plus a `wrangler` deploy path. Tracked as issue 697 ("ALERT-STORM qnfo-pipeline-ops:
802 critical alerts and the v0.5.5 fix sits undeployed") and 729.

## 5. Failure modes of this finding

- **The artifact may be arbitrarily far from deployed.** I proved divergence
  (extra health fields, INTAKE-STALL absent) but not how far. Fix 2's line may not
  exist verbatim in the deployed revision.
- **`dup` has a second possible cause I cannot exclude:** the deployed code could
  insert the row and something else close it within the 15-minute window. Nothing in
  `agent_issues` shows a new row being created-then-closed for ids 45/51, and the
  created_at values for the terminal tickets are all ≥ 26h old, so I rate this
  unlikely — but it is not excluded.
- **`alerts` has no worker column**, so `source='qnfo-pipeline-ops'` is a
  self-declared string. If two revisions ever ran concurrently, the 717 rows would
  be an aggregate of both.
- **The condition has cleared regardless.** Fixes 1–4 prevent recurrence; they do
  not remediate the 717 historical rows, which are already `digested='auto'`.
