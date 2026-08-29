// qnfo-ai v4.3.0 — Model Router + Ensemble + Auto-Routing
// Reconstructed 2026-08-11 from live API contract after WORKER-THIN-CLIENT-1 remediation.
// ROOT-CAUSE FIX: v4.2.0 had NO [[ai]] binding -> env.AI undefined -> tier-0 free models
// returned "All models failed." while DeepSeek API (secret) worked. v4.3.0 declares the
// AI binding in wrangler.toml and routes tier-0 through env.AI.run() (Workers AI FREE).
// Ensemble directive: frontier coder + reasoning validator + 1M-ctx reviewer (best models).

const VERSION = '5.5.2';
const ROUTES = ['/health', '/', '/v1/chat/completions', '/v1/models', '/v1/models/:id', '/v1/responses', '/chat/completions', '/v1/search', '/v1/history', '/v1/web/search', '/v1/web/fetch'];
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const GW_COMPAT = 'https://gateway.ai.cloudflare.com/v1/edb167b78c9fb901ea5bca3ce58ccc4b/default/compat/chat/completions';

// ---------------- Model Registry ----------------
// tier 0 = Workers AI (postpaid — the catalog SHIFTED on 2026-08-28: the former "free"
//          tier-0 models are now billed per-token. Only gemma-2b / mistral-7b / gemma-7b
//          remain free. Input $/M noted inline per model for best-value routing.)
// tier 1/2 = DeepSeek API (DEEPSEEK_API_KEY secret)
// tier 3 = (reserved — no tier-3 models currently; was "Anthropic/OpenAI via AI Gateway")
// v5.0.0 — enriched registry. Per-model metadata drives every routing decision:
//   ctx   = context window in tokens (Workers AI documented value). The truncation guard
//           reserves output + a safety margin, so over-limit payloads are trimmed to the
//           largest window the model actually supports BEFORE any upstream call (no 400/502).
//   temp / topP = per-model sampling defaults; a client-supplied temperature/top_p overrides.
//   vision = accepts image_url parts (image-to-text / OCR). tools = supports function calling.
//   maxOut = output token cap (clamped from client max_tokens to avoid upstream 400).
const MODELS = {
  // Workers AI free — original three
  'deepseek-r1-qwen-32b':     { tier: 0, family: 'deepseek', wa: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', reasoning: true,  maxOut: 8192,  ctx: 32768,  temp: 0.6, topP: 0.95, tools: false, vision: false },
  'qwen3-30b':                { tier: 0, family: 'qwen',     wa: '@cf/qwen/qwen3-30b-a3b-fp8',                  reasoning: false, maxOut: 8192,  ctx: 32768,  temp: 0.7, topP: 0.9,  tools: true,  vision: false },
  // Workers AI free — directive substitutes (small coder/validator/reviewer class)
  'qwen2.5-coder-32b':        { tier: 0, family: 'qwen',     wa: '@cf/qwen/qwen2.5-coder-32b-instruct',         reasoning: false, maxOut: 8192,  ctx: 32768,  temp: 0.2, topP: 0.95, tools: false, vision: false },
  'gemma-2b':                 { tier: 0, family: 'google',   wa: '@cf/google/gemma-2b-it-lora',                 reasoning: false, maxOut: 4096,  ctx: 8192,   temp: 0.7, topP: 0.9,  tools: false, vision: false },
  'granite-h-micro':          { tier: 0, family: 'ibm',      wa: '@cf/ibm-granite/granite-4.0-h-micro',         reasoning: false, maxOut: 4096,  ctx: 128000, temp: 0.7, topP: 0.9,  tools: true,  vision: false },
  // v4.4.0: Tier B science models per LLM audit 2026-08-13 (verified free tier-0, direct AI 200)
  'glm-5.2':                  { tier: 0, family: 'zai',      wa: '@cf/zai-org/glm-5.2',              reasoning: true,  maxOut: 8192,  ctx: 128000, temp: 0.6, topP: 0.95, tools: true,  vision: false },
  'kimi-k2.6':                { tier: 0, family: 'moonshot', wa: '@cf/moonshotai/kimi-k2.6',           reasoning: true,  maxOut: 8192,  ctx: 262144, temp: 0.6, topP: 0.95, tools: true,  vision: true  },
  'qwq-32b':                  { tier: 0, family: 'qwen',     wa: '@cf/qwen/qwq-32b',                   reasoning: true,  maxOut: 8192,  ctx: 131072, temp: 0.6, topP: 0.95, tools: false, vision: false },
  // v5.4.0: best-value PAID Workers AI models. User directive 2026-08-28: "best, most
  // capable models for lowest cost — paid OK if best value". All postpaid; $/M input noted.
  'glm-4.7-flash':             { tier: 0, family: 'zai',      wa: '@cf/zai-org/glm-4.7-flash',             reasoning: true,  maxOut: 8192,  ctx: 131072, temp: 0.7, topP: 0.9,  tools: true,  vision: false },   // $0.06/M — cheap general default (131k ctx, reasoning)
  'gemma-4-26b':               { tier: 0, family: 'google',   wa: '@cf/google/gemma-4-26b-a4b-it',         reasoning: false, maxOut: 8192,  ctx: 131072, temp: 0.7, topP: 0.9,  tools: true,  vision: false },   // $0.10/M
  'glm-5.3-flash':             { tier: 0, family: 'zai',      wa: '@cf/zai-org/glm-5.3-flash',             reasoning: true,  maxOut: 8192,  ctx: 1048576, temp: 0.6, topP: 0.9,  tools: true,  vision: true  },   // $0.15/M 1M-ctx natively multimodal (non-Llama vision)
  'gpt-oss-120b':              { tier: 0, family: 'openai',   wa: '@cf/openai/gpt-oss-120b',              reasoning: true,  maxOut: 32768, ctx: 131072, temp: 0.6, topP: 0.9,  tools: true,  vision: false },   // $0.35/M reasoning/agentic
  'deepseek-v4-flash-wa':      { tier: 0, family: 'deepseek', wa: '@cf/deepseek-ai/deepseek-v4-flash-0731', reasoning: true,  maxOut: 8192,  ctx: 1048576, temp: 0.7, topP: 0.9,  tools: true,  vision: false },   // $0.44/M official DeepSeek V4 Flash (1M ctx, reasoning)
  'deepseek-v4-pro-wa':        { tier: 0, family: 'deepseek', wa: '@cf/deepseek-ai/deepseek-v4-pro-0813',   reasoning: true,  maxOut: 32768, ctx: 1048576, temp: 0.6, topP: 0.9,  tools: true,  vision: false },   // $1.32/M 1M-ctx reasoning
  'kimi-k2.7-code':            { tier: 0, family: 'moonshot', wa: '@cf/moonshotai/kimi-k2.7-code',          reasoning: true,  maxOut: 32768, ctx: 262144, temp: 0.2, topP: 0.95, tools: true,  vision: true  },   // $0.95/M 262k-ctx frontier coding (reasoning + vision)
  'glm-5.3':                   { tier: 0, family: 'zai',      wa: '@cf/zai-org/glm-5.3',                   reasoning: true,  maxOut: 8192,  ctx: 1048576, temp: 0.6, topP: 0.9,  tools: true,  vision: false },   // $1.40/M 1M-ctx agentic coding
  // v5.0.0: vision (image-to-text + OCR) — free tier-0. Routed automatically when any
  // message carries an image_url part; selectable explicitly. License: Workers AI gates
  // this model behind a one-time Community License "agree" — ACCEPTED 2026-08-28 on the
  // account owner's behalf (explicit user directive "accept all terms").
  'llama-3.2-11b-vision':     { tier: 0, family: 'meta',     wa: '@cf/meta/llama-3.2-11b-vision-instruct',     reasoning: false, maxOut: 2048,  ctx: 131072, temp: 0.6, topP: 0.9,  tools: false, vision: true  },
  // DeepSeek API (1M context)
  'deepseek-v4-flash':        { tier: 1, family: 'deepseek', api: 'deepseek-chat',     maxOut: 8192, ctx: 1048576, temp: 0.7, topP: 0.9,  tools: true, vision: false },
  'deepseek-v4-flash-thinking': { tier: 1, family: 'deepseek', api: 'deepseek-reasoner', maxOut: 8192, ctx: 1048576, temp: 0.6, topP: 0.9, tools: false, vision: false },
  'deepseek-v4-pro':          { tier: 2, family: 'deepseek', api: 'deepseek-chat',     maxOut: 8192, ctx: 1048576, temp: 0.4, topP: 0.9,  tools: true, vision: false },
  // v4.3.7: tier-3 AI Gateway models REMOVED — the compat endpoint returns 400
  // "Chat completion bad format" (2019) for every one of them, surfacing as router
  // 502 + the app's Model Check 5s timeout. Advertising models that cannot respond
  // is worse than not advertising them. Explicit requests for unknown models fall
  // back to deepseek-v4-flash (existing behavior).
};

// Per-model output token caps (v4.3.5 — Bad Gateway fix, 2026-08-12).
// Workers AI models reject max_tokens above their max_total_tokens (an oversized
// max_tokens surfaces as an upstream 400 -> router 502 Bad Gateway).
// Every call path clamps the requested max_tokens to the routed model's cap so an
// oversized client max_tokens can never surface as a router 502.
const MAX_OUT = {
  // Workers AI (tier-0) — output token caps, keyed by Workers AI model id.
  // Kept well under each model's max_total_tokens so an oversized client max_tokens
  // can never surface as an upstream 400 -> router 502.
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': 8192,
  '@cf/qwen/qwen3-30b-a3b-fp8': 8192,
  '@cf/qwen/qwen2.5-coder-32b-instruct': 8192,
  '@cf/google/gemma-2b-it-lora': 4096,
  '@cf/ibm-granite/granite-4.0-h-micro': 4096,
  '@cf/zai-org/glm-5.2': 8192,
  '@cf/moonshotai/kimi-k2.6': 8192,
  '@cf/qwen/qwq-32b': 8192,
  '@cf/meta/llama-3.2-11b-vision-instruct': 2048,
  '@cf/zai-org/glm-4.7-flash': 8192,
  '@cf/google/gemma-4-26b-a4b-it': 8192,
  '@cf/zai-org/glm-5.3-flash': 8192,
  '@cf/openai/gpt-oss-120b': 32768,
  '@cf/deepseek-ai/deepseek-v4-flash-0731': 8192,
  '@cf/deepseek-ai/deepseek-v4-pro-0813': 32768,
  '@cf/moonshotai/kimi-k2.7-code': 32768,
  '@cf/zai-org/glm-5.3': 8192,
};
const DEFAULT_MAX_OUT = 8192;

// v5.0.0 — default system prompt, injected only when the client sends no leading
// system message. A client-supplied system prompt (e.g. DeepChat's) is always honored.
const DEFAULT_SYSTEM_PROMPT = 'You are the QNFO/QWAV research assistant (QNFO = research arm, QWAV = commercial arm, founded by Rowan Brad Quni-Gudzinas). Mission: the energy-efficiency benchmark for quantum computing — "what does a correct quantum answer cost in energy?" (JPCUB, joules-per-solution). Answer directly and substantively: lead with the answer, then the reasoning. Prefer primary sources; cite by slug or DOI when known; never fabricate citations, DOIs, or references. Verify quantitative claims computationally where possible; flag uncertainty explicitly. For code, write correct, runnable code. Never return a placeholder, an empty refusal, or boilerplate when a real answer exists. Plain scholarly prose — no filler, no self-praise, no meta-commentary about your own process.';

// v5.5.1 — substantive fallback instead of a cryptic 'All models failed.' when a model returns empty.
const FALLBACK_TEXT = 'QNFO research assistant (online). QNFO is not an acronym and does not stand for anything; QNFO is the research organization with QWAV as its commercial/industry arm. Mission: the energy-efficiency benchmark for quantum computing — what a correct quantum answer costs in energy (JPCUB, joules-per-solution), grounded in Landauer, Margolus-Levitin, and Bremermann limits with anti-gaming discipline. Active programs: Ultrametric Physics, Laws of Form, Infomatics, CFPE, Consilience Research, QWAV Platform, QWAV Demos. The routed model returned no output for this prompt; please rephrase or retry.';

// v5.0.0 — safety margin reserved inside every context window (output + headroom).
// The truncation guard computes budget = ctx - margin so a near-limit payload never
// pushes input+output over the model's hard limit.
const CTX_SAFETY_MARGIN = 512;

// Clamp max_tokens to a model cap. maxTokens may be 0/undefined -> default DEFAULT_MAX_OUT.
function clampTokens(maxTokens, cap) {
  const c = cap || DEFAULT_MAX_OUT;
  const t = Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : DEFAULT_MAX_OUT;
  return Math.min(t, c);
}

// v4.3.6 — Context-window-aware routing (Bad Gateway fix #2, 2026-08-12).
// LEGACY FALLBACK ONLY (v5.0.0+): per-model ctx in MODELS[] is authoritative via modelCtx().
// TIER0_TOTAL_CAP / TIER0_SAFE_TOTAL remain only as a fallback when a spec lacks ctx.
const TIER0_TOTAL_CAP = 24000;
const TIER0_SAFE_TOTAL = 20000;

function estimateInputTokens(messages) {
  let chars = 0;
  for (const m of messages || []) {
    chars += contentCharLen(m && m.content);
  }
  // v4.3.7: conservative /3 (DeepSeek tokenizer can be ~2-4 chars/token; under-estimating
  // lets over-limit payloads through -> upstream 400 -> router 502). /3 over-estimates
  // slightly for prose, which only makes the truncation guard trigger a bit earlier (safe).
  return Math.ceil(chars / 3);
}

// v5.5.2: output-token estimate (mirrors the /3 input heuristic); used for finish_reason
// truncation detection and completion_tokens telemetry (replaces the hardcoded 0).
function estimateOutputTokens(text) {
  return Math.ceil(String(text || '').length / 3);
}

// v5.0.0 — per-model context window. Workers AI documented values live in MODELS[].ctx;
// DeepSeek API enforces 1,048,576. Fall back to the legacy blanket caps when absent.
function modelCtx(spec) {
  if (!spec) return DEEPSEEK_MAX_CONTEXT;
  if (spec.ctx) return spec.ctx;
  return spec.tier === 0 ? TIER0_TOTAL_CAP : DEEPSEEK_MAX_CONTEXT;
}

// If the routed target can't hold estimated input + output, escalate: prefer the largest
// free NON-Llama model first (qwq-32b, 131k), then DeepSeek (1M context). Explicit model
// requests are honored as-is — the truncation guard below still protects them.
function contextAwareTarget(cls, target, estInput, maxOut) {
  const spec = MODELS[target];
  if (!spec || spec.tier !== 0) return target;
  const out = clampTokens(maxOut, MAX_OUT[spec.wa] || DEFAULT_MAX_OUT);
  if (estInput + out <= modelCtx(spec) - CTX_SAFETY_MARGIN) return target;
  const big = MODELS['qwq-32b'];
  if (big && spec.wa !== big.wa && estInput + out <= modelCtx(big) - CTX_SAFETY_MARGIN) {
    return 'qwq-32b';
  }
  return cls.domain === 'science' ? 'deepseek-v4-flash-thinking' : 'deepseek-v4-flash';
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
  // margin below the hard cap; real prose (~4 chars/token) keeps ~half the window of
  // recent context, which matches the app's own auto-compaction semantics.
  const charBudget = Math.floor(maxInputTokens * 1.9);
  let used = 0;
  let system = null;
  // keep the leading system message unconditionally
  if (arr[0] && arr[0].role === 'system') {
    system = arr[0];
    used = contentCharLen(system.content);
  }
  const tail = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] === system) continue;
    const cost = contentCharLen(arr[i].content);
    if (used + cost > charBudget) {
      if (tail.length === 0) {
        // newest message alone overflows: clip its content to the remaining budget so the
        // request still carries the current user turn instead of 502ing.
        const remain = Math.max(0, charBudget - used);
        const raw = typeof arr[i].content === 'string' ? arr[i].content : flattenContentToString(arr[i].content);
        const clipped = { ...arr[i], content: raw.slice(0, remain) };
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

// v5.0.0 — approximate char count of a message content (text + image base64), used by
// the context estimator and the truncation guard so vision payloads count their bytes.
function contentCharLen(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    let n = 0;
    for (const p of content) {
      if (!p || typeof p !== 'object') continue;
      if (typeof p.text === 'string') n += p.text.length;
      else if (p.image_url) {
        const u = typeof p.image_url === 'string' ? p.image_url : (p.image_url && p.image_url.url);
        if (typeof u === 'string') n += u.length;
      }
    }
    return n;
  }
  return String(content ?? '').length;
}

// v5.0.0 — true when any message carries an image part (image_url / input_image / image).
function hasImageParts(messages) {
  if (!Array.isArray(messages)) return false;
  for (const m of messages) {
    const c = m && m.content;
    if (Array.isArray(c)) {
      for (const p of c) {
        if (p && typeof p === 'object' && (p.type === 'image_url' || p.type === 'input_image' || p.type === 'image')) return true;
      }
    }
  }
  return false;
}

// v5.0.0 — normalize messages for a VISION model: keep text + image_url parts in the
// Workers AI multimodal array format; strip unsupported part types. Text-only messages
// (string content) pass through untouched.
function normalizeForVision(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const c = m.content;
    if (typeof c === 'string' || c == null) return m;
    if (Array.isArray(c)) {
      const parts = c.map((p) => {
        if (!p || typeof p !== 'object') return null;
        if (typeof p.text === 'string') return { type: 'text', text: p.text };
        if (p.type === 'image_url' || p.type === 'input_image' || p.type === 'image') {
          // Workers AI vision schema requires image_url as an OBJECT { url: "data:..." } —
          // a bare string image_url is rejected (3043). HTTP URLs are not accepted either.
          let url = p.image_url;
          if (typeof url === 'string') url = { url: url };
          if (url && typeof url === 'object' && typeof url.url === 'string' && url.url) {
            return { type: 'image_url', image_url: { url: url.url } };
          }
        }
        return null;
      }).filter(Boolean);
      return { ...m, content: parts.length ? parts : flattenContentToString(c) };
    }
    return m;
  });
}

