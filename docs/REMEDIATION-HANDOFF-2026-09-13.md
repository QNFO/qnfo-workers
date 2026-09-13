# Remediation handoff — QRI-1 + fleet fix queue, 2026-09-13

Author: qnfo-ops endpoint. Status: **6 patches authored, 0 applied.** Every figure below
is from a tool return in-session. Nothing in production has changed.

This document exists because the authoring endpoint cannot deploy or write D1. It is the
handoff for whoever can. Read §0 and §5 before touching anything.

## 0. READ FIRST — two corrections to an earlier revision of this document

**0.1 Repo/live drift on `qnfo-ai-calibration`.** An earlier revision of this handoff said
the repo's `VERSION = "1.1.4"` matched the live deployment. That was wrong. Measured:

```
GET https://qnfo-ai-calibration.q08.workers.dev/health -> {"version":"1.1.5",...}
repo qnfo-ai-calibration/worker.js                     -> var VERSION = "1.1.4";
```

The repo source is **one version behind production**. Deploying the patched repo source does
not update the running code — it *replaces* 1.1.5 with (1.1.4 + patches). Whatever 1.1.5
changed is not in the repo and would be lost. Record the live version and its behaviour
before deploying so a regression is attributable.

**0.2 A concurrent qnfo-ops session superseded the calibration patcher with a v2** that is
better than the v1 this document originally described (sha `42fc45b4`, 13,478 bytes). Its
FIX C anchor is taken from verbatim source; my v1 FIX C anchor was wrong (see §2.2). Its
`NEW_VERSION` is `'1.1.5'`, which now collides with live — **change it to `'1.1.6'`**, or
its own acceptance criterion passes before any deploy. Full detail:
`ops-workspace/audits/2026-09-13-calibration-version-collision.md`.

**0.3 File-level writes on this repo are not exclusive.** `apply-calibration-fix.mjs` grew
9,350 → 13,478 bytes between two reads in one session, and GitHub 409 races were observed
(`expected 0561a4b…` while HEAD had moved to `a9706dbd…`). Re-read immediately before
writing, and pass the `sha` from that same read.

## 1. Why patches and not edits

| tool | loss mode | measured |
|---|---|---|
| `github_repo_read` | truncation | caps at 32,768 chars, no offset parameter |
| `r2_get` | truncation | same cap — a 34,825-byte R2 object returned truncated mid-line |
| `web_fetch` | destruction | strips text between `<` and the next `>`; raw JS loses comparison operators |

`github_pr` returns **422 Validation Failed**; no branch-creation path, so patches land on
`main`. This is not a novel workaround — the repo already uses the idiom in
`qnfo-ops/scripts/apply-listIssues-await-fix.mjs` and
`qnfo-ops/scripts/hotfix-code-gate-classifier.mjs`.

## 2. Apply procedure (from `docs/DEPLOY-RUNBOOK-2026-09-07.md`)

```
node <worker>/apply-*.mjs --check        # inspect; writes nothing
node <worker>/apply-*.mjs --apply        # patch worker.js in place
node --input-type=module --check < <worker>/worker.js && echo SYNTAX-OK
cd <worker> && npx wrangler deploy
curl -s https://<worker>.q08.workers.dev/health   # expect the new version
```

Every script asserts its anchor count and **refuses to write** on a miss or ambiguity
(non-zero exit). A non-zero exit means the fix did **not** apply — do not read a version
bump as evidence it did.

### 2.1 `qnfo-research-exec` — `apply-research-exec-fix.mjs` (highest value)

The v2-drain publish has failed silently for ten days.

```
SELECT status, COUNT(*) n, MIN(ts), MAX(ts) FROM cloud_ops_events
 WHERE kind='v2-drain' GROUP BY status;
  -> ONE row: status='ok', n=38
     first 2026-09-03T14:11:10.269Z   last 2026-09-13T05:21:30.947Z
```

All 38 carry `[{"ok":false,"stage":"v2","error":"NL is not defined"}]`. The single-row
GROUP BY is the proof of total masking — `telemetry_analyze` never saw it.

Root cause: `depositToGithub()` builds its README with a bare `NL` never declared in the
bundle. **The error text is itself the proof no binding exists** — `var NL` would hoist to
`undefined` (printing the literal string), `let`/`const` would say "before initialization".

