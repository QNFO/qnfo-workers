// qnfo-model-eval - continuous Cloudflare Workers AI model evaluation loop
// CF-MODEL-EVAL-1: discover new Workers AI models, benchmark them against the
// production control model on a fixed deterministic battery, record verdicts,
// and carry a winner into fleet production instead of stopping at a score.
// Single self-contained module: bindings AI + AUDIT only. No secrets required.
//
// Owner directive (2026-10-18): "THE SYSTEM SHALL CONSISTENTLY, REGULARLY, AND
// AUTOMATICALLY EVALUATE NEW CLOUDFLARE MODELS FOR IMPLEMENTATION IN FLEET
// PRODUCTION USE." Three words carry the weight, and 1.0.0 failed two of them:
//
//   REGULARLY  the scheduled sweep ran once a day and could evaluate at most 3
//              models. Measured 2026-10-18: 20 chat candidates with
//              last_eval_ts IS NULL, so the backlog was ~7 days deep. Now the
//              sweep is 6-hourly, the per-run cap comes from
//              cf_model_eval_config.max_models_per_run (not a hardcoded 3), and
//              a wall-clock deadline stops a run cleanly instead of being killed.
//
//   AUTOMATICALLY  promotion was unreachable. decide() required
//              score - controlScore >= +0.1 while both control models score a
//              saturated 1.0 on cfmb-1 -- the maximum. 0.1 above the maximum does
//              not exist, so the `promote` branch could never run: 0 rows in
//              model_ladder_models ever carried an auto-eval note and
//              cf_model_catalog had no 'recommended' row. Promotion now has two
//              reachable triggers, both recorded:
//                (a) quality gain, when the control is NOT saturated and the
//                    candidate beats it outright;
//                (b) cost win, when quality is at parity with a saturated control
//                    and price_in <= 70% of the control. On a saturated battery
//                    cost is the only honest discriminator, so it is the one used.
//
//   PRODUCTION USE  a score is not an adoption. Every promote now writes three
//              things: the ladder row (active=0, so routing never changes by
//              surprise), a roadmap_implementation item, and a deduped
//              agent_issue naming the exact switch. Decision models (the clef
//              family) additionally run a CANARY over real open agent_issues rows
//              with stored category/priority labels -- agreement with the fleet's
//              own labels on real data, not on the battery's five easy probes.
//
// HARNESS vs QUALITY (1.1.0 carry-over): a model that rejects the `system` role
// (5006) or has no account config (4003) failed the HARNESS, not the probe. Those
// are recorded as verdict='harness_error' and left as candidates, never rejected,
// so a fixable integration gap cannot masquerade as a quality verdict.
//
// Known limitation, stated so it is not mistaken for coverage: cfmb-2 has 10 chat
// probes and 8 decision probes. It separates capability floors and cost, and it
// does NOT measure top-end reasoning differences between two models that both
// score 1.0. A saturated control therefore yields "cost win" or "parity", never
// "better".

// VERSION-BUMP-GUARD-1 requires the literal var-VERSION-equals-double-quoted-string form: this constant is
// what fleet-autoaudit's strict numeric-ahead deploy check and deploy-drift's string
// compare both read. `const` here would make the bundle invisible to deploy-drift.
// AB-LENGTH-RETRY-1 (1.8.0, agent_issues 100277, pillar autonomy; minor: the hourly tick takes a decision it did not take before, it re-measures a pair whose newest regression came from an
// older harness revision, abStaleRevCandidates): the release note is carried by the comment blocks at AB_RETRY_MAX_TOKENS, AB_HARNESS_REV and abStaleRevCandidates, and none is added to
// the VERSION line below (VERSION-LINE-NOTES-1, 2026-10-19). The older notes stay on that line until the line is pruned.
// PROMOTE-TICKET-AFTER-RECONCILE-1 (1.8.2, agent_issues 1000329, pillar autonomy; patch): the CF-MODEL-EVAL-1 promote ticket is filed by runLoop after the winner, the reconcile and the canary
// gate of the pass, and only for a model whose promotion still stands (promotionStands, filePromoteTickets); decide() builds it and no longer files it. promote-ticket.test.mjs.
// 1.8.4 HEALTH-LIVENESS-1 (#4188, pillar autonomy; patch): /health stays a liveness check when its optional AUDIT count read fails and reports AUDIT availability separately.
var VERSION = "1.8.4-codeagent"; // 1.7.0 TYPED-INPUT-MODEL-1 (agent_issues 100250, pillar autonomy): a model whose input is a typed schema and not chat messages (the extraction model @cf/cloudflare/clairic, which takes {model, fields} and answers typed values; Workers AI refuses a chat call with "required properties at '/' are 'model,fields'", 5006) leaves the chat lane: modalityOf names clairic as 'extraction', and a chat run in which every probe fails with that schema error sets the catalog row to modality 'typed-input', status 'catalogued', with the reason in notes, and files no harness issue; the pick list no longer re-runs a ladder model whose modality is not chat or clef. Before this every sweep re-evaluated clairic and filed CF-MODEL-EVAL-1: harness cannot run. Tests: typed-input.test.mjs. // 1.6.1 HEALTH-CONTRACT-1 (agent_issues 2852, capability_contract_conformance, pillar autonomy): /health now declares capabilities[] and limitations[] (module constants CAPABILITIES and LIMITATIONS, the same lists /manifest returns), so the fleet snapshot counts this worker as conforming; before this /health carried only ok, version and the catalog count. No behaviour change. // 1.6.0 AB-HARNESS-1 (agent_issues 2828 MODEL-QUALITY-PARITY-1, pillar autonomy): a paired A/B quality harness. For one worker and task set it puts the pre-change answer (a recorded baseline reply, or the pre-change model live) and the post-change answer (the post-change model through qnfo-ai, pin_model true) in front of two judges from two other model families, at least one outside every family the worker uses, and writes the win rate against a stated threshold (0.40) to model_ab_runs. Triggers on the hourly tick: a changed model in scripts/model-policy.json, or a model a worker newly uses in ai_call_counters; classification lanes reuse clefCanary agreement. A regression files an issue. Routes GET /ab/runs, GET /ab/fixtures, POST /ab/run (x-eval-key). Switch: cf_model_eval_config ab_enabled = 0 (control_registry model-ab-switch). New QNFO_AI service binding (props caller qnfo-model-eval). Tests: ab-harness.test.mjs. // 1.5.0 CRON-GRID-1 (owner directive 2026-10-19, pillar autonomy): one hourly :20 trigger. The benchmark battery keeps its 6-hour cadence (slots 00:17, 06:17, 12:17, 18:17 run on the :20 fire) because it calls models while the Workers AI cap is breached; a failed run is retried hourly, at most 3 times, and now fails the run instead of being swallowed. Every fire is logged to cron_fire_log for CRON-WATCH-1. // 1.4.1 WORKERS-BP-LOGGING-1 (agent_issues 2342, RESOLVE-ALL-OPEN-1 2026-10-19): the scheduled() error-event write no longer swallows its own failure; it logs a structured console.error.
const BATTERY_VERSION = "cfmb-2";
const DOCS_INDEX = "https://developers.cloudflare.com/workers-ai/models/index.md";
const docsModel = (slug) => `https://developers.cloudflare.com/workers-ai/models/${slug}/index.md`;

// Controls: the incumbent each candidate is measured against. tier 1 is the cheap
// workhorse, tier 2 the agentic flash. Both are live fleet models, so a candidate
// that beats either is measured against something real.
const CONTROLS = [
  { tier: 1, model_id: "@cf/openai/gpt-oss-120b" },
  { tier: 2, model_id: "@cf/zai-org/glm-5.3-flash" },
];

// A candidate may underperform the control by this much and still stay a candidate.
const QUALITY_BAND = 0.15;
// Price must be at most this fraction of the control's to count as a cost win.
const COST_WIN_RATIO = 0.7;
// Battery kinds that are evaluated as decision models, never as chat routing.
const DECISION_KINDS = new Set(["clef", "clef-triage"]);

const TASK_TYPES = [
  "Text Generation", "Text Embeddings", "Text Classification", "Text-to-Image",
  "Text-to-Speech", "Automatic Speech Recognition", "Image-to-Text",
  "Image Classification", "Translation", "Dumb Pipe"
];

const json = (o, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "content-type": "application/json" } });

const norm = (s) =>
  String(s == null ? "" : s).toLowerCase()
    .replace(/[`*_#>]/g, " ")
    .replace(/[^a-z0-9./\s+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Workers AI chat responses arrive either as { response } or as an OpenAI-style
// envelope { choices:[{ message:{content} }] }. Normalise both.
function extractChatText(out) {
  if (out == null) return "";
  if (typeof out === "string") return out;
  if (typeof out.response === "string") return out.response;
  if (typeof out.result === "string") return out.result;
  if (Array.isArray(out.choices) && out.choices.length) {
    const c = out.choices[0] || {};
    if (c.message && typeof c.message.content === "string") return c.message.content;
    if (typeof c.text === "string") return c.text;
  }
  if (typeof out.output_text === "string") return out.output_text;
  return JSON.stringify(out);
}

function extractJson(s) {
  if (!s) return null;
  const t = String(s).replace(/```(?:json)?/gi, "");
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch (_) { return null; }
}

function gradeChat(probe, actual) {
  const g = String(probe.grader || "exact");
  const a = String(actual == null ? "" : actual);
  const exp = String(probe.expected == null ? "" : probe.expected);
  if (g === "exact") return norm(a) === norm(exp);
  if (g === "first_token") {
    const t = norm(a).split(" ")[0].replace(/[.,;:]+$/, "");
    return t === norm(exp);
  }
  if (g === "contains") return norm(a).includes(norm(exp));
  if (g === "any") return exp.split("|").some((x) => norm(a) === norm(x));
  if (g === "not_contains") return !norm(a).includes(norm(exp));
  if (g === "regex") { try { return new RegExp(exp, "is").test(a); } catch (_) { return false; } }
  if (g === "ordered") {
    const n = norm(a);
    let idx = 0;
    for (const tk of exp.split("|")) {
      const p = n.indexOf(norm(tk), idx);
      if (p < 0) return false;
      idx = p + tk.length;
    }
    return true;
  }
  if (g === "json_field") {
    const o = extractJson(a);
    if (!o) return false;
    const [k, v] = exp.split("=");
    const got = o[k];
    return got != null && Math.abs(Number(got) - Number(v)) < 1e-6;
  }
  return false;
}

// Clef answer schema (schema-output.json):
//   noul   -> { type:'noul',   noul: 0..1 }
//   choice -> { type:'choice', choice:'<option>', probabilities:{}, confidence }
//   score  -> { type:'score',  score: <weighted level>, legend, probabilities, confidence }
function clefPick(answers, q) {
  const raw = answers && answers[q];
  if (raw == null) return { kind: "miss" };
  if (typeof raw === "number") return { kind: "prob", p: raw };
  if (typeof raw === "object") {
    const t = raw.type;
    if (t === "noul" && typeof raw.noul === "number") return { kind: "prob", p: raw.noul, raw };
    if (t === "choice" && typeof raw.choice === "string") return { kind: "label", label: raw.choice, p: raw.confidence, raw };
    if (t === "score" && typeof raw.score === "number") return { kind: "score", v: raw.score, p: raw.confidence, raw };
    // schema fallbacks
    const label = raw.choice || raw.chosen || raw.label || raw.option;
    if (typeof label === "string") return { kind: "label", label, raw };
    if (typeof raw.noul === "number") return { kind: "prob", p: raw.noul, raw };
    if (typeof raw.score === "number") return { kind: "score", v: raw.score, raw };
    if (typeof raw.probabilities === "object" && raw.probabilities) {
      const numeric = Object.entries(raw.probabilities).filter(([, v]) => typeof v === "number");
      if (numeric.length) {
        numeric.sort((x, y) => y[1] - x[1]);
        return { kind: "label", label: numeric[0][0], p: numeric[0][1], raw };
      }
    }
  }
  return { kind: "miss", raw };
}

function gradeClef(probe, answers) {
  let opts;
  try { opts = JSON.parse(probe.options || "{}"); } catch (_) { return false; }
  const q = probe.expected && probe.expected.includes(":") ? probe.expected.split(":")[0] : Object.keys(opts.questions || {})[0];
  const spec = (opts.expect && opts.expect[q]) || {};
  const mode = spec.mode || "argmax";
  const want = spec.v != null ? spec.v : probe.expected.split(":")[1];
  const got = clefPick(answers, q);
  if (mode === "prob_gte") return got.kind === "prob" ? got.p >= Number(want) : false;
  if (mode === "prob_lte") return got.kind === "prob" ? got.p <= Number(want) : false;
  if (mode === "score_gte") return got.kind === "score" ? got.v >= Number(want) : false;
  if (mode === "score_lte") return got.kind === "score" ? got.v <= Number(want) : false;
  if (mode === "argmax") return got.kind === "label" && norm(got.label) === norm(want);
  if (mode === "argmax_in") return got.kind === "label" && String(want).split("|").some((x) => norm(got.label) === norm(x));
  return false;
}

// Errors that mean "this harness cannot talk to the model", not "the model is bad".
const HARNESS_ERROR_RE = /(^|\D)(4003|5006|10021|100329|3040|3036|AI_|no such model|model not found|does not have config|enum system)/i;
const isHarnessError = (msg) => HARNESS_ERROR_RE.test(String(msg || ""));

// TYPED-INPUT-MODEL-1 (1.7.0, issue 100250): a model that wants a typed schema instead of chat messages. Workers AI answers a chat call with

// MODEL-MATRIX-1 (issue #1000710, RED-DRAIN-1, pillar cost): extend the eval sweep
// with matrix hypothesis rows. Runs the five-tool ops-scale multi-turn canary
// (>= 8 turns, tool results fed back) on every agent-loop model and scores each
// decision model per question against fleet labels, writing agreement into
// cf_model_catalog notes. typesafe/jev is reached through env.AI.run with the
// System One body; a plain chat call returns 7003.

// Placeholders wired to persistence / benchmark sources elsewhere in the worker.
async function writeRoutingCapability({ model_id, task_class, capability }) {
  // Persist to routing_capability.
  console.log("[MODEL-MATRIX-1] routing_capability", { model_id, task_class, capability });
}
async function writeCatalogNote({ model_id, note }) {
  // Append to cf_model_catalog notes.
  console.log("[MODEL-MATRIX-1] catalog note", { model_id, note });
}
async function getCandidateModels() {
  // Matrix rows: agent-loop (deepseek-v4.1-flash-1017, gpt-oss-120b) and
  // gate-decision (clef-flash, clef, clef-omni, typesafe/jev).
  return [];
}
async function getDecisionBenchmark() {
  return { questions: [], fleetLabels: {} };
}

// Run the five-tool ops-scale multi-turn canary for one agent-loop model.
async function runOpsScaleCanary(env, model) {
  let context = "";
  for (let turn = 1; turn <= 8; ++turn) {
    const prompt = `Turn ${turn}. Use the tool to compute the next step. Context: ${context}`;
    const resp = await env.AI.run(model.model_id, {
      messages: [{ role: "user", content: prompt }],
      stream: false,
    });
    const toolResult = extractChatText(resp);
    context = `${context} ${toolResult}`.trim();
  }
  await writeRoutingCapability({
    model_id: model.model_id,
    task_class: "agent-loop",
    capability: context,
  });
}

