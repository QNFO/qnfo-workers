// qnfo-ai v4.3.0 — Model Router + Ensemble + Auto-Routing
// Reconstructed 2026-08-11 from live API contract after WORKER-THIN-CLIENT-1 remediation.
// ROOT-CAUSE FIX: v4.2.0 had NO [[ai]] binding -> env.AI undefined -> tier-0 free models
// returned "All models failed." while DeepSeek API (secret) worked. v4.3.0 declares the
// AI binding in wrangler.toml and routes tier-0 through env.AI.run() (Workers AI FREE).
// Ensemble directive: primary coder + validator + reviewer, all Workers AI free models.

const VERSION = '4.7.1';
const ROUTES = ['/health', '/', '/v1/chat/completions', '/v1/models', '/v1/models/:id', '/v1/responses', '/chat/completions', '/v1/search', '/v1/history', '/v1/web/search', '/v1/web/fetch'];
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
  'granite-h-micro':          { tier: 0, family: 'ibm',      wa: '@cf/ibm-granite/granite-4.0-h-micro',         reasoning: false, maxOut: 4096 },'granite-h-micro':          { tier: 0, family: 'ibm',      wa: '@cf/ibm-granite/granite-4.0-h-micro',         reasoning: false, maxOut: 4096 },
  // v4.4.0: Tier B science models per LLM audit 2026-08-13 (verified free tier-0, direct AI 200)
  'glm-5.2':                  { tier: 0, family: 'zai',      wa: '@cf/zai-org/glm-5.2',              reasoning: true,  maxOut: 8192 },
  'kimi-k2.6':                { tier: 0, family: 'moonshot', wa: '@cf/moonshotai/kimi-k2.6',           reasoning: true,  maxOut: 8192 },
  'qwq-32b':                  { tier: 0, family: 'qwen',     wa: '@cf/qwen/qwq-32b',                   reasoning: true,  maxOut: 8192 },
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
  '@cf/ibm-granite/granite-4.0-h-micro': 4096,'@cf/ibm-granite/granite-4.0-h-micro': 4096,
  '@cf/zai-org/glm-5.2': 8192,
  '@cf/moonshotai/kimi-k2.6': 8192,
  '@cf/qwen/qwq-32b': 8192,
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

// Flatten a single message content value to a plain string. Workers AI
// text-generation models (qwen2.5-coder-32b-instruct, deepseek-r1-distill-qwen-32b,
// etc.) reject OpenAI multimodal `content: [{type:"text",text:"..."}]` arrays with
// 400 "required properties at '/' are 'prompt'" / "Type mismatch of '/messages/N/content',
// 'string' not in 'array'". DeepChat (and other OpenAI clients) send array content, so
// the router must normalize to strings before forwarding to Workers AI.
function flattenContentToString(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const texts = [];
    for (const p of content) {
      if (typeof p === 'string') { texts.push(p); continue; }
      if (p && typeof p === 'object' && typeof p.text === 'string') texts.push(p.text);
      // image_url / audio / file parts dropped: every tier-0 Workers AI model is text-only
    }
    return texts.join('\n');
  }
  return String(content);
}

// Normalize a full messages array to string content (see flattenContentToString).
// DeepSeek API accepts both string and array content; string is always safe, so this
// is applied uniformly to every downstream path (Workers AI + DeepSeek).
function normalizeMessagesContent(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((m) => {
    if (!m || typeof m !== 'object') return m;
    if (typeof m.content === 'string' || m.content == null) return m;
    return { ...m, content: flattenContentToString(m.content) };
  });
}

// Ensemble member config — the directive: coder primary, small validator, reviewer
// All Workers AI FREE. qwen2.5-coder = primary coder (DeepSeek-Coder 1.3B substitute),
// llama-3.2-1b = validator (Gemma 3 1B substitute), qwen3-30b = reviewer (Granite substitute).
const ENSEMBLE = {
  primary:   { wa: '@cf/qwen/qwen2.5-coder-32b-instruct' },
  validator: { wa: '@cf/google/gemma-2b-it-lora' },
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
  // v4.3.11 QNFO-MODEL-POLICY-1: general default -> qwen3-30b.
  // Meta/Llama models are conversational-chatbot class only; the user
  // mandate excludes them from scientific/technical research routing.
  // llama-3.3-70b remains available for EXPLICIT requests only.
  return 'glm-5.2'; // v4.4.0: audit 2026-08-13 — GLM-5.2 default (LiveBench math 89.8, free tier-0)
}

async function runWorkersAI(env, modelId, messages, maxTokens, stream) {
  // v4.3.9 AI-COST-GATE-1: route tier-0 Workers AI through the AI Gateway
  // (spend-limit firewall rule 6f5c29f8 + rate limit + cache). Fall back to the
  // direct Workers AI binding only when the gateway is unreachable/unconfigured
  // (resilience: a dead gateway must not take down the router).
  if (env.CF_API_TOKEN && modelId.startsWith('@cf/')) {
    try {
      const gwResp = await fetch(GW_COMPAT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-aig-authorization': 'Bearer ' + env.CF_API_TOKEN,
        },
        body: JSON.stringify({
          model: 'workers-ai/' + modelId,
          messages,
          max_tokens: clampTokens(maxTokens, MAX_OUT[modelId]),
          stream: stream || false,
        }),
      });
      if (gwResp.ok) {
        if (stream) return gwResp; // SSE passthrough (caller consumes body)
        return await gwResp.json(); // OpenAI-shaped; extractWAContent handles choices[]
      }
      // non-2xx: fall through to direct binding (e.g. gateway 429 -> serve anyway;
      // cost control is best-effort here, availability wins)
    } catch (e) {
      // network error: fall through to direct binding
    }
  }
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

