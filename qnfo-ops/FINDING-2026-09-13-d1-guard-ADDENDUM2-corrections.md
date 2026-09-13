# ADDENDUM 2 — corrections to my own findings, and a confirmed credential exposure

Author: qnfo-ops, 2026-09-13. **Supersedes §2 and §3 of
`FINDING-2026-09-13-d1-guard-ADDENDUM-source-check-failed.md`.** Read all three files together.

I searched for disconfirming evidence about my own novelty claims before reporting them, and found
it. Two of the three things the previous addendum presented as new were already documented — one of
them more thoroughly than I stated it.

---

## C1. WITHDRAWN — the version divergence is not new

The addendum said the repo-vs-live divergence (`worker.js` `VERSION = "2.14.0"` vs live `2.15.1`) was
"the same class of defect the personal-companion audit recorded as RC-6" and presented it as a finding.

It is already documented, and better, in
**`qnfo-ops/patches/2026-09-13-DEPLOY-PATH-and-version-regression.md` §3** (sha `42ba572e`):

| artifact | VERSION | size |
|---|---|---|
| live qnfo-ops | **2.15.1** | — |
| canonical `qnfo-ops/worker.js` | **2.14.0** | 161,339 B |
| `qnfo-ops/deployed-current.worker.js` | **2.13.0** | 157,399 B |

That document goes further than I did on three points I missed:

1. **There are two canonical sources and they disagree.** The drift scan compares against GitHub
   `deployed-current.worker.js` (2.13.0); the deploy path pulls `r2:qnfo-canonical/qnfo-ops.js`. So
   "canonical" has no single answer, and the drift scan reports canonical **2.13.0** for qnfo-ops.
2. **A canonical redeploy would REGRESS live**, 2.15.1 → 2.13.0 or → 2.14.0. It is not merely that the
   source is stale; the deploy target is *behind* what is running.
3. **The 2.15.1 source may exist only on the live worker**, so syncing canonical may first require
   retrieving the deployed bundle.

My addendum's framing implied I had found something unrecorded. I had not; I had re-derived a
documented fact from a narrower angle (the guard). The narrow application stands — the guard I would
patch is not the guard that is running — but the discovery credit does not.

## C2. CORRECTED — "no deploy tool" is imprecise

I have said throughout this session that there is "no deploy tool". The same document corrects that
phrasing, and it is right:

- **A deploy path exists.** `qnfo-fleet-deploy` exposes `POST /redeploy`, token-gated
  (`DEPLOY_ADMIN_TOKEN`), hourly drift scan, kill-switch and auto-heal flags, canonical-source-only,
  self-redeploy refused, 60 s cooldown.
- **It is unreachable from this endpoint by design** (§2 BLOCKER A): `DEPLOY_ADMIN_TOKEN` is not in
  qnfo-ops' declared deps, `run_code` is isolated (no network, no filesystem, no secrets),
  `web_fetch` is GET-only while `/redeploy` is POST, and self-redeploy is refused.

"Unreachable from this endpoint" is the accurate statement. "No deploy tool" understates the system and
implies a missing capability rather than a deliberate boundary. Corrected here and in the session
report.

Also from §8, which I had not read: the kill-switch and `auto_heal` are both **`1`** (flipped
2026-09-08 — the same day the README warned against it), while every cron reports `healed=0`. The
control plane is armed and auto-heal has never acted; whether it skips `deployed-ahead` by design or is
broken is explicitly **not established** in that document, and I did not establish it either.

## C3. NOT NEW — the read ceiling and the refused blind hotfix

The addendum's §1 (161,339 B file, 32,768-char cap, guard unreachable) and its conclusion (a blind
regex hotfix would be unverified guesswork) are **already recorded** as BLOCKER C in the same patch
document, together with the repo's established patcher pattern
(`qnfo-ops/scripts/hotfix-code-gate-classifier.mjs`, sha `f0a80b8a`: marker no-op, exactly-one-anchor
assertion, abort-without-writing, VERSION bump). I re-derived a documented blocker. No new information.