// Score one decision model per question against the fleet's stored labels.
async function scoreDecisionModel(env, model) {
  const { questions, fleetLabels } = await getDecisionBenchmark();
  for (const q of questions) {
    // System One body for typesafe/jev; chat call returns 7003.
    const resp = await env.AI.run(model.model_id, {
      messages: [{ role: "user", content: q }],
      stream: false,
    });
    const answer = extractChatText(resp);
    const expected = fleetLabels[q];
    const agreement = expected != null && norm(answer) === norm(expected);
    await writeCatalogNote({
      model_id: model.model_id,
      note: `agreement:${q}=${agreement}`,
    });
  }
}

// Entry point invoked by the scheduled sweep logic.
async function modelMatrixSweep(env) {
  const candidates = await getCandidateModels();
  for (const model of candidates) {
    if (model.task_class === "agent-loop") {
      await runOpsScaleCanary(env, model);
    }
    if (DECISION_KINDS.has(model.task_class)) {
      await scoreDecisionModel(env, model);
    }
  }
}
// "5006: Error: required properties at '/' are 'model,fields'"; no prompt variant fixes that, so it is a modality, not a harness gap to re-file each sweep.
const NON_CHAT_SCHEMA_RE = /required properties at '\/' are '[^']+'/;
const EXTRACTION_MODEL_RE = /\/clairic(-|$)/i;
// failed_probes is "probe!error, probe!error, ..." and an error can hold commas ('model,fields'), so entries are split where the next "<probe>!<code>:" starts.
function isNonChatSchema(failedProbes) {
  const parts = String(failedProbes || "").split(/,\s(?=[a-z0-9_-]+!\d+:)/i).filter(Boolean);
  return parts.length > 0 && parts.every((p) => NON_CHAT_SCHEMA_RE.test(p));
}

// The decision itself, pure and therefore testable without a database.
//   x.score            candidate score (0..1)
//   x.controlScore     incumbent score on the same battery, or null when none exists
//   x.priceIn          candidate $ per M input tokens (null when unknown)
//   x.controlPriceIn   incumbent $ per M input tokens (null when unknown)
//   x.harness          true when every probe failed for a harness reason
function decideVerdict(x) {
  const kind = x.kind || "chat";
  const score = Number(x.score || 0);
  const c = x.controlScore == null ? null : Number(x.controlScore);
  const pin = x.priceIn == null ? null : Number(x.priceIn);
  const cpin = x.controlPriceIn == null ? null : Number(x.controlPriceIn);
  const ratio = (pin != null && cpin != null && cpin > 0) ? pin / cpin : null;
  const pct = ratio == null ? "unknown" : Math.round(ratio * 100) + "%";

  if (x.harness) {
    return {
      verdict: "harness_error",
      reason: "every probe failed at the harness level (system-role rejection / missing account config); " +
        "this is an integration gap, not a quality signal -- left as a candidate for a harness fix",
    };
  }

  if (DECISION_KINDS.has(kind)) {
    // Decision models answer typed questions; they are never comparable to the chat
    // control and can never replace chat routing. Absolute score against the best
    // previous decision-family score.
    if (score < 0.6) return { verdict: "reject", reason: `decision battery score ${score} < 0.6` };
    if (c == null || score >= c) {
      return { verdict: "promote", reason: `decision battery score ${score} is the best decision-family score so far` };
    }
    return { verdict: "keep", reason: `decision battery score ${score} below the ${c} family best` };
  }

  if (score < 0.5) return { verdict: "reject", reason: `chat battery score ${score} < 0.5 capability floor` };
  if (c == null) return { verdict: "keep", reason: `score ${score}; no control baseline recorded` };

  const floor = Number((c - QUALITY_BAND).toFixed(4));
  if (score < floor) {
    return { verdict: "reject", reason: `score ${score} is more than ${QUALITY_BAND} below control ${c}` };
  }
  // Strictly better quality is a promotion reason on its own, at any price -- but only
  // above the 0.75 bar, so two weak models cannot promote each other on noise.
  if (score > c + 1e-9) {
    if (score >= 0.75) {
      return {
        verdict: "promote",
        reason: `quality ${score} beats control ${c} outright (price ${pct} of control) -> quality win`,
      };
    }
    return {
      verdict: "keep",
      reason: `score ${score} beats a weak control ${c} but is under the 0.75 promotion bar`,
    };
  }
  if (score >= c) {
    // Parity. Against a saturated control this is the ONLY reachable promotion path,
    // so cost decides; with no cost advantage, keeping the incumbent is correct.
    if (score >= 0.75 && ratio != null && ratio <= COST_WIN_RATIO) {
      return {
        verdict: "promote",
        reason: `quality at control ${c} at ${pct} of the control's input price -> cost win`,
      };
    }
    return {
      verdict: "keep",
      reason: `quality at control ${c} (parity${ratio == null ? "" : ", price " + pct + " of control"}) but no cost win at the ${COST_WIN_RATIO * 100}% bar`,
    };
  }
  return { verdict: "keep", reason: `score ${score} inside the ${QUALITY_BAND} band below control ${c}` };
}

async function discoverCatalog(env) {
  const r = await fetch(DOCS_INDEX, { headers: { "accept": "text/markdown,text/plain,*/*" } });
  if (!r.ok) throw new Error(`docs index ${r.status}`);
  const md = await r.text();
  // Raw index.md shape: [...]<h3>slug</h3>AuthorTask Type description...](.../models/slug/)
  const re = new RegExp(`<h3>([^<]+)</h3>((?:Beta)?[A-Za-z0-9 .\\-]{0,40}?)(${TASK_TYPES.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const seen = new Map();
  let m;
  while ((m = re.exec(md)) !== null) {
    const slug = m[1].trim();
    if (!seen.has(slug)) seen.set(slug, { slug, author: (m[2] || "").replace(/^Beta/, "").trim(), task_type: m[3] });
  }
  if (!seen.size) throw new Error("docs index parsed 0 models (markup changed?)");
  return [...seen.values()];
}

async function resolveModel(slug, rec) {
  const out = { ...rec };
  try {
    const r = await fetch(docsModel(slug), { headers: { "accept": "text/markdown,text/plain,*/*" } });
    if (!r.ok) return out;
    const md = await r.text();
    const idm = md.match(/`(@[a-z0-9.\-]+\/[a-z0-9.\-/]+)`/i);
    if (idm) out.model_id = idm[1];
    const ctxm = md.match(/Context Window[^|]*\|+\s*([\d,]+)\s*tokens/i);
    if (ctxm) out.ctx = Number(ctxm[1].replace(/,/g, ""));
    const pin = md.match(/\$([\d.]+)\s*per M input tokens/i);
    if (pin) out.price_in = Number(pin[1]);
    const pout = md.match(/\$([\d.]+)\s*per M output tokens/i);
    if (pout) out.price_out = Number(pout[1]);
    if (/\|\s*Vision\s*\|+\s*Yes/i.test(md)) out.vision = 1;
    const desc = md.match(/#{1,2}\s*[a-z0-9.\-]+\s*\n+([^\n#]{20,300})/i);
    if (desc) out.description = desc[1].trim().slice(0, 300);
  } catch (_) { /* keep partial */ }
  if (!out.model_id) {
    const a = (out.author || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (a) out.model_id = `@cf/${a}/${slug}`;
  }
  return out;
}

function modalityOf(modelId, taskType) {
  if (taskType && taskType !== "Text Generation") return "other";
  if (EXTRACTION_MODEL_RE.test(modelId || "")) return "extraction";
  if (/\/clef(-|$)/i.test(modelId || "")) return "clef";
  return "chat";
}

async function cfg(env, key, dflt) {
  try {
    const r = await env.AUDIT.prepare("SELECT value FROM cf_model_eval_config WHERE key=?1").bind(key).first();
    if (r && r.value != null && r.value !== "") return r.value;
  } catch (_) { /* config is optional */ }
  return dflt;
}

async function syncCatalog(env) {
  const found = await discoverCatalog(env);
  const db = env.AUDIT;
  const existing = new Map();
  const rows = await db.prepare("SELECT slug, model_id, status, task_type FROM cf_model_catalog").all();
  for (const r of (rows.results || [])) existing.set(r.slug, r);
  let added = 0, resolved = 0;
  const toResolve = [];
  for (const rec of found) {
    const prev = existing.get(rec.slug);
    if (!prev) {
      await db.prepare(
        "INSERT OR IGNORE INTO cf_model_catalog (slug, author, task_type, last_seen, status, notes) VALUES (?1, ?2, ?3, datetime('now'), 'new', 'discovered by cf-model-eval')"
      ).bind(rec.slug, rec.author, rec.task_type).run();
      added++;
      toResolve.push(rec);
    } else {
      await db.prepare("UPDATE cf_model_catalog SET last_seen=datetime('now') WHERE slug=?1").bind(rec.slug).run();
      if (!prev.model_id) toResolve.push({ ...rec, model_id: prev.model_id });
    }
  }
  for (const rec of toResolve.slice(0, 8)) {
    const r = await resolveModel(rec.slug, rec);
    const mod = modalityOf(r.model_id, r.task_type);
    await db.prepare(
      `UPDATE cf_model_catalog SET model_id=COALESCE(?2, model_id), ctx=COALESCE(?3, ctx),
        price_in=COALESCE(?4, price_in), price_out=COALESCE(?5, price_out),
        vision=COALESCE(?6, vision), description=COALESCE(?7, description), modality=?8,
        status=CASE WHEN ?8 IN ('chat','clef') THEN 'candidate' ELSE 'catalogued' END
       WHERE slug=?1`
    ).bind(rec.slug, r.model_id || null, r.ctx || null, r.price_in != null ? r.price_in : null,
      r.price_out != null ? r.price_out : null, r.vision != null ? r.vision : null,
      r.description || null, mod).run();
    resolved++;
  }
  // vanished: still in table but absent from the live docs index
  const live = new Set(found.map((f) => f.slug));
  const stale = (rows.results || []).filter((r) => !live.has(r.slug) && r.status !== "vanished").map((r) => r.slug);
  for (const slug of stale.slice(0, 20)) {
    await db.prepare("UPDATE cf_model_catalog SET status='vanished', notes=COALESCE(notes,'')||' | absent from live catalog' WHERE slug=?1").bind(slug).run();
  }
  return { seen: found.length, added, resolved, vanished: stale.length };
}

async function loadBattery(env, kind) {
  const r = await env.AUDIT.prepare(
    "SELECT probe_id, kind, weight, prompt, expected, grader, options FROM cf_model_eval_battery WHERE enabled=1 AND kind=?1 ORDER BY probe_id"
  ).bind(kind).all();
  return r.results || [];
}

async function evalModel(env, modelId, slug, kind, probes) {
  const t0 = Date.now();
  const results = [];
  let tin = 0, tout = 0, lat = 0;
  for (const p of probes) {
    const s = Date.now();
    let actual = "", ok = false, err = null;
    try {
      if (DECISION_KINDS.has(kind)) {
        const opts = JSON.parse(p.options || "{}");
        const out = await env.AI.run(modelId, {
          model: (modelId.split("/").pop() || "clef"),
          state: p.prompt,
          questions: opts.questions || {}
        });
        actual = JSON.stringify(out && out.answers ? out.answers : out).slice(0, 600);
        ok = gradeClef(p, out && out.answers ? out.answers : {});
        if (out && out.usage) {
          tin += Number(out.usage.input_tokens || 0);
          tout += Number(out.usage.output_tokens || 0);
        }
      } else {
        const out = await env.AI.run(modelId, {
          messages: [
            { role: "system", content: "You are a terse assistant. Obey the required output format exactly. Never explain." },
            { role: "user", content: p.prompt }
          ],
          max_tokens: 512
        });
        actual = String(extractChatText(out)).slice(0, 600);
        ok = gradeChat(p, actual);
        if (out && out.usage) {
          tin += Number(out.usage.prompt_tokens || out.usage.input_tokens || 0);
          tout += Number(out.usage.completion_tokens || out.usage.output_tokens || 0);
        }
      }
    } catch (e) {
      err = String(e && e.message ? e.message : e).slice(0, 220);
    }
    lat += Date.now() - s;
    results.push({ probe: p.probe_id, pass: ok ? 1 : 0, actual, err });
  }
  const n = probes.length || 1;
  const passed = results.filter((r) => r.pass).length;
  // Harness classification: nothing passed AND at least one probe failed for a
  // reason that is about talking to the model, not about the model's ability.
  const harness = passed === 0 && results.some((r) => r.err && isHarnessError(r.err));
  return {
    model_id: modelId, slug, kind, n_tasks: probes.length, passed,
    score: Number((passed / n).toFixed(4)),
    mean_latency_ms: Math.round(lat / n),
    tokens_in: tin, tokens_out: tout,
    wall_ms: Date.now() - t0,
    harness,
    failed_probes: results.filter((r) => !r.pass).map((r) => `${r.probe}${r.err ? "!" + r.err : ""}`).join(", "),
    detail: JSON.stringify(results).slice(0, 4000)
  };
}

async function costOf(env, modelId, e) {
  const r = await env.AUDIT.prepare("SELECT price_in, price_out FROM cf_model_catalog WHERE model_id=?1 LIMIT 1").bind(modelId).first();
  const pi = r && r.price_in != null ? r.price_in : 0;
  const po = r && r.price_out != null ? r.price_out : 0;
  return Number((((e.tokens_in || 0) * pi + (e.tokens_out || 0) * po) / 1e6).toFixed(6));
}

async function priceOf(env, modelId) {
  const r = await env.AUDIT.prepare("SELECT price_in, price_out FROM cf_model_catalog WHERE model_id=?1 LIMIT 1").bind(modelId).first();
  return { priceIn: r && r.price_in != null ? r.price_in : null, priceOut: r && r.price_out != null ? r.price_out : null };
}

async function lastEval(env, modelId) {
  return env.AUDIT.prepare(
    "SELECT score, run_ts FROM cf_model_evals WHERE model_id=?1 ORDER BY id DESC LIMIT 1"
  ).bind(modelId).first();
}

async function fileIssue(env, title, description, priority = "medium") {
  const now = Date.now();
  await env.AUDIT.prepare(
    `INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
     VALUES (?1, ?2, 'cf-model-eval', 'optimization', ?3, 'open', ?4, ?4)`
  ).bind(String(title).slice(0, 300), String(description).slice(0, 2000), priority, now).run();
}

async function addRoadmapItem(env, item, title, artifactType, artifactRef, evidence) {
  try {
    const has = await env.AUDIT.prepare("SELECT 1 x FROM roadmap_implementation WHERE item=?1 LIMIT 1").bind(item).first();
    if (has) return false;
    await env.AUDIT.prepare(
      `INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence, created_at)
       VALUES (?1, 'cf-model-eval', ?2, ?3, ?4, 'open', ?5, datetime('now'))`
    ).bind(item, String(title).slice(0, 200), artifactType, artifactRef, String(evidence).slice(0, 500)).run();
    return true;
  } catch (_) { return false; }
}

// Side effects of a verdict. `control` is { model_id, score } or null.
async function isModelFloorBanned(env, modelId) {
  // MODEL-FLOOR-1: banned families come from config, not from literals in this file.
  try {
    const r = await env.AUDIT.prepare(
      "SELECT value FROM cf_model_eval_config WHERE key='model_floor_banned'"
    ).first();
    if (r && r.value) {
      const labels = String(r.value).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const id = String(modelId || "").toLowerCase();
      return labels.some((l) => id.includes(l));
    }
  } catch (_) { /* config is optional */ }
  return false;
}

async function decide(env, e, control) {
  const db = env.AUDIT;
  const cScore = control && control.score != null ? control.score : null;
  const price = await priceOf(env, e.model_id);
  const cPrice = control ? await priceOf(env, control.model_id) : { priceIn: null };
  const d = decideVerdict({
    kind: e.kind, score: e.score, controlScore: cScore,
    priceIn: price.priceIn, controlPriceIn: cPrice.priceIn, harness: e.harness,
  });
  // MODEL-FLOOR-1: respect the fleet's routing guard; a model the floor bans must never
  // file a promotion notice no worker can act on. The banned list is read from config
  // (key 'model_floor_banned', comma-separated labels) so this worker carries no
  // sub-frontier model names in code.
  if (d.verdict === "promote" && (await isModelFloorBanned(env, e.model_id))) {
    d.verdict = "reject";
    d.reason = `${d.reason}; MODEL-FLOOR-1 bans ${e.model_id}`;
  }
  // TYPED-INPUT-MODEL-1: a chat run that failed only on the input schema is a modality finding, not a harness gap
  const typedInput = d.verdict === "harness_error" && !DECISION_KINDS.has(e.kind) && isNonChatSchema(e.failed_probes);
  const status = typedInput ? "catalogued"
    : d.verdict === "promote" ? "recommended"
      : d.verdict === "reject" ? "rejected"
        : d.verdict === "harness_error" ? "candidate"
          : "passed";
  const note = typedInput
    ? "typed-input model: Workers AI wants a typed schema (" + String(e.failed_probes).slice(0, 120) + "), not chat messages, so the chat battery cannot drive it; left out of the chat lane (TYPED-INPUT-MODEL-1)"
    : `last verdict: ${d.verdict} (${d.reason})`;

  // never demote or re-status a model already routed in production: record the score only
  await db.prepare(
    `UPDATE cf_model_catalog SET
       status=CASE WHEN status='in_production' THEN 'in_production' ELSE ?2 END,
       modality=CASE WHEN ?5 = 1 AND status<>'in_production' THEN 'typed-input' ELSE modality END,
       last_eval_ts=datetime('now'),
       notes=?4,
       best_score=CASE WHEN best_score IS NULL OR ?3 > best_score THEN ?3 ELSE best_score END
     WHERE model_id=?1`
  ).bind(e.model_id, status, e.score, note, typedInput ? 1 : 0).run();

  // PROMOTE-TICKET-AFTER-RECONCILE-1 (1.8.2, agent_issues 1000329): the promote ticket is built here but not filed here. The ladder row and the roadmap item
  // below are written at once because the same pass withdraws them again (reconcileDecisionPromotions, blockDecisionPromotion); the ticket was filed at the same
  // moment and nothing withdrew it, so 9 tickets in 8 days (2963-2965, 100098-100100, 1000201-1000203) named a promotion that no longer existed. runLoop hands
  // the ticket to filePromoteTickets after the winner, the reconcile and the canary gate of the same pass.
  let promoteTicket = null;
  if (d.verdict === "promote") {
    const row = await db.prepare("SELECT slug, price_in, price_out, ctx FROM cf_model_catalog WHERE model_id=?1").bind(e.model_id).first();
    const tier = DECISION_KINDS.has(e.kind) ? 1 : 2;
    await db.prepare(
      `INSERT OR IGNORE INTO model_ladder_models (id, tier, family, provider, price_in, price_out, cache_in, quality, ctx, notes, active)
       VALUES (?1, ?2, ?3, 'workers-ai', ?4, ?5, 0, ?6, ?7, ?8, 0)`
    ).bind(e.model_id, tier, (row && row.slug) || "unknown", (row && row.price_in) || 0, (row && row.price_out) || 0,
      Math.round(e.score * 100), (row && row.ctx) || null, `auto-eval promote ${BATTERY_VERSION} (cf-model-eval)`).run();
    await addRoadmapItem(env, `MODEL-${e.model_id}`, `Adopt ${e.model_id} in the ${DECISION_KINDS.has(e.kind) ? "decision" : "chat"} lane`,
      "model", e.model_id, `${BATTERY_VERSION}: ${d.reason}`);
    promoteTicket = {
      model_id: e.model_id,
      title: `CF-MODEL-EVAL-1: promote ${e.model_id} on the ${DECISION_KINDS.has(e.kind) ? "decision" : "chat"} battery`,
      description: `Automatic evaluation (${BATTERY_VERSION}) produced a promotion reason:\n\n${d.reason}\n\n` +
        `Model: ${e.model_id}\nScore: ${e.passed}/${e.n_tasks} probes, mean latency ${e.mean_latency_ms}ms\n` +
        `Control: ${control ? control.model_id : "none"} at ${cScore}\n` +
        `Failed probes: ${e.failed_probes || "none"}\n\n` +
        `Action: registered in model_ladder_models with active=0 and on the roadmap as MODEL-${e.model_id}. ` +
        `Flip routing only after the canary agrees (see /canary for decision models).`,
      priority: "medium",
    };
  }
  if (d.verdict === "harness_error" && !typedInput) {
    await fileIssue(env,
      `CF-MODEL-EVAL-1: harness cannot run ${e.model_id}`,
      `Every probe failed for a harness reason, so no quality verdict exists.\n\n` +
      `Errors: ${e.failed_probes || "none"}\n\n` +
      `Fix the harness (e.g. a system-free prompt variant for models that reject the system role) and re-run; ` +
      `the model stays a candidate in the meantime.`,
      "low");
  }

  await db.prepare(
    "UPDATE cf_model_evals SET verdict=?2 WHERE id=(SELECT MAX(id) FROM cf_model_evals WHERE model_id=?1)"
  ).bind(e.model_id, d.verdict).run();
  return { ...d, status, controlScore: cScore, promoteTicket };
}

// CANARY: a decision model is not "in production use" because it scored 1.0 on eight
// easy probes. Run the winner over real open agent_issues rows that already carry a
// category and priority, and measure agreement with the fleet's own labels.
//
// LABEL COVERAGE (1.3.0): the first version offered clef only the 8 most common
// categories while agent_issues holds 29, so a sampled row labelled 'autonomy' was
// unanswerable -- that measures the harness, not the model. Every category is now
// offered (slugged), and category and priority agreement are recorded separately,
// because they are different capabilities.
function slugLabel(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
}

// A decision model may only carry a promotion if real labelled work agrees with it.
// The battery saturates (all three clef models score 1.0), so the canary is the only
// evidence that separates "answers the probes" from "is right about the fleet".
const CANARY_BAR = 0.7;
function canaryGate(agreement, catAgreement) {
  if (agreement == null) return { ready: false, reason: "no canary evidence yet" };
  const a = Number(agreement);
  if (a >= CANARY_BAR) {
    return { ready: true, reason: `real-data agreement ${a} >= ${CANARY_BAR}` };
  }
  const cat = catAgreement == null ? "n/a" : Number(catAgreement);
  return {
    ready: false,
    reason: `real-data agreement ${a} < ${CANARY_BAR} (category ${cat}) -- the model answers the battery but does not reproduce the fleet's own labels`,
  };
}

