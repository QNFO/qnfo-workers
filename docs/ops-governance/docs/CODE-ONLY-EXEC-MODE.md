# CODE-ONLY EXEC MODE — ops-exec spec (draft)

Status: DRAFT (2026-09-12). Subject to review before any deploy.
Scope: qnfo-ops / ops-exec endpoint, in place. **No new endpoint.**

## 1. Purpose

Make `ops-exec` behave like server-side Claude Code on any LLM client: a
frontier-model-quality **code agent that executes only code** (no chat, no
conversation), 100% on Cloudflare, cost-managed, via Dynamic Workers (and/or
equivalent free/low-cost execution methods).

Grounded in the compatibility audit (2026-09-12, 1,390 ops_ai_log rows):

- `run_code` is invoked **79 of 2,582 tool invocations (3.1%)** — code is a
  side feature, not the core.
- 97% of traffic is ops introspection (D1/fleet/backlog) + the memory pipeline
  + chat + content creation.
- Therefore the code-only mode is a **routed mode inside qnfo-ops**, not a
  wholesale conversion. A literal "code-only, no chat" gate on the whole
  endpoint would break the memory pipeline, the conversation compressor, human
  chat, and the DeepChat main agent (DEEPCHAT-DEFAULT-MODEL-1).

## 2. Architecture

Two components, both in the qnfo-ops request handler:

1. **Domain classifier** — labels each request `code | ops | chat` on the
   user's actual turn (not the injected system-prompt context).
2. **Router** — `code` → code-only prompt + code model + code toolset;
   `ops` → existing OPS_SYSTEM_PROMPT + ops model + 31-tool ops toolset;
   `chat` → existing general-LLM path (memory pipeline, compression, chat).

No new worker. No new route. The `domain` column already exists in
`ops_ai_log` (currently all 'ops') and becomes the telemetry anchor.

## 3. Code-only system prompt

Injected as the system message when `domain='code'`:

```
You are qnfo-ops/ops-exec in CODE MODE — a server-side code agent (the QNFO
equivalent of Claude Code) running 100% on Cloudflare. You write, run, and
verify code. You do not chat, do not converse, do not produce prose essays,
and do not narrate your process.

CODE-ONLY CONTRACT (binding):

C1. CODE IS THE ONLY PRODUCT. Every turn: receive a code task -> write/edit
    code -> run it -> verify -> return the executed result. Output = code,
    execution output, diffs, test results, and at most a one-line summary.
    Never produce conversational prose; never ask a clarifying question a tool
    call or the code itself could resolve; never "explain what you would do"
    without doing it.

C2. SERVER-SIDE ONLY. All code executes on Cloudflare (Dynamic Workers + the
    R2-backed workspace). You are the sole executor. NEVER emit code, shell
    commands, SQL, or tool-call syntax FOR the client to run locally; NEVER
    hand back a tool_calls payload for the client to execute; NEVER ask the
    user to run/paste/open/install anything. A mobile client cannot run code —
    you run it and return the completed result.

C3. TOOL-RESULT-FIRST. Lead with the executed result (stdout, return value,
    file content, diff, exit code, test output), then at most a one-line
    summary. No essays, no meta-commentary, no "I'll now...", no signposting.

C4. LOOP UNTIL DONE. plan -> write -> run -> verify -> report, in one turn,
    without stopping to ask permission. Re-run after fixes until the code
    compiles/runs and the result is verified. Chain all steps server-side.

C5. CODE TOOLSET (the only tools in code mode): run_code (execute JS on
    Cloudflare), workspace_write/read/list/delete (virtual filesystem),
    github_repo_read/github_file_write/github_pr (version control),
    web_fetch/web_search (lookup). Ops tools (fleet_status, email_*,
    ops_d1_query, research_queue, etc.) are OUT of scope in code mode — those
    belong to the ops contract, not the code contract.

C6. VERIFY WITH EVIDENCE. Every "done" claim carries the executed output as
    evidence (actual stdout / return value / diff, never a paraphrase). If a
    tool errors, report the exact error text. Never fabricate a result; a
    missing result is an incomplete task.

C7. ADVERSARIAL. State at least one concrete failure mode or limitation of the
    code (edge case, missing test, unverified assumption). Do not claim
    correctness without a run; do not inflate confidence.

C8. COST-MANAGED + SERVER-SIDE. All execution is free (Dynamic Workers) and
    100% on Cloudflare. Keep runs bounded; long/CPU-heavy work goes through
    the async path (x-ops-async:1 / POST /v1/jobs).
```

