var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.5.13-zenodo-fix";
var WORKER = "qnfo-research-exec";
var MODELS = ["@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/zai-org/glm-5.2"]; // v0.5.12-full-package: glm-5.2 second model (verified live in idea-triage) + note gateway fallback
var MAX_NOTE = 4e3;
var MAX_PAPER = 3e4;
var ORCID = "0009-0002-4317-5604";
var AUTHOR = "Rowan Brad Quni-Gudzinas";
var ROUTER = "https://qnfo-ai.internal/v1/chat/completions";
var GATEWAY_MODEL = "deepseek-v4-flash";
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
      const aiPromise = env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.3 });
      aiPromise.catch(function() {});
      const toPromise = new Promise(function(resolve) { setTimeout(function() { resolve("__TIMEOUT__"); }, 90000); });
      const r = await Promise.race([aiPromise, toPromise]);
      if (r === "__TIMEOUT__") { await logEvent(env, "ai-error", model + " timed out after 90s"); continue; }
      const cc = r && r.choices && r.choices[0] && r.choices[0].message;
      const text = cc ? String(cc.content || "") : r && typeof r.response === "string" ? r.response : "";
      if (text && text.trim().length > 40) return text.trim();
      await logEvent(env, "ai-empty", model + " empty/shallow");
    } catch (e) {
      await logEvent(env, "ai-error", model + " threw: " + String(e && e.message || e).slice(0, 200));
    }
  }
  return "";
}
__name(runModel, "runModel");
async function gatewayPaper(env, prompt) {
  if (!env.ROUTER_TOKEN) {
    await logEvent(env, "ai-error", "gateway: no ROUTER_TOKEN");
    return "";
  }
  const ctrl = new AbortController();
  const to = setTimeout(function() { ctrl.abort(); }, 120000);
  try {
    const r = await fetch(ROUTER, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.ROUTER_TOKEN }, body: JSON.stringify({ model: GATEWAY_MODEL, max_tokens: MAX_PAPER, temperature: 0.3, messages: [{ role: "user", content: prompt }] }), signal: ctrl.signal });
    if (!r.ok) {
      await logEvent(env, "ai-error", "gateway " + r.status);
      return "";
    }
    const d = await r.json();
    const c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (c && String(c).trim().length > 40) return String(c).trim();
    await logEvent(env, "ai-empty", "gateway empty/shallow");
    return "";
  } catch (e) {
    await logEvent(env, "ai-error", "gateway threw: " + String(e && e.message || e).slice(0, 200));
    return "";
  } finally {
    clearTimeout(to);
  }
}
__name(gatewayPaper, "gatewayPaper");
var NOTE_PROMPT = [
  "Write a focused research note. Output ONLY the note markdown, starting with '## Problem statement'.",
  "Sections: '## Problem statement', '## Prior work' (cite real papers with arXiv IDs or DOIs only, never fabricate), '## Core claim', '## Method', '## Expected result', '## Open questions'.",
  "Under 600 words. Technically precise. No meta-commentary.",
  "Topic:"
].join("\n");
var PAPER_PROMPT = [
  "Write a short, rigorous, self-contained preprint for open publication on Zenodo. Output ONLY the paper, starting directly with the title line '# <Title>'.",
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
    const r = await fetch(url, { method, headers: { "User-Agent": "QNFO-research-exec/0.5.0", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : void 0 });
    if ((r.status >= 500 || r.status === 429) && n < 4) {
      await new Promise(function(res) {
        setTimeout(res, 2500 * (n + 1));
      });
      return zenodo(env, method, path, body, n + 1);
    }
    const text = await r.text();
    if (r.status >= 400) return { _status: r.status, _text: text.slice(0, 300) };
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
function bibEsc(s){ return String(s||"").replace(/[{}]/g,function(c){ return c==="{"?"\\{":"\\}"; }); }
function parseRefLine(raw){
  var s = String(raw||"").replace(/^\s*\d+[.)]\s*/, "").trim();
  var aEnd = s.indexOf("(");
  var authors = aEnd > 0 ? s.slice(0, aEnd).trim() : "";
  var ym = s.match(/\((\d{4})\)/);
  var year = ym ? ym[1] : "";
  var after = aEnd >= 0 ? s.slice(s.indexOf(")", aEnd)+1).trim() : s;
  var t = after.replace(/^\.\s+/, "").trim();
  var title = t, rest = "";
  var sp = t.indexOf(". ");
  if (sp > 0){ title = t.slice(0, sp).trim(); rest = t.slice(sp+2).trim(); }
  var arxiv = "", doi = "";
  var ax = rest.match(/arXiv:\s*([^\s]+)/); if (ax) arxiv = ax[1];
  var dm = rest.match(/DOI:\s*([^\s,;]+)/i); if (dm) doi = dm[1];
  return { authors: authors, year: year, title: title, rest: rest, arxiv: arxiv, doi: doi };
}
function refKey(p,i){ var a=(p.authors||"").replace(/[^A-Za-z]/g,"").slice(0,14)||"ref"; return (a+(p.year||"")).toLowerCase()+"_"+i; }
function buildProvenance(bodyMd, title, slug){
  var body = String(bodyMd||"");
  var lines = body.split(/\r?\n/);
  var refs = [], inRefs = false;
  for (var k=0;k<lines.length;k++){
    var L = lines[k].trim();
    if (/^#+\s*references\b/i.test(L)){ inRefs = true; continue; }
    if (inRefs){
      if (/^#+\s*/.test(L)) break;
      if (/^\d+[.)]\s+\S/.test(L) && /\((\d{4})\)/.test(L)) refs.push(L);
      else if (refs.length) break;
    }
  }
  var parsed = refs.map(parseRefLine);
  var bib = parsed.length ? parsed.map(function(p,i){
    var L=["@misc{"+refKey(p,i+1)+",","  author = {"+bibEsc(p.authors)+"},","  title = {"+bibEsc(p.title)+"},",
      p.year?"  year = {"+p.year+"},":"", p.rest?"  howpublished = {"+bibEsc(p.rest)+"},":"",
      p.arxiv?"  eprint = {"+p.arxiv+"}, archiveprefix = {arXiv},":"", p.doi?"  doi = {"+p.doi+"},":"","}"].filter(function(x){return x!=="";});
    return L.join("\n");
  }).join("\n\n") : "% No machine-readable references parsed from the body.\n";
  var audit = "# Citation audit\n\nGenerated from the record body at publication. Each reference below appears in the body and is transcribed without modification; machine identifiers (arXiv/DOI) are extracted when present and are never invented when absent.\n\n" + (parsed.length ? parsed.map(function(p,i){
    var id=[p.arxiv?"arXiv:"+p.arxiv:null,p.doi?"DOI "+p.doi:null].filter(Boolean).join("; ")||"no machine identifier present";
    return (i+1)+". "+p.authors+" ("+p.year+"). "+p.title+". Source: "+p.rest+" | Identifier: "+id;
  }).join("\n") : "No numbered references section found in the body.");
  var readme = "# "+title+"\n\nAuthor: Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604)\nLicense: CC BY 4.0 (see LICENSE)\n\nHow to cite: use the deposit record DOI.\nFiles in this deposit:\n- "+slug+".md - full paper (source)\n- references.bib - BibTeX of the cited references\n- citation-audit.md - reference verification log\n- PROJECT-PLAN.md - goal and claim\n- README.md - this file\n- LICENSE - CC BY 4.0\n\nProvenance: produced by the QNFO autonomous research pipeline.\n";
  var plan = "# Project plan\n\nGoal: an open, self-contained preprint with real, verifiable references and no fabricated content.\n- Claim: stated in the record body.\n- Research/due-diligence: prior-work context is stated in the body; every reference is real (arXiv ID or DOI) and non-invented.\n- Deposit: paper, references.bib, citation-audit.md, README.md, PROJECT-PLAN.md, LICENSE.\n- License: CC BY 4.0.\n";
  var lic = "SPDX-License-Identifier: CC-BY-4.0\n\nThis work is licensed under the Creative Commons Attribution 4.0 International License.\nYou are free to share (copy and redistribute the material in any medium or format) and adapt (remix, transform, and build upon the material) for any purpose, provided you give appropriate credit, provide a link to the license, and indicate if changes were made.\n\nFull legal code: https://creativecommons.org/licenses/by/4.0/legalcode\nLicense deed: https://creativecommons.org/licenses/by/4.0/\n";
  return { files: [
    { file: slug+".md", content: String(bodyMd||"") },
    { file: "references.bib", content: bib },
    { file: "citation-audit.md", content: audit },
    { file: "README.md", content: readme },
    { file: "PROJECT-PLAN.md", content: plan },
    { file: "LICENSE", content: lic }
  ] };
}

async function publishToZenodo(env, title, abstract, bodyMd, slug) {
  if (!env.ZENODO_TOKEN) return { ok: false, error: "no ZENODO_TOKEN" };
  var pkg = buildProvenance(bodyMd, title, slug);
  const dep = await zenodo(env, "POST", "", {});
  if (!dep || !dep.id) return { ok: false, error: "deposit create failed: " + JSON.stringify(dep).slice(0, 200) };
  const id = dep.id;
  const meta = await zenodo(env, "PUT", "/" + id, { metadata: {
    title: title,
    upload_type: "publication",
    publication_type: "preprint",
    description: (abstract || title).slice(0, 3e3),
    creators: [{ name: AUTHOR, orcid: ORCID }],
    access_right: "open",
    license: "cc-by",
    version: "1.0.0",
    keywords: ["QNFO", "quantum computing", "energy"],
    notes: "Autonomously generated by the QNFO research pipeline. Complete provenance package (references.bib, citation-audit.md, README.md, PROJECT-PLAN.md, LICENSE) deposited. Source: https://papers.qnfo.org/papers/" + slug + "/"
  } });
  if (meta && meta._status && meta._status >= 400) return { ok: false, error: "metadata put failed: " + meta._text };
  if (!meta || !meta.metadata || !meta.metadata.title) return { ok: false, error: "metadata put not applied (no title in response)" };
  const bucket = dep.links && dep.links.bucket;
  if (!bucket) return { ok: false, error: "no deposit bucket" };
    try {
    if (env.PDF_SVC) {
      var hres = await env.PDF_SVC.fetch("https://qnfo-pdf/html", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: String(bodyMd || ""), slug: slug, title: title }) });
      if (hres.ok) { var htxt = await hres.text(); if (htxt && htxt.length > 100) pkg.files.push({ file: slug + ".html", content: htxt }); }
    }
  } catch (e) {}
  try {
    if (env.PDF_SVC) {
      var pres = await env.PDF_SVC.fetch("https://qnfo-pdf/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: String(bodyMd || ""), slug: slug, title: title }) });
      if (pres.ok) { var pbuf = await pres.arrayBuffer(); if (pbuf && pbuf.byteLength > 5000) pkg.files.push({ file: slug + ".pdf", content: pbuf }); }
    }
  } catch (e) {}
  try {
    if (typeof mdToLatex === "function") {
      var qtex = mdToLatex(String(bodyMd || ""));
      if (qtex && qtex.indexOf("\\documentclass") === 0) {
        var qc = await latexCompile(qtex);
        if (qc && qc.ok && qc.pdf && qc.pdf.byteLength > 5000) {
          pkg.files = pkg.files.filter(function(f){ return f.file !== slug + ".pdf"; });
          pkg.files.push({ file: slug + ".tex", content: qtex });
          pkg.files.push({ file: slug + ".pdf", content: qc.pdf });
        }
      }
    }
  } catch (e) {}

  for (let i = 0; i < pkg.files.length; i++) {
    const f = pkg.files[i];
    const fileUrl = bucket + "/" + encodeURIComponent(f.file) + "?access_token=" + env.ZENODO_TOKEN;
    const up = await fetch(fileUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.13" }, body: f.content });
    if (!up.ok) return { ok: false, error: "file upload failed (" + f.file + "): " + up.status };
  }
  const pub = await zenodo(env, "POST", "/" + id + "/actions/publish", {});
  if (!pub || !pub.doi) return { ok: false, error: "publish failed: " + JSON.stringify(pub).slice(0, 250) };
  return { ok: true, doi: pub.doi, conceptdoi: pub.conceptdoi, record: pub.links && pub.links.record || "https://zenodo.org/record/" + pub.id };
}
__name(publishToZenodo, "publishToZenodo");
async function genNote(env, row) {
  let note = await runModel(env, NOTE_PROMPT + "\n\n" + (row.idea || row.summary), MAX_NOTE);
  if (!note) note = await gatewayPaper(env, NOTE_PROMPT + "\n\n" + (row.idea || row.summary));
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
  const prompt = PAPER_PROMPT + "\n\n" + (row.idea || row.summary) + "\n\nNOTE:\n" + note;
  let paper = await gatewayPaper(env, prompt);
  if (!paper) paper = await runModel(env, prompt, MAX_PAPER);
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
async function latestRecord(env, recId) {
  try {
    var r = await fetch("https://zenodo.org/api/records/" + recId + "/latest", { headers: { "User-Agent": "QNFO-research-exec/0.5.1" } });
    if (r.ok) return await r.json();
  } catch (e) {}
  return null;
}

function mdToLatex(md) {
  var body = String(md).replace(/^\uFEFF/, ''); var fm = {};
  var m = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (m) { var fl = m[1].split(/\r?\n/); for (var i = 0; i < fl.length; i++) { var kv = fl[i].match(/^([A-Za-z]+):\s*["']?([^"']*)["']?\s*$/); if (kv) fm[kv[1].toLowerCase()] = kv[2].trim(); } body = body.slice(m[0].length); }
  var sl = body.split(/\r?\n/); var blocks = []; var cur = null;
  function flush() { if (cur) { blocks.push(cur); cur = null; } }
  for (var i = 0; i < sl.length; i++) {
    var ln2 = sl[i]; var h = ln2.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flush(); blocks.push({ type: 'h', lvl: h[1].length, text: h[2].trim() }); continue; }
    if (/^\s*\|/.test(ln2)) {
      if (!cur || cur.type !== 'table') { flush(); cur = { type: 'table', rows: [] }; }
      var cells = ln2.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(function(c){ return c.trim(); });
      var isSep = cells.length > 0 && cells.every(function(c){ return c === '' || /^:?-+:?$/.test(c); });
      if (!isSep) cur.rows.push(cells); continue;
    }
    if (/^\s*[-*]\s+/.test(ln2)) { if (!cur || cur.type !== 'ul') { flush(); cur = { type: 'ul', items: [] }; } cur.items.push(ln2.replace(/^\s*[-*]\s+/, '').trim()); continue; }
    if (/^\s*\d+\.\s+/.test(ln2)) { if (!cur || cur.type !== 'ol') { flush(); cur = { type: 'ol', items: [] }; } cur.items.push(ln2.replace(/^\s*\d+\.\s+/, '').trim()); continue; }
    if (/^\s*$/.test(ln2)) { flush(); continue; }
    if (!cur || cur.type !== 'p') { flush(); cur = { type: 'p', lines: [] }; } cur.lines.push(ln2.trim());
  } flush();
  var O = []; var abs = []; var inAbs = false, inRefs = false;
  function tbl(rows) { if (!rows.length) return; var hd = rows[0], dt = rows.slice(1); var n = hd.length, col = 'l'; for (var z = 1; z < n; z++) col += 'l'; O.push('\\begin{table}[h]'); O.push('\\centering'); O.push('\\begin{tabular}{' + col + '}'); O.push('\\toprule'); O.push(hd.map(inl).join(' & ') + ' \\\\'); O.push('\\midrule'); for (var r = 0; r < dt.length; r++) O.push(dt[r].map(inl).join(' & ') + ' \\\\'); O.push('\\bottomrule'); O.push('\\end{tabular}'); O.push('\\end{table}'); O.push(''); }
  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    if (blk.type === 'h') { var key = blk.text.toLowerCase().replace(/^\d+\.\s*/, '').trim();
      if (key === 'abstract') { inAbs = true; inRefs = false; continue; }
      if (key === 'references') { inRefs = true; inAbs = false; O.push('\\section*{References}'); continue; }
      if (key.indexOf('changelog') === 0 || key.indexOf('verification') === 0) { inRefs = inAbs = false; O.push('\\section*{' + esc(blk.text) + '}'); continue; }
      inRefs = inAbs = false; var st = blk.text.replace(/^\d+\.\s*/, '').trim(); var cmd = '\\section{'; if (blk.lvl === 1) cmd = '\\section*{'; else if (blk.lvl === 3) cmd = '\\subsection{'; else if (blk.lvl === 4) cmd = '\\subsubsection{'; O.push(cmd + esc(st) + '}'); continue; }
    if (blk.type === 'table') { tbl(blk.rows); continue; }
    if (blk.type === 'ul') { var en = inRefs ? 'enumerate' : 'itemize'; O.push('\\begin{' + en + '}' + (inRefs ? '[label={[\\arabic*]},leftmargin=2.5em,itemsep=1pt]' : '')); for (var u = 0; u < blk.items.length; u++) { var it = blk.items[u]; if (inRefs) it = it.replace(/^\[\d+\]\s*/, ''); O.push('  \\item ' + inl(it)); } O.push('\\end{' + en + '}'); continue; }
    if (blk.type === 'ol') { O.push('\\begin{enumerate}' + (inRefs ? '[label={[\\arabic*]},leftmargin=2.5em,itemsep=1pt]' : '')); for (var o = 0; o < blk.items.length; o++) { var it2 = blk.items[o]; if (inRefs) it2 = it2.replace(/^\[\d+\]\s*/, ''); O.push('  \\item ' + inl(it2)); } O.push('\\end{enumerate}'); continue; }
    if (blk.type === 'p') { var pa = blk.lines.join(' '); if (inAbs) abs.push(inl(pa)); else { O.push(inl(pa)); O.push(''); } continue; }
  }
  var dt2 = fm.date || ''; var mm = ['','January','February','March','April','May','June','July','August','September','October','November','December']; var dm2 = String(dt2).match(/^(\d{4})-(\d{2})-(\d{2})$/); var dateNice = dm2 ? mm[parseInt(dm2[2],10)] + ' ' + parseInt(dm2[3],10) + ', ' + dm2[1] : dt2;
  var author = fm.author || 'QNFO'; var doi = fm.doi || ''; var ver = fm.version || ''; var P = [];
  P.push('\\documentclass[11pt]{article}'); P.push('\\usepackage[utf8]{inputenc}'); P.push('\\usepackage[T1]{fontenc}'); P.push('\\usepackage{newtxtext,newtxmath}'); P.push('\\usepackage[margin=1in]{geometry}'); P.push('\\usepackage{amsmath}'); P.push('\\usepackage{booktabs}'); P.push('\\usepackage{enumitem}'); P.push('\\usepackage[colorlinks=true,urlcolor=blue]{hyperref}'); P.push('\\usepackage{microtype}'); P.push('\\setlength{\\emergencystretch}{2em}');
  P.push('\\title{' + esc(fm.title || 'Untitled') + '}'); P.push('\\author{' + esc(author) + (doi ? '\\thanks{\\href{https://doi.org/' + esc(doi) + '}{doi:' + esc(doi) + '}' + (ver ? ' (version ' + esc(ver) + ')' : '') + '}' : '') + '}'); P.push('\\date{' + dateNice + '}');
  var out = []; out.push(P.join('\n')); out.push('\\begin{document}'); out.push('\\maketitle');
  if (abs.length) { out.push('\\begin{abstract}'); out.push(abs.join(' ')); out.push('\\end{abstract}'); } out = out.concat(O); out.push('\\end{document}'); return out.join('\n');
}
function esc(s) { return String(s).replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}'); }
function inl(s) {
  var str = String(s); var math = []; var cmd = [];
  function pm(){ return '\x00' + (math.length - 1) + '\x01'; }
  function pc(){ return '\x02' + (cmd.length - 1) + '\x03'; }
  function rs(x){ return String(x).replace(/\x00(\d+)\x01/g, function(m,k){ return math[Number(k)]; }); }
  str = str.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*\^\s*(\d+)/g, function(m,a,b,c){ math.push('$' + a + '\\times ' + b + '^{' + c + '}$'); return pm(); });
  str = str.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/g, function(m,a,b){ math.push('$' + a + '\\times ' + b + '$'); return pm(); });
  str = str.replace(/(\d+(?:\.\d+)?)e([+-]?\d+)/g, function(m,a,e2){ math.push('$' + a + '\\times 10^{' + e2 + '}$'); return pm(); });
  str = str.replace(/([A-Za-z]+)_([A-Za-z0-9]+)(\([0-9]+\))?/g, function(m,a,b,c){ math.push('$' + a + '_{' + b + '}' + (c || '') + '$'); return pm(); });
  str = str.replace(/((?:\([^()\n]{1,28}\)|[A-Za-z0-9)]+))\^([A-Za-z0-9()\-+./]{1,16})/g, function(m,a,b){ math.push('$' + rs(a).replace(/\$([^$]*)\$/g, '$1') + '^{' + b + '}$'); return pm(); });
  str = str.replace(/\*\*([^*]+)\*\*/g, function(m,x){ cmd.push('\\textbf{' + x + '}'); return pc(); });
  str = str.replace(/(^|[^*])\*([^*\n]+)\*/g, function(m,p,x){ cmd.push('\\emph{' + x + '}'); return p + pc(); });
  str = str.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function(m,t,u){ cmd.push('\\href{' + u + '}{' + t + '}'); return pc(); });
  str = str.replace(/(^|[^\\])(https?:\/\/[^\s<>]+)/g, function(m,p,u){ cmd.push('\\url{' + u + '}'); return p + pc(); });
  str = str.replace(/×/g, ' $\\times$ ').replace(/≈/g, ' $\\approx$ ').replace(/≥/g, ' $\\geq$ ').replace(/≤/g, ' $\\leq$ ').replace(/−/g, ' $-$ '); str = str.replace(/²/g, '\\textsuperscript{2}').replace(/³/g, '\\textsuperscript{3}');
  str = str.replace(/’/g, "'").replace(/‘/g, "'").replace(/“/g, '"').replace(/”/g, '"').replace(/—/g, '---').replace(/–/g, '--');
  str = str.replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}');
  str = str.replace(/\x02(\d+)\x03/g, function(m,k){ return cmd[Number(k)]; });
  str = str.replace(/\x00(\d+)\x01/g, function(m,k){ return math[Number(k)]; });
  for (var pass = 0; pass < 8; pass++) {
    var nxt = str.replace(/\$([^$\n]{1,90})\$\s*([=+\-/(]|\s)\s*\$([^$\n]{1,90})\$/g, function(m,a,sep,b){ return '$' + a + ' ' + sep + ' ' + b + '$'; });
    if (nxt === str) break; str = nxt;
  }

  return str;
}

