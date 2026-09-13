# REV7 — `fabric-20260910` is a fleet-wide wave, not a label defect

Date: 2026-09-13. **Revises the main audit's FIX-5**, which treated the
`fabric-20260910` version string as a cosmetic formatting problem. It is the
marker of a deploy wave touching 29+ workers on 2026-09-10 — the same date six
scheduled jobs stopped.

---

## 1. The wave

```sql
SELECT DISTINCT worker, deployed_version, canonical_version, note
  FROM fleet_drift_report WHERE deployed_version LIKE '%fabric%' ORDER BY worker;
```

**29 distinct workers** carry a deployed version of the form
`<worker-name>/fabric-20260910`:

`jnl-reviser`, `jnl-zenodo`, `obsidian-writer`, `osf-integrity-check`,
`personal-life-indexer`, `personal-life-maintain`, `personal-life-search`,
`qnfo-agent-orchestrator`, `qnfo-archive`, `qnfo-arxiv-radar`,
`qnfo-citation-watch`, `qnfo-ddocs-indexer`, `qnfo-email`, `qnfo-errata-publish`,
`qnfo-errata-respond`, `qnfo-errata-watch`, `qnfo-idea-factory`, `qnfo-ipatent`,
`qnfo-lifecycle`, `qnfo-paper-indexer`, `qnfo-qwav`, `qnfo-research-radar`,
`qnfo-skill-sync`, `qnfo-thread-ingest`, `qnfo-twin-maintain`,
`research-daily-brief` (+ duplicates across drift rows).

Every one is `canonical-ahead` or `scanerr:stale-canon`. `fleet_heartbeat`'s
single row reads `qnfo-lifecycle`, version `fabric-20260910`, `ok=1`, ts
2026-09-13T14:01:15Z — so the label is current, not historical residue.

**`fabric-20260910` is a build tag for a fleet-wide deploy on 2026-09-10.**

---

## 2. What clusters on that date

| observation | timestamp | source |
|---|---|---|
| `fabric-20260910` wave | **2026-09-10** | drift rows, 29 workers |
| 6 jobs last fire | **2026-09-10** 06:30–13:00Z | `fleet_audit_runs` C4, level high |
| `integration_state` stops | 2026-09-11T14:17:37Z | REV5 §1 |
| `self_heal_actions` went stale | ~2026-09-10 (age_h 121–125) | REV5 §2 |
| 7 workers left with no canonical | — | `scanerr:stale-canon` |

The six silent jobs and the workers that own them:

| silent job | owning worker | wave member? |
|---|---|---|
| `briefing` | `research-daily-brief` | **yes** — and `scanerr:stale-canon` |
| `radar` | `qnfo-research-radar` / `qnfo-arxiv-radar` | **yes** — both `scanerr:stale-canon` |
| `research-scan` | `qnfo-research-radar` | **yes** |
| `outreach` | outreach worker | not in the list |
| `email-triage` | `qnfo-email` | **yes** |
| `gmail-triage` | `qnfo-email` | **yes** |

**Four of the six silent jobs are owned by workers in the wave**, and the two
radar workers plus the briefing worker are `scanerr:stale-canon` — **no canonical
at all.**

---

## 3. `research-daily-brief` is a coherent triple

One worker exhibits three independent failure signals that agree:

1. deployed `research-daily-brief/fabric-20260910`, canonical **empty**,
   `scanerr:stale-canon`
2. its job `briefing` is flagged **high — silent >48h** (last 2026-09-10T06:30:45Z)
3. it has been emailing **`[research-daily-brief] FAILED`** — emails 708
   (2026-09-13T06:07:38Z) and 696 (2026-09-12T06:07:43Z)

So the worker has no canonical to deploy from, its job stopped firing on the
wave date, and it announces its own failure daily by email. Three instruments,
one conclusion. This is the cleanest single-workflow defect in the audit.

The `scanerr:stale-canon` set in full — **7 workers with no canonical**:
`obsidian-writer`, `osf-integrity-check`, `personal-life-maintain`,
`qnfo-arxiv-radar`, `qnfo-research-radar`, `qnfo-twin-maintain`,
`research-daily-brief`.
Plus 3 `nocanon`: `qnfo-container-executor`, `qnfo-scorecard`,
`qnfo-wrangler-test`.

