# FIX SPEC — job status must be readable WITHOUT an API key

Directive (user, 2026-09-13): *"JOBS STATUS SHOULD BE VISIBLE WITHOUT AN API KEY."*
Author: qnfo-ops / ops-exec (2026-09-13). Status: **SPEC — not applied.** Blocker in §5,
deploy precondition in §6. Companions: `patches/2026-09-13-async-job-addendum2-poll-auth-and-continuing-freeze.md`
(sha `886d91cb`, staged), `patches/2026-09-13-DEPLOY-PATH-and-version-regression.md` (sha `42ba572e`).

Every figure below is a live D1 / repo / registry return from this session.

---

## 1. Current behaviour (measured)

| fact | evidence |
|---|---|
| `/v1/jobs` and `/v1/jobs/:id` are registered routes | `service_registry.qnfo-ops.routes`, version 2.15.1, updated 2026-09-13T13:00:57Z |
| both are bearer-gated | `authOk(header, env)` compares the `Authorization: Bearer` value by SHA-256 against `OPS_ROUTER_AUTH_KEY` / `OPS_ROUTER_AUTH_KEY_2`; worker.js head, lines ~60-75 |
| an unauthenticated client is rejected | `{"error":"Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY"}` (client-reported, 2026-09-13; recorded as reported, not re-measured from a non-Worker vantage) |
| a same-account Worker vantage gets HTTP 404 on **every** path of this host, including `/health` | re-confirmed this session: `web_fetch https://qnfo-ops.q08.workers.dev/health` -> `{"ok":false,"error":"HTTP 404"}`, and the same for `/` and `/telemetry` |
| consequence | **a 404 from inside the fleet is not evidence about the route.** The observer's vantage decides (A2 §1). Do not use Worker-vantage 404s to argue that a public route exists or does not exist. |

The deliverable never depended on this route: `ops_jobs.response` is a plain column in
`qnfo-audit` and is readable through `ops_d1_query` (that is how every job result referenced in
this spec was retrieved).

## 2. Target behaviour

1. `GET /v1/jobs/:id` — **no bearer required**; returns the job row.
2. `GET /v1/jobs` — **no bearer required**; returns a metadata list (newest first, `limit` 1-50,
   optional `status=`).
3. `payload` is **never** returned by the public path: it is the client's replayed conversation
   (386 KB - 820 KB observed) and may embed anything the client sent. Public view carries
   `payload_chars` only.
4. `response`, `error`, `tool_log` are returned — they are the deliverable a poller is after.
5. Kill switch: env `OPS_JOBS_PUBLIC` (default `"1"`). Set `"0"` to restore bearer-only access
   without a code change. Fail-closed helper: only the literal `"0"` disables.
6. Authenticated callers keep the **full** row (payload included) — behaviour unchanged for the
   existing client path.

Rationale for allowing `response`/`tool_log` unauthenticated: job ids are random
(`randId()` = 8 hex + 6 hex of `Date.now()`) and are not enumerable; the endpoint's other read
surfaces (`/fleet`, `/manifest`, `/analytics`) are already unauthenticated; and the value of a
keyless status surface is zero if the deliverable itself stays gated. This is a deliberate
trade-off, not an oversight — see §9 for what it exposes.

## 3. Implementation (insertion, not a blind regex)

Placement rule: find the request dispatch site — the branch chain that maps the pathname to a
handler and currently rejects `/v1/jobs*` with 401. Insert **before** the bearer check, and
**only** for `GET`.

```js
// OPS-JOBS-PUBLIC-1 (2026-09-13): read-only job status is public by default.
// WHY: a continuation poll target that needs a bearer cannot be polled by a client that was
// only told a URL (2026-09-13: a continuation message did exactly that and produced a 401).
// SCOPE: GET only; /v1/jobs* only; `payload` is stripped. Kill switch: OPS_JOBS_PUBLIC="0".
function jobsPublicEnabled(env) { return String(env && env.OPS_JOBS_PUBLIC) !== '0'; }
function publicJobView(row, full) {
  if (!row) return row;
  const out = {
    id: row.id, status: row.status, model: row.model, strategy: row.strategy,
    created_at: row.created_at, updated_at: row.updated_at,
    error: row.error == null ? null : String(row.error).slice(0, 2000),
    response: row.response == null ? null : String(row.response),
    tool_log: row.tool_log == null ? null : String(row.tool_log),
    payload_chars: row.payload == null ? 0 : String(row.payload).length
  };
  if (full) out.payload = row.payload;   // authenticated caller only
  return out;
}
```