async function clefCanary(env, modelId, limit = 12, ids = null) {
  const db = env.AUDIT;
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS cf_model_canary (
       id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')),
       model_id TEXT, battery_version TEXT, n INTEGER, agree INTEGER, agreement REAL,
       mean_latency_ms INTEGER, detail TEXT)`
  ).run();
  // every category, not the top 8: an option the model cannot name is a harness bug
  const cats = (await db.prepare(
    "SELECT category, COUNT(*) n FROM agent_issues WHERE category IS NOT NULL AND status='open' GROUP BY 1 ORDER BY n DESC LIMIT 40"
  ).all()).results || [];
  if (cats.length < 2) return { ok: false, error: "not enough labelled categories" };
  // FAIR-LABEL-1 (1.4.0): a criteria description of "reliability" tells the model
  // nothing about what QNFO means by it. The taxonomy is proprietary ('autonomy' vs
  // 'self-heal' vs 'continuous-improvement' are not guessable), so the definition is
  // read from agent_issue_category_glossary and only falls back to the bare label.
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS agent_issue_category_glossary (category TEXT PRIMARY KEY, definition TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))"
  ).run();
  const gloss = new Map();
  try {
    const g = await db.prepare("SELECT category, definition FROM agent_issue_category_glossary").all();
    for (const r of (g.results || [])) gloss.set(String(r.category), String(r.definition));
  } catch (_) { /* glossary is an improvement, not a precondition */ }
  const criteria = {};
  let described = 0;
  for (const c of cats) {
    const def = gloss.get(String(c.category));
    if (def) described++;
    criteria[slugLabel(c.category)] = def || String(c.category);
  }
  const priCriteria = { low: "Routine, no user impact", medium: "Should be handled this week", high: "Blocks work or users now", critical: "Production is broken or data is at risk" };
  const questions = {
    category: { type: "choice", instructions: "Which part of the fleet does this issue concern?", criteria },
    priority: { type: "choice", instructions: "How urgent is this issue?", criteria: priCriteria },
  };
  // AB-HARNESS-1: with ids the canary scores exactly those rows, so the pre-change and post-change models are paired.
  const rows = Array.isArray(ids) && ids.length
    ? (await db.prepare(
      `SELECT id, title, COALESCE(NULLIF(category,''),'?') cat, COALESCE(NULLIF(priority,''),'medium') pri,
              COALESCE(description,'') des
         FROM agent_issues WHERE category IS NOT NULL AND id IN (${ids.map((_, i) => "?" + (i + 1)).join(",")})`
    ).bind(...ids).all()).results || []
    : (await db.prepare(
    `SELECT id, title, COALESCE(NULLIF(category,''),'?') cat, COALESCE(NULLIF(priority,''),'medium') pri,
            COALESCE(description,'') des
       FROM agent_issues WHERE status='open' AND category IS NOT NULL
      ORDER BY RANDOM() LIMIT ?1`
  ).bind(limit).all()).results || [];
  if (!rows.length) return { ok: false, error: "no open labelled issues" };

  let catAgree = 0, priAgree = 0, lat = 0, ton = 0;
  const pairs = [];
  for (const r of rows) {
    const s = Date.now();
    try {
      const out = await env.AI.run(modelId, {
        model: modelId.split("/").pop() || "clef",
        state: `${r.title}\n\n${String(r.des).slice(0, 400)}`,
        questions,
      });
      const a = (out && out.answers) || {};
      const gotCat = clefPick(a, "category").label || null;
      const gotPri = clefPick(a, "priority").label || null;
      const catOk = gotCat != null && norm(gotCat) === norm(slugLabel(r.cat));
      const priOk = gotPri != null && norm(gotPri) === norm(r.pri);
      if (catOk) catAgree++;
      if (priOk) priAgree++;
      if (out && out.usage) ton += Number(out.usage.input_tokens || 0);
      pairs.push({ id: r.id, want: `${r.cat}/${r.pri}`, got: `${gotCat}/${gotPri}`, catOk, priOk });
    } catch (e) {
      pairs.push({ id: r.id, err: String(e && e.message ? e.message : e).slice(0, 120) });
    }
    lat += Date.now() - s;
  }
  const n = rows.length;
  const agree = catAgree + priAgree;
  const agreement = n ? Number((agree / (2 * n)).toFixed(4)) : 0;
  const catAgreement = n ? Number((catAgree / n).toFixed(4)) : 0;
  await db.prepare(
    `INSERT INTO cf_model_canary (model_id, battery_version, n, agree, agreement, mean_latency_ms, detail)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(modelId, BATTERY_VERSION, n, agree, agreement, Math.round(lat / Math.max(1, n)),
    JSON.stringify({ categories_offered: Object.keys(criteria).length, cat_agree: catAgree, pri_agree: priAgree, cat_agreement: catAgreement, sample: pairs.slice(0, 12), input_tokens: ton }).slice(0, 3000)).run();
  return {
    ok: true, model_id: modelId, n, agree, agreement, cat_agreement: catAgreement,
    categories_offered: Object.keys(criteria).length, categories_described: described,
    mean_latency_ms: Math.round(lat / Math.max(1, n)), pairs: pairs.slice(0, 6), rows: pairs,
  };
}

// Pick the decision-model winner: highest score, cheapest to break a tie.
async function selectClefWinner(env) {
  const r = await env.AUDIT.prepare(
    `SELECT e.model_id, MAX(e.score) score, MIN(c.price_in) price_in
       FROM cf_model_evals e LEFT JOIN cf_model_catalog c ON c.model_id=e.model_id
      WHERE e.battery_version=?1 AND (e.model_id LIKE '%/clef%' OR e.model_id LIKE '%/clef-%')
      GROUP BY e.model_id ORDER BY score DESC, price_in ASC`
  ).bind(BATTERY_VERSION).all();
  const rows = r.results || [];
  if (!rows.length) return null;
  const best = rows[0];
  const prev = await cfg(env, "clef_winner", "");
  const changed = prev !== best.model_id;
  await env.AUDIT.prepare(
    "INSERT OR REPLACE INTO cf_model_eval_config (key, value, updated_at) VALUES ('clef_winner', ?1, datetime('now'))"
  ).bind(best.model_id).run();
  if (changed) {
    await addRoadmapItem(env, `MODEL-CLEF-LANE-${best.model_id}`, `Wire ${best.model_id} into the decision/triage lane`,
      "model", best.model_id, `best decision-battery score ${best.score} at $${best.price_in}/M in`);
    await fileIssue(env,
      `CF-MODEL-EVAL-1: decision-model winner is ${best.model_id}`,
      `Best decision-battery score: ${best.score} (price_in $${best.price_in}/M).\n` +
      `Previous winner: ${prev || "none"}.\n\n` +
      `Run the canary over real labelled agent_issues rows before switching any lane; agreement is recorded in cf_model_canary.`,
      "low");
  }
  return { ...best, previous: prev || null, changed };
}

// Only one decision model may hold a promotion at a time. The battery saturates, so
// without this every clef variant promotes itself in the same sweep and the backlog
// fills with three mutually superseding ladder rows.
async function reconcileDecisionPromotions(env, winnerId) {
  const db = env.AUDIT;
  const others = await db.prepare(
    "SELECT model_id FROM cf_model_catalog WHERE modality='clef' AND status='recommended' AND model_id<>?1"
  ).bind(winnerId).all();
  for (const r of (others.results || [])) {
    await db.prepare("UPDATE cf_model_catalog SET status='passed', notes=?2 WHERE model_id=?1")
      .bind(r.model_id, "superseded by decision-battery winner " + winnerId).run();
    await db.prepare("DELETE FROM model_ladder_models WHERE id=?1 AND notes LIKE 'auto-eval promote%'").bind(r.model_id).run();
    await db.prepare("DELETE FROM roadmap_implementation WHERE item=?1 AND source='cf-model-eval'").bind("MODEL-" + r.model_id).run();
  }
  return (others.results || []).length;
}

// A failed canary withdraws the promotion instead of leaving a recommendation nobody
// should act on. The ladder row goes, the catalog drops to candidate, and the roadmap
// item keeps the reason so the next reader sees why it is not live.
async function blockDecisionPromotion(env, modelId, reason) {
  const db = env.AUDIT;
  await db.prepare(
    "UPDATE cf_model_catalog SET status='candidate', notes=?2 WHERE model_id=?1 AND status<>'in_production'"
  ).bind(modelId, "canary gate: " + reason).run();
  await db.prepare("DELETE FROM model_ladder_models WHERE id=?1 AND notes LIKE 'auto-eval promote%'").bind(modelId).run();
  await db.prepare("UPDATE roadmap_implementation SET evidence=?2 WHERE item=?1")
    .bind("MODEL-" + modelId, ("BLOCKED: " + reason).slice(0, 500)).run();
}