- FIX A declares `NL` at module scope.
- FIX B changes `logEvent`'s `status || "ok"` to classify error-signature payloads as
  `status='error'` — the masking that hid FIX A.

Verify: no further `NL is not defined` rows. Optional backfill in the script footer:
`UPDATE cloud_ops_events SET status='error' WHERE kind='v2-drain' AND text LIKE '%is not defined%';`

### 2.2 `qnfo-ai-calibration` — `apply-calibration-fix.mjs` (v2, sha `42fc45b4`)

**Retarget `NEW_VERSION` to `'1.1.6'` before running** (§0.1, §0.2).

- **FIX A (F3)** `deepseek-direct/models` asserts the internal alias `deepseek-v4-flash`
  appears in DeepSeek's own catalogue. 335 rows: **182 pass / 153 fail**; last pass
  **2026-09-10T01:01:10Z**, first fail **01:31:08Z**, then 153 consecutive failures. A clean
  step change; upstream catalogue change is the better-supported cause (inference, not fact).
- **FIX B (F2)** `digest.failing` fills only above `failThreshold`, so runs report
  `failing:[]` beside `fail=2`.
- **FIX C (F1)** issue 664's `http=200 echo=false "OK"`. **My v1 anchor was wrong** — the
  verbatim line is `r.status === 200 && !!content && String(content).trim().length > 0 && echo;`.
  My "web_fetch destroyed the region" explanation is retracted; the anchor was simply wrong,
  and v1 would have exited 2 without writing. v2's anchor is correct.
- **FIX D (RC-1)** the gateway sweep replays the same window forever: six classes share one
  `first_ts` (1788595252513) and one `last_ts` (1789281039437) with ~380 rows each; 7.94 days
  at a */30 cron is ~381 sweeps, i.e. one re-inserted row per class per sweep. `start_time` is
  not honoured. **This is why `[gw-fail]` #654–#660 and #670 are structurally unclosable** —
  the 24h auto-close needs `COUNT(*) WHERE ts > t0-24h = 0`, which can never be true.
- **FIX E (RC-2)** `internalId()` returns the qualified `@cf/...` id for models absent from
  `TIER0_WA`, creating a second `ai_model_health` row nothing probes and nothing clears →
  permanent MODEL-DEGRADED false positives.
- **FIX H (RC-5)** the vision runPool never calls `upsertHealth`, so vision health is never
  published; six rows frozen at `last_probe_ts` 1789145063740.

### 2.3 `personal-companion` — `apply-remediation.mjs` + the QRI-1 gate

Repo `VERSION = "1.0.0"`; **live is v1.1.0 and its source is not in the repo** — same drift
class as §0.1, and the same downgrade risk applies. Test the reading page before and after.

Landed with it: `lib/gate.js`, `lib/gate.test.js` (18 assertions), plus the pre-existing
`lib/grounding.js` / `lib/voice.js`. Run `node lib/gate.test.js`.

Measured against live piece `2026-09-12-essay-3bf32c8a197d2196`:
```
grounding = 2   [interval] "Five days later" -> real gap 7d (3d end-to-start)
                [comparative-equality] "cost roughly the same" -> no record populates cost
voice     = 5   [attribution-seam] "Rowan rated"
                [invented-particular] "about forty people" / "dining hall"
                                      / "sat in a circle" / "took turns being wrong"
publish = false | gate = blocked-grounding | total 7
CONTROL (corrected text): 0 violations, publish = true
```

**Do not add a block on `verdict === "reject"`.** `P_CRITIQUE` instructs the critic to look
for reasons the piece is worthless, so `reject` is its expected output; 6 of 7 live pieces
carry it, and gating on it would empty the page.

## 3. D1 corrections

`personal-companion/sql/QRI-1-corrections-2026-09-13.sql` — errata + withdrawal for piece 8,
the claim-based re-gate discipline, and the `companion_feedback.source` provenance split
(42 machine-written / 3 human).

```
cd qnfo-cloud-ops && npx wrangler d1 execute PERSONAL --file=../personal-companion/sql/QRI-1-corrections-2026-09-13.sql --remote
```

Withdraw **only** what the gate blocks. Verified: of ids 6,7,9,10,11,12 the only KB-anchored
piece is id 8.

## 4. Live exposure still open (needs the unread tail of `worker.js`)