Dispatch branch (shape to match the existing style at the site; keep the `ROUTES` array in sync
by adding `/v1/jobs` and `/v1/jobs/:id` there as well):

```js
if (request.method === 'GET' && path === '/v1/jobs' && jobsPublicEnabled(env)) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 50);
  const st = url.searchParams.get('status');
  const rows = st
    ? await env.QNFO_AUDIT.prepare('SELECT * FROM ops_jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?').bind(st, limit).all()
    : await env.QNFO_AUDIT.prepare('SELECT * FROM ops_jobs ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  return json({ ok: true, public: true, count: (rows.results || []).length, jobs: (rows.results || []).map(function (r) { return publicJobView(r, false); }) });
}
if (request.method === 'GET' && path.indexOf('/v1/jobs/') === 0 && jobsPublicEnabled(env)) {
  const id = decodeURIComponent(path.slice('/v1/jobs/'.length));
  const row = await env.QNFO_AUDIT.prepare('SELECT * FROM ops_jobs WHERE id = ?').bind(id).first();
  if (!row) return json({ ok: false, error: 'job not found', id: id }, 404);
  return json({ ok: true, public: true, job: publicJobView(row, false) });
}
```

Also fix the continuation text the runner emits (it is the thing that sent a client to a gated
URL): append ` (no auth required)` to the poll instruction, or emit nothing until the target is
public. Grep the literal `SERVER-SIDE CONTINUATION STARTED` and patch that one string.

**Fail-closed apply rule (copy the repo pattern from `scripts/hotfix-code-gate-classifier.mjs`):**
read `worker.js`; no-op if the marker `OPS-JOBS-PUBLIC-1` is already present; assert each anchor
matches **exactly 1** occurrence and abort without writing otherwise; bump `VERSION`; write.

Do **not** author that patcher blind. `worker.js` is 161,339 B and the dispatch site is past the
32,768-char read cap, so the literal anchor is unknown from this endpoint (see §5). The applier
must open the file and paste the real anchor.

## 4. Behaviour to preserve

- The authenticated path (`Bearer OPS_ROUTER_AUTH_KEY`) must return the row **including** `payload`.
- `POST /v1/jobs` stays bearer-gated (it spends money and writes rows).
- `/v1/chat/completions`, `/chat/completions`, `/v1/responses` stay bearer-gated.
- CORS is already `Access-Control-Allow-Origin: *` on this worker; the public JSON inherits it,
  which is intended (a browser poll target).

## 5. Why this cannot be applied from qnfo-ops

| blocker | evidence |
|---|---|
| no deploy tool | endpoint tool list has no deploy/exec surface; `run_code` is isolated (no network, no secrets, no bindings) |
| `web_fetch` cannot trigger the fleet deployer | it is GET-only; `POST /redeploy` on `qnfo-fleet-deploy` is POST + `DEPLOY_ADMIN_TOKEN`, and that worker refuses self-redeploy |
| the fix cannot be authored here | `qnfo-ops/worker.js` = **161,339 B**; `github_repo_read` truncates at **32,768 chars** with **no offset** (re-verified this session with `maxChars=200000`); `github_file_write` needs the full content, so a contents-API write of this worker is impossible from here |
| no D1 write path | `ops_d1_query` is SELECT-only, so the 28 frozen rows cannot be repaired either |

Same blocker recorded three times before: `docs/FIX-telemetry-hours-2026-09-12.md` §"Why not
patched here", `docs/FIX-reasoning-content-replay-2026-09-13.md` §5,
`patches/2026-09-13-async-job-addendum2-...md` §4. This spec adds the route design, not a new
workaround.

## 6. PRECONDITION — the deploy must be monotone (do not skip)

| artifact | VERSION | size | source |
|---|---|---|---|
| **live** qnfo-ops | **2.15.1** | - | `service_registry`, updated 2026-09-13T13:00:57Z |
| canonical `qnfo-ops/worker.js` | **2.14.0** | 161,339 B | GitHub sha `cf9bb72e` |
| `qnfo-ops/deployed-current.worker.js` | **2.13.0** | 157,399 B | GitHub sha `110261ac` |

`fleet_drift_report` reports qnfo-ops `deployed_version=2.15.1 / canonical_version=2.13.0 /
note=deployed-ahead` on **every hourly scan** (08:02, 09:02, 10:02, 11:02, 12:02, 13:03).