// v5.1.0 — auto-ensemble: ambiguous (uncertain words) or complex non-science/legal
// queries get the coder->validator->reviewer pipeline for free when the client used 'auto'.
function shouldEnsemble(cls) {
  if (cls.domain === 'science' || cls.domain === 'legal') return false; // dedicated reasoning models
  return cls.uncertainty === 'medium' || cls.complexity === 'high';
}

// v5.2.0 — QNFO Vectorize indexes bound to THIS (QNFO) endpoint. Personal data lives on
// the separate personal-api endpoint (separation mandate: personal RAG for the personal
// endpoint ONLY, QNFO RAG/Vectorize for the QNFO endpoint ONLY).
const QNFO_INDEXES = ['PAPER_VZ', 'NOTES_VZ', 'TASKS_VZ', 'HANDOFFS_VZ', 'LOG_VZ', 'IPATENT_VZ', 'INFRA_VZ', 'CLOUD_OPS_VZ'];

// v5.2.0 — unified QNFO vector search: query every bound QNFO Vectorize index directly.
async function searchQnfoIndexes(env, q, k) {
  const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [String(q).slice(0, 500)] });
  const vec = embed?.data?.[0] || (Array.isArray(embed) ? embed[0] : null);
  if (!vec) return { error: 'embedding generation failed' };
  const sources = {};
  let total = 0;
  for (const b of QNFO_INDEXES) {
    if (!env[b]) continue;
    try {
      const hits = await env[b].query(vec, { topK: k, returnValues: false, returnMetadata: 'all' });
      const rows = (hits.matches || []).map((m) => ({ id: m.id, score: Math.round((m.score || 0) * 1e4) / 1e4, metadata: m.metadata || {} }));
      sources[b] = rows;
      total += rows.length;
    } catch (e) {
      sources[b] = [{ error: e.message }];
    }
  }
  return { sources, total };
}

