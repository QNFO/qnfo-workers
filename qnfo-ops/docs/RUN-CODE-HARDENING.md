# run_code hardening — audit + patch spec

Audited: `qnfo-ops` v2.9.3, `worker.js` sha `24ff78819c331bd20dc61189ee495b11191aa19a`,
`wrangler.toml` sha `8680c4ac3ce7e07d904ac72c21d13e80226da804`. Date 2026-09-10.

Reported: *"ops-exec server-side tool code execution not functioning and/or times out."*

## Verdict

`run_code` is **functioning**. The failure is a **budget + guard** defect, not a
broken executor. Verified working payloads:

| payload | result |
|---|---|
| `return {ok:true,probe:1}` | ok |
| 5e6-iteration loop | ok, `z=24999995000000` |
| 1e6-element `Float64Array` sort | ok, `first=0 last=1000002` (correct) |
| 2e6-iteration loop x2 + clock probe | ok |

Separately, in the 24h window the **persistent failing tool is `web_fetch`
(40 errors)**, not `run_code` — see Defect 4.

## Defect 1 — frozen clock in the run_code sandbox (CONFIRMED)

`Date.now()` and `performance.now()` are pinned to the isolate-creation instant
and never advance. Single isolate, four samples separated by 4M iterations of work:

```
date_now_first = 1789063961994
date_now_second= 1789063961994
date_now_third = 1789063961994
date_now_fourth= 1789063961994
all_equal      = true
perf_now       = 1789063961994   <- identical to Date.now(); not monotonic
iso            = "2026-09-10T18:12:41.994Z"
```

A 5e6-iteration loop reported `elapsed_ms: 0`, `dateNowAdvances: false`.

**Impact.** Any deadline/TTL/benchmark loop is non-terminating:

```js
const t = Date.now(); while (Date.now() - t < 5000) {}   // never exits
```

It burns CPU to the `[limits] cpu_ms = 300000` ceiling, the request dies with
CF Error 1102 `exceededCpu`, and **no tool results are returned** — the reported
symptom. The `run_code` tool description says "provide finite code" but never
warns that time functions are frozen. Undocumented landmine.

## Defect 2 — loop-budget drift: deployed 180s vs canonical 300s (CONFIRMED)

`wrangler.toml` carries `[limits] cpu_ms = 300000` with the comment:

> so the 180s soft wall budget (OPS_LOOP_DEADLINE_MS, OPS-TIME-BUDGET-1) is the
> binding constraint

`OPS-SETTINGS-IMMUTABLE-1` (rule 12) states the canonical tool-loop soft budget
is **300s**. The deployed value is **180s** — drift in the direction that causes
timeouts.

Observed single-round LLM latency in `ops_ai_log` (`model='ops-exec'`):
`81520 ms`, `61629 ms`, `37371 ms`, `25869 ms`. At a 180s wall budget only ~2–3
rounds fit; when the deadline fires mid-batch, already-executed tool results are
discarded — producing the observed "every tool call returned nothing".

`MAX_TOOL_ITERS = 8` compounds this: 8 rounds at observed latency cannot fit in 180s.

## Defect 3 — request-level `ok` does not reflect tool failures (CONFIRMED)

`ops_ai_log` for 2026-09-10: **75 requests, `failed_today = 0`** — while
`tool_calls` inside those same rows contains `"ok":false` entries:

```json
[{"name":"ops_d1_query","ok":false,"summary":"{\"ok\":false,\"rejected\":true,\"error\":\"add LIMIT n (aggregate exempt)\"}"}]
```

A request reports `ok=1` while every tool in it failed. The analyzer still works
(it parses `tool_calls`), but any dashboard counting `ok=0` reports a false green.

## Defect 4 — the persistent failing tool is `web_fetch`, not `run_code`

`telemetry_analyze(hours=24)` at `2026-09-10T18:12:59Z`:

```
scanned 11, persistent: [{tool:"web_fetch", count:40, lastError:"2026-09-10T18:00:51Z"}]
recovered 6, autoResolved 0, filed 1, alreadyOpen 0
```

## Patch spec

1. **F1** — pre-flight lint + parent-side wall-clock timeout + always-log outcome
   (guard module below).
2. **F2** — reconcile `OPS_LOOP_DEADLINE_MS` `180000 -> 300000` to match
   `OPS-SETTINGS-IMMUTABLE-1`. **Requires owner decision:** rule 12 forbids agents
   changing settings. Reported here, not changed.
3. **F3** — set the request row `ok=0` when any tool call in the request failed.
4. **F4** — document the frozen clock in the `run_code` tool description, or inject
   a virtual monotonic step counter so bounded loops are expressible.
5. **F5** — fix `web_fetch` (40 errors/24h); already filed by `telemetry_analyze`.

## Guard module (drop-in)