**So: sync the canonical bundle to the live 2.15.1 revision FIRST, then apply this patch on top.**
Patching `worker.js` at 2.14.0 and letting the deployer ship it silently reverts live 2.15.1 to
2.14.0 + patch — losing whatever the live-only revision fixed, including the fixes that made the
13:19-13:22Z job chain complete. `auto_heal` and the kill switch are both `1` in
`fleet_deploy_state` (armed 2026-09-08), and `fleet_deploys` shows the control plane does attempt
downgrades (`personal-companion` `from_sha=v1.1.0 -> to_sha=1.0.0`). `healed=0` so far, but that
is not a guarantee.

## 7. Apply procedure

```bash
cd qnfo-workers/qnfo-ops
# 0. monotone precondition: canonical must be >= live before any edit
node -e "console.log(require('fs').readFileSync('worker.js','utf8').match(/VERSION = \"([^\"]+)\"/)[1])"   # expect >= 2.15.1
# 1. paste the real anchor at the dispatch site, apply the insertion from section 3
node scripts/hotfix-public-jobs-status.mjs        # to be authored against the real anchor; asserts exactly 1 match
# 2. syntax gate BEFORE deploy
node --input-type=module --check < worker.js && echo SYNTAX-OK
# 3. deploy
npx wrangler deploy
# 4. verify the version actually moved, then the route
curl -s https://qnfo-ops.q08.workers.dev/health
curl -s https://qnfo-ops.q08.workers.dev/v1/jobs?limit=3              # expect 200, no bearer
curl -s -o /dev/null -w '%{http_code}\n' https://qnfo-ops.q08.workers.dev/v1/jobs   # expect 200
```

Rollback: `git checkout <prev-sha> -- qnfo-ops/worker.js && npx wrangler deploy`, then re-check
`/health`. A rollback to a pre-2.15.1 canonical reintroduces §6.

## 8. Acceptance criteria

- `GET /v1/jobs?limit=3` with **no** `Authorization` header -> HTTP 200, 3 rows, `payload` absent,
  `payload_chars` present.
- `GET /v1/jobs/<id>` with no bearer -> HTTP 200 and the `response` text (the deliverable).
- `GET /v1/jobs/<unknown-id>` -> HTTP 404 `{ok:false,error:"job not found"}` (not 401).
- `POST /v1/jobs` with no bearer -> still 401.
- `GET /v1/jobs` with `OPS_JOBS_PUBLIC="0"` -> 401 (kill switch honoured).
- Authenticated `GET /v1/jobs/<id>` -> row **with** `payload`.
- No `payload` string anywhere in the public response body.

## 9. Failure modes this spec does not fix (adversarial)

1. **The freeze dominates the auth fix.** 28 of 80 rows sit in `continuing` with a non-empty
   `response` (all last written by 07:26:40Z). Making the route public does not make those rows
   report a terminal status; a public poller will read `continuing` forever on exactly the chain
   that prompted this directive. Ship D17 (write the terminal status in the same statement that
   writes `response`, or add a reaper + `terminal_at`) in the same deploy or the directive is
   cosmetically met and functionally unmet.
2. **`tool_log` is public.** 18 of 26 `continuing` rows are truncated at exactly 3,000 bytes and
   only 8 of 26 parse as JSON (parent D1 defect). Public consumers will read malformed logs.
3. **`response` can contain fleet internals.** Job answers quote D1 rows, R2 keys, service
   versions, and occasionally email content. `payload` redaction protects the client's input, not
   the worker's output. If that is unacceptable, the mitigation is a `?fields=` allowlist, not
   auth.
4. **No rate limit on the public path.** D1 reads are cheap but unbounded; a scraper that guesses
   ids gets nothing, a scraper that walks `/v1/jobs?limit=50` gets a full metadata feed. Add a
   per-IP cap if this is exposed beyond the fleet.
5. **The 401 evidence is client-reported.** I could not re-measure it from a non-Worker vantage
   (every path of this host 404s from inside the fleet). If the live guard actually returns 403,
   §1's status code is wrong; the conclusion (a bearer is required) is unaffected.
6. **This spec is unverified against source.** The dispatch site was never read (read cap). The
   insertion shape is inferred from the file head and from the worker's existing helpers
   (`json`, `envInt`, `ROUTES`). The applier must confirm the anchor before trusting §3.
