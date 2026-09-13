# ADDENDUM 2 to the public job-status route — the ID entropy is not in effect, and §2.4 exposes `response`

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
Status: **BLOCKING for the spec in `patches/2026-09-13-public-job-status-route.md` (sha `08dc0674`).**
Companions: ADDENDUM-canonical-lag, `patches/2026-09-13-D18-duplicate-job-execution.md` (sha `2ebf67c0`).

All figures below are live `ops_d1_query` / `web_fetch` / `run_code` returns from this session.

---

## 1. Spec §2 contains a rationale that is factually false

The spec justifies returning `response` unauthenticated like this, verbatim:

> Rationale for allowing `response`/`tool_log` unauthenticated: **job ids are random (`randId()` =
> 8 hex + 6 hex of `Date.now()`) and are not enumerable**; the endpoint's other read surfaces
> (`/fleet`, `/manifest`, `/analytics`) are already unauthenticated; and the value of a keyless
> status surface is zero if the deliverable itself stays gated.

Two separate problems: the "not enumerable" claim is wrong, and the second clause is a design
choice that §2.4 pushes past what the data supports.

## 2. The live job IDs are the FALLBACK shape, not the hardened one

`worker.js` (repo sha `c3fc6496`, `VERSION = "2.15.6"`) contains a hardening marked
`JOBS-ENTROPY-1 (2026-09-13)`:

```js
function randId(prefix) {
  // JOBS-ENTROPY-1 (2026-09-13): 128-bit crypto-random IDs (crypto.randomUUID) so now-public
  // job poll URLs are unguessable. The old Math.random()+timestamp form had ~32 bits of entropy
  // plus a predictable timestamp suffix (enumerable via a public GET /v1/jobs/:id).
  var rnd = "";
  try {
    if (typeof crypto !== "undefined" && crypto && crypto.randomUUID) rnd = crypto.randomUUID().replace(/-/g, "");
  } catch (e) {}
  if (!rnd) rnd = Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);
  return (prefix || "id-") + rnd;
}
```

`crypto.randomUUID().replace(/-/g,"")` yields **32** hex chars. Measured: **8 of 8 live job ids are
`job-` + 14 hex chars** — the fallback shape. Therefore the hardened branch did **not** execute for
any of them.

**The comment states the hardening exists precisely because the URLs are "now-public". So the
mitigation written for this exact exposure is not in effect, while the route it protects is one
approval away from shipping.**

## 3. The timestamp suffix is not merely predictable — it is recoverable

`run_code` test: does the last 6 hex chars of each id equal the hex tail of `Date.now()` at
`created_at`?

| job id | id tail 6 | `Date.now()` hex tail | exact | ms offset that matches |
|---|---|---|---|---|
| job-f6ee57d4073a20 | `073a20` | `073a31` | no | **−17** |
| job-267f3ffb06addd | `06addd` | `06ade6` | no | **−9** |
| job-19fe5a1a06844f | `06844f` | `068459` | no | **−10** |
| job-a6aa8dc5065a63 | `065a63` | `065acd` | no | −106 |
| job-e1654912055418 | `055418` | `055427` | no | **−15** |
| job-0de34b1c03d96d | `03d96d` | `03d976` | no | **−9** |
| job-ba4db44e03c8f4 | `03c8f4` | `03c900` | no | **−12** |
| job-24f8e860fa0240 | `fa0240` | `fa0248` | no | **−8** |

Zero exact matches at the literal `created_at`, which is the *correct* result and not a
disconfirmation: `randId()` runs a few ms **before** `created_at` is written, so the match must sit
at a small **negative** offset. Seven of eight land in −8…−17 ms; one at −106 ms. **All eight are
negative**, matching the expected sign.

Conclusion: the final 24 bits of every job id **encode the creation timestamp in plaintext**. An
attacker who knows the approximate run time has those bits for free. Remaining entropy is the
8-char prefix = **32 bits from `Math.random()`**, which is not a CSPRNG.

## 4. The larger exposure is the list endpoint, not the ids

Enumeration difficulty is moot given spec §2.2 and §2.4 together:

- §2.2: `GET /v1/jobs` — **no bearer required**; returns the newest 1–50 rows.
- §2.4: `response`, `error`, `tool_log` **are returned** to that unauthenticated caller.