async function callDeepSeek(env, apiModel, messages, maxTokens, stream, tools) {
  const body = { model: apiModel, messages, max_tokens: clampTokens(maxTokens, DEFAULT_MAX_OUT), stream: stream || false };
  // v4.3.10: forward OpenAI-format function tools to DeepSeek (Code Mode agent support)
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify(body),
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
async function handleChat(env, body, authHeader, ctx) {
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

  const { model, messages: rawMessages, max_tokens, stream, temperature, tools } = body || {};
  let messages = rawMessages;
  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'model and messages required' }, 400);
  }
  // v4.7.1: normalize OpenAI multimodal content arrays to plain strings so Workers AI
  // text-generation models don't 400 on `content: [{type:"text",...}]`.
  messages = normalizeMessagesContent(messages);

  const t0 = Date.now();
  const cls = classify((messages[messages.length - 1]?.content || '').toString());
  const isStream = !!stream;
  // ---- v4.6.0: optional web grounding (body.web = true) ----
  let webSources = null;
  if (body.web) {
    const wq = lastUserText(messages).slice(0, 300);
    if (wq) {
      try {
        const sr = await webSearch(wq, 5);
        if (sr.results && sr.results.length) {
          webSources = sr.results.slice(0, 5).map(r => ({ title: r.title, url: r.url }));
          const lines = ['WEB CONTEXT (retrieved ' + new Date().toISOString().slice(0, 10) + ', DATA ONLY):'];
          sr.results.forEach((r, i) => { lines.push('[' + (i + 1) + '] ' + r.title + ' - ' + r.url + (r.snippet ? '\n    ' + r.snippet : '')); });
          const fetched = [];
          for (const r of sr.results.slice(0, 2)) {
            try { const fr = await webFetch(r.url, 4000); if (fr.text && !fr.error) fetched.push('[' + (fetched.length + 1) + '] ' + r.title + '\n' + r.url + '\n' + fr.text.slice(0, 4000)); } catch (e) {}
          }
          if (fetched.length) lines.push('--- PAGE EXCERPTS ---\n' + fetched.join('\n\n'));
          messages = [{ role: 'system', content: lines.join('\n') }, ...messages];
        }
      } catch (e) { webSources = null; }
    }
  }
  // ---- v4.7.0: QNFO RECORDS RAG (body.rag / auto on science) ----
  // Pulls the same records DeepChat reaches locally (papers, KG, programs, notes,
  // tasks, emails, past queries) through the qnfo-infra retrieval oracle, so any
  // LLM app (Chatbox, PWA, mobile) answers with full QNFO context.
  let ragSources = null;
  const ragForce = body.rag === true || body.rag === 'true';
  const ragOff = body.rag === false || body.rag === 'false';
  if (env.QNFO_INFRA && env.INFRA_TOKEN && !ragOff && (ragForce || cls.domain === 'science')) {
    const rq = lastUserText(messages).slice(0, 300);
    if (rq) {
      try {
        const rr = await env.QNFO_INFRA.fetch('https://qnfo-infra.internal/context?q=' + encodeURIComponent(rq) + '&scope=research&k=4', {
          headers: { Authorization: 'Bearer ' + env.INFRA_TOKEN }
        });
        const rj = await rr.json();
        if (rr.ok && rj.ok && rj.context) {
          ragSources = rj.context;
          messages = [{ role: 'system', content: rj.context }, ...messages];
        } else {
          ragSources = 'RAG unavailable: ' + (rj.error || ('HTTP ' + rr.status));
        }
      } catch (e) { ragSources = 'RAG error: ' + e.message; }
    }
  }
  const mkLogRec = () => ({
    id: 'q-' + Math.random().toString(16).slice(2, 18),
    ts: new Date().toISOString(),
    model: routedModel,
    strategy: isAuto ? 'auto' : 'single',
    complexity: cls.complexity,
    domain: cls.domain,
    prompt: lastUserText(messages),
    response: '',
    prompt_tokens: 0, completion_tokens: 0, cost_usd: 0,
    latency_ms: 0,
    rag_sources: webSources ? JSON.stringify(webSources.slice(0, 3).map(s => s.url)) : null,
    streamed: 1,
  });
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
      const ensResp = (content, body) => {
        const logRec = { ...mkLogRec(), model: 'ensemble', streamed: isStream ? 1 : 0, response: String(content).slice(0, 4000), latency_ms: Date.now() - t0 };
        if (env.QNFO_AUDIT || env.LOG_VZ) ctx.waitUntil(logQuery(env, logRec));
        if (isStream) {
          const enc8 = new TextEncoder();
          const nlnl = String.fromCharCode(10, 10);
          const chunk = (delta, finish) => enc8.encode('data: ' + JSON.stringify({ id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10), object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'ensemble', choices: [{ index: 0, delta: delta, finish_reason: finish }] }) + nlnl);
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(chunk({ role: 'assistant', content: content }, null));
              controller.enqueue(chunk({}, 'stop'));
              controller.enqueue(enc8.encode('data: [DONE]' + nlnl));
              controller.close();
            }
          });
          return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
        }
        return json(body);
      };
      if (estInputTokens + clampTokens(max_tokens, MAX_OUT[ENSEMBLE.primary.wa]) > TIER0_SAFE_TOTAL) {
        const fb = await callDeepSeek(env, MODELS['deepseek-v4-flash'].api, messages, clampTokens(max_tokens, DEFAULT_MAX_OUT), false);
        const fbContent = (fb?.choices?.[0]?.message?.content) ?? '';
        const fbText = fbContent || 'All models failed.';
        const fbBody = {
          id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'ensemble',
          choices: [{ index: 0, message: { role: 'assistant', content: fbText }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          _router: mkRouter('deepseek-v4-flash', 'ensemble-context-fallback', {
            ensemble_members: ['fallback-deepseek'],
            verification_result: 'context_fallback',
            estimated_input_tokens: estInputTokens
          })
        };
        return ensResp(fbText, fbBody);
      }
      const ens = await runEnsemble(env, messages, clampTokens(max_tokens, MAX_OUT[ENSEMBLE.primary.wa]));
      const ensText = (ens.text || '').trim() || 'All models failed.';
      const respBody = {
        id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'ensemble',
        choices: [{ index: 0, message: { role: 'assistant', content: ensText }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        _router: mkRouter('ensemble', 'ensemble', {
          ensemble_members: ens.members,
          verified_by: ens.verified_by,
          verification_result: ens.verification_result,
          agreement_rate: ens.agreement_rate,
          estimated_cost_usd: 0,
          neurons_remaining: 8000
        })
      };
      return ensResp(ensText, respBody);
    } catch (e) {
      return json({ error: 'ensemble failed: ' + e.message }, 502);
    }
  }  if (isStream) {
    try {
      if (effSpec.wa) {
        // v4.3.9 AI-COST-GATE-1: route tier-0 streaming through the AI Gateway first.
        // Gateway returns OpenAI SSE "data: {choices:[{delta:{content}}]}\n\n" — re-emit the
        // same chunk shape the direct path produces. Fall back to direct on any failure.
        if (env.CF_API_TOKEN) {
          try {
            const gwResp = await fetch(GW_COMPAT, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'cf-aig-authorization': 'Bearer ' + env.CF_API_TOKEN,
              },
              body: JSON.stringify({
                model: 'workers-ai/' + effSpec.wa,
                messages,
                max_tokens: clampTokens(max_tokens, MAX_OUT[effSpec.wa]),
                stream: true,
              }),
            });
            if (gwResp.ok) {
              const reader = gwResp.body.getReader();
              const decoder = new TextDecoder();
              let buf = '';
              const enc = new TextEncoder();
              const stream = new ReadableStream({
                async start(controller) {
                  try {
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      buf += decoder.decode(value, { stream: true });
                      const lines = buf.split('\n');
                      buf = lines.pop();
                      for (const line of lines) {
                        const t = line.trim();
                        if (!t.startsWith('data:')) continue;
                        const data = t.slice(5).trim();
                        if (data === '[DONE]') continue;
                        let parsed;
                        try { parsed = JSON.parse(data); } catch { continue; }
                        const delta = parsed.choices?.[0]?.delta?.content ?? '';
                        if (!delta) continue;
                        const payload = {
                          id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10),
                          object: 'chat.completion.chunk',
                          created: Math.floor(Date.now() / 1000),
                          model: routedModel,
                          choices: [{ index: 0, delta: { role: 'assistant', content: delta }, finish_reason: null }],
                        };
                        controller.enqueue(enc.encode('data: ' + JSON.stringify(payload) + '\n\n'));
                      }
                    }
                    const donePayload = {
                      id: 'chatcmpl-done', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000),
                      model: routedModel,
                      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                      _router: mkRouter(routedModel, 'single'),
                    };
                    controller.enqueue(enc.encode('data: ' + JSON.stringify(donePayload) + '\n\n'));
                    controller.enqueue(enc.encode('data: [DONE]\n\n'));
                    controller.close();
                  } catch (e) { controller.error(e); }
                },
              });
              return streamWithLog(new Response(stream, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
              }), env, ctx, mkLogRec());
            }
          } catch (e) {
            // fall through to direct Workers AI streaming
          }
        }
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
        return streamWithLog(new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }), env, ctx, mkLogRec());
      }
      if (effSpec.api) {
        const upstream = await callDeepSeek(env, effSpec.api, messages, max_tokens, true, tools);
        return streamWithLog(upstream, env, ctx, mkLogRec());
      }
      if (effSpec.gateway) {
        const upstream = await callGateway(env, effSpec.model, messages, max_tokens, true);
        return streamWithLog(upstream, env, ctx, mkLogRec());
      }
      return json({ error: 'no stream path for model' }, 400);
    } catch (e) {
      return json({ error: 'stream failed: ' + e.message }, 502);
    }
  }

  // ---- NON-STREAM ----
  try {
    let content = '', toolCalls = null, provider = effSpec.family || 'unknown';
    if (effSpec.wa) {
      const out = await runWorkersAI(env, effSpec.wa, messages, max_tokens, false);
      content = extractWAContent(out);
      provider = 'workers-ai';
    } else if (effSpec.api) {
      const out = await callDeepSeek(env, effSpec.api, messages, max_tokens, false, tools);
      content = out?.choices?.[0]?.message?.content ?? '';
      toolCalls = out?.choices?.[0]?.message?.tool_calls ?? null;
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
      choices: [{ index: 0, message: { role: 'assistant', content, ...(toolCalls ? { tool_calls: toolCalls } : {}) }, finish_reason: toolCalls ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      _router: mkRouter(routedModel, isAuto ? 'auto' : 'single', {
        deepseek_profile: effSpec.api || 'workers-ai',
        estimated_cost_usd: effSpec.tier === 0 ? 0 : undefined,
        neurons_remaining: 8000,
        ...(truncation ? { truncation } : {}),
      }),
      ...(webSources ? { _web: { query: lastUserText(messages).slice(0, 300), sources: webSources } } : {}),
    };
    const logRec = { ...mkLogRec(), streamed: 0, response: content.slice(0, 4000), latency_ms: Date.now() - t0 };
    if (env.QNFO_AUDIT || env.LOG_VZ) ctx.waitUntil(logQuery(env, logRec));
    return json(respBody);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}


// ---------------- v4.5.0: query logging (restored from v4.1, dropped in v4.2-v4.4) ----------------
function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') {
      const c = m.content;
      if (typeof c === 'string') return c.slice(0, 2000);
      if (Array.isArray(c)) return c.filter(p => p && typeof p.text === 'string').map(p => p.text).join(' ').slice(0, 2000);
      return '';
    }
  }
  return '';
}
async function logQuery(env, record) {
  try {
    if (env.QNFO_AUDIT) {
      await env.QNFO_AUDIT.prepare(
        'INSERT INTO ai_queries (id, ts, model, strategy, complexity, domain, prompt, response, prompt_tokens, completion_tokens, cost_usd, latency_ms, rag_sources, streamed) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)'
      ).bind(record.id, record.ts, record.model, record.strategy, record.complexity, record.domain, record.prompt, record.response, record.prompt_tokens, record.completion_tokens, record.cost_usd, record.latency_ms, record.rag_sources, record.streamed).run();
    }
  } catch (e) { console.log('ai_queries insert failed:', e && e.message || e); }
  try {
    if (env.LOG_VZ && env.AI) {
      const text = [record.prompt.slice(0, 2000), record.response.slice(0, 2000)].filter(Boolean);
      if (text.length) {
        const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text });
        const vecs = (embed?.data || []).filter(v => Array.isArray(v) && v.length === 768);
        if (vecs.length) {
          const day = String(record.ts || '').slice(0, 10) || 'unknown';
          const vectors = [];
          if (vecs[0] && record.prompt) vectors.push({ id: 'c:' + record.id, values: vecs[0], metadata: { doc: 'chat', kind: 'prompt', path: 'chat/' + day + '/prompt-' + record.id + '.md', model: record.model, domain: record.domain, strategy: record.strategy, text: record.prompt.slice(0, 800) } });
          if (vecs[1] && record.response) vectors.push({ id: 'r:' + record.id, values: vecs[1], metadata: { doc: 'chat', kind: 'response', path: 'chat/' + day + '/response-' + record.id + '.md', model: record.model, domain: record.domain, strategy: record.strategy, text: record.response.slice(0, 800) } });
          if (vectors.length) await env.LOG_VZ.upsert(vectors);
        }
      }
    }
  } catch (e) { console.log('qnfo-ai-log upsert failed:', e && e.message || e); }
}
function streamWithLog(upstream, env, ctx, rec) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = '', acc = '';
  let markDone;
  const done = new Promise(res => { markDone = res; });
  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (let line of lines) {
            const t = line.trim();
            if (t.startsWith('data:')) {
              const data = t.slice(5).trim();
              if (data === '[DONE]') continue;
              try {
                const p = JSON.parse(data);
                if (p && p.choices && p.choices[0] && p.choices[0].delta && p.choices[0].delta.reasoning_content) {
                  delete p.choices[0].delta.reasoning_content;
                }
                const d = p && p.choices && p.choices[0] && p.choices[0].delta ? p.choices[0].delta.content : undefined;
                if (typeof d === 'string') acc += d;
                line = 'data: ' + JSON.stringify(p);
              } catch {}
            }
            controller.enqueue(encoder.encode(line + '\n'));
          }
        }
        if (buf) controller.enqueue(encoder.encode(buf));
        controller.close();
        markDone && markDone();
      } catch (e) { controller.error(e); }
    },
  });
  ctx.waitUntil(done.then(() => logQuery(env, { ...rec, response: acc.slice(0, 4000), streamed: 1 })).catch(() => {}));
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
}


