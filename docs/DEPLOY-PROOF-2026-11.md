# Every deploy proves itself (DEPLOY-PROBES-1, REVIEW-GATE-1; 2026-11-04)

Charter pillar: **autonomy** (output quality of the fleet's own changes), bounded by **cost**. Owner brief 2026-11-04: raise output quality by making every deploy
prove itself and by adding an independent, cheap review gate for risky code before it merges. Items (a) measure, (b) post-deploy probes, (c) review gate,
(d) pre-merge parity. Item (d) is built by the PR-VELOCITY-1 session (`scripts/pr_fast_guards.py`, `scripts/regression_gate.py`); this document records what the
measurement says it must cover and does not duplicate it.

## (a) What the last 7 days say (2026-10-28 18:00Z to 2026-11-04 18:00Z, 799 merged pull requests)

Full report with ids: the session notes `deploy-proof-measure.md`; the numbers that decided the design:

| Measure | Count |
|---|---|
| Merges whose own push run had a failed workflow | 666 (83%), 659 of them deploy-gate. deploy-gate was red on every push for 47.7 h (358 merges) |
| "Red main within 24 h of a merge" | 100% of merges, so the count carries no signal; the signal is the merge that turned a green check red (52 merges named in 39 incidents) |
| Reverted within 24 h | 1 (#6323, automatic, after 9.5 min: the VERSION canary worked) |
| RUNTIME-PROBE-FAIL-1 issues | 7, none attributable to a merge with evidence (stale page markers 3, load timeouts 4) |
| Hotfix or follow-up within 24 h | 32 merges (4.0%); 2.4% before MERGE-WHEN-READY-1 (#6928), 14.3% after (lower bound: 416 Copilot PRs have empty bodies) |
| Checks that were advisory on a pull request | all 170 deploy-gate steps (`continue-on-error` on `pull_request`) |

Which check would have caught the 39 incidents before the merge (a check can catch several): baseline-diff PR gate 16, **D1 compile probe 8**, **post-deploy route probe 7**,
required-check presence 5, independent AI review 4, head-pinned merge 3, merge queue 2; five had no cheap catch. The two largest runtime-effect classes
(a dead `fleet_tick` for 24 min, `no such table: issue_assignments`, five migrations that applied "ok" or failed at apply) are D1 compile errors, which no suite saw.

## (b) Post-deploy probes: `<worker>/probes.json`

```json
{ "mode": "revert",
  "health": "https://x.q08.workers.dev/health",
  "http": [ { "url": "https://x.q08.workers.dev/y", "status": 200, "contains": ["marker the page really shows"], "absent": ["Internal Error"] } ],
  "d1":   [ { "binding": "DB",
              "explain":    ["SELECT 1 FROM v_issue_queue LIMIT 1"],
              "noop_write": ["INSERT INTO fleet_tick (source) SELECT 'probe' WHERE 0"] } ] }
```

* `health` opts a worker outside the control plane into the VERSION poll the canary already ran for the seven control-plane workers.
* `http`: a GET from the GitHub runner (outside the account, so no issue-1190 artifact), status and markers, whitespace-insensitive, 4 tries 15 s apart.
  Hosts are limited to the fleet's own (`*.q08.workers.dev`, `qnfo.org`, `q08.org`, `qwav.org`, `qwav.tech`), no secret in the query, GET only. A bare 200 is refused:
  the 2026-11-04 liveness miss was a page that answered while the probe looked for the old page's text.
* `d1.explain`: `EXPLAIN QUERY PLAN <SELECT>` (compiles views and the tables they read). `d1.noop_write`: a real `INSERT ... SELECT ... WHERE 0`, `UPDATE ... WHERE 0` or
  `DELETE ... WHERE 0`, the exact path a worker's write takes, so every trigger body and D1's trigger-depth limit compile while zero rows change (the runner fails the probe
  if `changes` is not 0). Private databases (qnfo-identity, qnfo-outreach, personal-life) are refused: the run log is public.
* A D1 error is a failure only when it is a compile-class error (`no such table|column|function`, syntax, `triggers nested too deep`). `D1 DB is overloaded`, a timeout,
  HTTP 429/5xx and a request that failed at the runner (status 0) are **inconclusive** and never revert: qnfo-audit refused a work claim for that reason while this was written.

Flow (`canonical-deploy.yml`, `scripts/canary_revert.py`, `scripts/deploy_probes.py`):

1. Before the deploy: `deploy_probes.py --baseline` runs the declared probes of the workers about to deploy once and stores `{worker: {probe key: state}}`.
2. After the deploy: the canary polls VERSION (control plane and every worker with `health`), then runs the probes. Per probe: passed before and fails now = **regression**;
   declared in the parent commit and already failing before = **pre-existing** (filed, never reverted); declared by this very change = the change's own, so a regression even if it failed before.
3. A regression in a `revert` worker reverts the push through the existing path (`git revert`, VERSION re-bumped above the bad one, mirror kept identical, redeploy dispatched).
   **New in this change:** the redeploy now also covers the other workers the revert changed (a multi-worker pull request used to leave the unfailed workers live on code main no longer
   carried). Not reverted: a worker the push *created* (a revert would delete files of a worker that stays deployed), `mode: "observe"`, a verify-only dispatched run, a worker a later
   push has since changed (that push's canary owns the verdict, like CANARY-AHEAD-1), an inconclusive answer.
4. Evidence: one `cloud_ops_events` row (kind `canary-functional`, per-probe states) per run; a revert files `DEPLOY-PROBE-REVERTED-1` (`CONTROL-PLANE-REVERTED-1` when a control-plane worker
   failed), a failure that reverted nothing files `DEPLOY-PROBE-FAILED-1`. Both carry the failing probe, and for an HTTP probe a `runtime-probe:` line, which D1 turns into a
   runner-https contract: the hourly remediation tick closes the issue when the route answers its marker again.
5. PR time (`scans` job of pr-checks.yml, about 2 s, no new check): `deploy_probes.py --check-pr` validates every declaration against its wrangler.toml and requires one for a changed
   `worker.js` unless the worker is on `scripts/probes-allowlist.txt` (shrink-only) or the description carries `probes: none (<reason>)`. The PR template says so.

Rollout: 30 workers declare probes today (the seven control-plane workers keep the routes the canary always checked, now in their own file, plus D1 statements for fleet-control, ops,
deploy-guard and code-orchestrator; the dashboard, idea-hub and q08-signal-engine declare their public pages; 20 more declare the `/health` VERSION poll). Six live workers are on the allowlist.

**First live finding.** Testing the D1 probes against production on 2026-11-04 found a live outage no check had seen: a plain `INSERT INTO cloud_ops_events` failed with
`triggers nested too deep` from the moment migration `2026-11-04-cloud-ops-events-trigger-cost.sql` applied (18:57:08Z) until about 19:26Z, while `INSERT OR IGNORE` kept working. Writers that use a
plain INSERT (`ops_ai_tool` 107 rows in the prior 90 min, `code-task.intake`, `code-task.spend-cap`) logged nothing for ~30 minutes. Filed as agent_issues 1001789 with a d1-query closing probe;
the qnfo-ops `noop_write` probe on `cloud_ops_events` now guards the statement.

## (c) The review gate: `scripts/review_gate.py`

For a pull request whose diff touches a workflow or migration file, or adds lines about auth, a route condition, the Cache API or a trigger/view, the diff (mirror files dropped,
60 000 characters, the riskiest files first) goes to two Workers AI models of disjoint families with an adversarial brief (auth bypass, injection, cache audience, double submit, null
handling, ORDER BY/LIMIT, retry storms, trigger or migration depth, workflow permissions): **glm-5.3-flash** (`reasoning_effort: low`) and **llama-3.3-70b**. Measured on a 1.3k-token excerpt
before choosing: glm with the default effort, gemma-4-26b-a4b with thinking on, qwen3-30b-a3b and kimi-k2.7-code spent 3 000 to 4 000 tokens reasoning and returned no content; gemma with
thinking off found one dubious item. Cost about $0.012 a run (15k tokens in, 1.5k out at the ladder prices), at most 80 runs a day, recorded in `cloud_ops_events` kind `review-gate`.

* Every finding needs a file in the diff, a trigger of 40+ characters and a fix; a High finding also needs an `evidence` line that occurs verbatim in the diff, else it is demoted to Medium.
  The HOLD decision is made by code from the verified findings, not by the model, and model output only ever becomes comment text.
* A surviving High item posts a comment that starts `HOLD:` (the merge step of pr-lane.yml counts every such comment; the stale-PR lane honours it). A new push releases it: the gate edits its own
  earlier HOLD comments so they no longer start with `HOLD:`; a collaborator's `hold released` comment does the same.
* It runs as a step of the `lane` job, on the event that is about to merge (checks green), before the merge step: no race with the merge, no extra check entry, and it **fails open**
  (no credential, a model outage, an unparseable answer: a log line, the merge goes on).
* Ships in **observe** mode (`REVIEW_GATE_MODE`, repository variable, default observe): the comment starts `review-gate (observe):` and nothing is held. It moves to `hold` after the
  replay below.

Replay (workflow `review-gate`, dispatch only): `scripts/review-gate/v3-dash-pre-review.diff` is the three-screen dashboard block exactly as the independent subagent reviewed it
(`git diff b2e0ed0b^ cc90bf553`, 339 added lines); `v3-dash-pre-review.json` lists the 9 defects fixed afterwards in d921ce3a0 with keyword rules. Results are appended below once run.

## What this does not cover

* A probe proves the routes and statements it names, nothing else; a worker with only the `/health` starter is covered for "the new VERSION is serving", not for behaviour.
* The D1 probes prove the statement compiles, not that its result is right; a trigger that RAISEs at run time needs a scratch replay.
* A revert restores the whole pushed commit, so a bystander change in the same pull request is reverted with the failing one (and now redeployed).
* The review gate reads the diff, not the repository: a defect that needs code outside the hunks is invisible to it. Two models of different families still share blind spots
  (`docs/ENSEMBLE-POLICY.md`: a 9-judge panel was worth 2.18 votes); the evidence rule trades recall for precision.

## Follow-up owed (CLOSED-LOOPS-1)

* After 7 days: counts of `canary-functional` rows (ok / fail / inconclusive), `DEPLOY-PROBE-*` issues, reverts, and `review-gate` rows (cost, High findings, how many a human overruled) against the
  7-day baseline above; flip `REVIEW_GATE_MODE` to `hold` when the false-positive run and the week agree.
* Workers on `scripts/probes-allowlist.txt` shrink by one line each time a PR declares probes for them.
