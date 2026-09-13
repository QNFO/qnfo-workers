# ADDENDUM 7 — two dead INSERTs in qnfo-research-exec, and a systemic missing-source problem

Date: 2026-09-13T15:15Z · Author: qnfo-ops / ops-exec
Status: **new defects found by source reading.** Scan/ensemble logic NOT reached — see §4.

---

## 1 — Two INSERTs that can never succeed

Read from `qnfo-research-exec/worker.js` (80,916 B, sha `6aea7f5d…`, `VERSION = "0.8.1-quality-gate-fix"`).

**Defect A** — `depositToGithub`, artifact tracking:

```js
await env.QNFO_AUDIT.prepare(
  'INSERT INTO publication_artifacts (publication_id, artifact_type, artifact_name, sha256,
                                      file_size_bytes, created_at)
   VALUES (?, ?, ?, ?, ?, datetime(now))'
).bind(...).run();
```

`datetime(now)` — **`now` is unquoted.** SQLite parses it as a column reference, so this raises
`no such column: now` and the statement fails **every time it runs**. Compare the correct form used
elsewhere in the same file: `updated_at=datetime('now')`.

**Defect B** — same function, event logging:

```js
await env.QNFO_AUDIT.prepare(
  'INSERT INTO cloud_ops_events (ts, kind, job, text)
   VALUES (datetime(now), artifact-deposit, qnfo-research-exec, ?)'
).bin...
```

Three separate errors in one statement:
1. `datetime(now)` — same unquoted-`now` failure as A;
2. `artifact-deposit` — **unquoted string literal.** SQLite reads this as `artifact - deposit`, i.e.
   a subtraction of two unknown columns → `no such column: artifact`;
3. `qnfo-research-exec` — same, unquoted.

Both statements are **dead code**: they cannot succeed on any input. This is a source-level fact, not
an inference — quoted literals are mandatory in SQL.

## 2 — Empirical corroboration

| prediction | measured |
|---|---|
| `publication_artifacts` never populated | **0 rows** (table exists) |
| `cloud_ops_events` has no `artifact-deposit` kind | **no such kind** — the only kinds present are `ai-error` (44) and `ai-empty` (29) |

Both hold. **Caveat:** 0 rows is also consistent with "the code path never ran". I cannot separate
"ran and failed" from "never ran" from this data. What §1 establishes independently is that if it
*did* run, it failed — the syntax is invalid regardless.

## 3 — Systemic: at least three workers have no canonical source

| worker dir | contents |
|---|---|
| `qnfo-arxiv-radar` | `README.md`, `deployed-current.worker.js` — **no `worker.js`** |
| `qnfo-research-radar` | `README.md`, `deployed-current.worker.js` — **no `worker.js`** |
| `research-daily-brief` | `README.md`, `deployed-current.worker.js` — **no `worker.js`** |
| `qnfo-research-exec` | has `worker.js` ✔ |
| `qnfo-ai-calibration` | has `worker.js` ✔ |

`qnfo-arxiv-radar`'s README states:

> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

**The declared canonical source does not exist.** Only the compiled bundle is present. This is the
third instance today of a documented invariant the repo contradicts (with `qnfo-ops`'s
byte-for-byte mirror claim and `qnfo-research-exec`'s dead INSERTs).

Consequence: any session attempting to fix the arXiv scan — the root cause of the pipeline stall —
will open `qnfo-arxiv-radar/worker.js` and find **no file**. The fix path is blocked by repo hygiene
before it is blocked by anything technical. `qnfo-research-radar` and `research-daily-brief` are
blocked identically.

## 4 — What I did NOT establish

I read the first 30,000 chars of an 80,916-byte file. In that portion I found the publish path, the
LaTeX pipeline, the quality gate, and the GitHub deposit — **but not the `research-scan` job and not
the ensemble leg logic that produces `"ensemble: only 0/3 legs produced drafts"`.** Those live in the
~51,000 chars I could not read.

So the ADDENDUM 6 hypothesis (arXiv 429 swallowed as an empty result set) **remains unconfirmed.**
I have neither confirmed nor refuted it. Anyone continuing this should read the remainder of
`qnfo-research-exec/worker.js` and grep it for `research-scan`, `arxiv`, and `legs`.

## 5 — Recommended actions (unchanged in order, with one addition)

1. **Fix the two dead INSERTs** — trivial, and until they are fixed every artifact deposit and its
   audit event is silently unrecorded. The `.catch()` around them is why nobody noticed.
2. **Restore `worker.js`** for the three workers above, or correct their READMEs.
3. Then the ADDENDUM 5/6 items: read the scan's response handling, add the zero-output alarm,
   honour arXiv's 3s delay and User-Agent.
4. RC-1 / RC-2 remain worth doing; they clear 8 tickets and are cosmetic next to the stall.

## 6 — Limits

- §1 is read from source and is definitive as *syntax*; whether those lines execute is not.
- §2's zero-row evidence is corroborative only, not proof.
- §3 lists three directories I checked. There may be more — I did not enumerate all ~90 worker dirs
  for a missing `worker.js`.
- I did not reach the scan or ensemble code. ADDENDUM 6's hypothesis stands unconfirmed.
- This is the **ninth** entry in this session's correction series, and the second produced by
  pursuing an open question rather than by being contradicted.