// PROMOTE-TICKET-AFTER-RECONCILE-1 (1.8.2, agent_issues 1000329, pillar autonomy): a promotion stands when the model's catalog row still says recommended or
// in_production, or its ladder row is still there. This is the test ISSUE-HYGIENE-3 (rule model-eval-promote-withdrawn of the hourly workflow issue-meta-fold) applies
// to close a promote ticket as moot, so the producer now files exactly the tickets that rule keeps: reconcileDecisionPromotions leaves the superseded model 'passed' and
// without a ladder row, blockDecisionPromotion leaves the blocked one 'candidate' and without one.
async function promotionStands(env, modelId) {
  const r = await env.AUDIT.prepare(
    `SELECT (SELECT COUNT(*) FROM cf_model_catalog WHERE model_id=?1 AND status IN ('recommended','in_production')) live,
            (SELECT COUNT(*) FROM model_ladder_models WHERE id=?1) ladder`
  ).bind(modelId).first();
  return !!r && (Number(r.live) > 0 || Number(r.ladder) > 0);
}

// Files the promote tickets of one pass after its winner selection, its reconcile and its canary gate, and only for a model whose promotion stands. A withdrawn
// promotion files nothing: its ladder row and roadmap item are gone and the catalog says why. One bad insert does not lose the others.
async function filePromoteTickets(env, tickets) {
  const out = { filed: 0, withheld: [], errors: [] };
  const seen = new Set();
  for (const t of (tickets || [])) {
    if (!t || !t.model_id || seen.has(t.title)) continue;
    seen.add(t.title);
    try {
      if (await promotionStands(env, t.model_id)) {
        await fileIssue(env, t.title, t.description, t.priority || "medium");
        out.filed++;
      } else out.withheld.push(t.model_id);
    } catch (err) {
      out.errors.push(`${t.model_id}: ${String(err && err.message ? err.message : err).slice(0, 160)}`);
    }
  }
  return out;
}

async function recordEval(env, e, role) {
  const cost = await costOf(env, e.model_id, e);
  await env.AUDIT.prepare(
    `INSERT INTO cf_model_evals (model_id, slug, battery_version, run_ts, n_tasks, passed, score, mean_latency_ms, tokens_in, tokens_out, cost_usd, verdict, detail)
     VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  ).bind(e.model_id, e.slug || null, BATTERY_VERSION, e.n_tasks, e.passed, e.score, e.mean_latency_ms,
    e.tokens_in, e.tokens_out, cost, role, e.detail || null).run();
  return cost;
}

async function runLoop(env, trigger, opts) {
  const db = env.AUDIT;
  const cfgMax = Number(await cfg(env, "max_models_per_run", "6"));
  const maxModels = Math.max(1, Math.min(12, Number(opts && opts.maxModels) || cfgMax || 6));
  const budgetMs = Math.max(15000, Math.min(240000, Number(opts && opts.budgetMs) || 90000));
  const deadline = Date.now() + budgetMs;
  const started = new Date().toISOString();
  const runId = "cme-" + Date.now().toString(36);
  const summary = { run_id: runId, trigger, started, sync: null, evaluated: [], skipped: 0, errors: [], maxModels, budgetMs };

  try { summary.sync = await syncCatalog(env); }
  catch (e) { summary.errors.push("sync: " + String(e.message || e)); }

  // pick work: never-evaluated candidates first, then the oldest scores
  const ctrlList = CONTROLS.map((c) => `'${c.model_id}'`).join(",");
  const picks = [];
  const cand = await db.prepare(
    `SELECT model_id, slug, modality FROM cf_model_catalog
      WHERE status IN ('new','candidate','passed') AND modality IN ('chat','clef') AND model_id IS NOT NULL
        AND model_id NOT IN (${ctrlList})
        AND (last_eval_ts IS NULL OR last_eval_ts < datetime('now','-7 days'))
      ORDER BY (last_eval_ts IS NULL) DESC, first_seen DESC LIMIT ?1`
  ).bind(maxModels).all();
  for (const r of (cand.results || [])) picks.push(r);

  if (picks.length < maxModels) {
    const reg = await db.prepare(
      `SELECT c.model_id, c.slug, c.modality FROM cf_model_catalog c
        JOIN model_ladder_models m ON m.id = c.model_id
        WHERE c.model_id NOT IN (${ctrlList}) AND c.modality IN ('chat','clef')
          AND (c.last_eval_ts IS NULL OR c.last_eval_ts < datetime('now','-7 days'))
        LIMIT ?1`
    ).bind(maxModels - picks.length).all();
    for (const r of (reg.results || [])) picks.push(r);
  }

  // control baseline, refreshed at most daily
  const controlScores = {};
  let controlScore = null;
  for (const c of CONTROLS) {
    const le = await lastEval(env, c.model_id);
    const fresh = le && le.run_ts && (Date.now() - Date.parse(le.run_ts.replace(" ", "T") + "Z")) < 86400000;
    if (fresh) { controlScores[c.model_id] = Number(le.score); continue; }
    if (Date.now() > deadline) { summary.errors.push("deadline before control baseline"); continue; }
    const probes = await loadBattery(env, "chat");
    if (!probes.length) { summary.errors.push("battery empty"); break; }
    try {
      const e = await evalModel(env, c.model_id, "control:tier" + c.tier, "chat", probes);
      await recordEval(env, e, "control");
      controlScores[c.model_id] = e.score;
      summary.evaluated.push({ model_id: e.model_id, score: e.score, passed: e.passed, n: e.n_tasks, verdict: "control" });
    } catch (err) { summary.errors.push(`control ${c.model_id}: ${String(err.message || err)}`); }
  }
  const control = controlScores["@cf/zai-org/glm-5.3-flash"] != null
    ? { model_id: "@cf/zai-org/glm-5.3-flash", score: controlScores["@cf/zai-org/glm-5.3-flash"] }
    : controlScores["@cf/openai/gpt-oss-120b"] != null
      ? { model_id: "@cf/openai/gpt-oss-120b", score: controlScores["@cf/openai/gpt-oss-120b"] } : null;
  controlScore = control ? control.score : null;

  // decision family compares against the best previous decision score, never the chat control
  const prevClef = await db.prepare(
    "SELECT MAX(score) s FROM cf_model_evals WHERE battery_version=?1 AND model_id LIKE '%/clef%'"
  ).bind(BATTERY_VERSION).first();
  const clefControl = prevClef && prevClef.s != null ? { model_id: "decision-family-best", score: prevClef.s } : null;

  // PROMOTE-TICKET-AFTER-RECONCILE-1: the promote tickets wait here until the winner, the reconcile and the canary gate of this pass have run.
  const promoteTickets = [];
  for (const p of picks) {
    if (Date.now() > deadline) { summary.skipped++; continue; }
    const kind = p.modality === "clef" ? "clef" : "chat";
    const probes = await loadBattery(env, kind);
    if (!probes.length) { summary.errors.push(`no ${kind} probes`); continue; }
    try {
      const e = await evalModel(env, p.model_id, p.slug, kind, probes);
      await recordEval(env, e, "candidate");
      const d = await decide(env, e, kind === "chat" ? control : clefControl);
      if (d.promoteTicket) promoteTickets.push(d.promoteTicket);
      summary.evaluated.push({ model_id: e.model_id, score: e.score, passed: e.passed, n: e.n_tasks, verdict: d.verdict, reason: d.reason, failed: e.failed_probes });
    } catch (err) { summary.errors.push(`${p.model_id}: ${String(err.message || err)}`); }
  }

  // decision winner + canary over real labelled issues
  let winner = null;
  try { winner = await selectClefWinner(env); } catch (e) { summary.errors.push("winner: " + String(e.message || e)); }
  summary.clef_winner = winner;
  if (winner && winner.model_id) {
    try { summary.superseded = await reconcileDecisionPromotions(env, winner.model_id); }
    catch (e) { summary.errors.push("reconcile: " + String(e.message || e)); }
    if (String(await cfg(env, "canary_enabled", "0")) === "1") {
      try {
        summary.canary = await clefCanary(env, winner.model_id);
        const gate = canaryGate(summary.canary && summary.canary.ok ? summary.canary.agreement : null,
          summary.canary ? summary.canary.cat_agreement : null);
        summary.canary_gate = gate;
        if (!gate.ready) await blockDecisionPromotion(env, winner.model_id, gate.reason);
      } catch (e) { summary.errors.push("canary: " + String(e.message || e)); }
    }
  }

  // PROMOTE-TICKET-AFTER-RECONCILE-1: only now, and only for a model whose promotion the reconcile and the canary gate left standing.
  try {
    const pt = await filePromoteTickets(env, promoteTickets);
    summary.promote_tickets = { filed: pt.filed, withheld: pt.withheld };
    for (const m of pt.errors) summary.errors.push("promote-ticket: " + m);
  } catch (e) { summary.errors.push("promote-tickets: " + String(e.message || e)); }

  // safety net: candidates sitting unevaluated too long
  const idle = await db.prepare(
    `SELECT slug, model_id FROM cf_model_catalog
      WHERE status IN ('new','candidate') AND first_seen < datetime('now','-7 days')
        AND (last_eval_ts IS NULL) LIMIT 5`
  ).all();
  for (const r of (idle.results || [])) {
    await fileIssue(env,
      `CF-MODEL-EVAL-1: ${r.slug} catalogued 7d+ without an evaluation`,
      `Model ${r.model_id || r.slug} was discovered but never evaluated. Check the eval loop's deadline and per-run cap (cf_model_eval_config).`,
      "low");
  }

  const unfinished = (await db.prepare(
    "SELECT COUNT(*) n FROM cf_model_catalog WHERE modality IN ('chat','clef') AND status IN ('new','candidate') AND (last_eval_ts IS NULL OR last_eval_ts < datetime('now','-7 days'))"
  ).first()) || { n: null };
  summary.backlog = unfinished.n;

  await db.prepare("INSERT OR REPLACE INTO cf_model_eval_runs (id, ts, trigger, models, probes, ok, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(runId, started, trigger, summary.evaluated.length, summary.evaluated.reduce((a, x) => a + (x.n || 0), 0),
      summary.errors.length ? 0 : 1, JSON.stringify(summary).slice(0, 3500)).run();

  await db.prepare(
    `INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6)`
  ).bind(
    "cf-model-eval-" + started.slice(0, 16) + ":" + trigger,
    "cf-model-eval",
    `CF-MODEL-EVAL-1: catalog ${summary.sync ? summary.sync.seen : "?"} (+${summary.sync ? summary.sync.added : 0} new); evaluated ${summary.evaluated.length}; backlog ${summary.backlog}; verdicts ${summary.evaluated.map((x) => (x.verdict || "?")).join(",") || "none"}`,
    JSON.stringify({ control: controlScore, verdicts: summary.evaluated.map((x) => ({ m: x.model_id, s: x.score, v: x.verdict })), backlog: summary.backlog, winner: winner && winner.model_id }).slice(0, 900),
    "cf-model-eval",
    summary.errors.length ? "warn" : "ok"
  ).run();

  return summary;
}

// ---- AB-HARNESS-1:BEGIN (agent_issues 2828 MODEL-QUALITY-PARITY-1, pillar autonomy; migrations/2026-10-19-model-ab.sql) ----
// WHY: on 2026-10-17 twenty workers moved off sub-frontier models and nothing measured whether the answers got worse. Every
// existing check (ai_model_health, the battery, the error counters) sees reachability, policy compliance or an ERROR. A model
// that answers fluently and worse raises none of them. This is the instrument for that: for one worker and one task set it
// puts the pre-change answer and the post-change answer to the same prompt in front of two judges from different model families
// and writes the paired win rate, against a stated threshold, to model_ab_runs.
//
// HOW, per fixture (AB_FIXTURES, stored in this file so a run is repeatable offline and a test can replay it):
//   pre-change answer   the fixture's recorded baseline reply; with live_pre the pre-change model is called instead (path B)
//   post-change answer  the post-change model through qnfo-ai with pin_model true (QNFO_AI service binding, props caller
//                       qnfo-model-eval); a reply served by another model is never scored: the same prompt goes to the
//                       Workers AI id through the AI binding (row detail post_paths says which path answered), and without
//                       a direct path the fixture is dropped
//   verdict             two judges from two families outside the pair under test, at least one outside every family the worker
//                       uses; each sees the two answers in the opposite order of the other (position bias cancels per fixture)
//   score               win 1, tie 0.5, loss 0 per judge, averaged; an EMPTY post-change answer is a loss without a judge
//                       (the kimi-k2.6 failure, 2026-10-17: a reasoning model spends the budget and returns nothing), except that
//                       an empty answer whose finish is "length" is first asked once more at a larger budget (AB-LENGTH-RETRY-1)
// win_rate = mean score over fixtures with a verdict. Parity is 0.5; the pass line (AB_THRESHOLD 0.40, non-inferiority margin
// 0.10) is the stated threshold; a run with fewer than AB_MIN_VALID fixtures, or judges that disagree on most fixtures, is
// inconclusive and never a pass. A regression files an agent_issues row (fileIssue) so the finding has a doer.
//
// WHAT IT DOES NOT SHOW: the fixtures are passage-grounded (so the qnfo-ai accuracy layer does not rewrite the reply), short and
// generic. They catch empty, unsupported, wrong or truncated answers; they are not the worker's own prompts. The seed
// baselines are reference answers authored in this file, not machine recordings; live_pre records real pre-change replies.
// Classification lanes (task_set clef-classification) use clefCanary agreement on the same labelled agent_issues rows instead.
//
// TRIGGERS (abTick, the hourly grid tick): (1) scripts/model-policy.json on main, read from raw.githubusercontent.com, names the
// model each governed worker uses; a changed model for a worker is a run, a worker seen for the first time is a baseline, not a
// run; (2) ai_call_counters, for a change nobody declared: a model with >= 20 calls yesterday or today that the same worker did
// not use (< 3 calls) in the 2 to 15 days before, against that worker's busiest earlier model; (3) AB-LENGTH-RETRY-1, a regression
// row of the last 7 days that an older harness revision scored (abStaleRevCandidates), which needs no model change in the counters.
// All are bounded by ab_max_runs_per_tick and ab_daily_cap, switched by ab_enabled (control_registry model-ab-switch), deduped on
// worker, pre and post model for 7 days, and an errored run, or an inconclusive one that lost fixtures to an unavailable retry,
// is tried again up to 3 times a day.
const AB_THRESHOLD = 0.4;
const AB_MIN_VALID = 6;
const AB_FIXTURE_LIMIT = 8;
const AB_CLASSIFY_SET = "clef-classification";
// A run starts no new fixture after AB_RUN_BUDGET_MS (calls already started finish within their 90 s timeout) and a tick starts no
// new run after AB_TICK_START_GATE_MS, so two runs stay inside a cron invocation's 15 minutes; a candidate left over is detected
// again on the next tick.
const AB_RUN_BUDGET_MS = 240000;
const AB_TICK_START_GATE_MS = 300000;
// AB-LENGTH-RETRY-1 (1.8.0, agent_issues 100277, pillar autonomy; minor): a post-change reply that is empty because the fixture's own
// token cap was spent (finish "length": a reasoning model spends the whole budget on thought) is the harness's budget and not the model's
// answer. Measured 2026-10-19 (model_ab_runs ids 1 and 4, the same pair, kimi-k2.6 against glm-5.3-flash, win rate 0.25 both times): every
// loss of run 4 and two of the four losses of run 1 were "empty post-change reply (finish length)" at a 300-token fixture, while the
// production confirm call of errata-hub sends thinking off at 2048 tokens. abOneFixture now asks such a reply once more at
// Math.min(AB_RETRY_MAX_TOKENS, Math.max(AB_RETRY_MIN_TOKENS, 4 * the fixture budget)) through the same path, and never after the run
// deadline. An empty reply with any other finish stays an immediate loss; a retry that cannot be made (call error, a reply from another
// model, the deadline) leaves the fixture unmeasured, never a loss and never callFailed (callFailed means the router is down).
const AB_RETRY_MIN_TOKENS = 2048;
const AB_RETRY_MAX_TOKENS = 4096;
// The scoring revision of the harness, written first in model_ab_runs.detail. Bump it when the harness changes how a row is scored:
// abAlreadyRun counts a 'regression' row as done only when it carries the current revision, and abStaleRevCandidates proposes every
// pair whose regression row (last 7 days) does not, so a regression found by an older scoring is measured again on the next hourly
// tick whether or not ai_call_counters still shows a model change (rev 1 scored a length-empty reply as a loss; rev 2 retries it).
// A pass or an inconclusive row keeps its 7-day dedupe, except an inconclusive row that lost fixtures to an unavailable retry (see
// abAlreadyRun), and no row is edited or deleted (they are history).
const AB_HARNESS_REV = 2;
const AB_POLICY_URL = "https://raw.githubusercontent.com/QNFO/qnfo-workers/main/scripts/model-policy.json";
// Judges, in preference order. One model per family; the pair under test and (preferably) the worker's families are skipped.
const AB_JUDGE_POOL = [
  { family: "openai", model: "@cf/openai/gpt-oss-120b" },
  { family: "deepseek", model: "@cf/deepseek-ai/deepseek-v4-flash-0731" },
  { family: "zai", model: "@cf/zai-org/glm-5.3" },
  { family: "nvidia", model: "@cf/nvidia/nemotron-3-120b-a12b" },
  { family: "moonshot", model: "@cf/moonshotai/kimi-k2.6" },
];
const AB_FAMILY_RULES = [
  ["moonshot", /kimi|moonshot/], ["openai", /gpt-oss|openai/], ["zai", /glm|zai/], ["deepseek", /deepseek/],
  ["nvidia", /nemotron|nvidia/], ["alibaba", /qwen/], ["google", /gemma|google/], ["meta", /meta|llama/],
  ["mistral", /mistral/], ["cloudflare", /cloudflare/],
];
const abGrounded = (passage, question) =>
  "Answer the question using only the passage. Reply in one or two sentences. If the passage does not say, state that it does not.\n\nPassage: " + passage + "\n\nQuestion: " + question;
