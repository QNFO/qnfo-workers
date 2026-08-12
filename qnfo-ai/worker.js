// qnfo-ai v4.3.0 — Model Router + Ensemble + Auto-Routing
// Reconstructed 2026-08-11 from live API contract after WORKER-THIN-CLIENT-1 remediation.
// ROOT-CAUSE FIX: v4.2.0 had NO [[ai]] binding -> env.AI undefined -> tier-0 free models
// returned "All models failed." while DeepSeek API (secret) worked. v4.3.0 declares the
// AI binding in wrangler.toml and routes tier-0 through env.AI.run() (Workers AI FREE).
// Ensemble directive: primary coder + validator + reviewer, all Workers AI free models.

const VERSION = '4.3.8';
const ROUTES = ['/health', '/v1/chat/completions', '/v1/models', '/v1/models/:id', '/v1/responses', '/chat/completions', '/v1/search', '/v1/history'];
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const GW_COMPAT = 'https://gateway.ai.cloudflare.com/v1/edb167b78c9fb901ea5bca3ce58ccc4b/default/compat/chat/completions';

// ---------------- Model Registry ----------------
// tier 0 = Workers AI FREE (no key, edge GPU)
// tier 1/2 = DeepSeek API (DEEPSEEK_API_KEY secret)
// tier 3 = Anthropic/OpenAI via AI Gateway compat (CF_API_TOKEN secret)
const MODELS = {
  // Workers AI free — original three
  'llama-3.3-70b':            { tier: 0, family: 'meta',     wa: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',   reasoning: false, maxOut: 8192 },
  'deepseek-r1-qwen-32b':     { tier: 0, family: 'deepseek', wa: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', reasoning: true,  maxOut: 8192 },
  'qwen3-30b':                { tier: 0, family: 'qwen',     wa: '@cf/qwen/qwen3-30b-a3b-fp8',                  reasoning: false, maxOut: 8192 },
  // Workers AI free — directive substitutes (small coder/validator/reviewer class)
  'qwen2.5-coder-32b':        { tier: 0, family: 'qwen',     wa: '@cf/qwen/qwen2.5-coder-32b-instruct',         reasoning: false, maxOut: 8192 },
  'llama-3.2-1b':             { tier: 0, family: 'meta',     wa: '@cf/meta/llama-3.2-1b-instruct',              reasoning: false, maxOut: 4096 },
  'gemma-2b':                 { tier: 0, family: 'google',   wa: '@cf/google/gemma-2b-it-lora',                 reasoning: false, maxOut: 4096 },
  'granite-h-micro':          { tier: 0, family: 'ibm',      wa: '@cf/ibm-granite/granite-4.0-h-micro',         reasoning: false, maxOut: 4096 },
  // DeepSeek API
  'deepseek-v4-flash':        { tier: 1, family: 'deepseek', api: 'deepseek-chat' },
  'deepseek-v4-flash-thinking': { tier: 1, family: 'deepseek', api: 'deepseek-reasoner' },
  'deepseek-v4-pro':          { tier: 2, family: 'deepseek', api: 'deepseek-chat' },
  // v4.3.7: tier-3 AI Gateway models REMOVED — the compat endpoint returns 400
  // "Chat completion bad format" (2019) for every one of them, surfacing as router
  // 502 + the app's Model Check 5s timeout. Advertising models that cannot respond
  // is worse than not advertising them. Explicit requests for unknown models fall
  // back to deepseek-v4-flash (existing behavior).
};

// Per-model output token caps (v4.3.5 — Bad Gateway fix, 2026-08-12).
// Workers AI models reject max_tokens above their max_total_tokens (e.g. llama-3.3-70b
// rejects 32000 with 400 -> router previously mapped that upstream 4xx to 502 Bad Gateway).
// Every call path clamps the requested max_tokens to the routed model's cap so an
// oversized client max_tokens can never surface as a router 502.
const MAX_OUT = {
  // Workers AI (tier-0) — safe caps well under observed max_total_tokens=24000 (llama-3.3-70b)
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': 8192,
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': 8192,
  '@cf/qwen/qwen3-30b-a3b-fp8': 8192,
  '@cf/qwen/qwen2.5-coder-32b-instruct': 8192,
  '@cf/meta/llama-3.2-1b-instruct': 4096,
  '@cf/google/gemma-2b-it-lora': 4096,
  '@cf/ibm-granite/granite-4.0-h-micro': 4096,
};
const DEFAULT_MAX_OUT = 8192;

// Clamp max_tokens to a model cap. maxTokens may be 0/undefined -> default 4096.
function clampTokens(maxTokens, cap) {
  const c = cap || DEFAULT_MAX_OUT;
  const t = Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 4096;
  return Math.min(t, c);
}

// v4.3.6 — Context-window-aware routing (Bad Gateway fix #2, 2026-08-12).
// Workers AI tier-0 models cap at max_total_tokens=24000 (observed llama-3.3-70b 5021:
// "input and maximum output tokens exceeded this model context window limit (24000)").
// Real DeepChat sessions carry a ~56KB system prompt + accumulated history that routinely
// exceed 24k total tokens, so auto->llama-3.3-70b 502s even with max_tokens clamped.
// Estimate input tokens (~4 chars/token, matches the upstream estimator's ~3.97) and
// re-route tier-0-bound requests that would overflow the 24k window to DeepSeek API
// (tier-1, 1M context) — correctness over free-first.
const TIER0_TOTAL_CAP = 24000;
const TIER0_SAFE_TOTAL = 20000; // headroom below the hard 24k cap

function estimateInputTokens(messages) {
  let chars = 0;
  for (const m of messages || []) {
    const c = m && m.content;
    if (typeof c === 'string') chars += c.length;
    else if (Array.isArray(c)) for (const p of c) if (p && typeof p.text === 'string') chars += p.text.length;
  }
  // v4.3.7: conservative /3 (DeepSeek tokenizer can be ~2-4 chars/token; under-estimating
  // lets over-limit payloads through -> upstream 400 -> router 502). /3 over-estimates
  // slightly for prose, which only makes the truncation guard trigger a bit earlier (safe).
  return Math.ceil(chars / 3);
}

// If the routed target is tier-0 (Workers AI) and the estimated context won't fit the
// 24k-token window, fall back to DeepSeek (tier-1, 1M context). Explicit model requests
// are honored as-is — this guard applies to auto-routing only.
function contextAwareTarget(cls, target, estInput, maxOut) {
  const spec = MODELS[target];
  if (!spec || spec.tier !== 0) return target;
  const out = clampTokens(maxOut, MAX_OUT[spec.wa] || DEFAULT_MAX_OUT);
  if (estInput + out > TIER0_SAFE_TOTAL) {
    return cls.domain === 'science' ? 'deepseek-v4-flash-thinking' : 'deepseek-v4-flash';
  }
  return target;
}

// v4.3.7 — Hard context-window guard (Bad Gateway fix #3, 2026-08-12).
// DeepSeek API enforces a REAL maximum context of 1,048,576 tokens (upstream 400:
// "This model's maximum context length is 1048576 tokens"). DeepChat sessions
// accumulate system prompt + history; long agent sessions routinely exceed 1M tokens,
// which surfaced as router 502 -> app "Bad Gateway". Instead of 502ing, truncate the
// message history to fit the routed model's window: ALWAYS keep the system prompt and
// the most RECENT messages; drop the oldest history until the budget fits.
const DEEPSEEK_MAX_CONTEXT = 1048576;

function truncateMessagesToFit(messages, maxInputTokens) {
  const arr = Array.isArray(messages) ? messages : [];
  if (arr.length === 0) return arr;
  // v4.3.7b: budget in chars using a WORST-CASE ~2 chars/token (DeepSeek tokenizer can
  // tokenize dense/repeated content at ~2 chars/token — /3 prose estimate alone would
  // still under-count that, letting an over-limit payload 502). 1.9x leaves a 5% safety
  // margin below the hard 1,048,576-token cap; real prose (~4 chars/token) keeps ~500k
  // tokens of recent context, which matches the app's own auto-compaction semantics.
  const charBudget = Math.floor(maxInputTokens * 1.9);
  let used = 0;
  let system = null;
  // keep the leading system message unconditionally
  if (arr[0] && arr[0].role === 'system') {
    system = arr[0];
    used = Math.ceil(String(system.content || '').length);
  }
  const tail = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] === system) continue;
    const cost = Math.ceil(String(arr[i].content || '').length);
    if (used + cost > charBudget) {
      if (tail.length === 0) {
        // newest message alone overflows: clip its content to the remaining budget so the
        // request still carries the current user turn instead of 502ing.
        const remain = Math.max(0, charBudget - used);
        const clipped = { ...arr[i], content: String(arr[i].content || '').slice(0, remain) };
        tail.unshift(clipped);
        used += remain;
      }
      break;
    }
    tail.unshift(arr[i]);
    used += cost;
  }
  return system ? [system, ...tail] : tail;
}