// Ensemble member config — the directive: frontier coder primary, reasoning validator, 1M-ctx reviewer.
// v5.5.0: upgraded to the BEST available models (user directive "best of all models combined"):
// kimi-k2.7-code (frontier coder), gpt-oss-120b (reasoning validator), deepseek-v4-pro (1M-ctx reviewer).
const ENSEMBLE = {
  primary:   { wa: '@cf/moonshotai/kimi-k2.7-code', ctx: 262144 },   // frontier coder (262k ctx, reasoning + vision, $0.95/M)
  validator: { wa: '@cf/openai/gpt-oss-120b' },                      // independent reasoning check ($0.35/M)
  reviewer:  { wa: '@cf/deepseek-ai/deepseek-v4-pro-0813' },         // 1M-ctx reasoning refinement ($1.32/M)
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
  // v4.3.11 QNFO-MODEL-POLICY-1 + v5.3.0 user directive: NO Llama/Meta models in
  // chat/completion/text routing. Llama is trained on Facebook data and is unfit for
  // scientific/scholarly research (QNFO/QWAV); it is retained ONLY for the vision model
  // (OCR/image). Non-Llama roster: DeepSeek API (deepseek-chat/reasoner), Qwen, GLM, Kimi,
  // Granite, Gemma, GPT-OSS, plus the v5.4.0 best-value paid tier. (All postpaid now.)
  return 'glm-4.7-flash'; // v5.4.0: glm-4.7-flash ($0.06/M) general default — 23x cheaper than glm-5.2 ($1.4/M)
}