So an unauthenticated caller does not need to guess any id. They ask for the list and receive the
newest 50 jobs' `response` bodies. Those bodies are known to contain sensitive material — this is
stated in the repo's own `status/JOBS.md` redaction note:

> `response` bodies quote D1 rows, R2 keys, service versions and occasionally email content.

That note is why the committed mirror redacts `response` one step further than the spec does.
**The spec's own redaction is weaker than the mirror built to work around its absence.**

## 5. Recommendation (ordered)

1. **Do not ship §2.4 as written.** Redact `response` and `tool_log` from the public view
   (`response_chars` / `tool_log_chars` instead), matching what `status/JOBS.md` already does. If the
   deliverable genuinely must be readable keyless, require a per-job opaque token issued to the
   submitter — not the job id.
2. **If the list endpoint ships, it must not carry `response`.** A public list of statuses is
   defensible; a public list of response bodies is not.
3. **Verify `JOBS-ENTROPY-1` actually fires before shipping anything public.** The observable says
   it does not. Two candidate mechanisms, not distinguished here:
   (a) `crypto.randomUUID` is falsy/throwing in the deployed runtime context, so the `catch`/`if`
   fallback always runs; or (b) these rows are created by a *different*, un-hardened id path and
   `randId` is only used for other ids. Reading the dispatch site would settle it — blocked by §7.
4. **Fix the continuation text.** It currently emits `Poll GET https://…/v1/jobs/<id>`, which
   returns **401** to a client and **404** to a Worker vantage. Do not advertise a target that does
   not route.

## 6. Spec §6's precondition table is now stale — and may be satisfied

| artifact | spec §6 (as written) | measured now |
|---|---|---|
| live qnfo-ops | 2.15.1 | **2.15.6** (`web_fetch /health`, HTTP 200) |
| canonical `qnfo-ops/worker.js` | 2.14.0, 161,339 B | **2.15.6, 182,623 B** (sha `c3fc6496`) |
| `service_registry` | 2.15.1, updated 13:00:57Z | **2.15.2**, updated 13:30:58.171Z |

Canonical now equals live (**2.15.6 = 2.15.6**), so §6's warning — "sync the canonical to live
2.15.1 FIRST, then apply this patch on top" — appears **already satisfied**, and applying the patch
would no longer silently revert a live-only revision. Re-verify before relying on it.

Separately, **`service_registry` is stale by four patch versions** (2.15.2 vs live 2.15.6). Anything
consulting `service_discover` receives a wrong version. That is the registry-drift class again, now
with a concrete instance.

## 7. Blocker unchanged and worse

`qnfo-ops/worker.js` is now **182,623 B**, up from the 161,339 B the spec recorded — further past the
**32,768-char** `github_repo_read` cap, which has no offset parameter. `github_file_write` requires
full content. The dispatch site therefore remains unreadable and uneditable from this endpoint, and
§3's instruction "do not author that patcher blind" still binds. The size increase makes the
pre-existing blocker strictly harder.

## 8. Counter-evidence and limits

- **The offset is strong evidence, not proof, that these ids come from `randId()`.** It is equally
  consistent with any generator that appends `Date.now()` in hex. The 14-char length is what ties it
  to the documented fallback expression, and the documented fallback is in `randId()`.
- **I did not read the dispatch site**, so I cannot say whether job ids flow through `randId("job-")`
  or a sibling function. Mechanism (a) vs (b) in §5.3 is unresolved.
- **32 bits is not trivially brute-forceable** against a rate-limited endpoint. The exposure in §4
  does not depend on breaking it, which is why §4, not §3, is the headline.
- **The exposure is prospective.** The route is currently 401/404, so nothing is leaking today. This
  addendum argues against shipping the spec as written; it does not report a live breach.
- `service_registry` staleness is measured against two reads 30 minutes apart; I did not re-read it
  after the 13:30:58.171Z value.
- The spec's §1 note that "a 404 from inside the fleet is not evidence about the route" is correct
  and I am not contradicting it — my own `web_fetch` of `/v1/jobs` and `/v1/jobs/<id>` returned 404,
  which under that rule says nothing about the route's real behaviour from an external vantage.
- **Write-race note:** this file was created while another session was creating and deleting the same
  path. A first attempt returned `GitHub 409`, and a read immediately after returned `path not found`.
  The content above is the surviving revision; a concurrent writer may overwrite it. See D19.