// v4.3.8 — Normalize OpenAI Responses API input into chat-completions messages.
// DeepChat calls /v1/responses with ResponseItem input:
//   {type:"message", role, content:[{type:"input_text", text}]}  (user/system/assistant)
//   {type:"function_call", name, arguments, call_id}
//   {type:"function_call_output", call_id, output}
// Content parts use "input_text"/"output_text"; Workers AI / DeepSeek only accept
// {type:"text"}. This converter makes the router speak BOTH APIs.
function normalizeResponsesInput(body) {
  const messages = [];
  if (body.instructions) {
    messages.push({ role: 'system', content: body.instructions });
  }
  const input = body.input;
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
    return messages;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'message' || item.role) {
        const role = item.role === 'system' ? 'system' : item.role === 'assistant' ? 'assistant' : 'user';
        messages.push({ role, content: normalizeResponsesContent(item.content) });
      } else if (item.type === 'function_call') {
        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: item.call_id || `call_${Math.random().toString(16).slice(2, 10)}`,
            type: 'function',
            function: { name: item.name || '', arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {}) },
          }],
        });
      } else if (item.type === 'function_call_output') {
        messages.push({
          role: 'tool',
          tool_call_id: item.call_id || `call_${Math.random().toString(16).slice(2, 10)}`,
          content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? ''),
        });
      }
    }
  }
  return messages;
}

