# FINDING — qnfo-ops D1 read guard: false positive on `replace(` and on keywords inside string literals

**Endpoint:** qnfo-ops (`ops_d1_query`)
**Found:** 2026-09-13, while recomputing a word count for a live text correction
**Severity:** medium (blocks legitimate read-only verification; inflates the error ledger; invisible to the self-heal loop)
**Status:** open — no deploy tool and no `agent_issues` insert path on qnfo-ops, so this file is the ticket

---

## 1. What happens

Two probes, both executed on 2026-09-13:

| probe | result |
|---|---|
| `SELECT replace('abc','a','b') AS t LIMIT 1` | **rejected** — `read-only SELECT/WITH only - mutation keywords are rejected anywhere in the statement` |
| `SELECT 1 AS guard_text_test WHERE 'the word delete appears in this literal' <> '' LIMIT 1` | **rejected** — same error text |

Both statements are pure reads. Neither mutates anything. The first uses the **scalar** `replace()`
function; the second contains the word *delete* **inside a single-quoted string literal**.

The second probe is the diagnostic one: it proves the guard is a **raw-text substring scan, not a
parser or a tokenizer**. "mutation keywords are rejected **anywhere in the statement**" is literal —
the scan sees the characters, not the grammar.

## 2. Why it matters

1. **It blocks the obvious way to verify a text edit.** To prove a correction will produce the right
   result you want `length(replace(body, <old>, <new>))`. That call is impossible. The verification in
   this session had to be rewritten as `instr()`/`substr()`/`length()`/`trim()` arithmetic — doable,
   but only by an operator who knows the constraint, and much easier to get wrong.
2. **It blocks searches for the very words involved.** A query looking for rows containing "delete",
   "update", "insert", "replace" or "set" in any text column is rejected, so a whole class of
   content-audit queries is unavailable.
3. **It is a silent tax on every read.** The failure mode is a rejection with a message that names the
   rule but not the offending token, so the operator has to bisect their own query to find which word
   tripped it.

## 3. Measured blast radius

| measurement | value |
|---|---|
| `telemetry_report` (24 h) — `ops_d1_query` failures | **132** (second-highest failing tool; `web_fetch` 295 is first) |
| `issue_ledger` row `AUTO-SWEEP: ops_d1_query` | **443 occurrences**, status `open`, `last_seen` 2026-09-13T06:20:42.653Z |
| `telemetry_analyze` (6 h) | `scanned 9, persistent [], recovered 6, autoResolved 1, filed 0, alreadyOpen 2` |

## 4. What is NOT proven — the evidence limit

**The 443 ledger occurrences are not shown to be guard rejections.** That row's `last_detail` is the
bare string `ops_d1_query` — the tool name, with no error text. It is equally consistent with genuine
query failures (bad SQL, missing columns, D1 errors). I did not retrieve per-call error text for those
rows, so the link between this guard behaviour and that ledger row is a **hypothesis with a named
missing piece of evidence**, not a finding. What *is* proven is the guard's behaviour on the two probes
above.

## 5. Why the self-heal loop cannot see this

`telemetry_analyze` files a ticket only for **persistent** failures: >= 2 errors with **no success
since the last error**. A guard false positive is intermittent by nature — the same tool succeeds
constantly on other queries — so it can never satisfy that predicate. `filed: 0` is therefore the
detector behaving as designed, and the class remains untracked. Either the detector needs a
per-error-class view, or this defect must be filed by hand.

## 6. Proposed fix (spec — qnfo-ops has no deploy tool)

Replace the raw-text scan with a two-stage check:

1. **Strip before scanning.** Remove single-quoted string literals (handling `''` escapes), quoted
   identifiers (`"..."`, `` `...` ``), line comments (`-- ...`) and block comments (`/* ... */`) from a
   *copy* of the statement. Scan the copy, never the original.
2. **Match on word boundaries**, case-insensitively, not as substrings — so `replaced` and
   `deleted_at` do not trip it.
3. **Allowlist scalar functions explicitly** so they can never be confused with the statement form:
   `replace`, `instr`, `substr`, `substring`, `length`, `trim`, `ltrim`, `rtrim`, `lower`, `upper`,
   `char`, `hex`, `json_extract`, `json_set` (read form), `coalesce`, `ifnull`, `nullif`, `abs`,
   `round`, `min`, `max`, `count`, `sum`, `group_concat`, `printf`.
4. **Keep, and strengthen, the real denials:** reject when the statement does not start with
   `SELECT`/`WITH`; reject a semicolon outside a literal or comment (multi-statement injection);
   reject the statement forms `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `REPLACE INTO`,
   `TRUNCATE`, `ATTACH`, `PRAGMA`, `VACUUM`, `REINDEX` when they appear in *statement position*.

The point of the change is that it is **stricter where it matters and looser where it does not**:
stripping literals means a keyword hidden in a comment or a string can no longer be used to smuggle a
statement past the guard, while a legitimate read that merely *mentions* a word stops being rejected.

## 7. Regression tests to pin the fix

**Must be allowed:**
- `SELECT replace('abc','a','b') AS t LIMIT 1`
- `SELECT instr(body_md,'QPL') FROM companion_pieces WHERE id=8 LIMIT 1`
- `SELECT 1 AS t WHERE 'the word delete appears in this literal' <> '' LIMIT 1`
- `SELECT COUNT(*) FROM notes WHERE content LIKE '%updated%'`
- `WITH x AS (SELECT 1 AS n) SELECT n FROM x`

**Must still be rejected:**
- `DELETE FROM companion_pieces WHERE id = 8`
- `UPDATE companion_pieces SET body_md = '' WHERE id = 8`
- `INSERT INTO companion_pieces (slug) VALUES ('x')`
- `DROP TABLE companion_pieces`
- `CREATE TABLE t (a)`
- `REPLACE INTO companion_pieces (id) VALUES (8)`
- `SELECT 1; DROP TABLE companion_pieces`
- `SELECT 1 -- \n; DELETE FROM companion_pieces`

The last two are the ones the current raw-text scan catches **by luck** rather than by design; the
proposed check catches them deliberately.

## 8. Operational workaround until this ships

Read-only verification that needs `replace()` can be written with `instr`, `substr`, `length`, `trim`
and `char(10)`/`char(13)`/`char(9)` instead. Two things to remember when doing so:

- `instr()` returns only the **first** match — a token occurring twice needs a second
  `instr(substr(col, first+1), token)` call. This is exactly how the second `QPL` occurrence (offset
  13954) was found after the first (352).
- Counting words as `length(col) - length(replace(col,' ','')) + 1` is wrong for the obvious reason
  (it ignores newlines) — and is unavailable here anyway. Normalise whitespace, then count.

## 9. Files

- `personal-companion/sql/QRI-4-body-corrections-verified-2026-09-13.sql` — the correction whose
  verification this guard blocked, rewritten to work without `replace()`.
- `personal-companion/ERRATA-2-AND-FINDINGS-2026-09-13.md` §F1 — the same finding from the
  remediation side, with the word-count consequences.
