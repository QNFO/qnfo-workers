# qnfo-ai-calibration — model-depth + code-routing patch (2026-09-13)

Companion to `patches/2026-09-13-gw-sweep-replay-and-health-namespace.md` (RC-1…RC-6).
Scope: the fleet mandate **"models that write and execute deep code need frontier depth;
no dumb models anywhere in the fleet."**

Every claim cites either the exact source line of repo `qnfo-ai-calibration/worker.js`
(sha `7a37a8ab`, VERSION `1.1.4`, 35,742 bytes) or a live D1 query. Items attributed to the
sibling RC doc were **not** independently re-verified here.

> **Deploy hazard — read first.** `qnfo-fleet-deploy` consumes
> `raw.githubusercontent.com/QNFO/qnfo-workers/main/<w>/worker.js` and
> `<w>/deployed-current.worker.js`, caches to R2, and PUTs hourly. Committing
> `qnfo-ai-calibration/worker.js` to `main` **is a production deploy**, not a proposal.
> This file is deliberately placed at `patches/…md`, which is **not** a deployer candidate
> path, so committing it changes nothing at runtime. The `worker.js` edits below are
> **specified, not applied** — see "Why the code fix is not in this commit".

---

## Source-verified facts

| # | Fact | Exact source |
|---|---|---|
| F1 | Probe latency ceiling is **8000 ms**, config-driven | `var latencyMax = parseInt(await cfgGet(env, "latency_max_ms", "8000"), 10) \|\| 8000;` |
| F2 | A **passing** model slower than that ceiling is recorded as a **`fail`** | `if (res.latency_ms > latencyMax) results.push({ probe: "latency", target: m, status: "fail", ... detail: "slow minimal probe (> " + latencyMax + "ms)" });` |
| F3 | Only **10** models are probed | `var ALL_MODELS = Object.keys(TIER0_WA).concat(["deepseek-v4-flash", "deepseek-v4-flash-thinking", "deepseek-v4-pro"]);` — `TIER0_WA` has 7 entries |
| F4 | Probe suite is liveness/plumbing only: `probeCompletion`, `probeVision`, `probeTools`, `probeStream`, `probeRouting`, `probeEndpoint`, `auditRoster` | full-file read |
| F5 | **No probe asserts code correctness.** `probeCompletion` passes on any non-empty reply that echoes the model id | `var pass = r.status === 200 && !!content && String(content).trim().length > 0 && echo;` |
| F6 | `internalId()` falls through to `return m`, persisting an unmapped `@cf/...` id **qualified** into `ai_model_health` | `function internalId(m) { if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m]; ... return m; }` |
| F7 | **Namespace split inside one file:** `fileIssue()` writes `issue_ledger`; the gw-fail dedup guard reads `agent_issues` | writer: `INSERT INTO issue_ledger (fingerprint, source, ...)`; guard: `SELECT id FROM agent_issues WHERE title LIKE ?1 AND status IN ('wontfix','closed','resolved') LIMIT 1` |
| F8 | The gw-fail auto-close pass also reads `agent_issues`, then calls `closeIssue()` which updates `issue_ledger` | `SELECT id, title FROM agent_issues WHERE title LIKE '[gw-fail]%' AND status = 'open'` → `closeIssue(env, ttl, "no failures for 24h")` |

F7/F8 are the core finding: **the dedup guard and its writer address different tables, so the
guard cannot reliably match the row the writer created.** That alone explains repeated gw-fail
filing, and it is visible in the source without any deploy diffing.

**Correction to an earlier claim of mine:** the issue title uses the *qualified* id
(`"[gw-fail] " + b.status + " " + b.model`) and the guard binds `"%"+b.model+"%"` — also
qualified. Those **match**. The qualified id is a consistency/readability problem, **not** a
dedup defect. I previously implied it broke the guard; that was wrong.

---

## P0-1 — Route `domain='code'` to depth models (severity: high)

**Live evidence** — `ai_queries`, `domain='code'`, `GROUP BY model` (re-run 2026-09-13):

| model | n |
|---|---|
| **deepseek-v4-flash** | **180** |
| ensemble | 46 |
| glm-5.2 | 8 |
| qwen2.5-coder-32b | 5 |
| qwen3-30b | 4 |
| deepseek-v4-pro-wa | 4 |
| kimi-k2.7-code | 2 |
| gpt-oss-120b | 2 |
| glm-5.3-flash | 2 |