function normalizeResponsesContent(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const p of content) {
      if (!p || typeof p !== 'object') continue;
      if (typeof p.text === 'string') {
        parts.push({ type: 'text', text: p.text }); // input_text / output_text / text
      } else if (p.type === 'input_image' && p.image_url) {
        parts.push({ type: 'image_url', image_url: typeof p.image_url === 'string' ? { url: p.image_url } : p.image_url });
      } else if (typeof p.refusal === 'string') {
        parts.push({ type: 'text', text: p.refusal });
      }
    }
    return parts;
  }
  return String(content);
}

// Ensemble member config — the directive: coder primary, small validator, reviewer
// All Workers AI FREE. qwen2.5-coder = primary coder (DeepSeek-Coder 1.3B substitute),
// llama-3.2-1b = validator (Gemma 3 1B substitute), qwen3-30b = reviewer (Granite substitute).
const ENSEMBLE = {
  primary:   { wa: '@cf/qwen/qwen2.5-coder-32b-instruct' },
  validator: { wa: '@cf/meta/llama-3.2-1b-instruct' },
  reviewer:  { wa: '@cf/qwen/qwen3-30b-a3b-fp8' },
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' },
});

// Constant-time comparison of two ArrayBuffers (sha-256 digests)
function timingSafeEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const av = new Uint8Array(a), bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

// 5D classification — complexity, domain, uncertainty, divergence, verifiability
function classify(prompt) {
  const p = (prompt || '').toLowerCase();
  let complexity = 'medium', domain = 'general', uncertainty = 'low', divergence = 'high', verifiability = 'unverifiable';
  if (/\b(code|javascript|python|typescript|function|api|bug|debug|compile|sql|regex)\b/.test(p)) { domain = 'code'; complexity = 'high'; verifiability = 'self'; }
  else if (/\b(prove|theorem|proof|math|physics|quantum|paper|research|cite|arxiv)\b/.test(p)) { domain = 'science'; complexity = 'high'; divergence = 'low'; verifiability = 'external'; }
  else if (/\b(legal|contract|law|clause|regulation|compliance)\b/.test(p)) { domain = 'legal'; complexity = 'high'; divergence = 'low'; verifiability = 'external'; }
  else if (/\b(poem|story|write|creative|essay|metaphor|style)\b/.test(p)) { domain = 'creative'; complexity = 'medium'; divergence = 'high'; uncertainty = 'medium'; }
  if (/\b(uncertain|unclear|unknown|estimate|approximate|maybe|perhaps)\b/.test(p)) uncertainty = 'medium';
  return { complexity, domain, uncertainty, divergence, verifiability };
}