async function runWorkersAI(env, modelId, messages, maxTokens, stream, opts = {}) {
  const { temperature, top_p, tools, vision } = opts;
  // v5.0.0: function calling goes DIRECT to the Workers AI binding — the AI Gateway
  // compat endpoint is a chat-completions pass-through and does not forward `tools` /
  // `tool_choice`. Cost gating is best-effort; correctness wins.
  // v5.1.0: vision also goes DIRECT — the compat endpoint mangles multimodal image_url.
  const directOnly = !!(tools && tools.length) || !!vision;
  if (!directOnly && env.CF_API_TOKEN && modelId.startsWith('@cf/')) {
    try {
      const body = {
        model: 'workers-ai/' + modelId,
        messages,
        max_tokens: clampTokens(maxTokens, MAX_OUT[modelId]),
        stream: stream || false,
      };
      if (Number.isFinite(temperature)) body.temperature = temperature;
      if (Number.isFinite(top_p)) body.top_p = top_p;
      const gwResp = await fetch(GW_COMPAT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-aig-authorization': 'Bearer ' + env.CF_API_TOKEN,
        },
        body: JSON.stringify(body),
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
  const aiBody = {
    messages,
    // v4.3.5: clamp to the model's output cap so an oversized client max_tokens
    // (e.g. 32000 on a 24000-max model) cannot surface as an upstream 400 -> router 502.
    max_tokens: clampTokens(maxTokens, MAX_OUT[modelId]),
    stream: stream || false,
  };
  if (Number.isFinite(temperature)) aiBody.temperature = temperature;
  if (Number.isFinite(top_p)) aiBody.top_p = top_p;
  if (tools && tools.length) {
    aiBody.tools = tools;
    aiBody.tool_choice = 'auto';
  }
  // v5.5.2: self-correcting output cap — if a model rejects an oversized max_tokens
  // (upstream 400), retry with a halved cap so a raised MAX_OUT can never surface as a
  // router 502 (Bad-Gateway hardening; BLAME-EXTERNAL-1 class).
  for (let attempt = 0; ; attempt++) {
    try {
      return await env.AI.run(modelId, aiBody);
    } catch (e) {
      const msg = String((e && e.message) || e || '');
      const isCapErr = /max_tokens|max output|context window|too (many|long)|token limit|max_new_tokens/i.test(msg);
      const cur = aiBody.max_tokens;
      if (isCapErr && attempt < 3 && Number.isFinite(cur) && cur > 1024) {
        aiBody.max_tokens = Math.max(1024, Math.floor(cur / 2));
        continue;
      }
      throw e;
    }
  }
}

// v5.0.0 — extract function-call tool_calls from any Workers AI response shape and
// normalize to the OpenAI `{id, type:"function", function:{name, arguments}}` form.
function extractWAToolCalls(result, depth = 0) {
  if (!result || typeof result !== 'object' || depth > 4) return null;
  const raw = result.tool_calls
    || result.result?.tool_calls
    || result.choices?.[0]?.message?.tool_calls
    || (result.result && typeof result.result === 'object' ? result.result.choices?.[0]?.message?.tool_calls : null)
    || null;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((tc, i) => {
    const fn = tc.function || (tc.name ? tc : null);
    if (!fn) return null;
    const name = fn.name;
    const args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {});
    return { id: tc.id || `call_${Math.random().toString(16).slice(2, 10)}`, type: 'function', function: { name, arguments: args } };
  }).filter(Boolean);
}

// v5.1.0 — built-in server-side code execution tool. Executes JavaScript in-worker
// (Workers isolates the runtime; the request is CPU-bounded) and returns the result.
// This is the user's OWN authenticated endpoint — sandboxing is best-effort.
const RUN_CODE_TOOL = {
  type: 'function',
  function: {
    name: 'run_code',
    description: 'Execute JavaScript code and return the result. Use for calculations, verification, math, data processing. Return a value or use console.log() to print output.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute. Use return to emit a value, or console.log() for text output.' },
      },
      required: ['code'],
    },
  },
};

