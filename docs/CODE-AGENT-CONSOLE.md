# Code-agent console (CODE-AGENT-CONSOLE-1)

Charter pillars: autonomy, cost. Owner request 2026-10-29: the fleet dashboard command line (`/cmd`, qnfo-fleet-dashboard 1.77.1) should work like a desktop code agent
(Claude Code, GitHub Copilot agent), entirely server side on Cloudflare, cost-optimised. The owner reports it is kludgy and does not work.

## What exists
- `/cmd` is a deterministic verb parser inside a 17k-line worker plus, since 1.77.0 (CMD-AGENT-1), a hand-off of plain English to the durable qnfo-ops agent, polled by the page.
- `qnfo-agents` 0.2.6 is a Cloudflare Agents SDK worker (Agent Durable Object, fibers, schedules, MCP client and server, Code Mode sandbox, Workers AI).
- Models: `deepseek-v4-flash-wa` and `deepseek-v4-pro-wa` (1M context) in `scripts/model-policy.json`.
- Not reproduced: the failure itself. `/cmd` actions need the owner's emailed code, so the concrete failing cases are unmeasured. Slice 0 (below) records what a signed-out run showed.

## Target shape
One agent session is one Agents SDK Durable Object (`CodeSession`), streamed to the browser over SSE or WebSocket. The page and `scripts/qcli.mjs` are thin clients of the same route.

| Desktop-agent capability | Server-side Cloudflare piece |
|:--|:--|
| Streaming turn with visible tool steps, interrupt, resume | Agents SDK DO, streamed text, SSE; state survives reconnect |
| Read and edit files, run shell and tests | Sandbox SDK container with the repo, Code Mode for cheap tool use |
| Git and PRs | GitHub App token through the fleet's existing route; work claims taken before edits |
| Plan then approve | Plan message the page renders; destructive tools need the existing fresh code |
| Cheap context | stable cached prefix, trimmed tool results, rolling summary, two-tool code-mode surface (search plus execute) |
| Model | DeepSeek V4 Flash first, Pro on escalation, through AI Gateway (cache, logs); Workers AI free allowance first |
| Slash commands and `/cmd` verbs | existing parser stays as a fast path before any model call |

Cost levers, in order: deterministic verb parse (no tokens), flash model, cached prefix, trimmed tool output, code-mode surface, summary compaction, and a per-session neuron budget that downgrades the model and never stops work (BUDGET-SOFT-ROUTE-1).
Free-of-charge limits, stated plainly: Workers AI's free allowance is 10,000 neurons a day; the Sandbox container needs the Workers Paid plan the fleet already has, so it is cheap, not free.

## Slices
0. Failure inventory: ten real `/cmd` turns replayed through `qcli.mjs`, with the failing stage named (RM-CMD-FAILURES-1).
1. `CodeSession` streaming endpoint in qnfo-agents plus a chat pane at `/cmd` (RM-CODE-SESSION-1).
2. Sandbox file and shell tools with claims, plan/approve and PR creation (RM-CODE-SANDBOX-1).
3. Retire the polling hand-off and the duplicated verb UI in qnfo-fleet-dashboard once slice 1 passes the same ten turns.

Counter-argument: rewriting a working verb parser risks regressions, so the parser stays as the first stage and slice 3 removes only what slice 1 replaces.
Failure mode: a sandbox shell with repo write access is a prompt-injection target; edits stay behind work claims, PRs and the existing merge gates.

## Slice 0 inventory (RM-CMD-FAILURES-1, run 2026-10-29 12:40Z, signed out, `scripts/qcli.mjs` against fleet.qnfo.org)

Ten turns, read-only and public. The signed-in cases (code change, tool run) were not reached: a one-shot run cannot answer the emailed-code prompt.

| # | Turn | Result | Failing stage |
|:--|:--|:--|:--|
| 1 | `status` | answered in 1 s | none |
| 2 | `help` | answered in 1 s | none |
| 3 | `tools` | answered in 2 s (75 tools) | none |
| 4 | what is the constraint program right now | `error: bad id` after 5 s | client poll (qcli) |
| 5 | show open critical issues | `error: bad id` | client poll (qcli) |
| 6 | why did deploy-gate fail on main today | `error: bad id` | client poll (qcli) |
| 7 | fix the typo in docs/README.md and open a PR | `error: bad id` | client poll (qcli) |
| 8 | run the tests for qnfo-agents | `error: bad id` | client poll (qcli) |
| 9 | list workers behind main | `used today's 5 plain-English questions` | public cap (5 a day), reached on turn 9 because turns 4-8 each spent one |
| 10 | `tool fleet_probe {}` | process crash `ERR_USE_AFTER_CLOSE` after emailing a sign-in code | client (qcli) sign-in prompt without a terminal |

Findings:
1. Every plain-English turn that is still running after the first poll failed. Cause: `send()` polled `/api/cmd/job/` + `j.id` after `j` had been replaced by the poll answer, which carries no id, so the second poll hit `/job/undefined` ("bad id"). Fixed in `scripts/qcli.mjs` (CMD-CLI-POLL-1), test `qnfo-fleet-dashboard/cmd-cli-poll.test.mjs` fails without the fix and passes with it. The web page's own poller was not tested; whether the owner's "does not work" is this bug or a page bug is still open.
2. A failed turn still spends one of the five public plain-English questions a day, so a client bug used the whole allowance in five turns.
3. A signed-out one-shot run that needs a code crashed after the code email was sent. It now prints how to sign in (`node scripts/qcli.mjs login`) and does not send one.
4. A plain-English answer takes 4-5 s to fail and a model turn is a polled job in `cmd_log`; there is no streamed output, which is the gap `CodeSession` closes.

Not yet measured, needs the owner's session: signed-in agent turn (CMD-AGENT-1 hand-off to qnfo-ops), a decision, a code change, and the page's own poller.