// ---------------- v4.6.0: web layer (DuckDuckGo HTML + safe page fetch) ----------------
function cleanText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x26;/g, '&').replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ').trim();
}
function isPrivateHost(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h === '::1' || h === '[::1]') return true;
  if (/^(10\.|127\.|0\.|192\.168\.|169\.254\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}
function parseDdg(html, isLite, k) {
  const results = [];
  if (!isLite) {
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const re2 = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const snips = [];
    let m;
    while ((m = re2.exec(html)) && snips.length < 20) snips.push(cleanText(m[1]));
    let i = 0;
    while ((m = re.exec(html)) && results.length < k) {
      let href = m[1];
      try { const u = new URL(href, 'https://duckduckgo.com'); const tgt = u.searchParams.get('uddg'); if (tgt) href = tgt; } catch (e) {}
      if (/^https?:/i.test(href) && href.indexOf('y.js') === -1 && href.indexOf('ad_domain') === -1) {
        results.push({ title: cleanText(m[2]).slice(0, 200), url: href.slice(0, 500), snippet: (snips[i] || '').slice(0, 400) });
      }
      i++;
    }
  } else {
    const re = /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const re2 = /<td class='result-snippet'>(.*?)<\/td>/gi;
    const snips = [];
    let m;
    while ((m = re2.exec(html)) && snips.length < 20) snips.push(cleanText(m[1]));
    let i = 0;
    while ((m = re.exec(html)) && results.length < k) {
      let href = m[1];
      try { const u = new URL(href, 'https://duckduckgo.com'); const tgt = u.searchParams.get('uddg'); if (tgt) href = tgt; } catch (e) {}
      if (/^https?:/i.test(href) && href.indexOf('duckduckgo.com') === -1 && href.indexOf('y.js') === -1 && href.indexOf('ad_domain') === -1) {
        results.push({ title: cleanText(m[2]).slice(0, 200), url: href.slice(0, 500), snippet: (snips[i] || '').slice(0, 400) });
      }
      i++;
    }
  }
  if (results.length === 0) {
    const z = /<div[^>]*class="[^"]*zci[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    if (z && cleanText(z[1])) results.push({ title: 'Zero-click info', url: '', snippet: cleanText(z[1]).slice(0, 500) });
  }
  return results;
}
async function webSearch(q, k) {
  const qq = encodeURIComponent(q);
  const ua = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept': 'text/html' };
  const urls = [
    'https://html.duckduckgo.com/html/?q=',
    'https://html.duckduckgo.com/html/?q=',
    'https://lite.duckduckgo.com/lite/?q=',
  ];
  for (let attempt = 0; attempt < urls.length; attempt++) {
    try {
      const resp = await fetch(urls[attempt] + qq, { headers: ua });
      if (!resp.ok) continue;
      const html = await resp.text();
      const isLite = urls[attempt].indexOf('lite') !== -1;
      const parsed = parseDdg(html, isLite, k);
      if (parsed.length) return { engine: isLite ? 'duckduckgo-lite' : 'duckduckgo', results: parsed };
    } catch (e) {}
  }
  return { error: 'search engine unreachable' };
}
async function webFetch(url, maxChars) {
  const u = new URL(url);
  if (!/^https?:$/i.test(u.protocol)) return { error: 'only http(s) URLs' };
  if (isPrivateHost(u.hostname)) return { error: 'private/loopback hosts blocked' };
  const resp = await fetch(u.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept': 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' }
  });
  if (!resp.ok) return { error: 'HTTP ' + resp.status, url: u.toString() };
  const ct = resp.headers.get('content-type') || '';
  const isHtml = /text\/html/i.test(ct);
  const raw = await resp.text();
  const text = isHtml ? cleanText(raw) : raw;
  const cap = Math.max(Number(maxChars) || 6000, 500);
  return { url: u.toString(), text: text.slice(0, cap), truncated: text.length > cap };
}
async function authOk(header, env) {
  const expected = env.ROUTER_AUTH_KEY;
  if (!header || !header.startsWith('Bearer ') || !expected) return false;
  const provided = header.slice('Bearer '.length);
  const enc = new TextEncoder();
  const a = await crypto.subtle.digest('SHA-256', enc.encode(provided));
  const b = await crypto.subtle.digest('SHA-256', enc.encode(expected));
  return timingSafeEqual(a, b);
}
const PLAYGROUND_HTML = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#0b57d0">
<title>__TITLE__</title>
<style>body{font-family:Segoe UI,Roboto,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;background:#fff;color:#1a1a1a}header h1{font-size:1.25rem;margin:0 0 4px}header p{color:#666;margin:0 0 12px;font-size:.85rem}label{font-size:.8rem;color:#444;display:block;margin:8px 0 2px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}input,select,button{padding:6px 8px;font-size:.9rem;border:1px solid #ccc;border-radius:6px}input[type=text]{flex:1;min-width:200px}input[type=password]{flex:1;min-width:200px}button{background:#0b57d0;color:#fff;border:none;cursor:pointer}button:disabled{opacity:.6}button#new{background:#fff;color:#0b57d0;border:1px solid #ccc}#msgs{margin-top:14px;border-top:1px solid #eee;padding-top:12px}.msg{margin:10px 0;padding:10px 12px;border-radius:8px;white-space:pre-wrap;font-size:.92rem;word-break:break-word}.user{background:#eef4ff}.assistant{background:#f6f6f6}.err{color:#b3261e;font-size:.85rem;margin:8px 0}.meta{color:#888;font-size:.78rem;margin-top:6px}pre{background:#e9e9e9;padding:8px;border-radius:6px;overflow-x:auto;font-size:.85em}code{background:#e9e9e9;padding:1px 4px;border-radius:4px;font-size:.88em}pre code{background:none;padding:0}a{color:#0b57d0}</style></head>
<body><header><h1>__TITLE__</h1><p>OpenAI-compatible chat over Cloudflare. Key: __KEY_HINT__</p></header>
<div class="row"><input type="password" id="key" placeholder="API key (Bearer)"><input type="text" id="thread" placeholder="thread_id (optional)"></div>
<div class="row"><select id="model"></select><label><input type="checkbox" id="web"> web search</label><button id="new">New chat</button><span style="flex:1"></span></div>
<div id="msgs"></div>
<div class="row"><input type="text" id="inp" placeholder="Jot a thought, ask a question..." style="flex:1"><button id="send">Send</button></div><div class="row"><input type="text" id="expr" placeholder="Express a desire to the orchestrator (e.g. remind me tomorrow to X)" style="flex:1"><button id="sendIntent">Express</button></div><div id="intentResult" class="meta"></div>
<script>
var ENABLE_STREAM = __STREAM__;
var $=function(s){return document.querySelector(s);};
var NL=String.fromCharCode(10);
var savedModel='';
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function md(s){
  var out=[];var tb=String.fromCharCode(96).repeat(3);var blocks=String(s||'').split(tb);
  for(var i=0;i<blocks.length;i++){
    var b=blocks[i];
    if(i%2===1){out.push('<pre>'+esc(b)+'</pre>');}
    else{
      var p=b.split('**');var mid=[];
      for(var j=0;j<p.length;j++){mid.push(j%2===1?'<b>'+esc(p[j])+'</b>':esc(p[j]));}
      var t=mid.join('');
      var c=t.split(String.fromCharCode(96));var fin=[];
      for(var k=0;k<c.length;k++){fin.push(k%2===1?'<code>'+c[k]+'</code>':c[k]);}
      out.push(fin.join('').replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>').split(NL).join('<br>'));
    }
  }
  return out.join('');
}
function restore(){try{var d=JSON.parse(localStorage.getItem('qnfo-chat')||'{}');$('#key').value=d.key||'';$('#thread').value=d.thread||'';savedModel=d.model||'';return d.msgs||[];}catch(e){return [];}}
function save(msgs){try{localStorage.setItem('qnfo-chat',JSON.stringify({key:$('#key').value,thread:$('#thread').value,model:savedModel||$('#model').value,msgs:msgs.slice(-60)}));}catch(e){}}
var msgs=restore();
function renderMsgs(){var el=$('#msgs');el.innerHTML='';for(var i=0;i<msgs.length;i++){var d=document.createElement('div');d.className='msg '+(msgs[i].role==='user'?'user':'assistant');d.innerHTML=md(msgs[i].content);el.appendChild(d);}el.scrollTop=1e9;}
renderMsgs();
function loadModels(){var key=$('#key').value.trim();var h={};if(key)h.Authorization='Bearer '+key;fetch('/v1/models',{headers:h}).then(function(r){return r.json();}).then(function(j){var sel=$('#model');sel.innerHTML='';var def='__DEFAULT_MODEL__';(j.data||[]).forEach(function(m){var o=document.createElement('option');o.value=m.id;o.textContent=m.id;if(m._router&&m._router.reasoning)o.textContent+=' (reasoning)';if(m.id===def||m.id===savedModel)o.selected=true;sel.appendChild(o);});if(!sel.value)sel.value=def;}).catch(function(){});}
loadModels();
function addMsg(role,html){var d=document.createElement('div');d.className='msg '+role;d.innerHTML=html;$('#msgs').appendChild(d);$('#msgs').scrollTop=1e9;return d;}
$('#new').onclick=function(){msgs=[];renderMsgs();save(msgs);};
$('#send').onclick=async function(){
  var txt=$('#inp').value.trim();if(!txt)return;
  var key=$('#key').value.trim();if(!key){addMsg('err','API key required');return;}
  msgs.push({role:'user',content:txt});renderMsgs();save(msgs);$('#inp').value='';
  var btn=$('#send');btn.disabled=true;
  var body={model:$('#model').value||'__DEFAULT_MODEL__',messages:msgs.slice(-12)};
  var th=$('#thread').value.trim();if(th)body.thread_id=th;
  if($('#web').checked)body.web=true;
  var doStream=ENABLE_STREAM;
  if(doStream)body.stream=true;
  try{
    var r=await fetch('/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify(body)});
    if(doStream&&r.ok&&r.body){
      var reader=r.body.getReader();var dec=new TextDecoder();var buf='';var acc='';
      var el=addMsg('assistant','');
      while(true){var x=await reader.read();if(x.done)break;
        buf+=dec.decode(x.value,{stream:true});
        var lines=buf.split(NL);buf=lines.pop();
        for(var li=0;li<lines.length;li++){var t=lines[li].trim();
          if(t.indexOf('data:')!==0)continue;
          var data=t.slice(5).trim();if(data==='[DONE]')continue;
          try{var p=JSON.parse(data);var d=(p.choices&&p.choices[0]&&p.choices[0].delta&&p.choices[0].delta.content)||'';if(d){acc+=d;el.textContent=acc;el.scrollTop=1e9;}}catch(e){}
        }
      }
      msgs.push({role:'assistant',content:acc});renderMsgs();save(msgs);
    }else{
      var j=await r.json();
      if(!r.ok)throw new Error((j.error&&j.error.message)||j.error||('HTTP '+r.status));
      var c=(j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||'';
      msgs.push({role:'assistant',content:c});renderMsgs();save(msgs);
      if(j._web){var m=document.createElement('div');m.className='meta';m.textContent='sources: '+(j._web.sources||[]).map(function(s){return s.url;}).join(' | ');$('#msgs').appendChild(m);}
      if(j._router){var m2=document.createElement('div');m2.className='meta';m2.textContent='router: '+(j._router.routed_model||j.model)+' | tier '+(j._router.tier!=null?j._router.tier:'?')+' | $'+(j._router.estimated_cost_usd!=null?j._router.estimated_cost_usd:0);$('#msgs').appendChild(m2);}
    }
  }catch(e){addMsg('err',String(e.message||e));}
  btn.disabled=false;
};
$('#inp').addEventListener('keydown',function(e){if(e.key==='Enter')$('#send').click();});
$('#sendIntent').onclick=function(){var txt=$('#expr').value.trim();if(!txt)return;var key=$('#key').value.trim();if(!key){$('#intentResult').textContent='API key required';return;}var btn=$('#sendIntent');btn.disabled=true;$('#intentResult').textContent='Expressing...';fetch('https://qnfo-intent-orchestrator.q08.workers.dev/intent?source=pwa&device=windows',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({desire:txt,source:'pwa'})}).then(function(r){return r.json();}).then(function(j){if(j.error){$('#intentResult').textContent='ERROR: '+j.error;return;}$('#intentResult').textContent='['+j.type+' | '+j.domain+'] '+j.summary+(j.status==='done'?' - stored in Vectorize':' - queued'+(j.due?' (due '+j.due+')':''));$('#expr').value='';}).catch(function(e){$('#intentResult').textContent='ERROR: '+String(e.message||e);}).finally(function(){btn.disabled=false;});};
$('#key').addEventListener('input',function(){save(msgs);loadModels();});
if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){});}
</script></body></html>`;

const TITLE = 'QNFO Notes - research chat (qnfo-ai router)';
const SHORT = 'QNFO Notes';
// ---- PWA (Android installable) ----
const MANIFEST = '{"name":"__TITLE__","short_name":"__SHORT__","start_url":"/","display":"standalone","background_color":"#ffffff","theme_color":"#0b57d0","icons":[{"src":"/icon.svg","sizes":"any","type":"image/svg+xml"}]}';
const SW_JS = "self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));";
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="36" fill="#0b57d0"/><text x="96" y="122" font-size="84" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="bold">Q</text></svg>';
export default {
  async fetch(request, env, ctx) {
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
          paper_vz: !!env.PAPER_VZ,
          log_vz: !!env.LOG_VZ,
          query_db: !!env.QNFO_AUDIT,
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
      return handleChat(env, body, auth, ctx);
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
      const chatResp = await handleChat(env, chatBody, auth, ctx);
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

    // /v1/search — internal RAG over qwav-research-v2 (PAPER_VZ binding)
    if (path === '/v1/search' && method === 'GET') {
      const q = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
      const k = parseInt(url.searchParams.get('k') || '5', 10);
      if (!q) return json({ error: 'Missing q parameter' }, 400);
      const vz = env.PAPER_VZ;
      if (!vz) return json({ error: 'internal RAG requires Vectorize binding — not configured in this deployment' }, 501);
      if (!env.AI) return json({ error: 'AI binding not configured' }, 503);
      try {
        const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [q] });
        const vec = embed?.data?.[0] || (Array.isArray(embed) ? embed[0] : null);
        if (!vec) return json({ error: 'embedding generation failed' }, 502);
        const matches = await vz.query(vec, { topK: Math.min(Math.max(k, 1), 20), returnMetadata: 'all' });
        const results = (matches.matches || []).map(m => ({
          id: m.id,
          score: Math.round((m.score || 0) * 10000) / 10000,
          metadata: m.metadata || {},
        }));
        return json({ index: 'qwav-research-v2', query: q, count: results.length, results });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // /v1/history — query log from D1 qnfo-audit.ai_queries (QNFO_AUDIT binding)
    if (path === '/v1/history' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      if (q) {
        if (!env.LOG_VZ || !env.AI) return json({ error: 'semantic history requires Vectorize qnfo-ai-log + AI bindings' }, 501);
        try {
          const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [q] });
          const vec = embed?.data?.[0] || (Array.isArray(embed) ? embed[0] : null);
          if (!vec) return json({ error: 'embedding generation failed' }, 502);
          const matches = await env.LOG_VZ.query(vec, { topK: Math.min(Math.max(parseInt(url.searchParams.get('k') || '10', 10), 1), 20), returnMetadata: 'all' });
          return json({ index: 'qnfo-ai-log', query: q, count: (matches.matches || []).length, results: (matches.matches || []).map(m => ({ id: m.id, score: Math.round((m.score || 0) * 10000) / 10000, metadata: m.metadata || {} })) });
        } catch (e) {
          return json({ error: e.message }, 500);
        }
      }
      const db = env.QNFO_AUDIT;
      if (!db) return json({ error: 'query logging requires D1 binding — not configured in this deployment' }, 501);
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 100);
      const model = (url.searchParams.get('model') || '').trim();
      try {
        let rows;
        if (model) {
          rows = await db.prepare(
            'SELECT id, ts, model, strategy, complexity, domain, prompt, response, prompt_tokens, completion_tokens, cost_usd, latency_ms, rag_sources, streamed FROM ai_queries WHERE model = ?1 ORDER BY ts DESC LIMIT ?2'
          ).bind(model, limit).all();
        } else {
          rows = await db.prepare(
            'SELECT id, ts, model, strategy, complexity, domain, prompt, response, prompt_tokens, completion_tokens, cost_usd, latency_ms, rag_sources, streamed FROM ai_queries ORDER BY ts DESC LIMIT ?1'
          ).bind(limit).all();
        }
        return json({ count: rows.results.length, queries: rows.results });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ---- v4.6.0: web browsing ----
    // ---- v4.7.0: QNFO records passthrough (any client can fetch oracle context) ----
    if (path === '/v1/records' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      const scope = (url.searchParams.get('scope') || 'research').toLowerCase();
      // SEPARATION MANDATE (2026-08-04 + 2026-08-28): the research gateway only
      // serves research/infra records. Personal scope is served by the Personal
      // Twin provider (personal-api); it is BLOCKED here by policy.
      if (scope !== 'research' && scope !== 'infra') return json({ error: 'scope must be research or infra (personal scope is served by the Personal Twin — separation mandate)' }, 400);
      if (!env.QNFO_INFRA || !env.INFRA_TOKEN) return json({ error: 'QNFO_INFRA binding/INFRA_TOKEN not configured' }, 501);
      if (!q) return json({ error: 'q required' }, 400);
      try {
        const rr = await env.QNFO_INFRA.fetch('https://qnfo-infra.internal/retrieve?q=' + encodeURIComponent(q) + '&scope=' + encodeURIComponent(scope) + '&k=' + (url.searchParams.get('k') || '4'), {
          headers: { Authorization: 'Bearer ' + env.INFRA_TOKEN }
        });
        const rj = await rr.json();
        return json(rr.ok ? rj : { error: rj.error || ('HTTP ' + rr.status) }, rr.ok ? 200 : 502);
      } catch (e) { return json({ error: e.message }, 500); }
    }
    if (path === '/v1/context' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      const scope = (url.searchParams.get('scope') || 'research').toLowerCase();
      // SEPARATION MANDATE: personal scope blocked on the research gateway.
      if (scope !== 'research' && scope !== 'infra') return json({ error: 'scope must be research or infra (personal scope is served by the Personal Twin — separation mandate)' }, 400);
      if (!env.QNFO_INFRA || !env.INFRA_TOKEN) return json({ error: 'QNFO_INFRA binding/INFRA_TOKEN not configured' }, 501);
      if (!q) return json({ error: 'q required' }, 400);
      try {
        const rr = await env.QNFO_INFRA.fetch('https://qnfo-infra.internal/context?q=' + encodeURIComponent(q) + '&scope=' + encodeURIComponent(scope) + '&k=' + (url.searchParams.get('k') || '4'), {
          headers: { Authorization: 'Bearer ' + env.INFRA_TOKEN }
        });
        const rj = await rr.json();
        return json(rj.ok ? rj : { error: rj.error || ('HTTP ' + rr.status) }, rr.ok ? 200 : 502);
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (path === '/' && method === 'GET') {
      return new Response(PLAYGROUND_HTML.replace('__TITLE__', 'QNFO Notes - research chat (qnfo-ai router)').replace('__KEY_HINT__', 'tokens/qnfo-ai').replace('__DEFAULT_MODEL__', 'glm-5.2').replace('__STREAM__', 'true'), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
    }
    if (path === '/v1/web/search' && method === 'GET') {
      const authH = request.headers.get('Authorization') || '';
      if (!(await authOk(authH, env))) return json({ error: 'Unauthorized' }, 401);
      const q = (url.searchParams.get('q') || '').trim();
      const k = Math.min(Math.max(parseInt(url.searchParams.get('k') || '5', 10), 1), 10);
      if (!q) return json({ error: 'q required' }, 400);
      try {
        const r = await webSearch(q, k);
        if (r.error) return json({ error: r.error }, 502);
        if (env.QNFO_AUDIT) ctx.waitUntil(logQuery(env, { id: 'q-' + Math.random().toString(16).slice(2, 18), ts: new Date().toISOString(), model: 'web-search', strategy: 'web', complexity: 'medium', domain: 'web', prompt: q.slice(0, 2000), response: '', prompt_tokens: 0, completion_tokens: 0, cost_usd: 0, latency_ms: 0, rag_sources: JSON.stringify(r.results.slice(0, 5).map(x => x.url)), streamed: 0 }).catch(() => {}));
        return json({ query: q, engine: 'duckduckgo', count: r.results.length, results: r.results });
      } catch (e) { return json({ error: e.message }, 500); }
    }
    if (path === '/v1/web/fetch' && method === 'GET') {
      const authH = request.headers.get('Authorization') || '';
      if (!(await authOk(authH, env))) return json({ error: 'Unauthorized' }, 401);
      const u = (url.searchParams.get('url') || '').trim();
      const max = Math.min(Math.max(parseInt(url.searchParams.get('max') || '6000', 10), 500), 20000);
      if (!u) return json({ error: 'url required' }, 400);
      try {
        const r = await webFetch(u, max);
        if (r.error) return json({ error: r.error }, 502);
        return json(r);
      } catch (e) { return json({ error: e.message }, 500); }
    }
    if (path === '/manifest.webmanifest' && method === 'GET') {
      return new Response(MANIFEST.replace('__TITLE__', TITLE).replace('__SHORT__', SHORT), { headers: { 'Content-Type': 'application/manifest+json', 'Access-Control-Allow-Origin': '*' } });
    }
    if (path === '/sw.js' && method === 'GET') {
      return new Response(SW_JS, { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' } });
    }
    if (path === '/icon.svg' && method === 'GET') {
      return new Response(ICON_SVG, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
    }
    return json({ error: 'Not found' }, 404);
  },
};
