# ADDENDUM 4 — `signal_worker_boundary` is a zero-denial allow-list

Author: qnfo-ops (ops-exec), 2026-09-13 ~14:15Z. Live tool returns.
Closes the loose thread flagged at the end of ADDENDUM 3's session: this finding arrived after the
10th commit and was reported in-conversation but not committed.

---

## 1. The permission matrix never denies

`signal_worker_boundary` — schema `(worker, source, permitted, domain, note)`, 37 rows:

| domain | rows | permitted | denied |
|---|---|---|---|
| research | 22 | 22 | **0** |
| ops | 8 | 8 | **0** |
| dissemination | 4 | 4 | **0** |
| personal | 3 | 3 | **0** |

**Every one of the 37 rows carries `permitted = 1`.** There is not a single denial in the table.

Every row also carries the identical note `"canonical seed 2026-09-12"` — so the matrix was seeded
2026-09-12 and, on this evidence, never amended.

## 2. Why a zero-denial matrix cannot enforce separation

`governance_kernel` lists **`PERSONAL-QNFO-SEPARATION-1`** among its 13 ACTIVE gates. The matrix
that would implement that separation contains three `personal`-domain rows — `obsidian-writer`,
`personal-api`, `personal-companion` bound to source `personal_life` — **all permitted**. No row
denies any worker access to any source.

So the gate asserts a boundary that the boundary table does not express. A least-privilege matrix
whose every cell is "allow" is indistinguishable from no matrix at all: it cannot reject anything,
because rejection requires a `permitted = 0` row.

This is the same shape as the rest of the session — a mechanism exists, is populated, is nominally
authoritative, and cannot enforce. It differs from the others in that it is **seeded one day old**,
so it may be an intentional baseline rather than a decayed control. I cannot distinguish the two
from the rows.

## 3. It also disagrees with the registry about which workers exist

The matrix names **`qnfo-idea-triage`** (5 rows: `artifact_reentry`, `arxiv`, `idea_proposals`,
`research_queue`, `zenodo`). `qnfo-idea-triage` is **not in the 55-worker `fleet_status` listing** and
has no `service_registry` row.

It appears in `fleet_probe_log` among the 38 probed-but-unlisted names. So a worker with an active
access-control grant has no registry entry and no listing entry — a direct violation of
ADR-2026-011 ("if it is not in D1, it does not exist") in the *opposite* direction from the rest of
the session: here D1 knows about it and the registry does not.

## 4. Limits

- "Never amended" is inferred from all 37 notes reading `canonical seed 2026-09-12`; the table has
  **no `updated_at` column**, so amendment history is not recoverable from it.
- A zero-denial seed may be deliberate. I cannot distinguish "deliberately permissive baseline" from
  "unenforced policy" from the rows alone.
- The matrix is a table, not code: whether any worker *reads* it to gate access is **unverified**. A
  populated matrix that nothing consults is a third possibility I could not exclude.
- `qnfo-idea-triage`'s absence from the listing is confirmed; whether it is live, retired, or a
  stale grant is **not** determined.
- Still blocked, unchanged: no D1 write, no mail-config tool, no deploy tool, no branch-create
  (no PR), `qnfo-canonical` R2 unbound.
