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

// VERSION-BUMP-GUARD-1 requires the literal `var VERSION = "..."` form: this constant is
// what fleet-autoaudit's strict numeric-ahead deploy check and deploy-drift's string
// compare both read. `const` here would make the bundle invisible to deploy-drift.
var VERSION = "1.4.0-canary-glossary";
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
async function decide(env, e, control) {
  const db = env.AUDIT;
  const cScore = control && control.score != null ? control.score : null;
  const price = await priceOf(env, e.model_id);
  const cPrice = control ? await priceOf(env, control.model_id) : { priceIn: null };
  const d = decideVerdict({
    kind: e.kind, score: e.score, controlScore: cScore,
    priceIn: price.priceIn, controlPriceIn: cPrice.priceIn, harness: e.harness,
  });
  const status = d.verdict === "promote" ? "recommended"
    : d.verdict === "reject" ? "rejected"
      : d.verdict === "harness_error" ? "candidate"
        : "passed";

  // never demote or re-status a model already routed in production: record the score only
  await db.prepare(
    `UPDATE cf_model_catalog SET
       status=CASE WHEN status='in_production' THEN 'in_production' ELSE ?2 END,
       last_eval_ts=datetime('now'),
       notes=?4,
       best_score=CASE WHEN best_score IS NULL OR ?3 > best_score THEN ?3 ELSE best_score END
     WHERE model_id=?1`
  ).bind(e.model_id, status, e.score, `last verdict: ${d.verdict} (${d.reason})`).run();

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
    await fileIssue(env,
      `CF-MODEL-EVAL-1: promote ${e.model_id} on the ${DECISION_KINDS.has(e.kind) ? "decision" : "chat"} battery`,
      `Automatic evaluation (${BATTERY_VERSION}) produced a promotion reason:\n\n${d.reason}\n\n` +
      `Model: ${e.model_id}\nScore: ${e.passed}/${e.n_tasks} probes, mean latency ${e.mean_latency_ms}ms\n` +
      `Control: ${control ? control.model_id : "none"} at ${cScore}\n` +
      `Failed probes: ${e.failed_probes || "none"}\n\n` +
      `Action: registered in model_ladder_models with active=0 and on the roadmap as MODEL-${e.model_id}. ` +
      `Flip routing only after the canary agrees (see /canary for decision models).`,
      "medium");
  }
  if (d.verdict === "harness_error") {
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
  return { ...d, status, controlScore: cScore };
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

async function clefCanary(env, modelId, limit = 12) {
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
  const rows = (await db.prepare(
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
    mean_latency_ms: Math.round(lat / Math.max(1, n)), pairs: pairs.slice(0, 6),
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
        WHERE c.model_id NOT IN (${ctrlList})
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

  for (const p of picks) {
    if (Date.now() > deadline) { summary.skipped++; continue; }
    const kind = p.modality === "clef" ? "clef" : "chat";
    const probes = await loadBattery(env, kind);
    if (!probes.length) { summary.errors.push(`no ${kind} probes`); continue; }
    try {
      const e = await evalModel(env, p.model_id, p.slug, kind, probes);
      await recordEval(env, e, "candidate");
      const d = await decide(env, e, kind === "chat" ? control : clefControl);
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
    capabilities: ["catalog-discovery", "model-benchmark-battery", "incumbent-control-baseline",
      "cost-aware-promotion", "harness-error-classification", "decision-model-canary", "backlog-escalation"],
    routes: ["/health", "/manifest", "/catalog", "/evals", "/runs", "/leaderboard", "/promotions", "/canary", "/run"],
    crons: ["17 */6 * * *"], battery: BATTERY_VERSION,
    controls: CONTROLS.map((c) => c.model_id),
    budget: { max_models_per_run: await cfg(env, "max_models_per_run", "6"), canary_enabled: await cfg(env, "canary_enabled", "0") },
    counts,
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/$/, "") || "/";
    try {
      if (p === "/health" || p === "/") {
        const c = await env.AUDIT.prepare("SELECT COUNT(*) n FROM cf_model_catalog").first();
        return json({ ok: true, service: "qnfo-model-eval", version: VERSION, catalog: c ? c.n : 0 });
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
      return json({ ok: false, error: "not_found", routes: ["/health", "/manifest", "/catalog", "/evals", "/runs", "/leaderboard", "/promotions", "/canary", "/run"] }, 404);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message ? e.message : e), version: VERSION }, 500);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runLoop(env, "cron", {}).catch(async (e) => {
      try {
        await env.AUDIT.prepare(
          "INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, datetime('now'), 'cf-model-eval', ?2, NULL, 'cf-model-eval', 'warn')"
        ).bind("cf-model-eval-err-" + Date.now(), "CF-MODEL-EVAL-1 cron failed: " + String(e && e.message ? e.message : e)).run();
      } catch (_) { }
    }));
  }
};