`GET https://reading.q08.org/api/pieces` → **HTTP 200, no key**, all 7 pieces with full
`anchor_json` and `quality_json`. Masthead reads "**Private.**" while `authorized()` fails
open when `COMPANION_KEY` is unset (it is unset). A security fix that silently takes a live
page down is not a fix: set the key **and** flip `authorized()` together
(`--fail-closed`), or keep it public and correct the label. Not one without the other.

## 5. DO NOT IMPLEMENT — F6 rests on a false premise

F6 claims `*.q08.workers.dev` "returns 404 to external clients". Measured 2026-09-13:

| URL | result |
|---|---|
| `qnfo-ai.q08.workers.dev/health` | **200** — `{"worker":"qnfo-ai","version":"5.25.1"}` |
| `qnfo-ops.q08.workers.dev/health` | **200** — `{"worker":"qnfo-ops","version":"2.15.1"}` |
| `personal-api.q08.workers.dev/health` | **200** — `{"worker":"personal-api","version":"3.5.0"}` |
| `qnfo-ai-calibration.q08.workers.dev/health` | **200** — `{"version":"1.1.5"}` |
| `qnfo-cloud-ops.q08.workers.dev/health` | **200** — `{"version":"1.14.1","jobs":[…]}` |
| `qnfo-research-exec.q08.workers.dev/health` | **200** — `{"version":"0.8.1"}` |
| `qnfo-observability.q08.workers.dev/health` | **200** — `{"version":"1.2.0"}` |
| `qnfo-intent-orchestrator.q08.workers.dev/health` | **200** — `{"version":"1.3.4"}` |

The real mechanism is documented in the calibration source (SVC-BINDING-1): same-account
`workers.dev` fetches 404 **from inside a Worker**; external fetches work. Implementing F6
as written would fix a non-problem while leaving the actual 530/1016 cause in place.

Note this also means the "43 of 55 workers are unprobeable" limitation is a *tool* limit,
not a fleet limit — external `/health` probing works and is the cheap way to close it.

## 6. Still unfixable from the authoring endpoint

| item | blocker |
|---|---|
| F6 / F7 `qnfo-cloud-ops` (129,467 B) | monolithic bundle; `jobWorkerHealth` and the silence detector sit past the 30,000-char fetch window |
| F11 `qnfo-ops` (161,339 B) | monolithic; the telemetry failure classifier is unread |
| F13 (24 open issues) | `ops_issue_run` only auto-closes health rows; 24/24 return "no probe target". **FIX D above is the real lever for the `[gw-fail]` half of this backlog.** |
| F12 non-semver VERSION | **appears already resolved** — registry shows qnfo-social 0.5.2, qnfo-paper-reviser 1.0.4, qnfo-memory-mcp 2.0.3, qnfo-lifecycle 1.6.1, qnfo-paper-indexer 2.2.0, qnfo-skill-sync 1.1.2, all strict X.Y.Z, consistent with the 2026-09-11 standardisation deploys (`deployment_history` #52/#53). Verify before spending effort. |
| F9 credentials in `qnfo-backups` | present and readable (`credentials/.env`, `fleet-deploy-admin-token.txt`, `code-agent-key.txt`, `orch-token.txt`, `osf-token.txt`, `keys-2026-08-05.json`); contents not read, deliberately. **Any principal with R2 read on that bucket holds fleet-deploy admin** — the highest-severity open item; needs a bucket-policy change, not a patch. |

## 7. Rollback

Each patcher is additive and version-stamped; `git revert` the patch commit and redeploy.
For `qnfo-ops` the repo precedent is
`git checkout <gate-commit>^ -- qnfo-ops/worker.js && npx wrangler deploy`.

## 8. Adversarial note

The strongest argument against this entire body of work: **it changes nothing in
production.** Six patches, zero deploys; the reading page still reads "Five days later", the
drain still throws every ~130 minutes, and the calibration cluster still files tickets.
Every artifact here is *prepared* remediation, and the gap between prepared and applied is
the whole remaining task.

Five of my own claims were corrected during this work and are recorded rather than dropped:
the calibration assertion "can never pass" (refuted by 182 passes), the drain count "18 in
2 days" (measured 38 in 10 days), F6's 404 premise (refuted by eight 200s), the FIX C anchor
and its explanation (refuted against verbatim source by the concurrent v2), and the
"repo 1.1.4 matches live" claim (§0.1). A reader should weight the remaining claims
accordingly: the ones that survived are the ones backed by a query or a fetch in this
session, and those are cited inline.