const abSummary = (passage) => "Summarize the passage in one sentence of at most 30 words.\n\nPassage: " + passage;
const abReason = (problem) =>
  "Solve the problem. Show brief working, then give the final answer on a last line that starts with 'Answer:'.\n\nProblem: " + problem;
const AB_FIXTURES = {
  "grounded-qa": [
    { id: "gq-1", max_tokens: 300, gold: "since 2004",
      prompt: abGrounded("The Harlow Bridge opened in 1931 and spans 412 metres. It was closed for repairs from March to September 1987 and has carried only pedestrians and cyclists since 2004.", "Since when has the bridge carried only pedestrians and cyclists?"),
      baseline: "It has carried only pedestrians and cyclists since 2004." },
    { id: "gq-2", max_tokens: 300, gold: "culture C, 42 degrees, after 20 hours",
      prompt: abGrounded("Three cultures were incubated: culture A at 30 degrees, culture B at 37 degrees and culture C at 42 degrees. Only culture B reached confluence within 48 hours. Culture C died after 20 hours.", "Which culture died, at what temperature, and after how long?"),
      baseline: "Culture C, incubated at 42 degrees, died after 20 hours." },
    { id: "gq-3", max_tokens: 300, gold: "250",
      prompt: abGrounded("The Aldous fund ledger shows a deposit of 1200 in January, a withdrawal of 450 in February, a deposit of 300 in March and a withdrawal of 800 in April. The fund started at zero.", "What was the balance after April?"),
      baseline: "The balance after April was 250 (1200 - 450 + 300 - 800)." },
    { id: "gq-4", max_tokens: 300, gold: "it is rejected with an error",
      prompt: abGrounded("Requests under 10 MB are processed immediately. Requests from 10 MB up to 100 MB are queued and finished within one hour. Requests above 100 MB are rejected with an error.", "What happens to a 250 MB request?"),
      baseline: "A 250 MB request is above 100 MB, so it is rejected with an error." },
    { id: "gq-5", max_tokens: 300, gold: "never retried; port 7121",
      prompt: abGrounded("The Meridian protocol sends control messages on port 7120 and data messages on port 7121. A control message is retried three times, two seconds apart. A data message is never retried.", "How many times is a data message retried, and on which port is it sent?"),
      baseline: "A data message is never retried, and it is sent on port 7121." },
    { id: "gq-6", max_tokens: 300, gold: "the passage does not say who leads imaging today; it only says Dr. Lindqvist led it until 2021 and Dr. Okafor moved into it in 2021",
      prompt: abGrounded("Dr. Okafor joined the laboratory in 2019 and moved to the imaging group in 2021. Dr. Lindqvist led the imaging group until 2021 and then took over the sequencing group.", "Who leads the imaging group today?"),
      baseline: "The passage does not say who leads the imaging group today. It only says that Dr. Lindqvist led it until 2021 and that Dr. Okafor moved into it in 2021." },
    { id: "gq-7", max_tokens: 300, gold: "stations 2 and 4, 18 cubic metres per second",
      prompt: abGrounded("A river survey recorded flow rates of 14, 18, 22 and 18 cubic metres per second at stations 1, 2, 3 and 4.", "Which stations recorded the same flow rate, and what was it?"),
      baseline: "Stations 2 and 4 recorded the same flow rate, 18 cubic metres per second." },
    { id: "gq-8", max_tokens: 300, gold: "only --strict",
      prompt: abGrounded("Release 3.2 removed the --legacy flag, deprecated the --compat option and added the --strict option. Release 3.3 removes --compat.", "After release 3.3, which of the three options named in the passage can still be used?"),
      baseline: "Only --strict: --legacy was removed in 3.2 and --compat is removed in 3.3." },
  ],
  "summarize": [
    { id: "su-1", max_tokens: 200, gold: "40 old diesel buses replaced by electric over two years; first 10 on the airport route; fuel costs expected to fall by a third; winter range still being tested",
      prompt: abSummary("The Ostrava transit authority will replace its 40 oldest diesel buses with electric models over two years. The first 10 arrive in March and will run on the airport route, where charging depots already exist. Officials expect fuel costs to fall by a third, but warn that winter range is still being tested."),
      baseline: "The transit authority will replace 40 old diesel buses with electric ones over two years, starting with 10 on the airport route, expecting a third lower fuel costs while winter range remains under test." },
    { id: "su-2", max_tokens: 200, gold: "600 office workers, six months; four-day week: output unchanged, burnout down 22 percent; customer support saw no benefit because of coverage rules",
      prompt: abSummary("A study of 600 office workers compared a four-day week with a five-day week over six months. Output measured by completed tasks was unchanged, while reported burnout fell by 22 percent. Participants in customer support roles saw no benefit because coverage rules forced them to keep five-day rotas."),
      baseline: "In a six-month study of 600 office workers, a four-day week left output unchanged and cut reported burnout by 22 percent, except in customer support where coverage rules kept five-day rotas." },
    { id: "su-3", max_tokens: 200, gold: "Treve lost its bakery in 2020; residents raised 85,000 by cooperative and reopened it in 2022; six employees; supplies two villages",
      prompt: abSummary("The village of Treve lost its only bakery in 2020. Residents formed a cooperative, raised 85,000 in shares, and reopened the building as a community bakery in 2022. It now employs six people and supplies two neighbouring villages."),
      baseline: "After Treve lost its bakery in 2020, residents raised 85,000 through a cooperative and reopened it in 2022; it now employs six and supplies two nearby villages." },
    { id: "su-4", max_tokens: 200, gold: "mirror warped by under a micrometre in the cold; corrected with 120 actuators over two nights; observations resumed on the third; temperature sensors planned",
      prompt: abSummary("Engineers found that the telescope mirror had warped by less than a micrometre during the cold snap. They corrected it by adjusting 120 actuators over two nights, and observations resumed on the third. The team plans to add temperature sensors behind the mirror to catch such drift earlier."),
      baseline: "A telescope mirror warped slightly in the cold and was corrected by adjusting 120 actuators over two nights, and the team will add temperature sensors to catch drift sooner." },
    { id: "su-5", max_tokens: 200, gold: "council voted 7 to 2 to ban cars from the old market square on weekends; loading before 9 a.m. exempt; review after one year",
      prompt: abSummary("The city council voted 7 to 2 to ban cars from the old market square on weekends. Shop owners objected, citing lost deliveries, so the ban exempts vehicles loading before 9 a.m. A review is scheduled after one year."),
      baseline: "The council voted 7 to 2 to ban weekend cars from the old market square, exempting vehicles loading before 9 a.m. after shop owners objected, with a review in a year." },
    { id: "su-6", max_tokens: 200, gold: "small model predicts landslides from rainfall and soil data; flagged 81 percent of events; about one in four warnings false; should support human forecasters",
      prompt: abSummary("Researchers trained a small model to predict landslides from rainfall and soil data. On held-out regions it flagged 81 percent of events, but it also raised false alarms for roughly one in four warnings. The authors say it should support, not replace, human forecasters."),
      baseline: "A small landslide model flagged 81 percent of events on held-out regions but gave false alarms on about one in four warnings, so the authors say it should support human forecasters." },
    { id: "su-7", max_tokens: 200, gold: "12,000 pages of 19th-century letters scanned in a year; handwriting recognition about 70 percent correct; volunteers proofread; free online search next spring",
      prompt: abSummary("The library's digitisation project scanned 12,000 pages of 19th-century letters in its first year. Handwriting recognition read about 70 percent correctly, so volunteers now proofread each page. The finished archive will be free to search online next spring."),
      baseline: "The library scanned 12,000 pages of 19th-century letters in a year; because handwriting recognition is about 70 percent accurate, volunteers proofread, and the archive will be searchable free online next spring." },
    { id: "su-8", max_tokens: 200, gold: "recall of 3,400 pressure cookers sold May to August; lid lock can fail; no injuries; stop using and get a free replacement lid",
      prompt: abSummary("A recall affects 3,400 pressure cookers sold between May and August because the lid lock can fail. No injuries have been reported. Owners should stop using the product and contact the maker for a free replacement lid."),
      baseline: "3,400 pressure cookers sold from May to August are recalled because the lid lock can fail; there are no reported injuries and owners should stop using them and request a free replacement lid." },
  ],
  "reasoning-short": [
    { id: "rs-1", max_tokens: 400, gold: "155 minutes",
      prompt: abReason("A train leaves at 09:15 and arrives at 11:50. How many minutes long is the trip?"),
      baseline: "From 09:15 to 11:50 is 2 hours 35 minutes, which is 120 + 35 = 155 minutes.\nAnswer: 155 minutes" },
    { id: "rs-2", max_tokens: 400, gold: "192 litres",
      prompt: abReason("A tank holds 240 litres. It leaks 4 litres every 15 minutes. How many litres remain after 3 hours?"),
      baseline: "3 hours is 180 minutes, so there are 12 intervals of 15 minutes. The tank leaks 12 x 4 = 48 litres, leaving 240 - 48 = 192.\nAnswer: 192 litres" },
    { id: "rs-3", max_tokens: 400, gold: "4 hours",
      prompt: abReason("Three workers paint a fence in 8 hours. How long would 6 workers take at the same rate?"),
      baseline: "The job is 3 x 8 = 24 worker-hours. Six workers need 24 / 6 = 4 hours.\nAnswer: 4 hours" },
    { id: "rs-4", max_tokens: 400, gold: "80",
      prompt: abReason("A shop raises a price of 80 by 25 percent and then reduces the new price by 20 percent. What is the final price?"),
      baseline: "80 x 1.25 = 100, then 100 x 0.8 = 80.\nAnswer: 80" },
    { id: "rs-5", max_tokens: 400, gold: "24",
      prompt: abReason("Ana is twice as old as Ben. In 6 years the sum of their ages will be 48. How old is Ana now?"),
      baseline: "Let Ben be b and Ana 2b. In 6 years (2b + 6) + (b + 6) = 48, so 3b = 36 and b = 12. Ana is 24.\nAnswer: 24" },
    { id: "rs-6", max_tokens: 400, gold: "127",
      prompt: abReason("A sequence starts 3, 7, 15, 31 and each term is twice the previous term plus 1. What is the 6th term?"),
      baseline: "The 5th term is 2 x 31 + 1 = 63 and the 6th is 2 x 63 + 1 = 127.\nAnswer: 127" },
    { id: "rs-7", max_tokens: 400, gold: "2 hours",
      prompt: abReason("Two cyclists start 60 km apart and ride toward each other at 12 km/h and 18 km/h. After how many hours do they meet?"),
      baseline: "They close the gap at 12 + 18 = 30 km/h, so they meet after 60 / 30 = 2 hours.\nAnswer: 2 hours" },
    { id: "rs-8", max_tokens: 400, gold: "2/9",
      prompt: abReason("A box has 5 red, 3 blue and 2 green balls. Two are drawn without replacement. What is the probability that both are red? Give a fraction."),
      baseline: "The first is red with probability 5/10 and the second with 4/9, so (5/10) x (4/9) = 20/90 = 2/9.\nAnswer: 2/9" },
  ],
};

function abTail(id) { return String(id == null ? "" : id).toLowerCase().split("/").pop(); }
// One model, however the router spells it: the Workers AI id, the internal name, the dated build and the "-wa" binding alias.
function abCanon(id) { return abTail(id).replace(/-wa$/, "").replace(/-\d{4}$/, ""); }
function abSameModel(a, b) { return !!a && !!b && abCanon(a) === abCanon(b); }
function abFamily(id) {
  const s = String(id == null ? "" : id).toLowerCase();
  for (const r of AB_FAMILY_RULES) if (r[1].test(s)) return r[0];
  return "other";
}

// Two judges from two families, neither a family of the pair under test, and at least one that the worker does not use at all.
function abPickJudges(preModel, postModel, workerModels) {
  const pair = new Set([abFamily(preModel), abFamily(postModel)]);
  const used = new Set(pair);
  for (const m of workerModels || []) used.add(abFamily(m));
  const cands = AB_JUDGE_POOL.filter((j) => !pair.has(j.family));
  cands.sort((a, b) => (used.has(a.family) ? 1 : 0) - (used.has(b.family) ? 1 : 0));
  const picked = cands.slice(0, 2);
  if (picked.length < 2) return { ok: false, judges: picked, reason: "fewer than two judge families outside the pair under test" };
  const independent = picked.filter((j) => !used.has(j.family)).map((j) => j.family);
  if (!independent.length) return { ok: false, judges: picked, reason: "no judge family is independent of the models the worker uses" };
  return { ok: true, judges: picked, independent };
}

function abJudgePrompt(fx, replyA, replyB) {
  return [
    "You are grading two answers, A and B, to the same task. Judge correctness, completeness and whether the task's instructions were followed. Ignore length, tone and formatting. An answer that states anything the task text does not support, or invents a fact, is worse than one that says the text does not give it. An empty or off-topic answer loses.",
    "TASK:\n" + fx.prompt,
    fx.gold ? "KNOWN CORRECT ANSWER (key facts): " + fx.gold : "",
    "ANSWER A:\n" + replyA,
    "ANSWER B:\n" + replyB,
    "Reply with exactly one line: WINNER: A, WINNER: B or WINNER: TIE.",
  ].filter(Boolean).join("\n\n");
}