## C4. STILL NEW — the guard's behavioural mechanism

What survives as genuinely new is narrower and I am stating it narrowly: **the read guard rejects the
`replace()` scalar function and mutation keywords inside string literals**, proven by two executed
probes. I have read no artifact that records the mechanism, the probe evidence, or the
`replace()`-specific consequence. The `AUTO-SWEEP: ops_d1_query` ledger row (443 occurrences) existed
before this session; **what it was caused by was not recorded anywhere I could read**, and remains
unproven as the cause of those 443 rows (the ledger `last_detail` is the bare tool name).

---

## F. CONFIRMED — plaintext fleet credentials in a bound bucket

`qnfo-ops/patches/2026-09-13-DEPLOY-PATH-and-version-regression.md` §7 records this as an observation
and states "I did not read it and must not." I verified it **by listing only** — `r2_list`, metadata
only, **no `r2_get` on any credential object**. Confirmed present in `qnfo-backups`:

| key | size | uploaded |
|---|---|---|
| `credentials/fleet-deploy-admin-token.txt` | 48 B | 2026-09-09T07:21:46Z |
| `credentials/code-agent-key.txt` | 48 B | 2026-09-06T16:57:45Z |
| `credentials/orch-token.txt` | 48 B | 2026-09-06T17:05:29Z |
| `credentials/osf-token.txt` | 70 B | 2026-08-28T19:07:43Z |
| `credentials/.env` | 395 B | 2026-08-05T13:03:30Z |
| `credentials/keys-2026-08-05.json` | 544 B | 2026-08-05T14:19:02Z |
| `credentials/.bsky_credentials` | 37 B | 2026-08-05T13:03:32Z |
| `credentials/orcid-client-2026-08-05` | 164 B | 2026-08-05T14:18:59Z |
| `credentials/wikidata-2026-08-05` | 39 B | 2026-08-05T14:54:12Z |

**9 objects, all plaintext, in one prefix.** The first is the token that authorises fleet-wide
redeploy; the same control plane's kill-switch and auto-heal are both armed (§C2). A 48-byte file is a
token, not a bundle — the size is consistent with the claim and inconsistent with an encrypted blob.

**The blast radius is larger than the credentials.** The same bucket, bound to this endpoint with read
access, also holds a full workstation migration (`d-drive-final-2026-09-04/`), including:
- `.git` object stores and reflogs for personal projects (`.../QNFO/bqnn-classical-baseline/.git/...`)
- nonprofit incorporation documents (`Q8 Empowering Change Articles of Incorporation 2023-10-11.pdf`)
- an IRS notice (`Empowering Change/CP575Notice_1695132841257.pdf`)
- a 284 MB recovered binary from a Windows recycle bin (`$RF2BNP2.exe`)

That is a bucket-policy question for whoever owns it, not an action this endpoint can or should take.
There is no R2 write or delete tool bound here, and deleting credentials is destructive and
irreversible — outside my mandate. Recorded so it is visible, not acted on.

## G. Correction to my own reporting, again

The previous addendum closed by noting I had reported an intent (source-confirm the guard) as if done.
This addendum records a second, milder version of the same failure: I reported re-derivations of
documented facts as new findings, because I checked the repository only *after* writing them up. The
check should come first. That is the same error, one step earlier in the process.

## H. What remains true and unaddressed

- The reader-visible defect is **still live**: `reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196`
  serves "Five days later… cost roughly the same in travel and time" verbatim.
- `QRI-4` is staged and verified but **not applied** — `ops_d1_query` is SELECT/WITH only.
- `APPLY-ORDER-2-2026-09-13.md` is the sequence to follow; it documents the QRI-2-then-QRI-4
  `word_count` corruption hazard.
- The guard defect needs someone who can read the deployed 2.15.1 source. Grep for the verbatim
  rejection string `mutation keywords are rejected`.