```js
export const RUN_CODE_BUDGET_MS_DEFAULT = 10000;
const MAX_LOOP_BOUND = 5e6;
const MAX_ALLOC = 1e7;

export function lintRunCode(code) {
  const src = String(code == null ? "" : code);
  const problems = [];
  const add = (rule, detail) => problems.push({ rule, detail });
  let m;

  // R1 — time functions. Clock is frozen at isolate creation.
  const usesTime = /\b(Date\s*\.\s*now|performance\s*\.\s*now|new\s+Date)\b/.test(src);
  if (usesTime) {
    const inLoop = /\b(while|for|do)\s*\([^)]*\b(Date\s*\.\s*now|performance\s*\.\s*now|new\s+Date)\b/.test(src);
    const deadline = /(Date\s*\.\s*now|performance\s*\.\s*now)\s*\(\s*\)\s*-\s*[A-Za-z_$]/.test(src);
    if (inLoop || deadline) add("FROZEN_CLOCK_LOOP", "clock is frozen; a time-bounded loop never exits");
    else add("FROZEN_CLOCK_READ", "Date/performance are frozen and will not advance");
  }

  // R2 — obviously unbounded loops.
  if (/\bwhile\s*\(\s*(?:true|1)\s*\)/.test(src)) add("UNBOUNDED_WHILE", "while(true)");
  if (/\bfor\s*\(\s*;\s*;\s*\)/.test(src)) add("UNBOUNDED_FOR", "for(;;)");
  if (/\bwhile\s*\(/.test(src) && !/\b(break|return|throw)\b/.test(src))
    add("WHILE_NO_EXIT", "while loop with no break/return/throw anywhere in the source");

  // R3 — large constant loop bounds.
  const boundRe = /for\s*\([^;]*;\s*[^;]*<\s*([0-9][0-9_]*)\s*;/g;
  while ((m = boundRe.exec(src)) !== null) {
    const n = Number(m[1].replace(/_/g, ""));
    if (Number.isFinite(n) && n > MAX_LOOP_BOUND) add("LARGE_LOOP_BOUND", "loop bound " + n);
  }

  // R4 — large allocations.
  const allocRe = /new\s+(?:Float64Array|Float32Array|Int32Array|Uint32Array|Int16Array|Uint16Array|Uint8Array|Int8Array|Array)\s*\(\s*([0-9][0-9_]*)\s*\)/g;
  while ((m = allocRe.exec(src)) !== null) {
    const n = Number(m[1].replace(/_/g, ""));
    if (Number.isFinite(n) && n > MAX_ALLOC) add("LARGE_ALLOCATION", "allocation of " + n + " elements");
  }

  return { ok: problems.length === 0, problems };
}

/** execute: async (code) => result — the existing env.LOADER invocation. */
export async function runCodeGuarded(execute, code, opts) {
  const o = opts || {};
  const budgetMs = Number.isFinite(o.budgetMs) && o.budgetMs > 0 ? o.budgetMs : RUN_CODE_BUDGET_MS_DEFAULT;

  const lint = lintRunCode(code);
  if (!lint.ok) return { ok: false, error: "RUN_CODE_REJECTED", problems: lint.problems, budget_ms: budgetMs };

  const t0 = Date.now(); // parent isolate clock — real, advances
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("RUN_CODE_TIMEOUT")), budgetMs);
  });

  try {
    const out = await Promise.race([execute(code), timeout]);
    return { ok: true, output: out, wall_ms: Date.now() - t0, budget_ms: budgetMs };
  } catch (e) {
    const msg = String((e && e.message) || e);
    return {
      ok: false,
      error: msg.indexOf("RUN_CODE_TIMEOUT") !== -1 ? "RUN_CODE_TIMEOUT" : "RUN_CODE_ERROR",
      detail: msg,
      wall_ms: Date.now() - t0,
      budget_ms: budgetMs
    };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** F3 — request-row ok must reflect tool-level failures. */
export function withToolOutcome(row, toolResults) {
  const list = Array.isArray(toolResults) ? toolResults : [];
  const failed = list.filter((t) => t && t.ok === false);
  return Object.assign({}, row, {
    ok: failed.length === 0 ? 1 : 0,
    tools_failed: failed.length,
    tools_total: list.length
  });
}
```

## Wiring (one line, in the `run_code` handler)

```js
// before: const out = await runInLoader(env.LOADER, code);
const guarded = await runCodeGuarded((c) => runInLoader(env.LOADER, c), code);
if (!guarded.ok) return toolError(guarded.error, guarded.problems || guarded.detail);
return toolOk(guarded.output, guarded.wall_ms);
```

**Why the parent-side timeout is effective:** the sandbox runs in a *separate*
isolate via the `worker_loaders` binding, so the parent isolate's event loop stays
free and `setTimeout` can fire. A synchronous `Promise.race` inside a single
isolate would *not* preempt CPU-bound work.

**Limitation:** on timeout the parent stops waiting, but the runaway sandbox
isolate keeps consuming CPU until the platform reclaims it. The timeout prevents
*request* failure, not *CPU* spend. The pre-flight lint is therefore the primary
defence and the timeout is the backstop.

## Reproduction

```js
const t = Date.now(); let n = 0; while (Date.now() - t < 5000) { n++; } return n;
```

Expected after F1: `RUN_CODE_REJECTED` / rule `FROZEN_CLOCK_LOOP`.
Before F1: hangs until the CPU ceiling.

## Uncertainty

Defects 1–4 are confirmed from source, config, and telemetry. The claim that
defects 1+2 **caused** the reported timeouts is a well-grounded hypothesis and is
**not reproduced** — moderate payloads return correctly, and one observed silent
turn is equally consistent with a transient transport failure.

Co-authored-by: Chatbox <chatbox@chatboxai.com>