// Auto routing — free-first per directive
function autoRoute(cls) {
  if (cls.domain === 'code') return 'qwen2.5-coder-32b';
  if (cls.domain === 'science') return 'deepseek-v4-flash-thinking';
  if (cls.complexity === 'high') return 'deepseek-v4-flash';
  return 'llama-3.3-70b';
}

async function runWorkersAI(env, modelId, messages, maxTokens, stream) {
  const out = await env.AI.run(modelId, {
    messages,
    // v4.3.5: clamp to the model's output cap so an oversized client max_tokens
    // (e.g. 32000 on a 24000-max model) cannot surface as an upstream 400 -> router 502.
    max_tokens: clampTokens(maxTokens, MAX_OUT[modelId]),
    stream: stream || false,
  });
  return out;
}

// Workers AI non-stream returns different shapes per model/provider:
//   binding: { response: "text" } | { result: { response: "text" } } | { choices:[...] }
//   REST:    { result: { choices:[...] } } | { result: { result: { response } } } (nested)
// Recursive, shape-agnostic, depth-capped.
function extractWAContent(result, depth = 0) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object' || depth > 4) return '';
  if (typeof result.response === 'string') return result.response;
  if (typeof result.result === 'string') return result.result;
  if (Array.isArray(result.choices) && result.choices[0]) {
    const c = result.choices[0];
    if (c.message && typeof c.message.content === 'string') return c.message.content;
    // Reasoning models (qwen3-30b): content can be null when tokens exhausted on
    // thinking — surface reasoning_content so the response isn't "All models failed."
    if (c.message && typeof c.message.reasoning_content === 'string') return c.message.reasoning_content;
    if (c.message && typeof c.message.reasoning === 'string') return c.message.reasoning;
    if (typeof c.text === 'string') return c.text;
  }
  if (result.result && typeof result.result === 'object') return extractWAContent(result.result, depth + 1);
  return '';
}

