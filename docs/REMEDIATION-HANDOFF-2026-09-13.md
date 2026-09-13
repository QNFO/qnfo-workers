# Remediation handoff — QRI-1 + fleet fix queue, 2026-09-13

Author: qnfo-ops endpoint. Status: **5 patches authored, 0 applied.** Every figure below
is from a tool return in-session. Nothing in production has changed.

This document exists because the authoring endpoint cannot deploy or write D1. It is the
handoff for whoever can. Read §5 (do-not-implement) before touching the fix queue.

## 0. Why patches and not edits

Three independent tool defects make "read a worker, edit it, ship it" impossible from the
authoring endpoint:

| tool | loss mode | measured |
|---|---|---|
| `github_repo_read` | truncation | caps at 32,768 chars, no offset parameter |
| `r2_get` | truncation | same cap — a 34,825-byte R2 object returned truncated mid-line |
| `web_fetch` | destruction | strips every run of text between `<` and the next `>`; raw JS loses its comparison operators |

`github_pr` also returns **422 Validation Failed** and there is no branch-creation path, so
patches land on `main` and review is by commit.

This is not a novel workaround: the repo already uses the same idiom in
`qnfo-ops/scripts/apply-listIssues-await-fix.mjs` and
`qnfo-ops/scripts/hotfix-code-gate-classifier.mjs` — anchored, count-asserting, idempotent,
run by hand, then deployed. The patches below follow that convention.

## 1. Apply procedure (from `docs/DEPLOY-RUNBOOK-2026-09-07.md`)

Per worker, from the repo root:

```
node <worker>/apply-*.mjs --check        # inspect; writes nothing
node <worker>/apply-*.mjs --apply        # patch worker.js in place
node --input-type=module --check < <worker>/worker.js && echo SYNTAX-OK
cd <worker> && npx wrangler deploy
curl -s https://<worker>.q08.workers.dev/health   # expect the new version
```

Every script asserts its anchor count and **refuses to write** if an anchor is missing or
ambiguous (non-zero exit). A non-zero exit means the fix did **not** apply — do not treat
the version bump as evidence it did.

## 2. Patch inventory

### 2.1 `qnfo-research-exec` — `apply-research-exec-fix.mjs` (highest value)

The v2-drain publish has been failing silently for ten days.

```
SELECT status, COUNT(*) n, MIN(ts), MAX(ts) FROM cloud_ops_events
 WHERE kind='v2-drain' GROUP BY status;
  -> ONE row: status='ok', n=38
     first 2026-09-03T14:11:10.269Z   last 2026-09-13T05:21:30.947Z
```

All 38 carry `[{"ok":false,"stage":"v2","error":"NL is not defined"}]`. The single-row
GROUP BY is the proof of total masking: not one row was ever filed as an error, so
`telemetry_analyze` never saw it.

Root cause: `depositToGithub()` builds its README with a bare `NL` that is never declared
in the bundle. **The error text is itself the proof that no binding exists** — `var NL`
would hoist to `undefined` (printing the literal string), `let`/`const` would say
"before initialization". So the declaration cannot collide with anything.

- FIX A declares `NL` at module scope.
- FIX B changes `logEvent`'s `status || "ok"` to classify error-signature payloads as
  `status='error'` — the one-line masking that hid FIX A.

