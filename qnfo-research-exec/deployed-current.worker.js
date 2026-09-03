var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.4.7";
var WORKER = "qnfo-research-exec";
var MODELS = ["@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/qwen/qwen3-30b-a3b-fp8"];
var MAX_NOTE = 4e3;
var MAX_PAPER = 16e3;
var ORCID = "0009-0002-4317-5604";
var AUTHOR = "Rowan Brad Quni-Gudzinas";
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "paper";
}
__name(slugify, "slugify");
async function logEvent(env, kind, text, status) {
  try {
    const id = "re-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
    await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)").bind(id, nowIso(), kind, String(text).slice(0, 800), "{}", WORKER, status || "ok").run();
  } catch (e) {
  }
}
__name(logEvent, "logEvent");
async function runModel(env, prompt, maxTokens) {
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    try {
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.3 });
      const c = r && r.choices && r.choices[0] && r.choices[0].message;
      const text = c ? String(c.content || "") : r && typeof r.response === "string" ? r.response : "";
      if (text && text.trim().length > 40) return text.trim();
      await logEvent(env, "ai-empty", model + " empty/shallow");
    } catch (e) {
      await logEvent(env, "ai-error", model + " threw: " + String(e && e.message || e).slice(0, 250));
    }
  }
  return "";
}
__name(runModel, "runModel");
var NOTE_PROMPT = [
  "You are a research scientist at the QNFO open research collective. Write a focused research note. Output ONLY the note markdown, starting with '## Problem statement'.",
  "Sections: '## Problem statement', '## Prior work' (cite real papers with arXiv IDs or DOIs only, never fabricate), '## Core claim', '## Method', '## Expected result', '## Open questions'.",
  "Under 600 words. Technically precise. No meta-commentary.",
  "Topic:"
].join("\n");
var PAPER_PROMPT = [
  "You are a research scientist writing a short, rigorous, self-contained preprint for open publication on Zenodo. Output ONLY the paper, starting directly with the title line '# <Title>'.",
  "Headings in order: '# <Title>', '## Abstract', '## 1. Introduction', '## 2. Background', '## 3. Analysis', '## 4. Results', '## 5. Discussion', '## 6. Conclusion', '## References'.",
  "Abstract 120-180 words. References must be real and verifiable (arXiv ID or DOI); never invent any. Mark any quantitative claim not yet computed with [to verify]. Write for an adjacent-field expert; define jargon once. No meta-commentary about writing or authorship. Do NOT write any thinking or planning text.",
  "Topic and note:"
].join("\n");
function cleanTitle(md) {
  const m = String(md || "").match(/^#\s+([^#\n]{8,140})$/m);
  if (!m) return "";
  const t = m[1].trim();
  if (/Title:|something like|Let me|the user|maybe|perhaps|fictional|hypothetical|carefully|Hmm|^\d/i.test(t)) return "";
  return t;
}
__name(cleanTitle, "cleanTitle");
function cleanAbstract(md) {
  const m = String(md || "").match(/##\s*Abstract\s*\n\s*([\s\S]{60,2000})/i);
  if (!m) return "";
  const a = m[1].trim();
  if (/Let me|the user wants|carefully|fictional|hypothetical/i.test(a.slice(0, 200))) return "";
  return a.slice(0, 2e3);
}
__name(cleanAbstract, "cleanAbstract");
function reasoningPreamble(md) {
  return /^(Let me|The user|First, let|Okay|Alright|Here's|I'll|I need)/i.test(String(md || "").trim());
}
__name(reasoningPreamble, "reasoningPreamble");
async function markError(env, row, msg) {
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='failed', error=? WHERE id=?").bind(String(msg).slice(0, 300), row.id).run();
}
__name(markError, "markError");
async function zenodo(env, method, path, body, attempt) {
  const sep = path.indexOf("?") >= 0 ? "&" : "?";
  const url = "https://zenodo.org/api/deposit/depositions" + path + sep + "access_token=" + env.ZENODO_TOKEN;
  const n = attempt || 0;
  try {
    const r = await fetch(url, { method, headers: { "User-Agent": "QNFO-research-exec/0.4.6", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : void 0 });
    if ((r.status >= 500 || r.status === 429) && n < 4) {
      await new Promise(function(res) {
        setTimeout(res, 2500 * (n + 1));
      });
      return zenodo(env, method, path, body, n + 1);
    }
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return { _status: r.status, _text: text.slice(0, 200) };
    }
  } catch (e) {
    if (n < 4) {
      await new Promise(function(res) {
        setTimeout(res, 2500 * (n + 1));
      });
      return zenodo(env, method, path, body, n + 1);
    }
    return { _status: 0, _text: String(e && e.message || e).slice(0, 200) };
  }
}
__name(zenodo, "zenodo");
async function publishToZenodo(env, title, abstract, bodyMd, slug) {
  if (!env.ZENODO_TOKEN) return { ok: false, error: "no ZENODO_TOKEN" };
  const dep = await zenodo(env, "POST", "", {});
  if (!dep || !dep.id) return { ok: false, error: "deposit create failed: " + JSON.stringify(dep).slice(0, 200) };
  const id = dep.id;
  const meta = await zenodo(env, "PUT", "/" + id, { metadata: {
    title,
    upload_type: "publication",
    publication_type: "preprint",
    description: (abstract || title).slice(0, 3e3),
    creators: [{ name: AUTHOR, orcid: ORCID }],
    access_right: "open",
    license: "cc-by",
    keywords: ["QNFO", "quantum computing", "energy"],
    notes: "Autonomously generated by the QNFO research pipeline."
  } });
  if (meta && meta._status && meta._status >= 400) return { ok: false, error: "metadata put failed: " + meta._text };
  const bucket = dep.links && dep.links.bucket;
  if (bucket) {
    const fileUrl = bucket + "/" + encodeURIComponent(slug) + ".md?access_token=" + env.ZENODO_TOKEN;
    const up = await fetch(fileUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.4.7" }, body: bodyMd });
    if (!up.ok) return { ok: false, error: "file upload failed: " + up.status };
  }
  const pub = await zenodo(env, "POST", "/" + id + "/actions/publish", {});
  if (!pub || !pub.doi) return { ok: false, error: "publish failed: " + JSON.stringify(pub).slice(0, 250) };
  return { ok: true, doi: pub.doi, conceptdoi: pub.conceptdoi, record: pub.links && pub.links.record || "https://zenodo.org/record/" + pub.id };
}
__name(publishToZenodo, "publishToZenodo");
async function genNote(env, row) {
  const note = await runModel(env, NOTE_PROMPT + "\n\n" + (row.idea || row.summary), MAX_NOTE);
  if (!note) {
    await markError(env, row, "note empty (all models)");
    return { ok: false, stage: "note" };
  }
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='draft', context=? WHERE id=?").bind(String(note).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "note->draft" };
}
__name(genNote, "genNote");
async function genPaper(env, row) {
  const note = row.context || row.idea || row.summary;
  const paper = await runModel(env, PAPER_PROMPT + "\n\n" + (row.idea || row.summary) + "\n\nNOTE:\n" + note, MAX_PAPER);
  if (!paper) {
    await markError(env, row, "paper empty (all models)");
    return { ok: false, stage: "draft" };
  }
  const title = cleanTitle(paper);
  const abstract = cleanAbstract(paper);
  if (!title || !abstract || reasoningPreamble(paper)) {
    const why = !title ? "no clean title" : !abstract ? "no clean abstract" : "reasoning preamble";
    await markError(env, row, "quality gate failed: " + why);
    return { ok: false, stage: "gate" };
  }
  const slug = slugify(title);
  await env.LIVING_PAPER.prepare("INSERT OR REPLACE INTO papers (identifier, title, authors, abstract, body_md, slug, version, status, identifier_type, doi, zenodo_doi, paper_type, license, language) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind("qnf-" + row.source_id, title, JSON.stringify([AUTHOR]), abstract, String(paper).slice(0, 12e4), slug, "1.0.0", "review", "qnfo", null, null, "preprint", "CC BY 4.0", "en").run();
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='publish', status='review', paper_slug=?, context=? WHERE id=?").bind(slug, String(note).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "draft->publish", slug, title };
}
__name(genPaper, "genPaper");
async function publishStage(env, row) {
  const slug = row.paper_slug;
  const paper = await env.LIVING_PAPER.prepare("SELECT * FROM papers WHERE slug=?1").bind(slug).first();
  if (!paper) {
    await markError(env, row, "paper row missing for slug " + slug);
    return { ok: false, stage: "publish" };
  }
  const pub = await publishToZenodo(env, paper.title, paper.abstract, paper.body_md, slug);
  if (!pub.ok) {
    await markError(env, row, "zenodo: " + pub.error);
    return { ok: false, stage: "publish" };
  }
  await env.LIVING_PAPER.prepare("UPDATE papers SET doi=?1, zenodo_doi=?1, status='published', zenodo_url=?2, updated_at=datetime('now') WHERE slug=?3").bind(pub.doi, pub.record, slug).run();
  try {
    await env.MIRROR.put("papers/" + slug + ".md", paper.body_md);
  } catch (e) {
  }
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_doi, paper_title, channel, action, mode, fallback, zenodo_url, pages_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind("res-" + Date.now().toString(36), slug, pub.doi, paper.title, "bluesky", "queued", "auto", 0, pub.record, "https://papers.qnfo.org/papers/" + slug + "/").run();
  } catch (e) {
  }
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='published', stage='done', doi=?, published_at=? WHERE id=?").bind(pub.doi, nowIso(), row.id).run();
  return { ok: true, stage: "publish->published", doi: pub.doi, slug };
}
__name(publishStage, "publishStage");
async function run(env) {
  await logEvent(env, "heartbeat", "run");
  try {
    let row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='review' AND stage='publish' LIMIT 1").first();
    if (row) {
      const r2 = await publishStage(env, row);
      await logEvent(env, "done", JSON.stringify(r2).slice(0, 500), r2.ok ? "ok" : "error");
      return { status: r2.ok ? "ok" : "error", res: r2 };
    }
    row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='researching' AND stage='draft' LIMIT 1").first();
    if (row) {
      const r2 = await genPaper(env, row);
      await logEvent(env, "done", JSON.stringify(r2).slice(0, 500), r2.ok ? "ok" : "error");
      return { status: r2.ok ? "ok" : "error", res: r2 };
    }
    row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='researching' AND stage='note' LIMIT 1").first();
    if (row) {
      const r2 = await genNote(env, row);
      await logEvent(env, "done", JSON.stringify(r2).slice(0, 500), r2.ok ? "ok" : "error");
      return { status: r2.ok ? "ok" : "error", res: r2 };
    }
    row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='queued' ORDER BY score DESC LIMIT 1").first();
    if (!row) {
      await logEvent(env, "idle", "no work");
      return { status: "ok", claimed: 0 };
    }
    const up = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='researching', stage='note', claimed_at=?, attempt=attempt+1 WHERE id=? AND status='queued'").bind(nowIso(), row.id).run();
    if (!up || !up.meta || !up.meta.changes) return { status: "ok", claimed: 0 };
    await logEvent(env, "claim", "claimed " + row.source_id);
    row.stage = "note";
    const r = await genNote(env, row);
    await logEvent(env, "done", JSON.stringify(r).slice(0, 500), r.ok ? "ok" : "error");
    return { status: r.ok ? "ok" : "error", res: r };
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 600);
    await logEvent(env, "error", msg, "error");
    return { status: "error", error: msg.slice(0, 300) };
  }
}
__name(run, "run");
var worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION });
    if (url.pathname === "/run" && request.method === "POST") {
      const out = await run(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out });
    }
    return json({ error: "not found" }, 404);
  }
};
export {
  worker_default as default
};

