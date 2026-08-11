// qnfo-ai v4.3.0 — Model Router + Ensemble + Auto-Routing
// Reconstructed 2026-08-11 from live API contract after WORKER-THIN-CLIENT-1 remediation.
// ROOT-CAUSE FIX: v4.2.0 had NO [[ai]] binding -> env.AI undefined -> tier-0 free models
// returned "All models failed." while DeepSeek API (secret) worked. v4.3.0 declares the
// AI binding in wrangler.toml and routes tier-0 through env.AI.run() (Workers AI FREE).
// Ensemble directive: primary coder + validator + reviewer, all Workers AI free models.

const VERSION = '4.3.0';
const ROUTES = ['/health', '/v1/chat/completions', '/v1/models', '/v1/models/:id', '/v1/responses', '/chat/completions', '/v1/search', '/v1/history'];
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const GW_COMPAT = 'https://gateway.ai.cloudflare.com/v1/edb167b78c9fb901ea5bca3ce58ccc4b/default/compat/chat/completions';

// ---------------- Model Registry ----------------
// tier 0 = Workers AI FREE (no key, edge GPU)
// tier 1/2 = DeepSeek API (DEEPSEEK_API_KEY secret)
// tier 3 = Anthropic/OpenAI via AI Gateway compat (CF_API_TOKEN secret)
const MODELS = {
  // Workers AI free — original three
  'llama-3.3-70b':            { tier: 0, family: 'meta',     wa: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',   reasoning: false },
  'deepseek-r1-qwen-32b':     { tier: 0, family: 'deepseek', wa: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', reasoning: true },
  'qwen3-30b':                { tier: 0, family: 'qwen',     wa: '@cf/qwen/qwen3-30b-a3b-fp8',                  reasoning: false },
  // Workers AI free — directive substitutes (small coder/validator/reviewer class)
  'qwen2.5-coder-32b':        { tier: 0, family: 'qwen',     wa: '@cf/qwen/qwen2.5-coder-32b-instruct',         reasoning: false },
  'llama-3.2-1b':             { tier: 0, family: 'meta',     wa: '@cf/meta/llama-3.2-1b-instruct',              reasoning: false },
  'gemma-2b':                 { tier: 0, family: 'google',   wa: '@cf/google/gemma-2b-it-lora',                 reasoning: false },
  'granite-h-micro':          { tier: 0, family: 'ibm',      wa: '@cf/ibm-granite/granite-4.0-h-micro',         reasoning: false },
  // DeepSeek API
  'deepseek-v4-flash':        { tier: 1, family: 'deepseek', api: 'deepseek-chat' },
  'deepseek-v4-flash-thinking': { tier: 1, family: 'deepseek', api: 'deepseek-reasoner' },
  'deepseek-v4-pro':          { tier: 2, family: 'deepseek', api: 'deepseek-chat' },
  // Tier-3 via AI Gateway
  'claude-sonnet-5':          { tier: 3, family: 'anthropic', gateway: true, model: 'claude-sonnet-5' },
  'claude-opus-5':            { tier: 3, family: 'anthropic', gateway: true, model: 'claude-opus-5' },
  'claude-fable-5':           { tier: 3, family: 'anthropic', gateway: true, model: 'claude-fable-5' },
  'gpt-5-2':                  { tier: 3, family: 'openai',    gateway: true, model: 'gpt-5-2' },
};

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
    max_tokens: maxTokens || 2048,
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
    if (result.choices[0].message && typeof result.choices[0].message.content === 'string') return result.choices[0].message.content;
    if (typeof result.choices[0].text === 'string') return result.choices[0].text;
  }
  if (result.result && typeof result.result === 'object') return extractWAContent(result.result, depth + 1);
  return '';
}

async function callDeepSeek(env, apiModel, messages, maxTokens, stream) {
  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: apiModel, messages, max_tokens: maxTokens || 4096, stream: stream || false }),
  });
  if (!resp.ok) throw new Error(`deepseek ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  if (stream) return resp;
  return resp.json();
}

async function callGateway(env, model, messages, maxTokens, stream) {
  const resp = await fetch(GW_COMPAT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.CF_API_TOKEN}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens || 4096, stream: stream || false }),
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
  // Auth gate
  const expected = env.ROUTER_AUTH_KEY;
  if (!authHeader || authHeader !== `Bearer ${expected}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { model, messages, max_tokens, stream, temperature } = body || {};
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
  const target = isAuto ? autoRoute(cls) : reqModel;
  const spec = MODELS[target];

  // Unknown model -> fallback to default (deepseek-v4-flash), matching v4.2.0 observed behavior
  const effective = spec ? target : 'deepseek-v4-flash';
  const effSpec = spec ? spec : MODELS['deepseek-v4-flash'];
  const routedModel = effective;

  // ---- ENSEMBLE ----
  if (isEnsemble) {
    try {
      const ens = await runEnsemble(env, messages, max_tokens || 2048);
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
        // Workers AI streaming
        const aiResp = await env.AI.run(effSpec.wa, {
          messages,
          max_tokens: max_tokens || 2048,
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

    // /v1/responses — DeepChat compat (passthrough to chat)
    if (path === '/v1/responses' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
      const auth = request.headers.get('Authorization') || '';
      if (!body.model || !body.input) return json({ error: 'model and input required' }, 400);
      const chatBody = { model: body.model, messages: Array.isArray(body.input) ? body.input : [{ role: 'user', content: String(body.input) }], max_tokens: body.max_output_tokens, stream: body.stream };
      return handleChat(env, chatBody, auth);
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