Verify after deploy:
```sql
SELECT ts, kind, status, text FROM cloud_ops_events WHERE kind='v2-drain' ORDER BY ts DESC LIMIT 10;
```
Optional backfill for the 38 mislabelled rows (in the script's footer):
```sql
UPDATE cloud_ops_events SET status='error' WHERE kind='v2-drain' AND text LIKE '%is not defined%';
```

### 2.2 `qnfo-ai-calibration` — `apply-calibration-fix.mjs`

Repo `VERSION = "1.1.4"` **matches** the live deployment, so this lands on current source.

- **FIX A (F3)** `deepseek-direct/models` asserts the internal alias `deepseek-v4-flash`
  appears in DeepSeek's own catalogue. 335 rows: **182 pass / 153 fail**; last pass
  **2026-09-10T01:01:10Z**, first fail **01:31:08Z** (next sweep), then 153 consecutive
  failures to 2026-09-13T06:00:52Z. A clean step change. No deploy recorded near onset →
  upstream catalogue change is the better-supported cause (inference, not fact).
- **FIX B (F2)** `digest.failing` fills only above `failThreshold`, so runs report
  `failing:[]` beside `fail=2`. Verified on the last three runs.
- **FIX C (F1)** issue 664's `http=200 echo=false "OK"` — a healthy transport marked as an
  outage. **Anchor is a reconstruction** from a lossy read; the regex is flexible and the
  script refuses on a miss.

Expect the ai-calibration ticket cluster to self-close: `fileIssue()` files only while a
probe fails, and the sweep auto-closes a class after 24h clean.

### 2.3 `personal-companion` — `apply-remediation.mjs` + the QRI-1 gate

Repo `VERSION = "1.0.0"`; **live is v1.1.0 and its source is not in the repo.** A redeploy
from this source therefore *replaces* unknown production code. Regression risk is real —
test the reading page before and after.

Landed with it: `lib/gate.js` (composed gate), `lib/gate.test.js` (18 assertions),
`lib/grounding.js` + `lib/voice.js` (pre-existing). Run `node lib/gate.test.js`.

Measured against the live piece `2026-09-12-essay-3bf32c8a197d2196`:
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
carry it, and gating on it would empty the page. The gate checks claims, not verdicts.

## 3. D1 corrections

`personal-companion/sql/QRI-1-corrections-2026-09-13.sql` — errata + withdrawal for piece 8,
the claim-based re-gate discipline for the rest, and the `companion_feedback.source`
provenance split (42 machine-written / 3 human).

```
cd qnfo-cloud-ops && npx wrangler d1 execute PERSONAL --file=../personal-companion/sql/QRI-1-corrections-2026-09-13.sql --remote
```

Withdraw **only** the pieces the gate actually blocks. Verified: of ids 6,7,9,10,11,12 the
only KB-anchored piece is id 8; the others are external-subject essays carrying no
record-derived quantities.

## 4. Live exposure still open (needs the unread tail of `worker.js`)

`GET https://reading.q08.org/api/pieces` → **HTTP 200, no key**, returning all 7 pieces with
full `anchor_json` and `quality_json` (internal topic/bridge scaffolding + critic verdicts).
`GET /p/<slug>` likewise. Masthead reads "Written for one reader. **Private.**" while
`authorized()` fails open when `COMPANION_KEY` is unset (it is unset).

A security fix that silently takes a live page down is not a fix: set `COMPANION_KEY`
**and** flip `authorized()` together (`apply-remediation.mjs --fail-closed`), or keep the
page public and correct the label. Do not do one without the other.

## 5. DO NOT IMPLEMENT — F6 rests on a false premise

`audits/2026-09-13-fix-queue.json` F6 claims `*.q08.workers.dev` "returns 404 to external
clients". Measured 2026-09-13:

| URL | result |
|---|---|
| `qnfo-ai.q08.workers.dev/health` | **200** — `{"worker":"qnfo-ai","version":"5.25.1"}` |
| `qnfo-ops.q08.workers.dev/health` | **200** — `{"worker":"qnfo-ops","version":"2.15.1"}` |
| `personal-api.q08.workers.dev/health` | **200** — `{"worker":"personal-api","version":"3.5.0"}` |

The real mechanism is documented in `qnfo-ai-calibration/worker.js` (SVC-BINDING-1):
same-account `workers.dev` fetches 404 **from inside a Worker**; external fetches work.
Implementing F6 as written would "fix" a non-problem while leaving the actual cause of the
530/1016 alarms in place. Re-scope F6 first.

## 6. Still unfixable from the authoring endpoint

| item | blocker |
|---|---|
| F6 / F7 `qnfo-cloud-ops` (129,467 B) | monolithic single bundle; `jobWorkerHealth` and the silence detector sit past the 30,000-char fetch window |
| F11 `qnfo-ops` (161,339 B) | monolithic; the telemetry failure classifier is unread |
| F13 (24 open issues) | `ops_issue_run` only auto-closes health-availability rows; 24/24 return "no probe target" |
| F9 credentials in `qnfo-backups` | present and readable (`credentials/.env`, `fleet-deploy-admin-token.txt`, `code-agent-key.txt`, `orch-token.txt`, `osf-token.txt`, `keys-2026-08-05.json`); contents not read by me, deliberately. **Any principal with R2 read on that bucket holds fleet-deploy admin** — this is the single highest-severity open item and it needs a bucket-policy change, not a code patch. |

## 7. Rollback

Each patcher is additive and version-stamped; `git revert` the patch commit and redeploy.
For `qnfo-ops` specifically the repo precedent is
`git checkout <gate-commit>^ -- qnfo-ops/worker.js && npx wrangler deploy`.

## 8. Adversarial note

The strongest argument against this entire body of work: **it changes nothing in
production.** Five patches, zero deploys; the reading page still reads "Five days later",
the drain still throws every ~130 minutes, and the calibration cluster still files tickets.
Every artifact here is *prepared* remediation, and the gap between prepared and applied is
the whole remaining task. A reader who counts commits could mistake volume for resolution.

Weakest joint: FIX C's anchor in the calibration patcher is the one target text that could
not be read verbatim. If the regex misses, the script exits non-zero and nothing changes —
correct behaviour, but a runner that ignores exit codes would ship a version bump with no
behavioural change. Check the exit code.

Three of my own claims were corrected during this work and are recorded rather than
quietly dropped: the calibration assertion "can never pass" (refuted by 182 passes), the
drain failure count "18 in 2 days" (measured: 38 in 10 days), and F6's 404 premise
(refuted by three 200s).