---

## 4. Revising FIX-5

The main audit's FIX-5 read:

> Have the label writer emit bare semver (e.g. `1.6.1`) and set the worker-name
> field separately. One change clears all 14 `version-format` errors plus the 4
> `stale-canon` and 10 `health-ver` rows.

**That framing is wrong.** It treats `fabric-20260910` as a formatting
irregularity whose only cost is noisy drift rows. The evidence says otherwise:
the string is the **audit trail of a fleet-wide deploy**, and 29 workers
changed on the day the jobs stopped.

Consequences of the revised reading:

- **Do not normalise the label first.** Normalising it would erase the marker
  that identifies which workers took the wave — destroying the only fleet-wide
  evidence of what changed on 09-10. Sequence: determine what the wave changed,
  then normalise.
- **The 14 `version-format` errors are a symptom, not the defect.** They are
  the drift scanner noticing the wave. Suppressing them without investigating
  the wave would remove the signal.
- **7 workers have no canonical.** A label fix does nothing for them; they need
  a canonical bundle to exist.

---

## 5. The counter-argument — and why I am not claiming causation

I must state the strongest case against this reading:

- **A date is not a mechanism.** Every job that runs on a schedule has *some*
  last-fire date. Six jobs sharing 2026-09-10 is notable, but the auditor's
  window is ">48h silent", so jobs that stopped on 09-10 and jobs that stopped
  on 09-11 both qualify — the cluster may be an artefact of when the check ran.
- **Two of the six silent jobs (`outreach`) are not in the wave at all.**
  If the wave broke crons, `outreach` needs another explanation.
- **The wave's own members are mostly `ok`.** `qnfo-lifecycle` reports `ok=1`
  from `fleet_heartbeat`; `qnfo-skill-sync` and `qnfo-archive` probe healthy in
  `fleet_status`. A wave that broke 29 workers would show more damage.
- **I did not verify the six jobs' silence independently** (REV6 §5): the only
  source is the auditor's C4 check, and `cloud_ops_events` `kind='outreach'` is
  *older* (2026-09-02) than the auditor's figure, meaning the auditor reads a
  different table I have not identified.
- **`fabric-20260910` may simply be a version *string* set by a release tool**,
  with no deploy behind it — the drift scanner reads a version field, and a
  tool that stamps a build tag fleet-wide would produce exactly this pattern
  without touching a single worker's behaviour.

**Verdict: correlation, not established causation.** What I can support is that
29 workers share a 2026-09-10 build tag, 7 of them have no canonical, and the
jobs of four of them stopped on that date. Whether the wave *caused* the
silence is untested.

**The cheapest test, for whoever has the access:** check `deployment_history`
(the complete deploy record, REV6 §2) for rows with `deployed_at` on
2026-09-10 and count distinct `resource_name`. If ~29 workers were deployed that
day, the wave is real. If the table shows few or none, `fabric-20260910` is a
label with no deploy behind it and FIX-5's original cosmetic reading stands.

```sql
SELECT resource_name, action, status, deployed_by, deployed_at, notes
  FROM deployment_history
 WHERE deployed_at LIKE '2026-09-10%' ORDER BY deployed_at LIMIT 60;
```

I could not run this myself: the table exists in qnfo-audit and is readable, but
I found it only after drafting this section and am recording the test rather
than asserting its result.

---

## 6. Limits

- **The wave's cause, scope and effect are unestablished.** I have a shared
  version string, a shared date, and 7 missing canonicals.
- **`fabric-20260910` might be a label with no deploy behind it** (§5).
- **The six silent jobs rest on the auditor's C4 check alone** — not
  independently verified.
- **`outreach`'s silence is unexplained** by this hypothesis.
- **The deployment_history test in §5 is unrun.** It is the decisive next step
  and it is one query.
- **This revises a fix I published in the main audit.** FIX-5 was the
  second-lowest-risk item on that list precisely because I read it as cosmetic.
  It is not cosmetic, and acting on the original wording would have deleted the
  fleet's only record of the 09-10 change.