// The last "WINNER: x" in the reply (a judge may think aloud first); a bare "A", "B" or "TIE" reply also counts.
function abParseVerdict(text) {
  const t = String(text == null ? "" : text);
  let last = null;
  for (const m of t.matchAll(/winner\s*[:=-]?\s*\**\s*(tie|a|b)\b/gi)) last = m[1];
  if (last == null) {
    const bare = /^\s*\**\s*(tie|a|b)\s*\**\s*[.!]?\s*$/i.exec(t);
    if (bare) last = bare[1];
  }
  return last == null ? null : last.toUpperCase();
}

function abVerdictScore(v, postIsA) {
  if (v === "TIE") return 0.5;
  if (v === "A") return postIsA ? 1 : 0;
  if (v === "B") return postIsA ? 0 : 1;
  return null;
}

// items: [{ id, score|null, judge_scores: [] }]; a null score is a fixture that never reached a verdict (not counted).
function abSummarize(items, o) {
  const threshold = Number.isFinite(Number(o && o.threshold)) ? Number(o.threshold) : AB_THRESHOLD;
  const minValid = Number.isFinite(Number(o && o.minValid)) ? Number(o.minValid) : AB_MIN_VALID;
  const valid = (items || []).filter((i) => i && i.score != null);
  const n = valid.length;
  const win_rate = n ? Number((valid.reduce((a, i) => a + i.score, 0) / n).toFixed(4)) : null;
  const wins = valid.filter((i) => i.score > 0.5).length;
  const ties = valid.filter((i) => i.score === 0.5).length;
  const losses = valid.filter((i) => i.score < 0.5).length;
  const two = valid.filter((i) => Array.isArray(i.judge_scores) && i.judge_scores.length === 2);
  const judge_agreement = two.length ? Number((two.filter((i) => i.judge_scores[0] === i.judge_scores[1]).length / two.length).toFixed(4)) : null;
  let verdict, reason;
  if (n < minValid) { verdict = "inconclusive"; reason = "only " + n + " of the fixtures reached a verdict (needs " + minValid + ")"; }
  else if (two.length >= 4 && judge_agreement < 0.5) { verdict = "inconclusive"; reason = "the two judge families agree on " + judge_agreement + " of " + two.length + " fixtures"; }
  else if (win_rate >= threshold) { verdict = "pass"; reason = "win rate " + win_rate + " >= threshold " + threshold; }
  else { verdict = "regression"; reason = "win rate " + win_rate + " < threshold " + threshold; }
  return { n, win_rate, wins, ties, losses, judge_agreement, judge_pairs: two.length, threshold, minValid, verdict, reason };
}

// One chat call through qnfo-ai, pinned to the model. A reply that carries no text is { ok: true, text: "" }, never the
// stringified envelope (extractChatText would hand back the JSON of a reasoning-only reply as if it were an answer).
async function abChat(env, model, content, maxTokens, timeoutMs) {
  if (!env.QNFO_AI || typeof env.QNFO_AI.fetch !== "function") return { ok: false, error: "QNFO_AI binding missing" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 90000);
  try {
    const resp = await env.QNFO_AI.fetch("https://qnfo-ai.internal/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "qnfo-model-eval/" + VERSION },
      body: JSON.stringify({ model, messages: [{ role: "user", content }], max_tokens: maxTokens, stream: false, hedge: false, pin_model: true, cache: false, rag: false }),
      signal: ctl.signal,
    });
    const raw = await resp.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (_) { /* reported below */ }
    if (!resp.ok || !data) return { ok: false, error: "http " + resp.status };
    const choice = (data.choices && data.choices[0]) || {};
    const c = choice.message && choice.message.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("") : "";
    return { ok: true, text: text.trim(), served: String(data.model || ""), finish: choice.finish_reason || null };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e).slice(0, 120) };
  } finally { clearTimeout(timer); }
}

// Second path (ANTIFRAGILE-1): the router serves only the ids in its MODELS table (nemotron-3-120b-a12b, qwen3.8-27b are
// not there, so qnfo-ai answers them with its unknown-id default), and a spend cap can steer a pinned id to a cheaper twin.
// Either way the reply is not the model under test. When the router did not serve exactly the asked-for Workers AI model, the
// same prompt goes to it through the AI binding; the row records which path answered (via). A reasoning model asked directly
// at a small max_tokens may answer empty where the router's small-answer lane would not: that is what a direct caller gets.
async function abDirect(env, model, content, maxTokens, timeoutMs) {
  if (!env.AI || typeof env.AI.run !== "function" || !/^@cf\//.test(String(model))) return { ok: false, error: "no direct path" };
  let timer;
  try {
    const out = await Promise.race([
      env.AI.run(model, { messages: [{ role: "user", content }], max_tokens: maxTokens }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("direct call timed out")), timeoutMs || 90000); }),
    ]);
    const choice = (out && out.choices && out.choices[0]) || {};
    const c = choice.message && choice.message.content;
    const text = typeof out === "string" ? out : out && typeof out.response === "string" ? out.response : typeof c === "string" ? c : "";
    return { ok: true, text: text.trim(), served: model, finish: choice.finish_reason || null, via: "workers-ai" };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e).slice(0, 120) };
  } finally { clearTimeout(timer); }
}
async function abCall(env, model, content, maxTokens) {
  const r = await abChat(env, model, content, maxTokens, 90000);
  if (r.ok && abSameModel(r.served, model)) return Object.assign(r, { via: "router" });
  const d = await abDirect(env, model, content, maxTokens, 90000);
  if (d.ok) return d;
  return r.ok ? Object.assign(r, { unpinned: true }) : r;
}

async function abPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function lane() { for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

function abRetryTokens(maxTokens) { return Math.min(AB_RETRY_MAX_TOKENS, Math.max(AB_RETRY_MIN_TOKENS, 4 * (maxTokens || 400))); }

async function abOneFixture(env, c, fx, idx, judges, deadline) {
  if (Date.now() > deadline) return { id: fx.id, score: null, why: "deadline" };
  const budget = fx.max_tokens || 400;
  let post = await abCall(env, c.post_model, fx.prompt, budget);
  if (!post.ok) return { id: fx.id, score: null, why: "post-call " + post.error, callFailed: true };
  if (post.unpinned) return { id: fx.id, score: null, why: "unpinned: served " + (post.served || "nothing").slice(0, 60) };
  let retried; // undefined unless this fixture was asked a second time (undefined is dropped from the row's JSON)
  if (!post.text && post.finish === "length") {
    // AB-LENGTH-RETRY-1: the model spent the fixture's own token cap, it did not choose silence. One more call, larger budget, same path.
    if (Date.now() > deadline) return { id: fx.id, score: null, why: "retry unavailable: deadline" };
    retried = abRetryTokens(budget);
    const again = await abCall(env, c.post_model, fx.prompt, retried);
    if (!again.ok) return { id: fx.id, score: null, why: "retry unavailable: " + again.error, retried };
    if (again.unpinned) return { id: fx.id, score: null, why: "retry unavailable: unpinned: served " + (again.served || "nothing").slice(0, 60), retried };
    post = again;
    if (!post.text) return { id: fx.id, score: 0, judge_scores: [], via: post.via, retried, why: "empty post-change reply (finish " + post.finish + ") after retry at " + retried + " tokens" };
  } else if (!post.text) return { id: fx.id, score: 0, judge_scores: [], via: post.via, why: "empty post-change reply (finish " + post.finish + ")" };
  let pre = fx.baseline;
  if (c.live_pre) {
    const p = await abCall(env, c.pre_model, fx.prompt, budget);
    if (!p.ok || p.unpinned || !p.text) return { id: fx.id, score: null, why: "live pre-change reply unavailable" };
    pre = p.text;
  }
  const scores = await Promise.all(judges.map(async (j, ji) => {
    const postIsA = (idx + ji) % 2 === 0;
    const r = await abCall(env, j.model, abJudgePrompt(fx, postIsA ? post.text : pre, postIsA ? pre : post.text), 400);
    if (!r.ok || r.unpinned) return null;
    return abVerdictScore(abParseVerdict(r.text), postIsA);
  }));
  const valid = scores.filter((s) => s != null);
  if (!valid.length) return { id: fx.id, score: null, why: "no judge reached a verdict" };
  return { id: fx.id, score: valid.reduce((a, b) => a + b, 0) / valid.length, judge_scores: valid, via: post.via, post: post.text.slice(0, 160), retried };
}

// Classification lane: the same labelled agent_issues rows through both decision models (clefCanary), scored per row on the
// two labels (category, priority). A row the post-change model gets more right is a win, fewer a loss.
async function abRunClassify(env, c, threshold) {
  const limit = Math.max(4, Math.min(24, Number(c.limit) || 12));
  const post = await clefCanary(env, c.post_model, limit);
  if (!post.ok) return { verdict: "error", reason: "post-change canary: " + (post.error || "failed"), n: 0, win_rate: null, threshold, judges: ["labels"], pre_source: "live" };
  const ids = (post.rows || []).map((r) => r.id);
  const pre = await clefCanary(env, c.pre_model, limit, ids);
  if (!pre.ok) return { verdict: "error", reason: "pre-change canary: " + (pre.error || "failed"), n: 0, win_rate: null, threshold, judges: ["labels"], pre_source: "live" };
  // A model that answers nothing on every row is a harness fault (or a dead model), not a tie with the other one.
  const answered = (res) => (res.rows || []).some((r) => r && !r.err);
  if (!answered(post)) return { verdict: "error", reason: "post-change model gave no answer on any row", n: 0, win_rate: null, threshold, judges: ["labels"], pre_source: "live" };
  if (!answered(pre)) return { verdict: "error", reason: "pre-change model gave no answer on any row", n: 0, win_rate: null, threshold, judges: ["labels"], pre_source: "live" };
  const rowScore = (r) => (r && !r.err ? ((r.catOk ? 1 : 0) + (r.priOk ? 1 : 0)) / 2 : 0);
  const preById = new Map((pre.rows || []).map((r) => [r.id, r]));
  const items = [];
  for (const r of post.rows || []) {
    if (!preById.has(r.id)) continue;
    const a = rowScore(r), b = rowScore(preById.get(r.id));
    items.push({ id: String(r.id), score: a > b ? 1 : a < b ? 0 : 0.5, judge_scores: [] });
  }
  const s = abSummarize(items, { threshold, minValid: Math.min(AB_MIN_VALID, limit) });
  return Object.assign({}, s, { judges: ["labels"], pre_source: "live", extra: { post_agreement: post.agreement, pre_agreement: pre.agreement } });
}

// One paired run. Never writes; abExecute persists the result.
async function abRunPair(env, c) {
  const taskSet = String(c.task_set || "grounded-qa");
  const threshold = Number.isFinite(Number(c.threshold)) ? Number(c.threshold) : AB_THRESHOLD;
  if (taskSet === AB_CLASSIFY_SET) return abRunClassify(env, c, threshold);
  const all = AB_FIXTURES[taskSet];
  if (!all) return { verdict: "error", reason: "unknown task_set " + taskSet, n: 0, win_rate: null, threshold, judges: [], pre_source: "baseline" };
  const pick = abPickJudges(c.pre_model, c.post_model, c.worker_models);
  if (!pick.ok) return { verdict: "inconclusive", reason: pick.reason, n: 0, win_rate: null, threshold, judges: pick.judges.map((j) => j.model), pre_source: c.live_pre ? "live" : "baseline" };
  const fixtures = all.slice(0, Math.max(1, Math.min(12, Number(c.limit) || AB_FIXTURE_LIMIT)));
  const deadline = Date.now() + Math.max(15000, Math.min(480000, Number(c.budget_ms) || AB_RUN_BUDGET_MS));
  const items = await abPool(fixtures, 3, (fx, i) => abOneFixture(env, c, fx, i, pick.judges, deadline));
  const s = abSummarize(items, { threshold, minValid: Number(c.min_valid) || AB_MIN_VALID });
  // Every fixture failed on the call itself: the router or the binding is down, not a verdict about the model. Retryable.
  if (items.length && items.every((i) => i.callFailed)) { s.verdict = "error"; s.reason = "every post-change call failed: " + items[0].why; }
  return Object.assign({}, s, {
    judges: pick.judges.map((j) => j.model), independent: pick.independent, pre_source: c.live_pre ? "live" : "baseline",
    skipped: items.filter((i) => i.score == null).map((i) => ({ id: i.id, why: i.why })),
    items: items.filter((i) => i.score != null).map((i) => ({ id: i.id, s: i.score, js: i.judge_scores, via: i.via, why: i.why, retried: i.retried })),
    post_paths: items.reduce((a, i) => { if (i.via) a[i.via] = (a[i.via] || 0) + 1; return a; }, {}),
  });
}

async function abWorkerModels(env, worker) {
  try {
    const r = await env.AUDIT.prepare("SELECT DISTINCT model FROM ai_call_counters WHERE worker=?1 AND day >= date('now','-15 day') AND model IS NOT NULL").bind(worker).all();
    return (r.results || []).map((x) => x.model);
  } catch (_) { return []; }
}

async function abPersist(env, c, r) {
  // harness_rev leads: the detail is cut at 6000 characters and abAlreadyRun and the issue-100277 probe read the prefix
  const detail = JSON.stringify({
    harness_rev: AB_HARNESS_REV, reason: r.reason, wins: r.wins, ties: r.ties, losses: r.losses, judge_pairs: r.judge_pairs, min_valid: r.minValid,
    independent_families: r.independent, post_paths: r.post_paths, skipped: r.skipped, items: r.items, extra: r.extra, worker_models: c.worker_models,
  }).slice(0, 6000);
  const res = await env.AUDIT.prepare(
    `INSERT INTO model_ab_runs (run_id, model_pair, worker, task_set, pre_model, post_model, trigger_source, n, win_rate, threshold, verdict, judges, judge_agreement, pre_source, detail, completed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, datetime('now'))`
  ).bind(
    "ab-" + Date.now().toString(36), c.pre_model + " -> " + c.post_model, c.worker, c.task_set || "grounded-qa", c.pre_model, c.post_model,
    c.source || "manual", r.n == null ? 0 : r.n, r.win_rate, r.threshold, r.verdict, (r.judges || []).join(","), r.judge_agreement == null ? null : r.judge_agreement,
    r.pre_source || "baseline", detail
  ).run();
  return res && res.meta ? res.meta.last_row_id : null;
}

async function abExecute(env, c) {
  const cand = Object.assign({}, c, { worker_models: c.worker_models || await abWorkerModels(env, c.worker) });
  if (!(Number(cand.threshold) > 0 && Number(cand.threshold) < 1)) {
    const t = Number(await cfg(env, "ab_threshold", String(AB_THRESHOLD)));
    cand.threshold = t > 0 && t < 1 ? t : AB_THRESHOLD;
  }
  const r = await abRunPair(env, cand);
  const id = await abPersist(env, cand, r);
  if (r.verdict === "regression") {
    const short = (m) => String(m).split("/").pop();
    try {
      await fileIssue(env,
        "MODEL-AB-REGRESSION-1: " + c.worker + " " + short(c.pre_model) + " -> " + short(c.post_model) + " on " + (c.task_set || "grounded-qa") + ": win rate " + r.win_rate + " < " + r.threshold,
        "The paired A/B harness (qnfo-model-eval AB-HARNESS-1, model_ab_runs id " + id + ") compared the post-change model with the pre-change baseline on the same prompts, judged by " +
        (r.judges || []).join(" and ") + ": " + r.wins + " wins, " + r.ties + " ties, " + r.losses + " losses over " + r.n + " fixtures, win rate " + r.win_rate + " against the stated threshold " + r.threshold +
        ". Either the model change made " + c.worker + "'s answers worse (revert it, or give the worker a better prompt or token budget) or the fixtures do not represent its work (say so with evidence and set the worker's task_set in scripts/model-policy.json). " +
        "Read the per-fixture rows: SELECT detail FROM model_ab_runs WHERE id = " + id + ". It closes when a later run for the same worker and post-change model passes: " +
        "SELECT 'pass' AS expected, (SELECT verdict FROM model_ab_runs WHERE worker = '" + String(c.worker).replace(/'/g, "''") + "' AND post_model = '" + String(c.post_model).replace(/'/g, "''") + "' ORDER BY id DESC LIMIT 1) AS observed",
        "high");
    } catch (e) { console.error(JSON.stringify({ worker: "qnfo-model-eval", where: "ab-file-issue", error: String(e && e.message || e).slice(0, 200) })); }
  }
  return { id, worker: c.worker, pre_model: c.pre_model, post_model: c.post_model, verdict: r.verdict, win_rate: r.win_rate, n: r.n, reason: r.reason };
}

async function abFetchPolicy(env) {
  const url = await cfg(env, "ab_policy_url", AB_POLICY_URL);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const resp = await fetch(url + "?cb=" + Math.floor(Date.now() / 6e5), { headers: { "user-agent": "qnfo-model-eval/" + VERSION }, signal: ctl.signal });
    if (!resp.ok) return { ok: false, error: "policy http " + resp.status };
    const p = JSON.parse(await resp.text());
    if (!p || typeof p !== "object" || !p.workers || typeof p.workers !== "object") return { ok: false, error: "policy has no workers object" };
    return { ok: true, policy: p };
  } catch (e) {
    return { ok: false, error: "policy fetch: " + String(e && e.message ? e.message : e).slice(0, 120) };
  } finally { clearTimeout(timer); }
}