async function executeCode(code) {
  const logs = [];
  const sandbox = {
    console: {
      log: (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
      error: (...a) => logs.push('ERROR: ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
    },
    Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Promise, BigInt,
    parseInt, parseFloat, isNaN, isFinite,
  };
  const keys = Object.keys(sandbox);
  try {
    const fn = new Function(...keys, '"use strict"; return (async () => {\n' + code + '\n})();');
    const result = await fn(...keys.map((k) => sandbox[k]));
    const out = logs.length
      ? logs.join('\n')
      : (result === undefined ? '(no return value)' : (typeof result === 'string' ? result : JSON.stringify(result)));
    return { ok: true, output: out.slice(0, 4000) };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// v5.1.0 — execute built-in tool_calls server-side (currently run_code). Returns
// OpenAI-shaped tool-result messages for the follow-up turn.
async function executeBuiltinTools(toolCalls) {
  const results = [];
  for (const tc of toolCalls || []) {
    const fnName = tc && tc.function && tc.function.name;
    if (fnName === 'run_code') {
      let code = '';
      try { code = JSON.parse(tc.function.arguments || '{}').code || ''; } catch (e) { code = ''; }
      const res = await executeCode(code);
      results.push({ role: 'tool', tool_call_id: tc.id || 'call_0000', content: JSON.stringify(res) });
    }
  }
  return results;
}

// v5.1.0 — single model turn: routes to Workers AI / DeepSeek / gateway and returns
// normalized { content, toolCalls, provider }. Powers the code-execution loop.
async function runModelTurn(env, effSpec, messages, maxTokens, tools, effTemp, effTopP) {
  if (effSpec.wa) {
    const out = await runWorkersAI(env, effSpec.wa, messages, maxTokens, false, {
      temperature: effTemp, top_p: effTopP,
      tools: (effSpec.tools ? tools : undefined), vision: effSpec.vision,
    });
    return { content: extractWAContent(out), toolCalls: extractWAToolCalls(out), provider: 'workers-ai' };
  }
  if (effSpec.api) {
    const out = await callDeepSeek(env, effSpec.api, messages, maxTokens, false, tools, { temperature: effTemp, top_p: effTopP });
    return { content: out?.choices?.[0]?.message?.content ?? '', toolCalls: out?.choices?.[0]?.message?.tool_calls ?? null, provider: 'deepseek' };
  }
  if (effSpec.gateway) {
    const out = await callGateway(env, effSpec.model, messages, maxTokens, false);
    return { content: out?.choices?.[0]?.message?.content ?? '', toolCalls: null, provider: effSpec.family };
  }
  return { content: '', toolCalls: null, provider: effSpec.family || 'unknown' };
}

// Workers AI non-stream returns different shapes per model/provider:
//   binding: { response: "text" } | { result: { response: "text" } } | { choices:[...] }
//   REST:    { result: { choices:[...] } } | { result: { result: { response } } } (nested)
// Recursive, shape-agnostic, depth-capped.
function extractWAContent(result, depth = 0) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object' || depth > 4) return '';
  if (typeof result.response === 'string' && result.response.trim()) return result.response;
  if (typeof result.result === 'string' && result.result.trim()) return result.result;
  if (Array.isArray(result.choices) && result.choices[0]) {
    const c = result.choices[0];
    const msg = c.message;
    if (msg) {
      if (typeof msg.content === 'string' && msg.content.trim()) return msg.content;
      // Reasoning models (qwen3-30b, glm-5.3, deepseek-v4, kimi-k2.7, gemma-4): content is
      // EMPTY/null when output tokens are exhausted on thinking — surface reasoning_content
      // so the response isn't "All models failed." (v5.4.0).
      if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) return msg.reasoning_content;
      if (typeof msg.reasoning === 'string' && msg.reasoning.trim()) return msg.reasoning;
    }
    if (typeof c.text === 'string' && c.text.trim()) return c.text;
  }
  if (result.result && typeof result.result === 'object') return extractWAContent(result.result, depth + 1);
  return '';
}

async function callDeepSeek(env, apiModel, messages, maxTokens, stream, tools, opts = {}) {
  const { temperature, top_p } = opts;
  const body = { model: apiModel, messages, max_tokens: clampTokens(maxTokens, DEFAULT_MAX_OUT), stream: stream || false };
  // v4.3.10: forward OpenAI-format function tools to DeepSeek (Code Mode agent support)
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  // v5.0.0: forward sampling params when the client supplies them (per-model defaults
  // are resolved by the caller and passed through as explicit numbers).
  if (Number.isFinite(temperature)) body.temperature = temperature;
  if (Number.isFinite(top_p)) body.top_p = top_p;
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
    // Validator: judge the primary output for correctness, completeness, and nuance.
    const vMsg = [
      { role: 'system', content: 'You are a strict validator. Judge the assistant response for correctness, completeness, and nuance against the user request. Reply ONLY with "PASS" if it is accurate, complete, and appropriately nuanced — or "FAIL" followed by one sentence naming the specific deficiency (incorrect, incomplete, too shallow, or generic).' },
      ...messages,
      { role: 'assistant', content: primaryText },
    ];
    // v5.5.2: 256 tokens starved the reasoning validator's chain-of-thought, so the PASS/FAIL
    // verdict was never emitted (extractWAContent surfaced the truncated reasoning instead) and
    // every answer was spuriously FAILed -> reviewer always re-ran. Raise the budget and match
    // the verdict anywhere in the output (after any thinking), not only at the start.
    const vOut = await runWorkersAI(env, ENSEMBLE.validator.wa, vMsg, 1024, false);
    const vText = extractWAContent(vOut).trim();
    const pass = /\bpass\b/i.test(vText) && !/\bfail\b/i.test(vText);
    agreementRate = pass ? 1 : 0;

    if (!pass) {
      // Reviewer refines for depth and nuance
      verificationResult = 'reviewed';  // set BEFORE refine so empty-refine still reports accurately
      const rMsg = [
        { role: 'system', content: 'You are a senior research reviewer. Improve the assistant response to fully satisfy the user request with depth and nuance: correct any errors, fill gaps, add relevant context or alternative perspectives, and replace generic statements with specific, substantive ones. Output only the improved response.' },
        ...messages,
        { role: 'assistant', content: primaryText },
      ];
      const rOut = await runWorkersAI(env, ENSEMBLE.reviewer.wa, rMsg, Math.max(clampTokens(maxTokens, MAX_OUT[ENSEMBLE.reviewer.wa]), 1024), false);
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

  const { model, messages: rawMessages, max_tokens, stream, temperature, top_p, tools } = body || {};
  let messages = rawMessages;
  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'model and messages required' }, 400);
  }
  // v5.0.0: detect image payloads BEFORE normalization (vision routing) and inject a
  // default system prompt only when the client sent none (client prompts are honored).
  const hasImage = hasImageParts(messages);
  // v5.1.0 — server-side code-execution intent (body.run_code or a run_code tool).
  const wantsCode = body.run_code === true || body.run_code === 'true'
    || (Array.isArray(tools) && tools.some((t) => t && t.function && t.function.name === 'run_code'));
  if (!messages.some((m) => m && m.role === 'system')) {
    messages = [{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }, ...messages];
  }
  // v5.5.1 — a bare continuation (CONTINUE / WHAT'S NEXT? / YOU TELL ME...) with a single
  // user message injects the recent logged activity from D1 ai_queries as system context, so
  // "CONTINUE" returns real recent-work status instead of filler or a static mission statement.
  const _contWords = ['continue', 'whats next', "what's next", 'what next', 'you tell me', 'go on', 'resume', 'proceed', 'keep going', 'and then', 'next', 'next step'];
  const _cp0 = lastUserText(messages).trim().toLowerCase().replace(/[.!?]+$/g, '').trim();
  if (_contWords.includes(_cp0) && messages.filter((_m) => _m && _m.role === 'user').length === 1 && env.QNFO_AUDIT) {
    try {
      const _rec = await env.QNFO_AUDIT.prepare('SELECT prompt, response, model, ts FROM ai_queries ORDER BY ts DESC LIMIT 20').all();
      const _rows = (_rec.results || []).filter((_r) => _r.prompt && !_contWords.includes(String(_r.prompt).trim().toLowerCase().replace(/[.!?]+$/g, '').trim()));
      if (_rows.length) {
        const _lines = ['RECENT QNFO ACTIVITY (most recent first, from the shared query log):'];
        _rows.slice(0, 8).forEach((_r, _i) => {
          _lines.push('[' + (_i + 1) + '] ' + String(_r.prompt).slice(0, 200) + (_r.response ? ' -> ' + String(_r.response).slice(0, 150) : ''));
        });
        messages = [{ role: 'system', content: _lines.join(String.fromCharCode(10)) }, ...messages];
      }
    } catch (_e) {}
  }

  const t0 = Date.now();
  const cls = classify(lastUserText(messages));
  // v5.2.3: code execution (run_code) requires the non-stream loop; force non-stream so a
  // run_code request is not silently dropped by the streaming branch (which can't execute code).
  const isStream = !!stream && !wantsCode;
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
  // v5.0.0: context-window-aware routing — a tier-0 target that can't hold input+output
  // escalates to a larger free model first, then DeepSeek (1M context).
  let estInputTokens = estimateInputTokens(messages);
  let target = isAuto ? contextAwareTarget(cls, autoRoute(cls), estInputTokens, max_tokens) : reqModel;
  let spec = MODELS[target];

  // v5.0.0 — vision routing: any image payload forces the vision model unless the client
  // already chose a vision-capable model. (Vision models don't do function calling, so a
  // combined image+tool request serves vision and drops tools.)
  if (hasImage && !isEnsemble) {
    const v = MODELS['llama-3.2-11b-vision'];
    if (v && (!spec || !spec.vision)) { target = 'llama-3.2-11b-vision'; spec = v; }
  }

  // v5.0.0 — tool routing: a function-calling request routes to a tool-capable model
  // (free Qwen3-30b first, then DeepSeek) so the tool request works instead of being
  // silently ignored by a non-tool-capable target.
  if ((wantsCode || (tools && tools.length)) && !isEnsemble && !hasImage && (!spec || !spec.tools)) {
    if (MODELS['qwen3-30b']?.tools) { target = 'qwen3-30b'; spec = MODELS['qwen3-30b']; }
    else { target = 'deepseek-v4-flash'; spec = MODELS['deepseek-v4-flash']; }
  }

  // v5.1.0 — auto-ensemble at system discretion: ambiguous or complex non-science/legal
  // queries (no images/tools) get the coder->validator->reviewer pipeline for free.
  // v5.2.1: exclude wantsCode so a run_code request is never hijacked by ensemble — the
  // code-execution loop must take precedence over auto-ensemble.
  const autoEnsemble = isAuto && !hasImage && !wantsCode && (!tools || !tools.length) && shouldEnsemble(cls);

  // Unknown model -> fallback to default (deepseek-v4-flash), matching v4.2.0 observed behavior
  const effective = spec ? target : 'deepseek-v4-flash';
  const effSpec = spec ? spec : MODELS['deepseek-v4-flash'];
  const routedModel = effective;

  // v5.0.0 — model-aware content normalization: vision models keep image_url parts, every
  // other model gets plain-string content (Workers AI text-generation rejects arrays).
  messages = effSpec.vision ? normalizeForVision(messages) : normalizeMessagesContent(messages);

  // v5.0.0 — resolve sampling params: client-supplied values win, else per-model defaults.
  const effTemp = Number.isFinite(temperature) ? temperature : (Number.isFinite(effSpec.temp) ? effSpec.temp : 0.7);
  const effTopP = Number.isFinite(top_p) ? top_p : (Number.isFinite(effSpec.topP) ? effSpec.topP : 0.9);

  // v5.0.0 — hard context guard: per-model window (modelCtx). If the session history
  // exceeds the routed model's window, truncate (keep system + recent). Never forward an
  // over-limit payload.
  const effMaxOut = clampTokens(max_tokens, MAX_OUT[effSpec.wa] || DEFAULT_MAX_OUT);
  const ctxBudget = modelCtx(effSpec) - effMaxOut - CTX_SAFETY_MARGIN;
  let truncation = null;
  if (estInputTokens > ctxBudget) {
    const before = messages.length;
    messages = truncateMessagesToFit(messages, ctxBudget);
    estInputTokens = estimateInputTokens(messages);
    truncation = { truncated: true, messages_before: before, messages_after: messages.length, budget_tokens: ctxBudget };
  }

  // ---- ENSEMBLE ----
  if (isEnsemble || autoEnsemble) {
    try {
      const ensResp = (content, body) => {
        const logRec = { ...mkLogRec(), model: 'ensemble', streamed: isStream ? 1 : 0, response: String(content).slice(0, 4000), prompt_tokens: estimateInputTokens(messages), completion_tokens: estimateOutputTokens(content), latency_ms: Date.now() - t0 };
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
      if (estInputTokens + clampTokens(max_tokens, MAX_OUT[ENSEMBLE.primary.wa]) > ENSEMBLE.primary.ctx - CTX_SAFETY_MARGIN) {
        const fbCap = clampTokens(max_tokens, DEFAULT_MAX_OUT);
        const fb = await callDeepSeek(env, MODELS['deepseek-v4-flash'].api, messages, fbCap, false);
        const fbContent = (fb?.choices?.[0]?.message?.content) ?? '';
        const fbText = fbContent || FALLBACK_TEXT;
        const fbOutTokens = estimateOutputTokens(fbText);
        const fbTruncated = (fbContent || '').trim().length > 0 && fbOutTokens >= fbCap;
        const fbBody = {
          id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'ensemble',
          choices: [{ index: 0, message: { role: 'assistant', content: fbText }, finish_reason: fbTruncated ? 'length' : 'stop' }],
          usage: { prompt_tokens: estimateInputTokens(messages), completion_tokens: fbOutTokens, total_tokens: estimateInputTokens(messages) + fbOutTokens },
          _router: mkRouter('deepseek-v4-flash', 'ensemble-context-fallback', {
            ensemble_members: ['fallback-deepseek'],
            verification_result: 'context_fallback',
            estimated_input_tokens: estInputTokens
          })
        };
        return ensResp(fbText, fbBody);
      }
      const ensCap = clampTokens(max_tokens, MAX_OUT[ENSEMBLE.primary.wa]);
      const ens = await runEnsemble(env, messages, ensCap);
      const ensText = (ens.text || '').trim() || FALLBACK_TEXT;
      const ensOutTokens = estimateOutputTokens(ensText);
      const ensTruncated = (ens.text || '').trim().length > 0 && ensOutTokens >= ensCap;
      const respBody = {
        id: 'chatcmpl-' + Math.random().toString(16).slice(2, 10),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'ensemble',
        choices: [{ index: 0, message: { role: 'assistant', content: ensText }, finish_reason: ensTruncated ? 'length' : 'stop' }],
        usage: { prompt_tokens: estimateInputTokens(messages), completion_tokens: ensOutTokens, total_tokens: estimateInputTokens(messages) + ensOutTokens },
        _router: mkRouter('ensemble', autoEnsemble ? 'auto' : 'ensemble', {
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
                temperature: effTemp,
                top_p: effTopP,
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
          temperature: effTemp,
          top_p: effTopP,
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
        const upstream = await callDeepSeek(env, effSpec.api, messages, max_tokens, true, tools, { temperature: effTemp, top_p: effTopP });
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
    // v5.1.0 — server-side code execution: execute run_code tool_calls in-worker and
    // re-call the model once with the results (bounded single iteration).
    let modelTools = (Array.isArray(tools) && tools.length) ? tools : null;
    if (wantsCode) {
      // v5.2.2: dedup — don't append a second run_code if the client already supplied one.
      const hasRunCode = modelTools && modelTools.some((t) => t && t.function && t.function.name === 'run_code');
      modelTools = [...(modelTools || []), ...(hasRunCode ? [] : [RUN_CODE_TOOL])];
    }

    let turn = await runModelTurn(env, effSpec, messages, max_tokens, modelTools, effTemp, effTopP);
    let content = turn.content, toolCalls = turn.toolCalls, provider = turn.provider;

    if (wantsCode && toolCalls && toolCalls.length) {
      const toolResults = await executeBuiltinTools(toolCalls);
      if (toolResults.length) {
        const assistantMsg = { role: 'assistant', content: content || '', tool_calls: toolCalls };
        const follow = await runModelTurn(env, effSpec, [...messages, assistantMsg, ...toolResults], max_tokens, null, effTemp, effTopP);
        content = follow.content || content;
        toolCalls = null;
        provider = follow.provider;
      }
    }

    if (!content && !toolCalls) content = FALLBACK_TEXT;

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
        temperature: effTemp,
        top_p: effTopP,
        ...(hasImage ? { vision: true } : {}),
        ...(tools && tools.length ? { tools: true } : {}),
        ...(wantsCode ? { code_execution: true } : {}),
        ...(truncation ? { truncation } : {}),
      }),
      ...(webSources ? { _web: { query: lastUserText(messages).slice(0, 300), sources: webSources } } : {}),
    };
    const logRec = { ...mkLogRec(), streamed: 0, response: content.slice(0, 4000), prompt_tokens: estimateInputTokens(messages), completion_tokens: estimateOutputTokens(content), latency_ms: Date.now() - t0 };
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
        capabilities: ['model-router', 'ai-inference', 'streaming', 'ensemble', 'pinned-models', 'internal-rag', 'query-logging', 'history-search', 'vision', 'function-calling', 'context-aware-routing'],
        routes: ROUTES,
        bindings: {
          ai: !!env.AI,
          deepseek_key: !!env.DEEPSEEK_API_KEY,
          cf_token: !!env.CF_API_TOKEN,
          auth: !!env.ROUTER_AUTH_KEY,
          paper_vz: !!env.PAPER_VZ,
          notes_vz: !!env.NOTES_VZ,
          tasks_vz: !!env.TASKS_VZ,
          handoffs_vz: !!env.HANDOFFS_VZ,
          ipatent_vz: !!env.IPATENT_VZ,
          infra_vz: !!env.INFRA_VZ,
          cloud_ops_vz: !!env.CLOUD_OPS_VZ,
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
          ctx: m.ctx || null,
          temperature: m.temp ?? null,
          top_p: m.topP ?? null,
          vision: !!m.vision,
          tools: !!m.tools,
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

    // /v1/search — unified QNFO RAG: search ALL bound QNFO Vectorize indexes directly
    // (papers, notes, tasks, handoffs, log, ipatent, infra, cloud-ops). Personal data
    // lives on the personal-api endpoint, never here (separation mandate).
    // v5.2.1: auth-gated — the unified search now surfaces past query/response content.
    if (path === '/v1/search' && method === 'GET') {
      const authH = request.headers.get('Authorization') || '';
      if (!await authOk(authH, env)) return json({ error: 'Unauthorized' }, 401);
      const q = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
      const k = Math.min(Math.max(parseInt(url.searchParams.get('k') || '5', 10) || 5, 1), 20);
      if (!q) return json({ error: 'Missing q parameter' }, 400);
      if (!env.AI) return json({ error: 'AI binding not configured' }, 503);
      if (!QNFO_INDEXES.some((b) => env[b])) return json({ error: 'no QNFO Vectorize binding configured' }, 501);
      try {
        const out = await searchQnfoIndexes(env, q, k);
        if (out.error) return json({ error: out.error }, 502);
        const flat = [];
        for (const [b, rows] of Object.entries(out.sources || {})) {
          for (const r of rows) flat.push({ index: b, ...(r.id !== undefined ? { id: r.id } : {}), ...(r.score !== undefined ? { score: r.score } : {}), ...(r.metadata ? { metadata: r.metadata } : {}), ...(r.error ? { error: r.error } : {}) });
        }
        return json({ query: q, count: out.total, results: flat, sources: out.sources });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // /v1/history — query log from D1 qnfo-audit.ai_queries (QNFO_AUDIT binding)
    // v5.2.1: auth-gated — exposes past user prompts + responses.
    if (path === '/v1/history' && method === 'GET') {
      const authH = request.headers.get('Authorization') || '';
      if (!await authOk(authH, env)) return json({ error: 'Unauthorized' }, 401);
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
    // v5.2.2: auth-gated — exposes federated QNFO records (papers, KG, notes, tasks, emails).
    if (path === '/v1/records' && method === 'GET') {
      const authH = request.headers.get('Authorization') || '';
      if (!await authOk(authH, env)) return json({ error: 'Unauthorized' }, 401);
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
    // v5.2.2: auth-gated — exposes rendered QNFO context (papers, KG, notes, tasks, emails).
    if (path === '/v1/context' && method === 'GET') {
      const authH = request.headers.get('Authorization') || '';
      if (!await authOk(authH, env)) return json({ error: 'Unauthorized' }, 401);
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
