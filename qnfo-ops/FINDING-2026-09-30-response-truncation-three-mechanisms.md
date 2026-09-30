# FINDING 2026-09-30 — Response truncation: three independent mechanisms

Audited: `qnfo-ops/worker.js` @ repo HEAD, VERSION `2.37.31-continuation-inherit`,
380,292 bytes. The repo version string matches the live deployed bundle, so this
source is authoritative (not a stale branch).

## Verdict

"Response truncation" is not one bug. There are three independent hard caps, and
none of them is the advertised 393,216.

### 1. Tool-result cap — `execTool` (~line 3330)

```js
const cap = resultCap || 16e3;
return { tool_call_id: null, name, ok: !!(res && res.ok),
         text: text.length > cap ? text.slice(0, cap) + "...(truncated to " + cap + " chars)" : text };
```

`resultCap` = `toolResultCap` = `envInt(env, "OPS_TOOL_RESULT_CAP", MAX_TOOL_RESULT_CHARS=16384)`
(lines 4210 / 5337). **Every tool result is JSON-stringified and cut at ~16 KB
before the model ever sees it.** This is the cap that makes long audits come out
"thin" — the model reasons over a 16 KB prefix and cannot know what it lost.

### 2. Answer cap — upstream generation clamped to 32,768 tokens

```
line  101: var GW_MAX_OUT = 32768;
line 4205: answerCap = Math.max(8192, clamp(max_tokens || DEFAULT_MAX_OUT,
                                  Math.min(DEFAULT_MAX_OUT, envInt(env,"OPS_ANSWER_CAP",393216))));
line 4352: max_tokens: Math.min(answerCap, GW_MAX_OUT)      // agent / stream path
line 3533: max_tokens: Math.min(maxTokens, GW_MAX_OUT)      // callDeepSeek (non-stream)
line 3607: max_tokens: Math.min(maxTokens, GW_MAX_OUT)      // callDeepSeekStream
line 4001: max_tokens: Math.min(maxOut, GW_MAX_OUT)         // relay path
```

`OPS_ANSWER_CAP` is honoured but then **clamped by the `GW_MAX_OUT` constant**, so
the advertised `max_output: 393216` (manifest, lines 141/167) is unreachable.
Effective ceiling = **32,768 output tokens**.

### 3. Tool-round cap

```
line 4206: _baseRoundCap  = envInt(env,"OPS_TOOL_ROUND_MAX", 32768);
           toolRoundCap   = Math.min(answerCap, Math.max(_baseRoundCap, Math.min(8000, ceil(estTokens(messages)*0.2))));
```

When the tool loop's accumulated content reaches `toolRoundCap` the answer is cut
and a sentinel is emitted (lines 4421 / 4577 / 5432): *"The answer was truncated
by the token budget ... Please re-send your request."* This is the classic
"thinking consumed the tool-round cap" failure.

### Secondary, and NOT silent

- `truncateToContext` (lines 425/433) drops history but **marks it**:
  `"[truncated N earlier chars to fit model context]"`, `"[history truncated: N earlier messages dropped]"`.
- `shell_exec` stdout is sliced to 65,536 chars (line 3081), with
  `stdout_truncated` flags returned alongside.

## Why the user-visible cut is intermittent

`ops_ai_log`, 1,236 rows: **max response 19,550 chars, exactly 1 row >= 16,000,
0 rows >= 32,768.** The token cap has not fired in the logged window — so cap #2
cannot explain a truncation observed in the log. What users actually hit is
(a) the 16 KB tool-result cut, which starves the model and produces a short
answer, and (b) the tool-round cap in long tool loops. A cap that never fires in
the log is not the cause of a cut seen in the log; that distinction matters
because the obvious "fix" (raise the answer cap) would change nothing.

## Separate defect confirmed in the same audit (#1489)

`cfWorkerRead` (~lines 2206–2222):

```js
const parts = raw.split(/--[^\r\n]+/);
for (const p of parts) {
  if (p.indexOf("worker.js") >= 0 || p.indexOf("application/javascript") >= 0) {
    const body = p.replace(/^[\s\S]*?\r?\n\r?\n/, "");
    if (body.trim()) { src = body; break; }
  }
}
...
return { ok: true, worker, version, size: src.length, ..., truncated: src.length > maxChars };
```

In a Cloudflare script upload the **metadata part precedes the script part** and
its JSON contains the literal `"worker.js"` as `main_module`. The predicate
therefore matches the metadata part first, so `src` becomes a ~352-byte JSON blob
and the tool reports `size: 352, truncated: false` for a 380,292-byte worker.
The false size/truncated pair is this predicate, not a reporting quirk — and it
has already fabricated root causes in audits.

Fix: select the part whose `Content-Disposition` names `worker.js` **and** whose
content-type is not JSON, or simply take the largest part.

## Remediation status

- Caps 1–3 are env-overridable **except** the `GW_MAX_OUT` clamp. Patch:
  `PATCH-2026-09-30-output-cap-decoupling.diff`.
- **NOT deployed.** qnfo-ops must not self-deploy while `cf_worker_deploy` strips
  `[[containers]]` (#1487) and binding preservation is falsified (#1497). A bad
  self-deploy takes down the endpoint that would perform the repair — the repair
  path must not be the blast radius.
- Staged for a guarded deploy path (read full bindings + containers + limits,
  echo them in the upload metadata, then post-deploy assert `cpu_ms` and binding count).