## 4. Request gate (domain classifier + router)

Classifier runs on `lastUserText(work)` — the user's actual turn, never the
injected system-prompt context (which would otherwise misclassify every
DeepChat request as code).

Deterministic classifier (no model call, $0), **biased toward false-negatives**:

- **code** (weighted, threshold-gated):
  - explicit intent: `run_code`, `execute this`, `run this`,
    `write a script/function/code`, `implement`, `fix this code`,
    `debug`, `refactor`, `write a test`, `deploy`, `commit`, `PR`
  - code artifacts: code fences (````), import/require, `function `,
    `def `, `class `, `const `, `let `, `await `, `return `,
    `print(`, `console.log`, `#!`, file extensions (.py/.js/.ts/.sh/.mjs)
  - explicit hint: request body `domain:'code'` or header `x-ops-domain: code`
- **ops**: `fleet_status`, `backlog`, `email`, `check the fleet`,
  `list open issues`, `d1`, `r2`, `vectorize`, `audit`,
  `research queue`, `intents`
- **chat** (default): memory pipeline, conversation compression, human chat,
  content creation — anything that does not clearly match code or ops.

Bias rule (HARD): when evidence is ambiguous, classify `ops` or `chat`, not
`code`. A code request misrouted to ops still works (general model + full
toolset). An ops/chat request misrouted to code breaks it (memory pipeline
classified as code would get a code-only prompt + no ops tools).

Routing:

| domain | system prompt | model | toolset |
|---|---|---|---|
| `code` | CODE-ONLY (above) | `@cf/moonshotai/kimi-k2.7-code` ($0) | code toolset (run_code + workspace + github + web) |
| `ops`  | OPS_SYSTEM_PROMPT (existing) | `ops-exec` (DeepSeek) | full 31-tool ops toolset |
| `chat` | general (existing) | `ops-exec` | no tools (prose) |

Log `domain` to `ops_ai_log.domain` every request.

## 5. Cost + server-side invariants

- **Cost:** classifier is deterministic ($0); code model is Workers-AI $0.
  Expected effect: near-zero marginal cost for the code path, and no change to
  the ops/chat paths. Under the $90/30d limit (verified active).
- **Server-side:** unchanged — every tool still executes on Cloudflare via
  Dynamic Workers. Phase 1 (server-side enforcement) is already landed
  (hybrid=false; zero hybrid-family rows since 2026-09-09).

## 6. Verification probes

1. `run run_code: 12345*6789` → `83810205`, finish=stop, zero client-side
   execution (existing canonical probe, unchanged).
2. A code-shaped prompt (`write a function that sums an array and run it`)
   → `domain='code'`, model=kimi-k2.7-code, returns executed output, no prose.
3. A memory-pipeline prompt (`You decide how a newly extracted memory
   relates...`) → `domain='chat'`, unchanged, NOT code.
4. An ops prompt (`check the fleet`) → `domain='ops'`, unchanged.
5. `ops_ai_log.domain` populated with code/ops/chat after each probe.

## 7. Rollout

1. Implement the deterministic classifier + router in the qnfo-ops request
   handler (no new endpoint).
2. Ship code-only prompt + kimi-k2.7-code routing behind the classifier.
3. Verify probes 1–5; watch `domain` distribution in ops_ai_log for 48h.
4. Only after the distribution stabilizes, consider expanding the code
   toolset (Phase 2: mount workspace into run_code, add shell/exec primitive).

## 8. Open questions / adversarial caveats

1. **Model quality.** kimi-k2.7-code is $0 and code-specialized, but whether
   it is "frontier-model-quality" is unverified until a code benchmark run.
   Fallback ladder: kimi-k2.7-code → deepseek-v4-pro (code) → glm-5.3.
2. **Classifier precision.** The deterministic classifier's precision on real
   traffic is unmeasured. The false-negative bias makes it safe but may leave
   some code requests on the general model. Measure and tune after rollout.
3. **Phase 1 was already landed** (not part of this spec's deploy). Confirmed:
   `const hybrid=false` in the live 2.9.5 bundle; telemetry shows zero
   hybrid-family rows since 2026-09-09.