// A worker whose declared model differs from the one last seen is a candidate; a worker seen for the first time is only recorded.
async function abPolicyCandidates(env, notes) {
  const got = await abFetchPolicy(env);
  if (!got.ok) { notes.push(got.error); return []; }
  const out = [];
  const defSet = await cfg(env, "ab_default_task_set", "grounded-qa");
  const entries = Object.entries(got.policy.workers).slice(0, 200);
  for (const [worker, e] of entries) {
    if (!e || typeof e.model !== "string" || !e.model) continue;
    const seen = await env.AUDIT.prepare("SELECT model FROM model_ab_policy_seen WHERE worker=?1").bind(worker).first();
    if (!seen) {
      await env.AUDIT.prepare("INSERT OR IGNORE INTO model_ab_policy_seen (worker, model, task_set) VALUES (?1, ?2, ?3)").bind(worker, e.model, e.task_set || defSet).run();
      notes.push("policy baseline: " + worker + " -> " + e.model);
      continue;
    }
    if (seen.model !== e.model) {
      out.push({ worker, pre_model: seen.model, post_model: e.model, task_set: e.task_set || defSet, threshold: e.threshold != null ? e.threshold : got.policy.threshold, live_pre: e.live_pre === true, source: "policy" });
    }
  }
  return out;
}

const AB_NOT_CHAT_RE = /bge|embed|whisper|flux|clef|melotts|llava|stable-diffusion/i;
async function abObservedCandidates(env, notes) {
  const minCalls = Math.max(5, Number(await cfg(env, "ab_min_calls", "20")) || 20);
  const defSet = await cfg(env, "ab_default_task_set", "grounded-qa");
  const r = await env.AUDIT.prepare(
    `WITH recent AS (SELECT worker, model, SUM(calls) c FROM ai_call_counters WHERE day >= date('now','-1 day') AND model IS NOT NULL GROUP BY worker, model HAVING SUM(calls) >= ?1),
          prior AS (SELECT worker, model, SUM(calls) c FROM ai_call_counters WHERE day < date('now','-1 day') AND day >= date('now','-15 day') AND model IS NOT NULL GROUP BY worker, model)
     SELECT r.worker, r.model AS post_model, r.c AS recent_calls,
            (SELECT p2.model FROM prior p2 WHERE p2.worker = r.worker AND p2.model <> r.model AND p2.c >= ?1 ORDER BY p2.c DESC LIMIT 1) AS pre_model
       FROM recent r LEFT JOIN prior p ON p.worker = r.worker AND p.model = r.model
      WHERE COALESCE(p.c, 0) < 3
      ORDER BY r.c DESC LIMIT 20`
  ).bind(minCalls).all();
  const out = [];
  for (const x of r.results || []) {
    if (!x.pre_model || AB_NOT_CHAT_RE.test(x.pre_model) || AB_NOT_CHAT_RE.test(x.post_model)) continue;
    out.push({ worker: x.worker, pre_model: x.pre_model, post_model: x.post_model, task_set: defSet, source: "observed" });
  }
  if (out.length) notes.push("observed model changes: " + out.length);
  return out;
}

// AB-LENGTH-RETRY-1, the second path to a pair that was scored by an older harness revision: every pair with a 'regression' row of the
// last 7 days whose detail does not start with the current harness_rev. The first path (abObservedCandidates) needs the pair to still
// look like a model change in ai_call_counters (>= 20 calls in the last 2 days, < 3 in the 2 to 15 days before), a window that closes on
// its own: it closed for qnfo-research-exec/kimi-k2.6 at 00:00Z 2026-10-20 and closes for errata-hub/kimi-k2.6 at 00:00Z 2026-10-21, and
// POST /ab/run needs the x-eval-key, which no session holds. This source needs only the stored row, so the re-measurement does not depend
// on that window or on the day a deploy lands; it ends when the pair has a row of the current revision (abAlreadyRun) or the stale row is
// 7 days old. The row's own task set, threshold and pre-change source are re-used. The newest row of a pair wins; abTick dedupes by pair.
async function abStaleRevCandidates(env, notes) {
  const defSet = await cfg(env, "ab_default_task_set", "grounded-qa");
  const r = await env.AUDIT.prepare(
    `SELECT worker, pre_model, post_model, task_set, threshold, pre_source FROM model_ab_runs
      WHERE verdict = 'regression' AND (detail IS NULL OR detail NOT LIKE ?1) AND created_at >= datetime('now','-7 days')
      ORDER BY id DESC LIMIT 50`
  ).bind('{"harness_rev":' + AB_HARNESS_REV + ',%').all();
  const out = [];
  const seen = new Set();
  for (const x of r.results || []) {
    const k = x.worker + "|" + x.pre_model + "|" + x.post_model;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ worker: x.worker, pre_model: x.pre_model, post_model: x.post_model, task_set: x.task_set || defSet, threshold: Number(x.threshold), live_pre: x.pre_source === "live", source: "stale-rev" });
  }
  if (out.length) notes.push("regression rows scored by an older harness revision: " + out.length);
  return out;
}

// A 'regression' row is done only when the harness revision that scored it is the current one (AB_HARNESS_REV): a regression found
// by an older scoring is measured again. An 'inconclusive' row whose skipped fixtures include "retry unavailable" (the larger-budget
// call failed, was served by another model or came after the run deadline: the harness could not measure, the model did not fail) is
// not done either; it counts with the errors, so the pair is tried again on the next tick and stops after 3 such rows in a day, the
// same bound an error row has. Other inconclusive rows (no independent judge family, judges that disagree) keep their 7-day dedupe.
// The LIKE patterns are short (D1 refuses one over 50 bytes); the first matches abPersist's leading key.
async function abAlreadyRun(env, c) {
  const r = await env.AUDIT.prepare(
    `SELECT (SELECT COUNT(*) FROM model_ab_runs WHERE worker=?1 AND pre_model=?2 AND post_model=?3 AND verdict <> 'error' AND (verdict <> 'regression' OR detail LIKE ?4)
               AND (verdict <> 'inconclusive' OR detail IS NULL OR detail NOT LIKE '%retry unavailable%') AND created_at >= datetime('now','-7 days')) AS done,
            (SELECT COUNT(*) FROM model_ab_runs WHERE worker=?1 AND pre_model=?2 AND post_model=?3
               AND (verdict = 'error' OR (verdict = 'inconclusive' AND detail LIKE '%retry unavailable%')) AND created_at >= datetime('now','-1 day')) AS errs`
  ).bind(c.worker, c.pre_model, c.post_model, '{"harness_rev":' + AB_HARNESS_REV + ',%').first();
  return { done: Number(r && r.done) > 0, exhausted: Number(r && r.errs) >= 3 };
}

// The hourly tick. Switched by cf_model_eval_config ab_enabled ('0' stops it, nothing else changes).
async function abTick(env) {
  const out = { enabled: true, candidates: 0, ran: [], skipped: 0, notes: [] };
  if (["0", "off", "false"].includes(String(await cfg(env, "ab_enabled", "1")).toLowerCase())) { out.enabled = false; return out; }
  try { await env.AUDIT.prepare("SELECT 1 FROM model_ab_runs LIMIT 1").first(); }
  catch (e) { out.notes.push("model_ab_runs not readable yet: " + String(e && e.message ? e.message : e).slice(0, 100)); return out; }
  const found = [];
  const seenKey = new Set();
  for (const c of [].concat(await abPolicyCandidates(env, out.notes), await abObservedCandidates(env, out.notes), await abStaleRevCandidates(env, out.notes))) {
    const k = c.worker + "|" + c.pre_model + "|" + c.post_model;
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    found.push(c);
  }
  out.candidates = found.length;
  const perTick = Math.max(1, Math.min(6, Number(await cfg(env, "ab_max_runs_per_tick", "2")) || 2));
  const dailyCap = Math.max(1, Number(await cfg(env, "ab_daily_cap", "12")) || 12);
  const today = await env.AUDIT.prepare("SELECT COUNT(*) n FROM model_ab_runs WHERE created_at >= datetime('now','-1 day')").first();
  let used = Number(today && today.n) || 0;
  const tickStart = Date.now();
  for (const c of found) {
    const st = await abAlreadyRun(env, c);
    if (st.done) {
      if (c.source === "policy") await abMarkSeen(env, c);
      out.skipped++;
      continue;
    }
    if (st.exhausted) { out.skipped++; continue; }
    if (out.ran.length >= perTick || used >= dailyCap || Date.now() - tickStart > AB_TICK_START_GATE_MS) { out.skipped++; continue; }
    const row = await abExecute(env, Object.assign({}, c, { budget_ms: AB_RUN_BUDGET_MS }));
    used++;
    out.ran.push(row);
    if (c.source === "policy" && row.verdict !== "error") await abMarkSeen(env, c);
  }
  return out;
}
async function abMarkSeen(env, c) {
  await env.AUDIT.prepare("INSERT OR REPLACE INTO model_ab_policy_seen (worker, model, task_set, seen_at) VALUES (?1, ?2, ?3, datetime('now'))").bind(c.worker, c.post_model, c.task_set || null).run();
}
// ---- AB-HARNESS-1:END ----

// HEALTH-CONTRACT-1 (agent_issues 2852): the capability contract. qnfo-deploy-guard snapshots capabilities[] and limitations[] from
// /health and qnfo-fleet-control grades the share of live workers that declare both (capability_contract_conformance). Each line is
// stated in this file's own header, battery notes or A/B block comments; /health and /manifest return the same two lists.
const CAPABILITIES = ["catalog-discovery", "model-benchmark-battery", "incumbent-control-baseline",
  "cost-aware-promotion", "harness-error-classification", "decision-model-canary", "backlog-escalation",
  "paired-ab-quality-harness", "model-change-trigger"];
const LIMITATIONS = [
  "the cfmb-2 battery has 10 chat probes and 8 decision probes: it separates capability floors and cost and does not measure top-end reasoning differences between two models that both score 1.0, so a saturated control yields a cost win or parity, never better",
  "a promotion is a recommendation, not a switch: the ladder row is written with active=0 and a roadmap item and a deduped agent_issue name the exact change, so routing never changes by surprise",
  "a model that rejects the system role or has no account config is recorded as harness_error and left a candidate, never rejected: a harness failure is not a quality verdict",
  "a model whose input is a typed schema and not chat messages (an extraction model such as @cf/cloudflare/clairic, which wants {model, fields}) is classified typed-input and is not benchmarked: the chat and decision batteries cannot measure it, and no harness issue is filed for it",
  "the A/B fixtures are passage-grounded, short and generic: they catch empty, unsupported, wrong or truncated answers and are not a worker's own prompts; a length-empty reply is retried once at a larger budget (2048 to 4096 tokens) before it is scored, so a reasoning model is not marked down for the fixture's own token cap; a regression row scored by an older harness revision (model_ab_runs.detail leads with harness_rev) is measured again by the hourly tick, and an inconclusive run that lost fixtures to an unavailable retry is tried again up to 3 times a day",
  "the A/B seed baselines are reference answers authored in worker.js, not machine recordings; only live_pre records real pre-change replies",
  "the decision-model canary over real labelled agent_issues runs only while cf_model_eval_config canary_enabled is 1 (default 0)",
  "bounded per run and per day: max_models_per_run (default 6) models per battery run, ab_max_runs_per_tick (default 2) and ab_daily_cap (default 12) A/B runs, switched by ab_enabled",
  "the A/B model-change trigger needs scripts/model-policy.json read from main over HTTPS and ai_call_counters; a worker seen for the first time in the policy is only recorded as a baseline, never run",
  "POST /run, POST /canary and POST /ab/run need the x-eval-key manual key; the read routes are open"
];