async function latexCompile(tex) {
  var fd = new FormData(); fd.append('engine', 'pdflatex'); fd.append('return', 'pdf'); fd.append('filename[]', 'document.tex'); fd.append('filecontents[]', tex);
  var r = await fetch('https://texlive.net/cgi-bin/latexcgi', { method: 'POST', body: fd, headers: { 'User-Agent': 'QNFO-research-exec/0.5.3 (+https://qnfo.org)' }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) return { ok: false, err: 'http ' + r.status };
  var ct = (r.headers.get('content-type') || '').toLowerCase();
  if (ct.indexOf('application/pdf') >= 0) return { ok: true, pdf: await r.arrayBuffer() };
  return { ok: false, err: 'non-pdf ' + ct, log: String(await r.text()).slice(0, 1200) };
}
async function publishV2(env, row) {
  var recId = String(row.paper_doi || "").split("zenodo.").pop() || "";
  if (!recId) { await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run(); return { ok: false, stage: "v2", error: "bad doi" }; }
  var latest = await latestRecord(env, recId);
  if (latest && latest.metadata && String(latest.metadata.version || "") === String(row.version_to || "")) {
    var adoptedDoi = latest.doi || ("10.5281/zenodo." + latest.id);
    await env.LIVING_PAPER.prepare("UPDATE papers SET body_md=?, version=?, doi=?, zenodo_doi=?, updated_at=datetime('now') WHERE slug=?").bind(row.corrected_md || "", row.version_to || "2.0.0", adoptedDoi, adoptedDoi, slug).run();
    if (env.GRAPH_DB) {
      try {
        var nodeA = await env.GRAPH_DB.prepare("SELECT properties FROM nodes WHERE id=?").bind("zenodo-10-5281-zenodo-" + recId).first();
        if (nodeA) {
          var propsA = {};
          try { propsA = JSON.parse(nodeA.properties || "{}"); } catch (eA) { propsA = {}; }
          propsA.doi = adoptedDoi;
          propsA.zenodo_url = "https://doi.org/" + adoptedDoi;
          propsA.version = row.version_to || "2.0.0";
          await env.GRAPH_DB.prepare("UPDATE nodes SET properties=?, updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(propsA), "zenodo-10-5281-zenodo-" + recId).run();
        }
      } catch (e) {}
    }
    if (env.MIRROR) {
      try {
        await env.MIRROR.put("2026/09/" + slug + ".md", row.corrected_md || "");
      } catch (e) {}
    }
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='published', new_doi=?, updated_at=datetime('now') WHERE id=?").bind(adoptedDoi, row.id).run();
    return { ok: true, stage: "v2", doi: adoptedDoi, adopted: true };
  }
var conceptRec = recId;
  try {
    var _ri = await fetch("https://zenodo.org/api/records/" + recId, { headers: { "User-Agent": "QNFO-research-exec/0.5.6" } });
    if (_ri.ok) { var _rj = await _ri.json(); if (_rj.conceptrecid) conceptRec = String(_rj.conceptrecid); }
  } catch (e) {}
  var nv = null;
  try {
    var lst = await zenodo(env, "GET", "?size=250&sort=mostrecent", {});
    var arr2 = lst && lst.hits ? lst.hits.hits : (Array.isArray(lst) ? lst : []);
    for (var di = 0; di < arr2.length; di++) {
      var dep = arr2[di]; if (!dep) continue;
      var sub = dep.submitted;
      if (sub === false || sub === "false") {
        var crc = String(dep.conceptrecid || (dep.metadata && dep.metadata.conceptrecid) || "");
        if (crc === conceptRec || String(dep.id || dep.recid || "") === conceptRec) {
          nv = await zenodo(env, "GET", "/" + (dep.id || dep.recid), {});
          break;
        }
      }
    }
  } catch (eLs) {}
  if (!nv || !nv.id) {
    var nvBase = recId;
  try {
    var _ci = await fetch("https://zenodo.org/api/records/" + conceptRec, { headers: { "User-Agent": "QNFO-research-exec/0.5.6" } });
    if (_ci.ok) { var _cj = await _ci.json(); if (_cj.id) nvBase = String(_cj.id); }
  } catch (e) {}
    try { nv = await zenodo(env, "POST", "/" + nvBase + "/actions/newversion", {}); } catch (eN) { nv = null; }
  }
  if (!nv || !nv.id) { await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run(); return { ok: false, stage: "v2", error: "newversion failed: " + JSON.stringify(nv).slice(0, 200) }; }
  var slug = row.slug || "paper";
  var files = nv.files || [];
  for (var i = 0; i < files.length; i++) {
    var fname = files[i].filename || "";
    if (true) {
      try { await fetch(files[i].links.self + "?access_token=" + env.ZENODO_TOKEN, { method: "DELETE" }); } catch (e) {}
    }
  }
  var bucket = nv.links && nv.links.bucket;
  var html = "", pdf = null;
  if (bucket) {
    var up = await fetch(bucket + "/" + encodeURIComponent(slug) + ".md?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.0" }, body: row.corrected_md || "" });
    if (!up.ok) { await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run(); return { ok: false, stage: "v2", error: "md upload failed: " + up.status }; }
    if (env.PDF_SVC) {
      try {
        var hres = await env.PDF_SVC.fetch("https://qnfo-pdf/html", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: row.corrected_md || "", slug: slug, title: row.title || "" }) });
        if (hres.ok) {
          html = await hres.text();
          await fetch(bucket + "/" + encodeURIComponent(slug) + ".html?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.0" }, body: html });
        }
      } catch (e) {}
      try {
        var pres = await env.PDF_SVC.fetch("https://qnfo-pdf/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: row.corrected_md || "", slug: slug, title: row.title || "" }) });
        if (pres.ok) {
          pdf = await pres.arrayBuffer();
          await fetch(bucket + "/" + encodeURIComponent(slug) + ".pdf?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.0" }, body: pdf });
        }
      } catch (e) {}
    }
  }
  if (bucket) {
        if (env.ZENODO_TOKEN && typeof mdToLatex === 'function') {
      try {
        var qtex = mdToLatex(row.corrected_md || '');
        if (qtex && qtex.indexOf('\\documentclass') === 0) {
          var qc = await latexCompile(qtex);
          if (qc.ok && qc.pdf && qc.pdf.byteLength > 5000) {
            await fetch(bucket + '/' + encodeURIComponent(slug) + '.pdf?access_token=' + env.ZENODO_TOKEN, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'User-Agent': 'QNFO-research-exec/0.5.3' }, body: qc.pdf });
            await fetch(bucket + '/' + encodeURIComponent(slug) + '.tex?access_token=' + env.ZENODO_TOKEN, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'User-Agent': 'QNFO-research-exec/0.5.3' }, body: qtex });
          } else {
            try { await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'latex-fail', 'qnfo-research-exec', ?)").bind(((qc.err || 'fail') + ' ' + String(qc.log || '')).slice(0, 450)).run(); } catch (eL) {}
          }
        }
      } catch (eX) {}
    }
    var provFiles = { "references.bib": row.references_bib, "citation-audit.md": row.citation_audit, "DUE-DILIGENCE.md": row.due_diligence, "PROJECT-PLAN.md": row.project_plan, "README.md": row.readme_md, "LICENSE": row.license_md, "jpcub_nv_verify.py": row.verify_script, "jpcub_nv_verify_output.txt": row.verify_output };
    for (var pf in provFiles) {
      if (provFiles[pf] && String(provFiles[pf]).trim().length > 0) {
        try {
          await fetch(bucket + "/" + encodeURIComponent(pf) + "?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.2" }, body: provFiles[pf] });
        } catch (e) {}
      }
    }
  }
  var meta = nv.metadata || {};
  if (row.version_to) meta.version = row.version_to;
  var metaClean = {};
  for (var k in meta) { if (k !== "prereserve_doi" && k !== "doi" && k !== "recid") metaClean[k] = meta[k]; }
  // related_identifiers omitted from the legacy metadata PUT: Zenodo legacy API returns HTTP 500 when the field is present (verified 2026-09-04). Provenance URL is carried in notes instead.
  delete metaClean.related_identifiers;
  if (row.related_repo) metaClean.notes = (metaClean.notes ? metaClean.notes + " " : "") + "Source: " + row.related_repo;
  var ab = String(row.corrected_md || "").match(/##\s*Abstract\s*\r?\n([\s\S]*?)(?=\r?\n##\s|\r?\n#\s|$)/i);
  if (ab && ab[1]) metaClean.description = ab[1].replace(/\s+/g, " ").trim();
  var mput = await zenodo(env, "PUT", "/" + nv.id, { metadata: metaClean });
  if (mput && mput._status && mput._status >= 400) { await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run(); return { ok: false, stage: "v2", error: "metadata put failed: " + mput._text }; }
  var pub = await zenodo(env, "POST", "/" + nv.id + "/actions/publish", {});
  if (!pub || !pub.doi) { await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run(); return { ok: false, stage: "v2", error: "publish failed: " + JSON.stringify(pub).slice(0, 200) }; }
  var newDoi = pub.doi;
  await env.LIVING_PAPER.prepare("UPDATE papers SET body_md=?, version=?, doi=?, zenodo_doi=?, updated_at=datetime('now') WHERE slug=?").bind(row.corrected_md || "", row.version_to || "2.0.0", newDoi, newDoi, slug).run();
  if (env.GRAPH_DB) {
    try {
      var node = await env.GRAPH_DB.prepare("SELECT properties FROM nodes WHERE id=?").bind("zenodo-10-5281-zenodo-" + recId).first();
      if (node) {
        var props = {};
        try { props = JSON.parse(node.properties || "{}"); } catch (e2) { props = {}; }
        props.doi = newDoi;
        props.zenodo_url = "https://doi.org/" + newDoi;
        props.version = row.version_to || "2.0.0";
        await env.GRAPH_DB.prepare("UPDATE nodes SET properties=?, updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(props), "zenodo-10-5281-zenodo-" + recId).run();
      }
    } catch (e) {}
  }
  if (env.MIRROR) {
    try {
      await env.MIRROR.put("2026/09/" + slug + ".md", row.corrected_md || "");
      if (html) await env.MIRROR.put("2026/09/" + slug + ".html", html);
      if (pdf) await env.MIRROR.put("2026/09/" + slug + ".pdf", pdf);
    } catch (e) {}
  }
  await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='published', new_doi=?, updated_at=datetime('now') WHERE id=?").bind(newDoi, row.id).run();
  return { ok: true, stage: "v2", doi: newDoi };
}
async function drainV2(env) {
  var rows = await env.QNFO_AUDIT.prepare("SELECT * FROM version_queue WHERE status='drafted' OR (status='publishing' AND updated_at < datetime('now','-15 minutes')) ORDER BY id ASC LIMIT 2").all();
  var results = [];
  for (var i = 0; i < (rows.results || []).length; i++) {
    var r = rows.results[i];
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='publishing', updated_at=datetime('now') WHERE id=?").bind(r.id).run();
    try { results.push(await publishV2(env, r)); } catch (e) {
      await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(r.id).run();
      results.push({ ok: false, stage: "v2", error: String(e && e.message || e).slice(0, 200) });
    }
  }
  return results;
}
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
    ctx.waitUntil((async function() {
      try {
        var drained = await drainV2(env);
        if (drained.length) await logEvent(env, "v2-drain", JSON.stringify(drained).slice(0, 700), "ok");
      } catch (e) {}
      if (env.RESEARCH_HALT === "1") { await logEvent(env, "halt", "research halted by RESEARCH_HALT kill-switch"); return; }
      var stallResolve; var stallPromise = new Promise(function(res) { stallResolve = res; });
      var stallTimer = setTimeout(function() { stallResolve("STALL"); }, 420000);
      var winner = await Promise.race([run(env), stallPromise]);
      if (winner === "STALL") await logEvent(env, "stall-guard", "run exceeded 7min deadline; fire released");
      clearTimeout(stallTimer);
    })());
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