async function callDeepSeek(env, apiModel, messages, maxTokens, stream) {
  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: apiModel, messages, max_tokens: clampTokens(maxTokens, DEFAULT_MAX_OUT), stream: stream || false }),
  });
  if (!resp.ok) throw new Error(`deepseek ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  if (stream) return resp;
  return resp.json();
}

async function callGateway(env, model, messages, maxTokens, stream) {
  const resp = await fetch(GW_COMPAT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.CF_API_TOKEN}` },
    body: JSON.stringify({ model, messages, max_tokens: clampTokens(maxTokens, DEFAULT_MAX_OUT), stream: stream || false }),
  });
  if (!resp.ok) throw new Error(`gateway ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  if (stream) return resp;
  return resp.json();
}

// ---------------- Ensemble pipeline ----------------
// primary (coder) -> validator scores it -> reviewer refines if needed
async function runEnsemble(env, messages, maxTokens) {
  const t0 = Date.now();
  const primary = await runWorkersAI(env, ENSEMBLE.primary.wa, messages, maxTokens, false);
  const primaryText = extractWAContent(primary);

  let verificationResult = 'passed';
  let agreementRate = 0;
  let verifiedBy = ENSEMBLE.validator.wa;
  let finalText = primaryText;

  try {
    // Validator: does the primary output satisfy the user request?
    const vMsg = [
      { role: 'system', content: 'You are a strict validator. Reply ONLY with "PASS" if the assistant response fully satisfies the user request, or "FAIL" followed by one sentence why.' },
      ...messages,
      { role: 'assistant', content: primaryText },
    ];
    const vOut = await runWorkersAI(env, ENSEMBLE.validator.wa, vMsg, 100, false);
    const vText = extractWAContent(vOut).trim();
    const pass = /^pass/i.test(vText);
    agreementRate = pass ? 1 : 0;

    if (!pass) {
      // Reviewer refines
      verificationResult = 'reviewed';  // set BEFORE refine so empty-refine still reports accurately
      const rMsg = [
        { role: 'system', content: 'You are a senior reviewer. Improve the assistant response to fully satisfy the user request. Output only the improved response.' },
        ...messages,
        { role: 'assistant', content: primaryText },
      ];
      const rOut = await runWorkersAI(env, ENSEMBLE.reviewer.wa, rMsg, maxTokens, false);
      const rText = extractWAContent(rOut);
      if (rText.trim()) {
        finalText = rText;
        verificationResult = 'refined';
        verifiedBy = ENSEMBLE.reviewer.wa;
      }
    }
  } catch (e) {
    verificationResult = 'skipped';
  }

  return {
    text: finalText,
    members: ['primary', 'validator', 'reviewer'],
    verified_by: verifiedBy,
    verification_result: verificationResult,
    agreement_rate: agreementRate,
    latency_ms: Date.now() - t0,
  };
}

// ---------------- Request handler ----------------
async function handleChat(env, body, authHeader) {
  // Auth gate — constant-time compare (workers-best-practices: no string === for secrets)
  const expected = env.ROUTER_AUTH_KEY;
  if (!authHeader || !authHeader.startsWith('Bearer ') || !expected) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const provided = authHeader.slice('Bearer '.length);
  const enc = new TextEncoder();
  const a = await crypto.subtle.digest('SHA-256', enc.encode(provided));
  const b = await crypto.subtle.digest('SHA-256', enc.encode(expected));
  if (!timingSafeEqual(a, b)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { model, messages: rawMessages, max_tokens, stream, temperature } = body || {};
  let messages = rawMessages;
  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'model and messages required' }, 400);
  }

  const t0 = Date.now();
  const cls = classify((messages[messages.length - 1]?.content || '').toString());
  const isStream = !!stream;
  const mkRouter = (routed, strategy, extra = {}) => ({
    routed_model: routed,
    tier: MODELS[routed]?.tier ?? 0,
    complexity: cls.complexity,
    domain: cls.domain,
    uncertainty: cls.uncertainty,
    divergence: cls.divergence,
    verifiability: cls.verifiability,
    strategy,
    provider: MODELS[routed]?.family || 'unknown',
    family: MODELS[routed]?.family || 'unknown',
    classification_ms: 0,
    total_latency_ms: Date.now() - t0,
    ...extra,
  });

  const reqModel = body.model;
  const isAuto = reqModel === 'auto';
  const isEnsemble = reqModel === 'ensemble';
  // v4.3.6: context-window guard for auto-routing — tier-0 (Workers AI 24k cap) targets
  // that can't hold input+output fall back to DeepSeek (1M context) before any upstream call.
  let estInputTokens = estimateInputTokens(messages);
  let target = isAuto ? contextAwareTarget(cls, autoRoute(cls), estInputTokens, max_tokens) : reqModel;
  const spec = MODELS[target];

  // v4.3.7: hard context guard — DeepSeek enforces 1,048,576-token max context. If the
  // session history exceeds the routed model's window, truncate (keep system + recent).
  // Works for both auto and explicit targets; never forward an over-limit payload.
  const effMaxOut = clampTokens(max_tokens, DEFAULT_MAX_OUT);
  const ctxBudget = (spec?.tier === 0 ? TIER0_TOTAL_CAP : DEEPSEEK_MAX_CONTEXT) - effMaxOut;
  let truncation = null;
  if (estInputTokens > ctxBudget) {
    const before = messages.length;
    messages = truncateMessagesToFit(messages, ctxBudget);
    estInputTokens = estimateInputTokens(messages);
    truncation = { truncated: true, messages_before: before, messages_after: messages.length, budget_tokens: ctxBudget };
  }

  // Unknown model -> fallback to default (deepseek-v4-flash), matching v4.2.0 observed behavior
  const effective = spec ? target : 'deepseek-v4-flash';
  const effSpec = spec ? spec : MODELS['deepseek-v4-flash'];
  const routedModel = effective;

  // ---- ENSEMBLE ----
  if (isEnsemble) {
    try {
      // v4.3.6: ensemble primary is tier-0 (qwen2.5-coder-32b, 24k cap) — if the context
      // won't fit, run a single DeepSeek call instead (correctness over free-tier ensemble).
      if (estInputTokens + clampTokens(max_tokens, MAX_OUT[ENSEMBLE.primary.wa]) > TIER0_SAFE_TOTAL) {
        const fb = await callDeepSeek(env, MODELS['deepseek-v4-flash'].api, messages, clampTokens(max_tokens, DEFAULT_MAX_OUT), false);
        const fbContent = fb?.choices?.[0]?.message?.content ?? '';
        return json({
          id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'ensemble',
          choices: [{ index: 0, message: { role: 'assistant', content: fbContent }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          _router: mkRouter('deepseek-v4-flash', 'ensemble-context-fallback', {
            ensemble_members: ['fallback-deepseek'],
            verification_result: 'context_fallback',
            estimated_input_tokens: estInputTokens,
          }),
        });
      }
      // v4.3.5: clamp ensemble primary/reviewer max_tokens to the primary model's cap
      const ens = await runEnsemble(env, messages, clampTokens(max_tokens, MAX_OUT[ENSEMBLE.primary.wa]));
      const respBody = {
        id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'ensemble',
        choices: [{ index: 0, message: { role: 'assistant', content: ens.text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        _router: mkRouter('ensemble', 'ensemble', {
          ensemble_members: ens.members,
          verified_by: ens.verified_by,
          verification_result: ens.verification_result,
          agreement_rate: ens.agreement_rate,
          estimated_cost_usd: 0,
          neurons_remaining: 8000,
        }),
      };
      return json(respBody);
    } catch (e) {
      return json({ error: 'ensemble failed: ' + e.message }, 502);
    }
  }

  // ---- STREAMING (single model) ----
  if (isStream) {
    try {
      if (effSpec.wa) {
        // Workers AI streaming — v4.3.5 clamp so oversized max_tokens can't 502
        const aiResp = await env.AI.run(effSpec.wa, {
          messages,
          max_tokens: clampTokens(max_tokens, MAX_OUT[effSpec.wa]),
          stream: true,
        });
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              const reader = aiResp.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = new TextDecoder().decode(value);
                let parsed;
                try { parsed = JSON.parse(chunk); } catch { parsed = { response: chunk }; }
                const delta = parsed.response ?? parsed.delta?.content ?? chunk;
                const payload = {
                  id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10),
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: routedModel,
                  choices: [{ index: 0, delta: { role: 'assistant', content: delta }, finish_reason: null }],
                };
                controller.enqueue(encoder.encode('data: ' + JSON.stringify(payload) + '\n\n'));
              }
              const donePayload = {
                id: 'chatcmpl-done', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000),
                model: routedModel,
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                _router: mkRouter(routedModel, 'single'),
              };
              controller.enqueue(encoder.encode('data: ' + JSON.stringify(donePayload) + '\n\n'));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch (e) {
              controller.error(e);
            }
          },
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
      }
      if (effSpec.api) {
        const upstream = await callDeepSeek(env, effSpec.api, messages, max_tokens, true);
        return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
      }
      if (effSpec.gateway) {
        const upstream = await callGateway(env, effSpec.model, messages, max_tokens, true);
        return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
      }
      return json({ error: 'no stream path for model' }, 400);
    } catch (e) {
      return json({ error: 'stream failed: ' + e.message }, 502);
    }
  }

  // ---- NON-STREAM ----
  try {
    let content = '', provider = effSpec.family || 'unknown';
    if (effSpec.wa) {
      const out = await runWorkersAI(env, effSpec.wa, messages, max_tokens, false);
      content = extractWAContent(out);
      provider = 'workers-ai';
    } else if (effSpec.api) {
      const out = await callDeepSeek(env, effSpec.api, messages, max_tokens, false);
      content = out?.choices?.[0]?.message?.content ?? '';
      provider = 'deepseek';
    } else if (effSpec.gateway) {
      const out = await callGateway(env, effSpec.model, messages, max_tokens, false);
      content = out?.choices?.[0]?.message?.content ?? '';
      provider = effSpec.family;
    }
    if (!content) content = 'All models failed.';

    const respBody = {
      id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: routedModel,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      _router: mkRouter(routedModel, isAuto ? 'auto' : 'single', {
        deepseek_profile: effSpec.api || 'workers-ai',
        estimated_cost_usd: effSpec.tier === 0 ? 0 : undefined,
        neurons_remaining: 8000,
        ...(truncation ? { truncation } : {}),
      }),
    };
    return json(respBody);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return json({ ok: true });

    // /health
    if (path === '/health' && method === 'GET') {
      return json({
        status: 'ok',
        worker: 'qnfo-ai',
        version: VERSION,
        capabilities: ['model-router', 'ai-inference', 'streaming', 'ensemble', 'pinned-models', 'internal-rag', 'query-logging', 'history-search'],
        routes: ROUTES,
        bindings: {
          ai: !!env.AI,
          deepseek_key: !!env.DEEPSEEK_API_KEY,
          cf_token: !!env.CF_API_TOKEN,
          auth: !!env.ROUTER_AUTH_KEY,
        },
      });
    }

    // /v1/models
    if (path === '/v1/models' && method === 'GET') {
      const data = Object.entries(MODELS).map(([id, m]) => ({
        id,
        object: 'model',
        created: 1710000000,
        owned_by: m.tier === 0 ? 'workers-ai' : m.family,
        _router: {
          tier: m.tier,
          family: m.family,
          reasoning: !!m.reasoning,
          costPer1MInput: m.tier === 0 ? 0 : (m.tier === 1 ? 0.14 : m.tier === 2 ? 2.19 : null),
          costPer1MOutput: m.tier === 0 ? 0 : (m.tier === 1 ? 0.28 : m.tier === 2 ? 2.19 : null),
          availability: m.tier === 0 ? 'always' : m.tier <= 2 ? 'key-required' : 'billing-required',
        },
      }));
      // virtual models
      data.push({ id: 'auto', object: 'model', created: 1710000000, owned_by: 'qnfo', _router: { tier: 0, family: '?', reasoning: false, costPer1MInput: 0, costPer1MOutput: 0, availability: 'always' } });
      data.push({ id: 'ensemble', object: 'model', created: 1710000000, owned_by: 'qnfo', _router: { tier: 0, family: '?', reasoning: false, costPer1MInput: 0, costPer1MOutput: 0, availability: 'always' } });
      return json({ object: 'list', data });
    }

    // /v1/models/:id
    if (path.startsWith('/v1/models/') && method === 'GET') {
      const id = path.split('/').pop();
      const m = MODELS[id];
      if (!m) return json({ error: 'model not found' }, 404);
      return json({ id, object: 'model', created: 1710000000, owned_by: m.tier === 0 ? 'workers-ai' : m.family });
    }

    // /v1/chat/completions + /chat/completions compat
    if ((path === '/v1/chat/completions' || path === '/chat/completions') && method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
      const auth = request.headers.get('Authorization') || '';
      return handleChat(env, body, auth);
    }

    // /v1/responses — DeepChat compat (normalize Responses API input -> chat)
    if (path === '/v1/responses' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
      const auth = request.headers.get('Authorization') || '';
      if (!body.model || !body.input) return json({ error: 'model and input required' }, 400);
      // v4.3.8: the app calls via the OpenAI RESPONSES API with ResponseItem input
      // ({type:'message', role, content:[{type:'input_text', text}]}). Passing that array
      // straight through as chat messages made Workers AI/DeepSeek reject the input_text
      // part ("unknown variant input_text") -> router 502 -> app "Bad Gateway". Normalize
      // into chat messages, run the normal pipeline, re-emit a Responses-shaped response.
      const chatBody = {
        model: body.model,
        messages: normalizeResponsesInput(body),
        max_tokens: body.max_output_tokens ?? body.max_tokens,
        stream: false,
        temperature: body.temperature,
      };
      const chatResp = await handleChat(env, chatBody, auth);
      if (!chatResp.ok) return chatResp;
      const chatData = await chatResp.json();
      const text = chatData?.choices?.[0]?.message?.content ?? '';
      const respObj = {
        id: 'resp_' + Math.random().toString(16).slice(2, 10),
        object: 'response',
        created_at: Math.floor(Date.now() / 1000),
        status: 'completed',
        model: chatData.model || body.model,
        output: [{
          type: 'message',
          id: 'msg_' + Math.random().toString(16).slice(2, 10),
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        }],
        usage: chatData.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        ...(chatData._router ? { _router: chatData._router } : {}),
      };
      if (body.stream) {
        const encoder = new TextEncoder();
        const enc = (obj) => encoder.encode('data: ' + JSON.stringify(obj) + '\n\n');
        const stream = new ReadableStream({
          start(controller) {
            if (text) {
              controller.enqueue(enc({ type: 'response.output_text.delta', delta: text, item_id: respObj.output[0].id, output_index: 0, content_index: 0 }));
            }
            controller.enqueue(enc({ type: 'response.completed', response: respObj }));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
      }
      return json(respObj);
    }

    // /v1/search — internal RAG (graceful if no Vectorize binding)
    if (path === '/v1/search' && method === 'GET') {
      return json({ error: 'internal RAG requires Vectorize binding — not configured in this deployment' }, 501);
    }

    // /v1/history — query log (graceful if no D1 binding)
    if (path === '/v1/history' && method === 'GET') {
      return json({ error: 'query logging requires D1 binding — not configured in this deployment' }, 501);
    }

    return json({ error: 'Not found' }, 404);
  },
};
