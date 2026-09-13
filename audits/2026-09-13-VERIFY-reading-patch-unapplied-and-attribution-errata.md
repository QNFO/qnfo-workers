# VERIFY — the reading.q08.org patch is staged, not applied; and a repo-attribution errata (2026-09-13)

Author: qnfo-ops. Every figure below is a live tool return from this session (2026-09-13, ~06:26–06:57Z).
Read alongside `personal-companion/sql/QRI-4-body-corrections-verified-2026-09-13.sql` (the patch),
`personal-companion/ERRATA-2-AND-FINDINGS-2026-09-13.md`, and the ops-workspace file
`audits/2026-09-13-QRI-4-verified-and-guard-defect.md`.

## 1. RETRACTION — "the artifacts appear false" was my own error, not a missing file

In the preceding ops turn I reported that the staged artifacts could not be found and therefore
"appear false". That conclusion was wrong, and the cause was mine: I queried the repo
`QNFO/personal-companion`, which **does not exist** (GitHub org search `org:QNFO companion` →
`total_count 0`). The artifacts live in **`QNFO/qnfo-workers`**, which my own workspace record had
named and which I failed to consult before publishing the negative.

Verified present (contents API, 2026-09-13):

| path | size (B) | blob sha (12) |
|---|---|---|
| `personal-companion/sql/QRI-4-body-corrections-verified-2026-09-13.sql` | 14,839 | `0591c37e403e` |
| `personal-companion/ERRATA-2-AND-FINDINGS-2026-09-13.md` | 12,749 | `167b30590e76` |
| `personal-companion/ERRATA-2026-09-13.md` | 17,690 | `b6bd9da1e97f` |
| `personal-companion/sql/APPLY-ORDER-2-2026-09-13.md` | 5,784 | `571f307838ca` |
| `personal-companion/ADDENDUM-2026-09-13-gate-wiring.md` | 7,285 | `870dfe8ea180` |
| `qnfo-ops/FINDING-2026-09-13-d1-guard-ADDENDUM-source-check-failed.md` | 4,167 | `c405b4604f01` |
| `audits/2026-09-13-QRI-4-verified-and-guard-defect.md` (ops-workspace, R2) | 11,669 | — |

**Unverified, stated as such:** the commit shas I quoted in that turn (`6e71e254`, `b544e8d7`,
`25ea89f6`) do **not** appear among the 12 most recent commits of `QNFO/qnfo-workers` (latest
`e7810238` 06:56:20Z, `bd095e65` 06:56:13Z, `18febe68` 06:55:56Z). I did not page the history. Treat
those shas as unconfirmed; the files themselves are confirmed.

Lesson: a negative existence claim is only as good as the path tested. I tested a path I had
invented rather than the one my own record named.

## 2. The patch is NOT applied — proven with QRI-4's own post-flight probe

Live query against `PERSONAL.companion_pieces` `id = 8`, running §5 of QRI-4:

| probe | expected after patch | live |
|---|---|---|
| `length(body_md)` | 15323 | **15517** |
| `word_count` | 2511 | **2539** |
| `instr('Five days later')` | 0 | **332** |
| `instr('dining hall')` | 0 | **27** |
| `instr('about forty people')` | 0 | **70** |
| `instr('cost roughly the same in travel and time')` | 0 | **535** |
| `instr('he rated the same week')` | 0 | **476** |
| `instr('Rowan')` | 0 | **289** |
| `instr('QPL')` | 0 | **352** |
| `instr('CWI')` | 0 | 0 ✓ |
| `instr('seven days apart')` | > 0 | **0** |
| `instr('On 10 August 2026 LoF26 opened')` | 1 | **0** |
| `instr('the second room')` | > 0 | **0** |
| `json_extract(quality_json,'$.gate')` | `blocked-grounding` | **`passed`** |
| `json_extract(quality_json,'$.qri4_at')` | 2026-09-13 | **null** |

`instr('a status tournament')` = 423, i.e. the record-supported phrase QRI-4 restores is present in
the unpatched text — consistent with §A.1 (QRI-2 would have deleted it; QRI-4 keeps it).

Reader-visible consequence, same session: `https://reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196`
returns **HTTP 200** and serves the defective sentences verbatim.

## 3. Confirmed a third time — the read-only guard rejects mutation keywords inside string literals

Executed this session:

`SELECT 'update' AS literal_probe, 'a delete statement' AS literal_probe_2 LIMIT 1`

→ rejected: *"read-only SELECT/WITH only - mutation keywords are rejected anywhere in the statement"*.

This is the third independent confirmation (after `replace('abc','a','b')` and a `'... delete ...'`
literal). The guard is a raw-text substring scan, not a parser. Separately, the tool enforces a
`LIMIT` on plain selects (an aggregate is exempt) — a second, independent check.

Blast radius, `telemetry_report` 24 h at 06:57:08Z: **5,215** tool calls, **570** failures, 249 chats,
45 chat failures; top failing tools `web_fetch` 304, `ops_d1_query` **139**, `web_search` 41,
`github_file_write` 36, `github_repo_read` 23. `telemetry_analyze` 24 h: `scanned 10`,
`persistent []`, `filed 0`, `alreadyOpen 3` — the self-heal detector still cannot see this class.

## 4. Blocked, with the exact reason

| item | blocker |
|---|---|
| Applying the SQL | `ops_d1_query` is SELECT/WITH only. Proven unapplied in §2. |
| Gate deploy / `COMPANION_KEY` / `worker.js` patch | No deploy tool and no secret-write path on qnfo-ops. |
| Filing an `agent_issues` row | No insert tool; `telemetry_analyze` filed nothing. |
| `ops_issue_run` drain | Refused this turn: *"execution requires explicit affirmation in YOUR latest message (yes / go ahead / drain it)"*, `dryRun true`, `openBacklog 25`. |

## 5. Failure modes of this note

- I verified the **presence and size** of the staged files; I read the **content** of only QRI-4 (full)
  and ERRATA-2 (partial). The other files are confirmed to exist, not to say what their names imply.
- §2 proves the row is unmodified. It does **not** prove the SQL would apply cleanly (e.g. `replace()`
  semantics against a 15 KB body, `json_set` availability, the idempotence guards).
- `github_file_write` failed 36 times in 24 h; this write may be one of them — check its return.
- Roughly 40 documents have been written about this one defect today, with zero applied changes.
  Recording that ratio is not remediation, and no further document closes it.