**180 of 253 code-domain queries (71.2%) go to a flash-tier model.** The two purpose-built
code models together carry ~2.8%. The fleet pays for depth models and does not route to them.
`domain='code'` latency spread spans ~0.5 s to ~131 s under one label — "code" is at least two
workloads being routed as one.

**Fix (router, `qnfo-ai/worker.js`)** — explicit domain→roster rule ahead of generic `auto`
scoring, split by complexity so cheap work stays cheap:

```js
// CODE-ROUTE-1: explicit code roster, complexity-split. Never flash for code.
var CODE_ROUTE = {
  deep:  ["kimi-k2.7-code", "deepseek-v4-pro", "glm-5.3"],
  light: ["kimi-k2.7-code", "glm-5.3-flash"],
};
// in the router, before generic auto-scoring:
if (domain === "code") {
  var tier = complexity >= CODE_DEEP_THRESHOLD ? "deep" : "light";
  var pick = firstHealthy(CODE_ROUTE[tier], health);   // skip status !== 'ok'
  if (pick) return pick;
}
```

**Not verified:** the real function names (`firstHealthy`, `complexity`,
`CODE_DEEP_THRESHOLD`) and the insertion point. `qnfo-ai/worker.js` was not read in this
session, so this is a **specification, not an applied diff.**

---

## P0-2 — Retire literal low-capability roster entries (severity: high)

Remove from the router roster and `TIER0_WA` any model whose class cannot produce verifiable
code: 1B–3B instruct models, micro-class models, and LoRA/variant entries. Named for review:
`llama-3.2-1b`, `gemma-2b`, `granite-h-micro`, `@cf/google/gemma-2b-it-lora`,
`llama-3.2-11b-vision` (only if vision is covered by `gemma-4-26b` / `kimi-k2.7-code`).

**Caveat:** neuron spend is a *cost* signal, not a *capability* signal. The capability claim
rests on parameter class, which is a proxy, not a measurement.

---

## P0-3 — Stop scoring depth as failure (severity: high)

F1+F2 make the fleet **structurally required to prefer fast over deep**: a frontier model
doing genuine multi-step work exceeds 8000 ms and is recorded as a failing probe. Split the
threshold rather than raising one number:

```js
// BEFORE
var latencyMax = parseInt(await cfgGet(env, "latency_max_ms", "8000"), 10) || 8000;
if (res.latency_ms > latencyMax) results.push({ probe: "latency", target: m, status: "fail", ... });

// AFTER — depth models get their own ceiling
var latencyMax = parseInt(await cfgGet(env, "latency_max_ms", "8000"), 10) || 8000;
var latencyMaxDeep = parseInt(await cfgGet(env, "latency_max_ms_deep", "120000"), 10) || 120000;
var DEPTH_MODELS = (await cfgGet(env, "depth_models", "kimi-k2.7-code,deepseek-v4-pro,deepseek-v4-pro-wa,glm-5.3")).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
// ... at the latency check:
var latCap = DEPTH_MODELS.indexOf(m) >= 0 ? latencyMaxDeep : latencyMax;
if (res.latency_ms > latCap) results.push({ probe: "latency", target: m, status: "fail", latency_ms: res.latency_ms, detail: "slow minimal probe (> " + latCap + "ms, depth=" + (DEPTH_MODELS.indexOf(m) >= 0) + ")" });
```

**Config write required:** `latency_max_ms` lives in D1 `ai_calibration_config`, not the
bundle, so changing the code default only helps if the row is absent. qnfo-ops is read-only.

---

## P1-4 — Add a code-correctness probe (severity: high — this is the enforcement gap)

F4+F5: **no instrument in the fleet can detect a shallow code model.** A 2B model passes 100%
of every probe. The mandate is unenforceable as built.

**Critical design constraint:** Cloudflare Workers **forbid `eval` / `new Function`**. A probe
that evaluates model-authored code in-process cannot work. The assertion must run in a
separate sandbox Worker reached over a service binding:

