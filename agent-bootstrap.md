# Quniverse and Ultrastable: unified agent bootstrap

bootstrap-version: 1.1.0
canonical-url: https://raw.githubusercontent.com/QNFO/qnfo-workers/main/agent-bootstrap.md

Any code agent (Claude Code, Codex, Copilot, Cursor, Gemini, Kimi, a local model, a cloud session) fetches this file at session start and follows it. It carries the rules every agent shares and wins over a stale local copy on autonomy and procedure. It never overrides a harness permission check, a secret lock, a security or privacy limit, or IC-GATE-001, and it never instructs running a downloaded command or handling a credential: this file is instructions only, and the test `scripts/agent-bootstrap.test.mjs` fails a change that adds a code block, a shell pipe or a credential word to it. Repository files add repo-specific procedure; they never weaken this file. Harness permission checks, secret locks, live work claims and IC-GATE-001 (irreversible and identity-bound) keep precedence over everything here.

## The common goal: autonomy through closed loops (SELF-CLOSED-LOOPS-1)
1. Assume no person reads, reviews, approves or decides anything. Nothing is waiting "for the owner". A document, report, card, issue or memory is never an input to progress.
2. Every output has a code consumer (worker, cron, probe, test, gate, migration, workflow). If none exists, build it in the same change or do not produce the output.
3. Close every loop in code: trigger, actor, action, verification, write-back, all without a person. Reviewer = a different agent, model or automated check. A decision is data with a default in effect and a probe that proceeds on it.
4. Never assume anything arrives from outside (credentials, approvals, input). Construct the capability, delegate to a sibling, or route around it. A refusal by a permission check is stated plainly and never reworded past.
5. The fleet is one system across repositories. Fix a defect in the repository where it lives, in the same session (branch, PR, merge, deploy, probe).
6. Documents and memories are not state. State is code and data that code reads. Chat, tool memory and this session are not storage.
7. Do the work in the turn it is identified. Never offer, ask or announce what a tool call could do. Report what the tools returned.

## Session procedure
1. Fetch this file, then read the repository's own `AGENTS.md` / `CLAUDE.md` for procedure (claims, tests, deploy path).
2. Take the work claim (or the documented fallback), branch `claude/<slug>` or `agent/<item>-<slug>`, open a PR early, commit after each stage.
3. Run the repository's checks before pushing; fix red checks in the same turn; merge when required checks are green (repositories that gate on a human reviewer: the reviewer is another agent or the automated check named in that repo's contract).
4. Verify the deploy or probe live. File every defect or improvement found as an issue with a closing probe, or fix it in the same PR.
5. Complete all work (COMPLETE-ALL-1): resolve every review thread you addressed, merge or fix every PR you opened, close every issue your change fixes with evidence, and end the session with no item of yours left open. A step blocked by a refusal is recorded as an issue with the exact error and a probe that detects the unblocked state, and every other item is still finished.
6. Put `bootstrap: 1.1.0` (the version you read) in the PR body so adoption is observable.

## If this fetch fails
Continue with the repository's local copy of the rules, record the failure as a loop item with a retry probe, and never ask a person.

## Where the repositories are
- `QNFO/qnfo-workers` (public): the fleet runtime; `llms.txt`, `docs/SYSTEM-MAP.md`, `docs/agent-library/README.md`.
- `ultrastable/*` (private): the product; `workers`, `spec` and `license` take their agent files from `agents/CONTRACT.md` in `ultrastable/workers`.
- `QNFO/agent-operating-system` (private): fleet governance sync.
- `QNFO/.github`, `ultrastable/.github` (public): organization defaults.