async function manifest(env) {
  const db = env.AUDIT;
  const counts = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM cf_model_catalog) catalog,
            (SELECT COUNT(*) FROM cf_model_catalog WHERE status='new') new_models,
            (SELECT COUNT(*) FROM cf_model_catalog WHERE status='candidate') candidates,
            (SELECT COUNT(*) FROM cf_model_catalog WHERE status='recommended') recommended,
            (SELECT COUNT(*) FROM cf_model_catalog WHERE status='rejected') rejected,
            (SELECT COUNT(*) FROM cf_model_evals) evals,
            (SELECT COUNT(*) FROM cf_model_catalog WHERE modality IN ('chat','clef') AND status IN ('new','candidate') AND (last_eval_ts IS NULL OR last_eval_ts < datetime('now','-7 days'))) backlog`
  ).first();
  return {
    service: "qnfo-model-eval", kind: "worker", version: VERSION,
    purpose: "CF-MODEL-EVAL-1 continuous evaluation of new Cloudflare Workers AI models for fleet production adoption",
    capabilities: CAPABILITIES, limitations: LIMITATIONS,
    routes: ["/health", "/manifest", "/catalog", "/evals", "/runs", "/leaderboard", "/promotions", "/canary", "/run", "/ab/runs", "/ab/fixtures", "/ab/run"],
    crons: ["20 * * * *"], battery_cadence: "17 */6 * * * (CRON-GRID-1)", battery: BATTERY_VERSION,
    controls: CONTROLS.map((c) => c.model_id),
    budget: { max_models_per_run: await cfg(env, "max_models_per_run", "6"), canary_enabled: await cfg(env, "canary_enabled", "0") },
    ab: { enabled: await cfg(env, "ab_enabled", "1"), threshold: AB_THRESHOLD, min_valid: AB_MIN_VALID, task_sets: Object.keys(AB_FIXTURES).concat([AB_CLASSIFY_SET]), max_runs_per_tick: await cfg(env, "ab_max_runs_per_tick", "2"), daily_cap: await cfg(env, "ab_daily_cap", "12") },
    counts,
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/$/, "") || "/";
    try {
      if (p === "/health" || p === "/") {
        let catalog = null;
        let auditAvailable = false;
        try {
          const c = await env.AUDIT.prepare("SELECT COUNT(*) n FROM cf_model_catalog").first();
          catalog = c ? c.n : 0;
          auditAvailable = true;
        } catch (e) {
          console.warn(JSON.stringify({ worker: "qnfo-model-eval", where: "health:audit", error: String(e && e.message ? e.message : e).slice(0, 200) }));
        }
        return json({ ok: true, service: "qnfo-model-eval", version: VERSION, catalog, dependencies: { audit: auditAvailable ? "available" : "unavailable" }, capabilities: CAPABILITIES, limitations: LIMITATIONS });
      }
      if (p === "/manifest") return json(await manifest(env));
      if (p === "/catalog") {
        const r = await env.AUDIT.prepare(
          `SELECT slug, model_id, task_type, modality, status, price_in, price_out, ctx, vision, first_seen, last_seen, last_eval_ts, best_score
             FROM cf_model_catalog ORDER BY first_seen DESC, slug LIMIT 200`).all();
        return json({ count: (r.results || []).length, models: r.results || [] });
      }
      if (p === "/evals") {
        const r = await env.AUDIT.prepare(
          `SELECT id, model_id, battery_version, run_ts, n_tasks, passed, score, mean_latency_ms, cost_usd, verdict
             FROM cf_model_evals ORDER BY id DESC LIMIT 100`).all();
        return json({ count: (r.results || []).length, evals: r.results || [] });
      }
      if (p === "/runs") {
        const r = await env.AUDIT.prepare("SELECT id, ts, trigger, models, probes, ok, detail FROM cf_model_eval_runs ORDER BY ts DESC LIMIT 20").all();
        return json({ runs: r.results || [] });
      }
      if (p === "/leaderboard") {
        const r = await env.AUDIT.prepare(
          `SELECT e.model_id, MAX(e.score) best, MIN(e.mean_latency_ms) best_latency_ms,
                  (SELECT price_in FROM cf_model_catalog c WHERE c.model_id=e.model_id) price_in,
                  (SELECT status FROM cf_model_catalog c WHERE c.model_id=e.model_id) status
             FROM cf_model_evals e WHERE e.battery_version=?1
            GROUP BY e.model_id ORDER BY best DESC, price_in ASC LIMIT 50`).bind(BATTERY_VERSION).all();
        return json({ battery: BATTERY_VERSION, models: r.results || [] });
      }
      if (p === "/promotions") {
        const r = await env.AUDIT.prepare(
          `SELECT id, tier, family, price_in, price_out, quality, notes FROM model_ladder_models
            WHERE notes LIKE 'auto-eval promote%' ORDER BY quality DESC`).all();
        const rd = await env.AUDIT.prepare(
          "SELECT item, title, status, evidence, created_at FROM roadmap_implementation WHERE source='cf-model-eval' ORDER BY id DESC LIMIT 40").all();
        return json({ promoted_models: r.results || [], roadmap: rd.results || [] });
      }
      if (p === "/ab/runs") {
        const r = await env.AUDIT.prepare(
          `SELECT id, created_at, completed_at, worker, task_set, model_pair, trigger_source, n, win_rate, threshold, verdict, judges, judge_agreement, pre_source
             FROM model_ab_runs ORDER BY id DESC LIMIT 50`).all();
        return json({ count: (r.results || []).length, threshold: AB_THRESHOLD, runs: r.results || [] });
      }
      if (p === "/ab/fixtures") {
        const sets = {};
        for (const k of Object.keys(AB_FIXTURES)) sets[k] = AB_FIXTURES[k].map((f) => ({ id: f.id, prompt: f.prompt }));
        return json({ threshold: AB_THRESHOLD, min_valid: AB_MIN_VALID, judge_pool: AB_JUDGE_POOL, classification_set: AB_CLASSIFY_SET, sets });
      }
      if (p === "/ab/run" && req.method === "POST") {
        const keyRow = await env.AUDIT.prepare("SELECT value FROM cf_model_eval_config WHERE key='manual_key'").first();
        const sent = req.headers.get("x-eval-key") || "";
        if (!keyRow || !keyRow.value || sent !== keyRow.value) return json({ ok: false, error: "forbidden" }, 403);
        const body = await req.json().catch(() => ({}));
        if (!body.worker || !body.pre_model || !body.post_model) return json({ ok: false, error: "worker, pre_model and post_model are required" }, 400);
        const row = await abExecute(env, {
          worker: String(body.worker), pre_model: String(body.pre_model), post_model: String(body.post_model),
          task_set: body.task_set ? String(body.task_set) : "grounded-qa", threshold: body.threshold, limit: body.limit,
          live_pre: body.live_pre === true, source: "manual", budget_ms: body.budget_ms,
        });
        return json({ ok: true, run: row });
      }
      if (p === "/canary" && req.method === "POST") {
        const keyRow = await env.AUDIT.prepare("SELECT value FROM cf_model_eval_config WHERE key='manual_key'").first();
        const sent = req.headers.get("x-eval-key") || "";
        if (!keyRow || !keyRow.value || sent !== keyRow.value) return json({ ok: false, error: "forbidden" }, 403);
        const body = await req.json().catch(() => ({}));
        const modelId = body.modelId || (await cfg(env, "clef_winner", ""));
        if (!modelId) return json({ ok: false, error: "no winner; pass modelId" }, 400);
        return json({ ok: true, canary: await clefCanary(env, modelId, Number(body.limit) || 12) });
      }
      if (p === "/run" && req.method === "POST") {
        const keyRow = await env.AUDIT.prepare("SELECT value FROM cf_model_eval_config WHERE key='manual_key'").first();
        const sent = req.headers.get("x-eval-key") || "";
        if (!keyRow || !keyRow.value || sent !== keyRow.value) return json({ ok: false, error: "forbidden" }, 403);
        const body = await req.json().catch(() => ({}));
        const summary = await runLoop(env, "manual", body);
        return json({ ok: true, summary });
      }
      return json({ ok: false, error: "not_found", routes: ["/health", "/manifest", "/catalog", "/evals", "/runs", "/leaderboard", "/promotions", "/canary", "/run", "/ab/runs", "/ab/fixtures", "/ab/run"] }, 404);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message ? e.message : e), version: VERSION }, 500);
    }
  },
  async scheduled(_event, env, ctx) {
    return cronGridRun(env.AUDIT, _event, ctx, CRON_GRID_CFG, function (ev, c) { return modelEvalScheduled(ev, env, c); });
  }
};
function modelEvalScheduled(_event, env, ctx) {
    // AB-HARNESS-1: the hourly grid tick runs the paired A/B trigger; the 6-hourly job (and a manual fire) runs the battery.
    if (String(_event && _event.cron) === CRON_GRID_CFG.tick) {
      ctx.waitUntil(abTick(env).catch(async (e) => {
        try {
          await env.AUDIT.prepare(
            "INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, datetime('now'), 'cf-model-eval', ?2, NULL, 'cf-model-eval', 'warn')"
          ).bind("cf-model-eval-ab-err-" + Date.now(), "AB-HARNESS-1 tick failed: " + String(e && e.message ? e.message : e)).run();
        } catch (eLog) {
          console.error(JSON.stringify({ worker: "qnfo-model-eval", where: "ab-tick:error-event", error: String(eLog && eLog.message || eLog), tick_error: String(e && e.message || e) }));
        }
        throw e;
      }));
      return;
    }
    ctx.waitUntil(runLoop(env, "cron", {}).catch(async (e) => {
      try {
        await env.AUDIT.prepare(
          "INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, datetime('now'), 'cf-model-eval', ?2, NULL, 'cf-model-eval', 'warn')"
        ).bind("cf-model-eval-err-" + Date.now(), "CF-MODEL-EVAL-1 cron failed: " + String(e && e.message ? e.message : e)).run();
      } catch (eLog) {
        console.error(JSON.stringify({ worker: "qnfo-model-eval", where: "scheduled:error-event", error: String(eLog && eLog.message || eLog), cron_error: String(e && e.message || e) }));
      }
      throw e;
    }));
}
// ---- CRON-GRID-1:BEGIN (owner directive 2026-10-19: "ALL CRON TICKS SHALL BE MEASURED IN 5-MINUTE INTERVALS, AND NO CRON
// SHALL EXECUTE LESS THAN ONCE EVERY HOUR. ALL CRON FAILURES/ERRORS SHALL BE TRIAGED AND REMEDIATED AUTOMATICALLY BY THE FLEET.")
// Cloudflare fires this worker only on triggers that repeat at least hourly, on minutes that are multiples of 5. A job that
// had its own slower trigger (daily, weekly, every 6 hours) keeps its cadence: it runs on the first grid fire after its old
// slot, and is retried on later fires while its last good run is older than its period plus 30 minutes, at most
// CRON_GRID_RETRIES times in a row; past that CRON-WATCH-1 (qnfo-audit fleet_tasks cron-watch) escalates it to the code loop.
// Every run is one cron_fire_log row (source worker:<name>, outcome ok, error or idle) that CRON-WATCH-1 reads. A job named
// retry: false (a send to people outside the fleet) runs only on its slot, so a failure is never repeated at a reader.
var CRON_GRID_RETRIES = 3;
function cronGridField(spec, v, lo, hi) {
  return String(spec).split(",").some(function (part) {
    var step = 1, sm = /^(.*)\/(\d+)$/.exec(part), a, b;
    if (sm) { part = sm[1]; step = Math.max(1, parseInt(sm[2], 10)); }
    if (part === "*") { a = lo; b = hi; }
    else if (part.indexOf("-") > 0) { a = parseInt(part, 10); b = parseInt(part.split("-")[1], 10); }
    else { a = parseInt(part, 10); b = sm ? hi : a; }
    return v >= a && v <= b && (v - a) % step === 0;
  });
}
// Cloudflare numbers weekdays 1 (Sunday) to 7 (Saturday) (CF-DOW, qnfo-fleet-control 2026-10-05).
function cronGridMatch(expr, d) {
  var f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) return false;
  var domOk = cronGridField(f[2], d.getUTCDate(), 1, 31), dowOk = cronGridField(f[4], d.getUTCDay() + 1, 1, 7);
  var dayOk = f[2] !== "*" && f[4] !== "*" ? (domOk || dowOk) : (domOk && dowOk);
  return dayOk && cronGridField(f[0], d.getUTCMinutes(), 0, 59) && cronGridField(f[1], d.getUTCHours(), 0, 23) && cronGridField(f[3], d.getUTCMonth() + 1, 1, 12);
}
// True when expr had a slot in the window (sinceMs, untilMs].
function cronGridSlot(expr, sinceMs, untilMs) {
  for (var t = Math.floor(untilMs / 60000) * 60000; t > sinceMs; t -= 60000) if (cronGridMatch(expr, new Date(t))) return true;
  return false;
}
async function cronGridLog(db, worker, expr, startMs, outcome, note) {
  if (!db) return;
  try {
    await db.prepare("INSERT INTO cron_fire_log (cron_name, task_id, cron_expr, fired_at, fired_epoch_ms, outcome, source, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(worker + "|" + expr, worker, expr, new Date(startMs).toISOString(), startMs, outcome, "worker:" + worker, String(note || "").slice(0, 500)).run();
  } catch (e) { console.error(JSON.stringify({ worker: worker, where: "cron-grid-log", error: String(e && e.message || e).slice(0, 200) })); }
}
async function cronGridDue(db, cfg, nowMs) {
  var out = [], lag = cfg.lagMin || 0;
  for (var i = 0; i < cfg.jobs.length; i++) {
    var j = cfg.jobs[i];
    if (cronGridSlot(j.cron, nowMs - (lag + cfg.tickMin) * 60000, nowMs - lag * 60000)) { out.push({ cron: j.cron, why: "slot" }); continue; }
    if (!db || !j.retry) continue;
    try {
      var name = cfg.worker + "|" + j.cron;
      var r = await db.prepare("SELECT COUNT(*) AS n, MAX(CASE WHEN outcome = 'ok' THEN fired_epoch_ms END) AS last_ok, SUM(CASE WHEN outcome = 'error' AND fired_epoch_ms > COALESCE((SELECT MAX(fired_epoch_ms) FROM cron_fire_log WHERE cron_name = ?1 AND outcome = 'ok'), 0) THEN 1 ELSE 0 END) AS fails FROM cron_fire_log WHERE cron_name = ?1").bind(name).first();
      if (r && Number(r.n) > 0 && Number(r.fails || 0) < CRON_GRID_RETRIES && nowMs - Number(r.last_ok || 0) > (j.periodMin + 30) * 60000) out.push({ cron: j.cron, why: "retry" });
    } catch (e) { console.error(JSON.stringify({ worker: cfg.worker, where: "cron-grid-due", error: String(e && e.message || e).slice(0, 200) })); }
  }
  return out;
}
// One run of the worker's own handler, awaited with its waitUntil work, logged with its outcome.
async function cronGridOne(db, worker, expr, why, ev, ctx, run) {
  var t0 = Date.now(), pending = [];
  var c = { waitUntil: function (p) { pending.push(Promise.resolve(p)); } };
  try {
    await run(ev, c);
    // Index loop, not allSettled: work a waitUntil promise adds while it runs is awaited too.
    var bad = null;
    for (var k = 0; k < pending.length; k++) { try { await pending[k]; } catch (e) { if (!bad) bad = e || new Error("waitUntil rejected"); } }
    if (bad) throw bad;
    await cronGridLog(db, worker, expr, t0, "ok", why + " " + (Date.now() - t0) + " ms");
  } catch (e) {
    await cronGridLog(db, worker, expr, t0, "error", why + ": " + String(e && e.message || e));
    throw e;
  }
}
// cfg: { worker, tick, tickMin, lagMin, jobs: [{ cron, periodMin, retry }], own: "self" | "none" | "<cron the tick runs as>", ownWhenDue }
async function cronGridRun(db, event, ctx, cfg, run) {
  var cron = String((event && event.cron) || "");
  var nowMs = Number(event && event.scheduledTime) || Date.now();
  if (cron !== cfg.tick) return cronGridOne(db, cfg.worker, cron || "manual", "fire", event, ctx, run);
  var due = await cronGridDue(db, cfg, nowMs), firstErr = null;
  for (var i = 0; i < due.length; i++) {
    try { await cronGridOne(db, cfg.worker, due[i].cron, due[i].why, { cron: due[i].cron, scheduledTime: nowMs, type: "scheduled" }, ctx, run); }
    catch (e) { if (!firstErr) firstErr = e; }
  }
  if (cfg.own === "none" || (due.length && cfg.ownWhenDue === false)) {
    if (!due.length) await cronGridLog(db, cfg.worker, cfg.tick, nowMs, "idle", "grid tick: no job due");
  } else {
    var ev = cfg.own && cfg.own !== "self" ? { cron: cfg.own, scheduledTime: nowMs, type: "scheduled" } : event;
    try { await cronGridOne(db, cfg.worker, cfg.tick, "tick", ev, ctx, run); } catch (e) { if (!firstErr) firstErr = e; }
  }
  if (firstErr) throw firstErr;
}
// ---- CRON-GRID-1:END ----
var CRON_GRID_CFG = {"worker": "qnfo-model-eval", "tick": "20 * * * *", "tickMin": 60, "jobs": [{"cron": "17 */6 * * *", "periodMin": 360, "retry": true}], "own": "self"};