```js
// requires: env.CODE_EVAL  ->  a Worker that runs the assertion with nodejs_compat / isolated eval
async function probeCodeCorrectness(env, model) {
  var t0 = Date.now();
  var task = "Return ONLY JavaScript, no prose, no fences: a function `lastN(a,n)` returning the last n elements of array a, with n clamped to a.length. n greater than a.length must not throw.";
  try {
    var r = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: model, messages: [{ role: "user", content: task }], max_tokens: 512, temperature: 0, stream: false }, 120000, "QNFO_AI");
    var content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
    var code = String(content || "").replace(/```[a-z]*/gi, "").trim();
    if (!code) return { status: "fail", latency_ms: Date.now() - t0, detail: "empty" };
    var ev = await jfetch(env, "https://code-eval.internal/run", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { code: code, tests: [
        { call: [1,2,3,4,5], arg: 2, expect: [4,5] },
        { call: [1,2],       arg: 9, expect: [1,2] },
        { call: [],          arg: 3, expect: [] }
      ] }, 30000, "CODE_EVAL");
    var pass = ev.status === 200 && ev.data && ev.data.pass === true;
    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "ok" : ("eval=" + JSON.stringify(ev.data || {}).slice(0, 100)) };
  } catch (e) {
    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
// wire next to the other probes, persisting under a distinct key:
await runPool(DEPTH_MODELS, 2, async function (m) {
  var res = await probeCodeCorrectness(env, m);
  results.push(Object.assign({ probe: "code-correctness", target: m }, res));
  await upsertHealth(env, m + ":code", res.status === "pass" ? "ok" : "degraded", res.latency_ms, res.status === "pass" ? 0 : 1);
  return res;
});
```

**Failure mode:** this depends on `CODE_EVAL` existing. Until that sandbox Worker is deployed,
the probe cannot be added — do not wire it in with an in-process fallback, because the
fallback is exactly the silent always-pass that created the gap.

---

## P1-5 — Fix the 400 classes at the caller, not the model (severity: high)

`ai_gateway_failures` classes `content-shape` and `tool-args-json` are **request-construction**
bugs in the router/agent loop. Replacing the model does not change them; the same 400s return
from a better model. Fix by volume: `content-shape` first, then `tool-args-json`.

**Concrete instance of this class, produced by this very session:** an ops tool call failed
with `Unterminated string in JSON at position 1437` — the same defect family, emitted by the
model driving the loop. This is the mandate's real target; roster hygiene at the other end
does not fix it.

---

## P1-6 — Retire or repair `qwen2.5-coder-32b` (severity: medium)

Highest-failure code-class model, 5 live code queries, zero recorded output tokens. It is the
`content-shape` offender, so removal is the cheaper correct move than repair.

---

## P2-7 — Probe only what is used (severity: low)

F3: 10 models probed every 30 min, several with near-zero lifetime query counts. Move the
probe list to the models actually routed to, so probe budget tracks traffic, not roster size.

---

## Also land in this PR (from F7/F8)

Make the gw-fail writer and its guard address **one** store. Either point `fileIssue` /
`closeIssue` at `agent_issues` (the store the fleet drain and advisor read), or point both
gw-fail readers at `issue_ledger`. Pick one; the current split guarantees the guard cannot
see its own writes. **Note:** `issue_ledger` has no guaranteed `id` column — select
`fingerprint` if you go that way.

---

## Why the code fix is not in this commit

1. **`github_file_write` cannot create a branch.** Attempting
   `branch: chatbox/ai-calibration-model-depth-p0-p1` returned
   `GitHub 404: Branch chatbox/ai-calibration-model-depth-p0-p1 not found`. This endpoint has
   no ref-creation tool, so **a PR cannot be opened** — `github_pr` needs an existing head branch.
2. **The only writable branch is `main`, and `main` is the deploy source.** Per
   `ops-workspace/audits/2026-09-13-CORRECTION-git-is-the-deployer-upstream.md`, `qnfo-fleet-deploy`
   reads `raw.githubusercontent.com/QNFO/qnfo-workers/main/<w>/worker.js` hourly. Committing
   `worker.js` there would **deploy unreviewed code to production**, bypassing the review a PR
   is meant to provide. Given the gw-fail regression this same worker already suffered from an
   unreviewed rewrite, that trade is not acceptable.
3. This file is at `patches/…md`, a **non-candidate** path, so committing it is runtime-inert.

**To land the code:** apply `qnfo-ai-calibration/apply-model-depth-fix.mjs` on a branch created
by a client that can push refs, review, then merge — the deployer will pick it up on its next
hourly scan.

## Not fixed here

- Nothing in this patch is deployed. No deploy path exists on qnfo-ops.
- P0-1 is a specification, not an applied diff (`qnfo-ai/worker.js` not read in full).
- `latency_max_ms` and the roster live in D1/config; a write-capable path is required.
- `ops_issue_run` closed 0/24 on the live backlog — every row returns `no probe target`.
  The drain cannot remediate this class; separate defect.
